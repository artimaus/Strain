/* ═══════════════════════════════════════════════════════════════
   Entity — economy: production, consumption, money, growth, people
   The daily economic pass for every country, run by world.js's dayTick
   before drift.  Each country has a fixed potential per resource type
   (units a day it could reach); what it actually produces is that
   potential times its access (infrastructure, technology, the share of
   its starting workforce still there), with the weather on food and
   water and desalination adding water for energy.  Population eats
   and drinks; output and the army burn energy and materials.  What is
   left fills the stockpile (sized by infrastructure) and the rest is
   sold on the exchange; what is missing is drawn from the stockpile
   and then bought on the exchange, the worst shortage first, every type
   a day, within the country's money and credit.

   The exchange is a bounded world stock per type with a price that
   moves by the day's imbalance: sells add to the stock, buys draw it,
   and when it runs dry buys are filled pro rata from the day's sells.
   Nothing is ever created.  Money is absolute: taxes on output,
   sales, upkeep for infrastructure, the army and hospitals (which
   decay when it is not paid), interest on a negative treasury up to a
   credit limit, and investment projects paid and paying out over a
   month.  The economy is output per head, a stock that grows toward a
   cap set by infrastructure and technology at a rate scaled by the
   worst resource balance, and contracts when the balance is bad.
   Population grows under food, water and hospitals up to what the
   land carries, and dies of famine and crowding, never faster than a
   floor.  Growth and decline past a threshold make a headline.

   Reads ENTITY_CONFIG and WORLD only inside functions that run after
   load.  Everything it stores on a country is saved through world.js's
   pack table; the market is a world field.
   ═══════════════════════════════════════════════════════════════ */
