/* ═══════════════════════════════════════════════════════════════
   Entity — war: the army, wars and the peace table
   The fifth pillar (docs/design.md §5.5 as decided, docs/nations.md
   §6).  The army is a job: half the military budget share pays
   soldiers at the economy's wage, as many as that pays for up to a
   cap of the population, taken out of the labour pool before the
   economy; the rest of the share builds the level (js/products.js).
   Strength is the level's effect times the soldiers.  A nation short
   of a resource for a month attacks a weaker, land-linked neighbour it
   dislikes that has a surplus of it; a nation attacks a neighbour it
   holds in enmity that it outweighs two to one.  A defender's allies
   join; an attacker's hawkish allies join.  Each day of war both sides
   lose military level and soldiers in proportion to the enemy's
   strength over their own, the weaker side loses infrastructure and
   people flee it, and the border between enemies is closed to trade.
   Every week the two principals put terms on the table: the stronger
   demands a tribute that shrinks as it tires, the weaker offers one
   that grows as it tires, and the war ends the week they meet, or by
   surrender, or in a white peace once both are weary.  A tribute is a
   share of the loser's daily capture (or income) for a year; a month
   unpaid breaks it.  Runs last in the world's day.
   ═══════════════════════════════════════════════════════════════ */
(() => {
"use strict";
const W = window.WORLD, E = window.ECONOMY;
const cfg = () => window.ENTITY_CONFIG || LEVERS;

/* ── Levers: the config panel's War group (fifteen, the target) ── */
const LEVERS = {
  soldierPay: 0.5, armyMin: 0.005, armyCap: 0.02, warArmyCap: 0.05, warShare: 0.3,   // the military share's half that pays wages; conscripts kept whatever the budget; the army's cap in peace and at war; the share at war
  shortDays: 30, attackMargin: 1.5, doveMargin: 3, enmityMargin: 2, greedMargin: 3,   // days short before a war; the strength a hawk, a dove, an enmity war, a greed war needs
  attrition: 0.003, casualty: 0.001, damage: 0.0005, flight: 0.0005, // a day at parity: level lost, soldiers killed, the weaker side's infrastructure lost, its people fleeing
  maxTribute: 0.5, termsDays: 7, minWarDays: 30,                     // the tribute's ceiling; how often terms are tabled; no peace before this
};
const ROWS = [
  ["soldierPay", "military share paid as wages", "share"], ["armyMin", "conscripts kept whatever the budget", "share of people"], ["armyCap", "army cap in peace", "share of people"], ["warArmyCap", "army cap at war", "share of people"],
  ["warShare", "military share at war", "share"],
  ["shortDays", "days short before a war", "days"], ["attackMargin", "strength a hawk needs", "×"], ["doveMargin", "strength a dove needs", "×"], ["enmityMargin", "strength an enmity war needs", "×"], ["greedMargin", "strength a greed war needs", "×"],
  ["attrition", "level lost a day at parity", "share"], ["casualty", "soldiers killed a day at parity", "share"], ["damage", "infrastructure lost a day, the weaker side", "share"], ["flight", "people fleeing a day, the weaker side", "share"],
  ["maxTribute", "tribute ceiling", "share of capture"], ["termsDays", "terms tabled every", "days"], ["minWarDays", "no peace before", "days"],
];
const K = { hawkLine: 0.6, doveLine: 0.35, hawkView: 20, waryView: 0, doveView: -20, waryMargin: 2, season: 90,   // temperament lines (js/relations.js); the view and strength each needs; one start a season
            wearyDay: 1 / 365, wearyLevel: 0.5, wearyPeople: 2, wearyFade: 0.01,   // weariness: a day, the share of the level lost, the share of the people lost; its fade in peace
            surrenderPos: -0.6, surrenderWeary: 0.5, whitePos: 0.1, whiteWeary: 0.5,   // surrender; a white peace
            tributeTerm: 365, brokenDays: 30, surplusMargin: 1.1,          // a tribute's term; a month half-paid breaks it; capture over use that counts as a surplus
            attackGrievance: 60, lossGrievance: 40, neighbourGrievance: 20, brokenGrievance: 40, flightCap: 10, ratioCap: 5 };   // the enemy's strength over ours counts up to fivefold
const RES = ["food", "energy", "materials"], RNAME = r => r < 0 ? "money" : RES[r];
const FIELDS = [["soldiers", "sol", 0], ["weary", "wry", 0], ["lastWar", "lw", -9999], ["shortDays", "sdy", [0, 0, 0]]];
const WORLD_FIELDS = [["wars", "wrs", []], ["tributes", "trb", []], ["warsStarted", "wst", 0], ["peaces", "pce", 0]];
const f = (v, d) => (+v || 0).toFixed(d == null ? 1 : d), pct = v => Math.round(v * 100) + "%";
const name = iso => W.nameOf(iso);

function seed(iso, s) { s.soldiers = 0; s.weary = 0; s.lastWar = -9999; s.shortDays = [0, 0, 0]; }

/* ── Strength and the wars a nation is in ── */
const strengthOf = s => (window.PRODUCTS ? window.PRODUCTS.effectOf(s, "mil") : 0) * (s.soldiers || 0);
const WS = () => W.WORLD_STATE;
const LAND = Object.create(null);           // iso -> its land neighbours, once per graph (asked for every nation every day)
function landNeighbours(iso) { const L = window.LINKS; return LAND[iso] || (LAND[iso] = L.partners(iso).filter(b => L.linkedBy(iso, b, "land"))); }
const warsOf = iso => (WS().wars || []).filter(w => w.sides.a.includes(iso) || w.sides.b.includes(iso));
const sideOf = (w, iso) => w.sides.a.includes(iso) ? "a" : "b";
const other = side => side === "a" ? "b" : "a";
const sideStrength = (w, side) => w.sides[side].reduce((t, iso) => t + (W.COUNTRY_STATE[iso] ? strengthOf(W.COUNTRY_STATE[iso]) : 0), 0);
function enemiesOf(iso) { const out = new Set(); for (const w of warsOf(iso)) for (const e of w.sides[other(sideOf(w, iso))]) out.add(e); return out; }
const shareWord = sh => sh >= 0.4 ? "half" : sh >= 0.28 ? "a third" : sh >= 0.2 ? "a quarter" : sh >= 0.15 ? "a fifth" : sh >= 0.07 ? "a tenth" : sh > 0 ? "a sliver" : "nothing";

/* ── Declaring a war ── */
function join(w, side, iso) { const s = W.COUNTRY_STATE[iso]; w.sides[side].push(iso); s.atWar = true; w.start[iso] = s.mil || 0; }
function declare(a, b, r, why) {
  const S = W.COUNTRY_STATE, R = window.RELATIONS, day = W.day;
  if (!S[a] || !S[b] || a === b) return null;
  const w = { id: ++WS().warsStarted, a, b, r: r == null ? -1 : r, since: day, sides: { a: [], b: [] }, start: {}, pos: 0, terms: null };
  join(w, "a", a); join(w, "b", b);
  S[a].lastWar = day;
  if (R) {
    R.addGrievance(b, a, K.attackGrievance);                                               // the attacked do not forget
    for (const c of (S[b].pacts || [])) if (S[c] && !S[c].atWar && !R.isAlly(c, a)) { join(w, "b", c); W.log({ sev: "small", kind: "war", iso: c, iso2: a, text: name(c) + " joins " + name(b) + "'s war against " + name(a) }); }
    for (const c of (S[a].pacts || [])) if (S[c] && !S[c].atWar && (S[c].temper || 0) >= K.hawkLine && !R.isAlly(c, b)) { join(w, "a", c); W.log({ sev: "small", kind: "war", iso: c, iso2: b, text: name(c) + " joins " + name(a) + "'s war against " + name(b) }); }
  }
  for (const x of w.sides.a) for (const y of w.sides.b) sever(x, y);
  WS().wars.push(w);
  const big = S[a].pop >= 50 || S[b].pop >= 50;
  W.log({ sev: big ? "massive" : "large", kind: "war", iso: a, iso2: b, text: name(a) + " attacks " + name(b) + (w.r >= 0 ? " over " + RES[w.r] : "") + (why ? ": " + why : "") });
  return w;
}
function sever(x, y) {                        // enemies: no deals, no pact
  const S = W.COUNTRY_STATE, sx = S[x], sy = S[y];
  if (sx.deals) sx.deals = sx.deals.filter(d => d.from !== y); if (sy.deals) sy.deals = sy.deals.filter(d => d.from !== x);
  if (sx.pacts) sx.pacts = sx.pacts.filter(p => p !== y); if (sy.pacts) sy.pacts = sy.pacts.filter(p => p !== x);
}

/* ── Peace ── */
function peace(w, strong, share, how) {
  const S = W.COUNTRY_STATE, R = window.RELATIONS, L = window.LINKS, day = W.day;
  const winner = w[strong], loser = w[other(strong)];
  if (share > 1e-6) { WS().tributes = WS().tributes.filter(t => !(t.from === loser && t.to === winner)); WS().tributes.push({ from: loser, to: winner, r: w.r, share, until: day + K.tributeTerm, missed: 0 }); }   // one tribute a pair
  if (R) {
    R.addGrievance(loser, winner, K.lossGrievance);
    if (L) for (const n of L.partners(loser)) if (n !== winner && S[n] && (S[n].temper || 0) < K.doveLine && !w.sides.a.includes(n) && !w.sides.b.includes(n)) R.addGrievance(n, winner, K.neighbourGrievance);
  }
  const ws = WS(); ws.wars = ws.wars.filter(x => x !== w); ws.peaces++;
  for (const iso of w.sides.a.concat(w.sides.b)) if (S[iso]) S[iso].atWar = warsOf(iso).length > 0;
  const terms = share > 1e-6 ? name(loser) + " pays " + shareWord(share) + " of its " + RNAME(w.r) + " for a year" : "nothing changes hands";
  const big = S[winner].pop >= 50 || S[loser].pop >= 50;
  W.log({ sev: big ? "massive" : "large", kind: "war", iso: winner, iso2: loser,
          text: how === "surrender" ? name(loser) + " surrenders to " + name(winner) + ": " + terms
              : how === "white" ? name(w.a) + " and " + name(w.b) + " make a white peace after " + (day - w.since) + " days"
              : name(winner) + " and " + name(loser) + " make peace after " + (day - w.since) + " days: " + terms });
}

/* ── The day ── */
function dailyWorld(rng, LW) {
  const S = W.COUNTRY_STATE, c = cfg(), L = window.LINKS, R = window.RELATIONS, T = window.TRADE, day = W.day, ws = WS();
  if (!L || !L.ready || !E || !window.PRODUCTS) return;
  const ledger = iso => W.ledgerOf(iso), add = (iso, k, label, v, unit, reason) => ledger(iso).add("war", "war." + k, label, v, unit, reason);
  const isos = Object.keys(S).filter(iso => S[iso].shares && S[iso].soldiers != null);
  let peacesToday = 0, startedToday = 0;
  // 1. the army: as many soldiers as the wages the economy set aside pay for, up to the cap; the rest of the money goes back
  for (const iso of isos) {
    const s = S[iso], Le = ledger(iso), wage = E.wageOf(s), budget = s._wageBudget || 0;
    const cap = (s.atWar ? c.warArmyCap : c.armyCap) * s.pop, conscripts = c.armyMin * s.pop;
    const paidFor = Math.max(0, Math.min(wage > 0 ? budget / wage : 0, cap, s.pop));
    const soldiers = Math.max(paidFor, Math.min(conscripts, s.pop));           // conscripts serve unpaid when the wages pay for fewer
    const wages = paidFor * wage;
    s.treasury += budget - wages; s._wageBudget = 0;
    s.soldiers = soldiers;
    add(iso, "soldiers", "soldiers", soldiers, "M", pct(soldiers / Math.max(s.pop, 1e-6)) + " of the people, " + (paidFor >= cap - 1e-9 ? "at the cap" : paidFor >= conscripts ? "what the wages pay" : "conscripts"));
    if (wages > 0) add(iso, "wages", "soldiers paid", wages, "money");
    add(iso, "strength", "strength", strengthOf(s), "", "effect × soldiers");
    // how long it has been short of each resource
    const famine = Le.get("economy.famine"), paid = s._paid == null ? 1 : s._paid, uE = Le.get("trade.unmet.energy"), uM = Le.get("trade.unmet.materials");
    const sd = s.shortDays || (s.shortDays = [0, 0, 0]);
    sd[0] = famine > 0.02 ? sd[0] + 1 : 0;
    sd[1] = paid < E.K.shortLine && uE >= uM ? sd[1] + 1 : 0;
    sd[2] = paid < E.K.shortLine && uM > uE ? sd[2] + 1 : 0;
    if (!s.atWar && s.weary > 0) s.weary = Math.max(0, s.weary - s.weary * K.wearyFade - 1e-6);
  }
  // 2. the wars: a day of fighting each, then the terms
  for (const w of ws.wars.slice()) {
    const Sa = sideStrength(w, "a"), Sb = sideStrength(w, "b"), tot = Sa + Sb;
    w.pos = tot > 0 ? (Sa - Sb) / tot : 0;
    for (const side of ["a", "b"]) {
      const own = side === "a" ? Sa : Sb, enemy = side === "a" ? Sb : Sa, pos = side === "a" ? w.pos : -w.pos;
      const ratio = Math.max(1 / K.ratioCap, Math.min(K.ratioCap, own > 0 ? enemy / own : K.ratioCap));
      const foes = w.sides[other(side)];
      for (const iso of w.sides[side]) {
        const s = S[iso]; if (!s) continue;
        const lost = s.mil * c.attrition * ratio; s.mil -= lost;
        const died = Math.min(s.soldiers, s.soldiers * c.casualty * ratio); s.pop = Math.max(0.001, s.pop - died); s.soldiers -= died;
        add(iso, "lost", "military lost in war", lost, "pts", "the enemy " + f(ratio, 1) + "× as strong"); add(iso, "killed", "killed in war", died, "M");
        s.weary = Math.min(1, s.weary + K.wearyDay + K.wearyLevel * lost / Math.max(w.start[iso], 1e-6) + K.wearyPeople * died / Math.max(s.pop, 1e-6));
        if (pos < 0) {
          const dmg = s.infra * c.damage * ratio; s.infra -= dmg; add(iso, "destroyed", "infrastructure destroyed", dmg, "units");
          flee(iso, c.flight * ratio * s.pop, foes, c, add);
        }
        const refuses = s._refuses || (s._refuses = new Set()); for (const e of foes) refuses.add(e);   // the border is closed (js/trade.js reads it tomorrow)
      }
    }
    const days = day - w.since;
    if (days >= c.termsDays && days % c.termsDays === 0) {
      const strong = w.pos >= 0 ? "a" : "b", weak = other(strong), p = Math.abs(w.pos);
      const wsg = S[w[strong]].weary, wwk = S[w[weak]].weary;
      const demand = p * c.maxTribute * (1 - wsg), offer = p * c.maxTribute * (0.5 + wwk);
      w.terms = { strong, demand, offer, day };
      if (-p <= K.surrenderPos && wwk >= K.surrenderWeary) { peace(w, strong, c.maxTribute, "surrender"); peacesToday++; }
      else if (p < K.whitePos) { if (wsg >= K.whiteWeary && wwk >= K.whiteWeary && days >= c.minWarDays) { peace(w, strong, 0, "white"); peacesToday++; } }
      else if (offer >= demand && days >= c.minWarDays) { peace(w, strong, Math.min(c.maxTribute, (offer + demand) / 2), "terms"); peacesToday++; }
    }
  }
  // 3. tributes: a share of the loser's capture or income, from its store or treasury, to the winner; the economy
  //    holds tomorrow's money tribute before it builds (s._tributeDue), so a payer with an income pays
  for (const iso of isos) S[iso]._tributeDue = 0;
  for (const t of ws.tributes.slice()) {
    const from = S[t.from], to = S[t.to];
    if (!from || !to) { ws.tributes = ws.tributes.filter(x => x !== t); continue; }
    const q = t.r < 0 ? t.share * (from._income || 0) : t.share * ledger(t.from).get("economy.captured." + RES[t.r]);
    const paid = Math.max(0, Math.min(q, t.r < 0 ? from.treasury : from.stores[t.r]));
    if (t.r < 0) { from.treasury -= paid; to.treasury += paid; } else { from.stores[t.r] -= paid; to.stores[t.r] += paid; }
    add(t.from, "tribute.paid", "tribute paid", paid, t.r < 0 ? "money" : "units", shareWord(t.share) + " of its " + RNAME(t.r) + " to " + name(t.to));
    add(t.to, "tribute.received", "tribute received", paid, t.r < 0 ? "money" : "units", "from " + name(t.from));
    if (t.r < 0) from._tributeDue = (from._tributeDue || 0) + t.share * (from._income || 0);
    const short = t.r === 0 ? ledger(t.from).get("economy.famine") > 0.02 : t.r > 0 ? (from._paid == null ? 1 : from._paid) < E.K.shortLine : false;
    t.missed = q > 1e-9 && paid < 0.5 * q && !short ? t.missed + 1 : 0;          // a payer that has the means and does not pay
    if (t.missed >= K.brokenDays) {
      if (R) R.addGrievance(t.to, t.from, K.brokenGrievance); to.lastWar = -9999;
      W.log({ sev: "large", kind: "war", iso: t.from, iso2: t.to, text: name(t.from) + " stops paying its tribute to " + name(t.to) });
      ws.tributes = ws.tributes.filter(x => x !== t); continue;
    }
    if (day >= t.until) { W.log({ sev: "small", kind: "war", iso: t.from, iso2: t.to, text: name(t.from) + "'s tribute to " + name(t.to) + " ends" }); ws.tributes = ws.tributes.filter(x => x !== t); }
  }
  // 4. new wars: once a season, against the weakest land neighbour that qualifies, by need, greed or enmity;
  //    a hawk already fighting on one front may open a second if it still outweighs both enemies three to one
  if (R && day >= K.season) for (const iso of isos) {                          // a season to take the measure of the neighbours first
    const s = S[iso], temper = s.temper || 0, hawk = temper >= K.hawkLine, dove = temper < K.doveLine;
    if (!(s.soldiers > 0) || day - s.lastWar < K.season) continue;
    const fronts = warsOf(iso); if (fronts.length >= 2 || (fronts.length === 1 && !hawk)) continue;
    const viewLine = hawk ? K.hawkView : dove ? K.doveView : K.waryView, margin = hawk ? c.attackMargin : dove ? c.doveMargin : K.waryMargin;
    const myS = strengthOf(s); if (!(myS > 0)) continue;
    let busy = 0; for (const w of fronts) busy += sideStrength(w, other(sideOf(w, iso)));   // the enemies already in the field
    const wealth = (s._income || 0) / Math.max(s.pop, 1e-6);
    const sd = s.shortDays; let shortR = null;
    for (let r = 0; r < 3; r++) if (sd[r] >= c.shortDays && (shortR == null || sd[r] > sd[shortR])) shortR = r;
    let best = null;
    for (const b of landNeighbours(iso)) {
      const t = S[b]; if (!t || t.soldiers == null || t.atWar || R.isAlly(iso, b)) continue;
      if (ws.tributes.some(x => x.from === b && x.to === iso)) continue;        // it already pays: no second war while the tribute lasts
      const ratio = myS / Math.max(busy + strengthOf(t), 1e-9), view = R.viewOf(iso, b);
      const need = fronts.length ? Math.max(margin, c.greedMargin) : margin;
      let r = null, why = null;
      if (shortR != null && view < viewLine && ratio >= need && hasSurplus(b, shortR, c)) { r = shortR; why = "short of " + RES[shortR] + " for " + sd[shortR] + " days, and " + name(b) + " has a surplus"; }
      else if (hawk && view < K.hawkView && ratio >= c.greedMargin && (t._income || 0) / Math.max(t.pop, 1e-6) > wealth) { r = -1; why = "richer and weaker"; }
      else if (view <= R.LEVERS.hostileLine && ratio >= Math.max(c.enmityMargin, fronts.length ? c.greedMargin : 0)) { r = -1; why = "an old enmity"; }
      if (r != null && (!best || ratio > best.ratio)) best = { b, r, ratio, why };
    }
    if (best) { declare(iso, best.b, best.r, best.why); startedToday++; }
  }
  // 5. the world's lines
  LW.add("war", "war.wars", "wars under way", ws.wars.length, ""); LW.add("war", "war.started", "wars begun", startedToday, "");
  LW.add("war", "war.peaces", "peaces made", peacesToday, ""); LW.add("war", "war.tributes", "tributes being paid", ws.tributes.length, "");
  LW.add("war", "war.soldiers", "soldiers", isos.reduce((t, iso) => t + S[iso].soldiers, 0), "M");
}
function hasSurplus(b, r, c) {
  const s = W.COUNTRY_STATE[b], Le = W.ledgerOf(b), N = E.needs(s, window.ENTITY_CONFIG || E.LEVERS);
  const use = r === 0 ? N.food : r === 1 ? N.upkE + N.techE + Le.get("economy.captureEnergy") : N.upkM;
  const price = (W.WORLD_STATE.prices || [1, 1, 1])[r], comfort = (window.TRADE ? window.TRADE.LEVERS.comfortDays : 15) / Math.max(price, 0.01) * use;
  return Le.get("economy.captured." + RES[r]) > K.surplusMargin * use || s.stores[r] > comfort;
}
function flee(iso, amount, foes, c, add) {    // the weaker side's people leave along its other links, to room
  const S = W.COUNTRY_STATE, L = window.LINKS, T = window.TRADE, s = S[iso]; if (!(amount > 1e-9)) return;
  const migPerCap = T ? T.LEVERS.migPerCap : 0.0005;
  const edges = L.edgesOf(iso).map(e => ({ e, to: e.a === iso ? e.b : e.a })).filter(x => S[x.to] && S[x.to].shares && !foes.includes(x.to) && !S[x.to].atWar);
  const room = x => Math.max(0, W.ledgerOf(x.to).get("economy.housing") - S[x.to].pop), sumRoom = edges.reduce((t, x) => t + room(x), 0);
  if (!(sumRoom > 0)) return;
  let fled = 0;
  for (const x of edges) {
    const q = Math.min(amount * room(x) / sumRoom, K.flightCap * migPerCap * x.e.cap, room(x), s.pop - 0.001); if (!(q > 1e-9)) continue;
    s.pop -= q; S[x.to].pop += q; fled += q;
    (S[x.to]._arrivedFrom || (S[x.to]._arrivedFrom = {}))[iso] = (S[x.to]._arrivedFrom[iso] || 0) + q;
    add(x.to, "refugees", "refugees taken in", q, "M", "from " + name(iso));
  }
  if (fled > 0) add(iso, "fled", "fled the war", fled, "M");
}

/* ── The card ── */
function rows(iso, L) {
  const s = W.COUNTRY_STATE[iso]; if (!s || s.soldiers == null) return [];
  const out = [], g = k => L.get("war." + k), ws = WS();
  out.push(["army", f(s.soldiers, 2) + " M, " + pct(s.soldiers / Math.max(s.pop, 1e-6)) + " of the people", "wages " + f(g("wages"), 0) + " a day, strength " + f(g("strength"), 2)]);
  for (const w of warsOf(iso)) {
    const side = sideOf(w, iso), foes = w.sides[other(side)].map(name).join(", "), pos = side === "a" ? w.pos : -w.pos;
    out.push(["at war", "with " + foes + " since day " + w.since + (w.r >= 0 ? ", over " + RES[w.r] : ""), "position " + f(pos, 2) + ", weariness " + f(s.weary, 2)]);
    if (w.terms && (iso === w.a || iso === w.b)) {
      const strong = w[w.terms.strong] === iso;
      out.push(["terms", strong ? "demands " + pct(w.terms.demand) + " of " + name(w[other(w.terms.strong)]) + "'s " + RNAME(w.r) : "offers " + pct(w.terms.offer) + " of its " + RNAME(w.r),
                strong ? "they offer " + pct(w.terms.offer) : "they demand " + pct(w.terms.demand)]);
    }
    if (g("lost")) out.push(["today", f(g("lost"), 2) + " level lost, " + f(g("killed"), 3) + " M killed" + (g("destroyed") ? ", " + f(g("destroyed"), 2) + " infrastructure destroyed" : "") + (g("fled") ? ", " + f(g("fled"), 3) + " M fled" : "")]);
  }
  for (const t of ws.tributes) {
    if (t.from === iso) out.push(["tribute", "pays " + shareWord(t.share) + " of its " + RNAME(t.r) + " to " + name(t.to), "until day " + t.until + (t.missed ? ", " + t.missed + " days unpaid" : "")]);
    if (t.to === iso) out.push(["tribute", "receives " + shareWord(t.share) + " of " + name(t.from) + "'s " + RNAME(t.r), f(g("tribute.received"), 1) + " today"]);
  }
  const sd = s.shortDays || [0, 0, 0];
  for (let r = 0; r < 3; r++) if (sd[r] >= 10) out.push(["short", "of " + RES[r] + " for " + sd[r] + " days", sd[r] >= cfg().shortDays && !s.atWar ? "looking at its neighbours" : ""]);
  if (s.weary > 0.01 && !s.atWar) out.push(["weariness", f(s.weary, 2), "fading"]);
  return out;
}
const layers = [
  { key: "war", label: "War", lo: "#2a2320", hi: "#ff4a3a", legend: ["peace", "at war"],
    value: (st, iso) => st.atWar ? 1 : WS().tributes.some(t => t.from === iso || t.to === iso) ? 0.45 : (st.weary || 0) > 0.05 ? 0.2 : 0,
    show: st => st.atWar ? "at war, weariness " + f(st.weary, 2) : f(st.soldiers || 0, 2) + " M soldiers" },
];
function census(iso, s) {
  const ws = WS();
  return { soldiers: Math.round((s.soldiers || 0) * 100) / 100, atWar: !!s.atWar, paysTribute: ws.tributes.some(t => t.from === iso) };
}
function censusWorld(LW) {
  const ws = WS();
  return { wars: ws.wars.length, warsStarted: ws.warsStarted, peaces: ws.peaces, tributes: ws.tributes.length, soldiers: Math.round(LW.get("war.soldiers")) };
}

window.WAR = W.registerPillar({
  name: "war", label: "War", fields: FIELDS, worldFields: WORLD_FIELDS, seed, dailyWorld, rows, census, censusWorld, layers,
  config: { group: "War", defaults: LEVERS, rows: ROWS },
  K, LEVERS, strengthOf, warsOf, enemiesOf, declare, peace,
});
})();
