// Pixel-only combat punctuation. Active motes cap at 640, floating labels at 32.
// v3 adds hit/finish, four-note Resonance, friend-coloured assists, gold, grade and record punctuation.
// Reduced motion keeps lifetimes and note counts, with stationary outlines and zero camera shake.
import { PAL } from './palette.js';
import { bayer, spriteCache } from './paint.js';
import { clamp, rng } from '../engine/util.js';
import { drawText } from '../engine/font.js';

export const VFX_KINDS = ['spark', 'hit', 'crit', 'snap', 'clip', 'fizzle', 'heal', 'guard', 'perfect', 'burst', 'bytes', 'purify', 'shard', 'dust', 'ring', 'impact', 'starburst', 'ko', 'resonance', 'assist', 'golden', 'stamp', 'record', 'descend'];

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
  impact: [8, 72, 0.32, 24, 3.2, PAL.cream[3]],
  starburst: [16, 92, 0.65, 12, 2.8, PAL.gold[7]],
  ko: [20, 50, 0.78, -12, 1.8, PAL.teal[7]],
  resonance: [4, 0, 0.85, 0, 0, PAL.gold[6]],
  assist: [12, 32, 0.70, -18, 2.2, PAL.teal[7]],
  golden: [14, 35, 0.92, 32, 1.4, PAL.gold[6]],
  stamp: [8, 38, 0.45, 24, 3.0, PAL.gold[6]],
  record: [18, 65, 0.85, 38, 1.8, PAL.gold[6]],
  descend: [10, 40, 0.75, -26, 0.7, PAL.violet[6]],
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
    if (kind === 'spark' || kind === 'perfect' || kind === 'crit' || kind === 'purify' || kind === 'starburst' || kind === 'golden' || kind === 'record' || kind === 'ko') {
      const r = kind === 'crit' || kind === 'starburst' ? 5 : kind === 'perfect' ? 4 : 3;
      star(p, x, y, r, PAL.ink);
      star(p, x, y, r - 1, color);
      if (kind === 'crit' || kind === 'perfect') p.line(4, 4, 10, 10, color).line(4, 10, 10, 4, color);
      p.rect(6, 6, 2, 2, light);
    } else if (kind === 'hit' || kind === 'clip' || kind === 'impact') {
      p.poly([[3, 11], [5, 5], [11, 2], [8, 8]], PAL.ink);
      p.line(4, 10, 9, 4, color).line(5, 10, 10, 3, color);
      p.line(6, 7, 10, 3, light);
      if (kind === 'clip') p.rect(3, 3, 3, 1, color).rect(3, 3, 1, 3, color);
    } else if (kind === 'snap') {
      p.rect(3, 3, 9, 9, PAL.ink).rect(4, 4, 7, 7, color).rect(5, 5, 5, 5, PAL.teal[1]);
      p.rect(6, 6, 3, 3, color).set(6, 6, light);
    } else if (kind === 'resonance') {
      p.ellipse(5, 10, 3, 2, PAL.ink).ellipse(5, 9, 2, 1, color);
      p.rect(7, 2, 2, 8, PAL.ink).rect(7, 2, 1, 7, color).rect(8, 2, 3, 2, color);
      p.set(8, 2, light);
    } else if (kind === 'assist') {
      p.circle(7, 7, 5, PAL.ink).circle(6, 6, 4, color);
      p.rect(4, 4, 3, 2, light).rect(2, 9, 4, 2, color).rect(10, 3, 3, 2, color);
    } else if (kind === 'descend') {
      p.line(3, 5, 7, 9, PAL.ink).line(7, 9, 11, 5, PAL.ink);
      p.line(4, 4, 7, 7, color).line(7, 7, 10, 4, color);
      p.line(4, 8, 7, 11, color).line(7, 11, 10, 8, color);
    } else if (kind === 'stamp') {
      p.rect(3, 5, 3, 3, color).rect(9, 5, 3, 3, color).rect(6, 9, 3, 2, light);
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

function ringSprite(color, step, fade, shape = 'ring') {
  const r = 4 + step * 3;
  const size = r * 2 + 3;
  return spriteCache(`vfx:ring:${color}:${step}:${fade}:${shape}`, size, size, (p) => {
    const c = r + 1;
    if (shape === 'stamp') {
      const arm = Math.max(3, Math.floor(r * 0.6));
      for (const xx of [1, size-2]) for (const yy of [1, size-2]) {
        const dx = xx === 1 ? 1 : -1;
        const dy = yy === 1 ? 1 : -1;
        p.line(xx, yy, xx+dx*arm, yy, color).line(xx, yy, xx, yy+dy*arm, color);
      }
      if (fade) p.each((x,y,value)=>bayer(x,y)<1-fade*0.25?value:null);
      return;
    }
    if (shape === 'starburst') {
      for (let i = 0; i < 8; i++) {
        const angle = i * TAU / 8;
        p.line(c+Math.round(Math.cos(angle)*r*.4),c+Math.round(Math.sin(angle)*r*.4),c+Math.round(Math.cos(angle)*r),c+Math.round(Math.sin(angle)*r),color);
      }
      if (fade) p.each((x,y,value)=>bayer(x,y)<1-fade*0.25?value:null);
      return;
    }
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

  /** dir: angle or vector; spread: pixels; level: 1–4 notes. record includes its NEW BEST label. */
  spawn(kind, x, y, { color, count, spread = 6, dir, level = 1, shape = 'ring' } = {}) {
    const style = STYLE[kind] ?? STYLE.spark;
    if (!STYLE[kind]) kind = 'spark';
    const requested = Math.max(0, count ?? (kind === 'resonance' ? clamp(Math.round(level), 1, 4) : style[0]));
    const n = requested > 0 ? Math.max(1, Math.round(requested * (this.reduced && kind !== 'resonance' ? 0.4 : 1))) : 0;
    const directed = typeof dir === 'number' || (dir && typeof dir.x === 'number' && typeof dir.y === 'number');
    const direction = typeof dir === 'number' ? dir : directed ? Math.atan2(dir.y, dir.x) : 0;
    for (let i = 0; i < n && this.items.length < MAX_PARTICLES; i++) {
      const item = this.pool.pop() ?? {};
      const angle = directed ? direction + (this.random() - 0.5) * 1.2 : (i + this.random() * 0.7) / Math.max(1, n) * TAU;
      const speed = style[1] * (0.5 + this.random() * 0.7) * (this.reduced ? 0.6 : 1);
      const radius = Math.max(0, spread) * this.random();
      item.kind = kind;
      item.originX = x;
      item.originY = y;
      item.angle = i / Math.max(1, n) * TAU - Math.PI / 2;
      item.level = clamp(Math.round(level), 1, 4);
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
      item.flash = i === 0;
      item.shape = shape;
      if (kind === 'golden') {
        item.x = x + (this.random() - 0.5) * Math.max(16, spread * 4);
        item.y = y - 12 - this.random() * 16;
        item.vy = 16 + this.random() * 18;
        item.vx *= 0.3;
      } else if (kind === 'descend') {
        item.vx = 0;
        item.vy = -style[1];
      } else if (kind === 'ko') {
        item.vy = -Math.abs(item.vy) - 16;
      }
      if (this.reduced) {
        item.vx = 0;
        item.vy = 0;
        item.gravity = 0;
      }
      this.items.push(item);
    }
    if ((kind === 'guard' || kind === 'perfect' || kind === 'purify' || kind === 'crit' || kind === 'impact' || kind === 'starburst' || kind === 'ko' || kind === 'assist' || kind === 'stamp') && n > 0) {
      this.spawn('ring', x, y, { count: 1, spread: 0, color: color ?? style[5], shape: kind === 'stamp' || kind === 'starburst' ? kind : 'ring' });
    }
    if (kind === 'record' && n > 0) this.text('NEW BEST', x, y - 12, { color: color ?? PAL.gold[6], rise: 3, ms: 850, font: 'small' });
  }

  text(str, x, y, { color = PAL.ui.text, font = 'big', rise = 16, ms = 900, pop = 3 } = {}) {
    const total = Math.max(1, ms) / 1000;
    if (this.texts.length >= 32) this.texts.shift();
    this.texts.push({ str: String(str), x, y, color, font, rise: this.reduced ? 0 : rise, pop: this.reduced ? 0 : pop, life: total, total });
  }

  shake(amount, ms = 250) {
    this.shakeAmount = Math.max(this.shakeAmount, Math.max(0, amount) * (this.reduced ? 0 : 1));
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
        ? ringSprite(item.color, this.reduced ? 3 : Math.min(9, Math.floor(progress * 10)), fade, item.shape)
        : particleSprite(item.kind, item.color, fade, item.kind === 'bytes' ? item.variant : 0);
      let x = Math.round(item.x);
      let y = Math.round(item.y);
      if (item.kind === 'resonance') {
        const angle = item.angle + (this.reduced ? 0 : progress * 1.8);
        const radius = 12 + item.level * 3;
        x = Math.round(item.originX + Math.cos(angle) * radius);
        y = Math.round(item.originY + Math.sin(angle) * radius * 0.65);
      }
      if (item.kind === 'impact' && item.flash && item.total - item.life < 0.055) {
        ctx.fillStyle = PAL.cream[3];
        const cx = Math.round(item.originX);
        const cy = Math.round(item.originY);
        ctx.fillRect(cx - 5, cy - 1, 11, 3);
        ctx.fillRect(cx - 1, cy - 5, 3, 11);
      }
      // Snap motes settle onto an 8px lattice: even the punctuation rounds to levels.
      if (!this.reduced && item.kind === 'snap' && progress > 0.32) {
        const snap = clamp((progress - 0.32) / 0.25);
        x = Math.round(x + (Math.round(x / 8) * 8 - x) * snap);
        y = Math.round(y + (Math.round(y / 8) * 8 - y) * snap);
      }
      ctx.drawImage(sprite, x - (sprite.width >> 1), y - (sprite.height >> 1));
    }
    for (const text of this.texts) {
      const p = 1 - text.life / text.total;
      const pop = this.reduced ? 0 : Math.sin(Math.min(1, (text.total - text.life) / 0.09) * Math.PI) * text.pop;
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

const GRADE_PIXELS = {
  S: ['01111', '11000', '11000', '01110', '00011', '00011', '11110'],
  A: ['01110', '11011', '11011', '11111', '11011', '11011', '11011'],
  B: ['11110', '11011', '11011', '11110', '11011', '11011', '11110'],
  C: ['01111', '11000', '11000', '11000', '11000', '11000', '01111'],
};
const GRADE_RAMPS = { S: PAL.gold, A: PAL.stone, B: PAL.sand, C: [PAL.night[0], PAL.night[2], PAL.stone[2], PAL.stone[3], PAL.stone[4], PAL.stone[4], PAL.stone[5]] };

/** Centre anchor; t is seconds since landing. Integer raster sizes preserve pixel edges. */
export function drawGradeStamp(ctx, x, y, letter, t = 1, { scale = 1, reduced = false } = {}) {
  letter = GRADE_PIXELS[letter] ? letter : 'C';
  const s = clamp(Math.round(scale), 1, 3);
  const sprite = spriteCache(`grade:${letter}:${s}`, 40 * s, 44 * s, (p) => {
    const ramp = GRADE_RAMPS[letter];
    p.poly([[5*s,0],[35*s,0],[40*s,5*s],[40*s,35*s],[35*s,40*s],[5*s,40*s],[0,35*s],[0,5*s]], PAL.ink);
    p.rect(4*s,3*s,32*s,34*s,ramp[2]).rect(6*s,5*s,28*s,30*s,ramp[1]);
    p.line(5*s,3*s,34*s,3*s,ramp[6]).line(3*s,5*s,3*s,34*s,ramp[5]);
    p.line(7*s,37*s,34*s,37*s,ramp[3]).line(37*s,7*s,37*s,34*s,ramp[3]);
    for (let yy = 0; yy < 7; yy++) for (let xx = 0; xx < 5; xx++) if (GRADE_PIXELS[letter][yy][xx] === '1') {
      p.rect((10+xx*4)*s,(7+yy*4)*s,4*s,4*s,ramp[3]);
      p.rect((9+xx*4)*s,(6+yy*4)*s,3*s,3*s,ramp[6]);
    }
    p.rect(9*s,40*s,8*s,4*s,ramp[2]).rect(23*s,40*s,8*s,4*s,ramp[2]);
  });
  const settle = reduced ? 0 : Math.round(-Math.sin(clamp(t / 0.24) * Math.PI) * 4 * s);
  ctx.drawImage(sprite, Math.round(x) - 20*s, Math.round(y) - 22*s + settle);
}

// Each gallery cell has its own loop, so every kind is visible without waiting for a page.
const showcase = VFX_KINDS.map(() => ({ fx: new Vfx(), cycle: -1, time: -1 }));

export const galleries = {
  // Pages: legacy punctuation, v3 punctuation, stationary reduced-motion equivalents.
  vfx(ctx, screen, t, page = 0) {
    const section = ((page % 3) + 3) % 3;
    const first = section === 0 ? 0 : 15;
    const length = section === 0 ? 15 : 9;
    const reduced = section === 2;
    const cols = section === 0 && screen.w > screen.h ? 5 : 3;
    const rows = Math.ceil(length / cols);
    const cellW = Math.floor((screen.w - 16) / cols);
    const cellH = Math.floor((screen.h - 45) / rows);
    ctx.fillStyle = PAL.night[0];
    ctx.fillRect(0, 0, screen.w, screen.h);
    drawText(ctx, reduced ? 'Same cue. Less motion.' : 'Small pixels. Big feelings.', 8, 7, { color: PAL.ui.gold });
    for (let cell = 0; cell < length; cell++) {
      const i = first + cell;
      const kind = VFX_KINDS[i];
      const x = 8 + cell % cols * cellW;
      const y = 25 + Math.floor(cell / cols) * cellH;
      const cx = x + (cellW >> 1);
      const cy = y + Math.floor((cellH - 12) * 0.5);
      ctx.fillStyle = PAL.night[2];
      ctx.fillRect(x + 1, y + 1, cellW - 3, cellH - 3);
      ctx.fillStyle = PAL.night[4];
      ctx.fillRect(cx - 1, cy - 1, 3, 3);
      const state = showcase[i];
      const clock = t * 0.75 + (cell % 3) * 0.035;
      const cycle = Math.floor(clock);
      const duration = STYLE[kind][2] * 0.85;
      const elapsed = (clock % 1) * duration;
      if (cycle !== state.cycle || t < state.time || state.fx.reduced !== reduced) {
        state.fx.clear();
        state.fx.reduced = reduced;
        state.fx.spawn(kind, cx, cy, { spread: 2, count: kind === 'ring' ? 1 : kind === 'resonance' ? 4 : 7, level: 4, color: kind === 'assist' ? PAL.rose[5] : undefined });
        state.fx.update(Math.max(0, elapsed));
        state.cycle = cycle;
      } else state.fx.update(Math.max(0, t - state.time) * 0.75 * duration);
      state.time = t;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 1, y + 1, cellW - 3, cellH - 14);
      ctx.clip();
      state.fx.draw(ctx);
      ctx.restore();
      drawText(ctx, kind, cx, y + cellH - 11, { font: 'small', align: 'center', color: PAL.ui.dim, shadow: PAL.ink });
    }
  },
  grades(ctx, screen, t, page = 0) {
    const reduced = page % 2 === 1;
    const landscape = screen.w > screen.h;
    ctx.fillStyle = PAL.night[0];
    ctx.fillRect(0, 0, screen.w, screen.h);
    drawText(ctx, reduced ? 'Mastery · reduced motion' : 'Mastery · four clear notes', 8, 7, { color: PAL.ui.gold });
    const cols = landscape ? 4 : 2;
    const cellW = Math.floor((screen.w - 16) / cols);
    const rowH = landscape ? screen.h - 40 : Math.floor((screen.h - 40) / 2);
    for (let i = 0; i < 4; i++) {
      const x = 8 + i % cols * cellW;
      const y = 25 + Math.floor(i / cols) * rowH;
      const cx = x + (cellW >> 1);
      ctx.fillStyle = PAL.night[2];
      ctx.fillRect(x + 1, y, cellW - 3, rowH - 5);
      drawGradeStamp(ctx, cx, y + 34, 'SABC'[i], t % 1.8, { reduced });
      drawText(ctx, ['GOLD', 'SILVER', 'BRONZE', 'SLATE'][i], cx, y + 63, { font: 'small', align: 'center', color: PAL.ui.dim });
      for (let n = 0; n <= i; n++) {
        const angle = n / (i + 1) * TAU - Math.PI / 2 + (reduced ? 0 : t * 0.6);
        const sprite = particleSprite('resonance', PAL.gold[6], 0);
        ctx.drawImage(sprite, Math.round(cx + Math.cos(angle)*22) - 7, Math.round(y + 105 + Math.sin(angle)*14) - 7);
      }
      drawText(ctx, `RESONANCE ${i+1}`, cx, y + rowH - 17, { font: 'small', align: 'center', color: PAL.ui.gold });
    }
  },
};
