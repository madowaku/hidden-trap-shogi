// =============================================
// Pitfall Shogi — Mind Game Engine
// =============================================
//
// 罠の読み合いを「同時手番ゲーム」として解くBot用エンジン。
//
// 各ターンの構造:
//   - 罠を置く側は 1 マスを選ぶ
//   - 指す側は着地点を選ぶ
//   - 着地点 = 罠マスなら手は失敗し、手番だけ消費する（＝パスと同じ）
//
// 指す側の着地点 i の価値を v_i、失敗した時の価値を p とすると、これは
// ゼロ和の行列ゲームになり、混合戦略の均衡が閉じた形で求まる:
//   - 罠側は「おいしい手」ほど高い確率で罠を置く        q_i = (v_i - u) / (v_i - p)
//   - 指す側は「おいしい手」ほど低い確率で指す          x_i ∝ 1 / (v_i - p)
// これが「取れるけど罠かもしれない」葛藤の数理的な正体になる。
//
// 非公開情報ポリシー:
//   このファイルは GameView だけを入力にする。相手の未公開罠は読まない。
//   ログから使うのは「公開・発動済みの相手罠」と「自分が置いた罠」だけ。

import type { AnyPieceKind, GameAction, GameView, Piece, Player, Position, PublicLogEntry } from './types';
import { createInitialBoard } from './constants';

// --- 内部表現 ---------------------------------------------------------------

const SIZE = 9;
const SQUARES = 81;

const PAWN = 1;
const LANCE = 2;
const KNIGHT = 3;
const KING = 8;

const KIND_CODE: Record<AnyPieceKind, number> = {
  pawn: 1,
  lance: 2,
  knight: 3,
  silver: 4,
  gold: 5,
  bishop: 6,
  rook: 7,
  king: 8,
  promoted_pawn: 9,
  promoted_lance: 10,
  promoted_knight: 11,
  promoted_silver: 12,
  promoted_bishop: 13,
  promoted_rook: 14,
};

const CODE_KIND: AnyPieceKind[] = [
  'pawn', // 0 は未使用
  'pawn',
  'lance',
  'knight',
  'silver',
  'gold',
  'bishop',
  'rook',
  'king',
  'promoted_pawn',
  'promoted_lance',
  'promoted_knight',
  'promoted_silver',
  'promoted_bishop',
  'promoted_rook',
];

const PROMOTE_TO = [0, 9, 10, 11, 12, 0, 13, 14, 0, 0, 0, 0, 0, 0, 0];
const UNPROMOTE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 6, 7];

/** 盤上の駒の価値（歩=100） */
const BOARD_VALUE = [0, 100, 300, 350, 500, 600, 800, 1000, 0, 600, 600, 600, 600, 1100, 1300];
/** 持ち駒の価値（どこにでも打てる分だけ少し高い） */
const HAND_VALUE = [0, 115, 330, 380, 540, 650, 900, 1100];
/** 取り合いで「攻め駒として失う価値」。王は取り返されると負けなので非常に高い */
const ATTACKER_VALUE = [0, 100, 300, 350, 500, 600, 800, 1000, 5000, 600, 600, 600, 600, 1100, 1300];

type Dir = readonly [number, number];
const ORTH: Dir[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAG: Dir[] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const GOLD_STEPS: Dir[] = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]];
const NO_DIRS: Dir[] = [];

/** 先手基準の 1 マス移動 */
const STEP_DIRS: Dir[][] = [
  NO_DIRS,
  [[-1, 0]],
  NO_DIRS,
  [[-2, -1], [-2, 1]],
  [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 1]],
  GOLD_STEPS,
  NO_DIRS,
  NO_DIRS,
  [...ORTH, ...DIAG],
  GOLD_STEPS,
  GOLD_STEPS,
  GOLD_STEPS,
  GOLD_STEPS,
  ORTH,
  DIAG,
];

/** 先手基準の直線移動 */
const SLIDE_DIRS: Dir[][] = [
  NO_DIRS,
  NO_DIRS,
  [[-1, 0]],
  NO_DIRS,
  NO_DIRS,
  NO_DIRS,
  DIAG,
  ORTH,
  NO_DIRS,
  NO_DIRS,
  NO_DIRS,
  NO_DIRS,
  NO_DIRS,
  DIAG,
  ORTH,
];

/** side: +1 = 先手, -1 = 後手。盤は正の値が先手の駒 */
type Side = 1 | -1;

type Pos = {
  readonly b: Int8Array;
  /** hands[0] = 先手, hands[1] = 後手。添字は駒コード 1..7 */
  readonly hands: [Int8Array, Int8Array];
};

const DROP_BASE = 81;

function encodeMove(from: number, to: number, promote: boolean): number {
  return from | (to << 7) | (promote ? 1 << 14 : 0);
}

function moveFrom(m: number): number {
  return m & 127;
}

function moveTo(m: number): number {
  return (m >> 7) & 127;
}

function sideOf(player: Player): Side {
  return player === 'sente' ? 1 : -1;
}

function handIndex(side: Side): 0 | 1 {
  return side === 1 ? 0 : 1;
}

function toSquare(position: Position): number {
  return position.row * SIZE + position.col;
}

function toPosition(square: number): Position {
  return { row: Math.floor(square / SIZE), col: square % SIZE };
}

function posFromView(view: GameView): Pos {
  const b = new Int8Array(SQUARES);
  for (let row = 0; row < SIZE; row++) {
    const cells = view.board[row];
    if (!cells) continue;
    for (let col = 0; col < SIZE; col++) {
      const piece = cells[col];
      if (!piece) continue;
      b[row * SIZE + col] = KIND_CODE[piece.kind] * sideOf(piece.owner);
    }
  }

  const hands: [Int8Array, Int8Array] = [new Int8Array(8), new Int8Array(8)];
  for (const player of ['sente', 'gote'] as const) {
    const hand = view.hands[player];
    const target = hands[handIndex(sideOf(player))];
    target[1] = hand.pawn;
    target[2] = hand.lance;
    target[3] = hand.knight;
    target[4] = hand.silver;
    target[5] = hand.gold;
    target[6] = hand.bishop;
    target[7] = hand.rook;
  }

  return { b, hands };
}

function findKingSquare(b: Int8Array, side: Side): number {
  const target = KING * side;
  for (let sq = 0; sq < SQUARES; sq++) {
    if (b[sq] === target) return sq;
  }
  return -1;
}

function inPromotionZone(side: Side, row: number): boolean {
  return side === 1 ? row <= 2 : row >= 6;
}

// --- 合法手生成（board.ts と同じ変則ルール: 自殺手の禁止なし、王取りで勝ち） ---

const DROPS_NONE = 0;
const DROPS_NEAR_KINGS = 1;
const DROPS_ALL = 2;

