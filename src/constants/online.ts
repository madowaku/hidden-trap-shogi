// =============================================
// Pitfall Shogi — Online Room Client Config
// =============================================

export const DEFAULT_ONLINE_ROOM_WS_URL = 'wss://hidden-trap-shogi-room.cacao-ixora-coccinea.workers.dev';
export const ONLINE_ROOM_WS_URL = process.env.NEXT_PUBLIC_ROOM_WS_URL ?? DEFAULT_ONLINE_ROOM_WS_URL;

export function createRoomWebSocketUrl(baseUrl: string, roomId: string): string {
  const trimmedBaseUrl = baseUrl.trim().replace(/\/+$/, '');
  return `${trimmedBaseUrl}/rooms/${encodeURIComponent(roomId.trim())}/ws`;
}
