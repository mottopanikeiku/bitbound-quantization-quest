// Free quantization instruments. Only Meadow wants a flat reconstruction;
// later crossings preserve banks, tides, scales, pressure, products or precision.
import { symmetricParams, affineParams, quantizeVector, levelsOf, packetBytes } from '../quantization.js';
import { ZONES, TECHNIQUES, BIT_CHOICES } from '../content/game-data.js';
import { clamp, lerp } from '../engine/util.js';
import { drawGridPanel } from '../battle/gridviz.js';
import { drawWindow, drawBar } from '../ui/kit.js';
import { drawText, wrapText, FONT_METRICS } from '../engine/font.js';
import { PAL } from '../art/palette.js';

const RULERS = [1, 1 / 8, 1 / 64];
const RULER_NAMES = ['big', 'medium', 'tiny'];
const FACTORS = [1, 2, 4, 8, 16];
const ROW_NAMES = ['Fine', 'Middle', 'Coarse'];
const EPSILON = 1e-9;
const number = (value) => Number(value.toFixed(3)).toString();
const percent = (value) => `${Math.round(value * 100)}%`;
const maximum = (values) => Math.max(...values.map(Math.abs));
const maxError = (values, recon) => Math.max(...values.map((value, i) => Math.abs(value - recon[i])));

export const breathing = (seconds, period = 1.9) => 0.5 - 0.5 * Math.cos((2 * Math.PI * seconds) / period);
export const puzzleRange = (puzzle, p) => puzzle.amax * lerp(0.35, 1.45, clamp(p));

