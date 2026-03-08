# Game Analysis: 2048

## Target Game

**2048** by Gabriele Cirulli (MIT license)
Self-hosted at `game/index.html` — no external server required.

---

## Verified DOM State Model

All facts below were confirmed by auditing the canonical source at
`github.com/gabrielecirulli/2048`.

### Grid Encoding

Tiles are rendered as `<div>` elements inside `.tile-container`.
Each tile carries two key class families:

| Class pattern | Meaning |
|---|---|
| `tile-{value}` | Tile's current numeric value (2, 4, 8, …, 2048, super) |
| `tile-position-{col}-{row}` | Visual position: col = x+1, row = y+1 (1-indexed) |

Grid coordinates:

```
col →   1     2     3     4
row
 1    [0,0] [1,0] [2,0] [3,0]
 2    [0,1] [1,1] [2,1] [3,1]
 3    [0,2] [1,2] [2,2] [3,2]
 4    [0,3] [1,3] [2,3] [3,3]
```

Copilot internal grid: `grid[row-1][col-1]` → `grid[y][x]` where `0` = empty.

### Score / Best Score

| Signal | DOM selector | Extraction |
|---|---|---|
| Current score | `.score-container` | Text node (first child TEXT_NODE, not the animation div) |
| Best score | `.best-container` | Same pattern |

The `.score-container` also contains a short-lived `.score-addition` child div for
animations; we skip it by iterating `childNodes` for TEXT_NODE only.

### Game Terminal State

| State | DOM signal |
|---|---|
| Game over (no moves) | `.game-message` has class `game-over` |
| Game won (reached 2048) | `.game-message` has class `game-won` |
| In progress | Neither class present |

### Input Protocol

The keyboard input manager (`game/js/keyboard_input_manager.js`) listens for
`keydown` on `document`. The copilot dispatches:

```ts
document.dispatchEvent(new KeyboardEvent('keydown', {
  keyCode: 38,  // ↑ UP
  which:   38,
  bubbles: true,
}));
```

| Action | keyCode |
|---|---|
| UP    | 38 |
| RIGHT | 39 |
| DOWN  | 40 |
| LEFT  | 37 |

Restart is triggered by clicking `.retry-button` (post-game-over) or
`.restart-button` (header button).

---

## Game Mechanics (Verified)

### Move Algorithm

1. Tiles slide as far as possible in the chosen direction.
2. Two adjacent tiles of equal value merge into one tile with their sum.
3. **One merge per tile per move** — a merged tile cannot merge again in the same
   move (prevented by `mergedFrom` flag in `game_manager.js`).
4. Score increases by the value of the merged tile.
5. If at least one tile moved, a new tile spawns in a random empty cell.
6. New tile value: 2 (probability 0.9) or 4 (probability 0.1).

### Win / Loss Conditions

- **Win**: any tile reaches value 2048 (player may continue past this).
- **Loss**: no empty cells remain AND no adjacent tiles have equal values.

---

## Inferred Heuristics (Not Hard Rules)

These are initial hypotheses that the learning engine validates over time:

| Heuristic | Rationale | Status |
|---|---|---|
| Keep max tile in a corner | Reduces entropy; allows monotone ordering | Inferred (literature) |
| Prefer monotone rows/cols | Merges flow in one direction without blocking | Inferred (literature) |
| Maximize empty cells | More empty = more options; less likely to lose | Inferred (obvious) |
| Smooth adjacency | Adjacent similar-value tiles merge easily | Inferred (literature) |

---

## State Schema (TypeScript)

```ts
interface GameState {
  grid:           number[][];   // [row][col], 0 = empty
  score:          number;       // current game score
  bestScore:      number;       // all-time best from localStorage
  gameOver:       boolean;
  gameWon:        boolean;
  maxTile:        number;       // largest tile on board
  emptyCellCount: number;       // 0–15
  moveCount:      number;       // copilot-tracked move index
  phase:          'early' | 'mid' | 'late';
}
```

Phase thresholds (configurable in `src/config.ts`):

| Phase | Condition |
|---|---|
| early | maxTile < 256 |
| mid   | maxTile < 1024 |
| late  | maxTile ≥ 1024 |
