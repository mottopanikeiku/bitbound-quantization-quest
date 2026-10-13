// Intro scene. API fixed by the v2 contract; owned by UI (stub below).
import { PAL } from '../art/palette.js';
import { drawText, wrapText, FONT_METRICS } from '../engine/font.js';

const PANELS = [
  'Once, the Static Isle shimmered in full colour.',
  'Then the Static came, squeezing everything into a handful of bits.',
  'Take the Gridstaff. Snap things back into shape, gently.',
];

export class IntroScene {
  constructor(game) {
    this.game = game;
    this.index = 0;
  }

  enter() {
    this.index = 0;
  }

  update(dt, input) {
    if (input.pressed('cancel')) {
      input.consume('cancel');
      this.game.enterWorld();
      return;
    }
    if (!input.pressed('confirm')) return;
    input.consume('confirm');
    this.index++;
    if (this.index >= PANELS.length) this.game.enterWorld();
  }

  draw(ctx, screen, t) {
    ctx.fillStyle = PAL.night[1];
    ctx.fillRect(0, 0, screen.w, screen.h);
    let y = Math.round(screen.h / 2) - 10;
    for (const line of wrapText(PANELS[Math.min(this.index, PANELS.length - 1)], screen.w - 40)) {
      drawText(ctx, line, Math.round(screen.w / 2), y, { align: 'center' });
      y += FONT_METRICS.body.lineHeight;
    }
  }
}
