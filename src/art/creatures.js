// Original, shape-built sprites. Frames are rasterised once; the live renderer
// only places cached canvases and integer scanline slices (never scales a sprite).
import { PAL } from './palette.js';
import { Pix, LIGHT, shadeRamp, spriteCache, u32 } from './paint.js';
import { hash2, clamp } from '../engine/util.js';
import { drawText } from '../engine/font.js';
import { drawBattleBackground } from './backgrounds.js';

export const CREATURE_IDS = ['nib', 'chime', 'brine', 'spindle', 'cinder', 'vesper', 'auric', 'static-0', 'static-1', 'static-2', 'static-3', 'static-4', 'static-5', 'static-6'];
const NAMES = ['Nib', 'Chime', 'Brine', 'Spindle', 'Cinder', 'Vesper', 'Auric'];
const BIOMES = ['meadow', 'grove', 'cove', 'heights', 'forge', 'archives', 'spire'];
const ACCENTS = ['leaf', 'teal', 'water', 'sky', 'ember', 'gold', 'teal'];
const SIZES = Object.freeze({ nib: { w: 88, h: 86 }, chime: { w: 88, h: 94 }, brine: { w: 108, h: 84 }, spindle: { w: 112, h: 94 }, cinder: { w: 100, h: 98 }, vesper: { w: 92, h: 96 }, auric: { w: 154, h: 114 } });
const STATIC_SIZE = Object.freeze({ w: 54, h: 54 });
// Transparent pose gutters keep antlers, tail fins and roots intact at both
// anticipation extremes. Bounds include those gutters; the feet do not move.
const BOUNDS = Object.fromEntries(CREATURE_IDS.map((id) => {
  const size = SIZES[id] ?? STATIC_SIZE;
  return [id, Object.freeze({ w: size.w + 16, h: size.h + 16 })];
}));
const motionPreference = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const WAVE = [0, 1, 1, 1, 0, -1, -1, -1];
const RAMPS = Object.fromEntries(Object.entries(PAL).filter(([, v]) => Array.isArray(v)).map(([key, r]) => [key, [r[0], r[Math.round((r.length - 1) * .28)], r[Math.round((r.length - 1) * .52)], r[Math.round((r.length - 1) * .76)], r.at(-1)]]));

/** Small private modelling vocabulary: rounded volumes, lit planar faces,
 * cubic strokes, and deliberate pixel accents. Material outlines stay local. */
class SpriteBuilder {
  constructor(pix, dy = 0) { this.p = pix; this.dy = dy; }
  ball(x, y, rx, ry, material, light = 0) {
    const r = RAMPS[material];
    this.p.ellipse(x, y + this.dy, rx, ry, r[0]);
    this.p.ellipse(x, y + this.dy, rx - 1, ry - 1, (px, py, nx, ny, nz) => {
      const diffuse = Math.max(0, nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z);
      return shadeRamp(r, clamp(.28 + .7 * diffuse + light), px, py, diffuse < .28 ? .12 : 0);
    });
    return this;
  }
  face(points, material, normal = [-.25, -.45, .85], edge = true) {
    const r = RAMPS[material];
    const pts = points.map(([x, y]) => [x, y + this.dy]);
    const dot = Math.max(0, normal[0] * LIGHT.x + normal[1] * LIGHT.y + normal[2] * LIGHT.z);
    this.p.poly(pts, shadeRamp(r, .25 + .7 * dot));
    if (edge) for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      this.p.line(...a, ...b, r[0]);
    }
    return this;
  }
  line(x0, y0, x1, y1, color) { this.p.line(x0, y0 + this.dy, x1, y1 + this.dy, color); return this; }
  dot(x, y, color, w = 1, h = 1) { this.p.rect(x, y + this.dy, w, h, color); return this; }
  curve(points, radius, material) {
    const r = RAMPS[material];
    const samples = [];
    for (let i = 0; i <= 36; i++) {
      const t = i / 36, u = 1 - t;
      samples.push([Math.round(u ** 3 * points[0][0] + 3 * u * u * t * points[1][0] + 3 * u * t * t * points[2][0] + t ** 3 * points[3][0]), Math.round(u ** 3 * points[0][1] + 3 * u * u * t * points[1][1] + 3 * u * t * t * points[2][1] + t ** 3 * points[3][1]) + this.dy]);
    }
    for (const [x, y] of samples) this.p.circle(x, y, radius, r[0]);
    for (const [x, y] of samples) this.p.circle(x, y, Math.max(.6, radius - 1), r[2]);
    if (radius > 2) for (const [x, y] of samples) this.p.circle(x - 1, y - 1, Math.max(.5, radius - 2), r[3]);
    return this;
  }
  eye(x, y, blink, size = 1, color = PAL.teal[7]) {
    if (blink) { this.line(x - 2 * size, y, x + 2 * size, y, PAL.ink); return this; }
    this.p.ellipse(x, y + this.dy, 2.7 * size, 4 * size, PAL.ink);
    this.p.rect(Math.round(x), Math.round(y + this.dy + size), Math.max(1, Math.round(size)), Math.max(1, Math.round(size)), color);
    this.p.rect(Math.round(x - size), Math.round(y + this.dy - 2 * size), Math.max(1, Math.round(size)), Math.max(1, Math.round(size)), PAL.cream[3]);
    return this;
  }
  leaf(points, vein, material = 'leaf') {
    this.face(points, material);
    this.face([points[0], points[1], points[2]], material, [-.7, -.6, .4], false);
    this.line(...vein[0], ...vein[1], RAMPS[material][1]);
    return this;
  }
}

