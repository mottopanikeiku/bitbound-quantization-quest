// World-aligned 16 px terrain. Neighbour samples cross chunk boundaries so cached
// chunks join without seams; animation never repaints the static terrain buffer.
import { PAL, BIOME } from './palette.js';
import { Pix, u32, bayer, mix } from './paint.js';
import { fbm, hash2, makeCanvas } from '../engine/util.js';
import { drawText } from '../engine/font.js';

export const TERRAIN_TYPES = ['void', 'deep', 'water', 'sand', 'grass', 'tallgrass', 'flowers', 'path', 'stone', 'cliff', 'bridge', 'ash', 'lava', 'ruin', 'crystal', 'snow', 'plank'];
const BLOCKED = new Set(['void', 'deep', 'water', 'cliff', 'lava']);
const GREEN = new Set(['grass', 'tallgrass', 'flowers']);
const WET = new Set(['water', 'deep']);
const RAMPS = Object.fromEntries(Object.entries(PAL).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.map(u32)]));
const WORN_PATH = RAMPS.dirt.map((c, i) => u32(mix(c, RAMPS.dirt[Math.max(0, i - 1)], 0.38)));
// Floors carry the scene; their small value range leaves the bright/dark limits
// to raised architecture and interactables. All tones mix neighbouring ramps.
const closeRamp = (r, dark, stops) => stops.map((v) => u32(mix(r[dark], r[dark + 1], v)));
const FLOOR_STONE = closeRamp(RAMPS.stone, 3, [0.2, 0.36, 0.46, 0.64]);
const FLOOR_FROST = closeRamp(RAMPS.snow, 1, [0.23, 0.38, 0.5, 0.62]);
const FLOOR_ASH = closeRamp(RAMPS.ash, 3, [0.16, 0.3, 0.42, 0.6]);
const FLOOR_WOOD = closeRamp(RAMPS.wood, 2, [0.5, 0.64, 0.77, 0.94]);
const BRIDGE_WOOD = closeRamp(RAMPS.wood, 3, [0.1, 0.32, 0.57, 0.84]);
const FLOOR_CRYSTAL = closeRamp(RAMPS.teal, 2, [0, 0.16, 0.29, 0.46, 0.61]);
const TEXTURE = new Map([...Object.values(RAMPS), FLOOR_CRYSTAL].map((r) => [r, r.map((c, i) => [
  u32(mix(c, r[Math.max(0, i - 1)], 0.45)), c,
  u32(mix(c, r[Math.min(r.length - 1, i + 1)], 0.38)),
])]));
TEXTURE.set(WORN_PATH, WORN_PATH.map((c, i) => [
  u32(mix(c, WORN_PATH[Math.max(0, i - 1)], 0.45)), c,
  u32(mix(c, WORN_PATH[Math.min(WORN_PATH.length - 1, i + 1)], 0.38)),
]));
const BIOMES = Object.keys(BIOME);
const mod = (n, d) => ((n % d) + d) % d;

export function isWalkable(type) { return !BLOCKED.has(type); }

function rampFor(type, biome) {
  if (GREEN.has(type)) return RAMPS[BIOME[biome]?.ground ?? 'grass'];
  if (type === 'water' || type === 'deep' || type === 'bridge') return RAMPS.water;
  if (type === 'sand') return RAMPS.sand;
  if (type === 'path') return biome === 'forge' ? RAMPS.ash : WORN_PATH;
  if (type === 'ash') return RAMPS.ash;
  if (type === 'lava') return RAMPS.ember;
  if (type === 'snow') return RAMPS.snow;
  if (type === 'crystal') return FLOOR_CRYSTAL;
  if (type === 'plank') return RAMPS.wood;
  if (type === 'void') return RAMPS.night;
  return biome === 'forge' ? RAMPS.ash : RAMPS.stone;
}

function baseTone(type, biome) {
  if (type === 'void') return 0;
  if (type === 'deep') return 2;
  if (type === 'water' || type === 'bridge') return biome === 'cove' ? 5 : 4;
  if (type === 'sand') return 5;
  if (type === 'snow') return 3;
  if (type === 'crystal') return 2;
  if (type === 'lava') return 4;
  if (GREEN.has(type)) return biome === 'point' || biome === 'meadow' ? 4 : 3;
  if (type === 'path') return 4;
  return 3;
}

function grassClump(p, x, y, r, bright = false) {
  p.line(x - 2, y - 2, x, y, r[2]);
  p.line(x + 3, y - 3, x + 1, y, r[3]);
  p.line(x, y - 4, x + 1, y, r[bright ? 5 : 4]);
  p.set(x - 1, y - 3, r[bright ? 6 : 5]);
}

