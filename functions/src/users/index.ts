import { onCall } from "firebase-functions/v2/https";
import { db, COLLECTIONS } from "../config/firebase";
import { requireAuth } from "../middleware/auth";
import { withErrorHandling, Errors } from "../utils/errors";
import { parse, UpdateProfileSchema } from "../validation/schemas";
import { ok } from "../utils/response";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Note: account *creation* itself (sign up) is handled client-side via the
 * Firebase Auth SDK (createUserWithEmailAndPassword / provider sign-in).
 * The onUserCreate blocking trigger (see auth/triggers.ts) provisions the
 * matching users/{uid} and profiles/{uid} Firestore documents and default
 * role claim atomically with account creation - there is no separate
 * "create account" callable, which avoids a window where an Auth user
 * exists without a Firestore profile.
 */

/** Returns the caller's own profile. Admin note: admins should use the
 * dedicated admin lookup path rather than this function, which is scoped to
 * "my profile" by design. */
export const getProfile = onCall(async (request) => {
  return withErrorHandling("getProfile", async () => {
    const ctx = requireAuth(request);

    const snap = await db.collection(COLLECTIONS.profiles).doc(ctx.uid).get();
    if (!snap.exists) {
      throw Errors.notFound("Profile not found.");
    }

    return ok(snap.data());
  });
});

/** Updates the caller's own profile. Only an explicit allow-list of fields
 * is writable; role/verification/ownership fields are never accepted here. */
export const updateProfile = onCall(async (request) => {
  return withErrorHandling("updateProfile", async () => {
    const ctx = requireAuth(request);
    const updates = parse(UpdateProfileSchema, request.data);

    if (Object.keys(updates).length === 0) {
      throw Errors.invalidArgument("No updatable fields were provided.");
    }

    const ref = db.collection(COLLECTIONS.profiles).doc(ctx.uid);
    const snap = await ref.get();
    if (!snap.exists) {
      throw Errors.notFound("Profile not found.");
    }

    await ref.update({ ...updates, updatedAt: FieldValue.serverTimestamp() });

    const updated = await ref.get();
    return ok(updated.data());
  });
});
