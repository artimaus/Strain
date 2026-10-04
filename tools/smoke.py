#!/usr/bin/env python3
"""Smoke test for Strain.

Boots Strain.html in headless Chrome (or Edge) and checks, without a human:

  boot    no window errors; UI / C / ENTITY present; stylesheet applied
  sim     all five plates report a population (the worker path works)
  modals  dialogs open by real clicks, close on Escape / backdrop / toggle
  text    no "U0001f" (a bad string escape once rendered as literal text)
  layout  across window sizes: layout mode, no scrollbar in the bench (not
          even an idle one: classic scrollbars take room), no horizontal
          overflow, plate sizes (compare against a baseline)

Usage
  python tools/smoke.py                       everything
  python tools/smoke.py --only layout --sizes 1280x720,1100x600
  python tools/smoke.py --json before.json    keep the raw results to diff
  python tools/smoke.py --eval-file probe.js  run a script in the booted page
                                              (a function body; `return` a JSON
                                              value; it waits for the map first)
  python tools/smoke.py --eval-file tools/probes/census.js --hold 500000 --timeout 560
                                              the balance probes live in tools/probes
  python tools/smoke.py --eval-file open.js --shot page.png --size 1440x900
                                              same, but save a screenshot once the
                                              script has finished (headless Chrome
                                              opens no window narrower than 572px)

Exit code: 0 all checks passed, 1 a check failed, 2 the browser could not
be launched, timed out, or a probe never finished.

How it works.  The script serves the project from its own http.server on
127.0.0.1 and writes a copy of Strain.html with two <script> probes: one
before the stylesheet that records window errors as early as possible, one
before </body> that runs the checks and stores the result as JSON in
document.title.  Chrome's --dump-dom prints the page once the load event
fires - so the probe first adds an <img> whose request the server holds
open for a few seconds, runs its checks on ordinary real-time timers, and
then aborts the image, which lets load fire and the DOM be dumped at once.
No virtual clock is involved anywhere: the plate workers and the layout
script's animation frames get genuine wall time, which is what a game with
a worker per plate needs.  (Chrome's --virtual-time-budget was tried first;
it fast-forwards the page's clock while workers and frames run on the wall
clock, and failed under any concurrent load.)  If a probe ever throws, the
held image completes at its deadline and the run reports "probe never
finished" rather than hanging.

Each run gets a fresh --user-data-dir and a hard timeout: a reused profile
directory once hung Chrome for two minutes.
"""
import argparse
import concurrent.futures
import functools
import html
import http.server
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / "Strain.html"

BROWSERS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "google-chrome", "chromium", "chromium-browser", "chrome", "msedge",
]

DEFAULT_SIZES = "1920x1080,1440x900,1366x768,1280x720,1280x640,1100x600,1000x520,600x700,420x860"

# A bench scrollbar is accepted only when layout.js reports it gave up (even
# the smallest single plate is taller than the room) and the viewport is
# genuinely tiny; chrome alone is ~215px and wraps to ~270px at 900px wide.
MIN_FIT_HEIGHT = 420

# Real milliseconds the server holds the load event open for a layout run.
# The probe releases it as soon as the layout has settled (~0.5 s), so this
# is only how long a broken probe can cost.
LAYOUT_HOLD = 4000

# ── probes ──────────────────────────────────────────────────────────────────
# Plain strings, substituted with str.replace.  No backslashes in the JS:
# they would have to survive Python, the shell and HTML unchanged.

PRE = """<script>
window.__smoke = { errors: [] };
addEventListener("error", function (e) {
  var t = e.target;
  if (t && t !== window && (t.src || t.href))      // a script or stylesheet that failed to load
    window.__smoke.errors.push("failed to load " + String(t.src || t.href).split("/").pop());
  else
    window.__smoke.errors.push(String(e.message || e.error) + " @ "
      + String(e.filename || "").split("/").pop() + ":" + e.lineno);
}, true);
addEventListener("unhandledrejection", function (e) {
  window.__smoke.errors.push("rejection: " + String(e.reason));
});
</script>
"""

