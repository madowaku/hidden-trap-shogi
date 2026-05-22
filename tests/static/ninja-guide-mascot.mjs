import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const pageSource = readFileSync(new URL('../../src/app/page.tsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../../src/app/globals.css', import.meta.url), 'utf8');
const guidePath = new URL('../../src/components/NinjaGuide.tsx', import.meta.url);
const sourceMascotPath = new URL('../../public/mascots/kuno-usa-dot.png', import.meta.url);
const uiMascotPath = new URL('../../public/mascots/kuno-usa-ui.png', import.meta.url);
const trapHitMascotPath = new URL('../../public/mascots/kuno-usa-wana-ui.png', import.meta.url);

test('NinjaGuide component exists with bilingual Kuno-Usa lines', () => {
  assert.equal(existsSync(guidePath), true);

  const guideSource = readFileSync(guidePath, 'utf8');
  assert.match(guideSource, /Kuno-Usa/);
  assert.match(guideSource, /くのうさ/);
  assert.match(guideSource, /その一手、ほんとに大丈夫？/);
  assert.match(guideSource, /取れる駒ほど、罠かもよ？/);
  assert.match(guideSource, /にひひ、読まれてたね！/);
  assert.match(guideSource, /不発でも、相手の癖は見えたよ。/);
  assert.match(guideSource, /Are you sure about that move\?/);
  assert.match(guideSource, /The tastier the capture, the trap-lier it gets\./);
  assert.match(guideSource, /Hehe, you were read\./);
  assert.match(guideSource, /Even a missed trap reveals a habit\./);
});

test('NinjaGuide uses the adjusted Kuno-Usa image asset', () => {
  assert.equal(existsSync(sourceMascotPath), true);
  assert.equal(existsSync(uiMascotPath), true);
  assert.equal(existsSync(trapHitMascotPath), true);

  const guideSource = readFileSync(guidePath, 'utf8');
  assert.match(guideSource, /\.\/mascots\/kuno-usa-ui\.png/);
  assert.match(guideSource, /\.\/mascots\/kuno-usa-wana-ui\.png/);
  assert.doesNotMatch(guideSource, /from 'next\/image'/);
  assert.match(guideSource, /kuno-usa-pixel-snap/);
  assert.match(guideSource, /alt=""/);
  assert.match(cssSource, /@keyframes kuno-usa-pixel-snap/);
  assert.match(cssSource, /steps\(1, end\)/);
});

test('Kuno-Usa appears only as guide/reaction UI in the requested surfaces', () => {
  assert.match(pageSource, /from '@\/components\/NinjaGuide'/);
  assert.match(pageSource, /variant="title"/);
  assert.match(pageSource, /variant="help"/);
  assert.match(pageSource, /variant="trapHit"/);
  assert.match(pageSource, /variant="review"/);
  assert.match(pageSource, /trapBurstPosition && latestLog/);
  assert.match(pageSource, /activePhase\.type === 'GAME_OVER'/);
});
