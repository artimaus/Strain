/* ═══════════════════════════════════════════════════════════════
   Entity — countries: seed data and pure country functions
   What a country starts as and where its stats drift to.  Pure data
   and pure functions: nothing here touches state, the page or the
   clock.  world.js calls initStats when it builds a world and
   driftTargets every day; the tables beside SEED (mountain ranges,
   rivalries, resource endowments) are read by links, decide and
   events.

   Stats are 0..100.  Every country starts from its row in js/data.js
   (hand-set impressions, one per code on the map); the six levels and
   the three government axes get a little seeded noise, so no two worlds
   are identical but the same seed always gives the same one.

   Resources come in four types — energy, materials, food, water — and a
   country's native endowment of each is fixed here.  What it can
   actually draw on (its supply: native plus trade, occupation, weather
   and desalination) is computed in world.js; the lowest of the four is
   the "resources" reading on the screen and caps the economy.
   ═══════════════════════════════════════════════════════════════ */
(() => {
"use strict";
const { COUNTRY_REGION, popOf } = window.GEO;

/* The six stats a country holds as levels 0..100.  The economy is not one
   of them: it is output per head, unbounded, read as an index; and
   "resources" is the worst supply balance, read from the economy pass. */
const STAT_KEYS = ["infra", "military", "academia", "medical", "stability", "technology"];
const SEED_COL = { infra: 0, economy: 1, military: 2, academia: 3, medical: 4, stability: 5, technology: 6 };   // the order the save packs the levels in
/* The economy index: 50 at ecoIndexRef output per head, ecoIndexSlope more
   per doubling, unbounded above 100 (the bars clamp for display, the
   readers do not).  Takes the config, or falls back to 50 and 30. */
const ecoIndex = (output, c) => Math.max(0, 50 + ((c && c.ecoIndexSlope) || 30) * Math.log2(Math.max(1e-6, output) / ((c && c.ecoIndexRef) || 50)));
/* How much of its own starting need an endowment yields, before the world's scale and its access: convex, so the
   difference between a rich seam and a thin one is wider than the numbers suggest and a great exporter is great.
   The seeder and the discovery event both read this one function; they must agree or the world opens off balance. */
const resShare = (res, c) => Math.pow(Math.max(0, res) / 100, c.resCurve);
/* What a technology level costs to keep running, in energy a day: the laboratories, the networks, the
   machines.  Convex (techEnergyCurve), so a frontier is a commitment a country must be able to power and
   a poor country's few laboratories are cheap.  The economy pass and the world's seeder both read this
   one function: the day-0 world energy balance is an identity that only holds while they agree. */
const techEnergyOf = (tech, pop, c) => c.needEnergyTech * Math.max(0, pop) * Math.pow(Math.max(0, tech) / 100, c.techEnergyCurve);
const RES_KEYS  = ["energy", "materials", "food", "water"];
const SEED_NOISE = 5;     // +-5 of seeded noise on the six levels and the three axes

/* Political freedom and government type when a row does not say (the
   region fallback only): economic openness less what a heavy hand takes
   away, and a type read off that. */
function derivedFreedom(authority, openness) { return clamp(openness - 0.7 * Math.max(0, authority - 45), 3, 97); }
/* How much harder each step of technology is near the top: a step at 90
   is worth a fifth of one at 10.  Research, discoveries and diffusion all
   read it. */
const frontier = tech => Math.max(0.1, 1.1 - tech / 100);
function derivedType(authority, freedom) { return freedom >= 40 ? "elected" : authority >= 65 ? "party" : "military"; }

/* ── Terrain and micro-states ────────────────────────────────────
   Land-border capacity multiplier where a range lies along the border
   (1 = open plain).  Keys are ISO pairs in alphabetical order.  The
   same table makes a mountain border easier to defend (decide.js). */
const RANGE_CAP = {
  "CN|IN": .1, "CN|NP": .15, "BT|CN": .1, "IN|NP": .5,          // Himalaya
  "CN|PK": .15, "AF|PK": .4, "CN|KG": .3, "CN|TJ": .2,           // Karakoram, Hindu Kush, Tian Shan, Pamir
  "AR|CL": .35, "BO|CL": .4, "BR|PE": .5, "CO|VE": .6,           // Andes
  "CH|IT": .5, "AT|IT": .5, "FR|IT": .5, "ES|FR": .4,            // Alps, Pyrenees
  "GE|RU": .3, "AZ|RU": .4, "IQ|IR": .5, "IR|TR": .5,            // Caucasus, Zagros
  "DZ|MA": .6, "PL|SK": .6, "RO|UA": .6, "BG|GR": .7,            // Atlas, Tatra, Carpathians, Rhodope
  "MM|TH": .5, "IN|MM": .4, "CN|MM": .4, "NO|SE": .7, "ER|ET": .6, "GT|MX": .7,
};
/* Dot-marker micro-states have no shape on the map, so their land borders
   are listed; the rest are islands with a small port. */
const MICRO_LAND = ["IT|VA", "IT|SM", "CH|LI", "AT|LI", "AD|FR", "AD|ES", "FR|MC"];
const MICRO_LANDLOCKED = new Set(["VA", "SM", "LI", "AD"]);
/* Land area in km² for the dot markers, which have no shape to measure. */
const MICRO_AREA = { VA: 0.5, MC: 2, SM: 61, LI: 160, AD: 468, MT: 316, SG: 730, BH: 780, MV: 300, NR: 21, TV: 26, MH: 181,
  PW: 459, FM: 702, KI: 811, TO: 747, WS: 2842, SC: 455, MU: 2040, KM: 1862, ST: 964, CV: 4033, BB: 430, GD: 344,
  LC: 616, VC: 389, AG: 442, KN: 261, DM: 751, BN: 5765 };

/* Opening relations for the pairs everyone knows; everything else starts
   from a computed baseline.  Keys in alphabetical order, -100..100.
   Pairs at 50 or better also start the world with a trade deal. */
const RIVALRIES = {
  "CN|US": -40, "IN|PK": -70, "RU|UA": -80, "KP|KR": -90, "IL|IR": -85, "GR|TR": -40, "AM|AZ": -75,
  "KP|US": -80, "IR|US": -75, "IR|SA": -70, "RU|US": -60, "CN|TW": -80, "CN|IN": -45, "CN|JP": -35,
  "RU|GB": -55, "RU|PL": -60, "CU|US": -50, "US|VE": -55, "EG|ET": -40, "MA|DZ": -50, "AF|PK": -35,
  "CA|US": 80, "GB|US": 80, "AU|US": 75, "JP|US": 70, "KR|US": 70, "DE|FR": 75, "FR|GB": 60,
  "AU|NZ": 85, "BR|AR": 45, "CN|RU": 50, "CN|PK": 55, "IN|RU": 45, "SA|AE": 60, "DE|PL": 40,
  "ES|PT": 65, "NO|SE": 80, "DK|SE": 75, "FI|SE": 80, "IL|US": 75, "BE|NL": 75, "AT|DE": 65,
};

/* ── Hashing: the only source of per-country randomness ─────────
   FNV-1a over the parts with a final avalanche.  Same inputs, same
   32-bit result, in every browser. */
function hash32(...parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  }
  return h >>> 0;
}
const unit  = (seed, ...tags) => hash32(seed, ...tags) / 4294967296;      // 0..1
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

/* ── Initial state of one country ─────────────────────────────── */
function initStats(iso, seed) {
  const row = window.DATA.rowOf(iso), region = row.region, pop = row.pop;
  const n = key => (unit(seed, iso, "n:" + key) - 0.5) * 2 * SEED_NOISE;
  const st = {};
  STAT_KEYS.forEach(k => { st[k] = clamp(row.st[k] + n(k), 1, 99); });
  const authority = clamp(row.authority + n("authority"), 1, 99), freedom = clamp(row.freedom + n("freedom"), 1, 99), econOpen = clamp(row.openness + n("openness"), 1, 99);
  const type = row.type || derivedType(authority, freedom);
  return {
    st, res: row.res.slice(),                              // res: native endowment per RES_KEYS, relative to need
    potential: null,                                       // absolute potential per type, set once by world.js
    area: MICRO_AREA[iso] || null,                         // km²: the map fills shapes in; null until then
    urban: row.urban,
    treasury: Math.round(row.economy * 2),                 // two months of income, roughly (world.js sets the real figure)
    // government: the nation's base, and a regime of zero modifiers on it (js/gov.js keeps the effective axes in step)
    base: { authority, freedom, econOpen },
    regime: { type, since: 0, mods: { authority: 0, freedom: 0, econOpen: 0 } },
    authority, freedom, econOpen,
    legit: null, defeatUntil: 0, disgraceUntil: 0, techRev: false,
    pop,
    border: 0,
    decisionDay: hash32(seed, iso, "day") % 28,
    nextElection: null,
    occupiedBy: null, occupiedUntil: 0,
    crisisDays: 0, breakthroughUntil: 0,
    weary: 0,                                              // war weariness 0..100; see decide.js
    ration: 0, drain: null, cover: null, boom: 0, bustUntil: 0,                    // the granary's signal and the regime's answer (economy.js people())
    dryUntil: 0, wetUntil: 0,                              // a drought or flood still biting (events.js)
    series: [], hist: [],                                  // monthly samples, last decisions (the country screen)
    output: row.economy, pop0: null, stock: null, projects: [], upkeepPlan: null,   // output per head starts at the row; the economy fills the rest in
    outPrev: 0, lastReport: 0, broke: false,
    last: null,
  };
}

/* Fixed personality, derived (never saved): how eager to fight, to hoard,
   to research, to close up.  0..1 each. */
function temperament(iso, seed) {
  return {
    aggr:    unit(seed, iso, "aggr"),
    thrift:  unit(seed, iso, "thrift"),
    science: unit(seed, iso, "science"),
    caution: unit(seed, iso, "caution"),
  };
}

/* ── Weather ─────────────────────────────────────────────────────
   A per-country rainfall anomaly in -1..1 (dry .. wet), one value per
   year from the seed, blended into the next year's by day-of-year so it
   moves smoothly.  Pure: the same seed, country and day always give the
   same weather.  world.js applies it to food and water supply; events.js
   tilts droughts toward dry years and floods toward wet ones. */
/* ── Climate ──────────────────────────────────────────────────────
   Every country sits in a climate zone that shifts the region's
   temperature and humidity, says how it answers the world's multi-year
   oscillation (wet where the monsoon strengthens, dry across the arid
   belt in the same year), and weights its hazards: wildfire, dust,
   storms, floods, drought.  Every row in js/data.js names its zone; the
   region's zone stands in for a code with no row. */
const ZONE = {
  temperate:     { dT: 0,   dH: 0,   osc: 0.2,  fire: 0.6, dust: 0.1, storm: 0.6, flood: 1.0, drought: 0.8 },
  arid:          { dT: 8,   dH: -35, osc: -0.5, fire: 0.3, dust: 1.5, storm: 0.2, flood: 0.3, drought: 1.6 },
  monsoon:       { dT: 6,   dH: 20,  osc: 0.7,  fire: 0.3, dust: 0.2, storm: 1.6, flood: 1.8, drought: 0.9 },
  tropical:      { dT: 6,   dH: 15,  osc: 0.4,  fire: 0.8, dust: 0.1, storm: 1.2, flood: 1.3, drought: 0.6 },
  boreal:        { dT: -12, dH: 5,   osc: 0.1,  fire: 1.2, dust: 0,   storm: 0.4, flood: 0.6, drought: 0.4 },
  highland:      { dT: -6,  dH: 0,   osc: 0.3,  fire: 0.5, dust: 0.3, storm: 0.3, flood: 0.9, drought: 0.8 },
  mediterranean: { dT: 3,   dH: -10, osc: -0.3, fire: 1.4, dust: 0.4, storm: 0.5, flood: 0.7, drought: 1.2 },
};
const REGION_ZONE = { north_america: "temperate", south_america: "tropical", europe: "temperate", africa: "tropical", asia: "temperate", oceania: "tropical" };
function zoneOf(iso) { const z = window.DATA.zoneOf(iso); return z && ZONE[z] ? z : (REGION_ZONE[COUNTRY_REGION[iso]] || "temperate"); }
function climateOf(iso) {
  const { REGION_ENV } = window.GEO, env = REGION_ENV[COUNTRY_REGION[iso]] || REGION_ENV.asia, zone = zoneOf(iso), z = ZONE[zone];
  return { temp: env.temp + z.dT, humidity: clamp(env.humidity + z.dH, 5, 100), urban: Math.round(window.DATA.rowOf(iso).urban * 100), zone };
}
/* The world's oscillation: a slow cycle of three to seven years with a
   seeded phase and a little noise, in -1..1.  Zones read it with their
   own sign. */
function oscillation(seed, year) {
  const period = 3 + 4 * unit(seed, "__osc", "period"), phase = 2 * Math.PI * unit(seed, "__osc", "phase");
  const v = 0.8 * Math.sin(2 * Math.PI * year / period + phase) + 0.4 * (2 * unit(seed, "__osc", "y", year) - 1);
  return clamp(v, -1, 1);
}
const WX_REGION = 0.35, WX_LOCAL = 0.35;                   // how much of a year's weather is shared with the region, and how much is the country's own
function yearAnomaly(iso, seed, year) {
  const z = ZONE[zoneOf(iso)], region = COUNTRY_REGION[iso] || "asia";
  return clamp(z.osc * oscillation(seed, year) + WX_REGION * (2 * unit(seed, "__wx_" + region, "y", year) - 1) + WX_LOCAL * (2 * unit(seed, iso, "wx", year) - 1), -1, 1);
}
/* A per-country rainfall anomaly in -1..1 (dry .. wet): the zone's answer
   to the oscillation, the region's shared year and the country's own,
   blended into the next year by day-of-year so it moves smoothly.  Pure:
   the same seed, country and day always give the same weather. */
function weatherAnomaly(iso, seed, day) {
  const year = Math.floor(day / 365), t = (day - year * 365) / 365;
  const a0 = yearAnomaly(iso, seed, year), a1 = yearAnomaly(iso, seed, year + 1);
  return a0 + (a1 - a0) * t;
}

/* ── Where the drifting stats are heading ────────────────────────
   Only academia, technology and stability drift now: the economy grows
   in js/economy.js, and infrastructure, the army and the hospitals are
   built by projects and decay when their upkeep goes unpaid.  ctx:
   { cfg, war, occupied, coverage, floor (the binding balance 0..100),
     broke, sanctions }.  Resources is the binding balance, written by
   world.js. */
/* Coercion: how far a regime can hold the street by force -- authority above a floor (the will), times the army (the
   means; even a small one puts down an unarmed street, so the army counts from coerceMilFloor up). */
function coercion(s, c) {
  c = c || window.ENTITY_CONFIG;
  const auth = s.authority != null ? s.authority : 50, mil = s.st ? s.st.military : 0;
  return Math.max(0, auth - c.coerceFloor) / Math.max(1, 100 - c.coerceFloor) * (c.coerceMilFloor + (1 - c.coerceMilFloor) * mil / 100);
}
function driftTargets(s, ctx) {
  const c = ctx.cfg, st = s.st;
  const war = ctx.war ? 1 : 0;
  const legit = s.legit != null ? s.legit : 60;          // how well the regime fits and performs (js/gov.js)
  const freedom = s.freedom != null ? s.freedom : s.econOpen;
  return {
    academia:   .5 * ctx.eco + .15 * s.econOpen + .15 * freedom + .2 * st.technology,
    technology: st.academia,                              // know-how settles where the universities are; research, deals, war and diffusion lift it above
    stability:  .4 * ctx.eco + .2 * st.infra + .2 * st.medical + .2 * legit + c.coerceStab * coercion(s, c)
                - war * c.warStab - (ctx.occupied ? c.occupiedStab : 0) - ctx.coverage * c.outbreakStabDrag - c.sanctionStab * Math.min(1, (ctx.sanctions || 0) / c.sanctionRef)
                - (s.weary || 0) * c.wearyStab - c.debtStab * (ctx.debt || 0) - (s.famine || 0) * c.famineStab
                - (s.ration || 0) / c.rationMax * c.rationStab - (ctx.busted ? c.bustStab : 0),
  };
}

window.COUNTRIES = { STAT_KEYS, SEED_COL, ecoIndex, techEnergyOf, resShare, RES_KEYS, RANGE_CAP, MICRO_LAND, MICRO_LANDLOCKED, MICRO_AREA, RIVALRIES, derivedFreedom, derivedType,
                     hash32, unit, clamp, initStats, temperament, weatherAnomaly, driftTargets, coercion,
                     ZONE, zoneOf, climateOf, oscillation, frontier };
})();