function generateMoves(pos: Pos, side: Side, dropMode: number, out: number[]): void {
  const b = pos.b;

  for (let sq = 0; sq < SQUARES; sq++) {
    const pc = b[sq];
    if (side === 1 ? pc <= 0 : pc >= 0) continue;
    const kind = side === 1 ? pc : -pc;
    const row = (sq / SIZE) | 0;
    const col = sq % SIZE;
    const promotable = PROMOTE_TO[kind] !== 0;
    const fromZone = promotable && inPromotionZone(side, row);

    const steps = STEP_DIRS[kind];
    for (let i = 0; i < steps.length; i++) {
      const nr = row + steps[i][0] * side;
      const nc = col + steps[i][1];
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
      const to = nr * SIZE + nc;
      const target = b[to];
      if (side === 1 ? target > 0 : target < 0) continue;
      out.push(encodeMove(sq, to, promotable && (fromZone || inPromotionZone(side, nr))));
    }

    const slides = SLIDE_DIRS[kind];
    for (let i = 0; i < slides.length; i++) {
      const dr = slides[i][0] * side;
      const dc = slides[i][1];
      let nr = row + dr;
      let nc = col + dc;
      while (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) {
        const to = nr * SIZE + nc;
        const target = b[to];
        if (side === 1 ? target > 0 : target < 0) break;
        out.push(encodeMove(sq, to, promotable && (fromZone || inPromotionZone(side, nr))));
        if (target !== 0) break;
        nr += dr;
        nc += dc;
      }
    }
  }

  if (dropMode === DROPS_NONE) return;

  const hand = pos.hands[handIndex(side)];
  let anyInHand = false;
  for (let kind = 1; kind <= 7; kind++) {
    if (hand[kind] > 0) {
      anyInHand = true;
      break;
    }
  }
  if (!anyInHand) return;

  let ownKing = -1;
  let enemyKing = -1;
  if (dropMode === DROPS_NEAR_KINGS) {
    ownKing = findKingSquare(b, side);
    enemyKing = findKingSquare(b, (-side) as Side);
  }

  // 二歩チェック用: 自分の歩がある筋
  let pawnCols = 0;
  if (hand[PAWN] > 0) {
    const ownPawn = PAWN * side;
    for (let sq = 0; sq < SQUARES; sq++) {
      if (b[sq] === ownPawn) pawnCols |= 1 << (sq % SIZE);
    }
  }

  for (let sq = 0; sq < SQUARES; sq++) {
    if (b[sq] !== 0) continue;
    const row = (sq / SIZE) | 0;
    const col = sq % SIZE;
    if (dropMode === DROPS_NEAR_KINGS && !isNear(sq, ownKing, 2) && !isNear(sq, enemyKing, 2)) continue;

    for (let kind = 1; kind <= 7; kind++) {
      if (hand[kind] <= 0) continue;
      if (kind === PAWN && (pawnCols & (1 << col)) !== 0) continue;
      // 行き場所のない駒は打てない
      const lastRow = side === 1 ? 0 : 8;
      if ((kind === PAWN || kind === LANCE) && row === lastRow) continue;
      if (kind === KNIGHT && (side === 1 ? row <= 1 : row >= 7)) continue;
      out.push(encodeMove(DROP_BASE + kind, sq, false));
    }
  }
}

function isNear(sq: number, center: number, radius: number): boolean {
  if (center < 0) return false;
  const dr = Math.abs(((sq / SIZE) | 0) - ((center / SIZE) | 0));
  const dc = Math.abs((sq % SIZE) - (center % SIZE));
  return dr <= radius && dc <= radius;
}

function makeMove(pos: Pos, m: number, side: Side): number {
  const b = pos.b;
  const from = moveFrom(m);
  const to = moveTo(m);
  const captured = b[to];
  const hand = pos.hands[handIndex(side)];

  if (from >= DROP_BASE) {
    const kind = from - DROP_BASE;
    b[to] = kind * side;
    hand[kind] -= 1;
  } else {
    let pc = b[from];
    b[from] = 0;
    if (m >> 14) pc = PROMOTE_TO[side === 1 ? pc : -pc] * side;
    b[to] = pc;
  }

  if (captured !== 0) {
    const base = UNPROMOTE[captured > 0 ? captured : -captured];
    if (base !== KING) hand[base] += 1;
  }
  return captured;
}

function unmakeMove(pos: Pos, m: number, side: Side, captured: number): void {
  const b = pos.b;
  const from = moveFrom(m);
  const to = moveTo(m);
  const hand = pos.hands[handIndex(side)];

  if (from >= DROP_BASE) {
    b[to] = 0;
    hand[from - DROP_BASE] += 1;
  } else {
    let pc = b[to];
    if (m >> 14) pc = UNPROMOTE[side === 1 ? pc : -pc] * side;
    b[from] = pc;
    b[to] = captured;
  }

  if (captured !== 0) {
    const base = UNPROMOTE[captured > 0 ? captured : -captured];
    if (base !== KING) hand[base] -= 1;
  }
}

// --- 静的評価 ---------------------------------------------------------------

const attackCount: [Uint8Array, Uint8Array] = [new Uint8Array(SQUARES), new Uint8Array(SQUARES)];
const attackMin: [Int16Array, Int16Array] = [new Int16Array(SQUARES), new Int16Array(SQUARES)];

function buildAttackMap(b: Int8Array, side: Side): number {
  const count = attackCount[handIndex(side)];
  const minValue = attackMin[handIndex(side)];
  count.fill(0);
  minValue.fill(32767);
  let total = 0;

  for (let sq = 0; sq < SQUARES; sq++) {
    const pc = b[sq];
    if (side === 1 ? pc <= 0 : pc >= 0) continue;
    const kind = side === 1 ? pc : -pc;
    const value = ATTACKER_VALUE[kind];
    const row = (sq / SIZE) | 0;
    const col = sq % SIZE;

    const steps = STEP_DIRS[kind];
    for (let i = 0; i < steps.length; i++) {
      const nr = row + steps[i][0] * side;
      const nc = col + steps[i][1];
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
      const to = nr * SIZE + nc;
      count[to] += 1;
      if (value < minValue[to]) minValue[to] = value;
      total += 1;
    }

    const slides = SLIDE_DIRS[kind];
    for (let i = 0; i < slides.length; i++) {
      const dr = slides[i][0] * side;
      const dc = slides[i][1];
      let nr = row + dr;
      let nc = col + dc;
      while (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) {
        const to = nr * SIZE + nc;
        count[to] += 1;
        if (value < minValue[to]) minValue[to] = value;
        total += 1;
        if (b[to] !== 0) break;
        nr += dr;
        nc += dc;
      }
    }
  }
  return total;
}

const WIN = 1;
const EVAL_SCALE = 1800;
const gainBuffer: [number[], number[]] = [[], []];

