"""Reads one or more census probe outputs (tools/probes/census.js, as saved from
tools/smoke.py --eval-file) and prints the census: per-seed outcomes at year 3,
the trajectories of the stat distributions, how much the end states differ
across seeds, and which attractors the countries sit at.

  python tools/census.py out_a.txt out_b.txt

Each file may hold text before the JSON; the JSON starts at the first brace.
"""
import json
import statistics
import sys


def load(paths):
    seeds = {}
    meta = {}
    for p in paths:
        txt = open(p, encoding="utf-8", errors="replace").read()
        i = txt.find(chr(10) + "{"); i = i + 1 if i >= 0 else (0 if txt.startswith("{") else -1)   # the JSON starts a line; a warning printed before it may hold a brace
        if i < 0:
            print("no JSON in", p, "\n", txt[-300:])
            continue
        d = json.loads(txt[i:])
        for k, v in d.items():
            if k.startswith("_"):
                meta[k] = v
            else:
                seeds[k] = v
    return seeds, meta


def fmt(v, nd=2):
    if isinstance(v, float):
        return f"{v:.{nd}f}"
    return str(v)


def row(label, cells, w=11):
    print(f"{label:<22}" + "".join(f"{fmt(c):>{w}}" for c in cells))


def section(title):
    print("\n" + title)
    print("-" * len(title))


def per_seed(seeds):
    names = list(seeds)
    section("Year 3 by seed")
    row("seed", names)
    y3 = {k: seeds[k]["years"][-1] for k in names}
    row("wars decided /yr", [fmt(sum(seeds[k]["warsPerYear"]) / 3, 1) for k in names])
    row("  by year", ["/".join(map(str, seeds[k]["warsPerYear"])) for k in names])
    row("wars all /yr", [fmt(sum(seeds[k]["allDeclared"]) / 3, 1) for k in names])
    row("  greed share", [fmt(seeds[k]["wars"]["greed"] / max(1, seeds[k]["wars"]["total"]), 2) for k in names])
    row("  repeats", [seeds[k]["wars"]["repeats"] for k in names])
    row("  attackers", [seeds[k]["wars"]["attackers"] for k in names])
    row("  prize at stake (mean)", [seeds[k]["wars"].get("stake", "-") for k in names])
    for mo in ("prize", "enmity", "opportunity", "preempt", "revanche"):
        row("  motive " + mo, [seeds[k]["wars"].get("motives", {}).get(mo, 0) for k in names])
    for kind in ("victory", "victory:attacker", "victory:defender", "stalemate", "peace", "peaceTerms", "join", "refused", "mobilise", "uprising", "occupation", "release", "coup", "election", "revolution", "succession",
                 "bigDisaster", "disaster:quake", "disaster:flood", "disaster:drought", "disaster:storm", "disaster:wildfire", "disaster:dust", "refugees", "cartel",
                 "fronts", "front", "offer", "trade", "sanction", "pact", "neutral", "left", "border", "invest", "research", "budget", "aid", "discovery", "adopt", "reaction", "economic", "bust", "crash", "crackdown", "liberal"):
        row("  log " + kind + (" (grouped)" if kind == "adopt" else ""), [seeds[k]["logKinds"].get(kind, 0) for k in names])
    for stat in ("infra", "military", "academia", "medical", "stability"):
        row("  invest " + stat, [seeds[k].get("investTargets", {}).get(stat, "-") for k in names])
    row("events large", [seeds[k]["events"]["large"] for k in names])
    row("events catastrophic", [seeds[k]["events"]["catastrophic"] for k in names])
    row("events massive", [seeds[k]["events"]["massive"] for k in names])
    row("cadence monthly", [seeds[k]["cadence"]["monthly"] for k in names])
    row("cadence weekly", [seeds[k]["cadence"]["weekly"] for k in names])
    row("deal records", [y3[k].get("dealRecords", "-") for k in names])
    row("  pairs dealing", [y3[k].get("dealPairs", "-") for k in names])
    row("  true swaps", [y3[k].get("dealSwaps", "-") for k in names])
    row("  money legs", [y3[k].get("dealMoneyLegs", "-") for k in names])
    row("  technology legs", [y3[k].get("dealTechLegs", "-") for k in names])
    row("  price floors", [y3[k].get("floorDeals", "-") for k in names])
    row("  need deals (hunger premium)", [y3[k].get("needDeals", "-") for k in names])
    row("upkeep unpaid (countries)", [y3[k].get("unpaidUpkeep", "-") for k in names])
    row("labs dark (countries)", [y3[k].get("labsDark", "-") for k in names])
    row("market bill / income", [f"{y3[k]['bill']['mean']}/{y3[k]['bill']['max']}" if y3[k].get("bill") else "-" for k in names])
    row("  running short", [y3[k].get("dealsShort", "-") for k in names])
    row("  volume moved/day", [y3[k].get("dealVolume", "-") for k in names])
    row("  countries trading", [y3[k].get("dealTraders", "-") for k in names])
    row("market access mean", [y3[k]["access"]["mean"] if y3[k].get("access") else "-" for k in names])
    row("  worst", [y3[k]["access"]["min"] if y3[k].get("access") else "-" for k in names])
    row("partner cap used", [y3[k]["partnerUse"]["mean"] if y3[k].get("partnerUse") else "-" for k in names])
    row("deals live", [y3[k]["deals"] for k in names])
    row("sanctions live", [y3[k]["sanctions"] for k in names])
    row("pacts live", [y3[k]["pacts"] for k in names])
    row("pairs touched", [y3[k]["pairs"] for k in names])
    row("rel mean/sd", [f"{y3[k]['rel']['mean']}/{y3[k]['rel']['sd']}" for k in names])
    row("hostile/warm pairs", [f"{y3[k]['hostilePairs']}/{y3[k]['warmPairs']}" for k in names])
    row("occupied / at war", [f"{y3[k]['occupied']}/{y3[k]['atWar']}" for k in names])
    row("war dead (M)", [y3[k].get("warDead", "-") for k in names])
    row("disaster dead (M)", [y3[k].get("disasterDead", "-") for k in names])
    row("refugees abroad (M)", [y3[k].get("refugeesAbroad", "-") for k in names])
    row("events adoptions", [seeds[k]["events"].get("adoptions", "-") for k in names])
    row("events footprints", [seeds[k]["events"].get("footprints", "-") for k in names])
    row("world pop", [y3[k]["pop"] for k in names])
    row("  vs day 1", [fmt(y3[k]["pop"] / seeds[k]["years"][0]["pop"], 3) for k in names])
    row("famine/broke/debt", [f"{y3[k]['inFamine']}/{y3[k]['broke']}/{y3[k]['inDebt']}" for k in names])
    row("short of food or water", [y3[k].get("short95", "-") for k in names])
    row("rationing", [y3[k].get("rationing", "-") for k in names])
    row("at treasury cap", [y3[k]["atCap"] for k in names])
    row("buyers today", [y3[k]["buyers"] for k in names])
    row("projects live", [y3[k]["projects"] for k in names])
    row("gdp gini", [y3[k]["gdpGini"] for k in names])
    row("low stability", [y3[k]["lowStability"] for k in names])
    for i, t in enumerate(("energy", "materials", "food", "water")):
        row(f"balance {t}", [y3[k]["balance"][i] for k in names])
    for i, t in enumerate(("energy", "materials", "food", "water")):
        row(f"price {t}", [y3[k]["price"][i] for k in names])
    for i, t in enumerate(("energy", "materials", "food", "water")):
        row(f"rest price {t}", [y3[k]["rest"][i] if y3[k].get("rest") else "-" for k in names])
    for i, t in enumerate(("energy", "materials", "food", "water")):
        row(f"volume {t}", [y3[k]["vol"][i] for k in names])
    types = sorted({t for k in names for t in y3[k].get("types", {})})
    for t in types:
        row("type " + t, [y3[k]["types"].get(t, 0) for k in names])
    row("legitimacy mean/sd", [f"{y3[k]['stat']['legit']['mean']}/{y3[k]['stat']['legit']['sd']}" if y3[k]["stat"].get("legit") else "-" for k in names])
    labels = sorted({l for k in names for l in y3[k]["labels"]})
    for l in labels:
        row("gov " + l[:18], [y3[k]["labels"].get(l, 0) for k in names])
    row("top GDP", [",".join(seeds[k]["topGDP"][:5]) for k in names], 26)
    row("top force", [",".join(seeds[k]["topForce"][:5]) for k in names], 26)
    row("top output", [",".join(seeds[k]["topOutput"][:5]) for k in names], 26)


