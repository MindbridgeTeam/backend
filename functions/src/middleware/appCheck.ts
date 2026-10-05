import { CallableRequest } from "firebase-functions/v2/https";
import { Errors } from "../utils/errors";
import { isProduction } from "../config/env";

/**
 * Verifies the request carries a valid App Check token. Enable this on
 * functions exposed to mobile/web clients that are sensitive to abuse
 * (chat/AI calls, consultation submission, review creation).
 *
 * In production this hard-fails requests without a token. In development
 * (emulator / local testing) it only warns, so local testing isn't blocked
 * by App Check debug-token setup.
 */
export function requireAppCheck(request: CallableRequest): void {
  if (request.app) return;

  if (isProduction()) {
    throw Errors.permissionDenied("This request could not be verified.");
  }
}
