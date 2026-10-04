/* ═══════════════════════════════════════════════════════════════
   Entity — gov: nations, regimes, legitimacy and succession
   A nation has a settled character, its BASE: authority (the state's
   command over society), political freedom (consent: who is asked, how
   dissent shows) and economic openness (trade posture).  A REGIME is a
   set of modifiers on that base and a TYPE that says how it can be
   replaced: elected (elections), hereditary (a monarch dies),
   military (appointment or coup), party (congress or purge).  The
   effective axes — base plus modifiers, clamped — are what every other
   system reads: s.authority, s.freedom, s.econOpen (economic).

   LEGITIMACY is derived daily: how well the regime fits its nation
   (the distance between effective axes and base) plus recent
   performance (growth, shortage, defeat, occupation).  It replaces the
   old "authority 55 is optimal" term in the stability target and sets
   the odds of coups, revolutions and strongman elections.

   Only REVOLUTIONS move the base: violent (the street wins a
   collapse), peaceful (a free but illegitimate regime gives way) and
   technological (an information society opens the nation's character).
   Everything else — elections, successions, appointments, coups,
   defeat, occupation's release — changes the regime's modifiers.
   Foreign-backed coups can fail, and failing costs the sponsor.
   ═══════════════════════════════════════════════════════════════ */
