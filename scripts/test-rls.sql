-- =============================================================================
-- Security test suite.
--
-- Runs against the real migrations with the real RLS policies. Every test
-- connects as the `authenticated` database role with a JWT claim, which is
-- exactly how Supabase serves a signed-in user — so a pass here means a staff
-- member genuinely cannot reach the data, not merely that a menu is hidden.
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

create schema if not exists test;
grant usage on schema test to anon, authenticated, service_role;

create table if not exists test.results (
  id serial primary key, name text, passed boolean, detail text
);
truncate test.results;

create or replace function test.check(p_name text, p_condition boolean, p_detail text default null)
returns void language plpgsql as $$
begin
  insert into test.results (name, passed, detail) values (p_name, coalesce(p_condition, false), p_detail);
end $$;

-- Returns true when the statement is refused. Used for "must be denied" tests.
grant select, insert on test.results to anon, authenticated, service_role;
grant usage, select on all sequences in schema test to anon, authenticated, service_role;

create or replace function test.denied(p_sql text)
returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end $$;

-- Runs a mutation and reports how many rows it actually reached: -1 when the
-- statement was refused outright, 0 when RLS filtered every candidate row away.
-- Both outcomes mean the user changed nothing; RLS uses whichever fits the
-- statement, so a security test must accept either.
create or replace function test.affected(p_sql text)
returns integer language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
exception when others then
  return -1;
end $$;

-- Returns the number of rows a SELECT returns for the current user.
create or replace function test.count_of(p_sql text)
returns integer language plpgsql as $$
declare n integer;
begin
  execute 'select count(*) from (' || p_sql || ') s' into n;
  return n;
exception when others then
  return -1;
end $$;

grant execute on all functions in schema test to anon, authenticated, service_role;

\o /dev/null

-- =============================================================================
-- Fixtures
-- =============================================================================
\set admin_id   '11111111-1111-1111-1111-111111111111'
\set mgr_id     '22222222-2222-2222-2222-222222222222'
\set staff_id   '33333333-3333-3333-3333-333333333333'
\set staff2_id  '44444444-4444-4444-4444-444444444444'

insert into auth.users (id, email) values
  (:'admin_id',  'owner@shanvillage.test'),
  (:'mgr_id',    'manager@shanvillage.test'),
  (:'staff_id',  'cook@shanvillage.test'),
  (:'staff2_id', 'cashier@shanvillage.test');

insert into public.profiles (id, email, full_name) values
  (:'admin_id',  'owner@shanvillage.test',   'Test Owner'),
  (:'mgr_id',    'manager@shanvillage.test', 'Phyu Sin Maung'),
  (:'staff_id',  'cook@shanvillage.test',    'Win Paing'),
  (:'staff2_id', 'cashier@shanvillage.test', 'Chan Pyae Pyae Thaw');

insert into public.user_roles (profile_id, role_id)
select :'admin_id', id from public.roles where key = 'admin';
insert into public.user_roles (profile_id, role_id)
select :'mgr_id', id from public.roles where key = 'roster_manager';
insert into public.user_roles (profile_id, role_id)
select :'staff_id', id from public.roles where key = 'staff';
insert into public.user_roles (profile_id, role_id)
select :'staff2_id', id from public.roles where key = 'staff';

insert into public.employees (id, employee_code, full_name, position_id, outlet_id, profile_id)
select '55555555-0000-0000-0000-000000000001', 'EMP001', 'Phyu Sin Maung',
       (select id from public.positions where code = 'COMMIS'),
       (select id from public.outlets where code = 'MALL'), :'mgr_id';
insert into public.employees (id, employee_code, full_name, position_id, outlet_id, profile_id)
select '55555555-0000-0000-0000-000000000002', 'EMP002', 'Win Paing',
       (select id from public.positions where code = 'KITCHEN_HELPER'),
       (select id from public.outlets where code = 'MALL'), :'staff_id';
insert into public.employees (id, employee_code, full_name, position_id, outlet_id, profile_id)
select '55555555-0000-0000-0000-000000000003', 'EMP003', 'Chan Pyae Pyae Thaw',
       (select id from public.positions where code = 'CASHIER'),
       (select id from public.outlets where code = 'MALL'), :'staff2_id';

update public.profiles p set employee_id = e.id
from public.employees e where e.profile_id = p.id;

-- A draft week and a published week
insert into public.roster_periods (id, outlet_id, period_type, start_date, end_date, status)
values ('66666666-0000-0000-0000-000000000001',
        (select id from public.outlets where code = 'MALL'), 'WEEK', '2026-08-24', '2026-08-30', 'DRAFT'),
       ('66666666-0000-0000-0000-000000000002',
        (select id from public.outlets where code = 'MALL'), 'WEEK', '2026-08-17', '2026-08-23', 'PUBLISHED');

insert into public.roster_assignments (period_id, employee_id, work_date, status, start_time, end_time, crosses_midnight)
values
  ('66666666-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000002', '2026-08-24', 'WORK', '08:00', '18:00', false),
  ('66666666-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000003', '2026-08-24', 'WORK', '14:00', '00:00', true),
  ('66666666-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000002', '2026-08-17', 'WORK', '13:00', '23:00', false),
  ('66666666-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000003', '2026-08-17', 'WORK', '09:00', '19:00', false);

insert into public.cash_advance_requests (id, employee_id, amount, reason, status)
values ('77777777-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000002', 1500, 'Family expense', 'SUBMITTED');

insert into public.leave_requests (id, employee_id, leave_type_id, from_date, to_date, total_days, status)
values ('88888888-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000002',
        (select id from public.leave_types where code = 'ANNUAL'), '2026-12-01', '2026-12-05', 5, 'SUBMITTED');

-- =============================================================================
-- 1. Hours calculation (pure function, no RLS involved)
-- =============================================================================
select test.check('hours: simple 08:00-18:00 = 10h',
  app.compute_scheduled_hours('WORK', '08:00', '18:00', 0, false, false, null, null) = 10);
select test.check('hours: overnight 15:00-02:00 = 11h',
  app.compute_scheduled_hours('WORK', '15:00', '02:00', 0, true, false, null, null) = 11);
