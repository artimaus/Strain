# The nations: the pillars of the map side

This document describes the pillars as they are built, one section
per pillar, in the template the other references use: what it does,
what it touches, defaults and levers, assumptions built in. The design
they are built from is `design.md`; the phases are in `plan.md`. A
pillar that is not built yet has a placeholder here saying so.

A pillar is a module that runs part of a nation's day. Every pillar
registers once with the world (`WORLD.registerPillar` in
`js/world.js`), is run in the published order each day with its own
random stream, writes what it did to the nation's ledger, and offers
the card its rows, the config panel its levers, and the census its
numbers. The ledger is the one place a nation's state is explained: a
number on the card is a ledger line or a sum of them.

How to read a card. The fixed rows (population, status, variant,
links, borders) describe what the country is. Below them, one fold-out
per pillar shows that pillar's lines for the current day: what was
captured, eaten, paid, built, born, died, left, and the reason behind
each decision. Which fold-outs are open is remembered across countries
and sessions. While the card is open it follows the day.

## 0. Foundations

Owner: `js/world.js` (the registry, the ledger, the streams, the
census hooks), `js/shell.js` (the config groups), `js/worldui.js` (the
card sections), `tools/probes/census.js` and `tools/census.py`.

### What it does

**The registry.** `WORLD.ORDER` is the slot list: weather, economy,
trade, health, relations, war. A pillar is an object with a `name`
from that list and any of the hooks `fields`, `seed`, `dailyWorld`,
`daily`, `rows`, `census`, `censusWorld` and `config`. Registering adds
its `fields` to the country pack table and seeds the states that
already exist. An empty slot is skipped. Pillar scripts load after
`js/links.js` and before `js/shell.js`.

