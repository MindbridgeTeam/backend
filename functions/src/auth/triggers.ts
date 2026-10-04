import { beforeUserCreated, beforeUserSignedIn } from "firebase-functions/v2/identity";
import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import { auth, db, COLLECTIONS } from "../config/firebase";
import { FieldValue } from "firebase-admin/firestore";
import { DEFAULT_USER_ROLE } from "../config/env";
import { logger } from "../utils/logger";
import { HttpsError } from "firebase-functions/v2/https";

/**
 * Blocking function: runs before a new Firebase Auth user is created.
 * We use this (rather than a non-blocking onCreate trigger) so the role
 * claim and Firestore docs exist by the time the client's first ID token
 * is minted - no race condition where the frontend reads a token without
 * a role yet.
 */
export const onUserCreate = beforeUserCreated(async (event) => {
  const user = event.data;
  if (!user) {
    throw new HttpsError("internal", "No user data on create event.");
  }

  const role = DEFAULT_USER_ROLE.value();
  const now = FieldValue.serverTimestamp();

  const batch = db.batch();

  batch.set(db.collection(COLLECTIONS.users).doc(user.uid), {
    uid: user.uid,
    email: user.email ?? null,
    role,
    disabled: false,
    createdAt: now,
    updatedAt: now,
  });

  batch.set(db.collection(COLLECTIONS.profiles).doc(user.uid), {
    uid: user.uid,
    displayName: user.displayName ?? null,
    bio: null,
    avatarUrl: user.photoURL ?? null,
    preferences: {},
    createdAt: now,
    updatedAt: now,
  });

  await batch.commit();
  logger.info("Provisioned new user", { actorId: user.uid, action: "user.create" });

  return {
    customClaims: { role },
  };
});

/**
 * Blocking function: runs on every sign-in. Refreshes the role claim from
 * Firestore in case an admin changed it since the last token was minted,
 * and blocks sign-in entirely for disabled accounts.
 */
export const onUserSignIn = beforeUserSignedIn(async (event) => {
  const user = event.data;
  if (!user) {
    throw new HttpsError("internal", "No user data on sign-in event.");
  }

  const userDoc = await db.collection(COLLECTIONS.users).doc(user.uid).get();
  if (!userDoc.exists) {
    // Shouldn't happen (onUserCreate always provisions it), but fail safe.
    return { customClaims: { role: DEFAULT_USER_ROLE.value() } };
  }

  const data = userDoc.data()!;
  if (data.disabled === true) {
    throw new HttpsError("permission-denied", "This account has been disabled.");
  }

  return { customClaims: { role: data.role } };
});

/**
 * Cleans up derived Firestore data when a user's core record is removed by
 * an admin operation. Kept separate from Auth deletion to avoid silently
 * deleting user content when an Auth account is merely disabled.
 */
export const onUserDocDeleted = onDocumentDeleted(
  `${COLLECTIONS.users}/{uid}`,
  async (event) => {
    const uid = event.params.uid;
    await db.collection(COLLECTIONS.profiles).doc(uid).delete().catch(() => undefined);
    logger.info("Cleaned up profile after user deletion", {
      actorId: "system",
      action: "user.cleanup",
      resourceId: uid,
    });
    // Auth account deletion (if desired) is a deliberate separate admin
    // action - we never cascade Firestore deletes into deleting Auth users.
    void auth; // referenced to keep import intentional for future use
  }
);
