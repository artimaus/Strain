#!/usr/bin/env python3
"""Smoke test for Strain.

Boots Strain.html in headless Chrome (or Edge) and checks, without a human:

  boot    no window errors; UI / C / ENTITY present; stylesheet applied
  sim     all five plates report a population (the worker path works)
  modals  one check, every boolean flag the probe records must hold:
            dialogs open by real clicks and close on Escape / backdrop /
            toggle; the config panel lists its rows; the region and country
            cards open and close; the calendar follows WORLD.advanceDays; the
            save field codes are unique; the profile sheet and a tune lever
            reach the plates; the world clock runs (ENTITY_CLOCK, dayMs);
            links  once the map has loaded: land / sea / air links all
                   present, FR-DE and US-CA share a border, IT-VA a land link,
                   sea lanes carry a capacity (no NaN), CN-IN is cut by the
                   mountains; a deployment colours its country (lv1..lv4) and
                   a reset clears it; the population layer sets inline fills
                   and shows #mapGrad, coverage hides it; the pulse class lands
            saveLoad  through progression.js (Save, Load + its confirm): day,
                   seed and FR's coverage come back after a new world; a v4
                   save lays its coverage over a fresh world and keeps the
                   player's money
  text    no "U0001f" (a bad string escape once rendered as literal text)
  layout  across window sizes: layout mode, no scrollbar in the bench (not
          even an idle one: classic scrollbars take room), no horizontal
          overflow, plate sizes

Usage
  python tools/smoke.py                       everything
  python tools/smoke.py --only layout --sizes 1280x720,1100x600
  python tools/smoke.py --json before.json    keep the raw results to diff
  python tools/smoke.py --eval-file probe.js  run a script in the booted page
                                              (a function body; `return` a JSON
                                              value; it waits for the map first)
  python tools/smoke.py --eval-file tools/probes/tap.js
                                              the one probe: a real pointer
                                              sequence on the map, which must
                                              open the country card
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
    // The region and country cards (js/worldui.js) need no map data to open.
    try {
      window.ENTITY.openRegionModal("europe");
      m.regionOpen = isOpen("mapRegionModal") && $("regBody").innerHTML.trim().length > 0;
      esc();                          m.regionClose = !isOpen("mapRegionModal");
    } catch (e) { m.regionOpen = false; m.regionError = String(e); }
    try {
      window.ENTITY.openCountryModal("FR");
      m.countryOpen = isOpen("countryModal") && $("cmName").textContent.trim().length > 0 && !!$("cmDeploy");
      esc();                          m.countryClose = !isOpen("countryModal");
    } catch (e) { m.countryOpen = false; m.countryError = String(e); }
    // The world clock and the save field tables (js/world.js); wire.js keeps
    // #calDisplay current from WORLD.day.
    try {
      var W = window.WORLD, day0 = W.day, cal0 = $("calDisplay").textContent;
      W.advanceDays(40);
      m.calendarAdvance = W.day === day0 + 40 && $("calDisplay").textContent !== cal0;
      var codes = function (t) { var seen = {}, dup = 0; t.forEach(function (f) { if (seen[f[1]]) dup++; seen[f[1]] = 1; }); return dup; };
      m.fieldCodesUnique = codes(W.COUNTRY_FIELDS) === 0 && codes(W.WORLD_FIELDS) === 0;
    } catch (e) { m.calendarAdvance = false; m.worldError = String(e); }
    r.modals = m;
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
          // the link graph (js/links.js): every type present, borders and a micro-state read off the map,
          // sea lanes with a capacity, and a mountain range that shortens a land link
          r.modals.linkCounts = L.count("land") > 0 && L.count("sea") > 0 && L.count("air") > 0;
          r.modals.linkInfo = L.count("land") + "/" + L.count("sea") + "/" + L.count("air") + " of " + L.edges.length;
          r.modals.bordersDerived = !!L.linkedBy("FR", "DE", "land") && !!L.linkedBy("US", "CA", "land");
          r.modals.microLand = !!L.linkedBy("AD", "FR", "land");
          r.modals.coastalCap = L.edges.some(function (e) { return e.type === "sea" && e.cap > 0; })
                                && !L.edges.some(function (e) { return isNaN(e.cap); });
          r.modals.mountainRange = L.rangeOf("CN", "IN") < 1;
          // the map (js/worldmap.js, js/worldui.js): a deployment colours its country under the coverage layer
          // and a reset clears it, the population layer sets inline shades and shows the ramp, the pulse class lands
          try {
            var H = W.worldMap, country = function (iso) { return [].slice.call(document.querySelectorAll('#mapSvg .country[data-iso="' + iso + '"]')); };
            var banded = function (p) { return ["lv1", "lv2", "lv3", "lv4"].some(function (k) { return p.classList.contains(k); }); };
            var fr = W.ensureCountry("FR"); fr.covered = true; fr.coverageLevel = 0.3; W.syncMapColors();
            var marked = country("FR").length > 0 && country("FR").some(banded);
            W.resetCountries(); W.syncMapColors();
            r.modals.deployMarks = marked && !country("FR").some(banded) && W.anyCovered() === false;
            var inlineFills = function () { return [].filter.call(document.querySelectorAll("#mapSvg .country"), function (p) { return p.style.fill; }).length; };
            $("mapLegend").querySelector('[data-layer="population"]').click();
            var popOK = !$("mapGrad").hidden && inlineFills() > 0;
            $("mapLegend").querySelector('[data-layer="coverage"]').click();
            r.modals.layerToggle = popOK && $("mapGrad").hidden;
            var frEl = country("FR")[0];
            H.pulse("FR"); r.modals.pulseClass = !!frEl && frEl.classList.contains("pulse");
          } catch (e) { r.modals.layerToggle = false; r.modals.mapUiError = String(e); }
          done(); return;
        }
        if (++tries > 20) { r.modals.bordersDerived = null; r.modals.linkCounts = null; done(); return; }
        setTimeout(poll, 250);
      } catch (e) { r.modals.bordersDerived = false; r.modals.linksError = String(e); done(); }
    })();
  }
  // Save and load through progression.js itself (Save button, Load button + its
  // confirm dialog), then a v4-shaped save to prove the migration path.
  function saveLoad(done) {
    at("saveLoad");
    try {
      var W = window.WORLD, fr = W.ensureCountry("FR");
      fr.covered = true; fr.coverageLevel = 0.42; W.advanceDays(12);
      var day0 = W.day, seed0 = W.seed;
      $("saveBtn").click();
      W.newWorld();
      var cleared = W.day === 0 && W.anyCovered() === false;
      $("loadBtn").click();
      setTimeout(function () {
        var ok = $("askOk"); if (ok) ok.click();
        setTimeout(function () {
          var fr1 = W.COUNTRY_STATE.FR;
          r.modals.saveLoadRestores = cleared && W.day === day0 && W.seed === seed0 && !!fr1 && fr1.covered === true
                                      && Math.abs(fr1.coverageLevel - 0.42) < 1e-9;
          r.modals.saveLoadInfo = { cleared: cleared, day: [day0, W.day], seed: [seed0, W.seed], ok: !!ok,
                                    fr: fr1 ? { covered: fr1.covered, lv: fr1.coverageLevel } : null };
          // an older save (v 2..7) carries no world: its coverage is laid over a fresh one
          var v4 = { v: 4, t: 0, player: { money: 123, scrutiny: 0, job: 0, maxVariants: 8, variants: [], salary: 120, scrutinyFloor: 16,
                     promoStreak: 0, lateralStreak: 0, notoriety: 0, careerHistory: [] },
                     countries: { FR: { c: 1, lv: 0.2 } }, bounties: [null, null, null] };
          localStorage.setItem("entity_save_v3", JSON.stringify(v4));
          $("loadBtn").click();
          setTimeout(function () {
            var ok2 = $("askOk"); if (ok2) ok2.click();
            setTimeout(function () {
              var fr4 = W.COUNTRY_STATE.FR, money = window.ENTITY.player.money;
              // money is 123 from the save plus whatever the bench paid in the meantime: the income tick runs on real time
              r.modals.oldSaveLays = !!fr4 && fr4.covered === true && Math.abs(fr4.coverageLevel - 0.2) < 1e-9
                                     && money >= 123 && money < 223;
              r.modals.oldSaveInfo = { day: W.day, money: money, ok2: !!ok2,
                                       fr: fr4 ? { covered: fr4.covered, lv: fr4.coverageLevel } : null };
              localStorage.removeItem("entity_save_v3");
              done();
            }, 150);
          }, 50);
        }, 150);
      }, 50);
    } catch (e) { r.modals.saveLoadRestores = false; r.modals.saveLoadError = String(e); done(); }
  }
  // Phase 0 foundations (docs/design.md §10): the pillar registry and its
  // order, the ledger and its history, per-pillar random streams, pillar
  // fields in the save.  Two test pillars are registered and removed again.
  function foundations(done) {
    at("foundations");
    try {
      var W = window.WORLD, ran = [], draws = [];
      // the test pillars take the empty health and relations slots; the real economy and trade keep theirs
      var health = { name: "health", label: "Test health", fields: [["tz", "tz", 0]],
        daily: function (iso, rng, L) { if (iso === "FR") { ran.push("health"); draws.push(rng()); L.add("health", "health.x", "x", W.day, "u"); } },
        rows: function (iso, L) { return [["x", L.get("health.x")]]; } };
      var rel = { name: "weather", label: "Test weather",
        daily: function (iso, rng, L) { if (iso === "FR") ran.push("weather"); } };
      W.registerPillar(rel); W.registerPillar(health);
      var fr = W.ensureCountry("FR");
      r.modals.pillarFields = fr.tz === 0 && W.COUNTRY_FIELDS.some(function (f) { return f[0] === "tz"; });
      W.newWorld(4242); W.advanceDays(3);
      r.modals.pillarOrder = ran.join(",") === "weather,health,weather,health,weather,health";
      var L = W.ledgerOf("FR");
      r.modals.ledgerToday = L.day === W.day && L.get("health.x") === W.day && L.of("health").length === 1 && W.ledgerOf("DE").get("health.x") === 0;
      var d1 = draws.slice(); ran = []; draws = [];
      W.newWorld(4242); W.advanceDays(3);
      r.modals.rngRepeatable = d1.length === 3 && d1.every(function (v, i) { return v === draws[i] && v >= 0 && v < 1; });
      W.newWorld(4343); W.advanceDays(3);
      r.modals.rngSeeded = !d1.every(function (v, i) { return v === draws[3 + i]; });
      W.advanceDays(100);
      var h = W.history("FR", "health.x");
      r.modals.historyRing = h.length === W.HISTORY_DAYS && h[h.length - 1] === W.day && h[0] === W.day - W.HISTORY_DAYS + 1;
      // the card: a section per pillar that offers rows, its open state remembered
      window.ENTITY.openCountryModal("FR");
      var det = $("cmBody").querySelector('details.pillar[data-pillar="health"]');
      r.modals.cardSections = !!det && det.querySelector(".row") !== null && !$("cmBody").querySelector('details.pillar[data-pillar="weather"]');
      esc();
      // the save: a pillar field rides in the pack table, version 9
      fr = W.ensureCountry("FR"); fr.tz = 5;
      $("saveBtn").click();
      var saved = JSON.parse(localStorage.getItem("entity_save_v3") || "null");
      r.modals.saveV9 = !!saved && saved.v === 9 && saved.countries.FR.tz === 5;
      W.newWorld();
      var fr0 = W.ensureCountry("FR").tz;
      $("loadBtn").click();
      setTimeout(function () {
        var ok = $("askOk"); if (ok) ok.click();
        setTimeout(function () {
          r.modals.pillarFieldLoads = fr0 === 0 && W.ensureCountry("FR").tz === 5;
          localStorage.removeItem("entity_save_v3");
          W.unregisterPillar("health"); W.unregisterPillar("weather");
          W.newWorld();
          done();
        }, 150);
      }, 50);
    } catch (e) { r.modals.pillarOrder = false; r.modals.foundationsError = String(e); done(); }
  }
  // Phase 2: the trade pillar (docs/nations.md §2): goods move along the
  // links at a world price, deals form, people move, and it all shows.
  function trade(done) {
    at("trade");
    try {
      var W = window.WORLD;
      r.modals.tradeRegistered = !!window.TRADE && W.pillarList().some(function (p) { return p.name === "trade"; }) && Array.isArray(W.WORLD_STATE.prices);
      W.newWorld(9001); W.advanceDays(75);
      var sg = W.ledgerOf("SG"), LW = W.worldLedger();
      r.modals.tradeFeeds = sg.get("trade.bought.food") > 0 && W.COUNTRY_STATE.SG._importShare > 0;
      r.modals.tradeMoves = LW.get("trade.traded") > 0 && Object.keys(W.COUNTRY_STATE).some(function (iso) { return W.ledgerOf(iso).get("trade.export.food") > 0 || W.ledgerOf(iso).get("trade.export.energy") > 0 || W.ledgerOf(iso).get("trade.export.materials") > 0; });
      r.modals.tradeDeals = LW.get("trade.deals") > 0 && Object.keys(W.COUNTRY_STATE).some(function (iso) { return W.COUNTRY_STATE[iso].deals.length > 0; });
      r.modals.tradePrices = W.WORLD_STATE.prices.every(function (p) { return p > 0 && isFinite(p); }) && W.history("", "trade.price.food").length > 60;
      r.modals.tradePeople = LW.get("trade.migrants") > 0;
      r.modals.tradeCensus = typeof W.censusOf("SG").imports === "number" && typeof W.censusWorld().priceFood === "number";
      var p1 = W.WORLD_STATE.prices.slice(); W.newWorld(9001); W.advanceDays(75);
      r.modals.tradeRepeats = W.WORLD_STATE.prices.every(function (p, i) { return p === p1[i]; });
      var tb = document.querySelector('#mapLegend .layers button[data-layer="trade"]');
      r.modals.tradeLayer = !!tb;
      window.ENTITY.openCountryModal("SG");
      var det = $("cmBody").querySelector('details.pillar[data-pillar="trade"]');
      r.modals.tradeCard = !!det && det.querySelectorAll(".row").length >= 2;
      esc();
      r.modals.tradeWire = W.WORLD_STATE.log.some(function (e) { return e.kind === "trade"; });
      // a deal rides in the save
      $("saveBtn").click();
      var saved = JSON.parse(localStorage.getItem("entity_save_v3") || "null");
      r.modals.tradeSaves = !!saved && Array.isArray(saved.world.pri) && Object.keys(saved.countries).some(function (iso) { return saved.countries[iso].dl && saved.countries[iso].dl.length; });
      localStorage.removeItem("entity_save_v3");
      W.newWorld();
      done();
    } catch (e) { r.modals.tradeFeeds = false; r.modals.tradeError = String(e); done(); }
  }
  // Phase 1: the economy pillar (docs/nations.md §1) runs, feeds, repeats
  // on a seed, shows on the card, the map and the wire, and reaches the
  // census and the config.
  function economy(done) {
    at("economy");
    try {
      var W = window.WORLD;
      r.modals.economyRegistered = !!window.ECONOMY && W.pillarList().some(function (p) { return p.name === "economy"; });
      W.newWorld(9001); W.advanceDays(45);
      var fr = W.COUNTRY_STATE.FR, L = W.ledgerOf("FR");
      r.modals.economyRuns = !!fr && fr.pop > 60 && L.get("economy.income") > 0 && L.get("economy.captured.food") > 0 && fr.ceil[0] > 0 && fr.tech > 0;
      var sg = W.COUNTRY_STATE.SG, sgAid = W.history("SG", "relations.aid.received", 45).reduce(function (t, v) { return t + v; }, 0);
      // no reserves: starves, or lives on its neighbours' aid and loans once relations run
      r.modals.economyFeeds = L.get("economy.famine") === 0 && (W.ledgerOf("SG").get("economy.famine") > 0 || (sg.debts && sg.debts.length > 0) || sgAid > 0);
      r.modals.economyReasons = typeof fr.reason === "string" && fr.reason.length > 0 && L.of("economy").some(function (l) { return l.reason; });
      r.modals.economyCensus = typeof W.censusOf("FR").tech === "number" && typeof W.censusWorld().famineNations === "number";
      var t1 = fr.treasury, p1 = fr.pop;
      W.newWorld(9001); W.advanceDays(45);
      r.modals.economyRepeats = W.COUNTRY_STATE.FR.treasury === t1 && W.COUNTRY_STATE.FR.pop === p1;
      r.modals.economyConfig = typeof window.ENTITY_CONFIG.capturePerWorker === "number";
      var eb = document.querySelector('#mapLegend .layers button[data-layer="economy"]'), tb = document.querySelector('#mapLegend .layers button[data-layer="technology"]');
      r.modals.economyLayers = !!eb && !!tb && !!document.querySelector('#mapLegend .layers button[data-layer="strain"]');
      if (tb) {
        tb.click();
        r.modals.economyLayerPaints = !$("mapGrad").hidden && [].some.call(document.querySelectorAll("#mapSvg .country"), function (p) { return p.style.fill; });
        document.querySelector('#mapLegend .layers button[data-layer="coverage"]').click();
      }
      window.ENTITY.openCountryModal("FR");
      var det = $("cmBody").querySelector('details.pillar[data-pillar="economy"]');
      r.modals.economyCard = !!det && det.querySelectorAll(".row").length >= 8;
      esc();
      r.modals.economyWire = W.WORLD_STATE.log.some(function (e) { return e.kind === "economy"; });
      W.newWorld();
      done();
    } catch (e) { r.modals.economyRuns = false; r.modals.economyError = String(e); done(); }
  }
  // Phase 3: the products pillar (docs/nations.md §3): military and health
  // as levels with embodied values, built and decaying by named lines.
  function products(done) {
    at("products");
    try {
      var W = window.WORLD;
      r.modals.productsRegistered = !!window.PRODUCTS && W.pillarList().some(function (p) { return p.name === "products"; });
      W.newWorld(9001); W.advanceDays(60);
      var fr = W.COUNTRY_STATE.FR, L = W.ledgerOf("FR");
      r.modals.productsRun = !!fr && fr.mil > 0 && fr.hea > 0 && fr.milT > 0 && fr.milP > 0 && L.get("products.mil.level") === fr.mil;
      r.modals.productsHealth = fr._deathMul > 0 && fr._deathMul < 1 && fr._birthMul > 1 && L.get("economy.deaths") > 0;
      r.modals.productsBudget = L.get("economy.spend.military") >= 0 && typeof fr.shares.health === "number" && typeof fr.shares.military === "number";
      r.modals.productsCensus = typeof W.censusOf("FR").mil === "number" && typeof W.censusWorld().heaMean === "number";
      r.modals.productsConfig = typeof window.ENTITY_CONFIG.milCostDays === "number";
      var m1 = fr.mil, h1 = fr.hea; W.newWorld(9001); W.advanceDays(60);
      r.modals.productsRepeat = W.COUNTRY_STATE.FR.mil === m1 && W.COUNTRY_STATE.FR.hea === h1;
      r.modals.productsLayers = !!document.querySelector('#mapLegend .layers button[data-layer="military"]') && !!document.querySelector('#mapLegend .layers button[data-layer="health"]');
      window.ENTITY.openCountryModal("FR");
      var det = $("cmBody").querySelector('details.pillar[data-pillar="products"]');
      r.modals.productsCard = !!det && det.querySelectorAll(".row").length >= 3;
      esc();
      $("saveBtn").click();
      var saved = JSON.parse(localStorage.getItem("entity_save_v3") || "null");
      r.modals.productsSave = !!saved && typeof saved.countries.FR.mil === "number" && typeof saved.countries.FR.mlt === "number";
      localStorage.removeItem("entity_save_v3");
      W.newWorld();
      done();
    } catch (e) { r.modals.productsRun = false; r.modals.productsError = String(e); done(); }
  }
  // Phase 5: the relations pillar (docs/nations.md §5): views with a
  // baseline and fading stocks, pacts, aid, loans, and trade that reads them.
  function relations(done) {
    at("relations");
    try {
      var W = window.WORLD, R = window.RELATIONS;
      r.modals.relationsRegistered = !!R && W.pillarList().some(function (p) { return p.name === "relations"; });
      var news = 0, onNews = function (e) { if (e.detail.kind === "relations") news++; };
      addEventListener("entity:news", onNews);
      W.newWorld(9001); W.advanceDays(200);
      removeEventListener("entity:news", onNews);
      var fr = W.COUNTRY_STATE.FR;
      r.modals.relationsViews = typeof R.viewOf("FR", "DE") === "number" && R.viewOf("FR", "DE") > R.viewOf("FR", "CN") && typeof fr.temper === "number";
      r.modals.relationsMoves = Object.keys(W.COUNTRY_STATE).some(function (iso) { var v = W.COUNTRY_STATE[iso].views; return v && Object.keys(v).length > 0; });
      var LW = W.worldLedger();
      r.modals.relationsPacts = LW.get("relations.pacts") > 0;
      r.modals.relationsAidOrLoans = Object.keys(W.COUNTRY_STATE).some(function (iso) { var L = W.ledgerOf(iso); return L.get("relations.aid.received") > 0 || L.get("relations.borrowed") > 0; });
      r.modals.relationsCensus = typeof W.censusOf("FR").allies === "number" && typeof W.censusWorld().pacts === "number";
      var p1 = R.viewOf("FR", "DE"); W.newWorld(9001); W.advanceDays(200);
      r.modals.relationsRepeat = R.viewOf("FR", "DE") === p1;
      r.modals.relationsLayer = !!document.querySelector('#mapLegend .layers button[data-layer="relations"]');
      window.ENTITY.openCountryModal("FR");
      var det = $("cmBody").querySelector('details.pillar[data-pillar="relations"]');
      r.modals.relationsCard = !!det && det.querySelectorAll(".row").length >= 3;
      esc();
      r.modals.relationsWire = news > 0;
      $("saveBtn").click();
      var saved = JSON.parse(localStorage.getItem("entity_save_v3") || "null");
      r.modals.relationsSave = !!saved && Array.isArray(saved.countries.FR.pct) && typeof saved.countries.FR.vw === "object";
      localStorage.removeItem("entity_save_v3");
      W.newWorld();
      done();
    } catch (e) { r.modals.relationsViews = false; r.modals.relationsError = String(e); done(); }
  }
  // Phase 6: the war pillar (docs/nations.md §6): the army, a declared war
  // that is fought and ends at the peace table, wars of the world's own.
  function war(done) {
    at("war");
    try {
      var W = window.WORLD, WAR = window.WAR;
      r.modals.warRegistered = !!WAR && W.pillarList().some(function (p) { return p.name === "war"; });
      var news = 0, onNews = function (e) { if (e.detail.kind === "war") news++; };
      addEventListener("entity:news", onNews);
      W.newWorld(9001); W.advanceDays(60);
      var fr = W.COUNTRY_STATE.FR, be = W.COUNTRY_STATE.BE;
      r.modals.warArmy = fr.soldiers > 0 && fr.soldiers <= 0.02 * fr.pop + 1e-9 && W.ledgerOf("FR").get("war.wages") > 0 && W.ledgerOf("FR").get("economy.workArmy") > 0;
      var w = WAR.declare("FR", "BE", 0, "the smoke test");
      r.modals.warDeclared = !!w && fr.atWar && be.atWar && W.WORLD_STATE.wars.length === 1 && !fr.deals.some(function (d) { return d.from === "BE"; });
      W.advanceDays(3);
      r.modals.warFought = W.ledgerOf("FR").get("war.lost") > 0 && W.ledgerOf("BE").get("war.killed") > 0 && fr._refuses.has("BE") && be.weary > 0 && typeof w.pos === "number";
      var ended = false; for (var i = 0; i < 400 && !ended; i++) { W.advanceDays(1); ended = W.WORLD_STATE.wars.indexOf(w) < 0; }   // other wars may start meanwhile
      r.modals.warEnds = ended && !WAR.enemiesOf("FR").has("BE") && W.WORLD_STATE.peaces >= 1;
      r.modals.warTerms = W.WORLD_STATE.tributes.some(function (t) { return t.from === "BE" && t.to === "FR" && t.r === 0 && t.share > 0; });
      removeEventListener("entity:news", onNews);
      r.modals.warWire = news >= 2;
      W.newWorld(9001); W.advanceDays(150);                       // the first season is a warm-up; the hawks move on day 90
      r.modals.warNatural = W.WORLD_STATE.warsStarted > 0 && W.WORLD_STATE.log.some(function (e) { return e.kind === "war" && /attacks/.test(e.text); });
      r.modals.warCensus = typeof W.censusOf("FR").soldiers === "number" && typeof W.censusWorld().warsStarted === "number";
      r.modals.warLayer = !!document.querySelector('#mapLegend .layers button[data-layer="war"]');
      window.ENTITY.openCountryModal("FR");
      var det = $("cmBody").querySelector('details.pillar[data-pillar="war"]');
      r.modals.warCard = !!det && det.querySelectorAll(".row").length >= 1;
      esc();
      $("saveBtn").click();
      var saved = JSON.parse(localStorage.getItem("entity_save_v3") || "null");
      r.modals.warSave = !!saved && typeof saved.countries.FR.sol === "number" && Array.isArray(saved.world.wrs) && Array.isArray(saved.world.trb);
      localStorage.removeItem("entity_save_v3");
      W.newWorld();
      done();
    } catch (e) { r.modals.warRegistered = false; r.modals.warError = String(e); done(); }
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
    boot(); layout();
    sim(function () { modals(); text(); clock(function () { links(function () { foundations(function () { economy(function () { trade(function () { products(function () { relations(function () { war(function () { saveLoad(finish); }); }); }); }); }); }); }); }); });
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
    ok = (not vscroll or gave_up) and not hscroll
    detail = ("%dx%d -> viewport %dx%d %s bench=%d/%d%s plates=%s chrome=%s+%s+%s%s"
              % (size[0], size[1], vw, vh,
                 {"grid": "grid", "one": "one-plate", "floor": "one-plate(floor)"}.get(L.get("fit"), "?"),
                 L.get("benchClient", 0), L.get("benchScroll", 0),
                 " SCROLLBAR(%s/%s)" % (L.get("barW"), L.get("barH")) if vscroll else "",
                 "/".join(str(p) for p in L.get("plates", [])),
                 L.get("topbar"), L.get("header"), L.get("footer"),
                 " H-OVERFLOW" if hscroll else ""))
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
    ap.add_argument("--only", default="boot,sim,modals,text,layout",
                    help="comma list of checks to run: boot, sim, modals, text, layout "
                         "(the link-graph and save/load flags are part of modals)")
    ap.add_argument("--browser", default=None, help="path to chrome/msedge")
    ap.add_argument("--hold", type=int, default=240000,
                    help="real ms the functional run may take before it is abandoned")
    ap.add_argument("--timeout", type=int, default=300, help="seconds per browser run")
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
