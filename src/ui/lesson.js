import { PAL } from '../art/palette.js';
import { drawText, wrapText } from '../engine/font.js';
import { drawWindow, drawIcon, drawScrim, drawPageDots, panelLift } from './kit.js';
import { LESSONS } from '../content/lessons.js';
import { drawLessonDiagram } from '../battle/gridviz.js';

export class LessonCard {
  constructor(game) { this.game = game; this.lesson = null; this.mode = 'learn'; this.onDone = null; this.age = 0; this.page = 0; this.layoutKey = ''; }
  get active() { return this.lesson !== null; }
  open({ id, mode = 'learn', onDone = null }) {
    this.lesson = LESSONS[id] ?? null; this.mode = mode; this.onDone = onDone; this.age = 0; this.page = 0; this.layoutKey = '';
    if (!this.lesson) { this.onDone = null; onDone?.(); }
    else this.game.announce(`${mode === 'recap' ? 'A lesson in friendship.' : 'Technique discovered.'} ${this.lesson.title}. ${mode === 'recap' ? this.lesson.recap : this.lesson.lines.join(' ')}`);
  }
  close() { const done = this.onDone; this.lesson = null; this.onDone = null; done?.(); }
  layout(screen) {
    const key = `${screen.w}:${screen.h}`;
    if (key === this.layoutKey) return this.geom;
    // Edge to edge on the smallest canvases; larger ones get a centred card so the diagram and text stay together.
    const w = Math.min(screen.w - (screen.portrait ? 14 : 26), screen.portrait ? 400 : 480);
    const h = Math.min(screen.h - (screen.portrait ? 26 : 18), screen.portrait ? 440 : 300);
    const x = Math.floor((screen.w - w) / 2), y = Math.floor((screen.h - h) / 2);
    const split = !screen.portrait, diagramW = split ? 147 : w - 22, diagramH = split ? 103 : 92;
    const tx = split ? x + 171 : x + 12, ty = split ? y + 43 : y + 158;
    const tw = split ? w - 184 : w - 24, capacity = Math.max(5, Math.floor((y + h - 30 - ty) / 11));
    const sections = this.mode === 'recap'
      ? [{ text: this.lesson.recap, color: PAL.ui.text }, { text: this.lesson.formula, color: PAL.teal[7] }, { text: 'IN REAL MODELS', small: true, color: PAL.ui.gold }, { text: this.lesson.real, color: PAL.ui.dim }]
      : [...this.lesson.lines.map(text => ({ text, color: PAL.ui.text })), { text: this.lesson.formula, color: PAL.teal[7] }, { text: 'IN REAL MODELS', small: true, color: PAL.ui.gold }, { text: this.lesson.real, color: PAL.ui.dim }];
    const blank = { text: '', color: PAL.ui.text };
    const blocks = sections.map(section => wrapText(section.text, tw, section.small ? 'small' : 'body').map(text => ({ ...section, text })));
    const pages = []; let rows = [];
    blocks.forEach((wrapped, i) => {
      const heading = sections[i].small && blocks[i + 1];
      const afterHeading = i > 0 && sections[i - 1].small;
      // A heading travels with the text it introduces; other sections move whole when a fresh page can hold them.
      const need = heading ? Math.min(capacity, wrapped.length + 1 + blocks[i + 1].length) : wrapped.length;
      if (rows.length && !afterHeading && rows.length + 1 + need > capacity) { pages.push(rows); rows = []; }
      if (rows.length) rows.push(blank);
      for (const row of wrapped) {
        if (rows.length >= capacity) { pages.push(rows); rows = []; }
        rows.push(row);
      }
    });
    if (rows.length) pages.push(rows);
    this.pages = pages; this.page = Math.min(this.page, pages.length - 1); this.layoutKey = key;
    this.geom = { x, y, w, h, diagramW, diagramH, tx, ty, tw, split }; return this.geom;
  }
  update(dt, input) {
    if (!this.active) return;
    this.age += dt; this.layout(this.game.screen);
    if (this.age < 0.2) return;
    if (input.pressed('cancel')) { input.consume('cancel'); input.consume('pause'); this.game.audio.play('menu-back'); this.close(); return; }
    if (input.repeat('left') && this.page > 0) { this.page--; this.game.audio.play('menu-move'); }
    if (input.pressed('confirm') || input.repeat('right')) {
      const confirm = input.pressed('confirm'); input.consume('confirm'); input.consume('right');
      if (this.page + 1 < this.pages.length) { this.page++; this.game.audio.play('menu-move'); }
      else if (confirm) { this.game.audio.play('select'); this.close(); }
    }
  }
  draw(ctx, screen, t) {
    if (!this.active) return;
    const g = this.layout(screen), lift = panelLift(this.age, this.game.reducedMotion), y = g.y + lift;
    drawScrim(ctx, screen); drawWindow(ctx, g.x, y, g.w, g.h, 'gold');
    drawIcon(ctx, this.lesson.icon, g.x + 13, y + 13);
    drawText(ctx, this.mode === 'recap' ? 'A LESSON IN FRIENDSHIP' : 'TECHNIQUE DISCOVERED', g.x + 28, y + 9, { font: 'small', color: PAL.ui.gold });
    drawText(ctx, this.lesson.title, g.x + 28, y + 20);
    const dx = g.x + 11, dy = y + 41;
    drawWindow(ctx, dx - 2, dy - 2, g.diagramW + 4, g.diagramH + 4, 'glass');
    drawLessonDiagram(ctx, { x: dx + 2, y: dy + 2, w: g.diagramW - 4, h: g.diagramH - 4 }, this.lesson.id, t, { reduced: this.game.reducedMotion });
    let cy = dy + g.diagramH + 8;
    for (const line of wrapText(this.lesson.diagramCaption, g.diagramW, 'small')) { drawText(ctx, line, dx, cy, { font: 'small', color: PAL.ui.dim }); cy += 7; }
    let ty = g.ty + lift;
    for (const row of this.pages[this.page]) { drawText(ctx, row.text, g.tx, ty, { font: row.small ? 'small' : 'body', color: row.color }); ty += 11; }
    drawPageDots(ctx, screen.w / 2, y + g.h - 22, this.pages.length, this.page);
    const touch = this.game.input.lastDevice === 'touch';
    drawText(ctx, this.page + 1 === this.pages.length ? (touch ? 'A  Return to the isle' : 'Enter  Return to the isle') : (touch ? 'A  Next page' : 'Enter  Next page'), g.x + 12, y + g.h - 13, { font: 'small', color: PAL.ui.gold });
    drawText(ctx, touch ? 'B  Close' : 'Esc  Close', g.x + g.w - 12, y + g.h - 13, { font: 'small', color: PAL.ui.dim, align: 'right' });
  }
}
