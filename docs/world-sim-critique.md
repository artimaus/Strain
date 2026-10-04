# Strain: the critique of the world simulation, and the proposals

This is the proposals document written after the review of stages 0-8,
kept as it was approved. What was done with it (September 2026), in
the order agreed: section 1 (the defects), section 6 (scarcity: cover
pricing, sellers who withhold, price-floor deals, technology's energy
upkeep), section 2 (the defender's path), section 3 (the mechanical
clean-ups), section 4.1 (one economy, one scale), section 4.2
(decisions in one unit, with peace taking two), and section 5.3
(fronts and coalitions). Each is recorded, with its census, under
"After the review" in `world-sim.md`. Sections 5.1 (curated defaults),
5.2 (the population cycle) and 5.4 (the outbreak pass) stay deferred;
their proposals are below for when they are taken up. Where the work
departed from a proposal the record in `world-sim.md` says so (the
index reference, the war costs, peace by consent, fronts by reach
rather than by land border alone).

---


## Context

Stages 0–8 of the redesign are built and green (13/13 suite cases, 90
checks, six-seed census in `docs/world-sim.md`). Asked for critiques of
the design and the code, I listed eighteen findings; the user chose all
four categories and asked for a document with a proposal for each, each
section opening with a summary of the perceived issue and the proposed
solution. This is that document. On approval it is copied to
`docs/world-sim-critique.md` and the work runs in the order given at the
end, one category at a time, each ending green in `tools/smoke.py` with
a six-seed census where the behaviour changes.

Every constant named below becomes a Config row; no number is a promise
about balance.

---

## 1. Definite defects

**Summary.** Four things in the code do not do what the design says,
and I can point at the lines. Blows to the economy vanish the next
morning, because the daily growth pass rewrites the economy index from
output; one weekly diplomacy turn in four never runs, because the
monthly turn shadows it; the stalemate ending of a war is unreachable,
because wars only begin with an estimated edge and the front then moves
by the odds; and the "need" half of war greed reads a supply scale that
is now always 100, so it and the helpers under it are dead weight. The
proposal is to make blows hit output as percentages, run both turns on
the monthly day, give the stalemate a path (section 2 takes the fuller
war fix), and retire the old supply shim. Half a day, no design
decisions except the small one on how large an economic blow should be.

### 1.1 Blows to the economy are erased

- **Issue.** `grow()` (`js/economy.js` ~351) sets `s.st.economy =
  clamp(100 × output / econRef)` every day. War attrition
  (`js/decide.js` ~721, `warAttrEco`), every disaster's economy hit
  (`T3(s, "economy", …)` in `js/events.js` ~61–84) and strikes
  (`bump(s, "economy", …)` ~113) write to `st.economy`, which is then
  overwritten. The census never showed a war or a quake denting an
  economy because none ever did.
- **Proposal.** One helper in economy.js, `hitOutput(s, frac)`:
  `s.output = max(1, s.output × (1 − frac))`, also lowering `outPrev`
  by the same factor so the quarterly report does not read a blow as a
  recession twice. Callers pass a fraction: war attrition
  `warAttrEco` becomes a per-day fraction (0.0008; a hundred-day war
  costs 8 %), disaster tiers become `[0.01, 0.04, 0.12]` × the kind's
  weight, a strike `0.01` / `0.03`. `bump(s, "economy", …)` is removed
  from the events catalogue; `T3` gains an `output` variant.
- **Verification.** Smoke: a forced tier-2 quake lowers `output` and
  the country's quarterly report can show it; a forced war lowers both
  sides' output. Census: war and disaster hits visible in the output
  trajectories of struck countries.

### 1.2 One weekly turn in four is skipped

- **Issue.** `js/world.js` ~526: `if (decisionDay === day % 28) act()
  else if (decisionDay % 7 === day % 7 …) diplomacyWeekly()`. The
  monthly day always satisfies the weekly test, so the weekly turn is
  lost that week (cadence 115 per three years instead of 156).
- **Proposal.** Two independent `if`s; on the monthly day the weekly
  turn runs first (deals and sanctions are quicker moves than a war or a
  project), then the monthly. The `cadenceHeld` check's bounds move to
  the true rates.
- **Verification.** Cadence ≈ 156 weekly per country over three years.

### 1.3 Stalemates are unreachable

- **Issue.** A war starts only when the *estimated* odds exceed
  `warMinRatio`; the front then moves by the *true* odds (capped at
  `warSwing`) plus `warNoise`; a near-even war never starts, so
  `warMaxDays` is never reached and `endWar(…, "stalemate")` is dead.
  Six censuses: zero stalemates.
