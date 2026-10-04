/* ═══════════════════════════════════════════════════════════════
   Entity — decide: what a country does about its situation
   Three cadences.  Every day the economy (js/economy.js) buys on the
   exchange by rule.  Once a week, on its weekday, a country scores the
   diplomatic and economic moves open to it — a trade deal, sanctions,
   a pact, its borders — and draws one with a softmax over the scores.
   Once a month, on its day, it sets its budget (which upkeep it can
   pay), then scores the big moves — an investment project, research,
   war, peace — and draws one; at war it builds nothing but its army.
   Every move is scored in one unit: what it is worth over the
   government's horizon in days of the country's income, less what it
   costs, discounted by its risk and the government's caution.  A
   project is worth the gap it closes, a deal the market's cut it saves,
   a war the prize less the campaign and the chance of losing it, a
   sanction the satisfaction of hurting an enemy less the deals it ends.
   Priorities (what a point of each stat is worth, how far ahead it
   looks, what it keeps back) come from a fixed seeded temperament and
   the government.  The likeliest choice usually wins but not always.
   Every decision keeps its top reasons for the country screen.

   Resources drive the economy (world.js): the scarcest of a country's
   four supplies caps it.  So a trade deal is scored by how far the
   partner's surplus lifts that binding resource, and a war by how far
   the target's resources, drawn under occupation, would — that is
   greed.  Enmity (relations far below zero) is the other motive.
   Either only tempts a country as far as its aggression and its
   strength edge allow: the attacker's strength with allies against
   the defender's, who fights dug in and, across a mountain border,
   behind terrain — so only overwhelming force attacks.  A thin
   treasury subtracts, and so does war-weariness, which both sides gain
   when a war starts and for every day it lasts and shed over years.
   Peace is at least a truce, above the war gate; a stalemate or a
   victory leaves enmity behind, damped by the weariness.

   Wars are campaigns: each day the two sides' strength (military,
   technology, infrastructure, pact allies, the defender's edge) moves
   a score, both sides bleed economy, infrastructure, stability and
   their armies, and the war ends in victory, peace or a stalemate.
   An ally that can reach a member of the other side opens a front of
   its own there, with its own score; a country's force is split across
   its fronts; an ally
   beaten on its front is knocked out, a principal beaten on any front
   is defeated; the winning side's members with a front share the
   terms and the chance to occupy.  An ally who joins calls its own
   pact partners in turn.
   Victory takes tribute and can impose occupation: for a while the
   winner takes the loser's decisions, skims its income and draws a
   share of its resources, and on release the loser's government is
   bent toward the winner's.  Micro-states never fight.  Outbreak
   reactions are at the end.
   ═══════════════════════════════════════════════════════════════ */
