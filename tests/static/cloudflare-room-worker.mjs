import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const moduleCache = new Map();
const workerPath = resolve(root, 'src/worker/room-worker.ts');

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
    if (specifier.startsWith('.')) {
      return loadModule(resolve(dirname(relativePath), `${specifier}.ts`));
    }
    throw new Error(`Unsupported import in test loader: ${specifier}`);
  };

  new Script(`(function (exports, require, module) { ${output}\n})`, {
    filename,
  }).runInThisContext()(cjsModule.exports, localRequire, cjsModule);

  return cjsModule.exports;
}

function createStorage() {
  const values = new Map();
  return {
    async get(key) {
      return values.get(key);
    },
    async put(key, value) {
      values.set(key, value);
    },
  };
}

class FakeSocket {
  accepted = false;
  sent = [];
  listeners = new Map();

  accept() {
    this.accepted = true;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  send(message) {
    this.sent.push(JSON.parse(message));
  }

  receive(data) {
    this.listeners.get('message')?.({ data: JSON.stringify(data) });
  }
}

function assertViewOnly(event) {
  assert.ok(event.payload.view, 'event should carry GameView');
  assert.equal('gameState' in event.payload, false);
  assert.equal('state' in event.payload, false);
  assert.equal('pitfalls' in event.payload.view, false);
  assert.equal('pendingPitfall' in event.payload.view, false);
}

async function flushSocketTasks() {
  await Promise.resolve();
  await Promise.resolve();
}

async function createJoinedRoom() {
  const { RoomDurableObject } = loadModule('src/worker/room-worker.ts');
  const storage = createStorage();
  const roomObject = new RoomDurableObject({ storage }, {});
  const aliceSocket = new FakeSocket();
  const bobSocket = new FakeSocket();

  await roomObject.acceptSocket(aliceSocket, 'room-a', 'alice');
  await roomObject.acceptSocket(bobSocket, 'room-a', 'bob');
  aliceSocket.receive({ type: 'joinRoom', roomId: 'room-a', clientSeq: 1 });
  bobSocket.receive({ type: 'joinRoom', roomId: 'room-a', clientSeq: 1 });
  await flushSocketTasks();

  return { roomObject, storage, aliceSocket, bobSocket };
}

function latest(socket) {
  return socket.sent.at(-1);
}

test('RoomDurableObject accepts joinRoom over WebSocket and sends revisioned view events', async () => {
  assert.ok(existsSync(workerPath), 'src/worker/room-worker.ts should exist');
  const { RoomDurableObject } = loadModule('src/worker/room-worker.ts');
  const roomObject = new RoomDurableObject({ storage: createStorage() }, {});
  const socket = new FakeSocket();

  await roomObject.acceptSocket(socket, 'room-a', 'alice');
  socket.receive({ type: 'joinRoom', roomId: 'room-a', clientSeq: 1 });
  await flushSocketTasks();

  assert.equal(socket.accepted, true);
  assert.equal(socket.sent.length, 1);
  assert.equal(socket.sent[0].type, 'roomJoined');
  assert.equal(socket.sent[0].revision, 1);
  assert.equal(socket.sent[0].ackClientSeq, 1);
  assert.equal(socket.sent[0].payload.roomId, 'room-a');
  assert.equal(socket.sent[0].payload.player, 'sente');
  assertViewOnly(socket.sent[0]);
});

test('RoomDurableObject stores RoomState and routes each player event to that player socket only', async () => {
  const { storage, aliceSocket, bobSocket } = await createJoinedRoom();

  const persistedRoom = await storage.get('room');
  assert.deepEqual(persistedRoom.players, { sente: 'alice', gote: 'bob' });
  assert.equal(persistedRoom.revision, 2);
  assert.equal(aliceSocket.sent.length, 2);
  assert.equal(bobSocket.sent.length, 1);
  assert.equal(aliceSocket.sent[0].payload.player, 'sente');
  assert.equal(aliceSocket.sent[1].type, 'roomPresenceUpdated');
  assert.equal(bobSocket.sent[0].payload.player, 'gote');
  assert.equal(bobSocket.sent[0].revision, 2);
  assertViewOnly(bobSocket.sent[0]);
});

test('RoomDurableObject accepts placePitfall and sends revisioned GameView events without leaking hidden pitfalls', async () => {
  const { aliceSocket, bobSocket } = await createJoinedRoom();

  aliceSocket.receive({
    type: 'placePitfall',
    roomId: 'room-a',
    clientSeq: 2,
    position: { row: 4, col: 4 },
  });
  await flushSocketTasks();

  assert.equal(aliceSocket.sent.length, 3);
  assert.equal(bobSocket.sent.length, 2);
  assert.equal(latest(aliceSocket).type, 'gameViewUpdated');
  assert.equal(latest(bobSocket).type, 'gameViewUpdated');
  assert.equal(latest(aliceSocket).revision, 3);
  assert.equal(latest(bobSocket).revision, 3);
  assert.equal(latest(aliceSocket).ackClientSeq, 2);
  assert.equal(latest(bobSocket).ackClientSeq, 2);
  assert.deepEqual(latest(aliceSocket).payload.view.visiblePitfalls, [
    { position: { row: 4, col: 4 }, owner: 'sente' },
  ]);
  assert.deepEqual(latest(bobSocket).payload.view.visiblePitfalls, []);
  assertViewOnly(latest(aliceSocket));
  assertViewOnly(latest(bobSocket));
});

test('RoomDurableObject rejects out-of-turn commands without broadcasting', async () => {
  const { aliceSocket, bobSocket } = await createJoinedRoom();

  bobSocket.receive({
    type: 'placePitfall',
    roomId: 'room-a',
    clientSeq: 2,
    position: { row: 4, col: 4 },
  });
  await flushSocketTasks();

  assert.equal(aliceSocket.sent.length, 2);
  assert.equal(bobSocket.sent.length, 2);
  assert.equal(latest(bobSocket).type, 'invalidCommand');
  assert.equal(latest(bobSocket).revision, 2);
  assert.equal(latest(bobSocket).ackClientSeq, 2);
  assert.equal(latest(bobSocket).payload.commandType, 'placePitfall');
  assert.match(latest(bobSocket).payload.reason, /not your turn/);
});

test('RoomDurableObject rejects stale clientSeq commands', async () => {
  const { aliceSocket } = await createJoinedRoom();

  aliceSocket.receive({
    type: 'placePitfall',
    roomId: 'room-a',
    clientSeq: 2,
    position: { row: 4, col: 4 },
  });
  await flushSocketTasks();
  aliceSocket.receive({
    type: 'makeMove',
    roomId: 'room-a',
    clientSeq: 2,
    action: {
      type: 'move',
      from: { row: 6, col: 4 },
      to: { row: 5, col: 4 },
      piece: { kind: 'pawn', owner: 'sente' },
    },
  });
  await flushSocketTasks();

  assert.equal(latest(aliceSocket).type, 'invalidCommand');
  assert.equal(latest(aliceSocket).revision, 3);
  assert.equal(latest(aliceSocket).ackClientSeq, 2);
  assert.equal(latest(aliceSocket).payload.commandType, 'makeMove');
  assert.match(latest(aliceSocket).payload.reason, /stale clientSeq/);
});

test('RoomDurableObject accepts makeMove and keeps opponent GameView hidden-info safe', async () => {
  const { aliceSocket, bobSocket } = await createJoinedRoom();

  aliceSocket.receive({
    type: 'placePitfall',
    roomId: 'room-a',
    clientSeq: 2,
    position: { row: 4, col: 4 },
  });
  await flushSocketTasks();
  aliceSocket.receive({
    type: 'makeMove',
    roomId: 'room-a',
    clientSeq: 3,
    action: {
      type: 'move',
      from: { row: 6, col: 4 },
      to: { row: 5, col: 4 },
      piece: { kind: 'pawn', owner: 'sente' },
    },
  });
  await flushSocketTasks();

  assert.equal(latest(aliceSocket).type, 'gameViewUpdated');
  assert.equal(latest(bobSocket).type, 'gameViewUpdated');
  assert.equal(latest(aliceSocket).revision, 4);
  assert.equal(latest(bobSocket).revision, 4);
  assert.equal(latest(aliceSocket).ackClientSeq, 3);
  assert.equal(latest(bobSocket).ackClientSeq, 3);
  assert.deepEqual(latest(bobSocket).payload.view.visiblePitfalls, []);
  assertViewOnly(latest(aliceSocket));
  assertViewOnly(latest(bobSocket));
});

test('RoomDurableObject accepts resign and broadcasts gameOver views', async () => {
  const { aliceSocket, bobSocket } = await createJoinedRoom();

  aliceSocket.receive({ type: 'resign', roomId: 'room-a', clientSeq: 2 });
  await flushSocketTasks();

  assert.equal(latest(aliceSocket).type, 'gameOver');
  assert.equal(latest(bobSocket).type, 'gameOver');
  assert.equal(latest(aliceSocket).revision, 3);
  assert.equal(latest(bobSocket).revision, 3);
  assert.equal(latest(aliceSocket).ackClientSeq, 2);
  assert.equal(latest(bobSocket).ackClientSeq, 2);
  assert.equal(latest(aliceSocket).payload.winner, 'gote');
  assert.equal(latest(bobSocket).payload.winner, 'gote');
  assert.equal(latest(aliceSocket).payload.reason, 'resign');
  assert.equal(latest(bobSocket).payload.reason, 'resign');
  assert.equal(latest(aliceSocket).payload.view.phase.type, 'GAME_OVER');
  assert.equal(latest(bobSocket).payload.view.phase.type, 'GAME_OVER');
  assertViewOnly(latest(aliceSocket));
  assertViewOnly(latest(bobSocket));
});
