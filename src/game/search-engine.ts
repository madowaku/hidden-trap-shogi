import type { GameAction, GameView, Position } from './types';

export type SearchOptions = {
  readonly depth?: number;
  readonly maxCandidates?: number;
  readonly timeMs?: number;
};

export type EngineCandidate = {
  readonly action: GameAction;
  readonly to: Position;
  readonly shogiScore: number;
  readonly trapRisk: number;
  readonly finalScore: number;
};

export type SearchEngine = {
  analyze(view: GameView, options?: SearchOptions): readonly EngineCandidate[];
};

export function createNoopSearchEngine(): SearchEngine {
  return {
    analyze: () => [],
  };
}
