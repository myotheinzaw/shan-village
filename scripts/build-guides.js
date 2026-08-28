const pptxgen = require('pptxgenjs');

/* Builds the six Shan Village guide decks - an OFFICE and a STAFF version of
   each page. Run it with:

     node scripts/build-guides.js [--out DIR]

   The lock codes are deliberately NOT in this file. Supply them through the
   environment when you want the office decks to carry them:

     SV_CODE_OWNER=... SV_CODE_ADMIN=... SV_CODE_CHEF=... SV_CODE_STAFF=... \
       node scripts/build-guides.js --out ./guides

   Without them the office decks print a blank line in place of each code, so
   the deck is still usable - it is filled in by hand. The staff decks never
   show a code either way. */

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT = (outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : '.').replace(/\/?$/, '/');

// A code that was not supplied becomes a line to write on, never a placeholder
// word that could be mistaken for the real thing.
const BLANK = '________________';
const CODE = {
  owner: process.env.SV_CODE_OWNER || BLANK,
  admin: process.env.SV_CODE_ADMIN || BLANK,
  chef:  process.env.SV_CODE_CHEF  || BLANK,
  staff: process.env.SV_CODE_STAFF || BLANK
};
const INK = '1F1A14', DARK = '171310', CARDDARK = '241C15';
const SAND = 'F3ECDC', LINE = 'E3D7BE', MUTED = '6B6155', CREAM = 'F7EFDD', DIM = 'C9BB9C';
const TERRA = 'C1501F', GOLD = 'A9781E', GREEN = '2F7D4F', RED = 'E0654A';
const HEAD = 'Cambria', BODY = 'Calibri', MONO = 'Courier New';

const LINKS = {
  roster: 'https://claude.ai/code/artifact/82a8fa73-2bcd-4798-be63-4d11098ca956',
  wastage: 'https://claude.ai/code/artifact/914809f6-93f2-4b56-9fbd-12ccd4bd1d64',
  inventory: 'https://claude.ai/code/artifact/4f1ac0e0-ab92-4c62-9a63-4dbc258721e3'
};

/* ------------------------------------------------------------- helpers */
function deck() {
  const p = new pptxgen();
  p.layout = 'LAYOUT_WIDE';
  p.author = 'Shan Village';
  return p;
}
function dark(p) { const s = p.addSlide(); s.background = { color: DARK }; return s; }
function light(p, title, kicker, accent) {
  const s = p.addSlide(); s.background = { color: 'FFFFFF' };
  if (kicker) s.addText(kicker.toUpperCase(), {
    x: 0.7, y: 0.42, w: 10, h: 0.3, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 12, bold: true, charSpacing: 2, color: accent
  });
  s.addText(title, {
    x: 0.7, y: kicker ? 0.75 : 0.6, w: 11.9, h: 0.8, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 32, bold: true, color: INK
  });
  return s;
}
function card(p, s, x, y, w, h, fill) {
  s.addShape(p.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.09,
    fill: { color: fill || SAND }, line: { color: fill && fill !== SAND ? fill : LINE, width: 1 }
  });
}
function badge(p, s, x, y, txt, col, size) {
  const d = size || 0.46;
  s.addShape(p.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: col }, line: { color: col, width: 1 } });
  s.addText(txt, {
    x, y, w: d, h: d, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: d > 0.5 ? 20 : 15, bold: true,
    color: 'FFFFFF', align: 'center', valign: 'middle'
  });
}
function titleSlide(p, kicker, title, sub, link, accent, footNote) {
  const s = dark(p);
  s.addText(kicker.toUpperCase(), {
    x: 0.9, y: 1.5, w: 10, h: 0.35, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 13, bold: true, charSpacing: 3, color: accent === TERRA ? GOLD : accent
  });
  s.addText(title, {
    x: 0.9, y: 1.95, w: 10.5, h: 1.5, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 40, bold: true, color: CREAM, lineSpacing: 44
  });
  s.addText(sub, {
    x: 0.9, y: 3.55, w: 10.5, h: 0.5, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 17, color: DIM
  });
  card(p, s, 0.9, 4.35, 11.5, 1.15, CARDDARK);
  s.addText('LINK', {
    x: 1.2, y: 4.55, w: 1, h: 0.3, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 11, bold: true, charSpacing: 2, color: accent === TERRA ? GOLD : accent
  });
  s.addText(link, {
    x: 1.2, y: 4.85, w: 10.9, h: 0.45, isTextBox: true, margin: 0,
    fontFace: MONO, fontSize: 12.5, color: CREAM, hyperlink: { url: link }
  });
  if (footNote) s.addText(footNote, {
    x: 0.9, y: 5.75, w: 11.5, h: 0.5, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 13, color: footNote.indexOf('code') === 0 ? RED : 'B8AC93'
  });
  return s;
}
// numbered steps, one per row
function stepRows(p, s, steps, accent, y0, titleW, descX, descW) {
  let y = y0;
  steps.forEach(([n, t, d]) => {
    badge(p, s, 0.75, y + 0.02, n, accent);
    s.addText(t, {
      x: 1.45, y, w: titleW, h: 0.6, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 16, bold: true, color: INK
    });
    s.addText(d, {
      x: descX, y: y - 0.02, w: descW, h: 0.78, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 12.5, color: MUTED
    });
    y += 0.95;
  });
  return y;
}
function noteBar(p, s, y, text, fill) {
  card(p, s, 0.7, y, 11.9, 0.78, fill || 'FFF8EC');
  s.addText(text, {
    x: 1.0, y: y + 0.16, w: 11.3, h: 0.5, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 12.5, color: INK
  });
}
function threeCards(p, s, items, y, h) {
  let x = 0.7;
  items.forEach(([t, d, col]) => {
    card(p, s, x, y, 3.9, h);
    s.addShape(p.ShapeType.ellipse, { x: x + 0.32, y: y + 0.3, w: 0.4, h: 0.4, fill: { color: col }, line: { color: col, width: 1 } });
    s.addText(t, {
      x: x + 0.32, y: y + 0.85, w: 3.3, h: 0.6, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 17, bold: true, color: INK
    });
    s.addText(d, {
      x: x + 0.32, y: y + 1.45, w: 3.3, h: h - 1.6, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 12.5, color: MUTED
    });
    x += 4.05;
  });
}
function tabGrid(p, s, tabs, y, accent) {
  // tabs: [name, who, note]
  let x = 0.7, yy = y, i = 0;
  tabs.forEach(([name, who, note]) => {
    card(p, s, x, yy, 3.9, 1.28);
    s.addText(name, {
      x: x + 0.28, y: yy + 0.16, w: 2.4, h: 0.34, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 15.5, bold: true, color: INK
    });
    s.addText(who, {
      x: x + 2.55, y: yy + 0.2, w: 1.2, h: 0.28, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 10.5, bold: true, color: accent, align: 'right'
    });
    s.addText(note, {
      x: x + 0.28, y: yy + 0.56, w: 3.4, h: 0.62, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11.5, color: MUTED
    });
    i++;
    if (i % 3 === 0) { x = 0.7; yy += 1.42; } else { x += 4.05; }
  });
}
function save(p, name) {
  return p.writeFile({ fileName: OUT + name }).then(f => console.log('wrote', f));
}