/**
 * 罠ゲームの価値（失敗時の価値 0、全マス罠可能）の簡易版。
 * 取れる駒が 1 つだけなら罠で止められるので 0、両取りなら約半分…という
 * 「両取りこそが本当の脅威」というこのゲーム特有の性質を静的評価に入れる。
 */
function forkValue(gains: number[]): number {
  if (gains.length < 2) return 0;
  gains.sort((a, c) => c - a);
  let inverseSum = 0;
  let value = 0;
  for (let k = 0; k < gains.length; k++) {
    inverseSum += 1 / gains[k];
    const u = k / inverseSum;
    const next = k + 1 < gains.length ? gains[k + 1] : 0;
    value = u;
    if (u >= next) break;
  }
  return value;
}

function kingDanger(b: Int8Array, kingSq: number, owner: Side): number {
  if (kingSq < 0) return 0;
  const enemy = attackCount[handIndex((-owner) as Side)];
  const row = (kingSq / SIZE) | 0;
  const col = kingSq % SIZE;
  let danger = 0;
  let escapes = 0;

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
      const sq = nr * SIZE + nc;
      const attacks = enemy[sq];
      if (attacks > 0) {
        danger += attacks > 2 ? 2 : attacks;
      } else {
        const pc = b[sq];
        if (owner === 1 ? pc <= 0 : pc >= 0) escapes += 1;
      }
    }
  }

  // 王手された時の「逃げ場の数」がそのまま生存率になるゲームなので、逃げ場の少なさを重く見る
  const cramped = escapes === 0 ? 140 : escapes === 1 ? 70 : escapes === 2 ? 25 : 0;
  return danger * 25 + cramped;
}

/**
 * 手番側から見た評価値を返す（[-1, 1]。1 = 勝ち）。
 * 返り値が NaN の時は「手番側が王手されている」ことを表し、呼び出し側が 1 手延長する。
 */
function evaluate(pos: Pos, side: Side): number {
  const b = pos.b;
  const mobilitySente = buildAttackMap(b, 1);
  const mobilityGote = buildAttackMap(b, -1);
  const mine = handIndex(side);
  const theirs = handIndex((-side) as Side);

  const kingSente = findKingSquare(b, 1);
  const kingGote = findKingSquare(b, -1);
  const myKing = side === 1 ? kingSente : kingGote;
  const theirKing = side === 1 ? kingGote : kingSente;

  if (theirKing >= 0 && attackCount[mine][theirKing] > 0) return WIN;
  if (myKing >= 0 && attackCount[theirs][myKing] > 0) return Number.NaN;

  let score = (mobilitySente - mobilityGote) * 2;
  const gainsSente = gainBuffer[0];
  const gainsGote = gainBuffer[1];
  gainsSente.length = 0;
  gainsGote.length = 0;

  for (let sq = 0; sq < SQUARES; sq++) {
    const pc = b[sq];
    if (pc === 0) continue;
    const owner: Side = pc > 0 ? 1 : -1;
    const kind = pc > 0 ? pc : -pc;
    if (kind === KING) continue;
    const value = BOARD_VALUE[kind];
    const row = (sq / SIZE) | 0;
    const advance = owner === 1 ? 8 - row : row;
    score += owner * (value + advance * 3);

    const ownerIndex = handIndex(owner);
    const enemyIndex = ownerIndex === 0 ? 1 : 0;
    if (attackCount[enemyIndex][sq] > 0) {
      const loss = attackCount[ownerIndex][sq] === 0
        ? value
        : value - attackMin[enemyIndex][sq];
      if (loss > 0) (owner === 1 ? gainsGote : gainsSente).push(loss);
    }
  }

  const handSente = pos.hands[0];
  const handGote = pos.hands[1];
  for (let kind = 1; kind <= 7; kind++) {
    score += (handSente[kind] - handGote[kind]) * HAND_VALUE[kind];
  }

  score -= kingDanger(b, kingSente, 1);
  score += kingDanger(b, kingGote, -1);

  let relative = side === 1 ? score : -score;

  // 手番側の脅威: 単独の取りは罠で 1 手止められる。両取りは止めきれない。
  const myGains = side === 1 ? gainsSente : gainsGote;
  const theirGains = side === 1 ? gainsGote : gainsSente;
  let myBest = 0;
  for (let i = 0; i < myGains.length; i++) if (myGains[i] > myBest) myBest = myGains[i];
  let theirBest = 0;
  for (let i = 0; i < theirGains.length; i++) if (theirGains[i] > theirBest) theirBest = theirGains[i];
  relative += myBest * 0.35 + forkValue(myGains) * 0.35;
  relative -= theirBest * 0.2;

  return Math.tanh(relative / EVAL_SCALE);
}

// --- 罠ゲームの均衡 ---------------------------------------------------------

export type TrapGameOption = {
  /** 指す側から見た、その着地点に進めた時の価値 */
  readonly value: number;
  /** false = 罠を置けない着地点（王取り、連続設置禁止のマスなど） */
  readonly trappable: boolean;
};

/** 安全な手があっても欲張る度合い（大きいほど慎重） */
const GAMBLE_SHARPNESS = 8;

export type TrapGameSolution = {
  /** 指す側から見たゲームの価値 */
  readonly value: number;
  /** 指す側が各着地点を選ぶ確率（合計 1） */
  readonly moverMix: number[];
  /** 罠側が各着地点に罠を置く確率（合計 1 以下。残りは「どこに置いてもよい」余り） */
  readonly trapMix: number[];
};

/**
 * 1 ターン分の罠ゲームを解く。
 *
 * 指す側は着地点 i を選び、罠側は 1 マスを選ぶ。
 * 一致すれば指す側は failValue、外れれば options[i].value を得る。
 */