- **Proposal.** The full fix is section 2 (the defender's path). The
  defect-level fix is to make the front able to stall: the daily
  movement becomes `warPace × (odds − 1) / (odds + 1)` (a bounded,
  symmetric measure: 2:1 moves at a third of the cap, 1.2:1 at a tenth)
  so wars started on a misjudged small edge crawl, and `warMaxDays`
  becomes reachable. Attrition and mobilisation (section 2) then turn
  crawls into stalemates or reversals.
- **Verification.** A forced near-even war (ratio 1.2) lasts past
  `warMaxDays` and ends in stalemate in the smoke; census shows a
  non-zero stalemate count.

### 1.4 The "need" term of greed and the supply shim are dead

- **Issue.** `relief()` in decide.js runs on `supplyOf()`, the balances
  scaled to 0..100, which is 100 for nearly every country now that the
  exchange and deals feed shortages. The `need` term is therefore ~0,
  and `wWar`, `wLack`, `wGoodwill`, `floorOf`, `meanRes`, `supplyOf`,
  `invalidateSupply` (a no-op kept for callers), `spoilGains`,
  `bindingOf` on that scale, and the `s.res` reads in the war gate are
  legacy. The country screen's "resources" vital reads `floorOf`.
- **Proposal.** Greed = spoils (already the live term) plus a
  **dependency** term: what the country pays the exchange every day for
  the type the target could supply, against its income —
  `wNeedWar × min(1, bill_k / income)` where `bill_k` = today's
  purchases of k × the landed price — capped by how much of that bill
  the target's spare would cover. A country that lives on imports feels
  it in proportion to what they cost, so the term is alive whenever
  prices are (section 6 makes them so), and it is zero for a country
  that feeds itself.
  Remove the shim: `supplyOf`/`floorOf` become thin readers of
  `s.balance` for the screen and map; `meanRes` stays only for the
  resource-find weight (`endowRel` in the plan); `invalidateSupply`
  and its calls go; `wLack`, `wGoodwill` and `wWar` are deleted from
  Config with a one-line migration note.
- **Verification.** Suite green; `warKills`/`warBansProjects`
  unchanged; census war rate within 4–8 after re-sweeping `wSpoils`
  once.

---

## 2. The war model's defender path

**Summary.** Wars are decided at declaration. The attacker only attacks
with an estimated edge, its estimate counts pact partners who may not
come, and once the shooting starts the front moves by the true odds
with nothing the defender can do about it: no mobilisation, no
attrition asymmetry that favours the side at home, no memory of allies
who refused. Every census shows every war ending in the attacker's
victory or in the loser suing for peace; zero stalemates, zero
defender victories that were not misjudgements. The proposal gives the
defender three things — mobilisation that moves the front, an
attrition edge at home, and allies whose past answers the attacker
remembers — and gives the attacker a supply line that thins with
distance. The result should be a war whose outcome is uncertain at
declaration for edges under about 2:1, which is what makes the margin
of error a gamble rather than a lottery ticket.

### 2.1 Mobilisation moves the front

- **Issue.** Military investment during a war is allowed (the exemption
  from the project ban) but its gain arrives over 30 days into
  `st.military`, which the front does read through `force()` — yet the
  war is over in a median of 18 days. The defender cannot respond.
- **Proposal.** A **mobilisation** action for a country at war
  (monthly candidate, also triggered once automatically on the day it
  is attacked if `treasury + credit` allows): a project with
  `mobilDays` 10 and a larger gain (`mobilStep`), paid at a premium
  (`mobilPremium`), that raises `st.military` fast and costs stability
  (`mobilStab`). Its gain decays after the war (`demobDays`). The
  attacker may mobilise too, at the same cost; the defender does it
  first because it is reactive.
- **Verification.** Smoke: a defender at 1.3:1 against it that
  mobilises reaches a stalemate or better in a forced war; census: a
  share of wars end in stalemate or defender victory.

### 2.2 Home-ground attrition

- **Issue.** Attrition is symmetric except for the losing-side
  multiplier; the attacker abroad and the defender at home bleed the
  same.
- **Proposal.** The attacker's daily military loss scales with the
  reach factor already computed for the target (`land 1, sea reachSea,
  air reachAir` in `reach()`): `warMilAtt × (1 + supplyLine × (1 −
  reach))`, so a war across a sea lane or by air spends the army faster.
  The defender's `defenceBonus` already exists; it stays.
- **Verification.** Smoke: the same forced war over a sea link spends
  the attacker's military faster than over land.

### 2.3 Allies with memory

- **Issue.** The estimate counts every pact partner at `pactShare`;
  only those who join count in the campaign; a partner that refused
  last year is counted again next year.
- **Proposal.** The country keeps `s.allyTrust[iso]` (0..1, saved):
  set to 1 on a join, `refuseTrust` (0.3) on a refusal, recovering
  toward 1 at `trustRecover` a day. The estimate weights each expected
  ally by its trust. A refusal already dissolves the pact; with trust
  the attacker also stops counting an unreliable friend it has not yet
  dropped.
- **Verification.** Smoke: after a scripted refusal the attacker's
  `estimateRatio` for the same target falls.

### 2.4 Noise scaled by the odds

- **Issue.** `warNoise` is a flat ±0.01 a day regardless of how even the
  war is, so it never decides anything.
- **Proposal.** Noise scales with how even the odds are: `warNoise × 2
  / (odds + 1/odds)`, largest at 1:1, negligible at 5:1, so close wars
  are genuinely uncertain and routs are not.
- **Verification.** Two forced near-even wars with different seeds end
  differently at least sometimes across a small batch in the probe.

Sections 2.1–2.4 together are the "defender path". A census after them
should show, of all wars: attacker victories, defender victories,
peaces and stalemates all non-zero, with the attacker still winning
most wars started on a real edge.

---

## 3. Mechanical clean-ups

**Summary.** These are the places where the code works but the shape is
wrong: a per-day memo pattern that makes today's pact invisible until
tomorrow, constants that escaped the Config table, names that drifted
away from their meaning, a save format of positional arrays with a
redundant flag and colliding codes, a pairs table that only grows, and a
test suite that is one long scenario in which four checks had to be
made "pick a country at peace". Each fix is small and mechanical, the
suite must stay green throughout, and none changes behaviour except the
memo fix (which removes a one-day lag) and pair pruning (which removes
nothing a reader can see).

### 3.1 Memos invalidate on write

- **Issue.** `pairCounts` (world.js), `pactPartners` (decide.js) and
  `gdpShares` (economy.js) are rebuilt once a day. A pact signed today,
  a deal, a sanction, a relation crossing a tie threshold: none is seen
  until tomorrow. Three smoke checks needed `advanceDays(1)` to work
  around it.
- **Proposal.** A `PAIRS_VERSION` counter in world.js bumped by every
  writer (`pairOf` on creation, `addDeal`, `dropDeals`, the pact and
  sanction executors, `shiftRel` when a value crosses `tieFriend` or
  `tieFoe`, `unpackPairs`); each memo keys on `(day, version)`. Same for
  `gdpShares` on `output`/`pop` writes — or, simpler, rebuild it in
  `daily()` once, since that is the only place output changes.
- **Verification.** The three checks drop their `advanceDays(1)` and
  still pass.

### 3.2 One frontier helper; constants into Config

- **Issue.** `Math.max(0.1, 1.1 − tech/100)` appears in `js/decide.js`
  ~532 and `js/events.js` ~89, ~92. Literals survive in: `(0.5 +
  economy/200)` (war greed), `(hostility/100)²`, `1.2 − level/100`
  (project gain), aid at relations ≥ 20, the regime jumps in `gov.js`
  (±15, +40/−30, −25), the coup relations +40, the 3 × 3 label
  thresholds (45/70, 35/60), `refugeeRel` is a row but `aid`'s 20 is
  not, `joinWar`'s −30/+10 relations.
- **Proposal.** `frontier(tech)` in countries.js used by all three;
  every literal above becomes a Config row in the group its system owns
  (`greedEcoBase`, `enmityPower`, `projectGainFalloff`, `aidRel`,
  `coupRel`, `labelAuth1/2`, `labelFree1/2`, `joinRelFriend`,
  `joinRelFoe`). Tuning-screen rows with a one-line meaning each.
- **Verification.** Config row count check rises; determinism unchanged
  (same defaults).

### 3.3 Names that mean what they say

- **Issue.** `openness` is economic openness since stage 5; `reach()`
  (a factor) and `canReach()` (a gate) split one idea; `warAttrMil` was
  repurposed for allies; `res` (relative endowment) and `potential`
  (absolute) both persist and both are scaled by discoveries; `trade`
  on a pair is redundant with `deals.length`.
- **Proposal.** Rename `openness` → `econOpen` on the state with a
  save alias (`op` stays the short key), and rename every reader (about
  20 sites, mechanical); `reach()` → `reachFactor()`; `warAttrMil` →
  `allyMilAttr`; `res` stays as the *display* endowment but is derived
  from `potential` against starting need (the plan's `endowRel`) rather
  than stored, so a discovery scales one thing; `trade` goes, with
  `pairCounts().trade` computed from `deals.length`.
- **Verification.** Suite green; the save round trip still reads a
  v5 pack.

### 3.4 The save table for pairs; version 6

- **Issue.** `packPairs` writes `[a, b, rel, flags, trade, pact, warId,
  truce, deals]` and each deal `[g, gq, t, tq, mq, tech, until, since,
  short]`; positional, undocumented, and two columns were added without
  a version bump. `COUNTRY_FIELDS` uses two-letter codes and `ddd` was
  needed because `dd` was taken.
- **Proposal.** `PAIR_FIELDS` and `DEAL_FIELDS` tables like
  `COUNTRY_FIELDS` (`[key, short, default]`), packing to small objects;
  save version 6; a v5 loader that reads the positional rows once. A
  short-key registry check in the smoke test that no two fields share a
  code.
- **Verification.** `saveRoundTrip` and `v3Migrates`/`v4Migrates` plus
  a new `v5Migrates` (a v5 pack with positional pairs loads).

### 3.5 Prune pairs at rest

- **Issue.** A pair record is created on first touch and never removed:
  2,500 after three years, tending toward all 20,000; `relaxRelations`
  and `settleDeals` walk every one daily.
- **Proposal.** In `relaxRelations`, a pair with no deals, no pact, no
  sanction, no war, no truce, and relations within 1 point of its
  resting point is deleted (its relations are then `baseRel` again,
  which is what it has converged to). `settleDeals` walks only pairs
  with deals, from an index kept by `addDeal`/`dropDeals`.
- **Verification.** Pair count stabilises in the census; day-tick time
  does not grow with the day.

### 3.6 Test fixtures

- **Issue.** The functional run is one 800-day scenario; checks depend
  on what the world happened to do (Japan sanctioned, Germany at war,
  Belarus occupied), four were made to search for a country at peace,
  and the run times out under parallel load. Census probe copies are
  made by replacing the seed list in the source.
- **Proposal.** `tools/smoke.py` gains `--seeds` for eval probes and a
  fixture helper in the page (`fixture(seed, days, setup)`) so each
  stage's block starts from `newWorld` and a known setup rather than
  from whatever the previous block left; the long-scenario checks
  (cadence, economy census) keep one shared 800-day world. The
  functional case splits into two browser runs (economy/decisions,
  diplomacy/war/government/events) so neither exceeds the hold under
  load.
- **Verification.** Suite green; total wall time not worse.

---

## 4. Larger reworks

**Summary.** Two things in the design are structurally awkward and
worth a proper rework rather than a patch. First, there are two
economies: an unbounded output that is the real quantity, and a clamped
0..100 index that twenty-one readers still use, so above the reference
level a rich country and a very rich one look the same to the systems
that decide wants, sanctions and spoils. Second, decision utilities add
up numbers in different units and tune the result with weights found by
sweep, so every new candidate action is a new tuning session. The
proposal is a single economic scale read everywhere (a log index) and a
single unit for every decision (days of income, with penalties as
multipliers). Both are the size of a stage: each needs a census and a
tuning pass, and they should be done after sections 1–3.

### 4.1 One economy, one scale

- **Issue.** `output` (unbounded) is the truth; `st.economy = clamp(100
  × output / econRef)` is what wants (`js/decide.js` ~196), the sanction
  utility, the spoils factor `(0.5 + economy/200)`, the academia and
  stability drift targets (countries.js), the map's economy layer and
  the trade goodwill term read. Above `econRef` the index is 100 and
  those readers stop distinguishing. `st.resources` is likewise a
  derived value (the binding balance) stored in the stat bag and
  written every day by `driftAll`.
- **Proposal.** Replace the index by `ecoIndex(s) = 50 + 25 ×
  log2(output / econRef)`, unbounded above 100 for readers that want a
  number and clamped only for display bars; remove `economy` and
  `resources` from `STAT_KEYS` (they stop being stats; the screen and
  map keep their tiles reading the accessors). Every reader of
  `st.economy` calls `ecoIndex`; every reader of `st.resources` calls
  `floorOf`. The save keeps `ou` (output) and drops the two derived
  entries from `st`.
- **Verification.** Suite green with `growthCapped`, `productionBalances`
  unchanged; census: wants and spoils now differ between rich and very
  rich countries (spoils share of wars should shift toward richer
  targets).

### 4.2 Decisions in one unit

- **Issue.** In `candidates()` the utilities are: invest `wNeed × gap/100
  × weight − guard`; trade `wTrade × (wLack × relief + relA + goodwill)
  − dealCrowd × n`; sanction `wSanction × −rel/100 × economy/100 −
  cost`; pact `wPact × (threat + rel)/100`; war `aggr × edge × (greed +
  enmity) − warThreshold − weary/100 × wWeary − 1 (stability < 40) −
  guard`; join `wJoin × (rel/100 + loyalty + winning) − …`; peace
  `wPeace × (losing − 0.3) + 0.5`; border `…`; research `wResearch ×
  science × …`; hold `0`. Then softmax at `decideTemp` 0.6. The scales
  are unrelated; the weights (`wSpoils` 2, `warThreshold` 0.35,
  `borderMin` 0.15, `dealMin`) were found by sweeps.
- **Proposal.** Every candidate returns a **value in days of the
  country's income** (what the move is expected to be worth over the
  government's `horizon`, less what it costs) and a **risk** in 0..1;
  `U = value × (1 − risk × caution) / horizon`, so U is "income-days per
  day of horizon", comparable across actions. Concretely: a deal's value
  is its gain per day × term (already computed in `proposeSwap`); a
  project's value is the stat's want gap × a per-stat `valueOfPoint`
  (income-days per point, a Config row per stat) less its cost; a war's
  value is spoils × expected occupation length × win probability (from
  the estimate) less attrition and the war chest, risk from the
  estimate's spread; a sanction's value is the relations and standing it
  buys less the deals it ends; hold is 0. Temperament and government
  enter as the per-stat values and the risk aversion, not as additive
  weights. `softmax` keeps `decideTemp`, now in income-days. The old
  `w*` weights are deleted; the tuning screen gets `valueOfPoint.*`,
  `riskAversion`, `decideTemp`.
- **Verification.** A new probe (`tools/probes/decisions.js`) prints the
  utility distribution per action across countries; census war rate,
  deal count, sanction count and project mix within the stage 8 bands
  after one tuning pass; smoke checks on the decision loops unchanged.

---

---

## 5. The deferred sessions, and where they fit

**Summary.** Four pieces of work were set aside during the redesign:
the curated-defaults session, the population overshoot-and-collapse
behaviour, fronts and coalitions, and the outbreak pass shared with the
bench. None of them is independent of the changes above. The defaults
session is data that several of the fixes want to read (regime type,
endowments, climate zones), so it belongs early, right after the data
model is cleaned; the population cycle needs the economy to be a single
scale and blows to land on output before it can be tuned, so it follows
section 4.1; fronts and coalitions extend the defender path and want
decisions in one unit, so they follow 4.2; and the outbreak pass should
come last, because its reactions are decisions too and should be
written in the new unit rather than re-tuned twice. The proposal is to
slot each session into the order below rather than run them as
separate programmes.

### 5.1 The curated-defaults session (done, September 2026: `js/data.js`, `tools/probes/defaults.js`, `docs/defaults-review.md`) — after 3.3, before any tuning

- **What it covers.** Populations for the ~40 territories that sit at
  0.001 M with zero potential (`COUNTRY_POP` in geo.js); the
  political-freedom and regime-type list (`GOV_SEED`, first cut, now
  inferring juntas for much of Asia and Africa); the climate zone list
  (`CLIMATE_ZONES`, first cut); the rivalry table; the mountain ranges
  (`RANGE_CAP`); the 64 curated stat rows and the 91 resource
  overrides; and the "curated defaults and such" reminder from system 2
  of the review (seeds, overrides, urban share).
- **How it fits.** Finding 9 (regime type inferred from two numbers) is
  *resolved* by this session rather than patched: after 3.3 makes type
  a data field, the session fills it. Finding 4's `endowRel` and 3.3's
  derivation of `res` from `potential` mean the session curates one
  endowment table, not two. Every census after this session is on real
  data; running 4.1's and 4.2's tuning passes before it would tune to
  placeholders.
- **Proposal.** One data module, `js/data.js`, with one row per country
  and named columns (population, stats, endowment, authority, freedom,
  econOpen, regime type, climate zone, urban share) replacing the
  scattered `SEED`, `REGION_BASE` fallbacks, `RESOURCE_RICH`,
  `GOV_SEED`, `CLIMATE_ZONES`, `COUNTRY_POP`; region fallbacks stay for
  what is left blank. A probe (`tools/probes/defaults.js`) that lists,
  per column, which countries fall back to the region and which curated
  values are outliers against their region, so the session works from a
  list. The session itself is the user's: I propose values row by row
  from that list and the user corrects them.
- **Verification.** The probe reports zero countries with population
  under 0.05 M and none with a fallback in type or zone; the census
  "famine" count drops by the ~30 empty territories.

### 5.2 Population overshoot and collapse (done, September 2026: see "Population cycle as built" in `world-sim.md`) — after 4.1

- **What it covers.** The target behaviour recorded in
  `docs/world-sim.md`: populations overshoot what their supply can feed,
  draw the stockpiles down, and collapse late, the way a bench plate
  does; good governance, pacts and technology damp the wave; a
  mismatched regime, low technology and poor access deepen the trough.
- **How it fits.** It needs 1.1 (blows land on output, so a collapse
  can be seen in the economy), 4.1 (one economic scale, so the coupling
  between output, need and population is one loop), and 5.1 (real
  populations). The levers are all in place already: `stockDays`,
  `stockFill`, `famineBelow`, `deathFamine`, `deathMax`, `birthBase`,
  `deathCrowd`, `popPerKm`, `growthBase`, `degrowthRate`.
- **Proposal.** A long-run probe (`tools/probes/population.js`: six
  seeds × 20 years, reporting peak, trough and period of population per
  country band — governance × technology × access) and a tuning
  session against it. The mechanism to make the cycle rather than a
  ceiling: births read the *stockpile* as well as today's balance
  (`birthStock`: a full store feels like plenty), so growth continues
  past the point where production covers need and the correction
  arrives only when the stores are gone; famine mortality then bites
  harder where medical and technology are low (`deathFamine ×
  (1.5 − medical/100)`, already partly there). Damping: pacts and deals
  (a partner's surplus arrives before the stores empty — stage 4 did
  this), legitimacy (a legitimate regime rations: `rationLegit` lowers
  consumption per head in shortage), technology (production per head).
- **Verification.** The probe shows, per band: the well-governed,
  connected, advanced band with shallow waves; the mismatched, isolated,
  backward band with deep troughs and slow recovery; no country growing
  without bound and none dying out.

### 5.3 Fronts and coalitions — after 4.2

- **What it covers.** Wars as more than duels: a coalition on either
  side with a shared front, allies who fight on their own borders, wars
  that spread.
- **How it fits.** It extends section 2 (the defender path: allies who
  join, mobilisation) and wants 4.2 (join and war decisions valued in
  income-days, so a coalition's members weigh the same war
  consistently). The world-war massive event already pulls pacts in;
  this makes that the ordinary case.
- **Proposal.** A war record keeps a `front` per belligerent pair that
  shares a land border (the existing war score becomes per front); an
  ally who joins opens a front with the enemy if it borders it,
  otherwise contributes force to its friend's front at `pactShare`; the
  war ends when the principal's front ends. Attrition and deaths per
  front. Kept small: no supply chains, no theatres.
- **Verification.** Smoke: a three-country war where the ally borders
  the enemy opens a second front; census: multi-front wars occur and
  end.

### 5.4 The outbreak pass (system 12) with the bench — last

- **What it covers.** The review's deferred system: the outbreak's
  spread, detection and response against the new country model
  (medical as health, borders as authority's lockdown, reactions as
  spending), and the bench changes the user wants alongside.
- **How it fits.** Reactions are decisions (`react()` in decide.js,
  its own scoring) and should be written in 4.2's unit rather than
  tuned now and again later; climate per country is already read
  (stage 7); medical's narrowing to health (stage 2's intent) becomes
  real here. It is last because it is the only piece that also changes
  the bench, and the user asked for that pass to be its own session.
- **Proposal.** Its own review-and-plan session, as system 12 was
  deferred, opened with the list of what the country model now offers
  the outbreak: per-country climate, health as `medical`, force for
  enforcement, legitimacy for compliance, refugees as a vector, deals
  and market access as exposure.
- **Verification.** Its own plan's.

### 5.5 The action-ROI study — after 5.4

- **What it covers.** Every `valueOf*` row in the decision layer is a
  guess. The layer prices nine kinds of action in one unit (4.2's
  income-days) and nothing has ever measured what one actually returns,
  so a regime can rationally prefer the action that pays least. The one
  time it was checked informally, the war prize promised 100 % of income
  against a realised +0.4 %.
- **How it fits.** It needs the decision layer settled and the powers
  pool in place, because the powers add their own base weights to the
  same problem: a pool where `publicWorks` is drawn three times as often
  as `fiveYearPlan` is only right if it is worth something like three
  times as much.
- **Proposal.** A probe that, on every action a country takes, records
  the predicted `value` and its `parts` alongside the country's state;
  follows that country for a year; and measures the realised change in
  output, stability, treasury, technology, legitimacy and supply, all
  converted to income-days by the same conversions the prediction used.
  The output is a predicted-against-realised distribution per action,
  and the deliverable is a retune of the nine `valueOf*` rows and the
  power base weights against it.
- **Why it is hard.** The counterfactual. A country that invests and
  then grows may have grown anyway, so the study needs either paired
  runs from the same seed with the action suppressed, or a matched
  comparison against countries in a similar state that did not take it.
  Paired runs are cleaner and affordable, because the action set is
  small and the seeds are deterministic.
- **Verification.** The retuned rows must leave the census outcome
  distributions and the cycle's shape where they are, while the
  predicted-against-realised scatter tightens: no action's prediction
  should be out by more than about a factor of two at the median.

---

## 6. Scarcity: pricing, cartels, and technology's energy upkeep

**Summary.** The exchange removes the need for war because it never
lets a shortage hurt. World production is set at 1.3–1.5 times need,
every surplus is dumped on the exchange whatever the price, the world
stock sits at its cap, and the price reverts toward 1 and settles at
0.5–0.7. A country that lives on imports pays a small share of its
income for them, forever, and nothing about that is worth fighting
over. The user's two proposals both raise the price of dependence: a
deal by which sellers agree a price floor for a resource on the
exchange, and an energy upkeep for technology that makes energy
scarcer and technology something that can be lost. My recommendation
is to take both and to put two things under them that make them bite:
a price that answers scarcity (how many days of cover the world stock
holds) rather than only the day's imbalance, and sellers who withhold
rather than dump when the price is below their reservation — the
cartel floor is then just a shared reservation price. With those, the
dependency term of war greed (1.4) and the deal candidate both read a
real cost, and the resource motive comes back through the economics
instead of through a weight. Alternatives are listed under each item.

### 6.1 A price that answers scarcity

- **Issue.** `js/economy.js` clearing: `price × (1 + priceElastic ×
  pressure) + (priceBase − price) × priceRevert`, pressure = (buys −
  sells) / (stock + sells + buys). With sells above buys most days and
  the stock at its cap, pressure is negative and small, and the price
  reverts to 1 from below. Scarcity has no price: a world stock of ten
  days and one of one day cost the same.
- **Proposal.** The price rests on the world's **cover**: `cover_k` =
  world stock / world daily use; `restPrice_k = priceBase ×
  (coverRef / max(cover, coverMin))^priceCurve` (coverRef 10 days,
  priceCurve 0.7, coverMin 0.5), so a stock draining to two days
  triples the price and a glut halves it. The daily imbalance term stays
  as the fast movement; reversion goes toward `restPrice` rather than
  toward 1. `worldStockDays` grows to 30 so gluts and droughts of
  supply last long enough to matter, and the cap on the world stock
  becomes soft (sells beyond it are accepted at a falling share rather
  than refused, so a glut shows as a low price, not as unsold cargo).
- **Alternatives.** (a) Turn the existing knobs only: `priceElastic`
  up, `worldStockDays` down, `priceRevert` down. Cheap, and it does make
  prices swing, but the exchange still absorbs every surplus, so the
  swings are noise around the same low mean. (b) An import ceiling: a
  country may buy at most `importCap` of its need a day, beyond which
  it is short. This makes dependence *risky* rather than expensive, and
  turns shortage into a cliff; I would not, but it is a lever to keep in
  mind if prices alone leave dependence too comfortable.
- **Verification.** Probe: prices track cover across a forced drought
  of energy (potential of the top five producers halved for a year);
  census: material and energy prices show a wider range and the
  dependency bills appear in the income lines.

### 6.2 Sellers withhold; a price-floor deal among them

- **Issue.** A seller offers its whole surplus every day at any price
  (`orders.push({… surplus})`, accepted pro rata). There is no
  reservation price, so no one can hold out, and a cartel has nothing
  to enforce.
- **Proposal, part one: reservation.** Each seller offers a type only
  when the world price is at or above its reservation for it:
  `max(reserveMin × priceBase, floor_k)` where `reserveMin` 0.4 and
  `floor_k` comes from its deals (below). Below the reservation the
  surplus goes to the stockpile up to its cap and the rest is lost.
  Withholding therefore costs the seller: its stores fill and then it
  wastes, so a floor only holds while the members' shares are large
  enough that prices actually rise. The stockpile's role as a buffer
  against the market is what makes holding out possible at all.
- **Proposal, part two: the price-floor deal.** A new deal kind on the
  pair, `{ floor: { type, price }, until, since }`, between two
  countries that are both net sellers of the type (`standing().spare[k]
  > 0`): while it runs, each member's reservation for the type is at
  least the floor. A bloc is a set of pairwise floor deals, so a
  country's effective floor for a type is the highest of its live
  floors. Proposal value to each side: `(floor − price) × my surplus ×
  hold`, where `hold` is the members' combined share of world sells of
  the type (a cartel of small sellers holds nothing); the floor offered
  is `restPrice × floorMark` (1.3). Acceptance as for other deals (both
  sides gain); relations bonus in proportion; the deal ends by term,
  sanctions or war. Buyers see it: a floor deal among a buyer's
  suppliers ripples `thirdParty` of a negative step to that buyer
  (enmity of the dependent), which feeds sanctions, the dependency term
  of war greed, and the search for other suppliers — so cartels create
  the pressure that the resource game was meant to have.
- **Alternatives.** (a) An n-ary cartel object (a list of members per
  type) instead of pairwise deals: cleaner to read, more machinery (its
  own record, save fields, join and leave decisions). Pairwise deals
  reuse everything and approximate it; I would start there and promote
  to a cartel object only if blocs of four or more turn out to matter.
  (b) Export quotas (members cut sales by a share) instead of a floor:
  the same effect stated in quantity; harder for a buyer to see and for
  the decision code to value, since the price outcome is indirect. The
  floor is the better contract because the seller's reservation is
  exactly the thing a floor sets.
- **Verification.** Smoke: two large sellers of energy sign a floor;
  the world energy price rises toward it within a month while buyers
  of energy cool toward them. Census: floor deals exist, and prices of
  the cartelised type sit above the others' rest price.

### 6.3 Technology's energy upkeep, and decay when it is not paid

- **Issue.** Technology costs nothing to hold. Its only downward force
  is the slow drift toward academia (set in stage 7), so a high-tech
  country stays high-tech through any crisis. Energy, meanwhile, is the
  least scarce type (balance 1.4–1.5).
- **Proposal.** Technology consumes energy: `needEnergyTech ×
  technology × population` a day joins output's and force's energy
  needs in `assess()`. When the country's energy balance is short, the
  shortfall is taken first from technology's upkeep (before output's
  and the army's, on the view that a country in an energy crisis keeps
  the lights on and the tanks fuelled before the laboratories), and
  technology decays at `decayTech × (1 − share paid)` a day — very
  slowly: 0.03 a day at a full outage, a point a month. The country
  screen shows the upkeep in the energy row and a "technology decaying"
  chip. Two consequences follow without further design: energy is
  scarcer world-wide (the starting normalisation `energyBalance0`
  absorbs the new need so day one is unchanged, but growth of technology
  and population raises it), and a country cut off from energy — by
  sanctions, a broken deal, a cartel, a war — loses its edge over
  months, which is a reason to fight for energy and to keep a store of
  it.
