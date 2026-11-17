// 罠ルールの変種比較（面白さの研究）
//
//   node scripts/research/rule-study.mjs --variant standard --games 400 --jobs 8
//   node scripts/research/rule-study.mjs --variant all --games 400 --jobs 8 --out docs/research/rule-variants/data
//   node scripts/research/rule-study.mjs --variant standard --agents normal,normal --games 400
//
// 勝率ではなく、ゲームの「形」を測る:
//   決着理由 / 手数 / 逆転 / 決着の遅さ / 読み合いの発生率 / 罠の圧力 / 戦略の多様性 / 王手の生存率

import { fork } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRandom, loadGameModule, loadGameModuleFromGit, root } from './load-game.mjs';
import {
  VARIANTS,
  actionKey,
  classifyEnding,
  createLegacyAgent,
  createMindAgent,
  playTurn,
} from './variant-rules.mjs';
import { encodeBoard, renderKifu } from './kifu.mjs';

const MAX_PLIES = 300;
const LEAD_THRESHOLD = 0.15;
const COMEBACK_THRESHOLD = -0.3;
const DECIDED_THRESHOLD = 0.6;
const OPENING_PLIES = 8;

function parseArgs(argv) {
  const args = {
    variant: 'standard', agents: 'mind,mind', games: 100, jobs: 1, seed: 1,
    casual: true, out: null, kifu: 0, replay: null,
  };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    const value = argv[i + 1];
    if (['variant', 'agents', 'out', 'replay'].includes(key)) args[key] = value;
    else if (key === 'casual') args.casual = value !== 'false';
    else args[key] = Number(value);
  }
  return args;
}

function makeAgent(name, variant, random) {
  if (name === 'mind') return createMindAgent(variant, random);
  if (name === 'mind-eq') return createMindAgent(variant, random, { adaptive: false, name });
  if (name === 'mind-d1') return createMindAgent(variant, random, { depth: 1, name });
  if (name === 'mind-d3') return createMindAgent(variant, random, { depth: 3, name });
  if (variant !== 'standard') throw new Error(`${name} only understands the standard rules`);
  if (name === 'hard-old') return createLegacyHardOld();
  return createLegacyAgent(name);
}

/** 変更前（9cee767）の Hard: 罠は相手の一番おいしい着地点、手は浅い探索エンジン */
function createLegacyHardOld() {
  const baseline = loadGameModuleFromGit('9cee767', 'src/game/bot.ts').simpleBot;
  const { createShallowSearchEngine } = loadGameModule('src/game/search-engine.ts');
  const { getPlayerView } = loadGameModule('src/game/view.ts');
  return {
    name: 'hard-old',
    pitfall: (state, player) => baseline.decidePitfall(state, player, 'hard'),
    move: (state, player) => ({
      action: baseline.decideMoveWithSearchEngine(
        getPlayerView(state, player), createShallowSearchEngine(), { depth: 2, maxCandidates: 1 }
      ),
    }),
  };
}

function entropyBits(probabilities) {
  let total = 0;
  for (const p of probabilities) total += p;
  if (total <= 0) return 0;
  let bits = 0;
  for (const p of probabilities) {
    if (p <= 0) continue;
    const q = p / total;
    bits -= q * Math.log2(q);
  }
  return bits;
}

function playGame({ variant, agentNames, seed, casual }) {
  const { createInitialGameState } = loadGameModule('src/game/constants.ts');
  const random = createRandom(seed);
  const originalRandom = Math.random;
  Math.random = random; // 既存 Bot は Math.random を直接使う
  try {
    const agents = {
      sente: makeAgent(agentNames[seed % 2 === 0 ? 0 : 1], variant, random),
      gote: makeAgent(agentNames[seed % 2 === 0 ? 1 : 0], variant, random),
    };
    let state = createInitialGameState('pvbot', casual, 'gote', 'hard');
    const records = [];
    while (state.phase.type !== 'GAME_OVER' && records.length < MAX_PLIES) {
      const result = playTurn(state, variant, agents[state.currentPlayer]);
      state = result.state;
      records.push(result.record);
    }
    return summarizeGame(records, state.winner, { sente: agents.sente.name, gote: agents.gote.name }, seed);
  } finally {
    Math.random = originalRandom;
  }
}

