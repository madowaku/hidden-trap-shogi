import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRandom, loadGameModule, root } from '../../scripts/research/load-game.mjs';
import { classifyEnding, playTurn } from '../../scripts/research/variant-rules.mjs';

const mind = loadGameModule('src/game/mindgame.ts');
const { createInitialGameState, createEmptyHand } = loadGameModule('src/game/constants.ts');
const { getPlayerView } = loadGameModule('src/game/view.ts');

/** 駒を並べた局面。pieces: [row, col, kind, owner] */
function stateWith(pieces, { player = 'sente', traps = {}, casual = true } = {}) {
  const base = createInitialGameState('pvbot', casual, 'gote', 'hard');
  const board = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => null));
  for (const [row, col, kind, owner] of pieces) board[row][col] = { kind, owner };
  return {
    ...base,
    board,
    currentPlayer: player,
    turn: 20,
    hands: { sente: createEmptyHand(), gote: createEmptyHand() },
    pitfalls: {
      sente: traps.sente ? { position: traps.sente, owner: 'sente' } : null,
      gote: traps.gote ? { position: traps.gote, owner: 'gote' } : null,
    },
    lastPitfallPositionByPlayer: { sente: null, gote: null },
  };
}

function move(from, to, kind, owner = 'sente') {
  return { type: 'move', from: { row: from[0], col: from[1] }, to: { row: to[0], col: to[1] }, piece: { kind, owner } };
}

function scripted({ pitfall = { row: 4, col: 8 }, action, retry = null }) {
  return {
    pitfall: () => pitfall,
    move: () => ({ action }),
    retry: () => (retry ? { action: retry } : null),
  };
}

// --- 隔離: アプリのルールは変わっていない -------------------------------------------

test('B stays research-only; the app picks a rule only from config.trapRule', () => {
  // A / C / D は試遊用の比較版としてアプリで遊べる（tests/static/playable-rule-modes.mjs）。
  // B（王の移動は罠無効）は研究用のまま、アプリからは選べない。
  for (const file of ['src/game/reducer.ts', 'src/game/bot.ts', 'src/hooks/useGame.ts', 'src/game/room.ts', 'src/app/page.tsx', 'src/game/types.ts']) {
    const source = readFileSync(resolve(root, file), 'utf8');
    assert.doesNotMatch(source, /kingImmune/, file);
  }
  // Bot はエンジンに渡すルールを対局の設定から取る（勝手に別ルールで読まない）
  assert.match(readFileSync(resolve(root, 'src/game/bot.ts'), 'utf8'), /rules: state\.config\.trapRule \?\? 'standard'/);
  // オンライン対戦は現行ルールのみ
  assert.doesNotMatch(readFileSync(resolve(root, 'src/game/room.ts'), 'utf8'), /trapRule|checkRetry|checkVoidsTrap/);
});

test('engine default is the standard rule set', () => {
  const state = createInitialGameState('pvbot', true, 'gote', 'hard');
  const view = getPlayerView(state, 'sente');
  const plain = mind.planMindGameTurn(view, { random: createRandom(1), ownLastTrap: null });
  const standard = mind.planMindGameTurn(view, { random: createRandom(1), ownLastTrap: null, rules: 'standard' });
  assert.deepEqual(standard, plain);
});

test('retry game: the trapper blocks the best answer and the mover gets the second best', () => {
  const solution = mind.solveRetryGame([
    { value: 0.4, trappable: true },
    { value: 0.1, trappable: true },
    { value: -0.5, trappable: true },
  ], -1);
  assert.equal(solution.trapMix[0], 1);
  assert.equal(solution.moverMix[0], 1);
  assert.equal(solution.value, 0.1);

  const single = mind.solveRetryGame([{ value: 0.4, trappable: true }], -1);
  assert.equal(single.value, -1, 'one answer only: blocking it is a mate');
});

// --- シミュレータ: 各変種の挙動 ---------------------------------------------------------

const KING_WALKS_INTO_TRAP = () => stateWith([
  [8, 4, 'king', 'sente'],
  [0, 4, 'king', 'gote'],
], { traps: { gote: { row: 7, col: 4 } } });

test('A (standard) matches the reducer: a king walking onto a trap fails', () => {
  const { state, record } = playTurn(KING_WALKS_INTO_TRAP(), 'standard', scripted({ action: move([8, 4], [7, 4], 'king') }));
  assert.equal(record.trapped, true);
  assert.equal(state.board[8][4]?.kind, 'king');
  assert.equal(state.log.at(-1).pitfallTriggered, true);
});

test('B (kingImmune): king moves ignore traps, other pieces still fall', () => {
  const kingTurn = playTurn(KING_WALKS_INTO_TRAP(), 'kingImmune', scripted({ action: move([8, 4], [7, 4], 'king') }));
  assert.equal(kingTurn.record.trapped, false);
  assert.equal(kingTurn.record.event, 'kingImmune');
  assert.equal(kingTurn.state.board[7][4]?.kind, 'king');
  assert.deepEqual(kingTurn.state.log.at(-1).revealedPitfall, { row: 7, col: 4 });

  const goldState = stateWith([
    [8, 4, 'king', 'sente'],
    [8, 3, 'gold', 'sente'],
    [0, 4, 'king', 'gote'],
  ], { traps: { gote: { row: 7, col: 3 } } });
  const goldTurn = playTurn(goldState, 'kingImmune', scripted({ action: move([8, 3], [7, 3], 'gold') }));
  assert.equal(goldTurn.record.trapped, true);
  assert.equal(goldTurn.state.board[8][3]?.kind, 'gold');
});

