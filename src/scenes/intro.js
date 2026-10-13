import { PAL } from '../art/palette.js';
import { spriteCache, buildPaletteLUT, posterize } from '../art/paint.js';
import { makeCanvas } from '../engine/util.js';
import { drawText, wrapText } from '../engine/font.js';
import { drawWindow, drawPageDots, drawIcon, panelLift } from '../ui/kit.js';
import { drawSpirit } from '../art/creatures.js';
import { drawCharacter } from '../art/characters.js';
import { GUARDIANS } from '../content/game-data.js';
import { drawIsleVista } from './title.js';

const PANELS = [
  { chapter: '01 / AN ISLE IN FULL COLOUR', title: 'Every shade had a home.', text: 'The island held a thousand colours, seven gentle spirits, and one rather ambitious lighthouse.' },
  { chapter: '02 / THEN CAME THE STATIC', title: 'The world lost its detail.', text: 'The Static squeezed everything into too few bits. Nearby colours became the same. Small things vanished in the rounding.' },
  { chapter: '03 / SEVEN FRIENDS, LOST', title: 'There are voices in the noise.', text: 'The spirits are still in there. Each knows a different way to keep what matters, without carrying everything.' },
  { chapter: '04 / YOUR MAP STARTS HERE', title: 'Take the Gridstaff.', text: 'Choose your bits. Fit your range. Snap the noise into a kinder shape. A small memory can hold a very big adventure.' },
];
const staticViews = new Map();
function drawPostcard(ctx, x, y, w, h, index, t, reduced) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.translate(x, y);
  if (index < 2) {
    if (index === 0) drawIsleVista(ctx, { w, h }, t, { reduced });
    else {
      const key = `${w}:${h}`;
      if (!staticViews.has(key)) {
        const { canvas, ctx: ink } = makeCanvas(w, h); drawIsleVista(ink, { w, h }, 0, { reduced: true });
        const image = ink.getImageData(0, 0, w, h);
        posterize(image, buildPaletteLUT([PAL.night[1], PAL.violet[3], PAL.violet[5], PAL.cream[1]]), { dither: 36 });
        ink.putImageData(image, 0, 0); staticViews.set(key, canvas);
      }
      ctx.drawImage(staticViews.get(key), 0, 0);
      for (let i = 0; i < 5; i++) {
        const yy = (i * 31 + (reduced ? 0 : Math.floor(t * 7))) % h;
        ctx.fillStyle = `${PAL.violet[7]}35`; ctx.fillRect((i * 47) % w, yy, 27, 2);
      }
      drawText(ctx, 'FEWER BITS → FEWER COLOURS', Math.round(w / 2), h - 13, { font: 'small', align: 'center', color: PAL.cream[3], shadow: PAL.ink });
    }
  } else {
    const backdrop = spriteCache(`ui-intro:${w}:${h}:${index}`, w, h, p => {
      p.rect(0, 0, w, h, PAL.night[1]);
      for (let gx = 0; gx < w; gx += 12) for (let gy = 0; gy < h; gy += 12) p.set(gx, gy, PAL.night[4]);
      if (index === 2) {
        p.ellipseDither(w / 2, h / 2, w * 0.42, h * 0.42, PAL.violet[3], 0.5);
        for (let i = 0; i < 4; i++) p.rect(8, 22 + i * 27, w - 16, 1, PAL.night[4]);
      } else {
        p.ellipseDither(w / 2, h * 0.51, 50, 60, PAL.teal[3], 0.45);
        p.poly([[0, h], [0, h - 27], [w * 0.35, h - 39], [w * 0.8, h - 29], [w, h - 18], [w, h]], PAL.stone[1]);
        p.poly([[0, h - 27], [w * 0.35, h - 39], [w * 0.8, h - 29], [w, h - 18], [w * 0.3, h - 23]], PAL.grass[2]);
        const cx = Math.round(w / 2), cy = Math.round(h * 0.41);
        p.line(cx + 9, cy + 16, cx - 3, cy + 55, PAL.wood[4]);
        p.poly([[cx - 9, cy - 3], [cx + 4, cy - 10], [cx + 17, cy - 3], [cx + 17, cy + 10], [cx + 4, cy + 17], [cx - 9, cy + 10]], PAL.teal[2]);
        p.poly([[cx - 9, cy - 3], [cx + 4, cy - 10], [cx + 17, cy - 3], [cx + 4, cy + 4]], PAL.teal[6]);
        p.line(cx - 9, cy - 3, cx + 4, cy + 4, PAL.teal[9]).line(cx + 4, cy + 4, cx + 17, cy - 3, PAL.teal[9]);
        p.line(cx + 4, cy + 4, cx + 4, cy + 17, PAL.teal[8]);
        p.line(cx - 3, cy, cx - 3, cy + 13, PAL.teal[7]).line(cx + 10, cy + 1, cx + 10, cy + 13, PAL.teal[5]);
        p.line(cx - 9, cy + 4, cx + 4, cy + 11, PAL.teal[7]).line(cx + 4, cy + 11, cx + 17, cy + 4, PAL.teal[5]);
        for (let i = 0; i < 16; i++) p.set((i * 37 + 11) % w, (i * 23 + 19) % Math.floor(h * 0.72), i % 3 ? PAL.teal[5] : PAL.gold[6]);
      }
    });
    ctx.drawImage(backdrop, 0, 0);
    if (index === 2) {
      GUARDIANS.forEach((friend, i) => {
        const angle = i / 7 * Math.PI * 2 - Math.PI / 2, cx = Math.round(w / 2 + Math.cos(angle) * w * 0.31), cy = Math.round(h / 2 + Math.sin(angle) * h * 0.30 + 10);
        drawSpirit(ctx, friend.key, cx, cy, { t: reduced ? 0 : t, corrupted: true });
      });
      drawIcon(ctx, 'heart', Math.round(w / 2) - 4, Math.round(h / 2) - 3);
    } else {
      drawCharacter(ctx, 'keeper', Math.round(w * 0.34), h - 30, { t: reduced ? 0 : t, dir: 'right', frame: -1 });
      drawCharacter(ctx, 'hero', Math.round(w * 0.67), h - 25, { t: reduced ? 0 : t, dir: 'left', frame: -1 });
      if (!reduced) { ctx.fillStyle = PAL.teal[8]; for (let i = 0; i < 5; i++) ctx.fillRect(Math.round(w / 2 + Math.sin(t + i) * 24), Math.round(h * 0.4 + Math.cos(t * 0.8 + i * 2) * 27), 1, 1); }
    }
  }
  ctx.restore();
}
export class IntroScene {
  constructor(game) { this.game = game; this.index = 0; this.age = 0; }
  enter() { this.index = 0; this.age = 0; this.announce(); }
  announce() { this.game.announce(`${PANELS[this.index].title} ${PANELS[this.index].text}`); }
  update(dt, input) {
    this.age += dt;
    if (input.pressed('cancel')) { input.consume('cancel'); this.game.enterWorld(); return; }
    if (input.pressed('left') && this.index > 0) { this.index--; this.age = 0; this.announce(); this.game.audio.play('menu-back'); }
    if (!input.pressed('confirm') && !input.pressed('right')) return;
    input.consume('confirm'); input.consume('right');
    if (this.index === PANELS.length - 1) { this.game.enterWorld(); return; }
    this.index++; this.age = 0; this.announce(); this.game.audio.play('select');
  }
  draw(ctx, screen, t) {
    const { w, h, portrait } = screen, panel = PANELS[this.index], lift = panelLift(this.age, this.game.reducedMotion);
    ctx.fillStyle = PAL.night[1]; ctx.fillRect(0, 0, w, h);
    const iw = portrait ? w - 24 : 191, ih = portrait ? Math.min(186, Math.round(h * 0.44)) : 143;
    const ix = 12, iy = portrait ? 35 : 31;
    drawText(ctx, 'THE STATIC ISLE', 14, 12, { font: 'small', color: PAL.ui.faint });
    drawText(ctx, `${this.index + 1} / 4`, w - 14, 12, { font: 'small', align: 'right', color: PAL.ui.gold });
    drawWindow(ctx, ix, iy + lift, iw, ih, 'gold');
    drawPostcard(ctx, ix + 4, iy + 4 + lift, iw - 8, ih - 8, this.index, t, this.game.reducedMotion);
    const tx = portrait ? 18 : 218, ty = portrait ? iy + ih + 17 : 45, tw = portrait ? w - 36 : w - tx - 17;
    let y = ty;
    for (const row of wrapText(panel.chapter, tw, 'small')) { drawText(ctx, row, tx, y, { font: 'small', color: PAL.ui.gold }); y += 8; }
    y += 8;
    for (const row of wrapText(panel.title, tw)) { drawText(ctx, row, tx, y, { color: PAL.cream[3] }); y += 11; }
    y += 9;
    for (const row of wrapText(panel.text, tw)) { drawText(ctx, row, tx, y, { color: PAL.ui.dim }); y += 11; }
    drawPageDots(ctx, w / 2, h - 28, 4, this.index);
    drawText(ctx, this.index === 3 ? 'A / Enter  Take the staff' : 'A / Enter  Next', 14, h - 16, { font: 'small', color: PAL.ui.gold });
    drawText(ctx, 'B / Esc  Skip', w - 14, h - 16, { font: 'small', color: PAL.ui.faint, align: 'right' });
  }
}
