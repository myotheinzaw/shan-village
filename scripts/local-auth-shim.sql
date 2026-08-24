-- =============================================================================
-- Local-only shim that reproduces the parts of Supabase the migrations depend
-- on (the auth schema, auth.uid(), and the anon/authenticated/service_role
-- database roles) so the real migrations and the real RLS policies can be run
-- and tested against a plain PostgreSQL server.
--
-- This file is NEVER applied to Supabase — Supabase provides all of it.
-- =============================================================================

do $$ begin create role anon nologin;          exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- Identical in behaviour to Supabase's own definitions.
-- These mirror Supabase's own definitions, including the nullif() guard that
-- makes an unset or empty claims GUC resolve to NULL rather than raising.
create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(nullif(auth.jwt() ->> 'role', ''), 'anon');
$$;

create or replace function auth.email() returns text
language sql stable as $$
  select nullif(auth.jwt() ->> 'email', '');
$$;

grant execute on function auth.jwt, auth.uid, auth.role, auth.email to anon, authenticated, service_role;
