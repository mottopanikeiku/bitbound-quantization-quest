// Original indexed pixel tapestries: paint once, cycle restrained ramps, sample by scanline.
// The two 128px Pix buffers are palette-index patterns, not RGBA sprites. No per-frame art noise.
import { PAL } from './palette.js';
import { Pix, mix, u32, bayer } from './paint.js';
import { clamp, makeCanvas } from '../engine/util.js';
import { drawText } from '../engine/font.js';

export const BACKGROUND_IDS = ['meadow', 'grove', 'cove', 'heights', 'forge', 'archives', 'spire', 'static', 'final'];

const SIZE = 128;
const MASK = SIZE - 1;
const PHASES = 24;
const SHADE_STEPS = 8;
const TITLES = ['Bitleaf reverie', 'The offset cathedral', 'A tide of values', 'Three silken channels', 'Ember inference', 'The ink between', 'The precision court', 'The lost signal', 'Every bit a star'];
// Each entry is a material ramp and a deliberately low brightness; highlights belong to the foe.
const THEMES = {
  meadow: { tones: [['forest', 0.3], ['forest', 1.0], ['forest', 1.7], ['grass', 2.3], ['gold', 1.9], ['forest', 1.5]], speed: 0.6, wave: 8, bend: 0.12 },
  grove: { tones: [['teal', 0.1], ['teal', 0.7], ['teal', 1.7], ['teal', 2.6], ['gold', 2.0], ['violet', 1.8]], speed: 0.46, wave: 7, bend: 0.09 },
  cove: { tones: [['water', 0.2], ['water', 1.0], ['water', 2.0], ['water', 3.2], ['rose', 1.7], ['water', 1.6]], speed: 0.8, wave: 12, bend: 0.15 },
  heights: { tones: [['night', 2.1], ['night', 3.1], ['sky', 1.2], ['alpine', 2.7], ['violet', 3.0], ['sky', 1.9]], speed: 0.52, wave: 10, bend: 0.08 },
  forge: { tones: [['ash', 0.0], ['ash', 0.9], ['ember', 1.2], ['ember', 2.5], ['gold', 2.8], ['ash', 1.5]], speed: 0.58, wave: 5, bend: 0.08 },
  archives: { tones: [['night', 0.9], ['violet', 0.6], ['violet', 1.7], ['violet', 2.8], ['gold', 2.3], ['night', 3.6]], speed: 0.38, wave: 9, bend: 0.12 },
  spire: { tones: [['night', 0.4], ['night', 1.5], ['teal', 0.9], ['teal', 2.6], ['gold', 2.7], ['night', 3.5]], speed: 0.47, wave: 11, bend: 0.12 },
  static: { tones: [['night', 0.4], ['violet', 0.8], ['violet', 1.6], ['violet', 3.0], ['teal', 2.7], ['night', 3.2]], speed: 0.95, wave: 13, bend: 0.19 },
  final: { tones: [['night', 0.1], ['night', 1.2], ['teal', 1.1], ['teal', 3.0], ['gold', 3.4], ['violet', 2.6]], speed: 0.56, wave: 14, bend: 0.17 },
};
const fields = new Map();
const frames = new Map();

function diamond(p, x, y, r, color) {
  p.line(x, y - r, x + r, y, color).line(x + r, y, x, y + r, color)
    .line(x, y + r, x - r, y, color).line(x - r, y, x, y - r, color);
}

function bit(p, x, y, one, color) {
  if (one) p.line(x + 1, y, x + 1, y + 4, color).line(x, y + 4, x + 2, y + 4, color);
  else p.rect(x, y, 3, 5, color).rect(x + 1, y + 1, 1, 3, 0);
}