- **Alternatives.** (a) A money upkeep for technology like the ones for
  infrastructure, the army and hospitals (`upkeepTech`, decays when the
  budget skips it): simpler and symmetric with the other stats, but it
  makes technology a matter of money, not of energy, and the user's
  point is that energy should be the thing. (b) Both channels: energy to
  run it, money to maintain it. Defensible, but two ways to lose the
  same stat make the tuning harder; I would add the money channel only
  if the budget's "which upkeep to cut" decision turns out to need
  technology on its list. (c) Keep only the academia drift as decay:
  what exists today; it is a human-capital story and does not connect
  to resources at all.
- **Verification.** Smoke: a country with its energy potential zeroed
  and no market access loses technology over 100 days and none of its
  output's or army's energy is cut before technology's; census: energy
  balance and price shift, technology's distribution keeps its spread.

---

## Order and verification

Decided: the deferred sessions stay deferred — 5.1 (curated defaults),
5.2 (population cycle) and 5.4 (the outbreak pass) are not part of this
work; 5.3 (fronts and coalitions) is. Each section opens with a short
multiple-choice Q&A to settle its open choices before code is written.

1. Section 1 (defects, with 1.4's dependency term reading the market
   bill), then a six-seed census.
2. Section 6 (scarcity) in the order 6.1, 6.3, 6.2 — the price first
   so the other two have something to read; the energy upkeep before the
   cartel so the cartel's census shows its effect on a scarcer type —
   then a census and a war-rate sweep (`wSpoils`, `wNeedWar`).
