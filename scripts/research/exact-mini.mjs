// 小さな盤での厳密解析（評価関数も探索の打ち切りもない、均衡プレイ）
//
//   node scripts/research/exact-mini.mjs --size 3x4 --games 20000
//   node scripts/research/exact-mini.mjs --size 4x4 --games 20000 --out docs/research/rule-variants/data/exact-4x4.json
//
// 盤: 幅 W × 高さ H。各陣営 玉 + 金 1 枚。取った金は持ち駒（打てる）。玉を取ったら勝ち。
// ルール: 現行ルールと同じく「毎ターン 1 マスに罠。相手がそこに指したら手は失敗（パス）」。
//         玉を取る手は罠にかからない。玉のいるマスには罠を置けない。
//
// 近似（本物のルールとの違い）:
//   1. 罠は「自分の手が通った後」に置く（本物は自分の手より先に置く）。読み合いエンジンの探索と同じ抽象化。
//   2. 同じマスへの連続設置の禁止は省略（状態数を抑えるため）。
//   3. 割引率 γ = 0.99（終わらない対局を引き分け扱いにし、価値反復を収束させる）。
//
// 各手番は「罠側 vs 指す側」の同時手番ゲーム。指す側の利得は「選んだ着地点に罠があるか」だけで決まるので、
// 均衡は閉じた式（mindgame.ts の solveTrapGame と同じ）で厳密に解ける。全局面について Shapley の価値反復で解く。

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRandom, root } from './load-game.mjs';

const EMPTY = 0;
const SK = 1; // 先手玉
const SG = 2; // 先手金
const GK = 3; // 後手玉
const GG = 4; // 後手金

const KING_STEPS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const GOLD_STEPS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]]; // 先手基準（上が前）

const VARIANT_NAMES = ['none', 'standard', 'kingImmune', 'checkRetry', 'checkVoidsTrap'];

function parseArgs(argv) {
  const args = { size: '3x4', games: 20000, seed: 7, gamma: 0.99, out: null };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    args[key] = key === 'size' || key === 'out' ? argv[i + 1] : Number(argv[i + 1]);
  }
  return args;
}

// --- 局面の列挙 ---------------------------------------------------------------------

function buildStateSpace(W, H) {
  const N = W * H;
  const keyOf = (cells, hands, side) => {
    let key = 0;
    for (let i = 0; i < N; i++) key = key * 5 + cells[i];
    return (key * 9 + hands[0] * 3 + hands[1]) * 2 + side;
  };

  const owner = (code) => (code === SK || code === SG ? 0 : code === GK || code === GG ? 1 : -1);
  const isKing = (code) => code === SK || code === GK;

  /** side の駒が利いているマス */
  function attacks(cells, side) {
    const hit = new Uint8Array(N);
    for (let sq = 0; sq < N; sq++) {
      const code = cells[sq];
      if (owner(code) !== side) continue;
      const r = Math.floor(sq / W);
      const c = sq % W;
      const steps = isKing(code) ? KING_STEPS : GOLD_STEPS;
      for (const [dr0, dc] of steps) {
        const dr = side === 0 ? dr0 : -dr0;
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
        hit[nr * W + nc] = 1;
      }
    }
    return hit;
  }

  function kingSquare(cells, side) {
    return cells.indexOf(side === 0 ? SK : GK);
  }

  /** 指し手: { to, kingMove, cells, hands } */
  function moves(cells, hands, side) {
    const out = [];
    for (let sq = 0; sq < N; sq++) {
      const code = cells[sq];
      if (owner(code) !== side) continue;
      const r = Math.floor(sq / W);
      const c = sq % W;
      const steps = isKing(code) ? KING_STEPS : GOLD_STEPS;
      for (const [dr0, dc] of steps) {
        const dr = side === 0 ? dr0 : -dr0;
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
        const to = nr * W + nc;
        if (owner(cells[to]) === side) continue;
        const next = cells.slice();
        const nextHands = hands.slice();
        if (cells[to] === SG || cells[to] === GG) nextHands[side] += 1;
        next[to] = code;
        next[sq] = EMPTY;
        out.push({ to, kingMove: isKing(code), captureKing: isKing(cells[to]), cells: next, hands: nextHands });
      }
    }
    if (hands[side] > 0) {
      for (let to = 0; to < N; to++) {
        if (cells[to] !== EMPTY) continue;
        const next = cells.slice();
        const nextHands = hands.slice();
        next[to] = side === 0 ? SG : GG;
        nextHands[side] -= 1;
        out.push({ to, kingMove: false, captureKing: false, cells: next, hands: nextHands });
      }
    }
    return out;
  }

  // 初期局面: 先手は下段、後手は上段（点対称）
  const start = new Array(N).fill(EMPTY);
  const mid = Math.floor((W - 1) / 2);
  start[(H - 1) * W + mid] = SK;
  start[(H - 1) * W + mid + 1] = SG;
  start[W - 1 - mid] = GK;
  start[W - 1 - mid - 1] = GG;

  const index = new Map();
  const states = [];
  const push = (cells, hands, side) => {
    const key = keyOf(cells, hands, side);
    let id = index.get(key);
    if (id === undefined) {
      id = states.length;
      index.set(key, id);
      states.push({ cells, hands, side });
    }
    return id;
  };

  const startId = push(start, [0, 0], 0);
  for (let id = 0; id < states.length; id++) {
    const state = states[id];
    const { cells, hands, side } = state;
    const enemy = 1 - side;
    state.winNow = attacks(cells, side)[kingSquare(cells, enemy)] === 1;
    if (state.winNow) continue;
    state.inCheck = attacks(cells, enemy)[kingSquare(cells, side)] === 1;
    state.moves = moves(cells, hands, side).map(move => ({
      to: move.to,
      kingMove: move.kingMove,
      child: move.captureKing ? -1 : push(move.cells, move.hands, enemy),
    }));
    state.pass = push(cells.slice(), hands.slice(), enemy);
    // 罠を置けないマス = 玉のいるマス
    state.kingSquares = [kingSquare(cells, 0), kingSquare(cells, 1)];
  }
  return { states, startId, W, H };
}