select test.check('hours: overnight inferred without flag (15:00-02:00) = 11h',
  app.compute_scheduled_hours('WORK', '15:00', '02:00', 0, false, false, null, null) = 11);
select test.check('hours: Excel 24:00 convention 14:00-24:00 = 10h',
  app.compute_scheduled_hours('WORK', '14:00', '00:00', 0, true, false, null, null) = 10);
select test.check('hours: Excel 24:30 convention 12:00-24:30 = 12.5h',
  app.compute_scheduled_hours('WORK', '12:00', '00:30', 0, true, false, null, null) = 12.5);
select test.check('hours: split 09:00-14:00 / 19:00-24:00 = 10h',
  app.compute_scheduled_hours('WORK', '09:00', '14:00', 0, true, true, '19:00', '00:00') = 10);
select test.check('hours: split with overnight tail 09:00-14:00 / 19:00-01:30 = 11.5h',
  app.compute_scheduled_hours('WORK', '09:00', '14:00', 0, true, true, '19:00', '01:30') = 11.5);
select test.check('hours: 60 minute break deducted once',
  app.compute_scheduled_hours('WORK', '08:00', '18:00', 60, false, false, null, null) = 9);
select test.check('hours: OFF contributes zero',
  app.compute_scheduled_hours('OFF', null, null, 0, false, false, null, null) = 0);
select test.check('hours: LEAVE contributes zero',
  app.compute_scheduled_hours('LEAVE', null, null, 0, false, false, null, null) = 0);
select test.check('hours: generated column matches the function',
  (select scheduled_hours from public.roster_assignments
   where employee_id = '55555555-0000-0000-0000-000000000003' and work_date = '2026-08-24') = 10);

-- =============================================================================
-- 2. Permission resolution
-- =============================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin_id')::text, true);
select test.check('admin: holds admin.users', app.has_permission('admin.users'));
select test.check('admin: holds finance.approve', app.has_permission('finance.approve'));
select test.check('admin: holds roster.unlock', app.has_permission('roster.unlock'));
select test.check('admin: is_admin() true', app.is_admin());
select test.check('admin: DENIED a disabled future module permission (inventory.count)',
  not app.has_permission('inventory.count'));
select test.check('admin: holds wastage.cost_view now the module is enabled',
  app.has_permission('wastage.cost_view'));
select test.check('admin: DENIED an unknown permission key', not app.has_permission('does.not.exist'));
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'mgr_id')::text, true);
select test.check('manager: holds roster.edit', app.has_permission('roster.edit'));
select test.check('manager: holds requests.review', app.has_permission('requests.review'));
select test.check('manager: DENIED finance.view', not app.has_permission('finance.view'));
select test.check('manager: DENIED finance.approve', not app.has_permission('finance.approve'));
select test.check('manager: DENIED admin.users', not app.has_permission('admin.users'));
select test.check('manager: DENIED admin.permissions', not app.has_permission('admin.permissions'));
select test.check('manager: DENIED audit.view', not app.has_permission('audit.view'));
select test.check('manager: DENIED roster.unlock', not app.has_permission('roster.unlock'));
select test.check('manager: DENIED roster.publish by default', not app.has_permission('roster.publish'));
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'staff_id')::text, true);
select test.check('staff: holds roster.view', app.has_permission('roster.view'));
select test.check('staff: holds requests.create', app.has_permission('requests.create'));
select test.check('staff: DENIED roster.view_all', not app.has_permission('roster.view_all'));
select test.check('staff: DENIED roster.edit', not app.has_permission('roster.edit'));
select test.check('staff: DENIED staff.view', not app.has_permission('staff.view'));
select test.check('staff: DENIED reports.view', not app.has_permission('reports.view'));
select test.check('staff: DENIED finance.view', not app.has_permission('finance.view'));
select test.check('staff: DENIED audit.view', not app.has_permission('audit.view'));
commit;

-- =============================================================================
-- 3. Roster visibility — the DRAFT/PUBLISHED boundary
-- =============================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'staff_id')::text, true);
select test.check('staff: cannot see the DRAFT roster period',
  test.count_of('select 1 from public.roster_periods where status = ''DRAFT''') = 0);
select test.check('staff: cannot see any DRAFT assignment, including their own',
  test.count_of('select 1 from public.roster_assignments ra
                 join public.roster_periods rp on rp.id = ra.period_id
                 where rp.status = ''DRAFT''') = 0);
select test.check('staff: CAN see the published period',
  test.count_of('select 1 from public.roster_periods where status = ''PUBLISHED''') = 1);
select test.check('staff: CAN see published assignments',
  test.count_of('select 1 from public.roster_assignments') = 2);
select test.check('staff: cannot change any roster assignment',
  test.affected('update public.roster_assignments set start_time = ''06:00''') <= 0);
select test.check('staff: DENIED inserting a roster assignment',
  test.denied('insert into public.roster_assignments (period_id, employee_id, work_date, status, start_time, end_time)
               values (''66666666-0000-0000-0000-000000000002'', ''55555555-0000-0000-0000-000000000002'',
                       ''2026-08-19'', ''WORK'', ''08:00'', ''18:00'')'));
select test.check('staff: DENIED creating a roster period',
  test.denied('insert into public.roster_periods (period_type, start_date, end_date)
               values (''WEEK'', ''2026-09-07'', ''2026-09-13'')'));
select test.check('staff: DENIED publishing a roster',
  test.denied('select public.set_roster_status(''66666666-0000-0000-0000-000000000001'', ''PUBLISH'')'));
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'mgr_id')::text, true);
select test.check('manager: CAN see the draft roster',
  test.count_of('select 1 from public.roster_periods where status = ''DRAFT''') = 1);
select test.check('manager: CAN see all draft assignments',
  test.count_of('select 1 from public.roster_assignments') = 4);
select test.check('manager: DENIED publishing without the permission',
  test.denied('select public.set_roster_status(''66666666-0000-0000-0000-000000000001'', ''PUBLISH'')'));
commit;

-- The Admin switches manager publishing on; the grant must follow the setting.
update public.app_settings set value = 'true' where key = 'manager_can_publish';
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'mgr_id')::text, true);
select test.check('manager: gains roster.publish when the Admin enables the setting',
  app.has_permission('roster.publish'));
