import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const moduleCache = new Map();
const roomPath = resolve(root, 'src/game/room.ts');

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

function assertViewOnly(event) {
  assert.ok(event.payload.view, 'event should carry GameView');
  assert.equal('gameState' in event.payload, false);
  assert.equal('state' in event.payload, false);
  assert.equal('pitfalls' in event.payload.view, false);
  assert.equal('pendingPitfall' in event.payload.view, false);
}

test('createRoom builds the initial authoritative RoomState', () => {
  assert.ok(existsSync(roomPath), 'src/game/room.ts should exist');
  const { createRoom } = loadGameModule('src/game/room.ts');

  const room = createRoom('room-a', 1000);

  assert.equal(room.roomId, 'room-a');
  assert.deepEqual(room.players, {});
  assert.equal(room.gameState.currentPlayer, 'sente');
  assert.equal(room.gameState.phase.type, 'PITFALL_PLACEMENT');
  assert.equal(room.revision, 0);
  assert.equal(room.createdAt, 1000);
  assert.equal(room.updatedAt, 1000);
});

test('joinRoom seats two players, then admits additional clients as spectators', () => {
  const { createRoom, joinRoom } = loadGameModule('src/game/room.ts');

  const first = joinRoom(createRoom('room-a', 1000), 'alice', 1001, 1);
  const duplicate = joinRoom(first.room, 'alice', 1002, 2);
  const second = joinRoom(duplicate.room, 'bob', 1003, 1);
  const third = joinRoom(second.room, 'carol', 1003);

  assert.deepEqual(second.room.players, { sente: 'alice', gote: 'bob' });
  assert.deepEqual(duplicate.room.players, { sente: 'alice' });
  assert.equal(first.room.revision, 1);
  assert.equal(duplicate.room.revision, 1);
  assert.equal(second.room.revision, 2);
  assert.deepEqual(third.room.spectators, ['carol']);
  assert.equal(third.room.revision, 3);
  assert.equal(latestEvent(first, 'alice').type, 'roomJoined');
  assert.equal(latestEvent(first, 'alice').payload.player, 'sente');
  assert.equal(latestEvent(first, 'alice').revision, 1);
  assert.equal(latestEvent(first, 'alice').ackClientSeq, 1);
  assertViewOnly(latestEvent(first, 'alice'));
  assert.equal(latestEvent(second, 'bob').payload.player, 'gote');
  assert.equal(latestEvent(second, 'bob').revision, 2);
  assert.equal(latestEvent(second, 'bob').ackClientSeq, 1);
  assert.equal(latestEvent(third, 'carol').type, 'roomJoined');
  assert.equal(latestEvent(third, 'carol').payload.player, 'spectator');
  assert.equal(latestEvent(third, 'carol').revision, 3);
});

test('placePitfall command updates RoomState and sends hidden-information-safe views', () => {
  const { createRoom, joinRoom, handleRoomCommand } = loadGameModule('src/game/room.ts');
  const withAlice = joinRoom(createRoom('room-a', 1000), 'alice', 1001).room;
  const room = joinRoom(withAlice, 'bob', 1002).room;

  const result = handleRoomCommand(room, 'alice', {
    type: 'placePitfall',
    roomId: 'room-a',
    position: { row: 4, col: 4 },
    clientSeq: 1,
  }, 1003);

  assert.equal(room.revision, 2);
  assert.equal(result.room.revision, 3);
  assert.equal(result.room.gameState.pendingPitfall.position.row, 4);
  assert.equal(result.room.gameState.pendingPitfall.owner, 'sente');
  assert.equal(result.room.gameState.phase.type, 'MOVE_SELECTION');

  const aliceEvent = latestEvent(result, 'alice');
  const bobEvent = latestEvent(result, 'bob');
  assert.equal(aliceEvent.type, 'gameViewUpdated');
  assert.equal(bobEvent.type, 'gameViewUpdated');
  assert.equal(aliceEvent.revision, 3);
  assert.equal(aliceEvent.ackClientSeq, 1);
  assert.equal(bobEvent.revision, 3);
  assert.equal(bobEvent.ackClientSeq, 1);
  assertViewOnly(aliceEvent);
  assertViewOnly(bobEvent);
  assert.deepEqual(aliceEvent.payload.view.visiblePitfalls, [
    { position: { row: 4, col: 4 }, owner: 'sente' },
  ]);
  assert.deepEqual(bobEvent.payload.view.visiblePitfalls, []);
});

