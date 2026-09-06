import os

# Passwords come from the environment, never from this file.
def pw(k):
    v = os.environ.get(k)
    if not v:
        raise SystemExit(f"missing env {k}")
    return v

exec(open('_common.py').read())

# ---------------------------------------------------------------- 1 title
s = prs.slides.add_slide(BLANK)
bg(s)
rect(s, 0, 0, W, Inches(4.5), DARK)
rect(s, 0, Inches(4.5), W, Pt(4), ORANGE)
text(s, Inches(1.0), Inches(1.35), Inches(11), Inches(0.3),
     [("SHAN VILLAGE · DUBAI", 12, GOLD, True, BODY)])
text(s, Inches(1.0), Inches(1.8), Inches(11), Inches(1.0),
     [("Signing in & using the duty roster", 40, CREAM, True, DISP)])
text(s, Inches(1.0), Inches(2.95), Inches(9.5), Inches(0.9),
     [("Every account, the password each person starts with, and the steps to build, "
       "publish and share a week's roster.", 15, RGBColor(0xC9, 0xBB, 0x9C), False, BODY)])
box(s, Inches(1.0), Inches(5.05), Inches(5.4), Inches(1.15), WHITE, LINE)
text(s, Inches(1.3), Inches(5.28), Inches(4.9), Inches(0.7),
     [[("Open the app at", 11, MUTED, False, BODY)],
      [("shan-schedule-crew.lovable.app", 15.5, ORANGE, True, MONO, APP)]], spacing=4)
box(s, Inches(6.7), Inches(5.05), Inches(5.6), Inches(1.15), SUNK, LINE)
text(s, Inches(7.0), Inches(5.28), Inches(5.0), Inches(0.7),
     [[("Keep this deck private", 11, MUTED, False, BODY)],
      [("It contains first-time passwords for 9 accounts.", 13, INK, True, BODY)]], spacing=4)
text(s, Inches(1.0), Inches(6.55), Inches(8), Inches(0.3),
     [("Prepared 6 September 2026 · times shown in the app are Dubai time", 10, FAINT, False, BODY)])

# ---------------------------------------------------------------- 2 where to sign in
s = prs.slides.add_slide(BLANK)
header(s, "Step 1", "Where to sign in", "The same address for everyone — owner, manager, chef and staff.")
box(s, Inches(0.7), Inches(2.2), Inches(5.9), Inches(2.0), DARK, DARK)
text(s, Inches(1.05), Inches(2.5), Inches(5.2), Inches(1.5),
     [[("Web address", 11, GOLD, True, BODY)],
      [("shan-schedule-crew", 19, CREAM, True, MONO, APP)],
      [(".lovable.app", 19, CREAM, True, MONO, APP)],
      [("Works in any browser, on a phone or a laptop.", 11.5, RGBColor(0xB8, 0xAC, 0x93), False, BODY)]], spacing=6)
box(s, Inches(0.7), Inches(4.4), Inches(5.9), Inches(2.2), WHITE, LINE)
text(s, Inches(1.05), Inches(4.68), Inches(5.2), Inches(1.7),
     [[("Add it to the phone home screen", 13.5, INK, True, DISP)],
      [("iPhone — Share  →  Add to Home Screen", 12, MUTED, False, BODY)],
      [("Android — ⋮ menu  →  Add to Home screen", 12, MUTED, False, BODY)],
      [("It then opens like an app, with the Shan Village logo.", 11.5, FAINT, False, BODY)]], spacing=7)
box(s, Inches(7.0), Inches(2.2), Inches(5.6), Inches(4.4), WHITE, LINE)
text(s, Inches(7.35), Inches(2.5), Inches(5.0), Inches(0.4),
     [("What the sign-in page asks for", 15, INK, True, DISP)])
rows = [("Email", "the address from the next three slides"),
        ("Password", "the one printed beside that email"),
        ("Sign in", "the orange button")]
y = Inches(3.05)
for label, note in rows:
    box(s, Inches(7.35), y, Inches(4.9), Inches(0.62), SUNK, LINE)
    text(s, Inches(7.6), y + Inches(0.1), Inches(1.3), Inches(0.4),
         [(label, 12.5, INK, True, BODY)], anchor=MSO_ANCHOR.MIDDLE)
    text(s, Inches(9.0), y + Inches(0.1), Inches(3.1), Inches(0.4),
         [(note, 11.5, MUTED, False, BODY)], anchor=MSO_ANCHOR.MIDDLE)
    y += Inches(0.78)
