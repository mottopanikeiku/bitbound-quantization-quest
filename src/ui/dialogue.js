// Dialogue overlay. API fixed by the v2 contract; presentation owned by UI (stub below).
import { PAL } from '../art/palette.js';
import { drawText, wrapText, FONT_METRICS } from '../engine/font.js';
import { drawWindow } from './kit.js';

export class DialogueBox {
  constructor(game) {
    this.game = game;
    this.lines = [];
    this.index = 0;
    this.chars = 0;
    this.onDone = null;
  }

  get active() {
    return this.lines.length > 0;
  }

  /** lines: string | { speaker, portrait, text }. */
  open({ lines, onDone = null }) {
    this.lines = (Array.isArray(lines) ? lines : [lines]).map((line) => (typeof line === 'string' ? { text: line } : line));
    this.index = 0;
    this.chars = 0;
    this.onDone = onDone;
  }

  close() {
    const done = this.onDone;
    this.lines = [];
    this.onDone = null;
    done?.();
  }

  update(dt, input) {
    if (!this.active) return;
    const line = this.lines[this.index];
    this.chars += dt * 60;
    if (input.pressed('confirm') || input.pressed('cancel')) {
      input.consume('confirm');
      input.consume('cancel');
      if (this.chars < line.text.length) this.chars = line.text.length;
      else if (this.index + 1 < this.lines.length) {
        this.index++;
        this.chars = 0;
      } else this.close();
    }
  }

  draw(ctx, screen) {
    if (!this.active) return;
    const line = this.lines[this.index];
    const h = 50;
    const y = screen.h - h - 4;
    drawWindow(ctx, 4, y, screen.w - 8, h, 'dialog');
    let top = y + 4;
    if (line.speaker) {
      drawText(ctx, line.speaker, 10, top, { color: PAL.ui.gold });
      top += FONT_METRICS.body.lineHeight;
    }
    for (const text of wrapText(line.text, screen.w - 24).slice(0, 4)) {
      drawText(ctx, text, 10, top, { maxChars: Math.floor(this.chars) });
      top += FONT_METRICS.body.lineHeight;
    }
  }
}
