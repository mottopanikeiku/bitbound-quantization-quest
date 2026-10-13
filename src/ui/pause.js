import { PAL } from '../art/palette.js';
import { drawText, wrapText } from '../engine/font.js';
import { drawMenu, drawWindow, drawIcon, drawScrim, panelLift } from './kit.js';

export class PauseMenu {
  constructor(game) { this.game = game; this.open_ = false; this.selected = 0; this.confirming = false; this.handlers = {}; this.age = 0; }
  get active() { return this.open_; }
  open(handlers = {}) {
    this.handlers = handlers; this.open_ = true; this.selected = 0; this.confirming = false; this.age = 0;
    this.game.announce(`Paused. ${this.entries().map(entry => entry.key === 'music' || entry.key === 'fullscreen' ? entry.label.replace(/ (on|off)$/, '') : entry.label).join(', ')}.`);
  }
  close() { this.open_ = false; }
  /** Named entries so optional items (full screen) never shift what a choice does. */
  entries() {
    if (this.confirming) return [{ key: 'keep', label: 'Keep exploring' }, { key: 'erase', label: 'Erase & restart' }];
    const entries = [{ key: 'resume', label: 'Resume' }, { key: 'notes', label: 'Field Notes' }, { key: 'music', label: `Music ${this.handlers.musicOn?.() ? 'on' : 'off'}` }];
    if (this.handlers.fullscreenOn) entries.push({ key: 'fullscreen', label: `Full screen ${this.handlers.fullscreenOn() ? 'on' : 'off'}` });
    entries.push({ key: 'restart', label: 'Restart adventure' });
    return entries;
  }
  items() { return this.entries().map(entry => entry.label); }
  _select(key) { this.selected = Math.max(0, this.entries().findIndex(entry => entry.key === key)); }
  update(dt, input) {
    if (!this.open_) return; this.age += dt;
    const count = this.entries().length;
    if (input.repeat('up')) { this.selected = (this.selected + count - 1) % count; this.game.audio.play('menu-move'); }
    if (input.repeat('down')) { this.selected = (this.selected + 1) % count; this.game.audio.play('menu-move'); }
    if (input.pressed('cancel') || input.pressed('pause')) {
      input.consume('cancel'); input.consume('pause');
      if (this.confirming) { this.confirming = false; this._select('restart'); this.game.audio.play('menu-back'); }
      else { this.close(); this.handlers.onResume?.(); } return;
    }
    if (!input.pressed('confirm')) return; input.consume('confirm'); this.game.audio.play('select');
    const key = this.entries()[this.selected]?.key;
    if (key === 'erase') { this.close(); this.handlers.onRestart?.(); }
    else if (key === 'keep') { this.confirming = false; this._select('restart'); }
    else if (key === 'resume') { this.close(); this.handlers.onResume?.(); }
    else if (key === 'notes') this.handlers.onNotes?.();
    else if (key === 'music') this.handlers.onToggleMusic?.();
    else if (key === 'fullscreen') this.handlers.onToggleFullscreen?.();
    else if (key === 'restart') { this.confirming = true; this.selected = 0; this.game.announce('Erase all adventure progress? Keep exploring is selected.'); }
  }
  draw(ctx, screen, t) {
    if (!this.open_) return;
    const w = Math.min(206, screen.w - 28), h = this.confirming ? 142 : 73 + 19 * this.entries().length;
    const x = Math.round((screen.w - w) / 2), y = Math.round((screen.h - h) / 2) + panelLift(this.age, this.game.reducedMotion);
    drawScrim(ctx, screen); drawWindow(ctx, x, y, w, h, this.confirming ? 'danger' : 'default');
    drawIcon(ctx, this.confirming ? 'cross' : 'star', x + 14, y + 15);
    drawText(ctx, this.confirming ? 'A new beginning?' : 'A quiet moment', x + 28, y + 13, { color: this.confirming ? PAL.ui.bad : PAL.ui.gold });
    if (this.confirming) {
      let cy = y + 36;
      for (const line of wrapText('This erases your friends, discoveries and saved adventure.', w - 28)) { drawText(ctx, line, x + 14, cy, { color: PAL.ui.dim }); cy += 11; }
      drawMenu(ctx, x + 14, y + 86, this.items(), this.selected, { colWidth: w - 27, rowHeight: 19, t: this.game.reducedMotion ? 0 : t });
    } else {
      drawText(ctx, 'The isle can wait for you.', x + 14, y + 29, { font: 'small', color: PAL.ui.dim });
      drawMenu(ctx, x + 14, y + 48, this.items(), this.selected, { colWidth: w - 27, rowHeight: 19, t: this.game.reducedMotion ? 0 : t });
    }
    const footer = this.game.input?.lastDevice === 'touch' ? '↑↓ Choose   A Select   B Back' : '↑↓ Choose   Enter Select   Esc Back';
    drawText(ctx, footer, x + Math.round(w / 2), y + h - 15, { font: 'small', color: PAL.ui.faint, align: 'center' });
  }
}
