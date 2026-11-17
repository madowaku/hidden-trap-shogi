// 決着の振り返り（src/game/ending.ts）と試遊ログ（src/game/playtest.ts）

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRandom, loadGameModule, root } from '../../scripts/research/load-game.mjs';
import { classifyEnding, createMindAgent, playTurn } from '../../scripts/research/variant-rules.mjs';

const { gameReducer } = loadGameModule('src/game/reducer.ts');
const { createInitialGameState } = loadGameModule('src/game/constants.ts');
const { explainEnding, formatSquare } = loadGameModule('src/game/ending.ts');
const { summarizePlaytest, upsertPlaytestRecord, parsePlaytestLog } = loadGameModule('src/game/playtest.ts');

const P = (row, col) => ({ row, col });
const move = (from, to, kind, owner, extra = {}) => ({
  type: 'EXECUTE_MOVE',
  action: { type: 'move', from: P(...from), to: P(...to), piece: { kind, owner }, ...extra },
});
const trap = (row, col) => ({ type: 'PLACE_PITFALL', position: P(row, col) });

/** ▲7六歩 △3四歩 ▲2二角成 △同銀 ▲1六歩 △8六角打（王手）。後手の罠は 6八 */
function checkedPosition(trapRule) {
  let state = createInitialGameState('pvbot', true, 'gote', 'hard', trapRule);
  for (const action of [
    trap(4, 8), move([6, 2], [5, 2], 'pawn', 'sente'),
    trap(4, 0), move([2, 6], [3, 6], 'pawn', 'gote'),
    trap(4, 7), move([7, 1], [1, 7], 'bishop', 'sente', { promote: true }),
    trap(4, 6), move([0, 6], [1, 7], 'silver', 'gote'),
    trap(4, 5), move([6, 8], [5, 8], 'pawn', 'sente'),
    trap(7, 3), { type: 'EXECUTE_MOVE', action: { type: 'drop', to: P(5, 1), piece: { kind: 'bishop', owner: 'gote' } } },
    trap(3, 3),
  ]) {
    state = gameReducer(state, action);
  }
  return state;
}

const CAPTURE_KING = [trap(4, 4), move([5, 1], [8, 4], 'bishop', 'gote', { promote: false })];

test('A: the answer to check walks into the trap → roulette, with every answer listed', () => {
  let state = checkedPosition();
  for (const action of [move([8, 3], [7, 3], 'gold', 'sente'), ...CAPTURE_KING]) state = gameReducer(state, action);
  assert.equal(state.winner, 'gote');
  const ending = explainEnding(state.log, 'gote');
  assert.equal(ending.kind, 'roulette');
  assert.equal(ending.loserWasInCheck, true);
  assert.deepEqual(ending.trapSquare, P(7, 3));
  assert.deepEqual(ending.defenseSquares.map(formatSquare).sort(), ['4八', '5八', '6八', '7七', '8六']);
});

test('C: a retry that does not answer the check → rescueFailed', () => {
  let state = checkedPosition('checkRetry');
  for (const action of [
    move([8, 3], [7, 3], 'gold', 'sente'),
    move([7, 7], [7, 6], 'rook', 'sente'),
    ...CAPTURE_KING,
  ]) state = gameReducer(state, action);
  const ending = explainEnding(state.log, 'gote');
  assert.equal(ending.kind, 'rescueFailed');
  assert.deepEqual(ending.retrySquare, P(7, 6));
  assert.equal(formatSquare(ending.retrySquare), '3八');
});

test('resignation is explained as resignation', () => {
  const resigned = gameReducer(checkedPosition(), { type: 'RESIGN' });
  assert.equal(explainEnding(resigned.log, 'gote').kind, 'resign');
});

const KIND_FROM_RESEARCH = {
  roulette: ['roulette'],
  'trap-mate': ['trapMate'],
  mate: ['mate'],
  'missed-defense': ['missedDefense', 'rescueFailed'],
  'self-exposure': ['selfExposure'],
  hopeless: ['selfExposure', 'missedDefense', 'rescueFailed'],
};

