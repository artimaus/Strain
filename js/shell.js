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
  localGrowth: 0.00125, spreadPerFlow: 0.002, mutationRate: 0.003,
  detectionSeverity: 0.0015, detectionSeverityAnti: 0.007, dormancyDampen: 0.35,
  actionRate: 0.004, actionSlowdown: 0.55,
  responseRate: 0.00045, responseFloor: 0.25,
  bountyRefreshScrutiny: 1,
  countryDecay: 0.0004,
  // links and flows
  landCap: 0.5, seaCap: 0.2, airCap: 0.05, seaRange: 4000, airRange: 8000, seaK: 8, airK: 8,
  seasonAmp: 0.4, migBase: 0.01, borderRestricted: 0.4, borderClosed: 0.05,
  migPopScale: 0.001,
  // world clock
  dayMs: 10000, maxCatchup: 4, logCap: 200,     // a day is 10 s at 1x: 2.5 s at the default 4x
  // drift
  driftFast: 0.01, driftSlow: 0.003, driftNoise: 0.15,
  occupiedStab: 25, outbreakStabDrag: 30, debtStab: 10, famineStab: 30, bustStab: 5, warStab: 5, sanctionStab: 5, sanctionRef: 3,
  // money (js/economy.js): absolute, scaled by population
  taxRate: 0.08, treasuryCapDays: 400, hoardDays: 200, hoardFloor: 0.25, startTreasuryDays: 60,
  upkeepInfra: 0.004, upkeepMil: 0.008, upkeepMed: 0.004, upkeepTech: 0.5, decayInfra: 0.03, decayMil: 0.05, decayMed: 0.03,
  interestRate: 0.0005, creditDays: 180, debtDear: 1, creditMemory: 1825, warCostForce: 0.01, milCostFactor: 0.75, projectDays: 30, investDays: 20, researchDays: 15, reactPremium: 1.5,
  tributeDays: 30, warChestDays: 30,
  // production and growth (js/economy.js)
  accessBase: 0.4, accessInfra: 0.35, accessTech: 0.35, stockDays: 30, vitalStockDays: 180, drainSmooth: 0.1, stockFill: 0.1, buyDays: 3, energyVital: 0.5, desalRate: 0.8, desalEnergy: 0.67,
  capBase: 50, capInfra: 1, capTech: 1, growthBase: 0.00025, growthTech: 0.6, shortageBite: 0.1, degrowthRate: 0.001, degrowthMax: 0.0002,
  boomRise: 0.0007, boomFloor: 0.2, bustBoomMin: 0.25, bustShort: 1, bustOver: 0.15, bustMin: 0.05, bustMax: 0.3, bustDays: 270, creditBoom: 0.2, capClose: 0.02,
  warDragG: 0.5, outbreakDragG: 0.5, recessionDragG: 0.5, visitorGrowth: 0.00005, econRef: 100, ecoIndexRef: 50, ecoIndexSlope: 30, reportDays: 90, reportGrowth: 0.06, reportGap: 180,
  // people
  birthBase: 0.00009, deathBase: 0.00003, famineBelow: 0.97, deathFamine: 0.003, deathMax: 0.00025, deathCrowd: 0.0005, birthMed: 1.2, birthCoverDays: 90, birthStoreFloor: 0.5, rationMax: 0.2, rationSharp: 10, rationCoverDays: 180, rationRate: 0.05, rationBirth: 0.6, rationStab: 10, workforceDays: 730,
  // the exchange
  priceBase: 1, priceElastic: 0.05, priceRevert: 0.01, priceMin: 0.2, priceMax: 20, worldStockDays: 10, marketSpread: 0.05, priceLimit: 3, brokeVitalShare: 0.35,
  coverRef: 10, coverMin: 0.5, priceCurve: 0.7, crashCover: 2, crashPrice: 5, crashGap: 1095, reserveMin: 0.9, reserveCashMin: 0.25, reserveWaste: 0.3, reserveCapShare: 0.5,
  floorMark: 1.3, cartelTerm: 365, cartelAnger: 0.05, cartelRelHit: 5, cartelAngerFloor: -20, cartelHoldMin: 0.15, cartelPartners: 3, cartelDemand: 0.02, cartelRel: 3,
  marketDistance: 0.25, marketFrictionMax: 0.4, distFallback: 8000,
  dealTerm: 180, dealsPerPair: 2, dealSpareShare: 0.5, dealMoneyShare: 0.15, dealMin: 0.0002, dealSlot: 0.1, dealSure: 0.1, dealRel: 12,
  dealHunger: 2, dealShortNeed: 2, dealNeedMax: 3, dealPremiumShare: 0.5, dealSpareScale: 0.15, dealSpareTop: 0.9,
  dealBreakDays: 30, dealBreakRel: 10, dealShortAt: 0.9, partnerBase: 2, partnerInfra: 6, partnerSpare: 3, seedDealRel: 50,
  techShareCap: 0.9, techTerm: 0.05, techValue: 0.02, techGapMin: 15, techAbsorbBase: 0.3, techAbsorbInfra: 0.4, techAbsorbEco: 0.3,
  pactBreakRel: -10, pactBreakRelLoss: 8, relRevert: 0.002, thirdParty: 0.25, pairPrune: 1,
  pactBase: 30, dealBase: 12, sanctionBase: 25, tieFriend: 40, tieFoe: -40, warRipple: 10,
  sanctionAt: -30, sanctionLift: -10, sanctionRel: 15, sanctionMax: 0.9, sanctionBite: 2,
  // decisions
  decideTemp: 0.05, riskAversion: 1,
  valueOfInfra: 0.1, valueOfMilitary: 0.08, valueOfAcademia: 0.2, valueOfMedical: 0.12, valueOfStability: 0.12, valueOfTechnology: 0.12, valueOfLegit: 0.1, valueOfMod: 20,
  valueOfRel: 0.005, valueOfSpite: 0.5, sanctionSpite: 0.3, securityWorth: 0.5, pactInsure: 0.25, pactDrag: 0.15, dealSecurity: 0.05,
  wearyCost: 60, warSharp: 2, warStabMin: 40, riskReach: 0.5,
  frailStab: 35, warOpportunity: 0.5, warPreempt: 0.5, warRevanche: 0.4, borderWorth: 0.3, borderEcoCost: 0.05, reactTemp: 0.6,
  investStep: 5, researchStep: 3, projectGainTop: 1.2,
  reserveBase: 10, reserveThrift: 50, horizonBase: 90, horizonCaution: 180, budgetMonths: 2, borderMin: 0.02,
  // government
  collapseFloor: 15, collapseDays: 30, regimeGrace: 180, electionYears: 4, electionNudge: 8, coupChance: 0.02,
  powerDraw: 2, enactDays: 10, enactCooldown: 730, coerceStab: 25, coerceFloor: 40, coerceMilFloor: 0.4, coerceDays: 1, liberalLegit: 60, liberalEco: 60, liberalStab: 50, liberalChance: 0.00015,
  legitBase: 85, legitFit: 1, legitShort: 0.5, legitDecline: 1, legitGrowth: 0.5, legitOccupied: 15, legitDefeat: 10, legitDisgrace: 15, legitFamine: 30, legitBust: 10,
  electionFreedom: 35, strongmanSwing: 15, electionUnpopular: 60, electionSwingMult: 2, strongmanStab: 40, strongmanLegit: 35,
  labelAuth1: 45, labelAuth2: 70, labelFree1: 35, labelFree2: 60, coupRel: 40, successionNudge: 8, successionCrisisStab: 15, monarchDeath: 0.0001,
  appointNudge: 10, appointRate: 0.0009, congressNudge: 6, congressRate: 0.0007, purgeAuthority: 10, purgeFreedom: 10, purgeStab: 8,
  coupAuthority: 40, coupFreedom: 30, coupEconOpen: 10, revoltAuthority: 15, revoltFreedom: 20,
  reformAuthority: 10, reformFreedom: 15, reformFreedomMin: 45, revoltLegit: 35, reformChance: 0.003,
  techRevTech: 90, techRevAcademia: 80, techRevChance: 0.0005, techRevEconOpen: 12, techRevFreedom: 6,
  coupSuccessBase: 0.5, coupSuccessLegit: 0.6, coupFailRally: 10, coupFailRel: 30, coupDisgraceDays: 180, defeatDays: 365, defeatAuthority: 25, releaseStab: 30, relGovGap: 0.3,
  govGrowthOpen: 0.3, govOrderClosed: 0.3, govOrderParty: 0.2, gunsBase: 0.35, govGunsAuth: 0.4, govGunsMilitary: 0.3, wantMilBase: 20, wantMilGuns: 30, wantMilThreat: 30, govScienceFree: 0.2, govScienceBill: 0.6, wantInfraShort: 40, wantInfraExport: 10, wantInfraPriceCap: 2, govStandingCrown: 0.2,
  reserveAuth: 20, horizonCrown: 1.5, horizonJunta: 0.7,
  // war and occupation
  warMinRatio: 1.1, warPace: 0.02, warSwing: 5, warNoise: 0.02, warMaxDays: 240, pactShare: 0.3, contributeMin: 0.05,
  warAttrEco: 0.0008, warAttrInfra: 0.05, warAttrStab: 0.03, allyMilAttr: 0.15, warFlow: 0.1,
  enmityPower: 2, joinRelFriend: 10, joinRelFoe: 30, joinRelFoeFloor: -50, victoryStab: 5, victoryRel: -60, occupyAuthDiv: 200,
  errBase: 0.1, errAuthority: 0.3, errAggr: 0.15, techLow: 35, techHigh: 70,
  refuseTrust: 0.3, trustRecover: 0.002,
  mobilDays: 10, mobilStep: 12, mobilPremium: 1.5, mobilStab: 5, demobRate: 0.1, supplyLine: 1,
  warMilAtt: 0.2, warMilDef: 0.12, warDeathAtt: 0.00015, warDeathDef: 0.0003, warDeathCost: 40, allyAttr: 0.5, allyDeath: 0.3, warTechRate: 0.02, warTechCap: 0.9,
  peaceRetry: 30, peaceEarliest: 10, peaceScar: 20, stalemateDays: 45, stalemateBand: 0.15, truceMin: 0.7, truceMax: 1.5, warMemoryDays: 1095, warMemoryDiscount: 0.7, satietyDiscount: 0.5, peaceTermsMin: 0.2, peaceIndemnity: 0.3, peaceTermDays: 365, peaceLeaseShare: 0.25,
  upriseStability: 25, upriseBase: 0.004, upriseHold: 0.7, upriseLevy: 1, occupyLevy: 0.3, occupyGarrison: 0.2, garrisonShare: 0.25, upriseMil: 3, upriseWeary: 15, upriseStabGain: 10,
  truceDays: 365, occupyChance: 0.5, occupyDaysBase: 360, occupySkim: 0.5, occupyIndemnity: 0.2, occupyStab: 0.05, occupyShift: 0.5,
  warRelMax: 20, reachSea: 0.5, reachAir: 0.15, domainPenalty: 1.5, frontShareMin: 0.1,
  defenceBonus: 1.3, terrainDefence: 1,
  wearyWar: 40, wearyPerDay: 0.4, wearyDecay: 0.1, wearyStab: 0.1, peaceRel: 40, truceRel: -30,
  // scale: population supplies size; stats stay per-head levels
  popPerKm: 0.0045, popOvershoot: 0.1, inertiaPop: 0.25, mulTechMil: 0.3, mulInfraMil: 0.2,
  coupForceRatio: 3, powerForce: 2000, areaFallback: 200000,
  worldBalance0: 1.3, materialsBalance0: 1.25, energyBalance0: 1.45, energyTechProd: 0.4, energyTechEff: 0.3, matTechProd: 0.4, matTechEff: 0.3, needEnergyTech: 0.075, techEnergyCurve: 2, decayTech: 0.015, needFood: 1, needWater: 1, needEnergyOut: 0.004, needEnergyMil: 0.00067, needMatOut: 0.003, needMatMil: 0.0005,
  // resources: four types, produced from a fixed potential, consumed, stocked and traded (js/economy.js)
  resourceFind: 5, findTail: 0.5, findCap: 45, findPrice: 1, findPriceCap: 2, resMax: 200, resCurve: 1.5, findBase: 0.02, findTech: 0.1, findGrow: 0.06, findLand: 0.06, findNeed: 0.06, findGrowth: 0.02, occupyRes: 0.5, dealCrowd: 0.2, billSmooth: 0.1,
  blowSmall: 0.01, blowLarge: 0.04, blowCata: 0.12, strikeSmall: 0.01, strikeBig: 0.03,
  waterWeather: 0.3, foodWeather: 0.15, droughtFood: 0.3, floodFood: 0.2,
  // events and diffusion
  pSmall: 0.0033, pLarge: 0.00027, pMassive: 0.008, catastrophicShare: 0.07, devastateInfra: 40, shockSpread: 0.3, aidFrac: 0.02, aidShare: 0.3, aidDays: 60, aidRel: 20,
  techStep: 4, breakthroughShare: 0.3, breakthroughDays: 180, breakthroughMult: 1.5,
  diffuseTrade: 0.25, diffusePact: 0.35, diffuseAcademia: 0.15, recessionDays: 120, eraDays: 180, eraMult: 3,
  diffuseBase: 0.12, diffuseGain: 0.6, diffuseCap: 0.9, diffuseMedical: 1.5, diffuseStop: 0.9, diffuseDays: 730,
  trackLen: 3, trackHold: 0.7, quakeRadiusKm: 500, footprintChance: 0.35,
  deathSmall: 0.00002, deathLarge: 0.0005, deathCata: 0.005, deathCapSmall: 0.01, deathCapLarge: 0.15, deathCapCata: 1,
  refugeeRate: 0.01, refugeeRel: 20, returnRate: 0.02, returnBalance: 0.9, rebuildDays: 365, rebuildDiscount: 0.5, smokeFood: 0.1,
  warFleeAt: 0.3, warRefugeeRate: 0.02, cascadeStock: 0.5, cascadePrice: 1.5,
  // detection and response
  detectMedical: 0.9, pactShareResp: 0.6, reactFloor: 0.3, wReact: 1.5, travelBan: 0.2, travelBanDays: 90,
};
window.ENTITY_CONFIG = ENTITY_CONFIG;

