// =============================================
// Pitfall Shogi — Actions & Reducer
// =============================================

import type {
  GameState,
  Position,
  GameAction,
  MoveAction,
  LogEntry,
  Player,
  PieceKind,
  BotLevel,
} from './types';
import {
  applyMove,
  applyDrop,
  getOpponent,
  getUnpromotedKind,
  canPromote,
  getLegalDrops,
  isInBounds,
  isKingSquare,
  mustPromote,
} from './board';
import { checkPitfall, isRepeatPitfallPosition } from './pitfall';
import { createInitialGameState } from './constants';
import { getRuleProfile } from './rules';

// --- Action Types ---

export type Action =
  | { type: 'PLACE_PITFALL'; position: Position }
  | { type: 'EXECUTE_MOVE'; action: GameAction }
  | { type: 'DECIDE_PROMOTION'; promote: boolean }
  | { type: 'ACKNOWLEDGE_PASS_DEVICE' }
  | { type: 'RESIGN' }
  | { type: 'RESET_GAME'; gameMode?: 'pvp' | 'pvbot'; casualMode?: boolean; botLevel?: BotLevel }
  ;

// --- Reducer ---

export function gameReducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'PLACE_PITFALL':
      return handlePlacePitfall(state, action.position);

    case 'EXECUTE_MOVE':
      return handleExecuteMove(state, action.action);

    case 'DECIDE_PROMOTION':
      return handleDecidePromotion(state, action.promote);

    case 'ACKNOWLEDGE_PASS_DEVICE':
      return handleAcknowledgePassDevice(state);

    case 'RESIGN':
      return handleResign(state);

    case 'RESET_GAME':
      return resetGame(action.gameMode, action.casualMode, action.botLevel);

    default:
      return state;
  }
}

// --- Phase Handlers ---

function handlePlacePitfall(state: GameState, position: Position): GameState {
  if (state.phase.type !== 'PITFALL_PLACEMENT') return state;
  if (!isInBounds(position.row, position.col)) return state;
  if (isKingSquare(state.board, position)) return state;
  if (isRepeatPitfallPosition(state, state.currentPlayer, position)) return state;

  return {
    ...state,
    pendingPitfall: {
      position,
      owner: state.currentPlayer,
    },
    phase: { type: 'MOVE_SELECTION' },
  };
}

function handleResign(state: GameState): GameState {
  if (state.phase.type === 'GAME_OVER') return state;
  const winner = getOpponent(state.currentPlayer);
  return {
    ...state,
    phase: { type: 'GAME_OVER', winner },
    winner,
  };
}

function handleExecuteMove(state: GameState, action: GameAction): GameState {
  if (state.phase.type !== 'MOVE_SELECTION') return state;
  if (action.type === 'move' && !isValidMoveAction(state, action)) return state;
  if (action.type === 'drop' && !isValidDropAction(state, action)) return state;

  if (action.type === 'move' && isKingSquare(state.board, action.to)) {
    return executeAndFinalize(state, action);
  }

  // 落とし穴判定
  const pitfallTriggered = checkPitfall(state, action);

  if (pitfallTriggered) {
    // 手を無効化: 盤面変更なし、手番消費
    return finalizeTurn(state, null, true, action);
  }

  // 移動の場合、成り判定
  if (action.type === 'move') {
    const move = action as MoveAction;

    // 強制成り
    if (mustPromote(move.piece, move.to)) {
      const promotedMove: MoveAction = { ...move, promote: true };
      return executeAndFinalize(state, promotedMove);
    }

    if (move.promote !== undefined && canPromote(move.piece, move.from, move.to)) {
      return executeAndFinalize(state, move);
    }

    // 任意成り可能？
    if (canPromote(move.piece, move.from, move.to)) {
      return {
        ...state,
        phase: { type: 'PROMOTION_DECISION', move },
      };
    }
  }

  // 通常実行
  return executeAndFinalize(state, action);
}

function handleDecidePromotion(state: GameState, promote: boolean): GameState {
  if (state.phase.type !== 'PROMOTION_DECISION') return state;

  const move = state.phase.move;
  const finalMove: MoveAction = { ...move, promote };
  return executeAndFinalize(state, finalMove);
}

function handleAcknowledgePassDevice(state: GameState): GameState {
  if (state.phase.type !== 'PASS_DEVICE') return state;

  return {
    ...state,
    phase: { type: 'PITFALL_PLACEMENT' },
  };
}

// --- 実行ヘルパー ---

