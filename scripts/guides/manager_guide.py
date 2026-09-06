exec(open('_common.py').read())

def bullet(s, x, y, w, items, accent, size=12, gap=0.4):
    yy = y
    for t in items:
        text(s, x, yy, w, Inches(0.34),
             [[("·  ", size, accent, True, BODY), (t, size, MUTED, False, BODY)]])
        yy += Inches(gap)
    return yy

def step(s, x, y, w, num, title, note, h=0.86, accent=None):
    accent = accent or ORANGE
    box(s, x, y, w, Inches(h), WHITE, LINE)
    box(s, x + Inches(0.25), y + Inches(0.15), Inches(0.54), Inches(0.54), accent, accent)
    text(s, x + Inches(0.25), y + Inches(0.23), Inches(0.54), Inches(0.4),
         [(num, 15, WHITE, True, DISP)], align=PP_ALIGN.CENTER)
    text(s, x + Inches(1.0), y + Inches(0.13), w - Inches(1.28), Inches(0.68),
         [[(title, 13, INK, True, BODY)], [(note, 11.5, MUTED, False, BODY)]], spacing=3)

# ---------------------------------------------------------------- 1 title
s = prs.slides.add_slide(BLANK)
bg(s)
rect(s, 0, 0, W, Inches(4.3), DARK)
rect(s, 0, Inches(4.3), W, Pt(4), ORANGE)
text(s, Inches(1.0), Inches(1.25), Inches(11), Inches(0.3),
     [("SHAN VILLAGE · FOR THE ROSTER MANAGERS", 12, GOLD, True, BODY)])
text(s, Inches(1.0), Inches(1.7), Inches(11), Inches(1.0),
     [("Building and publishing the week", 38, CREAM, True, DISP)])
text(s, Inches(1.0), Inches(2.9), Inches(9.5), Inches(0.9),
     [("For Hla Kyawt Khing and Phyu Sin Maung — how to fill the grid, release it to the team, "
       "and what happens to the roster link when you do.", 15, RGBColor(0xC9, 0xBB, 0x9C), False, BODY)])
box(s, Inches(1.0), Inches(4.85), Inches(11.3), Inches(1.25), WHITE, LINE)
text(s, Inches(1.35), Inches(5.1), Inches(10.6), Inches(0.8),
     [[("You can now publish and unlock.", 15.5, ORANGE, True, BODY)],
      [("Granted 6 September 2026. You no longer wait for an owner to release a week.",
        12, MUTED, False, BODY)]], spacing=4)
text(s, Inches(1.0), Inches(6.45), Inches(9), Inches(0.3),
     [("Your own email and password are on the sign-in card you were given", 10, FAINT, False, BODY)])

# ---------------------------------------------------------------- 2 what you can do
s = prs.slides.add_slide(BLANK)
header(s, "Your access", "What you can do — and what you cannot",
       "Both of you hold the same rights over the roster.")
box(s, Inches(0.7), Inches(2.2), Inches(5.9), Inches(4.4), WHITE, LINE)
rect(s, Inches(0.7), Inches(2.2), Inches(5.9), Pt(5), GREEN)
text(s, Inches(1.05), Inches(2.5), Inches(5.2), Inches(0.4),
     [("Yours to do", 17, INK, True, DISP)])
bullet(s, Inches(1.05), Inches(3.05), Inches(5.2),
       ["Create a week and fill every cell",
        "Copy last week, clear a week, delete a week",
        "Publish — release it to the whole team",
        "Lock a week so it stops changing",
        "Unlock a locked week and edit it again",
        "Approve or refuse leave and shift requests",
        "Add and edit staff, shifts and positions",
        "Read the reports and export them"], GREEN, 12, 0.44)
box(s, Inches(7.0), Inches(2.2), Inches(5.63), Inches(2.1), SUNK, LINE)
text(s, Inches(7.35), Inches(2.48), Inches(5.0), Inches(1.6),
     [[("Only the owner", 15.5, INK, True, DISP)],
      [("Users and roles · system settings · the audit log · deciding who may publish.",
        12, MUTED, False, BODY)]], spacing=6)
box(s, Inches(7.0), Inches(4.5), Inches(5.63), Inches(2.1), WHITE, DEEP, 1.5)
text(s, Inches(7.35), Inches(4.78), Inches(5.0), Inches(1.6),
     [[("Everything is recorded", 15.5, INK, True, DISP)],
      [("Every edit, publish, lock and unlock is written to the audit log with your name and "
        "the time. It cannot be edited or deleted — not by you, not by the owner.",
        12, MUTED, False, BODY)]], spacing=6)
foot(s, 2)