function summarizeGame(records, winner, names, seed) {
  // 先手から見た形勢（読み合いエンジンの評価）。Bot によっては無い
  const values = records.map(record => (
    record.decision ? record.decision.gameValue * (record.player === 'sente' ? 1 : -1) : null
  ));

  let leadChanges = 0;
  let lastLead = 0;
  let comeback = false;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null) continue;
    if (Math.abs(v) >= LEAD_THRESHOLD) {
      const lead = Math.sign(v);
      if (lastLead !== 0 && lead !== lastLead) leadChanges += 1;
      lastLead = lead;
    }
    if (winner && i >= 10) {
      const fromWinner = winner === 'sente' ? v : -v;
      if (fromWinner <= COMEBACK_THRESHOLD) comeback = true;
    }
  }

  // 決着がはっきりした手数: そこから最後まで勝者側の評価が DECIDED_THRESHOLD 以上だった最初の手
  let decidedAt = null;
  if (winner) {
    const sign = winner === 'sente' ? 1 : -1;
    for (let i = values.length - 1; i >= 0; i--) {
      const v = values[i];
      if (v === null) continue;
      if (v * sign >= DECIDED_THRESHOLD) decidedAt = i;
      else break;
    }
  }

  const checks = [];
  records.forEach((record, index) => {
    if (!record.inCheck) return;
    const nextOwn = records.slice(index + 1).find(next => next.player === record.player);
    const died = !nextOwn && winner && winner !== record.player;
    checks.push({
      destinations: record.check.destinations,
      kingEscapes: record.check.kingEscapes,
      trapped: record.trapped,
      event: record.event,
      died: Boolean(died),
      valueBefore: record.decision ? record.decision.gameValue : null,
    });
  });

  const decisions = records.filter(record => record.decision);
  let dilemmas = 0;
  let pressure = 0;
  let moveEntropy = 0;
  let trapEntropy = 0;
  for (const record of decisions) {
    const d = record.decision;
    const contested = d.candidates.filter(c => c.playProbability >= 0.1);
    const stake = d.candidates[0].value - d.failValue;
    if (contested.length >= 2 && stake >= 0.15) dilemmas += 1;
    pressure += Math.max(0, d.candidates[0].value - d.gameValue);
    moveEntropy += entropyBits(d.candidates.map(c => c.playProbability));
    trapEntropy += entropyBits(d.candidates.map(c => c.trapProbability));
  }

  const ending = classifyEnding(records, winner);
  const loser = winner ? (winner === 'sente' ? 'gote' : 'sente') : null;
  const loserLast = loser ? [...records].reverse().find(record => record.player === loser) : null;
  const finalMove = winner ? records[records.length - 1] : null;

  return {
    seed,
    names,
    winner,
    winnerName: winner ? names[winner] : null,
    plies: records.length,
    ending,
    leadChanges,
    comeback,
    decidedAt,
    checks,
    trapHits: records.filter(record => record.trapped).length,
    events: {
      kingImmune: records.filter(record => record.event === 'kingImmune').length,
      retry: records.filter(record => record.event === 'retry').length,
      voided: records.filter(record => record.event === 'voided').length,
    },
    decisionCount: decisions.length,
    dilemmas,
    pressure,
    moveEntropy,
    trapEntropy,
    opening: records.slice(0, OPENING_PLIES).map(record => actionKey(record.action)).join(' '),
    finisher: finalMove?.action.piece.kind ?? null,
    loserValueAtEnd: loserLast?.decision?.gameValue ?? null,
    records: records.map(record => ({
      board: encodeBoard(record.board),
      hands: record.hands,
      turn: record.turn,
      player: record.player,
      inCheck: record.inCheck,
      check: record.check,
      action: record.action,
      trap: record.trap,
      trapped: record.trapped,
      event: record.event,
      retryAction: record.retryAction,
      value: record.decision ? record.decision.gameValue : null,
      trapProbability: record.decision ? record.decision.chosenTrapProbability : null,
    })),
  };
}

function quantile(sorted, q) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

function ratio(numerator, denominator, digits = 3) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(digits)) : null;
}

