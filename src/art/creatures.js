// Original, shape-built sprites. Frames are rasterised once; the live renderer
// only places cached canvases and integer scanline slices (never scales a sprite).
import { PAL } from './palette.js';
import { Pix, LIGHT, shadeRamp, spriteCache, u32 } from './paint.js';
import { hash2, clamp } from '../engine/util.js';
import { drawText } from '../engine/font.js';
import { drawBattleBackground } from './backgrounds.js';
import { SPECIES, WARDENS, dexEntryOf } from '../content/static-dex.js';
import { drawCharacter } from './characters.js';
import { drawPortrait } from './portraits.js';

export const CREATURE_IDS = ['nib', 'chime', 'brine', 'spindle', 'cinder', 'vesper', 'auric', 'static-0', 'static-1', 'static-2', 'static-3', 'static-4', 'static-5', 'static-6', ...SPECIES.map(s => s.id), ...WARDENS.map(s => s.id), 'fen'];
const NAMES = ['Nib', 'Chime', 'Brine', 'Spindle', 'Cinder', 'Vesper', 'Auric'];
const BIOMES = ['meadow', 'grove', 'cove', 'heights', 'forge', 'archives', 'spire'];
const ACCENTS = ['leaf', 'teal', 'water', 'sky', 'ember', 'gold', 'teal'];
const WARDEN_IDS = new Set(WARDENS.map(w => w.id));
const SIZES = Object.freeze({ nib: { w: 88, h: 86 }, chime: { w: 88, h: 94 }, brine: { w: 108, h: 84 }, spindle: { w: 112, h: 94 }, cinder: { w: 100, h: 98 }, vesper: { w: 92, h: 96 }, auric: { w: 154, h: 114 } });
const STATIC_SIZE = Object.freeze({ w: 54, h: 54 });
// Transparent pose gutters keep antlers, tail fins and roots intact at both
// anticipation extremes. Bounds include those gutters; the feet do not move.
const BOUNDS = Object.fromEntries(CREATURE_IDS.map((id) => {
  const size = id === 'fen' ? { w: 48, h: 64 } : WARDEN_IDS.has(id) ? { w: 100, h: 104 } : SIZES[id] ?? STATIC_SIZE;
  return [id, Object.freeze({ w: size.w + 16, h: size.h + 16 })];
}));
const motionPreference = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const WAVE = [0, 1, 1, 1, 0, -1, -1, -1];
const RAMPS = Object.fromEntries(Object.entries(PAL).filter(([, v]) => Array.isArray(v)).map(([key, r]) => [key, [r[0], r[Math.round((r.length - 1) * .28)], r[Math.round((r.length - 1) * .52)], r[Math.round((r.length - 1) * .76)], r.at(-1)]]));
const FACE_MATERIALS = ['cream', 'teal', 'snow', 'cream', 'sand', 'snow', 'cream'];
const CORRUPT_RAMP = [PAL.violet[1], PAL.violet[3], PAL.violet[5], PAL.violet[7]];
const VESPER_FACE_RAMP = [PAL.violet[3], PAL.violet[6], PAL.violet[7], PAL.violet[8]];
// Quantize within a material, rather than throwing every material into the same
// violet luminance ramp. The identity-bearing accents and pale faces survive.
const MATERIALS = new Map();
for (const [name, colors] of Object.entries(PAL)) {
  if (!Array.isArray(colors)) continue;
  const levels = [colors[0], colors[Math.round((colors.length - 1) * .38)], colors[Math.round((colors.length - 1) * .72)], colors.at(-1)];
  colors.forEach((color, i) => MATERIALS.set(u32(color), {
    name, value: i / (colors.length - 1), color: levels[Math.round(i / (colors.length - 1) * 3)],
  }));
}
const FOCAL_AREAS = [
  [43, 62, 21, 20], [42, 44, 18, 18], [42, 44, 25, 23],
  [56, 43, 17, 24], [48, 63, 20, 18], [46, 41, 22, 20], [58, 49, 34, 28],
];

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

