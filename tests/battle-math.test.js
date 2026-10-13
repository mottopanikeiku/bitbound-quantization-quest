import test from 'node:test';
import assert from 'node:assert/strict';
import { fidelity, dot, symmetricParams, affineParams, quantizeValue, quantizeVector } from '../src/quantization.js';
import { FOES, createEssence, attackFor, intendedGear } from '../src/battle/foes.js';
import { normalizeGear, buildSpell, spellCost, defaultLocks, rangeTargets, lockDomains, damageFor } from '../src/battle/spell.js';
import { weightedVectors } from '../src/battle/metrics.js';

const BITS = [2, 3, 4, 8];
const ALL_TECHNIQUES = ['bits', 'zero', 'calib', 'groups', 'spotlight', 'balance', 'budget'];
const near = (a, b, epsilon = 1e-10) => assert.ok(Math.abs(a - b) <= epsilon, `${a} differs from ${b}`);
const signal = (...rows) => ({ kind: 'values', rows: rows.map((values, i) => ({ label: `Row ${i + 1}`, values })) });

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}


test('gear keeps the canonical save schema and cannot enable locked techniques', () => {
  const full = { bits: 3, zero: true, calib: true, groups: true, spotlight: 2, balance: true, budget: [8, 3, 2] };
  assert.deepEqual(normalizeGear(full, ALL_TECHNIQUES), full);
  assert.deepEqual(normalizeGear(full, ['bits']), { bits: 3, zero: false, calib: false, groups: false, spotlight: 0, balance: false, budget: null });
  assert.equal(normalizeGear({ bits: 5 }).bits, 4);
  assert.equal(normalizeGear({ spotlight: 9 }).spotlight, 2);
  assert.equal(normalizeGear({ spotlight: -1 }).spotlight, 0);
  assert.equal(normalizeGear({ budget: [8, 5, 2] }).budget, null);
  assert.notEqual(normalizeGear(full).budget, full.budget);
});

test('spell rows use nearest-even grids, actual affine edges, and visible clipping', () => {
  const essence = signal([-1.2, -1, -0.5, -1 / 6, 0, 1 / 6, 0.5, 1, 1.2]);
  const model = buildSpell(essence, { bits: 3 }, { ranges: [1] });
  const expected = quantizeVector(essence.rows[0].values, symmetricParams(1, 3));
  assert.deepEqual(model.rows[0].recon, expected.recon);
  assert.deepEqual(model.rows[0].codes, expected.codes);
  assert.equal(model.rows[0].levels.length, 7);
  assert.equal(model.rows[0].codes[3], 0);
  assert.equal(model.rows[0].codes[5], 0);
  assert.equal(model.rows[0].codes[2], -2);
  assert.equal(model.rows[0].codes[6], 2);
  assert.equal(model.clippedCount, 2);
  const endpoint = quantizeValue(1.1, symmetricParams(1, 3));
  assert.equal(endpoint.code, 3, 'rounding alone has not saturated the code');
  assert.equal(endpoint.reconstructed, 1);
  assert.equal(endpoint.clipped, true, 'the original value lies beyond the reconstruction endpoint');
  near(model.rows[0].scale, 1 / 3);
  near(model.rows[0].levels[1] - model.rows[0].levels[0], model.rows[0].scale);
  assert.ok(model.view.min <= -1.2 && model.view.max >= 1.2);

  const affine = buildSpell(signal([-0.17, 0, 0.4, 1]), { bits: 3, zero: true }, { lows: [-0.17], highs: [1] });
  const params = affineParams(-0.17, 1, 3);
  near(affine.rows[0].lo, params.min);
  near(affine.rows[0].hi, params.max);
  assert.notEqual(affine.rows[0].lo, -0.17);
  assert.equal(affine.rows[0].levels.length, 8);
  near(affine.rows[0].scale, 1.17 / 7);
  near(affine.rows[0].levels[1] - affine.rows[0].levels[0], affine.rows[0].scale);
  assert.equal(affine.rows[0].recon[1], 0);
  for (const bits of BITS) {
    const sym = buildSpell(signal([0, 0, 0]), { bits });
    const aff = buildSpell(signal([0, 0, 0]), { bits, zero: true });
    assert.equal(sym.fidelity, 1);
    assert.equal(aff.fidelity, 1);
    assert.equal(sym.rows[0].levels.length, 2 ** bits - 1);
    assert.equal(aff.rows[0].levels.length, 2 ** bits);
    assert.ok(Number.isFinite(sym.rows[0].scale));
  }
});