POST = """<script>
(function () {
  var MODE = "__MODE__", HOLD = __HOLD__, EVAL = __EVAL__;
  // Keep the load event (and so --dump-dom) waiting until we are done.
  var hold = new Image(); hold.src = "/__hold?ms=" + HOLD; document.body.appendChild(hold);
  var $ = function (id) { return document.getElementById(id); };
  var r = { mode: MODE, errors: window.__smoke.errors, vw: 0, vh: 0 };
  function at(phase) { document.title = "SMOKE-AT:" + phase; }   // progress, in case the hold runs out
  function finish() {
    r.vw = innerWidth; r.vh = innerHeight;
    document.title = "SMOKE:" + JSON.stringify(r);
    hold.src = "";                       // abort the held request: load fires
  }
  // Two frames (the layout script fits the bench inside one) plus a beat.
  // Not document.fonts.ready: Chrome resolves that only after the load
  // event, which is precisely what the held image keeps from firing.
  function settled(cb) {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { setTimeout(cb, 300); });
    });
  }
  function layout() {
    var b = $("bench"), cv = document.querySelectorAll(".plate canvas:not(.ring)");
    r.layout = {
      narrow: document.body.classList.contains("narrow"),
      benchClient: b.clientHeight, benchScroll: b.scrollHeight,
      // classic (non-overlay) scrollbars take room: a bar shows even when
      // nothing scrolls, so the client box being smaller than the border
      // box is the honest test for "there is a scrollbar"
      barW: b.offsetWidth - b.clientWidth, barH: b.offsetHeight - b.clientHeight,
      plates: [].map.call(cv, function (c) { return Math.round(c.getBoundingClientRect().width); }),
      bodyScrollW: document.body.scrollWidth,
      docScrollW: document.documentElement.scrollWidth,
      topbar: $("entityHeader").offsetHeight,
      header: document.querySelector("header").offsetHeight,
      footer: document.querySelector("footer").offsetHeight,
      benchW: b.style.getPropertyValue("--benchW"),
      fit: b.dataset.fit || ""                        // grid | one | floor (layout.js gave up)
    };
    // the country screen must fit every window too: open it, measure, close it
    try {
      if (window.ENTITY && window.ENTITY.openCountryModal) {
        window.ENTITY.openCountryModal("FR");
        var win = document.querySelector("#countryModal .win"), cb = $("cmBody");
        var wr = win ? win.getBoundingClientRect() : { left: 0, right: 0 };
        r.layout.cmOverflow = Math.max(win ? win.scrollWidth - win.clientWidth : 0, cb ? cb.scrollWidth - cb.clientWidth : 0,
                                       Math.ceil(wr.right - innerWidth), Math.ceil(-wr.left));   // the window itself must sit inside the viewport
        r.layout.cmSections = cb ? cb.querySelectorAll("details").length : 0;
        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      }
    } catch (e) { r.layout.cmError = String(e); r.layout.cmOverflow = 999; }
  }
  function boot() {
    r.boot = {
      ui: !!(window.UI && typeof UI.modal === "function"),
      c: !!(window.C && window.C.SUB && window.C.SUB.length),
      entity: !!(window.ENTITY && window.ENTITY.player),
      bg: getComputedStyle(document.body).backgroundColor
    };
  }
  function pops() {
    return [].map.call(document.querySelectorAll("figcaption b"),
      function (el) { return +el.textContent || 0; });
  }
  // Real-time samples; stop as soon as every plate has reported, or 1.5 s
  // before the hold would expire on its own.
  function sim(done) {
    at("sim");
    var samples = [], n = 0, max = Math.floor((HOLD - 1500) / 250);
    (function tick() {
      var p = pops(); samples.push(p); n++;
      var all = p.length === 5 && p.every(function (v) { return v > 0; });
      if (all || n >= max) { r.sim = { samples: samples, ok: all }; done(); }
      else setTimeout(tick, 250);
    })();
  }
  function isOpen(id) { return $(id).classList.contains("open"); }
  function esc() {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }
  function modals() {
    at("modals");
    var m = {};
    $("variantToggle").click();       m.variantOpen = isOpen("variantModal");
    esc();                            m.variantEsc = !isOpen("variantModal");
    $("variantToggle").click();
    $("variantModal").click();        m.variantBackdrop = !isOpen("variantModal");
    $("careerBtn").click();           m.careerOpen = isOpen("careerModal");
    $("careerBtn").click();           m.careerToggle = !isOpen("careerModal");
    $("entityTuneBtn").click();       m.configOpen = isOpen("entityTune");
    m.configRows = $("entityTuneBody").querySelectorAll(".row").length;
    $("entityTuneClose").click();     m.configClose = !isOpen("entityTune");
    $("tunebtn").click();             m.tuneOpen = isOpen("tune");
    m.tuneInputs = $("tunebody").querySelectorAll("input").length;
    $("variantToggle").click(); esc(); m.stackTop = isOpen("tune") && !isOpen("variantModal");
    esc();                            m.stackNext = !isOpen("tune");
    // The profile sheet (js/sheet.js) opened the way host.js opens it, with a
    // synthetic entity; and a lever change (js/tune.js) reaching every plate.
    try {
      var plate = (window.ENTITY_PLATES || [])[0];
      window.SHEET.open({ g0: 66051, g1: 168496141, e: 0.5, age: 12, asleep: false },
                        [0.1, 0.2, 0.3, 0.4, 0.5], plate, 100);
      m.sheetOpen = isOpen("sheet") && $("sheetbody").querySelectorAll(".prow").length > 5 && !!$("collectBtn");
      window.SHEET.close();           m.sheetClose = !isOpen("sheet");
    } catch (e) { m.sheetOpen = false; m.sheetError = String(e); }
    try {
      var applied = window.TUNE.apply("CAP", window.C.CAP);
      m.tuneApply = applied === true && (window.ENTITY_PLATES || []).every(function (p) {
        return p.ops.some(function (o) { return o.op === "tune"; });
      });
    } catch (e) { m.tuneApply = false; m.tuneError = String(e); }
    // One world tick over a covered country, then a reset (js/world.js).
    try {
      var W = window.WORLD, us = W.ensureCountry("US");
      us.covered = true; us.coverageLevel = 0.5;
      W.spreadTick(); W.responseTick(); W.updateResponseBar();
      m.worldTick = W.anyCovered() === true && $("responseBar").classList.contains("show");
      W.resetCountries();
      m.worldReset = W.anyCovered() === false;
    } catch (e) { m.worldTick = false; m.worldError = String(e); }
    // The region dialog (js/worldui.js) needs no map data to open.
    try {
      window.ENTITY.openRegionModal("europe");
      m.regionOpen = isOpen("mapRegionModal") && $("regBody").querySelectorAll(".row").length >= 5;
      esc();                          m.regionClose = !isOpen("mapRegionModal");
    } catch (e) { m.regionOpen = false; m.regionError = String(e); }
    // The world clock, drift and the save pack table (js/world.js, stage 1).
    try {
      var W = window.WORLD, C = window.COUNTRIES;
      W.newWorld(12345);
      var d0 = $("calDisplay").textContent;
      W.advanceDays(30);
      m.calendarAdvance = W.day === 30 && $("calDisplay").textContent !== d0;
      W.advanceDays(270);
      var bad = 0, n = 0;
      for (var iso in W.COUNTRY_STATE) {
        var st = W.COUNTRY_STATE[iso]; n++;
        C.STAT_KEYS.forEach(function (k) { var v = st.st[k]; if (!(v >= 0 && v <= 100)) bad++; });
        if (!(st.authority >= 0 && st.authority <= 100 && st.econOpen >= 0 && st.econOpen <= 100)) bad++;
        if (!isFinite(st.treasury)) bad++;
      }
      m.statsInRange = n > 150 && bad === 0;          // after 300 days
      // stage 3: decisions were taken, pairs formed, governments labelled
      var decided = 0, kinds = {};
      for (var iso2 in W.COUNTRY_STATE) { var l = W.COUNTRY_STATE[iso2].last; if (l) { decided++; kinds[l.action] = 1; } }
      m.decisionsMade = decided > 100 && Object.keys(kinds).length >= 3;
      var pairs = W.packPairs(), deals = pairs.filter(function (r) { return r.d && r.d.length; }).length;
      var lateDeals = pairs.filter(function (r) { return r.d && r.d.some(function (d) { return (d.s || 0) > 30; }); }).length;   // signed by a decision, not seeded at day 0
      var codes = function (t) { var seen = {}, dup = 0; t.forEach(function (f) { if (seen[f[1]]) dup++; seen[f[1]] = 1; }); return dup; };
      m.fieldCodesUnique = codes(W.COUNTRY_FIELDS) === 0 && codes(W.PAIR_FIELDS) === 0 && codes(W.DEAL_FIELDS) === 0 && codes(W.WORLD_FIELDS) === 0;
      m.pairsFormed = pairs.length > 20 && deals > 5 && lateDeals > 5;
      m.govLabel = window.GOV.label(80, 20) === "Military junta" && window.GOV.label(30, 80) === "Liberal democracy";
      m.headlines = W.WORLD_STATE.log.length > 20 && W.WORLD_STATE.log.every(function (e) { return e.text && e.d >= 0; });
      // stage 2 (production economy): production and prices sane, growth capped, debt bounded, projects pay over time, famine works
      var EC = window.ECONOMY, cf = window.ENTITY_CONFIG, prodW = 0, consW = 0, overCap = 0, overDebt = 0, negStock = 0;
      for (var ei in W.COUNTRY_STATE) { var es = W.COUNTRY_STATE[ei]; if (!es.production) continue;
        prodW += es.production[2]; consW += es.consumption[2];
        if (es.output > es.cap * 1.05) overCap++; if (es.treasury < -EC.credit(es) * 1.5) overDebt++;
        if (es.stock.some(function (v) { return v < 0; })) negStock++; }
      var MK = W.WORLD_STATE.market;
      m.productionBalances = prodW > 0 && consW > 0 && negStock === 0 && !!MK && MK.price.every(function (pv) { return pv >= cf.priceMin && pv <= cf.priceMax; });
      m.growthCapped = overCap === 0; m.debtBounded = overDebt === 0;
      m.worldFood = Math.round(prodW / consW * 100) / 100;
      var pS = cf.pSmall, pL = cf.pLarge; cf.pSmall = 0; cf.pLarge = 0;          // no disasters while a project is measured
      var deI = ["DE", "NL", "SE", "CH", "AT", "DK"].filter(function (pi) { var ps = W.COUNTRY_STATE[pi]; return ps && ps.st && !W.atWar(pi) && !ps.occupiedBy && ps.treasury > 0; })[0] || "DE";
      var de = W.COUNTRY_STATE[deI], inf0 = de.st.infra; de.upkeepPlan = { infra: 1, military: 1, medical: 1 };
      var pjM = EC.projectFor(de, "infra"); de.projects = [pjM]; W.advanceDays(10);
      var inf10 = de.st.infra; W.advanceDays(25);
      m.projectsPayOut = inf10 > inf0 + 0.05 && (inf10 - inf0) < (de.st.infra - inf0) * 0.6 && de.projects.indexOf(pjM) < 0;   // the measured project is done (others may have started since)
      m.projectInfo = { country: deI, start: Math.round(inf0 * 100) / 100, day10: Math.round(inf10 * 100) / 100, end: Math.round(de.st.infra * 100) / 100, atWar: W.atWar(deI) };
      cf.pSmall = pS; cf.pLarge = pL;
      var et2 = W.COUNTRY_STATE.ET, p0 = et2.pop, keepBV = cf.brokeVitalShare; cf.brokeVitalShare = 0;   // this check is the famine mechanism alone: no harvest and no way to buy one
      et2.potential[2] = 0; et2.stock[2] = 0; et2.treasury = -EC.credit(et2) * 3; et2.broke = true;
      W.advanceDays(120);
      cf.brokeVitalShare = keepBV;
      m.famineWorks = et2.pop < p0 * 0.98 && et2.pop > p0 * Math.pow(1 - cf.deathMax, 120) * 0.98;
      m.famineLoss = Math.round((1 - et2.pop / p0) * 100);
      // stage 3 (cadences and budget): loops run at their rates, a broke country cuts an upkeep and the stat decays, no projects in a war but the army
      var fr3 = W.COUNTRY_STATE.FR, acts = fr3.acts || {};
      m.cadenceHeld = acts.monthly >= 10 && acts.monthly <= 40 && acts.weekly >= 40 && acts.weekly <= 160;   // over the ~775 days so far
      m.cadenceCounts = acts;
      var pr = W.COUNTRY_STATE.PR || W.COUNTRY_STATE.CU, pr0 = pr.st.military;
      // income gone, nothing left to sell, and poor long enough for the lenders to have noticed: credit rests on the
      // remembered income now, so crushing today's output alone leaves the borrowing limit untouched
      pr.output = 1; pr.stock = [0, 0, 0, 0]; pr.incomeRef = EC.taxIncome(pr); pr.treasury = -EC.credit(pr) * 0.9;
      var wasAt = { infra: pr.st.infra, military: pr.st.military, medical: pr.st.medical };
      window.DECIDE.budget(pr.iso || "CU", pr, cf); var planCut = Object.keys(pr.upkeepPlan).some(function (k) { return pr.upkeepPlan[k] === 0; });
      W.advanceDays(20);
      // whatever it stopped paying for must have decayed at its own rate: fixed thresholds said nothing about the stat
      // actually cut, and passed or failed on where the country happened to start
      var cut20 = Object.keys(pr.upkeepPlan).filter(function (k) { return pr.upkeepPlan[k] === 0; });
      var rateOf = { infra: cf.decayInfra, military: cf.decayMil, medical: cf.decayMed };
      var fell = cut20.map(function (k) { return { stat: k, lost: +(wasAt[k] - pr.st[k]).toFixed(2), wanted: +(rateOf[k] * 20 * 0.5).toFixed(2) }; });
      var decayed = cut20.length > 0 && fell.every(function (f) { return f.lost >= f.wanted; });
      m.budgetSkipsUpkeep = planCut && cut20.length > 0 && decayed;
      m.budgetInfo = { cutAtOnce: planCut, stillCut: cut20, fell: fell, credit: Math.round(EC.credit(pr)), treasury: Math.round(pr.treasury),
                       incomeRef: Math.round(pr.incomeRef || 0), income: Math.round(EC.taxIncome(pr)) };
      if (!W.warBetween("RU", "UA")) window.DECIDE.declareWar("RU", "UA", { force: true });
      var ruT = window.COUNTRIES.temperament("RU", W.seed), ruC = window.DECIDE.candidates("RU", W.COUNTRY_STATE.RU, cf, ruT, null, "monthly");
      var ruWant = window.DECIDE.wants(W.COUNTRY_STATE.RU, ruT, window.DECIDE.prioritiesOf("RU"), window.DECIDE.threatTo("RU", W.COUNTRY_STATE.RU)).military;   // the army is wanted bigger (the threat counted, as the decision counts it), or it is not
      var ruPj = window.ECONOMY.projectFor(W.COUNTRY_STATE.RU, "military"), ruCan = window.ECONOMY.canSpend(W.COUNTRY_STATE.RU, ruPj.cost * ruPj.total * 0.5);
      m.warBansProjects = ruC.some(function (k) { return k.action === "invest" && k.target === "military"; }) === (ruWant > W.COUNTRY_STATE.RU.st.military && ruCan) &&
                          !ruC.some(function (k) { return k.action === "invest" && k.target !== "military"; });
      window.DECIDE.suePeace("RU", "UA");
      // stage 4: a forced war resolves; an occupation releases and bends the government
      var D = window.DECIDE;
      if (W.warBetween("RU", "UA")) D.suePeace("RU", "UA");            // the sim may have started one already
      m.warDeclared = D.declareWar("RU", "UA", { force: true }) === true && !!W.warBetween("RU", "UA");
      var warId = m.warDeclared ? W.warBetween("RU", "UA").id : -1;
      W.advanceDays(260);                     // longer than warMaxDays: the war must be over by now
      m.warResolves = warId > 0 && !W.WORLD_STATE.wars.some(function (w) { return w.id === warId; });
      var ua = W.COUNTRY_STATE.UA, au0 = ua.authority;
      D.occupy("RU", "UA", 30); var untilF = ua.occupiedUntil, dayF = W.day; W.advanceDays(60);
      // the forced occupation ended: either its release bent the regime's axes, or an uprising threw the garrison out (no stamp then)
      var rose = W.WORLD_STATE.log.some(function (e) { return e.kind === "uprising" && e.iso === "UA" && e.d > dayF; });
      var stamped = ua.authority !== au0 || Math.abs(ua.authority - W.COUNTRY_STATE.RU.authority) < 1;   // no change when the axes already match the occupier's
      m.occupationReleases = (stamped || rose) && !(ua.occupiedBy === "RU" && ua.occupiedUntil === untilF);
      // stage 5: events fired on the ladder, discoveries diffused, the wire shows them
      var ES = window.EVENTS.stats, fired = 0; for (var kk in ES.fired) fired += ES.fired[kk];
      m.eventFired = fired > 50 && Object.keys(ES.fired).length >= 3 && ES.large > 5;   // counted at the source: the log window is short
      m.diffusionSeen = ES.adoptions > 0;
      m.wireRows = $("wireList").children.length > 10 && !!$("wireList").querySelector(".wire-row .t");
      // stage 6: a covered country is detected at a pace set by its medical stat, reacts, and the meter is weighted
      W.newWorld(12345);
      var us2 = W.ensureCountry("US"), et = W.ensureCountry("ET");
      us2.covered = et.covered = true; us2.coverageLevel = et.coverageLevel = 1; us2.profile = et.profile = null;
      var r0 = window.DECIDE.stats.reactions;
      W.advanceDays(300);
      m.detectByMedical = us2.detection > 0.3 && us2.detection > et.detection && us2.govAction > 0 && us2.responseProgress > 0;
      m.reactionFired = window.DECIDE.stats.reactions > r0 && (us2.lastReact > 0 || et.lastReact > 0);   // lastReact survives later decisions
      m.meterWeighted = W.globalResponse() > 0 && $("responseBar").classList.contains("show");
      W.newWorld(12345);
      var a = JSON.stringify([W.packAll(), W.packPairs(), W.packWorld()]);
      var parsed = JSON.parse(a); W.unpackAll(parsed[0]); W.unpackPairs(parsed[1]); W.unpackWorld(parsed[2]);
      m.saveRoundTrip = JSON.stringify([W.packAll(), W.packPairs(), W.packWorld()]) === a && W.COUNTRY_STATE.FR.output > 0;
      W.newWorld(12345); W.advanceDays(120); var x = JSON.stringify([W.packAll(), W.packPairs(), W.packWorld(), W.WORLD_STATE.log]);
      W.newWorld(12345); W.advanceDays(120); var y = JSON.stringify([W.packAll(), W.packPairs(), W.packWorld(), W.WORLD_STATE.log]);
      m.deterministic = x === y && x.length > 1000;
      W.newWorld(12345);
    } catch (e) { m.calendarAdvance = false; m.worldSimError = String(e); }
    r.modals = m;
  }
  /* The review's checks -- diplomacy, government, war, climate, scarcity,
     the defender's path -- on a world of their own, so the long functional
     scenario and these can run in parallel browsers. */
  function worldChecks(m) {
    var W = window.WORLD, EC = window.ECONOMY, cf = window.ENTITY_CONFIG, D = window.DECIDE;
      // the defender's path: the defender mobilises when attacked, the attacker's supply line thins with distance,
      // a refused ally is discounted by everyone, and close wars are uncertain
      var D2 = window.DECIDE, S2 = W.COUNTRY_STATE, cf2 = window.ENTITY_CONFIG;
      if (W.warBetween("RU", "UA")) D2.suePeace("RU", "UA");
      var uaD = S2.UA; uaD.occupiedBy = null; uaD.treasury = Math.max(uaD.treasury, 5e4); uaD.mobilUntil = 0; uaD.projects = [];
      var uaMil0 = uaD.st.military;
      D2.declareWar("RU", "UA", { force: true });
      var mobilProj = (uaD.projects || []).some(function (p) { return p.mobil; });
      for (var mt = 0; mt < 12; mt++) D2.warTick(function () { return 0.5; });
      m.mobilisationFires = mobilProj && uaD.mobilised > 0 && uaD.st.military > uaMil0 - cf2.warMilDef * 12 * 2;   // the reserves outweigh twelve days of attrition
      m.mobilInfo = { project: mobilProj, mobilised: +(uaD.mobilised || 0).toFixed(2), mil: [+uaMil0.toFixed(2), +uaD.st.military.toFixed(2)] };
      if (W.warBetween("RU", "UA")) D2.suePeace("RU", "UA");
      // trust: a scripted refusal is remembered by every partner and lowers what the friend expects
      var refuser = null, friend2 = null;
      for (var ti in S2) { var ts = S2[ti]; if (!ts.st || ts.pop < 5 || ts.occupiedBy) continue;
        var pps = window.LINKS.partners(ti).filter(function (o) { return W.pairOf(ti, o).pact && S2[o] && S2[o].st && !S2[o].occupiedBy; });   // an occupied ally counts for nobody
        if (pps.length >= 2) { refuser = ti; friend2 = pps[0]; break; } }
      if (refuser) {
        var fs = S2[friend2], expect0 = D2.expectedStrength(friend2, "XX");
        D2.setTrust(fs, refuser, cf2.refuseTrust);
        var expect1 = D2.expectedStrength(friend2, "XX");
        m.allyMemory = expect1 < expect0 && D2.trustIn(fs, refuser) === cf2.refuseTrust;
        m.trustInfo = { refuser: refuser, friend: friend2, before: Math.round(expect0), after: Math.round(expect1) };
        D2.setTrust(fs, refuser, 1);
      } else m.allyMemory = false;
      // the supply line: the same war over a sea link spends the attacker's army faster than over land
      var landPair = null, seaPair = null;
      for (var li in S2) { var ls = S2[li]; if (!ls.st || ls.pop < 5) continue;
        window.LINKS.partners(li).forEach(function (o) { if (!landPair && window.LINKS.linkedBy(li, o, "land")) landPair = [li, o]; if (!seaPair && !window.LINKS.linkedBy(li, o, "land") && window.LINKS.linkedBy(li, o, "sea")) seaPair = [li, o]; });
        if (landPair && seaPair) break; }
      var lineLand = landPair ? 1 + cf2.supplyLine * (1 - (window.LINKS.linkedBy(landPair[0], landPair[1], "land") ? 1 : cf2.reachSea)) : 0;
      var lineSea = 1 + cf2.supplyLine * (1 - cf2.reachSea);
      m.supplyLineBites = !!landPair && !!seaPair && lineSea > lineLand && lineLand === 1;
      // scarcity: the price rests on the world's cover, sellers hold out below their floor, a cartel lifts the price, the laboratories go dark first
      var M6 = W.WORLD_STATE.market, EC6 = window.ECONOMY, S6b = W.COUNTRY_STATE, cf6b = window.ENTITY_CONFIG;
      var keepStock = M6.stock.slice(), p0 = M6.price[0];
      M6.stock[0] = 0; W.advanceDays(3); var pDrained = M6.price[0], restDrained = M6.rest[0];
      M6.stock[0] = keepStock[0] * 5 + 1e6; W.advanceDays(3); var pGlut = M6.price[0];
      M6.stock = keepStock;
      m.priceTracksCover = pDrained > p0 && restDrained > cf6b.priceBase && pGlut < pDrained;
      m.priceInfo = { before: +p0.toFixed(2), drained: +pDrained.toFixed(2), rest: +restDrained.toFixed(2), glut: +pGlut.toFixed(2) };
      // a seller with a full store and cash to spare holds out when the price is far below its floor
      var seller = null, hadSurplus = 0, hadCash = 0, bigEnough = 0;
      for (var si6 in S6b) { var ss = S6b[si6]; if (!ss.st) continue;
        if (ss.pop >= 5) bigEnough++;
        if (ss.surplus && ss.surplus[2] > 1) hadSurplus++;
        if (ss.treasury > 0) hadCash++;
        // the check funds the seller itself below, so its treasury today is beside the point
        if (!seller && ss.pop >= 5 && ss.surplus && ss.surplus[2] > 1 && !W.atWar(si6)) seller = si6; }
      if (seller) {
        var sv = S6b[seller], keepPrice = M6.price[2];
        M6.price[2] = cf6b.priceMin; sv.treasury = Math.max(sv.treasury, 5 * EC6.taxIncome(sv) * 100); sv.stock[2] = 0;   // cash to spare, room in the stores
        W.advanceDays(1);
        m.sellersWithhold = sv.withheld && sv.withheld[2] > 0 && sv.surplus[2] === 0;
        m.withholdInfo = { seller: seller, withheld: sv.withheld ? +sv.withheld[2].toFixed(2) : null, floor: sv.reservation ? +sv.reservation[2].toFixed(2) : null,
                           pool: { bigEnough: bigEnough, foodSurplus: hadSurplus, inTheBlack: hadCash } };
        M6.price[2] = keepPrice;
      } else { m.sellersWithhold = false; m.withholdInfo = { seller: null, pool: { bigEnough: bigEnough, foodSurplus: hadSurplus, inTheBlack: hadCash } }; }
      // two big sellers of a type agree a floor; the price climbs toward it while their buyers cool
      // two big sellers: ranked by what they actually put on the market, not by the structural surplus a heavy
      // consumer can have and still sell none of
      var spare6 = function (i) { var t6b = S6b[i]; return (t6b.surplus && t6b.surplus[0]) || 0; };
      var sellers = Object.keys(S6b).filter(function (i) { var t6b = S6b[i]; return t6b.st && t6b.production && !t6b.occupiedBy && !W.atWar(i) && spare6(i) > 0; })
                      .sort(function (a2, b2) { return spare6(b2) - spare6(a2); }).slice(0, 2);
      var cartelOK = false, cartelInfo = null;
      if (sellers.length === 2) {
        var ca = sellers[0], cb = sellers[1]; W.pairOf(ca, cb).rel = Math.max(W.pairOf(ca, cb).rel, 30); W.dropDeals(ca, cb);
        var snap6 = JSON.stringify([W.packAll(), W.packPairs(), W.packWorld()]), fund6 = function (i6) { S6b[i6].treasury = window.ECONOMY.capOf(S6b[i6]); };
        var pStart6 = M6.price[0];
        // both legs are asked the same question -- starting a fifth under the floor, where does the price go in ten days? --
        // so the counterfactual takes the same knock.  Comparing a knocked leg against an unknocked one measures the knock.
        var floor6 = Math.min(cf6b.priceMax, M6.rest[0] * cf6b.floorMark);
        var knock6 = Math.min(M6.price[0], floor6 * 0.8);
        M6.price[0] = knock6;
        for (var d6c = 0; d6c < 10; d6c++) { fund6(ca); fund6(cb); W.advanceDays(1); }   // the counterfactual: the same ten days, no floor
        var pControl = M6.price[0], parsed6 = JSON.parse(snap6); W.unpackAll(parsed6[0]); W.unpackPairs(parsed6[1]); W.unpackWorld(parsed6[2]); M6 = W.WORLD_STATE.market;
        // the floor is signed by hand (two big sellers seldom hold enough of the world's spare to propose it themselves);
        // what it guarantees: while the price is below the floor both members hold their energy back, and the deal stays live
        W.addDeal(ca, cb, { g: -1, gq: 0, t: -1, tq: 0, mq: 0, tech: 0, until: W.day + 365, since: W.day, short: 0, fk: 0, fp: floor6 });
        fund6(ca); fund6(cb);   // at their caps, whatever their size
        var pBefore = M6.price[0], share6 = (Math.max(0, S6b[ca].surplus ? S6b[ca].surplus[0] : 0) + Math.max(0, S6b[cb].surplus ? S6b[cb].surplus[0] : 0)) / Math.max(1e-9, M6.sells[0]);
        M6.price[0] = knock6;
        for (var d6 = 0; d6 < 10; d6++) { fund6(ca); fund6(cb); W.advanceDays(1); }   // kept in funds: a member short of cash would break ranks by design
        var live6 = W.dealsOf(ca, cb).some(function (d) { return d.fk === 0; });
        // each member either held its energy back, or priced it at the floor, or had none to sell that day; nobody broke ranks
        var holds6 = function (i6) { var t6 = S6b[i6]; return (t6.withheld && t6.withheld[0] > 0) || (t6.reservation && t6.reservation[0] >= floor6 * 0.99) || !(t6.surplus && t6.surplus[0] > 0); };
        var heldA = holds6(ca), heldB = holds6(cb), ranks6 = W.dealsOf(ca, cb).every(function (d) { return d.fk !== 0 || !d.short; });
        var fp6 = window.DECIDE.proposeFloor(ca, cb, 0);
        // what a floor guarantees is that its members hold ranks and it survives.  Lifting the price needs weight as
        // well: cartelHoldMin is the share of the world's sales the config itself says a pair needs to propose one
        var lifted6 = M6.price[0] >= pControl * 0.99 || M6.price[0] >= floor6 * 0.95;   // held up against the same days without it
        cartelOK = live6 && heldA && heldB && ranks6 && (share6 >= cf6b.cartelHoldMin ? lifted6 : true) && (!fp6 || fp6.hold <= 1);
        cartelInfo = { members: sellers, floor: +floor6.toFixed(2), heldA: heldA, heldB: heldB, start: +pStart6.toFixed(2), knock: +knock6.toFixed(2), control: +pControl.toFixed(2), before: +pBefore.toFixed(2), after: +M6.price[0].toFixed(2), live: live6, hold: fp6 ? +fp6.hold.toFixed(2) : null, share: +share6.toFixed(2) };
        W.dropDeals(ca, cb);
      }
      m.cartelHolds = cartelOK; m.cartelInfo = cartelInfo;
      // the laboratories' energy: convex in technology, and one formula for the economy and the world's seeder alike
      var CO6 = window.COUNTRIES, te100 = CO6.techEnergyOf(100, 1, cf6b), te50 = CO6.techEnergyOf(50, 1, cf6b);
      m.techEnergyConvex = Math.abs(te100 - cf6b.needEnergyTech) < 1e-12 && te50 < 0.3 * te100 && CO6.techEnergyOf(0, 1, cf6b) === 0
                           && CO6.techEnergyOf(50, 2, cf6b) === 2 * te50;
      // the world opens at the balance it was seeded for: an identity that holds only while both copies of every need agree
      var prod6 = [0, 0, 0, 0], cons6 = [0, 0, 0, 0];
      for (var bi6 in S6b) { var bs6 = S6b[bi6]; if (!bs6.production || !bs6.consumption) continue;
        for (var bk6 = 0; bk6 < 4; bk6++) { prod6[bk6] += bs6.production[bk6]; cons6[bk6] += bs6.consumption[bk6]; } }
      var bal6 = prod6.map(function (v, k) { return v / Math.max(1e-9, cons6[k]); });
      var want6 = [cf6b.energyBalance0, cf6b.materialsBalance0, cf6b.worldBalance0, cf6b.worldBalance0];
      m.energySeededBalanced = bal6.every(function (v, k) { return Math.abs(v / want6[k] - 1) < 0.4; });   // two years of drift is allowed; a formula that disagrees with the seeder is not
      m.seedInfo = { balance: bal6.map(function (v) { return +v.toFixed(2); }), want: want6, techEnergy: [+te50.toFixed(4), +te100.toFixed(4)] };
      // a find is mostly a field and occasionally a province; and striking a type a country had none of is worth something
      var EV6 = window.EVENTS, fnd = null, room6 = -1, roomK = 0;
      for (var fi6 in S6b) { var fs6 = S6b[fi6]; if (!fs6.st || !fs6.res || !fs6.potential || fs6.pop < 5) continue;
        for (var rk6 = 0; rk6 < 4; rk6++) if (cf6b.resMax - fs6.res[rk6] > room6 && fs6.potential[rk6] > 0) { room6 = cf6b.resMax - fs6.res[rk6]; fnd = fi6; roomK = rk6; } }
      if (fnd && room6 >= cf6b.findCap) {                                      // room for the largest find, so nothing is measured against the ceiling
        var fst = S6b[fnd], keepRes6 = fst.res.slice(), keepPot6 = fst.potential.slice();
        // this check is about the size of a find, not where it lands: the type draw is price-weighted now (findsFollowPrice
        // covers that), so the weighting is switched off for the window and the stub stream picks the type as before
        var keepFP6 = cf6b.findPrice; cf6b.findPrice = 0;
        var findGain = function (u, type6) {                                   // the first draw picks the type, the second the size
          fst.res = keepRes6.slice(); fst.potential = keepPot6.slice();
          var n6 = 0;
          EV6.fire(fnd, "resource", 0, function () { n6++; return n6 === 1 ? (type6 + 0.5) / 4 : u; });
          return { gain: fst.res[type6] - keepRes6[type6], pot: fst.potential[type6] };
        };
        var med6 = findGain(0.5, roomK).gain, big6 = findGain(0.004, roomK).gain;
        fst.res = keepRes6.slice(); fst.potential = keepPot6.slice();
        var freshK = (roomK + 1) % 4;
        fst.res[freshK] = 0; fst.potential[freshK] = 0;                        // a type it has none of
        var n6b = 0;
        EV6.fire(fnd, "resource", 0, function () { n6b++; return n6b === 1 ? (freshK + 0.5) / 4 : 0.5; });
        var fresh6 = { res: fst.res[freshK], pot: fst.potential[freshK] };
        fst.res = keepRes6; fst.potential = keepPot6; cf6b.findPrice = keepFP6;
        m.findsVary = big6 > med6 * 3 && big6 >= 25 && big6 <= cf6b.findCap + 1e-9 && med6 > 0 && med6 < 15
                      && fresh6.res > 0 && fresh6.pot > 0;                     // striking it fresh yields real ground, not a number on paper
        m.findInfo = { country: fnd, type: roomK, room: Math.round(room6), median: +med6.toFixed(1), rare: +big6.toFixed(1), cap: cf6b.findCap,
                       fresh: { res: +fresh6.res.toFixed(1), potential: +fresh6.pot.toFixed(2) } };
      } else { m.findsVary = false; m.findInfo = "no country with room for a full find"; }
      // technology's energy upkeep: cut off, the laboratories go dark and technology decays, and the balance says so
      var tu = S6b.CH, keepPot = tu.potential.slice(), keepAccess = tu.marketAccess, tech0 = tu.st.technology;
      tu.potential = [0, keepPot[1], keepPot[2], keepPot[3]]; tu.stock = [0, tu.stock[1], tu.stock[2], tu.stock[3]];
      var sanc6 = function (from, to) { var pq = W.pairOf(from, to); if (from < to) pq.sanA = 1; else pq.sanB = 1; };
      var unsanc6 = function (from, to) { var pq = W.pairOf(from, to); if (from < to) pq.sanA = 0; else pq.sanB = 0; };
      ["US", "CN", "DE", "JP", "IN", "GB", "FR", "BR"].forEach(function (b6) { sanc6(b6, "CH"); W.pairOf(b6, "CH").rel = -60; });   // most of the market shut, and not lifted
      for (var dk6 in W.PAIRS) { if (dk6.indexOf("CH") >= 0) { var i6 = dk6.indexOf("|"); W.dropDeals(dk6.slice(0, i6), dk6.slice(i6 + 1)); } }   // no deal brings energy either
      W.dropDeals("CH", "DE"); W.dropDeals("CH", "FR"); W.dropDeals("CH", "IT"); W.dropDeals("CH", "AT");
      var keepR = cf6b.researchStep, keepT = cf6b.techStep, keepG = cf6b.diffuseGain, keepD = cf6b.driftSlow, keepN = cf6b.driftNoise;
      cf6b.researchStep = 0; cf6b.techStep = 0; cf6b.diffuseGain = 0; cf6b.driftSlow = 0; cf6b.driftNoise = 0;   // nothing lifts technology during the window: only the decay shows
      tu.st.technology = Math.min(tu.st.technology, 80); tech0 = tu.st.technology;     // off the ceiling, where the clamp would hide a slow decay
      W.advanceDays(5);
      var labsDark = tu.techUnpaid, balDark = tu.balance[0];                  // before its neighbours can sign new deals with it
      W.advanceDays(15);
      cf6b.researchStep = keepR; cf6b.techStep = keepT; cf6b.diffuseGain = keepG; cf6b.driftSlow = keepD; cf6b.driftNoise = keepN;
      var techLoss = tech0 - tu.st.technology;
      // the labs pay first, in technology.  Measured against the row rather than a fixed number, so lowering the decay
      // rate does not silently break the check: at least two fifths of what a total blackout could strip in the window
      m.techUpkeepFirst = techLoss > 0.4 * cf6b.decayTech * 20 && labsDark > 0.5;
      m.shortageTellsTruth = balDark < 0.9;                                    // and the balance reports the shortfall rather than hiding it behind them
      m.techInfo = { techLoss: +techLoss.toFixed(2), labsDark: +labsDark.toFixed(2), balDark: +balDark.toFixed(2), energyBalance: +tu.balance[0].toFixed(2), access: +(tu.marketAccess || 1).toFixed(2) };
      tu.potential = keepPot; ["US", "CN", "DE", "JP", "IN", "GB", "FR", "BR"].forEach(function (b6) { unsanc6(b6, "CH"); });
      // stage 7 (climate and events): zones differ inside a region, the oscillation has a sign per zone, a hurricane runs a track,
      // people flee a catastrophe and come back, and discoveries leak slowly through the sharing rule
      var CO7 = window.COUNTRIES, E7 = window.EVENTS, S7 = W.COUNTRY_STATE, cf7 = window.ENTITY_CONFIG;
      var zEG = CO7.zoneOf("EG"), zNG = CO7.zoneOf("NG");
      var wxEG = CO7.weatherAnomaly("EG", W.seed, W.day), wxNG = CO7.weatherAnomaly("NG", W.seed, W.day);
      m.zonesDiffer = zEG !== zNG && Math.abs(wxEG - wxNG) > 0.02 && CO7.climateOf("EG").humidity < CO7.climateOf("NG").humidity;
      m.zoneInfo = { EG: [zEG, +wxEG.toFixed(2)], NG: [zNG, +wxNG.toFixed(2)] };
      var oscOK = true, oscVals = [];
      for (var oy = 0; oy < 8; oy++) { var ov = CO7.oscillation(W.seed, oy); oscVals.push(+ov.toFixed(2)); if (!(ov >= -1 && ov <= 1)) oscOK = false; }
      var spread = Math.max.apply(null, oscVals) - Math.min.apply(null, oscVals);
      m.oscillationSigned = oscOK && spread > 0.5 && CO7.ZONE.arid.osc < 0 && CO7.ZONE.monsoon.osc > 0;
      m.oscInfo = oscVals;
      // a hurricane on a coast with sea-linked neighbours reaches at least one of them
      var coast7 = null;
      for (var ci in S7) { var cs7 = S7[ci]; if (!cs7.st || cs7.pop < 5) continue;
        if (window.LINKS.partners(ci).some(function (o) { return window.LINKS.linkedBy(ci, o, "sea"); }) && (window.LINKS.coastKm[ci] || 0) > 0) { coast7 = ci; break; } }
      var fp0 = E7.stats.footprints, dead0 = E7.stats.dead, ref0 = E7.stats.refugees;
      var hEv = coast7 ? E7.fire(coast7, "storm", 2, function () { return 0.1; }) : null;
      m.hurricaneTracks = !!hEv && E7.stats.footprints > fp0 && /path/.test(hEv.text) && E7.stats.dead > dead0;
      m.hurricaneInfo = { at: coast7, text: hEv ? hEv.text.slice(0, 120) : null, footprints: E7.stats.footprints - fp0 };
      // a catastrophe sends refugees to friends; once home is calm they come back
      var rf = "GR"; S7[rf].refugees = []; var rfPop0 = S7[rf].pop;
      W.pairOf(rf, "IT").rel = 60; W.pairOf(rf, "BG").rel = 60;
      var fled = E7.flee(rf, 0.05, "test", function () { return 0.5; });
      var abroad = (S7[rf].refugees || []).reduce(function (a, r) { return a + r[1]; }, 0);
      var hostPop = S7[rf].refugees.length ? S7[S7[rf].refugees[0][0]].pop : 0;
      S7[rf].dryUntil = 0; S7[rf].wetUntil = 0; S7[rf].smokeUntil = 0; S7[rf].occupiedBy = null;
      var calm7 = E7.calm(rf, S7[rf]);
      E7.refugeeTick();
      var abroad2 = (S7[rf].refugees || []).reduce(function (a, r) { return a + r[1]; }, 0);
      m.refugeesMove = fled > 0 && abroad > 0 && S7[rf].pop < rfPop0 && (!calm7 || abroad2 < abroad);
      m.refugeeInfo = { fled: +fled.toFixed(3), abroad: +abroad.toFixed(3), calm: calm7, after: +abroad2.toFixed(3) };
      // discoveries leak slowly: adoptions so far stay far below the old flood, and nobody climbs past the origin's share
      var adoptedPerYear = E7.stats.adoptions / Math.max(1, W.day / 365);
      m.diffusionSlow = adoptedPerYear < cf7.diffuseStop * 4000 && adoptedPerYear < 2500;   // the censuses run 1000-1600 a year; the old flood was several thousand
      m.diffusionInfo = { adoptions: E7.stats.adoptions, perYear: Math.round(adoptedPerYear), day: W.day };
      // stage 6 (war): the estimate errs afresh each time, reach follows technology, allies choose and bleed,
      // war kills, peace can carry terms, and an uprising can end an occupation
      var D6 = window.DECIDE, S6 = W.COUNTRY_STATE, cf6 = window.ENTITY_CONFIG;
      var mk = function (seed) { var x = seed; return function () { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; }; };
      var e1 = D6.estimateRatio("RU", "UA", mk(1)), e2 = D6.estimateRatio("RU", "UA", mk(2)), e3 = D6.estimateRatio("RU", "UA", null);
      m.estimateVaries = Math.abs(e1.est - e2.est) > 1e-6 && Math.abs(e3.est - e3.truth) < 1e-9 && e1.sigma > 0;
      m.estimateInfo = { truth: +e1.truth.toFixed(3), a: +e1.est.toFixed(3), b: +e2.est.toFixed(3), sigma: +e1.sigma.toFixed(3) };
      var reachPair = null;
      for (var ri in S6) { var rs = S6[ri]; if (!rs.st || rs.pop < 1) continue;
        var seaOnly = window.LINKS.partners(ri).filter(function (o) { return !window.LINKS.linkedBy(ri, o, "land") && window.LINKS.linkedBy(ri, o, "sea"); });
        if (seaOnly.length) { reachPair = [ri, seaOnly[0]]; break; } }
      if (reachPair) {
        var rsS = S6[reachPair[0]], keepTech = rsS.st.technology;
        rsS.st.technology = cf6.techLow - 5; var lowR = D6.canReach(reachPair[0], reachPair[1]);
        rsS.st.technology = cf6.techLow + 5; var midR = D6.canReach(reachPair[0], reachPair[1]);
        rsS.st.technology = keepTech;
        m.reachByTech = lowR === false && midR === true;
        m.reachInfo = { pair: reachPair, low: lowR, mid: midR };
      } else m.reachByTech = false;
      // a war with an ally asked: it joins, fights and bleeds; both principals lose people
      var wa = "RU", wd = "UA";
      if (W.warBetween(wa, wd)) D6.suePeace(wa, wd);
      W.pairOf(wd, "PL").pact = W.day; W.pairOf(wd, "PL").truce = 0; W.touchPairs();   // Poland stands with Ukraine, seen at once
      if (W.warBetween(wa, wd)) D6.suePeace(wa, wd);
      var pl = S6.PL, ua = S6.UA, ru = S6.RU;
      pl.occupiedBy = null; ua.occupiedBy = null; ru.occupiedBy = null;
      D6.declareWar(wa, wd, { force: true });
      var war6 = W.warBetween(wa, wd);
      var askedPL = !!war6 && war6.asked.def.indexOf("PL") >= 0;
      var plMil0 = pl.st.military, plPop0 = pl.pop, uaPop0 = ua.pop, ruPop0 = ru.pop;
      var joined = D6.joinWar("PL", war6, "def");
      for (var wt = 0; wt < 5; wt++) D6.warTick(function () { return 0.5; });
      var stillOn = !!W.warBetween(wa, wd);
      m.alliesJoinAndBleed = askedPL && joined && war6.allies.def.indexOf("PL") >= 0 && pl.st.military < plMil0 && pl.pop < plPop0 && pl.warDead > 0;
      m.warKills = ua.pop < uaPop0 && ru.pop < ruPop0 && (ua.warDead || 0) > 0 && (ru.warDead || 0) > 0;
      m.warInfo = { stillOn: stillOn, plMil: [plMil0, pl.st.military], uaDead: ua.warDead, ruDead: ru.warDead, askedPL: askedPL, joined: joined, plPop: [plPop0, pl.pop], plDead: pl.warDead };
      // peace with terms: the side behind sues, the side ahead takes an indemnity as a deal
      if (!W.warBetween(wa, wd)) D6.declareWar(wa, wd, { force: true });
      var w6b = W.warBetween(wa, wd); w6b.score = 0.6;                                  // Russia well ahead
      var dealsB4 = W.dealsOf(wa, wd).length;
      D6.suePeace(wd, wa);
      var termsDeal = W.dealsOf(wa, wd).find(function (d) { return d.mq; });
      var paysRU = termsDeal && ((wa < wd && termsDeal.mq < 0) || (wa > wd && termsDeal.mq > 0));   // the money flows to Russia
      m.peaceTermsFlow = !W.warBetween(wa, wd) && !!termsDeal && !!paysRU && W.dealsOf(wa, wd).length > dealsB4;
      m.peaceInfo = { deal: termsDeal ? [termsDeal.g, +termsDeal.gq.toFixed(2), termsDeal.t, +termsDeal.tq.toFixed(2), +termsDeal.mq.toFixed(1), termsDeal.until] : null };
      W.dropDeals(wa, wd);
      // an uprising: a restless occupied country throws the garrison out when the dice say so
      var by6 = S6.BY; D6.occupy("RU", "BY", 300); by6.st.stability = 10; by6.legit = 5; var ruMil6 = ru.st.military;
      D6.occupationTick(function () { return 0.0001; });
      m.uprisingEnds = !by6.occupiedBy && ru.st.military < ruMil6 && by6.st.stability > 10;
      by6.occupiedBy = null; by6.occupiedUntil = 0;
      // stage 5 (government): legitimacy replaces the fixed authority optimum, each type has its own succession,
      // a backed coup can fail and cost its sponsor, and the split axes survive a save
      var G5 = window.GOV, s5 = W.COUNTRY_STATE.FR, keepMods = JSON.stringify(s5.regime.mods);
      var legit0 = G5.legitimacyOf("FR", s5); s5.legit = legit0;
      var stab0 = W.driftTargetsOf("FR").stability;
      G5.nudge(s5, { authority: -40, freedom: -30 });                   // a regime far from what the nation is (and no more coercive, so coercion cannot offset the loss)
      s5.legit = G5.legitimacyOf("FR", s5);
      var legit1 = s5.legit, stab1 = W.driftTargetsOf("FR").stability;
      s5.regime.mods = JSON.parse(keepMods); G5.refresh(s5); s5.legit = legit0;
      m.legitimacyReplaces55 = legit1 < legit0 - 15 && stab1 < stab0 - 2;   // the regime's own modifiers may offset part of the nudge
      m.legitInfo = { fit: Math.round(legit0), misfit: Math.round(legit1), stabFit: Math.round(stab0), stabMisfit: Math.round(stab1) };
      var rngHalf = function () { return 0.5; };
      var pick5 = function (type) { for (var k5 in W.COUNTRY_STATE) { var t5 = W.COUNTRY_STATE[k5]; if (t5.st && t5.pop >= 1 && !t5.occupiedBy && G5.typeOf(t5) === type) return k5; } return null; };
      var eI = pick5("elected"), hI = pick5("hereditary"), mI = pick5("military"), pI = pick5("party");
      var ok5 = !!(eI && hI && mI && pI);
      if (ok5) {
        var e5 = W.COUNTRY_STATE[eI]; G5.election(eI, e5, rngHalf); ok5 = ok5 && e5.regime.since === W.day && (G5.typeOf(e5) === "elected" || G5.typeOf(e5) === "party");
        var h5 = W.COUNTRY_STATE[hI]; G5.succession(hI, h5, rngHalf); ok5 = ok5 && G5.typeOf(h5) === "hereditary" && h5.regime.since === W.day;
        var m5 = W.COUNTRY_STATE[mI]; G5.appointment(mI, m5, rngHalf); ok5 = ok5 && G5.typeOf(m5) === "military" && m5.regime.since === W.day;
        var p5 = W.COUNTRY_STATE[pI]; G5.congress(pI, p5, rngHalf); ok5 = ok5 && G5.typeOf(p5) === "party" && p5.regime.since === W.day;
      }
      m.successionByType = ok5;
      m.successionInfo = { elected: eI, hereditary: hI, military: mI, party: pI };
      // a backed coup: with the dice against it, it fails and the sponsor pays; with the dice for it, the regime turns
      var tgt5 = "GE", spn5 = "RU", t5s = W.COUNTRY_STATE[tgt5], type5 = G5.typeOf(t5s), rel5 = W.relOf(spn5, tgt5), stab5 = t5s.st.stability;
      var failed = G5.attemptCoup(spn5, tgt5, function () { return 0.99; }) === false;
      var costs = W.relOf(spn5, tgt5) < rel5 && W.COUNTRY_STATE[spn5].disgraceUntil > W.day && t5s.st.stability >= Math.min(100, stab5 + 1) && G5.typeOf(t5s) === type5;
      var won = G5.attemptCoup(spn5, tgt5, function () { return 0.01; }) === true && G5.typeOf(t5s) === "military";
      m.coupsFail = failed && costs && won;
      m.coupInfo = { failed: failed, costs: costs, won: won };
      // the split axes: political freedom is its own number, saved with the base and the regime, and the label reads it
      var cn5 = W.COUNTRY_STATE.CN, packed5 = W.packCountry(cn5), back5 = {};
      W.unpackCountry(JSON.parse(JSON.stringify(packed5)), back5);
      m.axesSplitSaved = cn5.freedom !== cn5.econOpen && !!back5.base && back5.base.freedom === cn5.base.freedom && !!back5.regime && back5.regime.type === "party"
                         && back5.freedom === cn5.freedom && G5.labelOf(cn5) === G5.label(cn5.authority, cn5.freedom);
      m.axesInfo = { freedom: cn5.freedom, openness: cn5.econOpen, type: G5.typeOf(cn5), label: G5.labelOf(cn5) };
      // stage 4 (diplomacy as transfers): deals move real amounts, both sides must gain, sanctions cut market access,
      // relations return to their baseline and a step is felt by the partner's friends
      var deals = 0, dPairs = 0, swaps = 0, techLegs = 0, inflow = 0, outflow = 0, negShort = 0;
      for (var pk in W.PAIRS) {
        var pp = W.PAIRS[pk];
        if (!pp.deals || !pp.deals.length) continue;
        dPairs++; deals += pp.deals.length;
        pp.deals.forEach(function (d) { if (d.g >= 0 && d.t >= 0) swaps++; if (d.tech) techLegs++; if (d.short < 0) negShort++; });
      }
      for (var di in W.COUNTRY_STATE) {
        var ds = W.COUNTRY_STATE[di];
        if (!ds.dealIn) continue;
        for (var dk = 0; dk < 4; dk++) { inflow += ds.dealIn[dk]; outflow += ds.dealOut[dk]; }
      }
      m.dealCounts = { deals: deals, pairs: dPairs, swaps: swaps, techLegs: techLegs, inflow: Math.round(inflow), outflow: Math.round(outflow) };
      m.dealsTransfer = deals > 20 && inflow > 1 && Math.abs(inflow - outflow) < 0.01 * Math.max(1, inflow) && !negShort;
      // a deal needs something on both sides: whoever signs gains, and a partner with nothing spare is never signed up
      var near = null, dry = null, DS = window.DECIDE;
      for (var ni in W.COUNTRY_STATE) {
        var ns = W.COUNTRY_STATE[ni];
        if (!ns.st || ns.pop < 5) continue;
        var ps = window.LINKS.partners(ni);
        for (var pi = 0; pi < ps.length && !near; pi++) {
          var pr1 = DS.proposeSwap(ni, ps[pi]);
          if (pr1 && pr1.mutual) near = [ni, ps[pi], +pr1.gainA.toFixed(3), +pr1.gainB.toFixed(3)];
        }
        if (near) break;
      }
      if (near) {
        var dp = W.COUNTRY_STATE[near[1]], keepPot = dp.potential, keepStock = dp.stock;
        dp.potential = [0, 0, 0, 0]; dp.stock = [0, 0, 0, 0]; dp.production = null;   // nothing left to put up
        var pr3 = DS.proposeSwap(near[0], near[1]);
        dry = !pr3 || !pr3.mutual;
        dp.potential = keepPot; dp.stock = keepStock;
      }
      m.dealsAccepted = !!near && near[2] > 0 && near[3] > 0 && dry === true;
      m.dealsAcceptedInfo = { near: near, refusedWhenNothingToGive: dry };
      // a deal that cannot be delivered breaks, and the pair loses goodwill for it
      var bk = null;
      for (var bkk in W.PAIRS) { var bp = W.PAIRS[bkk]; if (bp.deals && bp.deals.length) { bk = bkk; break; } }
      if (bk) {
        var bi = bk.indexOf("|"), ba = bk.slice(0, bi), bb = bk.slice(bi + 1), bd = W.PAIRS[bk].deals[0], relB4 = W.PAIRS[bk].rel;
        bd.g = 0; bd.gq = 1e9; bd.short = cf.dealBreakDays;          // nobody can ship a billion units a day
        W.dealsTick();
        m.dealsBreak = (W.PAIRS[bk].deals || []).indexOf(bd) < 0 && W.PAIRS[bk].rel < relB4;   // the broken deal is gone; others on the pair may stay
      }
      // sanctions: the target loses the sanctioners' weight in world trade, and gets it back when they are lifted
      var tgt = "VN", sanc = ["US", "CN", "DE"], pcs = [];
      for (var si = 0; si < sanc.length; si++) { var sp2 = W.pairOf(sanc[si], tgt); if (sanc[si] < tgt) sp2.sanA = 1; else sp2.sanB = 1; }
      W.advanceDays(1);
      var accCut = window.ECONOMY.marketAccess(tgt);
      for (var si2 = 0; si2 < sanc.length; si2++) { var sp3 = W.pairOf(sanc[si2], tgt); if (sanc[si2] < tgt) sp3.sanA = 0; else sp3.sanB = 0; }
      W.advanceDays(1);
      var accBack = window.ECONOMY.marketAccess(tgt);
      m.sanctionsBite = accCut < 0.9 && accBack > accCut + 0.05;
      m.sanctionInfo = { cut: Math.round(accCut * 100) / 100, back: Math.round(accBack * 100) / 100 };
      // relations return toward their baseline, and a new deal is felt by the partner's friends
      var rvA = "BR", rvB = "MN", rv = W.pairOf(rvA, rvB);                    // far apart, unrelated, nothing signed
      rv.pact = 0; rv.deals = []; rv.sanA = 0; rv.sanB = 0;
      var rest0 = W.restingRel(rvA, rvB, rv);
      rv.rel = 95;
      W.advanceDays(60);
      var fell = rv.rel < 90 && rv.rel > rest0 - 5;
      rv.pact = W.day;                                                        // an alliance raises where it settles
      var rest1 = W.restingRel(rvA, rvB, rv);
      rv.pact = 0;
      m.relationsRevert = fell && rest1 > rest0 + 10;
      m.relationsRevertTo = { from: 95, to: Math.round(rv.rel), resting: Math.round(rest0), withPact: Math.round(rest1) };
      var fA = "BR", fB = "AR", fC = "UY";                            // a friend of the partner, to watch the ripple
      W.pairOf(fB, fC).rel = 70; W.touchPairs();                     // a tie formed: the tie lists see it at once now
      var before3 = W.relOf(fA, fC);
      W.rippleRel(fA, fB, 12);
      m.thirdPartySeen = W.relOf(fA, fC) > before3;
      // the population cycle: a food-rich country at peace pushed past what its land feeds drains its stores, rations by its
      // legitimacy, starves, and recovers once its people are back under the line; the workforce follows the people
      var E16 = window.ECONOMY, S16 = W.COUNTRY_STATE, cf16 = window.ENTITY_CONFIG, over16 = null;
      ["AR", "NZ", "CA", "AU", "UY", "PY"].forEach(function (c16) { if (over16) return; var cs16 = S16[c16]; if (cs16 && cs16.st && cs16.production && !W.fighting(c16) && !cs16.occupiedBy && cs16.production[2] > cs16.consumption[2]) over16 = c16; });
      if (over16) {
        var os16 = S16[over16], keepDeals = cf16.dealsPerPair, keepPop = os16.pop, keepPop0 = os16.pop0, keepTr = os16.treasury, keepStock = os16.stock.slice();
        var keepBV16 = cf16.brokeVitalShare; cf16.brokeVitalShare = 0;   // overshoot is the land failing to feed the mouths: the market is closed to it, by deal and by purse
        cf16.dealsPerPair = 0; for (var pk16 in W.PAIRS) { if (pk16.indexOf(over16) < 0) continue; var ab16 = pk16.split("|"); if (ab16[0] === over16 || ab16[1] === over16) W.dropDeals(ab16[0], ab16[1]); }
        var need1 = os16.production[2] / cf16.needFood, legit0 = os16.legit != null ? os16.legit : 60;
        // too many mouths, no money for the market.  Credit rests on the remembered income now, so that has to go
        // with the treasury or the limit stays high and the country simply buys its way out of the famine
        os16.pop = 1.3 * need1; os16.pop0 = os16.pop;
        // past any limit its income could earn back, so it stays broke for the whole window: sizing this from today's
        // credit is not enough, because incomeRef climbs back toward the real income and the limit follows it up
        os16.treasury = -3 * cf16.creditDays * E16.taxIncome(os16);
        os16.incomeRef = 1; os16.broke = true;
        
        os16.stock[2] = 10 * os16.production[2]; os16.stock[3] = 10 * os16.production[3];              // ten days in the granary: rations start at once, the store is gone within the window
        W.advanceDays(60);
        m.overshootDrains = os16.stock[2] < 0.05 * os16.stockCap[2] + 1e-9 && (os16.famine || 0) > 0 && os16.deaths > os16.births;
        var legitNow = os16.legit != null ? os16.legit : 60;                                       // the shortage itself costs legitimacy, so judge by today's
        m.rationingBites = (os16.ration || 0) > 0.4 * cf16.rationMax * legitNow / 100 && os16.consumption[2] < os16.pop * cf16.needFood * 0.98;
        var popA = os16.pop, pop0A = os16.pop0;
        W.advanceDays(180);                                                                            // at deathMax a famine takes about 9% a year
        m.overshootKills = os16.pop < 0.97 * popA; m.workforceFollows = os16.pop0 < pop0A;
        var at240 = { pop: +os16.pop.toFixed(2), popAt60: +popA.toFixed(2), wanted: +(0.97 * popA).toFixed(2),
                      famine: +(os16.famine || 0).toFixed(3), ration: +(os16.ration || 0).toFixed(3),
                      foodBalance: os16.balance ? +os16.balance[2].toFixed(2) : null, broke: !!os16.broke,
                      credit: Math.round(E16.credit(os16)), treasury: Math.round(os16.treasury),
                      stock: +os16.stock[2].toFixed(1), deaths: +(os16.deaths || 0).toFixed(4), births: +(os16.births || 0).toFixed(4) };
        cf16.brokeVitalShare = keepBV16;
        os16.pop = 0.8 * need1; os16.pop0 = os16.pop; os16.treasury = 0; os16.broke = false;
        W.advanceDays(200);
        m.overshootRecovers = (os16.famine || 0) === 0 && os16.births > os16.deaths && os16.stock[2] > 0;
        m.overshootInfo = { country: over16, need: +need1.toFixed(2), popA: +popA.toFixed(2), popB: +os16.pop.toFixed(2), ration: +(os16.ration || 0).toFixed(3), legit0: Math.round(legit0), legitNow: Math.round(legitNow), famine: +(os16.famine || 0).toFixed(3), stock: +os16.stock[2].toFixed(1), at240: at240 };
        cf16.dealsPerPair = keepDeals; os16.pop = keepPop; os16.pop0 = keepPop0; os16.treasury = keepTr; os16.stock = keepStock;
      } else { m.overshootDrains = m.rationingBites = m.overshootKills = m.workforceFollows = m.overshootRecovers = false; m.overshootInfo = "no country"; }
      // curated defaults: every map code has a row, every agent has people, a zone and a regime type, scenery has no state,

      var DT = window.DATA, S15 = W.COUNTRY_STATE, cf15 = window.ENTITY_CONFIG, G15 = window.GOV, CO15 = window.COUNTRIES;
      var noRow = (W.worldMap ? W.worldMap.countries : []).filter(function (k) { return k.iso2 && k.iso2 !== "\u2014" && !DT.ROWS[k.iso2]; }).map(function (k) { return k.iso2; });
      var unpeopled = [], unzoned = [];
      for (var i15 in S15) { var s15 = S15[i15]; if (!s15.st) continue;
        if (!(DT.popOf(i15) >= DT.AGENT_MIN_POP)) unpeopled.push(i15);   // by its row: a small agent may have shrunk since day one
        if (!CO15.ZONE[CO15.zoneOf(i15)] || G15.TYPES.indexOf(G15.typeOf(s15)) < 0) unzoned.push(i15); }
      m.dataCoversMap = noRow.length === 0; m.agentsPeopled = unpeopled.length === 0; m.agentsZoned = unzoned.length === 0;
      m.sceneryInert = !S15.VA && !S15.XX && !DT.isAgent("VA") && DT.isAgent("SG") && (W.worldMap ? W.worldMap.countries.some(function (k) { return k.iso2 === "VA"; }) : true);
      m.defaultsInfo = { noRow: noRow.slice(0, 10), unpeopled: unpeopled.slice(0, 10), unzoned: unzoned.slice(0, 10), agents: Object.keys(S15).length };
      // the market buys every shortage, the worst first, at any landed price: a rich country short of two types buys both,
      // even with one of them priced well above the limit that only stops the buying-ahead
      var E10 = window.ECONOMY, S10 = W.COUNTRY_STATE, cf10 = window.ENTITY_CONFIG, M10 = E10.market(), buyer = null, keepPot10 = null, diag10 = [];
      for (var b10 in S10) {
        var bs = S10[b10];
        if (!(bs.st && bs.production && bs.potential && bs.pop >= 10 && bs.treasury > 20000 && !bs.occupiedBy && !W.fighting(b10) && E10.marketAccess(b10) > 0.9)) continue;
        for (var pk10 in W.PAIRS) { if (pk10.indexOf(b10) < 0) continue; var ab10 = pk10.split("|"); if (ab10[0] === b10 || ab10[1] === b10) W.dropDeals(ab10[0], ab10[1]); }   // no deals feeding it
        var pot10 = bs.potential.slice();
        bs.potential[0] *= 0.02; bs.potential[1] *= 0.02; bs.stock[0] = 0; bs.stock[1] = 0;            // short of energy and materials at once, whatever its endowment
        var as10 = E10.assess(b10);
        diag10.push([b10, as10 ? [+as10.production[0].toFixed(0), +as10.consumption[0].toFixed(0), +as10.production[1].toFixed(0), +as10.consumption[1].toFixed(0)] : null]);
        if (as10 && as10.production[0] < as10.consumption[0] * 0.5 && as10.production[1] < as10.consumption[1] * 0.5) { buyer = b10; keepPot10 = pot10; break; }
        bs.potential = pot10;                                                                           // not short after all: leave it be
      }
      if (buyer) {
        var bsx = S10[buyer], keepPrice1 = M10.price[1];
        M10.price[1] = cf10.priceLimit * cf10.priceBase * 2;                                            // materials well above the limit
        W.advanceDays(1); var bought1 = (bsx.bought || [0, 0, 0, 0]).slice();                        // day one buys energy two days ahead (it is cheap) and materials for the day
        W.advanceDays(1); var bought2 = (bsx.bought || [0, 0, 0, 0]).map(function (x, k) { return x + bought1[k]; });
        m.buysEveryShortage = bought2[0] > 0 && bought2[1] > 0 && M10.price[1] > cf10.priceLimit * cf10.priceBase;
        m.buyInfo = { buyer: buyer, bought: bought2.map(function (x) { return Math.round(x); }), balance: bsx.balance.map(function (x) { return +x.toFixed(2); }), price: +M10.price[1].toFixed(2), types: bsx.lastMarket ? bsx.lastMarket.types : 0, tried: diag10 };
        bsx.potential = keepPot10; M10.price[1] = keepPrice1;
      } else { m.buysEveryShortage = false; m.buyInfo = { tried: diag10 }; }
      // endings and truces: no offer of peace in the first days, peace never warmer than before the war, a frozen front is a stalemate,
      // a truce drawn from a range, a lost war remembered in the next estimate
      var D11 = window.DECIDE, S11 = W.COUNTRY_STATE, cf11 = window.ENTITY_CONFIG, pair11 = null;
      for (var a11 in S11) { var as11 = S11[a11]; if (!as11.st || as11.pop < 5 || W.fighting(a11) || as11.occupiedBy) continue;
        var ls11 = window.LINKS.partners(a11).filter(function (o) { var os = S11[o]; return window.LINKS.linkedBy(a11, o, "land") && os && os.st && os.pop >= 5 && !W.fighting(o) && !os.occupiedBy && W.relOf(a11, o) > -60; });
        if (ls11.length) { pair11 = [a11, ls11[0]]; break; } }
      if (pair11) {
        var A11 = pair11[0], B11 = pair11[1], rel0 = W.relOf(A11, B11);
        D11.declareWar(A11, B11, { force: true });
        var war11 = W.warBetween(A11, B11), T11 = window.COUNTRIES.temperament(A11, W.seed);
        var early = D11.candidates(A11, S11[A11], cf11, T11, null, "monthly").some(function (k) { return k.action === "peace"; });
        var keepPace = cf11.warPace, keepNoise = cf11.warNoise; cf11.warPace = 0; cf11.warNoise = 0;   // a front that cannot move
        var keepEarliest = cf11.peaceEarliest; cf11.peaceEarliest = 1e6;                       // the sim itself makes no peace here: only the frozen front can end it
        W.advanceDays(keepEarliest + 1);
        cf11.peaceEarliest = keepEarliest;                                                     // the candidate, asked with the real rule, is offered now
        var late = !!W.warBetween(A11, B11) && D11.candidates(A11, S11[A11], cf11, T11, null, "monthly").some(function (k) { return k.action === "peace"; });
        cf11.peaceEarliest = 1e6;
        var d11 = W.day; W.advanceDays(cf11.stalemateDays + 2);
        cf11.warPace = keepPace; cf11.warNoise = keepNoise; cf11.peaceEarliest = keepEarliest;
        var stale = W.WORLD_STATE.log.some(function (e) { return e.kind === "stalemate" && e.iso === A11 && e.iso2 === B11 && e.d > d11 - 1; });
        var relAfter = W.relOf(A11, B11), truce11 = W.pairOf(A11, B11).truce - W.day;
        m.peaceNotEarly = !early && late;
        m.stalemateFrozen = stale && !W.warBetween(A11, B11);
        m.peaceScarred = relAfter <= rel0 - cf11.peaceScar + 0.5;
        m.truceDrawn = truce11 >= cf11.truceDays * cf11.truceMin - 1 && truce11 <= cf11.truceDays * cf11.truceMax + 1 && truce11 !== cf11.truceDays;
        var lw = S11[A11].lastWar && S11[A11].lastWar[B11];
        S11[A11].lastWar = {};                                                                 // the estimate with no memory, then with a loss remembered
        var est0 = D11.estimateRatio(A11, B11, null, T11);
        S11[A11].lastWar = { }; S11[A11].lastWar[B11] = { o: "lost", d: W.day };
        var est1 = D11.estimateRatio(A11, B11, null, T11);
        m.warRemembered = !!lw && lw.o === "stalemate" && est1.est < est0.est * 0.99 && est1.memory === cf11.warMemoryDiscount;
        delete S11[A11].lastWar;
        m.endingsInfo = { pair: pair11, rel0: Math.round(rel0), relAfter: Math.round(relAfter), truce: truce11, lastWar: lw || null, est: [+est0.est.toFixed(2), +est1.est.toFixed(2)] };
      } else { m.peaceNotEarly = m.stalemateFrozen = m.peaceScarred = m.truceDrawn = m.warRemembered = false; m.endingsInfo = "no pair"; }
      // treasuries: the cap is days of income, so a small state's is small; a hoard makes the next project cheaper
      var E14 = window.ECONOMY, S14 = W.COUNTRY_STATE, D14 = window.DECIDE, cf14 = window.ENTITY_CONFIG;
      var capUS = E14.capOf(S14.US), capLU = E14.capOf(S14.LU || S14.MT || S14.IS);
      m.capRelative = capUS > capLU * 20 && Math.abs(capUS - cf14.treasuryCapDays * E14.taxIncome(S14.US)) < 1e-6;
      var hoarder = null;
      for (var h14 in S14) { var hs = S14[h14]; if (hs.st && hs.production && hs.pop >= 5 && !hs.occupiedBy && !W.fighting(h14)) {
        var T14 = window.COUNTRIES.temperament(h14, W.seed), P14 = D14.prioritiesOf(h14), inc14 = E14.taxIncome(hs), keepT = hs.treasury;
        hs.treasury = P14.reserve * inc14;                                                          // exactly the reserve: nothing is cheap
        var u0 = D14.candidates(h14, hs, cf14, T14, null, "monthly").filter(function (k) { return k.action === "invest"; });
        hs.treasury = P14.reserve * inc14 + cf14.hoardDays * inc14;                                 // a hoard: projects at the floor of their cost
        var u1 = D14.candidates(h14, hs, cf14, T14, null, "monthly").filter(function (k) { return k.action === "invest"; });
        hs.treasury = keepT;
        if (u0.length && u1.length) {
          var best0 = Math.max.apply(null, u0.map(function (k) { return k.U; })), best1 = Math.max.apply(null, u1.map(function (k) { return k.U; }));
          hoarder = { iso: h14, lean: +best0.toFixed(3), hoard: +best1.toFixed(3) };
          m.hoardInvests = best1 > best0 + 1e-9; break;
        } } }
      if (!hoarder) m.hoardInvests = false;
      m.treasuryInfo = { capUS: Math.round(capUS), capSmall: Math.round(capLU), hoarder: hoarder };
      // the cycle: confidence builds while the balances hold, lenders follow it, money over the cap bleeds rather than vanishes,
      // a shortage in a confident economy breaks into a bust, and the exchange crashes when a dear type runs out
      var S17 = W.COUNTRY_STATE, E17 = window.ENTITY_CONFIG ? window.ECONOMY : null, cf17 = window.ENTITY_CONFIG, M17 = window.ECONOMY.market(), boomer = null;
      var keepEv = [cf17.pSmall, cf17.pLarge, cf17.pMassive], keepRec = W.WORLD_STATE.massive.recessionUntil;
      cf17.pSmall = 0; cf17.pLarge = 0; cf17.pMassive = 0; W.WORLD_STATE.massive.recessionUntil = 0;
      for (var b17 in S17) { var bs = S17[b17]; if (bs.st && bs.production && bs.pop >= 5 && !bs.occupiedBy && !W.fighting(b17) && !(W.day < (bs.bustUntil || 0)) && Math.min.apply(null, bs.balance) >= 1) { boomer = b17; break; } }
      if (boomer) {
        var bo = S17[boomer], keepB = { boom: bo.boom, bu: bo.bustUntil, out: bo.output, tr: bo.treasury, stock: bo.stock.slice(), pot: bo.potential.slice(), broke: bo.broke };
        bo.boom = 0.5; bo.bustUntil = 0;
        var cr0 = E17.credit(bo); bo.boom = 1; var cr1 = E17.credit(bo); bo.boom = 0.5;
        m.creditFollowsBoom = cr1 > cr0 * 1.05;
        var cap0 = E17.capOf(bo); bo.treasury = cap0 * 2; W.advanceDays(1); var mny17 = bo.money || {};
        m.capCloses = bo.treasury > cap0 * 1.5 && bo.treasury < cap0 * 2 - 0.5 * cf17.capClose * cap0 + (mny17.tax || 0) + (mny17.sales || 0);   // the excess bled, net of the day's takings
        var bm0 = bo.boom; W.advanceDays(30); var bm1 = bo.boom;
        m.boomBuilds = bm1 > bm0 + 0.01 && !(W.day < (bo.bustUntil || 0));
        var out0 = bo.output; bo.potential[1] = 0; bo.stock[1] = 0; bo.treasury = -E17.credit(bo) * 1.2; bo.broke = true;   // no materials, no money for the market
        W.advanceDays(2);
        m.bustBreaks = bo.output < out0 * (1 - cf17.bustMin + 1e-9) && bo.boom === 0 && W.day < (bo.bustUntil || 0);
        m.cycleInfo = { country: boomer, credit: [Math.round(cr0), Math.round(cr1)], boom: [+bm0.toFixed(3), +bm1.toFixed(3)], out: [+out0.toFixed(1), +bo.output.toFixed(1)], bustUntil: bo.bustUntil };
        bo.potential = keepB.pot; bo.stock = keepB.stock; bo.treasury = keepB.tr; bo.boom = keepB.boom; bo.bustUntil = keepB.bu; bo.output = keepB.out; bo.broke = keepB.broke;
      } else { m.creditFollowsBoom = m.capCloses = m.boomBuilds = m.bustBreaks = false; m.cycleInfo = "no country"; }
      var keepM = { stock: M17.stock.slice(), price: M17.price.slice(), cu: M17.crashUntil || 0, cover: cf17.crashCover };
      M17.stock[1] = 0; M17.price[1] = cf17.crashPrice * 1.2; M17.crashUntil = 0; cf17.crashCover = 1e9;   // the mechanism, not the threshold: any cover counts, the price is dear
      W.advanceDays(1);
      m.crashOnScarcity = W.WORLD_STATE.massive.recessionUntil > W.day && (M17.crashUntil || 0) > W.day;
      m.crashInfo = { recessionUntil: W.WORLD_STATE.massive.recessionUntil, crashUntil: M17.crashUntil || 0, day: W.day };
      M17.stock = keepM.stock; M17.price = keepM.price; M17.crashUntil = keepM.cu; cf17.crashCover = keepM.cover;
      cf17.pSmall = keepEv[0]; cf17.pLarge = keepEv[1]; cf17.pMassive = keepEv[2]; W.WORLD_STATE.massive.recessionUntil = keepRec;
      // occupation as control: a garrison sized to the occupied out of a share of the occupier's force; the levy, the uprising and the
      // force left follow its fill; and a country fights from what it holds -- an occupied neighbour's borders are its borders
      var S18 = W.COUNTRY_STATE, D18 = window.DECIDE, L18 = window.LINKS, keep18 = {};
      ["RU", "BY", "UA", "LU", "FR"].forEach(function (i) { var s = S18[i]; keep18[i] = { ob: s.occupiedBy, ou: s.occupiedUntil }; s.occupiedBy = null; s.occupiedUntil = 0; });
      D18.refreshHoldings(); D18.occupationTick(function () { return 1; });
      var ownRU = W.ownForce("RU"), ownLU = W.ownForce("LU"), domBefore = D18.frontDomain("RU", "RO").domain, landBefore = L18.linkedBy("RU", "RO", "land");
      D18.occupy("RU", "BY", 300, true); D18.occupy("LU", "FR", 300, true); D18.occupy("RU", "UA", 300, true);
      D18.occupationTick(function () { return 1; });                       // no uprising: the control pass sizes the garrisons and levies
      var holdBY = S18.BY.hold, holdFR = S18.FR.hold, forceRU = W.force("RU"), forceLU = W.force("LU");
      m.levyByControl = holdBY >= 0.99 && forceRU > ownRU && holdFR < 0.2 && (forceLU - ownLU) < 0.25 * ownLU && S18.RU.levy > 0 && S18.RU.garrison > 0;   // a thin hold yields little: at most a small share of the occupier's own force
      var pBY = D18.upriseChanceOf("BY"), pFR = D18.upriseChanceOf("FR");
      m.upriseSlower = pBY < 0.003 && pFR > pBY;
      m.reachViaHolding = !landBefore && domBefore !== "land" && D18.frontDomain("RU", "RO").domain === "land" && D18.canReach("RU", "RO") && D18.holdingsOf("RU").length === 3 && !D18.viaHoldings("RU", "UA", "land");
      m.controlInfo = { holdBY: +holdBY.toFixed(3), holdFR: +holdFR.toFixed(3), forceRU: [Math.round(ownRU), Math.round(forceRU)], forceLU: [Math.round(ownLU), Math.round(forceLU)], uprise: [+pBY.toFixed(4), +pFR.toFixed(4)], domBefore: domBefore };
      ["RU", "BY", "UA", "LU", "FR"].forEach(function (i) { var s = S18[i]; s.occupiedBy = keep18[i].ob; s.occupiedUntil = keep18[i].ou; });
      D18.refreshHoldings(); D18.occupationTick(function () { return 1; });
      // coercion: a regime with authority and an army holds the street; war and sanctions read their rows; a junta with its
      // legitimacy gone cracks down; a rich, legitimate autocracy can liberalise, a poor one cannot
      var G19 = window.GOV, S19 = W.COUNTRY_STATE, cf19 = window.ENTITY_CONFIG, CO19 = window.COUNTRIES;
      var mk19 = function (auth, mil) { return { st: { infra: 50, medical: 50, military: mil, technology: 50, academia: 50, stability: 50 }, authority: auth, econOpen: 50, freedom: 50, legit: 60, weary: 0, famine: 0, ration: 0 }; };
      var ctx19 = { cfg: cf19, war: 0, occupied: false, eco: 50, broke: false, coverage: 0, sanctions: 0, busted: false };
      var tCoerce = CO19.driftTargets(mk19(90, 80), ctx19).stability, tFree = CO19.driftTargets(mk19(30, 80), ctx19).stability, tWeak = CO19.driftTargets(mk19(90, 10), ctx19).stability;
      m.coercionHolds = tCoerce > tFree + 5 && tCoerce > tWeak + 5 && Math.abs(CO19.coercion(mk19(90, 80), cf19) - (50 / 60) * (cf19.coerceMilFloor + (1 - cf19.coerceMilFloor) * 0.8)) < 1e-9 && CO19.coercion(mk19(30, 80), cf19) === 0;
      var tWar = CO19.driftTargets(mk19(30, 80), Object.assign({}, ctx19, { war: 1 })).stability, tSan = CO19.driftTargets(mk19(30, 80), Object.assign({}, ctx19, { sanctions: 3 })).stability;
      m.warStabRow = Math.abs((tFree - tWar) - cf19.warStab) < 1e-9;
      m.sanctionsStab = Math.abs((tFree - tSan) - cf19.sanctionStab) < 1e-9;
      var junta = null; for (var j19 in S19) { var js19 = S19[j19]; if (js19.st && G19.typeOf(js19) === "military" && !js19.occupiedBy) { junta = j19; break; } }
      if (junta) {
        var jsx = S19[junta], keepJ = { regime: JSON.parse(JSON.stringify(jsx.regime)), stab: jsx.st.stability, legit: jsx.legit, au: jsx.authority, fr: jsx.freedom, op: jsx.econOpen };
        jsx.legit = 20; var stabJ0 = jsx.st.stability; G19.appointment(junta, jsx, function () { return 0.5; });
        m.crackdownRallies = jsx.st.stability > stabJ0 + cf19.purgeStab - 1e-9 && G19.typeOf(jsx) === "military";
        jsx.regime = keepJ.regime; G19.refresh(jsx); jsx.st.stability = keepJ.stab; jsx.legit = keepJ.legit;
      } else m.crackdownRallies = false;
      var party = null; for (var p19 in S19) { var ps19 = S19[p19]; if (ps19.st && G19.typeOf(ps19) === "party" && !ps19.occupiedBy && ps19.pop >= 5) { party = p19; break; } }
      if (party) {
        var px = S19[party], keepP = { out: px.output, legit: px.legit, stab: px.st.stability };
        px.legit = 80; px.st.stability = 70; px.output = 400; var richP = G19.liberalChanceOf(party, px); px.output = 3; var poorP = G19.liberalChanceOf(party, px);
        px.output = keepP.out; px.legit = keepP.legit; px.st.stability = keepP.stab;
        m.liberalisesWhenRich = richP === cf19.liberalChance && poorP === 0 && G19.liberalChanceOf("US", S19.US) === 0;
        m.regimeInfo = { junta: junta, party: party, coerce: [+tFree.toFixed(1), +tCoerce.toFixed(1), +tWeak.toFixed(1)] };
      } else m.liberalisesWhenRich = false;
      // pact conflicts: a country pledged to both principals gets a join candidate per side, each with its own caller; standing
      // between them costs nothing and keeps both pacts; taking a side ends the other pact quietly
      var D20 = window.DECIDE, S20 = W.COUNTRY_STATE, cf20 = window.ENTITY_CONFIG, CO20 = window.COUNTRIES, big20 = null, pairA = null, pairB = null;
      var free20 = function (i) { var s = S20[i]; return s && s.st && s.pop >= 5 && !s.occupiedBy && !W.fighting(i) && D20.canFight(s); };
      ["US", "CN", "IN", "RU", "DE"].forEach(function (i) { if (!big20 && free20(i)) big20 = i; });
      for (var a20 in S20) { if (pairA && pairB) break; if (a20 === big20 || !free20(a20) || S20[a20].pop > 60) continue; if (!pairA) pairA = a20; else if (!W.warBetween(pairA, a20) && !(W.pairOf(pairA, a20).truce > W.day)) pairB = a20; }
      if (big20 && pairA && pairB) {
        var keepPacts = [W.pairOf(big20, pairA).pact, W.pairOf(big20, pairB).pact];
        W.pairOf(big20, pairA).pact = W.day; W.pairOf(big20, pairB).pact = W.day; W.touchPairs();
        D20.declareWar(pairA, pairB, { force: true });
        var war20 = W.warBetween(pairA, pairB), T20 = CO20.temperament(big20, W.seed);
        var asked20 = !!war20 && war20.asked.att.indexOf(big20) >= 0 && war20.asked.def.indexOf(big20) >= 0 && D20.conflicted(war20, big20);
        var cands20 = asked20 ? D20.candidates(big20, S20[big20], cf20, T20, null, "weekly").filter(function (k) { return k.war === war20.id; }) : [];
        var joins20 = cands20.filter(function (k) { return k.action === "join"; });
        m.conflictedSides = asked20 && joins20.length === 2 && joins20.every(function (k) { return k.target === (k.side === "att" ? war20.att : war20.def); }) && cands20.filter(function (k) { return k.action === "refuse"; }).length === 1;
        var trust20 = D20.trustIn(S20[pairA], big20), rel20 = W.relOf(big20, pairA);
        if (asked20) D20.refuseCall(big20, war20, pairA);
        m.conflictedNeutral = asked20 && war20.decided[big20] === "neutral" && W.pairOf(big20, pairA).pact > 0 && W.pairOf(big20, pairB).pact > 0 && D20.trustIn(S20[pairA], big20) === trust20 && W.relOf(big20, pairA) === rel20;
        if (asked20) { delete war20.decided[big20]; D20.joinWar(big20, war20, "att", pairA); }
        m.conflictedLeaves = asked20 && W.pairOf(big20, pairB).pact === 0 && W.pairOf(big20, pairA).pact > 0 && war20.allies.att.indexOf(big20) >= 0;
        m.conflictInfo = { big: big20, pair: [pairA, pairB], asked: asked20, candidates: cands20.map(function (k) { return k.action + ":" + k.side + ":" + k.target; }) };
        if (war20) { D20.leaveWar(war20, big20); var wi20 = W.WORLD_STATE.wars.indexOf(war20); if (wi20 >= 0) W.WORLD_STATE.wars.splice(wi20, 1); W.pairOf(pairA, pairB).warId = 0; W.touchPairs(); }   // the test war ends here
        W.pairOf(big20, pairA).pact = keepPacts[0]; W.pairOf(big20, pairB).pact = keepPacts[1]; W.touchPairs();
      } else { m.conflictedSides = m.conflictedNeutral = m.conflictedLeaves = false; m.conflictInfo = "no trio"; }
      // hunger at the table: a country in famine values food over the world price, pays the giver a sweetener, and spends more on it
      var D21 = window.DECIDE, S21 = W.COUNTRY_STATE, E21 = window.ECONOMY, cf21 = window.ENTITY_CONFIG, hungry = null, seller21 = null, best21 = null;
      ["ET", "YE", "SO", "SD", "AF", "EG"].forEach(function (i) { var s = S21[i]; if (!hungry && s && s.st && s.production && s.consumption && s.consumption[2] > s.production[2]) hungry = i; });
      if (hungry) {
        var hs = S21[hungry], keepH = { fam: hs.famine, bal: hs.balance ? hs.balance.slice() : null };
        hs.famine = 0; if (hs.balance) hs.balance[2] = 1;
        window.LINKS.partners(hungry).forEach(function (o) { var os = S21[o]; if (!os || !os.st || os.occupiedBy || W.fighting(o)) return; var pr = D21.proposeSwap(hungry, o); if (pr && pr.take === 2 && (!best21 || pr.value > best21.value)) { best21 = pr; seller21 = o; } });
        var calm = best21;
        hs.famine = 0.5; if (hs.balance) hs.balance[2] = 0.7;
        var hot = seller21 ? D21.proposeSwap(hungry, seller21) : null;
        hs.famine = keepH.fam; if (keepH.bal) hs.balance = keepH.bal;
        var giveHot = hot ? hot.qGive * (hot.give >= 0 ? W.WORLD_STATE.market.price[hot.give] : 0) : 0;
        m.hungerDeals = !!calm && !!hot && hot.need > 1 && hot.need <= cf21.dealNeedMax && hot.prem > 0 && calm.prem === 0 && hot.mq > hot.value - giveHot + 1e-9 && hot.gainB > calm.gainB;
        m.hungerInfo = { hungry: hungry, seller: seller21, need: hot ? +hot.need.toFixed(2) : null, prem: hot ? +hot.prem.toFixed(3) : null, mq: [calm ? +calm.mq.toFixed(2) : null, hot ? +hot.mq.toFixed(2) : null], gainB: [calm ? +calm.gainB.toFixed(3) : null, hot ? +hot.gainB.toFixed(3) : null] };
      } else { m.hungerDeals = false; m.hungerInfo = "no hungry country"; }
      // the prize is what an occupation actually pays: their production and their money while we hold them, and the tribute
      var pz = D21.prizeOf(S21.RU, S21.UA, E21.taxIncome(S21.RU), 180, cf21);
      m.prizeHonest = pz.relief === 0 && Math.abs(pz.total - (pz.spoils + pz.tribute)) < 1e-9 && pz.spoils > 0;
      // and the occupation pays it: the skim and the victor's indemnity, for exactly as long as the occupation holds
      var occA = null, occB = null;
      for (var oi21 in S21) { var os21 = S21[oi21];
        if (!os21.st || os21.pop < 5 || W.fighting(oi21)) continue;
        var nb21 = window.LINKS.partners(oi21).filter(function (o) { var q = S21[o]; return q && q.st && q.pop >= 1 && !W.fighting(o); })[0];
        if (nb21) { occA = oi21; occB = nb21; break; } }
      if (occA) {
        var A21 = S21[occA], B21 = S21[occB];
        var keepB = { until: B21.occupiedUntil, by: B21.occupiedBy, tr: B21.treasury, atr: A21.treasury, aby: A21.occupiedBy };
        var freed = [];                                                            // clear every occupation touching the pair: the day's takings must be this one's alone
        for (var ci21 in S21) if (S21[ci21].occupiedBy === occA || S21[ci21].occupiedBy === occB) { freed.push([ci21, S21[ci21].occupiedBy, S21[ci21].occupiedUntil]); S21[ci21].occupiedBy = null; S21[ci21].occupiedUntil = 0; }
        A21.occupiedBy = null; B21.occupiedBy = null;
        D21.occupy(occA, occB, 300, true); D21.refreshHoldings();
        B21.treasury = 1e7; A21.treasury = 0;
        var expect21 = (cf21.occupySkim + cf21.occupyIndemnity) * E21.taxIncome(B21);
        D21.occupationTick(function () { return 1; });                              // no uprising at a draw of 1
        var gained = A21.treasury, paid = 1e7 - B21.treasury;
        B21.occupiedUntil = W.day; A21.treasury = 0; B21.treasury = 1e7;            // the term runs out: the terms end with it
        D21.occupationTick(function () { return 1; });
        var afterEnd = A21.treasury;
        m.occupationPaysTerms = cf21.occupyIndemnity > 0 && Math.abs(gained - expect21) < 1e-6 && Math.abs(paid - expect21) < 1e-6
                                && afterEnd === 0 && !B21.occupiedBy;
        m.termsInfo = { occupier: occA, held: occB, perDay: Math.round(expect21), skimOnly: Math.round(cf21.occupySkim * E21.taxIncome(B21)),
                        gained: Math.round(gained), paid: Math.round(paid), afterEnd: Math.round(afterEnd), prize: Math.round(pz.total) };
        B21.occupiedBy = keepB.by; B21.occupiedUntil = keepB.until; B21.treasury = keepB.tr; A21.treasury = keepB.atr; A21.occupiedBy = keepB.aby;
        for (var fr21 = 0; fr21 < freed.length; fr21++) { S21[freed[fr21][0]].occupiedBy = freed[fr21][1]; S21[freed[fr21][0]].occupiedUntil = freed[fr21][2]; }
        D21.refreshHoldings();
      } else { m.occupationPaysTerms = false; m.termsInfo = "no free pair"; }
      // the three new motives, each proved against the same world: switch its row on and the war's value rises and the
      // reason takes its name.  The pair is built, not found -- the gate opened by hand, the rows zeroed, and the
      // attacker and its neighbour close enough in size that taking it is worth something against the attacker's own
      // income -- so the test says nothing about whether this world happens to offer a war worth declaring
      var motiveOf = function (iso22, target22) {
        var cs = D21.candidates(iso22, S21[iso22], cf21, window.COUNTRIES.temperament(iso22, W.seed), null, "monthly");
        return cs.filter(function (k) { return k.action === "war" && k.target === target22; })[0] || null;
      };
      var keepRows = { op: cf21.warOpportunity, pre: cf21.warPreempt, rev: cf21.warRevanche, mem: cf21.warMemoryDiscount, dc: cf21.warDeathCost,
                       cf: cf21.warCostForce, ws: cf21.warStab, was: cf21.warAttrStab, ma: cf21.warMilAtt, ai: cf21.warAttrInfra, da: cf21.defeatAuthority };
      // a bare baseline: the prize alone.  This check is about whether each motive RAISES a war's value, not about whether
      // war pays, so the bill and the scar are zeroed for its window as the motive rows and the dead already are; with
      // them in, an honest bill leaves no pair in the living world with a candidate to toggle
      cf21.warOpportunity = 0; cf21.warPreempt = 0; cf21.warRevanche = 0; cf21.warDeathCost = 0;
      cf21.warCostForce = 0; cf21.warStab = 0; cf21.warAttrStab = 0; cf21.warMilAtt = 0; cf21.warAttrInfra = 0; cf21.defeatAuthority = 0;
      var openGate = function (a, b) {
        var p = W.pairOf(a, b), A = S21[a];
        var was = { rel: p.rel, pact: p.pact, truce: p.truce, stab: A.st.stability, tr: A.treasury, wy: A.weary };
        p.rel = -10; p.pact = 0; p.truce = 0; W.dropDeals(a, b); W.touchPairs();
        A.st.stability = Math.max(A.st.stability, 60); A.treasury = 200 * E21.taxIncome(A); A.weary = 0;
        return was;
      };
      var shutGate = function (a, b, was) {
        var p = W.pairOf(a, b), A = S21[a];
        p.rel = was.rel; p.pact = was.pact; p.truce = was.truce;
        A.st.stability = was.stab; A.treasury = was.tr; A.weary = was.wy; W.touchPairs();
      };
      var att22 = null, def22 = null, undo22 = null;
      var pool22 = Object.keys(S21).filter(function (i) { var q = S21[i]; return q.st && q.pop >= 5 && !W.fighting(i) && !q.occupiedBy; });
      for (var pi22 = 0; pi22 < pool22.length && !att22; pi22++) {
        var a22 = pool22[pi22], mine22 = W.force(a22);
        var nbs22 = window.LINKS.partners(a22).filter(function (o) {
          var q = S21[o];
          return q && q.st && q.pop >= 1 && !W.fighting(o) && !q.occupiedBy && window.LINKS.linkedBy(a22, o, "land")
                 && W.force(o) > 0.25 * mine22 && W.force(o) < 0.8 * mine22;       // a neighbour worth taking, and takeable
        });
        for (var ni22 = 0; ni22 < nbs22.length && !att22; ni22++) {
          var was22 = openGate(a22, nbs22[ni22]);
          if (motiveOf(a22, nbs22[ni22])) { att22 = a22; def22 = nbs22[ni22]; undo22 = was22; }
          else shutGate(a22, nbs22[ni22], was22);
        }
      }
      if (att22) {
        var base22 = motiveOf(att22, def22), tgt22 = S21[def22], pg22 = W.pairOf(att22, def22);
        // the dead are priced: on the same constructed pair, the war is worth less with the cost on, or is no longer worth proposing
        cf21.warDeathCost = keepRows.dc; var priced22 = motiveOf(att22, def22); cf21.warDeathCost = 0;
        m.deathsPriced = !priced22 || priced22.value < base22.value - 1e-9;
        m.deathInfo = { iso: att22, target: def22, free: +base22.value.toFixed(2), priced: priced22 ? +priced22.value.toFixed(2) : "gone" };
        var keepT22 = { stab: tgt22.st.stability, mil: tgt22.st.military, lw: S21[att22].lastWar, rel: pg22.rel, want: cf21.wantMilBase };
        tgt22.st.stability = 1;                                                    // a country in collapse
        var opOff = motiveOf(att22, def22); cf21.warOpportunity = keepRows.op * 20; var opOn = motiveOf(att22, def22); cf21.warOpportunity = 0;
        tgt22.st.stability = keepT22.stab;
        cf21.wantMilBase = 100; pg22.rel = -40;                                    // a hostile neighbour, and everyone arming
        var prOff = motiveOf(att22, def22); cf21.warPreempt = keepRows.pre * 6; var prOn = motiveOf(att22, def22); cf21.warPreempt = 0;
        cf21.wantMilBase = keepT22.want; pg22.rel = keepT22.rel;
        cf21.warMemoryDiscount = 1;                                                // the wound, without the wariness that comes with it
        S21[att22].lastWar = {}; S21[att22].lastWar[def22] = { o: "lost", d: W.day - 30 };
        var rvOff = motiveOf(att22, def22); cf21.warRevanche = keepRows.rev * 6; var rvOn = motiveOf(att22, def22);
        S21[att22].lastWar = keepT22.lw; cf21.warMemoryDiscount = keepRows.mem;
        var rose = function (off, on, tag) { return !!on && on.motive === tag && (!off || on.value > off.value + 1e-9); };
        m.motivesFire = !!base22 && rose(opOff, opOn, "opportunity") && rose(prOff, prOn, "preempt") && rose(rvOff, rvOn, "revanche");
        var pair22 = function (off, on) { return [off ? +off.value.toFixed(1) : null, on ? +on.value.toFixed(1) : null, on ? on.motive : null]; };
        m.motiveInfo = { att: att22, def: def22, base: base22 ? base22.motive : null,
                         opportunity: pair22(opOff, opOn), preempt: pair22(prOff, prOn), revanche: pair22(rvOff, rvOn) };
        shutGate(att22, def22, undo22);
      } else { m.motivesFire = false; m.deathsPriced = false; m.motiveInfo = m.deathInfo = "no neighbour worth taking would be taken even with the gate open"; }
      cf21.warOpportunity = keepRows.op; cf21.warPreempt = keepRows.pre; cf21.warRevanche = keepRows.rev; cf21.warMemoryDiscount = keepRows.mem; cf21.warDeathCost = keepRows.dc;
      cf21.warCostForce = keepRows.cf; cf21.warStab = keepRows.ws; cf21.warAttrStab = keepRows.was; cf21.warMilAtt = keepRows.ma; cf21.warAttrInfra = keepRows.ai; cf21.defeatAuthority = keepRows.da;
      // a modern army costs more to keep, by the formula the budget also uses; and the wanted army follows the threat
      var up21 = S21.DE, keepT21 = up21.st.technology;
      up21.st.technology = 0; var u0 = E21.upkeepCost(up21, "military"); up21.st.technology = 100; var u1 = E21.upkeepCost(up21, "military"); up21.st.technology = keepT21;
      m.upkeepByTech = Math.abs(u1 / u0 - (1 + cf21.upkeepTech)) < 1e-9 && Math.abs(E21.upkeepCost(up21, "infra") - cf21.upkeepInfra * up21.st.infra * Math.max(0, up21.pop)) < 1e-9;
      var Tw = window.COUNTRIES.temperament("PL", W.seed), Pw = D21.prioritiesOf("PL"), w0 = D21.wants(S21.PL, Tw, Pw, 0).military, w100 = D21.wants(S21.PL, Tw, Pw, 100).military;
      m.threatRaisesWant = w100 - w0 >= cf21.wantMilThreat - 1e-9 && w0 > 0 && w100 <= 130;
      m.wantInfo = { calm: +w0.toFixed(1), threatened: +w100.toFixed(1), upkeep: [+u0.toFixed(1), +u1.toFixed(1)] };
      // a country short of something wants the infrastructure that would reach its own endowment
      var psw = S21.PL, keepBalW = psw.balance ? psw.balance.slice() : null;
      psw.balance = [1, 1, 1, 1]; var iFull = D21.wants(psw, Tw, Pw, 0).infra;
      psw.balance = [0.6, 1, 1, 1]; var iShort = D21.wants(psw, Tw, Pw, 0).infra;
      m.shortageBuilds = iFull > 0 && Math.abs(iShort - iFull - cf21.wantInfraShort * 0.4) < 1e-6;
      // an exporter that sees the world price of what it sells run high wants more infrastructure, by the row and the
      // excess over base, capped; an importer of the same type at the same price wants none of that
      var Mx = W.WORLD_STATE.market, keepPx = Mx.price[1], keepSur = psw.surplus ? psw.surplus.slice() : null;
      psw.balance = [1, 1, 1, 1]; psw.surplus = [0, 0, 0, 0]; Mx.price[1] = cf21.priceBase * 3;
      var importerWants = D21.wants(psw, Tw, Pw, 0).infra;
      psw.surplus = [0, 5, 0, 0]; var exporterWants = D21.wants(psw, Tw, Pw, 0).infra;
      Mx.price[1] = cf21.priceBase * 9; var exporterCapped = D21.wants(psw, Tw, Pw, 0).infra;
      Mx.price[1] = keepPx; if (keepSur) psw.surplus = keepSur; else delete psw.surplus;
      if (keepBalW) psw.balance = keepBalW; else delete psw.balance;
      m.exportersBuild = Math.abs(exporterWants - importerWants - cf21.wantInfraExport * 2) < 1e-6
                         && Math.abs(exporterCapped - importerWants - cf21.wantInfraExport * cf21.wantInfraPriceCap) < 1e-6;
      m.exportInfo = { importer: +importerWants.toFixed(1), exporterAt3x: +exporterWants.toFixed(1), exporterAt9x: +exporterCapped.toFixed(1) };
      // prospectors look for what is dear: the same draw from the day's stream lands on energy at the base price and on
      // materials once materials runs at five times it
      var fk = window.EVENTS.KINDS.filter(function (k) { return k.key === "resource"; })[0];
      var fp = (function () {
        if (!fk || !psw.res) return { ok: false };
        var keepRes = psw.res.slice(), keepPot = psw.potential ? psw.potential.slice() : null, keepP1 = Mx.price[1];
        var stub = function () { var n = 0; return function () { return n++ === 0 ? 0.2 : 0.5; }; };
        Mx.price[1] = cf21.priceBase; fk.apply(psw, false, "PL", stub()); var atBase = psw.res.map(function (v, i) { return v - keepRes[i]; });
        psw.res = keepRes.slice(); if (keepPot) psw.potential = keepPot.slice();
        Mx.price[1] = cf21.priceBase * 5; fk.apply(psw, false, "PL", stub()); var atDear = psw.res.map(function (v, i) { return v - keepRes[i]; });
        psw.res = keepRes; if (keepPot) psw.potential = keepPot; Mx.price[1] = keepP1;
        var which = function (d) { var k = 0; for (var i = 1; i < 4; i++) if (d[i] > d[k]) k = i; return d[k] > 0 ? k : -1; };
        return { ok: true, base: which(atBase), dear: which(atDear) };
      })();
      m.findsFollowPrice = fp.ok && fp.base === 0 && fp.dear === 1;
      m.findPriceInfo = fp;
      if (keepBalW) psw.balance = keepBalW; else delete psw.balance;
      // a want may run past 100; the stat may not, so nothing is spent on a point it cannot gain.  At war a country builds
      // nothing but its army, so the subject has to be at peace and its own
      var capIso = ["PL", "PT", "CL", "MY", "MA", "PE"].filter(function (i) { var q = S21[i]; return q && q.st && !W.fighting(i) && !q.occupiedBy; })[0];
      if (capIso) {
        var cps = S21[capIso], Tc = window.COUNTRIES.temperament(capIso, W.seed);
        var keepC = { inf: cps.st.infra, tr: cps.treasury, bal: cps.balance ? cps.balance.slice() : null };
        cps.balance = [0.5, 1, 1, 1]; cps.treasury = 500 * E21.taxIncome(cps);
        var infraCands = function () { return D21.candidates(capIso, cps, cf21, Tc, null, "monthly").filter(function (k) { return k.action === "invest" && k.target === "infra"; }).length; };
        cps.st.infra = 100; var atCap = infraCands();
        cps.st.infra = 55; var belowCap = infraCands();
        cps.st.infra = keepC.inf; cps.treasury = keepC.tr; if (keepC.bal) cps.balance = keepC.bal; else delete cps.balance;
        m.capNotBought = atCap === 0 && belowCap > 0;
        m.capInfo = { country: capIso, atCap: atCap, belowCap: belowCap };
      } else { m.capNotBought = false; m.capInfo = "no country at peace"; }
      // a dear resource bill argues for the science that needs less of it
      var keepBill = psw.bill ? psw.bill.slice() : null, inc4 = Math.max(1, E21.taxIncome(psw));
      psw.bill = [0, 0, 0, 0]; var sci0 = D21.prioritiesOf("PL").science;
      psw.bill = [inc4, 0, 0, 0]; var sci1 = D21.prioritiesOf("PL").science;
      var shareFull = D21.billShare(psw);
      if (keepBill) psw.bill = keepBill; else delete psw.bill;
      m.billDrivesScience = sci0 > 0 && Math.abs(shareFull - 1) < 1e-9 && Math.abs(sci1 - sci0 - cf21.govScienceBill) < 1e-6;
      m.billInfo = { science: [+sci0.toFixed(3), +sci1.toFixed(3)], infra: [+iFull.toFixed(1), +iShort.toFixed(1)] };
      // an exporter commits like one: nearly all of a large surplus, and it runs more deals to place it
      var shHigh = D21.sellShare({ spare: [30, 0, 0, 0], cons: [10, 1, 1, 1] }, 0, cf21);
      var shLow = D21.sellShare({ spare: [0, 0, 0, 0], cons: [10, 1, 1, 1] }, 0, cf21);
      var pcs = S21.SA, keepSur = pcs.surplus ? pcs.surplus.slice() : null, keepCon = pcs.consumption ? pcs.consumption.slice() : null;
      pcs.consumption = [10, 10, 10, 10]; pcs.surplus = [30, 0, 0, 0]; var capBig = W.partnerCapOf("SA");
      pcs.surplus = [0, 0, 0, 0]; var capFlat = W.partnerCapOf("SA");
      if (keepSur) pcs.surplus = keepSur; else delete pcs.surplus;
      if (keepCon) pcs.consumption = keepCon; else delete pcs.consumption;
      m.exporterCommits = Math.abs(shHigh - cf21.dealSpareTop) < 1e-9 && Math.abs(shLow - cf21.dealSpareShare) < 1e-9
                          && capBig - capFlat === Math.round(cf21.partnerSpare * 2);
      m.exporterInfo = { share: [+shLow.toFixed(2), +shHigh.toFixed(2)], partners: [capFlat, capBig] };
      // no cliff when broke: a country past its credit still finds a few days of income for bread, and spends none of it on materials
      var bk = S21.PT, keepBP = bk.potential.slice(), keepBT = bk.treasury, keepBD = cf21.brokeVitalShare;
      for (var dkb in W.PAIRS) { if (dkb.indexOf("PT") >= 0) { var ib = dkb.indexOf("|"); W.dropDeals(dkb.slice(0, ib), dkb.slice(ib + 1)); } }
      var starve = function () { bk.potential = [0, 0, 0, keepBP[3]]; bk.stock = [0, 0, 0, bk.stock[3]]; bk.treasury = -2 * E21.credit(bk); bk.broke = true; };
      cf21.brokeVitalShare = 0; starve(); W.advanceDays(1);
      var boughtNone = (bk.bought ? bk.bought[0] + bk.bought[2] : 0);
      cf21.brokeVitalShare = keepBD; starve(); W.advanceDays(1);
      var ateBroke = bk.bought ? bk.bought[2] : 0, matBroke = bk.bought ? bk.bought[1] : 0;
      bk.potential = keepBP; bk.treasury = keepBT;
      m.brokeStillEats = boughtNone === 0 && ateBroke > 0 && matBroke === 0;
      // the peace ladder: on a constructed war the side behind offers the least the side ahead will take, the side ahead
      // asks the most the side behind will give, a bare peace records no winner and leaves no scar, and on every rung
      // suing is strictly cheaper for the loser than fighting on to a defeat -- the property the whole design rests on
      var pl = (function () {
        var out = { ok: false };
        var pairs = [["RU", "UA"], ["CN", "VN"], ["IR", "IQ"], ["BR", "PY"]];
        var A = null, B = null;
        for (var pi = 0; pi < pairs.length && !A; pi++) { var a0 = S21[pairs[pi][0]], b0 = S21[pairs[pi][1]];
          if (a0 && b0 && a0.st && b0.st && !a0.occupiedBy && !b0.occupiedBy && !W.fighting(pairs[pi][0]) && !W.fighting(pairs[pi][1])) { A = pairs[pi][0]; B = pairs[pi][1]; } }
        if (!A) { out.info = "no pair at peace"; return out; }
        var sa = S21[A], sb = S21[B], keepA = { tr: sa.treasury, st: sa.st.stability, au: sa.authority, lg: sa.legit }, keepB = { tr: sb.treasury, st: sb.st.stability, au: sb.authority, lg: sb.legit };
        var keepRel = W.pairOf(A, B).rel, keepTruce = W.pairOf(A, B).truce, keepLW = { a: sa.lastWar ? JSON.parse(JSON.stringify(sa.lastWar)) : null, b: sb.lastWar ? JSON.parse(JSON.stringify(sb.lastWar)) : null };
        D21.declareWar(A, B, { force: true }); var war = W.warBetween(A, B);
        if (!war) { out.info = "could not declare"; return out; }
        sa.treasury = 300 * E21.taxIncome(sa); sb.treasury = 300 * E21.taxIncome(sb);
        // the attacker ahead by a clear margin: the loser climbs, the winner descends, and the two meet
        war.score = 0.5;
        var rungBehind = D21.proposeRung(B, war, cf21), rungAhead = D21.proposeRung(A, war, cf21);
        var vals = [0, 1, 2, 3].map(function (r) { return [+D21.peaceValueAt(A, war, cf21, r).value.toFixed(1), +D21.peaceValueAt(B, war, cf21, r).value.toFixed(1)]; });
        // the loser's cost on every rung against what fighting on to a defeat would cost it
        var inc = Math.max(1, E21.taxIncome(sb)), P = D21.prioritiesOf(B), lose = D21.defeatCost(sb, sa, inc, P.horizon, P, cf21);
        var costOn = [1, 2, 3].map(function (r) { return +(D21.peaceValueAt(B, war, cf21, 0).value - D21.peaceValueAt(B, war, cf21, r).value).toFixed(1); });
        var cheaper = costOn.every(function (x) { return x < lose - 1e-9; });
        // monotone: the loser's value falls with the rung, the winner's rises
        var monoB = vals.every(function (v, i) { return i === 0 || v[1] <= vals[i - 1][1] + 1e-9; });
        var monoA = vals.every(function (v, i) { return i === 0 || v[0] >= vals[i - 1][0] - 1e-9; });
        // the counter-offer: the loser proposes its rung, the winner answers with its own, and the better for the
        // winner is signed.  Read the rung signed from the treaty the log records.
        war.score = 0.5;
        var rb = D21.proposeRung(B, war, cf21), ra = D21.proposeRung(A, war, cf21);
        var wantRung = ra >= 0 && D21.peaceValueAt(A, war, cf21, ra).value > D21.peaceValueAt(A, war, cf21, rb).value ? ra : rb;
        var signedCo = rb >= 0 ? D21.offerPeace(B, A, rb) : false;
        // the log is capped and trims from the front in place, so an index taken before the call is useless once it is
        // full: read the treaty as today's last peace entry naming this pair, and the war's absence as the proof it signed
        var treaty = W.WORLD_STATE.log.filter(function (e) { return e.kind === "peace" && e.d === W.day && ((e.iso === A && e.iso2 === B) || (e.iso === B && e.iso2 === A)); }).slice(-1)[0];
        signedCo = signedCo && !W.warBetween(A, B) && !!treaty;
        var tx = treaty ? treaty.text : "", gotRung = !treaty ? -1 : /tribute/.test(tx) ? 3 : /leases/.test(tx) ? 2 : /indemnity/.test(tx) ? 1 : 0;
        var counterOK = signedCo && gotRung === wantRung;
        var coInfo = { loserProposes: rb, winnerWould: ra, expected: wantRung, signed: gotRung };
        // the war is over now; declare it again for the bare-peace leg, on the same footing
        if (!W.warBetween(A, B)) { W.pairOf(A, B).truce = 0; W.pairOf(A, B).warId = 0; W.touchPairs(); D21.declareWar(A, B, { force: true }); war = W.warBetween(A, B); }
        if (!war) { out.info = "could not redeclare"; return out; }
        sa.treasury = 300 * E21.taxIncome(sa); sb.treasury = 300 * E21.taxIncome(sb);
        // the bare peace, when both are exhausted: no winner, no scar, a truce.  Force it by making the war not worth
        // finishing for the attacker: set the score near even so only rung 0 is on the table
        war.score = 0.05;
        var au0 = sb.authority, bare = D21.proposeRung(B, war, cf21);
        var signed = bare === 0 ? D21.offerPeace(B, A, 0) : false;
        var recB = sb.lastWar && sb.lastWar[A], recA = sa.lastWar && sa.lastWar[B];
        var whitePeace = signed && !W.warBetween(A, B) && recB && recB.o === "peace" && recA && recA.o === "peace" && sb.authority === au0 && W.pairOf(A, B).truce > W.day;
        out = { ok: true, rungBehind: rungBehind, rungAhead: rungAhead, vals: vals, costOn: costOn, defeat: +lose.toFixed(1), cheaper: cheaper, monoB: monoB, monoA: monoA, bare: bare, whitePeace: whitePeace,
                counter: counterOK, counterInfo: coInfo };
        // put the world back
        if (W.warBetween(A, B)) { var w2 = W.warBetween(A, B); var wi = W.WORLD_STATE.wars.indexOf(w2); if (wi >= 0) W.WORLD_STATE.wars.splice(wi, 1); }
        W.pairOf(A, B).warId = 0; W.pairOf(A, B).rel = keepRel; W.pairOf(A, B).truce = keepTruce; W.touchPairs();
        sa.treasury = keepA.tr; sa.st.stability = keepA.st; sa.authority = keepA.au; sa.legit = keepA.lg; sa.lastWar = keepLW.a;
        sb.treasury = keepB.tr; sb.st.stability = keepB.st; sb.authority = keepB.au; sb.legit = keepB.lg; sb.lastWar = keepLW.b;
        W.dropDeals(A, B);
        return out;
      })();
      // a target that has what we lack is worth more: the same prize, with us short of the type it produces most, is larger
      var pn = (function () {
        var A = "RU", B = "UA", sa = S21[A], sb = S21[B];
        if (!sa || !sb || !sa.st || !sb.st || !sb.production) return { ok: false };
        var k = 0; for (var i = 1; i < 4; i++) if (sb.production[i] > sb.production[k]) k = i;
        var keepBal = sa.balance ? sa.balance.slice() : null, keepFam = sa.famine, inc = Math.max(1, E21.taxIncome(sa)), H = D21.prioritiesOf(A).horizon;
        sa.balance = [1, 1, 1, 1]; sa.famine = 0; var fed = D21.prizeOf(sa, sb, inc, H, cf21).total;
        sa.balance[k] = 0.5; var short = D21.prizeOf(sa, sb, inc, H, cf21).total;
        if (keepBal) sa.balance = keepBal; else delete sa.balance; sa.famine = keepFam;
        return { ok: true, type: k, fed: +fed.toFixed(1), short: +short.toFixed(1), need: +D21.needPriceOf({ balance: [1, 1, 1, 1].map(function (v, i) { return i === k ? 0.5 : 1; }), famine: 0 }, k, cf21).toFixed(2) };
      })();
      m.prizeSeesNeed = pn.ok && pn.short > pn.fed + 1e-9 && pn.need > 1;
      m.prizeNeedInfo = pn;
      // an army is cheaper to raise than a road, by the row: the same country, the same level, the two projects
      var mc = (function () { var s = S21.PL, keepM = s.st.military, keepI = s.st.infra; s.st.military = 50; s.st.infra = 50;
        var r = E21.projectFor(s, "military").cost / Math.max(1e-9, E21.projectFor(s, "infra").cost); s.st.military = keepM; s.st.infra = keepI; return +r.toFixed(3); })();
      var mcWant = cf21.milCostFactor * (window.GOV.powerMul ? window.GOV.powerMul(S21.PL, "milProject") : 1);   // a rearmament programme, if this government has finished one, sits on the same project
      m.milCheaper = Math.abs(mc - mcWant) < 1e-6 && cf21.milCostFactor < 1;
      m.milCostInfo = { ratio: mc, row: cf21.milCostFactor, programme: +mcWant.toFixed(3) };
      // powers, stage 2: the programme a government draws, and what enacting it does
      var PG = window.GOV, pw = (function () {
        var out = { ok: false };
        var iso = ["PT", "CL", "MY", "PL"].filter(function (i) { var q = S21[i]; return q && q.st && q.regime && !q.occupiedBy && !W.fighting(i); })[0];
        if (!iso) { out.info = "no subject"; return out; }
        var s = S21[iso], keep = { regime: JSON.parse(JSON.stringify(s.regime)), st: JSON.parse(JSON.stringify(s.st)), treasury: s.treasury, legit: s.legit, projects: (s.projects || []).slice(), coup: s.coupProofUntil || 0 };
        // drawn: every living regime holds powerDraw keys
        var drawnOK = true, n = 0; for (var i in S21) { var q = S21[i]; if (!q.st || !q.regime) continue; n++; if (!q.regime.powers || q.regime.powers.length !== cf21.powerDraw) drawnOK = false; }
        // weighted: a junta draws rearmament far more often than an elected government, over many draws of a fixed stream
        var cnt = function (type) { var k = 0; for (var d = 0; d < 400; d++) { var st = d * 7919 + 1; var rng = function () { st = (st * 9301 + 49297) % 233280; return st / 233280; }; if (PG.drawPowers(iso, type, rng).indexOf("rearmament") >= 0) k++; } return k; };   // an integer recurrence: a fraction fed back gives the same value every call
        var junta = cnt("military"), elected = cnt("elected");
        // saved: the programme rides in the pack
        s.regime.enacting = "schools"; s.regime.cooldown = { austerity: W.day + 5 }; s.regime.done = ["reserve"];
        var packed = JSON.stringify(W.packAll());
        var savedOK = packed.indexOf('"enacting":"schools"') >= 0 && packed.indexOf('"austerity":') >= 0 && packed.indexOf('"reserve"') >= 0;
        // project: a two-stat work power takes the slot, raises both stats, and is done when it ends
        s.regime.powers = ["publicWorks"]; s.regime.done = []; s.regime.enacting = null; s.regime.cooldown = {}; s.projects = [];
        s.treasury = 500 * E21.taxIncome(s); var i0 = s.st.infra, st0 = s.st.stability;
        var began = PG.enact(iso, s, "publicWorks"), slotTaken = s.regime.enacting === "publicWorks";
        s.regime.powers.push("schools"); var secondHeld = PG.canEnact(s, "schools", W.day);   // held, but the slot is taken
        W.advanceDays(Math.round(cf21.projectDays * 0.5) + 2);
        var projectOK = began && slotTaken && !secondHeld && s.st.infra > i0 + 0.1 && s.st.stability > st0 + 0.1 && s.regime.done.indexOf("publicWorks") >= 0 && s.regime.enacting == null;
        // act: applies its effects, charges the lump, cools down
        s.regime.powers = ["austerity"]; s.regime.enacting = null;
        var inc = E21.taxIncome(s), tr0 = s.treasury, st1 = s.st.stability, acted = PG.enact(iso, s, "austerity");
        var actOK = acted && s.treasury > tr0 + (25 - cf21.enactDays) * inc * 0.9 && s.st.stability < st1 && !PG.canEnact(s, "austerity", W.day);
        // earned: a mod's multiplier reads 1 until it is done, and its factor after
        var mul0 = PG.powerMul(s, "stockDays"); s.regime.done.push("reserve"); var mul1 = PG.powerMul(s, "stockDays");
        var earnedOK = mul0 === 1 && Math.abs(mul1 - 1.6) < 1e-9;
        // priced: the candidate for a legitimacy-raising act is worth more at a higher valueOfLegit
        s.regime.powers = ["antiCorrupt"]; s.regime.done = []; s.regime.enacting = null; s.regime.cooldown = {};
        var T = window.COUNTRIES.temperament(iso, W.seed);
        var valAt = function (v) { var keepV = cf21.valueOfLegit; cf21.valueOfLegit = v; var cs = D21.candidates(iso, s, cf21, T, null, "monthly").filter(function (k) { return k.action === "enact" && k.target === "antiCorrupt"; })[0]; cf21.valueOfLegit = keepV; return cs ? cs.value : null; };
        var vLo = valAt(0.05), vHi = valAt(0.5), pricedOK = vLo !== null && vHi !== null && vHi > vLo + 1e-9;
        s.regime = keep.regime; s.st = keep.st; s.treasury = keep.treasury; s.legit = keep.legit; s.projects = keep.projects; s.coupProofUntil = keep.coup;
        return { ok: true, iso: iso, drawnOK: drawnOK, regimes: n, junta: junta, elected: elected, savedOK: savedOK, projectOK: projectOK, actOK: actOK, earnedOK: earnedOK, pricedOK: pricedOK, secondHeld: secondHeld, vLo: vLo === null ? null : +vLo.toFixed(1), vHi: vHi === null ? null : +vHi.toFixed(1) };
      })();
      m.powersDrawn = pw.ok && pw.drawnOK && pw.regimes > 100;
      m.powersWeighted = pw.ok && pw.junta >= 3 * Math.max(1, pw.elected);
      m.powersSaved = pw.ok && pw.savedOK;
      m.powerProject = pw.ok && pw.projectOK;
      m.powerActs = pw.ok && pw.actOK;
      m.oneEnactment = pw.ok && !pw.secondHeld;
      m.powersEarned = pw.ok && pw.earnedOK;
      m.legitPriced = pw.ok && pw.pricedOK;
      m.powersInfo = pw;
      m.peaceLadder = pl.ok && pl.rungBehind >= 0 && pl.rungAhead >= 0 && pl.rungBehind <= pl.rungAhead && pl.monoB && pl.monoA;
      m.winnerExtracts = pl.ok && pl.rungAhead >= pl.rungBehind;
      m.suingBeatsDefeat = pl.ok && pl.cheaper;
      m.whitePeaceRecords = pl.ok && pl.bare === 0 && pl.whitePeace;
      m.counterOffer = pl.ok && pl.counter;
      m.peaceInfo = pl;
      // borrowed money is dear: the same project costs a country at its credit limit more than one with a full treasury
      var ddIso = ["CL", "MY", "MA", "PE", "PL"].filter(function (i) { var q = S21[i]; return q && q.st && !W.fighting(i) && !q.occupiedBy; })[0];
      if (ddIso) {
        var dd = S21[ddIso], Td = window.COUNTRIES.temperament(ddIso, W.seed), keepDT = dd.treasury;
        var investAt = function (tr) { dd.treasury = tr; return D21.candidates(ddIso, dd, cf21, Td, null, "monthly").filter(function (k) { return k.action === "invest"; }); };
        var richInv = investAt(200 * E21.taxIncome(dd))[0];
        var poorInv = richInv ? investAt(-0.95 * E21.credit(dd)).filter(function (k) { return k.target === richInv.target; })[0] : null;
        dd.treasury = keepDT;
        m.debtIsDear = !!richInv && (!poorInv || poorInv.value < richInv.value - 1e-9);
        m.debtDearInfo = { country: ddIso, rich: richInv ? +richInv.value.toFixed(2) : null, atLimit: poorInv ? +poorInv.value.toFixed(2) : "gone", row: cf21.debtDear };
      } else { m.debtIsDear = false; m.debtDearInfo = "no country at peace"; }
      // lenders remember: a country whose income has just collapsed keeps the limit its record earned
      var cr = S21.BR || S21.MX, keepIR = cr.incomeRef, keepOut = cr.output;
      cr.incomeRef = E21.taxIncome(cr); var creditBefore = E21.credit(cr);
      cr.output = cr.output * 0.5; var creditAfter = E21.credit(cr);          // half the economy, same remembered income
      cr.output = keepOut; cr.incomeRef = 0; var creditNaive = E21.credit(cr);
      cr.incomeRef = keepIR;
      m.creditRemembers = Math.abs(creditAfter - creditBefore) < 1e-6 && creditNaive > 0;
      m.creditInfo = { before: +creditBefore.toFixed(0), afterHalving: +creditAfter.toFixed(0), noMemory: +creditNaive.toFixed(0), days: cf21.creditMemory };
      // the stability drag on debt is graded, not a cliff at the limit
      var dsIso = "PL", dss = S21[dsIso], keepDsT = dss.treasury;
      dss.treasury = 0; var stab0 = W.driftTargetsOf(dsIso).stability;
      dss.treasury = -0.5 * E21.credit(dss); var stabHalf = W.driftTargetsOf(dsIso).stability;
      dss.treasury = -1.0 * E21.credit(dss); var stabFull = W.driftTargetsOf(dsIso).stability;
      dss.treasury = keepDsT;
      m.debtStabGraded = stabHalf < stab0 - 1e-9 && stabFull < stabHalf - 1e-9
                         && Math.abs((stab0 - stabFull) - cf21.debtStab) < 0.5;
      m.debtStabInfo = { solvent: +stab0.toFixed(1), half: +stabHalf.toFixed(1), atLimit: +stabFull.toFixed(1) };
      // research is still worth funding at the frontier, and a defaulting partner ships no technology
      var rsIso = ["KR", "JP", "SE", "NL", "IL"].filter(function (i) { var q = S21[i]; return q && q.st && !W.fighting(i) && !q.occupiedBy; })[0];
      if (rsIso) {
        var rs = S21[rsIso], Tr = window.COUNTRIES.temperament(rsIso, W.seed), keepRT = rs.st.technology, keepRTr = rs.treasury;
        rs.treasury = 500 * E21.taxIncome(rs);
        var researchAt = function (lvl) {
          rs.st.technology = lvl;
          var r = D21.candidates(rsIso, rs, cf21, Tr, null, "monthly").filter(function (k) { return k.action === "research"; })[0];
          return r ? r.value : null;
        };
        var r50 = researchAt(50), r95 = researchAt(95);
        rs.st.technology = keepRT; rs.treasury = keepRTr;
        m.frontierStillResearches = r50 !== null && r95 !== null && r95 > 0;
        m.researchInfo = { country: rsIso, at50: r50 === null ? "gone" : +r50.toFixed(1), at95: r95 === null ? "gone" : +r95.toFixed(1) };
      } else { m.frontierStillResearches = false; m.researchInfo = "no country at peace"; }
      // a partner in default ships no technology: the leg is gated on the day's delivery
      var tgA = "DE", tgB = "PL", tgAs = S21[tgA], tgBs = S21[tgB];
      if (tgAs && tgBs && tgAs.st && tgBs.st) {
        var keepTechB = tgBs.st.technology, keepPairDeals = W.dealsOf(tgA, tgB).slice();
        W.dropDeals(tgA, tgB);
        var keepQuiet = { r: cf21.researchStep, t: cf21.techStep, g: cf21.diffuseGain, d: cf21.driftSlow, n: cf21.driftNoise };
        cf21.researchStep = 0; cf21.techStep = 0; cf21.diffuseGain = 0; cf21.driftSlow = 0; cf21.driftNoise = 0;   // only the deal may move technology
        tgAs.st.technology = 95; tgBs.st.technology = 40;
        // a deal whose resource leg A cannot possibly deliver: the shortfall must stop the technology leg too
        W.addDeal(tgA, tgB, { g: 2, gq: 1e9, t: -1, tq: 0, mq: 0, tech: 0.05, until: W.day + 365, since: W.day, short: 0 });
        W.advanceDays(2);
        var gainedOnDefault = tgBs.st.technology - 40;
        W.dropDeals(tgA, tgB);
        tgBs.st.technology = 40;
        W.addDeal(tgA, tgB, { g: -1, gq: 0, t: -1, tq: 0, mq: 0, tech: 0.05, until: W.day + 365, since: W.day, short: 0 });
        W.advanceDays(2);
        var gainedOnDelivery = tgBs.st.technology - 40;
        W.dropDeals(tgA, tgB); keepPairDeals.forEach(function (d) { W.addDeal(tgA, tgB, d); });
        tgAs.st.technology = tgAs.st.technology; tgBs.st.technology = keepTechB;
        cf21.researchStep = keepQuiet.r; cf21.techStep = keepQuiet.t; cf21.diffuseGain = keepQuiet.g;
        cf21.driftSlow = keepQuiet.d; cf21.driftNoise = keepQuiet.n;
        m.defaultShipsNoTech = gainedOnDefault <= 1e-9 && gainedOnDelivery > 1e-9;
        m.techLegInfo = { onDefault: +gainedOnDefault.toFixed(4), onDelivery: +gainedOnDelivery.toFixed(4) };
      } else { m.defaultShipsNoTech = false; m.techLegInfo = "no pair"; }
      m.brokeInfo = { cliff: +boughtNone.toFixed(3), food: +ateBroke.toFixed(3), materials: +matBroke.toFixed(3), allowance: +(keepBD * E21.taxIncome(bk)).toFixed(1), foodBill: +(bk.consumption[2] * W.WORLD_STATE.market.price[2]).toFixed(1) };
      // cartels: no floor for a type nobody imports, and the partner cap binds the accepting side too
      var D13 = window.DECIDE, S13 = W.COUNTRY_STATE, cf13 = window.ENTITY_CONFIG, M13 = window.ECONOMY.market(), sellers13 = [];
      for (var s13 in S13) { var ss13 = S13[s13]; if (ss13.st && ss13.production && !ss13.occupiedBy && !W.fighting(s13) && ss13.production[2] - ss13.consumption[2] > 0) sellers13.push(s13); }
      sellers13.sort(function (x, y) { return (S13[y].production[2] - S13[y].consumption[2]) - (S13[x].production[2] - S13[x].consumption[2]); });
      if (sellers13.length >= 2) {
        var keepBuys13 = M13.buys[2], keepPrice13 = M13.price[2], keepRest13 = M13.rest[2];
        M13.price[2] = 0.5; M13.rest[2] = 1;                                              // a price worth holding up
        M13.buys[2] = cf13.cartelDemand * M13.need[2] * 2;                                // with demand
        var withDemand = D13.proposeFloor(sellers13[0], sellers13[1], 2);
        M13.buys[2] = 0;                                                                  // and without
        var without = D13.proposeFloor(sellers13[0], sellers13[1], 2);
        M13.buys[2] = keepBuys13; M13.price[2] = keepPrice13; M13.rest[2] = keepRest13;
        m.noCartelWithoutDemand = without === null && (withDemand === null || !!withDemand.deal);   // demand is necessary; the rest of the rule may still say no
        m.cartelDemandInfo = { sellers: sellers13.slice(0, 2), withDemand: withDemand ? "proposed" : "declined", without: without ? "proposed" : "declined" };
        // three floors on a seller: nobody proposes it a fourth
        var full13 = sellers13[0], dummies = sellers13.slice(1, 4), added = 0, dummyDeals = [];
        dummies.forEach(function (o) { var dd = { g: -1, gq: 0, t: -1, tq: 0, mq: 0, tech: 0, until: W.day + 30, since: W.day, short: 0, fk: 2, fp: 1.3 }; W.addDeal(full13, o, dd); dummyDeals.push([o, dd]); added++; });
        var offered13 = 0;
        for (var q13 = 0; q13 < Math.min(6, sellers13.length); q13++) { var who = sellers13[q13]; if (who === full13) continue;
          var T13 = window.COUNTRIES.temperament(who, W.seed);
          D13.candidates(who, S13[who], cf13, T13, null, "weekly").forEach(function (k) { if (k.action === "cartel" && k.target === full13) offered13++; }); }
        m.cartelCapBothSides = added >= 3 && offered13 === 0;
        dummyDeals.forEach(function (pr) { var dl = W.dealsOf(full13, pr[0]), ix = dl.indexOf(pr[1]); if (ix >= 0) dl.splice(ix, 1); }); W.touchPairs();
        m.cartelCapInfo = { full: full13, floorsAdded: added, offeredTo: offered13 };
      } else { m.noCartelWithoutDemand = false; m.cartelCapBothSides = false; m.cartelDemandInfo = "no sellers"; }
      // fronts move at the pace of their reach, faster against a defender that cannot contest the domain; occupiers reach by land
      var D12 = window.DECIDE, S12 = W.COUNTRY_STATE, cf12 = window.ENTITY_CONFIG, L12 = window.LINKS, airPair = null;
      for (var a12 in S12) { if (!S12[a12].st) continue; for (var b12 in S12) { if (a12 === b12 || !S12[b12].st) continue;
        if (!L12.linkedBy(a12, b12, "land") && !L12.linkedBy(a12, b12, "sea") && S12[b12].pop >= 5) { airPair = [a12, b12]; break; } } if (airPair) break; }
      var landDom = D12.frontDomain("US", "CA"), paceLand = D12.frontPace(landDom);
      if (airPair) {
        var keepTech12 = S12[airPair[1]].st.technology;
        S12[airPair[1]].st.technology = cf12.techHigh + 5; var domC = D12.frontDomain(airPair[0], airPair[1]), paceC = D12.frontPace(domC);
        S12[airPair[1]].st.technology = cf12.techHigh - 5; var domU = D12.frontDomain(airPair[0], airPair[1]), paceU = D12.frontPace(domU);
        S12[airPair[1]].st.technology = keepTech12;
        m.frontPaceByReach = landDom.domain === "land" && paceLand === 1 && domC.domain === "air" && domC.contested && !domU.contested && paceC === cf12.reachAir && paceU > paceC && paceU < 1;
        m.paceInfo = { pair: airPair, land: paceLand, contested: +paceC.toFixed(3), uncontested: +paceU.toFixed(3) };
      } else { m.frontPaceByReach = false; m.paceInfo = "no air pair"; }
      var rec12 = [{ iso: "US", share: 0.2 }, { iso: airPair ? airPair[0] : "AU", share: 0.8 }];   // the winner, and a distant ally with the larger share
      var pick12 = D12.occupierOf("US", "CA", rec12, function () { return 0.95; });
      m.occupierByLand = !!pick12 && pick12.iso === "US";
      // fronts and coalitions: an ally that borders the enemy opens its own front, its partners are called in turn,
      // and a front decided against an ally knocks it out while the war goes on
      var D9 = window.DECIDE, S9 = W.COUNTRY_STATE, L9 = window.LINKS, trio = null;
      for (var a9 in S9) {
        var as9 = S9[a9]; if (!as9.st || as9.pop < 5 || W.fighting(a9) || as9.occupiedBy) continue;
        var lands = L9.partners(a9).filter(function (o) { var os = S9[o]; return L9.linkedBy(a9, o, "land") && os && os.st && os.pop >= 5 && !W.fighting(o) && !os.occupiedBy; });
        if (lands.length >= 2) { trio = [a9, lands[0], lands[1]]; break; }          // an attacker, its victim, and a helper that borders the attacker too
      }
      if (trio) {
        var A9 = trio[0], V9 = trio[1], H9 = trio[2];
        var estAlone = D9.estimateRatio(A9, V9, null).truth;
        W.pairOf(V9, H9).pact = W.day; W.touchPairs();
        var estCoalition = D9.estimateRatio(A9, V9, null).truth;
        var hyp9 = { att: A9, def: V9, since: W.day, score: 0, allies: { att: [], def: [] }, fronts: [], asked: { att: [], def: [] }, decided: {}, calledBy: {} };
        var chance9 = D9.joinChance(H9, hyp9, "def", V9);
        m.estimateSeesCoalition = estCoalition < estAlone * 0.999 && chance9 > 0 && chance9 < 1;
        var hp = L9.partners(H9).filter(function (o) { var os = S9[o]; return o !== V9 && o !== A9 && os && os.st && !os.occupiedBy && !W.fighting(o); })[0] || null;
        if (hp) { W.pairOf(H9, hp).pact = W.day; W.touchPairs(); }                    // a partner of the helper, to watch the chain
        D9.declareWar(A9, V9, { force: true });
        var war9 = W.warBetween(A9, V9), asked0 = !!war9 && war9.asked.def.indexOf(H9) >= 0;
        D9.joinWar(H9, war9, "def", V9);
        var fronts9 = (war9.fronts || []).filter(function (f) { return f.a === A9 && f.d === H9; });
        m.frontOpens = asked0 && fronts9.length === 1 && W.fighting(H9) && !W.atWar(H9);
        var shP = D9.frontShare(A9, war9, null), shF = fronts9.length ? D9.frontShare(A9, war9, fronts9[0]) : 1;
        m.forceSplitsByThreat = shP > 0 && shP < 1 && shF > 0 && shF < 1 && Math.abs(shP + shF - 1) < 0.2 + 1e-9;
        m.splitInfo = { principal: +shP.toFixed(2), front: +shF.toFixed(2), est: [+estAlone.toFixed(2), +estCoalition.toFixed(2)], helperWouldJoin: +chance9.toFixed(3) };
        m.chainCalls = !hp || (war9.asked.def.indexOf(hp) >= 0 && D9.callerOf(war9, "def", hp) === H9) || (!!hp && D9.contributors(H9, A9).indexOf(hp) < 0);   // or too small to be worth calling
        if (hp && war9.asked.def.indexOf(hp) >= 0) {
          D9.refuseCall(hp, war9, H9);                                                     // a friend's friend declines: the pact is strained, not broken
          var keptChain = W.pairOf(H9, hp).pact > 0 && D9.trustIn(S9[H9], hp) === window.ENTITY_CONFIG.refuseTrust;
          var third = null; for (var t9 in S9) { if (t9 !== A9 && t9 !== V9 && t9 !== H9 && t9 !== hp && S9[t9].st && S9[t9].pop >= 5 && !W.fighting(t9) && D9.allies(A9, V9).indexOf(t9) < 0) { third = t9; break; } }   // no pact with the attacker: a principal's call, not a conflict
          var brokePrincipal = true;
          if (third) { W.pairOf(V9, third).pact = W.day; W.touchPairs(); D9.refuseCall(third, war9, V9); brokePrincipal = W.pairOf(V9, third).pact === 0; W.touchPairs(); }
          m.refusalByCaller = keptChain && brokePrincipal;
        } else m.refusalByCaller = true;
        var allies0 = war9.allies.def.indexOf(H9) >= 0;
        fronts9[0].score = 1.5;                                                         // the helper's front is lost
        D9.warTick(function () { return 0.5; });
        var stillOn = !!W.warBetween(A9, V9);
        var knocked = allies0 && war9.allies.def.indexOf(H9) < 0 && !(war9.fronts || []).some(function (f) { return f.a === H9 || f.d === H9; });
        m.frontDecides = stillOn && knocked && W.WORLD_STATE.log.some(function (e) { return e.kind === "front" && e.iso === A9 && e.iso2 === H9; });
        m.frontInfo = { trio: trio, chain: hp, asked: asked0, fronts: fronts9.length, knocked: knocked, warOn: stillOn, helperOccupied: S9[H9].occupiedBy || null };
        if (W.warBetween(A9, V9)) D9.suePeace(A9, V9);
        W.pairOf(V9, H9).pact = 0; if (hp) W.pairOf(H9, hp).pact = 0; W.touchPairs();
      } else { m.frontOpens = false; m.chainCalls = false; m.frontDecides = false; m.frontInfo = "no trio"; }
        }
  function world(done) {
    at("world");
    // the world checks read the link graph (borders, sea lanes, partners), and the map is a network fetch:
    // wait for it as the links step does, rather than checking a world with no geography
    var m = {}, W = window.WORLD, tries = 0;
    (function poll() {
      if (!(window.LINKS && window.LINKS.ready) && tries++ < 120) { setTimeout(poll, 250); return; }
      m.linksReady = !!(window.LINKS && window.LINKS.ready);
      try {
        W.newWorld(12345); W.advanceDays(775);
        worldChecks(m);
        m.worldChecksRan = true;
      } catch (e) { m.worldChecksRan = false; m.worldChecksError = String(e && e.stack || e).slice(0, 400); }
      r.modals = m;
      done();
    })();
  }
  function text() {
    at("text");
    // innerText, not innerHTML: the latter would match this probe's own source.
    // The variant panel holds the bounty cards, so read with it open.
    $("variantToggle").click();
    var t = document.body.innerText || "";
    esc();
    r.text = {
      u0001f: t.indexOf("U0001f") >= 0,
      fffd: t.indexOf(String.fromCharCode(65533)) >= 0
    };
  }
  function clock(done) {
    at("clock");
    try {
      var W = window.WORLD, d0 = W.day, clk = window.ENTITY_CLOCK, c = window.ENTITY_CONFIG;
      var dayMs = c.dayMs; c.dayMs = 200;   // a day is 10 s at 1x; the check only needs the clock to move
      setTimeout(function () {
        c.dayMs = dayMs;
        r.modals.clockRuns = !!(clk && clk.running) && W.day > d0;
        done();
      }, 1500);
    } catch (e) { r.modals.clockRuns = false; r.modals.clockError = String(e); done(); }
  }
  // Links need the map (a network fetch): poll, and report null if it never comes.
  function links(done) {
    at("links");
    var W = window.WORLD, L = window.LINKS, tries = 0;
    (function poll() {
      try {
        if (L && L.ready) {
          W.advanceDays(1);
          r.modals.bordersDerived = L.count("land") > 150;
          r.modals.coastalFlow = L.flow("GB", "FR") > 0 && L.flow("FR", "GB") > 0;
          r.modals.linkCounts = L.count("land") + "/" + L.count("sea") + "/" + L.count("air");
          // wars are for resources and rare: a year should bring a few, not none and not dozens
          var SA = W.COUNTRY_STATE.SA, JP = W.COUNTRY_STATE.JP;
          // scale: force carries population; the land can carry everyone it holds today
          r.modals.forceUsed = W.force("IN") / Math.max(1, W.force("SG")) > 10 && W.force("IN") > 10000;
          var over = [];
          for (var pi in W.COUNTRY_STATE) { var ps = W.COUNTRY_STATE[pi]; if (ps.st && (ps.area || 0) >= 1000 && W.popCap(pi) < ps.pop * (1 - window.ENTITY_CONFIG.popOvershoot)) over.push(pi + ":" + Math.round(ps.pop) + ">" + Math.round(W.popCap(pi))); }   // city-states are their own case
          r.modals.popCapSane = over.length === 0; r.modals.popCapOver = over.slice(0, 12);
          r.modals.potentialsSeeded = Array.isArray(SA.potential) && SA.potential[0] > 0 && SA.potential[3] < SA.potential[0];
          r.modals.resourcesSeeded = SA.res[0] > 80 && JP.res[0] < 30 && SA.res[3] < 10;
          var seq0 = W.WORLD_STATE.warSeq | 0; W.advanceDays(365);
          r.modals.warsPerYear = (W.WORLD_STATE.warSeq | 0) - seq0;
          r.modals.warRateSane = r.modals.warsPerYear >= 1 && r.modals.warsPerYear <= 15;
          // a resource-poor economy feeds itself on the exchange: a poor country at peace keeps its worst balance high after a year
          var jsp = W.supplyOf("JP"), jpc = W.pairCounts().JP, fedBy = null;
          ["JP", "KR", "SG", "CH", "IL", "NL", "BE"].forEach(function (pi) {
            var ps = W.COUNTRY_STATE[pi];
            if (fedBy || !ps || !ps.st || W.atWar(pi) || ps.occupiedBy || window.ECONOMY.marketAccess(pi) < 0.95) return;
            fedBy = [pi, Math.round(Math.min.apply(null, W.supplyOf(pi)))];
          });
          r.modals.marketFeeds = !!fedBy && fedBy[1] > 80;
          r.modals.marketFeedsInfo = { picked: fedBy, japanAtWar: W.atWar("JP"), japanOccupied: W.COUNTRY_STATE.JP.occupiedBy || null, japanAccess: Math.round(window.ECONOMY.marketAccess("JP") * 100) / 100 };
          r.modals.japanFloor = Math.round(Math.min.apply(null, jsp)); r.modals.japanDeals = jpc ? jpc.trade : 0;
          // stage 7: map layers, the conflict overlay, and the tooltip and dialog with stats
          try {
            var H = W.worldMap, D = window.DECIDE, esc2 = function () { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); };
            // the bands sit where the world is: every band of a retuned layer holds countries, not just the middle two
            var perBand = function () { return [1, 2, 3, 4].map(function (k) { return document.querySelectorAll("#mapSvg .country.lv" + k).length; }); };
            H.setLayer("stability"); var stabBands = perBand();
            r.modals.layerToggle = $("mapView").dataset.layer === "stability" && stabBands.reduce(function (a, b) { return a + b; }, 0) > 50 && stabBands.every(function (n) { return n >= 3; });
            H.setLayer("legitimacy"); var legitBands = perBand();
            r.modals.legitimacyLayer = $("mapView").dataset.layer === "legitimacy" && legitBands.reduce(function (a, b) { return a + b; }, 0) > 20 && legitBands.filter(function (n) { return n >= 2; }).length >= 3;
            H.setLayer("resources"); var supplyBands = perBand();   // the old name lands on the supply layer
            r.modals.supplyLayer = $("mapView").dataset.layer === "supply" && supplyBands[0] > supplyBands[1] + supplyBands[2] + supplyBands[3] && supplyBands[1] + supplyBands[2] + supplyBands[3] >= 1;
            r.modals.bandInfo = { stability: stabBands, legitimacy: legitBands, supply: supplyBands };
            H.setLayer("endowment");
            var bright = function (iso) { var f = (document.querySelector("#mapSvg .country[data-iso=" + iso + "]") || { style: {} }).style.fill || ""; var m = /rgb\\((\\d+),\\s*(\\d+),\\s*(\\d+)\\)/.exec(f); return m ? +m[1] + +m[2] + +m[3] : -1; };
            var endowFills = [].filter.call(document.querySelectorAll("#mapSvg .country"), function (p) { return p.style.fill; }).length;
            r.modals.endowmentView = $("mapView").dataset.layer === "endowment" && endowFills > 50 && bright("SA") > bright("JP") && bright("JP") >= 0;
            r.modals.endowmentInfo = { fills: endowFills, SA: bright("SA"), JP: bright("JP") };
            r.modals.priceTicker = ($("mapPrices") || { textContent: "" }).textContent.indexOf("energy") >= 0;
            // stat views: an exact shade per country set inline, the ramp shown in the legend, and the bands back on the way out
            var inlineFills = function () { return [].filter.call(document.querySelectorAll("#mapSvg .country"), function (p) { return p.style.fill; }).length; };
            var banded = function () { return document.querySelectorAll("#mapSvg .country.lv1,#mapSvg .country.lv2,#mapSvg .country.lv3,#mapSvg .country.lv4").length; };
            H.setLayer("technology");
            var techOK = $("mapView").dataset.layer === "technology" && inlineFills() > 50 && banded() === 0 && !$("mapGrad").hidden && ($("mapGrad").querySelector("i").style.background || "").indexOf("gradient") >= 0;
            var techFill = (document.querySelector("#mapSvg .country[data-iso=DE]") || { style: {} }).style.fill, sahelFill = (document.querySelector("#mapSvg .country[data-iso=TD]") || { style: {} }).style.fill;
            H.setLayer("population");
            var popOK = $("mapView").dataset.layer === "population" && inlineFills() > 50 && $("mapGrad").querySelector(".hi").textContent === "1 B";
            H.setLayer("coverage");
            r.modals.statLayer = techOK && popOK && inlineFills() === 0 && $("mapGrad").hidden && !$("mapLegend").querySelector(".row").hidden && techFill !== sahelFill;
            r.modals.statLayerInfo = { techOK: techOK, popOK: popOK, germany: techFill, chad: sahelFill };
            if (!W.warBetween("RU", "UA")) D.declareWar("RU", "UA", { force: true });
            // armies are spent by war: one day of fighting lowers both militaries (no decisions in between to offset it)
            var milA = W.COUNTRY_STATE.RU.st.military, milD = W.COUNTRY_STATE.UA.st.military;
            D.warTick(function () { return 0.5; });
            r.modals.armiesBleed = W.COUNTRY_STATE.RU.st.military < milA && W.COUNTRY_STATE.UA.st.military < milD;
            if (!W.warBetween("RU", "UA")) D.declareWar("RU", "UA", { force: true });   // for the overlay, if that tick ended it
            // occupation hands a share of the occupied country's production to the occupier
            W.COUNTRY_STATE.BY.occupiedBy = null; W.COUNTRY_STATE.RU.occupiedBy = null;   // a clean pair, whatever the wars did
            var ruFood0 = window.ECONOMY.assess("RU").production[2], byFood = window.ECONOMY.assess("BY").production[2];
            D.occupy("RU", "BY", 30); H.overlay.draw();
            var ruFood1 = window.ECONOMY.assess("RU").production[2];
            r.modals.occupationShares = ruFood1 - ruFood0 > 0.8 * window.ENTITY_CONFIG.occupyRes * byFood;   // most of the taken share shows up (Belarus is small next to Russia)
            r.modals.occupationInfo = { before: Math.round(ruFood0), after: Math.round(ruFood1), by: Math.round(byFood * 100) / 100, byPop: Math.round(W.COUNTRY_STATE.BY.pop * 10) / 10 };
            r.modals.overlayDrawn = document.querySelectorAll("#mapSvg .war-outline").length >= 2 && document.querySelectorAll("#mapSvg .war-line").length >= 1 && document.querySelectorAll("#mapSvg .occupied").length >= 1;
            if ($("countryModal").classList.contains("open")) document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
            window.ENTITY.openCountryModal("FR");
            r.modals.dialogInfo = { open: $("countryModal").classList.contains("open"), bars: $("cmBody").querySelectorAll(".stat-bar").length, len: $("cmBody").innerHTML.length };   // six stats: the economy is an index now
            r.modals.dialogStats = $("countryModal").classList.contains("open") && $("cmBody").querySelectorAll(".stat-bar").length === 6
                                   && $("cmBody").querySelectorAll(".res-row").length === 6 && $("cmBody").textContent.indexOf("Government") >= 0;   // four resources, prices, weather
            // the country screen: six vitals, ten sections, a tooltip on every label, no undefined/NaN, sparklines after a year
            var cb = $("cmBody");
            r.modals.countryScreen = cb.querySelectorAll(".vital").length === 6 && cb.querySelectorAll("details").length >= 10 && !!$("cmDeploy")
              && [].every.call(cb.querySelectorAll("summary, .vital .k, .sec .row > .k"), function (el) { return (el.getAttribute("title") || "").length > 10; })
              && !/undefined|NaN/.test(cb.textContent);
            r.modals.countryHistory = !!cb.querySelector(".spark polyline") && (W.COUNTRY_STATE.FR.series || []).length >= 12;
            var det = cb.querySelector('details[data-sec="links"]'); det.open = true;
            W.advanceDays(31); window.ENTITY.refreshCountry();
            r.modals.countryLive = det.open && (W.COUNTRY_STATE.FR.series || []).length >= 13 && det.querySelector(".sec").textContent.indexOf("Travel today") >= 0;
            esc2();
            window.ENTITY.openCountryModal("JP");
            r.modals.countryDetail = /potential/.test($("cmBody").querySelector('details[data-sec="resources"] .feeds').textContent) && (W.COUNTRY_STATE.JP.hist || []).length >= 3;
            esc2();
            // a drought cuts water supply; a catastrophic quake devastates infrastructure and makes the front page
            var eg = W.COUNTRY_STATE.EG, w0 = window.ECONOMY.assess("EG").production[3];
            eg.dryUntil = W.day + 365;
            r.modals.droughtCutsWater = window.ECONOMY.assess("EG").production[3] < w0 * 0.9;
            eg.dryUntil = 0;
            var inf0 = JP.st.infra, ev = window.EVENTS.fire("JP", "quake", 2, function () { return 0.5; });
            r.modals.catastrophicDevastates = !!ev && ev.sev === "massive" && JP.st.infra <= inf0 - 30;
            var fr = document.querySelector('#mapSvg .country[data-iso="FR"]');
            fr.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 100, clientY: 100 }));
            r.modals.tooltipStats = $("mapTooltip").classList.contains("show") && !!$("mapTooltip").querySelector(".gov") && !!$("mapTooltip").querySelector(".mini");
            H.pulse("FR"); r.modals.pulseClass = fr.classList.contains("pulse");
          } catch (e) { r.modals.layerToggle = false; r.modals.mapUiError = String(e); }
          done(); return;
        }
        if (++tries > 20) { r.modals.bordersDerived = null; r.modals.coastalFlow = null; done(); return; }
        setTimeout(poll, 250);
      } catch (e) { r.modals.bordersDerived = false; r.modals.linksError = String(e); done(); }
    })();
  }
  // Save and load through progression.js itself (Save button, Load button + its
  // confirm dialog), then a v3-shaped save to prove the migration path.
  function saveLoad(done) {
    at("saveLoad");
    try {
      var W = window.WORLD;
      W.newWorld(777); W.advanceDays(45);
      var day0 = W.day, eco0 = W.COUNTRY_STATE.FR.output, cal0 = $("calDisplay").textContent;
      $("saveBtn").click();
      W.advanceDays(30);
      $("loadBtn").click();
      setTimeout(function () {
        var ok = $("askOk"); if (ok) ok.click();
        setTimeout(function () {
          r.modals.saveLoadRestores = W.day === day0 && W.COUNTRY_STATE.FR.output === eco0 && $("calDisplay").textContent === cal0;
          var v3 = { v: 3, t: 0, player: { money: 900, scrutiny: 5, job: 1, maxVariants: 8, variants: [], salary: 120, scrutinyFloor: 16,
                     promoStreak: 0, lateralStreak: 0, notoriety: 0, careerHistory: [] },
                     countries: { US: { c: 1, lv: 0.4, pr: null, dt: 0.1, ga: 0, rp: 0 } }, bounties: [null, null, null] };
          localStorage.setItem("entity_save_v3", JSON.stringify(v3));
          $("loadBtn").click();
          setTimeout(function () {
            var ok2 = $("askOk"); if (ok2) ok2.click();
            setTimeout(function () {
              var us = W.COUNTRY_STATE.US;
              // money is 900 from the save plus whatever the bench paid in the meantime: the income tick runs on real time
              r.modals.v3Migrates = W.day === 0 && !!us && us.covered === true && Math.abs(us.coverageLevel - 0.4) < 1e-9 && !!us.st
                                    && window.ENTITY.player.money >= 900 && window.ENTITY.player.money < 1000;
              r.modals.v3Detail = { day: W.day, us: !!us, covered: us && us.covered, lv: us && us.coverageLevel, st: !!(us && us.st), money: window.ENTITY.player.money, ok2: !!ok2 };
              // a v4 save (an older full format) also loads as a new world with the outbreak kept; so does a v5 (positional pairs)
              var v4 = JSON.parse(JSON.stringify(v3)); v4.v = 5; v4.pairs = [["FR", "DE", 50, 0, 0, 0, 0, 0, []]];
              v4.world = { seed: 99, day: 200, wars: [], warSeq: 0, diffusions: [], massive: {}, log: [] };
              localStorage.setItem("entity_save_v3", JSON.stringify(v4));
              $("loadBtn").click();
              setTimeout(function () {
                var ok3 = $("askOk"); if (ok3) ok3.click();
                setTimeout(function () {
                  var us4 = W.COUNTRY_STATE.US;
                  r.modals.v4Migrates = W.day === 0 && W.seed !== 99 && !!us4 && us4.covered === true && Math.abs(us4.coverageLevel - 0.4) < 1e-9;   // v5 shaped: the same path
                  localStorage.removeItem("entity_save_v3");
                  done();
                }, 150);
              }, 50);
            }, 150);
          }, 50);
        }, 150);
      }, 50);
    } catch (e) { r.modals.saveLoadRestores = false; r.modals.saveLoadError = String(e); done(); }
  }
  // --eval: wait for the map (links need it), run the caller's code with the
  // result object as `r`, and store what it returns (a promise is awaited).
  function evalRun() {
    var tries = 0, limit = Math.max(1, Math.floor((HOLD - 3000) / 250));
    (function poll() {
      var L = window.LINKS;
      if ((L && L.ready) || ++tries > limit) {
        r.mapReady = !!(L && L.ready);
        var t0 = performance.now();
        var fail = function (e) { r.evalError = String(e && e.stack || e); finish(); };
        try {
          Promise.resolve(new Function("r", EVAL)(r)).then(function (v) {
            r.eval = v === undefined ? null : v;
            r.evalMs = Math.round(performance.now() - t0);
            finish();
          }, fail);
        } catch (e) { fail(e); }
      } else setTimeout(poll, 250);
    })();
  }
  settled(function () {
    if (MODE === "layout") { layout(); finish(); return; }
    if (MODE === "eval") { boot(); evalRun(); return; }
    if (MODE === "world") { boot(); world(finish); return; }
    boot(); layout();
    sim(function () { modals(); text(); clock(function () { links(function () { saveLoad(finish); }); }); });
  });
})();
</script>
"""