test('makeMove command updates RoomState and preserves opponent trap privacy per player', () => {
  const { createRoom, joinRoom, handleRoomCommand } = loadGameModule('src/game/room.ts');
  let room = joinRoom(createRoom('room-a', 1000), 'alice', 1001).room;
  room = joinRoom(room, 'bob', 1002).room;
  room = handleRoomCommand(room, 'alice', {
    type: 'placePitfall',
    roomId: 'room-a',
    position: { row: 4, col: 4 },
    clientSeq: 1,
  }, 1003).room;

  const result = handleRoomCommand(room, 'alice', {
    type: 'makeMove',
    roomId: 'room-a',
    clientSeq: 2,
    action: {
      type: 'move',
      from: { row: 6, col: 4 },
      to: { row: 5, col: 4 },
      piece: { kind: 'pawn', owner: 'sente' },
    },
  }, 1004);

  assert.equal(result.room.revision, 4);
  assert.equal(result.room.gameState.board[6][4], null);
  assert.deepEqual(result.room.gameState.board[5][4], { kind: 'pawn', owner: 'sente' });
  assert.equal(result.room.gameState.currentPlayer, 'gote');
  assert.deepEqual(result.room.gameState.pitfalls.sente, {
    position: { row: 4, col: 4 },
    owner: 'sente',
  });
  assert.equal(result.room.gameState.phase.type, 'PITFALL_PLACEMENT');

  const aliceEvent = latestEvent(result, 'alice');
  const bobEvent = latestEvent(result, 'bob');
  assert.equal(aliceEvent.revision, 4);
  assert.equal(aliceEvent.ackClientSeq, 2);
  assert.equal(bobEvent.revision, 4);
  assert.equal(bobEvent.ackClientSeq, 2);
  assertViewOnly(aliceEvent);
  assertViewOnly(bobEvent);
  assert.equal(aliceEvent.payload.view.phase.type, 'PITFALL_PLACEMENT');
  assert.equal(bobEvent.payload.view.phase.type, 'PITFALL_PLACEMENT');
  assert.deepEqual(aliceEvent.payload.view.visiblePitfalls, [
    { position: { row: 4, col: 4 }, owner: 'sente' },
  ]);
  assert.deepEqual(bobEvent.payload.view.visiblePitfalls, []);
});

test('online room recovers an existing PASS_DEVICE state without asking players to pass the device', () => {
  const { createRoom, joinRoom, handleRoomCommand } = loadGameModule('src/game/room.ts');
  let room = joinRoom(createRoom('room-a', 1000), 'alice', 1001).room;
  room = joinRoom(room, 'bob', 1002).room;
  room = handleRoomCommand(room, 'alice', {
    type: 'placePitfall',
    roomId: 'room-a',
    position: { row: 4, col: 4 },
    clientSeq: 1,
  }, 1003).room;
  room = handleRoomCommand(room, 'alice', {
    type: 'makeMove',
    roomId: 'room-a',
    clientSeq: 2,
    action: {
      type: 'move',
      from: { row: 6, col: 4 },
      to: { row: 5, col: 4 },
      piece: { kind: 'pawn', owner: 'sente' },
    },
  }, 1004).room;
  const stuckRoom = {
    ...room,
    gameState: {
      ...room.gameState,
      phase: { type: 'PASS_DEVICE' },
    },
  };

  const rejoined = joinRoom(stuckRoom, 'bob', 1005, 3);
  assert.equal(rejoined.room.gameState.phase.type, 'PITFALL_PLACEMENT');
  assert.equal(latestEvent(rejoined, 'bob').payload.view.phase.type, 'PITFALL_PLACEMENT');

  const placed = handleRoomCommand(rejoined.room, 'bob', {
    type: 'placePitfall',
    roomId: 'room-a',
    position: { row: 3, col: 4 },
    clientSeq: 4,
  }, 1006);
  assert.equal(placed.room.gameState.phase.type, 'MOVE_SELECTION');
  assert.equal(latestEvent(placed, 'alice').type, 'gameViewUpdated');
});

