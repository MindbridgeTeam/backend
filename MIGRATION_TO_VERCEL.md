# Free-tier migration plan: Firebase to Vercel + Supabase

## Why this migration is necessary

This backend is tightly coupled to Firebase services:

- Firebase Admin initialization in [functions/src/config/firebase.ts](functions/src/config/firebase.ts)
- Firestore rules in [firestore.rules](firestore.rules)
- Storage triggers in [functions/src/users/storageTriggers.ts](functions/src/users/storageTriggers.ts)
- Cloud Functions export registry in [functions/src/index.ts](functions/src/index.ts)

Those services are what force the project to require paid Firebase billing. To stay on the free tier, the application needs to move off Firebase backend services and onto a free-compatible stack.

## Target architecture

- Frontend: Vercel
- API: Vercel serverless functions or Next.js API routes
- Database: Supabase Postgres
- Auth: Supabase Auth or Firebase Auth only if needed
- File storage: Supabase Storage or a free external file host
- Realtime notifications: Supabase Realtime or a lightweight polling strategy

## Main migration changes

### 1) Replace Firebase Cloud Functions

Each callable Firebase function becomes:

- Vercel route /api/... OR
- Next.js API route

Examples from the current backend:

- createCheckIn
- getMyCheckIns
- submitConsultationRequest
- sendMessage
- listProfessionals
- createResource

These should be ported to server route handlers with the same request/response envelope used today.

### 2) Replace Firestore with Supabase

Map the existing collections to Postgres tables or JSONB-backed tables.

Example mapping:

- users -> users
- profiles -> profiles
- checkIns -> check_ins
- reflections -> reflections
- consultations -> consultations
- professionals -> professionals
- notifications -> notifications

Use Row Level Security (RLS) to replace the Firestore rules logic.

### 3) Remove Firebase Storage dependency

The project currently includes storage triggers and bucket-based avatar handling:

- [functions/src/users/storageTriggers.ts](functions/src/users/storageTriggers.ts)
- [storage.rules](storage.rules)

Remove or replace with:

- Supabase Storage
- direct URL upload to a file host
- avatar fields stored as public/private URLs

### 4) Replace custom claims with Supabase roles / app logic

The current backend depends on Firebase custom claims for role-based access:

- student
- professional
- admin
- ngo

In Supabase, use:

- user profiles table with role column
- server-side role checks in API routes
- RLS policies by user role

### 5) Replace App Check with server-side validation

Current code checks App Check in [functions/src/middleware/appCheck.ts](functions/src/middleware/appCheck.ts).

For Vercel:

- use API route middleware
- validate signed JWTs from Supabase Auth
- enforce role checks inside each API route
- add rate limiting with Vercel middleware or a Redis/Upstash layer

---

## Recommended migration sequence

### Phase 1 - project setup

- Create a Vercel project
- Create a Supabase project
- Create the main tables and schemas
- Add env variables

### Phase 2 - auth migration

- move auth to Supabase Auth or keep Firebase Auth separately
- replace custom claims logic with role checks in DB

### Phase 3 - API migration

- move functions one domain at a time
- preserve the current response envelope: { success, data, error }

### Phase 4 - data migration

- import existing Firestore records to Supabase
- validate ownership and role relationships
- test edge cases before switching traffic

### Phase 5 - remove Firebase dependency

- delete Cloud Functions deployment config
- remove Firebase Storage usage
- remove App Check dependency

---

## Free-tier constraint

This project is not a lightweight app. It is a Firebase backend with:

- role-based server logic
- transaction/state machine code
- resource publishing rules
- notifications
- file upload support

That means a free-tier migration is technically possible, but it is a real backend rewrite, not a tiny config tweak.

---

## Best next step

The fastest cost-free migration is to keep the frontend and business logic shape, but rebuild the backend around Vercel + Supabase.

We should do this in batches:

1. auth + user profile
2. check-ins + reflections + plans
3. consultations + professionals + reviews
4. notifications + resources
5. file uploads + avatar handling

---

## Estimated work

- 2 to 4 days for a working v1 migration if the app is limited to the current backend features
- longer if we keep all edge cases and role rules exactly matching Firebase behavior

## Recommended starting point

Start by porting the user/auth layer and the simplest write paths, then move upward to consultations and chat.