// --- 1 手番の均衡 ---------------------------------------------------------------------

/**
 * options: [{ value, trappable }]、failValue: 罠にかかった時の価値。
 * mode: 'trap' | 'retry' | 'none'
 * 返り値: { value, moverMix, trapMix }
 */
function solveTurn(options, failValue, mode) {
  const n = options.length;
  const moverMix = new Float64Array(n);
  const trapMix = new Float64Array(n);
  let top = 0;
  for (let i = 1; i < n; i++) if (options[i].value > options[top].value) top = i;

  if (mode === 'none') {
    moverMix[top] = 1;
    return { value: options[top].value, moverMix, trapMix };
  }
  if (mode === 'retry') {
    moverMix[top] = 1;
    if (!options[top].trappable) return { value: options[top].value, moverMix, trapMix };
    trapMix[top] = 1;
    let rest = -Infinity;
    for (let i = 0; i < n; i++) if (i !== top && options[i].value > rest) rest = options[i].value;
    return { value: Number.isFinite(rest) ? rest : failValue, moverMix, trapMix };
  }

  let safe = -Infinity;
  let safeIndex = -1;
  for (let i = 0; i < n; i++) {
    if (!options[i].trappable && options[i].value > safe) {
      safe = options[i].value;
      safeIndex = i;
    }
  }
  const floor = Math.max(failValue, safe);
  const contested = [];
  for (let i = 0; i < n; i++) if (options[i].trappable && options[i].value > floor) contested.push(i);
  if (contested.length === 0) {
    moverMix[top] = 1;
    return { value: options[top].value, moverMix, trapMix };
  }
  contested.sort((a, b) => options[b].value - options[a].value);

  let weighted = 0;
  let inverse = 0;
  let support = contested.length;
  let value = floor;
  for (let k = 0; k < contested.length; k++) {
    const v = options[contested[k]].value;
    weighted += v / (v - failValue);
    inverse += 1 / (v - failValue);
    const u = (weighted - 1) / inverse;
    const next = k + 1 < contested.length ? options[contested[k + 1]].value : -Infinity;
    if (u >= next) {
      support = k + 1;
      value = u;
      break;
    }
  }

  if (value <= floor) {
    // 罠側に余裕がある: 全部を十分な確率で塞げる。指す側は罠のかからない手（なければ最善手）
    for (const i of contested) trapMix[i] = (options[i].value - floor) / (options[i].value - failValue);
    // 同点なら受けの手を選ぶ（罠のかからない手が「罠にかかったのと同じ負け」なら、受けに賭ける）
    if (safeIndex >= 0 && safe > failValue) moverMix[safeIndex] = 1;
    else moverMix[contested[0]] = 1;
    return { value: floor, moverMix, trapMix };
  }

  let normalizer = 0;
  for (let k = 0; k < support; k++) normalizer += 1 / (options[contested[k]].value - failValue);
  for (let k = 0; k < support; k++) {
    const i = contested[k];
    const v = options[i].value;
    trapMix[i] = (v - value) / (v - failValue);
    moverMix[i] = 1 / (v - failValue) / normalizer;
  }
  return { value, moverMix, trapMix };
}

