-- =============================================================================
-- Development demo data.
--
-- DO NOT run this against production. It creates representative employees and
-- two weeks of roster modelled on the real duty roster, so the application can
-- be exercised end to end before any real data exists.
--
-- It creates NO user accounts and contains NO passwords. The first Owner
-- account is created with `node scripts/create-admin.mjs`, which reads
-- credentials from the environment.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Employees, drawn from the structure of the existing roster.
-- Real names are not used; positions, outlets and working patterns are.
-- -----------------------------------------------------------------------------
insert into public.employees
  (employee_code, full_name, preferred_name, position_id, department_id, outlet_id,
   employment_status, join_date, mobile, preferred_off_day, weekly_hours_target, is_active)
select
  v.code, v.name, v.preferred,
  (select id from public.positions where code = v.position),
  (select d.id from public.departments d
     join public.positions p on p.department_id = d.id
    where p.code = v.position),
  (select id from public.outlets where code = v.outlet),
  v.employment::app.employment_status, v.join_date::date, v.mobile,
  v.off_day, v.hours_target, true
from (values
  ('SV001', 'Aung Kyaw Moe',      'Aung',   'ADMIN_PURCHASING', 'MALL',         'FULL_TIME', '2024-02-01', '+971500000001', 5, 60.0),
  ('SV002', 'Htet Naing Win',     'Htet',   'TEAM_LEADER',      'MALL',         'FULL_TIME', '2023-11-15', '+971500000002', 3, 60.0),
  ('SV003', 'Su Myat Noe',        'Su',     'COMMIS',           'MALL',         'FULL_TIME', '2024-04-10', '+971500000003', 0, 60.0),
  ('SV004', 'Thura Zaw',          'Thura',  'COMMIS',           'MALL',         'FULL_TIME', '2024-06-01', '+971500000004', 2, 60.0),
  ('SV005', 'Zin Mar Aung',       'Zin',    'KITCHEN_HELPER',   'MALL',         'FULL_TIME', '2024-01-20', '+971500000005', 4, 60.0),
  ('SV006', 'Kyaw Soe Lin',       'Kyaw',   'KITCHEN_HELPER',   'MALL',         'FULL_TIME', '2025-01-05', '+971500000006', 1, 60.0),
  ('SV007', 'Nilar Htun',         'Nilar',  'CASHIER',          'MALL',         'FULL_TIME', '2024-08-12', '+971500000007', 6, 54.0),
  ('SV008', 'Wai Yan Phyo',       'Wai',    'CASHIER_PORTION',  'MALL',         'FULL_TIME', '2024-09-02', '+971500000008', 0, 54.0),
  ('SV009', 'Amina Rahman',       'Amina',  'STEWARDING',       'MALL',         'FULL_TIME', '2024-03-18', '+971500000009', 1, 54.0),
  ('SV010', 'Min Thant Sin',      'Min',    'CASHIER',          'NIGHT_MARKET', 'FULL_TIME', '2025-02-11', '+971500000010', 2, 54.0),
  ('SV011', 'Phyo Wai Aung',      'Phyo',   'KITCHEN_HELPER',   'NIGHT_MARKET', 'FULL_TIME', '2025-03-01', '+971500000011', 4, 54.0),
  ('SV012', 'Chit Su Wai',        'Chit',   'HELPER',           'NIGHT_MARKET', 'PART_TIME', '2025-05-20', '+971500000012', 3, 30.0)
) as v(code, name, preferred, position, outlet, employment, join_date, mobile, off_day, hours_target)
on conflict (employee_code) do nothing;

-- -----------------------------------------------------------------------------
-- Two weeks of roster: last week published and locked, this week published,
-- next week left as a draft so the builder has something to work on.
-- -----------------------------------------------------------------------------
do $$
declare
  v_this_week date := date_trunc('week', current_date)::date;  -- Postgres weeks start Monday
  v_last_week date := v_this_week - 7;
  v_next_week date := v_this_week + 7;
  v_period_last uuid;
  v_period_this uuid;
  v_period_next uuid;