# ── helpers ─────────────────────────────────────────────────────────────────

def find_browser(explicit):
    cands = [explicit] if explicit else BROWSERS
    for c in cands:
        if not c:
            continue
        if os.path.isfile(c):
            return c
        w = shutil.which(c)
        if w:
            return w
    return None


def parse_sizes(text):
    out = []
    for tok in text.split(","):
        tok = tok.strip().lower()
        if not tok:
            continue
        w, h = tok.split("x")
        out.append((int(w), int(h)))
    return out


def make_page(mode, hold_ms, eval_src=""):
    src = PAGE.read_text(encoding="utf-8")
    pre_anchor, post_anchor = '<link rel="stylesheet"', "</body>"
    if pre_anchor not in src or post_anchor not in src:
        sys.exit("smoke: Strain.html has no stylesheet link or </body> to anchor the probes")
    page = src.replace(pre_anchor, PRE + pre_anchor, 1)
    post = (POST.replace("__MODE__", mode).replace("__HOLD__", str(hold_ms))
                .replace("__EVAL__", json.dumps(eval_src)))
    page = page.replace(post_anchor, post + post_anchor, 1)
    path = ROOT / ("Strain.smoke-%d-%s.html" % (os.getpid(), mode))
    path.write_text(page, encoding="utf-8")
    return path


