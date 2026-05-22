import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const pageSource = readFileSync(new URL('../../src/app/page.tsx', import.meta.url), 'utf8');

test('mode controls are framed as a single explicit choice instead of PvP/PvBot ON toggles', () => {
  assert.match(pageSource, /modeControlLabel/);
  assert.match(pageSource, /localModeOptions/);
  assert.match(pageSource, /ふたりで遊ぶ/);
  assert.match(pageSource, /Bot練習/);
  assert.match(pageSource, /aria-pressed=\{gameMode === option\.value\}/);
  assert.doesNotMatch(pageSource, /PvP \{gameMode === 'pvp' \? 'ON' : 'OFF'\}/);
  assert.doesNotMatch(pageSource, /PvBot \{gameMode === 'pvbot' \? 'ON' : 'OFF'\}/);
});

test('bot level UI is explicitly scoped to PvBot and hidden for PvP', () => {
  assert.match(pageSource, /botLevelScopeLabel/);
  assert.match(pageSource, /gameMode === 'pvbot' && \(/);
  assert.match(pageSource, /PvBot専用/);
  assert.match(pageSource, /Bot only/);
  assert.match(pageSource, /botLevelHelp/);
});

test('online mode without a GameView does not fall back to a local playable board', () => {
  assert.match(pageSource, /hasOnlineGameView/);
  assert.match(pageSource, /onlineNoSeatTitle/);
  assert.match(pageSource, /onlineNoSeatBody/);
  assert.match(pageSource, /onlineRoom\.lastInvalidCommand/);
  assert.match(pageSource, /isOnlineMode && !hasOnlineGameView/);
  assert.doesNotMatch(pageSource, /activeBoard = isOnlineMode \? onlineBoard : state\.board/);
  assert.doesNotMatch(pageSource, /onlineBoard = onlineRoom\.view\?\.board \?\? state\.board/);
});

test('online play surface tells the assigned side and whether this browser can act', () => {
  assert.match(pageSource, /onlineSeatLabel/);
  assert.match(pageSource, /onlineYourTurn/);
  assert.match(pageSource, /onlineWaitingTurn/);
  assert.match(pageSource, /canOnlineAct/);
  assert.match(pageSource, /あなたは/);
  assert.match(pageSource, /相手の操作を待っています/);
});

test('in-match header keeps only core turn controls visible and folds setup links into settings', () => {
  assert.match(pageSource, /settingsLabel/);
  assert.match(pageSource, /matchPhaseLabel/);
  assert.match(pageSource, /matchTurnLabel/);
  assert.match(pageSource, /isCheckAlert/);
  assert.match(pageSource, /setShowSettings\(\(current\) => !current\)/);
  assert.match(pageSource, /settings-panel/);

  const headerBlock = pageSource.match(/<header[\s\S]*?<\/header>/)?.[0] ?? '';
  assert.match(headerBlock, /copy\.matchTurnLabel/);
  assert.match(headerBlock, /copy\.matchPhaseLabel/);
  assert.match(headerBlock, /copy\.resign/);
  assert.match(headerBlock, /copy\.help/);
  assert.match(headerBlock, /copy\.settingsLabel/);
  assert.doesNotMatch(headerBlock, /copy\.feedback/);
  assert.doesNotMatch(headerBlock, /copy\.knownIssues/);
  assert.doesNotMatch(headerBlock, /copy\.reset/);
});
