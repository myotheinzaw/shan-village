-- =============================================================================
-- 1000 — Wastage: privileges, RLS, and the public submission path.
--
-- The public link is the only place in this system where an unauthenticated
-- caller may write anything. That is done the narrow way:
--
--   * `anon` keeps its blanket revoke — it can reach no wastage table directly.
--   * Three SECURITY DEFINER functions are granted to `anon`, and nothing else.
--     They sit in `public` because that is the only schema PostgREST exposes.
--     They take a link token, verify it is active and unexpired, and expose only
--     what the form needs to render plus one INSERT.
--   * The functions fix `source`, `status` and `link_id` themselves, so a caller
--     cannot post an entry that claims to have come from management, nor
--     pre-approve their own entry.
--   * Each link carries its own hourly ceiling, so one leaked token is a
--     revocable nuisance rather than an open write endpoint.
-- =============================================================================

-- Table privileges. The 0600 grants were a point-in-time ALL TABLES statement;
-- tables created afterwards need their own.
grant select, insert, update, delete on
  public.wastage_reasons, public.wastage_links, public.wastage_entries, public.wastage_exports
  to authenticated;
grant all on
  public.wastage_reasons, public.wastage_links, public.wastage_entries, public.wastage_exports
  to service_role;
revoke all on
  public.wastage_reasons, public.wastage_links, public.wastage_entries, public.wastage_exports
  from anon;

do $$
declare t text;
begin
  foreach t in array array[
    'wastage_reasons', 'wastage_links', 'wastage_entries', 'wastage_exports'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- wastage_reasons — readable by any signed-in user (the staff app offers them),
-- editable with wastage.manage.
-- -----------------------------------------------------------------------------
drop policy if exists wastage_reasons_read on public.wastage_reasons;
create policy wastage_reasons_read on public.wastage_reasons
  for select to authenticated using (true);
drop policy if exists wastage_reasons_write on public.wastage_reasons;
create policy wastage_reasons_write on public.wastage_reasons
  for all to authenticated
  using (app.has_permission('wastage.manage'))
  with check (app.has_permission('wastage.manage'));

-- -----------------------------------------------------------------------------
-- wastage_links — a token is a credential. Only someone who may manage or view
-- the module sees one at all, and only wastage.manage may mint or revoke.
-- -----------------------------------------------------------------------------
drop policy if exists wastage_links_read on public.wastage_links;
create policy wastage_links_read on public.wastage_links
  for select to authenticated
  using (app.has_permission('wastage.manage') or app.has_permission('wastage.view'));
drop policy if exists wastage_links_write on public.wastage_links;
create policy wastage_links_write on public.wastage_links
  for all to authenticated
  using (app.has_permission('wastage.manage'))
  with check (app.has_permission('wastage.manage'));

-- -----------------------------------------------------------------------------
-- wastage_entries
--
-- Read: wastage.view, or your own entries (an entry matched to your employee
-- record). Write: wastage.create to add, wastage.approve to review.
--
-- Deleting has a permission of its own, `wastage.delete`, which no role holds
-- by default — not even the Roster Manager who runs the module day to day. A
-- wastage log anyone can prune is not a record of anything, and rejecting an
-- entry already covers the honest case. An admin can still delete, because
-- app.has_permission() short-circuits for admins.
-- -----------------------------------------------------------------------------
drop policy if exists wastage_entries_read on public.wastage_entries;
create policy wastage_entries_read on public.wastage_entries
  for select to authenticated
  using (
    app.has_permission('wastage.view')
    or (employee_id is not null and employee_id = app.current_employee_id())
  );

drop policy if exists wastage_entries_insert on public.wastage_entries;
create policy wastage_entries_insert on public.wastage_entries
  for insert to authenticated
  with check (app.has_permission('wastage.create'));

drop policy if exists wastage_entries_update on public.wastage_entries;
create policy wastage_entries_update on public.wastage_entries
  for update to authenticated
  using (app.has_permission('wastage.approve') or app.has_permission('wastage.manage'))
  with check (app.has_permission('wastage.approve') or app.has_permission('wastage.manage'));

drop policy if exists wastage_entries_delete on public.wastage_entries;
create policy wastage_entries_delete on public.wastage_entries
  for delete to authenticated
  using (app.has_permission('wastage.delete'));

-- -----------------------------------------------------------------------------
-- wastage_exports — the Drive delivery record.
-- -----------------------------------------------------------------------------
drop policy if exists wastage_exports_read on public.wastage_exports;
create policy wastage_exports_read on public.wastage_exports
  for select to authenticated
  using (app.has_permission('wastage.view') or app.has_permission('wastage.export'));
drop policy if exists wastage_exports_write on public.wastage_exports;
create policy wastage_exports_write on public.wastage_exports
  for all to authenticated
  using (app.has_permission('wastage.export'))
  with check (app.has_permission('wastage.export'));

-- =============================================================================
-- The public submission path
-- =============================================================================

-- A text setting, for the functions below. app.setting_bool already exists.
create or replace function app.setting_text(p_key text, p_default text default '')
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select s.value #>> '{}' from public.app_settings s where s.key = p_key),
    p_default
  );
$$;

-- "Now" as the restaurant experiences it. Every default date and time on a
-- wastage entry comes from here, never from the database server's clock.
create or replace function app.restaurant_now()
returns timestamp
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone app.setting_text('timezone', 'Asia/Dubai'))::timestamp;
$$;

grant execute on function
  app.setting_text(text, text), app.setting_bool(text, boolean), app.restaurant_now()
  to anon, authenticated, service_role;