// Sculpted motif materials. Polygon masks retain the authored silhouette, while
// cylinder/ellipsoid normals give every broad surface a real top-left light.
// This is a separate modeller so the established guardian art stays untouched.
class SculptBuilder extends SpriteBuilder {
  face(points, material, normal = [-.25, -.45, .85], edge = true) {
    const r = RAMPS[material], pts = points.map(([x, y]) => [x, y + this.dy]);
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const left = Math.min(...xs), top = Math.min(...ys) + this.dy;
    const width = Math.max(2, Math.max(...xs) - left), height = Math.max(2, Math.max(...ys) + this.dy - top);
    const metallic = ['gold', 'teal', 'water', 'sky', 'stone', 'ash'].includes(material);
    this.p.poly(pts, (x, y) => {
      const nx = clamp((x - left) / width * 2 - 1, -.98, .98);
      const ny = clamp((y - top) / height * 1.4 - .7, -.85, .85);
      const nz = Math.sqrt(Math.max(.04, 1 - nx * nx * .72 - ny * ny * .5));
      const diffuse = Math.max(0, nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z);
      const facet = normal[0] > .3 ? -.12 : normal[0] < -.4 ? .06 : 0;
      const specular = metallic && nx > -.65 && nx < -.32 && ny > -.48 && ny < -.15 ? .18 : 0;
      return shadeRamp(r, clamp(.14 + .81 * diffuse + facet + specular), x, y, diffuse < .22 ? .12 : 0);
    });
    if (edge) for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const lit = (a[1] + b[1]) / 2 < top + height * .3 || (a[0] + b[0]) / 2 < left + width * .18;
      this.p.line(...a, ...b, r[lit ? 1 : 0]);
    }
    return this;
  }
  rim(x0, y0, x1, y1, material) {
    this.line(x0, y0, x1, y1, RAMPS[material][4]);
    return this;
  }
  core(x, y, rx, ry, material, phase = 1) {
    this.ball(x, y, rx + 2, ry + 2, 'gold').ball(x, y, rx, ry, material, phase === 2 ? .13 : 0);
    this.p.ellipse(x - rx * .28, y - ry * .3 + this.dy, Math.max(1, rx * .25), Math.max(1, ry * .22), PAL.cream[3]);
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
  const w = WAVE[f % WAVE.length];
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
  s.ball(27, 34, 15, 12, FACE_MATERIALS[zone], zone === 1 ? .12 : 0);
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

// Each motif has its own construction, not a shared blob with different colours.
// The visible terraces, paired tails, unequal threads and channel lanterns echo
// the toy essence's structure without pretending to depict real model internals.
function specimenBattle(s, id, f, blink, phase) {
  const w = WAVE[f], zone = zoneOf(id), material = ACCENTS[zone];
  let ey = 30, ex = 27, gap = 7;
  if (id === 'stepbud') {
    s.face([[8, 46], [8, 35], [14, 35], [14, 25], [21, 25], [21, 15], [33, 15], [33, 25], [40, 25], [40, 35], [46, 35], [46, 46]], 'leaf');
    s.line(10, 36, 44, 36, PAL.leaf[6]).line(16, 26, 38, 26, PAL.leaf[7]);
    s.face([[33, 15], [33, 25], [40, 25], [40, 35], [46, 35], [46, 46], [41, 43], [41, 37], [35, 37], [35, 28], [29, 28], [29, 18]], 'leaf', [.7, .2, .6], false);
    s.line(22, 17, 28, 17, PAL.leaf[7]).line(15, 28, 20, 28, PAL.leaf[6]);
    s.ball(27, 38, 10, 8, 'cream');
    s.leaf([[24, 15], [18, 7 + w], [25, 5], [30, 14]], [[23, 8], [27, 14]]);
    s.leaf([[29, 15], [32, 4 - w], [40, 8], [34, 16]], [[34, 8], [30, 16]]);
    ey = 36; gap = 5;
  } else if (id === 'ripple-seed') {
    s.curve([[23, 35], [8, 44], [3, 24], [8, 14 + w]], 4, 'leaf');
    s.curve([[32, 35], [48, 46], [52, 24], [46, 14 - w]], 4, 'leaf');
    s.ball(8, 14 + w, 5, 7, 'rose').ball(46, 14 - w, 5, 7, 'rose');
    s.face([[27, 9], [37, 27], [35, 43], [27, 49], [19, 43], [17, 27]], 'sand');
    s.face([[27, 12], [26, 44], [21, 39], [20, 28]], 'cream', [-.6, -.5, .7], false);
    gap = 5;
  } else if (id === 'crooked-pebble') {
    s.face([[5, 35], [16, 15], [36, 10], [45, 21], [42, 40], [31, 48], [10, 46]], 'stone');
    s.face([[16, 15], [36, 10], [32, 30], [13, 36], [5, 35]], 'teal');
    s.face([[32, 30], [45, 21], [42, 40], [31, 48]], 'violet', [.6, .2, .7]);
    s.line(14, 40, 22, 40, PAL.gold[6]).dot(15, 38, PAL.gold[6], 1, 5);
    ex = 24; ey = 32; gap = 6;
  } else if (id === 'lantern-sliver') {
    s.curve([[20, 18], [8, 3], [36, 0], [34, 15]], 2, 'gold');
    s.face([[20, 12], [34, 15], [43, 36], [34, 48], [15, 44], [12, 25]], 'teal');
    s.face([[24, 17], [33, 20], [37, 35], [30, 43], [19, 39], [18, 26]], 'gold');
    s.line(18, 30, 37, 30, PAL.teal[3]).line(27, 18, 27, 42, PAL.teal[3]);
    s.ball(27, 47, 4, 3, 'gold'); ey = 31; gap = 5;
  } else if (id === 'foam-flicker') {
    s.face([[5, 41], [12, 32], [19, 36], [31, 32], [45, 40], [48, 47], [9, 48]], 'water');
    s.ball(27, 31, 13, 12, 'water').ball(20, 18 + w, 9, 8, 'snow');
    s.ball(33, 21 - w, 8, 8, 'snow').ball(12, 28, 6, 6, 'snow');
    s.ball(41, 31, 6, 7, 'snow').ball(27, 32, 9, 7, 'snow');
    s.line(12, 44, 19, 43, PAL.water[7]).line(28, 45, 39, 45, PAL.water[6]); ey = 31; gap = 5;
  } else if (id === 'undertow-dot') {
    s.face([[13, 35], [3, 17 + w], [14, 21], [22, 32]], 'water');
    s.face([[34, 32], [43, 17 - w], [51, 16 - w], [43, 37]], 'water');
    s.curve([[27, 32], [44, 41], [41, 49], [19, 48]], 3, 'water');
    s.ball(27, 29, 12, 12, 'water').ball(25, 30, 8, 7, 'snow');
    s.line(19, 19, 23, 15, PAL.sky[7]).line(31, 15, 35, 19, PAL.sky[7]);
    ey = 29; gap = 5;
  } else if (id === 'whisper-knot') {
    s.curve([[10, 44], [3, 13], [27, 2], [36, 18]], 4, 'violet');
    s.curve([[36, 18], [53, 38], [28, 51], [18, 28]], 3, 'cream');
    s.curve([[18, 28], [10, 10], [42, 6], [41, 32]], 1, 'sky');
    s.ball(27, 29, 10, 9, 'violet').ball(27, 29, 7, 6, 'cream');
    for (let i = 0; i < 3; i++) s.line(21 + i * 6, 37, 14 + i * 11, 48 + (i % 2) * w, PAL[['violet', 'cream', 'sky'][i]][5]);
    ey = 28; gap = 4;
  } else if (id === 'loomlet') {
    s.face([[7, 13], [13, 10], [18, 43], [12, 47]], 'wood');
    s.face([[38, 10], [44, 13], [42, 47], [36, 43]], 'wood');
    s.line(11, 15, 41, 15, PAL.gold[5]).line(15, 43, 39, 43, PAL.gold[4]);
    for (let i = 0; i < 3; i++) s.curve([[18 + i * 8, 16], [14 + i * 8, 25], [33 - i * 4, 34], [20 + i * 6, 43]], i === 0 ? 2 : 1, ['violet', 'sky', 'cream'][i]);
    s.ball(27, 27, 9, 7, 'cream'); ey = 26; gap = 4;
    s.line(16, 7, 11, 3 + w, PAL.cream[2]).line(37, 7, 42, 3 - w, PAL.cream[2]);
  } else if (id === 'kiln-cricket') {
    for (const d of [-1, 1]) {
      s.line(27 + d * 9, 33, 27 + d * 20, 27 - w, PAL.ash[3]).line(27 + d * 20, 27 - w, 27 + d * 22, 47, PAL.ash[4]);
      s.line(27 + d * 7, 39, 27 + d * 13, 47 + w, PAL.ash[4]);
      s.line(27 + d * 6, 19, 27 + d * 11, 6 - d * w, PAL.wood[4]);
    }
    s.ball(27, 32, 10, 14, 'ash').ball(27, 23, 11, 8, 'ash');
    s.face([[19, 31], [25, 33], [24, 43], [18, 38]], 'ember');
    s.face([[29, 29], [35, 27], [36, 38], [30, 40]], 'ember');
    s.dot(22, 34, PAL.ember[8], 2, 3).dot(32, 31, PAL.ember[8], 2, 3); ey = 23; gap = 5;
  } else if (id === 'ember-chip') {
    s.face([[8, 17], [36, 13], [45, 21], [42, 42], [16, 47], [8, 38]], 'ash');
    s.face([[8, 17], [36, 13], [32, 35], [8, 38]], 'stone');
    for (const x of [13, 23, 33]) { s.dot(x, 11, PAL.wood[3], 4, 5).dot(x + 1, 11, PAL.gold[6], 2); s.dot(x, 44, PAL.wood[2], 4, 5); }
    s.line(12, 37, 20, 37, PAL.ember[6]).line(20, 37, 20, 44, PAL.ember[6]);
    s.line(36, 23, 42, 23, PAL.ember[7]); flame(s, 40, 17, 3, f);
    ex = 25; ey = 27; gap = 6;
  } else if (id === 'margin-mote') {
    s.face([[10, 8], [35, 10], [45, 20], [38, 46], [13, 48], [17, 28]], 'cream');
    s.face([[35, 10], [45, 20], [32, 20]], 'sand');
    s.line(18, 12, 15, 42, PAL.rose[4]);
    for (let i = 0; i < 3; i++) s.line(22, 17 + i * 5, 34 + i % 2 * 4, 17 + i * 5, PAL.violet[3]);
    s.ball(28, 35, 8, 8, 'violet'); s.curve([[13, 34], [4, 31], [2, 42], [9, 45 + w]], 2, 'violet');
    ex = 28; ey = 34; gap = 4;
  } else if (id === 'index-wisp') {
    s.curve([[27, 36], [45, 43], [28, 52], [15, 43]], 3, 'violet');
    s.face([[15, 12], [27, 4 + w], [40, 13], [37, 37], [27, 43], [17, 36]], 'violet');
    for (const d of [-1, 1]) {
      s.face([[27 + d * 8, 17], [27 + d * 21, 12 + d * w], [27 + d * 20, 37], [27 + d * 8, 32]], 'cream');
      s.line(27 + d * 11, 21, 27 + d * 18, 19 + d * w, PAL.gold[4]);
      s.line(27 + d * 11, 26, 27 + d * 17, 25, PAL.violet[3]);
    }
    s.ball(27, 25, 8, 9, 'violet'); ey = 24; gap = 4;
  } else if (id === 'crown-crumb') {
    s.face([[10, 16], [15, 7], [22, 17], [28, 3 + w], [34, 17], [43, 7], [45, 32], [37, 46], [17, 47], [8, 33]], 'gold');
    s.face([[14, 27], [39, 27], [36, 42], [19, 43]], 'teal');
    s.face([[27, 12], [31, 19], [27, 24], [23, 19]], 'teal');
    s.dot(15, 22, PAL.cream[3], 2).dot(38, 22, PAL.gold[8], 2);
    for (let i = 0; i < 4; i++) s.line(22 + i * 3, 40, 22 + i * 3, 43, PAL.gold[5]);
    ey = 32; gap = 6;
  } else if (id === 'prism-pip') {
    s.face([[27, 5], [38, 17], [35, 38], [27, 48], [19, 38], [16, 17]], 'teal');
    s.face([[27, 5], [27, 45], [19, 38], [16, 17]], 'sky', [-.5, -.5, .7]);
    s.face([[16, 21], [4, 12], [8, 33], [20, 38]], 'gold');
    s.face([[37, 21], [49, 12 - w], [phase === 2 ? 51 : 45, 36], [34, 38]], 'violet');
    s.line(27, 9, 27, 20, PAL.cream[3]); s.line(9, 22, 15, 30, PAL.gold[7]);
    ey = 29; gap = 4;
  }
  specimenDetails(s, id, f, phase);
  s.eye(ex - gap, ey, blink, .85, PAL[material][6]).eye(ex + gap, ey, blink, .85, PAL[material][6]);
  s.line(ex - 2, ey + 7, ex, ey + 8, PAL.wood[1]).line(ex, ey + 8, ex + 2, ey + 7, PAL.wood[1]);
}

function specimenDetails(s, id, f, phase) {
  const w = WAVE[f];
  if (id === 'stepbud') {
    s.rim(10, 36, 17, 36, 'leaf').rim(16, 26, 22, 26, 'leaf').rim(22, 16, 28, 16, 'leaf');
    s.line(30, 19, 30, 24, PAL.leaf[2]).line(36, 29, 36, 34, PAL.leaf[2]);
    s.line(22, 7 + w, 27, 14, PAL.leaf[3]).line(34, 7 - w, 31, 13, PAL.leaf[3]);
    s.dot(12, 42, PAL.leaf[5], 3, 2).dot(38, 39, PAL.leaf[2], 3, 2);
  } else if (id === 'ripple-seed') {
    s.rim(20, 27, 25, 16, 'sand').rim(20, 29, 21, 34, 'cream');
    s.line(30, 17, 34, 28, PAL.sand[2]).line(34, 28, 32, 40, PAL.sand[2]);
    s.curve([[8, 22 + w], [8, 29], [12, 35], [19, 38]], 1, 'leaf');
    s.curve([[46, 22 - w], [46, 29], [42, 35], [35, 38]], 1, 'leaf');
    s.dot(6, 11 + w, PAL.rose[7], 2, 3).dot(44, 11 - w, PAL.rose[7], 2, 3);
  } else if (id === 'crooked-pebble') {
    s.rim(10, 27, 17, 17, 'teal').rim(18, 17, 29, 14, 'teal');
    s.line(33, 18, 29, 26, PAL.teal[1]).line(29, 26, 34, 31, PAL.violet[2]).line(34, 31, 32, 39, PAL.violet[2]);
    s.face([[11, 39], [17, 42], [13, 45]], 'stone');
    s.line(38, 24, 40, 29, PAL.violet[6]);
  } else if (id === 'lantern-sliver') {
    s.rim(17, 24, 21, 16, 'teal').rim(23, 18, 29, 20, 'gold');
    s.line(33, 24, 36, 34, PAL.gold[7]);
    s.dot(23, 22, PAL.cream[3], 2, 3).dot(30, 37, PAL.gold[8], 2);
    s.ball(27, 47, 2, 2, 'teal', .1);
  } else if (id === 'foam-flicker') {
    s.rim(15, 13 + w, 19, 11 + w, 'snow').rim(29, 17 - w, 32, 15 - w, 'snow');
    s.line(14, 40, 19, 39, PAL.water[8]).line(19, 39, 23, 40, PAL.water[8]);
    s.line(33, 42, 38, 42, PAL.sky[6]);
    s.ball(39, 12 + w, 2, 2, 'snow');
  } else if (id === 'undertow-dot') {
    s.rim(18, 24, 21, 20, 'water').rim(20, 21, 24, 19, 'water');
    s.line(8, 22 + w, 15, 31, PAL.water[2]).line(45, 21 - w, 40, 31, PAL.water[2]);
    s.line(22, 45, 32, 46, PAL.sky[7]);
    s.ball(20, 10 + w, 2, 2, 'water').ball(34, 9 - w, 2, 2, 'water');
  } else if (id === 'whisper-knot') {
    for (const [x, y] of [[10, 23], [11, 17], [14, 12], [20, 9], [35, 39], [39, 35]]) s.line(x - 1, y - 1, x + 2, y + 1, PAL.violet[7]);
    s.ball(14, 45 + w, 3, 2, 'violet').ball(36, 46 - w, 2, 2, 'cream');
    s.rim(22, 23, 26, 22, 'cream');
  } else if (id === 'loomlet') {
    for (const x of [11, 40]) {
      s.ball(x, 15, 4, 3, 'gold').ball(x + (x < 20 ? 3 : -2), 42, 4, 3, 'gold');
      s.line(x - 1, 19, x + 1, 33, PAL.wood[2]);
      s.rim(x - 2, 12, x + 1, 12, 'wood');
    }
    s.line(23, 18, 25, 20, PAL.cream[2]).line(28, 35, 30, 37, PAL.sky[7]);
  } else if (id === 'kiln-cricket') {
    s.rim(20, 19, 24, 17, 'ash').rim(20, 32, 20, 36, 'ember');
    s.line(26, 32, 26, 42, PAL.ash[1]).line(28, 33, 28, 43, PAL.ash[1]);
    s.dot(32, 30, PAL.cream[3], 2, 2);
    for (const d of [-1, 1]) s.ball(27 + d * 20, 27 - w, 2, 2, 'ash');
  } else if (id === 'ember-chip') {
    s.face([[17, 32], [29, 31], [32, 42], [18, 44]], 'ash');
    s.core(24, 37, 4, 4, 'ember', 1);
    s.line(24, 33, 25, 40, PAL.ash[1]);
    s.rim(11, 21, 16, 18, 'stone').rim(17, 17, 29, 16, 'stone');
    s.line(35, 31, 39, 29, PAL.ash[1]).line(39, 29, 39, 36, PAL.ash[1]);
    s.dot(15, 13, PAL.gold[8], 1, 2).dot(25, 12, PAL.gold[8], 1, 2);
  } else if (id === 'margin-mote') {
    s.rim(13, 11, 27, 12, 'cream').rim(13, 13, 15, 18, 'cream');
    s.face([[13, 43], [22, 44], [19, 48], [13, 48]], 'sand');
    s.line(21, 30, 23, 28, PAL.violet[7]);
    s.ball(8, 45 + w, 2, 3, 'violet');
  } else if (id === 'index-wisp') {
    for (const d of [-1, 1]) {
      s.rim(27 + d * 11, 20, 27 + d * 18, 16 + d * w, 'cream');
      s.line(27 + d * 12, 29, 27 + d * 18, 29, PAL.sand[3]);
      s.line(27 + d * 12, 32, 27 + d * 17, 32, PAL.sand[3]);
    }
    s.line(21, 38, 25, 40, PAL.violet[7]);
  } else if (id === 'crown-crumb') {
    s.rim(12, 19, 15, 10, 'gold').rim(25, 15, 28, 8 + w, 'gold');
    s.line(34, 20, 39, 14, PAL.gold[3]);
    for (let i = 0; i < 3; i++) s.line(17 + i * 7, 22, 20 + i * 7, 24, PAL.gold[3]);
    s.dot(26, 17, PAL.cream[3], 2, 3);
  } else if (id === 'prism-pip') {
    s.face([[27, 8], [34, 18], [31, 25], [27, 20]], 'snow', [-.6, -.5, .7], false);
    s.face([[31, 34], [35, 20], [33, 39], [28, 45]], 'teal', [.8, .2, .4], false);
    s.rim(19, 19, 24, 10, 'sky').rim(7, 18, 10, 23, 'gold');
    s.line(42, 21 - w, phase === 2 ? 46 : 42, 31, PAL.violet[7]);
  }
}

function fenBattle(s, f, blink) {
  const w = WAVE[f];
  s.face([[7, 22], [30, 17], [44, 27], [42, 53], [9, 51]], 'wood');
  for (let i = 0; i < 3; i++) {
    s.face([[5 + i * 10, 7 + i % 2 * 4], [11 + i * 10, 5 + i % 2 * 4], [17 + i * 10, 37], [9 + i * 10, 39]], 'cream');
    s.ball(8 + i * 10, 8 + i % 2 * 4, 4, 3, 'sand');
    // A tiny, native-pixel "32" seal on each oversized rolled atlas.
    const x = 8 + i * 10;
    for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [2, 1], [1, 2], [2, 2], [2, 3], [0, 4], [1, 4], [2, 4], [4, 0], [5, 0], [6, 0], [6, 1], [5, 2], [4, 3], [4, 4], [5, 4], [6, 4]]) s.dot(x + dx, 20 + dy, PAL.teal[3]);
  }
  s.face([[17, 49], [25, 49], [23, 62], [11, 62], [11, 58]], 'wood');
  s.face([[28, 48], [35, 47], [40, 59], [43, 62], [30, 62]], 'wood');
  s.ball(25, 40, 12, 14, 'roof');
  s.face([[13, 36], [18, 30], [32, 33], [38, 46], [17, 49]], 'roof');
  s.line(18, 31, 30, 46, PAL.gold[4]);
  s.ball(24, 22, 12, 13, 'wood').ball(23, 25, 10, 9, 'sand');
  s.face([[12, 17], [17, 10], [27, 11], [35, 19], [26, 16], [23, 20], [18, 16]], 'wood');
  s.eye(18, 25, blink, .8).eye(28, 25, blink, .8);
  s.line(21, 32, 25, 33, PAL.wood[1]);
  for (const x of [18, 28]) { s.ball(x, 16, 5, 4, 'gold').ball(x, 16, 3, 2, 'teal').dot(x - 1, 15, PAL.cream[3]); }
  s.face([[13, 34], [21, 36], [34, 32], [35, 37], [22, 41], [13, 38]], 'teal');
  s.face([[32, 36], [40, 38], [46, 33 + w], [43, 44 + w], [34, 42]], 'teal');
  s.face([[2, 38], [14, 35], [18, 46], [5, 49]], 'cream');
  s.line(5, 40, 12, 39, PAL.teal[3]).line(7, 44, 14, 42, PAL.teal[3]);
  s.ball(15, 44, 3, 3, 'sand');
}

