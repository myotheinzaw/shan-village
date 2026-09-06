exec(open('_common.py').read())

def bullet(s, x, y, w, items, accent, size=12.5, gap=0.42):
    yy = y
    for t in items:
        text(s, x, yy, w, Inches(0.34),
             [[("·  ", size, accent, True, BODY), (t, size, MUTED, False, BODY)]])
        yy += Inches(gap)
    return yy

def step(s, x, y, w, num, title, note, h=0.92):
    box(s, x, y, w, Inches(h), WHITE, LINE)
    box(s, x + Inches(0.25), y + Inches(0.17), Inches(0.56), Inches(0.56), ORANGE, ORANGE)
    text(s, x + Inches(0.25), y + Inches(0.26), Inches(0.56), Inches(0.4),
         [(num, 15.5, WHITE, True, DISP)], align=PP_ALIGN.CENTER)
    text(s, x + Inches(1.02), y + Inches(0.15), w - Inches(1.3), Inches(0.7),
         [[(title, 13.5, INK, True, BODY)], [(note, 11.5, MUTED, False, BODY)]], spacing=3)

# ---------------------------------------------------------------- 1 title
s = prs.slides.add_slide(BLANK)
bg(s)
rect(s, 0, 0, W, Inches(4.3), DARK)
rect(s, 0, Inches(4.3), W, Pt(4), ORANGE)
text(s, Inches(1.0), Inches(1.3), Inches(11), Inches(0.3),
     [("SHAN VILLAGE · FOR THE TEAM", 12, GOLD, True, BODY)])
text(s, Inches(1.0), Inches(1.75), Inches(11), Inches(1.0),
     [("Your shifts, your leave", 42, CREAM, True, DISP)])
text(s, Inches(1.0), Inches(2.95), Inches(9.5), Inches(0.9),
     [("How to see the duty roster on your phone, check your leave, and ask for a day off — "
       "without asking anyone.", 15, RGBColor(0xC9, 0xBB, 0x9C), False, BODY)])
box(s, Inches(1.0), Inches(4.85), Inches(5.4), Inches(1.25), WHITE, LINE)
text(s, Inches(1.3), Inches(5.1), Inches(4.9), Inches(0.8),
     [[("Just want to see the roster?", 11.5, MUTED, False, BODY)],
      [("Open the link. No password.", 15, ORANGE, True, BODY)]], spacing=4)
box(s, Inches(6.7), Inches(4.85), Inches(5.6), Inches(1.25), SUNK, LINE)
text(s, Inches(7.0), Inches(5.1), Inches(5.0), Inches(0.8),
     [[("Need leave, or your own hours?", 11.5, MUTED, False, BODY)],
      [("Sign in with your own account.", 15, INK, True, BODY)]], spacing=4)
text(s, Inches(1.0), Inches(6.45), Inches(9), Inches(0.3),
     [("Shan Village · all times shown are Dubai time", 10, FAINT, False, BODY)])

# ---------------------------------------------------------------- 2 the link
s = prs.slides.add_slide(BLANK)
header(s, "No password needed", "The team roster link",
       "Bookmark it once. It is always up to date.")
box(s, Inches(0.7), Inches(2.2), Inches(6.1), Inches(1.55), DARK, DARK)
text(s, Inches(1.05), Inches(2.5), Inches(5.4), Inches(1.0),
     [[("Open this", 11, GOLD, True, BODY)],
      [("shan-schedule-crew", 17, CREAM, True, MONO)],
      [(".lovable.app/team-roster", 17, CREAM, True, MONO)]], spacing=5)
box(s, Inches(0.7), Inches(3.95), Inches(6.1), Inches(2.65), WHITE, LINE)
text(s, Inches(1.05), Inches(4.22), Inches(5.4), Inches(0.4),
     [("What you will see", 15, INK, True, DISP)])
bullet(s, Inches(1.05), Inches(4.75), Inches(5.4),
       ["Three buttons: last week · this week · next week",
        "Everybody's shifts, not only yours",
        "On a phone: one card per day, easy to read",
        "Only weeks the office has published"], GOLD)
box(s, Inches(7.2), Inches(2.2), Inches(5.43), Inches(2.05), SUNK, LINE)
text(s, Inches(7.55), Inches(2.48), Inches(4.8), Inches(1.5),
     [[("It updates by itself", 14.5, INK, True, DISP)],
      [("The moment the office publishes a week, the same link shows it. "
        "Nobody sends a new link or a new picture. If you already have the page open, "
        "close and open it again.", 11.5, MUTED, False, BODY)]], spacing=6)
