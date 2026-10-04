// War ROI probe: for every war a country declares, record what the decision predicted and then measure what the war
// actually returned, in the same unit the decision uses (days of the attacker's income at declaration).
//
//   python tools/smoke.py --eval-file tools/probes/warroi.js --hold 2500000 --timeout 2600
//   python tools/warroi.py <json...>
//
// Predicted, reconstructed at declaration from the exported helpers and the recorded stake:
//   stake      the prize the candidate priced (s.last.stake = round(parts.prize), income-days)
//   pw         chance of winning at the odds as judged
//   predLen    days the campaign was expected to run
//   campaign   predLen * warDayCostOf (income-days): the money, the kit worn out and the unrest
// Realised, measured day by day:
//   receipts   occupation yield actually collected while the defender was held, in income-days
//   indemnity  the peace indemnity actually charged, in income-days
//   spend      warCost per day at war, in income-days
//   outcome    won / lost / drawn, from the attacker's own lastWar record
//   deaths     the attacker's war dead as a share of its people, priced at warDeathCost
// and the attacker's state a year after declaration, so the wider consequences are visible too.
var W = window.WORLD, S = W.COUNTRY_STATE, D = window.DECIDE, E = window.ECONOMY, c = window.ENTITY_CONFIG;
var SEEDS = r.seeds || [12345, 777];
var YEARS = r.years || 10;
function r2(x) { return Math.round(x * 100) / 100; }
var out = {};

