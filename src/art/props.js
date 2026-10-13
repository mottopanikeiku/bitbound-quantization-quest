// Original, integer-rasterised world sprites. Anchors stay at ground contact;
// collision rectangles describe footprints, never the overhanging canopy/roof.
import { PAL, BIOME } from './palette.js';
import { spriteCache, shadeRamp, lambert } from './paint.js';
import { hash2 } from '../engine/util.js';
import { drawText } from '../engine/font.js';

const box = (w, h, solid) => ({ w, h, ax: Math.floor(w / 2), ay: h - 2, solid });
export const PROPS = {
  'tree-oak': box(32, 40, [-3, -5, 7, 6]), 'tree-pine': box(24, 40, [-3, -4, 6, 5]),
  'tree-palm': box(28, 40, [-3, -4, 6, 5]), 'tree-willow': box(36, 40, [-4, -5, 8, 6]),
  'tree-dead': box(24, 32, [-3, -4, 6, 5]), 'tree-crystal': box(24, 36, [-4, -5, 8, 6]),
  bush: box(16, 14, [-6, -4, 12, 5]), 'rock-s': box(12, 10, [-4, -3, 8, 4]), 'rock-l': box(24, 20, [-9, -6, 18, 7]),
  stump: box(14, 10, [-5, -4, 10, 5]), mushroom: box(8, 8, null), reeds: box(12, 12, null), flowerbed: box(16, 10, null),
  'fence-h': box(16, 12, [-8, -3, 16, 4]), 'fence-v': box(6, 18, [-2, -14, 4, 15]), sign: box(14, 16, [-2, -3, 4, 4]),
  lamp: box(8, 24, [-2, -3, 4, 4]), lantern: box(10, 14, [-3, -3, 6, 4]), campfire: box(16, 14, [-6, -4, 12, 5]),
  tent: box(32, 26, [-13, -9, 26, 10]), 'house-a': box(48, 48, [-19, -12, 38, 13]),
  'house-b': box(56, 52, [-23, -13, 46, 14]), 'house-c': box(40, 44, [-15, -11, 30, 12]),
  lighthouse: box(40, 88, [-11, -9, 22, 10]), well: box(20, 22, [-8, -7, 16, 8]),
  dock: box(32, 16, null), boat: box(32, 18, [-13, -6, 26, 7]), gridstone: box(20, 32, [-7, -6, 14, 7]),
  'shrine-0': box(48, 48, [-19, -10, 38, 11]), 'shrine-1': box(48, 48, [-18, -10, 36, 11]),
  'shrine-2': box(48, 48, [-19, -10, 38, 11]), 'shrine-3': box(48, 48, [-18, -10, 36, 11]),
  'shrine-4': box(48, 48, [-18, -10, 36, 11]), 'shrine-5': box(48, 48, [-18, -10, 36, 11]),
  'shrine-6': box(56, 64, [-22, -12, 44, 13]), gate: box(48, 32, [-24, -5, 48, 7]),
  cache: box(14, 12, [-6, -4, 12, 5]), shard: box(10, 12, null), pedestal: box(16, 20, [-6, -5, 12, 6]),
  'stone-float': box(16, 12, null), bookshelf: box(24, 32, [-10, -5, 20, 6]), pillar: box(16, 36, [-6, -5, 12, 6]),
  anvil: box(20, 14, [-7, -5, 14, 6]), furnace: box(32, 36, [-13, -10, 26, 11]),
  'crystal-cluster': box(20, 22, [-7, -5, 14, 6]), statue: box(20, 34, [-6, -5, 12, 6]), banner: box(12, 28, [-2, -3, 4, 4]),
};

const BIOMES = Object.keys(BIOME);
const CYCLE = [0, 1, 0, -1];
const mod = (n, d) => ((n % d) + d) % d;
const ACCENT = ['grass', 'teal', 'water', 'violet', 'ember', 'violet', 'gold'];

function shadow(p, cx, cy, rx, ry = 3) { p.ellipseDither(cx + 1, cy, rx, ry, PAL.shadow, 0.48); }
function glow(p, x, y, rx, ry, c, density = 0.25) { p.ellipseDither(x, y, rx, ry, c, density); }
function sparkle(p, x, y, c) { p.rect(x - 2, y, 5, 1, c); p.rect(x, y - 2, 1, 5, c); }

function foliage(p, cx, cy, rx, ry, ramp, seed = 0) {
  // Sphere light + coherent 3 px leaf clumps, quantised to four material tones.
  p.ellipse(cx + 1, cy + 1, rx, ry, ramp[1]);
  p.ellipse(cx, cy, rx, ry, (x, y, nx, ny, nz) => {
    const clump = hash2(Math.floor((x + seed) / 3), Math.floor(y / 3), seed);
    const light = lambert(nx, ny, nz) * 0.7 + 0.14 + (clump - 0.5) * 0.15;
    return ramp[light > 0.74 ? 6 : light > 0.51 ? 5 : light > 0.3 ? 3 : 2];
  });
  for (let i = 0; i < 5; i++) {
    const x = Math.round(cx - rx * 0.65 + hash2(i, seed, 4) * rx);
    const y = Math.round(cy - ry * 0.6 + hash2(i, seed, 9) * ry * 0.7);
    p.rect(x, y, 2, 1, ramp[6]);
    p.set(x - 1, y + 1, ramp[5]);
  }
}

function trunk(p, x, y, h, w = 6, dead = false) {
  const r = dead ? PAL.ash : PAL.wood;
  p.poly([[x - w / 2, y + h], [x - 2, y], [x + 2, y], [x + w / 2, y + h]], r[2]);
  p.rect(x - 2, y, 2, h, r[5]); p.rect(x, y + 2, 2, h - 2, r[3]);
  p.line(x - 3, y + h - 1, x - 5, y + h, r[2]); p.line(x + 2, y + h - 2, x + 5, y + h, r[2]);
  p.line(x - 1, y + 6, x, y + 10, r[2]); p.set(x - 2, y + 5, r[6]);
}

function crystal(p, x, y, w, h, r = PAL.teal) {
  p.poly([[x, y - h], [x + w / 2, y - h + 5], [x + w / 2, y - 3], [x, y], [x - w / 2, y - 4], [x - w / 2, y - h + 5]], r[1]);
  p.poly([[x, y - h], [x + w / 2 - 1, y - h + 5], [x + w / 2 - 1, y - 3], [x, y - 1]], r[4]);
  p.poly([[x, y - h + 1], [x, y - 1], [x - w / 2 + 1, y - 4], [x - w / 2 + 1, y - h + 5]], r[7]);
  p.line(x, y - h + 2, x, y - 2, r[Math.min(8, r.length - 1)]);
  p.set(x - 1, y - h + 3, PAL.cream[3]);
}