def trajectories(seeds):
    names = list(seeds)
    section("Stat distributions over time, mean across seeds (min..max of the seed means) and sd across countries")
    stats = list(seeds[names[0]]["years"][0]["stat"])
    print(f"{'stat':<12}" + "".join(f"{'year ' + str(y):>34}" for y in range(4)))
    for st in stats:
        cells = []
        for y in range(4):
            ms = [seeds[k]["years"][y]["stat"][st]["mean"] for k in names]
            sds = [seeds[k]["years"][y]["stat"][st]["sd"] for k in names]
            cells.append(f"{statistics.mean(ms):8.1f} ({min(ms):.0f}..{max(ms):.0f}) sd {statistics.mean(sds):6.1f}")
        print(f"{st:<12}" + "".join(f"{c:>34}" for c in cells))
    section("World trajectories")
    for key in ("pop", "inFamine", "inDebt", "atCap", "deals", "dealRecords", "dealSwaps", "dealVolume", "sanctions", "pacts", "gdpGini", "lowStability", "occupied", "busted", "boom", "needDeals", "unpaidUpkeep"):
        print(f"{key:<14}" + "  ".join(f"{k}: " + "/".join(fmt(seeds[k]['years'][y].get(key, 0), 2) for y in range(4)) for k in names))
    for i, t in enumerate(("energy", "materials", "food", "water")):
        print(f"{'price ' + t:<14}" + "  ".join(f"{k}: " + "/".join(fmt(seeds[k]['years'][y]['price'][i], 2) for y in range(4)) for k in names))


