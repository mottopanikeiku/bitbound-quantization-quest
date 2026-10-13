import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLessonDiagramModels, gridRowInfo, gridRowMetadata, gridMeterModel, gridThreadLabels, gridRowDisplay,
} from '../src/battle/gridviz.js';
import { weightedVectors, weightedFidelity, formatFidelity } from '../src/battle/metrics.js';
import { buildSpell } from '../src/battle/spell.js';
import { symmetricParams, affineParams, levelsOf, quantizeVector, fidelity } from '../src/quantization.js';
import { measureText } from '../src/engine/font.js';
import { PAL } from '../src/art/palette.js';

function close(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-12, `${message}: expected ${expected}, got ${actual}`);
}

function displayedRow(params) {
  const values = [-0.2, 0, 0.4, 1];
  return {
    values, ...quantizeVector(values, params), bits: params.bits, mode: params.mode,
    scale: params.scale, zero: params.zero, lo: params.min, hi: params.max, levels: levelsOf(params),
  };
}

test('the renderer metadata reports actual symmetric and affine level counts and steps', () => {
  for (const [params, count, step, label, compact] of [
    [symmetricParams(1, 3), 7, 1 / 3, '3 bit · 7 levels · step .33', '3b 7L s.33'],
    [affineParams(0, 1, 3), 8, 1 / 7, '3 bit · 8 levels · step .14', '3b 8L s.14'],
    [symmetricParams(1, 8), 255, 1 / 127, '8 bit · 255 levels · step .008', '8b 255L s.008'],
    [affineParams(0, 1, 8), 256, 1 / 255, '8 bit · 256 levels · step .004', '8b 256L s.004'],
  ]) {
    const info = gridRowInfo(displayedRow(params));
    assert.equal(info.count, count);
    close(info.scale, step, `${count} levels: actual displayed step`);
    assert.equal(gridRowMetadata(info, 206), label);
    assert.equal(gridRowMetadata(info, 64, true), compact, 'portrait row keeps its count AND step');
    assert.ok(measureText(compact, 'small') <= 64);
    const essentials = compact.slice(compact.indexOf(' ') + 1);
    assert.equal(gridRowMetadata(info, measureText(essentials, 'small'), true), essentials,
      'a narrow four-column row keeps its level count and step before the bit prefix');
  }
  const withoutLevels = gridRowInfo({ bits: 3, mode: 'affine', lo: 0, hi: 1 });
  assert.equal(withoutLevels.count, 8, 'affine fallback uses every code even without a level array');
  close(withoutLevels.scale, 1 / 7, 'affine fallback displayed step');
});

test('lesson models supply the same row labels the diagram renderer consumes', () => {
  const bits = createLessonDiagramModels('bits');
  assert.deepEqual(bits.map(model => gridRowInfo(model.rows[0]).count), [3, 7, 15]);
  assert.deepEqual(bits.map(model => gridRowMetadata(gridRowInfo(model.rows[0]))), [
    '2 bit · 3 levels · step 1', '3 bit · 7 levels · step .33', '4 bit · 15 levels · step .14',
  ]);
  const [mirror, shifted] = createLessonDiagramModels('zero');
  assert.equal(gridRowMetadata(gridRowInfo(mirror.rows[0])), '3 bit · 7 levels · step .36');
  assert.equal(gridRowMetadata(gridRowInfo(shifted.rows[0])), '3 bit · 8 levels · step .18');
  const another = createLessonDiagramModels('bits');
  bits[0].rows[0].recon[0] = 99;
  bits[0].snap = 1;
  assert.notEqual(another[0].rows[0].recon[0], 99, 'pure factories do not share mutable animation data');
  assert.equal(another[0].snap, 0);
});

