// Bitmap pixel font renderer. API fixed by the v2 contract; glyph data owned by UI.
// TEMPORARY glyph set: uppercase-only 5×7 carried over from v1 until UI ships the
// proportional font with lowercase. y in drawText is the top of the line box.

import { makeCanvas } from './util.js';
import { PAL } from '../art/palette.js';

const BASIC = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '11001', '10101', '10011', '10011', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  6: ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00110', '00110'],
  ',': ['00000', '00000', '00000', '00000', '00110', '00100', '01000'],
  ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '/': ['00001', '00001', '00010', '00100', '01000', '10000', '10000'],
  '=': ['00000', '11111', '00000', '11111', '00000', '00000', '00000'],
  "'": ['00100', '00100', '00000', '00000', '00000', '00000', '00000'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '%': ['11001', '11010', '00100', '00100', '01000', '10110', '00110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

/** Per-font metrics. lineHeight = advance between lines; capTop = first ink row of capitals. */
export const FONT_METRICS = Object.freeze({
  body: Object.freeze({ lineHeight: 10, capTop: 1, capHeight: 7, xHeight: 5, descent: 2 }),
  small: Object.freeze({ lineHeight: 10, capTop: 1, capHeight: 7, xHeight: 5, descent: 2 }),
  big: Object.freeze({ lineHeight: 20, capTop: 2, capHeight: 14, xHeight: 10, descent: 4 }),
});

function buildFont(scale) {
  const glyphs = new Map();
  for (const [char, rows] of Object.entries(BASIC)) {
    glyphs.set(char, { w: 5 * scale, advance: 6 * scale, rows, scale });
  }
  return { glyphs, height: 10 * scale, scale };
}
const FONTS = { body: buildFont(1), small: buildFont(1), big: buildFont(2) };

const atlases = new Map();
function atlas(fontName, color) {
  const key = `${fontName}|${color}`;
  let entry = atlases.get(key);
  if (entry) return entry;
  const font = FONTS[fontName] ?? FONTS.body;
  const chars = [...font.glyphs.keys()];
  const cell = 6 * font.scale;
  const { canvas, ctx } = makeCanvas(chars.length * cell, font.height);
  ctx.fillStyle = color;
  const positions = new Map();
  chars.forEach((char, index) => {
    const glyph = font.glyphs.get(char);
    glyph.rows.forEach((row, y) => {
      [...row].forEach((bit, x) => {
        if (bit === '1') ctx.fillRect(index * cell + x * font.scale, (y + 1) * font.scale, font.scale, font.scale);
      });
    });
    positions.set(char, index * cell);
  });
  entry = { canvas, positions, font };
  atlases.set(key, entry);
  return entry;
}

function glyphFor(font, char) {
  return font.glyphs.get(char) ?? font.glyphs.get(char.toUpperCase()) ?? font.glyphs.get('?');
}

/** Strip *highlight* markup (\* is a literal asterisk). */
function plain(str) {
  return String(str).replace(/\\\*/g, '\u0000').replace(/\*/g, '').replace(/\u0000/g, '*');
}

export function measureText(str, fontName = 'body') {
  const font = FONTS[fontName] ?? FONTS.body;
  let width = 0;
  for (const char of plain(str)) width += glyphFor(font, char).advance;
  return Math.max(0, width - font.scale);
}

/** Greedy word wrap honouring explicit newlines; markup does not count toward width. */
export function wrapText(str, maxWidth, fontName = 'body') {
  const lines = [];
  for (const paragraph of String(str).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/ +/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measureText(candidate, fontName) > maxWidth) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    lines.push(line);
  }
  return lines;
}

function drawRun(ctx, str, x, y, fontName, color, highlight, opts, chars) {
  const base = atlas(fontName, color);
  const accent = atlas(fontName, highlight);
  const font = base.font;
  let cursor = Math.round(x);
  let lit = false;
  let index = 0;
  const text = String(str);
  for (let i = 0; i < text.length && chars.left > 0; i++) {
    let char = text[i];
    if (char === '\\' && text[i + 1] === '*') {
      char = '*';
      i++;
    } else if (char === '*') {
      lit = !lit;
      continue;
    }
    const glyph = glyphFor(font, char);
    const source = lit ? accent : base;
    const sx = source.positions.get(font.glyphs.has(char) ? char : font.glyphs.has(char.toUpperCase()) ? char.toUpperCase() : '?');
    const dy = opts.wave ? Math.round(Math.sin((opts.t ?? 0) * 6 + index * 0.55) * opts.wave) : 0;
    ctx.drawImage(source.canvas, sx, 0, glyph.advance, font.height, cursor, Math.round(y) + dy, glyph.advance, font.height);
    cursor += glyph.advance;
    index++;
    chars.left--;
  }
}

/**
 * Draw text. opts: color, font ('body'|'small'|'big'), align ('left'|'center'|'right'),
 * shadow (colour|null), outline (colour|null), highlight (colour for *marked* words),
 * wave (px), t (seconds), maxChars (typewriter). Returns the drawn width.
 */
export function drawText(ctx, str, x, y, opts = {}) {
  const fontName = opts.font ?? 'body';
  const color = opts.color ?? PAL.ui.text;
  const highlight = opts.highlight ?? PAL.ui.gold;
  const width = measureText(str, fontName);
  let left = x;
  if (opts.align === 'center') left = x - Math.floor(width / 2);
  else if (opts.align === 'right') left = x - width;
  const limit = opts.maxChars ?? Infinity;
  if (opts.outline) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      drawRun(ctx, str, left + dx, y + dy, fontName, opts.outline, opts.outline, opts, { left: limit });
    }
  }
  if (opts.shadow) drawRun(ctx, str, left + 1, y + 1, fontName, opts.shadow, opts.shadow, opts, { left: limit });
  drawRun(ctx, str, left, y, fontName, color, highlight, opts, { left: limit });
  return width;
}
