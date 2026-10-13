// Shared, integer-raster quantization instrument for battles, bridges and lessons.
import { PAL } from '../art/palette.js';
import { drawText, measureText, wrapText, FONT_METRICS } from '../engine/font.js';
import { drawWindow, drawBar } from '../ui/kit.js';
import { symmetricParams, affineParams, quantizeVector, levelsOf, fidelity, packetBytes, roundEven, dot } from '../quantization.js';

const EMPTY = [];
const SURFACES = new Map();
const DEMOS = new Map();
const LESSON_IDS = ['bits', 'zero', 'calib', 'groups', 'spotlight', 'balance', 'budget'];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const mix = (a, b, p) => a + (b - a) * p;

// Reusable raster surfaces are also the clipping boundary: even a tiny lesson
// rectangle cannot spill glyphs, frame shadows or motes into neighbouring UI.
function surface(w, h) {
  const key = `${w}:${h}`;
  let entry = SURFACES.get(key);
  if (!entry) {
    const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    entry = { canvas, ctx };
    if (SURFACES.size >= 16) SURFACES.delete(SURFACES.keys().next().value);
    SURFACES.set(key, entry);
  }
  return entry;
}

function box(ctx, x, y, w, h, color) {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function line(ctx, x0, y0, x1, y1, color, dotted = false) {
  x0 = Math.round(x0); y0 = Math.round(y0);
  x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let error = dx + dy, step = 0;
  ctx.fillStyle = color;
  for (;;) {
    if (!dotted || step % 3 !== 1) ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const twice = 2 * error;
    if (twice >= dy) { error += dy; x0 += sx; }
    if (twice <= dx) { error += dx; y0 += sy; }
    step++;
  }
}

function number(value) {
  if (!Number.isFinite(value)) return '?';
  if (Math.abs(value) < 1e-9) return '0';
  const a = Math.abs(value);
  let text = a >= 1000 ? `${Math.round(value / 1000)}k`
    : a < 0.001 ? value.toExponential(0)
      : value.toFixed(a < 0.01 ? 3 : a < 10 ? 2 : 1);
  if (text.includes('.') && !text.includes('e')) text = text.replace(/0+$/, '').replace(/\.$/, '');
  return text.replace(/^(-?)0\./, '$1.').replace('e+', 'e');
}

function fit(text, width) {
  text = String(text ?? '');
  if (measureText(text, 'small') <= width) return text;
  while (text.length && measureText(`${text}…`, 'small') > width) text = text.slice(0, -1);
  return text && width >= measureText('…', 'small') ? `${text}…` : '';
}

function label(ctx, text, x, y, width, color = PAL.ui.dim, align = 'left') {
  const fitted = fit(text, width);
  if (fitted) drawText(ctx, fitted, Math.round(x), Math.round(y), { font: 'small', color, align, shadow: null });
}

function hollow(ctx, x, y, color, small = false) {
  if (small) {
    box(ctx, x, y - 1, 1, 1, color);
    box(ctx, x - 1, y, 1, 1, color);
    box(ctx, x + 1, y, 1, 1, color);
    box(ctx, x, y + 1, 1, 1, color);
  } else {
    box(ctx, x - 1, y - 2, 3, 1, color);
    box(ctx, x - 2, y - 1, 1, 3, color);
    box(ctx, x + 2, y - 1, 1, 3, color);
    box(ctx, x - 1, y + 2, 3, 1, color);
  }
}

function mote(ctx, x, y, color, small, kept = false) {
  if (kept) {
    box(ctx, x - 1, y - 3, 3, 1, PAL.gold[3]);
    box(ctx, x - 3, y - 1, 7, 3, PAL.gold[2]);
    box(ctx, x - 1, y - 2, 3, 5, PAL.gold[5]);
    box(ctx, x - 2, y - 1, 5, 3, PAL.gold[6]);
    box(ctx, x, y - 1, 1, 3, PAL.gold[8]);
    box(ctx, x - 1, y, 3, 1, PAL.gold[8]);
    return;
  }
  const size = small ? 1 : 2;
  box(ctx, x - size + 1, y + 1, size * 2, size, PAL.night[0]);
  box(ctx, x - size, y - size + 1, size * 2 + 1, size * 2 - 1, color);
  box(ctx, x - size + 1, y - size, size * 2 - 1, 1, color);
  box(ctx, x - size + 1, y + size, size * 2 - 1, 1, color);
  box(ctx, x - size + 1, y - size + 1, 1, 1, PAL.cream[3]);
}

function question(ctx, x, y) {
  box(ctx, x - 1, y - 2, 3, 1, PAL.water[7]);
  box(ctx, x + 1, y - 1, 1, 1, PAL.water[7]);
  box(ctx, x, y, 1, 1, PAL.water[7]);
  box(ctx, x, y + 2, 1, 1, PAL.cream[2]);
}

function rowInfo(row) {
  const levels = row.levels ?? EMPTY;
  const count = levels.length || 2 ** (row.bits ?? 3) - 1;
  const bits = row.bits ?? Math.ceil(Math.log2(count));
  const affine = row.mode === 'affine' || (row.mode !== 'sym' && count === 2 ** bits);
  const scale = Math.abs(row.scale ?? (levels.length > 1 ? levels[1] - levels[0] : (row.hi - row.lo) / Math.max(1, count - 1))) || 1;
  const lo = row.lo ?? levels[0] ?? -scale * ((count - 1) / 2);
  const hi = row.hi ?? levels[count - 1] ?? lo + scale * (count - 1);
  const qmin = affine ? 0 : -Math.floor(count / 2);
  const zero = row.zero ?? (affine ? roundEven(-lo / scale) : 0);
  return { levels, count, bits, affine, scale, lo, hi, qmin, zero, qmax: qmin + count - 1 };
}

function rowView(row, info, model, independent, hidden) {
  const declared = row.view ?? (!independent ? model.view : null);
  if (declared && Number.isFinite(declared.min) && declared.max > declared.min) return declared;
  let min = Math.min(0, info.lo), max = Math.max(0, info.hi);
  if (!hidden) for (const v of row.values ?? EMPTY) { min = Math.min(min, v); max = Math.max(max, v); }
  for (const v of row.ghosts ?? EMPTY) { min = Math.min(min, v); max = Math.max(max, v); }
  const padding = Math.max(0.0001, (max - min) * 0.1);
  return { min: min - padding, max: max + padding };
}

function metadata(info, width, short = false) {
  const full = `${info.bits} bit · ${info.count} levels · step ${number(info.scale)}`;
  if (!short && measureText(full, 'small') <= width) return full;
  const compact = `${info.bits}b ${info.count}L s${number(info.scale)}`;
  return measureText(compact, 'small') <= width ? compact : `${info.bits}b ${info.count}L`;
}

function drawRow(ctx, cell, row, info, model, index, t, options) {
  const { hidden, reduced, smallH, independent, multi, stats } = options;
  const view = rowView(row, info, model, independent, hidden);
  const active = model.activeRow == null || model.activeRow === index;
  const rowTop = cell.y + (multi ? smallH + 1 + (stats ? smallH : 0) : 0);
  const top = rowTop + 4, bottom = cell.y + cell.h - 5;
  if (bottom <= top) return;
  box(ctx, cell.x, rowTop, cell.w, bottom - rowTop + 5, PAL.night[1]);
  box(ctx, cell.x + 1, rowTop + 1, cell.w - 2, 1, PAL.night[0]);
  if (multi) {
    box(ctx, cell.x, cell.y + 1, 2, Math.max(3, smallH - 2), active ? PAL.teal[6] : PAL.night[5]);
    label(ctx, row.label ?? `Grid ${index + 1}`, cell.x + 5, cell.y, cell.w - 7, active ? PAL.ui.text : PAL.ui.dim);
    if (stats) label(ctx, metadata(info, cell.w - 4, true), cell.x + 2, cell.y + smallH + 1, cell.w - 4, PAL.water[8]);
  }

  const hasAxis = cell.w >= 47 && bottom - top >= 16;
  const axisLabel = value => cell.w < 75 && Math.abs(value) >= 1 ? String(Math.round(value)) : number(value);
  const axisWidth = hasAxis ? Math.min(Math.ceil(cell.w * 0.3), Math.max(measureText(axisLabel(view.min), 'small'), measureText(axisLabel(view.max), 'small'), 5) + 3) : 0;
  const codeWidth = Math.max(measureText(String(info.qmin), 'small'), measureText(String(info.qmax), 'small')) + 2;
  const stepPixels = info.scale * (bottom - top) / (view.max - view.min);
  const labelHeight = Math.max(7, FONT_METRICS.small.capHeight + 2);
  const showCodeLabels = model.showCodes !== false && options.showCodes !== false
    && info.bits <= 4 && cell.w - axisWidth - codeWidth >= 31;
  const codeStride = Math.max(1, Math.ceil(labelHeight / Math.max(0.1, stepPixels)));
  const left = cell.x + axisWidth + 3;
  const right = cell.x + cell.w - 4 - (showCodeLabels ? codeWidth : 0);
  if (right <= left) return;
  const width = right - left;
  const yOf = (v) => Math.round(bottom - clamp((v - view.min) / (view.max - view.min), 0, 1) * (bottom - top));
  const textY = (y) => Math.round(y - FONT_METRICS.small.capTop - Math.floor(FONT_METRICS.small.capHeight / 2));

  for (let x = left + 5; x < right; x += 10) {
    for (let y = top + 2; y < bottom; y += 6) box(ctx, x, y, 1, 1, PAL.night[3]);
  }
  if (info.bits > 4) {
    const y0 = Math.max(top, yOf(info.hi)), y1 = Math.min(bottom, yOf(info.lo));
    for (let y = y0; y <= y1; y += 2) {
      for (let x = left + (y % 4 ? 2 : 0); x <= right; x += 6) box(ctx, x, y, Math.min(3, right - x + 1), 1, PAL.night[4]);
    }
  } else {
    const zeroIndex = Math.round(-info.lo / info.scale);
    const mandatoryLabels = [0, zeroIndex, info.count - 1].filter(i => i >= 0 && i < info.count);
    for (let i = 0; i < info.count; i++) {
      const level = info.levels[i] ?? info.lo + i * info.scale;
      if (level < view.min || level > view.max) continue;
      const y = yOf(level), code = info.qmin + i;
      box(ctx, left, y, width + 1, 1, Math.abs(level) < 1e-8 ? PAL.teal[3] : PAL.night[4]);
      if (showCodeLabels) {
        const required = mandatoryLabels.includes(i);
        const clearOfRequired = mandatoryLabels.every(requiredIndex => Math.abs(i - requiredIndex) * stepPixels >= labelHeight);
        if (required || (i % codeStride === 0 && clearOfRequired)) {
          label(ctx, String(code), right + 3, textY(y), codeWidth - 1, Math.abs(level) < 1e-8 ? PAL.teal[7] : PAL.ui.faint);
        }
      }
    }
  }
  if (view.min <= 0 && view.max >= 0) {
    box(ctx, left, yOf(0), width + 1, 1, PAL.teal[4]);
    box(ctx, right - 1, yOf(0) - 1, 2, 3, PAL.teal[6]);
  }
  if (hasAxis) {
    label(ctx, axisLabel(view.max), left - 5, textY(top), axisWidth - 2, PAL.ui.dim, 'right');
    label(ctx, axisLabel(view.min), left - 5, textY(bottom), axisWidth - 2, PAL.ui.dim, 'right');
    if (view.min < 0 && view.max > 0 && yOf(0) - top > smallH && bottom - yOf(0) > smallH) {
      label(ctx, '0', left - 5, textY(yOf(0)), axisWidth - 2, PAL.teal[7], 'right');
    }
  }

  const bracket = row.bracket ?? (active ? model.bracket : null);
  const low = bracket?.lo ?? info.lo, high = bracket?.hi ?? info.hi;
  const by0 = yOf(high), by1 = yOf(low), bracketColor = active ? PAL.gold[5] : PAL.water[5];
  box(ctx, left - 2, by0, 1, Math.max(1, by1 - by0 + 1), bracketColor);
  box(ctx, left - 2, by0, 5, 1, bracketColor);
  box(ctx, left - 2, by1, 5, 1, bracketColor);
  box(ctx, right - 2, by0, 3, 1, bracketColor);
  box(ctx, right - 2, by1, 3, 1, bracketColor);

  const ghosts = row.ghosts ?? (index === 0 ? model.ghosts : null) ?? EMPTY;
  for (let i = 0; i < ghosts.length; i++) {
    const x = left + 3 + Math.round((i + 0.5) * Math.max(0, width - 6) / ghosts.length);
    hollow(ctx, x, yOf(ghosts[i]), PAL.water[4], true);
  }

  const values = row.values ?? EMPTY;
  if (hidden) {
    const count = Math.max(1, Math.min(values.length || 6, Math.floor(width / 10)));
    for (let i = 0; i < count; i++) {
      const x = left + 3 + Math.round((i + 0.5) * Math.max(0, width - 6) / count);
      // Deliberately unrelated to the secret values, including their magnitude.
      const y = Math.round(mix(top + 4, bottom - 4, 0.5 + 0.22 * Math.sin(i * 1.8))) + (reduced ? 0 : Math.round(Math.sin(t * 2 + i) * 0.7));
      question(ctx, x, y);
    }
    return;
  }

  const rawSnap = clamp(model.snap ?? 0, 0, 1);
  const snap = reduced ? (rawSnap < 0.5 ? 0 : 1) : rawSnap * rawSnap * (3 - 2 * rawSnap);
  const small = width / Math.max(1, values.length) < 5;
  let previousX = 0, previousY = 0;
  for (let i = 0; i < values.length; i++) {
    const x = left + 3 + Math.round((i + 0.5) * Math.max(0, width - 6) / values.length);
    const y = yOf(values[i]);
    if (i) line(ctx, previousX, previousY, x, y, PAL.teal[2], true);
    previousX = x; previousY = y;
  }
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    const kept = row.protected?.[i] === true;
    const code = row.codes?.[i] ?? clamp(roundEven(value / info.scale) + info.zero, info.qmin, info.qmax);
    const reconstructed = kept ? value : row.recon?.[i] ?? info.scale * (code - info.zero);
    const clipped = !kept && (row.clipped?.[i] ?? (value < info.lo - 1e-9 || value > info.hi + 1e-9));
    const x = left + 3 + Math.round((i + 0.5) * Math.max(0, width - 6) / values.length);
    const from = yOf(value), to = yOf(reconstructed), at = yOf(mix(value, reconstructed, snap));
    if (row.salient?.[i] || kept) {
      for (let y = top + 1; y < bottom; y += 4) box(ctx, x, y, 1, 1, kept ? PAL.gold[2] : PAL.night[4]);
      box(ctx, x - 1, top, 3, 1, kept ? PAL.gold[6] : PAL.gold[3]);
      box(ctx, x, top + 1, 1, 1, kept ? PAL.gold[6] : PAL.gold[3]);
    }
    if (!kept && model.showError !== false && options.showError !== false && from !== to) {
      line(ctx, x, from, x, to, clipped ? PAL.ember[5] : PAL.ui.error, snap === 0);
      box(ctx, x - 1, from, 3, 1, clipped ? PAL.ember[4] : PAL.rose[3]);
    }
    if (snap < 1 && !kept) hollow(ctx, x, to, clipped ? PAL.ember[4] : PAL.teal[5], true);
    if (snap > 0 && !kept && Math.abs(from - to) > 2) hollow(ctx, x, from, PAL.ui.faint, true);
    if (!reduced && snap > 0 && snap < 1 && Math.abs(from - to) > 5) {
      box(ctx, x, Math.round(mix(from, at, 0.35)), 1, 1, PAL.teal[3]);
      box(ctx, x, Math.round(mix(from, at, 0.7)), 1, 1, PAL.teal[5]);
    }
    const color = clipped ? (!reduced && Math.floor(t * 3) % 2 ? PAL.ember[7] : PAL.ui.clip)
      : snap > 0.02 ? PAL.teal[7] : PAL.cream[3];
    mote(ctx, x, at, color, small, kept);
    if (value < view.min || value > view.max) {
      const edgeY = value > view.max ? top : bottom, direction = value > view.max ? 1 : -1;
      box(ctx, x, edgeY, 1, 1, PAL.ui.clip);
      box(ctx, x - 1, edgeY + direction, 3, 1, PAL.ui.clip);
    }
  }
}