export const PUZZLES = [
  {
    id: 'bridge-0', zone: 0, name: 'Almost-Level Crossing',
    values: [0.59, 0.68, 0.76, 0.84],
    goal: 'Make all four heights share one level, without clipping.',
    hint: 'Try 2 bits. Cover the tallest stone; roomy buckets can bring neighbours together.',
    success: 'Four heights, one bucket! Lost detail made a flat walkway.',
    witness: { bits: 2, p: 0.7 },
  },
  {
    id: 'bridge-1', zone: 1, name: 'Two Different Banks', defaultBits: 2,
    values: [0.88, 0.96, 1.72, 1.88], targets: [0.9, 0.9, 1.8, 1.8], tolerance: 0.12,
    maxBits: 2, packetLimit: 4,
    goal: '2-bit banks: land at 0.9 and 1.8, within 0.12. No clipping.',
    hint: 'Move zero to code 0. Four positive-side levels can reach both banks; a mirrored 2-bit grid cannot.',
    success: 'Two banks matched! Moving zero made room for two positive rungs.',
    witness: { bits: 2, tool: true, zeroCode: 0, p: 0.95 },
  },
  {
    id: 'bridge-2', zone: 2, name: 'Yesterday’s High Tide', hiddenLive: true,
    values: [0.8, 1.55, 2.7, 3.35], idleHeights: [1.2, 1.2, 1.2, 1.2], amax: 3.6,
    archives: [
      { name: 'Calm', samples: [0.32, 0.65, 0.9, 1.2], max: 1.2 },
      { name: 'High tide', samples: [0.7, 1.45, 2.58, 3.6], max: 3.6 },
    ],
    tolerance: 0.3, packetLimit: 4,
    goal: 'Forecast: high tide. Cover hidden heights; error at most 0.3. 4B packet.',
    hint: 'Tide Gauge: select the high-tide archive, then cover its old peak. Live heights appear only after lock.',
    success: 'High tide covered! Past samples helped choose a range before seeing today.',
    witness: { bits: 4, tool: true, archive: 1, p: 0.64 },
  },
  {
    id: 'bridge-3', zone: 3, name: 'Three-Scale Staircase', defaultBits: 3,
    values: [0.046875, 0.375, 2, 3],
    groups: [[1, 2, 3], [0.125, 0.25, 0.375], [0.015625, 0.03125, 0.046875]],
    physical: [[2, 2], [1, 2], [0, 1], [0, 2]], tolerance: 0.18, packetLimit: 10,
    goal: 'Save big, medium and tiny rows. Error ≤18% of each peak; 10B packet.',
    hint: 'Use 3 bits and assign each row its own ruler. One big ruler erases tiny steps.',
    success: 'Three scales survived! Extra ruler metadata saved the tiny staircase.',
    witness: { bits: 3, tool: true, groups: [0, 1, 2], p: 0.67 },
  },
  {
    id: 'bridge-4', zone: 4, name: 'The Hot Pressure Plate', defaultBits: 2,
    values: [0.42, 0.77, 1.13, 1.61], pressures: [1, 18, 1, 1], hot: 1,
    tolerance: 1.7, maxBits: 2, packetLimit: 6,
    goal: '2 bits + one exact plate. Keep ×18 plate exact; weighted error ≤1.7.',
    hint: 'Plate 2 carries eighteen times the pressure. Spotlight that plate; the others may round.',
    success: 'The heavy plate stayed exact. Small errors on light plates were safe.',
    witness: { bits: 2, tool: true, spotlight: 1, p: 0.7 },
  },
  {
    id: 'bridge-5', zone: 5, name: 'The Coupled Crossing',
    values: [1, 1, 2, 3], inputs: [16, 1, 2, 3], weights: [0.0625, 1, 1, 1],
    tolerance: 0.2, packetLimit: 8,
    goal: 'Keep products 1, 1, 2, 3 within 20%. Round inputs AND weights; 8B.',
    hint: 'Divide input 1 by 8 and multiply its weight by 8. Products stay unchanged before rounding.',
    success: 'Products preserved! Opposite rescaling shared the rounding difficulty.',
    witness: { bits: 4, tool: true, factor: 8, p: 0.74 },
  },
  {
    id: 'bridge-6', zone: 6, name: 'The Last Bit Packet',
    values: [0.125, 0.32, 0.42, 1],
    heads: [
      [-1, -0.73, -0.42, -0.16, 0.16, 0.42, 0.73, 1],
      [-0.5, -0.32, -0.18, 0, 0, 0.18, 0.32, 0.5],
      [-0.125, -0.12, -0.11, 0, 0, 0.11, 0.12, 0.125],
    ],
    physical: [[2, 7], [1, 6], [0, 5], [0, 7]], tolerances: [0.1, 0.09, 0.04], packetLimit: 15,
    goal: '15B total. Fine / middle / coarse errors ≤0.1 / 0.09 / 0.04.',
    hint: 'Try 4 / 3 / 2 bits. The fine row needs detail; the coarse row can lend it space.',
    success: 'One packet, unequal precision! Spare coarse bits paid for the fine row.',
    witness: { tool: true, budget: [4, 3, 2], p: 0.66 },
  },
].map((definition) => {
  const puzzle = { defaultBits: 4, defaultP: 0.5, period: 2.4, amax: maximum(definition.values), ...definition };
  // Four canonical successful numeric heights, in ordered BRIDGES.cells units.
  // The world may normalize these for a restrained visual staircase after reload.
  return Object.freeze({ ...puzzle, settledHeights: evaluatePuzzle(puzzle, puzzle.witness).recon });
});

function row(values, params, label, base, kept = -1) {
  const result = quantizeVector(values, params);
  const protectedValues = values.map((_, i) => i === kept);
  if (kept >= 0) {
    result.recon[kept] = values[kept]; // The declared toy stores this value exactly.
    result.clipped[kept] = false;
  }
  return {
    values, recon: result.recon, codes: result.codes, clipped: result.clipped, protected: protectedValues,
    levels: levelsOf(params), lo: params.min, hi: params.max, params, label,
    view: { min: -base * 1.6, max: base * 1.6 },
  };
}

function calibration(puzzle, { tool = false, archive = 0 } = {}) {
  return puzzle.archives[tool ? archive : 0];
}

function chosenRange(puzzle, options) {
  if (options.range !== undefined) return options.range;
  const p = options.p ?? puzzle.defaultP;
  // Calibration changes the measured envelope, not the live data or its score.
  const base = puzzle.hiddenLive ? calibration(puzzle, options).max : puzzle.amax;
  return puzzleRange({ amax: base }, p);
}

