// 試遊用の比較版: A（現行）/ C（王手救済）/ D（王手で罠消滅）をアプリの reducer で遊べるようにした。
// 研究で使ったシミュレータ（scripts/research/variant-rules.mjs、reducer の外側で変種を再現）と
// 同じ手を指したとき、reducer が同じ局面・同じログになることを確かめる。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRandom, loadGameModule } from '../../scripts/research/load-game.mjs';
import { createMindAgent, playTurn } from '../../scripts/research/variant-rules.mjs';

const { gameReducer } = loadGameModule('src/game/reducer.ts');
const { createInitialGameState, createEmptyHand } = loadGameModule('src/game/constants.ts');
const { getPlayerView } = loadGameModule('src/game/view.ts');
const { simpleBot } = loadGameModule('src/game/bot.ts');

function withRule(state, trapRule) {
  return { ...state, config: { ...state.config, trapRule } };
}

/** reducer に 1 手番を渡す。promotion は研究側と同じく常に成る */
function dispatchTurn(state, pitfall, actions) {
  let next = gameReducer(state, { type: 'PLACE_PITFALL', position: pitfall });
  for (const action of actions) {
    if (next.phase.type !== 'MOVE_SELECTION') break;
    next = gameReducer(next, { type: 'EXECUTE_MOVE', action });
    if (next.phase.type === 'PROMOTION_DECISION') next = gameReducer(next, { type: 'DECIDE_PROMOTION', promote: true });
    if (next.phase.type === 'PASS_DEVICE') next = gameReducer(next, { type: 'ACKNOWLEDGE_PASS_DEVICE' });
  }
  return next;
}

const LOG_FIELDS = ['turn', 'player', 'action', 'pitfallSet', 'pitfallTriggered', 'failedAction', 'triggeredPitfall', 'revealedPitfall'];

function comparable(state) {
  const last = state.log.at(-1);
  return {
    board: state.board,
    hands: state.hands,
    currentPlayer: state.currentPlayer,
    turn: state.turn,
    phase: state.phase.type,
    winner: state.winner,
    pitfalls: state.pitfalls,
    lastPitfallPositionByPlayer: state.lastPitfallPositionByPlayer,
    lastLog: last ? Object.fromEntries(LOG_FIELDS.map(key => [key, last[key] ?? null])) : null,
  };
}

for (const [variant, casual] of [['checkRetry', true], ['checkVoidsTrap', true], ['checkRetry', false], ['checkVoidsTrap', false]]) {
  test(`reducer ${variant} (${casual ? 'Casual' : 'Strict'}) matches the research simulator move for move`, () => {
    let events = 0;
    for (let seed = 0; seed < 4; seed++) {
      const random = createRandom(9100 + seed);
      const agents = { sente: createMindAgent(variant, random), gote: createMindAgent(variant, random) };
      let research = createInitialGameState('pvbot', casual, 'gote', 'hard');
      let app = createInitialGameState('pvbot', casual, 'gote', 'hard', variant);
      for (let ply = 0; ply < 120 && research.phase.type !== 'GAME_OVER'; ply++) {
        const player = research.currentPlayer;
        let pitfall = null;
        const agent = agents[player];
        const recording = { ...agent, pitfall: (s, p) => (pitfall = agent.pitfall(s, p)) };
        const { state: next, record } = playTurn(research, variant, recording);
        app = dispatchTurn(app, pitfall, [record.action, record.retryAction].filter(Boolean));
        if (record.event) events += 1;

        assert.deepEqual(comparable(app), comparable(withRule(next, variant)), `seed ${seed} ply ${ply}`);
        const last = app.log.at(-1);
        assert.equal(Boolean(last.rescued), record.event === 'retry', `rescued flag, seed ${seed} ply ${ply}`);
        assert.equal(Boolean(last.voidedPitfall), record.event === 'voided', `voided flag, seed ${seed} ply ${ply}`);
        assert.equal(app.checkRetry ?? null, null);
        research = next;
      }
    }
    assert.ok(events > 0, `${variant}: the rule actually fired in these games`);
  });
}

test('standard rule: config and log keep the existing shape', () => {
  const state = createInitialGameState('pvbot', true, 'gote', 'hard');
  assert.equal('trapRule' in state.config, false);
  const explicit = createInitialGameState('pvbot', true, 'gote', 'hard', 'standard');
  assert.deepEqual(explicit, state);
});

// --- C: 指し直しの細部 --------------------------------------------------------------

function stateWith(pieces, { player = 'sente', traps = {}, trapRule, hands } = {}) {
  const base = createInitialGameState('pvbot', true, 'gote', 'hard', trapRule);
  const board = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => null));
  for (const [row, col, kind, owner] of pieces) board[row][col] = { kind, owner };
  return {
    ...base,
    board,
    currentPlayer: player,
    turn: 20,
    hands: hands ?? { sente: createEmptyHand(), gote: createEmptyHand() },
    pitfalls: {
      sente: traps.sente ? { position: traps.sente, owner: 'sente' } : null,
      gote: traps.gote ? { position: traps.gote, owner: 'gote' } : null,
    },
    lastPitfallPositionByPlayer: { sente: null, gote: null },
  };
}

const kingMove = (to) => ({ type: 'move', from: { row: 8, col: 4 }, to, piece: { kind: 'king', owner: 'sente' } });
const IN_CHECK = (trapRule) => stateWith([
  [8, 4, 'king', 'sente'],
  [4, 4, 'rook', 'gote'],
  [0, 0, 'king', 'gote'],
], { traps: { gote: { row: 8, col: 3 } }, trapRule });