**The day.** `dayTick()` increments the day, discards yesterday's
ledgers, and for each slot in order draws a fresh stream and runs the
pillar's `dailyWorld(rng, worldLedger)` once, then `daily(iso, rng,
ledger)` for every nation. Then the ledgers close into the history and
`entity:day` is dispatched.

**The ledger.** One per nation and one for the world, created on first
touch each day. `add(pillar, key, label, value, unit, reason)` appends
a line and sums it under its key; `get(key)` reads the day's sum;
`of(pillar)` lists a pillar's lines. Keys are strings a pillar chooses,
by convention `pillar.name` (`economy.income`).

**The history.** When the ledgers close, every key a nation has ever
written gets its day's sum (zero if unwritten) pushed into a ring of
`HISTORY_DAYS` = 90 daily values. `history(iso, key, n)` returns the
last n, oldest first; `""` is the world. The history is in memory only;
a loaded game starts with it empty.

**Random streams.** `dayRng(slot)` is a `mulberry32` seeded from the
world seed, the day and the slot, so every pillar's draws repeat for a
seed and adding a pillar does not change another's. `seedRng(iso)` is
the same from the seed and the country code, for seeding a state.

**Census.** `censusOf(iso)` returns `{ iso, name, pop, covered }` merged
with every pillar's `census(iso, state, ledger)`; `censusWorld()`
returns the day, seed, nation count, population and covered count
merged with every pillar's `censusWorld(worldLedger)`. The probe
`tools/probes/census.js` makes a world on a seed, advances N days and
returns both; `tools/census.py` runs it over six seeds and prints the
cross-seed summary then a table per seed.

**Config groups.** A pillar's `config.defaults` join `ENTITY_CONFIG`
when `js/shell.js` loads (and again whenever the panel is built), and
its `config.rows` are one group of the config panel under its label.

**Card sections.** The country card shows one fold-out per pillar that
offers `rows(iso, ledger)`, in slot order, each row a label, a value
and an optional note. Open state is kept in `localStorage` under
`entity_card_open`. The card re-renders on `entity:day` at most once a
second while open.

**Save.** Pillar fields are rows of the country pack table and travel
in the save like the outbreak fields. The save is version 9; a version
8 save loads with the pillar fields at their defaults.

### What it touches

`js/world.js` reads `window.C` (`mulberry32`), `window.DATA`,
`window.GEO`, `window.LINKS`, `window.ENTITY_CLOCK` and
`window.ENTITY_CONFIG`. `js/shell.js` reads `WORLD.pillarList`.
`js/worldui.js` reads `WORLD.pillarList` and `WORLD.ledgerOf`.
`js/progression.js` packs and unpacks through the tables. The smoke
test (`foundations` in `tools/smoke.py`) registers two test pillars,
checks the order, the ledger, the history, the streams, the card
section and the save, and removes them.

### Defaults and levers

| Constant | Value | Meaning |
|---|---|---|
| `ORDER` | weather, economy, trade, health, relations, war | the slots and their order (`design.md` §8) |
| `HISTORY_DAYS` | 90 | daily sums kept per key |
| card refresh | 1 s | least time between re-renders while open |
| save version | 9 | |

No config rows. The foundations have no levers of their own.

### Assumptions built in

- A pillar runs for every nation every day; there is no cadence other
  than daily, and no nation is skipped.
- The order is fixed by name; two pillars cannot share a slot.
- A ledger line is a number; text belongs in its label and reason.
- The history is per key and per nation and is not saved.
- Seeding a state is deterministic in the seed and the code, so two
  nations with the same row and different codes differ by their noise.

## 1. Economy

Owner: `js/economy.js`. Design: `design.md` §4, with the round's
decisions in §4.7. Built in phase 1, October 2026.

### What it does

**State** (the rows it adds to the country pack table): `pop` (M),
`infra`, `econ`, `acad` (units), `tech` (level), `treasury`,
`stores[3]` and `ceil[3]` (food, energy, materials, in units),
`rain` (factor), `shares` (infra, econ, research, keep, explore),
`unpaidEcon` and `unpaidTech` (days), `rule` and `reason` (the budget
rule that last fired). Runtime readouts that are not saved: the idle
count, the famine share, the share of upkeep paid, the three strains,
today's income, housing.

**Seeding** (`seed`): from the data row, with ±5% seeded noise on the
four development numbers. Units at level 100 per million people:
infrastructure 0.2 (floor 40% of that at level 0), economy 0.7 (floor
20%), academia 0.25 (floor 10%), so `infra = (0.4 + 0.6 × level/100)
× 0.2 × pop` and likewise. The treasury starts at 30 days of the
spending cap, the stores at 15 days of use, the shares at 30/30/20/10/10.

**Ceilings** (`calibrate`, once the map's areas are known, and again
for any state still at zero): food by population, `endowment/100 ×
pop`; energy and materials by `endowment/100 × area^0.25`; each
resource scaled so the world's ceilings sum to 1.5 times the world's
starting need. Ceilings are saved, so a loaded game keeps what
exploration raised.

**The day** (`daily`), in order, every line on the ledger under
`economy.*`:

1. *Weather.* Rainfall takes a step of up to the zone's swing over 90
   days (arid, desert and monsoon 0.5; tropical 0.4; mediterranean
   0.35; temperate and boreal 0.25; else 0.3), bounded to 1 ± swing.
   Food is multiplied by `exp(−((rain − 1) / 0.5)²)`.
2. *Needs.* Food = population. Economy upkeep = `econUpkeepEnergy` and
   `econUpkeepMaterials` per unit, each × (1 − 0.5 × tech/100).
   Technology upkeep = `techUpkeepEnergy × tech × pop / 100` energy.
3. *Labour, needs first.* Infrastructure slots fill for the base food
   need (less what the idle grow for themselves, 0.6 per million idle),
   then energy (the upkeeps plus the capture's own energy), then
   materials (upkeep plus today's building), then a 10% food margin;
   then the economy's slots, then academia's; the rest are idle. The
   workers a target needs come from inverting the capture curve, but a
   nation works a reserve only up to three times its ceiling and leaves
   the rest of the need to the market, so a nation with a reserve of
   nothing does not send everyone to dig for it.
4. *Capture.* `capturePerWorker × (1 + tech/100)` per million
   workers; against each ceiling `captured = ceil × ln(1 + effort /
   ceil)`; food × the rain factor; energy spent `captureEnergy × (1 −
   0.5 × tech/100)` per unit captured. Strain = effort / ceiling.
5. *People eat.* From the harvest, the idle's subsistence and the
   store. The unmet share is famine.
6. *Upkeep.* Energy pays the capture, then technology, then the
   economy; materials pay the economy. The paid share of the economy's
   upkeep is the share of it that works. After 30 unpaid days the
   economy loses 0.2% of its units a day times the unpaid share;
   technology unpowered for 30 days loses 0.2% a day.
7. *Money.* `moneyPerWorker × economy workers × paid share × (1 +
   tech/100)`, all of it income.
8. *Budget.* A nation that went short today (famine, or upkeep under
   98% paid) first keeps a month of what its shortfall would cost at
   the world price, and builds nothing it cannot power: only
   exploration goes on. Otherwise spend = min(treasury,
   `budgetCapPerUnit × econ`). Shares:
   infrastructure at 35,000 money and 350 materials a unit; economy at
   26,000 a unit; research up to 20 money per million researchers a
   day; exploration spent only when a resource is past its ceiling,
   raising that ceiling by 0.0001 units per money; keep stays. Research
   adds `researchRate × (researchers / pop) × funded share / (1 + tech
   / techSlow)` to technology. Technology's multipliers clamp at 100.
9. *Stores.* Each store holds at most `storePerUnit × infra`; the
   excess is wasted (phase 2 sells it).
10. *People.* Births at 0.00006 × min(1, surplus / 10%) × pop when
    there is housing (`housingPerUnit × infra`); famine deaths at 0.001
    × famine × pop; 0.00005 of the idle and the unhoused leave (counted,
    not yet moved).
11. *The budget rule.* The first rule that fires names a share and a
    reason; one `shareStep` moves to it from the largest other share
    above its floor (infra and econ 10%, the rest 5%): short of a
    resource whose strain is past 1.5 → explore ("food past its
    ceiling"); short otherwise → infra ("short of energy"); people above
    housing → infra ("no room"); idle above 10% → econ ("idle hands");
    treasury under 30 days of the cap → keep ("thin reserve"); else the
    smaller of infra and econ ("nothing pressing: build").

**The card** (`rows`): people (population, housed, idle; born, died,
left), labour, units (with today's building), one row per resource
(ceiling, captured, stored; eaten or used; strain when past 1), money
(income, spent, held; the cap), budget (the five shares; the reason),
technology (level, today's gain; unpowered days), and when they apply
famine and an unpaid economy, then rain.

**Layers** (`layers`, joined to the map's stat views with a legend
button each): Econ (income per head, 0 to 20), Tech (0 to 100), Strain
(the worst resource's effort over its ceiling, 0 to 3×; "no reserve"
when a nation has none of a resource it tries to capture).

**Wire** (transitions only): famine begins (large for a nation of 50 M
or more) and ends; the economy stops for want of energy or materials,
works again, and begins to decay after a month; technology goes
unpowered; the budget turns (the rule that fired, when it changes).

**Census** (`census`, `censusWorld`): per nation population, idle %,
technology, treasury, the three strains, and the flags famine and
short (less than 98% of upkeep paid); per world the count of nations
in famine and short, the idle share, total income and the
population-weighted mean technology.

### What it touches

Reads `window.DATA.rowOf` (the row), `WORLD.worldMap` (areas for the
calibration), `WORLD.COUNTRY_STATE`, `WORLD.seed`, `WORLD.nameOf`,
`WORLD.log` and `ENTITY_CONFIG` (its own group). Writes only its own
fields on the state and its lines on the ledger. Registers at load
with `WORLD.registerPillar` and publishes `window.ECONOMY` (the pillar
plus `K`, `LEVERS`, `calibrate`, `needs`).

### Defaults and levers

Config rows, group "Economy":

| Lever | Default | Meaning |
|---|---|---|
| `infraSlots` | 3 | M workers a unit of infrastructure holds |
| `econSlots` | 1 | M workers a unit of economy holds |
| `acadSlots` | 0.05 | M workers a unit of academia holds |
| `storePerUnit` | 30 | units of each resource a unit of infrastructure stores |
| `housingPerUnit` | 6 | M people a unit of infrastructure houses |
| `capturePerWorker` | 6 | units a day per million workers, at technology 0 |
| `captureEnergy` | 0.2 | energy per unit captured, at technology 0 |
| `moneyPerWorker` | 10 | money a day per million economy workers, at technology 0 |
| `econUpkeepEnergy` | 0.5 | energy a day per unit of economy, at technology 0 |
| `econUpkeepMaterials` | 0.4 | materials a day per unit of economy, at technology 0 |
| `techUpkeepEnergy` | 0.1 | energy a day per point of technology per 100 M people |
| `techSlow` | 25 | the level at which research is halved |
| `researchRate` | 1 | technology a day per unit of researcher intensity, before slowing |
| `budgetCapPerUnit` | 15 | money a day a unit of economy can put to work |
| `shareStep` | 0.01 | how far a budget share moves in a day |

Fixed in `K`: the four technology multipliers (1, 0.5, 1, 0.5 at
level 100), the build costs (35,000 + 350 materials; 26,000), the
research cost (20 per million researchers), famine deaths (0.001),
births (0.00006), the food margin (10%), the unpaid grace (30 days)
and decay (0.2%), the rain width (0.5), subsistence (0.6), the leave
rate (0.00005), the exploration yield (0.0001), the world slack (1.5),
the area exponent (0.25), the starting treasury (30 days) and stores
(15 days), the seed noise (5%), the seeding floors and slopes, the
starting shares and their floors.

### Assumptions built in

- A ceiling is a soft limit: effort past it still captures, at the
  logarithm's pace; nothing is ever used up.
- All of a nation's people work or are idle; there are no children,
  no retired, no part-time.
- Energy pays for capture before anything else, so a nation short of
  energy still eats; technology is paid before the economy, so a
  blackout dims the economy before it dims the laboratories.
- The idle grow their own food at a fixed rate whatever the land; a
  city state's idle grow as much as a farmer's.
- The budget rule is a priority list; it never weighs two needs
  against each other.
- Emigration is counted and nobody moves until trade carries people.
- Technology stalls once the economy can absorb everyone, because
  academia fills last; later pillars' resource and budget sinks are
  meant to keep the economy in check (`design.md` §4.7).

## 2. Trade

Owner: `js/trade.js`. Design: `design.md` §5.1 as decided. Built in
phase 2, October 2026.

### What it does

Runs once over the whole world each day, after every nation's economy
(`dailyWorld`). Its state: on each nation `deals` (the deals it buys
under: seller, resource, amount a day, price, end day, days short) and
`buying` (its running spot purchases per seller and resource: days in
a row, units); on the world `prices[3]`.

1. **Export capture.** The resource that pays best per unit of effort
   is `price / (1 + strain)` less the energy it costs at the energy
   price, when that beats `exportMargin`, among the resources a linked
   nation asked for and did not get yesterday: the market is local, so
   a nation exports to the asks it can reach. Two kinds of worker capture
   it: the idle, in whatever infrastructure slots the economy's
   needs-first labour left spare; and the economy workers the nation
   has moved to export (`exportWorkers`, which the economy reserves
   before filling its own slots). Each day, while a unit of effort at
   the world price earns more than 1.1 times what a worker makes in the
   economy, up to `exportShift` of the economy's workers move to
   export; below 0.9 times, they move back. The capture uses the
   economy's curve against the ceiling (strain rises), spends energy
   from the store (less capture if the store cannot pay), and goes into
   the store. A nation in famine exports nothing and moves its
   exporters back; an unpaid economy is not a bar, since export is
   then the way to earn, and the energy left in store is the limit.
   A nation that is unpaid and holds less than its month's bill is
   *broke*: it sells its stores of whatever it is not short of down to
   three days of use, half the excess a day, to pay for what it lacks.
2. **Asks and offers.** The ask per resource is today's shortfall from
   the economy's ledger (the famine share of the food need; the unpaid
   part of the energy and materials upkeep) plus a gentle restock: the
   gap between the store and its comfort, over `restockDays`. The
   comfort is `comfortDays / price` days of the nation's own use, so a
   dear resource is sold from deeper in the store. The offer is
   `storeSellShare` (10%) of whatever the store holds above its
   comfort. A nation with no reserve of a resource at all keeps a small
   standing ask for it.
3. **Deals first.** Each deal delivers its amount from the seller's
   offer to the buyer at the deal's price, within the edge's remaining
   capacity, both nations' trade capacity (`tradePerUnit` × economy
   units a day, bought and sold together) and the buyer's treasury. A
   delivery under 90% counts a short day; `dealLapseDays` short days in
   a row end the deal; so does its term.
4. **The spot market.** Resource by resource, seller by seller: the
   seller's offer is split among the linked nations that still ask, in
   proportion to their asks, each transfer bounded as above, at the
   world price, money from the buyer's treasury to the seller's.
5. **Deals form.** A nation that bought from the same seller
   `dealAfterDays` days in a row, averaging at least `dealMinUnits` a
   day, signs for that average at today's price for `dealTerm` days.
   One deal per pair and resource.
6. **The price.** `price ×= 1 + priceElasticity × (asks − offers) /
   (asks + offers)` over the world's totals before trading, bounded by
   the floor and the ceiling. A price that doubles within 30 days is a
   world headline.
7. **People.** Each nation's leavers for the day (from the economy's
   ledger) go along its edges to nations with room, in proportion to
   the room (free slots or housing, whichever is less), at most
   `migPerCap × capacity` per edge; whoever finds no room stays.

**The card** (`rows`): the three world prices; per resource bought,
sold, captured for export, and what was asked and not found; money
paid and earned; the import share of what the nation uses and the
exporters at work; each deal with its partner, amount, price and days
left; people arrived, left, or kept. **Layer** Trade: importers warm,
exporters cool, self-sufficient between. **Wire**: deals signed, run
out and lapsed; a nation that comes to live on imports (half of its
use); a price that doubles in a month. **Census**: per nation the
import share, exports a day, deals held and the flag `importsHalf`;
per world the three prices, units traded, deals in force and people
who moved.

### What it touches

Reads the economy's ledger lines for the day (`economy.workInfra`,
`idle`, `famine`, `upkeep.*`, `captureEnergy`, `housing`, `left`,
`workEcon`, `workAcad`) and its helpers (`ECONOMY.needs`, `slotsOf`,
`cpw`, `captureEnergyPer`, `capture`); `LINKS.edges`, `byIso`,
`partners`, `edgesOf`; `WORLD.history` for the price spike. Writes
stores, treasuries, population and the strain readout on nation
states, `prices` on the world, and its own lines. The economy reads
`_exportWorkers` back the next day so exporters do not count as idle
hands, and holds its budget on a day it went short so the money is
there for the market.

### Defaults and levers

Config rows, group "Trade":

| Lever | Default | Meaning |
|---|---|---|
| `priceElasticity` | 0.05 | the price's daily move per unit of imbalance |
| `priceFloor` | 0.1 | lowest price |
| `priceCeiling` | 10 | highest price |
| `tradePerUnit` | 2 | units a day a unit of economy can trade, bought and sold together |
| `comfortDays` | 15 | days of use kept in store at price 1 |
| `restockDays` | 30 | a store below its comfort is rebuilt over this many days |
| `exportMargin` | 0.2 | least price per unit of effort worth capturing for export |
| `dealAfterDays` | 30 | days of buying from one seller before a deal |
| `dealMinUnits` | 0.5 | least average a day for a deal |
| `dealTerm` | 365 | a deal's term |
| `dealLapseDays` | 30 | undelivered days before a deal lapses |
| `migPerCap` | 0.0005 | M people a day an edge carries per unit of capacity |

Fixed in `K`: the starting price (1), the comfort's price exponent
(1), the share of the excess store offered a day (10%; 50% when
broke, down to 3 days), the spike test (a doubling within 30 days),
the import share that counts as living on imports (50%), the least
deal as a share of use (2%).

### Assumptions built in

- One world price per resource; distance costs nothing beyond what the
  links' capacities allow.
- Goods bought today are in the store tomorrow; a day's famine is
  never cured the same day.
- Nothing is lent: a nation without money does not buy, whatever it
  needs.
- A seller never refuses a buyer; relations (phase 5) will give it
  reasons to.
- Capacity is shared between goods and people only in that people use
  their own small multiple of it.
- Deals are never renegotiated; a deal's price can be far from the
  world's by its end.

## 3. Health and the outbreak

Not built. Phase 3; its questions are `design.md` §5.2.

## 4. Pressure on the player

Not built. Phase 4; its questions are `design.md` §5.3.

## 5. Relations and alliances

Not built. Phase 5; its questions are `design.md` §5.4.

## 6. War and the military

Not built. Phase 6; its questions are `design.md` §5.5.
