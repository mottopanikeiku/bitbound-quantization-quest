// Ending scene. API fixed by the v2 contract; owned by UI (stub below).
import { PAL } from '../art/palette.js';
import { drawText } from '../engine/font.js';

export class EndingScene {
  constructor(game) {
    this.game = game;
    this.age = 0;
  }

  enter() {
    this.age = 0;
  }

  update(dt, input) {
    this.age += dt;
    if (this.age > 1 && input.pressed('confirm')) {
      input.consume('confirm');
      this.game.enterWorld({ afterEnding: true });
    }
  }

  draw(ctx, screen, t) {
    ctx.fillStyle = PAL.night[1];
    ctx.fillRect(0, 0, screen.w, screen.h);
    drawText(ctx, 'The Oracle fits. The island is whole.', Math.round(screen.w / 2), Math.round(screen.h / 2), { align: 'center', color: PAL.ui.gold });
  }
}