/** 局面 id の 1 手番を、価値表 V の下で組み立てる */
function turnOf(space, V, id, variant, gamma) {
  const state = space.states[id];
  const flags = {
    trap: variant !== 'none',
    kingImmune: variant === 'kingImmune',
    retry: variant === 'checkRetry' && state.inCheck,
    voided: variant === 'checkVoidsTrap' && state.inCheck,
  };

  // 候補 = 着地点（B では王の移動を別候補）。同じ候補の中では一番良い手を選ぶ
  const byKey = new Map();
  for (const move of state.moves) {
    const value = move.child < 0 ? 1 : -gamma * V[move.child];
    const key = move.to + (flags.kingImmune && move.kingMove ? 1000 : 0);
    const current = byKey.get(key);
    if (!current || value > current.value) {
      byKey.set(key, { key, to: move.to, value, child: move.child, kingMove: move.kingMove });
    }
  }
  const options = [...byKey.values()].map(option => ({
    ...option,
    trappable: flags.trap && !flags.voided && option.child >= 0 && option.key < 1000,
  }));
  const failValue = -gamma * V[state.pass];
  let mode = 'trap';
  if (!flags.trap || flags.voided) mode = 'none';
  else if (flags.retry) mode = 'retry';
  return { options, failValue, solution: solveTurn(options, failValue, mode), mode };
}

function solve(space, variant, gamma) {
  const V = new Float64Array(space.states.length);
  for (let id = 0; id < space.states.length; id++) if (space.states[id].winNow) V[id] = 1;
  let iterations = 0;
  for (; iterations < 5000; iterations++) {
    let delta = 0;
    for (let id = 0; id < space.states.length; id++) {
      if (space.states[id].winNow) continue;
      const value = turnOf(space, V, id, variant, gamma).solution.value;
      const d = Math.abs(value - V[id]);
      if (d > delta) delta = d;
      V[id] = value;
    }
    if (delta < 1e-9) break;
  }
  return { V, iterations };
}

// --- 均衡どうしの対局 -------------------------------------------------------------------

function sample(weights, random) {
  let total = 0;
  for (const w of weights) total += w;
  let t = random() * total;
  for (let i = 0; i < weights.length; i++) {
    t -= weights[i];
    if (t < 0) return i;
  }
  return weights.length - 1;
}