function drawLegend(ctx, x, y, width, model, rows) {
  const items = model.hidden ? [['?', 'live', PAL.water[7]]] : [['dot', 'true', PAL.cream[3]], ['ring', 'snap', PAL.teal[7]], ['line', 'error', PAL.ui.error]];
  if (!model.hidden && rows.some((row) => row.clipped?.some(Boolean))) items.push(['dot', 'clip', PAL.ui.clip]);
  if (rows.some((row) => row.protected?.some(Boolean))) items.push(['star', 'kept', PAL.gold[6]]);
  if (model.ghosts?.length || rows.some((row) => row.ghosts?.length)) items.push(['ring', 'past', PAL.water[4]]);
  const mid = y + FONT_METRICS.small.capTop + Math.floor(FONT_METRICS.small.capHeight / 2);
  let cursor = x;
  for (const [shape, text, color] of items) {
    const span = measureText(text, 'small') + 12;
    if (cursor + span > x + width) break;
    if (shape === 'ring') hollow(ctx, cursor + 2, mid, color, true);
    else if (shape === 'line') box(ctx, cursor, mid, 5, 1, color);
    else if (shape === '?') question(ctx, cursor + 2, mid);
    else {
      box(ctx, cursor + 1, mid - 1, 3, 3, color);
      if (shape === 'star') { box(ctx, cursor + 2, mid - 2, 1, 5, color); box(ctx, cursor, mid, 5, 1, color); }
    }
    label(ctx, text, cursor + 7, y, span - 7, PAL.ui.dim);
    cursor += span;
  }
}