begin
  insert into public.roster_periods (outlet_id, period_type, start_date, end_date, status, name)
  values (null, 'WEEK', v_last_week, v_last_week + 6, 'DRAFT', 'Demo — last week')
  on conflict do nothing;
  select id into v_period_last from public.roster_periods
   where start_date = v_last_week and period_type = 'WEEK' and outlet_id is null;

  insert into public.roster_periods (outlet_id, period_type, start_date, end_date, status, name)
  values (null, 'WEEK', v_this_week, v_this_week + 6, 'DRAFT', 'Demo — this week')
  on conflict do nothing;
  select id into v_period_this from public.roster_periods
   where start_date = v_this_week and period_type = 'WEEK' and outlet_id is null;

  insert into public.roster_periods (outlet_id, period_type, start_date, end_date, status, name)
  values (null, 'WEEK', v_next_week, v_next_week + 6, 'DRAFT', 'Demo — next week (draft)')
  on conflict do nothing;
  select id into v_period_next from public.roster_periods
   where start_date = v_next_week and period_type = 'WEEK' and outlet_id is null;

  -- A realistic rotation: each employee gets their preferred OFF day, an
  -- early or late shift depending on their position, and one split shift.
  insert into public.roster_assignments
    (period_id, employee_id, work_date, status, start_time, end_time, crosses_midnight,
     is_split, segment2_start, segment2_end, outlet_id, note)
  select
    p.period_id,
    e.id,
    p.start_date + offset_days,
    case
      when extract(dow from p.start_date + offset_days)::int = coalesce(e.preferred_off_day, 6) then 'OFF'
      else 'WORK'
    end::app.assignment_status,
    case
      when extract(dow from p.start_date + offset_days)::int = coalesce(e.preferred_off_day, 6) then null
      when pos.code in ('CASHIER', 'CASHIER_PORTION') and o.code = 'NIGHT_MARKET' then time '16:00'
      when offset_days % 3 = 0 then time '08:00'
      when offset_days % 3 = 1 then time '13:00'
      else time '09:00'
    end,
    case
      when extract(dow from p.start_date + offset_days)::int = coalesce(e.preferred_off_day, 6) then null
      when pos.code in ('CASHIER', 'CASHIER_PORTION') and o.code = 'NIGHT_MARKET' then time '02:00'
      when offset_days % 3 = 0 then time '18:00'
      when offset_days % 3 = 1 then time '00:00'
      else time '14:00'
    end,
    case
      when extract(dow from p.start_date + offset_days)::int = coalesce(e.preferred_off_day, 6) then false
      when pos.code in ('CASHIER', 'CASHIER_PORTION') and o.code = 'NIGHT_MARKET' then true
      when offset_days % 3 = 1 then true
      else false
    end,
    -- every third day for kitchen staff is a split shift, as in the source roster
    case
      when extract(dow from p.start_date + offset_days)::int = coalesce(e.preferred_off_day, 6) then false
      when offset_days % 3 = 2 and pos.code in ('COMMIS', 'KITCHEN_HELPER') then true
      else false
    end,
    case
      when offset_days % 3 = 2 and pos.code in ('COMMIS', 'KITCHEN_HELPER')
       and extract(dow from p.start_date + offset_days)::int <> coalesce(e.preferred_off_day, 6)
      then time '19:00' else null
    end,
    case
      when offset_days % 3 = 2 and pos.code in ('COMMIS', 'KITCHEN_HELPER')
       and extract(dow from p.start_date + offset_days)::int <> coalesce(e.preferred_off_day, 6)
      then time '00:00' else null
    end,
    e.outlet_id,
    null
  from public.employees e
  join public.positions pos on pos.id = e.position_id
  left join public.outlets o on o.id = e.outlet_id
  cross join (values (0), (1), (2), (3), (4), (5), (6)) as d(offset_days)
  cross join (
    select v_period_last as period_id, v_last_week as start_date
    union all select v_period_this, v_this_week
    union all select v_period_next, v_next_week
  ) as p
  where e.employee_code like 'SV%'
  on conflict (period_id, employee_id, work_date) do nothing;

  -- A public holiday and an approved leave block, so the roster shows more
  -- than working days and OFF days.
  update public.roster_assignments
     set status = 'PH', start_time = null, end_time = null, crosses_midnight = false,
         is_split = false, segment2_start = null, segment2_end = null
   where period_id = v_period_this
     and work_date = v_this_week + 4;

  update public.roster_assignments ra
     set status = 'LEAVE',
         leave_type_id = (select id from public.leave_types where code = 'ANNUAL'),
         start_time = null, end_time = null, crosses_midnight = false,
         is_split = false, segment2_start = null, segment2_end = null
   from public.employees e
  where ra.employee_id = e.id
    and e.employee_code = 'SV004'
    and ra.period_id = v_period_this;

  -- Publish and lock last week; publish this week; leave next week as a draft.
  update public.roster_periods
     set status = 'LOCKED', published_at = now(), locked_at = now()
   where id = v_period_last;
  update public.roster_periods
     set status = 'PUBLISHED', published_at = now()
   where id = v_period_this;
end $$;

-- -----------------------------------------------------------------------------
-- A couple of announcements so the staff home screen is not empty.
-- -----------------------------------------------------------------------------
insert into public.announcements (title, body, priority, audience, publish_at, is_published)
values
  ('Monthly staff meeting',
   E'The monthly staff meeting is on the first Monday of next month at 15:00 in the Mall outlet.\nPlease arrive five minutes early.',
   'HIGH', 'ALL', now(), true),
  ('Uniform reminder',
   'Clean uniform and closed shoes for every shift. Speak to the office if you need a replacement.',
   'NORMAL', 'ALL', now(), true)
on conflict do nothing;

commit;
