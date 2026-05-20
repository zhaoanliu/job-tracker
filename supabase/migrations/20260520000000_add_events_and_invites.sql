-- Track invite emails sent by users
create table if not exists public.invites (
  id           uuid        default gen_random_uuid() primary key,
  sender_id    uuid        not null references auth.users(id) on delete cascade,
  recipient    text        not null,
  created_at   timestamptz not null default now()
);

create index if not exists invites_sender_id_idx on public.invites (sender_id, created_at desc);

alter table public.invites enable row level security;

do $$
begin
  create policy "Users can only access their own invites"
    on public.invites for all
    using  (auth.uid() = sender_id)
    with check (auth.uid() = sender_id);
exception when duplicate_object then null;
end $$;

-- Track behavioural events (drag-and-drop, filter, CSV import, etc.)
create table if not exists public.events (
  id           uuid        default gen_random_uuid() primary key,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  event_name   text        not null,
  metadata     jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists events_user_id_name_idx  on public.events (user_id, event_name, created_at desc);
create index if not exists events_created_at_idx    on public.events (created_at desc);

alter table public.events enable row level security;

do $$
begin
  -- Users can insert their own events; no self-serve reads (admin reads via service role)
  create policy "Users can insert their own events"
    on public.events for insert
    with check (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;