/* ================================================================ 1 ROSTER — OFFICE */
function rosterOffice() {
  const p = deck(); const A = GOLD;
  p.title = 'Duty Roster - office guide';

  titleSlide(p, 'Shan Village - page 1 of 3', 'Duty Roster\noffice guide',
    'Building the week, publishing it, and reading the hours.', LINKS.roster, A,
    'Contains the owner, admin and chef codes. Keep this file in the office.');

  // codes
  {
    const s = light(p, 'Codes for this page', 'Three of them open it', A);
    const codes = [
      ['Owner', CODE.owner, 'Everything, including the Change Log.', TERRA],
      ['Admin', CODE.admin, 'Everything, including the Change Log.', GOLD],
      ['Chef', CODE.chef, 'Edits and publishes. No Change Log.', GREEN]
    ];
    let x = 0.7;
    codes.forEach(([r, c, n, col]) => {
      card(p, s, x, 1.95, 3.9, 2.3);
      s.addShape(p.ShapeType.ellipse, { x: x + 0.3, y: 2.22, w: 0.34, h: 0.34, fill: { color: col }, line: { color: col, width: 1 } });
      s.addText(r.toUpperCase(), {
        x: x + 0.75, y: 2.24, w: 2.5, h: 0.3, isTextBox: true, margin: 0,
        fontFace: BODY, fontSize: 12.5, bold: true, charSpacing: 1.5, color: col
      });
      s.addText(c, {
        x: x + 0.3, y: 2.75, w: 3.4, h: 0.45, isTextBox: true, margin: 0,
        fontFace: MONO, fontSize: 15, bold: true, color: INK
      });
      s.addText(n, {
        x: x + 0.3, y: 3.28, w: 3.3, h: 0.85, isTextBox: true, margin: 0,
        fontFace: BODY, fontSize: 12.5, color: MUTED
      });
      x += 4.05;
    });
    card(p, s, 0.7, 4.5, 11.9, 2.2, 'FFF8EC');
    s.addText('Staff need no code at all', {
      x: 1.0, y: 4.7, w: 8, h: 0.35, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 18, bold: true, color: INK
    });
    s.addText([
      { text: 'The page opens locked and read-only for anyone holding the link - that is how the kitchen reads the week.', options: { bullet: true, breakLine: true } },
      { text: 'A code is only needed to change something. It is asked for once, then the page re-locks itself after 15 minutes of no use.', options: { bullet: true, breakLine: true } },
      { text: 'To change a code: unlock, then Settings > Lock codes. Owner and Admin only.', options: { bullet: true } }
    ], {
      x: 1.0, y: 5.15, w: 11.3, h: 1.4, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 13, color: INK, paraSpaceAfter: 6
    });
  }

  // steps
  {
    const s = light(p, 'Building and publishing a week', 'Five steps', A);
    stepRows(p, s, [
      ['1', 'Open and unlock', 'Press Unlock to edit and type the Owner, Admin or Chef code. Six more tabs appear.'],
      ['2', 'Pick the week', 'Timetable tab. Move between weeks with the arrows beside the date.'],
      ['3', 'Fill the cells', 'Tap a cell to set a shift time, OFF, Leave or Public holiday. A split shift is entered as two times in the same day.'],
      ['4', 'Check the hours', 'Monthly & Overtime totals every person as you go. Anything above 10 hours in a day is counted as overtime by itself.'],
      ['5', 'Publish', 'Press Publish roster - or just lock the page, which publishes for you. Until then the kitchen still sees the old week.']
    ], A, 1.85, 3.3, 4.9, 7.7);
    noteBar(p, s, 6.55, 'Nothing is saved to a separate file. The page keeps its own record, and every edit is stamped with the code that made it.');
  }

  // tabs
  {
    const s = light(p, 'The seven tabs', 'What each one is for', A);
    tabGrid(p, s, [
      ['Timetable', 'everyone', 'The week itself. Read-only until you unlock. Export PDF and Print live here.'],
      ['Staff', 'unlocked', 'Names, positions, who is currently on the roster and who has left.'],
      ['Shift Times', 'unlocked', 'The shift patterns you reuse, so cells can be filled in one tap.'],
      ['Monthly & Overtime', 'unlocked', 'Per person per month: normal hours, overtime, days worked, days off, leave.'],
      ['History', 'unlocked', 'Earlier published weeks, kept so you can look back.'],
      ['Share', 'unlocked', 'The link to hand to staff, and the printable view.'],
      ['Change Log', 'owner/admin', 'Every edit with the code that made it. The Chef cannot open this.']
    ], 1.85, A);
    noteBar(p, s, 6.5, 'The roster page is included in the 8 pm Gulf export to Google Drive, so the office has a dated copy of every day without asking for one.');
  }

  // rules
  {
    const s = light(p, 'Things that catch people out', 'Worth reading twice', A);
    threeCards(p, s, [
      ['Publish, or it did not happen', 'The kitchen sees the last published version. An unpublished edit is invisible to them, however long you spent on it.', TERRA],
      ['Overtime is automatic', 'Above 10 hours in one day is overtime. You do not mark it - changing the shift time changes the total.', GOLD],
      ['The log names a code, not a person', 'If three people share the Admin code, the log cannot tell them apart. Give the Chef code to the chef.', GREEN]
    ], 1.9, 2.9);
    card(p, s, 0.7, 5.1, 11.9, 1.55, SAND);
    s.addText('Weekly rhythm that works', {
      x: 1.0, y: 5.28, w: 8, h: 0.35, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 17, bold: true, color: INK
    });
    s.addText('Draft the coming week by Friday, check Monthly & Overtime before publishing, publish Saturday, print one copy for the board. Corrections mid-week are fine - just publish again.', {
      x: 1.0, y: 5.7, w: 11.3, h: 0.8, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 13, color: MUTED
    });
  }
  return save(p, 'Shan Village - 1 Duty Roster - OFFICE guide.pptx');
}

