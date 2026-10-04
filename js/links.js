/* ═══════════════════════════════════════════════════════════════
   Entity — links: how countries connect, and what travels
   Three kinds of link.  Land borders come from the map (countries
   whose shapes share an edge; a curated table cuts capacity where a
   mountain range lies along one).  Sea links join coastal countries
   to their nearest coastal neighbours.  Air links join every country
   to the partners its airport reaches best.  Each link has a capacity
   from the stats at both ends, refreshed weekly, and each day carries
   a flow in both directions: tourists (seasonal, attracted by wealth,
   order and openness) and migrants (chasing better economies and
   stability).  The outbreak rides those flows; economies and
   populations feel them.

   Built once from the map hand-off (LINKS.rebuild) and never saved:
   a loaded game rebuilds it from the same map.  Reads world state and
   ENTITY_CONFIG only inside functions that run after load.
   ═══════════════════════════════════════════════════════════════ */
(() => {
"use strict";
const CO = window.COUNTRIES;
const cfg = () => window.ENTITY_CONFIG;
const W   = () => window.WORLD;

const eco = s => Math.min(100, CO.ecoIndex(s.output, cfg()));   // the economy as a level, for the flows
const edges = [];                          // { a, b, type, km, cap, range }
const byIso = Object.create(null);         // iso -> [edge index]
const pairKey = Object.create(null);       // "type|A|B" -> edge index
let flowArr = new Float64Array(0);         // [2i] a->b, [2i+1] b->a
let pos = Object.create(null);             // iso -> { lon, lat }
let coastKm = Object.create(null);         // iso -> km of coastline (0 = landlocked)
let effects = Object.create(null);         // iso -> { tourismIn, migIn, migOut }
let ready = false;

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
  const isAgent = W().isAgent;
  const cs = (topo.countries || []).filter(c => isAgent(c.iso2) && isFinite(c.lon) && isFinite(c.lat));
  for (const c of cs) pos[c.iso2] = { lon: c.lon, lat: c.lat };
  for (const iso in (topo.coastKm || {})) if (pos[iso]) coastKm[iso] = topo.coastKm[iso];
  // Dot-marker micro-states have no shape: coastal unless known landlocked.
  for (const c of cs) if (c.id == null && coastKm[c.iso2] == null && !CO.MICRO_LANDLOCKED.has(c.iso2)) coastKm[c.iso2] = 20;

  // land: shared map edges + the micro-states' borders; km = border length
  for (const bd of (topo.borders || []))
    if (pos[bd.a] && pos[bd.b])
      addEdge(bd.a, bd.b, "land", Math.max(1, bd.km), { range: CO.RANGE_CAP[key("", bd.a, bd.b).slice(1)] ?? 1 });
  for (const pair of CO.MICRO_LAND) {
    const [a, b] = pair.split("|");
    if (pos[a] && pos[b]) addEdge(a, b, "land", 10, {});
  }
  // sea: each coastal country to its nearest coastal partners
  const coastal = cs.filter(c => coastKm[c.iso2] > 0);
  for (const a of coastal) {
    const cands = coastal.filter(b => b !== a).map(b => [haversineKm(pos[a.iso2], pos[b.iso2]), b.iso2]);
    cands.sort((x, y) => x[0] - y[0]);
    for (const [d, iso] of cands.slice(0, cfg().seaK)) addEdge(a.iso2, iso, "sea", d, {});
  }
  // air: each country to the partners its hub reaches best
  const S = W().COUNTRY_STATE;
  for (const a of cs) {
    const ha = hub(S[a.iso2]);
    const cands = cs.filter(b => b !== a).map(b => {
      const d = haversineKm(pos[a.iso2], pos[b.iso2]);
      return [ha * hub(S[b.iso2]) * Math.exp(-d / cfg().airRange), d, b.iso2];
    });
    cands.sort((x, y) => y[0] - x[0]);
    for (const [, d, iso] of cands.slice(0, cfg().airK)) addEdge(a.iso2, iso, "air", d, {});
  }
  flowArr = new Float64Array(edges.length * 2);
  ready = true;
  dbg("[Entity links]", count("land"), "land,", count("sea"), "sea,", count("air"), "air");
}
function hub(s) { return s ? (eco(s) + s.st.infra) / 200 * Math.pow(Math.max(0.01, s.pop), 0.4) : 0; }

/* ── Capacity: what each link could carry, from the stats at both ends ── */
function refreshCapacity() {
  const c = cfg(), S = W().COUNTRY_STATE;
  for (const e of edges) {
    const A = S[e.a], B = S[e.b];
    if (!A || !B) { e.cap = 0; continue; }
    const infraF = 0.5 + (A.st.infra + B.st.infra) / 400;
    if (e.type === "land")      e.cap = c.landCap * Math.sqrt(e.km) * e.range * infraF;
    else if (e.type === "sea")  e.cap = c.seaCap * Math.sqrt(Math.min(coastKm[e.a] || 1, coastKm[e.b] || 1)) * Math.exp(-e.km / c.seaRange) * infraF;
    else                        e.cap = c.airCap * hub(A) * hub(B) * Math.exp(-e.km / c.airRange) * infraF;
  }
}

/* ── Daily flows ───────────────────────────────────────────────── */
const POLICY = s => [1, cfg().borderRestricted, cfg().borderClosed][s.border | 0] ?? 1;
function season(iso) {
  const c = cfg(), doy = W().day % 365;
  const peak = (pos[iso] && pos[iso].lat < 0) ? 15 : 195;            // mid-Jan south, mid-Jul north
  return 1 + c.seasonAmp * Math.cos(2 * Math.PI * (doy - peak) / 365);
}
const emit    = s => eco(s) / 100 * Math.sqrt(Math.max(0.01, s.pop));
const attract = s => (0.4 * eco(s) + 0.3 * s.st.infra + 0.3 * s.st.stability) / 100 * (0.5 + s.econOpen / 200);
function directed(A, B, isoA, isoB, cap, c) {
  let pol = POLICY(A) * POLICY(B);
  if (W().warBetween(isoA, isoB)) pol *= c.warFlow;         // little crosses a front line
  const day = W().day;                                       // an outbreak travel ban, either way round
  if ((B.ban === isoA && day < B.banUntil) || (A.ban === isoB && day < A.banUntil)) pol *= c.travelBan;
  const tourism = cap * emit(A) * attract(B) * season(isoB) * pol;
  const gap = Math.max(0, (eco(B) - eco(A)) + (B.st.stability - A.st.stability));
  const migration = c.migBase * gap / 100 * B.econOpen / 100 * cap * pol;
  return [tourism, migration];
}
function flows() {
  const c = cfg(), S = W().COUNTRY_STATE;
  effects = Object.create(null);
  const eff = iso => effects[iso] || (effects[iso] = { tourismIn: 0, migIn: 0, migOut: 0 });
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i], A = S[e.a], B = S[e.b];
    if (!A || !B || e.cap <= 0) { flowArr[2 * i] = flowArr[2 * i + 1] = 0; continue; }
    const [tAB, mAB] = directed(A, B, e.a, e.b, e.cap, c);
    const [tBA, mBA] = directed(B, A, e.b, e.a, e.cap, c);
    flowArr[2 * i] = tAB + mAB; flowArr[2 * i + 1] = tBA + mBA;
    const ea = eff(e.a), eb = eff(e.b);
    eb.tourismIn += tAB; ea.tourismIn += tBA;
    eb.migIn += mAB; ea.migOut += mAB;
    ea.migIn += mBA; eb.migOut += mBA;
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
function flow(a, b) {                       // a -> b, summed over every link type
  let f = 0;
  for (const i of (byIso[a] || [])) {
    const e = edges[i];
    if (e.a === a && e.b === b) f += flowArr[2 * i];
    else if (e.b === a && e.a === b) f += flowArr[2 * i + 1];
  }
  return f;
}
const flowAt = (i, dir) => flowArr[2 * i + dir];

window.LINKS = {
  rebuild, refreshCapacity, flows, count, linked, linkedBy, rangeOf, partners, flow, flowAt,
  edges, byIso,
  get ready() { return ready; },
  get effects() { return effects; },
  get coastKm() { return coastKm; },
};
})();
