# The player: career, variants, projects, saving

The player layer is what turns the two simulations into a game. It
owns the top bar, the money, the title and the attention the player
attracts; the variants that carry an entity from the bench into
storage and from storage to a plate or a country; the research
projects that pay for variants with particular traits; the career
offers that raise the title and the heat; and the save file. It is
split across three modules. `js/shell.js` holds the player record, the
titles, the variant operations, the view switch, the config panel and
`window.ENTITY`, the object every other module reaches the player
through. `js/progression.js` holds the clock the player runs on, the
offers, the projects, saving and loading, game over and new game.
`js/bounties.js` is the project generator, pure data and functions.

A note on names. The top bar shows **Scrutiny** (🎓), the baseline
attention the player's title attracts, and **Suspicion** (🔍), the
transient heat from the player's own operations. In the code these are
`player.scrutinyFloor` and `player.scrutiny` respectively. This
document uses the top bar's names.

How it connects. The bench reaches the player only from the profile
sheet (Collect: room, cost, suspicion) and when placing a variant on a
plate. The map reaches it from the deploy dialog. Both go through
`window.ENTITY`. Offers freeze the bench and the world clock while they
are up (`window.ENTITY_SET_HALTED`). Game over pauses the bench.

## 1. The player record and the top bar

Owner: `js/shell.js`.

### What it does

The record (`player`) is one object: `money`, `scrutiny` (suspicion),
`scrutinyFloor` (scrutiny), `job` (index into the titles), `salary`,
`promoStreak`, `lateralStreak`, `pendingOffer`, `careerHistory`,
`notoriety` (shown as reputation), `variants` and `maxVariants`.

The top bar shows the view toggle (Bench, Map; hotkeys B and M), money,
scrutiny, suspicion with a bar, the title, the world date, and the
buttons Career, Variants, Save, Load, Config and New game.
`updateEntityUI()` rewrites the numbers, re-renders variant storage,
and triggers game over when suspicion reaches 100.

`window.ENTITY` carries the record, the config, the titles and their
constants, the project generator and its tables, the variant
operations, `updateEntityUI`, `switchView`, `resetAll`, `resetBench`,
and re-exports of the world (`COUNTRY_STATE`, the regions,
`syncMapColors`, `onWorldMapReady`, `installMapSync`). Later modules
register their own openers on it (`openCountryModal`,
`openRegionModal`, `openDeployModal`, `maybeFireOffer`, `renderCareer`).

### What it touches