def cross_seed(seeds, meta):
    names = list(seeds)
    fields = meta.get("_fields", [])
    if len(names) < 2:
        return
    section("End state across seeds: how much the same country differs from seed to seed")
    common = set.intersection(*[set(seeds[k]["end"]) for k in names])
    print(f"countries compared: {len(common)}")
    print(f"{'field':<12}{'median CV':>11}{'CV>10%':>9}{'CV>25%':>9}{'identical':>11}   (CV = sd / mean across seeds; identical = every seed within 1%)")
    for fi, f in enumerate(fields):
        if f in ("occupied", "label", "type"):
            continue
        cvs = []
        same = 0
        for iso in common:
            vals = [seeds[k]["end"][iso][fi] for k in names]
            m = statistics.mean(vals)
            if abs(m) < 1e-9:
                continue
            sd = statistics.pstdev(vals)
            cv = sd / abs(m)
            cvs.append(cv)
            if max(vals) - min(vals) <= 0.01 * abs(m):
                same += 1
        if not cvs:
            continue
        cvs.sort()
        n = len(cvs)
        print(f"{f:<12}{cvs[n // 2]:>11.3f}{sum(1 for c in cvs if c > 0.10) / n:>9.0%}{sum(1 for c in cvs if c > 0.25) / n:>9.0%}{same / n:>11.0%}")
    for fi, f in enumerate(fields):
        if f not in ("occupied", "label", "type"):
            continue
        diff = sum(1 for iso in common if len({seeds[k]["end"][iso][fi] for k in names}) > 1)
        print(f"{f:<12} differs between seeds for {diff} of {len(common)} countries")
    section("Rankings across seeds (mean pairwise overlap of the top 10)")
    for key in ("topGDP", "topForce", "topOutput"):
        js = []
        for i in range(len(names)):
            for j in range(i + 1, len(names)):
                a, b = set(seeds[names[i]][key]), set(seeds[names[j]][key])
                js.append(len(a & b) / len(a | b))
        print(f"{key:<10} overlap {statistics.mean(js):.2f}   " + "  ".join(f"{k}: {','.join(seeds[k][key])}" for k in names))


def attractors(seeds, meta):
    names = list(seeds)
    fields = meta.get("_fields", [])
    section("Attractors at year 3: share of countries sitting at a bound (per seed)")
    idx = {f: i for i, f in enumerate(fields)}
    tests = [
        ("treasury at cap", lambda v: v[idx["treasury"]] >= 99999),
        ("treasury negative", lambda v: v[idx["treasury"]] < 0),
        ("output within 5% of cap", lambda v: v[idx["cap"]] > 0 and v[idx["output"]] >= 0.95 * v[idx["cap"]]),
        ("output below half cap", lambda v: v[idx["cap"]] > 0 and v[idx["output"]] < 0.5 * v[idx["cap"]]),
        ("fully supplied (minBal>=.99)", lambda v: v[idx["minBal"]] >= 0.99),
        ("short (minBal<.9)", lambda v: v[idx["minBal"]] < 0.9),
        ("stability >= 90", lambda v: v[idx["stability"]] >= 90),
        ("stability <= 20", lambda v: v[idx["stability"]] <= 20),
        ("technology >= 95", lambda v: v[idx["technology"]] >= 95),
        ("technology <= 5", lambda v: v[idx["technology"]] <= 5),
        ("infra >= 95", lambda v: v[idx["infra"]] >= 95),
        ("military <= 5", lambda v: v[idx["military"]] <= 5),
        ("military >= 95", lambda v: v[idx["military"]] >= 95),
        ("medical <= 5", lambda v: v[idx["medical"]] <= 5),
        ("academia >= 95", lambda v: v[idx["academia"]] >= 95),
        ("occupied", lambda v: v[idx["occupied"]] == 1),
    ]
    row("seed", names)
    for label, fn in tests:
        cells = []
        for k in names:
            e = seeds[k]["end"]
            cells.append(f"{sum(1 for iso in e if fn(e[iso])) / max(1, len(e)):.0%}")
        row(label, cells)


def watch(seeds):
    names = list(seeds)
    section("Watch list, output/pop/min balance/treasury at day 1, year 1, 2, 3")
    isos = list(seeds[names[0]]["track"])
    for iso in isos:
        print(iso)
        for k in names:
            print(f"   {k:>8}: " + " | ".join(seeds[k]["track"][iso]))


def wars(seeds):
    names = list(seeds)
    section("Wars (first 12 per seed)")
    for k in names:
        print(k)
        for w in seeds[k]["wars"]["list"][:12]:
            print("   ", w)


def main():
    seeds, meta = load(sys.argv[1:])
    if not seeds:
        print("nothing to read")
        return
    per_seed(seeds)
    trajectories(seeds)
    cross_seed(seeds, meta)
    attractors(seeds, meta)
    watch(seeds)
    wars(seeds)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    main()
