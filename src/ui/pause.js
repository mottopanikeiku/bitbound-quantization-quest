// Pause menu overlay. API fixed by the v2 contract; presentation owned by UI (stub below).
import { PAL } from '../art/palette.js';
import { drawText } from '../engine/font.js';
import { drawMenu, drawWindow } from './kit.js';

export class PauseMenu {
  constructor(game) {
    this.game = game;
    this.open_ = false;
    this.selected = 0;
    this.confirming = false;
    this.handlers = {};
  }

  get active() {
    return this.open_;
  }

  /** handlers: { musicOn, onResume, onNotes, onToggleMusic, onRestart } */
  open(handlers) {
    this.handlers = handlers;
    this.open_ = true;
    this.selected = 0;
    this.confirming = false;
  }

  close() {
    this.open_ = false;
  }

  items() {
    if (this.confirming) return ['Keep playing', 'Restart from the beginning'];
    return ['Resume', 'Field Notes', `Music: ${this.handlers.musicOn?.() ? 'On' : 'Off'}`, 'Restart adventure'];
  }

  update(dt, input) {
    if (!this.open_) return;
    const count = this.items().length;
    if (input.repeat('up')) this.selected = (this.selected + count - 1) % count;
    if (input.repeat('down')) this.selected = (this.selected + 1) % count;
    if (input.pressed('cancel') || input.pressed('pause')) {
      input.consume('cancel');
      input.consume('pause');
      if (this.confirming) {
        this.confirming = false;
        this.selected = 3;
      } else {
        this.close();
        this.handlers.onResume?.();
      }
      return;
    }
    if (!input.pressed('confirm')) return;
    input.consume('confirm');
    if (this.confirming) {
      if (this.selected === 1) {
        this.close();
        this.handlers.onRestart?.();
      } else {
        this.confirming = false;
        this.selected = 3;
      }
      return;
    }
    if (this.selected === 0) {
      this.close();
      this.handlers.onResume?.();
    } else if (this.selected === 1) this.handlers.onNotes?.();
    else if (this.selected === 2) this.handlers.onToggleMusic?.();
    else {
      this.confirming = true;
      this.selected = 0;
    }
  }

  draw(ctx, screen, t) {
    if (!this.open_) return;
    const w = 150;
    const h = 64;
    const x = Math.round((screen.w - w) / 2);
    const y = Math.round((screen.h - h) / 2);
    drawWindow(ctx, x, y, w, h, 'default');
    drawText(ctx, this.confirming ? 'Restart? Progress is erased.' : 'Paused', x + 8, y + 5, { color: PAL.ui.gold });
    drawMenu(ctx, x + 8, y + 18, this.items(), this.selected, { t });
  }
}
