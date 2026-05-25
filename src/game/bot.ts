// =============================================
// Pitfall Shogi — Tactical Bot AI
// =============================================

import type {
  GameState,
  Player,
  Position,
  GameAction,
  MoveAction,
  DropAction,
  BotStrategy,
  PieceKind,
  Board,
  BotLevel,
  TrapBelief,
  TrapRiskEntry,
  BotMoveDebugSummary,
  OpponentTrapTendency,
  GameView,
} from './types';
import type { EngineCandidate, SearchEngine, SearchOptions } from './search-engine';
import {
  applyDrop,
  applyMove,
  canPromote,
  getAllLegalMoves,
  getLegalDrops,
  getOpponent,
  isKingSquare,
  posEquals,
} from './board';
import { PIECE_VALUES, BOARD_SIZE } from './constants';
import { isRepeatPitfallPosition } from './pitfall';

type BotLevelProfile = {
  trapSuspicion: number;
  greediness: number;
  riskTolerance: number;
  memoryWeight: number;
};

export const BOT_LEVEL_PROFILES: Record<BotLevel, BotLevelProfile> = {
  easy: {
    trapSuspicion: 0.35,
    greediness: 1.25,
    riskTolerance: 1.35,
    memoryWeight: 0.2,
  },
  normal: {
    trapSuspicion: 0.8,
    greediness: 1,
    riskTolerance: 1,
    memoryWeight: 0.7,
  },
  hard: {
    trapSuspicion: 1.25,
    greediness: 0.85,
    riskTolerance: 0.7,
    memoryWeight: 1.25,
  },
};

/**
 * 戦術Bot実装
 *
 * まだ深い読みではなく、1手ごとの評価で「ゲームらしい」応答を作る。
 * - 王取り、駒得、成りを重視
 * - 既知の罠と明らかな取り返しを避ける
 * - 持ち駒打ちも候補に入れる
 * - 罠は相手の有力な着地点に置く
 */
export class SimpleBot implements BotStrategy {
  decidePitfall(state: GameState, player: Player, level: BotLevel = 'normal'): Position {
    const profile = BOT_LEVEL_PROFILES[level];
    const opponent = getOpponent(player);
    const opponentActions = getAllCandidateActions(state, opponent);

    if (opponentActions.length === 0) {
      // 相手に合法手がない場合、ランダムな空きマスに設置
      return randomEmptyNonKingPosition(state, player);
    }

    const scoredTargets = opponentActions
      .filter(action => !isKingSquare(state.board, action.to))
      .filter(action => !isRepeatPitfallPosition(state, player, action.to))
      .map(action => ({
        position: action.to,
        score: scorePitfallTarget(state, player, action, profile),
      }));

    if (scoredTargets.length === 0) {
      return randomEmptyNonKingPosition(state, player);
    }

    if (level === 'easy') return pickRandom(scoredTargets).position;
    if (level === 'hard') return pickBest(scoredTargets).position;
    return pickFromBest(scoredTargets).position;
  }

  decideMove(state: GameState, player: Player, level: BotLevel = 'normal'): GameAction {
    const profile = BOT_LEVEL_PROFILES[level];
    const actions = getAllCandidateActions(state, player);
    if (actions.length === 0) {
      // 合法手なし（本来はありえないが安全対策）
      throw new Error('No legal moves available for bot');
    }

    const belief = buildTrapBelief(state, player, profile);
    const scoredActions = scoreCandidateActions(state, player, actions, profile, level, belief);

    if (level === 'easy') return pickEasyMove(state, player, scoredActions).action;
    if (level === 'hard') return pickBest(scoredActions).action;
    return pickFromBest(scoredActions).action;
  }

  debugMoveCandidates(
    state: GameState,
    player: Player,
    level: BotLevel = 'normal',
    limit = 5
  ): BotMoveDebugSummary[] {
    const profile = BOT_LEVEL_PROFILES[level];
    const actions = getAllCandidateActions(state, player);
    const belief = buildTrapBelief(state, player, profile);
    return scoreCandidateActions(state, player, actions, profile, level, belief, () => 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ action, score, trapRisk, trapPenalty }) => ({
        action,
        to: action.to,
        score,
        trapRisk,
        trapPenalty,
      }));
  }

  debugSearchEngineCandidates(
    view: GameView,
    engine: SearchEngine,
    options: SearchOptions = {}
  ): readonly EngineCandidate[] {
    const limit = options.maxCandidates ?? 5;
    return engine.analyze(view, { ...options, maxCandidates: limit }).slice(0, limit);
  }

  decideMoveWithSearchEngine(
    view: GameView,
    engine: SearchEngine,
    options: SearchOptions = {}
  ): GameAction {
    const candidates = engine.analyze(view, { depth: 2, maxCandidates: 1, ...options });
    const best = candidates[0];
    if (!best) {
      throw new Error('No search engine moves available for bot');
    }
    return best.action;
  }
}

