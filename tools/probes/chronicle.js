// Chronicle probe: one seed over several years, keeping every notable log entry (wars, treaties, occupations, regime
// changes, cartels, disasters, discoveries, crashes) and a quarterly snapshot of every agent, so that a run can be
// told as a story.  Read with tools/chronicle.py.  Run with
//   python tools/smoke.py --eval-file tools/probes/chronicle.js --hold 900000 --timeout 1000
var W = window.WORLD, S = W.COUNTRY_STATE, E = window.ECONOMY, G = window.GOV, D = window.DECIDE, cfg = window.ENTITY_CONFIG;
var SEED = (typeof r !== "undefined" && r.seed) || 12345, YEARS = (typeof r !== "undefined" && r.years) || 10;
var KEEP = /^(war|victory|peace|stalemate|front|offer|uprising|release|coup|revolution|election|succession|collapse|cartel|economic|discovery|refugees|aid|sanction|pact)$/;
var events = [], counts = {};
function r1(x) { return Math.round(x * 10) / 10; }
function r2(x) { return Math.round(x * 100) / 100; }
W.newWorld(SEED);
W.WORLD_STATE.log.push = function (e) {
  var key = e.kind + (e.key ? ":" + e.key : ""); counts[key] = (counts[key] || 0) + 1;
  if (KEEP.test(e.kind) && (e.sev === "large" || e.sev === "massive" || e.kind === "victory" || e.kind === "front" || e.kind === "cartel" || e.kind === "election")) events.push([e.d, e.kind + (e.key ? ":" + e.key : ""), e.iso || "", e.iso2 || "", String(e.text || "").slice(0, 160)]);
  else if (e.kind === "disaster" && e.sev !== "small") events.push([e.d, "disaster:" + (e.key || ""), e.iso || "", "", String(e.text || "").slice(0, 160)]);
  return Array.prototype.push.call(this, e);
};
var agents = Object.keys(S).filter(function (i) { return S[i].st && S[i].pop >= 1; });
var snaps = [], quarters = YEARS * 4;
function snapshot() {
  var M = W.WORLD_STATE.market, row = { d: W.day, price: M ? M.price.map(r2) : null, states: {} };
  agents.forEach(function (i) { var s = S[i]; if (!s || !s.st) return;
    var mb = s.balance ? Math.min.apply(null, s.balance) : 1;
    row.states[i] = [r1(s.output), r2(s.pop), Math.round(s.st.stability), Math.round(s.legit || 0), Math.round(s.treasury), r2(mb), G.labelOf(s), W.fighting(i) ? 1 : 0, s.occupiedBy || "", Math.round(s.st.technology), Math.round(s.st.military), r2(s.ration || 0), r2(s.famine || 0)]; });
  snaps.push(row);
}
W.advanceDays(1); snapshot();
for (var q = 0; q < quarters; q++) { W.advanceDays(q % 4 === 3 ? 92 : 91); snapshot(); }
return { seed: SEED, years: YEARS, fields: ["output", "pop", "stability", "legit", "treasury", "minBal", "label", "fighting", "occupiedBy", "technology", "military", "ration", "famine"],
         agents: agents.length, events: events, counts: counts, snaps: snaps };
