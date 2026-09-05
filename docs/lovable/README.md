# Shan Village — Lovable build pack

Everything needed to finish the Lovable build, staged so it can be sent in one
sitting once workspace credits are topped up.

- **Project**: Shan Village — Operations Management System
- **Lovable project id**: `45c8a29b-83d2-45eb-9d90-a88722cfadb2`
- **Editor**: https://lovable.dev/projects/45c8a29b-83d2-45eb-9d90-a88722cfadb2
- **Preview**: https://id-preview--45c8a29b-83d2-45eb-9d90-a88722cfadb2.lovable.app

## State as of 5 Sep 2026

Built and working:

- Database schema with Row Level Security on every table
- Permission-key authorisation (33 keys), roles, database-enforced invariants
- `scheduled_hours` computed in the database (cross-midnight, 24:00/24:30, split shifts)
- Roster builder, publish/lock, staff view, requests, Approval Centre, reports,
  printable A4 sheet, CSV export
- One-time "Create the owner account" setup screen
- Correct branding: **Shan Village / Operations Management System**

Not done — the build currently **does not compile**:

1. Three admin pages were never written (Users & roles, Settings, Audit log)
   while the sidebar still links to them.
2. The real roster data was never loaded. Lovable silently dropped that message —
   it returned `accepted` but never appeared in the thread. What is in the
   database now is 8 invented sample employees and 63 sample assignments.

## Send these in order

| # | File | Purpose |
|---|------|---------|
| 1 | `01-finish-build.md` | Write the 3 missing admin pages, get a clean build |
| 2 | `02-brand-logo.md` | Apply the real Shan Village logo |
| 3 | `03-owner-accounts-and-access-control.md` | Two Owner accounts + the access control panel |
| 4 | `04-data-import.md` | Replace samples with the real 18 people / 1,358 shifts |

Send them one at a time and wait for each to finish. Message 4 is the one that
was dropped before — if the thread does not show it after sending, split it in
half and resend rather than assuming it landed.

## Data files referenced by message 4

- `data/export/employees.csv` — 18 employees, 7 active / 11 former
- `data/export/shift-templates.csv` — 58 shapes: 14 reusable, 44 historical one-offs
- `data/export/roster.csv` — 194 lines covering 22 weeks and 1,358 assignments

Source of truth: `data/artifact-state.json`, the live roster state published
24 Aug 2026.

## Passwords

Deliberately **not** stored in this repo. They were handed over in chat only and
should be changed after first login.
