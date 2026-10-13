// Player and NPC sprites. API fixed by the v2 contract; art owned by CreatureArt (stub below).
import { PAL } from './palette.js';

export const CHARACTER_IDS = ['hero', 'keeper', 'kid', 'fisher', 'smith', 'librarian', 'hiker', 'botanist', 'sailor', 'scholar', 'cat', 'frog'];

/** Anchor = feet at (x, y). opts: { dir: 'down'|'up'|'left'|'right', frame: 0..3 walking or -1 idle, t }. */
export function drawCharacter(ctx, id, x, y, opts = {}) {
  const small = id === 'cat' || id === 'frog';
  const w = small ? 12 : 12;
  const h = small ? 10 : 22;
  ctx.fillStyle = id === 'hero' ? PAL.roof[5] : PAL.sky[4];
  ctx.fillRect(Math.round(x - w / 2), Math.round(y - h), w, h);
  ctx.fillStyle = PAL.skin[5];
  if (!small) ctx.fillRect(Math.round(x - 4), Math.round(y - h), 8, 6);
}

export const galleries = {
  characters(ctx, screen, t) {
    CHARACTER_IDS.forEach((id, i) => drawCharacter(ctx, id, 16 + i * 24, 60, { t, dir: 'down', frame: -1 }));
  },
};
