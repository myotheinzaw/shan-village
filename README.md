# Shan Village — Operations Management System

Restaurant operations platform for Shan Village. **Phase 1 delivers Staff & Duty
Roster Management** and **Phase 2 delivers Wastage**; the architecture is
prepared for the later modules (inventory, purchasing, suppliers, costing, daily
operations, maintenance, sales) but none of those are built, and none of them
appear anywhere in the application.

Read [`PROJECT_PLAN.md`](PROJECT_PLAN.md) first — it records what the existing
Excel roster actually contains, the database design, the permission model and
the RLS strategy.

---

## What Phase 1 does

**Management**

- Weekly roster builder: click-to-edit grid, bulk assignment across employees and
  days, copy previous week, filters, live coverage and validation, daily totals
- Monthly roster view across every employee
- Draft → Published → Locked workflow, with publication history and audit
- Employees, positions, outlets, departments and shift templates
- Approval Centre for shift changes, swaps, leave, leave encashment and cash advances
- Announcements, in-app notifications, leave calendar
- Reports (roster, employee hours, leave, requests) with CSV export
- Administration: users, roles and permissions, modules, settings, staffing rules,
  audit log, and a reviewed Excel import for the historical spreadsheets

**Staff** — a four-tab phone app: `Home · Roster · Requests · Profile`. Today's
duty, tomorrow's, next OFF day, this week's totals, announcements, and their own
requests. Nothing else exists for them, in the UI or in the database.

## What Phase 2 does

**Wastage** — staff report what they throw away from a phone, in about fifteen
seconds, with no login.

- A public link per outlet (`/w/<token>`), printed as a QR code and stuck by the
  bin. Camera button, note, reason, quantity, optional value; the date defaults
  to today and the time to now, both taken from the restaurant's clock rather
  than the phone's.
- Photos are downscaled in the browser and stored in a private bucket.
- Management gets a daily log with the photo, review (confirm / reject) and
  per-day totals.
- **The day's workbook is published to Google Drive automatically** — one file
  per day, rewritten in place, with the photos in a `Photos/<date>` sub-folder
  beside it and a hyperlink from each spreadsheet row to its picture.

Tokens are revocable and rate-limited, and `wastage.cost_view` gates the money
exactly as `finance.view` does. Setup and the security model are in
[`docs/WASTAGE.md`](docs/WASTAGE.md).

## Shift handling

The existing spreadsheet writes shifts three different ways, and the system
understands all of them:

| Source cell | Stored as |
|---|---|
| `13:00 - 23:00` | 13:00–23:00, 10 h |
| `14:00 - 24 :00` | 14:00 → 00:00 next day, 10 h |
| `12:00 -24:30` | 12:00 → 00:30 next day, 12.5 h |
| `15:00 - 2:00` | 15:00 → 02:00 next day, 11 h |
| `9-14 - 19-24` | split: 09:00–14:00 and 19:00–24:00, 10 h |
| `OFF` `PH` `VAC` `UL` `Sick Leave` `Trial` | structured statuses |
| `MANGOON` `(NM)` | worked, at another outlet |

Running the parser over the real file: **99% of 1,358 roster cells are read with
no human input**; the remainder are flagged for review rather than guessed.

## Stack

Next.js 15 (App Router, React 19) · TypeScript strict · Tailwind CSS v4 ·
Radix primitives · Supabase (PostgreSQL, Auth, RLS) · Vitest · PWA · Vercel.

## Getting started

```bash
npm install
cp .env.example .env.local          # fill in your Supabase project values
# apply supabase/migrations/*.sql in order (see docs/DEPLOYMENT.md)
node scripts/create-admin.mjs       # creates the first Owner account
npm run dev
```

Full setup, including the Supabase SQL editor and CLI routes, is in
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Verifying

```bash
npm run verify     # lint + typecheck + unit tests + production build
npm run db:test    # applies the real migrations to PostgreSQL and tests RLS
```

`npm run db:test` needs a local PostgreSQL 16. It rebuilds a scratch database
from `supabase/migrations`, adds a small shim that reproduces Supabase's `auth`
schema and its `anon` / `authenticated` / `service_role` roles, then runs
`scripts/test-rls.sql` — 157 assertions covering permission resolution, the
draft/published boundary, financial separation, privilege-escalation attempts,
the append-only audit trail, roster locking, the request workflow, and the
public wastage link (revoked, expired and unknown tokens, the hourly ceiling,
back-dating, and what an anonymous caller can and cannot reach).

## Security model, in one paragraph

Hidden is not secured. Every table has Row Level Security enabled; permissions
are resolved by a `SECURITY DEFINER` function in the database, not by the
browser. A staff member who types a management URL, calls the REST API, or
drives the Supabase client from devtools is refused by PostgreSQL. Draft rosters
are invisible to staff at the row level. The two financial request tables are
gated by `finance.view` / `finance.approve`, which the Roster Manager role does
not hold — so a manager who reviews shift swaps cannot see anyone's salary
advance. `audit_logs` has no UPDATE or DELETE policy for any role, and a trigger
refuses both even on a direct connection. The public wastage form is the single
unauthenticated write: `anon` holds no table privileges at all and reaches three
`SECURITY DEFINER` functions that check the link token themselves. The
service-role key appears in three files — Supabase Auth admin calls, private
photo storage, and the scheduled Drive publish that has no user behind it —
each documented at the point of use, and `server-only` makes importing any of
them into a client component a build error.

## Repository layout

```
PROJECT_PLAN.md            architecture, schema, permissions, RLS, workflows
supabase/migrations/       schema, functions, RLS policies, reference data
supabase/seed.sql          development demo data (no accounts, no passwords)
scripts/                   admin setup, local DB reset, SQL security tests
src/lib/roster/            shift parsing, hours, dates, validation, coverage
src/lib/wastage/           submission contract, the daily report and workbook
src/lib/google/            the small Drive client behind the daily publish
src/lib/excel/             the duty-roster spreadsheet importer
src/lib/auth/              session, permissions and the server-action guards
src/app/(management)/      management application
src/app/staff/             the staff phone app
src/app/w/[token]/         the public wastage form — no login, no app shell
docs/samples/              the source spreadsheet, used as a test fixture
```

## Notes for whoever runs this next

- **Breaks are zero on every seeded shift template.** The spreadsheet never
  recorded break times, and inventing one would change every hours figure. Set
  the real break length per template before the Employee Hours report is used
  for anything to do with pay.
- **Roster Manager cannot publish by default.** Turn on *Roster Manager may
  publish* in Settings to grant it; turning it off removes the grant again.
- **The advance leave notice is 90 days and warns only.** It blocks submission
  only if you switch on *Short notice blocks leave*.
- Request attachments are captured as links, not uploaded files. Wastage photos
  now prove out Supabase Storage, so moving request attachments onto the same
  private-bucket pattern is a small job.
- **Wastage works without Google Drive.** Entries, photos, review and the
  Download Excel button all function; only the automatic Drive copy is skipped,
  and the Wastage screen says so. Connect it with the walkthrough in
  [`docs/WASTAGE.md`](docs/WASTAGE.md).
- **A printed wastage QR code is a door key.** Anyone holding the address can
  file an entry. Give each outlet its own link so one leak is revoked alone,
  and use *New address* when a printed card goes missing.
