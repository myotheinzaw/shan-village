# Leave

https://claude.ai/code/artifact/ee304d9a-8dab-4b87-9760-71a619510cd0

A fourth self-rebuilding page beside the roster, the wastage report and the
inventory. Staff sign in, see what annual and sick leave they have, and apply;
the office decides, and the decision is written back into the page.

## The parts

| File | What it is |
|---|---|
| `part-app.js` | the whole application, the `<script id="app">` of the page |
| `part-style.css` | the whole stylesheet, the `<style id="appStyle">` |
| `staff.json` | the eighteen names and positions taken from the roster |
| `build.js` | assembles the **first** version of `index.html` from those three |

`node artifacts/leave/build.js` writes `index.html` next to itself. That is the
seed only. From the moment the page is live it publishes new versions of itself,
so the live state runs ahead of `staff.json`; rebuilding from here starts over
and throws away every request on the page. To ship a code change to the live
page, read the live page, replace its `<script id="app">` and `<style
id="appStyle">` with these parts, and publish that — its state comes across
untouched.

## Two ways in, and what each one proves

* **A person** picks their name and types their own PIN. There is no PIN until
  they choose one, the first time they sign in; the office can clear it, nobody
  can read it back. Only the salt and the SHA-256 hash are stored.
* **The office** types the owner, admin or chef code — the same three codes as
  the roster and the wastage page. The salts and hashes were copied across, so
  no code is written down here.

A PIN tells the office who typed. It does not prove it, and the page says so on
the change log rather than pretending otherwise.

## What is not invented

Nobody's joining date is on file. Every annual figure is worked out from it, so
a person without one shows **joining date needed** rather than a number that
could be wrong. Fill them in under People, one row at a time.

The policy numbers started as the UAE statutory minimums — 30 days a year after
a year of service, 2 a month between six and twelve months, sick leave at 15
days full pay then 30 half then 45 unpaid, a certificate from 2 days. They are
a starting point, not a reading of anyone's contract, and the Settings tab says
so above the fields. Every one of them is editable there.

## It does not talk to the duty roster

The two pages cannot reach each other. Balances carries an **Approved leave
still to come** block with a Copy for the roster button, and states plainly that
somebody has to mark those days as Leave when they build the week.

## Certificates

A sick request of two days or more cannot be sent without a photograph of the
certificate; the send button refuses and says why. The picture is shrunk in the
browser before it goes anywhere, and is dropped from the page after the number
of days set in Settings — the request, its dates and its decision stay for good.
That keeps the page under the size a published artifact may be.
