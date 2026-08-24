-- =============================================================================
-- 0700 — Workflow RPCs.
--
-- These exist because the operations they perform must be atomic and must
-- always leave an audit trail: publishing a roster, copying a week, and
-- applying an approved shift change all touch several tables at once. Putting
-- them in the database means a partial application is impossible, and the
-- permission check lives next to the write rather than only in the UI.
--
-- Each function re-checks the caller's permission itself. RLS is the floor,
-- not the only gate.
-- =============================================================================

create or replace function public.log_audit(
  p_action      text,
  p_entity_type text,
  p_entity_id   text default null,
  p_summary     text default null,
  p_old         jsonb default null,
  p_new         jsonb default null,
  p_reason      text default null,
  p_module      text default 'roster',
  p_employee_id uuid default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_email text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;
  select p.email into v_email from public.profiles p where p.id = auth.uid();

  insert into public.audit_logs
    (actor_id, actor_email, action, entity_type, entity_id, employee_id,
     module_key, summary, old_value, new_value, reason)
  values
    (auth.uid(), v_email, p_action, p_entity_type, p_entity_id, p_employee_id,
     p_module, p_summary, p_old, p_new, p_reason);
end $$;

create or replace function public.notify(
  p_profile_ids uuid[],
  p_type        text,
  p_title       text,
  p_body        text default null,
  p_link        text default null,
  p_priority    text default 'NORMAL'
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;

  insert into public.notifications (profile_id, type, title, body, link, priority, created_by)
  select pid, p_type, p_title, p_body, p_link, p_priority, auth.uid()
  from unnest(p_profile_ids) as pid
  where exists (select 1 from public.profiles p where p.id = pid and p.is_active);

  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;
  update public.notifications
     set read_at = now()
   where profile_id = auth.uid()
     and read_at is null
     and (p_ids is null or id = any(p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- -----------------------------------------------------------------------------
-- Roster publication lifecycle: DRAFT -> PUBLISHED -> LOCKED, and back.
-- -----------------------------------------------------------------------------
create or replace function public.set_roster_status(
  p_period_id uuid,
  p_action    text,
  p_reason    text default null,
  p_note      text default null
) returns public.roster_periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period  public.roster_periods;
  v_new     app.roster_status;
  v_targets uuid[];
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;

  select * into v_period from public.roster_periods where id = p_period_id;
  if not found then
    raise exception 'Roster period not found';
  end if;

  case upper(p_action)
    when 'PUBLISH', 'REPUBLISH' then
      if not app.has_permission('roster.publish') then
        raise exception 'You do not have permission to publish rosters'
          using errcode = 'insufficient_privilege';
      end if;
      if v_period.status = 'LOCKED' then
        raise exception 'A locked roster must be unlocked before it can be republished';
      end if;
      v_new := 'PUBLISHED';
    when 'UNPUBLISH' then
      if not app.has_permission('roster.publish') then
        raise exception 'You do not have permission to change roster publication'
          using errcode = 'insufficient_privilege';
      end if;
      if v_period.status <> 'PUBLISHED' then
        raise exception 'Only a published roster can be withdrawn';
      end if;
      v_new := 'DRAFT';
    when 'LOCK' then
      if not (app.has_permission('roster.publish') or app.has_permission('roster.unlock')) then
        raise exception 'You do not have permission to lock rosters'
          using errcode = 'insufficient_privilege';
      end if;
      if v_period.status <> 'PUBLISHED' then
        raise exception 'Only a published roster can be locked';
      end if;
      v_new := 'LOCKED';
    when 'UNLOCK' then
      if not app.has_permission('roster.unlock') then
        raise exception 'You do not have permission to unlock rosters'
          using errcode = 'insufficient_privilege';
      end if;
      if v_period.status <> 'LOCKED' then
        raise exception 'This roster is not locked';
      end if;
      -- unlocking protected history always needs a stated reason
      if coalesce(trim(p_reason), '') = '' then
        raise exception 'A reason is required to unlock a roster';
      end if;
      v_new := 'PUBLISHED';
    else
      raise exception 'Unknown roster action: %', p_action;
  end case;

  update public.roster_periods
     set status       = v_new,
         published_at = case when v_new = 'PUBLISHED' and published_at is null then now()
                             when v_new = 'DRAFT' then null else published_at end,
         published_by = case when v_new = 'PUBLISHED' and published_by is null then auth.uid()
                             when v_new = 'DRAFT' then null else published_by end,
         locked_at    = case when v_new = 'LOCKED' then now() else null end,
         locked_by    = case when v_new = 'LOCKED' then auth.uid() else null end,
         updated_by   = auth.uid()
   where id = p_period_id
   returning * into v_period;

  insert into public.roster_publications (period_id, action, note, reason, actor_id)
  values (p_period_id, upper(p_action), p_note, p_reason, auth.uid());

  perform public.log_audit(
    'ROSTER_' || upper(p_action), 'ROSTER_PERIOD', p_period_id::text,
    format('Roster %s to %s set to %s', v_period.start_date, v_period.end_date, v_new),
    null, to_jsonb(v_period), p_reason, 'roster');

  -- Tell the affected staff, but only about a roster they are allowed to see.
  if upper(p_action) in ('PUBLISH', 'REPUBLISH') then
    select array_agg(distinct e.profile_id) into v_targets
    from public.roster_assignments ra
    join public.employees e on e.id = ra.employee_id
    where ra.period_id = p_period_id and e.profile_id is not null and e.is_active;

    if v_targets is not null then
      perform public.notify(
        v_targets, 'ROSTER_PUBLISHED', 'Your roster has been published',
        format('The roster for %s to %s is now available.', v_period.start_date, v_period.end_date),
        '/staff/roster', 'HIGH');
    end if;
  end if;

  return v_period;
end $$;

-- -----------------------------------------------------------------------------
-- Copy previous week.
--
-- Copies the working pattern: WORK shifts and the OFF pattern. It deliberately
-- does NOT copy PH, LEAVE, TRIAL or OTHER, because those were granted for the
-- dates they were granted for and must not silently reappear a week later.
-- -----------------------------------------------------------------------------
create or replace function public.copy_roster_week(
  p_target_period_id uuid,
  p_source_period_id uuid,
  p_overwrite        boolean default false
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.roster_periods;
  v_source public.roster_periods;
  v_offset integer;
  v_count  integer;
begin
  if not app.has_permission('roster.edit') then
    raise exception 'You do not have permission to edit rosters'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_target from public.roster_periods where id = p_target_period_id;
  if not found then raise exception 'Target roster not found'; end if;
  select * into v_source from public.roster_periods where id = p_source_period_id;
  if not found then raise exception 'Source roster not found'; end if;

  if v_target.status = 'LOCKED' and not app.has_permission('roster.unlock') then
    raise exception 'The target roster is locked' using errcode = 'insufficient_privilege';
  end if;

  v_offset := v_target.start_date - v_source.start_date;

  if p_overwrite then
    delete from public.roster_assignments where period_id = p_target_period_id;
  end if;

  insert into public.roster_assignments (
    period_id, employee_id, work_date, status, shift_template_id,
    start_time, end_time, break_minutes, crosses_midnight,
    is_split, segment2_start, segment2_end,
    outlet_id, position_id, note, created_by, updated_by
  )
  select
    p_target_period_id, ra.employee_id, ra.work_date + v_offset, ra.status, ra.shift_template_id,
    ra.start_time, ra.end_time, ra.break_minutes, ra.crosses_midnight,
    ra.is_split, ra.segment2_start, ra.segment2_end,
    ra.outlet_id, ra.position_id, ra.note, auth.uid(), auth.uid()
  from public.roster_assignments ra
  join public.employees e on e.id = ra.employee_id
  where ra.period_id = p_source_period_id
    and ra.status in ('WORK', 'OFF')          -- pattern only, never exceptions
    and e.is_active                            -- do not resurrect leavers
    and ra.work_date + v_offset between v_target.start_date and v_target.end_date
  on conflict (period_id, employee_id, work_date) do nothing;

  get diagnostics v_count = row_count;

  perform public.log_audit(
    'ROSTER_COPY', 'ROSTER_PERIOD', p_target_period_id::text,
    format('Copied %s assignments from the week of %s', v_count, v_source.start_date),
    null, jsonb_build_object('source_period', p_source_period_id, 'copied', v_count),
    null, 'roster');

  return v_count;
end $$;

-- -----------------------------------------------------------------------------
-- Request decisions. One entry point for all five request types so the status
-- vocabulary, the approval history and the notification cannot drift apart.
--
-- Financial requests require finance.approve for any decision; the general
-- requests.review / requests.approve permissions are not sufficient.
-- -----------------------------------------------------------------------------
create or replace function public.decide_request(
  p_request_type text,
  p_request_id   uuid,
  p_action       text,
  p_comment      text default null
) returns app.request_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table       text;
  v_is_finance  boolean := p_request_type in ('LEAVE_ENCASHMENT', 'CASH_ADVANCE');
  v_from        app.request_status;
  v_to          app.request_status;
  v_employee    uuid;
  v_profile     uuid;
  v_reference   text;
  v_actor_name  text;
  v_own         boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;

  v_table := case p_request_type
    when 'LEAVE'            then 'leave_requests'
    when 'SHIFT_CHANGE'     then 'shift_change_requests'
    when 'SHIFT_SWAP'       then 'shift_swap_requests'
    when 'LEAVE_ENCASHMENT' then 'leave_encashment_requests'
    when 'CASH_ADVANCE'     then 'cash_advance_requests'
    else null end;
  if v_table is null then
    raise exception 'Unknown request type: %', p_request_type;
  end if;

  execute format(
    'select status, %s, reference from public.%I where id = $1',
    case when p_request_type = 'SHIFT_SWAP' then 'requester_employee_id' else 'employee_id' end,
    v_table)
    into v_from, v_employee, v_reference using p_request_id;

  if v_from is null then
    raise exception 'Request not found';
  end if;

  -- is-not-distinct-from, not =: an Admin with no employee record of their own
  -- yields NULL from current_employee_id(), and a NULL here would make every
  -- "is this my own request" branch below silently unreachable.
  v_own := v_employee is not distinct from app.current_employee_id();

  v_to := case upper(p_action)
    when 'SUBMIT'    then 'SUBMITTED'::app.request_status
    when 'CANCEL'    then 'CANCELLED'::app.request_status
    when 'REVIEW'    then 'MANAGER_REVIEWED'::app.request_status
    when 'RECOMMEND' then 'MANAGER_REVIEWED'::app.request_status
    when 'APPROVE'   then 'APPROVED'::app.request_status
    when 'REJECT'    then 'REJECTED'::app.request_status
    when 'RETURN'    then 'RETURNED'::app.request_status
    when 'PAY'       then 'PAID'::app.request_status
    when 'CLOSE'     then 'CLOSED'::app.request_status
    else null end;
  if v_to is null then
    raise exception 'Unknown action: %', p_action;
  end if;

  -- Authorization
  if upper(p_action) in ('SUBMIT', 'CANCEL') then
    if not v_own and not app.has_permission('requests.review') then
      raise exception 'You can only submit or cancel your own requests'
        using errcode = 'insufficient_privilege';
    end if;
    if upper(p_action) = 'SUBMIT' and v_from not in ('DRAFT', 'RETURNED') then
      raise exception 'Only a draft or returned request can be submitted';
    end if;
    if upper(p_action) = 'CANCEL' and v_from in ('APPROVED', 'REJECTED', 'CANCELLED', 'PAID', 'CLOSED') then
      raise exception 'This request can no longer be cancelled';
    end if;
  elsif v_is_finance then
    if not app.has_permission('finance.approve') then
      raise exception 'Financial requests can only be decided by an authorised approver'
        using errcode = 'insufficient_privilege';
    end if;
  elsif upper(p_action) in ('REVIEW', 'RECOMMEND', 'RETURN') then
    if not app.has_permission('requests.review') then
      raise exception 'You do not have permission to review requests'
        using errcode = 'insufficient_privilege';
    end if;
  else
    if not (app.has_permission('requests.approve')
            or (p_request_type = 'LEAVE' and app.has_permission('leave.approve'))) then
      raise exception 'You do not have permission to approve requests'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if v_own and upper(p_action) in ('APPROVE', 'REJECT', 'PAY') and not app.is_admin() then
    raise exception 'You cannot decide your own request'
      using errcode = 'insufficient_privilege';
  end if;

  -- Apply
  execute format($f$
    update public.%I set
      status = $1,
      updated_by = $2,
      submitted_at = case when $3 = 'SUBMIT' then now() else submitted_at end,
      reviewed_at  = case when $3 in ('REVIEW','RECOMMEND') then now() else reviewed_at end,
      reviewed_by  = case when $3 in ('REVIEW','RECOMMEND') then $2 else reviewed_by end,
      decided_at   = case when $3 in ('APPROVE','REJECT') then now() else decided_at end,
      decided_by   = case when $3 in ('APPROVE','REJECT') then $2 else decided_by end
    where id = $4
  $f$, v_table) using v_to, auth.uid(), upper(p_action), p_request_id;

  select p.full_name into v_actor_name from public.profiles p where p.id = auth.uid();

  insert into public.approval_actions
    (request_type, request_id, employee_id, action, from_status, to_status, comment, actor_id, actor_name)
  values
    (p_request_type, p_request_id, v_employee, upper(p_action), v_from, v_to, p_comment,
     auth.uid(), v_actor_name);

  perform public.log_audit(
    'REQUEST_' || upper(p_action), p_request_type, p_request_id::text,
    format('%s %s: %s -> %s', p_request_type, v_reference, v_from, v_to),
    jsonb_build_object('status', v_from), jsonb_build_object('status', v_to),
    p_comment, 'roster', v_employee);

  -- Notify the requester about decisions taken by someone else.
  if not v_own then
    select e.profile_id into v_profile from public.employees e where e.id = v_employee;
    if v_profile is not null then
      perform public.notify(
        array[v_profile], 'REQUEST_' || v_to::text,
        format('Your request %s was %s', v_reference, lower(v_to::text)),
        p_comment, '/staff/requests',
        case when v_to in ('APPROVED', 'REJECTED') then 'HIGH' else 'NORMAL' end);
    end if;
  end if;

  return v_to;
end $$;

-- -----------------------------------------------------------------------------
-- Applying an approved shift change to the roster. Separate from the decision
-- itself so that approving never silently rewrites a published roster: the
-- caller applies it explicitly, and the roster edit is audited on its own.
-- -----------------------------------------------------------------------------
create or replace function public.apply_shift_change(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req    public.shift_change_requests;
  v_period uuid;
  v_id     uuid;
  v_old    jsonb;
begin
  if not app.has_permission('roster.edit') then
    raise exception 'You do not have permission to edit rosters'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_req from public.shift_change_requests where id = p_request_id;
  if not found then raise exception 'Request not found'; end if;
  if v_req.status <> 'APPROVED' then
    raise exception 'Only an approved shift change can be applied to the roster';
  end if;
  if v_req.applied_at is not null then
    raise exception 'This shift change has already been applied';
  end if;

  select rp.id into v_period
  from public.roster_periods rp
  where v_req.work_date between rp.start_date and rp.end_date
    and rp.period_type = 'WEEK'
  order by rp.start_date desc
  limit 1;

  if v_period is null then
    raise exception 'No roster period covers %', v_req.work_date;
  end if;

  select to_jsonb(ra) into v_old from public.roster_assignments ra
  where ra.period_id = v_period and ra.employee_id = v_req.employee_id and ra.work_date = v_req.work_date;

  insert into public.roster_assignments (
    period_id, employee_id, work_date, status, shift_template_id,
    start_time, end_time, crosses_midnight, note, created_by, updated_by)
  values (
    v_period, v_req.employee_id, v_req.work_date, v_req.requested_status, v_req.requested_shift_id,
    v_req.requested_start, v_req.requested_end, v_req.requested_crosses,
    format('Shift change %s', v_req.reference), auth.uid(), auth.uid())
  on conflict (period_id, employee_id, work_date) do update set
    status            = excluded.status,
    shift_template_id = excluded.shift_template_id,
    start_time        = excluded.start_time,
    end_time          = excluded.end_time,
    crosses_midnight  = excluded.crosses_midnight,
    is_split          = false,
    segment2_start    = null,
    segment2_end      = null,
    note              = excluded.note,
    updated_by        = auth.uid()
  returning id into v_id;

  update public.shift_change_requests set applied_at = now(), updated_by = auth.uid()
  where id = p_request_id;

  perform public.log_audit(
    'SHIFT_CHANGE_APPLIED', 'ROSTER_ASSIGNMENT', v_id::text,
    format('Applied shift change %s for %s', v_req.reference, v_req.work_date),
    v_old, (select to_jsonb(ra) from public.roster_assignments ra where ra.id = v_id),
    null, 'roster', v_req.employee_id);

  return v_id;
end $$;

create or replace function public.apply_shift_swap(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.shift_swap_requests;
  a     public.roster_assignments;
  b     public.roster_assignments;
begin
  if not app.has_permission('roster.edit') then
    raise exception 'You do not have permission to edit rosters'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_req from public.shift_swap_requests where id = p_request_id;
  if not found then raise exception 'Request not found'; end if;
  if v_req.status <> 'APPROVED' then
    raise exception 'Only an approved swap can be applied to the roster';
  end if;
  if v_req.counterparty_response <> 'ACCEPTED' then
    raise exception 'The colleague has not accepted this swap';
  end if;
  if v_req.applied_at is not null then
    raise exception 'This swap has already been applied';
  end if;

  select * into a from public.roster_assignments where id = v_req.requester_assignment_id;
  select * into b from public.roster_assignments where id = v_req.counterparty_assignment_id;
  if a.id is null or b.id is null then
    raise exception 'Both roster assignments must still exist to swap them';
  end if;

  -- Exchange the shift detail; each employee keeps their own date.
  update public.roster_assignments set
    status = b.status, shift_template_id = b.shift_template_id,
    start_time = b.start_time, end_time = b.end_time, break_minutes = b.break_minutes,
    crosses_midnight = b.crosses_midnight, is_split = b.is_split,
    segment2_start = b.segment2_start, segment2_end = b.segment2_end,
    outlet_id = b.outlet_id, position_id = b.position_id,
    note = format('Swap %s', v_req.reference), updated_by = auth.uid()
  where id = a.id;

  update public.roster_assignments set
    status = a.status, shift_template_id = a.shift_template_id,
    start_time = a.start_time, end_time = a.end_time, break_minutes = a.break_minutes,
    crosses_midnight = a.crosses_midnight, is_split = a.is_split,
    segment2_start = a.segment2_start, segment2_end = a.segment2_end,
    outlet_id = a.outlet_id, position_id = a.position_id,
    note = format('Swap %s', v_req.reference), updated_by = auth.uid()
  where id = b.id;

  update public.shift_swap_requests set applied_at = now(), updated_by = auth.uid()
  where id = p_request_id;

  perform public.log_audit(
    'SHIFT_SWAP_APPLIED', 'SHIFT_SWAP_REQUEST', p_request_id::text,
    format('Applied swap %s', v_req.reference),
    jsonb_build_object('a', to_jsonb(a), 'b', to_jsonb(b)),
    jsonb_build_object('swapped', true), null, 'roster', v_req.requester_employee_id);

  return 2;
end $$;

-- Approving leave marks the rostered days as leave so the roster and the leave
-- record can never disagree.
create or replace function public.apply_leave_to_roster(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req   public.leave_requests;
  v_count integer := 0;
begin
  if not app.has_permission('roster.edit') then
    raise exception 'You do not have permission to edit rosters'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_req from public.leave_requests where id = p_request_id;
  if not found then raise exception 'Request not found'; end if;
  if v_req.status <> 'APPROVED' then
    raise exception 'Only approved leave can be applied to the roster';
  end if;

  with days as (
    select d::date as work_date from generate_series(v_req.from_date, v_req.to_date, interval '1 day') d
  ),
  targets as (
    select rp.id as period_id, days.work_date
    from days
    join public.roster_periods rp
      on days.work_date between rp.start_date and rp.end_date and rp.period_type = 'WEEK'
    where rp.status <> 'LOCKED'
  )
  insert into public.roster_assignments
    (period_id, employee_id, work_date, status, leave_type_id, leave_request_id,
     note, created_by, updated_by)
  select t.period_id, v_req.employee_id, t.work_date, 'LEAVE', v_req.leave_type_id, v_req.id,
         format('Leave %s', v_req.reference), auth.uid(), auth.uid()
  from targets t
  on conflict (period_id, employee_id, work_date) do update set
    status = 'LEAVE', leave_type_id = excluded.leave_type_id,
    leave_request_id = excluded.leave_request_id,
    shift_template_id = null, start_time = null, end_time = null,
    is_split = false, segment2_start = null, segment2_end = null,
    crosses_midnight = false, note = excluded.note, updated_by = auth.uid();

  get diagnostics v_count = row_count;

  perform public.log_audit(
    'LEAVE_APPLIED', 'LEAVE_REQUEST', p_request_id::text,
    format('Applied leave %s to %s roster day(s)', v_req.reference, v_count),
    null, jsonb_build_object('days', v_count), null, 'roster', v_req.employee_id);

  return v_count;
end $$;

grant execute on function
  public.log_audit(text, text, text, text, jsonb, jsonb, text, text, uuid),
  public.notify(uuid[], text, text, text, text, text),
  public.mark_notifications_read(uuid[]),
  public.set_roster_status(uuid, text, text, text),
  public.copy_roster_week(uuid, uuid, boolean),
  public.decide_request(text, uuid, text, text),
  public.apply_shift_change(uuid),
  public.apply_shift_swap(uuid),
  public.apply_leave_to_roster(uuid)
  to authenticated, service_role;
