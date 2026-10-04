/* ═══════════════════════════════════════════════════════════════
   Entity — geography
   Region names and climates; which region each ISO country code
   belongs to and its population come from js/data.js, the one table of
   country rows.
   ═══════════════════════════════════════════════════════════════ */
(() => {
"use strict";
const REGION_NAME = {
  north_america: "North America",
  south_america: "South America",
  europe:        "Europe",
  africa:        "Africa",
  asia:          "Asia",
  oceania:       "Oceania",
};
const REGION_ENV = {
  north_america: { temp:15, humidity:60, urban:80 },
  south_america: { temp:25, humidity:75, urban:70 },
  europe:        { temp:12, humidity:70, urban:85 },
  africa:        { temp:28, humidity:65, urban:55 },
  asia:          { temp:18, humidity:55, urban:75 },
  oceania:       { temp:22, humidity:70, urban:65 },
};
const REGION_IDS = Object.keys(REGION_NAME);

/* Which region each code belongs to, and its population in millions: both
   from the rows in js/data.js. */
const COUNTRY_REGION = {};
for (const iso in window.DATA.ROWS) COUNTRY_REGION[iso] = window.DATA.REGION_ID[window.DATA.ROWS[iso][0]];
const popOf = window.DATA.popOf;

window.GEO = { REGION_NAME, REGION_ENV, REGION_IDS, COUNTRY_REGION, popOf };
})();
