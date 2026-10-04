"""Runs the cycle probe (tools/probes/cycle.js) over several seeds, one browser job at a time, and prints the
report: the world by year, the shape of every country's output curve (booms, busts, drawdown, time to regain
the peak), the crashes and how many busts follow them, the watch list, and the verdicts the design asks for.

  python tools/cycle.py --run --seeds 12345,777 --years 20 [--out DIR]
  python tools/cycle.py --quick                  # one seed, twelve years
  python tools/cycle.py DIR/cycle-12345.json ... # report on saved runs

A 20-year run takes about forty minutes per seed; --quick about twenty-five.
"""
import argparse
import json
import os
import statistics
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PROBE = os.path.join(HERE, "probes", "cycle.js")


def run(seeds, years, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    src = open(PROBE, encoding="utf-8").read()
    days = years * 365
    hold = 90000 + int(days * 330)
    timeout = hold // 1000 + 120
    paths = []
    for seed in seeds:                                 # one at a time: parallel browsers slow each other into the timeout
        js = os.path.join(out_dir, "cycle-%d.js" % seed)
        with open(js, "w", encoding="utf-8") as f:
            f.write("r.seeds = [%d]; r.years = %d;\n" % (seed, years))
            f.write(src)
        log_path = os.path.join(out_dir, "cycle-%d.out" % seed)
        t0 = time.time()
        print("running seed %d (hold %d s)" % (seed, hold // 1000), flush=True)
        with open(log_path, "w", encoding="utf-8") as log:
            subprocess.run([sys.executable, os.path.join(HERE, "smoke.py"), "--eval-file", js, "--hold", str(hold), "--timeout", str(timeout)],
                           cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
        print("seed %d finished after %d s" % (seed, time.time() - t0), flush=True)
        txt = open(log_path, encoding="utf-8", errors="replace").read()
        i = txt.find("{")
        if i < 0:
            print("seed %d: no JSON\n%s" % (seed, txt[-600:]))
            continue
        js_path = os.path.join(out_dir, "cycle-%d.json" % seed)
        with open(js_path, "w", encoding="utf-8") as f:
            f.write(txt[i:])
        paths.append(js_path)
    return paths


def load(paths):
    runs = {}
    for p in paths:
        for seed, v in json.load(open(p, encoding="utf-8")).items():
            runs[int(seed)] = v
    return runs


def fmt(v, nd=2):
    if v is None:
        return "-"
    if isinstance(v, float):
        return ("%." + str(nd) + "f") % v
    return str(v)


def spark(vals, width=60):
    bars = " ▁▂▃▄▅▆▇█"
    vals = [v for v in vals if v is not None]
    if not vals:
        return ""
    step = max(1, len(vals) // width)
    vals = vals[::step]
    lo, hi = min(vals), max(vals)
    if hi - lo < 1e-9:
        return bars[4] * len(vals)
    return "".join(bars[1 + int(7.999 * (v - lo) / (hi - lo))] for v in vals)


def med(xs, nd=1, scale=1.0):
    xs = [x for x in xs if x is not None]
    return fmt(statistics.median(xs) * scale, nd) if xs else "-"


def report(runs):
    seeds = sorted(runs)
    print("\nCycle probe: seeds %s, %s years, step %s days" % (seeds, runs[seeds[0]]["years"], runs[seeds[0]]["step"]))
    print("\nA. The world by year (mean output per head, the same weighted by population, mean confidence, the materials and energy price, world cover in days, mean infrastructure, busts and crashes in the year, countries in a bust window, short, in famine, in debt, with dark laboratories, regime falls, mean legitimacy)")
    for seed in seeds:
        w = runs[seed]["world"]
        print("  seed %d" % seed)
        per = 12
        for y in range(0, len(w), per):
            chunk = w[y:y + per]
            last = chunk[-1]
            print("    y%2d output %5.1f (%5.1f)  boom %.2f  mat %5.2f en %5.2f cover %5s infra %4.1f  busts %3d crashes %d  busted %3d short %3d famine %3d debt %3d dark %3d falls %3d  legit %4.0f" % (
                round(last["d"] / 365), last["output"], last.get("outputW", 0), last["boom"], last["price"][1] if last["price"] else 0,
                last["price"][0] if last["price"] else 0, fmt(last["cover"], 1), last.get("infra", 0),
                sum(r["busts"] for r in chunk), sum(r["crashes"] for r in chunk), last["busted"], last["short"], last["famine"],
                last.get("debt", 0), last.get("dark", 0), sum(r["falls"] for r in chunk), last["legit"]))
    print("\nB. The shape of the output curves (across seeds, countries with at least one bust)")
    rows = [(seed, iso, sm) for seed in seeds for iso, sm in runs[seed]["summary"].items()]
    withBust = [t for t in rows if t[2]["busts"]]
    booms = [b for t in withBust for b in t[2]["booms"]]
    depths = [b["depth"] for t in withBust for b in t[2]["busts"]]
    months = [b["months"] for t in withBust for b in t[2]["busts"]]
    regain = [g for t in withBust for g in t[2]["regain"] if g is not None]
    never = sum(1 for t in withBust for g in t[2]["regain"] if g is None)
    print("  countries: %d, with a bust %d (%d%%), with two or more %d" % (len(rows), len(withBust), round(100 * len(withBust) / max(1, len(rows))), sum(1 for t in withBust if len(t[2]["busts"]) >= 2)))
    print("  boom length (trough to peak): median %s years (want 10-12); quartiles %s / %s" % (med(booms, 1, 1 / 12), med(sorted(booms)[:max(1, len(booms) // 2)], 1, 1 / 12), med(sorted(booms)[len(booms) // 2:], 1, 1 / 12)))
    print("  bust depth (peak to trough): median %s%% (want 20-40)   bust duration: median %s months (want <= 12)" % (med(depths, 0, 100), med(months, 0)))
    print("  time to regain the prior peak: median %s years, never within the run %d of %d" % (med(regain, 1, 1 / 12), never, never + len(regain)))
    print("  max drawdown, all countries: median %s%%, share over 20%%: %d%%" % (med([t[2]["drawdown"] for t in rows], 0, 100), round(100 * sum(1 for t in rows if t[2]["drawdown"] > 0.2) / max(1, len(rows)))))
    print("  mean confidence over the run: median %s" % med([t[2]["meanBoom"] for t in rows], 2))
    print("\nC. Crashes and contagion")
    for seed in seeds:
        r = runs[seed]
        crashes, busts = r["crashDays"], r["bustDays"]
        after = sum(1 for d, iso in busts if any(0 <= d - c <= 90 for c in crashes))
        print("  seed %d: crashes %d (%.2f/yr) at days %s; busts %d (%.1f/yr), %d%% within 90 days of a crash" % (
            seed, len(crashes), len(crashes) / r["years"], ", ".join(str(c) for c in crashes[:12]) + (" ..." if len(crashes) > 12 else ""),
            len(busts), len(busts) / r["years"], round(100 * after / max(1, len(busts)))))
    print("\nD. Watch list, seed %d (output, confidence)" % seeds[0])
    for iso, w in runs[seeds[0]]["watch"].items():
        print("  %-3s out %s  %.0f -> %.0f (peak %.0f)" % (iso, spark(w["out"]), w["out"][0], w["out"][-1], max(w["out"])))
        print("      boom %s" % spark(w["boom"], 60))
    print("\nE. Verdicts")
    bl = statistics.median(booms) / 12 if booms else None
    print("  boom length 10-12 years: %s (%s)" % ("yes" if bl and 10 <= bl <= 12 else "NO", fmt(bl, 1)))
    dp = statistics.median(depths) if depths else None
    print("  bust depth 20-40%%: %s (%s)" % ("yes" if dp and 0.2 <= dp <= 0.4 else "NO", fmt(dp, 2)))
    bm = statistics.median(months) if months else None
    print("  bust duration <= 12 months: %s (%s)" % ("yes" if bm is not None and bm <= 12 else "NO", fmt(bm, 0)))
    cr = [len(runs[s]["crashDays"]) / runs[s]["years"] for s in seeds]
    print("  crashes <= 0.2/yr: %s (%s)" % ("yes" if max(cr) <= 0.2 else "NO", ", ".join(fmt(c, 2) for c in cr)))
    fam = [runs[s]["world"][-1]["famine"] for s in seeds]
    print("  famine count at the end: %s (compare the population-pass census)" % ", ".join(str(f) for f in fam))


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("paths", nargs="*", help="saved cycle-<seed>.json files to report on")
    ap.add_argument("--run", action="store_true", help="run the probe first")
    ap.add_argument("--quick", action="store_true", help="one seed, twelve years")
    ap.add_argument("--seeds", default="12345,777")
    ap.add_argument("--years", type=int, default=20)
    ap.add_argument("--out", default=None, help="directory for the runs (default: a temp dir under the system temp)")
    a = ap.parse_args()
    paths = list(a.paths)
    if a.run or a.quick:
        seeds = [12345] if a.quick else [int(x) for x in a.seeds.split(",") if x.strip()]
        years = 12 if a.quick else a.years
        out_dir = a.out or os.path.join(tempfile.gettempdir(), "strain-cycle")
        paths += run(seeds, years, out_dir)
        print("runs saved under", out_dir)
    if not paths:
        ap.error("nothing to report on: pass --run, --quick or saved json files")
    report(load(paths))


if __name__ == "__main__":
    main()
