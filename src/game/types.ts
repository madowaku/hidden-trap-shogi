// =============================================
// Pitfall Shogi — Core Type Definitions
// =============================================

// --- 基本型 ---

export type Player = 'sente' | 'gote';

/** 盤面座標 (0-indexed, row=段, col=筋) */
export type Position = {
  readonly row: number; // 0(一段目/上) ~ 8(九段目/下)
  readonly col: number; // 0(9筋/左) ~ 8(1筋/右)
};

// --- 駒 ---

export type PieceKind =
  | 'king'
  | 'rook'
  | 'bishop'
  | 'gold'
  | 'silver'
  | 'knight'
  | 'lance'
  | 'pawn';

export type PromotedPieceKind =
  | 'promoted_rook'
  | 'promoted_bishop'
  | 'promoted_silver'
  | 'promoted_knight'
  | 'promoted_lance'
  | 'promoted_pawn';

export type AnyPieceKind = PieceKind | PromotedPieceKind;

export type Piece = {
  readonly kind: AnyPieceKind;
  readonly owner: Player;
};

// --- 盤面 ---

export type BoardCell = Piece | null;

/** board[row][col] — 9×9 */
export type Board = BoardCell[][];

// --- 持ち駒 ---

/** 持ち駒 (king以外の駒種ごとの枚数) */
export type Hand = Record<Exclude<PieceKind, 'king'>, number>;

// --- 落とし穴 ---

export type Pitfall = {
  readonly position: Position;
  readonly owner: Player; // 設置者
};

// --- 手 ---

export type MoveAction = {
  readonly type: 'move';
  readonly from: Position;
  readonly to: Position;
  readonly piece: Piece;
  readonly promote?: boolean;
  readonly captured?: Piece | null;
};

export type DropAction = {
  readonly type: 'drop';
  readonly to: Position;
  readonly piece: Piece;
};

export type GameAction = MoveAction | DropAction;

// --- フェーズ ---

export type Phase =
  | { type: 'PASS_DEVICE' }
  | { type: 'PITFALL_PLACEMENT' }
  | { type: 'MOVE_SELECTION' }
  | { type: 'PROMOTION_DECISION'; move: MoveAction }
  | { type: 'GAME_OVER'; winner: Player };

// --- ログ ---

export type LogEntry = {
  readonly turn: number;
  readonly player: Player;
  readonly action: GameAction | null; // null = 落とし穴で無効化された
  readonly pitfallSet: Position; // このターンで設置した落とし穴
  readonly pitfallTriggered: boolean; // 相手の落とし穴が発動したか
  readonly failedAction?: GameAction; // 罠で無効化された手
  readonly triggeredPitfall?: Position; // 発動した相手の落とし穴位置
  readonly revealedPitfall?: Position; // Casualモード: 公開された相手の落とし穴位置
};

// --- ゲーム設定 ---

export type GameMode = 'pvp' | 'pvbot';
export type BotLevel = 'easy' | 'normal' | 'hard';

export type GameConfig = {
  readonly casualMode: boolean;
  readonly gameMode: GameMode;
  readonly botLevel: BotLevel;
  readonly botPlayer?: Player; // PvBotモードでBotが担当する側
};

// --- ゲーム状態 ---

export type GameState = {
  readonly board: Board;
  readonly currentPlayer: Player;
  readonly turn: number;
  readonly phase: Phase;

  /**
   * 各プレイヤーが設置した「相手の次ターン用」落とし穴。
   * sente: 先手が設置 → 後手のターンで有効
   * gote:  後手が設置 → 先手のターンで有効
   */
  readonly pitfalls: {
    readonly sente: Pitfall | null;
    readonly gote: Pitfall | null;
  };

  /**
   * 現ターンで設置した落とし穴（次の相手ターンで有効化される）。
   * PITFALL_PLACEMENT → MOVE_SELECTION 遷移時に設定。
   * TURN_END 処理で pitfalls[currentPlayer] に移動。
   */
  readonly pendingPitfall: Pitfall | null;

  /**
   * 直前に各プレイヤーが設置した落とし穴。
   * 同じプレイヤーの次回罠設置で同じマスを禁止するための内部状態。
   */
  readonly lastPitfallPositionByPlayer: {
    readonly sente: Position | null;
    readonly gote: Position | null;
  };

  /** 持ち駒 */
  readonly hands: {
    readonly sente: Hand;
    readonly gote: Hand;
  };

  /** 対局ログ */
  readonly log: LogEntry[];

  /** ゲーム設定 */
  readonly config: GameConfig;

  /** 勝者（GAME_OVER時のみ） */
  readonly winner: Player | null;
};

export type Viewer = Player | 'spectator';

export type RoomPresence = {
  readonly players: number;
  readonly playerCapacity: 2;
  readonly spectators: number;
  readonly seats: {
    readonly sente: boolean;
    readonly gote: boolean;
  };
};

export type MatchStats = {
  readonly trapsSet: number;
  readonly trapsTriggeredByMe: number;
  readonly trapsITriggered: number;
  readonly trapHitRate: number;
};

export type GameView = {
  readonly viewer: Viewer;
  readonly board: Board;
  readonly currentPlayer: Player;
  readonly turn: number;
  readonly phase: Phase;
  readonly visiblePitfalls: Pitfall[];
  readonly hands: {
    readonly sente: Hand;
    readonly gote: Hand;
  };
  readonly log: LogEntry[];
  readonly config: GameConfig;
  readonly winner: Player | null;
  readonly roomPresence?: RoomPresence;
  readonly matchStats?: MatchStats;
};

// --- UI関連の型 ---

/** UI側で管理する選択状態 */
export type UISelection =
  | { type: 'none' }
  | { type: 'piece'; position: Position; legalMoves: Position[] }
  | { type: 'hand_piece'; pieceKind: PieceKind; legalDrops: Position[] };

// --- Bot ---

export interface BotStrategy {
  decidePitfall(state: GameState, player: Player, level: BotLevel): Position;
  decideMove(state: GameState, player: Player, level: BotLevel): GameAction;
}

export type TrapRiskEntry = {
  readonly position: Position;
  readonly trapRisk: number;
  readonly reasons: readonly string[];
};

export type TrapBelief = {
  readonly player: Player;
  readonly risks: readonly TrapRiskEntry[];
};

export type BotMoveDebugSummary = {
  readonly action: GameAction;
  readonly to: Position;
  readonly score: number;
  readonly trapRisk: number;
  readonly trapPenalty: number;
};

export type OpponentTrapTendency = {
  readonly observedTrapCount: number;
  readonly captureBias: number;
  readonly promotionBias: number;
  readonly kingAreaBias: number;
};

// --- ユーティリティ型 ---

export type Direction = {
  readonly dr: number;
  readonly dc: number;
};

export type MovePattern = {
  readonly offsets: Direction[]; // 1マス移動
  readonly slides: Direction[]; // 直線移動（飛車・角・香車）
};
