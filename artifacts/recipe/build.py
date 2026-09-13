"""Turn the standalone Recipe Guide HTML into the copy the roster app serves.

The standalone file carries the Shan Village logo twice as a base64 data URI
(110,412 characters each - a 300x300 PNG shown at 44px and 52px). That is
220 KB of the 446 KB file, downloaded on every open, on staff phones. Here we
pull the logo out to its own file, shrink it to the size it is actually drawn
at, and point both <img> tags at it.

Nothing else changes: same markup, same data, same password gate. To publish a
new recipe export, drop it in as source.html and run this again.

    python3 artifacts/recipe/build.py

Writes dist/recipe-guide.html and dist/recipe-guide-logo.png.
"""
import base64
import io
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "source.html")
DIST = os.path.join(HERE, "dist")
LOGO_NAME = "recipe-guide-logo.png"
LOGO_PX = 128  # drawn at 52px; 128 keeps it sharp on a 2x phone screen

html = open(SRC, encoding="utf-8").read()

uris = re.findall(r"data:image/png;base64,[A-Za-z0-9+/=]+", html)
if not uris:
    raise SystemExit("no embedded PNG found in source.html")
if len(set(uris)) != 1:
    raise SystemExit("expected one distinct embedded PNG, found %d" % len(set(uris)))

if "const PASSWORD = 'ShanVillage2026';" not in html:
    raise SystemExit("password gate missing or changed - check source.html")

from PIL import Image

raw = base64.b64decode(uris[0].split(",", 1)[1])
img = Image.open(io.BytesIO(raw)).convert("RGBA")
img.thumbnail((LOGO_PX, LOGO_PX), Image.LANCZOS)
buf = io.BytesIO()
img.save(buf, format="PNG", optimize=True)
logo = buf.getvalue()

html = html.replace(uris[0], LOGO_NAME)

os.makedirs(DIST, exist_ok=True)
open(os.path.join(DIST, "recipe-guide.html"), "w", encoding="utf-8").write(html)
open(os.path.join(DIST, LOGO_NAME), "wb").write(logo)

print("source.html      %8d bytes" % os.path.getsize(SRC))
print("recipe-guide.html%8d bytes" % len(html.encode("utf-8")))
print("%-17s%8d bytes (was %d)" % (LOGO_NAME, len(logo), len(raw)))