export function solveTrapGame(
  options: readonly TrapGameOption[],
  failValue: number
): TrapGameSolution {
  const count = options.length;
  const moverMix = new Array<number>(count).fill(0);
  const trapMix = new Array<number>(count).fill(0);
  if (count === 0) return { value: failValue, moverMix, trapMix };

  let bestIndex = 0;
  let safeIndex = -1;
  for (let i = 0; i < count; i++) {
    if (options[i].value > options[bestIndex].value) bestIndex = i;
    if (!options[i].trappable && (safeIndex < 0 || options[i].value > options[safeIndex].value)) {
      safeIndex = i;
    }
  }

  const safeValue = safeIndex >= 0 ? options[safeIndex].value : Number.NEGATIVE_INFINITY;
  const floor = Math.max(failValue, safeValue);

  // 罠を置く意味があるのは「失敗させると指す側が損をする」着地点だけ
  const contested: number[] = [];
  for (let i = 0; i < count; i++) {
    if (options[i].trappable && options[i].value > floor) contested.push(i);
  }

  if (contested.length === 0) {
    // 罠では止められない。指す側は最善手をそのまま指す。
    moverMix[bestIndex] = 1;
    return { value: options[bestIndex].value, moverMix, trapMix };
  }

  contested.sort((a, c) => options[c].value - options[a].value || a - c);

  let weightedSum = 0;
  let inverseSum = 0;
  let support = contested.length;
  let value = floor;

  for (let k = 0; k < contested.length; k++) {
    const gap = options[contested[k]].value - failValue;
    weightedSum += options[contested[k]].value / gap;
    inverseSum += 1 / gap;
    const u = (weightedSum - 1) / inverseSum;
    const next = k + 1 < contested.length ? options[contested[k + 1]].value : Number.NEGATIVE_INFINITY;
    if (u >= next) {
      support = k + 1;
      value = u;
      break;
    }
  }

  if (value <= floor) {
    // 罠側に余裕がある: 全部の「おいしい手」を十分な確率で塞いでも余る。
    value = floor;
    for (const index of contested) {
      const v = options[index].value;
      trapMix[index] = (v - floor) / (v - failValue);
    }
    const top = contested[0];
    if (safeIndex >= 0 && safeValue >= failValue) {
      // 均衡では安全な手だけを指すのが正解だが、失うものが小さい時は
      // 「相手が罠を置き損ねている」ことに賭けて、おいしい手にも手を出す。
      const risk = (safeValue - failValue) / (options[top].value - failValue);
      const gamble = Math.pow(1 - risk, GAMBLE_SHARPNESS);
      moverMix[top] = gamble;
      moverMix[safeIndex] += 1 - gamble;
    } else {
      // おいしい手が 1 つだけ。罠側が読み違えることに賭けて指す。
      moverMix[top] = 1;
    }
    return { value, moverMix, trapMix };
  }

  let normalizer = 0;
  for (let k = 0; k < support; k++) {
    normalizer += 1 / (options[contested[k]].value - failValue);
  }
  for (let k = 0; k < support; k++) {
    const index = contested[k];
    const v = options[index].value;
    trapMix[index] = (v - value) / (v - failValue);
    moverMix[index] = 1 / (v - failValue) / normalizer;
  }

  return { value, moverMix, trapMix };
}

// 探索内部用: 価値だけを返す高速版（solveTrapGame と同じ値になる）
const scratchValues = new Float64Array(SQUARES);

function trapGameValue(bestByTo: Float64Array, failValue: number, safeValue: number): number {
  let best = safeValue;
  let n = 0;
  for (let sq = 0; sq < SQUARES; sq++) {
    const v = bestByTo[sq];
    if (v <= -2) continue;
    if (v > best) best = v;
    scratchValues[n++] = v;
  }
  if (best <= -2) return failValue;

  const floor = failValue > safeValue ? failValue : safeValue;
  let m = 0;
  for (let i = 0; i < n; i++) {
    if (scratchValues[i] > floor) scratchValues[m++] = scratchValues[i];
  }
  if (m === 0) return best;

  const contested = scratchValues.subarray(0, m);
  contested.sort();

  let weightedSum = 0;
  let inverseSum = 0;
  for (let k = m - 1; k >= 0; k--) {
    const v = contested[k];
    const gap = v - failValue;
    weightedSum += v / gap;
    inverseSum += 1 / gap;
    const u = (weightedSum - 1) / inverseSum;
    const next = k > 0 ? contested[k - 1] : -2;
    if (u >= next) return u > floor ? u : floor;
  }
  return floor;
}

/**
 * 研究用（C）: 王手の応手が罠で失敗しても、罠を見てから指し直せる時の価値。
 * 罠側は一番おいしい着地点に罠を置くのが最善で、指す側は 2 番目に良い手で受ける。
 */
function retryGameValue(bestByTo: Float64Array, failValue: number, safeValue: number): number {
  let top = -2;
  let second = -2;
  for (let sq = 0; sq < SQUARES; sq++) {
    const v = bestByTo[sq];
    if (v <= -2) continue;
    if (v > top) {
      second = top;
      top = v;
    } else if (v > second) {
      second = v;
    }
  }
  if (top <= -2) return safeValue > -2 ? safeValue : failValue;
  if (safeValue >= top) return safeValue;
  const rest = second > safeValue ? second : safeValue;
  return rest > -2 ? rest : failValue;
}

/** solveTrapGame の C 版（王手中の指し直しあり） */
export function solveRetryGame(
  options: readonly TrapGameOption[],
  failValue: number
): TrapGameSolution {
  const count = options.length;
  const moverMix = new Array<number>(count).fill(0);
  const trapMix = new Array<number>(count).fill(0);
  if (count === 0) return { value: failValue, moverMix, trapMix };

  let top = 0;
  for (let i = 1; i < count; i++) {
    if (options[i].value > options[top].value) top = i;
  }
  moverMix[top] = 1;
  if (!options[top].trappable) return { value: options[top].value, moverMix, trapMix };

  trapMix[top] = 1;
  let rest = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < count; i++) {
    if (i !== top && options[i].value > rest) rest = options[i].value;
  }
  return { value: Number.isFinite(rest) ? rest : failValue, moverMix, trapMix };
}

// --- 罠を織り込んだ探索 -----------------------------------------------------

const MAX_PLY = 5;

// --- 研究用: 罠ルールの変種 ---------------------------------------------------
//
// アプリは常に 'standard'（現行ルール）で動く。ほかは scripts/research の比較実験専用で、
// reducer には入っていない（ルールの適用は scripts/research/variant-rules.mjs）。

export type TrapRuleVariant =
  /** A: 現行ルール */
  | 'standard'
  /** B: 王の移動は罠にかからない */
  | 'kingImmune'
  /** C: 王手されている時の応手が罠で失敗したら、罠を見てから指し直せる */
  | 'checkRetry'
  /** D: 王手をかけた手番に置いた罠は無効（王手された側には罠がない） */
  | 'checkVoidsTrap';

type RuleFlags = {
  readonly kingImmune: boolean;
  readonly checkRetry: boolean;
  readonly checkVoids: boolean;
};

const RULE_FLAGS: Record<TrapRuleVariant, RuleFlags> = {
  standard: { kingImmune: false, checkRetry: false, checkVoids: false },
  kingImmune: { kingImmune: true, checkRetry: false, checkVoids: false },
  checkRetry: { kingImmune: false, checkRetry: true, checkVoids: false },
  checkVoidsTrap: { kingImmune: false, checkRetry: false, checkVoids: true },
};

function needsCheckTest(rules: RuleFlags): boolean {
  return rules.checkRetry || rules.checkVoids;
}

/** side の王が相手の駒に当たっているか */
function isInCheck(b: Int8Array, side: Side): boolean {
  const king = findKingSquare(b, side);
  if (king < 0) return false;
  const enemy = (-side) as Side;
  buildAttackMap(b, enemy);
  return attackCount[handIndex(enemy)][king] > 0;
}

/** makeMove の前に呼ぶ */
function isKingMove(b: Int8Array, m: number): boolean {
  const from = moveFrom(m);
  return from < DROP_BASE && (b[from] === KING || b[from] === -KING);
}