function stone(p, x, y, w, h, r = PAL.stone, variant = 0) {
  p.poly([[x - w / 2, y - 2], [x - w / 2 + 1, y - h + 4], [x - 2, y - h], [x + w / 2 - 3, y - h + 2], [x + w / 2, y - 4], [x + w / 2 - 2, y]], r[2]);
  p.poly([[x - w / 2 + 1, y - h + 4], [x - 2, y - h + 1], [x + w / 2 - 4, y - h + 3], [x + 2, y - h / 2], [x - w / 2 + 2, y - 3]], r[5]);
  p.poly([[x + 2, y - h / 2], [x + w / 2 - 3, y - h + 3], [x + w / 2 - 1, y - 4], [x + w / 2 - 3, y - 1], [x, y - 2]], r[3]);
  p.line(x - w / 2 + 3, y - h + 4, x - 2, y - h + 2, r[6]);
  if (variant % 2 === 0) p.line(x - 1, y - h / 2, x - 3, y - 3, r[3]);
}

function drawTree(p, kind, d, biome, variant, frame) {
  const x = d.ax, y = d.ay;
  const shift = CYCLE[frame];
  const r = PAL[BIOME[biome]?.foliage ?? 'leaf'];
  shadow(p, x, y, kind === 'tree-willow' ? 14 : 11, 4);
  if (kind === 'tree-crystal' || biome === 'spire' && kind === 'tree-oak') {
    trunk(p, x, y - 17, 17, 7, true);
    p.line(x, y - 11, x - 6, y - 21, PAL.teal[3]);
    crystal(p, x + 5 + shift, y - 11, 9, 18, PAL.teal);
    crystal(p, x - 5, y - 13, 8, 14, PAL.violet);
    crystal(p, x + shift, y - 18, 9, 15, PAL.teal);
    return;
  }
  if (kind === 'tree-dead' || biome === 'forge' && kind === 'tree-oak') {
    trunk(p, x, y - 24, 24, 7, true);
    p.line(x - 1, y - 12, x - 8, y - 20, PAL.ash[4]); p.line(x - 8, y - 20, x - 9, y - 26, PAL.ash[5]);
    p.line(x + 1, y - 18, x + 8, y - 24, PAL.ash[2]); p.line(x + 8, y - 24, x + 9, y - 29, PAL.ash[3]);
    p.line(x - 7, y - 20, x - 3, y - 23, PAL.ash[5]);
    p.rect(x - 1, y - 2, 2, 2, PAL.ember[4]);
    return;
  }
  if (biome === 'archives') {
    p.poly([[x - 6, y], [x - 2, y - 8], [x - 5, y - 15], [x + 1, y - 26], [x + 5, y - 25], [x, y - 15], [x + 4, y - 7], [x + 5, y]], PAL.ash[2]);
    p.line(x - 4, y - 1, x, y - 8, PAL.ash[5]); p.line(x, y - 8, x - 3, y - 15, PAL.ash[4]); p.line(x - 3, y - 15, x + 2, y - 24, PAL.ash[5]);
    p.line(x + 4, y - 3, x + 8, y - 1, PAL.ash[3]);
  } else trunk(p, x, y - 25, 25, 7);
  if (kind !== 'tree-pine' && kind !== 'tree-palm' && biome !== 'cove') {
    p.line(x, y - 14, x - 7, y - 23, PAL.wood[3]); p.line(x, y - 16, x + 7, y - 24, PAL.wood[2]);
  }
  if (kind === 'tree-palm' || biome === 'cove' && kind === 'tree-oak') {
    for (let i = 0; i < 5; i++) p.line(x - 2, y - i * 4 - 3, x + 2, y - i * 4 - 4, PAL.wood[6]);
    const cx = x + shift, cy = y - 29;
    for (const [dx, dy] of [[-12, -3], [-11, 6], [-6, -8], [7, -7], [12, 2], [6, 8]]) {
      p.poly([[cx, cy], [cx + dx * 0.55, cy + dy * 0.45 - 3], [cx + dx * 0.9, cy + dy - 2], [cx + dx, cy + dy + 4], [cx + dx * 0.62, cy + dy + 1], [cx, cy + 3]], r[dx < 0 ? 5 : 3]);
      p.line(cx, cy, cx + dx * 0.82, cy + dy, r[dx < 0 ? 6 : 4]);
      p.line(cx + dx * 0.6, cy + dy * 0.5, cx + dx * 0.55, cy + dy + 2, r[2]);
    }
    p.circle(cx - 2, cy + 3, 2, PAL.wood[3]); p.circle(cx + 2, cy + 3, 2, PAL.wood[4]);
  } else if (kind === 'tree-pine') {
    for (let i = 0; i < 3; i++) {
      const yy = 3 + i * 7, width = 5 + i * 3;
      p.poly([[x + shift, yy], [x + width, yy + 15], [x + 5, yy + 14], [x, yy + 17], [x - width, yy + 15]], r[2]);
      p.poly([[x + shift, yy], [x, yy + 13], [x - width + 1, yy + 13]], r[5]);
      p.poly([[x + shift, yy + 2], [x + width - 2, yy + 12], [x, yy + 13]], r[3]);
      p.line(x - width + 2, yy + 12, x - 2, yy + 10, r[6]);
      for (let j = 0; j < 3 + i; j++) {
        const xx = x - width + 3 + j * 3, yy2 = yy + 10 + j % 2;
        p.line(xx, yy2, xx + 2, yy2 - 1, r[xx < x ? 6 : 4]);
        p.line(xx, yy2 + 3, xx + 1, yy2 + 2, r[2]);
      }
      if (biome === 'heights') p.poly([[x + shift, yy], [x + 4, yy + 7], [x, yy + 6], [x - 5, yy + 9]], PAL.snow[4]);
    }
  } else if (kind === 'tree-willow' || biome === 'grove' && kind === 'tree-oak') {
    foliage(p, x + shift, 12, 10, 10, r, variant + 1);
    foliage(p, x - 9 + shift, 18, 8, 9, r, variant + 3);
    foliage(p, x + 9 + shift, 17, 8, 10, r, variant + 5);
    for (let i = 0; i < 7; i++) {
      const xx = x - 14 + i * 4 + shift;
      const length = 8 + Math.floor(hash2(i, variant, 3) * 8);
      p.line(xx, 18, xx + (i % 2), 18 + length, r[i < 3 ? 4 : 2]);
      p.line(xx - 1, 20, xx, 18 + length - 3, r[i < 3 ? 6 : 4]);
    }
  } else {
    foliage(p, x + 7 + shift, 21, 8, 8, r, variant + 2);
    foliage(p, x - 6 + shift, 21, 9, 9, r, variant + 5);
    foliage(p, x + 7 + shift, 12, 7, 8, r, variant + 1);
    foliage(p, x - 3 + shift, 11, 10, 9, r, variant + 4);
    foliage(p, x - 10 + shift, 16, 5, 6, r, variant + 7);
    if (biome === 'archives') {
      p.line(x + 1, y - 5, x + 3, y - 12, PAL.violet[3]);
      p.rect(x - 8, 22, 3, 2, PAL.gold[5]); p.set(x - 8, 21, PAL.gold[7]);
      p.rect(x - 9, 24, 1, 5, PAL.violet[4]);
    }
  }
}