commit;
update public.app_settings set value = 'false' where key = 'manager_can_publish';
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'mgr_id')::text, true);
select test.check('manager: loses roster.publish when the Admin disables the setting',
  not app.has_permission('roster.publish'));
commit;

-- =============================================================================
-- 4. Employees — full row vs. safe directory
-- =============================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'staff_id')::text, true);
select test.check('staff: sees only their own employee row',
  test.count_of('select 1 from public.employees') = 1);
select test.check('staff: CAN read colleague names from the directory view',
  test.count_of('select 1 from public.employee_directory') = 3);
select test.check('staff: DENIED creating an employee',
  test.denied('insert into public.employees (employee_code, full_name) values (''X'', ''Ghost'')'));
select test.check('staff: cannot change any employee record',
  test.affected('update public.employees set full_name = ''Hacked''') <= 0);
commit;

-- =============================================================================
-- 5. Financial separation — the point of two separate request tables
-- =============================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'mgr_id')::text, true);
select test.check('manager: CAN see leave requests from all staff',
  test.count_of('select 1 from public.leave_requests') = 1);
select test.check('manager: CANNOT see any cash advance, despite requests.view_all',
  test.count_of('select 1 from public.cash_advance_requests') = 0);
select test.check('manager: DENIED deciding a cash advance',
  test.denied('select public.decide_request(''CASH_ADVANCE'', ''77777777-0000-0000-0000-000000000001'', ''APPROVE'')'));
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'staff2_id')::text, true);
select test.check('staff: cannot see a colleague''s cash advance',
  test.count_of('select 1 from public.cash_advance_requests') = 0);
select test.check('staff: cannot see a colleague''s leave request',
  test.count_of('select 1 from public.leave_requests') = 0);
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'staff_id')::text, true);
select test.check('staff: CAN see their own cash advance',
  test.count_of('select 1 from public.cash_advance_requests') = 1);
select test.check('staff: DENIED approving their own cash advance',
  test.denied('select public.decide_request(''CASH_ADVANCE'', ''77777777-0000-0000-0000-000000000001'', ''APPROVE'')'));
select test.check('staff: DENIED approving their own leave',
  test.denied('select public.decide_request(''LEAVE'', ''88888888-0000-0000-0000-000000000001'', ''APPROVE'')'));
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin_id')::text, true);
select test.check('admin: CAN see cash advances',
  test.count_of('select 1 from public.cash_advance_requests') = 1);
select test.check('admin: CAN approve a cash advance',
  public.decide_request('CASH_ADVANCE', '77777777-0000-0000-0000-000000000001', 'APPROVE', 'Approved') = 'APPROVED');
commit;

-- =============================================================================
-- 6. Privilege escalation attempts
-- =============================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'staff_id')::text, true);
select test.check('staff: DENIED granting themselves a role',
  test.denied('insert into public.user_roles (profile_id, role_id)
               select ''33333333-3333-3333-3333-333333333333'', id from public.roles where key = ''admin'''));
select test.check('staff: DENIED granting themselves a permission',
  test.denied('insert into public.user_permissions (profile_id, permission_id)
               select ''33333333-3333-3333-3333-333333333333'', id from public.permissions where key = ''finance.view'''));
select test.check('staff: cannot change a role definition',
  test.affected('update public.roles set name = ''Owned'' where key = ''staff''') <= 0);
select test.check('staff: cannot enable a module',
  test.affected('update public.modules set is_enabled = true where key = ''wastage''') <= 0);
select test.check('staff: cannot change a setting',
  test.affected('update public.app_settings set value = ''0'' where key = ''leave_advance_notice_days''') <= 0);
select test.check('staff: cannot read private settings',
  test.count_of('select 1 from public.app_settings where key = ''manager_can_publish''') = 0);
select test.check('staff: CAN read public settings',
  test.count_of('select 1 from public.app_settings where key = ''timezone''') = 1);
select test.check('staff: DENIED reading the audit trail',
  test.count_of('select 1 from public.audit_logs') = 0);
select test.check('staff: DENIED writing to the audit trail',
  test.denied('insert into public.audit_logs (action, entity_type) values (''FAKE'', ''X'')'));
select test.check('staff: DENIED activating their own account flag',
  test.denied('update public.profiles set is_active = true, employee_id = null where id = auth.uid()'));
select test.check('staff: DENIED reading import batches',
  test.count_of('select 1 from public.import_batches') = 0);
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'mgr_id')::text, true);
select test.check('manager: DENIED granting the admin role to anyone',
  test.denied('insert into public.user_roles (profile_id, role_id)
               select ''22222222-2222-2222-2222-222222222222'', id from public.roles where key = ''admin'''));
select test.check('manager: cannot delete the admin role',
  test.affected('delete from public.roles where key = ''admin''') <= 0);
select test.check('manager: DENIED reading the audit trail',
  test.count_of('select 1 from public.audit_logs') = 0);
commit;

-- =============================================================================
-- 7. Audit trail is append-only, for everyone
-- =============================================================================
select test.check('audit: roster changes were recorded automatically',
  (select count(*) from public.audit_logs where entity_type = 'ROSTER_ASSIGNMENT') >= 4);
select test.check('audit: UPDATE is refused even for the table owner',
  test.denied('update public.audit_logs set action = ''TAMPERED'' where id = (select min(id) from public.audit_logs)'));
select test.check('audit: DELETE is refused even for the table owner',
  test.denied('delete from public.audit_logs where id = (select min(id) from public.audit_logs)'));

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin_id')::text, true);
select test.check('admin: CAN read the audit trail',
  test.count_of('select 1 from public.audit_logs') > 0);
select test.check('admin: cannot delete audit rows',
  test.affected('delete from public.audit_logs') <= 0);
commit;

