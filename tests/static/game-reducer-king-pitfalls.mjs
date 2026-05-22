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

const { createInitialGameState } = loadGameModule('src/game/constants.ts');
const { gameReducer } = loadGameModule('src/game/reducer.ts');
const { isPlayerInCheck } = loadGameModule('src/game/board.ts');

function emptyBoard() {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => null));
}

function withMoveSelection(overrides = {}) {
  return {
    ...createInitialGameState('pvp', true),
    phase: { type: 'MOVE_SELECTION' },
    pendingPitfall: { position: { row: 4, col: 4 }, owner: 'sente' },
    ...overrides,
  };
}

test('初期配置は飛車と角を標準位置に置く', () => {
  const state = createInitialGameState('pvp', true);

  assert.deepEqual(state.board[1][1], { kind: 'rook', owner: 'gote' });
  assert.deepEqual(state.board[1][7], { kind: 'bishop', owner: 'gote' });
  assert.deepEqual(state.board[7][1], { kind: 'bishop', owner: 'sente' });
  assert.deepEqual(state.board[7][7], { kind: 'rook', owner: 'sente' });
});

test('自分の王マスに罠を置けない', () => {
  const state = createInitialGameState('pvp', true);
  const next = gameReducer(state, {
    type: 'PLACE_PITFALL',
    position: { row: 8, col: 4 },
  });

  assert.equal(next.phase.type, 'PITFALL_PLACEMENT');
  assert.equal(next.pendingPitfall, null);
});

test('相手の王マスに罠を置けない', () => {
  const state = createInitialGameState('pvp', true);
  const next = gameReducer(state, {
    type: 'PLACE_PITFALL',
    position: { row: 0, col: 4 },
  });

  assert.equal(next.phase.type, 'PITFALL_PLACEMENT');
  assert.equal(next.pendingPitfall, null);
});

test('王を取れる手は落とし穴より勝利になる', () => {
  const board = emptyBoard();
  board[1][4] = { kind: 'rook', owner: 'sente' };
  board[0][4] = { kind: 'king', owner: 'gote' };
  const state = withMoveSelection({
    board,
    pitfalls: {
      sente: null,
      gote: { position: { row: 0, col: 4 }, owner: 'gote' },
    },
  });

  const next = gameReducer(state, {
    type: 'EXECUTE_MOVE',
    action: {
      type: 'move',
      from: { row: 1, col: 4 },
      to: { row: 0, col: 4 },
      piece: { kind: 'rook', owner: 'sente' },
    },
  });

  assert.equal(next.phase.type, 'GAME_OVER');
  assert.equal(next.winner, 'sente');
  assert.equal(next.log.at(-1).pitfallTriggered, false);
});

test('王が罠マスへ逃げようとすると移動失敗する', () => {
  const board = emptyBoard();
  board[1][4] = { kind: 'king', owner: 'sente' };
  const state = withMoveSelection({
    board,
    pitfalls: {
      sente: null,
      gote: { position: { row: 0, col: 4 }, owner: 'gote' },
    },
  });

  const next = gameReducer(state, {
    type: 'EXECUTE_MOVE',
    action: {
      type: 'move',
      from: { row: 1, col: 4 },
      to: { row: 0, col: 4 },
      piece: { kind: 'king', owner: 'sente' },
    },
  });

  assert.equal(next.phase.type, 'PASS_DEVICE');
  assert.equal(next.winner, null);
  assert.equal(next.board[1][4]?.kind, 'king');
  assert.equal(next.board[0][4], null);
  assert.equal(next.log.at(-1).pitfallTriggered, true);
});

test('同じプレイヤーは前回と同じマスへ連続で罠を置けない', () => {
  const state = {
    ...createInitialGameState('pvp', true),
    lastPitfallPositionByPlayer: {
      sente: { row: 4, col: 4 },
      gote: null,
    },
  };

  const next = gameReducer(state, {
    type: 'PLACE_PITFALL',
    position: { row: 4, col: 4 },
  });

  assert.equal(next.phase.type, 'PITFALL_PLACEMENT');
  assert.equal(next.pendingPitfall, null);
});

test('相手の前回罠マスは自分の罠設置を妨げない', () => {
  const state = {
    ...createInitialGameState('pvp', true),
    lastPitfallPositionByPlayer: {
      sente: null,
      gote: { row: 4, col: 4 },
    },
  };

  const next = gameReducer(state, {
    type: 'PLACE_PITFALL',
    position: { row: 4, col: 4 },
  });

  assert.equal(next.phase.type, 'MOVE_SELECTION');
  assert.deepEqual(next.pendingPitfall.position, { row: 4, col: 4 });
});

test('1回別のマスに置けば以前の罠マスに再設置できる', () => {
  let state = createInitialGameState('pvp', true);
  state = gameReducer(state, { type: 'PLACE_PITFALL', position: { row: 4, col: 4 } });
  state = gameReducer(state, {
    type: 'EXECUTE_MOVE',
    action: {
      type: 'move',
      from: { row: 6, col: 0 },
      to: { row: 5, col: 0 },
      piece: { kind: 'pawn', owner: 'sente' },
    },
  });
  state = gameReducer(state, { type: 'ACKNOWLEDGE_PASS_DEVICE' });
  state = gameReducer(state, { type: 'PLACE_PITFALL', position: { row: 3, col: 3 } });
  state = gameReducer(state, {
    type: 'EXECUTE_MOVE',
    action: {
      type: 'move',
      from: { row: 2, col: 0 },
      to: { row: 3, col: 0 },
      piece: { kind: 'pawn', owner: 'gote' },
    },
  });
  state = gameReducer(state, { type: 'ACKNOWLEDGE_PASS_DEVICE' });
  state = gameReducer(state, { type: 'PLACE_PITFALL', position: { row: 4, col: 5 } });
  state = gameReducer(state, {
    type: 'EXECUTE_MOVE',
    action: {
      type: 'move',
      from: { row: 6, col: 1 },
      to: { row: 5, col: 1 },
      piece: { kind: 'pawn', owner: 'sente' },
    },
  });
  state = gameReducer(state, { type: 'ACKNOWLEDGE_PASS_DEVICE' });
  state = gameReducer(state, { type: 'PLACE_PITFALL', position: { row: 3, col: 4 } });
  state = gameReducer(state, {
    type: 'EXECUTE_MOVE',
    action: {
      type: 'move',
      from: { row: 2, col: 1 },
      to: { row: 3, col: 1 },
      piece: { kind: 'pawn', owner: 'gote' },
    },
  });
  state = gameReducer(state, { type: 'ACKNOWLEDGE_PASS_DEVICE' });

  const next = gameReducer(state, { type: 'PLACE_PITFALL', position: { row: 4, col: 4 } });

  assert.equal(next.phase.type, 'MOVE_SELECTION');
  assert.deepEqual(next.pendingPitfall.position, { row: 4, col: 4 });
});

test('Local resign ends the game with the opponent as winner', () => {
  const state = createInitialGameState('pvp', true);
  const next = gameReducer(state, { type: 'RESIGN' });

  assert.equal(next.phase.type, 'GAME_OVER');
  assert.equal(next.winner, 'gote');
});

test('簡易王手アラートは相手の合法手が自分の王を取れるときだけ検出する', () => {
  const board = emptyBoard();
  board[4][4] = { kind: 'king', owner: 'sente' };
  board[4][0] = { kind: 'rook', owner: 'gote' };
  board[0][0] = { kind: 'king', owner: 'gote' };

  assert.equal(isPlayerInCheck(board, 'sente'), true);
  assert.equal(isPlayerInCheck(board, 'gote'), false);
});
