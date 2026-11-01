// Pixel windows, controls and visual vocabulary shared by the whole island.
import { PAL } from '../art/palette.js';
import { Pix, bayer, mix, spriteCache } from '../art/paint.js';
import { clamp } from '../engine/util.js';
import { drawText, measureText, wrapText, FONT_METRICS } from '../engine/font.js';

const STYLES = {
  default: { top: PAL.night[3], bottom: PAL.night[2], edge: PAL.ui.borderDim, light: PAL.cream[2], inset: PAL.night[5] },
  dialog: { top: PAL.night[3], bottom: PAL.night[1], edge: PAL.ui.borderDim, light: PAL.cream[3], inset: PAL.night[5] },
  gold: { top: PAL.night[3], bottom: PAL.night[2], edge: PAL.gold[3], light: PAL.gold[6], inset: PAL.gold[1] },
  danger: { top: PAL.night[3], bottom: PAL.night[1], edge: PAL.rose[3], light: PAL.rose[5], inset: PAL.rose[1] },
  glass: { top: PAL.night[2], bottom: PAL.night[1], edge: PAL.night[5], light: PAL.ui.borderDim, inset: PAL.night[3] },
  paper: { top: PAL.cream[3], bottom: PAL.cream[2], edge: PAL.wood[3], light: PAL.gold[6], inset: PAL.cream[0] },
};
const frames = new Map();
const windows = new Map();
function frame(style) {
  if (frames.has(style)) return frames.get(style);
  const s = STYLES[style], p = new Pix(15, 15);
  p.rect(2, 0, 11, 15, PAL.ink).rect(0, 2, 15, 11, PAL.ink);
  p.rect(2, 1, 11, 13, s.edge).rect(1, 2, 13, 11, s.edge);
  p.rect(2, 2, 11, 11, s.inset).rect(3, 3, 9, 9, s.top);
  p.line(3, 1, 11, 1, s.light).line(1, 3, 1, 10, s.light);
  p.clear(6, 6, 3, 3);
  for (const [x, y] of [[3, 3], [10, 3], [3, 10], [10, 10]]) {
    p.rect(x, y, 2, 2, s.light).set(x + 1, y + 1, s.edge);
  }
  const canvas = p.toCanvas(); frames.set(style, canvas); return canvas;
}
function windowImage(w, h, style) {
  const key = `${w}:${h}:${style}`;
  if (windows.has(key)) return windows.get(key);
  const s = STYLES[style], p = new Pix(w + 2, h + 3);
  p.rect(3, 4, w - 2, h - 1, PAL.ui.shadow);
  const mid = mix(s.top, s.bottom, 0.45);
  p.rect(3, 3, w - 6, h - 6, (x, y) => {
    const fraction = y / Math.max(1, h - 1);
    return fraction < 0.45 ? (bayer(x, y) < fraction * 0.8 ? mid : s.top) : (bayer(x, y) < (fraction - 0.45) * 1.5 ? s.bottom : mid);
  });
  const canvas = p.toCanvas(), ctx = canvas.getContext('2d'), source = frame(style);
  ctx.imageSmoothingEnabled = false;
  // Fixed six-pixel corners, one-pixel edge samples: true 9-slice, never stretched ornaments.
  const src = [0, 6, 9], size = [6, 3, 6], dstX = [0, 6, w - 6], dstY = [0, 6, h - 6], dw = [6, w - 12, 6], dh = [6, h - 12, 6];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    if (row === 1 && col === 1) continue;
    ctx.drawImage(source, src[col], src[row], size[col], size[row], dstX[col], dstY[row], dw[col], dh[row]);
  }
  if (windows.size >= 192) windows.delete(windows.keys().next().value);
  windows.set(key, canvas); return canvas;
}
export function drawWindow(ctx, x, y, w, h, style = 'default', t = 0) {
  style = STYLES[style] ? style : 'default';
  w = Math.max(12, Math.round(w)); h = Math.max(12, Math.round(h));
  ctx.drawImage(windowImage(w, h, style), Math.round(x), Math.round(y));
}
export function drawBar(ctx, x, y, w, h, value, max, { fill = PAL.ui.hp, back = PAL.night[1], ghost = null } = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  ctx.fillStyle = PAL.ink; ctx.fillRect(x, y, w, h);
  const inset = h >= 4 ? 1 : 0, iw = w - inset * 2, ih = h - inset * 2;
  ctx.fillStyle = back; ctx.fillRect(x + inset, y + inset, iw, ih);
  if (ghost != null && max > 0) {
    ctx.fillStyle = PAL.rose[6]; ctx.fillRect(x + inset, y + inset, Math.round(iw * clamp(ghost / max)), ih);
  }
  const amount = max > 0 ? Math.round(iw * clamp(value / max)) : 0;
  ctx.fillStyle = fill; ctx.fillRect(x + inset, y + inset, amount, ih);
  if (ih >= 3 && amount) {
    ctx.fillStyle = PAL.cream[3]; ctx.globalAlpha *= 0.25; ctx.fillRect(x + inset, y + inset, amount, 1); ctx.globalAlpha /= 0.25;
  }
}
const ICONS = {
  heart: ['01101100','11111110','11111110','11111110','01111100','00111000','00010000','00000000'],
  byte: ['01111110','11011011','10000001','11011011','10000001','11011011','01111110','00000000'],
  snack: ['00111000','01000100','11111110','10000010','10101010','10000010','01111100','00000000'],
  shard: ['00010000','00111000','01111100','11111110','01111100','00111000','00010000','00000000'],
  friend: ['01000100','11101110','01000100','00000000','01111100','01010100','00111000','00000000'],
  star: ['00010000','00010000','11111110','01111100','00111000','01101100','11000110','00000000'],
  bolt: ['00011000','00110000','01100000','11111100','00011000','00110000','01100000','00000000'],
  shield: ['11111110','11000110','11000110','11000110','01101100','01111100','00111000','00010000'],
  scan: ['00111000','01000100','10010010','10010010','10000010','01000100','00111010','00000001'],
  run: ['00011000','00011000','00110100','01111010','00011000','00101100','01000100','10000100'],
  bits: ['00000100','00000100','00010100','00010100','01010100','01010100','11111110','00000000'],
  zero: ['00111000','01000100','01000100','11111110','01000100','01000100','00111000','00000000'],
  calib: ['00000110','00100100','01110110','11011100','10001110','00000100','11111110','00000000'],
  groups: ['11101110','10101010','00000000','11101110','10101010','00000000','11101110','10101010'],
  spotlight: ['00011000','00111100','00111100','00011000','00100100','01000010','11111111','00000000'],
  balance: ['00010000','11111110','01010100','10111010','11111110','00010000','00111000','00000000'],
  budget: ['11111110','10010010','10110010','10010110','10010010','11111110','01111100','00000000'],
  'arrow-up': ['00010000','00111000','01111100','11010110','00010000','00010000','00010000','00000000'],
  'arrow-down': ['00010000','00010000','00010000','11010110','01111100','00111000','00010000','00000000'],
  'arrow-left': ['00010000','00110000','01100000','11111110','01100000','00110000','00010000','00000000'],
  'arrow-right': ['00010000','00011000','00001100','11111110','00001100','00011000','00010000','00000000'],
  check: ['00000000','00000010','00000110','10001100','11011000','01110000','00100000','00000000'],
  cross: ['00000000','11000110','01101100','00111000','00111000','01101100','11000110','00000000'],
  key: ['00111000','01000100','01000100','00111000','00010000','00011000','00010000','00011000'],
  'medal-gold': ['11000110','01101100','00111000','01111100','11010110','11011110','01111100','00111000'],
  'medal-silver': ['11000110','01101100','00111000','01111100','11011110','11101110','01111100','00111000'],
  'medal-bronze': ['11000110','01101100','00111000','01111100','11110110','11001110','01111100','00111000'],
  hat: ['00000000','00111000','01111100','01111100','01000100','11111111','01111110','00000000'],
  map: ['11011011','10110101','10110101','10100101','10101101','10110101','11011011','00000000'],
  dex: ['01111110','11000010','11011010','11011010','11000010','11011010','01111110','00000000'],
  well: ['00111100','01000010','10111101','10000001','11111111','01011010','01000010','01111110'],
  resonance: ['00010000','00111000','01010100','10010010','01010100','00111000','00010000','00000000'],
  assist: ['01000100','11101110','01000100','00010000','00111000','01111100','00111000','00010000'],
  pin: ['00111000','01111100','01010100','01111100','00111000','00010000','00010000','00000000'],
  golden: ['00010010','00010100','00111000','11111110','01111100','00111000','01010100','10010000'],
  badge: ['00111100','01111110','11011011','11111111','11011011','01111110','00111100','01000010'],
};
const COLORS = {
  heart: PAL.rose[4], byte: PAL.water[6], snack: PAL.gold[5], shard: PAL.teal[6], friend: PAL.grass[5],
  star: PAL.gold[5], bolt: PAL.gold[5], shield: PAL.sky[4], scan: PAL.teal[5], run: PAL.ui.dim,
  bits: PAL.grass[5], zero: PAL.teal[5], calib: PAL.water[6], groups: PAL.violet[5], spotlight: PAL.gold[5],
  balance: PAL.violet[6], budget: PAL.gold[6], check: PAL.teal[6], cross: PAL.rose[4], key: PAL.gold[5],
  'medal-gold': PAL.gold[5], 'medal-silver': PAL.sky[5], 'medal-bronze': PAL.wood[5],
  hat: PAL.rose[4], map: PAL.grass[5], dex: PAL.teal[5], well: PAL.violet[5],
  resonance: PAL.teal[6], assist: PAL.rose[5], pin: PAL.rose[4], golden: PAL.gold[5], badge: PAL.gold[5],
};
export function drawIcon(ctx, name, x, y) {
  if (!ICONS[name]) return;
  const sprite = spriteCache(`ui-icon:${name}`, 8, 8, p => {
    const tone = COLORS[name] ?? PAL.ui.gold;
    ICONS[name].forEach((row, iy) => { for (let ix = 0; ix < row.length; ix++) if (row[ix] === '1') p.set(ix, iy, iy < 3 && ix < 4 ? PAL.cream[3] : tone); });
  });
  ctx.drawImage(sprite, Math.round(x), Math.round(y));
}

