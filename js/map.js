/* ═══════════════════════════════════════════════════════════════
   Entity — World map
   No external dependencies.  Inline topojson decoder, inline
   Mercator projection, inline pan/zoom.  Only the topojson data
   itself is fetched (from jsDelivr).
   Two families of layer colour the countries: a band layer
   (coverage) through four level classes the stylesheet colours, and
   a stat view (population, from the static country rows) through an
   exact shade between two colours, set inline, with a ramp in the
   legend.  Clicking a country opens the card in js/worldui.js.
   ═══════════════════════════════════════════════════════════════ */
(() => {
"use strict";
const SVGNS = "http://www.w3.org/2000/svg";
const statusEl = document.getElementById("mapStatus");
function setStatus(msg, cls) {
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.classList.remove("ok", "err");
  if (cls) statusEl.classList.add(cls);
}
dbg("[Entity map] module loaded, waiting for topojson…");
setStatus("loading map data…");

/* Latitude band drawn. 84N clears Greenland (83.65) and Canada (83.2),
   which were previously clamped flat against the top edge. 57S clears
   Chile (55.6), the southernmost land now that Antarctica is excluded. */
const LAT_N = 84, LAT_S = -57;
/* Longitude at which the map is cut. A scan of every longitude against
   countries-110m found exactly one window on the globe where the cut
   crosses no land at all: -168.65 .. -168.15, the Bering Strait. Cutting
   there keeps Russia whole instead of splitting Chukotka off at 180, and
   shifts the map centre only to 11.6E - visually still a standard world
   map. The splitting code below stays in regardless: the window is 0.5
   wide and would likely close if countries-50m were swapped in. */
const SEAM_LON = -168.4;
/* Degrees east of the seam, 0 at the left edge and 360 at the right. */
function seamDeg(lon) {
  const d = lon - SEAM_LON;
  return ((d % 360) + 360) % 360;
}
const MIN_HIT = 6;
const LEVELS = [0, .001, .25, .5, .75];

const ISO = Object.fromEntries(`004 AF 008 AL 010 AQ 012 DZ 016 AS 020 AD 024 AO 028 AG 031 AZ 032 AR 036 AU 040 AT 044 BS 048 BH 050 BD 051 AM 052 BB 056 BE 060 BM 064 BT 068 BO 070 BA 072 BW 076 BR 084 BZ 086 IO 090 SB 092 VG 096 BN 100 BG 104 MM 108 BI 112 BY 116 KH 120 CM 124 CA 132 CV 136 KY 140 CF 144 LK 148 TD 152 CL 156 CN 158 TW 162 CX 166 CC 170 CO 174 KM 175 YT 178 CG 180 CD 184 CK 188 CR 191 HR 192 CU 196 CY 203 CZ 204 BJ 208 DK 212 DM 214 DO 218 EC 222 SV 226 GQ 231 ET 232 ER 233 EE 234 FO 238 FK 239 GS 242 FJ 246 FI 248 AX 250 FR 254 GF 258 PF 260 TF 262 DJ 266 GA 268 GE 270 GM 275 PS 276 DE 288 GH 292 GI 296 KI 300 GR 304 GL 308 GD 312 GP 316 GU 320 GT 324 GN 328 GY 332 HT 334 HM 336 VA 340 HN 344 HK 348 HU 352 IS 356 IN 360 ID 364 IR 368 IQ 372 IE 376 IL 380 IT 384 CI 388 JM 392 JP 398 KZ 400 JO 404 KE 408 KP 410 KR 414 KW 417 KG 418 LA 422 LB 426 LS 428 LV 430 LR 434 LY 438 LI 440 LT 442 LU 446 MO 450 MG 454 MW 458 MY 462 MV 466 ML 470 MT 474 MQ 478 MR 480 MU 484 MX 492 MC 496 MN 498 MD 499 ME 500 MS 504 MA 508 MZ 512 OM 516 NA 520 NR 524 NP 528 NL 531 CW 533 AW 534 SX 535 BQ 540 NC 548 VU 554 NZ 558 NI 562 NE 566 NG 570 NU 574 NF 578 NO 580 MP 581 UM 583 FM 584 MH 585 PW 586 PK 591 PA 598 PG 600 PY 604 PE 608 PH 612 PN 616 PL 620 PT 624 GW 626 TL 630 PR 634 QA 638 RE 642 RO 643 RU 646 RW 652 BL 654 SH 659 KN 660 AI 662 LC 663 MF 666 PM 670 VC 674 SM 678 ST 682 SA 686 SN 688 RS 690 SC 694 SL 702 SG 703 SK 704 VN 705 SI 706 SO 710 ZA 716 ZW 724 ES 728 SS 729 SD 732 EH 740 SR 744 SJ 748 SZ 752 SE 756 CH 760 SY 762 TJ 764 TH 768 TG 772 TK 776 TO 780 TT 784 AE 788 TN 792 TR 795 TM 796 TC 798 TV 800 UG 804 UA 807 MK 818 EG 826 GB 831 GG 832 JE 833 IM 834 TZ 840 US 850 VI 854 BF 858 UY 860 UZ 862 VE 876 WF 882 WS 887 YE 894 ZM`
  .split(" ").reduce((a, v, i, arr) => (i % 2 ? a.push([arr[i - 1], v]) : 0, a), []));
const BY_NAME = {
  "Kosovo": "XK", "N. Cyprus": "XN", "Somaliland": "XS",
  "Indian Ocean Ter.": "IO", "Siachen Glacier": "XX",
};
const MICRO = [
  ["Vatican","VA",12.45,41.90],["Monaco","MC",7.42,43.73],["San Marino","SM",12.46,43.94],
  ["Liechtenstein","LI",9.55,47.14],["Andorra","AD",1.52,42.51],["Malta","MT",14.40,35.90],
  ["Singapore","SG",103.82,1.35],["Bahrain","BH",50.55,26.05],["Maldives","MV",73.22,3.20],
  ["Nauru","NR",166.93,-0.53],["Tuvalu","TV",179.20,-8.52],["Marshall Is.","MH",171.18,7.10],
  ["Palau","PW",134.58,7.51],["Micronesia","FM",158.22,6.92],["Kiribati","KI",-157.36,1.87],
  ["Tonga","TO",-175.20,-21.18],["Samoa","WS",-172.10,-13.76],["Seychelles","SC",55.49,-4.68],
  ["Mauritius","MU",57.55,-20.35],["Comoros","KM",43.87,-11.88],
  ["São Tomé and Principe","ST",6.73,0.34],["Cabo Verde","CV",-23.99,16.00],
  ["Barbados","BB",-59.54,13.19],["Grenada","GD",-61.68,12.12],
  ["Saint Lucia","LC",-60.98,13.91],["St. Vin. and Gren.","VC",-61.20,13.25],
  ["Antigua and Barb.","AG",-61.80,17.08],["St. Kitts and Nevis","KN",-62.75,17.30],
  ["Dominica","DM",-61.37,15.41],["Brunei","BN",114.73,4.53],
];

/* ─── TopoJSON decoder ─── */
function decodeTopo(topo) {
  const tr = topo.transform;
  const arcs = topo.arcs.map(arc => {
    let x = 0, y = 0;
    const out = new Array(arc.length);
    for (let i = 0; i < arc.length; i++) {
      const dx = arc[i][0], dy = arc[i][1];
      x += dx; y += dy;
      out[i] = tr ? [tr.translate[0] + tr.scale[0] * x,
                     tr.translate[1] + tr.scale[1] * y] : [x, y];
    }
    return out;
  });
  // Length of every arc in km, for border lengths and coastlines.
  const arcKm = arcs.map(pts => {
    let km = 0;
    for (let i = 1; i < pts.length; i++) km += kmBetween(pts[i - 1], pts[i]);
    return km;
  });
  function stitchArc(idxs) {
    const out = [];
    for (let k = 0; k < idxs.length; k++) {
      const i = idxs[k];
      const rev = i < 0;
      const arc = arcs[rev ? ~i : i];
      if (!arc) continue;
      if (rev) for (let m = arc.length - 1; m >= 0; m--) out.push(arc[m]);
      else for (let m = 0; m < arc.length; m++) out.push(arc[m]);
    }
    return out;
  }
  function geom(g) {
    if (g.type === "Polygon")
      return { type: "Polygon", coordinates: g.arcs.map(stitchArc) };
    if (g.type === "MultiPolygon")
      return { type: "MultiPolygon",
               coordinates: g.arcs.map(poly => poly.map(stitchArc)) };
    return null;
  }
  // Every arc index a geometry uses (normalised: a negative index is the
  // same arc walked backwards).  Two countries sharing an index share a
  // border; an index no other country uses is coastline.
  function arcIds(g) {
    const out = [];
    const walk = a => { if (Array.isArray(a)) a.forEach(walk); else out.push(a < 0 ? ~a : a); };
    walk(g.arcs);
    return out;
  }
  const c = topo.objects.countries;
  const out = [];
  const SKIP = new Set(["010"]);              // Antarctica - not played
  const SKIP_NAME = new Set(["Antarctica"]);  // in case the id is absent
  for (const g of c.geometries) {
    if (SKIP.has(String(g.id))) continue;
    if (g.properties && SKIP_NAME.has(g.properties.name)) continue;
    const gg = geom(g);
    if (!gg) continue;
    out.push({
      id: g.id,
      name: (g.properties && g.properties.name) || "",
      geometry: gg,
      arcs: arcIds(g),
    });
  }
  return { features: out, arcKm };
}
function kmBetween(p, q) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(q[1] - p[1]), dLon = toRad(q[0] - p[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(p[1])) * Math.cos(toRad(q[1])) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/* ─── Mercator projection ─── */
const W = 1600;
function mercY(lat) {
  const r = lat * Math.PI / 180;
  return Math.log(Math.tan(Math.PI / 4 + r / 2));
}
const yTopRad = mercY(LAT_N);
const yBotRad = mercY(LAT_S);
const yRangeRad = yTopRad - yBotRad;
const H = W * yRangeRad / (2 * Math.PI);

/* Projects a point already expressed in seam-degrees (0..360). */
function projectSeam(s, lat) {
  // Clamp to the map's latitude band. Antarctica reaches -85.6 in this
  // dataset, which projects far below the viewBox.
  const la = lat > LAT_N ? LAT_N : (lat < LAT_S ? LAT_S : lat);
  return [s / 360 * W, (yTopRad - mercY(la)) / yRangeRad * H];
}
function project(lon, lat) { return projectSeam(seamDeg(lon), lat); }

/* ─── SVG path builder ─── */
/* Rings that cross the antimeridian arrive with consecutive vertices at
   +180 and -180. Projected linearly those land on opposite edges of the
   map, so a single path draws a horizontal streak across the whole world
   - visible on Russia, Fiji and Antarctica. Split the ring wherever a
   step exceeds 180 degrees of longitude and emit each lobe separately. */
/* Interpolate where the segment a->b crosses the seam. Both points are
   in seam-degrees. Unwrap b to be continuous with a, find the fraction of
   the way along at which it reaches the edge, and take the latitude
   there. `edge` is 360 if a runs out to the right, 0 if to the left. */
function seamCut(a, b) {
  const bS = b[0] + (b[0] < a[0] ? 360 : -360);
  const den = bS - a[0];
  // Some rings carry an explicit pair of vertices already sitting on the
  // seam. There is nothing to interpolate and den is 0, so take the
  // latitude as-is rather than dividing by zero into NaN.
  if (den === 0) return { edge: a[0] > 180 ? 360 : 0, lat: a[1] };
  const edge = den > 0 ? 360 : 0;
  return { edge, lat: a[1] + ((edge - a[0]) / den) * (b[1] - a[1]) };
}
/* Rings that cross the seam have consecutive vertices at opposite edges
   of the map. Drawn as one path they streak all the way across, so split
   them into one subpath per lobe. Takes lon/lat, returns seam-degrees. */
function splitAtSeam(ring) {
  const n = ring.length;
  if (n < 2) return [];
  const r = ring.map(p => [seamDeg(p[0]), p[1]]);
  const parts = [];
  let cur = [r[0]];
  for (let i = 1; i < n; i++) {
    const a = r[i - 1], b = r[i];
    if (Math.abs(b[0] - a[0]) > 180) {
      /* The source data does not always carry a vertex exactly on the cut
         - at 180, Russia's east side stopped at 178.60 while its west side
         was cut at -180.00 - so each lobe must be extended out to the edge
         itself. Without this the lobe closes on a slant instead of running
         straight down the edge, and the halves miss each other at the
         tile seam. */
      const c = seamCut(a, b);
      cur.push([c.edge, c.lat]);
      parts.push(cur);
      cur = [[360 - c.edge, c.lat]];
    }
    cur.push(b);
  }
  parts.push(cur);
  /* A ring is a closed loop, so the segment from the last vertex back to
     the first counts too. If it crosses, cut it the same way; if it does
     not, the last and first parts are two halves of one lobe, split only
     because the ring's start vertex fell inside it, and must be rejoined
     or a chord gets drawn across the country. */
  const a = r[n - 1], b = r[0];
  if (Math.abs(b[0] - a[0]) > 180) {
    const c = seamCut(a, b);
    parts[parts.length - 1].push([c.edge, c.lat]);
    parts[0].unshift([360 - c.edge, c.lat]);
  } else if (parts.length > 1) {
    parts[0] = parts.pop().concat(parts[0]);
  }
  return parts.filter(p => p.length > 1);
}
function subpathToPath(pts) {
  // Track `started` rather than testing i === 0: if the first vertex were
  // skipped as non-finite the path would begin with L and not render.
  let d = "", started = false;
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = projectSeam(pts[i][0], pts[i][1]);
    if (!isFinite(x) || !isFinite(y)) continue;
    d += (started ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
    started = true;
  }
  return started ? d + "Z" : "";
}
function ringToPath(ring) {
  return splitAtSeam(ring).map(subpathToPath).join("");
}
function geomToPath(g) {
  if (g.type === "Polygon")
    return g.coordinates.map(ringToPath).join("");
  if (g.type === "MultiPolygon")
    return g.coordinates.map(poly => poly.map(ringToPath).join("")).join("");
  return "";
}

/* ─── Feature area in km², for population capacity ───
   Planar shoelace on each ring scaled at its mean latitude; holes
   (rings after the first) subtract.  Good to a few percent, which is
   what a carrying capacity needs. */
function ringAreaKm2(ring) {
  const r = unwrapRing(ring);
  if (r.length < 3) return 0;
  let latSum = 0;
  for (const p of r) latSum += p[1];
  const kx = 111.32 * Math.cos(latSum / r.length * Math.PI / 180), ky = 110.57;
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    a += (r[j][0] * kx) * (r[i][1] * ky) - (r[i][0] * kx) * (r[j][1] * ky);
  return Math.abs(a) / 2;
}
function featureAreaKm2(g) {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  let total = 0;
  for (const poly of polys) poly.forEach((ring, i) => { total += (i === 0 ? 1 : -1) * ringAreaKm2(ring); });
  return Math.max(0, total);
}

/* ─── Feature centroid for neighbour graph ─── */
function unwrapRing(ring) {
  const out = [[ring[0][0], ring[0][1]]];
  for (let i = 1; i < ring.length; i++) {
    let lon = ring[i][0];
    const prev = out[i - 1][0];
    while (lon - prev > 180) lon -= 360;
    while (prev - lon > 180) lon += 360;
    out.push([lon, ring[i][1]]);
  }
  return out;
}
function ringArea(r) {
  let a = 0;
  for (let i = 0, n = r.length; i < n; i++) {
    const p = r[i], q = r[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}
/* Average every vertex of every polygon and remote territories drag the
   marker off the country: France landed mid-Atlantic, the USA in Oregon.
   Use the outer ring of the largest polygon instead. */
function featureCentroidLonLat(g) {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  let best = null, bestA = -1;
  for (const poly of polys) {
    if (!poly.length || poly[0].length < 3) continue;
    const r = unwrapRing(poly[0]);
    const a = ringArea(r);
    if (a > bestA) { bestA = a; best = r; }
  }
  if (!best) return [0, 0];
  let sx = 0, sy = 0;
  for (const p of best) { sx += p[0]; sy += p[1]; }
  let lon = sx / best.length;
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return [lon, sy / best.length];
}

/* ─── map module body ─── */
(async () => {
  try {
    const fetchInline = async () => {
      dbg("[Entity map] retrying inline");
      try {
        const r = await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json");
        return r.ok ? await r.json() : null;
      } catch (e) { console.error("[Entity map] inline fetch failed:", e && e.message || e); return null; }
    };

    // The preload promise resolves to null on failure, so `||` on the promise
    // itself is not enough - fall back on the resolved value too.
    let topo = window.ENTITY_TOPO ? await window.ENTITY_TOPO : null;
    if (!topo) topo = await fetchInline();
    if (!topo) {
      setStatus("map data unavailable — check network / console", "err");
      console.error("[Entity map] topojson is null (fetch failed)");
      return;
    }

    const { features: decoded, arcKm } = decodeTopo(topo);
    dbg("[Entity map] features:", decoded.length);
    if (!decoded.length) { setStatus("no country geometries", "err"); return; }

    const view = document.getElementById("mapView");
    const svgEl = document.getElementById("mapSvg");
    if (!svgEl) { setStatus("svg element missing", "err"); return; }

    svgEl.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");

    // Background
    const bg = document.createElementNS(SVGNS, "rect");
    bg.setAttribute("width", W); bg.setAttribute("height", H);
    bg.setAttribute("fill", "#0a0e10");
    svgEl.appendChild(bg);

    // Graticule
    const grat = document.createElementNS(SVGNS, "path");
    {
      let d = "";
      for (let lon = -180; lon < 180; lon += 30) {
        let first = true;
        for (let lat = LAT_S; lat <= LAT_N; lat += 5) {
          const [x, y] = project(lon, lat);
          d += (first ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
          first = false;
        }
        const [xe, ye] = project(lon, LAT_N);
        d += "L" + xe.toFixed(1) + " " + ye.toFixed(1);
      }
      const firstPar = Math.ceil(LAT_S / 30) * 30;
      for (let lat = firstPar; lat <= LAT_N; lat += 30) {
        for (let s = 0; s <= 360; s += 5) {
          const [x, y] = projectSeam(s, lat);
          d += (s === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
        }
      }
      grat.setAttribute("d", d);
      grat.setAttribute("fill", "none");
      grat.setAttribute("stroke", "#141c1e");
      grat.setAttribute("stroke-width", "0.5");
      grat.setAttribute("pointer-events", "none");
    }
    const worldG = document.createElementNS(SVGNS, "g");
    svgEl.appendChild(worldG);
    const tile = document.createElementNS(SVGNS, "g");
    tile.appendChild(grat);

    const catalogue = [];
    let drawnCount = 0;
    const isoOf = new Map();          // feature -> iso2, for the border pass below
    for (const f of decoded) {
      const iso2 = ISO[f.id] || BY_NAME[f.name] || "—";
      const d = geomToPath(f.geometry);
      if (!d) continue;
      const [lon, lat] = featureCentroidLonLat(f.geometry);
      catalogue.push({ id: f.id, iso2, name: f.name || iso2, lon, lat, area: featureAreaKm2(f.geometry) });
      isoOf.set(f, iso2);

      const p = document.createElementNS(SVGNS, "path");
      p.setAttribute("d", d);
      p.setAttribute("class", "country");
      p.setAttribute("data-iso", iso2);
      p.dataset.name = f.name || iso2;
      tile.appendChild(p);
      drawnCount++;
    }
    dbg("[Entity map] shapes drawn:", drawnCount);

    /* Land borders and coastlines.  Each arc lists which countries use it
       and how often: two different countries = a border of that length;
       one country, once = coastline (twice = an internal seam). */
    const owners = new Map();
    for (const f of decoded) {
      const iso = isoOf.get(f);
      if (!iso || iso === "—" || iso === "XX") continue;
      for (const a of f.arcs) {
        if (!owners.has(a)) owners.set(a, []);
        owners.get(a).push(iso);
      }
    }
    const borderKm = {}, coastKm = {};
    for (const [a, list] of owners) {
      const distinct = [...new Set(list)];
      if (distinct.length === 2) {
        const k = distinct[0] < distinct[1] ? distinct[0] + "|" + distinct[1] : distinct[1] + "|" + distinct[0];
        borderKm[k] = (borderKm[k] || 0) + arcKm[a];
      } else if (distinct.length === 1 && list.length === 1) {
        coastKm[distinct[0]] = (coastKm[distinct[0]] || 0) + arcKm[a];
      }
    }
    const borders = Object.keys(borderKm).map(k => { const [a, b] = k.split("|"); return { a, b, km: borderKm[k] }; });
    dbg("[Entity map] borders:", borders.length, "coastal:", Object.keys(coastKm).length);

    const presentNames = new Set(decoded.map(f => f.name));
    for (const [name, iso2, lon, lat] of MICRO) {
      if (presentNames.has(name)) continue;
      const [cx, cy] = project(lon, lat);
      const c = document.createElementNS(SVGNS, "circle");
      c.setAttribute("cx", cx); c.setAttribute("cy", cy);
      c.setAttribute("r", 3.5);
      c.setAttribute("class", "marker");
      c.setAttribute("data-iso", iso2);
      c.dataset.name = name;
      tile.appendChild(c);
      catalogue.push({ id: null, iso2, name, lon, lat, area: 100 });   // a dot marker: a small state, no shape
    }
    const TILE_OFFSETS = [-1, 0, 1];
    for (const t of TILE_OFFSETS) {
      const g = t === 0 ? tile : tile.cloneNode(true);
      g.setAttribute("transform", `translate(${t * W} 0)`);
      g.setAttribute("data-tile", String(t));
      worldG.appendChild(g);
    }

    catalogue.sort((a, b) => a.name.localeCompare(b.name));
    dbg("[Entity map] catalogue:", catalogue.length);

    /* ── colouring ── */
    const lvl = v => { let k = 0; for (let i = 1; i < LEVELS.length; i++) if (v >= LEVELS[i]) k = i; return k; };
    const indexByIso = new Map();
    for (const el of worldG.querySelectorAll("[data-iso]")) {
      const iso = el.getAttribute("data-iso");
      if (!iso) continue;
      if (!indexByIso.has(iso)) indexByIso.set(iso, []);
      indexByIso.get(iso).push(el);
    }
    /* stat views: a continuous value 0..1 painted as an exact shade between two colours, inline, rather than the four
       level classes the band layers use.  `value` reads the country's fixed facts (js/data.js) or its state. */
    const popOf = iso => (window.DATA ? window.DATA.popOf(iso) : 0);
    const STAT_VIEWS = {
      population: { label: "Pop", lo: "#2e2a1f", hi: "#ffd060", legend: ["1 M", "1 B"],
                    value: (st, iso) => Math.min(1, Math.log10(Math.max(0, popOf(iso)) + 1) / 3.2),
                    show: (st, iso) => { const p = popOf(iso); return `${p >= 100 ? Math.round(p) : p.toFixed(1)} M`; } },
    };
    const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const rampCache = new Map();
    function ramp(lo, hi, v) {                            // an exact shade between two colours, cached per 1/64 step
      const step = Math.round(Math.max(0, Math.min(1, v)) * 64), key = lo + hi + step;
      let c = rampCache.get(key);
      if (!c) {
        const a = hex(lo), b = hex(hi), t = step / 64;
        c = "rgb(" + a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(",") + ")";
        rampCache.set(key, c);
      }
      return c;
    }
    const statValue = (name, st, iso) => { const sv = STAT_VIEWS[name]; return sv ? sv.value(st, iso) : 0; };
    function setValue(iso2, v) {
      const els = indexByIso.get(iso2);
      if (!els) return;
      const sv = STAT_VIEWS[layer];
      if (sv) {                                            // a stat view: the shade is the value, 0..1
        const fill = ramp(sv.lo, sv.hi, Math.max(0, Math.min(1, +v || 0)));
        for (const el of els) { el.classList.remove("lv1", "lv2", "lv3", "lv4"); el.style.fill = fill; }
        return;
      }
      const L = LEGEND[layer], k = L && L.level ? L.level(+v || 0) : lvl(Math.max(0, Math.min(1, +v || 0)));   // a band layer: its own cuts on its own scale
      for (const el of els) {
        el.style.fill = "";
        el.classList.remove("lv1", "lv2", "lv3", "lv4");
        if (k) el.classList.add("lv" + k);
      }
    }
    function setValues(o) { for (const k in o) setValue(k, o[k]); }

    /* ── layers: what lv1..lv4 mean is decided here and coloured by CSS. ── */
    const LEGEND = {
      coverage:  { labels: ["Clean", "Low", "Moderate", "High", "Surge"], cols: ["var(--land)", "var(--lv1)", "var(--lv2)", "var(--lv3)", "var(--lv4)"],
                   value: st => st.covered ? st.coverageLevel : 0, level: v => lvl(Math.max(0, Math.min(1, v))) },
    };
    let layer = "coverage";
    const legend = document.getElementById("mapLegend"), grad = document.getElementById("mapGrad");
    function setLayer(name) {
      const sv = STAT_VIEWS[name];
      if (!LEGEND[name] && !sv) return;
      layer = name;
      view.dataset.layer = name;
      if (legend) {
        legend.querySelectorAll(".layers button").forEach(b => b.classList.toggle("on", b.dataset.layer === name));
        legend.querySelectorAll(".row").forEach((row, i) => {
          const label = sv ? "" : LEGEND[name].labels[i];               // a stat view shows the ramp instead of the rows
          row.hidden = !label;
          if (sv) return;
          const dot = row.querySelector(".dot"); if (dot) dot.style.background = LEGEND[name].cols[i];
          row.lastChild.textContent = " " + label;
        });
        if (grad) {
          grad.hidden = !sv;
          if (sv) {
            const bar = grad.querySelector("i"); if (bar) bar.style.background = `linear-gradient(90deg, ${sv.lo}, ${sv.hi})`;
            const lo = grad.querySelector(".lo"), hi = grad.querySelector(".hi");
            if (lo) lo.textContent = sv.legend[0]; if (hi) hi.textContent = sv.legend[1];
          }
        }
      }
      if (S && S.syncMapColors) S.syncMapColors();
    }
    if (legend) legend.querySelectorAll(".layers button").forEach(b => { b.onclick = () => setLayer(b.dataset.layer); });

    const S = window.ENTITY;
    if (S && typeof S.installMapSync === "function") {
      S.installMapSync(() => {
        for (const iso in S.COUNTRY_STATE) {
          const st = S.COUNTRY_STATE[iso];
          const v = LEGEND[layer] ? LEGEND[layer].value(st, iso) : statValue(layer, st, iso);   // a band layer's raw value, or a stat view's 0..1
          setValue(iso, v);
        }
      });
    }

    function pulse(iso2) {
      const els = indexByIso.get(iso2); if (!els) return;
      for (const e of els) { e.classList.remove("pulse"); void e.getBoundingClientRect(); e.classList.add("pulse"); }
      setTimeout(() => { for (const e of els) e.classList.remove("pulse"); }, 1600);
    }

    const handle = {
      countries: catalogue,
      setValue, setValues, setLayer, pulse,
      get layer() { return layer; },
      get svg() { return svgEl; },
      get world() { return worldG; },
    };
    if (S && S.onWorldMapReady) S.onWorldMapReady(handle, { countries: catalogue, borders, coastKm });
    const cnt = document.getElementById("mapCount");
    if (cnt) cnt.innerHTML = `<b>${catalogue.length}</b> places`;
    setStatus("map ready · " + catalogue.length + " places", "ok");
    setLayer("coverage");
    dbg("[Entity map] ready");

    /* ── tooltip ── */
    const tip = document.getElementById("mapTooltip");
    let hoveredEl = null, hoveredEls = [];
    function clearHover() {
      for (const el of hoveredEls) el.classList.remove("hl");
      hoveredEls = [];
    }
    function setHover(iso2, el) {
      clearHover();
      hoveredEls = (iso2 && iso2 !== "—" && indexByIso.get(iso2)) || [el];
      for (const e of hoveredEls) e.classList.add("hl");
    }
    function showTooltip(ev, iso2, name) {
      const region = S && S.COUNTRY_REGION[iso2];
      const st = S && S.COUNTRY_STATE[iso2];
      const v = st && st.covered ? st.coverageLevel : 0, lv = lvl(v);
      const p = popOf(iso2);
      const head = region && S.REGION_IDS.includes(region)
        ? (agg => `<div class="region">${agg.name} · ${agg.covered}/${agg.countries} covered · ${agg.env.temp}°C · ${agg.env.humidity}%</div>`)(S.regionAgg(region))
        : `<div class="region">unassigned region</div>`;
      tip.innerHTML =
        `<div class="name"><span class="sw"${lv ? ` style="background:var(--lv${lv})"` : ""}></span>${name} <span class="iso">${iso2}</span></div>`
        + head
        + `<div class="stat">Coverage <b>${(v * 100).toFixed(1)}%</b></div>`
        + `<div class="bar"><div class="fill" style="width:${v * 100}%${lv ? `;background:var(--lv${lv})` : ""}"></div></div>`
        + `<div class="stat">Population <b>${p >= 100 ? Math.round(p) : p.toFixed(1)} M</b></div>`;
      tip.classList.add("show");
      moveTooltip(ev);
    }
    function moveTooltip(ev) {
      const r = view.getBoundingClientRect();
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      let x = ev.clientX - r.left + 14, y = ev.clientY - r.top + 14;
      if (x + tw > r.width - 8) x = ev.clientX - r.left - tw - 14;
      if (y + th > r.height - 8) y = ev.clientY - r.top - th - 14;
      tip.style.left = x + "px"; tip.style.top = y + "px";
    }
    function hideTooltip() { tip.classList.remove("show"); hoveredEl = null; clearHover(); }

    /* ── pan / zoom ── */
    let zoomK = 1, zoomX = 0, zoomY = 0;
    function normalizeTransform() {
      const period = W * zoomK;
      zoomX = ((zoomX % period) + period) % period;
      if (zoomX > 0) zoomX -= period;
      const minY = H - H * zoomK;
      zoomY = Math.min(0, Math.max(minY, zoomY));
    }
    function applyTransform() {
      normalizeTransform();
      worldG.setAttribute("transform",
        `translate(${zoomX.toFixed(2)} ${zoomY.toFixed(2)}) scale(${zoomK.toFixed(4)})`);
    }
    function resetView() { zoomK = 1; zoomX = 0; zoomY = 0; applyTransform(); }
    function clientToViewBox(clientX, clientY) {
      const r = svgEl.getBoundingClientRect();
      const scale = Math.min(r.width / W, r.height / H);
      const renderedW = W * scale, renderedH = H * scale;
      const offX = (r.width - renderedW) / 2, offY = (r.height - renderedH) / 2;
      return [(clientX - r.left - offX) / scale,
              (clientY - r.top - offY) / scale];
    }
    function zoomAt(cx, cy, factor) {
      const newK = Math.max(1, Math.min(24, zoomK * factor));
      if (newK === zoomK) return;
      zoomX = cx - (cx - zoomX) * newK / zoomK;
      zoomY = cy - (cy - zoomY) * newK / zoomK;
      zoomK = newK;
      applyTransform();
    }
    applyTransform();

    svgEl.addEventListener("wheel", e => {
      e.preventDefault();
      const [mx, my] = clientToViewBox(e.clientX, e.clientY);
      zoomAt(mx, my, e.deltaY < 0 ? 1.2 : 1 / 1.2);
    }, { passive: false });

    let isPanning = false, lastX = 0, lastY = 0, moved = 0;
    // The shape under the pointer when it went down: with pointer capture on
    // the svg, the browser delivers pointerup and click to the svg itself, so
    // the click's target is never a country.  A tap is decided here instead.
    let downTarget = null, downX = 0, downY = 0, lastTapOpen = 0, lastDrag = 0;
    svgEl.addEventListener("pointerdown", e => {
      isPanning = true;
      lastX = e.clientX; lastY = e.clientY;
      moved = 0;
      downTarget = e.button === 0 ? e.target : null; downX = e.clientX; downY = e.clientY;
      try { svgEl.setPointerCapture(e.pointerId); } catch (err) {}
    });
    svgEl.addEventListener("pointermove", e => {
      if (!isPanning) return;
      const [x1, y1] = clientToViewBox(e.clientX, e.clientY);
      const [x0, y0] = clientToViewBox(lastX, lastY);
      zoomX += x1 - x0;
      zoomY += y1 - y0;
      lastX = e.clientX; lastY = e.clientY;
      moved += Math.abs(x1 - x0) + Math.abs(y1 - y0);
      applyTransform();
    });
    function endPan() { isPanning = false; }
    svgEl.addEventListener("pointerup", e => {
      endPan();
      const t = downTarget; downTarget = null;
      if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 6) { lastDrag = performance.now(); return; }   // a drag, not a tap
      if (t && openCountry(t)) lastTapOpen = performance.now();
    });
    svgEl.addEventListener("pointercancel", endPan);
    svgEl.addEventListener("pointerleave", endPan);

    document.getElementById("mapZoomIn").onclick  = () => zoomAt(W / 2, H / 2, 1.5);
    document.getElementById("mapZoomOut").onclick = () => zoomAt(W / 2, H / 2, 1 / 1.5);
    document.getElementById("mapReset").onclick   = resetView;

    /* ── hover ── */
    svgEl.addEventListener("mousemove", e => {
      const t = e.target;
      if (!t || !t.classList || !(t.classList.contains("country") || t.classList.contains("marker"))) {
        if (hoveredEl) hideTooltip();
        return;
      }
      const iso2 = t.getAttribute("data-iso");
      const name = t.dataset.name || iso2;
      if (hoveredEl === t) { moveTooltip(e); return; }
      hoveredEl = t;
      setHover(iso2, t);
      showTooltip(e, iso2, name);
    });
    svgEl.addEventListener("mouseleave", hideTooltip);

    /* ── open a country from the shape or marker that was tapped ── */
    function openCountry(t) {
      if (!t || !t.classList || !(t.classList.contains("country") || t.classList.contains("marker"))) return false;
      const iso2 = t.getAttribute("data-iso");
      if (!iso2 || iso2 === "—") return false;
      for (const el of worldG.querySelectorAll(".selected"))
        el.classList.remove("selected");
      const els = indexByIso.get(iso2) || [t];
      for (const el of els) el.classList.add("selected");
      if (S && S.openCountryModal) S.openCountryModal(iso2);
      else {                                      // the card lives in js/worldui.js; missing means stale scripts
        console.error("[Entity map] no country card is registered — the page is probably stale; hard-reload (Ctrl+Shift+R)");
        setStatus("stale page — reload", "err");
      }
      return true;
    }
    // Synthetic and keyboard clicks still land on the shape; a real tap was
    // already handled on pointerup, so skip the click that follows it.
    svgEl.addEventListener("click", e => {
      const now = performance.now();
      if (now - lastTapOpen < 500 || now - lastDrag < 500) return;
      openCountry(e.target);
    });
  } catch (e) {
    setStatus("map error — see console", "err");
    console.error("[Entity map] fatal:", e);
  }
})();

})();  // close the outer map-module IIFE
