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

Not built. Phase 1 (`plan.md`); the design is `design.md` §4.

## 2. Trade

Not built. Phase 2; its questions are `design.md` §5.1.

## 3. Health and the outbreak

Not built. Phase 3; its questions are `design.md` §5.2.

## 4. Pressure on the player

Not built. Phase 4; its questions are `design.md` §5.3.

## 5. Relations and alliances

Not built. Phase 5; its questions are `design.md` §5.4.

## 6. War and the military

Not built. Phase 6; its questions are `design.md` §5.5.