function clippedLine(p, x0, y0, x1, y1, color, left, top) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    if (x0 >= left && x0 < left + 16 && y0 >= top && y0 < top + 16) p.data[y0 * p.w + x0] = color;
    if (x0 === x1 && y0 === y1) break;
    const twice = error * 2;
    if (twice >= dy) { error += dy; x0 += sx; }
    if (twice <= dx) { error += dx; y0 += sy; }
  }
}

// Shared scratch polygon: eight bevelled corners of a jittered flagstone.
// Raster spans are clipped to the current tile, so adjacent materials and chunks
// can independently paint the same world-space slab without overdraw or seams.
const slab = new Float64Array(16);
const crossings = new Float64Array(8);
function clippedSlab(p, color, left, top) {
  for (let y = top; y < top + 16; y++) {
    let count = 0;
    for (let i = 0, j = 14; i < 16; j = i, i += 2) {
      if ((slab[i + 1] > y + 0.5) === (slab[j + 1] > y + 0.5)) continue;
      crossings[count++] = slab[i] + (y + 0.5 - slab[i + 1]) * (slab[j] - slab[i]) / (slab[j + 1] - slab[i + 1]);
    }
    if (count < 2) continue;
    const a = Math.max(left, Math.ceil(Math.min(crossings[0], crossings[1]) - 0.5));
    const b = Math.min(left + 15, Math.floor(Math.max(crossings[0], crossings[1]) - 0.5));
    if (a <= b) p.data.fill(color, y * p.w + a, y * p.w + b + 1);
  }
}

function flagstones(p, wx, wy, px, py, biome, ruined) {
  const floor = biome === 'heights' ? FLOOR_FROST : biome === 'forge' ? FLOOR_ASH : FLOOR_STONE;
  const sx = biome === 'heights' ? 36 : 32, sy = biome === 'heights' ? 30 : 26;
  p.rect(px, py, 16, 16, floor[0]);
  const offX = px - wx, offY = py - wy;
  for (let gy = Math.floor((wy - 6) / sy); gy <= Math.floor((wy + 21) / sy); gy++) {
    for (let gx = Math.floor((wx - 6) / sx); gx <= Math.floor((wx + 21) / sx); gx++) {
      const ax = gx * sx + hash2(gx, gy, 201) * 10 - 5 + offX;
      const ay = gy * sy + hash2(gx, gy, 202) * 10 - 5 + offY;
      const bx = (gx + 1) * sx + hash2(gx + 1, gy, 201) * 10 - 5 + offX;
      const by = gy * sy + hash2(gx + 1, gy, 202) * 10 - 5 + offY;
      const cx = (gx + 1) * sx + hash2(gx + 1, gy + 1, 201) * 10 - 5 + offX;
      const cy = (gy + 1) * sy + hash2(gx + 1, gy + 1, 202) * 10 - 5 + offY;
      const dx = gx * sx + hash2(gx, gy + 1, 201) * 10 - 5 + offX;
      const dy = (gy + 1) * sy + hash2(gx, gy + 1, 202) * 10 - 5 + offY;
      const mx = (ax + bx + cx + dx) / 4, my = (ay + by + cy + dy) / 4;
      slab[0] = ax * 0.9 + dx * 0.1; slab[1] = ay * 0.9 + dy * 0.1;
      slab[2] = ax * 0.9 + bx * 0.1; slab[3] = ay * 0.9 + by * 0.1;
      slab[4] = bx * 0.9 + ax * 0.1; slab[5] = by * 0.9 + ay * 0.1;
      slab[6] = bx * 0.9 + cx * 0.1; slab[7] = by * 0.9 + cy * 0.1;
      slab[8] = cx * 0.9 + bx * 0.1; slab[9] = cy * 0.9 + by * 0.1;
      slab[10] = cx * 0.9 + dx * 0.1; slab[11] = cy * 0.9 + dy * 0.1;
      slab[12] = dx * 0.9 + cx * 0.1; slab[13] = dy * 0.9 + cy * 0.1;
      slab[14] = dx * 0.9 + ax * 0.1; slab[15] = dy * 0.9 + ay * 0.1;
      for (let i = 0; i < 16; i += 2) { slab[i] += (mx - slab[i]) * 0.02; slab[i + 1] += (my - slab[i + 1]) * 0.02; }
      const seed = hash2(gx, gy, 204), shade = seed < 0.3 ? 1 : 2;
      clippedSlab(p, floor[shade], px, py);
      if (seed < 0.24) clippedLine(p, slab[2], slab[3] + 1, slab[4], slab[5] + 1, floor[3], px, py);
      if (ruined && seed < 0.12) clippedLine(p, mx - 3, my - 2, mx + 1, my + 2, floor[0], px, py);
    }
  }
}

