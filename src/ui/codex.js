// Field Notes (codex) overlay. API fixed by the v2 contract; presentation owned by UI (stub below).
import { PAL } from '../art/palette.js';
import { drawText, wrapText, FONT_METRICS } from '../engine/font.js';
import { drawMenu, drawWindow } from './kit.js';
import { LESSONS, GLOSSARY } from '../content/lessons.js';

export class Codex {
  constructor(game) {
    this.game = game;
    this.entries = [];
    this.selected = 0;
    this.onClose = null;
    this.open_ = false;
  }

  get active() {
    return this.open_;
  }

  /** lessons: unlocked lesson ids (in order). */
  open({ lessons = [], onClose = null } = {}) {
    this.entries = [
      ...lessons.filter((id) => LESSONS[id]).map((id) => ({ title: LESSONS[id].title, lines: LESSONS[id].lines })),
      ...GLOSSARY.map((entry) => ({ title: entry.term, lines: [entry.text] })),
    ];
    this.selected = 0;
    this.onClose = onClose;
    this.open_ = true;
  }

  close() {
    this.open_ = false;
    const done = this.onClose;
    this.onClose = null;
    done?.();
  }

  update(dt, input) {
    if (!this.open_) return;
    const count = Math.max(1, this.entries.length);
    if (input.repeat('up')) this.selected = (this.selected + count - 1) % count;
    if (input.repeat('down')) this.selected = (this.selected + 1) % count;
    if (input.pressed('cancel') || input.pressed('notes') || input.pressed('pause')) {
      input.consume('cancel');
      input.consume('notes');
      input.consume('pause');
      this.close();
    }
  }

  draw(ctx, screen, t) {
    if (!this.open_) return;
    drawWindow(ctx, 8, 8, screen.w - 16, screen.h - 16, 'default');
    drawText(ctx, 'Field Notes', 16, 13, { color: PAL.ui.gold });
    drawMenu(ctx, 16, 28, this.entries.map((entry) => entry.title), this.selected, { t });
    const entry = this.entries[this.selected];
    if (!entry) return;
    let y = 28;
    for (const line of entry.lines) {
      for (const text of wrapText(line, screen.w / 2 - 16)) {
        drawText(ctx, text, Math.round(screen.w / 2), y);
        y += FONT_METRICS.body.lineHeight;
      }
    }
  }
}