class _Handler(http.server.SimpleHTTPRequestHandler):
    """Static files from the project, plus /__hold?ms=N which answers after N ms."""

    protocol_version = "HTTP/1.1"      # keep-alive: far fewer connections per page

    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path.startswith("/__hold?"):
            try:
                ms = int(self.path.split("ms=")[1].split("&")[0])
            except (IndexError, ValueError):
                ms = 0
            time.sleep(ms / 1000)
            self.send_response(200)
            self.send_header("Content-Type", "image/gif")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        return super().do_GET()


class _Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    # TCPServer's default listen backlog is 5.  Several Chromes each opening
    # a dozen connections at once overflowed it, and the refused requests
    # showed up as pages with missing scripts or stylesheets.
    request_queue_size = 128

    def handle_error(self, request, client_address):
        pass          # Chrome drops the favicon connection; nothing to report


def start_server():
    srv = _Server(("127.0.0.1", 0), functools.partial(_Handler, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]


def run_browser(browser, url, size, timeout, offline, shot=None):
    profile = tempfile.mkdtemp(prefix="strain-smoke-")
    # Plain --headless (Chrome 152 routes it to the new implementation; with
    # --headless=new a narrow window was dumped before the probe ran) and no
    # --timeout / --virtual-time-budget: both cut the held load short.
    args = [browser, "--headless", "--disable-gpu", "--no-sandbox",
            "--no-first-run", "--disable-extensions",
            "--user-data-dir=" + profile,
            "--window-size=%d,%d" % size,
            ("--screenshot=" + shot) if shot else "--dump-dom"]
    if offline:
        args.append("--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1")
    args.append(url)
    p = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                         encoding="utf-8", errors="replace")
    try:
        out, _ = p.communicate(timeout=timeout)
        return out, None
    except subprocess.TimeoutExpired:
        # Kill the whole tree: Chrome's renderers hold the pipes open, and
        # killing only the parent leaves communicate() waiting forever.
        if os.name == "nt":
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)], capture_output=True)
        else:
            p.kill()
        try:
            p.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            pass
        return None, "browser timed out after %d s (try --jobs 1)" % timeout
    finally:
        shutil.rmtree(profile, ignore_errors=True)