test('calibration diagrams keep both archives and one absolute ruler across tight and wide locks', () => {
  const states = createLessonDiagramModels('calib');
  for (const model of states) {
    assert.deepEqual(model.view, { min: -2.4, max: 2.4 });
    assert.equal(model.ghosts.length, 32);
    assert.deepEqual(model.ghosts, states[0].ghosts);
    assert.deepEqual(model.rows[0].values, states[0].rows[0].values);
  }
  assert.equal(states[0].rows[0].hi, 0.55);
  assert.equal(states[2].rows[0].hi, 2);
  assert.ok(states[0].rows[0].clipped.some(Boolean), 'a calm-sized lock visibly clips the storm');
  assert.ok(!states[2].rows[0].clipped.some(Boolean), 'the wider lock covers this storm, not an oracle promise');
});

test('the original Budget diagram displays 83%, not the squared-sensitivity 90%', () => {
  const [equal, mixed] = createLessonDiagramModels('budget');
  close(equal.fidelity, 0.7910234779203188, 'original 3/3/3 fixture');
  close(mixed.fidelity, 0.8306271781059674, 'original 4/3/2 fixture');
  assert.equal(equal.cost, 15);
  assert.equal(mixed.cost, 15);
  assert.equal(gridMeterModel(equal, 206).title, 'Weighted 79%');
  assert.equal(gridMeterModel(mixed, 206).title, 'Weighted 83%');
  assert.deepEqual(mixed.sensitivities, [3, 1, 0.4]);
  const weighted = weightedVectors(mixed.rows, mixed.sensitivities);
  assert.deepEqual(mixed.reference, weighted.reference);
  assert.deepEqual(mixed.reconstructed, weighted.reconstructed);
  close(weightedFidelity(mixed.rows, mixed.sensitivities), mixed.fidelity, 'shared weighted metric');
  close(mixed.reference[0], mixed.rows[0].values[0] * Math.sqrt(3), 'sensitivity weights energy, not amplitude');
});

test('Budget diagram and actual battle spell agree for the exact displayed rows and locks', () => {
  for (const diagram of createLessonDiagramModels('budget')) {
    const essence = {
      rows: diagram.rows.map(({ values, label }) => ({ values, label })),
      sensitivities: diagram.sensitivities,
    };
    const spell = buildSpell(essence, { budget: diagram.rows.map(row => row.bits) }, { ranges: [1, 0.9, 0.8] });
    close(spell.fidelity, diagram.fidelity, 'battle/diagram fidelity');
    close(fidelity(spell.reference, spell.reconstructed), diagram.fidelity, 'actual vectors');
    assert.deepEqual(spell.reference, diagram.reference);
    assert.deepEqual(spell.reconstructed, diagram.reconstructed);
    assert.equal(spell.cost, diagram.cost);
    for (let i = 0; i < spell.rows.length; i++) {
      assert.equal(gridRowMetadata(gridRowInfo(spell.rows[i])), gridRowMetadata(gridRowInfo(diagram.rows[i])));
    }
    assert.equal(gridMeterModel({ ...spell, fidelityLabel: 'Weighted' }, 206).title, gridMeterModel(diagram, 206).title);
  }
});

test('the live meter uses the actual foe floor and never signals success below it', () => {
  const noisy = gridMeterModel({ fidelity: 0.7839029730257816, floor: 0.82, damage: 0, breathing: true }, 206);
  assert.equal(noisy.title, 'Live fidelity 78%');
  assert.equal(noisy.floor, 0.82, 'renderer marker receives this floor, not a universal .6');
  assert.equal(noisy.belowFloor, true);
  assert.equal(noisy.color, PAL.ui.error);
  assert.equal(noisy.status, 'Floor 82% · Too noisy · 0 damage');
  const lowerFloor = gridMeterModel({ fidelity: 0.7, floor: 0.58, damage: 3, breathing: true }, 206);
  assert.equal(lowerFloor.floor, 0.58);
  assert.equal(lowerFloor.belowFloor, false);
  assert.equal(lowerFloor.color, PAL.teal[7], 'success depends on this foe, not an arbitrary .75');
  assert.equal(lowerFloor.preview, 'Preview 3 damage');
  const perfect = gridMeterModel({ fidelity: 0.985, floor: 0.82, damage: 24, snap: 1 }, 206);
  assert.equal(perfect.title, 'Fidelity 98.5%');
  assert.equal(perfect.color, PAL.gold[6]);
  assert.equal(perfect.preview, '24 damage');
});