function windowPane(p, x, y, w = 8, h = 9, lit = true) {
  p.rect(x - 1, y - 1, w + 2, h + 2, PAL.wood[1]);
  p.rect(x, y, w, h, lit ? PAL.gold[4] : PAL.sky[2]);
  p.rect(x, y, w - 2, h - 2, lit ? PAL.gold[7] : PAL.sky[4]);
  p.rect(x + 1, y + 1, 2, 2, PAL.cream[3]);
  p.rect(x + (w >> 1), y, 1, h, PAL.wood[4]); p.rect(x, y + (h >> 1), w, 1, PAL.wood[3]);
  p.rect(x - 2, y + h + 1, w + 4, 2, PAL.wood[5]);
}

function roof(p, x, y, w, h, r) {
  p.poly([[x + 3, y + h], [x + w / 2, y], [x + w - 3, y + h]], r[2]);
  p.poly([[x + 1, y + h - 2], [x + w / 2 - 3, y + 1], [x + w - 2, y + h - 2]], r[4]);
  for (let row = 0; row < h - 3; row += 4) {
    const inset = Math.ceil((h - row) * (w / 2 - 3) / h);
    for (let xx = x + inset; xx < x + w - inset; xx++) {
      p.set(xx, y + row + 1, r[6]); p.set(xx, y + row + 3, r[2]);
      if (mod(xx + (row % 8 ? 3 : 0), 7) === 0) p.rect(xx, y + row + 1, 1, 3, r[3]);
    }
  }
  p.line(x + 2, y + h - 2, x + w / 2 - 3, y + 1, r[7]);
  p.rect(x + 1, y + h - 1, w - 2, 2, PAL.wood[1]); p.rect(x + 2, y + h - 1, w - 4, 1, r[5]);
}

function house(p, d, kind, biome, variant) {
  const { w, h } = d, ground = d.ay;
  const r = kind === 'house-b' ? PAL.roofBlue : kind === 'house-c' ? PAL.teal : PAL.roof;
  shadow(p, w / 2, ground, w / 2 - 2, 3);
  p.rect(5, h - 24, w - 10, 22, PAL.wood[2]);
  p.rect(5, h - 24, w - 15, 20, PAL.wood[5]);
  for (let y = h - 23; y < h - 4; y += 4) {
    p.rect(6, y, w - 16, 1, PAL.wood[6]); p.rect(6, y + 3, w - 16, 1, PAL.wood[3]);
  }
  p.rect(w - 10, h - 24, 5, 21, PAL.wood[3]);
  p.rect(5, h - 5, w - 10, 3, PAL.stone[3]); p.rect(5, h - 5, w - 13, 1, PAL.stone[5]);
  p.rect(w - 15, 7, 7, 15, PAL.stone[3]); p.rect(w - 15, 7, 3, 15, PAL.stone[5]);
  p.rect(w - 16, 6, 9, 3, PAL.stone[2]); p.rect(w - 16, 6, 8, 1, PAL.stone[6]);
  roof(p, 0, 9, w, h - 31, r);
  const doorX = Math.floor(w / 2) - 3;
  p.rect(doorX - 1, h - 17, 9, 15, PAL.wood[1]); p.rect(doorX, h - 16, 7, 13, PAL.wood[3]);
  p.rect(doorX + 1, h - 15, 1, 12, PAL.wood[5]); p.set(doorX + 5, h - 9, PAL.gold[6]);
  p.rect(doorX - 2, h - 3, 11, 2, PAL.stone[5]);
  windowPane(p, 9, h - 21, 7, 8, true);
  if (w > 40) windowPane(p, w - 17, h - 21, 7, 8, variant % 3 !== 2);
  p.rect(8, h - 11, 9, 3, PAL.wood[2]);
  for (let i = 0; i < 3; i++) { p.rect(9 + i * 3, h - 12, 2, 2, PAL.leaf[4]); p.set(9 + i * 3, h - 13, PAL[BIOME[biome]?.accent ?? 'rose'][6]); }
}

function lighthouse(p, d, frame) {
  const x = d.ax, y = d.ay;
  shadow(p, x, y, 17, 3);
  p.ellipse(x, y - 2, 16, 4, PAL.stone[2]); p.ellipse(x, y - 3, 15, 3, PAL.stone[5]);
  for (let yy = 28; yy < y - 3; yy++) {
    const half = 7 + Math.floor((yy - 28) / 14);
    const red = Math.floor((yy - 29) / 10) % 2 === 1;
    p.rect(x - half, yy, half * 2 + 1, 1, red ? PAL.roof[3] : PAL.stone[4]);
    p.rect(x - half, yy, half + 4, 1, red ? PAL.roof[5] : PAL.cream[2]);
    p.rect(x - half, yy, 2, 1, red ? PAL.roof[6] : PAL.cream[3]);
    p.set(x + half, yy, PAL.stone[2]);
  }
  p.rect(x - 4, y - 15, 8, 12, PAL.wood[1]); p.rect(x - 3, y - 15, 5, 12, PAL.wood[4]);
  p.rect(x - 2, y - 14, 1, 10, PAL.wood[6]); p.set(x + 1, y - 9, PAL.gold[6]);
  windowPane(p, x - 2, 48, 4, 5, false);
  p.rect(x - 12, 26, 25, 3, PAL.stone[2]); p.rect(x - 12, 26, 24, 1, PAL.stone[6]);
  p.rect(x - 13, 21, 27, 1, PAL.stone[5]);
  for (let xx = x - 12; xx <= x + 12; xx += 4) p.rect(xx, 21, 1, 6, PAL.stone[3]);
  glow(p, x, 17, 17, 13, PAL.gold[5], 0.24);
  p.rect(x - 8, 12, 17, 12, PAL.wood[2]);
  p.rect(x - 7, 13, 14, 9, PAL.gold[5]); p.rect(x - 6, 13, 8, 8, PAL.gold[7]);
  p.rect(x - 4, 14, 2, 4, PAL.cream[3]); p.rect(x + 3, 13, 1, 10, PAL.wood[4]);
  p.rect(x - 9, 23, 19, 2, PAL.wood[2]);
  p.poly([[x - 11, 12], [x - 6, 6], [x, 3], [x + 6, 6], [x + 11, 12]], PAL.roof[3]);
  p.poly([[x - 10, 11], [x - 6, 6], [x, 4], [x, 10]], PAL.roof[5]);
  p.line(x - 8, 9, x - 2, 5, PAL.roof[6]); p.rect(x, 0, 1, 4, PAL.gold[6]);
  if (frame === 1) sparkle(p, x + 5, 16, PAL.cream[3]);
}

function grid(p, x, y, w, h, r, bright = true) {
  p.rect(x, y, w, h, r[1]);
  for (let xx = x + 2; xx < x + w - 1; xx += 4) p.rect(xx, y + 1, 1, h - 2, r[bright ? 4 : 2]);
  for (let yy = y + 2; yy < y + h - 1; yy += 4) p.rect(x + 1, yy, w - 2, 1, r[bright ? 5 : 3]);
  for (let i = 0; i < 3; i++) p.rect(x + 2 + i * 4, y + h - 4 - i * 3, 2, 2, r[bright ? Math.min(8, r.length - 1) : 4]);
}