function nib(s, f, blink) {
  const w = WAVE[f];
  s.curve([[40, 71], [33, 80], [24, 80], [29, 84]], 3, 'wood');
  s.curve([[49, 72], [52, 84], [64, 78], [60, 84]], 3, 'wood');
  s.ball(21, 60, 8, 7, 'leaf').ball(68, 58, 7, 8, 'leaf');
  s.ball(44, 58, 24 + (f === 2 ? 1 : 0), 23, 'leaf');
  s.ball(43, 63, 18, 16, 'cream');
  s.face([[27, 42], [32, 52], [39, 47], [47, 53], [57, 45], [62, 39]], 'leaf', [-.5, -.5, .7]);
  s.curve([[44, 43], [50, 32], [49, 19], [46 + w, 13]], 3, 'leaf');
  s.leaf([[9, 32 + w], [23, 13 + w], [45, 10], [78, 24 - w], [62, 34], [44, 28], [26, 35]], [[14, 30 + w], [47, 20]]);
  s.line(46, 20, 72, 25 - w, PAL.leaf[2]).line(30, 20, 27, 29, PAL.leaf[3]).line(57, 20, 64, 29, PAL.leaf[4]);
  s.ball(24, 20 + w, 5, 3, 'leaf', .1).dot(19, 19 + w, PAL.grass[7], 4);
  s.ball(66, 28 - w, 3, 4, 'water').dot(65, 25 - w, PAL.water[10]);
  s.eye(35, 58, blink).eye(51, 58, blink);
  s.line(40, 66, 43, 68, PAL.wood[1]).line(43, 68, 46, 65, PAL.wood[1]);
  s.dot(29, 63, PAL.rose[5], 4, 2).dot(55, 63, PAL.rose[5], 4, 2);
  s.dot(39, 74, PAL.cream[1], 3).dot(48, 73, PAL.cream[1], 2);
}

