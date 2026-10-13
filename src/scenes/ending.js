import { PAL } from '../art/palette.js';
import { spriteCache, shadeRamp } from '../art/paint.js';
import { clamp, lerp } from '../engine/util.js';
import { drawText, wrapText } from '../engine/font.js';
import { drawWindow, drawBar, drawIcon } from '../ui/kit.js';
import { drawOracleCore } from '../art/portraits.js';
import { drawSpirit } from '../art/creatures.js';
import { REAL_WORLD } from '../content/lessons.js';
import { GUARDIANS, TECHNIQUE_ORDER, TECHNIQUES } from '../content/game-data.js';
import { drawIsleVista } from './title.js';

const CONTRIBUTIONS = [
  ['Nib', 'bits', 'We do not need every bit to keep the shape. Start with a finer choice: 16 bits become 8.'],
  ['Chime', 'zero', 'Let zero be our anchor. A shifted grid gives lopsided values room to breathe.'],
  ['Brine', 'calib', 'Remember the calm, and the storms. Good sample inputs help us choose useful ranges.'],
  ['Spindle', 'groups', 'A little ruler for each group. At 4 bits, small weights need not share a giant scale.'],
  ['Cinder', 'spotlight', 'Some errors echo louder. Watch the inputs, and protect what matters most.'],
  ['Vesper', 'balance', 'Let large inputs and small weights share their burden before either is rounded.'],
  ['Auric', 'budget', 'Spend precision with care. Not every part needs the same number of bits.'],
];
function memoryFor(step) {
  const oracle = REAL_WORLD.oracle;
  return step === 0 ? oracle.fp16GB : step < 4 ? oracle.int8GB : oracle.int4GB;
}
function drawCrystal(ctx, cx, cy, t, reduced) {
  const crystal = spriteCache('ui-oracle-crystal-empty', 90, 108, p => {
    p.ellipseDither(45, 50, 44, 48, PAL.teal[3], 0.28);
    p.poly([[45, 5], [74, 24], [79, 64], [45, 96], [12, 64], [17, 24]], PAL.teal[1]);
    p.poly([[45, 5], [17, 24], [22, 61], [45, 88]], PAL.teal[5]);
    p.poly([[45, 5], [74, 24], [68, 62], [45, 88]], PAL.teal[3]);
    p.poly([[45, 12], [65, 27], [64, 61], [45, 80], [26, 61], [25, 27]], PAL.teal[2]);
    p.line(45, 5, 17, 24, PAL.teal[9]).line(17, 24, 12, 64, PAL.teal[7]);
    p.line(17, 24, 45, 40, PAL.teal[7]).line(45, 40, 74, 24, PAL.teal[5]);
    p.line(45, 40, 45, 87, PAL.teal[6]);
    p.line(12, 64, 45, 96, PAL.teal[4]).line(45, 96, 79, 64, PAL.teal[3]);
    p.poly([[17, 100], [45, 92], [73, 100], [65, 107], [25, 107]], PAL.stone[3]);
    p.line(17, 100, 45, 92, PAL.stone[6]);
    for (let y = 29; y < 60; y += 7) for (let x = 29; x < 61; x += 7) p.rect(x, y, 3, 3, PAL.teal[3]);
  });
  const bob = reduced ? 0 : Math.round(Math.sin(t * 1.5));
  ctx.drawImage(crystal, Math.round(cx - 45), Math.round(cy - 54 + bob));
}

const REVEAL_COPY = 'Not every detail survived. What mattered did. The lighthouse shines again, with all seven friends at its heart.';

function revealLayout({ w, h, portrait }) {
  const lines = wrapText(REVEAL_COPY, w - 44), copyH = lines.length * 11 + 12;
  const copyY = h - 22 - copyH, ground = copyY - 7, stageTop = portrait ? 88 : 80;
  const coreX = Math.round(w * (portrait ? 0.38 : 0.34)), towerX = Math.round(w * 0.79);
  const towerFloor = ground - (portrait ? 15 : 2);
  const towerH = Math.min(portrait ? 130 : 60, towerFloor - stageTop - 14);
  const lampY = towerFloor - towerH + 13;
  const offsets = portrait
    ? [[-59, -8], [-38, -33], [-20, 2], [12, 4], [44, -4], [61, -32], [89, -4]]
    : [[-71, -7], [-52, -28], [-14, 3], [18, 5], [53, -8], [67, -30], [86, -6]];
  const friends = GUARDIANS.map((friend, i) => ({ id: friend.key, x: coreX + offsets[i][0], y: ground + offsets[i][1], back: offsets[i][1] < -16 })).sort((a, b) => a.y - b.y);
  return { w, h, portrait, lines, copyH, copyY, ground, stageTop, coreX, towerX, towerFloor, towerH, lampY, friends, key: `${w}:${h}:${copyY}` };
}

