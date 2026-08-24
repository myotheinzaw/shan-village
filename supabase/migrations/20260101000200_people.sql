-- =============================================================================
-- 0200 — People: departments, positions, employees.
-- The employee master is shared: future modules (wastage, stock counts,
-- checklists, purchasing) reference `employees`, never their own copy.
-- =============================================================================

create table if not exists public.departments (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  description   text,
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);

-- Position master. Values seen in the Excel roster are seeded, but nothing is
-- hard-coded: the Admin can add, rename, reorder and deactivate positions.
create table if not exists public.positions (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  short_name    text,
  department_id uuid references public.departments(id) on delete set null,
  description   text,
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);
create index if not exists positions_department_idx on public.positions (department_id);
create index if not exists positions_active_idx on public.positions (is_active);

create table if not exists public.employees (
  id                    uuid primary key default gen_random_uuid(),
  employee_code         text not null unique,
  full_name             text not null,
  preferred_name        text,
  -- normalised name used for duplicate detection and Excel import matching
  name_key              text generated always as (lower(regexp_replace(full_name, '\s+', ' ', 'g'))) stored,
  position_id           uuid references public.positions(id) on delete set null,
  department_id         uuid references public.departments(id) on delete set null,
  outlet_id             uuid references public.outlets(id) on delete set null,
  employment_status     app.employment_status not null default 'FULL_TIME',
  join_date             date,
  end_date              date,
  mobile                text,
  email                 text,
  -- optional login. An employee can be rostered without ever having an account.
  profile_id            uuid unique references public.profiles(id) on delete set null,
  default_shift_id      uuid,   -- FK added in 0300 once shift_templates exists
  preferred_off_day     integer check (preferred_off_day between 0 and 6),
  weekly_hours_target   numeric(5,2) check (weekly_hours_target >= 0 and weekly_hours_target <= 168),
  photo_url             text,
  notes                 text,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  created_by            uuid,
  updated_at            timestamptz not null default now(),
  updated_by            uuid,
  constraint employees_dates_ordered check (end_date is null or join_date is null or end_date >= join_date)
);
create index if not exists employees_position_idx on public.employees (position_id);
create index if not exists employees_department_idx on public.employees (department_id);
create index if not exists employees_outlet_idx on public.employees (outlet_id);
create index if not exists employees_profile_idx on public.employees (profile_id);
create index if not exists employees_active_idx on public.employees (is_active);
create index if not exists employees_name_key_idx on public.employees (name_key);

-- Link back from profile to employee for convenience in the UI layer.
alter table public.profiles
  add column if not exists employee_id uuid references public.employees(id) on delete set null;
create index if not exists profiles_employee_idx on public.profiles (employee_id);
