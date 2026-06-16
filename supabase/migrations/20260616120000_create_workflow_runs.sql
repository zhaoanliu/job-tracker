create table if not exists public.workflow_runs (
  id                    uuid         primary key default gen_random_uuid(),
  created_at            timestamptz  not null default now(),
  workflow_name         text         not null,
  run_id                text         not null,
  run_attempt           integer,
  job_name              text,
  branch                text,
  actor                 text,
  event_name            text,
  model                 text,
  sha                   text,
  cost_usd              numeric(10,6),
  input_tokens          integer,
  cache_read_tokens     integer,
  cache_creation_tokens integer,
  output_tokens         integer,
  num_turns             integer,
  max_turns             integer,
  hit_max_turns         boolean generated always as (
                          num_turns is not null
                          and max_turns is not null
                          and num_turns >= max_turns
                        ) stored,
  duration_seconds      integer,
  exit_code             integer,
  is_error              boolean
);

alter table public.workflow_runs enable row level security;
