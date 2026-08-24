-- =============================================================================
-- 0150 — Time helpers. Defined before the roster tables because
-- roster_assignments.scheduled_hours is a STORED generated column that calls
-- compute_scheduled_hours, and a generated column requires an IMMUTABLE
-- function that already exists.
-- =============================================================================

-- Minutes worked in one segment. `p_crosses` means the segment ends on the next
-- day. A non-positive span with no explicit cross-midnight flag is also treated
-- as crossing midnight, which is what "15:00 - 2:00" in the Excel roster means.
create or replace function app.segment_minutes(
  p_start   time,
  p_end     time,
  p_crosses boolean
) returns integer
language plpgsql
immutable
as $$
declare
  v_minutes integer;
begin
  if p_start is null or p_end is null then
    return 0;
  end if;

  v_minutes := (extract(epoch from p_end) - extract(epoch from p_start))::integer / 60;

  if p_crosses or v_minutes <= 0 then
    v_minutes := v_minutes + 1440;
  end if;

  return v_minutes;
end;
$$;

-- Scheduled hours for one roster cell.
--   * non-working statuses (OFF / PH / LEAVE / TRIAL / OTHER) contribute 0 hours
--   * split shifts sum both segments; only segment 2 may cross midnight
--   * the unpaid break is deducted once, from the total
create or replace function app.compute_scheduled_hours(
  p_status          app.assignment_status,
  p_start           time,
  p_end             time,
  p_break_minutes   integer,
  p_crosses         boolean,
  p_is_split        boolean,
  p_segment2_start  time,
  p_segment2_end    time
) returns numeric
language plpgsql
immutable
as $$
declare
  v_minutes integer := 0;
begin
  if p_status is distinct from 'WORK'::app.assignment_status then
    return 0;
  end if;

  if p_start is null or p_end is null then
    -- "ON" in the source roster: working, but no times were recorded.
    return 0;
  end if;

  if coalesce(p_is_split, false) then
    -- segment 1 of a split shift never crosses midnight
    v_minutes := app.segment_minutes(p_start, p_end, false)
               + app.segment_minutes(p_segment2_start, p_segment2_end, coalesce(p_crosses, false));
  else
    v_minutes := app.segment_minutes(p_start, p_end, coalesce(p_crosses, false));
  end if;

  v_minutes := v_minutes - coalesce(p_break_minutes, 0);

  if v_minutes < 0 then
    v_minutes := 0;
  end if;

  return round(v_minutes::numeric / 60.0, 2);
end;
$$;

-- Keeps updated_at honest without every caller having to remember it.
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