/* ================================================================ 2 WASTAGE — OFFICE */
function wastageOffice() {
  const p = deck(); const A = TERRA;
  p.title = 'Daily Wastage - office guide';

  titleSlide(p, 'Shan Village - page 2 of 3', 'Daily Wastage\noffice guide',
    'What the kitchen records, and what you do with it.', LINKS.wastage, A,
    'Contains every code, including Owner and Admin. Office copy.');

  {
    const s = light(p, 'Codes for this page', 'Four levels, three behaviours', A);
    const codes = [
      ['Staff', CODE.staff, 'Needed to send an entry. Nothing else.', MUTED],
      ['Chef', CODE.chef, 'Behaves like the kitchen here: records and Today only.', GREEN],
      ['Admin', CODE.admin, 'Reports, corrections and Settings.', GOLD],
      ['Owner', CODE.owner, 'Reports, corrections and Settings.', TERRA]
    ];
    let x = 0.7;
    codes.forEach(([r, c, n, col]) => {
      card(p, s, x, 1.95, 2.95, 2.45);
      s.addShape(p.ShapeType.ellipse, { x: x + 0.28, y: 2.22, w: 0.34, h: 0.34, fill: { color: col }, line: { color: col, width: 1 } });
      s.addText(r.toUpperCase(), {
        x: x + 0.72, y: 2.24, w: 2.0, h: 0.3, isTextBox: true, margin: 0,
        fontFace: BODY, fontSize: 12.5, bold: true, charSpacing: 1.5, color: col
      });
      s.addText(c, {
        x: x + 0.28, y: 2.74, w: 2.6, h: 0.45, isTextBox: true, margin: 0,
        fontFace: MONO, fontSize: 14, bold: true, color: INK
      });
      s.addText(n, {
        x: x + 0.28, y: 3.26, w: 2.42, h: 1.0, isTextBox: true, margin: 0,
        fontFace: BODY, fontSize: 12, color: MUTED
      });
      x += 3.07;
    });
    card(p, s, 0.7, 4.65, 11.9, 2.0, 'FFF8EC');
    s.addText('Add wastage and Today are open to anyone with the link', {
      x: 1.0, y: 4.85, w: 10, h: 0.35, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 17, bold: true, color: INK
    });
    s.addText([
      { text: 'That is deliberate: the kitchen can see what has already been sent today and avoid entering the same loss twice.', options: { bullet: true, breakLine: true } },
      { text: 'Sending asks for the staff code once. Reports, corrections and Settings stay hidden until an Owner or Admin code is typed.', options: { bullet: true } }
    ], {
      x: 1.0, y: 5.3, w: 11.3, h: 1.1, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 13, color: INK, paraSpaceAfter: 6
    });
  }

  {
    const s = light(p, 'What the kitchen does', 'Three steps, under a minute', A);
    stepRows(p, s, [
      ['1', 'Open the link', 'On the phone. Worth saving to the home screen so it is one tap during service.'],
      ['2', 'Fill the entry', 'Item, quantity and unit, reason (spoiled, expired, over-production, dropped, other), a short note, and a photo if it helps.'],
      ['3', 'Send', 'The staff code is asked for once. The entry appears under Today immediately, stamped with the time.']
    ], A, 1.9, 3.3, 4.9, 7.7);
    card(p, s, 0.7, 4.95, 11.9, 1.7, SAND);
    s.addText('Why "one entry per item, straight away" matters', {
      x: 1.0, y: 5.13, w: 9, h: 0.35, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 17, bold: true, color: INK
    });
    s.addText('A single line saying "vegetables, 5 kg, end of day" tells you nothing you can act on. Five lines with the real item and reason tell you which supplier, which prep step, or which section is losing money.', {
      x: 1.0, y: 5.55, w: 11.3, h: 0.9, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 13, color: MUTED
    });
  }

  {
    const s = light(p, 'What the office does', 'Reports, corrections, settings', A);
    stepRows(p, s, [
      ['4', 'Open Reports', 'Owner or Admin code. Totals by day, by reason and by item, with values where a price is set.'],
      ['5', 'Correct, never delete', 'Fix a wrong entry in Reports. The original stays visible underneath - that is what makes the record worth trusting.'],
      ['6', 'Set prices in Settings', 'A cost per item turns quantities into money. Without it you still get quantities, which is better than nothing.'],
      ['7', 'Read the pattern weekly', 'One bad day is noise. The same item three days running is a purchasing or prep problem worth a conversation.']
    ], A, 1.85, 3.3, 4.9, 7.7);
    noteBar(p, s, 5.85, 'Photographs stay inside the page. The daily Drive report names them as yes or no - it never carries the image itself.');
  }

  {
    const s = light(p, 'What runs without you', 'Already switched on', A);
    threeCards(p, s, [
      ['Hourly email', 'Any new wastage entry is emailed to shanvillagedubai@gmail.com. A quiet hour sends nothing at all.', TERRA],
      ['Daily 8 pm Gulf', 'The day\'s wastage report is written to the Google Drive folder, empty days included, so the gap is visible.', GOLD],
      ['Nothing to close', 'There is no end-of-day button. The page is already up to date the moment the last entry is sent.', GREEN]
    ], 1.9, 2.9);
    card(p, s, 0.7, 5.1, 11.9, 1.55, SAND);
    s.addText('The honest limit', {
      x: 1.0, y: 5.28, w: 8, h: 0.35, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 17, bold: true, color: INK
    });
    s.addText('A shared code is not a name. Every entry sent with the staff code reads as "staff" - the page can tell you what was thrown away and when, but not who by. If you need names against entries, that needs the deployed app with real logins.', {
      x: 1.0, y: 5.7, w: 11.3, h: 0.85, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 13, color: MUTED
    });
  }
  return save(p, 'Shan Village - 2 Daily Wastage - OFFICE guide.pptx');
}

