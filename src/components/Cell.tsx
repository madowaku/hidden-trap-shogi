'use client';

import type { BoardCell } from '@/game/types';
import PieceComponent from './Piece';
import type { BoardOrientation } from '@/game/orientation';

type Props = {
  row: number;
  col: number;
  cell: BoardCell;
  isSelected: boolean;
  isLegalMove: boolean;
  isPitfall: boolean;
  isPitfallDraft: boolean;
  isPitfallBlocked: boolean;
  isTrapBurst: boolean;
  isMissedTrapReveal: boolean;
  isPitfallPlacement: boolean;
  isCheckKing?: boolean;
  reviewTrapCount?: number;
  reviewTrapState?: 'hit' | 'miss' | 'none';
  isReviewMode?: boolean;
  compact?: boolean;
  orientation?: BoardOrientation;
  onClick: () => void;
};

export default function Cell({
  row,
  col,
  cell,
  isSelected,
  isLegalMove,
  isPitfall,
  isPitfallDraft,
  isPitfallBlocked,
  isTrapBurst,
  isMissedTrapReveal,
  isPitfallPlacement,
  isCheckKing = false,
  reviewTrapCount = 0,
  reviewTrapState = 'none',
  isReviewMode = false,
  compact = false,
  orientation = 'sente',
  onClick,
}: Props) {
  // チェッカーパターンの背景色
  const isDark = (row + col) % 2 === 0;

  return (
    <div
      onClick={onClick}
      className={`
        group relative ${compact ? 'h-8 w-8 sm:h-9 sm:w-9 lg:h-10 lg:w-10' : 'h-11 w-11 sm:h-12 sm:w-12 lg:h-14 lg:w-14'}
        flex items-center justify-center
        border border-amber-900/40
        cursor-pointer
        transition duration-150
        ${isDark ? 'bg-amber-800/20' : 'bg-amber-700/10'}
        ${isSelected ? 'bg-yellow-500/30 ring-2 ring-yellow-400 ring-inset' : ''}
        ${isLegalMove ? 'bg-emerald-500/25' : ''}
        ${isCheckKing ? 'check-king-pulse ring-2 ring-red-500 ring-inset z-10' : ''}
        ${isReviewMode && reviewTrapState === 'hit' ? 'bg-fuchsia-950/80 ring-2 ring-fuchsia-400/80 ring-inset shadow-[inset_0_0_20px_rgba(217,70,239,0.4)]' : ''}
        ${isReviewMode && reviewTrapState === 'miss' ? 'bg-indigo-950/70 ring-2 ring-indigo-400/70 ring-inset shadow-[inset_0_0_20px_rgba(129,140,248,0.3)]' : ''}
        ${isPitfallDraft ? 'bg-fuchsia-500/30 ring-2 ring-fuchsia-200 ring-inset shadow-[inset_0_0_28px_rgba(217,70,239,0.32)]' : ''}
        ${isTrapBurst ? 'trap-burst-cell bg-red-500/40 ring-4 ring-red-200 ring-inset' : ''}
        ${isMissedTrapReveal ? 'trap-miss-smoke bg-violet-500/35 ring-4 ring-violet-100/80 ring-inset' : ''}
        ${isPitfallPlacement && !isPitfallBlocked ? 'hover:bg-fuchsia-500/20 hover:ring-2 hover:ring-fuchsia-300/50 hover:ring-inset hover:shadow-[inset_0_0_24px_rgba(190,24,93,0.22)]' : 'hover:bg-amber-500/20'}
        ${isPitfallBlocked && isPitfallPlacement ? 'cursor-not-allowed bg-stone-950/30' : ''}
      `}
    >
      {isPitfallPlacement && !isPitfall && !isPitfallBlocked && (
        <div className="pointer-events-none absolute inset-1 opacity-0 transition group-hover:opacity-100">
          <div className="h-full w-full rounded-sm border border-fuchsia-300/30 bg-fuchsia-500/10" />
        </div>
      )}

      {isPitfallPlacement && isPitfallBlocked && (
        <div className="pointer-events-none absolute inset-1 rounded-sm border border-red-300/25 bg-red-950/10" />
      )}

      {/* 座標表示（デバッグ用） */}

      {/* 合法移動先マーカー */}
      {isLegalMove && !cell && (
        <div className="absolute w-3 h-3 rounded-full bg-emerald-400/50" />
      )}

      {/* 落とし穴マーカー */}
      {(isPitfall || isPitfallDraft) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={`flex -rotate-6 items-center justify-center rounded-sm border font-black shadow-[0_0_18px_rgba(190,24,93,0.45)] backdrop-blur-[1px] ${
            compact ? 'h-6 w-7 text-[10px]' : 'h-8 w-10 text-[11px] sm:h-9 sm:w-12 sm:text-xs'
          } ${
            isPitfallDraft
              ? 'border-fuchsia-100 bg-gradient-to-br from-fuchsia-400/80 to-red-500/70 text-white'
              : 'border-fuchsia-200/55 bg-gradient-to-br from-fuchsia-700/55 to-red-700/45 text-fuchsia-50'
          }`}>
            {isPitfallDraft ? '候補' : '罠'}
          </div>
        </div>
      )}

      {isTrapBurst && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className={`trap-burst-ring rounded-full border-4 border-red-100/80 ${compact ? 'h-10 w-10' : 'h-16 w-16'}`} />
        </div>
      )}

      {isMissedTrapReveal && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className={`trap-miss-cloud rounded-full border-4 border-violet-100/75 bg-violet-300/35 ${compact ? 'h-10 w-10' : 'h-16 w-16'}`} />
          <div className="absolute rounded-sm border border-violet-100/70 bg-violet-700/75 px-1.5 py-0.5 text-[10px] font-black text-violet-50">
            不発
          </div>
        </div>
      )}

      {/* 駒表示 */}
      {cell && (
        <div className={isReviewMode ? 'opacity-30 pointer-events-none' : ''}>
          <PieceComponent
            piece={cell}
            isSelected={isSelected}
            size={compact ? 'small' : 'normal'}
            orientation={orientation}
          />
        </div>
      )}

      {/* 罠レビュー回数バッジ */}
      {isReviewMode && reviewTrapCount > 0 && (
        <div className="absolute bottom-1 right-1 z-15 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-stone-950/95 text-[10px] font-black border border-white/30 text-white shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
          {reviewTrapCount}
        </div>
      )}

      {/* 合法移動先（駒がある場合の取れるマーカー） */}
      {isLegalMove && cell && (
        <div className="absolute inset-0 ring-2 ring-red-400/60 ring-inset rounded-sm pointer-events-none" />
      )}
    </div>
  );
}
