// Pixel-only combat punctuation. Sprites are cached; active particles reuse a bounded object pool.
import { PAL } from './palette.js';
import { bayer, spriteCache } from './paint.js';
import { clamp, rng } from '../engine/util.js';
import { drawText } from '../engine/font.js';

export const VFX_KINDS = ['spark', 'hit', 'crit', 'snap', 'clip', 'fizzle', 'heal', 'guard', 'perfect', 'burst', 'bytes', 'purify', 'shard', 'dust', 'ring'];

const TAU = Math.PI * 2;
const MAX_PARTICLES = 640;
// count, speed, lifetime, gravity, drag, colour; speeds are game pixels/second.
const STYLE = {
  spark: [12, 58, 0.52, 44, 1.8, PAL.gold[6]],
  hit: [14, 84, 0.42, 64, 2.4, PAL.cream[2]],
  crit: [22, 108, 0.64, 76, 2.1, PAL.gold[6]],
  snap: [14, 62, 0.66, 0, 3.2, PAL.teal[7]],
  clip: [10, 67, 0.58, 90, 1.5, PAL.ember[6]],
  fizzle: [9, 21, 0.82, -8, 1.9, PAL.violet[5]],
  heal: [12, 24, 1.0, -22, 1.2, PAL.teal[7]],
  guard: [10, 46, 0.58, 10, 3.0, PAL.water[8]],
  perfect: [20, 79, 0.92, -12, 2.4, PAL.gold[7]],
  burst: [26, 94, 0.74, 34, 2.1, PAL.rose[5]],
  bytes: [10, 30, 1.05, -25, 1.5, PAL.water[8]],
  purify: [30, 72, 1.18, -24, 1.4, PAL.teal[8]],
  shard: [8, 52, 0.92, 64, 1.2, PAL.violet[7]],
  dust: [7, 20, 0.48, -3, 2.6, PAL.cream[0]],
  ring: [1, 0, 0.62, 0, 0, PAL.gold[6]],
};

function star(p, x, y, r, color) {
  p.line(x - r, y, x + r, y, color).line(x, y - r, x, y + r, color);
  p.rect(x - 1, y - 1, 3, 3, color);
}

function particleSprite(kind, color, fade, variant = 0) {
  return spriteCache(`vfx:${kind}:${color}:${fade}:${variant}`, 15, 15, (p) => {
    const x = 7;
    const y = 7;
    const light = kind === 'fizzle' || kind === 'dust' ? color : PAL.cream[3];
    if (kind === 'spark' || kind === 'perfect' || kind === 'crit' || kind === 'purify') {
      const r = kind === 'crit' ? 5 : kind === 'perfect' ? 4 : 3;
      star(p, x, y, r, PAL.ink);
      star(p, x, y, r - 1, color);
      if (kind === 'crit' || kind === 'perfect') p.line(4, 4, 10, 10, color).line(4, 10, 10, 4, color);
      p.rect(6, 6, 2, 2, light);
    } else if (kind === 'hit' || kind === 'clip') {
      p.poly([[3, 11], [5, 5], [11, 2], [8, 8]], PAL.ink);
      p.line(4, 10, 9, 4, color).line(5, 10, 10, 3, color);
      p.line(6, 7, 10, 3, light);
      if (kind === 'clip') p.rect(3, 3, 3, 1, color).rect(3, 3, 1, 3, color);
    } else if (kind === 'snap') {
      p.rect(3, 3, 9, 9, PAL.ink).rect(4, 4, 7, 7, color).rect(5, 5, 5, 5, PAL.teal[1]);
      p.rect(6, 6, 3, 3, color).set(6, 6, light);
    } else if (kind === 'heal') {
      p.rect(5, 2, 5, 11, PAL.ink).rect(2, 5, 11, 5, PAL.ink);
      p.rect(6, 3, 3, 9, color).rect(3, 6, 9, 3, color).rect(6, 3, 2, 5, light);
    } else if (kind === 'guard') {
      p.poly([[3, 3], [7, 1], [11, 3], [10, 9], [7, 12], [4, 9]], PAL.ink);
      p.poly([[4, 4], [7, 2], [10, 4], [9, 8], [7, 10], [5, 8]], color);
      p.line(5, 4, 7, 3, light).line(5, 4, 5, 7, light);
    } else if (kind === 'bytes') {
      p.rect(4, 3, 7, 9, PAL.ink);
      if (variant) p.rect(7, 4, 2, 6, color).rect(5, 5, 2, 1, color).rect(5, 10, 6, 1, color);
      else p.rect(5, 4, 5, 7, color).rect(7, 6, 1, 3, PAL.water[1]);
      p.set(5, 4, light);
    } else if (kind === 'shard') {
      p.poly([[7, 1], [11, 6], [8, 13], [3, 8]], PAL.ink);
      p.poly([[7, 2], [10, 6], [8, 11], [4, 8]], color);
      p.poly([[7, 2], [7, 8], [4, 8]], light);
    } else if (kind === 'fizzle') {
      p.rect(4, 6, 5, 3, color).rect(7, 4, 3, 3, color).rect(9, 9, 2, 2, color);
      p.rect(5, 6, 2, 1, PAL.violet[3]);
    } else if (kind === 'dust') {
      p.rect(5, 7, 5, 2, color).rect(6, 6, 3, 3, color);
    } else {
      p.rect(4, 4, 7, 7, PAL.ink).rect(5, 5, 5, 5, color).rect(5, 5, 2, 2, light);
    }
    if (fade) p.each((xx, yy, value) => bayer(xx, yy) < 1 - fade * 0.25 ? value : null);
  });
}

