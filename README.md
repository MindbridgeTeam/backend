# Backend (Firebase)

A production-ready Firebase backend: Cloud Firestore for data, Firebase
Authentication for identity, Cloud Functions (TypeScript, v2) for all
server-side business logic, Firebase Storage for files, Firestore/Storage
Security Rules for authorization, App Check for abuse prevention, and Cloud
Messaging for push notifications.

There is no standalone Express/Node server. All privileged logic lives in
Cloud Functions; simple, safe reads (published resources, a user's own
check-ins/reflections/plans) may also be read directly via the Firestore
SDK, protected by the same Security Rules that back the callable functions.

## Table of contents

1. [Architecture](#architecture)
2. [Project structure](#project-structure)
3. [Firebase setup](#firebase-setup)
4. [Environment configuration & secrets](#environment-configuration--secrets)
5. [Authentication](#authentication)
6. [Firestore schema](#firestore-schema)
7. [Security rules](#security-rules)
8. [Roles and permissions](#roles-and-permissions)
9. [Cloud Functions / API reference](#cloud-functions--api-reference)
10. [Consultation workflow](#consultation-workflow)
11. [Chat architecture](#chat-architecture)
12. [Notifications](#notifications)
13. [Audit logging](#audit-logging)
14. [Local emulator setup](#local-emulator-setup)
15. [Testing](#testing)
16. [Deployment](#deployment)
17. [Production security checklist](#production-security-checklist)

## Architecture

```
Frontend (web/mobile)
   │
   ├── Firebase Auth SDK ───────► Firebase Authentication
   │                                  │ (custom claims: role)
   ├── Firestore SDK (direct reads,  │
   │   ownership-scoped) ──────────► Cloud Firestore ◄────┐
   │                                                        │
   └── Callable Cloud Functions ───► Cloud Functions ───────┘
                                        │        │
                                        │        └──► Firebase Storage
                                        ├──► AI provider (server-side only)
                                        └──► Cloud Messaging (push)
```

Design principle: **the frontend is never trusted**. Every sensitive
operation - role changes, consultation status transitions, AI calls, audit
logging, sponsorship data - is enforced inside a Cloud Function running with
the Admin SDK, or denied outright at the Firestore Security Rules layer.

## Project structure

```
backend/
├── firebase.json            # emulator + functions/firestore/storage config
├── .firebaserc               # project aliases (dev/staging/prod)
├── firestore.rules
├── firestore.indexes.json
├── storage.rules
├── functions/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts          # exports every function
│       ├── config/           # env/secrets, firebase admin init
│       ├── auth/             # triggers + role assignment
│       ├── users/            # profile CRUD + storageTriggers.ts (avatar linking)
│       ├── checkins/
│       ├── reflections/
│       ├── plans/
│       ├── resources/
│       ├── chat/
│       ├── consultations/    # + stateMachine.ts
│       ├── professionals/
│       ├── notifications/
│       ├── sponsors/
│       ├── audit/
│       ├── middleware/       # auth.ts (RBAC), appCheck.ts
│       ├── validation/       # zod schemas
│       └── utils/            # response/error/logger helpers
│   └── test/
│       └── integration/      # end-to-end callable-function tests (emulator)
└── tests/
    ├── auth/
    ├── security/ (see tests/firestore)
    ├── consultations/
    └── firestore/
```

## Firebase setup

```bash
npm install -g firebase-tools
firebase login
cd backend
firebase use --add            # pick/alias your Firebase project
cd functions && npm install
```

Enable in the Firebase Console (or via `gcloud`/CLI) for your project:
- Authentication (Email/Password, plus any social providers you need)
- Cloud Firestore (Native mode)
- Cloud Storage
- Cloud Messaging
- App Check (register your app, choose reCAPTCHA v3 / Play Integrity / App
  Attest depending on platform)

## Environment configuration & secrets

Non-secret config uses `firebase-functions/params` (`defineString`,
`defineInt`) with local defaults readable from `functions/.env` (copy
`.env.example` to `.env` for emulator use - **never commit `.env`**).

Secrets (`defineSecret`) are stored in Google Secret Manager and injected
only into the functions that declare them:

```bash
firebase functions:secrets:set AI_API_KEY
```

Never put API keys in `.env`, in Firestore, or in any document a client can
read. The `AI_API_KEY` is only ever read inside `chat/index.ts`'s
`sendMessage` function, on the server.

## Authentication

- Sign up / login / logout / password reset / email verification are
  handled **entirely client-side** via the Firebase Auth SDK
  (`createUserWithEmailAndPassword`, `signInWithEmailAndPassword`,
  `sendPasswordResetEmail`, `sendEmailVerification`, `signOut`). Firebase
  manages credential storage and hashing - this backend never touches a
  password.
- `auth/triggers.ts` runs a **blocking** `beforeUserCreated` function that
  provisions `users/{uid}` and `profiles/{uid}` and assigns a default
  `role: "student"` custom claim atomically with account creation.
- `beforeUserSignedIn` refreshes the role claim from Firestore on every
  sign-in (so an admin-issued role change takes effect on the user's next
  sign-in without waiting for token expiry) and blocks sign-in for disabled
  accounts.
- The frontend calls `getIdTokenResult()` to read `claims.role` for UI
  gating, but **every actual authorization decision is re-checked
  server-side** - the frontend role is for UX only.

## Firestore schema

See `functions/src/types/models.ts` for full field-level TypeScript types.
Top-level collections:

| Collection | Key fields | Notes |
|---|---|---|
| `users` | uid, email, role, disabled | mirrors Auth; role is claim + doc |
| `profiles` | uid, displayName, bio, avatarUrl, preferences | private |
| `checkIns` | userId, mood, notes, tags, createdAt | owned |
| `reflections` | userId, content, mood, createdAt | owned, immutable |
| `selfHelpPlans` | userId, title, status | + subcollection `selfHelpTasks` |
| `resources` | title, category, tags, published | admin-managed, publicly readable when published |
| `chatSessions` | userId, title, lastMessageAt | + subcollection `chatMessages` |
| `consultationRequests` | studentId, professionalId, status, statusHistory | workflow-controlled |
| `consultations` | requestId, studentId, professionalId, status, scheduledAt | created on approval |
| `consultationOutcomes` | consultationId, summary, recommendations | professional-authored |
| `professionals` | uid, specialties, verified | directory |
| `professionalReviews` | professionalId, studentId, rating | validated against a completed consultation |
| `notifications` | userId, type, title, body, read | Cloud-Function-created only |
| `sponsors` / `sponsorshipAllocations` | sponsorId, studentId, amount | admin-only raw access |
| `auditLogs` | actorId, actorRole, action, resourceType, resourceId | admin-only read |

Composite indexes for every query pattern above are defined in
`firestore.indexes.json`. One deliberate exception: filtering `resources` by
`category` **and** `tag` at the same time isn't pre-indexed (each alone is).
If you add that combined filter, Firestore's error message includes a direct
console link to create the missing index on first use - that's the normal,
expected workflow for a query shape that wasn't anticipated up front.

## Security rules

`firestore.rules` defaults to **deny everything**, then explicitly allows:
- Owner-scoped reads/writes on simple owned collections (check-ins,
  reflections, plans/tasks, chat).
- Public reads of *published* resources only.
- **No direct client writes at all** to `users`, `consultationRequests`
  (beyond the initial `SUBMITTED` create), `consultations`,
  `consultationOutcomes`, `professionalReviews`, `notifications` (beyond
  marking read), `sponsors`, `sponsorshipAllocations`, or `auditLogs` -
  these are only ever written by Cloud Functions using the Admin SDK, which
  bypasses rules and applies its own validation, state-machine checks, and
  audit logging.

`storage.rules` similarly scopes avatars/chat uploads to their owner and
keeps resource/consultation attachments admin- or function-managed.

## Roles and permissions

Roles (`student`, `professional`, `admin`, `ngo`) are stored as a Firebase
Auth **custom claim**, set only by `auth/callable.ts#setUserRole` (admin
only) or the creation trigger's default. Never trust a role value read from
a client-writable document.

| Role | Access |
|---|---|
| student | own check-ins, reflections, plans, chat, consultations; submit consultation requests; review a professional after a completed consultation |
| professional | consultations/requests assigned to them (or unclaimed queue); record outcomes; update their own bio/specialties/availability (never their own `verified` flag) |
| admin | operational access to all collections; role management; resource publishing; professional verification; sponsor/allocation management; audit log reads |
| ngo | aggregate sponsorship reporting only - never raw student data or conversations |

## Cloud Functions / API reference

All callable functions return `{ success, data, error }` (see
`utils/response.ts`). Errors never leak internals - see
`utils/errors.ts#withErrorHandling`.

| Area | Functions |
|---|---|
| Auth | `setUserRole` (admin) |
| Users | `getProfile`, `updateProfile` |
| Check-ins | `createCheckIn`, `getMyCheckIns`, `getCheckInTrends` |
| Reflections | `createReflection`, `getMyReflections`, `deleteReflection` |
| Plans | `createPlan`, `getMyPlans`, `updateTask`, `completeTask` |
| Resources | `getResources`, `getResourceDetails`, `createResource` (admin), `updateResource` (admin), `setResourcePublished` (admin), `deleteResource` (admin) |
| Chat | `createConversation`, `sendMessage`, `getConversation` |
| Consultations | `submitConsultationRequest`, `getRequestStatus`, `getProfessionalRequestQueue`, `openRequest`, `approveRequest`, `declineRequest`, `requestMoreInformation`, `provideAdditionalInformation`, `recordOutcome` |
| Professionals | `listProfessionals`, `submitProfessionalReview`, `getMyReviews`, `verifyProfessional` (admin) |
| Notifications | `registerDeviceToken`, `listNotifications`, `markNotificationRead` (+ scheduled `followUpReminderJob`) |
| Sponsors | `createSponsor` (admin), `createSponsorshipAllocation` (admin), `updateAllocationStatus` (admin), `getSponsorshipReport` (ngo/admin, aggregate-only) |
| Storage triggers | `onAvatarUploaded`, `onAvatarDeleted` (auto-link/clear `profiles/{uid}.avatarUrl`) |

## Consultation workflow

```
SUBMITTED → PENDING_REVIEW → MORE_INFORMATION → PENDING_REVIEW (loop)
                           → APPROVED → SCHEDULED → COMPLETED → FOLLOW_UP → CLOSED
                           → DECLINED
```

`consultations/stateMachine.ts` is the single source of truth for which
transitions are legal and which role may perform each one. Every callable in
`consultations/index.ts` runs the transition inside a Firestore transaction,
validates it against the state machine, appends to `statusHistory`, writes
an `AuditLog` entry, and fires the relevant notification. Clients can never
write `status` directly (enforced in `firestore.rules`).

## Chat architecture

```
chatSessions/{sessionId}                 (owner: userId)
   └── chatMessages/{messageId}          (senderType: user | assistant | system)
```

`sendMessage`: writes the user's message, loads the last 20 messages as
context, calls the AI provider **server-side only** (the API key is a Cloud
Functions secret, never sent to the client), then writes the assistant's
reply. Clients can create `senderType: "user"` messages directly (rules
allow it) but can never write an `assistant` message themselves. Chat is
rate-limited per user per minute (`CHAT_RATE_LIMIT_PER_MINUTE`) and, in
production, requires a valid App Check token.

## Notifications

`notifications/index.ts#notifyUser` is a server-only helper (never a
callable) that writes a `Notification` doc and best-effort sends an FCM push
to any registered device tokens. It's invoked from the consultation workflow
on every status change, professional assignment, and by a daily scheduled
job (`followUpReminderJob`) that reminds students/professionals about
pending `FOLLOW_UP` consultations.

## Audit logging

`audit/index.ts#recordAuditLog` writes an `AuditLog` doc
(`actorId, actorRole, action, resourceType, resourceId, timestamp,
metadata`) for every role change and every consultation workflow
transition. Logs never include message content, reflection content, or
other sensitive payloads - only identifiers and status values needed to
reconstruct "who did what to which resource, when."

## Local emulator setup

```bash
cd backend
firebase emulators:start --only auth,firestore,functions,storage
```

The Emulator UI runs at `http://localhost:4000`. Point your frontend at the
emulators with `connectAuthEmulator`, `connectFirestoreEmulator`,
`connectFunctionsEmulator`, `connectStorageEmulator` during local
development - this never touches production data.

## Testing

There are three layers of tests:

```bash
# 1. Pure logic unit tests (state machine, RBAC middleware) - no emulator
cd tests && npm install
npm test

# 2. Firestore Security Rules tests - requires the emulator
npm run test:emulator

# 3. Integration tests - actually invoke the callable functions (via
#    firebase-functions-test) against the emulator, verifying real
#    Firestore documents get created/updated correctly end-to-end
cd ../functions && npm install
npm run test:integration
```

Required scenarios covered:
- **`tests/firestore/security.spec.ts`** (rules-level): Student A cannot
  read Student B's check-ins, reflections, plans, chat sessions/messages,
  or consultation information; an NGO cannot read any private chat
  session/messages or raw sponsorship allocations; a professional cannot
  read a consultation they aren't assigned to; no client can write
  `status` directly on a `consultationRequest`.
- **`tests/consultations/stateMachine.spec.ts`** (pure logic): the state
  machine rejects out-of-order transitions, wrong-role transitions, and any
  transition out of a terminal state.
- **`functions/test/integration/checkins.integration.spec.ts`**: a real
  `createCheckIn` → `getMyCheckIns` round trip confirms ownership scoping,
  and repeated calls confirm the rate limiter actually rejects excess
  requests (not just that the code path exists).
- **`functions/test/integration/consultations.integration.spec.ts`**: runs
  the full `submitConsultationRequest` → `openRequest` → `approveRequest`
  → `recordOutcome` sequence end-to-end and asserts the resulting audit
  log entry, then confirms a student cannot call `approveRequest` on their
  own request and an unrelated professional cannot act on someone else's
  assigned request.

## Deployment

## Resource catalog import

`scripts/data/resources.json` is the single versioned resource catalog. Preview
the import without connecting to Firestore:

```bash
node scripts/importResources.js --project=mindbridge-be753
```

To write the catalog, provide Firebase Admin credentials through
`GOOGLE_APPLICATION_CREDENTIALS` or the gitignored
`scripts/serviceAccountKey.json`, review the catalog, then explicitly run:

```bash
node scripts/importResources.js --project=mindbridge-be753 --apply
```

The importer uses catalog IDs as Firestore document IDs, publishes those
documents, preserves their original `createdAt`, updates their catalog fields,
and never deletes other documents. Re-importing updates matching IDs from the
versioned catalog. Resource imports are separate from deploying Functions.

```bash
cd backend
firebase deploy               # deploys functions, firestore rules/indexes, storage rules
firebase deploy --only functions
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only storage
```

Set secrets in each target project before deploying:
```bash
firebase use prod
firebase functions:secrets:set AI_API_KEY
firebase deploy
```

No credentials are ever committed to Git - see `.gitignore`.

## Production security checklist

- [ ] App Check enforced (Console → App Check → Enforce) for Firestore,
      Storage, and callable functions once client integration is verified.
- [ ] `APP_ENV=production` set so `requireAppCheck` hard-fails unverified
      callers.
- [ ] Secrets set via `firebase functions:secrets:set`, not `.env`.
- [ ] Firestore rules deployed and re-tested against the emulator after any
      schema change.
- [ ] Rate limits reviewed for production traffic
      (`CHAT_RATE_LIMIT_PER_MINUTE`, `CONSULTATION_RATE_LIMIT_PER_DAY`).
- [ ] Admin role assignment restricted to a small, known set of accounts
      (bootstrap the first admin via the Firebase Console/Admin SDK
      directly, since `setUserRole` itself requires an existing admin).
- [ ] New professionals reviewed and explicitly verified via
      `verifyProfessional` before they appear in `listProfessionals` -
      `verified` defaults to `false` and is never client-settable.
- [ ] Resources reviewed via `createResource`/`updateResource` and
      deliberately published via `setResourcePublished` - nothing is
      publicly readable until an admin flips that flag.
