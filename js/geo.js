/* ═══════════════════════════════════════════════════════════════
   Entity — geography
   Region names and climates; which region each ISO country code
   belongs to and its population come from js/data.js, the one table of
   country rows.  The curated tables the link graph needs (mountain
   borders, micro-state borders) live here too.
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

/* ── Terrain and micro-states, for the links (js/links.js) ──────
   Land-border capacity multiplier where a range lies along the border
   (1 = open plain).  Keys are ISO pairs in alphabetical order. */
const RANGE_CAP = {
  "CN|IN": .1, "CN|NP": .15, "BT|CN": .1, "IN|NP": .5,          // Himalaya
  "CN|PK": .15, "AF|PK": .4, "CN|KG": .3, "CN|TJ": .2,           // Karakoram, Hindu Kush, Tian Shan, Pamir
  "AR|CL": .35, "BO|CL": .4, "BR|PE": .5, "CO|VE": .6,           // Andes
  "CH|IT": .5, "AT|IT": .5, "FR|IT": .5, "ES|FR": .4,            // Alps, Pyrenees
  "GE|RU": .3, "AZ|RU": .4, "IQ|IR": .5, "IR|TR": .5,            // Caucasus, Zagros
  "DZ|MA": .6, "PL|SK": .6, "RO|UA": .6, "BG|GR": .7,            // Atlas, Tatra, Carpathians, Rhodope
  "MM|TH": .5, "IN|MM": .4, "CN|MM": .4, "NO|SE": .7, "ER|ET": .6, "GT|MX": .7,
};
/* Dot-marker micro-states have no shape on the map, so their land borders
   are listed; the rest are islands with a small port. */
const MICRO_LAND = ["IT|VA", "IT|SM", "CH|LI", "AT|LI", "AD|FR", "AD|ES", "FR|MC"];
const MICRO_LANDLOCKED = new Set(["VA", "SM", "LI", "AD"]);

window.GEO = { REGION_NAME, REGION_ENV, REGION_IDS, COUNTRY_REGION, popOf, RANGE_CAP, MICRO_LAND, MICRO_LANDLOCKED };
})();