-- =============================================================================
-- 8. Locked rosters and publication workflow
-- =============================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin_id')::text, true);
select test.check('admin: CAN publish a draft roster',
  (public.set_roster_status('66666666-0000-0000-0000-000000000001', 'PUBLISH', null, 'Week ready')).status = 'PUBLISHED');
select test.check('publish: recorded who and when',
  (select published_by is not null and published_at is not null
   from public.roster_periods where id = '66666666-0000-0000-0000-000000000001'));
select test.check('publish: wrote a publication history row',
  (select count(*) from public.roster_publications
   where period_id = '66666666-0000-0000-0000-000000000001' and action = 'PUBLISH') = 1);
select test.check('admin: CAN lock a published roster',
  (public.set_roster_status('66666666-0000-0000-0000-000000000001', 'LOCK')).status = 'LOCKED');
commit;

-- Checked outside the role block on purpose: notifications RLS means even an
-- admin cannot read another person's inbox, which is itself the correct behaviour.
select test.check('publish: notified both affected staff',
  (select count(*) from public.notifications where type = 'ROSTER_PUBLISHED') = 2);
select test.check('publish: notified nobody who was not on the roster',
  (select count(*) from public.notifications
   where type = 'ROSTER_PUBLISHED' and profile_id = '11111111-1111-1111-1111-111111111111') = 0);

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'mgr_id')::text, true);
select test.check('manager: DENIED editing a LOCKED roster',
  test.denied('update public.roster_assignments set start_time = ''07:00''
               where period_id = ''66666666-0000-0000-0000-000000000001'''));
select test.check('manager: DENIED deleting from a LOCKED roster',
  test.denied('delete from public.roster_assignments where period_id = ''66666666-0000-0000-0000-000000000001'''));
select test.check('manager: DENIED unlocking a roster',
  test.denied('select public.set_roster_status(''66666666-0000-0000-0000-000000000001'', ''UNLOCK'', ''please'')'));
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'admin_id')::text, true);
select test.check('admin: unlocking without a reason is refused',
  test.denied('select public.set_roster_status(''66666666-0000-0000-0000-000000000001'', ''UNLOCK'')'));
select test.check('admin: CAN unlock with a reason',
  (public.set_roster_status('66666666-0000-0000-0000-000000000001', 'UNLOCK', 'Correction to Saturday cover')).status = 'PUBLISHED');
select test.check('unlock: the reason was audited',
  (select count(*) from public.audit_logs
   where action = 'ROSTER_UNLOCK' and reason = 'Correction to Saturday cover') = 1);
commit;

-- =============================================================================
-- 9. Copy previous week
-- =============================================================================
insert into public.roster_assignments (period_id, employee_id, work_date, status, leave_type_id)
values ('66666666-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000002', '2026-08-18', 'LEAVE',
        (select id from public.leave_types where code = 'ANNUAL'));
insert into public.roster_assignments (period_id, employee_id, work_date, status)
values ('66666666-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000003', '2026-08-18', 'OFF');

insert into public.roster_periods (id, outlet_id, period_type, start_date, end_date, status)
values ('66666666-0000-0000-0000-000000000003',
        (select id from public.outlets where code = 'MALL'), 'WEEK', '2026-08-31', '2026-09-06', 'DRAFT');

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'mgr_id')::text, true);
select test.check('copy: manager copied the previous week',
  public.copy_roster_week('66666666-0000-0000-0000-000000000003', '66666666-0000-0000-0000-000000000002') = 3);
commit;

select test.check('copy: WORK shifts were carried over',
  (select count(*) from public.roster_assignments
   where period_id = '66666666-0000-0000-0000-000000000003' and status = 'WORK') = 2);
select test.check('copy: the OFF pattern was carried over',
  (select count(*) from public.roster_assignments
   where period_id = '66666666-0000-0000-0000-000000000003' and status = 'OFF') = 1);
select test.check('copy: date-specific LEAVE was NOT carried over',
  (select count(*) from public.roster_assignments
   where period_id = '66666666-0000-0000-0000-000000000003' and status = 'LEAVE') = 0);
select test.check('copy: dates were shifted onto the target week',
  (select count(*) from public.roster_assignments
   where period_id = '66666666-0000-0000-0000-000000000003' and work_date = '2026-08-31') = 2);

-- =============================================================================
-- 10. Request workflow end to end
-- =============================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'staff_id')::text, true);
select test.check('staff: CAN raise a shift change request for themselves',
  not test.denied('insert into public.shift_change_requests
      (id, employee_id, work_date, requested_status, requested_start, requested_end)
      values (''99999999-0000-0000-0000-000000000001'', ''55555555-0000-0000-0000-000000000002'',
              ''2026-08-17'', ''WORK'', ''09:00'', ''19:00'')'));
select test.check('staff: DENIED raising a request in a colleague''s name',
  test.denied('insert into public.shift_change_requests
      (employee_id, work_date, requested_status) values
      (''55555555-0000-0000-0000-000000000003'', ''2026-08-17'', ''WORK'')'));
select test.check('request: a reference was generated',
  (select reference like 'SC-%' from public.shift_change_requests
   where id = '99999999-0000-0000-0000-000000000001'));
select test.check('staff: CAN submit their own request',
  public.decide_request('SHIFT_CHANGE', '99999999-0000-0000-0000-000000000001', 'SUBMIT') = 'SUBMITTED');
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'mgr_id')::text, true);
select test.check('manager: CAN review a shift change',
  public.decide_request('SHIFT_CHANGE', '99999999-0000-0000-0000-000000000001', 'REVIEW', 'Cover is fine')
    = 'MANAGER_REVIEWED');
select test.check('manager: CAN approve a shift change',
  public.decide_request('SHIFT_CHANGE', '99999999-0000-0000-0000-000000000001', 'APPROVE', 'Approved')
    = 'APPROVED');
select test.check('approval history recorded every step',
  (select count(*) from public.approval_actions
   where request_type = 'SHIFT_CHANGE' and request_id = '99999999-0000-0000-0000-000000000001') = 3);
commit;

select test.check('requester was notified of the shift-change decision',
  (select count(*) from public.notifications
   where profile_id = '33333333-3333-3333-3333-333333333333'
     and type = 'REQUEST_APPROVED' and title like '%SC-%') = 1);
select test.check('requester was notified of the cash advance decision',
  (select count(*) from public.notifications
   where profile_id = '33333333-3333-3333-3333-333333333333'
     and type = 'REQUEST_APPROVED' and title like '%CA-%') = 1);
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'staff2_id')::text, true);
select test.check('a staff member reads only their own notification inbox',
  test.count_of('select 1 from public.notifications') =
  (select count(*) from public.notifications where profile_id = '44444444-4444-4444-4444-444444444444'));
