/* ═══════════════════════════════════════════════════════════════
   Entity — world
   Owner of per-country state and the world clock.  A country on the
   map carries an outbreak record: whether a variant covers it, how
   far, and which profile.  Deploying a variant (js/worldui.js) marks a
   country covered; nothing on the map moves by itself yet - how a
   variant spreads, is noticed and is answered is being redesigned,
   and the links (js/links.js) are what it will travel along.
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

/* ── State ──────────────────────────────────────────────────────── */
const COUNTRY_STATE = Object.create(null);
const WORLD_STATE = { seed: 0, day: 0, log: [] };

const isAgent = iso => window.DATA.isAgent(iso);           // a peopled row: scenery has no state
const OUTBREAK_BLANK = () => ({ covered: false, coverageLevel: 0, profile: null });
function blankState(iso) { return OUTBREAK_BLANK(); }
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
/* A fresh world: new seed, day 0, every known country clean.  Called at
   load, on New game, and before a save is unpacked over it. */
function newWorld(seed) {
  WORLD_STATE.seed = (seed == null ? (Math.random() * 4294967296) : seed) >>> 0;
  WORLD_STATE.day = 0;
  WORLD_STATE.log = [];
  for (const iso in COUNTRY_STATE) delete COUNTRY_STATE[iso];
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
   Nothing writes to it yet; the wire (js/wire.js) shows whatever arrives. */
function log(entry) {
  const e = Object.assign({ d: WORLD_STATE.day }, entry);
  WORLD_STATE.log.push(e);
  const cap = (cfg() && cfg().logCap) || 200;
  if (WORLD_STATE.log.length > cap) WORLD_STATE.log.splice(0, WORLD_STATE.log.length - cap);
  window.dispatchEvent(new CustomEvent("entity:news", { detail: e }));
  return e;
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
/* One day.  Nothing changes on the map yet: the day count and the
   calendar move, and anything that wants a daily cadence listens here. */
function dayTick() {
  WORLD_STATE.day++;
  window.dispatchEvent(new CustomEvent("entity:day", { detail: { day: WORLD_STATE.day, date: fmtDate(WORLD_STATE.day) } }));
}

/* ── Persistence ────────────────────────────────────────────────
   One table drives both directions.  A new field is one row here; the
   smoke test's save round-trip fails if a field is written but not
   listed.  [key, short name in the save, default]. */
const COUNTRY_FIELDS = [
  ["covered", "c", false], ["coverageLevel", "lv", 0], ["profile", "pr", null],
];
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
    if (v === undefined) v = d;
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
    const shapeOk = v != null && (Array.isArray(d) ? Array.isArray(v) : typeof v === typeof d);
    WORLD_STATE[k] = shapeOk ? v : fresh(d);
  }
  WORLD_STATE.day |= 0;
  WORLD_STATE.log = WORLD_STATE.log.slice(-((cfg() && cfg().logCap) || 200));
  acc = 0;
  window.dispatchEvent(new CustomEvent("entity:world", { detail: { seed: WORLD_STATE.seed } }));
}

window.WORLD = {
  COUNTRY_STATE, WORLD_STATE, COUNTRY_FIELDS, WORLD_FIELDS, isAgent, nameOf, log,
  blankState, ensureCountry, newWorld, resetCountries, anyCovered,
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
