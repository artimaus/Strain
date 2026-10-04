/* ═══════════════════════════════════════════════════════════════
   Entity — wire: the calendar readout and the news panel
   Presentation only.  Keeps #calDisplay in the top bar current, and
   runs the wire on the map view: a collapsible column of dated,
   severity-coloured headlines from the world log, newest first, with
   a severity filter.  Clicking a headline pulses its country on the
   map when the map offers that, and opens its dialog otherwise.
   World-spanning events also toast.
   ═══════════════════════════════════════════════════════════════ */
(() => {
"use strict";
const { $, toast } = window.UI;
const W = window.WORLD;
const SHOW = 50;

/* ── Calendar ──────────────────────────────────────────────────── */
const cal = $("calDisplay");
function showDate() {
  if (!cal) return;
  cal.textContent = W.fmtDate(W.day);
  cal.title = "Day " + W.day;
}

/* ── Wire panel ────────────────────────────────────────────────── */
const panel = $("mapWire"), list = $("wireList"), view = $("mapView");
let filter = "all";
const RANK = { small: 0, large: 1, massive: 2 };
const passes = e => filter === "all" || RANK[e.sev] >= RANK[filter];
const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const row = e => `<div class="wire-row sev-${e.sev}" data-iso="${e.iso || ""}">`
  + `<span class="d">${W.fmtDate(e.d)}</span><span class="t">${esc(e.text)}</span></div>`;

function rebuild() {
  if (!list) return;
  list.innerHTML = W.WORLD_STATE.log.filter(passes).slice(-SHOW).reverse().map(row).join("");
}
function push(e) {
  if (!list || !passes(e)) return;
  list.insertAdjacentHTML("afterbegin", row(e));
  while (list.children.length > SHOW) list.lastElementChild.remove();
}
function setCollapsed(on) {
  if (!panel) return;
  panel.classList.toggle("collapsed", on);
  view.classList.toggle("wire-open", !on);
  $("wireToggle").textContent = on ? "‹" : "›";
  $("wireToggle").title = on ? "Show the wire" : "Collapse the wire";
}
if (panel) {
  panel.querySelectorAll(".wire-filters button").forEach(b => {
    b.onclick = () => {
      filter = b.dataset.filter;
      panel.querySelectorAll(".wire-filters button").forEach(x => x.classList.toggle("on", x === b));
      rebuild();
    };
  });
  $("wireToggle").onclick = () => setCollapsed(!panel.classList.contains("collapsed"));
  list.onclick = e => {
    const r = e.target.closest(".wire-row"), iso = r && r.dataset.iso;
    if (!iso) return;
    const map = W.worldMap;
    if (map && typeof map.pulse === "function") map.pulse(iso);
    else if (window.ENTITY && window.ENTITY.openCountryModal) window.ENTITY.openCountryModal(iso);
  };
  setCollapsed(innerWidth <= 700);
}

addEventListener("entity:day", showDate);
addEventListener("entity:world", () => { showDate(); rebuild(); });
addEventListener("entity:news", e => {
  push(e.detail);
  if (e.detail.sev === "massive") toast(`📰 <b>${esc(e.detail.text)}</b>`);
});
showDate();
rebuild();
})();