const W = window.WORLD;
const { COUNTRY_STATE, regionMembers, regionAgg, globalResponse, anyCovered,
        onWorldMapReady, installMapSync, syncMapColors, spreadTick, responseTick, updateResponseBar } = W;

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
    ["Map spread", [
      ["localGrowth","local growth / day","p"],["spreadPerFlow","hop chance per unit of flow","p"],
      ["mutationRate","mutation / day","p"],["countryDecay","clean decay / day","p"],
      ["detectionSeverity","detect · base","p"],["detectionSeverityAnti","detect · brewer","p"],
      ["dormancyDampen","dormancy dampen","×"],["actionRate","action growth / day","p"],
      ["actionSlowdown","action slowdown","frac"],["responseRate","response / day","p"],
      ["responseFloor","response · detection floor","frac"]]],
    ["Flows & borders", [
      ["landCap","land capacity","× km^½"],["seaCap","sea capacity","× km^½"],["airCap","air capacity","× hubs"],
      ["seaRange","sea falloff","km"],["airRange","air falloff","km"],["seaK","sea partners","count"],["airK","air partners","count"],
      ["seasonAmp","tourism season swing","frac"],["migBase","migration rate","frac"],
      ["borderRestricted","restricted border","×"],["borderClosed","closed border","×"],
      ["migPopScale","population per migrant","M"]]],
    ["Project rerolls", [["bountyRefreshScrutiny","reroll suspicion cost","pts"]]],
    ["World clock", [["dayMs","real ms per day at 1x","ms"],["maxCatchup","max days per tick","count"],
      ["logCap","news log length","count"]]],
    ["Drift", [["driftFast","stability rate","frac/day"],["driftSlow","academia, technology rate","frac/day"],
      ["driftNoise","daily noise","pts"],["occupiedStab","occupation · stability target","pts"],
      ["outbreakStabDrag","coverage · stability target","pts"],["debtStab","over the credit limit · stability target","pts"],
      ["famineStab","famine · stability target","pts"],["bustStab","a fresh bust · stability target","pts"],["warStab","war · stability target","pts"],["sanctionStab","sanctions · stability target, at full","pts"],["sanctionRef","sanctioning countries that count as full","n"]]],
    ["Money", [["taxRate","tax per unit of output per head per million","/day"],["treasuryCapDays","a treasury holds at most this many days of income","days"],["hoardDays","money above the reserve makes a project cheaper over this many days of income","days"],["hoardFloor","and never cheaper than this share of its cost","frac"],
      ["startTreasuryDays","starting treasury","days of income"],
      ["upkeepInfra","infrastructure upkeep","× level × M /day"],["upkeepMil","army upkeep","× level × M /day"],["upkeepMed","hospitals upkeep","× level × M /day"],["upkeepTech","army upkeep · technology (dearer per soldier)","×"],
      ["decayInfra","infrastructure lost unpaid","pts/day"],["decayMil","army lost unpaid","pts/day"],["decayMed","hospitals lost unpaid","pts/day"],
      ["interestRate","interest on a negative treasury","/day"],["creditDays","credit limit","days of income"],["creditMemory","lenders average income over","days"],
      ["projectDays","an investment pays over","days"],["investDays","an investment costs","days of income"],
      ["researchDays","research costs","days of income"],["reactPremium","emergency spending premium","×"],
      ["tributeDays","tribute after defeat","days of income"],["warChestDays","treasury to start a war","days of income"]]],
    ["Production", [["accessBase","access to the endowment, base","frac"],["accessInfra","access · infrastructure","frac"],
      ["accessTech","access · technology","frac"],["stockDays","stockpile size","days of use"],["vitalStockDays","the food and water granaries hold","days of yield"],["drainSmooth","the store draw is smoothed over","frac/day"],
      ["stockFill","stockpile intake per day","frac of use"],["buyDays","a market purchase covers","days"],["energyVital","share of the reserve energy may be bought with","frac"],
      ["desalRate","desalination per million at full infrastructure and technology","units/day"],["desalEnergy","energy per unit of desalinated water","×"],
      ["capBase","output cap, base","out/head"],["capInfra","cap · infrastructure","×"],["capTech","cap · technology","×"],
      ["growthBase","growth at full balance","frac/day"],["growthTech","growth · technology","×"],
      ["shortageBite","balance below which the economy contracts","frac"],["degrowthRate","contraction per unit of shortfall","frac/day"],
      ["degrowthMax","fastest contraction","frac/day"],
      ["boomRise","confidence builds toward full by","frac/day"],["boomFloor","growth pace with no confidence","frac"],["bustBoomMin","confidence a shortage needs to break into a bust","frac"],
      ["bustShort","bust · the shortfall","×"],["bustOver","bust · confidence (the overshoot)","×"],["bustMin","a bust cuts output by at least","frac"],["bustMax","and at most","frac"],
      ["bustDays","no growth after a bust for","days"],["creditBoom","share of credit that follows confidence","frac"],["capClose","money over the treasury cap bleeds away by","frac/day"],["warDragG","war · growth","frac"],["outbreakDragG","coverage · growth","frac"],
      ["recessionDragG","global recession · growth","frac"],["visitorGrowth","tourists · growth","frac/day"],
      ["econRef","output per head at which growth saturates","out/head"],["ecoIndexRef","output per head read as an economy of 50","out/head"],["ecoIndexSlope","economy index gained per doubling of output","pts"],["reportDays","growth is judged over","days"],["reportGrowth","change over that period that makes a headline","frac"],["reportGap","days between a country's headlines","days"]]],
    ["People", [["birthBase","births at full food, water and hospitals","frac/day"],["deathBase","deaths, base","frac/day"],
      ["famineBelow","famine begins below this fed share","frac"],
      ["deathFamine","deaths per unit of famine","frac/day"],["deathMax","deaths, at most","frac/day"],["deathCrowd","deaths per unit over capacity","frac/day"],["birthMed","hospitals lower births: 1 + this x (0.5 - medical/100)","x"],["birthCoverDays","births fall once the food will last under","days"],["birthStoreFloor","and reach this share with the stores gone","frac"],["rationMax","a fully legitimate regime cuts food and water per head by up to","frac"],["rationSharp","a shortfall of one over this share calls for full rations","x"],["rationCoverDays","rationing starts when the stores will not last","days"],["rationRate","rations move toward their target by","frac/day"],["rationBirth","full rations cut births by","frac"],["rationStab","stability target at full rations","pts"],["workforceDays","the workforce follows the people over","days"]]],
    ["Exchange", [["priceBase","price a type reverts toward","money/unit"],["priceElastic","price move per unit of imbalance","×"],
      ["priceRevert","reversion toward the base","frac/day"],["priceMin","floor","money/unit"],["priceMax","ceiling","money/unit"],
      ["worldStockDays","the world stock holds","days of world use"],["marketSpread","buyer's spread","frac"],["brokeVitalShare","a country past its credit may still spend","frac of the day’s takings"],
      ["priceLimit","buying ahead into the stores stops above this multiple of the base","×"],
      ["coverRef","days of world cover at which a price rests at its base","days"],["coverMin","cover below which the price stops rising","days"],
      ["priceCurve","how steeply the resting price answers cover","exp"],
      ["crashCover","a crash when a type's world cover falls under","days"],["crashPrice","and its price is at least","money/unit"],["crashGap","crashes at most once in","days"],
      ["reserveMin","no seller takes less than this share of the base","frac"],["reserveCashMin","a seller short of cash goes down to this share of its floor","frac"],
      ["reserveWaste","how far a surplus that would be wasted lowers the floor","frac"],["reserveCapShare","cash that counts as comfortable, at most this share of the treasury cap","frac"],
      ["floorMark","a cartel floor sits this far over the resting price","×"],["cartelTerm","a price floor runs for","days"],
      ["cartelAnger","a buyer resents a cartel above this bill share","frac of income"],["cartelDemand","no floor unless the world imports this share of its use of the type","frac"],["cartelRel","relations a price floor brings","pts"],
      ["cartelRelHit","relations a resentful buyer loses with each member","pts"],["cartelAngerFloor","resentment stops at","pts"],
      ["cartelHoldMin","share of the world's spare a pair needs to propose a floor","frac"],["cartelPartners","floor deals a country holds per type, at most","n"],
      ["marketDistance","transport premium per 10,000 km to the sellers","frac"],
      ["marketFrictionMax","most the distance can add or take away","frac"],
      ["distFallback","distance used before the map arrives","km"]]],
    ["Deals", [["dealTerm","a deal runs for","days"],["dealHunger","food or water is worth this much more per unit of famine","×"],["dealShortNeed","and per unit of today's shortfall","×"],["dealNeedMax","at most this multiple of the world price","×"],["dealPremiumShare","share of that extra worth paid to the giver","frac"],["dealSpareScale","share of a surplus committed · surplus over own use","frac"],["dealSpareTop","a country commits at most this share of a surplus","frac"],["dealsPerPair","deals allowed between two countries","n"],
      ["dealSpareShare","share of a surplus a country will commit","frac"],["dealMoneyShare","money a deal may cost","frac of income"],
      ["dealMin","a deal must be worth this much to both sides","frac of income"],
      ["dealSlot","premium for a cargo that needs no market order","frac"],
      ["dealSure","premium for a buyer who is certain to take it","frac"],
      ["dealRel","relations gained by a deal, at full size","pts"],["dealBreakDays","days undelivered before a deal breaks","days"],
      ["dealBreakRel","relations lost when a deal breaks","pts"],["dealShortAt","delivering less than this counts as short","frac"],
      ["partnerBase","deals a country can run, base","n"],["partnerInfra","deals · infrastructure","n"],["partnerSpare","deals · surplus over own use, to twice","n"],
      ["seedDealRel","relations needed for a deal at world creation","pts"]]],
    ["Technology sharing", [["techShareCap","a receiver climbs to this share of the provider","frac"],
      ["techTerm","technology rate in a deal term","pts/day"],["techValue","technology term's worth to the receiver","frac of income"],
      ["techGapMin","gap before technology can stand in for money","pts"],
      ["techAbsorbBase","absorption, base","×"],["techAbsorbInfra","absorption · infrastructure","×"],["techAbsorbEco","absorption · economy","×"]]],
    ["Relations & sanctions", [["pactBreakRel","relations below which a pact is left","pts"],
      ["pactBreakRelLoss","relations lost by leaving one","pts"],["relRevert","relations return to their resting point","frac/day"],["pairPrune","a pair with no ties this close to rest is forgotten","pts"],
      ["pactBase","a live pact raises the resting point by","pts"],["dealBase","each live deal raises it by","pts"],
      ["sanctionBase","sanctions lower it by","pts"],
      ["thirdParty","share of a step felt by friends and enemies","frac"],
      ["tieFriend","relations that count as a friend","pts"],["tieFoe","relations that count as an enemy","pts"],
      ["warRipple","relations step rippled by a declaration","pts"],
      ["sanctionAt","relations at which sanctions are imposed","pts"],["sanctionLift","relations at which they are lifted","pts"],
      ["sanctionRel","relations lost by sanctioning","pts"],
      ["sanctionMax","most of the market a target can lose","frac"],["sanctionBite","sanctioners' economic weight · access lost","×"]]],
    ["Decisions", [["decideTemp","softmax temperature, in income a day","frac"],["riskAversion","a risk discounts a value by this × (0.5 + caution)","×"],
      ["valueOfInfra","a point of infrastructure short of its want, per day","income-days"],["valueOfMilitary","a point of military, per day","income-days"],["warDeathCost","the dead, per percent of the people","income-days"],
      ["valueOfAcademia","a point of academia, per day","income-days"],["valueOfMedical","a point of medical, per day","income-days"],
      ["valueOfStability","a point of stability, per day","income-days"],["valueOfTechnology","a point of technology, per day","income-days"],["valueOfLegit","a point of legitimacy is worth, a day","income-days"],["valueOfMod","a standing programme is worth, a day","income-days"],
      ["valueOfRel","a point of relations with an equal, per day","income-days"],["valueOfSpite","hurting an enemy at full enmity, per day","income-days"],
      ["sanctionSpite","a sanction delivers this share of a war's satisfaction","frac"],["securityWorth","full cover against a threat as large as us, per day","income-days"],
      ["pactInsure","a pact's cover with no threat in sight, as a share of full cover","frac"],["pactDrag","risk of a pact per enemy the partner has","frac"],["dealSecurity","a deal covering all our use of a type, beyond its price, per day","income-days"],
      ["frailStab","stability below which a country is seen as ripe for conquest","pts"],["warOpportunity","a broken target adds this share of the prize","×"],["warPreempt","a hostile neighbour arming, per day","income-days"],["warRevanche","a war lost to them, still fresh, per day","income-days"],["peaceRetry","a refused offer of peace is not repeated for","days"],["peaceEarliest","no offer of peace before","days of war"],["peaceScar","peace leaves relations this far below where the war began","pts"],
      ["stalemateDays","a front that has not moved for this long is a stalemate","days"],["stalemateBand","the move that resets that clock","score"],
      ["truceMin","a truce lasts at least this share of truceDays","×"],["truceMax","and at most this share","×"],
      ["warMemoryDays","a war lost or drawn against a country is remembered for","days"],["warMemoryDiscount","and discounts the next estimate of it by","×"],["satietyDiscount","a country beaten within that memory is worth this share of its prize","×"],["wearyCost","a war at full weariness costs","income-days"],
      ["warSharp","how sharply the odds become a chance of winning","exp"],["warStabMin","no war below stability","pts"],["riskReach","risk added to a war by air or sea","frac"],
      ["borderWorth","full cover from a closed border, per day","income-days"],["borderEcoCost","a level of border control costs, per day","income-days"],
      ["reactTemp","softmax temperature of an outbreak reaction","×"],["investStep","invest gain","pts"],["projectGainTop","a project's gain falls from this to zero as the level nears 100","×"],["researchStep","research gain","pts"],
      ["debtDear","borrowed money is this much dearer at the credit limit","x"],["warCostForce","a day of war costs this per unit of force","money"],["milCostFactor","a military project costs this much of an ordinary one","x"],["reserveBase","money kept back, base","days of income"],["reserveThrift","money kept back · thrift","days of income"],
      ["horizonBase","planning horizon, base","days"],["horizonCaution","planning horizon · caution","days"],
      ["budgetMonths","upkeep is cut when the treasury cannot carry this many months of it","months"],
      ["borderMin","a border change needs at least this much reason","income/day"]]],
    ["Government", [["collapseFloor","collapse below stability","pts"],["collapseDays","days below floor","days"],
      ["regimeGrace","a new regime is not judged for","days"],["powerDraw","powers a new government draws","n"],["enactDays","an act of the programme costs","days of income"],["enactCooldown","and is not repeated for","days"],
      ["coerceStab","coercion (authority over the floor x the army) · stability target","pts"],["coerceFloor","authority below which a regime coerces nothing","pts"],["coerceMilFloor","the army's share of coercion with no army at all","frac"],["coerceDays","a fully coercive regime outlasts a crisis this much longer","×"],
      ["liberalLegit","legitimacy an autocracy needs to liberalise","pts"],["liberalEco","and the economy index","pts"],["liberalStab","and the stability","pts"],["liberalChance","liberalisation, when possible","p/day"],
      ["electionYears","election interval","years"],["electionNudge","election swing","pts"],["coupChance","foreign coup chance","p/month"],
      ["electionFreedom","freedom below which the winner cancels elections","pts"],["strongmanSwing","authority gained by a strongman ticket","pts"],
      ["electionUnpopular","legitimacy below which the incumbent is thrown out","pts"],["electionSwingMult","and the swing grows by","×"],
      ["strongmanStab","stability below which a strongman ticket wins","pts"],["strongmanLegit","legitimacy below which it wins","pts"],
      ["labelAuth1","label: authority for the middle row","pts"],["labelAuth2","label: authority for the top row","pts"],
      ["labelFree1","label: freedom for the middle column","pts"],["labelFree2","label: freedom for the right column","pts"],
      ["coupRel","relations a successful backed coup buys its sponsor","pts"],
      ["successionNudge","swing when a monarch dies","pts"],["successionCrisisStab","stability lost in a contested succession","pts"],
      ["monarchDeath","a monarch dies","p/day"],["appointNudge","swing when a junta appoints","pts"],["appointRate","a junta appoints","p/day"],
      ["congressNudge","swing at a party congress","pts"],["congressRate","a party meets","p/day"],
      ["purgeAuthority","a purge · authority","pts"],["purgeFreedom","a purge · freedom lost","pts"],["purgeStab","a purge · stability gained","pts"],
      ["coupAuthority","a coup · authority","pts"],["coupFreedom","a coup · freedom lost","pts"],["coupEconOpen","a coup · openness lost","pts"],
      ["revoltAuthority","violent revolution · base authority lost","pts"],["revoltFreedom","violent revolution · base freedom gained","pts"],
      ["reformAuthority","peaceful revolution · base authority lost","pts"],["reformFreedom","peaceful revolution · base freedom gained","pts"],
      ["reformFreedomMin","freedom needed for a peaceful revolution","pts"],["revoltLegit","legitimacy below which revolutions brew","pts"],
      ["reformChance","peaceful revolution, when it brews","p/day"],
      ["techRevTech","technological revolution · technology needed","pts"],["techRevAcademia","technological revolution · academia needed","pts"],
      ["techRevChance","technological revolution, when possible","p/day"],["techRevEconOpen","it opens the base by","pts"],["techRevFreedom","and frees it by","pts"],
      ["coupSuccessBase","a backed coup succeeds, base","p"],["coupSuccessLegit","less per point of legitimacy above 50","p/100"],
      ["coupFailRally","a failed coup rallies the target","stability"],["coupFailRel","and costs the sponsor relations","pts"],
      ["coupDisgraceDays","the sponsor's disgrace lasts","days"],["defeatDays","a defeat weighs on legitimacy for","days"],
      ["defeatAuthority","a defeat shakes the regime's authority by","pts"],["releaseStab","stability a country is left with when an occupation ends","pts"],
      ["relGovGap","relations lost per point of difference in freedom and openness","pts"]]],
    ["Legitimacy", [["legitBase","legitimacy before anything counts against it","pts"],["legitFit","lost per point the regime sits from the nation's base","pts"],
      ["legitShort","lost per percent of the worst shortage","pts"],["legitDecline","lost per percent of annual decline","pts"],
      ["legitGrowth","gained per percent of annual growth","pts"],["legitOccupied","lost under occupation","pts"],["legitDefeat","lost after a defeat","pts"],
      ["legitDisgrace","lost while a backed coup's failure is fresh","pts"],["legitFamine","lost at full famine","pts"],["legitBust","lost while a bust is fresh","pts"]]],
    ["Government & priorities", [["govGrowthOpen","growth weight · economic openness","×"],["govOrderClosed","order weight · lack of freedom","×"],
      ["govOrderParty","order weight of a party state","+"],["gunsBase","guns weight, base","+"],["govGunsAuth","guns weight · authority","×"],["wantMilBase","wanted army, base","pts"],["wantMilGuns","wanted army · guns weight","pts"],["wantMilThreat","wanted army at a full threat","pts"],["govGunsMilitary","guns weight of a junta","+"],
      ["govScienceFree","science weight · freedom","×"],["govScienceBill","science weight · the market bill against income","×"],["wantInfraShort","wanted infrastructure at a total shortage","pts"],["wantInfraExport","wanted infrastructure per unit of price over base, for each type exported","pts"],["wantInfraPriceCap","that price excess counts up to","x"],["govStandingCrown","standing weight of a crown","+"],
      ["reserveAuth","money kept back · authority","days of income"],["horizonCrown","a crown's horizon","×"],["horizonJunta","a junta's horizon","×"]]],
    ["War & occupation", [["warMinRatio","military ratio to attack","×"],["warSwing","most the front moves a day, in odds","×"],
      ["warPace","score per strength gap","/day"],["warNoise","score noise","/day"],["warMaxDays","stalemate after","days"],
      ["pactShare","allies’ military counted","frac"],["contributeMin","an ally is called if it can reach the enemy or its counted force is this share of ours","frac"],["warAttrEco","output lost","frac/day"],["warAttrInfra","infrastructure lost","/day"],
      ["warAttrStab","stability lost","/day"],["allyMilAttr","military lost by an ally","/day"],
      ["enmityPower","how steeply hostility becomes a war motive","exp"],["joinRelFriend","relations gained with a friend by joining its war","pts"],
      ["joinRelFoe","relations lost with its enemy","pts"],["joinRelFoeFloor","and never above this afterwards","pts"],
      ["victoryStab","stability a victory brings","pts"],["victoryRel","relations after a victory","pts"],["occupyAuthDiv","authority over this adds to the occupation chance","÷"],["warFlow","travel across a front","×"],["occupyChance","occupation after victory","p"],
      ["errBase","misjudgement of a war, base","frac"],["errAuthority","misjudgement · authority without freedom","frac"],["errAggr","misjudgement · aggression","frac"],
      ["techLow","technology to cross a sea lane","pts"],["techHigh","technology to strike by air","pts"],
      ["refuseTrust","trust left in an ally that refused a call","frac"],["trustRecover","trust mends by","frac/day"],
      ["mobilDays","mobilisation takes","days"],["mobilStep","military gained by mobilising, at level 0","pts"],["mobilPremium","its cost against an ordinary project","×"],
      ["mobilStab","stability it costs","pts"],["demobRate","reserves stand down after a war","pts/day"],
      ["supplyLine","attacker's attrition grows with distance from home","×"],
      ["warMilAtt","military the attacker spends","/day"],["warMilDef","military the defender spends","/day"],
      ["warDeathAtt","attacker's people lost","frac/day"],["warDeathDef","defender's people lost","frac/day"],
      ["allyAttr","an ally's share of attrition","frac"],["allyDeath","an ally's share of deaths","frac"],
      ["warTechRate","the weaker side learns under fire","pts/day"],["warTechCap","up to this share of the other","frac"],
      ["peaceTermsMin","margin needed for terms","score"],["peaceIndemnity","indemnity per point of margin","frac of income/day"],
      ["peaceTermDays","terms run for","days"],["peaceLeaseShare","share of a spare resource leased","frac"],
      ["upriseStability","uprisings below stability","pts"],["upriseBase","uprising, when restless and unheld","p/day"],["upriseHold","a fully held territory rises this much less","frac"],["upriseLevy","the levy raises the uprising rate by this x its share","×"],
      ["occupyLevy","share of a held territory's people the occupier levies","frac"],["occupyGarrison","garrison needed, as a share of the occupied country's own force","frac"],["garrisonShare","share of its own force an occupier will post as garrisons","frac"],
      ["upriseMil","the garrison lost","pts"],["upriseWeary","weariness it costs the occupier","pts"],["upriseStabGain","stability an uprising restores","pts"],
      ["truceDays","no new war between two countries after one ends","days"],["occupyDaysBase","occupation length","days"],["occupySkim","income skimmed","frac"],["occupyIndemnity","the victor's indemnity on top, while the occupation holds","frac of income"],["occupyStab","stability lost under occupation","/day"],
      ["occupyShift","axes shift on release","frac"],
      ["warRelMax","no war on friends above relations","pts"],
      ["reachSea","reach across a sea lane: the pace of a front and the force it draws","×"],["reachAir","reach by air only","×"],
      ["domainPenalty","military lost by a defender that cannot contest a sea or air front","×"],["frontShareMin","least share of its force a country keeps on any front","frac"],
      ["wearyWar","weariness per war started","pts"],["wearyPerDay","weariness per war day","pts"],
      ["wearyDecay","weariness shed at peace","pts/day"],["wearyStab","weariness · stability target","×"],
      ["peaceRel","relations gained at peace","pts"],["truceRel","relations at least this after peace","pts"],
      ["defenceBonus","defender’s strength","×"],["terrainDefence","mountain border · defender","×"]]],
    ["Scale", [["popPerKm","capacity per km² at full urban share","M"],["popOvershoot","capacity check tolerance (the smoke test only)","frac"],
      ["inertiaPop","drift slows with log population","×"],
      ["mulTechMil","technology · force","×"],["mulInfraMil","infrastructure · force","×"],
      ["coupForceRatio","sponsor force over target to coup","×"],["powerForce","force that counts as a great power","force"],
      ["areaFallback","area before the map arrives","km²"],["worldBalance0","world production over need at the start","×"],["materialsBalance0","the same for materials, the type growth binds on","×"],["energyBalance0","the same for energy","×"],
      ["energyTechProd","technology · energy production","×"],["energyTechEff","technology · energy needed per unit of output","frac"],
      ["matTechProd","technology · materials production","×"],["matTechEff","technology · materials needed per unit of output","frac"],
      ["needEnergyTech","energy per million people at full technology","/day"],["techEnergyCurve","how steeply the laboratories' energy climbs with technology","exp"],["decayTech","technology lost per day at a full energy outage","pts"],
      ["needFood","food per million people","/day"],["needWater","water per million people","/day"],
      ["needEnergyOut","energy per unit of output","/day"],["needEnergyMil","energy per unit of force","/day"],
      ["needMatOut","materials per unit of output","/day"],["needMatMil","materials per unit of force","/day"]]],
    ["Resources", [["resourceFind","the ordinary find, at half again at full technology","pts"],["findTail","how long the tail of exceptional finds is","exp"],["findCap","the largest a single find can be","pts"],["findPrice","a find favours a type by this per unit of its price over base","x"],["findPriceCap","that price excess counts up to","x"],["resMax","an endowment can be built by discovery up to","pts"],["resCurve","how steeply an endowment turns into production","exp"],["findBase","a find, by luck alone","weight"],["findTech","a find · technology","weight"],["findGrow","a find · a people outgrowing its land","weight"],["findLand","a find · the ground to look in","weight"],["findNeed","a find · having little already","weight"],["findGrowth","population over its workforce average that counts as fully growing","frac"],["occupyRes","occupied production taken","frac"],
      ["dealCrowd","cost of each deal already held","income-days"],
      ["billSmooth","the market bill's smoothing","frac/day"],
      ["blowSmall","output lost to a small disaster","frac"],["blowLarge","output lost to a large one","frac"],["blowCata","output lost to a catastrophe","frac"],
      ["strikeSmall","output lost to strikes","frac"],["strikeBig","output lost to a general strike","frac"],
      ["waterWeather","weather swing · water","frac"],["foodWeather","weather swing · food","frac"],
      ["droughtFood","drought · food lost","frac"],["floodFood","flood · food lost","frac"]]],
    ["Events", [["pSmall","small event / country","p/day"],["pLarge","large event / country","p/day"],["pMassive","world event","p/day"],
      ["catastrophicShare","catastrophic share of large","frac"],["devastateInfra","catastrophe · infrastructure lost","pts"],
      ["shockSpread","recession contagion","p/partner"],["aidFrac","aid sent","frac treasury"],
      ["aidShare","share of a donor's surplus sent as relief","frac"],["aidRel","relations a donor needs, unless allied","pts"],["aidDays","relief in kind lasts","days"],["techStep","discovery gain","pts"],
      ["breakthroughShare","medical share of discoveries","frac"],["breakthroughDays","breakthrough lasts","days"],["breakthroughMult","detection boost","×"],
      ["diffuseTrade","adopt via trade","p/week"],["diffusePact","adopt via pact","p/week"],["diffuseAcademia","adopt via academia","p/week"],
      ["diffuseBase","how fast discoveries leak at all","×"],["diffuseGain","technology gained per adoption, before absorption","pts"],
      ["diffuseCap","a follower climbs to this share of the origin","frac"],["diffuseMedical","medical gained per adoption","pts"],
      ["diffuseStop","a wave stops at this share of the world","frac"],["diffuseDays","a wave ages out after","days"],
      ["recessionDays","global recession lasts","days"],["eraDays","breakthrough era lasts","days"],["eraMult","era diffusion","×"]]],
    ["Climate & hazards", [["trackLen","countries a hurricane's track can reach","n"],["trackHold","chance the track continues","p"],
      ["quakeRadiusKm","an earthquake is felt within","km"],["footprintChance","a large disaster spills over a border","p"],
      ["deathSmall","deaths, small disaster","frac"],["deathLarge","deaths, large disaster","frac"],["deathCata","deaths, catastrophe","frac"],
      ["deathCapSmall","most a small disaster can kill","M"],["deathCapLarge","most a large one can kill","M"],["deathCapCata","most a catastrophe can kill","M"],
      ["refugeeRate","share who flee a large disaster","frac"],["refugeeRel","relations a host must have","pts"],
      ["returnRate","refugees return, once home is calm","frac/day"],["returnBalance","home counts as calm above this supply","frac"],
      ["rebuildDays","rebuilding stays cheap for","days"],["rebuildDiscount","infrastructure costs this much after a blow","×"],
      ["smokeFood","harvest lost under smoke and dust","frac"],["warFleeAt","people flee a war going this badly","score"],
      ["warRefugeeRate","share who flee a war","frac"],["cascadeStock","a crash empties this much of the world stock","frac"],["cascadePrice","and multiplies prices by","×"]]],
    ["Detection & response", [["detectMedical","medical · detection speed","×"],["pactShareResp","response shared via pacts","frac"],
      ["reactFloor","react above detection","frac"],["wReact","reaction weight","×"],["travelBan","travel under a ban","×"],["travelBanDays","ban lasts","days"]]],
  ];
  body.innerHTML = groups.map(([title, rows]) =>
    `<h4>${title}</h4>` + rows.map(([k, label, unit]) =>
      `<div class="row"><span>${label} <small class="faint">(${unit})</small></span>` +
      `<input type="number" data-key="${k}" step="any" value="${ENTITY_CONFIG[k]}"></div>`).join("")
  ).join("");
  body.querySelectorAll("input[data-key]").forEach(inp => {
    inp.onchange = () => {
      const v = parseFloat(inp.value);
      if (isFinite(v)) ENTITY_CONFIG[inp.dataset.key] = v;
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
  popOf, regionAgg, regionMembers, globalResponse, anyCovered,
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
  spreadTick, responseTick, updateResponseBar,
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