def read_result(run):
    """(result dict, None) on success, (None, reason) otherwise."""
    dom, err = run
    if err:
        return None, err
    dom = dom or ""
    m = re.search(r"<title>SMOKE:(.*?)</title>", dom, re.S)
    at = re.search(r"<title>SMOKE-AT:(\w+)</title>", dom)
    if not m and at:
        return None, "probe never finished (reached phase: %s; the hold ran out - a busy machine? try --hold 240000)" % at.group(1)
    if not m:
        if not dom:
            return None, "browser returned no DOM"
        t = re.search(r"<title>(.*?)</title>", dom, re.S)
        return None, ("probe never finished (page title: %r)" % html.unescape(t.group(1))[:60]
                      if t else "probe never finished (no title)")
    try:
        return json.loads(html.unescape(m.group(1))), None
    except ValueError as e:
        return None, "probe result was not JSON: %s" % e


# ── checks: each returns (name, ok, detail) ─────────────────────────────────

def check_functional(res, only):
    out = []
    errs = res.get("errors") or []
    b = res.get("boot") or {}
    if "boot" in only:
        ok = (not errs and b.get("ui") and b.get("c") and b.get("entity")
              and b.get("bg") == "rgb(7, 10, 11)")
        out.append(("boot", bool(ok), "errors=%s ui=%s c=%s entity=%s bg=%s"
                    % (" ~ ".join(errs) if errs else "none", b.get("ui"), b.get("c"),
                       b.get("entity"), b.get("bg"))))
    if "sim" in only:
        s = res.get("sim") or {}
        samples = s.get("samples", [])
        series = " / ".join(",".join(str(v) for v in x) for x in samples)
        out.append(("sim", bool(s.get("ok")),
                    "%d samples at 250ms: %s" % (len(samples), series or "none")))
    if "modals" in only:
        m = res.get("modals") or {}
        flags = {k: v for k, v in m.items() if isinstance(v, bool)}
        bad = [k for k, v in flags.items() if not v]
        ok = (bool(flags) and not bad and m.get("tuneInputs", 0) > 100
              and m.get("configRows", 0) > 10)
        out.append(("modals", ok, "failed=%s tuneInputs=%s configRows=%s"
                    % (",".join(bad) or "none", m.get("tuneInputs"), m.get("configRows"))))
    if "text" in only:
        t = res.get("text") or {}
        ok = ("u0001f" in t) and not t.get("u0001f") and not t.get("fffd")
        out.append(("text", ok, "U0001f=%s U+FFFD=%s" % (t.get("u0001f"), t.get("fffd"))))
    return out