function totalPackets(packets) {
  const total = { payload: 0, scales: 0, zeros: 0, spotlight: 0, total: 0 };
  for (const packet of packets) for (const key of Object.keys(total)) total[key] += packet[key];
  return total;
}

/** Real core arithmetic. recon always contains FOUR physical heights, not every math row.
 * Packet sizes are constraints on a toy layout; neither evaluation nor the UI spends bytes.
 * groups assigns big/medium/tiny ruler indices; budget assigns actual per-row bit widths.
 */
export function evaluatePuzzle(puzzle, options = {}) {
  const bits = options.bits ?? puzzle.defaultBits;
  const tool = options.tool ?? false;
  const range = chosenRange(puzzle, options);
  const ratio = range / puzzle.amax;
  const rows = [];
  const metrics = {};
  let recon;
  let packet;
  let goalMet;
  let factors;
  let unroundedProducts;
  if (puzzle.zone === 3) {
    const assignments = options.groups ?? [0, 0, 0];
    puzzle.groups.forEach((values, index) => {
      const base = puzzle.amax * (tool ? RULERS[assignments[index]] : 1);
      rows.push(row(values, symmetricParams(base * ratio, bits), `${RULER_NAMES[index]} steps`, base));
    });
    recon = puzzle.physical.map(([r, i]) => rows[r].recon[i]);
    metrics.rowErrors = rows.map((r) => maxError(r.values, r.recon) / maximum(r.values));
    goalMet = metrics.rowErrors.every((error) => error <= puzzle.tolerance + EPSILON);
    packet = packetBytes({ count: 9, bits, groups: tool ? 3 : 1 });
  } else if (puzzle.zone === 5) {
    const factor = tool ? options.factor ?? 1 : 1;
    factors = [factor, 1, 1, 1];
    const inputs = puzzle.inputs.map((value, i) => value / factors[i]);
    const weights = puzzle.weights.map((value, i) => value * factors[i]);
    unroundedProducts = inputs.map((value, i) => value * weights[i]);
    rows.push(row(inputs, symmetricParams(maximum(inputs) * ratio, bits), `Inputs: first ÷${factor}`, maximum(inputs)));
    rows.push(row(weights, symmetricParams(maximum(weights) * ratio, bits), `Weights: first ×${factor}`, maximum(weights)));
    recon = rows[0].recon.map((value, i) => value * rows[1].recon[i]);
    metrics.productErrors = recon.map((value, i) => Math.abs(value - puzzle.values[i]) / puzzle.values[i]);
    metrics.maxProductError = Math.max(...metrics.productErrors);
    goalMet = metrics.maxProductError <= puzzle.tolerance + EPSILON;
    packet = packetBytes({ count: 8, bits, groups: 2 });
  } else if (puzzle.zone === 6) {
    const budget = tool ? options.budget ?? [3, 3, 3] : [bits, bits, bits];
    puzzle.heads.forEach((values, index) => {
      const base = maximum(values);
      rows.push(row(values, symmetricParams(base * ratio, budget[index]), `${ROW_NAMES[index]} targets`, base));
    });
    recon = puzzle.physical.map(([r, i]) => rows[r].recon[i]);
    metrics.rowErrors = rows.map((r) => maxError(r.values, r.recon));
    goalMet = metrics.rowErrors.every((error, i) => error <= puzzle.tolerances[i] + EPSILON);
    packet = totalPackets(budget.map((width) => packetBytes({ count: 8, bits: width })));
  } else {
    const shifted = puzzle.zone === 1 && tool;
    const zero = options.zeroCode ?? 1;
    const codes = 2 ** bits - 1;
    const params = shifted ? affineParams(-range * zero / codes, range * (codes - zero) / codes, bits) : symmetricParams(range, bits);
    const kept = puzzle.zone === 4 && tool ? options.spotlight ?? 0 : -1;
    const base = puzzle.hiddenLive ? calibration(puzzle, options).max : puzzle.amax;
    const r = row(puzzle.values, params, puzzle.zone === 4 ? 'Plates: ×1  ×18  ×1  ×1' : 'Stone heights', base, kept);
    if (puzzle.hiddenLive && tool) r.ghosts = calibration(puzzle, options).samples;
    rows.push(r);
    recon = r.recon;
    packet = packetBytes({ count: 4, bits, affine: shifted, spotlight: kept >= 0 ? 1 : 0 });
    if (puzzle.zone === 0) {
      goalMet = Math.max(...recon) - Math.min(...recon) < EPSILON;
    } else if (puzzle.zone === 1) {
      metrics.bankError = maxError(puzzle.targets, recon);
      goalMet = metrics.bankError <= puzzle.tolerance + EPSILON;
    } else if (puzzle.zone === 2) {
      metrics.heightError = maxError(puzzle.values, recon);
      goalMet = metrics.heightError <= puzzle.tolerance + EPSILON;
    } else {
      metrics.hotError = Math.abs(recon[puzzle.hot] - puzzle.values[puzzle.hot]);
      metrics.weightedError = recon.reduce((sum, value, i) => sum + Math.abs(value - puzzle.values[i]) * puzzle.pressures[i], 0);
      goalMet = metrics.hotError < EPSILON && metrics.weightedError <= puzzle.tolerance + EPSILON;
    }
  }
  const clippedCount = rows.reduce((count, r) => count + r.clipped.filter(Boolean).length, 0);
  const packetOK = !puzzle.packetLimit || packet.total <= puzzle.packetLimit;
  const precisionOK = !puzzle.maxBits || bits <= puzzle.maxBits;
  return {
    rows, recon, solved: goalMet && clippedCount === 0 && packetOK && precisionOK,
    goalMet, metrics, packet, packetOK, precisionOK, range, hidden: false,
    spread: Math.max(...recon) - Math.min(...recon), clippedCount, factors, unroundedProducts,
  };
}

