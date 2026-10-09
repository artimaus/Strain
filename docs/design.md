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

### 4.7 As built: the phase 1 round, 5 October 2026

The round opened on a prototype of §4.3 run on the real rows and the
map's areas (France, the United States, Nigeria, Bangladesh, Singapore
over three years; a calibration sweep over all 194 nations). Decisions:

- **Reserve ceilings.** Food by population (`endowment/100 × pop`);
  energy and materials by `endowment/100 × area^0.25`; each resource
  scaled so the world's ceilings sum to 1.5 times its starting need.
  The sweep: area^0.25 leaves 41 nations past their energy ceiling at
  the start, area^0.5 leaves 85, area^0.75 leaves 115; food by area
  starves 47 more than food by population. About 21 nations with no
  reserves (city states, islands, Gulf states) depend on trade from
  day one and are in famine until phase 2.
- **Tempo.** Building costs set so a nation with nothing pressing
  grows its development about 20% a year: 35,000 money and 350
  materials per unit of infrastructure, 26,000 per unit of economy.
- **Labour order.** Academia last, as designed. Known consequence:
  once the economy can absorb everyone, nobody researches and
  technology stalls in developed nations. To be mitigated by later
  pillars' resource and budget sinks that keep the economy in check,
  not by reordering.
- **Hoards.** Kept. Income past the spending cap accumulates; the
  treasury is the trade fund and the war chest.

Departures from §4.3 found necessary by the prototype, all now in
`nations.md` §1:

- The idle grow 0.6 food per million a day for themselves; without it
  poor nations starve on day one for want of infrastructure slots.
- Labour aims at a 10% food margin after energy and materials, so a
  surplus exists for births; the base need comes first.
- Research is per head: `researchRate × (researchers / pop)`, so a
  small nation can sit at the frontier; a big one does not out-research
  it by size alone.
- Exploration spends only when a resource is past its ceiling, on that
  resource; otherwise its share waits in the treasury.
- Technology's multipliers clamp at level 100; research slows as
  `1 / (1 + tech / techSlow)` without bound.
- The four development numbers get ±5% seeded noise; the treasury
  starts at 30 days of the cap and the stores at 15 days of use.
- Rainfall is relative to each zone's own optimum (1 at the start,
  swinging within the zone's band); a permanent zone penalty was tried
  and dropped.
- The budget rule gained two cases: a resource short *and* past 1.5
  times its ceiling turns the budget to exploration rather than
  infrastructure, and "nothing pressing" builds (the smaller of the
  infrastructure and economy shares) rather than researching, since
  research is bounded by researchers.

**First census** (six seeds, three years, `tools/census.py`, 5 October
2026): 194 nations; nations in famine 9 in every seed (city states,
islands, Gulf states: Singapore, Qatar, the Maldives, Malta, Kuwait,
Djibouti, Bahrain, Andorra, Western Sahara); nations with an unpowered
economy 13 to 15, India among them in five seeds of six and Japan
early on, their economies shrinking to what their energy ceilings can
power; idle share of the world 20%; world income 56,000 to 58,000 a
day; mean technology 61 to 62. China sits 25 times past its energy
ceiling and keeps paying by sheer infrastructure; the United States
and Brazil at about 2; Russia under 0.5. No nation vanished or
exploded. The pressures the trade phase is meant to answer are all
visible on the cards.

### 4.8 Assumptions built in

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

### 5.1 Trade (phase 2): as decided, 6 October 2026

The round's answers, then the mechanics built on them (`nations.md`
§2 has the formulas and levers).

- **Shape.** One world price per resource plus standing deals. Spot
  purchases cover today's shortfall at today's price; a shortfall
  bought from the same seller for a month becomes a deal.
- **Reach.** Goods move only between linked nations; an edge carries at
  most its capacity in units a day; a nation trades at most so many
  units a day per unit of economy, bought and sold together.
- **Price.** Daily, `price ×= 1 + elasticity × (asks − offers) / (asks +
  offers)`, bounded between a floor and a ceiling. No base it returns
  to.
- **Debt.** None in phase 2. A nation buys what its treasury allows.
  Lending waits for relations, when lenders can be nations.
