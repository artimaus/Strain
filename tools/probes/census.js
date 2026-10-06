// Census probe: a fixed seed, N days, one census line per nation and one
// for the world (docs/plan.md phase 0).
//   python tools/smoke.py --eval-file tools/probes/census.js
// tools/census.py prepends `var SEED = n, DAYS = d;` and runs it over
// several seeds, then tabulates.
var SEED = typeof SEED === "number" ? SEED : 12345, DAYS = typeof DAYS === "number" ? DAYS : 1095;
var W = window.WORLD, t0 = performance.now();
W.newWorld(SEED);
W.advanceDays(DAYS);
var nations = {};
Object.keys(W.COUNTRY_STATE).forEach(function (iso) { nations[iso] = W.censusOf(iso); });
return { seed: SEED, days: DAYS, ms: Math.round(performance.now() - t0),
         pillars: W.pillarList().map(function (p) { return p.name; }),
         world: W.censusWorld(), nations: nations };
