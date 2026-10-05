import { defineString, defineInt } from "firebase-functions/params";

/**
 * Plain (non-secret) configuration. Safe to keep in .env for emulator use,
 * and set as normal params in production. These control behavior, not
 * access to anything sensitive.
 */
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
