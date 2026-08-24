-- =============================================================================
-- 0800 — Reference data. Idempotent and safe to run in production.
--
-- This seeds the *vocabulary* of the system (modules, permissions, roles,
-- settings, and the masters observed in the existing Excel roster). It does not
-- create any user account and contains no credentials.
--
-- NOTE ON BREAKS: every seeded shift template has break_minutes = 0. The Excel
-- roster does not record break times, and inventing one would change every
-- hours figure the restaurant relies on. Breaks are configurable per template
-- and should be set by the Admin before the hours reports are used for pay.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Modules
-- -----------------------------------------------------------------------------
insert into public.modules (key, name, description, icon, is_enabled, is_core, sort_order) values
  ('core',        'Platform',                 'Users, roles, settings and audit',        'settings',    true,  true,  0),
  ('roster',      'Staff & Duty Roster',      'Employees, shifts, rosters and requests', 'calendar',    true,  true,  1),
  ('wastage',     'Wastage Management',       'Not yet available',                       'trash-2',     false, false, 2),
  ('inventory',   'Inventory & Stock Control','Not yet available',                       'package',     false, false, 3),
  ('purchasing',  'Purchasing',               'Not yet available',                       'shopping-cart', false, false, 4),
  ('suppliers',   'Supplier Management',      'Not yet available',                       'truck',       false, false, 5),
  ('costing',     'Recipe & Food Costing',    'Not yet available',                       'chef-hat',    false, false, 6),
  ('operations',  'Daily Operations',         'Not yet available',                       'clipboard-check', false, false, 7),
  ('maintenance', 'Maintenance',              'Not yet available',                       'wrench',      false, false, 8),
  ('sales',       'Sales',                    'Not yet available',                       'trending-up', false, false, 9)
on conflict (key) do update set
  name = excluded.name, description = excluded.description,
  icon = excluded.icon, is_core = excluded.is_core, sort_order = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- Permissions
