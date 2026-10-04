# The world simulation, system by system

A review of the map-side simulation (not the bench): what each system
does, what it touches, the defaults and levers it exposes, and the
assumptions built into it. Written to be read one system at a time and
annotated with requested changes; once every system has been reviewed,
the requests are checked against each other for contradictions and
turned into an implementation plan.

Every default named here is a `ENTITY_CONFIG` key in `js/shell.js` and a
row in the Config panel unless marked *fixed*. File references point at
the code that owns the behaviour.

**Reminders for separate sessions** (not part of this review):

- Go through the curated defaults country by country: the 64 seed rows,
  the 91 resource overrides, the population table, the rivalry table and
  the mountain-border table.

**Cross-cutting requests** recorded early, to be folded into the systems
they touch when those are reviewed:

- **Trade as real transfers** (systems 4, 7, 8): a deal moves an amount
  of energy, food, materials or water from one country to the other for
  a period; the exporter loses what the importer gains. Today a deal
  gives each side a share of the other's *surplus* with no loss to
  anyone.
- **Technology is shared without loss** (systems 4, 11): unlike
  resources, technology can be given or spread permanently and the giver
  keeps it, but only up to a percentage of the provider's level.
  Diffusion already works this way; deals and pacts might too. The
  technology model itself is to be reworked (multipliers, sharing).
- **A global resource exchange** (candidate new system; see system 4):
  world prices per resource, money as a means of access, and a decision
  model for market versus bilateral deals.
- **Technology as multipliers** (systems 3, 4, 9): rather than a stat
  that other stats blend in, technology should multiply resource
  production, the economy and military effectiveness, each by its own
  factor.
- **Infrastructure as a smaller multiplier with upkeep and caps**
  (systems 3, 4, 5, 8, 9): a lower multiplier than technology on the
  same things, a treasury upkeep, and it raises caps: the economy cap,
  the military cap, the trade-partner cap, and so on.
- **Military as a raw number** (systems 2, 9): the stat shows the size
  of the force; the multipliers and modifiers (technology,
  infrastructure, allies, defence, terrain) apply only when war is
  evaluated or fought, with a **margin of error** in a country's own
  estimate that depends on its government type and temperament.
- **Medical's niche** (system 3): decide whether medical earns its place
  as a stat or folds into technology and infrastructure. Review verdict
  recorded under system 3: keep it, narrowed to the outbreak, with
  upkeep and a technology multiplier.
- **Population as a modelled quantity** (systems 2, 3, 4, 5, 6, 9, 12):
  grows under food and water surplus and good medical care; consumes
  food and water per head; supplies labour to production of every kind;
  is capped by infrastructure, technology and medical and by country
  size (area from the map polygons) and urban share; slows drift as it
  grows; shrinks under famine, war, disaster and emigration. Growth
  pressure against the caps is what makes overshoot and collapse
  possible.
- **Upkeep and decay** (systems 3, 5, 8): infrastructure, military and
  medical each cost treasury every day and decay when unpaid; not paying
  a kind of upkeep is a decision.
- **Scale**: with population in the model, stats can stay per-head
  levels on 0..100 while population supplies the size, so production =
  population × level × multipliers, and consumption = population × need
  per head. That resolves "Singapore's 95 equals America's 95" without
  changing what a stat means.

Systems, in the order reviewed:

1. Clock and world state
2. Countries and seed data
3. Stat drift
4. Resources and supply
5. Treasury
6. Links and flows
7. Relations and pairs
8. Decisions
9. War and occupation
10. Government
11. Events and weather
12. Outbreak coupling

---

## 1. Clock and world state

Owner: `js/world.js` (`tickClock`, `dayTick`, `newWorld`, the pack
table); the speed comes from `js/host.js` through `window.ENTITY_CLOCK`.

### What it does

The world advances in **in-game days**. Real time accumulates at the
bench's speed (the 1×/2×/4×/8× control, default 4×) and every `dayMs`
of accumulated time runs one `dayTick()`. The clock stops when the bench
is paused or a job offer is on screen (`ENTITY_CLOCK.running`) and while
the tab is hidden. If the page stalls, at most `maxCatchup` days are run
in one go and the rest of the backlog is dropped, so a long freeze never
fast-forwards the world.

A day tick runs these steps in this order:

1. `day += 1`; a fresh random stream for the day is derived from the
   world seed and the day number, so every roll of the day is
   reproducible and a mid-day save reloads exactly.
2. Links: today's flows are computed; every seventh day link capacities
   are refreshed from the stats at both ends.
3. Treasury: each country's income line is applied.
4. Drift: each country's stats move toward their targets; the resource
   floor is written into the `resources` stat here.
5. Migration moves population.
6. Outbreak, only if any country is covered: spread over links, then
   detection, government action and response.
7. Wars advance and occupations tick.
8. Events roll for every country; every seventh day (offset by three)
   discoveries diffuse.
9. Decisions: every country whose decision day matches `day mod 28`
   takes its monthly decision (an occupied country's is taken by its
   occupier).
10. Government: collapse, elections, foreign coups, releases.
11. Every thirtieth day a monthly sample of economy, stability,
    resources and military is stored for the country screen.
12. The response meter is updated, the map recoloured (throttled), and
    `entity:day` is dispatched for the UI.

The **calendar** maps day 0 to 1 January 2031 and prints real Gregorian
dates. Speed arithmetic at the defaults: a day is 10 s at 1×, so 2.5 s
at 4×; a year is about 15 minutes at 4×.

**World state** is the seed, the day, the list of active wars, the war
counter, diffusions in progress, the massive-event timers and the news
log. The log keeps the last `logCap` headlines; each headline is dated,
carries a severity (small, large, massive) and the countries involved,
and is dispatched to the wire as it lands.

**Agents** are exactly the countries the map draws: every shape and
every micro-state dot marker (205 with the 110 m map). Before the map
has loaded, every code in the region table is seeded so the world can
run; when the map arrives, territories with no shape or marker are
dropped. Trade deals inside the curated friendly blocs are seeded on day
0 once links exist.

**Persistence**: a save (`v: 4`) stores the world block, every country
through one pack table (a new field is one table row), the pairs, the
player and the bounties. Loading rebuilds a fresh world on the saved
seed and lays the saved state over it. v2 and v3 saves still load: a new
world on a random seed with only the saved outbreak fields laid over it.
Derived things (links, supply, weather, temperament) are never saved.

### What it touches

Everything downstream runs inside `dayTick` in the order above; the
order is a design choice (treasury before drift, outbreak before wars,
events before decisions, decisions before government). The bench sets
the speed; the map and wire read the day. The outbreak runs on the same
clock, so slowing the world slows the outbreak in real time.

### Defaults and levers

| Lever | Default | Meaning |
|---|---|---|
| `dayMs` | 10000 | real milliseconds per day at 1× |
| `maxCatchup` | 4 | days run per tick after a stall, at most |
| `logCap` | 200 | headlines kept |
| bench speed | 4× | shared with the world; 1×, 2×, 4×, 8× |
| decision stagger | 28 days, *fixed* | one decision per country per 28 days, on a seeded day |
| monthly sample | 30 days, *fixed* | history resolution for the country screen |
| calendar epoch | 1 Jan 2031, *fixed* | |
| map resolution | 110 m, *fixed* | decides which countries exist |

### Assumptions built in

- One shared clock: the outbreak, the countries and the calendar all
  move together. Nothing on the map has its own timescale.
- Every rate downstream is *per in-game day*. Changing `dayMs` changes
  how the whole map feels in real time without changing any outcome.
- A country decides once every 28 days, never in between, except the
  outbreak reaction, which can fire on any day.
- The world starts ticking at page load, before the map has arrived; a
  couple of days can pass without links, flows or trade.
- The news log is short (200) and is the only record of past events;
  anything older than that is gone except for what the country screen
  keeps itself (eight decisions, 36 monthly samples).
- Determinism holds for a seed as long as the map is the same and loads
  before the first day that needs it.
- Only the player and the outbreak persist across the v3 to v4 boundary;
  an old save gets a brand new world.

### Requested changes

*(to be filled in from the review)*

---

## 2. Countries and seed data

Owner: `js/data.js` (the rows), `js/countries.js` (`initStats`,
`temperament`, the climate zones), `js/geo.js` (regions).

### What it does

Every country on the map has **one row** in `js/data.js`, nineteen
named columns: region, population (millions, 2023), urban share, climate
zone, political freedom, government type, then the seven levels
(infrastructure, economy, military, academia, medical, stability,
technology), the two government axes (authority, economic openness) and
the four native endowments (energy, materials, food, water). Levels and
axes are 0..100; economy is the output-per-head index (85 and up rich,
60-80 upper-middle, 40-60 middle, 20-40 low, under 20 failed) and
becomes `output`; the six others are the stats a country holds.
Endowments are relative to the country's own need: 50 makes what it
uses, 80 and up exports, 20 imports most, 5 or less has nothing. The
world normaliser (system 4) scales each type so the world opens at
`worldBalance0`; the columns decide who has it.

- **248 rows, all hand-set**, one per code the map knows (including the
  Somaliland, Northern Cyprus and Siachen sentinels and the dependencies
  the 110m map does not draw). No region baseline is used unless a map
  code has no row, which the smoke test forbids.
- **Noise.** The six levels and the three axes get plus or minus 5 of
  seeded noise (`SEED_NOISE`, `unit(seed, iso, "n:" + key)`), so no two
  worlds are the same and the same seed always gives the same one.
  Population, endowment, zone and type are exactly the row.
- **Scenery.** A code with fewer than `AGENT_MIN_POP` (0.05 M) people is
  scenery: on the map with a name and a region, in the region's
  population, but with no state, no economy, no decisions and no famine
  (35 codes: the Vatican, Monaco, Liechtenstein, Tokelau...).
  `DATA.isAgent` is the one test; `WORLD.ensureCountry` returns null for
  scenery and the deploy and country screens refuse it.
- **Government** is read straight from the row: freedom and type
  (`elected`, `party`, `hereditary`, `military`); `derivedFreedom` and
  `derivedType` remain only for the region fallback. Managed
  democracies are `elected` with freedom between 10 and 35.
- **Climate zone and urban share** are per country now (system 11 and
  `popCap` read them); the region still supplies temperature and
  humidity.

Other starting values: treasury from income (system 5); borders open; a
seeded decision day (0..27); no election scheduled; not occupied; no
weariness; no drought or flood; empty histories.

**Temperament** is four seeded traits in 0..1, derived and never saved:
`aggr` (war), `science` (research and wants), `caution` (risk), `thrift`
(growth and the reserve).

**Tables beside the rows** that other systems read: the mountain-border
capacity table (30 borders), the micro-state border list and landlocked
set, the dot-marker areas, and the rivalry table of opening relations
(system 7).

**The review list.** `tools/probes/defaults.js` checks the rows against
the map (every code has a row, every agent has people, scenery is under
the line), flags rule breaches (a technology far above its academia, a
sham election, an unknown zone or type), reports the population picture
(the smallest agents, anyone over or near capacity) and the endowment
picture (the day-one world balance, who is short before trade, the
region means), and lists every row that stands out against its region's
median; `docs/defaults-review.md` holds the last run.

### What it touches

Rows set every stat that drift (3) then moves; the endowments feed
supply (4); population feeds flows (6), the meter (12), capacity and who
may fight (9); temperament feeds decisions (8) and war (9); the zone and
urban share feed events (11), the outbreak (12) and capacity. Nothing
else writes to the rows; a new world re-reads them. A version-7 save
carries its own countries over the rows, so an old save keeps its old
micro-state populations.

### Defaults and levers

All of this is **data, not config**: none of it is in the Config panel.

| Lever | Default | Where |
|---|---|---|
| rows | 248 codes, 19 columns | `DATA.ROWS` |
| scenery line | 0.05 M | `DATA.AGENT_MIN_POP` |
| noise | plus or minus 5 on nine values, *fixed* | `SEED_NOISE` in `initStats` |
| region fallback | 6 rows, for a map code with no row | `DATA.REGION_ROW` |
| climate per region | 6 rows (temperature, humidity) | `REGION_ENV` |
| temperament | 4 traits, uniform 0..1 by seed | `temperament` |

### Assumptions built in

- Levels are relative impressions on one 0..100 scale; there is no
  absolute size anywhere except population and area. A 95 economy in
  Singapore and in the United States are the same number per head.
- Endowments are relative to need, not absolute reserves, and never
  deplete.
- Temperament is fixed for the life of a world.
- Agents are exactly what is on the map: a row for a code the 110m map
  does not draw (Hong Kong, Puerto Rico's neighbours, the overseas
  departments) counts in its region's population and nothing else.
- Values are one person's impressions of the world in 2023; the review
  list, not the code, is where they are argued with.

### Requested changes

- **Rename the resource type `minerals` to `materials`** everywhere: the
  type key, the seed columns, tooltips, the country screen, the
  discovery headline, config labels. The saved `res` array is
  positional, so no save migration.
- **A granular climate model** in place of the six regional monoliths.
  The requirement: climate and weather must vary *within* a region in
  the same year, as they do in reality (under an El Niño some of Africa
  floods while other parts face severe drought). Shape to settle in the
  plan:
  - climate becomes **per country**: temperature, humidity and urban
    share as country rows with the region as fallback, plus a **climate
    zone** (for example tropical wet, monsoon, savanna, arid,
    mediterranean, temperate, continental, boreal, highland) that sets
    the hazard mix and how the country answers the global pattern;
  - a **global oscillation**, an ENSO-like yearly index from the seed
    with a multi-year cycle, that pushes different zones in different
    directions (an El Niño year: the Horn of Africa and the southern US
    wetter, southern Africa, Australia and Indonesia drier; La Niña the
    reverse);
  - each country's yearly anomaly (system 11) becomes the zone's
    response to the oscillation, plus coherence with its neighbours,
    plus local noise, so neighbours mostly share a year but a continent
    does not.
  - Downstream readers switch from the region's climate to the
    country's: the outbreak's environment compatibility (12), hazard
    weights (11), food and water supply (4).
- **Separate session** on the curated defaults (see the reminders at
  the top): done, September 2026 (`js/data.js`, above).

---

## 3. Stat drift

Owner: `js/countries.js` (`driftTargets`), `js/world.js` (`driftAll`,
`driftContext`).

### What it does

Every day, every stat except `resources` moves a fraction of the way
toward a **target** computed from the country's other stats and
situation, plus a little noise:

`stat += (target − stat) × rate + uniform(−driftNoise, +driftNoise)`

Economy and stability use the fast rate (`driftFast`, 1 % of the gap per
day: about 70 days to close half of it); everything else the slow rate
(`driftSlow`, 0.3 %: about 230 days). Results are clamped to 0..100.

The targets (weights *fixed* in code, drags from config):

| Stat | Target |
|---|---|
| economy | `min(base, floor)` where base = .35 infra + .25 technology + .25 stability + .15 openness + trade bonus + visitor bonus − sanctions − recession − war drag − outbreak drag |
| infrastructure | .7 economy + .3 technology |
| military | .5 economy + .3 authority + 20 while at war |
| academia | .5 economy + .3 openness + .2 technology |
| medical | .5 economy + .3 infrastructure + .2 academia |
| stability | .4 economy + .2 infrastructure + .2 medical + .2 × (100 − \|authority − 55\|) − 15 while at war − `occupiedStab` while occupied − coverage × `outbreakStabDrag` − weariness × `wearyStab` |
| technology | .7 academia |
| resources | not drifted; written from the supply floor (system 4) |

Economy's extra terms: trade bonus = min(10, deals × `tradeBonus`);
visitor bonus = min(10, tourists in × `tourismYield`) + min(5, emigrants
× `remitYield`); sanctions = 4 per sanctioning country, at most 3
counted; recession = 15 during a global recession; war drag =
`warDragEco`; outbreak drag = coverage × `outbreakEcoDrag`; and the whole
base is capped by `floor`, the lowest resource supply.

Drift is the slow background. **Step changes** come from other systems:
investment (+`investStep`), research (+`researchStep` technology, +1
academia), events (disasters, booms, recessions, protests), war
attrition (economy, infrastructure, stability, military per day),
victory and defeat, discoveries and adoptions.

### What it touches

The economy is the hub: five of the other stats follow it, and it
follows infrastructure, technology and stability back, so the whole
block settles together. Academia feeds technology, which feeds
infrastructure and military strength and desalination (4, 9).
Stability reads the government axes (10) and the outbreak (12). Flows
(6) and sanctions (7) enter through the economy target; supply (4)
caps it; wars (9) drag economy and stability and lift the military
target; occupation (9) drags stability. Treasury (5) reads the economy
and military after drift.

### Defaults and levers

| Lever | Default | Meaning |
|---|---|---|
| `driftFast` | 0.01 | economy and stability, fraction of the gap per day |
| `driftSlow` | 0.003 | the other stats |
| `driftNoise` | 0.15 | daily uniform noise, ± points |
| `tradeBonus` | 2 | economy target per trade deal, capped at 10 |
| `tourismYield` | 0.02 | economy target per unit of tourists in, capped at 10 |
| `remitYield` | 0.05 | economy target per unit of emigrants, capped at 5 |
| `warDragEco` | 15 | economy target while at war |
| `occupiedStab` | 25 | stability target while occupied |
| `outbreakEcoDrag` | 20 | economy target × coverage |
| `outbreakStabDrag` | 30 | stability target × coverage |
| `wearyStab` | 0.1 | stability target per point of war-weariness |
| target weights | *fixed* | the table above |
| sanction drag | 4 each, at most 3 counted, *fixed* | |
| war lift on military | +20, *fixed* | |
| authority centre | 55, *fixed* | the most stable authority |

### Assumptions built in

- Targets are linear blends of other stats: there is no growth engine.
  Left alone, a country's stats converge on a fixed point set by its
  openness, its authority and its resource floor, and stay there. The
  only ways up are investment, research, discoveries, trade and
  visitors; the only ways down are drags, attrition and events.
- The economy cannot aim above its lowest resource supply, but supply
  above the base does nothing: resources cap, never push.
- Noise is a random walk of ±0.15 a day, roughly ±3 points over a year;
  it is what keeps identical curated countries from staying identical.
- Authority 55 is the most stable government; both extremes unsettle
  equally, and openness has no direct effect on stability.
- Technology depends on academia alone; research pushes it in steps.
- Military grows while at war (+20 target) and is spent by attrition at
  the same time; the net depends on the war.
- Population plays no part in any target.
- Nothing decays on its own: infrastructure and medical stand until an
  event or a war takes them down, or the economy under them sinks.
- Every country drifts at the same rates; there is no notion of
  institutional speed or inertia per country.

### Requested changes

- **Technology becomes a set of multipliers** (see cross-cutting): on
  resource production, on the economy, on military effectiveness, each
  its own factor. Today technology enters as a blend weight (25 % of
  the economy target, 30 % of infrastructure's, 20 % of academia's), a
  factor `0.7 + 0.3 × tech/100` on military strength, and a step from
  research, discoveries and adoption.