- **Export.** After needs are met, the idle take the spare
  infrastructure slots and capture the resource that pays best at the
  world price against its strain, net of the energy it costs. Added
  after the first census (the idle alone brought 200 units a day to a
  world needing thousands, since the resource-rich nations have no
  idle): economy workers move to export while a unit of effort earns
  more at the world price than a worker makes in the economy, up to 1%
  of the economy's workers a day, and move back when it stops paying.
  A nation that went short at home exports nothing that day.
- **Rationing.** Pro rata by ask: each seller's offer is split among
  its linked buyers in proportion to what they ask, within each edge's
  capacity.
- **Deals.** A fixed amount a day at the price on signing, for a term,
  delivered before any spot trade; it lapses after a month of
  non-delivery and runs out at its term.
- **Comfort.** The store a nation keeps before selling shrinks as the
  world price rises: `comfortDays / price` days of use. Above it, a
  share of the excess is offered each day; below it, the gap is bought
  back over a month.
- **People.** The idle and the unhoused who leave go along the links to
  nations with free slots and housing, in proportion to the room, at
  most `migPerCap × capacity` a day per edge. Whoever finds no room
  stays.
- **The variant** rides the links in phase 3, on the flows this phase
  creates.
- **Capacity.** The links' capacities had been tuned for the old
  model's tourist flows: the world's edges carried 4,300 units a day
  against a need near 13,000, India's 127 against several hundred,
  Singapore's 8 against 9. The three capacity levers were raised
  fourfold (land 2, sea 1, air 0.2 per their units) so goods can reach
  where they are asked for; with that, a world price can mean
  something, since a single price over local markets only clears when
  the goods can move.
- **Found on the way.** Exporting never starves the exporter: capture
  for export is limited by the energy left in store after the day's
  upkeep, and no food leaves a nation in famine. A nation that went
  short keeps a month of its import bill before building. A nation
  that is unpaid and cannot pay that bill is broke and sells its
  stores of whatever it is not short of down to three days, half the
  excess a day, to pay for what it lacks. The economy works to the
  share of its upkeep it can pay in both energy and materials, and
  pays only for that share. A nation short of its upkeep builds no
  units it cannot power; only exploration goes on. And because the
  market is local, a nation captures for export only the resources a
  linked neighbour asked for and did not get the day before: the world
  price says what it pays, the neighbours say whether anyone is buying.
**Census with trade** (six seeds, three years, 6 October 2026): people
8,345 to 8,357 M (from 8,013); nations in famine 8 to 9 and short 12
to 13, all of them nations with no reserves and no income (Singapore,
Qatar, the Maldives, Malta, Kuwait, Djibouti, the Bahamas, Brunei,
Bahrain, the Emirates, Andorra, Western Sahara, Jordan); the idle
share of the world 9% (from 20% without trade); world income 59,000 to
64,000 a day (from 56,000 to 58,000); prices 0.8 to 0.9 for food,
0.6 to 0.7 for energy and materials, falling as supply finds demand;
1,370 to 1,540 units traded a day; 124 to 192 deals in force. India and
Bangladesh, short in year one, are paid up by year three on imports
of 9% and 14% of their use; Japan lives on imports and exports its
economy's surplus; Russia and Pakistan are the big exporters.

**Census after the sea links and the effort cap** (six seeds, three
years, 6 October 2026): famine in 2 nations (Singapore, the
Maldives); short 5 to 10 (Taiwan and South Korea in every seed,
Turkey in half); idle share 10 to 14%; income 56,000 to 63,000; prices
0.65 to 0.78 food, 0.53 to 0.60 energy, 0.39 to 0.55 materials, the
world in surplus; 2,450 to 2,770 units traded a day; 200 to 250 deals.
China, India and Japan, short at one year while the market caught up
with the capture they no longer make past three times their ceilings,
are paid up by year three on imports of 14%, 21% and 33% of their use;
the Gulf states export energy and eat. Taiwan and South Korea are the
dense, rich, reserve-poor cases left for the next pillars: they have
neighbours who sell and need an income to buy with.

- **After the first census.** Nations whose only links to a resource's
  exporters were air links of a few units a day (India for materials)
  stayed short with money in hand, since sea links ran only to the
  eight nearest coasts. Decided: every coast is linked to every coast,
  a shipping lane whose capacity falls e-fold per 6,000 km (`seaK` 0,
  `seaRange` 6000); about 11,800 sea edges, the day still under a tenth
  of a second. And the Gulf states, with energy ceilings ten times
  their need, stayed in famine because needs-first labour sent their
  whole workforce to farm a food ceiling of a third of a unit: a nation
  now works a reserve only up to three times its ceiling and leaves the
  rest to the market. Debt, for a nation with no income at all, waits
  for relations.

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

