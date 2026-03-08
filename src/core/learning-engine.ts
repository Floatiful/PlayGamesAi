/**
 * learning-engine.ts
 *
 * Adaptive learning layer.
 *
 * Architecture:
 *   - Per-phase action biases (additive offset added to Expectimax score)
 *   - SARSA-style update: bias[phase][action] += lr * (reward - avgReward)
 *   - avgReward = exponential moving average (baseline)
 *   - Confidence = min(sampleCounts) / minConfidenceSamples (capped at 1)
 *   - Decay: multiply all biases by decayFactor every N games
 *   - Reset: zero all weights (recovers from bad learning)
 *
 * Separation of concerns:
 *   - Hard rules  → action-catalog.ts / strategy-engine.ts constants
 *   - Heuristics  → strategy-engine.ts heuristic weights (not mutated here)
 *   - Learned     → this file, persisted in localStorage
 */

import { ACTIONS, type Action } from './action-catalog.js';
import { type Phase } from '../config.js';
import { CONFIG } from '../config.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PhaseWeights {
  actionBias:    Record<Action, number>;
  sampleCounts:  Record<Action, number>;
  avgReward:     number;  // running EMA baseline
}

export interface WeightStore {
  early: PhaseWeights;
  mid:   PhaseWeights;
  late:  PhaseWeights;
  gamesCompleted: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptyPhaseWeights(): PhaseWeights {
  const actionBias   = {} as Record<Action, number>;
  const sampleCounts = {} as Record<Action, number>;
  for (const a of ACTIONS) {
    actionBias[a]   = 0;
    sampleCounts[a] = 0;
  }
  return { actionBias, sampleCounts, avgReward: 0 };
}

function emptyStore(): WeightStore {
  return {
    early: emptyPhaseWeights(),
    mid:   emptyPhaseWeights(),
    late:  emptyPhaseWeights(),
    gamesCompleted: 0,
  };
}

// ─── LearningEngine ──────────────────────────────────────────────────────────

export class LearningEngine {
  private store: WeightStore;

  constructor() {
    this.store = emptyStore();
    this.load();
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  getWeights(): WeightStore {
    return this.store;
  }

  getBias(phase: Phase, action: Action): number {
    return this.store[phase].actionBias[action] ?? 0;
  }

  /**
   * Confidence ∈ [0, 1].
   * 0 → never seen these actions; 1 → enough data to trust learned biases.
   */
  getConfidence(phase: Phase): number {
    const pw = this.store[phase];
    const minCount = Math.min(...ACTIONS.map(a => pw.sampleCounts[a]));
    return Math.min(1, minCount / CONFIG.minConfidenceSamples);
  }

  /**
   * Update learned weight for (phase, action) given the observed reward.
   * Uses SARSA-style update with EMA baseline.
   */
  recordOutcome(phase: Phase, action: Action, reward: number): void {
    if (!CONFIG.learningEnabled) return;

    const pw = this.store[phase];
    const lr = CONFIG.learningRate;
    const ema = 0.05; // EMA decay for avgReward baseline

    // Update baseline
    pw.avgReward = pw.avgReward * (1 - ema) + reward * ema;

    // Update bias
    pw.actionBias[action] += lr * (reward - pw.avgReward);
    pw.sampleCounts[action]++;

    this.persist();
  }

  /** Called after each completed game session to apply weight decay. */
  onGameComplete(): void {
    this.store.gamesCompleted++;

    if (this.store.gamesCompleted % CONFIG.decayIntervalGames === 0) {
      this.decayWeights();
    }

    this.persist();
  }

  /** Multiply all action biases by decayFactor (prevents stale overfit). */
  decayWeights(): void {
    const phases: Phase[] = ['early', 'mid', 'late'];
    for (const phase of phases) {
      for (const action of ACTIONS) {
        this.store[phase].actionBias[action] *= CONFIG.decayFactor;
      }
    }
  }

  /** Reset weights for a specific phase, or all phases if not specified. */
  reset(phase?: Phase): void {
    if (phase) {
      this.store[phase] = emptyPhaseWeights();
    } else {
      this.store = emptyStore();
    }
    this.persist();
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  persist(): void {
    try {
      localStorage.setItem(CONFIG.storageKeys.weights, JSON.stringify(this.store));
    } catch {
      // localStorage unavailable — continue without persisting
    }
  }

  load(): void {
    try {
      const raw = localStorage.getItem(CONFIG.storageKeys.weights);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<WeightStore>;
      // Merge with empty store so new action keys are always present
      const phases: Phase[] = ['early', 'mid', 'late'];
      for (const phase of phases) {
        if (parsed[phase]) {
          const pw = parsed[phase] as PhaseWeights;
          for (const a of ACTIONS) {
            this.store[phase].actionBias[a]   = pw.actionBias?.[a]   ?? 0;
            this.store[phase].sampleCounts[a] = pw.sampleCounts?.[a] ?? 0;
          }
          this.store[phase].avgReward = pw.avgReward ?? 0;
        }
      }
      this.store.gamesCompleted = parsed.gamesCompleted ?? 0;
    } catch {
      // Corrupt data — start fresh
      this.store = emptyStore();
    }
  }

  /** Return a human-readable summary for the overlay. */
  summary(): string {
    const phases: Phase[] = ['early', 'mid', 'late'];
    return phases.map(ph => {
      const conf = (this.getConfidence(ph) * 100).toFixed(0);
      const biases = ACTIONS
        .map(a => `${a}:${this.store[ph].actionBias[a].toFixed(2)}`)
        .join(' ');
      return `${ph}(conf=${conf}%) ${biases}`;
    }).join('\n');
  }
}