type SearchContext = {
  /** ply ごとの「罠を置けないと分かっているマス」。-1 = なし */
  readonly safeSquareByPly: number[];
  readonly rules: RuleFlags;
  nodes: number;
};

/**
 * 手番側から見た局面の価値。
 * 通常の minimax の「最大値」を「罠ゲームの価値」に置き換えたもの。
 */
function search(pos: Pos, side: Side, depth: number, ply: number, ctx: SearchContext): number {
  ctx.nodes += 1;

  if (depth <= 0) {
    const standPat = evaluate(pos, side);
    if (!Number.isNaN(standPat)) return standPat === WIN ? WIN - ply * 0.001 : standPat;
    // 王手されている: 逃げ方まで読まないと評価できない
    if (ply >= MAX_PLY) return -0.6;
    depth = 1;
  }

  const moves: number[] = [];
  generateMoves(pos, side, ply === 0 ? DROPS_ALL : DROPS_NEAR_KINGS, moves);
  const enemyKing = findKingSquare(pos.b, (-side) as Side);

  for (let i = 0; i < moves.length; i++) {
    if (moveTo(moves[i]) === enemyKing) return WIN - ply * 0.001;
  }

  const rules = ctx.rules;
  const inCheck = needsCheckTest(rules) && isInCheck(pos.b, side);
  const safeSquare = ctx.safeSquareByPly[ply] ?? -1;
  const bestByTo = new Float64Array(SQUARES).fill(-2);
  let safeValue = -2;
  const other = (-side) as Side;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const to = moveTo(m);
    const kingMove = rules.kingImmune && isKingMove(pos.b, m);
    const captured = makeMove(pos, m, side);
    const v = -search(pos, other, depth - 1, ply + 1, ctx);
    unmakeMove(pos, m, side, captured);
    if (to === safeSquare || kingMove) {
      if (v > safeValue) safeValue = v;
    } else if (v > bestByTo[to]) {
      bestByTo[to] = v;
    }
  }

  if (inCheck && rules.checkVoids) {
    // D: 王手をかけた側の罠は消えているので、普通に最善手を指せる
    let best = safeValue;
    for (let sq = 0; sq < SQUARES; sq++) if (bestByTo[sq] > best) best = bestByTo[sq];
    if (best > -2) return best;
  }

  // 罠にかかる = 何もせず相手番になる
  const failValue = -search(pos, other, depth - 1, ply + 1, ctx);
  if (inCheck && rules.checkRetry) return retryGameValue(bestByTo, failValue, safeValue);
  return trapGameValue(bestByTo, failValue, safeValue);
}

type RootOption = {
  readonly to: number;
  readonly move: number;
  value: number;
  readonly trappable: boolean;
};

type RootAnalysis = {
  readonly options: RootOption[];
  readonly failValue: number;
  /** 手番側が王手されているか（C / D のときだけ判定。それ以外は常に false） */
  readonly inCheck: boolean;
  readonly solution: TrapGameSolution;
  readonly nodes: number;
};

/**
 * 手番側の「着地点ごとの価値」と失敗時の価値を求め、罠ゲームを解く。
 *
 * @param safeSquare      相手が今回罠を置けないと分かっているマス（-1 = 不明）
 * @param replySafeSquare 次の相手番で、こちらが罠を置けないマス（-1 = なし）
 */
function analyzeRoot(
  pos: Pos,
  side: Side,
  safeSquare: number,
  replySafeSquare: number,
  refineTop: number,
  depth: number,
  rules: RuleFlags = RULE_FLAGS.standard,
  revealedTrap = -1
): RootAnalysis {
  const ctx: SearchContext = { safeSquareByPly: [safeSquare, replySafeSquare], rules, nodes: 0 };
  const other = (-side) as Side;
  const enemyKing = findKingSquare(pos.b, other);
  const inCheck = needsCheckTest(rules) && isInCheck(pos.b, side);
  // この手番は罠が効かない: 指し直し中（罠は公開済み）か、D で王手されている
  const noTrap = revealedTrap >= 0 || (inCheck && rules.checkVoids);
  const moves: number[] = [];
  generateMoves(pos, side, DROPS_ALL, moves);

  // 候補は「着地点」ごと。B では王の移動を別の候補（罠にかからない）にする
  const keyCount = SQUARES * 2;
  const isTrappableKey = (key: number) => (
    !noTrap && key < SQUARES && key !== enemyKing && key !== safeSquare
  );
  const alwaysRefine = (key: number) => key === enemyKing || (!noTrap && !isTrappableKey(key));

  // 1) 全ての手を浅く評価し、候補ごとの最善手を残す
  const bestMoveByKey = new Int32Array(keyCount).fill(-1);
  const valueByKey = new Float64Array(keyCount).fill(-2);
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const to = moveTo(m);
    if (to === revealedTrap) continue;
    const key = to + (rules.kingImmune && isKingMove(pos.b, m) ? SQUARES : 0);
    let v: number;
    if (to === enemyKing) {
      v = WIN;
    } else {
      const captured = makeMove(pos, m, side);
      v = -search(pos, other, 0, 1, ctx);
      unmakeMove(pos, m, side, captured);
    }
    if (v > valueByKey[key]) {
      valueByKey[key] = v;
      bestMoveByKey[key] = m;
    }
  }

  let candidates: number[] = [];
  for (let key = 0; key < keyCount; key++) {
    if (bestMoveByKey[key] >= 0) candidates.push(key);
  }
  const byValue = (a: number, c: number) => valueByKey[c] - valueByKey[a] || a - c;
  candidates.sort(byValue);

  // 2) 上位の候補だけ、相手の応手（こちらの罠込み）まで読む。
  //    読みを 1 段深くするたびに候補を絞る。
  let keep = refineTop;
  for (let level = 2; level <= depth; level++) {
    const kept: number[] = [];
    for (let rank = 0; rank < candidates.length; rank++) {
      const key = candidates[rank];
      if (rank >= keep && !alwaysRefine(key)) continue;
      if (key !== enemyKing) {
        const m = bestMoveByKey[key];
        const captured = makeMove(pos, m, side);
        valueByKey[key] = -search(pos, other, level - 1, 1, ctx);
        unmakeMove(pos, m, side, captured);
      }
      kept.push(key);
    }
    candidates = kept.sort(byValue);
    keep = Math.max(4, Math.ceil(keep * 0.6));
  }

  const options = candidates.map((key): RootOption => ({
    to: key % SQUARES,
    move: bestMoveByKey[key],
    value: valueByKey[key],
    trappable: isTrappableKey(key),
  }));
  const failValue = -search(pos, other, Math.max(0, depth - 1), 1, ctx);
  const retry = inCheck && rules.checkRetry && revealedTrap < 0;

  return {
    options,
    failValue,
    inCheck,
    solution: retry ? solveRetryGame(options, failValue) : solveTrapGame(options, failValue),
    nodes: ctx.nodes,
  };
}

