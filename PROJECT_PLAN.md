# Shan Village — Operations Management System

**Phase 1: Staff & Duty Roster Management** · **Phase 2: Wastage**

This document is the architectural reference for the platform. It records what was found in the
existing Excel roster, the decisions taken, the database design, the security model, and the
implementation order. Read this before changing the schema or the permission model.

---

## 1. Product vision

One platform — **Shan Village Operations Management System** — with shared authentication,
employees, outlets, permissions, audit and settings. Operational capability is delivered as
**modules**. Only one module is built now:

| # | Module | Key | Phase 1 |
|---|--------|-----|---------|
| 1 | Staff & Duty Roster | `roster` | **BUILT** |
| 2 | Wastage | `wastage` | **BUILT** (Phase 2) |
| 3 | Inventory & Stock Control | `inventory` | architecture only |
| 4 | Purchasing | `purchasing` | architecture only |
| 5 | Suppliers | `suppliers` | architecture only |
| 6 | Recipe & Food Costing | `costing` | architecture only |
| 7 | Daily Operations | `operations` | architecture only |
| 8 | Maintenance | `maintenance` | architecture only |
| 9 | Sales | `sales` | architecture only |

"Architecture only" means: the module is a row in the `modules` table with `is_enabled = false`,
its permission keys can be created, and navigation/routing is driven from that table. **No pages,
no menu entries, no placeholder buttons exist for disabled modules**, and a disabled module's
routes return 404 rather than a broken page.

The same user experiences two different products, decided purely by permissions:

- A staff member sees **Shan Village Staff App** — `Home | Roster | Requests | Profile`.
- Management sees **Shan Village Operations Management System** — the full navigation.

---

## 2. What the existing Excel roster actually contains

Source file: `Shan Village - Duty Roster.xlsx` — 22 weekly sheets, 30 Mar 2026 → 30 Aug 2026.

### 2.1 Sheet layout

Every sheet has an identical shape:

```
B1                     "Shan Village - Duty Roster"
B2..J2   headers       Name | Position | Mon | Tue | Wed | Thu | Fri | Sat | Sun
L2, M2                 "PH"  "E.H"           (public-holiday / extra-hours tally columns)
row 3                  the seven dates (present in 20 of 22 sheets)
B4+                    employee rows; column C = position, D..J = the day cells
column M               numeric extra-hours total for the week
columns N, O           free-text policy notes attached to a row
B<n> alone             a section banner row: "MALL" or "NIGHT MARKET"
```

### 2.2 Data-quality findings (these drive the importer design)

These are real defects in the source data, not hypotheticals:

1. **Sheet titles disagree with the date row.** `May 11 - May 17 2026` carries dates starting
   `2026-05-04`; `May 5 - May 11` carries `2026-05-11`. The importer therefore trusts **row 3**,
   falls back to parsing the title, and **flags any mismatch for human review**.
2. **Two sheets have no date row at all** (`Mar 30 to Apr 5`, `Apr 6 to Apr 12`) and two store the
   date as text (`13.04.26`).
3. **The Position column sometimes contains a shift string** (`8:00  - 20:00` appears 12 times
   where a position should be). Those rows must be flagged, not imported as a position.
4. **The same person is spelled several ways** — `Phyu Sin Maung` / `phyu sin Maung ` (trailing
   space, different case). Name matching must be normalised and near-duplicates flagged.
5. **110 distinct day-cell strings** for what is really a much smaller set of shifts, because of
   inconsistent spacing: `14:00 - 24 :00`, `14:00- 24:00`, `14:00 - 24:00` are the same shift.

### 2.3 The shift vocabulary that must be understood

**Statuses** (non-working or non-standard day cells), with occurrence counts:

| Excel text | Meaning | Modelled as |
|---|---|---|
| `OFF`, `Off` (189) | weekly off day | `OFF` assignment |
| `PH`, `PH Day`, `Ph Leave` (8) | public holiday | `PH` |
| `VAC` (30) | vacation / annual leave | `LEAVE` + Annual Leave type |
| `Leave` (9) | leave, type unspecified | `LEAVE`, needs review |
| `UL`, `Unpaid Leave` (7) | unpaid leave | `LEAVE` + Unpaid |
| `Sick Leave`, `SICK LEAVE` (3) | sick leave | `LEAVE` + Sick |
| `Trial` (2) | trial worker day | `TRIAL` |
| `ON` (51) | working, hours not specified | `WORK` with no times |
| `ENTRY` (3) | data-entry duty day | `WORK`, note preserved |
| `Visa Extend` (3) | administrative absence | `OTHER`, note preserved |
| `MANGOON` (33), `Gool Luck` (5) | deployed to another outlet | `WORK` at a different outlet |
| `Cashier` (6) | covering a different position | `WORK`, position override |

**Working shifts.** Three syntactic families:

1. **Simple range** — `13:00 - 23:00`, `8:00 - 18:00`, `12:00 -23:30`.
2. **Crossing midnight** — `15:00 - 2:00`, `16:00 - 2:00`; and the roster's own convention of
   writing midnight and beyond as `24:00` / `24:30` (`13:00 - 24 :00`, `12:00 -24:30`).
   End < start, or end ≥ 24:00, means the shift runs into the next day.
3. **Split shifts** — two segments in one cell, written in a compressed hour-only form:
   `9-14 - 19-24`, `9-14  19-24`, `8-13 - 18-22`, `10-2 - 18-24`, `9-14 - 19-1:30`.

   `10-2` is ambiguous in isolation. The rule applied: within a split segment, if the end hour is
   numerically less than the start hour, it is read as the **afternoon** equivalent
   (`10-2` → `10:00–14:00`), because every observed morning segment ends in the early afternoon
   and no observed morning segment crosses midnight. The **second** segment is allowed to cross
   midnight (`19-1:30` → `19:00–01:30`). Any cell the parser is not confident about is not
   guessed — it is reported as *requires review*.

**Annotations** — a trailing parenthesis carries context, not time: `(NM)` = Night Market,
`(Mall)` = Mall outlet, `(ST)`, `( Cashier )`. These are extracted into outlet/position overrides
and the raw text is always preserved.

### 2.4 Sections → outlets

`MALL` and `NIGHT MARKET` banner rows split each sheet; `MANGOON` and `Gool Luck` appear as day
values. All four are locations. They become rows in the **`outlets`** master, which every future
module will also use.

### 2.5 What this means for the design

The Excel file is a *presentation* of the roster, not a data model. The application stores the
structured facts — employee, date, status, start, end, break, computed hours, outlet, position
override — and keeps the original cell text on imported rows (`source_value`) so history stays
auditable.

---

## 3. Technology and conventions

- **Next.js 15** (App Router, React 19, Server Components), **TypeScript** in strict mode.
- **Tailwind CSS v4** with design tokens in `src/app/globals.css`; a shadcn/ui-style component kit
  in `src/components/ui` built on Radix primitives.
- **Supabase**: PostgreSQL, Auth (email + password), Row Level Security, Realtime-ready.
- **Vercel** for hosting; env vars documented in `docs/DEPLOYMENT.md`.
- **PWA**: manifest + service worker, installable on staff phones; the service worker caches only
  the application shell and never caches API or roster responses.
- **Vitest** for unit tests; a SQL harness (`scripts/test-rls.sh`) that runs the real migrations
  against PostgreSQL and asserts RLS behaviour per role.

Timezone is a setting, default **Asia/Dubai**. All dates in the roster are stored as `date` (no
timezone) and all shift times as `time`; a shift crossing midnight is expressed by
`crosses_midnight` plus the end time, never by a timestamp in another zone. This avoids the entire
class of DST/offset bugs in a roster grid.

---

## 4. Roles and permissions

Roles are containers for permissions; **all authorization decisions are made on permissions**, so
the Owner can re-shape any role later without code changes.

| Role | Key | Intended holder |
|---|---|---|
| Owner / Admin | `admin` | the owner |
| Roster Manager | `roster_manager` | Phyu Sin Maung |
| Staff | `staff` | everyone else |

### 4.1 Permission catalogue (Phase 1)

