import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRandom, loadGameModule } from '../../scripts/research/load-game.mjs';

const { simpleBot } = loadGameModule('src/game/bot.ts');
const { createInitialGameState } = loadGameModule('src/game/constants.ts');
const { gameReducer } = loadGameModule('src/game/reducer.ts');
const { getPlayerView } = loadGameModule('src/game/view.ts');
const mind = loadGameModule('src/game/mindgame.ts');
const { createRoom, joinRoom, handleRoomCommand } = loadGameModule('src/game/room.ts');

const VIEWERS = ['sente', 'gote', 'spectator'];

/** Normal 同士で対局し、各手番開始時（罠設置前）と罠設置後の状態を全部集める */
function playStates({ casual, seed, maxTurns = 60 }) {
  const original = Math.random;
  Math.random = createRandom(seed);
  try {
    let state = createInitialGameState('pvp', casual, 'gote', 'normal');
    const states = [state];
    while (state.phase.type !== 'GAME_OVER' && state.turn <= maxTurns) {
      if (state.phase.type === 'PASS_DEVICE') state = gameReducer(state, { type: 'ACKNOWLEDGE_PASS_DEVICE' });
      const player = state.currentPlayer;
      state = gameReducer(state, { type: 'PLACE_PITFALL', position: simpleBot.decidePitfall(state, player, 'normal') });
      states.push(state);
      state = gameReducer(state, { type: 'EXECUTE_MOVE', action: simpleBot.decideMove(state, player, 'normal') });
      if (state.phase.type === 'PROMOTION_DECISION') state = gameReducer(state, { type: 'DECIDE_PROMOTION', promote: true });
      states.push(state);
    }
    return states;
  } finally {
    Math.random = original;
  }
}

function isRevealedLater(log, index) {
  const entry = log[index];
  const answer = log.slice(index + 1).find(next => next.player !== entry.player);
  const known = answer?.triggeredPitfall ?? answer?.revealedPitfall;
  return Boolean(known && known.row === entry.pitfallSet.row && known.col === entry.pitfallSet.col);
}

/** viewer が知ってはいけない罠だけを、別のマスに書き換える */
function tamperHiddenTraps(state, viewer) {
  const moveAway = (position) => ({ row: (position.row + 3) % 9, col: (position.col + 5) % 9 });
  const hiddenOwners = viewer === 'spectator' ? ['sente', 'gote'] : [viewer === 'sente' ? 'gote' : 'sente'];

  const pitfalls = { ...state.pitfalls };
  for (const owner of hiddenOwners) {
    if (pitfalls[owner]) pitfalls[owner] = { ...pitfalls[owner], position: moveAway(pitfalls[owner].position) };
  }
  const pendingPitfall = state.pendingPitfall && hiddenOwners.includes(state.pendingPitfall.owner)
    ? { ...state.pendingPitfall, position: moveAway(state.pendingPitfall.position) }
    : state.pendingPitfall;
  const lastPitfallPositionByPlayer = { ...state.lastPitfallPositionByPlayer };
  for (const owner of hiddenOwners) {
    if (lastPitfallPositionByPlayer[owner]) lastPitfallPositionByPlayer[owner] = moveAway(lastPitfallPositionByPlayer[owner]);
  }
  const log = state.log.map((entry, index) => (
    hiddenOwners.includes(entry.player) && !isRevealedLater(state.log, index)
      ? { ...entry, pitfallSet: moveAway(entry.pitfallSet) }
      : entry
  ));
  return { ...state, pitfalls, pendingPitfall, lastPitfallPositionByPlayer, log };
}

for (const casual of [true, false]) {
  const mode = casual ? 'Casual' : 'Strict';

  test(`${mode}: views are identical when only hidden traps differ (every turn, every viewer)`, () => {
    let compared = 0;
    for (const seed of [1, 2, 3]) {
      for (const state of playStates({ casual, seed })) {
        if (state.phase.type === 'GAME_OVER') continue;
        for (const viewer of VIEWERS) {
          assert.deepEqual(
            getPlayerView(tamperHiddenTraps(state, viewer), viewer),
            getPlayerView(state, viewer),
            `${mode} seed ${seed} turn ${state.turn} viewer ${viewer}`
          );
          compared += 1;
        }
      }
    }
    assert.ok(compared > 100);
  });

  test(`${mode}: the opponent's active trap never appears in the log`, () => {
    for (const state of playStates({ casual, seed: 4 })) {
      if (state.phase.type === 'GAME_OVER') continue;
      for (const viewer of ['sente', 'gote']) {
        const opponent = viewer === 'sente' ? 'gote' : 'sente';
        const view = getPlayerView(state, viewer);
        const lastOpponentEntry = view.log.filter(entry => entry.player === opponent).at(-1);
        if (lastOpponentEntry && state.pitfalls[opponent]) {
          assert.equal('pitfallSet' in lastOpponentEntry, false, `turn ${state.turn}: active trap of ${opponent} leaked`);
        }
      }
    }
  });

  test(`${mode}: own traps and already revealed traps stay in the log`, () => {
    const states = playStates({ casual, seed: 5 }).filter(state => state.phase.type !== 'GAME_OVER');
    const state = states[states.length - 1];
    for (const viewer of ['sente', 'gote']) {
      const view = getPlayerView(state, viewer);
      view.log.forEach((entry, index) => {
        if (entry.player === viewer || isRevealedLater(state.log, index)) {
          assert.deepEqual(entry.pitfallSet, state.log[index].pitfallSet);
        } else {
          assert.equal(entry.pitfallSet, undefined);
        }
      });
    }
  });
}

