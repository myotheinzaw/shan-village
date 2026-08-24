-- =============================================================================
-- 0500 — Authorization helpers, audit trigger, and the protected invariants.
--
-- Every function here is SECURITY DEFINER with an empty search_path, so it
-- cannot be hijacked by a caller-controlled search_path, and every object it
-- touches is schema-qualified.
-- =============================================================================

-- A null auth.uid() means the statement is running from a trusted server context
-- (a migration, the seed script, or a service-role admin action). Interactive
-- users always have a uid, so the invariant guards below use this to avoid
-- blocking setup while still constraining real users.
create or replace function app.is_service_context()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select auth.uid() is null $$;

create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r  on r.id = ur.role_id
    join public.profiles p on p.id = ur.profile_id
    where ur.profile_id = auth.uid()
      and r.key = 'admin'
      and p.is_active
  );
$$;

-- The single authorization primitive. Resolution order:
--   1. the caller must be an active profile
--   2. the permission must exist, be active, and belong to an enabled module
--   3. an admin passes everything that survives (2)
--   4. an explicit per-user revoke beats any role grant
--   5. otherwise: a per-user grant, or any role the user holds
create or replace function app.has_permission(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_active
    )
    and exists (
      select 1
      from public.permissions perm
      join public.modules m on m.key = perm.module_key
      where perm.key = p_key
        and perm.is_active
        and m.is_enabled
    )
    and (
      app.is_admin()
      or (
        not exists (
          select 1
          from public.user_permissions up
          join public.permissions perm on perm.id = up.permission_id
          where up.profile_id = auth.uid()
            and perm.key = p_key
            and up.granted = false
        )
        and (
          exists (
            select 1
            from public.user_permissions up
            join public.permissions perm on perm.id = up.permission_id
            where up.profile_id = auth.uid()
              and perm.key = p_key
              and up.granted
          )
          or exists (
            select 1
            from public.user_roles ur
            join public.role_permissions rp on rp.role_id = ur.role_id
            join public.permissions perm on perm.id = rp.permission_id
            where ur.profile_id = auth.uid()
              and perm.key = p_key
          )
        )
      )
    );
$$;

create or replace function app.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id
  from public.employees e
  where e.profile_id = auth.uid()
  limit 1;
$$;

-- True when a module is switched on. Route guards and navigation use this.
create or replace function app.module_enabled(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select m.is_enabled from public.modules m where m.key = p_key), false);
$$;

grant execute on function app.is_admin, app.has_permission(text), app.current_employee_id,
                          app.module_enabled(text), app.is_service_context
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Audit trigger. Attach with:
--   create trigger x after insert or update or delete on <table>
--   for each row execute function app.audit_row('ENTITY_TYPE', 'module_key');
-- -----------------------------------------------------------------------------
create or replace function app.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity  text := coalesce(tg_argv[0], tg_table_name);
  v_module  text := coalesce(tg_argv[1], 'core');
  v_actor   uuid := auth.uid();
  v_email   text;
  v_old     jsonb;
  v_new     jsonb;
  v_id      text;
  v_emp     uuid;
begin
  select p.email into v_email from public.profiles p where p.id = v_actor;

  if tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_id  := (v_old ->> 'id');
  elsif tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_id  := (v_new ->> 'id');
  else
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_id  := (v_new ->> 'id');
    -- Only record what actually changed; a no-op update should not create noise.
    if v_old = v_new then
      return null;
    end if;
  end if;

  v_emp := nullif(coalesce(v_new ->> 'employee_id', v_old ->> 'employee_id'), '')::uuid;

  insert into public.audit_logs
    (actor_id, actor_email, action, entity_type, entity_id, employee_id, module_key,
     old_value, new_value, reason)
  values
    (v_actor, v_email, tg_op, v_entity, v_id, v_emp, v_module,
     v_old, v_new,
     coalesce(v_new ->> 'audit_reason', current_setting('app.audit_reason', true)));

  return null;
end;
$$;

-- audit_logs is append-only for everybody. RLS gives no UPDATE/DELETE policy,
-- and this trigger blocks it even for a table owner or service-role connection.
create or replace function app.block_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only; % is not permitted', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists audit_logs_no_update on public.audit_logs;
create trigger audit_logs_no_update
  before update or delete on public.audit_logs
  for each row execute function app.block_audit_mutation();

