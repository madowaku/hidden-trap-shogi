import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const page = readFileSync(new URL('../../src/app/page.tsx', import.meta.url), 'utf8');
const cell = readFileSync(new URL('../../src/components/Cell.tsx', import.meta.url), 'utf8');

test('in-match options cannot reset immediately without confirmation', () => {
  assert.match(page, /const requestMatchRestart = /);
  assert.match(page, /setPendingMatchReset\(\{ mode: nextMode, casual: nextCasual, level: nextBotLevel \}\)/);
  assert.match(page, /onClick=\{\(\) => requestMatchRestart\(option.value, casualMode, botLevel\)\}/);
  assert.match(page, /onClick=\{\(\) => requestMatchRestart\('pvbot', casualMode, option.value\)\}/);
  assert.match(page, /onClick=\{\(\) => requestMatchRestart\(gameMode, !casualMode, botLevel\)\}/);
  assert.match(page, /onClick=\{\(\) => requestMatchRestart\(gameMode, casualMode, botLevel, true\)\}/);
  assert.match(page, /pendingMatchReset && !showStartScreen && !isOnlineMode/);
  assert.match(page, /onClick=\{confirmMatchRestart\}/);
  assert.match(page, /setPendingMatchReset\(null\)/);
});

test('medium screen does not force three fixed-width columns', () => {
  assert.match(page, /xl:grid-cols-\[220px_minmax\(620px,1fr\)_320px\]/);
  assert.match(page, /coach-panel hidden xl:flex/);
  assert.doesNotMatch(page, /md:grid-cols-\[190px_minmax/);
});

test('missed trap indicator does not cover the center of a piece', () => {
  assert.match(cell, /aria-label="不発の罠"/);
  assert.match(cell, /absolute right-0 top-0 z-20/);
  assert.doesNotMatch(cell, /trap-miss-cloud rounded-full/);
});
