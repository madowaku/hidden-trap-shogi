// 王手の「生存率」の内訳（優先度 3: ルールの性質か、Bot の偏りか）
//
//   node scripts/research/check-hazard.mjs --variant standard --games 200
//
// 王手された手番ごとに、次の 3 つを比べる:
//   - predicted: 指す側（受ける側）が「この受けが罠にかかる」と見積もった確率
//   - placed   : 罠側が実際にそのマスへ罠を置いた確率（罠側の計画の分布から）
//   - observed : 実際に罠にかかった割合
// predicted ≒ placed なら、受ける側は相手の罠の置き方を正しく読めている（読み違いによる偏りはない）。
// その上で observed が高いなら、王手 1 回あたりの死亡率はルールと均衡から来ている。

import { createRandom, loadGameModule } from './load-game.mjs';
import { createMindAgent, playTurn } from './variant-rules.mjs';

const { createInitialGameState } = loadGameModule('src/game/constants.ts');

function parseArgs(argv) {
  const args = { variant: 'standard', games: 100, seed: 60000 };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    args[key] = key === 'variant' ? argv[i + 1] : Number(argv[i + 1]);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mind = loadGameModule('src/game/mindgame.ts');
  const { getPlayerView } = loadGameModule('src/game/view.ts');
  const buckets = {};
  let all = { n: 0, predicted: 0, placed: 0, observed: 0 };

  for (let g = 0; g < args.games; g++) {
    const random = createRandom(args.seed + g);
    Math.random = random;
    const plans = { sente: null, gote: null };
    const makeAgent = () => {
      const base = createMindAgent(args.variant, random);
      return {
        ...base,
        pitfall(state, player) {
          const plan = mind.planMindGameTurn(getPlayerView(state, player), {
            rules: args.variant, random, ownLastTrap: state.lastPitfallPositionByPlayer[player],
          });
          plans[player] = plan;
          this.current = plan;
          return plan.pitfall;
        },
        move() {
          return { action: this.current.move.action, decision: this.current.move };
        },
      };
    };
    const agents = { sente: makeAgent(), gote: makeAgent() };
    let state = createInitialGameState('pvbot', true, 'gote', 'hard');
    for (let ply = 0; ply < 300 && state.phase.type !== 'GAME_OVER'; ply++) {
      const player = state.currentPlayer;
      const opponent = player === 'sente' ? 'gote' : 'sente';
      const trapperPlan = plans[opponent];
      const result = playTurn(state, args.variant, agents[player]);
      const record = result.record;
      if (record.inCheck && record.decision && trapperPlan) {
        const to = record.action.to;
        const placed = trapperPlan.trapTargets.find(t => t.position.row === to.row && t.position.col === to.col)?.probability ?? 0;
        const k = record.check.destinations >= 5 ? '5+' : String(record.check.destinations);
        buckets[k] ??= { n: 0, predicted: 0, placed: 0, observed: 0 };
        for (const bucket of [buckets[k], all]) {
          bucket.n += 1;
          bucket.predicted += record.decision.chosenTrapProbability;
          bucket.placed += placed;
          bucket.observed += record.trapped ? 1 : 0;
        }
      }
      state = result.state;
    }
  }

  const format = (b) => ({
    checks: b.n,
    predicted: Number((b.predicted / b.n).toFixed(3)),
    placed: Number((b.placed / b.n).toFixed(3)),
    observed: Number((b.observed / b.n).toFixed(3)),
  });
  console.log(JSON.stringify({
    variant: args.variant,
    games: args.games,
    all: format(all),
    byDestinations: Object.fromEntries(Object.entries(buckets).sort().map(([k, b]) => [k, format(b)])),
  }, null, 2));
}

main();