text(s, Inches(7.35), Inches(5.6), Inches(4.9), Inches(0.9),
     [[("There is no “sign up” and no “forgot password”.", 12, INK, True, BODY)],
      [("Accounts are created by the owner under Administration → Users & roles.", 11.5, MUTED, False, BODY)]], spacing=5)
foot(s, 2)

# ---------------------------------------------------------------- 3 first sign-in
s = prs.slides.add_slide(BLANK)
header(s, "Step 2", "The first sign-in sets a private password",
       "Eight of the nine accounts still hold their temporary password.")
steps = [("1", "Sign in with the password from this deck", "It is temporary and shared — treat it as a door key, not a secret."),
         ("2", "The app opens on Profile and asks for a new password", "Nothing else unlocks until this is done."),
         ("3", "Type the new password twice, at least 8 characters", "Then press “Set my password”."),
         ("4", "That is the password from then on", "The one in this deck stops working. Nobody else knows the new one.")]
y = Inches(2.15)
for num, title, note in steps:
    box(s, Inches(0.7), y, Inches(7.6), Inches(0.95), WHITE, LINE)
    c = box(s, Inches(0.95), y + Inches(0.18), Inches(0.58), Inches(0.58), ORANGE, ORANGE)
    text(s, Inches(0.95), y + Inches(0.27), Inches(0.58), Inches(0.4),
         [(num, 16, WHITE, True, DISP)], align=PP_ALIGN.CENTER)
    text(s, Inches(1.75), y + Inches(0.16), Inches(6.3), Inches(0.65),
         [[(title, 13.5, INK, True, BODY)], [(note, 11.5, MUTED, False, BODY)]], spacing=3)
    y += Inches(1.09)
box(s, Inches(8.7), Inches(2.15), Inches(3.9), Inches(2.2), SUNK, LINE)
text(s, Inches(9.0), Inches(2.42), Inches(3.3), Inches(1.7),
     [[("Already done", 13.5, INK, True, DISP)],
      [("Myo Thein Zaw — the owner account — has set its own password and is not asked again.", 11.5, MUTED, False, BODY)]], spacing=6)
box(s, Inches(8.7), Inches(4.55), Inches(3.9), Inches(2.05), WHITE, DEEP, 1.5)
text(s, Inches(9.0), Inches(4.82), Inches(3.3), Inches(1.5),
     [[("Changing it later", 13.5, INK, True, DISP)],
      [("Profile → New password → Change password. Any account, any time.", 11.5, MUTED, False, BODY)]], spacing=6)
foot(s, 3)


# ---------------------------------------------------------------- account slides
def account_slide(kicker, title, sub, entries, page, note=None):
    s = prs.slides.add_slide(BLANK)
    header(s, kicker, title, sub)
    y = Inches(2.25)
    for name, role, email, password, tag in entries:
        h = Inches(1.12)
        box(s, Inches(0.7), y, Inches(11.93), h, WHITE, LINE)
        rect(s, Inches(0.7), y, Pt(4.5), h, ORANGE)
        text(s, Inches(1.05), y + Inches(0.17), Inches(3.3), Inches(0.8),
             [[(name, 15, INK, True, DISP)], [(role, 11, MUTED, False, BODY)]], spacing=3)
        text(s, Inches(4.5), y + Inches(0.17), Inches(3.9), Inches(0.8),
             [[("EMAIL", 8.5, FAINT, True, BODY)], [(email, 12, INK, False, MONO)]], spacing=3)
        text(s, Inches(8.5), y + Inches(0.17), Inches(2.9), Inches(0.8),
             [[("PASSWORD", 8.5, FAINT, True, BODY)], [(password, 12, DEEP, True, MONO)]], spacing=3)
        col = GREEN if tag == "set" else ORANGE
        txt = "own password set" if tag == "set" else "must change on first sign-in"
        text(s, Inches(11.5), y + Inches(0.38), Inches(1.0), Inches(0.5),
             [(txt, 8.5, col, True, BODY)], align=PP_ALIGN.RIGHT)
        y += h + Inches(0.16)
    if note:
        text(s, Inches(0.7), Inches(6.5), Inches(11.9), Inches(0.35),
             [(note, 11, MUTED, False, BODY)])
    foot(s, page)