-- Resolves a link token. Returns no row for an unknown, revoked, expired or
-- module-disabled link, so the form cannot tell those cases apart — which is
-- the point: a token guesser learns nothing.
create or replace function public.wastage_link_resolve(p_token text)
returns table (
  link_id         uuid,
  label           text,
  outlet_id       uuid,
  outlet_name     text,
  require_name    boolean,
  require_photo   boolean,
  require_reason  boolean,
  restaurant_name text,
  timezone        text,
  currency        text,
  today           date,
  now_time        time
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
    l.require_name,
    app.setting_bool('wastage_require_photo', false),
    app.setting_bool('wastage_require_reason', false),
    app.setting_text('restaurant_name', 'Shan Village'),
    app.setting_text('timezone', 'Asia/Dubai'),
    app.setting_text('currency', 'AED'),
    app.restaurant_now()::date,
    app.restaurant_now()::time
  from public.wastage_links l
  left join public.outlets o on o.id = l.outlet_id
  where l.token = p_token
    and l.is_active
    and (l.expires_at is null or l.expires_at > now())
    and app.module_enabled('wastage');
$$;

-- The reason list and the outlet list, both gated on a valid token so neither
-- is readable without one.
create or replace function public.wastage_form_options(p_token text)
returns table (kind text, id uuid, code text, name text, sort_order integer)
language sql
stable
security definer
set search_path = ''
as $$
  select 'REASON'::text, r.id, r.code, r.name, r.sort_order
  from public.wastage_reasons r
  where r.is_active
    and exists (select 1 from public.wastage_link_resolve(p_token))
  union all
  select 'OUTLET'::text, o.id, o.code, o.name, o.sort_order
  from public.outlets o
  where o.is_active
    and exists (select 1 from public.wastage_link_resolve(p_token))
  order by 1, 5, 4;
$$;

-- The one write an anonymous caller may perform.
create or replace function public.wastage_submit(
  p_token           text,
  p_reported_by     text default '',
  p_item_name       text default '',
  p_note            text default '',
  p_entry_date      date default null,
  p_entry_time      time default null,
  p_outlet_id       uuid default null,
  p_reason_id       uuid default null,
  p_quantity        numeric default null,
  p_unit            text default null,
  p_estimated_value numeric default null,
  p_photo_path      text default null,
  p_photo_mime      text default null,
  p_photo_size      integer default null
)
returns table (id uuid, reference text, entry_date date, entry_time time)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_link    public.wastage_links%rowtype;
  v_now     timestamp := app.restaurant_now();
  v_date    date;
  v_time    time;
  v_outlet  uuid;
  v_recent  integer;
  v_entry   public.wastage_entries%rowtype;
begin
  select l.* into v_link
  from public.wastage_links l
  where l.token = p_token
    and l.is_active
    and (l.expires_at is null or l.expires_at > now())
    and app.module_enabled('wastage');

  if not found then
    raise exception 'This wastage link is no longer active. Ask your manager for the current link.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_link.hourly_limit > 0 then
    select count(*) into v_recent
    from public.wastage_entries e
    where e.link_id = v_link.id
      and e.created_at > now() - interval '1 hour';
    if v_recent >= v_link.hourly_limit then
      raise exception 'This link has reached its hourly limit. Try again later.'
        using errcode = 'too_many_rows';
    end if;
  end if;

  if v_link.require_name and char_length(btrim(coalesce(p_reported_by, ''))) = 0 then
    raise exception 'Please enter your name.' using errcode = 'check_violation';
  end if;

  -- The reporter may correct the date and time, but never to the future and
  -- never further back than a week: a wastage log is a record of today.
  v_date := coalesce(p_entry_date, v_now::date);
  if v_date > v_now::date or v_date < v_now::date - 7 then
    v_date := v_now::date;
  end if;
  v_time := coalesce(p_entry_time, v_now::time);

  -- A link tied to an outlet decides the outlet; only a general link lets the
  -- reporter choose one.
  v_outlet := coalesce(v_link.outlet_id, p_outlet_id);

  insert into public.wastage_entries (
    entry_date, entry_time, outlet_id, reported_by_name, item_name, quantity, unit,
    reason_id, estimated_value, currency, note, photo_path, photo_mime, photo_size,
    status, source, link_id
  ) values (
    v_date, v_time, v_outlet,
    btrim(coalesce(p_reported_by, '')),
    btrim(coalesce(p_item_name, '')),
    p_quantity,
    nullif(btrim(coalesce(p_unit, '')), ''),
    p_reason_id,
    p_estimated_value,
    app.setting_text('currency', 'AED'),
    btrim(coalesce(p_note, '')),
    p_photo_path, p_photo_mime, p_photo_size,
    'SUBMITTED', 'PUBLIC_LINK', v_link.id
  )
  returning * into v_entry;

  update public.wastage_links l
     set submission_count = l.submission_count + 1,
         last_used_at = now()
   where l.id = v_link.id;

  return query select v_entry.id, v_entry.reference, v_entry.entry_date, v_entry.entry_time;
end;
$$;

-- These three live in `public` rather than `app` because PostgREST only
-- exposes functions in the API schema, and the public form reaches them over
-- the REST endpoint. EXECUTE is revoked from PUBLIC first so the grant below is
-- the whole of the access list, rather than an addition to Postgres's default.
do $$
declare sig text;
begin
  foreach sig in array array[
    'public.wastage_link_resolve(text)',
    'public.wastage_form_options(text)',
    'public.wastage_submit(text, text, text, text, date, time, uuid, uuid, numeric, text, numeric, text, text, integer)'
  ] loop
    execute format('revoke all on function %s from public', sig);
    execute format('grant execute on function %s to anon, authenticated, service_role', sig);
  end loop;
end $$;