def check_world(res):
    errs = res.get("errors") or []
    m = res.get("modals") or {}
    flags = {k: v for k, v in m.items() if isinstance(v, bool)}
    bad = [k for k, v in flags.items() if not v]
    ok = bool(flags) and not bad and not errs and m.get("worldChecksRan") is True
    return ("world", ok, "failed=%s errors=%s%s" % (",".join(bad) or "none", " ~ ".join(errs) if errs else "none",
                                                     (" " + m["worldChecksError"]) if m.get("worldChecksError") else ""))


def check_layout(size, res):
    errs = res.get("errors") or []
    if errs:
        # A page that lost a script or stylesheet lays out plausibly but
        # wrongly; never let its numbers pass.
        return ("layout %dx%d" % size, False, "%dx%d errors=%s" % (size[0], size[1], " ~ ".join(errs)))
    L = res.get("layout") or {}
    vw, vh = res.get("vw", 0), res.get("vh", 0)
    vscroll = (L.get("benchScroll", 0) > L.get("benchClient", 0) + 1
               or L.get("barW", 0) > 0 or L.get("barH", 0) > 0)
    hscroll = max(L.get("bodyScrollW", 0), L.get("docScrollW", 0)) > vw
    gave_up = L.get("fit") == "floor" and vh < MIN_FIT_HEIGHT
    dialog_over = L.get("cmOverflow", 0) > 1 or L.get("cmSections", 0) < 10
    ok = (not vscroll or gave_up) and not hscroll and not dialog_over
    detail = ("%dx%d -> viewport %dx%d %s bench=%d/%d%s plates=%s chrome=%s+%s+%s%s"
              % (size[0], size[1], vw, vh,
                 {"grid": "grid", "one": "one-plate", "floor": "one-plate(floor)"}.get(L.get("fit"), "?"),
                 L.get("benchClient", 0), L.get("benchScroll", 0),
                 " SCROLLBAR(%s/%s)" % (L.get("barW"), L.get("barH")) if vscroll else "",
                 "/".join(str(p) for p in L.get("plates", [])),
                 L.get("topbar"), L.get("header"), L.get("footer"),
                 (" H-OVERFLOW" if hscroll else "") + (" DIALOG(%s/%s)" % (L.get("cmOverflow"), L.get("cmSections")) if dialog_over else "")))
    return ("layout %dx%d" % size, ok, detail)


