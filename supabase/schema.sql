create extension if not exists "uuid-ossp";

create table if not exists public.users (
  id uuid primary key default uuid_generate_v4(),
  uid text not null unique,
  email text,
  role text not null default 'student',
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key default uuid_generate_v4(),
  uid text not null unique references public.users(uid) on delete cascade,
  display_name text,
  bio text,
  avatar_url text,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.check_ins (
  id uuid primary key default uuid_generate_v4(),
  user_id text not null,
  mood text not null,
  notes text,
  tags text[] default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_check_ins_user_id on public.check_ins (user_id);
create index if not exists idx_profiles_uid on public.profiles (uid);

alter table public.users enable row level security;
alter table public.profiles enable row level security;
alter table public.check_ins enable row level security;

create policy "Users can read own user record" on public.users
for select using (auth.uid()::text = uid);

create policy "Users can update own user record" on public.users
for update using (auth.uid()::text = uid);

create policy "Users can read own profile" on public.profiles
for select using (auth.uid()::text = uid);

create policy "Users can update own profile" on public.profiles
for update using (auth.uid()::text = uid);

create policy "Users can insert own profile" on public.profiles
for insert with check (auth.uid()::text = uid);

create policy "Users can read own check-ins" on public.check_ins
for select using (auth.uid()::text = user_id);

create policy "Users can insert own check-ins" on public.check_ins
for insert with check (auth.uid()::text = user_id);

create policy "Users can update own check-ins" on public.check_ins
for update using (auth.uid()::text = user_id);

create policy "Users can delete own check-ins" on public.check_ins
for delete using (auth.uid()::text = user_id);