function gridstone(p, d, biome, state, frame) {
  const x = d.ax, y = d.ay, awake = state === 'awake' || state === 'restored';
  const r = PAL[BIOME[biome]?.accent ?? 'teal'];
  shadow(p, x, y, 9, 3);
  p.rect(2, y - 3, 16, 3, PAL.stone[2]); p.rect(3, y - 4, 14, 2, PAL.stone[5]);
  p.poly([[4, y - 4], [3, 8], [6, 2], [14, 1], [17, 6], [16, y - 4]], PAL.stone[2]);
  p.poly([[4, 8], [7, 3], [13, 2], [14, y - 5], [5, y - 5]], PAL.stone[4]);
  p.line(4, 8, 7, 3, PAL.stone[7]); p.line(5, 9, 5, y - 6, PAL.stone[6]);
  if (awake) glow(p, x, 15, 9, 12, r[5], 0.16);
  grid(p, 6, 9, 9, 13, awake ? r : PAL.stone, awake);
  p.rect(8, 24, 5, 1, awake ? r[6] : PAL.stone[3]);
  p.rect(3, y - 3, 4, 2, PAL[BIOME[biome]?.ground ?? 'grass'][3]);
  if (awake && frame === 1) sparkle(p, 14, 6, r[Math.min(7, r.length - 1)]);
}

function steps(p, x, y, w, r = PAL.stone) {
  p.rect(x - w / 2, y - 3, w, 3, r[2]); p.rect(x - w / 2, y - 4, w, 1, r[5]);
  p.rect(x - w / 2 + 3, y - 7, w - 6, 3, r[3]); p.rect(x - w / 2 + 3, y - 8, w - 6, 1, r[6]);
}

function shrine(p, d, zone, state, frame) {
  const x = d.ax, y = d.ay, sealed = state === 'sealed';
  const r = PAL[ACCENT[zone]], shine = sealed ? 3 : 6;
  shadow(p, x, y, d.w / 2 - 2, 4);
  steps(p, x, y, d.w - 6, zone === 6 ? PAL.gold : PAL.stone);
  if (!sealed) glow(p, x, y - 19, 14, 15, r[3], 0.16);
  if (zone === 0) {
    for (const side of [-1, 1]) {
      const xx = x + side * 14;
      p.poly([[xx - 4, y - 6], [xx - 2, 17], [xx + 2, 14], [xx + 4, y - 6]], PAL.wood[3]);
      p.line(xx - 2, y - 8, xx, 17, PAL.wood[5]);
      foliage(p, xx, 15, 8, 7, PAL.leaf, side + 5);
      foliage(p, x + side * 7, 9, 8, 7, PAL.leaf, side + 8);
      p.line(xx + side * 2, 22, xx + side * 4, 29, PAL.leaf[4]);
      p.rect(xx - 3, 19, 3, 2, PAL.rose[5]);
    }
    p.ellipse(x, y - 8, 11, 3, PAL.dirt[2]); p.ellipse(x, y - 9, 9, 2, PAL.dirt[4]);
    p.line(x, y - 10, x, y - 21, PAL.leaf[5]);
    p.ellipse(x - 4, y - 21, 5, 3, PAL.leaf[6]); p.ellipse(x + 4, y - 24, 5, 3, PAL.leaf[5]);
    p.set(x - 5, y - 22, PAL.leaf[7]);
  } else if (zone === 1) {
    for (const xx of [9, 36]) {
      p.rect(xx, 17, 4, 21, PAL.teal[2]); p.rect(xx, 17, 1, 21, PAL.teal[6]);
      crystal(p, xx + 1, 24, 6, 10, PAL.teal);
    }
    p.poly([[4, 18], [13, 9], [24, 3], [36, 9], [44, 18]], PAL.violet[3]);
    p.poly([[5, 17], [23, 4], [22, 16]], PAL.teal[6]); p.poly([[24, 4], [41, 16], [25, 16]], PAL.teal[3]);
    p.rect(5, 18, 38, 2, PAL.teal[7]); p.line(x, 19, x, 22, PAL.gold[5]);
    p.poly([[20, 23], [27, 23], [29, 31], [32, 33], [16, 33], [19, 30]], PAL.violet[4]);
    p.rect(20, 24, 3, 7, PAL.violet[7]); p.rect(17, 32, 14, 2, PAL.teal[6]); p.circle(x + CYCLE[frame], 35, 2, PAL.gold[6]);
  } else if (zone === 2) {
    p.ellipse(x, y - 9, 18, 5, PAL.water[3]); p.ellipse(x, y - 10, 16, 4, PAL.water[6]);
    p.ellipse(x - 3, y - 11, 10, 2, PAL.water[8]);
    for (const side of [-1, 1]) {
      const xx = x + side * 14;
      p.poly([[xx - 3, y - 9], [xx - 2, 20], [xx - 5, 13], [xx - 2, 11], [xx + 2, 19], [xx + 4, 34]], PAL.rose[3]);
      p.line(xx - 1, 15, xx, 35, PAL.rose[6]);
      p.line(xx, 22, xx + side * 6, 16, PAL.rose[4]); p.line(xx + side * 6, 16, xx + side * 5, 10, PAL.rose[5]);
      p.circle(xx - 1, 11, 3, PAL.rose[5]);
    }
    p.poly([[7, 13], [15, 8], [30, 9], [39, 5], [42, 9], [33, 14], [17, 13], [8, 17]], PAL.rose[4]);
    p.line(10, 12, 17, 9, PAL.rose[7]); p.line(18, 10, 30, 11, PAL.rose[6]);
    p.line(x, 14, x, 21, PAL.gold[5]); crystal(p, x, 28, 7, 10, PAL.water);
  } else if (zone === 3) {
    for (const xx of [10, 35]) {
      p.rect(xx, 7, 4, 31, PAL.wood[2]); p.rect(xx, 7, 1, 31, PAL.wood[6]);
      p.rect(xx - 2, 5, 8, 3, PAL.violet[4]); p.rect(xx - 2, 5, 8, 1, PAL.violet[7]);
    }
    p.rect(10, 10, 29, 4, PAL.wood[4]); p.rect(10, 10, 29, 1, PAL.wood[6]);
    for (let i = 0; i < 3; i++) {
      const xx = 18 + i * 7;
      p.line(xx, 14, xx + CYCLE[frame], 30, PAL.violet[5 + i]);
      p.rect(xx - 2, 28, 5, 7, PAL.cream[1]); p.rect(xx - 3, 28, 7, 1, PAL.wood[4]); p.rect(xx - 3, 34, 7, 1, PAL.wood[4]);
      p.rect(xx - 1, 29, 2, 5, PAL.violet[4 + i]);
    }
    p.line(17, 19, 31, 24, PAL.cream[2]); p.line(18, 25, 31, 20, PAL.violet[7]);
    p.poly([[24, 2], [28, 6], [24, 10], [20, 6]], PAL.violet[6]);
  } else if (zone === 4) {
    p.rect(10, 14, 28, 22, PAL.ash[3]); p.rect(11, 14, 25, 3, PAL.ash[5]);
    p.rect(14, 6, 8, 11, PAL.ash[2]); p.rect(14, 6, 3, 10, PAL.ash[5]); p.rect(12, 5, 12, 3, PAL.ash[4]);
    for (let row = 0; row < 4; row++) {
      const yy = 16 + row * 5;
      p.rect(11, yy, 26, 1, PAL.ash[2]);
      for (let xx = 11 + row % 2 * 4; xx < 37; xx += 8) {
        p.rect(xx, yy + 1, 1, 4, PAL.ash[2]); p.rect(xx + 1, yy + 1, 5, 1, PAL.ash[4]);
      }
    }
    p.poly([[16, 35], [16, 23], [20, 18], [29, 18], [33, 23], [33, 35]], PAL.ember[1]);
    p.rect(18, 26, 13, 8, PAL.ember[4]);
    for (let i = 0; i < 4; i++) p.poly([[18 + i * 3, 33], [19 + i * 3, 23 + (i + frame) % 3], [22 + i * 3, 33]], PAL.ember[6 + i % 2]);
    p.rect(13, 35, 22, 3, PAL.ash[2]); p.rect(14, 35, 21, 1, PAL.ash[6]);
    p.rect(27, 10, 10, 2, PAL.gold[4]); p.rect(31, 7, 2, 8, PAL.gold[5]);
  } else if (zone === 5) {
    for (const xx of [7, 35]) {
      p.rect(xx, 12, 6, 25, PAL.wood[2]); p.rect(xx, 12, 1, 25, PAL.wood[5]);
      for (let i = 0; i < 5; i++) { p.rect(xx + 1, 14 + i * 4, 4, 3, PAL.violet[3 + i % 3]); p.set(xx + 1, 14 + i * 4, PAL.gold[5]); }
    }
    p.rect(x - 3, 25, 6, 12, PAL.wood[3]); p.rect(x - 3, 25, 2, 12, PAL.wood[6]);
    p.poly([[12, 21], [23, 18], [24, 20], [25, 18], [36, 21], [34, 30], [24, 28], [14, 30]], PAL.violet[2]);
    p.poly([[13, 20], [23, 17], [24, 20], [24, 27], [14, 28]], PAL.cream[2]);
    p.poly([[25, 20], [26, 17], [35, 20], [34, 28], [25, 26]], PAL.cream[0]);
    for (let i = 0; i < 3; i++) { p.line(16, 21 + i * 2, 21, 20 + i * 2, PAL.wood[4]); p.line(27, 20 + i * 2, 31, 21 + i * 2, PAL.wood[3]); }
    p.rect(23, 18, 2, 12, PAL.roof[4]);
    p.rect(20 + CYCLE[frame], 6, 7, 1, PAL.gold[shine]); p.rect(20 + CYCLE[frame], 6, 1, 6, PAL.gold[shine]); p.rect(22 + CYCLE[frame], 9, 5, 1, PAL.gold[shine]);
  } else {
    steps(p, x, y - 7, 35, PAL.gold);
    p.rect(x - 6, 30, 12, 16, PAL.gold[3]); p.rect(x - 6, 30, 3, 16, PAL.gold[6]);
    for (const side of [-1, 1]) {
      p.poly([[x + side * 7, 39], [x + side * 20, 25], [x + side * 19, 14], [x + side * 13, 25], [x + side * 4, 30]], PAL.gold[4]);
      p.line(x + side * 7, 37, x + side * 18, 24, PAL.gold[7]);
      p.line(x + side * 17, 22, x + side * 21, 18, PAL.gold[6]);
    }
    crystal(p, x, 36, 13, 29, PAL.teal);
    p.line(x - 5, 15, x - 1, 19, PAL.teal[8]);
    p.line(x + 1, 23, x + 4, 19, PAL.teal[3]);
    for (let i = 0; i < 3; i++) p.rect(x + 1, 25 + i * 3, 3, 1, PAL.teal[6]);
    p.poly([[x, 1], [x + 5, 7], [x, 12], [x - 5, 7]], PAL.gold[6]); p.set(x - 1, 5, PAL.gold[8]);
    grid(p, x - 8, 43, 16, 7, PAL.gold, !sealed);
  }
  if (sealed) {
    // A low-bit lattice is a seal, not another opaque building silhouette.
    const cy = y - 22;
    for (let yy = cy - 5; yy < cy + 9; yy++) for (let xx = x - 8; xx <= x + 8; xx++) {
      if ((xx + yy) % 4 === 0) p.set(xx, yy, PAL.violet[2]);
    }
    p.rect(x - 3, cy, 7, 6, PAL.violet[2]); p.rect(x - 2, cy - 3, 5, 1, PAL.violet[5]);
    p.rect(x - 2, cy - 2, 1, 3, PAL.violet[5]); p.rect(x + 2, cy - 2, 1, 3, PAL.violet[4]); p.set(x, cy + 2, PAL.violet[6]);
  } else if (state === 'restored') {
    sparkle(p, x - 12, y - 26 + CYCLE[frame], r[Math.min(7, r.length - 1)]);
    p.rect(x + 13, y - 15, 2, 2, PAL.gold[6]); p.rect(x - 16, y - 7, 3, 2, r[5]);
    p.line(x - 8, y - 2, x + 8, y - 2, r[5]);
  }
}

