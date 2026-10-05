import { onCall } from "firebase-functions/v2/https";
import { db, COLLECTIONS } from "../config/firebase";
import { requireAuth, requireRole, enforceRateLimit } from "../middleware/auth";
import { requireAppCheck } from "../middleware/appCheck";
import { withErrorHandling, Errors } from "../utils/errors";
import {
  parse,
  SubmitConsultationSchema,
  OpenRequestSchema,
  ApproveRequestSchema,
  DeclineRequestSchema,
  RequestMoreInfoSchema,
  ProvideAdditionalInfoSchema,
  RecordOutcomeSchema,
} from "../validation/schemas";
import { ok } from "../utils/response";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { assertValidTransition } from "./stateMachine";
import { ConsultationStatus } from "../types/models";
import { recordAuditLog } from "../audit";
import { notifyUser } from "../notifications";
import { CONSULTATION_RATE_LIMIT_PER_DAY } from "../config/env";

export const submitConsultationRequest = onCall(async (request) => {
  return withErrorHandling("submitConsultationRequest", async () => {
    requireAppCheck(request);
    const ctx = requireAuth(request);
    requireRole(ctx, ["student"]);
    const { reason, urgency } = parse(SubmitConsultationSchema, request.data);

    await enforceRateLimit({
      uid: ctx.uid,
      bucket: "consultation_submit",
      windowSeconds: 24 * 60 * 60,
      maxRequests: CONSULTATION_RATE_LIMIT_PER_DAY.value(),
    });

    const now = FieldValue.serverTimestamp();
    const ref = await db.collection(COLLECTIONS.consultationRequests).add({
      studentId: ctx.uid,
      professionalId: null,
      status: "SUBMITTED" as ConsultationStatus,
      reason,
      urgency,
      statusHistory: [
        { from: null, to: "SUBMITTED", actorId: ctx.uid, actorRole: ctx.role, note: null, at: Timestamp.now() },
      ],
      createdAt: now,
      updatedAt: now,
    });

    await recordAuditLog({
      actorId: ctx.uid,
      actorRole: ctx.role,
      action: "consultation.submit",
      resourceType: "consultationRequest",
      resourceId: ref.id,
    });

    const snap = await ref.get();
    return ok({ id: ref.id, ...snap.data() });
  });
});

export const getRequestStatus = onCall(async (request) => {
  return withErrorHandling("getRequestStatus", async () => {
    const ctx = requireAuth(request);
    const requestId = String(request.data?.requestId ?? "");
    if (!requestId) throw Errors.invalidArgument("requestId is required.");

    const snap = await db.collection(COLLECTIONS.consultationRequests).doc(requestId).get();
    if (!snap.exists) throw Errors.notFound("Consultation request not found.");

    const data = snap.data()!;
    const isOwnerStudent = data.studentId === ctx.uid;
    const isAssignedProfessional = data.professionalId === ctx.uid;
    if (!isOwnerStudent && !isAssignedProfessional && ctx.role !== "admin") {
      throw Errors.permissionDenied("You do not have access to this request.");
    }

    return ok({ id: snap.id, ...data });
  });
});

/** Professional queue: unclaimed SUBMITTED requests, plus requests already
 * assigned to the calling professional. */
export const getProfessionalRequestQueue = onCall(async (request) => {
  return withErrorHandling("getProfessionalRequestQueue", async () => {
    const ctx = requireAuth(request);
    requireRole(ctx, ["professional", "admin"]);

    const [unclaimedSnap, assignedSnap] = await Promise.all([
      db
        .collection(COLLECTIONS.consultationRequests)
        .where("status", "==", "SUBMITTED")
        .orderBy("createdAt", "asc")
        .limit(50)
        .get(),
      ctx.role === "professional"
        ? db
            .collection(COLLECTIONS.consultationRequests)
            .where("professionalId", "==", ctx.uid)
            .orderBy("updatedAt", "desc")
            .limit(50)
            .get()
        : Promise.resolve(null),
    ]);

    const unclaimed = unclaimedSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const assigned = assignedSnap ? assignedSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];

    return ok({ unclaimed, assigned });
  });
});

