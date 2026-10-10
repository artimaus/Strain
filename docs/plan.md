# The plan

Phases that build `design.md`. Each phase opens with a
question-and-answer round that settles its open questions (listed in
`design.md` §5), is built and documented in the same change, and ends
green. Nothing in a later phase is started before the earlier one is
done.

**A phase is done when**

- the smoke test passes, with flags for the phase's behaviour;
- its census line reads plausibly on six seeds over three years;
- its state has card rows, a map layer where one makes sense, and wire
  headlines for its events;
- its levers are one group in the config panel, within the pillar's
  target or with a note in `design.md`;
- the reference docs describe it in the four-section template:
  `map.md` for anything on the map's own side, a new `nations.md` for
  the pillars;
- `design.md` records the round's answers and any departure from them.

## Phase 0: foundations

**Goal.** The scaffolding every pillar uses, so the pillars stay
small.

**Scope.**
- The per-nation ledger: one object per nation, reset each day, with
  named lines a module appends to; the card reads it.
- The daily order in `world.js` with a hook per pillar, in the order of
  `design.md` §8; absent pillars are skipped.
- The seeded daily random stream (one `mulberry32` per day from the
  world seed and the day), handed to each pillar's step.
- A census probe (`tools/probes/census.js`) that sets a seed, advances
  N days and prints one line per nation and a world line; a Python
  driver that runs it over six seeds and tabulates.
- The config panel grouped per pillar; the card with a section per
  pillar; pack-table rows for the new fields; save version 9.
- `docs/nations.md` skeleton with the template.

**Q&A.** None beyond the architecture decisions already taken.

**Done when.** The probe runs on an empty world and prints the day; the
save round trip covers the new rows; the smoke test stays green.

## Phase 1: the economy

**Goal.** `design.md` §4 in full: nations with people, water,
reserves, infrastructure, economy, academia, technology, a treasury
and a budget, changing only through ledger lines.

**Scope.**
- `economy.js`: seeding from the data rows (units from the 0..100
  columns and the map's area); weather; needs; labour, needs first;
  capture with diminishing returns and the energy cost; eating and
  famine; upkeep, unpaid days, decay; money; the budget shares with
  their reasons; research and technology's upkeep; stores; births and
  deaths. Emigration is counted on the ledger and not yet moved
  (phase 2 moves people).
- The card's ledger section (§4.5).
- Layers: economy (money per head), technology, a resource strain
  layer (which reserve binds and how hard).
- Wire: famine, a unit stopping or decaying, a budget share swinging, a
  reserve ceiling raised.
- Levers: the fifteen of §4.6, one config group.
- Census: per nation, population, idle share, technology, treasury,
  the binding resource and its strain; per world, totals and the count
  of nations in famine.

**Q&A at the start.**
- The default numbers: a worked day for three nations (large and
  rich, small and rich, large and poor) on paper before any code.
- How the 0..100 row columns become units: infrastructure, economy and
  academia per million people, reserves per km².
- Whether stores start full, empty, or at some days of use.
- What exactly the first wire headlines are.

**Done when.** On six seeds over three years no nation vanishes or
explodes; every shortage, idle count and decay on a card is explained
by its lines; the budget shares move and their reasons read true; a
drought shows in food and in the wire.

## Phase 2: trade and movement on the links

**Goal.** The links carry goods and people. Surpluses meet shortfalls;
the idle and the unhoused move; nations borrow.

**Scope.** `trade.js`; the links' capacity gets its meaning (what a
unit of capacity carries a day); stores past their cap sell; prices or
deals per the round; debt; migration along the links to housing and
free slots; the card's trade and movement rows; a trade layer; wire
headlines for deals, defaults, migrations.

**Q&A at the start.** `design.md` §5.1.

**Done when.** Two neighbours, one short and one in surplus, end up
trading on their own; a nation with no reserves of a resource lives on
imports; people move from a crowded nation to an empty one; the world's
resource balance is a census line.

## Phase 3: end products

**Goal.** `design.md` §5.7: military and health as levels built by the
budget, with embodied technology and population, upkeep per resource
and named decay; technology's upkeep and flat decay reworked.

