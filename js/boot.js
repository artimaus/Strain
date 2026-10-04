/* Progress logging. Off by default so the console stays quiet; set
   window.ENTITY_DEBUG = true (or flip this line) to get the startup
   trace back. Warnings and errors are NOT gated - real failures still
   surface. */
window.ENTITY_DEBUG = false;
window.dbg = (...a) => { if (window.ENTITY_DEBUG) console.log(...a); };

/* Preload topojson: jsDelivr first, then two fallback CDNs.
   Each attempt times out at 15s; resolves to null on failure so the map module
   can show a visible error rather than hanging.

   NOTE: do NOT pass an AbortSignal to fetch(). In sandboxed frames the
   fetch is proxied to the parent via postMessage, and an AbortSignal is
   not structured-cloneable, so the call fails before it hits the network
   ("AbortSignal object could not be cloned"). Race a timer instead. */
window.ENTITY_TOPO = (async () => {
  const URLS = [
    "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json",
    "https://unpkg.com/world-atlas@2.0.2/countries-110m.json",
    "https://cdn.skypack.dev/world-atlas@2.0.2/countries-110m.json"
  ];
  const withTimeout = (p, ms) => Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout after " + ms + "ms")), ms))
  ]);
  for (const url of URLS) {
    try {
      dbg("[Entity map] fetching", url);
      const r = await withTimeout(fetch(url), 15000);
      if (!r.ok) { console.error("[Entity map] HTTP", r.status, url); continue; }
      const j = await withTimeout(r.json(), 15000);
      if (!j || !j.objects || !j.objects.countries) {
        console.error("[Entity map] not a topojson file:", url);
        continue;
      }
      dbg("[Entity map] loaded", j.objects.countries.geometries.length, "geometries from", url);
      return j;
    } catch (e) {
      console.error("[Entity map] fetch failed:", url, e && e.message || e);
    }
  }
  console.error("[Entity map] all sources failed");
  return null;
})();
