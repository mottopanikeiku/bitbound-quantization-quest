import { PAL } from '../art/palette.js';
import { drawText, measureText, wrapText } from '../engine/font.js';
import { drawWindow, drawIcon, panelLift } from './kit.js';

export class Toasts {
  constructor(game) { this.game = game; this.items = []; }
  get active() { return this.items.length > 0; }
  open({ text, kind = 'notice', ms = 2600 }) { this.show(text, { kind, ms }); }
  close() { this.clear(); }
  show(text, { kind = 'notice', ms = 2600 } = {}) {
    const seconds = Math.max(0.5, ms / 1000);
    this.items.push({ text: String(text), kind, life: seconds, total: seconds, age: 0 });
    if (this.items.length === 1 && kind === 'badge') this.game.announce?.(String(text));
  }
  clear() { this.items = []; }
  blocked() { return this.game.pauseMenu?.active || this.game.codex?.active || this.game.journal?.active || this.game.dialogue?.active || this.game.lessonCard?.active || this.game.transition; }
  update(dt) {
    // Banners wait their turn: drawing after a modal must never obscure its content.
    if (this.blocked()) return;
    const item = this.items[0];
    if (!item) return;
    item.life -= dt; item.age += dt;
    if (item.life <= 0) {
      this.items.shift();
      if (this.items[0]?.kind === 'badge') this.game.announce?.(this.items[0].text);
    }
  }
  draw(ctx, screen) {
    if (this.blocked()) return;
    let y = 49;
    // One reward moment at a time. Pending badges never age behind the visible card.
    const item = this.items[0];
    if (item) {
      const zone = item.kind === 'zone', reward = item.kind === 'reward', badge = item.kind === 'badge';
      const width = Math.min(screen.w - 30, Math.max(zone ? 166 : 90, measureText(item.text) + (zone ? 34 : 36)));
      const rows = wrapText(item.text, width - 30), h = rows.length * 11 + (zone ? 27 : 16);
      const x = Math.round((screen.w - width) / 2), lift = panelLift(item.age, this.game.reducedMotion);
      const exit = this.game.reducedMotion ? 0 : Math.round(Math.max(0, 0.22 - item.life) * 24);
      const top = y - lift - exit;
      drawWindow(ctx, x, top, width, h, reward || zone || badge ? 'gold' : 'glass');
      if (zone) drawText(ctx, 'NOW ENTERING', Math.round(screen.w / 2), top + 7, { font: 'small', align: 'center', color: PAL.ui.dim });
      else drawIcon(ctx, badge ? 'badge' : reward ? 'shard' : 'star', x + 8, top + 9);
      rows.forEach((line, index) => drawText(ctx, line, zone ? Math.round(screen.w / 2) : x + 22, top + (zone ? 18 : 8) + index * 11, { align: zone ? 'center' : 'left', color: zone || reward || badge ? PAL.ui.gold : PAL.ui.text }));
    }
  }
}
