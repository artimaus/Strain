/* ═══════════════════════════════════════════════════════════════
   Entity shell — player and career constants, variants, views, the
   config panel, and the window.ENTITY object the other modules share
   ═══════════════════════════════════════════════════════════════ */
(() => {
"use strict";
const { $, modal, hotkey, uiAlert, uiConfirm, rgb, dietNames, traitNames } = window.UI;
const variantModal = modal("variantModal"), entityTuneModal = modal("entityTune");

const { REGION_NAME, REGION_ENV, REGION_IDS, COUNTRY_REGION, popOf } = window.GEO;
const { UNIVERSITIES, DIFF, PRED_DEFS, PRED_BY_KEY, generateBounty, diffLabel,
        notorietyMult, rollNormal, pickFrom } = window.BOUNTIES;

const TITLES = [
  { name:"Junior Analyst", salaryMed:50,  floorMed:10 },
  { name:"Analyst",        salaryMed:120, floorMed:16 },
  { name:"Senior Analyst", salaryMed:250, floorMed:32 },
  { name:"Lead Analyst",   salaryMed:420, floorMed:48 },
  { name:"Director",       salaryMed:650, floorMed:64 },
];
const PROMO_STREAK_MED  = [10, 18, 35, 100];
const LATERAL_STREAK_MED = 6;
const OFFER_CHANCE_CAP   = 0.35;
const player={
  money:500,scrutiny:0,job:0,
  salary:TITLES[0].salaryMed,scrutinyFloor:TITLES[0].floorMed,
  promoStreak:0,lateralStreak:0,pendingOffer:null,careerHistory:[],
  notoriety:0,
  variants:[],maxVariants:8,
};
let variantIdCounter = 0;
const ENTITY_CONFIG = {
  incomeFactor: 0.10, scrutinyDecay: 0.12,
  createCostBase: 50, createCostPerVariant: 10, createScrutinyBase: 2,
  replicateCostBase: 75,
  deployCostBase: 200, deployCostPerVariant: 25, deployScrutinyBase: 5,
  expandCostBase: 150, expandCostPerSlot: 50,
  variantDecayChance: 0.006, variantDecayAmount: 0.001,
  bountyRefreshScrutiny: 1,
  // links (js/links.js): the graph's capacities, in units of goods a day (raised fourfold for the trade pillar, docs/design.md §5.1)
  landCap: 2, seaCap: 1, airCap: 0.2, seaRange: 4000, airRange: 8000, seaK: 8, airK: 8,
  // world clock (js/world.js)
  dayMs: 10000, maxCatchup: 4, logCap: 200,     // a day is 10 s at 1x: 2.5 s at the default 4x
};
window.ENTITY_CONFIG = ENTITY_CONFIG;

const W = window.WORLD;
const { COUNTRY_STATE, regionMembers, regionAgg, anyCovered,
        onWorldMapReady, installMapSync, syncMapColors } = W;

/* Pillar levers (docs/design.md §10): each pillar's config defaults join
   ENTITY_CONFIG, and its rows become a group of the config panel.  The
   pillars load before this file; a late one is picked up when the panel
   is next built. */
function mergePillarConfig() {
  for (const p of W.pillarList()) {
    const d = p.config && p.config.defaults;
    if (d) for (const k in d) if (!(k in ENTITY_CONFIG)) ENTITY_CONFIG[k] = d[k];
  }
}
mergePillarConfig();

function updateEntityUI() {
  $("moneyDisplay").textContent = Math.round(player.money);
  $("scrutinyFloorDisplay").textContent = Math.round(player.scrutinyFloor);
  $("suspicionDisplay").textContent = Math.round(player.scrutiny);
  $("suspicionFill").style.width = Math.min(100, player.scrutiny) + "%";
  $("jobDisplay").textContent = TITLES[player.job].name;
  $("variantCount").textContent = `${player.variants.length} / ${player.maxVariants}`;
  renderVariants();
  if (player.scrutiny >= 100)
    (window.ENTITY_GAMEOVER || (() => {}))();
}
function switchView(view) {
  const benchEls = document.querySelectorAll("#main, #plateTabs");
  if (view === "bench") {
    $("mapView").classList.remove("open");
    benchEls.forEach(el => el.style.visibility = "");
    $("viewBench").classList.add("on");
    $("viewMap").classList.remove("on");
  } else {
    $("mapView").classList.add("open");
    benchEls.forEach(el => el.style.visibility = "hidden");
    $("viewBench").classList.remove("on");
    $("viewMap").classList.add("on");
    syncMapColors();
  }
  // layout.js re-fits the bench on this; anything else can listen too.
  window.dispatchEvent(new CustomEvent("entity:view", { detail: { view } }));
}
$("viewBench").onclick = () => switchView("bench");
$("viewMap").onclick   = () => switchView("map");
$("mapBack").onclick   = () => switchView("bench");

function createVariantCost()      { return ENTITY_CONFIG.createCostBase + player.variants.length * ENTITY_CONFIG.createCostPerVariant; }
function createVariantScrutiny()  { return ENTITY_CONFIG.createScrutinyBase + Math.floor(player.variants.length / 2); }
function replicateCost(variant)   { return ENTITY_CONFIG.replicateCostBase + (variant.used || 0) * 15; }
function expandCost()             { return ENTITY_CONFIG.expandCostBase + Math.max(0, (player.maxVariants - 8)) * ENTITY_CONFIG.expandCostPerSlot; }

function statsSnapshot(s) {
  return {
    mode: s.mode, modeName: C.MODE_NAME[s.mode],
    type: s.type, typeName: s.type ? "Type A" : "Type B",
    diet: s.diet, dietN: s.dietN,
    id: s.id,   cloakN: s.cloakN,
    tgt: s.tgt, brew: s.brew,
    huntLive: s.huntLive, brewLive: s.brewLive,
    traits: {
      shield: s.shield, dormancy: s.dormancy, adaptor: s.adaptor,
      reserve: s.reserve, brewer: s.brewer,
      recycler: s.recycler, lodging: s.lodging,
    },
    upkeep: s.upkeep, divE: s.divE, senT: s.senT,
  };
}
async function collectFromEntity(entity, plateId) {
  if (player.variants.length >= player.maxVariants) {
    await uiAlert("No room for another variant."); return null; }
  const cost = createVariantCost();
  if (player.money < cost) { await uiAlert(`Need ${cost} money.`); return null; }
  const scr = createVariantScrutiny();
  const s = C.statsOf(entity.g0, entity.g1);
  const t = entity.tenant || null;
  const ts = t ? C.statsOf(t.g0, t.g1) : null;
  player.money    -= cost;
  player.scrutiny += scr;
  const variant = {
    id: "variant_" + (++variantIdCounter),
    name: `${C.MODE_NAME[s.mode]}-${plateId}-${Date.now().toString(36).slice(-4)}`,
    plateId,
    profile: { g0: entity.g0, g1: entity.g1 },
    tenant: t ? { g0: t.g0, g1: t.g1 } : null,
    stats: statsSnapshot(s),
    tenantStats: ts ? statsSnapshot(ts) : null,
    potency: 1.0, created: Date.now(), used: 0,
  };
  player.variants.push(variant);
  updateEntityUI();
  return variant;
}
async function replicateVariant(variantId) {
  const idx = player.variants.findIndex(x => x.id === variantId);
  if (idx < 0) return false;
  const orig = player.variants[idx];
  if (player.variants.length >= player.maxVariants) { await uiAlert("No room for another variant."); return false; }
  const cost = replicateCost(orig);
  if (player.money < cost) { await uiAlert(`Need ${cost} money to replicate.`); return false; }
  player.money -= cost;
  const replica = { ...orig, id: "variant_" + (++variantIdCounter),
    name: orig.name + " (copy)",
    potency: Math.max(0.3, orig.potency - 0.15),
    created: Date.now(), used: 0 };
  player.variants.push(replica);
  updateEntityUI();
  return true;
}
async function sellVariant(variantId) {
  const idx = player.variants.findIndex(x => x.id === variantId);
  if (idx < 0) return false;
  const variant = player.variants[idx];
  const st = variant.stats;
  let bounty = 100;
  if (st.traits.shield)    bounty += 75;
  if (st.traits.dormancy)  bounty += 60;
  if (st.traits.adaptor)   bounty += 50;
  if (st.traits.reserve)   bounty += 40;
  if (st.traits.brewer)    bounty += 80;
  if (st.traits.recycler)  bounty += 30;
  if (st.traits.lodging)   bounty += 35;
  if (st.traits.lodging && variant.tenant) bounty += 60;
  if (st.dietN > 2)        bounty += 20 * st.dietN;
  const scrCost = 10 + Math.floor(bounty / 20);
  if (!await uiConfirm(`Sell "${variant.name}" for ${bounty} money?\n\nCosts +${scrCost} suspicion.`)) return false;
  player.money    += bounty;
  player.scrutiny += scrCost;
  player.variants.splice(idx, 1);
  updateEntityUI();
  return bounty;
}
async function removeVariant(variantId) {
  if (!await uiConfirm("Discard this variant?")) return;
  const idx = player.variants.findIndex(x => x.id === variantId);
  if (idx >= 0) player.variants.splice(idx, 1);
  updateEntityUI();
}
async function expandStorage() {
  if (player.maxVariants >= 20) { await uiAlert("Storage is already at capacity."); return; }
  const cost = expandCost();
  if (player.money < cost) { await uiAlert(`Need ${cost} money to expand.`); return; }
  player.money -= cost;
  player.maxVariants = Math.min(20, player.maxVariants + 2);
  updateEntityUI();
}
function armVariantPlacement(id) {
  variantModal.close();
  switchView("bench");
  window.dispatchEvent(new CustomEvent("entity:place", { detail: { variantId: id } }));
}
function renderVariants() {
  const list = $("variantList");
  if (!list) return;
  if (!player.variants.length) {
    list.innerHTML = `<div class="variant-empty">No variants yet.<br><small>Inspect an entity on the bench and press <b>Collect</b>.</small></div>`;
  } else {
    list.innerHTML = player.variants.map(s => {
      const st = s.stats;
      const col = C.profileColor(s.profile.g0, s.profile.g1);
      const traitList = traitNames(st.traits);
      const diet = dietNames(st.diet) || "none";
      const potPct = Math.round(s.potency * 100);
      const pair = (s.tenant && s.tenantStats)
        ? `<span class="sep">·</span><span class="trait">+ ${s.tenantStats.modeName} tenant</span>`
        : "";
      return `<div class="variant-card">
        <div class="variant-top">
          <span class="variant-sw" style="background:${rgb(col)}"></span>
          <span class="variant-name">${s.name}</span>
          <span class="variant-pot">⚡ <b>${potPct}%</b></span>
        </div>
        <div class="variant-detail">
          <span>${st.modeName}</span><span class="sep">·</span>
          <span>${st.typeName}</span><span class="sep">·</span>
          <span>${diet}</span>${pair}
          ${s.used ? `<span class="sep">·</span><span>used ${s.used}×</span>` : ""}
          <span class="sep">·</span>
          <span class="trait${traitList ? "" : " none"}">${traitList || "no traits"}</span>
        </div>
        <div class="variant-actions">
          <button data-action="place"     data-id="${s.id}">🔬 Place</button>
          <button data-action="replicate" data-id="${s.id}">📋 Replicate</button>
          <button data-action="sell"      data-id="${s.id}">💰 Sell</button>
          <button data-action="remove"    data-id="${s.id}" class="danger">✕</button>
        </div>
      </div>`;
    }).join("");
    list.querySelectorAll("button[data-action]").forEach(b => {
      b.onclick = () => {
        const a = b.dataset.action, id = b.dataset.id;
        if (a === "place") armVariantPlacement(id);
        else if (a === "replicate") replicateVariant(id);
        else if (a === "sell") sellVariant(id);
        else if (a === "remove") removeVariant(id);
      };
    });
  }
  if (typeof window.ENTITY.onVariantsChanged === "function")
    window.ENTITY.onVariantsChanged();
}

function buildEntityTune() {
  const body = $("entityTuneBody");
  const groups = [
    ["Player", [["incomeFactor","income × per tick","fraction"],["scrutinyDecay","suspicion decay / tick","pts"]]],
    ["Variant costs", [
      ["createCostBase","create · base","money"],["createCostPerVariant","create · per variant","money"],
      ["createScrutinyBase","create · suspicion","pts"],["replicateCostBase","replicate · base","money"],
      ["deployCostBase","deploy · base","money"],["deployCostPerVariant","deploy · per variant","money"],
      ["deployScrutinyBase","deploy · suspicion","pts"],["expandCostBase","expand · base","money"],
      ["expandCostPerSlot","expand · per slot","money"],["variantDecayChance","decay chance / poll","p"],
      ["variantDecayAmount","decay amount","pts"]]],
    ["Project rerolls", [["bountyRefreshScrutiny","reroll suspicion cost","pts"]]],
    ["Links", [
      ["landCap","land capacity","× km^½"],["seaCap","sea capacity","× km^½"],["airCap","air capacity","× hubs"],
      ["seaRange","sea falloff","km"],["airRange","air falloff","km"],["seaK","sea partners","count"],["airK","air partners","count"]]],
    ["World clock", [["dayMs","real ms per day at 1x","ms"],["maxCatchup","max days per tick","count"],
      ["logCap","news log length","count"]]],
  ];
  mergePillarConfig();
  for (const p of W.pillarList())
    if (p.config && p.config.rows && p.config.rows.length) groups.push([p.config.group || p.label || p.name, p.config.rows]);
  body.innerHTML = groups.map(([title, rows]) =>
    `<h4>${title}</h4>` + rows.map(([k, label, unit]) =>
      `<div class="row"><span>${label} <small class="faint">(${unit})</small></span>` +
      `<input type="number" data-key="${k}" step="any" value="${ENTITY_CONFIG[k]}"></div>`).join("")
  ).join("");
  body.querySelectorAll("input[data-key]").forEach(inp => {
    inp.onchange = () => {
      const v = parseFloat(inp.value);
      if (!isFinite(v)) return;
      ENTITY_CONFIG[inp.dataset.key] = v;
      if (window.LINKS && window.LINKS.ready) window.LINKS.refreshCapacity();   // the link capacities read the config
    };
  });
}
$("entityTuneBtn").onclick = () => { buildEntityTune(); entityTuneModal.open(); };
$("entityTuneClose").onclick = () => entityTuneModal.close();

$("variantToggle").onclick = () => {
  updateEntityUI();
  try {
    if (!localStorage.getItem("entity_hint_seen_v1")) $("variantHint").classList.add("show");
  } catch (e) {}
  variantModal.open();
};
$("variantHintClose").onclick = () => {
  $("variantHint").classList.remove("show");
  try { localStorage.setItem("entity_hint_seen_v1","1"); } catch (e) {}
};
$("variantClose").onclick = () => variantModal.close();
$("variantExpand").onclick = expandStorage;

addEventListener("keydown", e => {
  if (!hotkey(e)) return;
  const k = e.key.toLowerCase();
  if (k === "b") switchView("bench");
  else if (k === "m") switchView("map");
});

window.ENTITY = {
  player, ENTITY_CONFIG,
  COUNTRY_STATE, COUNTRY_REGION, REGION_IDS, REGION_NAME, REGION_ENV,
  popOf, regionAgg, regionMembers, anyCovered,
  updateEntityUI, switchView, syncMapColors,
  refreshVariants: renderVariants,
  getVariant: id => player.variants.find(s => s.id === id),
  collectFromEntity,
  collectCost: createVariantCost,
  collectScrutiny: createVariantScrutiny,
  onWorldMapReady,
  get currentTitle() { return TITLES[player.job].name; },
  TITLES, DIFF, PRED_DEFS, PRED_BY_KEY, generateBounty, diffLabel,
  notorietyMult, rollNormal, pickFrom, UNIVERSITIES,
  PROMO_STREAK_MED, LATERAL_STREAK_MED, OFFER_CHANCE_CAP,
  get worldMap() { return W.worldMap; },
  get neighbourEdges() { return W.neighbourEdges; },
  get variantIdCounter() { return variantIdCounter; },
  set variantIdCounter(v) { variantIdCounter = v | 0; },
  installMapSync,
  onVariantsChanged: null,
  resetBench: () => {
    for (const p of (window.ENTITY_PLATES || [])) {
      p.seed = (Math.random() * 4294967296) >>> 0;
      try {
        p.w.postMessage({ t: "reset", id: p.id, W: p.W, seed: p.seed,
          seedN: p.W > 100 ? 7 : 5 });
      } catch (e) {}
      p.ops = []; p.pop = 0; p.tick = 0;
      p.cap.textContent = "0";
    }
  },
  resetAll: () => {
    player.money = 500; player.scrutiny = 0; player.job = 0;
    player.salary        = TITLES[0].salaryMed;
    player.scrutinyFloor = TITLES[0].floorMed;
    player.promoStreak   = 0;
    player.lateralStreak = 0;
    player.notoriety     = 0;
    player.pendingOffer  = null;
    player.careerHistory = [];
    player.variants = []; player.maxVariants = 8; variantIdCounter = 0;
    W.newWorld();                       // fresh seed, stats and day; also clears the outbreak
    if (window.ENTITY.resetBench) window.ENTITY.resetBench();
  },
};
updateEntityUI();
})();
