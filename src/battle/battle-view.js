// Battle rendering. Owned by Battle (stub below).
import { PAL } from '../art/palette.js';
import { drawBattleBackground } from '../art/backgrounds.js';
import { drawBattleCreature } from '../art/creatures.js';
import { drawText } from '../engine/font.js';
import { drawBar, drawMenu, drawWindow } from '../ui/kit.js';

export function drawBattleView(ctx, screen, battle, t) {
  drawBattleBackground(ctx, screen, battle.foe.background, t, { reduced: battle.game.reducedMotion });
  drawBattleCreature(ctx, battle.foeId, Math.round(screen.w / 2), Math.round(screen.h * 0.55), { t, corrupted: true });
  drawWindow(ctx, 4, 4, 120, 18, 'default');
  drawText(ctx, battle.foe.name, 8, 6);
  drawBar(ctx, 8, 16, 112, 3, battle.foeHp, battle.foe.hp, { fill: PAL.ui.bad });
  drawWindow(ctx, 4, screen.h - 44, screen.w - 8, 40, 'default');
  drawText(ctx, battle.message, 10, screen.h - 40);
  if (battle.phase === 'result') {
    drawText(ctx, `Result: ${battle.result.outcome}. Press Enter.`, 10, screen.h - 28, { color: PAL.ui.gold });
  } else {
    drawMenu(ctx, 10, screen.h - 28, ['SNAP', 'GUARD', 'FLEE'], battle.menu, { cols: 3, colWidth: 60, t });
  }
  drawText(ctx, `HP ${battle.hero.hp}`, screen.w - 10, screen.h - 40, { align: 'right', color: PAL.ui.hp });
}
