// Census probe: several seeds x three years of the world sim, reporting the stage 3
// economy census (balances, prices, population, famine, debt, a watch list) together
// with wars, diplomacy, the market, governments, events and an end-state vector per
// country, so that runs can be compared across seeds and across stages.  Run with
//   python tools/smoke.py --eval-file tools/probes/census.js --hold 500000 --timeout 560
// and read the result with  python tools/census.py <json...>
var W = window.WORLD, S = W.COUNTRY_STATE, E = window.ECONOMY, EV = window.EVENTS, D = window.DECIDE, G = window.GOV, cfg = window.ENTITY_CONFIG;
var KEYS = window.COUNTRIES.STAT_KEYS, out = {};
var WATCH = ["JP", "KR", "SG", "CH", "IL", "SA", "AE", "EG", "US", "DE", "IN", "NG", "ET", "BD"];
var LABELS = ["Fractured state", "Republic", "Liberal democracy", "One-party state", "Managed democracy", "Social democracy", "Military junta", "Autocracy", "Guided technocracy"];
function r2(x) { return Math.round(x * 100) / 100; }
function dist(arr) {
  if (!arr.length) return null;
  var n = arr.length, m = 0, v = 0, lo = Infinity, hi = -Infinity;
  arr.forEach(function (x) { m += x; if (x < lo) lo = x; if (x > hi) hi = x; }); m /= n;
  arr.forEach(function (x) { v += (x - m) * (x - m); });
  return { mean: r2(m), sd: r2(Math.sqrt(v / n)), min: r2(lo), max: r2(hi), n: n };
}
function gini(vals) {
  var a = vals.slice().sort(function (x, y) { return x - y; }), n = a.length, sum = 0, cum = 0;
  a.forEach(function (x) { sum += x; }); if (!sum) return 0;
  a.forEach(function (x, i) { cum += (i + 1) * x; });
  return r2(2 * cum / (n * sum) - (n + 1) / n);
}
function live() { var l = []; for (var iso in S) if (S[iso].st && S[iso].production && S[iso].pop >= 1) l.push(iso); return l; }
function worldSnap() {
  var prod = [0, 0, 0, 0], cons = [0, 0, 0, 0], pop = 0, famine = 0, broke = 0, n = 0, projects = 0, debt = 0, atCap = 0, occupied = 0, atWar = 0, low = 0, bought = 0, short95 = 0, rationing = 0; var busted = 0, boomSum = 0;
  var by = {}, gdp = [], labels = {}, types = {}, treas = 0;
  KEYS.forEach(function (k) { by[k] = []; }); by.output = []; by.eco = []; by.authority = []; by.econOpen = []; by.minBal = []; by.force = []; by.freedom = []; by.legit = [];
  for (var iso in S) { var s = S[iso]; if (!s.st || !s.production) continue; n++;
    for (var k = 0; k < 4; k++) { prod[k] += s.production[k]; cons[k] += s.consumption[k]; }
    pop += s.pop; if ((s.famine || 0) > 0.2) famine++; if (s.broke) broke++; projects += (s.projects || []).length;
    if (s.treasury < 0) debt++; if (s.treasury >= E.capOf(s) - 1) atCap++; treas += s.treasury;
    if (s.occupiedBy) occupied++; if (W.fighting(iso)) atWar++; if (s.st.stability < 30) low++;
    if (s.balance && Math.min(s.balance[2], s.balance[3]) < 0.95) short95++; if ((s.ration || 0) > 0.05) rationing++;
    if (s.bought && s.bought.some(function (b) { return b > 0; })) bought++;
    if (s.pop < 1) continue;
    KEYS.forEach(function (k) { by[k].push(s.st[k]); });
    by.output.push(s.output); by.eco.push(W.ecoIndexOf(iso)); by.authority.push(s.authority); by.econOpen.push(s.econOpen); by.force.push(W.force(iso));
    by.freedom.push(s.freedom != null ? s.freedom : s.econOpen); by.legit.push(s.legit != null ? s.legit : 0);
    by.minBal.push(Math.min.apply(null, s.balance)); gdp.push(s.output * s.pop);
    if (W.WORLD_STATE.day < (s.bustUntil || 0)) busted++; boomSum += s.boom || 0;
    var lb = G.labelOf(s); labels[lb] = (labels[lb] || 0) + 1;
    var ty = G.typeOf(s); types[ty] = (types[ty] || 0) + 1;
  }
  var M = W.WORLD_STATE.market, pc = W.pairCounts(), deals = 0, sanc = 0, pacts = 0;
  for (var i2 in pc) { deals += pc[i2].trade; sanc += pc[i2].sanctions; pacts += pc[i2].pacts; }
  var records = 0, dPairs = 0, swaps = 0, moneyLegs = 0, techLegs = 0, shortDeals = 0, floorDeals = 0, needDeals = 0;
  for (var pk in W.PAIRS) {
    var pp = W.PAIRS[pk];
    if (!pp.deals || !pp.deals.length) continue;
    dPairs++; records += pp.deals.length;
    pp.deals.forEach(function (d) { if (d.fk != null && d.fk >= 0) { floorDeals++; return; } if (d.g >= 0 && d.t >= 0) swaps++; if (d.mq) moneyLegs++; if (d.prem > 0) needDeals++; if (d.tech) techLegs++; if (d.short) shortDeals++; });
  }
  var flowIn = 0, capUse = [], accs = [], traders = 0, dead = 0, dDead = 0, abroad = 0, dark = 0, bills = [], unpaid = 0;
  for (var i3 in S) {
    var s3 = S[i3];
    if (!s3.st || !s3.production) continue;
    dead += s3.warDead || 0; dDead += s3.disasterDead || 0;
    if (s3.techUnpaid > 0.2) dark++; if (s3.unpaid && s3.unpaid.length) unpaid++;
    if (s3.pop >= 1 && s3.bill) { var bsum = 0; for (var bk = 0; bk < 4; bk++) bsum += s3.bill[bk]; bills.push(bsum / Math.max(1, E.taxIncome(s3))); }
    if (s3.refugees) for (var rr = 0; rr < s3.refugees.length; rr++) abroad += s3.refugees[rr][1];
    if (s3.dealIn) { var any = false; for (var k3 = 0; k3 < 4; k3++) { flowIn += s3.dealIn[k3]; if (s3.dealIn[k3] > 0 || s3.dealOut[k3] > 0) any = true; } if (any) traders++; }
    if (s3.pop >= 1) { accs.push(s3.marketAccess == null ? 1 : s3.marketAccess); capUse.push(((pc[i3] || {}).deals || 0) / Math.max(1, W.partnerCapOf(i3))); }
  }
  var rels = W.packPairs().map(function (p) { return p.r || 0; }), hostile = 0, warm = 0;
  rels.forEach(function (x) { if (x <= -30) hostile++; if (x >= 50) warm++; });
  var d = {};
  for (var key in by) d[key] = dist(by[key]);
  return { day: W.WORLD_STATE.day, n: n,
           balance: prod.map(function (p, k) { return r2(p / cons[k]); }),
           price: M ? M.price.map(r2) : null, vol: M ? M.vol.map(Math.round) : null, buys: M ? M.buys.map(Math.round) : null, sells: M ? M.sells.map(Math.round) : null,
           worldStock: M ? M.stock.map(Math.round) : null,
           pop: Math.round(pop), inFamine: famine, broke: broke, inDebt: debt, atCap: atCap, treasury: Math.round(treas), buyers: bought, projects: projects,
           occupied: occupied, atWar: atWar, lowStability: low, short95: short95, rationing: rationing, gdpGini: gini(gdp),
           busted: busted, boom: r2(boomSum / Math.max(1, n)),
           deals: deals / 2, sanctions: sanc, pacts: pacts / 2, pairs: rels.length, rel: dist(rels), hostilePairs: hostile, warmPairs: warm,
           dealRecords: records, dealPairs: dPairs, dealSwaps: swaps, dealMoneyLegs: moneyLegs, dealTechLegs: techLegs, dealsShort: shortDeals,
           dealVolume: Math.round(flowIn), dealTraders: traders, access: dist(accs), partnerUse: dist(capUse), warDead: r2(dead), disasterDead: r2(dDead), refugeesAbroad: r2(abroad),
           floorDeals: floorDeals, needDeals: needDeals, unpaidUpkeep: unpaid, labsDark: dark, bill: dist(bills), rest: M && M.rest ? M.rest.map(r2) : null,
           labels: labels, types: types, stat: d };
}
function snap(iso) { var s = S[iso]; return Math.round(s.output) + "/" + Math.round(s.pop) + "M/b" + Math.round(Math.min.apply(null, s.balance || [1]) * 100) + "/$" + Math.round(s.treasury); }
function endState() {
  var e = {};
  live().forEach(function (iso) { var s = S[iso];
    e[iso] = [r2(s.output), r2(s.pop), Math.round(s.treasury), Math.round(s.st.stability), Math.round(s.st.technology), Math.round(s.st.infra),
              Math.round(s.st.military), Math.round(s.st.medical), Math.round(s.st.academia), Math.round(s.authority), Math.round(s.econOpen),
              r2(Math.min.apply(null, s.balance)), s.occupiedBy ? 1 : 0, LABELS.indexOf(G.labelOf(s)), Math.round(W.force(iso)), r2(s.cap || 0),
              Math.round(s.freedom != null ? s.freedom : s.econOpen), Math.round(s.legit != null ? s.legit : 0), G.TYPES.indexOf(G.typeOf(s)), r2(s.boom || 0)];
  });
  return e;
}
function top(fn, k) { var l = live().map(function (iso) { return [iso, fn(iso)]; }); l.sort(function (a, b) { return b[1] - a[1]; }); return l.slice(0, k).map(function (x) { return x[0]; }); }
var SEEDS = r.seeds || [12345, 777, 4242];
var origAct = D.act, wars = [], kinds = {}, sevs = {}, invests = {};
D.act = function (iso, rng) {
  var res = origAct(iso, rng);
  if (res && res.action === "war" && W.warBetween(iso, res.target)) wars.push({ att: iso, def: res.target, why: res.reasons[0], motive: res.motive || "?", stake: res.stake || 0, d: W.WORLD_STATE.day });
  return res;
};
SEEDS.forEach(function (seed) {
  wars = []; kinds = {}; sevs = {}; invests = {};
  EV.stats.fired = {}; EV.stats.adoptions = 0; EV.stats.massive = 0; EV.stats.large = 0; EV.stats.catastrophic = 0;
  W.newWorld(seed);
  W.WORLD_STATE.log.push = function (e) {
    kinds[e.kind] = (kinds[e.kind] || 0) + 1; sevs[e.sev] = (sevs[e.sev] || 0) + 1;
    if (e.kind === "invest") { var m = /investing in (\w+)/.exec(e.text || ""), k = m ? m[1] : "?"; invests[k] = (invests[k] || 0) + 1; }
    if (e.key === "joins") kinds.join = (kinds.join || 0) + 1;
    if (e.kind === "victory" && e.key) kinds["victory:" + e.key] = (kinds["victory:" + e.key] || 0) + 1;
    if (e.key === "mobilise") kinds.mobilise = (kinds.mobilise || 0) + 1;
    if (e.kind === "power") kinds.power = (kinds.power || 0) + 1;
    if (e.kind === "disaster" && e.key) kinds["disaster:" + e.key] = (kinds["disaster:" + e.key] || 0) + 1;
    if (e.kind === "disaster" && e.sev !== "small") kinds.bigDisaster = (kinds.bigDisaster || 0) + 1;
    if (e.key === "refused") kinds.refused = (kinds.refused || 0) + 1;
    if (e.kind === "economic" && e.key === "bust") kinds.bust = (kinds.bust || 0) + 1;
    if (e.kind === "economic" && e.key === "globalRecession") kinds.crash = (kinds.crash || 0) + 1;
    if (e.kind === "pact" && (e.key === "neutral" || e.key === "left")) kinds[e.key] = (kinds[e.key] || 0) + 1;
    if (e.kind === "succession" && e.key === "crackdown") kinds.crackdown = (kinds.crackdown || 0) + 1;
    if (e.kind === "revolution" && e.key === "liberal") kinds.liberal = (kinds.liberal || 0) + 1;
    if (e.key === "front") kinds.fronts = (kinds.fronts || 0) + 1;
    if ((e.kind === "victory" || e.kind === "front") && /occupies/.test(e.text || "")) kinds.occupation = (kinds.occupation || 0) + 1;
    if (e.kind === "peace" && /indemnity/.test(e.text || "")) kinds.peaceTerms = (kinds.peaceTerms || 0) + 1;
    return Array.prototype.push.call(this, e);
  };
  W.advanceDays(1);
  var res = { years: [worldSnap()], track: {}, warsPerYear: [], allDeclared: [] };
  WATCH.forEach(function (i) { res.track[i] = [snap(i)]; });
  [364, 365, 365].forEach(function (n) {
    var n0 = wars.length, s0 = W.WORLD_STATE.warSeq | 0;
    W.advanceDays(n);
    res.warsPerYear.push(wars.length - n0); res.allDeclared.push((W.WORLD_STATE.warSeq | 0) - s0);
    res.years.push(worldSnap()); WATCH.forEach(function (i) { res.track[i].push(snap(i)); });
  });
  var pairs = {}, repeats = 0, greed = 0, atts = {}, motives = {}, stakes = [];
  wars.forEach(function (w) { var k = w.att < w.def ? w.att + "|" + w.def : w.def + "|" + w.att; if (pairs[k]) repeats++; pairs[k] = 1; if (w.motive !== "enmity") greed++; motives[w.motive] = (motives[w.motive] || 0) + 1; if (w.stake) stakes.push(w.stake); atts[w.att] = (atts[w.att] || 0) + 1; });
  res.wars = { total: wars.length, repeats: repeats, greed: greed, motives: motives, attackers: Object.keys(atts).length,
               stake: stakes.length ? r2(stakes.reduce(function (a, b) { return a + b; }, 0) / stakes.length) : 0,
               list: wars.map(function (w) { return "d" + w.d + " " + w.att + ">" + w.def + ": " + w.why; }) };
  res.logKinds = kinds; res.logSevs = sevs; res.investTargets = invests;
  // the programmes: what the living governments hold, and what they have enacted
  res.powers = (function () { var held = {}, done = {}; for (var pi in S) { var ps = S[pi]; if (!ps.st || !ps.regime) continue;
    (G.powersOf(ps) || []).forEach(function (k) { held[k] = (held[k] || 0) + 1; });
    (ps.regime.done || []).forEach(function (k) { done[k] = (done[k] || 0) + 1; }); }
    return { held: held, done: done, enacted: kinds.power || 0 }; })();
  res.events = { fired: EV.stats.fired, adoptions: EV.stats.adoptions, massive: EV.stats.massive, large: EV.stats.large, catastrophic: EV.stats.catastrophic,
                 footprints: EV.stats.footprints || 0, refugees: r2(EV.stats.refugees || 0), dead: r2(EV.stats.dead || 0) };
  var acts = { monthly: 0, weekly: 0, n: 0 };
  for (var iso in S) if (S[iso].acts) { acts.n++; acts.monthly += S[iso].acts.monthly || 0; acts.weekly += S[iso].acts.weekly || 0; }
  res.cadence = { monthly: r2(acts.monthly / acts.n), weekly: r2(acts.weekly / acts.n) };
  res.reports = kinds.economic || 0;
  res.topGDP = top(function (i) { return S[i].output * S[i].pop; }, 10);
  res.topForce = top(function (i) { return W.force(i); }, 10);
  res.topOutput = top(function (i) { return S[i].output; }, 10);
  res.end = endState();
  out[seed] = res;
});
D.act = origAct;
out._fields = ["output", "pop", "treasury", "stability", "technology", "infra", "military", "medical", "academia", "authority", "openness", "minBal", "occupied", "label", "force", "cap", "freedom", "legit", "type", "boom"];
out._labels = LABELS;
return out;