function smallProp(p, d, kind, biome, variant, state, frame) {
  const x = d.ax, y = d.ay, leaf = PAL[BIOME[biome]?.foliage ?? 'leaf'], accent = PAL[BIOME[biome]?.accent ?? 'gold'];
  if (kind !== 'shard' && kind !== 'stone-float') shadow(p, x, y, Math.max(3, d.w / 2 - 2), 2);
  switch (kind) {
    case 'bush': foliage(p, 5, 8, 5, 4, leaf, variant); foliage(p, 10, 6, 5, 5, leaf, variant + 2); if (variant % 2) p.rect(9, 7, 2, 2, accent[5]); break;
    case 'rock-s': case 'rock-l': stone(p, x, y, d.w - 2, d.h - 3, biome === 'forge' ? PAL.ash : PAL.stone, variant); if (biome === 'heights') p.line(x - 4, 3, x + 2, 2, PAL.snow[4]); break;
    case 'stump':
      p.rect(2, 4, 10, 4, PAL.wood[3]); p.rect(3, 4, 2, 4, PAL.wood[5]); p.ellipse(7, 4, 6, 3, PAL.wood[2]); p.ellipse(7, 3, 5, 2, PAL.wood[6]); p.line(4, 3, 8, 3, PAL.wood[4]); p.set(8, 2, PAL.wood[4]); break;
    case 'mushroom':
      p.rect(3, 3, 2, 4, PAL.cream[1]); p.ellipse(4, 3, 4, 3, PAL.rose[2]); p.ellipse(3, 2, 3, 2, PAL.rose[5]); p.set(2, 1, PAL.cream[3]); p.set(5, 2, PAL.cream[2]); break;
    case 'reeds':
      for (let i = 0; i < 4; i++) { const xx = 2 + i * 2; p.line(xx, y, xx + (i % 2 ? 1 : -1), 3 + i % 3, leaf[i % 2 ? 5 : 3]); p.rect(xx - 1, 1 + i % 3, 2, 3, PAL.dirt[3]); } break;
    case 'flowerbed':
      for (let i = 0; i < 5; i++) { const xx = 2 + i * 3, yy = 3 + i % 2 * 2; p.line(xx, yy, xx, y, leaf[4]); p.rect(xx - 1, yy, 3, 2, accent[i % 2 ? 5 : 6]); p.set(xx, yy, PAL.cream[3]); } break;
    case 'fence-h': case 'fence-v': {
      const vertical = kind === 'fence-v';
      if (vertical) { p.rect(2, 2, 2, 14, PAL.wood[3]); p.rect(2, 2, 1, 14, PAL.wood[6]); }
      else { p.rect(0, 3, 16, 2, PAL.wood[5]); p.rect(0, 7, 16, 2, PAL.wood[3]); p.rect(0, 3, 16, 1, PAL.wood[6]); }
      for (const [xx, yy] of vertical ? [[1, 0], [1, 10]] : [[2, 1], [12, 1]]) { p.rect(xx, yy, 3, 10, PAL.wood[2]); p.rect(xx, yy, 1, 9, PAL.wood[6]); p.set(xx + 1, yy + 3, PAL.stone[5]); }
      break;
    }
    case 'sign':
      p.rect(x - 1, 7, 3, 8, PAL.wood[3]); p.rect(1, 2, 12, 7, PAL.wood[2]); p.rect(1, 2, 11, 5, PAL.wood[6]); p.line(3, 4, 9, 4, PAL.wood[2]); p.line(7, 3, 10, 4, PAL.wood[2]); p.line(7, 5, 10, 4, PAL.wood[2]); break;
    case 'lamp': case 'lantern': {
      const yy = kind === 'lamp' ? 4 : 3;
      glow(p, x, yy + 3, 5, 6, PAL.gold[5], 0.3);
      if (kind === 'lamp') { p.rect(x, 11, 2, y - 10, PAL.wood[2]); p.rect(x, 12, 1, y - 11, PAL.wood[5]); p.rect(x - 2, y - 1, 5, 1, PAL.stone[4]); }
      p.rect(x - 2, yy - 2, 4, 2, PAL.wood[2]); p.rect(x - 3, yy, 6, 7, PAL.wood[2]); p.rect(x - 2, yy + 1, 4, 4, PAL.gold[6]); p.rect(x - 1, yy + 1, 1, 3, PAL.gold[8]); p.rect(x - 3, yy + 7, 6, 1, PAL.wood[5]); break;
    }
    case 'campfire':
      p.ellipse(x, y - 2, 7, 3, PAL.stone[2]); p.ellipse(x, y - 3, 5, 2, PAL.ember[2]);
      p.line(3, 9, 12, 12, PAL.wood[5]); p.line(12, 9, 4, 12, PAL.wood[3]);
      p.poly([[4, 10], [5, 5], [8 + CYCLE[frame], 0], [10, 6], [12, 4], [12, 10], [9, 12]], PAL.ember[5]);
      p.poly([[6, 10], [8, 4], [10, 8], [10, 11]], PAL.ember[7]); p.rect(7, 8, 2, 3, PAL.ember[9]); break;
    case 'tent':
      p.poly([[1, y], [13, 3], [22, 3], [31, y]], PAL.sky[2]); p.poly([[3, y - 1], [13, 4], [23, y - 1]], PAL.roof[4]); p.poly([[13, 4], [21, 4], [29, y - 1], [23, y - 1]], PAL.roof[2]);
      p.poly([[8, y - 1], [13, 10], [18, y - 1]], PAL.wood[1]); p.line(3, y - 1, 13, 4, PAL.roof[6]); p.line(13, 4, 23, y - 1, PAL.roof[5]); p.rect(0, y - 2, 2, 3, PAL.wood[5]); p.rect(30, y - 2, 2, 3, PAL.wood[5]); break;
    case 'well':
      p.ellipse(x, y - 2, 9, 4, PAL.stone[3]); p.rect(1, y - 8, 18, 6, PAL.stone[4]); p.ellipse(x, y - 8, 9, 4, PAL.stone[6]); p.ellipse(x, y - 8, 6, 2, PAL.water[1]);
      p.rect(3, 4, 2, 13, PAL.wood[4]); p.rect(15, 4, 2, 13, PAL.wood[3]); p.rect(2, 4, 16, 2, PAL.wood[6]); p.line(x, 5, x, 13, PAL.cream[0]); roof(p, 0, 0, 20, 6, PAL.roof); break;
    case 'dock':
      p.rect(0, 3, 32, 10, PAL.wood[2]); for (let i = 0; i < 8; i++) { p.rect(i * 4, 3, 3, 10, PAL.wood[4 + i % 2]); p.rect(i * 4, 3, 3, 1, PAL.wood[6]); }
      for (const xx of [1, 28]) { p.rect(xx, 1, 3, 14, PAL.wood[2]); p.rect(xx, 1, 2, 2, PAL.wood[6]); } break;
    case 'boat':
      p.poly([[1, 8], [9, 3], [24, 3], [31, 8], [25, 15], [8, 15]], PAL.wood[2]); p.poly([[2, 7], [10, 2], [24, 2], [30, 7], [24, 11], [9, 11]], PAL.wood[5]); p.poly([[6, 7], [11, 4], [23, 4], [27, 7], [22, 9], [11, 9]], PAL.wood[1]); p.rect(12, 4, 3, 6, PAL.wood[6]); p.line(10, 2, 22, 15, PAL.wood[7]); break;
    case 'cache':
      p.rect(1, 4, 12, 6, PAL.wood[2]); p.rect(2, 5, 10, 4, PAL.wood[4]); p.poly([[1, 5], [2, 1], [11, 1], [13, 5]], PAL.wood[5]); p.line(3, 1, 10, 1, PAL.wood[7]); p.rect(3, 2, 1, 7, PAL.gold[4]); p.rect(10, 2, 1, 7, PAL.gold[3]); p.rect(6, 5, 3, 3, PAL.gold[6]); p.set(7, 6, PAL.wood[1]);
      if (state === 'open') { p.rect(2, 3, 10, 3, PAL.wood[1]); p.rect(3, 4, 8, 1, PAL.gold[5]); } break;
    case 'shard':
      glow(p, x, 5, 5, 6, PAL.teal[5], 0.23); crystal(p, x, 10, 8, 9, PAL.teal);
      if (frame % 2) { p.rect(4, 3, 2, 4, PAL.teal[2]); p.rect(4, 3, 1, 4, PAL.cream[3]); }
      else { p.rect(3, 3, 4, 4, PAL.teal[2]); p.rect(4, 3, 2, 1, PAL.cream[3]); p.rect(4, 6, 2, 1, PAL.cream[3]); p.rect(3, 4, 1, 2, PAL.cream[3]); p.rect(6, 4, 1, 2, PAL.cream[3]); } break;
    case 'pedestal':
      p.rect(4, 7, 8, 9, PAL.stone[3]); p.rect(4, 7, 2, 9, PAL.stone[6]); p.rect(8, 8, 1, 7, PAL.teal[4]);
      p.rect(1, 15, 14, 3, PAL.stone[2]); p.rect(2, 14, 12, 1, PAL.stone[5]);
      p.poly([[1, 6], [5, 2], [13, 2], [15, 6], [11, 8], [3, 8]], PAL.stone[5]); grid(p, 4, 3, 8, 4, PAL.teal, true); break;
    case 'stone-float':
      stone(p, x, y - 1, 15, 7, PAL.stone, variant); p.line(3, 3, 10, 2, PAL.teal[6]); p.rect(6, 7, 4, 1, PAL.teal[4]); break;
    case 'bookshelf':
      p.rect(1, 1, 22, 29, PAL.wood[1]); p.rect(2, 2, 2, 27, PAL.wood[5]); p.rect(20, 2, 2, 27, PAL.wood[3]);
      for (let row = 0; row < 3; row++) { for (let i = 0; i < 5; i++) { const r = [PAL.roof, PAL.teal, PAL.gold, PAL.violet, PAL.sky][(i + row + variant) % 5]; const yy = 4 + row * 8; p.rect(5 + i * 3, yy, 2, 6, r[4]); p.set(5 + i * 3, yy + 1, r[6]); } p.rect(3, 10 + row * 8, 18, 2, PAL.wood[4]); p.rect(3, 10 + row * 8, 18, 1, PAL.wood[6]); }
      p.rect(1, 1, 22, 2, PAL.wood[6]); break;
    case 'pillar':
      p.rect(4, 5, 8, 25, PAL.stone[3]); p.rect(4, 5, 3, 25, PAL.stone[6]); p.rect(8, 5, 1, 25, PAL.stone[5]); p.rect(2, 2, 12, 4, PAL.stone[4]); p.rect(2, 2, 12, 1, PAL.stone[7]); steps(p, x, y, 16); p.line(10, 16, 8, 20, PAL.stone[2]); break;
    case 'anvil':
      p.poly([[1, 3], [18, 3], [17, 6], [12, 7], [12, 10], [16, 11], [16, 12], [5, 12], [5, 10], [8, 9], [8, 7], [3, 6]], PAL.stone[2]); p.rect(2, 3, 16, 2, PAL.stone[6]); p.rect(8, 6, 3, 4, PAL.stone[4]); p.line(3, 3, 16, 3, PAL.stone[7]); break;
    case 'furnace':
      p.rect(4, 12, 24, 21, PAL.ash[3]); p.rect(5, 12, 4, 20, PAL.ash[5]); p.rect(8, 2, 8, 12, PAL.ash[3]); p.rect(7, 1, 10, 3, PAL.ash[5]);
      for (let yy = 16; yy < 32; yy += 5) { p.rect(4, yy, 24, 1, PAL.ash[2]); for (let xx = 6 + yy % 3; xx < 27; xx += 7) p.rect(xx, yy, 1, 4, PAL.ash[2]); }
      p.poly([[10, 31], [10, 22], [14, 18], [22, 19], [25, 23], [25, 31]], PAL.ember[1]); p.rect(12, 25, 11, 6, PAL.ember[4]);
      p.poly([[13, 30], [14 + CYCLE[frame], 22], [18, 27], [21, 23], [22, 30]], PAL.ember[7]); p.rect(11, 31, 14, 2, PAL.ash[2]); break;
    case 'crystal-cluster':
      crystal(p, x - 5, y, 7, 12, PAL.violet); crystal(p, x + 5, y, 7, 14, PAL.teal); crystal(p, x, y - 2, 8, 18, PAL.teal); break;
    case 'statue':
      steps(p, x, y, 18); p.poly([[5, 25], [7, 11], [13, 11], [16, 25]], PAL.stone[3]); p.poly([[6, 24], [8, 12], [10, 12], [10, 24]], PAL.stone[5]);
      p.ellipse(10, 8, 5, 6, (xx, yy, nx, ny, nz) => shadeRamp(PAL.stone, 0.3 + lambert(nx, ny, nz) * 0.45)); p.rect(7, 8, 2, 1, PAL.stone[2]); p.rect(11, 8, 2, 1, PAL.stone[2]); p.rect(3, 12, 2, 17, PAL.gold[4]); grid(p, 1, 9, 7, 5, PAL.teal, true); break;
    case 'banner':
      p.rect(2, 1, 2, 25, PAL.wood[3]); p.rect(2, 1, 1, 25, PAL.wood[6]); p.rect(1, 2, 10, 2, PAL.gold[5]); p.poly([[4, 4], [11, 4], [11, 19], [8, 17], [4, 20]], accent[3]); p.rect(4, 4, 2, 12, accent[5]); p.rect(7, 8, 3, 1, accent[7]); p.rect(8, 7, 1, 4, accent[7]); break;
  }
}

