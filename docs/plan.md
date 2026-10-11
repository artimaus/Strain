# The plan

The phases that build the map side from `design.md`, one system each,
in order. How a phase runs, its gates and its rounds are in
`process.md`; this file says where each phase stands, what it covers,
and what done means for it. It changes only when a phase's scope or
status does.

## At a glance

| phase | goal | status | gate | rounds and data |
|---|---|---|---|---|
| 0 foundations | the scaffolding every pillar uses | built | G4a | FND-01 |
| 1 economy | nations with people, reserves, developments, a budget | built, 5 Oct | G4a | ECO-01 to 09; [census](data/census-2026-10-05-phase1.md) |
| 2 trade | goods and people move on the links | built, 6 Oct | G4a | TRD-01 to 12; [census](data/census-2026-10-06-trade.md), [after the sea links](data/census-2026-10-06-trade-sea.md) |
| 3 end products | military and health as levels | built, 7 Oct | G4a | PRD-01 to 08; [before](data/census-2026-10-07-products-before.md), [after](data/census-2026-10-07-products-after.md) |
| 4 the outbreak pass | the variant spreads and is answered | deferred | | OUT-01 |
| 5 relations | views, pacts, aid, loans | built, 9 Oct | G4a | REL-01 to 10; [census](data/census-2026-10-09-relations.md) |
| 6 war | the army, wars, the peace table, tributes | built, 10 Oct | G4a | WAR-01 to 11; [census](data/census-2026-10-10-war.md) |
| 7 regimes | genomes of preferences, regime change, a bred pool | next; its first round restarts under `process.md` | | REG-01 |
| 8 balance | the whole plays over an evening and reads clearly | later | | gaps table below |

## Summary

Six phases are built and each closed on a six-seed, three-year census
that is now a file. The outbreak is its own pass, deferred until the
nations are turbulent on their own. Regimes come next and replace the
stand-in pressures that drive budgets and wars today. Balance tunes
the numbers last, with the gaps listed at the bottom. Phases 0 to 6
were run before the gates were written; their done-when lines below
are what closed them, and G4a's checklist applies from phase 7 on.

## Phase 0: foundations

- Goal: the scaffolding every pillar uses, so the pillars stay small.
- Scope: the per-nation ledger; the daily order with a hook per pillar; the seeded daily streams; the census probe and its driver; the config panel grouped per pillar; the card with a section per pillar; pack rows and save version 9; the `nations.md` skeleton.
- Rounds: none beyond the architecture decisions (ARC-01 to ARC-06).
- Done when: the probe runs on an empty world and prints the day; the save round trip covers the new rows; the smoke test stays green.

## Phase 1: the economy

- Goal: `design.md` §4 in full: nations with people, water, reserves, infrastructure, economy, academia, technology, a treasury and a budget, changing only through ledger lines.
- Scope: `economy.js`: seeding from the data rows and the map's area; weather; needs; labour needs first; capture with diminishing returns and its energy cost; eating and famine; upkeep, unpaid days, decay; money; the budget shares with their reasons; research; stores; births and deaths. The card's ledger section; layers for money per head, technology and resource strain; wire headlines for famine, a unit stopping, a share swinging, a ceiling raised; fifteen levers; census lines.
- Rounds: the phase 1 round of 5 October on a prototype (`design.md` §4.7; ECO-05 to ECO-09).
- Done when: on six seeds over three years no nation vanishes or explodes; every shortage, idle count and decay on a card is explained by its lines; the budget shares move and their reasons read true; a drought shows in food and in the wire.

## Phase 2: trade and movement on the links

- Goal: the links carry goods and people; surpluses meet shortfalls; the idle and the unhoused move.
- Scope: `trade.js`; the links' capacity gets its meaning; export capture; asks and offers; one world price per resource; deals; comfort; migration along the links; the card's trade rows; a trade layer; wire headlines for deals and migrations; levers; census lines. Debt was deferred to phase 5 (TRD-04, REL-07).
- Rounds: `design.md` §5.1 (TRD-01 to TRD-12), 6 October.
- Done when: two neighbours, one short and one in surplus, end up trading on their own; a nation with no reserves of a resource lives on imports; people move from a crowded nation to an empty one; the world's resource balance is a census line.

## Phase 3: end products

- Goal: `design.md` §5.7: military and health as levels built by the budget, with embodied technology and population, upkeep per resource and named decay; technology's upkeep and flat decay reworked.
- Scope: `products.js` in the slot after the economy: the two levels, their running averages, the cost per point, upkeep and decay lines; the budget shares and their stand-in pressures; health's effect on births and deaths; technology's energy upkeep and fade; card rows; layers for military and health; wire headlines; census lines; levers.
- Rounds: the design round of 6 October and the progression round of 7 October (`design.md` §5.7; PRD-01 to PRD-08).
- Done when: on six seeds over three years levels rise where the budget feeds them and fall where it does not; a fast-growing nation's levels dilute visibly; a nation that stops building falls behind its own technology; every decay has its line.