-- -----------------------------------------------------------------------------
-- Protected invariants
-- -----------------------------------------------------------------------------

-- 1 & 3: the `admin` role is structural, and only an admin may hand it out.
create or replace function app.guard_admin_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  if tg_table_name = 'roles' then
    if tg_op = 'DELETE' then
      if old.is_system then
        raise exception 'System role "%" cannot be deleted', old.key
          using errcode = 'insufficient_privilege';
      end if;
      return old;
    end if;
    if tg_op = 'UPDATE' and old.key = 'admin' and new.key is distinct from 'admin' then
      raise exception 'The admin role key cannot be changed'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  -- user_roles / role_permissions
  if tg_op = 'DELETE' then
    select r.key into v_key from public.roles r where r.id = old.role_id;
  else
    select r.key into v_key from public.roles r where r.id = new.role_id;
  end if;

  if v_key = 'admin' and not app.is_service_context() and not app.is_admin() then
    raise exception 'Only an administrator may change administrator access'
      using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists roles_guard on public.roles;
create trigger roles_guard
  before update or delete on public.roles
  for each row execute function app.guard_admin_role();

drop trigger if exists user_roles_guard on public.user_roles;
create trigger user_roles_guard
  before insert or update or delete on public.user_roles
  for each row execute function app.guard_admin_role();

drop trigger if exists role_permissions_guard on public.role_permissions;
create trigger role_permissions_guard
  before insert or update or delete on public.role_permissions
  for each row execute function app.guard_admin_role();

-- 2: nobody can grant a permission they do not themselves hold. Admins hold
-- everything, so this only ever constrains delegated managers.
create or replace function app.guard_permission_escalation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  if app.is_service_context() or app.is_admin() then
    return new;
  end if;

  select perm.key into v_key from public.permissions perm where perm.id = new.permission_id;

  if not app.has_permission(v_key) then
    raise exception 'You cannot grant "%": you do not hold that permission', v_key
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists role_permissions_escalation_guard on public.role_permissions;
create trigger role_permissions_escalation_guard
  before insert on public.role_permissions
  for each row execute function app.guard_permission_escalation();

drop trigger if exists user_permissions_escalation_guard on public.user_permissions;
create trigger user_permissions_escalation_guard
  before insert or update on public.user_permissions
  for each row execute function app.guard_permission_escalation();

-- 4: the system must always retain at least one active administrator.
create or replace function app.guard_last_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_remaining integer;
  v_admin_role uuid;
begin
  select r.id into v_admin_role from public.roles r where r.key = 'admin';
  if v_admin_role is null then
    return coalesce(new, old);
  end if;

  select count(*) into v_remaining
  from public.user_roles ur
  join public.profiles p on p.id = ur.profile_id
  where ur.role_id = v_admin_role
    and p.is_active
    and not (tg_table_name = 'user_roles' and tg_op = 'DELETE' and ur.profile_id = old.profile_id)
    and not (tg_table_name = 'profiles'   and ur.profile_id = new.id);

  if v_remaining = 0 then
    raise exception 'At least one active administrator must remain'
      using errcode = 'integrity_constraint_violation';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists user_roles_last_admin on public.user_roles;
create trigger user_roles_last_admin
  before delete on public.user_roles
  for each row execute function app.guard_last_admin();

drop trigger if exists profiles_last_admin on public.profiles;
create trigger profiles_last_admin
  before update of is_active on public.profiles
  for each row when (old.is_active and not new.is_active)
  execute function app.guard_last_admin();

-- 5: a LOCKED roster period is protected history. Editing it requires
-- roster.unlock, which the Roster Manager role does not hold by default.
create or replace function app.guard_locked_roster()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status app.roster_status;
  v_period uuid := coalesce(new.period_id, old.period_id);
begin
  if app.is_service_context() then
    return coalesce(new, old);
  end if;

  select rp.status into v_status from public.roster_periods rp where rp.id = v_period;

  if v_status = 'LOCKED' and not app.has_permission('roster.unlock') then
    raise exception 'This roster is locked. Unlocking it requires the roster.unlock permission.'
      using errcode = 'insufficient_privilege';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists roster_assignments_locked_guard on public.roster_assignments;
