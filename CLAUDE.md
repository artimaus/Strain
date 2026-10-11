# Strain: working notes

Plain HTML, CSS and JS, no build step. Strain is the game; Entity is the
bench simulation and the name the code uses for its globals. The method
is `docs/process.md`; the terms are `docs/glossary.md`.

## Run and test

- Serve: `python tools/serve.py`, then http://127.0.0.1:8000/Strain.html.
  Opening `Strain.html` directly also works.
- Test before committing: `python tools/smoke.py` (headless Chrome or
  Edge, about four minutes). Quick half: `--only boot,sim,modals,text`.
  Pointer test of the map: `--eval-file tools/probes/tap.js`.
- Run a snippet in the booted page: `python tools/smoke.py --eval
  "return WORLD.day"`; add `--shot out.png` for a screenshot.
- Census: `python tools/census.py` (six seeds, three years, about
  twenty minutes); `--report <slug>` writes the report to `docs/data/`.
- Docs check: `python tools/doclint.py` before any commit that touches
  `docs/` or a pillar.

## Layout

- One page (`Strain.html`), one stylesheet (`css/strain.css`, sectioned),
  one module per concern in `js/`. Each module is an IIFE that publishes
  one object on `window` (UI, C, DATA, GEO, BOUNTIES, WORLD, LINKS,
  ECONOMY, PRODUCTS, TRADE, RELATIONS, WAR, ENTITY, SHEET, TUNE) and
  reads the others only inside functions that run after load.
- The script order at the end of `Strain.html` is load-bearing; the
  comment above it says why. New scripts go there, in order.
- Map-side pillars (`docs/design.md` §10, `docs/nations.md` §0) are
  modules that call `WORLD.registerPillar` at load; they go after
  `js/links.js` and before `js/shell.js`. A pillar brings its save
  fields, its config group, its card rows, its census line and writes
  its day to the nation's ledger.
- Docs: `README.md` (overview, run, test, file map); `docs/bench.md`,
  `docs/map.md`, `docs/player.md` describe what exists; `docs/design.md`
  is what was decided, `docs/nations.md` what the pillars do today,
  `docs/plan.md` the phases. Update the reference docs in the same
  change that alters behaviour.
- A system's reference section follows `docs/templates/system-reference.md`
  (its day, what it touches, the register, levers, departures, gaps);
  a system's design section follows `docs/templates/system-design.md`.
  Sections written before 11 October 2026 keep the older four-section
  template until their system is reworked.

## How we work

- Write the round file (`docs/templates/round.md`) before asking any
  multi-choice question: the brief, every option with its mechanism and
  a predicted number, one marked recommended. The chat question repeats
  the options; it never adds one the file does not have.
- Record every answer as a decision record in `docs/decisions.md`, in
  the system's section, in the same change; cite the id in the docs
  instead of retelling the decision.
- Numbers go into `docs/data/` tables (a census report or a round's
  result), never only into chat. Prose carries dates and ids.
- Levers, constants, variables, formulas and any list of more than
  three parallel items are tables. Formulas carry ids (`F1`, per
  system). Every doc starts with At a glance and Summary.
- Use the glossary's terms; add a term there the first time a doc
  coins one.
- A question is asked at the lowest level whose answer it changes
  (`docs/process.md` §1); a gate is closed by its checklist, not by
  feel.
- Commit messages name the round file and the decision ids.

## Rules that are easy to break

- Files are LF (`.gitattributes`). Some Windows editors write CRLF;
  `sed -i 's/\r$//' file` fixes one.
- Every numeric default on the map and player side is a key in
  `ENTITY_CONFIG` (`js/shell.js`) and a row in the config panel. On the
  bench side every lever lives in `C` (`js/core.js`) and the tuning
  panel finds it by itself. A pillar's levers are its `LEVERS`; its
  fixed numbers are its `K`; a constant becomes a lever only by a
  decision record.
- The worker is built from the source text of `js/core.js` and
  `js/worker.js` (`Function.prototype.toString`). Keep those two files
  free of anything that would not run inside a worker.
- Save format: a new field is one row in a pillar's `FIELDS` (or the
  pack tables in `js/world.js`); bump the version in `js/progression.js`
  when the shape changes.
- The nation simulation (economy, governments, decisions, wars) was
  removed on purpose in October 2026 and is being rebuilt as pillars.
  Do not bring pieces of the old one back without a decision record.
  The history has it (commit `c118a8f`).
