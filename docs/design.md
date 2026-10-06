# The redesign of the map side

This document is the design for what replaces the nation simulation
that was removed in October 2026. It records what has been decided,
in enough detail to build from, and lists what has not, with the
questions each later session has to answer. `plan.md` turns it into
phases. The reference documents (`bench.md`, `map.md`, `player.md`)
describe what exists today and are updated as phases land.

Decisions here were taken in a question-and-answer session on 3 to 5
October 2026. Where a choice was made, the alternatives considered are
not repeated; where a choice is open, the alternatives are listed.

## 1. What the map is for

The map is where a variant from the bench meets the world. The loop is:

1. **Spread and survive the response.** A deployed variant spreads
   between countries along the links and within a country among its
   people. Countries notice it and respond; a response can clear a
   country. The score is coverage held over time.
2. **Nations with lives of their own.** Every nation has an economy,
   technology, resources and infrastructure, and takes actions from
   its situation: trade deals, alliances, and wars with other nations.
   The outbreak lands on a world that is already busy.
3. **Pressure on the player.** What happens on the map comes back as
   scrutiny. A detected outbreak traced to a deployment raises the
   player's heat; the map can end the game.

Nations are **not** a separate game. They exist so the world the
variant spreads through is uneven, reactive and legible: rich nations
detect sooner and respond harder, poor ones are porous, allies share
what they learn, a war opens a border and closes a hospital.

## 2. Principles

These were the failure points of the old version and are the rules of
the new one.

1. **Every number has a ledger.** A country's state changes only through
   lines a player can read on its card: captured, eaten, paid, built,
   born, died, left. If a change has no line, it does not happen.
2. **No targets.** Nothing drifts toward a resting value. State moves
   because an input moved it. Where a level settles, it settles because
   an inflow equals an outflow, and both are on the card.
3. **Every decision has a reason.** A rule that moves a budget share, a
   labour count, a deal or a border writes a one-line reason the card
   and the wire show.
4. **Few levers.** Each pillar has a target of about fifteen config
   keys (section 9). Going past it takes a note in this document
   saying why.
5. **One daily tick, one published order.** `world.js` runs the pillars
   in a fixed order each day (section 8). A pillar reads what earlier
   pillars wrote that day and nothing from later ones.
6. **Deterministic per seed.** Every random draw of a day comes from one
   stream seeded from the world seed and the day, so a census is
   repeatable and a bug is reproducible.
7. **A probe from day one.** Each pillar ships with a smoke flag and a
   census line before it is tuned.
8. **Concrete units.** Everything is in absolute units a reader can
   picture (section 3). A 0..100 index may sit beside a number for
   comparison, never instead of it.

## 3. Units

| Quantity | Unit | Reading |
|---|---|---|
| population | millions of people (M) | France is 68 |
| size | km² from the map polygons | France is about 550,000 |
| food, energy, materials | units per day; one unit of food feeds one million people for a day | France eats 68 food a day |
| money | units per day, or a stock of them in the treasury | |
| infrastructure, economy, academia | units; each unit has a number of labour slots in millions | |
| technology | a level from 0 up, shown to one decimal; climbs ever more slowly | |
| rainfall | a factor with 1 at a country's optimum | |

The scale of energy and materials units is set by the constants that
relate them to food and money: how much energy a unit of capture costs,
how much a unit of economy consumes a day. They are chosen so that the
starting numbers for a mid-sized nation read in the tens to hundreds.

## 4. The nation

### 4.1 State

```
people        population P (M); idle count; housing
water         rainfall r (factor; 1 is this country's optimum)
reserves      ceiling per resource: energy, materials, food (units/day);
              raised slowly by exploration
development   infrastructure I, economy E, academia A (units)
technology    T (level); unpaid-energy days
treasury      money; spending cap and debt cap from E
stores        one per resource (units), capped by I
budget        four shares: build I, build E, research, keep; each with
              its reason
labour        workers in I, E, A (M), idle (M)
exploration   progress per reserve
```

The data rows (`js/data.js`) seed `P`, the three reserve endowments,
the urban share, the climate zone (which sets the rainfall optimum and
swing) and the starting levels of infrastructure, economy, academia and
technology. The other row columns (military, medical, stability,
freedom, authority, openness, government type) are inputs to later
pillars or unused.

### 4.2 What each development does

**Infrastructure** lets people capture domestic resources from the
reserves, spending energy to do it; it stores resources and houses
people. A unit holds `infraSlots` M workers, `storePerUnit` units of
each resource, and `housingPerUnit` M people. It is built from money
and materials.

**Economy** lets people make money. A unit holds `econSlots` M workers
(fewer than infrastructure), makes `moneyPerWorker` per million workers
a day, and each day consumes `econUpkeepEnergy` energy and
`econUpkeepMaterials` materials. The economy also sets the trade
capacity (phase 2), the spending cap (`budgetCapPerUnit` money a day
per unit) and the debt cap (`debtCapPerUnit`). It is built from money.

**Academia** lets people make technology for money. A unit holds
`acadSlots` M workers (fewer than either). It is built from money.

