"""Reads a chronicle probe output (tools/probes/chronicle.js) and prints the run as material for a story: the
world by year, the biggest risers and fallers, the wars and how they went, the regime changes, the disasters,
the cartels, and each watched country's arc.

  python tools/chronicle.py chronicle_12345.out [--watch US,CN,...] [--events 200]
"""
import argparse
import json
import sys
from collections import Counter, defaultdict

F = {}


def load(path):
    txt = open(path, encoding="utf-8", errors="replace").read()
    i = txt.find("{")
    d = json.loads(txt[i:])
    for k, name in enumerate(d["fields"]):
        F[name] = k
    return d


def year(d):
    return d // 365 + 1


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--watch", default="US,CN,IN,RU,DE,JP,BR,NG,EG,SA,IR,TR,PK,ID,MX,ET,CD,UA,KR,KP,AR,ZA,YE,AF,HT,VN,PL,GB,FR,IL")
    ap.add_argument("--events", type=int, default=250)
    a = ap.parse_args()
    d = load(a.path)
    snaps, ev = d["snaps"], d["events"]
    first, last = snaps[0]["states"], snaps[-1]["states"]
    print("Chronicle of seed %d, %d years, %d agents, %d notable events" % (d["seed"], d["years"], d["agents"], len(ev)))
    # world by year
    print("\n== The world by year (mean output, world population M, states fighting, occupied, in famine, rationing, mean legitimacy, materials price, food price)")
    for i, s in enumerate(snaps):
        if i % 4 != 0:
            continue
        st = s["states"].values()
        n = len(st) or 1
        print("  y%2d  output %5.1f  pop %5d  fighting %2d  occupied %2d  famine %2d  rationing %2d  legit %4.0f  materials %5.2f  food %4.2f" % (
            i // 4, sum(x[F["output"]] for x in st) / n, sum(x[F["pop"]] for x in st), sum(x[F["fighting"]] for x in st), sum(1 for x in st if x[F["occupiedBy"]]),
            sum(1 for x in st if x[F["famine"]] > 0.05), sum(1 for x in st if x[F["ration"]] > 0.05), sum(x[F["legit"]] for x in st) / n, (s["price"] or [0, 0, 0, 0])[1], (s["price"] or [0, 0, 0, 0])[2]))
    # risers and fallers
    def ratio(iso, field):
        a0, a1 = first.get(iso), last.get(iso)
        if not a0 or not a1 or not a0[F[field]]:
            return None
        return a1[F[field]] / a0[F[field]]
    for field in ("output", "pop"):
        rs = [(ratio(i, field), i) for i in last if ratio(i, field)]
        rs.sort()
        print("\n== %s: biggest fallers %s | biggest risers %s" % (field, ", ".join("%s %.2f" % (i, r) for r, i in rs[:8]), ", ".join("%s %.2f" % (i, r) for r, i in rs[-8:][::-1])))
    # stability extremes and regime churn
    labels = defaultdict(list)
    for s in snaps:
        for iso, x in s["states"].items():
            labels[iso].append(x[F["label"]])
    churn = sorted(((sum(1 for j in range(1, len(v)) if v[j] != v[j - 1]), iso) for iso, v in labels.items()), reverse=True)[:10]
    print("\n== Regime label changes over the run (most): %s" % ", ".join("%s %d (%s -> %s)" % (iso, n, labels[iso][0], labels[iso][-1]) for n, iso in churn))
    lows = sorted(((x[F["stability"]], iso) for iso, x in last.items()))[:10]
    highs = sorted(((x[F["stability"]], iso) for iso, x in last.items()), reverse=True)[:10]
    print("== Stability at the end: lowest %s | highest %s" % (", ".join("%s %d" % (i, v) for v, i in lows), ", ".join("%s %d" % (i, v) for v, i in highs)))
    # wars
    print("\n== Wars (declarations and how they ended)")
    kinds = Counter(e[1] for e in ev)
    print("  counts: " + ", ".join("%s %d" % kv for kv in sorted(kinds.items(), key=lambda kv: -kv[1])[:24]))
    wars = [e for e in ev if e[1] in ("war", "victory:attacker", "victory:defender", "peace", "stalemate", "front", "war:front", "war:joins", "release", "uprising")]
    for e in wars[:a.events]:
        print("  d%4d y%2d  %-18s %s" % (e[0], year(e[0]), e[1], e[4]))
    # regimes and disasters and economy
    for title, keys in (("Regime changes", ("coup", "revolution", "collapse", "succession", "election")), ("Disasters and flight", ("disaster:quake", "disaster:flood", "disaster:drought", "disaster:storm", "disaster:wildfire", "disaster:dust", "refugees")),
                        ("Economy, cartels, discoveries, aid", ("economic", "economic:globalRecession", "cartel", "discovery", "discovery:era", "aid"))):
        rows = [e for e in ev if e[1] in keys or e[1].split(":")[0] in keys]
        print("\n== %s (%d; first %d shown)" % (title, len(rows), min(len(rows), 60)))
        for e in rows[:60]:
            print("  d%4d y%2d  %-22s %s" % (e[0], year(e[0]), e[1], e[4]))
    # watch arcs
    print("\n== Arcs of the watched states (per year: output / population / stability / legitimacy / label; F = fighting, O = occupied)")
    for iso in a.watch.split(","):
        if iso not in last:
            continue
        cells = []
        for i, s in enumerate(snaps):
            if i % 4 != 0 or iso not in s["states"]:
                continue
            x = s["states"][iso]
            cells.append("y%d %s/%s/%d/%d %s%s%s" % (i // 4, x[F["output"]], x[F["pop"]], x[F["stability"]], x[F["legit"]], x[F["label"]][:12], " F" if x[F["fighting"]] else "", " O:" + x[F["occupiedBy"]] if x[F["occupiedBy"]] else ""))
        print("  %s: %s" % (iso, " | ".join(cells)))


if __name__ == "__main__":
    main()