function ringSprite(color, step, fade) {
  const r = 4 + step * 3;
  const size = r * 2 + 3;
  return spriteCache(`vfx:ring:${color}:${step}:${fade}`, size, size, (p) => {
    const c = r + 1;
    p.circle(c, c, r + 1, (x, y, nx, ny) => {
      const distance = nx * nx + ny * ny;
      if (distance < ((r - 1) / (r + 1)) ** 2 || bayer(x, y) > 1 - fade * 0.25) return null;
      return x + y < size || distance < 0.95 ? color : PAL.ink;
    });
    if (step < 5) {
      p.rect(c - 1, 0, 2, 3, color).rect(c - 1, size - 3, 2, 3, color);
      p.rect(0, c - 1, 3, 2, color).rect(size - 3, c - 1, 3, 2, color);
    }
  });
}

export class Vfx {
  constructor({ reduced = false } = {}) {
    this.reduced = reduced;
    this.items = [];
    this.texts = [];
    this.pool = [];
    this.random = rng(0xb17b0);
    this.shakeAmount = 0;
    this.shakeTime = 0;
    this.shakeTotal = 0;
    this.time = 0;
    this._offset = { x: 0, y: 0 };
  }

  /** dir: angle in radians or {x,y}; spread: emission radius in game pixels. */
  spawn(kind, x, y, { color, count, spread = 6, dir } = {}) {
    const style = STYLE[kind] ?? STYLE.spark;
    if (!STYLE[kind]) kind = 'spark';
    const requested = Math.max(0, count ?? style[0]);
    const n = requested > 0 ? Math.max(1, Math.round(requested * (this.reduced ? 0.4 : 1))) : 0;
    const directed = typeof dir === 'number' || (dir && typeof dir.x === 'number' && typeof dir.y === 'number');
    const direction = typeof dir === 'number' ? dir : directed ? Math.atan2(dir.y, dir.x) : 0;
    for (let i = 0; i < n && this.items.length < MAX_PARTICLES; i++) {
      const item = this.pool.pop() ?? {};
      const angle = directed ? direction + (this.random() - 0.5) * 1.2 : (i + this.random() * 0.7) / Math.max(1, n) * TAU;
      const speed = style[1] * (0.5 + this.random() * 0.7) * (this.reduced ? 0.6 : 1);
      const radius = Math.max(0, spread) * this.random();
      item.kind = kind;
      item.x = x + Math.cos(angle) * radius;
      item.y = y + Math.sin(angle) * radius;
      item.vx = Math.cos(angle) * speed;
      item.vy = Math.sin(angle) * speed - (kind === 'heal' || kind === 'bytes' ? 12 : 0);
      item.gravity = style[3];
      item.drag = style[4];
      item.color = color ?? style[5];
      item.total = style[2] * (0.78 + this.random() * 0.36);
      item.life = item.total;
      item.variant = i & 1;
      this.items.push(item);
    }
    if (['guard', 'perfect', 'purify', 'crit'].includes(kind) && n > 0) {
      this.spawn('ring', x, y, { count: 1, spread: 0, color: color ?? style[5] });
    }
  }

