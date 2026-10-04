/* ═══════════════════════════════════════════════════════════════
   Entity — layout
   Three jobs, all about keeping the bench free of scrollbars.
   1. Footer reserve: pin the footer to its worst-case height so a
      longer tile readout never changes the room the bench has.
   2. Bench fit: solve for the grid width that lands the plates
      exactly inside that room.
   3. Layout mode: when the five-plate grid would need plates too
      small to fit, switch to the single-plate layout (body.narrow:
      tabs + one plate) and fit that instead.  Narrow is also forced
      at phone widths, as the old media query did.
   ═══════════════════════════════════════════════════════════════ */

/* ── Footer reserve ─────────────────────────────────────────────
   The tile readout grows a line when you hover an entity (and another
   for a tenant).  That used to change the footer's height, which
   changed the bench's height, which refitted every plate — a visible
   flicker on hover in and out.  So the footer is measured once against
   a worst-case readout and pinned there: the content changes, the
   layout never does. */
(() => {
  const footer = document.querySelector("footer");
  const tile   = document.getElementById("tile");
  if (!footer || !tile) return;

  // Longest shape paintTile() can produce: medium + entity + tenant + location.
  const SAMPLE =
    `<span>medium <b>r1 0.000</b> <b>r2 0.000</b> <b>r3 0.000</b> <b>r4 0.000</b> <b>r5 0.000</b></span>` +
    `<span>entity <b>Network</b> · Type A · e <b>0.000</b> · age <b>9999</b> · <i>dormant</i></span>` +
    `<span>tenant <b>Network</b> · Type A · e <b>0.000</b> · age <b>9999</b></span>` +
    `<span><i>plate A · tile 000,000 · tick 999,999</i></span>`;

  let reserve = 0, lastW = -1, queued = false;

  const pin = h => {
    h = Math.ceil(h);
    if (h <= reserve) return;
    reserve = h;
    footer.style.setProperty("--footH", h + "px");
  };

  function probe() {
    lastW = footer.clientWidth;
    reserve = 0;
    const html = tile.innerHTML;
    footer.style.setProperty("--footH", "auto");
    tile.innerHTML = SAMPLE;
    const worst = footer.offsetHeight;      // height with the fullest readout
    tile.innerHTML = html;
    pin(Math.max(worst, footer.offsetHeight));
  }

  // Safety net: if some readout ever runs longer than the sample, grow once.
  const check = () => {
    queued = false;
    if (footer.scrollHeight > reserve) pin(footer.scrollHeight);
  };
  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(check); } };
  new MutationObserver(schedule)
    .observe(tile, { childList: true, subtree: true, characterData: true });

  const hint = document.getElementById("hint");
  if (hint) new MutationObserver(schedule)
    .observe(hint, { childList: true, subtree: true, characterData: true });

  // Wrapping depends on width, so re-measure when the width actually changes.
  if (window.ResizeObserver)
    new ResizeObserver(() => { if (footer.clientWidth !== lastW) probe(); }).observe(footer);
  addEventListener("resize", () => { if (footer.clientWidth !== lastW) probe(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(probe);

  probe();
})();

/* ── Bench fit + layout mode ────────────────────────────────────
   The grid's height is linear in its width, so two probes give the
   width that exactly fills the available height.  If that width would
   make the small plates smaller than about 90px, the grid is not worth
   showing: switch to body.narrow (plate tabs + one plate) and fit that
   instead.  The decision is always taken from the desktop measurement,
   so it is a pure function of the viewport and cannot oscillate.     */
(() => {
  const bench = document.getElementById("bench");
  const left  = document.getElementById("left");
  if (!bench || !left) return;
  const body = document.body;

  const NARROW_W     = 700;   // at or below this width the single-plate layout is unconditional
  const DESK_MIN_W   = 330;   // narrowest grid worth showing: small plates ≈ 90px, large ≈ 145px
  const NARROW_MIN_W = 120;   // narrowest single plate before we give up and let it scroll
  const SAFETY       = 2;     // px of slack against subpixel rounding

  let queued = false, lastKey = "";

  const setW = w => { bench.style.setProperty("--benchW", w + "px"); return bench.scrollHeight; };
  const setMode = narrow => body.classList.toggle("narrow", narrow);

  /* Widest bench (≤ maxW, ≥ floorW) whose grid fits in avail. */
  function solve(maxW, floorW, avail) {
    floorW = Math.min(floorW, maxW);
    const target = avail - SAFETY;
    const h1 = setW(maxW);
    if (h1 <= target) return maxW;                    // full width already fits

    const probe = Math.max(floorW, maxW * 0.5);
    const h2 = setW(probe);
    const slope = probe < maxW ? (h1 - h2) / (maxW - probe) : 0;   // px of height per px of width
    let w = slope > 0 ? maxW - (h1 - target) / slope : floorW;
    w = Math.max(floorW, Math.min(maxW, Math.floor(w)));
    setW(w);

    // Correct for rounding / fractional line boxes.
    for (let i = 0; i < 4 && bench.scrollHeight > avail && w > floorW; i++) {
      const over = bench.scrollHeight - target;
      w = Math.max(floorW, Math.floor(w - Math.max(1, slope > 0 ? over / slope : over)));
      setW(w);
    }
    return w;
  }

  /* A scrollbar is taking room (classic bars do, overlay ones never). */
  const hasBar = () => bench.offsetWidth > bench.clientWidth || bench.offsetHeight > bench.clientHeight;

  function fit() {
    queued = false;
    const maxW = left.clientWidth;
    if (maxW < 40) return;                            // hidden / not laid out yet
    const key = innerWidth + "x" + innerHeight;
    if (key === lastKey && bench.scrollHeight <= bench.clientHeight && !hasBar()) return;   // already fitted
    lastKey = key;

    // Measure with scrollbars out of the picture.  A classic (Windows)
    // scrollbar narrows the content while the grid overflows, so heights
    // probed through it belong to a narrower grid; land the fit a few px
    // short and the bar stays behind, idle, once the grid fits.  Hidden
    // overflow gives the geometry the fitted bench will actually have.
    let mode = "one";
    bench.style.overflow = "hidden";
    try {
      if (innerWidth > NARROW_W) {
        // Try the grid first.  Its own chrome (full header) is what sets the room.
        setMode(false);
        const avail = bench.clientHeight;
        solve(maxW, DESK_MIN_W, avail);
        if (bench.scrollHeight <= avail) { mode = "grid"; return; }   // fits at a usable size
      }
      // Too short for the grid (or a phone): one plate at a time.
      setMode(true);
      const avail = bench.clientHeight;
      solve(left.clientWidth, NARROW_MIN_W, avail);
      if (bench.scrollHeight > avail) mode = "floor"; // even the smallest plate is too tall: it scrolls
    } finally {
      bench.style.overflow = "";                      // back to the stylesheet's auto
      bench.dataset.fit = mode;                       // grid | one | floor, for tests and CSS
    }
  }

  const schedule  = () => { if (!queued) { queued = true; requestAnimationFrame(fit); } };
  const remeasure = () => { lastKey = ""; schedule(); };

  // Phones get the narrow layout before first paint, not a frame later.
  setMode(innerWidth <= NARROW_W);

  if (window.ResizeObserver) {
    const ro = new ResizeObserver(schedule);
    ro.observe(left);
    const f = document.querySelector("footer");
    if (f) ro.observe(f);                             // footer text wraps → less room
  }
  addEventListener("resize", remeasure);
  addEventListener("orientationchange", remeasure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);

  // Re-fit when returning to the bench from the map, however that happens
  // (button, Back, or the B key): shell.js's switchView announces it.
  addEventListener("entity:view", e => { if (e.detail && e.detail.view === "bench") remeasure(); });

  remeasure();
  addEventListener("load", remeasure);
})();