function tallGrass(p, map, wx, wy, px, py, ramp) {
  for (let gy = Math.floor((wy - 2) / 9); gy <= Math.floor((wy + 23) / 9); gy++) {
    for (let gx = Math.floor((wx - 4) / 9); gx <= Math.floor((wx + 19) / 9); gx++) {
      const seed = hash2(gx, gy, 140);
      if (seed < 0.23 || hash2(Math.floor(gx / 3), Math.floor(gy / 3), 143) > 0.8) continue;
      const cx = gx * 9 + 2 + Math.floor(seed * 5), cy = gy * 9 + 2 + Math.floor(hash2(gx, gy, 141) * 5);
      if (map.get(Math.floor(cx / 16), Math.floor(cy / 16)) !== 'tallgrass') continue;
      const localX = cx - wx, localY = cy - wy;
      const x = px + localX, y = py + localY, height = 4 + Math.floor(hash2(gx, gy, 142) * 4);
      clippedLine(p, x - 3, y - height + 2, x, y, ramp[3], px, py);
      clippedLine(p, x + 3, y - height, x + 1, y, ramp[3], px, py);
      clippedLine(p, x, y - height, x + 1, y, ramp[4], px, py);
      clippedLine(p, x - 1, y - height + 1, x, y - 1, ramp[5], px, py);
      if (seed > 0.75) clippedLine(p, x + 2, y - height + 1, x + 1, y - 2, ramp[5], px, py);
    }
  }
}

// Distance to unlike neighbours, with a rounded diagonal at concave corners.
function boundaryDistance(x, y, mask) {
  let d = 24;
  if (mask & 1) d = Math.min(d, y);
  if (mask & 2) d = Math.min(d, 15 - x);
  if (mask & 4) d = Math.min(d, 15 - y);
  if (mask & 8) d = Math.min(d, x);
  if (mask & 16) d = Math.min(d, x + y + 1);
  if (mask & 32) d = Math.min(d, 16 - x + y);
  if (mask & 64) d = Math.min(d, 31 - x - y);
  if (mask & 128) d = Math.min(d, x + 16 - y);
  return d;
}
const landBank = (v) => !WET.has(v) && v !== 'void' && v !== 'bridge' && v !== 'plank';

// Separate material painters keep the hot tile dispatcher small on first use.
function paintLand(p, map, type, biome, tx, ty, px, py, ramp, tone, n, grassMask, sandMask, hasTall) {
  if (type !== 'path' && type !== 'sand' && !GREEN.has(type)) return;
  const wx = tx * 16, wy = ty * 16, colors = TEXTURE.get(ramp)[tone];
  const edgeMask = type === 'path' || type === 'sand' ? grassMask : sandMask;
  const edge = edgeMask !== 0;
  if (edge && !GREEN.has(type)) {
    const other = rampFor('grass', biome);
    const otherTone = baseTone('grass', biome);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = boundaryDistance(x, y, edgeMask);
      const jag = (type === 'path' ? 2 : 1) + Math.floor(hash2(Math.floor((wx + x) / 4), Math.floor((wy + y) / 4), 39) * (type === 'path' ? 4 : 3));
      if (d < jag) p.set(px + x, py + y, other[otherTone]);
      else if (d === jag && type === 'path') p.set(px + x, py + y, colors[0]);
    }
  }
  if (GREEN.has(type)) {
    const cluster = hash2(Math.floor(tx / 2), Math.floor(ty / 2), 90);
    const count = type === 'tallgrass' ? 0 : cluster < 0.35 ? 2 : 0;
    for (let i = 0; i < count; i++) {
      const x = 3 + Math.floor(hash2(tx, ty, i + 43) * 9);
      const y = 5 + Math.floor(hash2(tx, ty, i + 54) * 10);
      if (!edge || boundaryDistance(x, y, sandMask) > 4) grassClump(p, px + x, py + y, ramp, type === 'tallgrass');
    }
    if (type === 'flowers' || (cluster < 0.12 && hash2(tx, ty, 7) < 0.5)) {
      const accent = RAMPS[BIOME[biome]?.accent ?? 'rose'];
      for (let i = 0; i < 3; i++) {
        const x = 4 + Math.floor(hash2(tx, ty, 63 + i) * 9);
        const y = 6 + Math.floor(hash2(tx, ty, 71 + i) * 8);
        if (edge && boundaryDistance(x, y, sandMask) < 4) continue;
        p.rect(px + x, py + y, 1, 3, ramp[2]);
        p.rect(px + x - 1, py + y - 1, 3, 2, accent[i % 2 ? 5 : 6]);
        p.set(px + x, py + y - 1, RAMPS.cream[2]);
      }
    }
    if (hasTall) tallGrass(p, map, wx, wy, px, py, ramp);
  } else if (hash2(tx, ty, 81) < 0.38) {
    const x = 4 + Math.floor(hash2(tx, ty, 84) * 8);
    const y = 5 + Math.floor(hash2(tx, ty, 83) * 7);
    p.rect(px + x, py + y, 3, 1, ramp[Math.max(1, tone - 1)]);
    p.rect(px + x, py + y - 1, 2, 1, ramp[tone + 1]);
  }
  if (type !== 'path') return;
  const seed = hash2(tx, ty, 181), horizontal = n[1] === 'path' || n[3] === 'path';
  if (seed < 0.68) {
    const start = 3 + Math.floor(seed * 5), across = 6 + Math.floor(hash2(tx, ty, 182) * 5);
    for (let i = 0; i < 6; i++) {
      const x = horizontal ? start + i : across + Math.floor(i / 4);
      const y = horizontal ? across + Math.floor(i / 4) : start + i;
      if (boundaryDistance(x, y, grassMask) < 6) continue;
      p.set(px + x, py + y, colors[0]); p.set(px + x, py + y - 1, colors[2]);
    }
  }
  if (seed > 0.33 && seed < 0.85) for (let i = 0; i < 3; i++) {
    const x = 3 + Math.floor(hash2(tx, ty, 185 + i) * 10), y = 4 + Math.floor(hash2(tx, ty, 189 + i) * 9);
    if (boundaryDistance(x, y, grassMask) < 5) continue;
    p.rect(px + x, py + y, i === 1 ? 3 : 2, 1, ramp[2]);
    p.rect(px + x, py + y - 1, i === 1 ? 2 : 1, 1, ramp[5]);
  }
  const green = rampFor('grass', biome);
  if (grassMask & 1) { p.line(px + 6, py + 1, px + 7, py + 4, green[3]); p.line(px + 9, py + 1, px + 8, py + 3, green[4]); }
  if (grassMask & 4) { p.line(px + 10, py + 14, px + 9, py + 11, green[4]); p.set(px + 11, py + 12, green[5]); }
}

