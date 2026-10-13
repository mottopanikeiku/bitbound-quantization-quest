import test from 'node:test';
import assert from 'node:assert/strict';
import { PUZZLES, breathing, puzzleRange, evaluatePuzzle, previewPuzzle, SnapBridge, bridgeInputLabels, puzzleLayout } from '../src/world/puzzles.js';
import { symmetricParams, quantizeVector, levelsOf, packetBytes } from '../src/quantization.js';
import { BIT_CHOICES, ZONES } from '../src/content/game-data.js';
import { signText, npcDialogue } from '../src/world/content.js';
import { wrapText, measureText, FONT_METRICS } from '../src/engine/font.js';

// Independent numerical witnesses, not the definitions' embedded rendering samples.
const WITNESSES = [
  { bits: 2, p: 0.7 },
  { bits: 2, tool: true, zeroCode: 0, p: 0.95 },
  { bits: 4, tool: true, archive: 1, p: 0.64 },
  { bits: 3, tool: true, groups: [0, 1, 2], p: 0.67 },
  { bits: 2, tool: true, spotlight: 1, p: 0.7 },
  { bits: 4, tool: true, factor: 8, p: 0.74 },
  { tool: true, budget: [4, 3, 2], p: 0.66 },
];
const WINDOWS = [[0.61, 0.85], [0.91, 1], [0.56, 0.74], [0.6, 0.75], [0.6, 0.8], [0.64, 0.84], [0.6, 0.74]];
const clockAt = (p, period) => period * Math.acos(1 - 2 * p) / (2 * Math.PI);
const near = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);

function sweep(puzzle, options, predicate = (result) => !result.solved) {
  for (let step = 0; step <= 400; step++) {
    const p = step / 400;
    const result = evaluatePuzzle(puzzle, { ...options, p });
    assert.ok(predicate(result), `${puzzle.id}, ${JSON.stringify(options)}, p=${p}`);
  }
}

function harness(puzzle, techniques = ZONES.map((zone) => zone.technique)) {
  const calls = { sounds: [], notes: [], announcements: [], solved: [], onSolve: [], closed: 0 };
  const game = {
    state: { techniques, puzzles: [], hero: { hp: 40, bytes: 37, snacks: 3 } },
    reducedMotion: true, input: { lastDevice: 'keyboard' },
    audio: { play: (sound) => calls.sounds.push(sound), snapNotes: (notes) => calls.notes.push(notes) },
    announce: (text) => calls.announcements.push(text),
    solvePuzzle: (id) => { calls.solved.push(id); game.state.puzzles.push(id); },
  };
  const panel = new SnapBridge(game, puzzle, { onSolve: (result) => calls.onSolve.push(result), onClose: () => { calls.closed++; } });
  return { panel, game, calls };
}

function input(action = null, { device = 'keyboard', steady = false } = {}) {
  const consumed = new Set();
  return {
    lastDevice: device, consumed,
    pressed: (key) => key === action && !consumed.has(key),
    repeat: (key) => key === action && !consumed.has(key),
    held: (key) => key === 'run' && steady,
    consume: (key) => consumed.add(key), pressTime: () => performance.now(),
  };
}
function press(panel, action, options = {}) {
  const event = input(action, options);
  panel.game.input = event;
  panel.update(0, event);
  return event;
}
function select(panel, id, options = {}) {
  for (let moves = 0; moves < 12; moves++) {
    if (panel.controls()[panel.selected].id === id) return;
    press(panel, 'down', options);
  }
  assert.fail(`Unreachable parameter: ${id}`);
}
function lock(panel, p) {
  press(panel, 'confirm', { device: panel.game.input.lastDevice });
  assert.equal(panel.phase, 'breathe');
  panel.clock = clockAt(p, panel.puzzle.period);
  press(panel, 'confirm', { device: panel.game.input.lastDevice });
  assert.equal(panel.phase, 'snap');
  panel.update(0.65, input());
  assert.equal(panel.phase, 'result');
}

