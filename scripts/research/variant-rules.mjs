// 罠ルールの変種を「比較実験として」適用するシミュレータ。
//
// アプリの reducer（src/game/reducer.ts）は一切変えず、その外側で変種ルールを再現する。
//   A standard       … 現行ルール
//   B kingImmune     … 王の移動は罠にかからない
//   C checkRetry     … 王手されている時の応手が罠で失敗したら、罠を見てから指し直せる
//   D checkVoidsTrap … 王手をかけた手番に置いた罠は無効（王手された側には罠がない）
//
// 読み合いエンジン（mindgame.ts）にも同じ変種を `rules` オプションで渡し、
// Bot が変種ルールを理解して指すようにしている。

import { loadGameModule } from './load-game.mjs';

const { gameReducer } = loadGameModule('src/game/reducer.ts');
const board = loadGameModule('src/game/board.ts');
const { getPlayerView } = loadGameModule('src/game/view.ts');
const mind = loadGameModule('src/game/mindgame.ts');

export const VARIANTS = {
  standard: { code: 'A', label: 'A: 現行ルール' },
  kingImmune: { code: 'B', label: 'B: 王の移動は罠無効' },
  checkRetry: { code: 'C', label: 'C: 王手の応手は罠で失敗したら指し直し' },
  checkVoidsTrap: { code: 'D', label: 'D: 王手をかけた手番の罠は無効' },
};

const HAND_KINDS = ['rook', 'bishop', 'gold', 'silver', 'knight', 'lance', 'pawn'];
/** これ以下なら「負けを読み切っていた」とみなす */
const HOPELESS_VALUE = -0.95;

function opponentOf(player) {
  return player === 'sente' ? 'gote' : 'sente';
}

function samePos(a, b) {
  return Boolean(a && b && a.row === b.row && a.col === b.col);
}

export function actionKey(action) {
  if (!action) return 'none';
  return action.type === 'move'
    ? `m${action.from.row}${action.from.col}${action.to.row}${action.to.col}`
    : `d${action.piece.kind}${action.to.row}${action.to.col}`;
}

/** 全合法手（移動 + 打ち） */
export function allActions(state, player) {
  const actions = board.getAllLegalMoves(state.board, player).map(move => ({ ...move }));
  for (const kind of HAND_KINDS) {
    if (state.hands[player][kind] <= 0) continue;
    for (const to of board.getLegalDrops(state.board, player, kind)) {
      actions.push({ type: 'drop', to, piece: { kind, owner: player } });
    }
  }
  return actions;
}

function boardAfter(state, action) {
  return action.type === 'move' ? board.applyMove(state.board, action) : board.applyDrop(state.board, action);
}

/**
 * 王手されている時の「受けになる手」を数える。
 * 受け = 指した後に相手が王を取れない手。
 */
export function describeCheck(state, player) {
  const saving = new Set();
  const destinations = new Set();
  let kingEscapes = 0;
  for (const action of allActions(state, player)) {
    if (board.isPlayerInCheck(boardAfter(state, action), player)) continue;
    saving.add(actionKey(action));
    destinations.add(`${action.to.row}:${action.to.col}`);
    if (action.piece.kind === 'king') kingEscapes += 1;
  }
  return { saving, destinations: destinations.size, kingEscapes };
}

function execute(state, action) {
  let next = gameReducer(state, { type: 'EXECUTE_MOVE', action });
  if (next === state) throw new Error(`illegal move: ${actionKey(action)}`);
  if (next.phase.type === 'PROMOTION_DECISION') next = gameReducer(next, { type: 'DECIDE_PROMOTION', promote: true });
  if (next.phase.type === 'PASS_DEVICE') next = gameReducer(next, { type: 'ACKNOWLEDGE_PASS_DEVICE' });
  return next;
}

function withoutTrap(state, owner) {
  return { ...state, pitfalls: { ...state.pitfalls, [owner]: null } };
}

function patchLastLog(state, patch) {
  const log = state.log.slice();
  log[log.length - 1] = { ...log[log.length - 1], ...patch };
  return { ...state, log };
}

/**
 * 1 手番を変種ルールで進める。
 *
 * agent:
 *   pitfall(state, player) → Position
 *   move(state, player) → { action, decision? }
 *   retry(state, player, trap) → { action, decision? } | null   （C の指し直し）
 */