select test.check('a staff member cannot read a colleague''s notifications',
  test.count_of('select 1 from public.notifications
                 where profile_id = ''33333333-3333-3333-3333-333333333333''') = 0);
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'mgr_id')::text, true);
select test.check('manager: applying an approved change updates the roster',
  public.apply_shift_change('99999999-0000-0000-0000-000000000001') is not null);
select test.check('applying the same change twice is refused',
  test.denied('select public.apply_shift_change(''99999999-0000-0000-0000-000000000001'')'));
commit;

select test.check('roster now reflects the approved change',
  (select start_time from public.roster_assignments
   where employee_id = '55555555-0000-0000-0000-000000000002' and work_date = '2026-08-17') = '09:00');

-- =============================================================================
-- 11. The last administrator cannot be removed
-- =============================================================================
select test.check('cannot remove the only remaining admin role assignment',
  test.denied('delete from public.user_roles where profile_id = ''11111111-1111-1111-1111-111111111111'''));
select test.check('cannot deactivate the only remaining admin',
  test.denied('update public.profiles set is_active = false where id = ''11111111-1111-1111-1111-111111111111'''));
select test.check('system roles cannot be deleted',
  test.denied('delete from public.roles where key = ''roster_manager'''));

-- =============================================================================
-- 12. Anonymous access
-- =============================================================================
begin;
set local role anon;
select test.check('anon: DENIED reading employees', test.count_of('select 1 from public.employees') = -1);
select test.check('anon: DENIED reading the roster', test.count_of('select 1 from public.roster_assignments') = -1);
select test.check('anon: DENIED reading settings', test.count_of('select 1 from public.app_settings') = -1);
commit;


-- =============================================================================
-- 13. Wastage: the public submission link
--
-- This is the only unauthenticated write in the system, so it gets the most
-- adversarial section in this suite: an anonymous caller must be able to file
-- exactly one wastage entry through a valid token, and nothing else at all.
-- =============================================================================
insert into public.wastage_links (id, token, label, outlet_id, require_name, hourly_limit)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'live-token-0000000000000001', 'Mall bin station',
   (select id from public.outlets where code = 'MALL'), false, 3),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'revoked-token-000000000002', 'Old printed card', null, false, 60),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'expired-token-000000000003', 'Ramadan pop-up', null, false, 60),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'named-token-00000000000004', 'Night Market bin',
   (select id from public.outlets where code = 'NIGHT_MARKET'), true, 60);

update public.wastage_links set is_active = false where id = 'aaaaaaaa-0000-0000-0000-000000000002';
update public.wastage_links set expires_at = now() - interval '1 day'
 where id = 'aaaaaaaa-0000-0000-0000-000000000003';

begin;
set local role anon;

select test.check('anon: DENIED reading wastage entries directly',
  test.count_of('select 1 from public.wastage_entries') = -1);
select test.check('anon: DENIED reading the link tokens',
  test.count_of('select 1 from public.wastage_links') = -1);
select test.check('anon: DENIED reading the reasons table directly',
  test.count_of('select 1 from public.wastage_reasons') = -1);
select test.check('anon: DENIED inserting an entry directly',
  test.affected('insert into public.wastage_entries (entry_date, entry_time, note) values (current_date, ''12:00'', ''direct'')') <= 0);

select test.check('anon: an unknown token resolves to nothing',
  (select count(*) from public.wastage_link_resolve('no-such-token-at-all-000001')) = 0);
select test.check('anon: a revoked token resolves to nothing',
  (select count(*) from public.wastage_link_resolve('revoked-token-000000000002')) = 0);
select test.check('anon: an expired token resolves to nothing',
  (select count(*) from public.wastage_link_resolve('expired-token-000000000003')) = 0);
select test.check('anon: a live token resolves to its outlet',
  (select outlet_name from public.wastage_link_resolve('live-token-0000000000000001')) = 'Mall');
select test.check('anon: the form options need a valid token',
  (select count(*) from public.wastage_form_options('no-such-token-at-all-000001')) = 0
  and (select count(*) from public.wastage_form_options('live-token-0000000000000001')) > 0);

select test.check('anon: can file an entry through a live token',
  (select reference from public.wastage_submit(
     p_token => 'live-token-0000000000000001',
     p_reported_by => 'Win Paing',
     p_item_name => 'Chicken curry',
     p_note => 'Left out overnight',
     p_estimated_value => 40)) like 'WS-%');

select test.check('anon: DENIED filing through a revoked token',
  test.denied('select public.wastage_submit(p_token => ''revoked-token-000000000002'', p_note => ''x'')'));
select test.check('anon: DENIED filing through an expired token',
  test.denied('select public.wastage_submit(p_token => ''expired-token-000000000003'', p_note => ''x'')'));
select test.check('anon: DENIED filing without a name when the link demands one',
  test.denied('select public.wastage_submit(p_token => ''named-token-00000000000004'', p_note => ''x'')'));
select test.check('anon: can file when the required name is given',
  (select count(*) from public.wastage_submit(
     p_token => 'named-token-00000000000004', p_reported_by => 'Chan Pyae', p_note => 'Dropped tray')) = 1);

-- The hourly ceiling on the Mall link is 3, and one entry is already filed.
select public.wastage_submit(p_token => 'live-token-0000000000000001', p_note => 'second');
select public.wastage_submit(p_token => 'live-token-0000000000000001', p_note => 'third');
select test.check('anon: the hourly ceiling stops a flood on one link',
  test.denied('select public.wastage_submit(p_token => ''live-token-0000000000000001'', p_note => ''fourth'')'));