/* ================================================================ 3 INVENTORY — OFFICE */
function inventoryOffice() {
  const p = deck(); const A = GREEN;
  p.title = 'Inventory and Stock Take - office guide';

  titleSlide(p, 'Shan Village - page 3 of 3', 'Inventory &\nStock Take - office guide',
    'Item master, blind counting, and reading the variance.', LINKS.inventory, A,
    'Contains every code, including Owner and Admin. Office copy.');

  {
    const s = light(p, 'Codes and what they open', 'Six tabs, split three ways', A);
    const codes = [
      ['Staff', CODE.staff, 'Opens a stock take and types the figures. No book figure, no values.', MUTED],
      ['Admin', CODE.admin, 'All six tabs: item master, settings, audit log, closing a take.', GOLD],
      ['Owner', CODE.owner, 'All six tabs, same as Admin.', TERRA]
    ];
    let x = 0.7;
    codes.forEach(([r, c, n, col]) => {
      card(p, s, x, 1.95, 3.9, 2.35);
      s.addShape(p.ShapeType.ellipse, { x: x + 0.3, y: 2.22, w: 0.34, h: 0.34, fill: { color: col }, line: { color: col, width: 1 } });
      s.addText(r.toUpperCase(), {
        x: x + 0.75, y: 2.24, w: 2.5, h: 0.3, isTextBox: true, margin: 0,
        fontFace: BODY, fontSize: 12.5, bold: true, charSpacing: 1.5, color: col
      });
      s.addText(c, {
        x: x + 0.3, y: 2.75, w: 3.4, h: 0.45, isTextBox: true, margin: 0,
        fontFace: MONO, fontSize: 15, bold: true, color: INK
      });
      s.addText(n, {
        x: x + 0.3, y: 3.28, w: 3.3, h: 0.9, isTextBox: true, margin: 0,
        fontFace: BODY, fontSize: 12.5, color: MUTED
      });
      x += 4.05;
    });
    tabGrid(p, s, [
      ['Dashboard', 'everyone', 'The summary. Open to anyone with the link.'],
      ['Current stock', 'everyone', 'What the book says is on hand right now.'],
      ['Stock take', 'staff +', 'Open a count, type what is on the shelf.'],
      ['Item master', 'owner/admin', 'Items, units, areas and costs. The base of everything.'],
      ['Settings', 'owner/admin', 'Rules, photo and comment behaviour, lock codes.'],
      ['Audit log', 'owner/admin', 'Every change with the code that made it.']
    ], 4.5, A);
  }

  {
    const s = light(p, 'Setting it up once', 'Item master first', A);
    stepRows(p, s, [
      ['1', 'List the items', 'Item master tab. Name, unit (kg, litre, piece), area - kitchen, store or home - and cost where you know it.'],
      ['2', 'Get the units right', 'Count the way the shelf is counted. If rice arrives in 25 kg bags and is counted in bags, the unit is bags, not kg.'],
      ['3', 'Set the opening figures', 'The first stock take is the opening balance. After that, the book figure moves on its own.'],
      ['4', 'Decide who counts', 'Give the counter the staff code only. Keep the Owner and Admin codes for closing and for the item master.']
    ], A, 1.85, 3.3, 4.9, 7.7);
    noteBar(p, s, 5.85, 'Stock is never stored as a single number that can be overwritten. It is the sum of every movement, which is why the audit log can always explain today\'s figure.');
  }

  {
    const s = light(p, 'The stock take cycle', 'Blind count, then compare', A);
    stepRows(p, s, [
      ['1', 'Start the take', 'Stock take tab, choose the area. The list appears with an empty box beside each item.'],
      ['2', 'Count blind', 'The counter sees no book figure and no value while counting. What goes in the box is what is on the shelf.'],
      ['3', 'Close it', 'Owner or Admin closes the take. Only now do the difference and its value appear.'],
      ['4', 'Explain the gaps', 'A short note against a variance today is worth more than an investigation next month.'],
      ['5', 'Read the trend', 'The same item short every count is not shrinkage - it is a unit, a recipe or a delivery problem.']
    ], A, 1.85, 3.3, 4.9, 7.7);
    noteBar(p, s, 6.55, 'Counting blind is the whole point. If the counter can see the expected number, the count stops being a check and becomes a copy.');
  }

  {
    const s = light(p, 'Before you hand it to staff', 'Two things to fix first', A);
    threeCards(p, s, [
      ['Move the share pin', 'Viewers of this page currently see an older pinned version. Until you move the pin, staff will not see your latest changes.', TERRA],
      ['Give them access', 'Anyone who must submit needs a signed-in Claude account with edit access to the page.', GOLD],
      ['Then send the staff guide', 'The separate staff deck has no codes in it, so it can go in the group chat safely.', GREEN]
    ], 1.9, 3.0);
    card(p, s, 0.7, 5.2, 11.9, 1.45, SAND);
    s.addText('Daily Drive export', {
      x: 1.0, y: 5.38, w: 8, h: 0.35, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 17, bold: true, color: INK
    });
    s.addText('At 8 pm Gulf the stock take report is written to the Drive folder. A day with no take is skipped rather than filed as an empty sheet, so the folder stays readable.', {
      x: 1.0, y: 5.8, w: 11.3, h: 0.75, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 13, color: MUTED
    });
  }
  return save(p, 'Shan Village - 3 Inventory and Stock Take - OFFICE guide.pptx');
}