  text(str, x, y, { color = PAL.ui.text, font = 'big', rise = 16, ms = 900 } = {}) {
    const total = Math.max(1, ms) / 1000;
    this.texts.push({ str: String(str), x, y, color, font, rise: this.reduced ? rise * 0.4 : rise, life: total, total });
  }

  shake(amount, ms = 250) {
    this.shakeAmount = Math.max(this.shakeAmount, Math.max(0, amount) * (this.reduced ? 0.2 : 1));
    this.shakeTime = Math.max(this.shakeTime, Math.max(0, ms) / 1000);
    this.shakeTotal = this.shakeTime;
  }

  /** Stable for a whole frame, integer and allocation-free even when called repeatedly. */
  get offset() {
    return this._offset;
  }

  update(dt) {
    dt = Math.max(0, dt);
    this.time += dt;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.life -= dt;
      if (item.life <= 0) {
        this.pool.push(item);
        this.items[i] = this.items[this.items.length - 1];
        this.items.pop();
        continue;
      }
      const drag = Math.exp(-item.drag * dt);
      item.vx *= drag;
      item.vy = item.vy * drag + item.gravity * dt;
      item.x += item.vx * dt;
      item.y += item.vy * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      this.texts[i].life -= dt;
      if (this.texts[i].life <= 0) this.texts.splice(i, 1);
    }
    this.shakeTime = Math.max(0, this.shakeTime - dt);
    if (this.shakeTime > 0) {
      const envelope = this.shakeAmount * (this.shakeTime / this.shakeTotal) ** 2;
      this._offset.x = Math.round(Math.sin(this.time * 113) * envelope);
      this._offset.y = Math.round(Math.sin(this.time * 157 + 1.2) * envelope * 0.65);
    } else {
      this.shakeAmount = 0;
      this._offset.x = 0;
      this._offset.y = 0;
    }
  }

  draw(ctx) {
    for (const item of this.items) {
      const progress = 1 - item.life / item.total;
      const fade = Math.min(3, Math.floor(clamp((progress - 0.58) / 0.42) * 4));
      const sprite = item.kind === 'ring'
        ? ringSprite(item.color, Math.min(9, Math.floor(progress * 10)), fade)
        : particleSprite(item.kind, item.color, fade, item.kind === 'bytes' ? item.variant : 0);
      let x = Math.round(item.x);
      let y = Math.round(item.y);
      // Snap motes settle onto an 8px lattice: even the punctuation rounds to levels.
      if (item.kind === 'snap' && progress > 0.32) {
        const snap = clamp((progress - 0.32) / 0.25);
        x = Math.round(x + (Math.round(x / 8) * 8 - x) * snap);
        y = Math.round(y + (Math.round(y / 8) * 8 - y) * snap);
      }
      ctx.drawImage(sprite, x - (sprite.width >> 1), y - (sprite.height >> 1));
    }
    for (const text of this.texts) {
      const p = 1 - text.life / text.total;
      const pop = this.reduced ? 0 : Math.sin(Math.min(1, p / 0.28) * Math.PI) * 5;
      const y = Math.round(text.y - (1 - (1 - p) ** 2) * text.rise - pop);
      const color = p > 0.84 ? PAL.ui.dim : text.color;
      drawText(ctx, text.str, Math.round(text.x), y, { color, font: text.font, align: 'center', outline: PAL.ink, shadow: PAL.ink });
    }
  }

  clear() {
    while (this.items.length) this.pool.push(this.items.pop());
    this.texts.length = 0;
    this.shakeAmount = 0;
    this.shakeTime = 0;
    this.shakeTotal = 0;
    this._offset.x = 0;
    this._offset.y = 0;
  }
}

