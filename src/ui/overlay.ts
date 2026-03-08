/**
 * overlay.ts
 *
 * Injects the copilot HUD panel into the game page.
 * Vanilla DOM + CSS — no framework dependency.
 *
 * Layout:
 *   ┌─────────────────────────────────┐
 *   │  🤖 COPILOT          [×]        │
 *   │  Mode: [DRY] [ASSIST] [AUTO]    │
 *   │  ──────────────────────────     │
 *   │  Suggestion:   ↑  (UP)         │
 *   │  Confidence:  ████░░░  64%      │
 *   │  ──────────────────────────     │
 *   │  Session #42 · 218 moves        │
 *   │  Score: 12340  Max: 512         │
 *   │  ──────────────────────────     │
 *   │  History (last 5 games)         │
 *   │  #41: 8920  max:256  ✗          │
 *   │  #40: 14210 max:512  ✗          │
 *   │  ──────────────────────────     │
 *   │  [Reset Learning]               │
 *   └─────────────────────────────────┘
 */

import { ACTION_ARROW, type Action } from '../core/action-catalog.js';
import { type GameState } from '../core/state-extractor.js';
import { type LearningEngine } from '../core/learning-engine.js';
import { SessionMemory } from '../core/session-memory.js';
import { type Executor } from '../core/executor.js';
import { type Mode } from '../config.js';
import { type ScoredAction } from '../core/strategy-engine.js';

const PANEL_ID = 'copilot-overlay';

export class Overlay {
  private panel:    HTMLElement | null = null;
  private engine:   LearningEngine;
  private executor: Executor;

  private currentSuggestion: Action | null = null;
  private onModeChange: (m: Mode) => void;
  private onReset:      () => void;

  constructor(
    engine:       LearningEngine,
    executor:     Executor,
    onModeChange: (m: Mode) => void,
    onReset:      () => void,
  ) {
    this.engine       = engine;
    this.executor     = executor;
    this.onModeChange = onModeChange;
    this.onReset      = onReset;
  }

  inject(): void {
    if (document.getElementById(PANEL_ID)) return;

    const style = document.createElement('style');
    style.textContent = OVERLAY_CSS;
    document.head.appendChild(style);

    this.panel = document.createElement('div');
    this.panel.id = PANEL_ID;
    this.panel.innerHTML = INITIAL_HTML;
    document.body.appendChild(this.panel);

    this.bindEvents();
  }

  update(state: GameState, action: Action, scores: ScoredAction[]): void {
    if (!this.panel) return;
    this.currentSuggestion = action;

    const mode = this.executor.getMode();
    const conf = this.engine.getConfidence(state.phase);
    const history = SessionMemory.loadHistory().slice(-5).reverse();

    // Mode buttons
    for (const m of ['dry-run', 'assist', 'auto'] as Mode[]) {
      const btn = this.panel.querySelector<HTMLElement>(`[data-mode="${m}"]`);
      if (btn) btn.classList.toggle('active', mode === m);
    }

    // Suggestion
    const arrow   = this.panel.querySelector('.cop-arrow');
    const actName = this.panel.querySelector('.cop-action-name');
    if (arrow)   arrow.textContent = ACTION_ARROW[action];
    if (actName) actName.textContent = action;

    // Confidence bar
    const bar = this.panel.querySelector<HTMLElement>('.cop-conf-fill');
    const pct = this.panel.querySelector('.cop-conf-pct');
    const pctVal = Math.round(conf * 100);
    if (bar) bar.style.width = `${pctVal}%`;
    if (pct) pct.textContent = `${pctVal}%`;

    // Session stats
    const statScore = this.panel.querySelector('.cop-score');
    const statMoves = this.panel.querySelector('.cop-moves');
    const statMax   = this.panel.querySelector('.cop-max');
    const statPhase = this.panel.querySelector('.cop-phase');
    if (statScore) statScore.textContent = String(state.score);
    if (statMoves) statMoves.textContent = String(state.moveCount);
    if (statMax)   statMax.textContent   = String(state.maxTile);
    if (statPhase) statPhase.textContent = state.phase;

    // History list
    const histEl = this.panel.querySelector('.cop-history');
    if (histEl) {
      histEl.innerHTML = history.map((s, i) => {
        const won = s.won ? '🏆' : '✗';
        return `<div class="cop-hist-row">#${i + 1}: ${s.finalScore} · max:${s.maxTile} ${won}</div>`;
      }).join('') || '<div class="cop-hist-row">No sessions yet</div>';
    }

    // ASSIST mode hint
    const hint = this.panel.querySelector<HTMLElement>('.cop-assist-hint');
    if (hint) {
      hint.style.display = mode === 'assist' ? 'block' : 'none';
      hint.textContent = mode === 'assist'
        ? `Press ${ACTION_ARROW[action]} to apply suggestion`
        : '';
    }

    // Score table in scores area
    const scoresEl = this.panel.querySelector('.cop-scores-table');
    if (scoresEl) {
      scoresEl.innerHTML = scores.map(s =>
        `<div class="cop-score-row ${s.action === action ? 'best' : ''}">` +
        `${ACTION_ARROW[s.action]} ${s.action.padEnd(5)}: ` +
        `${s.totalScore.toFixed(0)}</div>`
      ).join('');
    }
  }