/* ======================================================= STAFF DECKS (no codes) */
function staffTitle(p, kicker, title, sub, link, accent) {
  const s = dark(p);
  s.addText(kicker.toUpperCase(), {
    x: 0.9, y: 1.6, w: 10, h: 0.35, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 13, bold: true, charSpacing: 3, color: accent === TERRA ? GOLD : accent
  });
  s.addText(title, {
    x: 0.9, y: 2.05, w: 11, h: 1.4, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 44, bold: true, color: CREAM
  });
  s.addText(sub, {
    x: 0.9, y: 3.5, w: 11, h: 0.6, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 19, color: DIM
  });
  card(p, s, 0.9, 4.4, 11.5, 1.2, CARDDARK);
  s.addText(link, {
    x: 1.2, y: 4.72, w: 10.9, h: 0.5, isTextBox: true, margin: 0,
    fontFace: MONO, fontSize: 13, color: CREAM, hyperlink: { url: link }
  });
  return s;
}
function codeBlank(p, s, y, text) {
  card(p, s, 0.7, y, 11.9, 1.25, SAND);
  s.addText(text, {
    x: 1.0, y: y + 0.2, w: 6.6, h: 0.85, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 14, color: INK
  });
  s.addText('Code:', {
    x: 8.0, y: y + 0.42, w: 0.9, h: 0.4, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 15, bold: true, color: INK
  });
  s.addShape(p.ShapeType.line, {
    x: 8.85, y: y + 0.82, w: 3.4, h: 0, line: { color: MUTED, width: 1.25 }
  });
  s.addText('written in by your supervisor', {
    x: 8.85, y: y + 0.85, w: 3.4, h: 0.3, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 10.5, italic: true, color: MUTED
  });
}