function paintMineralAndWood(p, type, biome, tx, ty, px, py, ramp, n, lavaMask) {
  const wx = tx * 16, wy = ty * 16;
  if (type === 'cliff') {
    const top = n[0] !== 'cliff';
    for (let x = 0; x < 16; x++) {
      const column = hash2(Math.floor((wx + x) / 9), ty, 52);
      p.rect(px + x, py, 1, 16, ramp[column < 0.23 ? 2 : top ? 4 : 3]);
      const stratum = 8 + Math.floor(hash2(Math.floor((wx + x) / 11), ty, 16) * 3);
      p.rect(px + x, py + stratum, 1, 16 - stratum, ramp[column < 0.23 ? 1 : 3]);
      if (column > 0.3) p.set(px + x, py + stratum - 1, ramp[top ? 5 : 4]);
      if (n[2] !== 'cliff') p.rect(px + x, py + 14 + (x % 5 === 0 ? 1 : 0), 1, 2, ramp[2]);
    }
    if (top) {
      const cap = rampFor(biome === 'heights' ? 'snow' : 'grass', biome);
      for (let x = 0; x < 16; x++) {
        const lip = 3 + Math.floor(hash2(Math.floor((wx + x) / 4), ty, 10) * 2);
        p.rect(px + x, py, 1, lip, cap[Math.min(cap.length - 1, 4)]);
        p.set(px + x, py + lip, ramp[6]);
        p.set(px + x, py + lip + 1, ramp[2]);
      }
    }
    if (n[3] !== 'cliff') p.rect(px, py + (top ? 4 : 0), 2, top ? 9 : 13, ramp[5]);
    if (n[1] !== 'cliff') p.rect(px + 14, py + (top ? 4 : 0), 2, top ? 10 : 14, ramp[1]);
    if (hash2(tx, ty, 60) < 0.45) p.line(px + 8, py + 8, px + 6, py + 12, ramp[1]);
  } else if (type === 'stone' || type === 'ruin') {
    flagstones(p, wx, wy, px, py, biome, type === 'ruin');
  } else if (type === 'plank') {
    // Long weathered floorboards, not rails repeated around every floor tile.
    // Seams and staggered joints are world-aligned across wide rooms and chunks.
    const r = FLOOR_WOOD;
    p.rect(px, py, 16, 16, r[2]);
    for (let x = 0; x < 16; x++) {
      const board = Math.floor((wx + x) / 12), across = mod(wx + x, 12);
      if (across === 0) p.rect(px + x, py, 1, 16, r[1]);
      for (let y = 0; y < 16; y++) {
        const along = mod(wy + y + board * 17, 48);
        if (along === 0 && across > 0) p.set(px + x, py + y, r[0]);
        else if (along === 17 && across > 3 && across < 8 && board % 3 === 0) p.set(px + x, py + y, r[3]);
      }
    }
    if (n[0] !== 'plank' && n[0] !== 'bridge') p.rect(px, py, 16, 1, r[3]);
  } else if (type === 'bridge') {
    const r = BRIDGE_WOOD, vertical = n[0] === type || n[2] === type;
    const left = vertical && n[3] !== type && n[3] !== 'plank' ? 2 : 0;
    const right = vertical && n[1] !== type && n[1] !== 'plank' ? 2 : 0;
    const top = !vertical && n[0] !== type && n[0] !== 'plank' ? 2 : 0;
    const bottom = !vertical && n[2] !== type && n[2] !== 'plank' ? 2 : 0;
    p.rect(px + left, py + top, 16 - left - right, 16 - top - bottom, r[2]);
    for (let i = 0; i < 16; i++) {
      if (mod((vertical ? wy : wx) + i, 8) === 0) p.rect(px + (vertical ? left : i), py + (vertical ? i : top), vertical ? 16 - left - right : 1, vertical ? 1 : 16 - top - bottom, r[0]);
    }
    if (vertical) {
      if (n[3] !== type && n[3] !== 'plank') p.rect(px + 2, py, 1, 16, r[3]);
      if (n[1] !== type && n[1] !== 'plank') p.rect(px + 13, py, 1, 16, r[0]);
    } else {
      if (n[0] !== type && n[0] !== 'plank') p.rect(px, py + 2, 16, 1, r[3]);
      if (n[2] !== type && n[2] !== 'plank') p.rect(px, py + 13, 16, 1, r[0]);
    }
  } else if (type === 'lava') {
    if (lavaMask) for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = boundaryDistance(x, y, lavaMask);
      if (d < 2 + ((x + y) % 3 === 0 ? 1 : 0)) p.set(px + x, py + y, RAMPS.ash[d === 0 ? 2 : 4]);
    }
  } else if (type === 'crystal') {
    for (let y = 0; y < 16; y++) {
      let a = (wx + 2 * (wy + y)) & 63, b = (wx - 2 * (wy + y)) & 63;
      let out = (py + y) * p.w + px;
      for (let x = 0; x < 16; x++, out++) {
        if (a === 0 && b < 32) p.data[out] = ramp[3];
        else if (a < 16 && b > 40) p.data[out] = ramp[4];
        a = (a + 1) & 63; b = (b + 1) & 63;
      }
    }
  } else if (type === 'snow' && hash2(tx, ty, 56) < 0.4) {
    const x = 3 + Math.floor(hash2(tx, ty, 57) * 8);
    p.line(px + x, py + 10, px + x + 4, py + 8, ramp[2]);
    p.line(px + x, py + 9, px + x + 3, py + 8, ramp[4]);
  } else if (type === 'ash' && hash2(tx, ty, 22) < 0.32) {
    p.line(px + 4, py + 8, px + 7, py + 11, ramp[2]);
    p.line(px + 7, py + 11, px + 10, py + 11, ramp[4]);
  }
}

