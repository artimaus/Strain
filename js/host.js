/* ════════════════════════════════════════════════════════════════
   ENTITY — HOST
   ════════════════════════════════════════════════════════════════ */
(() => {
"use strict";
const { $, hotkey } = window.UI;
let bootFailed = false;
try { C.bootAssert(); }
catch (e) {
  bootFailed = true;
  console.error(e);
  $("hint").textContent = e.message;
  $("hint").style.color = "#ff5f56";
}
const TOOLS = [
  { id:"supply", label:"Supply", menu:true,
    hint:"Click or drag to add a resource to the medium." },
  { id:"brew",   label:"Brew",   menu:true,
    hint:"A hard pulse of one brew. Dosing is yours — entities produce brew only via the brewer trait." },
  { id:"streak", label:"Streak", menu:true,
    hint:"Drag to streak one fresh profile of the chosen type — Type B comes as Swarm or Bloom, Type A as Network or Shower, drawn at random per stroke." },
  { id:"wipe",   label:"Wipe",
    hint:"Clears what it touches. Leaves no remains." },
  { id:"transfer", label:"Transfer",
    hint:"Click to lift entities, click any plate to set them down. The only bridge between plates." },
  { id:"inspect", label:"Inspect",
    hint:"Hover to read a tile. Click an entity to open its profile." },
];
const KING = [{ name:"Type B", col:"#e8a04a" }, { name:"Type A", col:"#7fd8e8" }];
const MENUS = {
  supply: C.SUB,
  brew: C.CH_NAME.map((n, q) => ({ name: "Brew-" + n,
    col: "rgb(" + C.CH_RGB[q].join(",") + ")" })),
  streak: KING,
};
let tool = "inspect", pick = { supply: 0, brew: 0, streak: 0 };
let placing = null;
const toolBtns = {};
for (const t of TOOLS) {
  const b = document.createElement("button");
  b.innerHTML = t.label
    + (t.menu ? ` <em>${MENUS[t.id][pick[t.id]].name} ▾</em>` : '');
  b.onclick = () => selectTool(t.id, b);
  $("tools").appendChild(b);
  toolBtns[t.id] = b;
}
function selectTool(id, btn) {
  const t = TOOLS.find(x => x.id === id);
  const reopen = t.menu && tool === id;
  tool = id;
  cancelPlacement();
  for (const k in toolBtns) toolBtns[k].classList.toggle("on", k === id);
  if (!bootFailed) $("hint").textContent = t.hint;
  pop.classList.remove("open");
  if (t.menu && (reopen || !(id in pick))) openMenu(t, btn || toolBtns[id]);
  refreshRings();
}
const pop = $("pop");
function openMenu(t, anchor) {
  pop.innerHTML = "";
  for (const opt of MENUS[t.id]) {
    const b = document.createElement("button");
    b.innerHTML = `<i style="background:${opt.col}"></i>${opt.name}`;
    if (pick[t.id] === MENUS[t.id].indexOf(opt)) b.classList.add("on");
    const oi = MENUS[t.id].indexOf(opt);
    b.onclick = () => {
      pick[t.id] = oi;
      toolBtns[t.id].innerHTML = `${t.label} <em>${opt.name} ▾</em>`;
      toolBtns[t.id].classList.add("on");
      pop.classList.remove("open");
      refreshRings();
    };
    pop.appendChild(b);
  }
  const r = anchor.getBoundingClientRect();
  pop.style.left = Math.min(r.left, innerWidth - 190) + "px";
  pop.style.top = (r.bottom + 6) + "px";
  pop.classList.add("open");
}
addEventListener("pointerdown", e => {
  if (!pop.contains(e.target) && !e.target.closest("#tools")) pop.classList.remove("open");
}, true);
/* The worker is core + the life step, concatenated into one script.  Both
   live in js/core.js and js/worker.js as named source containers; reading
   them back with toString() keeps this working without a fetch. */
const blobSrc = ENTITY_SRC_BODY(ENTITY_CORE_SRC) + "\n"
              + ENTITY_SRC_BODY(ENTITY_WORKER_SRC);
const workerURL = URL.createObjectURL(new Blob([blobSrc], { type: "text/javascript" }));
class FakeWorker {
  constructor(src) {
    this.onmessage = null; this.onerror = null;
    const post = data => queueMicrotask(() =>
      this.onmessage && this.onmessage({ data }));
    this._recv = new Function("postMessage",
      "let onmessage=null;\n" + src + "\nreturn m => onmessage(m);")(post);
  }
  postMessage(data) {
    try { this._recv({ data }); }
    catch (e) { if (this.onerror) this.onerror(e); else throw e; }
  }
  terminate() {}
}
let workersBlocked = false;
try { new Worker(workerURL).terminate(); }
catch (e) { workersBlocked = true; }
const makeWorker = () => workersBlocked ? new FakeWorker(blobSrc) : new Worker(workerURL);
/* body.narrow is the single-plate layout, set by js/layout.js. */
const isNarrow = () => document.body.classList.contains("narrow");
const PLATES = [
  { id:"A", W:84  }, { id:"B", W:84 }, { id:"C", W:84 },
  { id:"D", W:112 }, { id:"E", W:112 },
];
let shownPlate = "D", hoverPlate = null, carry = null, strokeSeq = 1;
const BRUSH  = { supply: 2, brew: 4, wipe: 4, streak: 1 };
const LIFT_R = 4;
const OV     = 6;
const SUPPLY_AMT = .25;
const DOSE_AMT = 1.2;
const dishInside = (p, i) => {
  const R = p.W / 2, dx = (i % p.W) - R + .5, dy = ((i / p.W) | 0) - R + .5;
  return dx * dx + dy * dy <= R * R * .92;
};
const discCells = (p, i, r, slack) => {
  const out = [], x0 = i % p.W, y0 = (i / p.W) | 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r * r + slack) continue;
    const x = x0 + dx, y = y0 + dy;
    if (x >= 0 && y >= 0 && x < p.W && y < p.W) out.push(y * p.W + x);
  }
  return out;
};
const strokeCells = (p, i) => discCells(p, i, BRUSH[tool], .5);
const previewOf = p => {
  if (hoverPlate !== p || p.hoverTile == null) return null;
  if (placing) return { cells: [p.hoverTile], col: "#e8a04a" };
  const lift = tool === "transfer" && !carry;
  if (!(tool in BRUSH) && !lift) return null;
  const cells = (lift ? discCells(p, p.hoverTile, LIFT_R, 0)
                      : strokeCells(p, p.hoverTile)).filter(i => dishInside(p, i));
  const col = tool === "supply" ? C.SUB[pick.supply ?? 0].col
            : tool === "brew" ? `rgb(${C.CH_RGB[pick.brew ?? 0].join(",")})`
            : tool === "streak" ? KING[pick.streak ?? 0].col
            : tool === "wipe"   ? "#e8f2ff"
            : "#8fb7c4";
  return { cells, col };
};
function drawRing(p) {
  const g = p.og;
  g.clearRect(0, 0, p.ov.width, p.ov.height);
  const pv = previewOf(p);
  if (!pv || !pv.cells.length) return;
  const set = new Set(pv.cells), W = p.W, edge = new Path2D();
  g.globalAlpha = .14; g.fillStyle = pv.col;
  for (const i of pv.cells) {
    const cx = i % W, cy = (i / W) | 0, x = cx * OV, y = cy * OV;
    g.fillRect(x, y, OV, OV);
    if (cy === 0     || !set.has(i - W)) { edge.moveTo(x, y);           edge.lineTo(x + OV, y); }
    if (cy === W - 1 || !set.has(i + W)) { edge.moveTo(x, y + OV);      edge.lineTo(x + OV, y + OV); }
    if (cx === 0     || !set.has(i - 1)) { edge.moveTo(x, y);           edge.lineTo(x, y + OV); }
    if (cx === W - 1 || !set.has(i + 1)) { edge.moveTo(x + OV, y);      edge.lineTo(x + OV, y + OV); }
  }
  g.globalAlpha = 1;
  g.lineWidth = 2; g.lineCap = "square"; g.strokeStyle = pv.col;
  g.stroke(edge);
}
const refreshRings = () => { for (const q of PLATES) if (q.og) drawRing(q); };
function armPlacement(variantId) {
  const S = window.ENTITY;
  const v = S && S.player.variants.find(x => x.id === variantId);
  if (!v) return;
  placing = v;
  document.body.classList.add("placing");
  $("carry").innerHTML = `placing <b>${v.name}</b> — click a tile · Esc to cancel`;
  refreshRings();
}
function cancelPlacement() {
  if (!placing) return;
  placing = null;
  document.body.classList.remove("placing");
  $("carry").innerHTML = "carrying <b>nothing</b>";
  refreshRings();
}
function placeVariantOn(p, tile) {
  const v = placing;
  if (!v) return;
  const s   = C.statsOf(v.profile.g0, v.profile.g1);
  const org = { g0: v.profile.g0, g1: v.profile.g1,
                e: s.bank * 0.5 * v.potency, age: 0, slp: false };
  if (v.tenant) {
    const ts = C.statsOf(v.tenant.g0, v.tenant.g1);
    org.tenant = { g0: v.tenant.g0, g1: v.tenant.g1,
                   e: ts.bank * 0.5 * v.potency, age: 0 };
  }
  p.ops.push({ op: "drop", at: tile, orgs: [org] });
  placing = null;
  document.body.classList.remove("placing");
  $("carry").innerHTML = `Placing <b>${v.name}</b> on plate ${p.id}…`;
  refreshRings();
}
window.addEventListener("entity:place",
  e => armPlacement(e.detail && e.detail.variantId));
