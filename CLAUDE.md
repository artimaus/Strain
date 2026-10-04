# Strain: working notes

Plain HTML, CSS and JS, no build step. Strain is the game; Entity is the
bench simulation and the name the code uses for its globals.

## Run and test

- Serve: `python tools/serve.py`, then http://127.0.0.1:8000/Strain.html.
  Opening `Strain.html` directly also works.
- Test before committing: `python tools/smoke.py` (headless Chrome or
  Edge, about 30 s). Quick half: `--only boot,sim,modals,text`. Pointer
  test of the map: `--eval-file tools/probes/tap.js`.
- Run a snippet in the booted page: `python tools/smoke.py --eval
  "return WORLD.day"`; add `--shot out.png` for a screenshot.

## Layout

- One page (`Strain.html`), one stylesheet (`css/strain.css`, sectioned),
  one module per concern in `js/`. Each module is an IIFE that publishes
  one object on `window` (UI, C, DATA, GEO, BOUNTIES, WORLD, LINKS,
  ENTITY, SHEET, TUNE) and reads the others only inside functions that
  run after load.
- The script order at the end of `Strain.html` is load-bearing; the
  comment above it says why. New scripts go there, in order.
- Docs: `README.md` (overview, run, test, file map); `docs/bench.md`,
  `docs/map.md`, `docs/player.md` describe what exists; `docs/design.md`
  and `docs/plan.md` describe what is being built. Update the reference
  docs in the same change that alters behaviour.
- Reference docs use one template per system: what it does, what it
  touches, defaults and levers, assumptions built in.

## Rules that are easy to break

- Files are LF (`.gitattributes`). Some Windows editors write CRLF;
  `sed -i 's/\r$//' file` fixes one.
- Every numeric default on the map and player side is a key in
  `ENTITY_CONFIG` (`js/shell.js`) and a row in the config panel. On the
  bench side every lever lives in `C` (`js/core.js`) and the tuning
  panel finds it by itself.
- The worker is built from the source text of `js/core.js` and
  `js/worker.js` (`Function.prototype.toString`). Keep those two files
  free of anything that would not run inside a worker.
- Save format: a new field is one row in the pack tables in
  `js/world.js`; bump the version in `js/progression.js` when the shape
  changes.
- The nation simulation (economy, governments, decisions, wars) was
  removed on purpose in October 2026. Do not bring pieces of it back
  without a design decision. The history has it (commit `c118a8f`).
