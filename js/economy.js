/* ═══════════════════════════════════════════════════════════════
   Entity — economy: a nation's day
   The first pillar (docs/design.md §4, docs/nations.md §1).  A nation
   is people, rainfall, three reserve ceilings, three developments
   (infrastructure captures and houses, the economy makes money,
   academia makes technology), a technology level, a treasury, stores
   and a budget of shares.  Every day, in this order: weather, needs,
   labour (needs first), capture with diminishing returns past the
   ceilings, people eat, upkeep is paid or units stop, money is made,
   the budget is spent by shares and one share moves for a stated
   reason, stores fill, people are born, die and leave.  Nothing drifts:
   every change is a ledger line.
   Registers with the world at load; shell.js takes its levers into the
   config panel; the card, the map and the census read its rows, layers
   and numbers.  Reserve ceilings need the map's areas, so they are
   calibrated once the map has arrived; until then a day is skipped.
   ═══════════════════════════════════════════════════════════════ */
(() => {
"use strict";
const W = window.WORLD, D = window.DATA;
const cfg = () => window.ENTITY_CONFIG || LEVERS;
const RES = ["food", "energy", "materials"];           // the order of every triple below

/* ── Levers (design.md §4.6): the config panel's Economy group ── */
const LEVERS = {
  infraSlots: 3, econSlots: 1, acadSlots: 0.05,          // M workers a unit holds
  storePerUnit: 30, housingPerUnit: 6,                   // units of each resource stored, M people housed, per unit of infrastructure
  capturePerWorker: 6, captureEnergy: 0.2,               // units a day per M workers; energy per unit captured
  moneyPerWorker: 10,                                    // money a day per M economy workers
  econUpkeepEnergy: 0.5, econUpkeepMaterials: 0.4,       // per unit of economy a day
  techUpkeepEnergy: 0.1, techSlow: 25, researchRate: 1,  // energy per point per 100 M people; the level that halves research; research per unit of intensity
  budgetCapPerUnit: 15, shareStep: 0.01,                 // money a day a unit of economy can put to work; a share's daily step
};
const ROWS = [
  ["infraSlots", "infrastructure · workers per unit", "M"], ["econSlots", "economy · workers per unit", "M"], ["acadSlots", "academia · workers per unit", "M"],
  ["storePerUnit", "stores per unit of infrastructure", "units"], ["housingPerUnit", "housing per unit of infrastructure", "M"],
  ["capturePerWorker", "capture per million workers", "units/day"], ["captureEnergy", "energy per unit captured", "units"],
  ["moneyPerWorker", "money per million economy workers", "/day"],
  ["econUpkeepEnergy", "economy upkeep · energy per unit", "units/day"], ["econUpkeepMaterials", "economy upkeep · materials per unit", "units/day"],
  ["techUpkeepEnergy", "technology upkeep · energy per point per 100 M", "units/day"], ["techSlow", "technology level that halves research", "pts"],
  ["researchRate", "research per unit of researcher intensity", "pts/day"],
  ["budgetCapPerUnit", "spending cap per unit of economy", "money/day"], ["shareStep", "budget share step", "/day"],
];
/* ── Fixed constants (design.md §4.6): promoted to levers only with a note there ── */
const K = {
  techCapture: 1, techEnergy: 0.5, techMoney: 1, techUpkeep: 0.5,   // what technology multiplies, at level 100 (clamped there)
  infraCostMoney: 35000, infraCostMaterials: 350, econCostMoney: 26000, researchCost: 20,   // per unit built; money per M researchers a day
  famineDeath: 0.001, birthRate: 0.00006, foodMargin: 0.1,          // deaths per unit of famine; births at full surplus; the surplus aimed at
  unpaidGrace: 30, unpaidDecay: 0.002,                              // days unpaid before decay; share lost a day after that
  rainWidth: 0.5, subsistence: 0.6,                                 // the hump's width; food per M idle people a day
  leaveRate: 0.00005, exploreYield: 0.0001,                         // share of the idle and unhoused who leave a day; ceiling per money explored
  holdDays: 30,                                                     // days of its import bill a nation short at home keeps before building
  shortLine: 0.9,                                                   // below this share of its upkeep paid a nation counts as short: it holds its building and the census flags it
  maxStrain: 3,                                                     // a nation works a reserve up to this many times its ceiling, then buys
  worldSlack: 1.5, areaExp: 0.25,                                   // the world's ceilings over its starting need; how reserves scale with area
  startTreasuryDays: 30, startStoreDays: 15, seedNoise: 0.05,
  seedInfra: [0.4, 0.6, 0.2], seedEcon: [0.2, 0.8, 0.7], seedAcad: [0.1, 0.9, 0.25],   // (floor, slope, units per M at level 100)
  shares0: { infra: 0.25, econ: 0.25, research: 0.15, keep: 0.1, explore: 0.05, military: 0.1, health: 0.1 },
  shareFloor: { infra: 0.1, econ: 0.1, research: 0.05, keep: 0.05, explore: 0.05, military: 0.03, health: 0.05 },
  milFloorSlope: 0.12,                                              // a nation's military floor is 0.03 + this × its row's military level / 100
  baseDeath: 0.00003, deathsLine: 0.00004,                          // deaths a day per person before health; the rate above which the budget turns to health
  techFade: 0.00002, techUpkeepEcon: 0.5, techUpkeepInfra: 0.5,     // technology forgotten a day; what a unit of economy and of infrastructure add to its energy upkeep, as people
};
const ZONE_SWING = { arid: 0.5, desert: 0.5, monsoon: 0.5, tropical: 0.4, mediterranean: 0.35, temperate: 0.25, boreal: 0.25 };
const SHARES = ["infra", "econ", "research", "keep", "explore", "military", "health"];

/* ── State: the rows this pillar adds to the country pack table ── */
const FIELDS = [
  ["pop", "P", 0], ["infra", "inf", 0], ["econ", "eco", 0], ["acad", "aca", 0], ["tech", "tec", 0],
  ["treasury", "tre", 0], ["stores", "sto", [0, 0, 0]], ["ceil", "cei", [0, 0, 0]], ["rain", "rai", 1],
  ["shares", "sha", null], ["unpaidEcon", "ue", 0], ["unpaidTech", "ut", 0], ["rule", "rul", ""], ["reason", "rsn", ""],
  ["milFloor", "mfl", 0.03],
];
const lvl = ([floor, slope, u], level) => (floor + slope * (level || 0) / 100) * u;
const clamp01 = v => Math.max(0, Math.min(1, v));
const tmul = (s, k) => 1 + K[k] * Math.min(s.tech, 100) / 100;
const tdown = (s, k) => 1 - K[k] * Math.min(s.tech, 100) / 100;
function needs(s, c) {
  return { food: s.pop,
           upkE: c.econUpkeepEnergy * s.econ * tdown(s, "techUpkeep"), upkM: c.econUpkeepMaterials * s.econ * tdown(s, "techUpkeep"),
           techE: c.techUpkeepEnergy * s.tech / 100 * (s.pop + K.techUpkeepEcon * s.econ + K.techUpkeepInfra * s.infra) };   // what uses it pays for it; not cut by its own level
}
/* A fresh state from the data row: population, the three developments and technology with a little seeded
   noise, a treasury and stores to start on, the shares at their defaults.  The ceilings wait for the map. */
function seed(iso, s, rng) {
  const r = D.rowOf(iso), c = cfg(), noise = () => 1 + (rng() * 2 - 1) * K.seedNoise;
  s.pop = r.pop;
  s.infra = lvl(K.seedInfra, r.st.infra) * r.pop * noise();
  s.econ = lvl(K.seedEcon, r.economy) * r.pop * noise();
  s.acad = lvl(K.seedAcad, r.st.academia) * r.pop * noise();
  s.tech = Math.max(0, r.st.technology * noise());
  s.rain = 1; s.shares = Object.assign({}, K.shares0); s.unpaidEcon = 0; s.unpaidTech = 0; s.rule = ""; s.reason = "";
  s.milFloor = K.shareFloor.military + K.milFloorSlope * (r.st.military || 0) / 100;   // a stand-in for threat until relations and war
  s.ceil = [0, 0, 0];
  s.treasury = K.startTreasuryDays * c.budgetCapPerUnit * s.econ;
  const N = needs(s, c);
  s.stores = [K.startStoreDays * N.food, K.startStoreDays * (N.upkE + N.techE), K.startStoreDays * N.upkM];
}
/* Reserve ceilings, once the map's areas are known: food by population (people live where food grows), energy and
   materials by area^areaExp, each scaled so the world's ceilings sum to worldSlack times its starting need. */
let calibratedSeed = -1;
function calibrate() {
  const wm = W.worldMap; if (!wm) return false;
  const area = Object.create(null);
  for (const co of wm.countries) area[co.iso2] = co.area || 100;
  const c = cfg(), need = [0, 0, 0], raw = [0, 0, 0], base = Object.create(null);
  for (const iso in W.COUNTRY_STATE) {
    const s = W.COUNTRY_STATE[iso]; if (!s.shares) continue;
    const r = D.rowOf(iso), N = needs(s, c), cE = c.captureEnergy * tdown(s, "techEnergy");
    const prod = window.PRODUCTS ? window.PRODUCTS.upkeepOf(s) : [0, 0, 0];     // the end products' upkeep, once they exist
    const cap = c.budgetCapPerUnit * s.econ, buildM = cap * (K.shares0.infra * K.infraCostMaterials / K.infraCostMoney + (window.PRODUCTS ? window.PRODUCTS.buildMaterialsPerMoney(s) : 0));
    need[0] += N.food * (1 + K.foodMargin) + prod[0];
    need[1] += (N.upkE + N.techE + prod[1] + cE * (N.food + N.upkM + prod[2] + buildM)) / (1 - cE);
    need[2] += (N.upkM + prod[2] + buildM) * 1.3;
    const a = Math.pow(area[iso] || 100, K.areaExp);
    base[iso] = [r.res[2] / 100 * s.pop, r.res[0] / 100 * a, r.res[1] / 100 * a];
    for (let k = 0; k < 3; k++) raw[k] += base[iso][k];
  }
  const scale = raw.map((v, k) => v > 0 ? K.worldSlack * need[k] / v : 0);
  for (const iso in base) {
    const s = W.COUNTRY_STATE[iso];
    if (s.ceil.every(v => v === 0)) s.ceil = base[iso].map((b, k) => b * scale[k]);
  }
  calibratedSeed = W.seed;
  return true;
}

/* ── The formulas ── */
const captured = (effort, R) => (R > 0 && effort > 0) ? R * Math.log1p(effort / R) : 0;     // diminishing past the ceiling
const effortFor = (target, R) => target <= 0 ? 0 : R <= 0 ? 1e12 : R * (Math.exp(Math.min(target / R, 40)) - 1);
const rainFactor = s => Math.exp(-Math.pow((s.rain - 1) / K.rainWidth, 2));
const zoneSwing = iso => ZONE_SWING[D.rowOf(iso).zone] || 0.3;

/* ── The day ── */
function daily(iso, rng, L) {
  const s = W.COUNTRY_STATE[iso]; if (!s || !s.shares) return;
  if (calibratedSeed !== W.seed || s.ceil.every(v => v === 0)) { if (!calibrate()) return; }
  const c = cfg(), add = (key, label, v, unit, reason) => L.add("economy", "economy." + key, label, v, unit, reason);
  // 1. weather: a bounded random walk within the zone's swing, a quarter to cross it
  const sw = zoneSwing(iso);
  s.rain = Math.max(1 - sw, Math.min(1 + sw, s.rain + (rng() * 2 - 1) * sw / 90));
  const wr = rainFactor(s);
  add("rain", "rainfall", s.rain, "× optimum"); add("rainFood", "food factor", wr, "×");
  // 2. needs
  const N = needs(s, c), cpw = c.capturePerWorker * tmul(s, "techCapture"), cE = c.captureEnergy * tdown(s, "techEnergy");
  const cap = c.budgetCapPerUnit * s.econ;
  const buildM = s.shares.infra * Math.min(cap, Math.max(s.treasury, 0)) / K.infraCostMoney * K.infraCostMaterials;
  const slots = { I: c.infraSlots * s.infra, E: c.econSlots * s.econ, A: c.acadSlots * s.acad };
  // 3. labour, needs first: the base food need, energy, materials, then the food margin; the idle feed themselves a little
  let idle = Math.max(0, s.pop - slots.I - slots.E - slots.A), w = null, wI = 0, wE = 0, wA = 0, wX = 0;
  for (let pass = 0; pass < 3; pass++) {
    const foodT = Math.max(0, N.food - K.subsistence * idle), foodAll = Math.max(0, N.food * (1 + K.foodMargin) - K.subsistence * idle);
    const mT = N.upkM + buildM;
    const eT = (N.upkE + N.techE + cE * (foodAll / Math.max(wr, 1e-6) + mT)) / Math.max(0.05, 1 - cE);
    // a nation works a reserve up to maxStrain times its ceiling and leaves the rest of the need to the market
    const effort = (target, R) => Math.min(effortFor(target, R), K.maxStrain * R);
    w = { food: effort(foodT / Math.max(wr, 1e-6), s.ceil[0]) / cpw, energy: effort(eT, s.ceil[1]) / cpw, materials: effort(mT, s.ceil[2]) / cpw };
    w.margin = Math.max(0, effort(foodAll / Math.max(wr, 1e-6), s.ceil[0]) / cpw - w.food);
    wI = Math.min(slots.I, w.food + w.energy + w.materials + w.margin, s.pop);
    let rest = s.pop - wI;
    wX = Math.min(s.exportWorkers || 0, Math.max(0, slots.I - wI), rest); rest -= wX;   // the workers trade moved to export keep their slots
    wE = Math.min(slots.E, rest); rest -= wE;
    wA = Math.min(slots.A, rest); rest -= wA;
    idle = rest;
  }
  add("workInfra", "in infrastructure", wI, "M"); add("workExport", "capturing for export", wX, "M"); add("workEcon", "in the economy", wE, "M"); add("workAcad", "in academia", wA, "M"); add("idle", "idle", idle, "M");
  // 4. capture: the workers go to the base food need, then energy, then materials, then the margin
  let avail = wI; const take = {};
  for (const key of ["food", "energy", "materials", "margin"]) { take[key] = Math.min(w[key], avail); avail -= take[key]; }
  const eff = [(take.food + take.margin) * cpw, take.energy * cpw, take.materials * cpw];
  const got = eff.map((e, k) => captured(e, s.ceil[k]));
  got[0] *= wr;
  const strain = eff.map((e, k) => s.ceil[k] > 0 ? e / s.ceil[k] : (e > 0 ? 99 : 0));
  const capE = cE * (got[0] + got[1] + got[2]);
  RES.forEach((r, k) => { add("captured." + r, r + " captured", got[k], "units"); add("strain." + r, r + " effort over ceiling", strain[k], "×"); });
  add("captureEnergy", "energy spent capturing", capE, "units");
  // 5. people eat, first
  const foodAvail = got[0] + K.subsistence * idle + s.stores[0];
  const eaten = Math.min(N.food, foodAvail), famine = N.food > 0 ? 1 - eaten / N.food : 0;
  s.stores[0] = foodAvail - eaten;
  add("eaten", "eaten", eaten, "units"); add("subsistence", "grown by the idle", K.subsistence * idle, "units"); add("famine", "famine", famine, "share");
  // 6. upkeep: the capture's own energy, then technology's, then the economy's; a unit unpaid does not work
  let eAvail = got[1] + s.stores[1] - capE;
  const techPaid = Math.min(N.techE, Math.max(eAvail, 0)); eAvail -= techPaid;
  let mAvail = got[2] + s.stores[2];
  // the economy works to the share of its upkeep it can pay in BOTH energy and materials, and pays only for that share;
  // when a resource is short it shares it pro rata with the end products (js/products.js), whose share stays in the store
  const prodWant = window.PRODUCTS ? window.PRODUCTS.upkeepOf(s) : [0, 0, 0];
  const shareE = N.upkE + prodWant[1] > 0 ? Math.min(1, Math.max(eAvail, 0) / (N.upkE + prodWant[1])) : 1;
  const shareM = N.upkM + prodWant[2] > 0 ? Math.min(1, mAvail / (N.upkM + prodWant[2])) : 1;
  const paid = Math.min(shareE, shareM);
  const econE = paid * N.upkE, econM = paid * N.upkM;
  eAvail -= econE; mAvail -= econM;
  s.stores[1] = Math.max(eAvail, 0);
  const techOk = N.techE <= 0 || techPaid >= N.techE - 1e-9;
  add("upkeep.energy", "upkeep paid in energy", techPaid + econE, "units"); add("upkeep.materials", "upkeep paid in materials", econM, "units");
  add("econPaid", "economy paid", paid, "share"); add("techPaid", "technology paid", techOk ? 1 : 0, "");
  const wasPaid = s.unpaidEcon === 0, wasTechPaid = s.unpaidTech === 0;
  s.unpaidEcon = paid > 0.999 ? 0 : s.unpaidEcon + 1;
  s.unpaidTech = techOk ? 0 : s.unpaidTech + 1;
  let decayE = 0, decayT = 0;
  if (s.unpaidEcon > K.unpaidGrace) { decayE = s.econ * K.unpaidDecay * (1 - paid); s.econ -= decayE; }
  if (s.unpaidTech > K.unpaidGrace) { decayT = s.tech * K.unpaidDecay; s.tech -= decayT; }
  if (decayE) add("decay.econ", "economy decayed", decayE, "units"); if (decayT) add("decay.tech", "technology decayed", decayT, "pts", "unpowered");
  const fade = s.tech * K.techFade; s.tech -= fade;               // knowledge forgotten without schools: academia must outrun it
  add("fade.tech", "technology forgotten", fade, "pts");
  // 7. money
  const income = c.moneyPerWorker * wE * paid * tmul(s, "techMoney");
  s.treasury += income;
  add("income", "income", income, "money");
  // 8. the budget: at most the cap today, split by the shares; a nation that went short today first keeps what its
  //    shortfall would cost at the world price, so the money is there for the market, and builds with the rest
  const prices = W.WORLD_STATE.prices || [1, 1, 1];
  const bill = famine * N.food * prices[0] + Math.max(0, N.upkE + N.techE - techPaid - econE) * prices[1] + Math.max(0, N.upkM - econM) * prices[2];
  const held = Math.min(s.treasury, bill * K.holdDays), wentShort = famine > 0.02 || paid < K.shortLine;
  const spend = Math.max(0, Math.min(s.treasury - held, cap)), sh = s.shares;
  if (held > 0) add("held", "kept for the market", held, "money", (famine > 0.02 ? "famine" : "upkeep unpaid") + ": a month of the bill");
  // a nation short of its upkeep builds no units it cannot power: only exploration goes on
  const build = wentShort ? 0 : spend;
  // upkeep before building: the materials the end products need today stay in the store for them (js/products.js runs next)
  const buildable = Math.max(0, mAvail - prodWant[2] * paid);
  let unitsI = build * sh.infra / K.infraCostMoney;
  const mForI = Math.min(buildable, unitsI * K.infraCostMaterials); unitsI = mForI / K.infraCostMaterials; mAvail -= mForI;
  const unitsE = build * sh.econ / K.econCostMoney;
  const research = Math.min(spend * sh.research, wA * K.researchCost);   // research is not a unit to power: it goes on when short
  // the end products' money is set aside here and spent by the products pillar, which runs next
  s._budget_mil = build * (sh.military || 0); s._budget_hea = build * (sh.health || 0);
  add("spend.military", "set aside for the military", s._budget_mil, "money"); add("spend.health", "set aside for health", s._budget_hea, "money");
  const funded = wA > 0 ? research / (wA * K.researchCost) : 0;
  const dT = c.researchRate * (wA / Math.max(s.pop, 1e-6)) * funded / (1 + s.tech / c.techSlow);
  let worst = 0; for (let k = 1; k < 3; k++) if (strain[k] > strain[worst]) worst = k;
  let explore = spend * sh.explore;
  if (strain[worst] > 1) { s.ceil[worst] += explore * K.exploreYield; add("explored." + RES[worst], RES[worst] + " ceiling raised", explore * K.exploreYield, "units/day"); }
  else explore = 0;
  const spent = unitsI * K.infraCostMoney + unitsE * K.econCostMoney + research + explore + s._budget_mil + s._budget_hea;
  s.treasury -= spent;
  s.infra += unitsI; s.econ += unitsE; s.tech += dT;
  add("spent", "spent", spent, "money"); add("cap", "spending cap", cap, "money/day");
  add("built.infra", "infrastructure built", unitsI, "units"); add("built.econ", "economy built", unitsE, "units");
  add("research", "research", research, "money"); add("techGain", "technology gained", dT, "pts"); add("explore", "exploration", explore, "money");
  // 9. stores
  s.stores[2] = mAvail;
  const storeCap = c.storePerUnit * s.infra;
  for (let k = 0; k < 3; k++) { const over = Math.max(0, s.stores[k] - storeCap); if (over) add("wasted." + RES[k], RES[k] + " wasted", over, "units"); s.stores[k] -= over; }
  RES.forEach((r, k) => add("stored." + r, r + " in store", s.stores[k], "units"));
  // 10. people
  const housing = c.housingPerUnit * s.infra;
  const surplus = N.food > 0 ? Math.max(0, (foodAvail - N.food) / N.food) : 0;
  const births = (s.pop < housing ? K.birthRate * Math.min(1, surplus / K.foodMargin) * s.pop : 0) * (s._birthMul || 1);
  const deaths = (K.baseDeath + K.famineDeath * famine) * s.pop * (s._deathMul || 1);   // health (js/products.js) sets the multipliers
  const idleEff = Math.max(0, idle - (s._exportWorkers || 0));             // yesterday's exporters are not idle hands
  const leave = K.leaveRate * (idleEff + Math.max(0, s.pop - housing));    // the trade pillar moves them along the links, or keeps them
  s.pop = Math.max(0.001, s.pop + births - deaths - leave);
  add("births", "born", births, "M"); add("deaths", "died", deaths, "M"); add("left", "left", leave, "M"); add("housing", "housed", housing, "M");
  // the budget rule: one step a day from the largest other share to the one the first firing rule names
  const short = Math.max(famine, 1 - paid);
  let rule, reason;
  if (short > 0.02) {
    const what = famine > 0.02 ? 0 : worst;
    if (strain[what] > 1.5) { rule = "explore"; reason = RES[what] + " past its ceiling"; }
    else { rule = "infra"; reason = "short of " + RES[what]; }
  } else if (s.pop > housing) { rule = "infra"; reason = "no room"; }
  else if (deaths / Math.max(s.pop, 1e-6) > K.deathsLine) { rule = "health"; reason = "deaths running high"; }
  else if (idleEff > 0.1 * s.pop) { rule = "econ"; reason = "idle hands"; }
  else if (s.treasury < 30 * cap) { rule = "keep"; reason = "thin reserve"; }
  else { rule = sh.infra <= sh.econ ? "infra" : "econ"; reason = "nothing pressing: build"; }
  for (const k of SHARES) if (sh[k] == null) sh[k] = K.shares0[k];   // a save from before a share existed
  { let tot = 0; for (const k of SHARES) tot += sh[k]; for (const k of SHARES) sh[k] /= tot; }
  const floorOf = k => k === "military" ? (s.milFloor || K.shareFloor.military) : K.shareFloor[k];
  const donors = SHARES.filter(k => k !== rule && sh[k] > floorOf(k) + 1e-9).sort((a, b) => sh[b] - sh[a]);
  if (donors.length) { const step = Math.min(c.shareStep, sh[donors[0]] - floorOf(donors[0])); sh[donors[0]] -= step; sh[rule] += step; }
  const reasonChanged = s.reason !== reason && reason !== "nothing pressing: build";   // a turn of the budget is news; routine building is not
  s.rule = rule; s.reason = reason;
  SHARES.forEach(k => add("share." + k, "share · " + k, sh[k], "", k === rule ? reason : ""));
  // runtime readouts for the card, the layers and the census
  s._idle = idle; s._famine = famine; s._paid = paid; s._strain = strain; s._income = income; s._housing = housing;
  s._famineDays = famine > 0.02 ? (s._famineDays || 0) + 1 : (s._famineDays || 0);
  // the wire: transitions only
  const name = W.nameOf(iso), big = s.pop >= 50;
  if (famine > 0.02 && !(s._wasFamine)) W.log({ sev: big ? "large" : "small", kind: "economy", iso, text: name + ": famine begins, " + Math.round(famine * 100) + "% of the need unmet" });
  if (famine <= 0.02 && s._wasFamine) W.log({ sev: "small", kind: "economy", iso, text: name + ": the famine ends" });
  s._wasFamine = famine > 0.02;
  if (wasPaid && s.unpaidEcon === 1) W.log({ sev: "small", kind: "economy", iso, text: name + ": the economy stops for want of " + (econE < N.upkE - 1e-9 ? "energy" : "materials") });
  if (!wasPaid && s.unpaidEcon === 0 && paid > 0.999) W.log({ sev: "small", kind: "economy", iso, text: name + ": the economy is working again" });
  if (wasTechPaid && s.unpaidTech === 1) W.log({ sev: "small", kind: "economy", iso, text: name + ": technology goes unpowered" });
  if (s.unpaidEcon === K.unpaidGrace + 1) W.log({ sev: big ? "large" : "small", kind: "economy", iso, text: name + ": unpaid for a month, the economy begins to decay" });
  if (reasonChanged) W.log({ sev: "small", kind: "economy", iso, text: name + ": " + reason + " — the budget turns to " + ({ infra: "infrastructure", econ: "the economy", research: "research", keep: "the reserve", explore: "exploration", military: "the military", health: "health" })[rule] });
  const dry = wr < 0.75;
  if (dry && !s._wasDry) W.log({ sev: big ? "large" : "small", kind: "economy", iso, text: name + ": " + (s.rain < 1 ? "drought" : "floods") + ", the harvest down to " + Math.round(wr * 100) + "%" });
  if (!dry && s._wasDry) W.log({ sev: "small", kind: "economy", iso, text: name + ": the weather turns, the harvest recovers" });
  s._wasDry = dry;
}

/* ── The card: one row per theme, stocks from the state and flows from today's ledger ── */
const f = (v, d) => (+v || 0).toFixed(d == null ? 1 : d);
function rows(iso, L) {
  const s = W.COUNTRY_STATE[iso]; if (!s || !s.shares) return [];
  const g = k => L.get("economy." + k), ran = L.of("economy").length > 0, st = s._strain || [0, 0, 0];
  const strainNote = k => st[k] > 1 ? " · strain " + f(st[k], 2) : "";
  const out = [
    ["people", f(s.pop) + " M · " + f(s._housing != null ? s._housing : cfg().housingPerUnit * s.infra) + " M housed" + (ran ? " · " + f(s._idle) + " M idle" : ""),
      ran ? "+" + f(g("births"), 3) + " born · " + f(g("deaths"), 3) + " died · " + f(g("left"), 3) + " left" : ""],
    ["labour", ran ? f(g("workInfra")) + " infrastructure · " + f(g("workEcon")) + " economy · " + f(g("workAcad"), 2) + " academia" + (g("workExport") ? " · " + f(g("workExport")) + " export" : "") : "—"],
    ["units", f(s.infra) + " infrastructure · " + f(s.econ) + " economy · " + f(s.acad) + " academia", ran ? "+" + f(g("built.infra"), 3) + " / +" + f(g("built.econ"), 3) + " today" : ""],
  ];
  RES.forEach((r, k) => out.push([r, "ceiling " + f(s.ceil[k], 0) + " · " + (ran ? f(g("captured." + r)) + " captured · " : "") + f(s.stores[k], 0) + " stored",
    (ran ? (k === 0 ? f(g("eaten")) + " eaten" : f(k === 1 ? g("upkeep.energy") + g("captureEnergy") : g("upkeep.materials")) + " used") : "") + strainNote(k)]));
  out.push(["money", (ran ? "+" + f(g("income"), 0) + " · spent " + f(g("spent"), 0) + " · " : "") + f(s.treasury, 0) + " held", "cap " + f(cfg().budgetCapPerUnit * s.econ, 0) + " a day"]);
  out.push(["budget", SHARES.map(k => k + " " + Math.round(s.shares[k] * 100) + "%").join(" · "), s.reason || ""]);
  out.push(["technology", f(s.tech) + (ran ? " · +" + f(g("techGain"), 3) + " today" : ""), s.unpaidTech ? "unpowered " + s.unpaidTech + " days" : ""]);
  if (ran) {
    if (s._famine > 0.02) out.push(["famine", Math.round(s._famine * 100) + "% of the need unmet", f(g("deaths"), 3) + " M died today"]);
    if (s._paid < 0.999) out.push(["economy", Math.round(s._paid * 100) + "% of its upkeep paid", s.unpaidEcon > K.unpaidGrace ? "decaying" : "unpaid " + s.unpaidEcon + " days"]);
    out.push(["rain", f(s.rain, 2) + "× the optimum", "food ×" + f(g("rainFood"), 2)]);
  }
  return out;
}

/* ── Layers for the map: economy (income per head), technology, strain ── */
const incomePerHead = s => s && s.pop > 0 ? (s._income || 0) / s.pop : 0;
const maxStrain = s => s && s._strain ? Math.max(s._strain[0], s._strain[1], s._strain[2]) : 0;
const layers = [
  { key: "economy", label: "Econ", lo: "#232a2e", hi: "#7fd79f", legend: ["0", "20 /head"],
    value: st => clamp01(incomePerHead(st) / 20), show: st => f(incomePerHead(st)) + " a day a head" },
  { key: "technology", label: "Tech", lo: "#1c2a33", hi: "#7fd7ff", legend: ["0", "100"],
    value: st => clamp01((st.tech || 0) / 100), show: st => f(st.tech) },
  { key: "strain", label: "Strain", lo: "#35503f", hi: "#ff4060", legend: ["slack", "3× ceiling"],
    value: st => clamp01(maxStrain(st) / 3), show: st => maxStrain(st) >= 99 ? "no reserve" : f(maxStrain(st), 2) + "× " + (st._strain ? RES[st._strain.indexOf(Math.max(...st._strain))] : "") },
];

/* ── The census ── */
const r2 = v => Math.round(v * 100) / 100;
function census(iso, s) {
  const st = s._strain || [0, 0, 0];
  return { pop: Math.round(s.pop * 10) / 10, idle: Math.round(100 * (s._idle || 0) / Math.max(s.pop, 1e-6)), tech: Math.round(s.tech * 10) / 10,
           treasury: Math.round(s.treasury), strainFood: r2(st[0]), strainEnergy: r2(st[1]), strainMat: r2(st[2]),
           famine: (s._famine || 0) > 0.02, short: (s._paid == null ? 1 : s._paid) < K.shortLine };
}
function censusWorld() {
  let n = 0, fam = 0, short = 0, pop = 0, idle = 0, income = 0, techPop = 0;
  for (const iso in W.COUNTRY_STATE) {
    const s = W.COUNTRY_STATE[iso]; if (!s.shares) continue;
    n++; pop += s.pop; idle += s._idle || 0; income += s._income || 0; techPop += s.tech * s.pop;
    if ((s._famine || 0) > 0.02) fam++; if ((s._paid == null ? 1 : s._paid) < K.shortLine) short++;
  }
  return { people: Math.round(pop), famineNations: fam, shortNations: short, idleShare: Math.round(100 * idle / Math.max(pop, 1e-6)), income: Math.round(income), techMean: Math.round(10 * techPop / Math.max(pop, 1e-6)) / 10 };
}

/* helpers for the pillars after this one (trade captures for export with the same curve) */
const slotsOf = s => { const c = cfg(); return { I: c.infraSlots * s.infra, E: c.econSlots * s.econ, A: c.acadSlots * s.acad }; };
const cpwOf = s => cfg().capturePerWorker * tmul(s, "techCapture");
const captureEnergyPer = s => cfg().captureEnergy * tdown(s, "techEnergy");
const capture = (s, r, effort) => captured(effort, s.ceil[r]);

window.ECONOMY = W.registerPillar({
  name: "economy", label: "Economy", fields: FIELDS, seed, daily, rows, census, censusWorld, layers,
  config: { group: "Economy", defaults: LEVERS, rows: ROWS },
  K, LEVERS, calibrate, needs, slotsOf, cpw: cpwOf, captureEnergyPer, capture,
});
})();
