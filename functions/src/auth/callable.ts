import { onCall } from "firebase-functions/v2/https";
import { auth, db, COLLECTIONS } from "../config/firebase";
import { requireAuth, requireRole } from "../middleware/auth";
import { withErrorHandling, Errors } from "../utils/errors";
import { parse, SetUserRoleSchema } from "../validation/schemas";
import { ok } from "../utils/response";
import { recordAuditLog } from "../audit";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Admin-only: assigns a role to a target user. This is the ONLY way roles
 * change after account creation - never accept a role field on a
 * client-writable document (see firestore.rules: users/profiles writes are
 * denied to clients entirely).
 */
export const setUserRole = onCall(async (request) => {
  return withErrorHandling("setUserRole", async () => {
    const ctx = requireAuth(request);
    requireRole(ctx, ["admin"]);

    const { targetUid, role } = parse(SetUserRoleSchema, request.data);

    const targetRef = db.collection(COLLECTIONS.users).doc(targetUid);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) {
      throw Errors.notFound("Target user does not exist.");
    }
    const previousRole = targetSnap.data()?.role;

    await auth.setCustomUserClaims(targetUid, { role });
    await targetRef.update({ role, updatedAt: FieldValue.serverTimestamp() });

    // If promoting to professional, ensure a professionals/{uid} directory
    // doc exists so they show up in the professional workflow immediately.
    if (role === "professional") {
      const profRef = db.collection(COLLECTIONS.professionals).doc(targetUid);
      const profSnap = await profRef.get();
      if (!profSnap.exists) {
        await profRef.set({
          uid: targetUid,
          displayName: targetSnap.data()?.email ?? "Professional",
          bio: null,
          specialties: [],
          verified: false,
          availability: {},
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    await recordAuditLog({
      actorId: ctx.uid,
      actorRole: ctx.role,
      action: "user.role_change",
      resourceType: "user",
      resourceId: targetUid,
      metadata: { previousRole, newRole: role },
    });

    return ok({ uid: targetUid, role });
  });
});