`roster.view` `roster.view_all` `roster.create` `roster.edit` `roster.publish` `roster.unlock`
`roster.delete` `shifts.view` `shifts.manage` `staff.view` `staff.create` `staff.edit`
`staff.deactivate` `positions.manage` `outlets.manage` `requests.create` `requests.view_own`
`requests.view_all` `requests.review` `requests.approve` `leave.approve` `finance.view`
`finance.approve` `announcements.view` `announcements.create` `reports.view` `reports.export`
`import.run` `admin.users` `admin.roles` `admin.permissions` `admin.settings` `admin.modules`
`audit.view`

Keys for future modules (`inventory.count`, `purchasing.approve`, `costing.view`, …) are seeded as
**inactive** rows so the vocabulary is stable, but they grant nothing while their module is
disabled. The `wastage.*` keys were seeded the same way in Phase 1 and activated in Phase 2 by
migration 1100 — see §12.

The catalogue deliberately separates the six things the brief calls out:
**submit** (`requests.create`) · **view** (`roster.view`) · **edit** (`roster.edit`) ·
**approve** (`requests.approve`) · **see money** (`finance.view`) · **administer** (`admin.*`).
Someone who can submit a cash advance cannot see anyone else's, and a Roster Manager who reviews
requests does not thereby see their amounts.

### 4.2 Default grants

- **Admin** — every active permission, always. Guaranteed by a database rule, not by a seed list,
  so a new permission can never accidentally lock the owner out.
- **Roster Manager** — all roster/shift/staff-view/position operations, request review and
  recommendation, leave approval, announcements, reports; **no** `finance.view`,
  `finance.approve`, `admin.*`, `roster.unlock` or `audit.view`. `roster.publish` is **not**
  granted by default and is switched on by the Admin (setting `manager_can_publish`, which grants
  the permission) — this is exactly the "publish only if Admin enables it" rule in the brief.
- **Staff** — `roster.view` (own + published), `requests.create`, `requests.view_own`,
  `announcements.view` only.

### 4.3 Protected invariants (enforced in the database)

1. The `admin` role cannot be deleted, renamed away, or stripped of permissions.
2. A user cannot grant themselves a role or permission they do not already hold.
3. A non-admin cannot assign the `admin` role to anyone.
4. The last active admin cannot be deactivated or demoted.
5. `audit_logs` accepts `INSERT` only — no `UPDATE`, no `DELETE`, for anybody including admins.

---

## 5. Database design

Naming: snake_case, UUID primary keys (`gen_random_uuid()`), `created_at/created_by/updated_at/
updated_by` on every mutable table, foreign keys with explicit `ON DELETE` behaviour, and an index
on every foreign key and on every column used by an RLS policy.

### 5.1 Identity, access and platform (shared by all future modules)

| Table | Purpose |
|---|---|
| `profiles` | 1:1 with `auth.users`; display name, active flag, links to `employees` |
| `roles` | `admin`, `roster_manager`, `staff`, plus any role the Owner creates |
| `permissions` | the catalogue above; `module_key` groups them |
| `role_permissions` | role → permission grants |
| `user_roles` | profile → role assignments |
| `user_permissions` | per-user grant/revoke overrides on top of roles |
| `modules` | module registry with `is_enabled`; drives navigation and route guards |
| `app_settings` | typed key/value settings (timezone, week start, notice periods, thresholds) |
| `audit_logs` | append-only; actor, action, entity, before/after JSON, reason |
| `notifications` | in-app notification inbox, transport-agnostic |
| `outlets` | Mall, Night Market, Mangoon, Good Luck — shared master |

### 5.2 People

| Table | Purpose |
|---|---|
| `positions` | position master (Team Leader, Commis, K.H, Cashier, Stewarding, …), orderable, deactivatable |
| `departments` | kitchen / front-of-house / stewarding / admin grouping used by staffing rules |
| `employees` | employee master: code, names, position, department, outlet, employment status, join date, contact, default shift, weekly off preference, weekly hours target, active flag, photo, notes |

`employees.profile_id` is the optional link to a login. An employee can exist without a login and
a profile is never required to appear on a roster.

### 5.3 Roster