/** Before Cove's lock, not even a success Boolean or a live-derived axis escapes.
 * Its preview depends only on settings, the public forecast and PAST samples.
 */
export function previewPuzzle(puzzle, options = {}) {
  if (!puzzle.hiddenLive) return evaluatePuzzle(puzzle, options);
  const archive = calibration(puzzle, options);
  const range = chosenRange(puzzle, options);
  const bits = options.bits ?? puzzle.defaultBits;
  const params = symmetricParams(range, bits);
  const packet = packetBytes({ count: 4, bits });
  return {
    rows: [{
      values: [], recon: [], levels: levelsOf(params), lo: params.min, hi: params.max, params,
      label: options.tool ? `${archive.name}: past samples` : 'Live tide: hidden',
      view: { min: -archive.max * 1.6, max: archive.max * 1.6 },
      ghosts: options.tool ? archive.samples : [],
    }],
    recon: null, solved: null, goalMet: null, metrics: null, clippedCount: null, spread: null,
    range, hidden: true, packet, packetOK: packet.total <= puzzle.packetLimit, precisionOK: true,
  };
}

function feedback(puzzle, result, options) {
  if (!result.precisionOK) return `This crossing has ${puzzle.maxBits}-bit sockets. Extra bits cannot fit.`;
  if (!result.packetOK) return `${result.packet.total}B exceeds ${puzzle.packetLimit}B. Move or remove precision; no bytes are spent.`;
  if (result.hidden) return options.tool ? 'Past samples only. Cover the high-tide peak; lock reveals today.' : 'Calm range only. Open the Tide Gauge to inspect past high tides.';
  if (result.solved) return puzzle.success;
  if (result.clippedCount) return `${result.clippedCount} values clipped. Widen the ruler that missed its tallest values.`;
  if (puzzle.zone === 0) return 'Different rungs. Fewer bits make roomier rounding buckets.';
  if (puzzle.zone === 1) return 'Both banks need positive rungs. Put zero at code 0; widen toward the banks.';
  if (puzzle.zone === 2) return 'Tide covered, but rounding moved a height too far. Try 4 bits and a closer range.';
  if (puzzle.zone === 3) {
    const worst = result.metrics.rowErrors.indexOf(Math.max(...result.metrics.rowErrors));
    return `${RULER_NAMES[worst]} steps lost detail. Match that row to its ruler; use 3 bits.`;
  }
  if (puzzle.zone === 4) return result.metrics.hotError >= EPSILON ? 'Plate 2 carries ×18 pressure. Keep that plate exact, not a light neighbour.' : 'The hot plate is exact. Tighten the range to reduce the other pressure errors.';
  if (puzzle.zone === 5) return 'A product changed too much. Balance input 1 down and its paired weight up.';
  return 'The fine row needs 4 bits, the middle 3. Borrow space from the coarse row.';
}

