#!/usr/bin/env python3
"""Decide whether anything new has happened, and write the email body.

Reads the wastage and inventory pages' saved HTML, compares them against a
watermark, and prints a short report. Exit status says whether to send:

    0  something new  - stdout is the email body, first line the subject
    9  nothing new    - send nothing

The watermark is data/notify-state.json, committed after a successful send,
so a run that fails to email does not silently lose the notification.
"""
import argparse, datetime, json, os, re, sys

GULF = datetime.timezone(datetime.timedelta(hours=4))
LINKS = {
    "wastage":   "https://claude.ai/code/artifact/914809f6-93f2-4b56-9fbd-12ccd4bd1d64",
    "inventory": "https://claude.ai/code/artifact/4f1ac0e0-ab92-4c62-9a63-4dbc258721e3",
}


def load(path):
    if not path or not os.path.exists(path):
        return None
    raw = open(path, encoding="utf8").read()
    m = re.search(r'<script id="state" type="application/json">(\{.*?)</script>', raw, re.S)
    try:
        return json.loads(m.group(1) if m else raw)
    except (AttributeError, json.JSONDecodeError):
        return None


def money(cur, v):
    try:
        return "%s %,.2f".replace(",", "") % (cur, float(v)) if False else "%s %s" % (
            cur, format(float(v), ",.2f"))
    except (TypeError, ValueError):
        return "-"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wastage")
    ap.add_argument("--inventory")
    ap.add_argument("--state", default="data/notify-state.json")
    ap.add_argument("--commit", action="store_true",
                    help="write the watermark forward (only after the email is sent)")
    args = ap.parse_args()

    seen = {}
    if os.path.exists(args.state):
        seen = json.load(open(args.state, encoding="utf8"))

    now = datetime.datetime.now(GULF)
    lines, subject_bits = [], []
    new_seen = dict(seen)

    # ------------------------------------------------------------ wastage --
    w = load(args.wastage)
    if w is not None:
        cur = w.get("cur") or "AED"
        known = set(seen.get("wastage_ids") or [])
        entries = w.get("entries") or []
        fresh = [e for e in entries if e.get("id") not in known]
        new_seen["wastage_ids"] = [e.get("id") for e in entries][:400]
        if fresh:
            total = sum(float(e["price"]) for e in fresh
                        if e.get("price") not in (None, ""))
            priced = sum(1 for e in fresh if e.get("price") not in (None, ""))
            subject_bits.append("%d wastage" % len(fresh))
            lines.append("WASTAGE - %d new entr%s" % (len(fresh), "y" if len(fresh) == 1 else "ies"))
            for e in sorted(fresh, key=lambda x: (x.get("d", ""), x.get("t", ""))):
                bits = [e.get("t", ""), e.get("item", "(not named)")]
                if e.get("qty") not in (None, ""):
                    bits.append("%s %s" % (e["qty"], e.get("unit", "")))
                if e.get("reason"):
                    bits.append(e["reason"])
                if e.get("price") not in (None, ""):
                    bits.append(money(cur, e["price"]))
                bits.append("by %s" % (e.get("by") or "not named"))
                if e.get("photo"):
                    bits.append("[photo]")
                lines.append("  " + "  ".join(str(b) for b in bits if b))
            if priced:
                lines.append("  Value of the new entries: %s (%d of %d priced)"
                             % (money(cur, total), priced, len(fresh)))
            lines.append("  " + LINKS["wastage"])
            lines.append("")

    # ---------------------------------------------------------- inventory --
    inv = load(args.inventory)
    if inv is not None:
        cur = inv.get("cur") or "AED"
        known = seen.get("take_status") or {}
        status_now = {}
        changed = []
        for t in inv.get("takes") or []:
            status_now[t.get("id")] = t.get("status")
            if known.get(t.get("id")) != t.get("status"):
                changed.append(t)
        new_seen["take_status"] = status_now
        # A count is worth an email when it is handed on, not on every keystroke.
        notable = [t for t in changed
                   if t.get("status") in ("submitted", "reviewed", "approved", "locked")]
        if notable:
            subject_bits.append("%d stock take" % len(notable))
            lines.append("STOCK TAKE - %d update%s" % (len(notable), "" if len(notable) == 1 else "s"))
            locs = {l.get("id"): l.get("name") for l in inv.get("locations") or []}
            for t in notable:
                counted = sum(1 for L in (t.get("lines") or {}).values()
                              if L.get("q") not in (None, ""))
                lines.append("  %s  %s  %s  %s" % (
                    t.get("ref", "?"), locs.get(t.get("loc"), t.get("loc", "")),
                    t.get("date", ""), (t.get("status") or "").replace("_", " ")))
                lines.append("     %d of %d items counted, %s variance across %s line%s"
                             % (counted, len(t.get("lines") or {}),
                                money(cur, t.get("varValue") or 0),
                                t.get("varLines", 0), "" if t.get("varLines") == 1 else "s"))
            lines.append("  " + LINKS["inventory"])
            lines.append("")

    if not lines:
        return 9

    subject = "Shan Village - %s - %s" % (
        " and ".join(subject_bits), now.strftime("%a %d %b, %H:%M"))
    body = "\n".join(lines).rstrip() + (
        "\n\nSent automatically when something is submitted."
        "\nTimes are Abu Dhabi time.\n")

    if args.commit:
        os.makedirs(os.path.dirname(args.state) or ".", exist_ok=True)
        json.dump(new_seen, open(args.state, "w", encoding="utf8"), indent=1)

    print(subject)
    print(body)
    return 0


if __name__ == "__main__":
    sys.exit(main())
