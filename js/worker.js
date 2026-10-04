/* ==========================================================================
   ENTITY - WORKER: the life step
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
function ENTITY_WORKER_SRC() {
/* ═══════════════════════════════════════
   ENTITY — WORKER: the life step
   ═══════════════════════════════════════ */
let W = 0, R = 0, tick = 0;
let medium, tmpF;
let emv, emvK, eclaim;
let tocc, tp0, tp1, te, tage;
let tmv, tmvK;
const SLOTS = 8;
let cmask, cconc;
function depositC(tile, mask, amt) {
  if (!mask || amt <= 0) return;
  const b = tile * SLOTS;
  let empty = -1, weak = -1, weakC = Infinity;
  for (let s2 = 0; s2 < SLOTS; s2++) {
    if (cmask[b + s2] === mask) {
      cconc[b + s2] = Math.min(4, cconc[b + s2] + amt); return; }
    if (cconc[b + s2] <= 1e-4) { if (empty < 0) empty = s2; }
    else if (cconc[b + s2] < weakC) { weakC = cconc[b + s2]; weak = s2; }
  }
  if (empty >= 0) { cmask[b + empty] = mask; cconc[b + empty] = Math.min(4, amt); }
  else if (amt > weakC) { cmask[b + weak] = mask; cconc[b + weak] = Math.min(4, amt); }
}
let ep0, ep1, ee, eage, eslp, ecd, edir, occ;
const DIRX = [1, 1, 0, -1, -1, -1, 0, 1], DIRY = [0, 1, 1, 1, 0, -1, -1, -1];
let inside, nbs, nbn, order;
let rnd = C.mulberry32(1);
function idx(x, y) { return y * W + x; }
function makeProfile(type, ci) {
  let g0 = 0, g1 = 0;
  [g0, g1] = C.set(g0, g1, "type", type);
  [g0, g1] = C.set(g0, g1, "mode", rnd() < .5 ? 1 : 0);
  let bestQ = -1, bestI = 1e-6;
  for (let q = 0; q < NS; q++) {
    const inc = C.income(q, medium[ci * NS + q]);
    if (inc > bestI) { bestI = inc; bestQ = q; }
  }
  if (bestQ < 0) bestQ = (rnd() * 4) | 0;
  let diet = 1 << bestQ;
  if (rnd() < .3) diet |= 1 << ((rnd() * NS) | 0);
  [g0, g1] = C.set(g0, g1, "diet", diet);
  [g0, g1] = C.set(g0, g1, "id",
    ((rnd() * 256) | (rnd() * 256) | (rnd() * 256)) & 255);
  [g0, g1] = C.set(g0, g1, "tgt",  255);
  [g0, g1] = C.set(g0, g1, "brew", 255);
  if (rnd() < .25) {
    [g0, g1] = C.set(g0, g1, rnd() < .5 ? "huntB" : "huntA", 1);
    [g0, g1] = C.set(g0, g1, "tgt",
      ((rnd() * 256) & (rnd() * 256)) | (1 << ((rnd() * 8) | 0)));
  }
  for (const t of ["shield","adaptor","reserve"])
    if (rnd() < .1) [g0, g1] = C.set(g0, g1, t, 1);
  if (rnd() < .1) {
    [g0, g1] = C.set(g0, g1, "brewer", 1);
    [g0, g1] = C.set(g0, g1, "brew",
      ((rnd() * 256) & (rnd() * 256)) | (1 << ((rnd() * 8) | 0)));
  }
  if (rnd() < .7) [g0, g1] = C.set(g0, g1, "dormancy", 1);
  [g0, g1] = C.set(g0, g1, "spare0", (rnd() * 16384) | 0);
  [g0, g1] = C.set(g0, g1, "spareK", rnd() < .5 ? 1 : 0);
  [g0, g1] = C.set(g0, g1, "spare1", (rnd() * 256) | 0);
  return [g0, g1];
}
const strokeProfile = new Map();
function applyOps(ops, out) {
  for (const op of ops) {
    if (op.op === "supply") {
      for (const i of op.cells) if (inside[i]) {
        const k = i * NS + op.q;
        medium[k] = Math.min(C.CAP, medium[k] + op.amt);
      }
    } else if (op.op === "brew") {
      for (const i of op.cells) if (inside[i])
        depositC(i, 1 << op.ch, op.amt);
    } else if (op.op === "tune") {
      C.tune(op.path, op.value);
    } else if (op.op === "wipe") {
      for (const i of op.cells) {
        if (occ[i]) { occ[i] = 0; POP--; }
        if (tocc[i]) { tocc[i] = 0; POP--; }
      }
    } else if (op.op === "cull") {
      /* Collecting a variant consumes the entity it was taken from.
         Guarded on the genome: between the probe that filled the
         inspector and this op arriving, the occupant can have died,
         divided or moved, and we must not cull whoever took its place.
         Removed cleanly rather than via die(), which would leave remains
         in the medium and promote a tenant to landlord - the pair is
         archived together, so both go. */
      const i = op.at;
      let n = 0;
      if (i >= 0 && i < W * W && occ[i]
          && ep0[i] === op.g0 && ep1[i] === op.g1) {
        if (tocc[i]) { tocc[i] = 0; POP--; n++; }
        occ[i] = 0; POP--; n++;
      }
      out.culled = (out.culled || 0) + n;
      out.cullMissed = (out.cullMissed || 0) + (n ? 0 : 1);
    } else if (op.op === "streak") {
      let placed = 0;
      for (const i of op.cells) {
        if (!inside[i]) continue;
        if (!strokeProfile.has(op.sid))
          strokeProfile.set(op.sid, makeProfile(op.type, i));
        const [g0, g1] = strokeProfile.get(op.sid);
        spawn(i, g0, g1, C.statsOf(g0, g1).bank * .5);
        placed++;
      }
      out.streak = (out.streak || 0) + placed;
      out.streakType = op.type;
      { const [g0, g1] = strokeProfile.get(op.sid);
        out.streakMode = C.statsOf(g0, g1).mode; }
      if (strokeProfile.size > 64) {
        for (const k of strokeProfile.keys())
          if (k !== op.sid) { strokeProfile.delete(k); break; }
      }
    } else if (op.op === "lift") {
      const got = [], r2 = op.r * op.r;
      const x0 = op.at % W, y0 = (op.at / W) | 0;
      for (let dy = -op.r; dy <= op.r && got.length < op.max; dy++)
        for (let dx = -op.r; dx <= op.r && got.length < op.max; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const x = x0 + dx, y = y0 + dy;
          if (x < 0 || y < 0 || x >= W || y >= W) continue;
          const i = idx(x, y);
          if (!occ[i]) continue;
          const rec = { g0: ep0[i], g1: ep1[i], e: ee[i], age: eage[i], slp: eslp[i] };
          if (tocc[i]) {
            rec.tenant = { g0: tp0[i], g1: tp1[i], e: te[i], age: tage[i] };
            tocc[i] = 0; POP--;
          }
          got.push(rec);
          occ[i] = 0; POP--;
        }
      out.lifted = got;
    } else if (op.op === "drop") {
      let k = 0;
      out.dropRequested = op.orgs.length;
      const x0 = op.at % W, y0 = (op.at / W) | 0;
      for (let r = 0; r <= 12 && k < op.orgs.length; r++)
        for (let dy = -r; dy <= r && k < op.orgs.length; dy++)
          for (let dx = -r; dx <= r && k < op.orgs.length; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const x = x0 + dx, y = y0 + dy;
            if (x < 0 || y < 0 || x >= W || y >= W) continue;
            const i = idx(x, y);
            if (!inside[i] || occ[i]) continue;
            const o = op.orgs[k++];
            spawn(i, o.g0, o.g1, o.e);
            eage[i] = o.age; eslp[i] = o.slp ? 1 : 0;
            if (o.tenant && lodge(i, o.tenant.g0, o.tenant.g1, o.tenant.e))
              tage[i] = o.tenant.age;
          }
      out.dropped = k;
    }
  }
}
function reset(msg) {
  W = msg.W; R = W / 2; tick = 0;
  rnd = C.mulberry32(msg.seed || 1);
  const N = W * W;
  medium = new Float32Array(N * NS);
  cmask = new Uint8Array(N * SLOTS); cconc = new Float32Array(N * SLOTS);
  tmpF = new Float32Array(N);
  POP = 0;
  nextDrip = C.FEEDERS.map(F => Math.round(rnd() * F.gapMed * (84 * 84) / (W * W)));
  ep0 = new Uint32Array(N); ep1 = new Uint32Array(N);
  ee = new Float32Array(N); eage = new Uint32Array(N);
  eslp = new Uint8Array(N); ecd = new Uint8Array(N); edir = new Uint8Array(N);
  emv = new Int32Array(N); emvK = new Uint8Array(N); eclaim = new Uint8Array(N);
  tocc = new Uint8Array(N); tp0 = new Uint32Array(N); tp1 = new Uint32Array(N);
  te = new Float32Array(N); tage = new Uint32Array(N);
  tmv = new Int32Array(N); tmvK = new Uint8Array(N);
  occ = new Uint8Array(N);
  inside = new Uint8Array(N);
  nbs = new Int32Array(N * 8); nbn = new Uint8Array(N);
  order = new Uint32Array(N);
  for (let i = 0; i < N; i++) order[i] = i;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y), dx = x - R + .5, dy = y - R + .5;
    inside[i] = dx * dx + dy * dy <= R * R * .92 ? 1 : 0;
  }
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y); let n = 0;
    if (!inside[i]) continue;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oy) continue;
      const nx = x + ox, ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
      const j = idx(nx, ny);
      if (inside[j]) nbs[i * 8 + n++] = j;
    }
    nbn[i] = n;
  }
  {
    const lattice = (gw) => {
      const g = new Float32Array((gw + 2) * (gw + 2));
      for (let k = 0; k < g.length; k++) g[k] = rnd();
      return (fx, fy) => {
        const px = fx * gw, py = fy * gw;
        const x0 = px | 0, y0 = py | 0;
        const tx = px - x0, ty = py - y0;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const at = (a, b) => g[(b % (gw + 2)) * (gw + 2) + (a % (gw + 2))];
        const a = at(x0, y0), b = at(x0 + 1, y0),
              c2 = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
        return (a + (b - a) * sx) + ((c2 + (d - c2) * sx) - (a + (b - a) * sx)) * sy;
      };
    };
    for (let q = 0; q < NS; q++) {
      const o1 = lattice(3), o2 = lattice(6), o3 = lattice(12);
      const gain = (q === 0 || q === 2) ? 2.4
                 : (q === 1 || q === 3) ? .45 : 1;
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
        const i = idx(x, y);
        if (!inside[i]) continue;
        const fx = x / W, fy = y / W;
        let v = o1(fx, fy) * .62 + o2(fx, fy) * .26 + o3(fx, fy) * .12;
        v = Math.pow(Math.max(0, v * 1.35 - .52), 2.1) * 2.6 * gain;
        if (v > .004) medium[i * NS + q] = Math.min(C.CAP, medium[i * NS + q] + v);
      }
    }
  }
  const nF = msg.seedN ?? 5;
  for (let f = 0; f < nF; f++) {
    const cx = (R + (rnd() - .5) * W * .6) | 0, cy = (R + (rnd() - .5) * W * .6) | 0;
    const ci = idx(cx, cy);
    const [g0, g1] = makeProfile(rnd() < .5 ? 0 : 1, ci);
    const s = C.statsOf(g0, g1);
    const size = 5 + (rnd() * 5) | 0;
    let placed = 0, tries = 0;
    while (placed < size && tries++ < 60) {
      const x = cx + ((rnd() * 5) | 0) - 2, y = cy + ((rnd() * 5) | 0) - 2;
      if (x < 0 || y < 0 || x >= W || y >= W) continue;
      const i = idx(x, y);
      if (!inside[i] || occ[i]) continue;
      spawn(i, g0, g1, s.bank * .6);
      placed++;
    }
  }
}
let POP = 0;
let nextDrip = [];
function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = rnd(); while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function sampleGap(F) {
  const scale = (84 * 84) / (W * W);
  return Math.max(1, Math.round(F.gapMed * scale * Math.exp(F.sigma * gauss())));
}
function spawn(i, g0, g1, e) {
  if (!occ[i]) POP++;
  if (tocc && tocc[i]) { tocc[i] = 0; POP--; }
  if (emv && emv[i]) { eclaim[emv[i] - 1] = 0; }
  emv[i] = 0; emvK[i] = 0;
  occ[i] = 1; ep0[i] = g0; ep1[i] = g1;
  ee[i] = e; eage[i] = 0; eslp[i] = 0; ecd[i] = 0;
  edir[i] = (rnd() * 8) | 0;
}
function canHost(j, type) {
  if (!occ[j] || tocc[j] || eclaim[j]) return false;
  const hs = C.statsOf(ep0[j], ep1[j]);
  return hs.lodging && hs.type !== type;
}
function lodge(j, g0, g1, e) {
  if (C.statsOf(g0, g1).hunt) return false;
  tocc[j] = 1; tp0[j] = g0; tp1[j] = g1; te[j] = e; tage[j] = 0; POP++;
  return true;
}
function tenantDie(j, remainsE) {
  if (tmv && tmv[j]) { eclaim[tmv[j] - 1] = 0; tmv[j] = 0; tmvK[j] = 0; }
  if (remainsE > 0) {
    const q = j * NS + 4;
    medium[q] = Math.min(C.CAP, medium[q] + remainsE / C.SUB[4].yield);
  }
  tocc[j] = 0; POP--;
}
function die(i, remainsE) {
  if (emv && emv[i]) { eclaim[emv[i] - 1] = 0; emv[i] = 0; emvK[i] = 0; }
  if (tocc && tocc[i]) {
    if (remainsE > 0) {
      const q = i * NS + 4;
      medium[q] = Math.min(C.CAP, medium[q] + remainsE / C.SUB[4].yield);
    }
    ep0[i] = tp0[i]; ep1[i] = tp1[i]; ee[i] = te[i]; eage[i] = tage[i];
    eslp[i] = 0; ecd[i] = 0; edir[i] = (rnd() * 8) | 0; tocc[i] = 0;
    POP--;
    return;
  }
  if (remainsE > 0) {
    const q = i * NS + 4;
    medium[q] = Math.min(C.CAP, medium[q] + remainsE / C.SUB[4].yield);
  }
  if (occ[i]) POP--;
  occ[i] = 0;
}
function scavengeAt(eater, tile, s, rateMul, bankTo) {
  rateMul = rateMul || 1;
  const bank = bankTo || (v => { ee[eater] = Math.min(s.bank, ee[eater] + v); });
  const wt = s.recycler && s.dietN ? C.RECYCLE_TABLE[s.diet - 1] : -1;
  for (let q = 0; q < NS; q++) if (s.diet & (1 << q)) {
    const a = tile * NS + q, c = medium[a];
    if (c <= 0) continue;
    const g = Math.min(c, C.SUB[q].rate * rateMul * c / (c + C.SUB[q].K));
    medium[a] = c - g;
    bank(g * C.SUB[q].yield);
    let tgt = -1, rate = 0;
    if (wt >= 0) { tgt = wt; rate = C.RECYCLE_FRAC; }
    else if (q === 3 && !(s.diet & 1)) { tgt = 0; rate = C.BASE_RECYCLE_FRAC; }
    if (tgt >= 0) {
      const t = tile * NS + tgt;
      medium[t] = Math.min(C.CAP, medium[t] + g * rate * C.SUB[q].yield / C.SUB[tgt].yield);
    }
  }
}
function scrubCell(i, frac) {
  const b = i * SLOTS, keep = 1 - frac;
  for (let s2 = 0; s2 < SLOTS; s2++) {
    const c = cconc[b + s2];
    if (c <= 0) continue;
    const v = c * keep;
    if (v <= 1e-4) { cconc[b + s2] = 0; cmask[b + s2] = 0; }
    else cconc[b + s2] = v;
  }
}
function emitRing(i, mask, amt) {
  const q = amt / 4, x = i % W, y = (i / W) | 0;
  if (x > 0     && inside[i - 1]) depositC(i - 1, mask, q);
  if (x < W - 1 && inside[i + 1]) depositC(i + 1, mask, q);
  if (y > 0     && inside[i - W]) depositC(i - W, mask, q);
  if (y < W - 1 && inside[i + W]) depositC(i + W, mask, q);
}
const diagStep = (i, j) => { const d = j - i;
  return d !== 1 && d !== -1 && d !== W && d !== -W; };
