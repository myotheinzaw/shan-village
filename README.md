# Shan Village — Operations Management System

Restaurant operations platform for Shan Village. **Phase 1 delivers Staff & Duty
Roster Management**; the architecture is prepared for later modules (wastage,
inventory, purchasing, suppliers, costing, daily operations, maintenance, sales)
but none of them are built, and none of them appear anywhere in the application.

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
`scripts/test-rls.sql` — 117 assertions covering permission resolution, the
draft/published boundary, financial separation, privilege-escalation attempts,
the append-only audit trail, roster locking and the request workflow.

## Security model, in one paragraph

Hidden is not secured. Every table has Row Level Security enabled; permissions
are resolved by a `SECURITY DEFINER` function in the database, not by the
browser. A staff member who types a management URL, calls the REST API, or
drives the Supabase client from devtools is refused by PostgreSQL. Draft rosters
are invisible to staff at the row level. The two financial request tables are
gated by `finance.view` / `finance.approve`, which the Roster Manager role does
not hold — so a manager who reviews shift swaps cannot see anyone's salary
advance. `audit_logs` has no UPDATE or DELETE policy for any role, and a trigger
refuses both even on a direct connection. The service-role key is used in
exactly one file, only for Supabase Auth admin calls, and `server-only` makes
importing it into a client component a build error.

## Repository layout

```
PROJECT_PLAN.md            architecture, schema, permissions, RLS, workflows
supabase/migrations/       schema, functions, RLS policies, reference data
supabase/seed.sql          development demo data (no accounts, no passwords)
scripts/                   admin setup, local DB reset, SQL security tests
src/lib/roster/            shift parsing, hours, dates, validation, coverage
src/lib/excel/             the duty-roster spreadsheet importer
src/lib/auth/              session, permissions and the server-action guards
src/app/(management)/      management application
src/app/staff/             the staff phone app
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
- Request attachments are captured as links, not uploaded files. Supabase
  Storage would be the natural next step if the restaurant wants uploads.