function summary(puzzle, result) {
  if (result.hidden) return `Range ±${number(result.range)} · live tide hidden`;
  if (puzzle.zone === 0) return `Height spread: ${number(result.spread)}`;
  if (puzzle.zone === 1) return `Worst bank miss: ${number(result.metrics.bankError)} / 0.12`;
  if (puzzle.zone === 2) return `Live height error: ${number(result.metrics.heightError)} / 0.3`;
  if (puzzle.zone === 3) return `Row errors: ${result.metrics.rowErrors.map(percent).join(' / ')}`;
  if (puzzle.zone === 4) return `Pressure error: ${number(result.metrics.weightedError)} / 1.7`;
  if (puzzle.zone === 5) return `Products: ${result.recon.map((v) => Number(v.toFixed(2))).join(' / ')}`;
  return `Errors: ${result.metrics.rowErrors.map((v) => Number(v.toFixed(2))).join(' / ')}`;
}

export function bridgeInputLabels(input) {
  return input?.lastDevice === 'touch' ? { confirm: 'A', cancel: 'B', steady: 'STEADY' } : { confirm: 'Enter', cancel: 'Esc', steady: 'Shift' };
}

/** Real parameter rows, shared by the keyboard and touch D-pad. */
export function puzzleControls(puzzle, settings, hasTool = true) {
  const controls = [{ id: 'bits', label: 'Bits', value: String(settings.bits), choices: BIT_CHOICES, help: puzzle.maxBits ? `These sockets accept at most ${puzzle.maxBits} bits. Compare the grids without spending bytes.` : 'More bits make finer levels, but larger toy packets.' }];
  if (puzzle.zone > 0) controls.push({ id: 'tool', label: TECHNIQUES[ZONES[puzzle.zone].technique].name, value: hasTool ? settings.tool ? 'on' : 'off' : 'locked', help: hasTool ? puzzle.hint : 'Wake this region’s Grid Stone to learn the instrument.' });
  if (settings.tool && hasTool) {
    if (puzzle.zone === 1) controls.push({ id: 'zeroCode', label: 'Zero code', value: String(settings.zeroCode), choices: [0, 1, 2, 3], help: 'Code 0 leaves every other code for positive heights.' });
    if (puzzle.zone === 2) controls.push({ id: 'archive', label: 'Archive', value: puzzle.archives[settings.archive].name, choices: [0, 1], help: `Past: ${puzzle.archives[settings.archive].samples.map(number).join(' / ')}. Forecast: high tide.` });
    if (puzzle.zone === 3) settings.groups.forEach((ruler, i) => controls.push({ id: `group-${i}`, label: `${RULER_NAMES[i]} row`, value: RULER_NAMES[ruler], choices: [0, 1, 2], row: i, help: 'Assign big / medium / tiny rulers to matching rows. Each scale costs 2B.' }));
    if (puzzle.zone === 4) controls.push({ id: 'spotlight', label: 'Keep plate', value: `${settings.spotlight + 1} (×${puzzle.pressures[settings.spotlight]})`, choices: [0, 1, 2, 3], help: 'Pick the ×18 plate. Its exact value plus index occupies 3B in this toy.' });
    if (puzzle.zone === 5) controls.push({ id: 'factor', label: 'Balance factor', value: `×${settings.factor}`, choices: FACTORS, help: 'Input 1 ÷ factor; weight 1 × factor. Their unrounded product stays 1.' });
    if (puzzle.zone === 6) settings.budget.forEach((bits, i) => controls.push({ id: `budget-${i}`, label: ROW_NAMES[i], value: `${bits} bits`, choices: BIT_CHOICES, row: i, help: `${ROW_NAMES[i]} row: error at most ${puzzle.tolerances[i]}. All three row packets must fit 15B.` }));
  }
  const rowCount = puzzle.zone === 3 || puzzle.zone === 6 ? 3 : puzzle.zone === 5 ? 2 : 1;
  if (rowCount > 1) controls.push({ id: 'activeRow', label: 'Inspect row', value: `${settings.activeRow + 1} / ${rowCount}`, choices: Array.from({ length: rowCount }, (_, i) => i), help: 'Inspect a full-size row here. During lock or result, left/right also changes rows.' });
  return controls;
}