- **Infrastructure becomes a smaller multiplier with upkeep and caps**
  (see cross-cutting): a lower factor on the same things, a daily
  treasury cost, and it raises the caps: economy, military, the number
  of trade partners, and others to be listed in the plan. Today it is a
  blend weight (35 % of the economy target, 30 % of medical's, 20 % of
  stability's) and a factor `0.5 + infra/200` on military strength.
- **Military is a raw force number**; multipliers apply only when war
  is evaluated or fought, with a margin of error by government type and
  temperament (see cross-cutting; detail under system 9).
- **Medical, review verdict**: keep it, but narrow it. Its niche is
  the outbreak: it sets how fast a country notices (detection) and how
  hard it pushes back (response), and it is the lever a country pulls
  when it reacts — that is what the player plays against, and neither
  technology (research) nor infrastructure (roads) stands in for a
  health system. Drop or shrink its generic role in the stability blend,
  give it upkeep like infrastructure, and let technology multiply it.
- **Assumptions to revisit** (which ones to keep or drop, to confirm):
  - *no growth engine* — with production multiplied by technology and
    infrastructure there is one; the blend targets become the floor,
    not the ceiling;
  - *resources cap but never push* — under a production model
    resources should feed the economy, not only cap it;
  - *nothing decays* — infrastructure upkeep implies decay when unpaid;
  - *population plays no part* — a raw military number and production
    both want a size term;
  - *every country drifts at the same rate* — government type could set
    inertia.
- **Decided in review: a growth engine, or at least growth pressure,
  that can overshoot and collapse**, thematically like a plate: growth
  pushes against caps; past them, famine, unrest and collapse follow.
- **Population becomes a modelled quantity** (see cross-cutting): a
  consumer of food and water; an input to infrastructure, technology,
  economy, military and medical; capped by infrastructure, technology
  and medical, and by country size and urban share. Higher populations
  drift more slowly (inertia).
- **Upkeep with decay**: infrastructure, military and medical cost
  upkeep and decay when it is not paid; choosing not to pay one kind of
  upkeep is a decision a country can take (system 8).
- **Bench parallels** to keep as a design lens: hunters ↔ wars,
  substrates ↔ resources, bank and upkeep ↔ treasury and upkeep,
  division threshold ↔ growth, senescence ↔ decay, the plate's
  carrying capacity ↔ the caps. Others as they turn up.
- Of the five assumptions above, the review drops *no growth engine*,
  *nothing decays*, *population plays no part* and *every country
  drifts at the same rate*; *resources cap but never push* is replaced
  by the production model under system 4.

---

## 4. Resources and supply

Owner: `js/world.js` (`computeSupply`, `supplyOf`, `floorOf`,
`supplyDetail`, `meanRes`), endowments in `js/countries.js`, the find
event in `js/events.js`.

### What it does

Each country has a **native endowment** per type (energy, materials,
food, water: 0..100, relative to its needs, from the seeds) and a
**supply** per type, computed on demand and memoised for the day:

`supply_k = clamp(0, 100,`
`  native_k × weather_k`
`  + Σ over trade partners of share × max(0, partner.native_k − native_k)`
`  + occupyRes × Σ over countries it occupies of their native_k`
`  − occupyRes × native_k if it is occupied itself`
`  + desalination (water only))`

- `share` = `tradeShare`, × `waterTrade` for water, × `farTrade` for a
  deal with a country it has no link to.
- `weather_k` applies to food and water only: this year's rainfall
  anomaly (system 11) scaled by `foodWeather` / `waterWeather`, then a
  drought halves water and cuts food by `droughtFood`, a flood cuts food
  by `floodFood`, for as long as the mark lasts.
- desalination = `desalWater × economy/100 × (0.5 + energy supply/200)`:
  water made from money and energy.

The **floor** is the lowest of the four supplies. It is written into
the `resources` stat every day and **caps the economy target** (system
3): the economy cannot aim above its scarcest supply. Nothing else
reads supply as a quantity; it is a level.

Endowments change only by the **resource find** event (+`resourceFind`,
doubled for a large find, on one type chosen at random) and never
deplete. Treasury (system 5) pays `resourceIncome` per point of the
*mean native* endowment as exports, regardless of shortage.

Anything that changes deals or occupations invalidates the memo; the
country screen reads the itemised breakdown (`supplyDetail`).

### What it touches

Endowments come from the seeds (2); deals (7, 8) and occupation (9)
change supply; weather and disasters (11) change food and water; supply
caps the economy (3) and pays exports (5). Trade and war decisions (8,
9) are scored by how far a deal or a conquest would lift the floor.

### Defaults and levers

| Lever | Default | Meaning |
|---|---|---|
| `tradeShare` | 0.4 | share of a partner's surplus a deal secures |
| `waterTrade` | 0.3 | water's share of that (pipelines, not tankers) |
| `farTrade` | 0.7 | a deal beyond the links carries this much |
| `occupyRes` | 0.5 | share of an occupied country's endowment taken |
| `waterWeather` | 0.3 | water swing at a full-strength anomaly |
| `foodWeather` | 0.15 | food swing at a full-strength anomaly |
| `droughtFood` | 0.3 | food lost while a drought lasts (water halves, *fixed*) |
| `floodFood` | 0.2 | food lost while a flood lasts |
| `desalWater` | 60 | water made at full economy and energy |
| `resourceFind` | 5 | endowment gained by a find (×2 large) |
| `resourceIncome` | 0.2 | treasury per point of mean endowment per day |
| four types | *fixed* | energy, materials (was minerals), food, water |
| the floor rule | *fixed* | the lowest supply caps the economy |

### Assumptions built in

- Supply is a **level**, not a quantity: nothing is produced,
  consumed, stored or priced. A country with supply 60 in food is
  "well enough fed", not "has 60 units".
- Endowments never deplete and are only ever relative to the country's
  own needs; population does not enter.
- A trade deal creates supply from nothing: the importer gains a share
  of the exporter's surplus and the exporter loses nothing. The same
  surplus can be shared with any number of partners.
- Water travels at 30 % of the rate of everything else; desalination is
  free apart from needing a rich economy and energy.
- Weather and disasters touch only what a country grows itself, never
  its imports.
- Occupation moves half of an endowment, permanently for the term,
  regardless of distance or logistics.
- No substitution: a food shortage cannot be eased by energy or money,
  only by food.
- Anything above 100 is wasted; a surplus has no value beyond what
  partners take.

### Requested changes

- **Trade becomes real transfers** (from the cross-cutting list): a
  deal moves an amount of a named resource from exporter to importer
  for a period; the exporter loses what the importer gains. With the
  population model this fits a **production and consumption** view of
  resources, to be settled in the plan:
  - each type has a daily **production** (endowment × population share
    × technology and infrastructure multipliers) and a daily
    **consumption** (food and water per head; energy and materials
    scaling with the economy and the military);
  - the **balance** (production + imports − exports − consumption) is
    what a country lives on; a deficit is a shortage that caps growth
    and, for food and water, starves the population; a surplus is what
    a country can sell;
  - deals name a type, an amount per day and a term; sanctions and war
    end them; the importer's shortage is what makes a deal attractive
    and the exporter's surplus is what makes it possible;
  - stockpiles are an open question (a buffer would let a country ride
    out a drought or a broken deal);
  - the "floor caps the economy" rule becomes "shortage caps growth",
    per type, with food and water hitting population first.
- Weather still acts on production, now including what is exported.
- `minerals` → `materials` (system 2).
- **Decided in review:**
  - **Native endowment and supply are separate concepts.** The central
    economic tension is a nation working out how to *access and
    maximise its native endowment* (infrastructure, technology,
    population, upkeep), then *leveraging it into more supply and more
    stats by trading on the world stage*. The systems must actualise
    that: endowment is potential, production is what is actually
    reached, supply is what the country has after trade.
  - **The supply floor governs economic growth only.** Other stats and
    systems care about one or a few resources each, and may *produce or
    consume* them (the army burns energy and materials; hospitals need
    water and energy; population eats and drinks), which sets up a
    tension between the economy and those stats.
  - **Supply is a quantity.**
  - **A deal never creates supply from nothing.** Technology is the
    exception: a deal or pact can create it for the receiver, up to a
    percentage of the provider's level, without loss to the provider
    (see cross-cutting; technology's own model is to be reworked).
  - **Endowments never deplete.** Population, on the other hand, grows,
    moves and dies (disasters, wars).
  - **No substitution**, and trade is not substitution.
  - **"Anything above 100 is wasted" is not accepted as is**: caps that
    infrastructure adjusts should at least move the waste threshold
    (storage and capacity scale with infrastructure).
- **Candidate new system: a global resource exchange.** Money buys and
  sells each resource at a world price found by the exchange; prices
  give nations a yardstick when they evaluate and balance bilateral
  deals; money becomes worth something. It needs its own decision model
  (why buy on the market rather than sign a deal: reliability, price,
  relations, sanctions) and a price-finding mechanism. Parked here until
  the treasury (5) and decisions (8) have been reviewed.

---

## 5. Treasury

Owner: `js/world.js` (`incomeLine`, `treasuryAll`), spending in
`js/decide.js` (executors, war chest), `js/events.js` (aid, booms,
recessions), occupation skim in `js/decide.js`.

### What it does

Each country has one **money pool**, 0..`treasuryCap`, starting at twice
its economy. Every day:

`treasury += economy × treasuryIncome + mean endowment × resourceIncome`
`            − military × militaryUpkeep − wars × warCost`

then the occupation skim (below), then clamp. That is the whole income
line; the country screen shows it itemised.

**What money buys** (all in the monthly decision, system 8):

| Spend | Cost | Gain |
|---|---|---|
| invest in a stat | `investCost` | +`investStep` to infrastructure, military, academia, medical or stability |
| research | `researchCost` | +`researchStep` technology, +1 academia |
| a war | `warCost` per day while it lasts; needs `warChest` on hand to declare | |
| aid | `aidFrac` of the donor's treasury | to a friend hit by a large disaster |

An option a country cannot afford is scored `−treasuryGuard` lower, so
poor countries drift toward the free choices (borders, deals, pacts,
hold).

**What money is taken by**: a lost war (tribute: `tribute` of the
treasury plus `tributeRes` per point of mean endowment, to the winner);
occupation (`occupySkim` of the occupied country's economy income, every
day, to the occupier); a global recession (20 % of every treasury, once).
**Given by** a boom event (+100 small, +300 large).

### What it touches

Income reads the economy and endowment (3, 4); upkeep reads the
military; wars (9) cost per day and gate on the chest; decisions (8)
spend it; events (11) add and remove lumps; occupation (9) moves it
between countries. Nothing reads the treasury for anything else: it is
not a stat, feeds no target, and has no effect on stability or the
economy when empty.

### Defaults and levers

| Lever | Default | Meaning |
|---|---|---|
| `treasuryIncome` | 0.5 | per point of economy per day |
| `resourceIncome` | 0.2 | per point of mean endowment per day |
| `militaryUpkeep` | 0.15 | per point of military per day |
| `warCost` | 6 | per war per day |
| `treasuryCap` | 1000 | the pool's ceiling |
| `investCost` / `investStep` | 60 / 5 | |
| `researchCost` / `researchStep` | 80 / 3 | |
| `warChest` | 300 | needed on hand to start a war |
| `treasuryGuard` | 1 | scoring penalty on an unaffordable option |
| `aidFrac` | 0.02 | share of a donor's treasury sent as aid |
| `tribute` / `tributeRes` | 0.3 / 3 | taken from a loser's treasury; indemnity per endowment point |
| `occupySkim` | 0.5 | share of an occupied country's income taken |
| starting treasury | 2 × economy, *fixed* | |
| boom / recession lumps | +100/+300, ×0.8, *fixed* | |

### Assumptions built in

- One pool, no debt, no interest, no prices: money is a counter.
- Income is linear in the economy stat, so a country of 5 M and one of
  1,400 M with the same economy earn the same; population is absent.
- The cap is low against income: a large economy nets 40–50 a day and
  fills the pool in three weeks; from then on money never constrains
  it, and only the poor ever feel the treasury guard. In practice money
  is worth little once a country is rich.
- Only the military has upkeep; infrastructure and medical are free to
  hold (changing under system 3's requests).
- Spending has two shapes only, invest and research, each a fixed
  price for a fixed step; there is no scaling, no diminishing return,
  no bulk.
- Exports pay on the mean endowment whether or not the country is
  short of that very resource, and whether or not anyone buys.
- An empty treasury has no consequences beyond blocking spending: no
  unrest, no decay, no default.

### Requested changes

- **The pool's ceiling becomes 100,000.**
- **Endowment pays no income directly.** Money comes from selling
  excess or less-needed resources on the global exchange (system 4's
  candidate) or from bartering them in diplomatic agreements. Prices
  come from the exchange.
- **Investments take time to pay off**, not instantly: the payoff
  arrives over a period, modified by the current level of the stat,
  population, technology and infrastructure.
- **Debt**: the treasury may go negative; a flat interest rate is
  charged on the negative balance.
- **Money can be a term of a diplomatic agreement** (a payment or a
  subsidy inside a deal or pact), alongside resources and technology.
- From earlier systems: **upkeep with decay** for infrastructure,
  military and medical, with skipping a kind of upkeep as a decision
  (system 3); the **global exchange** as the market where money buys
  resources (system 4).

---

## 6. Links and flows

Owner: `js/links.js` (`rebuild`, `refreshCapacity`, `flows`), border
and coast data from the map hand-off in `js/map.js`, the mountain table
and micro-state borders in `js/countries.js`.

### What it does

Three kinds of **link** join countries, built once per world from the
map and never saved:

- **Land**: every pair of shapes that share an edge on the map; the
  border's length in km comes from the shared arcs; a mountain table
  gives 30 borders a *range* factor (Himalaya 0.1, Andes 0.35, Alps
  0.5 …). The micro-state dot markers get their borders from a list.
- **Sea**: each coastal country to its `seaK` nearest coastal
  countries by distance; coastline length comes from the map's
  unshared arcs; markers count as coastal unless listed landlocked.
- **Air**: each country to the `airK` partners its hub reaches best,
  scored `hub × hub × exp(−distance / airRange)` with `hub = (economy +
  infrastructure)/200 × population^0.4`, evaluated on the seeded stats
  at world creation.

With the 110 m map that is 320 land, 820 sea and 1,576 air links.

Each link has a **capacity**, refreshed weekly from the stats at both
ends (`infraF = 0.5 + (infraA + infraB)/400`):

| Type | Capacity |
|---|---|
| land | `landCap × √km × range × infraF` |
| sea | `seaCap × √min(coastline) × exp(−km / seaRange) × infraF` |
| air | `airCap × hubA × hubB × exp(−km / airRange) × infraF` |

Every day each link carries a **flow in each direction**, made of
tourists and migrants:

- policy = border factor at A × border factor at B (open 1, restricted
  `borderRestricted`, closed `borderClosed`), × `warFlow` across a war,
  × `travelBan` under an outbreak travel ban;
- tourists A→B = capacity × emit(A) × attract(B) × season(B) × policy,
  with emit = economy/100 × √population, attract = (.4 economy + .3
  infrastructure + .3 stability)/100 × (.5 + openness/200), and season
  = 1 + `seasonAmp` × cos of the day of year around a mid-July peak in
  the north and mid-January in the south;
- migrants A→B = `migBase` × max(0, (economy + stability gap in B's
  favour))/100 × openness(B)/100 × capacity × policy.

The flows feed three things: the outbreak hops along them (12) in
proportion to flow × coverage; tourists in raise the economy target
(`tourismYield`, 3); migrants move population (`migPopScale`) and
emigrants send remittances into the economy target (`remitYield`, 3).

### What it touches

Built from the map (1) and the seeds (2); capacities read
infrastructure, economy and population; flows read borders (8), wars
(9), travel bans (12), the economy and stability. Links define who a
country can deal, sanction, pact and fight with (8, 9), where aid,
contagion and diffusion travel (11), the reach of a war and the terrain
of its defence (9), and where the outbreak can go (12). Flows themselves
carry nothing but people.

### Defaults and levers

| Lever | Default | Meaning |
|---|---|---|
| `landCap` / `seaCap` / `airCap` | 0.5 / 0.2 / 0.05 | capacity scale per type |
| `seaRange` / `airRange` | 4000 / 8000 km | distance falloff |
| `seaK` / `airK` | 8 / 8 | partners per country by sea and air |
| `seasonAmp` | 0.4 | tourism swing over the year |
| `migBase` | 0.01 | migration rate |
| `borderRestricted` / `borderClosed` | 0.4 / 0.05 | flow through a restricted or closed border |
| `warFlow` | 0.1 | flow across a front |
| `travelBan` / `travelBanDays` | 0.2 / 90 | flow under a ban, and how long one lasts |
| `tourismYield` / `remitYield` | 0.02 / 0.05 | economy target per unit of tourists in / emigrants |
| `migPopScale` | 0.001 | population per unit of net migration |
| mountain table | 30 borders, *fixed* | range factor per border |
| micro-state borders | 7 pairs, *fixed* | |
| hub, emit, attract, season formulas | *fixed* | |

### Assumptions built in

- The graph is fixed for the life of a world: air partners are chosen
  once from the seeded stats and never re-chosen as economies rise and
  fall; new sea routes never open.
- Eight sea and eight air partners each, whatever the country's size.
- A flow is a unit with no meaning beyond its relative size; it is
  people, and it carries no goods. Trade deals do not use links at all
  except to decide who is a partner.
- Migration runs only toward a better economy and stability, gated by
  the destination's openness; nobody flees a war or a disaster, they
  merely travel less across a front.
- Migration has no capacity limit at the destination and moves
  population slowly (a thousandth of a unit per migrant unit).
- Tourists are attracted by wealth, order and openness, never by
  climate, coast or culture.
- Seasons are hemisphere-only: the same peak for Norway and Egypt.
- Borders act symmetrically and on every kind of traveller alike; a
  closed border does not touch deals.
- The map's shapes decide land borders, so France borders Brazil and
  Suriname through French Guiana.
- Capacity grows with the square root of border length and with
  infrastructure at both ends, and that is all.

### Requested changes

- **War reach depends on technology level** (with system 9): a
  low-technology country can only wage war over a land link; a
  medium-technology one over sea links too; a high-technology one over
  air links and against *any coastal nation on earth*, provided it is
  itself coastal. The thresholds are to be set in the plan.
- **People flee wars and disasters**: refugee flows out of a country
  at war or struck by a large disaster, on top of the wealth-seeking
  migration that exists today.
- More may change here in the whole-picture pass (population moving
  from system 4; resource transfers possibly riding link capacity).

---

## 7. Relations and pairs

Owner: `js/world.js` (`PAIRS`, `baseRel`, `pairOf`, `relOf`, `shiftRel`,
`pairCounts`), the rivalry table in `js/countries.js`; the moves come
from `js/decide.js`, `js/events.js` and `js/gov.js`.

### What it does

Every pair of countries has one **relations** number, −100 hostile to
+100 friendly, plus flags: a trade deal (the day signed), a defence
pact (the day signed), sanctions each way, and the id of a war between
them. A pair record exists only once something has touched it; until
then relations are read from a **baseline**:

- the rivalry table, if the pair is in it (42 pairs: KP–KR −90, CN–TW
  −80, RU–UA −80, IL–IR −85, IN–PK −70 …, and the friendly blocs CA–US
  80, GB–US 80, AU–NZ 85, DE–FR 75, the Nordics …);
- otherwise 0, +15 for the same region, +5 for a shared land border,
  −0.3 per point of difference in authority.

Relations move in **steps**, never on their own:

| Move | Change |
|---|---|
| trade deal signed | +10 |
| defence pact signed | +10 |
| aid received | +5 per donor |
| sanctions imposed | −15 (and the deal between them ends) |
| travel ban | −5 |
| war declared | set to −80 or worse |
| peace | +`peaceRel` (40), and at least `truceRel` (−30) |
| stalemate | +20, and at least −40 |
| victory | set to −60 |

Relations gate what a country may do to another (system 8): a deal
needs relations ≥ 0, a pact ≥ 30, sanctions ≤ −30, a war < `warRelMax`
(20) and no pact or deal between them. Enmity in the war motive (9) is
the square of hostility. Aid flows to friends at ≥ 20 or pact partners.

**Pacts** never dissolve. A pact adds 30 % of an ally's army to a
country's strength (`pactShare`, 9), shares outbreak response
(`pactShareResp`, 12), spreads discoveries (`diffusePact`, 11), and
lists the ally as standing with the country when war is declared.
**Sanctions** never lift. A sanction against a country cuts its economy
target (3) and ends any deal. **Deals** (4, 8) end only by sanctions.

### What it touches

Baselines read region (2), land links (6) and authority (10); the
rivalry table is seed data (2). Decisions (8) read and move relations;
war (9) sets them; events (11) move them through aid and use pacts and
deals for contagion and diffusion; the outbreak (12) shares response
along pacts and moves relations through bans; government (10) uses
relations ≤ −50 to pick coup sponsors. Pairs are saved.

### Defaults and levers

| Lever | Default | Meaning |
|---|---|---|
| rivalry table | 42 pairs, *fixed* | opening relations for known pairs |
| baseline weights | +15 region, +5 border, −0.3 per authority point, *fixed* | |
| step sizes | table above, *fixed* except `peaceRel` 40 and `truceRel` −30 | |
| gates | deal ≥ 0, pact ≥ 30, sanction ≤ −30, *fixed*; war < `warRelMax` 20 | |
| `pactShare` | 0.3 | allies' army counted in strength |
| `pactShareResp` | 0.6 | response shared through a pact |
| seeded deals | pairs at ≥ 50 on day 0, *fixed* | |

### Assumptions built in

- Relations are **symmetric**: one number per pair, A feels about B
  exactly what B feels about A.
- Relations have **no memory and no drift**: nothing recovers or sours
  on its own; only the steps above move them. A truce at −30 stays −30
  for ever unless something else happens.
- Pacts are permanent and sanctions are permanent; there is no
  dissolving a pact or lifting sanctions, and no cost to holding either.
- The baseline sees only region, border and the authority gap;
  openness, ideology, history and trade all play no part in how two
  strangers start.
- The rivalry table overrides the baseline entirely rather than
  adjusting it.
- No third-party effects: allying with someone's enemy, or sanctioning
  someone's friend, changes nothing with the third country.
- A deal or pact is worth the same +10 whatever its size; every step is
  a fixed number.
- There is no public opinion, no reputation, no trust: a country that
  breaks nothing (there is nothing to break) is treated like any other.

### Requested changes

- **Finished goods** are not modelled; the economy stat can stand for
  them (a country's output of made things), so a deal in finished goods
  would be a deal in economy output or money.
- **Pacts can dissolve**: an ally that refuses to join a war leaves the
  pact (which implies joining a war is a decision an ally takes, system
  8, with a cost for refusing).
- **Sanctions become liftable**, and get a defined purpose. Today: −4
  on the target's economy target per sanctioning country (three
  counted at most), the deal between the two ends, −15 relations; the
  sanctioner pays nothing and has no reason ever to lift them. To
  design: what a sanction does to the target (under the transfer model,
  cutting its trade and exchange access is the natural effect), why a
  country levies one, why it lifts one, and its **cost as an
  opportunity cost**: diplomatic capital, that is, harm to relations
  with countries other than the target, traded for whatever the
  sanction achieves.
- **Third-party effects**: friend-of-friend and enemy-of-enemy. Deals,
  pacts, sanctions and wars between two countries move a third
  country's relations with each of them (allying with my enemy sours
  us; sanctioning my friend sours us; fighting my enemy warms us).
- **Mean reversion**: relations drift back toward the pair's *default
  attitude* (the baseline: region, border, government gap, rivalry
  table), not toward neutral.
- **Bigger deals give bigger relations bonuses**; the fixed +10 goes.
- **Trust** is a real concept but relations are an adequate proxy for
  it for now; no separate trust stat.
- From earlier systems: money and technology as deal terms (5), real
  resource transfers as what a deal moves (4).

---

## 8. Decisions

Owner: `js/decide.js` (`act`, `candidates`, `softmax`, `execute`,
`react`); the calendar hook in `js/world.js`.

### What it does

Once every 28 days, on its seeded decision day, a country **scores
every action open to it, draws one with a softmax over the scores, and
does it**. The likeliest option usually wins but any can: with
`decideTemp` 0.6, an option scored 0.6 higher is about 2.7 times as
likely. Exactly one action a month; the outbreak reaction (below) is
the only thing that happens between. The chosen action, its target and
its top three reasons are kept for the country screen.

The **menu** and the scores (U):

| Action | When offered | Score |
|---|---|---|
| invest in infrastructure, military, academia, medical or stability | the stat is below what the country wants | `wNeed` × (want − stat)/100, −`treasuryGuard` if it cannot pay `investCost` |
| trade deal | a linked partner at relations ≥ 0 with no deal and no war; plus up to 4 far suppliers of the binding resource | `wTrade` × (`wLack` × relief + `wGoodwill` × goodwill) − `dealCrowd` × deals held; offered only if positive; top 3 kept |
| sanction | relations ≤ −30, not already sanctioning, no war | `wSanction` × hostility × own economy/100; top 3 |
| pact | relations ≥ 30, no pact | `wPact` × (threat + relations)/100; top 3 |
| war | see system 9 | top 1 |
| peace | while at war | `wPeace` × (how badly it is going − 0.3), +0.5 below 30 stability |
| tighten borders | below closed | `wBorder` × (threat + unrest + war) × (0.5 + caution) |
| reopen borders | above open | `wBorder` × economic need − threat − war |
| research | always | `wResearch` × (science + technology gap)/2, −guard if it cannot pay `researchCost` |
| hold | always | 0 |

**Wants** (the investment targets): infrastructure 70, stability 65,
academia 55 + 25 × science, military 40 + authority/2, medical 50 +
40 × detection. **Threat** is the strongest hostile linked neighbour's
military edge over the country. **Relief** is how far a deal would lift
the binding resource (4). **Goodwill** is (openness + relations +
partner's economy)/300.

An **occupied** country's decision is taken with the occupier's
temperament and without any diplomacy: it can only invest, research,
adjust borders or hold.

**Outbreak reactions** (`react`, called by system 12) are a second,
narrower decision that fires the day detection first crosses
`reactFloor` and at most every 28 days after: tighten borders, fund
hospitals, emergency research, or a travel ban on the country that
looks like the source, scored by `wReact` × detection and the
temperament.

### What it touches

Reads stats and wants (3), supply and relief (4), the treasury (5),
links (6), relations and flags (7), war state (9), temperament (2),
detection (12). Writes stats and the treasury (invest, research), pairs
(deals, sanctions, pacts), borders (6, 12), wars (9), bans (12), and
the decision history.

### Defaults and levers

| Lever | Default | Meaning |
|---|---|---|
| `decideTemp` | 0.6 | softmax temperature: lower is more deterministic |
| `wNeed` | 1 | investment weight |
| `wTrade` / `wLack` / `wGoodwill` / `dealCrowd` | 0.6 / 3 / 0.1 / 0.02 | deal weight, shortage relief weight, goodwill weight, penalty per deal held |
| `wSanction` / `wPact` / `wBorder` / `wResearch` / `wPeace` | 0.5 / 0.6 / 0.5 / 0.5 / 0.8 | |
| `treasuryGuard` | 1 | penalty on an unaffordable option |
| `investCost` / `investStep` / `researchCost` / `researchStep` | 60 / 5 / 80 / 3 | |
| `wReact` / `reactFloor` / `travelBanDays` | 1.5 / 0.3 / 90 | reactions |
| wants | *fixed* | the targets above |
| cadence | 28 days, one action, *fixed* | |
| shortlist | top 3 per category, top 1 war, *fixed* | |

### Assumptions built in

- **One action a month.** A country cannot invest and sign a deal in
  the same month; it cannot do two investments; it never acts between
  decision days except to react to the outbreak.
- Scores are **myopic**: today's numbers only. Nothing is planned,
  saved for, or anticipated; a country does not see a war coming, does
  not stockpile, does not build up before striking.
- The wants are the same for every country (infrastructure 70,
  stability 65 …) apart from two adjustments, whatever its size,
  wealth, climate or situation.
- The softmax gives every listed option a real chance every month; a
  mildly bad idea is taken now and then by design.
- No budget: money is spent one purchase at a time at a fixed price;
  there is no allocation across upkeep, investment, research and war
  (upkeep decisions arrive with system 3's requests).
- Diplomacy is bilateral and immediate: a deal or pact is signed by one
  side's decision; the other side is not asked.
- An occupied country keeps its own stats but decides with its
  occupier's temperament.
- Reasons are the top three factors of the winning option only; the
  options rejected leave no trace.

### Requested changes

- **Myopia mitigated by government**: the government type shapes
  foresight (planning horizon, reserves, what it weighs), and
  governments are to become more complex than two axes later.
- **Wants set by government** too; that subsystem is to be worked out
  (system 10).
- **Three decision cadences** instead of one action a month: one
  resource purchase or sale on the exchange **a day**; one diplomatic
  deal or sanction **a week**; one war or investment **a month**. No
  investments while a war is ongoing (whether military investment is
  exempt is to decide).
- **Investments are amortised** over the whole month of the action:
  the cost drawn across the month and the payoff arriving over a period
  (system 5's request: modified by level, population, technology and
  infrastructure).
- Review notes: the daily market loop should be a rule (buy what is
  short, sell what is surplus, within a price and a reserve) rather than
  a utility draw; real transfers make deals two-sided, so a partner must
  accept a deal (an acceptance test on value in money, resources,
  technology or relations); amortised investments want a project
  record on the country.
- New decisions already implied elsewhere: which upkeep to pay (3),
  joining an ally's war (7), lifting sanctions (7), money and
  technology in agreements (5, 7).

---

## 9. War and occupation

Owner: `js/decide.js` (the war candidate, `declareWar`, `warTick`,
`endWar`, `strength`, `defended`, `occupy`, `occupationTick`),
`js/gov.js` (`defeatShift`), the world-war massive event in
`js/events.js`.

### What it does

**Whether to attack.** A war is one candidate in the monthly decision
(8), against a linked country the attacker is not at war with,
relations below `warRelMax`, no pact or deal between them, both able to
fight (population ≥ 0.5 M, not occupied), the target not at war. Its
score:

`U = aggression × edge × (greed + enmity) − warThreshold − weariness ×
wWeary − 1 if stability < 40 − 1 if treasury < warChest`

- **edge** = clamp(0..1, strength(attacker) / defended(target) −
  `warMinRatio`): only overwhelming force tempts;
- **strength** = (military × (0.7 + 0.3 × technology/100) + `pactShare`
  × allies' military) × (0.5 + infrastructure/200);
- **defended** = the target's strength × `defenceBonus` × (1 +
  `terrainDefence` × (1 − mountain factor of the border));
- **greed** = need + spoils, both × (1 − relations/`warRelMax` if
  positive) × reach (land 1, sea `reachSea`, air only `reachAir`):
  **need** = `wWar` × how far occupying the target would lift the
  attacker's binding resource (4), × (1 − its floor/100), × (0.5 +
  target economy/200); **spoils** (added during stage 3, when the
  market kept every country supplied and need fell to zero) = `wSpoils`
  × min(1, what occupying the target yields a day — `occupyRes` of its
  production at world prices plus `occupySkim` of its income — over the
  attacker's own income);
- **enmity** = `wHostile` × (hostility/100)².

**Declaring** creates a war record (attacker, defender, day, score 0,
the pact allies on each side), sets relations to −80 or worse, adds
`wearyWar` weariness to both, and makes a headline.

**The campaign.** Every day the score moves by `(strength − defended)
/100 × warPace` plus noise; the attacker wins at +1, the defender at −1.
Both sides bleed economy, infrastructure, stability and military every
day (`warAttr*`, doubled for the losing side), gain `wearyPerDay`
weariness, pay `warCost`, lose 90 % of their mutual travel, and carry
war drags on their economy and stability targets (3). After
`warMaxDays` it is a stalemate; either side may sue for peace in its
monthly decision, more readily when losing or unstable.

**Outcomes**: peace (+`peaceRel`, at least `truceRel`) and stalemate
(half that) change hands nothing. Victory: the loser's authority drops
25 and its stability is capped at 30 with its election cancelled; the
winner gains 5 stability, takes tribute (`tribute` of the loser's
treasury plus `tributeRes` per point of its mean endowment), sets
relations to −60, and with probability `occupyChance` + authority/200
occupies.

**Occupation** lasts `occupyDaysBase` × 0.5..1.5 days. The occupied
country's borders close to at least restricted, its stability falls
`occupyStab` a day, `occupySkim` of its economy income and `occupyRes`
of its native endowment go to the occupier, and its monthly decisions
are taken by the occupier without diplomacy. On release its government
axes move `occupyShift` of the way toward the occupier's.

**Weariness** fades at `wearyDecay` a day at peace and drags stability
(`wearyStab`). A **truce** of `truceDays` after any war, however it
ended, keeps the same pair from fighting twice in a row (added during
stage 3: a victory without occupation used to be farmed for tribute). **Allies** add strength and are named in the headline, and that is
all: they pay nothing, join nothing, lose nothing. A **world war** is a
massive event that makes the most hostile pair of strong, free
countries declare.

### What it touches

Reads stats (3), supply (4), treasury (5), links and terrain (6),
relations and pacts (7), temperament (2). Writes stats (attrition,
defeat), treasury (cost, tribute, skim), relations (7), supply
(occupation share, 4), borders and flows (6), government axes (10),
decisions (the occupier decides, 8), and the log.

### Defaults and levers

| Lever | Default | Meaning |
|---|---|---|
| `wWar` / `wSpoils` / `wHostile` / `warThreshold` | 8 / 2.5 / 1 / 0.35 | need weight, spoils weight, enmity weight, motive needed (0.35 and 2.5 set during stage 3 for about six wars a year) |
| `warRelMax` | 20 | no war on friends above this |
| `warMinRatio` / `defenceBonus` / `terrainDefence` | 1.1 / 1.25 / 1 | edge needed; defender multipliers |
| `reachSea` / `reachAir` | 0.5 / 0.15 | prize discount across a sea lane / by air |
| `warChest` | 300 | treasury needed to declare |
| `wWeary` / `wearyWar` / `wearyPerDay` / `wearyDecay` / `wearyStab` | 2 / 20 / 0.4 / 0.2 / 0.1 | decay raised from 0.08 during stage 3 |
| `truceDays` | 365 | no new war between a pair after one ends |
| `warPace` / `warNoise` / `warMaxDays` | 0.02 / 0.02 / 240 | campaign speed, noise, stalemate |
| `pactShare` | 0.3 | allies' army counted |
| `warAttrEco` / `warAttrInfra` / `warAttrStab` / `warAttrMil` | 0.08 / 0.05 / 0.1 / 0.15 | daily attrition |
| `warFlow` / `warCost` / `warDragEco` | 0.1 / 6 / 15 | travel, money, economy drag |
| `occupyChance` / `occupyDaysBase` / `occupySkim` / `occupyRes` / `occupyStab` / `occupyShift` | 0.5 / 360 / 0.5 / 0.5 / 0.05 / 0.5 | |
| `tribute` / `tributeRes` | 0.3 / 3 | |
| `peaceRel` / `truceRel` / `wPeace` | 40 / −30 / 0.8 | |
| fight gate | population ≥ 0.5 M, not occupied, *fixed* | |
| one war at a time | *fixed* | attacker and target both free |
| score thresholds | ±1, *fixed* | |

### Assumptions built in

- **A war is a duel**: one attacker, one defender, one war per country
  at a time. Allies lend a share of their army and nothing else; there
  are no coalitions, no fronts, no second theatres.
- The attacker's estimate is **exact**: it knows the defender's true
  strength, allies and terrain. There is no fog, no bluff, no surprise
  (system 2 asks for a margin of error by government and temperament).
- Strength is one number blending army, technology, infrastructure and
  allies; there is no navy, no air force, no logistics beyond the reach
  discount on the prize (system 6 asks for reach by technology level).
- Victory is binary and total, map borders never change, and the only
  spoils are tribute and a temporary occupation.
- War kills no one: population is untouched (system 2 asks for deaths).
- Attrition is linear and symmetric in kind; the whole army fights,
  there is no mobilisation, no reserve, no build-up before a war.
- The defender's bonus is flat; a wall of mountains doubles it and
  nothing else about geography matters.
- Peace needs a decision by one side on its monthly day; there is no
  negotiation, no terms, no ceasefire short of the 240-day stalemate.
- An occupied country does not resist; occupation ends by the clock.
- Wars start for resources or old enmity only; there is no ideology,
  no defence of an ally, no pre-emption, no intervention.

### Requested changes

- **Duels stay for now**; fronts and coalitions are for later.
- **Technology transfer under fire**: throughout a war the party with
  the lower technology drifts very slowly up toward the other's.
- **War kills**: population falls on both sides, more on the defender;
  military falls on both sides, more on the aggressor.
- **Military investment is exempt** from the no-investment-during-war
  rule (system 8): mobilisation stays possible.
- **Decided in review**: peace can carry terms (a lease, an indemnity
  over time) and is two-sided like a deal; the **margin of error** is
  computed fresh each time a war is rolled as a decision, never stored,
  with a spread set by government and temperament, so wars can start
  from misjudgement while the campaign runs on the truth; **allies who
  join share attrition**, mostly as military, whichever side they are
  on; **uprisings** can end an occupation early but need dialling in.
- Already landing here from earlier systems: raw force with modifiers
  at evaluation (2), reach by technology level (6), allies choosing to
  join or leave a pact (7), population deaths (4).

---

## 10. Government

Owner: `js/gov.js` (`label`, `isDemocratic`, `daily`, `collapse`,
`election`, `foreignCoups`, `defeatShift`); occupation's shift in
`js/decide.js`.

### What it does

A government is **two numbers**, authority and openness, 0..100. A
**label** is read off a 3 × 3 grid for display only (authority under
45, 45–70, 70 and over; openness under 35, 35–60, 60 and over):
Fractured state, Republic, Liberal democracy; One-party state, Managed
democracy, Social democracy; Military junta, Autocracy, Guided
technocracy. A country is **democratic** when openness ≥ 55 and
authority ≤ 55.

The axes do real work elsewhere: authority lifts the military target
and want, hardens the outbreak lockdown, raises the chance of
occupying after victory, and counts in the relations baseline
(distance in authority); openness lifts the economy and academia
targets, makes a country a better trade partner and tourist
destination, and gates immigration. Stability is most at ease at
authority 55 and unsettled at either extreme (system 3).

**Regime change** is always a jump on the axes plus a headline:

| Trigger | Condition | Effect |
|---|---|---|
| collapse | stability below `collapseFloor` for `collapseDays` in a row, not occupied | coup with probability military/100: authority +40, openness −30; else revolution: authority −40, openness +20; stability set to 35, election cancelled |
| election | democratic, not occupied; first one 1–4 years out, then every `electionYears` | both axes nudged by up to ±`electionNudge`; if stability < 40, authority +15 ("a strongman ticket") |
| decisive defeat | losing a war (9) | authority −25, stability capped at 30, election cancelled |
| foreign-backed coup | checked every 28 days: stability < 35, not occupied, and a linked sponsor with military ≥ 60 and relations ≤ −50; chance `coupChance` per such sponsor | axes move halfway to the sponsor's, stability 35, relations with the sponsor +40 |
| occupation ends | (9) | axes move `occupyShift` of the way toward the occupier's |

Nothing else moves the axes: no drift, no reform, no succession.

### What it touches

Reads stability, military (3), relations and links (6, 7), occupation
(9). Writes the axes, stability (35 or 30 after a change), the election
timer, relations (+40 to a coup sponsor). The axes are read by drift
(3), decisions (8: military want, war), war (9: occupation chance),
relations (7: baseline), links (6: tourism and migration), events (11:
scandal weight), the outbreak (12: lockdown). The label is read by the
map and the screen only.

### Defaults and levers

| Lever | Default | Meaning |
|---|---|---|
| `collapseFloor` / `collapseDays` | 15 / 30 | stability floor and days below it before a collapse |
| `electionYears` / `electionNudge` | 4 / 8 | interval and swing |
| `coupChance` | 0.02 | per eligible sponsor per 28 days |
| label grid | 3 × 3 thresholds, *fixed* | display only |
| democratic test | openness ≥ 55 and authority ≤ 55, *fixed* | |
| coup / revolution jumps | +40/−30, −40/+20, stability 35, *fixed* | |
| strongman swing | +15 authority below 40 stability, *fixed* | |
| sponsor conditions | military ≥ 60, relations ≤ −50, target stability < 35, *fixed* | |
| defeat | −25 authority, stability ≤ 30, *fixed* | |

### Assumptions built in

- A government is two axes and nothing more: no parties, no leader,
  no ideology, no institutions, no legitimacy. The label is cosmetic.
- Governments never change gradually: the axes sit still until a
  collapse, an election, a defeat, a coup or an occupation moves them
  in a jump.
- Only democracies hold elections, and an election is a random nudge
  with a strongman bias under stress; there is no opinion, no
  incumbent, no issue.
- Collapse is decided by stability alone, and whether the army or the
  street wins by the military stat alone.
- Foreign coups need a hostile, strong, linked sponsor and a shaky
  target, and always succeed when rolled; they cost the sponsor
  nothing and buy it +40 relations.
- Governments have no effect on decision-making beyond two wants (the
  military want and, through temperament, nothing); what a country
  values, how far ahead it looks, what it will and will not do are the
  same under a junta and a social democracy (systems 8 and 9 ask for
  this to change).
- Authority 55 is the most stable setting for every country and every
  era; there is no fit between government and country.

### Requested changes

- **Nations have baseline axes that regimes deviate from.** The
  baseline is the nation's settled character; a regime is a set of
  modifiers on it; the effective axes are base + modifiers, clamped to
  the valid range.
- **Revolution events alter the baselines**: peaceful, technological
  or violent, each moving the nation's base.
- **Elections produce a new regime**, that is, a new modifier set on
  the base. **Other government types change regime by events**:
  military appointment, coup, a monarch's death, succession.
- **Foreign coups can fail**, with penalties to the sponsor when they
  do.
- **Governments shape decisions** well beyond the military want:
  foresight, wants, priorities (from system 8).
- **Authority 55 is not always optimal**: the stable point depends on
  other factors (the review's proposal below makes it the fit between
  regime and nation).
- Governments become more complex than two axes later; the review's
  recommendation on which axes:

**Review recommendation on axes.** Keep two, split one, add two derived
quantities, and let the government *type* be a rule of succession
rather than a label:

- *Authority* stays: the state's command over society. It gives up the
  "55 is optimal" role and its place in the relations baseline. It takes
  on decision speed (fewer veto points, faster and larger moves),
  enforcement (which upkeep can be cut, how hard mobilisation and
  lockdown bite), and the quality of information (high authority with
  low freedom widens the margin of error in war estimates).
- *Openness* splits into **political freedom** (consent: who holds
  elections, how legitimacy is earned, how dissent shows itself as
  protest or coup, how well the regime sees) and **economic openness**
  (trade posture: exchange access, deal appetite, migration and
  tourism gates, exposure to contagion and sanctions, the rate of
  technology diffusion). Academia reads both.
- **Legitimacy**, derived: how well the regime fits its nation (the
  distance between effective axes and baseline) plus recent
  performance. It replaces the fixed 55 optimum in the stability
  target, sets coup and revolution odds, and colours election results.
- **Horizon and priorities**, derived from type and axes: how far
  ahead the regime looks (reserves, stockpiles, investment against
  consumption) and what it weighs (guns, butter, growth, science,
  standing). This is what shapes decisions (8) and the wants.
- **Type as succession rule**: elected (regime changes by election),
  hereditary (monarch death, succession), military (appointment, coup),
  party (congress, purge). The type decides which events can change the
  regime and how; the axes decide how it behaves.
- The relations baseline (7) reads similarity in political freedom and
  economic openness instead of authority alone.

---

## 11. Events and weather

Owner: `js/events.js` (`hazards`, the catalogue, `roll`, `fire`, `aid`,
`contagion`, `massive`, `diffuse`), `weatherAnomaly` in
`js/countries.js`, drought and flood marks read by supply (4).

### What it does

**The ladder.** Every day every country draws once: with probability
`pLarge × catastrophicShare` a catastrophe, else with `pLarge` a large
event, else with `pSmall` a small one, else nothing. At the defaults
that is about 250 small events, 17 large ones and one or two
catastrophes a year across the world. The kind is then drawn from the
catalogue by weight (catastrophes draw disasters only):

| Kind | Weight | Small / large / catastrophic effect |
|---|---|---|
| quake | seeded hazard 0.2–1 | infrastructure −1 / −15 / −`devastateInfra`; economy, stability, medical down |
| flood | humidity × (1 + anomaly) | infrastructure −1 / −10 / −30, food cut for 30 / 90 / 180 days |
| drought | dryness × heat × (1 − anomaly) | economy and stability down; water halved and food cut for 60 / 240 / 730 days |
| storm | humidity and a coast, × (1 + anomaly/2) | infrastructure −1 / −12 / −30 |
| discovery | (academia/100)² × 0.7 | technology +`techStep` (×2 large), then diffuses |
| medical discovery | (academia/100)² × 0.3 | medical +5/+8, technology +2, a `breakthroughDays` window of ×`breakthroughMult` detection, then diffuses |
| resource find | more likely the poorer the endowment | one type +`resourceFind` (×2 large) |
| boom | 0.3 + economy/200 | economy +5/+10, treasury +100/+300 |
| recession | unrest | economy −5/−12, stability down; a large one leaks to trade partners (`shockSpread` each) |
| protests, scandal, strike | unrest, openness, poverty | stability or economy down; a scandal trims authority |
| assassination | large only | stability −15, authority ±10 |

A large or worse disaster draws **aid**: every linked friend (relations
≥ 20 or a pact) with money sends `aidFrac` of its treasury, +5
relations each.

**Massive events** roll once a day with `pMassive` (about three a
year): 40 % a global recession (`recessionDays` of −15 on every economy
target, 20 % off every treasury), 30 % a world war (the most hostile
pair of strong, free countries declares), 30 % a breakthrough era
(`eraDays` of diffusion × `eraMult`).

**Diffusion.** A discovery starts a wave from its origin; every seventh
day it reaches each partner of a reached country with probability
`diffuseTrade` for a deal, `diffusePact` for a pact, plus
`diffuseAcademia` × academia/100, times the era multiplier. An adopter
gains half a `techStep` (and +3 medical with a breakthrough window for
a medical wave). A wave stops after a year or once 60 % of countries
have it.

**Weather.** Each country has a yearly rainfall anomaly in −1..1 from
the seed, blended smoothly into the next year's. It scales the
country's own food (±`foodWeather`) and water (±`waterWeather`)
production (4) and tilts the hazard weights: droughts in dry years,
floods and storms in wet ones. Droughts and floods leave dated marks
that supply reads until they expire.

### What it touches

Reads climate (2), academia, stability, economy, openness (3), the
endowment (4), links and coasts (6), relations, deals and pacts (7),
war state (9). Writes stats (every kind), the treasury (booms, aid,
recessions), the endowment (finds), the drought and flood marks (4),
technology across the world (diffusion), wars (the world-war event),
the global timers, and the log; the response side of the outbreak
reads breakthrough windows (12).

### Defaults and levers

| Lever | Default | Meaning |
|---|---|---|
| `pSmall` / `pLarge` / `pMassive` | 0.0033 / 0.00027 / 0.008 | per country per day; per day |
| `catastrophicShare` | 0.07 | share of large that are catastrophic |
| `devastateInfra` | 40 | a catastrophic quake's infrastructure loss |
| `shockSpread` | 0.3 | recession leak per trade partner |
| `aidFrac` | 0.02 | share of a donor's treasury |
| `techStep` | 4 | discovery gain (adopters get half) |
| `breakthroughShare` / `breakthroughDays` / `breakthroughMult` | 0.3 / 180 / 1.5 | medical share of discoveries; window; detection boost |
| `diffuseTrade` / `diffusePact` / `diffuseAcademia` | 0.25 / 0.35 / 0.15 | weekly adoption chances |
| `recessionDays` / `eraDays` / `eraMult` | 120 / 180 / 3 | |
| `resourceFind` | 5 | |
| `waterWeather` / `foodWeather` / `droughtFood` / `floodFood` | 0.3 / 0.15 / 0.3 / 0.2 | |
| catalogue weights and effects | *fixed* | the table above |
| mark durations | 60/240/730 and 30/90/180 days, *fixed* | |
| massive split | 40/30/30, *fixed* | |
| diffusion stop | a year or 60 %, *fixed* | |

### Assumptions built in

- Every country faces the same ladder: Malta and India each draw once
  a day with the same odds. Size, exposure and preparedness play no
  part in whether something happens, only in the weights of what.
- Events are independent across countries and days; the only
  clustering is through the weather anomaly and recession contagion.
- Disasters break things but kill no one, and nothing rebuilds
  afterwards except the slow drift of infrastructure toward the
  economy.
- A discovery is a function of academia alone, and diffusion is free,
  permanent and blind to the provider's level (an adopter gains half a
  step whatever it already knows; system 4 asks for a cap by the
  provider's level).
- The weather is one number per country per year: a rainfall anomaly,
  smoothly varying, with no seasons, no zones and no correlation
  between neighbours (system 2 asks for zones and an ENSO-like
  oscillation).
- Massive events are global coin flips unconnected to the state of
  the world: a world war rolls as easily in a peaceful decade.
- Aid is money only, and nobody prepares for anything.
- Booms and recessions are exogenous; nothing in the economy causes
  them.

### Requested changes

- **Catastrophes affect surrounding nations**: a footprint beyond the
  struck country (neighbours over land links, a coastline chain for a
  hurricane, a region for a drought), with lesser effects and refugees.
- **Discoveries diffuse very slowly**, and the **receiver's
  infrastructure and economy set its rate of gain**.
- **The 60 % adoption stop is too low**; raise it or drop it.
- **Weather beyond rainfall**: wildfires and dust storms (tied to the
  climate zones of system 2); **hurricanes and the like are very
  destructive**.
- **Diffusion is not blind** to what the adopter already knows: the
  gain depends on the gap to the provider and is capped by the
  provider's level (system 4).
- **Booms and recessions become emergent**, not rolled: the result of
  resource surpluses and shortages, prices, wars, disasters and debt
  under the production model (systems 4, 5). The headline stays as a
  *report* when growth or decline crosses a threshold; the global
  recession of the massive tier becomes a cascade through the exchange
  rather than a coin flip.
- Review questions, pending: how far a catastrophe's footprint reaches
  (links, distance, or a track); whether smoke and dust also hit
  health; whether diffusion stays free or becomes a deal term the
  provider consents to.
- Already landing here: per-country climate zones and a global
  oscillation (2), technology shared up to a percentage of the
  provider's level (4), disasters killing people (4), revolution events
  that move a nation's baseline axes (10).

---

## 12. Outbreak coupling

Owner: `js/world.js` (`spreadTick`, `hop`, `responseTick`,
`globalResponse`, `updateResponseBar`), `js/decide.js` (`react`),
`js/links.js` (the flows it rides), the deploy dialog in
`js/worldui.js`.

### What it does

The outbreak is the player's side of the map. A country is **covered**
once a variant is deployed there or the entity hops in; it then carries
a coverage level 0..1, the entity's profile, and three counters:
detection, government action and response.

**Spread**, daily, only while something is covered:

- local growth: coverage += `localGrowth` × (0.5..1.2 random) × (0.6 +
  infrastructure/250) × (1 − government action × lockdown), lockdown =
  authority/200 + military/300;
- hops: over every link in each direction, probability 1 − exp(−flow ×
  source coverage × vector modifier × environment compatibility × (1 −
  destination action × `actionSlowdown`) × `spreadPerFlow`); a hit covers
  the destination at 1–3 % with a copy of the profile;
- mutation: each covered country's profile adapts with probability
  `mutationRate` a day.

Environment compatibility compares the two regions' temperature and
humidity (down to 0.1 for a bad match); the vector modifier reads the
entity's mode against the destination's climate and urban share
(Swarm likes cities, Bloom heat and humidity …).

**Response**, daily, per covered country:

- detection += severity × dormancy × coverage × (0.3 + medical/100 ×
  `detectMedical`) × breakthrough (system 11's window); severity is
  `detectionSeverity`, or `detectionSeverityAnti` for a brewer;
- above 8 % detection, government action += detection × coverage ×
  `actionRate` × (0.5 + authority/200 + military/400);
- above `responseFloor` detection, response += `responseRate` × (0.5 +
  0.7 × action) × (0.5 medical + 0.2 military + 0.3 technology)/50,
  slowed by adaptor and cloak traits;
- pact partners raise each other's response to `pactShareResp` of the
  best of them;
- uncovered countries let their counters decay (`countryDecay`).

**Reactions**: the day detection crosses `reactFloor`, and monthly
after, the country takes an outbreak decision (8): tighten borders,
fund hospitals, emergency research, or a travel ban on the likely
source (`travelBan` on flows from it for `travelBanDays`, −5
relations).

**The outbreak on the world**: coverage drags the economy target
(`outbreakEcoDrag`) and the stability target (`outbreakStabDrag`, so
a deep outbreak can topple a government through system 10); travel
bans and border tightening cut flows (6); medical wants rise with
detection (8).

**The meter**: the world's response is the response of every country
above 25 % detection, weighted by (medical + military + technology)/300
× √population. At 100 % the outbreak is wiped from every country and
the game ends.

### What it touches

Reads infrastructure, medical, military, technology (3), authority
(10), flows and borders (6), pacts (7), the breakthrough window (11),
the entity's profile from the bench (`C.statsOf`, `C.adapt`). Writes
the three counters and coverage, the economy and stability targets (3),
borders, bans and relations through reactions (6, 7, 8), and the game
over. Nothing on the map feeds back to the bench.

### Defaults and levers

| Lever | Default | Meaning |
|---|---|---|
| `localGrowth` | 0.00125 | coverage growth per day at full |
| `spreadPerFlow` | 0.002 | hop chance per unit of flow × coverage |
| `mutationRate` | 0.003 | profile adaptation per day |
| `detectionSeverity` / `detectionSeverityAnti` | 0.0015 / 0.007 | detection per unit of coverage; a brewer is louder |
| `dormancyDampen` | 0.35 | detection under dormancy |
| `actionRate` / `actionSlowdown` | 0.004 / 0.55 | government action growth; how much it slows hops in |
| `responseRate` / `responseFloor` | 0.00045 / 0.25 | response growth; detection needed |
| `countryDecay` | 0.0004 | counters' decay in clean countries |
| `detectMedical` | 0.9 | medical's share of detection speed |
| `pactShareResp` | 0.6 | response shared through pacts |
| `reactFloor` / `wReact` | 0.3 / 1.5 | reaction trigger and weight |
| `travelBan` / `travelBanDays` | 0.2 / 90 | |
| `outbreakEcoDrag` / `outbreakStabDrag` | 20 / 30 | targets × coverage |
| lockdown, response weights, meter weight | *fixed* | formulas above |
| thresholds | 8 % action, 25 % response and meter, *fixed* | |
| game over | 100 % meter, *fixed* | |

### Assumptions built in

- Coverage is a share of a country, not a number of people: the
  outbreak infects and kills no one, and population is untouched by it.
- Coverage never falls: there is no recovery, no immunity, no
  eradication short of the game ending. A country stays covered for
  ever at whatever level it reached.
- One profile per country, copied on arrival and mutating in place;
  two variants cannot coexist in one country.
- The response is free: it costs no treasury, no upkeep, and needs no
  decision; it is a counter that climbs from stats.
- Detection is private to each country; only response is shared, and
  only through pacts. No country warns another.
- The government's whole repertoire is four reactions, once a month.
- The meter is global and monotone: the outbreak ends the same way
  whether it is one country or fifty, and no country is ever
  contained on its own.
- Environment compatibility and the vector modifier read the six
  regional climates (system 2 asks for per-country climate).
- The map never feeds back to the bench: what the entity does in the
  world changes nothing on the plates.

### Requested changes

- **Deferred.** System 12 is expected to be a complete refactor and is
  held back for a pass shared with changes to the bench simulation, so
  that the two mesh. Only one change lands with the redesign below:
  environment compatibility reads per-country climate (2).
- Already landing here from earlier systems: population as a modelled
  quantity that an outbreak could infect (3, 4), medical narrowed to
  health with upkeep and a technology multiplier (3).
- Answers to the system 11 questions, recorded here as they arrived:
  different catastrophes hit differently — hurricanes follow a track
  with a radius, earthquakes have an epicentre and a radius; smoke and
  dust cut food and infrastructure by severity; diffusion stays a free
  leak, just very slow.

---

## 13. Resolutions and target model

The review closed on 20 September 2026. Read together, the requests
above contradicted or under-specified each other in twenty places;
this section records how each was resolved and the model that results.
The implementation plan (stages 0–8) follows this section.

### Resolutions

1. **Scale.** Stats stay per-head levels 0..100; population (millions)
   supplies size. Money is absolute: income, upkeep, investment costs
   and the credit limit scale with population × level. Treasury cap
   100,000. Military is shown as **force** = level × population ×
   multipliers; the stored stat stays a level.
2. **Endowment vs supply.** Endowment is a fixed potential per type in
   units per day: seeded 0..100 × starting population × need per head
   (food, water) or × starting output or force (energy, materials).
   Production = potential × access, access ∈ 0..1 from infrastructure,
   technology and labour (capped at 1, so growth cannot raise production
   past the land). Supply = production + imports + market buys − exports
   − market sells ± stockpile. Consumption = population × need per head
   (food, water) + output × need + force × need (energy, materials).
   Desalination is a water production path that consumes energy.
3. **The floor governs growth only, in both directions.** The economy
   is a stock of output per head that grows toward a cap set by
   infrastructure and technology at a rate scaled by the worst resource
   balance; below the shortage bite growth turns negative in proportion
   to the shortfall (degrowth), at most `degrowthMax` a day. Food and
   water shortage hits population first (famine). Level drags become
   growth-rate modifiers. Sanctions are market access only.
4. **Blend targets go** for infrastructure, military and medical: built
   by projects, decaying when upkeep is unpaid. No +20 war lift;
   mobilisation is military investment, exempt from the war ban. Medical
   = health: detection and response, population growth, mortality and
   capacity. Academia and technology keep a slow drift plus research,
   sharing and leak.
5. **The exchange is in scope**, with a clearing rule: a bounded world
   stock per type, a price moved by the day's imbalance, sells adding to
   the stock and buys drawing it, pro-rata fills when it is empty.
   Nothing is created. Sales are the only resource income.
6. **Deals are recurring production swaps** (a resource against a
   resource, or against money and technology terms), priced against the
   world prices, needing acceptance, giving relations in proportion to
   size, allowed under sanctions, delivering short with a break after
   `dealBreakDays`. Exchange purchases pay a spread and a distance
   transport cost, and sanctions bite there. One market purchase a day
   means a deal frees that purchase for another resource: complements,
   not substitutes.
7. **Sanctions once**: market access reduced by the sanctioners' share
   of world volume, deals ended, an opportunity cost in relations with
   the target's other partners; imposed at ≤ −30, lifted weekly once
   ≥ −10.
8. **Government moves classified**: elections, coups, appointments,
   successions, defeat and occupation's release change regime
   modifiers; only revolution events move the nation's baseline.
   Effective axes = baseline + modifiers, clamped; the type is a nation
   field changed by regime-change events. Relations baselines and the
   war margin read effective axes. The openness split (political
   freedom, economic openness) happens before war needs it.
9. **Occupation** takes a share of production; the income skim stays.
10. **Debt** has a credit limit of `creditDays` of income; beyond it no
    new spending, a legitimacy penalty and default risk. Treasury
    fractions become days-of-income terms floored at zero.
11. **One technology-sharing helper** (`shareTech`) for deal terms, war
    drift and diffusion: up to a share of the provider's level, scaled
    by the receiver's infrastructure and economy.
12. **Reactions** spend immediately at a premium; never amortised.
13. **World state gets a field table** like the country one.
14. **Population is staged honestly**: scale, area, caps, inertia and
    force first; growth, famine and the surplus signal with production;
    deaths with war and disasters; refugees with events.
15. **Rolled booms and recessions retire** when the growth engine
    lands; report headlines replace them.
16. **A relative endowment accessor** replaces the mean endowment for
    every 0..100 reader.
17. **Micro-states** produce and consume at their scale, buy on the
    exchange, never fight.
18. **Economy is unbounded**: output per head is a real number shown
    as an index against the world; every other stat keeps 0..100.
19. **Recovery paths**: a mortality floor per day, aid in resources as
    well as money, refugees returning when the home balance recovers,
    reconstruction projects at a discount.
20. **Political freedom seeds** derive from openness and authority,
    overridden by a short curated list, flagged for the defaults
    session.

### Target model

**Country fields**: `pop` (dynamic), `area` (km² from the map
polygons), `urban`, `climate {temp, humidity, zone}`, `potential[4]`,
`stock[4]`, `base {authority, freedom, econOpen}`, `regime {mods, type,
since}`, `legit` (derived), `debt`, `projects[]`, `upkeepPlan`; deals on
pairs; `hist` and `series` as today.

**Daily tick**: links and flows → weather and oscillation → production,
consumption, stockpiles, balance → exchange clearing and prices →
treasury (sales, upkeep, interest, project draws) → decay for unpaid
upkeep → growth (output, population) and drift (academia, technology) →
outbreak → wars and occupations → events (hazards, footprints,
refugees, reports) → decisions (daily market rule; weekly and monthly
loops on their days) → government (legitimacy, succession, collapse) →
samples, meter, map, `entity:day`.

**Key formulas** (every constant a Config row): access = clamp(0, 1,
base + infra and tech terms) × min(1, labour/needed); growth `dE = E ×
g × (1 − E/cap)`, cap from infrastructure and technology, g from
technology and the worst balance, negative below the bite; population
`dP = P × (birth − death + migration)` toward a capacity from area,
urban share, infrastructure, technology and medical; upkeep = rate ×
level × population; force = level × population × technology and
infrastructure multipliers, estimated with a fresh error whose spread
grows with authority × (1 − freedom) and aggression; price moves by the
day's imbalance with an elasticity, bounded; legitimacy = 100 − fit
distance − performance penalties + growth, replacing the fixed 55.

### Stages

0 documents, rename, save v5, area, probes · 1 scale, population hooks,
force · 2 production economy, stockpiles, upkeep and decay, money, debt,
projects, exchange core, growth and degrowth · 3 decision cadences and
budget · 4 deals as swaps, market friction, sanctions, pacts,
third-party relations, mean reversion · 5 government: baselines,
regimes, legitimacy, the axes split, succession, coup failure,
revolution events · 6 war: force, margin of error, reach by technology,
allies joining, deaths, peace with terms, uprisings · 7 climate zones,
oscillation, new hazards and footprints, refugees, recovery, slow
diffusion · 8 screen, map, config, tests.

### Interim changes made while building stages 1–3

- `warThreshold` 0.35 at the force scale; the **spoils** term of greed
  and the **truce** after a war (system 9 above); `wearyDecay` 0.2.
- Energy gets its own starting headroom (`energyBalance0`) with the
  technology production factor counted in the normalisation;
  technology raises energy production (`energyTechProd`) and lowers the
  energy needed per unit of output and force (`energyTechEff`).
- A census probe (`tools/probes/census.js`, read by `tools/census.py`)
  reports each stage's outcomes across seeds: the stage 3 economy
  census, wars, diplomacy, the market, governments, events and an
  end-state vector per country for cross-seed comparison.

### Census after stage 3 (six seeds, three years)

Fixed on the way: stockpiles were never drawn down, so a half-full
store covered every shortfall for ever and nothing was ever bought on
the exchange; border settings flipped almost weekly (`borderMin` now
makes a change need a clear reason); the occupation smoke check scales
with the occupied country.

What the census shows, and where it points:

- **Wars** 5.7–7.7 a year, half to two thirds for spoils, the rest old
  enmities; every war ends in a victory and the attacker always wins
  (no margin of error yet: stage 6). Some pairings are absurd
  (RU→US on an ally's force, LY→AL by sea): reach and allies by
  decision, stage 6.
- **Technology and medical converge on 100** for most countries within
  two years. Investment is not the cause (military and infrastructure
  get most projects); **adoption** is: 13,000–16,000 adoptions in three
  years, about 30 a country a year, each worth +3 medical and half a
  research step. This is the fast diffusion stage 7 replaces with a
  slow, capped leak; until then technology means little after year 1.
- **Materials are the world's binding resource**: world balance 1.0 at
  year 3 and the price rising 0.7→0.9, because material need grows with
  output (economies +45 % in three years) while food and water need
  grow with population (+3 %). Every seed converges on the same prices.
  A world-wide material plateau follows within a few years; whether
  that is the intended end state is a design call.
- **Population is deterministic** (+3 % in every seed, no deaths from
  war or disasters yet: stages 6 and 7). About 30 "famine" countries
  were the territories with no population in the seed data (population
  0, potential 0), until the curated defaults gave every agent its
  people.
- **Divergence between seeds** is real where the sim has mechanisms:
  treasuries (median CV 0.4), government labels (differ for 110 of 161
  countries), occupation, output (42 % of countries differ by more than
  10 %). The top ten by GDP, force and output are the same everywhere
  (structural). Stability rises for everyone (57→75; a fifth at ≥ 90).
- **Deals saturate** at about 335 in year 1 in every seed and move
  nothing: stage 4.

### Stage 4 as built: diplomacy as transfers

**A deal is a record on the pair**, not a flag: `{g, gq, t, tq, mq,
tech, until, since, short}`, written from the pair's first ISO. Each day
economy.js settles it before anything reaches the exchange, so a deal
covers a shortage and leaves the country's one market purchase free for
something else. A side delivers out of genuine surplus (net production
less its own use); delivering under `dealShortAt` counts as short, and
`dealBreakDays` running short ends the deal and costs goodwill. Terms
expire at `dealTerm`. Nothing is created: what one side sends, the other
receives, and the smoke test asserts the two sums are equal.

**What a deal is worth, to each side.** The exchange charges
`marketSpread` to both buyer and seller and adds a transport premium
(`marketDistance` per 10,000 km to where that type's sellers actually
were yesterday, capped at `marketFrictionMax`). A cargo received would
otherwise have been bought at the price plus those two; a cargo sent
would otherwise have been sold at the price less those two. A deal pays
the matched value instead and carries only the pair's own shipping. So
each side gains the market's cut and the distance it escapes, plus a
premium: `dealSlot` for the buyer (its daily purchase stays free) and
`dealSure` for the seller (a buyer that is certain to take it). A deal
between two countries that are each closer to the market than to one
another is worth nothing and is not signed. Quantities: the taker's
structural gap against `dealSpareShare` of the giver's surplus, matched
at world prices, with money (`dealMoneyShare` of income at most) making
up any difference. A far more advanced payer may substitute a
technology term for part of the money (`techGapMin`, `techTerm`,
`techValue`).

**One technology rule, three users.** `shareTech(from, to, rate,
capFrac)` in world.js: the receiver climbs toward `capFrac` of the
provider's level as fast as `techAbsorbBase` plus its infrastructure and
economy let it absorb, never past that share. Deal terms use it now; war
drift (6) and diffusion (7) will.

**Sanctions** are market access, not a drag. Whoever sanctions a country
closes off their weight in world trade: access = 1 less
`sanctionBite` times the sanctioners' share of world output, capped at
`sanctionMax`. It scales both what the target may buy and what it may
sell. Imposed at `sanctionAt` (-30), lifted by a weekly decision once
relations recover to `sanctionLift` (-10), which is the hysteresis
against mean reversion. Imposing ends the pair's deals and costs
goodwill with the target's friends, and the decision counts both against
the move.

**Relations** gained a ripple and a tide. `rippleRel` passes
`thirdParty` of any step to the partner's friends (`tieFriend`) and the
opposite to its enemies (`tieFoe`), once, at the moment it is made; deals,
pacts, sanctions and declarations all ripple. `relaxRelations` pulls
every pair `relRevert` of the way back to its baseline each day, except
while at war. A deal's relations gain scales with its size against both
sides' incomes (`dealRel`).

**Also**: `partnerCapOf` limits how many deals a country can run
(`partnerBase` plus `partnerInfra` by infrastructure); at most
`dealsPerPair` between any two; the world seeds deals inside friendly
blocs through the same acceptance test (`seedDealRel`); aid arrives in
kind as a zero-price short deal out of a donor's surplus
(`aidShare`, `aidDays`) and falls back to money; countries at war ship
nothing to each other; positions come from the map catalogue, so
`distKm` is available everywhere.

### Census after stage 4 (six seeds, three years)

Caught here: mean reversion pulled every pair back to geography alone,
so the same 17 pacts appeared in all six seeds and aid dried up.
Relations now revert toward a **resting point** that counts what the two
have built -- `pactBase` for a live pact, `dealBase` for each running
deal, less `sanctionBase` while sanctioned -- at half the old rate. Pacts
then grow to 28-39 and differ by seed again. A term running out is no
longer a headline, which halved the wire's deal chatter.

Where it stands: 184-209 pairs dealing, 209-250 deal records,
13-28 of them true two-resource swaps and the rest resource-for-money,
340-460 units moved a day, 158-168 countries trading, 34-41 sanctions
live, mean market access 0.98 with the worst country at 0.48. Materials
stay the binding type and their price now diverges sharply by seed
(1.08 to 2.42 at year 3, against 0.5-0.7 for the others). Supply
divergence across seeds rose with the deals: the worst balance differs
by more than 10 % for 39 % of countries, against 11 % before.

### Stage 5 as built: nations, regimes, legitimacy

**Base and regime.** Every country carries a `base` (authority,
political freedom, economic openness: the nation's settled character)
and a `regime` (a type and a set of modifiers on the base). The
effective axes are base plus modifiers, clamped, and they are what every
other system reads: `s.authority`, `s.freedom`, `s.openness` (the last
now meaning economic openness). Freedom is seeded from a short curated
list for the obvious cases (`GOV_SEED` in countries.js: monarchies,
one-party states, juntas, managed democracies, and the clear
democracies) and derived for everyone else as economic openness less a
penalty for high authority. The list is flagged for the curated-defaults
session.

**Type is a succession rule.** Elected regimes hold elections
(`electionYears`); the result is coloured by legitimacy: a regime the
nation is happy with is returned with small changes, an unpopular one is
thrown out with a large swing back toward the base, and under stress a
strongman ticket wins (`strongmanSwing`) and, if that takes freedom
under `electionFreedom`, cancels future elections (the type becomes
party). Hereditary regimes change when the monarch dies
(`monarchDeath` a day), with a contested succession when legitimacy is
low. Juntas appoint (`appointRate`); parties hold congresses
(`congressRate`) or, when legitimacy is gone, purge. Everything above
moves the modifiers only.

**Legitimacy** (`legitimacyOf`, daily): `legitBase` less `legitFit`
per point the regime sits from the base (the mean distance over the
three axes), less the worst shortage, decline, occupation, a fresh
defeat, a fresh coup disgrace and famine, plus growth. It replaces the
old "authority 55 is optimal" term in the stability target and sets the
odds of coups, revolutions and strongman elections.

**Revolutions move the base.** Violent: the street wins a collapse
(when the army does not), the base loses authority and gains freedom,
and a new elected or party regime is installed. Peaceful: a free enough
regime with low legitimacy gives way and calls elections
(`reformChance` while `revoltLegit` and `reformFreedomMin` hold).
Technological: once, when technology and academia are high, the nation's
character opens (`techRevEconOpen`, `techRevFreedom`).

**Foreign coups can fail.** The sponsor conditions are unchanged; the
attempt succeeds with `coupSuccessBase` less `coupSuccessLegit` per
point of the target's legitimacy above 50. Success installs a military
regime leaning halfway to the sponsor. Failure rallies the target's
stability, costs the sponsor relations with the target and, through the
ripple, with the target's friends, and marks the sponsor disgraced
(`coupDisgraceDays`), which weighs on its own legitimacy.

**Government shapes decisions.** `prioritiesOf` starts from temperament
and adds the regime: authority arms (`govGunsAuth`), a junta more so; a
lack of freedom and a party state value order; economic openness
values growth; freedom funds science; a crown values standing. Horizon:
a crown looks furthest, a junta shortest, an elected government no
further than the next election. Authority hoards money (`reserveAuth`).
An occupied country is run on its occupier's government and
temperament. Occupation's release stamps the occupier's axes on the
regime's modifiers, never the base. A defeat shakes the regime and
weighs on legitimacy for `defeatDays`.

**Tuned on the census.** The first run quadrupled collapses: legitimacy,
war and occupation all hit stability at once, defeat shocks stacked on
the regime without bound, and crisis days kept counting under occupation
so a puppet fell the day it was released. Now a second defeat extends
the shock instead of stacking (`defeatAuthority`, `defeatDays`), the
occupation and defeat terms of legitimacy are modest (`legitOccupied`,
`legitDefeat`) since stability already pays for both, a released country
keeps `releaseStab` and a clean slate, and a new regime is not judged by
the street for `regimeGrace` days (no collapse, no peaceful revolution).
What remains cycles in the countries whose economies are in ruin
(deep shortage, famine, decline): that is the trough the population note
asks for, and the war half of it belongs to stage 6.

**Readers re-pointed.** The relations baseline reads similarity in
freedom and economic openness (`relGovGap`), not authority. Academia
drifts on both openness and freedom. Scandals surface where people may
speak (freedom) and move the regime, not the nation. The label reads
authority across freedom. The map and the screen show the regime, its
type, its legitimacy and the base with the modifiers in brackets.

### Stage 6 as built: war

**The estimate errs, the campaign does not.** A war is still weighed as
a monthly candidate, but the odds the attacker sees are the truth
(force with its technology and infrastructure multipliers, plus
`pactShare` of the allies it expects) times a fresh error drawn from the
day's generator: a normal with spread `errBase` plus `errAuthority`
for a heavy hand that hears no dissent (authority times the lack of
freedom) plus `errAggr` for a warlike temperament. It is never stored:
the same question tomorrow gets a different answer, and wars can start
from misjudgement. The campaign runs on the true strengths of whoever
actually fights.

**Reach follows technology.** A land border can always be crossed; a sea
lane needs `techLow`; an air link needs `techHigh`, the tier that
projects power. Below the tier the war is not even a candidate.

**Allies are asked, not assumed.** A declaration records each side's
pact partners as asked. Each partner answers in its own weekly turn:
join (weighted by relations, `joinLoyalty`, how the war is going, less
weariness, unrest and `joinCost`) or refuse, which ends the pact and
costs goodwill. Only allies who joined count in the campaign, and they
bleed: `allyAttr` of the attrition, mostly as soldiers, and `allyDeath`
of the deaths. Relying on allies who may not come is one more source
of misjudgement.

**War kills.** Each day the attacker spends `warMilAtt` of its army and
the defender `warMilDef`; the defender loses `warDeathDef` of its people
and the attacker `warDeathAtt`, more on whichever side is losing. The
dead are counted (`warDead`) and the population falls for real. The side
with the lesser technology learns from the other under fire through
`shareTech` (`warTechRate`, `warTechCap`).

**Peace with terms.** The side that is behind sues; if the margin is at
least `peaceTermsMin` the side ahead takes an indemnity, a money deal of
`peaceIndemnity` of the loser's income per point of margin a day over
`peaceTermDays`, and a lease of `peaceLeaseShare` of any spare resource
the winner lacks. A war nobody is winning ends with a bare treaty.

**Uprisings.** An occupied country below `upriseStability` throws the
garrison out with `upriseChance` a day, more when its legitimacy is low:
the occupation ends early with no stamp on the regime, the occupier
loses `upriseMil` of its army and gains `upriseWeary`.

**Tuned on the census.** With forces in the thousands the old front
moved by raw strength and every war ended on its first day, so no ally
ever had a weekly turn to answer and nobody sued for peace. The front
now moves by the odds (`(attacker - defender) / defender`, capped at
`warSwing`, times `warPace`): twice the defender is a fast war, ten
times a rout, an even match a stalemate at `warMaxDays`. Wars then last
a median of a few weeks, allies join and refuse, misjudged attackers
sue and pay. Death rates were cut to a tenth of the first draft once
wars lasted long enough to kill (`warDeathDef`, `warDeathAtt`), and
`wSpoils` came down to 2 because the margin of error adds wars of its
own: about six or seven a year across seeds.

Deferred from here: fronts and coalitions; people fleeing wars
(refugees, stage 7).

### Stage 7 as built: climate and events

**Climate per country.** Every country sits in a zone (`ZONE` in
countries.js: temperate, arid, monsoon, tropical, boreal, highland,
mediterranean) from a curated list for the obvious cases and the region
for the rest, flagged for the curated-defaults session. A zone shifts
the region's temperature and humidity, gives the country its answer to
the world's oscillation (positive in the monsoon and the tropics,
negative across the arid belt and the Mediterranean, so the same year
is wet in one and dry in the other), and weights its hazards. The
oscillation is a seeded three-to-seven-year cycle with a little noise.
A year's anomaly is the zone's answer plus a share the region holds in
common plus the country's own draw, blended smoothly into the next
year. The outbreak's climate compatibility reads the country's climate,
not its region's.

**Hazards by zone.** Wildfires and dust storms join earthquakes,
floods, droughts and storms, each weighted by zone, humidity, heat and
the year's weather. Fire and dust leave smoke that cuts the harvest
(`smokeFood`) for weeks.

**Footprints.** A large disaster reaches beyond the country struck, one
tier down: a hurricane runs a track along the coast through up to
`trackLen` sea-linked neighbours, nearest first, continuing with
`trackHold`; an earthquake is felt within `quakeRadiusKm` (further for a
catastrophe), more likely nearer the epicentre; a drought grips the
region's land neighbours; floods, fires and dust cross a border with
`footprintChance`. The headline names who lies in the path.

**Deaths, refugees, rebuilding.** Disasters kill by tier
(`deathSmall`, `deathLarge`, `deathCata`, scaled by the kind and by
poor hospitals, capped per event by `deathCap*` so a catastrophe in a
giant is not a genocide). A share of the survivors flee to linked
friends (`refugeeRate`, doubled for a catastrophe; `refugeeRel`), as do
the defender's people once a war goes badly (`warFleeAt`,
`warRefugeeRate`); hosts' populations rise. They return at `returnRate`
a day once home is calm: no war, no occupation, no drought, flood or
smoke still biting, the worst supply above `returnBalance`. After a
large disaster infrastructure projects cost `rebuildDiscount` for
`rebuildDays`.

**Diffusion, slow and capped.** A discovery's wave leaks along deals,
pacts and academia, scaled by economic openness and `diffuseBase`, and
what an adopter gains comes from the one sharing rule: it climbs toward
`diffuseCap` of the origin's level, never past it, and a country
already there is passed over. Waves stop at `diffuseStop` of the world
or after `diffuseDays`. Research and discoveries themselves slow at the
frontier (the step scales with the distance to 100). With the flood of
adoptions gone the old drift target of 0.7 x academia pulled every
country's technology down, so technology now rests on academia itself
and everything else lifts it above.

**The global recession** of the massive tier is a crash on the exchange:
the world stock loses `cascadeStock`, prices jump by `cascadePrice`, and
growth stalls for `recessionDays`.

### Stage 8 as built: presentation, config, tests

**Screen.** The country screen shows, per section: potential,
production, need, balance and stockpile per resource with what deals
bring and send, weather with the climate zone and the oscillation, and a
prices row (world prices, what this country pays landed for its binding
type, its market access under sanctions); output, cap, growth, the
income line, projects and debt; every live deal with both legs, its
term and whether it is running short, plus the partner cap and market
access; the regime, its type, its legitimacy and the next election, with
the base and the modifiers in brackets; wars with who was asked and who
came; the three decision loops' history; and sparklines for economy,
stability, resources, military, population (against its first sample)
and legitimacy. Every stat, chip and row carries a mouse-over tooltip
(`TIPS` in country.js), as the tuning screen does.

**Map.** A legitimacy layer joins coverage, stability, economy,
resources (the binding balance) and conflict; the legend shows the
world's four prices, refreshed daily.

**Wire.** Deal headlines carry the deal's worth a day; regime events,
reports, footprints, refugees, uprisings and peace terms all headline.

**Config.** Every world lever is a row in the tuning screen, grouped
by system (scale, money, production, exchange, deals, technology
sharing, relations and sanctions, decisions, government, legitimacy,
priorities, war, resources, climate and hazards, events, detection):
360 rows.

**Tests.** `tools/smoke.py` runs 90 boolean checks across the stages,
the layout matrix at nine sizes, determinism over 120 days including
the exchange, and the save round trip over countries, pairs (with
deals) and the world block. `tools/probes/` holds the census
(`census.js`, read by `tools/census.py`), the economy probe, the
war-rate sweep and the map tap probe. Run the census after any change
to a system and compare its year-3 table and cross-seed divergence to
the figures recorded above.

**The review is closed.** Stages 0 to 8 of the plan are built. What
remains is listed under deferred items: the outbreak pass shared with
the bench (system 12), fronts and coalitions, the curated-defaults
session (populations for the empty micro-states, the political-freedom
seed list, the climate zone list, rivalries, mountains), and the
population overshoot-and-collapse behaviour below, which now has its
ways to die and waits for the stockpile-driven cycle to be tuned.

### After the review: the defects, and scarcity

The critique after stage 8 (its proposals are kept in the plan file)
found four definite defects and a design gap. Built so far:

**Defects.** Blows to the economy now land on output through
`hitOutput` (a fraction of output, gone; the quarterly report's baseline
is left alone so a big blow reads as the recession it is): war
attrition (`warAttrEco`, a fraction a day), disasters (`blowSmall`,
`blowLarge`, `blowCata` times the kind's weight) and strikes
(`strikeSmall`, `strikeBig`). The old index writes were erased the next
morning by the growth pass. Both decision turns run on the monthly day
(the weekly one first), so the weekly cadence is 156 a country over
three years, not 115. The front moves by bounded odds,
`warPace x warSwing x (odds - 1)/(odds + 1)`, so a war begun on a thin
edge crawls and can time out into a stalemate. The dead "need" term of
war greed and the 0..100 supply shim under it are gone; greed is spoils
plus **dependence**: what the country pays the exchange a day, smoothed
(`bill`, `billSmooth`), for a type the target could supply, against its
income (`wNeedWar`). The deal candidate reads the share of use a deal
covers (`wCover`).

**Scarcity.** The exchange no longer lets a shortage be painless. The
price rests on the world's days of cover (`coverRef`, `coverMin`,
`priceCurve`, ceiling `priceMax` 20) and moves with the day's imbalance
against world use (`priceElastic`); the world stock opens at its
reference cover so prices open at their base. Sellers hold out below a
reservation (`reserveMin` of the base), lower when they are short of
cash (`reserveCashMin`, judged against a comfortable reserve capped at
`reserveCapShare` of the treasury cap) or when the surplus would only be
wasted (`reserveWaste`); what they hold back goes to their stores and
the rest is lost. Prices in a glut settle near the marginal seller's
reservation rather than at the floor of the scale. A **price-floor
deal** (`proposeFloor`, the weekly `cartel` candidate) binds two net
sellers of a type to a floor at `floorMark` over the resting price for
`cartelTerm`; its worth to each is the gap it closes on its own surplus
times the pair's share of the world's spare (`hold`); a member short of
cash breaks ranks and the deal ends after `dealBreakDays` of that.
Buyers who depend on the type resent the members (`cartelAnger`,
`cartelRelHit`), bounded at `cartelAngerFloor` so resentment can sour
a friendship into sanctions but never on its own into a war; the first
draft let it run to -100 and the world filled with resource wars.
**Technology consumes energy** (`needEnergyTech` per point per million,
about a third of a full-technology country's energy need, counted in
the starting normalisation); in a shortage the laboratories go dark
first (`techUnpaid`) and technology decays at `decayTech` a day at a
full outage, while output and the army keep their energy until the
shortfall exceeds the laboratories' share.

Tuning: the first census showed a cartel storm -- over a thousand floor
deals in three years, resentment landing exactly on the sanction line,
sanctions tenfold and coups doubled. A floor now needs a real share of
the world's spare (`cartelHoldMin`), is worth that share squared, is
capped per type (`cartelPartners`), and resentment stops above the
sanction line (`cartelAngerFloor` -20). With that, floors run at about
a hundred signings and twenty-five live in three years, sanctions are
back at forty to fifty, and the war weights settled at `wSpoils` 2.5
and `wNeedWar` 2 for about six wars a year.

### After the review: the defender's path

Wars used to be decided at declaration: the attacker only attacked on
an estimated edge, and the front then moved by the true odds with
nothing the defender could do. Four things now give the defender a
path, aimed at the attacker winning about two thirds of wars begun on a
modest edge:

- **Mobilisation** (`mobilise`): a fast, dear military project
  (`mobilDays`, `mobilStep`, `mobilPremium`) that costs stability
  (`mobilStab`); the defender takes it automatically the day it is
  attacked if it can pay, anyone at war may choose it monthly
  (`wMobil`), and the reserves stand down at peace (`demobRate`,
  tracked in `mobilised`).
- **The supply line**: the attacker's army is spent faster the further
  it fights from home, `warMilAtt x (1 + supplyLine x (1 - reach))`,
  so a war across a sea lane or by air bleeds it more than one over a
  land border.
- **Trust in allies**: the estimate counts each expected ally at its
  trust (`expectedStrength`), and a refusal is a reputation: every
  pact partner of the refuser remembers it (`refuseTrust`, mending at
  `trustRecover` a day; saved as `allyTrust`). Joining restores the
  friend's trust.
- **Noise by the odds**: the front's daily noise scales with how even
  the odds are (`2 / (odds + 1/odds)`), so close wars are genuinely
  uncertain and routs are not.

The victory headline now says whether the attacker or the defender won,
and the census counts both.

### After the review: the mechanical clean-ups

- **Memos invalidate on write.** The pairs table carries a version
  (`touchPairs`, `WORLD.pairsVersion`) bumped by every writer -- a new
  pair, a deal added or dropped, a pact or sanction set or cleared, a
  relation crossing `tieFriend` or `tieFoe`, a load, a new world -- and
  `pairCounts` and `pactPartners` key on it, so a pact signed this
  morning is seen at noon. The smoke checks that had to wait a day no
  longer do.
- **Constants into Config, one frontier helper.** `frontier(tech)` in
  countries.js serves research, discoveries and diffusion. New rows:
  `enmityPower`, `projectGainTop`, `aidRel`, `coupRel`, the label grid
  (`labelAuth1/2`, `labelFree1/2`), `joinRelFriend`, `joinRelFoe`,
  `joinRelFoeFloor`, `victoryStab`, `victoryRel`, `occupyAuthDiv`,
  `electionUnpopular`, `electionSwingMult`, `strongmanStab`,
  `strongmanLegit`, `pairPrune`.
- **Names.** The state field is `econOpen` (economic openness; the save
  keeps the short key `op`), `reachFactor` is the war's distance factor
  beside the `canReach` gate, `allyMilAttr` is what an ally spends, and
  the pair's `trade` flag is gone (`dealing(p)` reads the deals). The
  relative endowment `res` stays stored beside `potential` for now; a
  discovery scales both together.
- **Pairs at rest are forgotten.** `relaxRelations` deletes a pair with
  no deals, pact, sanction, war or truce whose relations sit within
  `pairPrune` of the resting point; `baseRel` answers for it again. The
  table stops growing with the game.
- **The save table.** `PAIR_FIELDS` and `DEAL_FIELDS` pack pairs and
  deals as small objects with named short keys, defaults omitted, like
  `COUNTRY_FIELDS`; version 6; older saves (2-5) load as a new world with
  the player kept. A registry check in the smoke test found two
  collisions in the country table that had been silently overwriting
  each other on every load -- `openness`/`outPrev` shared `op`,
  `occupiedUntil`/`output` shared `ou` -- now `opv` and `out`.
- **Two browser runs.** The review's checks (deals, sanctions,
  government, war, climate, scarcity, the defender's path) run in their
  own page on their own 775-day world (`--only world`), so the long
  functional scenario and they no longer share state or a hold; the
  technology-upkeep check freezes every other lift of technology and
  starts its subject off the ceiling, where the drift noise clamps a slow
  decay away.

### After the review: one economy, one scale

There were two economies: `output` per head, unbounded, the quantity
the economy pass actually grows, and `st.economy`, its clamp to 0..100
that the drift targets, the flows, the map, the deal, sanction and
border candidates and the strike weight all read -- so above the
reference every rich country looked the same to them. And
`st.resources`, the worst supply balance, was a derived number stored
in the stat bag and rewritten every day.

- **The economy is an index of output.** `ecoIndex(output, cfg)` in
  countries.js is `50 + ecoIndexSlope x log2(output / ecoIndexRef)`,
  floored at 0 and unbounded above: 50 at 50 output a head, 80 at 100,
  110 at 200, 20 at 25. `WORLD.ecoIndexOf(iso)` gives it and
  `ecoClamped(iso)` caps it at 100 for readers that want a level (the
  drift targets, the flows, the map layer). The stat bag holds the six
  stats a country actually has (`STAT_KEYS`: infra, military, academia,
  medical, stability, technology); the seed table's economy column
  starts `output` and "resources" on the screen and the map is
  `floorOf` (the binding balance), no longer stored. The save packs six
  stat entries and is version 7; older saves load as a new world with
  the player kept.
- **The reference matters.** The first census set the reference at
  `econRef` (100, where growth saturates): the index then averaged 28
  on day one instead of the 54 the old clamp gave, and everything
  reading it sagged -- academia and stability by 15 points, technology
  by 13, output by 5. With the reference at 50 and 30 points a doubling
  the day-one mean is 50 and the three-year trajectories sit within
  four points of the section 3 census (infra 66, military 68, academia
  64, medical 67, stability 64, technology 69, output 72, legitimacy
  72).
- **What the log does.** Rich countries no longer read as 100: the
  share of countries pinned at a stat ceiling at year three fell from
  13% to 1% for stability >= 90, from 12% to 7% for technology >= 95
  and from 15% to 6% for academia >= 95, without a floor attractor
  appearing. Wars 6.7-10 a year (attacker victories 10-20, defender
  2-6, peaces 6-11), cartels 107-160, pacts 53-66 live, pairs
  2300-2850: the same world.

### After the review: decisions in one unit

The candidate utilities used to add up numbers in unrelated units --
`wNeed x gap/100`, `wTrade x (cover + relief + goodwill)`, `aggr x edge
x (greed + enmity) - warThreshold` -- tuned by weights found in sweeps,
so every new move meant a new tuning session. Every candidate now says
two things: **value**, what the move is worth over the government's
horizon in days of the country's income, less what it costs; and
**risk**, 0..1, how likely it is to come to nothing. Then
`U = value x max(0, 1 - risk x caution) / horizon`: income-days per day
of horizon, a fraction of a day's income, the same for a deal, a
project and a war, and holding is 0. `softmax` keeps `decideTemp`, now
0.02 in that unit. The old `w*` weights, `treasuryGuard`,
`warThreshold`, `joinLoyalty`, `joinCost`, `refuseBase` and
`sanctionCost` are gone; what cannot be paid for is not offered.

Temperament and government enter only as values and as caution:

- **A point of a stat** short of its want is worth `valueOf<Stat>` a day
  (six rows), times the priority the government gives it (`P.growth`
  for infra, `P.guns` for military, `P.science` for academia and
  technology, `P.order` for medical and stability), more the wider the
  gap (`x gap/50`). A project's value is the points it adds x that x
  the horizon, less its cost in income-days; research likewise, with
  the academia it brings.
- **A point of relations** is worth `valueOfRel` a day with an equal,
  more with a bigger partner (`sqrt` of the GDP ratio, capped at 2) and
  to a government that prizes standing (`P.standing`). Deals, pacts,
  sanctions and their ripples through the target's friends and foes
  are valued through it.
- **Hurting an enemy** is worth `valueOfSpite` a day at full enmity,
  steep in the enmity (`enmityPower`) and more to a warlike temperament
  (`0.5 + aggr`); a sanction delivers `sanctionSpite` of it.
- **Cover.** A pact is worth `securityWorth x (pactInsure + threat/100)`
  a day, as far as the partner's force covers ours (`pactShare x`
  their force / ours, capped at 1); its risk is `pactDrag` per enemy the
  partner has. A border level is worth `borderWorth x pressure / 2` a day
  against `borderEcoCost`, and a change still needs `borderMin`.
- **Caution** is `riskAversion x (0.5 + caution)`: a cautious government
  discounts a risky move more; a risk never turns a loss into a gain.

The war and its ending:

- **The odds become a chance** (`pWinOf`: `1 / (1 + odds^-warSharp)`)
  and a length (`warLength`: how long the front takes at that pace,
  capped at `warMaxDays`). A war's value is `pWin x prize + spite -
  campaign - (1 - pWin) x defeatWorth - weariness x wearyCost -
  relations thrown away`, where the prize is what an occupation would
  yield as far as the horizon (our share of their production and
  income, the imports we would stop paying for) plus the tribute, the
  campaign is `length x warDayCost x supply line` (dearer across a sea
  or by air, as the attrition is), and the risk is the estimate's
  spread plus `riskReach` for distance. No war below `warStabMin`
  stability or without the war chest. The candidate carries its parts
  for the probe.
- **Peace takes two.** `peaceValue(iso, war)` is the rest of the
  campaign saved and the defeat avoided, against the prize forgone and
  the indemnity paid or received; the side that offers (`offerPeace`)
  gets it only if it is worth something to the other side too, else a
  refusal is logged (kind `offer`) and the offer is not repeated for
  `peaceRetry` days. Before this, the side behind sued at its first
  monthly turn and nearly every war ended in a treaty (attacker
  victories 0-9 of 25-35 endings); with consent the attacker's
  victories are 4-9, the defender's 2-6, peaces 11-21.
- **An ally's call** is valued as the friend's gratitude, the pact and
  its cover kept (refusing loses both) less its own share of the
  campaign at its own, lesser, attrition; the risk is the chance of
  losing. **Mobilising** is the change in that chance times the stake
  (defeat plus the prize) and the days it saves, less its cost and the
  stability it spends, by the gap that opens.

The census after one tuning pass (six seeds, three years; the values
above are the rows as set): wars 6.7-9.3 a year, joins 8-24, refusals
10-20, mobilisations 22-35, cartels 95-140, deals ~2500, sanctions
40-69, pacts 78-98, border changes 93-125, projects ~3700 (infra
~1000, military ~1150, stability ~1000, academia ~250, medical ~300),
research ~1800. Year-three means: infra 65, military 65, academia 64,
medical 65, stability 63, technology 69, output 72, legitimacy 72 --
within four points of the one-economy census, with academia and
medical projects fewer (their wants are close to where the stats
drift) and no stat pinned at a ceiling for more than 2% of countries.
`tools/probes/decisions.js` prints, for one seed a year in, every
action's offered count and the spread of its value, risk and U, the
top candidate per cadence, what was taken over the year, and the war
candidates' parts; `tools/probes/warsweep.js` now sweeps `warDayCost`
and `valueOfSpite`.

### After the review: fronts and coalitions

A war was a duel: allies who joined added `pactShare` of their force to
the principal's score and bled a little, and nothing else happened on
the map. Now a war can have several fronts and pull in a chain of
pacts. The choices made at the start of the section: an ally opens a
front of its own; allies on a front share the terms and can be the one
to occupy; fronts end on their own; a joining ally calls its own pact
partners.

- **Fronts** (`war.fronts`, `{ a, d, score, since }` with `a` on the
  attacking side). The principals' front is the war's own score. An
  ally that joins opens a front against every member of the other side
  it can reach -- `canReach`: a land border always, a sea lane or the
  air by technology, the same rule that lets a country declare war at
  all. (The first cut used land borders only: in six seeds and 175
  joins no joiner bordered its enemy, because the partners who answer a
  call are mostly the distant powers a pact reaches by sea and air.) An
  ally that cannot reach anyone adds `pactShare` of its force to its
  friend's front, as before.
- **A country's force is split evenly across its fronts**
  (`frontOdds`): a principal fighting an ally on a second front meets
  the other principal with half its strength. Each front moves by its
  own odds with the same pace and noise; both parties on it bleed
  (`bleed`, the attacker dearer far from home) and gain weariness;
  allies without a front bleed the lesser ally share.
- **A front decided** (`endFront`): an ally beaten on its front pays
  the front's winner tribute, may be occupied by it (`occupyChance`),
  suffers `defeatShift`, and is out of the war (`leaveWar`, log kind
  `front`); a principal beaten on any front is defeated and the war
  ends with that outcome. Otherwise the war ends when the principals'
  front does -- victory, peace by consent, or the time limit -- and
  every open front closes with it.
- **The terms are shared** (`recipients`): the winner and the allies on
  its side who fought the loser on a front of their own, by force
  contributed. Tribute is split so; peace terms give each recipient
  its share of the indemnity and the lease as a deal of its own; the
  occupier, if any, is drawn among them by force.
- **Coalition chains.** `joinWar(iso, war, side, caller)` records who
  called whom (`war.calledBy`) and asks the joiner's own pact partners
  in turn, so the weekly join/refuse candidate is offered to a
  friend-of-a-friend, valued against the friend who actually called.
  The join candidate knows whether it would open a front: then it
  weighs the full campaign (dearer by the supply line) against its
  share of the prize; otherwise the lesser ally cost.
- **Who is at war.** `WORLD.fighting(iso)` is a principal or an ally on
  a front, `WORLD.frontsOf(iso)` lists the fronts; the growth drag,
  weariness, refugee hosting, aid, the world-war event, the war-target
  gate, the map's conflict layer and the country screen (chips, the
  military section, the tooltip) read it. `atWar` still means a
  principal.

Six seeds, three years: fronts opened 5-23 per seed (joins 13-33,
refusals 11-28), fronts decided against an ally 0-2 (wars usually end
before a second front does), refused peace offers 0-5, wars 5.3-11 a
year, attacker victories 3-10 and defender victories 1-9 -- the
defender wins more often than before, as a second front halves the
attacker's strength on the first -- peaces 8-23, mobilisations 16-34;
everything else where the previous census left it (stability 63,
technology 68, output 71, legitimacy 71 at year three). The smoke's
world run forces a three-country war (an attacker, its victim and a
helper bordering both) and checks that the helper's front opens, that
its own partner is called in the chain, and that a front lost knocks
the helper out while the war goes on.

### After the review: the balance pass

The six-seed census after sections 4 and 5.3 showed eight oddities
(section 7 of `world-sim-critique.md` lists them). Each group below
was applied, run through the smoke suite and a census, and the next
begun; the numbers at the end are the final census against the one
before the pass.

- **A. The market.** A buyer used to refuse any non-vital type once
  the landed price passed `priceLimit`, and ordered only its single
  worst shortage a day, so in three seeds of six half the world sat
  short with money in the bank and its laboratories dark. Now every
  shortage is ordered, the worst first, within means, at whatever the
  landed price is; only the buying-ahead into the stores stops above
  the limit; `dealSlot` is a smaller premium. Famine fell from 32-43
  countries to 18-25, dark laboratories from up to 69 to under 32, and
  legitimacy stopped splitting by seed. The consequence: with buyers
  buying, materials are genuinely scarce by year three (price 2-7,
  the exchange stock a fraction of a day), because materials use grows
  with output and armies while endowments do not; some importers pay
  more than a day's income a day for them. That is the overshoot the
  population session is for.
- **B. Endings and truces.** Peace never lifts relations above where
  the war began, less `peaceScar` (20); no offer of peace before
  `peaceEarliest` (10 days); a front that has not moved `stalemateBand`
  (0.15) in `stalemateDays` (45) is a stalemate (it fires on even wars,
  which are rare now that the estimate is honest); a truce is drawn
  between `truceMin` and `truceMax` of `truceDays` from the war's id;
  weariness fades at half the rate (`wearyDecay` 0.1) and a war costs
  twice as much of it (`wearyWar` 40); an attacker remembers a war lost
  or drawn against a target for `warMemoryDays` and discounts its next
  estimate by `warMemoryDiscount`, and values a target it beat within
  that memory at `satietyDiscount` of its prize. Treaties fell from
  8-23 a seed to 3-13 and wars run to a decision.
- **C. Fronts and coalitions.** A front moves at the pace of its reach
  (`frontDomain`, `frontPace`: a land border 1, a sea lane `reachSea`,
  the air `reachAir`); a country divides its force among its fronts by
  the threat on each, the enemy's force times how far it reaches
  (`frontShare`, never below `frontShareMin`); a defender without the
  technology for the domain (`techLow` at sea, `techHigh` in the air)
  fights without its bonus and terrain, bleeds `domainPenalty` faster,
  and the front moves at the square root of the reach against it,
  while such a campaign is dearer for the attacker in general (slower,
  and the supply line); only the principal or an ally that reaches the
  loser by land can occupy it (`occupierOf`). The estimate now counts
  every ally, ours and theirs, at the chance its own weekly choice
  would fall to joining (`joinValue`, `joinChance`: the same valuation
  the candidate uses, against refusing and holding), ours at our trust
  in them as well, reachable allies as the fronts they would open, and
  the defender's mobilisation the day it is attacked. The first cut of
  this section, with allies still counted at `pactShare` and trust,
  lost wars at 3:1 to 7:1 "truth" because the allies never came; the
  honest estimate cut the war rate to three a year, and `warDayCost`
  came down to 1.5, `defeatWorth` to 150 and `valueOfSpite` up to 0.5
  to bring it back.
- **D. Cartels.** No floor for a type the world does not import
  (`cartelDemand` of world use; `M.need` is kept for it); the partner
  cap `cartelPartners` binds the accepting side too; a floor brings
  `cartelRel` relations rather than a cargo's. Floor signings fell from
  95-140 a seed to 45-55; water and food still sit at their glut floor,
  which is the endowment, not the cartel rule.
- **E. Treasuries.** The cap is `treasuryCapDays` of income
  (`ECONOMY.capOf`), so a small state's is small and the ten largest
  economies stop pinning at a flat figure (at cap: 6-15 countries,
  from 20-23); money above the reserve makes a project cheaper, down to
  `hoardFloor` of its cost over `hoardDays` of income, so the rich
  invest: research rose from ~1800 a seed to ~2300 and projects shifted
  toward infrastructure and the army (stability projects ~500 from
  ~1000, the stat itself unchanged).
- **F. The rest.** A call goes only to partners who could contribute
  (`contributors`: reach the enemy, or `contributeMin` of our force at
  `pactShare`); a refusal (`refuseCall`) breaks the pact only when a
  principal called, and only strains it when a friend's friend did;
  the census counts occupations from the victory and front entries and
  labels the grouped adoption row. The small-state output leaders were
  probed and are the seed rows (Kosovo starts at technology 83) plus
  the uniform 10-17% a year growth: the defaults and population
  sessions, not a mechanic.

Final census, six seeds, three years (before the pass in brackets):
wars 4.7-9.0 a year (5.3-11), attacker victories 11-14 against the
defender's 1-3 (3-10 against 1-9), peaces 3-13 (8-23), stalemates 0,
refused offers 1-11, repeat wars 6-11 of 14-27 -- most between the
seeded rivals (Russia and Ukraine, the Koreas, India and Pakistan) --
attackers 7-15 (7-13), fronts 7-15, joins 11-22, refusals 6-18,
occupations 9-12; cartels 45-55 (95-140), deals ~2500, pacts 57-71
live; famine 19-25 (32-43), laboratories dark 24-32 (34-69), low
stability 17-22 (29-33), treasuries at cap 6-15 (20-23). Year three:
infra 68, military 68, academia 66, medical 66, stability 67 (63),
technology 71 (68), output 78 (71), legitimacy 82 (71, and 60 in
three seeds). War dead 9-26 M (5-16), from more wars running to a
decision.

### Curated defaults as built

Every code the map knows has a hand-set row in `js/data.js` (system 2
above describes the columns); 248 rows, 194 agents, 35 scenery codes
under the 0.05 M line. The six-seed census on the real world against
the balance-pass census (in brackets):

- **The world starts poorer and less settled**, because the 182 codes
  that ran on a region baseline were mostly the poor ones: day-one means
  stability 54 (57), technology 49 (57), output 46 (54); year three
  stability 58 (67), technology 63 (71), output 64 (78), legitimacy 72
  (82). Governments read as the world does: 53-62 liberal democracies,
  27-37 managed ones, 36-48 juntas, 8-20 one-party states.
- **Wars** 5-9 a year, attacker victories 9-15 against 2-6, occupations
  10-18, and war dead 7-52 M (9-26): the same rate, on real populations.
- **Famine** 17-23 countries (19-25), now the poor importers rather than
  the empty territories; dark laboratories 14-24 (24-32); treasuries at
  cap 2-12 (6-15); deals ~3000 (~2500); pacts live 45-57 (57-71).
- Everything else within its band. The review list (`docs/defaults-review.md`)
  holds 271 rows that stand out against their region, one rule flag
  (Equatorial Guinea, now typed party), Burundi just over its day-one
  capacity (`popPerKm` 0.0045), and the endowment picture.

### Population cycle as built

The target behaviour below (overshoot and collapse, like a bench plate)
is now in the model. Population used to be a plateau: births peaked at
half a percent a year, famine deaths at thirty, the stores signalled
nothing until empty and their cap grew with consumption, and production
scaled with `min(1, pop/pop0)` where `pop0` never moved, so a collapse
scarred production for good. What changed (`js/economy.js` unless
said):

- **Granaries on production.** The food and water stores hold
  `vitalStockDays` (180) of what the land yields and the deals bring,
  times the infrastructure factor, not of what the people eat; energy
  and materials keep `stockDays` (30). A granary that does not grow with
  the mouths is what lets a population outrun it. They refill at
  `stockFill` (0.1) of use a day and open half full.
- **Cover.** The stores' draw is smoothed over ten days (`drainSmooth`
  0.1) and `s.cover` is how many days the food or water will last at
  that draw: zero when short today, infinite while the stores are not
  falling.
- **Births read the store.** `birth = birthBase x medF x fed x secure x
  rationF x (1 - pop/popCap)`, with `secure` falling from 1 to
  `birthStoreFloor` (0.5) as the cover drops under `birthCoverDays`
  (90), `medF = 1 + birthMed x (0.5 - medical/100)` (the demographic
  transition: hospitals lower births, `birthMed` 1.2, so a rich country
  grows about 1 % a year and a poor one 2-3 %), and `rationF` cutting
  births by `rationBirth` (0.6) at full rations. `birthBase` 0.00009.
- **Deaths.** Famine begins at a 3 % shortfall (`famineBelow` 0.97) and
  adds `deathFamine` (0.003) per unit of it, so a population fed at 90 %
  loses about 8 % a year; `deathMax` (0.00025, about 9 % a year) caps
  it, so nobody dies out; `deathCrowd` stays the physical ceiling.
- **Rationing by legitimacy.** A regime cuts food and water per head by
  up to `rationMax` (0.2) times its legitimacy, in proportion to the
  day's shortfall (`rationSharp` 10: a 10 % gap calls for full rations)
  or, when the granary is under half and running out, to how soon it
  will be gone (`rationCoverDays` 180); rations move at `rationRate`
  (0.05) a day and cost `rationStab` (10) of the stability target at
  full. `standing()` and the market read the rationed consumption, so
  deals and purchases shrink with it. A trusted government stretches its
  stores and holds a managed plateau; an illegitimate one cannot, and
  the shortage itself costs legitimacy, so the badly governed crash.
- **A slow workforce.** `pop0` follows the population over
  `workforceDays` (730), so production follows a collapse down and a
  recovery back up, and while it lags above a falling population it
  carries the decline past sustainability.
- **Saved:** `ration` (`rn`) and `drain` (`dn`); `cover` is derived
  daily. Rows in the People and Production groups of the Config panel;
  `labourShare` and `labour()` (never used) are gone.

`tools/probes/population.js` samples every agent every thirty days
for as many years as asked and summarises each curve (peaks, troughs,
period, drawdown, months in famine and rationing) with the means that
band it; `tools/population.py --run --seeds ... --years 15 [--freeze]`
runs it on several seeds at once and prints the world by year, the
bands (governance fit x technology x supply), the extremes, a
watch-list of sparklines and the verdicts. The smoke's world run forces
an overshoot on a food exporter at peace (Argentina or the next in
line): rations start before the granary empties, the store drains,
famine and deaths follow, the workforce follows the people, and a
population put back under the line recovers.

**Tuning.** Two eight-year probes drove three corrections before the
long runs: famine deaths slowed from 17 % a year at most to 9 %
(Yemen, Somalia and Eritrea were falling to a quarter of themselves in
eight years; they now halve, heading for what their land and their
purse feed), the demographic transition was strengthened (rich
countries grew 2 % a year with no ceiling), and rationing stopped
flickering on importers whose tiny granaries hover at their cap.

**What the long runs show** (three seeds, fifteen years, once with
output growth frozen to isolate the people and once as the game runs):

- **Nobody dies out and nobody grows without bound.** World population
  rises about 13 % in fifteen years and decelerates; the fed bands
  grow 1-2.5 % a year at their fastest with drawdowns under 1 %; no
  country passes 1.8x its start.
- **The structurally short settle at their line.** Yemen, Somalia,
  Eritrea, Niger, Djibouti, Somaliland and Palestine, whose land yields
  a quarter to a third of their food and whose purse cannot buy the
  rest, fall to 0.28-0.35 of themselves over the fifteen years and stop
  there, the famine count falling from 10-17 countries to 2-7 as they
  arrive. That is the model's poverty trap, not the cycle; the aid and
  credit that would feed them are another session's.
- **Damping works.** Median drawdown 0.8 % for the governance-fit band
  against 6.6 % for the misfit band (3.1 % against 8.4 % with output
  growth on), and the crash bands are the low-technology short ones
  (35-43 % over fifteen years).
- **The wave shows where a country grows into its line.** Congo rises
  for nine years and then falls; Saudi Arabia plateaus on rations; the
  United States dips 5 % on a bad store year and recovers. Most
  countries are far above their line (the world opens 30 % over its
  food need, `worldBalance0`) or already below it, so a 10-20 year
  period is not measurable across the world within fifteen years; the
  lever that would make waves general is the world's slack, which is a
  design choice for the whole economy, not a people row.
- **With output growth on** the world hits its materials wall by year
  five (balance 1.0 from then on) and legitimacy sinks to 55-65 on the
  shortage term, the same crunch the balance pass recorded, now seen
  for fifteen years: a plateau, not a wave, because degrowth is
  proportional. Its levers are `growthBase`, `capBase` and
  `worldBalance0`.

The six-seed census after the session, against the curated-defaults
census: world population +3.1-3.5 % in three years (+1.5 %); famine
17-23 countries (17-23), 18-24 short of food or water, 44-60 rationing
somewhere; wars 5.3-8.3 a year (5-9), attacker victories 10-20 against
2-4; stability 58 (58), technology 64 (63), output 64 (64), legitimacy
73 (72); the same world, with people who now move.

### Population: the target behaviour (deferred, stages 6–7)

Population today only grows, because nothing kills yet. It needs both
halves, and the shape to aim for is the one the bench plates show:
**overshoot and collapse, cyclically.**

- **Ways to die** arrive with the systems that own them: war deaths
  (stage 6, more on the defending side), disaster deaths and refugee
  flight (stage 7), famine mortality (already in stage 2, with the
  `deathMax` floor), and the outbreak (system 12, deferred).
- **Overshoot is wanted, not a bug.** A population should be able to
  grow past what its supply can feed, drawing the national stockpiles
  down as it goes, and then fall when the stores run out — the same
  oscillation a plate shows when an organism outruns its substrate.
  Stockpiles are what make the cycle rather than a smooth ceiling: they
  delay the signal, so the correction arrives late and overshoots
  downward too.
- **What should damp the cycle**: good governance (a legitimate regime
  on its baseline axes, stage 5), pacts and deals (a partner's surplus
  arrives before the stores are empty, stage 4), and technology
  (production per head, storage, medical). These are the levers a
  player and a well-run country have against the trough.
- **What should deepen the trough**: a regime mismatched to its nation
  (large effective-minus-baseline distance, stage 5), low technology,
  and poor access to resources — whether a thin endowment, low
  infrastructure, sanctions or no partners. A badly governed, isolated,
  low-technology country should crash hard and recover slowly.
- **The balance to aim for**: no country grows forever and no country
  dies out; the well-governed, well-connected and advanced ride shallow
  waves, the badly governed, isolated and backward crash deeply. The
  probe to watch it: population per country over 10–20 years, reporting
  peak, trough and period per country band.

### The second balance pass: cycles, occupation, coercion, pacts

The ten-year chronicle of seed 12345 (`tools/probes/chronicle.js`,
read with `tools/chronicle.py`) showed the world booming for four
years and grinding down for six; occupations thrown out at a median
of 83 days (59 of 89 by uprising); 221 violent revolutions, almost all
in poor autocracies; Russia unable to reach Poland through an occupied
Ukraine; and a country pledged to both principals fighting one side
while thanking the other. Section 8 of `world-sim-critique.md` lists
the decisions. Five sessions, each through the smoke suite; the census
and the probes at the end.

- **A. Materials answer technology.** Materials was the only resource
  with neither a technology production factor nor an efficiency
  factor, so its use grew with output against a fixed potential and
  the world hit a wall by year five. Now production of materials is
  `potential x access x (1 + matTechProd x technology/100)` and the
  use per unit of output falls by `matTechEff x technology/100`, the
  pair energy already had; the world normaliser (`seedPotentials`)
  counts the factor so day zero still balances at `worldBalance0`.
  The ceiling rises with diffusion, so each boom can peak higher than
  the last. High-technology countries gain supply at day zero and
  low-technology ones lose it, the world sum unchanged.
- **B. Booms and busts.** Growth was a fast logistic and decline a
  proportional slide capped at 0.1 % a day, the reverse of the shape
  wanted (long slow booms, sudden deep busts, a recovery that picks up
  pace). Three things were added. *Confidence* (`s.boom`, 0..1) builds
  while the balances hold, at `boomRise` a day (a time constant of
  about four years), and sets the pace of growth from `boomFloor` to
  full and the size of credit (`creditBoom`); `growthBase` and
  `growthTech` are lower so a ten-year boom averages three to four
  percent a year, and the visitors' bonus (`visitorGrowth`) is smaller
  and scales with the pace, since at the old size it outgrew the base. *The bust*: a shortage, a debt over the limit or a
  world crash (with a shortfall of half the bite) in a confident economy
  (`bustBoomMin`) cuts output at
  once to what the supply supports plus an overshoot with confidence
  (`bustShort`, `bustOver`, within `bustMin`..`bustMax`), resets
  confidence, stops growth for `bustDays`, costs `legitBust` and
  `bustStab` while fresh, and spreads to trade partners that were
  short and confident at `shockSpread` (one hop a day, a seeded draw).
  The chronic slide stays for a country short for good, gentler
  (`degrowthRate`, `degrowthMax`). *The crash*: the exchange fires it
  when a type's world cover falls under `crashCover` days at a price
  of `crashPrice` or more, at most once in `crashGap` days (three years);
  the massive tier's coin-flip crash is now a rare panic (3 % of world
  events). The treasury cap closes
  gradually (`capClose`) instead of deleting savings on the day output
  falls. Saved as `boom` and `bustUntil`; the country panel shows
  confidence and a fresh bust. The cycle probe (`tools/probes/cycle.js`,
  `tools/cycle.py`) reports boom length, bust depth and duration, time
  to regain the peak, crashes and contagion.
- **C. Occupation as control.** An occupier used to get half the
  production and half the tax and nothing else: no manpower, no reach,
  no cost, and an uprising was a flat coin a day. Now the occupier
  posts a garrison sized to what the occupied country could still
  muster (`occupyGarrison` of its own force) out of a share of its own
  force (`garrisonShare`) split among its holdings; the fill of that
  garrison is the *hold*. A held territory yields a levy of its people
  (`occupyLevy` x hold) to the occupier's army; the garrison is taken
  off the occupier's usable force (`WORLD.force`, with `ownForce` the
  bare formula); the uprising rate is `upriseBase x (1.5 - legit/100)
  x (1 + upriseLevy x levy share) x (1 - upriseHold x hold)`. A strong
  occupier of a crushed neighbour holds it for its term and gains by it
  (a levy of 0.3 of the people against a garrison of 0.2 of the
  occupied's own force: a net gain whenever the occupier's army is the
  better one); a small occupier of a big country is thrown out in
  months. A country fights
  from what it holds: an occupied neighbour's borders and lanes are the
  occupier's (`holdingsOf`, `viaHoldings`), read by reach, the front's
  domain, the supply line and who may occupy.
- **D. Regimes.** Regime type was only a succession rule: nothing let
  a high-authority regime hold the street, collapse was a deterministic
  timer on stability alone, and the one advantage autocracies had was
  negative (a peaceful revolution needs freedom over
  `reformFreedomMin`, so they could only fall violently). Now
  *coercion* = authority above `coerceFloor` (scaled to 0..1) times the
  army counted from `coerceMilFloor` up (even a small one puts down an
  unarmed street; `COUNTRIES.coercion`) adds `coerceStab` x coercion to the
  stability target and lengthens the collapse timer by `coerceDays` x
  coercion, and decides who takes a collapse (the army, at the greater of
  its level and the coercion, or the street); a junta whose legitimacy is under 40 answers an appointment
  with a *crackdown* (the party's purge in uniform: `purgeStab`,
  `purgeAuthority`, `purgeFreedom`); a non-elected regime with
  legitimacy over `liberalLegit`, an economy index over `liberalEco`
  and stability over `liberalStab` *liberalises* at `liberalChance` a
  day (a peaceful revolution called from above, logged
  `revolution:liberal`), the balance to the ratchet the coercion term
  deepens; the war penalty in the stability target is the row
  `warStab`; sanctions cost `sanctionStab` x min(1, sanctioning
  countries / `sanctionRef`). In `data.js` every `elected` row with
  freedom under `electionFreedom` is typed `party`, since its first
  election would have cancelled the next anyway: NI HT VE BY RU AZ DZ
  DJ SO UG BI ZW CD CF CM TG GW PK BD IQ PS.
- **E. Defenders and pact conflicts.** `defenceBonus` 1.25 to 1.3. A
  country pledged to both principals used to land in both call lists,
  take its side from the attacker's and its caller from the defender's,
  and fight the one while thanking the other. Now callers are kept per
  side (`war.calledBy.att/def`, `callerOf`), a conflicted country gets
  a join candidate for each side with that side's own caller and one
  refusal; refusing when pledged to both is *neutral* (no trust or
  relations lost, both pacts kept, logged `pact:neutral`); joining one
  side leaves the other pact quietly (`pact:left`, no reputation
  ripple beyond the war's own); the attacker's estimate counts a torn
  ally on neither side.

**Checks added** (`tools/smoke.py`): `creditFollowsBoom`, `capCloses`,
`boomBuilds`, `bustBreaks`, `crashOnScarcity`; `levyByControl`,
`upriseSlower`, `reachViaHolding`; `coercionHolds`, `warStabRow`,
`sanctionsStab`, `crackdownRallies`, `liberalisesWhenRich`;
`conflictedSides`, `conflictedNeutral`, `conflictedLeaves`. Two older
checks changed with the world: the cartel check waives the price lift
when its two sellers hold under a quarter of the world's sells (in a
glut two members cannot lift the price, and holding ranks is the
test), and the misfit check nudges authority down rather than up so
coercion cannot offset the loss it measures. The census counts busts,
crashes, neutral refusals, pacts left, crackdowns and liberalisations,
and the mean confidence.

**What the census shows** (six seeds, three years, against the
population pass). Wars decided per year 5.3-8.3 (was 5.3-8.3): reach
through holdings did not lift the war rate. Uprisings 7 across the six
seeds (was 21); occupations 75 (was 83); releases 41 (was 41): an
occupation now usually runs its term. Revolutions 47 a seed (was 47)
and coups 23 (was 24) did not move at the first coercion default
(`coerceStab` 20, the army as a plain factor), so the default was
raised to 25 with the army counted from `coerceMilFloor` 0.4 up; the
chronicle below is the re-check. Crackdowns 14-28 a seed and
liberalisations 0-3 (0-1 a year across the world). The materials wall
is gone at year three: balance 1.22-1.28 (was 1.06-1.09), price
0.8-2.3 (was 3.5-10.6); with resources cheap, wars are less
profitable, the greed share fell (0.20-0.39, one seed 0), joins fell
from 93 to 58 while refusals rose from 68 to 78, and war dead halved
(8-16 M, was 16-42 M). Busts 8-22 a seed in three years and 2-7
countries in a bust window at any time; crashes 1-3 a seed, all of
them the massive tier's panics (no type was scarce yet); mean
confidence 0.18 / 0.30 / 0.39 at years one to three. Famine 20-24
(was 20-23): the busts did not starve anyone; the gradual cap leaves
24-33 exporters sitting above their cap (was 2-11 at it). Stability
57.6 at year three (was 57.5), legitimacy 74.7 (was 73.1), output 55.7
(was 64.4) and technology 62.5 (was 63.7): the slower boom costs
output, not order. Neutral refusals 2 and pacts left 0 across the six
seeds: a pact with both principals is rare.

**What the chronicle shows** (seed 12345, ten years, against the
story told before the pass). Wars 73 (was 141); occupations 42, of
which 28 ran to a withdrawal at a median of 300 days and 6 ended in
an uprising at a median of 185 days (was 89 occupations, 59 thrown
out at a median of 83 days): Korea holds Korea for a year now, and
Qatar does not hold Yemen. Violent revolutions 133 (was 219) and
coups 86 (was 57-75): with coercion at 25 and the army taking a
coercive regime's collapse, the poor autocracies that used to fall to
the street fall to their own generals, and the functioning ones hold
(Egypt 45 to 72 output at stability 91; Russia and China keep their
labels). What still churns is the failed states at famine, war and an
output near 1 (Syria, Yemen, Djibouti, Chad, Niger: 7-9 label changes
each), where no coercion reaches the collapse floor; each street
revolution there shifts the base by `revoltFreedom`, so after enough
of them Syria reads "Liberal democracy" at stability 0. A bounded base
shift (toward a target rather than additive without limit) is the
follow-up. Crackdowns 124 and liberalisations 7 in the decade.

**What the cycle probe shows** (seed 12345, twelve then twenty years).
The shape is right: busts are sudden (a median of nine to eleven
months from peak to trough, 24-36 % deep) and the recovery starts at
a fifth of the pace and accelerates. The period was not, at first: at
`growthBase` 0.00025 the world grew near six percent a year, hit the
materials wall by year six and again at year ten; at 0.00013 the first
boom ran eight years (48.6 to 68.0 at year eight), the wave at year
nine busted 99 countries, and a second wave came only four years
later at a lower peak, because the crash busted every confident
country that was short at all, the price collapse ruined the
exporters, and their unpaid upkeep eroded supply so the next wall came
sooner; Japan slid from 85 to 9 through two years of eight-times
prices. The second tuning: a crash busts only the confident with a
shortfall of half the bite; `bustMax` 0.3; the chronic slide at
`degrowthRate` 0.001 and `degrowthMax` 0.0002 (seven percent a year
at most); `crashGap` three years and the massive tier's panic at 3 %;
`growthBase` 0.0001 with the visitors' bonus cut to a quarter and
scaled with the pace (it had outgrown the base and set the world's
pace by itself). The supply-destruction loop (unpaid upkeep decaying
infrastructure and dark laboratories decaying technology through a
bust) is what still shortens the second boom; its levers are
`decayInfra` and `decayTech`, left as they are. With that tuning the
twenty-year run had the shape (first boom ten years, waves of 62 and
71 busts at years eleven and seventeen, busts nine months and 30 %
deep, 34 % of countries busting at all and three of them twice,
crashes 0.25 a year) but no growth in the boom: at `growthBase`
0.0001 world output per head was flat over twenty years and each wave
left it lower, since demand grows with people and armies whether
output grows or not. A third tuning was tried and reverted:
`growthBase` 0.0002 with `matTechProd` 0.6 added no growth (weighted
output 60.0 to 61.8 by year eight) and stretched the trough after the
wave to four years of eight-to-ten-times prices, because the largest
economies sit at their materials limit early and slide through the
wave whatever the growth base says; the growth base is not the lever.
The pass ended on `growthBase` 0.0001 and `matTechProd` 0.4; the third
pass's census then showed output flat at 46 for three years, because
the visitors' bonus had been carrying the growth all along and the
growth base had been cut in its place, so `growthBase` went back to
0.00025 with the bonus kept small (the census below). What would put growth back into
the boom is the world's slack (`worldBalance0`, the decision reserved
for the design), the supply-destruction loop (`decayInfra`,
`decayTech`), and the output cap (`capBase`); the cycle probe is the
instrument for that session.

### The third pass: hunger at the table, the price of armies

Four changes after the census of the second pass, decided with the
user (section 9 of `world-sim-critique.md`).

- **Hunger at the table.** The decision layer never read hunger: a
  deal was valued at world price plus a flat premium, the money leg
  could never exceed world price (the cargo shrank instead), the
  buyer's money was capped at `dealMoneyShare` of income, and the gap
  traded on was structural. Now a taker of food or water has a *need*,
  `min(dealNeedMax, 1 + dealHunger x famine + dealShortNeed x
  shortfall)` (3, 2, 2: up to three times the world price at full
  famine), keeps half of what the cargo is worth to it above the price
  and pays the other half to the giver as a sweetener
  (`dealPremiumShare`), may spend `dealMoneyShare x need` of its income
  on it, and commits up to `dealSpareTop` (0.9) of what it gives in
  return, or what an exporter of that type would commit, whichever is
  greater. The exporter finds the hungry its best customer; the deal
  record carries the premium (`prem`), which the census counts as need
  deals.
- **Casualties.** `warDeathAtt` 0.00015 and `warDeathDef` 0.0003, three
  times what they were: a hundred-day war costs the attacker 1.5 % of
  its people and the defender 3 %, more for the side losing. The war
  and join candidates now price the dead at `warDeathCost` (40)
  income-days per percent of the people expected to fall over the
  campaign, so the AI grows a little more careful, not timid.
- **The price of a modern army.** One formula, `ECONOMY.upkeepCost`,
  charges the army `upkeepMil x level x people x (1 + upkeepTech x
  technology/100)` (`upkeepTech` 0.5: half again at technology 100,
  where force gets 30 % for free), and the budget reads the same
  formula instead of its own copy.
- **The army as an investment.** `gunsBase` 0.35 (was a literal 0.4)
  and `valueOfMilitary` 0.08 (was 0.1); and the wanted army follows the
  threat: `wantMilBase 20 + wantMilGuns 30 x guns + wantMilThreat 30 x
  threat/100 + authority/4`, where the threat is the worst hostile
  neighbour's edge in force (percent, capped at 100). A typical country
  wants 58 unthreatened and 88 under a superior hostile neighbour,
  where it used to want 71 regardless.

Checks: `hungerDeals` (a food-short country in famine pays a sweetener
and a larger money leg, the giver gains more), `deathsPriced` (a war
candidate is worth less with the row on), `upkeepByTech`,
`threatRaisesWant`. The census reports need deals and countries with
unpaid upkeep.

**What the census shows** (six seeds, three years, against the second
pass's census; the growth base was restored to 0.00025 in the same
run, see below).

| | second pass | third pass |
|---|---|---|
| wars decided a year | 5.0-7.0 | 3.3-6.0 |
| war dead (M, three years) | 10-22 | 13-53 |
| countries in famine at year three | 17-22 | 12-20 |
| military, mean at year three | 59.8 | 50.3 |
| deals with a hunger premium | - | 37-51 |
| countries with upkeep unpaid | - | 0-1 |

- **Hunger reaches the table.** 37 to 51 deals a seed now carry a
  premium, and the famine count falls by a fifth. The worst-placed
  buyer's market bill rises from about half a day's income to as much
  as nine tenths of it: that is the lopsided deal, bought.
- **Wars are fewer and deadlier.** Priced lives cut the war rate by
  about a fifth and raised the dead by roughly double (three times the
  rate over fewer, and sometimes longer, wars). Joins fell with them,
  since an ally now prices its own dead too.
- **The army stops being the default.** The mean military level at
  year three falls from 59.8 to 50.3 and its spread is unchanged, so
  armies did not shrink everywhere: they grew where the threat is.
  Upkeep went unpaid in at most one country a seed, so the dearer
  modern army is affordable.
- **The cost.** Deals running short rose from 1-5 % to 4-6 % of
  records: a country that signs for food at a hunger price sometimes
  cannot settle, and the deal breaks after `dealBreakDays` with the
  usual relations hit. Left as it is, since the famine count is what
  the change was for; the lever if it grows is the money cap.
- **Growth was not where it seemed.** The second pass had left
  `growthBase` at 0.0001 after the visitors' bonus was scaled down, and
  the first census of this pass showed mean output per head flat at
  46.2 for three years: the bonus had been carrying the world's growth
  all along. With `growthBase` back at 0.00025 the mean rises 46.2 to
  48.5 over three years, about 1.6 % a year, which is the slow boom the
  cycle wants.

**What the cycle probe shows** (seed 12345, twenty years, the
configuration this pass ends on). The cycle works, and for the first
time the world gets richer across a whole run:

| year | 1 | 9 | 10 | 15 | 16 | 20 |
|---|---|---|---|---|---|---|
| output per head, by population | 58.9 | 70.7 | 69.5 | 77.7 | 70.0 | 71.5 |
| confidence | 0.21 | 0.70 | 0.41 | 0.67 | 0.14 | 0.42 |
| busts in the year | 0 | 5 | 80 | 5 | 138 | 14 |

Nine years of boom to a materials cover of 1.4 days, then a wave of 80
busts and a crash in year ten; a five-year recovery that peaks *above*
the old peak (77.7 against 70.7), then a larger wave of 138 busts in
year sixteen; recovery again. Weighted output per head rises 58.9 to
71.5 over the twenty years, so the waves cost a peak each, not the
world's progress. Depth is a median 30 % and crashes are 0.10 a year,
both as wanted; famine falls to single figures by the end as the hunger
deals feed the short. Two numbers still miss: the median boom runs 8.4
years against the 10-12 wanted (quartiles 4.6 and 9.3; the world-level
waves came six years apart), and the median bust takes 18 months from
peak to trough rather than twelve, because the instant cut is followed
by the chronic slide of whoever is still short. Both are the world's
slack (`worldBalance0`), which remains the design decision reserved for
the whole economy rather than a row to tune here.

### The fourth pass: the price of a frontier, the return on a war

Two things the user asked for after the third pass: technology should
cost exponentially more energy at the frontier and less at the
bottom, and the war decision should be worth examining.

**The laboratories' energy.** The bill was
`needEnergyTech x technology x population`, linear and scaled by
people but not by the economy, so the share of a country's energy
spent on it came to `technology / (3 x output x eff)`: it depended on
technology *relative to output*, which made it regressive. The
formula was also duplicated verbatim in the economy pass and in the
world's seeder, where the day-0 energy balance is an identity that
only holds while the two agree, and nothing checked it. Now there is
one function, `COUNTRIES.techEnergyOf`, read by both, and the bill is
`needEnergyTech x population x (technology/100) ^ techEnergyCurve`
with `needEnergyTech` **0.15** (reparameterised as the cost per
million at full technology) and `techEnergyCurve` **2**. The frontier
pays half again what it did; technology 50 pays a quarter less; the
bottom pays almost nothing.

| share of energy spent on laboratories | before | after |
|---|---|---|
| technology 0-20 | 17.8 % | 1.6 % |
| technology 40-60 | 35.2 % | 31.1 % |
| technology 80-100 | 28.6 % | 35.0 % |

The curve used to peak in the middle and fall at the top. It now
rises the whole way: Sierra Leone 50.3 to 36.5 %, Malawi 46.3 to
30.6 %, while the United States goes 26.1 to 36.3 % and Germany 27.0
to 33.7 %. Countries with dark laboratories fell from 15-25 a census
to 15-21.

**The laboratories no longer hide a shortage.** The daily pass used to
overwrite the energy balance with the need *minus* the laboratory
bill, so a country could lose up to the whole of that bill — about a
third of its energy, and more at the frontier — and still report a
balance of 1.00 while growth, the shortage bite and the bust trigger
felt nothing. The override is gone. The balance the market pass
computes stands, `techUnpaid` and the `decayTech` decay stay, so the
laboratories still pay first *in addition* rather than instead. A
country cut off from energy now reports 0.10 where it read 1.00. The
frontier importers were the risk and they are fine: Korea still holds
its worst balance at 100 after a year.

**The prize stopped counting the same thing twice.** `prizeOf` added
`relief`, the import bill we would stop paying, on top of `spoils`,
our share of the loser's production. They are the same thing: the
economy pass folds `occupyRes` of the loser's production into the
occupier's supply, which spoils already prices. Relief reached a full
day's income per day of occupation, up to 360 income-days, and nothing
ever paid it. It is gone. What an occupation yields is now one
expression, `occupyYield`, read by the prize that is predicted before
a war and by the occupation that pays it afterwards, so the two
cannot drift apart.

**Victory pays, for as long as the ground is held.** Winning used to
pay less than settling: a negotiated peace granted an indemnity and a
resource lease, while an outright victory gave tribute, a couple of
stability points and a coin-flip occupation. A held country now pays
`occupySkim + occupyIndemnity` (0.5 + **0.2**) of its tax income, and
the terms end the day the occupation does, by the clock or by an
uprising. Measured: 198 a day where the bare skim would be 141, and
nothing the day after it ends.

**Three new motives**, each a named term in the same income-days unit:
*opportunism*, `warOpportunity` 0.5 of the prize against a target
whose stability is under `frailStab` 35, or in famine, or fresh from a
defeat; *pre-emption*, `warPreempt` 0.5 for a hostile neighbour that
is arming, scaled by how much of a rival it is; *revanchism*,
`warRevanche` 0.4 decaying over `warMemoryDays` for a war we lost.
Each war now carries the motive that drove it, which the census tallies
in place of a string test on the reason.

**What the census shows** (six seeds, three years, against the third
pass):

| | third pass | fourth pass |
|---|---|---|
| wars decided a year | 3.3-6.0 | 5.3-7.7 |
| distinct attackers | 5-9 | 9-12 |
| mean prize at stake | - | 49-252 income-days |
| war dead (M) | 13-53 | 24-125 |
| countries with dark laboratories | 15-25 | 15-21 |

Wars are fewer than the flood pre-emption first caused and more varied
than the rivalry re-runs of before: the attacker count nearly doubled.
The mean stake behind a declaration is large because only wars with a
real prize or a real grudge now clear the bar.

**What the motive tally shows, and its limit.** Enmity 10-13 a seed,
prize 3-8, opportunism 0-2, pre-emption 0-1, revanchism 0. The two
quiet motives are not broken: the smoke checks show pre-emption
*creating* a war candidate where none existed and revanchism raising
one from 7 to 424. They rarely win the *label* because the only
countries hostile enough to attack are the deep rivalries, where spite
at relations −100 is worth 90 income-days and drowns everything else.
Revanchism has a second brake: a country that lost is held off by the
truce and then by the `warMemoryDiscount` on its own estimate, so it
must grow substantially stronger before it can try again. Both shape
decisions without being the headline. If they should be visible in
their own right, the lever is `warPreempt` and `warRevanche` against
`valueOfSpite`, and that is a tuning question rather than a mechanism
one.

**A finding left alone.** Two sellers holding a third of world energy
sales and withholding it behind a price floor move the price by about
a percent. The resting price is pinned by days of cover and
`priceRevert` pulls it back, so a cartel of two changes behaviour
(the members hold, the floor survives, nobody breaks ranks) without
moving the market. The smoke check now asserts the behaviour and that
the price does not fall, rather than a lift two sellers cannot
produce.

**What the long runs show.** The ten-year chronicle of seed 12345,
against the same run before the pass:

| | before | after |
|---|---|---|
| wars in the decade | 73 | 61 |
| pairs doing the fighting | 12 | 23 |
| re-runs among them | 58 of 73 | 49 of 61 |
| attacker's output a year on | +0.4 %, 56 % better off | +1.1 %, 62 % better off |

The rivalry re-runs are still the bulk of the fighting, which is by
design (the user kept them), but the war map spread: the number of
pairs that fight nearly doubled while the number of wars fell, and
attacking now pays a little more often than a coin flip.

The twenty-year cycle moved, as expected, because the energy balance
now feeds `minBal` and `minBal` is the cycle's trigger. Freeing the
poor world of a laboratory bill it could not power lowered world
energy demand, so the energy wall moved out and materials became the
only binding one: the boom runs fourteen years to a materials cover of
nothing at year fifteen, breaks in a wave of 114 busts and two
crashes, and recovers. Depth is a median 32 % and the world ends
richer than the third pass left it (weighted output per head 60 to
71.5 at the peak, famine down to 6 countries at the end, the lowest
recorded). The boom now **overshoots** the 10-12 years wanted at 14.6,
where before the pass it undershot at 8.4; bust duration is 16 months
against the 12 wanted and crashes 0.25 a year against 0.2. All three
remain the world's slack (`worldBalance0`), the design decision
reserved for the economy as a whole.

**Baseline energy costs raised.** Freeing the poor world of a
laboratory bill it could not power had lowered world energy demand and
pushed the boom out to 14.6 years, past the 10-12 wanted. The user
asked for the baseline raised across the board, so the three
non-laboratory energy terms went up a third together: `needEnergyOut`
0.003 to **0.004**, `needEnergyMil` 0.0005 to **0.00067**,
`desalEnergy` 0.5 to **0.67**.

Worth knowing why this works, because it is not the obvious reason.
The seeder scales every country's energy endowment to `energyBalance0`
times its own starting need, so raising these coefficients leaves the
day-0 balance at exactly 1.45 and the census at year three barely
moves (energy balance 1.41-1.51, where it was 1.42-1.50). What changes
is the *slope*: potentials are fixed at seeding while demand grows with
output, so a larger output-driven share means demand climbs faster
through a boom.

| twenty years, seed 12345 | before | after |
|---|---|---|
| bust depth | 32 % | 22 % |
| bust duration | 16 months | 8 months |
| crashes a year | 0.25 | 0.15 |
| countries busting at all | 107 (66 %) | 39 (24 %) |
| famine at the end | 6 | 5 |

Three of the four cycle verdicts now pass, where one did before. The
world is calmer: a quarter of countries bust rather than two thirds,
and the materials crunch that used to spike the price to 8.6 with no
cover left now peaks at 2.2 with cover never under three days. The
cost falls partly on the poor, as expected: countries with dark
laboratories went from 15-21 a census to 15-26 and famine from 13-19
to 15-22.

The boom-length verdict reads 7.2 years against 14.6, but the two
numbers do not measure the same thing: it is a median over the
countries that bust at all, and that population fell from two thirds
of the world to a quarter, leaving the fragile short-cycle states
behind. At the world level output climbed from 46.6 to 74.3 over
fifteen years before breaking in a wave of 66 busts and a crash, so
the world's own boom is still about fifteen years. Shortening that
remains the world's slack (`worldBalance0`).

### The world's slack, split and tightened

The cycle's length is governed by how much room the world starts with.
`seedPotentials` scales every country's endowment so the world opens
producing `worldBalance0` times what it needs, and those endowments are
then fixed. Demand grows as the world grows, so the slack is a one-shot
budget and the wall arrives when demand has eaten it: at growth g the
wall is at `ln(slack)/ln(1+g)` years, which is 13.2 years at 1.3 slack
and 2 % growth, 9.2 at 1.2.

Two channels quietly enlarge it. Access to the endowment
(`0.4 + 0.35 infra/100 + 0.35 technology/100`, capped at 1) opened at
0.74 and is a median 0.85 by year three, so the world spends about two
fifths of that growth early and keeps the rest. Technology also
multiplies materials and energy production and cuts demand per unit of
output. Together they are worth roughly a third again on top of the
nominal 30 %, which is why the boom ran fifteen years rather than
thirteen.

**Materials carries its own slack now.** Food and water demand grows
with population only, about 1 % a year, so their 1.3 lasts about
twenty-six years and never binds; materials demand grows with output
times population and binds first every time. Sharing one row meant
tuning the cycle dragged food and water with it, which showed up as
famine. `materialsBalance0` is **1.2** and `worldBalance0` stays 1.3.
Famine is a distribution problem, not a slack one: it is about who can
buy.

| twenty years, seed 12345 | materials 1.3 | materials 1.2 |
|---|---|---|
| world waves | one, at year 16 | **two**, at years 14 and 19 |
| first boom | 15 years | 13 years |
| bust depth | 22 % | 30 % |
| countries busting at all | 39 (24 %) | 98 (61 %) |
| crashes a year | 0.15 | 0.35 |
| peak output per head | 74.3 | 67.4 |

The tighter slack is what makes the cycle *recur*: 1.3 gave one long
boom inside twenty years, 1.2 gives a thirteen-year boom, a wave of 106
busts, a five-year recovery and a second wave. That is the shape the
whole exercise was for. Its cost is that the second peak is lower than
the first (55.8 against 67.4) and the world ends the run no richer than
it started, because the base is fixed and access is partly spent, so
each cycle has less room than the last.

**Discoveries are earned now.** The resource find used to be weighted
only by how poor in resources a country already was. It now carries
four terms: `findTech` (the means to look, the largest), `findGrow`
(a population outgrowing its own slow workforce average, at
`findGrowth`), `findLand` (area on a log scale, so a million square
kilometres counts full and a city state nothing) and `findNeed` (the
old scarcity term). The gain scales with technology too, from half the
old find at technology 0 to half again at 100. The event rate is
untouched, since these weights only decide which kind of event a
country gets; what changed is who gets the discoveries.

Worth stating plainly: at any plausible rate, finds are far too small
to hold the world's base against demand growth. One find adds about a
tenth to one of a country's four endowments, so a few dozen a decade
move the world's total by a fraction of a percent. Gating them makes
them meaningful to the country that earns one, not to the cycle. If the
peaks should rise across cycles rather than fall, the base needs a
continuous channel, and the honest candidates are the access cap and a
slow growth of potential with technology.

**Finds come in sizes now.** The gain used to be two flat tiers. It is
drawn from a long tail instead, `(1/u)^findTail` normalised by its own
median so the ordinary find is exactly what it always was and only the
rare one is new, capped at `findCap` **45** endowment points. About one
in ten is a major discovery at two to three times the usual, and about
one in a hundred is a province-scale strike that can turn an importer
into an exporter. Technology scales the whole range, so the advanced
both find more often and get more out of each one, and the headline
follows the size rather than the event tier.

Implementing it exposed a defect worth recording. The gain was applied
by multiplying the country's existing potential by the ratio of its new
endowment to its old, so a country whose endowment in a type was **zero
got nothing at all**: it struck oil on paper and opened no ground. 99
of the 248 rows start with at least one type at or below 5, so that
silently voided the most dramatic case the event has. A fresh strike is
now priced off the scale of the country's own other endowments.

**The endowment ceiling was raised for discovery.** An endowment was
clamped at 100, which is the scale the table is authored on, so a find
landing on a country already high in that type was thrown away: the
United States at 85 energy could take only 15 points of a 45-point
strike. Since the technology gate sends finds to developed countries,
and those are often already well endowed somewhere, the waste fell
exactly where the finds go. `resMax` is **200**: the authored table
still runs 0-100 and day 0 is untouched, but discovery can build past
it, so a country can become a genuinely large exporter by finding its
way there.

Recorded as considered and declined: the deeper reading of the same
complaint is that the *top* of the scale is conservative. A country at
endowment 100 produces 1.85 of its own need before access, about 1.6
after, where the real Saudi Arabia produces about 2.9 of its domestic
energy use. Steepening how the endowment maps to production would fix
that (curve 2 puts Saudi Arabia on 2.90) but the seeder pins the world
total, so it is a redistribution: Japan would fall to 0.02 of its own
need and Germany to 0.18, both further from life than they are now, and
the poor importers would carry it as famine. The user chose to leave
day 0 as authored.

**The checks that kept flip-flopping were rebuilt.** `motivesFire`,
`occupationPaysTerms` and `findsVary` each used to search the living
world for a suitable subject, so any upstream change shuffled what they
found and they failed in four of six runs for no reason of their own.
They now construct their subject and put the world back: the occupation
check clears every occupation touching its pair so the day's takings
are unambiguous; the find check picks the type with room for a full find
so nothing is measured against the 100 ceiling; and the motive check
opens the war gate by hand on a neighbour between a quarter and four
fifths of the attacker's strength, trying pairs until one yields a
candidate. A superpower has no economic case against a small neighbour,
because the prize is measured against its own income, which is why
picking the strongest attacker was wrong.

### The endowment steepened, and countries that answer a shortage

The declined proposal above was taken up after all. `resCurve` is **1.5**
and `resMax` **200**, so a country at endowment 100 produces 1.85 of its
own need and one that has found its way to 200 produces 5.2. That gives
the world genuine exporters for the first time.

It also breaks the importers, because the seeder pins the world total.
The same energy exists; the curve only moved where it sits, so far more
of it has to travel. Measured at year three across six seeds:

| year three, six seeds | curve 1 | curve 1.5 |
|---|---|---|
| energy price | 0.65-0.79 | **1.76-4.56** |
| countries with dark laboratories | 16-22 | **30-48** |
| countries in debt | 32-45 | **56-73** |

Raising `energyBalance0` to 1.8 erased all three, and that fix was
rejected: handing the world more energy does not teach it to move the
energy it has. The instructive part of the failure is what it exposed.
**No country in the model responded to being short of anything.** Four
places where it should, all of them decisions rather than endowments.

**Shortage pulls investment.** `wants.infra` was `50 + 25 growth` and
never looked at supply, although infrastructure is exactly what raises
access to a country's own endowment and the size of its stores. It now
carries `wantInfraShort` (40) times the worst of its balances, so a
country running at 0.7 wants twelve more points of infrastructure than
one that is fed. This is the loop the model lacked: short, so build, so
produce.

That pushed a want past 100 for the first time on a stat that can
realistically reach it, which exposed a waste the military want had
always risked: the investment candidate asked only whether the want was
above the level, and a stat clamps at 100, so a country at the ceiling
would have paid for points it could not gain. The candidate now skips a
stat already at 100. It does raise world production over the decades, but it is
earned by a country spending its own money, which is the distinction
between this and slack.

**An exporter commits like one.** A seller offered a flat half of its
surplus and ran `2 + 6 infra/100` deals, so a country producing six
times its own need still supplied at most eight partners and kept half
of everything back. `sellShare` scales the commitment with the surplus
over the seller's own use, from `dealSpareShare` 0.5 to `dealSpareTop`
0.9 at three times over, and `partnerSpare` (3) adds up to six more
deals on the same measure. The hungry taker's larger commitment, which
the third pass added, now takes whichever is greater of the two.

**No cliff when broke.** `s.broke` set the market budget to zero, so a
country one unit past its credit limit bought no food, no water and no
energy, and starved of arithmetic rather than of harvests. A solvent
country spends from a stock (`treasury + credit`); an insolvent one
cannot borrow at all but still collects taxes, so it spends
`brokeVitalShare` (0.35) of the day's takings on bread, water and the
lights, and no materials while it is dry. The reserve goes to zero with
it, because a country in debt beyond its credit has no savings to hold
back. Sanctions still close the market completely, which is a different
thing.

The share matters more than it looks, and the first attempt got it
wrong. It was written as three *days* of income, by analogy with the
reserve, but the market budget is spent every day, so three days of
income became a standing subsidy of three times the whole economy.
Measured against it, a country's entire food bill is 12 % of a day's
income for the United States and 33 % for Ethiopia, and food and water
together 23 % to 67 %, so the allowance was four to thirteen times
subsistence and nothing could starve: `famineWorks` lost exactly 0 % of
Ethiopia's population and the overshoot checks found their granary
full. At 0.35 of a day's takings a rich country past its credit still
feeds itself and a poor one covers about half of what it must import,
which is the slope the cliff should have been all along.

Two checks had used that cliff as their lever for creating scarcity,
`famineWorks` and the population-overshoot block, both with the comment
"no money for the market". They now close the allowance for their
window, so each measures one mechanism: that famine kills and drains a
granary, while `brokeStillEats` separately measures that a broke country
buys bread.

**A dear bill provokes efficiency.** `prioritiesOf` weighed science by
temperament and freedom and never by what resources cost, although
technology cuts energy per unit of output by up to 30 %. It now adds
`govScienceBill` (0.6) times the market bill against income, which
lifts both the academia project and the research purchase, and research
is the only route to the efficiency itself.

`energyBalance0` is back to **1.45** and the exchange buffer is
untouched.

**And it does not work.** Six seeds at year three, against the same six
run without any of it and against the slack that was rejected:

| year three, six seeds | nothing | the slack (1.8) | the four changes |
|---|---|---|---|
| energy price | 0.92-2.60 | 0.63-0.72 | **1.01-7.82** |
| countries with dark laboratories | 26-48 | 15-25 | **23-56** |
| countries in debt | 54-73 | 46-51 | **55-80** |
| countries in famine | 19-26 | 21-25 | 19-25 |

The package is level with doing nothing on the median and worse on the
tail. The obvious reading was that the two changes acting immediately
must be the inflationary ones, a country still buying while broke and an
exporter withdrawing supply from the exchange into bilateral deals. An
isolation pass switching off one change at a time, the other three left
on, says otherwise:

| energy price, year three | seed 777 | seed 31337 |
|---|---|---|
| none of the four | 0.95 | 2.44 |
| all four on | 2.55 | 7.82 |
| broke allowance off | 2.55 | 3.21 |
| flat exporters off | 2.48 | 2.55 |
| shortage pull and bill science off | **0.94** | **2.64** |

Read naively that says the two *investment* changes are the cause. It
does not survive a look at how noisy the measure is. The energy price is
not a level in this world, it is a spiking series, and the year-three
snapshot is one sample of it:

| energy price by year, years 1-3 | with the slack | the four changes |
|---|---|---|
| seed 777 | 0.64/0.66/0.64 | 1.30/1.72/2.55 |
| seed 2024 | 0.75/0.80/0.63 | 1.96/**5.90**/1.01 |
| seed 31337 | 0.63/0.91/0.72 | 1.82/4.14/7.82 |
| worst swing within a run | 1.4x | **5.8x** |

**The slack was buying stability, not cheapness.** At 1.8 the price sits
between 0.63 and 0.91 and moves by at most 1.4x across three years. At
1.45 it swings by up to 5.8x within a single run, and seed 2024 goes
1.96, 5.90, 1.01 in consecutive years. The world at 1.45 runs at the edge
of its energy supply, where the clearing price is in a spiking regime,
and a one-day reading of it carries almost no information. The isolation
differences above, 0.94 against 2.55, are smaller than a run's own swing,
so they do not establish which change is responsible.

What the isolation does establish, because these are slow stocks rather
than a spot price, is that **the two investment changes are inert on the
real economy in three years**: technology 61.0 against 61.0, academia
55.1 against 54.8, infrastructure 58.8 against 59.5, and the laboratory
share of energy 0.227 against 0.228. Whatever they do, they do not raise
supply in this window, exactly as predicted when they were planned. The
dark-laboratory counts do point consistently at the exporter change as
the largest single contributor, 28 and 35 with flat exporters against 37
and 56 with everything on, which fits a mechanism where a seller
committing nine tenths of its surplus to fixed bilateral deals leaves
less on the open exchange for whoever is not party to one. That is one
snapshot per configuration and is recorded as a lead, not a conclusion.

**The twenty-year run settles it, and the year-three verdict was an
artefact.** The same seed, twenty years, with the four changes and
without them:

| seed 12345 | y3 | y5 | y7 | y9 | y13 | y17 | y20 |
|---|---|---|---|---|---|---|---|
| energy price, four changes | 3.07 | 3.11 | 2.01 | 1.03 | 1.00 | 1.00 | 0.86 |
| energy price, none of them | 2.23 | 2.58 | 2.68 | 1.04 | 0.92 | 0.77 | 0.67 |
| dark laboratories, four changes | 29 | 36 | **29** | 30 | **28** | **17** | **16** |
| dark laboratories, none of them | 22 | 37 | 35 | 31 | 36 | 31 | 21 |
| mean infrastructure, four changes | 58.9 | 60.8 | 60.9 | 61.1 | 61.0 | 62.2 | 61.5 |
| mean infrastructure, none of them | 59.8 | 61.9 | 61.5 | 61.1 | 60.5 | 59.9 | 59.9 |

**The energy crunch is a start-up transient, and it is there whether or
not any of this is.** It peaks near 3 around years four and five in both
runs and settles to about 1 by year nine in both. The four changes
neither cause it nor cure it. The year-three census samples the rising
edge of that transient, and the gap between configurations at that
instant is smaller than the transient's own amplitude, which is why every
reading of it was misleading. What the rejected slack really bought was
the removal of the transient: at 1.8 the price is flat at 0.63 to 0.91
from the first year.

What the four changes do buy is **fewer dark laboratories from year seven
onward**, consistently: 29 against 35, 28 against 36, 17 against 31, 16
against 21. Countries keep their laboratories lit. The cost is a slightly
deeper collapse after the peak, 41 % against 36 %, on a slightly higher
peak. They are kept on that basis, and because each of them fixes
something that was independently wrong, not because they solved the
energy price, which needs no solving past year nine.

A note on a reading that looked compelling and was wrong. The arithmetic
says behaviour cannot close a gap like this: access to a country's own
endowment runs from `accessBase` 0.4 to 1, so every decision a country
can make multiplies its own production by at most two and a half, while
steepening the curve cut a low-endowment country's production by more
than that. A country sitting on nothing cannot build its way to a gas
field. All of that is true and none of it was the problem, because the
gap closes by itself: demand for energy is mostly demand for the *world's*
energy, the exchange redistributes it, and what the first years look like
is the exchange learning where the energy now is.

The proposal it pointed to is still worth recording, and is no longer
urgent. Energy has no buildable substitute while water does:
`nativeProduction` lets a country manufacture water it does not have,
capped by `desalRate` times infrastructure times technology, limited to
its own gap, and paid for in energy at `desalEnergy`. Energy has no
equivalent, so a country with no field has no path but the market. Giving
energy the same channel, generation built from infrastructure and
technology and paid for in materials, would shorten the transition and
reward the investment a shortage should provoke. It is a new mechanism
and it is not done.

**What the twenty-year runs show instead is a materials cycle far longer
and deeper than the design asks for, and it has nothing to do with this
pass.** Mean output peaks at 61.0 in year 13 and falls to 35.9 by year
20; without any of the four changes it peaks at 59.8 and falls to 38.3.
Materials is the cause in both, running from 0.90 to about 10 by year 17
with world cover at zero for three straight years.

Read at year twenty that looks like a collapse, and the run's own summary
says 46 of 64 booms never regain their prior peak. The monthly series
says otherwise. The trough is at month 224 of 243, and the last eighteen
months are the wall breaking: the materials price falls from 9.8 to 0.63,
cover returns from zero to the full ten days, countries running short
drop from 85 to 29, countries in a bust from 65 to 12, and confidence
climbs for five straight readings from 0.18 to 0.32. The run without the
four changes is a little further along and is plainly rising, 37.7 to
38.2. This is overshoot and correction: demand grows into the wall, the
price spikes, output loses about 40 %, and that lost demand is what
clears the wall. The "never regains its peak" count is mostly the run
ending on the down leg, since countries that do regain a peak take a
median two years.

The real complaint is the *shape*. Booms run a median 5.6 years against
the 10 to 12 wanted; the world's down leg runs from year 13 to year 19;
bust duration is a median 16 months against the 12 wanted; and depth at
36-41 % sits at the top of the 20-40 % target. Booms too short, busts too
long and a touch too deep. That is the next thing worth a pass, and it is
larger than anything the energy price was doing.

### War priced as it is charged

The decision layer and the world had never been made to agree about what
a war costs, and the first thing found on looking was that one of them
charged nothing at all. `warCost` 6 appeared only inside `incomeLine()`,
which is a pure report read by the country panel; every real treasury
movement in the daily pass is written directly and none of them included
it. The docs asserted in five places that it was spent. **War had no
money cost in this model.**

The full bill for a reference country (population 50, output 50 a head,
military, infrastructure and technology 50, so 200 money a day of tax and
one income-day = 200 money), attacker on a land front:

| channel | days of income per day of war |
|---|---|
| `warCost` as charged | **0.000** |
| military attrition, 0.2 points a day at 6.7 income-days a point | 1.35 |
| infrastructure attrition, 0.05 points a day | 0.34 |
| the output blow and the halved growth | 0.17 |
| the dead, at their effect on income | 0.005 |
| **cash and kit** | **1.86** |
| unrest: 0.1 a day of direct bleed and 15 off the stability target | **2.1 to 4.6** |
| projects barred except the army | 0.15 to 0.70 |
| **real total** | **about 4.1** |
| what the decision believed (`warDayCost` 2 plus its 0.9 for the dead) | **2.9** |

So the bundled `warDayCost` was very nearly right for the cash and kit,
1.86 against 2.0, and **blind to the unrest, which is half to two thirds
of the true cost.** A single war took the reference country from 50
stability to about 25, past `warStabMin` 40 and closing on
`collapseFloor` 15, and stability projects are among those barred while
fighting, so none of it could be bought back.

**What changed.** The money cost is charged now, in `daily()` beside the
other movements, at `warCostForce` (0.01) times the force fielded per war,
so it scales with the country twice over: force follows population, so the
burden is the same share of income at any size, and a country with twice
the army pays twice as much to use it. `incomeLine()` reports the amount
actually charged. The war candidate carries three named terms in place of
the bundle, each read off the row the world charges: the money, the kit
worn out priced at what buying a point back actually costs
(`ECONOMY.projectFor`), and the unrest. `warDayCost` is retired. The cost
of defeat is no longer a flat 250 whoever you lose to: `defeatCost` reads
the winner's own `prizeOf` from the other side, converted into our
income-days, plus the scar a defeat leaves through `defeatAuthority`,
which `nudge` writes into the regime's modifiers and nothing ever decays.
Three faults went with it: the occupation skim used to mint money when the
occupied country had less than the rate said, military upkeep did not
cover the levies that `force` already counted, and `warStab` came down
from 15 to 8 with `warAttrStab` from 0.1 to 0.05 so that a country ends a
war shaken rather than half destroyed.

**And the measurement that reframes all of it.** The war ROI probe
(`tools/probes/warroi.js`, read by `tools/warroi.py`) followed 72 wars
across two seeds over eight years on the code as it stood, recording what
each declaration predicted and then what the war returned, in days of the
attacker's income at declaration:

| | predicted | realised |
|---|---|---|
| the prize | 51.0 | 0.0 |
| the campaign | 26.0 | 0.8 |
| days of fighting | 13 | 18 |
| chance of winning | 0.99 | 0.62 |

Only a third of wars paid for themselves and 57 % took no ground at all.
By motive: 35 wars of enmity against weak neighbours won 97 % of the time
for a small profit, while 28 declared for the prize predicted 363
income-days, realised nothing and won 29 %.

**The dominant error is confidence, not the prize.** Countries declare at
a median 8.6 to 1 by their own reckoning, predict a 99 % chance of
winning, and win 62 %, because strength at declaration and the odds a
front resolves on are different things once `defenceBonus` and terrain
apply. For the wars that *are* won the prize is nearly right: 17.0
predicted against 16.1 realised, once the probe was corrected to count the
production taken as well as the money. So the plan's intention to stop
truncating the prize at the horizon was **dropped**: the prize is already
accurate, and `min(occupyDaysBase, H)` is a no-op at the default horizon
anyway. Only the indemnity's truncation, a genuine double-count of the
horizon, was removed.

**With the bill visible, war turns out to be a bad investment, and the
stability rows are not why.** A sweep of the world's war-stability penalty
across five settings:

| `warStab` / `warAttrStab` | the bill, income-days a day | wars a year |
|---|---|---|
| 15 / 0.10 | 22.5 | 0.8 |
| 10 / 0.06 | 15.9 | 0.8 |
| 6 / 0.04 | 11.8 | 0.8 |
| 4 / 0.02 | 8.8 | 0.8 |
| 2 / 0.01 | 6.7 | 1.0 |

Cutting the penalty seven and a half times moves the rate from 0.8 a year
to 1.0. What binds is the **kit**: a war wears 0.2 military points a day
whatever the odds, and at a large country's level each costs about 15
income-days to replace, so an eighteen-day walkover spends 56 income-days
of equipment against a median prize of 51. The six wars a year every
census has shown were the product of a decision that could not see its own
bill.

**The structural fault this pointed at, since fixed:** attrition did not
scale with how hard the fight was. `bleed` takes `warMilAtt` a day
whether the war is 8 to 1 or even, so a walkover against a minnow costs
the same per day as a war against a peer, and only the shorter length of a
lopsided war distinguishes them. That is why even the profitable grudge
wars were priced out. `intensityOf(odds)` now scales the whole bleed, each
front by its own odds, and the war candidate prices it by the same
expression, so what deters is what happens. With `warStab` 5 and
`warAttrStab` 0.03 the rate is 5.8 a year and the bill tells an even fight
(4.3-5.7 income-days a day) from a rout (2.4-2.8).

**And the prediction was never the problem the probe made it look.** The
same probe reported a 99 % predicted chance of winning against 62 %
realised, which is recorded in the critique as a correction: it computed
that prediction itself from a bare force ratio, while `estimateRatio`
already carries the defender dug in, the terrain, the mobilisation the
declaration triggers and every potential ally weighted by `joinChance`.
On the ratio governments actually judge the gap is 17 points, not 37, and
sits almost entirely in one band: at two and a half to five to one, 26
wars predict 0.92 and win 0.62. Above five to one, 26 wars predict 1.00
and win all 26.

### How a war ends: the ladder

Peace used to be one price dictated by the score. `offerPeace` was binary:
the other side took it if ending the war was worth something to it, and
`peaceTerms` then charged the side behind an indemnity of `peaceIndemnity`
times the margin times its income for `peaceTermDays`, plus a lease of its
spare in whatever the winner lacked, with nothing to be done about it on
either side. A white peace existed only when the score was within
`peaceTermsMin` of even at the moment of signing, and could not be asked
for. So "a better offer down the road" could not exist, and a side a
little behind had no exit but paying.

The instrumented ROI study put numbers on how that played: of 76 wars,
43 % ended at the table at a median main-front score of +0.56 after a
median 13 days, 42 % in attacker victory, 13 % in defender victory. The
losing side suing early was the *right* move, not an easy one: a
negotiated loss cost the indemnity, about 55 income-days at a typical
margin, where fighting on to −1 cost the permanent `defeatAuthority`
scar, tribute and a three-in-four occupation. What was too easy was the
winner accepting, because with the war bill honest and the realised
prize for a won war around 16 income-days, taking the indemnity beat
finishing almost every time, from `peaceEarliest` day 10.

**Terms are a ladder now, and a white peace is its first rung.**

| rung | what the side behind gives |
|---|---|
| 0 | nothing: status quo ante, a truce, a `"peace"` record for both |
| 1 | the indemnity |
| 2 | the indemnity and the lease |
| 3 | both, and a one-off tribute of `tributeDays` of its income |

No rung carries `defeatShift` or an occupation; those remain what
fighting on to −1 risks, which is the property that keeps suing rational
and is locked by `suingBeatsDefeat`. `peaceValueAt(iso, war, c, rung)`
prices ending the war on a rung for one side: the remaining campaign's
bill and the chance of defeat saved, against the prize forgone, and the
rung's transfer in that side's own income-days, paid by the side behind
and received by the side ahead. `peaceValue` is rung 1 for any caller
that still wants one number.

**The bargain.** `proposeRung` gives each side the rung best for itself
among those the other will sign, where signing means the other's
`peaceValueAt` is positive there. The side behind climbs from rung 0 and
offers the least it can get away with; the side ahead comes down from
rung 3 and asks the most it can extract. Below `peaceTermsMin` only the
status quo is on the table. The `peace` candidate is scored on the rung
it would actually propose, and does not appear when no rung is mutually
acceptable, since an offer the proposer can see will be refused is a
wasted month. `suePeace` builds the terms for the rung signed; rung 3's
tribute moves at once, shared by `recipients` as a defeat's would be.

On a constructed war at score +0.5, the side behind proposes rung 1 and
the side ahead proposes rung 3, so who moves first now sets the price.
The side behind values ending the war at 400 to 490 income-days on every
rung, because its fear of defeat (467 here) dwarfs any terms; its
bargaining power comes from the order of decision days, which is
recorded as a known asymmetry rather than a fault.

**Deferred by the user:** weariness in the peace calculation, on the view
that wars are costly to continue and the calculus shifts of itself. For
the record, in `peaceValueAt` the cost of continuing is `rem × bill`, and
`rem` shrinks as a war runs while the kit term falls as the army wears
down, so on the present arithmetic the calculus moves toward continuing
as a war goes on. Weariness is the one term that moves the other way,
and it is unwired. `peaceEarliest` 10 and `peaceTermsMin` 0.2 are
untouched until the re-measurement.

**Measured, with the ladder in** (95 wars over the same sixteen seed-years
that gave 76 before; the same probe, reading endings from the log):

| | before the ladder | with the ladder |
|---|---|---|
| wars declared | 76 | 95 |
| settled at the table | 33 (43 %) | 33 (35 %) |
| attacker victories | 32 | 44 (31 with occupation) |
| defender victories | 10 | 17 (16 with occupation) |
| median days | 18 | 18 |
| paid for themselves | 14 % | 18 % |
| net return, median | −8.6 | −8.7 |

Of the 33 peaces, **19 closed on rung 0** at a median main-front score of
+0.57, 10 on rung 1 at +0.67 after 22 days, and 4 on rung 3 at −0.36,
where the *defender* was ahead and took tribute from the attacker. Rung 2
never appears, because a lease needs the loser to hold spare of what the
winner lacks, and it seldom does. So the dominant settlement is a side
more than half way to victory accepting status quo ante, which is the
honest-prize finding made visible: for the side ahead, finishing is not
worth the bill, so when the side behind asks first it gets out for
nothing. Where the prize *is* worth finishing the winner refuses every
rung and the war goes to a decision, which is why the decisive share rose
from 55 % to 64 %.

Two consequences to carry forward. **A cheaper exit makes war cheaper to
start**: 95 declarations against 76, and the extra wars are the marginal
ones, which is why defender victories rose from 10 to 17 and sixteen of
those ended with the attacker occupied. And **wars are no longer**: the
loser's quickest exit got quicker. If longer wars are wanted the ladder
will not provide them; that is the timing rows or the deferred weariness
term. The census is otherwise unchanged by the ladder: 4.0-7.3 wars a
year, prices, debt and dark laboratories within the previous run's bands.

### What you lack, the counter-offer, and cheaper arms

Three changes that follow from how the ladder measured, each a decision
rather than a tuning.

**A target that has what we lack is worth more.** `prizeOf` had computed
`dependency`, the types a target could supply of what we import, and then
discarded it, because the fourth pass removed the relief term that
double-counted the production taken. So a target's spare of what we were
short of was worth exactly its world price. The hunger pass had already
built the right valuation for deals: a country short of food or water
prices a cargo above the world price by its need, up to `dealNeedMax`.
That rule is now `needPriceOf(s, k, c)` in its general form, for all
four types, and `spoilsOf` prices the production taken at the taker's
need price when a taker is given. The prize and the war candidate both
pass one. A lease in `peaceValueAt` is likewise worth its need price to
the receiver and its world price to the payer, which is what makes the
lease rung mean something. `proposeSwap` keeps its own food-and-water
form of the same rule for now; the two agree on those types and differ
only in that deals carry no premium for an energy or materials shortfall,
which is recorded as a seam to close.

**The counter-offer.** Who asked first had set the price: the side behind
proposed the cheapest rung the winner would sign, and the winner, whose
own peace candidate was worth ten or twenty against the loser's hundreds,
never got to propose, so every peace with the attacker ahead closed on
rung 0 or 1. In `offerPeace` the responder now answers with the rung it
would itself have proposed, its best among those the proposer would sign,
and the better of the two for it is signed. The proposer accepts by
construction. One evaluation, no new state, and the order of decision
days no longer decides the terms.

**Cheaper arms, to raise and to wear out.** `milCostFactor` (0.75)
multiplies the military project's cost in `projectFor`. The war bill
prices attrition at what buying a point back costs, so the same row makes
an army cheaper to build and cheaper to sustain in the field, which is
one lever rather than two. The defender was already favoured on the kit,
0.12 points a day of attrition against the attacker's 0.2 plus the supply
line at sea and in the air; the two things that cut the other way, the
defender's dead at twice the rate and its mobilisation on the day of
attack, are left as they are.

**Measured, with the three in** (113 wars on the same sixteen seed-years):

| | the ladder alone | with the need price, the counter-offer and cheaper arms |
|---|---|---|
| wars declared | 95 | 113 |
| settled at the table | 34 % | 37 % |
| closed on rung 0 (status quo) | 19, at a median score of **+0.57** | 11, at **−0.19** |
| closed on rung 1 (indemnity) | 10 | 15 |
| closed on rung 3 (tribute) | 4 | 16, at +0.58 |
| median days | 18 | 20 |
| predicted prize, median | 158 | 171 |
| paid for themselves | 18 % | 20 % |

The counter-offer did what it was for: a white peace is now a near-even
outcome rather than a winner walking away, and a winner ahead takes
tribute. Rung 2 still never appears on its own, and that is structural
rather than a fault: the ladder is cumulative, so a lease rides inside
rung 3 whenever one exists, and rung 2 alone would need a lease with an
empty treasury. The need price lifts the prize by about eight per cent,
which is what a target that has what we lack is worth over its world
price on the current shortages. Cheaper arms raise declarations, as the
sweep said the bill would. Wars still do not pay for most who start
them, which the ROI study will keep saying until the prize is worth the
bill; the census is unchanged by all three.

### The plateau lifts

The twenty-year cycle run that the debt changes were waiting for:

| seed 12345 | y9 | y13 | y15 | y17 | y19 | y20 |
|---|---|---|---|---|---|---|
| output before, debt unpriced | 54.3 | **60.8** | 53.6 | 43.4 | 35.6 | 35.8 |
| output now | 56.3 | 56.0 | 50.7 | **50.4** | **50.4** | 45.1 |
| materials price before | 1.76 | 3.76 | 5.95 | 9.72 | 7.38 | 0.65 |
| materials price now | 1.13 | 4.45 | 8.51 | **1.68** | 1.88 | 7.69 |
| countries in debt before | 61 | 56 | 55 | 55 | 59 | 65 |
| countries in debt now | 58 | 56 | 55 | 59 | 59 | 58 |

Before, the world peaked at 61.0 and settled at 36, 59 % of its peak,
with the materials wall holding cover at zero for four years. Now it
peaks at 62.6 and the trough is 45, 72 % of peak; the wall arrives at
the same time, clears in two years rather than four, and a second one is
beginning as the run ends. Pricing borrowed money into decisions and
resting the credit limit on a remembered income rather than today's
takings is what changed: a country whose output falls no longer has its
limit cut from under it at the moment it most needs the room, so it
keeps paying upkeep and does not spiral. This is the plateau the earlier
runs could not lift, and it is the materials cycle's recurrence that now
sets the shape.

### The cycle's shape: a supply response to price

With the plateau lifted, the shape targets were still missed: per-country
booms a median 6.6 years against the 10-12 wanted, busts 16 months
against 12, crashes 0.25 a year against 0.2. The diagnosis, on the
thirty-year run: **busts are not contagion.** Of 695, 8 % fall inside a
recession window or within three months of a crash. The eight busiest
months all come with world materials cover at or near zero and the price
between 4.6 and 9.3, none with a crash. A country busts when it goes
short of materials, the `!ok` trigger in `grow()`, so its boom is as long
as its own run to the wall and the median is short because the runs are
staggered; its bust lasts as long as the world stays short, which is as
long as cover stays at zero, 35 months in that run. `bustDays` has
nothing to do with it. The two levers are when the wall arrives, which
the slack sets, and what clears it, which until now was only demand
destruction.

**Two supply responses, both behaviour.** An exporter that sees the world
price of a type it has spare of run over base wants more infrastructure,
`wantInfraExport` (10) per unit of excess up to `wantInfraPriceCap` (2),
because access to its endowment is what it can build: a materials wall
pulls the materials exporters first, and a country at access 0.8 reaching
0.9 is a tenth more supply from where the world needs it. And a find's
type is no longer drawn uniformly: prospectors look for what is dear, so
the draw is weighted `1 + findPrice (1) × excess up to findPriceCap (2)`,
which at a materials price of five makes half of all finds materials
instead of a quarter. It is still one draw from the day's stream, so
every other seeded event falls where it did.

A wrong turn on the way, recorded: `findNeed` was raised and reverted. It
reads as a scarcity weight and is not; it weights a find by the finding
country's own poverty of endowment, so raising it sends finds to poorly
endowed countries, not to the type the world is short of.

**Measured** (seed 12345, twenty years, against the run before the two
responses):

| | before | with the supply responses | target |
|---|---|---|---|
| boom length, median | 6.6 years | **9.2** | 10-12 |
| bust duration, median | 16 months | **12** | <= 12 |
| bust depth, median | 30 % | 29 % | 20-40 % |
| crashes a year | 0.25 | **0.10** | <= 0.2 |
| months with world cover at zero | 8 | **1** | |
| materials price, peak | 8.51 | 4.07 | |
| busts in all | 417 | 341 | |
| median maximum drawdown | 52 % | 44 % | |
| end of run, share of peak | 72 % | **86 %** | |

The wall barely forms. Exporters build toward it as the price rises and
finds land where the world is short, so the shortage that used to hold
cover at zero for eight months and output down for four years now
clears within a year of starting. Three of the four shape verdicts are
met; boom length at 9.2 is the remaining miss, and it sits where the
slack puts it. The responses are behaviour, not slack: `worldBalance0`,
`materialsBalance0` and `energyBalance0` are untouched.

### A programme for every administration

Stage 1 gave every new government a programme: `powerDraw` (2) powers
drawn without replacement from a pool of twenty-five, each weighted by a
base, a multiplier for the regime type and one for the region, so that
nothing is impossible for any government and some combinations are
merely rare. The draw happens in `install`, the programme is named in the
announcement, and it falls with the government. Stage 2 is what enacting
one does.

**Three classes, as the table marks them.** A `work` power is a shaped
project: the ordinary project for its first stat with gain, cost and days
scaled by the power's own factors, raising **every stat it names**, which
is how the five-year plan makes technology investable and how public works
raise order with the roads. The project tick raises the list rather than
one stat, and when a power's project ends `powerFinished` records it
done and frees the slot. A `mod` power is the same project with no stats;
once done it holds its multipliers for the government's life through
`GOV.powerMul(s, row)`, the product over finished powers, read at ten
coefficient sites: the find's weight and size, food and water production
and the drought's bite, energy and materials per unit of output, the
military project's cost, the partner cap, the growth ceiling, the tax
rate and the size of the stores. Two rows are levels rather than
coefficients and go through `powerAdd`: an opening of the markets shifts
the effective `econOpen`, and a conservation law or a great work adds
`legitStand` to the legitimacy target. An `act` power fires at once for a
lump of `enactDays` (10) of income and then rests for `enactCooldown`
(730 days): stability, legitimacy, infrastructure and military move by
their deltas, authority and freedom through the regime's modifiers, the
treasury by days of income, a referendum pulls the modifiers that fraction
of the way back to the nation's base, a purge of the officer corps sets
`coupProofUntil`, which both coup paths respect, and a dynastic marriage
raises relations with the nearest hereditary neighbour. Martial law needs
a street to clear: stability under `strongmanStab`.

**A gap in stage 1, found by the checks.** The draw happened only in
`install`, which runs when a government is replaced; the seeded
governments at `initStats` and any filled in by `ensure` held no
programme, so for the first years most of the world had none. At day 775
of the check's run, 194 living regimes and a share of them empty.
`ensurePowers(iso, s)` now draws one the first time a government is asked
to decide, keyed on the seed and the country through `unit`, so the same
world always draws the same programme and a save from before programmes
existed fills in on load.

**One at a time.** `regime.enacting` holds the key of the work or mod
under way; a second cannot start until it ends; a finished one is not run
again by the same government; an act waits out its cooldown. `canEnact`
answers all of that in one place and the candidate, the execution and the
display all ask it.

**Priced in the decision's unit.** The `enact` candidate, monthly at
peace, scores a work power as the investment it is, the invest formula
over every stat it names with technology's gap taken as half its
distance to 100 since it has no wanted level; an act by what it does, a
month of each stat delta at its `pointWorth`, treasury days as
themselves, legitimacy at `valueOfLegit` (0.1 a point a day), a
referendum by the misfit it closes, a purge or a marriage at a flat
`valueOfMod`, less the lump; and a mod at `valueOfMod` (20) a day over the
horizon less its project. The flat worth of a standing programme is a
guess and is written down as one: the action-ROI study is what would
price each row. Legitimacy had never carried a price in the decision
layer until now, though a third of the pool trades in it.

**Shown, saved, counted.** The government row on the country panel lists
the programme with each power ready, under way, done or resting. The
state rides inside `regime`, which was already saved, and a power's
project is an ordinary project with two extra fields. The census tallies
what living governments hold and have done.

**Measured, the world with programmes against the world without** (six
seeds, year three): nothing in the economy moved. Wars 3.3-6.7 a year
against 4.3-7.3, dark laboratories 25-37 against 26-35, countries in
debt 56-63 against 55-60, energy 0.98-2.41 against 0.95-2.49, materials
0.77-1.27 against 0.89-1.41, live deals 332-374 against 344-364,
technology 61.7 against 61.9 at year three. Legitimacy is the one thing
that moved, up a point or two on every seed, 70.7-74.1 against 69.7-71.9:
a third of the pool trades in it, and the programmes are the first thing
in the decision layer that has ever bought it on purpose. The tally of
which powers governments hold and finish follows in the census that
carries it.

**The programmes, tallied** (six seeds, year three, 2,328 holdings among
the living governments, two each):

| power | share held | finished |
|---|---|---|
| a public health drive | 7.0 % | 76 |
| a schools programme | 6.1 % | 96 |
| an opening of the markets | 5.9 % | 110 |
| a reforestation programme | 5.8 % | 108 |
| an anti-corruption drive | 5.8 % | an act |
| a clean grid | 5.6 % | 117 |
| a conservation law | 5.3 % | 108 |
| a referendum | 5.3 % | an act |
| an austerity budget | 5.2 % | an act |
| settlement of the frontier | 4.6 % | 70 |
| great water works | 4.5 % | 61 |
| … | | |
| a five-year plan | 2.8 % | 54 |
| martial law | 2.8 % | an act |
| royal patronage | 1.5 % | 25 |
| a dynastic marriage | 0.6 % | an act |

The distribution is the table's weights made flesh: the works any
government might undertake lead, the ones tied to a type and a region
trail, and nothing is absent. 1,189 works and standing measures were
finished in eighteen seed-years and acts fire on the first decision after
they are drawn and again after their cooldown, which comes to about 350
enactments a seed a year. That volume exposed one cost: `taxIncome` is
the hottest path in the economy, called from every spending check in
every loop, and it consulted the programme on every call; with every
government holding one the day tick slowed several-fold, enough to run
the interface probe out of its hold. It now reads a per-day memo,
`s.taxMul`, set once in the daily pass and refreshed the day a programme
lands, and gives the same number.