function gate(p, d, frame) {
  const r = [PAL.night[1], PAL.violet[2], PAL.violet[5], PAL.teal[6]];
  shadow(p, d.ax, d.ay, 23, 3);
  for (let y = 3; y < 28; y++) {
    const shift = y % 7 === frame % 7 ? 3 : 0;
    for (let x = 4; x < 44; x += 2) {
      const noise = hash2(Math.floor(x / 4), Math.floor(y / 3), frame);
      p.rect(x + shift, y, 2, 1, r[noise < 0.48 ? 0 : noise < 0.76 ? 1 : noise < 0.95 ? 2 : 3]);
    }
    if (y % 5 === 0) p.rect(5, y, 38, 1, PAL.violet[1]);
  }
  for (const x of [1, 43]) {
    p.rect(x, 7, 4, 23, PAL.stone[2]); p.rect(x, 7, 1, 22, PAL.stone[5]);
    p.rect(x - 1, 5, 6, 3, PAL.stone[4]); p.rect(x, 3, 3, 3, PAL.violet[6]);
  }
  p.rect(6, 28, 36, 1, PAL.violet[5]);
}

function paintProp(p, kind, d, biome, variant, state, frame) {
  if (kind.startsWith('tree-')) drawTree(p, kind, d, biome, variant, frame);
  else if (kind.startsWith('house-')) house(p, d, kind, biome, variant);
  else if (kind === 'lighthouse') lighthouse(p, d, frame);
  else if (kind === 'gridstone') gridstone(p, d, biome, state, frame);
  else if (kind.startsWith('shrine-')) shrine(p, d, Number(kind.slice(-1)), state, frame);
  else if (kind === 'gate') gate(p, d, frame);
  else smallProp(p, d, kind, biome, variant, state, frame);
}