function crystal(s, x, y, w, h, material = 'teal') {
  s.face([[x, y], [x + w, y + h * .25], [x + w - 2, y + h], [x + 2, y + h - 3]], material, [-.5, -.5, .7]);
  s.face([[x, y], [x + w * .45, y + h * .36], [x + 2, y + h - 3]], material, [-.9, -.2, .3], false);
  s.face([[x + w * .45, y + h * .36], [x + w, y + h * .25], [x + w - 2, y + h]], material, [.7, .2, .6], false);
  s.line(x + 1, y + 2, x + w * .45, y + h * .36, RAMPS[material][4]);
}
function chime(s, f, blink) {
  const w = WAVE[f];
  s.curve([[43, 64], [38 + w * 2, 78], [51 + w * 3, 75], [47 + w * 3, 83]], 2, 'gold');
  s.ball(47 + w * 3, 86, 7, 6, 'gold');
  crystal(s, 20 - w, 12, 13, 26, 'violet');
  crystal(s, 58 + w, 7, 12, 30);
  s.face([[42, 18], [61, 26], [66, 52], [79, 65], [66, 73], [20, 73], [10, 65], [21, 51], [26, 29]], 'teal');
  s.face([[42, 18], [43, 59], [20, 67], [26, 29]], 'teal', [-.8, -.45, .4], false);
  s.face([[42, 18], [61, 26], [66, 52], [43, 59]], 'teal', [.7, .2, .65], false);
  s.face([[20, 59], [43, 64], [68, 59], [78, 65], [66, 72], [20, 72], [11, 65]], 'violet');
  s.line(22, 69, 63, 69, PAL.teal[7]);
  s.ball(42, 43, 16, 16, 'teal', .12);
  s.face([[43, 54], [49, 59], [43, 66], [36, 60]], 'gold');
  s.dot(41, 57, PAL.gold[8], 3, 3);
  s.eye(35, 42, blink, .9, PAL.gold[6]).eye(49, 42, blink, .9, PAL.gold[6]);
  s.line(40, 49, 43, 51, PAL.teal[1]).line(43, 51, 46, 49, PAL.teal[1]);
  s.line(29, 28, 35, 24, PAL.teal[9]).dot(27, 31, PAL.teal[8], 2, 6);
  crystal(s, 13, 46, 9, 17, 'violet');
  crystal(s, 69, 47, 7, 17);
}
function frond(s, rootX, rootY, tipX, tipY, side, sway) {
  s.curve([[rootX, rootY], [tipX, rootY], [tipX + sway, tipY + 5], [tipX + sway, tipY]], 2.4, 'rose');
  for (let i = 0; i < 3; i++) {
    const y = tipY + 5 + i * 5, x = tipX + sway + (rootX - tipX) * i / 6;
    s.line(x, y, x + side * 5, y - 3, PAL.rose[5]);
    s.dot(x + side * 5, y - 3, PAL.rose[6], 2);
  }
}
function brine(s, f, blink) {
  const w = WAVE[f];
  s.face([[75, 48], [91, 36 + w], [104, 31 + w], [103, 49], [97, 63], [75, 70]], 'water');
  s.line(83, 61, 101, 38 + w, PAL.water[7]).line(84, 62, 100, 51, PAL.water[7]);
  s.ball(61, 62, 34, 19, 'water');
  s.ball(63, 67, 23, 12, 'snow');
  s.ball(29, 76, 11, 6, 'water').ball(71, 77, 12, 6, 'water');
  for (const side of [-1, 1]) {
    const x = 42 + side * 19;
    frond(s, x, 39, x + side * 9, 10, side, w);
    frond(s, x, 45, x + side * 16, 26, side, -w);
    frond(s, x, 49, x + side * 17, 48, side, w);
  }
  s.ball(42, 42, 24, 22, 'water');
  s.ball(38, 52, 18, 11, 'snow');
  s.eye(32, 40, blink, 1.05).eye(48, 40, blink, 1.05);
  s.line(34, 49, 38, 52, PAL.water[2]).line(38, 52, 43, 49, PAL.water[2]);
  s.dot(22, 47, PAL.rose[5], 5, 2).dot(54, 47, PAL.rose[5], 4, 2);
  s.dot(30, 25, PAL.water[9], 5).dot(27, 27, PAL.water[9], 3, 2);
  for (let i = 0; i < 3; i++) s.curve([[51, 63 + i * 4], [60, 58 + i * 4], [67, 71 + i * 2], [76, 65 + i * 3]], 1, i === 0 ? 'water' : 'snow');
  s.line(25, 78, 27, 80, PAL.water[2]).line(69, 79, 71, 81, PAL.water[2]);
}
function wing(s, side, w) {
  const X = (x) => 56 + side * x;
  s.face([[X(5), 40], [X(30), 16 + w], [X(46), 13 + w], [X(49), 31], [X(39), 55], [X(18), 63]], 'violet', [-side * .35, -.65, .65]);
  s.face([[X(14), 48], [X(40), 51], [X(41), 71 - w], [X(26), 80 - w], [X(8), 66]], 'violet', [-side * .2, .2, .8]);
  s.face([[X(14), 41], [X(33), 23 + w], [X(39), 23 + w], [X(32), 43], [X(18), 54]], 'cream', [-.6, -.5, .6]);
  s.ball(X(30), 37, 7, 9, 'violet').ball(X(30), 36, 3, 4, 'gold');
  s.line(X(15), 60, X(30), 69 - w, PAL.violet[6]);
  s.line(X(17), 63, X(27), 75 - w, PAL.cream[1]);
  s.dot(X(42), 28, PAL.cream[3], 2, 2);
}
function spindle(s, f, blink) {
  const w = WAVE[f];
  wing(s, -1, w * 2); wing(s, 1, -w * 2);
  for (let i = 0; i < 3; i++) {
    const x = 25 + i * 30;
    s.curve([[51 + i * 5, 57], [x + w * 3, 70], [x - w * 3, 72], [x, 84]], 1, i === 1 ? 'gold' : 'cream');
    s.ball(x, 85, 6, 5, 'wood').line(x - 4, 83, x + 4, 83, PAL.cream[2]).line(x - 4, 85, x + 4, 85, PAL.cream[1]).line(x - 4, 87, x + 4, 87, PAL.cream[0]);
  }
  s.ball(56, 55, 12, 22, 'violet');
  s.ball(56, 53, 10, 15, 'cream');
  s.line(51, 61, 61, 61, PAL.cream[0]).line(52, 65, 60, 65, PAL.cream[0]);
  s.ball(56, 37, 15, 14, 'cream');
  for (let i = 0; i < 5; i++) s.face([[42 + i * 5, 40], [45 + i * 5, 49], [49 + i * 5, 40]], 'cream', [-.5, -.5, .6], false);
  for (const side of [-1, 1]) {
    s.curve([[56 + side * 7, 27], [56 + side * 15, 17], [56 + side * 20, 8 + w], [56 + side * 26, 7 + w]], 2, 'violet');
    for (let i = 0; i < 4; i++) s.line(56 + side * (13 + i * 3), 20 - i * 3 + w, 56 + side * (21 + i * 3), 18 - i * 3 + w, PAL.cream[2]);
  }
  s.eye(50, 35, blink, .85, PAL.violet[6]).eye(62, 35, blink, .85, PAL.violet[6]);
  s.dot(55, 41, PAL.rose[4], 3, 2);
  s.dot(44, 40, PAL.rose[5], 3).dot(65, 40, PAL.rose[5], 3);
}
function flame(s, x, y, scale, f) {
  const w = WAVE[f];
  s.face([[x - scale, y], [x - scale - 2, y - scale], [x - 2, y - scale * 2], [x + w * 2, y - scale * 3 - 2], [x + scale, y - scale * 1.5], [x + scale + 2, y - 3]], 'ember', [.2, -.15, .7]);
  s.face([[x - scale / 2, y - 1], [x - 2, y - scale * 1.3], [x + 2, y - scale * 2], [x + scale / 2, y - 2]], 'gold', [-.1, -.3, .8], false);
}
function cinder(s, f, blink) {
  const w = WAVE[f];
  s.curve([[66, 74], [89, 89], [99, 75], [87, 68]], 7, 'ash');
  flame(s, 88, 66, 5, f);
  s.ball(28, 89, 13, 8, 'ash').ball(65, 89, 13, 8, 'ash');
  s.ball(48, 62, 27, 28, 'ash');
  s.face([[34, 49], [61, 49], [67, 60], [62, 77], [34, 78], [29, 61]], 'wood', [.3, .1, .8]);
  s.face([[38, 54], [58, 54], [62, 62], [57, 72], [37, 72], [33, 62]], 'ember', [.1, .2, .7]);
  flame(s, 48, 70, 5, (f + 2) % 8);
  for (const side of [-1, 1]) {
    const x = 48 + side * 29;
    s.ball(x, 60 - side * w, 10, 16, 'ash');
    for (let i = 0; i < 3; i++) s.line(x - 6, 55 + i * 5 - side * w, x + 6, 57 + i * 5 - side * w, PAL.ash[2]);
    s.ball(x + side * 3, 73 - side * w, 10, 8, 'wood');
  }
  s.ball(48, 34, 25, 19, 'ash');
  s.face([[31, 26], [30, 10], [38, 10], [38, 5], [49, 5], [49, 12], [62, 12], [64, 26]], 'ash');
  s.face([[33, 9], [45, 8], [49, 12], [37, 13]], 'ember', [-.5, -.5, .7]);
  flame(s, 44, 12, 3, f);
  s.line(54, 16, 54, 24, PAL.ember[5]).line(54, 20, 59, 23, PAL.ember[6]);
  s.ball(46, 43, 17, 9, 'wood');
  s.eye(36, 32, blink, .85, PAL.ember[7]).eye(56, 32, blink, .85, PAL.ember[7]);
  s.line(30, 27, 38, 25, PAL.ash[7]).line(53, 25, 61, 28, PAL.ash[5]);
  s.line(37, 44, 52, 44, PAL.wood[0]).dot(40, 44, PAL.cream[2], 3, 2).dot(49, 44, PAL.cream[2], 2, 2);
  for (const x of [21, 27, 61, 67]) s.line(x, 91, x + 1, 94, PAL.ash[2]);
}
function glyph(s, x, y, type) {
  const c = PAL.gold[6];
  if (type === 0) s.line(x, y, x + 4, y, c).line(x + 2, y, x + 2, y + 7, c).line(x, y + 7, x + 4, y + 7, c);
  else if (type === 1) s.line(x, y + 2, x + 3, y, c).line(x + 3, y, x + 6, y + 2, c).line(x + 3, y, x + 3, y + 7, c);
  else s.line(x, y, x + 5, y, c).line(x + 5, y, x + 5, y + 5, c).line(x + 5, y + 5, x, y + 5, c).dot(x, y, c, 1, 5);
}
function vesper(s, f, blink) {
  const w = WAVE[f];
  s.curve([[46, 64], [71, 81], [70 + w * 2, 99], [34 + w * 2, 87]], 7, 'violet');
  s.curve([[37, 87], [22, 77], [33, 72], [36, 78]], 3, 'violet');
  s.face([[28, 45], [67, 42], [72, 61], [62, 78], [48, 72], [33, 78], [22, 64]], 'violet');
  s.face([[17, 41], [22, 22], [47, 7], [68, 21], [76, 46], [64, 61], [28, 59]], 'cream');
  s.face([[47, 7], [47, 25], [64, 35], [69, 53], [76, 46], [68, 21]], 'cream', [.8, .1, .4], false);
  s.face([[22, 22], [47, 7], [36, 28], [21, 44]], 'cream', [-.7, -.6, .4], false);
  s.ball(46, 41, 22, 20, 'violet');
  s.face([[20, 38], [27, 23], [47, 12], [37, 29], [26, 47]], 'cream', [-.7, -.6, .4]);
  s.eye(37, 41, blink, 1.05, PAL.gold[6]).eye(54, 41, blink, 1.05, PAL.gold[6]);
  s.dot(44, 49, PAL.violet[7], 4).dot(38, 29, PAL.violet[6], 5);
  s.face([[25, 58], [44, 61], [65, 57], [64, 72], [46, 78], [28, 72]], 'wood');
  s.face([[28, 56], [45, 60], [45, 75], [28, 69]], 'cream', [-.6, -.5, .8]);
  s.face([[46, 60], [63, 55], [62, 70], [46, 75]], 'cream', [.4, .1, .8]);
  for (let i = 0; i < 3; i++) {
    s.line(31, 61 + i * 3, 40, 63 + i * 3, PAL.cream[0]);
    s.line(50, 64 + i * 3, 58, 61 + i * 3, PAL.cream[0]);
  }
  s.ball(25, 64, 6, 5, 'violet').ball(65, 64, 6, 5, 'violet');
  glyph(s, 6, 34 + w * 2, 1); glyph(s, 80, 55 - w * 2, 2);
}
function antler(s, x, y, side, w) {
  s.curve([[x, y], [x + side * 7, y - 11], [x + side * 4, y - 22], [x + side * 13, y - 27]], 3, 'gold');
  s.curve([[x + side * 5, y - 10], [x + side * 15, y - 14], [x + side * 17, y - 20], [x + side * 18, y - 25 + w]], 2, 'gold');
  s.line(x + side * 7, y - 21, x + side, y - 25, PAL.gold[5]);
}
function auric(s, f, blink, phase) {
  const w = WAVE[f];
  if (phase === 2) {
    s.p.ellipseDither(73, 40 + s.dy, 43, 34, PAL.teal[5], .18);
    s.p.ellipseDither(71, 38 + s.dy, 34, 29, PAL.gold[5], .2);
  }
  s.curve([[95, 91], [136, 105], [155, 84], [138, 63]], 12, 'teal');
  s.face([[133, 69], [144, 52 + w], [150, 60], [148, 76]], 'gold');
  s.ball(89, 83, 39, 26, 'teal');
  for (let i = 0; i < 6; i++) s.face([[76 + i * 10, 64 + i * 3], [83 + i * 10, 49 + i * 4], [89 + i * 10, 66 + i * 3]], 'gold', [-.4, -.6, .7]);
  s.ball(62, 75, 26, 30, 'teal');
  s.ball(60, 79, 18, 24, 'cream');
  for (let i = 0; i < 4; i++) s.curve([[47, 68 + i * 8], [56, 74 + i * 7], [64, 74 + i * 7], [74, 68 + i * 8]], 1, 'gold');
  s.ball(42, 91, 10, 18, 'teal').ball(75, 94, 10, 16, 'teal');
  s.ball(38, 106, 12, 7, 'teal').ball(74, 107, 12, 6, 'teal');
  for (const x of [32, 38, 67, 74]) s.face([[x, 107], [x + 1, 112], [x + 5, 111], [x + 5, 107]], 'gold');
  s.face([[80, 53], [91, 35 - w], [103, 42], [96, 60], [82, 67]], 'teal');
  s.line(86, 57, 96, 43 - w, PAL.teal[7]);
  antler(s, 47, 30, -1, w); antler(s, 75, 31, 1, -w);
  s.face([[27, 40], [19, 28], [35, 31], [43, 44]], 'gold');
  s.face([[78, 39], [97, 28], [94, 42], [80, 48]], 'gold');
  s.ball(59, 43, 30, 24, 'teal');
  s.face([[34, 51], [31, 65], [41, 59], [42, 70], [52, 62], [60, 70], [64, 59], [76, 64], [77, 52]], 'cream', [-.3, -.2, .9]);
  s.ball(40, 53, 23, 13, 'teal', .08);
  s.ball(33, 57, 15, 7, 'cream');
  s.eye(46, 39, blink, 1.05, PAL.gold[6]).eye(68, 39, blink, .95, PAL.gold[6]);
  s.line(38, 31, 48, 28, PAL.teal[9]).line(63, 28, 73, 31, PAL.teal[8]);
  s.dot(24, 50, PAL.teal[1], 3, 2).dot(35, 50, PAL.teal[1], 3, 2);
  s.line(23, 58, 37, 60, PAL.teal[1]);
  s.curve([[24, 54], [5, 58 + w], [2, 44 - w], [9, 40 - w]], 1.8, 'gold');
  s.curve([[39, 59], [41, 77 + w], [18, 80 + w], [16, 69 + w]], 1.8, 'gold');
  s.face([[55, 25], [59, 20], [64, 25], [59, 31]], phase === 2 ? 'gold' : 'cream');
  for (let i = 0; i < 4; i++) {
    const x = 90 + i * 8, y = 77 + (i % 2) * 7;
    s.line(x, y, x + 3, y + 3, phase === 2 ? PAL.gold[7] : PAL.teal[6]);
    s.line(x + 3, y + 3, x + 6, y, phase === 2 ? PAL.gold[7] : PAL.teal[6]);
  }
  if (phase === 2) {
    for (const [x, y] of [[100, 27 - w], [118, 43 + w], [129, 24 + w]]) {
      s.line(x - 2, y, x + 2, y, PAL.gold[7]).line(x, y - 2, x, y + 2, PAL.gold[7]);
    }
    s.face([[57, 72], [61, 68], [65, 72], [61, 77]], 'gold');
    s.line(92, 82, 108, 82, PAL.gold[6]).line(99, 76, 99, 88, PAL.gold[6]);
  }
}
const PAINTERS = { nib, chime, brine, spindle, cinder, vesper, auric };

