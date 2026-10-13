import { PAL } from '../art/palette.js';
import { drawText, wrapText, textLength, measureText, FONT_METRICS } from '../engine/font.js';
import { drawWindow, panelLift } from './kit.js';
import { drawPortrait } from '../art/portraits.js';

export class DialogueBox {
  constructor(game) {
    this.game = game; this.lines = []; this.index = 0; this.page = 0;
    this.chars = 0; this.age = 0; this.blip = 0; this.onDone = null; this.layoutKey = '';
  }
  get active() { return this.lines.length > 0; }
  open({ lines, onDone = null }) {
    this.lines = (Array.isArray(lines) ? lines : [lines]).filter(Boolean).map(line => typeof line === 'string' ? { text: line } : line);
    this.index = 0; this.page = 0; this.chars = 0; this.age = 0; this.blip = 0; this.onDone = onDone; this.layoutKey = '';
    if (!this.active) this.close();
  }
  close() {
    const done = this.onDone; this.lines = []; this.onDone = null; done?.();
  }
  layout(screen) {
    const line = this.lines[this.index];
    const key = `${screen.w}:${screen.h}:${this.index}`;
    if (key !== this.layoutKey) {
      const portrait = Boolean(line.portrait), stacked = screen.portrait && portrait;
      const width = screen.w - 36 - (portrait && !stacked ? 52 : 0), count = screen.portrait ? 4 : 3;
      const rows = wrapText(line.text, width);
      this.pages = [];
      for (let i = 0; i < rows.length; i += count) this.pages.push(rows.slice(i, i + count));
      this.page = Math.min(this.page, this.pages.length - 1); this.layoutKey = key;
    }
    return this.pages[this.page];
  }
  update(dt, input) {
    if (!this.active) return;
    const rows = this.layout(this.game.screen), length = rows.reduce((n, row) => n + textLength(row), 0);
    this.age += dt; this.blip -= dt;
    const before = Math.floor(this.chars);
    this.chars = Math.min(length, this.chars + dt * 38);
    if (Math.floor(this.chars) > before && this.blip <= 0 && before < length) {
      const text = rows.join('').replace(/\*/g, '');
      if (/[^\s.,!?]/.test(text[Math.min(text.length - 1, before)] ?? ' ')) this.game.audio.play('select');
      this.blip = 0.09;
    }
    if (!input.pressed('confirm') && !input.pressed('cancel')) return;
    input.consume('confirm'); input.consume('cancel'); input.consume('pause');
    if (this.chars < length) { this.chars = length; return; }
    this.game.audio.play('menu-move');
    if (this.page + 1 < this.pages.length) this.page++;
    else if (this.index + 1 < this.lines.length) { this.index++; this.page = 0; this.layoutKey = ''; }
    else { this.close(); return; }
    this.chars = 0; this.blip = 0.06;
    this.game.announce(this.layout(this.game.screen).join(' '));
  }
  draw(ctx, screen, t = 0) {
    if (!this.active) return;
    const line = this.lines[this.index], rows = this.layout(screen), portrait = Boolean(line.portrait), stacked = portrait && screen.portrait;
    const h = stacked ? 126 : screen.portrait ? 80 : 73, x = 6, w = screen.w - 12;
    const y = screen.h - h - 6 + panelLift(this.age, this.game.reducedMotion);
    drawWindow(ctx, x, y, w, h, 'dialog');
    if (portrait) drawPortrait(ctx, line.portrait, x + 10, y + (stacked ? 10 : 17), { t: this.game.reducedMotion ? 0 : t, mood: line.mood ?? 'neutral' });
    const speaker = line.speaker ?? (portrait ? line.portrait.charAt(0).toUpperCase() + line.portrait.slice(1) : '');
    if (speaker) {
      const sx = stacked ? x + 59 : x + 12, sy = stacked ? y + 17 : y - 7;
      drawWindow(ctx, sx, sy, Math.max(48, measureText(speaker) + 20), 19, 'gold');
      drawText(ctx, speaker, sx + 10, sy + 5, { color: PAL.ui.gold });
      if (stacked) drawText(ctx, 'THE STATIC ISLE', sx + 1, sy + 26, { font: 'small', color: PAL.ui.faint });
    }
    let cy = y + (stacked ? 59 : 20), chars = Math.floor(this.chars);
    const tx = x + 12 + (portrait && !stacked ? 52 : 0);
    for (const row of rows) { drawText(ctx, row, tx, cy, { maxChars: Math.max(0, chars) }); chars -= textLength(row); cy += FONT_METRICS.body.lineHeight; }
    const complete = this.chars >= rows.reduce((n, row) => n + textLength(row), 0);
    if (complete) drawText(ctx, '▼', x + w - 17, y + h - 15 + (this.game.reducedMotion ? 0 : Math.round(Math.sin(t * 5))), { color: PAL.ui.gold });
    if (this.pages.length > 1) drawText(ctx, `${this.page + 1}/${this.pages.length}`, tx, y + h - 13, { font: 'small', color: PAL.ui.faint });
  }
}