(() => {
"use strict";
const cfg = () => window.ENTITY_CONFIG;
const W = () => window.WORLD;
const pm = (s, row) => { const G = window.GOV; return G && G.powerMul ? G.powerMul(s, row) : 1; };   // a government's programme, where it bears on a row
const { RES_KEYS, clamp, weatherAnomaly, unit, techEnergyOf } = window.COUNTRIES;
const K = RES_KEYS.length, MAT = 1, FOOD = 2, WATER = 3;
const zeros = () => [0, 0, 0, 0];
const UPKEEP = [["infra", "upkeepInfra", "decayInfra"], ["military", "upkeepMil", "decayMil"], ["medical", "upkeepMed", "decayMed"]];
/* What a day of a stat's upkeep costs: the level over the people, and a modern army dearer per soldier by its technology. */
function upkeepCost(s, stat) {
  const c = cfg(), row = UPKEEP.find(u => u[0] === stat);
  if (!row || !s || !s.st) return 0;
  const under = Math.max(0, s.pop) + (stat === "military" ? (s.levy || 0) : 0);   // an army is paid for the levies too, which force() counts
  return c[row[1]] * s.st[stat] * under * (stat === "military" ? 1 + c.upkeepTech * s.st.technology / 100 : 1);
}

/* ── The exchange ───────────────────────────────────────────────── */
function market() {
  const WS = W().WORLD_STATE;
  if (!WS.market || !Array.isArray(WS.market.price)) WS.market = { stock: zeros(), price: [1, 1, 1, 1], vol: zeros(), buys: zeros(), sells: zeros(), center: [null, null, null, null] };
  if (!WS.market.center) WS.market.center = [null, null, null, null];
  if (!WS.market.rest) WS.market.rest = [1, 1, 1, 1];
  if (!WS.market.need) WS.market.need = zeros();                        // the world's daily use per type, for the cartel rule
  return WS.market;
}

/* ── Assessment, pure: what a country would produce and need today ── */
function nativeProduction(iso) {
  const W_ = W(), s = W_.COUNTRY_STATE[iso], c = cfg();
  if (!s || !s.st || !s.potential) return null;
  const day = W_.day, pop = Math.max(0, s.pop);
  const access = clamp(c.accessBase + c.accessInfra * s.st.infra / 100 + c.accessTech * s.st.technology / 100, 0, 1)
               * Math.min(1, pop / Math.max(0.001, s.pop0 || pop));
  const wx = weatherAnomaly(iso, W_.seed, day);
  const dry = day < (s.dryUntil || 0), wet = day < (s.wetUntil || 0), smoke = day < (s.smokeUntil || 0);
  const foodF  = (1 + c.foodWeather * wx) * (dry ? 1 - c.droughtFood * pm(s, "droughtFood") : 1) * (wet ? 1 - c.floodFood : 1) * (smoke ? 1 - c.smokeFood : 1) * pm(s, "resFood");
  const waterF = (1 + c.waterWeather * wx) * (dry ? 0.5 : 1) * pm(s, "resWater");
  const waterNat = s.potential[3] * access * waterF, waterNeed = pop * c.needWater;
  const desal  = Math.min(c.desalRate * pop * (s.st.infra / 100) * (s.st.technology / 100), Math.max(0, waterNeed - waterNat));   // fills the gap only
  const energyF = 1 + c.energyTechProd * s.st.technology / 100;          // technology gets more out of the same fields
  const matF = 1 + c.matTechProd * s.st.technology / 100;                // and more out of the same seams
  return { production: [s.potential[0] * access * energyF, s.potential[1] * access * matF, s.potential[2] * access * foodF, waterNat + desal],
           access, desal, weather: wx, dry, wet, smoke };
}
function assess(iso) {
  const W_ = W(), S = W_.COUNTRY_STATE, s = S[iso], c = cfg();
  const nat = nativeProduction(iso); if (!nat) return null;
  const production = nat.production.slice();
  if (s.occupiedBy) for (let k = 0; k < K; k++) production[k] *= 1 - c.occupyRes;      // the occupier's share leaves
  const taken = [];
  for (const o in S) {
    const os = S[o];
    if (os.occupiedBy !== iso || !os.potential) continue;
    const on = nativeProduction(o); if (!on) continue;
    taken.push([o, on.production.map(v => v * c.occupyRes)]);
    for (let k = 0; k < K; k++) production[k] += c.occupyRes * on.production[k];
  }
  const pop = Math.max(0, s.pop), output = s.output, force = W_.force(iso);
  const eff = 1 - c.energyTechEff * s.st.technology / 100;               // and needs less of it per unit of output
  const matEff = 1 - c.matTechEff * s.st.technology / 100;               // lighter, recycled, substituted
  const techEnergy = techEnergyOf(s.st.technology, pop, c);                    // the laboratories, the networks, the machines
  const ration = Math.min(c.rationMax, Math.max(0, s.ration || 0));            // a regime's cut in shortage (people())
  const consumption = [(output * pop * c.needEnergyOut * pm(s, "needEnergyOut") + force * c.needEnergyMil) * eff + nat.desal * c.desalEnergy + techEnergy,
                       output * pop * c.needMatOut * pm(s, "needMatOut") * matEff + force * c.needMatMil,
                       pop * c.needFood * (1 - ration), pop * c.needWater * (1 - ration)];
  // the stores hold days of what the land yields (and the deals bring), not of what the people eat: a granary that does
  // not grow with the mouths is what lets a population outrun it
  const sd = c.stockDays * pm(s, "stockDays"), days = [sd, sd, c.vitalStockDays, c.vitalStockDays], inn = s.dealIn;   // a strategic reserve holds more
  const stockCap = production.map((v, k) => (v + (inn ? inn[k] : 0)) * days[k] * (0.5 + s.st.infra / 100));
  const stock = s.stock || zeros();
  const balance = consumption.map((need, k) => need > 0 ? Math.min(1, (production[k] + stock[k]) / need) : 1);
  return { production, native: nat.production, consumption, stockCap, balance, access: nat.access, desal: nat.desal, techEnergy,
           weather: nat.weather, dry: nat.dry, wet: nat.wet, taken, occupiedShare: s.occupiedBy ? c.occupyRes : 0 };
}

/* ── The exchange as seen from one country ──────────────────────
   Two frictions stand between a country and the world price.  Transport:
   the further it is from where the day's sellers actually are, the
   dearer a cargo lands, which is what makes a neighbour's deal worth
   signing.  Sanctions: whoever sanctions it closes off their share of
   world trade, so it can buy and sell only a fraction of what it
   wants. */
let gdpDay = -1, gdpMemo = null;
function gdpShares() {
  const W_ = W();
  if (gdpMemo && gdpDay === W_.day) return gdpMemo;
  const S = W_.COUNTRY_STATE, out = Object.create(null);
  let total = 0;
  for (const iso in S) {
    const s = S[iso]; if (!s.st) continue;
    const g = (s.output) * Math.max(0, s.pop);
    out[iso] = g; total += g;
  }
  if (total > 0) for (const iso in out) out[iso] /= total;
  gdpDay = W_.day; gdpMemo = out;
  return out;
}
function marketAccess(iso) {
  const W_ = W(), c = cfg(), k = W_.pairCounts()[iso];
  if (!k || !k.by.length) return 1;
  const sh = gdpShares();
  let weight = 0;
  for (const x of k.by) weight += sh[x] || 0;
  return clamp(1 - Math.min(c.sanctionMax, c.sanctionBite * weight), 0, 1);
}
function frictionFor(iso, k) {
  const c = cfg(), ctr = market().center[k];
  if (!ctr) return 0;
  return Math.min(c.marketFrictionMax, c.marketDistance * W().distKm(iso, ctr) / 10000);
}
/* What a unit fetches sold on the exchange and costs bought there: the
   market takes its spread from both sides, and the distance to where the
   trade actually is costs the same either way.  The gap between the two
   is what a deal with a neighbour is worth. */
const sellPrice = (iso, k) => market().price[k] * Math.max(0, 1 - cfg().marketSpread - frictionFor(iso, k));
const buyPrice  = (iso, k) => market().price[k] * (1 + cfg().marketSpread + frictionFor(iso, k));

/* ── Deals: the day's swaps, settled before anything is sold ─────
   Each side delivers out of genuine surplus (what it produces and holds
   beyond its own use); a side that cannot deliver falls short, and
   world.js ends the deal if that goes on.  Money and technology terms
   are paid here too.  Nothing is created: what one side loses the other
   gains. */
function settleDeals(A, c, day, W_) {
  const S = W_.COUNTRY_STATE, flows = Object.create(null), floors = Object.create(null);
  for (const iso in A) { const s = S[iso]; if (s.dealIn) { s.dealIn = null; s.dealOut = null; s.dealMoney = 0; } }
  const at = iso => flows[iso] || (flows[iso] = { in: zeros(), out: zeros(), money: 0, tech: 0 });
  const spare = (iso, k) => {
    const a = A[iso], s = S[iso], f = flows[iso];
    if (!a) return 0;
    return Math.max(0, a.production[k] + s.stock[k] - a.consumption[k] - (f ? f.out[k] : 0));
  };
  for (const key in W_.PAIRS) {
    const p = W_.PAIRS[key];
    if (!p.deals || !p.deals.length) continue;
    const i = key.indexOf("|"), a = key.slice(0, i), b = key.slice(i + 1);
    if (!A[a] || !A[b]) continue;
    const SA = S[a], SB = S[b];
    for (const d of p.deals) {
      let ok = true;
      if (d.fk != null && d.fk >= 0) {                     // a price floor: both hold it, unless one broke ranks yesterday
        (floors[a] || (floors[a] = zeros()))[d.fk] = Math.max(floors[a][d.fk], d.fp || 0);
        (floors[b] || (floors[b] = zeros()))[d.fk] = Math.max(floors[b][d.fk], d.fp || 0);
        if (((SA.floorBroken | 0) | (SB.floorBroken | 0)) & (1 << d.fk)) ok = false;
        d.short = ok ? 0 : (d.short | 0) + 1;
        continue;
      }
      if (d.g >= 0 && d.gq > 0) {                      // A gives a resource
        const got = Math.min(d.gq, spare(a, d.g));
        if (got < d.gq * c.dealShortAt) ok = false;
        if (got > 0) { at(a).out[d.g] += got; at(b).in[d.g] += got; }
      }
      if (d.t >= 0 && d.tq > 0) {                      // B gives a resource
        const got = Math.min(d.tq, spare(b, d.t));
        if (got < d.tq * c.dealShortAt) ok = false;
        if (got > 0) { at(b).out[d.t] += got; at(a).in[d.t] += got; }
      }
      if (d.mq) {                                      // money: positive means A pays B
        const payer = d.mq > 0 ? SA : SB, payee = d.mq > 0 ? SB : SA, amt = Math.abs(d.mq);
        if (canSpend(payer, amt)) {
          payer.treasury -= amt; payee.treasury += amt;   // money over the cap bleeds away in daily(), it is not refused
          at(d.mq > 0 ? a : b).money -= amt; at(d.mq > 0 ? b : a).money += amt;
        } else ok = false;
      }
      if (ok && d.tech > 0) at(b).tech += W_.shareTech(a, b, d.tech, c.techShareCap);   // a partner in default hands over no know-how either
      d.short = ok ? 0 : (d.short | 0) + 1;
    }
  }
  for (const iso in flows) { const s = S[iso]; s.dealIn = flows[iso].in; s.dealOut = flows[iso].out; s.dealMoney = flows[iso].money; }
  return { flows, floors };
}
/* ── What a seller will take ─────────────────────────────────────────
   Nobody dumps a surplus at any price: a seller holds out below its
   reservation, storing what it can and losing the rest.  The reservation
   is a low floor on the base price, lower still when the country is
   short of cash (it sells at anything) or when the surplus would only be
   wasted (the stores are full), and higher when a price-floor deal binds
   it -- unless it is short of cash, in which case it breaks ranks and
   the deal notices. */
function reservationFor(s, iso, k, a, surplus, floors, pr) {
  const c = cfg();
  const comfortable = Math.min(pr ? pr.reserve * taxIncome(s) : 0, capOf(s) * c.reserveCapShare);   // a big economy is not "desperate" for being capped
  const cashF = clamp(comfortable > 0 ? s.treasury / comfortable : 1, c.reserveCashMin, 1);
  const room = Math.max(0, a.stockCap[k] - s.stock[k]), waste = Math.max(0, surplus - room);
  const wasteF = surplus > 0 ? 1 - c.reserveWaste * waste / surplus : 1;
  let r = c.reserveMin * c.priceBase * cashF * wasteF;
  const fl = floors[iso] ? floors[iso][k] : 0;
  if (fl > 0) {
    if (cashF >= 1) r = Math.max(r, fl);
    else s.floorBroken = (s.floorBroken | 0) | (1 << k);
  }
  return r;
}

/* ── Money helpers ─────────────────────────────────────────────── */
const taxIncome = s => (s.output) * Math.max(0, s.pop) * cfg().taxRate * (s.taxMul || 1);   // taxMul: the programme's multiplier, memoed once a day
/* What a country may borrow.  Lenders look at a track record rather than today's takings: `incomeRef` is a slow
   average of tax income, so a country whose economy is falling keeps its limit for a while instead of having it cut
   from under it at the moment it most needs the room.  Confidence still moves it. */
const credit = s => { const c = cfg(); const ref = s.incomeRef > 0 ? s.incomeRef : taxIncome(s); return c.creditDays * ref * (1 - c.creditBoom + c.creditBoom * (s.boom || 0)); };
const capOf = s => cfg().treasuryCapDays * taxIncome(s);       // a treasury holds so many days of income, whoever's it is
const canSpend = (s, amount) => s.treasury - amount >= -credit(s);
/* A blow to the economy: a fraction of output, gone.  The quarterly
   report's baseline is left alone, so a big enough blow reads as the
   recession it is. */
function hitOutput(s, frac) {
  if (!s || !(frac > 0)) return 0;
  const before = s.output;
  s.output = Math.max(1, before * (1 - Math.min(0.9, frac)));
  return before - s.output;
}
/* An investment as a project: paid and paying out over projectDays. */
function projectFor(s, stat, premium) {
  const c = cfg(), level = s.st[stat];
  const gain = c.investStep * (c.projectGainTop - level / 100) * (0.7 + 0.3 * (s.st.infra + s.st.technology) / 200);
  const rebuild = stat === "infra" && W().day < (s.rebuildUntil || 0) ? c.rebuildDiscount : 1;   // after a disaster or a lost war, rebuilding is cheap
  const arms = stat === "military" ? c.milCostFactor * pm(s, "milProject") : 1;                 // an army is cheaper to raise than a road, and so cheaper to wear out: the war bill prices attrition from this
  const cost = c.investDays * taxIncome(s) * (0.5 + level / 100) * (premium || 1) * rebuild * arms;   // days of income, dearer at a high level
  return { stat, days: c.projectDays, total: c.projectDays, gain: gain / c.projectDays, cost: cost / c.projectDays, since: W().day };
}
function incomeLine(s, iso) {
  const m = s.money || {};
  const line = { tax: m.tax || 0, sales: m.sales || 0, bought: -(m.bought || 0), upkeep: -(m.upkeep || 0), interest: -(m.interest || 0),
                 projects: -(m.projects || 0), war: -(m.war || 0), skim: m.skim || 0 };
  line.net = line.tax + line.sales + line.bought + line.upkeep + line.interest + line.projects + line.war + line.skim;
  return line;
}

/* ── The daily pass ─────────────────────────────────────────────── */
function daily() {
  const W_ = W(), S = W_.COUNTRY_STATE, c = cfg(), M = market(), day = W_.day;
  const orders = [];
  const buys = zeros(), sells = zeros();
  const sx = zeros(), sy = zeros();                     // where the day's sellers are, weighted by what they sell
  // 0. what everyone could produce and needs, then the day's deals: what is given leaves the giver
  const A = Object.create(null);
  for (const iso in S) {
    const s = S[iso];
    if (!s.st || !s.potential) continue;
    const a = assess(iso); if (!a) continue;
    if (!s.stock) s.stock = zeros();
    A[iso] = a;
  }
  const { flows, floors } = settleDeals(A, c, day, W_);
  // 1. produce, consume, stock; note what is for sale and what is short
  for (const iso in A) {
    const s = S[iso], a = A[iso], f = flows[iso];
    const access = marketAccess(iso), pos = W_.posOf(iso);
    const bal = zeros(), short = zeros(), surplus = zeros(), stock0 = s.stock.slice();
    for (let k = 0; k < K; k++) {
      const avail = a.production[k] + (f ? f.in[k] - f.out[k] : 0) + s.stock[k], need = a.consumption[k];
      if (avail >= need) {
        const left = avail - need;                          // what is left after the day's use, stores included
        if (left < s.stock[k]) s.stock[k] = left;           // production fell short: the stores were drawn down
        else {                                              // a surplus: into the stores a little at a time, the rest to market
          const intake = Math.max(0, Math.min(left - s.stock[k], a.stockCap[k] - s.stock[k], c.stockFill * need));
          s.stock[k] = Math.min(a.stockCap[k], s.stock[k] + intake);
        }
        surplus[k] = Math.max(0, left - s.stock[k]);
        bal[k] = 1;
      } else {
        s.stock[k] = 0; short[k] = need - avail; bal[k] = need > 0 ? avail / need : 1;
      }
    }
    s.production = a.production; s.consumption = a.consumption; s.stockCap = a.stockCap;
    s.balance = bal; s.shortage = short; s.surplus = surplus; s.access = a.access; s.marketAccess = access;
    if (access < 1) for (let k = 0; k < K; k++) surplus[k] *= access;      // sanctioned: only a fraction reaches the market
    // the market: sell every surplus; buy every shortage, the worst first, within means, at whatever the landed price is
    // -- a country with money in the bank does not go short -- and buy ahead into the stores only while the price is fair
    const pr = window.DECIDE && window.DECIDE.prioritiesOf ? window.DECIDE.prioritiesOf(iso) : null;
    // over the credit limit is not the end of eating: a country past its borrowing can no longer draw on a stock, but it
    // still collects taxes, and it puts part of the day's takings on bread, water and the lights rather than starving of
    // arithmetic.  A rich country covers its needs that way and a poor one covers part of them, which is a slope where
    // there used to be a cliff.  It buys no materials while it is dry, and it has no savings left to hold back.
    const dry = !!s.broke;
    const reserve = dry || !pr ? 0 : pr.reserve * taxIncome(s);
    let room = !(access > 0) ? 0 : dry ? c.brokeVitalShare * taxIncome(s) : Math.max(0, s.treasury + credit(s));
    const wants = [], byNeed = [];                                               // { k, qty, landed }, worst shortage first
    // energy for the machines and the army is nearly as pressing as bread and may reach into the reserve for it; energy
    // for the laboratories is the last thing a country buys, out of whatever is left, because a dark laboratory costs
    // technology while a dark factory costs the economy
    const labNeed = Math.min(short[0], a.techEnergy || 0);
    short[0] = Math.max(0, short[0] - labNeed);
    for (let k = 0; k < K; k++) if (short[k] > 0 && a.consumption[k] > 0 && !(dry && k === MAT)) byNeed.push(k);
    byNeed.sort((x, y) => short[y] / a.consumption[y] - short[x] / a.consumption[x]);
    for (const k of byNeed) {
      const vital = k === FOOD || k === WATER;
      const landed = M.price[k] * (1 + c.marketSpread + frictionFor(iso, k));       // the world price, plus spread and transport
      const roomK = Math.max(0, room - (vital ? 0 : k === 0 ? reserve * (1 - c.energyVital) : reserve));   // energy may spend part of what is kept back
      const fair = landed <= c.priceLimit * c.priceBase;
      const ahead = fair ? Math.max(0, Math.min(short[k] * (c.buyDays - 1), a.stockCap[k] - s.stock[k])) : 0;   // some days ahead, into the stores, while it is cheap
      const qty = Math.min((short[k] + ahead) * access, roomK / Math.max(1e-9, landed));
      if (qty > 0) { wants.push({ k, qty, landed }); room -= qty * landed; }
    }
    // last of all, the laboratories, out of whatever is left over and never out of the reserve
    let labDeclined = labNeed;
    if (labNeed > 0) {
      const landed = M.price[0] * (1 + c.marketSpread + frictionFor(iso, 0));
      const qty = Math.min(labNeed * access, Math.max(0, room - reserve) / Math.max(1e-9, landed));
      if (qty > 0) { wants.push({ k: 0, qty, landed }); room -= qty * landed; labDeclined = labNeed - qty; }
      short[0] += labNeed;                                                   // the shortfall is whole again for the day's reckoning
    }
    s.labDeclined = labDeclined;
    // hold out below the reservation: into the stores, the rest is lost
    s.floorBroken = 0; s.reservation = s.reservation || zeros(); s.withheld = s.withheld || zeros();
    for (let k = 0; k < K; k++) {
      s.withheld[k] = 0;
      if (!(surplus[k] > 0)) continue;
      const rsv = reservationFor(s, iso, k, a, surplus[k], floors, pr);
      s.reservation[k] = rsv;
      if (M.price[k] < rsv) {
        const kept = Math.min(surplus[k], Math.max(0, a.stockCap[k] - s.stock[k]));
        s.stock[k] += kept; s.withheld[k] = surplus[k]; surplus[k] = 0;
      }
    }
    orders.push({ s, iso, wants, surplus, techEnergy: a.techEnergy, stock0 });
    if (wants.length) s.lastMarket = { day, type: wants[0].k, qty: wants[0].qty, types: wants.length };
    for (let k = 0; k < K; k++) {
      sells[k] += surplus[k];
      if (surplus[k] > 0 && pos) { sx[k] += pos[0] * surplus[k]; sy[k] += pos[1] * surplus[k]; }
    }
    for (const w of wants) buys[w.k] += w.qty;
  }
  // 2. clear the exchange: buys fill from the stock and the day's sells, pro rata; sells fill the stock up to its cap
  const fill = zeros(), accept = zeros();
  const worldNeed = zeros();
  for (const o of orders) for (let k = 0; k < K; k++) worldNeed[k] += o.s.consumption[k];
  for (let k = 0; k < K; k++) {
    if (day <= 1 && M.stock[k] < worldNeed[k] * c.coverRef) M.stock[k] = worldNeed[k] * c.coverRef;   // the world opens with its reference cover, so prices open at their base
    const avail = M.stock[k] + sells[k];
    const filled = Math.min(buys[k], avail);
    fill[k] = buys[k] > 0 ? filled / buys[k] : 0;
    const cap = worldNeed[k] * c.worldStockDays;
    const afterStock = Math.min(cap, avail - filled);
    accept[k] = sells[k] > 0 ? Math.min(1, (filled + afterStock - M.stock[k]) / sells[k]) : 0;   // share of sells the world takes
    M.stock[k] = Math.max(0, afterStock);
    // the price rests on scarcity -- the days of cover the world stock holds -- and moves with the day's imbalance
    const cover = worldNeed[k] > 0 ? M.stock[k] / worldNeed[k] : c.coverRef;
    const rest = c.priceBase * Math.pow(c.coverRef / Math.max(cover, c.coverMin), c.priceCurve);
    M.rest[k] = rest;
    const pressure = clamp((buys[k] - sells[k]) / (worldNeed[k] + 1e-9), -1, 1);   // the day's imbalance against the world's use
    M.price[k] = clamp(M.price[k] * (1 + c.priceElastic * pressure) + (rest - M.price[k]) * c.priceRevert, c.priceMin, c.priceMax);
    M.vol[k] = filled; M.buys[k] = buys[k]; M.sells[k] = sells[k]; M.need[k] = worldNeed[k];
    if (cover < c.crashCover && M.price[k] >= c.crashPrice && day >= (M.crashUntil || 0)) { M.crashUntil = day + c.crashGap; crash("scarcity"); }   // the last stocks of a dear type: panic
    M.center[k] = sells[k] > 0 ? [+(sx[k] / sells[k]).toFixed(2), +(sy[k] / sells[k]).toFixed(2)] : M.center[k];
  }
  for (const o of orders) {
    const s = o.s, m = { tax: 0, sales: 0, bought: 0, upkeep: 0, interest: 0, projects: 0, skim: 0, war: 0 };
    for (let k = 0; k < K; k++) {                        // what a sale fetches: the price less the spread and the distance to the buyers
      const sold = o.surplus[k] * accept[k];
      if (sold > 0) m.sales += sold * M.price[k] * Math.max(0, 1 - c.marketSpread - frictionFor(o.iso, k));
    }
    const boughtK = zeros();
    s.bought = s.bought || zeros(); s.bill = s.bill || zeros();
    for (const w of o.wants) {
      const k = w.k, got = w.qty * fill[k], spent = got * w.landed;
      m.bought += spent;
      const need = s.consumption[k], today = Math.min(got, s.shortage[k]);
      s.shortage[k] = Math.max(0, s.shortage[k] - today);
      s.balance[k] = need > 0 ? Math.min(1, (need - s.shortage[k]) / need) : 1;
      s.stock[k] = Math.min(s.stockCap[k], s.stock[k] + (got - today));   // what was bought ahead goes to the stores
      boughtK[k] = got;
      s.bill[k] += (spent - s.bill[k]) * c.billSmooth;                     // what this type costs us a day, smoothed
    }
    for (let k = 0; k < K; k++) { s.bought[k] = boughtK[k]; if (!(boughtK[k] > 0)) s.bill[k] *= 1 - c.billSmooth; }   // types not bought today fade
    // how fast the stores are falling, and how long the food and water will last at that rate: the signal births and rations read
    s.drain = s.drain || zeros(); let cover = Infinity;
    for (let k = 0; k < K; k++) {
      s.drain[k] += ((o.stock0[k] - s.stock[k]) - s.drain[k]) * c.drainSmooth;
      if (k === FOOD || k === WATER) cover = Math.min(cover, s.balance[k] < 1 ? 0 : s.drain[k] > 1e-9 ? s.stock[k] / s.drain[k] : Infinity);
    }
    s.cover = cover;
    // a laboratory left dark by a country's own choice is not an economic shortage: that choice costs technology, and
    // the balance answers for the energy it actually went after.  Energy it tried and failed to buy still shows
    const declined = s.labDeclined || 0;
    if (declined > 0) {
      const need0 = Math.max(1e-9, s.consumption[0] - declined);
      s.balance[0] = Math.min(1, Math.max(0, (need0 - Math.max(0, s.shortage[0] - declined)) / need0));
    }
    // and the laboratories darken for whatever of their own bill went unpaid: technology decays for it
    const te = o.techEnergy || 0, left = s.shortage[0];
    s.techUnpaid = te > 0 ? Math.min(1, left / te) : 0;
    if (s.techUnpaid > 0) s.st.technology = clamp(s.st.technology - c.decayTech * s.techUnpaid, 0, 100);
    s.treasury += m.sales - m.bought;
    // 3. taxes, upkeep (decay when unpaid), interest, projects
    m.tax = taxIncome(s);
    s.treasury += m.tax;
    const plan = s.upkeepPlan || {};
    s.unpaid = [];
    for (const [stat, key, decayKey] of UPKEEP) {
      const cost = upkeepCost(s, stat);
      if (plan[stat] === 0 || !canSpend(s, cost)) { s.st[stat] = clamp(s.st[stat] - c[decayKey], 0, 100); s.unpaid.push(stat); }
      else { s.treasury -= cost; m.upkeep += cost; }
    }
    const fights = W_.warsOf(o.iso).length;                                // fighting costs money, by the force put in the field
    if (fights > 0) {
      const spend = c.warCostForce * W_.force(o.iso) * fights;
      if (canSpend(s, spend)) { s.treasury -= spend; m.war += spend; }
    }
    s.taxMul = pm(s, "taxRate");                                             // a carbon tax, while it stands: read once a day, since taxIncome is called in every loop
    const incNow = taxIncome(s);
    s.incomeRef = s.incomeRef > 0 ? s.incomeRef + (incNow - s.incomeRef) / Math.max(1, c.creditMemory) : incNow;   // what lenders remember
    if (s.treasury < 0) { m.interest = -s.treasury * c.interestRate; s.treasury -= m.interest; }
    if (s.projects && s.projects.length) {
      const keep = [];
      for (const p of s.projects) {
        if (canSpend(s, p.cost)) {
          s.treasury -= p.cost; m.projects += p.cost; p.days -= 1;
          for (const st of (p.stats && p.stats.length ? p.stats : [p.stat])) s.st[st] = clamp(s.st[st] + p.gain, 0, 100);   // a power's project raises every stat it names
        }
        else p.stalled = (p.stalled || 0) + 1;
        if (p.days > 0) keep.push(p);
        else if (p.power && window.GOV && window.GOV.powerFinished) window.GOV.powerFinished(s, p.power);
      }
      s.projects = keep;
    }
    s.broke = s.treasury < -credit(s);
    const capT = capOf(s); if (s.treasury > capT) s.treasury -= (s.treasury - capT) * c.capClose;   // money over the cap bleeds away, it does not vanish
    s.money = m;
    // 4. growth and people
    grow(s, o.iso, c, W_);
    people(s, o.iso, c, W_);
    // 5. reports every quarter: booms and recessions are what happened, not what was rolled
    if (day % c.reportDays === 0) {
      if (s.outPrev > 0) {
        const gq = s.output / s.outPrev - 1;
        if (Math.abs(gq) >= c.reportGrowth && day - (s.lastReport || -9999) >= c.reportGap) {
          s.lastReport = day;
          W_.log({ sev: Math.abs(gq) >= 2 * c.reportGrowth ? "large" : "small", kind: "economic", key: gq > 0 ? "boom" : "recession", iso: o.iso,
                   text: gq > 0 ? `${W_.nameOf(o.iso)}'s economy is booming (+${Math.round(gq * 100)}% this quarter)`
                                : `${W_.nameOf(o.iso)} slides into recession (${Math.round(gq * 100)}% this quarter)` });
        }
      }
      s.outPrev = s.output;
    }
  }
}
function grow(s, iso, c, W_) {
  const cap = c.capBase * (1 + c.capInfra * s.st.infra / 100 + c.capTech * s.st.technology / 100) * pm(s, "output"), day = W_.day;
  let minBal = 1;
  for (let k = 0; k < K; k++) if (s.balance[k] < minBal) minBal = s.balance[k];
  const ok = minBal >= 1 - c.shortageBite, recession = day < (W_.WORLD_STATE.massive.recessionUntil || 0);
  // confidence builds while the balances hold and nothing has broken; a shortage, a debt over the limit or a crash
  // in a confident economy breaks it -- the bust -- and it starts again from nothing
  if (ok && !(day < (s.bustUntil || 0))) s.boom = Math.min(1, (s.boom || 0) + (1 - (s.boom || 0)) * c.boomRise);
  if (!(day < (s.bustUntil || 0)) && (s.boom || 0) >= c.bustBoomMin && (!ok || s.broke || (recession && minBal < 1 - c.shortageBite / 2))) bust(s, iso, minBal, c, W_, true);   // a crash breaks the confident that are short, not everyone
  let g;
  if (!ok) g = -Math.min(c.degrowthMax, c.degrowthRate * (1 - minBal));       // the chronic slide of a country short for good
  else if (day < (s.bustUntil || 0)) g = 0;                                  // after a bust, nothing grows for a while
  else {
    const pace = c.boomFloor + (1 - c.boomFloor) * (s.boom || 0);            // a recovery starts slowly and picks up pace
    g = c.growthBase * pace * (1 + c.growthTech * s.st.technology / 100) * minBal * (1 - s.output / cap)
      * (W_.fighting(iso) ? 1 - c.warDragG : 1) * (1 - (s.covered ? s.coverageLevel : 0) * c.outbreakDragG) * (recession ? 1 - c.recessionDragG : 1);
    if (s.tourismIn > 0) g += c.visitorGrowth * pace * Math.min(1, s.tourismIn / Math.max(0.01, s.pop));   // visitors add to the pace, they do not set it
  }
  s.output = Math.max(1, s.output * (1 + g));
  s.growth = g; s.cap = cap;
}
/* A bust: the sudden end of a boom.  Output falls at once to what the supply supports, and further the higher
   confidence had run; confidence is gone, growth stops for bustDays, and the shock spreads to the trade partners
   that were short and confident themselves (one hop a day; the draw is seeded, so a run replays). */
function bust(s, iso, minBal, c, W_, spread) {
  const cut = clamp(c.bustShort * (1 - minBal) + c.bustOver * (s.boom || 0), c.bustMin, c.bustMax);
  hitOutput(s, cut);
  s.boom = 0; s.bustUntil = W_.day + c.bustDays;
  W_.log({ sev: "large", kind: "economic", key: "bust", iso, text: `${W_.nameOf(iso)}'s boom breaks: output falls ${Math.round(cut * 100)}% and the money dries up` });
  const L = window.LINKS, S = W_.COUNTRY_STATE;
  if (!spread || !L || !L.ready) return;
  for (const o of L.partners(iso)) {
    const os = S[o];
    if (!os || !os.st || !os.balance || !W_.dealsOf(iso, o).length || (os.boom || 0) < c.bustBoomMin || W_.day < (os.bustUntil || 0)) continue;
    let mb = 1;
    for (let k = 0; k < K; k++) if (os.balance[k] < mb) mb = os.balance[k];
    if (mb >= 1) continue;
    if (unit(W_.seed, "bust", W_.day, iso, o) < c.shockSpread * Math.min(1, (1 - mb) / c.shortageBite)) bust(os, o, mb, c, W_, false);
  }
}
/* A crash on the exchange: stocks vanish, prices spike, growth stalls everywhere for a while.  The market fires
   it when a type's world cover runs out at a high price (once in crashGap days); the massive tier still can. */
function crash(why) {
  const c = cfg(), W_ = W(), M = W_.WORLD_STATE.massive, X = market();
  M.recessionUntil = W_.day + c.recessionDays;
  for (let k = 0; k < K; k++) { X.stock[k] *= 1 - c.cascadeStock; X.price[k] = Math.min(c.priceMax, X.price[k] * c.cascadePrice); }
  W_.log({ sev: "massive", kind: "economic", key: "globalRecession", text: why === "scarcity"
           ? "A crash on the world exchange: the last stocks of a scarce type are gone, prices spike, and growth stalls everywhere"
           : "A crash on the world exchange — stocks vanish, prices spike, and growth stalls everywhere" });
}
/* Births read the store as well as the day: a full granary feels like
   plenty, so a population keeps growing past what the land feeds and the
   correction comes late, when the stores are gone -- the overshoot.
   Rations cut births and consumption; famine and crowding raise deaths;
   the workforce follows the people slowly, so a collapse takes
   production down with it and a recovery brings it back. */
function people(s, iso, c, W_) {
  const P = s.pop, capP = Math.max(0.001, W_.popCap(iso));
  const fed = Math.min(s.balance[FOOD], s.balance[WATER]);
  const cover = s.cover == null ? Infinity : s.cover;
  const secure = c.birthStoreFloor + (1 - c.birthStoreFloor) * Math.min(1, cover / c.birthCoverDays);   // the store as the people feel it
  const rationF = 1 - c.rationBirth * (s.ration || 0) / c.rationMax;                                     // rations mean fewer children
  const medF = 1 + c.birthMed * (0.5 - s.st.medical / 100);                                             // the transition: hospitals lower births
  const birth = c.birthBase * medF * fed * secure * rationF * Math.max(0, 1 - P / capP);
  let death = c.deathBase * (1.5 - s.st.medical / 100);
  const fam = Math.max(0, (c.famineBelow - fed) / c.famineBelow);   // famine only once the fed share falls below the threshold
  if (fam > 0) death += c.deathFamine * fam;
  if (P > capP) death += c.deathCrowd * (P / capP - 1);
  death = Math.min(c.deathMax, death);
  s.famine = fam; s.births = birth; s.deaths = death;
  s.pop = Math.max(0.001, P * (1 + birth - death));
  s.pop0 = (s.pop0 || s.pop) + (s.pop - (s.pop0 || s.pop)) / c.workforceDays;   // the workforce follows the people, slowly
  // rationing: a legitimate regime cuts consumption per head when the people are short today, or when the granary is
  // below half and running out; an illegitimate one cannot.  A store hovering near its cap, as an importer's does, is no reason
  const legit = s.legit != null ? s.legit : 60;
  const cap = s.stockCap ? Math.min(s.stockCap[FOOD], s.stockCap[WATER]) : 0, held = s.stock ? Math.min(s.stock[FOOD], s.stock[WATER]) : 0;
  const short = Math.max(Math.min(1, (1 - fed) * c.rationSharp),                                            // by the day's shortfall: a small gap, a small cut
                         held < 0.5 * cap ? Math.min(1, Math.max(0, 1 - cover / c.rationCoverDays)) : 0);   // or by a granary running out
  const target = c.rationMax * (legit / 100) * short;
  s.ration = (s.ration || 0) + (target - (s.ration || 0)) * c.rationRate;
}

window.ECONOMY = { daily, assess, nativeProduction, taxIncome, credit, canSpend, projectFor, incomeLine, market,
                   marketAccess, frictionFor, gdpShares, hitOutput, reservationFor, capOf, crash, upkeepCost, K };

})();
