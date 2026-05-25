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

test('search engine interface is a GameView-only boundary', () => {
  const source = readFileSync(resolve(root, 'src/game/search-engine.ts'), 'utf8');

  assert.match(source, /GameView/);
  assert.doesNotMatch(source, /GameState/);
  assert.doesNotMatch(source, /\bpitfalls\b/);
  assert.doesNotMatch(source, /\bpendingPitfall\b/);
});

test('createNoopSearchEngine returns stable candidates without reading hidden state', () => {
  const { createNoopSearchEngine } = loadGameModule('src/game/search-engine.ts');
  const view = {
    viewer: 'sente',
    board: [],
    currentPlayer: 'sente',
    turn: 1,
    phase: { type: 'PITFALL_PLACEMENT' },
    visiblePitfalls: [],
    hands: {
      sente: { rook: 0, bishop: 0, gold: 0, silver: 0, knight: 0, lance: 0, pawn: 0 },
      gote: { rook: 0, bishop: 0, gold: 0, silver: 0, knight: 0, lance: 0, pawn: 0 },
    },
    log: [],
    config: {
      casualMode: true,
      gameMode: 'pvbot',
      botLevel: 'normal',
      botPlayer: 'gote',
    },
    winner: null,
  };

  const first = createNoopSearchEngine().analyze(view, { maxCandidates: 3 });
  const second = createNoopSearchEngine().analyze(view, { maxCandidates: 3 });

  assert.deepEqual(first, second);
  assert.deepEqual(first, []);
});
