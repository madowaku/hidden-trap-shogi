import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const contractPath = resolve(root, 'src/server/contract.ts');
const typesPath = resolve(root, 'src/game/types.ts');

function compileContractProbe(sourceText) {
  const probePath = resolve(root, 'tests/static/server-room-contract.probe.ts');
  const options = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  };
  const host = ts.createCompilerHost(options);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (resolve(fileName) === probePath) {
      return ts.createSourceFile(fileName, sourceText, languageVersion, true);
    }
    return originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  };

  const program = ts.createProgram([probePath], options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
}

test('server room contract exposes client commands and server events without raw GameState payloads', () => {
  assert.ok(existsSync(contractPath), 'src/server/contract.ts should exist');

  const diagnostics = compileContractProbe(`
    import type { ClientCommand, ServerEvent } from '../../src/server/contract';
    import type { GameAction, GameState, GameView } from '../../src/game/types';

    declare const move: GameAction;
    declare const view: GameView;
    declare const fullState: GameState;

    const commands: ClientCommand[] = [
      { type: 'joinRoom', roomId: 'room-a', clientSeq: 1 },
      { type: 'placePitfall', roomId: 'room-a', position: { row: 2, col: 3 }, clientSeq: 2 },
      { type: 'makeMove', roomId: 'room-a', action: move, clientSeq: 3 },
      { type: 'resign', roomId: 'room-a', clientSeq: 4 },
    ];

    const events: ServerEvent[] = [
      { type: 'roomJoined', revision: 1, ackClientSeq: 1, payload: { roomId: 'room-a', player: 'sente', view } },
      { type: 'gameViewUpdated', revision: 2, ackClientSeq: 2, payload: { view } },
      { type: 'invalidCommand', revision: 2, ackClientSeq: 2, payload: { commandType: commands[0].type, reason: 'not your turn' } },
      { type: 'gameOver', revision: 3, ackClientSeq: 4, payload: { winner: 'sente', reason: 'resign', view } },
    ];

    // @ts-expect-error Server events must send GameView, not full hidden GameState.
    const leakedStateEvent: ServerEvent = { type: 'gameViewUpdated', payload: { state: fullState } };

    // @ts-expect-error Client commands cannot report or smuggle opponent hidden traps.
    const leakedTrapCommand: ClientCommand = { type: 'makeMove', roomId: 'room-a', action: move, opponentPitfall: { position: { row: 4, col: 4 }, owner: 'gote' } };

    void events;
    void leakedStateEvent;
    void leakedTrapCommand;
  `);

  assert.deepEqual(diagnostics, []);
});

test('contract source does not import or expose GameState/pitfall maps in wire payloads', () => {
  assert.ok(existsSync(contractPath), 'src/server/contract.ts should exist');
  assert.ok(existsSync(typesPath), 'src/game/types.ts should exist');

  const source = readFileSync(contractPath, 'utf8');

  assert.doesNotMatch(source, /\bGameState\b/);
  assert.doesNotMatch(source, /\bpitfalls\b/);
  assert.match(source, /\bGameView\b/);
});

test('worker releases room player slots when sockets close', () => {
  const workerPath = resolve(root, 'src/worker/room-worker.ts');
  assert.ok(existsSync(workerPath), 'src/worker/room-worker.ts should exist');

  const source = readFileSync(workerPath, 'utf8');

  assert.match(source, /releasePlayerSlot\(playerId\)/);
  assert.match(source, /delete nextPlayers\.sente/);
  assert.match(source, /delete nextPlayers\.gote/);
  assert.match(source, /storage\.put\(ROOM_STORAGE_KEY, this\.room\)/);
});
