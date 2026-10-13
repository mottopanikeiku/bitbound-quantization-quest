// World HUD. API fixed by the v2 contract; presentation owned by UI (stub below).
import { PAL } from '../art/palette.js';
import { drawText } from '../engine/font.js';
import { drawBar, drawWindow } from './kit.js';

/**
 * hud = { zoneName, hp, maxHp, bytes, maxBytes, snacks, shards, friends: number[],
 *         objective: { text, dx, dy } | null }  (dx, dy = objective offset from hero in px)
 */
export function drawWorldHud(ctx, screen, hud, t) {
  drawWindow(ctx, 4, 4, 86, 24, 'glass');
  drawBar(ctx, 8, 9, 78, 4, hud.hp, hud.maxHp, { fill: PAL.ui.hp });
  drawBar(ctx, 8, 17, 78, 4, hud.bytes, hud.maxBytes, { fill: PAL.ui.bytes });
  if (hud.objective) drawText(ctx, hud.objective.text, 6, screen.h - 12, { color: PAL.ui.gold, shadow: PAL.ink });
  if (hud.zoneName) drawText(ctx, hud.zoneName, screen.w - 6, 6, { align: 'right', shadow: PAL.ink });
}