// 先手玉 5九 に後手飛車 5五 から王手。5九→6九 に逃げると罠
const IN_CHECK = () => stateWith([
  [8, 4, 'king', 'sente'],
  [4, 4, 'rook', 'gote'],
  [0, 0, 'king', 'gote'],
], { traps: { gote: { row: 8, col: 3 } } });

test('C (checkRetry): a trapped answer to check is replaced by a retry', () => {
  const { state, record } = playTurn(IN_CHECK(), 'checkRetry', scripted({
    action: move([8, 4], [8, 3], 'king'),
    retry: move([8, 4], [8, 5], 'king'),
  }));
  assert.equal(record.inCheck, true);
  assert.equal(record.event, 'retry');
  assert.equal(state.board[8][5]?.kind, 'king');
  const entry = state.log.at(-1);
  assert.equal(entry.pitfallTriggered, true);
  assert.deepEqual(entry.triggeredPitfall, { row: 8, col: 3 });
  assert.deepEqual(entry.failedAction.to, { row: 8, col: 3 });
});

test('C (checkRetry): without check, a trapped move fails as usual', () => {
  const { state, record } = playTurn(KING_WALKS_INTO_TRAP(), 'checkRetry', scripted({
    action: move([8, 4], [7, 4], 'king'),
    retry: move([8, 4], [8, 5], 'king'),
  }));
  assert.equal(record.event, null);
  assert.equal(record.trapped, true);
  assert.equal(state.board[8][4]?.kind, 'king');
});

test('D (checkVoidsTrap): giving check removes the trap placed this turn', () => {
  const pieces = [
    [8, 8, 'king', 'sente'],
    [4, 0, 'rook', 'sente'],
    [0, 4, 'king', 'gote'],
  ];
  const checking = playTurn(stateWith(pieces), 'checkVoidsTrap', scripted({
    pitfall: { row: 5, col: 5 },
    action: move([4, 0], [0, 0], 'rook'),
  }));
  assert.equal(checking.record.event, 'voided');
  assert.equal(checking.state.pitfalls.sente, null);

  const quiet = playTurn(stateWith(pieces), 'checkVoidsTrap', scripted({
    pitfall: { row: 5, col: 5 },
    action: move([4, 0], [5, 0], 'rook'),
  }));
  assert.equal(quiet.record.event, null);
  assert.deepEqual(quiet.state.pitfalls.sente.position, { row: 5, col: 5 });

  const standard = playTurn(stateWith(pieces), 'standard', scripted({
    pitfall: { row: 5, col: 5 },
    action: move([4, 0], [0, 0], 'rook'),
  }));
  assert.deepEqual(standard.state.pitfalls.sente.position, { row: 5, col: 5 }, 'A keeps the trap');
});

// --- エンジン: 変種ルールを理解して読む -------------------------------------------------

test('engine under B never expects a trap on king moves', () => {
  const view = getPlayerView(IN_CHECK(), 'sente');
  const decision = mind.decideMindGameMove(view, { rules: 'kingImmune', random: () => 0 });
  for (const candidate of decision.candidates) {
    if (candidate.action.piece.kind === 'king') {
      assert.equal(candidate.trappable, false);
      assert.equal(candidate.trapProbability, 0);
    }
  }
});

test('engine under C expects the best answer to check to be trapped; under D expects no trap', () => {
  const view = getPlayerView(IN_CHECK(), 'sente');
  const retry = mind.decideMindGameMove(view, { rules: 'checkRetry', random: () => 0 });
  assert.equal(retry.candidates[0].trapProbability, 1);
  assert.equal(retry.gameValue, retry.candidates[1].value);

  const voided = mind.decideMindGameMove(view, { rules: 'checkVoidsTrap', random: () => 0 });
  assert.ok(voided.candidates.every(candidate => !candidate.trappable));
  assert.equal(voided.gameValue, voided.candidates[0].value);
});

test('engine retry avoids the revealed trap square', () => {
  const view = getPlayerView(IN_CHECK(), 'sente');
  const decision = mind.decideMindGameMove(view, { rules: 'checkRetry', revealedTrap: { row: 8, col: 3 }, random: () => 0 });
  assert.ok(decision.candidates.every(candidate => !(candidate.to.row === 8 && candidate.to.col === 3)));
  assert.ok(decision.candidates.every(candidate => !candidate.trappable));
});

// --- 決着の分類 ---------------------------------------------------------------------------

function checkRecord(player, extra) {
  return { player, inCheck: true, check: { destinations: 3, kingEscapes: 1 }, trapped: false, attemptedSaving: true, event: null, decision: null, ...extra };
}

test('ending classification separates roulette, trap mate, mate, blunders and hopeless positions', () => {
  const win = { player: 'sente', inCheck: false, check: null, trapped: false, event: null, decision: null };
  assert.equal(classifyEnding([checkRecord('gote', { trapped: true }), win], 'sente'), 'roulette');
  assert.equal(classifyEnding([checkRecord('gote', { trapped: true, check: { destinations: 1, kingEscapes: 1 } }), win], 'sente'), 'trap-mate');
  assert.equal(classifyEnding([checkRecord('gote', { check: { destinations: 0, kingEscapes: 0 } }), win], 'sente'), 'mate');
  assert.equal(classifyEnding([checkRecord('gote', { attemptedSaving: false }), win], 'sente'), 'missed-defense');
  assert.equal(classifyEnding([{ ...win, player: 'gote' }, win], 'sente'), 'self-exposure');
  assert.equal(classifyEnding([{ ...win, player: 'gote', decision: { gameValue: -0.99 } }, win], 'sente'), 'hopeless');
  assert.equal(classifyEnding([checkRecord('gote', { event: 'retry', trapped: true, check: { destinations: 1, kingEscapes: 0 } }), win], 'sente'), 'trap-mate');
  assert.equal(classifyEnding([], null), 'draw');
});
