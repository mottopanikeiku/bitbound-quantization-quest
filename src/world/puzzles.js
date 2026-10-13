// Free, physical quantization experiments. A bridge rewards SAME reconstruction,
// not high fidelity: coarser buckets can be useful even though they lose detail.
import { symmetricParams, affineParams, quantizeVector, levelsOf } from '../quantization.js';
import { ZONES, TECHNIQUES, BIT_CHOICES } from '../content/game-data.js';
import { clamp, lerp } from '../engine/util.js';
import { drawGridPanel } from '../battle/gridviz.js';
import { drawWindow, drawBar } from '../ui/kit.js';
import { drawText, wrapText, FONT_METRICS } from '../engine/font.js';
import { PAL } from '../art/palette.js';

export const PUZZLES = [
  { id: 'bridge-0', zone: 0, name: 'The Almost-Level Crossing', values: [0.59, 0.68, 0.76, 0.84], hint: 'Four nearby heights can share one roomy bucket. Try 2 bits, then a range just above the tallest stone.' },
  { id: 'bridge-1', zone: 1, name: 'Chime’s Crooked Steps', values: [0.68, 0.74, 0.80, 0.88], hint: 'Zero-Shift puts all the codes on the positive side. Different bucket boundaries catch different neighbours.' },
  { id: 'bridge-2', zone: 2, name: 'Yesterday’s Tide', values: [0.78, 0.88, 0.95, 1.08], samples: [0.75, 0.91, 1.01, 1.11], hint: 'The Tide Gauge shows older heights as ghosts. Cover the tallest stone without making the steps too fine.' },
  { id: 'bridge-3', zone: 3, name: 'The Four-Thread Span', values: [0.51, 0.57, 0.62, 0.70], hint: 'Group Rulers fit each pair separately. For a flat bridge, one shared coarse ruler can be the simpler tool.' },
  { id: 'bridge-4', zone: 4, name: 'The Unequal Importance of Feet', values: [0.92, 0.99, 1.08, 1.19], hint: 'Spotlight keeps the first height exact. But a bridge wants matching heights, not one perfectly preserved footrest!' },
  { id: 'bridge-5', zone: 5, name: 'The Quiet Staircase', values: [0.64, 0.73, 0.81, 0.90], hint: 'Balance rescales then undoes that change. Here, matching heights matters more than preserving their differences.' },
  { id: 'bridge-6', zone: 6, name: 'A Small Budget for a Long Way Home', values: [0.83, 0.91, 0.97, 1.07], hint: 'Bit Budget gives the second pair finer steps. More detail is not always a better walkway. Try a shared low-bit grid.' },
].map((puzzle) => Object.freeze({ ...puzzle, defaultBits: 4, defaultP: 0.5, period: 1.9, amax: Math.max(...puzzle.values) }));

export const breathing = (seconds, period = 1.9) => 0.5 - 0.5 * Math.cos((2 * Math.PI * seconds) / period);
export const puzzleRange = (puzzle, p) => puzzle.amax * lerp(0.35, 1.45, clamp(p));

/** Pure arithmetic shared by the panel, floating stones and topology tests. */
export function evaluatePuzzle(puzzle, { bits = puzzle.defaultBits, p = puzzle.defaultP, tool = false, range = puzzleRange(puzzle, p) } = {}) {
  const technique = ZONES[puzzle.zone].technique;
  const split = tool && ['groups', 'balance', 'budget'].includes(technique);
  const chunks = split ? [puzzle.values.slice(0, 2), puzzle.values.slice(2)] : [puzzle.values];
  const rows = [];
  const physical = [];
  let clippedCount = 0;
  for (let rowIndex = 0; rowIndex < chunks.length; rowIndex++) {
    const values = chunks[rowIndex];
    const groupMax = Math.max(...values.map(Math.abs));
    // Balance is a reversible change of units: h = (h/f)*f before rounding.
    // It is deliberately NOT described as a full activation/weight simulation.
    const factor = tool && technique === 'balance' ? Math.sqrt(groupMax / puzzle.amax) : 1;
    const working = values.map((value) => value / factor);
    const rowBits = tool && technique === 'budget' && rowIndex === 1 ? BIT_CHOICES[Math.min(3, BIT_CHOICES.indexOf(bits) + 1)] : bits;
    const rowRange = tool && technique === 'groups' ? range * groupMax / puzzle.amax : range;
    const params = tool && technique === 'zero' ? affineParams(0, rowRange, rowBits) : symmetricParams(rowRange, rowBits);
    const result = quantizeVector(working, params);
    const protectedValues = values.map(() => false);
    if (tool && technique === 'spotlight') {
      result.recon[0] = working[0];
      result.clipped[0] = false;
      protectedValues[0] = true;
    }
    clippedCount += result.clipped.filter(Boolean).length;
    physical.push(...result.recon.map((value) => value * factor));
    const label = split ? `PAIR ${rowIndex + 1}${factor !== 1 ? ' / RESCALED' : ''} / 1 CODE UNUSED` : tool && technique === 'zero' ? 'STONE HEIGHTS / ALL CODES' : 'STONE HEIGHTS / 1 CODE UNUSED';
    rows.push({ values: working, recon: result.recon, clipped: result.clipped, protected: protectedValues, levels: levelsOf(params), lo: params.min, hi: params.max, label, params });
  }
  const spread = Math.max(...physical) - Math.min(...physical);
  const solved = spread < 1e-9 && clippedCount === 0;
  return { rows, recon: physical, solved, spread, clippedCount, range };
}

