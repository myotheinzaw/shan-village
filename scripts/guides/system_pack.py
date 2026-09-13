"""The one complete pack: links, every login, and how to run the system.

Passwords come from the environment, never from this file. Build with:

    cd scripts/guides
    SV_OWNER2_PW=... SV_WIN_PW=... SV_THIHA_PW=... SV_KAUNG_PW=... \
    SV_NAY_PW=... SV_MARIAM_PW=... SV_MAYSI_PW=... \
    SV_OUT='Shan Village - Roster System Pack.pptx' python3 system_pack.py
"""
import os
exec(open('_common.py').read())

BUILDER   = APP + "/roster/builder"
REQUESTS  = APP + "/requests"
APPROVALS = APP + "/approvals"
STAFF     = APP + "/staff"
MYROSTER  = APP + "/roster"
SETTINGS  = APP + "/admin/settings"
USERS     = APP + "/admin/users"


_PW = {}
_pw_file = os.environ.get("SV_PW_FILE")
if _pw_file and os.path.exists(_pw_file):
    import json
    _PW = json.load(open(_pw_file))


def pw(key):
    v = _PW.get(key) or os.environ.get(key)
    return v if v else "(set " + key + ")"


# ------------------------------------------------------------------ 1 cover
s = prs.slides.add_slide(BLANK)
rect(s, 0, 0, W, H, DARK)
rect(s, 0, Inches(4.42), W, Pt(4), ORANGE)
text(s, Inches(0.9), Inches(2.15), Inches(11.5), Inches(0.35),
     [("SHAN VILLAGE · DUBAI", 13, GOLD, True, BODY)])
text(s, Inches(0.9), Inches(2.62), Inches(11.5), Inches(1.1),
     [("Roster System — Users and Guide", 46, CREAM, True, DISP)])
text(s, Inches(0.9), Inches(4.75), Inches(11.5), Inches(0.9),
     [[("Every address, every login, and how the system is run.", 16, MUTED, False, BODY)],
      [("shan-schedule-crew.lovable.app", 15, ORANGE, True, MONO, APP)]], spacing=7)
text(s, Inches(0.9), Inches(6.35), Inches(11.5), Inches(0.6),
     [[("This file contains passwords for 10 accounts. Owner copy — do not forward whole.",
        12, GOLD, True, BODY)],
      [("Send each person only their own line.", 11.5, FAINT, False, BODY)]], spacing=3)

# ------------------------------------------------------------- 2 where to go
s = prs.slides.add_slide(BLANK)
header(s, "Step 1", "Where to sign in",
       "One address for everyone — owner, manager, chef and staff.")
box(s, Inches(0.7), Inches(2.2), Inches(6.1), Inches(1.5), WHITE, LINE)
rect(s, Inches(0.7), Inches(2.2), Pt(4.5), Inches(1.5), ORANGE)
text(s, Inches(1.05), Inches(2.45), Inches(5.5), Inches(1.0),
     [[("Web address", 11, MUTED, True, BODY)],
      [("shan-schedule-crew", 17, ORANGE, True, MONO, APP)],
      [(".lovable.app", 17, ORANGE, True, MONO, APP)]], spacing=4)
box(s, Inches(7.0), Inches(2.2), Inches(5.63), Inches(1.5), SUNK, LINE)
text(s, Inches(7.35), Inches(2.42), Inches(5.0), Inches(1.1),
     [[("Put it on the phone home screen", 12.5, INK, True, DISP)],
      [("iPhone — Share → Add to Home Screen", 11, MUTED, False, BODY)],
      [("Android — ⋮ menu → Add to Home screen", 11, MUTED, False, BODY)]], spacing=3)
rows = [("1", "Type the email given to you", "Nothing else is needed — no sign-up, no forgot-password."),
        ("2", "Type the password given to you", "Treat a shared password as a door key, not a secret."),
        ("3", "Press the orange Sign in button", "You land on your own home screen."),
        ("4", "If asked, choose your own password", "From then on only you know it.")]