test('packet accounting packs once across groups, but separately per budget head', () => {
  const threeRows = signal([1, 0, -1], [0.1, 0, -0.1], [0.01, 0, -0.01]);
  const grouped = buildSpell(threeRows, { bits: 3, groups: true });
  assert.deepEqual(grouped.packet, { payload: 4, scales: 6, zeros: 0, spotlight: 0, total: 10 });
  assert.equal(spellCost(threeRows, { bits: 3 }), 6);
  assert.equal(spellCost(threeRows, { bits: 3, groups: true, zero: true }), 13);

  const heads = { ...threeRows, sensitivities: [3, 1, 0.4] };
  const budget = buildSpell(heads, { bits: 8, budget: [2, 3, 4] });
  assert.equal(budget.packet.payload, 5);
  assert.equal(budget.packet.scales, 6);
  assert.equal(budget.cost, 11);
  assert.deepEqual(budget.rows.map((row) => row.bits), [2, 3, 4]);
  assert.deepEqual(budget.packet.heads.map((head) => head.total), [3, 4, 4]);
  assert.equal(spellCost(heads, { budget: [2, 3, 4], zero: true }), 14);

  const kiln = createEssence('cinder');
  assert.equal(spellCost(kiln, { bits: 2, spotlight: 2 }), 12);
  assert.equal(spellCost(kiln, { bits: 3, spotlight: 2 }), 14);
  assert.equal(spellCost(kiln, { bits: 2, spotlight: 2 }, { protected: [] }), 6);
  const library = createEssence('vesper');
  assert.equal(spellCost(library, { bits: 2 }), 20); // 48 A + 16 W, two scales.
  assert.equal(spellCost(library, { bits: 2, balance: true }), 20); // Folded factors cost zero.
  assert.equal(spellCost(library, { bits: 2, zero: true }), 22);
  assert.equal(spellCost(library, { bits: 2, groups: true }), 24);
  assert.equal(spellCost(library, { bits: 2, groups: true, zero: true, spotlight: 2 }), 34);
});

test('damage thresholds follow the declared curve, not technique-specific bonuses', () => {
  assert.deepEqual(damageFor(1, 16, 0.6), { damage: 20, perfect: true, fizzle: false });
  assert.deepEqual(damageFor(0.59, 16, 0.6), { damage: 0, perfect: false, fizzle: true });
  assert.deepEqual(damageFor(0.6, 16, 0.6), { damage: 0, perfect: false, fizzle: false });
  assert.equal(damageFor(0.8, 16, 0.6).damage, Math.round(16 * 0.5 ** 1.4));
  assert.equal(damageFor(0.984999, 16, 0.6).perfect, false);
  assert.equal(damageFor(0.985, 16, 0.6).perfect, true);
  assert.equal(damageFor(0.985, 16, 0.6).damage, Math.round(16 * ((0.985 - 0.6) / 0.4) ** 1.4 * 1.25));
  assert.equal(damageFor(1, 16, 1).damage, 20);
  assert.equal(damageFor(0.99, 16, 1).damage, 0);
});

