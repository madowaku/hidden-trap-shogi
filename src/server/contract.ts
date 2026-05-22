// =============================================
// Pitfall Shogi — Server Room Wire Contracts
// =============================================

import type { GameAction, GameView, Player, Position, RoomPresence, Viewer } from '../game/types';

export type RoomId = string;

type RoomCommandBase = {
  readonly roomId: RoomId;
  readonly clientSeq?: number;
};

type ServerEventBase = {
  readonly revision: number;
  readonly ackClientSeq?: number;
};

export type JoinRoomCommand = RoomCommandBase & {
  readonly type: 'joinRoom';
};

export type PlacePitfallCommand = RoomCommandBase & {
  readonly type: 'placePitfall';
  readonly position: Position;
};

export type MakeMoveCommand = RoomCommandBase & {
  readonly type: 'makeMove';
  readonly action: GameAction;
};

export type ResignCommand = RoomCommandBase & {
  readonly type: 'resign';
};

export type RequestRematchCommand = RoomCommandBase & {
  readonly type: 'requestRematch';
};

export type ClientCommand =
  | JoinRoomCommand
  | PlacePitfallCommand
  | MakeMoveCommand
  | ResignCommand
  | RequestRematchCommand;

export type RoomJoinedEvent = ServerEventBase & {
  readonly type: 'roomJoined';
  readonly payload: {
    readonly roomId: RoomId;
    readonly player: Viewer;
    readonly view: GameView;
  };
};

export type GameViewUpdatedEvent = ServerEventBase & {
  readonly type: 'gameViewUpdated';
  readonly payload: {
    readonly view: GameView;
  };
};

export type InvalidCommandEvent = ServerEventBase & {
  readonly type: 'invalidCommand';
  readonly payload: {
    readonly commandType: ClientCommand['type'];
    readonly reason: string;
  };
};

export type GameOverReason = 'resign' | 'kingCaptured' | 'disconnect';

export type GameOverEvent = ServerEventBase & {
  readonly type: 'gameOver';
  readonly payload: {
    readonly winner: Player | null;
    readonly reason: GameOverReason;
    readonly view: GameView;
  };
};

export type RoomPresenceUpdatedEvent = ServerEventBase & {
  readonly type: 'roomPresenceUpdated';
  readonly payload: {
    readonly presence: RoomPresence;
    readonly rematchRequests: readonly Player[];
  };
};

export type ServerEvent =
  | RoomJoinedEvent
  | GameViewUpdatedEvent
  | InvalidCommandEvent
  | GameOverEvent
  | RoomPresenceUpdatedEvent;
