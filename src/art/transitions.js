// All transitions use COVER semantics: p=0 never touches the live frame; p=1 is solid ink.
// Quantized snapshots and nearest-colour LUTs are cached, not re-fitted each frame.
import { PAL } from './palette.js';
import { Pix, bayer, u32, buildPaletteLUT, posterize, shadeRamp } from './paint.js';
import { clamp, makeCanvas, hash2 } from '../engine/util.js';
import { drawText } from '../engine/font.js';

export const TRANSITION_KINDS = ['battle-in', 'battle-out', 'fade', 'restore', 'wipe'];
const INK = u32(PAL.ink);
const GOLD = u32(PAL.gold[6]);
const TEAL = u32(PAL.teal[6]);
const PALETTES = {
  4: [PAL.night[0], PAL.night[3], PAL.night[6], PAL.forest[2], PAL.grass[4], PAL.grass[6], PAL.water[2], PAL.water[5], PAL.water[8], PAL.wood[2], PAL.wood[5], PAL.gold[5], PAL.violet[3], PAL.rose[4], PAL.cream[1], PAL.cream[3]],
  2: [PAL.night[0], PAL.violet[3], PAL.teal[5], PAL.cream[2]],
  1: [PAL.night[0], PAL.cream[1]],
};
const luts = new Map();
const snapshots = new WeakMap();
const surfaces = new Map();
const examples = new Map();

function getLut(bits) {
  if (!luts.has(bits)) luts.set(bits, buildPaletteLUT(PALETTES[bits]));
  return luts.get(bits);
}

function surface(w, h) {
  const key = `${w}:${h}`;
  let result = surfaces.get(key);
  if (result) return result;
  const { canvas, ctx } = makeCanvas(w, h);
  const image = ctx.createImageData(w, h);
  const distance = new Float32Array(w * h);
  const thresholds = new Float32Array(w * h);
  const maxDistance = Math.hypot(w / 2, h / 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    distance[i] = Math.hypot(x - w / 2, y - h / 2);
    thresholds[i] = bayer(x, y);
  }
  result = { canvas, ctx, image, words: new Uint32Array(image.data.buffer), distance, thresholds, maxDistance };
  if (surfaces.size === 6) surfaces.delete(surfaces.keys().next().value);
  surfaces.set(key, result);
  return result;
}

function snapshot(from, w, h) {
  let saved = snapshots.get(from);
  if (saved && saved.w === w && saved.h === h) return saved;
  const { canvas, ctx } = makeCanvas(w, h);
  // Screen rotation mid-transition is handled without stretching the artwork.
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(from, Math.floor((w - from.width) / 2), Math.floor((h - from.height) / 2));
  const original = ctx.getImageData(0, 0, w, h);
  const quantized = { 8: canvas };
  const pixels = { 8: new Uint32Array(original.data.buffer) };
  for (const bits of [4, 2, 1]) {
    const image = new ImageData(new Uint8ClampedArray(original.data), w, h);
    posterize(image, getLut(bits), { dither: bits === 4 ? 15 : bits === 2 ? 31 : 52 });
    const target = makeCanvas(w, h);
    target.ctx.putImageData(image, 0, 0);
    quantized[bits] = target.canvas;
    pixels[bits] = new Uint32Array(image.data.buffer);
  }
  saved = { w, h, quantized, pixels };
  snapshots.set(from, saved);
  return saved;
}

function mask(ctx, w, h, p, kind) {
  const s = surface(w, h);
  const { words, thresholds, distance } = s;
  const radius = (1 - p) * (s.maxDistance + 10);
  const edge = p * (w + 24) - 12;
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
    const dither = thresholds[i];
    let value = 0;
    if (kind === 'restore') {
      const d = distance[i] - radius;
      if (d > dither * 7 - 3) value = INK;
      else if (d > -5 && dither < 0.75) value = d > -2 ? GOLD : TEAL;
    } else if (kind === 'wipe') {
      const step = ((y >> 3) & 3) * 3;
      const d = edge - x + step - 4;
      if (d > dither * 12 - 6) value = INK;
      else if (d > -7 && dither < 0.4) value = TEAL;
    } else if (kind === 'battle-out') {
      // The dark iris opens back into the world; its thin gold rim echoes a healed grid.
      const d = distance[i] - radius;
      if (d > dither * 5 - 2) value = INK;
      else if (d > -2 && dither < 0.55) value = GOLD;
    } else if (dither < p) value = INK;
    words[i] = value;
  }
  s.ctx.putImageData(s.image, 0, 0);
  ctx.drawImage(s.canvas, 0, 0);
}

