/**
 * index.ts — Copilot entry point
 *
 * Initializes all subsystems and runs the main control loop.
 *
 * Modes:
 *   dry-run → observe + log; never dispatch keys
 *   assist  → show suggestion in overlay; wait for user key; record outcome
 *   auto    → dispatch keys automatically at CONFIG.autoDelayMs interval
 *
 * The script is loaded at the bottom of game/index.html, after all game JS,
 * so window.gameManager is available by the time DOMContentLoaded fires.
 */

import { CONFIG, type Mode } from './config.js';
import { extractState, resetMoveCount, incrementMoveCount } from './core/state-extractor.js';
import { simulateMove, ACTIONS, type Action } from './core/action-catalog.js';
import { computeReward } from './core/reward-model.js';
import { SessionMemory } from './core/session-memory.js';
import { LearningEngine } from './core/learning-engine.js';
import { getBestAction } from './core/strategy-engine.js';
import { Executor } from './core/executor.js';
import { Overlay } from './ui/overlay.js';

// ─── State ────────────────────────────────────────────────────────────────────

const engine   = new LearningEngine();
const memory   = new SessionMemory();
const executor = new Executor(CONFIG.mode);
let overlay:   Overlay;
let running    = false;
let assistMode = CONFIG.mode === 'assist';

// ─── Startup ─────────────────────────────────────────────────────────────────

function init(): void {
  overlay = new Overlay(
    engine,
    executor,
    onModeChange,
    onReset,
  );
  overlay.inject();
  // Small delay to let the game fully initialize its DOM
  setTimeout(startLoop, 600);
}

function onModeChange(m: Mode): void {
  assistMode = m === 'assist';
  if (m === 'auto' || m === 'dry-run') {
    if (!running) startLoop();
  }
}

function onReset(): void {
  console.log('[Copilot] Learning weights reset.');
}

// ─── Main loop ────────────────────────────────────────────────────────────────

async function startLoop(): Promise<void> {
  if (running) return;
  running = true;

  while (running) {
    const mode = executor.getMode();

    if (mode === 'assist') {
      // ASSIST: compute suggestion and wait for user input
      await runAssistTick();
    } else {
      // AUTO / DRY-RUN: autonomous loop
      await runAutoTick();
    }
  }
}

async function runAutoTick(): Promise<void> {
  const before = extractState();
  if (!before) {
    await sleep(200);
    return;
  }

  if (before.gameOver || before.gameWon) {
    await handleGameEnd(before);
    return;
  }

  const { action, scores } = getBestAction(before, engine);
  overlay.update(before, action, scores);

  await executor.execute(action);

  // Read state after move
  await sleep(50); // let DOM update
  const after = extractState();
  if (!after) return;

  incrementMoveCount();

  const simResult = simulateMove(before.grid, action);
  const reward    = computeReward(before, after, action, simResult.mergeCount);

  engine.recordOutcome(before.phase, action, reward.total);
  memory.recordMove(before, action, after, reward);

  overlay.update(after, action, scores);
}

async function runAssistTick(): Promise<void> {
  const state = extractState();
  if (!state) { await sleep(300); return; }

  if (state.gameOver || state.gameWon) {
    await handleGameEnd(state);
    return;
  }

  const { action, scores } = getBestAction(state, engine);
  overlay.update(state, action, scores);

  // Wait for any keydown from the user
  const pressedKey = await waitForKeydown();
  if (pressedKey === null) return;

  // Determine which action the user actually took (or copilot suggestion if they pressed the suggested key)
  const userAction = keycodeToAction(pressedKey) ?? action;

  await sleep(100); // wait for DOM
  const after = extractState();
  if (!after) return;

  incrementMoveCount();
  const simResult = simulateMove(state.grid, userAction);
  const reward    = computeReward(state, after, userAction, simResult.mergeCount);

  engine.recordOutcome(state.phase, userAction, reward.total);
  memory.recordMove(state, userAction, after, reward);
}

async function handleGameEnd(state: ReturnType<typeof extractState> & object): Promise<void> {
  const summary = memory.endSession(state);
  engine.onGameComplete();
  overlay.showGameOver(summary.finalScore, summary.maxTile);

  const mode = executor.getMode();
  if (mode === 'auto') {
    await sleep(2000);
    executor.clickRestart();
    resetMoveCount();

    // Give game time to reset
    await sleep(800);
    overlay.hideBanner();
    // Re-create session memory for next game
    Object.assign(memory, new SessionMemory());
  } else {
    // Stay paused until user manually restarts
    running = false;
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/** Returns a promise that resolves with the keyCode of the next keydown event. */
function waitForKeydown(): Promise<number | null> {
  return new Promise(resolve => {
    const handler = (e: KeyboardEvent) => {
      document.removeEventListener('keydown', handler);
      resolve(e.keyCode ?? e.which);
    };
    document.addEventListener('keydown', handler, { once: true });
    // Timeout after 30s so the loop doesn't stall forever
    setTimeout(() => {
      document.removeEventListener('keydown', handler);
      resolve(null);
    }, 30_000);
  });
}

function keycodeToAction(code: number): Action | null {
  const map: Record<number, Action> = { 38: 'UP', 39: 'RIGHT', 40: 'DOWN', 37: 'LEFT' };
  return map[code] ?? null;
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  // Script loaded after DOMContentLoaded (typical when placed at bottom of body)
  init();
}

// Expose for console debugging
(window as unknown as Record<string, unknown>).copilot = {
  engine,
  memory,
  executor,
  getState: extractState,
  ACTIONS,
};