function rosterStaff() {
  const p = deck(); const A = GOLD;
  p.title = 'Your duty roster - staff guide';
  staffTitle(p, 'Shan Village - for all staff', 'Your duty roster',
    'How to check your shifts. No code needed.', LINKS.roster, A);

  {
    const s = light(p, 'Open it once, keep it', 'Two taps', A);
    stepRows(p, s, [
      ['1', 'Open the link', 'On your phone. It opens straight on the timetable - there is no code and no sign-in to read it.'],
      ['2', 'Save it', 'Add it to your home screen so it is one tap next time. The link never changes.'],
      ['3', 'Check the date', 'The week showing is the published one. Use the arrows beside the date to look at the week before or after.']
    ], A, 2.0, 3.3, 4.9, 7.7);
    card(p, s, 0.7, 5.15, 11.9, 1.5, SAND);
    s.addText('A printed copy is on the notice board as well - but the page is the one that is always current.', {
      x: 1.0, y: 5.62, w: 11.3, h: 0.6, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 14, color: INK
    });
  }

  {
    const s = light(p, 'Reading your row', 'What the words mean', A);
    const items = [
      ['A time, e.g. 14:00-24:00', 'You are working that shift.'],
      ['Two times in one day', 'A split shift. Both parts are yours.'],
      ['OFF', 'Your day off.'],
      ['Leave', 'Approved leave.'],
      ['Public holiday', 'Public holiday, counted separately from leave.']
    ];
    let y = 1.95;
    items.forEach(([t, d], i) => {
      card(p, s, 0.7, y, 11.9, 0.85);
      s.addText(t, {
        x: 1.05, y: y + 0.22, w: 4.6, h: 0.42, isTextBox: true, margin: 0,
        fontFace: MONO, fontSize: 14, bold: true, color: i < 2 ? INK : A
      });
      s.addText(d, {
        x: 5.9, y: y + 0.24, w: 6.5, h: 0.42, isTextBox: true, margin: 0,
        fontFace: BODY, fontSize: 14, color: MUTED
      });
      y += 0.97;
    });
    s.addText('Your hours are added up for you. Anything over 10 hours in one day is counted as overtime automatically.', {
      x: 0.7, y: 6.85, w: 11.9, h: 0.45, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 13, italic: true, color: MUTED
    });
  }

  {
    const s = light(p, 'If something looks wrong', 'Say it early', A);
    threeCards(p, s, [
      ['Check the week first', 'Make sure you are looking at the right week - it is easy to be one week ahead or behind.', GOLD],
      ['Tell your supervisor', 'You cannot change the roster yourself, and you are not meant to. Ask, and it is corrected in minutes.', TERRA],
      ['Look again after', 'A change only reaches your phone once it is published. Refresh the page and check your row again.', GREEN]
    ], 2.0, 3.1);
    card(p, s, 0.7, 5.4, 11.9, 1.4, 'FFF8EC');
    s.addText('Swaps must be agreed with your supervisor before they go on the roster. A swap agreed only between two people is not on the roster, and payroll will not see it.', {
      x: 1.0, y: 5.72, w: 11.3, h: 0.8, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 14, color: INK
    });
  }
  return save(p, 'Shan Village - 1 Duty Roster - STAFF guide.pptx');
}