  showGameOver(finalScore: number, maxTile: number): void {
    if (!this.panel) return;
    const banner = this.panel.querySelector('.cop-banner');
    if (banner) {
      banner.textContent = `Game over · Score: ${finalScore} · Max: ${maxTile}`;
      (banner as HTMLElement).style.display = 'block';
    }
  }

  hideBanner(): void {
    const banner = this.panel?.querySelector<HTMLElement>('.cop-banner');
    if (banner) banner.style.display = 'none';
  }

  private bindEvents(): void {
    if (!this.panel) return;

    // Mode toggle buttons
    this.panel.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const mode = target.dataset['mode'] as Mode | undefined;
      if (mode) {
        this.executor.setMode(mode);
        this.onModeChange(mode);
      }

      if (target.classList.contains('cop-reset-btn')) {
        this.engine.reset();
        this.onReset();
      }

      if (target.classList.contains('cop-close-btn')) {
        (this.panel as HTMLElement).style.display = 'none';
      }
    });
  }
}

// ─── Static HTML / CSS ──────────────────────────────────────────────────────

const INITIAL_HTML = `
<div class="cop-header">
  <span>🤖 Copilot</span>
  <button class="cop-close-btn">×</button>
</div>
<div class="cop-section">
  <div class="cop-label">Mode</div>
  <div class="cop-modes">
    <button data-mode="dry-run">DRY</button>
    <button data-mode="assist" class="active">ASSIST</button>
    <button data-mode="auto">AUTO</button>
  </div>
</div>
<div class="cop-section">
  <div class="cop-label">Suggestion</div>
  <div class="cop-suggestion">
    <span class="cop-arrow">↑</span>
    <span class="cop-action-name">UP</span>
  </div>
  <div class="cop-assist-hint">Press ↑ to apply suggestion</div>
</div>
<div class="cop-section">
  <div class="cop-label">Action scores</div>
  <div class="cop-scores-table"></div>
</div>
<div class="cop-section">
  <div class="cop-label">Confidence (learned data)</div>
  <div class="cop-conf-bar"><div class="cop-conf-fill"></div></div>
  <span class="cop-conf-pct">0%</span>
</div>
<div class="cop-section">
  <div class="cop-label">Session</div>
  <div>Score: <b class="cop-score">0</b> &nbsp; Moves: <b class="cop-moves">0</b></div>
  <div>Max tile: <b class="cop-max">0</b> &nbsp; Phase: <b class="cop-phase">early</b></div>
</div>
<div class="cop-section">
  <div class="cop-label">Last 5 games</div>
  <div class="cop-history"></div>
</div>
<div class="cop-section">
  <button class="cop-reset-btn">Reset Learning</button>
</div>
<div class="cop-banner" style="display:none"></div>
`;

const OVERLAY_CSS = `
#copilot-overlay {
  position: fixed;
  top: 20px;
  right: 20px;
  width: 230px;
  background: rgba(30,30,30,0.96);
  color: #f0f0f0;
  border-radius: 10px;
  padding: 12px;
  font-family: monospace;
  font-size: 12px;
  z-index: 9999;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  user-select: none;
}
#copilot-overlay .cop-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 10px;
  color: #f5d76e;
}
#copilot-overlay .cop-close-btn {
  background: none;
  border: none;
  color: #aaa;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 0;
}
#copilot-overlay .cop-section {
  border-top: 1px solid #444;
  padding: 8px 0;
}
#copilot-overlay .cop-label {
  color: #888;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}
#copilot-overlay .cop-modes {
  display: flex;
  gap: 4px;
}
#copilot-overlay .cop-modes button {
  flex: 1;
  background: #444;
  color: #ccc;
  border: none;
  border-radius: 4px;
  padding: 4px 0;
  cursor: pointer;
  font-size: 11px;
  font-family: monospace;
}
#copilot-overlay .cop-modes button.active {
  background: #f5d76e;
  color: #222;
  font-weight: bold;
}
#copilot-overlay .cop-suggestion {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 4px 0;
}
#copilot-overlay .cop-arrow {
  font-size: 36px;
  line-height: 1;
  color: #f5d76e;
}
#copilot-overlay .cop-action-name {
  font-size: 14px;
  font-weight: bold;
}
#copilot-overlay .cop-assist-hint {
  color: #7ec8e3;
  font-size: 11px;
  margin-top: 4px;
}
#copilot-overlay .cop-conf-bar {
  background: #444;
  border-radius: 4px;
  height: 8px;
  margin: 4px 0;
  overflow: hidden;
}
#copilot-overlay .cop-conf-fill {
  background: #4caf50;
  height: 100%;
  width: 0%;
  transition: width 0.3s ease;
  border-radius: 4px;
}
#copilot-overlay .cop-scores-table {
  font-size: 11px;
  line-height: 1.6;
}
#copilot-overlay .cop-score-row { color: #aaa; }
#copilot-overlay .cop-score-row.best { color: #f5d76e; font-weight: bold; }
#copilot-overlay .cop-hist-row {
  color: #aaa;
  line-height: 1.7;
  font-size: 11px;
}
#copilot-overlay .cop-reset-btn {
  background: #c0392b;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 11px;
  font-family: monospace;
  width: 100%;
}
#copilot-overlay .cop-banner {
  background: #c0392b;
  color: #fff;
  border-radius: 4px;
  padding: 6px;
  margin-top: 8px;
  text-align: center;
  font-size: 11px;
}
`;
