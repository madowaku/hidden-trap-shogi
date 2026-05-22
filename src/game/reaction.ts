import type { LogEntry, Viewer } from './types';

export type TrapReactionKind =
  | 'player_trapped'
  | 'opponent_trapped';

export function getTrapReactionKind(
  entry: LogEntry | null | undefined,
  viewer: Viewer
): TrapReactionKind | null {
  if (!entry?.pitfallTriggered) return null;
  if (viewer === 'spectator') return null;
  return entry.player === viewer ? 'player_trapped' : 'opponent_trapped';
}
