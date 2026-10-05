import { onCall } from "firebase-functions/v2/https";
import { db, COLLECTIONS } from "../config/firebase";
import { requireAuth, requireOwnerOrRole, enforceRateLimit } from "../middleware/auth";
import { requireAppCheck } from "../middleware/appCheck";
import { withErrorHandling, Errors } from "../utils/errors";
import {
  parse,
  CreateConversationSchema,
  SendMessageSchema,
  GetConversationSchema,
} from "../validation/schemas";
import { ok } from "../utils/response";
import { FieldValue } from "firebase-admin/firestore";
import { AI_API_KEY, AI_API_BASE_URL, AI_MODEL, CHAT_RATE_LIMIT_PER_MINUTE } from "../config/env";
import { logger } from "../utils/logger";
import { buildSystemPrompt, detectIntent, SAFETY_RESPONSE } from "./assistant";

export const createConversation = onCall(async (request) => {
  return withErrorHandling("createConversation", async () => {
    const ctx = requireAuth(request);
    const { title } = parse(CreateConversationSchema, request.data);
    const now = FieldValue.serverTimestamp();

    const ref = await db.collection(COLLECTIONS.chatSessions).add({
      userId: ctx.uid,
      title: title || "New conversation",
      lastMessageAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const snap = await ref.get();
    return ok({ id: ref.id, ...snap.data() });
  });
});

async function loadOwnedSession(ctx: { uid: string; role: string }, sessionId: string) {
  const ref = db.collection(COLLECTIONS.chatSessions).doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) throw Errors.notFound("Conversation not found.");
  requireOwnerOrRole(ctx as never, snap.data()!.userId, ["admin"]);
  return { ref, snap };
}

async function findRelevantResources(message: string): Promise<string> {
  try {
    const snapshot = await db
      .collection(COLLECTIONS.resources)
      .where("published", "==", true)
      .limit(100)
      .get();
    const terms = [...new Set(message.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])];
    const resources = snapshot.docs
      .map((doc) => {
        const data = doc.data();
        const searchable = [
          data.title,
          data.category,
          data.description,
          data.content,
          data.context,
          ...(Array.isArray(data.tags) ? data.tags : []),
        ]
          .filter((value) => typeof value === "string")
          .join(" ")
          .toLowerCase();
        return { data, score: terms.filter((term) => searchable.includes(term)).length };
      })
      .filter((resource) => resource.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3);

    return resources
      .map(({ data }) =>
        [
          `Title: ${data.title ?? "Untitled"}`,
          `Category: ${data.category ?? "Uncategorized"}`,
          `URL: ${data.url ?? "Not provided"}`,
          `Details: ${data.context ?? data.description ?? data.content ?? ""}`,
          data.time ? `Reading time: ${data.time}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      )
      .join("\n\n");
  } catch (err) {
    logger.warn("Published resource lookup failed", {
      action: "chat.resource_lookup_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return "";
  }
}

async function loadActivePlan(uid: string): Promise<string> {
  const snapshot = await db
    .collection(COLLECTIONS.selfHelpPlans)
    .where("userId", "==", uid)
    .where("status", "==", "active")
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();
  if (snapshot.empty) return "No active plan.";

  const plan = snapshot.docs[0];
  const taskSnapshot = await plan.ref
    .collection(COLLECTIONS.selfHelpTasks)
    .where("completed", "==", false)
    .limit(20)
    .get();

  return JSON.stringify({
    title: plan.get("title"),
    description: plan.get("description"),
    tasks: taskSnapshot.docs.map((task) => ({
      title: task.get("title"),
      dueDate: task.get("dueDate")?.toDate?.().toISOString() ?? null,
    })),
  });
}

async function loadLatestCheckIn(uid: string): Promise<string> {
  const snapshot = await db
    .collection(COLLECTIONS.checkIns)
    .where("userId", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();
  if (snapshot.empty) return "No previous check-in.";

  const checkIn = snapshot.docs[0];
  return JSON.stringify({
    mood: checkIn.get("mood"),
    notes: checkIn.get("notes"),
    tags: checkIn.get("tags"),
    createdAt: checkIn.get("createdAt")?.toDate?.().toISOString() ?? null,
  });
}

/**
 * Fetches recent message history for context, then calls the AI provider
 * server-side (the API key never leaves this function), and persists both
 * the user's message and the assistant's reply.
 */
export const sendMessage = onCall(
  { secrets: [AI_API_KEY] },
  async (request) => {
    return withErrorHandling("sendMessage", async () => {
      requireAppCheck(request);
      const ctx = requireAuth(request);
      const { sessionId, content } = parse(SendMessageSchema, request.data);

      await enforceRateLimit({
        uid: ctx.uid,
        bucket: "chat_send",
        windowSeconds: 60,
        maxRequests: CHAT_RATE_LIMIT_PER_MINUTE.value(),
      });

      const { ref: sessionRef } = await loadOwnedSession(ctx, sessionId);
      const messagesRef = sessionRef.collection(COLLECTIONS.chatMessages);

      // Store the user's message first.
      const now = FieldValue.serverTimestamp();
      await messagesRef.add({
        sessionId,
        senderType: "user",
        content,
        createdAt: now,
      });

      // Pull recent context (last 20 messages) to send to the model.
      const historySnap = await messagesRef.orderBy("createdAt", "desc").limit(20).get();
      const history = historySnap.docs
        .map((d) => d.data())
        .reverse()
        .map((m) => ({
          role: m.senderType === "assistant" ? "assistant" : "user",
          content: m.content as string,
        }));

      const intent = detectIntent(content);
      let assistantText: string;
      try {
        if (intent === "CRISIS") {
          assistantText = SAFETY_RESPONSE;
        } else {
          const library =
            intent === "RESOURCE_REQUEST" || intent === "GOAL_SETTING"
              ? await findRelevantResources(content)
              : "";
          const [activePlan, checkin] = await Promise.all([
            intent === "PLAN_MANAGEMENT" ? loadActivePlan(ctx.uid) : Promise.resolve(undefined),
            intent === "CHECKIN" ? loadLatestCheckIn(ctx.uid) : Promise.resolve(undefined),
          ]);
          assistantText = await callAiProvider(
            history,
            buildSystemPrompt({ intent, library, activePlan, checkin })
          );
        }
      } catch (err) {
        logger.error("Chat response generation failed", {
          actorId: ctx.uid,
          action: "chat.response_generation_failed",
          error: err instanceof Error ? err.message : String(err),
        });
        throw Errors.internal("The assistant is temporarily unavailable. Please try again.");
      }

      const assistantRef = await messagesRef.add({
        sessionId,
        senderType: "assistant",
        content: assistantText,
        createdAt: FieldValue.serverTimestamp(),
      });

      await sessionRef.update({
        lastMessageAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const assistantSnap = await assistantRef.get();
      return ok({ id: assistantRef.id, ...assistantSnap.data() });
    });
  }
);

async function callAiProvider(
  history: Array<{ role: string; content: string }>,
  systemPrompt: string
): Promise<string> {
  const response = await fetch(`${AI_API_BASE_URL.value()}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": AI_API_KEY.value(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: AI_MODEL.value(),
      max_tokens: 1000,
      system: systemPrompt,
      messages: history,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI provider returned status ${response.status}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
  };

  const text = data.content.find((block) => block.type === "text")?.text;
  if (!text) {
    throw new Error("AI provider returned no text content.");
  }
  return text;
}

export const getConversation = onCall(async (request) => {
  return withErrorHandling("getConversation", async () => {
    const ctx = requireAuth(request);
    const { sessionId, pageSize, cursor } = parse(GetConversationSchema, request.data);

    const { snap: sessionSnap, ref: sessionRef } = await loadOwnedSession(ctx, sessionId);

    let query = sessionRef
      .collection(COLLECTIONS.chatMessages)
      .orderBy("createdAt", "asc")
      .limit(pageSize);

    if (cursor) {
      const cursorDoc = await sessionRef.collection(COLLECTIONS.chatMessages).doc(cursor).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }

    const messagesSnap = await query.get();

    return ok({
      session: { id: sessionSnap.id, ...sessionSnap.data() },
      messages: messagesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      nextCursor:
        messagesSnap.docs.length === pageSize
          ? messagesSnap.docs[messagesSnap.docs.length - 1].id
          : null,
    });
  });
});