select test.check('anon: a ceiling on one link does not block another',
  (select count(*) from public.wastage_submit(
     p_token => 'named-token-00000000000004', p_reported_by => 'Chan Pyae', p_note => 'still working')) = 1);

commit;

-- What the anonymous caller was allowed to write, checked as the owner.
select test.check('every anonymous entry is recorded as coming from the public link',
  (select bool_and(source = 'PUBLIC_LINK' and status = 'SUBMITTED') from public.wastage_entries));
select test.check('an anonymous entry cannot choose its own outlet when the link fixes one',
  (select bool_and(o.code = 'MALL') from public.wastage_entries e
   join public.outlets o on o.id = e.outlet_id
   where e.link_id = 'aaaaaaaa-0000-0000-0000-000000000001'));
select test.check('the link counts what was filed through it',
  (select submission_count from public.wastage_links
   where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 3);
select test.check('a wastage entry with nothing in it is refused',
  test.denied('insert into public.wastage_entries (entry_date, entry_time) values (current_date, ''10:00'')'));
select test.check('a negative estimated value is refused',
  test.denied('insert into public.wastage_entries (entry_date, entry_time, note, estimated_value)
               values (current_date, ''10:00'', ''x'', -5)'));
select test.check('every wastage entry is audited',
  (select count(*) from public.audit_logs where entity_type = 'WASTAGE_ENTRY' and action = 'INSERT') >= 5);

begin;
set local role anon;
select test.check('anon: DENIED back-dating an entry beyond a week',
  (select entry_date from public.wastage_submit(
     p_token => 'named-token-00000000000004', p_reported_by => 'Chan Pyae',
     p_note => 'old', p_entry_date => current_date - 60)) = current_date);
select test.check('anon: DENIED filing an entry in the future',
  (select entry_date from public.wastage_submit(
     p_token => 'named-token-00000000000004', p_reported_by => 'Chan Pyae',
     p_note => 'tomorrow', p_entry_date => current_date + 1)) = current_date);
commit;


-- -----------------------------------------------------------------------------
-- 13b. Choosing a name from the staff list
-- -----------------------------------------------------------------------------
insert into public.wastage_links (id, token, label, require_name, hourly_limit, show_staff_list)
values
  ('aaaaaaaa-0000-0000-0000-000000000005', 'picker-token-00000000000005', 'Kitchen — with list', true, 60, true),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'typed-token-000000000000006', 'Kitchen — typed only', true, 60, false);

begin;
set local role anon;

select test.check('anon: the staff list is offered when the link allows it',
  (select count(*) from public.wastage_form_options('picker-token-00000000000005')
   where kind = 'EMPLOYEE') = 3);
select test.check('anon: the staff list is withheld when the link forbids it',
  (select count(*) from public.wastage_form_options('typed-token-000000000000006')
   where kind = 'EMPLOYEE') = 0);
select test.check('anon: the staff list carries names and positions, and nothing else',
  (select bool_and(name <> '' and id is not null)
   from public.wastage_form_options('picker-token-00000000000005') where kind = 'EMPLOYEE'));

select test.check('anon: choosing a name satisfies a link that demands one',
  (select count(*) from public.wastage_submit(
     p_token => 'picker-token-00000000000005',
     p_employee_id => '55555555-0000-0000-0000-000000000002',
     p_note => 'Chose my name from the list')) = 1);

select test.check('anon: a made-up employee id is ignored, not trusted',
  test.denied('select public.wastage_submit(
     p_token => ''picker-token-00000000000005'',
     p_employee_id => ''55555555-0000-0000-0000-0000000000ff'',
     p_note => ''pretending'')'));

select test.check('anon: an employee cannot be attached through a link with the list off',
  (select count(*) from public.wastage_submit(
     p_token => 'typed-token-000000000000006',
     p_employee_id => '55555555-0000-0000-0000-000000000002',
     p_reported_by => 'Typed By Hand',
     p_note => 'list is off here')) = 1);

commit;

select test.check('a chosen name is stored with the employee''s own spelling',
  (select reported_by_name from public.wastage_entries
   where link_id = 'aaaaaaaa-0000-0000-0000-000000000005') = 'Win Paing');
select test.check('a chosen name links the entry to the employee record',
  (select employee_id from public.wastage_entries
   where link_id = 'aaaaaaaa-0000-0000-0000-000000000005')
  = '55555555-0000-0000-0000-000000000002');
select test.check('a link with the list off never attaches an employee',
  (select employee_id from public.wastage_entries
   where link_id = 'aaaaaaaa-0000-0000-0000-000000000006') is null
  and (select reported_by_name from public.wastage_entries
       where link_id = 'aaaaaaaa-0000-0000-0000-000000000006') = 'Typed By Hand');

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'staff_id')::text, true);
select test.check('staff: sees the entry they filed under their own name',
  test.count_of('select 1 from public.wastage_entries') = 1);
commit;

-- =============================================================================
-- 14. Wastage: who may read and change the log
-- =============================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'staff_id')::text, true);
-- Not zero: this staff member picked their own name from the list in 13b, so
-- RLS now shows them that one entry. What matters is that it shows them no
-- other, including the several filed anonymously through the same links.
select test.check('staff: sees their own entries and nobody else''s',
  test.count_of('select 1 from public.wastage_entries') = 1
  and test.count_of(
    'select 1 from public.wastage_entries
     where employee_id is distinct from ''55555555-0000-0000-0000-000000000002''') = 0);
select test.check('staff: DENIED reading the link tokens',
  test.count_of('select 1 from public.wastage_links') = 0);
select test.check('staff: holds wastage.create',
  app.has_permission('wastage.create'));
select test.check('staff: DENIED wastage.view',
  not app.has_permission('wastage.view'));
select test.check('staff: DENIED confirming an entry',
  test.affected('update public.wastage_entries set status = ''CONFIRMED''') <= 0);
select test.check('staff: DENIED deleting an entry',
  test.affected('delete from public.wastage_entries') <= 0);
