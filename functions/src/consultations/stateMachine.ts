import { ConsultationStatus, Role } from "../types/models";
import { Errors } from "../utils/errors";

/**
 * Maps each status to the statuses it may legally transition to, and which
 * roles are allowed to perform that specific transition. This is the only
 * place transition legality is decided - every callable in this module
 * consults it, and clients can never write `status` directly (see
 * firestore.rules: consultationRequests/consultations updates are denied to
 * clients entirely).
 */
const TRANSITIONS: Record<
  ConsultationStatus,
  Partial<Record<ConsultationStatus, Role[]>>
> = {
  SUBMITTED: {
    PENDING_REVIEW: ["professional", "admin"],
  },
  PENDING_REVIEW: {
    MORE_INFORMATION: ["professional", "admin"],
    APPROVED: ["professional", "admin"],
    DECLINED: ["professional", "admin"],
  },
  MORE_INFORMATION: {
    PENDING_REVIEW: ["student", "admin"], // student supplies the requested info
  },
  APPROVED: {
    SCHEDULED: ["professional", "admin"],
  },
  SCHEDULED: {
    COMPLETED: ["professional", "admin"],
  },
  COMPLETED: {
    FOLLOW_UP: ["professional", "admin"],
    CLOSED: ["professional", "admin"],
  },
  FOLLOW_UP: {
    CLOSED: ["professional", "admin"],
  },
  DECLINED: {},
  CLOSED: {},
};

export function assertValidTransition(
  from: ConsultationStatus,
  to: ConsultationStatus,
  actorRole: Role
): void {
  const allowedRoles = TRANSITIONS[from]?.[to];
  if (!allowedRoles) {
    throw Errors.failedPrecondition(
      `Cannot move a consultation from ${from} to ${to}.`
    );
  }
  if (!allowedRoles.includes(actorRole)) {
    throw Errors.permissionDenied(
      `Your role cannot perform the ${from} -> ${to} transition.`
    );
  }
}
