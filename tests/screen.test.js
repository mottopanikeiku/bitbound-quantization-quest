import test from 'node:test';
import assert from 'node:assert/strict';
import { fitScreen, MIN_LANDSCAPE, MIN_PORTRAIT } from '../src/engine/screen.js';

// [CSS width, CSS height, devicePixelRatio]: desktop windows, full screens and phone stages.
const STAGES = [
  [1920, 1080, 1], [1920, 969, 1], [1280, 800, 1], [1366, 768, 1], [1366, 625, 1], [1440, 900, 1],
  [1536, 864, 1.25], [1512, 982, 2], [2560, 1440, 1], [3440, 1440, 1], [1000, 720, 1], [960, 1040, 1],
  [1000, 1000, 1], [960, 960, 1], [1000, 1010, 1],
  [390, 720, 3], [320, 444, 2], [588, 337, 3], [768, 900, 2],
];

test('the canvas covers the whole stage with less than one game pixel of overflow', () => {
  for (const [w, h, dpr] of STAGES) {
    const fit = fitScreen(w, h, dpr);
    const label = `${w}×${h}@${dpr}`;
    assert.ok(fit.cssW >= w - 1e-9 && fit.cssH >= h - 1e-9, `${label} leaves an uncovered edge`);
    assert.ok(fit.cssW < w + fit.scale && fit.cssH < h + fit.scale, `${label} crops a whole game pixel`);
  }
});

test('the logical canvas never shrinks below the layouts\' design minimum', () => {
  for (const [w, h, dpr] of STAGES) {
    const fit = fitScreen(w, h, dpr);
    const min = fit.portrait ? MIN_PORTRAIT : MIN_LANDSCAPE;
    assert.ok(fit.w >= min.w && fit.h >= min.h, `${w}×${h}@${dpr} → ${fit.w}×${fit.h}`);
  }
});

test('whole device pixels are kept unless they would shrink the art by more than a quarter', () => {
  assert.deepEqual(pick(fitScreen(1920, 1080, 1)), { w: 384, h: 216, crisp: true, scale: 5 });
  assert.deepEqual(pick(fitScreen(1280, 800, 1)), { w: 427, h: 267, crisp: true, scale: 3 });
  assert.deepEqual(pick(fitScreen(390, 720, 3)), { w: 234, h: 432, crisp: true, scale: 5 / 3 });
  // Two device pixels per game pixel would make the art 31% smaller here: fill fractionally.
  const laptop = fitScreen(1366, 625, 1);
  assert.equal(laptop.crisp, false);
  assert.equal(laptop.h, 216);
  assert.equal(laptop.cssW, 1366);
  assert.equal(laptop.cssH, 625);
});

test('extreme aspect ratios stop growing and letterbox instead of stretching layouts', () => {
  const superWide = fitScreen(5120, 1440, 1);
  assert.equal(superWide.w, 640);
  assert.ok(superWide.cssW < 5120 && superWide.cssH >= 1440);
});

function pick({ w, h, crisp, scale }) {
  return { w, h, crisp, scale };
}
