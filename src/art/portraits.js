// Native 40×40 busts, not enlarged or cropped walking sprites. Mood changes the
// brows and mouth as well as the eyes; a cached blink is layered into each mood.
import { PAL } from './palette.js';
import { LIGHT, shadeRamp, spriteCache, bayer } from './paint.js';
import { CHARACTER_IDS, CHARACTER_LOOKS } from './characters.js';
import { drawText } from '../engine/font.js';

export const PORTRAIT_IDS = [...CHARACTER_IDS.filter((id) => id !== 'cat' && id !== 'frog'), 'nib', 'chime', 'brine', 'spindle', 'cinder', 'vesper', 'auric', 'oracle'];
const GUARDIAN_COLORS = { nib: 'leaf', chime: 'teal', brine: 'water', spindle: 'violet', cinder: 'ember', vesper: 'violet', auric: 'teal', oracle: 'gold' };
const MOODS = ['neutral', 'happy', 'worried'];
function ball(p, x, y, rx, ry, colors, boost = 0) {
  p.ellipse(x, y, rx, ry, colors[0]);
  p.ellipse(x, y, rx - .8, ry - .8, (px, py, nx, ny, nz) => shadeRamp(colors, .25 + boost + .73 * Math.max(0, nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z), px, py));
}
function face(p, points, colors, brightness = .6, outline = true) {
  p.poly(points, shadeRamp(colors, brightness));
  if (outline) points.forEach((a, i) => p.line(...a, ...points[(i + 1) % points.length], colors[0]));
}
function path(p, points, color) { for (let i = 1; i < points.length; i++) p.line(...points[i - 1], ...points[i], color); }
function expression(p, x, y, gap, mood, blink, { color = PAL.ink, shine = PAL.cream[3], mouth = color, blush = true, scale = 1 } = {}) {
  for (const side of [-1, 1]) {
    const ex = x + side * gap;
    if (mood === 'happy' || blink) path(p, [[ex - 2, y], [ex, y + (mood === 'happy' ? -1 : 0)], [ex + 2, y]], color);
    else {
      p.ellipse(ex, y, 1.7 * scale, 2.7 * scale, color);
      p.set(ex - 1, y - 2, shine);
      if (mood === 'worried') p.line(ex - 2, y - 4 + (side > 0 ? -1 : 1), ex + 2, y - 4 + (side > 0 ? 1 : -1), color);
    }
  }
  if (mood === 'happy') { path(p, [[x - 3, y + 5], [x - 1, y + 7], [x + 1, y + 7], [x + 3, y + 5]], mouth); if (blush) { p.rect(x - gap - 4, y + 3, 3, 1, PAL.rose[5]); p.rect(x + gap + 2, y + 3, 3, 1, PAL.rose[5]); } }
  else if (mood === 'worried') path(p, [[x - 2, y + 7], [x, y + 6], [x + 2, y + 7]], mouth);
  else path(p, [[x - 2, y + 6], [x, y + 7], [x + 2, y + 6]], mouth);
}
function characterBust(p, id, mood, blink) {
  const look = CHARACTER_LOOKS[id], coat = PAL[look.coat], hair = PAL[look.hair];
  const skin = [PAL.skin[Math.max(0, look.skin - 3)], PAL.skin[Math.max(0, look.skin - 1)], PAL.skin[look.skin], PAL.skin[Math.min(6, look.skin + 1)]];
  const isKid = id === 'kid', y = isKid ? 20 : 18;
  if (id === 'hiker') { face(p, [[4, 24], [10, 21], [29, 21], [35, 25], [35, 37], [4, 37]], PAL.sand, .6); p.rect(5, 25, 5, 11, PAL.sand[3]); }
  ball(p, 20, 37, isKid ? 12 : 16, 12, coat);
  p.rect(17, y + 9, 6, 6, PAL.skin[look.skin]);
  face(p, [[10, 29], [17, 27], [20, 32], [23, 27], [30, 29], [27, 37], [13, 37]], coat, .57, false);
  if (id === 'hero') {
    path(p, [[8, 29], [15, 32], [29, 28], [28, 32], [17, 35], [8, 32]], PAL.rose[4]);
    face(p, [[26, 30], [32, 31], [31, 37], [27, 35]], PAL.rose, .6);
    p.line(9, 30, 21, 37, PAL.wood[2]); p.line(10, 30, 23, 37, PAL.wood[5]);
    p.line(34, 21, 34, 37, PAL.wood[4]);
    face(p, [[31, 17], [34, 15], [37, 17], [34, 19]], PAL.teal, .8);
    path(p, [[31, 17], [31, 21], [34, 23], [37, 21], [37, 17], [34, 19], [31, 17]], PAL.teal[8]);
    p.line(34, 19, 34, 23, PAL.teal[8]);
  } else if (id === 'keeper') {
    p.line(15, 28, 15, 37, PAL.gold[4]); p.line(25, 28, 25, 37, PAL.gold[3]); p.rect(18, 32, 2, 2, PAL.gold[6]); p.rect(18, 36, 2, 2, PAL.gold[6]);
  } else if (id === 'smith') {
    face(p, [[13, 29], [27, 29], [30, 37], [10, 37]], PAL.wood, .45); p.line(13, 28, 13, 36, PAL.wood[5]); p.rect(16, 32, 9, 4, PAL.wood[1]);
    p.line(33, 28, 33, 38, PAL.wood[5]); face(p, [[28, 26], [37, 26], [37, 31], [28, 31]], PAL.stone, .6);
  } else if (id === 'sailor') {
    p.rect(7, 32, 26, 2, PAL.cream[2]); p.rect(8, 36, 24, 2, PAL.cream[2]);
    face(p, [[11, 27], [20, 33], [29, 27], [26, 33], [20, 36], [14, 32]], PAL.roof, .6);
  } else if (id === 'botanist') {
    p.line(11, 27, 13, 37, PAL.sand[5]); p.line(28, 28, 27, 37, PAL.sand[4]);
    p.line(33, 27, 33, 38, PAL.leaf[5]); p.line(33, 32, 29, 30, PAL.leaf[6]);
    ball(p, 33, 27, 4, 4, PAL.rose); p.rect(32, 26, 2, 2, PAL.gold[6]);
  } else if (id === 'librarian') {
    face(p, [[26, 31], [36, 29], [36, 38], [26, 38]], PAL.roof, .4); p.rect(28, 32, 6, 5, PAL.cream[2]);
    p.line(29, 34, 33, 34, PAL.cream[0]);
  } else if (id === 'scholar') {
    p.line(12, 29, 14, 38, PAL.gold[5]); p.line(26, 29, 24, 38, PAL.gold[4]);
    face(p, [[29, 31], [35, 31], [36, 38], [28, 38]], PAL.cream, .8); p.line(30, 34, 34, 34, PAL.cream[0]);
  }
  // Hair first; the asymmetrical forelock and sideburns make the face a bust,
  // rather than a big walking-sprite head pasted into a frame.
  if (id === 'kid') { ball(p, 7, 22, 4, 7, hair); ball(p, 33, 22, 4, 7, hair); p.rect(6, 15, 3, 2, PAL.gold[6]); p.rect(31, 15, 3, 2, PAL.gold[6]); }
  if (id === 'librarian') ball(p, 28, 9, 5, 5, hair);
  if (id === 'botanist') { ball(p, 28, 24, 4, 7, hair); p.rect(28, 29, 2, 2, PAL.rose[5]); }
  ball(p, 20, y, 11, 13, hair);
  ball(p, 20, y + 2, 9, 10, skin);
  ball(p, 10, y + 3, 2, 3, skin); ball(p, 30, y + 3, 2, 3, skin);
  face(p, [[10, y - 5], [13, y - 10], [24, y - 10], [30, y - 4], [24, y - 5], [20, y - 8], [18, y - 3], [15, y - 5], [12, y - 1]], hair, .4);
  p.line(13, y - 7, 17, y - 9, hair[Math.min(5, hair.length - 1)]);
  expression(p, 20, y + 2, 5, mood, blink, { mouth: PAL.skin[Math.max(0, look.skin - 3)] });
  if (id === 'keeper') {
    face(p, [[10, 23], [16, 25], [20, 24], [24, 25], [30, 22], [28, 29], [23, 34], [18, 35], [12, 29]], PAL.snow, .65);
    path(p, [[12, 25], [15, 29], [19, 31]], PAL.cream[3]); p.line(24, 26, 23, 31, PAL.snow[1]);
    p.line(17, 26, 23, 26, PAL.skin[1]); if (mood === 'happy') p.set(20, 27, PAL.skin[1]);
    p.rect(9, 7, 22, 6, PAL.roofBlue[1]); p.rect(11, 6, 18, 5, PAL.roofBlue[4]);
    p.rect(8, 12, 24, 3, PAL.roofBlue[2]); p.line(9, 12, 30, 12, PAL.gold[5]); p.rect(18, 8, 4, 3, PAL.gold[6]);
  } else if (id === 'hero') {
    ball(p, 20, 9, 12, 6, PAL.teal);
    p.rect(9, 11, 22, 3, PAL.teal[2]); face(p, [[8, 13], [28, 13], [24, 16], [8, 16], [5, 15]], PAL.teal, .6);
    p.line(10, 7, 14, 5, PAL.teal[8]); p.rect(21, 10, 3, 3, PAL.gold[5]); p.set(22, 10, PAL.gold[7]);
  } else if (id === 'fisher' || id === 'hiker') {
    ball(p, 20, 9, 11, 7, PAL.sand); p.rect(10, 11, 21, 3, id === 'fisher' ? PAL.teal[3] : PAL.roof[3]);
    ball(p, 20, 15, 17, 3, PAL.sand); p.line(7, 14, 28, 14, PAL.sand[6]);
    if (id === 'fisher') p.line(32, 20, 34, 37, PAL.wood[4]);
  } else if (id === 'smith') {
    p.rect(9, 11, 22, 4, PAL.ember[3]); p.line(10, 11, 29, 11, PAL.ember[6]);
    face(p, [[29, 12], [34, 13], [34, 20], [30, 17]], PAL.ember, .45);
  } else if (id === 'botanist') {
    face(p, [[6, 12], [11, 5], [24, 4], [32, 12]], PAL.leaf, .65);
    face(p, [[4, 13], [8, 11], [31, 11], [35, 14], [29, 16], [8, 15]], PAL.leaf, .5);
    p.line(10, 7, 23, 5, PAL.leaf[7]); ball(p, 29, 9, 4, 3, PAL.rose); p.set(28, 8, PAL.gold[6]);
  } else if (id === 'sailor') {
    face(p, [[9, 6], [30, 6], [33, 12], [7, 12]], PAL.cream, .8); p.rect(8, 12, 24, 3, PAL.roofBlue[2]);
    p.line(9, 12, 30, 12, PAL.roofBlue[5]); p.rect(18, 8, 4, 3, PAL.roofBlue[3]);
  } else if (id === 'scholar') {
    ball(p, 20, 10, 13, 8, PAL.violet); path(p, [[9, 9], [15, 14], [25, 16], [31, 12]], PAL.violet[6]);
    path(p, [[10, 6], [19, 10], [29, 11]], PAL.violet[3]);
    face(p, [[17, 10], [20, 7], [24, 10], [20, 15]], PAL.teal, .7); p.set(19, 9, PAL.teal[9]);
  }
  if (id === 'librarian' || id === 'scholar') {
    const glasses = id === 'librarian' ? [15, 25] : [25];
    for (const x of glasses) {
      path(p, [[x - 3, y], [x - 3, y + 4], [x, y + 5], [x + 3, y + 4], [x + 3, y], [x - 3, y]], PAL.gold[5]);
      p.set(x - 2, y + 1, PAL.cream[3]);
    }
    if (id === 'librarian') p.line(18, y + 1, 22, y + 1, PAL.gold[4]);
    else p.line(29, y + 4, 30, y + 12, PAL.gold[3]);
  }
}
function guardianBust(p, id, mood, blink) {
  if (id === 'nib') {
    ball(p, 20, 30, 14, 14, PAL.leaf); ball(p, 20, 28, 11, 10, PAL.cream);
    p.line(20, 20, 21, 8, PAL.leaf[3]);
    face(p, [[3, 17], [10, 6], [22, 4], [36, 13], [28, 18], [19, 14], [10, 18]], PAL.leaf, .6);
    face(p, [[4, 16], [10, 6], [22, 4], [19, 12]], PAL.leaf, .82, false);
    path(p, [[5, 15], [20, 11], [34, 13]], PAL.leaf[2]); p.line(13, 10, 12, 15, PAL.leaf[3]);
    ball(p, 31, 16, 2, 3, PAL.water); p.set(30, 14, PAL.water[10]);
    expression(p, 20, 25, 5, mood, blink, { mouth: PAL.wood[1] });
  } else if (id === 'chime') {
    face(p, [[8, 5], [15, 11], [13, 24], [6, 19]], PAL.violet, .65);
    face(p, [[28, 3], [34, 10], [30, 24], [26, 16]], PAL.teal, .7);
    face(p, [[20, 9], [29, 16], [31, 30], [36, 36], [4, 36], [9, 30], [11, 16]], PAL.teal, .6);
    face(p, [[20, 9], [20, 33], [9, 30], [11, 16]], PAL.teal, .82, false);
    face(p, [[20, 9], [29, 16], [31, 30], [20, 33]], PAL.teal, .43, false);
    p.line(12, 17, 17, 13, PAL.teal[9]);
    expression(p, 20, 22, 5, mood, blink, { mouth: PAL.teal[1] });
    face(p, [[20, 31], [24, 34], [20, 38], [16, 34]], PAL.gold, .8);
    p.line(6, 35, 14, 35, PAL.violet[6]); p.line(26, 35, 34, 35, PAL.violet[6]);
  } else if (id === 'brine') {
    for (const d of [-1, 1]) {
      path(p, [[20 + d * 9, 21], [20 + d * 14, 15], [20 + d * 15, 6]], PAL.rose[4]);
      path(p, [[20 + d * 10, 24], [20 + d * 17, 20], [20 + d * 17, 13]], PAL.rose[5]);
      p.line(20 + d * 13, 16, 20 + d * 18, 12, PAL.rose[5]); p.line(20 + d * 15, 11, 20 + d * 18, 9, PAL.rose[6]);
      p.line(20 + d * 11, 26, 20 + d * 17, 29, PAL.rose[4]);
    }
    ball(p, 20, 35, 13, 10, PAL.water); ball(p, 20, 23, 12, 13, PAL.water); ball(p, 20, 29, 10, 6, PAL.snow);
    p.rect(13, 13, 4, 1, PAL.water[9]);
    expression(p, 20, 23, 5, mood, blink, { mouth: PAL.water[2] });
    p.line(15, 36, 24, 36, PAL.water[8]);
  } else if (id === 'spindle') {
    for (const d of [-1, 1]) {
      face(p, [[20 + d * 3, 26], [20 + d * 17, 15], [20 + d * 18, 35], [20 + d * 8, 38]], PAL.violet, .7);
      ball(p, 20 + d * 13, 27, 4, 6, PAL.cream); ball(p, 20 + d * 13, 27, 2, 3, PAL.gold);
      path(p, [[20 + d * 4, 16], [20 + d * 8, 9], [20 + d * 14, 5]], PAL.violet[6]);
      for (let i = 0; i < 3; i++) p.line(20 + d * (7 + i * 2), 10 - i * 2, 20 + d * (12 + i * 2), 11 - i * 2, PAL.cream[2]);
    }
    ball(p, 20, 31, 8, 11, PAL.cream); ball(p, 20, 21, 10, 10, PAL.cream);
    face(p, [[10, 26], [13, 32], [17, 28], [20, 33], [23, 28], [27, 32], [30, 26]], PAL.cream, .65, false);
    expression(p, 20, 21, 4, mood, blink, { mouth: PAL.rose[3] });
    for (const x of [16, 20, 24]) p.line(x, 33, x - 1, 38, PAL.gold[4]);
  } else if (id === 'cinder') {
    ball(p, 20, 36, 15, 13, PAL.ash); ball(p, 20, 22, 13, 11, PAL.ash);
    face(p, [[10, 17], [10, 7], [17, 7], [17, 4], [24, 4], [24, 9], [30, 9], [30, 18]], PAL.ash, .55);
    p.rect(12, 7, 10, 2, PAL.ember[4]); p.rect(17, 5, 3, 2, PAL.ember[7]);
    p.line(25, 11, 25, 16, PAL.ember[6]); p.line(25, 14, 28, 16, PAL.ember[5]);
    ball(p, 20, 28, 10, 5, PAL.wood);
    expression(p, 20, 22, 6, mood, blink, { mouth: PAL.wood[0], blush: false });
    p.rect(16, 29, 2, 2, PAL.cream[2]);
    face(p, [[15, 34], [24, 34], [27, 38], [12, 38]], PAL.ember, .7); p.rect(18, 36, 4, 2, PAL.gold[7]);
  } else if (id === 'vesper') {
    face(p, [[5, 24], [8, 12], [22, 3], [32, 12], [36, 28], [29, 35], [10, 34]], PAL.cream, .72);
    face(p, [[22, 3], [32, 12], [36, 28], [29, 25], [25, 12]], PAL.cream, .32, false);
    ball(p, 20, 23, 12, 12, PAL.violet);
    face(p, [[6, 24], [8, 12], [22, 3], [17, 14], [9, 25]], PAL.cream, .8);
    expression(p, 20, 22, 5, mood, blink, { color: PAL.gold[6], shine: PAL.gold[8], mouth: PAL.violet[7], blush: false });
    face(p, [[7, 32], [20, 34], [33, 31], [33, 37], [20, 39], [7, 37]], PAL.cream, .65);
    p.line(20, 34, 20, 38, PAL.cream[0]); p.line(10, 34, 16, 35, PAL.cream[0]); p.line(24, 35, 29, 33, PAL.cream[0]);
  } else if (id === 'auric') {
    for (const d of [-1, 1]) {
      path(p, [[20 + d * 7, 17], [20 + d * 10, 10], [20 + d * 9, 4]], PAL.gold[5]);
      path(p, [[20 + d * 9, 11], [20 + d * 15, 8], [20 + d * 16, 4]], PAL.gold[6]);
      p.line(20 + d * 10, 7, 20 + d * 13, 5, PAL.gold[7]);
      face(p, [[20 + d * 7, 20], [20 + d * 17, 14], [20 + d * 14, 25]], PAL.gold, .65);
    }
    ball(p, 20, 35, 13, 11, PAL.teal); ball(p, 20, 22, 12, 11, PAL.teal);
    face(p, [[9, 25], [10, 33], [15, 30], [20, 36], [25, 30], [30, 32], [31, 25]], PAL.cream, .65);
    ball(p, 19, 29, 9, 6, PAL.cream);
    expression(p, 20, 21, 5, mood, blink, { mouth: PAL.teal[1], blush: false });
    p.set(16, 27, PAL.teal[2]); p.set(22, 27, PAL.teal[2]);
    path(p, [[12, 29], [5, 30], [3, 27], [4, 24]], PAL.gold[6]); path(p, [[28, 29], [35, 32], [36, 28]], PAL.gold[5]);
    face(p, [[17, 14], [20, 10], [23, 14], [20, 17]], PAL.gold, .8);
  } else {
    // The Oracle is a living lattice: transparent-looking faces, not a person
    // with a geometric hat. Its dim halo and grid share the quantization motif.
    p.ellipseDither(20, 20, 16, 16, PAL.gold[4], .28);
    face(p, [[20, 4], [32, 12], [30, 29], [20, 35], [9, 29], [7, 12]], PAL.teal, .28);
    face(p, [[20, 4], [20, 35], [9, 29], [7, 12]], PAL.teal, .55, false);
    face(p, [[20, 4], [32, 12], [20, 19], [7, 12]], PAL.teal, .78);
    path(p, [[7, 12], [20, 19], [32, 12], [30, 29], [20, 35], [9, 29], [7, 12]], PAL.teal[8]);
    p.line(20, 19, 20, 35, PAL.teal[7]);
    p.line(8, 19, 20, 26, PAL.teal[6]); p.line(20, 26, 31, 19, PAL.teal[6]);
    p.line(13, 8, 26, 16, PAL.teal[9]); p.line(14, 16, 14, 32, PAL.teal[7]);
    p.line(26, 15, 25, 32, PAL.teal[6]);
    expression(p, 20, 23, 5, mood, blink, { color: PAL.gold[7], shine: PAL.gold[8], mouth: PAL.gold[7], blush: false, scale: .65 });
    p.rect(18, 5, 3, 3, PAL.gold[7]); p.set(19, 4, PAL.cream[3]);
  }
}
function portraitFrame(p, accent) {
  p.rect(0, 0, 40, 1, PAL.ink); p.rect(0, 39, 40, 1, PAL.ink); p.rect(0, 1, 1, 38, PAL.ink); p.rect(39, 1, 1, 38, PAL.ink);
  p.line(2, 1, 37, 1, PAL.cream[1]); p.line(1, 2, 1, 37, PAL.cream[1]);
  p.line(2, 38, 37, 38, PAL.wood[1]); p.line(38, 2, 38, 37, PAL.wood[1]);
  p.line(3, 2, 36, 2, PAL.night[5]); p.line(2, 3, 2, 36, PAL.night[5]);
  p.line(3, 37, 36, 37, PAL.night[2]); p.line(37, 3, 37, 36, PAL.night[2]);
  for (const [x, y] of [[1, 1], [35, 1], [1, 35], [35, 35]]) {
    p.rect(x, y, 4, 4, PAL.night[2]); p.rect(x + 1, y + 1, 2, 2, accent.at(-3)); p.set(x + 1, y + 1, PAL.cream[3]);
  }
}