// These run on the real arithmetic core, without importing map topology or a DOM.
test('seven bridges retain four physical cells and canonical nonflat solved heights', () => {
  assert.equal(PUZZLES.length, 7);
  for (const puzzle of PUZZLES) {
    assert.equal(puzzle.id, `bridge-${puzzle.zone}`);
    assert.equal(puzzle.values.length, 4);
    assert.equal(puzzle.settledHeights.length, 4);
    assert.ok(puzzle.settledHeights.every(Number.isFinite));
    assert.equal(evaluatePuzzle(puzzle).solved, false, `${puzzle.id}: already solved by default`);
    const result = evaluatePuzzle(puzzle, WITNESSES[puzzle.zone]);
    assert.equal(result.recon.length, 4);
    assert.deepEqual(result.recon, puzzle.settledHeights);
    assert.ok(result.solved, puzzle.id);
    assert.equal(result.spread < 1e-9, puzzle.zone === 0, 'only Meadow is a flat walkway');
  }
});

test('every intended configuration has a continuous forgiving solution window', () => {
  for (const puzzle of PUZZLES) {
    const [lo, hi] = WINDOWS[puzzle.zone];
    for (let step = 0; step <= 100; step++) {
      const p = lo + (hi - lo) * step / 100;
      const result = evaluatePuzzle(puzzle, { ...WITNESSES[puzzle.zone], p });
      assert.ok(result.solved, `${puzzle.id} failed inside window at p=${p}`);
      assert.equal(result.clippedCount, 0);
      assert.ok(result.packetOK && result.precisionOK);
    }
    const steadyWindowMs = 2000 * (clockAt(hi, puzzle.period) - clockAt(lo, puzzle.period));
    assert.ok(steadyWindowMs >= 150, `${puzzle.id}: only ${steadyWindowMs} ms while steady`);
  }
});

test('the oscillator, range endpoints and explicit range arithmetic stay consistent', () => {
  near(breathing(0), 0);
  near(breathing(0.95), 1);
  near(breathing(0.475), 0.5);
  for (const puzzle of PUZZLES) {
    near(puzzleRange(puzzle, 0), puzzle.amax * 0.35);
    near(puzzleRange(puzzle, 1), puzzle.amax * 1.45);
    near(puzzleRange(puzzle, -2), puzzleRange(puzzle, 0));
    near(puzzleRange(puzzle, 3), puzzleRange(puzzle, 1));
    near(breathing(puzzle.period / 4, puzzle.period), 0.5);
    const result = evaluatePuzzle(puzzle, { ...WITNESSES[puzzle.zone], range: puzzle.amax * 1.1 });
    near(result.range, puzzle.amax * 1.1);
  }
});

test('no advanced bridge has the old 2-bit tool-off answer, even with perfect timing', () => {
  for (const puzzle of PUZZLES.slice(1)) sweep(puzzle, { bits: 2, tool: false });
});

test('strong ablation: every reachable uniform bit width fails without the technique', () => {
  for (const puzzle of PUZZLES.slice(1)) for (const bits of BIT_CHOICES) sweep(puzzle, { bits, tool: false });
});

test('turning a named toggle on is insufficient: technique parameters matter', () => {
  for (const puzzle of PUZZLES.slice(1)) for (const bits of BIT_CHOICES) sweep(puzzle, { bits, tool: true });
});

test('Zero-Shift must jointly reach two positive banks, not just make all heights equal', () => {
  const puzzle = PUZZLES[1];
  const result = evaluatePuzzle(puzzle, WITNESSES[1]);
  assert.equal(result.rows[0].params.zero, 0);
  assert.equal(result.rows[0].levels.length, 4);
  result.recon.forEach((value, i) => assert.ok(Math.abs(value - puzzle.targets[i]) <= puzzle.tolerance));
  assert.ok(result.recon[2] > result.recon[0]);
  // Any mirrored two-bit grid has only one positive level. Neither target's
  // tolerance includes zero, and their acceptable intervals do not intersect.
  assert.equal(levelsOf(symmetricParams(2, 2)).filter((value) => value > 0).length, 1);
  assert.ok(puzzle.targets[0] - puzzle.tolerance > 0);
  assert.ok(puzzle.targets[0] + puzzle.tolerance < puzzle.targets[2] - puzzle.tolerance);
  for (const zeroCode of [1, 2, 3]) sweep(puzzle, { bits: 2, tool: true, zeroCode });
});

