# Census: phase 5, relations and alliances

| field | value |
|---|---|
| date | 2026-10-09 |
| kind | census |
| commit | `19f5f14` |
| command | `python tools/census.py --top 14` |
| seeds | 11, 22, 33, 44, 55, 66 |
| days | 1095 |
| pillars | economy, products, trade, relations |
| ms per day | 85 to 100 |
| source | back-filled from design.md §5.4 "Closing census" and the terminal output kept in the session |

## At a glance

- Famine nations 0 on every seed, from 2 before this phase: Singapore and the Maldives live on loans and aid (REL-06, REL-07).
- Pacts 23 to 31 in three years; lending 2 to 122 money a day at the end; no default.
- Aid 0 at the end because no nation was in famine.
- Deals 230 to 289 and 2,460 to 2,590 units traded a day, as before.
- Japan short on six seeds with its technology at 41 to 74, from 96 at the end of phase 3 (REL-10).
- India carries 2,000 to 3,600 of debt on five seeds and is debt-free and rich on the sixth.

## Summary

The closing census of phase 5, after the deliveries were ordered
allies first then oldest first (REL-09). Relations ended famine
everywhere through loans and aid, and pacts formed among trading
neighbours. The one regression, Japan's technology, is the trade
pillar's capacity and order, carried to phase 8.

## 1. World lines

| line | min | median | max |
|---|---|---|---|
| people (M) | 8,258 | 8,264 | 8,266 |
| famineNations | 0 | 0 | 0 |
| shortNations | 5 | 6 | 8 |
| idleShare (%) | 10 | 13.5 | 14 |
| income (money a day) | 53,391 | 53,808 | 58,064 |
| techMean | 55.6 | 57.45 | 61.1 |
| milMean | 52.3 | 54.2 | 56.6 |
| heaMean | 31.7 | 32.4 | 33 |
| priceFood | 0.67 | 0.69 | 0.82 |
| priceEnergy | 0.59 | 0.59 | 0.67 |
| priceMat | 0.53 | 0.55 | 0.65 |
| traded (units a day) | 2,461 | 2,542 | 2,585 |
| deals | 230 | 274 | 289 |
| pacts | 23 | 26 | 31 |
| loansToday (money) | 2 | 12.5 | 122 |
| aidToday (units) | 0 | 0 | 0 |
| defaults | 0 | 0 | 0 |

## 2. Flagged in at least half the seeds

| nation | flag | seeds |
|---|---|---|
| Taiwan | short | 6/6 |
| Singapore | short | 6/6 |
| Maldives | short | 6/6 |
| South Korea | short | 6/6 |
| Japan | short | 6/6 |
| India | short | 5/6 |

## 3. Per seed

Japan and India at day 1095, every seed:

| seed | Japan tech | Japan treasury | Japan debt | India tech | India treasury | India debt |
|---|---|---|---|---|---|---|
| 11 | 48.2 | 252 | 492 | 26 | 1,879 | 3,214 |
| 22 | 42.9 | 228 | 400 | 31.2 | 2,063 | 2,594 |
| 33 | 41.1 | 215 | 514 | 43.7 | 2,471 | 3,625 |
| 44 | 46.6 | 284 | 518 | 59.5 | 1,193,152 | 0 |
| 55 | 54.9 | 259 | 514 | 33.3 | 2,096 | 2,733 |
| 66 | 73.6 | 284 | 1,277 | 42.3 | 2,437 | 2,099 |
