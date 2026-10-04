/* ═══════════════════════════════════════════════════════════════
   Entity — world dialogs
   The region detail dialog and the deploy dialog, with the two cost
   formulas they use.  Presentation over world.js state; the player
   and the top-bar refresh are reached through window.ENTITY, so this
   loads after shell.js and registers its openers on ENTITY the same
   way progression.js registers its own.  The country screen is
   js/country.js, which loads next and opens the deploy dialog from
   here.
   ═══════════════════════════════════════════════════════════════ */
(() => {
"use strict";
const { $, modal, uiAlert, rgb, dietNames, traitNames } = window.UI;
const { REGION_NAME, REGION_IDS, COUNTRY_REGION, popOf } = window.GEO;
const S = window.ENTITY, W = window.WORLD;
const { COUNTRY_STATE, ensureCountry, regionAgg, regionMembers, syncMapColors } = W;
const regionModal = modal("mapRegionModal"), deployModal = modal("deployModal");

function deployCost(variant)      { return S.ENTITY_CONFIG.deployCostBase + S.player.variants.length * S.ENTITY_CONFIG.deployCostPerVariant; }
function deployScrutiny(variant)  { return S.ENTITY_CONFIG.deployScrutinyBase + Math.floor((1 - variant.potency) * 10); }

function openRegionModal(regionId) {
  if (!REGION_IDS.includes(regionId)) return;
  const agg = regionAgg(regionId);
  const sw = $("regSw"); const nm = $("regName"); const body = $("regBody");
  sw.style.background = `var(--lv${Math.min(4, 1 + Math.floor(agg.coverageLevel * 4))})`;
  nm.textContent = agg.name;
  const rows = [
    ["Countries", `${agg.covered} / ${agg.countries} covered`],
    ["Population", `${agg.population}M`],
    ["Mean coverage", `${(agg.coverageLevel * 100).toFixed(1)}%`],
    ["Mean detection", `${(agg.detection * 100).toFixed(0)}%`],
    ["Mean gov. action", `${(agg.govAction * 100).toFixed(0)}%`],
    ["Mean response", `${(agg.responseProgress * 100).toFixed(1)}%`],
    ["Temperature", `${agg.env.temp}°C`],
    ["Humidity", `${agg.env.humidity}%`],
    ["Urban", `${agg.env.urban}%`],
  ];
  const list = regionMembers(regionId).filter(iso => COUNTRY_STATE[iso] && COUNTRY_STATE[iso].covered)
    .slice(0, 24).join(", ") || "none yet";
  body.innerHTML = rows.map(([k, v]) =>
      `<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("")
    + `<div class="traits">Covered: <b>${list}</b></div>`;
  regionModal.open();
}
$("regClose").onclick = () => regionModal.close();

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
  const c = W.worldMap ? W.worldMap.countries.find(x => x.iso2 === iso) : null;
  const region = COUNTRY_REGION[iso] || "—";
  el.innerHTML = `<b>${c ? c.name : iso}</b> <span class="region">${iso} · ${REGION_NAME[region] || region}</span>`;
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
  if (!iso2 || !COUNTRY_REGION[iso2] || !window.WORLD.isAgent(iso2)) { await uiAlert("Choose a country first."); return false; }
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

Object.assign(window.ENTITY, { openRegionModal, openDeployModal, deployCost });
})();
