/* ═══════════════════════════════════════════════════════════════
   Entity — links: how countries connect
   Three kinds of link.  Land borders come from the map (countries
   whose shapes share an edge; a curated table in js/geo.js cuts
   capacity where a mountain range lies along one).  Sea links join
   coastal countries to their nearest coastal neighbours.  Air links
   join every country to the partners its airport reaches best.  Each
   link has a capacity from the fixed facts of the countries at both
   ends (js/data.js: population, infrastructure, economy), so the
   graph is the same in every world.

   Nothing travels on the links yet: what rides them, and how, is the
   subject of the redesign.  Built once from the map hand-off
   (LINKS.rebuild) and never saved: a loaded game rebuilds it from the
   same map.  Reads ENTITY_CONFIG only inside functions that run after
   load.
   ═══════════════════════════════════════════════════════════════ */
(() => {
"use strict";
const { RANGE_CAP, MICRO_LAND, MICRO_LANDLOCKED } = window.GEO;
const D = window.DATA;
const cfg = () => window.ENTITY_CONFIG;

const edges = [];                          // { a, b, type, km, cap, range }
const byIso = Object.create(null);         // iso -> [edge index]
const pairKey = Object.create(null);       // "type|A|B" -> edge index
let pos = Object.create(null);             // iso -> { lon, lat }
let coastKm = Object.create(null);         // iso -> km of coastline (0 = landlocked)
let ready = false;

const facts = iso => D.rowOf(iso);         // the fixed per-country facts the graph is built from
/* An airport's reach: a wealthy, built-up, populous country is a hub. */
function hub(iso) {
  const f = facts(iso);
  return (f.economy + f.st.infra) / 200 * Math.pow(Math.max(0.01, f.pop), 0.4);
}

function haversineKm(a, b) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function key(type, a, b) { return a < b ? type + "|" + a + "|" + b : type + "|" + b + "|" + a; }
function addEdge(a, b, type, km, extra) {
  const k = key(type, a, b);
  if (pairKey[k] != null) return;
  const i = edges.length;
  pairKey[k] = i;
  edges.push(Object.assign({ a, b, type, km, cap: 0, range: 1 }, extra));
  (byIso[a] || (byIso[a] = [])).push(i);
  (byIso[b] || (byIso[b] = [])).push(i);
}

/* ── Build from the map hand-off: { countries, borders, coastKm } ── */
function rebuild(topo) {
  edges.length = 0;
  for (const k in byIso) delete byIso[k];
  for (const k in pairKey) delete pairKey[k];
  pos = Object.create(null); coastKm = Object.create(null);
  const c = cfg() || {};
  const seaK = c.seaK ?? 8, airK = c.airK ?? 8, airRange = c.airRange ?? 8000;
  const cs = (topo.countries || []).filter(x => D.isAgent(x.iso2) && isFinite(x.lon) && isFinite(x.lat));
  for (const x of cs) pos[x.iso2] = { lon: x.lon, lat: x.lat };
  for (const iso in (topo.coastKm || {})) if (pos[iso]) coastKm[iso] = topo.coastKm[iso];
  // Dot-marker micro-states have no shape: coastal unless known landlocked.
  for (const x of cs) if (x.id == null && coastKm[x.iso2] == null && !MICRO_LANDLOCKED.has(x.iso2)) coastKm[x.iso2] = 20;

  // land: shared map edges + the micro-states' borders; km = border length
  for (const bd of (topo.borders || []))
    if (pos[bd.a] && pos[bd.b])
      addEdge(bd.a, bd.b, "land", Math.max(1, bd.km), { range: RANGE_CAP[key("", bd.a, bd.b).slice(1)] ?? 1 });
  for (const pair of MICRO_LAND) {
    const [a, b] = pair.split("|");
    if (pos[a] && pos[b]) addEdge(a, b, "land", 10, {});
  }
  // sea: each coastal country to its nearest coastal partners
  const coastal = cs.filter(x => coastKm[x.iso2] > 0);
  for (const a of coastal) {
    const cands = coastal.filter(b => b !== a).map(b => [haversineKm(pos[a.iso2], pos[b.iso2]), b.iso2]);
    cands.sort((x, y) => x[0] - y[0]);
    for (const [d, iso] of cands.slice(0, seaK)) addEdge(a.iso2, iso, "sea", d, {});
  }
  // air: each country to the partners its hub reaches best
  for (const a of cs) {
    const ha = hub(a.iso2);
    const cands = cs.filter(b => b !== a).map(b => {
      const d = haversineKm(pos[a.iso2], pos[b.iso2]);
      return [ha * hub(b.iso2) * Math.exp(-d / airRange), d, b.iso2];
    });
    cands.sort((x, y) => y[0] - x[0]);
    for (const [, d, iso] of cands.slice(0, airK)) addEdge(a.iso2, iso, "air", d, {});
  }
  ready = true;
  refreshCapacity();
  dbg("[Entity links]", count("land"), "land,", count("sea"), "sea,", count("air"), "air");
}

/* ── Capacity: what each link could carry, from the facts at both ends ── */
function refreshCapacity() {
  const c = cfg(); if (!c) return;
  for (const e of edges) {
    const infraF = 0.5 + (facts(e.a).st.infra + facts(e.b).st.infra) / 400;
    if (e.type === "land")      e.cap = c.landCap * Math.sqrt(e.km) * e.range * infraF;
    else if (e.type === "sea")  e.cap = c.seaCap * Math.sqrt(Math.min(coastKm[e.a] || 1, coastKm[e.b] || 1)) * Math.exp(-e.km / c.seaRange) * infraF;
    else                        e.cap = c.airCap * hub(e.a) * hub(e.b) * Math.exp(-e.km / c.airRange) * infraF;
  }
}

/* ── Queries ───────────────────────────────────────────────────── */
function count(type) { let n = 0; for (const e of edges) if (e.type === type) n++; return n; }
function linkedBy(a, b, type) {
  for (const i of (byIso[a] || [])) { const e = edges[i]; if (e.type === type && (e.a === b || e.b === b)) return true; }
  return false;
}
function rangeOf(a, b) {                     // the land border's terrain factor: 1 when open, or when there is none
  for (const i of (byIso[a] || [])) { const e = edges[i]; if (e.type === "land" && (e.a === b || e.b === b)) return e.range; }
  return 1;
}
function partners(iso) {                     // every country linked to iso, any type, once each
  const seen = new Set();
  for (const i of (byIso[iso] || [])) { const e = edges[i]; seen.add(e.a === iso ? e.b : e.a); }
  return [...seen];
}
function linked(a, b) {
  for (const i of (byIso[a] || [])) { const e = edges[i]; if (e.a === b || e.b === b) return true; }
  return false;
}
function edgesOf(iso) { return (byIso[iso] || []).map(i => edges[i]); }
function capacity(a, b) {                   // between two countries, summed over every link type
  let t = 0;
  for (const i of (byIso[a] || [])) { const e = edges[i]; if (e.a === b || e.b === b) t += e.cap; }
  return t;
}

window.LINKS = {
  rebuild, refreshCapacity, count, linked, linkedBy, rangeOf, partners, edgesOf, capacity,
  edges, byIso,
  get ready() { return ready; },
  get coastKm() { return coastKm; },
};
})();
