/* ═══════════════════════════════════════════════════════════════
   Entity — events: what happens to countries
   A catalogue of things that befall a country — disasters weighted by
   its climate zone and this year's weather, discoveries by its
   academia, political unrest by its instability — rolled daily on a
   severity ladder: small events often, large ones sometimes, and a
   massive, world-spanning tier (a crash on the exchange, a world war,
   a breakthrough era) a few times a year.

   A large disaster reaches beyond the country struck: a hurricane runs
   a track along the coast, an earthquake has an epicentre and a radius,
   a drought grips the region, floods and fires spill over a border.
   Smoke and dust cut food and infrastructure by severity.  Disasters
   kill by severity, and the survivors flee to friends and come back
   when home is calm again.  After a disaster (or a lost war) rebuilding
   is cheap for a while.  Discoveries raise technology at the origin and
   then leak, very slowly, along trade, pacts and open borders — through
   the one technology-sharing rule, so a follower climbs toward a share
   of the leader's level and never past it.  Every event is a headline
   in the world log.
   ═══════════════════════════════════════════════════════════════ */
(() => {
"use strict";
const cfg = () => window.ENTITY_CONFIG;
const W = () => window.WORLD;
const { COUNTRY_REGION } = window.GEO;
const { clamp, unit, weatherAnomaly, climateOf, ZONE, frontier, resShare } = window.COUNTRIES;

const stats = { fired: {}, adoptions: 0, massive: 0, large: 0, catastrophic: 0, footprints: 0, refugees: 0, dead: 0 };   // for the smoke test; not saved
const bump = (s, k, d) => { s.st[k] = clamp(s.st[k] + d, 0, 100); };
const pmE = (s, row) => { const G = window.GOV; return G && G.powerMul ? G.powerMul(s, row) : 1; };   // a government's programme, where it bears on a row
const T3 = (s, k, small, large, cata, tier) => bump(s, k, [small, large, cata][tier]);
const coastal = iso => { const L = window.LINKS; return !!(L && L.ready && (L.coastKm[iso] || 0) > 0); };

/* Per-country hazard profile: seed, climate zone, and this year's weather —
   droughts, fires and dust come with dry years, floods and storms with
   wet ones. */
function hazards(iso) {
  const cl = climateOf(iso), z = ZONE[cl.zone], seed = W().seed;
  const wx = weatherAnomaly(iso, seed, W().day), dry = Math.max(0, -wx), wet = Math.max(0, wx);
  return {
    zone: cl.zone, wx,
    quake:    0.2 + 0.8 * unit(seed, iso, "quake"),
    flood:    z.flood * cl.humidity / 100 * (1 + wet),
    drought:  z.drought * (100 - cl.humidity) / 100 * cl.temp / 40 * (1 + dry),
    storm:    z.storm * (cl.humidity / 150 + (coastal(iso) ? 0.3 : 0)) * (1 + 0.5 * wet),
    wildfire: z.fire * (1 - cl.humidity / 100) * cl.temp / 30 * (1 + 1.5 * dry),
    dust:     z.dust * (1 - cl.humidity / 100) * (1 + dry),
  };
}

/* ── Catalogue ─────────────────────────────────────────────────── */
const KINDS = [];
function add(key, kind, weight, apply, text, extra) { KINDS.push(Object.assign({ key, kind, weight, apply, text }, extra || {})); }
/* Disasters come in three tiers (apply's second argument): 0 small, the
   weather-scale damage of an ordinary year; 1 large, rare, the one that
   hits infrastructure; 2 catastrophic, rarer still, the one that
   devastates it.  Droughts, floods, fires and dust leave a mark on the
   country (dryUntil / wetUntil / smokeUntil) that economy.js reads into
   its food and water. */
add("quake", "disaster", (s, h) => h.quake,
    (s, t) => { T3(s, "infra", -1, -15, -cfg().devastateInfra, t); T3(s, "stability", -3, -8, -15, t); T3(s, "medical", -2, -5, -10, t); },
    (n, t) => t === 2 ? `A catastrophic earthquake devastates ${n}'s infrastructure` : t ? `A major earthquake strikes ${n}` : `An earthquake strikes ${n}`,
    { death: 2, spread: "radius", eco: 1 });
add("flood", "disaster", (s, h) => h.flood,
    (s, t) => { T3(s, "infra", -1, -10, -30, t); T3(s, "stability", -2, -5, -15, t); T3(s, "medical", -1, -4, -10, t);
                s.wetUntil = Math.max(s.wetUntil || 0, W().day + [30, 90, 180][t]); },
    (n, t) => t === 2 ? `Catastrophic floods devastate ${n}` : t ? `Severe floods hit ${n}` : `Floods sweep parts of ${n}`,
    { death: 1, spread: "border", eco: 0.8 });
add("drought", "disaster", (s, h) => h.drought,
    (s, t) => { T3(s, "stability", -3, -8, -15, t); T3(s, "infra", 0, 0, -10, t);
                s.dryUntil = Math.max(s.dryUntil || 0, W().day + [60, 240, 730][t]); },
    (n, t) => t === 2 ? `A catastrophic drought grips ${n}` : t ? `A years-long drought grips ${n}` : `Drought hits ${n}'s harvest`,
    { death: 0.5, spread: "region", eco: 1.2 });
add("storm", "disaster", (s, h) => h.storm,
    (s, t) => { T3(s, "infra", -1, -12, -30, t); T3(s, "stability", 0, -3, -15, t); T3(s, "medical", -1, -3, -10, t); },
    (n, t) => t === 2 ? `A catastrophic hurricane devastates ${n}'s coast` : t ? `A hurricane batters ${n}` : `A storm hits ${n}'s coast`,
    { death: 1.5, spread: "track", eco: 0.8 });
add("wildfire", "disaster", (s, h) => h.wildfire,
    (s, t) => { T3(s, "infra", -1, -6, -15, t); T3(s, "stability", -1, -3, -8, t); T3(s, "medical", -1, -3, -6, t);
                s.smokeUntil = Math.max(s.smokeUntil || 0, W().day + [20, 60, 120][t]); },
    (n, t) => t === 2 ? `Wildfires rage across ${n} for weeks; smoke blankets the region` : t ? `Wildfires sweep ${n}` : `Wildfires burn in ${n}`,
    { death: 0.7, spread: "border", eco: 0.7 });
add("dust", "disaster", (s, h) => h.dust,
    (s, t) => { T3(s, "infra", -1, -4, -10, t); T3(s, "medical", -1, -4, -8, t); T3(s, "stability", 0, -2, -6, t);
                s.smokeUntil = Math.max(s.smokeUntil || 0, W().day + [15, 45, 90][t]); },
    (n, t) => t === 2 ? `A season of dust storms chokes ${n}` : t ? `A great dust storm buries ${n}'s fields` : `Dust storms sweep ${n}`,
    { death: 0.4, spread: "border", eco: 0.6 });
add("discovery", "discovery", (s) => (s.st.academia / 100) ** 2 * (1 - cfg().breakthroughShare),
    (s, big, iso) => { bump(s, "technology", (big ? 2 : 1) * cfg().techStep * frontier(s.st.technology)); startDiffusion("tech", iso); },
    (n, big) => big ? `A landmark discovery in ${n} reshapes its field` : `Researchers in ${n} announce a breakthrough`);
add("medical", "discovery", (s) => (s.st.academia / 100) ** 2 * cfg().breakthroughShare,
    (s, big, iso) => { bump(s, "medical", big ? 8 : 5); bump(s, "technology", 2 * frontier(s.st.technology)); s.breakthroughUntil = W().day + cfg().breakthroughDays; startDiffusion("medical", iso); },
    (n, big) => big ? `${n} unveils a new generation of detection technology` : `${n} announces a medical breakthrough`);
const RES_LABEL = ["oil and gas", "material", "farmland", "groundwater"];
add("resource", "discovery", (s) => {
      const c = cfg();
      const tech = clamp(s.st.technology / 100, 0, 1);                                            // the means to look
      const grow = clamp((s.pop / Math.max(0.001, s.pop0 || s.pop) - 1) / c.findGrowth, 0, 1);    // a people outgrowing what it has
      const land = clamp(Math.log10(Math.max(1, s.area || c.areaFallback) / 1e4) / 2, 0, 1);      // and somewhere to look
      return pmE(s, "findWeight") * (c.findBase + c.findTech * tech + c.findGrow * grow + c.findLand * land + c.findNeed * Math.max(0, 1 - W().meanRes(s) / 100));   // nothing owed to a country already rich in everything; a frontier programme looks harder
    },
    (s, t, iso, rng) => {
      if (!s.res) return null;
      const c = cfg();
      // which type, from the day's stream: prospectors look for what is dear, so a type whose world price runs over the
      // base is found more often, by findPrice per unit of excess up to findPriceCap.  One draw either way, so the
      // stream is consumed exactly as before and every other seeded event stays where it was
      const M = W().WORLD_STATE.market, wts = [1, 1, 1, 1];
      if (M && M.price) for (let j = 0; j < 4; j++) wts[j] = 1 + c.findPrice * clamp(M.price[j] / c.priceBase - 1, 0, c.findPriceCap);
      let u = rng() * (wts[0] + wts[1] + wts[2] + wts[3]), k = 3;
      for (let j = 0; j < 4; j++) { u -= wts[j]; if (u <= 0) { k = j; break; } }
      // most finds are a field and a few are a province: a long tail on the size, normalised so the ordinary find is
      // what it always was and only the rare one is new, capped so nothing single-handedly remakes the world
      const tail = Math.pow(1 / Math.max(1e-6, rng()), c.findTail) / Math.pow(2, c.findTail);
      const gain = Math.min(c.findCap, (t ? 2 : 1) * c.resourceFind * (0.5 + s.st.technology / 100) * tail * pmE(s, "findSize"));
      const before = s.res[k];
      s.res[k] = clamp(s.res[k] + gain, 0, c.resMax);
      if (s.potential) {
        if (before > 0 && s.potential[k] > 0) s.potential[k] *= resShare(s.res[k], c) / resShare(before, c);   // the absolute potential grows with it
        else {                                    // a type it had none of: price the new field off the scale of its own endowment
          let ref = 0;
          for (let j = 0; j < 4; j++) if (s.res[j] > 0 && s.potential[j] > 0) ref = Math.max(ref, s.potential[j] / resShare(s.res[j], c));
          if (ref > 0) s.potential[k] = ref * resShare(s.res[k], c);
        }
      }
      return { what: RES_LABEL[k], gain: s.res[k] - before, fresh: before <= 0 };
    },
    (n, t, x) => !x || !x.what ? `New reserves are found in ${n}`
      : x.gain >= 30 ? `A vast ${x.what} field is opened in ${n} — reserves on a scale that will remake its economy`
      : x.gain >= 12 ? `Major new ${x.what} reserves are discovered in ${n}`
      : x.fresh ? `${n} strikes ${x.what} for the first time`
      : `New ${x.what} reserves are found in ${n}`);
add("protests", "political", (s) => (100 - s.st.stability) / 100,
    (s, big) => { bump(s, "stability", big ? -12 : -5); },
    (n, big) => big ? `Mass protests paralyse ${n}` : `Protests in ${n}`);
add("scandal", "political", (s) => 0.3 + (s.freedom != null ? s.freedom : s.econOpen) / 200,
    (s, big) => { bump(s, "stability", big ? -8 : -3); window.GOV.nudge(s, { authority: -3 }); },
    (n, big) => big ? `A corruption scandal engulfs ${n}'s government` : `A scandal rattles ${n}'s government`);
add("strike", "political", (s) => 0.2 + (100 - Math.min(100, window.COUNTRIES.ecoIndex(s.output, cfg()))) / 200,
    (s, big) => { window.ECONOMY.hitOutput(s, big ? cfg().strikeBig : cfg().strikeSmall); },
    (n, big) => big ? `A general strike halts ${n}` : `Strikes disrupt ${n}`);
add("assassination", "political", (s, h, big) => big ? 0.1 + (100 - s.st.stability) / 300 : 0,
    (s, big, iso, rng) => { bump(s, "stability", -15); window.GOV.nudge(s, { authority: rng() < 0.5 ? 10 : -10 }); },
    (n) => `A leader is assassinated in ${n}`);

function draw(items, weights, rng) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}

/* ── Daily roll ────────────────────────────────────────────────── */
function roll(rng) {
  const c = cfg(), W_ = W(), S = W_.COUNTRY_STATE;
  for (const iso in S) {
    const s = S[iso];
    if (!s.st) continue;
    const x = rng();
    const tier = x < c.pLarge * c.catastrophicShare ? 2 : x < c.pLarge ? 1 : x < c.pLarge + c.pSmall ? 0 : -1;
    if (tier >= 0) fire(iso, null, tier, rng);
  }
  if (rng() < c.pMassive) massive(rng);
}
/* One event on one country: the catalogue row named by key, or a weighted
   draw when key is null (the catastrophic tier draws disasters only).
   Exported so the smoke test can strike a country on demand. */
function fire(iso, key, tier, rng) {
  const W_ = W(), s = W_.COUNTRY_STATE[iso], c = cfg();
  if (!s || !s.st) return null;
  const h = hazards(iso);
  const pool = tier === 2 ? KINDS.filter(k => k.kind === "disaster") : KINDS;
  const kind = key ? KINDS.find(k => k.key === key) : draw(pool, pool.map(k => Math.max(0, k.weight(s, h, tier))), rng);
  if (!kind) return null;
  const extra = kind.apply(s, tier, iso, rng);
  stats.fired[kind.kind] = (stats.fired[kind.kind] || 0) + 1;
  if (tier >= 1) stats.large++;
  if (tier === 2) stats.catastrophic++;
  let text = kind.text(W_.nameOf(iso), tier, extra);
  if (kind.kind === "disaster") {
    kill(s, kind, tier);
    window.ECONOMY.hitOutput(s, [c.blowSmall, c.blowLarge, c.blowCata][tier] * (kind.eco || 1));   // output, not the index: it stays lost
    if (tier >= 1) {
      const hit = footprint(iso, kind, tier, rng);
      if (hit.length) text += ` — ${hit.map(W_.nameOf).slice(0, 4).join(", ")}${hit.length > 4 ? " and others" : ""} ${kind.spread === "track" ? "lie in its path" : kind.spread === "radius" ? "feel the shock" : "suffer too"}`;
      s.rebuildUntil = W_.day + c.rebuildDays;             // rebuilding is cheap for a while
      flee(iso, c.refugeeRate * (tier === 2 ? 2 : 1), kind.key, rng);
    }
  }
  const e = W_.log({ sev: tier === 2 ? "massive" : tier ? "large" : "small", kind: kind.kind, key: kind.key, iso, text });
  if (tier >= 1 && kind.kind === "disaster") aid(iso, rng);
  return e;
}

/* ── Footprints: how far a disaster reaches ────────────────────── */
/* A lesser blow (one tier down) to the countries around: a hurricane's
   track along the coast, an earthquake's radius, a drought's region, a
   flood's or fire's border. */
function footprint(iso, kind, tier, rng) {
  const W_ = W(), S = W_.COUNTRY_STATE, L = window.LINKS, c = cfg(), hit = [];
  if (!L || !L.ready) return hit;
  const lesser = tier - 1;
  const strike = other => {
    const o = S[other]; if (!o || !o.st || hit.indexOf(other) >= 0) return;
    kind.apply(o, lesser, other, rng); kill(o, kind, lesser);
    window.ECONOMY.hitOutput(o, [c.blowSmall, c.blowLarge, c.blowCata][lesser] * (kind.eco || 1));
    if (lesser >= 1) o.rebuildUntil = W_.day + c.rebuildDays;
    hit.push(other); stats.footprints++;
  };
  if (kind.spread === "track") {                         // along the coast, nearest first, losing strength
    let at = iso;
    for (let i = 0; i < c.trackLen; i++) {
      const next = L.partners(at).filter(o => L.linkedBy(at, o, "sea") && o !== iso && hit.indexOf(o) < 0 && S[o] && S[o].st)
                    .sort((a, b) => W_.distKm(at, a) - W_.distKm(at, b))[0];
      if (!next || rng() > c.trackHold) break;
      strike(next); at = next;
    }
  } else if (kind.spread === "radius") {                 // everyone within reach of the epicentre
    for (const other in S) {
      if (other === iso || !S[other].st) continue;
      const d = W_.distKm(iso, other);
      if (d <= c.quakeRadiusKm * (tier === 2 ? 1.5 : 1) && rng() < 1 - d / (c.quakeRadiusKm * 1.5)) strike(other);
    }
  } else if (kind.spread === "region") {                 // the region shares the weather
    for (const other of L.partners(iso)) if (L.linkedBy(iso, other, "land") && COUNTRY_REGION[other] === COUNTRY_REGION[iso] && rng() < c.footprintChance) strike(other);
  } else {                                               // over the border
    for (const other of L.partners(iso)) if (L.linkedBy(iso, other, "land") && rng() < c.footprintChance) strike(other);
  }
  return hit;
}
/* Disasters kill by severity. */
function kill(s, kind, tier) {
  const c = cfg(), frac = [c.deathSmall, c.deathLarge, c.deathCata][tier] * (kind.death || 1) * (1.5 - s.st.medical / 200);
  const dead = Math.min(Math.max(0, s.pop) * frac, [c.deathCapSmall, c.deathCapLarge, c.deathCapCata][tier] * (kind.death || 1));
  s.pop = Math.max(0.001, s.pop - dead); s.disasterDead = (s.disasterDead || 0) + dead; stats.dead += dead;
}

/* ── Refugees ──────────────────────────────────────────────────── */
/* A share of the people leave for linked friends, and come back when
   home is calm: not at war or occupied, no disaster still biting, the
   worst supply back above returnBalance. */
function flee(iso, share, why, rng) {
  const c = cfg(), W_ = W(), S = W_.COUNTRY_STATE, L = window.LINKS, s = S[iso];
  if (!L || !L.ready || !s || !s.st || share <= 0 || s.pop < 0.5) return 0;
  const hosts = L.partners(iso).filter(o => S[o] && S[o].st && !S[o].occupiedBy && !W_.fighting(o) && (W_.relOf(iso, o) >= c.refugeeRel || W_.pairOf(iso, o).pact))
                 .sort((a, b) => W_.relOf(iso, b) - W_.relOf(iso, a)).slice(0, 3);
  if (!hosts.length) return 0;
  const total = s.pop * share, each = total / hosts.length;
  s.refugees = s.refugees || [];
  for (const h of hosts) {
    S[h].pop += each;
    const row = s.refugees.find(r => r[0] === h);
    if (row) row[1] += each; else s.refugees.push([h, each]);
  }
  s.pop = Math.max(0.001, s.pop - total); stats.refugees += total;
  W_.log({ sev: total >= 1 ? "large" : "small", kind: "refugees", iso, iso2: hosts[0],
           text: `${total >= 1 ? Math.round(total * 10) / 10 + " million" : Math.round(total * 1000) + " thousand"} flee ${W_.nameOf(iso)}${why ? " (" + why + ")" : ""} to ${hosts.map(W_.nameOf).join(", ")}` });
  return total;
}
function calm(iso, s) {
  const W_ = W(), c = cfg(), day = W_.day;
  if (s.occupiedBy || W_.fighting(iso)) return false;
  if (day < (s.dryUntil || 0) || day < (s.wetUntil || 0) || day < (s.smokeUntil || 0)) return false;
  let minBal = 1; if (s.balance) for (let k = 0; k < 4; k++) if (s.balance[k] < minBal) minBal = s.balance[k];
  return minBal >= c.returnBalance;
}
function refugeeTick() {
  const c = cfg(), W_ = W(), S = W_.COUNTRY_STATE;
  for (const iso in S) {
    const s = S[iso];
    if (!s.refugees || !s.refugees.length || !s.st) continue;
    if (!calm(iso, s)) continue;
    const keep = [];
    for (const row of s.refugees) {
      const host = S[row[0]], back = Math.min(row[1], Math.max(row[1] * c.returnRate, 0.001));
      if (host) host.pop = Math.max(0.001, host.pop - back);
      s.pop += back; row[1] -= back;
      if (row[1] > 0.0005) keep.push(row);
    }
    s.refugees = keep;
  }
}

/* Friends of a stricken country chip in. */
function aid(iso, rng) {
  const c = cfg(), W_ = W(), S = W_.COUNTRY_STATE, L = window.LINKS, s = S[iso], D = window.DECIDE;
  if (!L || !L.ready) return;
  const donors = [];
  const st = D && D.standing ? D.standing(iso) : null;       // what the stricken country actually lacks
  let want = -1;
  if (st) { let worst = 0; for (let k = 0; k < 4; k++) if (st.gap[k] > worst) { worst = st.gap[k]; want = k; } }
  for (const other of L.partners(iso)) {
    const o = S[other], p = W_.pairOf(iso, other);
    if (!o || !o.st || o.occupiedBy) continue;
    if (p.rel < c.aidRel && !p.pact) continue;
    let sent = false;
    if (want >= 0) {                                         // relief in kind: a short deal at no price, out of their surplus
      const os = D.standing(other);
      const q = os ? Math.min(st.gap[want], os.spare[want] * c.aidShare) : 0;
      if (q > 0 && (p.deals || []).length < c.dealsPerPair) {
        const first = iso < other;
        W_.addDeal(iso, other, first
          ? { g: -1, gq: 0, t: want, tq: q, mq: 0, tech: 0, until: W_.day + c.aidDays, since: W_.day, short: 0 }
          : { g: want, gq: q, t: -1, tq: 0, mq: 0, tech: 0, until: W_.day + c.aidDays, since: W_.day, short: 0 });
        sent = true;
      }
    }
    if (!sent && o.treasury > 0) {
      const amount = o.treasury * c.aidFrac;                 // a share of what it actually has, never of a debt
      o.treasury -= amount; s.treasury += amount;
      sent = true;
    }
    if (!sent) continue;
    W_.shiftRel(iso, other, 5);
    donors.push(W_.nameOf(other));
  }
  if (donors.length)
    W_.log({ sev: "small", kind: "aid", iso, text: `Aid reaches ${W_.nameOf(iso)} from ${donors.slice(0, 3).join(", ")}${donors.length > 3 ? " and others" : ""}` });
}

/* ── Massive, world-spanning tier ──────────────────────────────── */
function massive(rng) {
  const c = cfg(), W_ = W(), S = W_.COUNTRY_STATE, M = W_.WORLD_STATE.massive;
  stats.massive++;
  const pick = rng();
  const crash = () => window.ECONOMY.crash("panic");   // the crash itself lives in economy.js: the market fires it on scarcity too
  if (pick < 0.03) crash();                                // crashes are earned on the exchange; a panic is rare
  else if (pick < 0.33) {
    // the most hostile pair of strong, free countries goes to war; pacts pull the rest in
    let best = null, worst = 0;
    const L = window.LINKS;
    for (const a in S) {
      const A = S[a];
      if (!window.DECIDE.canFight(A) || W_.force(a) < c.powerForce || W_.fighting(a) || !L || !L.ready) continue;
      for (const b of L.partners(a)) {
        const B = S[b];
        if (!window.DECIDE.canFight(B) || W_.force(b) < c.powerForce || W_.fighting(b)) continue;
        const rel = W_.relOf(a, b);
        if (rel < worst) { worst = rel; best = [a, b]; }
      }
    }
    if (best && window.DECIDE.declareWar(best[0], best[1])) {
      W_.log({ sev: "massive", kind: "war", key: "worldWar", iso: best[0], iso2: best[1], text: `The world holds its breath: ${W_.nameOf(best[0])} and ${W_.nameOf(best[1])} are at war, and their allies with them` });
    } else crash();
  } else if (pick < 0.63) {
    M.eraUntil = W_.day + c.eraDays;
    W_.log({ sev: "massive", kind: "discovery", key: "era", text: "A breakthrough era: discoveries are spreading between nations faster than ever" });
  }
}

/* ── Diffusion ─────────────────────────────────────────────────── */
/* A discovery leaks from country to country along trade, pacts and open
   borders, week by week, very slowly.  What an adopter gains comes from
   the one sharing rule: it climbs toward diffuseCap of the origin's level
   as fast as its infrastructure and economy let it absorb, and never
   past that share; a country already at the cap has nothing to adopt.
   A wave stops when it has reached diffuseStop of the world or aged out. */
function startDiffusion(kind, origin) {
  W().WORLD_STATE.diffusions.push({ kind, origin, day: W().day, reached: [origin] });
}
function adopt(s, kind, origin, iso) {
  const c = cfg(), W_ = W();
  const step = W_.shareTech(origin, iso, c.diffuseGain, c.diffuseCap);
  if (kind === "medical" && s.st.medical < W_.COUNTRY_STATE[origin].st.medical * c.diffuseCap) {
    bump(s, "medical", c.diffuseMedical); s.breakthroughUntil = Math.max(s.breakthroughUntil, W_.day + c.breakthroughDays);
  }
  return step;
}
function diffuse(rng) {
  const c = cfg(), W_ = W(), S = W_.COUNTRY_STATE, L = window.LINKS, M = W_.WORLD_STATE.massive;
  if (!L || !L.ready) return;
  const mult = (W_.day < (M.eraUntil || 0) ? c.eraMult : 1) * c.diffuseBase;
  const agents = Object.keys(S).length;
  const keep = [];
  for (const d of W_.WORLD_STATE.diffusions) {
    if (W_.day - d.day > c.diffuseDays || d.reached.length > agents * c.diffuseStop) continue;
    const origin = S[d.origin]; if (!origin || !origin.st) continue;
    const have = new Set(d.reached), newly = [];
    for (const iso of d.reached) {
      for (const other of L.partners(iso)) {
        if (have.has(other) || !S[other] || !S[other].st) continue;
        const o = S[other];
        if (o.st.technology >= origin.st.technology * c.diffuseCap) { have.add(other); continue; }   // nothing to learn: the wave passes through
        const p = W_.pairOf(iso, other);
        const chance = ((p.deals && p.deals.length ? c.diffuseTrade : 0) + (p.pact ? c.diffusePact : 0) + c.diffuseAcademia * o.st.academia / 100)
                     * (0.5 + o.econOpen / 200) * mult;
        if (rng() < chance) { have.add(other); newly.push(other); }
      }
    }
    for (const iso of newly) { adopt(S[iso], d.kind, d.origin, iso); d.reached.push(iso); stats.adoptions++; }
    if (newly.length)
      W_.log({ sev: "small", kind: "adopt", iso: newly[0], iso2: d.origin,
               text: `${W_.nameOf(newly[0])}${newly.length > 1 ? ` and ${newly.length - 1} other${newly.length > 2 ? "s" : ""}` : ""} adopt${newly.length > 1 ? "" : "s"} ${W_.nameOf(d.origin)}'s ${d.kind === "medical" ? "medical" : "technical"} breakthrough` });
    keep.push(d);
  }
  W_.WORLD_STATE.diffusions = keep;
}

window.EVENTS = { roll, fire, diffuse, massive, KINDS, stats, hazards, footprint, flee, refugeeTick, kill, calm };
})();
