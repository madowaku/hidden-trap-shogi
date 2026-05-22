// =============================================
// Pitfall Shogi — Board Utilities & Legal Move Generation
// =============================================

import type { Board, Position, Player, Piece, AnyPieceKind, MoveAction, DropAction, PieceKind } from './types';
import { BOARD_SIZE, MOVE_PATTERNS } from './constants';

// --- ユーティリティ ---

export function posEquals(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

export function isInBounds(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

export function getOpponent(player: Player): Player {
  return player === 'sente' ? 'gote' : 'sente';
}

export function cloneBoard(board: Board): Board {
  return board.map(row => row.map(cell => (cell ? { ...cell } : null)));
}

export function isKingSquare(board: Board, position: Position): boolean {
  return board[position.row]?.[position.col]?.kind === 'king';
}

/**
 * 先手基準の移動パターンをプレイヤーに合わせて変換
 * 先手: row が減少する方向が前方 (dr=-1)
 * 後手: row が増加する方向が前方 → dr を反転
 */
function adjustDr(dr: number, player: Player): number {
  return player === 'sente' ? dr : -dr;
}

// --- 合法手生成 ---

/**
 * 指定位置の駒の合法移動先を取得
 */
export function getLegalMoves(board: Board, pos: Position): Position[] {
  const piece = board[pos.row][pos.col];
  if (!piece) return [];

  const pattern = MOVE_PATTERNS[piece.kind];
  const moves: Position[] = [];

  // 1マス移動
  for (const offset of pattern.offsets) {
    const nr = pos.row + adjustDr(offset.dr, piece.owner);
    const nc = pos.col + offset.dc;
    if (!isInBounds(nr, nc)) continue;

    const target = board[nr][nc];
    if (target && target.owner === piece.owner) continue; // 味方駒ブロック
    moves.push({ row: nr, col: nc });
  }

  // 直線移動（飛車・角・香車）
  for (const slide of pattern.slides) {
    const dr = adjustDr(slide.dr, piece.owner);
    const dc = slide.dc;
    let r = pos.row + dr;
    let c = pos.col + dc;

    while (isInBounds(r, c)) {
      const target = board[r][c];
      if (target) {
        if (target.owner !== piece.owner) {
          moves.push({ row: r, col: c }); // 相手駒を取れる
        }
        break; // 駒で止まる
      }
      moves.push({ row: r, col: c });
      r += dr;
      c += dc;
    }
  }

  return moves;
}

/**
 * プレイヤーの全合法手を取得
 */
export function getAllLegalMoves(board: Board, player: Player): MoveAction[] {
  const moves: MoveAction[] = [];

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = board[row][col];
      if (!piece || piece.owner !== player) continue;

      const targets = getLegalMoves(board, { row, col });
      for (const to of targets) {
        const captured = board[to.row][to.col];
        moves.push({
          type: 'move',
          from: { row, col },
          to,
          piece,
          captured: captured ?? null,
        });
      }
    }
  }

  return moves;
}

export function findKing(board: Board, owner: Player): Position | null {
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = board[row][col];
      if (piece?.owner === owner && piece.kind === 'king') {
        return { row, col };
      }
    }
  }
  return null;
}

export function isPlayerInCheck(board: Board, player: Player): boolean {
  const king = findKing(board, player);
  if (!king) return false;
  return getAllLegalMoves(board, getOpponent(player)).some((move) => posEquals(move.to, king));
}

/**
 * 持ち駒の合法打ち込み先を取得
 */
export function getLegalDrops(
  board: Board,
  player: Player,
  pieceKind: PieceKind
): Position[] {
  const drops: Position[] = [];

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (board[row][col] !== null) continue; // 駒がある場所には打てない

      // 歩の二歩チェック
      if (pieceKind === 'pawn') {
        let hasPawnInCol = false;
        for (let r = 0; r < BOARD_SIZE; r++) {
          const p = board[r][col];
          if (p && p.owner === player && p.kind === 'pawn') {
            hasPawnInCol = true;
            break;
          }
        }
        if (hasPawnInCol) continue;
      }

      // 行き場所のない駒の制限
      if (player === 'sente') {
        if (pieceKind === 'pawn' && row === 0) continue;
        if (pieceKind === 'lance' && row === 0) continue;
        if (pieceKind === 'knight' && row <= 1) continue;
      } else {
        if (pieceKind === 'pawn' && row === 8) continue;
        if (pieceKind === 'lance' && row === 8) continue;
        if (pieceKind === 'knight' && row >= 7) continue;
      }

      drops.push({ row, col });
    }
  }

  return drops;
}

/**
 * 盤面に駒移動を適用（新しい盤面を返す）
 */
export function applyMove(board: Board, move: MoveAction): Board {
  const newBoard = cloneBoard(board);
  newBoard[move.from.row][move.from.col] = null;
  const piece = move.promote
    ? { ...move.piece, kind: getPromotedKind(move.piece.kind) }
    : move.piece;
  newBoard[move.to.row][move.to.col] = piece;
  return newBoard;
}

/**
 * 盤面に打ち込みを適用
 */
export function applyDrop(board: Board, drop: DropAction): Board {
  const newBoard = cloneBoard(board);
  newBoard[drop.to.row][drop.to.col] = drop.piece;
  return newBoard;
}

/** 成り後の駒種を取得 */
function getPromotedKind(kind: AnyPieceKind): AnyPieceKind {
  const map: Partial<Record<AnyPieceKind, AnyPieceKind>> = {
    rook: 'promoted_rook',
    bishop: 'promoted_bishop',
    silver: 'promoted_silver',
    knight: 'promoted_knight',
    lance: 'promoted_lance',
    pawn: 'promoted_pawn',
  };
  return map[kind] ?? kind;
}

/** 成り前の駒種を取得（持ち駒に加える時用） */
export function getUnpromotedKind(kind: AnyPieceKind): PieceKind {
  const map: Partial<Record<AnyPieceKind, PieceKind>> = {
    promoted_rook: 'rook',
    promoted_bishop: 'bishop',
    promoted_silver: 'silver',
    promoted_knight: 'knight',
    promoted_lance: 'lance',
    promoted_pawn: 'pawn',
  };
  return (map[kind] ?? kind) as PieceKind;
}

/** 駒が成れるかチェック */
export function canPromote(piece: Piece, from: Position, to: Position): boolean {
  // 既に成り駒は成れない
  if (piece.kind.startsWith('promoted_')) return false;
  // 王と金は成れない
  if (piece.kind === 'king' || piece.kind === 'gold') return false;

  // 敵陣判定
  if (piece.owner === 'sente') {
    return from.row <= 2 || to.row <= 2;
  } else {
    return from.row >= 6 || to.row >= 6;
  }
}

/** 強制成りかチェック（行き場所がなくなる場合） */
export function mustPromote(piece: Piece, to: Position): boolean {
  if (piece.kind.startsWith('promoted_')) return false;
  if (piece.kind === 'king' || piece.kind === 'gold') return false;

  if (piece.owner === 'sente') {
    if ((piece.kind === 'pawn' || piece.kind === 'lance') && to.row === 0) return true;
    if (piece.kind === 'knight' && to.row <= 1) return true;
  } else {
    if ((piece.kind === 'pawn' || piece.kind === 'lance') && to.row === 8) return true;
    if (piece.kind === 'knight' && to.row >= 7) return true;
  }
  return false;
}