/**
 * model follows the shared grid contract; rows accept bits, scale, codes, mode,
 * zero, view, ghosts, salient (Boolean channel mask) and bracket as additions.
 * Metadata: cost (declared toy bytes), fidelity, fidelityLabel, title, caption,
 * breathing, reducedMotion. Hidden data never supplies a fidelity or value shape.
 * opts: title/caption, compact, showStats/showLegend/showCodes/showError,
 * independentRows (default true for multiple rows), reduced/reducedMotion.
 * Narrow surfaces keep the level lines and select readable code labels rather
 * than piling overlapping text over the signal. Every draw stays inside rect.
 */
export function drawGridPanel(ctx, rect, model, t = 0, opts = {}) {
  const w = Math.floor(rect.w), h = Math.floor(rect.h);
  if (w <= 0 || h <= 0) return;
  const target = surface(w, h), paint = target.ctx;
  paint.clearRect(0, 0, w, h);
  box(paint, 0, 0, w, h, PAL.ui.shadow);
  if (w > 6 && h > 6) drawWindow(paint, 1, 1, w - 3, h - 3, 'glass', 0);
  const rows = model.rows ?? EMPTY;
  if (!rows.length || w < 18 || h < 18) {
    ctx.drawImage(target.canvas, Math.round(rect.x), Math.round(rect.y));
    return;
  }
  const infos = rows.map(rowInfo), first = infos[clamp(model.activeRow ?? 0, 0, infos.length - 1)];
  const pad = w < 100 ? 3 : 5, innerW = w - pad * 2;
  const smallH = FONT_METRICS.small.lineHeight;
  const hidden = !!model.hidden, reduced = !!(opts.reduced ?? opts.reducedMotion ?? model.reducedMotion);
  const heading = h >= 52 && w >= 76;
  const stats = opts.showStats !== false && h >= 62 && w >= 92;
  const legend = opts.showLegend !== false && !opts.compact && h >= 104 && w >= 150;
  const meter = h >= 58 && w >= 94 && (hidden || Number.isFinite(model.fidelity));
  const allNarrow = infos.every((info) => !info.affine);
  const defaultCaption = allNarrow ? 'Narrow grid: one negative code unused.' : `Zero is exact: code ${first.zero}. All codes used.`;
  const caption = opts.caption ?? model.caption ?? defaultCaption;
  const captionLines = caption && h >= 86 ? wrapText(caption, innerW, 'small').slice(0, h >= 138 ? 2 : 1) : EMPTY;
  const footerH = (meter ? smallH + 3 : 0) + (legend ? smallH + 1 : 0) + captionLines.length * smallH;
  let top = pad;
  if (heading) {
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) box(paint, pad + x * 2, pad + 1 + y * 2, 1, 1, x + y < 3 ? PAL.teal[7] : PAL.teal[3]);
    const cost = Number.isFinite(model.cost) ? `${number(model.cost)}B TOY` : '';
    const costWidth = cost ? measureText(cost, 'small') + 6 : 0;
    if (costWidth && innerW > costWidth + 33) {
      box(paint, w - pad - costWidth, pad - 1, costWidth, smallH + 1, PAL.water[1]);
      label(paint, cost, w - pad - 3, pad, costWidth - 4, PAL.water[8], 'right');
    }
    const title = opts.title ?? model.title ?? (rows.length > 1 ? 'Quantization grids' : rows[0].label ?? 'Quantization');
    label(paint, title, pad + 9, pad, innerW - 12 - costWidth, PAL.ui.text);
    top += smallH + 3;
  }
  if (stats && rows.length === 1) {
    label(paint, metadata(first, innerW), pad, top, innerW, PAL.water[8]);
    top += smallH + 2;
  }
  const plotHeight = Math.max(1, h - pad - footerH - top - 2);
  for (let i = 0; i < rows.length; i++) {
    const left = pad + Math.floor(i * innerW / rows.length);
    const right = pad + Math.floor((i + 1) * innerW / rows.length);
    drawRow(paint, { x: left, y: top, w: Math.max(1, right - left - (i < rows.length - 1 ? 2 : 0)), h: plotHeight }, rows[i], infos[i], model, i, t, {
      hidden, reduced, smallH, independent: opts.independentRows ?? rows.length > 1,
      multi: rows.length > 1, stats, showCodes: opts.showCodes, showError: opts.showError,
    });
  }
  let footerY = h - pad - footerH;
  if (meter) {
    const amount = hidden ? 0 : clamp(model.fidelity, 0, 1);
    const live = model.breathing ?? ((model.snap ?? 0) === 0);
    const meterTitle = hidden ? 'Fidelity ?' : `${model.fidelityLabel ?? (live ? 'Live' : 'Fidelity')} ${Math.round(amount * 100)}%`;
    const textWidth = Math.min(Math.floor(innerW * 0.6), measureText(meterTitle, 'small'));
    const color = amount >= 0.985 ? PAL.gold[6] : amount >= 0.75 ? PAL.teal[7] : amount >= 0.6 ? PAL.gold[5] : PAL.ui.error;
    label(paint, meterTitle, pad, footerY, textWidth, hidden ? PAL.water[7] : color);
    const barX = pad + textWidth + 5, barW = Math.max(1, w - pad - barX);
    const barY = footerY + Math.max(1, Math.floor((smallH - 5) / 2));
    drawBar(paint, barX, barY, barW, 5, amount, 1, { fill: color, back: PAL.night[0] });
    if (hidden) {
      for (let x = barX + 1; x < barX + barW; x += 4) box(paint, x, barY + 1, 1, 3, PAL.water[3]);
    } else {
      box(paint, barX + Math.round((barW - 1) * 0.6), barY + 4, 1, 1, PAL.cream[2]);
      if (amount > 0) box(paint, barX, barY, Math.max(1, Math.round(barW * amount)), 1, amount >= 0.985 ? PAL.gold[8] : PAL.teal[8]);
    }
    footerY += smallH + 3;
  }
  if (legend) { drawLegend(paint, pad, footerY, innerW, model, rows); footerY += smallH + 1; }
  for (const text of captionLines) {
    label(paint, text, pad, footerY, innerW, PAL.ui.faint);
    footerY += smallH;
  }
  box(paint, 2, 2, 2, 1, PAL.water[7]);
  box(paint, w - 5, h - 4, 2, 1, PAL.night[5]);
  ctx.drawImage(target.canvas, Math.round(rect.x), Math.round(rect.y));
}