const ANIMATED = new Set(['tree-oak', 'tree-pine', 'tree-palm', 'tree-willow', 'tree-crystal', 'lighthouse', 'gridstone', 'shard', 'campfire', 'furnace', 'gate', ...Array.from({ length: 7 }, (_, i) => `shrine-${i}`)]);

/** (x,y) is ground contact. Additive opts: reduced freezes decorative animation;
 * progress (0..1) controls gate opening independently of t. Without progress, an
 * opening gate treats t as elapsed seconds and dissolves completely at 1.6 s.
 * stone-float state 'solved' rests level at its anchor; other states bob. */
export function drawProp(ctx, kind, x, y, { t = 0, variant = 0, biome = 'meadow', state = '', reduced = false, progress } = {}) {
  const d = PROPS[kind];
  if (!d) return;
  biome = BIOME[biome] ? biome : 'meadow';
  // A bounded four-variant/four-frame cache, even when map seeds are arbitrary.
  variant = typeof variant === 'number' ? mod(Math.floor(variant), 4) : mod(String(variant).split('').reduce((a, c) => a + c.charCodeAt(0), 0), 4);
  const frame = reduced || !ANIMATED.has(kind) ? 0 : mod(Math.floor(t * (kind === 'gate' ? 7 : kind === 'campfire' || kind === 'furnace' ? 6 : 2.2)), 4);
  const sprite = spriteCache(`world:${kind}:${biome}:${variant}:${state}:${frame}`, d.w, d.h, (p) => paintProp(p, kind, d, biome, variant, state, frame));
  const xx = Math.round(x - d.ax), yy = Math.round(y - d.ay);
  if (kind === 'gate' && state === 'opening') {
    const dissolve = Math.max(0, Math.min(1, progress ?? t / 1.6));
    if (dissolve >= 1) return;
    for (let sy = 0; sy < d.h; sy += 2) {
      if (hash2(sy, 1, 8) < dissolve) continue;
      const jitter = reduced ? 0 : Math.round(Math.sin(sy + t * 13) * dissolve * 7);
      ctx.drawImage(sprite, 0, sy, d.w, 2, xx + jitter, yy + sy, d.w, 2);
    }
  } else if (kind === 'shard' || kind === 'stone-float') {
    const shade = spriteCache(`world:float-shadow:${kind}`, d.w, 6, (p) => shadow(p, d.ax, 3, kind === 'shard' ? 4 : 7, 2));
    ctx.drawImage(shade, xx, Math.round(y - 3));
    const lift = kind === 'stone-float' && state === 'solved' ? 0 : reduced ? 2 : 2 + Math.round(Math.sin(t * 2 + variant) * 1.5);
    ctx.drawImage(sprite, xx, yy - lift);
  } else ctx.drawImage(sprite, xx, yy);
  if (!reduced && (kind.startsWith('house-') || kind === 'furnace')) {
    const smoke = spriteCache('world:chimney-smoke', 8, 8, (p) => { p.ellipseDither(4, 4, 4, 3, PAL.ash[6], 0.28); });
    const chimneyX = kind === 'furnace' ? 12 : d.w - 12;
    for (let i = 0; i < 2; i++) {
      const age = mod(t * 4 + i * 6, 12);
      const alpha = ctx.globalAlpha;
      ctx.globalAlpha = alpha * (1 - age / 15);
      ctx.drawImage(smoke, xx + chimneyX - 4 + Math.floor(age / 4), yy + 1 - Math.floor(age));
      ctx.globalAlpha = alpha;
    }
  }
}