function paintTexture(p, type, wx, wy, px, py, ramp, tone, noise, stride) {
  // A tile-aligned world lattice gives broad masses without per-pixel noise.
  const colors = TEXTURE.get(ramp)[tone], lava = type === 'lava';
  let nw, ne, sw, se;
  if (lava) {
    nw = fbm(wx / 19, wy / 19, 65, 2);
    ne = fbm((wx + 16) / 19, wy / 19, 65, 2);
    sw = fbm(wx / 19, (wy + 16) / 19, 65, 2);
    se = fbm((wx + 16) / 19, (wy + 16) / 19, 65, 2);
  } else {
    const lattice = (py >> 4) * stride + (px >> 4);
    nw = noise[lattice]; ne = noise[lattice + 1];
    sw = noise[lattice + stride]; se = noise[lattice + stride + 1];
  }
  for (let y = 0; y < 16; y += 2) {
    const left = nw + (sw - nw) * y / 16, right = ne + (se - ne) * y / 16;
    let out = (py + y) * p.w + px;
    for (let x = 0; x < 16; x += 2, out += 2) {
      const v = left + (right - left) * x / 16;
      const color = lava
        ? v > 0.47 && v < 0.58 ? ramp[7] : v >= 0.58 ? ramp[5] : RAMPS.ash[v < 0.38 ? 2 : 3]
        : colors[v < 0.43 ? 0 : v > 0.57 ? 2 : 1];
      p.data[out] = color; p.data[out + 1] = color;
      p.data[out + p.w] = color; p.data[out + p.w + 1] = color;
    }
  }
}