-- -----------------------------------------------------------------------------
insert into public.permissions (key, name, description, module_key, category, is_active, is_sensitive, sort_order) values
  -- Roster module — Phase 1, active
  ('roster.view',           'View roster',              'See the published roster',                       'roster', 'roster',  true, false, 10),
  ('roster.view_all',       'View all rosters',         'See draft and locked rosters for every employee','roster', 'roster',  true, false, 11),
  ('roster.create',         'Create roster',            'Start a new roster period',                      'roster', 'roster',  true, false, 12),
  ('roster.edit',           'Edit roster',              'Change roster assignments',                      'roster', 'roster',  true, false, 13),
  ('roster.publish',        'Publish roster',           'Make a roster visible to staff, and lock it',     'roster', 'roster',  true, false, 14),
  ('roster.unlock',         'Unlock roster',            'Reopen a locked historical roster',              'roster', 'roster',  true, true,  15),
  ('roster.delete',         'Delete draft roster',      'Delete a roster that has never been published',  'roster', 'roster',  true, false, 16),
  ('shifts.view',           'View shift templates',     'See the shift template list',                    'roster', 'roster',  true, false, 20),
  ('shifts.manage',         'Manage shift templates',   'Create and edit shift templates',                'roster', 'roster',  true, false, 21),
  ('staff.view',            'View employees',           'See the employee master',                        'roster', 'staff',   true, false, 30),
  ('staff.create',          'Create employees',         'Add a new employee',                             'roster', 'staff',   true, false, 31),
  ('staff.edit',            'Edit employees',           'Change employee details',                        'roster', 'staff',   true, false, 32),
  ('staff.deactivate',      'Deactivate employees',     'Make an employee inactive',                      'roster', 'staff',   true, false, 33),
  ('positions.manage',      'Manage positions',         'Create and edit positions and departments',      'roster', 'staff',   true, false, 34),
  ('outlets.manage',        'Manage outlets',           'Create and edit outlets',                        'roster', 'staff',   true, false, 35),
  ('requests.create',       'Submit requests',          'Raise shift, swap and leave requests',           'roster', 'requests',true, false, 40),
  ('requests.view_own',     'View own requests',        'See your own requests',                          'roster', 'requests',true, false, 41),
  ('requests.view_all',     'View all requests',        'See non-financial requests from all staff',      'roster', 'requests',true, false, 42),
  ('requests.review',       'Review requests',          'Comment on and recommend requests',              'roster', 'requests',true, false, 43),
  ('requests.approve',      'Approve requests',         'Approve or reject shift and swap requests',      'roster', 'requests',true, false, 44),
  ('leave.approve',         'Approve leave',            'Approve or reject leave requests',               'roster', 'requests',true, false, 45),
  ('finance.view',          'View financial requests',  'See leave encashment and cash advance requests', 'roster', 'finance', true, true,  50),
  ('finance.approve',       'Approve financial requests','Decide leave encashment and cash advances',     'roster', 'finance', true, true,  51),
  ('announcements.view',    'View announcements',       'See staff announcements',                        'roster', 'comms',   true, false, 60),
  ('announcements.create',  'Post announcements',       'Create and manage announcements',                'roster', 'comms',   true, false, 61),
  ('reports.view',          'View reports',             'Open the reports section',                       'roster', 'reports', true, false, 70),
  ('reports.export',        'Export reports',           'Download report data',                           'roster', 'reports', true, false, 71),
  ('import.run',            'Run Excel import',         'Import historical roster spreadsheets',          'roster', 'admin',   true, false, 80),
  -- Platform — active
  ('admin.users',           'Manage users',             'Create user accounts and assign roles',          'core',   'admin',   true, true,  90),
  ('admin.roles',           'Manage roles',             'Create and edit roles',                          'core',   'admin',   true, true,  91),
  ('admin.permissions',     'Manage permissions',       'Change which role holds which permission',       'core',   'admin',   true, true,  92),
  ('admin.settings',        'Manage settings',          'Change restaurant policy and system settings',   'core',   'admin',   true, true,  93),
  ('admin.modules',         'Manage modules',           'Enable and disable platform modules',            'core',   'admin',   true, true,  94),
  ('audit.view',            'View audit trail',         'Read the audit log',                             'core',   'admin',   true, true,  95),
  -- Future modules — the vocabulary is fixed now so nothing has to be renamed
  -- later, but these are inactive AND their module is disabled, so
  -- app.has_permission() returns false for every one of them, for everyone.
  ('wastage.create',        'Record wastage',           'Future module',                                  'wastage',    'wastage',  false, false, 100),
  ('wastage.view',          'View wastage',             'Future module',                                  'wastage',    'wastage',  false, false, 101),
  ('wastage.approve',       'Approve wastage',          'Future module',                                  'wastage',    'wastage',  false, false, 102),
  ('wastage.cost_view',     'View wastage cost',        'Future module',                                  'wastage',    'wastage',  false, true,  103),
  ('wastage.dashboard',     'Wastage dashboard',        'Future module',                                  'wastage',    'wastage',  false, true,  104),
  ('inventory.view',        'View inventory',           'Future module',                                  'inventory',  'inventory',false, false, 110),
  ('inventory.count',       'Stock count',              'Future module',                                  'inventory',  'inventory',false, false, 111),
  ('inventory.adjust',      'Adjust stock',             'Future module',                                  'inventory',  'inventory',false, true,  112),
  ('inventory.value_view',  'View stock value',         'Future module',                                  'inventory',  'inventory',false, true,  113),
  ('purchasing.request',    'Raise purchase request',   'Future module',                                  'purchasing', 'purchasing',false, false, 120),
  ('purchasing.approve',    'Approve purchasing',       'Future module',                                  'purchasing', 'purchasing',false, true,  121),
  ('suppliers.view',        'View suppliers',           'Future module',                                  'suppliers',  'suppliers',false, false, 130),
  ('suppliers.manage',      'Manage suppliers',         'Future module',                                  'suppliers',  'suppliers',false, true,  131),
  ('costing.view',          'View food costing',        'Future module',                                  'costing',    'costing',  false, true,  140),
  ('costing.edit',          'Edit recipes and costing', 'Future module',                                  'costing',    'costing',  false, true,  141),
  ('operations.submit',     'Submit checklists',        'Future module',                                  'operations', 'operations',false, false, 150),
  ('operations.verify',     'Verify checklists',        'Future module',                                  'operations', 'operations',false, false, 151),
  ('maintenance.report',    'Report maintenance issue', 'Future module',                                  'maintenance','maintenance',false, false, 160),
  ('maintenance.manage',    'Manage maintenance',       'Future module',                                  'maintenance','maintenance',false, false, 161),
  ('sales.view',            'View sales',               'Future module',                                  'sales',      'sales',    false, true,  170),
  ('sales.entry',           'Enter sales',              'Future module',                                  'sales',      'sales',    false, true,  171)
on conflict (key) do update set
  name = excluded.name, description = excluded.description, module_key = excluded.module_key,
  category = excluded.category, is_sensitive = excluded.is_sensitive, sort_order = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- Roles
