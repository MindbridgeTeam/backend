import { onCall } from "firebase-functions/v2/https";
import { db, COLLECTIONS } from "../config/firebase";
import { requireAuth, requireOwnerOrRole, enforceRateLimit } from "../middleware/auth";
import { withErrorHandling, Errors } from "../utils/errors";
import { parse, CreateReflectionSchema, DeleteReflectionSchema } from "../validation/schemas";
import { ok } from "../utils/response";
import { FieldValue } from "firebase-admin/firestore";

export const createReflection = onCall(async (request) => {
  return withErrorHandling("createReflection", async () => {
    const ctx = requireAuth(request);
    const { content, mood } = parse(CreateReflectionSchema, request.data);

    await enforceRateLimit({
      uid: ctx.uid,
      bucket: "reflection_create",
      windowSeconds: 60,
      maxRequests: 10,
    });

    const ref = await db.collection(COLLECTIONS.reflections).add({
      userId: ctx.uid,
      content,
      mood: mood ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });

    const snap = await ref.get();
    return ok({ id: ref.id, ...snap.data() });
  });
});

export const getMyReflections = onCall(async (request) => {
  return withErrorHandling("getMyReflections", async () => {
    const ctx = requireAuth(request);
    const pageSize = Math.min(Number(request.data?.pageSize) || 30, 100);

    const snap = await db
      .collection(COLLECTIONS.reflections)
      .where("userId", "==", ctx.uid)
      .orderBy("createdAt", "desc")
      .limit(pageSize)
      .get();

    return ok(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
});

export const deleteReflection = onCall(async (request) => {
  return withErrorHandling("deleteReflection", async () => {
    const ctx = requireAuth(request);
    const { reflectionId } = parse(DeleteReflectionSchema, request.data);

    const ref = db.collection(COLLECTIONS.reflections).doc(reflectionId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw Errors.notFound("Reflection not found.");
    }

    requireOwnerOrRole(ctx, snap.data()!.userId, ["admin"]);

    await ref.delete();
    return ok({ id: reflectionId, deleted: true });
  });
});
