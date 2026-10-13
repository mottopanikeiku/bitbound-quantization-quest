// Alias-free pixel painting. Art is rasterised into a CPU buffer (Pix) with integer
// coordinates, shaded from palette ramps, then converted once into a cached canvas.

const colorCache = new Map();

/** '#rrggbb' / '#rrggbbaa' / u32 → little-endian ABGR u32 (ImageData word order). */
export function u32(color) {
  if (typeof color === 'number') return color >>> 0;
  let value = colorCache.get(color);
  if (value !== undefined) return value;
  const hex = color.charAt(0) === '#' ? color.slice(1) : color;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const a = hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) : 255;
  value = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  colorCache.set(color, value);
  return value;
}

export function rgbaOf(value) {
  const v = u32(value);
  return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, v >>> 24];
}

export function hexOf(value) {
  const [r, g, b] = rgbaOf(value);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Mix two colours (0 → a, 1 → b). Use for deriving in-between tones, sparingly. */
export function mix(a, b, t) {
  const ca = rgbaOf(a);
  const cb = rgbaOf(b);
  const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `#${((1 << 24) | (c[0] << 16) | (c[1] << 8) | c[2]).toString(16).slice(1)}`;
}

/** 4×4 ordered-dither thresholds in (0, 1). */
export const BAYER4 = Object.freeze([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16));
export const bayer = (x, y) => BAYER4[((y & 3) << 2) | (x & 3)];

const lightLength = Math.hypot(-0.55, -0.65, 0.52);
/** The single scene light: from the top-left, slightly in front. */
export const LIGHT = Object.freeze({ x: -0.55 / lightLength, y: -0.65 / lightLength, z: 0.52 / lightLength });

export function lambert(nx, ny, nz) {
  return Math.max(0, nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z);
}

/**
 * Pick a ramp tone for brightness v ∈ [0, 1]. dither ∈ [0, 1] blends neighbouring
 * tones with an ordered pattern at (x, y); 0 gives clean bands for cel shading.
 */
export function shadeRamp(ramp, v, x = 0, y = 0, dither = 0) {
  const last = ramp.length - 1;
  const position = Math.max(0, Math.min(1, v)) * last;
  let index = Math.floor(position);
  const fraction = position - index;
  const threshold = 0.5 + (bayer(x, y) - 0.5) * dither;
  if (fraction > threshold) index += 1;
  return ramp[Math.min(last, index)];
}

/** Integer-only CPU pixel buffer. Colours: '#hex', u32, or null (skip). */
export class Pix {
  constructor(width, height) {
    this.w = Math.max(1, width | 0);
    this.h = Math.max(1, height | 0);
    this.data = new Uint32Array(this.w * this.h);
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  set(x, y, color) {
    x |= 0;
    y |= 0;
    if (color == null || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data[y * this.w + x] = u32(color);
  }

  get(x, y) {
    x |= 0;
    y |= 0;
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.data[y * this.w + x];
  }

  opaque(x, y) {
    return this.get(x, y) >>> 24 > 0;
  }

  clear(x = 0, y = 0, w = this.w, h = this.h) {
    for (let yy = Math.max(0, y); yy < Math.min(this.h, y + h); yy++) {
      this.data.fill(0, yy * this.w + Math.max(0, x), yy * this.w + Math.min(this.w, x + w));
    }
  }

  /** Fill a rectangle; color may be fn(x, y) → colour|null. */
  rect(x, y, w, h, color) {
    const x0 = Math.max(0, x | 0);
    const y0 = Math.max(0, y | 0);
    const x1 = Math.min(this.w, (x | 0) + (w | 0));
    const y1 = Math.min(this.h, (y | 0) + (h | 0));
    const fn = typeof color === 'function';
    const fixed = fn || color == null ? 0 : u32(color);
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        if (fn) this.set(xx, yy, color(xx, yy));
        else if (color != null) this.data[yy * this.w + xx] = fixed;
      }
    }
    return this;
  }

  /** Bresenham line, inclusive of both ends. */
  line(x0, y0, x1, y1, color) {
    x0 |= 0;
    y0 |= 0;
    x1 |= 0;
    y1 |= 0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    for (;;) {
      this.set(x0, y0, typeof color === 'function' ? color(x0, y0) : color);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * error;
      if (e2 >= dy) {
        error += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        error += dx;
        y0 += sy;
      }
    }
    return this;
  }

  /**
   * Filled ellipse sampled at pixel centres. color may be
   * fn(x, y, nx, ny, nz) where (nx, ny) ∈ [-1, 1] is the offset from the centre in
   * radius units and nz = sqrt(1 − nx² − ny²) completes a sphere normal.
   */
  ellipse(cx, cy, rx, ry, color) {
    if (rx <= 0 || ry <= 0) return this;
    const fn = typeof color === 'function';
    const y0 = Math.max(0, Math.floor(cy - ry));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + ry));
    const x0 = Math.max(0, Math.floor(cx - rx));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + rx));
    for (let y = y0; y <= y1; y++) {
      const ny = (y + 0.5 - cy) / ry;
      for (let x = x0; x <= x1; x++) {
        const nx = (x + 0.5 - cx) / rx;
        const d = nx * nx + ny * ny;
        if (d > 1) continue;
        this.set(x, y, fn ? color(x, y, nx, ny, Math.sqrt(1 - d)) : color);
      }
    }
    return this;
  }

  circle(cx, cy, r, color) {
    return this.ellipse(cx, cy, r, r, color);
  }

  /** Ordered-dither filled ellipse: density ∈ [0, 1] (soft shadows, glows). */
  ellipseDither(cx, cy, rx, ry, color, density = 0.5, falloff = true) {
    return this.ellipse(cx, cy, rx, ry, (x, y, nx, ny) => {
      const d = falloff ? density * (1 - (nx * nx + ny * ny) * 0.65) : density;
      return bayer(x, y) < d ? color : null;
    });
  }

  /** Even-odd scanline polygon fill; points = [[x, y], ...]; color may be fn(x, y). */
  poly(points, color) {
    if (points.length < 3) return this;
    const fn = typeof color === 'function';
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of points) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const crossings = [];
    for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(this.h - 1, Math.ceil(maxY)); y++) {
      const sy = y + 0.5;
      crossings.length = 0;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        if (yi > sy !== yj > sy) crossings.push(xi + ((sy - yi) / (yj - yi)) * (xj - xi));
      }
      crossings.sort((a, b) => a - b);
      for (let k = 0; k + 1 < crossings.length; k += 2) {
        const xa = Math.max(0, Math.ceil(crossings[k] - 0.5));
        const xb = Math.min(this.w - 1, Math.floor(crossings[k + 1] - 0.5));
        for (let x = xa; x <= xb; x++) this.set(x, y, fn ? color(x, y) : color);
      }
    }
    return this;
  }

  /**
   * Add a 1 px outline on transparent pixels touching opaque ones.
   * color may be fn(x, y, neighbourU32) → colour (selective outlines).
   */
  outline(color, { diagonal = false } = {}) {
    const marks = [];
    const neighbours = diagonal
      ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
      : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.opaque(x, y)) continue;
        for (const [dx, dy] of neighbours) {
          if (this.opaque(x + dx, y + dy)) {
            marks.push(x, y, this.get(x + dx, y + dy));
            break;
          }
        }
      }
    }
    for (let i = 0; i < marks.length; i += 3) {
      const c = typeof color === 'function' ? color(marks[i], marks[i + 1], marks[i + 2]) : color;
      this.set(marks[i], marks[i + 1], c);
    }
    return this;
  }

  /** Replace exact colours: map = { '#from': '#to' | null }. */
  replace(map) {
    const lookup = new Map(Object.entries(map).map(([from, to]) => [u32(from), to == null ? 0 : u32(to)]));
    for (let i = 0; i < this.data.length; i++) {
      const next = lookup.get(this.data[i]);
      if (next !== undefined) this.data[i] = next;
    }
    return this;
  }

  /** Copy another Pix's opaque pixels onto this one. */
  stamp(source, dx = 0, dy = 0, { flipX = false, flipY = false } = {}) {
    for (let y = 0; y < source.h; y++) {
      for (let x = 0; x < source.w; x++) {
        const value = source.data[y * source.w + x];
        if (value >>> 24 === 0) continue;
        const tx = dx + (flipX ? source.w - 1 - x : x);
        const ty = dy + (flipY ? source.h - 1 - y : y);
        if (this.inside(tx, ty)) this.data[ty * this.w + tx] = value;
      }
    }
    return this;
  }

  /** Map every opaque pixel through fn(x, y, u32) → colour|null. */
  each(fn) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const value = this.data[y * this.w + x];
        if (value >>> 24 === 0) continue;
        const next = fn(x, y, value);
        if (next === null) this.data[y * this.w + x] = 0;
        else if (next !== undefined) this.data[y * this.w + x] = u32(next);
      }
    }
    return this;
  }

  clone() {
    const copy = new Pix(this.w, this.h);
    copy.data.set(this.data);
    return copy;
  }

  flippedX() {
    return new Pix(this.w, this.h).stamp(this, 0, 0, { flipX: true });
  }

  toImageData() {
    return new ImageData(new Uint8ClampedArray(this.data.buffer.slice(0)), this.w, this.h);
  }

  toCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = this.w;
    canvas.height = this.h;
    canvas.getContext('2d').putImageData(this.toImageData(), 0, 0);
    return canvas;
  }
}