--
-- The admin role is granted no rows in role_permissions on purpose:
-- app.has_permission() short-circuits for admins, so a permission added in a
-- future migration is covered automatically and the Owner can never be locked
-- out of a capability by a missing seed row.
-- -----------------------------------------------------------------------------
insert into public.roles (key, name, description, is_system, sort_order) values
  ('admin',          'Owner / Admin',  'Full system access, including security and financial approvals', true, 0),
  ('roster_manager', 'Roster Manager', 'Operational scheduling, request review and reporting',           true, 1),
  ('staff',          'Staff',          'Own roster and own requests',                                    true, 2)
on conflict (key) do update set
  name = excluded.name, description = excluded.description,
  is_system = excluded.is_system, sort_order = excluded.sort_order;

-- Roster Manager. Deliberately excluded: finance.*, admin.*, audit.view,
-- roster.unlock, roster.delete — and roster.publish, which the Admin switches
-- on with the manager_can_publish setting.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'roster.view', 'roster.view_all', 'roster.create', 'roster.edit',
  'shifts.view', 'shifts.manage',
  'staff.view', 'staff.edit', 'positions.manage',
  'requests.create', 'requests.view_own', 'requests.view_all', 'requests.review',
  'requests.approve', 'leave.approve',
  'announcements.view', 'announcements.create',
  'reports.view', 'reports.export'
)
where r.key = 'roster_manager'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'roster.view', 'requests.create', 'requests.view_own', 'announcements.view'
)
where r.key = 'staff'
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Settings — every configurable policy in one place.
-- -----------------------------------------------------------------------------
insert into public.app_settings (key, value, data_type, label, description, category, is_public) values
  ('restaurant_name',        '"Shan Village"',  'string',  'Restaurant name',            'Shown in the header and on reports',                       'general', true),
  ('timezone',               '"Asia/Dubai"',    'string',  'Time zone',                  'Used for today/tomorrow calculations',                     'general', true),
  ('week_start_day',         '1',               'number',  'Week starts on',             '0 = Sunday, 1 = Monday',                                   'roster',  true),
  ('default_shift_hours',    '10',              'number',  'Default shift length (h)',   'Used when creating a new shift template',                  'roster',  true),
  ('max_weekly_hours_warning','60',             'number',  'Weekly hours warning',       'Warn when an employee is scheduled above this',            'roster',  true),
  ('max_shift_hours_warning','14',              'number',  'Single shift warning (h)',   'Warn when one shift is longer than this',                  'roster',  true),
  ('min_off_days_per_week',  '1',               'number',  'Minimum OFF days per week',  'Warn when an employee has fewer OFF days than this',       'roster',  true),
  ('staff_can_view_team_roster','true',         'boolean', 'Staff see the team roster',  'When off, staff see only their own published shifts',      'roster',  true),
  ('manager_can_publish',    'false',           'boolean', 'Roster Manager may publish', 'Grants roster.publish to the Roster Manager role',          'roster',  false),
  ('leave_advance_notice_days','90',            'number',  'Leave advance notice (days)','Requests inside this window are flagged as short notice',  'leave',   true),
  ('leave_notice_blocks',    'false',           'boolean', 'Short notice blocks leave',  'When on, leave inside the notice window cannot be submitted','leave',  true),
  ('encashment_notice_days', '90',              'number',  'Encashment notice (days)',   'Advance notice expected for a leave encashment request',   'leave',   true),
  ('encashment_max_days',    '15',              'number',  'Maximum encashable days',    'Upper limit shown when requesting leave encashment',       'leave',   true),
  ('currency',               '"AED"',           'string',  'Currency',                   'Used for cash advance requests',                           'finance', true),
  ('cash_advance_max',       '0',               'number',  'Cash advance ceiling',       '0 means no configured ceiling; every request is reviewed', 'finance', false),
  ('encashment_policy_text',
     '"Subject to company policy, eligibility verification and final management approval."',
     'string', 'Encashment policy notice', 'Shown to the employee and stored with the request', 'leave', true),
  ('cash_advance_policy_text',
     '"I acknowledge that this advance is subject to company policy, management approval, and the repayment arrangement recorded above."',
     'string', 'Cash advance acknowledgement', 'Shown to the employee and stored with the request', 'finance', true)
on conflict (key) do update set
  data_type = excluded.data_type, label = excluded.label,
  description = excluded.description, category = excluded.category, is_public = excluded.is_public;

