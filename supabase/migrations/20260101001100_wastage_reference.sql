-- =============================================================================
-- 1100 — Wastage reference data: switch the module on, activate its permission
--        vocabulary, seed the reasons and the module's settings.
--
-- Idempotent and safe to run in production. The 0800 seed deliberately does not
-- update is_active/is_enabled on conflict, so turning a module on is an
-- explicit migration like this one rather than a side effect of re-seeding.
-- =============================================================================

update public.modules
   set name        = 'Wastage Management',
       description = 'Daily wastage capture from the floor, with photos and a Google Drive report',
       is_enabled  = true
 where key = 'wastage';

-- Two permissions the Phase 1 vocabulary did not anticipate: publishing the
-- report to Drive, and holding the public link tokens.
insert into public.permissions (key, name, description, module_key, category, is_active, is_sensitive, sort_order) values
  ('wastage.export', 'Export wastage report', 'Publish the daily wastage workbook to Google Drive', 'wastage', 'wastage', true, false, 105),
  ('wastage.manage', 'Manage wastage links',  'Create and revoke public submission links, edit reasons', 'wastage', 'wastage', true, true, 106),
  ('wastage.delete', 'Delete wastage entries', 'Remove an entry from the log entirely — granted to nobody by default', 'wastage', 'wastage', true, true, 107)
on conflict (key) do update set
  name = excluded.name, description = excluded.description, module_key = excluded.module_key,
  category = excluded.category, is_active = excluded.is_active,
  is_sensitive = excluded.is_sensitive, sort_order = excluded.sort_order;

update public.permissions
   set is_active = true,
       description = case key
         when 'wastage.create'    then 'Record a wastage entry'
         when 'wastage.view'      then 'See the wastage log and reports'
         when 'wastage.approve'   then 'Confirm or reject a submitted entry'
         when 'wastage.cost_view' then 'See the estimated value of wastage'
         when 'wastage.dashboard' then 'See wastage totals and trends'
         else description
       end
 where key in ('wastage.create', 'wastage.view', 'wastage.approve', 'wastage.cost_view', 'wastage.dashboard');

-- Roster Manager runs the floor, so it runs wastage: log, review, links, report.
-- wastage.cost_view stays out, exactly as finance.view does — a manager who
-- reviews an entry does not thereby see what it was worth.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'wastage.create', 'wastage.view', 'wastage.approve',
  'wastage.dashboard', 'wastage.export', 'wastage.manage'
)
where r.key = 'roster_manager'
on conflict do nothing;

-- Staff may record wastage from the staff app; RLS then shows them their own
-- entries and nobody else's.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'wastage.create'
where r.key = 'staff'
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Reasons. Drawn from what actually gets thrown away in a restaurant kitchen;
-- the Owner can add, rename or retire any of them.
-- -----------------------------------------------------------------------------
insert into public.wastage_reasons (code, name, description, sort_order) values
  ('SPOILAGE',       'Spoiled / expired',    'Went off, out of date, broken cold chain',      1),
  ('OVER_PRODUCTION','Over-production',      'Cooked or prepped more than was sold',          2),
  ('PREP_ERROR',     'Preparation error',    'Burnt, over-seasoned, wrong recipe',            3),
  ('CUSTOMER_RETURN','Customer return',      'Sent back or remade for the customer',          4),
  ('DAMAGED',        'Damaged / dropped',    'Dropped, spilled or damaged in handling',       5),
  ('TRIM_WASTE',     'Trim / preparation waste', 'Normal trimming loss worth recording',      6),
  ('STAFF_MEAL',     'Staff meal',           'Used for staff food rather than sold',          7),
  ('EQUIPMENT',      'Equipment failure',    'Lost to a fridge, freezer or power failure',    8),
  ('OTHER',          'Other',                'Anything the list above does not cover',        9)
on conflict (code) do update set
  name = excluded.name, description = excluded.description, sort_order = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- Settings. The Google Drive destination is a setting, not a constant, so the
-- Owner can move the folder without a deployment.
-- -----------------------------------------------------------------------------
insert into public.app_settings (key, value, data_type, label, description, category, is_public) values
  ('wastage_drive_folder_id', '"1N-185axMNfrq49iXSlLTH1iF-mo15uRy"', 'string', 'Google Drive folder',
     'The Drive folder the daily wastage workbook is written into. Blank uses GOOGLE_DRIVE_WASTAGE_FOLDER_ID.',
     'wastage', false),
  ('wastage_drive_subfolder', '"Daily Wastage Reports"', 'string', 'Drive sub-folder',
     'Created inside the folder above if it does not exist. Blank writes straight into the folder.',
     'wastage', false),
  ('wastage_auto_export', 'true', 'boolean', 'Publish to Drive automatically',
     'Rewrites the day''s workbook in Google Drive after each submission',
     'wastage', false),
  ('wastage_photos_to_drive', 'true', 'boolean', 'Copy photos to Drive',
     'Uploads each photo beside the workbook so the report links to a picture that does not expire',
     'wastage', false),
  ('wastage_require_photo', 'false', 'boolean', 'Photo required',
     'When on, a wastage entry cannot be submitted without a picture',
     'wastage', true),
  ('wastage_require_reason', 'false', 'boolean', 'Reason required',
     'When on, the reporter must choose why it was thrown away',
     'wastage', true)
on conflict (key) do update set
  data_type = excluded.data_type, label = excluded.label,
  description = excluded.description, category = excluded.category, is_public = excluded.is_public;
