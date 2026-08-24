# Wastage Module

Staff report what they throw away from a phone, in about fifteen seconds, without
a login. Management reviews the day's log, and the day's workbook lands in the
Owner's Google Drive folder.

---

## 1. How it works end to end

```
Staff phone                    Application                      Google Drive
───────────                    ───────────                      ────────────
QR code by the bin
   │
   ▼
/w/<token>            ──►  public.wastage_link_resolve()
   photo                     (checks the token, returns
   note                       today's date and time in
   date  (today)              the restaurant's timezone)
   time  (now)
   price (optional)
   │
   ▼ submit
/api/wastage/submit   ──►  photo → private Supabase bucket
                           row   → public.wastage_submit()
                           │
                           └──►  after the reply is sent:
                                 publish the day's workbook  ──►  Management System/
                                                                    Daily Wastage Reports/
                                                                      Shan Village Wastage 2026-08-24.xlsx
                                                                      Photos/
                                                                        2026-08-24/
                                                                          WS-2026-00001 1405.jpg
```

The workbook is **rewritten in place** all day, so one day is always one file at
one stable link, however many entries arrive.

Photos are **never** written next to the workbook. They go into a `Photos`
sub-folder, one folder per day, and each row of the spreadsheet carries a
hyperlink straight to its picture.

---

## 2. What a staff member sees

`/w/<token>` — no login, no app to install, works on any phone browser:

| Field | Behaviour |
|---|---|
| Photo | Big camera button. The picture is downscaled to 1600px in the browser before it is uploaded, so it goes over restaurant wifi in a moment. |
| What was thrown away | Free text. Optional. |
| Note | Free text. Optional. |
| Why | The reason list from **Wastage → Wastage Reasons**. Optional unless you turn it on. |
| How much / unit | Optional. |
| Value | Optional, and deliberately so — "leave it blank, a guess is worse than nothing". |
| Outlet | Hidden when the link is tied to one outlet, which is the intended setup. |
| Date | Defaults to **today** in the restaurant's timezone, taken from the server, not the phone. Cannot be set in the future or more than a week back. |
| Time | Defaults to **now**, same source. Editable. |
| Your name | Remembered on that phone for next time. Required unless you switch it off per link. |

An entry needs a photo, an item, or a note. All three blank is refused.

---

## 3. Setting it up

### 3.1 Create the links

**Wastage → Submission Links → New link.** Make one per outlet and set the outlet
on it — that removes a question from the form. Print each address as a QR code
and put it where the wastage happens: by the bin, on the walk-in door, next to
the pass.

Each link has:

- an **hourly ceiling** (default 60 entries) so one leaked address is a
  nuisance, not an open write endpoint;
- an optional **expiry**;
- **New address**, which issues a fresh token and kills the old one immediately.
  Entries already filed keep their history.

The token is the only credential on the public form, so treat a printed QR code
the way you would treat a door key.

### 3.2 Connect Google Drive

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or pick)
   a project and **enable the Google Drive API**.
2. **IAM & Admin → Service Accounts → Create service account.** Name it
   something like `shan-village-wastage`. No project roles are needed.
3. On the service account, **Keys → Add key → Create new key → JSON**. Download it.
4. Open the Drive folder the reports should live in, **Share** it with the
   service account's email (`…@….iam.gserviceaccount.com`) as an **Editor**.
   This step is the one people miss: without it Drive replies *"File not found"*
   for a folder that plainly exists.
5. Put these in the environment (Vercel → Settings → Environment Variables):

   ```
   GOOGLE_SERVICE_ACCOUNT_EMAIL   client_email from the JSON
   GOOGLE_PRIVATE_KEY             private_key from the JSON, \n escapes intact
   GOOGLE_DRIVE_WASTAGE_FOLDER_ID the folder id from its URL
   CRON_SECRET                    openssl rand -base64 32
   ```

6. Redeploy.

The folder id is the last part of the folder's URL:
`https://drive.google.com/drive/folders/`**`1N-185axMNfrq49iXSlLTH1iF-mo15uRy`**

> **Personal Drive vs Shared Drive.** A service account has no storage quota of
> its own. Writing into a folder in someone's personal *My Drive* works, and the
> files count against that person's quota. If you ever see
> `storageQuotaExceeded`, move the folder into a **Shared Drive** and add the
> service account as a member — the client already sends `supportsAllDrives`.

### 3.3 Settings

**Administration → Settings**, category *wastage*:

| Setting | Default | What it does |
|---|---|---|
| `wastage_drive_folder_id` | the Management System folder | Overrides `GOOGLE_DRIVE_WASTAGE_FOLDER_ID`. Change the destination without a deployment. |
| `wastage_drive_subfolder` | `Daily Wastage Reports` | Created inside the folder above on first use. Blank writes straight into the folder. |
| `wastage_auto_export` | on | Rewrite the day's workbook after each submission. |
| `wastage_photos_to_drive` | on | Copy each photo into `Photos/<date>/` beside the workbook. |
| `wastage_require_photo` | off | Refuse an entry with no picture. |
| `wastage_require_reason` | off | Make the reason list mandatory. |

---

## 4. Publishing

Three things publish the workbook, and all three write the same file:

1. **After each submission** — a background task, run once the reporter already
   has their confirmation, so a slow Drive never delays the person at the bin.
2. **Publish to Google Drive** on the Wastage screen — for a manager who has
   just corrected something.
3. **Hourly cron** (`/api/cron/wastage`, scheduled in `vercel.json`) — it
   republishes today and yesterday. Yesterday, because a late shift files its
   wastage after midnight, and because it repairs any day where Drive was
   unreachable at the time.

Every attempt, including every failure, is a row in `wastage_exports`, and the
Wastage screen shows the latest one. A report that has quietly stopped
publishing is the failure that matters, so it is stated on the screen rather
than left to be noticed.

If Drive is not configured the module still works completely — entries, photos,
review and the **Download Excel** button all function. Only the automatic copy
into Drive is skipped, and the screen says so.

---

## 5. The workbook

`Shan Village Wastage 2026-08-24.xlsx`, two sheets:

- **Wastage** — one row per entry: reference, time, outlet, item, quantity,
  reason, estimated value, who reported it, how it was submitted, status, note,
  and a hyperlink to the photo. Totals at the bottom.
- **Summary** — by reason, by outlet, and by person; biggest value first,
  because the point of the summary is what to fix tomorrow.

Two rules the numbers follow:

- **Rejected entries are excluded from every total** but stay on the sheet. A
  manager disagreeing with an entry is part of the day's record.
- **A missing price counts as nothing, never as a guess.** The header says how
  many entries had no price, so the total is read as a floor rather than as the
  full cost.

---

## 6. Permissions

| Permission | Held by default | Meaning |
|---|---|---|
| `wastage.create` | Staff, Roster Manager | Record an entry from inside the app |
| `wastage.view` | Roster Manager | See the log and the reports |
| `wastage.approve` | Roster Manager | Confirm or reject an entry |
| `wastage.export` | Roster Manager | Publish the workbook to Drive |
| `wastage.manage` | Roster Manager | Mint and revoke links, edit reasons |
| `wastage.dashboard` | Roster Manager | Totals and trends |
| `wastage.cost_view` | **Admin only** | See what wastage was worth |
| `wastage.delete` | **Nobody** | Remove an entry from the log entirely |

`wastage.cost_view` follows the same rule as `finance.view` in Phase 1: a
manager who reviews entries does not thereby see the money. Without it, the
value column is absent from the screen, from the download and from the totals —
masked in `src/lib/data/wastage.ts`, since RLS protects rows and not columns.

`wastage.delete` is granted to no role at all. Rejecting an entry is the honest
way to dismiss it; an admin can still delete, because `app.has_permission()`
short-circuits for admins.

---

## 7. Security notes

The public form is the only unauthenticated write in the system, so it is worth
being precise about what an anonymous caller can do.

- `anon` has **no** table privileges — the blanket revoke from migration 0600
  is repeated for every wastage table.
- Three `SECURITY DEFINER` functions are granted to `anon` and nothing else:
  `wastage_link_resolve`, `wastage_form_options`, `wastage_submit`. Each checks
  the link token itself.
- `wastage_submit` sets `source`, `status` and `link_id` on its own, so a caller
  cannot file an entry that claims to have come from management, nor pre-approve
  their own.
- An unknown, revoked and expired token are indistinguishable in the response:
  all three simply return nothing.
- Photos live in a **private** bucket. Management reaches one through a 15-minute
  signed URL issued by `/api/wastage/photo/[id]`, and only after RLS on the entry
  row has already agreed the caller may see it.
- Every entry, link and reason change is audited.

All of this is asserted in `scripts/test-rls.sql` (section 13–14) against the
real migrations: run `npm run db:test`.
