import { onCall } from "firebase-functions/v2/https";
import { db, COLLECTIONS } from "../config/firebase";
import { requireAuth, requireOwnerOrRole, enforceRateLimit } from "../middleware/auth";
import { withErrorHandling, Errors } from "../utils/errors";
import {
  parse,
  CreatePlanSchema,
  UpdateTaskSchema,
  CompleteTaskSchema,
} from "../validation/schemas";
import { ok } from "../utils/response";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export const createPlan = onCall(async (request) => {
  return withErrorHandling("createPlan", async () => {
    const ctx = requireAuth(request);
    const { title, description, tasks } = parse(CreatePlanSchema, request.data);

    await enforceRateLimit({
      uid: ctx.uid,
      bucket: "plan_create",
      windowSeconds: 60,
      maxRequests: 10,
    });

    const planRef = db.collection(COLLECTIONS.selfHelpPlans).doc();
    const now = FieldValue.serverTimestamp();

    const batch = db.batch();
    batch.set(planRef, {
      userId: ctx.uid,
      title,
      description: description ?? null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    for (const task of tasks ?? []) {
      const taskRef = planRef.collection(COLLECTIONS.selfHelpTasks).doc();
      batch.set(taskRef, {
        planId: planRef.id,
        title: task.title,
        notes: null,
        completed: false,
        dueDate: task.dueDate ? Timestamp.fromDate(new Date(task.dueDate)) : null,
        createdAt: now,
        updatedAt: now,
      });
    }

    await batch.commit();

    const planSnap = await planRef.get();
    const tasksSnap = await planRef.collection(COLLECTIONS.selfHelpTasks).get();

    return ok({
      id: planRef.id,
      ...planSnap.data(),
      tasks: tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    });
  });
});

export const getMyPlans = onCall(async (request) => {
  return withErrorHandling("getMyPlans", async () => {
    const ctx = requireAuth(request);

    const plansSnap = await db
      .collection(COLLECTIONS.selfHelpPlans)
      .where("userId", "==", ctx.uid)
      .orderBy("createdAt", "desc")
      .get();

    const plans = await Promise.all(
      plansSnap.docs.map(async (planDoc) => {
        const tasksSnap = await planDoc.ref.collection(COLLECTIONS.selfHelpTasks).get();
        return {
          id: planDoc.id,
          ...planDoc.data(),
          tasks: tasksSnap.docs.map((t) => ({ id: t.id, ...t.data() })),
        };
      })
    );

    return ok(plans);
  });
});

async function loadOwnedTask(ctx: { uid: string; role: string }, planId: string, taskId: string) {
  const planRef = db.collection(COLLECTIONS.selfHelpPlans).doc(planId);
  const planSnap = await planRef.get();
  if (!planSnap.exists) throw Errors.notFound("Plan not found.");

  requireOwnerOrRole(ctx as never, planSnap.data()!.userId, ["admin"]);

  const taskRef = planRef.collection(COLLECTIONS.selfHelpTasks).doc(taskId);
  const taskSnap = await taskRef.get();
  if (!taskSnap.exists) throw Errors.notFound("Task not found.");

  return { planRef, taskRef, taskSnap };
}

export const updateTask = onCall(async (request) => {
  return withErrorHandling("updateTask", async () => {
    const ctx = requireAuth(request);
    const { planId, taskId, title, notes, dueDate } = parse(UpdateTaskSchema, request.data);

    const { taskRef } = await loadOwnedTask(ctx, planId, taskId);

    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (title !== undefined) updates.title = title;
    if (notes !== undefined) updates.notes = notes;
    if (dueDate !== undefined) updates.dueDate = Timestamp.fromDate(new Date(dueDate));

    await taskRef.update(updates);
    const updated = await taskRef.get();
    return ok({ id: taskId, ...updated.data() });
  });
});

export const completeTask = onCall(async (request) => {
  return withErrorHandling("completeTask", async () => {
    const ctx = requireAuth(request);
    const { planId, taskId, completed } = parse(CompleteTaskSchema, request.data);

    const { taskRef } = await loadOwnedTask(ctx, planId, taskId);

    await taskRef.update({ completed, updatedAt: FieldValue.serverTimestamp() });
    const updated = await taskRef.get();
    return ok({ id: taskId, ...updated.data() });
  });
});