for (const variant of ['standard', 'checkRetry']) {
  test(`${variant}: the in-app explanation agrees with the research classification`, () => {
    let compared = 0;
    for (let seed = 0; seed < 8; seed++) {
      const random = createRandom(7300 + seed);
      const agents = { sente: createMindAgent(variant, random), gote: createMindAgent(variant, random) };
      let state = createInitialGameState('pvbot', true, 'gote', 'hard');
      const records = [];
      for (let ply = 0; ply < 200 && state.phase.type !== 'GAME_OVER'; ply++) {
        const result = playTurn(state, variant, agents[state.currentPlayer]);
        records.push(result.record);
        state = result.state;
      }
      if (!state.winner) continue;
      const research = classifyEnding(records, state.winner);
      const app = explainEnding(state.log, state.winner).kind;
      assert.ok(KIND_FROM_RESEARCH[research].includes(app), `seed ${seed}: research ${research}, app ${app}`);
      compared += 1;
    }
    assert.ok(compared >= 6);
  });
}

// --- 試遊ログ ---------------------------------------------------------------------

function record(id, extra) {
  return {
    id,
    finishedAt: '2026-11-17T00:00:00.000Z',
    trapRule: 'standard',
    gameMode: 'pvbot',
    botLevel: 'hard',
    casualMode: true,
    result: 'loss',
    ending: 'roulette',
    plies: 20,
    defenses: 3,
    trapHits: { sente: 0, gote: 1 },
    rescues: 0,
    voidedTraps: 0,
    acceptance: null,
    next: null,
    note: '',
    ...extra,
  };
}

test('playtest summary: loss fairness, rematch rate and endings are per rule', () => {
  const records = [
    record('a1', { acceptance: 2, next: 'switch', plies: 20 }),
    record('a2', { acceptance: 4, next: 'same', plies: 30 }),
    record('a3', { result: 'win', acceptance: 5, next: null, plies: 24, ending: 'trapMate' }),
    record('c1', { trapRule: 'checkRetry', acceptance: 5, next: 'same', ending: 'trapMate', plies: 40 }),
  ];
  const a = summarizePlaytest(records, 'standard');
  assert.equal(a.games, 3);
  assert.equal(a.wins, 1);
  assert.equal(a.losses, 2);
  assert.equal(a.medianPlies, 24);
  assert.equal(a.lossAcceptance, 3);
  assert.equal(a.againRate, 0.5);
  assert.deepEqual(a.endings, { roulette: 2, trapMate: 1 });

  const c = summarizePlaytest(records, 'checkRetry');
  assert.equal(c.games, 1);
  assert.equal(c.againRate, 1);
  const d = summarizePlaytest(records, 'checkVoidsTrap');
  assert.equal(d.games, 0);
  assert.equal(d.lossAcceptance, null);
});

test('playtest log: answers are added to the same record; broken storage reads as empty', () => {
  const created = upsertPlaytestRecord([], 'x', {}, record('x'));
  const rated = upsertPlaytestRecord(created, 'x', { acceptance: 3 });
  const chose = upsertPlaytestRecord(rated, 'x', { next: 'same' });
  assert.equal(chose.length, 1);
  assert.equal(chose[0].acceptance, 3);
  assert.equal(chose[0].next, 'same');
  assert.deepEqual(parsePlaytestLog('not json'), []);
  assert.deepEqual(parsePlaytestLog(JSON.stringify([{ nope: 1 }, record('y')])).map(r => r.id), ['y']);
});

test('page: the ending review and playtest log are local-only and the rule is chosen from three modes', () => {
  const page = readFileSync(resolve(root, 'src/app/page.tsx'), 'utf8');
  assert.match(page, /usePlaytestSession\(\{ state, trapRule, active: !isOnlineMode && !showStartScreen \}\)/);
  assert.match(page, /!isOnlineMode && playtest\.ending && \(/);
  assert.match(page, /<RuleModePicker/);
  assert.match(page, /<RuleStatusStrip/);
  assert.match(page, /<PlaytestLogPanel/);
  assert.match(page, /const activeTrapRule: TrapRule = isOnlineMode \? 'standard'/);

  const modes = readFileSync(resolve(root, 'src/game/ruleModes.ts'), 'utf8');
  assert.match(modes, /危険な選択肢から生き残る心理戦/);
  assert.match(modes, /相手の選択肢を一つに絞る戦略ゲーム/);
  // D は A/C の短期決戦比較に入れない
  const { TRAP_RULE_MODES, getComparisonRule } = loadGameModule('src/game/ruleModes.ts');
  assert.equal(TRAP_RULE_MODES.checkVoidsTrap.shortMatch, false);
  assert.equal(getComparisonRule('standard'), 'checkRetry');
  assert.equal(getComparisonRule('checkRetry'), 'standard');
  assert.equal(getComparisonRule('checkVoidsTrap'), null);
});