// --- ユーティリティ ---

const HAND_PIECES: Exclude<PieceKind, 'king'>[] = [
  'rook',
  'bishop',
  'gold',
  'silver',
  'knight',
  'lance',
  'pawn',
];

function getAllCandidateActions(state: GameState, player: Player): GameAction[] {
  const moves = getAllLegalMoves(state.board, player);
  const drops: DropAction[] = [];
  const hand = state.hands[player];

  for (const kind of HAND_PIECES) {
    if (hand[kind] <= 0) continue;
    for (const to of getLegalDrops(state.board, player, kind)) {
      drops.push({
        type: 'drop',
        to,
        piece: { kind, owner: player },
      });
    }
  }

  return [...moves, ...drops];
}

export function buildTrapBelief(
  state: GameState,
  botPlayer: Player,
  profile: BotLevelProfile
): TrapBelief {
  const entries = new Map<string, { position: Position; trapRisk: number; reasons: Set<string> }>();
  const tendency = buildOpponentTrapTendency(state, botPlayer);

  for (const action of getAllCandidateActions(state, botPlayer)) {
    const { trapRisk, reasons } = estimateActionTrapRisk(state, botPlayer, action, profile, tendency);
    const key = positionKey(action.to);
    const current = entries.get(key);

    if (!current || trapRisk > current.trapRisk) {
      entries.set(key, {
        position: action.to,
        trapRisk,
        reasons: new Set(reasons),
      });
      continue;
    }

    if (current && trapRisk === current.trapRisk) {
      for (const reason of reasons) current.reasons.add(reason);
    }
  }

  return {
    player: botPlayer,
    risks: [...entries.values()]
      .map((entry): TrapRiskEntry => ({
        position: entry.position,
        trapRisk: Math.round(entry.trapRisk * 100) / 100,
        reasons: [...entry.reasons].sort(),
      }))
      .sort((a, b) => (
        b.trapRisk - a.trapRisk
        || a.position.row - b.position.row
        || a.position.col - b.position.col
      )),
  };
}

export function buildOpponentTrapTendency(
  state: GameState,
  botPlayer: Player
): OpponentTrapTendency {
  const opponent = getOpponent(botPlayer);
  let observedTrapCount = 0;
  let captureSignals = 0;
  let promotionSignals = 0;
  let kingAreaSignals = 0;

  for (const entry of state.log.slice(-12)) {
    if (entry.player !== botPlayer) continue;

    const knownOpponentTrap = entry.triggeredPitfall ?? entry.revealedPitfall;
    if (!knownOpponentTrap) continue;

    observedTrapCount += 1;
    const trappedAction = entry.failedAction ?? (
      entry.action && posEquals(entry.action.to, knownOpponentTrap)
        ? entry.action
        : null
    );

    if (trappedAction) {
      const captured = trappedAction.type === 'move'
        ? trappedAction.captured ?? state.board[trappedAction.to.row]?.[trappedAction.to.col]
        : null;

      if (captured?.owner === opponent && captured.kind !== 'king') {
        captureSignals += 1;
      }

      if (
        trappedAction.type === 'move'
        && canPromote(trappedAction.piece, trappedAction.from, trappedAction.to)
      ) {
        promotionSignals += 1;
      }
    }

    if (proximityToKing(state.board, opponent, knownOpponentTrap) >= 6) {
      kingAreaSignals += 1;
    }
  }

  const denominator = Math.max(1, observedTrapCount);
  return {
    observedTrapCount,
    captureBias: captureSignals / denominator,
    promotionBias: promotionSignals / denominator,
    kingAreaBias: kingAreaSignals / denominator,
  };
}

function scoreCandidateActions(
  state: GameState,
  player: Player,
  actions: GameAction[],
  profile: BotLevelProfile,
  level: BotLevel,
  belief: TrapBelief,
  jitter = () => Math.random() * 0.25
) {
  return actions.map(action => {
    const trapRisk = getTrapRisk(belief, action.to);
    const trapPenalty = trapRisk * profile.trapSuspicion;
    return {
      action,
      trapRisk,
      trapPenalty,
      score: scoreAction(state, player, action, profile, trapPenalty, jitter())
        + levelAdjustment(state, player, action, profile, level),
    };
  });
}