for (const p of PLATES) {
  const f = document.createElement("figure");
  f.className = "plate" + (p.id === shownPlate ? " shown" : "");
  f.innerHTML = `<div class="stage">
    <canvas width="${p.W}" height="${p.W}" tabindex="0"></canvas>
    <canvas class="ring" width="${p.W * OV}" height="${p.W * OV}"></canvas></div>
    <figcaption><span>Plate ${p.id}</span>
    <span><b>0</b><button class="rst" title="Fresh plate ${p.id}">↻</button></span></figcaption>`;
  $("bench").appendChild(f);
  p.cv = f.querySelector("canvas:not(.ring)"); p.g = p.cv.getContext("2d");
  p.ov = f.querySelector("canvas.ring");          p.og = p.ov.getContext("2d");
  p.cap = f.querySelector("b"); p.fig = f;
  p.inflight = false; p.hoverTile = null; p.lastProbe = null; p.tick = 0; p.pop = 0;
  p.ops = []; p.stroke = null;
  p.seed = (Math.random() * 4294967296) >>> 0;
  const resetMsg = seedN =>
    ({ t:"reset", id:p.id, W:p.W, seed:p.seed,
       seedN: seedN ?? (p.W > 100 ? 7 : 5) });
  const attach = w => {
    p.w = w;
    w.onerror = err => {
      console.error("plate", p.id, err);
      $("hint").textContent = `plate ${p.id} worker died: ${err.message || err.type}`;
      $("hint").style.color = "#ff5f56";
    };
    w.onmessage = onMsg;
  };
  const armWatchdog = () => setTimeout(() => {
    if (p.gotMsg || workersBlocked) return;
    workersBlocked = true;
    try { p.w.terminate(); } catch (e) {}
    attach(makeWorker());
    p.inflight = false;
    p.w.postMessage(resetMsg());
  }, 1600);
  const onMsg = e => {
    const m = e.data;
    p.inflight = false; p.gotMsg = true;
    p.tick = m.tick; p.pop = m.pop; p.lastProbe = m.probe;
    if (p.wantInspect != null && m.probe
        && m.probe.x + m.probe.y * p.W === p.wantInspect) {
      if (m.probe.entity) { SHEET.open(m.probe.entity, m.probe.medium, p, p.wantInspect); }
      p.wantInspect = null;
    }
    if (m.streak)
      $("carry").innerHTML =
        `Streaked <b>${m.streak}</b> tiles · <b>${C.MODE_NAME[m.streakMode]}</b>`
        + ` · fresh ${m.streakType ? "Type A" : "Type B"} profile`;
    if (m.dropped != null) {
      const req = m.dropRequested || 0;
      $("carry").innerHTML = m.dropped
        ? `Set down <b>${m.dropped}</b>`
          + (m.dropped < req ? ` of ${req}` : "") + ` on plate ${p.id}`
        : "Nowhere to set them down — this plate is packed";
    }
    if (m.lifted) {
      if (m.lifted.length) {
        carry = { orgs: m.lifted, from: p.id };
        refreshRings();
        $("carry").innerHTML = `carrying <b>${carry.orgs.length} entities</b> from plate ${carry.from}`;
      } else $("carry").innerHTML = "Nothing there to lift.";
    }
    if (m.rgba) p.g.putImageData(new ImageData(new Uint8ClampedArray(m.rgba), p.W, p.W), 0, 0);
    if (hoverPlate === p) paintTile(p);
  };
  attach(makeWorker());
  p.w.postMessage(resetMsg());
  armWatchdog();
  const toTile = e => {
    const r = p.cv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width * p.W) | 0;
    const y = ((e.clientY - r.top) / r.height * p.W) | 0;
    p.hoverTile = (x >= 0 && y >= 0 && x < p.W && y < p.W) ? y * p.W + x : null;
    hoverPlate = p;
    refreshRings();
  };
  p.cv.addEventListener("pointermove", toTile);
  p.cv.addEventListener("pointerdown", toTile);
  p.cv.addEventListener("pointerleave", () => {
    p.hoverTile = null;
    if (hoverPlate === p) hoverPlate = null;
    drawRing(p);
  });
  p.cv.addEventListener("click", () => {
    if (placing && p.hoverTile != null) { placeVariantOn(p, p.hoverTile); return; }
    if (tool === "inspect" && p.hoverTile != null) {
      if (p.lastProbe && p.lastProbe.entity
          && p.lastProbe.x + p.lastProbe.y * p.W === p.hoverTile)
        { SHEET.open(p.lastProbe.entity, p.lastProbe.medium, p,
                     p.lastProbe.x + p.lastProbe.y * p.W); }
      else p.wantInspect = p.hoverTile;
    }
    else if (tool === "transfer" && p.hoverTile != null) {
      if (!carry) p.ops.push({ op: "lift", at: p.hoverTile, r: LIFT_R, max: 40 });
      else {
        p.ops.push({ op: "drop", at: p.hoverTile, orgs: carry.orgs });
        carry = null;
        refreshRings();
      }
    }
  });
  const paintAt = i => {
    if (i == null) return;
    const cells = strokeCells(p, i);
    if (tool === "supply")
      p.ops.push({ op: "supply", q: pick.supply ?? 0, cells, amt: SUPPLY_AMT });
    else if (tool === "brew")
      p.ops.push({ op: "brew", ch: pick.brew ?? 0, cells, amt: DOSE_AMT });
    else if (tool === "wipe")
      p.ops.push({ op: "wipe", cells });
    else if (tool === "streak")
      p.ops.push({ op: "streak", type: pick.streak ?? 0, cells, sid: p.stroke });
  };
  p.cv.addEventListener("pointerdown", e => {
    if (placing || !(tool in BRUSH)) return;
    p.cv.setPointerCapture(e.pointerId);
    p.stroke = (strokeSeq++).toString(36);
    paintAt(p.hoverTile);
  });
  p.cv.addEventListener("pointermove", () => {
    if (p.stroke != null) paintAt(p.hoverTile);
  });
  const endStroke = () => { p.stroke = null; };
  p.cv.addEventListener("pointerup", endStroke);
  p.cv.addEventListener("pointercancel", endStroke);
  f.querySelector(".rst").onclick = () => {
    p.seed = (Math.random() * 4294967296) >>> 0;
    p.w.postMessage(resetMsg(0));
  };
  const tab = document.createElement("button");
  tab.textContent = p.id; tab.role = "tab";
  tab.classList.toggle("on", p.id === shownPlate);
  tab.onclick = () => {
    shownPlate = p.id;
    for (const q of PLATES) q.fig.classList.toggle("shown", q.id === p.id);
    for (const b of $("plateTabs").children) b.classList.toggle("on", b.textContent === p.id);
  };
  $("plateTabs").appendChild(tab);
}
function paintTile(p) {
  const pr = p.lastProbe;
  if (!pr) { $("tile").innerHTML = "<span><i>hover a plate to read the medium</i></span>"; return; }
  const ab = ["r1","r2","r3","r4","r5"].map((n, q) => {
    const v = pr.medium[q];
    return v > .05 ? `<b>${n} ${v.toFixed(3)}</b>` : `<i>${n} ${v.toFixed(3)}</i>`;
  }).join(" ");
  let org = "";
  if (pr.entity) {
    const s = C.statsOf(pr.entity.g0, pr.entity.g1);
    org = `<span>entity <b>${C.MODE_NAME[s.mode]}</b> · Type ${s.type ? "A" : "B"}`
        + ` · e <b>${pr.entity.e.toFixed(3)}</b> · age <b>${pr.entity.age}</b>`
        + (pr.entity.asleep ? " · <i>dormant</i>" : "") + `</span>`;
    if (pr.entity.tenant) {
      const gs = C.statsOf(pr.entity.tenant.g0, pr.entity.tenant.g1);
      org += `<span>tenant <b>${C.MODE_NAME[gs.mode]}</b> · Type ${gs.type ? "A" : "B"}`
           + ` · e <b>${pr.entity.tenant.e.toFixed(3)}</b> · age <b>${pr.entity.tenant.age}</b></span>`;
    }
  }
  $("tile").innerHTML = `<span>medium ${ab}</span>${org}`
    + `<span><i>plate ${p.id} · tile ${pr.x},${pr.y} · tick ${p.tick.toLocaleString()}</i></span>`;
}
let running = true, speed = 4, halted = false;
window.ENTITY_SET_HALTED = v => { halted = !!v; };
/* The world clock (js/world.js) follows the bench: same speed, frozen by
   Pause and by job offers. */