3. Section 2 (defender path), then a census.
4. Section 3 in the order 3.1, 3.2, 3.3, 3.5, 3.4, 3.6; suite after
   each; a census after 3.5 (pair count).
5. Section 4.1, then a census; 4.2, then a census and a tuning pass.
6. Section 5.3 (fronts and coalitions), then a census.

Deferred, unchanged: 5.1, 5.2, 5.4 (their proposals stay in this
document for when they are taken up).

After every step: `python tools/smoke.py` green (functional and
layout); after the steps marked: `tools/probes/census.js` across the
six seeds, compared with the stage 8 table in `docs/world-sim.md`
(and, from step 3 on, with the post-defaults baseline).

---

## 7. The balance pass after the census (September 2026)

**Summary.** The six-seed census after sections 4 and 5.3 showed eight
oddities. In three seeds of six half the world was short at year three
with money in the bank, because a buyer refuses any non-vital type
above `priceLimit` and orders only its single worst shortage a day; a
short war mended relations, because peace floors relations above the
declaration's hit; the same pairs re-fought the day the truce lifted;
coalitions reaching by air knocked out superpowers in a fortnight and
an air-only ally occupied a principal; water sat at its glut floor
under twenty price floors; the cartel cap bound only the proposer;
twenty treasuries sat at a flat cap; fronts rarely decided anything.
The pass fixed them in six groups, each followed by the smoke suite and
a census, in this order (done; the record and the final census are under
"After the review: the balance pass" in `world-sim.md`; the estimate
also learned to count only allies who would come, which the census
forced):

