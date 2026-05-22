import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Script } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const nodeRequire = createRequire(import.meta.url);
const moduleCache = new Map();

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

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
    if (specifier.startsWith('@/')) {
      return loadGameModule(`src/${specifier.slice(2)}.ts`);
    }
    if (specifier.startsWith('./')) {
      const candidate = resolve(dirname(relativePath), specifier);
      return loadGameModule(`${candidate}.ts`);
    }
    return nodeRequire(specifier);
  };

  new Script(output, { filename }).runInNewContext({
    exports: cjsModule.exports,
    module: cjsModule,
    require: localRequire,
    console,
  });

  return cjsModule.exports;
}

test('gote board orientation puts gote home rank at the bottom', () => {
  const orientation = loadGameModule('src/game/orientation.ts');

  assert.deepEqual(plain(orientation.getDisplayRows('sente')), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(plain(orientation.getDisplayCols('sente')), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(plain(orientation.getDisplayRows('gote')), [8, 7, 6, 5, 4, 3, 2, 1, 0]);
  assert.deepEqual(plain(orientation.getDisplayCols('gote')), [8, 7, 6, 5, 4, 3, 2, 1, 0]);
});

test('labels follow the displayed square order for each orientation', () => {
  const orientation = loadGameModule('src/game/orientation.ts');

  assert.deepEqual(plain(orientation.getDisplayColLabels('sente')), ['9', '8', '7', '6', '5', '4', '3', '2', '1']);
  assert.deepEqual(plain(orientation.getDisplayRowLabels('sente')), ['一', '二', '三', '四', '五', '六', '七', '八', '九']);
  assert.deepEqual(plain(orientation.getDisplayColLabels('gote')), ['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  assert.deepEqual(plain(orientation.getDisplayRowLabels('gote')), ['九', '八', '七', '六', '五', '四', '三', '二', '一']);
});

test('piece rotation is relative to the viewer side', () => {
  const orientation = loadGameModule('src/game/orientation.ts');

  assert.equal(orientation.shouldRotatePieceForViewer({ owner: 'sente' }, 'sente'), false);
  assert.equal(orientation.shouldRotatePieceForViewer({ owner: 'gote' }, 'sente'), true);
  assert.equal(orientation.shouldRotatePieceForViewer({ owner: 'gote' }, 'gote'), false);
  assert.equal(orientation.shouldRotatePieceForViewer({ owner: 'sente' }, 'gote'), true);
});

test('page wires online gote viewer to a rotated board and hand layout', () => {
  const pageSource = readFileSync(resolve(root, 'src/app/page.tsx'), 'utf8');

  assert.match(pageSource, /boardOrientation/);
  assert.match(pageSource, /onlineRoom\.assignedPlayer === 'gote'/);
  assert.match(pageSource, /topHandPlayer/);
  assert.match(pageSource, /bottomHandPlayer/);
  assert.match(pageSource, /orientation=\{boardOrientation\}/);
});

test('Board and Piece consume viewer-relative orientation', () => {
  const boardSource = readFileSync(resolve(root, 'src/components/Board.tsx'), 'utf8');
  const pieceSource = readFileSync(resolve(root, 'src/components/Piece.tsx'), 'utf8');

  assert.match(boardSource, /getDisplayRows\(orientation\)/);
  assert.match(boardSource, /getDisplayCols\(orientation\)/);
  assert.match(boardSource, /onCellClick\(pos\)/);
  assert.match(pieceSource, /shouldRotatePieceForViewer\(piece, orientation\)/);
});
