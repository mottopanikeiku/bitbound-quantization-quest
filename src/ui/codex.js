import { PAL } from '../art/palette.js';
import { drawText, wrapText } from '../engine/font.js';
import { drawWindow, drawIcon, drawScrim, drawCursor, fitText } from './kit.js';
import { LESSONS, GLOSSARY, REAL_WORLD } from '../content/lessons.js';
import { drawLessonDiagram } from '../battle/gridviz.js';

const SECTIONS = ['Techniques', 'Glossary', 'Model sizes'];
export class Codex {
  constructor(game) {
    this.game = game; this.entries = []; this.selected = 0; this.onClose = null; this.open_ = false;
    this.section = 0; this.reading = false; this.scroll = 0; this.maxScroll = 0;
  }
  get active() { return this.open_; }
  open({ lessons = [], onClose = null } = {}) {
    this.groups = [
      [...new Set(lessons)].filter(id => LESSONS[id]).map(id => ({ title: LESSONS[id].title, lesson: LESSONS[id], lines: [...LESSONS[id].lines, LESSONS[id].formula, `In real models: ${LESSONS[id].real}`] })),
      GLOSSARY.map(entry => ({ title: entry.term, lines: [entry.text] })),
      [
        ...REAL_WORLD.sizes.map(entry => ({ title: entry.label, lines: [entry.text] })),
        { title: 'The Oracle budget', lines: REAL_WORLD.oracle.lines },
        { title: 'KV cache memory', lines: [REAL_WORLD.oracle.kvCache.formula, ...REAL_WORLD.oracle.kvCache.assumptions, REAL_WORLD.oracle.kvCache.example.text] },
        { title: 'Our toy rules', lines: REAL_WORLD.toyRules },
      ],
    ];
    this.section = this.groups[0].length ? 0 : 1; this.entries = this.groups[this.section]; this.selected = 0;
    this.onClose = onClose; this.open_ = true; this.reading = false; this.scroll = 0;
    this.game.announce('Field Notes. Left and right change section; up and down choose an entry. Enter reads; Escape closes.');
  }
  close() { this.open_ = false; const done = this.onClose; this.onClose = null; done?.(); }
  update(dt, input) {
    if (!this.open_) return;
    if (input.pressed('cancel') || input.pressed('notes') || input.pressed('pause')) {
      input.consume('cancel'); input.consume('notes'); input.consume('pause');
      if (this.reading) { this.reading = false; this.game.audio.play('menu-back'); }
      else this.close(); return;
    }
    if (this.reading) {
      if (input.repeat('up')) this.scroll = Math.max(0, this.scroll - 1);
      if (input.repeat('down')) this.scroll = Math.min(this.maxScroll, this.scroll + 1);
      if (input.pressed('left') || input.pressed('confirm')) { input.consume('confirm'); this.reading = false; this.game.audio.play('menu-back'); }
      return;
    }
    let moved = false;
    if (input.repeat('left') || input.repeat('right')) {
      this.section = (this.section + (input.repeat('left') ? 2 : 1)) % 3;
      this.entries = this.groups[this.section]; this.selected = 0; this.scroll = 0; moved = true;
    }
    const count = this.entries.length;
    if (count && (input.repeat('up') || input.repeat('down'))) {
      this.selected = (this.selected + (input.repeat('up') ? count - 1 : 1)) % count; this.scroll = 0; moved = true;
    }
    if (moved) { this.game.audio.play('menu-move'); this.game.announce(`${SECTIONS[this.section]}. ${this.entries[this.selected]?.title ?? 'No discoveries yet'}.`); }
    if (input.pressed('confirm') && count) { input.consume('confirm'); this.reading = true; this.game.audio.play('select'); this.game.announce(this.entries[this.selected].lines.join(' ')); }
  }
  draw(ctx, screen, t) {
    if (!this.open_) return;
    const { w, h, portrait } = screen;
    drawScrim(ctx, screen); drawWindow(ctx, 6, 6, w - 12, h - 12, 'default');
    drawIcon(ctx, 'scan', 18, 17); drawText(ctx, 'Field Notes', 32, 15, { color: PAL.ui.gold });
    drawText(ctx, 'A CARTOGRAPHER\'S COMPANION', 18, 29, { font: 'small', color: PAL.ui.faint });
    drawWindow(ctx, 13, 42, w - 26, 20, 'glass');
    drawText(ctx, `←  ${SECTIONS[this.section]}  →`, Math.round(w / 2), 48, { align: 'center', color: PAL.ui.gold });
    const listX = 16, listY = 73, listW = portrait ? w - 32 : 106;
    const visible = portrait ? 3 : Math.max(3, Math.floor((h - 103) / 15));
    const start = Math.min(Math.max(0, this.selected - Math.floor(visible / 2)), Math.max(0, this.entries.length - visible));
    for (let i = start; i < Math.min(this.entries.length, start + visible); i++) {
      const y = listY + (i - start) * 15;
      if (i === this.selected) {
        ctx.fillStyle = this.reading ? PAL.night[3] : PAL.night[4]; ctx.fillRect(listX - 2, y - 2, listW, 13);
        if (!this.reading) drawCursor(ctx, listX, y, this.game.reducedMotion ? 0 : t);
      }
      drawText(ctx, fitText(this.entries[i].title, listW - 15), listX + 12, y, { color: i === this.selected ? PAL.ui.gold : PAL.ui.dim });
    }
    if (this.entries.length > visible) drawText(ctx, `${this.selected + 1}/${this.entries.length}`, listX + listW - 4, listY + visible * 15 + 1, { font: 'small', align: 'right', color: PAL.ui.faint });
    const entry = this.entries[this.selected];
    const rx = portrait ? 16 : 135, ry = portrait ? 134 : 73, rw = w - rx - 17;
    if (!portrait) { ctx.fillStyle = PAL.night[5]; ctx.fillRect(126, 72, 1, h - 100); }
    else { ctx.fillStyle = PAL.night[5]; ctx.fillRect(16, 126, w - 32, 1); }
    if (entry) {
      drawText(ctx, fitText(entry.title, rw - 9), rx, ry, { color: PAL.ui.text });
      if (this.reading) drawIcon(ctx, 'arrow-down', rx + rw - 8, ry);
      let y = ry + 17;
      if (entry.lesson) {
        drawLessonDiagram(ctx, { x: rx, y, w: rw, h: portrait ? 68 : 50 }, entry.lesson.id, t, { reduced: this.game.reducedMotion });
        y += portrait ? 77 : 59;
      }
      const rows = entry.lines.flatMap((line, index) => [...(index ? [''] : []), ...wrapText(line, rw - 6)]);
      const capacity = Math.max(1, Math.floor((h - 29 - y) / 11));
      this.maxScroll = Math.max(0, rows.length - capacity); this.scroll = Math.min(this.scroll, this.maxScroll);
      for (let i = this.scroll; i < Math.min(rows.length, this.scroll + capacity); i++) drawText(ctx, rows[i], rx, y + (i - this.scroll) * 11, { color: PAL.ui.dim });
      if (this.maxScroll) {
        ctx.fillStyle = PAL.night[4]; ctx.fillRect(rx + rw, y, 2, capacity * 11);
        ctx.fillStyle = PAL.ui.gold; ctx.fillRect(rx + rw, y + Math.round((capacity * 11 - 8) * this.scroll / this.maxScroll), 2, 8);
      }
    } else {
      drawText(ctx, 'Unwritten pages', rx, ry, { color: PAL.ui.gold });
      let y = ry + 20;
      for (const line of wrapText('Find a Grid Stone to discover a technique. Your notes will keep it here.', rw)) { drawText(ctx, line, rx, y, { color: PAL.ui.dim }); y += 11; }
      this.maxScroll = 0;
    }
    drawText(ctx, this.reading ? '↑↓ Scroll   Enter / B Back to index' : '↑↓ Entry   ←→ Section   A / Enter Read', Math.round(w / 2), h - 18, { font: 'small', align: 'center', color: PAL.ui.gold });
  }
}
