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
  applyMove,
  canPromote,
  getAllLegalMoves,
  getLegalDrops,
  getLegalMoves,
  mustPromote,
} = loadGameModule('src/game/board.ts');
const { createInitialBoard } = loadGameModule('src/game/constants.ts');

function emptyBoard() {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => null));
}

function countByPiece(moves) {
  return moves.reduce((counts, move) => {
    counts[move.piece.kind] = (counts[move.piece.kind] ?? 0) + 1;
    return counts;
  }, {});
}

function perftMovesOnly(board, player, depth) {
  if (depth === 0) return 1;
  let nodes = 0;
  for (const move of getAllLegalMoves(board, player)) {
    nodes += perftMovesOnly(applyMove(board, move), player === 'sente' ? 'gote' : 'sente', depth - 1);
  }
  return nodes;
}

test('initial board has fixed one-ply legal move counts', () => {
  const board = createInitialBoard();

  assert.equal(getAllLegalMoves(board, 'sente').length, 30);
  assert.equal(getAllLegalMoves(board, 'gote').length, 30);
  assert.deepEqual(countByPiece(getAllLegalMoves(board, 'sente')), {
    king: 3,
    gold: 6,
    silver: 4,
    lance: 2,
    pawn: 9,
    rook: 6,
  });
});

test('initial board has fixed two-ply move-only perft count', () => {
  const board = createInitialBoard();

  assert.equal(perftMovesOnly(board, 'sente', 1), 30);
  assert.equal(perftMovesOnly(board, 'sente', 2), 900);
});

test('drop generation records current hand-piece restrictions', () => {
  const board = createInitialBoard();

  assert.equal(getLegalDrops(board, 'sente', 'rook').length, 41);
  assert.equal(getLegalDrops(board, 'sente', 'pawn').length, 0);

  board[6][4] = null;
  assert.equal(getLegalDrops(board, 'sente', 'pawn').length, 6);

  const blank = emptyBoard();
  assert.equal(getLegalDrops(blank, 'sente', 'pawn').length, 72);
  assert.equal(getLegalDrops(blank, 'gote', 'pawn').length, 72);
  assert.equal(getLegalDrops(blank, 'sente', 'knight').length, 63);
  assert.equal(getLegalDrops(blank, 'gote', 'knight').length, 63);
});

test('promotion-zone positions record current promotable and forced-promotion counts', () => {
  const board = emptyBoard();
  board[3][4] = { kind: 'rook', owner: 'sente' };
  board[1][4] = { kind: 'gold', owner: 'gote' };

  const rookMoves = getLegalMoves(board, { row: 3, col: 4 });
  assert.equal(rookMoves.length, 15);
  assert.equal(
    rookMoves.filter((to) => canPromote(board[3][4], { row: 3, col: 4 }, to)).length,
    2
  );

  board[3][4] = null;
  board[1][4] = { kind: 'pawn', owner: 'sente' };
  const pawnDestination = getLegalMoves(board, { row: 1, col: 4 })[0];

  assert.deepEqual(pawnDestination, { row: 0, col: 4 });
  assert.equal(canPromote(board[1][4], { row: 1, col: 4 }, pawnDestination), true);
  assert.equal(mustPromote(board[1][4], pawnDestination), true);
});

test('nifu-style pawn drop counts are fixed by occupied friendly pawn files', () => {
  const board = createInitialBoard();

  for (let col = 0; col < 9; col++) board[6][col] = null;
  assert.equal(getLegalDrops(board, 'sente', 'pawn').length, 50);

  board[6][0] = { kind: 'pawn', owner: 'sente' };
  assert.equal(getLegalDrops(board, 'sente', 'pawn').length, 44);
});

test('sliding pieces stop at blockers and include enemy captures', () => {
  const board = emptyBoard();
  board[4][4] = { kind: 'rook', owner: 'sente' };
  board[4][2] = { kind: 'pawn', owner: 'sente' };
  board[4][6] = { kind: 'gold', owner: 'gote' };
  board[2][4] = { kind: 'silver', owner: 'gote' };

  assert.deepEqual(getLegalMoves(board, { row: 4, col: 4 }), [
    { row: 3, col: 4 },
    { row: 2, col: 4 },
    { row: 5, col: 4 },
    { row: 6, col: 4 },
    { row: 7, col: 4 },
    { row: 8, col: 4 },
    { row: 4, col: 3 },
    { row: 4, col: 5 },
    { row: 4, col: 6 },
  ]);
});