- **A. The market.** Buy every shortage, the worst first, within
  means, at any landed price; buy ahead into the stores only below
  `priceLimit`; `dealSlot` becomes a small premium.
- **B. Endings and truces.** Peace never lifts relations above where
  the war began, less `peaceScar`; no offer before `peaceEarliest` (10
  days); a front that has not moved a band in `stalemateDays` (45) is
  a stalemate; truces drawn from a range; weariness fades at half the
  rate; an attacker remembers a lost or drawn war against a target
  (`lastWar`) and discounts its next estimate of it.
- **C. Fronts and coalitions.** A front moves at the pace of its
  reach; a country splits its force among its fronts by the threat on
  each (enemy force x reach); a defender without the technology for the
  domain (`techLow` at sea, `techHigh` in the air) loses its defence
  bonus and terrain and bleeds faster on that front, while such a war
  is dearer for the attacker in general (slow and attritional); the
  estimate counts the defender's reachable allies as the fronts they
  would open; only the principal or an ally that reaches the loser by
  land can occupy it.
- **D. Cartels.** No floor for a type nobody imports; the partner cap
  binds the accepting side too; cartels carry their own smaller
  relations step.
- **E. Treasuries.** The cap is `treasuryCapDays` of income; a country
  above its reserve discounts a project's cost, so the rich invest.
- **F. The rest.** A refusal dissolves the pact only when the principal
  called; calls go only to partners who could contribute; legitimacy
  re-checked; the small-state output leaders probed; the census rows
  for occupations and adoptions fixed.


## 8. The second balance pass (September 2026)

