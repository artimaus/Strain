/* ═══════════════════════════════════════════════════════════════
   Entity — world
   Owner of per-country state and the world clock.  A country is the
   six outbreak fields (coverage, detection, response) plus its agent
   record from countries.js (stats, treasury, government axes...).
   The clock turns real seconds into in-game days at the bench's speed
   and runs dayTick(), in this order: flows over the links, treasury
   and drift, migration, the outbreak's spread and response (only if
   something is covered), wars and occupations, events and their
   diffusion, each country's monthly decision, and government change.
   Pairs (relations, trade, sanctions, pacts, wars), each country's
   resource supply (native plus trade, occupation and weather) and the
   dated news log live here too, as does the save pack table.

   Every roll comes from one stream per day seeded from the world seed,
   so the same seed always gives the same world and a mid-day save
   reloads exactly.  Reads window.ENTITY_CONFIG only inside functions
   that run after load: shell.js defines it and loads after this file.
   ═══════════════════════════════════════════════════════════════ */
(() => {
"use strict";
const { $ } = window.UI;
const { COUNTRY_REGION, REGION_NAME, REGION_ENV, popOf } = window.GEO;
const climateOf = iso => window.COUNTRIES.climateOf(iso);
const oscillation = () => window.COUNTRIES.oscillation(WORLD_STATE.seed, Math.floor(WORLD_STATE.day / 365));
const { STAT_KEYS, RES_KEYS, RIVALRIES, hash32, clamp, initStats, driftTargets, weatherAnomaly, ecoIndex, techEnergyOf, resShare } = window.COUNTRIES;

const cfg = () => window.ENTITY_CONFIG;

/* ── State ──────────────────────────────────────────────────────── */
const COUNTRY_STATE = Object.create(null);
const WORLD_STATE = { seed: 0, day: 0, wars: [], warSeq: 0, diffusions: [], massive: {}, log: [] };

const isAgent = iso => window.DATA.isAgent(iso);           // a peopled row: scenery has no state
const OUTBREAK_BLANK = () => ({ covered: false, coverageLevel: 0, profile: null,
                                 detection: 0, govAction: 0, responseProgress: 0 });
function blankState(iso) {
  return Object.assign(OUTBREAK_BLANK(), initStats(iso, WORLD_STATE.seed));
}
function ensureCountry(iso) {
  if (!isAgent(iso)) return COUNTRY_STATE[iso] || null;     // scenery: on the map, never a state
  if (!COUNTRY_STATE[iso]) COUNTRY_STATE[iso] = blankState(iso);
  return COUNTRY_STATE[iso];
}
function blankStatesFor(list) {
  for (const c of list) if (isAgent(c.iso2) && !COUNTRY_STATE[c.iso2]) COUNTRY_STATE[c.iso2] = blankState(c.iso2);
}
/* Agents are exactly what is on the map.  Before it loads every region
   code is seeded so the world can run; once it has, territories with no
   shape or marker (nothing to click, no name to print) are dropped. */
function pruneToMap() {
  if (!worldMap) return;
  const onMap = new Set(worldMap.countries.map(c => c.iso2));
  for (const iso in COUNTRY_STATE) if (!onMap.has(iso)) delete COUNTRY_STATE[iso];
}
/* A fresh world: new seed, day 0, every known country re-seeded.  Called
   at load, on New game, and before a save is unpacked over it. */
function newWorld(seed) {
  WORLD_STATE.seed = (seed == null ? (Math.random() * 4294967296) : seed) >>> 0;
  WORLD_STATE.day = 0;
  WORLD_STATE.wars = []; WORLD_STATE.warSeq = 0; WORLD_STATE.diffusions = []; WORLD_STATE.massive = {}; WORLD_STATE.log = []; WORLD_STATE.market = null;
  for (const iso in COUNTRY_STATE) delete COUNTRY_STATE[iso];
  for (const k in PAIRS) delete PAIRS[k];
  touchPairs();
  for (const iso in COUNTRY_REGION) if (isAgent(iso)) COUNTRY_STATE[iso] = blankState(iso);
  if (worldMap) { blankStatesFor(worldMap.countries); pruneToMap(); takeAreas(worldMap.countries); }
  seedPotentials();                                     // no-op before shell.js has defined the config
  rebuildLinks();
  acc = 0;
  syncMapColors();
  window.dispatchEvent(new CustomEvent("entity:world", { detail: { seed: WORLD_STATE.seed } }));
}
/* ── Pairs: relations, trade deals, sanctions, pacts, wars ────────
   Stored only once a pair has been touched; until then relOf() answers
   from a baseline (same region, shared border, similar government, and
   the curated rivalries).  sanA = A sanctions B, sanB = B sanctions A. */
const PAIRS = Object.create(null);
const pairKey = (a, b) => a < b ? a + "|" + b : b + "|" + a;
/* Every write to the pairs table bumps this, and every memo built from
   the table keys on it, so a pact signed this morning is seen by noon. */
let pairsVersion = 0;
const touchPairs = () => { pairsVersion++; };
function baseRel(a, b) {
  const riv = RIVALRIES[pairKey(a, b)];
  if (riv != null) return riv;
  const A = COUNTRY_STATE[a], B = COUNTRY_STATE[b], L = window.LINKS;
  let r = 0;
  if (COUNTRY_REGION[a] && COUNTRY_REGION[a] === COUNTRY_REGION[b]) r += 15;
  if (L && L.ready && L.linkedBy(a, b, "land")) r += 5;
  if (A && B) {                                          // like governs with like: freedom and trade posture
    const fa = A.freedom != null ? A.freedom : A.econOpen, fb = B.freedom != null ? B.freedom : B.econOpen;
    r -= cfg().relGovGap * (Math.abs(fa - fb) + Math.abs(A.econOpen - B.econOpen)) / 2;
  }
  return clamp(r, -100, 100);
}
function pairOf(a, b) {
  const k = pairKey(a, b);
  return PAIRS[k] || (touchPairs(), PAIRS[k] = { rel: baseRel(a, b), pact: 0, sanA: 0, sanB: 0, warId: 0, truce: 0, deals: [] });
}
function relOf(a, b) { const p = PAIRS[pairKey(a, b)]; return p ? p.rel : baseRel(a, b); }
/* -- Deals: a recurring swap between two countries ----------------
   A deal is a term over which each side puts up something every day:
   a resource against a resource (the common case), a resource against
   money, or a technology term.  It is stored once on the pair, always
   written from the pair first ISO (A) point of view:
     { g, gq, t, tq, mq, tech, until, since, short }
   g and t are resource types (0..3) or -1 for nothing; gq and tq the
   amounts a day A gives and takes; mq money a day (positive: A pays B);
   tech the technology rate A shares with B.  short counts consecutive
   days a side could not deliver.  Nothing is ever created here:
   economy.js moves the amounts, world.js keeps the records. */
function dealsOf(a, b) { const p = pairAt(a, b); return p && p.deals ? p.deals : []; }
function addDeal(a, b, d) {
  const p = pairOf(a, b);
  (p.deals || (p.deals = [])).push(d);
  touchPairs();
  return d;
}
function dropDeals(a, b) {
  const p = pairAt(a, b); if (!p) return 0;
  const n = p.deals ? p.deals.length : 0;
  p.deals = [];
  if (n) touchPairs();
  return n;
}
const dealing = p => !!(p && p.deals && p.deals.length);   // does this pair trade at all
/* How many deals a country can carry: its infrastructure runs the ports,
   the paperwork and the pipelines, and a large surplus is itself a reason
   to run more of them -- an exporter builds the trade it lives on. */
function partnerCapOf(iso) {
  const s = COUNTRY_STATE[iso], c = cfg();
  if (!s || !s.st) return 0;
  let best = 0;
  if (s.surplus && s.consumption) for (let k = 0; k < 4; k++) {
    if (!(s.surplus[k] > 0) || !(s.consumption[k] > 0)) continue;
    best = Math.max(best, s.surplus[k] / s.consumption[k]);
  }
  const G = window.GOV, open = G && G.powerMul ? G.powerMul(s, "partners") : 1;   // an opening of the markets, a great canal: more deals
  return Math.max(1, Math.round((c.partnerBase + c.partnerInfra * s.st.infra / 100 + c.partnerSpare * Math.min(2, best)) * open));
}
function pairAt(a, b) { return PAIRS[pairKey(a, b)] || null; }      // read without creating
function shiftRel(a, b, d) {
  const p = pairOf(a, b), c = cfg(), was = p.rel;
  p.rel = clamp(p.rel + d, -100, 100);
  if ((was >= c.tieFriend) !== (p.rel >= c.tieFriend) || (was <= c.tieFoe) !== (p.rel <= c.tieFoe)) touchPairs();   // a tie formed or broke
  return p.rel;
}
/* A move between two countries is read by everyone who cares about
   either of them: the friend of my friend warms to me, the friend of my
   enemy cools.  A fraction of the step, once, at the moment it is made. */
function rippleRel(a, b, d) {
  const c = cfg(), f = c.thirdParty * d, pc = pairCounts(), tb = pc[b];
  if (!tb || !f) return;
  for (const x of tb.friends) if (x !== a) shiftRel(a, x, f);
  for (const x of tb.foes)    if (x !== a) shiftRel(a, x, -f);
}
/* Relations drift back toward where the relationship actually stands:
   geography, government and history, plus what the two have built
   together.  A live pact or a running deal moves that resting point, so
   an alliance holds while it lasts and fades once it is gone, and a
   sanction holds the pair down while it is in force. */
function restingRel(a, b, p) {
  const c = cfg();
  let r = baseRel(a, b);
  if (p) {
    if (p.pact) r += c.pactBase;
    if (p.deals && p.deals.length) r += c.dealBase * Math.min(2, p.deals.length);
    if (p.sanA || p.sanB) r -= c.sanctionBase;
  }
  return clamp(r, -100, 100);
}
function relaxRelations() {
  const c = cfg(), day = WORLD_STATE.day, gone = [];
  if (!c.relRevert) return;
  for (const k in PAIRS) {
    const p = PAIRS[k];
    if (p.warId) continue;                              // a war holds relations where it put them
    const i = k.indexOf("|"), rest = restingRel(k.slice(0, i), k.slice(i + 1), p);
    p.rel += (rest - p.rel) * c.relRevert;
    // a pair with nothing between them and relations back at rest is no pair at all: baseRel answers for it
    if (!dealing(p) && !p.pact && !p.sanA && !p.sanB && day >= (p.truce || 0) && Math.abs(p.rel - rest) < c.pairPrune) gone.push(k);
  }
  for (const k of gone) delete PAIRS[k];
  if (gone.length) touchPairs();
}
/* Per-country counts of deals and sanctions against it, in one pass,
   memoised for the day: thirty weekly decisions a day each asked for it. */
let pcDay = -1, pcVer = -1, pcMemo = null;
function pairCounts() {
  if (pcMemo && pcDay === WORLD_STATE.day && pcVer === pairsVersion) return pcMemo;
  const out = pcMemo = Object.create(null); pcDay = WORLD_STATE.day; pcVer = pairsVersion;
  const at = iso => out[iso] || (out[iso] = { trade: 0, deals: 0, sanctions: 0, pacts: 0, by: [], friends: [], foes: [] });
  const c = cfg();
  for (const k in PAIRS) {
    const p = PAIRS[k], i = k.indexOf("|"), a = k.slice(0, i), b = k.slice(i + 1);
    const nd = p.deals ? p.deals.length : 0;
    if (nd) { at(a).trade++; at(b).trade++; at(a).deals += nd; at(b).deals += nd; }
    if (p.pact)  { at(a).pacts++; at(b).pacts++; }
    if (p.sanA) { at(b).sanctions++; at(b).by.push(a); }     // by: who sanctions this country
    if (p.sanB) { at(a).sanctions++; at(a).by.push(b); }
    if (p.rel >= c.tieFriend) { at(a).friends.push(b); at(b).friends.push(a); }
    if (p.rel <= c.tieFoe)    { at(a).foes.push(b);    at(b).foes.push(a); }
  }
  return out;
}

/* ── Scale: population supplies size, stats stay per-head levels ──
   force: the army as a number of people under arms, scaled by technology
   and infrastructure; popCap: how many the land, cities, roads,
   know-how and hospitals can carry; inertia: how slowly a big country
   moves; potential: each resource as an absolute amount per day, set
   once from the relative endowment and the starting need. */
function areaOf(iso) {
  const s = COUNTRY_STATE[iso];
  return (s && s.area) || (cfg() ? cfg().areaFallback : 200000);
}
/* A country's own force: its army over its people, by technology and infrastructure. */
function ownForce(iso) {
  const s = COUNTRY_STATE[iso], c = cfg();
  if (!s || !s.st) return 0;
  return s.st.military * Math.max(0.01, s.pop) * (1 + c.mulTechMil * s.st.technology / 100) * (1 + c.mulInfraMil * s.st.infra / 100);
}
/* The force it can bring to bear: its army over its own people and the people it levies from the territories it
   holds, less the garrisons posted there (js/decide.js occupationTick sizes both by how firmly each is held). */
function force(iso) {
  const s = COUNTRY_STATE[iso], c = cfg();
  if (!s || !s.st) return 0;
  return Math.max(0, s.st.military * (Math.max(0.01, s.pop) + (s.levy || 0)) * (1 + c.mulTechMil * s.st.technology / 100) * (1 + c.mulInfraMil * s.st.infra / 100) - (s.garrison || 0));
}
function popCap(iso) {
  const s = COUNTRY_STATE[iso], c = cfg();
  if (!s || !s.st) return 0;
  return areaOf(iso) * c.popPerKm * (0.2 + (s.urban || 0.6)) * (0.5 + s.st.infra / 100) * (0.5 + s.st.technology / 100) * (0.5 + s.st.medical / 100);
}
function inertia(iso) {
  const s = COUNTRY_STATE[iso], c = cfg();
  return 1 / (1 + c.inertiaPop * Math.log10(1 + Math.max(0, s ? s.pop : 0)));
}
/* Potential per type from the relative endowment: 100 means the starting
   need times potentialScale.  Set once; a resource find scales it. */
function startNeed(s, c, waterScale) {
  const out = (s.output != null ? s.output : 50) * s.pop;
  const fc = s.st.military * s.pop * (1 + c.mulTechMil * s.st.technology / 100) * (1 + c.mulInfraMil * s.st.infra / 100);
  const water = s.pop * c.needWater;
  // a dry country makes water from energy: count that energy in its need when the water scale is known
  let desal = 0;
  if (waterScale) {
    const natural = s.res[3] / 100 * water * waterScale * access0(s, c);
    desal = Math.min(c.desalRate * s.pop * (s.st.infra / 100) * (s.st.technology / 100), Math.max(0, water - natural));
  }
  const eff = 1 - c.energyTechEff * s.st.technology / 100, matEff = 1 - c.matTechEff * s.st.technology / 100;
  const techEnergy = techEnergyOf(s.st.technology, s.pop, c);
  return [(out * c.needEnergyOut + fc * c.needEnergyMil) * eff + desal * c.desalEnergy + techEnergy, out * c.needMatOut * matEff + fc * c.needMatMil, s.pop * c.needFood, water];
}
/* Potentials are set for every unseeded country at once, scaled per
   type so that the world as a whole starts producing worldBalance0 of
   what it needs (at day-0 access): the endowments decide who has the
   surplus and who is short, the scale decides that the world is not
   short overall.  A country seeded later (a marker the map adds) takes
   the scale the world already has. */
const potScale = [1, 1, 1, 1];
function access0(s, c) { return clamp(c.accessBase + c.accessInfra * s.st.infra / 100 + c.accessTech * s.st.technology / 100, 0, 1); }
function seedPotential(s, scale) {
  const c = cfg(); if (!c || !s || !s.st || !s.res || s.potential) return;
  const need = startNeed(s, c, (scale || potScale)[3]);
  s.potential = s.res.map((v, k) => resShare(v, c) * need[k] * (scale || potScale)[k]);
  s.pop0 = s.pop;                                        // the workforce production was sized for
  s.treasury = s.output * s.pop * c.taxRate * c.startTreasuryDays;
  const days = [c.stockDays, c.stockDays, c.vitalStockDays, c.vitalStockDays], a0 = access0(s, c);
  s.stock = s.potential.map((p, k) => 0.5 * days[k] * (0.5 + s.st.infra / 100) * p * a0);   // the stores start half full, of what the land yields
}
function seedPotentials() {
  const c = cfg(); if (!c) return;
  const fresh = Object.keys(COUNTRY_STATE).filter(iso => { const s = COUNTRY_STATE[iso]; return s.st && s.res && !s.potential; });
  if (!fresh.length) return;
  const seeded = Object.keys(COUNTRY_STATE).some(iso => COUNTRY_STATE[iso].potential);
  if (!seeded) {                                         // a whole new world: find the scale that balances it, water first
    for (const pass of [0, 1]) {
      const need = [0, 0, 0, 0], raw = [0, 0, 0, 0];
      for (const iso of fresh) {
        const s = COUNTRY_STATE[iso], n = startNeed(s, c, pass ? potScale[3] : 0), a = access0(s, c);
        const techF = [1 + c.energyTechProd * s.st.technology / 100, 1 + c.matTechProd * s.st.technology / 100, 1, 1];   // as production will count it
        for (let k = 0; k < 4; k++) { need[k] += n[k]; raw[k] += resShare(s.res[k], c) * n[k] * a * techF[k]; }
      }
      // materials is the type the world's growth actually binds on: its demand climbs with output, while food and
      // water climb only with the people, so it carries its own slack rather than sharing theirs
      const want0 = [c.energyBalance0, c.materialsBalance0, c.worldBalance0, c.worldBalance0];
      for (let k = 0; k < 4; k++) potScale[k] = raw[k] > 0 ? want0[k] * need[k] / raw[k] : 1;
    }
  }
  for (const iso of fresh) seedPotential(COUNTRY_STATE[iso], potScale);
}
/* The map's areas, once it has arrived. */
function takeAreas(list) {
  for (const co of list) { const s = COUNTRY_STATE[co.iso2]; if (s && co.area && !s.area) s.area = co.area; }
}
/* Where each country sits, from the map catalogue: never saved, the map
   always loads before play.  Distances price transport on the exchange
   and tell a neighbour deal from a shipment across the world. */
const POS = Object.create(null);
function takePositions(list) {
  for (const co of list) if (co.iso2 && isFinite(co.lon) && isFinite(co.lat)) POS[co.iso2] = [co.lon, co.lat];
}
const RAD = Math.PI / 180;
function distKm(a, b) {                                  // a, b: iso codes or [lon, lat]
  const p = Array.isArray(a) ? a : POS[a], q = Array.isArray(b) ? b : POS[b];
  if (!p || !q) return cfg().distFallback;
  const dLat = (q[1] - p[1]) * RAD, dLon = (q[0] - p[0]) * RAD;
  const la = p[1] * RAD, lb = q[1] * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function posOf(iso) { return POS[iso] || null; }
/* Technology moves between countries in three places -- a deal term, the
   loser of a war learning from the winner, and free diffusion -- and the
   rule is the same everywhere: the receiver climbs toward a share of the
   provider level, as fast as its infrastructure and economy let it
   absorb, and never past that share. */
function shareTech(from, to, rate, capFrac) {
  const A = COUNTRY_STATE[from], B = COUNTRY_STATE[to], c = cfg();
  if (!A || !B || !A.st || !B.st) return 0;
  const ceiling = A.st.technology * (capFrac == null ? 1 : capFrac);
  if (B.st.technology >= ceiling) return 0;
  const absorb = c.techAbsorbBase + c.techAbsorbInfra * B.st.infra / 100
               + c.techAbsorbEco * Math.min(1, B.output / c.econRef);
  const step = Math.min(ceiling - B.st.technology, Math.max(0, rate) * absorb);
  B.st.technology = clamp(B.st.technology + step, 0, 100);
  return step;
}

/* ── Supply, as the old readers see it: today's balances as 0..100 ──
   The economy pass (js/economy.js) produces, consumes and trades; what it
   leaves on the country is production, consumption, balance per type
   and the stockpile.  supplyOf returns the balances scaled to 0..100 so
   the map, the screen and the decision code keep one scale; before the
   first tick it assesses the country on the spot. */
function balances(iso) {
  const s = COUNTRY_STATE[iso];
  if (!s || !s.st) return null;
  if (s.balance) return s.balance;
  const E = window.ECONOMY, a = E && s.potential ? E.assess(iso) : null;
  return a ? a.balance : null;
}
function supplyOf(iso) { const b = balances(iso); return b ? b.map(v => v * 100) : null; }
const floorOf = iso => { const b = balances(iso); return b ? Math.min(b[0], b[1], b[2], b[3]) * 100 : 100; };
const meanRes = s => s && s.res ? (s.res[0] + s.res[1] + s.res[2] + s.res[3]) / 4 : 50;
/* The economy as a number: output per head against the reference, as a
   log index (50 at the reference, +25 a doubling, no ceiling), and the
   same clamped to 0..100 for readers that want a level. */
const ecoIndexOf = iso => { const s = COUNTRY_STATE[iso]; return s && s.output != null ? ecoIndex(s.output, cfg()) : 50; };
const ecoClamped = iso => Math.min(100, ecoIndexOf(iso));
/* The world opens with deals already in place inside the friendly blocs
   (the curated pairs at 50 or better), so supplies look plausible on day
   one; every later deal is a decision.  Runs when the links are built at
   day 0; a loaded game's unpackPairs replaces them. */
function seedDeals() {
  const L = window.LINKS, D = window.DECIDE;
  if (!L || !L.ready || WORLD_STATE.day !== 0 || !D || !D.proposeSwap) return;
  for (const e of L.edges) {
    if (!COUNTRY_STATE[e.a] || !COUNTRY_STATE[e.b]) continue;
    if (relOf(e.a, e.b) < cfg().seedDealRel || dealsOf(e.a, e.b).length) continue;
    const prop = D.proposeSwap(e.a, e.b);               // the same test a weekly decision would apply
    if (prop && prop.mutual) addDeal(e.a, e.b, prop.deal);
  }
}
/* -- The life of a deal: terms end, and a side that cannot deliver for
   dealBreakDays running loses the deal and some goodwill.  Runs daily,
   after economy.js has moved the day amounts and marked who fell short. */
function dealsTick() {
  const c = cfg(), day = WORLD_STATE.day;
  for (const k in PAIRS) {
    const p = PAIRS[k];
    if (!p.deals || !p.deals.length) continue;
    const i = k.indexOf("|"), a = k.slice(0, i), b = k.slice(i + 1);
    const keep = [];
    for (const d of p.deals) {
      if (d.short >= c.dealBreakDays) {
        shiftRel(a, b, -c.dealBreakRel);
        log({ sev: "small", kind: "trade", iso: a, iso2: b, key: "broken",
              text: nameOf(a) + " and " + nameOf(b) + " lose a supply deal: it has gone undelivered" });
        continue;
      }
      if (d.until && day >= d.until) continue;          // a term running out is routine, not news

      keep.push(d);
    }
    if (keep.length !== p.deals.length) { p.deals = keep; touchPairs(); }
  }
}

/* ── What the country screen reads (js/country.js) ────────────── */
/* Monthly samples for the sparklines: [day, economy, stability, resources, military]. */
const SERIES_CAP = 36;
function sampleSeries() {
  for (const iso in COUNTRY_STATE) {
    const s = COUNTRY_STATE[iso]; if (!s.st) continue;
    (s.series || (s.series = [])).push([WORLD_STATE.day, Math.round(ecoIndexOf(iso)), Math.round(s.st.stability), Math.round(floorOf(iso)), Math.round(s.st.military),
                                        Math.round(s.pop * 10) / 10, Math.round(s.legit != null ? s.legit : 0)]);
    if (s.series.length > SERIES_CAP) s.series.splice(0, s.series.length - SERIES_CAP);
  }
}

/* Wars live on WORLD_STATE.wars (decide.js runs them). */
function warsOf(iso) { return WORLD_STATE.wars.filter(w => w.att === iso || w.def === iso); }
const atWar = iso => warsOf(iso).length > 0;                                  // a principal
/* The fronts a country fights on as an ally ({ war, front }), and whether it fights at all. */
function frontsOf(iso) {
  const out = [];
  for (const w of WORLD_STATE.wars) for (const f of (w.fronts || [])) if (f.a === iso || f.d === iso) out.push({ war: w, front: f });
  return out;
}
const fighting = iso => atWar(iso) || frontsOf(iso).length > 0;
function warBetween(a, b) { return WORLD_STATE.wars.find(w => (w.att === a && w.def === b) || (w.att === b && w.def === a)) || null; }

/* Display names come from the map catalogue; ISO until it loads. */
const names = Object.create(null);
const nameOf = iso => names[iso] || iso;

/* The world log: dated headlines, capped.  { sev, kind, iso, iso2?, text } */
function log(entry) {
  const e = Object.assign({ d: WORLD_STATE.day }, entry);
  WORLD_STATE.log.push(e);
  const cap = (cfg() && cfg().logCap) || 200;
  if (WORLD_STATE.log.length > cap) WORLD_STATE.log.splice(0, WORLD_STATE.log.length - cap);
  window.dispatchEvent(new CustomEvent("entity:news", { detail: e }));
  return e;
}

/* Zero the outbreak in place; stats and government survive.  map.js's
   sync closure and progression.js hold the COUNTRY_STATE object, so it is
   never reassigned. */
function resetCountries() {
  for (const iso in COUNTRY_STATE) Object.assign(COUNTRY_STATE[iso], OUTBREAK_BLANK());
}

/* ── Regions and aggregates ─────────────────────────────────────── */
function regionMembers(id) {
  const out = [];
  for (const iso in COUNTRY_REGION)
    if (COUNTRY_REGION[iso] === id) out.push(iso);
  return out;
}
function regionAgg(id) {
  const members = regionMembers(id);
  let nCovered = 0, sumCov = 0, sumDet = 0, sumGov = 0,
      sumResp = 0, nDet = 0, pop = 0;
  for (const iso of members) {
    pop += popOf(iso);
    const s = COUNTRY_STATE[iso] || OUTBREAK_BLANK();
    if (s.covered) { nCovered++; sumCov += s.coverageLevel; }
    sumDet += s.detection;
    sumGov += s.govAction;
    if (s.detection > 0.25) { sumResp += s.responseProgress; nDet++; }
  }
  const n = members.length || 1;
  return {
    id, name: REGION_NAME[id], env: REGION_ENV[id], population: pop,
    countries: members.length, covered: nCovered,
    coverageLevel: nCovered ? sumCov / nCovered : 0,
    detection: sumDet / n, govAction: sumGov / n,
    responseProgress: nDet ? sumResp / nDet : 0,
  };
}
/* The game-over meter: every detecting country's response, weighted by
   medical + military + technology and by size.  A world of weak states
   never quite catches you; one strong one can. */
function globalResponse() {
  let total = 0, wsum = 0;
  for (const iso in COUNTRY_STATE) {
    const s = COUNTRY_STATE[iso];
    if (s.detection <= 0.25) continue;
    const w = s.st ? (s.st.medical + s.st.military + s.st.technology) / 300 * Math.sqrt(Math.max(0.01, s.pop)) : 1;
    total += s.responseProgress * w; wsum += w;
  }
  return wsum ? total / wsum : 0;
}
function anyCovered() {
  for (const iso in COUNTRY_STATE) if (COUNTRY_STATE[iso].covered) return true;
  return false;
}

/* ── Map hand-off: the link graph is built from it (js/links.js) ── */
let worldMap = null, lastGeo = null;
let neighbourEdges = [];        // land links, for the country dialog's neighbour list
let mapSync = null;
let topologyReady = false;

/* Links depend on the seed (air partners are picked from the stats), so
   they are rebuilt whenever the world is: same seed, same graph. */
function rebuildLinks() {
  if (!lastGeo || !window.LINKS) return;
  try {
    window.LINKS.rebuild(lastGeo);
    window.LINKS.refreshCapacity();
    neighbourEdges = window.LINKS.edges.filter(e => e.type === "land").map(e => ({ a: e.a, b: e.b, w: 1 }));
    topologyReady = true;
    seedDeals();
  } catch (e) { console.error("links:", e); }
}

function onWorldMapReady(wm, geo) {
  dbg("[Entity world] onWorldMapReady:", wm && wm.countries ? wm.countries.length : "?");
  worldMap = wm; lastGeo = geo;
  for (const c of wm.countries) if (c.iso2 && c.name) names[c.iso2] = c.name;
  blankStatesFor(wm.countries);
  pruneToMap();
  takeAreas(wm.countries);
  takePositions(wm.countries);
  seedPotentials();
  rebuildLinks();
  if (typeof mapSync === "function") mapSync();
}
function installMapSync(fn) { mapSync = fn; if (typeof fn === "function") fn(); }
function syncMapColors() {
  if (typeof mapSync === "function") mapSync();
}

/* ── Clock ───────────────────────────────────────────────────────
   Real time × the bench speed accumulates into days.  ENTITY_CLOCK is
   published by host.js (speed, running-and-not-halted). */
const EPOCH = Date.UTC(2031, 0, 1);
const dateCache = new Map();                 // Intl formatting is slow; every headline of a day shares one string
function fmtDate(day) {
  let s = dateCache.get(day);
  if (s === undefined) {
    s = new Date(EPOCH + day * 86400000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    if (dateCache.size > 4000) dateCache.clear();
    dateCache.set(day, s);
  }
  return s;
}
const dayRng = () => C.mulberry32(hash32(WORLD_STATE.seed, WORLD_STATE.day));

let acc = 0, lastT = performance.now();
function tickClock() {
  const now = performance.now(), dt = now - lastT; lastT = now;
  if (document.hidden) return;
  const clk = window.ENTITY_CLOCK, c = cfg();
  if (!clk || !clk.running || !c) return;      // shell.js (config) may still be loading
  acc += dt * clk.speed;
  let n = 0;
  while (acc >= c.dayMs && n < c.maxCatchup) { acc -= c.dayMs; dayTick(); n++; }
  if (acc > c.dayMs) acc = c.dayMs;          // never bank days across a stall
}
function advanceDays(n) { for (let i = 0; i < n; i++) dayTick(); }

let lastSync = 0;
function syncThrottled() {
  const t = performance.now();
  if (t - lastSync > 250) { lastSync = t; syncMapColors(); }
}
function dayTick() {
  WORLD_STATE.day++;
  const rng = dayRng();
  const L = window.LINKS;
  if (L && L.ready) { L.flows(); if (WORLD_STATE.day % 7 === 0) L.refreshCapacity(); }
  if (L && L.ready) for (const iso in COUNTRY_STATE) { const e = L.effects[iso]; COUNTRY_STATE[iso].tourismIn = e ? e.tourismIn : 0; }
  if (window.ECONOMY) window.ECONOMY.daily();
  dealsTick();
  relaxRelations();
  driftAll(rng);
  flowEffects();
  if (anyCovered()) { spreadTick(rng); responseTick(rng); }
  const D = window.DECIDE, G = window.GOV;
  if (D) { D.warTick(rng); D.occupationTick(rng); }
  const E = window.EVENTS;
  if (E) { E.roll(rng); if (WORLD_STATE.day % 7 === 3) E.diffuse(rng); if (E.refugeeTick) E.refugeeTick(); }
  if (D) for (const iso in COUNTRY_STATE) {
    const s = COUNTRY_STATE[iso];
    if (!s.st) continue;
    if (s.decisionDay % 7 === WORLD_STATE.day % 7 && !s.occupiedBy) D.diplomacyWeekly(iso, rng);   // weekly: deals, sanctions, pacts, borders
    if (s.decisionDay === WORLD_STATE.day % 28) D.act(iso, rng);             // monthly: projects, research, war, the budget (the occupier decides)
  }
  if (G) G.daily(rng);
  if (WORLD_STATE.day % 30 === 0) sampleSeries();
  updateResponseBar();
  syncThrottled();
  window.dispatchEvent(new CustomEvent("entity:day", { detail: { day: WORLD_STATE.day, date: fmtDate(WORLD_STATE.day) } }));
}

/* ── Drift ─────────────────────────────────────────────────────── */
/* Academia, technology and stability drift toward their targets; the
   economy grows in js/economy.js and infrastructure, the army and the
   hospitals are built by projects and decay when unpaid.  The resources
   stat is the binding balance, written here. */
function driftContext(iso, s, c, L, pc) {
  const eff = (L && L.ready) ? L.effects[iso] : null, k = pc[iso];
  const E = window.ECONOMY;                                                                   // loads after this file; present by the time a day runs
  const owed = E ? Math.max(0, -(s.treasury || 0)) / Math.max(1, E.credit(s)) : 0;            // how far into its borrowing, 0 to 1
  return { cfg: c, war: fighting(iso), occupied: !!s.occupiedBy, floor: floorOf(iso), eco: ecoClamped(iso), broke: !!s.broke,
           debt: Math.min(1, owed),
           coverage: s.covered ? s.coverageLevel : 0, tradeDeals: k ? k.trade : 0, sanctions: k ? k.sanctions : 0,
           tourism: eff ? eff.tourismIn : 0, remit: eff ? eff.migOut : 0,
           recession: WORLD_STATE.day < (WORLD_STATE.massive.recessionUntil || 0), busted: WORLD_STATE.day < (s.bustUntil || 0) };
}
function driftTargetsOf(iso) {
  const s = COUNTRY_STATE[iso]; if (!s || !s.st) return null;
  return driftTargets(s, driftContext(iso, s, cfg(), window.LINKS, pairCounts()));
}
function driftAll(rng) {
  const c = cfg(), L = window.LINKS, pc = pairCounts();
  for (const iso in COUNTRY_STATE) {
    const s = COUNTRY_STATE[iso];
    if (!s.st) continue;
    if (!fighting(iso)) s.weary = Math.max(0, (s.weary || 0) - c.wearyDecay);   // war weariness fades at peace
    const ctx = driftContext(iso, s, c, L, pc);
    const t = driftTargets(s, ctx), slow = inertia(iso);
    for (const k in t) {
      const rate = (k === "stability" ? c.driftFast : c.driftSlow) * slow;
      s.st[k] = clamp(s.st[k] + (t[k] - s.st[k]) * rate + (rng() - 0.5) * 2 * c.driftNoise, 0, 100);
    }
  }
}
/* Migrants move population; tourism and remittances act through growth
   (economy.js) and the stability target (countries.js). */
function flowEffects() {
  const L = window.LINKS; if (!L || !L.ready) return;
  const c = cfg();
  for (const iso in COUNTRY_STATE) {
    const e = L.effects[iso]; if (!e) continue;
    const s = COUNTRY_STATE[iso];
    s.pop = Math.max(0.001, s.pop + (e.migIn - e.migOut) * c.migPopScale);
  }
}
function incomeLine(s, iso) { return window.ECONOMY ? window.ECONOMY.incomeLine(s, iso) : { net: 0 }; }

/* ── Outbreak sub-steps (unchanged; rewired to the day in stage 2) ── */
function envCompat(a, b) {
  const dt = Math.abs(a.temp - b.temp), dh = Math.abs(a.humidity - b.humidity);
  return Math.max(0.1, Math.min(1, 1 - (dt / 80) * 0.30 - (dh / 100) * 0.20));
}
function vectorModifier(profile, env) {
  if (!profile || !window.C) return 1;
  const s = C.statsOf(profile.g0, profile.g1);
  const mode = C.MODE_NAME[s.mode];
  if (mode === "Swarm")   return 0.55 + env.urban / 200;
  if (mode === "Network") return 0.75 + env.urban / 400;
  if (mode === "Bloom")   return 0.40 + env.temp / 100 + env.humidity / 300;
  if (mode === "Shower")  return 0.55 + (100 - env.urban) / 300;
  return 1;
}
/* Spread: local growth (faster in dense countries, slower under lockdown)
   and hops along links in proportion to the flow they carry.  rng is the
   day's stream; the smoke test calls this with no argument. */
function spreadTick(rng = dayRng()) {
  const c = cfg(), L = window.LINKS;
  for (const iso in COUNTRY_STATE) {
    const s = COUNTRY_STATE[iso];
    if (!s.covered) continue;
    const lockdown = s.authority / 200 + s.st.military / 300;
    const growth = c.localGrowth * (0.5 + rng() * 0.7) * (0.6 + s.st.infra / 250) * (1 - s.govAction * lockdown);
    s.coverageLevel = Math.min(1, s.coverageLevel + Math.max(0, growth));
  }
  if (L && L.ready) {
    for (let i = 0; i < L.edges.length; i++) {
      const e = L.edges[i];
      hop(e.a, e.b, L.flowAt(i, 0), c, rng);
      hop(e.b, e.a, L.flowAt(i, 1), c, rng);
    }
  }
  for (const iso in COUNTRY_STATE) {
    const s = COUNTRY_STATE[iso];
    if (s.covered && s.profile && window.C && rng() < c.mutationRate) {
      const [ng0, ng1] = C.adapt(s.profile.g0, s.profile.g1, rng);
      s.profile = { g0: ng0, g1: ng1 };
    }
  }
}
function hop(srcIso, dstIso, flow, c, rng) {
  const src = COUNTRY_STATE[srcIso], dst = COUNTRY_STATE[dstIso];
  if (!src || !dst || !src.covered || !(flow > 0)) return;
  const srcR = COUNTRY_REGION[srcIso], dstR = COUNTRY_REGION[dstIso];
  if (!srcR || !dstR) return;
  const envC = envCompat(climateOf(srcIso), climateOf(dstIso));      // each country's own climate, not its region's
  const vecM = vectorModifier(src.profile, climateOf(dstIso));
  const govF = Math.max(0, 1 - dst.govAction * c.actionSlowdown);
  const p = 1 - Math.exp(-flow * src.coverageLevel * vecM * envC * govF * c.spreadPerFlow);
  if (rng() >= p) return;
  if (!dst.covered) {
    dst.covered = true;
    dst.profile = src.profile ? { g0: src.profile.g0, g1: src.profile.g1 } : null;
    dst.coverageLevel = Math.max(dst.coverageLevel, 0.01 + rng() * 0.02);
  } else {
    dst.coverageLevel = Math.min(1, dst.coverageLevel + 0.005);
  }
}
/* Detection, government action and response, shaped by the country:
   medical systems notice sooner (and a fresh breakthrough more so),
   authority and military decide how hard the state comes down, and the
   response's pace is what its hospitals, army and technology can bring.
   Pact partners share what the best of them has reached.  Crossing the
   reaction floor makes the government act at once (decide.js). */
function responseTick(rng = dayRng()) {
  const c = cfg(), day = WORLD_STATE.day, D = window.DECIDE;
  for (const iso in COUNTRY_STATE) {
    const s = COUNTRY_STATE[iso];
    if (!s.covered) {
      s.detection        = Math.max(0, s.detection        - c.countryDecay * 2);
      s.govAction        = Math.max(0, s.govAction        - c.countryDecay);
      s.responseProgress = Math.max(0, s.responseProgress - c.countryDecay * 0.5);
      continue;
    }
    let sev = c.detectionSeverity, dorm = 1, stable = 1;
    if (s.profile && window.C) {
      const st = C.statsOf(s.profile.g0, s.profile.g1);
      sev    = st.brewer ? c.detectionSeverityAnti : c.detectionSeverity;
      dorm   = st.dormancy ? c.dormancyDampen : 1;
      stable = st.adaptor ? 0.4 : 1;
      if (st.cloakN) stable *= Math.max(0.3, 1 - st.cloakN * 0.08);
    }
    const k = s.st || { medical: 50, military: 50, technology: 50 };
    const medF = (0.3 + k.medical / 100 * c.detectMedical) * (day < s.breakthroughUntil ? c.breakthroughMult : 1);
    s.detection = Math.min(1, s.detection + sev * dorm * s.coverageLevel * medF);
    if (s.detection > 0.08)
      s.govAction = Math.min(1, s.govAction + s.detection * s.coverageLevel * c.actionRate * (0.5 + s.authority / 200 + k.military / 400));
    if (s.detection > c.responseFloor)
      s.responseProgress = Math.min(1, s.responseProgress
        + c.responseRate * stable * (0.5 + s.govAction * 0.7) * (0.5 * k.medical + 0.2 * k.military + 0.3 * k.technology) / 50);
    if (s.st && D && s.detection > c.reactFloor && day - (s.lastReact || 0) >= 28) {
      s.lastReact = day;
      D.react(iso, rng);
    }
  }
  // pacts share the best partner's response
  const best = Object.create(null);
  for (const k in PAIRS) {
    const p = PAIRS[k]; if (!p.pact) continue;
    const [a, b] = k.split("|"), A = COUNTRY_STATE[a], B = COUNTRY_STATE[b];
    if (!A || !B) continue;
    best[a] = Math.max(best[a] || 0, B.responseProgress);
    best[b] = Math.max(best[b] || 0, A.responseProgress);
  }
  for (const iso in best) {
    const s = COUNTRY_STATE[iso];
    if (s.covered && s.detection > c.responseFloor)
      s.responseProgress = Math.max(s.responseProgress, best[iso] * c.pactShareResp);
  }
}
function updateResponseBar() {
  const bar = $("responseBar");
  const fill = $("responseFill");
  const pct = $("responsePct");
  if (!anyCovered()) { bar.classList.remove("show"); return; }
  bar.classList.add("show");
  const c = globalResponse();
  fill.style.width = (c * 100).toFixed(1) + "%";
  pct.textContent = (c * 100).toFixed(1) + "%";
  if (c >= 1) {
    resetCountries();
    syncMapColors();
    updateResponseBar();
    if (window.ENTITY_GAMEOVER) window.ENTITY_GAMEOVER();
  }
}

/* ── Persistence ────────────────────────────────────────────────
   One table drives both directions.  A new field is one row here; the
   smoke test's save round-trip fails if a field is written but not
   listed, which is how the old "unknown fields are silently dropped"
   behaviour stays gone.  [key, short name in the save, default]. */
const COUNTRY_FIELDS = [
  ["covered", "c", false], ["coverageLevel", "lv", 0], ["profile", "pr", null],
  ["detection", "dt", 0], ["govAction", "ga", 0], ["responseProgress", "rp", 0],
  ["st", "st", null], ["treasury", "tr", 0], ["authority", "au", 50], ["econOpen", "op", 50],
  ["freedom", "fr", null], ["base", "gb", null], ["regime", "rg", null], ["legit", "lg", null],
  ["defeatUntil", "dfu", 0], ["disgraceUntil", "dgu", 0], ["techRev", "trv", false],
  ["pop", "pop", 0], ["border", "bd", 0], ["decisionDay", "dd", 0], ["nextElection", "ne", null],
  ["occupiedBy", "ob", null], ["occupiedUntil", "ou", 0], ["crisisDays", "cd", 0],
  ["breakthroughUntil", "bu", 0], ["last", "last", null],
  ["lastReact", "lr", 0], ["ban", "ban", null], ["banUntil", "bnu", 0],
  ["weary", "wy", 0], ["warDead", "wd", 0], ["bill", "bl", null], ["allyTrust", "at", null], ["lastWar", "lw", null], ["ration", "rn", 0], ["drain", "dn", null], ["mobilised", "mb", 0], ["mobilUntil", "mu", 0], ["disasterDead", "ddd", 0], ["smokeUntil", "smk", 0], ["rebuildUntil", "rb", 0], ["refugees", "rf", null],
  ["res", "rs", null], ["dryUntil", "dry", 0], ["wetUntil", "wet", 0],
  ["series", "se", null], ["hist", "hi", null],
  ["potential", "pt", null], ["area", "ar", null], ["urban", "ub", 0.6],
  ["output", "out", null], ["pop0", "p0", null], ["stock", "sk", null], ["projects", "pj", null], ["upkeepPlan", "up", null],
  ["outPrev", "opv", 0], ["lastReport", "lrp", 0], ["broke", "bk", false], ["boom", "bm", 0], ["bustUntil", "bt", 0], ["incomeRef", "ir", 0, 2], ["coupProofUntil", "cpu", 0],
];
function packCountry(s) {
  const o = {};
  for (const [k, sh] of COUNTRY_FIELDS) {
    let v = s[k];
    if (k === "st") v = STAT_KEYS.map(x => s.st ? s.st[x] : 50);
    else if (k === "covered") v = v ? 1 : 0;
    o[sh] = v === undefined ? null : v;
  }
  return o;
}
function unpackCountry(o, s) {
  for (const [k, sh, d] of COUNTRY_FIELDS) {
    let v = o[sh];
    if (v === undefined) v = d;
    if (k === "st") {
      // a stat the save predates (resources, added later) keeps its seeded value
      if (Array.isArray(v)) { const prev = s.st || {}; s.st = {}; STAT_KEYS.forEach((x, i) => { s.st[x] = v[i] == null ? (prev[x] ?? 50) : +v[i] || 0; }); }
    } else if (k === "res") {
      // an endowment the save predates keeps its seeded value
      if (Array.isArray(v) && v.length === RES_KEYS.length) s.res = v.map(x => +x || 0);
    } else if (k === "series" || k === "hist") s[k] = Array.isArray(v) ? v : [];
    else if (k === "potential") { if (Array.isArray(v) && v.length === RES_KEYS.length) s.potential = v.map(Number); }
    else if (k === "area") { if (v != null) s.area = +v || null; }
    else if (k === "covered") s.covered = !!v;
    else s[k] = v;
  }
  return s;
}
function packAll() {
  const out = {};
  for (const iso in COUNTRY_STATE) out[iso] = packCountry(COUNTRY_STATE[iso]);
  return out;
}
function unpackAll(obj) {
  for (const iso in obj) if (isAgent(iso)) { const s = unpackCountry(obj[iso], ensureCountry(iso)); if (window.GOV && s) window.GOV.ensure(s); }
  pruneToMap();
  seedPotentials();
  if (window.LINKS && window.LINKS.ready) window.LINKS.refreshCapacity();   // loaded stats, fresh capacities
}
/* The pair and deal blocks are table-driven like the country one: a new
   field on a pair or a deal is one row here.  [key, short name, default,
   rounding]. */
const PAIR_FIELDS = [["rel", "r", 0, 0], ["pact", "p", 0], ["sanA", "a", 0], ["sanB", "b", 0], ["warId", "w", 0], ["truce", "t", 0]];
const DEAL_FIELDS = [["g", "g", -1], ["gq", "gq", 0, 4], ["t", "t", -1], ["tq", "tq", 0, 4], ["mq", "mq", 0, 4], ["tech", "te", 0, 4],
                     ["until", "u", 0], ["since", "s", 0], ["short", "sh", 0], ["fk", "fk", -1], ["fp", "fp", 0, 4], ["prem", "pm", 0, 4]];
const packRow = (src, table) => {
  const o = {};
  for (const [k, sh, d, dp] of table) {
    let v = src[k] == null ? d : src[k];
    if (typeof v === "number") { v = dp != null ? +v.toFixed(dp) : Math.round(v); if (v === d) continue; }   // defaults are not written
    else if (!v) continue;
    o[sh] = v;
  }
  return o;
};
const unpackRow = (o, table) => {
  const out = {};
  for (const [k, sh, d] of table) { const v = o && o[sh]; out[k] = v == null ? d : (typeof d === "number" ? +v || 0 : v); }
  return out;
};
function packPairs() {
  return Object.keys(PAIRS).map(k => {
    const p = PAIRS[k], row = packRow(p, PAIR_FIELDS);
    row.k = k;
    if (p.deals && p.deals.length) row.d = p.deals.map(d => packRow(d, DEAL_FIELDS));
    return row;
  });
}
function unpackPairs(rows) {
  for (const k in PAIRS) delete PAIRS[k];
  for (const row of (rows || [])) {
    if (!row || !row.k) continue;
    const p = unpackRow(row, PAIR_FIELDS);
    p.deals = (row.d || []).map(d => unpackRow(d, DEAL_FIELDS));
    PAIRS[row.k] = p;
  }
  touchPairs();
}
/* The world block, table-driven like the country one: a new world
   field is one row here.  [key, short name in the save, default]; the
   seed rides beside them because newWorld needs it before anything is
   unpacked.  A saved value of the wrong shape falls back to the default. */
const WORLD_FIELDS = [
  ["day", "day", 0], ["wars", "wars", []], ["warSeq", "warSeq", 0], ["diffusions", "diffusions", []],
  ["massive", "massive", {}], ["log", "log", []], ["market", "market", null],
];
const fresh = d => Array.isArray(d) ? [] : (d && typeof d === "object") ? {} : d;
function packWorld() {
  const o = { seed: WORLD_STATE.seed };
  for (const [k, sh] of WORLD_FIELDS) o[sh] = WORLD_STATE[k];
  return o;
}
function unpackWorld(o) {
  if (!o) return;
  for (const [k, sh, d] of WORLD_FIELDS) {
    const v = o[sh];
    const shapeOk = v != null && (Array.isArray(d) ? Array.isArray(v) : (d && typeof d === "object") ? typeof v === "object" : d === null ? typeof v === "object" : typeof v === typeof d);
    WORLD_STATE[k] = shapeOk ? v : fresh(d);
  }
  WORLD_STATE.day |= 0; WORLD_STATE.warSeq |= 0;
  WORLD_STATE.log = WORLD_STATE.log.slice(-(cfg().logCap || 200));
  acc = 0;
  window.dispatchEvent(new CustomEvent("entity:world", { detail: { seed: WORLD_STATE.seed } }));
}

window.WORLD = { ownForce,
  COUNTRY_STATE, WORLD_STATE, COUNTRY_FIELDS, WORLD_FIELDS, PAIR_FIELDS, DEAL_FIELDS, PAIRS, isAgent,
  pairOf, pairAt, relOf, shiftRel, rippleRel, pairCounts, touchPairs, dealing, get pairsVersion() { return pairsVersion; }, warsOf, atWar, frontsOf, fighting, warBetween, nameOf, log,
  dealsOf, addDeal, dropDeals, dealsTick, partnerCapOf, shareTech, distKm, posOf, relaxRelations, restingRel, climateOf, oscillation,
  supplyOf, floorOf, meanRes, ecoIndexOf, ecoClamped, incomeLine, driftTargetsOf, sampleSeries,
  force, popCap, inertia, areaOf, startNeed, seedPotential,
  packPairs, unpackPairs,
  blankState, ensureCountry, newWorld, resetCountries,
  regionMembers, regionAgg, globalResponse, anyCovered,
  onWorldMapReady, installMapSync, syncMapColors, spreadTick, responseTick, updateResponseBar,
  dayTick, advanceDays, fmtDate,
  packCountry, unpackCountry, packAll, unpackAll, packWorld, unpackWorld,
  get day() { return WORLD_STATE.day; },
  get seed() { return WORLD_STATE.seed; },
  get worldMap() { return worldMap; },
  get topologyReady() { return topologyReady; },
  get neighbourEdges() { return neighbourEdges; },
};

newWorld();
setInterval(tickClock, 50);
})();