function quantizeOut(ctx, screen, p, from, reduced) {
  const { w, h } = screen;
  if (!from) {
    mask(ctx, w, h, p, 'fade');
    return;
  }
  const bits = p < 0.16 ? 8 : p < 0.35 ? 4 : p < 0.56 ? 2 : 1;
  const saved = snapshot(from, w, h);
  const source = saved.quantized[bits];
  if (reduced || p < 0.48) {
    ctx.drawImage(source, 0, 0);
    // Colour depth changes are still visible in reduced motion; no zoom, swirl or shake.
    if (p > 0.64) mask(ctx, w, h, clamp((p - 0.64) / 0.36), 'fade');
    return;
  }
  const output = surface(w, h);
  const sourcePixels = saved.pixels[bits];
  output.words.fill(INK);
  const shatter = clamp((p - 0.48) / 0.52);
  const tile = p < 0.66 ? 8 : 16;
  const cx = w / 2;
  const cy = h / 2;
  // Whole integer tiles orbit inward. No canvas rotation or rescaling can blur their pixels.
  for (let y = 0; y < h; y += tile) for (let x = 0; x < w; x += tile) {
    const seed = hash2(x >> 3, y >> 3, 73);
    const delay = seed * 0.22;
    const local = clamp((shatter - delay) / (1 - delay));
    if (local > 0.84 + seed * 0.1) continue;
    const dx = x + tile / 2 - cx;
    const dy = y + tile / 2 - cy;
    const angle = local * local * (1.35 + seed * 0.7);
    const shrink = 1 - local * local;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const tx = Math.round(cx + (dx * cosine - dy * sine) * shrink - tile / 2);
    const ty = Math.round(cy + (dx * sine + dy * cosine) * shrink - tile / 2);
    const tw = Math.min(tile, w - x);
    const th = Math.min(tile, h - y);
    const x0 = Math.max(0, tx);
    const x1 = Math.min(w, tx + tw);
    const y0 = Math.max(0, ty);
    const y1 = Math.min(h, ty + th);
    if (x1 <= x0 || y1 <= y0) continue;
    const mosaic = p > 0.7 && seed < shatter;
    // Copy in the CPU buffer rather than issuing hundreds of tiny canvas blits.
    for (let yy = y0; yy < y1; yy++) {
      const targetRow = yy * w;
      if (mosaic) output.words.fill(sourcePixels[y * w + x], targetRow + x0, targetRow + x1);
      else {
        const sourceRow = (y + yy - ty) * w + x - tx;
        for (let xx = x0; xx < x1; xx++) output.words[targetRow + xx] = sourcePixels[sourceRow + xx];
      }
    }
  }
  output.ctx.putImageData(output.image, 0, 0);
  ctx.drawImage(output.canvas, 0, 0);
  if (p > 0.85) mask(ctx, w, h, (p - 0.85) / 0.15, 'fade');
}

/** p is amount of cover, for both 0→1 covering and 1→0 revealing. */
export function drawTransition(ctx, screen, kind, p, { from = null, reduced = false } = {}) {
  if (p <= 0) return;
  if (p >= 1) {
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(0, 0, screen.w, screen.h);
    return;
  }
  if (kind === 'battle-in') quantizeOut(ctx, screen, p, from, reduced);
  // Large moving irises/wipes become stationary ordered dither in reduced motion.
  else mask(ctx, screen.w, screen.h, p, reduced ? 'fade' : kind);
}