test('C: the trapped answer to check waits for a retry, which cannot use the trap square', () => {
  let state = gameReducer(IN_CHECK('checkRetry'), { type: 'PLACE_PITFALL', position: { row: 2, col: 2 } });
  state = gameReducer(state, { type: 'EXECUTE_MOVE', action: kingMove({ row: 8, col: 3 }) });
  assert.equal(state.phase.type, 'MOVE_SELECTION');
  assert.equal(state.currentPlayer, 'sente');
  assert.deepEqual(state.checkRetry.trap, { row: 8, col: 3 });
  assert.equal(state.pitfalls.gote, null, 'the trap is used up');
  assert.equal(state.log.length, 0, 'nothing is logged until the retry');

  // 公開情報として両者・観戦者に見える
  for (const viewer of ['sente', 'gote', 'spectator']) {
    assert.deepEqual(getPlayerView(state, viewer).checkRetry, state.checkRetry, viewer);
  }

  assert.equal(gameReducer(state, { type: 'EXECUTE_MOVE', action: kingMove({ row: 8, col: 3 }) }), state, 'trap square is closed');

  const done = gameReducer(state, { type: 'EXECUTE_MOVE', action: kingMove({ row: 8, col: 5 }) });
  assert.equal(done.currentPlayer, 'gote');
  assert.equal(done.checkRetry, null);
  assert.equal(done.board[8][5]?.kind, 'king');
  const entry = done.log.at(-1);
  assert.equal(entry.rescued, true);
  assert.equal(entry.pitfallTriggered, true);
  assert.deepEqual(entry.failedAction.to, { row: 8, col: 3 });
  assert.deepEqual(entry.triggeredPitfall, { row: 8, col: 3 });
  assert.deepEqual(entry.action.to, { row: 8, col: 5 });
});

test('C: no retry without check, and A never retries', () => {
  const quiet = stateWith([
    [8, 4, 'king', 'sente'],
    [0, 0, 'king', 'gote'],
  ], { traps: { gote: { row: 8, col: 3 } }, trapRule: 'checkRetry' });
  let state = gameReducer(quiet, { type: 'PLACE_PITFALL', position: { row: 2, col: 2 } });
  state = gameReducer(state, { type: 'EXECUTE_MOVE', action: kingMove({ row: 8, col: 3 }) });
  assert.equal(state.currentPlayer, 'gote');
  assert.equal(state.log.at(-1).action, null);

  let standard = gameReducer(IN_CHECK(undefined), { type: 'PLACE_PITFALL', position: { row: 2, col: 2 } });
  standard = gameReducer(standard, { type: 'EXECUTE_MOVE', action: kingMove({ row: 8, col: 3 }) });
  assert.equal(standard.currentPlayer, 'gote');
  assert.equal(standard.log.at(-1).rescued, undefined);
});

test('C: the bots retry on a different square at every level', () => {
  for (const level of ['easy', 'normal', 'hard']) {
    let state = gameReducer(IN_CHECK('checkRetry'), { type: 'PLACE_PITFALL', position: { row: 2, col: 2 } });
    state = gameReducer(state, { type: 'EXECUTE_MOVE', action: kingMove({ row: 8, col: 3 }) });
    for (let i = 0; i < 20; i++) {
      const action = simpleBot.decideMove(state, 'sente', level);
      assert.notDeepEqual(action.to, { row: 8, col: 3 }, level);
      assert.notEqual(gameReducer(state, { type: 'EXECUTE_MOVE', action }), state, level);
    }
  }
});

// --- D: 王手で罠が消える ------------------------------------------------------------

test('D: giving check voids the trap placed this turn; the log only says it was voided', () => {
  const pieces = [
    [8, 8, 'king', 'sente'],
    [4, 0, 'rook', 'sente'],
    [0, 4, 'king', 'gote'],
  ];
  const rook = (to) => ({ type: 'move', from: { row: 4, col: 0 }, to, piece: { kind: 'rook', owner: 'sente' }, promote: false });

  let checking = gameReducer(stateWith(pieces, { trapRule: 'checkVoidsTrap' }), { type: 'PLACE_PITFALL', position: { row: 1, col: 4 } });
  checking = gameReducer(checking, { type: 'EXECUTE_MOVE', action: rook({ row: 0, col: 0 }) });
  assert.equal(checking.pitfalls.sente, null);
  assert.equal(checking.log.at(-1).voidedPitfall, true);
  // 王手された側からは、消えた罠の位置は見えない
  assert.equal(getPlayerView(checking, 'gote').log.at(-1).pitfallSet, undefined);
  assert.equal(getPlayerView(checking, 'gote').log.at(-1).voidedPitfall, true);
  // 同じマスへの連続設置の禁止は残る
  assert.deepEqual(checking.lastPitfallPositionByPlayer.sente, { row: 1, col: 4 });

  let quiet = gameReducer(stateWith(pieces, { trapRule: 'checkVoidsTrap' }), { type: 'PLACE_PITFALL', position: { row: 1, col: 4 } });
  quiet = gameReducer(quiet, { type: 'EXECUTE_MOVE', action: rook({ row: 5, col: 0 }) });
  assert.deepEqual(quiet.pitfalls.sente.position, { row: 1, col: 4 });
  assert.equal(quiet.log.at(-1).voidedPitfall, undefined);
});
