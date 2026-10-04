/**
 * Bootstraps the very first admin account.
 *
 * Nothing inside the deployed backend can create an admin - `setUserRole`
 * (functions/src/auth/callable.ts) deliberately requires the caller to
 * already be an admin. This script is the one-time exception: it runs
 * locally with a service account key that has full Admin SDK access,
 * completely outside the app's normal request path.
 *
 * Usage:
 *   1. Firebase Console -> Project settings -> Service accounts
 *      -> "Generate new private key" -> save as serviceAccountKey.json
 *      in this scripts/ folder (already gitignored - never commit it).
 *   2. The target user must already exist (sign up normally through your
 *      app first, or create them in the Auth emulator/console).
 *   3. Run:
 *        cd backend/scripts
 *        npm install firebase-admin
 *        node bootstrapAdmin.js --uid=<their-auth-uid>
 *      or, to look them up by email instead of uid:
 *        node bootstrapAdmin.js --email=admin@example.com
 *   4. The user must sign out and back in (or wait for token refresh) for
 *      the new role claim to take effect - our beforeUserSignedIn trigger
 *      re-syncs claims from Firestore on every sign-in.
 *
 * This only touches ONE account. It is not meant to be run repeatedly or
 * left lying around on a shared machine - delete serviceAccountKey.json
 * when you're done if this isn't a dedicated ops machine.
 */

const admin = require("firebase-admin");
const path = require("path");

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, "").split("=");
      return [key, value];
    })
  );
  if (!args.uid && !args.email) {
    console.error("Usage: node bootstrapAdmin.js --uid=<uid>  OR  --email=<email>");
    process.exit(1);
  }
  return args;
}

async function main() {
  const { uid: uidArg, email } = parseArgs();

  const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");
  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath)),
  });

  const auth = admin.auth();
  const db = admin.firestore();

  const userRecord = uidArg ? await auth.getUser(uidArg) : await auth.getUserByEmail(email);
  const uid = userRecord.uid;

  await auth.setCustomUserClaims(uid, { role: "admin" });

  await db.collection("users").doc(uid).set(
    { role: "admin", updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );

  console.log(`Done. ${userRecord.email ?? uid} is now an admin.`);
  console.log("They must sign out and back in for the new role to take effect.");
}

main().catch((err) => {
  console.error("Failed to bootstrap admin:", err.message);
  process.exit(1);
});