box(s, Inches(7.2), Inches(4.45), Inches(5.43), Inches(2.15), WHITE, LINE)
text(s, Inches(7.55), Inches(4.72), Inches(4.8), Inches(1.6),
     [[("Keep it on your home screen", 14.5, INK, True, DISP)],
      [("iPhone — Share, then Add to Home Screen", 11.5, MUTED, False, BODY)],
      [("Android — ⋮ menu, then Add to Home screen", 11.5, MUTED, False, BODY)]], spacing=6)
foot(s, 2)

# ---------------------------------------------------------------- 3 first sign in
s = prs.slides.add_slide(BLANK)
header(s, "Your own account", "Signing in the first time",
       "Your manager gives you an email address and a first password.")
y = Inches(2.2)
for n, t, d in [("1", "Open shan-schedule-crew.lovable.app",
                 "The same website, but press Sign in."),
                ("2", "Type the email and password you were given",
                 "The password is temporary — other people have seen it."),
                ("3", "The app asks you to make your own password",
                 "At least 8 letters or numbers. Type it twice, press “Set my password”."),
                ("4", "That is your password from now on",
                 "Nobody else knows it — not even the office. Do not share it.")]:
    step(s, Inches(0.7), y, Inches(7.5), n, t, d)
    y += Inches(1.05)
box(s, Inches(8.6), Inches(2.2), Inches(4.03), Inches(2.1), SUNK, LINE)
text(s, Inches(8.9), Inches(2.48), Inches(3.45), Inches(1.6),
     [[("Forgot it?", 14, INK, True, DISP)],
      [("There is no “forgot password” button. Ask the office and they will give you a new "
        "temporary one.", 11.5, MUTED, False, BODY)]], spacing=6)
box(s, Inches(8.6), Inches(4.5), Inches(4.03), Inches(2.1), WHITE, LINE)
text(s, Inches(8.9), Inches(4.78), Inches(3.45), Inches(1.6),
     [[("Changing it later", 14, INK, True, DISP)],
      [("Profile → New password → Change password. Any time you like.", 11.5, MUTED, False, BODY)]], spacing=6)
foot(s, 3)

# ---------------------------------------------------------------- 4 my roster
s = prs.slides.add_slide(BLANK)
header(s, "Inside your account", "My roster — your shifts only",
       "Press Roster at the bottom of the screen.")
cards = [("This week", ["Every day, Monday to Sunday",
                        "Your shift times, or OFF, or Leave",
                        "Hours for the whole week at the bottom"]),
         ("Next week", ["The same, for the week ahead",
                        "Empty until the office publishes it",
                        "“Nothing published for this week yet” means wait"]),
         ("Month", ["A calendar of the whole month",
                    "Total hours and days off",
                    "Move back and forth with the arrows"])]
x = Inches(0.7)
for title, items in cards:
    box(s, x, Inches(2.2), Inches(3.87), Inches(3.3), WHITE, LINE)
    rect(s, x, Inches(2.2), Inches(3.87), Pt(5), ORANGE)
    text(s, x + Inches(0.3), Inches(2.5), Inches(3.3), Inches(0.4),
         [(title, 16, INK, True, DISP)])
    bullet(s, x + Inches(0.3), Inches(3.05), Inches(3.3), items, ORANGE, 11.5, 0.55)
    x += Inches(4.03)
box(s, Inches(0.7), Inches(5.7), Inches(11.93), Inches(0.95), SUNK, LINE)
text(s, Inches(1.05), Inches(5.9), Inches(11.3), Inches(0.6),
     [[("You only ever see your own line.  ", 12.5, INK, True, BODY),
       ("Nobody else's shifts, nobody's pay, nobody's phone number. "
        "If you want to see the whole team, use the link on the page before.", 12, MUTED, False, BODY)]])
foot(s, 4)

# ---------------------------------------------------------------- 5 asking for leave
s = prs.slides.add_slide(BLANK)
header(s, "Inside your account", "Asking for leave",
       "Press Requests, then “New request”.")