-- Keep the manager_can_publish setting and the actual grant in step.
create or replace function app.sync_manager_publish()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_role uuid; v_perm uuid; v_on boolean;
begin
  if new.key <> 'manager_can_publish' then return new; end if;
  select id into v_role from public.roles where key = 'roster_manager';
  select id into v_perm from public.permissions where key = 'roster.publish';
  if v_role is null or v_perm is null then return new; end if;
  v_on := (new.value #>> '{}')::boolean;
  if v_on then
    insert into public.role_permissions (role_id, permission_id, created_by)
    values (v_role, v_perm, auth.uid()) on conflict do nothing;
  else
    delete from public.role_permissions where role_id = v_role and permission_id = v_perm;
  end if;
  return new;
end $$;

drop trigger if exists app_settings_manager_publish on public.app_settings;
create trigger app_settings_manager_publish
  after insert or update of value on public.app_settings
  for each row execute function app.sync_manager_publish();

-- -----------------------------------------------------------------------------
-- Outlets, departments, positions — taken from the existing roster
-- -----------------------------------------------------------------------------
insert into public.outlets (code, name, short_name, sort_order) values
  ('MALL',         'Mall',         'Mall', 1),
  ('NIGHT_MARKET', 'Night Market', 'NM',   2),
  ('MANGOON',      'Mangoon',      'MGN',  3),
  ('GOOD_LUCK',    'Good Luck',    'GL',   4)
on conflict (code) do update set name = excluded.name, short_name = excluded.short_name;

insert into public.departments (code, name, sort_order) values
  ('KITCHEN', 'Kitchen',        1),
  ('FOH',     'Front of House', 2),
  ('STEWARD', 'Stewarding',     3),
  ('ADMIN',   'Administration', 4)
on conflict (code) do update set name = excluded.name;

insert into public.positions (code, name, short_name, department_id, sort_order)
select v.code, v.name, v.short_name, d.id, v.sort_order
from (values
  ('ADMIN_PURCHASING', 'Admin / Purchasing', 'Admin',    'ADMIN',   1),
  ('TEAM_LEADER',      'Team Leader',        'TL',       'KITCHEN', 2),
  ('COOK',             'Cook',               'Cook',     'KITCHEN', 3),
  ('COMMIS',           'Commis',             'Commis',   'KITCHEN', 4),
  ('KITCHEN_HELPER',   'Kitchen Helper',     'K.H',      'KITCHEN', 5),
  ('STEWARDING',       'Stewarding',         'Steward',  'STEWARD', 6),
  ('CASHIER',          'Cashier',            'Cashier',  'FOH',     7),
  ('CASHIER_PORTION',  'Cashier / Portion',  'Cash/Por', 'FOH',     8),
  ('HELPER',           'Helper',             'Helper',   'FOH',     9),
  ('CLEANER',          'Cleaner',            'Cleaner',  'STEWARD', 10),
  ('OTHER',            'Other',              'Other',    null,      99)
) as v(code, name, short_name, dept, sort_order)
left join public.departments d on d.code = v.dept
on conflict (code) do update set name = excluded.name, short_name = excluded.short_name;

-- -----------------------------------------------------------------------------
-- Leave types
-- -----------------------------------------------------------------------------
insert into public.leave_types (code, name, is_paid, affects_entitlement, colour, sort_order) values
  ('ANNUAL',    'Annual Leave',    true,  true,  '#0ea5e9', 1),
  ('SICK',      'Sick Leave',      true,  false, '#f97316', 2),
  ('EMERGENCY', 'Emergency Leave', true,  false, '#ef4444', 3),
  ('UNPAID',    'Unpaid Leave',    false, false, '#64748b', 4),
  ('PH',        'Public Holiday',  true,  false, '#22c55e', 5),
  ('OTHER',     'Other',           false, false, '#a855f7', 9)
on conflict (code) do update set name = excluded.name, colour = excluded.colour;

-- -----------------------------------------------------------------------------
-- Shift templates — the shift patterns actually used in the Excel roster.
-- 24:00 / 24:30 and "15:00 - 2:00" both normalise to a next-day end time plus
-- crosses_midnight = true.
-- -----------------------------------------------------------------------------
insert into public.shift_templates
  (code, name, kind, start_time, end_time, break_minutes, crosses_midnight, is_split, segment2_start, segment2_end, sort_order, colour)
values
  ('M0818',  'Morning 08:00–18:00',   'WORK', '08:00', '18:00', 0, false, false, null, null, 10, '#0ea5e9'),
  ('M0819',  'Morning 08:00–19:00',   'WORK', '08:00', '19:00', 0, false, false, null, null, 11, '#0ea5e9'),
  ('M0820',  'Morning 08:00–20:00',   'WORK', '08:00', '20:00', 0, false, false, null, null, 12, '#0ea5e9'),
  ('D0919',  'Day 09:00–19:00',       'WORK', '09:00', '19:00', 0, false, false, null, null, 13, '#38bdf8'),
  ('D1020',  'Day 10:00–20:00',       'WORK', '10:00', '20:00', 0, false, false, null, null, 14, '#38bdf8'),
  ('D1022',  'Day 10:00–22:00',       'WORK', '10:00', '22:00', 0, false, false, null, null, 15, '#38bdf8'),
  ('A1223',  'Afternoon 12:00–23:00', 'WORK', '12:00', '23:00', 0, false, false, null, null, 16, '#f59e0b'),
  ('A122330','Afternoon 12:00–23:30', 'WORK', '12:00', '23:30', 0, false, false, null, null, 17, '#f59e0b'),
  ('A1323',  'Afternoon 13:00–23:00', 'WORK', '13:00', '23:00', 0, false, false, null, null, 18, '#f59e0b'),
  ('C1324',  'Closing 13:00–24:00',   'WORK', '13:00', '00:00', 0, true,  false, null, null, 19, '#ef4444'),
  ('C1424',  'Closing 14:00–24:00',   'WORK', '14:00', '00:00', 0, true,  false, null, null, 20, '#ef4444'),
  ('N1502',  'Night 15:00–02:00',     'WORK', '15:00', '02:00', 0, true,  false, null, null, 21, '#7c3aed'),
  ('N1602',  'Night 16:00–02:00',     'WORK', '16:00', '02:00', 0, true,  false, null, null, 22, '#7c3aed'),
  ('S0913',  'Split 09:00–14:00 / 19:00–24:00', 'WORK', '09:00', '14:00', 0, true,  true, '19:00', '00:00', 30, '#14b8a6'),
  ('S0813',  'Split 08:00–13:00 / 18:00–22:00', 'WORK', '08:00', '13:00', 0, false, true, '18:00', '22:00', 31, '#14b8a6'),
  ('OFF',    'OFF',                   'OFF',   null, null, 0, false, false, null, null, 90, '#94a3b8'),
  ('PH',     'Public Holiday',        'PH',    null, null, 0, false, false, null, null, 91, '#22c55e'),
  ('LEAVE',  'Approved Leave',        'LEAVE', null, null, 0, false, false, null, null, 92, '#0284c7'),
  ('TRIAL',  'Trial',                 'TRIAL', null, null, 0, false, false, null, null, 93, '#a855f7'),
  ('OTHER',  'Other / Note',          'OTHER', null, null, 0, false, false, null, null, 94, '#64748b')
on conflict (code) do update set
  name = excluded.name, kind = excluded.kind, start_time = excluded.start_time,
  end_time = excluded.end_time, crosses_midnight = excluded.crosses_midnight,
  is_split = excluded.is_split, segment2_start = excluded.segment2_start,
  segment2_end = excluded.segment2_end, colour = excluded.colour, sort_order = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- Default staffing minimums. These are starting values the Admin is expected to
-- adjust — they are configuration, not a rule baked into the application.
-- -----------------------------------------------------------------------------
insert into public.staffing_requirements (outlet_id, position_id, department_id, day_of_week, min_staff, label)
select o.id, p.id, null, null, v.min_staff, v.label
from (values
  ('MALL',         'TEAM_LEADER',     1, 'Mall — Team Leader on duty'),
  ('MALL',         'CASHIER',         1, 'Mall — Cashier on duty'),
  ('NIGHT_MARKET', 'CASHIER',         1, 'Night Market — Cashier on duty')
) as v(outlet, position, min_staff, label)
join public.outlets o on o.code = v.outlet
join public.positions p on p.code = v.position
where not exists (
  select 1 from public.staffing_requirements sr
  where sr.outlet_id = o.id and sr.position_id = p.id and sr.day_of_week is null
);

insert into public.staffing_requirements (outlet_id, position_id, department_id, day_of_week, min_staff, label)
select o.id, null, d.id, null, 2, 'Mall — Kitchen cover'
from public.outlets o
join public.departments d on d.code = 'KITCHEN'
where o.code = 'MALL'
  and not exists (
    select 1 from public.staffing_requirements sr
    where sr.outlet_id = o.id and sr.department_id = d.id and sr.day_of_week is null
  );
