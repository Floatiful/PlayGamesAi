/**
 * executor.ts
 *
 * Dispatches moves to the 2048 game via keyboard events.
 * Supports three modes:
 *   dry-run → only logs; never touches the game
 *   assist  → no-op (overlay shows the hint; user presses key themselves)
 *   auto    → dispatches keydown on `document` + waits autoDelayMs
 */

import { ACTION_KEY, type Action } from './action-catalog.js';
import { type Mode, CONFIG } from '../config.js';

export class Executor {
  private mode: Mode;

  constructor(mode: Mode = CONFIG.mode) {
    this.mode = mode;
  }

  setMode(m: Mode): void { this.mode = m; }
  getMode(): Mode         { return this.mode; }

  /**
   * Execute the chosen action in the current mode.
   * Returns a promise that resolves after the action + delay.
   */
  async execute(action: Action): Promise<void> {
    switch (this.mode) {
      case 'dry-run':
        console.log(`[Copilot DRY-RUN] Would play: ${action}`);
        await this.delay(CONFIG.autoDelayMs);
        break;

      case 'assist':
        // In ASSIST mode the overlay waits for the user to press the key.
        // The executor itself is a no-op.
        break;

      case 'auto':
        this.dispatchKey(action);
        await this.delay(CONFIG.autoDelayMs);
        break;
    }
  }

  /**
   * Dispatch a keydown event for the given action.
   * The 2048 keyboard_input_manager listens on `document` for these events.
   */
  dispatchKey(action: Action): void {
    const keyCode = ACTION_KEY[action];
    const event   = new KeyboardEvent('keydown', {
      keyCode,
      which:   keyCode,
      bubbles: true,
    });
    document.dispatchEvent(event);
  }

  /** Click the "Try again" button to restart the game. */
  clickRestart(): void {
    const btn = document.querySelector<HTMLElement>('.retry-button')
             ?? document.querySelector<HTMLElement>('.restart-button');
    btn?.click();
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