export function summarize(games, variant) {
  const total = games.length;
  const decided = games.filter(game => game.winner);
  const endings = {};
  for (const game of games) endings[game.ending] = (endings[game.ending] ?? 0) + 1;

  const plies = games.map(game => game.plies).sort((a, b) => a - b);
  const decisionGames = games.filter(game => game.decisionCount > 0);
  const decisions = decisionGames.reduce((sum, game) => sum + game.decisionCount, 0);

  // 王手の生存率（受けの数ごと）
  const allChecks = games.flatMap(game => game.checks);
  const byDestinations = {};
  for (const check of allChecks) {
    const bucket = check.destinations >= 5 ? '5+' : String(check.destinations);
    byDestinations[bucket] ??= { checks: 0, died: 0 };
    byDestinations[bucket].checks += 1;
    if (check.died) byDestinations[bucket].died += 1;
  }
  for (const bucket of Object.values(byDestinations)) bucket.deathRate = ratio(bucket.died, bucket.checks);

  // 決着の形の多様性
  const openings = new Set(games.map(game => game.opening));
  const finishers = {};
  for (const game of decided) finishers[game.finisher] = (finishers[game.finisher] ?? 0) + 1;
  const decidedAtShare = decided
    .filter(game => game.decidedAt !== null)
    .map(game => game.decidedAt / game.plies)
    .sort((a, b) => a - b);

  // 決着直前の負け側の形勢（ルーレットは「勝負のついた局面の止め」か「互角からのくじ引き」か）
  const roulette = decided.filter(game => (
    (game.ending === 'roulette' || game.ending === 'trap-mate') && game.loserValueAtEnd !== null
  ));
  const balancedRoulette = roulette.filter(game => Math.abs(game.loserValueAtEnd) < 0.3).length;

  const senteWins = decided.filter(game => game.winner === 'sente').length;
  const names = [...new Set(games.flatMap(game => [game.names.sente, game.names.gote]))];
  const winsByName = Object.fromEntries(names.map(name => [name, decided.filter(game => game.winnerName === name).length]));

  return {
    variant,
    label: VARIANTS[variant].label,
    games: total,
    draws: total - decided.length,
    winsByName,
    senteWinRate: ratio(senteWins, decided.length),
    endings,
    endingShare: Object.fromEntries(Object.entries(endings).map(([key, count]) => [key, ratio(count, total)])),
    plies: { p10: quantile(plies, 0.1), median: quantile(plies, 0.5), p90: quantile(plies, 0.9), mean: ratio(plies.reduce((a, b) => a + b, 0), total, 1) },
    checksPerGame: ratio(allChecks.length, total, 2),
    checkDeathRate: ratio(allChecks.filter(check => check.died).length, allChecks.length),
    checkDeathByDestinations: byDestinations,
    trapHitsPerPly: ratio(games.reduce((sum, game) => sum + game.trapHits, 0), plies.reduce((a, b) => a + b, 0)),
    events: {
      kingImmune: games.reduce((sum, game) => sum + game.events.kingImmune, 0),
      retry: games.reduce((sum, game) => sum + game.events.retry, 0),
      voided: games.reduce((sum, game) => sum + game.events.voided, 0),
    },
    leadChangesPerGame: ratio(decisionGames.reduce((sum, game) => sum + game.leadChanges, 0), decisionGames.length, 2),
    comebackRate: ratio(decided.filter(game => game.comeback).length, decided.length),
    decidedAtShare: { median: quantile(decidedAtShare, 0.5), p25: quantile(decidedAtShare, 0.25) },
    dilemmaRate: ratio(decisionGames.reduce((sum, game) => sum + game.dilemmas, 0), decisions),
    trapPressure: ratio(decisionGames.reduce((sum, game) => sum + game.pressure, 0), decisions),
    moveEntropyBits: ratio(decisionGames.reduce((sum, game) => sum + game.moveEntropy, 0), decisions, 2),
    trapEntropyBits: ratio(decisionGames.reduce((sum, game) => sum + game.trapEntropy, 0), decisions, 2),
    openingUniqueness: ratio(openings.size, total),
    finishers,
    finisherEntropyBits: Number(entropyBits(Object.values(finishers)).toFixed(2)),
    roulette: {
      games: roulette.length,
      balancedShare: ratio(balancedRoulette, roulette.length),
      meanLoserValue: ratio(roulette.reduce((sum, game) => sum + game.loserValueAtEnd, 0), roulette.length),
    },
  };
}

