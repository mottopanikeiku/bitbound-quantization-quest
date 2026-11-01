import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeBattle, GUARDIAN_PAR } from '../src/battle/grade.js';
const run = (options = {}) => gradeBattle({ foe: { id: 'chime', floor: 0.82 }, casts: [{ fidelity: 1, cost: 33 }], turns: 3, ...options });
test('grade is the declared weighted formula with guardian pars', () => {
  const grade = run();
  assert.equal(grade.score, 100); assert.equal(grade.letter, 'S');
  assert.deepEqual([grade.Q, grade.E, grade.G, grade.T], [1, 1, 1, 1]);
  assert.equal(grade.lines[2].label, 'guard not tested');
  assert.deepEqual(GUARDIAN_PAR.auric, { bytes: 116, turns: 5 });
  const mixed = run({ casts: [{ fidelity: 0.91, cost: 44 }], turns: 6, beats: [{ grade: 'good', offensive: true }, { grade: 'perfect', offensive: false }] });
  assert.ok(Math.abs(mixed.Q - 0.5) < 1e-10);
  assert.equal(mixed.E, 0.75); assert.equal(mixed.G, 0.6); assert.equal(mixed.T, 0.5);
  assert.equal(mixed.score, Math.round(15 + 26.25 + 12 + 7.5));
});
test('S prerequisites remain explicit at numeric scores above ninety', () => {
  const inefficient = run({ casts: [{ fidelity: 1, cost: 39 }] });
  assert.ok(inefficient.score >= 90); assert.equal(inefficient.letter, 'A');
  assert.match(inefficient.unmet.join(' '), /efficiency/);
  const guard = run({ beats: [{ grade: 'good', offensive: true }] });
  assert.equal(guard.score, 92); assert.equal(guard.letter, 'A');
  assert.match(guard.unmet.join(' '), /guard/);
  const fizzle = run({ casts: [...Array.from({ length: 9 }, () => ({ fidelity: 1, cost: 3 })), { fidelity: 1, cost: 3, fizzle: true }] });
  assert.equal(fizzle.Q, 0.9); assert.equal(fizzle.letter, 'A'); assert.match(fizzle.unmet[0], /fizzles/);
});
test('thresholds, thread minimum, failed packets and refunds are honest', () => {
  const thresholds = [
    [90, 'S', { casts: [{ fidelity: 0.94, cost: 33 }] }],
    [80, 'A', { beats: [{ grade: 'miss', offensive: true }] }],
    [65, 'B', { casts: [{ fidelity: 0.82, cost: 33 }], turns: 4.5 }],
    [64, 'C', { casts: [{ fidelity: 0.82, cost: 33 }], turns: 5 }],
  ];
  for (const [score, letter, options] of thresholds) {
    const grade = run(options);
    assert.equal(grade.score, score); assert.equal(grade.letter, letter);
  }
  const thread = run({ casts: [{ fidelity: 1, threadFidelities: [1, 0.82, 1], cost: 10 }] });
  assert.equal(thread.Q, 0);
  const naive = run({ casts: Array.from({ length: 3 }, () => ({ fidelity: 0.996, cost: 18 })), beats: Array.from({ length: 30 }, () => ({ grade: 'perfect', offensive: false })) });
  assert.equal(naive.packetBytes, 54); assert.equal(naive.letter, 'A');
  assert.equal(naive.E, 33 / 54);
  assert.equal(run({ hero: { bytes: 1000 }, casts: [{ fidelity: 1, cost: 54 }] }).E, 33 / 54, 'charge refunds are not grade input');
});
