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

test('rule profiles make current Casual and Strict differences explicit', () => {
  const { RULE_PROFILES, getRuleProfile } = loadGameModule('src/game/rules.ts');

  assert.deepEqual(Object.keys(RULE_PROFILES).sort(), ['casual', 'strict']);
  assert.equal(getRuleProfile(true).id, 'casual');
  assert.equal(getRuleProfile(false).id, 'strict');
  assert.equal(RULE_PROFILES.casual.revealMissedPitfalls, true);
  assert.equal(RULE_PROFILES.strict.revealMissedPitfalls, false);
  assert.equal(RULE_PROFILES.casual.victoryCondition, 'kingCapture');
  assert.equal(RULE_PROFILES.strict.victoryCondition, 'kingCapture');
});

test('Strict profile does not pretend unsupported official shogi rules are enforced', () => {
  const { RULE_PROFILES } = loadGameModule('src/game/rules.ts');

  assert.equal(RULE_PROFILES.strict.enforceSelfCheck, false);
  assert.equal(RULE_PROFILES.strict.forbidPawnDropMate, false);
  assert.equal(RULE_PROFILES.strict.resolveCheckmate, false);
});

test('reducer reads missed-trap reveal behavior through the rule profile boundary', () => {
  const reducerSource = readFileSync(resolve(root, 'src/game/reducer.ts'), 'utf8');

  assert.match(reducerSource, /getRuleProfile/);
  assert.doesNotMatch(reducerSource, /revealedPitfall:\s*state\.config\.casualMode/);
});
