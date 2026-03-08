/**
 * action-catalog.ts
 *
 * Defines the four 2048 actions and provides a pure grid simulation.
 * No DOM or side-effects — safe to call from Expectimax at depth.
 *
 * Grid convention: grid[row][col], row 0 = top, col 0 = left.
 * Values: 0 = empty cell.
 */

export type Grid = number[][];
export type Action = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export const ACTIONS: readonly Action[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

/** Maps Action → keyCode sent to the game's keyboard listener. */
export const ACTION_KEY: Record<Action, number> = {
  UP:    38,
  RIGHT: 39,
  DOWN:  40,
  LEFT:  37,
};

/** Maps Action → arrow glyph for UI display. */
export const ACTION_ARROW: Record<Action, string> = {
  UP:    '↑',
  DOWN:  '↓',
  LEFT:  '←',
  RIGHT: '→',
};

export interface ActionResult {
  grid:       Grid;
  scoreDelta: number;  // score points earned by merges in this move
  mergeCount: number;  // number of tile pairs merged
  emptyCells: number;  // empty cells in resulting grid
  changed:    boolean; // false → this move has no effect (skip it)
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function cloneGrid(grid: Grid): Grid {
  return grid.map(row => [...row]);
}

function countEmpty(grid: Grid): number {
  let n = 0;
  for (const row of grid) for (const v of row) if (v === 0) n++;
  return n;
}

/**
 * Slide one row leftward (merging equal adjacent tiles once per pair).
 * Returns { row, scoreDelta, mergeCount }.
 */
function slideLeft(row: number[]): { row: number[]; scoreDelta: number; mergeCount: number } {
  const filtered = row.filter(v => v !== 0);
  let scoreDelta = 0;
  let mergeCount = 0;

  for (let i = 0; i < filtered.length - 1; i++) {
    if (filtered[i] === filtered[i + 1]) {
      filtered[i] *= 2;
      scoreDelta += filtered[i];
      mergeCount++;
      filtered.splice(i + 1, 1);
    }
  }

  // Pad to length 4
  while (filtered.length < 4) filtered.push(0);
  return { row: filtered, scoreDelta, mergeCount };
}

/** Rotate 90° clockwise. */
function rotateCW(grid: Grid): Grid {
  const n = grid.length;
  const out: Grid = Array.from({ length: n }, () => Array(n).fill(0));
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      out[c][n - 1 - r] = grid[r][c];
  return out;
}

/** Rotate 90° counter-clockwise. */
function rotateCCW(grid: Grid): Grid {
  const n = grid.length;
  const out: Grid = Array.from({ length: n }, () => Array(n).fill(0));
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      out[n - 1 - c][r] = grid[r][c];
  return out;
}

/** Rotate 180°. */
function rotate180(grid: Grid): Grid {
  return rotateCW(rotateCW(grid));
}

/**
 * Apply LEFT slide to every row of the grid.
 * All other directions are reduced to this via rotation.
 */
function applyLeft(grid: Grid): { grid: Grid; scoreDelta: number; mergeCount: number } {
  let totalScore = 0;
  let totalMerge = 0;
  const newGrid: Grid = [];
  for (const row of grid) {
    const { row: newRow, scoreDelta, mergeCount } = slideLeft(row);
    newGrid.push(newRow);
    totalScore += scoreDelta;
    totalMerge += mergeCount;
  }
  return { grid: newGrid, scoreDelta: totalScore, mergeCount: totalMerge };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Simulate a move in the given direction.
 * Pure function — does NOT spawn a new tile (stochastic spawning is handled
 * separately inside Expectimax chance nodes).
 */
export function simulateMove(grid: Grid, action: Action): ActionResult {
  let rotated: Grid;
  let unrotate: (g: Grid) => Grid;

  switch (action) {
    case 'LEFT':
      rotated  = grid;
      unrotate = g => g;
      break;
    case 'RIGHT':
      rotated  = rotate180(grid);
      unrotate = rotate180;
      break;
    case 'UP':
      rotated  = rotateCCW(grid);
      unrotate = rotateCW;
      break;
    case 'DOWN':
      rotated  = rotateCW(grid);
      unrotate = rotateCCW;
      break;
  }

  const { grid: slid, scoreDelta, mergeCount } = applyLeft(rotated);
  const result = unrotate(slid);
  const changed = !gridsEqual(grid, result);

  return {
    grid:       result,
    scoreDelta,
    mergeCount,
    emptyCells: countEmpty(result),
    changed,
  };
}

function gridsEqual(a: Grid, b: Grid): boolean {
  for (let r = 0; r < a.length; r++)
    for (let c = 0; c < a[r].length; c++)
      if (a[r][c] !== b[r][c]) return false;
  return true;
}

/** Return all empty cell positions as {row, col} pairs. */
export function emptyCells(grid: Grid): Array<{ row: number; col: number }> {
  const cells: Array<{ row: number; col: number }> = [];
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < grid[r].length; c++)
      if (grid[r][c] === 0) cells.push({ row: r, col: c });
  return cells;
}

/** Return the maximum tile value in the grid. */
export function maxTile(grid: Grid): number {
  let max = 0;
  for (const row of grid) for (const v of row) if (v > max) max = v;
  return max;
}

/** Spawn a tile at (row, col) with given value — returns new grid copy. */
export function spawnTile(grid: Grid, row: number, col: number, value: number): Grid {
  const g = cloneGrid(grid);
  g[row][col] = value;
  return g;
}