// --- 相手の癖の読み取り（公開情報のみ） -------------------------------------

export type OpponentHabits = {
  /** 相手の罠が観測できた回数 */
  readonly trapSamples: number;
  /** 相手は「こちらの一番おいしい手」に均衡より多く罠を置くか（正 = 置きがち） */
  readonly trapOnBestBias: number;
  /** 相手の指し手が観測できた回数 */
  readonly moveSamples: number;
  /** 相手は「自分の一番おいしい手」を均衡より多く指すか（正 = 欲張り） */
  readonly greedBias: number;
};

const NO_HABITS: OpponentHabits = { trapSamples: 0, trapOnBestBias: 0, moveSamples: 0, greedBias: 0 };
const HABIT_PRIOR = 4;
/** 癖として数えるのは直近この手数だけ（古い癖は忘れる。計算量も一定になる） */
const HABIT_WINDOW = 24;

function initialPos(): Pos {
  const board = createInitialBoard();
  const b = new Int8Array(SQUARES);
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const piece = board[row][col];
      if (piece) b[row * SIZE + col] = KIND_CODE[piece.kind] * sideOf(piece.owner);
    }
  }
  return { b, hands: [new Int8Array(8), new Int8Array(8)] };
}

/** その局面で「一番おいしい着地点」と、均衡での罠確率・着手確率を浅く見積もる */
function shallowBest(
  pos: Pos,
  side: Side,
  rules: RuleFlags
): { to: number; trapProbability: number; playProbability: number } | null {
  const analysis = analyzeRoot(pos, side, -1, -1, 0, 1, rules);
  let best = -1;
  for (let i = 0; i < analysis.options.length; i++) {
    if (!analysis.options[i].trappable) return null; // 王が取れる局面は癖の観測に使わない
    if (best < 0) best = i;
  }
  if (best < 0) return null;
  // 罠で止める意味がある手がない局面は観測に使わない
  if (analysis.options[best].value <= analysis.failValue) return null;
  return {
    to: analysis.options[best].to,
    trapProbability: analysis.solution.trapMix[best],
    playProbability: analysis.solution.moverMix[best],
  };
}

/**
 * 対局ログを初期局面から並べ直し、相手の罠の置き方・指し方の癖を数える。
 *
 * 使うのは公開情報だけ:
 *   - 盤上の指し手（失敗した手も公開されている）
 *   - こちらの手番で公開・発動した相手の罠
 * 相手ログの pitfallSet（まだ公開されていない可能性がある）は読まない。
 */
export function readOpponentHabits(
  view: GameView,
  player: Player,
  variant: TrapRuleVariant = 'standard'
): OpponentHabits {
  const rules = RULE_FLAGS[variant];
  if (view.log.length === 0) return NO_HABITS;
  const pos = initialPos();
  const me = sideOf(player);
  let trapSamples = 0;
  let trapSurprise = 0;
  let moveSamples = 0;
  let greedSurprise = 0;

  const firstObserved = view.log.length - HABIT_WINDOW;
  for (let index = 0; index < view.log.length; index++) {
    const entry = view.log[index];
    const side = sideOf(entry.player);
    const attempted = entry.action ?? entry.failedAction ?? null;

    if (index < firstObserved) {
      // 古い手は盤面を進めるだけ
    } else if (side === me) {
      const knownTrap = entry.triggeredPitfall ?? entry.revealedPitfall;
      if (knownTrap) {
        const best = shallowBest(pos, side, rules);
        if (best) {
          trapSamples += 1;
          trapSurprise += (toSquare(knownTrap) === best.to ? 1 : 0) - best.trapProbability;
        }
      }
    } else if (attempted) {
      const best = shallowBest(pos, side, rules);
      if (best) {
        moveSamples += 1;
        greedSurprise += (toSquare(attempted.to) === best.to ? 1 : 0) - best.playProbability;
      }
    }

    const action = entry.action;
    if (!action) continue;
    const to = toSquare(action.to);
    if (action.type === 'drop') {
      const kind = KIND_CODE[action.piece.kind];
      if (kind > 7 || pos.b[to] !== 0 || pos.hands[handIndex(side)][kind] <= 0) return NO_HABITS;
      makeMove(pos, encodeMove(DROP_BASE + kind, to, false), side);
    } else {
      const from = toSquare(action.from);
      if (pos.b[from] !== KIND_CODE[action.piece.kind] * side) return NO_HABITS;
      makeMove(pos, encodeMove(from, to, action.promote === true), side);
    }
  }

  // 並べ直した結果が今の盤面と違うなら（途中局面から始まった等）、癖は使わない
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const piece = view.board[row]?.[col];
      const expected = piece ? KIND_CODE[piece.kind] * sideOf(piece.owner) : 0;
      if (pos.b[row * SIZE + col] !== expected) return NO_HABITS;
    }
  }

  return {
    trapSamples,
    trapOnBestBias: trapSurprise / (trapSamples + HABIT_PRIOR),
    moveSamples,
    greedBias: greedSurprise / (moveSamples + HABIT_PRIOR),
  };
}

const EXPLOIT_STRENGTH = 3;
const EXPLOIT_MAX_FACTOR = 4;

function clampFactor(exponent: number): number {
  const factor = Math.exp(exponent);
  if (factor > EXPLOIT_MAX_FACTOR) return EXPLOIT_MAX_FACTOR;
  if (factor < 1 / EXPLOIT_MAX_FACTOR) return 1 / EXPLOIT_MAX_FACTOR;
  return factor;
}

/** 分布の先頭要素の確率を bias だけずらし、残りを比例配分し直す */
function shiftTopProbability(mix: readonly number[], top: number, bias: number): number[] {
  let total = 0;
  for (const p of mix) total += p;
  const shifted = Math.min(Math.max(mix[top] + bias, 0.02 * total), 0.98 * total);
  const restBefore = total - mix[top];
  const scale = restBefore > 0 ? (total - shifted) / restBefore : 0;
  return mix.map((p, i) => (i === top ? shifted : p * scale));
}

/** 指す側: 相手の罠の癖に合わせて均衡の混合を傾ける */
function exploitAsMover(analysis: RootAnalysis, habits: OpponentHabits): number[] {
  const { moverMix, trapMix, value } = analysis.solution;
  const top = analysis.options.findIndex(option => option.trappable && option.value > analysis.failValue);
  if (top < 0 || habits.trapOnBestBias === 0 || trapMix[top] <= 0) return moverMix;

  const predictedTrap = shiftTopProbability(trapMix, top, habits.trapOnBestBias);
  const scale = analysis.options[top].value - analysis.failValue;
  if (scale <= 0) return moverMix;

  return moverMix.map((weight, i) => {
    if (weight <= 0) return 0;
    const option = analysis.options[i];
    const expected = option.trappable
      ? predictedTrap[i] * analysis.failValue + (1 - predictedTrap[i]) * option.value
      : option.value;
    return weight * clampFactor((EXPLOIT_STRENGTH * (expected - value)) / scale);
  });
}