**Scope.** `products.js` (a new slot after the economy in the daily
order): the two levels, their running averages, their cost per point,
their upkeep and decay lines; the budget shares and their stand-in
pressures; health's effect on births and deaths in the economy's
people step; technology's energy upkeep scaled by population, economy
and infrastructure, and its flat decay; card rows; layers for military
and health; wire headlines (a level built or decaying, a health
system behind its people); census lines; levers.

**Q&A at the start.** The default numbers for the costs, upkeeps and
decay rates, on a worked example as in phase 1.

**Done when.** On six seeds over three years levels rise where the
budget feeds them and fall where it does not; a fast-growing nation's
levels dilute visibly; a nation that stops building falls behind its
own technology; every decay has its line.

## Phase 4: the outbreak pass (several phases)

Deferred as a pass of its own, with its design rounds (`design.md`
§5.2 and §5.3) held when it starts. Expected to split into: the
variant's spread within and between countries on the trade pillar's
flows; health's detection and response using the level of phase 3;
pressure on the player and game over from the map. The coverage layer
keeps its present meaning until then.

## Phase 5: relations and alliances

**Goal.** Nations have friends and enemies for reasons on the card.

**Scope.** `relations.js`; a view per direction (a baseline plus
fading goodwill and grievance) moved by deals, aid, refusals, people
taken in and a threat assessment; pacts after a season; aid in a
famine; loans at interest with default; trade reading the views; a
relations layer; wire headlines; census lines; levers.

**Q&A at the start.** `design.md` §5.4 (two rounds, 8 October 2026).

**Done when.** On six seeds over three years pacts form among
neighbours that trade and lapse for reasons on the wire; a hawkish
nation's coldest views are its weaker, richer neighbours; the nations
with no reserves live on loans and food aid instead of starving; every
move of a view has a line.

## Phase 6: war and the military

**Goal.** Shortages next to surpluses start wars; wars end; the world
has crises of its own.

**Scope.** `war.js`; the army as a job (conscripts, wages from the
military share, before the economy in the labour order); wars of
need, greed and enmity across land borders; attrition, deaths, flight,
closed borders, damage; the weekly peace table (position, weariness,
demand and offer, surrender, white peace); tributes and their
breaking; allies joining; a war layer; wire headlines; census lines;
levers.

**Q&A at the start.** `design.md` §5.5 (three rounds, 9 October 2026).

**Done when.** On six seeds over three years wars start for reasons on
the wire and end at the table; a hawk's victims pay and recover; a
defender's allies join; no nation is fought to nothing; every loss has
a line.

## Phase 7: regimes and their goals

**Goal.** `design.md` §5.8: regimes with genomes of preferences and
thresholds, stability as grievance, regime change by type, a pool of
genomes bred offline.

**Scope.** `regimes.js` (stability, the regime record, the triggers,
selection and mutation at a change, the card's named traits and score);
the economy's and the products' rules reading their thresholds and
weights from the regime; `tools/evolve.py` breeding the pool in the
headless census and writing it to a data file; wire headlines for
elections, successions, coups and collapses; a stability layer; census
lines.

**Q&A at the start.** The gene list and the words for each; the
pressures and their weights in grievance; the terms and lines per
type; the fitness the breeder scores by; how large the pool is.

**Done when.** Regimes change for readable reasons; a world bred from
the pool is better governed than one with random genomes on the census;
a nation's card says in words what its government wants.

## Phase 8: balance

**Goal.** The whole plays over an evening and reads clearly throughout.

**Scope.** A census across seeds and years; tuning passes, each
recorded in `design.md` as a short entry (what moved, why, what the
census showed before and after); the lever list trimmed to what was
actually moved.

**Known gaps carried here.** Technology stalls where the economy
absorbs every worker (phase 1). A nation living on imports is capped
by its trade capacity and buys food before the energy its technology
needs; Japan fails this way on most seeds (phase 5's census). The
military and health shares are stand-ins until regimes decide them
(phase 3).

## Working rules for every phase

- Build from `design.md`. Consult the old code for mechanics only.
- One pillar, one module, one config group, one card section, one
  census line.
- Every commit is green on the smoke test.
- A pillar's reference section in `nations.md` is written before its
  numbers are tuned, so the tuning has something to be checked against.
- Dates and decisions go in `design.md`; this file changes only when a
  phase's scope does.
