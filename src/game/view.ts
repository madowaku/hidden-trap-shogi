// =============================================
// Pitfall Shogi — Player-Specific Game Views
// =============================================

import type { GameState, GameView, LogEntry, MatchStats, PublicLogEntry, RoomPresence, Viewer } from './types';
import { getVisiblePitfalls } from './pitfall';
import { posEquals } from './board';

export function getPlayerView(
  state: GameState,
  viewer: Viewer,
  roomPresence?: RoomPresence
): GameView {
  return {
    viewer,
    board: state.board,
    currentPlayer: state.currentPlayer,
    turn: state.turn,
    phase: state.phase,
    visiblePitfalls: getVisiblePitfalls(state, viewer),
    hands: state.hands,
    log: getPublicLog(state, viewer),
    // C の指し直し中の罠は発動済みで公開情報
    ...(state.checkRetry ? { checkRetry: state.checkRetry } : {}),
    config: state.config,
    winner: state.winner,
    roomPresence,
    matchStats: buildMatchStats(state, viewer),
  };
}

/**
 * viewer に見せてよいログだけを返す。
 *
 * 各ログの pitfallSet は「そのプレイヤーが次の相手手番のために置いた罠」。
 * - 自分の罠: 自分は知っているのでそのまま
 * - 相手の罠: 次の自分の手番で発動・公開された（triggeredPitfall / revealedPitfall）時だけ残す。
 *   相手の最新ログの罠は「今まさに自分を狙っている未公開の罠」なので必ず消す。
 *   Strict（不発罠を隠す）で不発だった罠は、終局まで公開されない。
 * - 観戦者: 両者とも「相手の罠」と同じ扱い
 * - 終局後: 罠履歴レビューのため全て公開する
 */
export function getPublicLog(
  state: Pick<GameState, 'log' | 'phase'>,
  viewer: Viewer
): PublicLogEntry[] {
  if (state.phase.type === 'GAME_OVER') return state.log;

  return state.log.map((entry, index) => {
    if (entry.player === viewer) return entry;
    if (isRevealedLater(state.log, index)) return entry;
    return withoutPitfallSet(entry);
  });
}

function isRevealedLater(log: readonly LogEntry[], index: number): boolean {
  const entry = log[index];
  // この罠が効くのは、次の相手（＝罠を置いた側の相手）の手番だけ
  const answer = log.slice(index + 1).find(next => next.player !== entry.player);
  if (!answer) return false;
  const known = answer.triggeredPitfall ?? answer.revealedPitfall;
  return known !== undefined && posEquals(known, entry.pitfallSet);
}

function withoutPitfallSet(entry: LogEntry): PublicLogEntry {
  const { pitfallSet: _hidden, ...rest } = entry;
  void _hidden;
  return rest;
}

export function buildMatchStats(state: Pick<GameState, 'log'>, viewer: Viewer): MatchStats {
  if (viewer === 'spectator') {
    const trapsSet = state.log.length;
    const trapsTriggered = state.log.filter((entry) => entry.pitfallTriggered).length;
    return {
      trapsSet,
      trapsTriggeredByMe: trapsTriggered,
      trapsITriggered: trapsTriggered,
      trapHitRate: trapsSet > 0 ? Math.round((trapsTriggered / trapsSet) * 100) : 0,
    };
  }

  const trapsSet = state.log.filter((entry) => entry.player === viewer).length;
  const trapsITriggered = state.log.filter((entry) => (
    entry.player === viewer && entry.pitfallTriggered
  )).length;
  const trapsTriggeredByMe = state.log.filter((entry) => (
    entry.player !== viewer && entry.pitfallTriggered
  )).length;

  return {
    trapsSet,
    trapsTriggeredByMe,
    trapsITriggered,
    trapHitRate: trapsSet > 0 ? Math.round((trapsTriggeredByMe / trapsSet) * 100) : 0,
  };
}