test('Tide Gauge uses past high-tide coverage, not a hidden success bonus', () => {
  const puzzle = PUZZLES[2];
  const settings = WITNESSES[2];
  const result = evaluatePuzzle(puzzle, settings);
  near(result.range, puzzle.archives[1].max * (0.35 + 1.1 * settings.p));
  assert.deepEqual(result.rows[0].ghosts, puzzle.archives[1].samples);
  assert.notDeepEqual(puzzle.archives[1].samples, puzzle.values, 'past samples are not live answers');
  assert.ok(result.metrics.heightError <= 0.3);
  sweep(puzzle, { bits: 4, tool: true, archive: 0 });
  // Giving the oracle the SAME explicit range produces the same arithmetic with
  // the archive off. Calibration supplies information/envelope, not a score flag.
  const oracle = evaluatePuzzle(puzzle, { bits: 4, tool: false, range: result.range });
  assert.ok(oracle.solved);
  assert.deepEqual(oracle.recon, result.recon);
  assert.ok(puzzle.archives[0].max * 1.45 < Math.max(...puzzle.values), 'calm envelope cannot cover high tide');
  const { panel } = harness(puzzle);
  panel.tool = true;
  for (const archive of [0, 1]) {
    panel.archive = archive;
    const help = panel.controls().find((control) => control.id === 'archive').help;
    for (const height of puzzle.archives[archive].samples) assert.ok(help.includes(String(height)), 'past heights are readable as numbers, not only faint ghost marks');
  }
});

test('Group Rulers preserve every scale under a real metadata packet limit', () => {
  const puzzle = PUZZLES[3];
  const result = evaluatePuzzle(puzzle, WITNESSES[3]);
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows.reduce((sum, row) => sum + row.values.length, 0), 9);
  result.metrics.rowErrors.forEach((error) => assert.ok(error <= 0.18));
  assert.equal(result.packet.payload, 4);
  assert.equal(result.packet.scales, 6);
  assert.equal(result.packet.total, 10);
  near(result.rows[0].params.scale / result.rows[1].params.scale, 8);
  near(result.rows[1].params.scale / result.rows[2].params.scale, 8);
  for (const groups of [[0, 0, 0], [0, 2, 1], [1, 1, 2], [0, 1, 1]]) sweep(puzzle, { bits: 3, tool: true, groups });
  sweep(puzzle, { bits: 2, tool: true, groups: [0, 1, 2] });
  assert.equal(evaluatePuzzle(puzzle, { ...WITNESSES[3], bits: 4 }).packet.total, 11);
});

test('Spotlight chooses the heavy plate; the other plates really do round', () => {
  const puzzle = PUZZLES[4];
  const result = evaluatePuzzle(puzzle, WITNESSES[4]);
  assert.equal(result.metrics.hotError, 0);
  assert.equal(result.recon[1], 0.77);
  assert.deepEqual(result.rows[0].protected, [false, true, false, false]);
  assert.ok(result.metrics.weightedError > 0 && result.metrics.weightedError <= 1.7);
  assert.equal(result.packet.spotlight, 3);
  assert.ok(result.recon.some((value, i) => value !== puzzle.values[i]));
  for (const spotlight of [0, 2, 3]) sweep(puzzle, { bits: 2, tool: true, spotlight });
  // With no clipping, a mirrored two-bit ruler's positive level is at least
  // 1.61, so it cannot exactly reconstruct the 0.77 pressure plate by timing.
  assert.ok(puzzle.values[1] < Math.max(...puzzle.values) / 2);
  assert.equal(evaluatePuzzle(puzzle, { ...WITNESSES[4], bits: 3 }).precisionOK, false);
});