test('invalid player ids and out-of-turn commands return invalidCommand without incrementing revision', () => {
  const { createRoom, joinRoom, handleRoomCommand } = loadGameModule('src/game/room.ts');
  const withAlice = joinRoom(createRoom('room-a', 1000), 'alice', 1001).room;
  const room = joinRoom(withAlice, 'bob', 1002).room;

  const unknown = handleRoomCommand(room, 'mallory', {
    type: 'placePitfall',
    roomId: 'room-a',
    position: { row: 4, col: 4 },
    clientSeq: 1,
  }, 1003);
  const outOfTurn = handleRoomCommand(room, 'bob', {
    type: 'placePitfall',
    roomId: 'room-a',
    position: { row: 4, col: 4 },
    clientSeq: 1,
  }, 1004);

  assert.equal(unknown.room.revision, 2);
  assert.equal(outOfTurn.room.revision, 2);
  assert.equal(latestEvent(unknown, 'mallory').type, 'invalidCommand');
  assert.equal(latestEvent(unknown, 'mallory').revision, 2);
  assert.equal(latestEvent(unknown, 'mallory').ackClientSeq, 1);
  assert.match(latestEvent(unknown, 'mallory').payload.reason, /not in room/);
  assert.equal(latestEvent(outOfTurn, 'bob').type, 'invalidCommand');
  assert.equal(latestEvent(outOfTurn, 'bob').revision, 2);
  assert.equal(latestEvent(outOfTurn, 'bob').ackClientSeq, 1);
  assert.match(latestEvent(outOfTurn, 'bob').payload.reason, /not your turn/);
});

test('stale clientSeq from the same player is rejected without changing state or revision', () => {
  const { createRoom, joinRoom, handleRoomCommand } = loadGameModule('src/game/room.ts');
  let room = joinRoom(createRoom('room-a', 1000), 'alice', 1001).room;
  room = joinRoom(room, 'bob', 1002).room;
  const placed = handleRoomCommand(room, 'alice', {
    type: 'placePitfall',
    roomId: 'room-a',
    position: { row: 4, col: 4 },
    clientSeq: 10,
  }, 1003);

  const stale = handleRoomCommand(placed.room, 'alice', {
    type: 'makeMove',
    roomId: 'room-a',
    clientSeq: 9,
    action: {
      type: 'move',
      from: { row: 6, col: 4 },
      to: { row: 5, col: 4 },
      piece: { kind: 'pawn', owner: 'sente' },
    },
  }, 1004);

  assert.equal(stale.room, placed.room);
  assert.equal(stale.room.revision, 3);
  assert.equal(latestEvent(stale, 'alice').type, 'invalidCommand');
  assert.equal(latestEvent(stale, 'alice').revision, 3);
  assert.equal(latestEvent(stale, 'alice').ackClientSeq, 9);
  assert.match(latestEvent(stale, 'alice').payload.reason, /stale/);
});