## Phase 4: the outbreak pass

- Goal: the variant spreads within and between countries on the trade flows, health detects and responds, the map presses on the player.
- Scope: deferred as a pass of several phases (OUT-01), with its rounds (`design.md` §5.2, §5.3) held when it starts. The coverage layer keeps its present meaning until then.
- Rounds: none yet.
- Done when: to be set at its first round.

## Phase 5: relations and alliances

- Goal: nations have friends and enemies for reasons on the card.
- Scope: `relations.js`; a view per direction moved by deals, aid, refusals, people taken in and a threat assessment; pacts after a season; aid in a famine; loans at interest with default; trade reading the views; a relations layer; wire headlines; census lines; levers.
- Rounds: two design rounds of 8 October and the round after building of 9 October (`design.md` §5.4; REL-01 to REL-10).
- Done when: on six seeds over three years pacts form among neighbours that trade and lapse for reasons on the wire; a hawkish nation's coldest views are its weaker, richer neighbours; the nations with no reserves live on loans and food aid instead of starving; every move of a view has a line.

## Phase 6: war and the military

- Goal: shortages next to surpluses start wars; wars end; the world has crises of its own.
- Scope: `war.js`; the army as a job (conscripts, wages from the military share, before the economy in the labour order); wars of need, greed and enmity across land borders; attrition, deaths, flight, closed borders, damage; the weekly peace table; tributes and their breaking; allies joining; a war layer; wire headlines; census lines; levers.
- Rounds: three design rounds of 9 and 10 October and the round after building (`design.md` §5.5; WAR-01 to WAR-11).
- Done when: on six seeds over three years wars start for reasons on the wire and end at the table; a hawk's victims pay and recover; a defender's allies join; no nation is fought to nothing; every loss has a line.

## Phase 7: regimes and their goals

- Goal: `design.md` §5.8: regimes with genomes of preferences and thresholds, stability as grievance, regime change by type, a pool of genomes bred offline.
- Scope: `regimes.js` (stability, the regime record, the triggers, selection and mutation at a change, the card's named traits and score); the economy's, relations' and war's stand-in rules reading their weights and lines from the regime; `tools/evolve.py` breeding the pool in the headless census and writing it to a data file; wire headlines for elections, successions, coups and collapses; a stability layer; census lines.
- Rounds: the first design round (the gene list and its words, the grievance pressures and weights, the terms and lines per type, the breeder's fitness, the pool's size) is written as `data/round-<date>-regimes-1.md` under `process.md` §2 before it is asked.
- Done when: G4a; regimes change for readable reasons; a world bred from the pool is better governed than one with random genomes on the census; a nation's card says in words what its government wants.

## Phase 8: balance

- Goal: the whole plays over an evening and reads clearly throughout.
- Scope: tuning rounds (`process.md` §2, level L4) on the gaps below and on what the censuses show, each a round file with a census before and after; the lever lists trimmed to what was moved.
- Rounds: one per gap or finding.
- Done when: G4b for every round; no gap in the table below is open without a decision record saying why.

## Known gaps

| gap | seen in | owner phase | id |
|---|---|---|---|
| Technology stalls where the economy absorbs every worker | [census 5 Oct](data/census-2026-10-05-phase1.md) | 8 | ECO-02 |
| A nation living on imports is capped by its trade capacity and buys food before the energy its technology needs; Japan fails on most seeds | [census 9 Oct](data/census-2026-10-09-relations.md) | 8 | REL-10 |
| The military and health budget shares are stand-ins from the data row and the deaths line | design.md §5.7 | 7 | PRD-06 |
| Temperament and the war triggers are stand-ins from the row's authority and freedom; a hawk at 1.0 rotates through its weaker neighbours | [census 10 Oct](data/census-2026-10-10-war.md) | 7 | REL-05, WAR-09 |
| No war of need or enmity has started: the world is in surplus and land neighbours are friends by the relations baseline | [census 10 Oct](data/census-2026-10-10-war.md) | 8 | WAR-09 |
| The military mean fell from 54 to 50 with wages and attrition | [census 10 Oct](data/census-2026-10-10-war.md) | 8 | WAR-06 |

## Working rules

- Phases run in order; nothing in a later phase starts before the earlier one is done (PRC-01).
- Everything else is `process.md`: the gates, the round protocol, the decision records, the data files, the register, the writing rules, the checks.
