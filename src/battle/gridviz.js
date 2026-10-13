// The quantization grid visual shared by battles, Snap Bridge puzzles and lesson cards.
// API fixed by the v2 contract; owned by Battle (stub below).
import { PAL } from '../art/palette.js';

/**
 * rect = { x, y, w, h }.
 * model = { rows: [{ values, recon?, levels, lo, hi, clipped?, protected?, label? }],
 *           view: { min, max }, snap: 0..1, bracket?: { lo, hi }, activeRow?, showError?,
 *           showCodes?, hidden?, ghosts?: number[] }
 */
export function drawGridPanel(ctx, rect, model, t, opts = {}) {
  ctx.fillStyle = PAL.night[1];
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  const { min, max } = model.view;
  const yOf = (v) => Math.round(rect.y + rect.h - 2 - ((v - min) / (max - min || 1)) * (rect.h - 4));
  const rows = model.rows ?? [];
  rows.forEach((row, r) => {
    const x0 = rect.x + 4 + (r * (rect.w - 8)) / rows.length;
    const width = (rect.w - 8) / rows.length;
    ctx.fillStyle = PAL.night[4];
    for (const level of row.levels ?? []) ctx.fillRect(Math.round(x0), yOf(level), Math.round(width) - 2, 1);
    row.values.forEach((value, i) => {
      const target = row.recon ? row.recon[i] : value;
      const v = value + (target - value) * (model.snap ?? 0);
      ctx.fillStyle = PAL.ui.gold;
      ctx.fillRect(Math.round(x0 + ((i + 0.5) * width) / row.values.length) - 1, yOf(v) - 1, 3, 3);
    });
  });
}

/** Self-animating looped demo for a lesson id. */
export function drawLessonDiagram(ctx, rect, lessonId, t) {
  ctx.fillStyle = PAL.night[2];
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
}

export const galleries = {
  grid(ctx, screen, t) {
    drawLessonDiagram(ctx, { x: 10, y: 10, w: 160, h: 90 }, 'bits', t);
  },
};
