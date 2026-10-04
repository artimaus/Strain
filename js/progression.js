/* ═══════════════════════════════════════════════════════════════
   Entity — Player progression + world tick
   ═══════════════════════════════════════════════════════════════ */
(() => {
"use strict";
const { $, toast, modal, rgb, dietNames, traitNames } = window.UI;
function init() {
  const S = window.ENTITY;      // shell.js has already run: it loads before this file
  const { player } = S;
  const offerModal    = modal("offerModal",    { dismiss: false });
  const gameOverModal = modal("gameOverModal", { dismiss: false });
  const careerModal   = modal("careerModal");
  const deliverModal  = modal("deliverModal",  { onClose: resetDeliver });
  const TICK_MS = 2000;
  let lastSave = 0;
  let gameHalted = false;
  let tickCounter = 0;

  // ── Project slots: 3 slots, null = lapsed, waiting for next refresh ─────
  let activeBounties = [null, null, null];

  // ── Streak / offer engine ────────────────────────────────────────────────
  function advanceStreaks(mult) {
    if (player.job < S.TITLES.length - 1) {
      player.promoStreak   += mult;
      player.lateralStreak += mult;
    } else {
      player.lateralStreak += mult;
    }
  }
  function rollForOffer() {
    if (player.pendingOffer) return false;
    if (player.job < S.TITLES.length - 1) {
      const med = S.PROMO_STREAK_MED[player.job] ?? 100;
      if (Math.random() < offerChance(player.promoStreak, med)) {
        presentOffer(rollOffer('promo')); return true;
      }
    }
    if (Math.random() < offerChance(player.lateralStreak, S.LATERAL_STREAK_MED)) {
      presentOffer(rollOffer('lateral')); return true;
    }
    return false;
  }
  function maybeFireOffer(notoriety) {
    if (player.pendingOffer) return;
    advanceStreaks(S.notorietyMult(notoriety));
    rollForOffer();
  }
  function offerChance(streak, med) {
    return Math.min(S.OFFER_CHANCE_CAP, streak / (med * 2) * S.OFFER_CHANCE_CAP);
  }
  function rollOffer(type) {
    const idx = type === 'promo' ? player.job + 1 : player.job;
    if (idx >= S.TITLES.length) return null;
    const t = S.TITLES[idx];
    const sal   = Math.max(1, Math.round(t.salaryMed  * (1 + S.rollNormal(0, 0.15))));
    const floor = Math.max(1, Math.round(t.floorMed   * (1 + S.rollNormal(0, 0.15))));
    const bump  = Math.max(2, Math.round(t.floorMed * 0.4 * (1 + S.rollNormal(0, 0.2))));
    return { type, titleIdx:idx, title:t.name, salary:sal, floor, scrutinyBump:bump };
  }

  // ── Player tick ──────────────────────────────────────────────────────────
  function playerTick() {
    if (gameHalted) return;
    const cfg = S.ENTITY_CONFIG || {};
    player.money += player.salary * (cfg.incomeFactor ?? 0.1);
    // Suspicion decays toward the scrutiny floor your title attracts.
    if (player.scrutiny > player.scrutinyFloor)
      player.scrutiny = Math.max(player.scrutinyFloor,
        player.scrutiny - (cfg.scrutinyDecay ?? 0.12));
    let changed = false;
    for (let i = 0; i < activeBounties.length; i++) {
      if (!activeBounties[i]) continue;
      activeBounties[i].ticksLeft--;
      if (activeBounties[i].ticksLeft <= 0) { activeBounties[i] = null; changed = true; }
    }
    if (changed) renderBounties();
    if (Date.now() - lastSave > 30000) saveGame(true);
    S.updateEntityUI();
    renderCareer();
    // periodic nudge so streak clocks still tick between completions
    if (++tickCounter % 40 === 0) maybeFireOffer(player.notoriety || 0);
  }
  setInterval(playerTick, TICK_MS);

  // The world clock (js/world.js) follows the bench's play, pause and
  // speed; nothing on the map moves on its own yet.

  // ── Research projects ────────────────────────────────────────────────────
  function refreshBounties() {
    for (let i = 0; i < 3; i++) {
      if (activeBounties[i]) continue;
      activeBounties[i] = S.generateBounty(player.job) || null;
    }
    renderBounties();
  }
  function forceRefreshBounties() {
    activeBounties = [null, null, null];
    refreshBounties();
  }

  // ── Offer modal ──────────────────────────────────────────────────────────
  function offerCol(label, val, cls, prev) {
    const prevStr = prev != null
      ? '<div class="oc-prev">was ' + prev + '</div>' : '';
    return '<div class="offer-col ' + cls + '"><div class="oc-lbl">' + label + '</div>'
         + '<div class="oc-val">' + val + '</div>' + prevStr + '</div>';
  }
  function presentOffer(offer) {
    if (!offer) return;
    player.pendingOffer = offer;
    gameHalted = true;
    window.ENTITY_SET_HALTED?.(true);
    const isPromo = offer.type === 'promo';
    $("offerTitle").textContent = isPromo ? "Advancement" : "Poaching attempt";
    $("offerFrom").textContent  = S.pickFrom(S.UNIVERSITIES) + " — " + offer.title;
    const dFloor = offer.floor - player.scrutinyFloor;
    $("offerRow").innerHTML =
      offerCol("Salary",     offer.salary,        "neu",  player.salary) +
      offerCol("Scrutiny",   offer.floor + "%",   dFloor <= 0 ? "good" : "hot", player.scrutinyFloor + "%") +
      offerCol("Signing cost", "+" + offer.scrutinyBump, "hot");
    $("offerNote").innerHTML =
      "Signing adds <b>+" + offer.scrutinyBump + " suspicion</b> now and increases your "
      + "scrutiny floor to <b>" + offer.floor + "%</b>. "
      + (isPromo ? "Your advancement streak resets." : "Your academic interest resets.");
    offerModal.open();
    $("offerAccept").onclick  = () => acceptOffer(offer);
    $("offerDecline").onclick = () => declineOffer(offer);
  }
  function closeOffer() {
    offerModal.close();
    player.pendingOffer = null;
    gameHalted = false;
    window.ENTITY_SET_HALTED?.(false);
  }
  function acceptOffer(offer) {
    closeOffer();
    player.job           = offer.titleIdx;
    player.salary        = offer.salary;
    player.scrutinyFloor = offer.floor;
    player.scrutiny      = Math.min(99, player.scrutiny + offer.scrutinyBump);
    if (offer.type === 'promo') player.promoStreak = 0;
    player.lateralStreak = 0;
    player.careerHistory.unshift({ title:offer.title, salary:offer.salary,
      floor:offer.floor, result:'accepted' });
    if (player.careerHistory.length > 50) player.careerHistory.length = 50;
    if (offer.type === 'promo') {
      forceRefreshBounties();
      toast("🎉 Promoted to <b>" + S.TITLES[offer.titleIdx].name + "</b> — new projects posted");
    } else {
      toast("🔄 Now at <b>" + S.TITLES[offer.titleIdx].name + "</b>");
    }
    S.updateEntityUI(); renderCareer();
  }
  function declineOffer(offer) {
    closeOffer();
    player.careerHistory.unshift({ title:offer.title, salary:offer.salary,
      floor:offer.floor, result:'declined' });
    if (player.careerHistory.length > 50) player.careerHistory.length = 50;
    toast("Declined.");
    renderCareer();
  }

  // ── Career modal ─────────────────────────────────────────────────────────
  function renderCareer() {
    const el = $("careerBody");
    if (!el || !careerModal.isOpen) return;
    const t = S.TITLES[player.job];
    const nxt = S.TITLES[player.job + 1];
    const pf = nxt ? Math.min(1, player.promoStreak  / ((S.PROMO_STREAK_MED[player.job] ?? 100) * 2)) : 1;
    const lf = Math.min(1, player.lateralStreak / (S.LATERAL_STREAK_MED * 2));
    let html =
      '<div class="career-title-block">'
      + '<div class="ctname">' + t.name + '</div>'
      + '<div class="ctrow">'
      + '<span>Salary&nbsp;<b>' + player.salary + '</b></span>'
      + '<span>Scrutiny&nbsp;<b class="scb">' + player.scrutinyFloor + '%</b></span>'
      + '<span>Suspicion&nbsp;<b class="sus">' + Math.round(player.scrutiny) + '%</b></span>'
      + '</div></div>';
    if (nxt) {
      html += '<div class="career-streak">'
        + '<div class="cs-head"><span>Track to <b>' + nxt.name + '</b></span><span>' + Math.round(pf*100) + '%</span></div>'
        + '<div class="track"><div class="fill" style="width:' + Math.round(pf*100) + '%"></div></div></div>';
    } else {
      html += '<div class="career-streak"><div class="cs-head"><span><b>Director</b> — top rank</span></div>'
        + '<div class="track"><div class="fill" style="width:100%"></div></div></div>';
    }
    html += '<div class="career-streak">'
      + '<div class="cs-head"><span>Academic interest</span><span>' + Math.round(lf*100) + '%</span></div>'
      + '<div class="track"><div class="fill lat" style="width:' + Math.round(lf*100) + '%"></div></div></div>';
    html += '<div class="career-hist"><h4>Record</h4>';
    if (!player.careerHistory.length) {
      html += '<div class="he-empty">No offers on record yet.</div>';
    } else {
      html += player.careerHistory.slice(0,12).map(e =>
        '<div class="he"><span class="he-name">' + e.title + '</span>'
        + '<span>' + e.salary + ' &middot; scrutiny ' + e.floor + '%</span>'
        + '<span class="he-tag ' + e.result + '">' + e.result + '</span></div>'
      ).join('');
    }
    html += '</div>';
    el.innerHTML = html;
  }
  $("careerBtn").onclick   = () => { careerModal.isOpen ? careerModal.close() : careerModal.open(); renderCareer(); };
  $("careerClose").onclick = () => careerModal.close();

  // ── Project completion: picker UI ────────────────────────────────────────
  function matchingVariants(bounty) {
    if (!bounty) return [];
    return player.variants.filter(s => {
      try { return bounty.test(s.stats); } catch (e) { return false; }
    });
  }
  const deliverState = { bounty: null, slotIdx: -1, variantId: null };

  function tryComplete(bounty, slotIdx) {
    const matches = matchingVariants(bounty);
    if (!matches.length) return;
    openDeliverPicker(bounty, slotIdx, matches);
  }

  function openDeliverPicker(bounty, slotIdx, matches) {
    deliverState.bounty = bounty;
    deliverState.slotIdx = slotIdx;
    const sorted = [...matches].sort((a, b) =>
      a.potency - b.potency || (a.created || 0) - (b.created || 0));
    deliverState.variantId = sorted[0].id;

    $("deliverTitle").textContent = "Hand over: " + bounty.name;
    $("deliverBody").innerHTML = sorted.map(v => {
      const st = v.stats;
      const col = C.profileColor(v.profile.g0, v.profile.g1);
      const diet = dietNames(st.diet) || "no diet";
      const traits = traitNames(st.traits);
      const pair = v.tenantStats
        ? `<span class="sep">·</span><span class="dr-traits">+${v.tenantStats.modeName} tenant</span>`
        : "";
      return `<div class="deliver-row${v.id === deliverState.variantId ? " sel" : ""}"
                   data-id="${v.id}">
        <div class="dr-top">
          <span class="dr-sw" style="background:${rgb(col)}"></span>
          <span class="dr-name">${v.name}</span>
          <span class="dr-pot">⚡ ${Math.round(v.potency * 100)}%</span>
        </div>
        <div class="dr-detail">
          <span>${st.modeName}</span><span class="sep">·</span>
          <span>${st.typeName}</span><span class="sep">·</span>
          <span>${diet}</span>${pair}
          ${v.used ? `<span class="sep">·</span><span>used ${v.used}×</span>` : ""}
          <span class="sep">·</span>
          <span class="dr-traits${traits ? "" : " none"}">${traits || "no traits"}</span>
        </div>
      </div>`;
    }).join("");

    $("deliverBody").querySelectorAll(".deliver-row").forEach(row => {
      row.onclick = () => {
        deliverState.variantId = row.dataset.id;
        $("deliverBody").querySelectorAll(".deliver-row").forEach(r =>
          r.classList.toggle("sel", r.dataset.id === deliverState.variantId));
        renderDeliverFoot();
      };
    });

    renderDeliverFoot();
    deliverModal.open();
  }

  function renderDeliverFoot() {
    const b = deliverState.bounty;
    if (!b) return;
    const v = player.variants.find(x => x.id === deliverState.variantId);
    const ok = !!v;
    $("deliverFoot").innerHTML =
        `<span class="reward">`
      + `💰 <b>+${b.money}</b> · `
      + `🏛 <b class="rep">+${b.notoriety}</b> reputation · `
      + `🔍 <b class="scr">+${b.scrutinyBump}</b> suspicion`
      + (ok ? `<br><span class="faint">${v.name} will be handed over.</span>` : "")
      + `</span>`
      + `<button id="deliverCancel">Cancel</button>`
      + `<button id="deliverConfirm" class="confirm"${ok ? "" : " disabled"}>Hand over</button>`;
    const confirmBtn = $("deliverConfirm");
    if (confirmBtn) confirmBtn.onclick = () => commitDeliver();
    const cancelBtn = $("deliverCancel");
    if (cancelBtn) cancelBtn.onclick = () => closeDeliverPicker();
  }

  function resetDeliver() {
    deliverState.bounty = null;
    deliverState.slotIdx = -1;
    deliverState.variantId = null;
  }
  function closeDeliverPicker() { deliverModal.close(); }

  function commitDeliver() {
    const b = deliverState.bounty;
    if (!b) { closeDeliverPicker(); return; }
    // Guard against the slot lapsing (or being rerolled) while the picker sat open.
    if (activeBounties[deliverState.slotIdx] !== b) {
      toast("That project lapsed while you were deciding.");
      closeDeliverPicker();
      return;
    }
    const idx = player.variants.findIndex(x => x.id === deliverState.variantId);
    if (idx < 0) { closeDeliverPicker(); return; }
    const v = player.variants[idx];

    player.variants.splice(idx, 1);
    player.money    += b.money;
    player.scrutiny += b.scrutinyBump;
    player.notoriety = Math.min(100, (player.notoriety || 0) + b.notoriety);

    activeBounties[deliverState.slotIdx] = null;
    renderBounties();

    advanceStreaks(S.notorietyMult(player.notoriety));

    S.updateEntityUI();
    renderCareer();
    toast(`💰 Handed <b>${v.name}</b> to ${b.university} · +${b.money} · +${b.notoriety} reputation`);

    closeDeliverPicker();
    rollForOffer();
  }

  $("deliverClose").onclick = closeDeliverPicker;

  // ── Project rendering ────────────────────────────────────────────────────
  function renderBounties() {
    const list = $("bountyList");
    const any = activeBounties.some(Boolean);
    if (!any) {
      list.innerHTML = '<div class="bounty-empty">No open projects.<br>'
        + '<small>Press \u21bb to request new proposals.</small></div>';
      return;
    }
    list.innerHTML = activeBounties.map((b, bi) => {
      if (!b) return '<div class="bounty-card lapsed">'
        + '<div class="bdesc">\u2014 lapsed \u2014</div></div>';
      const matches = matchingVariants(b);
      const ready = matches.length > 0;
      const meta  = ready ? matches.length + " candidate" + (matches.length===1?"":"s") + " in storage"
                          : "nothing suitable yet";
      const mins  = Math.ceil(b.ticksLeft * TICK_MS / 60000);
      const tags  = b.clauses.map(c => '<span class="btag diff-' + b.tier + '">' + c.label + '</span>').join("");
      return '<div class="bounty-card">'
        + '<div class="brow1"><span class="bname">' + b.name + '</span>'
        + '<span class="btag diff-' + b.tier + '">' + S.diffLabel(b.D) + '</span></div>'
        + '<div class="brow2">' + tags + '</div>'
        + '<div class="bdesc">' + b.desc + '</div>'
        + '<div class="bsplit">'
        + '<span class="bs-money">💰 ' + b.money + '</span>'
        + '<span class="bs-not">🏛 +' + b.notoriety + ' reputation</span>'
        + '<span class="bs-scr">🔍 +' + b.scrutinyBump + '</span></div>'
        + '<div class="bexp">\u23f1 ' + mins + ' min remaining \u00b7 ' + meta + '</div>'
        + '<button class="bmatch' + (ready ? ' ready' : '')
        + '" data-idx="' + bi + '"' + (ready ? '' : ' disabled') + '>'
        + (ready ? '💰 Hand over to ' + b.university + ' \u2192' : 'No match in storage')
        + '</button></div>';
    }).join("");
    list.querySelectorAll("button.bmatch").forEach(btn => {
      btn.onclick = () => {
        const b = activeBounties[+btn.dataset.idx];
        if (b) tryComplete(b, +btn.dataset.idx);
      };
    });
  }
  $("bountyRefresh").onclick = async () => {
    const cost = S.ENTITY_CONFIG?.bountyRefreshScrutiny ?? 1;
    const anyActive = activeBounties.some(Boolean);
    if (anyActive && !await uiConfirm(`Request new proposals for +${cost} suspicion?`)) return;
    player.scrutiny += cost;
    forceRefreshBounties();
    S.updateEntityUI();
  };

  // ── Save / load v8 ───────────────────────────────────────────────────────
  // Country and world blocks come from js/world.js's pack table; a field
  // added there is saved here without any change to this file.
  const SAVE_KEY = "entity_save_v3";
  const W = window.WORLD;
  function serialize() {
    return {
      v: 8, t: Date.now(),
      world: W.packWorld(),
      player: {
        money: player.money, scrutiny: player.scrutiny, job: player.job,
        salary: player.salary,
        scrutinyFloor: player.scrutinyFloor,
        promoStreak: player.promoStreak,
        lateralStreak: player.lateralStreak,
        notoriety: player.notoriety || 0,
        careerHistory: player.careerHistory.slice(0, 50),
        variants: player.variants.map(s => ({
          id: s.id, name: s.name, plateId: s.plateId,
          profile: s.profile, tenant: s.tenant || null,
          stats: s.stats, tenantStats: s.tenantStats || null,
          potency: s.potency, created: s.created, used: s.used,
        })),
        maxVariants: player.maxVariants,
      },
      countries: W.packAll(),
      bounties: activeBounties.map(b => b ? {
        id: b.id, name: b.name, desc: b.desc, university: b.university,
        D: b.D, tier: b.tier, money: b.money, notoriety: b.notoriety,
        scrutinyBump: b.scrutinyBump, expiryTicks: b.expiryTicks,
        ticksLeft: b.ticksLeft,
        clauseKeys: b.clauses.map(c => c.key),
      } : null),
    };
  }
  function saveGame(silent) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(serialize()));
      lastSave = Date.now();
      if (!silent) toast("💾 Game saved");
    } catch (e) {
      if (!silent) toast("Save failed — see console");
    }
  }
  function loadGame() {
    let raw;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) {}
    if (!raw) { toast("No save found."); return false; }
    let data;
    try { data = JSON.parse(raw); }
    catch (e) { toast("Save corrupted."); return false; }
    if (!data || !(data.v >= 2 && data.v <= 8)) {
      toast("Save version mismatch — cannot load.");
      return false;
    }
    player.money = data.player.money;
    player.scrutiny = data.player.scrutiny;
    player.job = data.player.job;
    player.maxVariants = data.player.maxVariants;
    player.variants = data.player.variants.map(s => ({ ...s }));
    let maxId = 0;
    for (const s of player.variants) {
      const m = String(s.id || "").match(/variant_(\d+)/);
      if (m) maxId = Math.max(maxId, parseInt(m[1], 10) || 0);
    }
    try { S.variantIdCounter = maxId; } catch (e) {}

    if (data.v >= 3) {
      player.salary        = data.player.salary ?? S.TITLES[0].salaryMed;
      player.scrutinyFloor = data.player.scrutinyFloor ?? S.TITLES[0].floorMed;
      player.promoStreak   = data.player.promoStreak || 0;
      player.lateralStreak = data.player.lateralStreak || 0;
      player.notoriety     = data.player.notoriety || 0;
      player.careerHistory = Array.isArray(data.player.careerHistory)
        ? data.player.careerHistory.slice(0, 50) : [];
    } else {
      // v2 had no career fields; reset to the junior baseline.
      player.salary        = S.TITLES[player.job].salaryMed;
      player.scrutinyFloor = S.TITLES[player.job].floorMed;
      player.promoStreak   = 0;
      player.lateralStreak = 0;
      player.notoriety     = 0;
      player.careerHistory = [];
    }

    if (data.v === 8) {
      // Fresh world on the saved seed, then the saved state over it.
      W.newWorld(data.world && data.world.seed);
      W.unpackWorld(data.world);
      if (data.countries) W.unpackAll(data.countries);
    } else {
      // Older formats (v2-v7) get a new world with only the saved coverage laid over it:
      // their nation-simulation fields no longer exist, so they are not carried.
      W.newWorld();
      for (const iso in (data.countries || {})) {
        if (!W.isAgent(iso)) continue;
        const c = data.countries[iso], s = W.ensureCountry(iso);
        s.covered = !!c.c; s.coverageLevel = c.lv || 0; s.profile = c.pr || null;
      }
    }

    if (data.v >= 3 && Array.isArray(data.bounties)) {
      activeBounties = data.bounties.map(b => {
        if (!b) return null;
        const clauses = (b.clauseKeys || [])
          .map(k => S.PRED_BY_KEY.get(k))
          .filter(Boolean);
        return {
          ...b,
          clauses,
          test: st => { try { return clauses.every(c => c.test(st)); } catch (e) { return false; } },
        };
      });
      while (activeBounties.length < 3) activeBounties.push(null);
      if (activeBounties.length > 3) activeBounties.length = 3;
    }

    S.updateEntityUI();
    S.refreshVariants();
    S.syncMapColors();
    renderBounties();
    renderCareer();
    toast("📁 Game loaded");
    return true;
  }
  $("saveBtn").onclick = () => saveGame(false);
  $("loadBtn").onclick = async () => {
    if (!await uiConfirm("Load saved game? Current progress will be lost.")) return;
    loadGame();
  };

  // ── Game over ────────────────────────────────────────────────────────────
  let gameOverShown = false;
  function showGameOverModal() {
    if (gameOverShown) return;
    gameOverShown = true;
    let covered = 0;
    for (const iso in S.COUNTRY_STATE) if (S.COUNTRY_STATE[iso].covered) covered++;
    const totalDeployed = player.variants.reduce((a, s) => a + (s.used || 0), 0);
    $("goStats").innerHTML =
      '<div>Final money <b>' + Math.round(player.money) + '</b></div>' +
      '<div>Title <b>' + S.TITLES[player.job].name + '</b></div>' +
      '<div>Variants in storage <b>' + player.variants.length + ' / ' + player.maxVariants + '</b></div>' +
      '<div>Variants deployed <b>' + totalDeployed + '</b></div>' +
      '<div class="fail">Countries covered <b>' + covered + '</b></div>';
    gameOverModal.open();
    const play = $("play");
    if (play && play.textContent !== "Play") play.click();
  }
  window.ENTITY_GAMEOVER = showGameOverModal;

  // ── New game ─────────────────────────────────────────────────────────────
  async function newGame() {
    if (!await uiConfirm("Start a new game?\n\nCurrent progress, variants, and coverage will be lost.")) return;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    S.resetAll();
    activeBounties = [null, null, null];
    refreshBounties();
    renderCareer();
    S.updateEntityUI();
    S.refreshVariants();
    gameOverModal.close();
    gameOverShown = false;
    toast("🆕 New game started");
  }
  $("goRestart").onclick = newGame;
  $("newGameBtn").onclick = newGame;

  // ── Variant decay poll ───────────────────────────────────────────────────
  setInterval(() => {
    const cfg = S.ENTITY_CONFIG || {};
    let changed = false;
    for (const s of player.variants) {
      if (s.potency > 0.1 && Math.random() < (cfg.variantDecayChance ?? 0.006)) {
        s.potency = Math.max(0.1, s.potency - (cfg.variantDecayAmount ?? 0.001));
        changed = true;
      }
    }
    if (changed) S.refreshVariants();
  }, 5000);

  S.onVariantsChanged = () => { renderBounties(); };

  // ── Bootstrap ────────────────────────────────────────────────────────────
  activeBounties = [null, null, null];
  refreshBounties();
  S.updateEntityUI();
  // Expose career functions inside init() where they are in scope.
  Object.assign(window.ENTITY, {
    maybeFireOffer, renderCareer,
    get gameHalted() { return gameHalted; },
  });
}
init();
})();
