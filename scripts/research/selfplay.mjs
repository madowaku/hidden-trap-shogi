// 落とし穴将棋 Bot 自動対戦
//
//   node scripts/research/selfplay.mjs --a mind --b hard-old --games 200 --jobs 8
//
// エージェント:
//   easy / normal     … 既存 Bot（bot.ts の 1 手評価）
//   hard              … 新 Hard（simpleBot 経由。アプリと同じ呼び方で読み合いエンジンを使う）
//   hard-old          … 旧 Hard（変更前の bot.ts を git から読み込み、浅い探索エンジン経由で指す）
//   mind              … 読み合いエンジン（均衡 + 相手の癖読み、深さ 2）
//   mind-eq           … 読み合いエンジン（均衡のみ。癖読みなし）
//   mind-d3           … 読み合いエンジン（深さ 3）
//
// どのエージェントも、相手の未公開罠は渡されない（GameView か、既存 Bot の公開情報ロジック経由）。

import { fork } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRandom, loadGameModule, loadGameModuleFromGit, root } from './load-game.mjs';

const MAX_TURNS = 300;
/** 比較基準にする「変更前」のリビジョン（Polish Steam-ready match UI） */
const BASELINE_REF = '9cee767';

function parseArgs(argv) {
  const args = { a: 'mind', b: 'hard-old', games: 100, jobs: 1, seed: 1, casual: true, out: null, samples: 0 };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    const value = argv[i + 1];
    if (key === 'a' || key === 'b' || key === 'out') args[key] = value;
    else if (key === 'casual') args.casual = value !== 'false';
    else args[key] = Number(value);
  }
  return args;
}

function createAgents() {
  const { simpleBot } = loadGameModule('src/game/bot.ts');
  const { createShallowSearchEngine } = loadGameModule('src/game/search-engine.ts');
  const { getPlayerView } = loadGameModule('src/game/view.ts');
  const mind = loadGameModule('src/game/mindgame.ts');
  // 変更前の Bot（Hard の罠は「相手の一番おいしい着地点」、手は浅い探索エンジン）
  const baselineBot = loadGameModuleFromGit(BASELINE_REF, 'src/game/bot.ts').simpleBot;

  const legacy = (level) => () => ({
    pitfall: (state, player) => simpleBot.decidePitfall(state, player, level),
    move: (state, player) => ({ action: simpleBot.decideMove(state, player, level) }),
  });

  const mindAgent = (options) => (random) => {
    let plan = null;
    return {
      pitfall: (state, player) => {
        plan = mind.planMindGameTurn(getPlayerView(state, player), {
          ...options,
          random,
          ownLastTrap: state.lastPitfallPositionByPlayer[player],
        });
        return plan.pitfall;
      },
      move: () => ({ action: plan.move.action, decision: plan.move }),
    };
  };

  return {
    easy: legacy('easy'),
    normal: legacy('normal'),
    // 出荷される Hard（simpleBot 経由で読み合いエンジンを使う。useGame と同じ呼び方）
    hard: legacy('hard'),
    'hard-old': () => ({
      pitfall: (state, player) => baselineBot.decidePitfall(state, player, 'hard'),
      move: (state, player) => ({
        action: baselineBot.decideMoveWithSearchEngine(
          getPlayerView(state, player),
          createShallowSearchEngine(),
          { depth: 2, maxCandidates: 1 }
        ),
      }),
    }),
    mind: mindAgent({}),
    'mind-eq': mindAgent({ adaptive: false }),
    'mind-d3': mindAgent({ depth: 3 }),
  };
}

function snapshot(state) {
  return {
    board: state.board.map(row => row.map(cell => (cell ? `${cell.owner === 'sente' ? '+' : '-'}${cell.kind}` : null))),
    hands: state.hands,
  };
}

