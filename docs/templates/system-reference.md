## <n>. <System>

| field | value |
|---|---|
| owner | `js/<name>.js` (hooks in <other files>) |
| slot | `<slot>` |
| design | `design.md` §5.<n> |
| phase | <n> |
| status | built (G4a) / tuning / settled (G4b) |
| levers | <n> of a target of <m> |
| data | data/census-<date>-<slug>.md · data/round-<date>-<system>-<n>.md |

### At a glance

- <5 to 10 bullets: what it does, what it reads and writes, the numbers that matter, the gaps>

### Summary

<One paragraph, at most 120 words: what the code does today and what changed last.>

### 1. What it does

The day, in order; each step names the ledger keys it writes.

1. <step> → `<pillar>.<key>`
2. <step> → `<pillar>.<key>`

| surface | items |
|---|---|
| card rows | <labels> |
| layers | <keys> |
| wire | <the transitions that make a headline> |
| census | <keys>; flags <keys> |
| smoke flags | `<name>Registered`, `<name>Runs`, … |

### 2. What it touches

| reads / writes | other system | item | when |
|---|---|---|---|
| reads | economy | `s._income` (readout) | same day, after economy |
| writes | trade | `s._refuses` (readout) | read next day |

### 3. Register

#### 3.1 Variables

| code name | doc name | unit | kind | where set | where read |
|---|---|---|---|---|---|
| `<name>` | <doc name> | <unit> | lever / K / field / world field / readout / ledger key / census key | `<file>:<function>` | `<file>:<function>` |

#### 3.2 Formulas

| id | formula | symbols | levers in it | code |
|---|---|---|---|---|
| F1 | <formula> | <symbols with units> | `<lever>` | `<file>:<function>` |

### 4. Levers and constants

Config group "<Group>":

| key | default | unit | meaning | moved in |
|---|---|---|---|---|
| `<lever>` | <n> | <unit> | <one line> | data/round-<date>-<system>-<n>.md |

Fixed in `K`:

| key | value | meaning |
|---|---|---|
| `<constant>` | <n> | <one line> |

### 5. Departures from the design

| what | why | id |
|---|---|---|
| <what the code does differently from §5.<n>> | <one line> | <PREFIX>-<nn> |

### 6. Assumptions and gaps

- <assumption built in, one line each>

| gap | seen in | owner phase | id |
|---|---|---|---|
| <shortfall accepted> | data/census-<date>-<slug>.md | <phase> | <PREFIX>-<nn> |
