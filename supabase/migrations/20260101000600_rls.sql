-- =============================================================================
-- 0600 — Row Level Security.
--
-- Principle: hidden is not secured. A staff member who types a management URL,
-- calls the REST API directly, or opens the Supabase client in devtools must be
-- refused by the database, not by the navigation menu.
--
-- Notably:
--   * a DRAFT roster is invisible to staff at the row level, not just in the UI
--   * the two financial request tables are gated by finance.view / finance.approve,
--     never by the general requests.view_all a Roster Manager holds
--   * audit_logs has no UPDATE and no DELETE policy for any role
--   * `anon` gets nothing at all
-- =============================================================================

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- The anonymous role has no business reaching any operational table.
revoke all on all tables in schema public from anon;

-- Reads a boolean setting from app_settings, for use inside policies.
create or replace function app.setting_bool(p_key text, p_default boolean default false)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (s.value #>> '{}')::boolean from public.app_settings s where s.key = p_key),
    p_default
  );
$$;
grant execute on function app.setting_bool(text, boolean) to authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array[
    'modules','profiles','roles','permissions','role_permissions','user_roles','user_permissions',
    'outlets','app_settings','audit_logs','notifications','departments','positions','employees',
    'shift_templates','roster_periods','roster_assignments','roster_publications',
    'staffing_requirements','leave_types','leave_requests','shift_change_requests',
    'shift_swap_requests','leave_encashment_requests','cash_advance_requests','approval_actions',
    'announcements','import_batches','import_records'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- =============================================================================
-- Platform
-- =============================================================================
drop policy if exists modules_read on public.modules;
create policy modules_read on public.modules
  for select to authenticated using (true);
drop policy if exists modules_write on public.modules;
create policy modules_write on public.modules
  for all to authenticated
  using (app.has_permission('admin.modules'))
  with check (app.has_permission('admin.modules') and (is_core = false or is_enabled = true));

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated
  using (id = auth.uid() or app.has_permission('admin.users') or app.has_permission('staff.view'));
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
  for all to authenticated
  using (app.has_permission('admin.users')) with check (app.has_permission('admin.users'));

-- A user may edit their own display name, but not their own activation state or
-- their link to an employee record. Those are administration, not self-service.
create or replace function app.guard_profile_self_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if app.is_service_context() or app.is_admin() or app.has_permission('admin.users') then
    return new;
  end if;
  if new.id = auth.uid() then
    if new.is_active is distinct from old.is_active
       or new.employee_id is distinct from old.employee_id
       or new.email is distinct from old.email then
      raise exception 'You cannot change your own account status, email or employee link'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_self_guard on public.profiles;
create trigger profiles_self_guard before update on public.profiles
  for each row execute function app.guard_profile_self_update();

drop policy if exists roles_read on public.roles;
create policy roles_read on public.roles for select to authenticated using (true);
drop policy if exists roles_write on public.roles;
create policy roles_write on public.roles for all to authenticated
  using (app.has_permission('admin.roles')) with check (app.has_permission('admin.roles'));

drop policy if exists permissions_read on public.permissions;
create policy permissions_read on public.permissions for select to authenticated using (true);
drop policy if exists permissions_write on public.permissions;
create policy permissions_write on public.permissions for all to authenticated
  using (app.has_permission('admin.permissions')) with check (app.has_permission('admin.permissions'));

drop policy if exists role_permissions_read on public.role_permissions;
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);
drop policy if exists role_permissions_write on public.role_permissions;
create policy role_permissions_write on public.role_permissions for all to authenticated
  using (app.has_permission('admin.permissions')) with check (app.has_permission('admin.permissions'));

drop policy if exists user_roles_read on public.user_roles;
create policy user_roles_read on public.user_roles for select to authenticated
  using (profile_id = auth.uid() or app.has_permission('admin.users'));
drop policy if exists user_roles_write on public.user_roles;
create policy user_roles_write on public.user_roles for all to authenticated
  using (app.has_permission('admin.users')) with check (app.has_permission('admin.users'));

drop policy if exists user_permissions_read on public.user_permissions;
create policy user_permissions_read on public.user_permissions for select to authenticated
  using (profile_id = auth.uid() or app.has_permission('admin.permissions'));
drop policy if exists user_permissions_write on public.user_permissions;
create policy user_permissions_write on public.user_permissions for all to authenticated
  using (app.has_permission('admin.permissions')) with check (app.has_permission('admin.permissions'));

drop policy if exists settings_read on public.app_settings;
create policy settings_read on public.app_settings for select to authenticated
  using (is_public or app.has_permission('admin.settings'));
drop policy if exists settings_write on public.app_settings;
create policy settings_write on public.app_settings for all to authenticated
  using (app.has_permission('admin.settings')) with check (app.has_permission('admin.settings'));