| Table | Purpose |
|---|---|
| `shift_templates` | reusable shifts; `kind` ∈ `WORK/OFF/PH/LEAVE/TRIAL/OTHER`; start, end, break minutes, computed hours, `crosses_midnight`, `is_split` + segment 2 times |
| `roster_periods` | one week (or month) of roster; outlet, start/end date, `status` ∈ `DRAFT/PUBLISHED/LOCKED` |
| `roster_assignments` | one employee × one date; the operational heart of the system |
| `roster_publications` | publication/lock history: who, when, action, note |
| `staffing_requirements` | configurable minimum headcount per outlet × day-of-week × position/department |

`roster_assignments` stores the *resolved* shift, not just a template reference, so that editing a
template later never silently rewrites published history:

```
period_id, employee_id, work_date, status, shift_template_id (nullable),
start_time, end_time, break_minutes, crosses_midnight,
is_split, segment2_start, segment2_end,
outlet_id (override), position_id (override), leave_type_id (nullable),
scheduled_hours (generated), note, source_value (Excel original), import_batch_id
UNIQUE (period_id, employee_id, work_date)
```

`scheduled_hours` is computed in the database so every report, every dashboard and every export
agree on one number. The calculation handles cross-midnight (`end + 24h` when `end <= start`),
the roster's `24:00`/`24:30` convention, split segments, and break deduction.

### 5.4 Requests and approvals

| Table | Purpose |
|---|---|
| `leave_types` | configurable: Annual, Sick, Emergency, Unpaid, Public Holiday, Other |
| `leave_requests` | type, from/to, days, reason, attachment, status |
| `shift_change_requests` | date, current assignment, requested shift, reason |
| `shift_swap_requests` | requester + counterparty assignments, counterparty acceptance, then manager/admin |
| `leave_encashment_requests` | **financial** — leave year, eligible days requested |
| `cash_advance_requests` | **financial** — amount, requested payment date, repayment arrangement |
| `approval_actions` | one row per decision on any request; polymorphic `(request_type, request_id)` |

All five request tables share the status vocabulary
`DRAFT → SUBMITTED → MANAGER_REVIEWED → APPROVED / REJECTED / RETURNED / CANCELLED`
(cash advance adds `PAID` and `CLOSED`), so the Approval Centre is one screen over one union view.

### 5.5 Announcements and import

`announcements` (title, body, publish/expiry, priority, audience) and
`import_batches` / `import_records` (staged Excel rows with parse status, so an Admin reviews
before anything is committed; the raw cell text is retained on every imported row).

---

## 6. Row Level Security strategy

RLS is enabled on **every** table. Nothing is reachable because a menu item is hidden.

Two `SECURITY DEFINER` helper functions, marked `STABLE` and pinned to an empty `search_path`,
back every policy:

- `app.has_permission(permission_key text) → boolean` — resolves the caller's roles, role
  permissions and per-user overrides, and returns true for an admin.
- `app.current_employee_id() → uuid` — the caller's own employee row, for "own records" policies.

Policy shape by table class:

| Class | SELECT | INSERT / UPDATE / DELETE |
|---|---|---|
| Master data (positions, outlets, shift templates, leave types) | any authenticated user | `*.manage` permission |
| Employees | `staff.view`, **or** the caller's own row | `staff.create` / `staff.edit` |
| Roster periods & assignments | `roster.view_all`, **or** own rows where the period is `PUBLISHED` | `roster.create` / `roster.edit`; blocked entirely when the period is `LOCKED` unless `roster.unlock` |
| Own requests | own rows, or `requests.view_all` | own rows while `DRAFT`/`SUBMITTED`; reviewers via `requests.review` |
| **Financial requests** | own rows, or `finance.view` — *not* `requests.view_all` | own rows; decisions require `finance.approve` |
| `audit_logs` | `audit.view` | `INSERT` only; `UPDATE`/`DELETE` have no policy at all |
| Settings, roles, permissions, modules | authenticated read where needed for the UI | `admin.*` only |
| `notifications` | own rows only | own rows (mark read) |

The critical detail: staff visibility of a roster is conditioned on
`roster_periods.status = 'PUBLISHED'`, so a draft roster is invisible to staff **in the database**,
not merely in the UI.

The service-role key is used only in `src/lib/supabase/admin.ts`, only inside server-side admin
actions (creating an auth user, resetting access), and is never imported into a client component.
Every server action independently re-checks permissions before it runs — RLS is the floor, not the
only gate.

---

## 7. Navigation and screens

