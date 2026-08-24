-- =============================================================================
-- 0450 — Announcements and the Excel import staging area.
-- =============================================================================

create table if not exists public.announcements (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  body          text not null,
  priority      text not null default 'NORMAL' check (priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  -- ALL | MANAGEMENT | OUTLET | POSITION
  audience      text not null default 'ALL' check (audience in ('ALL', 'MANAGEMENT', 'OUTLET', 'POSITION')),
  outlet_id     uuid references public.outlets(id) on delete cascade,
  position_id   uuid references public.positions(id) on delete cascade,
  publish_at    timestamptz not null default now(),
  expires_at    timestamptz,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id) on delete set null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  constraint announcements_window check (expires_at is null or expires_at > publish_at)
);
create index if not exists announcements_window_idx on public.announcements (is_published, publish_at, expires_at);

-- -----------------------------------------------------------------------------
-- Excel import — staged in two tables so an Admin reviews the parse result
-- before anything reaches the roster. Nothing is written to roster_assignments
-- until the batch is explicitly committed.
-- -----------------------------------------------------------------------------
create table if not exists public.import_batches (
  id                uuid primary key default gen_random_uuid(),
  file_name         text not null,
  source            text not null default 'EXCEL_ROSTER',
  status            text not null default 'PARSED'
                    check (status in ('PARSED', 'REVIEWING', 'COMMITTED', 'CANCELLED', 'FAILED')),
  sheet_count       integer not null default 0,
  total_rows        integer not null default 0,
  recognized_rows   integer not null default 0,
  review_rows       integer not null default 0,
  error_rows        integer not null default 0,
  -- unmatched employee names, unknown shift strings, missing positions, etc.
  summary           jsonb not null default '{}'::jsonb,
  notes             text,
  committed_at      timestamptz,
  committed_by      uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles(id) on delete set null,
  updated_at        timestamptz not null default now(),
  updated_by        uuid
);
create index if not exists import_batches_status_idx on public.import_batches (status, created_at desc);

create table if not exists public.import_records (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid not null references public.import_batches(id) on delete cascade,
  sheet_name        text not null,
  row_number        integer,
  column_label      text,
  -- exactly what the cell contained, never modified
  source_value      text,
  source_name       text,
  source_position   text,
  work_date         date,
  parse_status      text not null default 'OK'
                    check (parse_status in ('OK', 'REVIEW', 'ERROR', 'SKIPPED')),
  parse_message     text,
  -- the structured interpretation the parser produced
  parsed            jsonb not null default '{}'::jsonb,
  matched_employee_id uuid references public.employees(id) on delete set null,
  matched_position_id uuid references public.positions(id) on delete set null,
  matched_outlet_id   uuid references public.outlets(id) on delete set null,
  -- an Admin can correct a REVIEW row before committing
  resolved_status   app.assignment_status,
  is_included       boolean not null default true,
  created_at        timestamptz not null default now()
);
create index if not exists import_records_batch_idx on public.import_records (batch_id, parse_status);
create index if not exists import_records_date_idx on public.import_records (work_date);