function playGame({ agents, names, seed, casual, collectSamples }) {
  const { createInitialGameState } = loadGameModule('src/game/constants.ts');
  const { gameReducer } = loadGameModule('src/game/reducer.ts');

  const random = createRandom(seed);
  const originalRandom = Math.random;
  Math.random = random; // 既存 Bot は Math.random を直接使う
  try {
    const players = {
      sente: agents[names.sente](random),
      gote: agents[names.gote](random),
    };
    let state = createInitialGameState('pvbot', casual, 'gote', 'hard');
    const perSide = {
      sente: { trapped: 0, moves: 0, dilemmas: 0, trapRiskSum: 0, decisions: 0 },
      gote: { trapped: 0, moves: 0, dilemmas: 0, trapRiskSum: 0, decisions: 0 },
    };
    const samples = [];
    let leadChanges = 0;
    let lastLead = 0;

    while (state.phase.type !== 'GAME_OVER' && state.turn <= MAX_TURNS) {
      const player = state.currentPlayer;
      const agent = players[player];
      const before = state;

      const pitfall = agent.pitfall(state, player);
      state = gameReducer(state, { type: 'PLACE_PITFALL', position: pitfall });
      if (state.phase.type !== 'MOVE_SELECTION') throw new Error(`${names[player]} placed an illegal pitfall`);

      const { action, decision } = agent.move(state, player);
      const placed = state;
      state = gameReducer(state, { type: 'EXECUTE_MOVE', action });
      if (state === placed) throw new Error(`${names[player]} chose an illegal move`);
      if (state.phase.type === 'PROMOTION_DECISION') {
        state = gameReducer(state, { type: 'DECIDE_PROMOTION', promote: true });
      }

      const entry = state.log[state.log.length - 1];
      const stats = perSide[player];
      stats.moves += 1;
      if (entry.pitfallTriggered) stats.trapped += 1;

      if (decision) {
        stats.decisions += 1;
        stats.trapRiskSum += decision.chosenTrapProbability;
        const contested = decision.candidates.filter(c => c.playProbability >= 0.1);
        const stake = decision.candidates[0].value - decision.failValue;
        const isDilemma = contested.length >= 2 && stake >= 0.15;
        if (isDilemma) stats.dilemmas += 1;

        const lead = Math.sign(decision.gameValue) * (player === 'sente' ? 1 : -1);
        if (Math.abs(decision.gameValue) >= 0.15) {
          if (lastLead !== 0 && lead !== lastLead) leadChanges += 1;
          lastLead = lead;
        }

        if (collectSamples && isDilemma && Math.abs(decision.gameValue) < 0.6) {
          samples.push({
            seed,
            turn: before.turn,
            player,
            ...snapshot(before),
            gameValue: decision.gameValue,
            failValue: decision.failValue,
            trappedInGame: entry.pitfallTriggered,
            candidates: decision.candidates
              .filter(c => c.playProbability > 0.01 || c.trapProbability > 0.01)
              .slice(0, 6)
              .map(c => ({
                type: c.action.type,
                piece: c.action.piece.kind,
                from: c.action.type === 'move' ? c.action.from : null,
                to: c.to,
                value: Number(c.value.toFixed(3)),
                play: Number(c.playProbability.toFixed(3)),
                trap: Number(c.trapProbability.toFixed(3)),
              })),
          });
        }
      }
    }

    // 決着の形: 負けた側の最後の手が罠で失敗したか（＝王手の受けを罠で潰された）
    let ending = 'draw';
    if (state.winner) {
      const loser = state.winner === 'sente' ? 'gote' : 'sente';
      const lastLoserEntry = [...state.log].reverse().find(entry => entry.player === loser);
      ending = lastLoserEntry?.pitfallTriggered ? 'defense-trapped' : 'king-left-hanging';
    }

    return {
      seed,
      names,
      winner: state.winner,
      ending,
      turns: state.log.length,
      perSide,
      leadChanges,
      samples,
    };
  } finally {
    Math.random = originalRandom;
  }
}

function runBatch({ a, b, games, seed, casual, samples }) {
  const agents = createAgents();
  if (!agents[a] || !agents[b]) throw new Error(`Unknown agent: ${a} / ${b}`);
  const results = [];
  for (let i = 0; i < games; i++) {
    // 先後を 1 局ごとに入れ替える
    const names = i % 2 === 0 ? { sente: a, gote: b } : { sente: b, gote: a };
    results.push(playGame({ agents, names, seed: seed + i, casual, collectSamples: samples > 0 }));
  }
  return results;
}