function paintTile(p, map, tx, ty, px, py, noise, stride) {
  const type = map.get(tx, ty);
  const biome = map.biome(tx, ty) ?? 'meadow';
  const ramp = rampFor(type, biome);
  const tone = baseTone(type, biome);
  if (type === 'void') { p.rect(px, py, 16, 16, ramp[tone]); return; }
  const wx = tx * 16;
  const wy = ty * 16;
  const n = [map.get(tx, ty - 1), map.get(tx + 1, ty), map.get(tx, ty + 1), map.get(tx - 1, ty), map.get(tx - 1, ty - 1), map.get(tx + 1, ty - 1), map.get(tx + 1, ty + 1), map.get(tx - 1, ty + 1)];
  let bankMask = 0, waterMask = 0, shallowMask = 0, sandMask = 0, grassMask = 0, lavaMask = 0, snowMask = 0, hasTall = type === 'tallgrass';
  for (let i = 0; i < 8; i++) {
    const bit = 1 << i, v = n[i];
    if (landBank(v)) bankMask |= bit;
    if (v === 'water') shallowMask |= bit;
    if (WET.has(v)) waterMask |= bit;
    if (v === 'sand') sandMask |= bit;
    if (GREEN.has(v)) grassMask |= bit;
    if (v !== 'lava') lavaMask |= bit;
    if (v === 'snow') snowMask |= bit;
    if (v === 'tallgrass') hasTall = true;
  }

  // Opaque floor painters own their base fill; do not shade beneath them twice.
  if (type !== 'stone' && type !== 'ruin' && type !== 'plank') paintTexture(p, type, wx, wy, px, py, ramp, tone, noise, stride);

  if (WET.has(type) || type === 'bridge') {
    const shore = bankMask !== 0;
    const shallow = type === 'deep' && shallowMask !== 0;
    if (shore || shallow) {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const d = boundaryDistance(x, y, bankMask);
        const wave = Math.round(Math.sin((wx + x + wy + y) * 0.3));
        if (d < 1) p.set(px + x, py + y, ramp[7]);
        else if (d < 3 + wave) p.set(px + x, py + y, ramp[6]);
        else if (d < 6 + wave && bayer(wx + x, wy + y) < 0.65) p.set(px + x, py + y, ramp[5]);
        if (shallow) {
          const depth = boundaryDistance(x, y, shallowMask);
          if (depth < 4) p.set(px + x, py + y, ramp[3]);
        }
      }
    }
    // Long, broken caustics rather than individual specks.
    if (hash2(tx, ty, 31) < 0.36) {
      const x = 2 + Math.floor(hash2(tx, ty, 21) * 7);
      const y = 4 + Math.floor(hash2(tx, ty, 23) * 8);
      p.rect(px + x, py + y, 5, 1, ramp[type === 'deep' ? 3 : tone + 1]);
      p.rect(px + x + 4, py + y - 1, 3, 1, ramp[type === 'deep' ? 3 : tone + 1]);
    }
  }

  paintLand(p, map, type, biome, tx, ty, px, py, ramp, tone, n, grassMask, sandMask, hasTall);

  paintMineralAndWood(p, type, biome, tx, ty, px, py, ramp, n, lavaMask);
  if ((type === 'sand' || GREEN.has(type)) && waterMask) {
    // Bevel the land's convex corners into the surf, without changing collision.
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let corner = 32;
      if ((waterMask & 9) === 9) corner = Math.min(corner, x + y);
      if ((waterMask & 3) === 3) corner = Math.min(corner, 15 - x + y);
      if ((waterMask & 6) === 6) corner = Math.min(corner, 30 - x - y);
      if ((waterMask & 12) === 12) corner = Math.min(corner, x + 15 - y);
      if (corner < 4) p.set(px + x, py + y, RAMPS.water[6]);
      else if (corner < 5) p.set(px + x, py + y, RAMPS.water[8]);
    }
  }
  if (snowMask && isWalkable(type) && type !== 'snow' && type !== 'bridge' && type !== 'plank') {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const distance = boundaryDistance(x, y, snowMask);
      const drift = 2 + Math.floor(hash2(Math.floor((wx + x) / 5), Math.floor((wy + y) / 5), 213) * 5);
      if (distance < drift) p.set(px + x, py + y, RAMPS.snow[3]);
      else if (distance === drift) p.set(px + x, py + y, RAMPS.snow[2]);
    }
  }

  // Contact shadow cast down from a plateau, including across chunk boundaries.
  if (n[0] === 'cliff' && type !== 'cliff' && !WET.has(type)) {
    for (let y = 0; y < 5; y++) for (let x = 0; x < 16; x++) {
      if (y < 2 || bayer(wx + x, wy + y) < (5 - y) / 6) p.set(px + x, py + y, ramp[Math.max(0, tone - 2)]);
    }
  }
}