function wardenGaze(s, x, y, gap, blink, phase) {
  for (const d of [-1, 1]) {
    const ex = x + d * gap;
    s.face([[ex - 5, y - 3], [ex + 5, y - 3], [ex + 4, y + 4], [ex - 4, y + 3]], 'night');
    s.line(ex - 3, y, ex + 3, y, PAL.gold[phase === 2 ? 8 : 6]);
    if (!blink) s.dot(ex - 1, y - 1, PAL.cream[3], 2, 3);
    s.line(ex - 6, y - 5 - d, ex + 5, y - 5 + d, PAL.ash[1]);
  }
}

function wardenBattle(s, id, f, blink, phase, corrupted = false) {
  const w = WAVE[f], awake = phase === 2, zone = zoneOf(id);
  if (corrupted) {
    // Broken raster halo: no continuous screen-space shimmer or random noise.
    s.p.ellipse(50, 53 + s.dy, 47, 47, (x, y, nx, ny, nz) => {
      if (nz > .2 || (Math.floor((x + y + f) / 9) % 3 === 0)) return null;
      return PAL.violet[awake ? 6 : 4];
    });
    for (let i = 0; i < 4; i++) {
      const x = [5, 88, 4, 88][i], y = [23, 14, 78, 83][i] + w * (i % 2 ? 1 : -1);
      s.face([[x, y], [x + 7, y - 4], [x + 5, y + 5]], i % 2 ? 'teal' : 'violet');
    }
  }
  if (id === 'root-raster') {
    // A walking root cathedral: a round old trunk inside terraced living armour.
    for (const d of [-1, 1]) {
      s.curve([[50 + d * 20, 65], [50 + d * 44, 48], [50 + d * 32, 83], [50 + d * 45, 97]], awake ? 7 : 6, 'wood');
      s.curve([[50 + d * 18, 81], [50 + d * 28, 91], [50 + d * 12, 98], [50 + d * 29, 100]], 5, 'wood');
      s.leaf([[50 + d * 28, 53], [50 + d * (awake ? 48 : 40), 29 - w], [50 + d * 27, 33], [50 + d * 18, 57]], [[50 + d * 30, 42], [50 + d * 22, 54]]);
    }
    s.ball(50, 65, 31, 31, 'wood');
    s.face([[16, 73], [17, 53], [26, 53], [27, 32], [36, 32], [37, 14], [63, 14], [64, 32], [74, 32], [75, 53], [84, 53], [84, 74]], 'leaf');
    for (let i = 0; i < 3; i++) {
      const x = 22 + i * 8, y = 58 - i * 19;
      s.rim(x, y, 78 - i * 8, y - 1, 'leaf');
      s.line(x + 2, y + 2, 76 - i * 8, y + 1, PAL.leaf[2]);
    }
    s.ball(50, 57, 21, 18, 'wood');
    s.face([[32, 44], [50, 39], [69, 45], [65, 63], [49, 69], [35, 62]], 'wood');
    wardenGaze(s, 50, 52, 9, blink, phase);
    s.core(49, 79, 10, 11, 'teal', phase);
    for (let i = 0; i < 3; i++) s.line(28 + i * 5, 75, 25 + i * 6, 87, PAL.wood[1]);
    s.leaf([[43, 20], [19, 8 + w], [38, 2], [51, 11]], [[29, 8], [46, 17]]);
    s.leaf([[53, 18], [awake ? 79 : 69, 2 - w], [77, 17], [58, 27]], [[68, 12], [56, 22]]);
    if (awake) for (const x of [22, 71]) s.core(x, 49, 3, 5, 'teal', 2);
  } else if (id === 'offbeat-bell') {
    // Suspended bronze clapper, crystal shoulders and a deeply curved bell skirt.
    s.curve([[28, 27], [15, -1], [80, -2], [73, 26]], 4, 'gold');
    s.ball(49, 36, 23, 24, 'teal');
    s.face([[29, 25], [66, 25], [73, 61], [88, 81], [85, 88], [14, 88], [11, 81], [24, 62]], 'teal');
    s.face([[62, 27], [70, 62], [84, 81], [68, 75], [60, 45]], 'violet', [.7, .2, .6], false);
    for (const d of [-1, 1]) {
      s.face([[50 + d * 23, 35], [50 + d * 37, 23], [50 + d * 39, 50], [50 + d * 27, 60]], 'violet');
      s.rim(50 + d * 26, 36, 50 + d * 34, 29, 'teal');
    }
    s.ball(49, 83, 37, 8, 'gold');
    s.ball(49, 82, 29, 4, 'teal');
    s.face([[30, 43], [50, 38], [68, 43], [63, 59], [36, 59]], 'teal');
    wardenGaze(s, 49, 47, 9, blink, phase);
    s.core(49, 67, 8, 10, 'gold', phase);
    s.line(49, 86, 50 + w * 3, 97, PAL.gold[3]).ball(50 + w * 3, 97, 8, 5, 'gold');
    for (let i = 0; i < (awake ? 3 : 1); i++) {
      const x = [13, 86, 52][i], y = [15 + w, 12 - w, 4][i];
      s.face([[x, y - 4], [x + 6, y], [x, y + 7], [x - 4, y]], 'gold');
      s.rim(x - 2, y - 1, x, y - 3, 'gold');
    }
    if (awake) s.line(31, 73, 67, 73, PAL.cream[3]).line(36, 75, 63, 75, PAL.gold[6]);
  } else if (id === 'undertow-ledger') {
    // A tide armoured in hinged archive leaves; the storm core opens in phase II.
    for (const d of [-1, 1]) {
      s.curve([[50 + d * 20, 70], [50 + d * 48, 49], [50 + d * 46, 14], [50 + d * 24, 20 + w]], 7, 'water');
      s.face([[50 + d * 26, 26], [50 + d * 45, 13], [50 + d * 42, 37]], 'sky');
    }
    s.ball(50, 61, 33, 35, 'water').ball(50, 91, 31, 8, 'water');
    s.face([[10, 46], [46, 53], [50, 46], [55, 53], [91, 45], [86, 91], [51, 99], [15, 90]], 'wood');
    for (const d of [-1, 1]) {
      s.face([[50 + d * 6, 56], [50 + d * 36, 48], [50 + d * 31, 86], [50 + d * 6, 94]], d < 0 ? 'cream' : 'snow');
      for (let i = 0; i < 4; i++) s.line(50 + d * 11, 62 + i * 7, 50 + d * 29, 58 + i * 7, PAL.water[i === 2 ? 6 : 3]);
      s.rim(50 + d * 8, 56, 50 + d * 34, 50, 'snow');
    }
    s.ball(50, 32, 22, 21, 'water');
    s.face([[30, 27], [40, 19], [60, 19], [71, 27], [65, 41], [36, 41]], 'water');
    wardenGaze(s, 50, 31, 10, blink, phase);
    s.core(50, awake ? 55 : 48, awake ? 11 : 7, awake ? 12 : 7, 'sky', phase);
    for (let i = 0; i < (awake ? 3 : 1); i++) s.ball(31 + i * 19, 9 + i % 2 * 4 + w, 4, 4, 'snow');
    s.rim(31, 23, 37, 17, 'water');
  } else if (id === 'loom-of-three') {
    // Massive bobbins support an articulated hourglass body, not an empty frame.
    for (const d of [-1, 1]) {
      const x = 50 + d * 34;
      s.face([[x - 7, 16], [x + 7, 16], [x + 8, 86], [x - 7, 88]], 'wood');
      s.ball(x, 18, 11, 7, 'gold').ball(x, 87, 12, 7, 'gold');
      for (let i = 0; i < 8; i++) s.line(x - 5, 29 + i * 6, x + 6, 27 + i * 6, PAL.cream[i % 3 ? 1 : 2]);
      s.ball(x, 18, 5, 3, 'wood');
    }
    s.ball(50, 53, 21, 32, 'violet');
    s.face([[35, 24], [66, 24], [58, 55], [68, 88], [31, 88], [42, 55]], 'violet');
    s.ball(50, 27, 22, 8, 'cream').ball(50, 87, 24, 8, 'cream');
    for (let i = 0; i < 3; i++) {
      const r = [4, 2, 1][i], mat = ['violet', 'sky', 'cream'][i];
      s.curve([[24, 27 + i * 6], [40, 10 + i * 19], [67, 70 + i * 4], [77, 80 - i * 7]], r, mat);
      s.curve([[75, 27 + i * 6], [65, 17 + i * 15], [34, 78 - i * 4], [23, 81 - i * 7]], r, mat);
    }
    s.face([[34, 35], [50, 28], [66, 35], [62, 50], [38, 50]], 'violet');
    wardenGaze(s, 50, 40, 8, blink, phase);
    s.core(50, 63, awake ? 11 : 8, 12, 'sky', phase);
    for (const d of [-1, 1]) {
      s.curve([[50 + d * 10, 29], [50 + d * 15, 11], [50 + d * 25, 11], [50 + d * (awake ? 32 : 24), 3 + w]], 2, 'cream');
      if (awake) s.face([[50 + d * 20, 95], [50 + d * 32, 99], [50 + d * 19, 101]], 'gold');
    }
  } else if (id === 'furnace-witness') {
    for (const d of [-1, 1]) {
      const x = 50 + d * 30;
      s.face([[x - 6, 35], [x - 6, 20], [x + 7, 20], [x + 7, 38]], 'ash');
      s.ball(x, 22, 8, 4, 'stone');
      flame(s, x, 24, awake ? 7 : 6, f + (d > 0 ? 2 : 0));
      s.ball(50 + d * 33, 61, 14, 23, 'ash');
      s.face([[50 + d * 22, 37], [50 + d * 44, 42], [50 + d * 43, 61], [50 + d * 26, 56]], 'stone');
      s.rim(50 + d * 25, 39, 50 + d * 40, 43, 'ash');
      s.ball(50 + d * 18, 94, 15, 8, 'ash');
    }
    s.ball(50, 63, 30, 34, 'ash');
    s.face([[28, 35], [70, 35], [78, 69], [68, 94], [32, 94], [22, 69]], 'ash');
    s.core(50, 70, 20, 22, 'ember', phase);
    s.ball(45, 66, 11, 13, 'gold', awake ? .12 : 0);
    for (let i = 0; i < 4; i++) {
      const x = 35 + i * 10;
      s.face([[x, 52], [x + 3, 53], [x + (awake ? 6 : 3), 85], [x + (awake ? 2 : 0), 88]], 'ash');
      s.rim(x, 53, x + 1, 62, 'stone');
    }
    s.face([[28, 38], [38, 29], [64, 29], [73, 38], [68, 48], [32, 48]], 'stone');
    wardenGaze(s, 50, 38, 11, blink, phase);
    if (awake) for (const d of [-1, 1]) s.line(50 + d * 23, 68, 50 + d * 30, 77, PAL.ember[8]).line(50 + d * 30, 77, 50 + d * 25, 85, PAL.gold[7]);
  } else if (id === 'index-shade') {
    s.curve([[51, 73], [94, 82], [82, 104], [19, 97]], 7, 'violet');
    s.ball(50, 60, 29, 34, 'violet');
    s.face([[16, 35], [34, 12], [54, 2], [77, 23], [88, 65], [73, 88], [25, 91], [9, 68]], 'cream');
    s.face([[24, 37], [49, 18], [72, 36], [77, 68], [52, 86], [22, 68]], 'violet');
    s.face([[26, 39], [49, 25], [67, 38], [66, 61], [34, 64]], 'night');
    s.rim(25, 29, 47, 10, 'cream');
    for (const d of [-1, 1]) {
      s.face([[50 + d * 25, 44], [50 + d * 44, awake ? 20 : 35], [50 + d * 46, 64], [50 + d * 27, 82]], 'cream');
      for (let i = 0; i < 4; i++) s.line(50 + d * 30, 49 + i * 6, 50 + d * 40, 43 + i * 6, PAL.violet[3]);
      s.face([[50 + d * 16, 73], [50 + d * 36, 82], [50 + d * 26, 94]], 'sand');
      if (awake) s.face([[50 + d * 32, 15], [50 + d * 44, 3 + w], [50 + d * 46, 21], [50 + d * 37, 30]], 'cream');
    }
    wardenGaze(s, 49, 42, 9, blink, phase);
    s.core(49, 68, awake ? 10 : 7, 10, 'gold', phase);
    s.line(32, 73, 39, 84, PAL.violet[6]).line(61, 77, 66, 70, PAL.violet[7]);
  } else {
    // Three weighted reliquaries orbit a jade allocator, crowned in layered gold.
    for (const d of [-1, 1]) {
      s.face([[50 + d * 21, 43], [50 + d * 45, 27], [50 + d * 43, 66], [50 + d * 28, 81]], 'gold');
      s.face([[50 + d * 29, 41], [50 + d * 38, 35], [50 + d * 37, 58]], 'violet');
    }
    s.ball(50, 66, 27, 33, 'teal');
    s.face([[28, 52], [49, 39], [74, 52], [69, 87], [50, 101], [31, 87]], 'teal');
    for (let row = 0; row < 3; row++) for (let col = 0; col < 4 - row; col++) {
      const x = 35 + col * 9 + row * 4, y = 75 + row * 7;
      s.line(x, y, x + 3, y + 2, PAL.teal[2]).line(x + 3, y + 2, x + 6, y - 1, PAL.teal[6]);
    }
    s.face([[17, 39], [12, 12], [31, 28], [49, 3], [68, 28], [89, 12], [83, 43], [67, 53], [31, 53]], 'gold');
    s.face([[49, 8], [60, 29], [50, 44], [39, 30]], 'sky');
    s.rim(19, 17, 28, 28, 'gold').rim(45, 15, 49, 8, 'gold');
    s.ball(50, 52, 21, 10, 'gold');
    s.face([[34, 53], [50, 46], [67, 54], [64, 65], [37, 65]], 'teal');
    wardenGaze(s, 50, 55, 8, blink, phase);
    s.core(50, 76, awake ? 10 : 7, 10, 'sky', phase);
    for (let i = 0; i < 3; i++) {
      const x = [14, 83, 51][i], y = [78 + w, 79 - w, awake ? 16 : 23][i], r = i === 0 ? 8 : 5;
      s.face([[x, y - r], [x + r, y], [x, y + r], [x - r, y]], 'gold');
      s.core(x, y, Math.max(2, r - 4), Math.max(2, r - 4), i === 1 && awake ? 'sky' : 'teal', phase);
    }
    if (awake) for (const d of [-1, 1]) s.face([[50 + d * 20, 9], [50 + d * 27, 2 + w], [50 + d * 30, 16]], 'gold');
  }
}

