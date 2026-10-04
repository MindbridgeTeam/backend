import { onCall } from "firebase-functions/v2/https";
import { db, COLLECTIONS } from "../config/firebase";
import { requireAuth, requireRole } from "../middleware/auth";
import { withErrorHandling, Errors } from "../utils/errors";
import {
  parse,
  CreateSponsorSchema,
  CreateAllocationSchema,
  UpdateAllocationStatusSchema,
} from "../validation/schemas";
import { ok } from "../utils/response";
import { FieldValue, Query } from "firebase-admin/firestore";
import { recordAuditLog } from "../audit";

export const createSponsor = onCall(async (request) => {
  return withErrorHandling("createSponsor", async () => {
    const ctx = requireAuth(request);
    requireRole(ctx, ["admin"]);
    const { name, organization, contactEmail } = parse(CreateSponsorSchema, request.data);

    const ref = await db.collection(COLLECTIONS.sponsors).add({
      name,
      organization: organization ?? null,
      contactEmail: contactEmail ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });

    await recordAuditLog({
      actorId: ctx.uid,
      actorRole: ctx.role,
      action: "sponsor.create",
      resourceType: "sponsor",
      resourceId: ref.id,
    });

    const snap = await ref.get();
    return ok({ id: ref.id, ...snap.data() });
  });
});

export const createSponsorshipAllocation = onCall(async (request) => {
  return withErrorHandling("createSponsorshipAllocation", async () => {
    const ctx = requireAuth(request);
    requireRole(ctx, ["admin"]);
    const { sponsorId, studentId, amount, currency } = parse(CreateAllocationSchema, request.data);

    const sponsorSnap = await db.collection(COLLECTIONS.sponsors).doc(sponsorId).get();
    if (!sponsorSnap.exists) throw Errors.notFound("Sponsor not found.");

    const studentSnap = await db.collection(COLLECTIONS.users).doc(studentId).get();
    if (!studentSnap.exists) throw Errors.notFound("Student not found.");

    const ref = await db.collection(COLLECTIONS.sponsorshipAllocations).add({
      sponsorId,
      studentId,
      amount,
      currency,
      status: "active",
      allocatedAt: FieldValue.serverTimestamp(),
    });

    await recordAuditLog({
      actorId: ctx.uid,
      actorRole: ctx.role,
      action: "sponsor.allocation_create",
      resourceType: "sponsorshipAllocation",
      resourceId: ref.id,
      metadata: { sponsorId, amount, currency },
    });

    const snap = await ref.get();
    return ok({ id: ref.id, ...snap.data() });
  });
});

/** Admin-only: updates an allocation's lifecycle status (e.g. marking it
 * completed once the sponsorship period ends, or cancelled). */
export const updateAllocationStatus = onCall(async (request) => {
  return withErrorHandling("updateAllocationStatus", async () => {
    const ctx = requireAuth(request);
    requireRole(ctx, ["admin"]);
    const { allocationId, status } = parse(UpdateAllocationStatusSchema, request.data);

    const ref = db.collection(COLLECTIONS.sponsorshipAllocations).doc(allocationId);
    const snap = await ref.get();
    if (!snap.exists) throw Errors.notFound("Allocation not found.");

    await ref.update({ status });

    await recordAuditLog({
      actorId: ctx.uid,
      actorRole: ctx.role,
      action: "sponsor.allocation_status_update",
      resourceType: "sponsorshipAllocation",
      resourceId: allocationId,
      metadata: { status },
    });

    const updated = await ref.get();
    return ok({ id: allocationId, ...updated.data() });
  });
});

/**
 * NGO / sponsor-facing reporting endpoint. Deliberately returns only
 * aggregate counts and totals - never a list of students or any
 * individually-identifying allocation record. This is the only read path
 * NGOs have into sponsorship data (see firestore.rules: the raw
 * sponsorshipAllocations collection is admin-only).
 */
export const getSponsorshipReport = onCall(async (request) => {
  return withErrorHandling("getSponsorshipReport", async () => {
    const ctx = requireAuth(request);
    requireRole(ctx, ["ngo", "admin"]);

    const sponsorId = request.data?.sponsorId ? String(request.data.sponsorId) : null;

    let query = db.collection(COLLECTIONS.sponsorshipAllocations) as Query;
    if (sponsorId) query = query.where("sponsorId", "==", sponsorId);

    const snap = await query.get();

    let totalAmount = 0;
    let activeCount = 0;
    let completedCount = 0;
    const uniqueStudents = new Set<string>();
    const byCurrency: Record<string, number> = {};

    for (const doc of snap.docs) {
      const data = doc.data();
      totalAmount += data.amount as number;
      byCurrency[data.currency] = (byCurrency[data.currency] ?? 0) + (data.amount as number);
      uniqueStudents.add(data.studentId as string);
      if (data.status === "active") activeCount += 1;
      if (data.status === "completed") completedCount += 1;
    }

    return ok({
      totalAllocations: snap.size,
      totalAmountByCurrency: byCurrency,
      totalAmount,
      activeCount,
      completedCount,
      studentsReached: uniqueStudents.size, // count only - no identities exposed
    });
  });
});
