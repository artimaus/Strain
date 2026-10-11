# Census: phase 6, war and the military

| field | value |
|---|---|
| date | 2026-10-10 (design.md §5.5 dates it 9 October; the run finished after midnight) |
| kind | census |
| commit | `234e19a` |
| command | `python tools/census.py --top 14` |
| seeds | 11, 22, 33, 44, 55, 66 |
| days | 1095 |
| pillars | economy, products, trade, relations, war |
| ms per day | 150 to 250 on a busy machine |
| source | back-filled from design.md §5.5 "Closing census" and the terminal output kept in the session |

## At a glance

- 42 to 49 wars started and 41 to 48 peaces made per seed in three years; one war under way at the end on every seed (Russia on Latvia).
- Every war was a greed war (WAR-09): no nation was short for a month next to a surplus it could take, and no view fell to the enmity line.
- 15 to 18 tributes being paid at the end; 178 to 186 M soldiers under arms.
- The military mean fell from about 54 to 50: wages take half the military money and attrition takes level.
- Famine 0 to 1, short 5 to 8, pacts 26 to 29, no default.
- The smoke's functional run takes about 230 s on this machine; the census budget is 300 ms a day.

## Summary

The closing census of phase 6, after the round after building
(WAR-11). Wars happen, end at the table within 35 to 49 days and
leave tributes of a third to a half of the loser's money for a year.
Hawks at temperament 1.0 rotate through their weaker, richer
neighbours; the need and enmity triggers wait for a scarcer, colder
world.

## 1. World lines

| line | min | median | max |
|---|---|---|---|
| people (M) | 8,246 | 8,252 | 8,255 |
| famineNations | 0 | 0 | 1 |
| shortNations | 5 | 7 | 8 |
| idleShare (%) | 10 | 13 | 13 |
| income (money a day) | 51,916 | 52,812 | 57,392 |
| techMean | 56.4 | 57.9 | 61.3 |
| milMean | 47.7 | 50.25 | 51.2 |
| heaMean | 30.9 | 32.1 | 32.2 |
| priceFood | 0.69 | 0.72 | 0.85 |
| priceEnergy | 0.61 | 0.63 | 0.68 |
| priceMat | 0.52 | 0.56 | 0.65 |
| traded (units a day) | 2,362 | 2,468 | 2,535 |
| deals | 227 | 254 | 302 |
| pacts | 26 | 26 | 29 |
| loansToday (money) | 14 | 28.5 | 132 |
| aidToday (units) | 0 | 0 | 47 |
| defaults | 0 | 0 | 0 |
| wars (under way) | 1 | 1 | 1 |
| warsStarted | 42 | 44.5 | 49 |
| peaces | 41 | 43.5 | 48 |
| tributes | 15 | 15.5 | 18 |
| soldiers (M) | 178 | 179 | 186 |

## 2. Flagged in at least half the seeds

| nation | flag | seeds |
|---|---|---|
| Zambia, Norway, Namibia, Latvia, Lithuania, Lebanon, Israel, Guyana | paysTribute | 6/6 |
| Russia, Latvia | atWar | 6/6 |
| Taiwan, Singapore, Maldives, South Korea, Japan | short | 6/6 |

## 3. Per seed

Seed 11, two years, the first season's wars (from the probe, not the
census): Nicaragua on Costa Rica, Venezuela on Guyana, Belarus on
Latvia, Russia on Estonia, Egypt on Israel, Zimbabwe on Botswana,
Angola on Namibia, China on Mongolia, Iran on Azerbaijan, Syria on
Lebanon, all on day 90, all "richer and weaker"; peace on days 132 to
139 at a third to a half of the loser's money.
