# Daily master-roster export

Every evening a scheduled session builds one Excel workbook holding the whole
roster - the archive from the original workbook, whatever the roster page holds
now, and a monthly overtime summary - and files it in the Google Drive folder
`Management System`.

## Moving parts

| Piece | Where |
|---|---|
| Roster page (live data) | Claude artifact `82a8fa73-2bcd-4798-be63-4d11098ca956` |
| Archive of the original workbook | `data/roster-history.json` |
| Last known page state (fallback) | `data/artifact-state.json` |
| Builder | `scripts/export-master-roster.py` |
| Destination | Drive folder `1N-185axMNfrq49iXSlLTH1iF-mo15uRy` |
| Schedule | 16:00 UTC daily = 20:00 Gulf Standard Time |

## Running it by hand

```bash
python3 scripts/export-master-roster.py \
  --state data/artifact-state.json \
  --out "Shan Village Master Roster $(date +%F).xlsx"
```

`--state` also accepts the artifact's saved HTML: the state block is pulled out
of it. Where the page and the archive describe the same day, the page wins -
it is what the admin last published.

## Sheets

- **Read me** - when it was generated, what it covers, the overtime rule.
- **Staff** - everyone on file, position, outlet, and whether they are still on
  the roster. People who have left stay listed so their history still reads.
- **Monthly overtime** - per person per month: normal hours, overtime hours,
  total, days worked/off/leave, and how many days went over the limit.
- **Weekly grid** - the familiar week layout, newest week first.
- **Shift detail** - one row per person per day, filterable, for pivot tables.
- **Change log** - who changed what in the roster page.

## The overtime rule

Hours above the daily limit count as overtime; the limit is read from the
roster page (`ot`, default 10) so changing it there changes every report. The
hours arithmetic in `hours_of()` mirrors `hoursOf()` in the page - if one
changes, change both.