(() => {
"use strict";
const cfg = () => window.ENTITY_CONFIG;
const W = () => window.WORLD;
const { clamp } = window.COUNTRIES;
const TYPES = ["elected", "hereditary", "military", "party"];

/* rows: authority < 45, 45..70, ≥ 70 · columns: political freedom < 35, 35..60, ≥ 60 */
const LABELS = [
  ["Fractured state",  "Republic",          "Liberal democracy"],
  ["One-party state",  "Managed democracy", "Social democracy"],
  ["Military junta",   "Autocracy",         "Guided technocracy"],
];
function label(authority, freedom) {
  const c = cfg() || {};
  const a1 = c.labelAuth1 != null ? c.labelAuth1 : 45, a2 = c.labelAuth2 != null ? c.labelAuth2 : 70;
  const f1 = c.labelFree1 != null ? c.labelFree1 : 35, f2 = c.labelFree2 != null ? c.labelFree2 : 60;
  const r = authority >= a2 ? 2 : authority >= a1 ? 1 : 0;
  const col = freedom >= f2 ? 2 : freedom >= f1 ? 1 : 0;
  return LABELS[r][col];
}
const labelOf = s => label(s.authority, s.freedom != null ? s.freedom : s.econOpen);
const isDemocratic = s => (s.freedom != null ? s.freedom : s.econOpen) >= 55 && s.authority <= 55;
const typeOf = s => s.regime && s.regime.type ? s.regime.type : "elected";


/* -- Powers: what an administration can actually do ----------------
   A government taking office draws powerDraw powers from one pool, and
   loses them when it falls.  Nothing is exclusive: every power carries a
   base weight, a multiplier for the regime type and one for the region,
   so a junta that builds schools is uncommon rather than impossible and
   a democracy that arranges a dynastic marriage is a curiosity.  Only
   the deviations from 1 are written here; everything unlisted is 1.

   kind says what enacting one does (js/decide.js pays for it):
     work  a shaped project -- stats raised, gain, cost and days scaled
     mod   a project that, once finished, holds a multiplier for the
           administration's life
     act   an immediate effect paid as a lump, on a cooldown
   Scale for the weights: 3 characteristic, 2 common, 1 normal,
   0.5 unusual, 0.2 rare, 0.05 almost unheard of. */
const POWERS = {
  publicWorks:   { kind: "work", base: 1.0, stats: ["infra", "stability"], gain: 2, cost: 1.5, days: 0.5,
                   type: { elected: 1.5, party: 1.5 }, label: "a programme of public works" },
  frontier:      { kind: "mod",  base: 0.8, mul: { findWeight: 2, findSize: 1.5 },
                   type: { military: 1.3 }, region: { AF: 3, SA: 2, OC: 1.5, AS: 1.2, EU: 0.4 }, label: "settlement of the frontier" },
  reforest:      { kind: "mod",  base: 0.7, mul: { resFood: 1.12, resWater: 1.08, droughtFood: 0.7 },
                   type: { elected: 2, military: 0.5 }, region: { AF: 2.5, SA: 2.5, EU: 1.5, OC: 1.5 }, label: "a reforestation programme" },
  cleanGrid:     { kind: "mod",  base: 0.7, mul: { needEnergyOut: 0.85 },
                   type: { elected: 2, party: 1.5, military: 0.4 }, region: { EU: 2.5, NA: 2, OC: 1.5, AS: 1.2, SA: 0.6, AF: 0.3 }, label: "a clean grid" },
  waterWorks:    { kind: "work", base: 0.8, stats: ["infra"], gain: 1.2, cost: 1.2, days: 1.5, mul: { resWater: 1.2 },
                   type: { hereditary: 1.5 }, region: { AS: 2.5, AF: 1.8, SA: 0.6, EU: 0.6 }, label: "great water works" },
  rearmament:    { kind: "mod",  base: 1.0, mul: { milProject: 0.7 },
                   type: { military: 3, party: 2, hereditary: 1.5, elected: 0.5 }, region: { AS: 1.5, EU: 1.2, AF: 1.2 }, label: "a rearmament programme" },
  austerity:     { kind: "act",  base: 0.8, act: { treasuryDays: 25, stability: -6 },
                   type: { elected: 1.5, military: 0.6 }, region: { EU: 2, SA: 1.5, NA: 1.2 }, label: "an austerity budget" },
  schools:       { kind: "work", base: 0.9, stats: ["academia"], gain: 1.8, cost: 0.8, days: 1,
                   type: { elected: 2, party: 2, military: 0.5 }, region: { AS: 1.5, EU: 1.3, AF: 1.2 }, label: "a schools programme" },
  publicHealth:  { kind: "work", base: 0.9, stats: ["medical"], gain: 1.8, cost: 0.8, days: 1,
                   type: { elected: 2, party: 1.5 }, region: { AF: 2, AS: 1.3, SA: 1.3 }, label: "a public health drive" },
  openMarkets:   { kind: "mod",  base: 0.9, mul: { partners: 1.5, econOpen: 6 },
                   type: { elected: 2, hereditary: 1.5, military: 0.5, party: 0.6 }, region: { EU: 1.5, AS: 1.5, OC: 1.5, NA: 1.2, AF: 0.8 }, label: "an opening of the markets" },
  antiCorrupt:   { kind: "act",  base: 0.8, act: { stability: 5, legit: 8, authority: -3 },
                   type: { elected: 2, party: 1.5, military: 0.8, hereditary: 0.6 }, region: { AF: 1.8, SA: 1.8, AS: 1.3, EU: 0.8 }, label: "an anti-corruption drive" },
  conservation:  { kind: "mod",  base: 0.6, mul: { resFood: 1.06, resWater: 1.06, legitStand: 4, output: 0.97 },
                   type: { elected: 2.5, hereditary: 1.5, party: 0.8, military: 0.4 }, region: { OC: 2.5, SA: 2, EU: 1.8, NA: 1.5, AS: 0.8 }, label: "a conservation law" },
  greenShift:    { kind: "work", base: 0.5, stats: ["infra"], gain: 0.8, cost: 1.6, days: 2, mul: { needMatOut: 0.85 },
                   type: { elected: 2.5, party: 1.2, hereditary: 0.8, military: 0.3 }, region: { EU: 3, NA: 1.5, OC: 1.5, SA: 0.8, AF: 0.4 }, label: "a green transition" },
  carbonTax:     { kind: "mod",  base: 0.4, mul: { taxRate: 1.12, output: 0.98, legitStand: 3 },
                   type: { elected: 2.5, party: 0.8, hereditary: 0.5, military: 0.15 }, region: { EU: 3, OC: 2, NA: 1.2, AS: 0.5, AF: 0.5, SA: 0.5 }, label: "a carbon tax" },
  referendum:    { kind: "act",  base: 0.6, act: { toBase: 0.5, legit: -6 },
                   type: { elected: 3, hereditary: 0.3, party: 0.15, military: 0.1 }, region: { EU: 1.8, OC: 1.5, SA: 1.2 }, label: "a referendum" },
  coalition:     { kind: "act",  base: 0.6, act: { legit: 10, treasuryDays: -15 },
                   type: { elected: 3, hereditary: 0.4, party: 0.4, military: 0.15 }, region: { EU: 1.8, AS: 1.2 }, label: "a coalition bargain" },
  martialLaw:    { kind: "act",  base: 0.8, act: { stability: 14, legit: -10, freedom: -8 }, needsPressure: true,
                   type: { military: 3, party: 2, elected: 0.2 }, region: { AF: 1.5, AS: 1.3, SA: 1.3, EU: 0.6, NA: 0.6 }, label: "martial law" },
  officerPurge:  { kind: "act",  base: 0.7, act: { military: -6, coupProof: 1 },
                   type: { military: 3, party: 2, hereditary: 1.2, elected: 0.1 }, region: { AF: 1.6, AS: 1.3, SA: 1.2, EU: 0.7 }, label: "a purge of the officer corps" },
  reserve:       { kind: "mod",  base: 0.7, mul: { stockDays: 1.6 },
                   type: { military: 2, party: 2, hereditary: 1.2, elected: 0.8 }, region: { AS: 1.4, EU: 1.2 }, label: "a strategic reserve" },
  fiveYearPlan:  { kind: "work", base: 0.7, stats: ["infra", "academia", "technology"], gain: 1.4, cost: 1.3, days: 2.5,
                   type: { party: 3, military: 1.2, hereditary: 0.5, elected: 0.3 }, region: { AS: 1.8, EU: 1.2 }, label: "a five-year plan" },
  massCampaign:  { kind: "act",  base: 0.6, act: { infra: 5, stability: -7 },
                   type: { party: 3, military: 1.5, hereditary: 0.5, elected: 0.2 }, region: { AS: 1.8, AF: 1.3 }, label: "a mass campaign" },
  greatCanal:    { kind: "work", base: 0.5, stats: ["infra"], gain: 1.5, cost: 1.8, days: 2.5, mul: { partners: 1.3, resWater: 1.06 },
                   type: { hereditary: 2, party: 2, elected: 0.8 }, region: { AS: 1.5, AF: 1.3, NA: 1.2 }, label: "a great canal" },
  greatWork:     { kind: "work", base: 0.6, stats: ["stability"], gain: 1.6, cost: 1.4, days: 4, mul: { legitStand: 6 },
                   type: { hereditary: 3, party: 1.5, military: 0.8, elected: 0.4 }, region: { AS: 1.5, AF: 1.2 }, label: "a great work" },
  marriage:      { kind: "act",  base: 0.5, act: { bond: 35 },
                   type: { hereditary: 3, military: 0.1, elected: 0.05, party: 0.05 }, region: { AS: 1.5, EU: 1.2, AF: 1.2 }, label: "a dynastic marriage" },
  patronage:     { kind: "work", base: 0.5, stats: ["academia", "medical"], gain: 1, cost: 0.7, days: 2,
                   type: { hereditary: 3, elected: 0.5, party: 0.5, military: 0.4 }, region: { AS: 1.3, EU: 1.2 }, label: "royal patronage" },
};
const POWER_KEYS = Object.keys(POWERS);
const regionCodeOf = iso => { const D = window.DATA, row = D && D.ROWS ? D.ROWS[iso] : null; return row ? row[D.COL.region] : null; };
/* The weight a power carries for this kind of government in this part of the world. */
function powerWeight(key, type, region) {
  const P = POWERS[key]; if (!P) return 0;
  const byType = P.type && P.type[type] != null ? P.type[type] : 1;
  const byRegion = P.region && region && P.region[region] != null ? P.region[region] : 1;
  return Math.max(0, P.base * byType * byRegion);
}
/* What a new government sets out to do: powerDraw of them, without replacement, by weight. */
function drawPowers(iso, type, rng) {
  const c = cfg(), region = regionCodeOf(iso), pool = POWER_KEYS.slice(), out = [];
  const n = Math.max(0, Math.min(pool.length, (c && c.powerDraw) || 2));
  for (let i = 0; i < n; i++) {
    let total = 0;
    for (const k of pool) total += powerWeight(k, type, region);
    if (!(total > 0)) break;
    let r = (rng ? rng() : 0.5) * total, pick = pool[pool.length - 1];
    for (const k of pool) { r -= powerWeight(k, type, region); if (r <= 0) { pick = k; break; } }
    out.push(pick); pool.splice(pool.indexOf(pick), 1);
  }
  return out;
}
const powersOf = s => (s && s.regime && s.regime.powers) || [];
const hasPower = (s, key) => powersOf(s).indexOf(key) >= 0;
const powerLabel = key => (POWERS[key] && POWERS[key].label) || key;
/* -- Powers, stage 2: what enacting one does ----------------------
   work  a shaped project over a list of stats; done when it ends
   mod   the same project with no stats; done, it holds its multipliers
   act   an immediate effect, a lump of enactDays of income, a cooldown
   One work or mod at a time (regime.enacting); a finished one is not run
   again by the same government; an act waits out its cooldown. */
const enactedOf = s => (s && s.regime && s.regime.done) || [];
/* The product of a coefficient row's multipliers over the government's finished powers; 1 when none. */
function powerMul(s, row) {
  let m = 1;
  for (const k of enactedOf(s)) { const P = POWERS[k]; if (P && P.mul && P.mul[row] != null) m *= P.mul[row]; }
  return m;
}
/* The sum of a level row's shifts (econOpen, legitStand) over the same; 0 when none. */
function powerAdd(s, row) {
  let a = 0;
  for (const k of enactedOf(s)) { const P = POWERS[k]; if (P && P.mul && P.mul[row] != null) a += P.mul[row]; }
  return a;
}
/* Whether this government may enact a power today. */
function canEnact(s, key, day) {
  const P = POWERS[key], c = cfg(), R = s && s.regime;
  if (!P || !R || !s.st || powersOf(s).indexOf(key) < 0) return false;
  if (P.kind === "act") {
    if (R.cooldown && day < (R.cooldown[key] || 0)) return false;
    if (P.needsPressure && !(s.st.stability < c.strongmanStab)) return false;   // martial law needs a street to clear
    return true;
  }
  return (R.done || []).indexOf(key) < 0 && !R.enacting;
}
/* A shaped project: the ordinary one for its first stat, with gain, cost and days scaled, over the whole list. */
function powerProjectFor(s, key) {
  const P = POWERS[key], E = window.ECONOMY, c = cfg(), stats = P.stats || [];
  const base = E.projectFor(s, stats[0] || "infra"), days = Math.max(1, Math.round(c.projectDays * (P.days || 1)));
  const stretch = c.projectDays / days;                                   // the same total, spread over more or fewer days
  return { stat: stats[0] || "infra", stats, power: key, days, total: days,
           gain: stats.length ? base.gain * (P.gain || 1) * stretch : 0, cost: base.cost * (P.cost || 1) * stretch, since: W().day };
}
/* The nearest hereditary neighbour, for a marriage; failing one, the best-related neighbour. */
function bondPartner(iso) {
  const W_ = W(), S = W_.COUNTRY_STATE, L = window.LINKS;
  const nb = L && L.ready ? L.partners(iso).filter(o => S[o] && S[o].st && !S[o].occupiedBy) : [];
  const royal = nb.filter(o => typeOf(S[o]) === "hereditary"), pool = royal.length ? royal : nb;
  let best = null, rel = -Infinity;
  for (const o of pool) { const r = W_.relOf(iso, o); if (r > rel) { rel = r; best = o; } }
  return best;
}
/* An act, applied now: each effect by its key, the lump charged, the cooldown set. */
function enactAct(iso, s, key) {
  const P = POWERS[key], c = cfg(), W_ = W(), E = window.ECONOMY, a = P.act || {}, inc = E.taxIncome(s);
  s.treasury -= c.enactDays * inc;
  for (const k in a) {
    const v = a[k];
    if (k === "stability" || k === "infra" || k === "military") s.st[k] = clamp(s.st[k] + v, 0, 100);
    else if (k === "legit") s.legit = clamp((s.legit != null ? s.legit : 60) + v, 0, 100);
    else if (k === "authority" || k === "freedom") { const d = {}; d[k] = v; nudge(s, d); }
    else if (k === "treasuryDays") s.treasury += v * inc;
    else if (k === "toBase") for (const ax in s.regime.mods) s.regime.mods[ax] *= 1 - v;   // the regime moves toward the nation
    else if (k === "coupProof") s.coupProofUntil = W_.day + c.enactCooldown;
    else if (k === "bond") { const o = bondPartner(iso); if (o) W_.shiftRel(iso, o, v); }
  }
  refresh(s);
  (s.regime.cooldown || (s.regime.cooldown = {}))[key] = W_.day + c.enactCooldown;
  W_.log({ sev: "large", kind: "power", key, iso, text: `${W_.nameOf(iso)} enacts ${powerLabel(key)}` });
  return true;
}
/* Enact a power: a work or mod starts its project and takes the slot; an act fires. */
function enact(iso, s, key) {
  const P = POWERS[key], W_ = W(), E = window.ECONOMY;
  if (!canEnact(s, key, W_.day)) return false;
  if (P.kind === "act") return enactAct(iso, s, key);
  const pj = powerProjectFor(s, key);
  if (!E.canSpend(s, pj.cost * pj.total * 0.5)) return false;
  (s.projects || (s.projects = [])).push(pj);
  s.regime.enacting = key;
  W_.log({ sev: "large", kind: "power", key, iso, text: `${W_.nameOf(iso)} begins ${powerLabel(key)}` });
  return true;
}
/* A seeded government, or one loaded from before programmes existed, draws its programme the first time it is
   asked to decide: the same seed and country always draw the same one. */
function ensurePowers(iso, s) {
  if (!s || !s.regime || s.regime.powers) return s;
  const W_ = W(), { unit } = window.COUNTRIES;
  let n = 0;
  const rng = () => unit(W_.seed, "powers", iso, n++);
  s.regime.powers = drawPowers(iso, s.regime.type, rng);
  s.regime.done = s.regime.done || []; s.regime.enacting = s.regime.enacting || null; s.regime.cooldown = s.regime.cooldown || {};
  return s;
}
/* The project tick calls this when a power's project ends: it is done, and the slot is free. */
function powerFinished(s, key) {
  if (!s.regime) return;
  (s.regime.done || (s.regime.done = [])).indexOf(key) < 0 && s.regime.done.push(key);
  if (s.regime.enacting === key) s.regime.enacting = null;
  s.taxMul = powerMul(s, "taxRate");                       // the memo taxIncome reads, refreshed the day a programme lands
}

/* ── Base, regime, effective ───────────────────────────────────── */
/* A country made before this model, or loaded from an older save, gets a
   base equal to its effective axes and an empty regime. */
function ensure(s) {
  if (!s || !s.st) return s;
  if (!s.base) s.base = { authority: s.authority, freedom: s.freedom != null ? s.freedom : s.econOpen, econOpen: s.econOpen };
  if (!s.regime) s.regime = { type: s.freedom != null && s.freedom < 40 ? (s.authority >= 65 ? "party" : "military") : "elected",
                              since: 0, mods: { authority: 0, freedom: 0, econOpen: 0 } };
  if (!s.regime.mods) s.regime.mods = { authority: 0, freedom: 0, econOpen: 0 };
  if (TYPES.indexOf(s.regime.type) < 0) s.regime.type = "elected";
  refresh(s);
  return s;
}
function refresh(s) {
  const b = s.base, m = s.regime.mods;
  s.authority = clamp(b.authority + m.authority, 0, 100);
  s.freedom   = clamp(b.freedom + m.freedom, 0, 100);
  s.econOpen  = clamp(b.econOpen + m.econOpen + powerAdd(s, "econOpen"), 0, 100);   // an opening of the markets, while it stands
  return s;
}
/* Move the regime's modifiers (never the base). */
function nudge(s, d) {
  ensure(s);
  const m = s.regime.mods;
  if (d.authority) m.authority += d.authority;
  if (d.freedom)   m.freedom += d.freedom;
  if (d.econOpen)  m.econOpen += d.econOpen;
  return refresh(s);
}
/* A new regime: fresh modifiers, a type, a date. */
function install(s, type, mods, day, iso, rng) {
  ensure(s);
  s.regime = { type, since: day, mods: { authority: mods.authority || 0, freedom: mods.freedom || 0, econOpen: mods.econOpen || 0 },
               powers: drawPowers(iso, type, rng), done: [], enacting: null, cooldown: {} };   // what this government sets out to do, what it has finished, what it is on
  s.nextElection = null;
  return refresh(s);
}
/* Move the base itself: only a revolution does this. */
function shiftBase(s, d) {
  ensure(s);
  const b = s.base;
  b.authority = clamp(b.authority + (d.authority || 0), 0, 100);
  b.freedom   = clamp(b.freedom + (d.freedom || 0), 0, 100);
  b.econOpen  = clamp(b.econOpen + (d.econOpen || 0), 0, 100);
  return refresh(s);
}

/* ── Legitimacy ────────────────────────────────────────────────── */
/* How far the regime sits from the nation's character, in axis points. */
function misfit(s) {
  ensure(s);
  const b = s.base;
  return (Math.abs(s.authority - b.authority) + Math.abs(s.freedom - b.freedom) + Math.abs(s.econOpen - b.econOpen)) / 3;
}
function legitimacyOf(iso, s) {
  const c = cfg(), W_ = W(), day = W_.day;
  let minBal = 1;
  if (s.balance) for (let k = 0; k < 4; k++) if (s.balance[k] < minBal) minBal = s.balance[k];
  const gYear = (s.growth || 0) * 365 * 100;             // growth in percent a year
  let L = c.legitBase
        - c.legitFit * misfit(s)
        - c.legitShort * (1 - minBal) * 100
        - c.legitDecline * Math.min(20, Math.max(0, -gYear))
        + c.legitGrowth * Math.min(20, Math.max(0, gYear))
        - (s.occupiedBy ? c.legitOccupied : 0)
        - (day < (s.defeatUntil || 0) ? c.legitDefeat : 0)
        - (day < (s.disgraceUntil || 0) ? c.legitDisgrace : 0)
        - (day < (s.bustUntil || 0) ? c.legitBust : 0)
        - (s.famine || 0) * c.legitFamine
        + powerAdd(s, "legitStand");                         // a conservation law, a great work: the standing a programme earns
  return clamp(L, 0, 100);
}

/* ── Regime change, by type ────────────────────────────────────── */
function announce(iso, s, kind, key, text, sev) {
  const pw = powersOf(s);
  const programme = pw.length ? ` — it means to pursue ${pw.map(powerLabel).join(" and ")}` : "";
  W().log({ sev: sev || "large", kind, key, iso, text: text + programme });
}
const lower = s => labelOf(s).toLowerCase();
function swing(rng, size) { return (rng() - 0.5) * 2 * size; }

/* An election: a new elected regime.  Legitimacy colours the result: a
   regime the nation is happy with is returned with small changes; an
   unpopular one is thrown out with a large swing, and under stress the
   swing leans to order — a strongman ticket — which can end elections
   altogether if it takes freedom below the line. */
function election(iso, s, rng) {
  const c = cfg(), W_ = W(), before = labelOf(s), legit = s.legit != null ? s.legit : legitimacyOf(iso, s);
  const size = c.electionNudge * (legit >= c.electionUnpopular ? 1 : c.electionSwingMult);
  let mods = { authority: swing(rng, size), freedom: swing(rng, size), econOpen: swing(rng, size) };
  if (legit < c.electionUnpopular) {                       // the incumbent is out: lean back toward the base
    const m = s.regime.mods;
    mods = { authority: mods.authority - m.authority * 0.5, freedom: mods.freedom - m.freedom * 0.5, econOpen: mods.econOpen - m.econOpen * 0.5 };
  }
  let note = "";
  if (s.st.stability < c.strongmanStab || legit < c.strongmanLegit) { mods.authority += c.strongmanSwing; mods.freedom -= c.strongmanSwing / 2; note = " — a strongman ticket wins on a promise of order"; }
  install(s, "elected", mods, W_.day, iso, rng);
  if (s.freedom < c.electionFreedom) {                     // the winner does not intend to face the voters again
    s.regime.type = "party";
    note += "; the new government suspends future elections";
  } else s.nextElection = W_.day + Math.round(c.electionYears * 365);
  const after = labelOf(s);
  announce(iso, s, "election", null, `${W_.nameOf(iso)} holds elections${note}${after !== before ? " · now a " + after.toLowerCase() : ""}`, "small");
}
/* A monarch dies: the heir brings small changes, or a succession crisis
   when the crown has lost the country. */
function succession(iso, s, rng) {
  const c = cfg(), W_ = W(), legit = s.legit != null ? s.legit : legitimacyOf(iso, s);
  const crisis = legit < 40;
  const size = c.successionNudge * (crisis ? 2 : 1);
  const m = s.regime.mods;
  install(s, "hereditary", { authority: m.authority + swing(rng, size), freedom: m.freedom + swing(rng, size), econOpen: m.econOpen + swing(rng, size) }, W_.day, iso, rng);
  if (crisis) s.st.stability = clamp(s.st.stability - c.successionCrisisStab, 0, 100);
  announce(iso, s, "succession", "monarch", `${W_.nameOf(iso)}'s monarch dies${crisis ? " — a contested succession" : "; the heir takes the throne"}`, crisis ? "large" : "small");
}
/* The junta appoints a new leader: another general, another programme. */
function appointment(iso, s, rng) {
  const c = cfg(), W_ = W(), m = s.regime.mods, legit = s.legit != null ? s.legit : legitimacyOf(iso, s);
  if (legit < 40) {                                        // a crackdown: the junta's answer to a lost street, the party's purge in uniform
    install(s, "military", { authority: Math.max(m.authority, 20) + c.purgeAuthority, freedom: m.freedom - c.purgeFreedom, econOpen: m.econOpen + swing(rng, c.appointNudge) }, W_.day, iso, rng);
    s.st.stability = clamp(s.st.stability + c.purgeStab, 0, 100);
    announce(iso, s, "succession", "crackdown", `A crackdown in ${W_.nameOf(iso)}: the junta tightens its grip`, "large");
    return;
  }
  install(s, "military", { authority: Math.max(m.authority, 20) + swing(rng, c.appointNudge), freedom: m.freedom + swing(rng, c.appointNudge), econOpen: m.econOpen + swing(rng, c.appointNudge) }, W_.day, iso, rng);
  announce(iso, s, "succession", "appointment", `${W_.nameOf(iso)}'s junta appoints a new leader`, "small");
}
/* Liberalisation: a rich, legitimate, stable autocracy may open the system of its own accord and call elections. */
function liberalChanceOf(iso, s) {
  const c = cfg(), W_ = W();
  if (typeOf(s) === "elected" || s.occupiedBy) return 0;
  const legit = s.legit != null ? s.legit : legitimacyOf(iso, s);
  return legit >= c.liberalLegit && s.st.stability >= c.liberalStab && W_.ecoClamped(iso) >= c.liberalEco ? c.liberalChance : 0;
}
/* The party meets: a congress adjusts course; a purge, when legitimacy
   is gone, tightens the grip and buys order for a while. */
function congress(iso, s, rng) {
  const c = cfg(), W_ = W(), legit = s.legit != null ? s.legit : legitimacyOf(iso, s), m = s.regime.mods;
  if (legit < 40) {
    install(s, "party", { authority: m.authority + c.purgeAuthority, freedom: m.freedom - c.purgeFreedom, econOpen: m.econOpen + swing(rng, c.congressNudge) }, W_.day, iso, rng);
    s.st.stability = clamp(s.st.stability + c.purgeStab, 0, 100);
    announce(iso, s, "succession", "purge", `A purge in ${W_.nameOf(iso)}: the party closes ranks`, "large");
  } else {
    install(s, "party", { authority: m.authority + swing(rng, c.congressNudge), freedom: m.freedom + swing(rng, c.congressNudge), econOpen: m.econOpen + swing(rng, c.congressNudge) }, W_.day, iso, rng);
    announce(iso, s, "succession", "congress", `${W_.nameOf(iso)}'s party congress sets a new course`, "small");
  }
}

/* Stability below the floor for long enough: the army takes over if it
   can, otherwise the street does — and the street changes the nation.
   A coercive regime's fall is the army's to take: the state stays a
   state, in new uniforms, rather than falling to the street. */
function collapse(iso, s, rng) {
  const c = cfg(), W_ = W(), name = W_.nameOf(iso);
  if (rng() < Math.max(s.st.military / 100, window.COUNTRIES.coercion(s, c))) {
    install(s, "military", { authority: c.coupAuthority, freedom: -c.coupFreedom, econOpen: -c.coupEconOpen }, W_.day, iso, rng);
    announce(iso, s, "coup", "collapse", `Military coup in ${name} — now a ${lower(s)}`);
  } else revolution(iso, s, "violent", rng);
  s.st.stability = 35;
  s.crisisDays = 0;
}
/* Revolutions move the base.  Violent: the street wins a collapse and
   the nation comes out wanting more freedom and less command.  Peaceful:
   a free but illegitimate regime gives way without a fight.
   Technological: an information society opens the nation's character. */
function revolution(iso, s, kind, rng) {
  const c = cfg(), W_ = W(), name = W_.nameOf(iso);
  if (kind === "violent") {
    shiftBase(s, { authority: -c.revoltAuthority, freedom: c.revoltFreedom });
    install(s, s.base.freedom >= c.electionFreedom ? "elected" : "party", {}, W_.day, iso, rng);
    announce(iso, s, "revolution", "violent", `Revolution in ${name} — the old order falls; now a ${lower(s)}`);
  } else if (kind === "peaceful") {
    shiftBase(s, { authority: -c.reformAuthority, freedom: c.reformFreedom });
    install(s, "elected", {}, W_.day, iso, rng);
    s.nextElection = W_.day + Math.round(0.5 * c.electionYears * 365);
    announce(iso, s, "revolution", "peaceful", `A peaceful revolution in ${name}: the government steps down and elections are called`);
  } else if (kind === "liberal") {
    shiftBase(s, { authority: -c.reformAuthority, freedom: c.reformFreedom });
    install(s, "elected", {}, W_.day, iso, rng);
    s.nextElection = W_.day + Math.round(0.5 * c.electionYears * 365);
    announce(iso, s, "revolution", "liberal", `Reforms in ${name}: the government opens the system and calls elections`);
  } else if (kind === "technological") {
    shiftBase(s, { econOpen: c.techRevEconOpen, freedom: c.techRevFreedom });
    s.techRev = true;
    announce(iso, s, "revolution", "technological", `An information age dawns in ${name}: the country opens up`, "small");
  }
  refresh(s);
}

/* A strong, hostile power within reach can try to buy a coup in a shaky
   country.  It can fail: legitimacy is the target's shield, and a failed
   attempt rallies the target, sours the sponsor's name with the target's
   friends and costs it standing at home. */
function foreignCoups(rng) {
  const c = cfg(), W_ = W(), S = W_.COUNTRY_STATE, L = window.LINKS;
  if (!L || !L.ready) return;
  for (const iso in S) {
    const s = S[iso];
    if (!s.st || s.st.stability >= 35 || s.occupiedBy || W_.day < (s.coupProofUntil || 0)) continue;   // a purged officer corps plots nothing
    for (const other of L.partners(iso)) {
      const sp = S[other];
      if (!sp || !sp.st || sp.st.military < 40 || W_.force(other) < c.coupForceRatio * W_.force(iso) || W_.relOf(other, iso) > -50) continue;
      if (rng() >= c.coupChance) continue;
      attemptCoup(other, iso, rng);
      break;
    }
  }
}
function attemptCoup(sponsor, iso, rng) {
  const c = cfg(), W_ = W(), S = W_.COUNTRY_STATE, s = S[iso], sp = S[sponsor];
  if (W_.day < (s.coupProofUntil || 0)) return false;
  const legit = s.legit != null ? s.legit : legitimacyOf(iso, s);
  const pSuccess = clamp(c.coupSuccessBase + c.coupSuccessLegit * (50 - legit) / 100, 0.05, 0.95);
  if (rng() < pSuccess) {
    const b = s.base;                                       // the new regime leans toward the sponsor
    install(s, "military", { authority: (sp.authority - b.authority) / 2, freedom: (sp.freedom - b.freedom) / 2, econOpen: (sp.econOpen - b.econOpen) / 2 }, W_.day, iso, rng);
    s.st.stability = 35; s.crisisDays = 0;
    W_.shiftRel(sponsor, iso, c.coupRel);
    W_.log({ sev: "large", kind: "coup", key: "foreign", iso, iso2: sponsor,
             text: `Coup in ${W_.nameOf(iso)}, backed by ${W_.nameOf(sponsor)} — now a ${lower(s)}` });
    return true;
  }
  s.st.stability = clamp(s.st.stability + c.coupFailRally, 0, 100);
  W_.shiftRel(sponsor, iso, -c.coupFailRel);
  W_.rippleRel(sponsor, iso, -c.coupFailRel);
  sp.disgraceUntil = W_.day + c.coupDisgraceDays;
  W_.log({ sev: "large", kind: "coup", key: "failed", iso, iso2: sponsor,
           text: `A coup attempt in ${W_.nameOf(iso)} fails — ${W_.nameOf(sponsor)}'s hand behind it is exposed` });
  return false;
}

/* After a decisive defeat: the regime is shaken, not the nation.  A
   second defeat while the first still weighs extends the shock rather
   than stacking another on the regime's modifiers. */
function defeatShift(s) {
  const c = cfg(), day = W().day;
  if (!(day < (s.defeatUntil || 0))) nudge(s, { authority: -c.defeatAuthority });
  s.st.stability = Math.min(s.st.stability, 30);
  s.nextElection = null;
  s.defeatUntil = day + c.defeatDays;
}
/* Occupation's end: the regime carries the occupier's stamp. */
function occupierStamp(s, occ, frac) {
  ensure(s); ensure(occ);
  nudge(s, { authority: (occ.authority - s.authority) * frac, freedom: (occ.freedom - s.freedom) * frac, econOpen: (occ.econOpen - s.econOpen) * frac });
}

/* ── The daily pass ────────────────────────────────────────────── */
function daily(rng) {
  const c = cfg(), W_ = W(), S = W_.COUNTRY_STATE, day = W_.day;
  for (const iso in S) {
    const s = S[iso];
    if (!s.st) continue;
    ensure(s);
    s.legit = legitimacyOf(iso, s);
    const fresh = day - (s.regime.since || 0) < c.regimeGrace;    // a new regime gets a while before the street judges it
    s.crisisDays = s.st.stability < c.collapseFloor && !fresh ? s.crisisDays + 1 : 0;
    if (s.crisisDays >= c.collapseDays * (1 + c.coerceDays * window.COUNTRIES.coercion(s, c)) && !s.occupiedBy) { collapse(iso, s, rng); continue; }   // a coercive regime outlasts a longer crisis
    if (s.occupiedBy) { s.nextElection = null; continue; }
    const type = typeOf(s), legit = s.legit;
    // the succession rule of the type
    if (type === "elected") {
      if (!s.nextElection) s.nextElection = day + Math.round((0.25 + 0.75 * rng()) * c.electionYears * 365);
      else if (day >= s.nextElection) election(iso, s, rng);
    } else {
      s.nextElection = null;
      if (type === "hereditary" && rng() < c.monarchDeath) succession(iso, s, rng);
      else if (type === "military" && rng() < c.appointRate * (legit < 40 ? 3 : 1)) appointment(iso, s, rng);
      else if (type === "party" && rng() < c.congressRate * (legit < 40 ? 3 : 1)) congress(iso, s, rng);
    }
    // revolutions that move the nation
    if (legit < c.revoltLegit && !fresh && s.freedom >= c.reformFreedomMin && s.st.stability >= 30 && rng() < c.reformChance) revolution(iso, s, "peaceful", rng);
    else if (!fresh && rng() < liberalChanceOf(iso, s)) revolution(iso, s, "liberal", rng);
    else if (!s.techRev && s.st.technology >= c.techRevTech && s.st.academia >= c.techRevAcademia && rng() < c.techRevChance) revolution(iso, s, "technological", rng);
  }
  if (day % 28 === 0) foreignCoups(rng);
}

window.GOV = { liberalChanceOf, POWERS, POWER_KEYS, powerWeight, drawPowers, powersOf, hasPower, powerLabel, regionCodeOf,
               powerMul, powerAdd, canEnact, powerProjectFor, enact, enactAct, powerFinished, enactedOf, ensurePowers, label, labelOf, isDemocratic, typeOf, TYPES, ensure, refresh, nudge, install, shiftBase, misfit, legitimacyOf,
               daily, defeatShift, occupierStamp, collapse, election, succession, appointment, congress, revolution, attemptCoup, foreignCoups };
})();