async function transitionRequest(params: {
  requestId: string;
  to: ConsultationStatus;
  actorUid: string;
  actorRole: "student" | "professional" | "admin" | "ngo";
  note: string | null;
  extraUpdates?: Record<string, unknown>;
  claimIfUnassigned?: boolean;
}) {
  const {
    requestId,
    to,
    actorUid,
    actorRole,
    note,
    extraUpdates = {},
    claimIfUnassigned = false,
  } = params;

  const ref = db.collection(COLLECTIONS.consultationRequests).doc(requestId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw Errors.notFound("Consultation request not found.");

    const data = snap.data()!;
    const from = data.status as ConsultationStatus;

    // Access check: students may only act on their own request (and only
    // for the MORE_INFORMATION -> PENDING_REVIEW transition, enforced by
    // the state machine's role list); professionals may only act if the
    // request is either unassigned and they're claiming it, or already
    // assigned to them.
    if (actorRole === "professional") {
      const isOwnAssignment = data.professionalId === actorUid;
      const canClaimUnassigned = Boolean(claimIfUnassigned && !data.professionalId);
      if (!isOwnAssignment && !canClaimUnassigned) {
        throw Errors.permissionDenied("This request is not assigned to you.");
      }
    }
    if (actorRole === "student" && data.studentId !== actorUid) {
      throw Errors.permissionDenied("This is not your request.");
    }

    assertValidTransition(from, to, actorRole);

    const updates: Record<string, unknown> = {
      status: to,
      updatedAt: FieldValue.serverTimestamp(),
      statusHistory: FieldValue.arrayUnion({
        from,
        to,
        actorId: actorUid,
        actorRole,
        note,
        at: Timestamp.now(),
      }),
      ...extraUpdates,
    };

    if (claimIfUnassigned && !data.professionalId) {
      updates.professionalId = actorUid;
    }

    tx.update(ref, updates);
    return { from, to, studentId: data.studentId, professionalId: data.professionalId ?? actorUid };
  });
}

export const openRequest = onCall(async (request) => {
  return withErrorHandling("openRequest", async () => {
    const ctx = requireAuth(request);
    requireRole(ctx, ["professional", "admin"]);
    const { requestId } = parse(OpenRequestSchema, request.data);

    const result = await transitionRequest({
      requestId,
      to: "PENDING_REVIEW",
      actorUid: ctx.uid,
      actorRole: ctx.role,
      note: null,
      claimIfUnassigned: true,
    });

    await recordAuditLog({
      actorId: ctx.uid,
      actorRole: ctx.role,
      action: "consultation.open",
      resourceType: "consultationRequest",
      resourceId: requestId,
    });

    await notifyUser({
      userId: result.studentId,
      type: "consultation_status_change",
      title: "Your consultation request is under review",
      body: "A professional has opened your request.",
      data: { requestId },
    });

    return ok({ requestId, status: "PENDING_REVIEW" });
  });
});

