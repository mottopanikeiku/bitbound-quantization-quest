// Dialogue portraits (40×40). API fixed by the v2 contract; art owned by CreatureArt (stub below).
import { PAL } from './palette.js';

export const PORTRAIT_IDS = ['hero', 'keeper', 'kid', 'fisher', 'smith', 'librarian', 'hiker', 'botanist', 'sailor', 'scholar', 'nib', 'chime', 'brine', 'spindle', 'cinder', 'vesper', 'auric', 'oracle'];

/** Top-left at (x, y); opts: { t, mood: 'neutral'|'happy'|'worried' }. */
export function drawPortrait(ctx, id, x, y, opts = {}) {
  ctx.fillStyle = PAL.night[3];
  ctx.fillRect(Math.round(x), Math.round(y), 40, 40);
  ctx.fillStyle = PAL.skin[4];
  ctx.fillRect(Math.round(x) + 10, Math.round(y) + 8, 20, 24);
}

export const galleries = {
  portraits(ctx, screen, t) {
    PORTRAIT_IDS.forEach((id, i) => drawPortrait(ctx, id, 4 + (i % 8) * 46, 20 + Math.floor(i / 8) * 46, { t }));
  },
};
