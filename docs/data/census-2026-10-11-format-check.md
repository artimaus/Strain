# Census: format-check

| field | value |
|---|---|
| date | 2026-10-11 |
| kind | census |
| commit | `234e19a` |
| command | `python tools/census.py --quick --report format-check` |
| seeds | 11 |
| days | 365 |
| pillars | economy, products, trade, relations, war |
| ms per day | 216 to 216 |

## At a glance

- One seed (11), one year: the first report written by `tools/census.py --report`, kept to prove the format.
- After a year the market has not settled: food 1.30, energy 0.93, materials 0.90, against 0.7, 0.6 and 0.55 at three years.
- Famine 2, short 7, idle 13%; 15 wars started in the first year, 14 peaces, 14 tributes being paid; 12 pacts.
- Military mean 60.9 in year one, on its way down to about 50 by year three (WAR-12's wages and attrition).
- A day costs 216 ms on this machine.

## Summary

A one-year run on seed 11 at commit `234e19a`, the phase 6 state of
the code, made to check that the report writer produces the header,
the world lines, the flagged nations and the per-seed table in the
shape `process.md` §4 asks for. The numbers are a first-year snapshot
and should not be compared with the three-year censuses except to see
the direction of travel.

## 1. World lines

| line | min | median | max |
|---|---|---|---|
| nations | 194 | 194 | 194 |
| population | 8013 | 8013 | 8013 |
| covered | 0 | 0 | 0 |
| people | 8064 | 8064 | 8064 |
| famineNations | 2 | 2 | 2 |
| shortNations | 7 | 7 | 7 |
| idleShare | 13 | 13 | 13 |
| income | 49703 | 49703 | 49703 |
| techMean | 61.60 | 61.60 | 61.60 |
| milMean | 60.90 | 60.90 | 60.90 |
| heaMean | 41 | 41 | 41 |
| priceFood | 1.30 | 1.30 | 1.30 |
| priceEnergy | 0.93 | 0.93 | 0.93 |
| priceMat | 0.90 | 0.90 | 0.90 |
| traded | 2155 | 2155 | 2155 |
| deals | 224 | 224 | 224 |
| migrants | 0.06 | 0.06 | 0.06 |
| pacts | 12 | 12 | 12 |
| loansToday | 0 | 0 | 0 |
| aidToday | 3 | 3 | 3 |
| defaults | 0 | 0 | 0 |
| wars | 1 | 1 | 1 |
| warsStarted | 15 | 15 | 15 |
| peaces | 14 | 14 | 14 |
| tributes | 14 | 14 | 14 |
| soldiers | 122 | 122 | 122 |

## 2. Flagged in at least half the seeds

| nation | flag | seeds |
|---|---|---|
| Zambia | paysTribute | 1/1 |
| Taiwan | short | 1/1 |
| Singapore | short | 1/1 |
| Russia | atWar | 1/1 |
| Norway | atWar | 1/1 |
| Namibia | paysTribute | 1/1 |
| Maldives | short | 1/1 |
| Mongolia | paysTribute | 1/1 |
| Latvia | paysTribute | 1/1 |
| Lithuania | paysTribute | 1/1 |
| Lebanon | paysTribute | 1/1 |
| South Korea | short | 1/1 |
| Japan | short | 1/1 |
| India | short | 1/1 |
| Israel | paysTribute | 1/1 |
| Guyana | paysTribute | 1/1 |
| Estonia | paysTribute | 1/1 |
| Djibouti | famine | 1/1 |
| Costa Rica | paysTribute | 1/1 |
| Botswana | paysTribute | 1/1 |
| Burundi | short | 1/1 |
| Azerbaijan | paysTribute | 1/1 |
| Andorra | famine | 1/1 |

## 3. Per seed

Seed 11: day 365, 194 nations, 8013 M people, 216 ms a day.

| iso | name | pop | idle | tech | treasury | strainFood | strainEnergy | strainMat | mil | hea | milBehind | heaFit | imports | exports | deals | allies | friends | enemies | debt | soldiers | covered | famine | short | importsHalf | atWar | paysTribute |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CN | China | 1463 | 0 | 88.30 | 1338859 | 1.01 | 3 | 3 | 83.50 | 39.40 | 0 | 96 | 21 | 148 | 5 | 1 | 23 | 0 | 0 | 29.26 |  |  |  |  |  |  |
| IN | India | 1415 | 29 | 61.60 | 5585 | 0.59 | 3 | 3 | 74.90 | 22.50 | 0 | 100 | 21 | 73.30 | 10 | 3 | 15 | 0 | 24572 | 7.08 |  |  | yes |  |  |  |
| US | United States of America | 350 | 0 | 93.80 | 877100 | 0.69 | 2.13 | 1.54 | 97.50 | 88.30 | 0 | 96 | 17 | 110 | 5 | 1 | 25 | 0 | 0 | 7.01 |  |  |  |  |  |  |
| ID | Indonesia | 278 | 0 | 55.40 | 136601 | 0.84 | 3 | 1.71 | 52 | 45.40 | 0 | 99 | 16 | 46 | 3 | 1 | 25 | 0 | 0 | 5.53 |  |  |  |  |  |  |
| PK | Pakistan | 236 | 30 | 39.40 | 6795 | 0.88 | 3 | 3 | 62.80 | 19.80 | 1 | 100 | 21 | 10.90 | 8 | 2 | 10 | 0 | 0 | 3.85 |  |  |  |  |  |  |
| NG | Nigeria | 221 | 14 | 36.70 | 40752 | 1.31 | 2.07 | 3 | 46.40 | 27 | 1 | 100 | 17 | 56.80 | 4 | 0 | 21 | 0 | 0 | 3.82 |  |  |  |  |  |  |
| BR | Brazil | 218 | 0 | 61.30 | 203943 | 1.05 | 1.34 | 0.61 | 54.40 | 57.20 | 0 | 99 | 12 | 178 | 2 | 4 | 28 | 0 | 0 | 4.36 |  |  |  |  |  |  |
| BD | Bangladesh | 170 | 27 | 39.60 | 29966 | 1.11 | 3 | 3 | 27.80 | 17.60 | 0 | 100 | 28 | 22 | 10 | 0 | 11 | 0 | 0 | 2.27 |  |  |  |  |  |  |
| RU | Russia | 143 | 2 | 70.10 | 305900 | 0.63 | 2.64 | 0.26 | 79.10 | 52.30 | 0 | 100 | 13 | 95.10 | 3 | 0 | 6 | 0 | 0 | 4.75 |  |  |  |  | yes |  |
| MX | Mexico | 131 | 0 | 58.60 | 89181 | 1.26 | 1.34 | 0.74 | 41.70 | 54.90 | 0 | 99 | 15 | 53.50 | 5 | 1 | 12 | 0 | 0 | 2.35 |  |  |  |  |  |  |
| JP | Japan | 129 | 9 | 97.40 | 565 | 2.66 | 3 | 3 | 59.70 | 45.50 | -1 | 96 | 26 | 14.20 | 8 | 1 | 9 | 0 | 1488 | 0.64 |  |  | yes |  |  |  |
| ET | Ethiopia | 124 | 27 | 26.50 | 18862 | 1.24 | 3 | 1.58 | 47.40 | 15.70 | 1 | 100 | 3 | 3 | 0 | 0 | 8 | 0 | 0 | 1.94 |  |  |  |  |  |  |
| PH | Philippines | 115 | 19 | 49.80 | 33349 | 0.89 | 3 | 1.25 | 34 | 29 | 1 | 100 | 17 | 2.80 | 7 | 0 | 9 | 0 | 0 | 1.50 |  |  |  |  |  |  |
| EG | Egypt | 113 | 5 | 47.20 | 60792 | 3.49 | 2.12 | 1.84 | 61.30 | 45.10 | 0 | 100 | 9 | 75.70 | 2 | 0 | 14 | 0 | 0 | 2.25 |  |  |  |  |  |  |
| CD | Dem. Rep. Congo | 100 | 46 | 15.90 | 46 | 0.82 | 0.81 | 1.28 | 34 | 16.20 | 1 | 100 | 16 | 9.30 | 1 | 0 | 20 | 0 | 0 | 0.92 |  |  |  |  |  |  |
| VN | Vietnam | 98.40 | 5 | 50.40 | 37411 | 0.90 | 3 | 1.31 | 43.80 | 44 | 0 | 100 | 15 | 24.20 | 4 | 0 | 13 | 0 | 0 | 1.71 |  |  |  |  |  |  |
| DE | Germany | 88.60 | 0 | 92.70 | 171738 | 1.45 | 3 | 2.27 | 52.60 | 81.70 | 0 | 95 | 23 | 34.60 | 3 | 0 | 29 | 0 | 0 | 1.77 |  |  |  |  |  |  |
| IR | Iran | 88.30 | 6 | 62.30 | 132114 | 1.03 | 2.76 | 0.48 | 64.90 | 56.40 | 0 | 100 | 14 | 54.20 | 3 | 1 | 20 | 0 | 0 | 1.77 |  |  |  |  |  |  |
| TR | Turkey | 86.30 | 0 | 65.10 | 58343 | 0.77 | 3 | 0.78 | 69.10 | 56.50 | 0 | 98 | 21 | 14.80 | 5 | 0 | 5 | 0 | 0 | 1.73 |  |  |  |  |  |  |
| TH | Thailand | 72.60 | 0 | 56.70 | 33860 | 0.66 | 3 | 1.12 | 44.30 | 63.40 | 0 | 99 | 15 | 8.50 | 3 | 0 | 12 | 0 | 0 | 1.32 |  |  |  |  |  |  |
| FR | France | 71.70 | 0 | 92.20 | 161659 | 1.28 | 2.34 | 1.69 | 69.30 | 86.30 | 0 | 95 | 21 | 62.20 | 2 | 0 | 28 | 0 | 0 | 1.43 |  |  |  |  |  |  |
| GB | United Kingdom | 70.50 | 0 | 94.30 | 157230 | 2.54 | 1.79 | 1.89 | 64 | 82 | 0 | 96 | 18 | 60.50 | 2 | 0 | 27 | 0 | 0 | 1.41 |  |  |  |  |  |  |
| TZ | Tanzania | 65.90 | 22 | 29.60 | 12338 | 1.37 | 0.99 | 0.36 | 36.60 | 30.50 | 1 | 100 | 17 | 24.90 | 5 | 0 | 22 | 0 | 0 | 0.87 |  |  |  |  |  |  |
| IT | Italy | 61.50 | 0 | 81.30 | 69174 | 1.48 | 3 | 2.40 | 51.80 | 65.90 | 0 | 96 | 20 | 29.50 | 4 | 0 | 29 | 0 | 0 | 1.23 |  |  |  |  |  |  |
| ZA | South Africa | 61 | 0 | 61 | 59217 | 0.82 | 0.49 | 4.02 | 41.20 | 51.90 | 0 | 99 | 14 | 29.50 | 3 | 0 | 16 | 0 | 0 | 0.99 |  |  |  |  |  |  |
| KE | Kenya | 54.30 | 11 | 42.30 | 18387 | 1.85 | 1.88 | 0.89 | 35.40 | 36.40 | 1 | 100 | 18 | 25.80 | 3 | 0 | 19 | 0 | 0 | 0.78 |  |  |  |  |  |  |
| KR | South Korea | 53.60 | 11 | 86.10 | 310 | 3 | 3 | 1.53 | 69.50 | 43.80 | -11 | 96 | 27 | 6.40 | 5 | 1 | 8 | 0 | 329 | 0.27 |  |  | yes |  |  |  |
| MM | Myanmar | 53.50 | 32 | 23.50 | 3864 | 0.90 | 0.50 | 0.27 | 50.10 | 24.50 | 1 | 100 | 15 | 17.20 | 4 | 0 | 13 | 1 | 0 | 0.80 |  |  |  |  |  |  |
| CO | Colombia | 51.90 | 1 | 54.10 | 49172 | 2.18 | 0.47 | 0.36 | 48.60 | 57.60 | 0 | 100 | 8 | 40 | 4 | 1 | 9 | 0 | 0 | 1.03 |  |  |  |  |  |  |
| ES | Spain | 49.90 | 0 | 75.80 | 83793 | 1.34 | 3 | 0.92 | 46.10 | 88.50 | 0 | 96 | 18 | 34.30 | 3 | 0 | 26 | 0 | 0 | 1 |  |  |  |  |  |  |
| UG | Uganda | 47.30 | 28 | 30 | 1016 | 0.62 | 1.32 | 0.73 | 40.80 | 24.80 | 1 | 100 | 6 | 0.20 | 0 | 0 | 5 | 0 | 0 | 0.60 |  |  |  |  |  |  |
| SD | Sudan | 46.90 | 37 | 21.60 | 13408 | 0.90 | 0.90 | 0.25 | 39.30 | 20.40 | 1 | 100 | 17 | 11.60 | 4 | 0 | 15 | 0 | 0 | 0.56 |  |  |  |  |  |  |
| AR | Argentina | 46.20 | 2 | 61.20 | 36686 | 1.09 | 0.33 | 0.26 | 39.30 | 56 | 0 | 100 | 11 | 32.40 | 3 | 1 | 12 | 0 | 0 | 0.73 |  |  |  |  |  |  |
| DZ | Algeria | 45.10 | 7 | 45.70 | 45315 | 2.05 | 0.93 | 0.35 | 55.20 | 51 | 0 | 100 | 15 | 26.40 | 4 | 0 | 20 | 0 | 0 | 0.90 |  |  |  |  |  |  |
| IQ | Iraq | 44.90 | 13 | 39.40 | 11658 | 1.51 | 1.34 | 0.74 | 51.80 | 38 | 1 | 100 | 15 | 22.40 | 3 | 0 | 16 | 0 | 0 | 0.79 |  |  |  |  |  |  |
| CA | Canada | 41.70 | 0 | 87.70 | 132050 | 0.53 | 0.72 | 0.08 | 50.90 | 80.10 | 0 | 96 | 10 | 42.60 | 1 | 0 | 19 | 0 | 0 | 0.83 |  |  |  |  |  |  |
| AF | Afghanistan | 41.10 | 43 | 19.80 | 11 | 1.51 | 0.86 | 0.65 | 38.70 | 17.60 | 0 | 100 | 8 | 7.90 | 3 | 2 | 6 | 0 | 0 | 0.38 |  |  |  |  |  |  |
| PL | Poland | 38.90 | 0 | 79.40 | 73199 | 1.89 | 0.71 | 0.42 | 56 | 76.20 | 0 | 97 | 18 | 31.50 | 3 | 0 | 16 | 0 | 0 | 0.78 |  |  |  |  |  |  |
| SA | Saudi Arabia | 38.40 | 0 | 63.10 | 93368 | 3 | 0.80 | 0.46 | 69.60 | 63 | 0 | 96 | 21 | 30.50 | 4 | 0 | 20 | 0 | 0 | 0.77 |  |  |  |  |  |  |
| MA | Morocco | 37.60 | 4 | 46.50 | 14874 | 0.94 | 2.47 | 1.81 | 47 | 46.30 | 0 | 100 | 17 | 20.10 | 3 | 0 | 19 | 0 | 0 | 0.66 |  |  |  |  |  |  |
