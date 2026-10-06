/* ═══════════════════════════════════════════════════════════════
   Entity — world
   Owner of per-country state and the world clock.  A country on the
   map carries an outbreak record (whether a variant covers it, how
   far, which profile) plus whatever fields the pillars add.  The
   pillars (docs/design.md §10) are the modules that run a nation's
   day: each registers here, is run in a published order, draws from
   its own random stream, and writes what it did to the nation's
   ledger, which the card, the wire and the census read.
   Deploying a variant (js/worldui.js) marks a country covered;
   spread and response are a pillar still to be built.
   The clock turns real seconds into in-game days at the bench's speed
   and dispatches entity:day.  The map hand-off (names, shapes,
   borders), the regions, the dated news log and the save pack tables
   live here too.
   Reads window.ENTITY_CONFIG only inside functions that run after
   load: shell.js defines it and loads after this file.
   ═══════════════════════════════════════════════════════════════ */
(() => {
"use strict";
const { COUNTRY_REGION, REGION_NAME, REGION_ENV, popOf } = window.GEO;
const cfg = () => window.ENTITY_CONFIG;
const clone = d => (d == null || typeof d !== "object") ? d : JSON.parse(JSON.stringify(d));

/* ── State ──────────────────────────────────────────────────────── */
const COUNTRY_STATE = Object.create(null);
const WORLD_STATE = { seed: 0, day: 0, log: [] };

const isAgent = iso => window.DATA.isAgent(iso);           // a peopled row: scenery has no state
const OUTBREAK_BLANK = () => ({ covered: false, coverageLevel: 0, profile: null });
/* A fresh state: the outbreak record, then every registered pillar's
   fields at their defaults and its seed hook. */
function blankState(iso) {
  const s = OUTBREAK_BLANK();
  for (const p of pillarList()) seedPillar(p, iso, s);
  return s;
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
/* A fresh world: new seed, day 0, every known country clean and
   re-seeded, the ledgers and their history emptied.  Called at load,
   on New game, and before a save is unpacked over it. */
function newWorld(seed) {
  WORLD_STATE.seed = (seed == null ? (Math.random() * 4294967296) : seed) >>> 0;
  WORLD_STATE.day = 0;
  WORLD_STATE.log = [];
  for (const [k, , d] of WORLD_FIELDS) if (k !== "day" && k !== "log") WORLD_STATE[k] = clone(d);   // the pillars' world fields
  for (const iso in COUNTRY_STATE) delete COUNTRY_STATE[iso];
  for (const iso in LEDGER) delete LEDGER[iso];
  for (const iso in HIST) delete HIST[iso];
  WORLD_LEDGER = null;
  for (const iso in COUNTRY_REGION) if (isAgent(iso)) COUNTRY_STATE[iso] = blankState(iso);
  if (worldMap) { blankStatesFor(worldMap.countries); pruneToMap(); }
  rebuildLinks();
  acc = 0;
  syncMapColors();
  window.dispatchEvent(new CustomEvent("entity:world", { detail: { seed: WORLD_STATE.seed } }));
}
/* Zero the outbreak in place.  map.js's sync closure and progression.js
   hold the COUNTRY_STATE object, so it is never reassigned. */
function resetCountries() {
  for (const iso in COUNTRY_STATE) Object.assign(COUNTRY_STATE[iso], OUTBREAK_BLANK());
}
function anyCovered() {
  for (const iso in COUNTRY_STATE) if (COUNTRY_STATE[iso].covered) return true;
  return false;
}

/* Display names come from the map catalogue; ISO until it loads. */
const names = Object.create(null);
const nameOf = iso => names[iso] || iso;

/* The world log: dated headlines, capped.  { sev, kind, iso, iso2?, text }
   The wire (js/wire.js) shows whatever arrives. */
function log(entry) {
  const e = Object.assign({ d: WORLD_STATE.day }, entry);
  WORLD_STATE.log.push(e);
  const cap = (cfg() && cfg().logCap) || 200;
  if (WORLD_STATE.log.length > cap) WORLD_STATE.log.splice(0, WORLD_STATE.log.length - cap);
  window.dispatchEvent(new CustomEvent("entity:news", { detail: e }));
  return e;
}

/* ── Random streams ──────────────────────────────────────────────
   Every draw of a day comes from a stream seeded by the world seed,
   the day and the pillar's slot, so a census repeats and adding a
   pillar leaves the others' draws alone.  Seeding a state draws from
   the world seed and the country code. */
function hash32(a, b, c) {
  let h = ((a >>> 0) ^ 0x9E3779B9) >>> 0;
  h = Math.imul(h ^ (b >>> 0), 0x85EBCA6B) >>> 0; h ^= h >>> 13;
  h = Math.imul(h ^ (c >>> 0), 0xC2B2AE35) >>> 0; h ^= h >>> 16;
  return h >>> 0;
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const dayRng = slot => C.mulberry32(hash32(WORLD_STATE.seed, WORLD_STATE.day, (slot | 0) + 1));
const seedRng = iso => C.mulberry32(hash32(WORLD_STATE.seed, hashStr(String(iso)), 0));

/* ── Pillars ──────────────────────────────────────────────────────
   A pillar registers once, after this file and before shell.js:
     WORLD.registerPillar({
       name,                 one of ORDER: the slot it runs in
       label,                what the card and the config panel call it
       fields,               [[key, short, default], ...]: rows joined to
                             the country pack table, defaults on a fresh state
       seed(iso, s, rng),    fill a fresh state from the data row
       dailyWorld(rng, LW),  a step over the whole world, before daily
       daily(iso, rng, L),   the nation's day: write lines to its ledger
       rows(iso, L),         card rows [[label, value, note?], ...]
       census(iso, s, L),    numbers for the nation's census line
       censusWorld(LW),      numbers for the world's census line
       config: { group, defaults: {key: value}, rows: [[key, label, unit]] }
     })
   Every hook is optional.  An empty slot is skipped. */
const ORDER = ["weather", "economy", "trade", "health", "relations", "war"];
const pillars = Object.create(null);
function registerPillar(p) {
  if (!p || !ORDER.includes(p.name)) throw new Error("a pillar's name must be one of " + ORDER.join(", "));
  pillars[p.name] = p;
  for (const row of (p.fields || [])) addCountryField(row);
  for (const row of (p.worldFields || [])) addWorldField(row);
  for (const iso in COUNTRY_STATE) seedPillar(p, iso, COUNTRY_STATE[iso]);   // states made before it arrived
  return p;
}
function unregisterPillar(name) { delete pillars[name]; }                   // for tests
const pillarList = () => ORDER.filter(n => pillars[n]).map(n => pillars[n]);
function seedPillar(p, iso, s) {
  for (const [k, , d] of (p.fields || [])) if (s[k] === undefined) s[k] = clone(d);
  if (p.seed) p.seed(iso, s, seedRng(iso));
}

/* ── The ledger: what happened to a nation today ─────────────────
   One per nation and one for the world, reset at the start of every
   day.  A line is { pillar, key, label, value, unit, reason }; the
   same key may be added more than once and sums.  The last
   HISTORY_DAYS of daily sums per key are kept in memory, not saved. */
const LEDGER = Object.create(null);          // iso -> today's ledger
let WORLD_LEDGER = null;
const HISTORY_DAYS = 90;
const HIST = Object.create(null);            // iso ("" for the world) -> key -> ring
function newLedger(day, iso) {
  const lines = [], sums = Object.create(null);
  return {
    day, iso, lines, sums,
    add(pillar, key, label, value, unit, reason) {
      const v = +value || 0;
      lines.push({ pillar, key, label, value: v, unit: unit || "", reason: reason || "" });
      sums[key] = (sums[key] || 0) + v;
      return v;
    },
    get(key) { return sums[key] || 0; },
    of(pillar) { return lines.filter(l => l.pillar === pillar); },
  };
}
function ledgerOf(iso) {
  const L = LEDGER[iso];
  return (L && L.day === WORLD_STATE.day) ? L : (LEDGER[iso] = newLedger(WORLD_STATE.day, iso));
}
function worldLedger() {
  return (WORLD_LEDGER && WORLD_LEDGER.day === WORLD_STATE.day) ? WORLD_LEDGER : (WORLD_LEDGER = newLedger(WORLD_STATE.day, ""));
}
function pushHistory(iso, L) {
  const h = HIST[iso] || (HIST[iso] = Object.create(null));
  for (const key in L.sums) if (!h[key]) h[key] = { buf: new Float64Array(HISTORY_DAYS), n: 0, i: 0 };
  for (const key in h) {                     // every key this nation has ever written advances, so the rings stay aligned
    const r = h[key];
    r.buf[r.i] = L.sums[key] || 0; r.i = (r.i + 1) % HISTORY_DAYS; if (r.n < HISTORY_DAYS) r.n++;
  }
}
function closeLedgers() {
  for (const iso in LEDGER) if (LEDGER[iso].day === WORLD_STATE.day) pushHistory(iso, LEDGER[iso]);
  if (WORLD_LEDGER && WORLD_LEDGER.day === WORLD_STATE.day) pushHistory("", WORLD_LEDGER);
}
/* The last n daily sums of a key, oldest first; "" for the world. */
function history(iso, key, n) {
  const r = HIST[iso] && HIST[iso][key]; if (!r) return [];
  const take = Math.min(r.n, n || HISTORY_DAYS), out = new Array(take);
  for (let k = 0; k < take; k++) out[k] = r.buf[(r.i - take + k + HISTORY_DAYS) % HISTORY_DAYS];
  return out;
}

/* ── Census: one line per nation and one for the world ──────────── */
function censusOf(iso) {
  const s = COUNTRY_STATE[iso], L = ledgerOf(iso);
  const out = { iso, name: nameOf(iso), pop: popOf(iso), covered: !!(s && s.covered) };
  for (const p of pillarList()) if (p.census) Object.assign(out, p.census(iso, s, L));
  return out;
}
function censusWorld() {
  let n = 0, covered = 0, pop = 0;
  for (const iso in COUNTRY_STATE) { n++; pop += popOf(iso); if (COUNTRY_STATE[iso].covered) covered++; }
  const out = { day: WORLD_STATE.day, seed: WORLD_STATE.seed, nations: n, population: Math.round(pop), covered };
  for (const p of pillarList()) if (p.censusWorld) Object.assign(out, p.censusWorld(worldLedger()));
  return out;
}

/* ── Regions and aggregates ─────────────────────────────────────── */
function regionMembers(id) {
  const out = [];
  for (const iso in COUNTRY_REGION) if (COUNTRY_REGION[iso] === id) out.push(iso);
  return out;
}
function regionAgg(id) {
  const members = regionMembers(id);
  let nCovered = 0, sumCov = 0, pop = 0;
  for (const iso of members) {
    pop += popOf(iso);
    const s = COUNTRY_STATE[iso];
    if (s && s.covered) { nCovered++; sumCov += s.coverageLevel; }
  }
  return {
    id, name: REGION_NAME[id], env: REGION_ENV[id], population: pop,
    countries: members.length, covered: nCovered,
    coverageLevel: nCovered ? sumCov / nCovered : 0,
  };
}

/* ── Map hand-off: the link graph is built from it (js/links.js) ── */
let worldMap = null, lastGeo = null;
let neighbourEdges = [];        // land links, for whoever wants a neighbour list
let mapSync = null;
let topologyReady = false;

function rebuildLinks() {
  if (!lastGeo || !window.LINKS) return;
  try {
    window.LINKS.rebuild(lastGeo);
    neighbourEdges = window.LINKS.edges.filter(e => e.type === "land").map(e => ({ a: e.a, b: e.b, w: 1 }));
    topologyReady = true;
  } catch (e) { console.error("links:", e); }
}
function onWorldMapReady(wm, geo) {
  dbg("[Entity world] onWorldMapReady:", wm && wm.countries ? wm.countries.length : "?");
  worldMap = wm; lastGeo = geo;
  for (const c of wm.countries) if (c.iso2 && c.name) names[c.iso2] = c.name;
  blankStatesFor(wm.countries);
  pruneToMap();
  rebuildLinks();
  if (typeof mapSync === "function") mapSync();
}
function installMapSync(fn) { mapSync = fn; if (typeof fn === "function") fn(); }
function syncMapColors() { if (typeof mapSync === "function") mapSync(); }

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
/* One day: fresh ledgers, then every pillar in ORDER with its own
   stream (a world step first, then each nation), then the ledgers
   close into the history and entity:day goes out. */
function dayTick() {
  WORLD_STATE.day++;
  const day = WORLD_STATE.day;
  for (const iso in LEDGER) delete LEDGER[iso];
  WORLD_LEDGER = null;
  for (let k = 0; k < ORDER.length; k++) {
    const p = pillars[ORDER[k]]; if (!p) continue;
    const rng = dayRng(k);
    if (p.dailyWorld) p.dailyWorld(rng, worldLedger());
    if (p.daily) for (const iso in COUNTRY_STATE) p.daily(iso, rng, ledgerOf(iso));
  }
  closeLedgers();
  window.dispatchEvent(new CustomEvent("entity:day", { detail: { day, date: fmtDate(day) } }));
}

/* ── Persistence ────────────────────────────────────────────────
   One table drives both directions.  A new field is one row here or
   one row in a pillar's `fields`; the smoke test's save round-trip
   fails if a field is written but not listed.  [key, short name in
   the save, default]. */
const COUNTRY_FIELDS = [
  ["covered", "c", false], ["coverageLevel", "lv", 0], ["profile", "pr", null],
];
function addCountryField(row) {
  const [key, sh] = row;
  if (COUNTRY_FIELDS.some(f => f[0] === key || f[1] === sh)) return;
  COUNTRY_FIELDS.push([key, sh, row[2] === undefined ? null : row[2]]);
}
function packCountry(s) {
  const o = {};
  for (const [k, sh] of COUNTRY_FIELDS) {
    let v = s[k];
    if (k === "covered") v = v ? 1 : 0;
    o[sh] = v === undefined ? null : v;
  }
  return o;
}
function unpackCountry(o, s) {
  for (const [k, sh, d] of COUNTRY_FIELDS) {
    let v = o[sh];
    if (v === undefined) v = clone(d);
    if (k === "covered") s.covered = !!v;
    else if (k === "coverageLevel") s.coverageLevel = Math.max(0, Math.min(1, +v || 0));
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
  for (const iso in obj) if (isAgent(iso)) unpackCountry(obj[iso], ensureCountry(iso));
  pruneToMap();
}
/* The world block, table-driven like the country one.  The seed rides
   beside the fields because newWorld needs it before anything is
   unpacked.  A saved value of the wrong shape falls back to the default. */
const WORLD_FIELDS = [["day", "day", 0], ["log", "log", []]];
function addWorldField(row) {
  const [key, sh] = row;
  if (WORLD_FIELDS.some(f => f[0] === key || f[1] === sh)) return;
  const d = row[2] === undefined ? null : row[2];
  WORLD_FIELDS.push([key, sh, d]);
  if (WORLD_STATE[key] === undefined) WORLD_STATE[key] = clone(d);
}
function packWorld() {
  const o = { seed: WORLD_STATE.seed };
  for (const [k, sh] of WORLD_FIELDS) o[sh] = WORLD_STATE[k];
  return o;
}
function unpackWorld(o) {
  if (!o) return;
  for (const [k, sh, d] of WORLD_FIELDS) {
    const v = o[sh];
    const shapeOk = v != null && (Array.isArray(d) ? Array.isArray(v) : typeof v === typeof d);
    WORLD_STATE[k] = shapeOk ? v : clone(d);
  }
  WORLD_STATE.day |= 0;
  WORLD_STATE.log = WORLD_STATE.log.slice(-((cfg() && cfg().logCap) || 200));
  acc = 0;
  window.dispatchEvent(new CustomEvent("entity:world", { detail: { seed: WORLD_STATE.seed } }));
}

window.WORLD = {
  COUNTRY_STATE, WORLD_STATE, COUNTRY_FIELDS, WORLD_FIELDS, isAgent, nameOf, log,
  blankState, ensureCountry, newWorld, resetCountries, anyCovered,
  ORDER, registerPillar, unregisterPillar, pillarList, addCountryField, addWorldField,
  ledgerOf, worldLedger, history, HISTORY_DAYS, dayRng, seedRng,
  censusOf, censusWorld,
  regionMembers, regionAgg,
  onWorldMapReady, installMapSync, syncMapColors,
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
