# The bench: the Entity simulation

The bench is the laboratory half of Strain. It is five plates, A to E, each a square grid of W × W tiles masked to a disc (A, B and C are 84 tiles wide; D and E are 112). Every tile inside the disc holds a sample of the *medium*: five resources, named only "Resource 1" to "Resource 5" in `SUB` (`js/core.js`), each a concentration capped at `CAP`, plus up to eight *brew* slots, each a channel mask with a concentration. Living on the tiles are *entities*. Each plate is simulated in its own Web Worker, built from the source text of `js/core.js` and `js/worker.js`; the page keeps the plates in step, paints what the workers send back and hands them the player's actions as a queue of ops.

An entity is two 32-bit words, `g0` and `g1`, together called its profile. Nothing else about it is inherited. `statsOf(g0, g1)` in `js/core.js` derives every number the simulation uses from those 64 bits: upkeep, bank, the energy at which it divides, its senescence timescale, what it eats, what it presents, what it hunts and what it brews. The worker keeps only runtime state beside the profile (energy, age, whether it is asleep, a bite cooldown, a pending move). Two bits set the frame. *Type* is Type B or Type A and never changes; *mode* is the lifestyle toggle within the type. The mode index is `(modeBit << 1) | type`, so Type B entities are Swarms or Blooms and Type A entities are Networks or Showers: the four lifestyles, each with its own upkeep, bank, division tempo, senescence timescale and rule for where its children go. One entity occupies one tile; an entity carrying the lodging trait may host one tenant of the opposite type on the same tile.

The player works the plates with six tools (`js/host.js`): Supply pours a resource, Brew doses a brew channel, Streak stamps a fresh random profile of a chosen type, Wipe clears tiles, Transfer lifts up to forty entities and sets them down on any plate, and Inspect reads a tile and opens the profile sheet (`js/sheet.js`). The sheet's Collect button turns the inspected entity, with its tenant if it has one, into a *variant* in the player's storage and culls it from the plate; Place, chosen from storage, arms the bench so that the next click drops the variant back onto a plate. The Tune panel (`js/tune.js`) exposes every numeric constant in `C` and pushes an edit to all five workers while they run.

