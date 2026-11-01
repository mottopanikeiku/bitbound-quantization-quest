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
  /** Named entries so optional items (journal, full screen, flee) never shift what a choice does. */
  entries() {
    if (this.confirming === 'flee') return [{ key: 'keep', label: 'Stay in battle' }, { key: 'leave', label: 'Flee battle' }];
    if (this.confirming) return [{ key: 'keep', label: 'Keep exploring' }, { key: 'erase', label: 'Erase & restart' }];
    const entries = [{ key: 'resume', label: 'Resume' }, { key: 'notes', label: 'Field Notes' }];
    if (this.handlers.onJournal) entries.push({ key: 'journal', label: 'Journal' });
    entries.push({ key: 'music', label: `Music ${this.handlers.musicOn?.() ? 'on' : 'off'}` });
    if (this.handlers.fullscreenOn) entries.push({ key: 'fullscreen', label: `Full screen ${this.handlers.fullscreenOn() ? 'on' : 'off'}` });
    if (this.handlers.onFlee) entries.push({ key: 'flee', label: 'Flee battle' });
    if (this.handlers.onRestart) entries.push({ key: 'restart', label: 'Restart adventure' });
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
      if (this.confirming) { const key = this.confirming; this.confirming = false; this._select(key); this.game.audio.play('menu-back'); }
      else { this.close(); this.handlers.onResume?.(); } return;
    }
    if (!input.pressed('confirm')) return; input.consume('confirm'); this.game.audio.play('select');
    const key = this.entries()[this.selected]?.key;
    if (key === 'erase') { this.close(); this.handlers.onRestart?.(); }
    else if (key === 'keep') { const key = this.confirming; this.confirming = false; this._select(key); }
    else if (key === 'leave') { this.close(); this.handlers.onFlee?.(); }
    else if (key === 'resume') { this.close(); this.handlers.onResume?.(); }
    else if (key === 'notes') this.handlers.onNotes?.();
    else if (key === 'journal') this.handlers.onJournal?.();
    else if (key === 'flee') { this.confirming = 'flee'; this.selected = 0; this.game.announce('Leave this battle? Stay in battle is selected. No victory rewards. Leaving a Well battle ends this expedition.'); }
    else if (key === 'music') this.handlers.onToggleMusic?.();
    else if (key === 'fullscreen') this.handlers.onToggleFullscreen?.();
    else if (key === 'restart') { this.confirming = 'restart'; this.selected = 0; this.game.announce('Erase all adventure progress? Keep exploring is selected.'); }
  }
  draw(ctx, screen, t) {
    if (!this.open_) return;
    const w = Math.min(222, screen.w - 24), rowHeight = 17;
    const h = this.confirming ? 142 : 90 + rowHeight * this.entries().length;
    const lift = Math.min(panelLift(this.age, this.game.reducedMotion), Math.max(0, Math.floor((screen.h - h) / 2) - 3));
    const x = Math.round((screen.w - w) / 2), y = Math.round((screen.h - h) / 2) + lift;
    drawScrim(ctx, screen); drawWindow(ctx, x, y, w, h, this.confirming ? 'danger' : 'default');
    drawIcon(ctx, this.confirming ? 'cross' : 'map', x + 14, y + 15);
    drawText(ctx, this.confirming === 'flee' ? 'Leave this battle?' : this.confirming ? 'A new beginning?' : 'A quiet moment', x + 28, y + 13, { color: this.confirming ? PAL.ui.bad : PAL.ui.gold });
    if (this.confirming) {
      let cy = y + 36;
      const copy = this.confirming === 'flee' ? 'No victory rewards. In the Well, fleeing ends your expedition; records remain.' : 'This erases your friends, discoveries and saved adventure.';
      for (const line of wrapText(copy, w - 28)) { drawText(ctx, line, x + 14, cy, { color: PAL.ui.dim }); cy += 11; }
      drawMenu(ctx, x + 14, y + 86, this.items(), this.selected, { colWidth: w - 27, rowHeight: 19, t: this.game.reducedMotion ? 0 : t });
    } else {
      drawText(ctx, 'The isle can wait for you.', x + 14, y + 29, { font: 'small', color: PAL.ui.dim });
      drawMenu(ctx, x + 14, y + 43, this.items(), this.selected, { colWidth: w - 27, rowHeight, t: 0 });
      const key = this.entries()[this.selected]?.key;
      const descriptions = { resume: 'Back to your adventure.', notes: 'Your pocket guide to the grids.', journal: 'Map · Dex · Badges · Records · Look', music: 'Music and sound, your choice.', fullscreen: 'Give the island the whole screen.', flee: 'Leave safely; no victory rewards.', restart: 'Start over after a confirmation.' };
      const lines = wrapText(descriptions[key] ?? '', w - 28, 'small');
      lines.forEach((line, i) => drawText(ctx, line, x + 14, y + h - 37 + i * 7, { font: 'small', color: PAL.ui.dim }));
    }
    const footer = this.game.input?.lastDevice === 'touch' ? '↑↓ Choose · A Select · B / START Back' : '↑↓ Choose · Enter Select · Esc Back';
    drawText(ctx, footer, x + Math.round(w / 2), y + h - 15, { font: 'small', color: PAL.ui.faint, align: 'center' });
  }
}
