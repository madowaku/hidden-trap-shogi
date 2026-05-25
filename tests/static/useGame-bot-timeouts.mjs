import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../../src/hooks/useGame.ts', import.meta.url), 'utf8');

test('bot timeout branches return cleanup handlers', () => {
  const timeoutAssignments = [...source.matchAll(/botTimeoutRef\.current = setTimeout/g)];

  assert.equal(timeoutAssignments.length, 2);
  assert.match(
    source,
    /const clearBotTimeout = useCallback\(\(\) => \{[\s\S]*clearTimeout\(botTimeoutRef\.current\)/
  );

  for (const assignment of timeoutAssignments) {
    const branch = source.slice(assignment.index, assignment.index + 720);
    assert.match(branch, /return\s*\(\)\s*=>\s*\{/);
    assert.match(branch, /clearBotTimeout\(\)/);
  }
});

test('pitfall placement uses a confirmable draft before moves', () => {
  const page = readFileSync(new URL('../../src/app/page.tsx', import.meta.url), 'utf8');

  assert.match(page, /pitfallDraft/);
  assert.match(page, /罠を確定して駒を動かす/);
  assert.match(page, /setPitfallDraft\(position\)/);
});

test('pitfall trigger records impact position for effects', () => {
  const types = readFileSync(new URL('../../src/game/types.ts', import.meta.url), 'utf8');
  const reducer = readFileSync(new URL('../../src/game/reducer.ts', import.meta.url), 'utf8');
  const log = readFileSync(new URL('../../src/components/GameLog.tsx', import.meta.url), 'utf8');

  assert.match(types, /triggeredPitfall\?: Position/);
  assert.match(reducer, /triggeredPitfall:/);
  assert.match(log, /formatPos\(entry\.triggeredPitfall\)/);
});

test('bot levels are typed and wired from page to bot decisions', () => {
  const types = readFileSync(new URL('../../src/game/types.ts', import.meta.url), 'utf8');
  const hook = readFileSync(new URL('../../src/hooks/useGame.ts', import.meta.url), 'utf8');
  const bot = readFileSync(new URL('../../src/game/bot.ts', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../../src/app/page.tsx', import.meta.url), 'utf8');

  assert.match(types, /export type BotLevel = 'easy' \| 'normal' \| 'hard'/);
  assert.match(hook, /botLevel: BotLevel/);
  assert.match(bot, /decideMove\(state: GameState, player: Player, level: BotLevel/);
  assert.match(page, /Easy/);
  assert.match(page, /Normal/);
  assert.match(page, /Hard/);
});

test('Hard bot move selection is wired through shallow SearchEngine GameView boundary', () => {
  const hook = readFileSync(new URL('../../src/hooks/useGame.ts', import.meta.url), 'utf8');

  assert.match(hook, /createShallowSearchEngine/);
  assert.match(hook, /getPlayerView\(state,\s*botPlayer\)/);
  assert.match(hook, /decideMoveWithSearchEngine/);
  assert.match(hook, /state\.config\.botLevel === 'hard'/);
});

test('bot difficulty copy frames suspicion and greed instead of deep search', () => {
  const page = readFileSync(new URL('../../src/app/page.tsx', import.meta.url), 'utf8');
  const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');

  assert.match(page, /欲張りでミス多め/);
  assert.match(page, /Greedy and mistake-prone/);
  assert.match(page, /標準的な罠読み/);
  assert.match(page, /Standard trap reading/);
  assert.match(page, /おいしい手を強く疑う/);
  assert.match(page, /More trap-aware/);
  assert.match(readme, /Bot difficulty affects trap suspicion and tactical greed, not deep shogi search\./);
  assert.match(readme, /Bot難易度は主に罠警戒・欲張り・過去罠学習を変えるもので、深い将棋探索ではありません。/);
});

test('bot debug candidate panel is gated behind debugBot query param', () => {
  const page = readFileSync(new URL('../../src/app/page.tsx', import.meta.url), 'utf8');

  assert.match(page, /debugBot=1/);
  assert.match(page, /debugBotEnabled/);
  assert.match(page, /simpleBot\.debugMoveCandidates/);
  assert.match(page, /Bot Debug/);
  assert.match(page, /trapPenalty/);
  assert.match(page, /trapRisk/);
  assert.doesNotMatch(page, /state\.pitfalls\.sente/);
  assert.doesNotMatch(page, /state\.pitfalls\.gote/);
});

test('post-game trap review and pass-device privacy surfaces are present', () => {
  const page = readFileSync(new URL('../../src/app/page.tsx', import.meta.url), 'utf8');

  assert.match(page, /罠履歴レビュー/);
  assert.match(page, /trapHistory/);
  assert.match(page, /Private handoff/);
  assert.match(page, /ログと罠の情報を隠しています/);
});

test('reducer guards stale move and drop actions before mutating state', () => {
  const reducer = readFileSync(new URL('../../src/game/reducer.ts', import.meta.url), 'utf8');

  assert.match(reducer, /isValidMoveAction/);
  assert.match(reducer, /isValidDropAction/);
  assert.match(reducer, /playerHand\[dropKind\] <= 0/);
});

test('mini tutorial explains the three core trap rules', () => {
  const page = readFileSync(new URL('../../src/app/page.tsx', import.meta.url), 'utf8');

  assert.match(page, /Mini tutorial/);
  assert.match(page, /Step 1: 罠を仕掛けよう/);
  assert.match(page, /Step 2: 駒を動かそう/);
  assert.match(page, /Step 3: 相手の欲しい手を読もう/);
  assert.match(page, /Step 1: Place a trap/);
  assert.match(page, /Step 2: Move a piece/);
  assert.match(page, /Step 3: Read what your opponent wants/);
  assert.match(page, /Help/);
});

test('first match tutorial is skippable, persisted, and can be reopened from Help', () => {
  const page = readFileSync(new URL('../../src/app/page.tsx', import.meta.url), 'utf8');

  assert.match(page, /FIRST_TURN_TUTORIAL_STORAGE_KEY/);
  assert.match(page, /localStorage\.getItem\(FIRST_TURN_TUTORIAL_STORAGE_KEY\)/);
  assert.match(page, /localStorage\.setItem\(FIRST_TURN_TUTORIAL_STORAGE_KEY,\s*'seen'\)/);
  assert.match(page, /setShowTutorial\(true\)/);
  assert.match(page, /setShowTutorial\(false\)/);
  assert.match(page, /Skip/);
  assert.match(page, /スキップ/);
});

test('trap review exposes hit rate and hit/miss counts', () => {
  const page = readFileSync(new URL('../../src/app/page.tsx', import.meta.url), 'utf8');

  assert.match(page, /buildTrapStats/);
  assert.match(page, /罠命中率/);
  assert.match(page, /踏んだ回数/);
  assert.match(page, /不発回数/);
});

test('bot hard copy and selected level are clear', () => {
  const page = readFileSync(new URL('../../src/app/page.tsx', import.meta.url), 'utf8');

  assert.match(page, /おいしい手を強く疑う/);
  assert.match(page, /More trap-aware/);
  assert.doesNotMatch(page, /罠と反撃を読む/);
  assert.doesNotMatch(page, /Reads traps and counters/);
  assert.match(page, /選択中/);
  assert.match(page, /aria-pressed/);
});

test('trap failures preserve the invalidated action for readable feedback', () => {
  const types = readFileSync(new URL('../../src/game/types.ts', import.meta.url), 'utf8');
  const reducer = readFileSync(new URL('../../src/game/reducer.ts', import.meta.url), 'utf8');
  const log = readFileSync(new URL('../../src/components/GameLog.tsx', import.meta.url), 'utf8');

  assert.match(types, /failedAction\?: GameAction/);
  assert.match(reducer, /failedAction/);
  assert.match(log, /への移動は罠で失敗/);
});

test('manual test checklist is documented', () => {
  const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');

  assert.match(readme, /Manual Test Checklist/);
  assert.match(readme, /PvBot Easy\/Normal\/Hardが起動する/);
  assert.match(readme, /罠を踏むと手が失敗する/);
  assert.match(readme, /不発罠が公開される/);
  assert.match(readme, /Game Over後に罠履歴が出る/);
  assert.match(readme, /PvP Pass Deviceでログ\/罠情報が隠れる/);
  assert.match(readme, /不正な打ち込みがreducerで拒否される/);
});

test('itch prep exposes bilingual title screen, rules, tester links, and version copy', () => {
  const page = readFileSync(new URL('../../src/app/page.tsx', import.meta.url), 'utf8');

  assert.match(page, /APP_VERSION = 'v0\.1\.0'/);
  assert.match(page, /Language/);
  assert.match(page, /日本語/);
  assert.match(page, /English/);
  assert.match(page, /Start Match/);
  assert.match(page, /対局開始/);
  assert.match(page, /Rules/);
  assert.match(page, /Every turn, place one trap/);
  assert.match(page, /A move to that square fails/);
  assert.match(page, /Tempting captures may be traps/);
  assert.match(page, /Best played on desktop/);
  assert.match(page, /Known Issues/);
  assert.match(page, /Feedback/);
});

test('Casual mode copy explains missed-trap reveal behavior', () => {
  const page = readFileSync(new URL('../../src/app/page.tsx', import.meta.url), 'utf8');

  assert.match(page, /不発罠を公開/);
  assert.match(page, /不発罠は隠す/);
  assert.match(page, /Missed traps revealed/);
  assert.match(page, /Missed traps stay hidden/);
});

test('itch embed dimensions and static export scripts are configured', () => {
  const nextConfig = readFileSync(new URL('../../next.config.ts', import.meta.url), 'utf8');
  const packageJson = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');

  assert.match(nextConfig, /output:\s*["']export["']/);
  assert.match(packageJson, /"export":\s*"next build"/);
});

test('README includes itch.io build steps and publish page materials', () => {
  const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');

  assert.match(readme, /itch\.io Build/);
  assert.match(readme, /npm run export/);
  assert.match(readme, /960 x 900/);
  assert.match(readme, /Short Description/);
  assert.match(readme, /Controls/);
  assert.match(readme, /Screenshots/);
  assert.match(readme, /Known Limitations/);
  assert.match(readme, /Feedback Request/);
});

test('expectation copy clarifies this is a casual shogi variant', () => {
  const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');

  assert.match(readme, /本作は公式将棋ルールの厳密実装ではなく、落とし穴ルールを中心にしたカジュアルな変則将棋です。/);
  assert.match(readme, /This is a casual shogi variant, not a strict implementation of official shogi rules\./);
});

test('UI excludes king squares from pitfall candidates', () => {
  const page = readFileSync(new URL('../../src/app/page.tsx', import.meta.url), 'utf8');
  const board = readFileSync(new URL('../../src/components/Board.tsx', import.meta.url), 'utf8');
  const cell = readFileSync(new URL('../../src/components/Cell.tsx', import.meta.url), 'utf8');

  assert.match(page, /isKingSquare/);
  assert.match(page, /王のいるマスには罠を仕掛けられません/);
  assert.match(board, /blockedPitfallSquares/);
  assert.match(cell, /isPitfallBlocked/);
});
