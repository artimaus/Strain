// Defaults probe: the curated rows against the map and against each other.  Coverage (every map code has a
// row, every agent has people, scenery is under the line), outliers per region and column, rule flags,
// the population picture (smallest agents, capacity), and the endowment picture (who is short before trade,
// the day-1 world balance).  Run with
//   python tools/smoke.py --eval-file tools/probes/defaults.js --hold 200000 --timeout 240
var W = window.WORLD, S = W.COUNTRY_STATE, DT = window.DATA, CO = window.COUNTRIES, G = window.GOV, cfg = window.ENTITY_CONFIG, E = window.ECONOMY;
var COL = DT.COL, ROWS = DT.ROWS, RES = ["energy", "materials", "food", "water"];
var LEVELS = ["infra", "economy", "military", "academia", "medical", "stability", "technology", "authority", "openness", "energy", "materials", "food", "water", "urban"];
function r2(x) { return Math.round(x * 100) / 100; }
function median(a) { var b = a.slice().sort(function (x, y) { return x - y; }), n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : 0; }
W.newWorld(12345); W.advanceDays(1);
var out = { coverage: [], outliers: [], rules: [], population: [], endowment: [] };
// ── coverage ──
var mapCodes = (W.worldMap ? W.worldMap.countries : []).map(function (k) { return k.iso2; }).filter(function (i) { return i && i !== "—"; });
var noRow = mapCodes.filter(function (i) { return !ROWS[i]; }), noShape = Object.keys(ROWS).filter(function (i) { return mapCodes.length && mapCodes.indexOf(i) < 0; });
var agents = Object.keys(S).filter(function (i) { return S[i].st; });
var scenery = Object.keys(ROWS).filter(function (i) { return !DT.isAgent(i); });
out.coverage.push("map codes " + mapCodes.length + ", rows " + Object.keys(ROWS).length + ", agents " + agents.length + ", scenery " + scenery.length);
if (noRow.length) out.coverage.push("MAP CODES WITH NO ROW: " + noRow.join(" "));
if (noShape.length) out.coverage.push("rows with no shape on the map: " + noShape.join(" "));
out.coverage.push("scenery: " + scenery.map(function (i) { return i + " " + DT.popOf(i); }).join(", "));
var under = agents.filter(function (i) { return S[i].pop < DT.AGENT_MIN_POP; }), over = scenery.filter(function (i) { return DT.popOf(i) >= DT.AGENT_MIN_POP && i !== "XX"; });
if (under.length) out.coverage.push("AGENTS UNDER THE LINE: " + under.join(" "));
if (over.length) out.coverage.push("SCENERY OVER THE LINE: " + over.join(" "));
// ── outliers: per region and column, against the region's median and MAD ──
var byRegion = {};
for (var iso in ROWS) { var reg = ROWS[iso][COL.region]; (byRegion[reg] || (byRegion[reg] = [])).push(iso); }
function colOf(iso, name) { return name === "urban" ? ROWS[iso][COL.urban] : ROWS[iso][COL[name]]; }
for (var reg2 in byRegion) {
  var isos = byRegion[reg2].filter(function (i) { return DT.isAgent(i); });
  LEVELS.forEach(function (name) {
    var vals = isos.map(function (i) { return colOf(i, name); }), med = median(vals);
    var mad = median(vals.map(function (v) { return Math.abs(v - med); })), band = Math.max(2.5 * mad, 15);
    isos.forEach(function (i) { var v = colOf(i, name); if (Math.abs(v - med) > band) out.outliers.push(reg2 + " " + name + ": " + i + " " + v + " (median " + med + ", band " + Math.round(band) + ")"); });
  });
}
// ── rules ──
for (var iso2 in ROWS) {
  var r = ROWS[iso2], f = function (n) { return r[COL[n]]; };
  if (!DT.isAgent(iso2)) continue;
  if (f("economy") > f("infra") + 30) out.rules.push(iso2 + ": economy " + f("economy") + " far above infra " + f("infra"));
  if (f("medical") > f("infra") + 30) out.rules.push(iso2 + ": medical " + f("medical") + " far above infra " + f("infra"));
  if (f("technology") > f("academia") + 25) out.rules.push(iso2 + ": technology " + f("technology") + " far above academia " + f("academia"));
  if (f("military") >= 90 && f("pop") < 1) out.rules.push(iso2 + ": military " + f("military") + " with " + f("pop") + " M people");
  if (f("type") === "elected" && f("freedom") < 10) out.rules.push(iso2 + ": elected at freedom " + f("freedom") + " (a sham)");   // managed democracies sit between 10 and 35
  if ((f("type") === "party" || f("type") === "military") && f("freedom") > 45) out.rules.push(iso2 + ": " + f("type") + " at freedom " + f("freedom"));
  if (!CO.ZONE[f("zone")]) out.rules.push(iso2 + ": zone " + f("zone") + " is not in the catalogue");
  if (G.TYPES.indexOf(f("type")) < 0) out.rules.push(iso2 + ": type " + f("type") + " is not in the catalogue");
}
// ── population ──
var zeros = Object.keys(ROWS).filter(function (i) { return !(ROWS[i][COL.pop] > 0); });
out.population.push("rows at population 0: " + (zeros.join(" ") || "none"));
var smallest = agents.slice().sort(function (a, b) { return S[a].pop - S[b].pop; }).slice(0, 20);
out.population.push("20 smallest agents: " + smallest.map(function (i) { return i + " " + r2(S[i].pop); }).join(", "));
var overCap = [], nearCap = [], fallbackArea = [];
agents.forEach(function (i) { var s = S[i], cap = W.popCap(i); if (s.pop > cap) overCap.push(i + " " + r2(s.pop) + ">" + r2(cap)); else if (s.pop > 0.5 * cap) nearCap.push(i + " " + r2(s.pop) + "/" + r2(cap)); if (!s.area) fallbackArea.push(i); });
out.population.push("over capacity: " + (overCap.join(", ") || "none"));
out.population.push("above half capacity: " + (nearCap.join(", ") || "none"));
out.population.push("on the area fallback (no shape, no MICRO_AREA): " + (fallbackArea.join(" ") || "none"));
var totalPop = 0; agents.forEach(function (i) { totalPop += S[i].pop; });
out.population.push("world population " + Math.round(totalPop) + " M over " + agents.length + " agents");
// ── endowment ──
var prod = [0, 0, 0, 0], cons = [0, 0, 0, 0], wmean = [0, 0, 0, 0], wsum = 0, shortN = [0, 0, 0, 0], shortNeed = [0, 0, 0, 0], need = [0, 0, 0, 0];
var regMean = {}, regPop = {};
agents.forEach(function (i) { var s = S[i]; if (!s.production) return;
  wsum += s.pop; var reg3 = DT.regionOf(i); regMean[reg3] = regMean[reg3] || [0, 0, 0, 0]; regPop[reg3] = (regPop[reg3] || 0) + s.pop;
  for (var k = 0; k < 4; k++) { prod[k] += s.production[k]; cons[k] += s.consumption[k]; wmean[k] += s.res[k] * s.pop; regMean[reg3][k] += s.res[k] * s.pop; need[k] += s.consumption[k];
    if (s.production[k] < s.consumption[k]) { shortN[k]++; shortNeed[k] += s.consumption[k]; } } });
