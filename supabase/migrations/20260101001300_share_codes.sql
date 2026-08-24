-- =============================================================================
-- 1300 — A lock on the shared roster.
--
-- The roster link is now gated by a short access code. Three codes exist, one
-- per role, and the only thing the role decides is whether the Change Log is
-- readable: Owner and Admin see it, Chef does not. Nothing here can change the
-- roster — editing stays behind a real login, so every change keeps a named
-- person against it in the audit trail rather than "whoever knew the code".
--
-- Codes are stored as bcrypt hashes, never in plain text. A successful unlock
-- issues an opaque session token, and it is that token — not the code, and not
-- the link address — which the data functions demand. Holding the link address
-- alone therefore gets you nothing.
-- =============================================================================

do $$ begin
  create type app.share_role as enum ('OWNER', 'ADMIN', 'CHEF');
exception when duplicate_object then null; end $$;

alter table public.roster_links
  add column if not exists require_code boolean not null default true;

-- The resolve function now says whether a code is wanted. That is not a secret
-- — the lock screen is visible to anyone who opens the address — and saying so
-- plainly avoids the page having to infer it from an empty week, which an
-- unlocked link with nothing published would look exactly like.
drop function if exists public.roster_link_resolve(text);

create or replace function public.roster_link_resolve(p_token text)
returns table (
  link_id         uuid,
  label           text,
  outlet_id       uuid,
  outlet_name     text,
  restaurant_name text,
  timezone        text,
  week_start_day  integer,
  weeks_back      integer,
  weeks_ahead     integer,
  show_hours      boolean,
  show_notes      boolean,
  require_code    boolean,
  today           date
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    l.id,
    l.label,
    l.outlet_id,
    o.name,
    app.setting_text('restaurant_name', 'Shan Village'),
    app.setting_text('timezone', 'Asia/Dubai'),
    coalesce(nullif(app.setting_text('week_start_day', '1'), '')::integer, 1),
    l.weeks_back,
    l.weeks_ahead,
    l.show_hours,
    l.show_notes,
    l.require_code,
    app.restaurant_now()::date
  from public.roster_links l
  left join public.outlets o on o.id = l.outlet_id
  where l.token = p_token
    and l.is_active
    and (l.expires_at is null or l.expires_at > now())
    and app.module_enabled('roster');
$$;

revoke all on function public.roster_link_resolve(text) from public;
grant execute on function public.roster_link_resolve(text) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- The codes
-- -----------------------------------------------------------------------------
create table if not exists public.share_access_codes (
  id                  uuid primary key default gen_random_uuid(),
  role                app.share_role not null,
  label               text not null,
  -- bcrypt. The plain code is never stored, so a forgotten code is replaced
  -- rather than looked up.
  code_hash           text not null,
  -- "ShanOwner-…27": enough for an Admin to tell the three apart on screen,
  -- not enough to be a code.
  code_hint           text not null default '',
  can_view_change_log boolean not null default false,
  is_active           boolean not null default true,
  use_count           integer not null default 0,
  last_used_at        timestamptz,
  created_at          timestamptz not null default now(),
  created_by          uuid,
  updated_at          timestamptz not null default now(),
  updated_by          uuid
);
create unique index if not exists share_access_codes_role_idx
  on public.share_access_codes (role) where is_active;

-- -----------------------------------------------------------------------------
-- Attempts, so a code can be brute-forced only very slowly
-- -----------------------------------------------------------------------------
create table if not exists public.share_code_attempts (
  id           bigserial primary key,
  link_id      uuid references public.roster_links(id) on delete cascade,
  succeeded    boolean not null,
  attempted_at timestamptz not null default now()
);
create index if not exists share_code_attempts_recent_idx
  on public.share_code_attempts (link_id, attempted_at desc);

-- -----------------------------------------------------------------------------
-- Sessions issued on a correct code
-- -----------------------------------------------------------------------------
create table if not exists public.share_sessions (
  id                  uuid primary key default gen_random_uuid(),
  token               text not null unique,
  link_id             uuid not null references public.roster_links(id) on delete cascade,
  role                app.share_role not null,
  can_view_change_log boolean not null default false,
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null,
  last_seen_at        timestamptz
);
create index if not exists share_sessions_link_idx on public.share_sessions (link_id);
create index if not exists share_sessions_expiry_idx on public.share_sessions (expires_at);

do $$
declare t text;
begin
  foreach t in array array['share_access_codes'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function app.set_updated_at()', t);
  end loop;
end $$;

drop trigger if exists audit_trg on public.share_access_codes;
create trigger audit_trg after insert or update or delete on public.share_access_codes
  for each row execute function app.audit_row('SHARE_ACCESS_CODE', 'roster');

-- -----------------------------------------------------------------------------
-- Privileges and RLS
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on public.share_access_codes to authenticated;
grant all on public.share_access_codes, public.share_code_attempts, public.share_sessions
  to service_role;
grant usage, select on sequence public.share_code_attempts_id_seq to service_role;
revoke all on public.share_access_codes, public.share_code_attempts, public.share_sessions
  from anon;
-- Sessions and attempts are written only by the SECURITY DEFINER functions
-- below; no interactive role touches them directly.
revoke all on public.share_code_attempts, public.share_sessions from authenticated;

do $$
declare t text;
begin
  foreach t in array array['share_access_codes', 'share_code_attempts', 'share_sessions'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Only someone who may hand out a roster may see or change the codes — and the
-- hash is useless to them anyway.
drop policy if exists share_access_codes_read on public.share_access_codes;
create policy share_access_codes_read on public.share_access_codes
  for select to authenticated
  using (app.has_permission('roster.share'));
drop policy if exists share_access_codes_write on public.share_access_codes;
create policy share_access_codes_write on public.share_access_codes
  for all to authenticated
  using (app.has_permission('roster.share'))
  with check (app.has_permission('roster.share'));

-- share_code_attempts and share_sessions get no policy at all, which with RLS
-- enabled means no interactive role can read either one.

-- =============================================================================
-- Functions
-- =============================================================================

-- "ShanOwner-5027" -> "ShanOwner-…27". Shown to an Admin so they can tell the
-- three codes apart without the code being recoverable from the screen.
create or replace function app.code_hint(p_code text)
returns text
language sql
immutable
as $$
  select case
    when p_code is null or char_length(p_code) < 6 then '…'
    else left(p_code, greatest(char_length(p_code) - 6, 1)) || '…' || right(p_code, 2)
  end;
$$;

-- How many failures in the last quarter of an hour are tolerated on one link
-- before it stops answering. Ten is generous for a typo and hopeless for a
-- guesser: these codes have far more than ten plausible values.
create or replace function app.share_attempt_ceiling()
returns integer language sql immutable as $$ select 10 $$;

/**
 * Checks a code against a roster link and, when it matches, issues a session.
 *
 * Returns no row for a bad code, an unknown link, or a link that has had too
 * many failures recently — the caller cannot tell which, on purpose.
 */
create or replace function public.roster_unlock(p_token text, p_code text)
returns table (
  session_token       text,
  role                app.share_role,
  label               text,
  can_view_change_log boolean,
  expires_at          timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_link     public.roster_links%rowtype;
  v_code     public.share_access_codes%rowtype;
  v_failures integer;
  v_token    text;
  v_expires  timestamptz := now() + interval '12 hours';
begin
  select l.* into v_link
  from public.roster_links l
  where l.token = p_token
    and l.is_active
    and (l.expires_at is null or l.expires_at > now())
    and app.module_enabled('roster');

  if not found then
    return;
  end if;

  select count(*) into v_failures
  from public.share_code_attempts a
  where a.link_id = v_link.id
    and not a.succeeded
    and a.attempted_at > now() - interval '15 minutes';

  if v_failures >= app.share_attempt_ceiling() then
    return;
  end if;

  select c.* into v_code
  from public.share_access_codes c
  where c.is_active
    and c.code_hash = public.crypt(btrim(coalesce(p_code, '')), c.code_hash)
  limit 1;

  if not found then
    insert into public.share_code_attempts (link_id, succeeded) values (v_link.id, false);
    return;
  end if;

  insert into public.share_code_attempts (link_id, succeeded) values (v_link.id, true);

  v_token := replace(replace(encode(public.gen_random_bytes(24), 'base64'), '+', '-'), '/', '_');
  v_token := replace(v_token, '=', '');

  insert into public.share_sessions
    (token, link_id, role, can_view_change_log, expires_at)
  values
    (v_token, v_link.id, v_code.role, v_code.can_view_change_log, v_expires);

  update public.share_access_codes c
     set use_count = c.use_count + 1, last_used_at = now()
   where c.id = v_code.id;

  -- Housekeeping: a session nobody will present again is just a row.
  delete from public.share_sessions s where s.expires_at < now() - interval '7 days';

  return query select v_token, v_code.role, v_code.label, v_code.can_view_change_log, v_expires;
end;
$$;

/** Resolves a session cookie back to what it may see. */
create or replace function public.roster_session_resolve(p_token text, p_session text)
returns table (
  role                app.share_role,
  label               text,
  can_view_change_log boolean,
  expires_at          timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session public.share_sessions%rowtype;
begin
  select s.* into v_session
  from public.share_sessions s
  join public.roster_links l on l.id = s.link_id
  where s.token = p_session
    and s.expires_at > now()
    and l.token = p_token
    and l.is_active
    and (l.expires_at is null or l.expires_at > now());

  if not found then
    return;
  end if;

  update public.share_sessions s set last_seen_at = now() where s.id = v_session.id;

  return query
  select v_session.role,
         coalesce((select c.label from public.share_access_codes c
                   where c.role = v_session.role and c.is_active), v_session.role::text),
         v_session.can_view_change_log,
         v_session.expires_at;
end;
$$;

-- -----------------------------------------------------------------------------
-- The week, now behind the lock.
--
-- Replaces the two-argument version from migration 1200: a link that requires a
-- code must not answer without a valid session, and the old signature had no
-- way to present one.
-- -----------------------------------------------------------------------------
drop function if exists public.roster_share_week(text, date);

create or replace function public.roster_share_week(
  p_token text,
  p_week_start date default null,
  p_session text default null
)
returns table (
  work_date        date,
  employee_id      uuid,
  employee_name    text,
  position_name    text,
  outlet_name      text,
  status           app.assignment_status,
  start_time       time,
  end_time         time,
  crosses_midnight boolean,
  is_split         boolean,
  segment2_start   time,
  segment2_end     time,
  scheduled_hours  numeric,
  note             text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_link    public.roster_links%rowtype;
  v_today   date := app.restaurant_now()::date;
  v_dow     integer := coalesce(nullif(app.setting_text('week_start_day', '1'), '')::integer, 1);
  v_start   date;
  v_current date;
  v_first   date;
  v_last    date;
begin
  select l.* into v_link
  from public.roster_links l
  where l.token = p_token
    and l.is_active
    and (l.expires_at is null or l.expires_at > now())
    and app.module_enabled('roster');

  if not found then
    return;
  end if;

  -- The lock. A link that requires a code answers only to a live session.
  if v_link.require_code
     and not exists (select 1 from public.roster_session_resolve(p_token, p_session))
  then
    return;
  end if;

  v_current := coalesce(p_week_start, v_today);
  v_start := v_current - ((extract(dow from v_current)::integer - v_dow + 7) % 7);
  v_first := (v_today - ((extract(dow from v_today)::integer - v_dow + 7) % 7))
             - (v_link.weeks_back * 7);
  v_last  := (v_today - ((extract(dow from v_today)::integer - v_dow + 7) % 7))
             + (v_link.weeks_ahead * 7);

  if v_start < v_first or v_start > v_last then
    return;
  end if;

  update public.roster_links l
     set view_count = l.view_count + 1,
         last_viewed_at = now()
   where l.id = v_link.id;

  return query
  select
    a.work_date,
    e.id,
    coalesce(nullif(btrim(e.preferred_name), ''), e.full_name),
    coalesce(p.short_name, p.name, ''),
    coalesce(ao.name, po.name, ''),
    a.status,
    a.start_time,
    a.end_time,
    a.crosses_midnight,
    a.is_split,
    a.segment2_start,
    a.segment2_end,
    case when v_link.show_hours then a.scheduled_hours else null end,
    case when v_link.show_notes then coalesce(a.note, '') else '' end
  from public.roster_assignments a
  join public.roster_periods rp on rp.id = a.period_id
  join public.employees e on e.id = a.employee_id
  left join public.positions p on p.id = coalesce(a.position_id, e.position_id)
  left join public.outlets ao on ao.id = a.outlet_id
  left join public.outlets po on po.id = rp.outlet_id
  where a.work_date between v_start and v_start + 6
    and rp.status = 'PUBLISHED'
    and (
      v_link.outlet_id is null
      or coalesce(a.outlet_id, rp.outlet_id) = v_link.outlet_id
    )
  order by
    coalesce(p.sort_order, 999),
    coalesce(nullif(btrim(e.preferred_name), ''), e.full_name),
    a.work_date;
end;
$$;

-- -----------------------------------------------------------------------------
-- The Change Log — Owner and Admin only.
--
-- Reads the same append-only audit trail the Administration screen reads, and
-- shows only what a roster reader needs: when, who, and which shift moved. The
-- before/after JSON never leaves the database.
-- -----------------------------------------------------------------------------
create or replace function public.roster_share_change_log(
  p_token text,
  p_session text,
  p_limit integer default 50
)
returns table (
  changed_at   timestamptz,
  actor        text,
  action       text,
  entity       text,
  employee_name text,
  work_date    date,
  summary      text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_link  public.roster_links%rowtype;
  v_ok    boolean;
  v_since timestamptz := now() - interval '60 days';
begin
  select l.* into v_link
  from public.roster_links l
  where l.token = p_token
    and l.is_active
    and (l.expires_at is null or l.expires_at > now())
    and app.module_enabled('roster');

  if not found then
    return;
  end if;

  select r.can_view_change_log into v_ok
  from public.roster_session_resolve(p_token, p_session) r;

  if not coalesce(v_ok, false) then
    return;
  end if;

  return query
  select
    al.created_at,
    coalesce(pr.full_name, al.actor_email, 'System'),
    al.action,
    case al.entity_type
      when 'ROSTER_ASSIGNMENT'  then 'Shift'
      when 'ROSTER_PERIOD'      then 'Roster week'
      when 'ROSTER_PUBLICATION' then 'Publication'
      else al.entity_type
    end,
    coalesce(nullif(btrim(e.preferred_name), ''), e.full_name, ''),
    nullif(coalesce(al.new_value ->> 'work_date', al.old_value ->> 'work_date'), '')::date,
    case
      when al.action = 'INSERT' then 'Added'
      when al.action = 'DELETE' then 'Removed'
      when al.old_value ->> 'status' is distinct from al.new_value ->> 'status'
        then format('%s → %s',
                    coalesce(al.old_value ->> 'status', '—'),
                    coalesce(al.new_value ->> 'status', '—'))
      when al.old_value ->> 'start_time' is distinct from al.new_value ->> 'start_time'
        or al.old_value ->> 'end_time' is distinct from al.new_value ->> 'end_time'
        then format('%s–%s → %s–%s',
                    coalesce(al.old_value ->> 'start_time', '—'),
                    coalesce(al.old_value ->> 'end_time', '—'),
                    coalesce(al.new_value ->> 'start_time', '—'),
                    coalesce(al.new_value ->> 'end_time', '—'))
      else 'Changed'
    end
  from public.audit_logs al
  left join public.profiles pr on pr.id = al.actor_id
  left join public.employees e on e.id = al.employee_id
  where al.module_key = 'roster'
    and al.entity_type in ('ROSTER_ASSIGNMENT', 'ROSTER_PERIOD', 'ROSTER_PUBLICATION')
    and al.created_at >= v_since
  order by al.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

do $$
declare sig text;
begin
  foreach sig in array array[
    'public.roster_unlock(text, text)',
    'public.roster_session_resolve(text, text)',
    'public.roster_share_week(text, date, text)',
    'public.roster_share_change_log(text, text, integer)'
  ] loop
    execute format('revoke all on function %s from public', sig);
    execute format('grant execute on function %s to anon, authenticated, service_role', sig);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- The three codes.
--
-- Seeded once. Changing one later is done from Administration, which rehashes
-- it; this block deliberately does not overwrite a code that already exists, so
-- re-running the migrations never resets a code the Owner has changed.
-- -----------------------------------------------------------------------------
insert into public.share_access_codes (role, label, code_hash, code_hint, can_view_change_log)
select v.role::app.share_role, v.label,
       public.crypt(v.code, public.gen_salt('bf', 10)),
       app.code_hint(v.code),
       v.change_log
from (values
  ('OWNER', 'Owner', 'ShanOwner-5027', true),
  ('ADMIN', 'Admin', 'ShanAdmin-4713', true),
  ('CHEF',  'Chef',  'ShanChef-8264',  false)
) as v(role, label, code, change_log)
where not exists (
  select 1 from public.share_access_codes c where c.role = v.role::app.share_role
);

-- -----------------------------------------------------------------------------
-- Changing a code.
--
-- Hashing has to happen in the database — the plain code must not be written
-- anywhere, and pgcrypto is here. Changing a code also ends every session that
-- was opened with it, which is what "change the code" has to mean if it is to
-- be the answer to a code that has got out.
-- -----------------------------------------------------------------------------
create or replace function public.share_code_set(p_role text, p_code text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_role app.share_role;
  v_code text := btrim(coalesce(p_code, ''));
begin
  if not app.has_permission('roster.share') then
    raise exception 'You do not have permission to change the access codes'
      using errcode = 'insufficient_privilege';
  end if;

  begin
    v_role := p_role::app.share_role;
  exception when others then
    raise exception 'Unknown role "%"', p_role using errcode = 'check_violation';
  end;

  if char_length(v_code) < 8 then
    raise exception 'An access code must be at least 8 characters'
      using errcode = 'check_violation';
  end if;

  -- Two roles sharing a code would make the Change Log permission meaningless.
  if exists (
    select 1 from public.share_access_codes c
    where c.is_active and c.role <> v_role
      and c.code_hash = public.crypt(v_code, c.code_hash)
  ) then
    raise exception 'That code is already in use by another role'
      using errcode = 'unique_violation';
  end if;

  update public.share_access_codes c
     set code_hash = public.crypt(v_code, public.gen_salt('bf', 10)),
         code_hint = app.code_hint(v_code),
         updated_by = auth.uid()
   where c.role = v_role and c.is_active;

  if not found then
    raise exception 'There is no active code for %', p_role using errcode = 'no_data_found';
  end if;

  delete from public.share_sessions s where s.role = v_role;
end;
$$;

revoke all on function public.share_code_set(text, text) from public;
grant execute on function public.share_code_set(text, text) to authenticated, service_role;
