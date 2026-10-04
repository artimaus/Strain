/* ═══════════════════════════════════════════════════════════════
   Entity — shared UI helpers
   Loaded after core and before every module that draws.  Each of
   these used to be re-implemented per file: three copies of $, two
   toasts, and a dozen hand-wired modal open/close/backdrop/Escape
   handlers that had drifted apart (some closed on Escape, some did
   not).  Now there is one of each.
   ═══════════════════════════════════════════════════════════════ */
(() => {
"use strict";
const $ = id => document.getElementById(id);

/* ── Toast: one element, one timer ─────────────────────────────── */
const toastEl = $("toast");
let toastTimer = 0;
function toast(html) {
  if (!toastEl) return;
  toastEl.innerHTML = html;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

/* ── Modals ─────────────────────────────────────────────────────
   Every overlay is a .modal.  Register it once and get back an
   open/close pair.  Dismissable modals close on a backdrop click and
   on Escape (topmost first); the offer and game-over dialogs are not
   dismissable because they gate the game until the player picks.
   onClose runs whenever the modal actually closes, whichever way. */
const stack = [];
function modal(id, { dismiss = true, onClose = null } = {}) {
  const el = $(id);
  const api = {
    el, dismiss,
    get isOpen() { return el.classList.contains("open"); },
    open() {
      el.classList.add("open");
      const i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1);
      stack.push(api);
    },
    close() {
      if (!el.classList.contains("open")) return;
      el.classList.remove("open");
      const i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1);
      if (onClose) onClose();
    },
  };
  if (dismiss) el.addEventListener("click", e => { if (e.target === el) api.close(); });
  return api;
}
/* Bubbling, not capture: uiAsk (below) owns Escape while a prompt is
   up and stops propagation before this runs. */
addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  for (let i = stack.length - 1; i >= 0; i--)
    if (stack[i].dismiss) { stack[i].close(); break; }
});

/* ── Keyboard ───────────────────────────────────────────────────
   Every global shortcut handler asks this first, so they cannot drift
   apart again: a key typed into a field is never a shortcut, and
   neither is a browser chord.  Escape deliberately skips this check -
   it should still cancel a placement or close a dialog while a field
   has focus. */
const hotkey = e => !e.target.closest("input, textarea, select, [contenteditable]")
  && !e.ctrlKey && !e.metaKey && !e.altKey;

/* ── Ask / alert / confirm ────────────────────────────────────────
   In-page replacements for window.alert/confirm.  Sandboxed iframes
   without allow-modals block the native dialogs: alert() silently does
   nothing and confirm() returns false without asking, which left every
   confirm-gated action dead.  Promise-based, so callers must await. */
function uiAsk(message, { confirm = false, okLabel = "OK" } = {}) {
  return new Promise(resolve => {
    const el = $("askModal"), ok = $("askOk"), cancel = $("askCancel");
    if (!el) { resolve(!confirm ? undefined : window.confirm(message)); return; }
    $("askText").textContent = message;
    ok.textContent = okLabel;
    cancel.style.display = confirm ? "" : "none";
    el.classList.add("open");
    const done = v => {
      el.classList.remove("open");
      ok.onclick = cancel.onclick = null;
      removeEventListener("keydown", onKey, true);
      el.onclick = null;
      resolve(v);
    };
    const onKey = e => {
      if (e.key === "Escape") { e.stopPropagation(); done(false); }
      else if (e.key === "Enter") { e.stopPropagation(); done(true); }
    };
    ok.onclick = () => done(true);
    cancel.onclick = () => done(false);
    el.onclick = e => { if (e.target === el) done(false); };
    addEventListener("keydown", onKey, true);
    ok.focus();
  });
}
const uiAlert   = msg => uiAsk(msg);
const uiConfirm = msg => uiAsk(msg, { confirm: true });
window.uiAlert = uiAlert; window.uiConfirm = uiConfirm;   // progression.js reaches them bare

/* ── Formatting used by more than one module ───────────────────── */
const rgb        = c => `rgb(${c[0]|0},${c[1]|0},${c[2]|0})`;
const dietNames  = mask => C.SUB.filter((_, q) => mask & (1 << q)).map(x => x.name).join(", ");
const traitNames = traits => Object.entries(traits).filter(([, v]) => v).map(([k]) => k).join(", ");

window.UI = { $, toast, modal, hotkey, uiAsk, uiAlert, uiConfirm, rgb, dietNames, traitNames };
})();