function executeAndFinalize(state: GameState, action: GameAction): GameState {
  let newBoard = state.board;
  let newHands = { ...state.hands };
  let winner: Player | null = null;

  if (action.type === 'move') {
    const move = action as MoveAction;

    // 捕獲処理
    const captured = state.board[move.to.row][move.to.col];
    if (captured) {
      // 王を取ったら勝利
      if (captured.kind === 'king') {
        winner = state.currentPlayer;
      }

      // 持ち駒に追加（成り駒は元に戻す）
      const capturedKind = getUnpromotedKind(captured.kind);
      if (capturedKind !== 'king') {
        const playerHand = { ...newHands[state.currentPlayer] };
        playerHand[capturedKind as Exclude<PieceKind, 'king'>] += 1;
        newHands = {
          ...newHands,
          [state.currentPlayer]: playerHand,
        };
      }

      // action に captured を記録
      action = { ...move, captured };
    }

    newBoard = applyMove(state.board, { ...move, promote: action.promote } as MoveAction);
  } else {
    // 打ち込み
    newBoard = applyDrop(state.board, action);

    // 持ち駒を減らす
    const dropKind = action.piece.kind as Exclude<PieceKind, 'king'>;
    const playerHand = { ...newHands[state.currentPlayer] };
    playerHand[dropKind] -= 1;
    newHands = {
      ...newHands,
      [state.currentPlayer]: playerHand,
    };
  }

  const newState: GameState = {
    ...state,
    board: newBoard,
    hands: newHands,
  };

  if (winner) {
    return finalizeTurnWithWinner(newState, action, winner);
  }

  return finalizeTurn(newState, action, false);
}

function isValidMoveAction(state: GameState, action: MoveAction): boolean {
  if (!isInBounds(action.from.row, action.from.col)) return false;
  if (!isInBounds(action.to.row, action.to.col)) return false;

  const source = state.board[action.from.row][action.from.col];
  const target = state.board[action.to.row][action.to.col];
  if (!source || source.owner !== state.currentPlayer) return false;
  if (source.kind !== action.piece.kind || source.owner !== action.piece.owner) return false;
  if (target?.owner === state.currentPlayer) return false;
  return true;
}

function isValidDropAction(state: GameState, action: Extract<GameAction, { type: 'drop' }>): boolean {
  if (!isInBounds(action.to.row, action.to.col)) return false;
  if (state.board[action.to.row][action.to.col] !== null) return false;
  if (action.piece.owner !== state.currentPlayer) return false;
  if (action.piece.kind === 'king' || action.piece.kind.startsWith('promoted_')) return false;

  const dropKind = action.piece.kind as Exclude<PieceKind, 'king'>;
  const playerHand = state.hands[state.currentPlayer];
  if (playerHand[dropKind] <= 0) return false;

  return getLegalDrops(state.board, state.currentPlayer, dropKind).some(
    (drop) => drop.row === action.to.row && drop.col === action.to.col
  );
}

function finalizeTurn(
  state: GameState,
  action: GameAction | null,
  pitfallTriggered: boolean,
  failedAction?: GameAction
): GameState {
  const opponent = getOpponent(state.currentPlayer);
  const ruleProfile = getRuleProfile(state.config.casualMode);

  // ログエントリ作成
  const logEntry: LogEntry = {
    turn: state.turn,
    player: state.currentPlayer,
    action,
    pitfallSet: state.pendingPitfall!.position,
    pitfallTriggered,
    failedAction,
    triggeredPitfall: pitfallTriggered
      ? state.pitfalls[opponent]?.position ?? undefined
      : undefined,
    revealedPitfall: ruleProfile.revealMissedPitfalls
      ? state.pitfalls[opponent]?.position ?? undefined
      : undefined,
  };

  // 落とし穴更新:
  // - 相手が前ターンに設置した落とし穴（現プレイヤーに対して有効だったもの）を消去
  // - 現プレイヤーが設置した落とし穴を、次の相手ターン用として保存
  const newPitfalls = {
    ...state.pitfalls,
    [opponent]: null, // 相手の落とし穴を消去
    [state.currentPlayer]: state.pendingPitfall, // 自分の落とし穴を有効化
  };
  const lastPitfallPositionByPlayer = {
    ...state.lastPitfallPositionByPlayer,
    [state.currentPlayer]: state.pendingPitfall!.position,
  };

  // PvPなら PASS_DEVICE、PvBotならそのまま PITFALL_PLACEMENT
  const nextPhase = state.config.gameMode === 'pvp'
    ? { type: 'PASS_DEVICE' as const }
    : { type: 'PITFALL_PLACEMENT' as const };

  return {
    ...state,
    currentPlayer: opponent,
    turn: state.turn + 1,
    phase: nextPhase,
    pitfalls: newPitfalls as GameState['pitfalls'],
    pendingPitfall: null,
    lastPitfallPositionByPlayer,
    log: [...state.log, logEntry],
  };
}

function finalizeTurnWithWinner(
  state: GameState,
  action: GameAction,
  winner: Player
): GameState {
  const opponent = getOpponent(state.currentPlayer);
  const ruleProfile = getRuleProfile(state.config.casualMode);

  const logEntry: LogEntry = {
    turn: state.turn,
    player: state.currentPlayer,
    action,
    pitfallSet: state.pendingPitfall!.position,
    pitfallTriggered: false,
    revealedPitfall: ruleProfile.revealMissedPitfalls
      ? state.pitfalls[opponent]?.position ?? undefined
      : undefined,
  };

  return {
    ...state,
    phase: { type: 'GAME_OVER', winner },
    lastPitfallPositionByPlayer: {
      ...state.lastPitfallPositionByPlayer,
      [state.currentPlayer]: state.pendingPitfall!.position,
    },
    log: [...state.log, logEntry],
    winner,
  };
}

function resetGame(
  gameMode: 'pvp' | 'pvbot' = 'pvp',
  casualMode: boolean = true,
  botLevel: BotLevel = 'normal'
): GameState {
  return createInitialGameState(gameMode, casualMode, 'gote', botLevel);
}