/** 罠側: 相手の指し方の癖に合わせて均衡の罠配分を傾ける */
function exploitAsTrapper(analysis: RootAnalysis, habits: OpponentHabits): number[] {
  const { moverMix, trapMix } = analysis.solution;
  const top = analysis.options.findIndex(option => option.trappable && option.value > analysis.failValue);
  if (top < 0 || habits.greedBias === 0 || moverMix[top] <= 0) return trapMix;

  const predictedMove = shiftTopProbability(moverMix, top, habits.greedBias);
  // 均衡では「罠を置いた時の得」 x_i * (v_i - p) がサポート上で等しい
  const equilibriumGain = moverMix[top] * (analysis.options[top].value - analysis.failValue);
  if (equilibriumGain <= 0) return trapMix;

  return trapMix.map((weight, i) => {
    if (weight <= 0) return 0;
    const gain = predictedMove[i] * (analysis.options[i].value - analysis.failValue);
    return weight * clampFactor(EXPLOIT_STRENGTH * (gain / equilibriumGain - 1));
  });
}

// --- 公開情報の読み取り -----------------------------------------------------

function lastEntryOf(log: readonly PublicLogEntry[], player: Player): PublicLogEntry | null {
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].player === player) return log[i];
  }
  return null;
}

/**
 * 相手が「今回は罠を置けない」と公開情報から確定できるマス。
 *
 * 同じマスへの連続設置は禁止なので、こちらの直前の手番で公開・発動した相手の罠マスは、
 * 今回は絶対に罠ではない。
 */
function knownSafeSquare(view: GameView, mover: Player): number {
  const entry = lastEntryOf(view.log, mover);
  const known = entry?.triggeredPitfall ?? entry?.revealedPitfall;
  return known ? toSquare(known) : -1;
}

/** 自分が直前に置いた罠マス（今回は置けない）。自分のログだけを見る */
function ownLastTrapSquare(view: GameView, player: Player): number {
  const entry = lastEntryOf(view.log, player);
  return entry?.pitfallSet ? toSquare(entry.pitfallSet) : -1;
}

// --- 公開API ---------------------------------------------------------------

export type MindGameOptions = {
  /** 乱数源（既定は Math.random）。テストと自動対戦で差し替える */
  readonly random?: () => number;
  /** 深く読む着地点の数 */
  readonly refineTop?: number;
  /** 読みの深さ（2 = 自分の手 + 相手の応手、3 = さらに自分の次の手）。既定は 2 */
  readonly depth?: number;
  /** 相手の癖（公開情報から推定）に合わせて均衡からずらすか。既定は true */
  readonly adaptive?: boolean;
  /** 自分が直前に置いた罠マス。省略時はログから求める */
  readonly ownLastTrap?: Position | null;
  /** 研究用: 罠ルールの変種。既定は現行ルール。アプリからは渡さない */
  readonly rules?: TrapRuleVariant;
  /** 研究用（C）: 罠で失敗した後の指し直し。このマスには指さず、もう罠はないものとして読む */
  readonly revealedTrap?: Position | null;
};

const DEFAULT_REFINE_TOP = 14;
const DEFAULT_DEPTH = 2;

export type MindGameCandidate = {
  readonly action: GameAction;
  readonly to: Position;
  /** 指す側から見た価値 [-1, 1] */
  readonly value: number;
  /** この手を指す確率 */
  readonly playProbability: number;
  /** 相手がここに罠を置いていると見積もる確率 */
  readonly trapProbability: number;
  readonly trappable: boolean;
};

export type MindGameMoveDecision = {
  readonly action: GameAction;
  readonly candidates: readonly MindGameCandidate[];
  /** 罠ゲームの価値（読み合い込みの形勢） */
  readonly gameValue: number;
  /** 罠にかかった時の価値 */
  readonly failValue: number;
  /** 選んだ手が罠にかかると見積もった確率 */
  readonly chosenTrapProbability: number;
  /** 公開情報から読み取った相手の癖 */
  readonly habits: OpponentHabits;
  readonly nodes: number;
};

export type MindGameTrapTarget = {
  readonly position: Position;
  readonly probability: number;
};

export type MindGameTurnPlan = {
  readonly pitfall: Position;
  readonly move: MindGameMoveDecision;
  readonly trapTargets: readonly MindGameTrapTarget[];
};

function actionFromMove(view: GameView, m: number, player: Player): GameAction {
  const from = moveFrom(m);
  const to = toPosition(moveTo(m));
  if (from >= DROP_BASE) {
    return {
      type: 'drop',
      to,
      piece: { kind: CODE_KIND[from - DROP_BASE], owner: player },
    };
  }

  const fromPosition = toPosition(from);
  const piece = view.board[fromPosition.row][fromPosition.col] as Piece;
  const captured = view.board[to.row][to.col] ?? null;
  return m >> 14
    ? { type: 'move', from: fromPosition, to, piece, promote: true, captured }
    : { type: 'move', from: fromPosition, to, piece, captured };
}

function sampleIndex(weights: readonly number[], random: () => number): number {
  let total = 0;
  for (const weight of weights) total += weight;
  if (total <= 0) return 0;
  let threshold = random() * total;
  for (let i = 0; i < weights.length; i++) {
    threshold -= weights[i];
    if (threshold < 0) return i;
  }
  return weights.length - 1;
}

function resolveOwnLastTrap(view: GameView, player: Player, options: MindGameOptions): number {
  if (options.ownLastTrap === undefined) return ownLastTrapSquare(view, player);
  return options.ownLastTrap ? toSquare(options.ownLastTrap) : -1;
}

function decideMoveInternal(
  view: GameView,
  pos: Pos,
  player: Player,
  options: MindGameOptions
): { decision: MindGameMoveDecision; chosen: RootOption; analysis: RootAnalysis } {
  const side = sideOf(player);
  const random = options.random ?? Math.random;

  const variant = options.rules ?? 'standard';
  const analysis = analyzeRoot(
    pos,
    side,
    knownSafeSquare(view, player),
    resolveOwnLastTrap(view, player, options),
    options.refineTop ?? DEFAULT_REFINE_TOP,
    options.depth ?? DEFAULT_DEPTH,
    RULE_FLAGS[variant],
    options.revealedTrap ? toSquare(options.revealedTrap) : -1
  );
  if (analysis.options.length === 0) {
    throw new Error('No legal moves available for mind game bot');
  }

  const habits = options.adaptive === false ? NO_HABITS : readOpponentHabits(view, player, variant);
  const playWeights = exploitAsMover(analysis, habits);
  let weightTotal = 0;
  for (const weight of playWeights) weightTotal += weight;

  const index = sampleIndex(playWeights, random);
  const chosen = analysis.options[index];
  const candidates = analysis.options.map((option, i): MindGameCandidate => ({
    action: actionFromMove(view, option.move, player),
    to: toPosition(option.to),
    value: option.value,
    playProbability: weightTotal > 0 ? playWeights[i] / weightTotal : 0,
    trapProbability: analysis.solution.trapMix[i],
    trappable: option.trappable,
  }));

  return {
    chosen,
    analysis,
    decision: {
      action: candidates[index].action,
      candidates,
      gameValue: analysis.solution.value,
      failValue: analysis.failValue,
      chosenTrapProbability: analysis.solution.trapMix[index],
      habits,
      nodes: analysis.nodes,
    },
  };
}

