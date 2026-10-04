/* ==========================================================================
   ENTITY - CORE (runs on the page AND inside the worker)
   ==========================================================================
   Wrapped in a named function purely as a source container.  The worker is
   built from the TEXT of these two bodies, concatenated and handed to a Blob
   (see ENTITY_SRC_BODY in js/core.js and the worker bootstrap in js/host.js).
   Reading a body back with Function.prototype.toString needs no fetch and no
   eval, so this behaves the same over http://, from file://, and inside a
   sandboxed frame - which the inline <script> blocks it replaces also did.

   The body is left flush-left and otherwise byte-identical to the inline
   version, so the text the worker receives is unchanged.
   ========================================================================== */
function ENTITY_CORE_SRC() {
/* ════════════════════════════════════════════════════════════════
   ENTITY — CORE
   ════════════════════════════════════════════════════════════════ */
"use strict";
const SUB = [
  { name:"Resource 1", rate:.012,  K:.16,  yield:1.15,   polymer:.05, col:"#f2e04e" },
  { name:"Resource 2", rate:.009,  K:.11,  yield:.9125,  polymer:.1,  col:"#e8a04a" },
  { name:"Resource 3", rate:.008,  K:.3,   yield:1.33,   polymer:.55, col:"#d6708f" },
  { name:"Resource 4", rate:.007,  K:.55,  yield:1,      polymer:1,   col:"#6fae4f" },
  { name:"Resource 5", rate:.009,  K:.06,  yield:.8,     polymer:1,   col:"#9a8fb8" },
];
let NS = 5;
let CAP = 2.6;
const BITCOST = {
  enzGlu:     [ .000065, .000055, .000055, .00014  ],
  enzSuc:     [ .000085, .00036,  .000015, .00008  ],
  enzPro:     [ .00007,  .0001,   .00005,  .000025 ],
  enzCel:     [ .000375, .00003,  .000065, .00009  ],
  enzNec:     [ .00005,  .00008,  .00007,  .000015 ],
  kitB:       [ .00005,  .00015,  .0001,   .000065 ],
  kitA:       [ .00011,  .000025, .00005,  .000105 ],
  shield:     [ .00018,  .00022,  .00008,  .00014  ],
  dormancy:   [ .00024,  .0003,   .0001,   .000185 ],
  adaptor:    [ .00016,  .00008,  .00005,  .000115 ],
  reserve:    [ .00012,  .000185, .00004,  .00014  ],
  brewer:     [ .000235, .00005,  .00006,  .00019  ],
  lodging:    [ .0001,   .00008,  .000175, .000225 ],
  recycleEnz: [ .00003,  .00002,  .00006,  .00011  ],
  cloakBit:   [ .000055, .000055, .00002,  .00007  ],
  tgtOffBit:  [ .000015, .000025, .00006,  .00006  ],
  brewOffBit: [ .00005,  .00003,  .00001,  .00008  ],
};
const ENZ_KEY = ["enzGlu","enzSuc","enzPro","enzCel","enzNec"];
const LADR = { enz:1.875, cloak:1.6, tgt:1.38, brew:1.25 };
const cmult = (fam, n) => n > 0 ? Math.pow(LADR[fam], n - 1) : 0;
let LATENT_CH = .12;
let RESERVE_BANK  = 1.5;
let SHIELD_BLOCK = .585;
let SHIELD_SOAK  = .22;
let SCRUB_FRAC = .16;
let ADAPT_BOOST = 2.75;
let VAULT_DIV  = .5;
let VAULT_COST = .5;
let VAULT_AGE  = 1.33;
let BATCH_FRAC = .4;
const MODES = [
  { name:"Swarm",   upkeep:.0005,   bank:1,    divThresh:.75,   divChance:.027,
    broodSize:1, divCost:.08,   senT: 500, place:"edge",    mutScale:1.4  },
  { name:"Network", upkeep:.000225, bank:2,    divThresh:.325,  divChance:.2,
    broodSize:1, divCost:.07,   senT:3600, place:"fila",    mutScale:.85  },
  { name:"Bloom",   upkeep:.0002,   bank:3.33, divThresh:.4,    divChance:.16,
    broodSize:4, divCost:.12,   senT:2100, place:"burst",   mutScale:1.3  },
  { name:"Shower",  upkeep:.0006,   bank:2.6,  divThresh:.7,    divChance:.04,
    broodSize:1, divCost:.16,   senT:2500, place:"scatter", mutScale:1    },
];
const MODE_NAME = MODES.map(m => m.name);
let AGE_P = 3;
const RECYCLE_TABLE = [4,2,4,1,3,4,3,4,2,4,2,1,1,0,4,3,3,2,2,3,1,0,3,0,1,0,2,0,1,0,-1];
let RECYCLE_FRAC  = .7;
let BASE_RECYCLE_FRAC = .4;
let RECYCLE_DIV    = 1.36;
let REMAINS_K = 40;
let HUNT_BANK = .125;
let MASK_POT  = .18;
let BREW_POT  = .08;
let BITE_DMG        = .2;
let BITE_XFER       = .88;
let BITE_XFER_SHIELD  = .48;
let BITE_CD   = 7;
let SPILL_FRAC = .5;
let MOVE_GATE = .00018;
let HUNT_ROAM = .85;
let MOVE_TICKS = 6;
let SHARE_EPS = .0025;
let SHARE_PULL = .825;
let SHARE_KEEP = .3;
let DORM_SLEEP= .25;
let WAKE_MARGIN = 1.1;
let DORM_UPK  = .55;
let DORM_DIV  = .5;
let EMIT_RATE   = .042;
let COMP_DECAY= .99;
let REMAINS_DECAY = .002;
let REMAINS_EFF   = .55;
let DOSE_DMG  = .004;
let DIFF_EVERY= 6;
let DIAG_W = .55;
let FILA_RUN  = .675;
let FILA_MAXNB  = 5;
let FILA_BRANCH = .4;
let REACH_EVERY = 10;
let DIFF_RATE = .25;
const FEEDERS = [
  { q:1, kind:"drop", gapMed:10, sigma:1.75,
    dropsMin:2, dropsMax:9, dropR:2.75, amp:.26,
    dropFloor:.16, dropSpread:2, dropPow:1.7 },
  { q:3, kind:"seep", rate:.00008 },
];
const CH_NAME = ["Ax","Bo","Cq","Dn","Er","Fu","Gs","Ht"];
const F = {
  mode:    [0,  0, 1],  type:    [0,  1, 1],  spareK:  [0,  2, 1],  diet:  [0,  3, 5],
  huntB:   [0,  8, 1],  huntA:   [0,  9, 1],
  shield:  [0, 10, 1],  dormancy:[0, 11, 1],  adaptor:[0, 12, 1],
  reserve: [0, 13, 1],  brewer:  [0, 14, 1],
  recycler:[0, 15, 1],
  lodging: [0, 16, 1],
  spareB:  [0, 17, 1],
  spare0:  [0, 18,14],
  id:      [1,  0, 8],  tgt:     [1,  8, 8],  brew:  [1, 16, 8],
  spare1:  [1, 24, 8],
};
const get = (g0, g1, f) => {
  const [w, s, n] = F[f];
  return ((w ? g1 : g0) >>> s) & (n === 32 ? 0xffffffff : (1 << n) - 1);
};
const set = (g0, g1, f, v) => {
  const [w, s, n] = F[f], m = ((n === 32 ? 0xffffffff : (1 << n) - 1) >>> 0);
  const word = (w ? g1 : g0) & ~(m << s) | ((v & m) << s);
  return w ? [g0, word >>> 0] : [word >>> 0, g1];
};
const popcount = v => { v -= (v >> 1) & 0x55555555;
  v = (v & 0x33333333) + ((v >> 2) & 0x33333333);
  return ((v + (v >> 4) & 0xf0f0f0f) * 0x1010101) >> 24; };
const statCache = new Map();
function statsOf(g0, g1) {
  const key = g0 + ":" + g1;
  const hit = statCache.get(key); if (hit) return hit;
  const s = { g0, g1 };
  s.type   = get(g0, g1, "type");
  s.mode   = (get(g0, g1, "mode") << 1) | s.type;
  s.diet   = get(g0, g1, "diet");   s.dietN = popcount(s.diet);
  s.huntB  = get(g0, g1, "huntB");  s.huntA = get(g0, g1, "huntA");
  s.hunt   = s.huntB | s.huntA;
  for (const t of ["shield","dormancy","adaptor","reserve","brewer"])
    s[t] = get(g0, g1, t);
  s.id    = get(g0, g1, "id");    s.cloakN = 8 - popcount(s.id);
  s.tgt    = get(g0, g1, "tgt");    s.tgtN   = popcount(s.tgt);
  s.brew   = get(g0, g1, "brew");
  s.recycler = get(g0, g1, "recycler");
  s.lodging  = get(g0, g1, "lodging");
  s.brewN  = popcount(s.brew);
  s.huntLive = !!(s.hunt && s.tgt);
  s.brewLive = !!(s.brewer && s.brew);
  const M = MODES[s.mode];
  const bill = [];
  const add = (label, val, src) => { bill.push([label, val, src]); };
  add("mode base", M.upkeep, "MODES.upkeep");
  const m = s.mode;
  const appN = s.dietN + (s.huntB ? 1 : 0) + (s.huntA ? 1 : 0);
  const eM = cmult("enz", appN);
  for (let q = 0; q < NS; q++) if (s.diet & (1 << q))
    add("specialty · " + SUB[q].name, BITCOST[ENZ_KEY[q]][m] * eM,
        `BITCOST × enz r^${appN - 1} (${appN} gear)`);
  s.gear = 0;
  if (s.huntB) { const c = BITCOST.kitB[m] * eM; s.gear += c;
    add("kit · Type B", c, `BITCOST × enz r^${appN - 1}; free while processing`); }
  if (s.huntA) { const c = BITCOST.kitA[m] * eM; s.gear += c;
    add("kit · Type A", c, `BITCOST × enz r^${appN - 1}; free while processing`); }
  if (s.cloakN)
    add(`cloak · ${s.cloakN} hidden`,
        s.cloakN * BITCOST.cloakBit[m] * cmult("cloak", s.cloakN),
        `${s.cloakN} × BITCOST × cloak r^${s.cloakN - 1}`);
  { const off = 8 - s.tgtN;
    if (off > 0 && (s.huntLive || LATENT_CH > 0)) {
      const c = off * BITCOST.tgtOffBit[m] * cmult("tgt", off)
              * (s.huntLive ? 1 : LATENT_CH);
      if (s.huntLive) s.gear += c;
      if (c > 0)
      add(`target focus · ${off} off${s.huntLive ? "" : " · latent"}`, c,
          s.huntLive ? `${off} × BITCOST × tgt r^${off - 1}; free while processing`
                     : `${off} × BITCOST × tgt r^${off - 1} × LATENT_CH — carried, not used`); } }
  if (s.recycler && s.dietN)
    add(`recycler · ${s.dietN} specialt${s.dietN>1?"ies":"y"}`,
        BITCOST.recycleEnz[m] * s.dietN, "BITCOST × diet width");
  if (s.lodging) add("lodging", BITCOST.lodging[m], "opens the tile to a tenant");
  { const live = s.brewLive;
    const off = 8 - s.brewN;
    if (off > 0 && (live || LATENT_CH > 0))
      add(`brew breadth · ${off} off${live ? "" : " · latent"}`,
          off * BITCOST.brewOffBit[m] * cmult("brew", off) * (live ? 1 : LATENT_CH),
          live ? `${off} × BITCOST × brew r^${off - 1}`
               : `${off} × BITCOST × brew r^${off - 1} × LATENT_CH — carried, not used`); }
  for (const t of ["shield","dormancy","adaptor","reserve","brewer"])
    if (s[t]) add(t, BITCOST[t][m], "BITCOST." + t);
  s.bill = bill;
  s.upkeep = bill.reduce((a, [,v]) => a + v, 0);
  s.bank   = M.bank * (s.reserve ? RESERVE_BANK : 1)
           * (1 + HUNT_BANK * (s.huntB + s.huntA));
  s.divE   = s.bank * M.divThresh;
  s.remains = s.upkeep * REMAINS_K;
  s.scrubs = s.shield && s.lodging ? 1 : 0;
  s.vault  = s.reserve && s.dormancy && s.shield ? 1 : 0;
  s.spills = s.recycler && s.dietN && s.huntLive ? 1 : 0;
  s.senT   = M.senT * (s.vault ? VAULT_AGE : 1);
  s.divCost = M.divCost * (s.vault ? VAULT_COST : 1);
  s.divP   = M.divChance
           * (s.dormancy ? DORM_DIV : 1)
           * (s.recycler && s.dietN ? RECYCLE_DIV : 1)
           * (s.vault ? VAULT_DIV : 1);
  statCache.set(key, s);
  if (statCache.size > 4096) statCache.delete(statCache.keys().next().value);
  return s;
}

const ADAPT = {
  mode: { p:.00008 },
  diet: { p:.02, mean:1.55, loci:["diet","huntB","huntA"] },
  id:   { p:.022, mean:1.875, field:"id"    },
  tgt:  { p:.018, mean:2.2, field:"tgt"    },
  pool: { p:.017, mean:1.95,
          loci:["shield","dormancy","adaptor","reserve",
                "brewer","brew","recycler","lodging"] },
};
function drawN(rnd, mean) { let n = 1; const q = 1 - 1 / mean; while (rnd() < q && n < 8) n++; return n; }
function flipInField(g0, g1, f, k, rnd) {
  const [, , width] = F[f];
  let v = get(g0, g1, f), tries = 0;
  const done = new Set();
  while (done.size < Math.min(k, width) && tries++ < 40) {
    const b = (rnd() * width) | 0;
    if (done.has(b)) continue;
    done.add(b); v ^= 1 << b;
  }
  return set(g0, g1, f, v);
}
function adapt(g0, g1, rnd) {
  const boost = get(g0, g1, "adaptor") ? ADAPT_BOOST : 1;
  const mIx = (get(g0, g1, "mode") << 1) | get(g0, g1, "type");
  const mBoost = boost * MODES[mIx].mutScale;
  if (rnd() < ADAPT.mode.p * boost)
    [g0, g1] = set(g0, g1, "mode", get(g0, g1, "mode") ^ 1);
  for (const key of ["id", "tgt"]) {
    const m = ADAPT[key];
    if (rnd() < m.p * mBoost)
      [g0, g1] = flipInField(g0, g1, m.field, drawN(rnd, m.mean), rnd);
  }
  for (const key of ["diet", "pool"]) {
    const m = ADAPT[key];
    if (rnd() >= m.p * mBoost) continue;
    const widths = m.loci.map(f => F[f][2]);
    const total = widths.reduce((a, b) => a + b, 0);
    let k = drawN(rnd, m.mean);
    while (k--) {
      let b = (rnd() * total) | 0, li = 0;
      while (b >= widths[li]) b -= widths[li++];
      const f = m.loci[li], v = get(g0, g1, f) ^ (1 << b);
      [g0, g1] = set(g0, g1, f, v);
    }
  }
  return [g0, g1];
}
const CH_RGB = [
  [127,216,232],[180,154,214],[255,143,107],[143,207, 74],
  [242,224, 78],[214,112,143],[ 96,160,255],[240,240,240],
];
const RANGES = [
  [ [[168,226, 84],[ 74,163, 71],[ 12, 74, 44]],
    [[236, 72,104],[158, 30, 56],[ 74,  8, 24]] ],
  [ [[217,220,219],[236,238,234],[251,252,250]],
    [[255,255,255]] ],
  [ [[240,222, 96],[233,138, 44],[150, 72, 16],[ 92, 40, 12]],
    [[190,140, 92],[112, 70, 38],[ 52, 30, 14]] ],
  [ [[240, 88,164],[176,102,214],[104, 42,158],[ 48, 16, 84]],
    [[120,198,240],[ 46,102,190],[ 14, 34, 96]] ],
];
let TINT_BASE  = .28;
let TINT_NET   = .375;
let TINT_BLOOM = .4;
let TINT_SAT  = .1825;
let TINT_TURN = 360;
let TINT_LMAX = .9625;
const lerpStops = (stops, d) => {
  if (stops.length === 1) return stops[0];
  const x = d * (stops.length - 1), i = Math.min(stops.length - 2, x | 0), f = x - i;
  return [0,1,2].map(c => stops[i][c] + (stops[i+1][c] - stops[i][c]) * f);
};
const COLC = new Map();
const PHEN0 = (() => { let m = 0;
  for (const [f, [w, sh, n]] of Object.entries(F))
    if (w === 0 && !f.startsWith("spare"))
      m |= ((n === 32 ? 0xffffffff : (1 << n) - 1) << sh); return m >>> 0; })();
const PHEN1 = (() => { let m = 0;
  for (const [f, [w, sh, n]] of Object.entries(F))
    if (w === 1 && !f.startsWith("spare"))
      m |= ((n === 32 ? 0xffffffff : (1 << n) - 1) << sh); return m >>> 0; })();
function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}
function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => { t = (t + 1) % 1;
    return t < 1/6 ? p + (q - p) * 6 * t
         : t < 1/2 ? q
         : t < 2/3 ? p + (q - p) * (2/3 - t) * 6 : p; };
  return [Math.round(f(h + 1/3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1/3) * 255)];
}
function profileColor(g0, g1) {
  const key = g0 + ":" + g1;
  let c = COLC.get(key); if (c) return c;
  if (COLC.size > 8000) COLC.clear();
  const s = statsOf(g0, g1);
  let hx = ((g0 & PHEN0) ^ 0x9e3779b9) >>> 0;
  hx = Math.imul(hx ^ (g1 & PHEN1), 2654435761) >>> 0;
  const j = (((hx ^ (hx >>> 15)) >>> 0) % 1000 / 1000 - .5) * .44;
  const idN = popcount(s.id);
  let d = .70 + (s.dietN - 2.5) * .26 - (idN - 4) * .09 + j;
  if (s.mode === 1 && !s.hunt) d = (d - .62) * .8 + .40;
  else if (s.mode === 0 && !s.hunt)
    d = Math.pow(Math.max(0, Math.min(1, d)), .72);
  else if (s.mode === 2 && !s.hunt) {
    const t2 = Math.max(0, Math.min(1, d));
    d = .14 + .44 * (t2 * t2 * (3 - 2 * t2));
  }
  d = Math.max(0, Math.min(1, d));
  c = lerpStops(RANGES[s.mode][s.hunt ? 1 : 0], d);
  const acc = (s.mode === 1 && !s.hunt) ? TINT_NET
            : (s.mode === 2 &&  s.hunt) ? TINT_BLOOM : TINT_BASE;
  const tintSat  = (s.mode === 1 && !s.hunt) ? TINT_SAT  : 0;
  const tintTurn = (s.mode === 1 && !s.hunt) ? TINT_TURN : 46;
  if (acc) {
    let hx2 = (s.diet * 2654435761 ^ (s.id + 1) * 40503) >>> 0;
    hx2 = (hx2 ^ (hx2 >>> 13)) >>> 0;
    const u1 = (hx2 % 1024) / 1024,
          u2 = ((hx2 >>> 10) % 1024) / 1024,
          u3 = ((hx2 >>> 20) % 1024) / 1024;
    const [H, S2, L] = rgb2hsl(c[0], c[1], c[2]);
    const hue = (H + (u1 - .5) * 2 * acc * tintTurn + 360) % 360;
    const sat = Math.max(0, Math.min(1,
                  S2 * (1 + (u2 - .35) * .55) + tintSat * (.55 + .9 * u2)));
    const lMax = tintSat ? TINT_LMAX : 1;
    const lig = Math.max(0, Math.min(lMax, L * (1 + (u3 - .5) * .30)));
    c = hsl2rgb(hue, sat, lig);
  }
  COLC.set(key, c); return c;
}
const income = (q, c) => SUB[q].rate * c / (c + SUB[q].K) * SUB[q].yield;
function breakEven(upkeep, q) {
  const top = SUB[q].rate * SUB[q].yield;
  return upkeep >= top ? Infinity : upkeep * SUB[q].K / (top - upkeep);
}
function bootAssert() {
  const fail = m => { throw new Error("boot: " + m); };
  let rs = 12345;
  const rr = () => (rs = (rs * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let t = 0; t < 200; t++) {
    let g0 = (rr() * 4294967296) >>> 0, g1 = (rr() * 4294967296) >>> 0;
    for (const f in F) {
      const [, , w] = F[f], v = ((rr() * (w === 32 ? 4294967296 : (1 << w))) | 0);
      const [a, b] = set(g0, g1, f, v);
      const back = get(a, b, f);
      if (back !== (v & (w === 32 ? -1 : (1 << w) - 1)) >>> 0 && back !== v)
        fail(`round-trip lost ${f}: wrote ${v}, read ${back}`);
      g0 = a; g1 = b;
    }
    const s1 = statsOf(g0, g1); statCache.clear();
    const s2 = statsOf(g0, g1);
    if (s1.upkeep !== s2.upkeep) fail("statsOf is not deterministic");
  }
  const widths = Object.values(F);
  for (const w of [0, 1]) {
    const used = widths.filter(([ww]) => ww === w)
                       .reduce((a, [, s, n]) => a | (((1 << n) - 1 || -1) << s), 0);
    if ((used >>> 0) !== 0xffffffff) fail(`word g${w} has unmapped or overlapping bits`);
  }
  const minUp = Math.min(...MODES.map(m => m.upkeep));
  for (let q = 0; q < NS; q++) {
    const best = Math.min(...BITCOST[ENZ_KEY[q]]);
    const bill = minUp + best;
    const c = breakEven(bill, q);
    if (!(c <= CAP * .6))
      fail(`${SUB[q].name} unworkable even for its best-leaned mode: `
         + `break-even ${c.toFixed(3)} vs cap ${CAP}`);
  }
  const hBill = minUp + LADR.enz
              * (Math.min(...ENZ_KEY.map(k => Math.min(...BITCOST[k])))
                 + Math.min(...BITCOST.kitB));
  const hc = Math.min(...SUB.map((_, q) => breakEven(hBill, q)));
  if (!(hc < CAP)) fail("no hunter build can break even anywhere on the plate");
  for (const [k, row] of Object.entries(BITCOST)) {
    if (!Array.isArray(row) || row.length !== 4)
      fail(`BITCOST.${k} is not a row of four`);
    for (const v of row) if (!(v > 0)) fail(`BITCOST.${k} has a non-positive tile`);
  }
  for (const [k, r] of Object.entries(LADR))
    if (!(r > 1)) fail(`count multiplier ${k} is not rising`);
  for (const m of MODES)
    if (!(Math.max(...BITCOST.enzGlu) < m.upkeep * 2))
      fail(`a specialty tile outweighs ${m.name}'s base twice over`);
  for (const f of FEEDERS) {
    if (f.kind === "seep") {
      if (!(f.rate > 0)) fail("a seep feeder needs a positive rate");
      if (f.rate > .01) fail("seep rate would flood the plate");
    } else if (f.kind === "drop") {
      if (!(f.gapMed > 0 && f.sigma >= 0)) fail("feeder gap distribution is malformed");
      if (!(f.amp > 0 && f.dropR > 0 && f.dropsMin >= 1
            && f.dropsMax >= f.dropsMin))
        fail("drop feeder geometry is malformed");
    } else fail(`feeder ${f.q} has no kind`);
  }
  for (const [k, m] of Object.entries(ADAPT)) {
    if (!(m.p > 0 && m.p < 1)) fail(`ADAPT.${k}.p out of range`);
    if (m.mean !== undefined && !(m.mean >= 1)) fail(`ADAPT.${k}.mean < 1`);
    if (m.field === "type" || (m.loci && m.loci.includes("type")))
      fail(`ADAPT.${k} reaches type — type never adapts`);
  }
  if (!("type" in F)) fail("type locus missing from the layout");
  for (const m of MODES)
    if (!(m.mutScale > 0)) fail(`${m.name}.mutScale is not a multiplier`);
  const wc = [0,0,0,0,0];
  for (let m = 1; m <= 31; m++) {
    const t = RECYCLE_TABLE[m-1];
    if (m === 31) { if (t !== -1) fail("full diet must waste nothing"); continue; }
    if (t < 0 || t > 4 || (m >> t) & 1) fail("RECYCLE_TABLE["+m+"] targets a carried resource");
    wc[t]++;
  }
  if (Math.max(...wc) - Math.min(...wc) > 1) fail("RECYCLE_TABLE is uneven: " + wc);
  if ("type" in ADAPT) fail("ADAPT has a type entry — type never adapts");
  if (!(LATENT_CH >= 0 && LATENT_CH <= 1)) fail("LATENT_CH is not a 0-1 fraction");
  if (!(SPILL_FRAC >= 0 && SPILL_FRAC <= 1)) fail("SPILL_FRAC is not a 0-1 fraction");
  if (!(BASE_RECYCLE_FRAC >= 0 && BASE_RECYCLE_FRAC <= 1)) fail("BASE_RECYCLE_FRAC is not a 0-1 fraction");
  if (!(VAULT_DIV > 0)) fail("VAULT_DIV is not a positive multiplier");
  if (!(VAULT_COST > 0)) fail("VAULT_COST is not a positive multiplier");
  if (!(VAULT_AGE >= 1)) fail("VAULT_AGE below 1 would make the vault shorter-lived");
  for (const [k, v] of Object.entries({ TINT_BASE, TINT_NET, TINT_BLOOM,
                                        TINT_SAT, TINT_LMAX }))
    if (!(v >= 0 && v <= 1)) fail(`${k} is not a 0-1 fraction`);
  if (!(TINT_TURN >= 0 && TINT_TURN <= 360)) fail("TINT_TURN is not a hue sweep in degrees");
}
function mulberry32(a) { return () => {
  a |= 0; a = a + 0x6D2B79F5 | 0;
  let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const kinMask = (word, fields) => fields.reduce((m, f) =>
  F[f][0] === word ? m | (((1 << F[f][2]) - 1) << F[f][1]) : m, 0) >>> 0;
const KIN0 = kinMask(0, ["type", "mode", "diet"]);
const KIN1 = kinMask(1, ["id"]);
function tune(path, value) {
  const parts = String(path).split(".");
  const v = Number(value);
  if (!Number.isFinite(v)) return false;
  if (parts.length === 1) {
    const k = parts[0];
    if (typeof C[k] !== "number") return false;
    try { eval(k + " = " + v); } catch (e) { return false; }
    C[k] = v;
  } else {
    let o = C;
    for (let i = 0; i < parts.length - 1; i++) { o = o[parts[i]]; if (o == null) return false; }
    const leaf = parts[parts.length - 1];
    if (typeof o[leaf] !== "number") return false;
    o[leaf] = v;
  }
  statCache.clear(); COLC.clear();
  return true;
}
const NOT_LEVERS = new Set(["F", "KIN0", "KIN1", "CH_RGB", "CH_NAME", "RANGES", "RECYCLE_TABLE", "ENZ_KEY", "MODE_NAME", "NS"]);
const NOT_LEVER_LEAVES = new Set(["q", "broodSize", "type"]);
function levers() {
  const out = [];
  const walk = (obj, prefix, depth) => {
    for (const k of Object.keys(obj)) {
      if (!prefix && NOT_LEVERS.has(k)) continue;
      if (prefix && NOT_LEVER_LEAVES.has(k)) continue;
      const val = obj[k];
      if (typeof val === "number") out.push([prefix ? prefix + "." + k : k, val]);
      else if (depth < 3 && val && typeof val === "object" && !(val instanceof Uint32Array)
               && typeof val !== "function") {
        if (Array.isArray(val) && val.length && typeof val[0] === "number" && val.length > 8) continue;
        walk(val, prefix ? prefix + "." + k : k, depth + 1);
      }
    }
  };
  walk(C, "", 0);
  return out;
}
const C = { SUB, NS, CAP, BITCOST, ENZ_KEY, LADR, cmult, HUNT_BANK, RESERVE_BANK,
  MOVE_GATE, MOVE_TICKS, HUNT_ROAM, SHARE_EPS, SHARE_PULL, SHARE_KEEP, DORM_SLEEP, WAKE_MARGIN, DORM_UPK, DORM_DIV,
  EMIT_RATE, COMP_DECAY, REMAINS_DECAY, REMAINS_EFF, DOSE_DMG, DIFF_EVERY, DIFF_RATE, DIAG_W, FILA_RUN, FILA_BRANCH, FILA_MAXNB, REACH_EVERY, FEEDERS,
  SHIELD_BLOCK, SHIELD_SOAK, SCRUB_FRAC, VAULT_DIV, VAULT_COST, VAULT_AGE, SPILL_FRAC, ADAPT_BOOST, MODES, MODE_NAME, BATCH_FRAC, AGE_P, REMAINS_K, RECYCLE_TABLE, RECYCLE_FRAC, BASE_RECYCLE_FRAC, RECYCLE_DIV, MASK_POT, BREW_POT, BITE_DMG, BITE_XFER, BITE_XFER_SHIELD, BITE_CD, CH_NAME,
  F, get, set, popcount, statsOf, ADAPT, adapt, profileColor, income, breakEven,
  LATENT_CH,
  TINT_BASE, TINT_NET, TINT_BLOOM, TINT_SAT, TINT_TURN, TINT_LMAX,
  KIN0, KIN1, CH_RGB, mulberry32, bootAssert, tune, levers };

/* Hand C back to the page.  Guarded with typeof because this same line is
   part of the text the worker runs, where the wrapper does not exist. */
if (typeof ENTITY_CORE_SRC !== "undefined") ENTITY_CORE_SRC.C = C;
}

/* Read a wrapped body back as source text. */
function ENTITY_SRC_BODY(fn) {
  const s = String(fn);
  return s.slice(s.indexOf("{") + 1, s.lastIndexOf("}"));
}

/* Run core on the page and publish C, exactly as the inline script did.
   Only C crosses out of core; everything else it declares is used either
   inside core or by the worker body appended after it. */
ENTITY_CORE_SRC();
window.C = ENTITY_CORE_SRC.C;
