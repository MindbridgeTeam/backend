import { onCall } from "firebase-functions/v2/https";
import { db, COLLECTIONS } from "../config/firebase";
import { requireAuth, enforceRateLimit } from "../middleware/auth";
import { withErrorHandling } from "../utils/errors";
import { parse, CreateCheckInSchema, GetCheckInTrendsSchema } from "../validation/schemas";
import { ok } from "../utils/response";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export const createCheckIn = onCall(async (request) => {
  return withErrorHandling("createCheckIn", async () => {
    const ctx = requireAuth(request);
    const { mood, notes, tags } = parse(CreateCheckInSchema, request.data);

    await enforceRateLimit({
      uid: ctx.uid,
      bucket: "checkin_create",
      windowSeconds: 60,
      maxRequests: 10,
    });

    const ref = await db.collection(COLLECTIONS.checkIns).add({
      userId: ctx.uid,
      mood,
      notes: notes ?? null,
      tags: tags ?? [],
      createdAt: FieldValue.serverTimestamp(),
    });

    const snap = await ref.get();
    return ok({ id: ref.id, ...snap.data() });
  });
});

/** Lists the caller's own check-ins, most recent first. Ownership is
 * enforced by scoping the query to userId == caller - this collection is
 * also protected by firestore.rules for any direct-SDK reads. */
export const getMyCheckIns = onCall(async (request) => {
  return withErrorHandling("getMyCheckIns", async () => {
    const ctx = requireAuth(request);
    const pageSize = Math.min(Number(request.data?.pageSize) || 30, 100);

    const snap = await db
      .collection(COLLECTIONS.checkIns)
      .where("userId", "==", ctx.uid)
      .orderBy("createdAt", "desc")
      .limit(pageSize)
      .get();

    return ok(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
});

/**
 * Computes simple trend statistics (average mood per day, overall average,
 * and streak of consecutive days checked in) over a window. Trend
 * computation is done server-side so we never need to expose any other
 * user's check-ins to compute an aggregate.
 */
export const getCheckInTrends = onCall(async (request) => {
  return withErrorHandling("getCheckInTrends", async () => {
    const ctx = requireAuth(request);
    const { days } = parse(GetCheckInTrendsSchema, request.data);

    const since = Timestamp.fromMillis(Date.now() - days * 24 * 60 * 60 * 1000);

    const snap = await db
      .collection(COLLECTIONS.checkIns)
      .where("userId", "==", ctx.uid)
      .where("createdAt", ">=", since)
      .orderBy("createdAt", "asc")
      .get();

    const byDay = new Map<string, number[]>();
    for (const doc of snap.docs) {
      const data = doc.data();
      const date = (data.createdAt as Timestamp).toDate();
      const key = date.toISOString().slice(0, 10);
      const arr = byDay.get(key) ?? [];
      arr.push(data.mood as number);
      byDay.set(key, arr);
    }

    const dailyAverages = Array.from(byDay.entries())
      .map(([date, moods]) => ({
        date,
        average: moods.reduce((a, b) => a + b, 0) / moods.length,
        count: moods.length,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const allMoods = snap.docs.map((d) => d.data().mood as number);
    const overallAverage =
      allMoods.length > 0 ? allMoods.reduce((a, b) => a + b, 0) / allMoods.length : null;

    // Current streak: consecutive days (ending today, or yesterday if the user
    // hasn't checked in yet today) that have at least one check-in. Uses the
    // same UTC day keys built above so it stays consistent with dailyAverages.
    const checkedDays = new Set(byDay.keys());
    let currentStreakDays = 0;
    const cursor = new Date();
    if (!checkedDays.has(cursor.toISOString().slice(0, 10))) {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    while (checkedDays.has(cursor.toISOString().slice(0, 10))) {
      currentStreakDays += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }

    return ok({
      windowDays: days,
      totalCheckIns: snap.size,
      overallAverage,
      dailyAverages,
      currentStreakDays,
    });
  });
});
