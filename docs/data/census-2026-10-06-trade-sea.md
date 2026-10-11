# Census: phase 2 after the sea links and the effort cap

| field | value |
|---|---|
| date | 2026-10-06 |
| kind | census |
| commit | the phase 2 closing commit (before `--report` existed) |
| command | `python tools/census.py` |
| seeds | 11, 22, 33, 44, 55, 66 |
| days | 1095 |
| pillars | economy, trade |
| ms per day | under 100 |
| source | back-filled from design.md §5.1 "Census after the sea links and the effort cap"; per-seed tables not kept |

## At a glance

- Famine in 2 nations (Singapore, the Maldives), from 8 to 9 before the sea links (TRD-11).
- Short 5 to 10: Taiwan and South Korea in every seed, Turkey in half.
- The world in surplus: prices 0.65 to 0.78 food, 0.53 to 0.60 energy, 0.39 to 0.55 materials.
- 2,450 to 2,770 units traded a day, 200 to 250 deals; the Gulf states export energy and eat.
- China, India and Japan are paid up by year three on imports of 14%, 21% and 33% of their use.

## Summary

The closing census of phase 2. Every coast linked to every coast and
the effort cap of three times a ceiling cleared the famine of the
Gulf states and the materials shortage of India. Taiwan and South
Korea, dense, rich and reserve-poor, remain: they have neighbours who
sell and need an income to buy with, which later pillars address.

## 1. World lines

| line | min | median | max |
|---|---|---|---|
| famineNations | 2 | 2 | 2 |
| shortNations | 5 | 7 | 10 |
| idleShare (%) | 10 | 12 | 14 |
| income (money a day) | 56,000 | 59,500 | 63,000 |
| priceFood | 0.65 | 0.71 | 0.78 |
| priceEnergy | 0.53 | 0.56 | 0.60 |
| priceMat | 0.39 | 0.47 | 0.55 |
| traded (units a day) | 2,450 | 2,610 | 2,770 |
| deals | 200 | 225 | 250 |

## 2. Flagged in at least half the seeds

| nation | flag | seeds |
|---|---|---|
| Singapore, the Maldives | famine | 6/6 |
| Taiwan, South Korea | short | 6/6 |
| Turkey | short | 3/6 |

## 3. Per seed

Not kept.