test('generic lesson meters stay neutral and never invent a battle floor or damage', () => {
  for (const value of [0.2, 0.8, 0.99, 1]) {
    const meter = gridMeterModel({ fidelity: value, breathing: false }, 206);
    assert.equal(meter.floor, null);
    assert.equal(meter.belowFloor, false);
    assert.equal(meter.color, PAL.water[7]);
    assert.equal(meter.preview, '');
    assert.equal(meter.status, '');
  }
});

test('near-PERFECT display uses a decimal and reserves 100% for effectively exact fidelity', () => {
  for (const [value, expected] of [[0.9844, '98.4%'], [0.985, '98.5%'], [0.995, '99.5%'], [0.999999, '99.9%'], [1, '100%']]) {
    assert.equal(formatFidelity(value), expected);
    assert.equal(gridMeterModel({ fidelity: value, snap: 1 }, 206).title, `Fidelity ${expected}`);
  }
  assert.equal(formatFidelity(1 - Number.EPSILON), '100%', 'roundoff alone may count as exact');
  const narrow = gridMeterModel({ fidelity: 0.985, breathing: true }, 80);
  assert.equal(narrow.fullTitle, 'Live fidelity 98.5%');
  assert.equal(narrow.title, 'Live 98.5%');
});

test('Spindle exposes Fi/Di, uses the minimum meter and disclaims the aggregate as a damage score', () => {
  const model = {
    fidelity: 0.9953711275215091, scoreFidelity: 0.9953711275215091,
    threadFidelities: [0.998037639488608, 0.9811817395321736, 0.7950591243288543],
    threadDamages: [10, 8, 1], floor: 0.72, damage: 19, snap: 1,
  };
  const meter = gridMeterModel(model, 206);
  close(meter.amount, model.threadFidelities[2], 'aggregate can never masquerade as thread score');
  assert.equal(meter.title, 'Thread minimum 79%');
  assert.equal(meter.aggregateLabel, 'Overall 99.5%: not thread score');
  assert.equal(meter.color, PAL.teal[7], 'a gold aggregate does not make the threads PERFECT');
  assert.equal(meter.preview, '19 damage');
  const labels = model.threadFidelities.map((_, index) => gridThreadLabels(model, index));
  assert.deepEqual(labels.map(({ fidelity, damage }) => [fidelity, damage]), [
    ['F1 99.8%', 'D1 10'], ['F2 98.1%', 'D2 8'], ['F3 79%', 'D3 1'],
  ]);
  for (const label of labels) {
    assert.ok(measureText(label.fidelity, 'small') <= 64, 'portrait row fidelity fits');
    assert.ok(measureText(label.damage, 'small') <= 64, 'portrait row damage fits');
  }
  const partlyNoisy = { ...model, threadFidelities: [0.999, 0.99, 0.4], threadDamages: [10, 9, 0] };
  assert.equal(gridMeterModel(partlyNoisy, 206).preview, 'Thread too noisy · 19 damage', 'one failed thread does not falsely report a whole-cast fizzle');
  assert.equal(gridThreadLabels(partlyNoisy, 2).color, PAL.ui.error);
});

test('hidden calibration meters cannot leak fidelity, expected damage or thread scores', () => {
  const model = {
    hidden: true, fidelity: 0.999, floor: 0.83, damage: 27,
    threadFidelities: [0.99, 1, 0.8], threadDamages: [10, 10, 7],
  };
  const meter = gridMeterModel(model, 206);
  assert.equal(meter.amount, null);
  assert.equal(meter.title, 'Fidelity ?');
  assert.equal(meter.preview, 'Live wave hidden');
  assert.equal(meter.aggregateLabel, '');
  assert.equal(meter.color, PAL.water[7]);
  assert.equal(gridThreadLabels(model, 0), null);
  assert.doesNotMatch(meter.status, /27|99|100/);
});