How it connects. The bench publishes `window.C` (the core constants and functions), `window.ENTITY_PLATES` (the five plate records, each with its op queue), `window.ENTITY_CLOCK` (`speed` and `running`; the world clock in `js/world.js` follows the bench's play/pause/speed through it), `window.ENTITY_SET_HALTED` (job offers in `js/progression.js` freeze the bench through it), `window.SHEET`, `window.TUNE` and `window.UI`. It reads `window.ENTITY` in exactly two places: the sheet, for Collect (cost, scrutiny, storage room, `collectFromEntity`), and `js/host.js`, to find the variant being placed. Nothing in the bench knows about the map.

## 1. The genome and the derived stats

### What it does

`F` in `js/core.js` maps each field to `[word, shift, width]`. `get(g0, g1, field)` and `set(g0, g1, field, value)` read and write a field; `popcount` counts bits.

| Field | Word | Bits | Meaning |
|---|---|---|---|
| mode | g0 | 0 | lifestyle toggle within the type |
| type | g0 | 1 | 0 = Type B, 1 = Type A; immutable |
| spareK | g0 | 2 | inert |
| diet | g0 | 3–7 | one bit per resource, bit q for `SUB[q]` |
| huntB, huntA | g0 | 8, 9 | hunting kits, one per prey type |
| shield, dormancy, adaptor, reserve, brewer | g0 | 10–14 | flat traits |
| recycler | g0 | 15 | digestion leaks a by-product |
| lodging | g0 | 16 | opens the tile to a tenant |
| spareB | g0 | 17 | inert |
| spare0 | g0 | 18–31 | inert |
| id | g1 | 0–7 | the channels it presents |
| tgt | g1 | 8–15 | the channels its hunt locks onto |
| brew | g1 | 16–23 | the channels its brew carries |
| spare1 | g1 | 24–31 | inert |

The eight channels are named `CH_NAME` (Ax, Bo, Cq, Dn, Er, Fu, Gs, Ht) and coloured by `CH_RGB`. The spare fields are padding: `makeProfile` in `js/worker.js` fills them at random, `adapt` never reaches them, and `profileColor` masks them out through `PHEN0` and `PHEN1`.

`statsOf(g0, g1)` returns one object per distinct profile, cached in `statCache` (up to 4096 entries; `tune()` clears it). It carries:

- `type`, `mode` (0 Swarm, 1 Network, 2 Bloom, 3 Shower), `diet` and `dietN`, `huntB`, `huntA`, `hunt` (either kit), `shield`, `dormancy`, `adaptor`, `reserve`, `brewer`, `recycler`, `lodging`.
- `id` and `cloakN = 8 − popcount(id)`; `tgt` and `tgtN`; `brew` and `brewN`.
- `huntLive = hunt && tgt ≠ 0`; `brewLive = brewer && brew ≠ 0`. A kit without a target mask, or a brewer with an empty brew mask, is carried but cannot fire.
- `bill` (the itemised upkeep rows), `upkeep` (their sum), `gear` (the part waived while digesting), `bank`, `divE`, `remains`, `senT`, `divCost`, `divP`, and the three synergies `scrubs`, `vault`, `spills`.

The subset rule. A bite lands on prey only if every bit of the hunter's `tgt` is presented by the prey: `(tgt & ~prey.id) == 0`. A brew slot with mask `m` harms an entity only if `(m & ~id) == 0`. One hidden bit therefore escapes any mask that needs it; the wider a mask, the fewer victims satisfy it. Hiding a bit is a cloak bit and is paid for; widening a mask is priced through the "off" bits it does not carry (below). An empty mask satisfies nothing, which is why `huntLive` and `brewLive` demand a non-zero mask. Potency runs the other way: a bite drains `BITE_DMG × (1 + MASK_POT × (tgtN − 1))` and a brew slot deals `conc × DOSE_DMG × (1 + BREW_POT × (popcount(m) − 1))`, so a narrow mask hits more victims for less and a wide one fewer victims for more.

Pricing. Each row of the bill is a `BITCOST` cell for the entity's mode, and the counted families climb a ladder: `cmult(fam, n) = LADR[fam]^(n − 1)` for n > 0, else 0. The rows, in the order the sheet shows them:

- mode base: `MODES[mode].upkeep`.
- one specialty per diet bit q: `BITCOST[ENZ_KEY[q]][mode] × LADR.enz^(appN − 1)`, where `appN = dietN + huntB + huntA`; the kits count towards the enzyme ladder.
- kit · Type B / kit · Type A: `BITCOST.kitB[mode]` or `BITCOST.kitA[mode]`, times the same `LADR.enz^(appN − 1)`. Both go into `gear`.
- cloak: `cloakN × BITCOST.cloakBit[mode] × LADR.cloak^(cloakN − 1)`.
- target focus: with `off = 8 − tgtN`, `off × BITCOST.tgtOffBit[mode] × LADR.tgt^(off − 1)`, multiplied by `LATENT_CH` when the hunt cannot fire (`!huntLive`). When live it also goes into `gear`. The row is omitted when `off` is 0 or the cost is 0 (`LATENT_CH` = 0).
- recycler: `BITCOST.recycleEnz[mode] × dietN`, only when the entity carries both a recycler and at least one specialty. No ladder.
- lodging: `BITCOST.lodging[mode]`, flat.
- brew breadth: with `off = 8 − brewN`, `off × BITCOST.brewOffBit[mode] × LADR.brew^(off − 1)`, times `LATENT_CH` when the brew cannot fire (`!brewLive`).
- shield, dormancy, adaptor, reserve, brewer: `BITCOST[trait][mode]`, flat.

A mask that cannot fire still bills at `LATENT_CH` of its full off-bit price, so a target mask carried without a kit, or a brew mask without a brewer, is not free storage. Fresh profiles from `makeProfile` start with `tgt = 255` and `brew = 255` (no off bits) unless they are hunters or brewers, so a new scavenger has no latent bill.

Economy: `bank = MODES[mode].bank × (reserve ? RESERVE_BANK : 1) × (1 + HUNT_BANK × (huntB + huntA))`; `divE = bank × MODES[mode].divThresh`; `remains = upkeep × REMAINS_K`; `scrubs = shield && lodging`; `vault = reserve && dormancy && shield`; `spills = recycler && dietN > 0 && huntLive`; `senT = MODES[mode].senT × (vault ? VAULT_AGE : 1)`; `divCost = MODES[mode].divCost × (vault ? VAULT_COST : 1)`; `divP = MODES[mode].divChance × (dormancy ? DORM_DIV : 1) × (recycler && dietN ? RECYCLE_DIV : 1) × (vault ? VAULT_DIV : 1)`.

Two helpers describe the economy of a resource: `income(q, c) = SUB[q].rate × c / (c + SUB[q].K) × SUB[q].yield` is the energy per tick an entity takes from concentration c at full rate, and `breakEven(upkeep, q) = upkeep × SUB[q].K / (SUB[q].rate × SUB[q].yield − upkeep)` is the concentration at which that income meets a given upkeep (Infinity when it never can).

Kin. `KIN0` masks the type, mode and diet bits of `g0` and `KIN1` the id bits of `g1`; two entities are kin when both masked words match. Hunters never bite kin and Networks share energy only with kin.

### What it touches

- `js/core.js` runs twice: on the page, where `ENTITY_CORE_SRC()` is called at load and `window.C` is its export, and inside every worker, where the same text is the first half of the Blob. The copies share nothing at run time; a tune edit is applied to each separately (section 9).
- `statsOf` is called by the worker for every occupied tile every tick (hence the cache), by `frame()` and `probeAt` indirectly, by the host (`paintTile`, `placeVariantOn`), by the sheet, and by `js/shell.js` (`statsSnapshot` when a variant is collected).
- `income` and `breakEven` are used by the worker (`makeProfile`, `richness`), by `bootAssert`, and the sheet reimplements `income` inline for its uptake estimate.
- `statCache` and `COLC` (section 6) are cleared by `C.tune`.

### Defaults and levers

- `MODES`: Swarm upkeep .0005, bank 1, divThresh .75, divChance .027, broodSize 1, divCost .08, senT 500, mutScale 1.4. Network .000225, 2, .325, .2, 1, .07, 3600, .85. Bloom .0002, 3.33, .4, .16, 4, .12, 2100, 1.3. Shower .0006, 2.6, .7, .04, 1, .16, 2500, 1. `broodSize` and `place` are not levers.
- `BITCOST`: 17 rows × 4 modes, all in the lever reference.
- `LADR`: enz 1.875, cloak 1.6, tgt 1.38, brew 1.25.
- `LATENT_CH` .12; `RESERVE_BANK` 1.5; `HUNT_BANK` .125; `REMAINS_K` 40; `VAULT_DIV` .5; `VAULT_COST` .5; `VAULT_AGE` 1.33; `DORM_DIV` .5; `RECYCLE_DIV` 1.36; `MASK_POT` .18; `BREW_POT` .08.
- Not levers: `F`, `ENZ_KEY`, `MODE_NAME`, `CH_NAME`, `CH_RGB`, `KIN0`, `KIN1`.

### Assumptions built in

- A profile is exactly two words with a fixed layout; a new field has to be carved out of the spare bits, and `bootAssert` insists every bit of both words is mapped.
- Type never changes, and each type has exactly two lifestyles; a third lifestyle has no bit to live in.
- Upkeep is a per-tick sum that depends only on the genome and the mode: not on the medium, age, crowding or anything environmental.
- Energy is one scalar; there are no separate nutrients, and the five resources differ only in rate, K, yield and mobility.
- Prices are geometric in count (the ladders) and the same `BITCOST` cell applies on every plate and every tile.
- The same eight channels serve as identity, target and brew; a channel has no meaning of its own.
- Stats are a pure function of the profile, which is what makes the cache safe.

## 2. Plates and the medium

### What it does

`reset(msg)` in `js/worker.js` builds a plate from `W` and a seed: `R = W / 2`, a `mulberry32(seed)` random stream, and every array. A tile at (x, y) is inside the disc when `dx² + dy² ≤ R² × 0.92` with `dx = x − R + .5`, `dy = y − R + .5` (`inside`); the host repeats the same test as `dishInside` for brush previews. For each inside tile, `nbs` and `nbn` list its inside eight-neighbours. `order` is the visiting order, reshuffled every tick.

Resources. `medium` is a `Float32Array(N × NS)` with `NS = 5`; tile i's resource q is `medium[i × NS + q]`. `SUB[q]` gives each resource a `rate`, half-saturation `K`, energy `yield`, `polymer` and a colour. `CAP` (2.6) is the ceiling for every resource on every tile; whatever is poured, leaked or dropped above it is lost. Uptake is Michaelis–Menten (`scavengeAt`): from concentration c an entity grazes `g = min(c, rate × rateMul × c / (c + K))` and banks `g × yield`. `polymer` is immobility: a resource diffuses at `DIFF_RATE × (1 − polymer)`, so Resources 4 and 5 (polymer 1) never move. The names are generic, but the enzyme rows of `BITCOST` (`enzGlu`, `enzSuc`, `enzPro`, `enzCel`, `enzNec`) and the panel tips call them glucose, sucrose, protein, cellulose and necrose in that order; Resource 5 is where remains go, and remains rot into Resource 3.

Brews. Each tile has `SLOTS = 8` brew slots: `cmask` (a channel mask per slot) and `cconc` (its concentration, at most 4). `depositC(tile, mask, amt)` adds into the slot that already carries that exact mask; otherwise it takes the first empty slot; otherwise it replaces the weakest slot if the deposit is stronger than it; otherwise the deposit is lost. A zero mask or zero amount is ignored.

Initial medium. For each resource, three value-noise lattices of 3, 6 and 12 cells (smoothstep interpolation, random values from the plate's stream) are blended at .62, .26 and .12; the result v becomes `max(0, v × 1.35 − .52)^2.1 × 2.6 × gain`, with gain 2.4 for Resources 1 and 3, .45 for Resources 2 and 4, and 1 for Resource 5; anything above .004 is added to the tile, capped at `CAP`. Brews start empty.

Seed colonies. `nF = msg.seedN ?? 5` colonies are planted. The host sends 7 for the 112-wide plates and 5 for the 84-wide ones at start-up, and `resetBench` in `js/shell.js` (New game) does the same; the ↻ button on a plate sends `seedN: 0`, so it yields a fresh medium with no colonies. Each colony picks a centre inside the middle 60% of the plate, a random type, one profile from `makeProfile(type, centreTile)`, and places 5 to 9 copies within ±2 tiles of the centre (up to 60 tries), each with energy `bank × .6`.

`makeProfile(type, tile)` makes a fresh profile: the given type; a random mode bit; a diet of the single resource with the best `income` at that tile (or a random one of the first four if nothing is edible), with a 30% chance of one extra random resource; an `id` that is the OR of three random bytes (dense: each bit set with probability 7/8); `tgt = 255` and `brew = 255`; with 25% chance one hunting kit (B or A, even odds) and then a sparser `tgt` (the AND of two random bytes, OR one guaranteed bit); shield, adaptor and reserve each with 10% chance; with 10% chance a brewer with a brew mask drawn the same sparse way; dormancy with 70% chance; random spare bits.

Feeders. `FEEDERS` lists two feeders, each acting on resource `q`:

- `drop` (Resource 2): a drip clock. The next drip is `tick + sampleGap`, where `sampleGap = max(1, round(gapMed × (84² / W²) × exp(sigma × gaussian)))`, a log-normal gap scaled so that a bigger plate drips proportionally more often. A drip scatters `dropsMin + floor(rnd^1.5 × (dropsMax − dropsMin + 1))` droplets (skewed low). Each droplet lands on a random inside tile (20 tries), draws a size factor `f = dropFloor + dropSpread × rnd^dropPow`, has radius `rad = dropR × (.7 + .6 × f)` and peak `amp × f`, and adds `peak × exp(−d² / rad²)` to every inside tile within `1.8 × rad`, capped at `CAP`. The first drip is scheduled at `round(rnd × gapMed × 84² / W²)`.
- `seep` (Resource 4): adds `rate` to every inside tile below `CAP`, every tick.

The tuning panel estimates the feeders' income (section 9); at the defaults it reads about 305.8 µe per tile per tick (225.8 from the drop, 80 from the seep), against mode upkeeps of 500, 225, 200 and 600 µe/t.

### What it touches

- Everything here is worker state: `medium`, `cmask`, `cconc`, `inside`, `nbs`, `nbn`, `order`, `rnd`. `reset` also zeroes every entity array and `POP`.
- The host's supply and brew ops write into the medium (`applyOps`), `scavengeAt`, `emitRing`, `die` and the diffusion pass read and write it, `probeAt` reads a tile for the footer and the sheet, and `frame()` paints it.
- `C.FEEDERS`, `C.SUB`, `C.CAP` are read live, so a tune op changes feeding and uptake from the next tick.

### Defaults and levers

- `SUB`: rate .012/.009/.008/.007/.009; K .16/.11/.3/.55/.06; yield 1.15/.9125/1.33/1/.8; polymer .05/.1/.55/1/1. Names and colours are not levers.
- `CAP` 2.6. `NS` is excluded from the levers.
- `FEEDERS.0` (drop): gapMed 10, sigma 1.75, dropsMin 2, dropsMax 9, dropR 2.75, amp .26, dropFloor .16, dropSpread 2, dropPow 1.7. `FEEDERS.1` (seep): rate .00008. `q` and `kind` are not levers.
- `DIFF_RATE` .25 and `DIFF_EVERY` 6 (section 3).
- Not levers: the disc fraction .92, the noise octaves and the shaping constants (.62/.26/.12, 1.35, .52, 2.1, 2.6, the gains), the colony count and size, `SLOTS`, the slot cap of 4, and the plate widths in `PLATES` (`js/host.js`).

### Assumptions built in

- The disc is a fixed mask; outside tiles are void, never diffused into, drawn as a flat dark colour.
- A resource is a scalar concentration per tile. The medium has no temperature, pH, moisture or light, and no time-dependent change other than feeding, uptake, diffusion and the rot of remains.
- One cap for every resource; surplus vanishes rather than piling up.
- Eight brew slots per tile and a ninth distinct brew displaces the weakest: brews are scarce per tile by construction.
- There are exactly five resources; `RECYCLE_TABLE`, `AGAR_W` and `bootAssert` all assume it.
- Feeding is spatially uniform: droplets land anywhere on the disc and the seep covers every tile. There is no edge, no gradient and no source tile.
- The five plates differ only by width, seed and what the player does to them.

## 3. The life step

### What it does

`onmessage` in `js/worker.js` first applies the message's ops (`applyOps`), then, for a `step` message, runs `stepOnce()` `n` times; an `idle` message applies ops and reports without stepping. `stepOnce()` runs in this order:

1. **Feeders.** The seep and the drip clock, as in section 2.
2. **Brew decay.** Every slot is multiplied by `COMP_DECAY`; a slot at or below 1e-4 is cleared.
3. **Shuffle.** `order` is reshuffled (Fisher–Yates) so no tile has a standing priority.
4. **Landlord pass.** Each occupied tile i, in that order, with `s = statsOf(ep0[i], ep1[i])`:
   - *Move arrival.* If a move is pending (`emv[i]`) and its countdown `emvK[i]` reaches zero, the claim on the destination is released. If the destination holds an entity that `canHost` this one and `lodge` accepts it, the mover becomes that tile's tenant and leaves its own tile. If the destination is free, the mover's whole state is copied there and the old tile is vacated. If the destination is occupied and cannot host, the move is simply lost and the entity carries on where it is. While in transit (countdown still running) the entity neither hunts, eats, brews, divides nor moves again, but it does take brew damage, pay upkeep and age.
   - *Cooldown.* `ecd[i]` is decremented if set.
   - *Hunt.* Needs a kit (`s.hunt`), awake, not moving, no cooldown. Neighbours are tried from a random start. A neighbour is skipped if empty, if it is kin (`KIN0`/`KIN1`), if the hunter lacks the kit for the prey's type, or if the subset rule fails (`!huntLive || (tgt & ~prey.id)`). If the prey has a shield and `rnd < SHIELD_BLOCK`, the attempt ends for this tick with no cooldown. Otherwise the bite drains `min(prey.e, BITE_DMG × (1 + MASK_POT × (tgtN − 1)))`; the hunter banks `drain × xf`, capped at its bank, with `xf = BITE_XFER_SHIELD` against a shield and `BITE_XFER` otherwise; a spiller (`s.spills`) drops `drain × (1 − xf) × SPILL_FRAC` as remains on the prey's tile; prey at or below zero dies leaving `prey.upkeep × REMAINS_K`; the hunter's cooldown becomes `BITE_CD` and it does not scavenge this tick.
   - *Feed.* If it did not bite, is awake, not moving and has a diet: `scavengeAt(i, i, s, hosting ? .5 : 1)` grazes its own tile, at half rate while it hosts a tenant. Every `REACH_EVERY` ticks (staggered by tile index, `(tick + i) % REACH_EVERY == 0`) it also grazes each of its four unoccupied cardinal inside neighbours, at full rate. Income is capped at the bank.
   - *Recycling* happens inside `scavengeAt`, per resource grazed: a recycler with a diet leaks `g × RECYCLE_FRAC × SUB[q].yield / SUB[w].yield` into waste resource `w = RECYCLE_TABLE[diet − 1]` on the same tile; otherwise, when the grazed resource is Resource 4 and Resource 1 is not in the diet, `BASE_RECYCLE_FRAC` of it leaks into Resource 1 the same way. Deposits are capped at `CAP`. The table maps every non-full diet to a resource the diet does not eat (for single-resource diets: Resource 1 → 5, 2 → 3, 3 → 2, 4 → 5, 5 → 4); a full diet maps to −1 and wastes nothing.
   - *Brew emission.* A live brewer, awake and not moving, calls `emitRing(i, brew, EMIT_RATE)`: a quarter of `EMIT_RATE` into each of the four cardinal inside neighbours, never its own tile.
   - *Brew damage.* A scrubber (`s.scrubs`) first multiplies every slot on its tile by `1 − SCRUB_FRAC` (`scrubCell`). Then every slot whose mask passes the subset rule against the entity's `id` adds `conc × DOSE_DMG × (1 + BREW_POT × (popcount(mask) − 1))`, except a slot whose mask equals the entity's own brew mask exactly, if it is a brewer. The total is multiplied by `SHIELD_SOAK` for a shield carrier and taken from energy. Damage does not consume the brew. This applies to sleeping and moving entities too.
   - *Upkeep.* `bill = (upkeep − (ecd && gear ? gear : 0)) × (hosting ? .5 : 1)`; energy loses `bill × (asleep ? DORM_UPK : 1)`; age increments.
   - *Death.* Energy at or below zero, or a senescence roll `rnd < (age / senT)^AGE_P / senT`, calls `die(i, s.remains)`. `die` releases any move claim, adds `remains / SUB[4].yield` to Resource 5 on the tile (capped), and either promotes the tenant to landlord (keeping the tenant's age, waking it, resetting its cooldown) or vacates the tile.
   - *Dormancy.* A dormancy carrier falls asleep when awake, below `DORM_SLEEP × divE`, and `richness(i, diet) < upkeep`; it wakes when asleep and `richness ≥ WAKE_MARGIN × upkeep`. `richness` is the summed potential `income` of its diet at the tile. A sleeper goes no further this tick.
   - *Division.* If not moving, `e ≥ divE` and `rnd < divP`. The first child placed rolls `adapt()` once (every child of this event shares the genome), charges the parent `divCost`, and sets `share = e × BATCH_FRAC / broodSize`; each placed child gets `share`. `freeNb()` picks a free, unclaimed neighbour weighted 1 for orthogonal and `DIAG_W` for diagonal, and if there is none returns the first neighbour that `canHost` the parent's type. Placement by mode:
     - *Swarm* (mode 0): one child into `freeNb()`, lodging as a tenant if that is what came back; nothing if neither.
     - *Network* (mode 1): first energy sharing with kin, then filament growth. Kin neighbours are weighted `openness^SHARE_PULL`, where openness is 1 plus the kin's free unclaimed neighbours. `tryShare` runs with probability `kinN / nbn` and equalises half the difference with the chosen kin, holding back `SHARE_KEEP` of it when the sharer has an open side; transfers of `SHARE_EPS` or less are skipped, and a transfer is capped by the receiver's bank. If sharing happened, that is the whole event. Otherwise `grow(k)`: a fresh tip (`edir < 8`) grows forward along its heading with probability `FILA_RUN`, else ±45°, falling back to straight, and is then marked grown whether or not it succeeded; a grown segment (`edir ≥ 8`) sprouts a perpendicular branch with probability `FILA_BRANCH`. A free target with more than `FILA_MAXNB` occupied neighbours is refused; a target that `canHost` receives a lodged child instead (its own `adapt` roll, share `(e − divCost) × BATCH_FRAC`). A child placed by growth inherits the growth direction as its heading. If nothing grew and the segment is already grown, sharing is tried once more.
     - *Bloom* (mode 2): `freeNb()`; a host gets one lodged child; a free tile gets the first child, and then up to `broodSize − 1` more are placed one at a time on a random free, unclaimed tile adjacent to the litter so far (the connected frontier), stopping when the frontier is empty.
     - *Shower* (mode 3): three tries at a random angle and distance 4 to 8 tiles; a free inside tile takes the child, a host takes a lodged child, anything else is the next try.
   - *Chemotaxis* (Swarm only, and only if it did not divide, did not bite and has no cooldown). The gain of a neighbour is `(richness(j) − richness(i)) / (√2 if diagonal)`; candidates are free, unclaimed tiles, plus hosts a non-hunter could lodge in. The best gain above `MOVE_GATE` is chosen. If none clears the gate and energy fell this tick, the best neighbour by gain is chosen anyway, ties broken at random. A hunter then, with probability `HUNT_ROAM`, replaces that choice with a random candidate (prowling only overrides a choice; it does not create one). The chosen tile is claimed (`eclaim`), and the move takes `transitTicks = max(1, round(MOVE_TICKS × (√2 if diagonal)))`.
5. **Tenant pass.** Each tile with a tenant, in the same shuffled order, with the tenant's stats: a pending move arrives if the destination is free (the tenant becomes a landlord there, keeping its age) and is lost otherwise; if not moving and dieted, it grazes its own tile at half rate (no neighbour reach); scrubbing and brew damage exactly as for landlords; a live brewer emits at half `EMIT_RATE`; it pays half upkeep (no gear waiver, no dormancy) and ages; it dies by energy or senescence through `tenantDie`, which drops remains and clears the tenancy; a Swarm tenant moves by the same gate-and-fallback rule into free tiles only, with its own half-rate richness as the baseline and no prowling; if it neither moves nor is moving and `e ≥ divE` and `rnd < divP`, it places one child (its own `adapt` roll, cost `divCost`, share `e × BATCH_FRAC / broodSize`) on the first free, unclaimed neighbour from a random start, whatever its mode. Tenants never hunt and never sleep.
6. **Diffusion pass,** every `DIFF_EVERY` ticks:
   - Remains rot: on every tile, `d = Resource5 × REMAINS_DECAY × DIFF_EVERY` leaves Resource 5 and `d × SUB[4].yield × REMAINS_EFF / SUB[2].yield` joins Resource 3 (capped).
   - Substrate diffusion, per resource with `rate = DIFF_RATE × (1 − polymer) > 0`: each inside tile moves `rate × (mean of its inside eight-neighbours − itself)` towards that mean, from a snapshot (`diffuse`). Tiles at the rim have fewer neighbours, so the scheme is not exactly mass-conserving there.
   - Brew diffusion: each slot above 1e-4 sends `conc × DIFF_RATE / 4` to each of its four cardinal inside neighbours through `depositC` and keeps the rest; polymer does not apply, and a share that finds no slot at the receiver is lost.

Two edge cases the code has that a reader may not expect: in `child()` the division cost is charged when the genome is rolled, before a lodging attempt, so a Swarm or Bloom whose only option was a host that then refuses (the child would be a hunter) pays `divCost` and places nothing; and Wipe, Transfer's lift and the cull op clear a tile directly without releasing a move claim the removed entity held on a neighbouring tile, so that tile counts as claimed (no division or movement into it) until something is spawned on the vacated tile, whose stale `emv` entry `spawn` then releases. Whether either is intended is unclear.

### What it touches

- Per-tile landlord state: `occ`, `ep0`/`ep1`, `ee`, `eage`, `eslp`, `ecd`, `edir`, `emv`/`emvK`, `eclaim`; tenant state: `tocc`, `tp0`/`tp1`, `te`, `tage`, `tmv`/`tmvK`. `POP` is maintained by `spawn`, `lodge`, `die`, `tenantDie` and the ops, but every reply recounts `occ + tocc`.
- `spawn(i, g0, g1, e)` is the one entry for a new landlord: it evicts a tenant on that tile, releases any claim the tile's previous occupant held, zeroes age, sleep and cooldown, and picks a random heading. `lodge(j, g0, g1, e)` is the one entry for a tenant and refuses hunters.
- Reads every scalar lever through `C` and `statsOf`; calls `C.adapt` at every division.
- The ops (section 7) run before the ticks of the same message.

### Defaults and levers

- Hunting: `BITE_DMG` .2, `MASK_POT` .18, `BITE_XFER` .88, `BITE_XFER_SHIELD` .48, `SHIELD_BLOCK` .585, `SPILL_FRAC` .5, `BITE_CD` 7, `HUNT_ROAM` .85.
- Feeding and recycling: `REACH_EVERY` 10, `RECYCLE_FRAC` .7, `BASE_RECYCLE_FRAC` .4; `RECYCLE_TABLE` is not a lever.
- Brews: `EMIT_RATE` .042, `COMP_DECAY` .99, `DOSE_DMG` .004, `BREW_POT` .08, `SHIELD_SOAK` .22, `SCRUB_FRAC` .16.
- Upkeep, death, dormancy: `DORM_UPK` .55, `AGE_P` 3, `REMAINS_K` 40, `DORM_SLEEP` .25, `WAKE_MARGIN` 1.1.
- Division: `BATCH_FRAC` .4, `DIAG_W` .55, `SHARE_EPS` .0025, `SHARE_PULL` .825, `SHARE_KEEP` .3, `FILA_RUN` .675, `FILA_BRANCH` .4, `FILA_MAXNB` 5, and the `MODES` columns.
- Movement: `MOVE_GATE` .00018, `MOVE_TICKS` 6.
- Medium: `DIFF_EVERY` 6, `DIFF_RATE` .25, `REMAINS_DECAY` .002, `REMAINS_EFF` .55.
- Not levers: the halving while hosting, the four-neighbour reach, the Shower's three tries and 4–8 tile radius, the 1e-4 slot floor, the senescence form, the eviction and inheritance rules.

### Assumptions built in

- One entity per tile, plus at most one tenant; there is no stacking, size or biomass.
- Entities update one after another in a random order within a tick, each seeing the current state, so order effects exist but are unbiased on average.
- A tick is the unit of time with no physical meaning; speeds and the world clock are layered on outside the worker.
- Energy is the only currency: food, damage, remains and division are all movements of the one scalar.
- The only interactions are competition for substrate, bites and brews; there is no signalling, no cooperation beyond kin sharing in Networks, no direct displacement.
- Remains are a resource (Resource 5), not an object; a corpse is instantly a concentration.
- Diffusion is the only transport of resources and brews, and a Swarm in transit holds both tiles.
- Death by age is a hazard, not a limit: the form `(age / senT)^AGE_P / senT` is fixed, only its scale and exponent are levers.

## 4. Landlords and tenants

### What it does

`canHost(j, type)` in `js/worker.js`: tile j must hold an entity, have no tenant, carry no move claim, and its occupant must carry the lodging trait and be of the opposite type. `lodge(j, g0, g1, e)` installs the tenant with the given energy and age 0 and refuses any profile with a hunting kit. A tenant arrives in one of five ways: a Swarm walking into a host (non-hunters only; `enterable` in the chemotaxis step), a child lodged by a Swarm or Bloom when no neighbour is free, a child grown by a Network into a host, a Shower child landing on a host, or a `drop` op whose record carries a tenant (Transfer and Place both preserve pairs).

Halved rates. The landlord grazes its own tile at half rate and pays half upkeep while it hosts; its neighbour reach and its brew emission are not halved. The tenant grazes its tile at half rate, pays half upkeep and emits at half rate. Both parties pay for and act on brews independently: each one's own `scrubs` trait scrubs the shared tile, and each takes the damage its own `id` admits.

Inheritance. When a landlord dies, its remains still drop and the tenant takes the tile as landlord, keeping its energy and age. When a tenant dies, `tenantDie` drops its remains and clears the tenancy. A tenant that moves out (Swarm tenants only) becomes a landlord on the free tile it reaches. `spawn` on a tile with a tenant evicts the tenant without remains (Streak does this). Lift takes both, Collect pair archives both, cull removes both, Wipe clears both.

The sheet shows a tenant section, the footer readout a second line, and `frame()` blends the landlord's colour with 40% of the tenant's.

### What it touches

- `canHost` is called in the move-arrival, `freeNb`, Network `grow`, Shower placement and chemotaxis (`enterable`) paths; `lodge` in those plus the `drop` op.
- `tocc`, `tp0`/`tp1`, `te`, `tage`, `tmv`/`tmvK` are the tenant's state; `die`, `tenantDie`, `spawn`, lift, cull and wipe all touch `tocc`.
- Pairs cross the bench boundary intact: `lift` records carry `tenant`, `placeVariantOn` in `js/host.js` builds one from `variant.tenant`, and `collectFromEntity` in `js/shell.js` stores `tenant` and `tenantStats`.

### Defaults and levers

- `BITCOST.lodging` per mode (100/80/175/225 µe/t) and `SCRUB_FRAC` .16 for the scrubs synergy.
- The .5 factors on scavenging, upkeep and tenant emission are hard-coded.

### Assumptions built in

- Exactly one tenant, always of the opposite type; a Type B cannot lodge a Type B.
- Hunters never lodge, so a tenant never bites; a landlord hunter may host.
- The tenant needs no trait of its own; only the landlord's lodging bit matters.
- The tenant does not sleep, does not reach neighbours and cannot wake or lodge anyone itself.
- A tenant of any mode divides one child at a time into a free neighbour, and a Bloom tenant still splits its share by its brood size.
- No energy passes between landlord and tenant; the arrangement is halved rates and a shared tile, nothing more.

## 5. Adaptation

### What it does

`adapt(g0, g1, rnd)` in `js/core.js` is rolled once per division event, on the parent's profile, to make the child's. `ADAPT` has five groups, each with a probability `p` of firing per birth:

- `mode` (p .00008): flips the mode bit. Scaled by `ADAPT_BOOST` for an adaptor but not by `mutScale`.
- `id` (p .022, mean 1.875) and `tgt` (p .018, mean 2.2): `flipInField` flips `drawN` distinct random bits of that 8-bit field.
- `diet` (p .02, mean 1.55, loci diet, huntB, huntA: 7 bits) and `pool` (p .017, mean 1.95, loci shield, dormancy, adaptor, reserve, brewer, brew, recycler, lodging: 15 bits): `drawN` flips, each at a position chosen uniformly across the concatenated loci; the same position may be hit twice and so flip back.

`drawN(rnd, mean)` is a geometric draw: starting at 1, it keeps incrementing while `rnd < 1 − 1 / mean`, capped at 8, so the mean number of bits is about `mean`. For every group but `mode`, the firing probability is `p × boost × MODES[mode].mutScale`, where `boost = ADAPT_BOOST` for an adaptor and 1 otherwise, and the mode is the parent's. `type` and the spare fields are in no group; `bootAssert` fails if any group reaches `type`. The brew mask adapts at the pool's rate alongside the trait bits, while id and tgt have their own.

### What it touches

- Called by the worker in `child()` (once per event, shared by a Bloom brood), in Network `grow` for a lodged child, and in the tenant division. Nowhere else: adaptation happens at birth only.
- `drawN` and `flipInField` use the plate's own random stream.
- `MODES[].mutScale` and `ADAPT_BOOST` are read live, so a tune edit applies to the next birth.

### Defaults and levers

- `ADAPT.mode.p`, `ADAPT.diet.p`/`mean`, `ADAPT.id.p`/`mean`, `ADAPT.tgt.p`/`mean`, `ADAPT.pool.p`/`mean` (nine levers); `ADAPT_BOOST` 2.75; `MODES[].mutScale` 1.4/.85/1.3/1.
- Not levers: the loci lists, the cap of 8 bits per draw, the 40-try limit in `flipInField`.

### Assumptions built in

- Mutation happens only at birth and only by bit flips; there is no recombination, no horizontal transfer, no mutation during life.
- Type never mutates.
- Flip positions are uniform within a group; a group does not know which bits are expensive.
- Rates do not depend on the environment, energy or age, only on the adaptor trait and the parent's mode.
- Every child of one Bloom division is identical.
- Spare bits are never flipped, so they carry no hidden drift.

## 6. Rendering and colour

### What it does

`profileColor(g0, g1)` in `js/core.js` gives every profile one colour, cached in `COLC` (cleared when it passes 8000 entries or on a tune edit). A hash of the phenotype bits (`PHEN0`, `PHEN1`, spares excluded) yields a jitter `j` in ±.22. A ramp position `d = .70 + (dietN − 2.5) × .26 − (idN − 4) × .09 + j` is remapped for non-hunters by mode (Network: `(d − .62) × .8 + .40`; Swarm: `d^.72`; Bloom: smoothstep into .14–.58), clamped to 0–1, and read off `RANGES[mode][hunt ? 1 : 0]` with `lerpStops`. The ramps: Swarm greens and, hunting, reds; Network pale greys and, hunting, white; Bloom yellow–orange–brown and, hunting, tan–brown; Shower pink–purple and, hunting, blues.

An accent then moves the colour in HSL by a second hash of diet and id: hue by `(u1 − .5) × 2 × acc × turn`, saturation to `S × (1 + (u2 − .35) × .55) + tintSat × (.55 + .9 × u2)`, lightness to `L × (1 + (u3 − .5) × .30)` capped at `lMax`. `acc` is `TINT_NET` for Network scavengers, `TINT_BLOOM` for hunting Blooms and `TINT_BASE` otherwise; `turn` is `TINT_TURN` for Network scavengers and 46° otherwise; `tintSat` is `TINT_SAT` for Network scavengers and 0 otherwise; `lMax` is `TINT_LMAX` when `tintSat` is set, else 1.

`frame()` in `js/worker.js` composes one RGBA pixel per tile. Outside tiles are (7, 10, 11). An inside tile starts at `AGAR_BASE` (6, 14, 17), adds `AGAR_W[q] × min(c, CAP)` for each resource above .004, and adds `AGAR_TOT_B × total` to blue. If the tile's brews sum above .02, the colour is pulled towards violet (150, 110, 190) by `min(1, sum / 3) × .5`, the same wash for every channel. An occupied tile blends in `profileColor` (60/40 with the tenant's colour if hosting) at alpha keyed to `t = min(1, e / divE)`: `.93 + .07 × (t − .18) / .82` at or above the knee .18, else `.18 + .75 × (t / .18)^1.5`, so a starving entity fades. Sleeping is not shown.

`probeAt(i)` returns the hovered tile: `x`, `y`, the five resource values, and the entity (`g0`, `g1`, `e`, `age`, `asleep`, and its `tenant` with `g0`, `g1`, `e`, `age`) or null. The host paints the frame with `putImageData` on a W × W canvas that CSS scales up with `image-rendering: pixelated`, and draws the brush preview on a second canvas at `OV` = 6 pixels per tile.

### What it touches

- `profileColor` is called by `frame()`, the sheet's header swatches, and the variant list in `js/shell.js`; `COLC` and `statCache` are cleared together by `C.tune`.
- `frame()` runs only when the message asked for a draw (`draw: true`); in the single-plate layout only the shown plate is drawn.
- `probeAt` feeds the footer readout (`paintTile`) and `SHEET.open`.

### Defaults and levers

- `TINT_BASE` .28, `TINT_NET` .375, `TINT_BLOOM` .4, `TINT_SAT` .1825, `TINT_TURN` 360, `TINT_LMAX` .9625.
- Not levers: `RANGES`, `CH_RGB`, `AGAR_W`, `AGAR_BASE`, `AGAR_TOT_B`, the ramp formula, the knee .18, the violet wash, the 46° turn, the brew threshold .02.

### Assumptions built in

- Colour is a function of the profile alone; energy affects only alpha, age and sleep not at all.
- One pixel per tile; there is no sub-tile detail and no indication of pending moves.
- The primary visual split is hunter versus scavenger within each mode; traits other than the kits, the diet count and the id density are invisible.
- A tenant shows only as a 40% blend; the pair is one pixel.
- All eight brew channels share one wash, so the picture cannot tell brews apart.
- The medium's colour is a linear blend of resource weights; it saturates at `CAP` and shows nothing above it.

## 7. The host: plates, tools, hotkeys, clock, workers

### What it does

`js/host.js` runs `C.bootAssert()` first (section 11); a failure is written in red into `#hint` and the tool hints stop updating. `PLATES` lists A, B, C (W 84) and D, E (W 112); `shownPlate` starts at D (the single-plate layout and its tabs are in section 10). For each plate it builds a figure with the main canvas (W × W), the ring canvas (W × `OV`), a caption with the population and a ↻ button, and a record carrying the worker, the op queue `ops`, the seed, hover state, the last probe, `inflight` and `gotMsg`.

Tools (`TOOLS`, buttons in `#tools`, hotkeys 1–6 in this order): Supply, Brew and Streak carry a menu (`MENUS`: the five resources, the eight brew channels as "Brew-Ax" and so on, Type B / Type A); the button shows the current pick and clicking the active menu tool reopens its menu. Brushes are discs of tiles (`discCells`, radius `BRUSH`: supply 2, brew 4, wipe 4, streak 1, with .5 slack); a stroke starts on pointerdown with pointer capture and continues on pointermove, pushing one op per sample. The ring canvas previews the brush as a 14% fill with an outline in the tool's colour.

- **Supply:** op `{ op:"supply", q, cells, amt: SUPPLY_AMT }`, adds .25 to the picked resource on each inside cell, capped.
- **Brew:** `{ op:"brew", ch, cells, amt: DOSE_AMT }`, deposits 1.2 of the single-channel mask `1 << ch` through `depositC`.
- **Streak:** `{ op:"streak", type, cells, sid }`. The worker makes one profile per stroke id (`strokeProfile`, keyed by `sid`, from `makeProfile` at the first cell) and spawns it on every inside cell of the stroke with energy `bank × .5`, overwriting whatever was there. The reply reports the count, mode and type, shown in `#carry`.
- **Wipe:** `{ op:"wipe", cells }` clears landlord and tenant on each cell, no remains.
- **Transfer:** with nothing carried, a click pushes `{ op:"lift", at, r: LIFT_R, max: 40 }`; the worker collects up to 40 occupants within radius 4 (row-major), each with its tenant, and removes them; the host holds them as `carry`. A click on any plate then pushes `{ op:"drop", at, orgs }`; the worker places them on free inside tiles in expanding square rings around the click, up to radius 12, lodging tenants, and reports `dropped` and `dropRequested` ("Nowhere to set them down" when none fit). This is the only bridge between plates.
- **Inspect:** hovering shows the probe in the footer (`paintTile`: the five resources, the entity, its tenant, plate, tile and tick). A click opens the sheet from the last probe if it is for the hovered tile and holds an entity; otherwise `wantInspect` is set and the sheet opens when that tile's probe arrives.

The ↻ button draws a new seed and sends a reset with `seedN: 0`: a fresh medium, no colonies. Placement of a variant: `js/shell.js` dispatches `entity:place` with a variant id (and switches to the bench view); `armPlacement` looks it up in `ENTITY.player.variants`, sets `body.placing` and the carry text; the next click on a tile runs `placeVariantOn`, which pushes a `drop` op with one record (`e = bank × 0.5 × potency`, age 0, awake; tenant likewise). Escape, or choosing any tool, cancels.

Hotkeys (`hotkey` from `js/ui.js` ignores keys typed into fields and browser chords): Space toggles play/pause unless a button has focus; 1–6 select tools; Escape closes an open menu and cancels a placement even from a field. B and M switch views and live in `js/shell.js`.

Clock. `running` (Pause/Play button), `speed` (the select: 1, 2, 4 or 8, default 4) and `halted` (set by `window.ENTITY_SET_HALTED`). `window.ENTITY_CLOCK` exposes `speed` and `running && !halted`; `js/world.js` accumulates real time × speed into days from it. The burger button toggles the header drawer on narrow screens.

`pump()` runs on every animation frame (nothing while the document is hidden). For each plate not already waiting on a reply it posts `{ t: "step" | "idle", id, n: speed, probe: hoverTile, ops, draw }`: `step` when running and not halted, `idle` otherwise (ops and probes still apply); `n` ticks per frame; `draw` is false for plates hidden by the single-plate layout. So a plate advances `speed` ticks per frame at most, each at its own worker's pace. Captions are refreshed at most every 500 ms from `pop`.

Workers. `blobSrc = ENTITY_SRC_BODY(ENTITY_CORE_SRC) + "\n" + ENTITY_SRC_BODY(ENTITY_WORKER_SRC)`: the two function bodies read back as text and handed to a Blob URL, so the worker needs no fetch and works over `file://` and in a sandboxed frame. If constructing a `Worker` throws, `workersBlocked` is set and every plate gets a `FakeWorker`, which runs the same source on the page through `new Function` and replies through `queueMicrotask`. A 1600 ms watchdog per plate swaps in a `FakeWorker` and re-sends the reset if no message has arrived; because the watchdog also returns early once `workersBlocked` is set, only the first plate to time out is swapped, and whether that is intended is unclear. A worker error is written in red into `#hint`.

Messages, both ways:

- Page → worker: `{ t:"reset", id, W, seed, seedN }`; `{ t:"step"|"idle", id, n, probe, ops, draw }`. Ops: `supply`, `brew`, `wipe`, `streak`, `lift`, `drop`, `cull { at, g0, g1 }`, `tune { path, value }`.
- Worker → page: `{ id, tick, pop, probe }` always, plus `rgba` (a transferred buffer) when drawn, `streak`/`streakType`/`streakMode`, `dropped`/`dropRequested`, `lifted` (an array of records), `culled`/`cullMissed`. The host reads all of these except `culled` and `cullMissed`.

### What it touches

- Owns `#tools`, `#pop` (the menu), `#bench` figures, `#plateTabs` buttons, `#hint`, `#tile`, `#carry`, `#play`, `#speed`, `#burger`/`#drawer`.
- Publishes `window.ENTITY_PLATES` (last line), `window.ENTITY_CLOCK`, `window.ENTITY_SET_HALTED`; listens for `entity:place`.
- Calls `SHEET.open(entity, medium, plate, tile)`; reads `window.ENTITY.player.variants` for placement; `js/tune.js` and `js/shell.js` (`resetBench`) push into `plate.ops` and `plate.w`.
- `isNarrow()` reads `body.narrow`, set by `js/layout.js`.

### Defaults and levers

- None of the host's constants are panel levers: `PLATES` widths, `BRUSH`, `LIFT_R` 4, lift max 40, `OV` 6, `SUPPLY_AMT` .25, `DOSE_AMT` 1.2, the drop radius 12, the watchdog 1600 ms, the caption interval 500 ms, the seed counts 5 and 7, the speed options.

### Assumptions built in

- Five plates with two sizes, fixed at load; plates cannot be added, resized or renamed.
- Every plate runs the same rules and the same lever values; a tune edit is global.
- A frame drives the ticks: the simulation's wall-clock rate depends on the display's refresh and the worker's speed, not on a timer.
- Tools act through ops applied at the start of the next worker message; nothing on the page writes plate state directly.
- Transfer and placement preserve the profile, energy, age and sleep of what they carry; they are the only way an entity crosses plates.
- Streak overwrites; it is a stamp, not an inoculation into free space.

## 8. The profile sheet and Collect

### What it does

`SHEET.open(entity, medium, plate, tile)` in `js/sheet.js` builds `#sheetbody` from the probe record and opens the modal (`UI.modal("sheet")`, dismissable by Close, Escape or the backdrop). Sections:

- **Head:** the colour swatch, mode name, type, specialties and what it hunts.
- **Profile:** `p0` and `p1` in hex, then one row per field from `P0F` and `P1F` with a bit strip (`bits`), the value (mode name, type, yes/no, or `n/width`) and an explanatory note. Diet bits take the resource colours, channel bits the channel colours, traits `GENE_HUE`.
- **Surface:** three channel strips, "presents" (id), "focus" or "targets · latent" (tgt), "emits" or "brew · latent" (brew), the subset-rule note, and notes for Latent (which family cannot fire and why, with `LATENT_CH` as a percentage), Scrubber (`SCRUB_FRAC`), Vault (`VAULT_DIV`, `VAULT_COST`, `VAULT_AGE` and the resulting `senT`) and Spiller (`SPILL_FRAC`).
- **Upkeep:** the bill rows from `statsOf`, in µe/t (values under .01 are shown as µe/t, larger ones as plain numbers), each with its source.
- **Economy:** bank, divide at (`divE`), divide chance (`divP` as a percentage, with the multipliers named), divide cost, remains, energy now; if a medium was passed, "uptake (potential)" (the summed `income` of the diet at the tile) and "net (uptake − upkeep)"; age with the hazard formula.
- **Tenant:** if present, its swatch, mode, type, diet, energy and age.

Two of the sheet's own readings differ from the worker: for a sleeper it multiplies potential uptake by `DORM_UPK`, whereas a sleeping entity in the worker takes no uptake at all; and the bank row's source text names only `MODES.bank` and `RESERVE_BANK`, while the value includes the `HUNT_BANK` factor. Some row notes are loose paraphrases (the shield row says it "halves" damage; the levers are `SHIELD_BLOCK` and `SHIELD_SOAK`).

Collect. `renderSheetFoot` reads `window.ENTITY`: the button is disabled when storage is full (`player.variants.length ≥ player.maxVariants`) or the player cannot afford `ENTITY.collectCost()`; it shows the cost and the suspicion from `ENTITY.collectScrutiny()`, and "Collect pair" with a note when a tenant is present. Clicking awaits `ENTITY.collectFromEntity(entity, plate.id)` (`js/shell.js`): it checks room and money again, charges the cost, adds the scrutiny, and stores a variant with `profile { g0, g1 }`, `tenant { g0, g1 }` or null, snapshots of both stats, `potency` 1.0, a name `Mode-Plate-xxxx`, and returns it. On success the sheet pushes `{ op:"cull", at: tile, g0, g1 }` to the plate, closes and toasts. The worker culls only if the tile's occupant still has that exact profile (it may have died, divided or moved since the probe), removing the tenant with it and leaving no remains. The cost and scrutiny formulas (`createCostBase` 50 + 10 per stored variant; scrutiny 2 + half the stored count) live in `ENTITY_CONFIG` in `js/shell.js`, not in the bench.

### What it touches

- Reads `C.statsOf`, `C.profileColor`, `C.F`, `C.get`, `C.popcount`, `C.SUB`, `C.CH_NAME`, `C.CH_RGB`, `C.MODE_NAME` and the levers it quotes (`LATENT_CH`, `SCRUB_FRAC`, `VAULT_*`, `SPILL_FRAC`, `DORM_UPK`, `AGE_P`, `MODES`).
- Reads `window.ENTITY.player`, `collectCost`, `collectScrutiny`, `collectFromEntity`; pushes a `cull` op into `plate.ops`.
- Owns `#sheet`, `#sheetbody`, `#sheetfoot`, `#close`; publishes `window.SHEET` with `open` and `close`. Opened only by `js/host.js`.

### Defaults and levers

- The sheet has no levers of its own; it displays the core's. The Collect economics are `js/shell.js` configuration.

### Assumptions built in

- A sheet is a snapshot: it shows the probe as it was when opened, and the cull is guarded by genome, not by identity.
- Collecting is destructive and a pair is indivisible.
- The variant keeps only the two profiles, snapshots and a potency; energy, age and sleep are not stored, and a placed variant starts at half bank × potency.
- The sheet trusts `window.ENTITY` to exist for Collect and hides the footer otherwise.

## 9. The tuning panel

### What it does

`js/tune.js` enumerates `C.levers()`: a walk of `C` to depth 3 that collects every numeric leaf, skipping the top-level names in `NOT_LEVERS` (`F`, `KIN0`, `KIN1`, `CH_RGB`, `CH_NAME`, `RANGES`, `RECYCLE_TABLE`, `ENZ_KEY`, `MODE_NAME`, `NS`), the leaves in `NOT_LEVER_LEAVES` (`q`, `broodSize`, `type`), functions, typed arrays and numeric arrays longer than 8. That is 191 levers: 28 in `MODES`, 68 in `BITCOST`, 20 in `SUB`, 9 in `ADAPT`, 4 in `LADR`, 10 in `FEEDERS`, 6 `TINT_` scalars and 46 other scalars.

The panel (`#tune`, opened by the Tune button) lays out five grids (`GRIDS`): the Mode table (rows upkeep, bank, divThresh, divChance, divCost, senT, mutScale × four modes), the Cost table (the 17 `BITCOST` rows × four modes), Resources (rate, K, yield, polymer × five resources), Adaptation (p, mean × five groups; `mode` has no mean, so that cell is blank) and Count multipliers (`LADR`). Everything else is grouped by `groupOf`: `TINT_*` under "Colour — the profile accent", paths with a dot under their top-level name (`FEEDERS`), the rest under "scalars"; the panel shows the Colour group first, then scalars, then FEEDERS. `LEVER_LABELS` gives the non-grid rows readable names. The search field filters by path, label, row or column name, and `#tunecount` reads "n of 191 levers".

Each input shows the value in the panel's unit: `UNITS` is a list of regular expressions giving a label and a scale, first match wins (µe/t at ×10⁶ for upkeeps, costs and `MOVE_GATE`; m·conc/t at ×10³ for `SUB.rate` and `EMIT_RATE`; ‰/birth for `ADAPT.p`; me for `BITE_DMG` and `SHARE_EPS`; and so on). A lever that matches nothing and is smaller than .01 is shown scaled by 10⁶ under the label "×10⁻⁶". `TIPS` is the matching list of hover texts; the lever's path and tip go in the input's title.

An edit calls `tuneApply(path, value)`: `C.tune(path, value)` on the page (for a top-level scalar this reassigns the module variable by `eval` and the `C` property; for a path it sets the leaf; both clear `statCache` and `COLC`; non-numbers and unknown paths are refused and the input reverts), records the path in `TUNED` (the input turns "changed"), and pushes `{ op:"tune", path, value }` into every plate in `window.ENTITY_PLATES`, so each worker applies the same `C.tune` to its own copy at its next message. Edits to `FEEDERS`, `SUB.*.yield` or `MODES.*.upkeep` refresh the feeder estimate.

Export writes `path = value    # shown unit` lines (changed levers only, or all) into `#tuneio` and the clipboard; Import parses such lines (`#` starts a comment) and applies each through `tuneApply`, reporting how many applied and which failed. Nothing is persisted: a reload restores the code's defaults.

The feeder estimate (`feederIncome`) gives, per feeder, the expected energy per tile per tick: a seep is `rate × yield`; a drop is `expectedDrops × meanBell / meanGap / tiles × yield`, with `meanGap = gapMed × exp(sigma² / 2)` (the log-normal mean), `expectedDrops = dropsMin + Σ(1 − (k / M)^(2/3))` for k from 1 to M − 1 and `M = dropsMax − dropsMin + 1`, the bell's volume `amp × f × π × rad² × (1 − e^−3.24)` averaged over 512 size factors, and `tiles = 84² × π / 4 × .92` (the gap and the disc both scale with plate area, so the figure is plate-independent). It is printed under the levers as "feeder income ≈ … µe/tile/t" beside the four mode upkeeps.

### What it touches

- Reads `C.levers`, `C.tune`, `C.MODE_NAME`, `C.SUB`, `C.FEEDERS`, `C.ADAPT`, `C.LADR`, `C.BITCOST`, `C.MODES`.
- Writes `plate.ops` for every plate in `window.ENTITY_PLATES` (read only inside `tuneApply`, never at load; `js/tune.js` loads after `js/host.js`).
- Owns every `#tune*` element; publishes `window.TUNE = { apply, build }` for the console and the smoke test.

### Defaults and levers

- The 191 levers and their defaults are the Lever reference at the end of this document. The panel itself has no settings.

### Assumptions built in

- A lever is a number reachable from `C`; a string, boolean or list cannot be tuned, and `broodSize` is deliberately excluded.
- Edits are global and immediate across all five plates, and an edit made while paused still reaches the workers on the next idle message.
- The page's `C` and each worker's `C` are kept equal only by replaying the same edits; a worker created later (the watchdog's fallback) starts from the defaults.
- The feeder estimate is the only derived figure; there is no estimate of uptake, carrying capacity or hunting yield.

## 10. Layout

### What it does

`js/layout.js` has two parts. The footer reserve measures the footer once against `SAMPLE`, the longest readout `paintTile` can produce (medium, entity with "dormant", tenant, location), and pins `--footH` to that height, so hovering an entity never changes the bench's room. A `MutationObserver` on `#tile` and `#hint` grows the reserve once if a readout ever exceeds it, and the measurement is repeated when the footer's width changes or the fonts load.

The bench fit solves for `--benchW`, the width of the plate grid. `solve(maxW, floorW, avail)` sets the width to `maxW`, and if the grid is taller than `avail − SAFETY` (2 px) probes a second width (half of `maxW`, no less than `floorW`), takes the height-per-width slope, lands on the width that fits, and corrects up to four times for rounding. `fit()` runs with the bench's overflow hidden so a classic scrollbar cannot distort the probe. If the viewport is wider than `NARROW_W` (700 px) it first tries the grid (`body.narrow` off) with floor `DESK_MIN_W` (330 px, small plates about 90 px, large about 145 px); if that fits, `bench.dataset.fit = "grid"`. Otherwise, and always at or below 700 px, it switches to the single-plate layout (`body.narrow` on: the plate tabs show and only `.plate.shown` is displayed) with floor `NARROW_MIN_W` (120 px); `fit` is `"one"` if it fits and `"floor"` if even the smallest plate is too tall and the bench scrolls. The decision is taken from the desktop measurement, so it cannot oscillate. Narrow is set before first paint when the viewport is already at or below 700 px.

Refits are scheduled on `ResizeObserver` for `#left` and the footer, `resize`, `orientationchange`, fonts ready, `load`, and the `entity:view` event with `view: "bench"` that `switchView` in `js/shell.js` dispatches when returning from the map. In the single-plate layout `js/host.js` asks the workers to draw only the shown plate.

### What it touches

- Reads `#bench`, `#left`, the footer, `#tile`, `#hint`; writes `--benchW`, `--footH`, `body.narrow`, `bench.dataset.fit`.
- `css/strain.css` consumes `--benchW` (with a fallback formula when unset), `--footH`, and `body.narrow` for the tabs and the plate figures.
- Loaded last in `Strain.html`, after everything it measures exists.

### Defaults and levers

- `NARROW_W` 700, `DESK_MIN_W` 330, `NARROW_MIN_W` 120, `SAFETY` 2 and the `SAMPLE` string are constants in `js/layout.js`, not panel levers.

### Assumptions built in

- The grid's height is linear in its width, which is what lets two probes solve it.
- The footer's worst case is the sample string; a longer readout grows the reserve once and never shrinks it.
- Layout mode is a pure function of the viewport, not of the content.
- Scrollbars are treated as the enemy: the bench is sized so that none is needed, and only `"floor"` concedes one.

## 11. Boot checks

### What it does

`bootAssert()` in `js/core.js` runs once at the top of `js/host.js`, on the page only, and throws `Error("boot: …")` on the first failure; the host shows the message in red in `#hint`. It verifies:

- For 200 random profiles with a fixed-seed generator: every field in `F` survives a `set`/`get` round-trip, and `statsOf` is deterministic (the same upkeep before and after clearing the cache).
- Both words are fully mapped with no overlapping fields (the union of the field masks is `0xffffffff` for each word).
- Every resource is workable for its best-leaned mode: `breakEven(min mode upkeep + cheapest enzyme cell, q) ≤ CAP × .6`.
- A hunter build can break even somewhere: with `hBill = min upkeep + LADR.enz × (cheapest enzyme cell + cheapest kitB cell)`, the smallest `breakEven` across resources is below `CAP`.
- Every `BITCOST` row has four positive cells; every `LADR` ratio exceeds 1; the dearest `enzGlu` cell is less than twice each mode's base upkeep.
- Feeders are well-formed: a seep has a positive rate no more than .01; a drop has `gapMed > 0`, `sigma ≥ 0`, positive `amp` and `dropR`, `dropsMin ≥ 1`, `dropsMax ≥ dropsMin`; any other kind fails.
- `ADAPT`: each `p` is strictly between 0 and 1, each `mean` at least 1, no group has `type` as its field or among its loci, and there is no `ADAPT.type`; `type` is in `F`; every `mutScale` is positive.
- `RECYCLE_TABLE`: entry 31 (the full diet) is −1; every other entry is a resource 0–4 not carried by that diet; the waste resources are used evenly (counts differ by at most 1).
- `LATENT_CH`, `SPILL_FRAC`, `BASE_RECYCLE_FRAC` are 0–1 fractions; `VAULT_DIV` and `VAULT_COST` are positive; `VAULT_AGE ≥ 1`; `TINT_BASE`, `TINT_NET`, `TINT_BLOOM`, `TINT_SAT`, `TINT_LMAX` are 0–1; `TINT_TURN` is 0–360.

It passes on the current defaults.

### What it touches

- Reads `F`, `MODES`, `BITCOST`, `ENZ_KEY`, `LADR`, `SUB`, `CAP`, `FEEDERS`, `ADAPT`, `RECYCLE_TABLE` and the scalars named above; calls `set`, `get`, `statsOf`, `breakEven`; clears `statCache` as a side effect.
- Called by `js/host.js` only. The workers do not run it, and tune edits are not re-checked.

### Defaults and levers

- The thresholds (`CAP × .6`, the factor 2 on `enzGlu`, the seep ceiling .01, 200 profiles) are constants of the check, not levers.

### Assumptions built in

- The checks guard the defaults at load; a tune edit can take the game past any of them without complaint.
- "Workable" means a single-enzyme build of the cheapest mode breaks even at 60% of the cap; it says nothing about whether the feeders sustain it.
- The hunter check uses `kitB` only.
- A failed check does not stop the simulation; the plates still run on the values that failed.

## Lever reference

Every lever `C.levers()` enumerates, grouped as the tuning panel groups them. "Default" is the value in `js/core.js`; "Unit" is the label the panel shows, and where the panel rescales a value, the number it displays follows in parentheses. Meanings are the panel's own `TIPS`.

### MODES — the mode table (upkeep in µe/t, bank and divCost in e, senT in ticks)

| Lever | Default | Unit | Meaning |
|---|---|---|---|
| `MODES.0.upkeep` (Swarm · upkeep) | 0.0005 | µe/t (500) | base energy this mode burns per tick just to exist — every specialty, kit, and trait bills on top |
| `MODES.1.upkeep` (Network · upkeep) | 0.000225 | µe/t (225) | base energy this mode burns per tick just to exist — every specialty, kit, and trait bills on top |
| `MODES.2.upkeep` (Bloom · upkeep) | 0.0002 | µe/t (200) | base energy this mode burns per tick just to exist — every specialty, kit, and trait bills on top |
| `MODES.3.upkeep` (Shower · upkeep) | 0.0006 | µe/t (600) | base energy this mode burns per tick just to exist — every specialty, kit, and trait bills on top |
| `MODES.0.bank` (Swarm · bank) | 1 | e | energy storage ceiling — income above a full bank is wasted |
| `MODES.1.bank` (Network · bank) | 2 | e | energy storage ceiling — income above a full bank is wasted |
| `MODES.2.bank` (Bloom · bank) | 3.33 | e | energy storage ceiling — income above a full bank is wasted |
| `MODES.3.bank` (Shower · bank) | 2.6 | e | energy storage ceiling — income above a full bank is wasted |
| `MODES.0.divThresh` (Swarm · divThresh) | 0.75 | × bank | fraction of the bank an entity must hold before it will try to divide |
| `MODES.1.divThresh` (Network · divThresh) | 0.325 | × bank | fraction of the bank an entity must hold before it will try to divide |
| `MODES.2.divThresh` (Bloom · divThresh) | 0.4 | × bank | fraction of the bank an entity must hold before it will try to divide |
| `MODES.3.divThresh` (Shower · divThresh) | 0.7 | × bank | fraction of the bank an entity must hold before it will try to divide |
| `MODES.0.divChance` (Swarm · divChance) | 0.027 | p/tick | per-tick probability of actually dividing once over the threshold — multiplied by DORM_DIV, RECYCLE_DIV and VAULT_DIV for carriers |
| `MODES.1.divChance` (Network · divChance) | 0.2 | p/tick | per-tick probability of actually dividing once over the threshold — multiplied by DORM_DIV, RECYCLE_DIV and VAULT_DIV for carriers |
| `MODES.2.divChance` (Bloom · divChance) | 0.16 | p/tick | per-tick probability of actually dividing once over the threshold — multiplied by DORM_DIV, RECYCLE_DIV and VAULT_DIV for carriers |
| `MODES.3.divChance` (Shower · divChance) | 0.04 | p/tick | per-tick probability of actually dividing once over the threshold — multiplied by DORM_DIV, RECYCLE_DIV and VAULT_DIV for carriers |
| `MODES.0.divCost` (Swarm · divCost) | 0.08 | e | flat energy destroyed per division event — the friction of dividing, paid once per event even for Bloom's four |
| `MODES.1.divCost` (Network · divCost) | 0.07 | e | flat energy destroyed per division event — the friction of dividing, paid once per event even for Bloom's four |
| `MODES.2.divCost` (Bloom · divCost) | 0.12 | e | flat energy destroyed per division event — the friction of dividing, paid once per event even for Bloom's four |
| `MODES.3.divCost` (Shower · divCost) | 0.16 | e | flat energy destroyed per division event — the friction of dividing, paid once per event even for Bloom's four |
| `MODES.0.senT` (Swarm · senT) | 500 | ticks | senescence timescale in ticks — per-tick death hazard is (age/senT)^AGE_P / senT, so median death lands near 1.2× this |
| `MODES.1.senT` (Network · senT) | 3600 | ticks | senescence timescale in ticks — per-tick death hazard is (age/senT)^AGE_P / senT, so median death lands near 1.2× this |
| `MODES.2.senT` (Bloom · senT) | 2100 | ticks | senescence timescale in ticks — per-tick death hazard is (age/senT)^AGE_P / senT, so median death lands near 1.2× this |
| `MODES.3.senT` (Shower · senT) | 2500 | ticks | senescence timescale in ticks — per-tick death hazard is (age/senT)^AGE_P / senT, so median death lands near 1.2× this |
| `MODES.0.mutScale` (Swarm · mutScale) | 1.4 | × | multiplies every non-mode adaptation rate for this mode |
| `MODES.1.mutScale` (Network · mutScale) | 0.85 | × | multiplies every non-mode adaptation rate for this mode |
| `MODES.2.mutScale` (Bloom · mutScale) | 1.3 | × | multiplies every non-mode adaptation rate for this mode |
| `MODES.3.mutScale` (Shower · mutScale) | 1 | × | multiplies every non-mode adaptation rate for this mode |

### BITCOST — the cost table (µe/t per tile)

| Lever | Default | Unit | Meaning |
|---|---|---|---|
| `BITCOST.enzGlu.0` (enzGlu · Swarm) | 0.000065 | µe/t (65) | per-tick upkeep of the glucose enzyme, scaled by the enz ladder for the total enzyme count |
| `BITCOST.enzGlu.1` (enzGlu · Network) | 0.000055 | µe/t (55) | per-tick upkeep of the glucose enzyme, scaled by the enz ladder for the total enzyme count |
| `BITCOST.enzGlu.2` (enzGlu · Bloom) | 0.000055 | µe/t (55) | per-tick upkeep of the glucose enzyme, scaled by the enz ladder for the total enzyme count |
| `BITCOST.enzGlu.3` (enzGlu · Shower) | 0.00014 | µe/t (140) | per-tick upkeep of the glucose enzyme, scaled by the enz ladder for the total enzyme count |
| `BITCOST.enzSuc.0` (enzSuc · Swarm) | 0.000085 | µe/t (85) | per-tick upkeep of the sucrose enzyme, scaled by the enz ladder for the total enzyme count |
| `BITCOST.enzSuc.1` (enzSuc · Network) | 0.00036 | µe/t (360) | per-tick upkeep of the sucrose enzyme, scaled by the enz ladder for the total enzyme count |
| `BITCOST.enzSuc.2` (enzSuc · Bloom) | 0.000015 | µe/t (15) | per-tick upkeep of the sucrose enzyme, scaled by the enz ladder for the total enzyme count |
| `BITCOST.enzSuc.3` (enzSuc · Shower) | 0.00008 | µe/t (80) | per-tick upkeep of the sucrose enzyme, scaled by the enz ladder for the total enzyme count |
| `BITCOST.enzPro.0` (enzPro · Swarm) | 0.00007 | µe/t (70) | per-tick upkeep of the protein enzyme, scaled by the enz ladder for the total enzyme count |
| `BITCOST.enzPro.1` (enzPro · Network) | 0.0001 | µe/t (100) | per-tick upkeep of the protein enzyme, scaled by the enz ladder for the total enzyme count |
| `BITCOST.enzPro.2` (enzPro · Bloom) | 0.00005 | µe/t (50) | per-tick upkeep of the protein enzyme, scaled by the enz ladder for the total enzyme count |
| `BITCOST.enzPro.3` (enzPro · Shower) | 0.000025 | µe/t (25) | per-tick upkeep of the protein enzyme, scaled by the enz ladder for the total enzyme count |
| `BITCOST.enzCel.0` (enzCel · Swarm) | 0.000375 | µe/t (375) | per-tick upkeep of the cellulose enzyme, scaled by the enz ladder for the total enzyme count |
| `BITCOST.enzCel.1` (enzCel · Network) | 0.00003 | µe/t (30) | per-tick upkeep of the cellulose enzyme, scaled by the enz ladder for the total enzyme count |
| `BITCOST.enzCel.2` (enzCel · Bloom) | 0.000065 | µe/t (65) | per-tick upkeep of the cellulose enzyme, scaled by the enz ladder for the total enzyme count |
| `BITCOST.enzCel.3` (enzCel · Shower) | 0.00009 | µe/t (90) | per-tick upkeep of the cellulose enzyme, scaled by the enz ladder for the total enzyme count |
| `BITCOST.enzNec.0` (enzNec · Swarm) | 0.00005 | µe/t (50) | per-tick upkeep of the necrose (remains) enzyme, scaled by the enz ladder for the total enzyme count |
| `BITCOST.enzNec.1` (enzNec · Network) | 0.00008 | µe/t (80) | per-tick upkeep of the necrose (remains) enzyme, scaled by the enz ladder for the total enzyme count |
| `BITCOST.enzNec.2` (enzNec · Bloom) | 0.00007 | µe/t (70) | per-tick upkeep of the necrose (remains) enzyme, scaled by the enz ladder for the total enzyme count |
| `BITCOST.enzNec.3` (enzNec · Shower) | 0.000015 | µe/t (15) | per-tick upkeep of the necrose (remains) enzyme, scaled by the enz ladder for the total enzyme count |
| `BITCOST.kitB.0` (kitB · Swarm) | 0.00005 | µe/t (50) | hunting kit for Type B prey — needed to bite them; bills zero while the cooldown runs |
| `BITCOST.kitB.1` (kitB · Network) | 0.00015 | µe/t (150) | hunting kit for Type B prey — needed to bite them; bills zero while the cooldown runs |
| `BITCOST.kitB.2` (kitB · Bloom) | 0.0001 | µe/t (100) | hunting kit for Type B prey — needed to bite them; bills zero while the cooldown runs |
| `BITCOST.kitB.3` (kitB · Shower) | 0.000065 | µe/t (65) | hunting kit for Type B prey — needed to bite them; bills zero while the cooldown runs |
| `BITCOST.kitA.0` (kitA · Swarm) | 0.00011 | µe/t (110) | hunting kit for Type A prey — needed to bite them; bills zero while the cooldown runs |
| `BITCOST.kitA.1` (kitA · Network) | 0.000025 | µe/t (25) | hunting kit for Type A prey — needed to bite them; bills zero while the cooldown runs |
| `BITCOST.kitA.2` (kitA · Bloom) | 0.00005 | µe/t (50) | hunting kit for Type A prey — needed to bite them; bills zero while the cooldown runs |
| `BITCOST.kitA.3` (kitA · Shower) | 0.000105 | µe/t (105) | hunting kit for Type A prey — needed to bite them; bills zero while the cooldown runs |
| `BITCOST.shield.0` (shield · Swarm) | 0.00018 | µe/t (180) | armour trait — SHIELD_BLOCK chance a bite glances off, and chemical damage is blunted to SHIELD_SOAK. Paired with lodging, also scrubs SCRUB_FRAC of the tile's brew each tick |
| `BITCOST.shield.1` (shield · Network) | 0.00022 | µe/t (220) | armour trait — SHIELD_BLOCK chance a bite glances off, and chemical damage is blunted to SHIELD_SOAK. Paired with lodging, also scrubs SCRUB_FRAC of the tile's brew each tick |
| `BITCOST.shield.2` (shield · Bloom) | 0.00008 | µe/t (80) | armour trait — SHIELD_BLOCK chance a bite glances off, and chemical damage is blunted to SHIELD_SOAK. Paired with lodging, also scrubs SCRUB_FRAC of the tile's brew each tick |
| `BITCOST.shield.3` (shield · Shower) | 0.00014 | µe/t (140) | armour trait — SHIELD_BLOCK chance a bite glances off, and chemical damage is blunted to SHIELD_SOAK. Paired with lodging, also scrubs SCRUB_FRAC of the tile's brew each tick |
| `BITCOST.dormancy.0` (dormancy · Swarm) | 0.00024 | µe/t (240) | sleep trait — idle through famine at DORM_UPK upkeep, at the price of dividing DORM_DIV as often |
| `BITCOST.dormancy.1` (dormancy · Network) | 0.0003 | µe/t (300) | sleep trait — idle through famine at DORM_UPK upkeep, at the price of dividing DORM_DIV as often |
| `BITCOST.dormancy.2` (dormancy · Bloom) | 0.0001 | µe/t (100) | sleep trait — idle through famine at DORM_UPK upkeep, at the price of dividing DORM_DIV as often |
| `BITCOST.dormancy.3` (dormancy · Shower) | 0.000185 | µe/t (185) | sleep trait — idle through famine at DORM_UPK upkeep, at the price of dividing DORM_DIV as often |
| `BITCOST.adaptor.0` (adaptor · Swarm) | 0.00016 | µe/t (160) | raises every adaptation rate for the carrier by ADAPT_BOOST × |
| `BITCOST.adaptor.1` (adaptor · Network) | 0.00008 | µe/t (80) | raises every adaptation rate for the carrier by ADAPT_BOOST × |
| `BITCOST.adaptor.2` (adaptor · Bloom) | 0.00005 | µe/t (50) | raises every adaptation rate for the carrier by ADAPT_BOOST × |
| `BITCOST.adaptor.3` (adaptor · Shower) | 0.000115 | µe/t (115) | raises every adaptation rate for the carrier by ADAPT_BOOST × |
| `BITCOST.reserve.0` (reserve · Swarm) | 0.00012 | µe/t (120) | deepens the energy bank by RESERVE_BANK × (the divide-at bar scales with it) |
| `BITCOST.reserve.1` (reserve · Network) | 0.000185 | µe/t (185) | deepens the energy bank by RESERVE_BANK × (the divide-at bar scales with it) |
| `BITCOST.reserve.2` (reserve · Bloom) | 0.00004 | µe/t (40) | deepens the energy bank by RESERVE_BANK × (the divide-at bar scales with it) |
| `BITCOST.reserve.3` (reserve · Shower) | 0.00014 | µe/t (140) | deepens the energy bank by RESERVE_BANK × (the divide-at bar scales with it) |
| `BITCOST.brewer.0` (brewer · Swarm) | 0.000235 | µe/t (235) | brewing trait — emits EMIT_RATE conc/tick of the compound matching its brew mask |
| `BITCOST.brewer.1` (brewer · Network) | 0.00005 | µe/t (50) | brewing trait — emits EMIT_RATE conc/tick of the compound matching its brew mask |
| `BITCOST.brewer.2` (brewer · Bloom) | 0.00006 | µe/t (60) | brewing trait — emits EMIT_RATE conc/tick of the compound matching its brew mask |
| `BITCOST.brewer.3` (brewer · Shower) | 0.00019 | µe/t (190) | brewing trait — emits EMIT_RATE conc/tick of the compound matching its brew mask |
| `BITCOST.lodging.0` (lodging · Swarm) | 0.0001 | µe/t (100) | host gene — opens the tile to a cross-type tenant; both at half scavenge, half upkeep. Paired with a shield, also scrubs SCRUB_FRAC of the tile's brew each tick |
| `BITCOST.lodging.1` (lodging · Network) | 0.00008 | µe/t (80) | host gene — opens the tile to a cross-type tenant; both at half scavenge, half upkeep. Paired with a shield, also scrubs SCRUB_FRAC of the tile's brew each tick |
| `BITCOST.lodging.2` (lodging · Bloom) | 0.000175 | µe/t (175) | host gene — opens the tile to a cross-type tenant; both at half scavenge, half upkeep. Paired with a shield, also scrubs SCRUB_FRAC of the tile's brew each tick |
| `BITCOST.lodging.3` (lodging · Shower) | 0.000225 | µe/t (225) | host gene — opens the tile to a cross-type tenant; both at half scavenge, half upkeep. Paired with a shield, also scrubs SCRUB_FRAC of the tile's brew each tick |
| `BITCOST.recycleEnz.0` (recycleEnz · Swarm) | 0.00003 | µe/t (30) | byproduct recycler, billed per enzyme carried — digestion leaks RECYCLE_FRAC of the grazed energy as the diet's waste substrate, and divides RECYCLE_DIV as often |
| `BITCOST.recycleEnz.1` (recycleEnz · Network) | 0.00002 | µe/t (20) | byproduct recycler, billed per enzyme carried — digestion leaks RECYCLE_FRAC of the grazed energy as the diet's waste substrate, and divides RECYCLE_DIV as often |
| `BITCOST.recycleEnz.2` (recycleEnz · Bloom) | 0.00006 | µe/t (60) | byproduct recycler, billed per enzyme carried — digestion leaks RECYCLE_FRAC of the grazed energy as the diet's waste substrate, and divides RECYCLE_DIV as often |
| `BITCOST.recycleEnz.3` (recycleEnz · Shower) | 0.00011 | µe/t (110) | byproduct recycler, billed per enzyme carried — digestion leaks RECYCLE_FRAC of the grazed energy as the diet's waste substrate, and divides RECYCLE_DIV as often |
| `BITCOST.cloakBit.0` (cloakBit · Swarm) | 0.000055 | µe/t (55) | per hidden identity bit — hides from teeth and brews alike (cloak ladder applies) |
| `BITCOST.cloakBit.1` (cloakBit · Network) | 0.000055 | µe/t (55) | per hidden identity bit — hides from teeth and brews alike (cloak ladder applies) |
| `BITCOST.cloakBit.2` (cloakBit · Bloom) | 0.00002 | µe/t (20) | per hidden identity bit — hides from teeth and brews alike (cloak ladder applies) |
| `BITCOST.cloakBit.3` (cloakBit · Shower) | 0.00007 | µe/t (70) | per hidden identity bit — hides from teeth and brews alike (cloak ladder applies) |
| `BITCOST.tgtOffBit.0` (tgtOffBit · Swarm) | 0.000015 | µe/t (15) | per disabled target channel — WIDENS a hunter's menu (fewer bits to satisfy under the subset rule) at the price of bite potency, which scales with the bits left on; bills zero while hunting live and digesting |
| `BITCOST.tgtOffBit.1` (tgtOffBit · Network) | 0.000025 | µe/t (25) | per disabled target channel — WIDENS a hunter's menu (fewer bits to satisfy under the subset rule) at the price of bite potency, which scales with the bits left on; bills zero while hunting live and digesting |
| `BITCOST.tgtOffBit.2` (tgtOffBit · Bloom) | 0.00006 | µe/t (60) | per disabled target channel — WIDENS a hunter's menu (fewer bits to satisfy under the subset rule) at the price of bite potency, which scales with the bits left on; bills zero while hunting live and digesting |
| `BITCOST.tgtOffBit.3` (tgtOffBit · Shower) | 0.00006 | µe/t (60) | per disabled target channel — WIDENS a hunter's menu (fewer bits to satisfy under the subset rule) at the price of bite potency, which scales with the bits left on; bills zero while hunting live and digesting |
| `BITCOST.brewOffBit.0` (brewOffBit · Swarm) | 0.00005 | µe/t (50) | per disabled brew channel — WIDENS a compound to more victims, each hit for less: potency scales with the bits left on |
| `BITCOST.brewOffBit.1` (brewOffBit · Network) | 0.00003 | µe/t (30) | per disabled brew channel — WIDENS a compound to more victims, each hit for less: potency scales with the bits left on |
| `BITCOST.brewOffBit.2` (brewOffBit · Bloom) | 0.00001 | µe/t (10) | per disabled brew channel — WIDENS a compound to more victims, each hit for less: potency scales with the bits left on |
| `BITCOST.brewOffBit.3` (brewOffBit · Shower) | 0.00008 | µe/t (80) | per disabled brew channel — WIDENS a compound to more victims, each hit for less: potency scales with the bits left on |

### SUB — resources (rate in m·conc/t, K in conc, yield in e/conc)

| Lever | Default | Unit | Meaning |
|---|---|---|---|
| `SUB.0.rate` (Resource 1 · rate) | 0.012 | m·conc/t (12) | maximum graze per tick at saturating concentration |
| `SUB.1.rate` (Resource 2 · rate) | 0.009 | m·conc/t (9) | maximum graze per tick at saturating concentration |
| `SUB.2.rate` (Resource 3 · rate) | 0.008 | m·conc/t (8) | maximum graze per tick at saturating concentration |
| `SUB.3.rate` (Resource 4 · rate) | 0.007 | m·conc/t (7) | maximum graze per tick at saturating concentration |
| `SUB.4.rate` (Resource 5 · rate) | 0.009 | m·conc/t (9) | maximum graze per tick at saturating concentration |
| `SUB.0.K` (Resource 1 · K) | 0.16 | conc | half-saturation concentration — lower means easier to eat when scarce |
| `SUB.1.K` (Resource 2 · K) | 0.11 | conc | half-saturation concentration — lower means easier to eat when scarce |
| `SUB.2.K` (Resource 3 · K) | 0.3 | conc | half-saturation concentration — lower means easier to eat when scarce |
| `SUB.3.K` (Resource 4 · K) | 0.55 | conc | half-saturation concentration — lower means easier to eat when scarce |
| `SUB.4.K` (Resource 5 · K) | 0.06 | conc | half-saturation concentration — lower means easier to eat when scarce |
| `SUB.0.yield` (Resource 1 · yield) | 1.15 | e/conc | energy gained per unit of concentration grazed |
| `SUB.1.yield` (Resource 2 · yield) | 0.9125 | e/conc | energy gained per unit of concentration grazed |
| `SUB.2.yield` (Resource 3 · yield) | 1.33 | e/conc | energy gained per unit of concentration grazed |
| `SUB.3.yield` (Resource 4 · yield) | 1 | e/conc | energy gained per unit of concentration grazed |
| `SUB.4.yield` (Resource 5 · yield) | 0.8 | e/conc | energy gained per unit of concentration grazed |
| `SUB.0.polymer` (Resource 1 · polymer) | 0.05 | fraction | mobility: 0 diffuses freely across the plate, 1 stays where it lands |
| `SUB.1.polymer` (Resource 2 · polymer) | 0.1 | fraction | mobility: 0 diffuses freely across the plate, 1 stays where it lands |
| `SUB.2.polymer` (Resource 3 · polymer) | 0.55 | fraction | mobility: 0 diffuses freely across the plate, 1 stays where it lands |
| `SUB.3.polymer` (Resource 4 · polymer) | 1 | fraction | mobility: 0 diffuses freely across the plate, 1 stays where it lands |
| `SUB.4.polymer` (Resource 5 · polymer) | 1 | fraction | mobility: 0 diffuses freely across the plate, 1 stays where it lands |

### ADAPT — adaptation (p in ‰ per birth, mean in bits)

| Lever | Default | Unit | Meaning |
|---|---|---|---|
| `ADAPT.mode.p` (mode · p) | 0.00008 | ‰/birth (0.08) | chance per birth of a lifestyle flip: Swarm↔Bloom for Type B, Network↔Shower for Type A |
| `ADAPT.diet.p` (diet · p) | 0.02 | ‰/birth (20) | chance per birth that this field adapts at all |
| `ADAPT.id.p` (id · p) | 0.022 | ‰/birth (22) | chance per birth that this field adapts at all |
| `ADAPT.tgt.p` (tgt · p) | 0.018 | ‰/birth (18) | chance per birth that this field adapts at all |
| `ADAPT.pool.p` (pool · p) | 0.017 | ‰/birth (17) | chance per birth that this field adapts at all |
| `ADAPT.diet.mean` (diet · mean) | 1.55 | bits | average bits flipped when an adaptation fires (geometric draw) |
| `ADAPT.id.mean` (id · mean) | 1.875 | bits | average bits flipped when an adaptation fires (geometric draw) |
| `ADAPT.tgt.mean` (tgt · mean) | 2.2 | bits | average bits flipped when an adaptation fires (geometric draw) |
| `ADAPT.pool.mean` (pool · mean) | 1.95 | bits | average bits flipped when an adaptation fires (geometric draw) |

### LADR — count multipliers (r per extra item)

| Lever | Default | Unit | Meaning |
|---|---|---|---|
| `LADR.enz` (count multiplier r · enz) | 1.875 | r | count multiplier for enzymes + hunting kits: carrying n reprices each at cell × r^(n−1) |
| `LADR.cloak` (count multiplier r · cloak) | 1.6 | r | count multiplier for hidden identity bits: hiding n reprices each at cell × r^(n−1) |
| `LADR.tgt` (count multiplier r · tgt) | 1.38 | r | count multiplier for disabled target channels: n off reprices each at cell × r^(n−1) |
| `LADR.brew` (count multiplier r · brew) | 1.25 | r | count multiplier for disabled brew channels: n off reprices each at cell × r^(n−1) |

### TINT — colour, the profile accent

| Lever | Default | Unit | Meaning |
|---|---|---|---|
| `TINT_BASE` (accent · all other modes) | 0.28 | fraction | genome tint strength for every mode except the two below — how far diet and identity pull a strain off its ramp colour |
| `TINT_NET` (accent · Network scavengers) | 0.375 | fraction | genome tint strength for Network scavengers — the pale mat carries the strongest accent |
| `TINT_BLOOM` (accent · hunting Blooms) | 0.4 | fraction | genome tint strength for hunting Blooms — the tan-to-chocolate ramp |
| `TINT_SAT` (Network · added saturation) | 0.1825 | fraction | saturation ADDED to a Network scavenger (not multiplied — the grey ramp has nothing to multiply). 0 restores the old grey mat, .6 is frank pastel |
| `TINT_TURN` (Network · hue sweep) | 360 | degrees | hue sweep in degrees at full accent for a Network scavenger — 360 spreads the tint across the whole wheel, 46 is the narrow turn every other mode uses |
| `TINT_LMAX` (Network · lightness ceiling) | 0.9625 | fraction | lightness ceiling for a tinted Network scavenger — without it the palest strains reach pure white, where any saturation is invisible |

### FEEDERS

| Lever | Default | Unit | Meaning |
|---|---|---|---|
| `FEEDERS.0.gapMed` (Resource 2 feeder · gapMed) | 10 | ticks | median gap between drip events at the 84-plate (log-normal clock, scaled by plate area) |
| `FEEDERS.0.sigma` (Resource 2 feeder · sigma) | 1.75 | σ (log) | log-normal spread of the gaps — bigger means wetter clusters and harsher droughts |
| `FEEDERS.0.dropsMin` (Resource 2 feeder · dropsMin) | 2 | count | fewest droplets a drip event scatters |
| `FEEDERS.0.dropsMax` (Resource 2 feeder · dropsMax) | 9 | count | most droplets a drip event scatters (the count skews low) |
| `FEEDERS.0.dropR` (Resource 2 feeder · dropR) | 2.75 | tiles | base droplet radius in tiles — each droplet is its own gaussian bell |
| `FEEDERS.0.amp` (Resource 2 feeder · amp) | 0.26 | conc peak | droplet peak concentration before its per-droplet size factor |
| `FEEDERS.0.dropFloor` (Resource 2 feeder · dropFloor) | 0.16 | × | minimum droplet size factor — the stingiest possible speck |
| `FEEDERS.0.dropSpread` (Resource 2 feeder · dropSpread) | 2 | × | range of the droplet size factor above the floor — how fat the fattest prize is |
| `FEEDERS.0.dropPow` (Resource 2 feeder · dropPow) | 1.7 | × | skew of the size factor — higher means more nibbles and rarer feasts |
| `FEEDERS.1.rate` (Resource 4 feeder · rate) | 0.00008 | µconc/tile/t (80) | the seep tide — concentration welling up in every plate tile, every tick |

### scalars

| Lever | Default | Unit | Meaning |
|---|---|---|---|
| `CAP` | 2.6 | conc | concentration ceiling per tile — anything poured or leaked above this is lost |
| `HUNT_BANK` | 0.125 | fraction | each hunting kit deepens the bank by this fraction — predators can gorge on siege income |
| `RESERVE_BANK` | 1.5 | × | reserve trait: bank multiplier (the divide-at energy scales with it) |
| `MOVE_GATE` | 0.00018 | µe/t (180) | Swarm chemotaxis threshold — moves when a neighbour beats home income by this (grazers only; prowling hunters ignore the gate) |
| `MOVE_TICKS` | 6 | count | a Swarm move holds both tiles this many ticks: paying upkeep, unable to eat, hunt, brew, or divide |
| `HUNT_ROAM` | 0.85 | fraction | a Swarm hunter's chance of prowling at random instead of following the substrate gradient — its food is prey, which the gradient cannot see |
| `SHARE_EPS` | 0.0025 | me (2.5) | Network sharing skips differences smaller than this — grow instead |
| `SHARE_PULL` | 0.825 | × | frontier bias of Network sharing: partners weighted by openness^this; 0 is blind equalisation |
| `SHARE_KEEP` | 0.3 | fraction | a cell with an open side keeps this much surplus for its own growth before equalising outward |
| `DORM_SLEEP` | 0.25 | fraction | dormant carriers fall asleep below this fraction of their divide-at energy |
| `WAKE_MARGIN` | 1.1 | × | sleepers wake when local edible income reaches this × their own upkeep |
| `DORM_UPK` | 0.55 | fraction | upkeep multiplier while asleep — the rent on the pillow |
| `DORM_DIV` | 0.5 | × | dormancy carriers divide-chance multiplier — the sleep machinery slows them down even awake |
| `EMIT_RATE` | 0.042 | m·conc/t (42) | concentration a brewer adds to its compound channel per tick |
| `COMP_DECAY` | 0.99 | fraction | compound concentration multiplier per tick — how fast brews fade |
| `REMAINS_DECAY` | 0.002 | µ/t (2000) | remains rot: fraction of a tile's necrose converting to protein per tick |
| `REMAINS_EFF` | 0.55 | fraction | energy efficiency of the necrose→protein conversion; the rest is lost to the air |
| `DOSE_DMG` | 0.004 | µe/conc/t (4000) | energy damage per unit compound concentration per tick to matching victims |
| `DIFF_EVERY` | 6 | count | diffusion cadence — the whole-plate pass runs every this many ticks |
| `DIFF_RATE` | 0.25 | fraction | eight-way share of a tile's substrate moved per diffusion pass, × (1 − polymer) |
| `DIAG_W` | 0.55 | fraction | diagonal placement weight — raise toward .7 for squarer colonies, lower for rounder |
| `FILA_RUN` | 0.675 | fraction | chance a Network filament child continues dead straight; otherwise it wobbles ±45° |
| `FILA_BRANCH` | 0.4 | fraction | chance a filament segment sprouts a perpendicular runner, as a fraction of division tempo |
| `FILA_MAXNB` | 5 | count | filament growth refuses a target tile with more occupied neighbours than this — keeps daylight between strands |
| `REACH_EVERY` | 10 | count | every N ticks an entity also grazes its unoccupied cardinal neighbours — a frontier bonus |
| `SHIELD_BLOCK` | 0.585 | fraction | chance a bite glances off a shield entirely |
| `SHIELD_SOAK` | 0.22 | fraction | fraction of chemical damage a shield lets through |
| `SCRUB_FRAC` | 0.16 | fraction | shield + lodging together destroy this share of the brew in their tile each tick, before damage — neither gene does it alone |
| `VAULT_DIV` | 0.5 | × | reserve + dormancy + shield together multiply divide-chance by this, ON TOP of DORM_DIV — the net for a vault is a quarter of its mode tempo |
| `VAULT_COST` | 0.5 | × | reserve + dormancy + shield together multiply the flat friction of a division event by this — a vault is built to be opened |
| `VAULT_AGE` | 1.33 | × | reserve + dormancy + shield together multiply the senescence timescale by this — the triple buys duration with tempo |
| `SPILL_FRAC` | 0.5 | fraction | share of the bite a hunter failed to absorb that a recycler carrier drops as remains at the prey tile — hunting grounds fertilise themselves |
| `ADAPT_BOOST` | 2.75 | × | adaptor trait multiplies every adaptation probability by this |
| `BATCH_FRAC` | 0.4 | fraction | fraction of the parent's post-cost energy transferred to the brood, split equally across broodSize |
| `AGE_P` | 3 | count | senescence hazard exponent: per-tick death chance is (age/senT)^p / senT |
| `REMAINS_K` | 40 | × | remains energy = the dead entity's upkeep × this — big eaters leave rich remains |
| `RECYCLE_FRAC` | 0.7 | fraction | fraction of grazed energy recycler carriers leak as their diet's waste substrate |
| `BASE_RECYCLE_FRAC` | 0.4 | fraction | fraction of cellulose energy non-recycler carriers leak as glucose — the baseline wasteful conversion, independent of RECYCLE_FRAC |
| `RECYCLE_DIV` | 1.36 | × | recycler carriers divide-chance multiplier — running digestion hot makes daughters faster |
| `MASK_POT` | 0.18 | × | bite potency bonus per target-mask bit beyond the first — surgical masks hit fewer victims, harder |
| `BREW_POT` | 0.08 | × | compound potency bonus per brew-mask bit beyond the first — a gentler curve than teeth |
| `BITE_DMG` | 0.2 | me (200) | energy drained from prey per landed bite — bites wound, they do not kill |
| `BITE_XFER` | 0.88 | fraction | fraction of the drain the hunter absorbs; the rest is violence, spilled not eaten — and SPILL_FRAC of that lands as remains if the hunter carries a recycler |
| `BITE_XFER_SHIELD` | 0.48 | fraction | absorbed fraction against shielded prey — the shield both blocks and blunts |
| `BITE_CD` | 7 | count | digestion ticks after a landed bite: no biting, hunting gear bills zero, and a Swarm hunter holds its ground instead of walking — it camps the prey it wounded |
| `LATENT_CH` | 0.12 | fraction | price of a channel mask that cannot fire, as a fraction of the full off-bit bill — target masks without a hunting kit, brew masks without a brewer, and either family with an empty mask. 0 makes latent masks free storage again |

