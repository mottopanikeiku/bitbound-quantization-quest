// Non-blocking banners and notices. API fixed by the v2 contract; presentation owned by UI.
import { PAL } from '../art/palette.js';
import { drawText } from '../engine/font.js';
import { drawWindow } from './kit.js';
import { measureText } from '../engine/font.js';

export class Toasts {
  constructor(game) {
    this.game = game;
    this.items = [];
  }

  /** kind: 'zone' (large banner) | 'notice' | 'reward'. */
  show(text, { kind = 'notice', ms = 2600 } = {}) {
    this.items = this.items.filter((item) => item.kind !== kind);
    this.items.push({ text, kind, life: ms / 1000, total: ms / 1000 });
  }

  clear() {
    this.items = [];
  }

  update(dt) {
    for (const item of this.items) item.life -= dt;
    this.items = this.items.filter((item) => item.life > 0);
  }

  draw(ctx, screen) {
    let y = 24;
    for (const item of this.items) {
      const w = measureText(item.text) + 12;
      const x = Math.round((screen.w - w) / 2);
      drawWindow(ctx, x, y, w, 14, item.kind === 'reward' ? 'gold' : 'default');
      drawText(ctx, item.text, x + 6, y + 2, { color: item.kind === 'zone' ? PAL.ui.gold : PAL.ui.text });
      y += 18;
    }
  }
}
