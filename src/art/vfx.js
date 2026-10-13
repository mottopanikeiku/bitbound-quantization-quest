// Particles, floating text and screen shake. API fixed by the v2 contract; art owned by BattleArt (stub below).
import { PAL } from './palette.js';
import { drawText } from '../engine/font.js';

export const VFX_KINDS = ['spark', 'hit', 'crit', 'snap', 'clip', 'fizzle', 'heal', 'guard', 'perfect', 'burst', 'bytes', 'purify', 'shard', 'dust', 'ring'];

export class Vfx {
  constructor({ reduced = false } = {}) {
    this.reduced = reduced;
    this.items = [];
    this.texts = [];
    this.shakeAmount = 0;
    this.shakeTime = 0;
  }

  spawn(kind, x, y, opts = {}) {
    this.items.push({ kind, x, y, life: 0.4, color: opts.color ?? PAL.ui.gold });
  }

  text(str, x, y, { color = PAL.ui.text, font = 'big', rise = 16, ms = 900 } = {}) {
    this.texts.push({ str, x, y, color, font, rise, life: ms / 1000, total: ms / 1000 });
  }

  shake(amount, ms = 250) {
    this.shakeAmount = this.reduced ? amount * 0.25 : amount;
    this.shakeTime = ms / 1000;
  }

  get offset() {
    if (this.shakeTime <= 0) return { x: 0, y: 0 };
    return { x: Math.round((Math.random() - 0.5) * this.shakeAmount), y: Math.round((Math.random() - 0.5) * this.shakeAmount) };
  }

  update(dt) {
    for (const item of this.items) item.life -= dt;
    for (const text of this.texts) text.life -= dt;
    this.items = this.items.filter((item) => item.life > 0);
    this.texts = this.texts.filter((text) => text.life > 0);
    this.shakeTime -= dt;
  }

  draw(ctx) {
    for (const item of this.items) {
      ctx.fillStyle = item.color;
      ctx.fillRect(Math.round(item.x) - 2, Math.round(item.y) - 2, 4, 4);
    }
    for (const text of this.texts) {
      const p = 1 - text.life / text.total;
      drawText(ctx, text.str, text.x, text.y - p * text.rise, { color: text.color, font: text.font, align: 'center', outline: PAL.ink });
    }
  }

  clear() {
    this.items = [];
    this.texts = [];
    this.shakeTime = 0;
  }
}

export const galleries = {
  vfx(ctx, screen, t) {},
};
