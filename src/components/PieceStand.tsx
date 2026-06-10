'use client';

import type { Hand, Player, PieceKind } from '@/game/types';
import { PIECE_KANJI } from '@/game/constants';

type Props = {
  hand: Hand;
  player: Player;
  isCurrentPlayer: boolean;
  onPieceClick?: (kind: PieceKind) => void;
  language?: 'ja' | 'en';
  compact?: boolean;
};

const HAND_PIECE_ORDER: Exclude<PieceKind, 'king'>[] = [
  'rook', 'bishop', 'gold', 'silver', 'knight', 'lance', 'pawn',
];

export default function PieceStand({
  hand,
  player,
  isCurrentPlayer,
  onPieceClick,
  language = 'ja',
  compact = false,
}: Props) {
  const pieces = HAND_PIECE_ORDER.filter(k => hand[k] > 0);
  const label = player === 'sente'
    ? language === 'ja' ? '☗ 先手持駒' : '☗ Sente hand'
    : language === 'ja' ? '☖ 後手持駒' : '☖ Gote hand';

  return (
    <div className={`
      hand-stand flex flex-col gap-1 rounded-lg ${compact ? 'min-w-[64px] px-2 py-0.5' : 'min-w-[80px] px-3 py-2'}
      ${player === 'sente'
        ? 'border border-amber-700/35'
        : 'border border-sky-700/35'
      }
    `}>
      <div className={`${compact ? 'text-[10px]' : 'text-xs'} font-black ${player === 'sente' ? 'text-amber-200/80' : 'text-sky-200/80'}`}>
        {label}
      </div>

      {pieces.length === 0 && (
        <div className={`${compact ? 'text-[10px]' : 'text-xs'} text-stone-300/65 italic`}>{language === 'ja' ? 'なし' : 'None'}</div>
      )}

      <div className="flex flex-wrap gap-1">
        {pieces.map(kind => (
          <button
            key={kind}
            onClick={() => isCurrentPlayer && onPieceClick?.(kind)}
            disabled={!isCurrentPlayer}
            className={`
              flex items-center gap-0.5 rounded ${compact ? 'px-1 py-0 text-xs' : 'px-1.5 py-0.5 text-sm'}
              transition-colors
              ${isCurrentPlayer
                ? 'hover:bg-white/10 cursor-pointer'
                : 'cursor-default opacity-70'
              }
              ${player === 'sente' ? 'text-amber-200' : 'text-blue-200'}
            `}
          >
            <span className="font-bold">{PIECE_KANJI[kind]}</span>
            {hand[kind] > 1 && (
              <span className="text-xs opacity-60">×{hand[kind]}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