test('resign sends gameOver events to both players and game-over commands are rejected', () => {
  const { createRoom, joinRoom, handleRoomCommand } = loadGameModule('src/game/room.ts');
  let room = joinRoom(createRoom('room-a', 1000), 'alice', 1001).room;
  room = joinRoom(room, 'bob', 1002).room;

  const resigned = handleRoomCommand(room, 'alice', {
    type: 'resign',
    roomId: 'room-a',
    clientSeq: 1,
  }, 1003);

  assert.equal(resigned.room.revision, 3);
  assert.equal(latestEvent(resigned, 'alice').type, 'gameOver');
  assert.equal(latestEvent(resigned, 'bob').type, 'gameOver');
  assert.equal(latestEvent(resigned, 'alice').revision, 3);
  assert.equal(latestEvent(resigned, 'bob').revision, 3);
  assertViewOnly(latestEvent(resigned, 'alice'));
  assertViewOnly(latestEvent(resigned, 'bob'));

  const afterGamePitfall = handleRoomCommand(resigned.room, 'bob', {
    type: 'placePitfall',
    roomId: 'room-a',
    position: { row: 4, col: 4 },
    clientSeq: 2,
  }, 1004);
  const afterGameMove = handleRoomCommand(resigned.room, 'bob', {
    type: 'makeMove',
    roomId: 'room-a',
    clientSeq: 3,
    action: {
      type: 'move',
      from: { row: 2, col: 4 },
      to: { row: 3, col: 4 },
      piece: { kind: 'pawn', owner: 'gote' },
    },
  }, 1005);

  assert.equal(afterGamePitfall.room.revision, 3);
  assert.equal(afterGameMove.room.revision, 3);
  assert.equal(latestEvent(afterGamePitfall, 'bob').type, 'invalidCommand');
  assert.equal(latestEvent(afterGameMove, 'bob').type, 'invalidCommand');
  assert.match(latestEvent(afterGamePitfall, 'bob').payload.reason, /game is over/);
  assert.match(latestEvent(afterGameMove, 'bob').payload.reason, /game is over/);
});

test('online room rejects consecutive same-square pitfall by the same player', () => {
  const { createRoom, joinRoom, handleRoomCommand } = loadGameModule('src/game/room.ts');
  let room = createRoom('room-a', 1000);
  room = joinRoom(room, 'alice', 1001, 1).room;
  room = joinRoom(room, 'bob', 1002, 1).room;

  room = handleRoomCommand(room, 'alice', {
    type: 'placePitfall',
    roomId: 'room-a',
    position: { row: 4, col: 4 },
    clientSeq: 2,
  }, 1003).room;
  room = handleRoomCommand(room, 'alice', {
    type: 'makeMove',
    roomId: 'room-a',
    action: {
      type: 'move',
      from: { row: 6, col: 0 },
      to: { row: 5, col: 0 },
      piece: { kind: 'pawn', owner: 'sente' },
    },
    clientSeq: 3,
  }, 1004).room;
  room = {
    ...room,
    gameState: {
      ...room.gameState,
      phase: { type: 'PITFALL_PLACEMENT' },
    },
  };
  room = handleRoomCommand(room, 'bob', {
    type: 'placePitfall',
    roomId: 'room-a',
    position: { row: 3, col: 3 },
    clientSeq: 2,
  }, 1005).room;
  room = handleRoomCommand(room, 'bob', {
    type: 'makeMove',
    roomId: 'room-a',
    action: {
      type: 'move',
      from: { row: 2, col: 0 },
      to: { row: 3, col: 0 },
      piece: { kind: 'pawn', owner: 'gote' },
    },
    clientSeq: 3,
  }, 1006).room;
  room = {
    ...room,
    gameState: {
      ...room.gameState,
      phase: { type: 'PITFALL_PLACEMENT' },
    },
  };

  const rejected = handleRoomCommand(room, 'alice', {
    type: 'placePitfall',
    roomId: 'room-a',
    position: { row: 4, col: 4 },
    clientSeq: 4,
  }, 1007);

  assert.equal(latestEvent(rejected, 'alice').type, 'invalidCommand');
  assert.match(latestEvent(rejected, 'alice').payload.reason, /did not change state/);
});
