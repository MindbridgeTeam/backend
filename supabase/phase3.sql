create table if not exists public.professionals (
  id uuid primary key default uuid_generate_v4(),
  uid text not null unique,
  display_name text not null,
  bio text,
  specialties text[] default '{}',
  verified boolean not null default false,
  availability jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.consultation_requests (
  id uuid primary key default uuid_generate_v4(),
  student_id text not null,
  professional_id text,
  status text not null default 'SUBMITTED',
  reason text,
  urgency text not null default 'medium',
  status_history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.consultations (
  id uuid primary key default uuid_generate_v4(),
  request_id uuid not null unique references public.consultation_requests(id) on delete cascade,
  student_id text not null,
  professional_id text not null,
  status text not null default 'APPROVED',
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.consultation_outcomes (
  id uuid primary key default uuid_generate_v4(),
  consultation_id uuid not null unique references public.consultations(id) on delete cascade,
  student_id text not null,
  professional_id text not null,
  summary text not null,
  recommendations text,
  follow_up_required boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.professional_reviews (
  id uuid primary key default uuid_generate_v4(),
  professional_id text not null,
  student_id text not null,
  consultation_id uuid not null references public.consultations(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists idx_consultation_requests_student on public.consultation_requests(student_id);
create index if not exists idx_consultation_requests_professional on public.consultation_requests(professional_id);
create index if not exists idx_consultations_student on public.consultations(student_id);
create index if not exists idx_consultations_professional on public.consultations(professional_id);
create index if not exists idx_professional_reviews_professional on public.professional_reviews(professional_id);

alter table public.professionals enable row level security;
alter table public.consultation_requests enable row level security;
alter table public.consultations enable row level security;
alter table public.consultation_outcomes enable row level security;
alter table public.professional_reviews enable row level security;

create policy "Anyone signed in can read professionals" on public.professionals
for select using (auth.uid() is not null);

create policy "Professionals can update own profile" on public.professionals
for update using (auth.uid()::text = uid);

create policy "Users can read own consultation requests" on public.consultation_requests
for select using (auth.uid()::text = student_id or auth.uid()::text = professional_id);

create policy "Students can create own consultation requests" on public.consultation_requests
for insert with check (auth.uid()::text = student_id);

create policy "Users can read own consultations" on public.consultations
for select using (auth.uid()::text = student_id or auth.uid()::text = professional_id);

create policy "Users can read own consultation outcomes" on public.consultation_outcomes
for select using (auth.uid()::text = student_id or auth.uid()::text = professional_id);

create policy "Users can read own professional reviews" on public.professional_reviews
for select using (auth.uid()::text = student_id or auth.uid()::text = professional_id);

create policy "Students can create reviews after consultation" on public.professional_reviews
for insert with check (auth.uid()::text = student_id);