function drawOracleBay(ctx, g) {
  const image = spriteCache(`ending-oracle-bay:${g.key}`, g.w, g.h, p => {
    const { w, h, ground, coreX, towerX: x, towerFloor: foot, towerH, lampY } = g;
    const horizon = ground - 38, top = foot - towerH;
    p.rect(0, 0, w, h, (px, py) => shadeRamp(PAL.sky, 0.03 + py / h * 0.15, px, py, 0.04));
    p.circle(x - 23, top + 2, 14, PAL.sky[2]);
    p.circle(x - 20, top, 11, PAL.cream[1]);
    p.circle(x - 16, top - 3, 11, PAL.sky[2]);
    p.rect(0, horizon, w, h - horizon, (px, py) => shadeRamp(PAL.water, 0.08 + (py - horizon) / h * 0.2, px, py, 0.15));
    p.poly([[0, horizon + 5], [24, horizon - 4], [43, horizon + 2], [67, horizon - 7], [90, horizon + 5]], PAL.sky[1]);
    p.line(0, horizon + 6, w, horizon + 6, PAL.water[2]);
    for (let i = 0; i < 14; i++) {
      const wx = (i * 47 + 13) % w, wy = horizon + 12 + (i * 17) % 31;
      p.line(wx, wy, wx + 3 + (i % 4) * 3, wy, i % 3 ? PAL.water[2] : PAL.water[3]);
    }
    for (const [sx, sy] of [[0.12, 0.25], [0.31, 0.1], [0.47, 0.51], [0.67, 0.32], [0.94, 0.63]]) {
      p.set(Math.round(w * sx), Math.round(g.stageTop + (horizon - g.stageTop) * sy), PAL.sky[4]);
    }
    // A single quiet island shelf grounds the gathering; the path leads to the lens.
    p.poly([[0, ground + 15], [27, ground - 13], [coreX - 22, ground - 26], [coreX + 28, ground - 24], [x + 8, ground - 11], [w, ground + 22], [w, h], [0, h]], PAL.stone[1]);
    p.poly([[0, ground + 10], [27, ground - 15], [coreX - 22, ground - 28], [coreX + 28, ground - 26], [x + 8, ground - 13], [w, ground + 17], [w, ground + 24], [coreX + 21, ground + 15], [coreX - 39, ground + 22]], PAL.forest[1]);
    p.poly([[coreX - 49, ground - 14], [coreX - 15, ground - 28], [coreX + 28, ground - 24], [coreX + 61, ground - 5], [coreX + 43, ground + 9], [coreX - 29, ground + 13]], PAL.forest[2]);
    p.poly([[coreX + 19, ground + 3], [coreX + 26, ground - 4], [x - 9, foot - 2], [x + 9, foot + 5], [x - 5, foot + 8]], PAL.stone[3]);
    p.line(coreX + 31, ground + 2, x - 7, foot + 4, PAL.stone[4]);
    p.ellipse(x + 6, foot + 4, 25, 5, PAL.shadow);
    // Tapered masonry, glass lantern and a native-pixel copper roof.
    p.poly([[x - 10, top + 23], [x + 10, top + 23], [x + 17, foot], [x - 17, foot]], PAL.stone[3]);
    p.poly([[x - 10, top + 23], [x, top + 23], [x + 1, foot], [x - 17, foot]], PAL.stone[5]);
    p.line(x - 10, top + 25, x - 16, foot - 2, PAL.stone[7]);
    for (let y = top + 40; y < foot - 9; y += 19) {
      p.line(x - 11, y, x - 3, y, PAL.stone[4]);
      p.line(x + 3, y + 6, x + 10, y + 6, PAL.stone[2]);
    }
    p.ellipse(x, foot - 9, 4, 6, PAL.stone[0]).rect(x - 4, foot - 9, 8, 10, PAL.stone[0]);
    p.line(x - 3, foot - 9, x - 3, foot - 1, PAL.teal[3]);
    p.rect(x - 18, foot, 36, 3, PAL.stone[4]).rect(x - 20, foot + 3, 40, 2, PAL.stone[2]);
    p.rect(x - 13, top + 4, 26, 17, PAL.night[0]);
    p.rect(x - 10, top + 6, 20, 13, PAL.teal[2]);
    p.rect(x - 10, top + 6, 2, 13, PAL.teal[5]).rect(x + 4, top + 6, 2, 13, PAL.teal[3]);
    p.rect(x - 17, top + 21, 34, 3, PAL.stone[7]);
    p.rect(x - 17, top + 25, 34, 2, PAL.stone[2]);
    p.poly([[x - 18, top + 4], [x - 1, top - 7], [x + 18, top + 4]], PAL.roofBlue[2]);
    p.poly([[x - 18, top + 4], [x - 1, top - 7], [x - 1, top + 4]], PAL.roofBlue[4]);
    p.line(x - 18, top + 4, x - 1, top - 7, PAL.stone[7]);
    p.rect(x - 2, top - 11, 2, 5, PAL.gold[5]).set(x - 2, top - 12, PAL.gold[7]);
    p.rect(x - 3, lampY - 2, 5, 5, PAL.teal[4]);
  });
  ctx.drawImage(image, 0, 0);
}

