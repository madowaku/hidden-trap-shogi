// =============================================
// Pitfall Shogi — Local Mock Room Server
// =============================================

import type { ClientCommand, ServerEvent } from '../server/contract';
import type { GameState, Player, RoomPresence, Viewer } from './types';
import { createInitialGameState } from './constants';
import { gameReducer } from './reducer';
import { getOpponent } from './board';
import { getPlayerView } from './view';

export type PlayerId = string;

export type RoomState = {
  readonly roomId: string;
  readonly players: Partial<Record<Player, PlayerId>>;
  readonly spectators: readonly PlayerId[];
  readonly gameState: GameState;
  readonly revision: number;
  readonly lastClientSeqByPlayerId: Partial<Record<PlayerId, number>>;
  readonly rematchRequests: readonly Player[];
  readonly createdAt: number;
  readonly updatedAt: number;
};

export type RoomCommandResult = {
  readonly room: RoomState;
  readonly eventsByPlayerId: Record<PlayerId, ServerEvent[]>;
};

export function createRoom(roomId = `room-${Date.now()}`, now = Date.now()): RoomState {
  return {
    roomId,
    players: {},
    spectators: [],
    gameState: createInitialGameState('pvp', false),
    revision: 0,
    lastClientSeqByPlayerId: {},
    rematchRequests: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function joinRoom(
  room: RoomState,
  playerId: PlayerId,
  now = Date.now(),
  clientSeq?: number
): RoomCommandResult {
  const activeRoom = normalizeOnlineRoom(room, now);

  if (isStaleCommand(activeRoom, playerId, clientSeq)) {
    return invalidResult(activeRoom, playerId, 'joinRoom', 'stale clientSeq', clientSeq);
  }

  const existingPlayer = getPlayerForId(activeRoom, playerId);
  if (existingPlayer) {
    return {
      room: activeRoom,
      eventsByPlayerId: {
        [playerId]: [roomJoinedEvent(activeRoom, existingPlayer, clientSeq)],
      },
    };
  }

  const player = !activeRoom.players.sente ? 'sente' : !activeRoom.players.gote ? 'gote' : null;
  if (!player) {
    if (activeRoom.spectators.includes(playerId)) {
      return {
        room: activeRoom,
        eventsByPlayerId: {
          [playerId]: [roomJoinedEvent(activeRoom, 'spectator', clientSeq)],
        },
      };
    }

    const nextRoom: RoomState = {
      ...activeRoom,
      spectators: [...activeRoom.spectators, playerId],
      revision: activeRoom.revision + 1,
      lastClientSeqByPlayerId: rememberClientSeq(activeRoom, playerId, clientSeq),
      updatedAt: now,
    };

    return {
      room: nextRoom,
      eventsByPlayerId: {
        [playerId]: [roomJoinedEvent(nextRoom, 'spectator', clientSeq)],
        ...mapExistingParticipants(nextRoom, playerId, () => presenceUpdatedEvent(nextRoom, clientSeq)),
      },
    };
  }

  const nextRoom: RoomState = {
    ...activeRoom,
    players: {
      ...activeRoom.players,
      [player]: playerId,
    },
    revision: activeRoom.revision + 1,
    lastClientSeqByPlayerId: rememberClientSeq(activeRoom, playerId, clientSeq),
    updatedAt: now,
  };

  return {
    room: nextRoom,
    eventsByPlayerId: {
      [playerId]: [roomJoinedEvent(nextRoom, player, clientSeq)],
      ...mapExistingParticipants(nextRoom, playerId, () => presenceUpdatedEvent(nextRoom, clientSeq)),
    },
  };
}

export function handleRoomCommand(
  room: RoomState,
  playerId: PlayerId,
  command: ClientCommand,
  now = Date.now()
): RoomCommandResult {
  if (command.roomId !== room.roomId) {
    return invalidResult(room, playerId, command.type, 'command roomId does not match room', command.clientSeq);
  }

  if (command.type === 'joinRoom') {
    return joinRoom(room, playerId, now, command.clientSeq);
  }

  const activeRoom = normalizeOnlineRoom(room, now);

  const player = getPlayerForId(activeRoom, playerId);
  if (!player) {
    return invalidResult(activeRoom, playerId, command.type, 'player is not in room', command.clientSeq);
  }

  if (isStaleCommand(activeRoom, playerId, command.clientSeq)) {
    return invalidResult(activeRoom, playerId, command.type, 'stale clientSeq', command.clientSeq);
  }

  if (command.type === 'requestRematch') {
    return requestRematch(activeRoom, player, now, playerId, command.clientSeq);
  }

  if (activeRoom.gameState.phase.type === 'GAME_OVER' && (
    command.type === 'placePitfall' || command.type === 'makeMove' || command.type === 'resign'
  )) {
    return invalidResult(activeRoom, playerId, command.type, 'game is over', command.clientSeq);
  }

  if (activeRoom.gameState.currentPlayer !== player) {
    return invalidResult(activeRoom, playerId, command.type, 'not your turn', command.clientSeq);
  }

  switch (command.type) {
    case 'placePitfall':
      return reduceAndBroadcast(activeRoom, gameReducer(activeRoom.gameState, {
        type: 'PLACE_PITFALL',
        position: command.position,
      }), now, playerId, command.clientSeq, command.type);

    case 'makeMove':
      return reduceAndBroadcast(activeRoom, gameReducer(activeRoom.gameState, {
        type: 'EXECUTE_MOVE',
        action: command.action,
      }), now, playerId, command.clientSeq, command.type);

    case 'resign':
      return resign(activeRoom, player, now, playerId, command.clientSeq);
  }
}

function reduceAndBroadcast(
  room: RoomState,
  gameState: GameState,
  now: number,
  playerId: PlayerId,
  clientSeq: number | undefined,
  commandType: ClientCommand['type']
): RoomCommandResult {
  if (gameState === room.gameState) {
    return invalidResult(room, playerId, commandType, 'command did not change state', clientSeq);
  }
  const onlineGameState = skipPassDeviceForOnlineRoom(gameState);

  const nextRoom: RoomState = {
    ...room,
    gameState: onlineGameState,
    revision: room.revision + 1,
    lastClientSeqByPlayerId: rememberClientSeq(room, playerId, clientSeq),
    updatedAt: now,
    rematchRequests: [],
  };

  return {
    room: nextRoom,
    eventsByPlayerId: mapParticipants(nextRoom, (viewer) => ({
      type: 'gameViewUpdated',
      revision: nextRoom.revision,
      ackClientSeq: clientSeq,
      payload: {
        view: getPlayerView(nextRoom.gameState, viewer, getRoomPresence(nextRoom)),
      },
    })),
  };
}

function skipPassDeviceForOnlineRoom(gameState: GameState): GameState {
  if (gameState.phase.type !== 'PASS_DEVICE') return gameState;
  return gameReducer(gameState, { type: 'ACKNOWLEDGE_PASS_DEVICE' });
}

function normalizeOnlineRoom(room: RoomState, now: number): RoomState {
  const gameState = skipPassDeviceForOnlineRoom(room.gameState);
  if (gameState === room.gameState) return room;
  return {
    ...room,
    gameState,
    revision: room.revision + 1,
    updatedAt: now,
  };
}

function resign(
  room: RoomState,
  player: Player,
  now: number,
  playerId: PlayerId,
  clientSeq: number | undefined
): RoomCommandResult {
  const winner = getOpponent(player);
  const gameState: GameState = {
    ...room.gameState,
    phase: { type: 'GAME_OVER', winner },
    winner,
  };
  const nextRoom: RoomState = {
    ...room,
    gameState,
    revision: room.revision + 1,
    lastClientSeqByPlayerId: rememberClientSeq(room, playerId, clientSeq),
    updatedAt: now,
  };

  return {
    room: nextRoom,
    eventsByPlayerId: mapParticipants(nextRoom, (viewer) => ({
      type: 'gameOver',
      revision: nextRoom.revision,
      ackClientSeq: clientSeq,
      payload: {
        winner,
        reason: 'resign',
        view: getPlayerView(nextRoom.gameState, viewer, getRoomPresence(nextRoom)),
      },
    })),
  };
}

function requestRematch(
  room: RoomState,
  player: Player,
  now: number,
  playerId: PlayerId,
  clientSeq: number | undefined
): RoomCommandResult {
  if (room.gameState.phase.type !== 'GAME_OVER') {
    return invalidResult(room, playerId, 'requestRematch', 'game is not over', clientSeq);
  }

  const rematchRequests = room.rematchRequests.includes(player)
    ? room.rematchRequests
    : [...room.rematchRequests, player];
  const bothPlayersRequested = rematchRequests.includes('sente') && rematchRequests.includes('gote');
  const nextRoom: RoomState = {
    ...room,
    gameState: bothPlayersRequested ? createInitialGameState('pvp', false) : room.gameState,
    revision: room.revision + 1,
    lastClientSeqByPlayerId: rememberClientSeq(room, playerId, clientSeq),
    rematchRequests: bothPlayersRequested ? [] : rematchRequests,
    updatedAt: now,
  };

  if (bothPlayersRequested) {
    return {
      room: nextRoom,
      eventsByPlayerId: mapParticipants(nextRoom, (viewer) => ({
        type: 'gameViewUpdated',
        revision: nextRoom.revision,
        ackClientSeq: clientSeq,
        payload: {
          view: getPlayerView(nextRoom.gameState, viewer, getRoomPresence(nextRoom)),
        },
      })),
    };
  }

  return {
    room: nextRoom,
    eventsByPlayerId: mapParticipants(nextRoom, () => presenceUpdatedEvent(nextRoom, clientSeq)),
  };
}

function roomJoinedEvent(room: RoomState, player: Viewer, clientSeq?: number): ServerEvent {
  return {
    type: 'roomJoined',
    revision: room.revision,
    ackClientSeq: clientSeq,
    payload: {
      roomId: room.roomId,
      player,
      view: getPlayerView(room.gameState, player, getRoomPresence(room)),
    },
  };
}

function invalidResult(
  room: RoomState,
  playerId: PlayerId,
  commandType: ClientCommand['type'],
  reason: string,
  clientSeq?: number
): RoomCommandResult {
  return {
    room,
    eventsByPlayerId: {
      [playerId]: [{
        type: 'invalidCommand',
        revision: room.revision,
        ackClientSeq: clientSeq,
        payload: {
          commandType,
          reason,
        },
      }],
    },
  };
}

function isStaleCommand(
  room: RoomState,
  playerId: PlayerId,
  clientSeq: number | undefined
): boolean {
  if (clientSeq === undefined) return false;
  const lastClientSeq = room.lastClientSeqByPlayerId[playerId];
  return lastClientSeq !== undefined && clientSeq <= lastClientSeq;
}

function rememberClientSeq(
  room: RoomState,
  playerId: PlayerId,
  clientSeq: number | undefined
): Partial<Record<PlayerId, number>> {
  if (clientSeq === undefined) return room.lastClientSeqByPlayerId;
  return {
    ...room.lastClientSeqByPlayerId,
    [playerId]: clientSeq,
  };
}

function getPlayerForId(room: RoomState, playerId: PlayerId): Player | null {
  if (room.players.sente === playerId) return 'sente';
  if (room.players.gote === playerId) return 'gote';
  return null;
}

function getViewerForId(room: RoomState, playerId: PlayerId): Viewer | null {
  return getPlayerForId(room, playerId) ?? (room.spectators.includes(playerId) ? 'spectator' : null);
}

function getRoomPresence(room: RoomState): RoomPresence {
  return {
    players: Number(Boolean(room.players.sente)) + Number(Boolean(room.players.gote)),
    playerCapacity: 2,
    spectators: room.spectators.length,
    seats: {
      sente: Boolean(room.players.sente),
      gote: Boolean(room.players.gote),
    },
  };
}

function presenceUpdatedEvent(room: RoomState, clientSeq?: number): ServerEvent {
  return {
    type: 'roomPresenceUpdated',
    revision: room.revision,
    ackClientSeq: clientSeq,
    payload: {
      presence: getRoomPresence(room),
      rematchRequests: room.rematchRequests,
    },
  };
}

function mapParticipants(
  room: RoomState,
  createEvent: (viewer: Viewer) => ServerEvent
): Record<PlayerId, ServerEvent[]> {
  const eventsByPlayerId: Record<PlayerId, ServerEvent[]> = {};

  for (const player of ['sente', 'gote'] as const) {
    const playerId = room.players[player];
    if (playerId) {
      eventsByPlayerId[playerId] = [createEvent(player)];
    }
  }

  for (const playerId of room.spectators) {
    eventsByPlayerId[playerId] = [createEvent('spectator')];
  }

  return eventsByPlayerId;
}

function mapExistingParticipants(
  room: RoomState,
  excludedPlayerId: PlayerId,
  createEvent: (viewer: Viewer) => ServerEvent
): Record<PlayerId, ServerEvent[]> {
  const eventsByPlayerId: Record<PlayerId, ServerEvent[]> = {};

  for (const playerId of [
    room.players.sente,
    room.players.gote,
    ...room.spectators,
  ]) {
    if (!playerId || playerId === excludedPlayerId) continue;
    const viewer = getViewerForId(room, playerId);
    if (viewer) eventsByPlayerId[playerId] = [createEvent(viewer)];
  }

  return eventsByPlayerId;
}