Reads `window.UI`, `window.GEO`, `window.BOUNTIES`, `window.WORLD`,
`window.C` (to snapshot an entity's stats) and `window.ENTITY_PLATES`
(to reseed the bench on a new game). Writes the top bar and the
variant storage dialog.

### Defaults and levers

| Default | Value | Where |
|---|---|---|
| starting money | 500 | `player`, `resetAll` |
| starting storage | 8 slots | `player.maxVariants` |
| starting title | Junior Analyst | `player.job = 0` |

### Assumptions built in

- There is one player and one record; nothing is per plate or per
  country.
- Money has no upper bound and no interest; suspicion is a single
  number with one threshold.
- The view toggle hides the bench rather than unmounting it; both
  views exist at all times.

## 2. Income, suspicion and the player tick

Owner: `js/progression.js` (`playerTick`).

### What it does

Every `TICK_MS` = 2000 ms, unless an offer is up:

- money += salary × `incomeFactor`;
- if suspicion is above the scrutiny floor, suspicion −= `scrutinyDecay`,
  never below the floor;
- every open project's timer counts down one tick; a project at zero
  lapses and its slot empties;
- if 30 s have passed since the last save, the game autosaves;
- the top bar and the career dialog refresh;
- every 40th tick the streaks advance and an offer is rolled (section 3).

Suspicion rises only from the player's actions: collecting, deploying,
selling and replicating variants, handing in projects, rerolling
projects, and signing an offer. It never falls below the floor the
title sets, so a higher title means a higher resting heat.

### What it touches

Reads and writes `player`; reads `ENTITY_CONFIG`. Calls
`updateEntityUI`, `renderCareer`, `renderBounties`, `saveGame`.

### Defaults and levers

Config rows (group "Player").

| Lever | Default | Meaning |
|---|---|---|
| `incomeFactor` | 0.10 | money per tick, as a fraction of salary |
| `scrutinyDecay` | 0.12 | suspicion lost per tick above the floor |

Fixed: the tick (2 s), the autosave interval (30 s), the offer cadence
(every 40 ticks, 80 s).

### Assumptions built in

- The player's clock is real time and independent of the bench's play,
  pause and speed; only an offer stops it.
- Income is flat per tick regardless of what the player does.

## 3. Titles, streaks and offers

Owner: `js/shell.js` (the tables), `js/progression.js` (the engine).

### What it does

Five titles, each with a median salary and a median scrutiny floor:

| Title | Salary | Scrutiny floor |
|---|---|---|
| Junior Analyst | 50 | 10% |
| Analyst | 120 | 16% |
| Senior Analyst | 250 | 32% |
| Lead Analyst | 420 | 48% |
| Director | 650 | 64% |

Two streaks run. The **advancement** streak (`promoStreak`) leads to a
promotion offer; the **academic interest** streak (`lateralStreak`)
leads to a poaching offer at the same title. Both advance by
`notorietyMult(reputation)` on every project handed in and every 40
player ticks; the multiplier is 1 below 25 reputation, 2 below 50, 3
below 75, 4 below 90, 5 above.

When a roll happens and no offer is pending: if the player is not yet
Director, an advancement offer fires with probability
min(0.35, promoStreak / (2 × median) × 0.35) where the median is
`PROMO_STREAK_MED[job]` = 10, 18, 35, 100 for the four promotions.
Otherwise a poaching offer fires with the same formula on the lateral
streak and `LATERAL_STREAK_MED` = 6.

An offer draws its terms from the target title: salary and floor are
the medians times (1 + N(0, 0.15)), the signing cost is
max(2, round(floor median × 0.4 × (1 + N(0, 0.2)))). The offer dialog
cannot be dismissed; it halts the bench and the world clock until
answered.

Accepting sets the title, salary and floor, adds the signing cost to
suspicion (capped at 99), resets the advancement streak on a promotion
and the academic streak in either case, and on a promotion rerolls all
three project slots. Declining only records the offer. The career
dialog shows the current terms, both streaks as progress bars, and the
last twelve offers of a fifty-entry record.

### What it touches

Reads and writes `player`. Opens `#offerModal` and `#careerModal`.
Calls `window.ENTITY_SET_HALTED` (the bench) and
`forceRefreshBounties`.

### Defaults and levers

None of these is a config row.

| Constant | Value | Where |
|---|---|---|
| `TITLES` | the table above | `js/shell.js` |
| `PROMO_STREAK_MED` | 10, 18, 35, 100 | `js/shell.js` |
| `LATERAL_STREAK_MED` | 6 | `js/shell.js` |
| `OFFER_CHANCE_CAP` | 0.35 | `js/shell.js` |
| salary and floor spread | 15% | `rollOffer` |
| signing cost | 40% of the floor median, 20% spread, at least 2 | `rollOffer` |
| career record | 50 kept, 12 shown | `js/progression.js` |

### Assumptions built in

- A title is a ladder of five; there is no demotion and no ending
  beyond Director.
- Reputation only ever rises (projects add it, capped at 100) and only
  speeds the streaks.
- Offers come from the game's clock, not from anything the player did
  except hand in projects.

## 4. Variants

Owner: `js/shell.js` (collect, replicate, sell, discard, expand, decay,
storage), `js/sheet.js` (the Collect button), `js/host.js` (placing),
`js/worldui.js` (deploying).

### What it does

A variant is an entity's genome preserved off the bench:
`{ id, name, plateId, profile {g0, g1}, tenant {g0, g1} | null, stats,
tenantStats, potency, created, used }`. The name is
`<Mode>-<plate>-<four characters>`. `stats` is a snapshot of the
derived stats at collection (mode, type, diet, the three masks, the
cloak count, the seven traits, upkeep, division threshold, lifespan);
the project predicates test this snapshot. Potency starts at 1.0 and
only falls.

**Collect** (profile sheet). Needs a free slot and the money. Cost is
`createCostBase` + `createCostPerVariant` × variants held; suspicion is
`createScrutinyBase` + floor(held / 2). The entity, and its tenant if it
has one, is removed from the plate; a landlord and tenant are archived
as one pair.

**Place** (storage → bench). Free and non-consuming. Arms placement;
the next click on any plate drops the organism at that tile with
energy = its bank × 0.5 × potency, the tenant alongside at the same
potency. Escape cancels.

**Replicate.** Needs a free slot. Cost is `replicateCostBase` + 15 ×
times the original was used. The copy has potency
max(0.3, original − 0.15), zero uses, and "(copy)" in its name.

**Sell.** Price is 100, plus 75 for shield, 60 dormancy, 50 adaptor,
40 reserve, 80 brewer, 30 recycler, 35 lodging, 60 more for lodging
with a tenant, and 20 per diet substrate when there are more than two.
Suspicion is 10 + floor(price / 20). The variant is gone.

**Discard.** Confirm, and it is gone.

**Expand storage.** Two slots per purchase, to a cap of 20. Cost is
`expandCostBase` + `expandCostPerSlot` × (slots − 8).

**Decay.** Every 5 s each variant above 0.1 potency loses
`variantDecayAmount` with probability `variantDecayChance`.

**Deploy** (map; see `map.md` §5 for the dialog). Needs potency ≥ 0.25,
an agent country and the money. Cost is `deployCostBase` +
`deployCostPerVariant` × variants held; suspicion is
`deployScrutinyBase` + floor((1 − potency) × 10), plus 3 if the country
is already covered. The country is marked covered at 5% or its current
level with the variant's profile. A variant above 0.4 potency loses
0.15 (floor 0.25) and counts a use; at or below 0.4 it is consumed.

Storage opens from the top bar (Variants) and shows a one-time hint,
each variant as a card with its swatch, name, potency, mode, type,
diet, tenant, uses and traits, and the four actions.

### What it touches

Reads and writes `player.variants` and `player.maxVariants`; charges
money and suspicion. Collect calls `C.statsOf`; Place dispatches
`entity:place`, which `js/host.js` listens for; Deploy writes a
country's record in `WORLD.COUNTRY_STATE` and repaints the map.
`ENTITY.onVariantsChanged` lets the project list re-check its matches
after any change.

### Defaults and levers

Config rows (group "Variant costs").

| Lever | Default | Meaning |
|---|---|---|
| `createCostBase` | 50 | collect, base |
| `createCostPerVariant` | 10 | collect, per variant already held |
| `createScrutinyBase` | 2 | collect, suspicion base |
| `replicateCostBase` | 75 | replicate, base |
| `deployCostBase` | 200 | deploy, base |
| `deployCostPerVariant` | 25 | deploy, per variant held |
| `deployScrutinyBase` | 5 | deploy, suspicion base |
| `expandCostBase` | 150 | expand, base |
| `expandCostPerSlot` | 50 | expand, per slot above eight |
| `variantDecayChance` | 0.006 | decay roll per variant per 5 s |
| `variantDecayAmount` | 0.001 | potency lost per successful roll |

Fixed: the sell price table and its suspicion; replicate's 15 per use
and its 0.15 potency loss with a 0.3 floor; the storage cap of 20; the
0.25 deploy threshold, the 0.4 consume threshold, the 0.15 deploy loss;
Place's half-bank energy.

### Assumptions built in

- A variant is a genome and a snapshot; it has no history of what it
  did on the bench or the map.
- Potency is one number that scales energy on placement and the
  suspicion of a deployment; it has no effect on the map after that.
- Placing is free, so storage doubles as an unlimited reserve of
  anything collected once.
- A country holds one profile; deploying over it replaces it.

## 5. Research projects

Owner: `js/bounties.js` (generation), `js/progression.js` (slots,
hand-over, rerolls).

### What it does

Three project slots sit under variant storage. Each project names a
university, a title (a noun from the clauses' category and a verb),
one to three **clauses**, a difficulty **D** with a tier, three
rewards (money, reputation, suspicion) and a timer.

**The predicate catalogue** (`PRED_DEFS`): each trait (shield,
dormancy, adaptor, reserve, brewer, recycler, lodging); each mode and
Type A; diet counts (single, dual, 3+, 4+, full-spectrum); for each of
the eight channels, the epitope visible, the epitope cloaked, targets
it, brews it; cloak counts (3+, 5+, fully cloaked); "does not target
Ax" for a live hunter, "does not brew Ax" and "does not brew Fu" for a
live brewer. Every predicate has a difficulty weight in `DIFF`, from
0.08 (brews Fu) to 12.01 (fully cloaked).

**Generation** (`generateBounty(titleIdx)`): a target D is drawn in the
title's range (`TITLE_D_RANGE`: 0.5–1.5, 0.8–3.0, 2.0–5.0, 3.5–7.5,
6.0–12.0). Predicates with 0.5 ≤ D ≤ 1.3 × the range's top are
eligible. Up to max(1, min(3, round(target / 2))) clauses are drawn,
each weighted by exp(−|D − 0.8 × remaining budget|) and spending its D
(×1.1 after the first) from the budget. The project's D is the sum,
×1.1 if there is more than one clause; above 13 the draw is abandoned.

Tiers: trivial below 0.5, easy below 1.5, moderate below 3, hard below
5.5, brutal below 9, legendary above.

Rewards, with (m, n, s) a random split of one: money =
round(80 × 2^(0.55 D) × (0.6 + 0.8 m)); reputation =
round(min(100, 9 D) × (0.5 + n)); suspicion = round(D × (0.5 + 3 s)).
The timer is round((240 + 1560 × min(D, 12) / 12) / 2) player ticks:
four minutes for a trivial project, thirty for a legendary one.

**Hand-over.** A project is ready when a variant in storage passes
every clause (tested on the stats snapshot). The hand-over picker lists
the matching variants, lowest potency and oldest first, and the chosen
one is consumed. Money, reputation (capped at 100) and suspicion are
applied, the slot empties, the streaks advance by `notorietyMult`, and
an offer is rolled. A project that lapsed while the picker was open is
refused.

**Refresh.** ↻ rerolls all three slots for `bountyRefreshScrutiny`
suspicion, with a confirmation if any project is still open. A
promotion rerolls for free. Lapsed slots stay empty until a reroll.

### What it touches

Reads `player.variants` (to match) and `player.job` (to generate);
writes money, reputation, suspicion, the streaks and the slots. Pure
generation in `js/bounties.js`; everything stateful in
`js/progression.js`. Projects are saved by their clause keys and
rebuilt on load.

### Defaults and levers

Config row: `bountyRefreshScrutiny` (default 1, group "Project
rerolls"). Everything else is a constant in `js/bounties.js`: `DIFF`,
`TITLE_D_RANGE`, the tier thresholds, the reward formulas, the timer
formula, the slot count (3), the clause cap (3), the D cap (13).

### Assumptions built in

- A project tests a variant's snapshot, never anything it did; the map
  plays no part.
- Difficulty is additive over independent clauses with a flat 10%
  premium for combination.
- Universities are flavour; none remembers the player.
- Three slots, always; the title changes the difficulty, not the
  count.

## 6. Saving, loading, new game, game over

Owner: `js/progression.js`.

### What it does

**Save.** One key in localStorage, `entity_save_v3`, holding JSON
version 8:

```
{ v: 8, t,
  world:     { seed, day, log },                 // WORLD.packWorld()
  player:    { money, scrutiny, job, salary, scrutinyFloor, promoStreak,
               lateralStreak, notoriety, careerHistory, variants, maxVariants },
  countries: { iso: { c, lv, pr } },             // WORLD.packAll()
  bounties:  [ { id, name, desc, university, D, tier, money, notoriety,
                 scrutinyBump, expiryTicks, ticksLeft, clauseKeys } | null ×3 ] }
```

The Save button writes it with a toast; the tick autosaves silently
every 30 s. The bench plates are not saved.

**Load.** The Load button confirms, then accepts versions 2 to 8. A v8
save makes a fresh world on the saved seed and unpacks the world and
the countries over it. Older saves (v2 to v7) get a new world with only
their coverage (`c`, `lv`, `pr`) laid over it, because the fields that
the old nation simulation wrote no longer exist. A v2 save has no
career fields and resets to the junior baseline. Projects are rebuilt
from their clause keys through `PRED_BY_KEY`.

**New game.** Confirms, deletes the save, and `resetAll()`: money 500,
suspicion 0, the first title's salary and floor, streaks and reputation
0, an empty eight-slot storage, a fresh world (new seed, day 0, every
country clean), and every bench plate reseeded (`resetBench`: a new
seed per plate, seven colonies on the two large plates and five on the
small ones). The project slots are rerolled.

**Game over.** When suspicion reaches 100 (checked on every top-bar
refresh), the Busted dialog shows final money, title, variants in
storage, variants deployed (the sum of their uses) and countries
covered; the bench is paused. Start over is a new game. Suspicion is
the only route to game over today; the old response meter's call to
`window.ENTITY_GAMEOVER` is gone with the meter.

### What it touches

Reads and writes `player`, the three project slots and localStorage;
calls `WORLD.newWorld`, `packWorld`, `unpackWorld`, `packAll`,
`unpackAll`, `ensureCountry`, `isAgent`, `syncMapColors`;
`ENTITY.resetAll`, `resetBench`, `refreshVariants`, `updateEntityUI`.

### Defaults and levers

Fixed: the key, the version, the autosave interval (30 s), the
accepted version range, the fifty-entry career record.

### Assumptions built in

- One save slot, in the browser's storage; clearing site data clears
  the game.
- A save is a snapshot of state, not a replay; the bench is not in it.
- Old saves keep the player and the coverage and lose everything else.

## 7. The config panel

Owner: `js/shell.js` (`buildEntityTune`).

### What it does

⚙ Config opens a dialog with one numeric input per `ENTITY_CONFIG` key,
in five groups: Player, Variant costs, Project rerolls, Links, World
clock. An edit applies at once; a link lever also refreshes the link
capacities. Edits are not saved and reset on reload. This is the map
and player side's counterpart to the bench's tuning panel (`Tune`),
which edits the levers in `C` and is described in `bench.md`.

### What it touches

Reads and writes `ENTITY_CONFIG`; calls `LINKS.refreshCapacity`.

### Defaults and levers

The complete key list, with defaults, is the union of the tables in
this document and in `map.md` §3 and §4: 24 keys.

### Assumptions built in

- Every tunable number on the map and player side is a config key; a
  number that is not is fixed by design or an oversight.
- Config is global and not part of a save.