### Management
```
Dashboard
Staff & Roster ── Weekly Roster · Monthly Roster · Roster Builder · Shift Templates ·
                  Employees · Positions
Requests       ── My Requests · Approval Centre
Leave          ── Leave Calendar · Leave Types
Announcements
Reports        ── Roster · Employee Hours · Leave · Requests
Administration ── Users · Roles & Permissions · Modules · Settings · Audit Log · Excel Import
```

### Staff (mobile-first, bottom tab bar)
```
Home       today's duty, tomorrow, next OFF, this week's totals, announcements
Roster     own week/month; published team roster when permitted
Requests   new request + status list
Profile    details, password, sign out
```

---

## 8. Workflows

**Roster**: `DRAFT` (manager builds; invisible to staff) → `PUBLISHED` (staff can see; publisher
and timestamp recorded; notification raised) → `LOCKED` (protected history; only `roster.unlock`
reopens it, and the reason is required and audited). Every post-publication change writes an audit
row with the before and after value.

**Copy previous week** copies employees, positions, working shifts and the OFF pattern; it
deliberately **does not** copy date-specific exceptions — approved leave, public holidays or
one-off statuses — because those belong to the week they were granted for.

**Validation** (warnings, not blocks — an Admin can override with a recorded reason): overlapping
shifts, scheduled while on approved leave, inactive employee scheduled, no OFF day in the week,
weekly hours over the configured threshold, duplicate assignment, unusually long single shift,
staffing below the configured minimum, missing required position.

**Requests**: staff submit → manager reviews and recommends → approver decides. Approval of a
shift change or swap updates the roster in a single transaction and audits it; nothing modifies a
published roster before approval. Financial requests (encashment, cash advance) always require
`finance.approve` and carry the policy notice that payment is subject to eligibility and final
management approval.

---

## 9. Configurable policy (no business rule is hard-coded)

`app_settings` holds, with these defaults: restaurant name, timezone `Asia/Dubai`, week start
`Monday`, default shift length `10h`, **advance leave notice `90` days** (warning only, not a
block, unless `leave_notice_blocks` is turned on), leave-encashment notice `90` days and maximum
eligible days, maximum weekly hours warning `60`, minimum OFF days per week `1`, and
`manager_can_publish`. Staffing minimums live in `staffing_requirements` and are per outlet, day
and position.

---

## 10. Implementation order

1. Plan, schema, RLS ✔
2. Auth, permissions, app shell
3. Employees, positions, outlets, shift templates
4. Weekly roster builder — the core of Phase 1
5. Monthly view; publication workflow
6. Staff portal
7. Request centre (shift change → swap → leave → encashment → cash advance)
8. Approval centre
9. Dashboards, announcements, notifications
10. Reports and export
11. Excel import with review
12. Quality gates: lint, typecheck, unit tests, SQL RLS tests, build

Priority under pressure follows the brief's list exactly; the duty roster is never degraded to
make room for anything else.


---

## 12. Phase 2 — the Wastage module

The roster module is used by people with logins. Wastage is not: the people who see food thrown
away are kitchen and stewarding staff, mid-shift, with wet hands. That single fact drives every
decision below. Operator-facing setup is in [`docs/WASTAGE.md`](docs/WASTAGE.md).

### 12.1 The capture path

A public link per outlet, `/w/<token>`, printed as a QR code and stuck where the wastage happens.
No login, no install, no app shell. Photo, note, reason, quantity, optional value; the date
defaults to today and the time to now, **taken from the restaurant's clock** (`app.restaurant_now()`
over the `timezone` setting) rather than from a phone that may be set to anything.

Everything except "a photo, an item, or a note" is optional, and the value field says so out loud:
*leave it blank, a guess is worse than nothing*. A wastage log that is slow to fill in does not get
filled in, and a costed figure invented by whoever was nearest is worse than an honest gap — the
report states how many entries had no price so the total reads as a floor.

### 12.2 Schema

| Table | Purpose |
|---|---|
| `wastage_reasons` | reason master: spoilage, over-production, prep error, customer return, damaged, trim, staff meal, equipment failure, other |
| `wastage_links` | the public tokens: label, outlet, active flag, expiry, name requirement, hourly ceiling, usage counters |
| `wastage_entries` | one thing thrown away: date, time, outlet, reporter, item, quantity/unit, reason, estimated value, note, photo, status, source, originating link |
| `wastage_exports` | every attempt to publish a day to Drive, successes and failures alike |