y = Inches(2.2)
for n, t, d in [("1", "Choose Leave", "The other two buttons are for changing or swapping a shift."),
                ("2", "Choose the type of leave", "Annual, sick, unpaid — whatever the office has set up."),
                ("3", "Pick the first day and the last day", "One day off? Put the same date twice."),
                ("4", "Write the reason", "Not compulsory, but it helps your manager say yes quickly."),
                ("5", "Press Submit", "“Save draft” keeps it without sending. Submit sends it.")]:
    step(s, Inches(0.7), y, Inches(7.5), n, t, d, h=0.82)
    y += Inches(0.92)
box(s, Inches(8.6), Inches(2.2), Inches(4.03), Inches(2.35), WHITE, LINE)
text(s, Inches(8.9), Inches(2.45), Inches(3.45), Inches(1.9),
     [[("Before you press Submit", 14, INK, True, DISP)],
      [("The app shows your days left, and warns you if you are already rostered to work "
        "on those days.", 11.5, MUTED, False, BODY)]], spacing=6)
box(s, Inches(8.6), Inches(4.75), Inches(4.03), Inches(1.85), SUNK, LINE)
text(s, Inches(8.9), Inches(5.0), Inches(3.45), Inches(1.4),
     [[("Then what?", 14, INK, True, DISP)],
      [("It appears in My requests. When the manager decides, the answer and their comment "
        "appear there too.", 11.5, MUTED, False, BODY)]], spacing=6)
foot(s, 5)

# ---------------------------------------------------------------- 6 change or swap
s = prs.slides.add_slide(BLANK)
header(s, "Inside your account", "Changing or swapping a shift",
       "Same place — Requests, then “New request”.")
box(s, Inches(0.7), Inches(2.2), Inches(5.9), Inches(3.1), WHITE, LINE)
rect(s, Inches(0.7), Inches(2.2), Inches(5.9), Pt(5), ORANGE)
text(s, Inches(1.05), Inches(2.5), Inches(5.2), Inches(0.4),
     [("Shift change", 17, INK, True, DISP)])
text(s, Inches(1.05), Inches(3.0), Inches(5.2), Inches(0.35),
     [("When you want different times, or the day off.", 12, MUTED, False, BODY)])
bullet(s, Inches(1.05), Inches(3.5), Inches(5.2),
       ["Pick the date",
        "Choose “Different times” or “Day off”",
        "If different times, type start and end",
        "Add the reason, then Submit"], ORANGE, 12, 0.42)
box(s, Inches(6.9), Inches(2.2), Inches(5.73), Inches(3.1), WHITE, LINE)
rect(s, Inches(6.9), Inches(2.2), Inches(5.73), Pt(5), GOLD)
text(s, Inches(7.25), Inches(2.5), Inches(5.1), Inches(0.4),
     [("Swap with a colleague", 17, INK, True, DISP)])
text(s, Inches(7.25), Inches(3.0), Inches(5.1), Inches(0.35),
     [("When you and a workmate want to trade days.", 12, MUTED, False, BODY)])
bullet(s, Inches(7.25), Inches(3.5), Inches(5.1),
       ["Pick your shift date",
        "Choose the colleague from the list",
        "Pick their shift date",
        "Add the reason, then Submit"], GOLD, 12, 0.42)
box(s, Inches(0.7), Inches(5.5), Inches(11.93), Inches(1.1), SUNK, DEEP, 1.5)
text(s, Inches(1.05), Inches(5.72), Inches(11.3), Inches(0.7),
     [[("Nothing changes until a manager approves it.  ", 12.5, DEEP, True, BODY)],
      [("Sending a request does not move your shift. Keep working the roster as published "
        "until you see the answer in My requests.", 12, MUTED, False, BODY)]], spacing=4)
foot(s, 6)

# ---------------------------------------------------------------- 7 remember
s = prs.slides.add_slide(BLANK)
header(s, "In short", "Six things to remember")
notes = [("The link is for looking. Your login is for asking.",
          "Roster on the link; leave and hours in your account."),
         ("The link updates by itself.",
          "Same address every week. Nobody needs to send you a new one."),
         ("You only see published weeks.",
          "If next week is empty, the office has not finished it yet."),
         ("Your password is yours alone.",
          "Change it the first time you sign in and tell nobody."),
         ("A request is a question, not a decision.",
          "Work the roster until a manager answers."),
         ("Ask the office if something looks wrong.",
          "A wrong shift is fixed in the system, not in the WhatsApp group.")]
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