/** 指し手だけを決める（罠は置かない） */
export function decideMindGameMove(view: GameView, options: MindGameOptions = {}): MindGameMoveDecision {
  return decideMoveInternal(view, posFromView(view), view.currentPlayer, options).decision;
}

/**
 * 1 ターン分（罠 + 指し手）をまとめて決める。
 *
 * 罠は「自分の手が通った後の局面」と「自分の手が罠で失敗した局面」の両方について
 * 相手の罠ゲームを解き、失敗確率で重み付けして混ぜた分布から選ぶ。
 */
export function planMindGameTurn(view: GameView, options: MindGameOptions = {}): MindGameTurnPlan {
  const player = view.currentPlayer;
  const side = sideOf(player);
  const other = (-side) as Side;
  const random = options.random ?? Math.random;
  const pos = posFromView(view);
  const { decision, chosen, analysis: own } = decideMoveInternal(view, pos, player, options);
  const rules = RULE_FLAGS[options.rules ?? 'standard'];

  const ownLastTrap = resolveOwnLastTrap(view, player, options);
  const failProbability = decision.chosenTrapProbability;
  const weights = new Float64Array(SQUARES);
  const decoy = new Float64Array(SQUARES);
  const refineTop = Math.max(4, Math.floor((options.refineTop ?? DEFAULT_REFINE_TOP) * 0.6));
  const depth = options.depth ?? DEFAULT_DEPTH;

  const addScenario = (probability: number) => {
    if (probability <= 0.02) return;
    // 相手から見て: 相手の安全マス = こちらが今回置けないマス。
    // その次のこちらの番の安全マスは、まだ分からないので -1。
    const analysis = analyzeRoot(pos, other, ownLastTrap, -1, refineTop, depth, rules);
    const equilibriumMix = analysis.solution.trapMix;
    let assigned = 0;
    for (const p of equilibriumMix) assigned += p;
    // 相手の癖に合わせて配分を傾ける（罠を置く総量は均衡のまま）
    const tilted = exploitAsTrapper(analysis, decision.habits);
    let tiltedTotal = 0;
    for (const p of tilted) tiltedTotal += p;
    for (let i = 0; i < analysis.options.length; i++) {
      if (tiltedTotal <= 0) break;
      weights[analysis.options[i].to] += probability * assigned * (tilted[i] / tiltedTotal);
    }
    // 余った確率は「相手が指しそうな手」に薄く撒く（何も守らない罠は置かない）
    const rest = Math.max(0, 1 - assigned);
    if (rest > 0) {
      for (let i = 0; i < analysis.options.length; i++) {
        const option = analysis.options[i];
        if (!option.trappable) continue;
        decoy[option.to] += probability * rest * Math.exp((option.value - analysis.options[0].value) * 12);
      }
    }
  };

  // 自分の手が通った場合
  const captured = makeMove(pos, chosen.move, side);
  const winsNow = captured !== 0 && Math.abs(captured) === KING;
  if (!winsNow) addScenario(1 - failProbability);
  unmakeMove(pos, chosen.move, side, captured);

  // C で王手されている: 罠にかかっても 2 番目の手で指し直すので、その局面に罠を合わせる
  const retryMove = own.inCheck && rules.checkRetry
    ? own.options.find(option => option.move !== chosen.move)?.move
    : undefined;
  if (retryMove !== undefined && !winsNow) {
    const retryCaptured = makeMove(pos, retryMove, side);
    addScenario(failProbability);
    unmakeMove(pos, retryMove, side, retryCaptured);
  } else {
    // 自分の手が罠で失敗した場合（盤面はそのまま）
    addScenario(winsNow ? 1 : failProbability);
  }

  let decoyTotal = 0;
  let weightTotal = 0;
  for (let sq = 0; sq < SQUARES; sq++) {
    decoyTotal += decoy[sq];
    weightTotal += weights[sq];
  }
  const rest = Math.max(0, 1 - weightTotal);
  if (decoyTotal > 0 && rest > 0) {
    for (let sq = 0; sq < SQUARES; sq++) weights[sq] += (decoy[sq] / decoyTotal) * rest;
  }

  // 置けないマスを除外: 現在の王のマス、自分が直前に置いたマス
  const squares: number[] = [];
  const squareWeights: number[] = [];
  for (let sq = 0; sq < SQUARES; sq++) {
    if (weights[sq] <= 0) continue;
    if (sq === ownLastTrap) continue;
    const pc = pos.b[sq];
    if (pc === KING || pc === -KING) continue;
    squares.push(sq);
    squareWeights.push(weights[sq]);
  }

  let pitfall: number;
  if (squares.length > 0) {
    pitfall = squares[sampleIndex(squareWeights, random)];
  } else {
    // 守るべき着地点がない: 置けるマスのうち盤の中央寄りに置く
    pitfall = -1;
    for (const sq of [40, 31, 49, 39, 41, 30, 32, 48, 50]) {
      const pc = pos.b[sq];
      if (sq !== ownLastTrap && pc !== KING && pc !== -KING) {
        pitfall = sq;
        break;
      }
    }
    if (pitfall < 0) pitfall = 40;
  }

  let total = 0;
  for (const weight of squareWeights) total += weight;
  const trapTargets = squares
    .map((sq, i): MindGameTrapTarget => ({
      position: toPosition(sq),
      probability: total > 0 ? squareWeights[i] / total : 0,
    }))
    .sort((a, c) => c.probability - a.probability);

  return { pitfall: toPosition(pitfall), move: decision, trapTargets };
}

// --- テスト用 ---------------------------------------------------------------

/** board.ts の合法手生成と一致することを確認するための内部公開 */
export function listMindGameDestinations(view: GameView, player: Player): string[] {
  const pos = posFromView(view);
  const moves: number[] = [];
  generateMoves(pos, sideOf(player), DROPS_ALL, moves);
  return moves.map(m => {
    const from = moveFrom(m);
    const to = moveTo(m);
    return from >= DROP_BASE
      ? `drop:${CODE_KIND[from - DROP_BASE]}:${to}`
      : `move:${from}:${to}`;
  }).sort();
}