function paintPatterns(id) {
  const base = new Pix(SIZE, SIZE);
  const detail = new Pix(SIZE, SIZE);
  // Broad, intentional colour clusters rather than single-pixel noise.
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let band;
      if (id === 'meadow') band = (x + y + Math.round(8 * Math.sin((x - y) * Math.PI / 64))) & 31;
      else if (id === 'grove') band = (x + y) & 31;
      else if (id === 'cove') band = (y + Math.round(9 * Math.sin(x * Math.PI / 32))) & 31;
      else if (id === 'heights') band = (x - y + 128) & 31;
      else if (id === 'forge') band = (y + Math.abs((x & 31) - 16)) & 31;
      else if (id === 'archives') band = (x + (y >> 4) * 8) & 31;
      else if (id === 'spire') band = (y + Math.round(12 * Math.cos(x * Math.PI / 64))) & 31;
      else if (id === 'static') band = (((x >> 3) + (y >> 3)) & 7) * 4;
      else band = (x + y + Math.round(8 * Math.sin((x - y) * Math.PI / 64))) & 31;
      base.set(x, y, band < 13 ? 0 : band < 26 ? 1 : 2);
    }
  }
  if (id === 'meadow') {
    // Four equally spaced levels and a travelling staircase, never a plant silhouette.
    for (let y = -32; y < SIZE + 32; y += 32) for (let x = -32; x < SIZE + 32; x += 32) {
      const xx = x + ((y & 32) ? 16 : 0);
      for (let level = 0; level < 4; level++) {
        const yy = y + 5 + level * 6;
        detail.line(xx + 2, yy, xx + 24, yy, 2);
        detail.rect(xx + 2, yy - 1, 2, 3, 3);
        const sample = xx + 7 + ((level + (x >> 5)) & 3) * 4;
        detail.rect(sample, yy - 1, 3, 3, level === 1 ? 4 : 3);
      }
      detail.line(xx + 28, y + 5, xx + 28, y + 12, 3)
        .line(xx + 28, y + 12, xx + 31, y + 12, 3)
        .line(xx + 31, y + 12, xx + 31, y + 19, 3);
    }
  } else if (id === 'grove') {
    for (let y = -32; y < SIZE + 32; y += 32) for (let x = -32; x < SIZE + 32; x += 32) {
      const xx = x + ((y & 32) ? 16 : 0);
      diamond(detail, xx, y, 14, 2);
      detail.poly([[xx, y - 9], [xx + 5, y], [xx, y + 10], [xx - 5, y]], 3);
      detail.line(xx, y - 7, xx, y + 7, 5).line(xx - 3, y - 1, xx, y - 7, 4);
      detail.rect(xx + 13, y + 15, 3, 3, 4);
    }
  } else if (id === 'cove') {
    for (let y = -32; y < SIZE + 32; y += 32) {
      for (let x = 0; x < SIZE; x++) {
        const wave = Math.round(9 * Math.sin(x * Math.PI / 32));
        detail.set(x, y + wave, 3);
        if ((x & 7) === 0) detail.rect(x - 1, y + Math.round(wave / 4) * 4 + 7, 3, 3, 4);
        if ((x & 15) < 8) detail.set(x, y + wave + 14, 2);
      }
    }
  } else if (id === 'heights') {
    for (let y = -32; y < SIZE + 32; y += 32) for (let x = 0; x < SIZE; x++) {
      const thread = Math.round(7 * Math.sin(x * Math.PI / 32));
      detail.set(x, y + thread, 3);
      detail.set(x, y - thread + 9, 5);
      detail.set(x, y + thread + 17, 2);
      if ((x & 31) === 16) diamond(detail, x, y + 9, 3, 4);
    }
  } else if (id === 'forge') {
    for (let y = -16; y < SIZE; y += 32) for (let x = -16; x < SIZE; x += 32) {
      detail.line(x, y, x + 32, y, 2).line(x, y, x, y + 32, 2);
      detail.line(x + 2, y + 2, x + 29, y + 2, 5);
      diamond(detail, x + 16, y + 16, 9, 2);
      detail.poly([[x + 16, y + 8], [x + 21, y + 17], [x + 16, y + 23], [x + 12, y + 17]], 3);
      detail.rect(x + 15, y + 14, 2, 5, 4);
      for (let i = 0; i < 3; i++) detail.rect(x + 5 + i * 3, y + 27, 2, 2, 3);
    }
  } else if (id === 'archives') {
    for (let y = -8; y < SIZE; y += 32) for (let x = -16; x < SIZE; x += 32) {
      const xx = x + ((y & 32) ? 16 : 0);
      // Rune-pages: a margin, a tall outlier, and three small level glyphs.
      detail.line(xx + 4, y + 5, xx + 4, y + 24, 2).line(xx + 4, y + 24, xx + 24, y + 24, 2);
      detail.line(xx + 10, y + 7, xx + 10, y + 20, 3).line(xx + 8, y + 7, xx + 14, y + 7, 4);
      detail.line(xx + 10, y + 14, xx + 18, y + 14, 3).line(xx + 18, y + 14, xx + 18, y + 20, 3);
      detail.rect(xx + 21, y + 8, 3, 2, 5).rect(xx + 21, y + 12, 3, 2, 5).rect(xx + 21, y + 18, 3, 2, 3);
    }
  } else if (id === 'final') {
    for (let y = -32; y < SIZE + 32; y += 64) for (let x = -32; x < SIZE + 32; x += 64) {
      detail.circle(x, y, 25, (xx, yy, nx, ny) => nx * nx + ny * ny > 0.91 ? 2 : null);
      diamond(detail, x, y, 17, 5);
      detail.line(x - 6, y, x + 6, y, 4).line(x, y - 6, x, y + 6, 4);
      detail.rect(x - 1, y - 1, 3, 3, 3);
      for (let k = -2; k <= 2; k++) {
        detail.rect(x + k * 4 - 1, y - 25, 2, 3, 4);
        detail.rect(x - 25, y + k * 4 - 1, 3, 2, 3);
      }
      diamond(detail, x + 32, y + 32, 6, 4);
      detail.rect(x + 31, y + 31, 3, 3, 5);
    }
  } else if (id === 'spire') {
    for (let y = -32; y < SIZE + 32; y += 32) for (let x = -32; x < SIZE + 32; x += 32) {
      const xx = x + ((y & 32) ? 16 : 0);
      diamond(detail, xx, y, 16, 2);
      detail.line(xx - 12, y, xx, y + 11, 3).line(xx, y + 11, xx + 12, y, 3);
      diamond(detail, xx, y - 2, 4, 4);
      detail.rect(xx - 1, y - 3, 2, 2, 5);
    }
  } else {
    for (let y = 0; y < SIZE; y += 16) for (let x = 0; x < SIZE; x += 16) {
      const code = ((x >> 4) ^ (y >> 4)) & 3;
      bit(detail, x + 3, y + 4, code & 1, 3);
      bit(detail, x + 9, y + 4, code & 2, code === 3 ? 4 : 2);
      if (code === 0) detail.line(x, y + 12, x + 11, y + 12, 5);
      if (code === 2) detail.rect(x + 8, y + 13, 6, 2, 2);
    }
  }
  return { base: new Uint8Array(base.data), detail: new Uint8Array(detail.data) };
}

