// src/game の TypeScript を Node でそのまま読み込むローダー（tests/static と同じ方式）
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import ts from 'typescript';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const moduleCache = new Map();

export function loadGameModule(relativePath) {
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
      return loadGameModule(resolve(dirname(filename), `${specifier}.ts`));
    }
    throw new Error(`Unsupported import in research loader: ${specifier}`);
  };

  new Script(`(function (exports, require, module) { ${output}\n})`, {
    filename,
  }).runInThisContext()(cjsModule.exports, localRequire, cjsModule);

  return cjsModule.exports;
}

/**
 * git の特定リビジョンにある src/game のモジュールを読み込む（変更前 Bot との比較用）。
 * そのモジュールが import する他のファイルは、現在の作業ツリーのものを使う。
 */
export function loadGameModuleFromGit(ref, relativePath) {
  const source = execFileSync('git', ['show', `${ref}:${relativePath}`], { cwd: root, encoding: 'utf8' });
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;

  const cjsModule = { exports: {} };
  const filename = resolve(root, relativePath);
  const localRequire = (specifier) => {
    if (specifier.startsWith('./')) {
      return loadGameModule(resolve(dirname(filename), `${specifier}.ts`));
    }
    throw new Error(`Unsupported import in research loader: ${specifier}`);
  };

  new Script(`(function (exports, require, module) { ${output}\n})`, {
    filename: `${ref}:${relativePath}`,
  }).runInThisContext()(cjsModule.exports, localRequire, cjsModule);

  return cjsModule.exports;
}

/** 再現可能な乱数（mulberry32） */
export function createRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