function staticling(s, zone, f, blink) {
  const w = WAVE[f];
  s.ball(19, 48, 7, 4, 'violet').ball(36, 48, 7, 4, 'violet');
  if (zone === 2) s.face([[35, 36], [50, 28 - w], [46, 44], [37, 47]], 'water');
  if (zone === 3) for (const side of [-1, 1]) s.face([[27 + side * 7, 27], [27 + side * 23, 16 + w], [27 + side * 23, 39], [27 + side * 12, 44]], 'violet');
  if (zone === 5) s.curve([[34, 43], [55, 48], [43, 56], [30, 48]], 4, 'violet');
  if (zone === 1) {
    s.face([[15, 17], [33, 13], [45, 28], [39, 45], [24, 50], [10, 40], [8, 25]], 'violet', [-.4, -.6, .7]);
    s.face([[33, 13], [45, 28], [39, 45], [26, 39]], 'violet', [.6, .2, .7], false);
  } else if (zone === 4) {
    s.face([[14, 16], [37, 16], [44, 23], [43, 42], [37, 49], [15, 49], [9, 40], [10, 23]], 'violet');
    s.face([[37, 16], [44, 23], [43, 42], [37, 49], [34, 29]], 'violet', [.7, .3, .5], false);
  } else s.ball(27, 32, 19, zone === 5 ? 16 : 19, 'violet');
  s.ball(24, 38, 12, 9, 'violet', .08);
  if (zone === 0) s.leaf([[24, 18], [15, 9 + w], [21, 3 + w], [35, 8], [31, 18]], [[20, 8 + w], [29, 19]]);
  if (zone === 1) { crystal(s, 17, 6 + w, 11, 19); crystal(s, 31, 13 - w, 8, 12, 'violet'); }
  if (zone === 2) s.face([[20, 20], [28, 2 + w], [37, 19]], 'water');
  if (zone === 3) {
    s.curve([[21, 20], [15, 14], [17, 6], [12, 7 + w]], 2, 'cream');
    s.curve([[32, 20], [38, 15], [35, 9], [40, 8 - w]], 2, 'cream');
  }
  if (zone === 4) { flame(s, 28, 20, 5, f); s.line(13, 36, 17, 40, PAL.ember[6]).line(17, 40, 15, 44, PAL.ember[5]); }
  if (zone === 5) s.face([[10, 24], [18, 9], [31, 6 + w], [44, 19], [34, 16], [22, 16], [16, 29]], 'cream');
  if (zone === 6) {
    s.face([[13, 22], [10, 9 + w], [22, 18]], 'gold');
    s.face([[34, 18], [44, 9 - w], [43, 27]], 'gold');
    s.face([[25, 18], [29, 13], [33, 18], [29, 23]], 'teal');
  }
  s.eye(20, 30, blink, 1.05, PAL[ACCENTS[zone]][6]).eye(34, 30, blink, 1.05, PAL[ACCENTS[zone]][6]);
  s.line(25, 38, 28, 40, PAL.violet[1]).line(28, 40, 31, 38, PAL.violet[1]);
  s.dot(11, 32, PAL.violet[6], 3).dot(40, 35, PAL.violet[6], 3);
  for (let i = 0; i < 5; i++) {
    const x = 9 + Math.floor(hash2(i, f, zone) * 34), y = 18 + Math.floor(hash2(f, i, zone + 11) * 28);
    if (s.p.opaque(x, y + s.dy)) s.dot(x, y, i % 2 ? PAL.violet[3] : PAL[ACCENTS[zone]][5], 3);
  }
}

