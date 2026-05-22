// =============================================
// Pitfall Shogi — Constants & Initial Board Setup
// =============================================

import type {
  AnyPieceKind,
  BotLevel,
  Board,
  Hand,
  GameState,
  MovePattern,
  Direction,
  Piece,
} from './types';

// --- 盤面サイズ ---
export const BOARD_SIZE = 9;

// --- 駒の漢字表示マップ ---
export const PIECE_KANJI: Record<AnyPieceKind, string> = {
  king: '王',
  rook: '飛',
  bishop: '角',
  gold: '金',
  silver: '銀',
  knight: '桂',
  lance: '香',
  pawn: '歩',
  promoted_rook: '龍',
  promoted_bishop: '馬',
  promoted_silver: '全',
  promoted_knight: '圭',
  promoted_lance: '杏',
  promoted_pawn: 'と',
};

// 後手の王は「玉」表示
export const PIECE_KANJI_GOTE_KING = '玉';

// --- 駒の価値テーブル（Bot用） ---
export const PIECE_VALUES: Record<AnyPieceKind, number> = {
  king: 10000,
  rook: 10,
  bishop: 8,
  gold: 6,
  silver: 5,
  knight: 4,
  lance: 3,
  pawn: 1,
  promoted_rook: 12,
  promoted_bishop: 10,
  promoted_silver: 6,
  promoted_knight: 6,
  promoted_lance: 6,
  promoted_pawn: 6,
};

// --- 成り変換マップ ---
export const PROMOTION_MAP: Partial<Record<AnyPieceKind, AnyPieceKind>> = {
  rook: 'promoted_rook',
  bishop: 'promoted_bishop',
  silver: 'promoted_silver',
  knight: 'promoted_knight',
  lance: 'promoted_lance',
  pawn: 'promoted_pawn',
};

// 成り駒 → 元の駒
export const UNPROMOTE_MAP: Partial<Record<AnyPieceKind, AnyPieceKind>> = {
  promoted_rook: 'rook',
  promoted_bishop: 'bishop',
  promoted_silver: 'silver',
  promoted_knight: 'knight',
  promoted_lance: 'lance',
  promoted_pawn: 'pawn',
};

// --- 移動パターン定義 ---

// 方向定数
const UP: Direction = { dr: -1, dc: 0 };
const DOWN: Direction = { dr: 1, dc: 0 };
const LEFT: Direction = { dr: 0, dc: -1 };
const RIGHT: Direction = { dr: 0, dc: 1 };
const UP_LEFT: Direction = { dr: -1, dc: -1 };
const UP_RIGHT: Direction = { dr: -1, dc: 1 };
const DOWN_LEFT: Direction = { dr: 1, dc: -1 };
const DOWN_RIGHT: Direction = { dr: 1, dc: 1 };

// 全8方向
const ALL_DIRECTIONS: Direction[] = [
  UP, DOWN, LEFT, RIGHT, UP_LEFT, UP_RIGHT, DOWN_LEFT, DOWN_RIGHT,
];

// 金将の動き（先手基準）
const GOLD_OFFSETS: Direction[] = [
  UP, UP_LEFT, UP_RIGHT, LEFT, RIGHT, DOWN,
];

/**
 * 駒の移動パターン（先手基準）
 * 後手の場合は dr を反転して使う
 */
export const MOVE_PATTERNS: Record<AnyPieceKind, MovePattern> = {
  king: {
    offsets: ALL_DIRECTIONS,
    slides: [],
  },
  gold: {
    offsets: GOLD_OFFSETS,
    slides: [],
  },
  silver: {
    offsets: [UP, UP_LEFT, UP_RIGHT, DOWN_LEFT, DOWN_RIGHT],
    slides: [],
  },
  knight: {
    offsets: [
      { dr: -2, dc: -1 },
      { dr: -2, dc: 1 },
    ],
    slides: [],
  },
  lance: {
    offsets: [],
    slides: [UP],
  },
  pawn: {
    offsets: [UP],
    slides: [],
  },
  rook: {
    offsets: [],
    slides: [UP, DOWN, LEFT, RIGHT],
  },
  bishop: {
    offsets: [],
    slides: [UP_LEFT, UP_RIGHT, DOWN_LEFT, DOWN_RIGHT],
  },
  promoted_rook: {
    offsets: [UP_LEFT, UP_RIGHT, DOWN_LEFT, DOWN_RIGHT],
    slides: [UP, DOWN, LEFT, RIGHT],
  },
  promoted_bishop: {
    offsets: [UP, DOWN, LEFT, RIGHT],
    slides: [UP_LEFT, UP_RIGHT, DOWN_LEFT, DOWN_RIGHT],
  },
  // 成銀・成桂・成香・と金 → 金将と同じ
  promoted_silver: { offsets: GOLD_OFFSETS, slides: [] },
  promoted_knight: { offsets: GOLD_OFFSETS, slides: [] },
  promoted_lance: { offsets: GOLD_OFFSETS, slides: [] },
  promoted_pawn: { offsets: GOLD_OFFSETS, slides: [] },
};

