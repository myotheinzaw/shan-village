-- =============================================================================
-- Shan Village Operations Management System
-- 0100 — Platform core: schemas, identity, access control, modules, settings,
--        audit, notifications, outlets.
-- These objects are shared by every current and future module.
-- =============================================================================

create extension if not exists pgcrypto;

-- `app` holds helper functions used by RLS policies and triggers.
create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Reusable enum types
-- -----------------------------------------------------------------------------
do $$ begin
  create type app.roster_status as enum ('DRAFT', 'PUBLISHED', 'LOCKED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.assignment_status as enum ('WORK', 'OFF', 'PH', 'LEAVE', 'TRIAL', 'OTHER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.request_status as enum (
    'DRAFT', 'SUBMITTED', 'MANAGER_REVIEWED', 'APPROVED',
    'REJECTED', 'RETURNED', 'CANCELLED', 'PAID', 'CLOSED'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.employment_status as enum ('FULL_TIME', 'PART_TIME', 'CASUAL', 'TRIAL', 'CONTRACT');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- modules — the module registry. Navigation and route guards read this table.
-- -----------------------------------------------------------------------------
create table if not exists public.modules (
  key           text primary key,
  name          text not null,
  description   text,
  icon          text,
  is_enabled    boolean not null default false,
  -- `core` and `roster` are structural; they cannot be disabled from the UI.
  is_core       boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);

-- -----------------------------------------------------------------------------
-- profiles — 1:1 with auth.users. Never store passwords here.
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  full_name     text not null default '',
  is_active     boolean not null default true,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);
create index if not exists profiles_email_idx on public.profiles (lower(email));
create index if not exists profiles_active_idx on public.profiles (is_active);

-- -----------------------------------------------------------------------------
-- roles / permissions / grants
-- -----------------------------------------------------------------------------
create table if not exists public.roles (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,
  name          text not null,
  description   text,
  -- system roles cannot be deleted; `admin` additionally cannot be edited
  is_system     boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);

create table if not exists public.permissions (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,
  name          text not null,
  description   text,
  module_key    text not null references public.modules(key) on update cascade,
  category      text not null default 'general',
  -- future-module permissions are seeded inactive so the vocabulary is stable
  -- but grants nothing until the module and permission are both switched on.
  is_active     boolean not null default true,
  -- financial permissions are called out so the UI can warn before granting
  is_sensitive  boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists permissions_module_idx on public.permissions (module_key);

create table if not exists public.role_permissions (
  role_id       uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  primary key (role_id, permission_id)
);
create index if not exists role_permissions_permission_idx on public.role_permissions (permission_id);

create table if not exists public.user_roles (
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  role_id       uuid not null references public.roles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  primary key (profile_id, role_id)
);
create index if not exists user_roles_role_idx on public.user_roles (role_id);

-- Per-user overrides layered on top of roles. `granted = false` is a revoke and
-- always wins over a role grant.
create table if not exists public.user_permissions (
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  granted       boolean not null default true,
  reason        text,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  primary key (profile_id, permission_id)
);
create index if not exists user_permissions_permission_idx on public.user_permissions (permission_id);

-- -----------------------------------------------------------------------------
-- outlets — shared location master (Mall, Night Market, Mangoon, Good Luck)
-- -----------------------------------------------------------------------------
create table if not exists public.outlets (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  short_name    text,
  address       text,
  timezone      text not null default 'Asia/Dubai',
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);

-- -----------------------------------------------------------------------------
-- app_settings — typed key/value configuration. No business rule is hard-coded
-- in application code; it is read from here.
-- -----------------------------------------------------------------------------
create table if not exists public.app_settings (
  key           text primary key,
  value         jsonb not null,
  data_type     text not null check (data_type in ('string', 'number', 'boolean', 'json')),
  label         text not null,
  description   text,
  category      text not null default 'general',
  -- is_public settings are safe to expose to any signed-in user (e.g. timezone)
  is_public     boolean not null default false,
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);

-- -----------------------------------------------------------------------------
-- audit_logs — append only. There is deliberately no UPDATE or DELETE policy on
-- this table for any role, including admin.
-- -----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id            bigserial primary key,
  actor_id      uuid references public.profiles(id) on delete set null,
  actor_email   text,
  action        text not null,
  entity_type   text not null,
  entity_id     text,
  employee_id   uuid,
  module_key    text,
  summary       text,
  old_value     jsonb,
  new_value     jsonb,
  reason        text,
  ip_address    text,
  created_at    timestamptz not null default now()
);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id);
create index if not exists audit_logs_employee_idx on public.audit_logs (employee_id);

-- -----------------------------------------------------------------------------
-- notifications — in-app inbox. Transport-agnostic: an email or WhatsApp
-- dispatcher can later consume unsent rows without a schema change.
-- -----------------------------------------------------------------------------
create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  type          text not null,
  title         text not null,
  body          text,
  link          text,
  priority      text not null default 'NORMAL' check (priority in ('LOW', 'NORMAL', 'HIGH')),
  read_at       timestamptz,
  -- set by a future external dispatcher; null means "in-app only, not sent out"
  dispatched_at timestamptz,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists notifications_profile_idx on public.notifications (profile_id, read_at, created_at desc);
