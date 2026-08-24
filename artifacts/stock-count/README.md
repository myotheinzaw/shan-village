# Stock Count

The source behind the **Shan Village Stock Count** artifact — the stock-taking
companion to the Duty Roster. One link, one lock code; a counter walks the
shelves with a phone and logs what is there.

Published at <https://claude.ai/code/artifact/23ef92f3-3b21-43e3-9955-7c646cb9d84a>

## How it works

The page is a single self-contained HTML document with three parts it can
rebuild itself from:

| Part | Holds |
| --- | --- |
| `<style id="appStyle">` | the whole stylesheet |
| `<script id="state">`   | the count, as JSON |
| `<script id="app">`     | the app |

Pressing **Publish** runs `buildDocument()`, which glues those three back
together with the current state and hands the result to the artifact
runtime's `publish()`. Every open view then reloads to it. Nothing a viewer
types is saved until someone publishes, so unpublished work is also mirrored
into `localStorage` and restored on the next load.

Two capabilities are declared: `artifact` (to republish itself) and
`downloads` (to hand over the .csv and the photos).

## Roles

| | Read | Add / edit stock | Delete, lists, Drive links, log |
| --- | --- | --- | --- |
| No code | ✅ | | |
| Counter code | ✅ | ✅ | |
| Admin code | ✅ | ✅ | ✅ |

Codes are never stored — only a salted SHA-256 of each. An unlock lives in
`sessionStorage` and expires after 20 minutes of no touching.

## What it records

Required per item: name, quantity + unit, location, count date (today by
default). Optional: expiry date, category, condition, remark, photo, counted
by, shelf/rack, storage, batch/lot, supplier, unit cost, minimum level.

Derived, never typed: days to expiry, expiry status, total value
(qty × unit cost), below-minimum flag, item ID, first-logged and
last-updated stamps.

## Google Drive

The page **cannot** upload to Drive. Drive writes need the viewer's own
Google sign-in, which a shared link does not carry, and a page that declares
the connector capability cannot be link-shared at all. So the flow is:
save the file locally, then upload.

Two folder links are configurable under **Setup → Drive folders**:

- **Main folder** — where the `.csv` goes.
- **Photos sub-folder** — a folder inside the main one, holding only photos.
  Create it in Drive by hand, then paste its link so the button jumps
  straight there.

Photos are named `location_item_countdate_ID.jpg` so they sort themselves.

## Photos and the size ceiling

A published artifact must stay under 16 MB, and photos live inside the page
as data URIs. Each capture is redrawn at most 1000 px on its long side and
re-encoded as JPEG at q0.55 — roughly 15–40 KB, enough to read a label. The
Excel & photos tab shows a meter; past 9 MB it warns, past 13 MB it refuses
new photos. **Setup → Clear all photos** empties the store once they are
safely in Drive.

## Excel

`.xlsx` is not on the artifact download allowlist, so the export is a
UTF-8 `.csv` with a BOM — Excel opens it directly, and the BOM is what keeps
Burmese and Arabic item names intact. If CSV downloads are blocked in a
given view, the page falls back to copying tab-separated rows to the
clipboard, which pastes straight into an open sheet.

## Building

```sh
cd src && python3 build.py     # writes ../stock-count.html
```

`build.py` concatenates `p1.html` (head + CSS) and `p2.js`–`p5.js` (state and
helpers, rendering, form and export, locks and publish) around a seed state
object. It refuses to build if a raw `</script>` ever appears in the JS,
which would break the self-rebuild.

## Tests

Headless Chromium, no test runner:

```sh
npm i --no-save playwright-core
node test/ui.test.js            # 29 checks: form, filters, export, locks
node test/photo-rebuild.test.js # 12 checks: photo shrink, self-rebuild, phone layout
```

Both print `ok` / `FAIL` per check and dump any page errors at the end. The
second one matters most: it rebuilds the document the way `publish()` does,
loads it fresh, and confirms the items and photos survived the round trip.

Only expected console error offline: the Google Fonts stylesheet failing to
load.
