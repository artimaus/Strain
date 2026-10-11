# Strain

Strain is a browser game in two views. On the **bench** you grow and
shape tiny organisms, called entities, on five plates: feed them, dose
them, let them hunt, read their profiles, and archive the ones worth
keeping as variants. On the **map** you deploy a variant to a country
of the world and watch what it does there. Around both sits a career:
money, a title, research projects that pay for variants with particular
traits, and the suspicion your work attracts. Reach 100% suspicion and
you are busted.

## At a glance

- Plain HTML, CSS and JavaScript, no build step; open `Strain.html` or run `python tools/serve.py`.
- The bench simulation is called Entity and is finished; the map side is being rebuilt as pillars: economy, products, trade, relations, war are built; health, the outbreak and regimes are not.
- Today a deployed variant marks a country as covered and nothing spreads; the outbreak is its own pass to come.
- Test with `python tools/smoke.py` (headless Chrome, about four minutes); census the world with `python tools/census.py`; check the docs with `python tools/doclint.py`.
- How we work is written down: `docs/process.md` (levels, gates, rounds), `docs/glossary.md` (terms), `docs/decisions.md` (every decision by system), `docs/data/` (every census and round).
- The previous nation simulation was removed in October 2026 (commit `c118a8f`) because it had grown past being understood.

## Summary

Strain is the game, Entity the bench model the code names its globals
after. The bench, the map rendering, the link graph and the player
layer are stable and described in `docs/bench.md`, `docs/map.md` and
`docs/player.md`. The map's nations are being rebuilt one pillar at a
time from `docs/design.md`, following `docs/plan.md`; what each pillar
does today is in `docs/nations.md`. Every decision has a record and
every measurement a file, so the reasons behind a number can be found
without reading the chat that produced it.

## 1. Running it

No dependencies beyond the world map data, which is fetched from a
CDN at load.

- Open `Strain.html` in a browser. Everything works from `file://`.
- Or serve it without caching: `python tools/serve.py`, then open
  http://127.0.0.1:8000/Strain.html. The stock Python server caches,
  which can load an old page against new scripts.
- VS Code: the two launch configurations in `.vscode/` do the same.

Python 3 is needed only for the dev server and the tools.

## 2. Testing and measuring

| command | what it does | takes |
|---|---|---|
| `python tools/smoke.py` | boots the page in headless Chrome or Edge: no errors, five plates alive, every dialog, the links, each pillar's flags, a save round trip, the layout at nine sizes | about 4 min |
| `python tools/smoke.py --only boot,sim,modals,text` | the quick half | about 1 min |
| `python tools/smoke.py --eval "return WORLD.day"` | runs a snippet in the booted page; `--eval-file probe.js`; `--shot out.png` for a screenshot | seconds |
| `python tools/smoke.py --eval-file tools/probes/tap.js` | a real pointer sequence on the map: a tap opens the country card, a drag does not | seconds |
| `python tools/census.py` | six seeds over three years, every pillar's census line; `--quick` one seed one year; `--report <slug>` writes `docs/data/census-<date>-<slug>.md` | about 20 min |
| `python tools/doclint.py` | the docs' format, decision ids, registers against the code, data headers, line endings | seconds |

## 3. Where things are

