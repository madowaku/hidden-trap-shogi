import { canPromote, getAllLegalMoves, getLegalDrops, getOpponent, posEquals } from './board';
import { BOARD_SIZE, PIECE_VALUES } from './constants';
import type { AnyPieceKind, GameAction, GameView, PieceKind, Player, Position } from './types';

export type SearchOptions = {
  readonly depth?: number;
  readonly maxCandidates?: number;
  readonly timeMs?: number;
};

export type EngineCandidate = {
  readonly action: GameAction;
  readonly to: Position;
  readonly shogiScore: number;
  readonly trapRisk: number;
  readonly finalScore: number;
};

export type SearchEngine = {
  analyze(view: GameView, options?: SearchOptions): readonly EngineCandidate[];
};

export function createNoopSearchEngine(): SearchEngine {
  return {
    analyze: () => [],
  };
}

export function createStaticSearchEngine(candidates: readonly EngineCandidate[]): SearchEngine {
  return {
    analyze: (_view, options = {}) => applyCandidateLimit(candidates, options.maxCandidates),
  };
}

export function createShallowSearchEngine(): SearchEngine {
  return {
    analyze(view, options = {}) {
      const player = view.currentPlayer;
      const candidates = getViewCandidateActions(view, player)
        .map(action => scoreAction(view, player, action, options.depth ?? 1))
        .sort((a, b) => (
          b.finalScore - a.finalScore
          || b.shogiScore - a.shogiScore
          || a.to.row - b.to.row
          || a.to.col - b.to.col
        ));

      return applyCandidateLimit(candidates, options.maxCandidates);
    },
  };
}

const HAND_PIECES: Exclude<PieceKind, 'king'>[] = [
  'rook',
  'bishop',
  'gold',
  'silver',
  'knight',
  'lance',
  'pawn',
];

function getViewCandidateActions(view: GameView, player: Player): GameAction[] {
  const moves = getAllLegalMoves(view.board, player);
  const drops: GameAction[] = [];
  const hand = view.hands[player];

  for (const kind of HAND_PIECES) {
    if (hand[kind] <= 0) continue;
    for (const to of getLegalDrops(view.board, player, kind)) {
      drops.push({
        type: 'drop',
        to,
        piece: { kind, owner: player },
      });
    }
  }

  return [...moves, ...drops];
}

function scoreAction(view: GameView, player: Player, action: GameAction, depth: number): EngineCandidate {
  const capturedPiece = action.type === 'move' ? view.board[action.to.row][action.to.col] : null;
  const captureScore = capturedPiece && capturedPiece.owner !== player
    ? PIECE_VALUES[capturedPiece.kind] * 100
    : 0;
  const promotionScore = action.type === 'move' && canPromote(action.piece, action.from, action.to)
    ? promotionBonus(action.piece.kind)
    : 0;
  const dropScore = action.type === 'drop' ? PIECE_VALUES[action.piece.kind] * 6 : 0;
  const centralityScore = scoreCentrality(action.to);
  const shogiScore = captureScore + promotionScore + dropScore + centralityScore;
  const trapRisk = view.visiblePitfalls.some(pit => posEquals(pit.position, action.to)) ? 1000 : 0;
  const replyPenalty = depth >= 2 ? estimateReplyPenalty(view, player, action) : 0;
  const finalScore = shogiScore - trapRisk - replyPenalty;

  return {
    action,
    to: action.to,
    shogiScore,
    trapRisk,
    finalScore,
  };
}

function promotionBonus(kind: AnyPieceKind): number {
  if (kind === 'rook' || kind === 'bishop') return 90;
  if (kind === 'silver' || kind === 'knight' || kind === 'lance' || kind === 'pawn') return 45;
  return 0;
}

function scoreCentrality(pos: Position): number {
  const center = (BOARD_SIZE - 1) / 2;
  const distance = Math.abs(pos.row - center) + Math.abs(pos.col - center);
  return Math.max(0, 12 - distance * 2);
}

function estimateReplyPenalty(view: GameView, player: Player, action: GameAction): number {
  const nextBoard = view.board.map(row => row.slice());

  if (action.type === 'move') {
    nextBoard[action.from.row][action.from.col] = null;
  }
  nextBoard[action.to.row][action.to.col] = action.piece;

  const replyView: GameView = {
    ...view,
    board: nextBoard,
    currentPlayer: getOpponent(player),
  };

  const bestReply = getViewCandidateActions(replyView, replyView.currentPlayer)
    .map(reply => scoreAction(replyView, replyView.currentPlayer, reply, 1).shogiScore)
    .sort((a, b) => b - a)[0] ?? 0;

  return bestReply * 0.25;
}

function applyCandidateLimit(
  candidates: readonly EngineCandidate[],
  maxCandidates: number | undefined
): readonly EngineCandidate[] {
  if (maxCandidates === undefined) return candidates;
  return candidates.slice(0, Math.max(0, maxCandidates));
}