const NATURE = ['tree-oak', 'tree-pine', 'tree-palm', 'tree-willow', 'tree-dead', 'tree-crystal', 'bush', 'rock-s', 'rock-l', 'stump', 'mushroom', 'reeds', 'flowerbed'];
const WORKSHOP = ['bookshelf', 'pillar', 'anvil', 'furnace', 'lantern', 'banner'];
const COAST = ['campfire', 'tent', 'well', 'dock', 'boat', 'cache', 'lamp', 'sign', 'fence-h', 'fence-v'];
export const PROP_GALLERY_PAGES = 16;

export const galleries = {
  props(ctx, screen, t, page = 0) {
    const index = mod(page, PROP_GALLERY_PAGES);
    const portrait = screen.w < 300;
    let biome = index < 8 ? BIOMES[index] : 'point';
    let title = `${biome} / field collection`;
    let items = NATURE.map((kind, i) => ({ kind, variant: i % 4 }));
    let cols = portrait ? 3 : 7;
    if (index === 8) { title = 'Lighthouse Point / homes'; items = ['lighthouse', 'house-a', 'house-b', 'house-c'].map((kind) => ({ kind })); cols = portrait ? 2 : 4; }
    if (index === 9) { title = 'Workshop / warm corners'; items = WORKSHOP.map((kind) => ({ kind })); cols = portrait ? 3 : 6; }
    if (index === 10) { title = 'Camp / shore / village'; items = COAST.map((kind) => ({ kind })); cols = portrait ? 3 : 5; }
    if (index === 11) { title = 'Grid Stones / asleep → awake'; items = BIOMES.flatMap((b) => ['dormant', 'awake'].map((state) => ({ kind: 'gridstone', biome: b, state, label: `${b} ${state === 'awake' ? '+' : '-'}` }))); cols = portrait ? 4 : 8; }
    if (index >= 12 && index <= 14) { const state = ['sealed', 'open', 'restored'][index - 12]; title = `Seven sanctuaries / ${state}`; items = Array.from({ length: 7 }, (_, i) => ({ kind: `shrine-${i}`, biome: BIOMES[i + 1], state })); cols = portrait ? 2 : 4; biome = 'archives'; }
    if (index === 15) { title = 'Bits / bridges / lost relics'; items = [{ kind: 'gate', state: 'closed', label: 'gate sealed' }, { kind: 'gate', state: 'opening', label: 'dissolving' }, ...['shard', 'pedestal', 'stone-float', 'crystal-cluster', 'statue'].map((kind) => ({ kind }))]; cols = portrait ? 3 : 4; biome = 'spire'; }
    const rows = Math.ceil(items.length / cols), cw = Math.floor(screen.w / cols), ch = Math.floor((screen.h - 44) / rows);
    ctx.fillStyle = PAL.night[1]; ctx.fillRect(0, 0, screen.w, screen.h);
    drawText(ctx, title, 8, 7, { color: PAL.cream[2] });
    items.forEach((item, i) => {
      const col = i % cols, row = Math.floor(i / cols), xx = col * cw, yy = 25 + row * ch;
      const ground = PAL[BIOME[item.biome ?? biome].ground];
      ctx.fillStyle = PAL.night[2]; ctx.fillRect(xx + 2, yy, cw - 4, ch - 4);
      ctx.fillStyle = ground[2]; ctx.fillRect(xx + 3, yy + ch - 20, cw - 6, 10);
      ctx.fillStyle = ground[3]; ctx.fillRect(xx + 3, yy + ch - 20, cw - 6, 1);
      const anchor = yy + ch - 15;
      drawProp(ctx, item.kind, xx + Math.floor(cw / 2), anchor, { t, biome, ...item, progress: item.state === 'opening' ? mod(t, 2.2) / 2.2 : undefined });
      drawText(ctx, item.label ?? item.kind.replace('tree-', '').replace('house-', 'house '), xx + Math.floor(cw / 2), yy + ch - 10, { font: 'small', color: PAL.ui.dim, align: 'center' });
    });
  },
};
