// Lesson card overlay. API fixed by the v2 contract; presentation owned by UI (stub below).
import { PAL } from '../art/palette.js';
import { drawText, wrapText, FONT_METRICS } from '../engine/font.js';
import { drawWindow } from './kit.js';
import { LESSONS } from '../content/lessons.js';
import { drawLessonDiagram } from '../battle/gridviz.js';

export class LessonCard {
  constructor(game) {
    this.game = game;
    this.lesson = null;
    this.mode = 'learn';
    this.onDone = null;
    this.age = 0;
  }

  get active() {
    return this.lesson !== null;
  }

  /** mode: 'learn' (new technique) | 'recap' (victory recap). */
  open({ id, mode = 'learn', onDone = null }) {
    this.lesson = LESSONS[id] ?? null;
    this.mode = mode;
    this.onDone = onDone;
    this.age = 0;
    if (!this.lesson) onDone?.();
  }

  close() {
    const done = this.onDone;
    this.lesson = null;
    this.onDone = null;
    done?.();
  }

  update(dt, input) {
    if (!this.active) return;
    this.age += dt;
    if (this.age > 0.25 && (input.pressed('confirm') || input.pressed('cancel'))) {
      input.consume('confirm');
      input.consume('cancel');
      this.close();
    }
  }

  draw(ctx, screen, t) {
    if (!this.active) return;
    const w = screen.w - 24;
    const h = screen.h - 24;
    drawWindow(ctx, 12, 12, w, h, 'paper');
    drawText(ctx, this.lesson.title, 20, 18, { color: PAL.ink });
    drawLessonDiagram(ctx, { x: 20, y: 32, w: w - 16, h: Math.floor(h * 0.4) }, this.lesson.id, t);
    let y = 36 + Math.floor(h * 0.4);
    const lines = this.mode === 'recap' ? [this.lesson.recap] : this.lesson.lines;
    for (const line of lines) {
      for (const text of wrapText(line, w - 16)) {
        drawText(ctx, text, 20, y, { color: PAL.night[2] });
        y += FONT_METRICS.body.lineHeight;
      }
    }
  }
}
