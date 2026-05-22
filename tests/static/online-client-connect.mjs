import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const pageSource = readFileSync(new URL('../../src/app/page.tsx', import.meta.url), 'utf8');

test('Online Experimental is disabled when the WebSocket URL is unset', () => {
  const configSource = readFileSync(new URL('../../src/constants/online.ts', import.meta.url), 'utf8');

  assert.match(configSource, /NEXT_PUBLIC_ROOM_WS_URL/);
  assert.match(configSource, /ONLINE_ROOM_WS_URL/);
  assert.match(pageSource, /Online Experimental/);
  assert.match(pageSource, /disabled=\{!onlineRoom\.isConfigured/);
  assert.match(pageSource, /WebSocket URL/);
  assert.match(pageSource, /接続先サーバーが設定されていません/);
  assert.match(pageSource, /Server URL is not configured/);
});

test('production Worker URL is configured as the default online room endpoint', () => {
  const configSource = readFileSync(new URL('../../src/constants/online.ts', import.meta.url), 'utf8');

  assert.match(configSource, /DEFAULT_ONLINE_ROOM_WS_URL/);
  assert.match(configSource, /wss:\/\/hidden-trap-shogi-room\.cacao-ixora-coccinea\.workers\.dev/);
  assert.match(configSource, /NEXT_PUBLIC_ROOM_WS_URL/);
});

test('Room ID text field remains editable even when the WebSocket URL is unset', () => {
  const roomIdInput = pageSource.match(/<input[\s\S]*?value=\{onlineRoomId\}[\s\S]*?\/>/)?.[0] ?? '';

  assert.match(roomIdInput, /value=\{onlineRoomId\}/);
  assert.match(roomIdInput, /onChange=\{\(event\) => setOnlineRoomId\(event\.target\.value\)\}/);
  assert.doesNotMatch(roomIdInput, /disabled=\{!onlineRoom\.isConfigured\}/);
});

test('invite URL copy reports success, failure, and exposes manual fallback input', () => {
  assert.match(pageSource, /inviteCopyStatus/);
  assert.match(pageSource, /copyInviteFailed/);
  assert.match(pageSource, /コピーできませんでした。URLを選択してコピーしてください/);
  assert.match(pageSource, /Could not copy. Select the URL and copy it manually./);
  assert.match(pageSource, /navigator\.clipboard\?\.writeText/);
  assert.match(pageSource, /window\.isSecureContext/);
  assert.match(pageSource, /selectInviteUrl/);
  assert.match(pageSource, /readOnly/);
  assert.match(pageSource, /value=\{inviteUrl\}/);
  assert.match(pageSource, /onFocus=\{selectInviteUrl\}/);
  assert.match(pageSource, /onClick=\{selectInviteUrl\}/);
});

test('useOnlineRoom sends joinRoom without playerId and increments clientSeq per send', () => {
  const hookPath = new URL('../../src/hooks/useOnlineRoom.ts', import.meta.url);
  assert.equal(existsSync(hookPath), true);

  const hookSource = readFileSync(hookPath, 'utf8');
  assert.match(hookSource, /type:\s*'joinRoom'/);
  assert.doesNotMatch(hookSource, /playerId/);
  assert.match(hookSource, /clientSeqRef\.current \+= 1/);
  assert.match(hookSource, /const clientSeq = nextClientSeq\(\)/);
  assert.match(hookSource, /setLastSentClientSeq\(clientSeq\)/);
  assert.match(hookSource, /socket\.send\(JSON\.stringify\(command\)\)/);
});

test('Online client reflects roomJoined revision, ackClientSeq, and GameView from ServerEvent', () => {
  const hookSource = readFileSync(new URL('../../src/hooks/useOnlineRoom.ts', import.meta.url), 'utf8');

  assert.match(hookSource, /setRevision\(event\.revision\)/);
  assert.match(hookSource, /setAckClientSeq\(event\.ackClientSeq \?\? null\)/);
  assert.match(hookSource, /event\.type === 'roomJoined'/);
  assert.match(hookSource, /setView\(event\.payload\.view\)/);
  assert.match(pageSource, /onlineRoom\.revision/);
  assert.match(pageSource, /onlineRoom\.ackClientSeq/);
});

test('Online debug panel checks that received ServerEvent does not include raw pitfall state', () => {
  const hookSource = readFileSync(new URL('../../src/hooks/useOnlineRoom.ts', import.meta.url), 'utf8');

  assert.match(hookSource, /hasRawPitfallLeak/);
  assert.match(hookSource, /'pitfalls' in view/);
  assert.match(hookSource, /'pendingPitfall' in view/);
  assert.match(pageSource, /raw pitfall leak/i);
  assert.match(pageSource, /onlineRoom\.hasRawPitfallLeak/);
});
