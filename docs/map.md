# The map: the world, its countries and its links

The map is the second view of Strain. It draws every country of the
world on a Mercator projection, lets the player click one to see a card
and deploy a variant there, and keeps a world clock running at the
bench's speed. Underneath it is a small amount of state: one record per
country saying whether a variant covers it, how far, and with which
profile. Between the countries runs a graph of links, land borders, sea
lanes and air routes, each with a capacity. Nothing travels on those
links yet, and nothing changes a country's record except the player
deploying there. That is the gap the redesign fills (see `design.md`).

Four modules make the map side, in the order they load. `js/data.js`
holds one row per country: its region, its population and a set of
hand-set levels. `js/geo.js` names the six regions, gives each a
climate, and keeps the curated tables the links need. `js/world.js` is
the world container: the per-country state, the clock, the regions as
aggregates, the news log, the save tables, and the hand-off from the
rendered map to everything else. `js/links.js` builds the graph from
that hand-off. The renderer itself, `js/map.js`, loads last on the map
side; it decodes the map data, draws it, colours it from the world
state, and reports the shapes it drew (names, centroids, areas, shared
borders, coastline lengths) through `WORLD.onWorldMapReady`. The
dialogs the map opens, the country card, the region dialog and the
deploy dialog, are in `js/worldui.js`; the calendar readout and the
news column are in `js/wire.js`.