create trigger roster_assignments_locked_guard
  before insert or update or delete on public.roster_assignments
  for each row execute function app.guard_locked_roster();

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'roles', 'outlets', 'departments', 'positions', 'employees',
    'shift_templates', 'roster_periods', 'roster_assignments', 'staffing_requirements',
    'leave_types', 'leave_requests', 'shift_change_requests', 'shift_swap_requests',
    'leave_encashment_requests', 'cash_advance_requests', 'announcements',
    'import_batches', 'modules', 'app_settings'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function app.set_updated_at()', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Audit triggers on the tables the brief requires to be auditable
-- -----------------------------------------------------------------------------
do $$
declare
  spec text[][] := array[
    ['employees', 'EMPLOYEE', 'roster'],
    ['positions', 'POSITION', 'roster'],
    ['shift_templates', 'SHIFT_TEMPLATE', 'roster'],
    ['roster_periods', 'ROSTER_PERIOD', 'roster'],
    ['roster_assignments', 'ROSTER_ASSIGNMENT', 'roster'],
    ['roster_publications', 'ROSTER_PUBLICATION', 'roster'],
    ['leave_requests', 'LEAVE_REQUEST', 'roster'],
    ['shift_change_requests', 'SHIFT_CHANGE_REQUEST', 'roster'],
    ['shift_swap_requests', 'SHIFT_SWAP_REQUEST', 'roster'],
    ['leave_encashment_requests', 'LEAVE_ENCASHMENT_REQUEST', 'roster'],
    ['cash_advance_requests', 'CASH_ADVANCE_REQUEST', 'roster'],
    ['approval_actions', 'APPROVAL_ACTION', 'roster'],
    ['user_roles', 'USER_ROLE', 'core'],
    ['role_permissions', 'ROLE_PERMISSION', 'core'],
    ['user_permissions', 'USER_PERMISSION', 'core'],
    ['roles', 'ROLE', 'core'],
    ['profiles', 'PROFILE', 'core'],
    ['app_settings', 'SETTING', 'core'],
    ['modules', 'MODULE', 'core'],
    ['staffing_requirements', 'STAFFING_REQUIREMENT', 'roster'],
    ['announcements', 'ANNOUNCEMENT', 'roster'],
    ['import_batches', 'IMPORT_BATCH', 'roster']
  ];
  i integer;
begin
  for i in 1 .. array_length(spec, 1) loop
    execute format('drop trigger if exists audit_trg on public.%I', spec[i][1]);
    execute format(
      'create trigger audit_trg after insert or update or delete on public.%I
       for each row execute function app.audit_row(%L, %L)',
      spec[i][1], spec[i][2], spec[i][3]);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Human-readable request references (LV-2026-0001, SC-…, SW-…, EN-…, CA-…)
-- -----------------------------------------------------------------------------
create sequence if not exists app.request_reference_seq;

create or replace function app.next_reference(p_prefix text)
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select p_prefix || '-' || to_char(now(), 'YYYY') || '-'
       || lpad(nextval('app.request_reference_seq')::text, 5, '0');
$$;

grant execute on function app.next_reference(text) to authenticated, service_role;
grant usage on sequence app.request_reference_seq to authenticated, service_role;

create or replace function app.set_reference()
returns trigger
language plpgsql
as $$
begin
  if new.reference is null or new.reference = '' then
    new.reference := app.next_reference(tg_argv[0]);
  end if;
  return new;
end;
$$;

do $$
declare
  spec text[][] := array[
    ['leave_requests', 'LV'],
    ['shift_change_requests', 'SC'],
    ['shift_swap_requests', 'SW'],
    ['leave_encashment_requests', 'EN'],
    ['cash_advance_requests', 'CA']
  ];
  i integer;
begin
  for i in 1 .. array_length(spec, 1) loop
    execute format('drop trigger if exists set_reference on public.%I', spec[i][1]);
    execute format(
      'create trigger set_reference before insert on public.%I
       for each row execute function app.set_reference(%L)', spec[i][1], spec[i][2]);
  end loop;
end $$;