// A self-contained little observatory, painted only for the gallery (never external assets).
function sampleSnapshot(w, h) {
  const key = `${w}:${h}`;
  if (examples.has(key)) return examples.get(key);
  const p = new Pix(w, h);
  const horizon = Math.floor(h * 0.52);
  p.rect(0, 0, w, horizon, (x, y) => shadeRamp(PAL.sky.slice(0, 5), y / Math.max(1, horizon), x, y, 0.7));
  p.circle(w * 0.77, h * 0.19, 14, PAL.cream[1]);
  p.circle(w * 0.77 + 6, h * 0.19 - 3, 13, PAL.sky[1]);
  for (let i = 0; i < 28; i++) {
    const x = Math.floor(hash2(i, 2, 8) * w);
    const y = Math.floor(hash2(i, 7, 8) * horizon * 0.75);
    if (i % 5 === 0) p.line(x - 2, y, x + 2, y, PAL.cream[0]).line(x, y - 2, x, y + 2, PAL.cream[0]);
    else p.rect(x, y, 2, 1, PAL.sky[5]);
  }
  p.rect(0, horizon, w, h - horizon, PAL.water[1]);
  for (let y = horizon + 4; y < h; y += 8) for (let x = 0; x < w; x += 26) {
    p.line(x + ((y & 8) ? 13 : 0), y, x + 12 + ((y & 8) ? 13 : 0), y, y % 16 ? PAL.water[3] : PAL.water[2]);
  }
  const islandY = Math.floor(h * 0.72);
  p.ellipse(w * 0.48, islandY + 13, w * 0.34, 24, PAL.stone[1]);
  p.ellipse(w * 0.47, islandY + 4, w * 0.34, 21, PAL.forest[2]);
  p.ellipse(w * 0.43, islandY, w * 0.25, 15, PAL.grass[4]);
  const x = Math.floor(w * 0.44);
  const y = islandY - 57;
  p.poly([[x - 9, y + 14], [x + 9, y + 14], [x + 13, y + 58], [x - 12, y + 58]], PAL.cream[0]);
  p.poly([[x - 8, y + 14], [x, y + 14], [x + 1, y + 58], [x - 11, y + 58]], PAL.cream[2]);
  p.rect(x - 12, y + 9, 25, 5, PAL.roof[2]);
  p.rect(x - 8, y - 3, 17, 12, PAL.gold[5]).rect(x - 5, y - 1, 4, 8, PAL.gold[8]);
  p.rect(x + 2, y - 3, 2, 12, PAL.wood[2]);
  p.poly([[x - 13, y - 4], [x, y - 13], [x + 14, y - 4]], PAL.roof[4]);
  p.line(x - 12, y - 5, x, y - 13, PAL.roof[6]);
  p.rect(x - 2, y + 39, 6, 19, PAL.wood[1]).rect(x - 3, y + 22, 5, 8, PAL.water[3]);
  for (const tx of [Math.floor(w * 0.23), Math.floor(w * 0.68)]) {
    p.rect(tx - 2, islandY - 16, 5, 23, PAL.wood[2]);
    p.circle(tx, islandY - 22, 16, (xx, yy, nx, ny, nz) => shadeRamp(PAL.leaf.slice(1, 6), clamp((-nx - ny + nz) / 3 + 0.3), xx, yy, 0));
    p.rect(tx - 2, islandY - 27, 4, 4, PAL.gold[5]);
  }
  const canvas = p.toCanvas();
  if (examples.size === 4) examples.delete(examples.keys().next().value);
  examples.set(key, canvas);
  return canvas;
}

export const galleries = {
  transitions(ctx, screen, t, page = 0) {
    const kind = TRANSITION_KINDS[((page % TRANSITION_KINDS.length) + TRANSITION_KINDS.length) % TRANSITION_KINDS.length];
    const snapshot = sampleSnapshot(screen.w, screen.h);
    ctx.drawImage(snapshot, 0, 0);
    const cycle = t % 5;
    const p = cycle < 0.8 ? 0 : cycle < 2.4 ? (cycle - 0.8) / 1.6 : cycle < 3 ? 1 : cycle < 4.6 ? 1 - (cycle - 3) / 1.6 : 0;
    drawTransition(ctx, screen, kind, p, { from: snapshot });
    // Labels are outside the transition on purpose: the gallery identifies a fully covered frame.
    ctx.fillStyle = PAL.ink;
    ctx.fillRect(5, 5, Math.min(screen.w - 10, 229), 27);
    drawText(ctx, `${kind}  COVER ${Math.round(p * 100)}%`, 10, 9, { color: PAL.ui.gold });
    const caption = kind === 'battle-in' ? 'LIVE → 8 / 4 / 2 / 1 BIT → INK'
      : kind === 'restore' ? 'A DITHERED RING RETURNS THE COLOUR'
      : kind === 'wipe' ? 'A STEPPED EDGE BETWEEN TWO SCENES'
      : kind === 'battle-out' ? 'THE IRIS OPENS BACK INTO THE WORLD'
      : 'ORDERED DITHER, NEVER A GREY FADE';
    drawText(ctx, caption, 10, 22, { font: 'small', color: PAL.ui.dim });
  },
};
