/**
 * state-extractor.ts
 *
 * Reads the live 2048 DOM and produces a typed GameState.
 *
 * Verified DOM facts:
 *   - Tiles: .tile.tile-{value}.tile-position-{col}-{row}
 *     where col = x+1 (1-4, left→right) and row = y+1 (1-4, top→bottom).
 *     So grid[row-1][col-1] = value.
 *   - Score: .score-container  (text node, may also contain a .score-addition child)
 *   - Best:  .best-container
 *   - Game over: .game-message.game-over
 *   - Game won:  .game-message.game-won
 */

import { type Grid, maxTile } from './action-catalog.js';
import { CONFIG, type Phase } from '../config.js';

export interface GameState {
  grid:           Grid;    // [row][col], 0 = empty
  score:          number;
  bestScore:      number;
  gameOver:       boolean;
  gameWon:        boolean;
  maxTile:        number;
  emptyCellCount: number;
  moveCount:      number;  // incremented by the copilot loop, not read from DOM
  phase:          Phase;
}

let _moveCount = 0;
let _lastScore = 0;

/** Reset internal counters (call on new game). */
export function resetMoveCount(): void {
  _moveCount = 0;
  _lastScore = 0;
}

export function incrementMoveCount(): void {
  _moveCount++;
}

/** Parse the numeric value out of a score container (ignores child animation divs). */
function parseScoreElement(el: Element | null): number {
  if (!el) return 0;
  // The score is the text node (first child), not child elements
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const val = parseInt(node.textContent?.trim() ?? '0', 10);
      if (!isNaN(val)) return val;
    }
  }
  // Fallback: parse textContent of the container itself
  return parseInt(el.textContent?.trim() ?? '0', 10) || 0;
}

function derivePhase(max: number): Phase {
  if (max < CONFIG.phaseThresholds.earlyMax) return 'early';
  if (max < CONFIG.phaseThresholds.midMax)   return 'mid';
  return 'late';
}

/**
 * Read the complete game state from the live DOM.
 * Returns null if the game container isn't found yet.
 */
export function extractState(): GameState | null {
  const tileContainer = document.querySelector('.tile-container');
  if (!tileContainer) return null;

  // Build 4×4 grid (row-major, all zeros)
  const grid: Grid = Array.from({ length: 4 }, () => Array(4).fill(0));

  // Parse every .tile element
  for (const el of tileContainer.querySelectorAll('.tile')) {
    const classes: string[] = Array.from(el.classList);

    // Extract value from tile-{value} class
    let value = 0;
    for (const cls of classes) {
      if (cls.startsWith('tile-') && !cls.startsWith('tile-position') &&
          cls !== 'tile-new' && cls !== 'tile-merged' && cls !== 'tile-super' &&
          cls !== 'tile-inner') {
        const v = parseInt(cls.slice(5), 10);
        if (!isNaN(v)) { value = v; break; }
      }
    }

    // Extract position from tile-position-{col}-{row}
    let col = -1, row = -1;
    for (const cls of classes) {
      if (cls.startsWith('tile-position-')) {
        const parts = cls.split('-');
        // tile-position-{col}-{row}  → parts[2], parts[3]
        col = parseInt(parts[2], 10) - 1; // 0-indexed
        row = parseInt(parts[3], 10) - 1;
        break;
      }
    }

    if (value > 0 && row >= 0 && row < 4 && col >= 0 && col < 4) {
      // Take the larger value if two tiles overlap at same cell (animation artifact)
      if (value > grid[row][col]) {
        grid[row][col] = value;
      }
    }
  }

  const score     = parseScoreElement(document.querySelector('.score-container'));
  const bestScore = parseScoreElement(document.querySelector('.best-container'));

  const msgEl   = document.querySelector('.game-message');
  const gameOver = msgEl?.classList.contains('game-over') ?? false;
  const gameWon  = msgEl?.classList.contains('game-won')  ?? false;

  const max = maxTile(grid);
  let empty = 0;
  for (const row of grid) for (const v of row) if (v === 0) empty++;

  return {
    grid,
    score,
    bestScore,
    gameOver,
    gameWon,
    maxTile: max,
    emptyCellCount: empty,
    moveCount: _moveCount,
    phase: derivePhase(max),
  };
}
