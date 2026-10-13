import { PAL } from '../art/palette.js';
import { drawText, wrapText } from '../engine/font.js';
import { drawMenu, drawWindow, drawIcon, drawScrim, panelLift } from './kit.js';

export class PauseMenu {
  constructor(game) { this.game = game; this.open_ = false; this.selected = 0; this.confirming = false; this.handlers = {}; this.age = 0; }
  get active() { return this.open_; }
  open(handlers = {}) {
    this.handlers = handlers; this.open_ = true; this.selected = 0; this.confirming = false; this.age = 0;
    this.game.announce('Paused. Resume, Field Notes, Music, or Restart adventure.');
  }
  close() { this.open_ = false; }
  items() { return this.confirming ? ['Keep exploring', 'Erase & restart'] : ['Resume', 'Field Notes', `Music ${this.handlers.musicOn?.() ? 'on' : 'off'}`, 'Restart adventure']; }
  update(dt, input) {
    if (!this.open_) return; this.age += dt;
    const count = this.items().length;
    if (input.repeat('up')) { this.selected = (this.selected + count - 1) % count; this.game.audio.play('menu-move'); }
    if (input.repeat('down')) { this.selected = (this.selected + 1) % count; this.game.audio.play('menu-move'); }
    if (input.pressed('cancel') || input.pressed('pause')) {
      input.consume('cancel'); input.consume('pause');
      if (this.confirming) { this.confirming = false; this.selected = 3; this.game.audio.play('menu-back'); }
      else { this.close(); this.handlers.onResume?.(); } return;
    }
    if (!input.pressed('confirm')) return; input.consume('confirm'); this.game.audio.play('select');
    if (this.confirming) {
      if (this.selected === 1) { this.close(); this.handlers.onRestart?.(); }
      else { this.confirming = false; this.selected = 3; } return;
    }
    if (this.selected === 0) { this.close(); this.handlers.onResume?.(); }
    else if (this.selected === 1) this.handlers.onNotes?.();
    else if (this.selected === 2) this.handlers.onToggleMusic?.();
    else { this.confirming = true; this.selected = 0; this.game.announce('Erase all adventure progress? Keep exploring is selected.'); }
  }
  draw(ctx, screen, t) {
    if (!this.open_) return;
    const w = Math.min(206, screen.w - 28), h = this.confirming ? 142 : 149;
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
    drawText(ctx, '↑↓ Choose   Enter Select   Esc Back', x + Math.round(w / 2), y + h - 15, { font: 'small', color: PAL.ui.faint, align: 'center' });
  }
}