def run_eval(browser, src, a):
    """--eval: one functional page, the caller's script, its result on stdout."""
    if "</script" in src.lower():
        print("smoke: the eval script may not contain '</script'")
        return 2
    server, port = start_server()
    page = make_page("eval", a.hold, src)
    size = parse_sizes(a.size)[0] if a.size else (1440, 900)
    try:
        if a.shot:
            # a picture instead of a result: Chrome captures once load fires, i.e. once the script has finished
            out, why = run_browser(browser, "http://127.0.0.1:%d/%s" % (port, page.name), size, a.timeout, a.offline, shot=a.shot)
            print("smoke: screenshot failed: " + why if why else "smoke: screenshot written to " + a.shot)
            return 2 if why else 0
        res, why = read_result(run_browser(browser, "http://127.0.0.1:%d/%s" % (port, page.name),
                                           size, a.timeout, a.offline))
    finally:
        server.shutdown()
        if not a.keep:
            try:
                page.unlink()
            except OSError:
                pass
    if res is None:
        print("smoke: eval failed:", why, file=sys.stderr)
        return 2
    for e in res.get("errors") or []:
        print("smoke: page error:", e, file=sys.stderr)
    if res.get("evalError"):
        print("smoke: eval threw:", res["evalError"], file=sys.stderr)
    if not res.get("mapReady"):
        print("smoke: note: the map never loaded, so there are no links", file=sys.stderr)
    print("smoke: eval took %s ms" % res.get("evalMs"), file=sys.stderr)
    print(json.dumps(res.get("eval"), indent=1))
    if a.json:
        Path(a.json).write_text(json.dumps(res, indent=1), encoding="utf-8")
    return 1 if (res.get("evalError") or res.get("errors")) else 0