### 5.4 Relations and alliances (phase 5): as decided, 8 October 2026

Built as `docs/nations.md` §5; this is the design it followed.

**A view per direction.** Each nation holds an opinion of each linked
nation it has dealt with, −100 to 100: a *baseline* from facts that do
not move (the same region, a shared land border, like governments by
the data rows' freedom and authority), plus *goodwill* and minus
*grievance*, two stocks that accumulate from what the other nation did
and fade by a share a day. France's view of Belgium is not Belgium's
view of France.

**What moves a view** (the answers to round 1): deals kept and broken;
aid in a famine; refusals; people taken in; and a threat assessment,
where an aggressive nation resents a weaker, richer neighbour and a
peaceful one warms to a weaker one. Round 2 settled the measures:
temperament from the row's authority and freedom until the regime
carries it; strength as the military's effect times population;
wealth as income per head.

**Lines and pacts.** Deals with a friend form sooner and are delivered
first; a seller below a hostile line refuses. Two nations above the
pact line both ways for a season sign a pact; below a lower line it
lapses.

**Aid and lending** (round 2): food above comfort goes free to linked
nations in famine that the giver sees at zero or above; any nation
above a lending line lends, at interest, up to the borrower's debt cap;
repayment comes before building; a year unpaid is a default that the
lender remembers. Debt was deferred from phase 2 to here, so the
nations with no reserves and no income (Singapore, the Maldives) could
be rescued by their neighbours rather than by a rule.

**The round after building.** The first numbers left the baseline
alone: the stocks settled below 20, no pact formed in a year, no aid
or loan moved. The baseline was raised for like neighbours (a border
+10, like governments +10) and the deal goodwill tripled and paid to
both sides; the aid line was lowered to the store's own capacity,
which for most nations sits below the trade comfort, so that the food
a nation would otherwise waste is what it gives; a loan's repayment is
held back by the economy before it builds. Then: eleven pacts in a
year on seed 11 among neighbours that trade, aid on two days in three,
and Singapore's and the Maldives' famines ended on a loan. The
relations day costs about 3 ms once the baselines are cached per pair.
Ordering deliveries by pact count, as first built, sank Japan, which
had lived on being eleventh in the row order; deliveries now go allies
first, then oldest first. Japan still fails on most seeds, with or
without this pillar, for a reason that is the trade pillar's: its
imports are capped by its economy's trade capacity, food is bought
first, and the energy for its technology is what runs out; a loan's
repayment, held before building, tips it sooner, so its technology
halves over three years where it used to hold. Noted for phase 8.

**Closing census** (six seeds, three years, 9 October 2026): famine
nations 0 on every seed (2 before this phase); short nations 5 to 8;
pacts 23 to 31; lending 2 to 122 money a day at the end, no default;
aid 0 at the end because no nation was in famine; deals 230 to 289 and
2,460 to 2,590 units traded a day, as before. Flagged on most seeds:
Taiwan, Singapore, the Maldives, South Korea and Japan short on six,
India on five. The Maldives and Singapore are fed but still short of
energy and materials; India carries 2,000 to 3,600 of debt to its
neighbours on five seeds and is debt-free and rich on the sixth.

### 5.5 War and the military (phase 6)

- What the military is made of (a fourth employer was proposed and
  deferred).
- What starts a war (a binding shortage next to a neighbour's
  surplus was the stated intent), what it costs, how it ends, what
  changes hands.
- How wars and crises emerge at the global scale from local ones.

### 5.7 End products: technology, military, health (phase 3): as decided, 6 October 2026

A nation converts its harvested resources, through its developments,
into *end products*: money (the economy), technology (academia), and
now military and health. The military's effects wait for the war
session and health's outbreak effects for the outbreak pass; this
section is the mechanism they share.

**A level, per head.** Military and health are each one level, built
by their own budget share. A point costs money and materials times the
population, and the price per point rises with the level, each product
with its own cost formula (as research slows with technology). Levels
are not staffed: nobody is assigned to them, though their effects
touch the population.

**Two running averages**, updated whenever the level rises, weighted
by the size of the rise against the level:

- *embodied technology*: the nation's technology at the times the level
  was built;
- *embodied population* (the talent pool): the population at those
  times.

`new embodied = (L / (L + ΔL)) × old embodied + (ΔL / (L + ΔL)) ×
today's value`. Decay leaves the averages alone; only building moves
them toward the present. Military 40 at embodied technology 40, rising
by 2 at technology 45, is at 40.24.

**Upkeep**, per resource, per product, each at a rate per million
people plus a rate per unit of infrastructure, times the level, cut by
technology: military draws materials always and energy and food only
in wartime; health draws energy and materials. Technology draws energy
at a rate scaled by population, economy and infrastructure, not cut by
its own level.

**Decay**, named causes added, each at its own rate: materials unpaid
(the unpaid share), energy unpaid (the unpaid share), the population
above the embodied pool (the gap as a share of the pool: growth outran
training), the technology above the embodied level (the gap: the stock
is obsolete and must be retrofitted). Technology itself has a small
flat decay that academia must outrun, and decays when its energy goes
unpaid. All of it is lines on the card.

**When a level is used** (a war, an outbreak), its effect is the level
times the technology multiplier at its *embodied* technology and times
the embodied population over the current one, capped at one. An old
army fights with old technology and green recruits until it is
rebuilt; a health system built for fifty million strains at eighty.

**Population.** Health lowers deaths (a base mortality joins the people
step, and the famine deaths) and raises births. The military touches
people and labour only in war.

**Budget pressures until regimes decide** (§5.8): each nation's military
share has a floor set from its data row's military column, a stand-in
for threat until relations and war exist; the health share rises when
deaths run above a line and falls back after; both reasons show on the
card. *To revisit with regime decision-making.*

```
on a rise ΔL at technology T, population P:
   embT ← (embT·L + T·ΔL) / (L + ΔL)      embP ← (embP·L + P·ΔL) / (L + ΔL)
upkeep_r     = L · (perHead_r · P + perInfra_r · I) · (1 − techUpkeep · T/100)
decay / day  = Σ_r kUnpaid_r · (1 − paid_r) + kDilute · max(0, P − embP)/embP
             + kObsolete · max(0, T − embT)/100
effect       = L · techMultiplier(embT) · min(1, embP / P)
cost / point = (baseMoney, baseMaterials) · P · (1 + L / slow)
```

**As built (phase 3, 7 October 2026).** The products pillar
(`nations.md` §3) and what the census forced on the way:

- The reserve calibration counts the products' upkeep and the
  materials their building takes, or the world is materials-short from
  day one and nothing gets built.
- Upkeep before building: the economy pays its own upkeep first (it
  earns the money everything else is bought with), the products take
  what is left pro rata among themselves, and the economy builds only
  with what remains after the products' upkeep; every product's upkeep
  and decay are settled before any product builds. Without the
  reservation the economy's building ate the imports and the military
  the rest, and health went to nothing everywhere; sharing the upkeep
  pro rata between the economy and the products was tried next and
  spiralled the import-dependent nations (Japan's technology from 93 to
  59 in three years), since it starved the income that paid for their
  imports.
- What a product wanted and did not get, and the materials its money
  could have bought points with, join the nation's ask on the market.
- Research goes on when a nation is short; it is not a unit to power.
- The short line is 90% of upkeep paid: below it a nation holds its
  building and the census flags it; at 98% the pro-rata sharing made
  a quarter of the world read short.
- Rates: a point costs 20 money and 0.5 (military) or 0.3 (health)
  materials per million people at level 0, doubling by level 50;
  upkeep 0.0003 materials per point per million people (the military;
  energy and food only at war) and 0.0003 energy plus 0.0002 materials
  (health), with a unit of infrastructure counting as two million
  people; decay 0.002 per unit unpaid, 0.0015 per unit of population
  gap, 0.003 per unit of technology gap; full health cuts deaths by
  60% and raises births by 50%; the base mortality is 0.00003 a day;
  technology's energy upkeep is 0.1 per point per 100 million people
  plus half as much per unit of economy and of infrastructure, and it
  forgets 0.00002 of itself a day.

**The progression round** (7 October 2026). The first census climbed
the ladders too fast at the top (France's health 85 to 90 in a year,
the United States' military past 100) and too slowly at the bottom
(Nigeria 3 a year on a flat money price per head). Decided: a point is
priced in labour, so many worker-days per person at the nation's own
wage, so poor nations build with cheap labour and the climb at a given
level depends only on the budget share; the price grows exponentially,
e-fold every 30 points (doubling every 21), cheap at the bottom and
dear at the top; upkeep follows the same curve, nothing to keep at
level 0; the row levels stand as seeds. On a 10% share a nation climbs
about 15 points a year at level 0, 3 at 50, half a point at 100; the
rich hold where they start and the poor climb. Technology's unpowered
decay became proportional to the unpaid share.

**Census after the round** (six seeds, three years, 7 October 2026):
people 8,255 to 8,261 M; famine in 2 nations (Singapore, the Maldives);
short 5 to 7 (Taiwan, South Korea, India and Bangladesh in most
seeds); income 54,500 to 57,000; mean technology 57 to 61 (Japan
holds at 96; India, unpowered, falls to 32); mean military 52 to 56,
holding near its seeds (the United States 89, Russia 82, China 45);
mean health 32 to 33, the rich holding (the United States 80, Brazil
and Mexico 54) and the short nations decaying (China 20, Pakistan 18,
India 5); prices in surplus; 2,500 to 2,650 units traded; 244 to 279
deals. Accepted as phase 3; the numbers get their pass in balance.

**Census before the round** (six seeds, three years, 7 October 2026): people 8,268 to
8,273 M; famine in 2 nations (Singapore, the Maldives); short 8 to 12
(Taiwan, South Korea, Saudi Arabia, Algeria, India, the Emirates: the
materials now shared with their products); world income 52,000 to
56,000 a day (56,000 to 63,000 before the products' upkeep); mean
technology 58 to 62; mean military 64 to 66, from about 50 at seed,
the United States past 100 on its 15% floor; mean health 41 to 44,
from about 55 at seed, the rich near 90 (France and the United States
at 90 within a year, deaths at 40% of the base) and the poor decaying
for want of energy and materials; prices in surplus; 2,450 to 2,560
units traded a day; 236 to 288 deals. India's technology halves in
three years: unpowered, it decays at the economy's unpaid rate.

### 5.8 Regimes and their goals: as decided, 6 October 2026

Regimes decide their preferences and goals by a genetic algorithm,
replacing the fixed pressures of §4.4 and §5.7.

- **The genome** encodes the preferences and thresholds of the existing
  rules: the weights of the budget shares (infrastructure, economy,
  research, military, health, exploration, keep), the thresholds the
  rules fire at (idle tolerance, reserve days, the deaths line), export
  appetite, how fast shares move. Every gene is a named preference the
  card shows in a word or two (thrifty, builds roads, hawkish, open to
  trade), with the regime's score and age; the numbers sit behind a
  fold.
- **Regime change** is the moment of selection. Its triggers differ by
  regime type and in general revolve around stability falling too low;
  some types change after a term (democracies). Later, regime change
  can be a war goal or an espionage action.
- **The new genome** is picked from a baseline pool of workable genomes
  and mutated, or crossed with a successful regime the nation can see.
  The pool is trained up beforehand (an offline evolution over many
  seeds in the headless census) so that no nation is governed by a
  random genome.
- **Stability** is 100 minus a *grievance* that accumulates from each
  day's pressures (the famine share, unpaid upkeep, the idle share,
  deaths, and later a lost war) and fades by a fixed share a day. A bad
  month is remembered for a season; the card shows what each pressure
  added and what faded.
- **Four regime types**, from the data rows' government column, each
  with its trigger. *Elected*: a change at the end of each term, early
  if stability falls below its line. *Hereditary*: a change at a
  succession, which comes at random on a long cycle, or on collapse.
  *Military*: a change when stability has been below its line for long
  enough (a coup). *Party*: a change on a long cycle (a congress) or on
  collapse. The type itself can change at a regime change.
- **The pool** is bred offline: a tool runs the world over many seeds
  with random genomes in the headless census, scores regimes by their
  outcomes, breeds the best, and writes a pool of a few dozen genomes to
  a data file the game loads. It is rerun when the rules change; a
  player never waits for it.
- **Place in the plan**: after relations and war, before balance, so
  the pool is trained on the world as it will be. The stand-in
  pressures of §4.4 and §5.7 hold until then.

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
