# Census: phase 2, trade on the links

| field | value |
|---|---|
| date | 2026-10-06 |
| kind | census |
| commit | the phase 2 commit (before `--report` existed) |
| command | `python tools/census.py` |
| seeds | 11, 22, 33, 44, 55, 66 |
| days | 1095 |
| pillars | economy, trade |
| ms per day | not recorded |
| source | back-filled from design.md §5.1 "Census with trade"; per-seed tables not kept |

## At a glance

- Famine nations 8 to 9 and short 12 to 13, all nations with no reserves and no income.
- The idle share fell from 20% to 9%; income rose from 56,000 to 58,000 to 59,000 to 64,000 a day.
- Prices 0.8 to 0.9 for food, 0.6 to 0.7 for energy and materials, falling as supply finds demand.
- 1,370 to 1,540 units traded a day; 124 to 192 deals in force.
- India and Bangladesh, short in year one, are paid up by year three on imports of 9% and 14% of their use.

## Summary

The first census with trade, before the sea links were widened and
the effort cap added. Trade halved the idle share and lifted income,
but the nations with no reserves and no income stayed in famine:
Singapore, Qatar, the Maldives, Malta, Kuwait, Djibouti, the Bahamas,
Brunei, Bahrain, the Emirates, Andorra, Western Sahara, Jordan.
Japan lives on imports and exports its economy's surplus; Russia and
Pakistan are the big exporters.

## 1. World lines

| line | min | median | max |
|---|---|---|---|
| people (M) | 8,345 | 8,351 | 8,357 |
| famineNations | 8 | 8.5 | 9 |
| shortNations | 12 | 12.5 | 13 |
| idleShare (%) | 9 | 9 | 9 |
| income (money a day) | 59,000 | 61,500 | 64,000 |
| priceFood | 0.8 | 0.85 | 0.9 |
| priceEnergy | 0.6 | 0.65 | 0.7 |
| priceMat | 0.6 | 0.65 | 0.7 |
| traded (units a day) | 1,370 | 1,455 | 1,540 |
| deals | 124 | 158 | 192 |

## 2. Flagged in at least half the seeds

| nation | flag | seeds |
|---|---|---|
| Singapore, Qatar, the Maldives, Malta, Kuwait, Djibouti, the Bahamas, Brunei, Bahrain, the Emirates, Andorra, Western Sahara, Jordan | famine or short | most |

## 3. Per seed

Not kept.