/** Native-pixel layout: one expanded plot, not three unreadable phone miniatures. */
export function puzzleLayout(screen, puzzle) {
  const portrait = screen.portrait ?? screen.w < 300;
  const window = { x: 6, y: 6, w: screen.w - 12, h: screen.h - 12 };
  const innerX = window.x + 9, innerW = window.w - 18;
  const goalY = window.y + 34;
  const contentY = goalY + wrapText(puzzle.goal, innerW, 'body').length * FONT_METRICS.body.lineHeight + 5;
  const footerY = window.y + window.h - 30;
  const feedbackH = portrait ? 55 : 33;
  const feedbackY = footerY - feedbackH - 5;
  const contentH = feedbackY - contentY - 5;
  const controls = { x: innerX, y: contentY, w: portrait ? innerW : 138, h: portrait ? 64 : contentH };
  const grid = portrait
    ? { x: innerX, y: contentY + controls.h + 4, w: innerW, h: contentH - controls.h - 4 }
    : { x: innerX + 144, y: contentY, w: innerW - 144, h: contentH };
  return { portrait, window, innerX, innerW, goalY, controls, grid, feedbackY, feedbackH, footerY };
}

function textLines(ctx, text, x, y, width, color = PAL.ui.dim) {
  const lines = wrapText(text, width, 'body');
  for (let i = 0; i < lines.length; i++) drawText(ctx, lines[i], x, y + i * FONT_METRICS.body.lineHeight, { color });
  return lines.length * FONT_METRICS.body.lineHeight;
}

export class SnapBridge {
  constructor(game, puzzle, { onSolve, onClose } = {}) {
    this.game = game;
    this.puzzle = puzzle;
    this.onSolve = onSolve;
    this.onClose = onClose;
    this.bits = puzzle.defaultBits;
    this.tool = false;
    this.zeroCode = 1;
    this.archive = 0;
    this.groups = [0, 0, 0];
    this.spotlight = 0;
    this.factor = 1;
    this.budget = [3, 3, 3];
    this.activeRow = 0;
    this.selected = 0;
    this.phase = 'choose';
    this.clock = puzzle.period / 4;
    this.snapTime = 0;
    this.active = true;
    this.result = this.preview();
    const keys = bridgeInputLabels(game.input);
    game.announce(`${puzzle.name}. ${puzzle.goal} Up/down selects a setting; left/right changes it. ${keys.confirm} starts the range. No bytes spent.`);
  }

  get p() { return breathing(this.clock, this.puzzle.period); }
  get hasTool() { return this.game.state.techniques.includes(ZONES[this.puzzle.zone].technique); }
  settings(p = this.p) {
    return { bits: this.bits, p, tool: this.tool, zeroCode: this.zeroCode, archive: this.archive, groups: this.groups, spotlight: this.spotlight, factor: this.factor, budget: this.budget, activeRow: this.activeRow };
  }
  controls() { return puzzleControls(this.puzzle, this.settings(), this.hasTool); }
  preview() { return previewPuzzle(this.puzzle, this.settings()); }