const sprites = new Map();
/** Paint once with paint(pix) and cache the resulting canvas under key. */
export function spriteCache(key, width, height, paint) {
  let canvas = sprites.get(key);
  if (!canvas) {
    const pix = new Pix(width, height);
    paint(pix);
    canvas = pix.toCanvas();
    sprites.set(key, canvas);
  }
  return canvas;
}

/**
 * Nearest-colour lookup for colour quantization effects: a 32×32×32 RGB cube
 * mapped to palette indices with perceptual channel weights.
 */
export function buildPaletteLUT(colors) {
  const palette = colors.map((c) => rgbaOf(c));
  const words = new Uint32Array(palette.map(([r, g, b]) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0));
  const lut = new Uint8Array(32 * 32 * 32);
  for (let r = 0; r < 32; r++) {
    for (let g = 0; g < 32; g++) {
      for (let b = 0; b < 32; b++) {
        const R = r * 8 + 4;
        const G = g * 8 + 4;
        const B = b * 8 + 4;
        let best = 0;
        let bestDistance = Infinity;
        for (let i = 0; i < palette.length; i++) {
          const [pr, pg, pb] = palette[i];
          const mr = (R + pr) / 2;
          const distance = (2 + mr / 256) * (R - pr) ** 2 + 4 * (G - pg) ** 2 + (2 + (255 - mr) / 256) * (B - pb) ** 2;
          if (distance < bestDistance) {
            bestDistance = distance;
            best = i;
          }
        }
        lut[(r << 10) | (g << 5) | b] = best;
      }
    }
  }
  return { lut, words, size: palette.length };
}

