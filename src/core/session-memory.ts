/**
 * session-memory.ts
 *
 * Tracks all moves within a single game session.
 * Persists session summaries to localStorage for long-term analysis.
 */

import { type GameState } from './state-extractor.js';
import { type Action } from './action-catalog.js';
import { type RewardBreakdown } from './reward-model.js';
import { CONFIG } from '../config.js';

export interface MoveRecord {
  moveIndex:  number;
  action:     Action;
  scoreBefore:number;
  scoreAfter: number;
  reward:     number;
  maxTile:    number;
  phase:      string;
  ts:         number;
}

export interface SessionSummary {
  id:          string;
  startTs:     number;
  endTs:       number;
  finalScore:  number;
  maxTile:     number;
  moveCount:   number;
  won:         boolean;
  avgReward:   number;
  moves:       MoveRecord[];
}

export class SessionMemory {
  private sessionId:  string;
  private startTs:    number;
  private moves:      MoveRecord[] = [];
  private lastState:  GameState | null = null;

  constructor() {
    this.sessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.startTs   = Date.now();
  }

  recordMove(
    before:     GameState,
    action:     Action,
    after:      GameState,
    reward:     RewardBreakdown,
  ): void {
    this.moves.push({
      moveIndex:   before.moveCount,
      action,
      scoreBefore: before.score,
      scoreAfter:  after.score,
      reward:      reward.total,
      maxTile:     after.maxTile,
      phase:       before.phase,
      ts:          Date.now(),
    });
    this.lastState = after;
  }

  endSession(finalState: GameState): SessionSummary {
    const rewards = this.moves.map(m => m.reward);
    const avgReward = rewards.length
      ? rewards.reduce((a, b) => a + b, 0) / rewards.length
      : 0;

    const summary: SessionSummary = {
      id:         this.sessionId,
      startTs:    this.startTs,
      endTs:      Date.now(),
      finalScore: finalState.score,
      maxTile:    finalState.maxTile,
      moveCount:  this.moves.length,
      won:        finalState.gameWon,
      avgReward,
      moves:      this.moves,
    };

    this.persistSummary(summary);
    return summary;
  }

  getLastState(): GameState | null {
    return this.lastState;
  }

  getMoves(): MoveRecord[] {
    return this.moves;
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  private persistSummary(summary: SessionSummary): void {
    try {
      const key      = CONFIG.storageKeys.sessions;
      const raw      = localStorage.getItem(key);
      const sessions: SessionSummary[] = raw ? JSON.parse(raw) : [];

      // Keep only the last N sessions (evict oldest)
      sessions.push(summary);
      if (sessions.length > CONFIG.maxStoredSessions) {
        sessions.splice(0, sessions.length - CONFIG.maxStoredSessions);
      }

      localStorage.setItem(key, JSON.stringify(sessions));
    } catch {
      // localStorage may be unavailable; silently skip
    }
  }

  static loadHistory(): SessionSummary[] {
    try {
      const raw = localStorage.getItem(CONFIG.storageKeys.sessions);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /** Average final score across all stored sessions. */
  static averageScore(): number {
    const history = SessionMemory.loadHistory();
    if (!history.length) return 0;
    return history.reduce((s, h) => s + h.finalScore, 0) / history.length;
  }
}