**Summary.** The chronicle of seed 12345 over ten years (the story
told in the session before this one) showed the world booming for
four years and grinding down for six on the materials wall;
occupations thrown out at a median of 83 days, two-thirds by uprising,
with no garrison, no levy and no reach through occupied ground; 221
violent revolutions, almost all in poor autocracies, because regime
type was only a succession rule and collapse a type-blind timer; and
a country pledged to both principals fighting one side while thanking
the other. Decisions taken: booms of 10-12 years with sudden busts and
a recovery that accelerates; the treasury cap closes gradually after a
bust; an occupier's manpower is limited by control (the garrison's fill
drives the levy, the uprising odds and the force tied down); sanctions
cost stability, the war penalty becomes a row, the `elected` rows with
freedom under the election floor are typed `party`, and rich,
legitimate autocracies can liberalise. Five sessions, in this order,
each through the smoke suite, the census and the probes at the end
(the record is under "The second balance pass" in `world-sim.md`):

- **A. Materials answer technology** (`matTechProd`, `matTechEff`,
  in the normaliser too). Done.
- **B. Booms and busts**: confidence, the bust, the endogenous crash,
  credit and the cap that follow confidence, the cycle probe. Done.
- **C. Occupation as control**: garrison, hold, levy, the uprising
  rate by hold, reach through holdings. Done.
- **D. Regimes**: coercion in the stability target and the collapse
  timer, the junta's crackdown, liberalisation, sanctions and war rows,
  the data types. Done.
- **E. Defenders and pact conflicts**: `defenceBonus` 1.3; a join
  candidate per side with its own caller, a free neutral refusal, the
  other pact left quietly, the estimate counting a torn ally on neither
  side. Done.

## 9. The third pass: hunger at the table, the price of armies (September 2026)

**Summary.** After the second pass the user asked for four things:
countries in famine should take or offer lopsided deals to secure food
and water; wars should kill more; military upkeep should rise with
technology; the army should be a slightly less attractive investment.
The map found that the decision layer never read hunger at all (no
deal valuation, cap or gap saw famine, the fed share, the stores or
rationing), that a hundred-day war cost the attacker half a percent of
its people, that technology multiplied force for free while upkeep
ignored it, and that the wanted army had no threat term. Decided:
casualties three times; upkeep half again at technology 100; a
starving country values food and water up to three times world price
and pays half of that over the odds; a threat term in the wanted army
beyond the two row changes. Done; the record is under "The third
pass" in `world-sim.md`.

## 10. The fourth pass: the frontier's energy, the war's return (September 2026)

**Summary.** Two asks. Technology's energy bill was linear and, because
it scaled with population rather than the economy, regressive: poor
countries at middling technology paid half their energy for
laboratories while the frontier paid a quarter, which is why 15-25
countries sat dark every census. It is now convex, shared by one
function between the economy pass and the world's seeder (they had
been duplicated with nothing checking they agreed), and the energy
balance no longer hides a shortage behind the laboratory bill. The war
decision was found to predict a fortune and deliver noise: `prizeOf`
counted the loser's production twice, once as spoils and once as
import relief that nothing ever paid, and an outright victory paid less
than a negotiated peace. The prize is honest, victory now carries the
terms for as long as the occupation holds, and three motives were
added: opportunism, pre-emption and revanchism. Decided with the user:
the square of technology with the frontier at +50 %; the balance tells
the truth with no shield; all three motives; terms tied to the
occupation. Done; the record and the census are under "The fourth
pass" in `world-sim.md`.

## 11. The fifth pass: the steep endowment, and a country that answers a shortage (September 2026)

**Summary.** The endowment curve was steepened to 1.5 and the cap raised
to 200, which gave the world real exporters and broke its importers: the
seeder pins the world total, so the same energy simply had further to
travel. The energy price went from 0.65-0.79 to 1.76-4.56 at year three,
dark laboratories from 16-22 to 30-48, countries in debt from 32-45 to
56-73. Raising the energy slack to 1.8 erased all three and was rejected
by the user as the wrong kind of answer, on the grounds that the world's
energy had not changed. That was correct, and the diagnosis it forced is
the finding of this pass: **no country in the model responded to being
short of anything.** Four decisions were missing, and all four are now
in: a shortage raises the wanted infrastructure, which is the only thing
that reaches a country's own endowment; an exporter's commitment and
partner count scale with its surplus instead of being flat; a country
past its credit limit keeps three days of income for bread, water and the
lights instead of buying nothing at all; and a dear market bill raises
the weight on science, which is the only route to using less. The energy
slack is back at 1.45 and the exchange buffer untouched. Done; the record
and the census are under "The endowment steepened, and countries that
answer a shortage" in `world-sim.md`.

**What it leaves open, measured.** The four together do not replace the
slack. At year three across six seeds the energy price is 1.01-7.82
against 0.63-0.72 with the slack and 0.92-2.60 with neither, dark
laboratories 23-56 against 15-25 and 26-48, and countries in debt 55-80
against 46-51 and 54-73. The package is level with doing nothing on the
median and worse on the tail.

An isolation pass, one change off at a time, could not attribute the
regression, and finding out why is the more useful result. **The energy
price at 1.45 slack is a spiking series, not a level.** Within a single
run it swings by up to 5.8x across three years, seed 2024 going 1.96,
5.90, 1.01 in consecutive years, where the rejected slack held every
seed between 0.63 and 0.91 with a worst swing of 1.4x. So the slack was
buying stability rather than cheapness, the world at 1.45 runs at the
edge of its energy supply, and a year-three price reading carries little
information. The isolation's differences are smaller than a run's own
swing.

What the isolation does establish, from slow stocks rather than a spot
price, is that the two investment changes are inert on the real economy
within three years: technology, academia, infrastructure and the
laboratory share of energy are all unchanged to within a point. The
dark-laboratory counts point at the exporter change as the largest single
contributor, which fits a seller committing nine tenths of its surplus to
fixed bilateral deals and leaving less on the exchange for whoever holds
no deal. That is a lead, not a conclusion.

**A method note for later passes.** Comparing a one-day reading of the
clearing price across configurations is not a measurement when the series
swings by five times on its own. Count-based stocks (dark laboratories,
countries in debt, countries short) are monotone enough to compare;
prices need a trajectory over many years, which is what `tools/cycle.py`
is for, or a distribution over more seeds.

**The twenty-year comparison, which settles it.** Same seed, with the
four changes and without: the energy price peaks near 3 around years four
and five in *both* runs and settles to about 1 by year nine in *both*.
The energy crunch is a start-up transient of the steepened endowment,
present whether or not any of this is, and the year-three census samples
its rising edge. Every reading taken at year three, including the one
that condemned this pass and the one that justified the slack, was
measuring when rather than what. The slack's real effect was to remove
the transient, holding the price flat from the first year.

The four changes are kept. Over twenty years they are neutral on the
energy price, cost a slightly deeper post-peak drawdown (41 % against
36 %) and buy consistently **fewer dark laboratories from year seven
onward**: 29 against 35, 28 against 36, 17 against 31, 16 against 21.
Each of them also fixes something that was independently wrong.

**And the real problem this exposed belongs to a later pass: the
materials cycle is far longer and deeper than the design asks for.** In
both runs output peaks around year 13 and loses 36 to 41 %, with
materials reaching about 10 and world cover at zero for three straight
years. That reads as a collapse at year twenty and is not one: the
monthly series puts the trough at month 224 of 243 and shows the wall
breaking over the last eighteen months, materials falling from 9.8 to
0.63, cover returning to ten days, countries short dropping from 85 to
29, and confidence climbing for five straight readings. It is overshoot
and correction, where the lost demand is what clears the wall. The "46
of 64 never regain their peak" figure is mostly the run ending on the
down leg.

The complaint is the shape: boom length a median 5.6 years against the
10 to 12 wanted, a world down leg from year 13 to year 19, bust duration
16 months against 12, and depth at the top of the 20-40 % band. That is
larger than anything the energy price was doing.

**A second method note.** Judging a cycle from the last value of a run
is the same error as judging a price from one day of it. Both readings
in this pass, the year-three census and the year-twenty output, were
sampling a phase rather than measuring a state. Look at the series.