# ---------------------------------------------------------------- 4 owners
account_slide(
    "Accounts · 1 of 3", "Owner accounts", "Full access, including Users & roles, Settings and the Audit log.",
    [("Myo Thein Zaw", "Owner · admin", "myotheinzaw@googlemail.com", pw("SV_OWNER1_PW"), "set"),
     ("Shan Village Dubai", "Owner · admin", "shanvillagedubai@googlemail.com", pw("SV_OWNER2_PW"), "change")],
    4,
    "An owner sees everything: the roster for all four outlets, staff records, reports, and the append-only audit log.")

# ---------------------------------------------------------------- 5 managers
account_slide(
    "Accounts · 2 of 3", "Manager accounts", "Build and publish rosters, review requests — no admin screens, no audit log.",
    [("Hla Kyawt Khing", "Admin staff · roster_manager · Mall", "admin.staff@shanvillage.local", pw("SV_ADMIN_PW"), "change"),
     ("Phyu Sin Maung", "Chef leader · chef · Mall", "chef.lead@shanvillage.local", pw("SV_CHEF_PW"), "change")],
    5,
    "Both can build, publish, lock and unlock a week. Staff can never change a roster cell \u2014 the database refuses the write, whatever the screen shows.")

# ---------------------------------------------------------------- 6 staff
staff = [("Win Paing", "s02", "win.paing@shanvillage.local", "SV_STAFF_WIN"),
         ("Thiha Naing Soe", "s03", "thiha.naing.soe@shanvillage.local", "SV_STAFF_THI"),
         ("Kaung Htet Zaw", "s04", "kaung.htet.zaw@shanvillage.local", "SV_STAFF_KAU"),
         ("Nay Lin Htet", "s05", "nay.lin.htet@shanvillage.local", "SV_STAFF_NAY"),
         ("Mariam", "s06", "mariam@shanvillage.local", "SV_STAFF_MAR")]
s = prs.slides.add_slide(BLANK)
header(s, "Accounts · 3 of 3", "Staff accounts",
       "The simple Staff App: Home · Roster · Requests · Profile. Published weeks only.")
y = Inches(2.25)
for name, code, email, envk in staff:
    h = Inches(0.78)
    box(s, Inches(0.7), y, Inches(11.93), h, WHITE, LINE)
    rect(s, Inches(0.7), y, Pt(4.5), h, GOLD)
    text(s, Inches(1.05), y + Inches(0.2), Inches(2.9), Inches(0.4),
         [[(name, 14, INK, True, DISP), ("   " + code, 10.5, FAINT, False, MONO)]])
    text(s, Inches(4.5), y + Inches(0.22), Inches(3.9), Inches(0.4),
         [(email, 12, INK, False, MONO)])
    text(s, Inches(8.5), y + Inches(0.22), Inches(2.9), Inches(0.4),
         [(pw(envk), 12, DEEP, True, MONO)])
    text(s, Inches(11.5), y + Inches(0.24), Inches(1.0), Inches(0.4),
         [("must change", 8.5, ORANGE, True, BODY)], align=PP_ALIGN.RIGHT)
    y += h + Inches(0.13)
box(s, Inches(0.7), Inches(6.05), Inches(11.93), Inches(0.72), SUNK, LINE)
text(s, Inches(1.0), Inches(6.24), Inches(11.3), Inches(0.4),
     [[("A staff member never sees a draft week. ", 12, INK, True, BODY),
       ("That is enforced by the database, not by hiding a menu — an unpublished roster does not reach their phone at all.",
        12, MUTED, False, BODY)]])
foot(s, 6)

# ---------------------------------------------------------------- 7 staff: link + login
s = prs.slides.add_slide(BLANK)
header(s, "For the team", "The link and the login",
       "Two separate things. The link needs no account; the login is personal.")

box(s, Inches(0.7), Inches(2.15), Inches(5.9), Inches(3.5), WHITE, LINE)
rect(s, Inches(0.7), Inches(2.15), Inches(5.9), Pt(5), GOLD)
text(s, Inches(1.05), Inches(2.45), Inches(5.2), Inches(0.75),
     [[("The weekly roster link", 17, INK, True, DISP)],
      [("No login, no app, no password.", 11.5, FAINT, False, BODY)]], spacing=4)