// Each stamp carries its own little story, not a numbered generic achievement.
const BADGE_ART = {
  'first-friend': ['friend', PAL.grass],
  'seven-friends': ['circle', PAL.grass],
  'first-perfect': ['bell', PAL.gold],
  'three-casts': ['notes', PAL.teal],
  'guard-triad': ['triad', PAL.sky],
  recovery: ['sprout', PAL.grass],
  'bit-fit': ['bits', PAL.grass],
  'zero-fit': ['zero', PAL.teal],
  'tide-fit': ['calib', PAL.water],
  'group-fit': ['groups', PAL.violet],
  'spotlight-fit': ['spotlight', PAL.gold],
  'balance-fit': ['balance', PAL.violet],
  'budget-fit': ['crown', PAL.gold],
  'seven-bridges': ['bridge', PAL.wood],
  'sixteen-shards': ['shards', PAL.teal],
  'eight-camps': ['hearth', PAL.rose],
  'dex-complete': ['dex', PAL.teal],
  'fen-three': ['atlas', PAL.sky],
  'well-five': ['well', PAL.violet],
  'well-fifteen': ['lantern', PAL.gold],
};
const STAMP_GLYPHS = {
  circle: ['00111000','01000100','10010010','10111010','10010010','01000100','00111000','00000000'],
  bell: ['00010000','00111000','01111100','01010100','01010100','11111110','00010000','00000000'],
  notes: ['11011011','01001001','01001001','11011011','00000000','00111100','01100110','00000000'],
  triad: ['11011011','11011011','01001001','00000000','01111110','00111100','00011000','00000000'],
  sprout: ['00000011','11000110','01101100','00111000','00010000','00010000','00111000','01111100'],
  crown: ['10010010','11010110','11111110','01111100','01010100','01111100','00000000','00000000'],
  bridge: ['11000011','11111111','10100101','10100101','11111111','11000011','11000011','00000000'],
  shards: ['00100100','01101110','11111111','01101110','00100100','00011000','00111100','00011000'],
  hearth: ['00010000','01011000','01111100','00111100','00011000','11111111','01000010','00000000'],
  atlas: ['11011011','10110101','10110101','11111111','01010100','00111000','00010000','00000000'],
  lantern: ['00111000','01000100','01111100','01010100','01111100','01010100','01111100','00010000'],
};
export const BADGE_IDS = Object.freeze(Object.keys(BADGE_ART));
export const V3_ICON_IDS = Object.freeze(['medal-gold', 'medal-silver', 'medal-bronze', 'hat', 'map', 'dex', 'well', 'resonance', 'assist', 'pin', 'golden', 'badge']);
export function drawBadge(ctx, id, x, y, { earned = false, size = 24 } = {}) {
  const art = BADGE_ART[id];
  if (!art) return;
  size = Math.max(16, Math.min(96, Math.round(size)));
  const image = spriteCache(`ui-badge:${id}:${earned}:${size}`, size, size, p => {
    const base = new Pix(16, 16), ramp = art[1];
    const edge = earned ? ramp[2] : PAL.night[5], light = earned ? ramp[6] : PAL.ui.borderDim;
    // Scalloped seal with two ribbon tails and a top-left metal bevel.
    base.rect(4, 0, 8, 14, edge).rect(2, 2, 12, 10, edge).rect(1, 4, 14, 6, edge);
    if (earned) base.rect(4, 2, 8, 10, ramp[3]).rect(3, 3, 10, 8, ramp[3]);
    else { base.clear(4, 2, 8, 10); base.clear(3, 3, 10, 8); }
    base.line(4, 1, 10, 1, light).line(2, 3, 2, 8, light);
    base.line(4, 13, 2, 15, edge).line(11, 13, 13, 15, edge);
    const rows = STAMP_GLYPHS[art[0]] ?? ICONS[art[0]];
    for (let iy = 0; iy < 8; iy++) for (let ix = 0; ix < 8; ix++) {
      if (rows[iy][ix] !== '1') continue;
      if (earned) base.set(ix + 4, iy + 3, iy < 3 ? PAL.cream[3] : ramp[6]);
      else {
        base.set(ix + 5, iy + 4, PAL.night[2]);
        base.set(ix + 4, iy + 3, PAL.ui.borderDim);
      }
    }
    for (let yy = 0; yy < size; yy++) for (let xx = 0; xx < size; xx++)
      p.set(xx, yy, base.get(Math.floor(xx * 16 / size), Math.floor(yy * 16 / size)));
  });
  ctx.drawImage(image, Math.round(x), Math.round(y));
}
export function drawCursor(ctx, x, y, t = 0, dir = 'right') {
  const bob = Math.round(Math.sin(t * 7) * 1);
  drawIcon(ctx, `arrow-${dir}`, x + (dir === 'left' || dir === 'right' ? bob : 0), y + (dir === 'up' || dir === 'down' ? bob : 0));
}
export function drawMenu(ctx, x, y, items, selected, { cols = 1, colWidth = 90, rowHeight = 15, t = 0, disabled = new Set() } = {}) {
  items.forEach((item, index) => {
    const label = typeof item === 'string' ? item : item.label;
    const cx = Math.round(x + (index % cols) * colWidth), cy = Math.round(y + Math.floor(index / cols) * rowHeight);
    const off = disabled?.has?.(index) || item?.disabled;
    if (index === selected) {
      ctx.fillStyle = PAL.night[4]; ctx.fillRect(cx - 2, cy - 2, colWidth - 2, Math.max(11, rowHeight - 1));
      ctx.fillStyle = PAL.gold[5]; ctx.fillRect(cx - 2, cy - 2, 1, Math.max(11, rowHeight - 1));
      drawCursor(ctx, cx + 1, cy + 1, t);
    }
    drawText(ctx, label, cx + 12, cy, { color: off ? PAL.ui.faint : index === selected ? PAL.ui.gold : PAL.ui.text });
  });
}
export function drawKeyCap(ctx, label, x, y) {
  const w = Math.max(11, measureText(label, 'small') + 7);
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = PAL.night[5]; ctx.fillRect(x, y, w, 10);
  ctx.fillStyle = PAL.ui.borderDim; ctx.fillRect(x + 1, y, w - 2, 1);
  ctx.fillStyle = PAL.night[2]; ctx.fillRect(x + 1, y + 1, w - 2, 7);
  drawText(ctx, label, x + Math.floor(w / 2), y + 1, { font: 'small', align: 'center' });
  return w;
}
export function drawScrim(ctx, screen) {
  ctx.fillStyle = '#0d0a19b8'; ctx.fillRect(0, 0, screen.w, screen.h);
}
export function panelLift(age, reduced = false) { return reduced ? 0 : Math.round(7 * (1 - clamp(age / 0.22)) ** 3); }
export function drawPageDots(ctx, cx, y, count, selected) {
  const left = Math.round(cx - (count * 6 - 2) / 2);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = i === selected ? PAL.ui.gold : PAL.night[5];
    ctx.fillRect(left + i * 6, Math.round(y), 4, 2);
  }
}
export function fitText(str, width, font = 'body') {
  if (measureText(str, font) <= width) return str;
  let short = String(str);
  while (short && measureText(`${short}…`, font) > width) short = short.slice(0, -1);
  return `${short}…`;
}
export function drawParagraph(ctx, str, x, y, width, opts = {}) {
  const font = opts.font ?? 'body';
  for (const line of wrapText(str, width, font)) { drawText(ctx, line, x, y, opts); y += FONT_METRICS[font].lineHeight; }
  return y;
}
const SYMBOLS = '± × ÷ ≈ → ← ↑ ↓ • … — ° ² √ ∑ ★ ♥ ✓ ✗ ▼ ▶ ·';
export const galleries = {
  icons(ctx, screen) {
    const { w, h, portrait } = screen, cols = portrait ? 2 : 4;
    ctx.fillStyle = PAL.night[1]; ctx.fillRect(0, 0, w, h);
    drawText(ctx, 'POCKET SYMBOLS / V3', 12, 10, { color: PAL.ui.gold });
    const cw = Math.floor((w - 24) / cols), pitch = Math.min(40, Math.floor((h - 57) / Math.ceil(V3_ICON_IDS.length / cols)));
    V3_ICON_IDS.forEach((id, i) => {
      const x = 12 + i % cols * cw, y = 38 + Math.floor(i / cols) * pitch;
      drawIcon(ctx, id, x + Math.floor(cw / 2) - 4, y);
      drawText(ctx, id, x + Math.floor(cw / 2), y + 14, { font: 'small', align: 'center', color: PAL.ui.text });
    });
  },
  badges(ctx, screen) {
    const { w, h, portrait } = screen, cols = portrait ? 4 : 5;
    ctx.fillStyle = PAL.night[1]; ctx.fillRect(0, 0, w, h);
    drawText(ctx, 'THE TWENTY ISLAND STAMPS', 12, 9, { font: 'small', color: PAL.ui.gold });
    drawText(ctx, 'Colour: earned · Outline: locked', 12, 21, { font: 'small', color: PAL.ui.dim });
    V3_ICON_IDS.forEach((id, i) => drawIcon(ctx, id, 12 + Math.floor((i + 0.5) * (w - 24) / V3_ICON_IDS.length) - 4, 35));
    const cw = Math.floor((w - 16) / cols), rows = Math.ceil(BADGE_IDS.length / cols), pitch = Math.floor((h - 67) / rows);
    const size = Math.min(24, Math.floor((cw - 8) / 2), pitch - 16);
    BADGE_IDS.forEach((id, i) => {
      const x = 8 + i % cols * cw, y = 54 + Math.floor(i / cols) * pitch, cx = x + Math.floor(cw / 2);
      drawBadge(ctx, id, cx - size - 2, y, { earned: true, size });
      drawBadge(ctx, id, cx + 2, y, { earned: false, size });
      const label = id.replace('first-', '1st-').replace('seven-', '7-').replace('sixteen-', '16-').replace('eight-', '8-').replace('fifteen', '15').replace('five', '5');
      const lines = wrapText(label, cw - 4, 'small');
      lines.forEach((line, j) => drawText(ctx, line, cx, y + size + 2 + j * 7, { font: 'small', align: 'center', color: PAL.ui.text }));
    });
  },
  ui(ctx, screen, t, page = 0) {
    const { w, h, portrait } = screen, p = page % 6;
    ctx.fillStyle = PAL.night[1]; ctx.fillRect(0, 0, w, h);
    drawText(ctx, 'ISLE SANS / INTERFACE ATELIER', 12, 8, { font: 'small', color: PAL.ui.gold });
    drawText(ctx, ['A living pixel alphabet', 'Small labels. Big adventures.', 'Windows & pocket symbols', 'A little delight in every action', 'Big / capitals & descenders', 'Big / punctuation & symbols'][p], 12, 20);
    if (p === 0) {
      drawWindow(ctx, 8, 37, w - 16, h - 57, 'dialog');
      let y = 47;
      for (const text of ['ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz', '0123456789  g j p q y', '!"#$%&\'()+,-./:;<=>?@[\\]^_`{|}~ \\*', SYMBOLS]) {
        for (const line of wrapText(text, w - 38)) { drawText(ctx, line, 19, y); y += 13; }
        y += 3;
      }
      drawText(ctx, '*Less memory.* More possibility.', 19, y + 2, { wave: 0.5, t });
    } else if (p === 1) {
      let y = 42;
      drawText(ctx, 'SMALL / 3×5', 13, y, { font: 'small', color: PAL.ui.gold }); y += 14;
      for (const text of ['ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789', '!"#$%&\'()+,-./:;<=>?@[\\]^_`{|}~ \\*', SYMBOLS])
        for (const line of wrapText(text, w - 26, 'small')) { drawText(ctx, line, 13, y, { font: 'small' }); y += 10; }
      y += 13; drawText(ctx, 'BIG / 2× BODY', 13, y, { font: 'small', color: PAL.ui.gold }); y += 13;
      for (const line of wrapText('Bitbound: agjpy 08', w - 26, 'big')) { drawText(ctx, line, 13, y, { font: 'big', color: PAL.cream[3], shadow: PAL.violet[3] }); y += 25; }
      if (y + 18 < h - 15) drawText(ctx, 'Real descenders. Crisp at every scale.', 13, y + 7, { font: 'small', color: PAL.ui.dim });
    } else if (p === 2) {
      const cols = portrait ? 2 : 3, cw = Math.floor((w - 22) / cols);
      Object.keys(STYLES).forEach((style, i) => {
        const x = 10 + i % cols * cw, y = 39 + Math.floor(i / cols) * 32;
        drawWindow(ctx, x, y, cw - 5, 27, style); drawText(ctx, style, x + 10, y + 9, { color: style === 'paper' ? PAL.wood[1] : PAL.ui.text });
      });
      const start = 44 + Math.ceil(6 / cols) * 32, ic = portrait ? 3 : 6, cell = Math.floor((w - 20) / ic);
      const classicIcons = Object.keys(ICONS).filter(id => !V3_ICON_IDS.includes(id));
      const pitch = Math.min(23, Math.floor((h - start - 19) / Math.ceil(classicIcons.length / ic)));
      classicIcons.forEach((name, i) => {
        const x = 10 + i % ic * cell, y = start + Math.floor(i / ic) * pitch;
        drawIcon(ctx, name, x + Math.floor(cell / 2) - 4, y);
        drawText(ctx, name.replace('arrow-', ''), x + Math.floor(cell / 2), y + 10, { font: 'small', align: 'center', color: PAL.ui.dim });
      });
    } else if (p === 3) {
      const x = Math.round((w - 174) / 2);
      drawWindow(ctx, x, 40, 174, 103, 'gold');
      drawMenu(ctx, x + 13, 52, ['Explore the isle', 'Field Notes', 'Music on', 'A quiet moment'], Math.floor(t / 2) % 4, { colWidth: 150, rowHeight: 20, t });
      drawIcon(ctx, 'heart', x + 3, 155); drawBar(ctx, x + 17, 156, 154, 7, 62, 100, { ghost: 84 });
      drawIcon(ctx, 'byte', x + 3, 170); drawBar(ctx, x + 17, 171, 154, 7, 78, 100, { fill: PAL.ui.bytes });
      drawKeyCap(ctx, 'ENTER', x + 25, 188); drawKeyCap(ctx, 'ESC', x + 65, 188); drawKeyCap(ctx, 'N', x + 93, 188);
    } else {
      const specimens = p === 4
        ? ['ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz', '0123456789']
        : ['!"#$%&\'()+,-./:;<=>?@[\\]^_`{|}~ \\*', SYMBOLS];
      let y = 45;
      for (const text of specimens) {
        for (const line of wrapText(text, w - 30, 'big')) { drawText(ctx, line, 15, y, { font: 'big', color: PAL.cream[3], shadow: PAL.violet[3] }); y += 25; }
        y += 7;
      }
    }
  },
};
