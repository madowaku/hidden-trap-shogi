import { existsSync, readFileSync } from 'node:fs';
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

const viewPath = resolve(root, 'src/game/view.ts');

function emptyBoard() {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => null));
}

function stateWithHiddenTraps() {
  return {
    board: emptyBoard(),
    currentPlayer: 'sente',
    turn: 12,
    phase: { type: 'MOVE_SELECTION' },
    pitfalls: {
      sente: { position: { row: 3, col: 3 }, owner: 'sente' },
      gote: { position: { row: 5, col: 5 }, owner: 'gote' },
    },
    pendingPitfall: { position: { row: 4, col: 4 }, owner: 'sente' },
    hands: {
      sente: { rook: 0, bishop: 0, gold: 0, silver: 0, knight: 0, lance: 0, pawn: 0 },
      gote: { rook: 0, bishop: 0, gold: 0, silver: 0, knight: 0, lance: 0, pawn: 0 },
    },
    log: [
      {
        turn: 11,
        player: 'gote',
        action: null,
        pitfallSet: { row: 2, col: 2 },
        pitfallTriggered: true,
        triggeredPitfall: { row: 6, col: 6 },
        revealedPitfall: { row: 6, col: 6 },
      },
    ],
    config: {
      casualMode: true,
      gameMode: 'pvp',
      botLevel: 'normal',
    },
    winner: null,
  };
}

test('getPlayerView omits raw hidden traps and exposes only viewer-visible traps', () => {
  assert.ok(existsSync(viewPath), 'src/game/view.ts should exist');
  const { getPlayerView } = loadGameModule('src/game/view.ts');

  const view = getPlayerView(stateWithHiddenTraps(), 'sente');

  assert.equal('pitfalls' in view, false);
  assert.equal('pendingPitfall' in view, false);
  assert.deepEqual(view.visiblePitfalls, [
    { position: { row: 3, col: 3 }, owner: 'sente' },
    { position: { row: 4, col: 4 }, owner: 'sente' },
  ]);
  assert.equal(view.log[0].triggeredPitfall.row, 6);
  assert.equal(view.log[0].revealedPitfall.row, 6);
});

test('spectator GameView is explicit and hides live traps', () => {
  assert.ok(existsSync(viewPath), 'src/game/view.ts should exist');
  const { getPlayerView } = loadGameModule('src/game/view.ts');

  const view = getPlayerView(stateWithHiddenTraps(), 'spectator');

  assert.equal(view.viewer, 'spectator');
  assert.deepEqual(view.visiblePitfalls, []);
});