test('Spotlight chooses hot input channels, removes them from range fitting, and keeps only their weights exact', () => {
  const essence = createEssence('cinder', 2);
  const gear = intendedGear('cinder');
  const locks = defaultLocks(essence, gear);
  assert.deepEqual([...locks.protected].sort((a, b) => a - b), essence.hotChannels);
  const clipped = buildSpell(essence, gear, { ...locks, ranges: [0.1] });
  for (const index of locks.protected) {
    assert.equal(clipped.rows[0].recon[index], essence.weights[index]);
    assert.equal(clipped.rows[0].codes[index], null);
    assert.equal(clipped.rows[0].clipped[index], false);
    assert.equal(clipped.rows[0].protected[index], true);
  }
  assert.equal(clipped.packet.spotlight, 6);
  assert.equal(rangeTargets(essence, gear, locks)[0].values.length, 14);
  const protectedOutlier = signal([20, 0.2, -0.2, 0.1]);
  assert.equal(rangeTargets(protectedOutlier, { bits: 2, spotlight: 1 })[0].amax, 0.2);

  const naive = buildSpell(essence, { bits: 4 });
  assert.ok(naive.fidelity < fidelity(essence.weights, naive.rows[0].recon));
  assert.deepEqual(naive.reference, essence.inputs.map((token) => dot(token, essence.weights)));
  assert.deepEqual(naive.reconstructed, essence.inputs.map((token) => dot(token, naive.rows[0].recon)));
  near(naive.fidelity, fidelity(naive.reference, naive.reconstructed));
  const intended = buildSpell(essence, gear, locks, 28, FOES.cinder.floor);
  assert.ok(intended.fidelity > 0.99, 'cold-input rounding is small, not secretly ignored');
  assert.equal(intended.metric, 'output');
});

test('Balance preserves unrounded products, quantizes BOTH tensors, and charges both packets', () => {
  const essence = createEssence('vesper', 3, seeded(91));
  const original = structuredClone(essence);
  for (const alpha of [0, 0.25, 0.49, 0.5, 0.51, 0.75, 1]) {
    const gear = { bits: 3, balance: true };
    const model = buildSpell(essence, gear, { alpha }, 31, FOES.vesper.floor);
    const factors = model.balanceFactors;
    const transformedWeights = essence.weights.map((weight, i) => weight * factors[i]);
    for (let token = 0; token < essence.inputs.length; token++) {
      const transformedInput = essence.inputs[token].map((value, i) => value / factors[i]);
      near(dot(transformedInput, transformedWeights), dot(essence.inputs[token], essence.weights));
      assert.deepEqual(model.rows[token].values, transformedInput);
      near(model.reconstructed[token], dot(model.rows[token].recon, model.rows[3].recon));
    }
    assert.equal(model.rows.length, 4);
    assert.equal(model.packet.payload, 24);
    assert.equal(model.packet.scales, 4);
    assert.equal(rangeTargets(essence, gear, { alpha }).length, 2);
    if (alpha === 0.49 || alpha === 0.51) assert.ok(model.damage > 0, `nearby alpha ${alpha} must still work`);
  }
  const center = buildSpell(essence, { bits: 3, balance: true }, { alpha: 0.5 });
  const edge = buildSpell(essence, { bits: 3, balance: true }, { alpha: 0 });
  assert.notDeepEqual(center.balanceFactors, edge.balanceFactors, 'alpha must actually move range between A and W');
  assert.notDeepEqual(center.rows[0].values, edge.rows[0].values);
  assert.ok(center.fidelity > edge.fidelity + 0.03, 'the centered balance should retain more output than an endpoint');
  near(center.fidelity, 1);
  assert.deepEqual(essence, original);
  const zeroChannel = { ...signal([0, 1]), weights: [0, 1], inputs: [[0, 1]], quantizeInputs: true };
  const silent = buildSpell(zeroChannel, { bits: 2, balance: true });
  assert.ok(silent.balanceFactors.every(Number.isFinite));
  assert.equal(silent.fidelity, 1);
});

