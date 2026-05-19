create table public.status_history (
  id uuid default gen_random_uuid() primary key,
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null,
  changed_at timestamptz not null default now()
);

alter table public.status_history enable row level security;

create policy "Users can only access their own status history"
  on public.status_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index status_history_application_id_idx on public.status_history (application_id, changed_at desc);