test('portrait focus expands the selected row in body font and preserves all four row summaries', () => {
  const model = {
    activeRow: 2,
    rows: [3, 0.5, 0.1, 1].map((range, index) => ({
      ...displayedRow(symmetricParams(range, 3)),
      label: index < 3 ? `Token ${index + 1}: A` : 'Weights',
    })),
  };
  const display = gridRowDisplay(model, { focusRow: true, width: 194 });
  assert.equal(display.focused, true);
  assert.equal(display.activeIndex, 2);
  assert.deepEqual(display.rows.filter(row => row.expanded).map(row => row.index), [2],
    '204px portrait panel draws one full-width plot, not four columns');
  assert.equal(display.rows[2].font, 'body');
  assert.equal(display.rows[2].title, 'Token 3: A');
  assert.equal(display.rows[2].metadata, '3 bit · 7 levels · step .03');
  assert.ok(measureText(display.rows[2].metadata, 'body') <= 190);
  assert.equal(display.rows.length, 4);
  for (const row of display.rows) {
    assert.ok(row.summary.includes(model.rows[row.index].label), 'each original row stays named');
    assert.ok(row.summary.includes('7L'), 'each summary retains its level count');
    assert.ok(measureText(row.summary, 'small') <= 188, 'summary fits the portrait inner width');
    if (!row.active) assert.equal(row.font, 'small', 'only secondary rows use small labels');
  }
  assert.match(display.rows[2].summary, /^▶ /);
  const next = gridRowDisplay({ ...model, activeRow: 3 }, { focusRow: true, width: 194 });
  assert.equal(next.rows[3].font, 'body');
  assert.deepEqual(next.rows.filter(row => row.expanded).map(row => row.title), ['Weights']);
  assert.equal(model.activeRow, 2, 'display selection does not mutate battle state');
});

test('portrait thread summaries retain every Fi and Di while one row is expanded', () => {
  const model = {
    ...createLessonDiagramModels('groups')[1], activeRow: 1, floor: 0.72,
    threadFidelities: [0.999, 0.982, 0.8], threadDamages: [10, 8, 1],
  };
  const display = gridRowDisplay(model, { focusRow: true, width: 194 });
  assert.deepEqual(display.rows.filter(row => row.expanded).map(row => row.index), [1]);
  assert.equal(display.rows[1].font, 'body');
  for (const [index, fidelity, damage] of [[0, 'F1 99.9%', 'D1 10'], [1, 'F2 98.2%', 'D2 8'], [2, 'F3 80%', 'D3 1']]) {
    assert.ok(display.rows[index].summary.includes(fidelity));
    assert.ok(display.rows[index].summary.includes(damage));
    assert.ok(measureText(display.rows[index].summary, 'small') <= 188);
  }
  const hidden = gridRowDisplay({ ...model, hidden: true }, { focusRow: true, width: 194 });
  for (const row of hidden.rows) {
    assert.equal(row.score, null);
    assert.doesNotMatch(row.summary, /F[123] |D[123] /, 'focus summaries cannot reveal hidden scores');
  }
});

test('focus is opt-in and clamps selection without dropping rows', () => {
  const model = createLessonDiagramModels('budget')[1];
  const landscape = gridRowDisplay(model, { width: 300 });
  assert.equal(landscape.focused, false);
  assert.equal(landscape.rows.filter(row => row.expanded).length, 3);
  assert.ok(landscape.rows.every(row => row.font === 'small'));
  assert.equal(gridRowDisplay({ ...model, activeRow: -1 }, { focusRow: true }).activeIndex, 0);
  assert.equal(gridRowDisplay({ ...model, activeRow: 99 }, { focusRow: true }).activeIndex, 2);
  const single = gridRowDisplay(createLessonDiagramModels('bits')[0], { focusRow: true });
  assert.equal(single.focused, false);
  assert.equal(single.rows.length, 1);
  assert.equal(single.rows[0].expanded, true);
  assert.equal(gridRowDisplay({ rows: [] }, { focusRow: true }).activeIndex, -1);
});
