create table if not exists public.reflections (
  id uuid primary key default uuid_generate_v4(),
  user_id text not null,
  content text not null,
  mood text,
  created_at timestamptz not null default now()
);

create table if not exists public.self_help_plans (
  id uuid primary key default uuid_generate_v4(),
  user_id text not null,
  title text not null,
  description text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.self_help_tasks (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid not null references public.self_help_plans(id) on delete cascade,
  title text not null,
  notes text,
  completed boolean not null default false,
  due_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_reflections_user_id on public.reflections (user_id);
create index if not exists idx_self_help_plans_user_id on public.self_help_plans (user_id);
create index if not exists idx_self_help_tasks_plan_id on public.self_help_tasks (plan_id);

alter table public.reflections enable row level security;
alter table public.self_help_plans enable row level security;
alter table public.self_help_tasks enable row level security;

create policy "Users can read own reflections" on public.reflections
for select using (auth.uid()::text = user_id);

create policy "Users can insert own reflections" on public.reflections
for insert with check (auth.uid()::text = user_id);

create policy "Users can delete own reflections" on public.reflections
for delete using (auth.uid()::text = user_id);

create policy "Users can read own plans" on public.self_help_plans
for select using (auth.uid()::text = user_id);

create policy "Users can insert own plans" on public.self_help_plans
for insert with check (auth.uid()::text = user_id);

create policy "Users can update own plans" on public.self_help_plans
for update using (auth.uid()::text = user_id);

create policy "Users can delete own plans" on public.self_help_plans
for delete using (auth.uid()::text = user_id);

create policy "Users can read own tasks" on public.self_help_tasks
for select using (
  exists (
    select 1 from public.self_help_plans p
    where p.id = plan_id and auth.uid()::text = p.user_id
  )
);

create policy "Users can insert own tasks" on public.self_help_tasks
for insert with check (
  exists (
    select 1 from public.self_help_plans p
    where p.id = plan_id and auth.uid()::text = p.user_id
  )
);

create policy "Users can update own tasks" on public.self_help_tasks
for update using (
  exists (
    select 1 from public.self_help_plans p
    where p.id = plan_id and auth.uid()::text = p.user_id
  )
);

create policy "Users can delete own tasks" on public.self_help_tasks
for delete using (
  exists (
    select 1 from public.self_help_plans p
    where p.id = plan_id and auth.uid()::text = p.user_id
  )
);