function textLines(ctx, text, x, y, width, color = PAL.ui.dim) {
  const lines = wrapText(text, width, 'body');
  const height = FONT_METRICS.body?.lineHeight ?? 11;
  for (let i = 0; i < lines.length; i++) drawText(ctx, lines[i], x, y + i * height, { color });
  return lines.length * height;
}

export class SnapBridge {
  constructor(game, puzzle, { onSolve, onClose } = {}) {
    this.game = game;
    this.puzzle = puzzle;
    this.onSolve = onSolve;
    this.onClose = onClose;
    this.bits = puzzle.defaultBits;
    this.tool = false;
    this.phase = 'choose';
    this.clock = puzzle.period / 4;
    this.snapTime = 0;
    this.active = true;
    this.lastDt = 0;
    this.result = this.preview();
    game.announce(`${puzzle.name}. Choose bits with left and right. Enter starts the breathing range.`);
  }

  get p() { return breathing(this.clock, this.puzzle.period); }
  preview() { return evaluatePuzzle(this.puzzle, { bits: this.bits, p: this.p, tool: this.tool }); }

  update(dt, input) {
    this.lastDt = dt;
    if (input.pressed('cancel')) {
      input.consume('cancel');
      this.close();
      return;
    }
    if (this.phase === 'choose') {
      const delta = (input.repeat('right') ? 1 : 0) - (input.repeat('left') ? 1 : 0);
      if (delta) {
        const i = (BIT_CHOICES.indexOf(this.bits) + delta + BIT_CHOICES.length) % BIT_CHOICES.length;
        this.bits = BIT_CHOICES[i];
        this.game.audio.play('menu-move');
      }
      if ((input.pressed('up') || input.pressed('down')) && this.puzzle.zone > 0 && this.game.state.techniques.includes(ZONES[this.puzzle.zone].technique)) {
        this.tool = !this.tool;
        this.game.audio.play('menu-move');
      }
      this.result = this.preview();
      if (input.pressed('confirm')) {
        input.consume('confirm');
        this.phase = 'breathe';
        this.clock = this.puzzle.period / 4;
        this.game.audio.play('scan');
        this.game.announce('Range breathing. Enter locks; Shift steadies your hands. No bytes are spent.');
      }
      return;
    }
    if (this.phase === 'breathe') {
      const speed = input.held('run') ? 0.5 : 1;
      this.clock += dt * speed;
      this.result = this.preview();
      if (input.pressed('confirm')) {
        // Account for the key event's timestamp rather than giving slow frames an advantage.
        const delay = clamp((performance.now() - input.pressTime('confirm')) / 1000, 0, dt);
        const p = breathing(this.clock - delay * speed, this.puzzle.period);
        this.result = evaluatePuzzle(this.puzzle, { bits: this.bits, p, tool: this.tool });
        input.consume('confirm');
        this.phase = 'snap';
        this.snapTime = 0;
        this.game.audio.play('lock');
        this.game.audio.snapNotes?.(this.result.recon.map((v) => clamp(v / (this.puzzle.amax * 1.5))), { bits: this.bits, gap: 0.09 });
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
          this.game.announce('One shared level! The Snap Bridge is walkable. Cross it to collect the shard.');
        } else {
          this.game.audio.play(this.result.clippedCount ? 'clip' : 'fizzle');
          this.game.announce(this.result.clippedCount ? 'A height clipped. Widen the range and try again.' : 'The stones landed on different levels. Try fewer bits or a different range.');
        }
      }
      return;
    }
    if (input.pressed('confirm')) {
      input.consume('confirm');
      if (this.result.solved) this.close();
      else {
        this.phase = 'choose';
        this.clock = this.puzzle.period / 4;
      }
    }
  }

  close() {
    this.active = false;
    this.game.audio.play('menu-back');
    this.onClose?.();
  }

  draw(ctx, screen, t) {
    const portrait = screen.w < 300;
    const x = 7;
    const width = screen.w - 14;
    const height = portrait ? Math.min(screen.h - 38, 294) : 178;
    const y = screen.h - height - 8;
    drawWindow(ctx, x, y, width, height, 'gold', t);
    drawText(ctx, 'SNAP BRIDGE', x + 10, y + 8, { color: PAL.ui.gold });
    drawText(ctx, 'FREE EXPERIMENT', x + width - 10, y + 10, { font: 'small', align: 'right', color: PAL.ui.dim });
    const helpY = y + 22;
    const titleHeight = textLines(ctx, this.puzzle.name, x + 10, helpY, width - 20, PAL.ui.text);
    const bitsY = helpY + titleHeight + 4;
    drawText(ctx, `← ${this.bits} bits →`, x + 10, bitsY, { color: PAL.ui.gold });
    const technique = ZONES[this.puzzle.zone].technique;
    const hasTool = this.puzzle.zone > 0 && this.game.state.techniques.includes(technique);
    const toolLabel = hasTool ? `↑ ${TECHNIQUES[technique].name}: ${this.tool ? 'ON' : 'off'}` : 'One shared ruler';
    drawText(ctx, toolLabel, portrait ? x + 10 : x + width - 10, portrait ? bitsY + 13 : bitsY, { align: portrait ? 'left' : 'right', font: portrait ? 'small' : 'body', color: this.tool ? PAL.ui.good : PAL.ui.dim });
    const gridY = bitsY + (portrait ? 31 : 18);
    const gridHeight = portrait ? 85 : 65;
    const result = this.phase === 'choose' || this.phase === 'breathe' ? this.preview() : this.result;
    drawGridPanel(ctx, { x: x + 8, y: gridY, w: width - 16, h: gridHeight }, {
      rows: result.rows,
      view: { min: -this.puzzle.amax * 1.6, max: this.puzzle.amax * 1.6 },
      bracket: { lo: result.rows[0].lo, hi: result.rows[0].hi },
      snap: this.phase === 'snap' ? clamp(this.snapTime / 0.55) : this.phase === 'result' ? 1 : 0,
      showError: true,
      showCodes: this.bits <= 4,
      ghosts: this.tool && technique === 'calib' ? this.puzzle.samples : undefined,
    }, t, { compact: true });
    let textY = gridY + gridHeight + 5;
    if (this.phase === 'breathe') {
      drawBar(ctx, x + 10, textY, width - 20, 4, this.p, 1, { fill: result.solved ? PAL.ui.good : PAL.ui.bytes });
      textY += 9;
      textLines(ctx, result.solved ? '*ONE LEVEL* — lock now!' : result.clippedCount ? 'Too tight: a height clips.' : 'Watch the ghosts find one shared rung.', x + 10, textY, width - 20, result.solved ? PAL.ui.good : PAL.ui.text);
    } else if (this.phase === 'result') {
      textLines(ctx, result.solved ? '*One level. A real bridge!* Cross to the shard.' : result.clippedCount ? 'Clipping is not a safe bridge. Cover every height.' : 'Different rungs! Fewer bits make wider buckets.', x + 10, textY, width - 20, result.solved ? PAL.ui.good : PAL.ui.warn);
    } else if (portrait) {
      textLines(ctx, this.puzzle.hint, x + 10, textY, width - 20);
    } else {
      drawText(ctx, 'Nearby heights + one bucket = flat walkway.', x + 10, textY, { color: PAL.ui.dim });
    }
    const footer = this.phase === 'breathe' ? 'ENTER lock · SHIFT steady · ESC back' : this.phase === 'result' ? (result.solved ? 'ENTER cross · ESC close' : 'ENTER try again · ESC back') : 'ENTER breathe · ESC back · Free';
    textLines(ctx, footer, x + 10, y + height - (portrait ? 25 : 17), width - 20, PAL.ui.gold);
  }
}