box(s, Inches(1.05), Inches(3.32), Inches(5.2), Inches(0.58), SUNK, LINE)
text(s, Inches(1.3), Inches(3.45), Inches(4.9), Inches(0.35),
     [("shan-schedule-crew.lovable.app/team-roster", 11.5, ORANGE, True, MONO, ROSTER)])
yy = Inches(4.15)
for t in ["Three tabs — last week, this week, next week",
          "Everyone's shifts, all outlets: a noticeboard",
          "Published weeks only — a draft never appears",
          "Paste it in the WhatsApp group once, for good"]:
    text(s, Inches(1.05), yy, Inches(5.2), Inches(0.32),
         [[("\u00b7  ", 12, GOLD, True, BODY), (t, 11.5, MUTED, False, BODY)]])
    yy += Inches(0.36)

box(s, Inches(6.9), Inches(2.15), Inches(5.73), Inches(3.5), WHITE, LINE)
rect(s, Inches(6.9), Inches(2.15), Inches(5.73), Pt(5), ORANGE)
text(s, Inches(7.25), Inches(2.45), Inches(5.1), Inches(0.75),
     [[("Their own login", 17, INK, True, DISP)],
      [("Four things, and nothing else.", 11.5, FAINT, False, BODY)]], spacing=4)
mine = [("My roster", "own shifts \u2014 this week, next week, and a month grid with the hours total"),
        ("Leave balance", "days entitled, taken, pending and remaining"),
        ("Apply", "leave \u00b7 shift change \u00b7 swap a day with a colleague"),
        ("Notices", "whatever the office has posted")]
yy = Inches(3.3)
for label, note in mine:
    text(s, Inches(7.25), yy, Inches(5.1), Inches(0.55),
         [[(label + " \u2014 ", 12.5, ORANGE, True, BODY), (note, 11.5, MUTED, False, BODY)]])
    yy += Inches(0.6)

box(s, Inches(0.7), Inches(5.85), Inches(11.93), Inches(0.82), WHITE, DEEP, 1.5)
text(s, Inches(1.0), Inches(6.0), Inches(11.4), Inches(0.6),
     [[("Two gaps to close.  ", 12.5, DEEP, True, BODY),
       ("Attendance history does not exist yet \u2014 the month total is hours ", 11.5, MUTED, False, BODY),
       ("rostered", 11.5, INK, True, BODY),
       (", not hours worked. And no leave entitlement has been entered, so balances read \u201cnot set\u201d and nothing caps a request.", 11.5, MUTED, False, BODY)]])
foot(s, 7)

# ---------------------------------------------------------------- 8 who sees what
s = prs.slides.add_slide(BLANK)
header(s, "Orientation", "What each person sees after signing in",
       "The same login, two different products — decided by permissions, not by role name.")
cols = [("Staff App", "Win Paing, Thiha, Kaung, Nay Lin, Mariam",
         ["Home", "Roster — own shifts, published weeks", "Requests — leave and shift changes", "Profile"], GOLD),
        ("Management", "Hla Kyawt Khing · Phyu Sin Maung",
         ["Home", "Roster (builder) · Monthly", "Requests · Approvals", "Staff · Shifts · Reports", "Notices · Profile"], ORANGE),
        ("Management + Administration", "Myo Thein Zaw · Shan Village Dubai",
         ["Everything a manager sees, plus:", "Users & roles", "Settings", "Audit log"], DEEP)]
x = Inches(0.7)
for title, who, items, accent in cols:
    box(s, x, Inches(2.2), Inches(3.87), Inches(4.35), WHITE, LINE)
    rect(s, x, Inches(2.2), Inches(3.87), Pt(5), accent)
    text(s, x + Inches(0.3), Inches(2.48), Inches(3.3), Inches(0.75),
         [[(title, 15.5, INK, True, DISP)], [(who, 10.5, FAINT, False, BODY)]], spacing=4)
    yy = Inches(3.35)
    for it in items:
        text(s, x + Inches(0.3), yy, Inches(3.3), Inches(0.32),
             [[("·  ", 12, accent, True, BODY), (it, 12, MUTED, False, BODY)]])
        yy += Inches(0.42)
    x += Inches(4.03)
foot(s, 8)