**Technology** multiplies, in the first version: capture per worker,
the energy cost of capture (down), money per economy worker, and the
upkeep of infrastructure and economy (down). It costs
`techUpkeepEnergy × T × P / 100` energy a day; unpaid, it decays. It
climbs more slowly the higher it is.

### 4.3 The day

In this order, every day, for every nation. Each step writes its lines
to the nation's ledger for the day.

1. **Weather.** Rainfall takes a slow random step within the climate
   zone's band (a year's swing, not a day's). The food factor is a hump:
   `w = exp(−((r − 1) / rainWidth)²)`, 1 at the optimum, falling for
   drought (r below 1) and for flood (r above 1). Zones differ in where
   their mean sits: arid below 1, tropical above, temperate near it.
2. **Needs.** Food need is `P` (plus more if people are to grow). Energy
   need is the energy of the capture the nation intends, the economy's
   upkeep and technology's upkeep. Materials need is the economy's
   upkeep and the day's building.
3. **Labour, needs first.** Workers fill infrastructure slots until the
   needs are met (food first, then energy, then materials), then the
   economy's slots, then academia's. Whoever is left is idle. The card
   shows four counts.
4. **Capture.** Workers in infrastructure capture
   `capturePerWorker × (1 + techCapture × T / 100)` units per million
   workers, directed to food, energy and materials in need order with
   the rest split. Against each reserve the return diminishes past the
   ceiling: `captured = R × ln(1 + effort / R)`, so below the ceiling a
   unit of effort yields near a unit, and above it each doubling adds
   `0.69 R`. Food is multiplied by the rainfall factor. Capture costs
   `captureEnergy × (1 − techEnergy × T / 100)` energy per unit
   captured, paid from the day's energy.
5. **People eat.** Food from the harvest and the store, people first.
   A shortfall is famine: deaths at `famineDeath × shortfall share` a
   day.
6. **Upkeep.** The economy's energy and materials, technology's energy,
   from the harvest and the stores. A unit that cannot be paid does not
   work that day; after `unpaidGrace` days it decays at `unpaidDecay` of
   its units a day until paid. Technology decays the same way.
7. **Money.** Working economy units make
   `moneyPerWorker × (1 + techMoney × T / 100)` per million workers.
   All of it is the nation's income.
8. **Budget.** The nation may spend at most `min(treasury + debt room,
   budgetCapPerUnit × E)` today. The four shares split it: build
   infrastructure (`infraCostMoney` money and `infraCostMaterials`
   materials per unit), build economy (`econCostMoney` per unit),
   research, keep. A fifth standing share, exploration, raises the
   ceiling of whichever reserve binds. Research makes technology:
   `dT = researchRate × researchersM × min(1, spend / (researchersM ×
   researchCost)) / (1 + T / techSlow)`.
9. **Stores.** Surplus fills the stores to their cap; past the cap it
   is wasted until trade (phase 2) can sell it.
10. **People.** Births at `birthRate × surplus food share`, up to
    `birthMax`, when there is housing. People above housing, and a
    share `leaveRate` of the idle, emigrate along the links to nations
    with housing and free slots (phase 2 carries them).
11. **Ledger close.** The card rows and the wire headlines for the day
    are taken from the ledger.

### 4.4 The budget rule

Each share is a number in 0..1, the four summing to 1, moved a step a
day by the first rule that fires, with the rule's text as the reason:

- a resource is short and infrastructure is below its ceiling's worth:
  raise build-infrastructure ("short of energy");