// --- 初期配置 ---

function p(kind: AnyPieceKind, owner: 'sente' | 'gote'): Piece {
  return { kind, owner };
}

/**
 * 初期盤面を生成
 * board[row][col]
 * row=0 が上側（後手陣）, row=8 が下側（先手陣）
 */
export function createInitialBoard(): Board {
  const board: Board = Array.from({ length: 9 }, () =>
    Array.from({ length: 9 }, () => null)
  );

  // 後手陣（row 0-2）
  // row 0: 香桂銀金王金銀桂香
  board[0][0] = p('lance', 'gote');
  board[0][1] = p('knight', 'gote');
  board[0][2] = p('silver', 'gote');
  board[0][3] = p('gold', 'gote');
  board[0][4] = p('king', 'gote');
  board[0][5] = p('gold', 'gote');
  board[0][6] = p('silver', 'gote');
  board[0][7] = p('knight', 'gote');
  board[0][8] = p('lance', 'gote');

  // row 1: _飛_____角_
  board[1][1] = p('rook', 'gote');
  board[1][7] = p('bishop', 'gote');

  // row 2: 歩歩歩歩歩歩歩歩歩
  for (let c = 0; c < 9; c++) {
    board[2][c] = p('pawn', 'gote');
  }

  // 先手陣（row 6-8）
  // row 6: 歩歩歩歩歩歩歩歩歩
  for (let c = 0; c < 9; c++) {
    board[6][c] = p('pawn', 'sente');
  }

  // row 7: _角_____飛_
  board[7][1] = p('bishop', 'sente');
  board[7][7] = p('rook', 'sente');

  // row 8: 香桂銀金王金銀桂香
  board[8][0] = p('lance', 'sente');
  board[8][1] = p('knight', 'sente');
  board[8][2] = p('silver', 'sente');
  board[8][3] = p('gold', 'sente');
  board[8][4] = p('king', 'sente');
  board[8][5] = p('gold', 'sente');
  board[8][6] = p('silver', 'sente');
  board[8][7] = p('knight', 'sente');
  board[8][8] = p('lance', 'sente');

  return board;
}

// --- 空の持ち駒 ---

export function createEmptyHand(): Hand {
  return {
    rook: 0,
    bishop: 0,
    gold: 0,
    silver: 0,
    knight: 0,
    lance: 0,
    pawn: 0,
  };
}

// --- 初期ゲーム状態 ---

export function createInitialGameState(
  gameMode: 'pvp' | 'pvbot' = 'pvbot',
  casualMode: boolean = true,
  botPlayer: 'sente' | 'gote' = 'gote',
  botLevel: BotLevel = 'normal'
): GameState {
  const isBot = gameMode === 'pvbot';

  return {
    board: createInitialBoard(),
    currentPlayer: 'sente',
    turn: 1,
    // PvPなら初手はPASS_DEVICE不要（先手が最初から操作）
    // 初手は直接PITFALL_PLACEMENTから開始
    phase: { type: 'PITFALL_PLACEMENT' },
    pitfalls: { sente: null, gote: null },
    pendingPitfall: null,
    lastPitfallPositionByPlayer: { sente: null, gote: null },
    hands: {
      sente: createEmptyHand(),
      gote: createEmptyHand(),
    },
    log: [],
    config: {
      casualMode,
      gameMode,
      botLevel,
      botPlayer: isBot ? botPlayer : undefined,
    },
    winner: null,
  };
}