-- audit_logs: read for audit.view only. There is deliberately no INSERT policy
-- (rows arrive through the SECURITY DEFINER audit trigger and app.log_audit),
-- and no UPDATE or DELETE policy for anyone.
drop policy if exists audit_read on public.audit_logs;
create policy audit_read on public.audit_logs for select to authenticated
  using (app.has_permission('audit.view'));

drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select to authenticated
  using (profile_id = auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- =============================================================================
-- Master data — readable by any signed-in user, writable by permission
-- =============================================================================
drop policy if exists outlets_read on public.outlets;
create policy outlets_read on public.outlets for select to authenticated using (true);
drop policy if exists outlets_write on public.outlets;
create policy outlets_write on public.outlets for all to authenticated
  using (app.has_permission('outlets.manage')) with check (app.has_permission('outlets.manage'));

drop policy if exists departments_read on public.departments;
create policy departments_read on public.departments for select to authenticated using (true);
drop policy if exists departments_write on public.departments;
create policy departments_write on public.departments for all to authenticated
  using (app.has_permission('positions.manage')) with check (app.has_permission('positions.manage'));

drop policy if exists positions_read on public.positions;
create policy positions_read on public.positions for select to authenticated using (true);
drop policy if exists positions_write on public.positions;
create policy positions_write on public.positions for all to authenticated
  using (app.has_permission('positions.manage')) with check (app.has_permission('positions.manage'));

drop policy if exists shift_templates_read on public.shift_templates;
create policy shift_templates_read on public.shift_templates for select to authenticated using (true);
drop policy if exists shift_templates_write on public.shift_templates;
create policy shift_templates_write on public.shift_templates for all to authenticated
  using (app.has_permission('shifts.manage')) with check (app.has_permission('shifts.manage'));

drop policy if exists leave_types_read on public.leave_types;
create policy leave_types_read on public.leave_types for select to authenticated using (true);
drop policy if exists leave_types_write on public.leave_types;
create policy leave_types_write on public.leave_types for all to authenticated
  using (app.has_permission('admin.settings')) with check (app.has_permission('admin.settings'));

-- =============================================================================
-- Employees — the full row is management-only. Everyone else reaches colleagues
-- through public.employee_directory, a view exposing name/position/outlet only.
-- =============================================================================
drop policy if exists employees_read on public.employees;
create policy employees_read on public.employees for select to authenticated
  using (app.has_permission('staff.view') or profile_id = auth.uid());
drop policy if exists employees_insert on public.employees;
create policy employees_insert on public.employees for insert to authenticated
  with check (app.has_permission('staff.create'));
drop policy if exists employees_update on public.employees;
create policy employees_update on public.employees for update to authenticated
  using (app.has_permission('staff.edit')) with check (app.has_permission('staff.edit'));
drop policy if exists employees_delete on public.employees;
create policy employees_delete on public.employees for delete to authenticated
  using (app.is_admin());

create or replace view public.employee_directory
with (security_invoker = false) as
  select e.id, e.employee_code, e.full_name, e.preferred_name,
         e.position_id, e.department_id, e.outlet_id, e.is_active
  from public.employees e;
grant select on public.employee_directory to authenticated;

-- =============================================================================
-- Roster
--
-- Staff read published periods only. `roster.view_all` is what separates a
-- manager (sees drafts) from a staff member (sees published).
-- =============================================================================
drop policy if exists roster_periods_read on public.roster_periods;
create policy roster_periods_read on public.roster_periods for select to authenticated
  using (
    app.has_permission('roster.view_all')
    or (status = 'PUBLISHED' and app.has_permission('roster.view'))
  );
drop policy if exists roster_periods_insert on public.roster_periods;
create policy roster_periods_insert on public.roster_periods for insert to authenticated
  with check (app.has_permission('roster.create'));
drop policy if exists roster_periods_update on public.roster_periods;
create policy roster_periods_update on public.roster_periods for update to authenticated
  using (
    (status <> 'LOCKED' and app.has_permission('roster.edit'))
    or app.has_permission('roster.unlock')
  )
  with check (
    -- moving a period into PUBLISHED requires roster.publish specifically
    (status <> 'PUBLISHED' or app.has_permission('roster.publish'))
    and (status <> 'LOCKED' or app.has_permission('roster.publish') or app.has_permission('roster.unlock'))
    and (app.has_permission('roster.edit') or app.has_permission('roster.unlock'))
  );
drop policy if exists roster_periods_delete on public.roster_periods;
create policy roster_periods_delete on public.roster_periods for delete to authenticated
  using (status = 'DRAFT' and app.has_permission('roster.delete'));

-- Own rows in a published period, the whole published period when the team
-- roster is switched on, or everything with roster.view_all.
drop policy if exists roster_assignments_read on public.roster_assignments;
create policy roster_assignments_read on public.roster_assignments for select to authenticated
  using (
    app.has_permission('roster.view_all')
    or (
      app.has_permission('roster.view')
      and exists (
        select 1 from public.roster_periods rp
        where rp.id = roster_assignments.period_id and rp.status = 'PUBLISHED'
      )
      and (
        employee_id = app.current_employee_id()
        or app.setting_bool('staff_can_view_team_roster', true)
      )
    )
  );
drop policy if exists roster_assignments_write on public.roster_assignments;
create policy roster_assignments_write on public.roster_assignments for all to authenticated
  using (app.has_permission('roster.edit')) with check (app.has_permission('roster.edit'));

drop policy if exists roster_publications_read on public.roster_publications;
create policy roster_publications_read on public.roster_publications for select to authenticated
  using (app.has_permission('roster.view_all'));
drop policy if exists roster_publications_insert on public.roster_publications;
create policy roster_publications_insert on public.roster_publications for insert to authenticated
  with check (app.has_permission('roster.publish') or app.has_permission('roster.unlock'));

drop policy if exists staffing_read on public.staffing_requirements;
create policy staffing_read on public.staffing_requirements for select to authenticated
  using (app.has_permission('roster.view_all'));
drop policy if exists staffing_write on public.staffing_requirements;
create policy staffing_write on public.staffing_requirements for all to authenticated
  using (app.has_permission('admin.settings')) with check (app.has_permission('admin.settings'));

-- =============================================================================
-- Requests
-- =============================================================================
drop policy if exists leave_read on public.leave_requests;
create policy leave_read on public.leave_requests for select to authenticated
  using (employee_id = app.current_employee_id() or app.has_permission('requests.view_all'));
drop policy if exists leave_insert on public.leave_requests;
create policy leave_insert on public.leave_requests for insert to authenticated
  with check (
    (employee_id = app.current_employee_id() and app.has_permission('requests.create'))
    or app.has_permission('requests.review')
  );
drop policy if exists leave_update on public.leave_requests;
create policy leave_update on public.leave_requests for update to authenticated
  using (
    (employee_id = app.current_employee_id() and status in ('DRAFT', 'SUBMITTED'))
    or app.has_permission('requests.review')
  )
  with check (
    (employee_id = app.current_employee_id())
    or app.has_permission('requests.review')
  );
drop policy if exists leave_delete on public.leave_requests;
create policy leave_delete on public.leave_requests for delete to authenticated
  using (employee_id = app.current_employee_id() and status = 'DRAFT');

drop policy if exists shift_change_read on public.shift_change_requests;
create policy shift_change_read on public.shift_change_requests for select to authenticated
  using (employee_id = app.current_employee_id() or app.has_permission('requests.view_all'));
drop policy if exists shift_change_insert on public.shift_change_requests;
create policy shift_change_insert on public.shift_change_requests for insert to authenticated
  with check (
    (employee_id = app.current_employee_id() and app.has_permission('requests.create'))
    or app.has_permission('requests.review')
  );
drop policy if exists shift_change_update on public.shift_change_requests;
create policy shift_change_update on public.shift_change_requests for update to authenticated
  using (
    (employee_id = app.current_employee_id() and status in ('DRAFT', 'SUBMITTED'))
    or app.has_permission('requests.review')
  )
  with check (employee_id = app.current_employee_id() or app.has_permission('requests.review'));
drop policy if exists shift_change_delete on public.shift_change_requests;
create policy shift_change_delete on public.shift_change_requests for delete to authenticated
  using (employee_id = app.current_employee_id() and status = 'DRAFT');

-- The counterparty must be able to see and answer a swap addressed to them.
drop policy if exists shift_swap_read on public.shift_swap_requests;
create policy shift_swap_read on public.shift_swap_requests for select to authenticated
  using (
    requester_employee_id = app.current_employee_id()
    or counterparty_employee_id = app.current_employee_id()
    or app.has_permission('requests.view_all')
  );
drop policy if exists shift_swap_insert on public.shift_swap_requests;
create policy shift_swap_insert on public.shift_swap_requests for insert to authenticated
  with check (
    (requester_employee_id = app.current_employee_id() and app.has_permission('requests.create'))
    or app.has_permission('requests.review')
  );
drop policy if exists shift_swap_update on public.shift_swap_requests;
create policy shift_swap_update on public.shift_swap_requests for update to authenticated
  using (
    (requester_employee_id = app.current_employee_id() and status in ('DRAFT', 'SUBMITTED'))
    or counterparty_employee_id = app.current_employee_id()
    or app.has_permission('requests.review')
  )
  with check (
    requester_employee_id = app.current_employee_id()
    or counterparty_employee_id = app.current_employee_id()
    or app.has_permission('requests.review')
  );
drop policy if exists shift_swap_delete on public.shift_swap_requests;
create policy shift_swap_delete on public.shift_swap_requests for delete to authenticated
  using (requester_employee_id = app.current_employee_id() and status = 'DRAFT');

-- ---------------------------------------------------------------------------
-- FINANCIAL request tables. `requests.view_all` deliberately does NOT appear
-- here: a Roster Manager who can review shift swaps cannot see cash advances
-- unless the Admin explicitly grants finance.view.
-- ---------------------------------------------------------------------------
drop policy if exists encashment_read on public.leave_encashment_requests;
create policy encashment_read on public.leave_encashment_requests for select to authenticated
  using (employee_id = app.current_employee_id() or app.has_permission('finance.view'));
drop policy if exists encashment_insert on public.leave_encashment_requests;
create policy encashment_insert on public.leave_encashment_requests for insert to authenticated
  with check (employee_id = app.current_employee_id() and app.has_permission('requests.create'));
drop policy if exists encashment_update on public.leave_encashment_requests;
create policy encashment_update on public.leave_encashment_requests for update to authenticated
  using (
    (employee_id = app.current_employee_id() and status in ('DRAFT', 'SUBMITTED'))
    or app.has_permission('finance.approve')
  )
  with check (employee_id = app.current_employee_id() or app.has_permission('finance.approve'));
drop policy if exists encashment_delete on public.leave_encashment_requests;
create policy encashment_delete on public.leave_encashment_requests for delete to authenticated
  using (employee_id = app.current_employee_id() and status = 'DRAFT');

drop policy if exists advance_read on public.cash_advance_requests;
create policy advance_read on public.cash_advance_requests for select to authenticated
  using (employee_id = app.current_employee_id() or app.has_permission('finance.view'));
drop policy if exists advance_insert on public.cash_advance_requests;
create policy advance_insert on public.cash_advance_requests for insert to authenticated
  with check (employee_id = app.current_employee_id() and app.has_permission('requests.create'));
drop policy if exists advance_update on public.cash_advance_requests;
create policy advance_update on public.cash_advance_requests for update to authenticated
  using (
    (employee_id = app.current_employee_id() and status in ('DRAFT', 'SUBMITTED'))
    or app.has_permission('finance.approve')
  )
  with check (employee_id = app.current_employee_id() or app.has_permission('finance.approve'));
drop policy if exists advance_delete on public.cash_advance_requests;
create policy advance_delete on public.cash_advance_requests for delete to authenticated
  using (employee_id = app.current_employee_id() and status = 'DRAFT');

-- Approval history follows the sensitivity of the request it belongs to.
drop policy if exists approval_actions_read on public.approval_actions;
create policy approval_actions_read on public.approval_actions for select to authenticated
  using (
    case
      when request_type in ('LEAVE_ENCASHMENT', 'CASH_ADVANCE')
        then employee_id = app.current_employee_id() or app.has_permission('finance.view')
      else employee_id = app.current_employee_id() or app.has_permission('requests.view_all')
    end
  );
drop policy if exists approval_actions_insert on public.approval_actions;
create policy approval_actions_insert on public.approval_actions for insert to authenticated
  with check (
    employee_id = app.current_employee_id()
    or app.has_permission('requests.review')
    or app.has_permission('finance.approve')
  );

-- =============================================================================
-- Announcements — visible while live, to the audience they target
-- =============================================================================
drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements for select to authenticated
  using (
    app.has_permission('announcements.create')
    or (
      app.has_permission('announcements.view')
      and is_published
      and publish_at <= now()
      and (expires_at is null or expires_at > now())
      and (
        audience = 'ALL'
        or (audience = 'MANAGEMENT' and app.has_permission('roster.view_all'))
        or (audience = 'OUTLET' and outlet_id in (
              select e.outlet_id from public.employees e where e.id = app.current_employee_id()))
        or (audience = 'POSITION' and position_id in (
              select e.position_id from public.employees e where e.id = app.current_employee_id()))
      )
    )
  );
drop policy if exists announcements_write on public.announcements;
create policy announcements_write on public.announcements for all to authenticated
  using (app.has_permission('announcements.create'))
  with check (app.has_permission('announcements.create'));

-- =============================================================================
-- Excel import — Admin utility only
-- =============================================================================
drop policy if exists import_batches_all on public.import_batches;
create policy import_batches_all on public.import_batches for all to authenticated
  using (app.has_permission('import.run')) with check (app.has_permission('import.run'));
drop policy if exists import_records_all on public.import_records;
create policy import_records_all on public.import_records for all to authenticated
  using (app.has_permission('import.run')) with check (app.has_permission('import.run'));