# ---------------------------------------------------------------- 3 build the week
s = prs.slides.add_slide(BLANK)
header(s, "Step 1", "Filling the grid", "Roster in the left menu. Pick the outlet, then the week.")
y = Inches(2.15)
for n, t, d in [("1", "Choose the outlet", "The pills at the top: Mall, Night Market, Mangoon, Good Luck."),
                ("2", "Choose the week", "Arrows either side of the date box move a week at a time."),
                ("3", "Create it", "“Create empty week”, or “Create by copying last week”."),
                ("4", "Tap a cell to set the shift", "Pick a shift template, or type start and end times. Or mark OFF, leave, holiday, trial."),
                ("5", "“Copy last week” fills everything", "Then change only what differs. “Clear week” empties it again.")]:
    step(s, Inches(0.7), y, Inches(7.4), n, t, d)
    y += Inches(0.94)
box(s, Inches(8.5), Inches(2.15), Inches(4.13), Inches(2.25), DARK, DARK)
text(s, Inches(8.8), Inches(2.42), Inches(3.55), Inches(1.75),
     [[("Watch the bottom row", 14, GOLD, True, DISP)],
      [("Headcount per day. It turns red when fewer than 3 people are on — the minimum the "
        "owner set.", 11.5, RGBColor(0xC9, 0xBB, 0x9C), False, BODY)]], spacing=6)
box(s, Inches(8.5), Inches(4.6), Inches(4.13), Inches(2.0), WHITE, LINE)
text(s, Inches(8.8), Inches(4.85), Inches(3.55), Inches(1.55),
     [[("Watch the right column", 14, INK, True, DISP)],
      [("Hours per person, against their weekly target. Amber ring on a cell = over 10 hours "
        "that day.", 11.5, MUTED, False, BODY)]], spacing=6)
foot(s, 3)

# ---------------------------------------------------------------- 4 three states
s = prs.slides.add_slide(BLANK)
header(s, "Step 2", "Draft → Published → Locked",
       "The team only ever sees the middle two.")
states = [("DRAFT", "Nobody sees it", "Yours to build. Invisible to staff and invisible on the link.", MUTED),
          ("PUBLISHED", "The team sees it", "On their phones and on the link. You can still edit it.", ORANGE),
          ("LOCKED", "Frozen", "No more edits. Use it once payroll has read the week.", DARK)]
x = Inches(0.7)
for name, head_, note, accent in states:
    box(s, x, Inches(2.2), Inches(3.87), Inches(2.05), WHITE, LINE)
    rect(s, x, Inches(2.2), Inches(3.87), Pt(5), accent)
    text(s, x + Inches(0.3), Inches(2.5), Inches(3.3), Inches(1.4),
         [[(name, 15, accent, True, MONO)],
          [(head_, 13.5, INK, True, DISP)],
          [(note, 11.5, MUTED, False, BODY)]], spacing=4)
    x += Inches(4.03)
box(s, Inches(0.7), Inches(4.45), Inches(11.93), Inches(2.15), SUNK, LINE)
text(s, Inches(1.05), Inches(4.7), Inches(11.2), Inches(0.35),
     [("The four buttons, top right of the roster page", 15, INK, True, DISP)])
moves = [("Publish", "Shown while the week is a draft. Add a note if you want — “Eid week, extra cover Friday”."),
         ("Lock", "Appears once it is published. Freezes the week."),
         ("Unlock", "Reopens a locked week so you can edit it. You both have this now — use it sparingly."),
         ("History", "Who created, edited, published, locked or unlocked this week, and when.")]
y = Inches(5.2)
for label, note in moves:
    text(s, Inches(1.05), y, Inches(11.2), Inches(0.32),
         [[(label + "  ", 12.5, ORANGE, True, BODY), (note, 11.5, MUTED, False, BODY)]])
    y += Inches(0.34)
foot(s, 4)

# ---------------------------------------------------------------- 5 the link updates itself
s = prs.slides.add_slide(BLANK)
header(s, "Step 3", "Publishing updates the link by itself",
       "This is the part worth understanding properly.")
box(s, Inches(0.7), Inches(2.15), Inches(11.93), Inches(1.55), DARK, DARK)
text(s, Inches(1.05), Inches(2.4), Inches(11.2), Inches(1.1),
     [[("The link never changes: ", 13, RGBColor(0xC9, 0xBB, 0x9C), False, BODY),
       ("shan-schedule-crew.lovable.app/team-roster", 14.5, GOLD, True, MONO)],
      [("It is not a picture and not a file. Every time somebody opens it, it reads the roster "
        "out of the system as it stands at that moment. Publish a week and it is there — no new "
        "link, no re-sending, no re-uploading.", 12, RGBColor(0xC9, 0xBB, 0x9C), False, BODY)]], spacing=6)
