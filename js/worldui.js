/* ═══════════════════════════════════════════════════════════════
   Entity — world dialogs
   The country card, the region dialog and the deploy dialog, with the
   two cost formulas the deploy uses.  Presentation over world.js state
   and the links; the player and the top-bar refresh are reached
   through window.ENTITY, so this loads after shell.js and registers
   its openers on ENTITY the same way progression.js registers its
   own.  map.js opens the country card on a click; the card opens the
   region dialog and the deploy dialog.
   ═══════════════════════════════════════════════════════════════ */
(() => {
"use strict";
const { $, modal, uiAlert, dietNames, traitNames } = window.UI;
const { REGION_NAME, REGION_IDS, COUNTRY_REGION, popOf } = window.GEO;
const S = window.ENTITY, W = window.WORLD;
const { COUNTRY_STATE, ensureCountry, regionAgg, regionMembers, syncMapColors, nameOf } = W;
const regionModal = modal("mapRegionModal"), deployModal = modal("deployModal"), countryModal = modal("countryModal");

function deployCost(variant)      { return S.ENTITY_CONFIG.deployCostBase + S.player.variants.length * S.ENTITY_CONFIG.deployCostPerVariant; }
function deployScrutiny(variant)  { return S.ENTITY_CONFIG.deployScrutinyBase + Math.floor((1 - variant.potency) * 10); }

const fmtPop = p => `${p >= 100 ? Math.round(p) : (+p || 0).toFixed(1)} M`;
const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const row = (k, v) => `<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>`;
const swatchOf = lv => lv > 0 ? `var(--lv${Math.min(4, 1 + Math.floor(lv * 4))})` : "var(--land)";

/* ── Region dialog ─────────────────────────────────────────────── */
function openRegionModal(regionId) {
  if (!REGION_IDS.includes(regionId)) return;
  const agg = regionAgg(regionId);
  $("regSw").style.background = swatchOf(agg.covered ? agg.coverageLevel : 0);
  $("regName").textContent = agg.name;
  const rows = [
    ["Countries", `${agg.covered} / ${agg.countries} covered`],
    ["Population", fmtPop(agg.population)],
    ["Mean coverage", `${(agg.coverageLevel * 100).toFixed(1)}%`],
    ["Temperature", `${agg.env.temp}°C`],
    ["Humidity", `${agg.env.humidity}%`],
    ["Urban", `${agg.env.urban}%`],
  ];
  const list = regionMembers(regionId).filter(iso => COUNTRY_STATE[iso] && COUNTRY_STATE[iso].covered)
    .map(nameOf).slice(0, 24).join(", ") || "none yet";
  $("regBody").innerHTML = rows.map(([k, v]) => row(k, v)).join("")
    + `<div class="traits">Covered: <b>${esc(list)}</b></div>`;
  regionModal.open();
}
$("regClose").onclick = () => regionModal.close();

/* ── Country card: what a country is, whether it is covered, and the
   way to the deploy dialog.  Small by design; the redesign grows it. ── */
let cardIso = null;
function openCountryModal(iso) {
  if (!iso || iso === "—") return;
  cardIso = iso;
  renderCountry();
  countryModal.open();
}
function renderCountry() {
  const iso = cardIso; if (!iso) return;
  const st = COUNTRY_STATE[iso] || null, agent = W.isAgent(iso), region = COUNTRY_REGION[iso] || null;
  const L = window.LINKS, links = L && L.ready ? L.edgesOf(iso) : [];
  const n = type => links.filter(e => e.type === type).length;
  const lv = st && st.covered ? st.coverageLevel : 0;
  $("cmSw").style.background = swatchOf(lv);
  $("cmName").textContent = nameOf(iso);
  $("cmIso").textContent = iso;
  $("cmRegion").textContent = region ? REGION_NAME[region] : "unassigned region";
  let variant = "—";
  if (st && st.profile && window.C) {
    const s = C.statsOf(st.profile.g0, st.profile.g1);
    variant = `${C.MODE_NAME[s.mode]} · ${s.type ? "Type A" : "Type B"}`;
  }
  const neighbours = links.filter(e => e.type === "land").map(e => nameOf(e.a === iso ? e.b : e.a)).sort().slice(0, 10);
  const rows = [
    ["Population", fmtPop(popOf(iso))],
    ["Status", !agent ? "scenery · no state" : st && st.covered ? `covered · ${(lv * 100).toFixed(1)}%` : "clean"],
    ["Variant", variant],
    ["Links", links.length ? `${n("land")} land · ${n("sea")} sea · ${n("air")} air` : "—"],
  ];
  $("cmBody").innerHTML = rows.map(([k, v]) => row(k, esc(v))).join("")
    + (neighbours.length ? `<div class="traits">Borders: <b>${esc(neighbours.join(", "))}</b></div>` : "")
    + pillarSections(iso)
    + `<div class="country-btns">`
    + `<button id="cmDeploy" class="danger"${agent ? "" : " disabled"}>🌍 Deploy variant</button>`
    + (region ? `<button id="cmRegionBtn">Region · ${esc(REGION_NAME[region])}</button>` : "")
    + `</div>`;
  const dep = $("cmDeploy");
  if (dep) dep.onclick = async () => {
    const v = S.player.variants.find(x => x.potency >= 0.25);
    if (!v) { await uiAlert("No variant in storage is fit to deploy.\n\nInspect an entity on the bench and press Collect."); return; }
    openDeployModal(v, iso);
  };
  const rb = $("cmRegionBtn");
  if (rb) rb.onclick = () => openRegionModal(region);
  $("cmBody").querySelectorAll("details.pillar").forEach(d => d.addEventListener("toggle", () => {
    if (d.open) openSet.add(d.dataset.pillar); else openSet.delete(d.dataset.pillar);
    rememberOpen();
  }));
}
$("cmClose").onclick = () => countryModal.close();

/* Pillar sections: one fold-out per registered pillar that offers card
   rows, filled from today's ledger; which are open is remembered across
   countries and sessions.  While the card is open it follows the day. */
const OPEN_KEY = "entity_card_open";
let openSet = new Set();
try { openSet = new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || "[]")); } catch (e) {}
function rememberOpen() { try { localStorage.setItem(OPEN_KEY, JSON.stringify([...openSet])); } catch (e) {} }
function pillarSections(iso) {
  const L = W.ledgerOf(iso);
  return W.pillarList().filter(p => typeof p.rows === "function").map(p => {
    let rows = [];
    try { rows = p.rows(iso, L) || []; } catch (e) { rows = [["error", String(e)]]; }
    const body = rows.length
      ? rows.map(([k, v, note]) => `<div class="row"><span class="k">${esc(k)}</span><span class="v">${esc(v)}${note ? ` <small class="faint">${esc(note)}</small>` : ""}</span></div>`).join("")
      : `<div class="faint">nothing yet</div>`;
    return `<details class="pillar" data-pillar="${p.name}"${openSet.has(p.name) ? " open" : ""}>`
      + `<summary>${esc(p.label || p.name)}</summary><div class="sec">${body}</div></details>`;
  }).join("");
}
let refreshDue = 0;
addEventListener("entity:day", () => {
  if (!countryModal.isOpen || !cardIso) return;
  const t = performance.now();
  if (t < refreshDue) return;
  refreshDue = t + 1000;
  renderCountry();
});

