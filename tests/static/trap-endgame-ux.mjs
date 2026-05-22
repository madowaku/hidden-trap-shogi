import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('GameView source keeps last pitfall repeat state out of player payloads', () => {
  const viewSource = readFileSync(resolve(root, 'src/game/view.ts'), 'utf8');
  const typesSource = readFileSync(resolve(root, 'src/game/types.ts'), 'utf8');

  assert.match(typesSource, /lastPitfallPositionByPlayer/);
  assert.doesNotMatch(viewSource, /lastPitfallPositionByPlayer/);
});

test('UI exposes repeat-pitfall block, casual miss effect, resign confirmation, and check alert copy', () => {
  const pageSource = readFileSync(resolve(root, 'src/app/page.tsx'), 'utf8');
  const boardSource = readFileSync(resolve(root, 'src/components/Board.tsx'), 'utf8');
  const cellSource = readFileSync(resolve(root, 'src/components/Cell.tsx'), 'utf8');
  const cssSource = readFileSync(resolve(root, 'src/app/globals.css'), 'utf8');

  assert.match(pageSource, /repeatPitfallBlocked/);
  assert.match(pageSource, /confirmResign/);
  assert.match(pageSource, /checkAlert/);
  assert.match(pageSource, /王手！|Check!/);
  assert.match(pageSource, /詰み判定は未実装|Checkmate detection is not implemented/);
  assert.match(pageSource, /missedTrapPosition/);
  assert.match(pageSource, /不発！そこに罠があった|Missed trap!/);
  assert.match(boardSource, /missedTrapPosition/);
  assert.match(cellSource, /isMissedTrapReveal/);
  assert.match(cssSource, /trap-miss-smoke/);
});