let chunkSurface;
/** map.get(tx, ty) → terrain type; map.biome(tx, ty) → biome key. */
export function paintTerrainChunk(ctx, map, tx0, ty0, tw, th, ox = 0, oy = 0) {
  const p = new Pix(tw * 16, th * 16);
  const stride = tw + 1, rows = th + 1;
  const noise = new Float32Array(stride * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < stride; x++) noise[y * stride + x] = fbm((tx0 + x) * 16 / 43, (ty0 + y) * 16 / 43, 17, 2);
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) paintTile(p, map, tx0 + tx, ty0 + ty, tx * 16, ty * 16, noise, stride);
  // Reuse the upload surface and view the Pix buffer without copying it.
  // drawImage respects caller clips/transforms; destination putImageData does not.
  if (!chunkSurface) chunkSurface = makeCanvas(p.w, p.h);
  if (chunkSurface.canvas.width !== p.w) chunkSurface.canvas.width = p.w;
  if (chunkSurface.canvas.height !== p.h) chunkSurface.canvas.height = p.h;
  chunkSurface.ctx.putImageData(new ImageData(new Uint8ClampedArray(p.data.buffer), p.w, p.h), 0, 0);
  ctx.drawImage(chunkSurface.canvas, Math.round(ox), Math.round(oy));
}

/** Visible-tile-only details. t is seconds; reduced motion callers may freeze t. */
export function drawTerrainAnimated(ctx, map, camX, camY, viewW, viewH, t) {
  const x0 = Math.floor(camX / 16), y0 = Math.floor(camY / 16);
  const x1 = Math.floor((camX + viewW) / 16), y1 = Math.floor((camY + viewH) / 16);
  let animateGrass = false;
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const type = map.get(tx, ty);
    if (type === 'tallgrass') { animateGrass = true; continue; }
    if (type !== 'water' && type !== 'deep' && type !== 'lava') continue;
    const h = hash2(tx, ty, 117);
    const x = Math.round(tx * 16 - camX), y = Math.round(ty * 16 - camY);
    const phase = t * 1.4 + h * 20;
    if (WET.has(type)) {
      if (h < 0.23 && Math.sin(phase) > 0.2) {
        const xx = x + 3 + Math.round(Math.sin(phase * 0.4) * 2);
        const yy = y + 4 + Math.floor(h * 37);
        ctx.fillStyle = PAL.water[type === 'deep' ? 4 : Math.sin(phase) > 0.85 ? 8 : 6];
        ctx.fillRect(xx, yy, 5, 1); ctx.fillRect(xx + 2, yy - 1, 2, 1);
      }
      if (type === 'water') {
        const breath = Math.round(Math.sin(phase * 0.6));
        ctx.fillStyle = PAL.water[8];
        if (landBank(map.get(tx, ty - 1))) ctx.fillRect(x + 3, y + 1 + breath, 8, 1);
        if (landBank(map.get(tx - 1, ty))) ctx.fillRect(x + 1 + breath, y + 4, 1, 6);
        if (landBank(map.get(tx, ty + 1))) ctx.fillRect(x + 4, y + 14 - breath, 7, 1);
        if (landBank(map.get(tx + 1, ty))) ctx.fillRect(x + 14 - breath, y + 3, 1, 7);
      }
    } else if (type === 'lava') {
      if (h < 0.3 && Math.sin(phase * 1.2) > 0.55) {
        ctx.fillStyle = PAL.ember[8]; ctx.fillRect(x + 5, y + 7, 3, 1);
        ctx.fillStyle = PAL.ember[6]; ctx.fillRect(x + 4, y + 8, 5, 1);
      }
    }
  }
  if (animateGrass) {
    for (let gy = Math.floor(camY / 9); gy <= Math.floor((camY + viewH + 8) / 9); gy++) {
      for (let gx = Math.floor((camX - 3) / 9); gx <= Math.floor((camX + viewW + 3) / 9); gx++) {
        const seed = hash2(gx, gy, 140);
        if (seed < 0.6 || hash2(Math.floor(gx / 3), Math.floor(gy / 3), 143) > 0.8) continue;
        const cx = gx * 9 + 2 + Math.floor(seed * 5), cy = gy * 9 + 2 + Math.floor(hash2(gx, gy, 141) * 5);
        const tx = Math.floor(cx / 16), ty = Math.floor(cy / 16);
        if (map.get(tx, ty) !== 'tallgrass') continue;
        const height = 4 + Math.floor(hash2(gx, gy, 142) * 4);
        const x = Math.round(cx - camX), y = Math.round(cy - height - camY);
        const sway = Math.round(Math.sin(t * 2 + gx * 0.7 + gy * 0.3));
        ctx.fillStyle = PAL[BIOME[map.biome(tx, ty)]?.ground ?? 'grass'][5];
        ctx.fillRect(x - 1 + sway, y + 1, 1, 2);
      }
    }
  }
}