test('Balance quantizes both factors of the product after reversible rescaling', () => {
  const puzzle = PUZZLES[5];
  for (const factor of [1, 2, 4, 8, 16]) {
    const result = evaluatePuzzle(puzzle, { ...WITNESSES[5], factor });
    assert.deepEqual(result.unroundedProducts, puzzle.values);
    assert.deepEqual(result.factors, [factor, 1, 1, 1]);
    result.recon.forEach((value, i) => near(value, result.rows[0].recon[i] * result.rows[1].recon[i]));
    for (const row of result.rows) assert.deepEqual(row.recon, quantizeVector(row.values, row.params).recon);
  }
  const result = evaluatePuzzle(puzzle, WITNESSES[5]);
  assert.equal(result.rows[0].values[0], 2);
  assert.equal(result.rows[1].values[0], 0.5);
  assert.ok(result.metrics.productErrors.every((error) => error <= 0.2));
  assert.equal(result.packet.scales, 4);
  assert.equal(result.packet.total, 8);
  sweep(puzzle, { bits: 4, tool: true, factor: 1 });
  for (const factor of [1, 2, 4, 8, 16]) sweep(puzzle, { bits: 2, tool: true, factor });
});

test('Bit Budget allocates unequal widths inside one fixed packet', () => {
  const puzzle = PUZZLES[6];
  const result = evaluatePuzzle(puzzle, WITNESSES[6]);
  assert.deepEqual(result.rows.map((row) => row.params.bits), [4, 3, 2]);
  assert.equal(result.packet.total, 15);
  assert.equal(result.packet.payload, 9);
  assert.equal(result.packet.scales, 6);
  result.metrics.rowErrors.forEach((error, i) => assert.ok(error <= puzzle.tolerances[i]));
  for (const budget of [[3, 4, 2], [4, 2, 3], [3, 2, 4], [2, 4, 3], [2, 3, 4], [2, 2, 2], [3, 3, 3]]) sweep(puzzle, { tool: true, budget });
  const overspend = evaluatePuzzle(puzzle, { ...WITNESSES[6], budget: [4, 4, 4] });
  assert.equal(overspend.packet.total, 18);
  assert.equal(overspend.packetOK, false);
  assert.equal(overspend.solved, false);
});

test('toy packet totals use the core format and high-bit brute force exceeds the constraints', () => {
  assert.deepEqual(PUZZLES.map((puzzle) => evaluatePuzzle(puzzle, WITNESSES[puzzle.zone]).packet.total), [3, 4, 4, 10, 6, 8, 15]);
  for (const zone of [1, 2, 3, 4, 5]) {
    const result = evaluatePuzzle(PUZZLES[zone], { ...WITNESSES[zone], bits: 8 });
    assert.equal(result.packetOK, false, `bridge-${zone}`);
    assert.equal(result.solved, false);
  }
  assert.equal(packetBytes({ count: 9, bits: 3, groups: 3 }).total, 10);
  assert.equal(packetBytes({ count: 8, bits: 4, groups: 2 }).total, 8);
});

test('hidden tide previews cannot leak live values, errors, clipping or success through any field', () => {
  const puzzle = PUZZLES[2];
  const changedLive = { ...puzzle, values: [-500, 999, 0.001, 70], settledHeights: [500, -50, 1000, 8] };
  for (const p of [0, 0.25, 0.5, 0.64, 0.9, 1]) for (const tool of [false, true]) for (const archive of [0, 1]) {
    const settings = { p, bits: 4, tool, archive };
    const preview = previewPuzzle(puzzle, settings);
    assert.deepEqual(preview, previewPuzzle(changedLive, settings));
    assert.equal(preview.hidden, true);
    assert.equal(preview.solved, null);
    assert.equal(preview.recon, null);
    assert.equal(preview.clippedCount, null);
    assert.equal(preview.metrics, null);
    assert.deepEqual(preview.rows[0].values, []);
    assert.deepEqual(preview.rows[0].recon, []);
  }
  const a = harness(puzzle).panel;
  const b = harness(changedLive).panel;
  for (const panel of [a, b]) {
    panel.tool = true;
    panel.archive = 1;
    panel.phase = 'breathe';
    panel.clock = clockAt(0.64, puzzle.period);
    panel.result = panel.preview();
  }
  assert.deepEqual(a.presentation(), b.presentation());
  assert.equal(a.describe(), b.describe());
  assert.equal(a.presentation().cue, 'neutral');
  assert.match(a.describe(), /live tide hidden/);
  press(a, 'confirm');
  assert.equal(a.phase, 'snap');
  assert.equal(a.result.hidden, false);
  assert.deepEqual(a.result.rows[0].values, puzzle.values);
  assert.equal(a.result.recon.length, 4);
  assert.ok(a.result.solved);
});