function drawOracleLight(ctx, g, age, reduced) {
  const frame = reduced ? 17 : age < 1.5 ? Math.min(11, Math.floor(age * 8)) : 12 + Math.floor((age - 1.5) * 6) % 12;
  const light = spriteCache(`ending-oracle-light:${g.key}:${frame}`, g.w, g.ground + 10, p => {
    const charge = frame < 12 ? frame / 11 : 1, sweep = frame < 12 ? 5 : 5 + Math.round(Math.sin((frame - 12) * Math.PI / 6) * 5);
    const { coreX, towerX, lampY, ground, w } = g;
    const start = [coreX, ground - 73], bend = [Math.round(lerp(coreX, towerX, 0.54)), Math.max(g.stageTop + 7, Math.min(ground - 73, lampY) - 7)];
    const reach = clamp((charge - 0.23) / 0.47), beam = clamp((charge - 0.7) / 0.3);
    if (beam > 0) {
      const end = Math.round(lerp(towerX, w + 18, beam));
      p.poly([[towerX, lampY], [end, lampY - 22 + sweep], [end, lampY + 9 + sweep]], `${PAL.teal[6]}38`);
      p.poly([[towerX, lampY - 1], [end, lampY - 15 + sweep], [end, lampY + 3 + sweep]], `${PAL.gold[7]}30`);
      p.line(towerX + 8, lampY, end, lampY - 4 + sweep, `${PAL.cream[3]}60`);
      p.ellipseDither(towerX, lampY, 16, 11, PAL.teal[5], 0.24);
      p.rect(towerX - 9, lampY - 6, 18, 12, PAL.teal[5]);
      p.rect(towerX - 6, lampY - 5, 5, 10, PAL.teal[8]);
      p.rect(towerX + 1, lampY - 5, 4, 10, PAL.teal[7]);
      p.rect(towerX - 2, lampY - 3, 4, 6, PAL.cream[3]);
    }
    if (reach > 0) {
      const a = Math.min(1, reach * 2), b = Math.max(0, reach * 2 - 1);
      const ax = Math.round(lerp(start[0], bend[0], a)), ay = Math.round(lerp(start[1], bend[1], a));
      p.line(start[0], start[1] + 1, ax, ay + 1, `${PAL.teal[5]}80`);
      p.line(start[0], start[1], ax, ay, PAL.teal[7]);
      if (b > 0) {
        const bx = Math.round(lerp(bend[0], towerX, b)), by = Math.round(lerp(bend[1], lampY, b));
        p.line(bend[0], bend[1] + 1, bx, by + 1, `${PAL.teal[5]}80`);
        p.line(bend[0], bend[1], bx, by, PAL.teal[7]);
      }
      const travel = frame < 12 ? reach : (frame - 12) / 11;
      const from = travel < 0.5 ? start : bend, to = travel < 0.5 ? bend : [towerX, lampY], part = travel < 0.5 ? travel * 2 : travel * 2 - 1;
      p.rect(Math.round(lerp(from[0], to[0], part)) - 1, Math.round(lerp(from[1], to[1], part)) - 1, 3, 2, PAL.teal[9]);
    }
  });
  ctx.drawImage(light, 0, 0);
}