(() => {
"use strict";
const cfg = () => window.ENTITY_CONFIG;
const W = () => window.WORLD;
const { RES_KEYS, clamp, temperament, frontier, hash32 } = window.COUNTRIES;

const INVEST = ["infra", "military", "academia", "medical", "stability"];
const BORDER_NAME = ["opens its borders", "restricts its borders", "closes its borders"];
const r0 = v => Math.round(v);
const canFight = s => !!s && !!s.st && s.pop >= 0.5 && !s.occupiedBy;   // no micro-states, no occupied

/* ── Resources: what a deal or a conquest would do for us ─────────
   Supply per type comes from world.js; the lowest type caps the economy,
   so what matters about any gain is how far it lifts that floor.  Every
   other shortfall it eases counts a little, to break ties. */
const bindingOf = sp => { let k = 0; for (let i = 1; i < 4; i++) if (sp[i] < sp[k]) k = i; return k; };
const researchCost = (s, c) => c.researchDays * window.ECONOMY.taxIncome(s);
/* What the exchange costs us a day against what we take in, 0 to 1.  A
   country paying a large share of its income for resources has a reason
   to fund the science that needs less of them. */
function billShare(s) {
  if (!s || !s.bill) return 0;
  let total = 0;
  for (let k = 0; k < 4; k++) total += s.bill[k] || 0;
  return clamp(total / Math.max(1, window.ECONOMY.taxIncome(s)), 0, 1);
}
/* How much of a surplus a country will commit to one deal.  A country
   with barely more than it uses keeps most of it back; a country
   producing several times its own need behaves like an exporter and
   signs nearly all of it away.  Takes a standing record. */
function sellShare(SX, k, c) {
  if (!SX || k < 0) return c.dealSpareShare;
  const ratio = Math.min(3, SX.spare[k] / Math.max(1e-9, SX.cons[k]));
  return Math.min(c.dealSpareTop, c.dealSpareShare + c.dealSpareScale * ratio);
}
/* The type a country structurally lacks most, by share of its use. */
function worstGap(iso) {
  const st = standing(iso);
  let k = 0, worst = -1;
  for (let i = 0; i < 4; i++) { const g = st && st.cons[i] > 0 ? st.gap[i] / st.cons[i] : 0; if (g > worst) { worst = g; k = i; } }
  return k;
}
/* What we pay the exchange for the types a target could supply, against
   our income: the cost of dependence, and the type it weighs on most. */
function dependency(s, o, income) {
  const bill = s.bill, spare = o.production && o.consumption ? o.production.map((p, k) => Math.max(0, p - o.consumption[k])) : null;
  let type = -1, ratio = 0;
  if (bill && spare) for (let k = 0; k < 4; k++) {
    if (!(bill[k] > 0) || !(spare[k] > 0)) continue;
    const r = Math.min(1, bill[k] / Math.max(1, income));
    if (r > ratio) { ratio = r; type = k; }
  }
  return { type, ratio };
}
/* What a unit of a type is worth to a country against the world price: more than one when it is short of it
   today, and for food and water more again in famine, up to dealNeedMax.  The hungry deal in proposeSwap prices
   food and water by this rule; this is the general form, read by the prize and by a lease, so that a target that
   has what we lack is worth more than its production at the world price. */
function needPriceOf(s, k, c) {
  const bal = s && s.balance ? s.balance[k] : 1, fam = k === 2 || k === 3 ? ((s && s.famine) || 0) : 0;
  return Math.min(c.dealNeedMax, 1 + c.dealHunger * fam + c.dealShortNeed * Math.max(0, 1 - bal));
}
/* What a held country pays its occupier in money a day: the skim, and the victor's indemnity, which runs
   for exactly as long as the occupation does.  One expression, read by the prize that is predicted before
   a war and by the occupation that pays it afterwards, so the two cannot drift apart. */
const occupyYield = (o, c) => (c.occupySkim + c.occupyIndemnity) * window.ECONOMY.taxIncome(o);
/* What occupying a country yields a day: the taken share of its production
   at world prices and the money it hands over.  Money, so it compares to income. */
function spoilsOf(o, c, taker) {                                       // taker: price each type at what it is worth to them
  const M = W().WORLD_STATE.market, prod = o.production;
  let v = 0;
  if (M && prod) for (let k = 0; k < 4; k++) v += c.occupyRes * prod[k] * M.price[k] * (taker ? needPriceOf(taker, k, c) : 1);
  return v + occupyYield(o, c);
}
/* ── A deal as a recurring swap ─────────────────────────────────
   What each side structurally lacks (consumption over net production)
   and what it structurally holds spare sets the two legs; the amounts
   are matched at world prices so neither side simply hands value over.
   The yardstick is the exchange: the cargo taken would otherwise have
   to be bought landed, with the spread and the transport, and it would
   use up the country's one purchase a day.  A deal with a neighbour
   therefore beats the market and a deal across the world does not.
   When one side has nothing spare to send back it pays money, and a
   much more advanced payer may send technology instead of some of it.
   Returns the record, both sides' worth per day, and whether both of
   them would sign. */
function standing(iso) {
  const W_ = W(), s = W_.COUNTRY_STATE[iso];
  if (!s || !s.st || !s.potential) return null;
  const a = s.production ? s : window.ECONOMY.assess(iso);
  if (!a || !a.production) return null;
  const inn = s.dealIn, out = s.dealOut, gap = [0, 0, 0, 0], spare = [0, 0, 0, 0];
  for (let k = 0; k < 4; k++) {
    const net = a.production[k] + (inn ? inn[k] : 0) - (out ? out[k] : 0);
    gap[k] = Math.max(0, a.consumption[k] - net);
    spare[k] = Math.max(0, net - a.consumption[k]);
  }
  return { s, cons: a.consumption, gap, spare };
}
function proposeSwap(a, b) {
  const W_ = W(), S = W_.COUNTRY_STATE, c = cfg(), E = window.ECONOMY;
  const M = W_.WORLD_STATE.market, price = M && M.price ? M.price : [1, 1, 1, 1];
  const SA = standing(a), SB = standing(b);
  if (!SA || !SB) return null;
  const incA = E.taxIncome(SA.s), incB = E.taxIncome(SB.s);
  // hunger: food or water is worth more than the world price to a country in famine or short of it today, up to dealNeedMax
  const needOf = (SX, t) => {
    if (t !== 2 && t !== 3) return 1;
    const s = SX.s, bal = s.balance ? s.balance[t] : 1;
    return Math.min(c.dealNeedMax, 1 + c.dealHunger * (s.famine || 0) + c.dealShortNeed * Math.max(0, 1 - bal));
  };
  // what each side wants most and the other can actually send
  const pick = (me, you) => {
    let best = -1, bestV = 0;
    for (let k = 0; k < 4; k++) {
      const q = Math.min(me.gap[k], you.spare[k] * sellShare(you, k, c));
      const v = q * price[k];
      if (v > bestV) { bestV = v; best = k; }
    }
    return best;
  };
  const tA = pick(SA, SB);
  if (tA < 0) return null;
  let qTake = Math.min(SA.gap[tA], SB.spare[tA] * sellShare(SB, tA, c));
  const needA = needOf(SA, tA);
  const tB = pick(SB, SA);
  let qGive = 0, mq = 0, tech = 0, techWorth = 0, prem = 0;
  if (tB >= 0 && tB !== tA) {                            // a swap: value matched at world prices
    // what A will part with: what an exporter of that type would commit, or more if it is hungry for what it is getting
    const spareA = Math.min(c.dealSpareTop, Math.max(sellShare(SA, tB, c), c.dealSpareShare * needA));
    qGive = qTake * price[tA] / Math.max(1e-9, price[tB]);
    const room = Math.min(SB.gap[tB], SA.spare[tB] * spareA);
    if (qGive > room) { const f = room / Math.max(1e-9, qGive); qGive *= f; qTake *= f; }
  }
  let takeVal = qTake * price[tA], giveVal = qGive * price[tB >= 0 ? tB : 0];
  if (takeVal <= 0) return null;
  // the sweetener: a hungry taker pays the giver a share of what the cargo is worth to it over the world price
  prem = (needA - 1) * takeVal * c.dealPremiumShare;
  const kA = 1 + (needA - 1) * c.dealPremiumShare;
  if (giveVal < takeVal + prem) {                        // the rest in money, or in technology from a far richer partner
    mq = takeVal + prem - giveVal;
    const cap = c.dealMoneyShare * needA * incA;         // the hungry spend more of their income on it
    if (mq > cap) {                                      // cannot pay for that much: shrink the cargo to what it can
      const f = (giveVal + cap) / (takeVal * kA);
      qTake *= f; takeVal *= f; qGive *= f; giveVal *= f; prem *= f; mq = takeVal + prem - giveVal;
    }
    if (SA.s.st.technology > SB.s.st.technology + c.techGapMin) {
      techWorth = Math.min(mq, c.techValue * incB);
      tech = c.techTerm; mq -= techWorth;
    }
  }
  if (qTake <= 0 || takeVal <= 0) return null;
  /* Worth per day to each side.  A cargo received would otherwise have
     been bought on the exchange, at the price plus the spread and the
     distance to the sellers; a cargo sent would otherwise have been sold
     there, at the price less the same two.  The deal pays the matched
     value instead and carries its own shipping.  So each side gains the
     market's cut and the distance it escapes, and a deal across the
     world is worth nothing to anybody. */
  const dist = W_.distKm(a, b), fDeal = c.marketDistance * dist / 10000, sp = c.marketSpread;
  const fA_take = E.frictionFor(a, tA), fB_take = E.frictionFor(b, tA);
  const fA_give = tB >= 0 ? E.frictionFor(a, tB) : 0, fB_give = tB >= 0 ? E.frictionFor(b, tB) : 0;
  const gainA = takeVal * (sp + fA_take + c.dealSlot) + giveVal * (sp + fA_give + c.dealSure - fDeal) + (needA - 1) * takeVal - prem;   // the hungry keep the rest of what it is worth to them
  const gainB = giveVal * (sp + fB_give + c.dealSlot) + takeVal * (sp + fB_take + c.dealSure - fDeal) + techWorth + prem;
  const minA = c.dealMin * Math.max(1, incA), minB = c.dealMin * Math.max(1, incB);
  const first = a < b;                                   // the record is written from the pair's first ISO
  const deal = first
    ? { g: tB >= 0 ? tB : -1, gq: qGive, t: tA, tq: qTake, mq: mq, tech: tech, until: W_.day + c.dealTerm, since: W_.day, short: 0, prem: prem }
    : { g: tA, gq: qTake, t: tB >= 0 ? tB : -1, tq: qGive, mq: -mq, tech: 0, until: W_.day + c.dealTerm, since: W_.day, short: 0, prem: prem };
  if (!first && tech) deal.tech = 0;                     // tech always flows from the record's A side; drop it when that is the partner
  return { deal, mutual: gainA > minA && gainB > minB, gainA, gainB, take: tA, give: tB, qTake, qGive, mq, tech, need: needA, prem,
           value: takeVal, relA: gainA / Math.max(1, incA), relB: gainB / Math.max(1, incB) };
}

/* ── A price floor among sellers ────────────────────────────────
   Two net sellers of a type agree not to sell it below a floor set over
   the price at which the world stock would rest.  Each side's worth is
   the gap it closes on its own surplus, times how much of the world's
   selling the two of them are -- a cartel of small sellers holds
   nothing.  Both must gain.  A member short of cash breaks ranks (the
   reservation logic in economy.js) and the deal ends after
   dealBreakDays of that. */
function proposeFloor(a, b, k) {
  const W_ = W(), S = W_.COUNTRY_STATE, c = cfg(), E = window.ECONOMY, M = W_.WORLD_STATE.market;
  if (!M || !M.price) return null;
  const sa = standing(a), sb = standing(b);
  if (!sa || !sb) return null;
  const spareA = sa.spare[k], spareB = sb.spare[k];
  if (!(spareA > 0) || !(spareB > 0)) return null;
  const price = M.price[k], rest = M.rest ? M.rest[k] : price, floor = Math.min(c.priceMax, rest * c.floorMark);
  if (price >= floor) return null;                          // nothing to hold up
  if (!M.need || !(M.buys && M.buys[k] >= c.cartelDemand * M.need[k])) return null;   // a floor holds nothing where nobody imports the type
  let worldSpare = 0;                                       // everyone who could sell the type, not only who sold today
  for (const o in S) { const os = S[o]; if (os.production && os.consumption) worldSpare += Math.max(0, os.production[k] - os.consumption[k]); }
  const hold = Math.min(1, (spareA + spareB) / Math.max(1e-9, worldSpare));
  if (hold < c.cartelHoldMin) return null;                  // two small sellers cannot hold a price, and know it
  const bite = hold * hold;                                 // a floor is worth its share of the world's spare, squared: half the world holds a quarter of the price
  const gainA = (floor - price) * spareA * bite, gainB = (floor - price) * spareB * bite;
  const incA = E.taxIncome(S[a]), incB = E.taxIncome(S[b]);
  const deal = { g: -1, gq: 0, t: -1, tq: 0, mq: 0, tech: 0, until: W_.day + c.cartelTerm, since: W_.day, short: 0, fk: k, fp: floor };
  return { deal, mutual: gainA > c.dealMin * Math.max(1, incA) && gainB > c.dealMin * Math.max(1, incB), gainA, gainB, type: k, floor, hold,
           relA: gainA / Math.max(1, incA), relB: gainB / Math.max(1, incB) };
}
function hasFloorWith(a, b, k) { return W().dealsOf(a, b).some(d => d.fk === k); }
function floorsHeld(iso, k) {                                // how many floor deals a country already has on a type
  const W_ = W(); let n = 0;
  for (const key in W_.PAIRS) { if (key.indexOf(iso) < 0) continue; const p = W_.PAIRS[key]; if (p.deals) for (const d of p.deals) if (d.fk === k) n++; }
  return n;
}
/* The type this country sells most of, by value. */
function bestSale(iso) {
  const st = standing(iso), M = W().WORLD_STATE.market;
  if (!st || !M) return -1;
  let best = -1, v = 0;
  for (let k = 0; k < 4; k++) { const x = st.spare[k] * M.price[k]; if (x > v) { v = x; best = k; } }
  return best;
}

/* ── Fronts ─────────────────────────────────────────────────────
   The principals' front is the war's own score.  An ally that can reach
   a member of the other side (canReach: a land border, a sea lane or
   the air by technology) opens a front of its own there
   ({ a, d, score, since }: a on the attacking side); one that cannot
   adds pactShare of its force to its friend's front.  A country's force is
   split evenly across the fronts it fights on. ── */
const frontsIn = war => war.fronts || (war.fronts = []);
const hasFront = (war, iso) => frontsIn(war).some(f => f.a === iso || f.d === iso);
const inWar = (war, iso) => war.att === iso || war.def === iso || war.allies.att.indexOf(iso) >= 0 || war.allies.def.indexOf(iso) >= 0;
/* The domain a front is fought in, seen from the attacking side: a land
   border, a sea lane or the air, with how far force reaches across it
   (reachSea, reachAir) and whether the defender has the technology to
   contest it (techLow at sea, techHigh in the air). */
/* The territory a country fights from: itself and everything it occupies.  An occupied neighbour's borders are its
   borders, its sea lanes its lanes.  Cached by day; the occupation writers refresh it. */
let holdCache = { day: -1, map: null };
function holdingsMap() {
  const W_ = W();
  if (holdCache.map && holdCache.day === W_.day) return holdCache.map;
  const S = W_.COUNTRY_STATE, map = {};
  for (const o in S) { const by = S[o].occupiedBy; if (by) (map[by] || (map[by] = [])).push(o); }
  holdCache = { day: W_.day, map };
  return map;
}
const refreshHoldings = () => { holdCache.map = null; };
const holdingsOf = iso => [iso, ...(holdingsMap()[iso] || [])];
function viaHoldings(a, d, type) {
  const L = window.LINKS, S = W().COUNTRY_STATE;
  if (!L || !L.ready || (S[d] && S[d].occupiedBy === a)) return false;
  for (const h of holdingsOf(a)) if (L.linkedBy(h, d, type)) return true;
  return false;
}
function frontDomain(a, d) {
  const L = window.LINKS, c = cfg(), S = W().COUNTRY_STATE;
  if (!L || !L.ready || viaHoldings(a, d, "land")) return { reach: 1, contested: true, domain: "land" };
  const tech = S[d] && S[d].st ? S[d].st.technology : 0;
  if (viaHoldings(a, d, "sea")) return { reach: c.reachSea, contested: tech >= c.techLow, domain: "sea" };
  return { reach: c.reachAir, contested: tech >= c.techHigh, domain: "air" };
}
/* How fast a front moves: at the pace of its reach, or faster against a defender that cannot contest the domain. */
const frontPace = dom => dom.contested ? dom.reach : Math.sqrt(dom.reach);
/* A country divides its force among its fronts by the threat on each: the enemy's force times how far it reaches. */
function frontWeights(iso) {
  const W_ = W(), out = [];
  for (const w of W_.WORLD_STATE.wars) {
    if (w.att === iso) out.push({ war: w, f: null, w: W_.force(w.def) * frontDomain(w.def, iso).reach });
    if (w.def === iso) out.push({ war: w, f: null, w: W_.force(w.att) * frontDomain(w.att, iso).reach });
    for (const f of frontsIn(w)) {
      if (f.a === iso) out.push({ war: w, f, w: W_.force(f.d) * frontDomain(f.d, iso).reach });
      else if (f.d === iso) out.push({ war: w, f, w: W_.force(f.a) * frontDomain(f.a, iso).reach });
    }
  }
  return out;
}
function frontShare(iso, war, f) {
  const W_ = W();
  let total = 0, mine = -1;
  for (const x of frontWeights(iso)) { total += x.w; if (x.war === war && x.f === f) mine = x.w; }
  if (mine < 0) {                                            // a war not yet declared: its own weight joins the rest
    const enemy = f ? (f.a === iso ? f.d : f.a) : (war.att === iso ? war.def : war.att);
    mine = W_.force(enemy) * frontDomain(enemy, iso).reach; total += mine;
  }
  return total > 0 ? Math.max(cfg().frontShareMin, mine / total) : 1;   // a garrison is kept on every front
}
/* The odds on a front, from the attacking side; the principals' front when f is null.  A defender that cannot
   contest the domain fights without its bonus and its terrain. */
function frontOdds(war, f) {
  const W_ = W(), c = cfg(), L = window.LINKS;
  const a = f ? f.a : war.att, d = f ? f.d : war.def, dom = frontDomain(a, d);
  let sa = W_.force(a) * frontShare(a, war, f), sd = W_.force(d) * frontShare(d, war, f);
  if (!f) {                                                  // allies without a front of their own fight here
    for (const x of war.allies.att) if (!hasFront(war, x)) sa += c.pactShare * W_.force(x);
    for (const x of war.allies.def) if (!hasFront(war, x)) sd += c.pactShare * W_.force(x);
  }
  if (dom.contested) {
    const range = L && L.ready ? L.rangeOf(d, a) : 1;
    sd *= c.defenceBonus * (1 + c.terrainDefence * (1 - range));
  }
  return sa / Math.max(1, sd);
}
/* How long the principals' front takes at these odds, at its pace. */
const warLengthOn = (war, ratio, c) => warLength(ratio, c) / frontPace(frontDomain(war.att, war.def));
/* Where a country fights: as a principal, or on a front of its own. */
function fightingIn(iso) {
  for (const w of W().WORLD_STATE.wars) {
    if (w.att === iso) return { war: w, side: "att", principal: true };
    if (w.def === iso) return { war: w, side: "def", principal: true };
    for (const f of frontsIn(w)) if (f.a === iso || f.d === iso) return { war: w, side: f.a === iso ? "att" : "def", principal: false, front: f };
  }
  return null;
}

/* ── One unit ───────────────────────────────────────────────────
   Every candidate says what it is worth over the government's horizon,
   in days of the country's income (value), and how likely it is to come
   to nothing (risk, 0..1).  U = value × (1 − risk × caution) / horizon
   is then income-days per day of horizon -- a fraction of a day's
   income, the same for a deal, a project and a war -- and holding is 0.
   Temperament and government enter only as values (what a point of a
   stat, a point of relations, an enemy's defeat is worth to them) and
   as the caution that discounts a risk. */
const cautionOf = (T, c) => c.riskAversion * (0.5 + T.caution);
const score = (cand, caution, H) => { cand.U = cand.value * Math.max(0, 1 - (cand.risk || 0) * caution) / Math.max(1, H); return cand; };
const VALUE_ROW = { infra: "valueOfInfra", military: "valueOfMilitary", academia: "valueOfAcademia", medical: "valueOfMedical", stability: "valueOfStability", technology: "valueOfTechnology" };
const PACT_REL = 10;                                          // relations a pact brings
/* A point of a stat the country is short of, per day: its row times the priority the government gives it. */
function pointWorth(k, P, c) {
  const pr = k === "military" ? P.guns : k === "academia" || k === "technology" ? P.science : k === "infra" ? P.growth : P.order;
  return c[VALUE_ROW[k]] * pr;
}
/* A point of relations with another country, per day: more with a bigger partner, more to a government that prizes its standing. */
function relWorth(s, o, P, c) {
  const mine = Math.max(1, (s.output || 0) * Math.max(0, s.pop)), theirs = Math.max(1, (o.output || 0) * Math.max(0, o.pop));
  return c.valueOfRel * P.standing * Math.min(2, Math.sqrt(theirs / mine));
}
/* The satisfaction of hurting an enemy, per day: steep in the enmity, more to a warlike temperament. */
const spiteOf = (rel, T, c) => c.valueOfSpite * (0.5 + T.aggr) * Math.pow(Math.max(0, -rel) / 100, c.enmityPower);
/* The odds as a chance of winning, and how long a war at those odds runs before the front reaches an end. */
const pWinOf = (ratio, c) => 1 / (1 + Math.pow(1 / Math.max(1e-6, ratio), c.warSharp));
const warLength = (ratio, c) => Math.min(c.warMaxDays, 1 / Math.max(1e-6, c.warPace * c.warSwing * Math.abs(ratio - 1) / (ratio + 1)));
/* How hard a fight is, 0 to 1, from the odds: even sides grind each other down, a rout costs the winner almost
   nothing.  Attrition, the dead and the output blow all follow it, and the war candidate prices them by the same
   expression, so what deters is what happens. */
const intensityOf = odds => { const r = Math.max(odds || 1, 1 / Math.max(1e-6, odds || 1)); return 2 / (1 + r); };
/* The odds of a war as it stands, from the attacker's side: the principals' front. */
const warOdds = war => frontOdds(war, null);
/* What beating a country is worth, in our income-days: what an occupation
   would yield as far as the horizon -- our share of its production and
   income for as long as we hold it -- and the tribute. */
function prizeOf(s, o, inc, H, c) {
  const E = window.ECONOMY, occ = Math.min(1, c.occupyChance + s.authority / c.occupyAuthDiv), days = Math.min(c.occupyDaysBase, H);
  const dep = dependency(s, o, inc);
  const spoils = spoilsOf(o, c, s) / inc * days * occ;                         // their production, at what it is worth to us, and their money, while we hold them
  const tribute = Math.min(Math.max(0, o.treasury), c.tributeDays * E.taxIncome(o)) / inc;
  // what we would stop importing is not a second prize: the production we take is already counted in the spoils,
  // and counted at our need price, which is where a target that has what we lack earns its extra.  `dep` stays for
  // the reason the decision gives
  return { spoils, relief: 0, tribute, dep, total: spoils + tribute };
}
/* What a day of war costs us, in our income-days, read off the same rows the world charges so the two cannot
   drift apart.  Three channels: the money the treasury pays for the force in the field, the kit worn out (the army
   and the infrastructure, priced at what buying a point back actually costs), and the unrest, which is the largest
   of the three and which the old single `warDayCost` could not see at all.  The dead are priced separately by the
   candidate, as a moral premium rather than a charge. */
function warDayCostOf(iso, s, len, line, inc, P, c, odds) {
  const E = window.ECONOMY, W_ = W();
  const perPoint = stat => { const pj = E.projectFor(s, stat); return pj && pj.gain > 0 ? pj.cost / pj.gain : 0; };
  const heat = intensityOf(odds == null ? 1 : odds);                      // a rout costs almost no kit, as the world charges it
  const money = c.warCostForce * W_.force(iso) / inc;
  const kit = heat * (c.warMilAtt * line * perPoint("military") + c.warAttrInfra * perPoint("infra")) / inc;
  // the stability a war costs: the target drops by warStab while it lasts and the daily bleed holds the country a
  // further warAttrStab/rate below that, and the hole takes one time constant to fill once the fighting stops
  const rate = Math.max(1e-6, c.driftFast * W_.inertia(iso));
  const deficit = c.warStab + heat * c.warAttrStab / rate;
  // priced as the invest candidate prices a point of a stat, gap/50, so the war's unrest and the peace-time value of
  // order are quoted in the same money
  const unrest = deficit * (len + 1 / rate) * pointWorth("stability", P, c) * Math.min(1, deficit / 50) / Math.max(1e-9, len);
  return { money, kit, unrest, perDay: money + kit + unrest };
}
/* What losing to this particular country would cost us, in our income-days: exactly what beating us is worth to
   them, converted into our money, plus the scar the defeat leaves on this government.  `defeatAuthority` is written
   into the regime's modifiers and nothing decays those, so it is felt until that government falls.  The scar counts
   the coercion those 25 points of authority stop buying, over as far ahead as this government looks, and not the
   legitimacy side of it, so it is a floor. */
function defeatCost(s, o, inc, H, P, c) {
  const E = window.ECONOMY, CO = window.COUNTRIES;
  let theirs = 0;
  if (o && o.st) {
    const theirInc = Math.max(1, E.taxIncome(o));
    theirs = prizeOf(o, s, theirInc, H, c).total * theirInc / inc;
  }
  const auth = s.authority != null ? s.authority : 50;
  const lost = CO.coercion(s, c) - CO.coercion({ authority: Math.max(0, auth - c.defeatAuthority), st: s.st }, c);
  const scar = c.coerceStab * Math.max(0, lost) * H * pointWorth("stability", P, c);   // felt as far ahead as this government looks
  return theirs + scar;
}
/* What ending a war now is worth to one side: the rest of the campaign
   saved and the defeat avoided, against the prize forgone and the
   indemnity paid or received.  The offer and the answer both read it. */
/* The lease a peace can carry: the loser's spare in the type the winner lacks most, up to peaceLeaseShare of it. */
function peaceLease(loser, winner) {
  const c = cfg(), sl = standing(loser), sw = standing(winner);
  let type = -1, qty = 0;
  if (sl && sw) for (let k = 0; k < 4; k++) { const q = Math.min(sw.gap[k], sl.spare[k] * c.peaceLeaseShare); if (q > qty) { qty = q; type = k; } }
  return { type, qty };
}
/* What ending a war now, on a given rung of terms, is worth to one side: the rest of the campaign saved and the defeat
   avoided, against the prize forgone, and the transfer the rung carries -- nothing on rung 0 (status quo ante), the
   indemnity on 1, the indemnity and the lease on 2, those and a one-off tribute on 3.  Paid by the side behind,
   received by the side ahead, each in its own income-days.  The offer and the answer both read it. */
function peaceValueAt(iso, war, c, rung) {
  const W_ = W(), S = W_.COUNTRY_STATE, E = window.ECONOMY, s = S[iso];
  if (!s || !s.st) return { value: 0, losing: 0, rem: 0, rung };
  const P = prioritiesOf(iso), H = P.horizon, inc = Math.max(1, E.taxIncome(s));
  const att = war.att === iso, foe = att ? war.def : war.att, o = S[foe];
  const odds = warOdds(war), pw = att ? pWinOf(odds, c) : 1 - pWinOf(odds, c);
  const losing = att ? -war.score : war.score;                           // positive when the war is going against us
  const pLose = clamp(1 - pw + losing / 2, 0, 1), margin = Math.abs(war.score);
  const line = att ? 1 + c.supplyLine * (1 - reachFactor(iso, foe, c)) : 1;
  const rem = (1 - margin) * warLengthOn(war, odds, c);
  // the transfer, in money: what the side behind would hand over on this rung
  const behind = war.score > 0 ? war.def : war.att, ahead = behind === war.att ? war.def : war.att;
  const payer = S[behind], payerInc = payer ? Math.max(1, E.taxIncome(payer)) : 0;
  let give = 0, get = 0;                                                 // what the rung costs the payer, and what it is worth to the receiver
  if (payer && rung >= 1) { const ind = c.peaceIndemnity * margin * payerInc * c.peaceTermDays; give += ind; get += ind; }
  if (payer && rung >= 2) {
    const L = peaceLease(behind, ahead), M = W_.WORLD_STATE.market;
    if (L.type >= 0 && M && M.price) {                                   // spare to the payer, at the world price; to the receiver, at its need
      const base = L.qty * M.price[L.type] * c.peaceTermDays;
      give += base; get += base * needPriceOf(S[ahead], L.type, c);
    }
  }
  if (payer && rung >= 3) { const tr = Math.min(Math.max(0, payer.treasury), c.tributeDays * payerInc); give += tr; get += tr; }
  const mine = (iso === behind ? -give : get) / inc;
  const prize = o ? prizeOf(s, o, inc, H, c).total : 0;
  const bill = warDayCostOf(iso, s, Math.max(1, rem), line, inc, P, c, odds);
  return { value: rem * bill.perDay + pLose * defeatCost(s, o, inc, H, P, c) - (1 - pLose) * prize + mine, losing, rem, pLose, rung };
}
/* The old single price -- the indemnity alone -- for callers that still ask for one number. */
function peaceValue(iso, war, c) { return peaceValueAt(iso, war, c, 1); }
/* The rung a side would put on the table: the best for itself among those the other side will take.  The side
   behind climbs from the bottom and offers the least it can get away with; the side ahead comes down from the top
   and asks the most it can extract.  Below peaceTermsMin only the status quo is on the table.  -1: nothing both
   would sign, so there is no offer to make. */
function proposeRung(iso, war, c) {
  const margin = Math.abs(war.score), top = margin < c.peaceTermsMin ? 0 : 3;
  const behind = (war.score > 0 ? war.def : war.att) === iso, other = war.att === iso ? war.def : war.att;
  const order = []; for (let r = 0; r <= top; r++) order.push(r);
  if (!behind) order.reverse();
  for (const r of order) if (peaceValueAt(other, war, c, r).value > 0 && peaceValueAt(iso, war, c, r).value > 0) return r;
  return -1;
}
/* What a pact with another country is worth per day: cover against the strongest hostile
   neighbour, and pactInsure of full cover as insurance when none is in sight, as far as the
   partner's force goes. */
function coverWorth(iso, other, threat, c) {
  const W_ = W();
  return c.securityWorth * (c.pactInsure + threat / 100) * Math.min(1, c.pactShare * W_.force(other) / Math.max(1, W_.force(iso)));
}
/* What our deals with a country earn us a day, against our income: the market's cut and the slot on every cargo. */
function dealGain(iso, other, inc, c) {
  const W_ = W(), M = W_.WORLD_STATE.market, price = M && M.price ? M.price : [1, 1, 1, 1];
  let g = 0;
  for (const d of W_.dealsOf(iso, other)) {
    if (d.fk != null && d.fk >= 0) continue;
    const first = iso < other, take = first ? d.t : d.g, tq = first ? d.tq : d.gq, give = first ? d.g : d.t, gq = first ? d.gq : d.tq;
    if (take >= 0) g += tq * price[take] * (c.marketSpread + c.dealSlot);
    if (give >= 0) g += gq * price[give] * (c.marketSpread + c.dealSure);
  }
  return g / Math.max(1, inc);
}

/* A deal as a candidate: the market's cut it saves over its term, the
   security of covered use, the goodwill it earns, less the deals already
   held.  Offered only when both sides would sign it; an unfriendly or
   embattled partner is a risk. */
function tradeCandidate(X, other, o, rel, myDeals, farF) {
  const { W_, iso, s, c, P, H } = X;
  const prop = proposeSwap(iso, other);
  if (!prop || !prop.mutual) return null;
  const cons = s.consumption, share = cons && cons[prop.take] > 0 ? Math.min(1, prop.qTake / cons[prop.take]) : 0;   // how much of our use it covers
  const step = c.dealRel * Math.min(1, prop.relA + prop.relB);
  const value = (prop.relA + c.dealSecurity * share) * Math.min(H, c.dealTerm) + step * relWorth(s, o, P, c) * H - c.dealCrowd * myDeals;
  const risk = 0.5 * (1 - clamp(rel, 0, 100) / 100) + (W_.fighting(other) ? 0.3 : 0);
  const name = W_.nameOf(other);
  const cand = score({ action: "trade", target: other, value, risk, prop,
                       why: [share > 0.05 ? `${RES_KEYS[prop.take]} from ${name} covers ${r0(share * 100)}% of our use`
                                          : `${RES_KEYS[prop.take]} from ${name} at ${(prop.relA * 100).toFixed(0)}% of a day's income`,
                             prop.give >= 0 ? `we send ${RES_KEYS[prop.give]} back` : prop.tech ? "we pay in money and technology" : "we pay for it",
                             farF ? "a long-range deal" : `their economy ${r0(W_.ecoIndexOf(other))}`,
                             ...(prop.need > 1 ? [`paying over the odds to feed our people (${prop.need.toFixed(1)}x)`] : [])] }, X.caution, H);
  return cand.U > 0 ? cand : null;
}

/* ── Priorities: what a country weighs, how far ahead it looks, what it
   keeps back.  From temperament for now; stage 5 lets the government
   override them.  Derived, never saved. ── */
function prioritiesOf(iso) {
  const W_ = W(), S = W_.COUNTRY_STATE, s = S[iso], c = cfg();
  const who = s && s.occupiedBy ? s.occupiedBy : iso, g = S[who] || s;   // an occupied country is run by its occupier's government
  const T = temperament(who, W_.seed);
  const G = window.GOV, type = G && g ? G.typeOf(g) : "elected";
  const auth = g ? g.authority / 100 : 0.5, free = g ? (g.freedom != null ? g.freedom : g.econOpen) / 100 : 0.5, open = g ? g.econOpen / 100 : 0.5;
  // temperament first, then what the regime is: a junta arms, a party keeps order, a trading state grows, a free one funds science
  const P = {
    growth: 0.8 + 0.4 * T.thrift + c.govGrowthOpen * open,
    order: 0.8 + 0.4 * T.caution + c.govOrderClosed * (1 - free) + (type === "party" ? c.govOrderParty : 0),
    guns: c.gunsBase + 0.8 * T.aggr + c.govGunsAuth * auth + (type === "military" ? c.govGunsMilitary : 0),
    science: 0.4 + 0.8 * T.science + c.govScienceFree * free + c.govScienceBill * billShare(s),   // a dear resource bill argues for efficiency, and technology is the only efficiency there is
    standing: 0.6 + 0.4 * (1 - T.caution) + (type === "hereditary" ? c.govStandingCrown : 0),
    horizon: c.horizonBase + c.horizonCaution * T.caution,          // days
    reserve: c.reserveBase + c.reserveThrift * T.thrift + c.reserveAuth * auth,   // days of income kept back from the market
  };
  // how far ahead it looks: a crown thinks in reigns, a junta in seasons, an elected government to the next vote
  if (type === "hereditary") P.horizon *= c.horizonCrown;
  else if (type === "military") P.horizon *= c.horizonJunta;
  else if (type === "elected" && g && g.nextElection) P.horizon = Math.max(30, Math.min(P.horizon, g.nextElection - W_.day + 30));
  return P;
}
function wants(s, T, P, threat) {
  const c = cfg();
  let minBal = 1;
  if (s.balance) for (let k = 0; k < 4; k++) if (s.balance[k] < minBal) minBal = s.balance[k];
  // an exporter that sees the world price of what it sells run high wants the infrastructure that reaches more of its
  // endowment: the supply response a wall needs, and the only one besides demand destruction.  Each type it has spare
  // of counts its price over the world's base, capped, so a materials wall pulls the materials exporters first
  const M = W().WORLD_STATE.market;
  let pull = 0;
  if (M && M.price && s.surplus) for (let k = 0; k < 4; k++) if (s.surplus[k] > 0) pull += clamp(M.price[k] / c.priceBase - 1, 0, c.wantInfraPriceCap);
  return {
    // a country short of something wants the infrastructure that reaches its own endowment and holds a bigger store: short, so build, so produce
    infra: 50 + 25 * P.growth + c.wantInfraShort * clamp(1 - minBal, 0, 1) + c.wantInfraExport * pull,
    academia: 35 + 30 * P.science, stability: 45 + 20 * P.order,
    military: c.wantMilBase + c.wantMilGuns * P.guns + c.wantMilThreat * (threat || 0) / 100 + s.authority / 4,   // an army for the temperament, the regime, and the neighbours
    medical: 40 + 15 * P.order + 40 * s.detection,
  };
}
/* How reachable a target is: a land border, a sea lane, or air only. */
function reachFactor(iso, other, c) {
  if (viaHoldings(iso, other, "land")) return 1;
  if (viaHoldings(iso, other, "sea")) return c.reachSea;
  return c.reachAir;
}
/* Whether a country can carry a war to another at all: a land border
   always; a sea lane once its technology reaches techLow; an air link
   only at techHigh, the tier that projects power. */
function canReach(iso, other) {
  const L = window.LINKS, c = cfg(), s = W().COUNTRY_STATE[iso];
  if (!L || !L.ready || !s || !s.st) return false;
  if (viaHoldings(iso, other, "land")) return true;
  const tech = s.st.technology;
  if (tech >= c.techLow && viaHoldings(iso, other, "sea")) return true;
  if (tech >= c.techHigh && viaHoldings(iso, other, "air")) return true;
  return false;
}
/* A normal draw from the day's generator. */
function gauss(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
/* How badly a government may misjudge a war: everyone errs a little, a
   heavy hand that hears no dissent errs more, and a warlike temperament
   sees what it wants to see. */
function errorSpread(s, T, c) {
  const free = s.freedom != null ? s.freedom : s.econOpen;
  return c.errBase + c.errAuthority * s.authority / 100 * (1 - free / 100) + c.errAggr * T.aggr;
}
/* The odds as the attacker judges them: the truth, counting the allies it
   expects, times a fresh error.  Never stored: the same question asked
   tomorrow gets a different answer, and the campaign runs on the truth. */
function estimateRatio(iso, other, rng, T) {
  const W_ = W(), c = cfg(), s = W_.COUNTRY_STATE[iso];
  // who would come: each ally at the chance its own weekly choice would fall to joining, ours at our trust in them as well
  const hyp = { att: iso, def: other, since: W_.day, score: 0, allies: { att: [], def: [] }, fronts: [], asked: { att: [], def: [] }, decided: {}, calledBy: {} };
  const D = W_.COUNTRY_STATE[other], E = window.ECONOMY;
  const torn = a => pactPartners(a).indexOf(iso) >= 0 && pactPartners(a).indexOf(other) >= 0;   // pledged to both: counted on neither side
  const theirs = contributors(other, iso).filter(a => !torn(a)).map(a => [a, joinChance(a, hyp, "def", other)]);
  const mine = contributors(iso, other).filter(a => !torn(a)).map(a => [a, joinChance(a, hyp, "att", iso) * trustIn(s, a)]);
  const weigh = (me, foe, list) => {                                     // reachable allies open fronts and split the enemy's force
    let own = W_.force(me) * frontDomain(me, foe).reach, all = own;
    for (const [a, p] of list) if (canReach(a, foe)) all += W_.force(a) * frontDomain(a, foe).reach * p;
    return all > 0 ? Math.max(c.frontShareMin, own / all) : 1;
  };
  let allied = 0; for (const [a, p] of mine) if (!canReach(a, other)) allied += p * W_.force(a);
  let theirFar = 0; for (const [a, p] of theirs) if (!canReach(a, iso)) theirFar += p * W_.force(a);
  const myStrength = (W_.force(iso) + c.pactShare * allied) * weigh(other, iso, theirs);          // what it counts on, not what will come
  const mobil = D && D.st && W_.day >= (D.mobilUntil || 0) && E.canSpend(D, c.investDays * E.taxIncome(D) * c.mobilPremium * 0.5)
              ? c.mobilStep * (c.projectGainTop - D.st.military / 100) : 0;                        // the defender will call up its reserves the day it is attacked
  const theirStrength = defended(other, iso, []) * (1 + c.pactShare * theirFar / Math.max(1, W_.force(other))) * (1 + mobil / Math.max(1, D && D.st ? D.st.military : 1)) * weigh(iso, other, mine);
  const truth = myStrength / Math.max(1, theirStrength);
  const sigma = errorSpread(s, T || temperament(iso, W_.seed), c);
  const last = s.lastWar && s.lastWar[other];                                        // a war lost or drawn against them is remembered
  const memory = last && (last.o === "lost" || last.o === "stalemate") && W_.day - last.d < c.warMemoryDays ? c.warMemoryDiscount : 1;
  const est = (rng ? Math.max(0, truth * (1 + sigma * gauss(rng))) : truth) * memory;
  return { truth, est, sigma, memory };
}
/* Strongest hostile neighbour's edge over us in force, as 0..100: how many
   times larger its force is, less one, in percent, capped. */
function threatTo(iso, s) {
  const W_ = W(), S = W_.COUNTRY_STATE, L = window.LINKS;
  let worst = 0;
  if (!L || !L.ready) return 0;
  const mine = Math.max(1, W_.force(iso));
  for (const other of L.partners(iso)) {
    const o = S[other];
    if (!o || !o.st || W_.relOf(iso, other) > -30) continue;
    worst = Math.max(worst, Math.min(100, 100 * (W_.force(other) / mine - 1)));
  }
  return worst;
}

/* ── Candidate actions ─────────────────────────────────────────── */
/* Monthly: what to build, research, fight.  Weekly: whom to deal with.
   candidates() keeps its old name and shape for the tests; loop says
   which menu is wanted.  Every entry carries value, risk and U. */
function candidates(iso, s, c, T, occupier, loop, rng) {
  const W_ = W(), S = W_.COUNTRY_STATE, L = window.LINKS, E = window.ECONOMY;
  const P = prioritiesOf(iso), H = P.horizon, caution = cautionOf(T, c), inc = Math.max(1, E.taxIncome(s));
  const X = { W_, S, iso, s, c, T, P, H, caution, inc };
  const out = [], add = cand => { out.push(score(cand, caution, H)); return cand; };
  const threat = threatTo(iso, s);                          // the worst hostile neighbour's edge over us, in percent
  const want = wants(s, T, P, threat);
  // money above the reserve is cheap: a hoard discounts a project's cost.  Borrowed money is dear, and dearer the
  // deeper the debt, so a country near its limit prices everything as the borrowing it would be rather than as cash
  const owed = Math.max(0, -s.treasury) / Math.max(1, E.credit(s));                      // 0 solvent, 1 at the limit
  const cheap = Math.max(c.hoardFloor, 1 - Math.max(0, s.treasury - P.reserve * inc) / (inc * c.hoardDays)) * (1 + c.debtDear * Math.min(1, owed));
  const fight = fightingIn(iso), myWar = fight ? fight.war : null;   // a principal, or an ally on a front of its own
  const monthly = loop !== "weekly", weekly = loop !== "monthly";
  // a project closes a gap: a point short of its want is worth pointWorth a day, more the wider the gap, as far as the horizon
  if (monthly) for (const k of INVEST) {
    const gap = want[k] - s.st[k];
    if (gap <= 0 || s.st[k] >= 100) continue;          // a want may exceed 100 (a shortage, a threat); the stat may not, and paying for a point it cannot gain is waste
    if (myWar && k !== "military") continue;               // at war a country builds nothing but its army
    const pj = E.projectFor(s, k), cost = pj.cost * pj.total;
    if (!E.canSpend(s, cost * 0.5)) continue;              // no money or credit for it
    const gain = Math.min(gap, pj.gain * pj.total);
    add({ action: "invest", target: k, value: pointWorth(k, P, c) * gap / 50 * gain * H - cost / inc * cheap, risk: 0,
          why: [`${k} at ${r0(s.st[k])}, wants ${r0(want[k])}`, `${gain.toFixed(1)} points for ${r0(cost / inc)} days of income`] });
  }
  // enact (monthly, at peace): the government's programme.  A work power is priced as the investment it is, over
  // every stat it names; a mod at a flat worth for a long-lived multiplier (a guess, until the action-ROI study
  // prices each row); an act by what it does, less its lump.  One work or mod at a time; an act waits its cooldown.
  const G = window.GOV;
  if (monthly && !occupier && !myWar && G && G.canEnact) for (const key of G.powersOf(s)) {
    if (!G.canEnact(s, key, W_.day)) continue;
    const PW = G.POWERS[key];
    let value = 0;
    if (PW.kind === "act") {
      const a = PW.act || {};
      for (const k in a) {
        const v = a[k];
        if (k in VALUE_ROW) value += pointWorth(k, P, c) * v * 30;                // a month of a point's worth
        else if (k === "legit") value += c.valueOfLegit * v * H;
        else if (k === "treasuryDays") value += v;
        else if (k === "toBase") value += c.valueOfLegit * v * G.misfit(s) * H;   // a referendum: closer to the nation
        else value += c.valueOfMod;                                              // a purge, a marriage: a standing good
      }
      value -= c.enactDays;
    } else {
      const pj = G.powerProjectFor(s, key), cost = pj.cost * pj.total;
      if (!E.canSpend(s, cost * 0.5)) continue;
      if (PW.kind === "work") for (const st of PW.stats) {
        const gap = st === "technology" ? (100 - s.st.technology) / 2 : Math.max(0, (want[st] != null ? want[st] : 50) - s.st[st]);
        value += pointWorth(st, P, c) * gap / 50 * Math.min(gap, pj.gain * pj.total) * H;
      } else value += c.valueOfMod * H + (PW.mul && PW.mul.legitStand ? c.valueOfLegit * PW.mul.legitStand * H : 0);
      value -= cost / inc * cheap;
    }
    add({ action: "enact", target: key, value, risk: 0, why: [`the programme: ${G.powerLabel(key)}`, PW.kind === "act" ? "at once" : `over ${Math.round(G.powerProjectFor(s, key).total)} days`] });
  }
  if (L && L.ready && !occupier) {
    const trade = [], sanc = [], pact = [], wars = [];
    const pcAll = W_.pairCounts(), mine = pcAll[iso] || {};
    const myDeals = mine.deals || 0;                           // each deal already held makes the next one less pressing
    const room = myDeals < W_.partnerCapOf(iso);               // infrastructure limits how many a country can run
    for (const other of L.partners(iso)) {
      const o = S[other];
      if (!o || !o.st || o.occupiedBy) continue;
      const p = W_.pairOf(iso, other), rel = p.rel, name = W_.nameOf(other);
      const held = p.deals ? p.deals.length : 0;
      if (room && held < c.dealsPerPair && rel >= 0 && !p.warId && s.res && o.res) {
        const t = tradeCandidate(X, other, o, rel, myDeals, 0);   // what we lack that they have
        if (t) trade.push(t);
      }
      const ours = iso < other ? p.sanA : p.sanB;
      if (rel <= c.sanctionAt && !ours && !p.warId) {
        // the satisfaction of hurting an enemy, what the ripple does to our standing with their friends and foes, less the deals it ends
        const tb = pcAll[other] || {}, friends = tb.friends || [], foes = tb.foes || [];
        let ripple = 0;
        for (const f of friends) if (f !== iso && S[f] && S[f].st) ripple -= c.thirdParty * c.sanctionRel * relWorth(s, S[f], P, c);
        for (const f of foes)    if (f !== iso && S[f] && S[f].st) ripple += c.thirdParty * c.sanctionRel * relWorth(s, S[f], P, c);
        const lost = dealGain(iso, other, inc, c) * Math.min(H, c.dealTerm);
        sanc.push(score({ action: "sanction", target: other, value: (spiteOf(rel, T, c) * c.sanctionSpite + ripple) * H - lost, risk: 0,
                          why: [`relations with ${name} at ${r0(rel)}`,
                                held ? `it would cost us ${held} deal${held > 1 ? "s" : ""} with them` : "we have nothing to lose with them",
                                friends.length ? `and goodwill with their ${friends.length} friend${friends.length > 1 ? "s" : ""}` : "they stand alone"] }, caution, H));
      }
      if (rel >= c.sanctionLift && ours)
        sanc.push(score({ action: "unsanction", target: other, value: (c.sanctionRel / 2 * relWorth(s, o, P, c) - spiteOf(rel, T, c) * c.sanctionSpite) * H, risk: 0,
                          why: [`relations with ${name} back at ${r0(rel)}`, "the sanctions have served their purpose"] }, caution, H));
      if (!p.pact && rel >= 30) {
        const foes = ((pcAll[other] || {}).foes || []).length;   // their quarrels could become ours
        pact.push(score({ action: "pact", target: other, value: (coverWorth(iso, other, threat, c) + PACT_REL * relWorth(s, o, P, c)) * H, risk: Math.min(1, foes * c.pactDrag),
                          why: [threat > 0 ? `a hostile neighbour outguns us by ${r0(threat)}` : "no pressing threat", `${name} is friendly (${r0(rel)})`,
                                foes ? `they have ${foes} enem${foes > 1 ? "ies" : "y"}` : "and no enemies"] }, caution, H));
      }
      if (p.pact && rel < c.pactBreakRel)                      // an alliance with someone we no longer trust
        pact.push(score({ action: "unpact", target: other, value: ((c.pactBreakRel - rel) / 100 * c.securityWorth - c.pactBreakRelLoss * relWorth(s, o, P, c)) * H, risk: 0,
                          why: [`relations with ${name} down to ${r0(rel)}`, "the alliance no longer holds"] }, caution, H));
      if (monthly && !myWar && rel < c.warRelMax && !p.pact && !W_.dealing(p) && !p.warId && W_.day >= (p.truce || 0) && canFight(s) && canFight(o) && !W_.fighting(other) && s.res && o.res && canReach(iso, other)
          && s.st.stability >= c.warStabMin && s.treasury >= c.warChestDays * inc) {
        // not a friend, ally or trade partner: the prize and the enmity against the campaign and the chance of losing it -- at the odds as we judge them
        const est = estimateRatio(iso, other, rng, T), ratio = est.est;
        if (ratio > c.warMinRatio) {
          const dom = frontDomain(iso, other);                                        // across a sea lane or by air the campaign is long
          const pw = pWinOf(ratio, c), len = warLength(ratio, c) / frontPace(dom), prize = prizeOf(s, o, inc, H, c);
          const spite = spiteOf(rel, T, c) * H;
          const last = s.lastWar && s.lastWar[other];                                   // a country beaten lately has been picked over already
          const sated = last && last.o === "won" && W_.day - last.d < c.warMemoryDays ? c.satietyDiscount : 1;
          const relCost = Math.max(0, rel - c.victoryRel) * relWorth(s, o, P, c) * H;   // what we would throw away with them
          const line = 1 + c.supplyLine * (1 - reachFactor(iso, other, c));          // the campaign is dearer the further from home, as the attrition is
          const bill = warDayCostOf(iso, s, len, line, inc, P, c, ratio);
          const campaign = len * bill.perDay;
          const lives = len * c.warDeathCost * 100 * c.warDeathAtt * 1.5;                     // the dead, priced: income-days per percent of the people, at a middling front
          // opportunism: a country in collapse, famine or fresh defeat is one a conquest would hold, not merely beat
          const frail = clamp(Math.max((c.frailStab - o.st.stability) / Math.max(1, c.frailStab), o.famine || 0,
                                       W_.day < (o.defeatUntil || 0) ? 1 : 0), 0, 1);
          const opportunity = pw * prize.total * c.warOpportunity * frail;
          // pre-emption: a hostile neighbour that is arming, and big enough for that to matter, is cheaper to fight
          // today than to face tomorrow.  Nearly every country wants a larger army than it has, so the reason has to
          // carry both tests: they are no friend of ours, and they are a rival rather than a minnow
          const wantO = wants(o, temperament(other, W_.seed), prioritiesOf(other), threatTo(other, o));
          const arming = clamp((wantO.military - o.st.military) / 50, 0, 1);
          const rival = clamp(W_.force(other) / Math.max(1, W_.force(iso)), 0, 1);
          const preempt = rel < 0 ? c.warPreempt * arming * rival * H : 0;
          // revanchism: we lost to them, and the wound is still fresh
          const revanche = last && last.o === "lost" && W_.day - last.d < c.warMemoryDays
                         ? c.warRevanche * (1 - (W_.day - last.d) / c.warMemoryDays) * H : 0;
          const losing = defeatCost(s, o, inc, H, P, c);
          const value = pw * prize.total * sated + opportunity + preempt + revanche + spite
                      - campaign - lives - (1 - pw) * losing - (s.weary || 0) / 100 * c.wearyCost - relCost;
          const risk = Math.min(1, est.sigma + (1 - reachFactor(iso, other, c)) * c.riskReach);
          if (value > 0) {
            const spoilsDay = spoilsOf(o, c, s) / inc;
            // what is really driving this: the largest of the five reasons to go, named so the decision can be read back
            const reasons = [["prize", pw * prize.total * sated], ["enmity", spite], ["preempt", preempt], ["revanche", revanche]];
            let motive = reasons[0];
            for (const mo of reasons) if (mo[1] > motive[1]) motive = mo;
            // opportunism multiplies the prize rather than standing beside it, so it would never win a plain comparison:
            // name it when the target is genuinely broken and its state outweighs every other reason we have
            const tag = frail >= 0.5 && opportunity > Math.max(spite, preempt, revanche) ? "opportunity" : motive[0];
            wars.push(score({ action: "war", target: other, value, risk, motive: tag,
                              parts: { pw, len, prize: prize.total * sated, spoils: prize.spoils, tribute: prize.tribute, spite,
                                       opportunity, preempt, revanche,
                                       campaign, money: len * bill.money, kit: len * bill.kit, unrest: len * bill.unrest,
                                       defeat: (1 - pw) * losing, weary: (s.weary || 0) / 100 * c.wearyCost, relCost },
                              why: [tag === "enmity" ? `an old enmity (relations ${r0(rel)})`
                                    : tag === "opportunity" ? `${name} is in no state to resist (stability ${r0(o.st.stability)})`
                                    : tag === "preempt" ? `${name} is arming against us: better now than later`
                                    : tag === "revanche" ? `we lost to ${name}, and want it back`
                                    : `${name}'s spoils would pay ${r0(Math.min(1, spoilsDay) * 100)}% of our income`,
                                    `our strength ${ratio.toFixed(1)}:1 as we judge it${Math.abs(ratio - est.truth) > 0.3 * est.truth ? " (a misjudgement)" : ""}`,
                                    `${r0(prize.total)} days of income at stake over about ${r0(len)} days of war`] }, caution, H));
          }
        }
      }
    }
    // a price floor with other sellers of what we sell most: neighbours who sell it, and the world's biggest sellers of it
    if (weekly && room) {
      const kSell = bestSale(iso), cartel = [];
      if (kSell >= 0 && floorsHeld(iso, kSell) < c.cartelPartners) {
        const others = new Set(L.partners(iso));
        const big = Object.keys(S).filter(o => o !== iso && S[o].st && S[o].production && !S[o].occupiedBy && !others.has(o))
                      .map(o => [o, Math.max(0, S[o].production[kSell] - S[o].consumption[kSell])]).filter(x => x[1] > 0)
                      .sort((x, y) => y[1] - x[1]).slice(0, 3).map(x => x[0]);
        for (const other of [...others, ...big]) {
          const o = S[other];
          if (!o || !o.st || o.occupiedBy || W_.relOf(iso, other) < 0 || W_.fighting(other) || hasFloorWith(iso, other, kSell)) continue;
          if (floorsHeld(other, kSell) >= c.cartelPartners) continue;                     // the cap binds the partner too
          const p = W_.pairOf(iso, other);
          if (p.warId || (p.deals && p.deals.length >= c.dealsPerPair)) continue;
          const f = proposeFloor(iso, other, kSell);
          if (!f || !f.mutual) continue;
          const step = c.cartelRel * Math.min(1, f.relA + f.relB);
          cartel.push(score({ action: "cartel", target: other, prop: f, value: f.relA * Math.min(H, c.cartelTerm) + step * relWorth(s, o, P, c) * H, risk: 1 - f.hold,
                              why: [`${RES_KEYS[kSell]} sells at ${(W_.WORLD_STATE.market.price[kSell]).toFixed(2)}, below where it should rest`,
                                    `a floor at ${f.floor.toFixed(2)} with ${W_.nameOf(other)} would hold ${r0(f.hold * 100)}% of the world's sales`] }, caution, H));
        }
      }
      out.push(...cartel.sort((x, y) => y.U - x.U).slice(0, 2));
    }
    // beyond the links: the world's best suppliers of what we lack, at a long-range discount
    if (s.res && room) {
      const bind = worstGap(iso), far = [];
      for (const other in S) {
        const o = S[other];
        if (other === iso || !o.st || !o.res || o.occupiedBy || o.res[bind] <= s.res[bind] + 20 || L.linked(iso, other)) continue;
        const p = W_.pairAt(iso, other);
        if (p && ((p.deals && p.deals.length >= c.dealsPerPair) || p.warId)) continue;
        far.push(other);
      }
      far.sort((a, b) => S[b].res[bind] - S[a].res[bind]);
      for (const other of far.slice(0, 4)) {
        const rel = W_.relOf(iso, other);
        if (rel < 0) continue;
        const t = tradeCandidate(X, other, S[other], rel, myDeals, c.farTrade);
        if (t) trade.push(t);
      }
    }
    const top = list => list.sort((a, b) => b.U - a.U).slice(0, 3);
    if (weekly) out.push(...top(trade), ...top(sanc), ...top(pact));
    if (monthly) out.push(...top(wars).slice(0, 1));
  }
  // an ally's call (weekly): a pact partner at war asks us to stand with it.  Joining earns its
  // gratitude and keeps the pact and its cover, and costs a share of the campaign; refusing is the
  // baseline the pact is then lost against.  The chance of losing is the risk.
  if (weekly && !myWar && !occupier && canFight(s)) for (const war of W_.WORLD_STATE.wars) {
    const asked = war.asked || { att: [], def: [] };
    if (war.decided && war.decided[iso]) continue;
    const sides = ["att", "def"].filter(sd => asked[sd].indexOf(iso) >= 0);   // pledged to both principals: a candidate for each side
    if (!sides.length) continue;
    const both = sides.length === 2;
    for (const side of sides) {
      const principal = side === "att" ? war.att : war.def, foe = side === "att" ? war.def : war.att;
      const friend = callerOf(war, side, iso) || principal;                                      // whoever called: the principal, or an ally of it
      const winning = side === "att" ? war.score : -war.score, relF = W_.relOf(iso, friend);
      const jv = joinValue(iso, war, side, friend), front = jv.front;
      add({ action: "join", target: friend, war: war.id, side, value: jv.value, risk: jv.risk,
            why: [`${W_.nameOf(friend)} calls on its pact (relations ${r0(relF)})`, winning > 0 ? "and the war is going its way" : winning < 0 ? "though the war is going against it" : "before the first blow",
                  front ? `on a front of our own against ${W_.nameOf(front)}` : side === "def" ? `against ${W_.nameOf(foe)}` : `to attack ${W_.nameOf(foe)}`,
                  ...(both ? [`leaving our pact with ${W_.nameOf(foe)}`] : [])] });
    }
    const side0 = sides[0], friend0 = callerOf(war, side0, iso) || (side0 === "att" ? war.att : war.def);
    add({ action: "refuse", target: friend0, war: war.id, side: side0, value: 0, risk: 0,
          why: both ? [`${W_.nameOf(war.att)} and ${W_.nameOf(war.def)} both call on their pacts`, "and we will stand between them"] : [`${W_.nameOf(friend0)} calls on its pact`, "and we will not answer it"] });
  }
  // mobilise (monthly, at war): what a fast lift of the army does to our chances, against what it costs
  if (monthly && myWar && !occupier && W_.day >= (s.mobilUntil || 0)) {
    const att = fight.side === "att", foe = att ? myWar.def : myWar.att, o = S[foe];
    const odds = warOdds(myWar), gain = c.mobilStep * (c.projectGainTop - s.st.military / 100), lift = 1 + gain / Math.max(1, s.st.military);
    const pw0 = att ? pWinOf(odds, c) : 1 - pWinOf(odds, c), pw1 = att ? pWinOf(odds * lift, c) : 1 - pWinOf(odds / lift, c);
    const stake = defeatCost(s, o, inc, H, P, c) + (o ? prizeOf(s, o, inc, H, c).total : 0), cost = c.investDays * c.mobilPremium;
    const lineM = 1 + c.supplyLine * (1 - reachFactor(iso, foe, c));
    const daysSaved = warLengthOn(myWar, odds, c) - warLengthOn(myWar, att ? odds * lift : odds / lift, c);
    const sooner = daysSaved * warDayCostOf(iso, s, Math.max(1, warLengthOn(myWar, odds, c)), lineM, inc, P, c, odds).perDay;   // a stronger side ends it sooner, or later
    const stabGap = Math.max(0, want.stability - (s.st.stability - c.mobilStab));                          // the points it costs, by the gap they open
    if (E.canSpend(s, cost * inc * 0.5))
      add({ action: "mobilise", value: (pw1 - pw0) * stake + sooner - cost - c.mobilStab * pointWorth("stability", P, c) * stabGap / 50 * H, risk: 0,
            why: [`our chances ${r0(pw0 * 100)}% as the war stands`, `${r0(gain)} more points of military would make them ${r0(pw1 * 100)}%`] });
  }
  // peace (monthly, at war): an offer, when ending the war is worth something to us, and not again too soon after a refusal
  if (monthly && myWar && fight.principal && !occupier && W_.day - myWar.since >= c.peaceEarliest && W_.day >= ((myWar.offered || {})[iso] || 0)) {
    const foe = myWar.att === iso ? myWar.def : myWar.att, rung = proposeRung(iso, myWar, c);
    if (rung >= 0) {                                                     // no rung both would sign: nothing to put on the table this month
      const pv = peaceValueAt(iso, myWar, c, rung);
      const RUNG = ["the status quo", "an indemnity", "an indemnity and a lease", "an indemnity, a lease and tribute"];
      add({ action: "peace", target: foe, value: pv.value, risk: 0, rung,
            why: [pv.losing > 0 ? `the war is going against us (${pv.losing.toFixed(2)})` : "the war is going our way",
                  `terms: ${RUNG[rung]}`,
                  `about ${r0(pv.rem)} more days of it at ${warDayCostOf(iso, s, Math.max(1, pv.rem), 1, inc, P, c, warOdds(myWar)).perDay.toFixed(1)} days of income each`] });
    }
  }
  // borders (weekly): cover against threat, war and unrest, against what a closed border costs the economy; a change needs a clear case
  const lvl = s.border | 0;
  if (weekly) {
    const pressure = threat / 100 + (myWar ? 1 : 0) + (100 - s.st.stability) / 200;
    const cover = c.borderWorth * pressure / 2, eco = c.borderEcoCost;       // per level, per day
    const tighten = lvl < 2 ? score({ action: "border", target: lvl + 1, value: (cover - eco) * H, risk: 0,
                                       why: [`threat ${r0(threat)}`, myWar ? "at war" : `stability ${r0(s.st.stability)}`] }, caution, H) : null;
    const reopen = lvl > 0 ? score({ action: "border", target: lvl - 1, value: (eco - cover) * H, risk: threat / 100,
                                     why: [`a ${lvl === 2 ? "closed" : "restricted"} border costs the economy`, threat > 0 ? `but threat ${r0(threat)}` : "no threat"] }, caution, H) : null;
    if (tighten && tighten.U > c.borderMin) out.push(tighten);
    else if (reopen && reopen.U > c.borderMin) out.push(reopen);
  }
  // research (monthly): the technology it brings, and the academia
  if (monthly) {
    const cost = researchCost(s, c);
    if (E.canSpend(s, cost)) {
      const step = c.researchStep * frontier(s.st.technology), gapA = Math.max(0, want.academia - s.st.academia);
      add({ action: "research", value: (pointWorth("technology", P, c) * step + pointWorth("academia", P, c) * gapA / 50) * H - cost / inc * cheap, risk: 0,
            why: [`technology ${r0(s.st.technology)}`, `a ${T.science > 0.5 ? "scientific" : "practical"} temperament`] });
    }
  }
  out.push({ action: "hold", U: 0, value: 0, risk: 0, why: ["nothing pressing"] });
  return out;
}

/* ── The budget (monthly): which upkeep to pay.  A country that cannot
   carry budgetMonths of its upkeep out of what it has and expects stops
   paying for what it values least, and says so. ── */
const UPKEEP_STATS = [["infra", "upkeepInfra"], ["military", "upkeepMil"], ["medical", "upkeepMed"]];
function budget(iso, s, c) {
  const W_ = W(), E = window.ECONOMY, P = prioritiesOf(iso), name = W_.nameOf(iso);
  const income = E.taxIncome(s);
  const costs = UPKEEP_STATS.map(([stat]) => [stat, E.upkeepCost(s, stat)]);   // the same bill the economy charges
  const total = costs.reduce((a, [, v]) => a + v, 0);
  const plan = Object.assign({ infra: 1, military: 1, medical: 1 }, s.upkeepPlan || {});
  const before = JSON.stringify(plan);
  const room = s.treasury + E.credit(s) + (income - total) * 30 * c.budgetMonths;   // what a couple of months would leave
  if (room < 0 && total > 0) {
    const value = { infra: P.growth, military: P.guns + (W_.atWar(iso) ? 1 : 0), medical: P.order + s.detection };
    const cut = costs.filter(([stat]) => plan[stat] !== 0).sort((a, b) => value[a[0]] - value[b[0]])[0];
    if (cut) plan[cut[0]] = 0;
  } else for (const stat in plan) plan[stat] = 1;          // solvent again: pay everything
  s.upkeepPlan = plan;
  if (JSON.stringify(plan) !== before) {
    const skipped = Object.keys(plan).filter(k => plan[k] === 0);
    W_.log({ sev: "small", kind: "budget", iso, text: skipped.length ? `${name} stops paying for its ${skipped.map(k => k === "infra" ? "infrastructure" : k === "military" ? "army" : "hospitals").join(" and ")}`
                                                                         : `${name} resumes paying its upkeep in full` });
  }
}

function softmax(cands, temp, rng) {
  const maxU = Math.max(...cands.map(x => x.U));
  const ws = cands.map(x => Math.exp((x.U - maxU) / Math.max(0.001, temp)));
  let r = rng() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < cands.length; i++) { r -= ws[i]; if (r <= 0) return cands[i]; }
  return cands[cands.length - 1];
}

/* ── Executors ─────────────────────────────────────────────────── */
function execute(iso, s, pick, c) {
  const W_ = W(), name = W_.nameOf(iso);
  switch (pick.action) {
    case "invest": {                                   // a project: paid and paying out over the month
      const E = window.ECONOMY, pj = E.projectFor(s, pick.target);
      if (!E.canSpend(s, pj.cost * pj.total * 0.5)) return false;
      (s.projects || (s.projects = [])).push(pj);
      W_.log({ sev: "small", kind: "invest", iso, text: `${name} starts investing in ${pick.target}` });
      return true;
    }
    case "trade": {
      const prop = pick.prop && pick.prop.mutual ? pick.prop : proposeSwap(iso, pick.target);   // still worth it to both?
      if (!prop || !prop.mutual) return false;
      W_.addDeal(iso, pick.target, prop.deal);
      const step = c.dealRel * Math.min(1, prop.relA + prop.relB);       // a bigger deal is a bigger gesture
      W_.shiftRel(iso, pick.target, step); W_.rippleRel(iso, pick.target, step);
      const legs = RES_KEYS[prop.take] + (prop.give >= 0 ? ` for ${RES_KEYS[prop.give]}` : prop.tech ? " for money and technology" : " for money");
      W_.log({ sev: "small", kind: "trade", iso, iso2: pick.target,
               text: `${name} and ${W_.nameOf(pick.target)} sign a supply deal: ${legs} (worth ${Math.round(prop.value)} a day)` });
      return true;
    }
    case "cartel": {
      const f = pick.prop && pick.prop.mutual ? pick.prop : proposeFloor(iso, pick.target, pick.prop ? pick.prop.type : 0);
      if (!f || !f.mutual) return false;
      W_.addDeal(iso, pick.target, f.deal);
      const step = c.cartelRel * Math.min(1, f.relA + f.relB);                          // a floor is a smaller gesture than a cargo
      W_.shiftRel(iso, pick.target, step); W_.rippleRel(iso, pick.target, step);
      // the buyers who depend on the type resent it, in proportion to what it costs them
      const S2 = W_.COUNTRY_STATE, E2 = window.ECONOMY;
      for (const b in S2) {
        const bs = S2[b]; if (b === iso || b === pick.target || !bs.st || !bs.bill) continue;
        const share = bs.bill[f.type] / Math.max(1, E2.taxIncome(bs));
        if (share <= c.cartelAnger) continue;
        // resentment, bounded: it can sour a friendship into sanctions, never on its own into the enmity that starts a war
        for (const member of [iso, pick.target]) if (W_.relOf(b, member) > c.cartelAngerFloor) W_.shiftRel(b, member, -c.cartelRelHit);
      }
      W_.log({ sev: "large", kind: "cartel", iso, iso2: pick.target,
               text: `${name} and ${W_.nameOf(pick.target)} agree a price floor for ${RES_KEYS[f.type]} at ${f.floor.toFixed(2)}` });
      return true;
    }
    case "sanction": {
      const p = W_.pairOf(iso, pick.target), ended = W_.dropDeals(iso, pick.target);
      if (iso < pick.target) p.sanA = 1; else p.sanB = 1;
      W_.touchPairs();
      W_.shiftRel(iso, pick.target, -c.sanctionRel); W_.rippleRel(iso, pick.target, -c.sanctionRel);
      W_.log({ sev: "large", kind: "sanction", iso, iso2: pick.target,
               text: `${name} imposes sanctions on ${W_.nameOf(pick.target)}` + (ended ? `, ending ${ended} supply deal${ended > 1 ? "s" : ""}` : "") });
      return true;
    }
    case "unsanction": {
      const p = W_.pairOf(iso, pick.target);
      if (iso < pick.target) p.sanA = 0; else p.sanB = 0;
      W_.touchPairs();
      W_.shiftRel(iso, pick.target, c.sanctionRel / 2); W_.rippleRel(iso, pick.target, c.sanctionRel / 2);
      W_.log({ sev: "large", kind: "sanction", iso, iso2: pick.target, key: "lifted",
               text: `${name} lifts its sanctions on ${W_.nameOf(pick.target)}` });
      return true;
    }
    case "pact": {
      const p = W_.pairOf(iso, pick.target);
      p.pact = W_.day; W_.touchPairs(); W_.shiftRel(iso, pick.target, PACT_REL); W_.rippleRel(iso, pick.target, PACT_REL);
      W_.log({ sev: "large", kind: "pact", iso, iso2: pick.target, text: `${name} and ${W_.nameOf(pick.target)} sign a defence pact` });
      return true;
    }
    case "unpact": {
      const p = W_.pairOf(iso, pick.target);
      p.pact = 0; W_.touchPairs();
      W_.shiftRel(iso, pick.target, -c.pactBreakRelLoss); W_.rippleRel(iso, pick.target, -c.pactBreakRelLoss);
      W_.log({ sev: "large", kind: "pact", iso, iso2: pick.target, key: "broken",
               text: `${name} leaves its defence pact with ${W_.nameOf(pick.target)}` });
      return true;
    }
    case "enact": return window.GOV.enact(iso, s, pick.target);
    case "mobilise": return mobilise(iso, s, null);
    case "join": {
      const war = W_.WORLD_STATE.wars.find(w => w.id === pick.war);
      if (!war) return false;
      return joinWar(iso, war, pick.side, pick.target);
    }
    case "refuse": {
      const war = W_.WORLD_STATE.wars.find(w => w.id === pick.war);
      if (!war) return false;
      return refuseCall(iso, war, pick.target);
    }
    case "war":   return declareWar(iso, pick.target);
    case "peace": return offerPeace(iso, pick.target, pick.rung);
    case "border":
      s.border = pick.target | 0;
      W_.log({ sev: "small", kind: "border", iso, text: `${name} ${BORDER_NAME[s.border]}` });
      return true;
    case "research": {
      const cost = researchCost(s, c);
      if (!window.ECONOMY.canSpend(s, cost)) return false;
      s.treasury -= cost;
      s.st.technology = clamp(s.st.technology + c.researchStep * frontier(s.st.technology), 0, 100);   // harder at the frontier
      s.st.academia = clamp(s.st.academia + 1, 0, 100);
      W_.log({ sev: "small", kind: "research", iso, text: `${name} funds a research push` });
      return true;
    }
    default:
      return true;                                   // hold
  }
}

/* The monthly decision for one country.  An occupied country's decision
   is taken by its occupier: the occupier's temperament, no diplomacy. */
function act(iso, rng) { return decide(iso, rng, "monthly"); }
function diplomacyWeekly(iso, rng) { return decide(iso, rng, "weekly"); }
function decide(iso, rng, loop) {
  const W_ = W(), s = W_.COUNTRY_STATE[iso];
  if (!s || !s.st) return null;
  const c = cfg(), occupier = s.occupiedBy || null;
  if (window.GOV && window.GOV.ensurePowers) window.GOV.ensurePowers(iso, s);   // a seeded government draws its programme the first time it decides
  if (loop === "monthly") budget(iso, s, c);
  const T = temperament(occupier || iso, W_.seed);
  const cands = candidates(iso, s, c, T, occupier, loop, rng);
  const pick = softmax(cands, c.decideTemp, rng);
  execute(iso, s, pick, c);
  s.acts = s.acts || { monthly: 0, weekly: 0 }; s.acts[loop] = (s.acts[loop] || 0) + 1;
  s.last = { day: W_.day, loop, action: pick.action, target: pick.target == null ? null : pick.target, motive: pick.motive || null,
             stake: pick.parts && pick.parts.prize != null ? Math.round(pick.parts.prize) : null,
             reasons: (occupier ? [`decided in ${W_.nameOf(occupier)}`] : []).concat(pick.why).slice(0, 3) };
  remember(s, s.last);
  return s.last;
}
/* The last few decisions, newest first, for the country screen. */
function remember(s, entry) {
  (s.hist || (s.hist = [])).unshift(entry);
  if (s.hist.length > 8) s.hist.length = 8;
}

/* ── War ───────────────────────────────────────────────────────── */
/* Pact partners by country, rebuilt once a day: every war candidate asks
   for allies on both sides, and walking the whole pairs table each time
   made a month of decisions cost seconds. */
let pactDay = -1, pactVer = -1, pactMap = null;
function pactPartners(iso) {
  const W_ = W();
  if (pactDay !== W_.day || pactVer !== W_.pairsVersion || !pactMap) {
    pactDay = W_.day; pactVer = W_.pairsVersion; pactMap = Object.create(null);
    for (const k in W_.PAIRS) {
      if (!W_.PAIRS[k].pact) continue;
      const i = k.indexOf("|"), a = k.slice(0, i), b = k.slice(i + 1);
      (pactMap[a] || (pactMap[a] = [])).push(b);
      (pactMap[b] || (pactMap[b] = [])).push(a);
    }
  }
  return pactMap[iso] || [];
}
function allies(iso, enemy) {
  const S = W().COUNTRY_STATE;
  return pactPartners(iso).filter(o => o !== enemy && S[o] && S[o].st && !S[o].occupiedBy);
}
/* The allies worth calling: those who could open a front on the enemy, or whose counted force is worth having. */
function contributors(iso, enemy) {
  const W_ = W(), c = cfg(), mine = Math.max(1, W_.force(iso));
  return allies(iso, enemy).filter(a => canReach(a, enemy) || c.pactShare * W_.force(a) >= c.contributeMin * mine);
}
/* How far a country trusts a pact partner to come when called: 1 until
   the partner refuses someone, then refuseTrust, recovering slowly.  A
   refusal is a reputation: every partner of the refuser remembers it. */
function trustIn(s, ally) { return s && s.allyTrust && s.allyTrust[ally] != null ? s.allyTrust[ally] : 1; }
function setTrust(s, ally, v) { (s.allyTrust || (s.allyTrust = {}))[ally] = clamp(v, 0, 1); }
/* The strength a country counts on before a war: its own force plus the
   allies it expects, each weighted by how far it trusts them to come. */
function expectedStrength(iso, enemy) {
  const W_ = W(), S = W_.COUNTRY_STATE, c = cfg(), s = S[iso];
  let allied = 0;
  for (const a of allies(iso, enemy)) allied += trustIn(s, a) * W_.force(a);
  return W_.force(iso) + c.pactShare * allied;
}
/* Who called a country to a side: the principal, or an ally of it that joined (an old save's flat map is read too);
   and whether a country was called by both principals -- pledged to each, owing neither the war. */
function callerOf(war, side, iso) {
  const cb = war.calledBy || {};
  if (cb[side] && typeof cb[side] === "object") return cb[side][iso] || null;
  return typeof cb[iso] === "string" ? cb[iso] : null;
}
const conflicted = (war, iso) => !!(war.asked && war.asked.att.indexOf(iso) >= 0 && war.asked.def.indexOf(iso) >= 0);
function declareWar(att, def, opts) {
  const W_ = W(), S = W_.COUNTRY_STATE, A = S[att], D = S[def];
  if (!A || !D) return false;
  if (W_.warBetween(att, def)) return false;                     // one war per pair, forced or not
  if (!(opts && opts.force) && (!canFight(A) || !canFight(D))) return false;
  const ws = W_.WORLD_STATE.wars;
  const id = W_.WORLD_STATE.warSeq = (W_.WORLD_STATE.warSeq | 0) + 1;   // in the world state: saved, and reset by newWorld
  const war = { id, att, def, since: W_.day, score: 0, allies: { att: [], def: [] }, fronts: [],
                asked: { att: contributors(att, def), def: contributors(def, att) }, decided: {}, calledBy: { att: {}, def: {} },
                rel0: W_.relOf(att, def), markDay: W_.day, markScore: 0 };   // allies are asked, and answer in their own time; peace remembers where relations stood
  for (const p of war.asked.att) war.calledBy.att[p] = att;
  for (const p of war.asked.def) war.calledBy.def[p] = def;
  ws.push(war);
  const c = cfg();                                                // a war costs weariness up front, both sides
  A.weary = clamp((A.weary || 0) + c.wearyWar, 0, 100);
  D.weary = clamp((D.weary || 0) + c.wearyWar, 0, 100);
  W_.pairOf(att, def).warId = id;
  W_.pairOf(att, def).rel = Math.min(W_.relOf(att, def), -80);
  W_.dropDeals(att, def);                                         // nothing is shipped between countries at war
  W_.rippleRel(att, def, -c.warRipple);
  mobilise(def, D, "against " + W_.nameOf(att));                   // the defender calls up its reserves the day it is attacked
  W_.log({ sev: "large", kind: "war", iso: att, iso2: def,
           text: `${W_.nameOf(att)} declares war on ${W_.nameOf(def)}` + (war.asked.def.length ? ` — ${W_.nameOf(def)} calls on ${war.asked.def.map(W_.nameOf).join(", ")}` : "") });
  return true;
}
/* Mobilisation: the army grows fast and dear, at a cost in order, and
   stands down again after the war.  The defender mobilises the day it is
   attacked if it can pay; anyone at war may choose to. */
function mobilise(iso, s, why) {
  const W_ = W(), c = cfg(), E = window.ECONOMY;
  if (!s || !s.st || W_.day < (s.mobilUntil || 0)) return false;
  const gain = c.mobilStep * (c.projectGainTop - s.st.military / 100);
  const cost = c.investDays * E.taxIncome(s) * c.mobilPremium;
  if (!E.canSpend(s, cost * 0.5)) return false;
  (s.projects || (s.projects = [])).push({ stat: "military", days: c.mobilDays, total: c.mobilDays, gain: gain / c.mobilDays, cost: cost / c.mobilDays, since: W_.day, mobil: true });
  s.mobilised = (s.mobilised || 0) + gain;
  s.mobilUntil = W_.day + c.mobilDays * 2;
  s.st.stability = clamp(s.st.stability - c.mobilStab, 0, 100);
  W_.log({ sev: "small", kind: "war", key: "mobilise", iso, text: `${W_.nameOf(iso)} mobilises${why ? " " + why : ""}` });
  return true;
}
/* An ally answers the call: it fights, bleeds and shares the outcome.
   With a land border to a member of the other side it opens a front of
   its own there; its own pact partners are called in turn. */
function joinWar(iso, war, side, caller) {
  const W_ = W(), S = W_.COUNTRY_STATE, s = S[iso], c = cfg(), L = window.LINKS;
  if (!s || !s.st || !war || W_.WORLD_STATE.wars.indexOf(war) < 0) return false;
  if (war.allies[side].indexOf(iso) >= 0) return true;
  war.allies[side].push(iso);
  (war.decided || (war.decided = {}))[iso] = "join";
  const principal = side === "att" ? war.att : war.def, foe = side === "att" ? war.def : war.att;
  const friend = caller && S[caller] ? caller : principal;
  setTrust(S[friend], iso, 1);                                            // it came
  if (conflicted(war, iso)) {                                             // pledged to both: the other pact ends quietly, no reputation lost
    const q = W_.pairOf(iso, foe);
    if (q.pact) { q.pact = 0; W_.touchPairs(); W_.log({ sev: "large", kind: "pact", key: "left", iso, iso2: foe, text: `${W_.nameOf(iso)} leaves its pact with ${W_.nameOf(foe)} to stand by ${W_.nameOf(friend)}` }); }
  }
  s.weary = clamp((s.weary || 0) + c.wearyWar / 2, 0, 100);
  W_.shiftRel(iso, friend, c.joinRelFriend); W_.shiftRel(iso, foe, -c.joinRelFoe);
  W_.pairOf(iso, foe).rel = Math.min(W_.relOf(iso, foe), c.joinRelFoeFloor);
  W_.log({ sev: "large", kind: "war", key: "joins", iso, iso2: friend,
           text: `${W_.nameOf(iso)} enters the war at ${W_.nameOf(friend)}'s side` });
  // a front against every member of the other side it can reach: a land border always, a sea lane or the air by technology
  const other = side === "att" ? "def" : "att";
  for (const e of [foe, ...war.allies[other]]) {
    if (!S[e] || S[e].occupiedBy || !canReach(iso, e)) continue;
    frontsIn(war).push(side === "att" ? { a: iso, d: e, score: 0, since: W_.day } : { a: e, d: iso, score: 0, since: W_.day });
    W_.log({ sev: "large", kind: "war", key: "front", iso, iso2: e, text: `${W_.nameOf(iso)} opens a front against ${W_.nameOf(e)}` });
  }
  // the chain: its own partners are asked, by it
  const asked = war.asked || (war.asked = { att: [], def: [] });
  if (!war.calledBy || typeof war.calledBy.att !== "object") war.calledBy = { att: {}, def: {} };
  for (const p of contributors(iso, foe)) {
    if (inWar(war, p) || asked.att.indexOf(p) >= 0 || asked.def.indexOf(p) >= 0) continue;
    asked[side].push(p); war.calledBy[side][p] = iso;
  }
  return true;
}
/* A call refused: a reputation everywhere, relations lost with the caller; the pact itself is broken only when the
   caller is a principal fighting its own war -- a friend's friend's call declined only strains it. */
function refuseCall(iso, war, friend) {
  const W_ = W(), S = W_.COUNTRY_STATE, c = cfg(), name = W_.nameOf(iso);
  if (conflicted(war, iso)) {                                             // pledged to both principals: standing between them costs nothing
    (war.decided || (war.decided = {}))[iso] = "neutral";
    W_.log({ sev: "large", kind: "pact", key: "neutral", iso, iso2: friend, text: `${name} stays neutral between its allies ${W_.nameOf(war.att)} and ${W_.nameOf(war.def)}` });
    return true;
  }
  (war.decided || (war.decided = {}))[iso] = "refuse";
  const p = W_.pairOf(iso, friend), principalCall = friend === war.att || friend === war.def;
  for (const partner of pactPartners(iso)) setTrust(S[partner], iso, c.refuseTrust);   // a reputation: every partner remembers
  setTrust(S[friend], iso, c.refuseTrust);
  W_.shiftRel(iso, friend, -c.pactBreakRelLoss); W_.rippleRel(iso, friend, -c.pactBreakRelLoss);
  if (p.pact && principalCall) { p.pact = 0; W_.touchPairs(); }
  W_.log({ sev: "large", kind: "pact", key: "refused", iso, iso2: friend,
           text: principalCall ? `${name} refuses to honour its pact with ${W_.nameOf(friend)}` : `${name} declines ${W_.nameOf(friend)}'s call to arms` });
  return true;
}
/* An ally leaves the war: knocked out, or the war is over for it. */
function leaveWar(war, iso) {
  for (const side of ["att", "def"]) { const i = war.allies[side].indexOf(iso); if (i >= 0) war.allies[side].splice(i, 1); }
  war.fronts = frontsIn(war).filter(f => f.a !== iso && f.d !== iso);
  (war.decided || (war.decided = {}))[iso] = "out";
}
/* The winning side's members who fought the loser on a front of their own, and the winner itself, with their shares by force. */
function recipients(war, winner, loser) {
  const W_ = W(), side = winner === war.att ? "att" : "def", out = [[winner, W_.force(winner)]];
  for (const x of war.allies[side]) if (frontsIn(war).some(f => (f.a === x && f.d === loser) || (f.d === x && f.a === loser))) out.push([x, W_.force(x)]);
  const total = out.reduce((t, r) => t + r[1], 0) || 1;
  return out.map(([iso, f]) => ({ iso, share: f / total }));
}
/* Who occupies a beaten country: drawn by force among the winner and the allies that reach it by land. */
function occupierOf(winner, loser, rec, rng) {
  const L = window.LINKS;
  const able = rec.filter(r => r.iso === winner || viaHoldings(r.iso, loser, "land"));
  const total = able.reduce((t, r) => t + r.share, 0) || 1;
  let pick = able[able.length - 1], roll = (rng ? rng() : 1) * total;
  for (const r of able) { roll -= r.share; if (roll <= 0) { pick = r; break; } }
  return pick;
}
/* What answering a call is worth to an ally: the friend's gratitude, the
   pact and its cover kept (refusing a principal loses both), a share of
   the prize on a front of its own, less its share of the campaign; the
   chance of losing is the risk.  The weekly candidate reads it, and so
   does the estimate before a war: who would actually come. */
function joinValue(iso, war, side, friend) {
  const W_ = W(), S = W_.COUNTRY_STATE, c = cfg(), s = S[iso];
  const P = prioritiesOf(iso), H = P.horizon, inc = Math.max(1, window.ECONOMY.taxIncome(s)), threat = threatTo(iso, s);
  const principal = side === "att" ? war.att : war.def, foe = side === "att" ? war.def : war.att, F = S[friend];
  const odds = warOdds(war), pw = side === "att" ? pWinOf(odds, c) : 1 - pWinOf(odds, c);
  const rem = (1 - Math.abs(war.score)) * warLengthOn(war, odds, c);
  const worth = F ? relWorth(s, F, P, c) : 0;
  const kept = (c.pactBreakRelLoss * worth + (friend === principal ? coverWorth(iso, friend, threat, c) : 0)) * H;
  const enemies = [foe, ...war.allies[side === "att" ? "def" : "att"]];
  const front = enemies.find(e => S[e] && canReach(iso, e)) || null;                        // a member of the other side we can reach: a front of our own
  let value = c.joinRelFriend * worth * H + kept - (s.weary || 0) / 100 * c.wearyCost;
  if (front) {                                             // the full campaign, dearer far from home, and a share of the terms and the occupation
    const share = W_.force(iso) / Math.max(1, W_.force(iso) + W_.force(principal));
    const line = 1 + c.supplyLine * (1 - reachFactor(iso, front, c));
    const billA = warDayCostOf(iso, s, Math.max(1, rem), line, inc, P, c, odds);
    value += pw * prizeOf(s, S[front], inc, H, c).total * share - rem * (billA.perDay + c.warDeathCost * 100 * c.warDeathAtt * 1.5);
  } else {                                                 // behind the line: it bleeds at its own, lesser, rate and pays no campaign of its own
    const billB = warDayCostOf(iso, s, Math.max(1, rem), 1, inc, P, c, odds);
    value -= rem * (billB.kit * c.allyAttr * c.allyMilAttr / c.warMilAtt + c.warDeathCost * 100 * c.warDeathAtt * c.allyDeath * c.allyAttr * 1.5);
  }
  return { value, risk: 1 - pw, front, pw, H, principal, foe };
}
/* The chance an ally answers a call, as its weekly choice would fall: its scored join against refusing and holding. */
function joinChance(iso, war, side, friend) {
  const c = cfg(), T = temperament(iso, W().seed), jv = joinValue(iso, war, side, friend);
  const U = jv.value * Math.max(0, 1 - jv.risk * cautionOf(T, c)) / Math.max(1, jv.H);
  const e = Math.exp(Math.max(-50, Math.min(50, U / Math.max(0.001, c.decideTemp))));
  return e / (e + 2);
}
/* A front decided: a principal beaten on any front is defeated and the
   war ends; an ally beaten on its front pays the front's winner, may be
   occupied by it, and is out of the war.  Returns whether the war ended. */
function endFront(war, f, rng) {
  const W_ = W(), S = W_.COUNTRY_STATE, c = cfg();
  const winner = f.score > 0 ? f.a : f.d, loser = winner === f.a ? f.d : f.a;
  if (loser === war.att || loser === war.def) { endWar(war, "victory", rng, null, loser === war.att ? "def" : "att"); return true; }
  const Ls = S[loser], Wn = S[winner];
  if (Ls && Wn) {
    window.GOV.defeatShift(Ls);
    Wn.st.stability = clamp(Wn.st.stability + c.victoryStab, 0, 100);
    const p = W_.pairOf(winner, loser); p.rel = c.victoryRel; p.truce = W_.day + c.truceDays;
    const tribute = Math.min(Math.max(0, Ls.treasury), c.tributeDays * window.ECONOMY.taxIncome(Ls));
    Ls.treasury -= tribute; Wn.treasury += tribute;
    const byLand = viaHoldings(winner, loser, "land");
    const occupied = !!rng && byLand && rng() < c.occupyChance + Wn.authority / c.occupyAuthDiv;
    W_.log({ sev: "large", kind: "front", iso: winner, iso2: loser, text: `${W_.nameOf(winner)} knocks ${W_.nameOf(loser)} out of the war` + (occupied ? " and occupies it" : "") });
    if (occupied) occupy(winner, loser, Math.round(c.occupyDaysBase * (0.5 + rng())), true);
  }
  leaveWar(war, loser);
  return false;
}
function endWar(war, outcome, rng, terms, winnerSide) {
  const W_ = W(), S = W_.COUNTRY_STATE, c = cfg();
  const ws = W_.WORLD_STATE.wars, i = ws.indexOf(war);
  if (i >= 0) ws.splice(i, 1);
  const pr = W_.pairOf(war.att, war.def);
  const draw = (hash32(W_.seed + war.id * 7919) % 1000) / 1000;   // the same war always draws the same truce
  pr.warId = 0; pr.truce = W_.day + Math.round(c.truceDays * (c.truceMin + draw * (c.truceMax - c.truceMin)));   // however it ended, no new war between the two for a while
  const na = W_.nameOf(war.att), nd = W_.nameOf(war.def);
  const remember = (iso, other, outcome) => { const s = S[iso]; if (s) (s.lastWar || (s.lastWar = {}))[other] = { o: outcome, d: W_.day }; };
  const scarred = () => Math.min((war.rel0 == null ? pr.rel : war.rel0) - c.peaceScar, 100);   // never above where the war began, less a scar
  if (outcome === "peace") {
    const p = W_.pairOf(war.att, war.def);                  // a treaty: at least a truce, above the war gate, but never warmer than before the war
    p.rel = clamp(Math.min(scarred(), Math.max(p.rel + c.peaceRel, c.truceRel)), -100, 100);
    const t = terms || null;
    const ahead = t ? t.winner : null;
    remember(war.att, war.def, ahead === war.att ? "won" : ahead === war.def ? "lost" : "peace");
    remember(war.def, war.att, ahead === war.def ? "won" : ahead === war.att ? "lost" : "peace");
    W_.log({ sev: "large", kind: "peace", iso: war.att, iso2: war.def,
             text: `${na} and ${nd} make peace` + (t ? `: ${W_.nameOf(t.loser)} ${t.text}` : "") });
    return;
  }
  if (outcome === "stalemate") {
    const p = W_.pairOf(war.att, war.def);                  // exhausted, not reconciled
    p.rel = clamp(Math.min(scarred(), Math.max(p.rel + c.peaceRel / 2, c.truceRel - 10)), -100, 100);
    remember(war.att, war.def, "stalemate"); remember(war.def, war.att, "stalemate");
    W_.log({ sev: "large", kind: "stalemate", iso: war.att, iso2: war.def, text: `The war between ${na} and ${nd} ends in stalemate` });
    return;
  }
  const winner = winnerSide ? (winnerSide === "att" ? war.att : war.def) : war.score > 0 ? war.att : war.def, loser = winner === war.att ? war.def : war.att;
  const Wn = S[winner], Ls = S[loser];
  window.GOV.defeatShift(Ls);
  Wn.st.stability = clamp(Wn.st.stability + c.victoryStab, 0, 100);
  W_.pairOf(winner, loser).rel = c.victoryRel;
  remember(winner, loser, "won"); remember(loser, winner, "lost");
  // tribute: a share of the loser's treasury, split among the winner and its allies who fought the loser on a front, by force
  const rec = recipients(war, winner, loser);
  const tribute = Math.min(Math.max(0, Ls.treasury), c.tributeDays * window.ECONOMY.taxIncome(Ls));   // days of income, never a debt
  Ls.treasury -= tribute;
  for (const r of rec) S[r.iso].treasury += tribute * r.share;
  // the occupier, if any, is drawn by force among those who can hold the ground: the winner, and allies that reach the loser by land
  const pick = occupierOf(winner, loser, rec, rng);
  const occupied = !!rng && rng() < c.occupyChance + S[pick.iso].authority / c.occupyAuthDiv;
  const withAllies = rec.length > 1 ? ` with ${rec.slice(1).map(r => W_.nameOf(r.iso)).join(", ")}` : "";
  W_.log({ sev: "massive", kind: "victory", key: winner === war.att ? "attacker" : "defender", iso: winner, iso2: loser,
           text: `${W_.nameOf(winner)}${withAllies} defeats ${W_.nameOf(loser)}` + (occupied ? (pick.iso === winner ? " and occupies it" : `; ${W_.nameOf(pick.iso)} occupies it`) : "") });
  if (occupied) occupy(pick.iso, loser, Math.round(c.occupyDaysBase * (0.5 + rng())), true);
}
/* Peace with terms: the side that is behind sues, and the side ahead
   takes an indemnity -- a money deal over peaceTermDays -- and, if the
   loser has spare of something the winner lacks, a lease of it.  A war
   nobody is winning ends with a bare treaty. */
function peaceTerms(war, loser, winner, rung) {
  const W_ = W(), S = W_.COUNTRY_STATE, c = cfg(), E = window.ECONOMY;
  const margin = Math.abs(war.score);
  if (rung == null) rung = margin < c.peaceTermsMin ? 0 : 2;              // the old scripted price, for any caller that gives none
  if (rung <= 0) return null;                                              // the status quo: a treaty and nothing more
  const Ls = S[loser], until = W_.day + c.peaceTermDays;
  const mq = c.peaceIndemnity * margin * E.taxIncome(Ls);
  const lease = rung >= 2 ? peaceLease(loser, winner) : { type: -1, qty: 0 };
  const rec = recipients(war, winner, loser);                    // the indemnity, the lease and the tribute are shared by force
  for (const r of rec) {
    const firstR = loser < r.iso, mqR = mq * r.share, lqR = lease.qty * r.share;
    const deal = firstR
      ? { g: lease.type, gq: lqR, t: -1, tq: 0, mq: mqR, tech: 0, until, since: W_.day, short: 0 }
      : { g: -1, gq: 0, t: lease.type, tq: lqR, mq: -mqR, tech: 0, until, since: W_.day, short: 0 };
    W_.addDeal(loser, r.iso, deal);
  }
  let tribute = 0;
  if (rung >= 3) {                                                          // a lump now, as a defeat would take, but no scar and no occupation
    tribute = Math.min(Math.max(0, Ls.treasury), c.tributeDays * E.taxIncome(Ls));
    Ls.treasury -= tribute;
    for (const r of rec) S[r.iso].treasury += tribute * r.share;
  }
  const parts = [`pays an indemnity of ${Math.round(mq)} a day for ${Math.round(c.peaceTermDays / 30)} months`];
  if (lease.type >= 0) parts.push(`leases ${RES_KEYS[lease.type]} to ${W_.nameOf(winner)}`);
  if (tribute > 0) parts.push(`hands over ${Math.round(tribute)} in tribute`);
  if (rec.length > 1) parts.push(`shared with ${rec.slice(1).map(r => W_.nameOf(r.iso)).join(", ")}`);
  return { loser, winner, rung, mq, leaseType: lease.type, leaseQty: lease.qty, tribute, text: parts.join(" and ") };
}
/* An offer of peace: the other side takes it when ending the war is worth
   something to it too; otherwise it is refused, and the offer is not
   repeated for peaceRetry days.  Peace takes two. */
function offerPeace(iso, other, rung) {
  const W_ = W(), c = cfg(), war = W_.warBetween(iso, other);
  if (!war) return false;
  (war.offered || (war.offered = {}))[iso] = W_.day + c.peaceRetry;
  if (rung == null || rung < 0) rung = proposeRung(iso, war, c);
  // the other side answers with the rung it would have proposed -- its best among those we would sign -- and the
  // better of the two for it is what gets signed.  Who asks first no longer sets the price.
  const counter = proposeRung(other, war, c);
  const worth = r => r < 0 ? -Infinity : peaceValueAt(other, war, c, r).value;   // asked again on the day: the war has moved since the candidate
  if (counter >= 0 && worth(counter) > worth(rung)) rung = counter;
  const theirs = { value: worth(rung) };
  if (theirs.value <= 0) {
    W_.log({ sev: "small", kind: "offer", iso, iso2: other, text: `${W_.nameOf(other)} refuses ${W_.nameOf(iso)}'s offer of peace` });
    return true;                                                         // the offer was made; the month is spent
  }
  return suePeace(iso, other, rung);
}
/* Peace, scripted: ends the war on terms from the side ahead. */
function suePeace(iso, other, rung) {
  const W_ = W(), war = W_.warBetween(iso, other);
  if (!war) return false;
  const ahead = war.score > 0 ? war.att : war.def, behind = ahead === war.att ? war.def : war.att;
  const terms = peaceTerms(war, behind, ahead, rung);
  endWar(war, "peace", null, terms);
  return true;
}
/* Fighting strength: force (people under arms, with technology and
   infrastructure) plus a share of the allies' forces.  Stage 6 adds the
   margin of error; until then this is the truth on both sides. */
function strength(iso, allyList) {
  const W_ = W(), S = W_.COUNTRY_STATE, c = cfg(), s = S[iso];
  if (!s || !s.st) return 0;
  let allied = 0;
  for (const a of allyList) if (S[a] && S[a].st) allied += W_.force(a);
  return W_.force(iso) + c.pactShare * allied;
}
/* The defender's strength as the attacker meets it: dug in (defenceBonus)
   and, across a mountain border, behind terrain.  Used both to decide a
   war and to fight it, so what deters is what happens. */
function defended(def, att, allyList) {
  const c = cfg(), L = window.LINKS;
  const range = L && L.ready ? L.rangeOf(def, att) : 1;
  return strength(def, allyList || allies(def, att)) * c.defenceBonus * (1 + c.terrainDefence * (1 - range));
}
function warTick(rng) {
  const W_ = W(), S = W_.COUNTRY_STATE, c = cfg();
  for (const iso in S) {                                                 // at peace the reserves stand down, and trust in absent friends mends
    const s = S[iso]; if (!s.st) continue;
    if (s.mobilised > 0 && !W_.fighting(iso)) { const step = Math.min(s.mobilised, c.demobRate); s.st.military = clamp(s.st.military - step, 0, 100); s.mobilised -= step; }
    if (s.allyTrust) for (const a in s.allyTrust) { if (s.allyTrust[a] >= 1) delete s.allyTrust[a]; else s.allyTrust[a] = Math.min(1, s.allyTrust[a] + c.trustRecover); }
  }
  // a day of war on a front: the economy, the roads and order suffer; armies are spent, more the attacker's and more far
  // from home; people die, more the defender's
  // each front carries its own odds, so a rout on one wears nobody out while an even fight elsewhere grinds
  const bleed = (s, losingShare, role, line, odds) => {
    const m = (1 + losingShare) * intensityOf(odds);                     // line: the attacker's supply line, or the defender's domain penalty
    window.ECONOMY.hitOutput(s, c.warAttrEco * m);                        // output, not the index
    s.st.infra     = clamp(s.st.infra     - c.warAttrInfra * m, 0, 100);
    s.st.stability = clamp(s.st.stability - c.warAttrStab  * m, 0, 100);
    s.st.military  = clamp(s.st.military  - (role === "att" ? c.warMilAtt : c.warMilDef) * line * m, 0, 100);
    const dead = Math.max(0, s.pop) * (role === "att" ? c.warDeathAtt : c.warDeathDef) * m;
    s.pop = Math.max(0.001, s.pop - dead); s.warDead = (s.warDead || 0) + dead;
    s.weary = clamp((s.weary || 0) + c.wearyPerDay, 0, 100);
  };
  // the front moves by the odds, bounded: (odds - 1) / (odds + 1) is a third of the way at 2:1, a tenth at 1.2:1,
  // so a war begun on a thin edge crawls and can time out, while a rout still ends in days; close fronts are uncertain;
  // and it moves at the pace of its reach: across a sea lane or by air a front crawls, unless the defender cannot contest the domain
  const move = (odds, pace) => (c.warPace * c.warSwing * (odds - 1) / (odds + 1) + (rng() - 0.5) * c.warNoise * 2 / (odds + 1 / odds)) * pace;
  for (const war of W_.WORLD_STATE.wars.slice()) {
    const A = S[war.att], D = S[war.def];
    if (!A || !D) { endWar(war, "stalemate"); continue; }
    // the principals' front
    const odds = frontOdds(war, null), dom = frontDomain(war.att, war.def);
    war.score += move(odds, frontPace(dom));
    const line = 1 + c.supplyLine * (1 - dom.reach);
    bleed(A, Math.max(0, -war.score), "att", line, odds); bleed(D, Math.max(0, war.score), "def", dom.contested ? 1 : c.domainPenalty, odds);
    if (!war.fled && war.score >= c.warFleeAt && window.EVENTS && window.EVENTS.flee) { war.fled = true; window.EVENTS.flee(war.def, c.warRefugeeRate, "war", rng); }
    // the allies' fronts, each on its own
    let over = false;
    for (const f of frontsIn(war).slice()) {
      const fa = S[f.a], fd = S[f.d];
      if (!fa || !fd || fa.occupiedBy || fd.occupiedBy) { war.fronts = frontsIn(war).filter(x => x !== f); continue; }
      const fdom = frontDomain(f.a, f.d);
      const fodds = frontOdds(war, f);
      f.score += move(fodds, frontPace(fdom));
      bleed(fa, Math.max(0, -f.score), "att", 1 + c.supplyLine * (1 - fdom.reach), fodds); bleed(fd, Math.max(0, f.score), "def", fdom.contested ? 1 : c.domainPenalty, fodds);
      if (Math.abs(f.score) >= 1 && endFront(war, f, rng)) { over = true; break; }
    }
    if (over) continue;
    // allies without a front of their own share the attrition, mostly as soldiers
    const allyBleed = (iso, losingShare) => {
      const s = S[iso]; if (!s || !s.st || hasFront(war, iso)) return;
      const m = (1 + losingShare) * c.allyAttr;
      s.st.military  = clamp(s.st.military - c.allyMilAttr * m, 0, 100);
      s.st.stability = clamp(s.st.stability - c.warAttrStab * m * 0.5, 0, 100);
      const dead = Math.max(0, s.pop) * c.warDeathAtt * c.allyDeath * m;
      s.pop = Math.max(0.001, s.pop - dead); s.warDead = (s.warDead || 0) + dead;
      s.weary = clamp((s.weary || 0) + c.wearyPerDay * c.allyAttr, 0, 100);
    };
    for (const a of war.allies.att) allyBleed(a, Math.max(0, -war.score));
    for (const d of war.allies.def) allyBleed(d, Math.max(0, war.score));
    // the side with the lesser technology learns from the other's under fire, very slowly
    if (A.st.technology < D.st.technology) W_.shareTech(war.def, war.att, c.warTechRate, c.warTechCap);
    else if (D.st.technology < A.st.technology) W_.shareTech(war.att, war.def, c.warTechRate, c.warTechCap);
    if (Math.abs(war.score - (war.markScore || 0)) >= c.stalemateBand) { war.markDay = W_.day; war.markScore = war.score; }   // the front moved
    if (Math.abs(war.score) >= 1) endWar(war, "victory", rng);
    else if (W_.day - war.since >= c.warMaxDays || W_.day - (war.markDay == null ? war.since : war.markDay) >= c.stalemateDays) endWar(war, "stalemate");
  }
}

/* ── Occupation ────────────────────────────────────────────────── */
function occupy(a, b, days, quiet) {
  const W_ = W(), S = W_.COUNTRY_STATE, B = S[b];
  if (!S[a] || !B) return false;
  B.occupiedBy = a; B.occupiedUntil = W_.day + Math.max(1, days | 0); refreshHoldings();
  B.border = Math.max(B.border | 0, 1);
  if (!quiet) W_.log({ sev: "large", kind: "occupation", iso: a, iso2: b, text: `${W_.nameOf(a)} occupies ${W_.nameOf(b)}` });
  return true;
}
/* How firmly each occupation is held.  The occupier posts a garrison sized to what the occupied country could still
   muster (occupyGarrison of its own force) out of a share of its own force (garrisonShare) split among its holdings;
   the fill of that garrison is the hold.  A held territory yields a levy of its people (occupyLevy x hold) to the
   occupier's army and rises less often; a thinly held one yields little and throws the garrison out. */
function control(S, c, W_) {
  const need = {}, byOcc = {};
  for (const iso in S) { const s = S[iso]; if (s.st) { s.levy = 0; s.garrison = 0; s.hold = 0; } }
  for (const iso in S) {
    const s = S[iso];
    if (!s.st || !s.occupiedBy || !S[s.occupiedBy] || !S[s.occupiedBy].st) continue;
    need[iso] = c.occupyGarrison * W_.ownForce(iso);
    (byOcc[s.occupiedBy] || (byOcc[s.occupiedBy] = [])).push(iso);
  }
  for (const a in byOcc) {
    const A = S[a], budget = c.garrisonShare * W_.ownForce(a);
    let total = 0;
    for (const o of byOcc[a]) total += need[o];
    for (const o of byOcc[a]) {
      const posted = total > 0 ? Math.min(need[o], budget * need[o] / total) : 0, fill = need[o] > 0 ? posted / need[o] : 1;
      S[o].hold = fill; A.garrison += posted; A.levy += c.occupyLevy * Math.max(0, S[o].pop) * fill;
    }
  }
}
/* The daily chance that an occupied country rises: restless, more so the more of its people are levied, less so the
   more firmly it is held. */
function upriseChanceOf(iso) {
  const s = W().COUNTRY_STATE[iso], c = cfg();
  if (!s || !s.occupiedBy) return 0;
  const hold = s.hold || 0;
  return c.upriseBase * (1.5 - (s.legit != null ? s.legit : 50) / 100) * (1 + c.upriseLevy * c.occupyLevy * hold) * (1 - c.upriseHold * hold);
}
function occupationTick(rng) {
  const W_ = W(), S = W_.COUNTRY_STATE, c = cfg();
  refreshHoldings(); control(S, c, W_);
  for (const iso in S) {
    const s = S[iso];
    if (!s.occupiedBy) continue;
    const occ = S[s.occupiedBy];
    // an uprising: a restless country under a garrison that has lost its grip throws the occupier out
    if (occ && rng && s.st.stability < c.upriseStability && rng() < upriseChanceOf(iso)) {
      uprising(iso, s, occ, c);
      continue;
    }
    if (!occ || W_.day >= s.occupiedUntil) {
      if (occ) {
        window.GOV.occupierStamp(s, occ, c.occupyShift);         // the regime carries the occupier's stamp; the nation does not
        s.crisisDays = 0; s.st.stability = Math.max(s.st.stability, c.releaseStab);   // a liberated country gets a breath before it is judged
        W_.log({ sev: "large", kind: "release", iso: s.occupiedBy, iso2: iso, text: `${W_.nameOf(s.occupiedBy)} withdraws from ${W_.nameOf(iso)}` });
      }
      s.occupiedBy = null; s.occupiedUntil = 0; refreshHoldings();
      continue;
    }
    s.st.stability = clamp(s.st.stability - c.occupyStab, 0, 100);
    const skim = Math.min(occupyYield(s, c), Math.max(0, s.treasury));   // money only, and only what it has: the production share is taken in economy.js
    s.treasury -= skim;
    occ.treasury += skim;
  }
}

function uprising(iso, s, occ, c) {
  const W_ = W();
  const who = s.occupiedBy;
  s.occupiedBy = null; s.occupiedUntil = 0; s.crisisDays = 0; refreshHoldings();
  s.st.stability = clamp(Math.max(s.st.stability, c.releaseStab) + c.upriseStabGain, 0, 100);
  occ.st.military = clamp(occ.st.military - c.upriseMil, 0, 100);
  occ.weary = clamp((occ.weary || 0) + c.upriseWeary, 0, 100);
  W_.shiftRel(iso, who, -20);
  W_.log({ sev: "massive", kind: "uprising", iso, iso2: who, text: `Uprising in ${W_.nameOf(iso)} throws out ${W_.nameOf(who)}'s garrison` });
}

/* ── Outbreak reactions ────────────────────────────────
   Called by world.js the moment detection crosses the reaction floor
   (and monthly while it stays above).  The same scoring, a narrower
   menu, no monthly wait: close borders, fund hospitals, push research,
   or bar travel from the country the outbreak seems to come from. */
const stats = { reactions: 0 };
function react(iso, rng) {
  const W_ = W(), S = W_.COUNTRY_STATE, s = S[iso], c = cfg(), L = window.LINKS;
  if (!s || !s.st) return null;
  const T = temperament(s.occupiedBy || iso, W_.seed), d = s.detection, name = W_.nameOf(iso);
  const cands = [];
  if ((s.border | 0) < 2)
    cands.push({ action: "border", target: (s.border | 0) + 1, U: c.wReact * d * (0.5 + T.caution) * (0.5 + s.authority / 100),
                 why: [`detection ${Math.round(d * 100)}%`, `authority ${r0(s.authority)}`] });
  const E = window.ECONOMY, rush = E.projectFor(s, "medical", c.reactPremium), rushCost = rush.cost * rush.total;
  if (E.canSpend(s, rushCost))
    cands.push({ action: "invest", target: "medical", U: c.wReact * d * (1.2 - s.st.medical / 100),
                 why: [`medical at ${r0(s.st.medical)}`, `detection ${Math.round(d * 100)}%`] });
  if (E.canSpend(s, researchCost(s, c)))
    cands.push({ action: "research", U: c.wReact * d * (0.3 + T.science) * (s.st.academia / 100),
                 why: [`academia ${r0(s.st.academia)}`, `detection ${Math.round(d * 100)}%`] });
  let source = null, worst = 0;
  if (L && L.ready) for (const other of L.partners(iso)) {
    const o = S[other];
    if (o && o.covered && o.coverageLevel > worst) { worst = o.coverageLevel; source = other; }
  }
  if (source && s.ban !== source)
    cands.push({ action: "ban", target: source, U: c.wReact * d * worst * (0.5 + T.caution),
                 why: [`${W_.nameOf(source)} looks like the source (coverage ${Math.round(worst * 100)}%)`] });
  const pick = softmax(cands, c.reactTemp, rng);                 // its own scale: the outbreak pass is still to come
  stats.reactions++;
  if (pick.action === "ban") {
    s.ban = pick.target; s.banUntil = W_.day + c.travelBanDays;
    W_.shiftRel(iso, pick.target, -5);
    W_.log({ sev: "large", kind: "reaction", iso, iso2: pick.target, text: `${name} bars travel from ${W_.nameOf(pick.target)} over the outbreak` });
  } else if (pick.action === "invest") {                  // an emergency: paid now at a premium, hospitals built now
    let ok = false;
    if (E.canSpend(s, rushCost)) { s.treasury -= rushCost; s.st.medical = clamp(s.st.medical + rush.gain * rush.total, 0, 100); ok = true; }
    if (ok) W_.log({ sev: "large", kind: "reaction", iso, text: `${name} pours money into its hospitals` });
  } else {
    const ok = execute(iso, s, pick, c);
    const said = { border: `${name} tightens its borders as the outbreak spreads`, invest: `${name} pours money into its hospitals`,
                   research: `${name} launches an emergency research programme` };
    if (ok) W_.log({ sev: "large", kind: "reaction", iso, text: said[pick.action] || `${name} responds to the outbreak` });
  }
  s.last = { day: W_.day, loop: "react", action: "react:" + pick.action, target: pick.target == null ? null : pick.target, reasons: pick.why.slice(0, 3) };
  remember(s, s.last);
  return s.last;
}

window.DECIDE = { act, diplomacyWeekly, candidates, react, budget, prioritiesOf, wants, warTick, occupationTick, threatTo, INVEST,
                  declareWar, suePeace, occupy, canFight, strength, defended, allies, proposeSwap, standing, stats,
                  canReach, estimateRatio, errorSpread, joinWar, peaceTerms, uprising, proposeFloor, bestSale,
                  mobilise, expectedStrength, trustIn, setTrust, offerPeace, peaceValue, pWinOf, warLength, prizeOf, cautionOf, pointWorth, relWorth,
                  frontOdds, fightingIn, endFront, leaveWar, recipients, frontDomain, frontPace, frontShare, occupierOf, warLengthOn, joinValue, joinChance, contributors, refuseCall,
                  holdingsOf, viaHoldings, refreshHoldings, upriseChanceOf, callerOf, conflicted, sellShare, billShare,
                  warDayCostOf, defeatCost, peaceValueAt, proposeRung, peaceLease, needPriceOf };
})();