function scoreAction(
  state: GameState,
  player: Player,
  action: GameAction,
  profile: BotLevelProfile,
  trapPenalty: number,
  jitter: number
): number {
  const opponent = getOpponent(player);
  let score = jitter;

  score -= trapPenalty;

  if (action.type === 'move') {
    const captured = state.board[action.to.row][action.to.col];
    if (captured?.owner === opponent) {
      score += PIECE_VALUES[captured.kind] * 120 * profile.greediness;
      if (captured.kind === 'king') score += 100000;
    }

    if (canPromote(action.piece, action.from, action.to)) {
      score += promotionBonus(action.piece.kind) * profile.greediness;
    }

    score += forwardProgress(player, action.from, action.to) * 5;
    score += centrality(action.to) * 2;
  } else {
    score += dropScore(state.board, player, action) * profile.greediness;
  }

  const nextBoard = applyActionToBoard(state.board, action);
  const movedPieceValue = PIECE_VALUES[action.piece.kind];
  if (isSquareAttacked(nextBoard, action.to, opponent)) {
    score -= (movedPieceValue * 55) / profile.riskTolerance;
  }

  score += materialPressure(nextBoard, player) * 2;
  return score;
}

function estimateActionTrapRisk(
  state: GameState,
  player: Player,
  action: GameAction,
  profile: BotLevelProfile,
  tendency: OpponentTrapTendency
): { trapRisk: number; reasons: string[] } {
  const opponent = getOpponent(player);
  const target = state.board[action.to.row][action.to.col];
  let trapRisk = 0;
  const reasons: string[] = [];

  // The active opponent trap is hidden. This estimates "too tempting" squares
  // from public board pressure and previously revealed trap outcomes only.
  if (target?.owner === opponent && target.kind !== 'king') {
    trapRisk += PIECE_VALUES[target.kind] * 24;
    if (tendency.captureBias > 0) {
      trapRisk += 52 * tendency.captureBias * profile.memoryWeight;
      reasons.push('learned_capture');
    }
    reasons.push('capture');
  }

  if (action.type === 'move' && canPromote(action.piece, action.from, action.to)) {
    trapRisk += promotionBonus(action.piece.kind) * 0.9;
    if (tendency.promotionBias > 0) {
      trapRisk += 42 * tendency.promotionBias * profile.memoryWeight;
      reasons.push('learned_promotion');
    }
    reasons.push('promotion');
  }

  if (action.type === 'drop') {
    trapRisk += dropScore(state.board, player, action) * 0.25;
    reasons.push('drop');
  }

  const memoryRisk = publicOpponentTrapPatternRisk(state, player, action.to) * profile.memoryWeight;
  if (memoryRisk > 0) {
    trapRisk += memoryRisk;
    reasons.push('memory');
  }

  if (tendency.kingAreaBias > 0 && proximityToKing(state.board, opponent, action.to) >= 6) {
    trapRisk += 44 * tendency.kingAreaBias * profile.memoryWeight;
    reasons.push('learned_king_area');
  }

  return { trapRisk, reasons };
}

function publicOpponentTrapPatternRisk(
  state: GameState,
  player: Player,
  position: Position
): number {
  let risk = 0;
  const recentLogs = state.log.slice(-8);

  for (let index = 0; index < recentLogs.length; index++) {
    const entry = recentLogs[index];
    if (entry.player !== player) continue;

    const knownOpponentTrap = entry.triggeredPitfall ?? entry.revealedPitfall;
    if (!knownOpponentTrap) continue;

    const recency = index + 1;
    const distance = manhattan(position, knownOpponentTrap);
    risk += Math.max(0, 34 + recency * 2 - distance * 8);
  }

  return Math.min(risk, 160);
}

function levelAdjustment(
  state: GameState,
  player: Player,
  action: GameAction,
  profile: BotLevelProfile,
  level: BotLevel
): number {
  if (level !== 'hard') return 0;

  const nextBoard = applyActionToBoard(state.board, action);
  const opponent = getOpponent(player);
  const myKing = findKing(nextBoard, player);
  const opponentKing = findKing(nextBoard, opponent);
  let score = 0;

  if (myKing && isSquareAttacked(nextBoard, myKing, opponent)) {
    score -= 1800 / profile.riskTolerance;
  }
  if (opponentKing && isSquareAttacked(nextBoard, opponentKing, player)) {
    score += 450 * profile.greediness;
  }
  return score;
}

function scorePitfallTarget(
  state: GameState,
  player: Player,
  opponentAction: GameAction,
  profile: BotLevelProfile
): number {
  const opponent = getOpponent(player);
  let score = Math.random() * 0.25;
  const target = state.board[opponentAction.to.row][opponentAction.to.col];

  if (target?.owner === player) {
    score += PIECE_VALUES[target.kind] * 100 * profile.trapSuspicion;
    if (target.kind === 'king') score += 100000;
  }

  if (opponentAction.type === 'move') {
    if (canPromote(opponentAction.piece, opponentAction.from, opponentAction.to)) {
      score += promotionBonus(opponentAction.piece.kind) * 0.8 * profile.trapSuspicion;
    }
    score += forwardProgress(opponent, opponentAction.from, opponentAction.to) * 4;
  } else {
    score += dropScore(state.board, opponent, opponentAction) * 0.7 * profile.trapSuspicion;
  }

  score += centrality(opponentAction.to) * 5;
  score += proximityToKing(state.board, player, opponentAction.to) * 10;
  return score;
}