function getField(id) {
  let field = fields.get(id);
  if (field) return field;
  const theme = THEMES[id];
  const palettes = [];
  for (let phase = 0; phase < PHASES; phase++) {
    const palette = new Uint32Array(SHADE_STEPS * 8);
    for (let shade = 0; shade < SHADE_STEPS; shade++) for (let i = 0; i < theme.tones.length; i++) {
      const [name, level] = theme.tones[i];
      const ramp = PAL[name];
      const cycle = Math.sin(phase * Math.PI * 2 / PHASES + i * 1.35) * (i > 1 ? 0.3 : 0.08);
      const v = clamp(level + cycle - shade * 0.22, 0, ramp.length - 1);
      const low = Math.floor(v);
      palette[shade * 8 + i] = u32(mix(ramp[low], ramp[Math.min(ramp.length - 1, low + 1)], v - low));
    }
    palettes.push(palette);
  }
  field = { ...paintPatterns(id), palettes, theme };
  fields.set(id, field);
  return field;
}

function getFrame(w, h) {
  const key = `${w}:${h}`;
  let frame = frames.get(key);
  if (frame) return frame;
  const { canvas, ctx } = makeCanvas(w, h);
  const image = ctx.createImageData(w, h);
  const shade = new Uint8Array(w * h);
  const edges = new Float32Array(w);
  for (let x = 0; x < w; x++) edges[x] = (Math.abs(x / w - 0.5) * 2) ** 3 * 2;
  for (let y = 0; y < h; y++) {
    const bottom = clamp((y / h - 0.42) / 0.58);
    const top = clamp((0.15 - y / h) / 0.15);
    const vertical = bottom ** 1.6 * 5.8 + top * 1.3;
    for (let x = 0; x < w; x++) {
      shade[y * w + x] = Math.min(7, Math.floor(edges[x] + vertical + bayer(x, y))) * 8;
    }
  }
  frame = { canvas, ctx, image, words: new Uint32Array(image.data.buffer), shade };
  // Only sizes, not times, are retained. A resize cannot grow this cache indefinitely.
  if (frames.size === 8) frames.delete(frames.keys().next().value);
  frames.set(key, frame);
  return frame;
}

