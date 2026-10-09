/* ═══════════════════════════════════════════════════════════════
   Entity — trade: goods and people on the links
   The second pillar (docs/design.md §5.1 as decided, docs/nations.md
   §2).  Runs once over the whole world after the economy's day.  Every
   nation posts an ask (what it went short of today, and a little to
   rebuild its stores) and an offer (what the idle captured for export
   in the spare infrastructure slots, and what its stores hold above a
   comfort that shrinks as the price rises).  Standing deals are
   delivered first; then each seller's offer is split among the buyers
   it is linked to in proportion to their asks, within each edge's
   capacity and each nation's trade capacity, at one world price per
   resource that moves with the world's asks over its offers.  A
   shortfall bought from the same seller for a month becomes a deal.
   The idle and the unhoused who leave move along the links to nations
   with room, a few thousand a day per edge; those with nowhere to go
   stay.  Everything is a ledger line, and no money is lent.
   ═══════════════════════════════════════════════════════════════ */
(() => {
"use strict";
const W = window.WORLD, E = window.ECONOMY, D = window.DATA;
const cfg = () => window.ENTITY_CONFIG || LEVERS;
const RES = ["food", "energy", "materials"];

/* ── Levers: the config panel's Trade group ── */
const LEVERS = {
  priceElasticity: 0.05, priceFloor: 0.1, priceCeiling: 10,   // the price's daily move per unit of imbalance; its bounds
  tradePerUnit: 2,                                            // units a day a unit of economy can trade, bought and sold together
  comfortDays: 15, restockDays: 30,                           // days of use kept in store at price 1; days over which a store is rebuilt
  exportMargin: 0.2,                                          // least price per unit of effort worth capturing for export
  exportShift: 0.01,                                          // share of the economy's workers that may move to or from export in a day
  dealAfterDays: 30, dealMinUnits: 0.5, dealTerm: 365, dealLapseDays: 30,
  migPerCap: 0.0005,                                          // M people a day an edge carries per unit of its capacity
};
const ROWS = [
  ["priceElasticity", "price move per unit of imbalance", "×/day"], ["priceFloor", "price floor", "money"], ["priceCeiling", "price ceiling", "money"],
  ["tradePerUnit", "trade capacity per unit of economy", "units/day"],
  ["comfortDays", "store kept at price 1", "days of use"], ["restockDays", "a store is rebuilt over", "days"],
  ["exportMargin", "least price per effort worth exporting", "money"],
  ["exportShift", "economy workers moving to export a day", "share"],
  ["dealAfterDays", "days of buying before a deal", "days"], ["dealMinUnits", "least deal", "units/day"],
  ["dealTerm", "a deal runs for", "days"], ["dealLapseDays", "undelivered days before a deal lapses", "days"],
  ["migPerCap", "migrants an edge carries per unit of capacity", "M/day"],
];
const K = { priceStart: 1, comfortPriceExp: 1, storeSellShare: 0.1, spikeDays: 30, spikeRatio: 2, importHeavy: 0.5, dealMinShare: 0.02,
            crisisDays: 3, crisisSellShare: 0.5 };

const FIELDS = [["deals", "dl", []], ["buying", "by", {}], ["exportWorkers", "xw", 0]];   // the buyer's deals and running spot purchases; the economy workers moved to export
const WORLD_FIELDS = [["prices", "pri", [1, 1, 1]]];
const f = (v, d) => (+v || 0).toFixed(d == null ? 1 : d);
const key = (seller, r) => seller + "|" + r;

/* ── The world's day ── */
function dailyWorld(rng, LW) {
  const S = W.COUNTRY_STATE, c = cfg(), P = W.WORLD_STATE.prices, L = window.LINKS, day = W.day;
  if (!L || !L.ready || !E) return;
  const ledger = iso => W.ledgerOf(iso), add = (iso, k, label, v, unit, reason) => ledger(iso).add("trade", "trade." + k, label, v, unit, reason);
  const isos = Object.keys(S).filter(iso => S[iso].shares && S[iso].ceil && S[iso].ceil.some(v => v > 0));
  const need = Object.create(null), ask = Object.create(null), offer = Object.create(null), cap = Object.create(null);
  const bought = Object.create(null), sold = Object.create(null), paid = Object.create(null), earned = Object.create(null);
  const used = new Float64Array(L.edges.length);                 // goods an edge has carried today
  // 1. export capture, asks and offers
  for (const iso of isos) {
    const s = S[iso], Le = ledger(iso), N = E.needs(s, c);
    const slots = E.slotsOf(s), reserved = Le.get("economy.workExport");          // the economy kept these out of its own slots for export
    const spare = Math.max(0, slots.I - Le.get("economy.workInfra") - reserved);
    let idle = Le.get("economy.idle"), exporters = 0;
    const fed = Le.get("economy.famine") <= 0.02;                 // nobody exports food out of a famine; the energy left in store limits the rest
    const broke = (Le.get("economy.econPaid") < E.K.shortLine || !fed) && s.treasury < Le.get("economy.held") + 1e-9;   // unpaid and without the month's bill in hand
    // the resource that pays best per unit of effort, net of the energy it costs, among those a linked nation asked
    // for yesterday: the market is local, so a nation exports to the asks it can reach, not to the world's price alone
    const st = s._strain || [0, 0, 0], cE = E.captureEnergyPer(s), cpw = E.cpw(s), dem = s._demand || [0, 0, 0];
    let best = -1, bestV = c.exportMargin;
    for (let r = 0; r < 3; r++) {
      if (!(s.ceil[r] > 0) || (r === 0 && !fed) || !(dem[r] > 0)) continue;   // no food leaves a nation in famine; its energy and materials may
      const v = P[r] / (1 + st[r]) - (r === 1 ? 0 : P[1] * cE);
      if (v > bestV) { bestV = v; best = r; }
    }
    let exported = [0, 0, 0];                                     // today's capture for export, offered in full
    if (best >= 0 && (reserved > 0 || (spare > 0 && idle > 0))) {
      const fromIdle = Math.min(idle, spare);
      exporters = reserved + fromIdle;
      const effort = exporters * cpw, got = E.capture(s, best, effort);
      const energyCost = best === 1 ? 0 : cE * got, have = s.stores[1];
      const scale = energyCost > have && energyCost > 0 ? have / energyCost : 1;        // no energy, no digging
      const got2 = got * scale;
      s.stores[1] -= energyCost * scale; s.stores[best] += got2; exported[best] = got2;
      st[best] = s.ceil[best] > 0 ? ((st[best] * s.ceil[best]) + effort * scale) / s.ceil[best] : st[best];
      s._idle = Math.max(0, idle - fromIdle); idle = s._idle;
      add(iso, "exportWorkers", "capturing for export", exporters, "M", reserved > 0 ? f(reserved) + " M from the economy" : "");
      add(iso, "export." + RES[best], RES[best] + " captured for export", got2, "units");
    }
    s._exportWorkers = exporters;
    // tomorrow's reserve: economy workers move to export while a unit of effort earns more there, and back when it does not
    const econPay = c.moneyPerWorker * Le.get("economy.econPaid") * (1 + E.K.techMoney * Math.min(s.tech, 100) / 100);
    const exportPay = best >= 0 ? cpw * bestV : 0;
    const step = c.exportShift * Math.max(1, Le.get("economy.workEcon") + reserved), room = Math.max(0, slots.I - Le.get("economy.workInfra"));
    let target = s.exportWorkers || 0, why = "";
    if (best >= 0 && exportPay > econPay * 1.1 && target < room) { target = Math.min(room, target + step); why = econPay > 0 ? RES[best] + " pays " + f(exportPay / econPay, 1) + "× the economy" : RES[best] + " pays while the economy stands idle"; }
    else if (best < 0 || exportPay < econPay * 0.9) { if (target > 0) why = best < 0 ? "no neighbour is asking" : "the economy pays better"; target = Math.max(0, target - step); }
    if (why) add(iso, "exportShift", "export reserve", target - (s.exportWorkers || 0), "M", why);
    s.exportWorkers = target;
    // use a day, per resource: what the economy tried to use today
    const prodUse = window.PRODUCTS ? window.PRODUCTS.upkeepOf(s) : [0, 0, 0];
    const useR = [N.food + prodUse[0], N.upkE + N.techE + Le.get("economy.captureEnergy") + prodUse[1], N.upkM + prodUse[2]];
    need[iso] = useR;
    const a = [0, 0, 0], o = [0, 0, 0];
    a[0] = Le.get("economy.famine") * N.food;
    a[1] = Math.max(0, N.upkE + N.techE - Le.get("economy.upkeep.energy"));
    a[2] = Math.max(0, N.upkM - Le.get("economy.upkeep.materials"));
    if (s._prodAsk) for (let r = 0; r < 3; r++) a[r] += s._prodAsk[r];   // what the army and the hospitals went without (js/products.js)
    for (let r = 0; r < 3; r++) {
      // a nation that is unpaid and cannot pay its bill sells its stores down to a few days of whatever it is not short of
      const shortOf = a[r] > 0;
      const comfort = (broke && !shortOf ? K.crisisDays : c.comfortDays / Math.pow(Math.max(P[r], 0.01), K.comfortPriceExp)) * useR[r];
      const gap = comfort - (s.stores[r] - exported[r]);
      if (gap > 0) a[r] += gap / c.restockDays;                 // rebuild the store gently
      else o[r] = -gap * (broke && !shortOf ? K.crisisSellShare : K.storeSellShare);   // sell a share of what sits above the comfort; faster in a crisis
      o[r] += exported[r];                                        // and everything captured for export today
      if (broke && !shortOf && o[r] > exported[r] + 1e-9) add(iso, "sellDown." + RES[r], RES[r] + " sold down from store", o[r] - exported[r], "units", "unpaid and broke");
      if (!(s.ceil[r] > 0) && a[r] === 0 && useR[r] > 0 && s.stores[r] < comfort) a[r] += useR[r] * 0.1;   // no reserve at all: always buying a little
    }
    // an ask is only what the nation can pay for, so a nation without money does not block a seller's offer for others
    let bill = 0; for (let r = 0; r < 3; r++) bill += a[r] * P[r];
    if (bill > Math.max(s.treasury, 0)) { const k = Math.max(s.treasury, 0) / bill; for (let r = 0; r < 3; r++) a[r] *= k; }
    ask[iso] = a; offer[iso] = o; cap[iso] = c.tradePerUnit * s.econ;
    bought[iso] = [0, 0, 0]; sold[iso] = [0, 0, 0]; paid[iso] = [0, 0, 0]; earned[iso] = [0, 0, 0];
  }
  const totalAsk = [0, 0, 0], totalOffer = [0, 0, 0], ask0 = Object.create(null);
  for (const iso of isos) { ask0[iso] = ask[iso].slice(); for (let r = 0; r < 3; r++) { totalAsk[r] += ask[iso][r]; totalOffer[r] += offer[iso][r]; } }
  // a transfer of goods between two linked nations, within every limit
  function edgeBetween(a, b) {                                  // the edge between two nations with the most room left today
    let best = -1, room = 0;
    for (const i of L.edgesBetween(a, b)) { const left = L.edges[i].cap - used[i]; if (left > room) { room = left; best = i; } }
    return best;
  }
  function transfer(seller, buyer, r, want, price) {
    const i = edgeBetween(seller, buyer); if (i < 0) return 0;
    const sb = S[buyer], ss = S[seller];
    let q = Math.min(want, offer[seller][r], L.edges[i].cap - used[i], cap[buyer], cap[seller], price > 0 ? Math.max(0, sb.treasury) / price : want);
    if (!(q > 1e-9)) return 0;
    used[i] += q; cap[buyer] -= q; cap[seller] -= q; offer[seller][r] -= q;
    ss.stores[r] -= q; sb.stores[r] += q;
    const money = q * price;
    sb.treasury -= money; ss.treasury += money;
    bought[buyer][r] += q; sold[seller][r] += q; paid[buyer][r] += money; earned[seller][r] += money;
    return q;
  }
  // 2. deals first: a seller's offer goes to its deal partners at the price they signed, its allies' deals before
  //    the rest and its oldest deals before its newer ones, so a short seller keeps its longest customers
  const sellsTo = Object.create(null);                            // seller -> [{ buyer, deal }] for the card
  // the relations pillar (js/relations.js, runs after trade) leaves on each state whom it refuses and whom it calls a friend
  const R = window.RELATIONS, refuses = (a, b) => !!(S[a]._refuses && S[a]._refuses.has(b)), friendly = (a, b) => !!(S[a]._friendly && S[a]._friendly.has(b)), ally = (a, b) => R ? R.isAlly(a, b) : false;
  const live = [];                                                // { iso, d }: the deals to deliver today
  for (const iso of isos) {
    const s = S[iso]; if (!s.deals || !s.deals.length) continue;
    const keep = [];
    for (const d of s.deals) {
      const r = d.r;
      if (!S[d.from] || !isos.includes(d.from)) continue;
      if (day >= d.until) { W.log({ sev: "small", kind: "trade", iso, iso2: d.from, text: W.nameOf(iso) + ": the " + RES[r] + " deal with " + W.nameOf(d.from) + " runs out" }); continue; }
      if (refuses(d.from, iso)) {                                 // enmity: the seller will not deliver
        d.short++; d.deliveredToday = 0; (s._refusedBy || (s._refusedBy = [])).push(d.from);
        if (d.short >= c.dealLapseDays) { (s._lapsed || (s._lapsed = [])).push({ from: d.from, r }); continue; }
        keep.push(d); continue;
      }
      d.deliveredToday = 0; keep.push(d); live.push({ iso, d });
    }
    s.deals = keep;
  }
  for (const allies of [true, false]) {
    const batch = live.filter(x => ally(x.iso, x.d.from) === allies).sort((x, y) => x.d.until - y.d.until);   // oldest first (a fixed term)
    for (const x of batch) {
      const { iso, d } = x, r = d.r, s = S[iso];
      const got = transfer(d.from, iso, r, d.q, d.price);
      d.deliveredToday = d.q > 0 ? got / d.q : 1;
      if (got < d.q * 0.9) d.short++; else d.short = 0;
      add(iso, "deal.in." + RES[r], RES[r] + " under deal", got, "units", "from " + W.nameOf(d.from) + (got < d.q * 0.9 ? ", the seller short" : ""));
      add(d.from, "deal.out." + RES[r], RES[r] + " delivered on deal", got, "units", "to " + W.nameOf(iso));
      if (d.short >= c.dealLapseDays) { d.lapse = true; (s._lapsed || (s._lapsed = [])).push({ from: d.from, r }); W.log({ sev: "small", kind: "trade", iso, iso2: d.from, text: W.nameOf(iso) + ": the " + RES[r] + " deal with " + W.nameOf(d.from) + " lapses, undelivered for a month" }); continue; }
      (sellsTo[d.from] || (sellsTo[d.from] = [])).push({ buyer: iso, deal: d });
    }
  }
  for (const iso of isos) {
    const s = S[iso]; if (s.deals && s.deals.length) s.deals = s.deals.filter(d => !d.lapse);
    ask[iso] = ask[iso].map((v, r) => Math.max(0, v - bought[iso][r]));
  }
  // 3. the spot market: seller by seller, pro rata by ask among its linked buyers
  for (let r = 0; r < 3; r++) {
    const price = P[r];
    for (const seller of isos) {
      if (!(offer[seller][r] > 1e-9)) continue;
      const partners = L.partners(seller).filter(b => S[b] && ask[b] && ask[b][r] > 1e-9);
      const hostile = S[seller]._refuses, served = hostile && hostile.size ? partners.filter(b => !hostile.has(b)) : partners;   // enmity: no sale
      if (served.length < partners.length) for (const b of partners) if (hostile.has(b)) (S[b]._refusedBy || (S[b]._refusedBy = [])).push(seller);
      if (!served.length) continue;
      const sumAsk = served.reduce((t, b) => t + ask[b][r], 0), share = offer[seller][r];
      for (const b of served) {
        const want = Math.min(ask[b][r], share * ask[b][r] / sumAsk);
        const got = transfer(seller, b, r, want, price);
        if (got > 0) {
          ask[b][r] -= got;
          const bk = key(seller, r), by = S[b].buying;
          const rec = by[bk] || [0, 0]; rec[0] += 1; rec[1] += got; by[bk] = rec;
          S[b]._boughtFrom = S[b]._boughtFrom || Object.create(null); S[b]._boughtFrom[bk] = true;
        }
      }
    }
  }
  // 4. deals form: a month of buying from the same seller, averaged, at today's price
  for (const iso of isos) {
    const s = S[iso], by = s.buying, bf = s._boughtFrom || {};
    for (const bk in by) {
      if (!bf[bk]) { delete by[bk]; continue; }                   // the run of days is broken
      const [days, sum] = by[bk], [seller, rs] = bk.split("|"), r = +rs;
      const least = Math.max(c.dealMinUnits, K.dealMinShare * (need[iso] ? need[iso][r] : 0));   // a deal is for a real share of what the nation uses
      const after = c.dealAfterDays * (friendly(iso, seller) ? 0.5 : 1);   // friends sign sooner
      if (days >= after && sum / days >= least && !s.deals.some(d => d.from === seller && d.r === r)) {
        const q = sum / days;
        s.deals.push({ from: seller, r, q, price: P[r], until: day + c.dealTerm, short: 0 });
        delete by[bk];
        W.log({ sev: s.pop >= 50 ? "large" : "small", kind: "trade", iso, iso2: seller,
                text: W.nameOf(iso) + " signs for " + f(q) + " " + RES[r] + " a day from " + W.nameOf(seller) + " at " + f(P[r], 2) });
      }
    }
    s._boughtFrom = null;
  }
  // 5. the price: asks over offers, bounded
  for (let r = 0; r < 3; r++) {
    const tot = totalAsk[r] + totalOffer[r];
    if (tot > 0) P[r] *= 1 + c.priceElasticity * (totalAsk[r] - totalOffer[r]) / tot;
    P[r] = Math.max(c.priceFloor, Math.min(c.priceCeiling, P[r]));
    LW.add("trade", "trade.price." + RES[r], "price of " + RES[r], P[r], "money");
    LW.add("trade", "trade.ask." + RES[r], RES[r] + " asked", totalAsk[r], "units"); LW.add("trade", "trade.offer." + RES[r], RES[r] + " offered", totalOffer[r], "units");
    const h = W.history("", "trade.price." + RES[r], K.spikeDays);
    if (h.length >= K.spikeDays) {
      const spiked = P[r] >= h[0] * K.spikeRatio, flag = "_spiked" + r;
      if (spiked && !W.WORLD_STATE[flag]) W.log({ sev: "massive", kind: "trade", iso: null, text: "The price of " + RES[r] + " has doubled in a month, to " + f(P[r], 2) });
      W.WORLD_STATE[flag] = spiked;
    }
  }
  // 6. the ledgers, the readouts and the wire for every nation; and what each nation's neighbours asked for today, for tomorrow's exporters
  let traded = 0, deals = 0;
  for (const iso of isos) {
    const d = [0, 0, 0];
    for (const p of L.partners(iso)) if (ask0[p]) for (let r = 0; r < 3; r++) d[r] += ask0[p][r];
    S[iso]._demand = d;
  }
  for (const iso of isos) {
    const s = S[iso], n = need[iso];
    let impNeed = 0, impGot = 0;
    for (let r = 0; r < 3; r++) {
      if (bought[iso][r] > 0) { add(iso, "bought." + RES[r], RES[r] + " bought", bought[iso][r], "units"); add(iso, "paid", "paid for imports", paid[iso][r], "money"); }
      if (sold[iso][r] > 0) { add(iso, "sold." + RES[r], RES[r] + " sold", sold[iso][r], "units"); add(iso, "earned", "earned on exports", earned[iso][r], "money"); }
      if (ask[iso][r] > 1e-9) add(iso, "unmet." + RES[r], RES[r] + " asked and not found", ask[iso][r], "units");
      traded += bought[iso][r]; impNeed += n[r]; impGot += bought[iso][r];
    }
    s._importShare = impNeed > 0 ? impGot / impNeed : 0;
    s._bought = bought[iso]; s._sold = sold[iso]; s._sellsTo = sellsTo[iso] || [];
    deals += s.deals.length;
    const heavy = s._importShare >= K.importHeavy;
    if (heavy && !s._wasHeavy) W.log({ sev: "small", kind: "trade", iso, text: W.nameOf(iso) + " now lives on imports: " + Math.round(s._importShare * 100) + "% of what it uses" });
    s._wasHeavy = heavy;
  }
  LW.add("trade", "trade.traded", "units traded", traded, "units"); LW.add("trade", "trade.deals", "deals in force", deals, "");
  // 7. people: the leavers go along the links to room, or stay
  const roomOf = Object.create(null);
  for (const iso of isos) {
    const s = S[iso], Le = ledger(iso), slots = E.slotsOf(s);
    const free = slots.I + slots.E + slots.A - Le.get("economy.workInfra") - Le.get("economy.workEcon") - Le.get("economy.workAcad") - (s._exportWorkers || 0);
    roomOf[iso] = Math.max(0, Math.min(free, Le.get("economy.housing") - s.pop));
  }
  let moved = 0;
  for (const iso of isos) {
    const s = S[iso], leaving = ledger(iso).get("economy.left"); if (!(leaving > 1e-9)) continue;
    const edges = L.edgesOf(iso).map(e => ({ e, to: e.a === iso ? e.b : e.a })).filter(x => roomOf[x.to] > 0);
    const sumRoom = edges.reduce((t, x) => t + roomOf[x.to], 0);
    let placed = 0;
    for (const x of edges) {
      const q = Math.min(leaving * roomOf[x.to] / sumRoom, c.migPerCap * x.e.cap, roomOf[x.to]);
      if (!(q > 1e-9)) continue;
      S[x.to].pop += q; roomOf[x.to] -= q; placed += q;
      (S[x.to]._arrivedFrom || (S[x.to]._arrivedFrom = {}))[iso] = (S[x.to]._arrivedFrom[iso] || 0) + q;
      add(x.to, "arrived", "arrived", q, "M", "from " + W.nameOf(iso));
    }
    const stayed = leaving - placed;
    if (stayed > 1e-9) { s.pop += stayed; add(iso, "stayed", "found nowhere to go", stayed, "M"); }
    if (placed > 1e-9) add(iso, "emigrated", "emigrated", placed, "M");
    moved += placed;
  }
  LW.add("trade", "trade.migrants", "people who moved", moved, "M");
}

/* ── The card ── */
function rows(iso, L) {
  const s = W.COUNTRY_STATE[iso]; if (!s || !s.deals) return [];
  const P = W.WORLD_STATE.prices || [1, 1, 1], out = [], g = k => L.get("trade." + k);
  out.push(["prices", RES.map((r, k) => r + " " + f(P[k], 2)).join(" · "), "world, today"]);
  RES.forEach((r, k) => {
    const b = g("bought." + r), sd = g("sold." + r), un = g("unmet." + r), ex = g("export." + r);
    if (b || sd || un || ex) out.push([r, (b ? "bought " + f(b) : "") + (b && sd ? " · " : "") + (sd ? "sold " + f(sd) : "") + (ex ? " · " + f(ex) + " for export" : ""), un ? f(un) + " asked and not found" : ""]);
  });
  if (g("paid") || g("earned")) out.push(["money", "paid " + f(g("paid"), 0) + " · earned " + f(g("earned"), 0)]);
  if (s._importShare != null) out.push(["imports", Math.round(s._importShare * 100) + "% of what it uses", s._exportWorkers ? f(s._exportWorkers) + " M capturing for export" : ""]);
  const shift = L.of("trade").find(l => l.key === "trade.exportShift");
  if (shift) out.push(["export", (shift.value >= 0 ? "+" : "") + f(shift.value, 2) + " M workers", shift.reason]);
  for (const d of s.deals) out.push(["deal", f(d.q) + " " + RES[d.r] + " a day from " + W.nameOf(d.from) + " at " + f(d.price, 2), (d.until - W.day) + " days left" + (d.short ? " · short " + d.short + " days" : "")]);
  for (const x of (s._sellsTo || [])) out.push(["deal", f(x.deal.q) + " " + RES[x.deal.r] + " a day to " + W.nameOf(x.buyer) + " at " + f(x.deal.price, 2), (x.deal.until - W.day) + " days left"]);
  if (g("arrived") || g("emigrated") || g("stayed")) out.push(["people", (g("arrived") ? "+" + f(g("arrived"), 3) + " M arrived" : "") + (g("emigrated") ? " · " + f(g("emigrated"), 3) + " M left" : "") + (g("stayed") ? " · " + f(g("stayed"), 3) + " M found nowhere to go" : "")]);
  return out;
}

/* ── The layer: importers warm, exporters cool ── */
const netShare = s => { if (!s || !s._bought) return 0; const b = s._bought.reduce((t, v) => t + v, 0), x = s._sold.reduce((t, v) => t + v, 0); const u = (s._importShare != null && s._importShare > 0) ? b / s._importShare : 0; return u > 0 ? Math.max(-1, Math.min(1, (b - x) / u)) : (x > 0 ? -1 : 0); };
const layers = [
  { key: "trade", label: "Trade", lo: "#2f6a5a", hi: "#ff7a50", legend: ["exports", "imports"],
    value: st => 0.5 + 0.5 * netShare(st),
    show: st => { const n = netShare(st); return n > 0.01 ? "imports " + Math.round((st._importShare || 0) * 100) + "% of use" : n < -0.01 ? "exports " + f(st._sold ? st._sold.reduce((t, v) => t + v, 0) : 0) + " a day" : "self-sufficient"; } },
];

/* ── The census ── */
function census(iso, s) {
  return { imports: Math.round(100 * (s._importShare || 0)), exports: Math.round((s._sold ? s._sold.reduce((t, v) => t + v, 0) : 0) * 10) / 10,
           deals: s.deals ? s.deals.length : 0, importsHalf: (s._importShare || 0) >= K.importHeavy };
}
function censusWorld(LW) {
  const P = W.WORLD_STATE.prices || [1, 1, 1];
  return { priceFood: Math.round(P[0] * 100) / 100, priceEnergy: Math.round(P[1] * 100) / 100, priceMat: Math.round(P[2] * 100) / 100,
           traded: Math.round(LW.get("trade.traded")), deals: LW.get("trade.deals"), migrants: Math.round(LW.get("trade.migrants") * 1000) / 1000 };
}

window.TRADE = W.registerPillar({
  name: "trade", label: "Trade", fields: FIELDS, worldFields: WORLD_FIELDS, dailyWorld, rows, census, censusWorld, layers,
  config: { group: "Trade", defaults: LEVERS, rows: ROWS },
  K, LEVERS,
});
})();
