# Learning System

## Architecture Overview

The learning system is layered to separate concerns and allow safe recovery:

```
┌─────────────────────────────────────────────────┐
│  Layer 1: Hard-coded rules                       │
│  (action-catalog.ts, executor.ts)                │
│  Merge algorithm, key codes, DOM selectors.      │
│  NEVER mutated by learning.                      │
├─────────────────────────────────────────────────┤
│  Layer 2: Inferred heuristics                    │
│  (strategy-engine.ts)                            │
│  Monotonicity, smoothness, corner, empty cells.  │
│  Tunable via CONFIG.heuristicWeights.            │
│  Not mutated at runtime.                         │
├─────────────────────────────────────────────────┤
│  Layer 3: Learned weights                        │
│  (learning-engine.ts → localStorage)             │
│  Per-phase action biases. Updated every move.    │
│  Persisted as JSON. Decays + resets safely.      │
└─────────────────────────────────────────────────┘
```

---

## Reward Model

### Formula

```
reward = scoreDelta  × 0.40
       + emptyGain   × 10 × 0.20
       + mergeCount  × 5  × 0.20
       + maxProgress × 0.20
       + terminal
```

| Component | Signal source | Rationale |
|---|---|---|
| `scoreDelta` | `after.score - before.score` | Primary game objective |
| `emptyGain` | `after.emptyCellCount - before.emptyCellCount` | More empty = more options |
| `mergeCount` | From `simulateMove()` result | Merging is the core mechanic |
| `maxProgress` | `after.maxTile > before.maxTile ? 1 : 0` | Progress toward win condition |
| `terminal` | `gameOver → -100`, `gameWon → +500` | Strong boundary signals |

All coefficients are observable, game-derived signals — no invented rewards.

---

## Weight Update Rule

Uses a **SARSA-style update** with an exponential moving average baseline:

```
avgReward[phase] = avgReward × (1 - 0.05) + reward × 0.05   ← EMA baseline
bias[phase][action] += learningRate × (reward - avgReward)
sampleCounts[phase][action]++
```

- `learningRate` = 0.01 (conservative; avoids overcorrection from single outlier games)
- EMA coefficient = 0.05 (slow-moving baseline, stable across game lengths)
- Biases are additive offsets to the Expectimax score (not multiplicative)

---

## Confidence Model

```
confidence(phase) = min(sampleCounts[phase][action] for all actions)
                    ÷ minConfidenceSamples
                    clamped to [0, 1]
```

The **blend weight** scales learned bias influence:

```
totalScore(action) = expectimaxScore + confidence × 0.5 × bias[phase][action]
```

| Confidence | Bias influence |
|---|---|
| 0.0 (< 10 samples) | 0% (pure Expectimax + heuristic) |
| 0.5 (5 samples each) | 25% |
| 1.0 (≥ 10 each) | 50% |

---

## Weight Store Schema (localStorage JSON)

Key: `copilot_weights_v1`

```json
{
  "early": {
    "actionBias":   { "UP": 0.12, "DOWN": -0.05, "LEFT": 0.08, "RIGHT": 0.03 },
    "sampleCounts": { "UP": 234,  "DOWN": 189,   "LEFT": 210,  "RIGHT": 198  },
    "avgReward": 4.2
  },
  "mid": { ... },
  "late": { ... },
  "gamesCompleted": 42
}
```

---

## Decay Strategy

Every `decayIntervalGames` completed games (default: 10):

```
bias[phase][action] *= decayFactor   (default: 0.95)
```

**Purpose**: Prevents over-fitting to a stale strategy. Biases from early
exploration gradually fade, leaving room for new evidence to dominate.

The overall direction of bias is preserved; only magnitude shrinks.

---

## Session Memory Schema (localStorage JSON)

Key: `copilot_sessions_v1` — array of up to 200 `SessionSummary` objects.

```json
[
  {
    "id": "s_1741462800000_abc12",
    "startTs": 1741462800000,
    "endTs":   1741463100000,
    "finalScore": 14240,
    "maxTile": 512,
    "moveCount": 318,
    "won": false,
    "avgReward": 6.8,
    "moves": [ ... ]
  }
]
```

`moves` array is included for offline analysis but is truncated to last 200
sessions to bound storage usage.

---

## Recovery Mechanisms

| Problem | Recovery |
|---|---|
| Bad biases from unlucky games | Natural decay (0.95^10 ≈ 0.6 after 10 games) |
| Completely wrong strategy learned | Click "Reset Learning" in overlay → `engine.reset()` |
| Per-phase corruption | `engine.reset('early')` — isolates damage |
| Confidence too low | Bias weight → 0; Expectimax dominates (safe fallback) |
| localStorage parse error | `catch` silently resets to empty store |

---

## Phase Detection

Phases allow the copilot to learn different strategies for different board stages:

| Phase | Max tile range | Typical strategy |
|---|---|---|
| `early` | < 256 | Build structure; keep corner free |
| `mid`   | 256–1023 | Consolidate; prevent blocking |
| `late`  | ≥ 1024 | Careful ordering; avoid dead ends |

Phases are derived from the board's current maximum tile at each step.