# ---------------------------------------------------------------- 9 build a week
s = prs.slides.add_slide(BLANK)
header(s, "Duty roster · 1 of 3", "Building a week", "Roster → pick the outlet → pick the week → fill the grid.")
items = [("Pick the outlet", "The four pills at the top left: Mall, Night Market, Mangoon, Good Luck."),
         ("Pick the week", "Arrows either side of the date box step a week back or forward."),
         ("Create the week", "“Create empty week”, or “Create by copying last week” to start from the previous rota."),
         ("Fill a cell", "Tap any square: choose a shift template, or type start and end times. Mark OFF, public holiday, leave or trial."),
         ("Copy last week", "Fills the whole grid from the previous week in one press. “Clear week” empties it again."),
         ("Watch the two number rows", "Hours per person on the right; headcount per day along the bottom, red when below the minimum.")]
y = Inches(2.2)
for i, (title, note) in enumerate(items):
    box(s, Inches(0.7), y, Inches(7.5), Inches(0.68), WHITE if i % 2 == 0 else SUNK, LINE)
    text(s, Inches(1.0), y + Inches(0.12), Inches(7.0), Inches(0.5),
         [[(title + " — ", 12.5, INK, True, BODY), (note, 11.5, MUTED, False, BODY)]])
    y += Inches(0.74)
box(s, Inches(8.6), Inches(2.2), Inches(4.03), Inches(2.1), DARK, DARK)
text(s, Inches(8.9), Inches(2.48), Inches(3.45), Inches(1.6),
     [[("Amber ring", 12.5, GOLD, True, BODY)],
      [("A shift longer than the daily overtime threshold (10 hours by default — an editable setting).",
        11.5, RGBColor(0xC9, 0xBB, 0x9C), False, BODY)]], spacing=5)
box(s, Inches(8.6), Inches(4.5), Inches(4.03), Inches(2.1), WHITE, DEEP, 1.5)
text(s, Inches(8.9), Inches(4.78), Inches(3.45), Inches(1.6),
     [[("Red corner dot", 12.5, DEEP, True, BODY)],
      [("An imported row that needs a manager's eye. Open the cell and save it to clear the flag.",
        11.5, MUTED, False, BODY)]], spacing=5)
foot(s, 9)

# ---------------------------------------------------------------- 10 publish
s = prs.slides.add_slide(BLANK)
header(s, "Duty roster · 2 of 3", "Draft → Published → Locked", "Three states. Only the middle one reaches the team.")
states = [("DRAFT", "Being built", "Invisible to staff. Edit freely.", MUTED),
          ("PUBLISHED", "The team can see it", "Staff see their own shifts. You can still edit.", ORANGE),
          ("LOCKED", "Frozen", "No edits without the unlock permission — owner only.", DARK)]
x = Inches(0.7)
for name, head, note, accent in states:
    box(s, x, Inches(2.2), Inches(3.87), Inches(1.95), WHITE, LINE)
    rect(s, x, Inches(2.2), Inches(3.87), Pt(5), accent)
    text(s, x + Inches(0.3), Inches(2.5), Inches(3.3), Inches(1.3),
         [[(name, 15, accent, True, MONO)],
          [(head, 13, INK, True, DISP)],
          [(note, 11.5, MUTED, False, BODY)]], spacing=4)
    x += Inches(4.03)
box(s, Inches(0.7), Inches(4.35), Inches(11.93), Inches(2.15), SUNK, LINE)
text(s, Inches(1.05), Inches(4.62), Inches(11.2), Inches(0.35),
     [("How to move between them", 15, INK, True, DISP)])
moves = [("Publish", "Top right of the roster page. Add an optional note — “Eid week, extra cover on Friday” — then confirm."),
         ("Lock", "Appears once published. Freezes the week so nothing changes after payroll has read it."),
         ("Unlock", "Owner only. The week goes back to editable."),
         ("History", "Every create, edit, publish, lock and unlock — with who and when.")]
y = Inches(5.1)
for label, note in moves:
    text(s, Inches(1.05), y, Inches(11.2), Inches(0.32),
         [[(label + "  ", 12.5, ORANGE, True, BODY), (note, 11.5, MUTED, False, BODY)]])
    y += Inches(0.33)
foot(s, 10)

