// Population probe: one or more seeds over many years, a sample every 30 days, reporting the population of
// every agent, the world's balances and counts, a watch list in detail, and per agent the shape of its
// curve (peaks, troughs, period, drawdown) with the means that band it: governance fit, technology, supply.
// Driven by tools/population.py, which sets r.seeds, r.years and r.freezeOutput and reads the JSON; or run alone:
//   python tools/smoke.py --eval-file tools/probes/population.js --hold 1100000 --timeout 1200
var W = window.WORLD, S = W.COUNTRY_STATE, E = window.ECONOMY, G = window.GOV, cfg = window.ENTITY_CONFIG, DT = window.DATA;
var SEEDS = r.seeds || [12345], YEARS = r.years || 15, STEP = 30, FREEZE = !!r.freezeOutput;
var WATCH = ["US", "CN", "IN", "NG", "ET", "BD", "EG", "JP", "SG", "SA", "CD", "TZ", "AF", "YE", "HT", "NZ", "AR", "RU", "BR", "PK"];
function r1(x) { return Math.round(x * 10) / 10; }
function r2(x) { return Math.round(x * 100) / 100; }
function r3(x) { return Math.round(x * 1000) / 1000; }
function median(a) { var b = a.slice().sort(function (x, y) { return x - y; }), n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : null; }
function smooth(a, w) { var o = []; for (var i = 0; i < a.length; i++) { var s = 0, n = 0; for (var j = Math.max(0, i - w + 1); j <= i; j++) { s += a[j]; n++; } o.push(s / n); } return o; }
/* turning points with a prominence of at least `prom` (a share of the level): alternating peaks and troughs */
function turningPoints(p, prom) {
  var out = [], last = { kind: "trough", i: 0, v: p[0] }, cand = null;
  for (var i = 1; i < p.length; i++) {
    if (last.kind === "trough") {                        // looking for a peak
      if (!cand || p[i] > cand.v) cand = { kind: "peak", i: i, v: p[i] };
      if (cand.v > last.v * (1 + prom) && p[i] < cand.v * (1 - prom)) { out.push(cand); last = cand; cand = null; }
    } else {                                             // looking for a trough
      if (!cand || p[i] < cand.v) cand = { kind: "trough", i: i, v: p[i] };
      if (cand.v < last.v * (1 - prom) && p[i] > cand.v * (1 + prom)) { out.push(cand); last = cand; cand = null; }
    }
  }
  return out;
}
function maxDrawdown(p) { var peak = p[0], dd = 0; for (var i = 0; i < p.length; i++) { if (p[i] > peak) peak = p[i]; dd = Math.max(dd, 1 - p[i] / peak); } return dd; }
function windowChange(p, w) { var up = 0, down = 0; for (var i = w; i < p.length; i++) { var g = p[i] / Math.max(1e-9, p[i - w]) - 1; up = Math.max(up, g); down = Math.min(down, g); } return { up: up, down: -down }; }
var out = {};
SEEDS.forEach(function (seed) {
  W.newWorld(seed); W.advanceDays(1);
  if (FREEZE) { cfg.growthBase = 0; cfg.degrowthRate = 0; }
  var agents = Object.keys(S).filter(function (i) { return S[i].st && S[i].production && S[i].pop >= 1; });
  var series = {}, acc = {}, start = {};
  agents.forEach(function (i) { var s = S[i]; series[i] = { pop: [], fam: [] }; acc[i] = { legit: 0, misfit: 0, tech: 0, access: 0, minBal: 0, bind: [0, 0, 0, 0], n: 0 };
    start[i] = { pop: r2(s.pop), cap: r2(W.popCap(i)), region: DT.regionOf(i), foodPerHead: r3(s.potential ? s.potential[2] / Math.max(0.001, s.pop) : 0) }; });
  var watch = {}; WATCH.forEach(function (i) { if (S[i] && S[i].st) watch[i] = { pop: [], births: [], deaths: [], cover: [], minBal: [], output: [], legit: [], ration: [], pop0: [], famine: [] }; });
  var world = [], N = Math.round(YEARS * 365 / STEP);
  for (var n = 0; n < N; n++) {
    W.advanceDays(STEP);
    var tp = 0, fam = 0, fam2 = 0, rat = 0, coverSum = 0, coverN = 0, dead = 0, ddead = 0, abroad = 0, prod = [0, 0, 0, 0], cons = [0, 0, 0, 0], atCap = 0;
    agents.forEach(function (i) { var s = S[i]; if (!s || !s.st) return;
      series[i].pop.push(r3(s.pop)); series[i].fam.push(r3(s.famine || 0));
      tp += s.pop; if ((s.famine || 0) > 0.05) fam++; if ((s.famine || 0) > 0.2) fam2++; if ((s.ration || 0) > 0.05) rat++;
      if (s.cover != null && isFinite(s.cover)) { coverSum += Math.min(s.cover, 999); coverN++; }
      dead += s.warDead || 0; ddead += s.disasterDead || 0; if (s.refugees) s.refugees.forEach(function (rr) { abroad += rr[1]; });
      if (s.deaths >= cfg.deathMax - 1e-9) atCap++;
      var mb = 1, bk = 0; if (s.balance) for (var k = 0; k < 4; k++) { if (s.balance[k] < mb) { mb = s.balance[k]; bk = k; } }
      var a = acc[i]; a.legit += s.legit != null ? s.legit : 60; a.misfit += G.misfit(s); a.tech += s.st.technology; a.access += s.access || 0; a.minBal += mb; a.bind[bk]++; a.n++;
      if (s.production) for (var k2 = 0; k2 < 4; k2++) { prod[k2] += s.production[k2]; cons[k2] += s.consumption[k2]; } });
    world.push({ d: W.day, pop: Math.round(tp), bal: prod.map(function (p, k) { return r3(p / Math.max(1e-9, cons[k])); }), famine: fam, famine20: fam2, rationing: rat,
                 cover: coverN ? Math.round(coverSum / coverN) : null, atDeathCap: atCap, warDead: r2(dead), disasterDead: r2(ddead), abroad: r2(abroad),
                 price: W.WORLD_STATE.market ? W.WORLD_STATE.market.price.map(r2) : null, legit: r1(agents.reduce(function (t, i) { return t + (S[i].legit || 0); }, 0) / Math.max(1, agents.length)) });
    for (var wi in watch) { var s2 = S[wi]; if (!s2 || !s2.st) continue; var w = watch[wi];
      w.pop.push(r2(s2.pop)); w.births.push(r1(1e5 * (s2.births || 0))); w.deaths.push(r1(1e5 * (s2.deaths || 0))); w.cover.push(s2.cover == null ? null : Math.min(999, Math.round(s2.cover)));
      w.minBal.push(r3(Math.min.apply(null, s2.balance || [1]))); w.output.push(r1(s2.output)); w.legit.push(Math.round(s2.legit || 0)); w.ration.push(r3(s2.ration || 0)); w.pop0.push(r2(s2.pop0 || 0)); w.famine.push(r3(s2.famine || 0)); }
  }
  var summary = {};
  agents.forEach(function (i) { var raw = series[i].pop; if (raw.length < 4) return; var p = smooth(raw, 3), f = series[i].fam, s = S[i], a = acc[i];
    var mx = Math.max.apply(null, p), mn = Math.min.apply(null, p);
    var turns = turningPoints(p, 0.03), peaks = turns.filter(function (t) { return t.kind === "peak"; }).map(function (t) { return t.i; }), troughs = turns.filter(function (t) { return t.kind === "trough"; }).map(function (t) { return t.i; });
    var gaps = []; for (var q = 1; q < peaks.length; q++) gaps.push((peaks[q] - peaks[q - 1]) * STEP / 30);
    var wc = windowChange(p, 12), bind = a.bind.indexOf(Math.max.apply(null, a.bind));
    summary[i] = { start: r2(raw[0]), end: r2(raw[raw.length - 1]), max: r2(mx), maxAt: p.indexOf(mx), min: r2(mn), minAt: p.indexOf(mn),
                   peaks: peaks.length, troughs: troughs.length, period: gaps.length ? r1(median(gaps)) : null, drawdown: r3(maxDrawdown(p)),
                   maxGrowth12: r3(wc.up), maxDecline12: r3(wc.down), lastYear: r3(p[p.length - 1] / Math.max(1e-9, p[Math.max(0, p.length - 13)]) - 1),
                   monthsFamine: f.filter(function (x) { return x > 0.02; }).length, monthsRation: watch[i] ? watch[i].ration.filter(function (x) { return x > 0.05; }).length : null,
                   legit: r1(a.legit / a.n), misfit: r1(a.misfit / a.n), tech: r1(a.tech / a.n), access: r3(a.access / a.n), minBal: r3(a.minBal / a.n), bind: ["energy", "materials", "food", "water"][bind],
                   region: start[i].region, cap: start[i].cap, foodPerHead: start[i].foodPerHead, warDead: r2(s.warDead || 0), disasterDead: r2(s.disasterDead || 0) };
  });
  var compact = {}; agents.forEach(function (i) { compact[i] = series[i].pop; });
  out[seed] = { years: YEARS, step: STEP, freezeOutput: FREEZE, agents: agents.length, world: world, summary: summary, watch: watch, series: compact };
});
return out;
