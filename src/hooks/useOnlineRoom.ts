// =============================================
// Pitfall Shogi — Online Room WebSocket Hook
// =============================================

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ONLINE_ROOM_WS_URL, createRoomWebSocketUrl } from '@/constants/online';
import type { ClientCommand, ServerEvent } from '@/server/contract';
import type { GameAction, GameView, Player, Position, RoomPresence } from '@/game/types';

type OnlineRoomStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

const MAX_DEBUG_EVENTS = 8;

type OnlineInputCommand =
  | { readonly type: 'placePitfall'; readonly position: Position }
  | { readonly type: 'makeMove'; readonly action: GameAction }
  | { readonly type: 'resign' }
  | { readonly type: 'requestRematch' };

export function useOnlineRoom(roomWsBaseUrl = ONLINE_ROOM_WS_URL) {
  const socketRef = useRef<WebSocket | null>(null);
  const clientSeqRef = useRef(0);
  const [status, setStatus] = useState<OnlineRoomStatus>('idle');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [ackClientSeq, setAckClientSeq] = useState<number | null>(null);
  const [assignedPlayer, setAssignedPlayer] = useState<Player | null>(null);
  const [view, setView] = useState<GameView | null>(null);
  const [roomPresence, setRoomPresence] = useState<RoomPresence | null>(null);
  const [rematchRequests, setRematchRequests] = useState<readonly Player[]>([]);
  const [events, setEvents] = useState<ServerEvent[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastInvalidCommand, setLastInvalidCommand] = useState<Extract<ServerEvent, { type: 'invalidCommand' }> | null>(null);
  const [lastSentClientSeq, setLastSentClientSeq] = useState<number | null>(null);
  const [lastReceivedEventType, setLastReceivedEventType] = useState<ServerEvent['type'] | null>(null);
  const [hasRawPitfallLeak, setHasRawPitfallLeak] = useState(false);

  const isConfigured = roomWsBaseUrl.trim().length > 0;

  const nextClientSeq = useCallback(() => {
    clientSeqRef.current += 1;
    return clientSeqRef.current;
  }, []);

  const sendCommand = useCallback((socket: WebSocket, command: ClientCommand) => {
    socket.send(JSON.stringify(command));
  }, []);

  const sendJoinRoom = useCallback((socket: WebSocket, nextRoomId: string) => {
    const clientSeq = nextClientSeq();
    const command: ClientCommand = {
      type: 'joinRoom',
      roomId: nextRoomId,
      clientSeq,
    };
    setLastSentClientSeq(clientSeq);
    sendCommand(socket, command);
  }, [nextClientSeq, sendCommand]);

  const sendRoomCommand = useCallback((command: OnlineInputCommand) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !roomId) {
      setLastError('Online room is not connected');
      return false;
    }

    const clientSeq = nextClientSeq();
    setLastSentClientSeq(clientSeq);
    sendCommand(socket, {
      ...command,
      roomId,
      clientSeq,
    } as ClientCommand);
    return true;
  }, [nextClientSeq, roomId, sendCommand]);

  const sendPlacePitfall = useCallback((position: Position) => (
    sendRoomCommand({ type: 'placePitfall', position })
  ), [sendRoomCommand]);

  const sendMakeMove = useCallback((action: GameAction) => (
    sendRoomCommand({ type: 'makeMove', action })
  ), [sendRoomCommand]);

  const sendResign = useCallback(() => (
    sendRoomCommand({ type: 'resign' })
  ), [sendRoomCommand]);

  const sendRematch = useCallback(() => (
    sendRoomCommand({ type: 'requestRematch' })
  ), [sendRoomCommand]);

  const applyServerEvent = useCallback((event: ServerEvent) => {
    setEvents((previous) => [event, ...previous].slice(0, MAX_DEBUG_EVENTS));
    setRevision(event.revision);
    setAckClientSeq(event.ackClientSeq ?? null);
    setLastReceivedEventType(event.type);
    setHasRawPitfallLeak(hasServerEventRawPitfallLeak(event));
    if (event.type === 'invalidCommand') {
      setLastInvalidCommand(event);
    }

    if (event.type === 'roomPresenceUpdated') {
      setRoomPresence(event.payload.presence);
      setRematchRequests(event.payload.rematchRequests);
    }

    if (
      event.type === 'roomJoined'
      || event.type === 'gameViewUpdated'
      || event.type === 'gameOver'
    ) {
      if (event.type === 'roomJoined') {
        setAssignedPlayer(event.payload.player === 'spectator' ? null : event.payload.player);
      }
      setView(event.payload.view);
      setRoomPresence(event.payload.view.roomPresence ?? null);
      if (event.type === 'gameViewUpdated' && event.payload.view.phase.type !== 'GAME_OVER') {
        setRematchRequests([]);
      }
    }
  }, []);

  const disconnect = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
    setStatus('disconnected');
  }, []);

  const connect = useCallback((nextRoomId: string) => {
    const normalizedRoomId = nextRoomId.trim();
    if (!isConfigured || !normalizedRoomId) return;

    socketRef.current?.close();
    clientSeqRef.current = 0;
    setRoomId(normalizedRoomId);
    setRevision(null);
    setAckClientSeq(null);
    setAssignedPlayer(null);
    setView(null);
    setRoomPresence(null);
    setRematchRequests([]);
    setEvents([]);
    setLastError(null);
    setLastInvalidCommand(null);
    setLastSentClientSeq(null);
    setLastReceivedEventType(null);
    setHasRawPitfallLeak(false);
    setStatus('connecting');

    const socket = new WebSocket(createRoomWebSocketUrl(roomWsBaseUrl, normalizedRoomId));
    socketRef.current = socket;

    socket.addEventListener('open', () => {
      setStatus('connected');
      sendJoinRoom(socket, normalizedRoomId);
    });

    socket.addEventListener('message', (message) => {
      try {
        applyServerEvent(JSON.parse(String(message.data)) as ServerEvent);
      } catch {
        setLastError('Failed to parse server event');
        setStatus('error');
      }
    });

    socket.addEventListener('close', () => {
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      setStatus('disconnected');
    });

    socket.addEventListener('error', () => {
      setLastError('WebSocket connection failed');
      setStatus('error');
    });
  }, [applyServerEvent, isConfigured, roomWsBaseUrl, sendJoinRoom]);

  const reconnect = useCallback(() => {
    if (!roomId) return;
    connect(roomId);
  }, [connect, roomId]);

  useEffect(() => () => {
    socketRef.current?.close();
  }, []);

  return {
    isConfigured,
    status,
    roomId,
    revision,
    ackClientSeq,
    assignedPlayer,
    view,
    roomPresence,
    rematchRequests,
    events,
    lastError,
    lastInvalidCommand,
    lastSentClientSeq,
    lastReceivedEventType,
    hasRawPitfallLeak,
    connect,
    reconnect,
    disconnect,
    sendPlacePitfall,
    sendMakeMove,
    sendResign,
    sendRematch,
  };
}

export function hasServerEventRawPitfallLeak(event: ServerEvent): boolean {
  if ('gameState' in event.payload || 'state' in event.payload) return true;

  const view = 'view' in event.payload ? event.payload.view : null;
  if (!view) return false;

  return 'pitfalls' in view || 'pendingPitfall' in view;
}