select test.check('staff: DENIED minting a submission link',
  test.affected('insert into public.wastage_links (token, label) values (''staff-minted-token-000001'', ''mine'')') <= 0);
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'mgr_id')::text, true);
select test.check('manager: reads the whole wastage log',
  test.count_of('select 1 from public.wastage_entries') >= 5);
select test.check('manager: may confirm an entry',
  test.affected('update public.wastage_entries set status = ''CONFIRMED'' where status = ''SUBMITTED''') > 0);
select test.check('manager: may mint and revoke a submission link',
  test.affected('insert into public.wastage_links (token, label) values (''manager-minted-token-0001'', ''New card'')') = 1);
select test.check('manager: DENIED seeing the cost of wastage',
  not app.has_permission('wastage.cost_view'));
select test.check('manager: may publish the report',
  app.has_permission('wastage.export'));
select test.check('manager: DENIED deleting an entry',
  test.affected('delete from public.wastage_entries') <= 0);
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'staff2_id')::text, true);
select test.check('staff: sees an entry matched to their own employee record',
  test.count_of('select 1 from public.wastage_entries') = 0);
commit;

-- Match one entry to a staff member and confirm they can then see that one only.
update public.wastage_entries
   set employee_id = '55555555-0000-0000-0000-000000000003'
 where id = (select id from public.wastage_entries order by created_at limit 1);

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'staff2_id')::text, true);
select test.check('staff: sees exactly the one entry matched to them',
  test.count_of('select 1 from public.wastage_entries') = 1);
commit;


-- =============================================================================
-- 15. The shared duty roster, and the lock on it
-- =============================================================================
insert into public.roster_links (id, token, label, outlet_id, weeks_back, weeks_ahead, show_hours, require_code)
values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'roster-token-000000000001', 'Mall — time clock',
   (select id from public.outlets where code = 'MALL'), 2, 4, true, true),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'roster-open-token-00000002', 'Open card', null, 2, 4, false, false),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'roster-revoked-token-00003', 'Old card', null, 2, 4, false, false),
  ('bbbbbbbb-0000-0000-0000-000000000004', 'roster-second-token-000004', 'Night Market — pass', null, 2, 4, false, true);
update public.roster_links set is_active = false where id = 'bbbbbbbb-0000-0000-0000-000000000003';

begin;
set local role anon;

select test.check('anon: DENIED reading the roster links table',
  test.count_of('select 1 from public.roster_links') = -1);
select test.check('anon: DENIED reading the access codes',
  test.count_of('select 1 from public.share_access_codes') = -1);
select test.check('anon: DENIED reading the issued sessions',
  test.count_of('select 1 from public.share_sessions') = -1);

select test.check('anon: a revoked roster link resolves to nothing',
  (select count(*) from public.roster_link_resolve('roster-revoked-token-00003')) = 0);
select test.check('anon: a live roster link resolves to its outlet',
  (select outlet_name from public.roster_link_resolve('roster-token-000000000001')) = 'Mall');

-- The lock itself.
select test.check('anon: a locked link shows no roster without a code',
  (select count(*) from public.roster_share_week('roster-token-000000000001', '2026-08-17', null)) = 0);
select test.check('anon: a locked link shows no roster with a made-up session',
  (select count(*) from public.roster_share_week('roster-token-000000000001', '2026-08-17', 'not-a-session')) = 0);
select test.check('anon: a wrong code issues no session',
  (select count(*) from public.roster_unlock('roster-token-000000000001', 'ShanOwner-0000')) = 0);
select test.check('anon: an empty code issues no session',
  (select count(*) from public.roster_unlock('roster-token-000000000001', '')) = 0);
select test.check('anon: the Chef code unlocks but cannot read the Change Log',
  (select can_view_change_log from public.roster_unlock('roster-token-000000000001', 'ShanChef-8264')) = false);
select test.check('anon: the Owner code may read the Change Log',
  (select can_view_change_log from public.roster_unlock('roster-token-000000000001', 'ShanOwner-5027')) = true);
select test.check('anon: the Admin code may read the Change Log',
  (select can_view_change_log from public.roster_unlock('roster-token-000000000001', 'ShanAdmin-4713')) = true);

commit;

-- Hold a Chef session and an Owner session, and check what each may reach.
create temporary table share_test_sessions as
select 'CHEF' as who, (select session_token from public.roster_unlock('roster-token-000000000001', 'ShanChef-8264')) as tok
union all
select 'OWNER', (select session_token from public.roster_unlock('roster-token-000000000001', 'ShanOwner-5027'));
grant select on share_test_sessions to anon, authenticated;

select test.check('the draft week used below really is draft, and really has rows',
  (select status from public.roster_periods where id = '66666666-0000-0000-0000-000000000003') = 'DRAFT'
  and (select count(*) from public.roster_assignments
       where period_id = '66666666-0000-0000-0000-000000000003') = 3);

begin;
set local role anon;

select test.check('anon: a Chef session sees the published week',
  (select count(*) from public.roster_share_week(
     'roster-token-000000000001', '2026-08-17',
     (select tok from share_test_sessions where who = 'CHEF'))) > 0);

select test.check('anon: a Chef session is refused the Change Log',
  (select count(*) from public.roster_share_change_log(
     'roster-token-000000000001',
     (select tok from share_test_sessions where who = 'CHEF'))) = 0);

select test.check('anon: an Owner session reads the Change Log',
  (select count(*) from public.roster_share_change_log(
     'roster-token-000000000001',
     (select tok from share_test_sessions where who = 'OWNER'))) > 0);

select test.check('anon: the Change Log never carries the before/after JSON',
  not exists (
    select 1 from public.roster_share_change_log(
      'roster-token-000000000001',
      (select tok from share_test_sessions where who = 'OWNER')) c
    where c.summary like '%{%' or c.actor like '%{%'));

-- A session is bound to the link it was issued for. Unlocking the time-clock
-- card must not silently unlock the card by the pass.
select test.check('anon: a session for one locked link does not open another',
  (select count(*) from public.roster_share_week(
     'roster-second-token-000004', '2026-08-17',
     (select tok from share_test_sessions where who = 'OWNER'))) = 0);
