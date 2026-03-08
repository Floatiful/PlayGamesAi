/**
 * strategy-engine.ts
 *
 * Selects the best action using Expectimax search blended with learned biases.
 *
 * Algorithm:
 *   1. For each of 4 actions, simulate move. Skip if grid unchanged.
 *   2. Score = expectimax(resultGrid, depth-1, isChance=true)
 *              + confidenceBlend * learnedBias[phase][action]
 *   3. Return action with highest score.
 *
 * Expectimax:
 *   - MAX node: max over valid actions of expectimax(child, d-1, false)
 *   - CHANCE node: weighted avg over all empty-cell × {2:0.9, 4:0.1} spawns
 *     (cap at 8 sampled empty cells to keep depth-4 fast enough for real-time)
 *   - Leaf (d=0): heuristic(grid)
 *
 * Heuristic (all weights verified via 2048 AI literature):
 *   = w_mono   * monotonicity
 *   + w_smooth * smoothness
 *   + w_empty  * log2(emptyCells + 1)
 *   + w_corner * cornerBonus
 */

import { ACTIONS, type Action, type Grid, simulateMove, emptyCells, spawnTile } from './action-catalog.js';
import { type GameState } from './state-extractor.js';
import { type LearningEngine } from './learning-engine.js';
import { CONFIG } from '../config.js';

const { heuristicWeights: HW } = CONFIG;

// ─── Heuristic evaluation ────────────────────────────────────────────────────

/**
 * Monotonicity: reward grids where rows/cols are monotonically ordered.
 * Higher = better (tiles arranged so merges flow in one direction).
 */
function monotonicity(grid: Grid): number {
  let score = 0;
  const n = grid.length;

  // Rows: left-to-right and right-to-left
  for (let r = 0; r < n; r++) {
    let incr = 0, decr = 0;
    for (let c = 1; c < n; c++) {
      const a = grid[r][c - 1], b = grid[r][c];
      if (a > b) decr += b > 0 ? Math.log2(b) : 0;
      else       incr += a > 0 ? Math.log2(a) : 0;
    }
    score += Math.max(incr, decr);
  }

  // Columns: top-to-bottom and bottom-to-top
  for (let c = 0; c < n; c++) {
    let incr = 0, decr = 0;
    for (let r = 1; r < n; r++) {
      const a = grid[r - 1][c], b = grid[r][c];
      if (a > b) decr += b > 0 ? Math.log2(b) : 0;
      else       incr += a > 0 ? Math.log2(a) : 0;
    }
    score += Math.max(incr, decr);
  }

  return score;
}

/**
 * Smoothness: reward adjacent tiles with similar values.
 * Lower difference = easier to merge. We negate (higher = better for caller).
 */
function smoothness(grid: Grid): number {
  let penalty = 0;
  const n = grid.length;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (grid[r][c] === 0) continue;
      const val = Math.log2(grid[r][c]);
      // Right neighbor
      if (c + 1 < n && grid[r][c + 1] !== 0)
        penalty += Math.abs(val - Math.log2(grid[r][c + 1]));
      // Down neighbor
      if (r + 1 < n && grid[r + 1][c] !== 0)
        penalty += Math.abs(val - Math.log2(grid[r + 1][c]));
    }
  }
  return -penalty;
}

/**
 * Corner bonus: reward having the max tile in any corner.
 */
function cornerBonus(grid: Grid): number {
  const n = grid.length;
  let max = 0;
  for (const row of grid) for (const v of row) if (v > max) max = v;
  const corners = [
    grid[0][0], grid[0][n - 1], grid[n - 1][0], grid[n - 1][n - 1],
  ];
  return corners.includes(max) ? Math.log2(max) : 0;
}

function heuristic(grid: Grid): number {
  const empty = 0;
  let emptyCount = 0;
  for (const row of grid) for (const v of row) if (v === 0) emptyCount++;

  return HW.monotonicity * monotonicity(grid)
       + HW.smoothness   * smoothness(grid)
       + HW.emptyCells   * Math.log2(emptyCount + 1)
       + HW.cornerBonus  * cornerBonus(grid);
}

// ─── Expectimax ──────────────────────────────────────────────────────────────

const MAX_CHANCE_CELLS = 8; // bound branching factor at chance nodes

function expectimax(grid: Grid, depth: number, isChance: boolean): number {
  if (depth === 0) return heuristic(grid);

  if (isChance) {
    // Chance node: average over tile spawns
    const cells = emptyCells(grid);
    if (cells.length === 0) return heuristic(grid);

    // Sample up to MAX_CHANCE_CELLS empty cells (uniform random subset)
    let sample = cells;
    if (cells.length > MAX_CHANCE_CELLS) {
      // Take evenly-spaced sample to avoid random variation
      sample = [];
      const step = cells.length / MAX_CHANCE_CELLS;
      for (let i = 0; i < MAX_CHANCE_CELLS; i++) {
        sample.push(cells[Math.floor(i * step)]);
      }
    }

    let total = 0;
    const weight2 = 0.9, weight4 = 0.1;

    for (const { row, col } of sample) {
      total += weight2 * expectimax(spawnTile(grid, row, col, 2), depth - 1, false);
      total += weight4 * expectimax(spawnTile(grid, row, col, 4), depth - 1, false);
    }

    return total / sample.length;
  } else {
    // Max node: pick best action
    let best = -Infinity;
    let anyValid = false;

    for (const action of ACTIONS) {
      const result = simulateMove(grid, action);
      if (!result.changed) continue;
      anyValid = true;
      const score = expectimax(result.grid, depth - 1, true);
      if (score > best) best = score;
    }

    return anyValid ? best : heuristic(grid); // terminal state
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface ScoredAction {
  action:        Action;
  expectimaxScore: number;
  learnedBias:   number;
  totalScore:    number;
}

/**
 * Choose the best action for the current game state.
 * Blends Expectimax with learned phase biases.
 */
export function getBestAction(
  state:  GameState,
  engine: LearningEngine,
): { action: Action; scores: ScoredAction[] } {
  const confidence = engine.getConfidence(state.phase);
  // confidenceBlend: how much weight to give learned bias vs pure heuristic
  // 0 when no data, up to 0.5 when fully confident
  const confidenceBlend = confidence * 0.5;

  const scored: ScoredAction[] = [];

  for (const action of ACTIONS) {
    const result = simulateMove(state.grid, action);
    if (!result.changed) continue;

    const expectimaxScore = expectimax(result.grid, CONFIG.expectimaxDepth - 1, true);
    const learnedBias     = engine.getBias(state.phase, action);
    const totalScore      = expectimaxScore + confidenceBlend * learnedBias;

    scored.push({ action, expectimaxScore, learnedBias, totalScore });
  }

  if (scored.length === 0) {
    // No valid moves — game is over; return any action as a no-op
    return { action: 'UP', scores: [] };
  }

  scored.sort((a, b) => b.totalScore - a.totalScore);
  return { action: scored[0].action, scores: scored };
}
