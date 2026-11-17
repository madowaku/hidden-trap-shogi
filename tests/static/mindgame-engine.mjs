import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRandom, loadGameModule, root } from '../../scripts/research/load-game.mjs';

const mind = loadGameModule('src/game/mindgame.ts');
const board = loadGameModule('src/game/board.ts');
const { simpleBot } = loadGameModule('src/game/bot.ts');
const { createInitialGameState, createEmptyHand } = loadGameModule('src/game/constants.ts');
const { gameReducer } = loadGameModule('src/game/reducer.ts');
const { getPlayerView } = loadGameModule('src/game/view.ts');

const HAND_KINDS = ['rook', 'bishop', 'gold', 'silver', 'knight', 'lance', 'pawn'];

function near(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ''} expected ${expected}, got ${actual}`);
}

function withSeed(seed, fn) {
  const originalRandom = Math.random;
  Math.random = createRandom(seed);
  try {
    return fn();
  } finally {
    Math.random = originalRandom;
  }
}

/** Hard 同士で数手進めた実戦局面を作る */
function playHardTurns(turns, seed) {
  return withSeed(seed, () => {
    let state = createInitialGameState('pvbot', true, 'gote', 'hard');
    const states = [state];
    while (state.phase.type !== 'GAME_OVER' && states.length <= turns) {
      const player = state.currentPlayer;
      state = gameReducer(state, { type: 'PLACE_PITFALL', position: simpleBot.decidePitfall(state, player, 'hard') });
      assert.equal(state.phase.type, 'MOVE_SELECTION', 'Hard bot must place a legal pitfall');
      const placed = state;
      state = gameReducer(state, { type: 'EXECUTE_MOVE', action: simpleBot.decideMove(state, player, 'hard') });
      assert.notEqual(state, placed, 'Hard bot must choose a move the reducer accepts');
      assert.notEqual(state.phase.type, 'PROMOTION_DECISION', 'Hard bot decides promotion itself');
      states.push(state);
    }
    return states;
  });
}

test('mind game engine is a GameView-only boundary', () => {
  const source = readFileSync(resolve(root, 'src/game/mindgame.ts'), 'utf8');

  assert.match(source, /GameView/);
  assert.doesNotMatch(source, /GameState/);
  assert.doesNotMatch(source, /\bpitfalls\b/);
  assert.doesNotMatch(source, /\bpendingPitfall\b/);
  assert.doesNotMatch(source, /\bvisiblePitfalls\b/);
});

test('trap game: two equally tempting moves are trapped and played 50/50', () => {
  const solution = mind.solveTrapGame(
    [{ value: 0.6, trappable: true }, { value: 0.6, trappable: true }],
    -0.2
  );

  near(solution.trapMix[0], 0.5);
  near(solution.trapMix[1], 0.5);
  near(solution.moverMix[0], 0.5);
  near(solution.value, 0.2, 'value is halfway between success and failure');
});

test('trap game: the tastier move is trapped more often and played less often', () => {
  const options = [
    { value: 0.8, trappable: true },
    { value: 0.3, trappable: true },
    { value: 0.1, trappable: true },
  ];
  const failValue = -0.1;
  const solution = mind.solveTrapGame(options, failValue);

  assert.ok(solution.trapMix[0] > solution.trapMix[1]);
  assert.ok(solution.moverMix[0] < solution.moverMix[1]);
  near(solution.moverMix.reduce((sum, p) => sum + p, 0), 1);
  assert.ok(solution.trapMix.reduce((sum, p) => sum + p, 0) <= 1 + 1e-9);

  // 均衡: 指す側はサポート上のどの手でも同じ期待値になる
  options.forEach((option, i) => {
    if (solution.moverMix[i] === 0) return;
    const expected = solution.trapMix[i] * failValue + (1 - solution.trapMix[i]) * option.value;
    near(expected, solution.value, `option ${i} is indifferent`);
  });
  // 均衡: 罠側はサポート上のどこに置いても同じ得になる
  const gains = options
    .map((option, i) => solution.moverMix[i] * (option.value - failValue))
    .filter((_, i) => solution.trapMix[i] > 0);
  gains.forEach(gain => near(gain, gains[0], 'trapper is indifferent'));
});

test('trap game: an untrappable move sets a floor the trapper cannot break', () => {
  const solution = mind.solveTrapGame(
    [{ value: 0.9, trappable: true }, { value: 0.5, trappable: false }],
    -1
  );

  near(solution.value, 0.5);
  assert.ok(solution.trapMix[0] > 0, 'the tempting move still has to be guarded');
  near(solution.trapMix[1], 0);
});

test('trap game: with nothing to lose, the single good move is always tried', () => {
  // 受けが 1 つしかない王手: 失敗 = 負け。安全だが負けの手より、賭けに出る。
  const solution = mind.solveTrapGame(
    [{ value: 0.2, trappable: true }, { value: -1, trappable: false }, { value: -1, trappable: true }],
    -1
  );

  near(solution.moverMix[0], 1);
  near(solution.trapMix[0], 1);
});

test('mind game move generation matches board.ts in real positions', () => {
  const states = playHardTurns(24, 11);
  assert.ok(states.length > 10);

  for (const state of states) {
    if (state.phase.type === 'GAME_OVER') continue;
    for (const player of ['sente', 'gote']) {
      const expected = [];
      for (const move of board.getAllLegalMoves(state.board, player)) {
        expected.push(`move:${move.from.row * 9 + move.from.col}:${move.to.row * 9 + move.to.col}`);
      }
      for (const kind of HAND_KINDS) {
        if (state.hands[player][kind] <= 0) continue;
        for (const to of board.getLegalDrops(state.board, player, kind)) {
          expected.push(`drop:${kind}:${to.row * 9 + to.col}`);
        }
      }
      assert.deepEqual(
        mind.listMindGameDestinations(getPlayerView(state, player), player),
        expected.sort()
      );
    }
  }
});

test('Hard bot plays full games with legal traps and moves', () => {
  for (const seed of [3, 4]) {
    const states = playHardTurns(300, seed);
    const last = states[states.length - 1];
    assert.equal(last.phase.type, 'GAME_OVER', `seed ${seed} should finish`);

    for (const entry of last.log) {
      const previous = last.log.filter(e => e.player === entry.player && e.turn < entry.turn).pop();
      if (previous) assert.notDeepEqual(entry.pitfallSet, previous.pitfallSet, 'no repeated trap square');
    }
  }
});

test('Hard bot plan does not change when only hidden opponent trap information changes', () => {
  const states = playHardTurns(14, 21).filter(state => state.phase.type !== 'GAME_OVER');
  const state = states[states.length - 1];
  const player = state.currentPlayer;
  const opponent = player === 'sente' ? 'gote' : 'sente';

  // 相手の未公開罠と、相手ログに残っている「相手が置いた罠」を全部書き換える
  const tampered = {
    ...state,
    pitfalls: { ...state.pitfalls, [opponent]: { position: { row: 4, col: 4 }, owner: opponent } },
    log: state.log.map(entry => (
      entry.player === opponent ? { ...entry, pitfallSet: { row: 5, col: 5 } } : entry
    )),
  };

  const options = { ownLastTrap: state.lastPitfallPositionByPlayer[player] };
  const original = mind.planMindGameTurn(getPlayerView(state, player), { ...options, random: createRandom(5) });
  const changed = mind.planMindGameTurn(getPlayerView(tampered, player), { ...options, random: createRandom(5) });

  assert.deepEqual(changed.pitfall, original.pitfall);
  assert.deepEqual(changed.move.action, original.move.action);
  assert.deepEqual(changed.move.candidates, original.move.candidates);
  assert.deepEqual(changed.trapTargets, original.trapTargets);
});

test('a revealed trap square is known to be safe on the next turn (no repeated traps)', () => {
  const emptyBoard = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => null));
  emptyBoard[8][0] = { kind: 'king', owner: 'sente' };
  emptyBoard[0][8] = { kind: 'king', owner: 'gote' };
  emptyBoard[4][4] = { kind: 'rook', owner: 'gote' };
  emptyBoard[4][6] = { kind: 'rook', owner: 'sente' };

  const revealed = { row: 4, col: 6 };
  const view = (log) => ({
    viewer: 'gote',
    board: emptyBoard,
    currentPlayer: 'gote',
    turn: 9,
    phase: { type: 'MOVE_SELECTION' },
    visiblePitfalls: [],
    hands: { sente: createEmptyHand(), gote: createEmptyHand() },
    log,
    config: { casualMode: true, gameMode: 'pvbot', botLevel: 'hard', botPlayer: 'gote' },
    winner: null,
  });
  const rookCapture = decision => decision.candidates.find(c => c.to.row === 4 && c.to.col === 6);

  const withoutReveal = mind.decideMindGameMove(view([]), { random: () => 0 });
  const unknown = rookCapture(withoutReveal);
  assert.equal(unknown.trappable, true);
  assert.equal(
    unknown.trapProbability,
    Math.max(...withoutReveal.candidates.map(c => c.trapProbability)),
    'a free rook is the most likely place for a trap'
  );
  assert.ok(unknown.trapProbability > 0);

  // 直前の自分の手番で、相手の罠が (4,6) にあったと公開された → 今回そこは絶対に罠ではない
  const afterReveal = mind.decideMindGameMove(view([{
    turn: 7,
    player: 'gote',
    action: null,
    pitfallSet: { row: 0, col: 0 },
    pitfallTriggered: true,
    triggeredPitfall: revealed,
    revealedPitfall: revealed,
  }]), { random: () => 0 });
  const known = rookCapture(afterReveal);
  assert.equal(known.trappable, false);
  near(known.trapProbability, 0);
  assert.deepEqual(afterReveal.action.to, revealed);
});

test('opponent habits are neutral without usable public history', () => {
  const state = createInitialGameState('pvbot', true, 'gote', 'hard');
  assert.deepEqual(mind.readOpponentHabits(getPlayerView(state, 'gote'), 'gote'), {
    trapSamples: 0,
    trapOnBestBias: 0,
    moveSamples: 0,
    greedBias: 0,
  });

  const states = playHardTurns(16, 31).filter(s => s.phase.type !== 'GAME_OVER');
  const played = states[states.length - 1];
  const habits = mind.readOpponentHabits(getPlayerView(played, played.currentPlayer), played.currentPlayer);
  assert.ok(habits.moveSamples > 0, 'public moves are observed');
  assert.ok(Math.abs(habits.greedBias) <= 1);
  assert.ok(Math.abs(habits.trapOnBestBias) <= 1);
});
