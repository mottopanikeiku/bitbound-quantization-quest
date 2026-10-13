import { PAL } from '../art/palette.js';
import { spriteCache } from '../art/paint.js';
import { drawText, measureText } from '../engine/font.js';
import { drawBar, drawIcon, fitText } from './kit.js';

const gauges = new WeakMap();
/** hud objective offsets (dx,dy) are world pixels measured from the hero. */
export function drawWorldHud(ctx, screen, hud, t) {
  const { w, h } = screen;
  let state = gauges.get(ctx);
  if (!state) {
    state = { hp: hud.hp, bytes: hud.bytes, t, objective: '', dx: 0, dy: 0, moving: 0, idle: 0, alpha: 1 };
    gauges.set(ctx, state);
  }
  const dt = Math.max(0, Math.min(0.1, t - state.t)); state.t = t;
  state.hp = Math.max(hud.hp, state.hp - dt * hud.maxHp * 0.42);
  state.bytes = Math.max(hud.bytes, state.bytes - dt * hud.maxBytes * 0.55);
  // Two nine-pixel rows, not two windows: leave the island room to breathe.
  ctx.fillStyle = '#0d0a19c8'; ctx.fillRect(4, 4, 103, 20);
  drawIcon(ctx, 'heart', 7, 6); drawIcon(ctx, 'byte', 7, 15);
  drawBar(ctx, 18, 8, 55, 4, hud.hp, hud.maxHp, { fill: hud.hp <= hud.maxHp * 0.25 ? PAL.ui.hpLow : PAL.ui.hp, ghost: state.hp });
  drawBar(ctx, 18, 17, 55, 4, hud.bytes, hud.maxBytes, { fill: PAL.ui.bytes, ghost: state.bytes });
  drawText(ctx, `${hud.hp}/${hud.maxHp}`, 103, 6, { font: 'small', align: 'right' });
  drawText(ctx, `${hud.bytes}/${hud.maxBytes}`, 103, 15, { font: 'small', align: 'right' });
  const rx = w - 72, friends = Array.isArray(hud.friends) ? hud.friends.length : hud.friends ?? 0;
  ctx.fillStyle = '#0d0a19b0'; ctx.fillRect(rx - 3, 4, 71, 13);
  drawIcon(ctx, 'snack', rx, 7); drawText(ctx, `${hud.snacks}`, rx + 10, 7, { font: 'small' });
  drawIcon(ctx, 'shard', rx + 22, 7); drawText(ctx, `${hud.shards?.length ?? hud.shards ?? 0}`, rx + 32, 7, { font: 'small' });
  drawIcon(ctx, 'friend', rx + 48, 7); drawText(ctx, `${friends}`, rx + 59, 7, { font: 'small' });
  if (!hud.objective) { state.objective = ''; return; }
  const objective = hud.objective;
  if (state.objective !== objective.text) {
    state.objective = objective.text; state.moving = 0; state.idle = 0; state.alpha = 1;
  } else if (Math.abs(objective.dx - state.dx) + Math.abs(objective.dy - state.dy) > 0.05) {
    state.moving += dt; state.idle = 0;
  } else {
    state.idle += dt;
    if (state.idle >= 1.5) state.moving = 0;
  }
  state.dx = objective.dx; state.dy = objective.dy;
  const visible = state.moving < 6;
  state.alpha = Math.max(0, Math.min(1, state.alpha + dt * (visible ? 5 : -3)));
  const oy = h - 15, text = fitText(objective.text, w - 28, 'small');
  ctx.save(); ctx.globalAlpha *= state.alpha;
  ctx.fillStyle = '#0d0a19b0'; ctx.fillRect(6, oy - 2, measureText(text, 'small') + 18, 12);
  drawIcon(ctx, 'star', 9, oy); drawText(ctx, text, 20, oy, { font: 'small', color: PAL.cream[2], shadow: PAL.ink });
  ctx.restore();
  const { dx, dy } = hud.objective, distance = Math.hypot(dx, dy);
  if (distance < 28 || !Number.isFinite(distance)) return;
  const ux = dx / distance, uy = dy / distance, cx = w / 2, cy = h / 2;
  const horizontal = (w / 2 - 15) / Math.max(0.001, Math.abs(ux));
  const vertical = (uy < 0 ? cy - 35 : oy - cy - 12) / Math.max(0.001, Math.abs(uy));
  const ray = Math.max(0, Math.min(horizontal, vertical)), ax = Math.round(cx + ux * ray), ay = Math.round(cy + uy * ray);
  const direction = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
  const arrow = spriteCache(`hud-compass:${direction}`, 13, 13, p => {
    const angle = direction * Math.PI / 4, vx = Math.cos(angle), vy = Math.sin(angle);
    const tipX = Math.round(6 + vx * 5), tipY = Math.round(6 + vy * 5), backX = Math.round(6 - vx * 4), backY = Math.round(6 - vy * 4);
    p.line(backX, backY, tipX, tipY, PAL.ui.gold);
    p.line(tipX, tipY, Math.round(6 + vx - vy * 3), Math.round(6 + vy + vx * 3), PAL.ui.gold);
    p.line(tipX, tipY, Math.round(6 + vx + vy * 3), Math.round(6 + vy - vx * 3), PAL.ui.gold);
    p.outline(PAL.ink);
  });
  ctx.save(); ctx.globalAlpha *= state.alpha;
  ctx.drawImage(arrow, ax - 6, ay - 6);
  ctx.restore();
}