The finding underneath is that **behaviour cannot close a physical gap.**
Access to a country's own endowment spans 0.4 to 1, so every decision a
country can make is worth at most two and a half times its own
production, and the steepened curve took more than that from a
low-endowment country. The changes stay because each fixes something
that was independently wrong, but the energy problem needs a physical
answer, and the obvious one is that water has a buildable substitute
(desalination, gated on infrastructure and technology and paid for in
energy) while energy has none. That is the next proposal.

## 12. War priced as it is charged, and the ROI study's first half (September 2026)

**Summary.** The decision layer and the world had never been reconciled
about the cost of a war, and `warCost` turned out never to be charged at
all: it lived only inside `incomeLine()`, a display report, while the docs
asserted in five places that it was spent. The full accounting put a day
of war at about 4.1 income-days against a believed 2.9, with the whole of
the gap in the unrest channel, which the bundled `warDayCost` could not
see. The money cost is now actually charged and scales with the force
fielded; the war candidate carries named terms for money, kit and unrest,
each read off the row the world charges; `defeatCost` replaces the flat
`defeatWorth` by reading the winner's own prize from the other side plus
the regime scar; and three faults went with it (the occupation skim minted
money, military upkeep ignored the levies that force counts, `warStab` and
`warAttrStab` were harsh enough to leave a country half destroyed by one
war). Done; the record is under "War priced as it is charged" in
`world-sim.md`.

**Section 5.5's war half is done.** The ROI probe
(`tools/probes/warroi.js`, `tools/warroi.py`) follows every declaration
and measures what the war returned, in days of the attacker's income. On
72 wars over eight years the prize predicted 51 and realised 0, the
campaign predicted 26 and realised 0.8, and the chance of winning
predicted 0.99 against a realised 0.62. A third of wars paid for
themselves; 57 % took no ground.

**Attrition did not scale with the intensity of the fight, and now does.**
`bleed` took `warMilAtt` a day whether the odds were even or eight to one,
so a walkover cost the same per day as a slugging match and only the
shorter length of a lopsided war distinguished them. A sweep found the war
rate stuck at 0.8 a year across a 7.5x range of the stability rows,
because kit, not unrest, was what bound. `intensityOf(odds)` now scales
the whole bleed, each front by its own odds, and the same expression
prices it in the war candidate. With `warStab` 5 and `warAttrStab` 0.03
the rate is 5.8 a year and the bill tells an even fight (4.3-5.7
income-days a day) from a rout (2.4-2.8). Fixed in this pass.

**A correction, recorded because it was asserted here as fact.** An
earlier version of this section claimed the decision was grossly
overconfident, predicting a 99 % win and realising 62 %. **That was a
defect in the probe, not the model.** `tools/probes/warroi.js` computed
the prediction itself, as `pWinOf(strength / strength)` — a bare force
ratio no government ever sees. `estimateRatio` already divides by
`defended` (so the dug-in bonus and terrain are in), already anticipates
the mobilisation that declaring triggers, and already weights every
potential ally on both sides by its own `joinChance`. The reader
compounded it by counting wins over all wars while stalemates and bare
peaces sat in the denominator unseen.

Measured properly, on the ratio governments actually judge, the decision
is close to calibrated and the error is concentrated in one band:

| judged odds | wars | predicted | won rate | won | lost |
|---|---|---|---|---|---|
| under 1.2 | 4 | 0.47 | 0.25 | 1 | 3 |
| 1.2-1.6 | 3 | 0.69 | 0.33 | 1 | 2 |
| 1.6-2.5 | 17 | 0.82 | **0.75** | 12 | 4 |
| 2.5-5 | 26 | 0.92 | **0.62** | 15 | 9 |
| 5 and over | 26 | 1.00 | **1.00** | 26 | 0 |

A 17-point gap overall, not 37, with two bands essentially right. **The
remaining pathology is the prize motive**: 33 wars declared for it predict
417 income-days, realise nothing and win 39 %, while 42 wars of enmity
predict 4, realise 1.4 and win every time.

### 12.1 The multi-front rule and the length cap, measured before changing either

Two concerns were raised about how wars end: that losing a whole war to a
small side front makes no sense, and that the 240-day cap should give way
to rising costs bringing both sides to the table. Both were measured
first, on 76 wars over eight years with the probe recording the
principals' front score, the front count and the ally count at the moment
each war ended.

**The multi-front rule fires constantly, in the attacker's favour, and a
first reading of it here was wrong.** The asymmetry is real in the code:
`endFront` (`js/decide.js:1221`) ends the whole war as a defeat if either
*principal* loses any front, while an **ally** that loses its own front is
merely knocked out individually. It is not cosmetic — the loser takes the
full victory path (`js/decide.js:1265`), so `defeatShift`'s permanent
authority scar, tribute and a ~75 % occupation roll all apply. An earlier
version of this section called it latent because of 18 attacker losses
**none** happened while the attacker led its own front — which is true,
and is half the story:

| how the 18 losses happened | n |
|---|---|
| beaten on the front it chose (score <= -0.9) | 10 |
| behind but not beaten | 8 |
| **ahead on its own front when it lost** | **0** |

The other half, read from the log entry each ending writes rather than
inferred from the score: of 32 attacker victories, **17 were decided on a
side front**, all 17 with a side front open at last sight and none
without. The defender, a principal, lost a front against one of the
attacker's allies, and the whole war ended as an attacker victory with the
defender's territory usually following. That is the rule the user called
nonsensical, and it is the single largest mechanism of decisive victory
in the model. It never costs an *attacker* a war, because an attacker is
far stronger than the minor allies that open fronts against it; it costs
*defenders* wars constantly, because an attacker's allies are chosen to
reach the defender and the defender is already diluted across fronts by
`frontShare`. So it is not cleanup. It decides wars.

The same instrument also caught a probe artefact that had masked this:
occupations were credited to a war from declaration to the end of the
run, so a later war between the same pair, or the defender knocked out as
somebody's ally, was counted against an earlier war that ended at the
table. Nineteen such were excluded once an occupation had to begin within
two days of the war it is credited to.

**The length cap is already dead.** No war in 76 came within a third of
the 240-day cut:

| days a war actually runs | min | median | 90th | max |
|---|---|---|---|---|
| | 10 | **18** | 43 | 153 |

Only 6 of 76 reach even the 45-day no-movement stall window, and exactly
one war was ever *expected* to outlast 240 days. So removing `warMaxDays`
is free, and would change nothing.

**The real shape problem is the opposite of the assumption: wars are too
short.** Won wars end at a median score of **+0.66**, well short of the
±1 that means a military decision, because the losing side sues for peace
as soon as |score| passes `peaceTermsMin` 0.2, and `peaceEarliest` lets it
from day 10. Every band ends sooner than the decision expects:

| judged odds | n | expected days | actual |
|---|---|---|---|
| under 1.6 | 7 | 138 | 21 |
| 1.6-2.5 | 17 | 56 | 25 |
| 2.5-5 | 26 | 34 | 22 |
| 5 and over | 26 | 21 | 13 |

So "costs should bring both sides to the table" is already how wars end —
by negotiation, quickly, at modest scores. What is missing is the other
half of the wish, that a war *can* run long when both sides have reason
and means to continue. That needs peace to be harder to reach early, not
a cap removed. The one lever that points the right way and is not yet
wired: weariness rises monotonically through a war (`wearyPerDay` 0.4,
decaying only in peacetime) and `peaceValue` never reads it, so the
quantity that should make a long war intolerable plays no part in the
decision to end one.

**What remains genuinely wrong** is the 2.5-to-5 band: 26 wars predict
0.92 and win 0.62, and the losses there are real defeats on the chosen
front, not bookkeeping. `estimateRatio` treats a defender's reachable
allies by diluting the attacker's force through `weigh`, while
`frontOdds` adds `pactShare x force` to the defender's side of the
principals' front for any ally without a front of its own. Those are
different treatments of the same ally and the gap is the most likely
residual. It is not yet measured, and should be before anything changes.

