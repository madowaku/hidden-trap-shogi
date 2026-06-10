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
  const sizeClass = size === 'small' ? 'w-5 h-6 text-[11px]' : 'w-8 h-9 text-sm sm:w-9 sm:h-10 sm:text-base';

  return (
    <div
      onClick={onClick}
      className={`
        ${sizeClass}
        flex items-center justify-center
        font-bold cursor-pointer select-none
        transition-all duration-150
        ${shouldRotate ? 'rotate-180' : ''}
        ${isPromoted ? 'text-red-800' : isGote ? 'text-sky-950' : 'text-red-950'}
        ${isSelected ? 'ring-2 ring-yellow-400 scale-110' : ''}
      `}
      title={`${piece.owner === 'sente' ? '先手' : '後手'} ${kanji}`}
    >
      <span className={`
        inline-flex items-center justify-center
        ${sizeClass}
        piece-tile border rounded-sm
        ${isGote
          ? 'border-sky-900/50'
          : 'border-amber-900/50'
        }
        ${isPromoted ? 'border-red-700/70' : ''}
      `}>
        {kanji}
      </span>
    </div>
  );
}