How it connects. The world clock reads `window.ENTITY_CLOCK`, which the
bench publishes: the map runs at the bench's speed and freezes when the
bench is paused or a job offer is up. The deploy dialog reads and
writes the player (money, suspicion, the variant's potency) through
`window.ENTITY`. The map's colouring closure is installed on the world
by `installMapSync`, and `syncMapColors()` is the one call that
repaints. The save blocks for the world and the countries come from the
pack tables here and are written by `js/progression.js`.

## 1. Rendering

Owner: `js/map.js`.

### What it does

**Data.** The world is `world-atlas@2.0.2/countries-110m.json`, a
TopoJSON file fetched from jsDelivr with two fallback CDNs by
`js/boot.js` at page load (`window.ENTITY_TOPO`), and once more inline
if that fails. If no copy arrives the map shows an error in its status
pill and stops; the bench is unaffected.

**Decoding.** `decodeTopo()` expands the delta-encoded arcs, measures
each arc in kilometres, stitches polygons and multipolygons, and keeps
for every feature the list of arc indices it uses. Antarctica is
skipped. A feature's ISO code comes from its numeric id through the
`ISO` table (a copy of the ISO 3166 numeric to alpha-2 mapping) or, for
the few territories with no number, from its name (`BY_NAME`).

**Projection.** Mercator, 1600 units wide, clipped to the band 84°N to
57°S, which clears Greenland and Chile. The map is cut not at 180° but
at 168.4°W, the one longitude where the cut crosses no land (the Bering
Strait), so Russia stays whole; `seamDeg()` expresses longitudes as
degrees east of the seam. Rings that cross the seam are split into one
subpath per lobe (`splitAtSeam`, `seamCut`), each lobe extended to the
edge so the halves meet at the tile boundary.

**Shapes.** One `<path class="country" data-iso>` per feature. Thirty
micro-states the dataset has no shape for (`MICRO`) are drawn as
`<circle class="marker" data-iso>` dots at hand-set coordinates. The
drawn tile is cloned twice and placed at ±1600 units so panning wraps
seamlessly. Each feature's area in km² comes from a planar shoelace at
its mean latitude (`featureAreaKm2`), and its centroid from the outer
ring of its largest polygon (`featureCentroidLonLat`), so remote
territories do not pull a marker into the ocean.

**Borders and coastlines.** Two features sharing an arc share a border
of that arc's length; an arc used once by one feature is coastline.
`borderKm` and `coastKm` are summed from this and handed to the world
with the catalogue.

**Colouring.** Two families of layer. A *band layer* reads a raw value
per country and sorts it into four level classes `lv1`..`lv4` that the
stylesheet colours; the only band layer today is **coverage**, cut at
`LEVELS = [0, .001, .25, .5, .75]` (clean, low, moderate, high, surge).
A *stat view* reads a value in 0..1 and sets an exact fill between two
colours inline, with a ramp in the legend; the only stat view is
**population**, from `DATA.popOf`, on a log scale from 1 M to 1 B.
`setLayer(name)` switches, updates the legend rows or ramp, and
repaints; the repaint closure walks `ENTITY.COUNTRY_STATE` and calls
`setValue(iso, v)` per country.

**Tooltip.** Hovering a shape or marker highlights every element of
that country and shows its name, code, region line (region name,
covered count, the region's temperature and humidity), coverage with a
bar, and population.

**Pan and zoom.** Pointer drag pans; the wheel and the +/− buttons zoom
about the pointer or the centre between 1× and 24×; ⟲ resets. The pan
wraps horizontally and clamps vertically.

**Tap versus drag.** With pointer capture on the SVG, the browser
delivers `pointerup` and `click` to the SVG itself, so the shape under
the pointer is remembered at `pointerdown`. A `pointerup` within 6 px
of the down point is a tap and opens the country card; farther is a
drag. A synthetic `click` straight on a shape still opens the card once,
unless a tap or drag was just handled (500 ms).

**Hand-off.** When the map is ready it calls
`ENTITY.onWorldMapReady(handle, { countries, borders, coastKm })`. The
handle offers `countries` (the catalogue), `setValue`, `setValues`,
`setLayer`, `pulse(iso)` (a brief brightness pulse on a country) and the
current `layer`. The catalogue is a sorted list of
`{ id, iso2, name, lon, lat, area }`; a dot marker has `id: null` and
`area: 100`.

### What it touches

Reads `window.ENTITY` (COUNTRY_STATE, COUNTRY_REGION, REGION_IDS,
regionAgg, installMapSync, onWorldMapReady, openCountryModal) and
`window.DATA.popOf`. Writes nothing outside its own SVG and the legend,
status, count and tooltip elements. Opens the country card
(`js/worldui.js`) on a tap.

### Defaults and levers

All fixed in `js/map.js`; none is a config row.

| Constant | Value | Meaning |
|---|---|---|
| `W` | 1600 | map width in viewBox units; the height follows from the latitude band |
| `LAT_N`, `LAT_S` | 84, −57 | the band drawn |
| `SEAM_LON` | −168.4 | where the map is cut |
| `LEVELS` | 0, .001, .25, .5, .75 | the coverage band cuts |
| zoom range | 1 to 24 | `zoomAt` |
| wheel step | ×1.2 | per notch; the buttons step ×1.5 |
| tap radius | 6 px | farther is a drag |
| tap debounce | 500 ms | a click right after a tap or drag is ignored |
| graticule | 30° | drawn every 30° in both directions |

### Assumptions built in

- Countries are the 110 m resolution shapes of world-atlas; nothing
  smaller than that dataset's features exists except the thirty dot
  markers.
- A country has one colour. There is no sub-national detail.
- Area and centroid are good to a few percent, which is all they are
  used for.
- The map is a view of the world state and never writes it; a click
  opens a dialog that may.
- The data comes from the network at load. Offline, there is no map.

## 2. Country data and regions

Owner: `js/data.js`, `js/geo.js`.

### What it does

**Rows.** `DATA.ROWS` has one row per ISO code on the map:
`[region, pop M, urban %, zone, freedom, type, infra, economy, military,
academia, medical, stability, technology, authority, openness, energy,
materials, food, water]`. Populations are 2023 figures in millions; the
zone is one of the climate names (`temperate`, `tropical`, `arid`,
`boreal`, …); the levels are hand-set impressions on 0..100. `rowOf(iso)`
returns the row as an object; a map code with no row gets its region's
typical row from `REGION_ROW`. Today the kept code reads only the
region, the population, and (for the links) infrastructure and economy;
the other columns are curated data waiting for the redesign.

**Agents and scenery.** `DATA.isAgent(iso)` is true for a code with a
row and at least `AGENT_MIN_POP` million people. Only agents get a
state in the world and a node in the link graph; the rest are scenery:
on the map, named, clickable, but with no state.

**Regions.** Six: North America, South America, Europe, Africa, Asia,
Oceania. Each has a climate triple (`REGION_ENV`: temperature, humidity,
urban share) used by the region dialog and the tooltip.
`GEO.COUNTRY_REGION` maps every code with a row to its region.

**Curated tables for the links.** `RANGE_CAP` lists land borders that
run along a mountain range with a capacity multiplier (1 is open
plain; the Himalaya is 0.1). `MICRO_LAND` lists the land borders of the
dot-marker micro-states, which have no shape to derive borders from;
`MICRO_LANDLOCKED` lists which of those have no coast.

### What it touches

Pure data. `js/geo.js` reads `window.DATA` at load. Read by `js/world.js`
(regions, population, agents), `js/links.js` (facts, curated tables),
`js/map.js` (population view), `js/worldui.js` (regions, population).

### Defaults and levers

| Lever | Default | Meaning |
|---|---|---|
| `AGENT_MIN_POP` | 0.05 M | below this a code is scenery |
| `REGION_ENV` | per region | temperature °C, humidity %, urban % |
| `RANGE_CAP` | 30 pairs | land border capacity multiplier across a range |
| `MICRO_LAND` | 7 pairs | land borders of dot-marker states |
| `MICRO_LANDLOCKED` | 4 codes | dot-marker states with no coast |

None of these is a config row; they are data.

### Assumptions built in

- One row per country, hand-set. The levels are impressions, not
  measurements, and are meant to be edited freely.
- A country's climate is its region's for display; the per-country zone
  in the row is not read by anything today.
- Population is fixed. Nothing on the map changes it.
- A region is a fixed partition by continent; a country is in exactly
  one.

## 3. Links

Owner: `js/links.js`.

### What it does

The graph is built once from the map hand-off (`LINKS.rebuild`), and
again whenever the world is reset; it is never saved. Nodes are the
agents the map drew with a finite centroid. Three edge types:

- **Land**: one edge per pair of shapes that share a border, with the
  border's length in km, plus the curated micro-state borders at 10 km.
  The edge's `range` is the `RANGE_CAP` multiplier, 1 when the border
  is open.
- **Sea**: every coastal country (coastline > 0 km; a dot marker counts
  as 20 km of coast unless listed landlocked) is joined to its `seaK`
  nearest coastal countries by great-circle distance.
- **Air**: every country is joined to the `airK` partners with the
  highest hub product `hub(a) × hub(b) × exp(−d / airRange)`, where
  `hub = (economy + infrastructure) / 200 × pop^0.4` from the country's
  row. A rich, built-up, populous country is a hub and collects many
  air links from countries that chose it.

Edges are undirected and unique per type and pair. Each carries a
capacity from the fixed facts at both ends, with
`infraF = 0.5 + (infraA + infraB) / 400`:

- land: `landCap × √km × range × infraF`
- sea: `seaCap × √min(coastA, coastB) × exp(−km / seaRange) × infraF`
- air: `airCap × hub(a) × hub(b) × exp(−km / airRange) × infraF`

Queries: `count(type)`, `linked(a, b)`, `linkedBy(a, b, type)`,
`rangeOf(a, b)` (the land terrain factor, 1 if none), `partners(iso)`,
`edgesOf(iso)`, `capacity(a, b)` (summed over types), and the raw
`edges` and `byIso` index.

### What it touches

Reads `window.GEO` (curated tables), `window.DATA` (`rowOf`, `isAgent`)
and `window.ENTITY_CONFIG` (the capacity levers, inside functions
only). Called by `js/world.js` (`rebuildLinks`, after the map hand-off
and on every new world) and `js/shell.js` (`refreshCapacity` when a
link lever is edited in the config panel). Read by the country card for
its link counts and border list. Nothing writes to it.

### Defaults and levers

All `ENTITY_CONFIG` keys and config-panel rows (group "Links").

| Lever | Default | Meaning |
|---|---|---|
| `landCap` | 0.5 | land capacity per √km of border |
| `seaCap` | 0.2 | sea capacity per √km of the shorter coastline |
| `airCap` | 0.05 | air capacity per unit of hub product |
| `seaRange` | 4000 km | sea capacity falls off by e per this distance |
| `airRange` | 8000 km | air partner choice and capacity fall off by e per this |
| `seaK` | 8 | sea partners per coastal country |
| `airK` | 8 | air partners each country chooses |

Changing `seaK`, `airK` or `airRange` in the panel does not rebuild the
graph; only a new world does. Capacities refresh at once.

### Assumptions built in

- The graph is static: the same world map and the same rows give the
  same graph every time. Nothing on it is ever added, cut or closed.
- Capacity is a number with no unit yet. What it is a capacity *of* is
  for the redesign to say.
- Sea partners are the nearest by centroid distance, not by port or
  shipping lane; Spain and Morocco are neighbours, Spain and Argentina
  are not.
- Air partners are chosen one-sidedly: a country picks its best
  `airK`, but an edge exists if either side picked the other, so hubs
  end up with far more than `airK` air links.
- Dot-marker states are coastal unless listed; their one-sided land
  borders are hand-listed.

## 4. The world container

Owner: `js/world.js`.

### What it does

**State.** `COUNTRY_STATE[iso]` exists for every agent and holds exactly
`{ covered, coverageLevel, profile }`: whether a variant covers the
country, how far (0..1), and the variant's genome `{ g0, g1 }` or null.
`ensureCountry(iso)` returns the record, creating it for an agent and
returning null for scenery. `WORLD_STATE` holds the seed, the day and
the log. `newWorld(seed)` resets all of it to day 0 with every country
clean, rebuilds the links, repaints and dispatches `entity:world`;
`resetCountries()` clears the coverage in place without touching the
clock.

**Agents on the map.** Before the map arrives every code with a row is
seeded; when it arrives, `pruneToMap()` drops the codes that have no
shape or marker (nothing to click, no name to print), so the agents
are exactly what is on the map. Display names come from the catalogue
(`nameOf`), ISO code until it loads.

**Regions.** `regionMembers(id)` lists a region's codes;
`regionAgg(id)` returns its name, climate, total population, how many
countries it has and how many are covered, and the mean coverage of
the covered ones.

**The log.** `log({ sev, kind, iso, iso2?, text })` stamps the day,
appends, trims to `logCap`, and dispatches `entity:news`. Nothing
writes to it today; the wire shows whatever arrives. Severities are
`small`, `large`, `massive`; the wire's filters and colours key on
them.

**The clock.** Every 50 ms, `tickClock()` adds the elapsed real time
times the bench's speed to an accumulator and runs `dayTick()` once per
`dayMs`, at most `maxCatchup` days per tick, discarding the rest so a
stalled tab does not bank days. The clock stops when the bench is
paused or halted and while the tab is hidden. `dayTick()` increments
the day, runs every registered pillar in order (below), closes the
ledgers and dispatches `entity:day` with the day number and its date.
Dates start at 1 January 2031 (`fmtDate`). `advanceDays(n)` runs n days
at once, for tests.

**Pillars, ledgers, streams, census.** The modules that run a nation's
day register with `registerPillar` and run in `ORDER`; each writes to
the nation's ledger for the day, keeps a 90-day history of its sums,
draws from its own seeded stream, and feeds the card, the config panel
and the census. All of this is described in `nations.md` §0.

**The map hand-off.** `onWorldMapReady(handle, geo)` keeps the handle
(as `WORLD.worldMap`), takes the names, seeds and prunes the states,
rebuilds the links from `geo` (`{ countries, borders, coastKm }`), and
repaints. `installMapSync(fn)` registers the renderer's repaint
closure; `syncMapColors()` runs it. `neighbourEdges` is the list of
land edges, for anything that wants a neighbour list.

**Persistence.** Two tables drive both directions. `COUNTRY_FIELDS`
maps each country field to its short name in the save and a default:
`covered → c`, `coverageLevel → lv`, `profile → pr`. `WORLD_FIELDS`
does the same for `day` and `log`; the seed rides beside them.
`packAll()` / `unpackAll()` and `packWorld()` / `unpackWorld()` are the
whole save and load of the map side; a new field is one row in a table,
and a pillar's `fields` are appended to the country table when it
registers. A saved value of the wrong shape falls back to its default.

### What it touches

Reads `window.GEO` (regions, population), `window.DATA.isAgent`,
`window.ENTITY_CLOCK` (the bench's speed and running state),
`window.ENTITY_CONFIG` (`dayMs`, `maxCatchup`, `logCap`, inside
functions only) and `window.LINKS`. Dispatches `entity:day`,
`entity:world` and `entity:news` on `window`. Read by `js/shell.js`
(which re-exports most of it on `window.ENTITY`), `js/worldui.js`,
`js/wire.js`, `js/map.js` and `js/progression.js` (the save blocks).

### Defaults and levers

All `ENTITY_CONFIG` keys and config-panel rows (group "World clock").

| Lever | Default | Meaning |
|---|---|---|
| `dayMs` | 10000 ms | real time per day at 1×; 2.5 s a day at the default 4× |
| `maxCatchup` | 4 | most days one clock tick may run |
| `logCap` | 200 | headlines kept |

Fixed: the clock interval (50 ms), the epoch (1 January 2031), the
date format (en-GB, day month year).

### Assumptions built in

- A country's record is the outbreak and nothing else. There is no
  per-country state that is not about the player's variant.
- One profile per country. A second deployment overwrites the first.
- Coverage is a share of a country, not a number of people, and it
  never falls on its own.
- The world is deterministic given a seed only in the sense that the
  seed is kept; nothing on the map draws random numbers yet.
- The clock is the bench's. There is no separate map speed.
- A day does nothing. Daily cadence exists for the redesign to use.

## 5. Dialogs and panels on the map

Owner: `js/worldui.js`, `js/wire.js`, and the markup in `Strain.html`.

### What it does

**The country card** (`#countryModal`) opens on a tap. It shows the
country's name, code and region in its bar, then rows for population,
status (`clean`, `covered · 12.0%`, or `scenery · no state`), the
variant's mode and type if one is there, and the counts of land, sea
and air links; then the names of its land neighbours; then two
buttons: **Deploy variant**, which opens the deploy dialog with the
first fit variant in storage preselected (or says there is none), and
**Region**, which opens the region dialog. The card re-renders after a
deployment while it is open.

**The region dialog** (`#mapRegionModal`) shows a region's covered and
total countries, its population, mean coverage, climate triple, and
the names of its covered countries.

**The deploy dialog** (`#deployModal`) picks a variant from storage,
shows its profile summary, the target country, the cost in money and
suspicion, and whether the variant will be consumed. Confirming runs
`runDeploy`: the money and suspicion are charged, the country is marked
covered at least 5% with the variant's profile, the variant loses
potency or is consumed, and the map repaints. The costs are in
`player.md`.

**The wire** (`#mapWire`) is a collapsible column of dated headlines
from the world log, newest first, filtered by severity (All, Major,
World). Clicking a headline pulses its country on the map. A
world-spanning headline also toasts. It collapses by itself under
700 px. It is empty until something writes to the log.

**The calendar** in the top bar shows the world date and the day
number in its tooltip; it updates on every `entity:day`.

**The response bar** (`#responseBar`) is markup and style for a global
meter under the map title. It is never shown today; the model that
fills it is the redesign's.

**The legend** holds the layer buttons (Coverage, Population), the
ramp for a stat view, and the five coverage rows.

### What it touches

`js/worldui.js` reads `window.WORLD` (state, regions, names,
`isAgent`, `syncMapColors`), `window.LINKS`, `window.GEO`,
`window.ENTITY` (player, config, `updateEntityUI`) and `window.C`
(the variant's mode name from its profile). It registers
`openCountryModal`, `openRegionModal`, `openDeployModal` and
`deployCost` on `window.ENTITY`. `js/wire.js` reads `window.WORLD`
(`day`, `fmtDate`, the log, `worldMap.pulse`) and listens to the three
`entity:*` events.

### Defaults and levers

The deploy costs (`deployCostBase`, `deployCostPerVariant`,
`deployScrutinyBase`) are config rows described in `player.md`. Fixed
here: the +3 suspicion for deploying into an already covered country,
the 5% floor on coverage at deployment, the 0.25 potency a variant
needs to be deployable, the 0.4 potency at or below which it is
consumed, the 0.15 it loses otherwise, the 24-name cap on the region
dialog's list and the 10-name cap on the card's border list, and the
wire's 50-row window.

### Assumptions built in

- Deploying is the only thing the player can do on the map. There is
  no recall, no sample, no second action.
- The card shows what is true now and nothing of what happened; there
  is no per-country history.
- The wire has no writer. Its filters and colours assume three
  severities.