### 12.2 How a war ends: the ladder (September 2026)

Three questions were put: can a side sue for peace and get a stalemate;
how are terms offered; and is the losing side suing too easily and taking
penalties a better offer later might have lessened.

**As the code stood.** A side could not ask for a stalemate: a bare peace
happened only if |score| < `peaceTermsMin` at the moment of signing, and
a labelled stalemate only from the 240-day cap or the 45-day stall,
neither of which fired in 76 wars. Terms were not offered at all: an
offer was accepted or refused on the other side's single `peaceValue`,
and `peaceTerms` then dictated an indemnity and a lease from the score.
One price existed at any score, so a better offer later could not. And
the premise about the loser was backwards: a negotiated loss cost about
55 income-days of indemnity where a defeat cost the permanent authority
scar, tribute and a three-in-four occupation, so suing early was the
loser's correct move by an order of magnitude. What was too easy was the
*winner* accepting, since with the war bill honest and the realised prize
around 16 income-days, taking the indemnity beat finishing from day 10.
Measured: 43 % of wars settled at the table at a median +0.56 after 13
days; 42 % attacker victories, 13 % defender victories.

**Done.** Terms are a four-rung ladder with a white peace as rung 0:
nothing; the indemnity; the indemnity and the lease; both and a one-off
tribute. No rung carries the scar or an occupation, which is what keeps
suing rational and is locked by `suingBeatsDefeat`. `peaceValueAt` prices
each rung for each side; `proposeRung` gives each side the rung best for
itself among those the other will sign, the side behind climbing from
rung 0 and the side ahead descending from rung 3; the `peace` candidate
is scored on the rung it would actually propose and absent when none is
mutually acceptable. Decided with the user: yes to the white peace, yes
to the ladder, **deferred** on weariness entering the peace calculation
(the user's view: continuing is costly in general and the calculus shifts
of itself — recorded against it that `rem × bill` shrinks as a war runs,
so on the present arithmetic it shifts toward continuing), and **measure
first** on `peaceEarliest` 10 and `peaceTermsMin` 0.2.

**Measured with the ladder in.** 95 wars against 76 on the same seeds;
settled at the table 35 % against 43 %, of which 19 of 33 closed on rung
0 at a median +0.57, 10 on rung 1, 4 on rung 3 with the defender ahead
taking tribute; median length 18 days, unchanged; attacker victories 44
against 32 and defender victories 17 against 10, sixteen of those with
the attacker occupied. The cheap exit makes war cheaper to start and the
extra wars are the marginal ones. Wars are not longer; that is the timing
rows or the deferred weariness term, not the ladder. The economy's census
is unchanged.

**A known asymmetry, recorded not fixed.** Whoever asks first sets the
price: at a score of +0.5 the side behind proposes rung 1 and the side
ahead rung 3, and the loser values ending the war at 400-490 income-days
on every rung because its fear of defeat dwarfs any terms. Its bargaining
power comes from the order of decision days.

**Also found on the way, by instrumenting endings from the log.** The
multi-front rule is not latent (12.1 corrected): 17 of 32 attacker
victories were decided on a side front against the defender, at a median
judged odds of 3.2 with one ally, so it is the largest single mechanism of
decisive victory in the model and the thing behind the mid-odds wars that
are won. It never costs an attacker a war. Separately, the probe had been
crediting later occupations to earlier wars between the same pair;
nineteen such were excluded once an occupation had to begin within two
days of the war it is credited to.

### 12.3 What you lack, the counter-offer, and cheaper arms (October 2026)

Four points were raised after the ladder measured: a nation having what
you lack should raise a war's value; the cost of raising and sustaining
an army should fall; a defender's cost to sustain a war should be a
little below an attacker's; and attackers should be more reluctant to
settle. **Done:** `needPriceOf` prices the production taken and a lease at
the taker's need (the hunger rule, generalised to all four types), where
`dependency` had been computed and discarded; `offerPeace` lets the
responder counter with its own best mutually-acceptable rung, so who asks
first no longer sets the terms; `milCostFactor` 0.75 makes an army
cheaper to raise and, through the kit term, to wear out. **Already true,
recorded:** the defender's attrition is 0.12 against the attacker's 0.2
and the attacker also pays the supply line; the defender's dead run at
twice the rate and it pays mobilisation on the day it is attacked.
**A seam left open:** `proposeSwap` keeps a food-and-water form of the
need rule, so deals carry no premium for an energy or materials shortfall
while the prize and the lease do.

**Measured (12.3).** 113 wars against 95: white peaces 11 at a median
−0.19 against 19 at +0.57, tribute peaces 16 against 4, so the counter-
offer ended the winner walking away; the prize up 8 %; declarations up
with cheaper arms; median 20 days; 20 % pay. Rung 2 is structurally
absorbed into rung 3 (the ladder is cumulative). Census unchanged.

### 12.4 The plateau lifts (October 2026)

The twenty-year run the debt changes were waiting for: the world ends at
72 % of its peak against 59 %, trough 45 against 36, and the materials
wall clears in two years against four before a second begins at year 20.
Pricing borrowed money into decisions and resting credit on a remembered
income is what lifted it. The cycle's recurrence now sets the shape, and
that is item 3.

### 12.5 The cycle's shape (October 2026)

Diagnosed before changing: busts are a country hitting the materials
wall, not contagion (8 % of 695 fall near a crash or in a recession), so
boom length is the staggered run to the wall and bust duration is the
wall's duration. The levers are when it arrives and what clears it, and
only demand destruction cleared it. **Done:** an exporter's wanted
infrastructure rises with the world price of what it sells
(`wantInfraExport`, `wantInfraPriceCap`), and a find's type follows the
world price (`findPrice`, `findPriceCap`), one draw from the stream as
before. `findNeed` was raised and reverted: it weights the finder's own
poverty of endowment, not the world's scarcity. **Measured:** boom length
9.2 years against 6.6 (target 10-12), bust duration 12 months against 16
(met), crashes 0.10 a year against 0.25 (met), world cover at zero one
month in twenty years against eight, the run ending at 86 % of peak
against 72 %. Three of four verdicts met with no slack moved.

### 12.6 A programme for every administration, stage 2 (October 2026)

Stage 1 drew the programme; stage 2 makes it do things. Three classes
from the table: `work` a shaped project raising every stat it names (the
project tick now raises a list, which makes technology investable through
a plan), `mod` the same project holding multipliers for the government's
life through `GOV.powerMul` at ten coefficient sites and `powerAdd` for
the two level rows, `act` an immediate effect for a lump of `enactDays` on
a cooldown of `enactCooldown`. One work or mod at a time
(`regime.enacting`), a finished one not repeated, all through `canEnact`.
The `enact` candidate prices each class in income-days, and legitimacy
gets its first price in the decision layer, `valueOfLegit`. The flat worth
of a standing programme, `valueOfMod`, is a guess recorded as one. Shown
on the government row, saved inside `regime`, tallied by the census. Eight
checks, one of which caught a stage-1 gap: only `install` drew a
programme, so seeded governments held none until replaced; `ensurePowers`
now draws lazily, keyed on seed and country. **Measured:** 2,328 holdings
across six seeds, the generic works leading at 6-7 % each down to the
dynastic marriage at 0.6 %, nothing absent; 1,189 works and standing
measures finished in eighteen seed-years; about 350 enactments a seed a
year. The economy's census is unchanged and legitimacy is up a point or
two, which is the programmes buying it. That enactment volume exposed a
cost: `taxIncome`, the hottest path in the economy, consulted the
programme on every call and slowed the day tick several-fold once every
government held one, enough to run the interface probe out of its hold.
It reads a per-day memo now.

