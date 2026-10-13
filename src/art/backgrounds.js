// EarthBound-style battle backgrounds. API fixed by the v2 contract; art owned by BattleArt (stub below).
import { PAL } from './palette.js';

export const BACKGROUND_IDS = ['meadow', 'grove', 'cove', 'heights', 'forge', 'archives', 'spire', 'static', 'final'];

/** Fills the whole canvas. opts: { intensity = 1, reduced = false }. */
export function drawBattleBackground(ctx, screen, id, t, opts = {}) {
  ctx.fillStyle = PAL.night[2];
  ctx.fillRect(0, 0, screen.w, screen.h);
  ctx.fillStyle = PAL.night[4];
  for (let y = 0; y < screen.h; y += 8) {
    const offset = opts.reduced ? 0 : Math.round(Math.sin(t * 2 + y * 0.1) * 6);
    ctx.fillRect(offset, y, screen.w, 1);
  }
}

export const galleries = {
  backgrounds(ctx, screen, t, page = 0) {
    drawBattleBackground(ctx, screen, BACKGROUND_IDS[page % BACKGROUND_IDS.length], t);
  },
};