function drawOracleChamber(ctx, x, ground, age, t, reduced) {
  const rear = spriteCache('ending-oracle-chamber-rear', 72, 86, p => {
    p.ellipseDither(36, 39, 35, 39, PAL.teal[3], 0.24);
    p.poly([[8, 79], [36, 69], [64, 79], [56, 85], [16, 85]], PAL.stone[2]);
    p.poly([[8, 79], [36, 69], [64, 79], [35, 82]], PAL.stone[5]);
    p.line(8, 79, 36, 69, PAL.stone[7]);
    p.poly([[36, 3], [61, 20], [65, 50], [36, 73], [7, 50], [11, 20]], PAL.teal[1]);
    p.poly([[36, 3], [11, 20], [16, 48], [36, 66]], PAL.teal[4]);
    p.poly([[36, 3], [61, 20], [56, 49], [36, 66]], PAL.teal[3]);
    p.poly([[36, 12], [55, 24], [55, 49], [36, 63], [17, 49], [17, 24]], PAL.teal[2]);
    p.poly([[36, 3], [36, 12], [17, 24], [11, 20]], PAL.teal[6]);
  });
  const left = Math.round(x - 36), top = Math.round(ground - 76);
  ctx.drawImage(rear, left, top);
  drawOracleCore(ctx, Math.round(x - 16), top + 23, { t: reduced ? 0 : t, glow: reduced ? 1 : clamp(age / 0.7) });
  const phase = reduced ? 7 : Math.floor(age * 7) % 8;
  const front = spriteCache(`ending-oracle-chamber-front:${phase}`, 72, 86, p => {
    p.poly([[11, 20], [17, 24], [18, 48], [36, 63], [36, 70], [8, 50]], `${PAL.teal[7]}30`);
    p.poly([[55, 24], [61, 20], [64, 50], [36, 71], [36, 63], [55, 49]], `${PAL.teal[7]}18`);
    p.line(11, 20, 36, 3, PAL.teal[9]).line(11, 20, 7, 50, PAL.teal[7]);
    p.line(36, 3, 61, 20, PAL.teal[6]).line(61, 20, 65, 50, PAL.teal[4]);
    p.line(11, 20, 36, 35, `${PAL.teal[8]}75`).line(36, 35, 61, 20, `${PAL.teal[7]}80`);
    p.line(36, 35, 36, 69, `${PAL.teal[7]}70`);
    p.line(7, 50, 36, 73, PAL.teal[6]).line(36, 73, 65, 50, PAL.teal[4]);
    const spark = [[18, 50], [28, 62], [36, 69], [45, 58], [55, 49], [57, 30], [50, 16], [36, 3]][phase];
    p.rect(spark[0], spark[1], 2, 2, PAL.teal[9]);
  });
  ctx.drawImage(front, left, top);
}
export class EndingScene {
  constructor(game) { this.game = game; this.age = 0; this.step = 0; this.previousGB = REAL_WORLD.oracle.fp16GB; this.revealLayout = null; }
  enter() { this.age = 0; this.step = 0; this.previousGB = REAL_WORLD.oracle.fp16GB; this.game.setMusicScene('ending'); this.announce(); }
  announce() {
    if (this.step === 0) this.game.announce(`The Lighthouse Oracle has ${REAL_WORLD.oracle.weights / 1e9} billion weights: ${REAL_WORLD.oracle.fp16GB} GB at 16 bits.`);
    else if (this.step <= 7) this.game.announce(`${CONTRIBUTIONS[this.step - 1][0]}: ${CONTRIBUTIONS[this.step - 1][2]}`);
    else if (this.step === 8) this.game.announce('The Oracle fits. Seven friends. One bright island.');
    else this.game.announce('Thank you for exploring the Static Isle. Enter returns to free exploration.');
  }
  update(dt, input) {
    this.age += dt;
    if (this.age < 0.22) return;
    if (input.pressed('cancel') && this.step < 9) {
      input.consume('cancel'); this.step = 9; this.age = 0; this.announce(); return;
    }
    if (!input.pressed('confirm')) return; input.consume('confirm');
    if (this.step === 9) { this.game.enterWorld({ afterEnding: true }); return; }
    this.previousGB = memoryFor(this.step); this.step++; this.age = 0; this.game.audio.play(this.step === 8 ? 'restore' : 'snap'); this.announce();
  }
  draw(ctx, screen, t) {
    const { w, h, portrait } = screen;
    if (this.step === 8) { this.drawReveal(ctx, screen, t); return; }
    drawIsleVista(ctx, screen, t, { reduced: this.game.reducedMotion, quiet: true });
    if (this.step === 9) { this.drawCredits(ctx, screen, t); return; }
    drawWindow(ctx, 8, 8, w - 16, h - 16, 'gold');
    drawText(ctx, 'THE LIGHTHOUSE ORACLE', 20, 19, { font: 'small', color: PAL.ui.gold });
    drawText(ctx, '8 billion weights. One small crystal.', 20, 31, { color: PAL.cream[2] });
    const goal = memoryFor(this.step), smooth = this.game.reducedMotion ? 1 : 1 - (1 - clamp(this.age / 1.1)) ** 3;
    const memory = lerp(this.previousGB, goal, smooth), bw = w - 50;
    const ghost = lerp(this.previousGB, goal, this.game.reducedMotion ? 1 : clamp((this.age - 0.35) / 0.95));
    drawBar(ctx, 25, 50, bw, 9, memory, REAL_WORLD.oracle.fp16GB, { fill: this.step >= 4 ? PAL.teal[6] : PAL.water[6], ghost });
    const label = this.step === 0 ? `${REAL_WORLD.oracle.fp16GB} GB · 16-bit weights` : this.step < 4 ? `${REAL_WORLD.oracle.int8GB} GB · 8-bit weights` : `≈${REAL_WORLD.oracle.int4GB.toFixed(1)} GB · 4-bit + group scales`;
    drawText(ctx, label, Math.round(w / 2), 64, { font: 'small', color: PAL.ui.gold, align: 'center' });
    const compact = portrait && h < 360, cx = portrait ? Math.round(w / 2) : 83, cy = portrait ? (compact ? 124 : 144) : 124;
    drawCrystal(ctx, cx, cy, t, this.game.reducedMotion);
    const tx = portrait ? 22 : 152, tw = portrait ? w - 44 : w - 174, ty = portrait ? (compact ? 182 : 209) : 88;
    let title, text, icon;
    if (this.step === 0) {
      title = 'A memory too large'; icon = 'byte';
      text = 'The Oracle remembers every tide and trail. Its weights will not fit the crystal. Seven friends gather.';
    } else {
      const contribution = CONTRIBUTIONS[this.step - 1]; title = `${contribution[0]} · ${TECHNIQUES[contribution[1]].name}`; icon = contribution[1]; text = contribution[2];
    }
    drawIcon(ctx, icon, tx, ty);
    let y = ty;
    for (const line of wrapText(title, tw - 13)) { drawText(ctx, line, tx + 13, y, { color: PAL.ui.gold }); y += 11; }
    y += 8;
    for (const line of wrapText(text, tw)) { drawText(ctx, line, tx, y, { color: PAL.ui.text }); y += 11; }
    const friendY = portrait ? h - 50 : 181, gap = portrait ? 25 : 32, left = Math.round(w / 2 - 3 * gap);
    GUARDIANS.forEach((friend, i) => {
      if (i < this.step) drawSpirit(ctx, friend.key, left + i * gap, friendY, { t: this.game.reducedMotion ? 0 : t });
      else { ctx.fillStyle = PAL.night[5]; ctx.fillRect(left + i * gap - 2, friendY - 4, 4, 2); }
    });
    const caveat = portrait ? '4-bit: FP16 scales / 128.\nNot total runtime memory.' : '4-bit: weights + FP16 scales / 128. Not total runtime memory.';
    drawText(ctx, caveat, Math.round(w / 2), h - (portrait ? 40 : 33), { font: 'small', color: PAL.ui.dim, align: 'center' });
    drawText(ctx, 'A / Enter  Continue', 20, h - 20, { font: 'small', color: PAL.ui.gold });
    drawText(ctx, 'B / Esc  Credits', w - 20, h - 20, { font: 'small', color: PAL.ui.dim, align: 'right' });
  }
  drawReveal(ctx, screen, t) {
    const { w, h, portrait } = screen, reduced = this.game.reducedMotion;
    let g = this.revealLayout;
    if (!g || g.w !== w || g.h !== h) this.revealLayout = g = revealLayout(screen);
    drawOracleBay(ctx, g);
    drawOracleLight(ctx, g, this.age, reduced);
    for (const friend of g.friends) if (friend.back) drawSpirit(ctx, friend.id, friend.x, friend.y, { t: reduced ? 0 : t });
    drawOracleChamber(ctx, g.coreX, g.ground, this.age, t, reduced);
    for (const friend of g.friends) if (!friend.back) drawSpirit(ctx, friend.id, friend.x, friend.y, { t: reduced ? 0 : t });
    drawWindow(ctx, 8, 8, w - 16, portrait ? 76 : 66, 'gold');
    drawText(ctx, 'THE LIGHTHOUSE ORACLE', 20, 15, { font: 'small', color: PAL.ui.gold });
    drawText(ctx, 'The Oracle fits.', 20, 27, { color: PAL.teal[8] });
    drawText(ctx, `${REAL_WORLD.oracle.weights / 1e9}B WEIGHTS`, w - 20, 29, { font: 'small', color: PAL.ui.dim, align: 'right' });
    drawBar(ctx, 22, 43, w - 44, 7, REAL_WORLD.oracle.int4GB, REAL_WORLD.oracle.fp16GB, { fill: PAL.teal[6] });
    drawText(ctx, `≈${REAL_WORLD.oracle.int4GB.toFixed(1)} GB · 4-bit + group scales`, Math.round(w / 2), 54, { font: 'small', color: PAL.ui.gold, align: 'center' });
    const caveat = portrait ? 'FP16 scale / 128; weights only.\nNot total runtime memory.' : 'FP16 scale / 128; weights only. Not total runtime memory.';
    drawText(ctx, caveat, Math.round(w / 2), 64, { font: 'small', color: PAL.ui.dim, align: 'center' });
    drawWindow(ctx, 8, g.copyY, w - 16, g.copyH, 'glass');
    g.lines.forEach((line, i) => drawText(ctx, line, 22, g.copyY + 6 + i * 11, { color: PAL.ui.text }));
    drawText(ctx, 'A / Enter  Credits', 16, h - 13, { font: 'small', color: PAL.ui.gold, shadow: PAL.ink });
    drawText(ctx, 'B / Esc  Credits', w - 16, h - 13, { font: 'small', color: PAL.ui.dim, align: 'right', shadow: PAL.ink });
  }
  drawCredits(ctx, screen, t) {
    const { w, h, portrait } = screen;
    const titleY = portrait ? 48 : 28;
    drawText(ctx, 'A smaller memory.', Math.round(w / 2), titleY, { font: 'big', align: 'center', color: PAL.cream[3], shadow: PAL.ink });
    drawText(ctx, 'A bigger world.', Math.round(w / 2), titleY + 24, { font: 'big', align: 'center', color: PAL.gold[6], shadow: PAL.ink });
    const memory = `${REAL_WORLD.oracle.fp16GB} GB → ${REAL_WORLD.oracle.int8GB} GB → ≈${REAL_WORLD.oracle.int4GB.toFixed(1)} GB`;
    drawText(ctx, memory, Math.round(w / 2), titleY + 57, { align: 'center', color: PAL.teal[8], shadow: PAL.ink });
    const cols = portrait ? 4 : 7, gap = portrait ? 47 : 49, startY = portrait ? 167 : 127;
    GUARDIANS.forEach((friend, i) => {
      const rowCount = portrait && i >= 4 ? 3 : cols;
      const x = Math.round(w / 2 - (rowCount - 1) * gap / 2 + (i % cols) * gap), y = startY + Math.floor(i / cols) * 54;
      drawSpirit(ctx, friend.key, x, y, { t: this.game.reducedMotion ? 0 : t });
      drawText(ctx, friend.name, x, y + 6, { font: 'small', align: 'center', color: PAL.cream[3], shadow: PAL.ink });
      drawIcon(ctx, TECHNIQUE_ORDER[i], x - 4, y + 17);
    });
    drawText(ctx, 'Original art, music & a little rounding magic.', Math.round(w / 2), h - 49, { font: 'small', align: 'center', color: PAL.cream[1], shadow: PAL.ink });
    drawText(ctx, 'Thank you for keeping what matters.', Math.round(w / 2), h - 37, { align: 'center', color: PAL.cream[3], shadow: PAL.ink });
    drawWindow(ctx, Math.round(w / 2) - 85, h - 24, 170, 18, 'glass');
    drawText(ctx, 'A / Enter  Return to the isle', Math.round(w / 2), h - 19, { font: 'small', align: 'center', color: PAL.ui.gold });
  }
}