function canonicalId(id) {
  const entry = dexEntryOf(id);
  return entry?.origin ? `static-${entry.zone}` : id;
}
export function battleCreatureSize(id) { return BOUNDS[id] ?? BOUNDS['static-0']; }
function zoneOf(id) { return dexEntryOf(id)?.zone ?? (id.startsWith('static-') ? Math.max(0, Math.min(6, Number(id.slice(7)) || 0)) : Math.min(6, Math.max(0, CREATURE_IDS.indexOf(id)))); }
function variantPixels(p, golden, silhouette) {
  if (silhouette) { p.each(() => PAL.night[0]); return; }
  if (golden) p.each((x, y, c) => {
    if (c === u32(PAL.ink)) return c;
    const material = MATERIALS.get(c);
    if (material?.name === 'night') return c;
    return shadeRamp(PAL.gold, material?.value ?? .45);
  });
}
function corruptPixels(p, id, f) {
  const zone = zoneOf(id), accent = PAL[ACCENTS[zone]], small = p.w < 30, practice = id.startsWith('static-') || !!dexEntryOf(id);
  const focal = small ? [11, 16, 6, 5] : WARDEN_IDS.has(id) ? [50, 48, 22, 17] : practice ? [27, 31, 14, 12] : FOCAL_AREAS[zone];
  const cy = focal[1] - Math.max(0, WAVE[f]), drift = [0, 1, 0, -1][f % 4];
  p.each((x, y, c) => {
    if (c === u32(PAL.ink)) return c;
    const material = MATERIALS.get(c);
    if (!material) return c;
    const light = ((c & 255) * .23 + ((c >>> 8) & 255) * .62 + ((c >>> 16) & 255) * .15) / 255;
    const face = ((x - focal[0]) / focal[2]) ** 2 + ((y - cy) / focal[3]) ** 2 < 1;
    if (!practice && zone === 5 && face && material.name === 'violet' && material.value > 0) {
      return shadeRamp(VESPER_FACE_RAMP, material.value);
    }
    // Mouths, eyes, and contact lines remain dark on the preserved light mass.
    if (light < .19) return c;
    const warmLight = material.name === 'cream' || material.name === 'snow' || material.name === 'gold';
    const identity = practice ? warmLight || (y < p.h * .25 && material.name === ACCENTS[zone])
      : warmLight
        || (zone === 0 && (material.name === 'rose' || material.name === 'water' || y < p.h * .42))
        || (zone === 1 && y < p.h * .3)
        || (zone === 2 && material.name === 'rose')
        || (zone === 4 && material.name === 'ember')
        || (zone === 6 && material.name === 'teal' && y < p.h * .56);
    const step = Math.floor(y / (small ? 3 : 8)) % 2;
    const patch = (x > p.w * .55 + drift + step * 2 && y > p.h * .22 && y < p.h * .66)
      || (x > p.w * .13 && x < p.w * .44 + drift && y > p.h * .65 && y < p.h * .89);
    if (patch && !face && !identity) return shadeRamp(CORRUPT_RAMP, .2 + light * .72);
    return material.color;
  });
  // Only a few coherent static scars; do not stipple every flat face or belly.
  for (let i = 0; i < (small ? 2 : 5); i++) {
    const x = Math.floor(p.w * (.17 + hash2(i, f, zone + 9) * .65));
    const y = Math.floor(p.h * (.25 + hash2(f, i, zone + 29) * .57));
    if (((x - focal[0]) / focal[2]) ** 2 + ((y - cy) / focal[3]) ** 2 < 1) continue;
    for (let dx = 0; dx < (small ? 2 : 4); dx++) {
      if (p.opaque(x + dx, y)) p.set(x + dx, y, i % 2 ? PAL.violet[7] : accent.at(-2));
    }
  }
  if (!small && !practice && zone === 5) p.line(44, 49 - Math.max(0, WAVE[f]), 48, 49 - Math.max(0, WAVE[f]), PAL.violet[1]);
  // A narrow material-coloured upper rim separates violet patches from the
  // moving practice field; bottom/right edges stay ink-dark, never violet-on-violet.
  if (!small) p.outline((x, y) => x < p.w * .46 || y < p.h * .3 ? accent[3] : PAL.ink);
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
function battleFrames(id, corrupted, phase, squash, blink, white = false, golden = false, silhouette = false) {
  const key = `creature-v3-sculpt:${id}:${+corrupted}:${phase}:${squash}:${+blink}:${+white}:${+golden}:${+silhouette}`;
  let frames = banks.get(key);
  if (frames) return frames;
  const bounds = battleCreatureSize(id), w = bounds.w - 16, h = bounds.h - 16, zone = zoneOf(id);
  frames = Array.from({ length: 8 }, (_, f) => spriteCache(`${key}:${f}`, w + 16, h + 16, (p) => {
    const art = new Pix(w, h), dy = -Math.max(0, WAVE[f]);
    const sculpted = WARDEN_IDS.has(id) || (dexEntryOf(id) && !dexEntryOf(id).origin);
    const s = sculpted ? new SculptBuilder(art, dy) : new SpriteBuilder(art, dy);
    if (PAINTERS[id]) PAINTERS[id](s, f, blink, phase);
    else if (id === 'fen') fenBattle(s, f, blink);
    else if (WARDEN_IDS.has(id)) wardenBattle(s, id, f, blink, phase, corrupted && !silhouette);
    else if (dexEntryOf(id) && !dexEntryOf(id).origin) specimenBattle(s, id, f, blink, phase);
    else {
      staticling(s, zone, f, blink);
      if (!corrupted) art.each((x, y, c) => MATERIALS.get(c)?.name === 'violet' ? shadeRamp(PAL[ACCENTS[zone]], MATERIALS.get(c).value) : c);
    }
    if (corrupted) corruptPixels(art, id, f);
    variantPixels(art, golden, silhouette);
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

/** Bottom-centre feet; bounds include transparent pose gutters.
 * Species origins alias static-zone. golden is cosmetic gold leaf; silhouette
 * is one opaque dark tone without eyes, shadows, scars or glints. reduced freezes
 * the pose and sparkle, never changing gameplay. Canvas state is restored. */
export function drawBattleCreature(ctx, id, x, y, opts = {}) {
  id = canonicalId(id);
  const t = opts.t ?? 0, reduced = opts.reduced || motionPreference?.matches;
  const f = reduced ? 0 : Math.floor(t * 6) % 8, blink = Math.floor(t * 8 + zoneOf(id) * 3) % 37 === 0;
  const corrupted = Boolean(opts.corrupted), phase = opts.phase === 2 ? 2 : 1;
  const squash = Math.round(clamp(opts.squash ?? 0, -1, 1) * 2);
  const frames = battleFrames(id, corrupted, phase, squash, blink, false, !!opts.golden, !!opts.silhouette);
  const { w, h } = battleCreatureSize(id), hurt = reduced ? 0 : clamp(Number(opts.hurt) || 0);
  const dx = Math.round(x - w / 2 + Math.sin(t * 57) * hurt * 3), dy = Math.round(y - h);
  ctx.save();
  ctx.globalAlpha *= clamp(opts.alpha ?? 1);
  if (!opts.silhouette) shadow(ctx, x, y, id === 'auric' ? 44 : WARDEN_IDS.has(id) ? 34 : SIZES[id] ? 27 : 17);
  drawSlices(ctx, frames[f], dx, dy, !opts.silhouette && corrupted && !reduced, f);
  if (opts.flash > 0) {
    ctx.globalAlpha *= clamp(opts.flash);
    drawSlices(ctx, battleFrames(id, corrupted, phase, squash, blink, true, !!opts.golden, !!opts.silhouette)[f], dx, dy, corrupted && !reduced, f);
  }
  ctx.restore();
  if (opts.golden && !opts.silhouette) {
    const glint = spriteCache('species-gold-glint', 7, 7, p => p.line(3, 0, 3, 6, PAL.gold[8]).line(0, 3, 6, 3, PAL.cream[3]));
    const still = opts.reduced || motionPreference?.matches;
    if (still || f % 4 === 0) ctx.drawImage(glint, Math.round(x + w * .28), Math.round(y - h * .68));
  }
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
    if (opts.corrupted) corruptPixels(p, id, f);
  });
  shadow(ctx, x, y, 8);
  const hop = opts.moving ? Math.max(0, WAVE[f]) : 0;
  drawSlices(ctx, image, Math.round(x - 13), Math.round(y - 26 - hop), opts.corrupted, f);
}
export function drawStaticling(ctx, zoneId, x, y, opts = {}) {
  drawSpecimen(ctx, SPECIES.find(s => s.zone === Math.max(0, Math.min(6, Number(zoneId) || 0)) && s.origin).id, x, y, opts);
}

function miniSpecimen(p, id, zone, f, dir, alert) {
  const w = WAVE[f], accent = ACCENTS[zone];
  const s = dexEntryOf(id)?.origin || id.startsWith('static-') ? new SpriteBuilder(p, -Math.max(0, w)) : new SculptBuilder(p, -Math.max(0, w));
  const back = dir === 'up', side = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
  let ey = 15, ex = 11, gap = 3;
  if (id === 'stepbud') {
    s.face([[3, 21], [3, 17], [6, 17], [6, 13], [9, 13], [9, 9], [13, 9], [13, 13], [16, 13], [16, 17], [19, 17], [19, 21]], 'leaf');
    s.leaf([[9, 10], [5, 5], [10, 4], [13, 9]], [[7, 6], [11, 10]]);
    s.ball(11, 18, 4, 3, 'cream'); ey = 17; gap = 2;
  } else if (id === 'ripple-seed') {
    s.curve([[9, 18], [1, 19], [2, 7], [4, 8]], 1, 'leaf').curve([[13, 18], [21, 19], [20, 7], [18, 8]], 1, 'leaf');
    s.ball(3, 8, 2, 3, 'rose').ball(19, 8, 2, 3, 'rose');
    s.face([[11, 6], [15, 15], [13, 21], [9, 21], [7, 15]], 'sand'); gap = 2;
  } else if (id === 'crooked-pebble') {
    s.face([[2, 16], [8, 8], [15, 7], [19, 12], [16, 21], [4, 21]], 'stone');
    s.face([[2, 16], [8, 8], [15, 7], [12, 15]], 'teal'); ex = 10;
  } else if (id === 'lantern-sliver') {
    s.curve([[8, 8], [4, 1], [17, 1], [14, 8]], 1, 'gold');
    s.face([[7, 7], [14, 8], [18, 18], [13, 22], [5, 19]], 'teal');
    s.face([[9, 10], [13, 10], [15, 18], [8, 18]], 'gold'); gap = 2;
  } else if (id === 'foam-flicker') {
    s.ball(11, 17, 7, 5, 'water').ball(7, 11, 4, 4, 'snow').ball(14, 12, 4, 4, 'snow');
    s.ball(4, 16, 3, 3, 'snow').ball(17, 17, 3, 3, 'snow').ball(11, 16, 5, 4, 'snow');
  } else if (id === 'undertow-dot') {
    s.face([[7, 17], [1, 9], [6, 10]], 'water').face([[15, 17], [21, 9], [17, 10]], 'water');
    s.curve([[11, 17], [20, 21], [14, 23], [7, 21]], 1, 'water');
    s.ball(11, 14, 5, 5, 'water').ball(11, 15, 3, 3, 'snow'); gap = 2; ey = 14;
  } else if (id === 'whisper-knot') {
    s.curve([[4, 21], [1, 4], [17, 2], [17, 15]], 2, 'violet').curve([[17, 15], [21, 23], [6, 23], [8, 12]], 1, 'cream');
    s.line(7, 8, 16, 5, PAL.sky[6]).ball(11, 15, 4, 4, 'cream'); gap = 2;
  } else if (id === 'loomlet') {
    s.line(4, 7, 6, 21, PAL.wood[3]).line(18, 7, 16, 21, PAL.wood[3]);
    s.line(4, 8, 18, 8, PAL.gold[5]).line(6, 21, 16, 21, PAL.gold[5]);
    for (let i = 0; i < 3; i++) s.line(8 + i * 3, 9, 7 + i * 3 + w, 20, PAL[['violet', 'sky', 'cream'][i]][5]);
    s.ball(11, 13, 4, 3, 'cream'); gap = 2; ey = 13;
  } else if (id === 'kiln-cricket') {
    for (const d of [-1, 1]) {
      s.line(11 + d * 4, 16, 11 + d * 8, 12, PAL.ash[3]).line(11 + d * 8, 12, 11 + d * 9, 22, PAL.ash[4]);
      s.line(11 + d * 3, 10, 11 + d * 5, 4, PAL.gold[5]);
    }
    s.ball(11, 16, 4, 6, 'ash').ball(11, 11, 4, 3, 'ash');
    s.dot(8, 16, PAL.ember[7], 2, 3).dot(13, 14, PAL.ember[8], 2, 3); ey = 11; gap = 2;
  } else if (id === 'ember-chip') {
    s.face([[4, 9], [16, 7], [18, 19], [6, 22], [3, 17]], 'stone');
    for (const x of [6, 11, 16]) s.dot(x, 5, PAL.gold[4], 2, 3);
    s.line(5, 18, 10, 18, PAL.ember[7]); flame(s, 17, 10, 2, f); ey = 14;
  } else if (id === 'margin-mote') {
    s.face([[5, 5], [16, 6], [19, 10], [16, 21], [5, 22]], 'cream');
    s.line(8, 8, 7, 19, PAL.rose[4]).line(10, 9, 15, 9, PAL.violet[3]);
    s.ball(12, 17, 4, 4, 'violet'); ex = 12; gap = 2; ey = 16;
  } else if (id === 'index-wisp') {
    s.face([[11, 4], [16, 10], [15, 19], [11, 22], [7, 19], [6, 10]], 'violet');
    s.face([[7, 10], [1, 7], [2, 18], [7, 19]], 'cream').face([[15, 10], [21, 7], [20, 18], [15, 19]], 'cream'); ey = 13; gap = 2;
  } else if (id === 'crown-crumb') {
    s.face([[3, 12], [4, 5], [8, 10], [11, 3], [14, 10], [18, 5], [19, 16], [15, 22], [7, 22]], 'gold');
    s.ball(11, 17, 5, 4, 'teal'); ey = 16;
  } else if (id === 'prism-pip') {
    s.face([[11, 4], [15, 9], [14, 19], [11, 22], [8, 19], [7, 9]], 'teal');
    s.face([[7, 12], [1, 7], [3, 17], [8, 19]], 'gold').face([[15, 12], [21, 7], [19, 17], [14, 19]], 'violet'); gap = 2;
  } else {
    s.ball(11, 16, 7, 6, accent);
    if (!back) s.ball(11, 17, 5, 4, FACE_MATERIALS[zone]);
    if (zone === 0) s.leaf([[9, 12], [5, 7], [11, 5], [15, 11]], [[7, 8], [12, 11]]);
    if (zone === 1) crystal(s, 10, 5, 5, 9);
    if (zone === 2) s.face([[7, 12], [11, 4], [16, 12]], 'water');
    if (zone === 3) s.line(7, 12, 4, 6, PAL.cream[2]).line(15, 12, 18, 6, PAL.cream[2]);
    if (zone === 4) flame(s, 11, 11, 2, f);
    if (zone === 5) s.face([[4, 12], [8, 6], [14, 5], [18, 11], [11, 9]], 'cream');
    if (zone === 6) s.face([[5, 12], [3, 6], [9, 10]], 'gold').face([[13, 10], [19, 6], [18, 13]], 'gold');
  }
  const step = [0, 1, 0, -1][f % 4];
  s.dot(7 + (side ? step : 0), 21 + Math.max(0, step), PAL[accent][2], 3);
  s.dot(13 - (side ? step : 0), 21 + Math.max(0, -step), PAL[accent][2], 3);
  if (!back) {
    s.eye(ex + side * 2 - (side === 1 ? 0 : gap), ey, false, alert ? .5 : .35);
    if (!side) s.eye(ex + gap, ey, false, alert ? .5 : .35);
  } else s.line(ex - 2, ey - 1, ex + 2, ey + 1, PAL[accent][3]);
}

/** Native 22×24 overworld specimen, anchored at feet; not a scaled battle image.
 * t drives a four-pose walk; dir is down/left/up/right. friendly selects purified
 * materials; alert adds a notice mark. golden/silhouette are cosmetic variants. */
export function drawSpecimen(ctx, speciesId, x, y, opts = {}) {
  const entry = dexEntryOf(speciesId), zone = entry?.zone ?? zoneOf(speciesId);
  const t = opts.t ?? 0, f = opts.reduced || motionPreference?.matches ? 0 : Math.floor(t * 6) % 8;
  const dir = opts.dir ?? 'down';
  const image = spriteCache(`specimen-v3:${speciesId}:${f}:${dir}:${+!!opts.friendly}:${+!!opts.golden}:${+!!opts.silhouette}:${+!!opts.alert}`, 22, 24, p => {
    miniSpecimen(p, speciesId, zone, f, dir, !!opts.alert);
    if (!opts.friendly) corruptPixels(p, `static-${zone}`, f);
    if (opts.alert) p.rect(10, 0, 2, 3, PAL.gold[6]);
    variantPixels(p, !!opts.golden, !!opts.silhouette);
  });
  if (!opts.silhouette) shadow(ctx, x, y, 6);
  drawSlices(ctx, image, Math.round(x - 11), Math.round(y - 23), !opts.friendly && !opts.silhouette && !opts.reduced, f);
  if (opts.golden && !opts.silhouette && (opts.reduced || motionPreference?.matches || f % 4 < 2)) {
    ctx.fillStyle = PAL.gold[8];
    ctx.fillRect(Math.round(x + 8), Math.round(y - 19), 1, 3);
    ctx.fillRect(Math.round(x + 7), Math.round(y - 18), 3, 1);
  }
}

function friendEmblem(p, id, blink, pulse) {
  const n = p.w, c = Math.floor(n / 2), bottom = n - 1, gap = n === 10 ? 1 : 2;
  const s = new SpriteBuilder(p), faceY = n - 4;
  let eyes = PAL.ink, eyeY = n - 5;
  if (id === 'nib') {
    s.ball(c, faceY, n === 10 ? 3.5 : 4.5, 3.5, 'leaf').ball(c, faceY, n === 10 ? 2.8 : 3.6, 2.7, 'cream');
    s.leaf([[0, 4], [3, 1], [c + 1, 0], [n - 1, 3], [n - 3, 5], [c, 3], [2, 6]], [[2, 4], [c + 1, 2]]);
    s.dot(3, 2, pulse ? PAL.leaf[6] : PAL.leaf[5]);
  } else if (id === 'chime') {
    s.line(2, 0, 3, 3, PAL.teal[7]).line(n - 3, 0, n - 4, 3, PAL.teal[5]);
    s.face([[3, 2], [n - 4, 2], [n - 3, bottom - 3], [n - 1, bottom - 2], [0, bottom - 2], [2, bottom - 3]], 'teal');
    s.dot(3, 3, PAL.teal[7], 2, Math.max(1, n - 7));
    s.line(2, bottom - 2, n - 3, bottom - 2, PAL.gold[5]).dot(c, bottom - 1, PAL.gold[7]);
  } else if (id === 'brine') {
    for (const side of [-1, 1]) {
      const x = side < 0 ? 1 : n - 2;
      s.line(x, 3, x, bottom - 3, PAL.rose[4]);
      s.dot(x + side, 2 + pulse, PAL.rose[6]).dot(x + side, 5, PAL.rose[6]).dot(x + side, bottom - 2, PAL.rose[5]);
    }
    s.ball(c, faceY - 1, n === 10 ? 3.5 : 4, 4, 'water').ball(c, faceY, n === 10 ? 2.7 : 3.2, 2.8, 'snow');
    s.line(c - 2, bottom, c + 2, bottom, PAL.water[6]);
  } else if (id === 'spindle') {
    s.face([[0, 2], [c - 1, 4], [c - 1, bottom - 1], [1, bottom], [0, bottom - 4]], 'violet');
    s.face([[n - 1, 2], [c + 1, 4], [c + 1, bottom - 1], [n - 2, bottom], [n - 1, bottom - 4]], 'violet', [.5, .2, .7]);
    s.dot(1, 4, PAL.cream[2], 1, 2).dot(n - 2, 4, PAL.cream[1], 1, 2);
    s.dot(2, bottom - 2, PAL.sky[5]).dot(n - 3, bottom - 2, PAL.sky[4]);
    s.line(c - 1, 3, c - 2, 0, PAL.gold[6]).line(c + 1, 3, c + 2, 0, PAL.gold[5]);
    s.ball(c, faceY - 1, gap + 1, 3.5, 'cream');
  } else if (id === 'cinder') {
    eyeY = n === 10 ? 3 : 4;
    const coalRadius = n === 10 ? 2 : 3;
    s.face([[2, 3], [n - 3, 3], [n - 1, 6], [n - 2, bottom], [2, bottom], [0, 6]], 'ash');
    s.dot(c - 2, 1, PAL.ash[2], 4, 3).dot(c - 1, 0, PAL.ember[pulse ? 8 : 6], 2);
    s.dot(c - gap - 1, eyeY - 1, PAL.ash[6], gap * 2 + 3, 3);
    s.face([[c, bottom - 5], [c + coalRadius, bottom - 2], [c, bottom], [c - coalRadius, bottom - 2]], 'ember', [0, 0, .65]);
    s.dot(c - 1, bottom - 3, PAL.ember[7]).dot(c, bottom - 2, PAL.ember[8]);
  } else if (id === 'vesper') {
    s.face([[c, 0], [n - 3, 2], [n - 1, 6], [n - 2, bottom - 1], [c, bottom], [1, bottom - 1], [0, 5], [3, 2]], 'cream');
    s.ball(c, faceY - 1, gap + 1.5, 3.6, 'violet', .2);
    s.line(2, 4, c - 1, 1, PAL.cream[3]);
    eyes = PAL.gold[7];
  } else {
    for (const side of [-1, 1]) {
      const x = side < 0 ? 1 : n - 2;
      s.line(x, 0, x, 3, PAL.gold[6]).line(x, 3, x - side * 2, 4, PAL.gold[5]);
      s.dot(x + side, 1, PAL.gold[7]);
    }
    s.ball(c, faceY - 1, n === 10 ? 3.5 : 4.5, 3.8, 'teal').ball(c, bottom - 1, n === 10 ? 2.5 : 3.5, 1.8, 'cream');
    s.dot(c, 3, PAL.gold[7]);
  }
  p.rect(c - gap, eyeY, blink ? 2 : 1, blink ? 1 : 2, eyes);
  p.rect(c + gap, eyeY, blink ? 2 : 1, blink ? 1 : 2, eyes);
  if (id === 'nib' || id === 'brine') p.set(c, bottom - 1, PAL.wood[1]);
}

/** Native 10–12 px party heads, top-left anchor; no downscaled battle sprites.
 * size selects a separately rasterised integer layout. t drives blink/tip light. */
export function drawFriendEmblem(ctx, guardianId, x, y, { t = 0, size = 12 } = {}) {
  const id = typeof guardianId === 'number' ? CREATURE_IDS[guardianId] ?? 'nib' : PAINTERS[guardianId] ? guardianId : 'nib';
  const n = Math.round(clamp(size, 10, 12)), zone = zoneOf(id);
  const blink = Math.floor(t * 8 + zone * 3) % 41 === 0, pulse = Math.floor(t * 4 + zone) % 4 === 0 ? 1 : 0;
  const image = spriteCache(`friend-emblem:${id}:${n}:${+blink}:${pulse}`, n, n, (p) => friendEmblem(p, id, blink, pulse));
  ctx.drawImage(image, Math.round(x), Math.round(y));
}

function heading(ctx, screen, title, subtitle) {
  ctx.fillStyle = PAL.night[1]; ctx.fillRect(0, 0, screen.w, 29);
  drawText(ctx, title, 9, 5, { color: PAL.cream[3] });
  drawText(ctx, subtitle, 9, 18, { font: 'small', color: PAL.ui.dim });
}
function label(ctx, text, x, y, color = PAL.cream[3]) { drawText(ctx, text, x, y, { font: 'small', align: 'center', color, shadow: PAL.ink }); }
function creaturesGallery(ctx, screen, t, page = 0) {
  const pageId = page % 16, portrait = screen.w < 300;
  drawBattleBackground(ctx, screen, pageId < 6 ? BIOMES[(pageId % 3) * 2] : 'static', t, { intensity: .55, reduced: true });
  if (pageId < 6) {
    const corrupted = pageId >= 3, group = pageId % 3, ids = group === 2 ? ['auric'] : CREATURE_IDS.slice(group * 3, group * 3 + 3);
    heading(ctx, screen, corrupted ? 'Under the Static' : 'Guardians of the isle', `${group + 1}/3  ${corrupted ? 'Material colours / moving static scars' : 'Material light / true colours'}`);
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
    heading(ctx, screen, 'Small trouble, seven flavours', 'Corrupted / light faces and zone accents');
    CREATURE_IDS.slice(7, 14).forEach((id, i) => {
      const cols = portrait ? 3 : 4, row = Math.floor(i / cols), x = Math.round(screen.w * (i % cols + .5) / cols), y = (portrait ? 107 : 101) + row * (portrait ? 91 : 82);
      drawBattleCreature(ctx, id, x, y, { t: t + i * .18, corrupted: true }); label(ctx, BIOMES[i].toUpperCase(), x, y + 6);
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
  } else if (pageId === 15) {
    heading(ctx, screen, 'Seven friends, even at 10 pixels', 'Authored party heads / native pixel sizes');
    const columns = portrait ? [115, 151, 187] : [150, 232, 312];
    columns.forEach((x, i) => label(ctx, `${10 + i} PX`, x, 36, PAL.gold[6]));
    CREATURE_IDS.slice(0, 7).forEach((id, i) => {
      const y = 50 + i * Math.floor((screen.h - 68) / 7);
      drawText(ctx, NAMES[i], 15, y + 2, { color: PAL.cream[2] });
      columns.forEach((x, k) => drawFriendEmblem(ctx, id, x - Math.floor((10 + k) / 2), y, { t, size: 10 + k }));
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
// DEV galleries are also the complete visual roster: 21 species pages, 14
// warden studies and the seven-family silhouette comparison sheet.
function speciesGallery(ctx, screen, t, page = 0) {
  const entry = SPECIES[page % SPECIES.length], portrait = screen.portrait ?? screen.w < 300;
  drawBattleBackground(ctx, screen, BIOMES[entry.zone], t, { intensity: .35, reduced: true });
  heading(ctx, screen, entry.name, `${page % 21 + 1}/21  ${entry.family} / native pixels`);
  const states = [{}, { corrupted: true }, { golden: true }, { silhouette: true }];
  states.forEach((opts, i) => {
    const x = portrait ? screen.w * (i % 2 + .5) / 2 : screen.w * (i + .5) / 4;
    const y = portrait ? 116 + Math.floor(i / 2) * 125 : 114;
    drawBattleCreature(ctx, entry.id, x, y, { t, ...opts });
    label(ctx, ['PURIFIED', 'STATIC', 'GOLD LEAF', 'UNSEEN'][i], x, y + 7);
    for (let d = 0; d < 4; d++) drawSpecimen(ctx, entry.id, x - 30 + d * 20, y + 41, {
      t, dir: ['down', 'left', 'up', 'right'][d], friendly: !opts.corrupted, ...opts,
    });
  });
}
function speciesRosterGallery(ctx, screen, t, page = 0) {
  const zone = page % 7, portrait = screen.portrait ?? screen.w < 300;
  drawBattleBackground(ctx, screen, BIOMES[zone], t, { intensity: .3, reduced: true });
  heading(ctx, screen, `${BIOMES[zone]} / three identities`, 'Shape / posture / motif / pocket form');
  SPECIES.filter(s => s.zone === zone).forEach((entry, i) => {
    const x = portrait ? 70 : screen.w * (i + .5) / 3;
    const y = portrait ? 110 + i * 87 : 128;
    drawBattleCreature(ctx, entry.id, x, y, { t });
    drawSpecimen(ctx, entry.id, portrait ? 126 : x - 14, portrait ? y - 20 : 174, { t, friendly: true });
    drawSpecimen(ctx, entry.id, portrait ? 160 : x + 14, portrait ? y - 20 : 174, { t, golden: true });
    label(ctx, entry.name.toUpperCase(), portrait ? 117 : x, portrait ? y + 4 : 187);
  });
}
function wardensGallery(ctx, screen, t, page = 0) {
  const entry = WARDENS[Math.floor(page / 2) % 7], portrait = screen.portrait ?? screen.w < 300;
  const variants = page % 2 ? [{ golden: true }, { silhouette: true }] : [{}, { corrupted: true, phase: 2 }];
  drawBattleBackground(ctx, screen, 'static', t, { intensity: .3, reduced: true });
  heading(ctx, screen, entry.name, page % 2 ? 'Gold leaf / unseen' : 'Well warden / Static-infested');
  variants.forEach((opts, i) => {
    const x = portrait ? screen.w / 2 : screen.w * (i + .5) / 2;
    const y = portrait ? 153 + i * 141 : 177;
    drawBattleCreature(ctx, entry.id, x, y, { t, ...opts });
    label(ctx, opts.silhouette ? 'UNSEEN' : opts.golden ? 'GOLD' : i ? 'STATIC' : 'WARDEN', x, y + 7);
  });
}
function fenGallery(ctx, screen, t) {
  const portrait = screen.portrait ?? screen.w < 300;
  drawBattleBackground(ctx, screen, 'grove', t, { intensity: .25, reduced: true });
  heading(ctx, screen, 'Fen Float / a very wide atlas', 'Goggles / rolled maps / scarf / duel stance');
  drawBattleCreature(ctx, 'fen', 65, 112, { t });
  ['neutral', 'happy', 'worried'].forEach((mood, i) => {
    const x = portrait ? 135 : 162 + i * 72, y = portrait ? 44 + i * 54 : 54;
    drawPortrait(ctx, 'fen', x, y, { t, mood });
    label(ctx, mood.toUpperCase(), x + 20, y + 43);
  });
  ['down', 'left', 'up', 'right'].forEach((dir, i) => {
    const y = portrait ? 230 + i * 25 : 145 + Math.floor(i / 2) * 45;
    const ox = portrait ? 0 : (i % 2) * 192;
    label(ctx, dir.toUpperCase(), ox + 24, y - 12);
    for (let f = 0; f < 4; f++) drawCharacter(ctx, 'fen', ox + (portrait ? 80 : 59) + f * 34, y, { dir, frame: f, t });
  });
}
const NEW_SPECIES = SPECIES.filter(s => !s.origin);
function speciesStudyGallery(ctx, screen, t, page = 0) {
  const entry = NEW_SPECIES[page % NEW_SPECIES.length], portrait = screen.portrait ?? screen.w < 300;
  drawBattleBackground(ctx, screen, BIOMES[entry.zone], t, { intensity: .25, reduced: true });
  heading(ctx, screen, `${entry.name} / material study`, 'Original / sculpted motif / gilded material');
  const ids = [`static-${entry.zone}`, entry.id, entry.id];
  ids.forEach((id, i) => {
    const x = portrait ? screen.w / 2 : screen.w * (i + .5) / 3;
    const y = portrait ? 108 + i * 90 : 137;
    drawBattleCreature(ctx, id, x, y, { t, golden: i === 2 });
    label(ctx, ['ORIGINAL', 'SCULPTED', 'GILDED'][i], x, y + 7);
    drawSpecimen(ctx, id, portrait ? x + 47 : x, portrait ? y - 15 : 184, { t, friendly: true, golden: i === 2 });
  });
}
function wardenStudyGallery(ctx, screen, t, page = 0) {
  const entry = WARDENS[Math.floor(page / 2) % WARDENS.length], phase = page % 2 + 1;
  const portrait = screen.portrait ?? screen.w < 300;
  drawBattleBackground(ctx, screen, 'static', t, { intensity: .25, reduced: true });
  heading(ctx, screen, entry.name, `Guardian / Well warden / phase ${phase}`);
  [CREATURE_IDS[entry.zone], entry.id].forEach((id, i) => {
    const x = portrait ? screen.w / 2 : screen.w * (i + .5) / 2;
    const y = portrait ? 151 + i * 145 : 179;
    drawBattleCreature(ctx, id, x, y, { t, phase, corrupted: true });
    label(ctx, i ? `WARDEN / PHASE ${phase}` : 'ORIGINAL GUARDIAN', x, y + 7);
  });
}
export const galleries = {
  creatures: creaturesGallery, species: speciesGallery, 'species-roster': speciesRosterGallery,
  wardens: wardensGallery, fen: fenGallery, 'species-study': speciesStudyGallery, 'warden-study': wardenStudyGallery,
};