function demoRow(values, params, labelText, extras = {}) {
  return { values, ...quantizeVector(values, params), levels: levelsOf(params), lo: params.min, hi: params.max,
    bits: params.bits, scale: params.scale, mode: params.mode, zero: params.zero, label: labelText, ...extras };
}

function demoModel(rows, title, caption, cost, extra = {}) {
  const reference = rows.flatMap((row) => row.values), reconstructed = rows.flatMap((row) => row.recon);
  return { rows, title, caption, cost, fidelity: fidelity(reference, reconstructed), showCodes: true, showError: true, snap: 0, ...extra };
}

function packet(count, bits, affine = false, groups = 1, spotlight = 0) {
  return packetBytes({ count, bits, affine, groups, spotlight }).total;
}

function makeDemos(id) {
  const wave = Array.from({ length: 16 }, (_, i) => 0.78 * Math.sin(i * 0.44 - 0.9) + 0.16 * Math.cos(i * 1.17));
  if (id === 'bits') return [2, 3, 4].map((bits) => demoModel(
    [demoRow(wave, symmetricParams(1, bits), 'Same wave')], `Bit Dial · ${bits} bit`,
    `Same wave. ${2 ** bits - 1} levels; ${-(2 ** (bits - 1))} unused.`, packet(16, bits), { view: { min: -1.15, max: 1.15 } },
  ));
  if (id === 'zero') {
    const values = [-0.14, -0.1, -0.06, 0, 0.035, 0.07, 0.1, 0.14, 0.23, 0.3, 0.42, 0.57, 0.64, 0.8, 0.9, 1];
    return [false, true].map((on) => demoModel(
      [demoRow(values, on ? affineParams(-0.18, 1.08, 3) : symmetricParams(1.08, 3), 'Lopsided wave')], `Zero-Shift ${on ? 'ON' : 'OFF'}`,
      on ? 'Zero = code 1. All 8 codes work.' : 'Empty negative space wastes levels.', packet(16, 3, on), { view: { min: -1.2, max: 1.2 } },
    ));
  }
  if (id === 'calib') {
    const values = [0.08, 0.24, 0.37, 0.16, -0.22, -1.72, -0.33, 0.1, 0.31, 0.49, 1.86, 0.26, -0.13, -0.43, -0.2, 0.14];
    const ghosts = [0.12, 0.32, 0.4, 0.1, -0.27, -1.62, -0.42, 0.03, 0.22, 0.36, 1.72, 0.19, -0.05, -0.38, -0.14, 0.09];
    return [0, 1, 2, 3].map((stage) => demoModel(
      [demoRow(values, symmetricParams(stage < 2 ? 0.55 : 2, 3), 'Storm wave')],
      ['Archive · tight range', 'Reveal · clipped tails', 'Archive · storm range', 'Reveal · tails covered'][stage],
      ['Past waves warn of storm tails.', 'Orange tails hit the range edges.', 'Use the archive, not the hidden live wave.', 'Wider range trades detail for coverage.'][stage],
      packet(16, 3), { ghosts, hidden: stage % 2 === 0, view: { min: -2.2, max: 2.2 } },
    ));
  }
  if (id === 'groups') {
    const shape = [-0.81, -0.46, -0.07, 0.25, 0.83, 0.55, 0.1, -0.32], magnitudes = [3, 0.4, 0.05];
    return [false, true].map((on) => demoModel(
      magnitudes.map((magnitude, i) => demoRow(shape.map((v) => v * magnitude), symmetricParams(on ? magnitude : 3, 3), ['Loud', 'Soft', 'Whisper'][i])),
      on ? 'Group Rulers · ON' : 'One shared ruler', on ? '+2B per ruler saves quiet threads.' : 'A large shared step erases quiet threads.', packet(24, 3, false, on ? 3 : 1),
    ));
  }
  if (id === 'spotlight') {
    const weights = [-0.7, 0.4, -0.18, 0.11, 0.25, -0.33, 0.72, -0.41, 0.55, 0.13, -0.21, 0.64, -0.12, 0.48, -0.59, 0.32];
    const inputs = [0, 1, 2].map((token) => weights.map((_, i) => i === 3 ? [8, 0, 7][token] : i === 12 ? [0, 8, -6][token] : 0.04 * Math.sin(i + token)));
    const reference = inputs.map((input) => dot(input, weights));
    return [false, true].map((on) => {
      const protectedValues = weights.map((_, i) => on && (i === 3 || i === 12));
      const row = demoRow(weights, symmetricParams(0.8, 3), 'Weights', { protected: protectedValues, salient: weights.map((_, i) => i === 3 || i === 12) });
      for (let i = 0; i < weights.length; i++) if (protectedValues[i]) { row.recon[i] = weights[i]; row.clipped[i] = false; }
      const reconstructed = inputs.map((input) => dot(input, row.recon));
      return demoModel([row], `Spotlight ${on ? 'ON' : 'OFF'}`, on ? 'Gold stays exact. +3B per hot weight.' : 'Hot inputs amplify small weight errors.', packet(16, 3, false, 1, on ? 2 : 0), {
        reference, reconstructed, fidelity: fidelity(reference, reconstructed), fidelityLabel: 'Output', view: { min: -0.94, max: 0.94 },
      });
    });
  }
  if (id === 'balance') {
    const activations = [0.3, 0.8, -0.6, 20, 0.7, -0.9, 0.4, 0.5, -0.8, 0.3, 0.6, -0.7];
    const weights = [0.4, 0.35, -0.6, 0.02, -0.45, 0.6, 0.7, -0.5, 0.4, -0.3, 0.55, 0.8];
    const reference = activations.map((value, i) => value * weights[i]);
    return [false, true].map((on) => {
      const factors = activations.map((value, i) => on ? Math.sqrt(Math.abs(value) / Math.abs(weights[i])) : 1);
      const a = activations.map((value, i) => value / factors[i]), w = weights.map((value, i) => value * factors[i]);
      const rows = [demoRow(a, symmetricParams(Math.max(...a.map(Math.abs)), 4), 'Activations'), demoRow(w, symmetricParams(Math.max(...w.map(Math.abs)), 4), 'Weights')];
      const reconstructed = rows[0].recon.map((value, i) => value * rows[1].recon[i]);
      return demoModel(rows, on ? 'Balance · a/s and w×s' : 'Unbalanced · one outlier', on ? 'Same products before rounding. Factors: 0B.' : 'One huge activation crushes small values.', packet(12, 4) * 2, {
        reference, reconstructed, fidelity: fidelity(reference, reconstructed), fidelityLabel: 'Product',
      });
    });
  }
  if (id === 'budget') {
    const shape = [-0.92, -0.62, -0.23, 0.16, 0.46, 0.83, 0.57, 0.12], sensitivities = [3, 1, 0.4];
    return [false, true].map((on) => {
      const bits = on ? [4, 3, 2] : [3, 3, 3];
      const rows = bits.map((bit, i) => demoRow(shape.map((v) => v * [1, 0.9, 0.8][i]), symmetricParams([1, 0.9, 0.8][i], bit), ['Focus ×3', 'Voice ×1', 'Echo ×.4'][i]));
      const reference = rows.flatMap((row, i) => row.values.map((v) => v * sensitivities[i]));
      const reconstructed = rows.flatMap((row, i) => row.recon.map((v) => v * sensitivities[i]));
      return demoModel(rows, on ? 'Bit Budget · 4 / 3 / 2' : 'Equal budget · 3 / 3 / 3', on ? 'Same 15B. More bits where errors matter.' : 'Heads have different error sensitivities.', bits.reduce((sum, bit) => sum + packet(8, bit), 0), {
        reference, reconstructed, fidelity: fidelity(reference, reconstructed), fidelityLabel: 'Weighted',
      });
    });
  }
  return makeDemos('bits');
}