test('group locks route to the correct rows, and shared 2-4 bit grids erase the thin thread', () => {
  for (let turn = 0; turn < 6; turn++) {
    const essence = createEssence('spindle', turn, seeded(turn + 10));
    for (const bits of [2, 3, 4]) {
      const naive = buildSpell(essence, { bits }, {}, 25, FOES.spindle.floor);
      assert.equal(naive.threadFidelities[2], 0);
      assert.equal(naive.threadDamages[2], 0);
      assert.ok(naive.rows[2].recon.every((value) => value === 0));
    }
    const gear = intendedGear('spindle', 1, { successes: turn });
    const locks = defaultLocks(essence, gear);
    assert.equal(locks.ranges.length, 3);
    const grouped = buildSpell(essence, gear, locks, 25, FOES.spindle.floor);
    assert.deepEqual(grouped.rows.map((row) => row.group), [0, 1, 2]);
    assert.ok(grouped.threadFidelities.every((value) => value > 0.985));
    assert.ok(grouped.threadDamages.every((value) => value > 0));
    assert.equal(grouped.damage, grouped.threadDamages.reduce((a, b) => a + b, 0));
    grouped.threadFidelities.forEach((value, i) => assert.equal(grouped.threadDamages[i], damageFor(value, 25 / 3, FOES.spindle.floor).damage));
    const brute = buildSpell(essence, { bits: 8 }, {}, 25, FOES.spindle.floor);
    assert.ok(brute.threadDamages.every((value) => value > 0), '8-bit brute force is slow but can touch every thread');
  }
});

test('Budget fidelity really weights signal and error energy by sensitivity', () => {
  const essence = { ...signal([1, 0.45], [1, 0], [1, 0]), sensitivities: [3, 1, 0.4] };
  const model = buildSpell(essence, { bits: 2, budget: [2, 2, 2] });
  const swapped = buildSpell({ ...essence, sensitivities: [0.4, 1, 3] }, { bits: 2, budget: [2, 2, 2] });
  near(model.reference[0], Math.sqrt(3));
  near(model.reference[1], 0.45 * Math.sqrt(3));
  near(model.fidelity, fidelity(model.reference, model.reconstructed));
  assert.deepEqual(weightedVectors(model.rows, essence.sensitivities), { reference: model.reference, reconstructed: model.reconstructed });
  assert.ok(swapped.fidelity > model.fidelity);
  assert.equal(model.metric, 'sensitivity-weighted values');
  assert.deepEqual(model.headFidelities, model.rows.map((row) => fidelity(row.values, row.recon)));
});

test('Brine fits public archives, not its hidden live values, and calibration is information only', () => {
  for (const turn of [0, 1]) {
    const essence = createEssence('brine', turn, seeded(15));
    const gear = intendedGear('brine');
    const changed = { ...essence, rows: essence.rows.map((row) => ({ ...row, values: row.values.map((value) => value * 10) })) };
    assert.deepEqual(defaultLocks(essence, gear), defaultLocks(changed, gear));
    assert.deepEqual(rangeTargets(essence, gear), rangeTargets(changed, gear));
    assert.deepEqual(rangeTargets(essence, gear)[0].values, essence.ghosts);
    const locks = defaultLocks(essence, gear);
    const calibrated = buildSpell(essence, gear, locks);
    const sameLock = buildSpell(essence, { ...gear, calib: false }, locks);
    assert.deepEqual(calibrated.reconstructed, sameLock.reconstructed);
    assert.equal(calibrated.damage, sameLock.damage);
    assert.ok(buildSpell(changed, gear, locks).fidelity < calibrated.fidelity);
  }
  const calm = createEssence('brine', 0);
  assert.deepEqual(defaultLocks(calm, { bits: 4, calib: true }), defaultLocks(calm, { bits: 4, calib: false }));
  assert.equal(defaultLocks(calm, { bits: 4, calib: true }).ranges[0], 2.2);
  for (let turn = 0; turn < 6; turn++) {
    const essence = createEssence('brine', turn, seeded(turn));
    assert.deepEqual(essence.ghosts, [...calm.archive.calm, ...calm.archive.storm]);
    assert.deepEqual(lockDomains(essence, { bits: 4 }), [{ r: [0.15, 2.4], lo: [-2.4, 0], hi: [0, 2.4] }]);
    assert.deepEqual(buildSpell(essence, { bits: 4 }).view, { min: -2.4, max: 2.4 });
    const archive = essence.archive[essence.storm ? 'storm' : 'calm'];
    assert.notDeepEqual([...essence.rows[0].values].sort((a, b) => a - b), [...archive].sort((a, b) => a - b));
  }
});

