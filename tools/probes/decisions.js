// Decision probe: one seed, a year in, then every country's candidate list on
// both cadences, reporting per action how often it is offered, the spread of
// its value, risk and U (income-days per day of horizon), how often it is the
// top candidate, and how often each kind of move was actually taken over the
// year (every decision taken, by cadence).  Run with
//   python tools/smoke.py --eval-file tools/probes/decisions.js --hold 300000 --timeout 360
var W = window.WORLD, D = window.DECIDE, S = W.COUNTRY_STATE, C = window.COUNTRIES, cfg = window.ENTITY_CONFIG;
var SEED = 12345, DAYS = 400;
var seed = 0x9e3779b9 ^ SEED;                                 // a small generator of its own, so the world's is untouched
function rng() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
function r2(x) { return Math.round(x * 100) / 100; }
function r3(x) { return Math.round(x * 1000) / 1000; }
function dist(arr) {
  if (!arr.length) return null;
  var a = arr.slice().sort(function (x, y) { return x - y; }), n = a.length, m = 0;
  a.forEach(function (x) { m += x; }); m /= n;
  return { n: n, mean: r3(m), min: r3(a[0]), p10: r3(a[Math.floor(n * 0.1)]), p50: r3(a[Math.floor(n * 0.5)]), p90: r3(a[Math.floor(n * 0.9)]), max: r3(a[n - 1]) };
}
var taken = { weekly: {}, monthly: {} }, origAct = D.act, origWeekly = D.diplomacyWeekly;
D.act = function (iso, r) { var res = origAct(iso, r); if (res) taken.monthly[res.action] = (taken.monthly[res.action] || 0) + 1; return res; };
D.diplomacyWeekly = function (iso, r) { var res = origWeekly(iso, r); if (res) taken.weekly[res.action] = (taken.weekly[res.action] || 0) + 1; return res; };
W.newWorld(SEED); W.advanceDays(DAYS);
D.act = origAct; D.diplomacyWeekly = origWeekly;
var acc = {}, tops = { weekly: {}, monthly: {} }, countries = 0, horizons = [], cautions = [];
function at(k) { return acc[k] || (acc[k] = { offered: 0, value: [], risk: [], U: [] }); }
var parts = {};                                                // the war candidates' parts, averaged
for (var iso in S) {
  var s = S[iso];
  if (!s.st || !s.production || s.pop < 1) continue;
  countries++;
  var T = C.temperament(s.occupiedBy || iso, W.seed), P = D.prioritiesOf(iso);
  horizons.push(P.horizon); cautions.push(D.cautionOf(T, cfg));
  ["weekly", "monthly"].forEach(function (loop) {
    var cands = D.candidates(iso, s, cfg, T, s.occupiedBy || null, loop, rng), best = null;
    cands.forEach(function (k) {
      var a = at(k.action); a.offered++; a.value.push(k.value || 0); a.risk.push(k.risk || 0); a.U.push(k.U || 0);
      if (k.parts) for (var pk in k.parts) (parts[pk] || (parts[pk] = [])).push(k.parts[pk]);
      if (!best || k.U > best.U) best = k;
    });
    if (best) tops[loop][best.action] = (tops[loop][best.action] || 0) + 1;
  });
}
var out = { seed: SEED, day: W.WORLD_STATE.day, countries: countries, horizon: dist(horizons), caution: dist(cautions), decideTemp: cfg.decideTemp, actions: {}, top: tops, taken: taken, log: {} };
for (var k in acc) out.actions[k] = { offered: acc[k].offered, perCountry: r2(acc[k].offered / countries), value: dist(acc[k].value), risk: dist(acc[k].risk), U: dist(acc[k].U) };
out.warParts = {}; for (var pk2 in parts) out.warParts[pk2] = dist(parts[pk2]);
(W.WORLD_STATE.log || []).forEach(function (e) { var key = e.kind + (e.key ? ":" + e.key : ""); out.log[key] = (out.log[key] || 0) + 1; });
return out;
