# Census: phase 1, the economy alone

| field | value |
|---|---|
| date | 2026-10-05 |
| kind | census |
| commit | the phase 1 commit (before `tools/census.py --report` existed) |
| command | `python tools/census.py` |
| seeds | 11, 22, 33, 44, 55, 66 |
| days | 1095 |
| pillars | economy |
| ms per day | not recorded |
| source | back-filled from design.md §4.7 "First census"; per-seed tables not kept |

## At a glance

- Nine nations in famine on every seed: the city states, islands and Gulf states with no reserves.
- 13 to 15 nations with an unpowered economy, India in five seeds of six, shrinking to what their energy ceilings can power.
- The world's idle share is 20%; income 56,000 to 58,000 a day; mean technology 61 to 62.
- China sits 25 times past its energy ceiling and keeps paying by sheer infrastructure; the United States and Brazil at about 2; Russia under 0.5.
- No nation vanished or exploded.

## Summary

The first census of the rebuilt map side, with the economy pillar
alone: no trade, so every nation lives on its own reserves. The
pressures the trade phase is meant to answer are all visible on the
cards: famine where there are no reserves, unpowered economies where
energy is short, a fifth of the world idle.

## 1. World lines

| line | min | median | max |
|---|---|---|---|
| nations | 194 | 194 | 194 |
| famineNations | 9 | 9 | 9 |
| shortNations (unpowered) | 13 | 14 | 15 |
| idleShare (%) | 20 | 20 | 20 |
| income (money a day) | 56,000 | 57,000 | 58,000 |
| techMean | 61 | 61.5 | 62 |

## 2. Flagged in at least half the seeds

| nation | flag | seeds |
|---|---|---|
| Singapore, Qatar, the Maldives, Malta, Kuwait, Djibouti, Bahrain, Andorra, Western Sahara | famine | 6/6 |
| India | short | 5/6 |
| Japan | short (early on) | not recorded |

## 3. Per seed

Not kept; the tables were printed to the terminal only.
