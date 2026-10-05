import { onObjectFinalized, onObjectDeleted } from "firebase-functions/v2/storage";
import { db, COLLECTIONS } from "../config/firebase";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "../utils/logger";

const resolveStorageBucket = (): string => {
  const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID;
  if (projectId) {
    return `${projectId}.appspot.com`;
  }

  return "demo-test.appspot.com";
};

/**
 * Storage layout enforced by storage.rules: avatars/{userId}/{fileName}.
 * When a client uploads a new avatar (via the Storage SDK, authorized as
 * the owning user), this trigger updates profiles/{userId}.avatarUrl with
 * the storage *path* (not a signed URL, which would expire, and not a
 * public URL, since avatar reads still require sign-in per storage.rules).
 *
 * The frontend resolves the path to a usable URL with the Storage SDK:
 *   const url = await getDownloadURL(ref(storage, profile.avatarUrl));
 * which respects the caller's own auth context against storage.rules.
 */
export const onAvatarUploaded = onObjectFinalized(
  { bucket: resolveStorageBucket() },
  async (event) => {
    const filePath = event.data.name; // e.g. "avatars/{uid}/{fileName}"
  const match = /^avatars\/([^/]+)\/(.+)$/.exec(filePath ?? "");
  if (!match) return; // not an avatar upload, ignore

  const [, userId] = match;

  const profileRef = db.collection(COLLECTIONS.profiles).doc(userId);
  const profileSnap = await profileRef.get();
  if (!profileSnap.exists) {
    logger.warn("Avatar uploaded for a user with no profile doc", {
      actorId: userId,
      action: "avatar.orphaned_upload",
    });
    return;
  }

  await profileRef.update({
    avatarUrl: filePath,
    updatedAt: FieldValue.serverTimestamp(),
  });

    logger.info("Linked uploaded avatar to profile", {
      actorId: userId,
      action: "avatar.linked",
      resourceType: "profile",
      resourceId: userId,
    });
  }
);

/** Clears avatarUrl if the file backing it is deleted (e.g. the user
 * removed their avatar), so the profile never points at a dead file. */
export const onAvatarDeleted = onObjectDeleted(
  { bucket: resolveStorageBucket() },
  async (event) => {
    const filePath = event.data.name;
  const match = /^avatars\/([^/]+)\/(.+)$/.exec(filePath ?? "");
  if (!match) return;

  const [, userId] = match;
  const profileRef = db.collection(COLLECTIONS.profiles).doc(userId);
  const profileSnap = await profileRef.get();
    if (profileSnap.exists && profileSnap.data()?.avatarUrl === filePath) {
      await profileRef.update({ avatarUrl: null, updatedAt: FieldValue.serverTimestamp() });
    }
  }
);
