# Glossary

The terms the docs, the code and the chat use, one line each, with the
code name where there is one. A term is added here the first time a
doc coins it (`process.md` §6).

## At a glance

- A **pillar** is one module that runs part of a nation's day in a fixed **slot**.
- Everything a pillar changes is a **ledger line**; the card, wire, history and census read the ledger.
- Numbers come in four kinds: **levers** (in the config panel), **K constants** (fixed), **fields** (saved) and **readouts** (runtime, never saved).
- The method has four **levels** (L1 concept, L2 technical design, L3 system design, L4 implementation and tuning), each closed by a **gate**.
- Work happens in **rounds**: a **brief** in a file, questions in chat, **decision records**, a build, a **census report**.
- A system's variables, formulas and dependencies are its **register**, checked by **doclint**.

## Summary

The first table names the parts of the world and the interface every
pillar implements. The second names the kinds of number and where each
lives. The third names the method: levels, gates, rounds, records and
data files. The fourth names the tools. Where two senses of a word
exist in the code (`K` on the bench, `probe` on the bench) the table
says which this project means on the map side.

## 1. The world and its pillars

| Term | Meaning | In code |
|---|---|---|
| pillar | A module that runs part of a nation's day; registers once, owns one slot, one ledger prefix, one config group, one card fold-out, one census line | `WORLD.registerPillar({...})` in `js/world.js`; `js/economy.js`, `products.js`, `trade.js`, `relations.js`, `war.js` |
| slot | The place in the daily order a pillar runs in; its name; an empty slot is skipped; the slot index seeds the day's random stream | `WORLD.ORDER` = weather, economy, products, trade, health, relations, war |
| the day | One tick of the world clock: fresh ledgers, every pillar in slot order (`dailyWorld` over the world, then `daily` per nation), ledgers close, `entity:day` fires | `dayTick`, `advanceDays(n)` in `js/world.js` |
| state | A nation's saved object, one per country code, plus one world object | `WORLD.COUNTRY_STATE[iso]`, `WORLD.WORLD_STATE` |
| ledger | The per-nation object (and one for the world), reset each day, into which every change to state is written | `WORLD.ledgerOf(iso)`, `WORLD.worldLedger()` |
| ledger line, ledger key | One entry `{pillar, key, label, value, unit, reason}`; the key is `<pillar>.<name>`; equal keys sum; the sums of the last 90 days are kept as history | `L.add(pillar, key, label, value, unit, reason)`, `L.get(key)`, `L.of(pillar)`, `WORLD.history(iso, key, n)` |
| reason | The one-line text on a ledger line saying why a rule did what it did; the card and the wire show it | the sixth argument of `L.add` |
| card row | One `[label, value, note]` a pillar offers for the country card's fold-out | `rows(iso, L)` hook; rendered by `js/worldui.js` |
| layer | A map colouring a pillar offers: a key, a label, a value 0..1 per nation and a hover text | `layers: [{key, label, lo, hi, legend, value(st, iso), show(st, iso)}]`; joined to `STAT_VIEWS` in `js/map.js` |
| wire, headline | The news panel on the map; a headline is one log entry a pillar sends on a transition, with a severity | `WORLD.log({sev, kind, iso, iso2, text})`; `js/wire.js`; severities small, large, massive |
| census line, census key | The numbers a pillar returns for one nation and for the world each day the census asks | `census(iso, s, L)`, `censusWorld(LW)` hooks |
| flag | A census key whose value is true or false; the report lists nations flagged in at least half the seeds | e.g. `famine`, `short`, `atWar` |
| seed, determinism | Every random draw of a day comes from a stream seeded by the world seed, the day and the slot, so a seed's census repeats and a bug reproduces | `WORLD.seed`, `dayRng(slot)`, `seedRng(iso)`; census seeds 11, 22, 33, 44, 55, 66 |
| calibration | A one-time scaling of seeded quantities so the world's totals match a stated slack over its needs; not tuning | `ECONOMY.calibrate`, `K.worldSlack` |

## 2. Kinds of number and where each lives

