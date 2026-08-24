# Deployment

Two things to set up: a Supabase project (database, auth, RLS) and a Vercel
deployment (the application). Roughly 20 minutes end to end.

---

## 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com). Pick the region
   closest to the restaurant — **Middle East (UAE)** for Shan Village.
2. Note these from **Project Settings → API**:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY`

> The service-role key bypasses Row Level Security. It belongs only in server
> environment variables. Never expose it to the browser and never commit it.

### Apply the schema

**Option A — SQL editor.** Open each file in `supabase/migrations/` in
ascending filename order and run it:

```
20260101000100_platform_core.sql        identity, roles, permissions, modules, audit
20260101000150_time_functions.sql       hours calculation (needed before the roster tables)
20260101000200_people.sql               departments, positions, employees
20260101000300_roster.sql               shift templates, periods, assignments, staffing
20260101000400_requests.sql             leave, shift change, swap, encashment, cash advance
20260101000450_announcements_import.sql announcements and the import staging area
20260101000500_security_functions.sql   permission functions, audit trigger, invariants
20260101000600_rls.sql                  Row Level Security policies
20260101000700_workflow_functions.sql   publish, copy week, decide request, apply to roster
20260101000800_reference_data.sql       modules, permissions, roles, settings, masters
```

Order matters: `..._150` defines the function the roster's generated column
uses, and `..._600` depends on every table existing.

**Option B — Supabase CLI.**

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

### Create the first Owner account

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=xxx \
SETUP_ADMIN_EMAIL=owner@shanvillage.ae \
SETUP_ADMIN_PASSWORD='choose-a-long-password' \
node scripts/create-admin.mjs
```

Omit `SETUP_ADMIN_PASSWORD` and one is generated and printed once. Sign in and
change it from **Profile** immediately.

There is deliberately no way to create the first administrator from the web UI:
that would be a self-registration hole in a system that manages staff pay data.

### Email

Password reset and "Email reset" in Users use Supabase's built-in email, which
is rate-limited and not intended for production. Configure your own SMTP under
**Authentication → Email templates → SMTP settings**. Until then, use
**New password** on the Users screen, which issues a one-time password shown to
the Admin once.

Set **Authentication → URL Configuration → Site URL** to your deployed URL, and
add `https://<your-domain>/auth/callback` to the redirect allow-list.

### Optional: demo data

For a staging project only:

```bash
supabase db execute --file supabase/seed.sql
```

It creates representative employees and three weeks of roster. It creates no
accounts and contains no passwords.

---

## 2. Vercel

1. Import the repository at [vercel.com/new](https://vercel.com/new).
2. Framework preset: **Next.js**. No build settings to change.
3. Environment variables (Production, Preview and Development):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service-role secret |
   | `NEXT_PUBLIC_SITE_URL` | `https://your-domain` |

4. Deploy. Without the Supabase variables the app renders a **Configuration
   required** page instead of failing — that page is the signal a variable is
   missing.

---

## 3. First run

1. Sign in as the Owner.
2. **Administration → Settings** — restaurant name, timezone (`Asia/Dubai`),
   week start, the leave notice period, hours thresholds, and whether the Roster
   Manager may publish.
3. **Positions** and **Outlets** — the masters are seeded from the existing
   roster; adjust them to match today's team.
4. **Employees** — add the team, or import the history first (step 6) with
   *Create employee records* ticked and tidy them up afterwards.
5. **Administration → Staffing Rules** — the minimum cover the roster is checked
   against. Three starting rules are seeded; they are examples, not policy.
6. **Administration → Excel Import** — upload
   `Shan Village - Duty Roster.xlsx`, review what was understood, then import.
   Imported weeks are published and locked as history.
7. **Administration → Users** — create a login per employee and link each one to
   its employee record. Assign **Roster Manager** to Phyu Sin Maung, **Staff** to
   everyone else.
8. **Shift Templates** — set the real unpaid break on each shift before the
   hours report is used for pay.

---

## 4. Verifying a deployment

```bash
npm run verify    # lint, typecheck, unit tests, production build
npm run db:test   # RLS and workflow tests against a local PostgreSQL 16
```

Worth checking by hand after the first deploy:

- Sign in as a staff account and try `/dashboard`, `/employees`, `/admin/users` —
  each should redirect you to the staff home, not render.
- With a draft roster for next week, confirm the staff account cannot see it.
- Publish it and confirm it appears, and that the staff member is notified.
- Confirm the Roster Manager account sees no Financial tab in the Approval Centre.

---

## 5. Backups and upgrades

Supabase takes daily backups on paid plans; enable Point-in-Time Recovery if the
restaurant relies on the roster for pay. Before a schema change, take a manual
backup from **Database → Backups**.

New migrations are added as new numbered files in `supabase/migrations/` and
applied the same way. Never edit a migration that has already been applied to
production — add another one.

---

## 6. Adding a future module

The architecture is ready; the work is bounded:

1. Add tables in a new migration, with RLS policies following the patterns in
   `20260101000600_rls.sql`.
2. Activate the permission rows already seeded for that module (`wastage.create`,
   `inventory.count`, …) by setting `is_active = true`.
3. Build the pages under a route guarded by `requireModule('<key>')`.
4. Add a section to `NAV_SECTIONS` in `src/lib/navigation.ts` with
   `module: '<key>'` on its items.
5. Enable the module in **Administration → Modules**.

Employees, outlets, users, roles, permissions, audit, notifications and settings
are already shared — a new module must not create its own copies of any of them.
