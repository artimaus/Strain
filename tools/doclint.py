#!/usr/bin/env python3
"""doclint: the checks docs/process.md §7 promises.

  python tools/doclint.py              every check; exit 1 on any failure
  python tools/doclint.py --readouts   print the s._x readouts each pillar sets and reads

Checks
  1 format    every docs/**/*.md (not templates/, data/raw/, the legacy
              references) opens with "## At a glance" (5 to 10 bullets, or
              a table) then "## Summary" (one paragraph, at most 120 words)
  2 ids       every decision id cited in docs/, README.md and CLAUDE.md
              exists in docs/decisions.md; ids are unique and ascend within
              a prefix
  3 registers for each js/<name>.js with LEVERS and K, the nations.md
              section whose owner line names it: if the section has a
              register or a levers table, every key of LEVERS and K appears
              in it; the lever count is compared with design.md §9
  4 data      every docs/data/*.md (not index.md) has the header fields of
              its kind, no "(fill in)" left, and a row in docs/data/index.md
  5 lf        no CRLF under docs/, README.md, CLAUDE.md
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
LEGACY = {"bench.md", "map.md", "player.md", "nations.md"}
PREFIXES = ["CON", "ARC", "FND", "ECO", "PRD", "TRD", "HLT", "REL", "WAR", "REG", "OUT", "PLY", "PRC"]
ID_RE = re.compile(r"\b(%s)-(\d{2,3})\b" % "|".join(PREFIXES))
PILLARS = ["economy", "products", "trade", "relations", "war"]


def rel(p):
    return p.relative_to(ROOT).as_posix()


def read(p):
    return p.read_text(encoding="utf-8")


# ── 1. format ──────────────────────────────────────────────────────────
def check_format(path, text, out):
    lines = text.split("\n")
    h2 = [(i, l.strip()) for i, l in enumerate(lines) if l.startswith("## ")]
    if len(h2) < 2 or h2[0][1] != "## At a glance" or h2[1][1] != "## Summary":
        out.append("%s:1: the first two sections must be '## At a glance' then '## Summary'" % rel(path))
        return
    glance = lines[h2[0][0] + 1:h2[1][0]]
    bullets = [l for l in glance if l.startswith("- ")]
    table = [l for l in glance if l.startswith("|")]
    if not table and not 5 <= len(bullets) <= 10:
        out.append("%s:%d: At a glance has %d bullets; 5 to 10 (or one table)" % (rel(path), h2[0][0] + 1, len(bullets)))
    end = h2[2][0] if len(h2) > 2 else len(lines)
    summary = [l for l in lines[h2[1][0] + 1:end] if l.strip() and not l.startswith("|")]
    words = sum(len(l.split()) for l in summary)
    if words == 0 or words > 120:
        out.append("%s:%d: Summary has %d words; 1 to 120" % (rel(path), h2[1][0] + 1, words))
    if "" in [l.strip() for l in summary] or any(l.startswith("- ") for l in summary):
        out.append("%s:%d: Summary must be one paragraph" % (rel(path), h2[1][0] + 1))


# ── 2. ids ─────────────────────────────────────────────────────────────
def check_ids(out):
    dec = DOCS / "decisions.md"
    if not dec.exists():
        out.append("docs/decisions.md: missing")
        return
    defined, order = set(), {}
    for n, line in enumerate(read(dec).split("\n"), 1):
        m = re.match(r"### (%s)-(\d{2,3}) ·" % "|".join(PREFIXES), line)
        if not m:
            continue
        pid, num = m.group(1), int(m.group(2))
        full = "%s-%s" % (pid, m.group(2))
        if full in defined:
            out.append("docs/decisions.md:%d: %s defined twice" % (n, full))
        defined.add(full)
        if order.get(pid, 0) >= num:
            out.append("docs/decisions.md:%d: %s out of order within its prefix" % (n, full))
        order[pid] = max(order.get(pid, 0), num)
    files = [p for p in DOCS.rglob("*.md") if "templates" not in p.parts and "raw" not in p.parts]
    files += [ROOT / "README.md", ROOT / "CLAUDE.md"]
    for p in files:
        for n, line in enumerate(read(p).split("\n"), 1):
            for m in ID_RE.finditer(line):
                full = "%s-%s" % (m.group(1), m.group(2))
                if full not in defined:
                    out.append("%s:%d: %s is cited but not in docs/decisions.md" % (rel(p), n, full))


# ── 3. registers ───────────────────────────────────────────────────────
def object_keys(src, name):
    """The keys of `const <name> = {...}`: braces matched, comments dropped."""
    src = re.sub(r"//[^\n]*", "", src)
    m = re.search(r"const %s = \{" % name, src)
    if not m:
        return None
    i, depth, j = m.end() - 1, 0, m.end() - 1
    for j in range(i, len(src)):
        if src[j] == "{":
            depth += 1
        elif src[j] == "}":
            depth -= 1
            if depth == 0:
                break
    body = src[i + 1:j]
    return [k for k in re.findall(r"(?:^|[{,\n])\s*([A-Za-z_]\w*)\s*:", body)]


def targets():
    t = {}
    if (DOCS / "design.md").exists():
        for m in re.finditer(r"^\| (\w[\w ]*?) \| (\d+) \|$", read(DOCS / "design.md"), re.M):
            t[m.group(1).strip()] = int(m.group(2))
    return t


def nations_section(name):
    text = read(DOCS / "nations.md") if (DOCS / "nations.md").exists() else ""
    lines = text.split("\n")
    heads = [i for i, l in enumerate(lines) if l.startswith("## ")]
    for a, b in zip(heads, heads[1:] + [len(lines)]):
        sec = "\n".join(lines[a:b])
        if re.search(r"[Oo]wner[^\n]*`js/%s\.js`" % name, sec):
            return a + 1, sec
    return None, ""


def check_registers(out, notes):
    tg = targets()
    for name in PILLARS:
        js = ROOT / "js" / (name + ".js")
        if not js.exists():
            continue
        src = read(js)
        levers, consts = object_keys(src, "LEVERS") or [], object_keys(src, "K") or []
        line, sec = nations_section(name)
        if not sec:
            notes.append("%s: no nations.md section names it as owner" % rel(js))
            continue
        converted = ("### 3. Register" in sec) or ("### 4. Levers" in sec)
        if not converted:
            notes.append("docs/nations.md:%d: %s section is on the older template; register not checked (%d levers, %d constants)" % (line, name, len(levers), len(consts)))
        else:
            for k in levers + consts:
                if "`%s`" % k not in sec:
                    out.append("docs/nations.md:%d: `%s` of js/%s.js is not in the section's tables" % (line, k, name))
        if name in tg and len(levers) > tg[name]:
            notes.append("js/%s.js: %d levers against a target of %d (a decision record should say why)" % (name, len(levers), tg[name]))


# ── 4. data ────────────────────────────────────────────────────────────
HEADER = {"census": ["date", "kind", "commit", "command", "seeds", "days", "pillars", "ms per day"],
          "round": ["level", "system", "round", "commit before / after", "census before / after", "decisions", "status"]}


def check_data(out):
    data = DOCS / "data"
    if not data.exists():
        return
    index = read(data / "index.md") if (data / "index.md").exists() else ""
    for p in sorted(data.glob("*.md")):
        if p.name == "index.md":
            continue
        text = read(p)
        fields = dict(re.findall(r"^\| ([^|]+?) \| (.*?) \|$", text, re.M))
        kind = fields.get("kind", "round" if p.name.startswith("round-") else "census").strip()
        for f in HEADER.get(kind, HEADER["census"]):
            if f not in fields:
                out.append("%s:1: header field '%s' missing" % (rel(p), f))
        if "(fill in)" in text:
            out.append("%s: '(fill in)' left in" % rel(p))
        if p.name not in index:
            out.append("%s: not listed in docs/data/index.md" % rel(p))


# ── 5. lf ──────────────────────────────────────────────────────────────
def check_lf(out):
    for p in list(DOCS.rglob("*.md")) + [ROOT / "README.md", ROOT / "CLAUDE.md"]:
        if "raw" in p.parts:
            continue
        if b"\r" in p.read_bytes():
            out.append("%s: CRLF line endings" % rel(p))


# ── readouts ───────────────────────────────────────────────────────────
def readouts():
    for name in PILLARS:
        js = ROOT / "js" / (name + ".js")
        if not js.exists():
            continue
        src = read(js)
        sets = sorted(set(re.findall(r"\._(\w+)\s*=[^=]", src)))
        reads = sorted(set(re.findall(r"\._(\w+)\b", src)) - set(sets))
        print("%s\n  sets:  %s\n  reads: %s" % (name, ", ".join("_" + s for s in sets) or "none", ", ".join("_" + r for r in reads) or "none"))


def main():
    ap = argparse.ArgumentParser(description="Strain docs check")
    ap.add_argument("--readouts", action="store_true", help="print each pillar's readouts")
    a = ap.parse_args()
    if a.readouts:
        readouts()
        return 0
    out, notes = [], []
    for p in sorted(DOCS.rglob("*.md")):
        if "templates" in p.parts or "raw" in p.parts or p.name in LEGACY:
            continue
        check_format(p, read(p), out)
    check_format(ROOT / "README.md", read(ROOT / "README.md"), out)
    check_ids(out)
    check_registers(out, notes)
    check_data(out)
    check_lf(out)
    for n in notes:
        print("note: " + n)
    for f in out:
        print("FAIL " + f)
    print("doclint: %d failure%s, %d note%s" % (len(out), "" if len(out) == 1 else "s", len(notes), "" if len(notes) == 1 else "s"))
    return 1 if out else 0


if __name__ == "__main__":
    sys.exit(main())