/* ── Deploy dialog ─────────────────────────────────────────────── */
const deployState = { variant: null, iso2: null };
function openDeployModal(variant, preselectIso) {
  deployState.variant = variant;
  deployState.iso2 = preselectIso || null;
  const sel = $("deployVariant");
  sel.innerHTML = S.player.variants.map(s =>
    `<option value="${s.id}">${s.name} (${Math.round(s.potency * 100)}%)</option>`).join("");
  sel.value = variant.id;
  renderDeployTarget();
  renderDeploySummary();
  renderDeployCost();
  deployModal.open();
}
function renderDeployTarget() {
  const iso = deployState.iso2;
  const el = $("deployTarget");
  if (!iso) { el.innerHTML = `<span class="dim">pick a country from the map</span>`; return; }
  const region = COUNTRY_REGION[iso] || "—";
  el.innerHTML = `<b>${esc(nameOf(iso))}</b> <span class="region">${iso} · ${REGION_NAME[region] || region}</span>`;
}
function renderDeploySummary() {
  const variant = deployState.variant;
  if (!variant) return;
  const st = variant.stats;
  const col = C.profileColor(variant.profile.g0, variant.profile.g1);
  const diet = dietNames(st.diet) || "none";
  const traits = traitNames(st.traits) || "no traits";
  const pair = variant.tenantStats ? ` · +${variant.tenantStats.modeName} tenant` : "";
  $("deploySummary").innerHTML =
    `<span class="sw" style="background:rgb(${col.join(",")})"></span>` +
    `<b>${st.modeName}</b> · ${st.typeName} · ${diet}${pair}<br>` +
    `<span class="faint">${traits}</span>`;
}
function renderDeployCost() {
  const variant = deployState.variant;
  if (!variant) return;
  const money = deployCost(variant);
  const scr   = deployScrutiny(variant);
  const iso = deployState.iso2;
  const countryState = iso ? COUNTRY_STATE[iso] : null;
  const affordMoney = S.player.money >= money;
  const willConsume = variant.potency <= 0.4;
  let html = `💰 Costs <b>${money}</b> money · +<b>${scr}</b> suspicion`;
  if (countryState && countryState.covered) html += ` · <span class="warn">+3</span> (already covered)`;
  html += `<br><span class="faint">`;
  if (willConsume) html += `⚠ This variant will be consumed on deployment.`;
  else html += `Variant will drop to ~${Math.round((variant.potency - 0.15) * 100)}% potency.`;
  html += `</span>`;
  if (!affordMoney) html = `<span class="warn">Not enough money.</span> ` + html;
  $("deployCost").innerHTML = html;
  $("deployConfirm").disabled = !iso || !affordMoney;
}
async function runDeploy(variantId, iso2) {
  const idx = S.player.variants.findIndex(x => x.id === variantId);
  if (idx < 0) return false;
  const variant = S.player.variants[idx];
  if (variant.potency < 0.25) { await uiAlert("This variant is too degraded to deploy."); return false; }
  if (!iso2 || !W.isAgent(iso2)) { await uiAlert("Choose a country first."); return false; }
  const moneyCost = deployCost(variant);
  if (S.player.money < moneyCost) { await uiAlert(`Need ${moneyCost} money.`); return false; }
  const st = ensureCountry(iso2);
  let scrCost = deployScrutiny(variant);
  if (st.covered) scrCost += 3;
  S.player.money -= moneyCost;
  S.player.scrutiny += scrCost;
  st.covered = true;
  st.coverageLevel = Math.max(st.coverageLevel, 0.05);
  st.profile = { g0: variant.profile.g0, g1: variant.profile.g1 };
  if (variant.potency > 0.4) {
    variant.potency = Math.max(0.25, variant.potency - 0.15);
    variant.used++;
  } else {
    S.player.variants.splice(idx, 1);
  }
  syncMapColors();
  S.updateEntityUI();
  if (countryModal.isOpen && cardIso === iso2) renderCountry();
  return true;
}
$("deployClose").onclick = $("deployCancel").onclick = () => deployModal.close();
$("deployVariant").onchange = e => {
  deployState.variant = S.player.variants.find(s => s.id === e.target.value);
  renderDeploySummary();
  renderDeployCost();
};
$("deployConfirm").onclick = async () => {
  if (!deployState.variant || !deployState.iso2) return;
  if (await runDeploy(deployState.variant.id, deployState.iso2))
    deployModal.close();
};

Object.assign(window.ENTITY, { openCountryModal, openRegionModal, openDeployModal, deployCost });
})();
