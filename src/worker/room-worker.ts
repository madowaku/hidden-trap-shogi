// =============================================
// Pitfall Shogi — Cloudflare Room WebSocket PoC
// =============================================

import type { ClientCommand, ServerEvent } from '../server/contract';
import type { GameAction, Piece, Position } from '../game/types';
import type { RoomState } from '../game/room';
import { createRoom, handleRoomCommand } from '../game/room';

type DurableObjectId = unknown;

type DurableObjectNamespaceLike = {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): { fetch(request: Request): Promise<Response> };
};

type DurableObjectStorageLike = {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
};

type DurableObjectStateLike = {
  storage: DurableObjectStorageLike;
};

type RoomWorkerEnv = {
  ROOM: DurableObjectNamespaceLike;
};

type CloudflareWebSocket = WebSocket & {
  accept(): void;
};

type MessageEventLike = {
  data: unknown;
};

declare const WebSocketPair: {
  new(): {
    0: WebSocket;
    1: CloudflareWebSocket;
  };
};

const ROOM_STORAGE_KEY = 'room';
const ROOM_PATH_PATTERN = /^\/rooms\/([^/]+)\/ws$/;

const worker = {
  async fetch(request: Request, env: RoomWorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const roomId = getRoomIdFromPath(url);

    if (!roomId) {
      return new Response('Pitfall Shogi room worker. Connect to /rooms/:roomId/ws', { status: 200 });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const objectId = env.ROOM.idFromName(roomId);
    const roomObject = env.ROOM.get(objectId);
    return roomObject.fetch(request);
  },
};

export default worker;

export class RoomDurableObject {
  private room: RoomState | null = null;
  private readonly socketsByPlayerId = new Map<string, CloudflareWebSocket>();

  constructor(private readonly state: DurableObjectStateLike, private readonly env: unknown) {
    void this.env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const roomId = getRoomIdFromPath(url);

    if (!roomId) {
      return new Response('Room id missing', { status: 400 });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const playerId = crypto.randomUUID();

    await this.acceptSocket(server, roomId, playerId);

    return new Response(null, {
      status: 101,
      webSocket: client,
    } as ResponseInit & { webSocket: WebSocket });
  }

  async acceptSocket(socket: CloudflareWebSocket, roomId: string, playerId: string): Promise<void> {
    await this.ensureRoom(roomId);
    socket.accept();
    this.socketsByPlayerId.set(playerId, socket);

    socket.addEventListener('message', (event: MessageEventLike) => {
      void this.handleSocketMessage(playerId, event.data);
    });

    socket.addEventListener('close', () => {
      this.socketsByPlayerId.delete(playerId);
      void this.releasePlayerSlot(playerId);
    });

    socket.addEventListener('error', () => {
      this.socketsByPlayerId.delete(playerId);
      void this.releasePlayerSlot(playerId);
    });
  }

  private async ensureRoom(roomId: string): Promise<RoomState> {
    if (this.room) return this.room;

    const storedRoom = await this.state.storage.get<RoomState>(ROOM_STORAGE_KEY);
    this.room = normalizeStoredRoom(storedRoom, roomId);
    return this.room;
  }

  private async handleSocketMessage(playerId: string, message: unknown): Promise<void> {
    if (!this.room) return;

    const command = parseClientCommand(message);
    if (!command) {
      this.sendEvents(playerId, [{
        type: 'invalidCommand',
        revision: this.room.revision,
        payload: {
          commandType: 'joinRoom',
          reason: 'invalid command payload',
        },
      }]);
      return;
    }

    const result = handleRoomCommand(this.room, playerId, command, Date.now());
    this.room = result.room;
    await this.state.storage.put(ROOM_STORAGE_KEY, this.room);

    for (const [eventPlayerId, events] of Object.entries(result.eventsByPlayerId)) {
      this.sendEvents(eventPlayerId, events);
    }
  }

  private sendEvents(playerId: string, events: readonly ServerEvent[]): void {
    const socket = this.socketsByPlayerId.get(playerId);
    if (!socket) return;

    for (const event of events) {
      socket.send(JSON.stringify(event));
    }
  }

  private async releasePlayerSlot(playerId: string): Promise<void> {
    if (!this.room) return;

    const nextPlayers = { ...this.room.players };
    let changed = false;
    if (nextPlayers.sente === playerId) {
      delete nextPlayers.sente;
      changed = true;
    }
    if (nextPlayers.gote === playerId) {
      delete nextPlayers.gote;
      changed = true;
    }
    const nextSpectators = (this.room.spectators ?? []).filter((spectatorId) => spectatorId !== playerId);
    if (nextSpectators.length !== (this.room.spectators ?? []).length) {
      changed = true;
    }
    if (!changed) return;

    this.room = {
      ...this.room,
      players: nextPlayers,
      spectators: nextSpectators,
      updatedAt: Date.now(),
    };
    await this.state.storage.put(ROOM_STORAGE_KEY, this.room);
  }
}

function getRoomIdFromPath(url: URL): string | null {
  const match = url.pathname.match(ROOM_PATH_PATTERN);
  return match ? decodeURIComponent(match[1]) : null;
}

function parseClientCommand(message: unknown): ClientCommand | null {
  try {
    const parsed = typeof message === 'string' ? JSON.parse(message) : message;
    if (!isClientCommand(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isClientCommand(value: unknown): value is ClientCommand {
  if (!value || typeof value !== 'object') return false;

  if ('playerId' in value) return false;

  const command = value as Partial<ClientCommand>;
  if (
    typeof command.type !== 'string'
    || typeof command.roomId !== 'string'
    || (command.clientSeq !== undefined && typeof command.clientSeq !== 'number')
  ) {
    return false;
  }

  switch (command.type) {
    case 'joinRoom':
    case 'resign':
    case 'requestRematch':
      return true;

    case 'placePitfall':
      return isPosition(command.position);

    case 'makeMove':
      return isGameAction(command.action);

    default:
      return false;
  }
}

function normalizeStoredRoom(room: RoomState | undefined, roomId: string): RoomState {
  if (!room) return createRoom(roomId);
  return {
    ...room,
    spectators: room.spectators ?? [],
    rematchRequests: room.rematchRequests ?? [],
  };
}

function isPosition(value: unknown): value is Position {
  if (!value || typeof value !== 'object') return false;
  const position = value as Partial<Position>;
  const row = position.row;
  const col = position.col;

  return typeof row === 'number'
    && typeof col === 'number'
    && Number.isInteger(row)
    && Number.isInteger(col)
    && row >= 0
    && row <= 8
    && col >= 0
    && col <= 8;
}

function isGameAction(value: unknown): value is GameAction {
  if (!value || typeof value !== 'object') return false;
  const action = value as Partial<GameAction>;

  if (action.type === 'move') {
    const move = action as Partial<Extract<GameAction, { type: 'move' }>>;
    return isPosition(move.from)
      && isPosition(move.to)
      && isPiece(move.piece)
      && (move.promote === undefined || typeof move.promote === 'boolean')
      && (move.captured === undefined || move.captured === null || isPiece(move.captured));
  }

  if (action.type === 'drop') {
    const drop = action as Partial<Extract<GameAction, { type: 'drop' }>>;
    return isPosition(drop.to) && isPiece(drop.piece);
  }

  return false;
}

function isPiece(value: unknown): value is Piece {
  if (!value || typeof value !== 'object') return false;
  const piece = value as Partial<Piece>;
  return isPieceKind(piece.kind) && (piece.owner === 'sente' || piece.owner === 'gote');
}

function isPieceKind(value: unknown): value is Piece['kind'] {
  return typeof value === 'string' && [
    'king',
    'rook',
    'bishop',
    'gold',
    'silver',
    'knight',
    'lance',
    'pawn',
    'promoted_rook',
    'promoted_bishop',
    'promoted_silver',
    'promoted_knight',
    'promoted_lance',
    'promoted_pawn',
  ].includes(value);
}
