import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const pageSource = readFileSync(new URL('../../src/app/page.tsx', import.meta.url), 'utf8');
const hookSource = readFileSync(new URL('../../src/hooks/useOnlineRoom.ts', import.meta.url), 'utf8');
const reducerSource = readFileSync(new URL('../../src/game/reducer.ts', import.meta.url), 'utf8');
const readmeSource = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');

test('useOnlineRoom exposes command senders for online game input', () => {
  assert.match(hookSource, /sendPlacePitfall/);
  assert.match(hookSource, /sendMakeMove/);
  assert.match(hookSource, /sendResign/);
  assert.match(hookSource, /sendRoomCommand/);
  assert.match(hookSource, /type:\s*'placePitfall'/);
  assert.match(hookSource, /type:\s*'makeMove'/);
  assert.match(hookSource, /type:\s*'resign'/);
  assert.match(hookSource, /setLastSentClientSeq\(clientSeq\)/);
});

test('online mode renders GameView through the board without advancing the local reducer', () => {
  assert.match(pageSource, /hasOnlineGameView/);
  assert.match(pageSource, /onlineSelection/);
  assert.match(pageSource, /onlineRoom\.view/);
  assert.match(pageSource, /isOnlineMode && onlineRoom\.view \? onlineRoom\.view\.board : state\.board/);
  assert.match(pageSource, /isOnlineMode[\s\S]*onlineRoom\.sendPlacePitfall/);
  assert.match(pageSource, /isOnlineMode[\s\S]*onlineRoom\.sendMakeMove/);
  assert.match(pageSource, /if \(isOnlineMode\) \{[\s\S]*onlineRoom\.sendPlacePitfall\(activePitfallDraft\);[\s\S]*return;/);
  assert.match(pageSource, /if \(isOnlineMode\) \{[\s\S]*onlineRoom\.sendMakeMove/);
  assert.match(pageSource, /activeBoard = isOnlineMode && onlineRoom\.view \? onlineRoom\.view\.board : state\.board/);
  assert.match(pageSource, /activeHands = isOnlineMode && onlineRoom\.view \? onlineRoom\.view\.hands : state\.hands/);
  assert.match(pageSource, /isOnlineMode && !hasOnlineGameView/);
});

test('online debug panel shows command status, invalidCommand, resign, and reconnect controls', () => {
  assert.match(hookSource, /lastInvalidCommand/);
  assert.match(hookSource, /event\.type === 'invalidCommand'/);
  assert.match(hookSource, /reconnect/);
  assert.match(pageSource, /onlineRoom\.lastInvalidCommand/);
  assert.match(pageSource, /onlineRoom\.sendResign/);
  assert.match(pageSource, /onlineRoom\.reconnect/);
  assert.match(pageSource, /invalidCommand/);
  assert.match(pageSource, /lastSentClientSeq/);
  assert.match(pageSource, /lastReceivedEventType/);
  assert.match(pageSource, /onlineRoom\.lastInvalidCommand\.payload\.reason/);
});

test('online makeMove supports drops and explicit promotion decisions', () => {
  assert.match(pageSource, /onlineHandSelection/);
  assert.match(pageSource, /onlinePromotionMove/);
  assert.match(pageSource, /onlineRoom\.sendMakeMove\(\{\s*type:\s*'drop'/);
  assert.match(pageSource, /decideOnlinePromotion\(true\)/);
  assert.match(pageSource, /decideOnlinePromotion\(false\)/);
  assert.match(reducerSource, /move\.promote !== undefined/);
});

test('Online Experimental is clearly marked as experimental with known issues and manual two-browser checks', () => {
  assert.match(pageSource, /実験中/);
  assert.match(pageSource, /Experimental/);
  assert.match(pageSource, /Online Known Issues/);
  assert.match(readmeSource, /Online Experimental 2ブラウザ手動テスト/);
  assert.match(readmeSource, /相手未公開罠がUIに表示されない/);
  assert.match(readmeSource, /成り\/不成/);
  assert.match(readmeSource, /local reducer/);
});
