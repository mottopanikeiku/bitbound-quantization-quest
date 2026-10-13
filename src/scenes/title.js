// Title scene. API fixed by the v2 contract; owned by UI (stub below).
import { PAL } from '../art/palette.js';
import { drawText } from '../engine/font.js';
import { drawMenu } from '../ui/kit.js';

export class TitleScene {
  constructor(game) {
    this.game = game;
    this.selected = 0;
  }

  enter() {
    this.selected = 0;
  }

  items() {
    return this.game.state.started ? ['Continue', 'New Game'] : ['New Game'];
  }

  update(dt, input) {
    const items = this.items();
    if (input.repeat('up') || input.repeat('down')) this.selected = (this.selected + 1) % items.length;
    if (!input.pressed('confirm')) return;
    input.consume('confirm');
    if (items[this.selected] === 'Continue') this.game.continueGame();
    else this.game.newGame();
  }

  draw(ctx, screen, t) {
    ctx.fillStyle = PAL.night[2];
    ctx.fillRect(0, 0, screen.w, screen.h);
    drawText(ctx, 'BITBOUND', Math.round(screen.w / 2), Math.round(screen.h * 0.3), { font: 'big', align: 'center', color: PAL.ui.gold, outline: PAL.ink });
    drawText(ctx, 'The Static Isle', Math.round(screen.w / 2), Math.round(screen.h * 0.3) + 22, { align: 'center', color: PAL.teal[7] });
    drawMenu(ctx, Math.round(screen.w / 2) - 30, Math.round(screen.h * 0.6), this.items(), this.selected, { t });
    drawText(ctx, 'Enter starts with music. M mutes.', Math.round(screen.w / 2), screen.h - 14, { align: 'center', color: PAL.ui.dim });
  }
}
