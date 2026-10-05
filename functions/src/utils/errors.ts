import { HttpsError, FunctionsErrorCode } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";

/**
 * Domain-level error. Thrown anywhere in business logic; caught once at the
 * top of each callable/HTTP handler and translated into a safe HttpsError.
 * The `message` is always safe to show to the client - never put secrets,
 * stack traces, or internal identifiers into it.
 */
export class AppError extends Error {
  code: FunctionsErrorCode;

  constructor(code: FunctionsErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "AppError";
  }
}

export const Errors = {
  unauthenticated: (msg = "You must be signed in to do this.") =>
    new AppError("unauthenticated", msg),
  permissionDenied: (msg = "You do not have permission to do this.") =>
    new AppError("permission-denied", msg),
  notFound: (msg = "The requested resource was not found.") =>
    new AppError("not-found", msg),
  invalidArgument: (msg = "The request was invalid.") =>
    new AppError("invalid-argument", msg),
  failedPrecondition: (msg = "This action cannot be performed right now.") =>
    new AppError("failed-precondition", msg),
  resourceExhausted: (msg = "Too many requests. Please try again shortly.") =>
    new AppError("resource-exhausted", msg),
  internal: (msg = "Something went wrong. Please try again.") =>
    new AppError("internal", msg),
};

/**
 * Wraps a handler body, logs the *real* error server-side (with full detail
 * for debugging), and rethrows only a safe HttpsError to the client so
 * internals (stack traces, third-party error bodies, secrets) never leak.
 */
export async function withErrorHandling<T>(
  context: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) {
      logger.warn(`[${context}] handled error: ${err.message}`, { code: err.code });
      throw new HttpsError(err.code, err.message);
    }
    if (err instanceof HttpsError) {
      throw err;
    }
    // Unknown/unexpected error - log full detail internally, return a
    // generic message externally.
    logger.error(`[${context}] unexpected error`, { error: serializeError(err) });
    throw new HttpsError("internal", "Something went wrong. Please try again.");
  }
}

function serializeError(err: unknown) {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack, name: err.name };
  }
  return { value: String(err) };
}
