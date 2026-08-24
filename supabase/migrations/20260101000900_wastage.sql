-- =============================================================================
-- 0900 — Wastage module schema.
--
-- The operational shape of this module is unusual and deliberate: the people
-- who see wastage happen are kitchen and stewarding staff who do not have a
-- login. They record it from a phone, through a public link, in seconds —
-- a photo, a note, and whatever else they happen to know. Everything except
-- the date, the time and the link itself is therefore optional, and the entry
-- is reviewed by management afterwards rather than validated at the door.
--
-- What is NOT optional: every entry knows which link it came from, so a link
-- that is being abused can be revoked without touching anything else.
-- =============================================================================

do $$ begin
  create type app.wastage_status as enum ('SUBMITTED', 'CONFIRMED', 'REJECTED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.wastage_source as enum ('PUBLIC_LINK', 'STAFF_APP', 'MANAGEMENT');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- wastage_reasons — why it was thrown away. A master, so the report can group
-- by reason and the Owner can add a reason without a code change.
-- -----------------------------------------------------------------------------
create table if not exists public.wastage_reasons (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  description   text,
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);
create index if not exists wastage_reasons_active_idx on public.wastage_reasons (is_active, sort_order);

-- -----------------------------------------------------------------------------
-- wastage_links — the public submission links.
--
-- One link per outlet is the intended use: printed as a QR code and stuck by
-- the bin. The token is the credential, so it is long, random, revocable and
-- expirable, and a link carries no permission beyond "insert one wastage entry".
-- -----------------------------------------------------------------------------
create table if not exists public.wastage_links (
  id                uuid primary key default gen_random_uuid(),
  token             text not null unique,
  label             text not null,
  outlet_id         uuid references public.outlets(id) on delete set null,
  is_active         boolean not null default true,
  expires_at        timestamptz,
  -- When on, the person must say who they are before the form will submit.
  require_name      boolean not null default true,
  -- Abuse ceiling, per link, per hour. 0 disables the check.
  hourly_limit      integer not null default 60,
  submission_count  integer not null default 0,
  last_used_at      timestamptz,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz not null default now(),
  updated_by        uuid,
  constraint wastage_links_token_length check (char_length(token) between 16 and 64),
  constraint wastage_links_hourly_limit check (hourly_limit >= 0)
);
create index if not exists wastage_links_token_idx on public.wastage_links (token);
create index if not exists wastage_links_outlet_idx on public.wastage_links (outlet_id);
create index if not exists wastage_links_active_idx on public.wastage_links (is_active);

-- -----------------------------------------------------------------------------
-- wastage_entries — one thing thrown away, as reported.
--
-- `estimated_value` is what the reporter believed it was worth. It is never
-- treated as a costed figure: the report labels it an estimate, and reading it
-- at all requires wastage.cost_view.
-- -----------------------------------------------------------------------------
create table if not exists public.wastage_entries (
  id                uuid primary key default gen_random_uuid(),
  reference         text unique,
  entry_date        date not null,
  entry_time        time not null,
  outlet_id         uuid references public.outlets(id) on delete set null,
  reported_by_name  text not null default '',
  employee_id       uuid references public.employees(id) on delete set null,
  item_name         text not null default '',
  quantity          numeric(12, 3),
  unit              text,
  reason_id         uuid references public.wastage_reasons(id) on delete set null,
  estimated_value   numeric(12, 2),
  currency          text not null default 'AED',
  note              text not null default '',
  -- Supabase Storage object key in the private `wastage-photos` bucket.
  photo_path        text,
  photo_mime        text,
  photo_size        integer,
  -- Set once the photo has been copied to Google Drive alongside the report,
  -- so the workbook can link to a picture that outlives a signed URL.
  drive_photo_id    text,
  drive_photo_url   text,
  status            app.wastage_status not null default 'SUBMITTED',
  source            app.wastage_source not null default 'PUBLIC_LINK',
  link_id           uuid references public.wastage_links(id) on delete set null,
  reviewed_by       uuid,
  reviewed_at       timestamptz,
  review_note       text not null default '',
  exported_at       timestamptz,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz not null default now(),
  updated_by        uuid,
  -- An entry with no photo, no description and no note records nothing.
  constraint wastage_entries_has_content check (
    photo_path is not null
    or char_length(btrim(item_name)) > 0
    or char_length(btrim(note)) > 0
  ),
  constraint wastage_entries_quantity check (quantity is null or quantity > 0),
  constraint wastage_entries_value check (estimated_value is null or estimated_value >= 0)
);
create index if not exists wastage_entries_date_idx on public.wastage_entries (entry_date desc, entry_time desc);
create index if not exists wastage_entries_outlet_idx on public.wastage_entries (outlet_id);
create index if not exists wastage_entries_status_idx on public.wastage_entries (status);
create index if not exists wastage_entries_reason_idx on public.wastage_entries (reason_id);
create index if not exists wastage_entries_employee_idx on public.wastage_entries (employee_id);
create index if not exists wastage_entries_link_idx on public.wastage_entries (link_id);
create index if not exists wastage_entries_created_idx on public.wastage_entries (created_at desc);

-- -----------------------------------------------------------------------------
-- wastage_exports — every attempt to write the day's workbook to Google Drive.
--
-- Failures are rows too. A daily report that silently stopped uploading is the
-- failure mode that matters, so the Wastage screen reads this table and says so.
-- -----------------------------------------------------------------------------
create table if not exists public.wastage_exports (
  id            uuid primary key default gen_random_uuid(),
  report_date   date not null,
  status        text not null default 'PENDING',
  trigger       text not null default 'MANUAL',
  entry_count   integer not null default 0,
  total_value   numeric(12, 2) not null default 0,
  file_name     text,
  drive_file_id text,
  drive_url     text,
  error         text,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  constraint wastage_exports_status check (status in ('PENDING', 'SUCCESS', 'FAILED', 'SKIPPED')),
  constraint wastage_exports_trigger check (trigger in ('MANUAL', 'AUTO', 'CRON'))
);
create index if not exists wastage_exports_date_idx on public.wastage_exports (report_date desc, created_at desc);
create index if not exists wastage_exports_status_idx on public.wastage_exports (status);

-- -----------------------------------------------------------------------------
-- Triggers: updated_at, audit, and the WS-2026-00001 reference
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['wastage_reasons', 'wastage_links', 'wastage_entries'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function app.set_updated_at()', t);
  end loop;
end $$;

do $$
declare
  spec text[][] := array[
    ['wastage_reasons', 'WASTAGE_REASON'],
    ['wastage_links',   'WASTAGE_LINK'],
    ['wastage_entries', 'WASTAGE_ENTRY']
  ];
  i integer;
begin
  for i in 1 .. array_length(spec, 1) loop
    execute format('drop trigger if exists audit_trg on public.%I', spec[i][1]);
    execute format(
      'create trigger audit_trg after insert or update or delete on public.%I
       for each row execute function app.audit_row(%L, %L)',
      spec[i][1], spec[i][2], 'wastage');
  end loop;
end $$;

drop trigger if exists set_reference on public.wastage_entries;
create trigger set_reference before insert on public.wastage_entries
  for each row execute function app.set_reference('WS');

-- -----------------------------------------------------------------------------
-- Private storage bucket for the photos.
--
-- Private on purpose: a wastage photo shows the kitchen, and management reads
-- it through a short-lived signed URL issued by the application.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'wastage-photos', 'wastage-photos', false, 12582912,
      array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
    )
    on conflict (id) do update set
      public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;