function applyActionToBoard(board: Board, action: GameAction): Board {
  if (action.type === 'move') {
    return applyMove(board, action as MoveAction);
  }
  return applyDrop(board, action);
}

function isSquareAttacked(board: Board, position: Position, attacker: Player): boolean {
  return getAllLegalMoves(board, attacker).some(move => posEquals(move.to, position));
}

function materialPressure(board: Board, player: Player): number {
  const opponent = getOpponent(player);
  const myAttacks = getAllLegalMoves(board, player);
  const theirAttacks = getAllLegalMoves(board, opponent);

  return (
    attackedPieceValue(board, myAttacks, opponent) -
    attackedPieceValue(board, theirAttacks, player)
  );
}

function attackedPieceValue(board: Board, moves: MoveAction[], victim: Player): number {
  let value = 0;
  const seen = new Set<string>();

  for (const move of moves) {
    const target = board[move.to.row][move.to.col];
    if (!target || target.owner !== victim) continue;
    const key = `${move.to.row}:${move.to.col}`;
    if (seen.has(key)) continue;
    seen.add(key);
    value += PIECE_VALUES[target.kind];
  }

  return value;
}

function dropScore(board: Board, player: Player, action: DropAction): number {
  let score = PIECE_VALUES[action.piece.kind] * 8;
  score += centrality(action.to) * 3;
  score += proximityToKing(board, getOpponent(player), action.to) * 8;

  if (action.piece.kind === 'pawn') score += 8;
  if (action.piece.kind === 'gold' || action.piece.kind === 'silver') score += 12;
  return score;
}

function promotionBonus(kind: MoveAction['piece']['kind']): number {
  if (kind === 'rook' || kind === 'bishop') return 90;
  if (kind === 'pawn' || kind === 'lance' || kind === 'knight' || kind === 'silver') return 45;
  return 0;
}

function forwardProgress(player: Player, from: Position, to: Position): number {
  return player === 'sente'
    ? from.row - to.row
    : to.row - from.row;
}

function centrality(position: Position): number {
  return 8 - (Math.abs(4 - position.row) + Math.abs(4 - position.col));
}

function manhattan(a: Position, b: Position): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function positionKey(position: Position): string {
  return `${position.row}:${position.col}`;
}

function getTrapRisk(belief: TrapBelief, position: Position): number {
  return belief.risks.find(entry => posEquals(entry.position, position))?.trapRisk ?? 0;
}

function proximityToKing(board: Board, kingOwner: Player, position: Position): number {
  const king = findKing(board, kingOwner);
  if (!king) return 0;
  const distance = Math.abs(king.row - position.row) + Math.abs(king.col - position.col);
  return Math.max(0, 8 - distance);
}

function findKing(board: Board, owner: Player): Position | null {
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = board[row][col];
      if (piece?.owner === owner && piece.kind === 'king') {
        return { row, col };
      }
    }
  }
  return null;
}

function pickFromBest<T>(scored: Array<T & { score: number }>): T {
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const bestScore = sorted[0].score;
  const contenders = sorted.filter(item => bestScore - item.score <= 8);
  return pickRandom(contenders);
}

function pickEasyMove<T extends { action: GameAction; score: number }>(
  state: GameState,
  player: Player,
  scored: T[]
): T {
  const kingCapture = scored.find(item => isDirectKingCapture(state, player, item.action));
  if (kingCapture) return kingCapture;

  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const poolSize = Math.max(1, Math.ceil(sorted.length * 0.6));
  return pickRandom(sorted.slice(0, poolSize));
}

function pickBest<T>(scored: Array<T & { score: number }>): T {
  return [...scored].sort((a, b) => b.score - a.score)[0];
}

function isDirectKingCapture(state: GameState, player: Player, action: GameAction): boolean {
  if (action.type !== 'move') return false;
  const opponent = getOpponent(player);
  const target = state.board[action.to.row][action.to.col];
  return target?.owner === opponent && target.kind === 'king';
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomEmptyNonKingPosition(state: GameState, player: Player): Position {
  const empty: Position[] = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const position = { row, col };
      if (
        !state.board[row][col]
        && !isKingSquare(state.board, position)
        && !isRepeatPitfallPosition(state, player, position)
      ) {
        empty.push(position);
      }
    }
  }
  return empty.length > 0
    ? pickRandom(empty)
    : { row: 4, col: 4 }; // フォールバック
}

/** Botのシングルトンインスタンス */
export const simpleBot = new SimpleBot();