test('all fourteen foes are deterministic, morph between turns, and have usable attack rhythms', () => {
  assert.equal(Object.keys(FOES).length, 14);
  for (const foe of Object.values(FOES)) {
    assert.deepEqual(createEssence(foe.id, 3, seeded(42), 2), createEssence(foe.id, 3, seeded(42), 2));
    assert.notDeepEqual(createEssence(foe.id, 0, seeded(42)).rows, createEssence(foe.id, 1, seeded(42)).rows);
    assert.notDeepEqual(createEssence(foe.id, 0, seeded(1)).rows, createEssence(foe.id, 0, seeded(2)).rows);
    let calls = 0;
    createEssence(foe.id, 0, () => { calls++; return 0.5; });
    assert.ok(calls > 0);
    let sawCharge = false;
    let sawMultiple = false;
    for (let turn = 0; turn < 8; turn++) {
      const attack = attackFor(foe.id, turn, 2);
      assert.deepEqual(attack, attackFor(foe.id, turn, 2));
      assert.equal(attack.hits.length, attack.gaps.length);
      assert.equal(attack.gaps[0], 0.85);
      assert.ok(attack.gaps.slice(1).every((gap) => gap >= 0.45 && gap <= 0.7));
      assert.ok(attack.hits.every((hit) => Number.isInteger(hit) && hit > 0));
      assert.ok(attack.telegraph.length > 0 && attack.morph.length > 0);
      sawCharge ||= attack.charge;
      sawMultiple ||= attack.hits.length > 1;
    }
    assert.ok(sawCharge && sawMultiple);
    for (const bits of BITS) {
      const essence = createEssence(foe.id);
      const gear = { ...intendedGear(foe.id), bits };
      const locks = defaultLocks(essence, gear);
      assert.equal(buildSpell(essence, gear, locks).cost, spellCost(essence, gear, locks));
    }
  }
  assert.notDeepEqual(createEssence('auric', 0, seeded(1), 1).rows, createEssence('auric', 0, seeded(1), 2).rows);
  assert.throws(() => createEssence('unknown'), RangeError);
  assert.throws(() => attackFor('unknown'), RangeError);
});

test('lock domains are the complete breathing intervals, including degenerate zero signals', () => {
  assert.deepEqual(lockDomains(signal([-2, 1]), { bits: 3 }), [{
    r: [0.7, 2.9], lo: [-3.1, -0.8999999999999999], hi: [0, 2.1],
  }]);
  const empty = lockDomains(signal([0, 0]), { bits: 3 })[0];
  assert.deepEqual(empty, { r: [0.35, 1.45], lo: [-0.55, 0], hi: [0, 0.55] });
  const essence = createEssence('chime');
  const covering = defaultLocks(essence, { bits: 4 });
  const domain = lockDomains(essence, { bits: 4 })[0];
  assert.ok(covering.ranges[0] * 7 / 6 < domain.r[1], 'the old Chime counterexample must remain reachable');
});

test('mid and late morphs depend on successful casts, not elapsed guard turns', () => {
  for (const id of ['spindle', 'cinder', 'vesper', 'auric']) {
    const waiting = createEssence(id, 7, seeded(20), 1, { successes: 1 });
    const changed = createEssence(id, 7, seeded(20), 1, { successes: 2 });
    assert.equal(waiting.morphStage, 0);
    assert.equal(changed.morphStage, 1);
    assert.notDeepEqual(changed.rows, waiting.rows);
    assert.ok(changed.morphName && changed.morphHint);
    if (id === 'spindle' || id === 'vesper') {
      const old = buildSpell(changed, intendedGear(id), {}, 16 + 3 * FOES[id].zone, FOES[id].floor);
      const newGear = intendedGear(id, 1, { successes: 2 });
      const adapted = buildSpell(changed, newGear, {}, 16 + 3 * FOES[id].zone, FOES[id].floor);
      assert.ok(adapted.damage >= old.damage + 10, `${id} requires a new decision, not another rotation`);
    }
  }
  for (const foe of Object.values(FOES).filter((foe) => foe.guardian)) {
    assert.equal(attackFor(foe.id, 1).charge, true, 'the second enemy turn exposes a charge before a three-cast win');
  }
});