export function battleCreatureSize(id) { return BOUNDS[id] ?? BOUNDS['static-0']; }
function zoneOf(id) { return id.startsWith('static-') ? Math.max(0, Math.min(6, Number(id.slice(7)) || 0)) : Math.max(0, CREATURE_IDS.indexOf(id)); }
function corruptPixels(p, zone, f) {
  const accent = PAL[ACCENTS[zone]], colors = [PAL.violet[0], PAL.violet[2], PAL.violet[4], PAL.violet[6], accent[Math.min(accent.length - 1, 6)]];
  p.each((x, y, c) => {
    if (c === u32(PAL.ink)) return c;
    const l = ((c & 255) * .23 + ((c >>> 8) & 255) * .62 + ((c >>> 16) & 255) * .15) / 255;
    return shadeRamp(colors, l, x, y, .25);
  });
  for (let i = 0; i < 15; i++) {
    const x = Math.floor(hash2(i, f, zone + 9) * p.w), y = Math.floor(hash2(f, i, zone + 29) * p.h);
    if (p.opaque(x, y)) for (let dx = 0; dx < 3; dx++) if (p.opaque(x + dx, y)) p.set(x + dx, y, i % 3 ? PAL.violet[7] : accent.at(-2));
  }
}
// Anticipation is rasterised into its own discrete poses. This preserves the one
// pixel scale and bottom-centre anchor, unlike a canvas scale() at draw time.
function reshape(p, amount) {
  if (!amount) return;
  const source = p.clone(), sx = 1 + amount * .045, sy = 1 - amount * .065;
  p.clear();
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const fromX = Math.round((x - p.w / 2) / sx + p.w / 2);
    const fromY = Math.round((y - p.h + 1) / sy + p.h - 1);
    const c = source.get(fromX, fromY);
    if (c >>> 24) p.set(x, y, c);
  }
}
const banks = new Map();
function battleFrames(id, corrupted, phase, squash, blink, white = false) {
  const key = `creature-v2:${id}:${+corrupted}:${phase}:${squash}:${+blink}:${+white}`;
  let frames = banks.get(key);
  if (frames) return frames;
  const { w, h } = SIZES[id] ?? STATIC_SIZE, zone = zoneOf(id);
  frames = Array.from({ length: 8 }, (_, f) => spriteCache(`${key}:${f}`, w + 16, h + 16, (p) => {
    const art = new Pix(w, h), s = new SpriteBuilder(art, -Math.max(0, WAVE[f]));
    if (PAINTERS[id]) PAINTERS[id](s, f, blink, phase);
    else staticling(s, zone, f, blink);
    if (corrupted) corruptPixels(art, zone, f);
    p.stamp(art, 8, 16);
    reshape(p, squash);
    if (white) p.each(() => PAL.white);
  }));
  banks.set(key, frames);
  return frames;
}
function shadow(ctx, x, y, radius) {
  const w = radius * 2 + 2;
  const image = spriteCache(`creature-shadow:${radius}`, w, 9, (p) => p.ellipseDither(w / 2, 4, radius, 3.5, PAL.shadow, .7));
  ctx.drawImage(image, Math.round(x - w / 2), Math.round(y - 5));
}
function drawSlices(ctx, image, x, y, glitch, f) {
  if (!glitch || motionPreference?.matches) { ctx.drawImage(image, x, y); return; }
  const cut = 4 + (f * 11) % Math.max(1, image.height - 13), cut2 = Math.min(image.height - 3, cut + Math.max(5, Math.floor(image.height / 5)));
  ctx.drawImage(image, 0, 0, image.width, cut, x, y, image.width, cut);
  ctx.drawImage(image, 0, cut, image.width, 3, x + (f % 2 ? 2 : -2), y + cut, image.width, 3);
  ctx.drawImage(image, 0, cut + 3, image.width, cut2 - cut - 3, x, y + cut + 3, image.width, cut2 - cut - 3);
  ctx.drawImage(image, 0, cut2, image.width, 2, x + (f % 2 ? -1 : 1), y + cut2, image.width, 2);
  ctx.drawImage(image, 0, cut2 + 2, image.width, image.height - cut2 - 2, x, y + cut2 + 2, image.width, image.height - cut2 - 2);
}

