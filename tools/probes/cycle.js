// Cycle probe: seeds over many years, a sample every 30 days, reporting the world's mean output and confidence,
// the materials price and cover, busts and crashes, famine and regime falls per step, and per agent the shape of
// its output curve (booms, busts, drawdown, time to regain the peak).  Driven by tools/cycle.py, which sets
// r.seeds and r.years and reads the JSON; or run alone:
//   python tools/smoke.py --eval-file tools/probes/cycle.js --hold 2500000 --timeout 2600
var W = window.WORLD, S = W.COUNTRY_STATE, E = window.ECONOMY, G = window.GOV, cfg = window.ENTITY_CONFIG;
var SEEDS = r.seeds || [12345], YEARS = r.years || 20, STEP = 30;
var WATCH = ["US", "CN", "IN", "DE", "JP", "GB", "FR", "BR", "NG", "EG", "SA", "IR", "TR", "PL", "ZA", "KR", "MX", "ID", "RU", "AR"];
function r1(x) { return Math.round(x * 10) / 10; }
function r2(x) { return Math.round(x * 100) / 100; }
function r3(x) { return Math.round(x * 1000) / 1000; }
function smooth(a, w) { var o = []; for (var i = 0; i < a.length; i++) { var s = 0, n = 0; for (var j = Math.max(0, i - w + 1); j <= i; j++) { s += a[j]; n++; } o.push(s / n); } return o; }
/* turning points with a prominence of at least `prom` (a share of the level): alternating peaks and troughs */
function turningPoints(p, prom) {
  var out = [], last = { kind: "trough", i: 0, v: p[0] }, cand = null;
  for (var i = 1; i < p.length; i++) {
    if (last.kind === "trough") {
      if (!cand || p[i] > cand.v) cand = { kind: "peak", i: i, v: p[i] };
      if (cand.v > last.v * (1 + prom) && p[i] < cand.v * (1 - prom)) { out.push(cand); last = cand; cand = null; }
    } else {
      if (!cand || p[i] < cand.v) cand = { kind: "trough", i: i, v: p[i] };
      if (cand.v < last.v * (1 - prom) && p[i] > cand.v * (1 + prom)) { out.push(cand); last = cand; cand = null; }
    }
  }
  return out;
}
function maxDrawdown(p) { var peak = p[0], dd = 0; for (var i = 0; i < p.length; i++) { if (p[i] > peak) peak = p[i]; dd = Math.max(dd, 1 - p[i] / peak); } return dd; }
var out = {};
SEEDS.forEach(function (seed) {
  W.newWorld(seed);
  var step = { busts: 0, crashes: 0, falls: 0 }, bustDays = [], crashDays = [];
  W.WORLD_STATE.log.push = function (e) {
    if (e.kind === "economic" && e.key === "bust") { step.busts++; bustDays.push([e.d, e.iso || ""]); }
    if (e.kind === "economic" && e.key === "globalRecession") { step.crashes++; crashDays.push(e.d); }
    if (e.kind === "coup" || e.kind === "revolution" || e.kind === "collapse") step.falls++;
    return Array.prototype.push.call(this, e);
  };
  W.advanceDays(1);
  var agents = Object.keys(S).filter(function (i) { return S[i].st && S[i].production && S[i].pop >= 1; });
  var series = {}, watch = {}, world = [], N = Math.round(YEARS * 365 / STEP);
  agents.forEach(function (i) { series[i] = { out: [], boom: [] }; });
  WATCH.forEach(function (i) { if (S[i] && S[i].st) watch[i] = { out: [], boom: [], minBal: [], treasury: [] }; });
  for (var n = 0; n < N; n++) {
    step.busts = 0; step.crashes = 0; step.falls = 0;
    W.advanceDays(STEP);
    var M = W.WORLD_STATE.market, so = 0, sb = 0, fam = 0, busted = 0, legit = 0, short = 0, cnt = 0, gdp = 0, ppl = 0, debt = 0, dark = 0, infra = 0;
    agents.forEach(function (i) { var s = S[i]; if (!s || !s.st) return;
      series[i].out.push(r2(s.output)); series[i].boom.push(r3(s.boom || 0));
      so += s.output; sb += s.boom || 0; legit += s.legit || 0; cnt++; gdp += s.output * s.pop; ppl += s.pop; infra += s.st.infra;
      if ((s.famine || 0) > 0.05) fam++; if (W.day < (s.bustUntil || 0)) busted++;
      if (s.treasury < 0) debt++; if ((s.techUnpaid || 0) > 0.05) dark++;
      if (s.balance && Math.min.apply(null, s.balance) < 1 - cfg.shortageBite) short++; });
    world.push({ d: W.day, output: r1(so / Math.max(1, cnt)), outputW: r1(gdp / Math.max(1e-9, ppl)), boom: r3(sb / Math.max(1, cnt)), legit: r1(legit / Math.max(1, cnt)),
                 price: M ? M.price.map(r2) : null, cover: M && M.need && M.need[1] > 0 ? r2(M.stock[1] / M.need[1]) : null,
                 busts: step.busts, crashes: step.crashes, falls: step.falls, famine: fam, busted: busted, short: short,
                 debt: debt, dark: dark, infra: r1(infra / Math.max(1, cnt)),
                 recession: W.day < (W.WORLD_STATE.massive.recessionUntil || 0) ? 1 : 0 });
    for (var wi in watch) { var s2 = S[wi]; if (!s2 || !s2.st) continue; var w = watch[wi];
      w.out.push(r1(s2.output)); w.boom.push(r2(s2.boom || 0)); w.minBal.push(r2(Math.min.apply(null, s2.balance || [1]))); w.treasury.push(Math.round(s2.treasury)); }
  }
  var summary = {};
  agents.forEach(function (i) { var raw = series[i].out; if (raw.length < 4) return; var p = smooth(raw, 3), tp = turningPoints(p, 0.05);
    var booms = [], busts = [], regain = [], lastTrough = 0;
    for (var k = 0; k < tp.length; k++) {
      var t = tp[k];
      if (t.kind === "peak") { booms.push(t.i - lastTrough); }
      else { var pk = tp[k - 1]; busts.push({ depth: r3(1 - t.v / pk.v), months: t.i - pk.i });
             var back = null; for (var j = t.i; j < p.length; j++) if (p[j] >= pk.v) { back = j - pk.i; break; } regain.push(back); lastTrough = t.i; }
    }
    summary[i] = { start: raw[0], end: raw[raw.length - 1], peak: r2(Math.max.apply(null, p)), drawdown: r3(maxDrawdown(p)), peaks: booms.length,
                   booms: booms, busts: busts, regain: regain, meanBoom: r3(series[i].boom.reduce(function (a, b) { return a + b; }, 0) / series[i].boom.length),
                   tech: Math.round(S[i].st.technology), pop: r1(S[i].pop) };
  });
  out[seed] = { years: YEARS, step: STEP, agents: agents.length, world: world, summary: summary, watch: watch, bustDays: bustDays, crashDays: crashDays };
});
return out;
