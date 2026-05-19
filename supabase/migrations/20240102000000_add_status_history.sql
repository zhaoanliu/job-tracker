create table if not exists public.status_history (
  id uuid default gen_random_uuid() primary key,
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null,
  changed_at timestamptz not null default now()
);

alter table public.status_history enable row level security;

do $$
begin
  create policy "Users can only access their own status history"
    on public.status_history for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

create index if not exists status_history_application_id_idx on public.status_history (application_id, changed_at desc);
