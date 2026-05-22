import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const moduleCache = new Map();

function loadGameModule(relativePath) {
  const filename = resolve(root, relativePath);
  if (moduleCache.has(filename)) return moduleCache.get(filename).exports;

  const source = readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;

  const cjsModule = { exports: {} };
  moduleCache.set(filename, cjsModule);

  const localRequire = (specifier) => {
    if (specifier.startsWith('./')) {
      return loadGameModule(resolve(dirname(relativePath), `${specifier}.ts`));
    }
    throw new Error(`Unsupported import in test loader: ${specifier}`);
  };

  new Script(`(function (exports, require, module) { ${output}\n})`, {
    filename,
  }).runInThisContext()(cjsModule.exports, localRequire, cjsModule);

  return cjsModule.exports;
}

const {
  simpleBot,
  BOT_LEVEL_PROFILES,
  buildTrapBelief,
  buildOpponentTrapTendency,
} = loadGameModule('src/game/bot.ts');
const { createEmptyHand } = loadGameModule('src/game/constants.ts');

function emptyBoard() {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => null));
}

function baseState(hiddenTrapPosition) {
  const board = emptyBoard();
  board[4][4] = { kind: 'rook', owner: 'gote' };
  board[4][6] = { kind: 'rook', owner: 'sente' };

  return {
    board,
    currentPlayer: 'gote',
    turn: 8,
    phase: { type: 'MOVE_SELECTION' },
    pitfalls: {
      sente: { position: hiddenTrapPosition, owner: 'sente' },
      gote: { position: { row: 2, col: 2 }, owner: 'gote' },
    },
    pendingPitfall: null,
    hands: {
      sente: createEmptyHand(),
      gote: createEmptyHand(),
    },
    log: [],
    config: {
      casualMode: true,
      gameMode: 'pvbot',
      botLevel: 'hard',
      botPlayer: 'gote',
    },
    winner: null,
  };
}

function withDeterministicRandom(fn) {
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    return fn();
  } finally {
    Math.random = originalRandom;
  }
}

function actionTarget(action) {
  return { row: action.to.row, col: action.to.col };
}

function riskAt(belief, position) {
  return belief.risks.find((entry) => (
    entry.position.row === position.row && entry.position.col === position.col
  ))?.trapRisk ?? 0;
}

function moveAction(from, to, piece, captured = null) {
  return {
    type: 'move',
    from,
    to,
    piece,
    captured,
  };
}

function logTrapHit(turn, failedAction, trapPosition = failedAction.to) {
  return {
    turn,
    player: 'gote',
    action: null,
    failedAction,
    pitfallSet: { row: 0, col: 0 },
    pitfallTriggered: true,
    triggeredPitfall: trapPosition,
  };
}

test('Bot move choice does not change when only the unpublished opponent trap changes', () => {
  const trapOnBestMove = baseState({ row: 4, col: 6 });
  const trapElsewhere = baseState({ row: 6, col: 6 });

  const [moveWithTrapOnBestMove, moveWithTrapElsewhere] = withDeterministicRandom(() => [
    simpleBot.decideMove(trapOnBestMove, 'gote', 'hard'),
    simpleBot.decideMove(trapElsewhere, 'gote', 'hard'),
  ]);

  assert.deepEqual(actionTarget(moveWithTrapOnBestMove), actionTarget(moveWithTrapElsewhere));
  assert.deepEqual(actionTarget(moveWithTrapOnBestMove), { row: 4, col: 6 });
});