// Each gallery cell has its own loop, so every kind is visible without waiting for a page.
const showcase = VFX_KINDS.map(() => ({ fx: new Vfx(), cycle: -1, time: -1 }));
const textShow = new Vfx();
let textCycle = -1;
let textTime = -1;

export const galleries = {
  vfx(ctx, screen, t) {
    const cols = screen.w > screen.h ? 5 : 3;
    const rows = Math.ceil(VFX_KINDS.length / cols);
    const cellW = Math.floor((screen.w - 16) / cols);
    const cellH = Math.floor((screen.h - 66) / rows);
    ctx.fillStyle = PAL.night[0];
    ctx.fillRect(0, 0, screen.w, screen.h);
    drawText(ctx, 'Small pixels. Big feelings.', 8, 7, { color: PAL.ui.gold });
    for (let i = 0; i < VFX_KINDS.length; i++) {
      const x = 8 + i % cols * cellW;
      const y = 23 + Math.floor(i / cols) * cellH;
      const cx = x + (cellW >> 1);
      const cy = y + Math.floor((cellH - 10) * 0.5);
      ctx.fillStyle = PAL.night[2];
      ctx.fillRect(x + 1, y + 1, cellW - 3, cellH - 3);
      ctx.fillStyle = PAL.night[4];
      ctx.fillRect(cx - 1, cy - 1, 3, 3);
      const state = showcase[i];
      const clock = t * 0.75 + (i % 3) * 0.035;
      const cycle = Math.floor(clock);
      const duration = STYLE[VFX_KINDS[i]][2] * 0.85;
      const elapsed = (clock % 1) * duration;
      if (cycle !== state.cycle || t < state.time) {
        state.fx.clear();
        state.fx.spawn(VFX_KINDS[i], cx, cy, { spread: 2, count: VFX_KINDS[i] === 'ring' ? 1 : 7 });
        state.fx.update(Math.max(0, elapsed));
        state.cycle = cycle;
      } else state.fx.update(Math.max(0, t - state.time) * 0.75 * duration);
      state.time = t;
      ctx.save();
      // Integer rectangular clipping keeps neighbouring specimens legible.
      ctx.beginPath();
      ctx.rect(x + 1, y + 1, cellW - 3, cellH - 14);
      ctx.clip();
      state.fx.draw(ctx);
      ctx.restore();
      drawText(ctx, VFX_KINDS[i], cx, y + cellH - 11, { font: 'small', align: 'center', color: PAL.ui.dim, shadow: PAL.ink });
    }
    const cycle = Math.floor(t / 1.7);
    if (cycle !== textCycle || t < textTime) {
      textShow.clear();
      textShow.text(cycle & 1 ? 'PERFECT!' : '+16 B', screen.w / 2, screen.h - 28, { color: cycle & 1 ? PAL.gold[6] : PAL.teal[7], ms: 1300, rise: 7 });
      textShow.shake(3, 400);
      textShow.update(t % 1.7);
      textCycle = cycle;
    } else textShow.update(Math.max(0, t - textTime));
    textTime = t;
    ctx.save();
    const offset = textShow.offset;
    ctx.translate(offset.x, offset.y);
    textShow.draw(ctx);
    ctx.restore();
  },
};
