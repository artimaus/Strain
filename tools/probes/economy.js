// Economy probe: three seeds x three years of the production model, reporting world
// production against consumption per type, prices, famine, population and output of a
// watch list, debt and projects.  Run with
//   python tools/smoke.py --eval-file tools/probes/economy.js --hold 400000
var W = window.WORLD, S = W.COUNTRY_STATE, E = window.ECONOMY, cfg = window.ENTITY_CONFIG;
var RES = window.COUNTRIES.RES_KEYS, out = {};
var WATCH = ["JP", "KR", "SG", "CH", "IL", "SA", "AE", "EG", "US", "DE", "IN", "NG", "ET", "BD"];
function world() {
  var prod = [0, 0, 0, 0], cons = [0, 0, 0, 0], pop = 0, famine = 0, broke = 0, n = 0, projects = 0, debt = 0;
  for (var iso in S) { var s = S[iso]; if (!s.production) continue; n++;
    for (var k = 0; k < 4; k++) { prod[k] += s.production[k]; cons[k] += s.consumption[k]; }
    pop += s.pop; if ((s.famine || 0) > 0.2) famine++; if (s.broke) broke++; projects += (s.projects || []).length; if (s.treasury < 0) debt++; }
  var M = W.WORLD_STATE.market;
  return { balance: prod.map(function (p, k) { return Math.round(p / cons[k] * 100) / 100; }), price: M ? M.price.map(function (p) { return Math.round(p * 100) / 100; }) : null,
           worldStock: M ? M.stock.map(function (v) { return Math.round(v); }) : null, pop: Math.round(pop), inFamine: famine, broke: broke, inDebt: debt, projects: projects, n: n };
}
function snap(iso) { var s = S[iso]; return Math.round(s.output) + "/" + Math.round(s.pop) + "M/b" + Math.round(Math.min.apply(null, s.balance || [1]) * 100) + "/$" + Math.round(s.treasury); }
var SEEDS = r.seeds || [12345, 777, 4242];
SEEDS.forEach(function (seed) {
  W.newWorld(seed);
  W.advanceDays(1);
  var res = { day1: world(), track: {} };
  WATCH.forEach(function (i) { res.track[i] = [snap(i)]; });
  [364, 365, 365].forEach(function (n) { W.advanceDays(n); WATCH.forEach(function (i) { res.track[i].push(snap(i)); }); });
  res.year3 = world();
  var reports = W.WORLD_STATE.log.filter(function (e) { return e.kind === "economic"; }).length;
  res.reports = reports;
  out[seed] = res;
});
return out;
