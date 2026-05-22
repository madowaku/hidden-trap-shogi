'use client';

import type { Board as BoardType, Position, UISelection, Pitfall, Phase } from '@/game/types';
import Cell from './Cell';
import { posEquals } from '@/game/board';
import {
  getDisplayColLabels,
  getDisplayCols,
  getDisplayRowLabels,
  getDisplayRows,
  type BoardOrientation,
} from '@/game/orientation';

type Props = {
  board: BoardType;
  selection: UISelection;
  visiblePitfalls: Pitfall[];
  draftPitfall: Position | null;
  blockedPitfallSquares?: Position[];
  trapBurstPosition: Position | null;
  missedTrapPosition: Position | null;
  phaseType: Phase['type'];
  isCheckKingPosition?: Position | null;
  isReviewMode?: boolean;
  reviewTrapData?: Record<string, { count: number; state: 'hit' | 'miss' | 'none' }>;
  compact?: boolean;
  orientation?: BoardOrientation;
  onCellClick: (pos: Position) => void;
};

export default function Board({
  board,
  selection,
  visiblePitfalls,
  draftPitfall,
  blockedPitfallSquares = [],
  trapBurstPosition,
  missedTrapPosition,
  phaseType,
  isCheckKingPosition = null,
  isReviewMode = false,
  reviewTrapData,
  compact = false,
  orientation = 'sente',
  onCellClick,
}: Props) {
  const selectedPos = selection.type === 'piece' ? selection.position : null;
  const displayRows = getDisplayRows(orientation);
  const displayCols = getDisplayCols(orientation);
  const colLabels = getDisplayColLabels(orientation);
  const rowLabels = getDisplayRowLabels(orientation);

  const legalMoves: Position[] =
    selection.type === 'piece'
      ? selection.legalMoves
      : selection.type === 'hand_piece'
        ? selection.legalDrops
        : [];

  return (
    <div className="relative flex flex-col items-center">
      {phaseType === 'PITFALL_PLACEMENT' && (
        <div className={`pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 rounded-md border border-fuchsia-300/45 bg-[#2b1025]/90 font-black text-fuchsia-100 shadow-lg shadow-fuchsia-950/50 ${
          compact ? '-top-2 px-3 py-1 text-xs' : '-top-3 px-4 py-2 text-sm'
        }`}>
          罠を仕掛けるマスを選択
        </div>
      )}

      {/* 筋ラベル（上） */}
      <div className={`${compact ? 'ml-5 lg:ml-6' : 'ml-7 lg:ml-8'} flex`}>
        {colLabels.map((label, i) => (
          <div
            key={`col-${i}`}
            className={`${compact ? 'w-8 sm:w-9 lg:w-10' : 'w-11 sm:w-12 lg:w-14'} text-center font-mono text-xs text-amber-400/60`}
          >
            {label}
          </div>
        ))}
      </div>

      <div className="flex">
        {/* 盤面 */}
        <div className="border-2 border-amber-700/70 bg-amber-950/30 shadow-2xl shadow-black/40 backdrop-blur-sm">
          {displayRows.map((row) => (
            <div key={row} className="flex">
              {displayCols.map((col) => {
                const pos: Position = { row, col };
                const isSelected = selectedPos !== null && posEquals(pos, selectedPos);
                const isLegalMove = legalMoves.some(m => posEquals(m, pos));
                const isPitfall = visiblePitfalls.some(p => posEquals(p.position, pos));
                const isPitfallDraft = draftPitfall !== null && posEquals(pos, draftPitfall);
                const isPitfallBlocked = blockedPitfallSquares.some(square => posEquals(square, pos));
                const isTrapBurst = trapBurstPosition !== null && posEquals(pos, trapBurstPosition);
                const isMissedTrapReveal = missedTrapPosition !== null && posEquals(pos, missedTrapPosition);
                const isCheckKing = isCheckKingPosition !== null && posEquals(pos, isCheckKingPosition);
                const cellReviewData = reviewTrapData?.[`${row}-${col}`];
                const reviewTrapCount = cellReviewData?.count ?? 0;
                const reviewTrapState = cellReviewData?.state ?? 'none';

                return (
                  <Cell
                    key={`${row}-${col}`}
                    row={row}
                    col={col}
                    cell={board[row][col]}
                    isSelected={isSelected}
                    isLegalMove={isLegalMove}
                    isPitfall={isPitfall}
                    isPitfallDraft={isPitfallDraft}
                    isPitfallBlocked={isPitfallBlocked}
                    isTrapBurst={isTrapBurst}
                    isMissedTrapReveal={isMissedTrapReveal}
                    isPitfallPlacement={phaseType === 'PITFALL_PLACEMENT'}
                    isCheckKing={isCheckKing}
                    isReviewMode={isReviewMode}
                    reviewTrapCount={reviewTrapCount}
                    reviewTrapState={reviewTrapState}
                    compact={compact}
                    orientation={orientation}
                    onClick={() => onCellClick(pos)}
                  />
                );
              })}
            </div>
          ))}
        </div>

        {/* 段ラベル（右） */}
        <div className="ml-1 flex flex-col">
          {rowLabels.map((label, i) => (
            <div
              key={`row-${i}`}
              className={`${compact ? 'h-8 sm:h-9 lg:h-10' : 'h-11 sm:h-12 lg:h-14'} flex items-center text-xs text-amber-400/60`}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
