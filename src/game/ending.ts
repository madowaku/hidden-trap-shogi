// =============================================
// Pitfall Shogi — 決着の振り返り
// =============================================
//
// 終局したログを初期局面から並べ直し、「負けた側の最後の手番で何が起きたか」を説明する。
// 研究用の分類（scripts/research/variant-rules.mjs の classifyEnding）と同じ考え方:
//   受け = 指した後に相手が王を取れない手。受けの「着地点」の数が罠ゲームの選択肢の数。

import type { Board, GameAction, Hand, LogEntry, PieceKind, Player, Position, PublicLogEntry } from './types';
import {
  applyDrop,
  applyMove,
  getAllLegalMoves,
  getLegalDrops,
  getOpponent,
  getUnpromotedKind,
  isPlayerInCheck,
  posEquals,
} from './board';
import { BOARD_SIZE, createEmptyHand, createInitialBoard } from './constants';

const KANJI_ROWS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 7六 のような表記 */
export function formatSquare(position: Position): string {
  return `${BOARD_SIZE - position.col}${KANJI_ROWS[position.row]}`;
}

export type EndingKind =
  /** 王手の受けが 2 か所以上あり、受けを選んだのに罠で潰された（A の王手ルーレット） */
  | 'roulette'
  /** 受けが 1 か所しかなく、そこに罠を置かれた（実質の詰み） */
  | 'trapMate'
  /** C: 罠で指し直したが、残りの受けを選べなかった */
  | 'rescueFailed'
  /** 受けのない王手（詰み） */
  | 'mate'
  /** 受けがあったのに、受けにならない手を指した */
  | 'missedDefense'
  /** 王手ではなかったのに、王が取られる形にした */
  | 'selfExposure'
  | 'resign';

export type EndingExplanation = {
  readonly kind: EndingKind;
  readonly winner: Player;
  readonly loser: Player;
  /** 決着までの手数（ログの件数） */
  readonly plies: number;
  /** 負けた側の最後の手番が王手だったか */
  readonly loserWasInCheck: boolean;
  /** 王手の受けになる着地点（負けた側の最後の手番） */
  readonly defenseSquares: readonly Position[];
  /** 罠にかかったマス（あれば） */
  readonly trapSquare: Position | null;
  /** 負けた側が最初に選んだ手の着地点 */
  readonly attemptedSquare: Position | null;
  /** C: 指し直した手の着地点 */
  readonly retrySquare: Position | null;
};

type Replay = { board: Board; hands: Record<Player, Hand> };

const HAND_KINDS: readonly Exclude<PieceKind, 'king'>[] = ['rook', 'bishop', 'gold', 'silver', 'knight', 'lance', 'pawn'];

function applyAction(replay: Replay, player: Player, action: GameAction): Replay {
  if (action.type === 'drop') {
    const kind = action.piece.kind as Exclude<PieceKind, 'king'>;
    const hand = { ...replay.hands[player], [kind]: replay.hands[player][kind] - 1 };
    return { board: applyDrop(replay.board, action), hands: { ...replay.hands, [player]: hand } };
  }
  const captured = replay.board[action.to.row][action.to.col];
  let hands = replay.hands;
  if (captured && captured.kind !== 'king') {
    const kind = getUnpromotedKind(captured.kind) as Exclude<PieceKind, 'king'>;
    hands = { ...hands, [player]: { ...hands[player], [kind]: hands[player][kind] + 1 } };
  }
  return { board: applyMove(replay.board, action), hands };
}

/** 王手されている側の「受けになる手」の着地点 */
export function findDefenseSquares(board: Board, hand: Hand, player: Player): Position[] {
  const moves = getAllLegalMoves(board, player).map(move => ({ to: move.to, after: applyMove(board, move) }));
  const drops = HAND_KINDS
    .filter(kind => hand[kind] > 0)
    .flatMap(kind => getLegalDrops(board, player, kind).map(to => ({
      to,
      after: applyDrop(board, { type: 'drop', to, piece: { kind, owner: player } }),
    })));
  return [...moves, ...drops]
    .filter(candidate => !isPlayerInCheck(candidate.after, player))
    .map(candidate => candidate.to)
    .filter((to, index, all) => all.findIndex(other => posEquals(other, to)) === index);
}

function isAmong(squares: readonly Position[], square: Position | null | undefined): boolean {
  return Boolean(square && squares.some(candidate => posEquals(candidate, square)));
}

export function explainEnding(
  log: readonly (LogEntry | PublicLogEntry)[],
  winner: Player
): EndingExplanation {
  const loser = getOpponent(winner);
  type Walk = { replay: Replay; before: Replay | null; lastLoserEntry: LogEntry | PublicLogEntry | null };
  const initial: Walk = {
    replay: { board: createInitialBoard(), hands: { sente: createEmptyHand(), gote: createEmptyHand() } },
    before: null,
    lastLoserEntry: null,
  };
  const { before, lastLoserEntry } = log.reduce<Walk>((walk, entry) => ({
    replay: entry.action ? applyAction(walk.replay, entry.player, entry.action) : walk.replay,
    before: entry.player === loser ? walk.replay : walk.before,
    lastLoserEntry: entry.player === loser ? entry : walk.lastLoserEntry,
  }), initial);

  const last = log.at(-1);
  const kingCaptured = last?.player === winner && last.action?.type === 'move' && last.action.captured?.kind === 'king';
  const base = {
    winner,
    loser,
    plies: log.length,
    loserWasInCheck: false,
    defenseSquares: [] as Position[],
    trapSquare: null,
    attemptedSquare: null,
    retrySquare: null,
  };
  if (!kingCaptured || !before || !lastLoserEntry) return { ...base, kind: 'resign' };

  const entry = lastLoserEntry;
  const attempted = entry.failedAction ?? entry.action;
  const trapSquare = entry.pitfallTriggered ? entry.triggeredPitfall ?? attempted?.to ?? null : null;
  const retrySquare = entry.rescued ? entry.action?.to ?? null : null;
  const inCheck = isPlayerInCheck(before.board, loser);
  const detail = {
    ...base,
    loserWasInCheck: inCheck,
    trapSquare,
    attemptedSquare: attempted?.to ?? null,
    retrySquare,
  };
  if (!inCheck) return { ...detail, kind: 'selfExposure' };

  const defenseSquares = findDefenseSquares(before.board, before.hands[loser], loser);
  const withDefenses = { ...detail, defenseSquares };
  if (defenseSquares.length === 0) return { ...withDefenses, kind: 'mate' };
  if (entry.rescued) {
    return { ...withDefenses, kind: defenseSquares.length === 1 ? 'trapMate' : 'rescueFailed' };
  }
  if (entry.pitfallTriggered && isAmong(defenseSquares, attempted?.to)) {
    return { ...withDefenses, kind: defenseSquares.length === 1 ? 'trapMate' : 'roulette' };
  }
  return { ...withDefenses, kind: 'missedDefense' };
}
