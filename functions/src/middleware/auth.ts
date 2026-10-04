import { CallableRequest } from "firebase-functions/v2/https";
import { Errors } from "../utils/errors";
import { Role } from "../types/models";

export interface AuthedContext {
  uid: string;
  role: Role;
  email: string | null;
}

/**
 * Extracts and validates the caller's identity from a callable request's
 * verified auth token. Never trust any uid/role passed in `request.data` -
 * only `request.auth`, which Cloud Functions populates from a verified
 * Firebase ID token.
 */
export function requireAuth(request: CallableRequest): AuthedContext {
  if (!request.auth) {
    throw Errors.unauthenticated();
  }

  const role = request.auth.token.role as Role | undefined;
  if (!role) {
    // Should not normally happen - the onUserCreate trigger always sets a
    // default role claim. Treat as a hard failure rather than guessing.
    throw Errors.permissionDenied("Your account is missing a role assignment.");
  }

  return {
    uid: request.auth.uid,
    role,
    email: (request.auth.token.email as string | undefined) ?? null,
  };
}

/**
 * Enforces that the authenticated caller has one of the allowed roles.
 */
export function requireRole(ctx: AuthedContext, allowed: Role[]): void {
  if (!allowed.includes(ctx.role)) {
    throw Errors.permissionDenied(
      `This action requires one of the following roles: ${allowed.join(", ")}.`
    );
  }
}

/**
 * Enforces that the authenticated caller either owns the resource
 * (matches resourceOwnerId) or holds one of the given override roles
 * (e.g. admin).
 */
export function requireOwnerOrRole(
  ctx: AuthedContext,
  resourceOwnerId: string,
  overrideRoles: Role[] = ["admin"]
): void {
  if (ctx.uid === resourceOwnerId) return;
  if (overrideRoles.includes(ctx.role)) return;
  throw Errors.permissionDenied("You do not have access to this resource.");
}

/**
 * Basic in-memory-free rate limiting using a Firestore counter document.
 * Suitable for per-user, per-window limits (chat messages, consultation
 * submissions) without needing an external service like Redis.
 */
import { db } from "../config/firebase";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export async function enforceRateLimit(params: {
  uid: string;
  bucket: string; // e.g. "chat_send", "consultation_submit"
  windowSeconds: number;
  maxRequests: number;
}): Promise<void> {
  const { uid, bucket, windowSeconds, maxRequests } = params;
  const ref = db.collection("_rateLimits").doc(`${bucket}_${uid}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Timestamp.now();
    const windowStartMs = now.toMillis() - windowSeconds * 1000;

    if (!snap.exists) {
      tx.set(ref, { count: 1, windowStart: now, updatedAt: now });
      return;
    }

    const data = snap.data() as { count: number; windowStart: Timestamp };
    if (data.windowStart.toMillis() < windowStartMs) {
      // Window expired - reset.
      tx.set(ref, { count: 1, windowStart: now, updatedAt: now });
      return;
    }

    if (data.count >= maxRequests) {
      throw Errors.resourceExhausted(
        "You're doing that too often. Please wait a moment and try again."
      );
    }

    tx.update(ref, { count: FieldValue.increment(1), updatedAt: now });
  });
}