| Term | Meaning | In code |
|---|---|---|
| lever | A numeric default a pillar exposes as one row of its config group; the player and the tuner can move it; counted against the pillar's target (`design.md` §9) | `const LEVERS = {...}` and `ROWS`; read through `cfg()`; merged into `ENTITY_CONFIG` |
| K constant | A fixed number a pillar keeps out of the panel; promoted to a lever only by a decision record | `const K = {...}` in a pillar (the bench's `SUB[q].K` is a half-saturation constant, unrelated) |
| field, pack key | A saved state key a pillar declares as `[key, short, default]`; the short name is the save-file key; a field written but not declared fails the save round trip | `FIELDS`, `WORLD_FIELDS`; `COUNTRY_FIELDS`/`WORLD_FIELDS` tables in `js/world.js` |
| readout | A runtime value on a state, prefixed with an underscore, set by one pillar and read the same day or the next by another, the card or the census; never saved | `s._idle`, `s._paid`, `s._income`, `s._refuses`, `s._due` |
| share | One of the seven budget shares (infra, econ, research, keep, explore, military, health), summing to 1, moved one step a day by the budget rule with a reason | `s.shares`, `SHARES`, `shareStep` in `js/economy.js` |
| stand-in | A fixed rule or number holding a place until a later pillar decides it; every stand-in is a row in the gaps table | the military floor from the data row; war triggers by temperament |
| unit | The absolute unit a number is in: M people, units of a resource a day (one food unit feeds one million people a day), money | `design.md` §3 |
| formula id | The label of one formula in a system's register, cited by prose, code comments and rounds | `F1`, `F2`, per system (`trade F3`) |
| target | The number of levers a pillar aims for; going over takes a decision record | `design.md` §9 |

## 3. The method

| Term | Meaning | Where |
|---|---|---|
| level | One of four kinds of design work: L1 conceptual, L2 technical, L3 vertical system, L4 implementation and tuning | `process.md` §1 |
| gate | The checklist that closes a level: G1 framed, G2 wired, G3 decided, G4a built, G4b settled | `process.md` §1 |
| done when | The gate's checklist as written in a phase | `plan.md`, each phase |
| phase | A unit of `plan.md`: one system (or pass) with a goal, a scope, its rounds and its done-when; phases run in order | `plan.md` |
| round | One cycle of brief, questions, answers, build and report, recorded as one file; a phase has one or more design rounds (L3) and later tuning rounds (L4) | `docs/data/round-<date>-<system>-<n>.md` |
| brief | Sections 1 and 2 of a round file, written before any question is asked: the problem, the data, the options with predicted numbers | `process.md` §2 |
| option | One answer offered to a question in a round: a label, a mechanism in one line, a predicted effect as a number, a cost; one is marked recommended | round file §2 |
| decision record, decision id | One numbered entry in the decision log: question, options, choice, reason, effect; cited by id everywhere else | `docs/decisions.md`; ids `ECO-03`, `WAR-04` |
| as decided | A system's design section: the answers of its rounds and the mechanism the build follows; frozen at G3 | `design.md` §5.x |
| as built | A system's reference section: what the code does today, with each departure from the design carrying a decision id | `nations.md` §n |
| departure | A difference between as built and as decided, each a row with a decision id | reference §5 |
| gap | A shortfall accepted at a gate and carried with its owner phase | `plan.md` gaps table; reference §6 |
| worked example | A nation run through a system's formulas step by step in the mini-format, on paper before code and from a census after | `process.md` §6 |
| register | A reference section's tables of every variable (kind, unit, where set and read), every formula (id, code location) and every read or write of another system | reference §3 |
| census report | The committed file a census run writes: header, world lines, flagged nations, per-seed tables | `docs/data/census-<date>-<slug>.md` |
| tuning round | An L4 round that moves levers or constants against a prediction and closes with keep or revert | round file, level L4 |
| verdict | The one line that closes a round: keep, revert, or follow-up round | round file §5 |
| diagram | A Mermaid fenced block in a doc: a flowchart for an order of steps, a state diagram for types and transitions, a sequence diagram for an exchange; the numbers sit in a table beside it; the pillar dependency graph is generated from the code | `process.md` §6; `python tools/doclint.py --mermaid` |

## 4. The tools

| Term | Meaning | Where |
|---|---|---|
| smoke test | The headless-browser test that boots the page and checks it without a human; every commit is green on it | `python tools/smoke.py` |
| smoke flag | One boolean the smoke test's `modals` check records; all must hold; every pillar ships its own | `r.modals.<name>` in `tools/smoke.py` |
| probe | A page script run in the booted page that returns JSON; the census is one | `tools/smoke.py --eval-file`, `tools/probes/` (the bench's `probeAt` is a plate tool, unrelated) |
| census | The run of the census probe over several seeds and years, tabulated; six seeds and three years by default | `python tools/census.py` |
| doclint | The script that checks the docs' format, the decision ids, the registers against the code and the data files' headers | `python tools/doclint.py` |
| config panel | The in-game panel listing every lever of every group with its unit | `js/shell.js`, `mergePillarConfig` |
