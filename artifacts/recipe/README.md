# Recipe Guide

The password-protected Shan Village Recipe Guide, and the build step that turns
it into the copy the roster app serves at `/recipe-guide`.

| File | What it is |
| --- | --- |
| `source.html` | The standalone guide exactly as exported. Open it on its own, share it as a file - it needs nothing else. |
| `build.py` | Pulls the logo out of the HTML and shrinks it. Nothing else changes. |
| `dist/recipe-guide.html` | What the roster app serves. |
| `dist/recipe-guide-logo.png` | The logo, once, as a real file. |

## Publishing a new recipe export

1. Save the new export over `source.html`.
2. `python3 artifacts/recipe/build.py`
3. Copy `dist/` into the roster app's `public/` folder and republish.

`build.py` stops with an error if the password gate has gone missing from the
export, so a rebuild can never quietly publish an unlocked guide.

## Why the build step exists

The export carries the logo twice as a base64 data URI - 110,412 characters
each, a 300x300 PNG drawn at 44px and 52px. That is 220 KB of a 446 KB file,
downloaded every time a cook opens the guide on their phone. Extracting it and
resizing it to 128px takes the page to 226 KB plus a 23 KB image that the
browser caches.

## About the password

`ShanVillage2026` is checked in the browser, in plain sight in the page source.
It keeps the file from being read by accident when it is passed around as a
file, and that is all it does - anyone who opens the page source can read it.
Inside the roster app the real gate is the app login; the password is a second
door in front of it because staff have been taught to expect it.

So: nothing may go in this guide that would do harm if it were read by anyone
holding the link. Recipes and costs are fine. Anything genuinely confidential
needs a permission key and a row-level policy, the same as the rest of the app.
