import { BOARD_SIZE } from './constants';
import type { Piece, Player } from './types';

export type BoardOrientation = Player;

const SENTE_ROWS = Array.from({ length: BOARD_SIZE }, (_, index) => index);
const GOTE_ROWS = [...SENTE_ROWS].reverse();
const SENTE_COLS = SENTE_ROWS;
const GOTE_COLS = GOTE_ROWS;

const ROW_LABELS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

export function getDisplayRows(orientation: BoardOrientation): number[] {
  return orientation === 'gote' ? GOTE_ROWS : SENTE_ROWS;
}

export function getDisplayCols(orientation: BoardOrientation): number[] {
  return orientation === 'gote' ? GOTE_COLS : SENTE_COLS;
}

export function getDisplayColLabels(orientation: BoardOrientation): string[] {
  return getDisplayCols(orientation).map((col) => String(9 - col));
}

export function getDisplayRowLabels(orientation: BoardOrientation): string[] {
  return getDisplayRows(orientation).map((row) => ROW_LABELS[row]);
}

export function shouldRotatePieceForViewer(piece: Pick<Piece, 'owner'>, orientation: BoardOrientation): boolean {
  return piece.owner !== orientation;
}
