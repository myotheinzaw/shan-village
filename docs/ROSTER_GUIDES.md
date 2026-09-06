# The three roster guide decks

Built from `scripts/guides/`, the same way as the six page guides in `GUIDES.md`:
one generator per deck, rebuilt from source rather than edited slide by slide.

| Deck | Built by | For | Passwords inside |
|---|---|---|---|
| `Shan Village - Sign-in and Duty Roster Guide.pptx` | `login.py` | the owner only | **all nine accounts** |
| `Shan Village - Staff Guide (roster and leave).pptx` | `staff_guide.py` | all five staff | none |
| `Shan Village - Roster Manager Guide.pptx` | `manager_guide.py` | Hla Kyawt Khing, Phyu Sin Maung | none |

`_common.py` holds the shared palette, slide helpers and the 16:9 setup. Each generator
starts with `exec(open('_common.py').read())`, so a colour or layout change is made once.

## Links

Every address in the three decks is a real clickable hyperlink, not just text to retype:
24 of them across the three files. `_common.py` defines the two that matter —

```python
APP    = "https://shan-schedule-crew.lovable.app"
ROSTER = APP + "/team-roster"
```

— and `text()` takes an optional sixth element on a run tuple, the URL:

```python
[("shan-schedule-crew.lovable.app/team-roster", 12.5, ORANGE, True, MONO, ROSTER)]
```

The address is set before the colour, otherwise PowerPoint repaints the run in its own
link blue and the palette is lost. Each deck also closes on a `links_slide()` page of
tappable addresses, chosen for who is reading it:

| Deck | Links on the closing page |
|---|---|
| Sign-in | sign in · team roster · roster builder · approvals · users & roles · audit log |
| Staff | team roster · sign in · my roster · requests |
| Roster manager | roster builder · team roster · approvals · monthly · staff · shifts |

The paths are taken from `buildNav()` in `src/components/AppShell.tsx`, so a link that
needs a permission still lands on the right screen for the person who has it.

## Building them

```bash
pip install python-pptx        # once; the only dependency
cd scripts/guides

# the two password-free decks — no environment variables at all
SV_OUT='Shan Village - Staff Guide (roster and leave).pptx'  python3 staff_guide.py
SV_OUT='Shan Village - Roster Manager Guide.pptx'            python3 manager_guide.py
```

## The passwords are not in this repository

`login.py` reads all nine from the environment and refuses to run without them, so the
deck can never be rebuilt by accident with stale or invented values:

```bash
SV_OWNER1_PW=... SV_OWNER2_PW=... SV_ADMIN_PW=... SV_CHEF_PW=... \
SV_STAFF_WIN=... SV_STAFF_THI=... SV_STAFF_KAU=... SV_STAFF_NAY=... SV_STAFF_MAR=... \
SV_OUT='Shan Village - Sign-in and Duty Roster Guide.pptx' python3 login.py
```

The built `.pptx` files are deliberately **not committed**. The sign-in deck carries nine
live passwords; putting it in git would leave them in the history for good, retrievable
long after the file itself was deleted. The other two are password-free but follow the
same rule for consistency with `GUIDES.md`.

## Who can do what, as built into the deck text

Verified against the database on 6 September 2026, not assumed from the UI:

| | Amend the roster | Publish | Unlock |
|---|---|---|---|
| Owners (`admin` role) | yes | yes | yes |
| Hla Kyawt Khing (`roster_manager`) | yes | yes | yes |
| Phyu Sin Maung (`chef`) | yes | yes | yes |
| The five staff | **no** | **no** | **no** |

`roster.publish` and `roster.unlock` were granted to the `roster_manager` and `chef` roles
on 6 September 2026 at the owner's instruction. Staff writes are refused by row-level
security on `roster_assignments` — every INSERT, UPDATE and DELETE is gated on
`has_permission(auth.uid(), 'roster.edit')` — so the block holds even against a direct
API call, not only in the interface.

## A stale setting worth deleting

`app_settings.manager_can_publish` exists but nothing reads it. Publishing is governed
entirely by the `roster.publish` permission. It was set to `true` so it no longer
contradicts reality, but it is dead weight and should be dropped.

The sign-in deck's closing checklist used to tell the owner to "decide whether managers
may publish" in Settings. That row was wrong for the same reason and now reads that both
managers already have publish and unlock, granted as role permissions.

## What the decks say, in one line each

- **Sign-in** — where to sign in, the forced first-password change, all nine accounts,
  what each role sees, and how to build, publish and share a week.
- **Staff** — the public roster link versus the personal login; my roster; asking for
  leave, a shift change or a swap; and that a request changes nothing until approved.
- **Roster manager** — filling the grid, the Draft/Published/Locked states, and why
  publishing updates the shared link with no new link to send.