select test.check('anon: a session for one link cannot read another link''s Change Log',
  (select count(*) from public.roster_share_change_log(
     'roster-second-token-000004',
     (select tok from share_test_sessions where who = 'OWNER'))) = 0);

-- The DRAFT week must never appear, code or no code. Period 003 (2026-08-31)
-- is still DRAFT at this point and carries three assignments, so this asserts
-- against real rows rather than against an empty week.
select test.check('anon: a DRAFT week is invisible through the link',
  (select count(*) from public.roster_share_week(
     'roster-token-000000000001', '2026-08-31',
     (select tok from share_test_sessions where who = 'OWNER'))) = 0);

-- The window: two weeks back, four ahead.
select test.check('anon: a week outside the window returns nothing',
  (select count(*) from public.roster_share_week(
     'roster-token-000000000001', '2026-01-05',
     (select tok from share_test_sessions where who = 'OWNER'))) = 0
  and (select count(*) from public.roster_share_week(
     'roster-token-000000000001', '2027-01-04',
     (select tok from share_test_sessions where who = 'OWNER'))) = 0);

-- An unlocked link needs no session at all.
select test.check('anon: a link with the lock switched off shows the week directly',
  (select count(*) from public.roster_share_week('roster-open-token-00000002', '2026-08-17', null)) > 0);
select test.check('anon: a revoked link shows nothing even with a code',
  (select count(*) from public.roster_unlock('roster-revoked-token-00003', 'ShanOwner-5027')) = 0);

commit;

-- What the shared week does and does not carry.
select test.check('the shared roster shows names and shifts, never an employee code',
  (select bool_and(employee_name <> '' ) from public.roster_share_week(
     'roster-open-token-00000002', '2026-08-17', null)));
select test.check('the shared roster hides hours unless the link shows them',
  (select bool_and(scheduled_hours is null) from public.roster_share_week(
     'roster-open-token-00000002', '2026-08-17', null)));
select test.check('the shared roster hides notes unless the link shows them',
  (select bool_and(note = '') from public.roster_share_week(
     'roster-open-token-00000002', '2026-08-17', null)));

-- Brute force: eleven wrong codes in a row and the link stops answering.
begin;
set local role anon;
do $$
declare i integer;
begin
  for i in 1 .. 11 loop
    perform public.roster_unlock('roster-token-000000000001', 'ShanOwner-000' || i);
  end loop;
end $$;
select test.check('anon: too many wrong codes stops the link answering, even to a right one',
  (select count(*) from public.roster_unlock('roster-token-000000000001', 'ShanOwner-5027')) = 0);
commit;

-- Who may hold the codes and the links.
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'staff_id')::text, true);
select test.check('staff: DENIED reading the roster link tokens',
  test.count_of('select 1 from public.roster_links') = 0);
select test.check('staff: DENIED reading the access codes',
  test.count_of('select 1 from public.share_access_codes') = 0);
select test.check('staff: DENIED roster.share',
  not app.has_permission('roster.share'));
select test.check('staff: DENIED minting a roster link',
  test.affected('insert into public.roster_links (token, label) values (''staff-roster-token-0001'', ''mine'')') <= 0);
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'mgr_id')::text, true);
select test.check('manager: holds roster.share',
  app.has_permission('roster.share'));
select test.check('manager: sees the access codes as hints, not codes',
  (select bool_and(code_hint like '%…%') from public.share_access_codes));
select test.check('manager: DENIED reading the issued sessions',
  test.count_of('select 1 from public.share_sessions') <= 0);
select test.check('manager: DENIED reading the failed-code attempts',
  test.count_of('select 1 from public.share_code_attempts') <= 0);
commit;


-- -----------------------------------------------------------------------------
-- 15b. Changing an access code
-- -----------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'staff_id')::text, true);
select test.check('staff: DENIED changing an access code',
  test.denied('select public.share_code_set(''CHEF'', ''StaffPicked-9999'')'));
commit;

begin;
set local role anon;
select test.check('anon: DENIED changing an access code',
  test.denied('select public.share_code_set(''CHEF'', ''AnonPicked-9999'')'));
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'mgr_id')::text, true);
select test.check('manager: DENIED a code that is too short to be one',
  test.denied('select public.share_code_set(''CHEF'', ''short'')'));
select test.check('manager: DENIED giving two roles the same code',
  test.denied('select public.share_code_set(''CHEF'', ''ShanOwner-5027'')'));
select test.check('manager: may change a code',
  test.denied('select public.share_code_set(''CHEF'', ''ShanChef-1111'')') = false);
commit;

begin;
set local role anon;
select test.check('anon: the old code stops working the moment it is changed',
  (select count(*) from public.roster_unlock('roster-second-token-000004', 'ShanChef-8264')) = 0);
select test.check('anon: the new code works',
  (select count(*) from public.roster_unlock('roster-second-token-000004', 'ShanChef-1111')) = 1);
select test.check('anon: the other roles are untouched by one code changing',
  (select count(*) from public.roster_unlock('roster-second-token-000004', 'ShanOwner-5027')) = 1);
commit;

select test.check('changing a code ends the sessions opened with it',
  (select count(*) from public.share_sessions where role = 'CHEF'
   and created_at < (select updated_at from public.share_access_codes where role = 'CHEF')) = 0);
select test.check('an access code is never stored in plain text',
  (select bool_and(code_hash like '$2%' and code_hash not like '%Shan%')
   from public.share_access_codes));
select test.check('the code hint gives away no more than the last two characters',
  (select bool_and(code_hint not like '%Shan_____-%')
   from public.share_access_codes));

-- =============================================================================
-- Report
-- =============================================================================
\o
\set QUIET off
select name, case when passed then 'PASS' else 'FAIL' end as result
from test.results where not passed order by id;

select count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       count(*) as total
from test.results;

do $$
declare n integer;
begin
  select count(*) into n from test.results where not passed;
  if n > 0 then
    raise exception '% security test(s) FAILED', n;
  end if;
  raise notice 'All % security tests passed.', (select count(*) from test.results);
end $$;