- people exceed housing: raise build-infrastructure ("no room");
- idle people exceed `idleTolerance` of P: raise build-economy ("idle
  hands");
- the treasury is below `reserveDays` of spending: raise keep ("thin
  reserve");
- otherwise: raise research ("nothing pressing").

Steps are `shareStep` a day, so a share takes weeks to swing, and the
card shows all four with their reasons. These rules are the whole of
the nation's economic decision-making. There is no utility, no
softmax, no horizon.

### 4.5 The card

The country card gains a ledger section with, for the current day:

- **People**: population, housed, idle; births, deaths, arrived, left.
- **Labour**: infrastructure, economy, academia, idle.
- **Resources**, one row each: ceiling, captured, eaten or used, built
  with, stored, balance; a strain mark when effort is past the ceiling.
- **Money**: income, spent (four shares with reasons), treasury, cap,
  debt.
- **Technology**: level, research today, upkeep paid or not.
- **Weather**: rainfall against the optimum.

Every number on the card is a ledger line or a sum of them.

### 4.6 Levers (target 15)

| Lever | Meaning |
|---|---|
| `infraSlots`, `econSlots`, `acadSlots` | workers per unit, M (infra > econ > acad) |
| `storePerUnit`, `housingPerUnit` | what a unit of infrastructure holds and houses |
| `capturePerWorker`, `captureEnergy` | capture per million workers; energy per unit captured |
| `moneyPerWorker` | money per million economy workers a day |
| `econUpkeepEnergy`, `econUpkeepMaterials` | per unit of economy a day |
| `techUpkeepEnergy`, `techSlow`, `researchRate` | technology's cost, its slowing, research yield |
| `budgetCapPerUnit`, `shareStep` | spending cap per unit of economy; how fast shares move |

That is fifteen. The technology multipliers (`techCapture`,
`techEnergy`, `techMoney`, `techUpkeep`), the build costs, the famine
and birth rates, the unpaid grace and decay, the rainfall width and
the exploration rate are fixed constants in the first version, named
in the code and listed in the reference doc. Tuning may promote one
to a lever, with a note here saying what it needed to move for.

### 4.7 Assumptions built in

- Reserves are ceilings with diminishing returns, not stocks; nothing
  is ever mined out.
- A unit of population works in exactly one place; there is no
  part-time, no productivity by age.
- All money is the nation's; there is no private sector.
- Water is weather, not a resource; a nation cannot build its way out
  of a drought except by trade.
- The military, health system and government are not in the economy
  yet; they are added by later pillars with their own levers.

## 5. Open pillars and their sessions

Each of these is designed in a question-and-answer round at the start
of its phase (`plan.md`). The questions below are the ones that have
to be answered; answers go into this document.

### 5.1 Trade (phase 2)

- Deals, a market, or both; how a price forms; who may trade with whom
  (links, capacity from the economy).
- What travels on the links: goods, people, the variant; how capacity
  is shared between them.
- Stores past their cap: sold, wasted, or lent.
- Debt: who lends, at what cost, what default does.
- Migration: where the idle and the unhoused go, how fast, what the
  receiving nation does with them.

### 5.2 Health and the outbreak (phase 3)

- The health system as a state: detection and response capacity from
  technology and a budget share; awareness and response as counters.
- Spread within a country (urban share, density, the variant's
  derived parameters) and between countries (which link flows carry
  it, at what rate).
- Derived parameters: how mode, diet, traits, cloak and brew become
  spread rate per link type, visibility, hardiness and climate
  preference; mutation on the map.
- What a response does: to the variant (coverage falls), to the nation
  (what it costs), to the links (borders).
- Coverage: a share of territory, of people, or of both.

### 5.3 Pressure on the player (phase 4)

- How an outbreak is traced to a deployment; what raises scrutiny and
  by how much; whether the response bar returns and what it measures.
- What the player can do on the map besides deploy.

### 5.4 Relations and alliances (phase 5)

- A relation per pair; what moves it (deals, aid, borders, war).
- What an alliance is and what it shares (deals, response, defence).

### 5.5 War and the military (phase 6)

- What the military is made of (a fourth employer was proposed and
  deferred).
- What starts a war (a binding shortage next to a neighbour's
  surplus was the stated intent), what it costs, how it ends, what
  changes hands.
- How wars and crises emerge at the global scale from local ones.

### 5.6 Presentation (with every phase)

- Map layers for each new state; wire headlines for each ledger event;
  the card's growth.

## 6. The bench and the map

The bench is unchanged by this design. What crosses from it is a
variant: two words of genome and a snapshot of stats. At deployment the
map reads the stats once into a handful of map-side numbers (section
5.2 decides which) and the genome is kept so that mutation on the map
can re-derive them. Nothing crosses back in the first version; a
sample returning from the map to the bench is a candidate for a later
phase.

## 7. Scope of the first version

Phases 1 to 4 make a playable game: nations with economies, trade on
the links, an outbreak that spreads and is answered, and a player who
can be caught. Phases 5 and 6 add the relations and wars that make the
world turbulent on its own. Everything else is after that.

## 8. The daily order

`world.js` runs, for every day: weather → economy (labour, capture,
needs, upkeep, money, budget, stores, people) → trade → health and
outbreak → relations → war → presentation (ledger close, map, wire).
A pillar that is not built yet is skipped. The order is fixed here and
changed only by a design decision.

## 9. Lever targets

| Pillar | Target |
|---|---|
| economy | 15 |
| trade | 15 |
| health and outbreak | 15 |
| player pressure | 10 |
| relations | 10 |
| war | 15 |

These are targets, not caps. A pillar that needs more says so in its
section, lever by lever. The existing player and link levers
(`player.md`, `map.md`) are not counted.

## 10. Architecture

- **One module per pillar, one shared ledger.** `economy.js`,
  `trade.js`, `health.js`, `relations.js`, `war.js`, each an IIFE that
  publishes one object with a `daily(iso, rng)` step and the card rows
  it owns. `world.js` keeps one ledger object per nation, reset each
  day, that every module writes its lines into, and runs the modules in
  the order of section 8. A pillar can be read, tested and removed on
  its own.
- **Presentation with each phase.** A phase that adds state adds its
  map layer, its card rows and its wire headlines in the same change.
  Nothing is built that cannot be seen.
- **Written from this document.** New code follows the spec. The old
  modules in the git history (commit `c118a8f`) are consulted for
  particular mechanics worth keeping, such as the seeded daily random
  stream and the pack tables, and nothing is pasted back wholesale.
- **State and saves.** New per-nation fields are rows in the pack
  tables of `world.js`; the save version is bumped when the shape
  changes; the links are never saved.
- **Config.** Each pillar's levers are one group in the config panel,
  named for the pillar, with the unit beside each.