`wastage_entries.status` is `SUBMITTED → CONFIRMED / REJECTED`. A rejected entry stays on the log
and in the workbook, excluded from the totals: a manager disagreeing with an entry is part of the
day's record, and deleting it would leave the log unable to explain itself.

### 12.3 The one unauthenticated write

`anon` keeps the blanket revoke from migration 0600 and gains **no** table privilege. It reaches
exactly three `SECURITY DEFINER` functions — `wastage_link_resolve`, `wastage_form_options`,
`wastage_submit` — which live in `public` only because that is the schema PostgREST exposes.

- Each verifies the token: active, unexpired, module enabled. Unknown, revoked and expired are
  indistinguishable in the response, so a token guesser learns nothing.
- `wastage_submit` fixes `source`, `status` and `link_id` itself, so a caller cannot file an entry
  claiming to have come from management, nor pre-approve their own.
- Each link carries an hourly ceiling, so one leaked token is a revocable nuisance and not an open
  write endpoint. Rotating a token kills the old address immediately and keeps the entry history,
  because entries reference the link row rather than the token.
- Dates are clamped to the last seven days and never the future.

`scripts/test-rls.sql` §13–14 asserts all of it against the real migrations.

### 12.4 Photos

A private Supabase Storage bucket, `wastage-photos`, partitioned `YYYY/MM/DD/<uuid>`. The browser
downscales to 1600px before upload — a modern phone otherwise sends 4–8 MB over restaurant wifi.
Management views a photo through a 15-minute signed URL from `/api/wastage/photo/[id]`, and only
after RLS on the entry row has already agreed the caller may see it.

An entry is worth more than its photo: if the upload fails, the entry is still recorded and the
reporter is told the picture did not arrive.

### 12.5 The Google Drive report

One workbook per day, **rewritten in place**, so a day is one file at one stable link however many
times it is regenerated. Photos go into a `Photos/<date>` sub-folder beside it — never mixed in
with the workbooks — and each spreadsheet row hyperlinks to its own picture.

Three triggers, all writing the same file: after each submission (in an `after()` task, once the
reporter already has their confirmation), a manual button, and an hourly cron that republishes
today and yesterday. Yesterday, because a late shift files after midnight and because it repairs
any day where Drive was unreachable at the time.

`src/lib/google/drive.ts` is a dependency-free service-account client: `googleapis` is a large tree
for four calls. Failures are rows in `wastage_exports` and are surfaced on the Wastage screen — a
report that has quietly stopped publishing is the failure mode that matters.

The module is fully usable with Drive disconnected; only the automatic copy is skipped.

### 12.6 Permissions and money

`wastage.create` (Staff, Manager) · `wastage.view` · `wastage.approve` · `wastage.export` ·
`wastage.manage` · `wastage.dashboard` (Manager) · `wastage.cost_view` (**Admin only**) ·
`wastage.delete` (**nobody**).

`wastage.cost_view` follows `finance.view` exactly: a manager who reviews entries does not thereby
see the money. Because RLS protects rows and not columns, the masking lives in one function —
`maskValues()` in `src/lib/data/wastage.ts` — mirrored in the export route.

`wastage.delete` is granted to no role. Rejecting is the honest way to dismiss an entry; an admin
can still delete, since `app.has_permission()` short-circuits for admins.

### 12.7 The service-role key, revisited

Phase 1 stated the key is used in exactly one file, for Supabase Auth admin calls only. Phase 2
adds two uses, and both are narrow and documented at the point of use:

- `src/lib/supabase/storage.ts` — the private photo bucket. An anonymous reporter must never hold
  a storage credential, and a signed URL is issued only after RLS has approved the row.
- `src/lib/supabase/system.ts` — the scheduled Drive publish. It has no user behind it and must
  read the whole day; a caller-initiated export checks `wastage.export` in the route first.

Neither reads or writes operational rows on behalf of a signed-in user. That still goes through the
user-scoped client, so RLS keeps deciding who sees which entry.
