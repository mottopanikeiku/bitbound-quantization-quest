import { PAL } from '../art/palette.js';
import { spriteCache } from '../art/paint.js';
import { clamp, lerp } from '../engine/util.js';
import { drawText, wrapText } from '../engine/font.js';
import { drawWindow, drawBar, drawIcon } from '../ui/kit.js';
import { drawPortrait } from '../art/portraits.js';
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
function drawCrystal(ctx, cx, cy, t, complete, reduced) {
  const crystal = spriteCache(`ui-oracle-crystal:${complete}`, 90, 108, p => {
    p.ellipseDither(45, 50, 44, 48, PAL.teal[3], complete ? 0.58 : 0.28);
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
    for (let y = 29; y < 60; y += 7) for (let x = 29; x < 61; x += 7) p.rect(x, y, 3, 3, complete ? PAL.teal[7] : PAL.teal[3]);
  });
  const bob = reduced ? 0 : Math.round(Math.sin(t * 1.5));
  ctx.drawImage(crystal, Math.round(cx - 45), Math.round(cy - 54 + bob));
  if (complete) drawPortrait(ctx, 'oracle', Math.round(cx - 20), Math.round(cy - 25 + bob), { t: reduced ? 0 : t, mood: 'happy' });
}
export class EndingScene {
  constructor(game) { this.game = game; this.age = 0; this.step = 0; this.previousGB = REAL_WORLD.oracle.fp16GB; }
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
    drawCrystal(ctx, cx, cy, t, this.step >= 8, this.game.reducedMotion);
    const tx = portrait ? 22 : 152, tw = portrait ? w - 44 : w - 174, ty = portrait ? (compact ? 182 : 209) : 88;
    let title, text, icon;
    if (this.step === 0) {
      title = 'A memory too large'; icon = 'byte';
      text = 'The Oracle remembers every tide and trail. Its weights will not fit the crystal. Seven friends gather.';
    } else if (this.step <= 7) {
      const contribution = CONTRIBUTIONS[this.step - 1]; title = `${contribution[0]} · ${TECHNIQUES[contribution[1]].name}`; icon = contribution[1]; text = contribution[2];
    } else {
      title = 'The Oracle fits.'; icon = 'star'; text = 'Not every detail survived. What mattered did. The lighthouse shines again, with all seven friends at its heart.';
    }
    drawIcon(ctx, icon, tx, ty);
    let y = ty;
    for (const line of wrapText(title, tw - 13)) { drawText(ctx, line, tx + 13, y, { color: PAL.ui.gold }); y += 11; }
    y += 8;
    for (const line of wrapText(text, tw)) { drawText(ctx, line, tx, y, { color: PAL.ui.text }); y += 11; }
    const friendY = portrait ? h - 50 : 181, gap = portrait ? 25 : 32, left = Math.round(w / 2 - 3 * gap);
    GUARDIANS.forEach((friend, i) => {
      if (i < this.step || this.step >= 8) drawSpirit(ctx, friend.key, left + i * gap, friendY, { t: this.game.reducedMotion ? 0 : t });
      else { ctx.fillStyle = PAL.night[5]; ctx.fillRect(left + i * gap - 2, friendY - 4, 4, 2); }
    });
    const caveat = portrait ? '4-bit: FP16 scales / 128.\nNot total runtime memory.' : '4-bit: weights + FP16 scales / 128. Not total runtime memory.';
    drawText(ctx, caveat, Math.round(w / 2), h - (portrait ? 40 : 33), { font: 'small', color: PAL.ui.dim, align: 'center' });
    drawText(ctx, this.step === 8 ? 'A / Enter  Credits' : 'A / Enter  Continue', 20, h - 20, { font: 'small', color: PAL.ui.gold });
    drawText(ctx, 'B / Esc  Credits', w - 20, h - 20, { font: 'small', color: PAL.ui.dim, align: 'right' });
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