/** Bottom-centre feet. All stateful canvas properties are restored. */
export function drawBattleCreature(ctx, id, x, y, opts = {}) {
  const t = opts.t ?? 0, f = Math.floor(t * 6) % 8, blink = Math.floor(t * 8 + zoneOf(id) * 3) % 37 === 0;
  const corrupted = Boolean(opts.corrupted), phase = opts.phase === 2 ? 2 : 1;
  const squash = Math.round(clamp(opts.squash ?? 0, -1, 1) * 2);
  const frames = battleFrames(id, corrupted, phase, squash, blink);
  const { w, h } = battleCreatureSize(id), hurt = motionPreference?.matches ? 0 : clamp(Number(opts.hurt) || 0);
  const dx = Math.round(x - w / 2 + Math.sin(t * 57) * hurt * 3), dy = Math.round(y - h);
  ctx.save();
  ctx.globalAlpha *= clamp(opts.alpha ?? 1);
  shadow(ctx, x, y, id === 'auric' ? 44 : id.startsWith('static-') ? 17 : 27);
  drawSlices(ctx, frames[f], dx, dy, corrupted || id.startsWith('static-'), f);
  if (opts.flash > 0) {
    ctx.globalAlpha *= clamp(opts.flash);
    drawSlices(ctx, battleFrames(id, corrupted, phase, squash, blink, true)[f], dx, dy, corrupted || id.startsWith('static-'), f);
  }
  ctx.restore();
}

