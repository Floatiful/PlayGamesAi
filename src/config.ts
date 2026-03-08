export type Mode = 'dry-run' | 'assist' | 'auto';
export type Phase = 'early' | 'mid' | 'late';

export const CONFIG = {
  /** Starting mode. Can be toggled from the overlay UI. */
  mode: 'assist' as Mode,

  /** Milliseconds between moves in AUTO mode. */
  autoDelayMs: 400,

  /** Expectimax search depth (4 = fast enough for real-time). */
  expectimaxDepth: 4,

  /** Enable learning weight updates after each move. */
  learningEnabled: true,

  /** SARSA-style learning rate for weight updates. */
  learningRate: 0.01,

  /** Multiply all learned weights by this factor every decayIntervalGames. */
  decayFactor: 0.95,

  /** Apply weight decay every N completed game sessions. */
  decayIntervalGames: 10,

  /**
   * Minimum number of observed samples for an action in a phase before we
   * trust learned weights (below this → pure heuristic, bias weight = 0).
   */
  minConfidenceSamples: 10,

  /** Maximum session records to keep in localStorage. */
  maxStoredSessions: 200,

  /** localStorage keys (versioned so resets don't corrupt old data). */
  storageKeys: {
    weights:  'copilot_weights_v1',
    sessions: 'copilot_sessions_v1',
  },

  /** Heuristic scoring weights for the Expectimax leaf evaluator. */
  heuristicWeights: {
    monotonicity: 1.0,
    smoothness:   0.1,
    emptyCells:   2.7,
    cornerBonus:  1.0,
  },

  /** Phase thresholds based on max tile on the board. */
  phaseThresholds: {
    earlyMax: 256,  // maxTile < 256  → 'early'
    midMax:   1024, // maxTile < 1024 → 'mid'
                    // else           → 'late'
  },
} as const;
