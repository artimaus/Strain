# Data

Every measurement committed to the repo: census reports written by
`python tools/census.py --report <slug>` and round files written
through a round (`process.md` §2, §4). Newest at the bottom; the
agent fills the result column when it reads a report.

## At a glance

- One row per file; the result column is the one line that matters.
- Census reports: world lines as min, median and max across seeds; flagged nations; per-seed tables.
- Round files: brief, options with predicted numbers, answers, build notes, result against prediction.
- Raw per-seed JSON goes to `raw/<slug>/` and is not committed.
- Reports before 11 October 2026 are back-filled from `design.md` and the session's terminal output.

## Summary

Seven back-filled censuses cover phases 1 to 6: the economy alone,
trade before and after the sea links, the products before and after
their progression round, relations, and war. Rounds start with the
next phase under the process.

## 1. Files

| date | kind | system | commit | file | result |
|---|---|---|---|---|---|
| 2026-10-05 | census | economy | phase 1 | [census-2026-10-05-phase1.md](census-2026-10-05-phase1.md) | 9 famine nations and 13 to 15 unpowered on every seed; 20% idle |
| 2026-10-06 | census | trade | phase 2 | [census-2026-10-06-trade.md](census-2026-10-06-trade.md) | idle 9%, income up; 8 to 9 famine nations with no reserves and no income |
| 2026-10-06 | census | trade | phase 2 closing | [census-2026-10-06-trade-sea.md](census-2026-10-06-trade-sea.md) | famine 2 (Singapore, the Maldives); the world in surplus; 2,450 to 2,770 traded |
| 2026-10-07 | census | products | phase 3 first build | [census-2026-10-07-products-before.md](census-2026-10-07-products-before.md) | military 64 to 66 and the US past 100: the ladder too fast at the top |
| 2026-10-07 | census | products | `115c624` | [census-2026-10-07-products-after.md](census-2026-10-07-products-after.md) | military 52 to 56, health 32 to 33, holding near their seeds |
| 2026-10-09 | census | relations | `19f5f14` | [census-2026-10-09-relations.md](census-2026-10-09-relations.md) | famine 0 everywhere; pacts 23 to 31; Japan's technology 41 to 74 |
| 2026-10-10 | census | war | `234e19a` | [census-2026-10-10-war.md](census-2026-10-10-war.md) | 42 to 49 wars in three years, all greed; military mean 50 |
| 2026-10-11 | census | format-check | `234e19a` | [census-2026-10-11-format-check.md](census-2026-10-11-format-check.md) | one seed, one year, to prove the report writer; prices still settling, 15 wars in year one |
