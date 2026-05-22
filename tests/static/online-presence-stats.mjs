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
    if (specifier.startsWith('.')) {
      return loadGameModule(resolve(dirname(relativePath), `${specifier}.ts`));
    }
    throw new Error(`Unsupported import in test loader: ${specifier}`);
  };

  new Script(`(function (exports, require, module) { ${output}\n})`, {
    filename,
  }).runInThisContext()(cjsModule.exports, localRequire, cjsModule);

  return cjsModule.exports;
}

function latestEvent(result, playerId) {
  return result.eventsByPlayerId[playerId].at(-1);
}

function events(result, playerId) {
  return result.eventsByPlayerId[playerId] ?? [];
}

test('RoomState tracks players, spectators, and broadcasts presence updates', () => {
  const { createRoom, joinRoom } = loadGameModule('src/game/room.ts');

  const first = joinRoom(createRoom('room-a', 1000), 'alice', 1001, 1);
  const second = joinRoom(first.room, 'bob', 1002, 1);
  const third = joinRoom(second.room, 'carol', 1003, 1);

  assert.deepEqual(third.room.players, { sente: 'alice', gote: 'bob' });
  assert.deepEqual(third.room.spectators, ['carol']);
  assert.deepEqual(latestEvent(third, 'carol').payload.player, 'spectator');
  assert.deepEqual(latestEvent(third, 'carol').payload.view.roomPresence, {
    players: 2,
    playerCapacity: 2,
    spectators: 1,
    seats: { sente: true, gote: true },
  });
  assert.equal(events(second, 'alice').some((event) => event.type === 'roomPresenceUpdated'), true);
  assert.equal(events(third, 'alice').some((event) => event.type === 'roomPresenceUpdated'), true);
  assert.equal(events(third, 'bob').some((event) => event.type === 'roomPresenceUpdated'), true);
});

test('spectator GameView does not reveal live hidden pitfalls until game over', () => {
  const { createRoom, joinRoom, handleRoomCommand } = loadGameModule('src/game/room.ts');
  let room = createRoom('room-a', 1000);
  room = joinRoom(room, 'alice', 1001, 1).room;
  room = joinRoom(room, 'bob', 1002, 1).room;
  room = joinRoom(room, 'carol', 1003, 1).room;

  const placed = handleRoomCommand(room, 'alice', {
    type: 'placePitfall',
    roomId: 'room-a',
    position: { row: 4, col: 4 },
    clientSeq: 2,
  }, 1004);

  assert.deepEqual(latestEvent(placed, 'carol').payload.view.visiblePitfalls, []);
});

test('match stats are viewer-relative and count read wins and losses', () => {
  const { createRoom, joinRoom, handleRoomCommand } = loadGameModule('src/game/room.ts');
  let room = createRoom('room-a', 1000);
  room = joinRoom(room, 'alice', 1001, 1).room;
  room = joinRoom(room, 'bob', 1002, 1).room;

  room = {
    ...room,
    gameState: {
      ...room.gameState,
      log: [
        { turn: 1, player: 'sente', action: null, pitfallSet: { row: 4, col: 4 }, pitfallTriggered: true },
        { turn: 2, player: 'gote', action: null, pitfallSet: { row: 3, col: 3 }, pitfallTriggered: true },
        { turn: 3, player: 'sente', action: null, pitfallSet: { row: 2, col: 2 }, pitfallTriggered: false },
      ],
    },
  };

  const resigned = handleRoomCommand(room, 'alice', { type: 'resign', roomId: 'room-a', clientSeq: 2 }, 1005);
  const aliceStats = latestEvent(resigned, 'alice').payload.view.matchStats;
  const bobStats = latestEvent(resigned, 'bob').payload.view.matchStats;

  assert.deepEqual(aliceStats, {
    trapsSet: 2,
    trapsTriggeredByMe: 1,
    trapsITriggered: 1,
    trapHitRate: 50,
  });
  assert.deepEqual(bobStats, {
    trapsSet: 1,
    trapsTriggeredByMe: 1,
    trapsITriggered: 1,
    trapHitRate: 100,
  });
});

test('both players can request rematch after game over to start a fresh room game', () => {
  const { createRoom, joinRoom, handleRoomCommand } = loadGameModule('src/game/room.ts');
  let room = createRoom('room-a', 1000);
  room = joinRoom(room, 'alice', 1001, 1).room;
  room = joinRoom(room, 'bob', 1002, 1).room;
  room = handleRoomCommand(room, 'alice', { type: 'resign', roomId: 'room-a', clientSeq: 2 }, 1003).room;

  const firstRequest = handleRoomCommand(room, 'alice', { type: 'requestRematch', roomId: 'room-a', clientSeq: 3 }, 1004);
  const secondRequest = handleRoomCommand(firstRequest.room, 'bob', { type: 'requestRematch', roomId: 'room-a', clientSeq: 2 }, 1005);

  assert.deepEqual(firstRequest.room.rematchRequests, ['sente']);
  assert.equal(events(firstRequest, 'bob').some((event) => event.type === 'roomPresenceUpdated'), true);
  assert.equal(secondRequest.room.gameState.phase.type, 'PITFALL_PLACEMENT');
  assert.equal(secondRequest.room.gameState.turn, 1);
  assert.deepEqual(secondRequest.room.rematchRequests, []);
  assert.equal(latestEvent(secondRequest, 'alice').type, 'gameViewUpdated');
  assert.equal(latestEvent(secondRequest, 'bob').type, 'gameViewUpdated');
});

test('online UI exposes rematch, connection banner, waiting emphasis, presence, and match stats', () => {
  const pageSource = readFileSync(resolve(root, 'src/app/page.tsx'), 'utf8');
  const hookSource = readFileSync(resolve(root, 'src/hooks/useOnlineRoom.ts'), 'utf8');
  const contractSource = readFileSync(resolve(root, 'src/server/contract.ts'), 'utf8');

  assert.match(pageSource, /onlineRematch/);
  assert.match(pageSource, /connectionWarningTitle/);
  assert.match(pageSource, /opponentWaitingTitle/);
  assert.match(pageSource, /roomPresence/);
  assert.match(pageSource, /matchStats/);
  assert.match(pageSource, /sendRematch/);
  assert.match(hookSource, /sendRematch/);
  assert.match(hookSource, /roomPresenceUpdated/);
  assert.match(contractSource, /requestRematch/);
  assert.match(contractSource, /RoomPresence/);
});

test('itch packaging script remains available for this tranche', () => {
  const packageSource = readFileSync(resolve(root, 'package.json'), 'utf8');
  const packageScriptSource = readFileSync(resolve(root, 'scripts/package-itch.ps1'), 'utf8');

  assert.ok(existsSync(resolve(root, 'scripts/package-itch.ps1')));
  assert.match(packageSource, /"itch:zip"/);
  assert.doesNotMatch(packageScriptSource, /Replace\('\.\.', '__'\)/);
});
