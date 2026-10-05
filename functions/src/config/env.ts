import { defineSecret, defineString, defineInt } from "firebase-functions/params";

/**
 * Secrets: encrypted at rest, injected only into the functions that declare
 * them via `runWith({ secrets: [...] })` / the v2 `secrets: [...]` option.
 * They are never readable from the frontend and never appear in logs.
 *
 * Set with:
 *   firebase functions:secrets:set AI_API_KEY
 */
export const AI_API_KEY = defineSecret("AI_API_KEY");

/**
 * Plain (non-secret) configuration. Safe to keep in .env for emulator use,
 * and set as normal params in production. These control behavior, not
 * access to anything sensitive.
 */
export const AI_API_BASE_URL = defineString("AI_API_BASE_URL", {
  default: "https://api.anthropic.com",
});

// Set this to a model your Anthropic account has access to. Keep it aligned
// with functions/.env.example so local and deployed defaults match.
export const AI_MODEL = defineString("AI_MODEL", {
  default: "claude-sonnet-4-6",
});

export const DEFAULT_USER_ROLE = defineString("DEFAULT_USER_ROLE", {
  default: "student",
});

export const CHAT_RATE_LIMIT_PER_MINUTE = defineInt("CHAT_RATE_LIMIT_PER_MINUTE", {
  default: 20,
});

export const CONSULTATION_RATE_LIMIT_PER_DAY = defineInt(
  "CONSULTATION_RATE_LIMIT_PER_DAY",
  { default: 5 }
);

export const APP_ENV = defineString("APP_ENV", { default: "development" });

export const isProduction = (): boolean => APP_ENV.value() === "production";