const transitTicks = (i, j) =>
  Math.max(1, Math.round(C.MOVE_TICKS * (diagStep(i, j) ? Math.SQRT2 : 1)));
const nbCand = new Int32Array(8), nbWt = new Float64Array(8);
function richness(i, diet) {
  let r = 0;
  for (let q = 0; q < NS; q++) if (diet & (1 << q))
    r += C.income(q, medium[i * NS + q]);
  return r;
}
function stepOnce() {
  tick++;
  for (let fi = 0; fi < C.FEEDERS.length; fi++) {
    const F = C.FEEDERS[fi];
    if (F.kind === "seep") {
      const amt = F.rate;
      for (let j = 0; j < W * W; j++) if (inside[j]) {
        const a = j * NS + F.q;
        if (medium[a] < C.CAP) medium[a] = Math.min(C.CAP, medium[a] + amt);
      }
      continue;
    }
    if (tick < nextDrip[fi]) continue;
    nextDrip[fi] = tick + sampleGap(F);
    const nDrops = F.dropsMin
      + ((Math.pow(rnd(), 1.5) * (F.dropsMax - F.dropsMin + 1)) | 0);
    for (let d = 0; d < nDrops; d++) {
      let ci = 0, t = 0;
      do { ci = (rnd() * W * W) | 0; } while (!inside[ci] && ++t < 20);
      if (!inside[ci]) continue;
      const f = F.dropFloor + F.dropSpread * Math.pow(rnd(), F.dropPow);
      const rad = F.dropR * (.7 + .6 * f), r2 = rad * rad,
            lo = Math.ceil(rad * 1.8), peak = F.amp * f;
      const x0 = ci % W, y0 = (ci / W) | 0;
      for (let oy = -lo; oy <= lo; oy++) for (let ox = -lo; ox <= lo; ox++) {
        const x = x0 + ox, y = y0 + oy;
        if (x < 0 || y < 0 || x >= W || y >= W) continue;
        const j = idx(x, y);
        if (!inside[j]) continue;
        const d2 = ox * ox + oy * oy;
        if (d2 > r2 * 3.24) continue;
        medium[j * NS + F.q] = Math.min(C.CAP,
          medium[j * NS + F.q] + peak * Math.exp(-d2 / r2));
      }
    }
  }
  for (let k = 0; k < cconc.length; k++) if (cconc[k] > 0) {
    cconc[k] *= C.COMP_DECAY;
    if (cconc[k] <= 1e-4) { cconc[k] = 0; cmask[k] = 0; }
  }
  for (let i = order.length - 1; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0, t = order[i]; order[i] = order[j]; order[j] = t;
  }
  for (let oi = 0; oi < order.length; oi++) {
    const i = order[oi];
    if (!occ[i]) continue;
    const s = C.statsOf(ep0[i], ep1[i]);
    const eStart = ee[i];
    const asleep = eslp[i];
    let moving = emv[i] !== 0;
    if (moving && --emvK[i] === 0) {
      const j = emv[i] - 1;
      eclaim[j] = 0; emv[i] = 0; moving = false;
      if (occ[j] && canHost(j, C.statsOf(ep0[i], ep1[i]).type)
          && lodge(j, ep0[i], ep1[i], ee[i])) {
        occ[i] = 0; POP--;
        continue;
      }
      if (!occ[j]) {
        ep0[j] = ep0[i]; ep1[j] = ep1[i];
        ee[j] = ee[i]; eage[j] = eage[i]; eslp[j] = 0;
        ecd[j] = ecd[i]; edir[j] = edir[i];
        emv[j] = 0; emvK[j] = 0;
        occ[j] = 1; occ[i] = 0;
        continue;
      }
    }
    let ate = false;
    if (ecd[i]) ecd[i]--;
    if (s.hunt && !asleep && !moving && !ecd[i]) {
      const n = nbn[i], start = (rnd() * n) | 0;
      for (let k = 0; k < n; k++) {
        const j = nbs[i * 8 + ((start + k) % n)];
        if (!occ[j]) continue;
        if ((ep0[j] & C.KIN0) === (ep0[i] & C.KIN0)
         && (ep1[j] & C.KIN1) === (ep1[i] & C.KIN1)) continue;
        const p = C.statsOf(ep0[j], ep1[j]);
        if (!(p.type ? s.huntA : s.huntB)) continue;
        if (!s.huntLive || (s.tgt & ~p.id)) continue;
        if (p.shield && rnd() < C.SHIELD_BLOCK) break;
        const drain = Math.min(ee[j],
          C.BITE_DMG * (1 + C.MASK_POT * (s.tgtN - 1)));
        ee[j] -= drain;
        const xf = p.shield ? C.BITE_XFER_SHIELD : C.BITE_XFER;
        ee[i] = Math.min(s.bank, ee[i] + drain * xf);
        if (s.spills) {
          const spillE = drain * (1 - xf) * C.SPILL_FRAC;
          if (spillE > 0) {
            const nq = j * NS + 4;
            medium[nq] = Math.min(C.CAP, medium[nq] + spillE / C.SUB[4].yield);
          }
        }
        if (ee[j] <= 0) die(j, p.upkeep * C.REMAINS_K);
        ecd[i] = C.BITE_CD;
        ate = true;
        break;
      }
    }
    const hosting = tocc[i] === 1;
    if (!ate && !asleep && !moving && s.diet) {
      scavengeAt(i, i, s, hosting ? .5 : 1);
      if ((tick + i) % C.REACH_EVERY === 0) {
        const x = i % W, y = (i / W) | 0;
        if (x > 0)     { const j = i - 1; if (inside[j] && !occ[j]) scavengeAt(i, j, s); }
        if (x < W - 1) { const j = i + 1; if (inside[j] && !occ[j]) scavengeAt(i, j, s); }
        if (y > 0)     { const j = i - W; if (inside[j] && !occ[j]) scavengeAt(i, j, s); }
        if (y < W - 1) { const j = i + W; if (inside[j] && !occ[j]) scavengeAt(i, j, s); }
      }
    }
    if (s.brewLive && !asleep && !moving)
      emitRing(i, s.brew, C.EMIT_RATE);
    {
      if (s.scrubs) scrubCell(i, C.SCRUB_FRAC);
      let dmg = 0;
      const b = i * SLOTS;
      for (let s2 = 0; s2 < SLOTS; s2++) {
        const c = cconc[b + s2], m = cmask[b + s2];
        if (c <= 0 || !m) continue;
        if (m & ~s.id) continue;
        if (s.brewer && s.brew === m) continue;
        dmg += c * C.DOSE_DMG * (1 + C.BREW_POT * (C.popcount(m) - 1));
      }
      if (dmg) ee[i] -= s.shield ? dmg * C.SHIELD_SOAK : dmg;
    }
    const bill = (s.upkeep - (ecd[i] && s.gear ? s.gear : 0))
               * (hosting ? .5 : 1);
    ee[i] -= bill * (asleep ? C.DORM_UPK : 1);
    eage[i]++;
    if (ee[i] <= 0) { die(i, s.remains); continue; }
    if (rnd() < (eage[i] / s.senT) ** C.AGE_P / s.senT) { die(i, s.remains); continue; }
    if (s.dormancy) {
      if (!asleep && ee[i] < C.DORM_SLEEP * s.divE
          && richness(i, s.diet) < s.upkeep) eslp[i] = 1;
      else if (asleep && richness(i, s.diet) >= C.WAKE_MARGIN * s.upkeep) eslp[i] = 0;
    }
    if (eslp[i]) continue;
    const M = C.MODES[s.mode];
    if (moving) {}
    else if (ee[i] >= s.divE && rnd() < s.divP) {
      let cg0 = 0, cg1 = 0, rolled = false, share = 0;
      const child = j => {
        if (!rolled) {
          [cg0, cg1] = C.adapt(ep0[i], ep1[i], rnd); rolled = true;
          ee[i] -= s.divCost;
          share = ee[i] * C.BATCH_FRAC / M.broodSize;
        }
        if (j < 0) { if (!lodge(~j, cg0, cg1, share)) return; }
        else spawn(j, cg0, cg1, share);
        ee[i] -= share;
      };
      const freeNb = () => {
        const n = nbn[i];
        let nf = 0, tot = 0, host = -1;
        for (let k = 0; k < n; k++) {
          const j = nbs[i * 8 + k];
          if (occ[j] || eclaim[j]) {
            if (host < 0 && canHost(j, s.type)) host = j;
            continue;
          }
          const w = diagStep(i, j) ? C.DIAG_W : 1;
          nbCand[nf] = j; nbWt[nf] = w; tot += w; nf++;
        }
        if (nf) {
          let r = rnd() * tot;
          for (let k = 0; k < nf; k++) { r -= nbWt[k]; if (r <= 0) return nbCand[k]; }
          return nbCand[nf - 1];
        }
        return host >= 0 ? ~host : -1;
      };
      if (s.mode === 0) {
        const j = freeNb(); if (j !== -1) child(j);
      } else if (s.mode === 1) {
        let kinN = 0, wSum = 0, myOpen = 1;
        const kin = [], kw = [];
        for (let k = 0; k < nbn[i]; k++) {
          const j = nbs[i * 8 + k];
          if (!occ[j]) { if (!eclaim[j]) myOpen++; continue; }
          if ((ep0[j] & C.KIN0) !== (ep0[i] & C.KIN0)
           || (ep1[j] & C.KIN1) !== (ep1[i] & C.KIN1)) continue;
          let o = 1;
          for (let m2 = 0; m2 < nbn[j]; m2++) { const n2 = nbs[j * 8 + m2];
            if (!occ[n2] && !eclaim[n2]) o++; }
          const wv = Math.pow(o, C.SHARE_PULL);
          kin[kinN] = j; kw[kinN] = wv; kinN++; wSum += wv;
        }
        const tryShare = () => {
          if (!kinN || rnd() >= kinN / nbn[i]) return false;
          let pick = rnd() * wSum, j = kin[kinN - 1];
          for (let k = 0; k < kinN; k++) {
            pick -= kw[k];
            if (pick <= 0) { j = kin[k]; break; }
          }
          const keep = myOpen > 1 ? C.SHARE_KEEP : 0;
          const t = (ee[i] - ee[j]) / 2 * (1 - keep);
          if (Math.abs(t) <= C.SHARE_EPS) return false;
          if (t > 0) {
            const give = Math.min(t, C.statsOf(ep0[j], ep1[j]).bank - ee[j]);
            if (give > 0) { ee[i] -= give; ee[j] += give; return true; }
          } else {
            const take = Math.min(-t, s.bank - ee[i]);
            if (take > 0) { ee[i] += take; ee[j] -= take; return true; }
          }
          return false;
        };
        if (tryShare()) {
        } else {
          const grow = k => {
            const x = (i % W) + DIRX[k], y = ((i / W) | 0) + DIRY[k];
            if (x < 0 || y < 0 || x >= W || y >= W) return false;
            const j = idx(x, y);
            if (!inside[j]) return false;
            if (occ[j] || eclaim[j]) {
              if (canHost(j, s.type)) {
                let cg = C.adapt(ep0[i], ep1[i], rnd);
                const share = (ee[i] - s.divCost) * C.BATCH_FRAC;
                if (!lodge(j, cg[0], cg[1], share)) return false;
                ee[i] -= s.divCost + share;
                return true;
              }
              return false;
            }
            let o = 0;
            for (let m = 0; m < nbn[j]; m++) if (occ[nbs[j * 8 + m]]) o++;
            if (o > C.FILA_MAXNB) return false;
            child(j); edir[j] = k; return true;
          };
          const h = edir[i] & 7;
          let grew = false;
          if (edir[i] < 8) {
            const fwd = rnd() < C.FILA_RUN ? h
                      : (h + (rnd() < .5 ? 1 : 7)) % 8;
            grew = grow(fwd) || grow(h);
            edir[i] = h | 8;
          } else if (rnd() < C.FILA_BRANCH) {
            grew = grow((h + (rnd() < .5 ? 2 : 6)) % 8);
          }
          if (!grew && edir[i] >= 8) tryShare();
        }
      } else if (s.mode === 2) {
        const a = freeNb();
        if (a < 0 && a !== -1) { child(a); }
        else if (a >= 0) {
          child(a);
          const litter = [a];
          for (let extra = M.broodSize - 1; extra > 0; extra--) {
            let optN = 0; const opt = [];
            for (let li = 0; li < litter.length; li++) {
              const c = litter[li];
              for (let k = 0; k < nbn[c]; k++) {
                const j = nbs[c * 8 + k];
                if (occ[j] || eclaim[j] || !inside[j]) continue;
                let dup = false;
                for (let m2 = 0; m2 < optN; m2++) if (opt[m2] === j) { dup = true; break; }
                if (!dup) opt[optN++] = j;
              }
            }
            if (!optN) break;
            const j = opt[(rnd() * optN) | 0];
            child(j); litter.push(j);
          }
        }
      } else {
        for (let t = 0; t < 3; t++) {
          const ang = rnd() * Math.PI * 2, d = 4 + rnd() * 4;
          const x = ((i % W) + Math.cos(ang) * d) | 0,
                y = (((i / W) | 0) + Math.sin(ang) * d) | 0;
          if (x < 0 || y < 0 || x >= W || y >= W) continue;
          const j = idx(x, y);
          if (!inside[j]) continue;
          if (occ[j] || eclaim[j]) {
            if (canHost(j, s.type)) { child(~j); break; }
            continue;
          }
          child(j); break;
        }
      }
    } else if (s.mode === 0 && !ate && !ecd[i]) {
      const here = richness(i, s.diet);
      const enterable = j => !s.hunt && canHost(j, s.type);
      let best = -1, bestG = C.MOVE_GATE;
      const nn = nbn[i], st = (rnd() * nn) | 0;
      const prowl = s.hunt && rnd() < C.HUNT_ROAM;
      const randomStep = () => {
        let cand = 0, pick = -1;
        for (let k = 0; k < nn; k++) {
          const j = nbs[i * 8 + ((st + k) % nn)];
          if ((occ[j] || eclaim[j]) && !enterable(j)) continue;
          if (rnd() < 1 / ++cand) pick = j;
        }
        return pick;
      };
      for (let k = 0; k < nn; k++) {
        const j = nbs[i * 8 + ((st + k) % nn)];
        if ((occ[j] || eclaim[j]) && !enterable(j)) continue;
        const g = (richness(j, s.diet) - here) / (diagStep(i, j) ? Math.SQRT2 : 1);
        if (g > bestG) { bestG = g; best = j; }
      }
      if (best < 0 && ee[i] < eStart && !ecd[i]) {
        let hr = -Infinity, ties = 0;
        const n = nbn[i], start = (rnd() * n) | 0;
        for (let k = 0; k < n; k++) {
          const j = nbs[i * 8 + ((start + k) % n)];
          if ((occ[j] || eclaim[j]) && !enterable(j)) continue;
          const g = (richness(j, s.diet) - here) / (diagStep(i, j) ? Math.SQRT2 : 1);
          if (g > hr + 1e-12) { hr = g; best = j; ties = 1; }
          else if (g > hr - 1e-12 && rnd() < 1 / ++ties) best = j;
        }
      }
      if (best >= 0 && prowl) best = randomStep();
      if (best >= 0) {
        eclaim[best] = 1;
        emv[i] = best + 1; emvK[i] = transitTicks(i, best);
      }
    }
  }
  for (let oi = 0; oi < order.length; oi++) {
    const i = order[oi];
    if (!tocc[i]) continue;
    const s = C.statsOf(tp0[i], tp1[i]);
    const teStart = te[i];
    let tMoving = tmv[i] !== 0;
    if (tMoving && --tmvK[i] === 0) {
      const j = tmv[i] - 1;
      eclaim[j] = 0; tmv[i] = 0; tMoving = false;
      if (!occ[j]) {
        spawn(j, tp0[i], tp1[i], te[i]);
        eage[j] = tage[i];
        tocc[i] = 0; POP--;
        continue;
      }
    }
    if (!tMoving && s.diet)
      scavengeAt(i, i, s, .5, v => { te[i] = Math.min(s.bank, te[i] + v); });
    {
      if (s.scrubs) scrubCell(i, C.SCRUB_FRAC);
      let dmg = 0;
      const b = i * SLOTS;
      for (let s2 = 0; s2 < SLOTS; s2++) {
        const c = cconc[b + s2], m = cmask[b + s2];
        if (c <= 0 || !m) continue;
        if (m & ~s.id) continue;
        if (s.brewer && s.brew === m) continue;
        dmg += c * C.DOSE_DMG * (1 + C.BREW_POT * (C.popcount(m) - 1));
      }
      if (dmg) te[i] -= s.shield ? dmg * C.SHIELD_SOAK : dmg;
    }
    if (s.brewLive)
      emitRing(i, s.brew, C.EMIT_RATE * .5);
    te[i] -= s.upkeep * .5;
    tage[i]++;
    if (te[i] <= 0) { tenantDie(i, s.remains); continue; }
    if (rnd() < (tage[i] / s.senT) ** C.AGE_P / s.senT) { tenantDie(i, s.remains); continue; }
    if (!tMoving && s.mode === 0) {
      const here = richness(i, s.diet) * .5;
      let best = -1, bestG = C.MOVE_GATE;
      const nn = nbn[i], st = (rnd() * nn) | 0;
      for (let k = 0; k < nn; k++) {
        const j = nbs[i * 8 + ((st + k) % nn)];
        if (occ[j] || eclaim[j] || tocc[j]) continue;
        const g = (richness(j, s.diet) - here) / (diagStep(i, j) ? Math.SQRT2 : 1);
        if (g > bestG) { bestG = g; best = j; }
      }
      if (best < 0 && te[i] < teStart) {
        let hr = -Infinity, ties = 0;
        const n = nbn[i], start = (rnd() * n) | 0;
        for (let k = 0; k < n; k++) {
          const j = nbs[i * 8 + ((start + k) % n)];
          if (occ[j] || eclaim[j] || tocc[j]) continue;
          const g = (richness(j, s.diet) - here) / (diagStep(i, j) ? Math.SQRT2 : 1);
          if (g > hr + 1e-12) { hr = g; best = j; ties = 1; }
          else if (g > hr - 1e-12 && rnd() < 1 / ++ties) best = j;
        }
      }
      if (best >= 0) { eclaim[best] = 1; tmv[i] = best + 1;
        tmvK[i] = transitTicks(i, best); continue; }
    }
    if (tMoving) continue;
    if (te[i] >= s.divE && rnd() < s.divP) {
      const n = nbn[i], start = (rnd() * n) | 0;
      for (let k = 0; k < n; k++) {
        const j = nbs[i * 8 + ((start + k) % n)];
        if (occ[j] || eclaim[j] || tocc[j]) continue;
        const [c0, c1] = C.adapt(tp0[i], tp1[i], rnd);
        const GM = C.MODES[s.mode];
        te[i] -= s.divCost;
        const share = te[i] * C.BATCH_FRAC / GM.broodSize;
        spawn(j, c0, c1, share); te[i] -= share;
        break;
      }
    }
  }
  if (tick % C.DIFF_EVERY === 0) {
    {
      const f = C.REMAINS_DECAY * C.DIFF_EVERY;
      const cv = C.SUB[4].yield * C.REMAINS_EFF / C.SUB[2].yield;
      for (let i = 0; i < W * W; i++) {
        const a = i * NS + 4, c = medium[a];
        if (c <= 1e-5) continue;
        const d = c * f;
        medium[a] = c - d;
        medium[i * NS + 2] = Math.min(C.CAP, medium[i * NS + 2] + d * cv);
      }
    }
    for (let q = 0; q < NS; q++) {
      const rate = C.DIFF_RATE * (1 - C.SUB[q].polymer);
      if (rate <= 0) continue;
      diffuse(medium, NS, q, rate);
    }
    for (let i = 0; i < W * W; i++) {
      if (!inside[i]) continue;
      const b = i * SLOTS, x = i % W, y = (i / W) | 0;
      for (let s2 = 0; s2 < SLOTS; s2++) {
        const c = cconc[b + s2];
        if (c <= 1e-4) continue;
        const out = c * C.DIFF_RATE, share = out / 4;
        let sent = 0;
        if (x > 0     && inside[i - 1]) { depositC(i - 1, cmask[b + s2], share); sent += share; }
        if (x < W - 1 && inside[i + 1]) { depositC(i + 1, cmask[b + s2], share); sent += share; }
        if (y > 0     && inside[i - W]) { depositC(i - W, cmask[b + s2], share); sent += share; }
        if (y < W - 1 && inside[i + W]) { depositC(i + W, cmask[b + s2], share); sent += share; }
        cconc[b + s2] = c - sent;
      }
    }
  }
}
function diffuse(field, stride, q, rate) {
  const N = W * W;
  for (let i = 0; i < N; i++) tmpF[i] = field[i * stride + q];
  for (let i = 0; i < N; i++) {
    if (!inside[i]) continue;
    const n = nbn[i];
    if (!n) continue;
    let avg = 0;
    for (let k = 0; k < n; k++) avg += tmpF[nbs[i * 8 + k]];
    avg /= n;
    field[i * stride + q] += rate * (avg - tmpF[i]);
  }
}
const AGAR_W = [
  [17, 15,  9],
  [15, 10,  8],
  [12,  5, 14],
  [ 4,  8, 11],
  [ 8,  7, 20],
];
const AGAR_BASE = [6, 14, 17];
const AGAR_TOT_B = 5;
function frame() {
  const px = new Uint8ClampedArray(W * W * 4);
  for (let i = 0; i < W * W; i++) {
    if (!inside[i]) { px.set([7, 10, 11, 255], i * 4); continue; }
    let cr = AGAR_BASE[0], cg = AGAR_BASE[1], cb = AGAR_BASE[2], tot = 0;
    for (let q = 0; q < NS; q++) {
      const c = medium[i * NS + q];
      if (c < .004) continue;
      const v = c > C.CAP ? C.CAP : c, t = AGAR_W[q];
      tot += v; cr += t[0] * v; cg += t[1] * v; cb += t[2] * v;
    }
    cb += tot * AGAR_TOT_B;
    let cc = 0;
    for (let s2 = 0; s2 < SLOTS; s2++) cc += cconc[i * SLOTS + s2];
    if (cc > .02) {
      const v = Math.min(1, cc / 3) * .5;
      cr += (150 - cr) * v; cg += (110 - cg) * v; cb += (190 - cb) * v;
    }
    if (occ[i]) {
      let col = C.profileColor(ep0[i], ep1[i]);
      if (tocc[i]) {
        const gc = C.profileColor(tp0[i], tp1[i]);
        col = [0,1,2].map(k => col[k] * .6 + gc[k] * .4);
      }
      const s = C.statsOf(ep0[i], ep1[i]);
      const t = Math.min(1, ee[i] / s.divE);
      const KN = .18;
      const a = t >= KN ? .93 + .07 * (t - KN) / (1 - KN)
                        : .18 + .75 * Math.pow(t / KN, 1.5);
      cr += (col[0] - cr) * a; cg += (col[1] - cg) * a; cb += (col[2] - cb) * a;
    }
    px[i * 4] = cr; px[i * 4 + 1] = cg; px[i * 4 + 2] = cb; px[i * 4 + 3] = 255;
  }
  return px;
}
function probeAt(i) {
  if (i == null || i < 0 || i >= W * W) return null;
  const a = Array.from({ length: NS }, (_, q) => medium[i * NS + q]);
  return { x: i % W, y: (i / W) | 0, medium: a,
           entity: occ[i] ? { g0: ep0[i], g1: ep1[i], e: ee[i],
                              age: eage[i], asleep: !!eslp[i],
                              tenant: tocc[i] ? { g0: tp0[i], g1: tp1[i],
                                e: te[i], age: tage[i] } : null } : null };
}
onmessage = e => {
  const m = e.data;
  const out = { id: m.id };
  if (m.t === "reset") reset(m);
  else {
    if (m.ops && m.ops.length) applyOps(m.ops, out);
    if (m.t === "step") for (let k = 0; k < m.n; k++) stepOnce();
  }
  let pop = 0;
  if (occ) for (let i = 0; i < occ.length; i++) pop += occ[i] + tocc[i];
  out.tick = tick; out.pop = pop; out.probe = probeAt(m.probe);
  if (m.draw && W) {
    const px = frame();
    out.rgba = px.buffer;
    postMessage(out, [px.buffer]);
  } else postMessage(out);
};
}