/** Framed 40×40 portrait, top-left anchor. Canvas state is left untouched. */
export function drawPortrait(ctx, id, x, y, opts = {}) {
  const chosen = PORTRAIT_IDS.includes(id) ? id : 'oracle', mood = MOODS.includes(opts.mood) ? opts.mood : 'neutral';
  const blink = Math.floor((opts.t ?? 0) * 8 + PORTRAIT_IDS.indexOf(chosen) * 3) % 41 === 0;
  const canvas = spriteCache(`portrait-v2:${chosen}:${mood}:${+blink}`, 40, 40, (p) => {
    const accent = PAL[CHARACTER_LOOKS[chosen]?.coat ?? GUARDIAN_COLORS[chosen]];
    p.rect(0, 0, 40, 40, (px, py) => bayer(px, py) < .25 && py < 17 ? PAL.night[4] : PAL.night[2]);
    p.ellipseDither(18, 19, 16, 16, accent[Math.min(3, accent.length - 1)], .4);
    for (let yy = 6; yy < 38; yy += 8) for (let xx = 6; xx < 38; xx += 8) p.set(xx, yy, PAL.night[5]);
    if (CHARACTER_LOOKS[chosen]) characterBust(p, chosen, mood, blink);
    else guardianBust(p, chosen, mood, blink);
    portraitFrame(p, accent);
  });
  ctx.drawImage(canvas, Math.round(x), Math.round(y));
}
function portraitsGallery(ctx, screen, t, page = 0) {
  const ids = PORTRAIT_IDS.slice((page % 6) * 3, (page % 6) * 3 + 3), portrait = screen.w < 300;
  ctx.fillStyle = PAL.night[1]; ctx.fillRect(0, 0, screen.w, screen.h);
  drawText(ctx, 'Faces, feelings & a little light', 8, 6, { color: PAL.cream[3] });
  drawText(ctx, 'Native 40 x 40 / neutral, happy, worried', 8, 19, { font: 'small', color: PAL.ui.dim });
  ids.forEach((id, i) => {
    const row = Math.floor((screen.h - 53) / 3), px = portrait ? 8 : 8 + i * 126, py = portrait ? 37 + i * row : 36;
    drawText(ctx, id, portrait ? px + 2 : px + 55, py, { align: portrait ? 'left' : 'center', color: PAL.gold[6] });
    MOODS.forEach((mood, m) => {
      const x = portrait ? 23 + m * 65 : px + 35, y = portrait ? py + 13 : py + 15 + m * 50;
      drawPortrait(ctx, id, x, y, { t, mood });
      drawText(ctx, mood.toUpperCase(), x + 20, y + 43, { font: 'small', align: 'center', color: PAL.ui.dim });
    });
  });
}
export const galleries = { portraits: portraitsGallery };