function wastageStaff() {
  const p = deck(); const A = TERRA;
  p.title = 'Recording wastage - staff guide';
  staffTitle(p, 'Shan Village - for the kitchen', 'Recording wastage',
    'What to do every time something is thrown away.', LINKS.wastage, A);

  {
    const s = light(p, 'Sending an entry', 'Under a minute', A);
    stepRows(p, s, [
      ['1', 'Open the link', 'On your phone, and save it to your home screen. You will use it every shift.'],
      ['2', 'Fill the form', 'Item, how much and in what unit, the reason, and a short note if it needs one.'],
      ['3', 'Add a photo', 'Optional, but it settles any question later. Take it before the item goes in the bin.'],
      ['4', 'Press Send', 'It asks for the code once. Your entry appears under Today straight away.']
    ], A, 1.9, 3.3, 4.9, 7.7);
    codeBlank(p, s, 5.75, 'You will be asked for a code the first time you send. Your supervisor will give it to you - write it here and keep this sheet.');
  }

  {
    const s = light(p, 'Getting it right', 'Four habits', A);
    const rows = [
      ['Record it straight away', 'Not at the end of the shift. By then the amount is a guess and the reason is forgotten.'],
      ['One entry per item', '"Vegetables, 5 kg" helps nobody. Tomatoes, onions and lettuce are three entries.'],
      ['Weigh it if you can', 'A real number is worth ten estimates. If you cannot weigh it, say so in the note.'],
      ['Check Today first', 'Someone may have already recorded it. Two entries for the same loss is worse than none.']
    ];
    let y = 1.95;
    rows.forEach(([t, d], i) => {
      card(p, s, 0.7, y, 11.9, 1.05);
      badge(p, s, 1.05, y + 0.28, String(i + 1), A);
      s.addText(t, {
        x: 1.75, y: y + 0.22, w: 4.2, h: 0.4, isTextBox: true, margin: 0,
        fontFace: HEAD, fontSize: 17, bold: true, color: INK
      });
      s.addText(d, {
        x: 6.1, y: y + 0.26, w: 6.3, h: 0.6, isTextBox: true, margin: 0,
        fontFace: BODY, fontSize: 13, color: MUTED
      });
      y += 1.17;
    });
    s.addText('Nobody is in trouble for recording wastage. You are in trouble for hiding it.', {
      x: 0.7, y: 6.75, w: 11.9, h: 0.45, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 16, bold: true, color: TERRA
    });
  }

  {
    const s = light(p, 'Choosing the reason', 'Five to pick from', A);
    const reasons = [
      ['Spoiled', 'Went off before it could be used.'],
      ['Expired', 'Past its date, unopened or opened.'],
      ['Over-production', 'Cooked more than was sold.'],
      ['Dropped', 'Accident during prep or service.'],
      ['Other', 'Anything else - explain it in the note.']
    ];
    let y = 2.0;
    reasons.forEach(([t, d]) => {
      card(p, s, 0.7, y, 11.9, 0.85);
      s.addText(t, {
        x: 1.05, y: y + 0.22, w: 3.6, h: 0.42, isTextBox: true, margin: 0,
        fontFace: HEAD, fontSize: 16, bold: true, color: A
      });
      s.addText(d, {
        x: 5.0, y: y + 0.24, w: 7.4, h: 0.42, isTextBox: true, margin: 0,
        fontFace: BODY, fontSize: 13.5, color: MUTED
      });
      y += 0.97;
    });
    s.addText('The reason is what turns a number into something the kitchen can fix. Pick the true one, not the easy one.', {
      x: 0.7, y: 6.9, w: 11.9, h: 0.45, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 13, italic: true, color: MUTED
    });
  }
  return save(p, 'Shan Village - 2 Daily Wastage - STAFF guide.pptx');
}