/** 代表的な棋譜を選ぶ: 一番多い決着の形で、手数が中央値に近い対局 + 逆転局 */
function pickRepresentatives(games, count) {
  const endings = {};
  for (const game of games) endings[game.ending] = (endings[game.ending] ?? 0) + 1;
  const typical = Object.entries(endings).sort((a, b) => b[1] - a[1])[0][0];
  const pool = games.filter(game => game.ending === typical).sort((a, b) => a.plies - b.plies);
  const picks = [{ reason: `いちばん多い決着（${typical}）で手数が中央値`, game: pool[Math.floor(pool.length / 2)] }];
  const comeback = games.filter(game => game.comeback).sort((a, b) => a.plies - b.plies)[0];
  if (comeback && count > 1) picks.push({ reason: '逆転局（勝者が一度 -0.3 以下まで押された）', game: comeback });
  const other = games.filter(game => game.ending !== typical && game.winner).sort((a, b) => a.plies - b.plies)[0];
  if (other && count > 2) picks.push({ reason: `ほかの決着（${other.ending}）で一番短い局`, game: other });
  return picks.filter(pick => pick.game);
}

function replayReason(game, index) {
  if (index === 0) return `いちばん多い決着（${game.ending}）で手数が中央値の局`;
  if (game.comeback) return '逆転局（勝者が一度 -0.3 以下まで押された）';
  return `ほかの決着（${game.ending}）で一番短い局`;
}

function runBatch({ variant, agents, games, seed, casual }) {
  const agentNames = agents.split(',');
  const results = [];
  for (let i = 0; i < games; i++) {
    results.push(playGame({ variant, agentNames, seed: seed + i, casual }));
  }
  return results;
}

async function runParallel(args) {
  if (args.jobs <= 1) return runBatch(args);
  const perJob = Math.ceil(args.games / args.jobs);
  const chunk = perJob + (perJob % 2);
  const jobs = [];
  for (let done = 0; done < args.games; done += chunk) {
    const games = Math.min(chunk, args.games - done);
    jobs.push(new Promise((resolveJob, rejectJob) => {
      const child = fork(fileURLToPath(import.meta.url), [
        '--variant', args.variant, '--agents', args.agents, '--games', String(games),
        '--seed', String(args.seed + done), '--casual', String(args.casual), '--worker', '1',
      ], { serialization: 'advanced' });
      child.once('message', resolveJob);
      child.once('error', rejectJob);
      child.once('exit', code => { if (code !== 0) rejectJob(new Error(`worker exited with ${code}`)); });
    }));
  }
  return (await Promise.all(jobs)).flat();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.worker) {
    process.send(runBatch(args), () => process.exit(0));
    return;
  }

  if (args.replay) {
    // 同じ seed の対局を再現して棋譜だけ作り直す（対局は seed で決まる）
    const agentNames = args.agents.split(',');
    const games = args.replay.split(',').map(seed => playGame({
      variant: args.variant, agentNames, seed: Number(seed), casual: args.casual,
    }));
    const picks = games.map((game, index) => ({ reason: replayReason(game, index), game }));
    const outDir = resolve(root, args.out ?? 'docs/research/rule-variants/kifu');
    mkdirSync(outDir, { recursive: true });
    const file = resolve(outDir, `${VARIANTS[args.variant].code}-${args.variant}.md`);
    writeFileSync(file, renderKifu(args.variant, picks));
    console.log(file);
    return;
  }

  const variants = args.variant === 'all' ? Object.keys(VARIANTS) : [args.variant];
  const summaries = [];
  for (const variant of variants) {
    const started = Date.now();
    const games = await runParallel({ ...args, variant });
    const summary = summarize(games, variant);
    summary.agents = args.agents;
    summary.casual = args.casual;
    summary.seed = args.seed;
    summary.seconds = Number(((Date.now() - started) / 1000).toFixed(1));
    summaries.push(summary);
    console.log(JSON.stringify(summary));

    if (args.out) {
      const outDir = resolve(root, args.out);
      mkdirSync(outDir, { recursive: true });
      const tag = `${variant}_${args.agents.replace(',', '-vs-')}_${args.casual ? 'casual' : 'strict'}`;
      writeFileSync(resolve(outDir, `${tag}.json`), `${JSON.stringify(summary, null, 2)}\n`);
      if (args.kifu > 0) {
        const picks = pickRepresentatives(games, args.kifu);
        writeFileSync(resolve(outDir, `${tag}.kifu.md`), renderKifu(variant, picks));
      }
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
