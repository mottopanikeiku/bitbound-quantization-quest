// Isle Sans: an original, hand-pixelled proportional face. Coordinates are line-box tops.
import { makeCanvas } from './util.js';
import { PAL } from '../art/palette.js';

// A slash separates rows; lowercase starts two rows below the cap line.
const BODY = {
  A: '01110/10001/10001/11111/10001/10001/10001', B: '11110/10001/10001/11110/10001/10001/11110',
  C: '0111/1000/1000/1000/1000/1000/0111', D: '11110/10001/10001/10001/10001/10001/11110',
  E: '1111/1000/1000/1110/1000/1000/1111', F: '1111/1000/1000/1110/1000/1000/1000',
  G: '01110/10001/10000/10111/10001/10001/01110', H: '10001/10001/10001/11111/10001/10001/10001',
  I: '111/010/010/010/010/010/111', J: '00111/00010/00010/00010/10010/10010/01100',
  K: '10001/10010/10100/11000/10100/10010/10001', L: '1000/1000/1000/1000/1000/1000/1111',
  M: '10001/11011/10101/10101/10001/10001/10001', N: '10001/11001/11001/10101/10011/10011/10001',
  O: '01110/10001/10001/10001/10001/10001/01110', P: '11110/10001/10001/11110/10000/10000/10000',
  Q: '01110/10001/10001/10001/10101/10010/01101', R: '11110/10001/10001/11110/10100/10010/10001',
  S: '01111/10000/10000/01110/00001/00001/11110', T: '11111/00100/00100/00100/00100/00100/00100',
  U: '10001/10001/10001/10001/10001/10001/01110', V: '10001/10001/10001/10001/10001/01010/00100',
  W: '10001/10001/10001/10101/10101/10101/01010', X: '10001/10001/01010/00100/01010/10001/10001',
  Y: '10001/10001/01010/00100/00100/00100/00100', Z: '11111/00001/00010/00100/01000/10000/11111',
  a: '0000/0000/0110/0001/0111/1001/0111', b: '1000/1000/1110/1001/1001/1001/1110',
  c: '0000/0000/0111/1000/1000/1000/0111', d: '0001/0001/0111/1001/1001/1001/0111',
  e: '0000/0000/0110/1001/1111/1000/0111', f: '0011/0100/1110/0100/0100/0100/0100',
  g: '0000/0000/0111/1001/1001/1001/0111/0001/1110', h: '1000/1000/1110/1001/1001/1001/1001',
  i: '1/0/1/1/1/1/1', j: '01/00/01/01/01/01/01/01/10',
  k: '1000/1000/1001/1010/1100/1010/1001', l: '10/10/10/10/10/10/01',
  m: '00000/00000/11010/10101/10101/10101/10101', n: '0000/0000/1110/1001/1001/1001/1001',
  o: '0000/0000/0110/1001/1001/1001/0110', p: '0000/0000/1110/1001/1001/1001/1110/1000/1000',
  q: '0000/0000/0111/1001/1001/1001/0111/0001/0001', r: '000/000/101/110/100/100/100',
  s: '0000/0000/0111/1000/0110/0001/1110', t: '010/010/111/010/010/010/001',
  u: '0000/0000/1001/1001/1001/1001/0111', v: '00000/00000/10001/10001/10001/01010/00100',
  w: '00000/00000/10001/10001/10101/10101/01010', x: '00000/00000/10001/01010/00100/01010/10001',
  y: '0000/0000/1001/1001/1001/1001/0111/0001/1110', z: '0000/0000/1111/0001/0110/1000/1111',
  0: '0110/1001/1001/1001/1001/1001/0110', 1: '010/110/010/010/010/010/111',
  2: '0110/1001/0001/0010/0100/1000/1111', 3: '1110/0001/0001/0110/0001/0001/1110',
  4: '0010/0110/1010/1010/1111/0010/0010', 5: '1111/1000/1000/1110/0001/0001/1110',
  6: '0110/1000/1000/1110/1001/1001/0110', 7: '1111/0001/0001/0010/0100/0100/0100',
  8: '0110/1001/1001/0110/1001/1001/0110', 9: '0110/1001/1001/0111/0001/0001/0110',
  ' ': '000', '!': '1/1/1/1/1/0/1', '"': '101/101/101', '#': '01010/01010/11111/01010/11111/01010/01010',
  '$': '00100/01111/10100/01110/00101/11110/00100', '%': '11001/11010/00010/00100/01000/01011/10011',
  '&': '01100/10010/10100/01000/10101/10010/01101', "'": '1/1', '(': '01/10/10/10/10/10/01', ')': '10/01/01/01/01/01/10',
  '*': '00000/00100/10101/01110/10101/00100', '+': '00000/00100/00100/11111/00100/00100',
  ',': '00/00/00/00/00/00/01/01/10', '-': '000/000/000/111', '.': '0/0/0/0/0/0/1',
  '/': '0001/0001/0010/0010/0100/1000/1000', ':': '0/0/1/0/0/1', ';': '00/00/01/00/00/01/01/10',
  '<': '000/001/010/100/010/001', '=': '0000/0000/1111/0000/1111', '>': '000/100/010/001/010/100',
  '?': '0110/1001/0001/0010/0100/0000/0100', '@': '01110/10001/10111/10101/10111/10000/01110',
  '[': '11/10/10/10/10/10/11', '\\': '1000/1000/0100/0100/0010/0001/0001', ']': '11/01/01/01/01/01/11',
  '^': '010/101', '_': '0000/0000/0000/0000/0000/0000/1111', '`': '10/01',
  '{': '001/010/010/100/010/010/001', '|': '1/1/1/1/1/1/1', '}': '100/010/010/001/010/010/100', '~': '00000/00000/01001/10110',
  '±': '00100/00100/11111/00100/00100/00000/11111', '×': '00000/10001/01010/00100/01010/10001',
  '÷': '00000/00100/00000/11111/00000/00100', '≈': '00000/01001/10110/00000/01001/10110',
  '→': '00000/00100/00010/11111/00010/00100', '←': '00000/00100/01000/11111/01000/00100',
  '↑': '00100/01110/10101/00100/00100/00100/00100', '↓': '00100/00100/00100/00100/10101/01110/00100',
  '•': '000/000/010/111/010', '…': '00000/00000/00000/00000/00000/00000/10101', '—': '0000000/0000000/0000000/1111111',
  '°': '010/101/010', '²': '110/001/010/111', '√': '00001/00001/00010/00010/10100/01100/00100',
  '∑': '11111/10000/01000/00100/01000/10000/11111', '★': '00100/00100/11111/01110/01110/11011/10001',
  '♥': '01010/11111/11111/11111/01110/00100', '✓': '00000/00001/00001/00010/10010/01100',
  '✗': '00000/10001/01010/00100/01010/10001', '▼': '00000/11111/11111/01110/01110/00100',
  '▶': '1000/1100/1110/1111/1110/1100/1000', '·': '0/0/0/1',
  '≤': '0001/0010/0100/0010/0001/0000/1111', '≥': '1000/0100/0010/0100/1000/0000/1111',
  'α': '00000/00000/01101/10010/10010/10010/01101', 'β': '0110/1001/1001/1110/1001/1001/1110/1000/1000',
  'Σ': '11111/10000/01000/00100/01000/10000/11111', '−': '00000/00000/00000/11111', '‖': '101/101/101/101/101/101/101',
};
const SMALL = {
  A:'010/101/111/101/101',B:'110/101/110/101/110',C:'011/100/100/100/011',D:'110/101/101/101/110',
  E:'111/100/110/100/111',F:'111/100/110/100/100',G:'011/100/101/101/011',H:'101/101/111/101/101',
  I:'111/010/010/010/111',J:'001/001/001/101/010',K:'101/101/110/101/101',L:'100/100/100/100/111',
  M:'10001/11011/10101/10001/10001',N:'1001/1101/1011/1001/1001',O:'010/101/101/101/010',P:'110/101/110/100/100',
  Q:'010/101/101/011/001',R:'110/101/110/101/101',S:'011/100/010/001/110',T:'111/010/010/010/010',
  U:'101/101/101/101/111',V:'101/101/101/101/010',W:'10001/10001/10101/10101/01010',X:'101/101/010/101/101',Y:'101/101/010/010/010',Z:'111/001/010/100/111',
  0:'111/101/101/101/111',1:'010/110/010/010/111',2:'110/001/010/100/111',3:'110/001/010/001/110',4:'101/101/111/001/001',
  5:'111/100/110/001/110',6:'011/100/110/101/010',7:'111/001/010/010/010',8:'111/101/111/101/111',9:'010/101/011/001/110',
  ' ':'00','!':'1/1/1/0/1','?':'110/001/010/000/010','.':'0/0/0/0/1',',':'00/00/00/01/10',':':'0/1/0/1',
  ';':'00/01/00/01/10',"'":'1/1','"':'101/101','-':'000/000/111','_':'000/000/000/000/111','+':'000/010/111/010',
  '=':'000/111/000/111','/':'001/001/010/100/100','\\':'100/100/010/001/001','(':'01/10/10/10/01',')':'10/01/01/01/10',
  '[':'11/10/10/10/11',']':'11/01/01/01/11','<':'001/010/100/010/001','>':'100/010/001/010/100','*':'101/010/111/010/101',
  '#':'01010/11111/01010/11111/01010','%':'101/001/010/100/101','&':'010/101/010/101/011','@':'0110/1001/1011/1000/0111',
  '$':'011/110/010/011/110','^':'010/101','`':'10/01','{':'011/010/100/010/011','}':'110/010/001/010/110','|':'1/1/1/1/1','~':'000/0101/1010',
  '±':'010/111/010/000/111','×':'000/101/010/101','÷':'010/000/111/000/010','≈':'0101/1010/0000/0101/1010',
  '→':'00100/00010/11111/00010/00100','←':'00100/01000/11111/01000/00100','↑':'010/111/010/010/010','↓':'010/010/010/111/010',
  '•':'000/010/111/010','…':'00000/00000/00000/00000/10101','—':'00000/00000/11111','°':'111/101/111','²':'110/010/111',
  '√':'001/001/101/011/010','∑':'111/100/010/100/111','★':'010/111/111/101','♥':'101/111/111/010',
  '✓':'001/001/101/010','✗':'101/010/101','▼':'11111/01110/00100','▶':'100/110/111/110/100','·':'0/0/1',
};
export const FONT_METRICS = Object.freeze({
  body: Object.freeze({ lineHeight: 11, capTop: 1, capHeight: 7, xHeight: 5, descent: 2 }),
  small: Object.freeze({ lineHeight: 7, capTop: 1, capHeight: 5, xHeight: 5, descent: 0 }),
  big: Object.freeze({ lineHeight: 22, capTop: 2, capHeight: 14, xHeight: 10, descent: 4 }),
});
function buildFont(data, scale, height) {
  const glyphs = new Map();
  for (const [char, pattern] of Object.entries(data)) {
    const rows = pattern.split('/');
    const w = Math.max(...rows.map(row => row.length)) * scale;
    glyphs.set(char, { rows, w, advance: w + scale });
  }
  return { glyphs, scale, height };
}
const FONTS = { body: buildFont(BODY, 1, 11), small: buildFont(SMALL, 1, 7), big: buildFont(BODY, 2, 22) };
const atlases = new Map();
const strings = new Map();
const ALIASES = { '’': "'", '‘': "'", '“': '"', '”': '"', '–': '—', ' ': ' ' };
function charKey(font, char) {
  const key = ALIASES[char] ?? char;
  return font.glyphs.has(key) ? key : font.glyphs.has(key.toUpperCase()) ? key.toUpperCase() : '?';
}
function tokens(str) {
  const text = String(str);
  let parsed = strings.get(text);
  if (parsed) return parsed;
  parsed = [];
  let lit = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && text[i + 1] === '*') { parsed.push({ char: '*', lit }); i++; }
    else if (text[i] === '*') lit = !lit;
    else parsed.push({ char: text[i], lit });
  }
  if (strings.size >= 512) strings.delete(strings.keys().next().value);
  strings.set(text, parsed);
  return parsed;
}
/** Visible characters, excluding markup/newlines; shared by typewriter overlays. */
export function textLength(str) { return tokens(str).reduce((n, token) => n + (token.char !== '\n'), 0); }
function widthOf(run, font) {
  let width = 0;
  for (const token of run) width += font.glyphs.get(charKey(font, token.char)).advance;
  return Math.max(0, width - font.scale);
}
export function measureText(str, fontName = 'body') {
  const font = FONTS[fontName] ?? FONTS.body;
  let width = 0, max = 0;
  for (const token of tokens(str)) {
    if (token.char === '\n') { max = Math.max(max, width - font.scale); width = 0; }
    else width += font.glyphs.get(charKey(font, token.char)).advance;
  }
  return Math.max(0, max, width - font.scale);
}
function markup(run) {
  let result = '', lit = false;
  for (const token of run) {
    if (token.lit !== lit) { result += '*'; lit = token.lit; }
    result += token.char === '*' ? '\\*' : token.char;
  }
  return result + (lit ? '*' : '');
}
/** Wraps words, hard-breaks long tokens, and preserves highlight spans across lines. */
export function wrapText(str, maxWidth, fontName = 'body') {
  const font = FONTS[fontName] ?? FONTS.body;
  const lines = [];
  let run = [];
  const flush = () => { while (run.at(-1)?.char === ' ') run.pop(); lines.push(markup(run)); run = []; };
  for (const token of tokens(str)) {
    if (token.char === '\n') { flush(); continue; }
    if (!run.length && token.char === ' ') continue;
    run.push(token);
    if (widthOf(run, font) <= Math.max(1, maxWidth) || run.length === 1) continue;
    let space = -1;
    for (let i = run.length - 1; i >= 0; i--) if (run[i].char === ' ') { space = i; break; }
    if (space >= 0) {
      const rest = run.slice(space + 1); run = run.slice(0, space); flush(); run = rest;
    } else {
      const rest = run.pop(); flush(); run = [rest];
    }
  }
  if (run.length || !lines.length || String(str).endsWith('\n')) flush();
  return lines;
}
function atlas(fontName, color, outline, shadow) {
  const key = `${fontName}|${color}|${outline}|${shadow}`;
  if (atlases.has(key)) return atlases.get(key);
  const font = FONTS[fontName] ?? FONTS.body;
  const cell = 20, pad = 2;
  const { canvas, ctx } = makeCanvas(font.glyphs.size * cell, font.height + 4);
  const positions = new Map();
  let index = 0;
  for (const [char, glyph] of font.glyphs) {
    const sx = index++ * cell;
    positions.set(char, sx);
    const paint = (dx, dy, tone) => {
      ctx.fillStyle = tone;
      glyph.rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) if (row[x] === '1')
          ctx.fillRect(sx + pad + x * font.scale + dx, pad + (y + 1) * font.scale + dy, font.scale, font.scale);
      });
    };
    if (shadow) paint(1, 1, shadow);
    if (outline) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) paint(dx, dy, outline);
    paint(0, 0, color);
  }
  const entry = { canvas, positions, font, pad };
  atlases.set(key, entry);
  return entry;
}
/** Cached colour atlases keep every glyph (including its shadow/outline) to one blit. */
export function drawText(ctx, str, x, y, opts = {}) {
  const fontName = FONTS[opts.font] ? opts.font : 'body';
  const outline = opts.outline === undefined && fontName === 'big' ? PAL.ink : opts.outline;
  const base = atlas(fontName, opts.color ?? PAL.ui.text, outline, opts.shadow);
  const accent = atlas(fontName, opts.highlight ?? PAL.ui.gold, outline, opts.shadow);
  const font = base.font, parsed = tokens(str);
  let remaining = opts.maxChars ?? Infinity, top = Math.round(y), index = 0, max = 0;
  let start = 0;
  for (let end = 0; end <= parsed.length; end++) {
    if (end < parsed.length && parsed[end].char !== '\n') continue;
    let width = 0;
    for (let i = start; i < end; i++) width += font.glyphs.get(charKey(font, parsed[i].char)).advance;
    width = Math.max(0, width - font.scale); max = Math.max(max, width);
    let left = Math.round(x - (opts.align === 'center' ? Math.floor(width / 2) : opts.align === 'right' ? width : 0));
    for (let i = start; i < end && remaining > 0; i++, remaining--, index++) {
      const token = parsed[i], char = charKey(font, token.char), glyph = font.glyphs.get(char);
      const source = token.lit ? accent : base;
      const dy = opts.wave ? Math.round(Math.sin((opts.t ?? 0) * 6 + index * 0.55) * opts.wave) : 0;
      if (char !== ' ') ctx.drawImage(source.canvas, source.positions.get(char), 0, glyph.w + 4, font.height + 4, left - 2, top - 2 + dy, glyph.w + 4, font.height + 4);
      left += glyph.advance;
    }
    start = end + 1; top += FONT_METRICS[fontName].lineHeight;
  }
  return max;
}
