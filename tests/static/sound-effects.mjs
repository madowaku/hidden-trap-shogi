import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const moduleCache = new Map();

function loadModule(relativePath) {
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
    if (specifier === 'react') {
      return {
        useCallback: (fn) => fn,
        useEffect: () => undefined,
        useRef: (value) => ({ current: value }),
        useState: (value) => [typeof value === 'function' ? value() : value, () => undefined],
      };
    }
    if (specifier.startsWith('@/')) {
      return loadModule(`${specifier.replace('@/', 'src/')}.ts`);
    }
    if (specifier.startsWith('./')) {
      return loadModule(resolve(dirname(relativePath), `${specifier}.ts`));
    }
    throw new Error(`Unsupported import in test loader: ${specifier}`);
  };

  new Script(`(function (exports, require, module) { ${output}\n})`, {
    filename,
  }).runInThisContext()(cjsModule.exports, localRequire, cjsModule);

  return cjsModule.exports;
}

test('Sound OFF makes playSound a no-op', () => {
  const { createSoundPlayer } = loadModule('src/hooks/useSound.ts');
  let createdAudio = 0;
  const player = createSoundPlayer({
    getSettings: () => ({ enabled: false, volume: 0.8 }),
    isUnlocked: () => true,
    createAudio: () => {
      createdAudio += 1;
      return { play: () => Promise.resolve(), volume: 1, currentTime: 0 };
    },
  });

  assert.equal(player.playSound('move'), false);
  assert.equal(createdAudio, 0);
});

test('same sound event key is not replayed twice', () => {
  const { createSoundPlayer } = loadModule('src/hooks/useSound.ts');
  let playCount = 0;
  const player = createSoundPlayer({
    getSettings: () => ({ enabled: true, volume: 0.8 }),
    isUnlocked: () => true,
    createAudio: () => ({
      play: () => {
        playCount += 1;
        return Promise.resolve();
      },
      volume: 1,
      currentTime: 0,
    }),
  });

  assert.equal(player.playSound('trapHit', 'log:7'), true);
  assert.equal(player.playSound('trapHit', 'log:7'), false);
  assert.equal(playCount, 1);
});

test('sound settings are restored from localStorage shape', () => {
  const { readSoundSettings } = loadModule('src/hooks/useSound.ts');

  assert.deepEqual(
    readSoundSettings({ getItem: () => JSON.stringify({ enabled: false, volume: 0.5 }) }),
    { enabled: false, volume: 0.5 }
  );
});

test('sound v0 exposes all requested event ids and UI wiring', () => {
  const soundsSource = readFileSync(resolve(root, 'src/constants/sounds.ts'), 'utf8');
  const pageSource = readFileSync(resolve(root, 'src/app/page.tsx'), 'utf8');

  for (const eventName of ['move', 'trapPlace', 'trapHit', 'trapMissReveal', 'check', 'gameOver']) {
    assert.match(soundsSource, new RegExp(eventName));
  }

  assert.equal(existsSync(resolve(root, 'public/sounds/.gitkeep')), true);
  for (const filename of [
    'move.wav',
    'trap-place.wav',
    'trap-hit.wav',
    'trap-miss-reveal.wav',
    'check.wav',
    'game-over.wav',
  ]) {
    assert.equal(existsSync(resolve(root, `public/sounds/${filename}`)), true);
  }
  assert.match(pageSource, /useSound/);
  assert.match(pageSource, /Sound ON/);
  assert.match(pageSource, /Sound OFF/);
  assert.match(pageSource, /playSound\('trapPlace'/);
  assert.match(pageSource, /playSound\('trapHit'/);
  assert.match(pageSource, /playSound\('trapMissReveal'/);
  assert.match(pageSource, /playSound\('check'/);
  assert.match(pageSource, /playSound\('gameOver'/);
});

test('sound effects stay out of reducer and online room logic', () => {
  const reducerSource = readFileSync(resolve(root, 'src/game/reducer.ts'), 'utf8');
  const roomSource = readFileSync(resolve(root, 'src/game/room.ts'), 'utf8');

  assert.doesNotMatch(reducerSource, /playSound|useSound|Audio\(/);
  assert.doesNotMatch(roomSource, /playSound|useSound|Audio\(/);
});