/** The values are fixed across each comparison; only the named technique changes.
 * A fifth, optional {reduced:true} argument removes travel, not lesson timing. */
export function drawLessonDiagram(ctx, rect, lessonId, t = 0, opts = {}) {
  let states = DEMOS.get(lessonId);
  if (!states) { states = makeDemos(lessonId); DEMOS.set(lessonId, states); }
  const duration = lessonId === 'calib' ? 3.2 : 3;
  const clock = Math.max(0, t), state = Math.floor(clock / duration) % states.length;
  const phase = (clock % duration) / duration;
  const snap = clamp((phase - 0.2) / 0.43, 0, 1);
  const model = states[state];
  model.snap = model.hidden ? 0 : snap;
  model.breathing = false;
  drawGridPanel(ctx, rect, model, t, opts);
}

function gridGallery(ctx, screen, t, page = 0) {
  const index = ((page % 9) + 9) % 9;
  const margin = 8, width = screen.w - margin * 2;
  label(ctx, index < 7 ? `GRID LAB · ${LESSON_IDS[index]}` : index === 7 ? 'GRID LAB · breathing range' : 'GRID LAB · fine precision', margin, 7, width, PAL.ui.gold);
  const portrait = screen.h > screen.w;
  const mainRect = { x: margin, y: 22, w: portrait ? width : Math.min(230, width), h: portrait ? 140 : 115 };
  if (index < 7) drawLessonDiagram(ctx, mainRect, LESSON_IDS[index], t);
  else {
    const values = Array.from({ length: 16 }, (_, i) => Math.sin(i * 0.45 - 0.7) * 0.95);
    const range = index === 7 ? 0.4 + (0.5 - Math.cos(t * Math.PI) * 0.5) * 0.9 : 1;
    const bits = index === 7 ? 3 : 8;
    const model = demoModel([demoRow(values, symmetricParams(range, bits), 'Live range')], index === 7 ? 'Lock the golden bracket' : '8 bit · 255 levels', index === 7 ? 'Tight clips. Wide wastes detail.' : 'Fine hatch; the -128 code is unused.', packet(16, bits), {
      view: { min: -1.5, max: 1.5 }, bracket: { lo: -range, hi: range }, breathing: true,
    });
    model.snap = index === 7 ? 0 : clamp((t % 3 - 0.5) / 1.3, 0, 1);
    drawGridPanel(ctx, mainRect, model, t);
  }
  const miniRect = portrait
    ? { x: margin, y: 174, w: width, h: Math.min(100, screen.h - 196) }
    : { x: mainRect.x + mainRect.w + 7, y: 22, w: width - mainRect.w - 7, h: 115 };
  if (miniRect.w >= 70 && miniRect.h >= 40) drawLessonDiagram(ctx, miniRect, index < 7 ? LESSON_IDS[index] : 'bits', t + 1.1, { compact: true });
  const noteY = portrait ? miniRect.y + miniRect.h + 8 : 149;
  const notes = ['← / →  seven lessons + range + 8 bit', 'Ivory: true. Teal: snapped. Red: error.', 'Orange: clipped. Gold: protected.', 'Bytes and fidelity: declared toy rules.'];
  for (let i = 0; i < notes.length && noteY + (i + 1) * FONT_METRICS.small.lineHeight < screen.h - 14; i++) {
    label(ctx, notes[i], margin, noteY + i * FONT_METRICS.small.lineHeight, width, PAL.ui.dim);
  }
}

export const galleries = { grid: gridGallery };
