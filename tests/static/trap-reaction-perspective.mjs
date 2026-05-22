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

function trapHitEntry(player = 'sente') {
  return {
    turn: 5,
    player,
    action: null,
    failedAction: {
      type: 'move',
      from: { row: 6, col: 4 },
      to: { row: 5, col: 4 },
      piece: { kind: 'pawn', owner: player },
    },
    pitfallSet: { row: 4, col: 4 },
    pitfallTriggered: true,
    triggeredPitfall: { row: 5, col: 4 },
  };
}

test('trap reaction kind is player_trapped when viewer owns the failed move', () => {
  const { getTrapReactionKind } = loadGameModule('src/game/reaction.ts');

  assert.equal(getTrapReactionKind(trapHitEntry('sente'), 'sente'), 'player_trapped');
});

test('trap reaction kind is opponent_trapped when viewer did not make the failed move', () => {
  const { getTrapReactionKind } = loadGameModule('src/game/reaction.ts');

  assert.equal(getTrapReactionKind(trapHitEntry('gote'), 'sente'), 'opponent_trapped');
});

test('trap reaction kind is null for missed traps and spectators', () => {
  const { getTrapReactionKind } = loadGameModule('src/game/reaction.ts');
  const missed = {
    ...trapHitEntry('sente'),
    action: {
      type: 'move',
      from: { row: 6, col: 4 },
      to: { row: 5, col: 4 },
      piece: { kind: 'pawn', owner: 'sente' },
    },
    pitfallTriggered: false,
    failedAction: undefined,
    triggeredPitfall: undefined,
    revealedPitfall: { row: 5, col: 5 },
  };

  assert.equal(getTrapReactionKind(missed, 'sente'), null);
  assert.equal(getTrapReactionKind(trapHitEntry('sente'), 'spectator'), null);
});

test('viewer-specific trap reaction UI uses adjusted Kuno-Usa assets and does not expose hidden state', () => {
  const pageSource = readFileSync(resolve(root, 'src/app/page.tsx'), 'utf8');
  const guideSource = readFileSync(resolve(root, 'src/components/NinjaGuide.tsx'), 'utf8');
  const logSource = readFileSync(resolve(root, 'src/components/GameLog.tsx'), 'utf8');
  const cssSource = readFileSync(resolve(root, 'src/app/globals.css'), 'utf8');
  const viewSource = readFileSync(resolve(root, 'src/game/view.ts'), 'utf8');

  assert.equal(existsSync(resolve(root, 'public/mascots/triumphs-kunousa-reaction.png')), true);
  assert.equal(existsSync(resolve(root, 'public/mascots/trapped-kunousa-reaction.png')), true);
  assert.match(pageSource, /getTrapReactionKind/);
  assert.match(pageSource, /trapReactionKind === 'player_trapped'/);
  assert.match(pageSource, /trapReactionKind === 'opponent_trapped'/);
  assert.match(pageSource, /罠にハマった！/);
  assert.match(pageSource, /罠命中！/);
  assert.match(guideSource, /playerTrapped/);
  assert.match(guideSource, /opponentTrapped/);
  assert.match(guideSource, /trapped-kunousa-reaction\.png/);
  assert.match(guideSource, /triumphs-kunousa-reaction\.png/);
  assert.match(logSource, /trapReactionKind/);
  assert.match(cssSource, /trap-player-shake/);
  assert.match(cssSource, /trap-opponent-spark/);
  assert.doesNotMatch(viewSource, /pendingPitfall|lastPitfallPositionByPlayer/);
});

test('trap reaction toast keeps its fade-out animation instead of overriding it with panel effects', () => {
  const pageSource = readFileSync(resolve(root, 'src/app/page.tsx'), 'utf8');
  const toastClass = pageSource.match(/className=\{`trap-toast[\s\S]*?\$\{trapReactionCopy\.panelClass\}`\}/)?.[0] ?? '';
  const reactionCopyBlock = pageSource.match(/const trapReactionCopy =[\s\S]*?: null;/)?.[0] ?? '';

  assert.match(toastClass, /trap-toast/);
  assert.doesNotMatch(reactionCopyBlock, /panelClass: '[^']*\btrap-player-shake\b/);
  assert.doesNotMatch(reactionCopyBlock, /panelClass: '[^']*\btrap-opponent-spark\b/);
});
