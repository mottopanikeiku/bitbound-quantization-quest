// Creatures: battle sprites, overworld spirits and staticlings. API fixed by the v2
// contract; art owned by CreatureArt (stub below).
import { PAL } from './palette.js';
import { GUARDIANS } from '../content/game-data.js';

export const CREATURE_IDS = ['nib', 'chime', 'brine', 'spindle', 'cinder', 'vesper', 'auric', 'static-0', 'static-1', 'static-2', 'static-3', 'static-4', 'static-5', 'static-6'];

export function battleCreatureSize(id) {
  if (id === 'auric') return { w: 140, h: 110 };
  if (id.startsWith('static')) return { w: 48, h: 44 };
  return { w: 80, h: 80 };
}

function colorOf(id) {
  const guardian = GUARDIANS.find((g) => g.key === id);
  return guardian ? guardian.color : PAL.violet[5];
}

/** Anchor = bottom-centre (feet) at (x, y). opts: { t, corrupted, flash, hurt, squash, alpha, phase }. */
export function drawBattleCreature(ctx, id, x, y, opts = {}) {
  const { w, h } = battleCreatureSize(id);
  const bob = Math.round(Math.sin((opts.t ?? 0) * 3) * 2);
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.fillStyle = opts.flash > 0.5 ? PAL.white : opts.corrupted ? PAL.violet[4] : colorOf(id);
  ctx.fillRect(Math.round(x - w / 2), Math.round(y - h) + bob, w, h);
  ctx.globalAlpha = 1;
}

/** Overworld spirit (16–24 px), anchor feet. opts: { t, dir, moving, corrupted }. */
export function drawSpirit(ctx, guardianId, x, y, opts = {}) {
  ctx.fillStyle = opts.corrupted ? PAL.violet[5] : GUARDIANS[guardianId]?.color ?? PAL.white;
  ctx.fillRect(Math.round(x - 8), Math.round(y - 16), 16, 16);
}

/** Overworld staticling (≈16 px), anchor feet. opts: { t, dir, alert }. */
export function drawStaticling(ctx, zoneId, x, y, opts = {}) {
  ctx.fillStyle = opts.alert ? PAL.rose[5] : PAL.violet[5];
  ctx.fillRect(Math.round(x - 7), Math.round(y - 14), 14, 14);
}

export const galleries = {
  creatures(ctx, screen, t) {
    let x = 50;
    for (const id of CREATURE_IDS.slice(0, 4)) {
      drawBattleCreature(ctx, id, x, 120, { t });
      x += 90;
    }
  },
};
