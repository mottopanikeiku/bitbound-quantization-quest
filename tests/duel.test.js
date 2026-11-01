import test from 'node:test';
import assert from 'node:assert/strict';
import { DUELS, duelEssence, fenBaseline, judgeRound } from '../src/battle/duel.js';
import { buildSpell, defaultLocks } from '../src/battle/spell.js';
import { dot, fidelity } from '../src/quantization.js';

const rng = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
for (const id of Object.keys(DUELS)) test(`${id}: all three rounds have honest reachable witnesses and FP32 payloads`, () => {
  for (let round = 0; round < 3; round++) for (let seed = 1; seed <= 32; seed++) {
    const essence = duelEssence(id, round, rng(seed));
    assert.deepEqual(essence, duelEssence(id, round, rng(seed)));
    const gear = id === 'fen-offset' ? { bits: 4, zero: true } : id === 'fen-hot' ? { bits: 2, spotlight: 2 } : { budget: round === 2 ? [3, 2, 8] : [8, round > 0 ? 3 : 2, 2] };
    const locks = defaultLocks(essence, gear);
    const spell = buildSpell(essence, gear, locks, 22, 0.6);
    const result = judgeRound(id, spell);
    assert.ok(result.accepted, JSON.stringify({ id, round, seed, result }));
    assert.equal(result.fidelity, spell.fidelity);
    assert.equal(result.cost, spell.cost);
    const baseline = fenBaseline(essence);
    assert.equal(baseline.bytes, DUELS[id].fp32Bytes);
    assert.ok(baseline.fidelity >= 0.99999 && baseline.fidelity <= 1);
    assert.equal(result.ratio, baseline.bytes / spell.cost);
  }
});

test('FP32 means Math.fround reconstruction, not assumed perfect fidelity', () => {
  const source = [1 / 3, Math.PI, 1e-8, -7.123456789];
  const essence = { rows: [{ values: source }] };
  assert.deepEqual(fenBaseline(essence), { bytes: 16, fidelity: fidelity(source, source.map(Math.fround)) });
  assert.ok(fenBaseline(essence).fidelity < 1);
  const driven = { rows: [{ values: source }], weights: source, inputs: [[1, 2, 3, 4]], quantizeInputs: false };
  assert.deepEqual(fenBaseline(driven), { bytes: 16, fidelity: fidelity([dot(driven.inputs[0], source)], [dot(driven.inputs[0], source.map(Math.fround))]) });
  const paired = { ...driven, quantizeInputs: true, inputs: [[1 / 3, 2 / 3, Math.PI, 4 / 3]] };
  assert.equal(fenBaseline(paired).bytes, 32);
});

test('judging reads resolved fidelity and packet only, including the weakest thread', () => {
  assert.equal(judgeRound('fen-offset', { fidelity: 0.98499, cost: 11, perfect: true }).accepted, false);
  assert.equal(judgeRound('fen-offset', { fidelity: 1, cost: 12, packet: { total: 1 } }).accepted, false);
  assert.equal(judgeRound('fen-offset', { fidelity: 0.985, cost: 11, perfect: false }).accepted, true);
  assert.equal(judgeRound('fen-hot', { fidelity: 1, threadFidelities: [1, 0.98], cost: 12 }).fidelityOk, false);
  assert.equal(judgeRound('fen-crown', { fidelity: 1, cost: 32 }).accepted, true);
  assert.equal(judgeRound('fen-crown', { fidelity: NaN, cost: 28 }).accepted, false);
  assert.equal(judgeRound('fen-offset', { fidelity: 1, cost: 0 }).packetOk, false);
  assert.throws(() => duelEssence('unknown'), RangeError);
  assert.throws(() => judgeRound('unknown', {}), RangeError);
});
