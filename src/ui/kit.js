// UI drawing kit. API fixed by the v2 contract; visuals owned by UI (stub art below).
import { PAL } from '../art/palette.js';
import { drawText, FONT_METRICS } from '../engine/font.js';

const STYLES = {
  default: { fill: PAL.ui.panel, border: PAL.ui.border, shadow: PAL.ui.shadow },
  dialog: { fill: PAL.ui.panel, border: PAL.ui.border, shadow: PAL.ui.shadow },
  gold: { fill: PAL.night[3], border: PAL.ui.gold, shadow: PAL.ui.shadow },
  danger: { fill: PAL.night[3], border: PAL.ui.bad, shadow: PAL.ui.shadow },
  glass: { fill: PAL.night[2], border: PAL.ui.borderDim, shadow: PAL.ui.shadow },
  paper: { fill: PAL.cream[2], border: PAL.wood[3], shadow: PAL.ui.shadow },
};

export function drawWindow(ctx, x, y, w, h, style = 'default', t = 0) {
  const s = STYLES[style] ?? STYLES.default;
  x = Math.round(x);
  y = Math.round(y);
  ctx.fillStyle = s.shadow;
  ctx.fillRect(x + 1, y + 1, w, h);
  ctx.fillStyle = s.border;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = s.fill;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
}

export function drawBar(ctx, x, y, w, h, value, max, { fill = PAL.ui.hp, back = PAL.night[1], ghost = null } = {}) {
  ctx.fillStyle = back;
  ctx.fillRect(x, y, w, h);
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  if (ghost != null && max > 0) {
    ctx.fillStyle = PAL.ui.text;
    ctx.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, ghost / max))), h);
  }
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, Math.round(w * ratio), h);
}

const ICON_COLORS = {
  heart: PAL.rose[4], byte: PAL.water[7], snack: PAL.gold[6], shard: PAL.teal[7], friend: PAL.grass[6],
  star: PAL.gold[6], bolt: PAL.gold[5], shield: PAL.sky[5], scan: PAL.teal[6], run: PAL.ui.dim,
  bits: PAL.grass[6], zero: PAL.teal[6], calib: PAL.water[6], groups: PAL.violet[6], spotlight: PAL.gold[6],
  balance: PAL.violet[7], budget: PAL.gold[7], check: PAL.ui.good, cross: PAL.ui.bad, key: PAL.gold[6],
};

export function drawIcon(ctx, name, x, y) {
  ctx.fillStyle = ICON_COLORS[name] ?? PAL.ui.text;
  ctx.fillRect(Math.round(x) + 1, Math.round(y) + 1, 6, 6);
}

export function drawCursor(ctx, x, y, t = 0, dir = 'right') {
  const bob = Math.round(Math.sin(t * 8) * 1);
  ctx.fillStyle = PAL.ui.gold;
  const bx = Math.round(x) + (dir === 'right' ? bob : 0);
  const by = Math.round(y) + (dir === 'down' ? bob : 0);
  for (let i = 0; i < 4; i++) ctx.fillRect(bx + i, by + i, 1, 7 - i * 2);
}

export function drawMenu(ctx, x, y, items, selected, { cols = 1, colWidth = 60, rowHeight = FONT_METRICS.body.lineHeight + 2, t = 0, disabled = new Set() } = {}) {
  items.forEach((item, index) => {
    const label = typeof item === 'string' ? item : item.label;
    const cx = x + (index % cols) * colWidth;
    const cy = y + Math.floor(index / cols) * rowHeight;
    const off = disabled.has(index);
    if (index === selected) drawCursor(ctx, cx, cy + 1, t);
    drawText(ctx, label, cx + 8, cy, { color: off ? PAL.ui.faint : index === selected ? PAL.ui.gold : PAL.ui.text });
  });
}

export function drawKeyCap(ctx, label, x, y) {
  const w = Math.max(9, label.length * 6 + 3);
  drawWindow(ctx, x, y, w, 11, 'glass');
  drawText(ctx, label, x + 2, y + 1, { color: PAL.ui.text });
  return w;
}

export const galleries = {
  ui(ctx, screen, t) {
    drawWindow(ctx, 8, 8, 160, 40, 'default', t);
    drawText(ctx, 'The quick brown fox: 0123456789', 14, 14);
    drawBar(ctx, 14, 30, 120, 4, 30, 48);
  },
};
