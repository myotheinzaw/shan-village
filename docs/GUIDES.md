# The six guide decks

An OFFICE guide and a STAFF guide for each of the three pages. `scripts/build-guides.js`
builds all six from one run, so a wording change is made once and rebuilt, never edited
slide by slide in PowerPoint.

## Building them

```bash
npm install pptxgenjs          # once; it is the only dependency
node scripts/build-guides.js --out ./guides
```

That produces six files in `./guides`:

| File | For | Codes inside |
|---|---|---|
| `1 Duty Roster - OFFICE guide.pptx` | office | owner, admin, chef |
| `2 Daily Wastage - OFFICE guide.pptx` | office | all four |
| `3 Inventory and Stock Take - OFFICE guide.pptx` | office | owner, admin, staff |
| `1 Duty Roster - STAFF guide.pptx` | everyone | none |
| `2 Daily Wastage - STAFF guide.pptx` | the kitchen | none |
| `3 Inventory Stock Take - STAFF guide.pptx` | the counter | none |

## The codes are not in this repository

The generator reads them from the environment. Supply them only when you are building
the office copies:

```bash
SV_CODE_OWNER=... SV_CODE_ADMIN=... SV_CODE_CHEF=... SV_CODE_STAFF=... \
  node scripts/build-guides.js --out ./guides
```

Left unset, each code prints as a blank line for someone to fill in by hand — never a
placeholder word that could be mistaken for the real code. The staff decks show no code
either way, which is what makes them safe to send to the team; both submitting guides
carry a printed `Code: ______` line instead, so the code travels by word of mouth.

Build the staff copies with no environment variables at all and they are identical to
the ones built with them.

## Why the decks are not pushed to Google Drive

The Drive connector takes file content through the conversation as base64. That path
carries about 15,000 characters reliably. The decks are 99–144 KB, which is 130,000 to
195,000 characters — an order of magnitude past it, with no chunked upload available.

What lives in the Drive folder instead is `Shan Village - Links and how to use.txt`:
the three links, who sees what, and a short how-to for each page, with no codes in it
so the folder stays safe to share. It is plain text, so it crosses intact.

The decks reach Drive by being dragged there once from a download — they are static, so
that is a one-time job, not something worth automating.

## What the guides say, in one line each

- **Roster** — opens read-only for everyone; unlock, fill the week, publish (or lock,
  which publishes); over 10 hours in a day is overtime automatically; re-locks after 15
  minutes idle.
- **Wastage** — Add wastage and Today are open; sending asks for the staff code once;
  Reports, corrections and Settings are owner and admin only; the chef code records like
  the kitchen.
- **Inventory** — item master first; the counter sees no book figure and no values while
  counting; owner or admin closes the take, and only then does the variance appear.