test('Bot code does not directly read the active opponent pitfall while scoring moves', () => {
  const source = readFileSync(new URL('../../src/game/bot.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /state\.pitfalls\[opponent\]/);
  assert.match(source, /buildTrapBelief/);
  assert.match(source, /estimateActionTrapRisk/);
  assert.match(source, /triggeredPitfall \?\? entry\.revealedPitfall/);
});

test('Bot levels expose tuning profiles for suspicion, greed, risk, and memory', () => {
  for (const level of ['easy', 'normal', 'hard']) {
    const profile = BOT_LEVEL_PROFILES[level];
    assert.equal(typeof profile.trapSuspicion, 'number');
    assert.equal(typeof profile.greediness, 'number');
    assert.equal(typeof profile.riskTolerance, 'number');
    assert.equal(typeof profile.memoryWeight, 'number');
  }

  assert.ok(BOT_LEVEL_PROFILES.easy.greediness > BOT_LEVEL_PROFILES.hard.greediness);
  assert.ok(BOT_LEVEL_PROFILES.hard.trapSuspicion > BOT_LEVEL_PROFILES.easy.trapSuspicion);
  assert.ok(BOT_LEVEL_PROFILES.hard.memoryWeight > BOT_LEVEL_PROFILES.normal.memoryWeight);
  assert.ok(BOT_LEVEL_PROFILES.normal.memoryWeight > BOT_LEVEL_PROFILES.easy.memoryWeight);
  assert.ok(BOT_LEVEL_PROFILES.easy.riskTolerance > BOT_LEVEL_PROFILES.hard.riskTolerance);
});

test('TrapBelief does not change when only the unpublished opponent trap changes', () => {
  const trapOnBestMove = baseState({ row: 4, col: 6 });
  const trapElsewhere = baseState({ row: 6, col: 6 });

  const beliefA = buildTrapBelief(trapOnBestMove, 'gote', BOT_LEVEL_PROFILES.hard);
  const beliefB = buildTrapBelief(trapElsewhere, 'gote', BOT_LEVEL_PROFILES.hard);

  assert.deepEqual(beliefA, beliefB);
});

test('TrapBelief raises risk for tempting captures', () => {
  const state = baseState({ row: 1, col: 1 });
  const belief = buildTrapBelief(state, 'gote', BOT_LEVEL_PROFILES.normal);

  assert.ok(
    riskAt(belief, { row: 4, col: 6 }) > riskAt(belief, { row: 4, col: 5 }),
    'capturing a rook should look more trap-like than a quiet adjacent square'
  );
});

test('TrapBelief raises risk for promotable destinations', () => {
  const state = baseState({ row: 1, col: 1 });
  state.board[4][4] = null;
  state.board[5][4] = { kind: 'rook', owner: 'gote' };

  const belief = buildTrapBelief(state, 'gote', BOT_LEVEL_PROFILES.normal);

  assert.ok(
    riskAt(belief, { row: 6, col: 4 }) > riskAt(belief, { row: 5, col: 5 }),
    'a promotable rook destination should carry extra trap risk'
  );
});

test('trapRisk penalty is weaker on Easy than Hard in debug summaries', () => {
  const state = baseState({ row: 1, col: 1 });

  const easy = simpleBot.debugMoveCandidates(state, 'gote', 'easy', 8)
    .find((candidate) => candidate.to.row === 4 && candidate.to.col === 6);
  const hard = simpleBot.debugMoveCandidates(state, 'gote', 'hard', 8)
    .find((candidate) => candidate.to.row === 4 && candidate.to.col === 6);

  assert.ok(easy);
  assert.ok(hard);
  assert.equal(easy.trapRisk, hard.trapRisk);
  assert.ok(easy.trapPenalty < hard.trapPenalty);
});

test('Easy bot still prioritizes a direct king capture', () => {
  const state = baseState({ row: 1, col: 1 });
  state.board[4][6] = { kind: 'king', owner: 'sente' };

  const chosen = withDeterministicRandom(() => simpleBot.decideMove(state, 'gote', 'easy'));

  assert.deepEqual(actionTarget(chosen), { row: 4, col: 6 });
});

test('Easy bot samples from scored upper-to-middle candidates instead of all legal moves', () => {
  const state = baseState({ row: 1, col: 1 });

  const chosen = withDeterministicRandom(() => {
    Math.random = () => 0.99;
    return simpleBot.decideMove(state, 'gote', 'easy');
  });
  const ranked = simpleBot.debugMoveCandidates(state, 'gote', 'easy', 99);
  const chosenIndex = ranked.findIndex((candidate) => (
    candidate.to.row === chosen.to.row
    && candidate.to.col === chosen.to.col
    && candidate.action.type === chosen.type
  ));

  assert.ok(chosenIndex >= 0);
  assert.ok(
    chosenIndex < Math.ceil(ranked.length * 0.6),
    `expected Easy to avoid the bottom random pool, got rank ${chosenIndex + 1}/${ranked.length}`
  );
});

test('king captures remain above trap-risk penalties', () => {
  const state = baseState({ row: 1, col: 1 });
  state.board[4][6] = { kind: 'king', owner: 'sente' };

  const chosen = simpleBot.decideMove(state, 'gote', 'hard');

  assert.deepEqual(actionTarget(chosen), { row: 4, col: 6 });
});

test('Bot does not choose the same pitfall square it placed last time', () => {
  const state = baseState({ row: 1, col: 1 });
  state.currentPlayer = 'gote';
  state.phase = { type: 'PITFALL_PLACEMENT' };
  state.lastPitfallPositionByPlayer = {
    sente: null,
    gote: { row: 4, col: 6 },
  };

  const chosen = withDeterministicRandom(() => simpleBot.decidePitfall(state, 'gote', 'hard'));

  assert.notDeepEqual(chosen, { row: 4, col: 6 });
});

test('opponent trap tendency learns capture-trap habits from public trap hits', () => {
  const state = baseState({ row: 1, col: 1 });
  state.log = [
    logTrapHit(1, moveAction(
      { row: 4, col: 4 },
      { row: 4, col: 6 },
      { kind: 'rook', owner: 'gote' },
      { kind: 'rook', owner: 'sente' }
    )),
    logTrapHit(3, moveAction(
      { row: 4, col: 4 },
      { row: 4, col: 6 },
      { kind: 'rook', owner: 'gote' },
      { kind: 'rook', owner: 'sente' }
    )),
  ];

  const tendency = buildOpponentTrapTendency(state, 'gote');
  const belief = buildTrapBelief(state, 'gote', BOT_LEVEL_PROFILES.hard);

  assert.ok(tendency.captureBias > 0.5);
  assert.ok(riskAt(belief, { row: 4, col: 6 }) > 240);
});

test('opponent trap tendency learns promotion-trap habits from public trap hits', () => {
  const state = baseState({ row: 1, col: 1 });
  state.board[4][4] = null;
  state.board[5][4] = { kind: 'rook', owner: 'gote' };
  state.log = [
    logTrapHit(1, moveAction(
      { row: 5, col: 4 },
      { row: 6, col: 4 },
      { kind: 'rook', owner: 'gote' }
    )),
    logTrapHit(3, moveAction(
      { row: 5, col: 4 },
      { row: 6, col: 4 },
      { kind: 'rook', owner: 'gote' }
    )),
  ];

  const tendency = buildOpponentTrapTendency(state, 'gote');
  const belief = buildTrapBelief(state, 'gote', BOT_LEVEL_PROFILES.hard);

  assert.ok(tendency.promotionBias > 0.5);
  assert.ok(riskAt(belief, { row: 6, col: 4 }) > riskAt(belief, { row: 5, col: 5 }));
});

test('opponent trap tendency learns king-area defense habits', () => {
  const state = baseState({ row: 1, col: 1 });
  state.board[4][6] = null;
  state.board[4][7] = { kind: 'king', owner: 'sente' };
  state.log = [
    logTrapHit(1, moveAction(
      { row: 4, col: 4 },
      { row: 4, col: 6 },
      { kind: 'rook', owner: 'gote' }
    )),
    logTrapHit(3, moveAction(
      { row: 4, col: 4 },
      { row: 4, col: 6 },
      { kind: 'rook', owner: 'gote' }
    )),
  ];

  const tendency = buildOpponentTrapTendency(state, 'gote');
  const belief = buildTrapBelief(state, 'gote', BOT_LEVEL_PROFILES.hard);

  assert.ok(tendency.kingAreaBias > 0.5);
  assert.ok(riskAt(belief, { row: 4, col: 6 }) > riskAt(belief, { row: 4, col: 0 }));
});