function summarize(results, a, b) {
  const total = results.length;
  const side = (name) => {
    let wins = 0;
    let winsAsSente = 0;
    let gamesAsSente = 0;
    let trapped = 0;
    let moves = 0;
    let dilemmas = 0;
    let decisions = 0;
    let trapRiskSum = 0;
    for (const game of results) {
      for (const player of ['sente', 'gote']) {
        if (game.names[player] !== name) continue;
        // 同名対戦では両側を合算する
        if (player === 'sente') gamesAsSente += 1;
        if (game.winner === player) {
          wins += 1;
          if (player === 'sente') winsAsSente += 1;
        }
        const stats = game.perSide[player];
        trapped += stats.trapped;
        moves += stats.moves;
        dilemmas += stats.dilemmas;
        decisions += stats.decisions;
        trapRiskSum += stats.trapRiskSum;
      }
    }
    return {
      wins,
      winsAsSente,
      gamesAsSente,
      trappedRate: moves > 0 ? trapped / moves : 0,
      dilemmaRate: decisions > 0 ? dilemmas / decisions : null,
      expectedTrapRisk: decisions > 0 ? trapRiskSum / decisions : null,
    };
  };

  const turns = results.map(game => game.turns).sort((x, y) => x - y);
  const decided = results.filter(game => game.winner).length;
  const winsA = side(a);
  const winsB = side(b);
  const rate = a === b ? 0.5 : winsA.wins / Math.max(1, decided);
  // 勝率の 95% 信頼区間（正規近似）
  const margin = 1.96 * Math.sqrt((rate * (1 - rate)) / Math.max(1, decided));

  return {
    a,
    b,
    games: total,
    draws: total - decided,
    winRateA: Number(rate.toFixed(3)),
    winRateA95: [Number((rate - margin).toFixed(3)), Number((rate + margin).toFixed(3))],
    senteWinRate: Number((results.filter(game => game.winner === 'sente').length / Math.max(1, decided)).toFixed(3)),
    turns: {
      median: turns[Math.floor(total / 2)],
      p10: turns[Math.floor(total * 0.1)],
      p90: turns[Math.floor(total * 0.9)],
    },
    endings: results.reduce((counts, game) => {
      const loserName = game.winner ? game.names[game.winner === 'sente' ? 'gote' : 'sente'] : 'none';
      const key = `${game.ending} (loser: ${loserName})`;
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {}),
    leadChangesPerGame: Number((results.reduce((sum, game) => sum + game.leadChanges, 0) / total).toFixed(2)),
    [a]: winsA,
    ...(a === b ? {} : { [b]: winsB }),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (process.send) {
    process.send(runBatch(args));
    return;
  }

  const started = Date.now();
  let results;
  if (args.jobs <= 1) {
    results = runBatch(args);
  } else {
    const perJob = Math.ceil(args.games / args.jobs);
    // 偶数にして先後の入れ替えを各ジョブ内で揃える
    const chunk = perJob + (perJob % 2);
    const jobs = [];
    for (let done = 0; done < args.games; done += chunk) {
      const games = Math.min(chunk, args.games - done);
      jobs.push(new Promise((resolveJob, rejectJob) => {
        const child = fork(fileURLToPath(import.meta.url), [
          '--a', args.a, '--b', args.b, '--games', String(games),
          '--seed', String(args.seed + done), '--casual', String(args.casual),
          '--samples', String(args.samples),
        ]);
        child.once('message', resolveJob);
        child.once('error', rejectJob);
        child.once('exit', code => { if (code !== 0) rejectJob(new Error(`worker exited with ${code}`)); });
      }));
    }
    results = (await Promise.all(jobs)).flat();
  }

  const summary = summarize(results, args.a, args.b);
  summary.casual = args.casual;
  summary.seconds = Number(((Date.now() - started) / 1000).toFixed(1));
  console.log(JSON.stringify(summary, null, 2));

  if (args.out) {
    const outPath = resolve(root, args.out);
    mkdirSync(dirname(outPath), { recursive: true });
    const samples = results.flatMap(game => game.samples).slice(0, args.samples);
    writeFileSync(outPath, `${JSON.stringify({ summary, samples }, null, 2)}\n`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