function inventoryStaff() {
  const p = deck(); const A = GREEN;
  p.title = 'Counting stock - staff guide';
  staffTitle(p, 'Shan Village - for the counter', 'Counting stock',
    'How to do a stock take on your phone.', LINKS.inventory, A);

  {
    const s = light(p, 'Doing a count', 'Four steps', A);
    stepRows(p, s, [
      ['1', 'Open the link', 'On your phone. Save it to your home screen for next time.'],
      ['2', 'Open Stock take', 'Choose the area you are counting - kitchen, store or home. The item list appears.'],
      ['3', 'Count and type', 'Work along the shelf, not down the screen. Type what you actually see beside each item.'],
      ['4', 'Tell the office', 'When the area is finished, tell the office. They close the count - you do not need to.']
    ], A, 1.9, 3.3, 4.9, 7.7);
    codeBlank(p, s, 5.75, 'You will be asked for a code when you open a count. Your supervisor will give it to you - write it here and keep this sheet.');
  }

  {
    const s = light(p, 'You will not see the expected number', 'That is on purpose', A);
    card(p, s, 0.7, 1.95, 5.85, 2.5, SAND);
    s.addText('What you see', {
      x: 1.05, y: 2.2, w: 5, h: 0.4, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 19, bold: true, color: INK
    });
    s.addText([
      { text: 'The item name and its unit', options: { bullet: true, breakLine: true } },
      { text: 'An empty box for your number', options: { bullet: true, breakLine: true } },
      { text: 'The area you are counting', options: { bullet: true } }
    ], {
      x: 1.05, y: 2.7, w: 5.2, h: 1.5, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 14, color: MUTED, paraSpaceAfter: 6
    });
    card(p, s, 6.75, 1.95, 5.85, 2.5, SAND);
    s.addText('What you do not see', {
      x: 7.1, y: 2.2, w: 5, h: 0.4, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 19, bold: true, color: INK
    });
    s.addText([
      { text: 'What the system thinks is there', options: { bullet: true, breakLine: true } },
      { text: 'The cost or value of anything', options: { bullet: true, breakLine: true } },
      { text: 'The difference your count makes', options: { bullet: true } }
    ], {
      x: 7.1, y: 2.7, w: 5.2, h: 1.5, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 14, color: MUTED, paraSpaceAfter: 6
    });
    card(p, s, 0.7, 4.7, 11.9, 1.95, 'FFF8EC');
    s.addText('Why it works this way', {
      x: 1.0, y: 4.9, w: 8, h: 0.35, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 17, bold: true, color: INK
    });
    s.addText('If you could see the expected number, it would be very hard not to write it down. Counting without it is the only way the count is a real check. A difference is not a complaint about you - it is exactly what the count is for.', {
      x: 1.0, y: 5.32, w: 11.3, h: 1.1, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 14, color: INK
    });
  }

  {
    const s = light(p, 'Counting well', 'Four habits', A);
    const rows = [
      ['Count in the shelf unit', 'If rice is stored in 25 kg bags, count bags. Do not convert in your head.'],
      ['Finish an area before moving', 'Half-counted areas are where mistakes hide.'],
      ['Include opened packs', 'Estimate the part that is left and note that you estimated it.'],
      ['Write zero, do not skip', 'An empty shelf is the number zero. A skipped line looks like the item was never checked.']
    ];
    let y = 1.95;
    rows.forEach(([t, d], i) => {
      card(p, s, 0.7, y, 11.9, 1.05);
      badge(p, s, 1.05, y + 0.28, String(i + 1), A);
      s.addText(t, {
        x: 1.75, y: y + 0.22, w: 4.5, h: 0.4, isTextBox: true, margin: 0,
        fontFace: HEAD, fontSize: 17, bold: true, color: INK
      });
      s.addText(d, {
        x: 6.4, y: y + 0.26, w: 6.0, h: 0.6, isTextBox: true, margin: 0,
        fontFace: BODY, fontSize: 13, color: MUTED
      });
      y += 1.17;
    });
    s.addText('If something is damaged or spoiled, count it and say so in the note - do not quietly leave it out.', {
      x: 0.7, y: 6.75, w: 11.9, h: 0.45, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 13, italic: true, color: MUTED
    });
  }
  return save(p, 'Shan Village - 3 Inventory Stock Take - STAFF guide.pptx');
}

Promise.resolve()
  .then(rosterOffice).then(wastageOffice).then(inventoryOffice)
  .then(rosterStaff).then(wastageStaff).then(inventoryStaff)
  .then(() => console.log('ALL DONE'))
  .catch(e => { console.error(e); process.exit(1); });