export const approveRequest = onCall(async (request) => {
  return withErrorHandling("approveRequest", async () => {
    const ctx = requireAuth(request);
    requireRole(ctx, ["professional", "admin"]);
    const { requestId, scheduledAt, note } = parse(ApproveRequestSchema, request.data);

    const requestRef = db.collection(COLLECTIONS.consultationRequests).doc(requestId);
    const consultationRef = db.collection(COLLECTIONS.consultations).doc();

    // "Approve" in this workflow always implies scheduling (APPROVED ->
    // SCHEDULED, per the task breakdown's sequence), and creating the
    // Consultation record is part of the same operation. All three
    // changes - the two status-history transitions and the new
    // Consultation doc - happen in a single atomic transaction so a crash
    // partway through can never leave a request stuck at APPROVED with no
    // way to retry (retrying APPROVED -> APPROVED would otherwise fail the
    // state machine check).
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(requestRef);
      if (!snap.exists) throw Errors.notFound("Consultation request not found.");

      const data = snap.data()!;
      if (ctx.role === "professional" && data.professionalId !== ctx.uid) {
        throw Errors.permissionDenied("This request is not assigned to you.");
      }

      const from = data.status as ConsultationStatus;
      assertValidTransition(from, "APPROVED", ctx.role);
      assertValidTransition("APPROVED", "SCHEDULED", ctx.role);

      const now = Timestamp.now();
      const assignedProfessionalId = data.professionalId ?? ctx.uid;
      tx.update(requestRef, {
        professionalId: assignedProfessionalId,
        status: "SCHEDULED" as ConsultationStatus,
        updatedAt: FieldValue.serverTimestamp(),
        statusHistory: FieldValue.arrayUnion(
          { from, to: "APPROVED", actorId: ctx.uid, actorRole: ctx.role, note: note ?? null, at: now },
          { from: "APPROVED", to: "SCHEDULED", actorId: ctx.uid, actorRole: ctx.role, note: null, at: now }
        ),
      });

      tx.set(consultationRef, {
        requestId,
        studentId: data.studentId,
        professionalId: assignedProfessionalId,
        status: "SCHEDULED" as ConsultationStatus,
        scheduledAt: scheduledAt ? Timestamp.fromDate(new Date(scheduledAt)) : null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { studentId: data.studentId as string, professionalId: (data.professionalId ?? ctx.uid) as string };
    });

    await recordAuditLog({
      actorId: ctx.uid,
      actorRole: ctx.role,
      action: "consultation.approve",
      resourceType: "consultationRequest",
      resourceId: requestId,
      metadata: { consultationId: consultationRef.id },
    });

    await notifyUser({
      userId: result.studentId,
      type: "appointment_update",
      title: "Your consultation has been scheduled",
      body: scheduledAt
        ? `Scheduled for ${new Date(scheduledAt).toLocaleString()}.`
        : "Your consultation was approved. You'll be notified once it's scheduled.",
      data: { requestId, consultationId: consultationRef.id },
    });

    return ok({ requestId, consultationId: consultationRef.id, status: "SCHEDULED" });
  });
});

export const declineRequest = onCall(async (request) => {
  return withErrorHandling("declineRequest", async () => {
    const ctx = requireAuth(request);
    requireRole(ctx, ["professional", "admin"]);
    const { requestId, note } = parse(DeclineRequestSchema, request.data);

    const result = await transitionRequest({
      requestId,
      to: "DECLINED",
      actorUid: ctx.uid,
      actorRole: ctx.role,
      note,
    });

    await recordAuditLog({
      actorId: ctx.uid,
      actorRole: ctx.role,
      action: "consultation.decline",
      resourceType: "consultationRequest",
      resourceId: requestId,
    });

    await notifyUser({
      userId: result.studentId,
      type: "consultation_status_change",
      title: "Your consultation request was declined",
      body: note,
      data: { requestId },
    });

    return ok({ requestId, status: "DECLINED" });
  });
});

export const requestMoreInformation = onCall(async (request) => {
  return withErrorHandling("requestMoreInformation", async () => {
    const ctx = requireAuth(request);
    requireRole(ctx, ["professional", "admin"]);
    const { requestId, note } = parse(RequestMoreInfoSchema, request.data);

    const result = await transitionRequest({
      requestId,
      to: "MORE_INFORMATION",
      actorUid: ctx.uid,
      actorRole: ctx.role,
      note,
    });

    await recordAuditLog({
      actorId: ctx.uid,
      actorRole: ctx.role,
      action: "consultation.request_more_information",
      resourceType: "consultationRequest",
      resourceId: requestId,
    });

    await notifyUser({
      userId: result.studentId,
      type: "consultation_status_change",
      title: "More information needed",
      body: note,
      data: { requestId },
    });

    return ok({ requestId, status: "MORE_INFORMATION" });
  });
});

