"""Runs the population probe (tools/probes/population.js) over several seeds in parallel browser jobs and
prints the report: the world by year, the shape of every country's curve banded by governance fit,
technology and supply, the extremes, the watch list, and the verdicts the design asks for.

  python tools/population.py --run --seeds 12345,777,4242 --years 15 [--freeze] [--out DIR]
  python tools/population.py --quick                 # one seed, eight years
  python tools/population.py DIR/pop-12345.json ...  # report on saved runs

A 15-year run takes about twenty-five minutes with three jobs; --quick about eight.
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
PROBE = os.path.join(HERE, "probes", "population.js")


def run(seeds, years, freeze, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    src = open(PROBE, encoding="utf-8").read()
    jobs = []
    days = years * 365
    hold = 90000 + int(days * 330)                     # ~250-300 ms a sim-day with three jobs sharing the machine, and room to spare
    timeout = hold // 1000 + 120
    for seed in seeds:
        js = os.path.join(out_dir, "pop-%d.js" % seed)
        with open(js, "w", encoding="utf-8") as f:
            f.write("r.seeds = [%d]; r.years = %d; r.freezeOutput = %s;\n" % (seed, years, "true" if freeze else "false"))
            f.write(src)
        log = open(os.path.join(out_dir, "pop-%d.out" % seed), "w", encoding="utf-8")
        cmd = [sys.executable, os.path.join(HERE, "smoke.py"), "--eval-file", js, "--hold", str(hold), "--timeout", str(timeout)]
        jobs.append((seed, subprocess.Popen(cmd, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT), log))
        print("started seed %d (hold %d s)" % (seed, hold // 1000))
    t0 = time.time()
    for seed, p, log in jobs:
        p.wait(); log.close()
        print("seed %d finished after %d s" % (seed, time.time() - t0))
    paths = []
    for seed, _, _ in jobs:
        txt = open(os.path.join(out_dir, "pop-%d.out" % seed), encoding="utf-8", errors="replace").read()
        i = txt.find("{")
        if i < 0:
            print("seed %d: no JSON\n%s" % (seed, txt[-600:]))
            continue
        js_path = os.path.join(out_dir, "pop-%d.json" % seed)
        with open(js_path, "w", encoding="utf-8") as f:
            f.write(txt[i:])
        paths.append(js_path)
    return paths


def load(paths):
    runs = {}
    for p in paths:
        d = json.load(open(p, encoding="utf-8"))
        for seed, v in d.items():
            runs[int(seed)] = v
    return runs


def fmt(v, nd=2):
    if v is None:
        return "-"
    if isinstance(v, float):
        return ("%." + str(nd) + "f") % v
    return str(v)


def band_of(sm):
    gov = "fit" if sm["misfit"] <= 10 else "misfit"
    tech = "low" if sm["tech"] < 40 else "mid" if sm["tech"] < 70 else "high"
    sup = "fed" if sm["minBal"] >= 0.97 else "tight" if sm["minBal"] >= 0.9 else "short"
    return gov, tech, sup


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


def report(runs):
    seeds = sorted(runs)
    print("\nPopulation probe: seeds %s, %s years, step %s days%s" % (seeds, runs[seeds[0]]["years"], runs[seeds[0]]["step"],
          " (output frozen)" if runs[seeds[0]].get("freezeOutput") else ""))
    # A. the world by year
    print("\nA. The world by year (per seed: population M, food balance, materials balance, famine>5% / >20%, rationing, at the death cap, mean legitimacy, food price)")
    for seed in seeds:
        w = runs[seed]["world"]
        per_year = w[11::12] if len(w) > 12 else w
        print("  seed %d" % seed)
        for row in per_year:
            print("    y%2d pop %5d  bal food %.2f mat %.2f  famine %3d/%3d  rationing %3d  atCap %3d  legit %5.1f  food %.2f" % (
                round(row["d"] / 365), row["pop"], row["bal"][2], row["bal"][1], row["famine"], row["famine20"], row["rationing"], row["atDeathCap"], row["legit"], row["price"][2] if row["price"] else 0))
    # B. bands
    print("\nB. Bands (governance fit x technology x supply): n, median growth in a year, median drawdown, share with drawdown >= 10%, median period (months), share with two peaks, share growing in the last year")
    cells = {}
    for seed in seeds:
        for iso, sm in runs[seed]["summary"].items():
            cells.setdefault(band_of(sm), []).append(sm)
    for key in sorted(cells):
        rows = cells[key]
        if len(rows) < 3:
            continue
        periods = [r["period"] for r in rows if r["period"]]
        print("  %-6s %-4s %-5s n=%3d  growth %5.1f%%  drawdown %5.1f%%  dd>=10%% %3d%%  period %s  cycles %3d%%  growing %3d%%" % (
            key[0], key[1], key[2], len(rows), 100 * statistics.median(r["maxGrowth12"] for r in rows), 100 * statistics.median(r["drawdown"] for r in rows),
            round(100 * sum(1 for r in rows if r["drawdown"] >= 0.1) / len(rows)), fmt(statistics.median(periods), 0) if periods else "-",
            round(100 * sum(1 for r in rows if r["peaks"] >= 2) / len(rows)), round(100 * sum(1 for r in rows if r["lastYear"] > 0.005) / len(rows))))
    # C. extremes and flags
    print("\nC. Extremes (across seeds)")
    allrows = [(seed, iso, sm) for seed in seeds for iso, sm in runs[seed]["summary"].items()]
    for title, key, rev in (("deepest drawdowns", lambda t: t[2]["drawdown"], True), ("fastest declines in a year", lambda t: t[2]["maxDecline12"], True), ("largest end/start", lambda t: t[2]["end"] / max(1e-9, t[2]["start"]), True), ("smallest end/start", lambda t: t[2]["end"] / max(1e-9, t[2]["start"]), False)):
        top = sorted(allrows, key=key, reverse=rev)[:8]
        print("  %s: %s" % (title, ", ".join("%s@%d %.2f" % (iso, seed, key((seed, iso, sm))) for seed, iso, sm in top)))
    # a country that has fallen to its food line and stopped (its land and its purse feed a quarter of the people it started with)
    # is not dying out; one still falling under a quarter, or growing past 1.8x, is flagged
    flags = [(seed, iso) for seed, iso, sm in allrows if sm["end"] / max(1e-9, sm["start"]) > 1.8 or (sm["end"] / max(1e-9, sm["start"]) < 0.25 and sm["lastYear"] < -0.02)]
    settled = [(seed, iso) for seed, iso, sm in allrows if sm["end"] / max(1e-9, sm["start"]) < 0.4 and (seed, iso) not in flags]
    print("  flags (grows past 1.8x, or under a quarter and still falling): %s" % (", ".join("%s@%d" % (i, s) for s, i in flags) or "none"))
    print("  settled far below their start (under 0.4x, at their line): %s" % (", ".join("%s@%d" % (i, s) for s, i in settled) or "none"))
    # D. watch list
    print("\nD. Watch list, seed %d (population, famine, ration, cover)" % seeds[0])
    for iso, w in runs[seeds[0]]["watch"].items():
        print("  %-3s pop %s  %.1f -> %.1f" % (iso, spark(w["pop"]), w["pop"][0], w["pop"][-1]))
        print("      fam %s  ration %s  cover %s" % (spark(w["famine"], 30), spark(w["ration"], 30), spark([c if c is not None else 999 for c in w["cover"]], 30)))
    # E. verdicts
    print("\nE. Verdicts")
    misfit_low_short = cells.get(("misfit", "low", "short"), []) + cells.get(("misfit", "low", "tight"), [])
    periods = [r["period"] for r in misfit_low_short if r["period"]]
    med_period = statistics.median(periods) / 12 if periods else None
    print("  wave in the misfit/low/short band: median period %s years (want 10-20), n=%d with a period of %d" % (fmt(med_period, 1), len(misfit_low_short), len(periods)))
    fit = [r["drawdown"] for k, rows in cells.items() for r in rows if k[0] == "fit"]
    mis = [r["drawdown"] for k, rows in cells.items() for r in rows if k[0] == "misfit"]
    if fit and mis:
        print("  damping: median drawdown fit %.1f%% vs misfit %.1f%% (want fit < misfit)" % (100 * statistics.median(fit), 100 * statistics.median(mis)))
    print("  nobody grows forever or dies out: %s" % ("yes" if not flags else "NO: " + ", ".join("%s@%d" % (i, s) for s, i in flags)))


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")          # the sparklines
    except Exception:
        pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("paths", nargs="*", help="saved pop-<seed>.json files to report on")
    ap.add_argument("--run", action="store_true", help="run the probe first")
    ap.add_argument("--quick", action="store_true", help="one seed, eight years")
    ap.add_argument("--seeds", default="12345,777,4242")
    ap.add_argument("--years", type=int, default=15)
    ap.add_argument("--freeze", action="store_true", help="freeze output growth (isolate the people cycle)")
    ap.add_argument("--out", default=None, help="directory for the runs (default: a temp dir under the system temp)")
    a = ap.parse_args()
    paths = list(a.paths)
    if a.run or a.quick:
        seeds = [12345] if a.quick else [int(x) for x in a.seeds.split(",") if x.strip()]
        years = 8 if a.quick else a.years
        out_dir = a.out or os.path.join(tempfile.gettempdir(), "strain-population")
        paths += run(seeds, years, a.freeze, out_dir)
        print("runs saved under", out_dir)
    if not paths:
        ap.error("nothing to report on: pass --run, --quick or saved json files")
    report(load(paths))


if __name__ == "__main__":
    main()