// The same authored miniature is shared by the terrain/ambience galleries.
// Normalised features reflow instead of cropping when the screen is portrait.
export function makeTerrainDemo(biome, w = 24, h = 10) {
  const rows = Array.from({ length: h }, () => Array(w).fill('grass'));
  const put = (x, y, type) => { if (rows[y]?.[x] !== undefined) rows[y][x] = type; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w, v = y / h;
    let type = biome === 'forge' ? 'ash' : biome === 'heights' ? 'snow' : 'grass';
    const shore = 0.68 + Math.sin(v * 8) * 0.075;
    if (u > shore - 0.05) type = 'sand';
    if (u > shore + 0.03) type = 'water';
    if (u > shore + 0.15) type = 'deep';
    const ridge = 0.25 + (u > 0.28 ? -0.1 : u > 0.13 ? 0.07 : 0);
    if (v < ridge && u < 0.5) type = 'grass';
    if (v >= ridge && v < ridge + 0.12 && u < 0.5) type = 'cliff';
    const pathY = 0.56 + Math.sin(u * 9) * 0.065;
    if (Math.abs(v - pathY) < 0.08 && u < shore - 0.08) type = 'path';
    if (type !== 'cliff' && v > 0.39 && v < 0.53 && u > 0.06 && u < 0.27) type = 'flowers';
    if (v > 0.72 && u > 0.1 && u < 0.31) type = 'tallgrass';
    if (v < 0.13 && u < 0.11) type = 'snow';
    if (v < 0.22 && u > 0.15 && u < 0.28) type = 'ruin';
    if (v > 0.72 && u > 0.38 && u < 0.55) type = 'stone';
    if (v > 0.8 && u > 0.56 && u < 0.68) type = 'crystal';
    put(x, y, type);
  }
  const by = Math.floor(h * 0.55);
  for (let x = Math.floor(w * 0.57); x < Math.ceil(w * 0.94); x++) put(x, by, 'bridge');
  put(Math.floor(w * 0.62), by - 1, 'plank'); put(Math.floor(w * 0.63), by, 'plank');
  put(0, h - 2, 'ash'); put(1, h - 2, 'lava'); put(1, h - 1, 'lava'); put(0, h - 1, 'void');
  return { w, h, get: (x, y) => rows[y]?.[x] ?? 'deep', biome: () => biome };
}

const demos = new Map();
export function drawTerrainDemo(ctx, screen, t, biome) {
  const w = Math.ceil(screen.w / 16), h = Math.floor((screen.h - 56) / 16);
  const key = `${biome}:${w}:${h}`;
  let demo = demos.get(key);
  if (!demo) {
    const map = makeTerrainDemo(biome, w, h);
    const { canvas, ctx: paint } = makeCanvas(w * 16, h * 16);
    paintTerrainChunk(paint, map, 0, 0, w, h);
    demo = { map, canvas, y: 27 };
    demos.set(key, demo);
  }
  ctx.drawImage(demo.canvas, 0, demo.y);
  ctx.save(); ctx.beginPath(); ctx.rect(0, demo.y, screen.w, demo.canvas.height); ctx.clip();
  drawTerrainAnimated(ctx, demo.map, 0, -demo.y, screen.w, demo.canvas.height + demo.y, t);
  ctx.restore();
  return demo;
}

export const galleries = {
  terrain(ctx, screen, t, page = 0) {
    const biome = BIOMES[mod(page, BIOMES.length)];
    ctx.fillStyle = PAL.night[1]; ctx.fillRect(0, 0, screen.w, screen.h);
    drawTerrainDemo(ctx, screen, t, biome);
    drawText(ctx, `${biome} / living terrain`, 8, 7, { color: PAL.cream[2] });
    drawText(ctx, 'shore · plateau · path · garden · bridge', 8, screen.h - 26, { font: 'small', color: PAL.ui.dim });
  },
};
