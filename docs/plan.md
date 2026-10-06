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

## Phase 3: health and the outbreak

**Goal.** A deployed variant spreads within and between countries and
is noticed and answered by nations in proportion to what they have.

**Scope.** `health.js` (the health system's capacity, awareness,
response); the outbreak's spread within a country and across the links
with the goods and people they carry; the variant's derived parameters
and mutation on the map; what a response does to the variant, the
nation and the links; coverage's meaning; the coverage layer's new
semantics; card rows; wire headlines for first cases, awareness,
responses, clearances; the health levers.

**Q&A at the start.** `design.md` §5.2.

**Done when.** A deployment reaches a neighbour in weeks and a region
in months; a rich nation clears it and a poor one does not; a cloaked
variant is noticed later than a loud one; every step shows on the card
and the wire.

## Phase 4: pressure on the player

**Goal.** The map can end the game.

**Scope.** Tracing an outbreak to a deployment; scrutiny from the map;
the response bar's return with a stated meaning; what the player can
do on the map besides deploy; game over from the map.

**Q&A at the start.** `design.md` §5.3.

**Done when.** A careless deployment ends a game within an evening; a
careful one survives; the player can see the heat coming.

## Phase 5: relations and alliances

**Goal.** Nations have friends and enemies for reasons on the card.

**Scope.** `relations.js`; a relation per pair moved by deals, aid,
borders and war; alliances and what they share; a relations layer;
wire headlines.

**Q&A at the start.** `design.md` §5.4.

## Phase 6: war and the military

**Goal.** Shortages next to surpluses start wars; wars end; the world
has crises of its own.

**Scope.** `war.js`; the military (the deferred question of what it is
made of); what starts a war, what it costs, how it ends, what changes
hands; how local wars become global crises without being scripted; a
conflict layer; wire headlines.

**Q&A at the start.** `design.md` §5.5.

## Phase 7: balance

**Goal.** The whole plays over an evening and reads clearly throughout.

**Scope.** A census across seeds and years; tuning passes, each
recorded in `design.md` as a short entry (what moved, why, what the
census showed before and after); the lever list trimmed to what was
actually moved.

## Working rules for every phase

- Build from `design.md`. Consult the old code for mechanics only.
- One pillar, one module, one config group, one card section, one
  census line.
- Every commit is green on the smoke test.
- A pillar's reference section in `nations.md` is written before its
  numbers are tuned, so the tuning has something to be checked against.
- Dates and decisions go in `design.md`; this file changes only when a
  phase's scope does.
