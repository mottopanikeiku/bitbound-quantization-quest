import test from 'node:test';
import assert from 'node:assert/strict';
import { fidelity, dot, symmetricParams, affineParams, quantizeVector } from '../src/quantization.js';
import { FOES, createEssence, attackFor, intendedGear } from '../src/battle/foes.js';
import { normalizeGear, buildSpell, spellCost, defaultLocks, rangeTargets, damageFor } from '../src/battle/spell.js';

const BITS = [2, 3, 4, 8];
const GUARDIANS = ['nib', 'chime', 'brine', 'spindle', 'cinder', 'vesper', 'auric'];
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

function copyLocks(locks) {
  return { ...locks, ranges: [...locks.ranges], lows: [...locks.lows], highs: [...locks.highs], protected: [...locks.protected] };
}

function perturbedLocks(essence, gear, error) {
  const locks = defaultLocks(essence, gear);
  locks.ranges = locks.ranges.map((value) => value * (1 + error));
  locks.lows = locks.lows.map((value) => value * (1 + error));
  locks.highs = locks.highs.map((value) => value * (1 + error));
  return locks;
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
  assert.ok(model.view.min <= -1.2 && model.view.max >= 1.2);

  const affine = buildSpell(signal([-0.17, 0, 0.4, 1]), { bits: 3, zero: true }, { lows: [-0.17], highs: [1] });
  const params = affineParams(-0.17, 1, 3);
  near(affine.rows[0].lo, params.min);
  near(affine.rows[0].hi, params.max);
  assert.notEqual(affine.rows[0].lo, -0.17);
  assert.equal(affine.rows[0].levels.length, 8);
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
  near(intended.fidelity, 1);
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
    const gear = intendedGear('spindle');
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
  assert.ok(defaultLocks(calm, { bits: 4, calib: true }).ranges[0] < defaultLocks(calm, { bits: 4, calib: false }).ranges[0]);
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

// These comparisons are toy gameplay fixtures, not claims about real model accuracy.
// "Naive" means uniform bits with the guardian's new technique absent. All earlier
// applicable toggles are enumerated; structurally inert ones (e.g. Balance on a
// value-only foe) are omitted. Spotlight uses the public max-input salience ranking.
// Nib teaches the bit choice itself, so its baseline is the OTHER choices 2/3/8,
// rather than comparing the identical 4-bit spell to itself. Brine is separately
// compared to an unconditioned fixed-range archive policy, not a live-data oracle.
function naiveGears(foe) {
  const bits = foe.zone === 0 ? [2, 3, 8] : BITS;
  const gears = [];
  for (const bit of bits) {
    for (const zero of foe.zone >= 2 ? [false, true] : [false]) {
      for (const groups of foe.zone >= 4 ? [false, true] : [false]) {
        for (const spotlight of foe.zone >= 5 ? [0, 1, 2] : [0]) {
          gears.push(normalizeGear({ bits: bit, zero, groups, spotlight }));
        }
      }
    }
  }
  return gears;
}

// A symmetric breathing span is 1.10*amax. +/-0.11*amax is its allowed 10% error.
// Two coordinate passes search this disclosed finite grid for every naive gear;
// this is not a claim to solve the continuous, combinatorial global optimum.
const LOCK_FACTORS = [0.89, 0.92, 0.95, 0.98, 1, 1.02, 1.05, 1.08, 1.11];
function bestNearbyLocks(essence, gear, power, floor) {
  const covering = defaultLocks(essence, gear);
  let locks = copyLocks(covering);
  let model = buildSpell(essence, gear, locks, power, floor);
  for (let pass = 0; pass < 2; pass++) {
    for (let group = 0; group < covering.ranges.length; group++) {
      for (const key of gear.zero ? ['lows', 'highs'] : ['ranges']) {
        for (const factor of LOCK_FACTORS) {
          const candidateLocks = copyLocks(locks);
          candidateLocks[key][group] = covering[key][group] * factor;
          const candidate = buildSpell(essence, gear, candidateLocks, power, floor);
          if (candidate.damage > model.damage || (candidate.damage === model.damage && candidate.fidelity > model.fidelity)) {
            model = candidate;
            locks = candidateLocks;
          }
        }
      }
    }
  }
  return { model, locks, gear };
}

function bestNaive(foe, essence, power) {
  let best;
  for (const gear of naiveGears(foe)) {
    const candidate = bestNearbyLocks(essence, gear, power, foe.floor);
    if (!best || candidate.model.damage / candidate.model.cost > best.model.damage / best.model.cost) best = candidate;
  }
  return best;
}

for (const id of GUARDIANS.filter((guardian) => guardian !== 'brine')) {
  test(`${id}: intended technique earns at least 1.5x damage/byte over the searched naive baseline`, (t) => {
    const foe = FOES[id];
    const power = 16 + 3 * foe.zone;
    t.diagnostic('Baseline: all uniform bits without this guardian\'s technique; all earlier applicable toggles; default salience; two-pass +/-11% covering-range coordinate search. Nib excludes the taught 4-bit choice.');
    for (const phase of id === 'auric' ? [1, 2] : [1]) {
      for (const turn of [0, 3]) {
        const essence = createEssence(id, turn, seeded(100 + turn), phase);
        const gear = intendedGear(id, phase);
        const intended = buildSpell(essence, gear, defaultLocks(essence, gear), power, foe.floor);
        const naive = bestNaive(foe, essence, power);
        const intendedRate = intended.damage / intended.cost;
        const naiveRate = naive.model.damage / naive.model.cost;
        const ratio = intendedRate / naiveRate;
        t.diagnostic(JSON.stringify({ id, turn, phase, intended: { gear, fidelity: intended.fidelity, damage: intended.damage, bytes: intended.cost, damagePerByte: intendedRate }, naive: { gear: naive.gear, fidelity: naive.model.fidelity, damage: naive.model.damage, bytes: naive.model.cost, damagePerByte: naiveRate, locks: naive.locks }, ratio }));
        assert.ok(naive.model.damage > 0, 'the best naive alternative must remain usable');
        assert.ok(ratio >= 1.5 - 1e-12, `${id} phase ${phase}: ${ratio.toFixed(3)}x, expected >=1.5x`);
      }
    }
  });
}

test('Brine: forecast-conditioned calibration beats the best searched fixed-range archive policy by 1.5x', (t) => {
  const foe = FOES.brine;
  const power = 22;
  const waves = Array.from({ length: 6 }, (_, turn) => createEssence('brine', turn, seeded(200 + turn)));
  const gear = intendedGear('brine');
  const intended = waves.map((essence) => buildSpell(essence, gear, defaultLocks(essence, gear), power, foe.floor));
  const intendedDamage = intended.reduce((sum, model) => sum + model.damage, 0);
  const intendedBytes = intended.reduce((sum, model) => sum + model.cost, 0);
  const ranges = [...new Set([0.49, ...Array.from({ length: 81 }, (_, i) => 0.4 + i * 0.025)])];
  let best = { rate: -1 };
  for (const bits of BITS) {
    for (const zero of [false, true]) {
      for (const range of ranges) {
        for (const lowFactor of zero ? [0.9, 1, 1.1] : [1]) {
          for (const highFactor of zero ? [0.9, 1, 1.1] : [1]) {
            const naiveGear = { bits, zero, calib: false };
            const locks = { ranges: [range], lows: [-range * lowFactor], highs: [range * highFactor] };
            let damage = 0;
            let bytes = 0;
            for (const essence of waves) {
              const model = buildSpell(essence, naiveGear, locks, power, foe.floor);
              damage += model.damage;
              bytes += model.cost;
            }
            if (damage / bytes > best.rate) best = { rate: damage / bytes, damage, bytes, gear: naiveGear, locks };
          }
        }
      }
    }
  }
  const intendedRate = intendedDamage / intendedBytes;
  t.diagnostic('Baseline never reads a live wave or selects a range by forecast: one fixed symmetric/affine range across three calm and three storm turns, every uniform bit choice. Searches 0.4..2.4 by 0.025 plus0.49, with affine edge factors0.9/1/1.1. Calibrated locks use independent public past samples.');
  t.diagnostic(JSON.stringify({ id: 'brine', intended: { damage: intendedDamage, bytes: intendedBytes, damagePerByte: intendedRate, waves: intended.map((model) => ({ fidelity: model.fidelity, damage: model.damage, bytes: model.cost })) }, naive: best, ratio: intendedRate / best.rate }));
  assert.ok(best.damage > 0);
  assert.ok(intendedRate >= best.rate * 1.5);
});

function simulate(foeId, lockError = 0) {
  const foe = FOES[foeId];
  const maxHp = 40 + 8 * foe.zone;
  const maxBytes = 40 + 8 * foe.zone; // No shard upgrades, no extra caches.
  const power = 16 + 3 * foe.zone;
  let hp = maxHp;
  let bytes = maxBytes;
  let snacks = 3;
  let foeHp = foe.hp;
  let casts = 0;
  let guards = 0;
  let spent = 0;
  let dealt = 0;
  let minimumBytes = bytes;
  const threads = foe.zone === 3 ? Array.from({ length: 3 }, (_, i) => Math.floor(foe.hp / 3) + Number(i < foe.hp % 3)) : null;
  const random = seeded(987 + foe.zone);
  for (let turn = 0; turn < 100; turn++) {
    bytes = Math.min(maxBytes, bytes + 4);
    const phase = foe.zone === 6 && foeHp <= foe.hp / 2 ? 2 : 1;
    const essence = createEssence(foeId, turn, random, phase);
    const gear = intendedGear(foeId, phase);
    const model = buildSpell(essence, gear, perturbedLocks(essence, gear, lockError), power, foe.floor);
    let brace = false;
    if (hp <= maxHp / 2 && snacks > 0) {
      hp = Math.min(maxHp, hp + Math.ceil(maxHp / 2));
      snacks--;
    } else if (model.cost > bytes) {
      bytes = Math.min(maxBytes, bytes + 12);
      guards++;
      brace = true;
    } else {
      bytes -= model.cost;
      spent += model.cost;
      casts++;
      const before = foeHp;
      if (threads) {
        for (let i = 0; i < threads.length; i++) threads[i] = Math.max(0, threads[i] - model.threadDamages[i]);
        foeHp = threads.reduce((sum, value) => sum + value, 0);
      } else {
        foeHp = Math.max(0, foeHp - model.damage);
      }
      dealt += before - foeHp;
    }
    minimumBytes = Math.min(minimumBytes, bytes);
    if (foeHp === 0) return { won: true, turns: turn + 1, casts, guards, spent, dealt, hp, bytes, snacks, minimumBytes };
    // Good (not perfect) timed guards: 0.6 damage, no perfect-guard byte refunds.
    const attack = attackFor(foeId, turn, phase);
    for (let hit = 0; hit < attack.hits.length; hit++) hp -= Math.max(1, Math.round(attack.hits[hit] * 0.6 * (brace && hit === 0 ? 0.5 : 1)));
    if (hp <= 0) return { won: false, turns: turn + 1, casts, guards, spent, dealt, hp, bytes, snacks, minimumBytes };
  }
  return { won: false, turns: 100, casts, guards, spent, dealt, hp, bytes, snacks, minimumBytes };
}

test('all guardians have a winnable byte/HP economy, including nonzero range-lock error', (t) => {
  t.diagnostic('Economy: natural progression power/HP/bytes, zero shards, three snacks, +4B each turn, +12B GUARD, good0.6 timed guards with NO +2B refunds. Snacks and guards take turns; Auric switches phase; Spindle must empty all three independent bars.');
  for (const foeId of GUARDIANS) {
    for (const lockError of [0, 0.02]) {
      const result = simulate(foeId, lockError);
      t.diagnostic(JSON.stringify({ foeId, lockError, ...result }));
      assert.ok(result.won, `${foeId} should be winnable at ${(lockError * 100).toFixed(0)}% range error`);
      assert.ok(result.minimumBytes >= 0);
      assert.ok(result.hp > 0);
      assert.ok(result.turns >= 5 && result.turns <= 15, `${foeId} should expose its pattern without becoming an endurance grind`);
      assert.ok(result.guards > 0 || result.snacks < 3, 'decent play still needs an economy or recovery decision');
      assert.equal(result.dealt, FOES[foeId].hp);
    }
  }
});

test('four unguarded guardian turns threaten a full-health hero', () => {
  for (const foeId of GUARDIANS) {
    const foe = FOES[foeId];
    const incoming = [0, 1, 2, 3].flatMap(turn => attackFor(foeId, turn).hits).reduce((sum, damage) => sum + damage, 0);
    assert.ok(incoming >= 40 + 8 * foe.zone, `${foeId} must punish ignoring timed guards, brace, and snacks`);
  }
});

test('all seven staticlings take at most three intended casts, even with 2% range error', (t) => {
  for (let zone = 0; zone < 7; zone++) {
    const foeId = `static-${zone}`;
    for (const lockError of [0, 0.02]) {
      const result = simulate(foeId, lockError);
      t.diagnostic(JSON.stringify({ foeId, lockError, ...result }));
      assert.ok(result.won, `${foeId} must be beatable`);
      assert.ok(result.casts >= 1 && result.casts <= 3, `${foeId} took ${result.casts} casts`);
    }
  }
});
