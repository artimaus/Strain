# Decisions

Every design decision, one record each, grouped by system and in date
order within a system. Docs cite the id; the record holds the options
and the reason. Format and prefixes: `process.md` §3,
`templates/decision.md`. Records before 11 October 2026 are
back-filled from `design.md` and the chat rounds; where the options
were not kept, the record says so.

## At a glance

| system | prefix | records | last | section |
|---|---|---|---|---|
| concept | CON | 7 | 2026-10-06 | [§1](#1-concept-con) |
| architecture | ARC | 6 | 2026-10-05 | [§2](#2-architecture-arc) |
| foundations | FND | 1 | 2026-10-05 | [§3](#3-foundations-fnd) |
| economy | ECO | 9 | 2026-10-05 | [§4](#4-economy-eco) |
| products | PRD | 8 | 2026-10-07 | [§5](#5-products-prd) |
| trade | TRD | 12 | 2026-10-06 | [§6](#6-trade-trd) |
| relations | REL | 11 | 2026-10-11 | [§7](#7-relations-rel) |
| war | WAR | 12 | 2026-10-11 | [§8](#8-war-war) |
| regimes | REG | 1 | 2026-10-06 | [§9](#9-regimes-reg) |
| outbreak | OUT | 1 | 2026-10-06 | [§10](#10-outbreak-out) |
| process | PRC | 7 | 2026-10-11 | [§11](#11-process-prc) |

## Summary

Seventy-five records. The concept and architecture records come from
the design session of 3 to 5 October 2026; each system's records from
its phase's rounds and from the round after its build, in which the
agent moved numbers the census forced and reported them; the process
records from the pass of 11 October that wrote `process.md`. A record
whose status is not "decided" says what replaced it.

## 1. Concept (CON)

### CON-01 · 2026-10-04 · The map's loop: spread and survive, nations with lives of their own, pressure on the player
- Level L1 · Status decided
- Context: design.md §1
- Options: the loop was chosen after the documentation review ("decide after the docs"); alternatives not kept
- Decision: a deployed variant spreads along the links and is answered; nations act from their situation (trade, alliances, wars); what happens comes back as scrutiny on the player.
- Effect: design.md §1; the coverage layer keeps its meaning until the outbreak pass (OUT-01)

### CON-02 · 2026-10-04 · Keep the bench, the map and the base of the UI; gut the nation simulation
- Level L1 · Status decided
- Context: design.md preamble; README "Status"
- Options: keep the player layer (chosen) · keep only the links, graph plus capacity, no flows (chosen) · delete the old docs (chosen) · strip the outbreak (chosen) · keep all four map panels (chosen)
- Decision: about 13,800 lines of nation economy, decisions and wars were removed; the bench, the map rendering, the links and the player layer stay; the old code is consulted for mechanics only (commit `c118a8f`).
- Effect: README, CLAUDE.md "rules that are easy to break"

### CON-03 · 2026-10-04 · Nations return with economies, technology, resources, infrastructure, alliances, trade and wars, legible and input-driven
- Level L1 · Status decided
- Context: design.md §1, §4
- Options: a drift toward targets · change only from inputs, internal or external, without a target (chosen)
- Decision: "a nation has a size, a population, untapped reserves of energy, food and materials, and developments (economy, infrastructure, academia) that capture reserves or convert harvested resources into money, military and technology"; nothing drifts toward a resting value.
- Effect: design.md §2 principles 1 to 3; the state of §4.1

### CON-04 · 2026-10-05 · The eight principles
- Level L1 · Status decided
- Context: design.md §2
- Options: the failure points of the old version, one rule each; alternatives not kept
- Decision: every number a ledger line; no targets; every decision a reason; few levers (about fifteen a pillar); one daily order; deterministic per seed; a probe from day one; concrete units.
- Effect: design.md §2; `process.md` G-gates check them

### CON-05 · 2026-10-05 · Units: millions of people, resource units a day, money, development units, technology a level
- Level L1 · Status decided
- Context: design.md §3
- Options: "IDK yet" at the round; settled in the design: one food unit feeds one million people a day; energy and materials scaled by the constants that relate them to food and money
- Decision: the units table of design.md §3.
- Effect: every card row and census column carries one of these units

### CON-06 · 2026-10-05 · Tempo: weeks to months; the map is not a separate game
- Level L1 · Status decided
- Context: design.md §1, §4.7
- Options: not kept
- Decision: nations change over weeks and months, a development grows about 20% a year with nothing pressing; nations exist to make the world the variant spreads through uneven, reactive and legible.
- Effect: ECO-07 sets the building costs to this tempo

### CON-07 · 2026-10-06 · Scope: phases 1 to 4 make a playable game, 5 and 6 a turbulent world; the rest after
- Level L1 · Status decided
- Context: design.md §7; plan.md
- Options: not kept
- Decision: economy, trade, end products and the outbreak pass first; relations and war next; regimes and balance after; the outbreak pass itself deferred (OUT-01).
- Effect: plan.md phase order; PRC-01

## 2. Architecture (ARC)

### ARC-01 · 2026-10-05 · One module per pillar, one shared ledger, one fixed slot order
- Level L2 · Status decided
- Context: design.md §8, §10; js/world.js
- Options: not kept
- Decision: each pillar is an IIFE registering once with `WORLD.registerPillar`; `world.js` runs the slots weather, economy, products, trade, health, relations, war each day with fresh ledgers; a pillar reads only what earlier slots wrote that day.
- Effect: js/world.js `ORDER`, `registerPillar`; nations.md §0

### ARC-02 · 2026-10-05 · The pillar interface: fields, seed, dailyWorld, daily, rows, census, censusWorld, layers, config
- Level L2 · Status decided
- Context: js/world.js (the comment above `registerPillar`); nations.md §0
- Options: not kept
- Decision: every hook optional; fields are pack-table rows `[key, short, default]`; config is one group of levers with a row each; layers join the map's stat views.
- Effect: js/world.js; js/map.js layer merge; js/shell.js `mergePillarConfig`

### ARC-03 · 2026-10-05 · Lever target of about fifteen a pillar, a target not a cap
- Level L2 · Status decided
- Context: design.md §2 principle 4, §9
- Options: a hard cap · a soft target with a note when exceeded (chosen)
- Decision: economy 15, trade 15, health and outbreak 15, player pressure 10, relations 10, war 15; over the target takes a decision record.
- Effect: design.md §9; doclint counts levers

### ARC-04 · 2026-10-05 · The country card: small, one collapsible fold-out per pillar, open state remembered
- Level L2 · Status decided
- Context: nations.md preamble "how to read a card"; js/worldui.js
- Options: a large card · a small card with collapsible sections (chosen)
- Decision: fixed rows describe the country; below them one fold-out per pillar shows that pillar's lines for the day and the reason behind each decision; which fold-outs are open is kept in local storage.
- Effect: js/worldui.js `pillarSections`, `entity_card_open`

### ARC-05 · 2026-10-05 · Ninety days of ledger history in memory, not saved; the census prints a summary and per-seed tables
- Level L2 · Status decided
- Context: js/world.js `history`; tools/census.py
- Options: history 30 / 90 / 365 days (90 chosen) · census summary only / per seed only / both (both chosen)
- Decision: daily sums per ledger key are kept for 90 days in a ring and dropped on save; the census prints min, median and max of every world line across seeds, the nations flagged in half the seeds, and one table per seed.
- Effect: js/world.js `HISTORY_DAYS`; tools/census.py

### ARC-06 · 2026-10-05 · Saves: new fields are pack-table rows; the version bumps when the shape changes; links are never saved
- Level L2 · Status decided
- Context: design.md §10; js/progression.js
- Options: not kept
- Decision: save v9 carries the world and every pillar's fields by their short keys; a field written but not declared fails the smoke round trip.
- Effect: js/world.js pack tables; js/progression.js `v: 9`

## 3. Foundations (FND)

### FND-01 · 2026-10-05 · Phase 0 built the scaffolding: ledger, daily order, seeded streams, census probe, config groups, card sections, pack rows
- Level L4 · Status decided
- Context: plan.md phase 0; nations.md §0
- Options: none beyond ARC-01 to ARC-06
- Decision: the slim `world.js` with the pillar registry and the per-slot streams (`dayRng`, `seedRng`); `tools/probes/census.js` and `tools/census.py`; the smoke test's foundations flags.
- Effect: js/world.js; tools/census.py; tools/smoke.py `foundations`

## 4. Economy (ECO)

### ECO-01 · 2026-10-05 · Reserves are static soft ceilings with diminishing returns, renewed only by expensive exploration
- Level L3 · Status decided
- Context: design.md §4.1, §4.2
- Options: reserves as stocks that deplete · static ceilings "representing commonality in the region", diminishing returns above (chosen)
- Decision: capture is `R × ln(1 + effort / R)`; a standing exploration share raises a ceiling slowly; nothing depletes.
- Effect: js/economy.js `captured`, `K.exploreYield`; nations.md §1

### ECO-02 · 2026-10-05 · Labour needs first: food, energy, materials, then the economy, then academia, then idle
- Level L3 · Status decided
- Context: design.md §4.3; §4.7 "labour order"
- Options: academia before the economy · academia last (chosen, with the stall accepted)
- Decision: academia last; the technology stall once the economy absorbs everyone is to be mitigated by later resource and budget sinks, not by reordering.
- Effect: js/economy.js labour step; gap carried to phase 8

### ECO-03 · 2026-10-05 · Water is rainfall, a state a nation cannot manage, with a hump: too much hurts as too little does
- Level L3 · Status decided
- Context: design.md §4.1; §4.7
- Options: a water reserve · a rainfall state (chosen) · a permanent zone penalty (tried, dropped)
- Decision: rainfall is a bounded random walk around each zone's optimum; food capture is scaled by `exp(−((r − 1) / 0.5)²)`.
- Effect: js/economy.js `rainFactor`, `K.rainWidth`

### ECO-04 · 2026-10-05 · One money budget, capped per unit of economy a day, split by shares that rules move with a reason
- Level L3 · Status decided
- Context: design.md §4.4
- Options: separate resource budgets · all money (chosen) · shares by rules (chosen) · a standing exploration share (chosen)
- Decision: `budgetCapPerUnit × economy` a day; seven shares; one rule a day moves one step from the largest other share to the share the first firing rule names; unpaid units stop and decay; the idle eat and emigrate.
- Effect: js/economy.js budget step, `SHARES`, `shareStep`

### ECO-05 · 2026-10-05 · Reserve ceilings: food by population, energy and materials by area^0.25, the world's ceilings 1.5 times its need
- Level L4 · Status decided
- Context: design.md §4.7 "reserve ceilings"
- Options: area^0.25 (41 nations past their energy ceiling at the start, chosen) · area^0.5 (85) · area^0.75 (115) · food by area (47 more nations in famine)
- Decision: calibration as stated; about 21 nations with no reserves depend on trade from day one.
- Effect: js/economy.js `calibrate`, `K.areaExp`, `K.worldSlack`

### ECO-06 · 2026-10-05 · Tempo: a development grows about 20% a year with nothing pressing
- Level L4 · Status decided
- Context: design.md §4.7 "tempo"
- Options: not kept (the user asked for about 20%)
- Decision: 35,000 money and 350 materials a unit of infrastructure, 26,000 money a unit of economy.
- Effect: js/economy.js `K.infraCostMoney`, `K.infraCostMaterials`, `K.econCostMoney`

### ECO-07 · 2026-10-05 · Hoards are kept: income past the spending cap accumulates
- Level L4 · Status decided
- Context: design.md §4.7 "hoards"
- Options: cap the treasury · keep hoards as the trade fund and the war chest (chosen)
- Decision: the treasury is unbounded.
- Effect: js/economy.js money step

### ECO-08 · 2026-10-05 · Departures found by the prototype: subsistence, the food margin, research per head, exploration on demand, clamps, noise, starting stocks
- Level L4 · Status decided
- Context: design.md §4.7 "departures from §4.3"
- Options: each tried against the prototype's census; the prose keeps the reason, not the alternative
- Decision: the idle grow 0.6 food a million a day; labour aims at a 10% food margin; research is `researchRate × researchers / pop`; exploration spends only past a ceiling; technology's multipliers clamp at 100; ±5% seeded noise on developments; treasury starts at 30 days of the cap, stores at 15 days of use; two budget cases added.
- Effect: js/economy.js `K.subsistence`, `K.foodMargin`, `researchRate`, `K.seedNoise`, `K.startTreasuryDays`, `K.startStoreDays`

### ECO-09 · 2026-10-05 · The first census accepted phase 1 with its famine and unpowered nations as the pressures trade must answer
- Level L4 · Status decided
- Context: design.md §4.7 "first census"; data/census-2026-10-05-phase1.md
- Options: tune now · accept and let trade answer (chosen)
- Decision: nine famine nations and 13 to 15 unpowered economies on every seed are carried to phase 2.
- Effect: plan.md phase 2 goal

## 5. Products (PRD)

### PRD-01 · 2026-10-06 · Military and health are levels, like technology, not staffed; each with its own decay system
- Level L3 · Status decided
- Context: design.md §5.7
- Options: a fourth employer for the military (deferred to the war session) · levels built by a budget share (chosen) · one level per product with its own decay (chosen over several strands)
- Decision: a level per head, built by its share; veterancy, equipment and technology are simulated through decay, not strands.
- Effect: js/products.js `PRODUCTS`; nations.md §3

### PRD-02 · 2026-10-06 · Two running averages, embodied technology and embodied population, move only when the level rises
- Level L3 · Status decided
- Context: design.md §5.7 "two running averages"
- Options: the user's formula ((40/42)·40 + (2/42)·45) adopted as stated
- Decision: `new = (L × old + rise × today) / (L + rise)`; decay leaves the averages alone.
- Effect: js/products.js build step

### PRD-03 · 2026-10-06 · Upkeep per resource scales with population and infrastructure and is cut by technology; the military draws energy and food at war only
- Level L3 · Status decided
- Context: design.md §5.7 "upkeep"
- Options: the recommended per-resource upkeep, with the user's condition that the military uses energy and food only in wartime
- Decision: as stated; health draws energy and materials.
- Effect: js/products.js `upkeep` lists, `atWar` field

### PRD-04 · 2026-10-06 · Decay has named causes: unpaid shares, the population gap, the technology gap; technology has a flat fade not cut by its own level
- Level L3 · Status decided
- Context: design.md §5.7 "decay"
- Options: "small flat decay, however technology should not be cut by its own level" (the user's correction, adopted)
- Decision: `decayUnpaid`, `decayDilute`, `decayObsolete`; `techFade` on technology.
- Effect: js/products.js decay step; js/economy.js `K.techFade`

### PRD-05 · 2026-10-06 · The effect when used is the level times the technology multiplier at embodied technology times the pool share; health moves deaths and births
- Level L3 · Status decided
- Context: design.md §5.7 "when a level is used"
- Options: not kept
- Decision: `effect = L / 100 × (1 + embT / 100) × min(1, embP / pop)`; deaths × (1 − 0.6 × effect), births × (1 + 0.5 × effect); a base mortality joins the people step.
- Effect: js/products.js `effectOf`; js/economy.js `_deathMul`, `_birthMul`, `K.baseDeath`

### PRD-06 · 2026-10-06 · Budget pressures are stand-ins until regimes: the military floor from the row's level, health from deaths
- Level L3 · Status decided
- Context: design.md §5.7 "budget pressures"
- Options: the user chose "military from row level, health from deaths; revisit with regime decision-making"
- Decision: as stated; a gap owned by phase 7.
- Effect: js/economy.js `milFloor`, `K.deathsLine`; plan.md gaps

### PRD-07 · 2026-10-07 · As built: calibration counts the products, the economy's upkeep comes first, unmet upkeep joins the market, the short line is 90%
- Level L4 · Status decided
- Context: design.md §5.7 "as built"; data/census-2026-10-07-products-before.md
- Options: pro-rata upkeep between the economy and the products (tried: Japan's technology 93 to 59, reverted) · the economy first (chosen) · a short line of 98% (a quarter of the world read short) · 90% (chosen)
- Decision: as stated in the record title.
- Effect: js/economy.js upkeep order, `K.shortLine` 0.9; js/products.js `_prodAsk`

### PRD-08 · 2026-10-07 · The progression round: a point priced in worker-days at the wage, e-fold every 30 points, upkeep on the same curve, seeds stand
- Level L4 · Status decided
- Context: design.md §5.7 "the progression round"; data/census-2026-10-07-products-after.md
- Options: price in worker-days at the wage (chosen) · exponential curve (chosen) · upkeep skewed like the price (chosen) · reseed the levels (rejected: seeds stand) · technology's unpowered decay proportional to the unpaid share (chosen)
- Decision: on a 10% share a nation climbs about 15 points a year at level 0, 3 at 50, half a point at 100.
- Effect: js/products.js `milCostDays`, `heaCostDays`, `productScale`; js/economy.js tech decay

## 6. Trade (TRD)

### TRD-01 · 2026-10-06 · One world price per resource plus standing deals
- Level L3 · Status decided
- Context: design.md §5.1 "shape"
- Options: the recommended shape, reach and price were taken
- Decision: spot purchases cover today's shortfall at today's price; a month of buying from one seller becomes a deal.
- Effect: js/trade.js `dailyWorld`; nations.md §2

### TRD-02 · 2026-10-06 · Goods move only between linked nations, within each edge's capacity and a trade capacity per unit of economy
- Level L3 · Status decided
- Context: design.md §5.1 "reach"
- Options: not kept
- Decision: `tradePerUnit × economy` units a day, bought and sold together.
- Effect: js/trade.js `cap[iso]`, `tradePerUnit`

### TRD-03 · 2026-10-06 · The price moves daily by elasticity times the ask-offer imbalance, bounded, with no base
- Level L3 · Status decided
- Context: design.md §5.1 "price"
- Options: not kept
- Decision: `price ×= 1 + e × (asks − offers) / (asks + offers)` between a floor and a ceiling.
- Effect: js/trade.js `priceElasticity` 0.05, `priceFloor`, `priceCeiling`

### TRD-04 · 2026-10-06 · No debt in phase 2
- Level L3 · Status superseded by REL-07
- Context: design.md §5.1 "debt"
- Options: lending by a rule · none until lenders can be nations (chosen)
- Decision: a nation buys what its treasury allows.
- Effect: none in code; lending arrived with relations

### TRD-05 · 2026-10-06 · Export capture: the idle in spare slots, then economy workers who shift while it pays
- Level L3 · Status decided
- Context: design.md §5.1 "export"; data/census-2026-10-06-trade.md
- Options: idle only (first build: 200 units a day against thousands) · economy workers move to export while a unit of effort earns more than a worker makes, 1% a day (chosen after the first census)
- Decision: as stated; a nation short at home exports nothing that day.
- Effect: js/trade.js `exportShift`, `exportMargin`, `exportWorkers` field

### TRD-06 · 2026-10-06 · Rationing pro rata by ask within each edge's capacity
- Level L3 · Status decided
- Context: design.md §5.1 "rationing"
- Options: first come · pro rata (chosen)
- Decision: each seller's offer is split among its linked buyers in proportion to what they ask.
- Effect: js/trade.js spot step

### TRD-07 · 2026-10-06 · Deals: a fixed amount a day at the signing price for a term, delivered before spot trade, lapsing after a month undelivered
- Level L3 · Status decided
- Context: design.md §5.1 "deals"
- Options: deals at a floating price · fixed (chosen)
- Decision: as stated.
- Effect: js/trade.js `dealAfterDays`, `dealTerm`, `dealLapseDays`, `deals` field

### TRD-08 · 2026-10-06 · The comfort store shrinks as the price rises: comfortDays / price days of use
- Level L3 · Status decided
- Context: design.md §5.1 "comfort"
- Options: a fixed comfort · scaled by the price (chosen)
- Decision: above comfort a share of the excess is offered; below it the gap is bought back over a month.
- Effect: js/trade.js `comfortDays`, `restockDays`, `K.storeSellShare`

### TRD-09 · 2026-10-06 · People leave along the links to room, at most migPerCap times an edge's capacity a day
- Level L3 · Status decided
- Context: design.md §5.1 "people"
- Options: not kept
- Decision: the idle and the unhoused go to linked nations with free slots and housing, in proportion to the room.
- Effect: js/trade.js migration step, `migPerCap`

### TRD-10 · 2026-10-06 · The links' capacities raised fourfold
- Level L4 · Status decided
- Context: design.md §5.1 "capacity"
- Options: not kept; the old capacities carried 4,300 units a day against a need near 13,000
- Decision: land 2, sea 1, air 0.2 per their units.
- Effect: js/shell.js `landCap`, `seaCap`, `airCap`

### TRD-11 · 2026-10-06 · Every coast is linked to every coast; a nation works a reserve only up to three times its ceiling
- Level L4 · Status decided
- Context: design.md §5.1 "after the first census"; data/census-2026-10-06-trade-sea.md
- Options: eight nearest coasts (first build: India short of materials with money in hand) · every coast, capacity falling e-fold per 6,000 km (chosen) · the Gulf states farming a food ceiling of a third of a unit (the effort cap fixes it)
- Decision: `seaK` 0, `seaRange` 6000; `maxStrain` 3.
- Effect: js/shell.js links group; js/economy.js `K.maxStrain`

### TRD-12 · 2026-10-06 · Found on the way: exports never starve the exporter, a month of the import bill is held, a broke nation sells down, demand comes from the neighbours' asks
- Level L4 · Status decided
- Context: design.md §5.1 "found on the way"
- Options: each a fix to a census finding (Singapore not buying; export capture starving economies; broke nations; India and Japan short of materials)
- Decision: capture for export is limited by the energy left in store and no food leaves a famine nation; a nation that went short holds a month of its bill before building; a broke nation sells its other stores down to three days; a nation captures for export only what a linked neighbour asked for yesterday.
- Effect: js/economy.js `K.holdDays`, `held`; js/trade.js `K.crisisDays`, `K.crisisSellShare`, `_demand`

## 7. Relations (REL)

### REL-01 · 2026-10-08 · A view per direction: a baseline from fixed facts plus goodwill minus grievance, both fading
- Level L3 · Status decided
- Context: design.md §5.4 "a view per direction"; round 1
- Options: a single relation per pair · a view per direction from baseline + goodwill − grievance (chosen)
- Decision: baseline from the same region, a land border and like governments; stocks fade 1% a day; kept only for pairs with a history.
- Effect: js/relations.js `views` field, `baseline`, `viewOf`, `relFade`

### REL-02 · 2026-10-08 · What moves a view: deals kept and broken, aid in a famine, refusals, people taken in, and a threat assessment by temperament
- Level L3 · Status decided
- Context: design.md §5.4 "what moves a view"; round 1
- Options: multi-select; the user added "aggressive nations should have a more hostile view towards weaker nations (especially wealthy ones); peaceful nations a positive view towards weaker nations"
- Decision: all five movers; hawks resent weaker, richer neighbours; doves warm to weaker ones.
- Effect: js/relations.js steps 2 to 5, `dealGoodwill`, `breakGrievance`, `refusalGrievance`, `aidGoodwill`, `migGoodwill`, `threatRate`, `peaceRate`

### REL-03 · 2026-10-08 · A pact after a season above a line both ways; it lapses below a lower line
- Level L3 · Status decided
- Context: design.md §5.4 "lines and pacts"; round 1
- Options: a pact at once above the line · after a season (chosen)
- Decision: 90 days above 40 both ways signs; below 10 lapses.
- Effect: js/relations.js `pactLine`, `pactBreak`, `pactDays`, `pacts` field

### REL-04 · 2026-10-08 · Deals with a friend form sooner and are delivered first; a seller refuses a buyer it holds in enmity
- Level L3 · Status decided
- Context: design.md §5.4 "lines and pacts"; round 1
- Options: priority above a line and refusal below (chosen)
- Decision: friends above 20 sign in 15 days; below −40 a seller refuses on deals and spot.
- Effect: js/relations.js `friendLine`, `hostileLine`, `_friendly`, `_refuses`; js/trade.js hooks

### REL-05 · 2026-10-08 · Temperament from the row's authority and freedom; strength as the military's effect times size; wealth as income per head
- Level L3 · Status superseded in part by WAR-06 (strength is the army's once war sizes it)
- Context: design.md §5.4 round 2
- Options: temperament from the row (chosen) · from a gene (later, REG) · strength from the level alone · from effect and size (chosen)
- Decision: `temper = authority / 100 × (1 − freedom / 100) × 2`, clamped; hawkish at 0.6, open below 0.35.
- Effect: js/relations.js `seed`, `temperWord`

### REL-06 · 2026-10-08 · Aid: food above comfort goes free to linked nations in famine that the giver sees at zero or above
- Level L3 · Status decided
- Context: design.md §5.4 "aid and lending"; round 2
- Options: aid to allies only · to anyone in famine seen at zero or above (chosen)
- Decision: a tenth of the excess a day, split by need, capped by each link.
- Effect: js/relations.js step 6, `aidShare`, `aidGoodwill`

### REL-07 · 2026-10-08 · Any nation above a lending line lends, at interest, up to the borrower's debt cap; a year unpaid is a default
- Level L3 · Status decided (supersedes TRD-04)
- Context: design.md §5.4 "aid and lending"; round 2
- Options: allies lend · any nation above a relation line lends (chosen)
- Decision: the friendliest deep treasury lends the gap to a month of the shortfall bill; 0.05% a day; 2% of the debt due a day; default after a year without a real payment: 40 grievance, the pact lapses.
- Effect: js/relations.js step 7, `lendLine`, `interest`, `debtCapPerUnit`, `debts` field

### REL-08 · 2026-10-09 · The round after building: a warmer baseline for like neighbours, deal goodwill tripled both ways, the aid line at the store's capacity, repayment held before building
- Level L4 · Status decided (by the agent in the build; reported in design.md §5.4)
- Context: design.md §5.4 "the round after building"; data/census-2026-10-09-relations.md
- Options: the first numbers (stocks below 20, no pact, no aid, no loan in a year) · the numbers as stated (chosen)
- Decision: border +10, like governments +10 to −20; `dealGoodwill` 0.15 both sides; aid from a store nine tenths full; `_due` held by the economy.
- Effect: js/relations.js `K.borderBase`, `K.govLike`, `K.govGap`, `K.aidStoreLine`; js/economy.js `held`

### REL-09 · 2026-10-09 · Deliveries go allies first, then oldest deal first
- Level L4 · Status decided (by the agent in the build)
- Context: design.md §5.4 "the round after building"
- Options: the row order (the old code, which favoured big rows) · by pact count (sank Japan) · pro rata among a seller's deals (all lapse together when short) · allies first then oldest first (chosen)
- Decision: as stated; a short seller keeps its allies and its longest customers.
- Effect: js/trade.js deal step

### REL-10 · 2026-10-10 · Japan's technology collapse is carried to phase 8, not fixed in phase 5
- Level L4 · Status decided
- Context: design.md §5.4; plan.md gaps
- Options: defer to phase 8 (chosen) · serve asks needs-first on the spot market now · let survival imports bypass the trade capacity now
- Decision: Japan's imports are capped by its trade capacity, food is bought first and its technology's energy runs out; a loan's repayment tips it; the fix is the trade order and the capacity, phase 8.
- Effect: plan.md gaps table; nations.md §5 assumptions

### REL-11 · 2026-10-11 · Relations keeps seventeen levers against a target of ten
- Level L4 · Status decided
- Context: design.md §9; js/relations.js `LEVERS`; found by `tools/doclint.py`
- Options: fold the pact, lending and threat lines into constants (K) · keep them as levers so the balance phase can move them (chosen)
- Decision: the fade, the five movers' rates, the three pact lines, the three relation lines and the three lending levers stay in the panel; phase 8 trims what it never moves.
- Effect: none in code; the count is noted here and in nations.md §5

## 8. War (WAR)

### WAR-01 · 2026-10-09 · The military is a standing fourth employer
- Level L3 · Status decided
- Context: design.md §5.5 round 1; nations.md §6
- Options: A level plus mobilised people at war (recommended) · B level only · C a standing fourth employer, staffed always, paid a wage (chosen)
- Decision: soldiers are a job; strength is the level's effect times the soldiers.
- Effect: js/war.js step 1, `soldiers` field; js/economy.js labour step

### WAR-02 · 2026-10-09 · A war starts on a shortage next to a surplus, or on enmity
- Level L3 · Status superseded by WAR-09
- Context: design.md §5.5 round 1
- Options: A shortage next to surplus with a strength margin (recommended) · B shortage or enmity (chosen) · C shortage only, no margin
- Decision: as chosen; refined in round 3.
- Effect: js/war.js step 4

### WAR-03 · 2026-10-09 · A day of war brings attrition, deaths and flight, a closed border and infrastructure damage, all four
- Level L3 · Status decided
- Context: design.md §5.5 round 1
- Options: multi-select; all four taken
- Decision: each in proportion to the enemy's strength over one's own.
- Effect: js/war.js step 2, `attrition`, `casualty`, `damage`, `flight`

### WAR-04 · 2026-10-09 · Wars end at a peace table: position, weariness, weekly demand and offer, surrender, white peace
- Level L3 · Status decided
- Context: design.md §5.5 rounds 1 and 2
- Options: round 1 offered yield at 3 to 1 with a tribute deal, with reserves changing hands, or both; the user asked instead for a way for either side to sue for peace or demand surrender with an attached deal and a measure of what a nation will accept; round 2 Q3: as described (chosen) · tribute in money too · shorter and sharper
- Decision: position `(ours − theirs) / (ours + theirs)`; weariness from time, level lost and people lost; the stronger demands `p × maxTribute × (1 − w)`, the weaker offers `p × maxTribute × (0.5 + w)`; peace at the midpoint when they meet; surrender at −0.6 and 0.5; white peace within 0.1 when both are past 0.5.
- Effect: js/war.js terms step, `maxTribute`, `termsDays`, `minWarDays`, `K.surrenderPos`, `K.whitePos`

### WAR-05 · 2026-10-09 · Soldiers come out of the labour pool before the economy
- Level L3 · Status decided
- Context: design.md §5.5 round 2 Q1
- Options: A before the economy (recommended, chosen) · B after academia, from the idle only · C between the economy and academia
- Decision: the army is a need the budget sets; a fully employed nation still has one.
- Effect: js/economy.js labour step `wS`

### WAR-06 · 2026-10-09 · The army is what half the military share pays for, capped at 2% of the people in peace and 5% at war; the share climbs toward 0.3 at war
- Level L3 · Status decided
- Context: design.md §5.5 round 2 Q2
- Options: A half the share, capped (recommended, chosen) · B a fixed share of the population · C the whole share
- Decision: as stated; the other half builds the level.
- Effect: js/war.js `soldierPay`, `armyCap`, `warArmyCap`, `warShare`; js/economy.js `_wageBudget`, the war budget rule

### WAR-07 · 2026-10-09 · A defender's allies join; an attacker's allies join only if hawkish
- Level L3 · Status decided
- Context: design.md §5.5 round 2 Q4
- Options: A a defender's allies join (recommended, chosen) · B allies lend and supply, never fight · C everyone's allies join
- Decision: as stated; chains of pacts are how a local war widens.
- Effect: js/war.js `declare`

### WAR-08 · 2026-10-10 · Conscripts: half a percent of the people serve whatever the budget
- Level L3 · Status decided
- Context: design.md §5.5 round 3 Q1
- Options: A conscripts 0.5% (recommended, chosen) · B the army is what the wages pay (the broke have no army)
- Decision: a broke nation can still fight and be fought.
- Effect: js/war.js `armyMin` 0.005

### WAR-09 · 2026-10-10 · Wars start by need, greed or enmity, with view and strength lines by temperament
- Level L3 · Status decided (supersedes WAR-02)
- Context: design.md §5.5 round 3 Q2
- Options: A need, greed and enmity (recommended, chosen) · B need and enmity with looser lines · C keep the trigger as built (rare wars)
- Decision: need: a month short, a non-friend land neighbour with a surplus, 1.5 / 2 / 3 to 1 by temperament; greed: a hawk on a richer, weaker land neighbour at 3 to 1; enmity: a view at −40 at 2 to 1.
- Effect: js/war.js step 4, `attackMargin`, `doveMargin`, `greedMargin`, `enmityMargin`, `K.hawkView`, `K.waryView`, `K.doveView`

### WAR-10 · 2026-10-10 · A hawk may fight on two fronts if it outweighs both enemies three to one
- Level L3 · Status decided
- Context: design.md §5.5 round 3 Q3
- Options: A one war at a time, one start a season (recommended) · B one start a year · C up to two fronts (chosen)
- Decision: as chosen; one start a season still applies.
- Effect: js/war.js step 4 `fronts`, `busy`

### WAR-11 · 2026-10-10 · The round after building: no second war while a tribute is paid, one tribute a pair, a season's warm-up, flight cut tenfold, the tribute held by the economy, missed only with the means
- Level L4 · Status decided (by the agent in the build; reported in design.md §5.5)
- Context: design.md §5.5 "the round after building"; data/census-2026-10-10-war.md
- Options: the first build (hawks re-attacked the same victim every season; Israel lost three quarters of its people; broke losers broke their tributes every two months) · the fixes as stated (chosen)
- Decision: as stated in the title; `flight` 0.0005.
- Effect: js/war.js steps 3 and 4, `flight`; js/economy.js `held` includes `_tributeDue`

### WAR-12 · 2026-10-11 · War keeps seventeen levers against a target of fifteen
- Level L4 · Status decided
- Context: design.md §9; js/war.js `LEVERS`; found by `tools/doclint.py`
- Options: make the conscript floor and the greed margin constants · keep them as levers, since round 3 added them to make wars happen at all (chosen)
- Decision: `armyMin` and `greedMargin` stay in the panel; phase 8 trims what it never moves.
- Effect: none in code; the count is noted here and in nations.md §6

## 9. Regimes (REG)

### REG-01 · 2026-10-06 · Regimes decide their preferences by a genetic algorithm: a genome of named preferences, change by regime type, stability as grievance, a pool bred offline
- Level L1 · Status decided
- Context: design.md §5.8
- Options: fixed pressures by row (the stand-ins) · a genome selected at regime change (chosen); mutation and crossover (chosen); four regime types with their own triggers (chosen); a baseline pool trained offline (chosen); after war, before balance (chosen)
- Decision: as design.md §5.8; the first design round of phase 7 (11 October) was stopped before any answer and restarts under `process.md`.
- Effect: plan.md phase 7

## 10. Outbreak (OUT)

### OUT-01 · 2026-10-06 · The outbreak is its own multi-phase pass, deferred; the coverage layer keeps its meaning until then
- Level L1 · Status decided
- Context: plan.md phase 4; design.md §5.2, §5.3
- Options: design the outbreak with health in phase 3 · defer it as a pass of its own (chosen: "let's do outbreak as its own multiphase pass, defer these decisions for now")
- Decision: spread on the trade flows, detection and response on the health level, pressure on the player, each its own round when the pass starts.
- Effect: plan.md phase 4

## 11. Process (PRC)

### PRC-01 · 2026-10-05 · Phases run in order, each opening with a question round, built and documented in the same change, ending green on the smoke test
- Level L2 · Status decided (refined by PRC-07)
- Context: plan.md preamble and "working rules"
- Options: not kept
- Decision: as stated; one pillar is one module, one config group, one card section, one census line; the reference is written before the numbers are tuned.
- Effect: plan.md; CLAUDE.md

### PRC-02 · 2026-10-11 · Decisions live in a log, one record each, grouped by system and chronological within
- Level L2 · Status decided
- Context: this pass; process.md §3
- Options: A a log, one record per decision (recommended; the user added: grouped by system or section, then chronology, not a flat list) · B inline in each design section · C both
- Decision: `docs/decisions.md` with a section per prefix; docs cite ids.
- Effect: docs/decisions.md; templates/decision.md; doclint check 2

### PRC-03 · 2026-10-11 · Analysis and data live as committed files under docs/data with a standard header
- Level L2 · Status decided
- Context: process.md §4
- Options: A committed files with a header, docs link and quote (recommended, chosen) · B inline tables in the design doc · C the tool output only, not committed
- Decision: census reports written by `tools/census.py --report`; rounds as files; an index.
- Effect: docs/data/; tools/census.py; doclint check 4

### PRC-04 · 2026-10-11 · A round is file first; the chat question carries each option's mechanism and predicted number
- Level L2 · Status decided
- Context: process.md §2
- Options: A file first, chat carries the options (recommended, chosen) · B file first, chat a pointer only · C chat first, file after
- Decision: nothing is asked that is not in the round file; an option raised in chat is added to the file before it is chosen.
- Effect: templates/round.md; CLAUDE.md "how we work"

### PRC-05 · 2026-10-11 · Design and reference stay in separate files; the register joins the reference template
- Level L2 · Status decided
- Context: process.md §5
- Options: A one file per system holding design, as built and register (recommended) · B design in design.md, reference in nations.md, the register a new section of the reference (chosen)
- Decision: `design.md` §5.x as decided; `nations.md` §n as built with §3 register, §5 departures, §6 gaps.
- Effect: templates/system-design.md, templates/system-reference.md

### PRC-06 · 2026-10-11 · This pass writes the process, formats and glossary and converts the entry points; systems convert as reworked; no exemplar
- Level L2 · Status decided
- Context: the plan of 11 October
- Options: process, formats, glossary and the entry points (chosen) · process, formats, glossary only · everything now; an exemplar system file (war, economy, none: none chosen)
- Decision: README, plan.md, the top of design.md and CLAUDE.md now; nations.md and the design sections system by system as each is reworked.
- Effect: this commit series

### PRC-07 · 2026-10-11 · Four levels with gates: L1 concept, L2 technical design, L3 vertical system design, L4 implementation and tuning
- Level L2 · Status decided
- Context: process.md §1; the approved plan
- Options: the user's four levels in their words; the plan's split put the build gate under L4
- Decision: gates G1 framed, G2 wired, G3 decided, G4a built, G4b settled, each a checklist; a question belongs to the lowest level whose answer it changes.
- Effect: process.md §1; plan.md "done when" cites G4a