SEEDS.forEach(function (seed) {
  W.newWorld(seed);
  W.advanceDays(1);
  var live = [], done = [], origAct = D.act;
  // how each war ended, read from the entry the ending itself writes rather than inferred from the score afterwards.
  // newWorld replaced the log array, so the hook goes on after it; the cap trims in place, so it survives.
  var logArr = W.WORLD_STATE.log, origPush = logArr.push;
  logArr.push = function (e) {
    if (e && (e.kind === "victory" || e.kind === "peace" || e.kind === "stalemate")) {
      for (var li = 0; li < live.length; li++) {
        var lw = live[li];
        if (lw.ending) continue;
        var same = (e.iso === lw.att && e.iso2 === lw.def) || (e.iso === lw.def && e.iso2 === lw.att);
        if (same) {
          var tx = e.text || "";
          // the rung a peace closed on, read from what the treaty says: nothing, an indemnity, a lease too, tribute too
          var rung = e.kind !== "peace" ? null : /tribute/.test(tx) ? 3 : /leases/.test(tx) ? 2 : /indemnity/.test(tx) ? 1 : 0;
          lw.ending = { kind: e.kind, key: e.key || null, day: W.day, occupies: /occupies/.test(tx), rung: rung, text: tx }; break;
        }
      }
    }
    return Array.prototype.push.call(this, e);
  };
  D.act = function (iso, rng) {
    var res = origAct(iso, rng);
    if (res && res.action === "war" && res.target && W.warBetween(iso, res.target)) {
      var a = S[iso], d = S[res.target];
      var inc = Math.max(1, E.taxIncome(a));
      // what the government itself judged: estimateRatio's truth already carries the defender dug in, the terrain, the
      // mobilisation the declaration triggers and every potential ally on both sides weighted by its own joinChance.
      // The noisy est it actually acted on is drawn fresh from the day's stream and cannot be recovered afterwards.
      var judged = D.estimateRatio(iso, res.target, null, window.COUNTRIES.temperament(iso, W.seed));
      var truth = Math.max(0.01, judged.truth);
      // and the raw force ratio, which is what this probe used to report as the prediction and is no country's belief
      var allyA = D.allies(iso, res.target) || [], allyD = D.allies(res.target, iso) || [];
      var raw = Math.max(0.01, D.strength(iso, allyA) / Math.max(1, D.strength(res.target, allyD)));
      var dom = D.frontDomain ? D.frontDomain(iso, res.target) : null;
      var pace = dom && D.frontPace ? D.frontPace(dom) : 1;
      live.push({ att: iso, def: res.target, day: W.day, motive: res.motive || "?",
                  stake: res.stake || 0, inc: inc,
                  pw: r2(D.pWinOf(truth, c)), odds: r2(truth), rawOdds: r2(raw), sigma: r2(judged.sigma), memory: r2(judged.memory),
                  // the length as the decision sees it: warLength over the front's pace, which is what the candidate uses
                  predLen: Math.round(D.warLength(truth, c) / Math.max(1e-6, pace)), capDays: c.warMaxDays,
                  atWarDays: 0, heldDays: 0, receipts: 0, spend: 0, ended: null, outcome: null, score: 0, fronts: 0, allies: 0,
                  predBill: D.warDayCostOf ? +(D.warDayCostOf(iso, a, D.warLength(truth, c), 1, inc, D.prioritiesOf(iso), c, truth).perDay).toFixed(3) : null,
                  dead0: a.warDead || 0, out0: a.output, stab0: a.st.stability, tr0: a.treasury,
                  legit0: a.legit != null ? a.legit : 60, weary0: a.weary || 0,
                  out1: null, stab1: null, tr1: null, legit1: null, weary1: null, dead1: null });
    }
    return res;
  };
  var days = YEARS * 365;
  for (var n = 0; n < days; n++) {
    W.advanceDays(1);
    for (var i = 0; i < live.length; i++) {
      var w = live[i], a = S[w.att], d = S[w.def];
      if (!a || !a.st || !d || !d.st) continue;
      if (w.ended == null) {
        var cur = W.warBetween(w.att, w.def);                             // `live` is the list of tracked wars: do not shadow it
        if (cur) {
          w.score = +(cur.score || 0).toFixed(3);                          // the principals' front as it stood
          w.fronts = (cur.fronts || []).length;
          w.allies = (cur.allies ? (cur.allies.att || []).length + (cur.allies.def || []).length : 0);
          w.atWarDays++; w.spend += c.warCostForce != null ? c.warCostForce * W.force(w.att) : c.warCost;
        }
        else {
          w.ended = W.day;
          var rec = a.lastWar && a.lastWar[w.def];
          w.outcome = rec && rec.d >= w.day ? rec.o : "drawn";
        }
      }
      // an occupation is credited to this war only if it begins within two days of the war's end: the victory path
      // occupies on the day it ends.  A later war between the same pair, or the defender knocked out as somebody's
      // ally, used to be counted here too, which is what made wars settled at the table look as if they took ground.
      if (d.occupiedBy === w.att) {
        if (w.occStart == null) {
          if (w.ended != null && W.day <= w.ended + 2) w.occStart = W.day; else w.occStart = -1;   // -1: not this war's
        }
        if (w.occStart >= 0 && w.occEnd == null) {
          w.heldDays++;
          w.receipts += (c.occupySkim + c.occupyIndemnity) * E.taxIncome(d);     // the money leg
          var M = W.WORLD_STATE.market, take = 0;                                 // and the production leg, which spoilsOf also counts
          if (M && M.price && d.production) for (var k = 0; k < 4; k++) take += c.occupyRes * d.production[k] * M.price[k];
          w.receipts += take;
        }
      } else if (w.occStart >= 0 && w.occEnd == null) w.occEnd = W.day;         // the occupation this war earned has ended
      if (w.out1 == null && W.day - w.day >= 365) {
        w.out1 = a.output; w.stab1 = a.st.stability; w.tr1 = a.treasury;
        w.legit1 = a.legit != null ? a.legit : 60; w.weary1 = a.weary || 0; w.dead1 = a.warDead || 0;
      }
    }
  }
  D.act = origAct;
  live.forEach(function (w) {
    var a = S[w.att];
    if (w.out1 == null && a && a.st) { w.out1 = a.output; w.stab1 = a.st.stability; w.tr1 = a.treasury; w.legit1 = a.legit != null ? a.legit : 60; w.weary1 = a.weary || 0; w.dead1 = a.warDead || 0; }
    if (w.ended == null) { w.ended = W.day; w.outcome = "still fighting"; }
    var popNow = Math.max(0.001, a && a.pop ? a.pop : 1);
    var deathPct = Math.max(0, (w.dead1 || 0) - w.dead0) / popNow * 100;
    done.push({ att: w.att, def: w.def, day: w.day, motive: w.motive, outcome: w.outcome,
                predStake: Math.round(w.stake), predPw: w.pw, predLen: w.predLen, odds: w.odds,
                lastScore: w.score, fronts: w.fronts, allies: w.allies,
                endedDay: w.ended, ending: w.ending || null, occStart: w.occStart == null ? null : w.occStart,
                realLen: w.atWarDays, heldDays: w.heldDays,
                receipts: r2(w.receipts / w.inc), spend: r2(w.spend / w.inc),
                campaign: r2(w.predLen * (w.predBill != null ? w.predBill : c.warDayCost)),
                deathsPct: r2(deathPct), deathCost: r2(deathPct * c.warDeathCost),
                dOutput: r2((w.out1 - w.out0) / Math.max(1e-9, w.out0) * 100),
                dStability: r2(w.stab1 - w.stab0), dLegit: r2(w.legit1 - w.legit0),
                dWeary: r2(w.weary1 - w.weary0), dTreasuryDays: r2((w.tr1 - w.tr0) / w.inc) });
  });
  out[seed] = { wars: done, years: YEARS,
                rows: { warCostForce: c.warCostForce, warStab: c.warStab, warAttrStab: c.warAttrStab,
                        warDeathCost: c.warDeathCost, occupySkim: c.occupySkim, occupyIndemnity: c.occupyIndemnity,
                        warMinRatio: c.warMinRatio, warSharp: c.warSharp } };
});
return out;