function miniGuardian(p, id, f, dir, blink) {
  const w = WAVE[f], s = new SpriteBuilder(p, -Math.max(0, w));
  const back = dir === 'up', side = dir === 'left' || dir === 'right';
  if (id === 'nib') {
    s.ball(9, 23, 3, 2, 'wood').ball(16, 23, 3, 2, 'wood');
    s.ball(12, 17, 8, 7, 'leaf').ball(12, 19, 5, 4, 'cream');
    s.line(12, 12, 13, 6, PAL.leaf[4]);
    s.leaf([[2, 10 + w], [8, 4], [14, 3], [23, 9 - w], [16, 11], [10, 9]], [[5, 8], [15, 7]]);
  } else if (id === 'chime') {
    crystal(s, 5, 3, 4, 9, 'violet'); crystal(s, 16, 2, 4, 10);
    s.face([[8, 7], [17, 7], [19, 17], [22, 20], [3, 20], [6, 17]], 'teal');
    s.line(12, 20, 12 + w, 23, PAL.gold[5]).ball(12 + w, 23, 3, 2, 'gold');
    s.line(6, 19, 18, 19, PAL.teal[7]);
  } else if (id === 'brine') {
    s.face([[16, 15], [24, 11 + w], [22, 21], [17, 23]], 'water');
    s.ball(12, 18, 8, 6, 'water').ball(11, 22, 7, 2, 'water');
    for (const d of [-1, 1]) {
      s.line(12 + d * 6, 12, 12 + d * 10, 5 + w, PAL.rose[4]);
      s.line(12 + d * 6, 13, 12 + d * 11, 11 - w, PAL.rose[5]);
      s.line(12 + d * 6, 15, 12 + d * 10, 17, PAL.rose[5]);
    }
    s.ball(12, 12, 7, 7, 'water').ball(12, 16, 5, 3, 'snow');
  } else if (id === 'spindle') {
    for (const d of [-1, 1]) {
      s.face([[12, 12], [12 + d * 11, 5 + w], [12 + d * 10, 19], [12 + d * 4, 22]], 'violet');
      s.ball(12 + d * 7, 12, 3, 4, 'cream').dot(11 + d * 7, 11, PAL.gold[5], 2, 2);
      s.line(12 + d * 3, 7, 12 + d * 7, 2, PAL.cream[2]);
    }
    s.ball(12, 16, 4, 7, 'cream').ball(12, 10, 5, 5, 'cream');
    for (let i = 0; i < 3; i++) s.line(10 + i * 2, 20, 8 + i * 4, 25, PAL.cream[1]);
  } else if (id === 'cinder') {
    s.curve([[16, 19], [25, 24], [24, 16], [21, 15]], 2, 'ash');
    s.ball(12, 18, 8, 7, 'ash').ball(12, 18, 4, 4, 'ember');
    s.ball(12, 10, 7, 5, 'ash').face([[7, 7], [7, 3], [11, 3], [11, 1], [16, 1], [17, 8]], 'ash');
    s.dot(11, 2, PAL.ember[7], 3, 2).ball(7, 23, 3, 2, 'ash').ball(17, 23, 3, 2, 'ash');
  } else if (id === 'vesper') {
    s.curve([[11, 18], [21, 23], [16, 26], [9 + w, 23]], 3, 'violet');
    s.face([[3, 10], [7, 4], [13, 1], [20, 7], [22, 16], [17, 21], [5, 20]], 'cream');
    s.ball(12, 13, 7, 7, 'violet');
    s.face([[5, 18], [12, 20], [20, 17], [20, 21], [12, 24], [5, 22]], 'cream');
  } else {
    s.curve([[15, 19], [24, 23], [24, 13], [21, 14]], 3, 'teal');
    s.ball(12, 18, 7, 7, 'teal').ball(11, 20, 4, 4, 'cream');
    s.line(8, 7, 5, 2, PAL.gold[6]).line(5, 4, 3, 4, PAL.gold[5]);
    s.line(17, 7, 20, 1, PAL.gold[6]).line(20, 4, 23, 3, PAL.gold[5]);
    s.ball(12, 11, 8, 7, 'teal').ball(9, 15, 6, 3, 'cream');
    s.dot(12, 5, PAL.gold[6], 2, 2).ball(7, 23, 3, 2, 'teal').ball(17, 23, 3, 2, 'teal');
  }
  const eyeY = id === 'nib' ? 16 : id === 'chime' ? 13 : id === 'brine' ? 11 : id === 'cinder' ? 10 : id === 'vesper' ? 12 : 10;
  if (!back) {
    s.eye(dir === 'right' ? 15 : 9, eyeY, blink, .42, PAL.gold[6]);
    if (!side) s.eye(15, eyeY, blink, .42, PAL.gold[6]);
  } else s.line(11, eyeY - 1, 11, eyeY + 3, PAL[ACCENTS[zoneOf(id)]][3]);
}

/** Overworld sprites are authored at their own scale, not downsized battles. */
export function drawSpirit(ctx, guardianId, x, y, opts = {}) {
  const id = typeof guardianId === 'number' ? CREATURE_IDS[guardianId] ?? 'nib' : PAINTERS[guardianId] ? guardianId : 'nib';
  const t = opts.t ?? 0, f = Math.floor(t * (opts.moving ? 9 : 4)) % 8;
  const dir = opts.dir ?? 'down', blink = Math.floor(t * 8 + zoneOf(id) * 3) % 37 === 0;
  const image = spriteCache(`spirit-v2:${id}:${f}:${dir}:${+blink}:${+!!opts.corrupted}`, 26, 27, (p) => {
    miniGuardian(p, id, f, dir, blink);
    if (opts.corrupted) corruptPixels(p, zoneOf(id), f);
  });
  shadow(ctx, x, y, 8);
  const hop = opts.moving ? Math.max(0, WAVE[f]) : 0;
  drawSlices(ctx, image, Math.round(x - 13), Math.round(y - 26 - hop), opts.corrupted, f);
}
export function drawStaticling(ctx, zoneId, x, y, opts = {}) {
  const zone = Math.max(0, Math.min(6, Number(zoneId) || 0));
  const t = opts.t ?? 0, f = Math.floor(t * 6) % 8, back = opts.dir === 'up', side = opts.dir === 'right' ? 1 : opts.dir === 'left' ? -1 : 0;
  const image = spriteCache(`static-mini-v2:${zone}:${f}:${side}:${+back}:${+!!opts.alert}`, 20, 24, (p) => {
    const s = new SpriteBuilder(p, -Math.max(0, WAVE[f]));
    s.ball(10, 17, 7, 6, 'violet');
    if (zone === 0) s.leaf([[8, 13], [4, 8], [10, 7], [14, 11]], [[6, 9], [11, 12]]);
    if (zone === 1) crystal(s, 9, 6, 5, 9);
    if (zone === 2) s.face([[6, 14], [10, 6], [15, 14]], 'water');
    if (zone === 3) s.line(6, 13, 3, 8, PAL.cream[2]).line(13, 12, 17, 8, PAL.cream[2]);
    if (zone === 4) flame(s, 10, 13, 2, f);
    if (zone === 5) s.face([[4, 14], [7, 8], [13, 7], [17, 13], [11, 11]], 'cream');
    if (zone === 6) s.face([[4, 14], [3, 8], [8, 11]], 'gold').face([[12, 11], [17, 8], [17, 14]], 'gold');
    if (!back) {
      s.eye(7 + side, 16, false, opts.alert ? .62 : .43, PAL[ACCENTS[zone]][5]);
      s.eye(13 + side, 16, false, opts.alert ? .62 : .43, PAL[ACCENTS[zone]][5]);
    }
    s.dot(4 + f % 3, 20, PAL.violet[6], 3);
    if (opts.alert && f % 4 < 2) s.dot(9, 0, PAL.gold[6], 2, 4).dot(9, 5, PAL.gold[6], 2);
  });
  shadow(ctx, x, y, 6);
  drawSlices(ctx, image, Math.round(x - 10), Math.round(y - 23), true, f);
}

