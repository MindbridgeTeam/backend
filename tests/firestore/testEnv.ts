import {
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import * as fs from "fs";
import * as path from "path";

let env: RulesTestEnvironment | null = null;

export async function getTestEnv(): Promise<RulesTestEnvironment> {
  if (env) return env;

  env = await initializeTestEnvironment({
    projectId: "demo-test",
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, "../../firestore.rules"), "utf8"),
      host: "localhost",
      port: 8080,
    },
  });

  return env;
}

export async function teardownTestEnv(): Promise<void> {
  if (env) {
    await env.cleanup();
    env = null;
  }
}

/** Convenience: an authenticated context with a role custom claim, matching
 * what our Cloud Functions actually set via setCustomUserClaims. */
export function authedContext(
  testEnv: RulesTestEnvironment,
  uid: string,
  role: "student" | "professional" | "admin" | "ngo"
) {
  return testEnv.authenticatedContext(uid, { role });
}