flow = [("You press Publish", "The week changes from Draft to Published."),
        ("The link picks it up", "Anyone opening it now sees the new week."),
        ("Staff see it in their app", "Under “My roster”, on their own line only.")]
x = Inches(0.7)
for i, (t, d) in enumerate(flow):
    box(s, x, Inches(3.95), Inches(3.6), Inches(1.5), WHITE, LINE)
    rect(s, x, Inches(3.95), Inches(3.6), Pt(5), ORANGE)
    text(s, x + Inches(0.28), Inches(4.22), Inches(3.05), Inches(1.05),
         [[(t, 14, INK, True, DISP)], [(d, 11.5, MUTED, False, BODY)]], spacing=5)
    if i < 2:
        text(s, x + Inches(3.68), Inches(4.5), Inches(0.35), Inches(0.4),
             [("→", 20, ORANGE, True, BODY)], align=PP_ALIGN.CENTER)
    x += Inches(4.03)
box(s, Inches(0.7), Inches(5.65), Inches(11.93), Inches(1.0), WHITE, DEEP, 1.5)
text(s, Inches(1.05), Inches(5.83), Inches(11.3), Inches(0.7),
     [[("One limit worth knowing.  ", 12.5, DEEP, True, BODY),
       ("The link only ever shows three weeks — last, this and next. Publish a week further "
        "ahead than that and it is real, staff can see it in their own app, but it will not appear "
        "on the link until it comes into range.", 12, MUTED, False, BODY)]])
foot(s, 5)

# ---------------------------------------------------------------- 6 sharing
s = prs.slides.add_slide(BLANK)
header(s, "Step 4", "Getting the week to the team", "Four buttons, top right.")
outs = [("Copy roster link", "Copies the link to your clipboard. Paste it in the WhatsApp group — once is enough, forever."),
        ("Print", "A clean sheet for the noticeboard in the kitchen."),
        ("CSV", "The week as a spreadsheet: one row per person, with hours and overtime."),
        ("Approvals", "Leave and shift requests waiting on you. Approve, refuse, or send back with a comment.")]
y = Inches(2.2)
for i, (title, note) in enumerate(outs):
    box(s, Inches(0.7), y, Inches(11.93), Inches(0.98), WHITE, LINE)
    rect(s, Inches(0.7), y, Pt(4.5), Inches(0.98), ORANGE if i < 3 else GOLD)
    text(s, Inches(1.05), y + Inches(0.15), Inches(3.1), Inches(0.6),
         [(title, 14.5, INK, True, DISP)])
    text(s, Inches(4.35), y + Inches(0.19), Inches(7.9), Inches(0.6),
         [(note, 12, MUTED, False, BODY)])
    y += Inches(1.1)
box(s, Inches(0.7), Inches(6.65), Inches(11.93), Inches(0.0), None, None)
text(s, Inches(0.7), Inches(6.75), Inches(11.9), Inches(0.3),
     [[("The link shows names, positions and shift times only. ", 11, INK, True, BODY),
       ("No pay, no phone numbers, no addresses.", 11, MUTED, False, BODY)]])
foot(s, 6)

# ---------------------------------------------------------------- 7 good practice
s = prs.slides.add_slide(BLANK)
header(s, "In short", "Six habits worth keeping")
notes = [("Publish early in the week before.",
          "The team plans around it. A late roster is the most common complaint in any kitchen."),
         ("Use the publish note.",
          "One line — “Eid week, extra cover Friday” — saves ten questions."),
         ("Lock the week once payroll has read it.",
          "It stops a quiet edit changing a number somebody has already paid on."),
         ("Unlock is yours now — leave a trail.",
          "If you reopen a locked week, say why in the publish note when you republish."),
         ("Clear the red review marks.",
          "Imported rows with a red corner need a manager's eye. Open the cell and save it."),
         ("Watch the red headcount.",
          "Fewer than three people on a day is flagged for a reason.")]
y = Inches(2.05)
for i, (t, d) in enumerate(notes):
    box(s, Inches(0.7), y, Inches(11.93), Inches(0.78), WHITE if i % 2 == 0 else SUNK, LINE)
    box(s, Inches(1.0), y + Inches(0.15), Inches(0.48), Inches(0.48), DARK, DARK)
    text(s, Inches(1.0), y + Inches(0.22), Inches(0.48), Inches(0.35),
         [(str(i + 1), 13, GOLD, True, DISP)], align=PP_ALIGN.CENTER)
    text(s, Inches(1.7), y + Inches(0.11), Inches(10.6), Inches(0.6),
         [[(t, 13, INK, True, BODY)], [(d, 11.5, MUTED, False, BODY)]], spacing=2)
    y += Inches(0.86)
foot(s, 7)

out = os.environ["SV_OUT"]
prs.save(out)
print("saved", out, os.path.getsize(out))
