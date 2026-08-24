-- =============================================================================
-- 1200 — Shareable duty-roster links.
--
-- The same idea as the wastage link, pointed the other way: instead of letting
-- an anonymous caller write one row, this lets them read one week of the
-- roster. Everything that makes that safe is in the function, not in the page:
--
--   * only PUBLISHED periods, mirroring the staff RLS policy exactly, so a
--     draft roster is no more visible through a printed QR code than it is in
--     the application;
--   * only a bounded window of weeks around today, so a leaked address cannot
--     be walked backwards through the restaurant's whole history;
--   * names, positions and shifts — never a contact number, an employee code,
--     a leave *type*, or anything else on the employee record.
-- =============================================================================

create table if not exists public.roster_links (
  id            uuid primary key default gen_random_uuid(),
  token         text not null unique,
  label         text not null,
  outlet_id     uuid references public.outlets(id) on delete set null,
  is_active     boolean not null default true,
  expires_at    timestamptz,
  -- How far either side of today the link will show. Two weeks back and four
  -- ahead covers "what am I on next month" without exposing the archive.
  weeks_back    integer not null default 2,
  weeks_ahead   integer not null default 4,
  -- Both off by default: a printed roster on a wall is read by anyone walking
  -- past it, so the extra detail is opt-in per link.
  show_hours    boolean not null default false,
  show_notes    boolean not null default false,
  view_count    integer not null default 0,
  last_viewed_at timestamptz,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  constraint roster_links_token_length check (char_length(token) between 16 and 64),
  constraint roster_links_window check (
    weeks_back between 0 and 26 and weeks_ahead between 0 and 26
  )
);
create index if not exists roster_links_token_idx on public.roster_links (token);
create index if not exists roster_links_outlet_idx on public.roster_links (outlet_id);
create index if not exists roster_links_active_idx on public.roster_links (is_active);

drop trigger if exists set_updated_at on public.roster_links;
create trigger set_updated_at before update on public.roster_links
  for each row execute function app.set_updated_at();

drop trigger if exists audit_trg on public.roster_links;
create trigger audit_trg after insert or update or delete on public.roster_links
  for each row execute function app.audit_row('ROSTER_LINK', 'roster');

-- -----------------------------------------------------------------------------
-- Privileges and RLS
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on public.roster_links to authenticated;
grant all on public.roster_links to service_role;
revoke all on public.roster_links from anon;

alter table public.roster_links enable row level security;

-- A token is a credential, so seeing one requires the permission to mint one.
drop policy if exists roster_links_read on public.roster_links;
create policy roster_links_read on public.roster_links
  for select to authenticated
  using (app.has_permission('roster.share'));
drop policy if exists roster_links_write on public.roster_links;
create policy roster_links_write on public.roster_links
  for all to authenticated
  using (app.has_permission('roster.share'))
  with check (app.has_permission('roster.share'));

-- =============================================================================
-- The public read path
-- =============================================================================

-- Resolves a token. Unknown, revoked and expired all return nothing, so a
-- guesser cannot tell which of the three they hit.
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
    app.restaurant_now()::date
  from public.roster_links l
  left join public.outlets o on o.id = l.outlet_id
  where l.token = p_token
    and l.is_active
    and (l.expires_at is null or l.expires_at > now())
    and app.module_enabled('roster');
$$;

-- One week of the published roster.
--
-- Volatile because it counts the view: a manager needs to know whether the
-- printed card by the time clock is being used at all, and whether an address
-- they thought was retired is still being opened.
create or replace function public.roster_share_week(p_token text, p_week_start date default null)
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

  -- Snap both the requested week and today's week to the configured week start.
  v_current := coalesce(p_week_start, v_today);
  v_start := v_current - ((extract(dow from v_current)::integer - v_dow + 7) % 7);
  v_first := (v_today - ((extract(dow from v_today)::integer - v_dow + 7) % 7))
             - (v_link.weeks_back * 7);
  v_last  := (v_today - ((extract(dow from v_today)::integer - v_dow + 7) % 7))
             + (v_link.weeks_ahead * 7);

  -- Outside the window the link simply has nothing to show. Returning empty
  -- rather than raising keeps a mistyped week from looking like a broken link.
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
    -- Exactly the condition in the staff RLS policy. A DRAFT roster is not
    -- visible through this link, and neither is a LOCKED one.
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

do $$
declare sig text;
begin
  foreach sig in array array[
    'public.roster_link_resolve(text)',
    'public.roster_share_week(text, date)'
  ] loop
    execute format('revoke all on function %s from public', sig);
    execute format('grant execute on function %s to anon, authenticated, service_role', sig);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- The permission to hand a roster out. Sensitive: it puts the published roster
-- behind an address rather than behind a login, which is a decision the Owner
-- should make deliberately.
-- -----------------------------------------------------------------------------
insert into public.permissions (key, name, description, module_key, category, is_active, is_sensitive, sort_order) values
  ('roster.share', 'Share the roster', 'Create and revoke public roster links', 'roster', 'roster', true, true, 17)
on conflict (key) do update set
  name = excluded.name, description = excluded.description, module_key = excluded.module_key,
  category = excluded.category, is_active = excluded.is_active,
  is_sensitive = excluded.is_sensitive, sort_order = excluded.sort_order;

-- The Roster Manager publishes and prints the roster, so they hold this too.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'roster.share'
where r.key = 'roster_manager'
on conflict do nothing;
