'use client';

import type { Piece as PieceType } from '@/game/types';
import { PIECE_KANJI, PIECE_KANJI_GOTE_KING } from '@/game/constants';
import { shouldRotatePieceForViewer, type BoardOrientation } from '@/game/orientation';

type Props = {
  piece: PieceType;
  isSelected?: boolean;
  onClick?: () => void;
  size?: 'normal' | 'small';
  orientation?: BoardOrientation;
};

export default function Piece({ piece, isSelected, onClick, size = 'normal', orientation = 'sente' }: Props) {
  const isGote = piece.owner === 'gote';
  const shouldRotate = shouldRotatePieceForViewer(piece, orientation);
  const kanji =
    piece.kind === 'king' && isGote
      ? PIECE_KANJI_GOTE_KING
      : PIECE_KANJI[piece.kind];

  const isPromoted = piece.kind.startsWith('promoted_');
  const sizeClass = size === 'small' ? 'w-5 h-6 text-[11px]' : 'w-9 h-10 text-base';

  return (
    <div
      onClick={onClick}
      className={`
        ${sizeClass}
        flex items-center justify-center
        font-bold cursor-pointer select-none
        transition-all duration-150
        ${shouldRotate ? 'rotate-180' : ''}
        ${isPromoted ? 'text-red-400' : isGote ? 'text-blue-300' : 'text-amber-100'}
        ${isSelected ? 'ring-2 ring-yellow-400 scale-110' : ''}
      `}
      title={`${piece.owner === 'sente' ? '先手' : '後手'} ${kanji}`}
    >
      <span className={`
        inline-flex items-center justify-center
        ${sizeClass}
        border rounded-sm
        ${isGote
          ? 'border-blue-400/60 bg-blue-950/50'
          : 'border-amber-400/60 bg-amber-950/50'
        }
        ${isPromoted ? 'border-red-400/60' : ''}
        shadow-sm
      `}>
        {kanji}
      </span>
    </div>
  );
}