out.endowment.push("day-1 world balance: " + RES.map(function (n, k) { return n + " " + r2(prod[k] / Math.max(1e-9, cons[k])); }).join(", ") + " (targets " + cfg.energyBalance0 + " energy / " + cfg.materialsBalance0 + " materials / " + cfg.worldBalance0 + " food and water)");
out.endowment.push("population-weighted mean endowment: " + RES.map(function (n, k) { return n + " " + r2(wmean[k] / Math.max(1e-9, wsum)); }).join(", "));
out.endowment.push("short before trade (count, share of world need): " + RES.map(function (n, k) { return n + " " + shortN[k] + " / " + Math.round(100 * shortNeed[k] / Math.max(1e-9, need[k])) + "%"; }).join(", "));
for (var reg4 in regMean) out.endowment.push("  " + reg4 + ": " + RES.map(function (n, k) { return n + " " + r2(regMean[reg4][k] / Math.max(1e-9, regPop[reg4])); }).join(", "));
for (var k2 = 0; k2 < 4; k2++) {
  var top = agents.slice().sort(function (a, b) { return (S[b].potential ? S[b].potential[k2] : 0) - (S[a].potential ? S[a].potential[k2] : 0); }).slice(0, 10);
  out.endowment.push("top " + RES[k2] + " potential: " + top.map(function (i) { return i + " " + Math.round(S[i].potential[k2]); }).join(", "));
}
return out;
