"""Reads the war ROI probe (tools/probes/warroi.js, saved from tools/smoke.py --eval-file) and prints what wars
predicted against what they returned.

  python tools/warroi.py out_a.txt out_b.txt

Every money figure is in days of the attacker's income at declaration, the same unit the decision scores in.
"""
import json
import statistics
import sys


def load(paths):
    seeds = {}
    for p in paths:
        txt = open(p, encoding="utf-8", errors="replace").read()
        i = txt.find("{")
        if i < 0:
            print("no JSON in", p)
            continue
        for k, v in json.loads(txt[i:]).items():
            seeds[k] = v
    return seeds


def med(vals):
    vals = [v for v in vals if v is not None]
    return statistics.median(vals) if vals else 0.0


def quart(vals):
    vals = sorted(v for v in vals if v is not None)
    if not vals:
        return (0.0, 0.0, 0.0)
    n = len(vals)
    return (vals[n // 4], vals[n // 2], vals[(3 * n) // 4])


def main():
    seeds = load(sys.argv[1:])
    wars = []
    rows = {}
    for s, v in seeds.items():
        rows = v.get("rows", rows)
        for w in v["wars"]:
            w["seed"] = s
            wars.append(w)
    if not wars:
        print("no wars recorded")
        return
    print("War ROI: %d wars across %d seeds, %d years each" % (len(wars), len(seeds), next(iter(seeds.values()))["years"]))
    print("rows: " + ", ".join("%s=%s" % (k, rows[k]) for k in sorted(rows)))

    print("\nA. What the decision predicted against what the war returned (income-days, median)")
    print("  %-26s %10s %10s %10s" % ("", "predicted", "realised", "ratio"))
    pS, rS = med([w["predStake"] for w in wars]), med([w["receipts"] + 0 for w in wars])
    print("  %-26s %10.1f %10.1f %10s" % ("the prize", pS, rS, "%.2f" % (rS / pS) if pS else "n/a"))
    pC, rC = med([w["campaign"] for w in wars]), med([w["spend"] for w in wars])
    print("  %-26s %10.1f %10.1f %10s" % ("the campaign's cost", pC, rC, "%.2f" % (rC / pC) if pC else "n/a"))
    pL, rL = med([w["predLen"] for w in wars]), med([w["realLen"] for w in wars])
    print("  %-26s %10.0f %10.0f %10s" % ("days of fighting", pL, rL, "%.2f" % (rL / pL) if pL else "n/a"))
    won = sum(1 for w in wars if w["outcome"] == "won")
    lost = sum(1 for w in wars if w["outcome"] == "lost")
    decided = won + lost
    pwm = med([w["predPw"] for w in wars])
    print("  %-26s %10.2f %10.2f %10s" % ("chance of winning", pwm, won / decided if decided else 0,
                                          "%.2f" % ((won / decided) / pwm) if decided and pwm else "n/a"))
    print("  (that rate is won/(won+lost); stalemates and bare peaces are neither, and are listed below)")

    if any(w.get("ending") for w in wars):
        print("\nA2. How wars actually ended, read from the log entry each ending wrote")
        print("  %-34s %4s %9s %9s %8s" % ("ending", "n", "median d", "occupied", "lastScore"))
        def label(w):
            e = w.get("ending")
            if not e:
                return "no ending logged"
            if e["kind"] == "victory":
                side = "attacker" if e.get("key") == "attacker" else "defender"
                return "victory, %s%s" % (side, ", occupies" if e.get("occupies") else "")
            return e["kind"]
        for lab in sorted({label(w) for w in wars}):
            k = [w for w in wars if label(w) == lab]
            print("  %-34s %4d %9.0f %9d %+8.2f" % (lab, len(k), med([w["realLen"] for w in k]),
                  sum(1 for w in k if (w.get("occStart") or -1) >= 0), med([w["lastScore"] for w in k])))
        # the contradiction the instrument was built to resolve
        att_vic = [w for w in wars if w.get("ending") and w["ending"]["kind"] == "victory" and w["ending"].get("key") == "attacker"]
        low = [w for w in att_vic if w["lastScore"] < 0.9]
        print("  attacker victories with the main front under +0.9 at last sight: %d of %d" % (len(low), len(att_vic)))
        if low:
            print("    with a side front open at last sight: %d; with none: %d  (a principal beaten on a side front ends the war)"
                  % (sum(1 for w in low if w["fronts"] > 0), sum(1 for w in low if w["fronts"] == 0)))
        pe = [w for w in wars if w.get("ending") and w["ending"]["kind"] == "peace"]
        if pe:
            print("  peaces by the rung they closed on (0 status quo, 1 indemnity, 2 and a lease, 3 and tribute):")
            for rg in range(4):
                k = [w for w in pe if w["ending"].get("rung") == rg]
                if k:
                    print("    rung %d  %3d  median main score %+.2f  median days %3.0f" % (rg, len(k), med([w["lastScore"] for w in k]), med([w["realLen"] for w in k])))
        later = [w for w in wars if w.get("occStart") == -1]
        print("  occupations the old probe credited to a war that ended at the table or earlier: %d (now excluded)" % len(later))

    print("\nB. Outcomes")
    for o in sorted({w["outcome"] for w in wars}):
        k = [w for w in wars if w["outcome"] == o]
        if not k:
            continue
        print("  %-14s %3d (%2.0f%%)  receipts %7.1f  held %4.0f days  net %8.1f" %
              (o, len(k), 100 * len(k) / len(wars), med([w["receipts"] for w in k]), med([w["heldDays"] for w in k]),
               med([w["receipts"] - w["spend"] - w["deathCost"] for w in k])))

    print("\nC. The net return, all costs counted (receipts minus spending minus the dead)")
    lo, mid, hi = quart([w["receipts"] - w["spend"] - w["deathCost"] for w in wars])
    print("  quartiles %.1f / %.1f / %.1f income-days" % (lo, mid, hi))
    pos = sum(1 for w in wars if w["receipts"] - w["spend"] - w["deathCost"] > 0)
    print("  wars that paid for themselves: %d of %d (%.0f%%)" % (pos, len(wars), 100 * pos / len(wars)))
    print("  wars that took no ground at all: %d (%.0f%%)" % (sum(1 for w in wars if w["heldDays"] == 0),
                                                              100 * sum(1 for w in wars if w["heldDays"] == 0) / len(wars)))

    print("\nD. A year after declaring (median change)")
    print("  output %+.1f%%   stability %+.1f   legitimacy %+.1f   weariness %+.2f   treasury %+.1f income-days" %
          (med([w["dOutput"] for w in wars]), med([w["dStability"] for w in wars]), med([w["dLegit"] for w in wars]),
           med([w["dWeary"] for w in wars]), med([w["dTreasuryDays"] for w in wars])))
    print("  war dead: median %.2f%% of the attacker's people, priced at %.1f income-days" %
          (med([w["deathsPct"] for w in wars]), med([w["deathCost"] for w in wars])))

    print("\nD2. Is the judged chance of winning calibrated? (bands on the ratio the government itself judged)")
    print("  %-12s %4s %9s %9s %8s %8s %8s %9s" % ("judged odds", "n", "predicted", "won rate", "won", "lost", "other", "predLen"))
    for lo, hi in [(0, 1.2), (1.2, 1.6), (1.6, 2.5), (2.5, 5), (5, 1e9)]:
        k = [w for w in wars if lo <= w["odds"] < hi]
        if not k:
            continue
        kw = sum(1 for w in k if w["outcome"] == "won")
        kl = sum(1 for w in k if w["outcome"] == "lost")
        rate = kw / (kw + kl) if kw + kl else float("nan")
        print("  %-12s %4d %9.2f %9s %8d %8d %8d %9.0f" %
              ("%g-%g" % (lo, hi if hi < 1e9 else 99), len(k), med([w["predPw"] for w in k]),
               "-" if kw + kl == 0 else "%.2f" % rate, kw, kl, len(k) - kw - kl, med([w["predLen"] for w in k])))
    capped = [w for w in wars if w.get("capDays") and w["predLen"] > w["capDays"]]
    if capped:
        print("  wars the decision expected to outlast warMaxDays: %d of %d (it cannot see that cut)" % (len(capped), len(wars)))
    if any("rawOdds" in w for w in wars):
        print("  for comparison, the bare force ratio this probe used to report: median %.1f against a judged %.2f"
              % (med([w.get("rawOdds", 0) for w in wars]), med([w["odds"] for w in wars])))

    print("\nE. By motive")
    print("  %-12s %4s %9s %9s %9s %9s %8s" % ("motive", "n", "predicted", "receipts", "net", "won", "dOutput"))
    for mo in sorted({w["motive"] for w in wars}):
        k = [w for w in wars if w["motive"] == mo]
        print("  %-12s %4d %9.1f %9.1f %9.1f %8.0f%% %7.1f%%" %
              (mo, len(k), med([w["predStake"] for w in k]), med([w["receipts"] for w in k]),
               med([w["receipts"] - w["spend"] - w["deathCost"] for w in k]),
               100 * sum(1 for w in k if w["outcome"] == "won") / len(k), med([w["dOutput"] for w in k])))

    print("\nF. The ten largest gaps between prediction and return")
    ranked = sorted(wars, key=lambda w: w["predStake"] - (w["receipts"] - w["spend"] - w["deathCost"]), reverse=True)
    print("  %-10s %-9s %9s %8s %8s %6s %s" % ("pair", "motive", "predicted", "net", "held", "won", "outcome"))
    for w in ranked[:10]:
        print("  %-10s %-9s %9.0f %8.1f %8.0f %6s %s" %
              (w["att"] + ">" + w["def"], w["motive"], w["predStake"], w["receipts"] - w["spend"] - w["deathCost"],
               w["heldDays"], "yes" if w["outcome"] == "won" else "no", w["outcome"]))


main()
