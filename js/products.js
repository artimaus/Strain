/* ═══════════════════════════════════════════════════════════════
   Entity — products: military and health as levels
   The third pillar (docs/design.md §5.7, docs/nations.md §3).  A nation
   turns money and materials into two end products, each one level per
   head: the military and the health system.  A level carries two
   running averages, the technology and the population it was built at,
   updated by each rise; its upkeep per resource scales with population
   and infrastructure and is cut by technology; it decays by named
   causes (upkeep unpaid, the people outgrowing the pool it was built
   for, the technology outrunning the one built in); and when used, its
   effect is the level at its embodied values, not the nation's current
   ones.  Health lowers deaths and raises births today; the military
   waits for war.  Runs after the economy's day, which sets aside the
   money for each product by its budget share.
   ═══════════════════════════════════════════════════════════════ */
(() => {
"use strict";
const W = window.WORLD, E = window.ECONOMY, D = window.DATA;
const cfg = () => window.ENTITY_CONFIG || LEVERS;

/* ── Levers: the config panel's Products group ── */
const LEVERS = {
  milCostMoney: 20, milCostMaterials: 0.5,             // per point per million people at level 0
  heaCostMoney: 20, heaCostMaterials: 0.3,
  productSlow: 50,                                     // the level that doubles the price of a point
  milUpkeepMaterials: 0.0003,                          // per point, per million people (plus the infrastructure term), a day
  milUpkeepEnergy: 0.0003, milUpkeepFood: 0.0005,      // the same, drawn only in wartime
  heaUpkeepEnergy: 0.0003, heaUpkeepMaterials: 0.0002,
  decayUnpaid: 0.002, decayDilute: 0.0015, decayObsolete: 0.003,   // share of the level lost a day per unit of each cause
  healthDeaths: 0.6, healthBirths: 0.5,                // what full health does to deaths (down) and births (up)
};
const ROWS = [
  ["milCostMoney", "military · money per point per M", "money"], ["milCostMaterials", "military · materials per point per M", "units"],
  ["heaCostMoney", "health · money per point per M", "money"], ["heaCostMaterials", "health · materials per point per M", "units"],
  ["productSlow", "level that doubles a point's price", "pts"],
  ["milUpkeepMaterials", "military upkeep · materials per point per M", "units/day"],
  ["milUpkeepEnergy", "military upkeep · energy, in war", "units/day"], ["milUpkeepFood", "military upkeep · food, in war", "units/day"],
  ["heaUpkeepEnergy", "health upkeep · energy per point per M", "units/day"], ["heaUpkeepMaterials", "health upkeep · materials per point per M", "units/day"],
  ["decayUnpaid", "decay per unit of upkeep unpaid", "/day"], ["decayDilute", "decay per unit of population gap", "/day"], ["decayObsolete", "decay per unit of technology gap", "/day"],
  ["healthDeaths", "full health cuts deaths by", "share"], ["healthBirths", "full health raises births by", "share"],
];
const K = {
  upkeepInfraWeight: 2,          // a unit of infrastructure counts as this many million people in an upkeep
  techUpkeep: 0.5,               // technology cuts a product's upkeep by up to this share, at level 100
  techEffect: 1,                 // the technology multiplier on an effect: 1 + techEffect × embodied / 100
  seedNoise: 0.05,
  behindLine: 15, strainedLine: 0.85,   // wire: the technology gap that counts as behind; the pool share that counts as strained
};
const PRODUCTS = [
  { key: "mil", label: "military", row: r => r.st.military, cost: ["milCostMoney", "milCostMaterials"],
    upkeep: s => [s.atWar ? "milUpkeepFood" : null, s.atWar ? "milUpkeepEnergy" : null, "milUpkeepMaterials"], budget: "military" },
  { key: "hea", label: "health", row: r => r.st.medical, cost: ["heaCostMoney", "heaCostMaterials"],
    upkeep: s => [null, "heaUpkeepEnergy", "heaUpkeepMaterials"], budget: "health" },
];
const RES = ["food", "energy", "materials"];
const FIELDS = [["mil", "mil", 0], ["milT", "mlt", 0], ["milP", "mlp", 0], ["hea", "hea", 0], ["heaT", "het", 0], ["heaP", "hep", 0], ["atWar", "war", false]];
const f = (v, d) => (+v || 0).toFixed(d == null ? 1 : d);
const tdown = s => 1 - K.techUpkeep * Math.min(s.tech, 100) / 100;

function seed(iso, s, rng) {
  const r = D.rowOf(iso), noise = () => 1 + (rng() * 2 - 1) * K.seedNoise;
  for (const p of PRODUCTS) {
    s[p.key] = Math.max(0, (p.row(r) || 0) * noise());
    s[p.key + "T"] = s.tech || r.st.technology || 0;             // built at the technology and for the people it starts with
    s[p.key + "P"] = s.pop || r.pop;
  }
  s.atWar = false;
}

/* What the products draw a day, per resource, for the economy's reserve calibration; and the materials a unit of
   budget money turns into when the products are built, so the world's ceilings count them. */
function upkeepOf(s) {
  const c = cfg(), scale = s.pop + K.upkeepInfraWeight * s.infra, out = [0, 0, 0];
  for (const p of PRODUCTS) { const need = p.upkeep(s); for (let r = 0; r < 3; r++) if (need[r]) out[r] += (s[p.key] || 0) * c[need[r]] * scale * tdown(s); }
  return out;
}
function buildMaterialsPerMoney(s) {
  const c = cfg(), E = window.ECONOMY; let t = 0;
  for (const p of PRODUCTS) t += (E ? E.K.shares0[p.budget] : 0.1) * c[p.cost[1]] / Math.max(c[p.cost[0]], 1e-6);
  return t;
}
/* The effect of a level when used: at its embodied technology and for the pool it was built for. */
function effectOf(s, key) {
  const L = s[key] || 0, embT = s[key + "T"] || 0, embP = s[key + "P"] || s.pop;
  return L / 100 * (1 + K.techEffect * Math.min(embT, 100) / 100) * Math.min(1, embP / Math.max(s.pop, 1e-6));
}

function daily(iso, rng, L) {
  const s = W.COUNTRY_STATE[iso]; if (!s || !s.shares || s.mil == null) return;
  const c = cfg(), add = (key, label, v, unit, reason) => L.add("products", "products." + key, label, v, unit, reason);
  const scale = s.pop + K.upkeepInfraWeight * s.infra;          // what an upkeep scales with
  const askFor = [0, 0, 0];                                       // what the products wanted and did not get today: the trade pillar asks for it
  // when a resource is short the products share it pro rata, so the first in line does not take it all
  const wants = PRODUCTS.map(p => { const need = p.upkeep(s); return need.map(lv => lv ? (s[p.key] || 0) * c[lv] * scale * tdown(s) : 0); });
  const shareOf = [0, 1, 2].map(r => { const tot = wants.reduce((t, w) => t + w[r], 0); return tot > 0 ? Math.min(1, s.stores[r] / tot) : 1; });
  // 1. upkeep and decay for every product first, so nothing is built with the materials an upkeep needed
  for (const p of PRODUCTS) {
    const k = p.key;
    // upkeep per resource, from the stores; the unpaid share of each is a decay cause
    const need = p.upkeep(s), paid = [1, 1, 1];
    for (let r = 0; r < 3; r++) {
      const lever = need[r]; if (!lever) continue;
      const want = s[k] * c[lever] * scale * tdown(s);
      if (!(want > 0)) continue;
      const got = Math.min(want * shareOf[r], s.stores[r]); s.stores[r] -= got; paid[r] = got / want; askFor[r] += want - got;
      add(k + ".upkeep." + RES[r], p.label + " upkeep in " + RES[r], got, "units", paid[r] < 0.999 ? Math.round((1 - paid[r]) * 100) + "% unpaid" : "");
    }
    // decay by named cause
    let decay = 0;
    for (let r = 0; r < 3; r++) if (paid[r] < 0.999) { const d = s[k] * c.decayUnpaid * (1 - paid[r]); decay += d; add(k + ".decay." + RES[r], p.label + " decayed", d, "pts", RES[r] + " unpaid"); }
    const popGap = Math.max(0, s.pop - s[k + "P"]) / Math.max(s[k + "P"], 1e-6);
    if (popGap > 0) { const d = s[k] * c.decayDilute * popGap; decay += d; add(k + ".decay.dilute", p.label + " decayed", d, "pts", "the people outgrow the pool it was built for"); }
    const techGap = Math.max(0, s.tech - s[k + "T"]) / 100;
    if (techGap > 0) { const d = s[k] * c.decayObsolete * techGap; decay += d; add(k + ".decay.obsolete", p.label + " decayed", d, "pts", "behind the nation's technology"); }
    s[k] = Math.max(0, s[k] - decay);
    // the wire: a product falling behind, a health system stretched
    const behind = s.tech - s[k + "T"] > K.behindLine, name = W.nameOf(iso);
    if (behind && !s["_behind_" + k]) W.log({ sev: "small", kind: "products", iso, text: name + ": its " + p.label + " has fallen behind its technology" });
    s["_behind_" + k] = behind;
  }
  // 2. then build with the money the budget set aside and whatever materials are left
  for (const p of PRODUCTS) {
    const k = p.key, lvl = s[k];
    // 3. build with the money the budget set aside, and materials from the store; the price per point rises with the level
    const money = s["_budget_" + k] || 0;
    const perPoint = [c[p.cost[0]] * s.pop * (1 + lvl / c.productSlow), c[p.cost[1]] * s.pop * (1 + lvl / c.productSlow)];
    let rise = Math.min(money / perPoint[0], perPoint[1] > 0 ? s.stores[2] / perPoint[1] : Infinity);
    if (!(rise > 0)) rise = 0;
    const spentMoney = rise * perPoint[0], spentMat = rise * perPoint[1];
    s.treasury += money - spentMoney;                             // what the materials did not allow goes back
    s.stores[2] -= spentMat;
    if (perPoint[0] > 0 && perPoint[1] > 0) askFor[2] += Math.max(0, money / perPoint[0] - rise) * perPoint[1];   // the materials the money could have bought points with
    s["_budget_" + k] = 0;
    if (rise > 0) {
      s[k + "T"] = (s[k + "T"] * lvl + s.tech * rise) / (lvl + rise);
      s[k + "P"] = (s[k + "P"] * lvl + s.pop * rise) / (lvl + rise);
      s[k] = lvl + rise;
      add(k + ".built", p.label + " built", rise, "pts", f(spentMoney, 0) + " money, " + f(spentMat, 1) + " materials");
    } else if (money > 0) add(k + ".unbuilt", p.label + " not built", 0, "pts", "no materials for it");
    add(k + ".level", p.label, s[k], "pts");
    add(k + ".effect", p.label + " in use", effectOf(s, k), "×", "at technology " + f(s[k + "T"], 0) + ", built for " + f(s[k + "P"], 0) + " M");
  }
  s._prodAsk = askFor;
  // 4. what health does for the people tomorrow (the economy's people step reads these)
  const h = effectOf(s, "hea");
  s._deathMul = 1 - c.healthDeaths * Math.min(1, h);
  s._birthMul = 1 + c.healthBirths * Math.min(1, h);
  const strained = s.heaP / Math.max(s.pop, 1e-6) < K.strainedLine;
  if (strained && !s._strained) W.log({ sev: s.pop >= 50 ? "large" : "small", kind: "products", iso, text: W.nameOf(iso) + ": its hospitals were built for " + f(s.heaP, 0) + " M and serve " + f(s.pop, 0) + " M" });
  s._strained = strained;
  add("deathMul", "deaths ×", s._deathMul, "×", "health"); add("birthMul", "births ×", s._birthMul, "×", "health");
}

/* ── The card ── */
function rows(iso, L) {
  const s = W.COUNTRY_STATE[iso]; if (!s || s.mil == null) return [];
  const out = [], g = k => L.get("products." + k);
  for (const p of PRODUCTS) {
    const k = p.key, decay = ["food", "energy", "materials", "dilute", "obsolete"].reduce((t, c) => t + g(k + ".decay." + c), 0);
    out.push([p.label, f(s[k]) + " · at technology " + f(s[k + "T"], 0) + " · built for " + f(s[k + "P"], 0) + " M",
      (g(k + ".built") ? "+" + f(g(k + ".built"), 3) : "") + (decay ? " −" + f(decay, 3) : "") + (g(k + ".built") || decay ? " today" : "")]);
    const causes = L.of("products").filter(l => l.key.startsWith("products." + k + ".decay.")).map(l => l.reason).filter(Boolean);
    if (causes.length) out.push(["", "decay: " + causes.join(" · ")]);
    const unpaid = L.of("products").filter(l => l.key.startsWith("products." + k + ".upkeep.") && l.reason).map(l => l.key.split(".").pop() + " " + l.reason);
    if (unpaid.length) out.push(["", "upkeep: " + unpaid.join(" · ")]);
  }
  if (s._deathMul != null) out.push(["health does", "deaths ×" + f(s._deathMul, 2) + " · births ×" + f(s._birthMul, 2), "at its embodied technology and pool"]);
  return out;
}

const layers = [
  { key: "military", label: "Mil", lo: "#33221f", hi: "#ff7a50", legend: ["0", "100"], value: st => Math.min(1, (st.mil || 0) / 100), show: st => f(st.mil) },
  { key: "health", label: "Health", lo: "#1f3026", hi: "#7fe0a0", legend: ["0", "100"], value: st => Math.min(1, (st.hea || 0) / 100), show: st => f(st.hea) },
];
function census(iso, s) {
  return { mil: Math.round((s.mil || 0) * 10) / 10, hea: Math.round((s.hea || 0) * 10) / 10,
           milBehind: Math.round(s.tech - (s.milT || 0)), heaFit: Math.round(100 * Math.min(1, (s.heaP || s.pop) / Math.max(s.pop, 1e-6))) };
}
function censusWorld() {
  let n = 0, mil = 0, hea = 0, pop = 0;
  for (const iso in W.COUNTRY_STATE) { const s = W.COUNTRY_STATE[iso]; if (s.mil == null) continue; n++; pop += s.pop; mil += (s.mil || 0) * s.pop; hea += (s.hea || 0) * s.pop; }
  return { milMean: Math.round(10 * mil / Math.max(pop, 1e-6)) / 10, heaMean: Math.round(10 * hea / Math.max(pop, 1e-6)) / 10 };
}

window.PRODUCTS = W.registerPillar({
  name: "products", label: "Products", fields: FIELDS, seed, daily, rows, census, censusWorld, layers,
  config: { group: "Products", defaults: LEVERS, rows: ROWS },
  K, LEVERS, PRODUCTS, effectOf, upkeepOf, buildMaterialsPerMoney,
});
})();