  adjust(control, delta) {
    if (control.id === 'tool') {
      if (this.hasTool) this.tool = !this.tool;
    } else {
      const split = control.id.split('-');
      const array = split[0] === 'group' ? this.groups : split[0] === 'budget' ? this.budget : null;
      const current = array ? array[Number(split[1])] : this[control.id];
      const next = control.choices[(control.choices.indexOf(current) + delta + control.choices.length) % control.choices.length];
      if (array) array[Number(split[1])] = next;
      else this[control.id] = next;
    }
    if (control.row !== undefined) this.activeRow = control.row;
    this.game.audio.play('menu-move');
  }

  update(dt, input) {
    if (!this.active) return;
    if (input.pressed('cancel')) {
      input.consume('cancel');
      input.consume('pause'); // Escape closes this modal; it must not open Pause too.
      this.close();
      return;
    }
    if (this.phase === 'choose') {
      const controls = this.controls();
      const vertical = (input.repeat('down') ? 1 : 0) - (input.repeat('up') ? 1 : 0);
      if (vertical) {
        this.selected = (this.selected + vertical + controls.length) % controls.length;
        if (controls[this.selected].row !== undefined) this.activeRow = controls[this.selected].row;
        this.game.audio.play('menu-move');
      }
      const delta = (input.repeat('right') ? 1 : 0) - (input.repeat('left') ? 1 : 0);
      if (delta) this.adjust(controls[this.selected], delta);
      this.result = this.preview();
      if (input.pressed('confirm')) {
        input.consume('confirm');
        this.phase = 'breathe';
        this.clock = this.puzzle.period / 4;
        this.game.audio.play('scan');
        const keys = bridgeInputLabels(input);
        this.game.announce(`${keys.confirm} locks; ${keys.steady} steadies. ${this.puzzle.hiddenLive ? 'Live tide stays hidden until lock.' : this.puzzle.goal}`);
      }
      return;
    }
    const direction = (input.repeat('right') ? 1 : 0) - (input.repeat('left') ? 1 : 0);
    if (direction) this.activeRow = (this.activeRow + direction + this.result.rows.length) % this.result.rows.length;
    if (this.phase === 'breathe') {
      const speed = input.held('run') ? 0.5 : 1;
      this.clock += dt * speed;
      this.result = this.preview();
      if (input.pressed('confirm')) {
        const delay = clamp((performance.now() - input.pressTime('confirm')) / 1000, 0, dt);
        const p = breathing(this.clock - delay * speed, this.puzzle.period);
        this.result = evaluatePuzzle(this.puzzle, this.settings(p));
        input.consume('confirm');
        this.phase = 'snap';
        this.snapTime = 0;
        this.game.audio.play('lock');
        this.game.audio.snapNotes?.(this.result.recon.map((value) => clamp(value / (this.puzzle.amax * 1.5))), { bits: this.bits, gap: 0.09 });
      }
      return;
    }
    if (this.phase === 'snap') {
      this.snapTime += dt;
      if (this.snapTime >= 0.65) {
        this.phase = 'result';
        if (this.result.solved) {
          this.game.solvePuzzle(this.puzzle.id);
          this.onSolve?.(this.result);
        } else this.game.audio.play(this.result.clippedCount ? 'clip' : 'fizzle');
        this.game.announce(`${feedback(this.puzzle, this.result, this.settings())} ${summary(this.puzzle, this.result)}`);
      }
      return;
    }
    if (input.pressed('confirm')) {
      input.consume('confirm');
      if (this.result.solved) this.close();
      else {
        this.phase = 'choose';
        this.clock = this.puzzle.period / 4;
        this.result = this.preview();
      }
    }
  }

  close() {
    if (!this.active) return;
    this.active = false;
    this.game.audio.play('menu-back');
    this.onClose?.();
  }