| Path | What |
|---|---|
| `Strain.html` | The one page: markup for both views and every dialog, and the script list in load order. |
| `css/strain.css` | The one stylesheet, sectioned, with the design tokens at the top. |
| `js/core.js` | The Entity model: constants, the genome, derived stats, adaptation, colours. Runs on the page and inside each plate's worker. |
| `js/worker.js` | The life step: feeding, hunting, brewing, dividing, dying, diffusion. Worker source. |
| `js/host.js` | The bench page: plates, tools, hotkeys, play, pause and speed, the worker bootstrap. |
| `js/sheet.js` | The profile sheet of one entity, and Collect. |
| `js/tune.js` | The live tuning panel for every lever in core. |
| `js/layout.js` | Fits the plate grid to the window without scrollbars. |
| `js/ui.js` | Shared helpers: `$`, toasts, modals, the hotkey guard, confirm and alert. |
| `js/data.js` | One row per country: region, population and hand-set levels. |
| `js/geo.js` | Regions and their climates; the curated mountain and micro-state border tables. |
| `js/bounties.js` | The research-project generator. |
| `js/world.js` | The pillar registry, the ledger and its history, the seeded streams, the world clock, the census hooks, the save tables. |
| `js/links.js` | The land, sea and air graph with a capacity per edge. |
| `js/economy.js` | The economy pillar: a nation's day, its card rows, map layers, wire headlines and census line. |
| `js/products.js` | The products pillar: military and health as levels with embodied technology and population, built and decaying by named lines. |
| `js/trade.js` | The trade pillar: export capture, asks and offers, deals, the world prices, migration along the links. |
| `js/relations.js` | The relations pillar: directed views with a baseline and fading goodwill and grievance, pacts, aid, loans. |
| `js/war.js` | The war pillar: the army as a job, wars of need, greed and enmity, attrition, the weekly peace table, tributes. |
| `js/shell.js` | The player, titles, variants, the view switch, the config panel, `window.ENTITY`. |
| `js/worldui.js` | The country card, the region dialog, the deploy dialog. |
| `js/wire.js` | The calendar readout and the news panel on the map. |
| `js/map.js` | The world map: topojson decoding, Mercator, borders and coastlines, layers, tooltip, pan and zoom. |
| `js/progression.js` | Career offers, research projects, save and load, game over, new game. |
| `js/boot.js` | The debug flag and the map data preload. |
| `tools/` | `smoke.py` the headless test; `census.py` the census over seeds; `doclint.py` the docs check; `serve.py` the dev server; `probes/` the page scripts. |
| `docs/` | The documentation (next section); `docs/data/` the censuses and rounds; `docs/templates/` the skeleton of each document kind. |

Scripts load in a fixed order (the comment at the end of `Strain.html`
says why). Each module is one function that publishes one object on
`window` and reads the others only inside functions that run after
load.

## 4. Documentation

| doc | what it answers | level |
|---|---|---|
| [docs/process.md](docs/process.md) | how we work: levels, gates, rounds, decision records, data files, the register, the writing rules | method |
| [docs/glossary.md](docs/glossary.md) | what every term means, with its code name | method |
| [docs/decisions.md](docs/decisions.md) | every decision, by system, with its options and reason | method |
| [docs/data/index.md](docs/data/index.md) | every census and round, with its one-line result | method |
| [docs/design.md](docs/design.md) | what the map is for, the principles, the architecture, and each system as decided | L1, L2, L3 |
| [docs/plan.md](docs/plan.md) | the phases: where each stands, its scope, its rounds, what done means | L3, L4 |
| [docs/nations.md](docs/nations.md) | what each pillar does today: its day, what it touches, its levers, its gaps | L4 |
| [docs/bench.md](docs/bench.md) | the Entity model and the bench | reference |
| [docs/map.md](docs/map.md) | the world map, the country data, the links, the world container | reference |
| [docs/player.md](docs/player.md) | the career, variants, research projects, saving | reference |
| [docs/templates/](docs/templates/) | the skeleton of a concept, an architecture note, a system design, a system reference, a round, a decision | method |

## 5. How we work

- Four levels, each with a gate: concept, technical design, vertical system design, implementation and tuning (`docs/process.md` §1).
- A round is file first: the brief, the options and their predicted numbers are in `docs/data/round-*.md` before the question is asked (`docs/process.md` §2).
- Every answer is a decision record in `docs/decisions.md`; docs cite the id.
- Every census is a report in `docs/data/`; the index carries the one line that matters.
- Every doc starts with At a glance and Summary; numbers go in tables; `tools/doclint.py` checks it.