# ---------------------------------------------------------------- 11 share
s = prs.slides.add_slide(BLANK)
header(s, "Duty roster · 3 of 3", "Getting it to the team", "Four ways out of the roster page.")
outs = [("Copy roster link", "Puts a public link on the clipboard — paste it into the WhatsApp group. No login needed. Shows published weeks only: last, this and next."),
        ("Print", "Opens a clean printable sheet for the noticeboard."),
        ("CSV", "Downloads the week as a spreadsheet — one row per person, hours and overtime included."),
        ("Requests & Approvals", "Staff send leave and shift-change requests from their phone; managers clear them under Approvals.")]
y = Inches(2.2)
for i, (title, note) in enumerate(outs):
    box(s, Inches(0.7), y, Inches(11.93), Inches(1.0), WHITE, LINE)
    rect(s, Inches(0.7), y, Pt(4.5), Inches(1.0), ORANGE if i < 3 else GOLD)
    text(s, Inches(1.05), y + Inches(0.16), Inches(3.0), Inches(0.6),
         [(title, 14.5, INK, True, DISP)])
    text(s, Inches(4.3), y + Inches(0.2), Inches(8.0), Inches(0.6),
         [(note, 12, MUTED, False, BODY)])
    y += Inches(1.12)
text(s, Inches(0.7), Inches(6.6), Inches(11.9), Inches(0.3),
     [[("The public link is ", 11, MUTED, False, BODY),
       ("shan-schedule-crew.lovable.app/team-roster", 11, INK, True, MONO, ROSTER),
       ("  — it never shows a draft, and never shows pay or contact details.", 11, MUTED, False, BODY)]])
foot(s, 11)

# ---------------------------------------------------------------- 12 housekeeping
s = prs.slides.add_slide(BLANK)
header(s, "Before you hand these out", "Five things worth doing this week")
todo = [("Print or forward one row at a time", "Send each person only their own line — not the whole deck."),
        ("Watch the eight temporary passwords disappear", "Administration → Users & roles shows who has signed in."),
        ("Remember both managers can publish and unlock", "Granted 6 Sep 2026. Neither can be undone from Settings — it is a role permission."),
        ("Set the leave entitlement for each person", "Still empty — the app will not invent a number."),
        ("Keep the audit log in mind", "Every change is recorded and cannot be edited or deleted, by anyone.")]
y = Inches(2.05)
for i, (title, note) in enumerate(todo):
    box(s, Inches(0.7), y, Inches(11.93), Inches(0.86), WHITE if i % 2 == 0 else SUNK, LINE)
    c = box(s, Inches(1.0), y + Inches(0.19), Inches(0.48), Inches(0.48), DARK, DARK)
    text(s, Inches(1.0), y + Inches(0.26), Inches(0.48), Inches(0.35),
         [(str(i + 1), 13, GOLD, True, DISP)], align=PP_ALIGN.CENTER)
    text(s, Inches(1.7), y + Inches(0.16), Inches(10.6), Inches(0.6),
         [[(title, 13, INK, True, BODY)], [(note, 11.5, MUTED, False, BODY)]], spacing=2)
    y += Inches(0.98)
box(s, Inches(0.7), Inches(6.05), Inches(11.93), Inches(0.72), WHITE, DEEP, 1.5)
text(s, Inches(1.0), Inches(6.24), Inches(11.3), Inches(0.4),
     [[("This deck is the only place these passwords are written down. ", 12, DEEP, True, BODY),
       ("Once everyone has set their own, it is safe to delete it.", 12, MUTED, False, BODY)]])
foot(s, 12)

# ---------------------------------------------------------------- 13 links
links_slide("Keep this page", "Every address in one place",
            "The first two are all most people ever need.",
            [("Sign in", APP, "Everyone — owner, managers and staff"),
             ("Weekly roster", ROSTER, "Public. No login. Share this one"),
             ("Roster builder", APP + "/roster/builder", "Build, publish, lock a week"),
             ("Approvals", APP + "/approvals", "Leave and shift requests waiting"),
             ("Users & roles", APP + "/admin/users", "Add a person, reset a password"),
             ("Audit log", APP + "/admin/audit", "Every change, permanent")], 13)

out = os.environ["SV_OUT"]
prs.save(out)
print("saved", out, os.path.getsize(out), "bytes,", len(prs.slides.__iter__.__self__._sldIdLst), "slides")