/** Student supplies the requested information, moving the request back into
 * the review queue. */
export const provideAdditionalInformation = onCall(async (request) => {
  return withErrorHandling("provideAdditionalInformation", async () => {
    const ctx = requireAuth(request);
    requireRole(ctx, ["student"]);
    const { requestId, additionalInfo } = parse(ProvideAdditionalInfoSchema, request.data);

    const result = await transitionRequest({
      requestId,
      to: "PENDING_REVIEW",
      actorUid: ctx.uid,
      actorRole: ctx.role,
      note: additionalInfo,
    });

    await recordAuditLog({
      actorId: ctx.uid,
      actorRole: ctx.role,
      action: "consultation.provide_information",
      resourceType: "consultationRequest",
      resourceId: requestId,
    });

    if (result.professionalId) {
      await notifyUser({
        userId: result.professionalId,
        type: "consultation_status_change",
        title: "Additional information provided",
        body: "A student has responded to your information request.",
        data: { requestId },
      });
    }

    return ok({ requestId, status: "PENDING_REVIEW" });
  });
});

/** Records the outcome of a completed consultation and advances its status
 * to FOLLOW_UP or CLOSED, only performable by the assigned professional
 * (or an admin). */
export const recordOutcome = onCall(async (request) => {
  return withErrorHandling("recordOutcome", async () => {
    const ctx = requireAuth(request);
    requireRole(ctx, ["professional", "admin"]);
    const { consultationId, summary, recommendations, followUpRequired } = parse(
      RecordOutcomeSchema,
      request.data
    );

    const consultationRef = db.collection(COLLECTIONS.consultations).doc(consultationId);

    const { studentId, professionalId } = await db.runTransaction(async (tx) => {
      const snap = await tx.get(consultationRef);
      if (!snap.exists) throw Errors.notFound("Consultation not found.");
      const data = snap.data()!;

      if (ctx.role === "professional" && data.professionalId !== ctx.uid) {
        throw Errors.permissionDenied("This consultation is not assigned to you.");
      }

      const from = data.status as ConsultationStatus;
      assertValidTransition(from, "COMPLETED", ctx.role);

      const nextStatus: ConsultationStatus = followUpRequired ? "FOLLOW_UP" : "CLOSED";
      // Validate the immediate follow-on transition too, so COMPLETED never
      // becomes a dead end that a later call can't legally advance from.
      assertValidTransition("COMPLETED", nextStatus, ctx.role);

      // A single write to this document: Firestore transactions do not
      // support multiple writes to the same document ref, so the
      // intermediate COMPLETED state is validated but never persisted on
      // its own - only the final status is written.
      tx.update(consultationRef, {
        status: nextStatus,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { studentId: data.studentId as string, professionalId: data.professionalId as string };
    });

    const outcomeRef = await db.collection(COLLECTIONS.consultationOutcomes).add({
      consultationId,
      studentId,
      professionalId,
      summary,
      recommendations: recommendations ?? null,
      followUpRequired,
      createdBy: ctx.uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    await recordAuditLog({
      actorId: ctx.uid,
      actorRole: ctx.role,
      action: "consultation.record_outcome",
      resourceType: "consultation",
      resourceId: consultationId,
      metadata: { outcomeId: outcomeRef.id, followUpRequired },
    });

    await notifyUser({
      userId: studentId,
      type: "consultation_status_change",
      title: "Your consultation is complete",
      body: followUpRequired
        ? "A follow-up has been scheduled based on your consultation."
        : "Thank you for attending your consultation.",
      data: { consultationId, outcomeId: outcomeRef.id },
    });

    return ok({ consultationId, outcomeId: outcomeRef.id, status: followUpRequired ? "FOLLOW_UP" : "CLOSED" });
  });
});