# ── main ────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="Strain smoke test")
    ap.add_argument("--sizes", default=DEFAULT_SIZES, help="layout matrix, WxH,WxH,...")
    ap.add_argument("--only", default="boot,sim,modals,text,world,layout",
                    help="comma list of checks to run (world = the review's checks in their own browser)")
    ap.add_argument("--browser", default=None, help="path to chrome/msedge")
    ap.add_argument("--hold", type=int, default=150000,
                    help="real ms the functional run may take before it is abandoned")
    ap.add_argument("--timeout", type=int, default=210, help="seconds per browser run")
    ap.add_argument("--jobs", type=int, default=2, help="parallel layout runs (more = slower starts)")
    ap.add_argument("--keep", action="store_true", help="keep the generated probe pages")
    ap.add_argument("--offline", action="store_true",
                    help="block every host but loopback (skips the topojson CDN fetch)")
    ap.add_argument("--json", default=None, help="write raw results to this file")
    ap.add_argument("--eval", default=None,
                    help="run this JS in the booted page (a function body: return a JSON value) and print it")
    ap.add_argument("--eval-file", default=None, help="like --eval, with the code read from a file")
    ap.add_argument("--size", default="1440x900", help="with --eval: the window size, WxH")
    ap.add_argument("--shot", default=None, help="with --eval: save a screenshot when the script has finished, instead of printing its result")
    a = ap.parse_args()

    try:
        sys.stdout.reconfigure(errors="replace")
    except AttributeError:
        pass

    browser = find_browser(a.browser)
    if not browser:
        print("smoke: no Chrome or Edge found; pass --browser <path>")
        return 2
    if a.eval or a.eval_file:
        return run_eval(browser, a.eval if a.eval else Path(a.eval_file).read_text(encoding="utf-8"), a)

    only = set(x.strip() for x in a.only.split(",") if x.strip())
    functional = bool(only & {"boot", "sim", "modals", "text"})
    world = "world" in only
    sizes = parse_sizes(a.sizes) if "layout" in only else []

    started = time.time()
    pages, raw, results, launch_failed = [], {}, [], False
    server, port = start_server()
    url_for = lambda path: "http://127.0.0.1:%d/%s" % (port, path.name)
    try:
        if functional:
            page = make_page("functional", a.hold); pages.append(page)
            res, why = read_result(run_browser(browser, url_for(page), (1440, 900),
                                               a.timeout, a.offline))
            if res is None:
                results.append(("functional run", False, why))
                launch_failed = True
            else:
                raw["functional"] = res
                results.extend(check_functional(res, only))

        if world:
            page = make_page("world", a.hold); pages.append(page)
            res, why = read_result(run_browser(browser, url_for(page), (1440, 900),
                                               a.timeout, a.offline))
            if res is None:
                results.append(("world run", False, why))
                launch_failed = True
            else:
                raw["world"] = res
                results.append(check_world(res))

        if sizes:
            page = make_page("layout", LAYOUT_HOLD); pages.append(page)
            url = url_for(page)
            def one(size):
                return size, read_result(run_browser(browser, url, size, a.timeout, a.offline))
            with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, a.jobs)) as ex:
                for size, (res, why) in ex.map(one, sizes):
                    if res is None:
                        results.append(("layout %dx%d" % size, False, why))
                        launch_failed = True
                        continue
                    raw["layout %dx%d" % size] = res
                    results.append(check_layout(size, res))
    finally:
        server.shutdown()
        if not a.keep:
            for p in pages:
                try:
                    p.unlink()
                except OSError:
                    pass

    for name, ok, detail in results:
        print("%s %-16s %s" % ("PASS" if ok else "FAIL", name, detail))
    failed = sum(1 for _, ok, _ in results if not ok)
    print("smoke: %d passed, %d failed (%.1f s)" % (len(results) - failed, failed, time.time() - started))
    if a.json:
        Path(a.json).write_text(json.dumps(raw, indent=1), encoding="utf-8")
        print("smoke: raw results written to", a.json)
    if launch_failed:
        return 2
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