  presentation() {
    const result = this.result;
    const controls = this.controls();
    const keys = bridgeInputLabels(this.game.input);
    const message = this.phase === 'choose' ? controls[this.selected].help : feedback(this.puzzle, result, this.settings());
    const footer = this.phase === 'choose' ? ['↑↓ select · ←→ change', `${keys.confirm} breathe · ${keys.cancel} close`]
      : this.phase === 'breathe' ? [`${keys.confirm} lock · ${keys.steady} steady`, `${keys.cancel} close · ←→ inspect`]
        : this.phase === 'snap' ? ['Snapping… no byte spend', `${keys.cancel} close`]
          : [`${keys.confirm} ${result.solved ? 'cross' : 'retry'} · ${keys.cancel} close`, '←→ inspect snapped rows'];
    return {
      controls, message, summary: summary(this.puzzle, result), footer,
      cue: result.hidden ? 'neutral' : result.solved ? 'ready' : this.phase === 'result' ? 'miss' : 'neutral',
      packet: this.puzzle.packetLimit ? `${result.packet.total}/${this.puzzle.packetLimit}B packet` : `${result.packet.total}B layout`,
    };
  }

  describe() {
    const view = this.presentation();
    const control = view.controls[this.selected];
    return `Snap Bridge ${this.puzzle.id}. ${this.phase}. ${this.bits} bits. ${view.packet}. ${this.phase === 'choose' ? `${control.label}: ${control.value}. ` : ''}${view.summary}. ${view.message}`;
  }

  draw(ctx, screen, t) {
    const layout = puzzleLayout(screen, this.puzzle);
    const { window: frame, innerX, innerW, controls: menu, grid } = layout;
    const view = this.presentation();
    const result = this.result;
    const color = view.cue === 'ready' ? PAL.ui.good : view.cue === 'miss' ? PAL.ui.warn : PAL.ui.text;
    drawWindow(ctx, frame.x, frame.y, frame.w, frame.h, 'gold', t);
    drawText(ctx, 'SNAP BRIDGE', innerX, frame.y + 8, { font: 'small', color: PAL.ui.gold });
    drawText(ctx, 'NO BYTE SPEND', innerX + innerW, frame.y + 8, { font: 'small', align: 'right', color: PAL.ui.dim });
    drawText(ctx, this.puzzle.name, innerX, frame.y + 20, { color: PAL.ui.text });
    textLines(ctx, this.puzzle.goal, innerX, layout.goalY, innerW, PAL.ui.text);
    drawText(ctx, `${this.selected + 1}/${view.controls.length} · ${view.packet}`, menu.x, menu.y, { font: 'small', color: result.packetOK ? PAL.ui.dim : PAL.ui.warn });
    const start = Math.min(Math.max(0, this.selected - 1), Math.max(0, view.controls.length - 3));
    for (let i = start; i < Math.min(start + 3, view.controls.length); i++) {
      const control = view.controls[i];
      const selected = i === this.selected;
      const y = menu.y + 12 + (i - start) * 16;
      if (selected) {
        ctx.fillStyle = PAL.night[3];
        ctx.fillRect(menu.x - 2, y - 2, menu.w + 2, 13);
      }
      drawText(ctx, `${selected ? '▶ ' : ''}${control.label}: ${control.value}`, menu.x, y, { color: selected ? PAL.ui.gold : PAL.ui.dim });
    }
    if (this.phase === 'breathe') drawBar(ctx, menu.x, menu.y + menu.h - 3, menu.w, 3, this.p, 1, { fill: result.hidden ? PAL.ui.bytes : color });
    const active = result.rows[this.activeRow];
    drawGridPanel(ctx, grid, {
      rows: [active], view: active.view, hidden: result.hidden,
      title: `${this.activeRow + 1}/${result.rows.length} ${active.label}`,
      bracket: { lo: active.lo, hi: active.hi },
      snap: this.phase === 'snap' ? clamp(this.snapTime / 0.55) : this.phase === 'result' ? 1 : 0,
      showError: true, showCodes: true, reducedMotion: this.game.reducedMotion,
    }, t, { compact: true, showError: true, showCodes: true, caption: '' });
    const summaryH = textLines(ctx, view.summary, innerX, layout.feedbackY, innerW, color);
    textLines(ctx, view.message, innerX, layout.feedbackY + summaryH, innerW, PAL.ui.dim);
    for (let i = 0; i < view.footer.length; i++) drawText(ctx, view.footer[i], innerX, layout.footerY + i * FONT_METRICS.body.lineHeight, { color: PAL.ui.gold });
  }
}
