-- =============================================================================
-- 0300 — Roster: shift templates, periods, assignments, publications, staffing.
--
-- TIME MODEL (important, and the reason the Excel data needed converting):
--   * start_time / end_time are plain `time` values.
--   * The Excel roster writes midnight and beyond as 24:00 / 24:30, and also
--     writes 15:00 - 2:00. Both mean "ends the next day". Neither is storable
--     as a plain time, so both normalise to the next-day clock time plus
--     crosses_midnight = true:  24:30 -> 00:30 + crosses, 2:00 -> 02:00 + crosses.
--   * A split shift stores segment 1 in start_time/end_time (never crosses) and
--     segment 2 in segment2_start/segment2_end. crosses_midnight then refers to
--     segment 2, which is the only segment that can run past midnight.
-- =============================================================================

create table if not exists public.shift_templates (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  name              text not null,
  kind              app.assignment_status not null default 'WORK',
  outlet_id         uuid references public.outlets(id) on delete set null,
  colour            text,
  start_time        time,
  end_time          time,
  break_minutes     integer not null default 0 check (break_minutes >= 0 and break_minutes < 1440),
  crosses_midnight  boolean not null default false,
  is_split          boolean not null default false,
  segment2_start    time,
  segment2_end      time,
  notes             text,
  is_active         boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz not null default now(),
  updated_by        uuid,
  -- a working template must have times; a non-working one (OFF/PH/LEAVE) must not
  constraint shift_templates_work_has_times
    check (kind <> 'WORK' or (start_time is not null and end_time is not null)),
  constraint shift_templates_non_work_has_no_times
    check (kind = 'WORK' or (start_time is null and end_time is null and is_split = false)),
  constraint shift_templates_split_has_segment2
    check (is_split = false or (segment2_start is not null and segment2_end is not null)),
  constraint shift_templates_segment2_only_when_split
    check (is_split = true or (segment2_start is null and segment2_end is null))
);
create index if not exists shift_templates_kind_idx on public.shift_templates (kind, is_active);

alter table public.employees
  drop constraint if exists employees_default_shift_fk;
alter table public.employees
  add constraint employees_default_shift_fk
  foreign key (default_shift_id) references public.shift_templates(id) on delete set null;

-- -----------------------------------------------------------------------------
-- roster_periods — one publishable unit of roster (a week, or a month).
-- -----------------------------------------------------------------------------
create table if not exists public.roster_periods (
  id                uuid primary key default gen_random_uuid(),
  outlet_id         uuid references public.outlets(id) on delete restrict,
  period_type       text not null default 'WEEK' check (period_type in ('WEEK', 'MONTH')),
  start_date        date not null,
  end_date          date not null,
  name              text,
  status            app.roster_status not null default 'DRAFT',
  notes             text,
  published_at      timestamptz,
  published_by      uuid references public.profiles(id) on delete set null,
  locked_at         timestamptz,
  locked_by         uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz not null default now(),
  updated_by        uuid,
  constraint roster_periods_dates_ordered check (end_date >= start_date)
);
-- one roster per outlet per period start. `coalesce` keeps the all-outlets
-- (outlet_id is null) roster unique too, which a plain unique index would not.
create unique index if not exists roster_periods_unique_idx
  on public.roster_periods (coalesce(outlet_id, '00000000-0000-0000-0000-000000000000'::uuid), period_type, start_date);
create index if not exists roster_periods_range_idx on public.roster_periods (start_date, end_date);
create index if not exists roster_periods_status_idx on public.roster_periods (status);

-- -----------------------------------------------------------------------------
-- roster_assignments — one employee on one date. The operational heart.
--
-- Times are resolved onto the row rather than only referenced through
-- shift_template_id, so editing a template later can never silently rewrite
-- history that has already been published.
-- -----------------------------------------------------------------------------
create table if not exists public.roster_assignments (
  id                uuid primary key default gen_random_uuid(),
  period_id         uuid not null references public.roster_periods(id) on delete cascade,
  employee_id       uuid not null references public.employees(id) on delete cascade,
  work_date         date not null,
  status            app.assignment_status not null default 'WORK',
  shift_template_id uuid references public.shift_templates(id) on delete set null,
  start_time        time,
  end_time          time,
  break_minutes     integer not null default 0 check (break_minutes >= 0 and break_minutes < 1440),
  crosses_midnight  boolean not null default false,
  is_split          boolean not null default false,
  segment2_start    time,
  segment2_end      time,
  -- overrides: the Excel roster shows people covering another outlet (MANGOON)
  -- or another position (a K.H rostered as "Cashier") for a single day.
  outlet_id         uuid references public.outlets(id) on delete set null,
  position_id       uuid references public.positions(id) on delete set null,
  leave_type_id     uuid,   -- FK added in 0400 once leave_types exists
  leave_request_id  uuid,   -- FK added in 0400
  note              text,
  -- provenance for imported rows: the original cell text, kept for audit
  source_value      text,
  import_batch_id   uuid,
  scheduled_hours   numeric(5,2) generated always as (
    app.compute_scheduled_hours(status, start_time, end_time, break_minutes,
                                crosses_midnight, is_split, segment2_start, segment2_end)
  ) stored,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz not null default now(),
  updated_by        uuid,
  constraint roster_assignments_unique unique (period_id, employee_id, work_date),
  constraint roster_assignments_work_times
    check (status <> 'WORK' or start_time is not null),
  constraint roster_assignments_split_has_segment2
    check (is_split = false or (segment2_start is not null and segment2_end is not null)),
  constraint roster_assignments_segment2_only_when_split
    check (is_split = true or (segment2_start is null and segment2_end is null))
);
create index if not exists roster_assignments_period_idx on public.roster_assignments (period_id);
create index if not exists roster_assignments_employee_date_idx on public.roster_assignments (employee_id, work_date);
create index if not exists roster_assignments_date_idx on public.roster_assignments (work_date);
create index if not exists roster_assignments_status_idx on public.roster_assignments (status);
create index if not exists roster_assignments_import_idx on public.roster_assignments (import_batch_id);

-- -----------------------------------------------------------------------------
-- roster_publications — publish / unpublish / lock / unlock history
-- -----------------------------------------------------------------------------
create table if not exists public.roster_publications (
  id            uuid primary key default gen_random_uuid(),
  period_id     uuid not null references public.roster_periods(id) on delete cascade,
  action        text not null check (action in ('PUBLISH', 'UNPUBLISH', 'LOCK', 'UNLOCK', 'REPUBLISH')),
  note          text,
  reason        text,
  actor_id      uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists roster_publications_period_idx on public.roster_publications (period_id, created_at desc);

-- -----------------------------------------------------------------------------
-- staffing_requirements — configurable minimum coverage. Nothing about
-- staffing levels is hard-coded in application code.
-- day_of_week: 0 = Sunday .. 6 = Saturday; null = every day.
-- -----------------------------------------------------------------------------
create table if not exists public.staffing_requirements (
  id            uuid primary key default gen_random_uuid(),
  outlet_id     uuid references public.outlets(id) on delete cascade,
  position_id   uuid references public.positions(id) on delete cascade,
  department_id uuid references public.departments(id) on delete cascade,
  day_of_week   integer check (day_of_week between 0 and 6),
  min_staff     integer not null default 1 check (min_staff >= 0),
  label         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  -- a rule must target either a position or a department, not neither
  constraint staffing_requirements_target
    check (position_id is not null or department_id is not null)
);
create index if not exists staffing_requirements_outlet_idx on public.staffing_requirements (outlet_id, day_of_week);
