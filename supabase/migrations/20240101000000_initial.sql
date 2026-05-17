-- Job Tracker: initial schema
-- Run with: supabase db push  (or paste into the Supabase SQL editor)

create table if not exists applications (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        references auth.users not null,
  company     text        not null,
  role        text,
  status      text        not null default 'future',
  type        text,
  priority    text        not null default 'Medium',
  location    text,
  workmode    text        not null default 'Hybrid',
  date        date,
  link        text,
  source      text        not null default 'LinkedIn',
  referrer    text,
  notes       text,
  next_step   text,
  jd          text,
  "order"     integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Indexes for common query patterns
create index if not exists applications_user_id_status_idx  on applications (user_id, status);
create index if not exists applications_user_id_order_idx   on applications (user_id, "order");
create index if not exists applications_user_id_created_idx on applications (user_id, created_at desc);

-- Row Level Security: users can only access their own rows
alter table applications enable row level security;

create policy "Users can only access their own applications"
  on applications
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Auto-update updated_at on any row change
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger applications_updated_at
  before update on applications
  for each row
  execute procedure update_updated_at();
