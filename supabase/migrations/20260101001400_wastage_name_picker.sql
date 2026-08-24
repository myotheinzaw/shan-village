-- =============================================================================
-- 1400 — Let a reporter pick their name from the staff list.
--
-- Typing a name works, but it produces "Win Paing", "win paing " and "W.Paing"
-- for one person — the exact defect the Phase 1 importer had to clean out of
-- the old spreadsheet. Offering the list fixes the spelling at the source and,
-- more usefully, matches the entry to the real employee row, so a staff member
-- with a login can see their own entries.
--
-- The list is names and positions only, gated on a valid link token, and can be
-- switched off per link for a card in a place where the staff list should not
-- be readable.
-- =============================================================================

alter table public.wastage_links
  add column if not exists show_staff_list boolean not null default true;

-- -----------------------------------------------------------------------------
-- The form options now carry the staff list as a third kind.
-- -----------------------------------------------------------------------------
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
  union all
  -- Name and position, nothing else from the employee record.
  select 'EMPLOYEE'::text,
         e.id,
         coalesce(p.short_name, p.name, ''),
         coalesce(nullif(btrim(e.preferred_name), ''), e.full_name),
         0
  from public.employees e
  left join public.positions p on p.id = e.position_id
  where e.is_active
    and exists (
      select 1 from public.wastage_links l
      where l.token = p_token and l.is_active and l.show_staff_list
        and (l.expires_at is null or l.expires_at > now())
    )
    and exists (select 1 from public.wastage_link_resolve(p_token))
  order by 1, 5, 4;
$$;

-- -----------------------------------------------------------------------------
-- Submitting, now with an optional employee behind the name.
-- -----------------------------------------------------------------------------
drop function if exists public.wastage_submit(
  text, text, text, text, date, time, uuid, uuid, numeric, text, numeric, text, text, integer);

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
  p_photo_size      integer default null,
  p_employee_id     uuid default null
)
returns table (id uuid, reference text, entry_date date, entry_time time)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_link     public.wastage_links%rowtype;
  v_now      timestamp := app.restaurant_now();
  v_date     date;
  v_time     time;
  v_outlet   uuid;
  v_recent   integer;
  v_employee uuid;
  v_name     text := btrim(coalesce(p_reported_by, ''));
  v_entry    public.wastage_entries%rowtype;
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

  -- A chosen name beats a typed one: take the employee's own spelling, so the
  -- report groups by person rather than by however it was typed that day. An
  -- id that is not an active employee is ignored rather than trusted.
  if p_employee_id is not null and v_link.show_staff_list then
    select e.id, coalesce(nullif(btrim(e.preferred_name), ''), e.full_name)
      into v_employee, v_name
    from public.employees e
    where e.id = p_employee_id and e.is_active;
  end if;

  if v_link.require_name and char_length(v_name) = 0 then
    raise exception 'Please enter your name.' using errcode = 'check_violation';
  end if;

  v_date := coalesce(p_entry_date, v_now::date);
  if v_date > v_now::date or v_date < v_now::date - 7 then
    v_date := v_now::date;
  end if;
  v_time := coalesce(p_entry_time, v_now::time);

  v_outlet := coalesce(v_link.outlet_id, p_outlet_id);

  insert into public.wastage_entries (
    entry_date, entry_time, outlet_id, reported_by_name, employee_id, item_name,
    quantity, unit, reason_id, estimated_value, currency, note,
    photo_path, photo_mime, photo_size, status, source, link_id
  ) values (
    v_date, v_time, v_outlet, v_name, v_employee,
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

do $$
declare sig text;
begin
  foreach sig in array array[
    'public.wastage_form_options(text)',
    'public.wastage_submit(text, text, text, text, date, time, uuid, uuid, numeric, text, numeric, text, text, integer, uuid)'
  ] loop
    execute format('revoke all on function %s from public', sig);
    execute format('grant execute on function %s to anon, authenticated, service_role', sig);
  end loop;
end $$;