export function playTurn(state, variant, agent) {
  const player = state.currentPlayer;
  const opponent = opponentOf(player);
  const inCheck = board.isPlayerInCheck(state.board, player);
  const check = inCheck ? describeCheck(state, player) : null;

  const placed = gameReducer(state, { type: 'PLACE_PITFALL', position: agent.pitfall(state, player) });
  if (placed.phase.type !== 'MOVE_SELECTION') throw new Error('illegal pitfall');

  const { action, decision } = agent.move(placed, player);
  const trap = placed.pitfalls[opponent]?.position ?? null;
  const kingCapture = action.type === 'move' && board.isKingSquare(placed.board, action.to);
  const hitsTrap = !kingCapture && samePos(action.to, trap);

  const record = {
    board: state.board,
    hands: state.hands,
    turn: state.turn,
    player,
    inCheck,
    check: check && { destinations: check.destinations, kingEscapes: check.kingEscapes },
    attemptedSaving: check ? check.saving.has(actionKey(action)) : null,
    action,
    trap,
    decision: decision ?? null,
    trapped: false,
    event: null,
    retryAction: null,
    retrySaving: null,
  };

  let next;
  if (hitsTrap && variant === 'kingImmune' && action.piece.kind === 'king') {
    // B: 王は罠を踏まない。罠は公開済みとして扱う（Casual の不発罠と同じ）
    next = execute(withoutTrap(placed, opponent), action);
    if (placed.config.casualMode) next = patchLastLog(next, { revealedPitfall: trap });
    record.event = 'kingImmune';
  } else if (hitsTrap && variant === 'checkRetry' && inCheck) {
    // C: 罠で失敗した応手は取り消し、罠を見てから指し直す
    record.trapped = true;
    const retry = agent.retry(placed, player, trap);
    if (retry) {
      next = execute(withoutTrap(placed, opponent), retry.action);
      next = patchLastLog(next, {
        failedAction: action,
        pitfallTriggered: true,
        triggeredPitfall: trap,
        revealedPitfall: trap,
      });
      record.event = 'retry';
      record.retryAction = retry.action;
      record.retrySaving = check.saving.has(actionKey(retry.action));
    } else {
      next = execute(placed, action);
    }
  } else {
    next = execute(placed, action);
    record.trapped = hitsTrap;
  }

  if (
    variant === 'checkVoidsTrap'
    && next.phase.type !== 'GAME_OVER'
    && !record.trapped
    && next.pitfalls[player]
    && board.isPlayerInCheck(next.board, opponent)
  ) {
    // D: 王手をかけたので、この手番に置いた罠は消える（位置は公開しない）
    next = { ...next, pitfalls: { ...next.pitfalls, [player]: null } };
    record.event = 'voided';
  }

  return { state: next, record };
}

/**
 * 負けた側の最後の手番から、決着の形を分類する。
 *   roulette        … 王手に受けの着地点が 2 つ以上あり、受けの手を選んだのに罠で潰された
 *   trap-mate       … 受けの着地点が 1 つしかなく、そこに罠があった（罠を置く側は確実に当てられる＝実質の詰み）
 *   mate            … 王手に受けが 1 つもなかった（詰み）
 *   missed-defense  … 受けがあったのに、受けにならない手を指した（C の指し直しで受けが残っていなかった場合を除く）
 *   self-exposure   … 王手されていないのに、自分の手で王を取られる形にした
 *   hopeless        … 上の 2 つのうち、指す側がすでに負けを読み切っていた（評価 ≤ -0.95）もの。投了に近い
 */
export function classifyEnding(records, winner) {
  if (!winner) return 'draw';
  const loser = opponentOf(winner);
  const last = [...records].reverse().find(record => record.player === loser);
  if (!last) return 'unknown';
  const hopeless = last.decision ? last.decision.gameValue <= HOPELESS_VALUE : false;
  if (!last.inCheck) return hopeless ? 'hopeless' : 'self-exposure';
  const k = last.check.destinations;
  if (k === 0) return 'mate';
  if (last.event === 'retry') {
    // C: 指し直しても受からなかった。受けが 1 つだけならそこを塞がれた罠詰み
    if (k === 1) return 'trap-mate';
    return hopeless ? 'hopeless' : 'missed-defense';
  }
  if (last.trapped && last.attemptedSaving) return k === 1 ? 'trap-mate' : 'roulette';
  return hopeless ? 'hopeless' : 'missed-defense';
}

// --- エージェント -----------------------------------------------------------------

/** 読み合いエンジン（変種ルールを理解して指す） */
export function createMindAgent(variant, random, extra = {}) {
  let plan = null;
  return {
    name: extra.name ?? 'mind',
    pitfall(state, player) {
      plan = mind.planMindGameTurn(getPlayerView(state, player), {
        ...extra,
        rules: variant,
        random,
        ownLastTrap: state.lastPitfallPositionByPlayer[player],
      });
      return plan.pitfall;
    },
    move() {
      return { action: plan.move.action, decision: plan.move };
    },
    retry(state, player, trap) {
      try {
        const decision = mind.decideMindGameMove(getPlayerView(state, player), {
          ...extra,
          rules: variant,
          random,
          revealedTrap: trap,
          ownLastTrap: state.lastPitfallPositionByPlayer[player],
        });
        return { action: decision.action, decision };
      } catch {
        return null;
      }
    },
  };
}

/** 既存 Bot（現行ルール前提。比較用） */
export function createLegacyAgent(level, extra = {}) {
  const { simpleBot } = loadGameModule('src/game/bot.ts');
  return {
    name: extra.name ?? level,
    pitfall: (state, player) => simpleBot.decidePitfall(state, player, level),
    move: (state, player) => ({ action: simpleBot.decideMove(state, player, level) }),
    retry(state, player, trap) {
      const options = allActions(state, player).filter(action => !samePos(action.to, trap));
      return options.length > 0 ? { action: options[0] } : null;
    },
  };
}
