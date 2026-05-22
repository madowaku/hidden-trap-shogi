// =============================================
// Pitfall Shogi — Pitfall Logic
// =============================================

import type { GameState, Position, Player, Pitfall, GameAction } from './types';
import { posEquals } from './board';

/**
 * 落とし穴を設置する
 */
export function placePitfall(
  state: GameState,
  position: Position
): GameState {
  const pitfall: Pitfall = {
    position,
    owner: state.currentPlayer,
  };

  return {
    ...state,
    pendingPitfall: pitfall,
    phase: { type: 'MOVE_SELECTION' },
  };
}

/**
 * 現在のプレイヤーに対して有効な落とし穴を取得
 * （相手が前ターンに設置したもの）
 */
export function getActivePitfallForCurrentPlayer(state: GameState): Pitfall | null {
  const opponent = state.currentPlayer === 'sente' ? 'gote' : 'sente';
  return state.pitfalls[opponent];
}

/**
 * 手の着地点が落とし穴かどうか判定
 */
export function checkPitfall(state: GameState, action: GameAction): boolean {
  const pitfall = getActivePitfallForCurrentPlayer(state);
  if (!pitfall) return false;
  return posEquals(action.to, pitfall.position);
}

export function isRepeatPitfallPosition(
  state: Pick<GameState, 'lastPitfallPositionByPlayer'>,
  player: Player,
  position: Position
): boolean {
  const previous = state.lastPitfallPositionByPlayer[player];
  return previous ? posEquals(previous, position) : false;
}

/**
 * viewer が見える落とし穴のリストを返す
 */
export function getVisiblePitfalls(
  state: GameState,
  viewer: Player | 'spectator'
): Pitfall[] {
  const result: Pitfall[] = [];

  if (viewer === 'spectator') {
    return result;
  }

  // プレイヤーは自分が設置した落とし穴のみ見える
  const myPitfall = state.pitfalls[viewer];
  if (myPitfall) result.push(myPitfall);

  // 今ターン設置した落とし穴（自分のターン中のみ）
  if (state.pendingPitfall && state.pendingPitfall.owner === viewer) {
    result.push(state.pendingPitfall);
  }

  return result;
}
