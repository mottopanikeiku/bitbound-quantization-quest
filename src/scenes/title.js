import { PAL } from '../art/palette.js';
import { Pix, bayer, shadeRamp, spriteCache } from '../art/paint.js';
import { hash2, makeCanvas } from '../engine/util.js';
import { drawText, measureText, wrapText } from '../engine/font.js';
import { drawMenu, drawWindow, drawIcon, drawScrim } from '../ui/kit.js';

const vistaCache = new Map();
const SKY = [PAL.night[1], PAL.sky[0], PAL.sky[1], PAL.night[5], PAL.ash[5], PAL.sand[3], PAL.sand[5]];
function vista(w, h) {
  const key = `${w}:${h}`;
  if (vistaCache.has(key)) return vistaCache.get(key);
  const horizon = Math.round(h * 0.54), landY = Math.round(h * 0.68), lx = Math.round(w * 0.77), ly = landY - 17;
  const sky = new Pix(w, h);
  sky.rect(0, 0, w, horizon, (x, y) => shadeRamp(SKY, y / horizon * 0.94, x, y, 0.42));
  sky.circle(Math.round(w * 0.72), horizon - 20, 13, PAL.gold[7]);
  sky.rect(0, horizon, w, h - horizon, (x, y) => shadeRamp([PAL.water[0], PAL.water[1], PAL.water[2], PAL.sky[2]], 1 - (y - horizon) / (h - horizon), x, y, 0.35));
  // Far shore: stepped atmospheric ridges rather than repeated triangular mountains.
  sky.poly([[0, horizon + 3], [0, horizon - 9], [17, horizon - 12], [31, horizon - 23], [44, horizon - 25], [52, horizon - 34], [65, horizon - 23], [82, horizon - 19], [107, horizon - 10], [143, horizon + 3]], PAL.sky[1]);
  sky.poly([[w * 0.35, horizon + 4], [w * 0.41, horizon - 6], [w * 0.48, horizon - 8], [w * 0.53, horizon - 16], [w * 0.59, horizon - 4], [w * 0.63, horizon + 4]], PAL.violet[3]);
  const land = new Pix(w, h);
  land.poly([[w * 0.44, landY + 8], [w * 0.56, landY - 3], [w * 0.6, landY - 14], [w * 0.8, landY - 20], [w * 0.91, landY - 10], [w, landY + 4], [w, landY + 27], [w * 0.74, landY + 38], [w * 0.57, landY + 24]], PAL.stone[1]);
  land.poly([[w * 0.44, landY + 8], [w * 0.65, landY + 9], [w * 0.7, landY + 34], [w * 0.57, landY + 24]], PAL.stone[2]);
  land.poly([[w * 0.79, landY + 7], [w * 0.85, landY + 31], [w * 0.93, landY + 29], [w * 0.9, landY + 5]], PAL.stone[0]);
  land.poly([[w * 0.44, landY + 8], [w * 0.6, landY - 14], [w * 0.8, landY - 20], [w * 0.91, landY - 10], [w, landY + 4], [w * 0.84, landY + 8], [w * 0.65, landY + 9]], PAL.forest[1]);
  land.poly([[w * 0.52, landY + 3], [w * 0.6, landY - 12], [w * 0.8, landY - 18], [w * 0.9, landY - 9], [w * 0.72, landY - 2]], PAL.forest[2]);
  for (let i = 0; i < 24; i++) {
    const x = Math.round(w * 0.55 + hash2(i, 6) * w * 0.44), y = landY + 12 + Math.round(hash2(i, 7) * 14);
    land.line(x, y, x - 2, y + 5, PAL.stone[2]);
  }
  // Tiny roof clusters and windows describe the sheltered village below the tower.
  for (let i = 0; i < 5; i++) {
    const x = Math.round(w * 0.6) + i * 12, y = landY - 1 + (i % 2) * 3;
    land.rect(x, y - 8, 9, 8, PAL.wood[2]).poly([[x - 2, y - 8], [x + 4, y - 14], [x + 11, y - 8]], PAL.roof[2]);
    land.rect(x + 2, y - 5, 2, 3, PAL.gold[6]).rect(x + 6, y - 5, 1, 2, PAL.gold[4]);
  }
  // Tapered tower, sun-facing stones and a warm lantern room.
  land.poly([[lx - 8, ly], [lx - 5, ly - 40], [lx + 5, ly - 40], [lx + 8, ly]], PAL.stone[3]);
  land.poly([[lx - 7, ly], [lx - 4, ly - 40], [lx, ly - 40], [lx + 1, ly]], PAL.cream[1]);
  land.rect(lx - 7, ly - 43, 14, 3, PAL.stone[2]);
  land.rect(lx - 5, ly - 54, 10, 11, PAL.gold[6]);
  land.rect(lx - 3, ly - 52, 5, 7, PAL.gold[8]);
  land.line(lx - 5, ly - 53, lx - 5, ly - 44, PAL.wood[2]).line(lx + 4, ly - 53, lx + 4, ly - 44, PAL.wood[2]);
  land.poly([[lx - 9, ly - 54], [lx, ly - 63], [lx + 9, ly - 54]], PAL.roof[3]);
  land.line(lx - 8, ly - 54, lx, ly - 62, PAL.roof[5]);
  land.rect(lx - 2, ly - 26, 3, 5, PAL.water[0]).rect(lx - 2, ly - 9, 5, 9, PAL.wood[1]);
  land.rect(lx - 10, ly, 21, 3, PAL.stone[2]);
  // Close foreground foliage gives the miniature sea distance and a soft frame.
  land.poly([[0, h], [0, h - 22], [w * 0.08, h - 31], [w * 0.15, h - 24], [w * 0.2, h - 7], [w * 0.4, h]], PAL.forest[0]);
  for (let i = 0; i < 8; i++) {
    const x = i * 9 - 6, y = h - 14 - Math.round(hash2(i, 8) * 19);
    land.line(x, h, x + 5, y, PAL.forest[1]);
    land.ellipse(x + 3, y + 5, 5, 2, PAL.forest[2]);
    if (i % 3 === 0) land.rect(x + 4, y, 2, 2, PAL.gold[5]);
  }
  const result = { sky: sky.toCanvas(), land: land.toCanvas(), horizon, lx, lampY: ly - 49 };
  vistaCache.set(key, result); return result;
}
/** Shared cinematic seascape; all motion is integer rasterized and can be reduced. */
export function drawIsleVista(ctx, screen, t, { reduced = false, quiet = false } = {}) {
  const { w, h } = screen, v = vista(w, h), time = reduced ? 0 : t;
  ctx.drawImage(v.sky, 0, 0);
  for (let i = 0; i < 29; i++) {
    const x = Math.floor(hash2(i, 15) * w), y = Math.floor(hash2(i, 16) * v.horizon * 0.68);
    ctx.fillStyle = (Math.floor(time * 0.6 + i) % 5 === 0) ? PAL.cream[2] : PAL.sky[4]; ctx.fillRect(x, y, 1, 1);
  }
  const cloud = spriteCache('ui-vista-cloud', 77, 17, p => {
    p.ellipse(31, 10, 28, 6, PAL.night[5]).ellipse(21, 7, 13, 5, PAL.night[5]).ellipse(45, 5, 14, 5, PAL.night[5]);
    p.line(8, 14, 66, 14, PAL.ash[5]).line(19, 15, 57, 15, PAL.sand[3]);
  });
  for (let i = 0; i < 3; i++) ctx.drawImage(cloud, Math.round(((i * 151 + time * (1 + i * 0.3)) % (w + 100)) - 72), Math.round(v.horizon * (0.28 + i * 0.19)));
  for (let i = 0; i < 75; i++) {
    const x = Math.floor(hash2(i, 18) * w), y = v.horizon + 3 + Math.floor(hash2(i, 19) * (h - v.horizon));
    const pulse = Math.sin(time * 1.5 + i * 2.3);
    ctx.fillStyle = i % 7 === 0 && pulse > 0 ? PAL.sand[3] : PAL.water[3];
    ctx.fillRect(x + Math.round(pulse * 2), y, 2 + Math.floor(hash2(i, 20) * 8), 1);
  }
  const sweep = Math.round((Math.sin(time * 0.24) * 0.5 + 0.5) * 15);
  const beam = spriteCache(`ui-vista-beam:${w}:${h}:${sweep}`, w, h, p => {
    const target = -w * 0.35 + sweep / 15 * w * 1.7, y = v.lampY + 6;
    p.poly([[v.lx, v.lampY], [target, y - 22], [target, y + 20]], (x, yy) => bayer(x, yy) < 0.45 ? `${PAL.gold[6]}35` : `${PAL.gold[6]}18`);
  });
  ctx.drawImage(beam, 0, 0); ctx.drawImage(v.land, 0, 0);
  if (quiet) { ctx.fillStyle = '#0d0a1940'; ctx.fillRect(0, 0, w, h); }
}
let logo;
function drawLogo(ctx, cx, y) {
  if (!logo) {
    const width = measureText('BITBOUND', 'big') + 8, { canvas, ctx: ink } = makeCanvas(width, 25);
    drawText(ink, 'BITBOUND', 4, 3, { font: 'big', color: PAL.gold[6], outline: PAL.ink, shadow: PAL.violet[2] });
    const image = ink.getImageData(0, 0, width, 25);
    for (let py = 0; py < 25; py++) for (let px = 0; px < width; px++) {
      const i = (py * width + px) * 4;
      if (image.data[i] !== 249 || image.data[i + 1] !== 214) continue;
      const tone = py < 9 ? [255, 244, 220] : py < 14 ? [249, 214, 90] : [217, 143, 39];
      image.data[i] = tone[0]; image.data[i + 1] = tone[1]; image.data[i + 2] = tone[2];
    }
    ink.putImageData(image, 0, 0); logo = canvas;
  }
  // A deliberate 2× title treatment, never a scaled gameplay sprite.
  ctx.drawImage(logo, Math.round(cx - logo.width), Math.round(y), logo.width * 2, logo.height * 2);
}
export class TitleScene {
  constructor(game) { this.game = game; this.selected = 0; this.confirming = false; this.age = 0; }
  enter() { this.selected = 0; this.confirming = false; this.age = 0; this.game.setMusicScene('title'); }
  items() { return this.confirming ? ['Keep my adventure', 'Begin anew'] : this.game.state.started ? ['Continue', 'New Game'] : ['New Game']; }
  update(dt, input) {
    this.age += dt;
    if (input.repeat('up') || input.repeat('down')) { this.selected = (this.selected + 1) % this.items().length; this.game.audio.play('menu-move'); }
    if (this.confirming && input.pressed('cancel')) { input.consume('cancel'); this.confirming = false; this.selected = 1; return; }
    if (!input.pressed('confirm')) return; input.consume('confirm');
    if (this.confirming) {
      if (this.selected === 1) this.game.newGame();
      else { this.confirming = false; this.selected = 1; }
    } else if (this.items()[this.selected] === 'Continue') this.game.continueGame();
    else if (this.game.state.started) { this.confirming = true; this.selected = 0; this.game.announce('New game erases your saved adventure. Keep my adventure is selected.'); }
    else this.game.newGame();
  }
  draw(ctx, screen, t) {
    const { w, h, portrait } = screen, cx = Math.round(w / 2);
    drawIsleVista(ctx, screen, t, { reduced: this.game.reducedMotion });
    const top = portrait ? 42 : 24;
    drawText(ctx, 'A SMALL WORLD. A LITTLE LESS PRECISION.', cx, top - 9, { font: 'small', align: 'center', color: PAL.cream[1], shadow: PAL.ink });
    drawLogo(ctx, cx, top);
    drawText(ctx, 'THE STATIC ISLE', cx, top + 48, { align: 'center', color: PAL.cream[3], shadow: PAL.ink });
    const sy = top + 63;
    ctx.fillStyle = PAL.gold[4]; ctx.fillRect(cx - 38, sy + 3, 26, 1); ctx.fillRect(cx + 12, sy + 3, 26, 1); drawIcon(ctx, 'bits', cx - 4, sy);
    const mw = 129, my = portrait ? h - 94 : h - 71, mh = this.items().length === 1 ? 33 : 48;
    drawWindow(ctx, cx - Math.round(mw / 2), my, mw, mh, 'glass');
    drawMenu(ctx, cx - 49, my + 11, this.game.state.started ? ['Continue', 'New Game'] : ['New Game'], this.confirming ? 1 : this.selected, { colWidth: 105, rowHeight: 16, t: this.game.reducedMotion ? 0 : t });
    const keys = w >= 240 ? 'Enter begins with music · M mutes · F full screen' : 'Enter begins · M music · F full screen';
    drawText(ctx, this.game.input.lastDevice === 'touch' ? 'A begins the adventure · B goes back' : keys, cx, h - 12, { font: 'small', align: 'center', color: PAL.cream[1], shadow: PAL.ink });
    if (this.confirming) {
      drawScrim(ctx, screen); const width = Math.min(w - 28, 232), x = Math.round((w - width) / 2), y = Math.round((h - 118) / 2);
      drawWindow(ctx, x, y, width, 118, 'danger'); drawText(ctx, 'Begin a new adventure?', x + 13, y + 12, { color: PAL.ui.bad });
      let cy = y + 32;
      for (const line of wrapText('Your current friends and discoveries will be erased.', width - 26)) { drawText(ctx, line, x + 13, cy, { color: PAL.ui.dim }); cy += 11; }
      drawMenu(ctx, x + 14, y + 73, this.items(), this.selected, { colWidth: width - 27, rowHeight: 19, t: this.game.reducedMotion ? 0 : t });
    }
  }
}
