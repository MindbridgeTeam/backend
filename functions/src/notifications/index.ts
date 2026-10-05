import { onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { db, messaging, COLLECTIONS } from "../config/firebase";
import { requireAuth } from "../middleware/auth";
import { withErrorHandling, Errors } from "../utils/errors";
import { ok } from "../utils/response";
import { FieldValue, Timestamp, Query } from "firebase-admin/firestore";
import { NotificationType } from "../types/models";
import { logger } from "../utils/logger";

/**
 * Creates a Notification document for a user and best-effort sends a push
 * via FCM if the user has any registered device tokens (stored at
 * profiles/{uid}.fcmTokens - not modeled in detail here, but this is where
 * a client's registerDeviceToken callable would write them).
 *
 * This is a server-only helper - never exposed as a callable, since any
 * caller could otherwise spam notifications to arbitrary users.
 */
export async function notifyUser(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  const { userId, type, title, body, data } = params;

  await db.collection(COLLECTIONS.notifications).add({
    userId,
    type,
    title,
    body,
    data: data ?? {},
    read: false,
    readAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });

  try {
    const profileSnap = await db.collection(COLLECTIONS.profiles).doc(userId).get();
    const tokens: string[] = (profileSnap.data()?.fcmTokens as string[] | undefined) ?? [];
    if (tokens.length === 0) return;

    await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data ?? {}).map(([k, v]) => [k, String(v)])
      ),
    });
  } catch (err) {
    // Push delivery failures should never block the in-app notification
    // record from having been created.
    logger.warn("FCM push delivery failed", {
      actorId: userId,
      action: "notification.push_failed",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export const registerDeviceToken = onCall(async (request) => {
  return withErrorHandling("registerDeviceToken", async () => {
    const ctx = requireAuth(request);
    const token = String(request.data?.token ?? "");
    if (!token) throw Errors.invalidArgument("A device token is required.");

    await db
      .collection(COLLECTIONS.profiles)
      .doc(ctx.uid)
      .update({ fcmTokens: FieldValue.arrayUnion(token) });

    return ok({ registered: true });
  });
});

export const listNotifications = onCall(async (request) => {
  return withErrorHandling("listNotifications", async () => {
    const ctx = requireAuth(request);
    const unreadOnly = Boolean(request.data?.unreadOnly);
    const pageSize = Math.min(Number(request.data?.pageSize) || 30, 100);

    let query = db
      .collection(COLLECTIONS.notifications)
      .where("userId", "==", ctx.uid) as Query;

    if (unreadOnly) query = query.where("read", "==", false);

    query = query.orderBy("createdAt", "desc").limit(pageSize);

    const snap = await query.get();
    return ok(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
});

export const markNotificationRead = onCall(async (request) => {
  return withErrorHandling("markNotificationRead", async () => {
    const ctx = requireAuth(request);
    const notificationId = String(request.data?.notificationId ?? "");
    if (!notificationId) throw Errors.invalidArgument("A notification ID is required.");

    const ref = db.collection(COLLECTIONS.notifications).doc(notificationId);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.userId !== ctx.uid) {
      // Return not-found rather than permission-denied to avoid confirming
      // existence of another user's notification.
      throw Errors.notFound("Notification not found.");
    }

    await ref.update({ read: true, readAt: FieldValue.serverTimestamp() });
    return ok({ id: notificationId, read: true });
  });
});

/**
 * Daily scheduled job: finds consultations marked FOLLOW_UP whose follow-up
 * is due and reminds the assigned professional and the student. Runs via
 * Cloud Scheduler (configured automatically by the onSchedule trigger).
 */
export const followUpReminderJob = onSchedule("every day 09:00", async () => {
  const cutoff = Timestamp.fromMillis(Date.now() - 3 * 24 * 60 * 60 * 1000);

  const snap = await db
    .collection(COLLECTIONS.consultations)
    .where("status", "==", "FOLLOW_UP")
    .where("updatedAt", "<=", cutoff)
    .get();

  await Promise.all(
    snap.docs.map(async (doc) => {
      const data = doc.data();
      await notifyUser({
        userId: data.professionalId,
        type: "follow_up_reminder",
        title: "Follow-up reminder",
        body: "A consultation follow-up is due.",
        data: { consultationId: doc.id },
      });
      await notifyUser({
        userId: data.studentId,
        type: "follow_up_reminder",
        title: "Follow-up reminder",
        body: "Your consultation has a pending follow-up.",
        data: { consultationId: doc.id },
      });
    })
  );

  logger.info("Follow-up reminder job completed", { action: "notifications.follow_up_job" });
});