test('D-pad controls reach every real technique parameter and solve without spending bytes', () => {
  for (const puzzle of PUZZLES) {
    const { panel, game, calls } = harness(puzzle);
    const before = { ...game.state.hero };
    const touch = { device: 'touch' };
    if (puzzle.zone === 0) {
      press(panel, 'left', touch);
      press(panel, 'left', touch);
    } else {
      select(panel, 'tool', touch);
      assert.equal(panel.tool, false, 'up/down selects a control rather than secretly toggling it');
      press(panel, 'right', touch);
      assert.equal(panel.tool, true);
      if (puzzle.zone === 1) {
        select(panel, 'zeroCode', touch); press(panel, 'left', touch);
      } else if (puzzle.zone === 2) {
        select(panel, 'archive', touch); press(panel, 'right', touch);
      } else if (puzzle.zone === 3) {
        select(panel, 'group-1', touch); press(panel, 'right', touch);
        select(panel, 'group-2', touch); press(panel, 'left', touch);
      } else if (puzzle.zone === 4) {
        select(panel, 'spotlight', touch); press(panel, 'right', touch);
      } else if (puzzle.zone === 5) {
        select(panel, 'factor', touch);
        for (let i = 0; i < 3; i++) press(panel, 'right', touch);
      } else {
        select(panel, 'budget-0', touch); press(panel, 'right', touch);
        select(panel, 'budget-2', touch); press(panel, 'left', touch);
      }
    }
    assert.match(panel.presentation().footer.join(' '), /A breathe.*B close/);
    lock(panel, WITNESSES[puzzle.zone].p);
    assert.ok(panel.result.solved, puzzle.id);
    assert.deepEqual(calls.solved, [puzzle.id]);
    assert.equal(calls.onSolve.length, 1);
    assert.equal(calls.onSolve[0].recon.length, 4);
    const retained = panel.result;
    panel.update(60, input());
    assert.equal(panel.phase, 'result', 'results never expire');
    assert.equal(panel.result, retained);
    if (panel.result.rows.length > 1) {
      const oldRow = panel.activeRow;
      press(panel, 'right', touch);
      assert.notEqual(panel.activeRow, oldRow);
      assert.equal(panel.result, retained, 'inspection does not recompute a snap');
    }
    assert.deepEqual(game.state.hero, before);
    assert.equal(calls.solved.length, 1, 'a retained success is committed only once');
    press(panel, 'confirm', touch);
    assert.equal(panel.active, false);
    assert.equal(calls.closed, 1);
  }
});

test('failed snaps wait for retry, locked techniques stay locked, and Escape is modal-only', () => {
  const { panel, calls } = harness(PUZZLES[0]);
  lock(panel, 0.5);
  assert.equal(panel.result.solved, false);
  panel.update(60, input());
  assert.equal(panel.phase, 'result');
  assert.deepEqual(calls.solved, []);
  press(panel, 'confirm');
  assert.equal(panel.phase, 'choose');
  assert.equal(panel.bits, 4);
  const locked = harness(PUZZLES[5], ['bits']).panel;
  select(locked, 'tool');
  press(locked, 'right');
  assert.equal(locked.tool, false);
  assert.equal(locked.controls().some((control) => control.id === 'factor'), false);
  for (const phase of ['choose', 'breathe', 'snap', 'result']) {
    const current = harness(PUZZLES[0]);
    current.panel.phase = phase;
    const event = press(current.panel, 'cancel');
    assert.equal(current.panel.active, false);
    assert.ok(event.consumed.has('cancel'));
    assert.ok(event.consumed.has('pause'));
    assert.equal(current.calls.closed, 1);
    current.panel.close();
    assert.equal(current.calls.closed, 1);
    assert.deepEqual(current.calls.solved, []);
  }
});

