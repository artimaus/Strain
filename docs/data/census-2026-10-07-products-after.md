# Census: phase 3 after the progression round

| field | value |
|---|---|
| date | 2026-10-07 |
| kind | census |
| commit | `115c624` |
| command | `python tools/census.py` |
| seeds | 11, 22, 33, 44, 55, 66 |
| days | 1095 |
| pillars | economy, products, trade |
| ms per day | about 100 |
| source | back-filled from design.md §5.7 "Census after the round" and the terminal output kept in the session; seed 11's top rows below |

## At a glance

- Mean military 52 to 56, holding near its seeds (the United States 89, Russia 82, China 45); mean health 32 to 33.
- The rich hold where they start (the United States' health 80, Brazil and Mexico 54); the short nations decay (China 20, Pakistan 18, India 5).
- Short 5 to 7 (Taiwan, South Korea, India, Bangladesh in most seeds); famine 2 (Singapore, the Maldives).
- Income 54,500 to 57,000; mean technology 57 to 61 (Japan holds at 96; India, unpowered, falls to 32).
- Accepted as phase 3; the numbers get their pass in balance.

## Summary

The closing census of phase 3, after a point was priced in
worker-days at the wage on an exponential curve (PRD-08). The levels
hold near their seeds instead of racing: a 10% share climbs about 15
points a year at level 0, 3 at 50, half a point at 100.

## 1. World lines

| line | min | median | max |
|---|---|---|---|
| people (M) | 8,255 | 8,260 | 8,261 |
| famineNations | 2 | 2 | 2 |
| shortNations | 5 | 6 | 7 |
| idleShare (%) | 10 | 13 | 14 |
| income (money a day) | 54,565 | 55,008 | 57,162 |
| techMean | 57.3 | 57.95 | 61 |
| milMean | 52.1 | 53.7 | 55.8 |
| heaMean | 31.8 | 32 | 33.3 |
| priceFood | 0.68 | 0.70 | 0.83 |
| priceEnergy | 0.60 | 0.60 | 0.67 |
| priceMat | 0.55 | 0.56 | 0.65 |
| traded (units a day) | 2,495 | 2,587 | 2,648 |
| deals | 244 | 255 | 279 |
| migrants (M a day) | 0.04 | 0.04 | 0.05 |

## 2. Flagged in at least half the seeds

| nation | flag | seeds |
|---|---|---|
| Taiwan | short | 6/6 |
| Singapore | short, famine | 6/6 |
| Maldives | short, famine | 6/6 |
| South Korea | short | 6/6 |
| India | short | 4/6 |
| Bangladesh | short | 4/6 |

## 3. Per seed

Seed 11, day 1095, the largest nations:

| iso | name | pop | idle | tech | treasury | mil | hea | imports | exports | deals | short |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CN | China | 1535 | 0 | 88.7 | 7,263,473 | 45.1 | 19.5 | 15 | 740 | 1 | |
| IN | India | 1375 | 49 | 31.7 | 2,016 | 74.9 | 5.2 | 0 | 172 | 0 | yes |
| US | United States | 377 | 0 | 94.1 | 2,992,632 | 88.9 | 79.9 | 17 | 93 | 2 | |
| ID | Indonesia | 293 | 0 | 56.1 | 273,117 | 53.7 | 45.5 | 27 | 39.3 | 5 | |
| PK | Pakistan | 232 | 14 | 40.5 | 31,303 | 62.8 | 17.5 | 38 | 25.9 | 6 | |
| BR | Brazil | 231 | 0 | 62 | 623,539 | 53.7 | 54.6 | 14 | 205 | 4 | |
| NG | Nigeria | 226 | 0 | 37.7 | 51,371 | 49.7 | 30.4 | 20 | 117 | 6 | |
| BD | Bangladesh | 163 | 32 | 40.5 | 166,258 | 12.4 | 6.7 | 30 | 22 | 2 | |
| RU | Russia | 150 | 2 | 70.7 | 879,302 | 81.6 | 50.3 | 35 | 56.9 | 2 | |
| MX | Mexico | 138 | 0 | 59.3 | 215,565 | 44.4 | 53.5 | 22 | 97.4 | 5 | |
| JP | Japan | 133 | 18 | 96.4 | 28,709 | 56.5 | 14.4 | 35 | 3.3 | 3 | yes |
| ET | Ethiopia | 122 | 14 | 27.5 | 122,700 | 42.9 | 14 | 2 | 3.4 | 0 | |
