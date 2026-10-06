# Strain

Strain is a browser game in two views. On the **bench** you grow and
shape tiny organisms, called entities, on five plates: feed them, dose
them, let them hunt, read their profiles, and archive the ones worth
keeping as variants. On the **map** you deploy a variant to a country
of the world and watch what it does there. Around both sits a career:
money, a title, research projects that pay for variants with particular
traits, and the suspicion your work attracts. Reach 100% suspicion and
you are busted.

The bench simulation is called Entity, and that is the name the code
uses for its globals (`window.ENTITY`, `ENTITY_*`). Strain is the game
around it.

**Status.** The map side is being redesigned. Today a deployed variant
marks a country as covered and nothing moves: no spread, no detection,
no response. The link graph between countries (land borders, sea lanes,
air routes) is built and waiting for the model that will travel on it.
The previous map simulation, a full nation economy with decisions,
governments and wars, was removed in October 2026 because it had grown
past the point of being understood; it is in the git history (commit
`c118a8f`) if ever needed.

## Running it

Plain HTML, CSS and JavaScript. No build step, no dependencies beyond
the world map data, which is fetched from a CDN at load.

- Open `Strain.html` in a browser. Everything works from `file://`.
- Or serve it without caching: `python tools/serve.py`, then open
  http://127.0.0.1:8000/Strain.html. The stock Python server caches,
  which can load an old page against new scripts.
- VS Code: the two launch configurations in `.vscode/` do the same.

Python 3 is needed only for the dev server and the tests.

## Testing

`python tools/smoke.py` boots the page in headless Chrome or Edge and
checks it without a human: no errors at boot, all five plates alive,
every dialog opens and closes, the link graph is built, a save round
trip restores coverage and the day, and the bench fits without
scrollbars at nine window sizes. It takes about half a minute.

- `python tools/smoke.py --only boot,sim,modals,text` is the quick half.
- `python tools/smoke.py --eval-file tools/probes/tap.js` drives a real
  pointer sequence on the map and checks the country card opens on a
  tap and not on a drag.
- `python tools/smoke.py --eval "return WORLD.day"` runs any snippet in
  the booted page; `--shot out.png` saves a screenshot instead.

## Where things are

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
| `js/world.js` | Per-country coverage, the world clock, the map hand-off, regions, the news log, the save tables. |
| `js/links.js` | The land, sea and air graph with a capacity per edge. |
| `js/economy.js` | The economy pillar: a nation's day, its card rows, map layers, wire headlines and census line. |
| `js/shell.js` | The player, titles, variants, the view switch, the config panel, `window.ENTITY`. |
| `js/worldui.js` | The country card, the region dialog, the deploy dialog. |
| `js/wire.js` | The calendar readout and the news panel on the map. |
| `js/map.js` | The world map: topojson decoding, Mercator, borders and coastlines, layers, tooltip, pan and zoom. |
| `js/progression.js` | Career offers, research projects, save and load, game over, new game. |
| `js/boot.js` | The debug flag and the map data preload. |
| `tools/smoke.py` | The headless test. `tools/serve.py` is the dev server; `tools/census.py` runs the census probe over seeds; `tools/probes/` holds the eval scripts. |
| `docs/` | The documentation, below. |

Scripts load in a fixed order (the comment at the end of `Strain.html`
says why). Each module is one function that publishes one object on
`window` and reads the others only inside functions that run after
load.

## Documentation

- [docs/bench.md](docs/bench.md): the Entity model and the bench.
- [docs/map.md](docs/map.md): the world map, the country data, the links, the world container.
- [docs/player.md](docs/player.md): the career, variants, research projects, saving.
- [docs/design.md](docs/design.md): the redesign of the map side: what the map is for, the principles, the nation economy in full, and the open pillars with the questions each phase has to answer.
- [docs/plan.md](docs/plan.md): the phases that build it, each with its scope, its opening questions and what done means.