function heading(ctx, screen, title, subtitle) {
  ctx.fillStyle = PAL.night[1]; ctx.fillRect(0, 0, screen.w, 29);
  drawText(ctx, title, 9, 5, { color: PAL.cream[3] });
  drawText(ctx, subtitle, 9, 18, { font: 'small', color: PAL.ui.dim });
}
function label(ctx, text, x, y, color = PAL.cream[3]) { drawText(ctx, text, x, y, { font: 'small', align: 'center', color, shadow: PAL.ink }); }
function creaturesGallery(ctx, screen, t, page = 0) {
  const pageId = page % 15, portrait = screen.w < 300;
  drawBattleBackground(ctx, screen, pageId < 6 ? BIOMES[(pageId % 3) * 2] : 'static', t, { intensity: .55, reduced: true });
  if (pageId < 6) {
    const corrupted = pageId >= 3, group = pageId % 3, ids = group === 2 ? ['auric'] : CREATURE_IDS.slice(group * 3, group * 3 + 3);
    heading(ctx, screen, corrupted ? 'Under the Static' : 'Guardians of the isle', `${group + 1}/3  ${corrupted ? 'Low-bit palette / moving scanlines' : 'Material light / true colours'}`);
    if (group === 2) {
      if (portrait) {
        drawBattleCreature(ctx, 'auric', screen.w / 2, 159, { t, corrupted });
        drawBattleCreature(ctx, 'auric', screen.w / 2, 293, { t, corrupted, phase: 2 });
        label(ctx, 'AURIC / AWAKENED', screen.w / 2, 303, PAL.gold[6]);
      } else {
        drawBattleCreature(ctx, 'auric', 98, 168, { t, corrupted });
        drawBattleCreature(ctx, 'auric', 284, 168, { t, corrupted, phase: 2 });
        label(ctx, 'AURIC', 98, 181); label(ctx, 'AURIC / PHASE II', 284, 181, PAL.gold[6]);
      }
    } else ids.forEach((id, i) => {
      const x = portrait ? (i === 2 ? screen.w / 2 : screen.w * (i + .5) / 2) : Math.round(screen.w * (i + .5) / 3);
      const y = portrait ? (i === 2 ? Math.min(screen.h - 31, 280) : 143) : 158;
      drawBattleCreature(ctx, id, x, y, { t: t + i * .23, corrupted });
      label(ctx, NAMES[zoneOf(id)].toUpperCase(), x, y + 8);
      if (!portrait) { drawSpirit(ctx, id, x, 200, { t, corrupted }); }
    });
  } else if (pageId === 6) {
    heading(ctx, screen, 'Small trouble, seven flavours', 'Zone staticlings / native battle size');
    CREATURE_IDS.slice(7).forEach((id, i) => {
      const cols = portrait ? 3 : 4, row = Math.floor(i / cols), x = Math.round(screen.w * (i % cols + .5) / cols), y = (portrait ? 107 : 101) + row * (portrait ? 91 : 82);
      drawBattleCreature(ctx, id, x, y, { t: t + i * .18 }); label(ctx, BIOMES[i].toUpperCase(), x, y + 6);
    });
  } else if (pageId === 7) {
    heading(ctx, screen, 'A pocket-sized parade', 'Clean / Static / roaming / noticed');
    CREATURE_IDS.slice(0, 7).forEach((id, i) => {
      const column = portrait ? 0 : Math.floor(i / 4), row = portrait ? i : i % 4;
      const y = portrait ? 60 + row * Math.floor((screen.h - 75) / 6) : 63 + row * 42;
      const x = portrait ? 82 : 66 + column * 192, gap = portrait ? 34 : 29;
      label(ctx, NAMES[i].toUpperCase(), portrait ? 33 : 26 + column * 192, y - 11);
      drawSpirit(ctx, id, x, y, { t, moving: true });
      drawSpirit(ctx, id, x + gap, y, { t, corrupted: true });
      drawStaticling(ctx, i, x + gap * 2, y, { t });
      drawStaticling(ctx, i, x + gap * 3, y, { t, alert: true });
    });
  } else {
    const id = CREATURE_IDS[pageId - 8], wide = id === 'auric';
    heading(ctx, screen, `${NAMES[pageId - 8]} / motion study`, 'Idle / anticipation / impact / blink');
    const count = portrait || wide ? 2 : 3;
    for (let i = 0; i < count; i++) {
      const x = portrait ? screen.w / 2 : Math.round(screen.w * (i + .5) / count), y = portrait ? (i === 0 ? 150 : Math.min(screen.h - 26, 310)) : 157;
      drawBattleCreature(ctx, id, x, y, { t: t + i * .45, squash: i === 1 ? Math.sin(t * 2) : 0, hurt: i === 2 ? .65 : 0, flash: i === 2 && t % 2 < .12 ? 1 : 0, phase: wide && i === 1 ? 2 : 1 });
      label(ctx, ['IDLE', wide ? 'AWAKENED' : 'GATHERING', 'HURT'][i], x, y + 8);
    }
    if (!portrait) for (let i = 0; i < 6; i++) drawSpirit(ctx, id, 96 + i * 38, 201, { t: i * .18 + t * .15, moving: true, dir: i > 2 ? 'right' : 'down' });
  }
}
export const galleries = { creatures: creaturesGallery };
