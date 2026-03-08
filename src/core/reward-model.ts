/**
 * reward-model.ts
 *
 * Computes a scalar reward signal from the transition (before → after) for a
 * given action. Used by the learning engine to update action weights.
 *
 * Formula (verified signals only — no invented heuristics):
 *
 *   reward = scoreDelta  * 0.40   ← primary signal (actual game score)
 *          + emptyGain  * 0.20   ← empty cells gained × 10 (optionality proxy)
 *          + mergeBonus * 0.20   ← merge count × 5 (momentum)
 *          + maxProgress* 0.20   ← 1 if max tile grew, else 0
 *
 *   Terminal bonuses / penalties (not part of normal step reward):
 *     game-over → -100
 *     game-won  → +500
 */

import { type GameState } from './state-extractor.js';
import { type Action } from './action-catalog.js';

export interface RewardBreakdown {
  total:       number;
  scorePart:   number;
  emptyPart:   number;
  mergePart:   number;
  progressPart:number;
  terminal:    number;
}

/**
 * Compute the reward for transitioning from `before` to `after` via `action`.
 * `mergeCount` must be provided from the ActionResult of the simulated move.
 */
export function computeReward(
  before:     GameState,
  after:      GameState,
  _action:    Action,
  mergeCount: number,
): RewardBreakdown {
  const scoreDelta = Math.max(0, after.score - before.score);
  const emptyGain  = after.emptyCellCount - before.emptyCellCount; // may be negative
  const maxGrew    = after.maxTile > before.maxTile ? 1 : 0;

  const scorePart    = scoreDelta * 0.40;
  const emptyPart    = emptyGain  * 10 * 0.20;
  const mergePart    = mergeCount * 5  * 0.20;
  const progressPart = maxGrew         * 0.20;

  let terminal = 0;
  if (after.gameOver) terminal = -100;
  if (after.gameWon)  terminal = +500;

  const total = scorePart + emptyPart + mergePart + progressPart + terminal;

  return { total, scorePart, emptyPart, mergePart, progressPart, terminal };
}