test('steady halves only the breathing clock and all prompt phases follow the last device', () => {
  assert.deepEqual(bridgeInputLabels({ lastDevice: 'touch' }), { confirm: 'A', cancel: 'B', steady: 'STEADY' });
  assert.deepEqual(bridgeInputLabels({ lastDevice: 'keyboard' }), { confirm: 'Enter', cancel: 'Esc', steady: 'Shift' });
  const { panel, game } = harness(PUZZLES[0]);
  press(panel, 'confirm');
  const clock = panel.clock;
  panel.update(0.2, input(null, { steady: true }));
  near(panel.clock, clock + 0.1);
  panel.update(0.2, input());
  near(panel.clock, clock + 0.3);
  for (const phase of ['choose', 'breathe', 'snap', 'result']) {
    panel.phase = phase;
    game.input.lastDevice = 'touch';
    const touch = panel.presentation().footer.join(' ');
    assert.doesNotMatch(touch, /Enter|Esc|Shift/);
    assert.match(touch, /B close/);
    game.input.lastDevice = 'keyboard';
    assert.match(panel.presentation().footer.join(' '), /Esc close/);
  }
});

test('native landscape and portrait layouts budget complete text and a readable active plot', () => {
  const screens = [{ w: 384, h: 216 }, { w: 216, h: 374 }, { w: 216, h: 320 }];
  for (const screen of screens) for (const puzzle of PUZZLES) {
    const { panel } = harness(puzzle);
    const { p, ...settings } = WITNESSES[puzzle.zone];
    Object.assign(panel, settings);
    panel.clock = clockAt(p, puzzle.period);
    panel.result = panel.preview();
    const layout = puzzleLayout(screen, puzzle);
    assert.ok(layout.grid.h >= 60, `${puzzle.id}: graph collapsed at ${screen.w}×${screen.h}`);
    for (const rect of [layout.controls, layout.grid]) {
      assert.ok(rect.x >= layout.window.x && rect.y >= layout.window.y);
      assert.ok(rect.x + rect.w <= layout.window.x + layout.window.w);
      assert.ok(rect.y + rect.h < layout.feedbackY);
    }
    const controls = panel.controls();
    for (let i = 0; i < controls.length; i++) {
      panel.selected = i;
      const control = controls[i];
      assert.ok(measureText(`▶ ${control.label}: ${control.value}`, 'body') <= layout.controls.w, `${puzzle.id}: control ${control.id}`);
      const view = panel.presentation();
      const lines = wrapText(view.summary, layout.innerW, 'body').length + wrapText(view.message, layout.innerW, 'body').length;
      assert.ok(lines * FONT_METRICS.body.lineHeight <= layout.feedbackH, `${puzzle.id}: ${control.id} help overflows ${screen.w}×${screen.h}`);
    }
    panel.phase = 'result';
    for (const config of [WITNESSES[puzzle.zone], { bits: 8, tool: true, p: 0 }, { bits: 2, tool: false, p: 1 }]) {
      panel.result = evaluatePuzzle(puzzle, config);
      const view = panel.presentation();
      const lines = wrapText(view.summary, layout.innerW, 'body').length + wrapText(view.message, layout.innerW, 'body').length;
      assert.ok(lines * FONT_METRICS.body.lineHeight <= layout.feedbackH, `${puzzle.id}: result text overflows ${screen.w}×${screen.h}`);
      for (const line of view.footer) assert.ok(measureText(line, 'body') <= layout.innerW);
    }
  }
});

test('signs and warm NPC clues describe their own goals instead of recommending tool-off flat bridges', () => {
  const state = { friends: [], techniques: [], puzzles: [] };
  for (const puzzle of PUZZLES) {
    const sign = signText(puzzle.zone).join(' ');
    assert.ok(sign.includes(puzzle.goal));
    assert.ok(sign.includes(puzzle.hint));
    const npc = { id: `${ZONES[puzzle.zone].key}-npc-b`, zone: puzzle.zone, character: 'hiker' };
    const lines = npcDialogue(npc, state).map((line) => line.text);
    assert.equal(lines.length, 3, 'warm voice, verified fact, then applied clue');
    assert.ok(lines.every((line) => typeof line === 'string' && line.length > 0));
    if (puzzle.zone > 0) assert.doesNotMatch(lines[2], /one shared level|turn.*off|fewer bits make a better walkway/i);
  }
});
