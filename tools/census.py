#!/usr/bin/env python3
"""Census: run tools/probes/census.js over several seeds and tabulate.

  python tools/census.py                     six seeds, three years
  python tools/census.py --seeds 1,2 --years 1 --top 20
  python tools/census.py --quick             one seed, one year
  python tools/census.py --out census        keep each seed's JSON in census/

Prints a summary across seeds first (min, median and max of every
numeric world line; the nations flagged in at least half the seeds),
then one table per seed: the nations by population with every numeric
census column and every flag.  A flag is a census key whose value is
true or false; pillars add their own keys (docs/design.md §10).

Each seed is one headless-browser run through tools/smoke.py --eval-file;
the hold and timeout grow with the days asked for.
"""
import argparse
import json
import os
import statistics
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROBE = ROOT / "tools" / "probes" / "census.js"
SMOKE = ROOT / "tools" / "smoke.py"
DEFAULT_SEEDS = [11, 22, 33, 44, 55, 66]


def run_seed(seed, days, hold, timeout, browser):
    src = "var SEED = %d, DAYS = %d;\n" % (seed, days) + PROBE.read_text(encoding="utf-8")
    fd, path = tempfile.mkstemp(suffix=".js", prefix="census-")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(src)
    cmd = [sys.executable, str(SMOKE), "--eval-file", path, "--hold", str(hold), "--timeout", str(timeout)]
    if browser:
        cmd += ["--browser", browser]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass
    for line in p.stderr.splitlines():
        if "page error" in line or "eval threw" in line or "eval failed" in line:
            print("  " + line, file=sys.stderr)
    if p.returncode == 2 or not p.stdout.strip():
        tail = p.stderr.strip().splitlines()[-1:] or ["exit %d" % p.returncode]
        raise RuntimeError("seed %d: %s" % (seed, tail[0]))
    return json.loads(p.stdout)


def fmt(v):
    if isinstance(v, bool):
        return "yes" if v else ""
    if isinstance(v, float):
        return "%.2f" % v if abs(v) < 100 else "%.0f" % v
    if v is None:
        return ""
    return str(v)


def table(rows, cols):
    widths = [max([len(c)] + [len(fmt(r.get(c))) for r in rows]) for c in cols]
    out = ["  ".join(c.ljust(w) for c, w in zip(cols, widths))]
    for r in rows:
        out.append("  ".join(fmt(r.get(c)).ljust(w) for c, w in zip(cols, widths)))
    return "\n".join(out)


def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def main():
    ap = argparse.ArgumentParser(description="Strain census over seeds")
    ap.add_argument("--seeds", default=",".join(map(str, DEFAULT_SEEDS)), help="comma list of seeds")
    ap.add_argument("--years", type=float, default=3, help="years per seed (365 days each)")
    ap.add_argument("--days", type=int, help="days per seed, overriding --years")
    ap.add_argument("--top", type=int, default=40, help="nations per seed table, by population")
    ap.add_argument("--out", help="directory to keep each seed's JSON")
    ap.add_argument("--quick", action="store_true", help="one seed, one year")
    ap.add_argument("--hold", type=int, help="ms the page may take (default grows with the days)")
    ap.add_argument("--timeout", type=int, help="seconds per browser run (default grows with the days)")
    ap.add_argument("--browser", help="path to chrome/msedge")
    a = ap.parse_args()

    seeds = [int(s) for s in a.seeds.split(",") if s.strip()]
    days = a.days or int(round(a.years * 365))
    if a.quick:
        seeds, days = seeds[:1], min(days, 365)
    hold = a.hold or max(60000, 60000 + days * 300)   # a day costs 100 to 250 ms on a busy machine
    timeout = a.timeout or max(120, hold // 1000 + 60)

    results = []
    for seed in seeds:
        print("census: seed %d, %d days..." % (seed, days), file=sys.stderr)
        res = run_seed(seed, days, hold, timeout, a.browser)
        results.append(res)
        if a.out:
            Path(a.out).mkdir(parents=True, exist_ok=True)
            Path(a.out, "census-%d.json" % seed).write_text(json.dumps(res, indent=1), encoding="utf-8")
    if not results:
        print("census: no seeds")
        return 1

    pillars = results[0].get("pillars") or []
    print("census: %d seed%s, %d days, pillars: %s" % (len(results), "" if len(results) == 1 else "s", days,
                                                      ", ".join(pillars) or "none"))
    # ── summary across seeds ──
    world_keys = [k for k, v in results[0]["world"].items() if is_num(v) and k not in ("seed", "day")]
    print("\nworld lines (min / median / max across seeds)")
    for k in world_keys:
        vals = [r["world"].get(k, 0) for r in results]
        print("  %-18s %s / %s / %s" % (k, fmt(min(vals)), fmt(statistics.median(vals)), fmt(max(vals))))
    flags = {}
    names = {}
    for r in results:
        for iso, n in r["nations"].items():
            names[iso] = n.get("name", iso)
            for k, v in n.items():
                if v is True:
                    flags[(iso, k)] = flags.get((iso, k), 0) + 1
    half = (len(results) + 1) // 2
    hot = sorted(((c, iso, k) for (iso, k), c in flags.items() if c >= half), reverse=True)
    if hot:
        print("\nflagged in at least half the seeds")
        for c, iso, k in hot[:40]:
            print("  %-24s %-14s %d/%d" % (names[iso], k, c, len(results)))
    elif flags:
        print("\nno nation is flagged in half the seeds")

    # ── one table per seed ──
    for r in results:
        nations = list(r["nations"].values())
        nations.sort(key=lambda n: -(n.get("pop") or 0))
        num_keys, flag_keys = [], []
        for n in nations:
            for k, v in n.items():
                if k in ("iso", "name", "pop"):
                    continue
                if is_num(v) and k not in num_keys:
                    num_keys.append(k)
                elif isinstance(v, bool) and k not in flag_keys:
                    flag_keys.append(k)
        cols = ["iso", "name", "pop"] + num_keys + flag_keys
        w = r["world"]
        print("\nseed %d: day %d, %d nations, %s M people, %d covered (%d ms)" % (
            r["seed"], w.get("day", 0), w.get("nations", 0), fmt(w.get("population", 0)), w.get("covered", 0), r.get("ms", 0)))
        print(table(nations[:a.top], cols))
        if len(nations) > a.top:
            print("  ... and %d more" % (len(nations) - a.top))
    return 0


if __name__ == "__main__":
    sys.exit(main())