/**
 * Quantize ImageData pixels in place to a LUT palette with ordered dithering.
 * dither is the ± spread in 0–255 units; (ox, oy) keeps the dither pattern
 * anchored to world coordinates; mask(x, y) → boolean limits the effect.
 */
export function posterize(imageData, lutInfo, { dither = 24, ox = 0, oy = 0, mask = null } = {}) {
  const { width, height } = imageData;
  const words = new Uint32Array(imageData.data.buffer, imageData.data.byteOffset, width * height);
  const { lut, words: paletteWords } = lutInfo;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask && !mask(x, y)) continue;
      const i = y * width + x;
      const value = words[i];
      if (value >>> 24 === 0) continue;
      const offset = (bayer(x + ox, y + oy) - 0.5) * dither;
      const r = Math.max(0, Math.min(255, (value & 255) + offset)) >> 3;
      const g = Math.max(0, Math.min(255, ((value >>> 8) & 255) + offset)) >> 3;
      const b = Math.max(0, Math.min(255, ((value >>> 16) & 255) + offset)) >> 3;
      words[i] = (paletteWords[lut[(r << 10) | (g << 5) | b]] & 0x00ffffff) | (value & 0xff000000);
    }
  }
  return imageData;
}

/** Median-cut palette of up to count colours fitted to opaque ImageData pixels. */
export function medianCutPalette(imageData, count) {
  const words = new Uint32Array(imageData.data.buffer, imageData.data.byteOffset, imageData.width * imageData.height);
  const pixels = [];
  const stride = Math.max(1, Math.floor(words.length / 20000));
  for (let i = 0; i < words.length; i += stride) {
    const v = words[i];
    if (v >>> 24 === 0) continue;
    pixels.push([v & 255, (v >>> 8) & 255, (v >>> 16) & 255]);
  }
  if (pixels.length === 0) return ['#000000'];
  let boxes = [pixels];
  while (boxes.length < count) {
    let target = -1;
    let widest = -1;
    let channel = 0;
    boxes.forEach((box, index) => {
      if (box.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255;
        let hi = 0;
        for (const p of box) {
          lo = Math.min(lo, p[c]);
          hi = Math.max(hi, p[c]);
        }
        if (hi - lo > widest) {
          widest = hi - lo;
          target = index;
          channel = c;
        }
      }
    });
    if (target < 0) break;
    const box = boxes[target].sort((a, b) => a[channel] - b[channel]);
    const middle = box.length >> 1;
    boxes.splice(target, 1, box.slice(0, middle), box.slice(middle));
  }
  return boxes.map((box) => {
    const sum = box.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]);
    const [r, g, b] = sum.map((v) => Math.round(v / box.length));
    return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
  });
}
