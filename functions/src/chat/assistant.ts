export type AssistantIntent =
  | "CRISIS"
  | "GOAL_SETTING"
  | "PLAN_MANAGEMENT"
  | "CHECKIN"
  | "RESOURCE_REQUEST"
  | "EMOTIONAL_SUPPORT"
  | "REFLECTION"
  | "GENERAL_CHAT";

const CRISIS_PHRASES = [
  "kill myself",
  "suicide",
  "want to die",
  "end my life",
  "self harm",
  "cut myself",
];

export const SAFETY_RESPONSE = `Thank you for sharing this. It sounds like you're going through a really difficult time and your safety is important.

Please consider reaching out right away:
- Nigeria: Suicide Research & Prevention: 0800-800-2000
- If you can, talk to someone you trust nearby
You don't have to go through this alone.`;

export function isCrisis(message: string): boolean {
  const normalized = message.toLowerCase();
  return CRISIS_PHRASES.some((phrase) => normalized.includes(phrase));
}

export function detectIntent(message: string): AssistantIntent {
  const normalized = message.toLowerCase();

  if (isCrisis(normalized)) return "CRISIS";
  if (["goal", "want to start", "i want to", "plan to"].some((word) => normalized.includes(word))) {
    return "GOAL_SETTING";
  }
  if (["my plan", "change my plan", "stop plan", "update plan"].some((word) => normalized.includes(word))) {
    return "PLAN_MANAGEMENT";
  }
  if (["check in", "checking in", "i did", "completed", "i finished"].some((word) => normalized.includes(word))) {
    return "CHECKIN";
  }
  if (["resource", "article", "video", "exercise", "give me", "recommend"].some((word) => normalized.includes(word))) {
    return "RESOURCE_REQUEST";
  }
  if (["i feel", "i'm feeling", "anxious", "sad", "stressed", "overwhelmed", "lonely"].some((word) => normalized.includes(word))) {
    return "EMOTIONAL_SUPPORT";
  }
  if (["i think", "reflect", "why do i", "meaning"].some((word) => normalized.includes(word))) {
    return "REFLECTION";
  }

  return "GENERAL_CHAT";
}

export function generateResponse(
  message: string,
  context = "",
  activePlan = "No active plan",
  library = "No resources",
  checkin = ""
): string {
  if (isCrisis(message)) return SAFETY_RESPONSE;

  const intent = detectIntent(message);
  if (intent === "CRISIS") return SAFETY_RESPONSE;

  const templates: Record<Exclude<AssistantIntent, "CRISIS">, string> = {
    REFLECTION: `You are Mind Bridge, a supportive wellness assistant.\nContext: {context}\nUser: {message}\nRespond with 5 parts: Acknowledge / Understand / Respond / Practical step / Invite\nTone: Warm, non-judgmental. Never diagnose.`,
    GOAL_SETTING: `Help user set a SMART goal.\nUser wants: {message}\nContext: {context}\nLibrary: {library}\nStructure: Acknowledge goal, clarify why, break into small steps, invite to commit.`,
    PLAN_MANAGEMENT: `Manage active plan.\nActive plan: {active_plan}\nUser message: {message}\nIf user wants to change/stop plan, confirm and explain impact.`,
    CHECKIN: `Review check-in: {checkin}\nUser: {message}\nEncourage progress, don't shame missed days. Ask what helped/hindered.`,
    RESOURCE_REQUEST: `User asked for resource: {message}\nLibrary results: {library}\nProvide approved resource if found, else offer general coping strategy. Never make up resources.`,
    EMOTIONAL_SUPPORT: `User feeling: {message}\nContext: {context}\nProvide emotional support. Validate feelings, no toxic positivity. Offer one grounding exercise.\nCRITICAL: No diagnosis, no medical advice.`,
    GENERAL_CHAT: `Friendly chat. Message: {message}\nKeep warm and brief, redirect gently to wellness goals if relevant.`,
  };

  const values: Record<string, string> = {
    message,
    context,
    active_plan: activePlan,
    library,
    checkin,
  };

  return templates[intent].replace(
    /\{(message|context|active_plan|library|checkin)\}/g,
    (_match: string, key: string) => values[key]
  );
}