window.ENTITY_CLOCK = { get speed() { return speed; }, get running() { return running && !halted; } };
$("play").onclick = () => { running = !running; $("play").textContent = running ? "Pause" : "Play"; };
$("speed").onchange = () => { speed = +$("speed").value; };
$("burger").onclick = () => {
  const open = $("drawer").classList.toggle("open");
  $("burger").setAttribute("aria-expanded", open);
};
addEventListener("keydown", e => {
  // Escape is unguarded on purpose: cancel a placement even from a field.
  if (e.key === "Escape") { pop.classList.remove("open"); cancelPlacement(); return; }
  if (!hotkey(e)) return;
  if (e.key === " " && !e.target.closest("button"))
    { e.preventDefault(); $("play").click(); }
  else if (/^[1-6]$/.test(e.key))
    selectTool(TOOLS[+e.key - 1].id);
});
selectTool("inspect");
let hidden = false, lastT = performance.now();
addEventListener("visibilitychange", () => { hidden = document.hidden; });
function pump() {
  if (hidden) { requestAnimationFrame(pump); return; }
  const active = running && !halted;
  for (const p of PLATES) {
    if (p.inflight) continue;
    p.inflight = true;
    const ops = p.ops; p.ops = [];
    p.w.postMessage({ t: active ? "step" : "idle", id: p.id, n: speed,
                      probe: p.hoverTile, ops,
                      draw: !isNarrow() || p.id === shownPlate });
  }
  const now = performance.now();
  if (now - lastT > 500) {
    lastT = now;
    for (const p of PLATES) p.cap.textContent = p.pop;
  }
  requestAnimationFrame(pump);
}
pump();
window.ENTITY_PLATES = PLATES;
})();