/** Fills any canvas size; intensity scales distortion, reduced keeps only a slow drift. */
export function drawBattleBackground(ctx, screen, id, t, { intensity = 1, reduced = false } = {}) {
  id = THEMES[id] ? id : 'static';
  const w = screen.w | 0;
  const h = screen.h | 0;
  const { base, detail, palettes, theme } = getField(id);
  const frame = getFrame(w, h);
  const time = t * (reduced ? 0.17 : theme.speed);
  const palette = palettes[((Math.floor(time * 3) % PHASES) + PHASES) % PHASES];
  const amount = reduced ? 0 : clamp(intensity, 0, 3);
  const compression = 1 + Math.sin(time * 0.7) * theme.bend * amount;
  const driftX = Math.floor(time * 3);
  const driftY = Math.floor(time * 4);
  const secondDrift = Math.floor(time * -2);
  const { words, shade } = frame;
  const rowWidth = Math.min(w, SIZE);
  for (let y = 0; y < h; y++) {
    const wave = Math.sin(y * 0.034 + time * 1.7) * theme.wave + Math.sin(y * 0.091 - time) * 2;
    const interlace = (y & 1 ? 1 : -1) * Math.min(1, amount * 0.5);
    const dx = Math.round(wave * amount + interlace) + driftX;
    const sy = ((Math.floor(y * compression) + driftY) & MASK) * SIZE;
    const mx = Math.round(Math.sin(y * 0.023 - time) * theme.wave * amount * 0.6) + secondDrift;
    const my = ((Math.floor(y * (2 - compression)) - driftY) & MASK) * SIZE;
    const row = y * w;
    // The tapestry repeats every 128px: sample its two layers once per repeat,
    // then apply the screen-space vignette. A 384px row avoids 2/3 of the sampling.
    for (let x = 0; x < rowWidth; x++) {
      const motif = detail[my + ((x + mx) & MASK)];
      const index = motif || base[sy + ((x + dx) & MASK)];
      for (let xx = x; xx < w; xx += SIZE) {
        const pixel = row + xx;
        words[pixel] = palette[shade[pixel] + index];
      }
    }
  }
  frame.ctx.putImageData(frame.image, 0, 0);
  ctx.drawImage(frame.canvas, 0, 0);
}

function sample(ctx, x, y, w, h, id, t, label) {
  ctx.fillStyle = PAL.night[5];
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.save();
  ctx.translate(x, y);
  drawBattleBackground(ctx, { w, h }, id, t);
  ctx.restore();
  drawText(ctx, label, x + 5, y + h - 12, { font: 'small', color: PAL.ui.dim, shadow: PAL.ink });
}

export const galleries = {
  backgrounds(ctx, screen, t, page = 0) {
    const index = ((page % BACKGROUND_IDS.length) + BACKGROUND_IDS.length) % BACKGROUND_IDS.length;
    const id = BACKGROUND_IDS[index];
    ctx.fillStyle = PAL.night[0];
    ctx.fillRect(0, 0, screen.w, screen.h);
    drawText(ctx, `${String(index + 1).padStart(2, '0')}  ${TITLES[index]}`, 10, 7, { color: PAL.ui.text });
    drawText(ctx, 'PALETTE + TWO SCANLINE TAPESTRIES', 10, 20, { font: 'small', color: PAL.ui.faint });
    if (screen.w > screen.h) {
      sample(ctx, 10, 44, 238, 134, id, t, 'LANDSCAPE');
      sample(ctx, 268, 31, 102, 170, id, t, 'PORTRAIT');
      drawText(ctx, id, 10, 186, { color: PAL.ui.gold });
    } else {
      sample(ctx, 8, 37, 200, 113, id, t, 'LANDSCAPE');
      const h = Math.min(216, screen.h - 181);
      const w = Math.round(h * 0.6);
      sample(ctx, Math.floor((screen.w - w) / 2), 165, w, h, id, t, 'PORTRAIT');
    }
  },
};
