# Phase 1: Auth and profile migration

This folder is the first step of the migration away from Firebase.

## Goal

Replace the Firebase Auth + user profile flow with a Supabase-backed API layer.

## Included in this phase

- Supabase client configuration
- health endpoint
- auth user profile endpoint
- SQL schema for users and profiles

## Setup

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local` and fill in the values.
3. Run the SQL in `../supabase/schema.sql` in the Supabase SQL editor.
4. Run the app locally:

```bash
npm install
npm run dev
```

## API routes

- `GET /api/health`
- `GET /api/auth/me`

The `/api/auth/me` route expects a bearer token in the Authorization header.

## Next phases

- phase 2: check-ins, reflections, and plans
- phase 3: consultations and professionals
- phase 4: notifications, resources, and file uploads
