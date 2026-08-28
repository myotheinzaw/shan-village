# Duty roster

https://claude.ai/code/artifact/82a8fa73-2bcd-4798-be63-4d11098ca956

The weekly timetable everyone reads, and the monthly hours and overtime the
office works from. It opens read-only for anyone with the link; an owner, admin
or chef code unlocks editing, and the page re-locks itself after 15 minutes idle.

## The parts

| File | What it is |
|---|---|
| `part-app.js` | the whole application, the `<script id="app">` of the page |
| `part-style.css` | the whole stylesheet, the `<style id="appStyle">` |
| `state.json` | a snapshot of the roster, for reference and fallback |
| `build.py` | assembles a page from those, against a local shell |

The live page rewrites itself every time somebody publishes, so its state runs
ahead of `state.json`. To ship a code change: read the live page, replace its
`<script id="app">` and `<style id="appStyle">` with these parts, publish that.
The state comes across untouched. Never rebuild from `state.json` and publish
that — it would throw away every week saved since the snapshot.

## The month is the payroll month, not the calendar month

A month named in **Monthly & Overtime** runs from the cut-off day in the month
before up to the day before it. August 2026 is **26 July to 25 August 2026**.
Every figure in that view is counted over that run — hours, normal, overtime,
the team totals — so it matches what payroll counts.

The cut-off is a setting on the month bar, owner and admin only, logged like any
other change. Set it to 1 and a plain calendar month comes back.

Overtime is per day: anything above the daily limit is overtime for that day,
the rest is normal time. Whether it is paid is a management decision — the page
only shows the hours it would apply to. No break is deducted anywhere.

## The page cannot save files, and that is not a bug

Claude grants a page the right to write a file to a device, and it refuses that
right to any page shared by link. This roster is shared by link so staff can
open it from WhatsApp without an account. So **Save as PDF and Export PDF cannot
fire for anyone opening the shared link**, and neither can the browser's print
window — which is why the old Print button did nothing at all.

What works instead:

* **Copy as CSV**, on the month bar. Clipboard writes are not restricted, so
  this works on any device whatever the sharing setting. Paste into Excel.
* **`scripts/month-pdf.mjs`**, which builds the same PDF from outside the
  browser by loading the published page headless and calling its own writer.
  A monthly routine runs it on the 26th, the morning after the period closes,
  and puts the sheet in the Drive folder.

If link sharing is ever turned off, the buttons start working with no code
change — the capability is already declared in the page. The cost is that every
viewer would then need a Claude account the roster is shared with.

## What the monthly PDF contains

Page 1 is the day-by-day grid: every person, every day of the payroll month,
days over the overtime limit shaded, with normal, overtime and total per person
and a team line. The turnover between the two calendar months is marked so the
26th and the 1st cannot be misread. Page 2 is the sheet for payroll — days
worked, total, normal and overtime per person, largest overtime first.
