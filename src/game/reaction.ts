import type { PublicLogEntry, Viewer } from './types';

export type TrapReactionKind =
  | 'player_trapped'
  | 'opponent_trapped'
  /** C: 王手の応手は罠にかかったが、指し直しで救われた */
  | 'player_rescued'
  | 'opponent_rescued';

export function getTrapReactionKind(
  entry: PublicLogEntry | null | undefined,
  viewer: Viewer
): TrapReactionKind | null {
  if (!entry?.pitfallTriggered) return null;
  if (viewer === 'spectator') return null;
  if (entry.rescued) return entry.player === viewer ? 'player_rescued' : 'opponent_rescued';
  return entry.player === viewer ? 'player_trapped' : 'opponent_trapped';
}