test('Casual reveals every past opponent trap; Strict keeps missed ones hidden until game over', () => {
  const casualState = playStates({ casual: true, seed: 6 }).filter(s => s.phase.type !== 'GAME_OVER').at(-1);
  const casualView = getPlayerView(casualState, 'sente');
  const hiddenCasual = casualView.log.filter(entry => entry.player === 'gote' && !entry.pitfallSet);
  assert.ok(hiddenCasual.length <= 1, 'only the currently active trap is hidden in Casual');

  const strictStates = playStates({ casual: false, seed: 6 });
  const strictState = strictStates.filter(s => s.phase.type !== 'GAME_OVER').at(-1);
  const strictView = getPlayerView(strictState, 'sente');
  const hiddenStrict = strictView.log.filter(entry => entry.player === 'gote' && !entry.pitfallSet);
  assert.ok(hiddenStrict.length > 1, 'missed traps stay hidden in Strict');
  hiddenStrict.forEach(entry => assert.equal(entry.revealedPitfall, undefined));
});

test('after game over the full trap history is public for the review screen', () => {
  const states = playStates({ casual: false, seed: 7, maxTurns: 300 });
  const last = states.at(-1);
  assert.equal(last.phase.type, 'GAME_OVER');
  for (const viewer of VIEWERS) {
    assert.deepEqual(getPlayerView(last, viewer).log, last.log);
  }
});

test('Hard bot decisions do not change when the view log is redacted', () => {
  for (const seed of [8, 9]) {
    const states = playStates({ casual: seed === 8, seed }).filter(s => s.phase.type === 'PITFALL_PLACEMENT');
    for (const state of states.slice(4, 12)) {
      const player = state.currentPlayer;
      const options = { ownLastTrap: state.lastPitfallPositionByPlayer[player] };
      const redacted = getPlayerView(state, player);
      const unredacted = { ...redacted, log: state.log };
      const a = mind.planMindGameTurn(redacted, { ...options, random: createRandom(seed) });
      const b = mind.planMindGameTurn(unredacted, { ...options, random: createRandom(seed) });
      assert.deepEqual(a, b, `seed ${seed} turn ${state.turn}`);
    }
  }
});

test('online room events never carry the opponent\'s unrevealed trap', () => {
  const original = Math.random;
  Math.random = createRandom(10);
  try {
    let now = 1000;
    let room = joinRoom(createRoom('room-leak', now), 'alice', ++now, 1).room;
    room = joinRoom(room, 'bob', ++now, 1).room;
    room = joinRoom(room, 'carol', ++now, 1).room; // 観戦者
    const seq = { alice: 1, bob: 1 };
    const idOf = { sente: 'alice', gote: 'bob' };
    let checkedEvents = 0;

    for (let ply = 0; ply < 24 && room.gameState.phase.type !== 'GAME_OVER'; ply++) {
      const player = room.gameState.currentPlayer;
      const playerId = idOf[player];
      const position = simpleBot.decidePitfall(room.gameState, player, 'normal');
      room = handleRoomCommand(room, playerId, { type: 'placePitfall', roomId: 'room-leak', position, clientSeq: ++seq[playerId] }, ++now).room;
      const action = simpleBot.decideMove(room.gameState, player, 'normal');
      const result = handleRoomCommand(room, playerId, {
        type: 'makeMove', roomId: 'room-leak', action: { ...action, promote: action.promote ?? true }, clientSeq: ++seq[playerId],
      }, ++now);
      room = result.room;

      for (const [recipient, events] of Object.entries(result.eventsByPlayerId)) {
        const viewer = recipient === 'alice' ? 'sente' : recipient === 'bob' ? 'gote' : 'spectator';
        for (const event of events) {
          const view = event.payload?.view;
          if (!view || view.phase.type === 'GAME_OVER') continue;
          // サーバーが送る JSON そのものを検査する
          const wire = JSON.parse(JSON.stringify(event));
          wire.payload.view.log.forEach((entry, index) => {
            if (entry.player === viewer) return;
            if (isRevealedLater(room.gameState.log, index)) return;
            assert.equal('pitfallSet' in entry, false, `${recipient} received hidden trap of ${entry.player} (turn ${entry.turn})`);
          });
          assert.equal(JSON.stringify(wire).includes('"pitfalls"'), false);
          assert.equal(JSON.stringify(wire).includes('"pendingPitfall"'), false);
          checkedEvents += 1;
        }
      }
    }
    assert.ok(checkedEvents >= 24 * 3, `checked ${checkedEvents} events`);
  } finally {
    Math.random = original;
  }
});