function playEquilibrium(space, V, variant, gamma, random, maxPlies = 200) {
  let id = space.startId;
  let last = [null, null];
  let checks = 0;
  for (let ply = 0; ply < maxPlies; ply++) {
    const state = space.states[id];
    if (state.winNow) {
      return { winner: state.side, plies: ply, ending: classify(last[1 - state.side]), checks };
    }
    const turn = turnOf(space, V, id, variant, gamma);
    const { options, solution } = turn;

    // 罠: 均衡の配分。残りは「どの候補にも関係ないマス」に置いたものとみなす
    const trapWeights = Array.from(solution.trapMix);
    const rest = Math.max(0, 1 - trapWeights.reduce((a, b) => a + b, 0));
    trapWeights.push(rest);
    const trapIndex = sample(trapWeights, random);
    const chosen = sample(Array.from(solution.moverMix), random);
    const option = options[chosen];

    const saving = options.filter(o => o.child >= 0 && !space.states[o.child].winNow);
    const record = {
      anySaving: saving.length > 0,
      inCheck: state.inCheck,
      k: state.inCheck ? new Set(saving.map(o => o.to)).size : null,
      chosenSaving: option.child >= 0 && !space.states[option.child].winNow,
      trapped: false,
      retried: false,
    };
    if (state.inCheck) checks += 1;

    let next;
    if (option.child < 0) {
      return { winner: state.side, plies: ply + 1, ending: classify(last[1 - state.side]), checks };
    }
    if (trapIndex === chosen && option.trappable) {
      record.trapped = true;
      if (turn.mode === 'retry') {
        // C: 罠を見て、残りの一番良い手で指し直す
        record.retried = true;
        const others = options.filter((o, i) => i !== chosen);
        if (others.length > 0) {
          const best = others.reduce((a, b) => (b.value > a.value ? b : a));
          record.chosenSaving = best.child >= 0 && !space.states[best.child].winNow;
          if (best.child < 0) return { winner: state.side, plies: ply + 1, ending: classify(last[1 - state.side]), checks };
          next = best.child;
        } else {
          next = state.pass;
        }
      } else {
        next = state.pass;
      }
    } else {
      next = option.child;
    }
    last[state.side] = record;
    id = next;
  }
  return { winner: null, plies: maxPlies, ending: 'draw', checks };
}

function classify(record) {
  if (!record) return 'unknown';
  if (!record.inCheck) return record.anySaving ? 'self-exposure' : 'zugzwang';
  if (record.k === 0) return 'mate';
  if (record.retried) return record.k === 1 ? 'trap-mate' : 'missed-defense';
  if (record.trapped && record.chosenSaving) return record.k === 1 ? 'trap-mate' : 'roulette';
  return 'missed-defense';
}

// --- 実行 -----------------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));
  const [W, H] = args.size.split('x').map(Number);
  const started = Date.now();
  const space = buildStateSpace(W, H);
  const result = { size: args.size, states: space.states.length, gamma: args.gamma, games: args.games, variants: {} };
  console.error(`${args.size}: ${space.states.length} states (${((Date.now() - started) / 1000).toFixed(1)}s)`);

  for (const variant of VARIANT_NAMES) {
    const t0 = Date.now();
    const { V, iterations } = solve(space, variant, args.gamma);
    const random = createRandom(args.seed);
    const endings = {};
    const plies = [];
    let checks = 0;
    let senteWins = 0;
    let decided = 0;
    for (let g = 0; g < args.games; g++) {
      const game = playEquilibrium(space, V, variant, args.gamma, random);
      endings[game.ending] = (endings[game.ending] ?? 0) + 1;
      plies.push(game.plies);
      checks += game.checks;
      if (game.winner !== null) {
        decided += 1;
        if (game.winner === 0) senteWins += 1;
      }
    }
    plies.sort((a, b) => a - b);
    // 勝負がつく局面の割合（初期局面から到達可能な全局面のうち、価値が ±0.5 を超えるもの）
    let decisive = 0;
    for (let id = 0; id < V.length; id++) if (Math.abs(V[id]) > 0.5) decisive += 1;
    result.variants[variant] = {
      iterations,
      startValue: Number(V[space.startId].toFixed(4)),
      decisiveStateShare: Number((decisive / V.length).toFixed(3)),
      decidedGames: decided,
      senteWinRate: decided > 0 ? Number((senteWins / decided).toFixed(3)) : null,
      endings,
      endingShareOfDecided: Object.fromEntries(Object.entries(endings)
        .filter(([key]) => key !== 'draw')
        .map(([key, count]) => [key, Number((count / Math.max(1, decided)).toFixed(3))])),
      plies: { median: plies[Math.floor(plies.length / 2)], p90: plies[Math.floor(plies.length * 0.9)] },
      checksPerGame: Number((checks / args.games).toFixed(2)),
      seconds: Number(((Date.now() - t0) / 1000).toFixed(1)),
    };
    console.error(`  ${variant}: ${JSON.stringify(result.variants[variant])}`);
  }

  console.log(JSON.stringify(result, null, 2));
  if (args.out) {
    const out = resolve(root, args.out);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  }
}

main();
