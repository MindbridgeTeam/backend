import { onCall } from "firebase-functions/v2/https";
import { db, COLLECTIONS } from "../config/firebase";
import { requireAuth, requireRole, enforceRateLimit } from "../middleware/auth";
import { requireAppCheck } from "../middleware/appCheck";
import { withErrorHandling, Errors } from "../utils/errors";
import { parse, SubmitReviewSchema, VerifyProfessionalSchema } from "../validation/schemas";
import { ok } from "../utils/response";
import { FieldValue, Query } from "firebase-admin/firestore";
import { recordAuditLog } from "../audit";

/** Public directory of verified professionals - any signed-in user may
 * browse it (see firestore.rules for the equivalent direct-read policy). */
export const listProfessionals = onCall(async (request) => {
  return withErrorHandling("listProfessionals", async () => {
    requireAuth(request);
    const specialty = request.data?.specialty ? String(request.data.specialty) : null;

    let query = db
      .collection(COLLECTIONS.professionals)
      .where("verified", "==", true) as Query;

    if (specialty) {
      query = query.where("specialties", "array-contains", specialty);
    }

    const snap = await query.limit(50).get();
    return ok(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
});

/**
 * Students may only review a professional they actually had a COMPLETED
 * consultation with - this is exactly the kind of validation that requires
 * server-side logic and can't safely be a direct Firestore write, which is
 * why professionalReviews denies client writes entirely in firestore.rules.
 */
export const submitProfessionalReview = onCall(async (request) => {
  return withErrorHandling("submitProfessionalReview", async () => {
    requireAppCheck(request);
    const ctx = requireAuth(request);
    requireRole(ctx, ["student"]);
    await enforceRateLimit({
      uid: ctx.uid,
      bucket: "review_submit",
      windowSeconds: 60 * 60,
      maxRequests: 10,
    });
    const { consultationId, rating, comment } = parse(SubmitReviewSchema, request.data);

    const consultationSnap = await db.collection(COLLECTIONS.consultations).doc(consultationId).get();
    if (!consultationSnap.exists) throw Errors.notFound("Consultation not found.");

    const consultation = consultationSnap.data()!;
    if (consultation.studentId !== ctx.uid) {
      throw Errors.permissionDenied("You can only review your own consultations.");
    }
    if (!["COMPLETED", "FOLLOW_UP", "CLOSED"].includes(consultation.status)) {
      throw Errors.failedPrecondition("You can only review a completed consultation.");
    }

    const existing = await db
      .collection(COLLECTIONS.professionalReviews)
      .where("consultationId", "==", consultationId)
      .limit(1)
      .get();
    if (!existing.empty) {
      throw Errors.failedPrecondition("You have already reviewed this consultation.");
    }

    const ref = await db.collection(COLLECTIONS.professionalReviews).add({
      professionalId: consultation.professionalId,
      studentId: ctx.uid,
      consultationId,
      rating,
      comment: comment ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });

    await recordAuditLog({
      actorId: ctx.uid,
      actorRole: ctx.role,
      action: "professional.review_submitted",
      resourceType: "professionalReview",
      resourceId: ref.id,
      metadata: { professionalId: consultation.professionalId, rating },
    });

    const snap = await ref.get();
    return ok({ id: ref.id, ...snap.data() });
  });
});

/**
 * Admin-only: marks a professional as verified (making them visible in
 * listProfessionals) and optionally sets their specialties. This is the
 * only supported way `verified` ever becomes true - it is never set by the
 * professional themselves (see firestore.rules: professionals/{uid} update
 * from the owner is limited to bio/specialties/availability, never
 * `verified`).
 */
export const verifyProfessional = onCall(async (request) => {
  return withErrorHandling("verifyProfessional", async () => {
    const ctx = requireAuth(request);
    requireRole(ctx, ["admin"]);
    const { professionalId, verified, specialties } = parse(
      VerifyProfessionalSchema,
      request.data
    );

    const ref = db.collection(COLLECTIONS.professionals).doc(professionalId);
    const snap = await ref.get();
    if (!snap.exists) throw Errors.notFound("Professional profile not found.");

    const updates: Record<string, unknown> = {
      verified,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (specialties !== undefined) updates.specialties = specialties;

    await ref.update(updates);

    await recordAuditLog({
      actorId: ctx.uid,
      actorRole: ctx.role,
      action: verified ? "professional.verify" : "professional.unverify",
      resourceType: "professional",
      resourceId: professionalId,
    });

    const updated = await ref.get();
    return ok({ id: professionalId, ...updated.data() });
  });
});

/** A professional's own view of reviews left for them. */
export const getMyReviews = onCall(async (request) => {
  return withErrorHandling("getMyReviews", async () => {
    const ctx = requireAuth(request);
    requireRole(ctx, ["professional", "admin"]);
    const professionalId =
      ctx.role === "admin" && request.data?.professionalId
        ? String(request.data.professionalId)
        : ctx.uid;

    const snap = await db
      .collection(COLLECTIONS.professionalReviews)
      .where("professionalId", "==", professionalId)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    return ok(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
});
