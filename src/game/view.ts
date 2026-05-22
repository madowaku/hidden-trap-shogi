// =============================================
// Pitfall Shogi — Player-Specific Game Views
// =============================================

import type { GameState, GameView, MatchStats, RoomPresence, Viewer } from './types';
import { getVisiblePitfalls } from './pitfall';

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
    log: state.log,
    config: state.config,
    winner: state.winner,
    roomPresence,
    matchStats: buildMatchStats(state, viewer),
  };
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
