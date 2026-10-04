// War-rate sweep: three seeds x two years at one setting of the war levers,
// reporting wars a year, repeats, the greed share and who was occupied.
// Set the levers in the two lines below (or leave them at the config's
// defaults) and run with
//   python tools/smoke.py --eval-file tools/probes/warsweep.js --hold 500000 --timeout 560
var W = window.WORLD, D = window.DECIDE, S = W.COUNTRY_STATE, cfg = window.ENTITY_CONFIG;
var DC = cfg.warStab, SP = cfg.valueOfSpite;                    // e.g. DC = 8; SP = 0.5;  (warDayCost retired: unrest is the lever now)
var out = {}, origAct = D.act, wars = [];
D.act = function (iso, rng) {
  var res = origAct(iso, rng);
  if (res && res.action === "war" && W.warBetween(iso, res.target)) wars.push({ att: iso, def: res.target, why: res.reasons[0], d: W.WORLD_STATE.day });
  return res;
};
cfg.warStab = DC; cfg.valueOfSpite = SP;
[12345, 777, 4242].forEach(function (seed) {
  wars = [];
  W.newWorld(seed);
  var perYear = [], seqYear = [];
  for (var y = 0; y < 2; y++) {
    var n0 = wars.length, s0 = W.WORLD_STATE.warSeq | 0;
    W.advanceDays(365);
    perYear.push(wars.length - n0); seqYear.push((W.WORLD_STATE.warSeq | 0) - s0);
  }
  var pairs = {}, repeats = 0, greed = 0, atts = {}, occ = 0;
  wars.forEach(function (w) { var k = w.att < w.def ? w.att + "|" + w.def : w.def + "|" + w.att; if (pairs[k]) repeats++; pairs[k] = 1; if (w.why.indexOf("enmity") < 0) greed++; atts[w.att] = (atts[w.att] || 0) + 1; });
  for (var iso in S) if (S[iso].occupiedBy) occ++;
  out["th" + TH + " sp" + SP + " seed" + seed] = { decided: perYear, all: seqYear, repeats: repeats, greed: greed, total: wars.length, attackers: Object.keys(atts).length, occupiedNow: occ,
    sample: wars.slice(0, 10).map(function (w) { return "d" + w.d + " " + w.att + ">" + w.def + ": " + w.why; }) };
});
D.act = origAct;
return out;
