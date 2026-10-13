// Screen transitions. API fixed by the v2 contract; art owned by BattleArt (stub below).
import { PAL } from './palette.js';

export const TRANSITION_KINDS = ['battle-in', 'battle-out', 'fade', 'restore', 'wipe'];

/**
 * p ∈ [0, 1] is the amount of COVER for every kind: 0 = live frame untouched, 1 = fully
 * covered. Callers animate p 0→1 to cover and 1→0 to reveal. opts: { from: canvas | null
 * (snapshot of the frame being left, used by 'battle-in'), reduced }.
 */
export function drawTransition(ctx, screen, kind, p, opts = {}) {
  if (p <= 0) return;
  ctx.globalAlpha = Math.min(1, p);
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(0, 0, screen.w, screen.h);
  ctx.globalAlpha = 1;
}

export const galleries = {
  transitions(ctx, screen, t) {
    drawTransition(ctx, screen, 'fade', (t % 2) / 2, {});
  },
};
