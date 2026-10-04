import functionsTest from "firebase-functions-test";
import * as admin from "firebase-admin";
import { CallableFunction, CallableRequest } from "firebase-functions/v2/https";

/**
 * These tests run against the Firebase emulator suite, never production.
 * Required env vars (set automatically by `firebase emulators:exec`, see
 * functions/package.json's "test:integration" script):
 *   FIRESTORE_EMULATOR_HOST=localhost:8080
 *   FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
 *   GCLOUD_PROJECT=demo-test
 *
 * firebase-functions-test's `wrap()` lets us invoke a v2 onCall function's
 * handler directly with a synthetic CallableRequest, without needing HTTP.
 */
export const testEnv = functionsTest({ projectId: "demo-test" });

type Role = "student" | "professional" | "admin" | "ngo";

function fakeAuth(uid: string, role: Role): CallableRequest["auth"] {
  return {
    uid,
    token: {
      role,
      email: `${uid}@example.com`,
    },
  } as unknown as CallableRequest["auth"];
}

/** Invokes a wrapped v2 callable with the given data + a fake authenticated
 * caller, matching the single-argument CallableRequest shape v2 uses. */
export async function callAs<Req, Res>(
  fn: CallableFunction<Req, Res>,
  uid: string,
  role: Role,
  data: Req
): Promise<Res> {
  const wrapped = testEnv.wrap(fn);
  return wrapped({ data, auth: fakeAuth(uid, role) } as unknown as CallableRequest<Req>);
}

export function adminDb() {
  return admin.firestore();
}