y = 4.05
for num, t, why in rows:
    box(s, Inches(0.7), Inches(y), Inches(11.93), Inches(0.64), WHITE, LINE)
    rect(s, Inches(0.7), Inches(y), Pt(4.5), Inches(0.64), GOLD)
    text(s, Inches(1.0), Inches(y), Inches(0.4), Inches(0.64),
         [(num, 15, ORANGE, True, DISP)], anchor=MSO_ANCHOR.MIDDLE)
    text(s, Inches(1.5), Inches(y), Inches(4.3), Inches(0.64),
         [(t, 13, INK, True, BODY)], anchor=MSO_ANCHOR.MIDDLE)
    text(s, Inches(6.0), Inches(y), Inches(6.4), Inches(0.64),
         [(why, 11, MUTED, False, BODY)], anchor=MSO_ANCHOR.MIDDLE)
    y += 0.72
foot(s, 2)


# ------------------------------------------------------- account slide maker
def accounts(kicker, title, sub, entries, page, note=None):
    s = prs.slides.add_slide(BLANK)
    header(s, kicker, title, sub)
    y = Inches(2.25)
    for name, role, email, password, state in entries:
        h = Inches(0.92)
        box(s, Inches(0.7), y, Inches(11.93), h, WHITE, LINE)
        rect(s, Inches(0.7), y, Pt(4.5), h, ORANGE)
        text(s, Inches(1.05), y, Inches(3.1), h,
             [[(name, 14.5, INK, True, DISP)], [(role, 10.5, MUTED, False, BODY)]],
             anchor=MSO_ANCHOR.MIDDLE, spacing=2)
        text(s, Inches(4.3), y, Inches(3.7), h,
             [[("EMAIL", 8, FAINT, True, BODY)], [(email, 11.5, INK, False, MONO)]],
             anchor=MSO_ANCHOR.MIDDLE, spacing=2)
        text(s, Inches(8.1), y, Inches(2.9), h,
             [[("PASSWORD", 8, FAINT, True, BODY)], [(password, 12, DEEP, True, MONO)]],
             anchor=MSO_ANCHOR.MIDDLE, spacing=2)
        col = GREEN if state == "set" else ORANGE
        txt = "own password set" if state == "set" else "must change on first sign-in"
        text(s, Inches(11.1), y, Inches(1.35), h,
             [(txt, 8.5, col, True, BODY)], align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
        y += h + Inches(0.14)
    if note:
        text(s, Inches(0.7), Inches(6.45), Inches(11.9), Inches(0.4),
             [(note, 11, MUTED, False, BODY)])
    foot(s, page)


accounts("Accounts · 1 of 3", "Owners and management",
         "Full access for owners. The roster manager and chef are limited to their jobs.",
         [("Myo Thein Zaw", "Owner · full access", "myotheinzaw@googlemail.com",
           "— known only to you —", "set"),
          ("Shan Village Dubai", "Owner · full access", "shanvillagedubai@googlemail.com",
           pw("SV_OWNER2_PW"), "set"),
          ("Hla Kyawt Khing", "Roster manager", "admin.staff@shanvillage.local",
           "— she set her own —", "set"),
          ("Phyu Sin Maung", "Chef · weekly roster only", "chef.lead@shanvillage.local",
           "— he set his own —", "set")],
         3,
         "Four people have already chosen their own password. Nobody can read those back — the system "
         "stores only a one-way hash. If one is forgotten it has to be reset, not looked up.")

accounts("Accounts · 2 of 3", "Kitchen staff",
         "Each person sees only their own roster and their own requests.",
         [("Win Paing", "Commis II", "win.paing@shanvillage.local", pw("SV_WIN_PW"), "change"),
          ("Thiha Naing Soe", "Commis II", "thiha.naing.soe@shanvillage.local", pw("SV_THIHA_PW"), "change"),
          ("Kaung Htet Zaw", "Commis II", "kaung.htet.zaw@shanvillage.local", pw("SV_KAUNG_PW"), "change"),
          ("Nay Lin Htet", "Commis II", "nay.lin.htet@shanvillage.local", pw("SV_NAY_PW"), "change")],
         4,
         "These four must choose their own password the first time they sign in. The password above "
         "stops working the moment they do.")

accounts("Accounts · 3 of 3", "Kitchen staff, continued", None,
         [("Mariam", "Stewarding · part-time", "mariam@shanvillage.local", pw("SV_MARIAM_PW"), "change"),
          ("Maysi Aung", "Commis III · Kitchen", "maysi.aung@shanvillage.local", pw("SV_MAYSI_PW"), "set")],
         5,
         "Maysi Aung is not forced to change hers, because it was shared with her directly. She can "
         "change it any time under Profile.")

# ------------------------------------------------------- 6 who can do what
s = prs.slides.add_slide(BLANK)
header(s, "Access", "Who can do what",
       "The same login shows a different system to each person — nothing is merely hidden.")
cols = ["", "Owner", "Roster mgr", "Chef", "Staff"]
grid = [
    ("See own roster", "yes", "yes", "yes", "yes"),
    ("Build the weekly roster", "yes", "yes", "yes", "—"),
    ("Publish a week to staff", "yes", "yes", "yes", "—"),
    ("Monthly view", "yes", "yes", "—", "—"),
    ("Raise a leave request", "yes", "yes", "yes", "yes"),
    ("Review a request", "yes", "yes", "—", "—"),
    ("Approve a request", "yes", "—", "—", "—"),
    ("Staff records, shifts, reports", "yes", "yes", "—", "—"),
    ("Settings, users, audit log", "yes", "—", "—", "—"),
]
xs = [0.7, 6.0, 7.75, 9.5, 11.2]
ws = [5.2, 1.7, 1.7, 1.7, 1.43]
text(s, Inches(xs[0]), Inches(2.15), Inches(ws[0]), Inches(0.3),
     [("", 10, FAINT, True, BODY)])
for i in range(1, 5):
    text(s, Inches(xs[i]), Inches(2.15), Inches(ws[i]), Inches(0.3),
         [(cols[i].upper(), 9.5, FAINT, True, BODY)], align=PP_ALIGN.CENTER)
y = 2.5
for row in grid:
    box(s, Inches(0.7), Inches(y), Inches(11.93), Inches(0.44),
        WHITE if grid.index(row) % 2 == 0 else SUNK, LINE)
    text(s, Inches(1.0), Inches(y), Inches(5.0), Inches(0.44),
         [(row[0], 12, INK, False, BODY)], anchor=MSO_ANCHOR.MIDDLE)
    for i in range(1, 5):
        v = row[i]
        text(s, Inches(xs[i]), Inches(y), Inches(ws[i]), Inches(0.44),
             [(v, 11.5, GREEN if v == "yes" else FAINT, v == "yes", BODY)],
             align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    y += 0.48
text(s, Inches(0.7), Inches(y + 0.12), Inches(11.9), Inches(0.4),
     [("Every one of these is enforced by the database, not by hiding a button. Typing a web address "
       "you are not allowed to open returns nothing.", 11, MUTED, False, BODY)])
foot(s, 6)

# ------------------------------------------------- 7 building a week
s = prs.slides.add_slide(BLANK)
header(s, "The weekly roster", "Building and publishing a week",
       "Hla Kyawt Khing and Phyu Sin Maung both do this. Staff see nothing until it is published.")
steps = [
    ("1", "Open the roster builder", "Roster in the menu. Pick the week with the date box at the top right.",
     BUILDER),
    ("2", "Tap a square to set a shift", "Choose a saved shift, or type the times. Past midnight is 24:00, 24:30.", None),
    ("3", "Copy last week if it is similar", "Then change only what differs. Faster than starting empty.", None),
    ("4", "Watch the hours column", "Over 10 hours in a day is overtime and is ringed in amber.", None),
    ("5", "Press Publish", "Only now can staff see it. Before that the week is invisible to them.", None),
]
y = 2.2
for num, t, why, url in steps:
    box(s, Inches(0.7), Inches(y), Inches(11.93), Inches(0.82), WHITE, LINE)
    rect(s, Inches(0.7), Inches(y), Pt(4.5), Inches(0.82), ORANGE if num == "5" else GOLD)
    text(s, Inches(1.0), Inches(y), Inches(0.45), Inches(0.82),
         [(num, 17, ORANGE, True, DISP)], anchor=MSO_ANCHOR.MIDDLE)
    runs = [[(t, 13.5, INK, True, DISP)], [(why, 11, MUTED, False, BODY)]]
    if url:
        runs.append([(url.replace("https://", ""), 10.5, ORANGE, True, MONO, url)])
    text(s, Inches(1.55), Inches(y), Inches(10.8), Inches(0.82), runs,
         anchor=MSO_ANCHOR.MIDDLE, spacing=2)
    y += 0.9
text(s, Inches(0.7), Inches(y + 0.1), Inches(11.9), Inches(0.4),
     [("Every shift now carries a 60 minute break unless you change it on the day.",
       11.5, DEEP, True, BODY)])
foot(s, 7)

# ------------------------------------------------- 8 leave, how it works
s = prs.slides.add_slide(BLANK)
header(s, "Leave", "How a leave request travels",
       "Nobody approves their own leave, and no leave reaches the owner unreviewed.")
flow = [("Staff member", "Raises the request on their phone under Requests.", ORANGE),
        ("Hla Kyawt Khing", "Reviews it against the roster and marks it reviewed.", GOLD),
        ("Owner", "Approves or rejects. Only an owner can approve.", ORANGE),
        ("The roster", "Approved leave writes itself onto the week automatically.", GREEN)]
x = 0.7
for i, (who, what, col) in enumerate(flow):
    box(s, Inches(x), Inches(2.3), Inches(2.85), Inches(1.9), WHITE, LINE)
    rect(s, Inches(x), Inches(2.3), Inches(2.85), Pt(5), col)
    text(s, Inches(x + 0.25), Inches(2.62), Inches(2.35), Inches(1.4),
         [[(who, 14, INK, True, DISP)], [(what, 10.5, MUTED, False, BODY)]], spacing=5)
    if i < 3:
        text(s, Inches(x + 2.88), Inches(3.05), Inches(0.35), Inches(0.4),
             [("→", 20, FAINT, True, BODY)], align=PP_ALIGN.CENTER)
    x += 3.07
rules = [("Annual Leave", "30 days a year, earned day by day from the joining date. "
          "You can only take what has been earned so far."),
         ("Sick", "A doctor's note or DHA certificate must be attached, or the request will not send."),
         ("Public Holiday", "Only when days have been granted. Nobody has a balance until it is set."),
         ("Unpaid", "Always available.")]
y = 4.6
for name, rule in rules:
    box(s, Inches(0.7), Inches(y), Inches(11.93), Inches(0.5), SUNK, LINE)
    text(s, Inches(1.0), Inches(y), Inches(2.6), Inches(0.5),
         [(name, 12.5, DEEP, True, DISP)], anchor=MSO_ANCHOR.MIDDLE)
    text(s, Inches(3.7), Inches(y), Inches(8.7), Inches(0.5),
         [(rule, 11, MUTED, False, BODY)], anchor=MSO_ANCHOR.MIDDLE)
    y += 0.56
foot(s, 8)

# ------------------------------------------------- 9 probation and balances
s = prs.slides.add_slide(BLANK)
header(s, "Leave", "Probation and balances",
       "Under six months of service, leave is neither shown nor allowed — but it is still being earned.")
box(s, Inches(0.7), Inches(2.2), Inches(5.9), Inches(2.3), WHITE, LINE)
rect(s, Inches(0.7), Inches(2.2), Inches(5.9), Pt(5), ORANGE)
text(s, Inches(1.05), Inches(2.5), Inches(5.2), Inches(1.9),
     [[("Inside six months", 15, INK, True, DISP)],
      [("The balance card shows the probation end date instead of a number.", 11.5, MUTED, False, BODY)],
      [("Annual Leave and Public Holiday cannot be requested at all.", 11.5, MUTED, False, BODY)],
      [("Sick and Unpaid stay available — illness does not wait.", 11.5, MUTED, False, BODY)]], spacing=6)
box(s, Inches(6.75), Inches(2.2), Inches(5.88), Inches(2.3), WHITE, LINE)
rect(s, Inches(6.75), Inches(2.2), Inches(5.88), Pt(5), GREEN)
text(s, Inches(7.1), Inches(2.5), Inches(5.2), Inches(1.9),
     [[("The day probation ends", 15, INK, True, DISP)],
      [("The full figure appears on its own, including every day earned during probation.",
        11.5, MUTED, False, BODY)],
      [("Nothing has to be run and nothing is lost.", 11.5, MUTED, False, BODY)]], spacing=6)
text(s, Inches(0.7), Inches(4.75), Inches(11.9), Inches(0.3),
     [("WHERE EACH PERSON STANDS", 10, FAINT, True, BODY)])
who = [("Hla Kyawt Khing", "1 Jun 2025", "past probation"),
       ("Win Paing", "19 Jun 2025", "past probation"),
       ("Phyu Sin Maung", "5 Jul 2025", "past probation"),
       ("Thiha Naing Soe", "14 Oct 2025", "past probation"),
       ("Kaung Htet Zaw", "27 May 2026", "until 27 Nov 2026"),
       ("Mariam", "9 Jun 2026", "no annual leave · part-time"),
       ("Nay Lin Htet", "20 Aug 2026", "until 20 Feb 2027"),
       ("Maysi Aung", "31 Aug 2026", "until 28 Feb 2027")]
y = 5.1
for i, (name, joined, state) in enumerate(who):
    x = 0.7 if i < 4 else 6.75
    yy = y + (i % 4) * 0.42
    box(s, Inches(x), Inches(yy), Inches(5.9 if i < 4 else 5.88), Inches(0.38), SUNK, LINE)
    text(s, Inches(x + 0.28), Inches(yy), Inches(2.4), Inches(0.38),
         [(name, 11, INK, True, BODY)], anchor=MSO_ANCHOR.MIDDLE)
    text(s, Inches(x + 2.7), Inches(yy), Inches(1.3), Inches(0.38),
         [(joined, 10, MUTED, False, MONO)], anchor=MSO_ANCHOR.MIDDLE)
    text(s, Inches(x + 4.0), Inches(yy), Inches(1.75), Inches(0.38),
         [(state, 9.5, DEEP if "until" in state else FAINT, "until" in state, BODY)],
         align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
foot(s, 9)

# ------------------------------------------------- 10 what you can change
s = prs.slides.add_slide(BLANK)
header(s, "Owner only", "Rules you can change yourself",
       "These are settings, not code. Change one and it applies everywhere, with no rebuild.")
sets = [("Annual leave days per year", "30", "Everyone, unless a person has their own figure."),
        ("Probation months", "6", "How long before leave can be taken and the balance shown."),
        ("Default break minutes", "60", "Applied to every new shift."),
        ("Allow negative leave balance", "off", "On would let someone take leave they have not earned."),
        ("Overtime threshold", "10 hours", "Above this in one day is flagged as overtime.")]
y = 2.25
for name, val, why in sets:
    box(s, Inches(0.7), Inches(y), Inches(11.93), Inches(0.72), WHITE, LINE)
    rect(s, Inches(0.7), Inches(y), Pt(4.5), Inches(0.72), GOLD)
    text(s, Inches(1.05), Inches(y), Inches(4.4), Inches(0.72),
         [(name, 13, INK, True, DISP)], anchor=MSO_ANCHOR.MIDDLE)
    text(s, Inches(5.6), Inches(y), Inches(1.5), Inches(0.72),
         [(val, 14, DEEP, True, MONO)], anchor=MSO_ANCHOR.MIDDLE)
    text(s, Inches(7.2), Inches(y), Inches(5.2), Inches(0.72),
         [(why, 11, MUTED, False, BODY)], anchor=MSO_ANCHOR.MIDDLE)
    y += 0.8
text(s, Inches(0.7), Inches(y + 0.1), Inches(7.5), Inches(0.35),
     [[("Administration → Settings", 12, INK, True, BODY)],
      [(SETTINGS.replace("https://", ""), 11, ORANGE, True, MONO, SETTINGS)]], spacing=3)
text(s, Inches(8.4), Inches(y + 0.1), Inches(4.2), Inches(0.35),
     [[("Add a person or reset a password", 12, INK, True, BODY)],
      [(USERS.replace("https://", ""), 11, ORANGE, True, MONO, USERS)]], spacing=3)
foot(s, 10)

# ------------------------------------------------- 11 links
links_slide("Every address", "The links, in one place",
            "Tap any of these. They are live hyperlinks in this file.",
            [("Sign in", APP, "Everyone starts here"),
             ("My roster", MYROSTER, "What a staff member sees"),
             ("Roster builder", BUILDER, "Build and publish the week"),
             ("Requests", REQUESTS, "Raise leave, see your balance"),
             ("Approvals", APPROVALS, "Review and approve"),
             ("Staff records", STAFF, "Joining dates, leave, logins")], 11)

prs.save(os.environ.get("SV_OUT", "Shan Village - Roster System Pack.pptx"))
print("wrote", os.environ.get("SV_OUT", "Shan Village - Roster System Pack.pptx"),
      "-", len(prs.slides.__iter__.__self__._sldIdLst), "slides")
