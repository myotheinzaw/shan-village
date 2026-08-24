# Shared Duty Roster

A read-only duty roster anyone can open on a phone — no login, no app to
install — behind a short access code.

---

## 1. How it works

```
Staff phone                        Application                     Database
───────────                        ───────────                     ────────
QR code by the time clock
   │
   ▼
/r/<token>                 ──►  roster_link_resolve()      ──►  is the link live?
   │                                                            does it want a code?
   ▼  code
"ShanChef-8264"            ──►  roster_unlock()            ──►  bcrypt compare
   │                                                            issue a 12h session
   │  ◄── httpOnly cookie, scoped to /r/<token>
   ▼
the roster                 ──►  roster_share_week()        ──►  PUBLISHED weeks only
   │                                                            inside the allowed window
   ▼  (Owner / Admin only)
the Change Log             ──►  roster_share_change_log()  ──►  the audit trail, reduced
```

Nothing on the page decides what may be seen. The link token and the session
are handed to the database, and the functions there return what that pairing is
entitled to. Edit the cookie and the answer is nothing.

---

## 2. The lock

Three codes, one per role. **The only thing the role decides is whether the
Change Log is readable.**

| Who | Code | Can do |
|---|---|---|
| Owner | `ShanOwner-5027` | the published roster, and reads the Change Log |
| Admin | `ShanAdmin-4713` | the published roster, and reads the Change Log |
| Chef | `ShanChef-8264` | the published roster |

> **Change these before you rely on them.** They are seeded by migration 1300,
> which lives in the repository, so anyone who can read the repository can read
> them. **Roster → Roster Links → Access codes → Change code** rehashes a new
> one in the database and touches no file, which is the only place a code should
> ever live. Doing so also locks out everyone still using the old code.

Mechanics worth knowing:

- Codes are stored as **bcrypt hashes**. A code cannot be read back from any
  screen, log or export — a forgotten code is replaced, not recovered.
- A correct code issues an **opaque session token**, kept in an httpOnly cookie
  scoped to that one link's path, valid **12 hours**. Unlocking the card by the
  time clock does not unlock the card by the pass.
- **Ten wrong codes in fifteen minutes** and that link stops answering — to the
  right code as well. It starts answering again by itself.
- Every failure looks identical: a wrong code, an unknown link, a revoked link
  and a rate-limited link give the same sentence, because telling them apart
  would tell a guesser which.
- **Lock this phone** in the footer clears the session, for a borrowed device.
- Changing a code ends every session opened with it, immediately.

---

## 3. What the link shows, and what it never shows

Shows: employee name, position, and the shift — start and finish, split shifts,
OFF, PH, Trial. Who is on each day. Optionally weekly hours and shift notes.

Never shows, for anybody, with any code:

- **A draft roster.** The query condition is `status = 'PUBLISHED'`, character
  for character the same as the staff RLS policy. A locked historical week is
  not shown either.
- **Why someone is on leave.** Every kind of leave renders as a bare `Leave`.
  That a person is off is roster information; that they are sick is not.
- **Anything else from the employee record** — no contact number, no employee
  code, no employment status, no pay.
- **Any week outside the link's window.** Two weeks back and four ahead by
  default; a leaked address cannot be walked through the archive.
- **The before/after JSON in the audit trail.** The Change Log is reduced to
  when, who, which person, which date, and what changed.

Weekly hours and shift notes are **off** by default per link, because a roster
on a wall is read by anyone walking past it.

---

## 4. Setting one up

**Staff & Roster → Roster Links → New link.** One per outlet:

| Field | Meaning |
|---|---|
| Name | Management-only label, e.g. "Mall — by the time clock" |
| Outlet | Tie it to one outlet and it shows only that outlet's roster |
| Weeks back / ahead | How far the arrows go. Keeps a leaked address away from the archive |
| Show weekly hours | Off by default |
| Show shift notes | Off by default |
| Ask for an access code | On by default |
| Expires | Blank for a link that does not expire |

Then **Copy**, turn the address into a QR code, and put it where the team
already looks for the roster. **New address** issues a fresh token and kills the
old one at once — that is the answer to a printed card that has gone missing.
The view counter and "last used" tell you whether a card is being used at all.

Requires the `roster.share` permission, which the Roster Manager role holds and
Staff does not.

---

## 5. On the page itself

- **Find your name** — typing two letters collapses the table to that line,
  which is the first thing anybody does with a roster on a phone.
- Today's column is highlighted, and each day's header says how many people are
  on.
- Arrows move a week at a time and stop at the edges of the window.
- A week that has not been published yet says so, rather than looking broken.

---

## 6. Security summary

`anon` has no privilege on `roster_links`, `share_access_codes`,
`share_sessions` or `share_code_attempts` — the last two have RLS enabled and
**no policy at all**, so no interactive role can read them either. Six
`SECURITY DEFINER` functions are the entire public surface:

| Function | Needs | Gives |
|---|---|---|
| `roster_link_resolve` | a live token | the label, outlet, window, and whether a code is wanted |
| `roster_unlock` | token + correct code | a 12-hour session |
| `roster_session_resolve` | token + session | the role and whether it reads the Change Log |
| `roster_share_week` | token + session (when locked) | one published week |
| `roster_share_change_log` | token + an Owner/Admin session | the reduced audit trail |
| `share_code_set` | `roster.share` **and** a signed-in caller | rehashes one code |

All of it is asserted in `scripts/test-rls.sql` (sections 15 and 15b) against
the real migrations: `npm run db:test`.

The link is **read-only**. Nothing here can change a roster — publishing and
editing stay behind a real login, so every change keeps a named person against
it in the audit trail rather than "whoever knew the code".
