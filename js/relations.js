/* ═══════════════════════════════════════════════════════════════
   Entity — relations: how nations see each other
   The fourth pillar (docs/design.md §5.4 as decided, docs/nations.md
   §5).  A nation's view of another is a baseline from facts that do
   not move (the same region, a shared border, like governments) plus
   goodwill minus grievance, two stocks that accumulate from what the
   other nation did and fade by a share a day.  Views are directed:
   France's view of Belgium is not Belgium's view of France.  What moves
   them: deals delivered and deals lapsed, aid in a famine, a seller's
   refusal, people taken in, and a threat assessment: an aggressive
   nation (authority high, freedom low, until regimes carry it as a
   gene) resents a weaker and richer neighbour, a peaceful one warms
   to a weaker one.  Two nations that have seen each other above a line
   for a season sign a pact; below a lower line it lapses.  A nation
   sends food, free, to famine neighbours it does not resent; a nation
   short of money for its import bill borrows from the friend with the
   deepest treasury, at interest, and a year of no repayment is a
   default.  Trade reads the views: friends' deals form sooner and
   deliver first, and a seller refuses a buyer it holds in enmity.
   Runs after trade in the world's day.
   ═══════════════════════════════════════════════════════════════ */
(() => {
"use strict";
const W = window.WORLD, E = window.ECONOMY, D = window.DATA, G = window.GEO;
const cfg = () => window.ENTITY_CONFIG || LEVERS;

/* ── Levers: the config panel's Relations group (over the target of ten: the pact, lending and threat lines each needed their own) ── */
const LEVERS = {
  relFade: 0.01,                           // share of goodwill and grievance that fades a day
  dealGoodwill: 0.15, breakGrievance: 5,   // goodwill a day for a deal delivered in full, both ways; grievance when one lapses undelivered
  refusalGrievance: 0.2,                   // grievance a day while a seller refuses a buyer
  aidShare: 0.1, aidGoodwill: 0.5,         // share of the food above comfort sent to famine neighbours a day; goodwill a day for the whole famine gap covered
  migGoodwill: 5,                          // goodwill per percent of its people a neighbour takes in, in the sender's view
  threatRate: 0.1, peaceRate: 0.05,        // grievance (aggressive) or goodwill (peaceful) a day per unit of the gaps
  pactLine: 40, pactBreak: 10, pactDays: 90,   // the relation a pact needs, both ways, for this many days; where it lapses
  hostileLine: -40, friendLine: 20,        // a seller refuses below; deals form sooner above
  lendLine: 15, interest: 0.0005, debtCapPerUnit: 100,   // who lends; interest a day; debt a nation may carry per unit of economy
};
const ROWS = [
  ["relFade", "goodwill and grievance fade", "/day"],
  ["dealGoodwill", "goodwill per deal delivered in full", "/day"], ["breakGrievance", "grievance per deal lapsed", "pts"],
  ["refusalGrievance", "grievance while refused", "/day"],
  ["aidShare", "food above comfort sent as aid", "share/day"], ["aidGoodwill", "goodwill for a famine gap covered", "/day"],
  ["migGoodwill", "goodwill per percent of a people taken in", "pts"],
  ["threatRate", "an aggressor's grievance per unit of gap", "/day"], ["peaceRate", "a peaceful nation's goodwill per unit of gap", "/day"],
  ["pactLine", "relation a pact needs", "pts"], ["pactBreak", "relation a pact lapses below", "pts"], ["pactDays", "days above the line before a pact", "days"],
  ["hostileLine", "a seller refuses below", "pts"], ["friendLine", "deals form sooner above", "pts"],
  ["lendLine", "a nation lends above", "pts"], ["interest", "interest on a loan", "/day"], ["debtCapPerUnit", "debt a unit of economy carries", "money"],
];
const K = { regionBase: 15, borderBase: 10, govLike: 10, govGap: 0.4,   // the baseline: same region, a land border, like governments (+10 alike, -0.4 a point of distance)
            repayRate: 0.02, defaultDays: 365, defaultGrievance: 40, lenderReserveDays: 30,   // repayment a day as a share of the debt; a default; what a lender keeps
            aidStoreLine: 0.9, stockCap: 100, prune: 0.05 };          // aid also flows from a store nine tenths full; a stock's ceiling
const RES = ["food", "energy", "materials"];
const FIELDS = [["views", "vw", {}], ["pacts", "pct", []], ["warm", "wrm", {}], ["temper", "tmp", 0.5], ["debts", "dbt", []], ["defaulted", "dfl", 0]];
const f = (v, d) => (+v || 0).toFixed(d == null ? 1 : d);

/* ── Seeding: temperament from the row until regimes carry it ── */
function seed(iso, s) {
  const r = D.rowOf(iso);
  s.temper = Math.max(0, Math.min(1, (r.authority || 50) / 100 * (1 - (r.freedom || 50) / 100) * 2));   // 1: all authority, no freedom
  s.views = {}; s.pacts = []; s.warm = {}; s.debts = []; s.defaulted = 0;
}
const temperWord = t => t >= 0.6 ? "hawkish" : t >= 0.35 ? "wary" : "open";

/* ── The relation: baseline from facts, plus the stocks ── */
const BASE = Object.create(null);           // a -> b -> baseline, static once the links are built (asked tens of thousands of times a day)
function baseline(a, b) {
  const row = BASE[a] || (BASE[a] = Object.create(null)); if (b in row) return row[b];
  const ra = D.rowOf(a), rb = D.rowOf(b), L = window.LINKS;
  let base = 0;
  if (G.COUNTRY_REGION[a] && G.COUNTRY_REGION[a] === G.COUNTRY_REGION[b]) base += K.regionBase;
  if (L && L.ready && L.linkedBy(a, b, "land")) base += K.borderBase;
  base += K.govLike - K.govGap * (Math.abs((ra.freedom || 50) - (rb.freedom || 50)) + Math.abs((ra.authority || 50) - (rb.authority || 50))) / 2;
  return (row[b] = base);
}
function viewOf(a, b) {                     // a's view of b, −100..100
  const s = W.COUNTRY_STATE[a], v = s && s.views && s.views[b];
  const rel = (v ? v.g - v.v : 0) + baseline(a, b);
  return rel > 100 ? 100 : rel < -100 ? -100 : rel;
}
function stock(s, b) { return s.views[b] || (s.views[b] = { g: 0, v: 0 }); }
const isAlly = (a, b) => { const s = W.COUNTRY_STATE[a]; return !!(s && s.pacts && s.pacts.includes(b)); };

/* ── The day ── */
function dailyWorld(rng, LW) {
  const S = W.COUNTRY_STATE, c = cfg(), L = window.LINKS, P = window.PRODUCTS, T = window.TRADE, day = W.day;
  if (!L || !L.ready || !E) return;
  const ledger = iso => W.ledgerOf(iso), add = (iso, k, label, v, unit, reason) => ledger(iso).add("relations", "relations." + k, label, v, unit, reason);
  const isos = Object.keys(S).filter(iso => S[iso].views && S[iso].shares);
  const strength = Object.create(null), wealth = Object.create(null);
  for (const iso of isos) { const s = S[iso]; strength[iso] = (P ? P.effectOf(s, "mil") : 0.5) * s.pop; wealth[iso] = (s._income || 0) / Math.max(s.pop, 1e-6); }
  let pactsSigned = 0, pactsLost = 0, loans = 0, aidUnits = 0, defaults = 0;
  for (const a of isos) {
    const s = S[a], Le = ledger(a);
    // 1. the stocks fade; what has faded to nothing is forgotten
    for (const b in s.views) {
      const v = s.views[b]; v.g = Math.min(K.stockCap, v.g * (1 - c.relFade)); v.v = Math.min(K.stockCap, v.v * (1 - c.relFade));
      if (v.g < K.prune && v.v < K.prune) delete s.views[b];
    }
    // 2. deals delivered and lapsed (the trade pillar left the day's records on the state)
    for (const d of (s.deals || [])) if (d.deliveredToday > 0 && S[d.from] && S[d.from].views) { const g = c.dealGoodwill * Math.min(1, d.deliveredToday); stock(s, d.from).g += g; stock(S[d.from], a).g += g; }   // a deal kept warms both sides
    for (const x of (s._lapsed || [])) { stock(s, x.from).v += c.breakGrievance; add(a, "grievance", "grievance", c.breakGrievance, "pts", "a deal from " + W.nameOf(x.from) + " lapsed"); }
    s._lapsed = null;
    // 3. refused by a seller
    for (const seller of new Set(s._refusedBy || [])) stock(s, seller).v += c.refusalGrievance;
    s._refusedBy = null;
    // 4. people taken in: the sender warms to the receiver
    for (const from in (s._arrivedFrom || {})) { const q = s._arrivedFrom[from]; if (S[from] && S[from].views) stock(S[from], a).g += c.migGoodwill * 100 * q / Math.max(S[from].pop, 1e-6); }
    s._arrivedFrom = null;
    // 5. threat assessment against every linked nation
    const aggr = s.temper, peace = 1 - s.temper;
    for (const b of L.partners(a)) {
      if (!S[b] || !S[b].views) continue;
      const weaker = Math.max(0, 1 - strength[b] / Math.max(strength[a], 1e-6));
      if (!(weaker > 0)) continue;
      const richer = Math.max(0, wealth[b] / Math.max(wealth[a], 1e-6) - 1);
      if (aggr > 0 && richer > 0) stock(s, b).v += c.threatRate * aggr * weaker * Math.min(richer, 2);
      if (peace > 0) stock(s, b).g += c.peaceRate * peace * weaker;
    }
  }
  // 6. aid: food above comfort to famine neighbours the giver does not resent
  for (const a of isos) {
    const s = S[a], Le = ledger(a), famine = Le.get("economy.famine");
    if (famine > 0.02 || !(s.stores[0] > 0)) continue;
    const price = (W.WORLD_STATE.prices || [1])[0], comfort = (T ? T.LEVERS.comfortDays : 15) / Math.max(price, 0.01) * s.pop;
    const line = Math.min(comfort, K.aidStoreLine * (window.ENTITY_CONFIG || E.LEVERS).storePerUnit * s.infra);   // the store's own ceiling counts as comfort when it is lower
    const excess = s.stores[0] - line; if (!(excess > 0)) continue;
    const needy = L.edgesOf(a).map(e => ({ e, to: e.a === a ? e.b : e.a })).filter(x => S[x.to] && S[x.to].views && ledger(x.to).get("economy.famine") > 0.02 && viewOf(a, x.to) >= 0);
    if (!needy.length) continue;
    const want = needy.map(x => ledger(x.to).get("economy.famine") * S[x.to].pop), tot = want.reduce((t, v) => t + v, 0);
    let budget = excess * c.aidShare;
    needy.forEach((x, i) => {
      const q = Math.min(budget * want[i] / tot, want[i], x.e.cap); if (!(q > 1e-9)) return;
      s.stores[0] -= q; S[x.to].stores[0] += q; budget -= q; aidUnits += q;
      stock(S[x.to], a).g += c.aidGoodwill * q / Math.max(want[i], 1e-9);
      add(a, "aid.given", "food given as aid", q, "units", "to " + W.nameOf(x.to)); add(x.to, "aid.received", "food received as aid", q, "units", "from " + W.nameOf(a));
      if (!s._aided || !s._aided[x.to]) { (s._aided || (s._aided = {}))[x.to] = true; W.log({ sev: "small", kind: "relations", iso: a, iso2: x.to, text: W.nameOf(a) + " sends food to " + W.nameOf(x.to) + " in its famine" }); }
    });
  }
  // 7. lending: a nation short of money for its bill borrows from the friend with the deepest treasury; repayment comes first
  for (const b of isos) {
    const s = S[b], Le = ledger(b);
    // repay what is owed, from the money the economy held back for it (js/economy.js holds s._due before it builds)
    for (const d of s.debts) {
      d.amount *= 1 + c.interest;
      const pay = Math.min(s.treasury, d.amount * K.repayRate);
      if (pay > 1e-9) { s.treasury -= pay; d.amount -= pay; if (pay >= 0.5 * d.amount * K.repayRate) d.lastPaid = day; if (S[d.to]) S[d.to].treasury += pay; add(b, "repaid", "repaid", pay, "money", "to " + W.nameOf(d.to)); }   // a trickle does not count as paying
      if (d.amount > 1 && day - (d.lastPaid || d.since) > K.defaultDays) {               // a year without a payment
        if (S[d.to] && S[d.to].views) { stock(S[d.to], b).v += K.defaultGrievance; S[d.to].pacts = S[d.to].pacts.filter(x => x !== b); s.pacts = s.pacts.filter(x => x !== d.to); }
        W.log({ sev: s.pop >= 50 ? "large" : "small", kind: "relations", iso: b, iso2: d.to, text: W.nameOf(b) + " defaults on " + f(d.amount, 0) + " owed to " + W.nameOf(d.to) });
        d.amount = 0; s.defaulted = day; defaults++;
      }
    }
    s.debts = s.debts.filter(d => d.amount > 1);
    const owed = s.debts.reduce((t, d) => t + d.amount, 0);
    s._due = owed * K.repayRate * (1 + c.interest);                 // tomorrow's repayment, held back from building
    const bill = (s._bill || 0) * E.K.holdDays, need = Math.max(0, bill - s.treasury);   // a month of the day's shortfall, less what it holds
    if (!(need > 1) || (s.defaulted && day - s.defaulted < K.defaultDays)) continue;
    const room = c.debtCapPerUnit * s.econ - owed; if (!(room > 1)) continue;
    let lender = null, deep = 0;
    for (const a of L.partners(b)) {
      const t = S[a]; if (!t || !t.views || viewOf(a, b) < c.lendLine) continue;
      const spare = t.treasury - K.lenderReserveDays * (window.ENTITY_CONFIG || E.LEVERS).budgetCapPerUnit * t.econ;
      if (spare > deep) { deep = spare; lender = a; }
    }
    if (!lender) continue;
    const q = Math.min(need, room, deep);
    S[lender].treasury -= q; s.treasury += q; loans += q;
    let d = s.debts.find(x => x.to === lender); if (!d) s.debts.push(d = { to: lender, amount: 0, since: day, lastPaid: day });
    d.amount += q;
    add(b, "borrowed", "borrowed", q, "money", "from " + W.nameOf(lender)); add(lender, "lent", "lent", q, "money", "to " + W.nameOf(b));
    if (q > 10 && (!s._borrowedFrom || !s._borrowedFrom[lender])) { (s._borrowedFrom || (s._borrowedFrom = {}))[lender] = true; W.log({ sev: "small", kind: "relations", iso: b, iso2: lender, text: W.nameOf(b) + " borrows from " + W.nameOf(lender) + " to pay for its imports" }); }
  }
  // 8. one pass over the pairs: pacts (a season above the line both ways signs one; below the break line it lapses),
  //    the readouts, and the sets the trade pillar reads tomorrow (whom a nation refuses, whom it calls a friend)
  let allies = 0;
  for (const a of isos) {
    const s = S[a], refuses = new Set(), friendly = new Set();
    let friends = 0, enemies = 0, sum = 0, n = 0;
    for (const b of L.partners(a)) {
      const t = S[b]; if (!t || !t.views) continue;
      const ab = viewOf(a, b); sum += ab; n++;
      if (ab >= c.friendLine) { friends++; friendly.add(b); }
      if (ab <= c.hostileLine) { enemies++; refuses.add(b); }
      if (b < a) continue;                                                // each pair once for the pact
      const ba = viewOf(b, a);
      if (s.pacts.includes(b)) {
        if (ab < c.pactBreak || ba < c.pactBreak) {
          s.pacts = s.pacts.filter(x => x !== b); t.pacts = t.pacts.filter(x => x !== a); pactsLost++;
          W.log({ sev: "small", kind: "relations", iso: a, iso2: b, text: "The pact between " + W.nameOf(a) + " and " + W.nameOf(b) + " lapses" });
        }
      } else if (ab >= c.pactLine && ba >= c.pactLine) {
        s.warm[b] = (s.warm[b] || 0) + 1;
        if (s.warm[b] >= c.pactDays) {
          s.pacts.push(b); t.pacts.push(a); delete s.warm[b]; pactsSigned++;
          W.log({ sev: (s.pop >= 50 || t.pop >= 50) ? "large" : "small", kind: "relations", iso: a, iso2: b, text: W.nameOf(a) + " and " + W.nameOf(b) + " sign a pact" });
        }
      } else if (s.warm[b]) delete s.warm[b];
    }
    s._friends = friends; s._enemies = enemies; s._meanView = n ? sum / n : 0; s._refuses = refuses; s._friendly = friendly;
    allies += s.pacts.length;
    add(a, "friends", "friends among its partners", friends, ""); add(a, "enemies", "enemies", enemies, ""); add(a, "allies", "allies", s.pacts.length, "");
    add(a, "debt", "owed", s.debts.reduce((t, d) => t + d.amount, 0), "money");
  }
  LW.add("relations", "relations.pacts", "pacts in force", allies / 2, ""); LW.add("relations", "relations.signed", "pacts signed", pactsSigned, "");
  LW.add("relations", "relations.lapsed", "pacts lapsed", pactsLost, ""); LW.add("relations", "relations.loans", "lent today", loans, "money");
  LW.add("relations", "relations.aid", "food given as aid", aidUnits, "units"); LW.add("relations", "relations.defaults", "defaults", defaults, "");
}

/* ── The card ── */
function rows(iso, L) {
  const s = W.COUNTRY_STATE[iso]; if (!s || !s.views) return [];
  const Lk = window.LINKS, out = [], g = k => L.get("relations." + k);
  out.push(["temperament", temperWord(s.temper), "from the data row until regimes decide"]);
  const ps = Lk && Lk.ready ? Lk.partners(iso).filter(b => W.COUNTRY_STATE[b] && W.COUNTRY_STATE[b].views).map(b => [b, viewOf(iso, b)]) : [];
  ps.sort((x, y) => y[1] - x[1]);
  if (s.pacts.length) out.push(["allies", s.pacts.map(b => W.nameOf(b)).join(", ")]);
  if (ps.length) {
    out.push(["warmest", ps.slice(0, 3).map(([b, v]) => W.nameOf(b) + " " + f(v, 0)).join(" · "), g("friends") + " friends"]);
    out.push(["coldest", ps.slice(-3).reverse().map(([b, v]) => W.nameOf(b) + " " + f(v, 0)).join(" · "), g("enemies") + " enemies"]);
  }
  for (const d of s.debts) out.push(["owes", f(d.amount, 0) + " to " + W.nameOf(d.to), d.lastPaid ? "last paid day " + d.lastPaid : ""]);
  if (g("aid.given")) out.push(["aid", "gave " + f(g("aid.given")) + " food"]);
  if (g("aid.received")) out.push(["aid", "received " + f(g("aid.received")) + " food"]);
  if (g("lent")) out.push(["lent", f(g("lent"), 0) + " today"]);
  return out;
}
const layers = [
  { key: "relations", label: "Friends", lo: "#5a2f3a", hi: "#2f6a5a", legend: ["hostile", "friendly"],
    value: st => 0.5 + Math.max(-1, Math.min(1, (st._meanView || 0) / 50)) / 2,
    show: st => f(st._meanView || 0, 0) + " mean view · " + (st.pacts ? st.pacts.length : 0) + " allies" },
];
function census(iso, s) {
  return { allies: s.pacts ? s.pacts.length : 0, friends: s._friends || 0, enemies: s._enemies || 0,
           debt: Math.round(s.debts ? s.debts.reduce((t, d) => t + d.amount, 0) : 0) };
}
function censusWorld(LW) {
  return { pacts: LW.get("relations.pacts"), loansToday: Math.round(LW.get("relations.loans")), aidToday: Math.round(LW.get("relations.aid")), defaults: LW.get("relations.defaults") };
}

window.RELATIONS = W.registerPillar({
  name: "relations", label: "Relations", fields: FIELDS, seed, dailyWorld, rows, census, censusWorld, layers,
  config: { group: "Relations", defaults: LEVERS, rows: ROWS },
  K, LEVERS, viewOf, baseline, isAlly, temperWord,
});
})();
