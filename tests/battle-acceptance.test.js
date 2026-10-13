import test from 'node:test';
import assert from 'node:assert/strict';
import { FOES, createEssence, intendedGear, attackFor } from '../src/battle/foes.js';
import { buildSpell, defaultLocks, rangeTargets, lockDomains, normalizeGear, damageFor } from '../src/battle/spell.js';
import { affineParams, symmetricParams, quantizeValue, fidelity, dot } from '../src/quantization.js';

// Numerical design evidence, not a continuous global-optimum proof or an LLM benchmark.
// Every search uses lockDomains, the same domains used by the live breathing UI.

const BITS = [2, 3, 4, 8];
const SEARCH_STEP = 0.025; // At most 2.5% of amax along EACH entire edge domain.
const SEARCH_RESTARTS = 4;
const SEARCH_PASSES = 3;
const cloneLocks = (locks) => structuredClone(locks);
const rate = (model) => model.damage / model.cost;

function seeded(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function naiveGears(zone) {
  const gears = [];
  for (const bits of zone === 0 ? [2, 3, 8] : BITS) {
    for (const zero of zone >= 2 ? [false, true] : [false]) {
      for (const groups of zone >= 4 ? [false, true] : [false]) {
        for (const spotlight of zone >= 5 ? [0, 1, 2] : [0]) {
          gears.push({ bits, zero, groups, spotlight });
        }
      }
    }
  }
  return gears;
}

function intendedLocks(essence, gear, alpha = 0.5) {
  const locks = defaultLocks(essence, gear);
  if (gear.balance) {
    locks.alpha = alpha;
    const targets = rangeTargets(essence, gear, locks);
    locks.ranges = targets.map((target) => target.amax || 1);
    locks.lows = targets.map((target) => target.min);
    locks.highs = targets.map((target) => target.max);
  }
  if (essence.hidden) {
    // Explicit public-forecast policy, never extrema from the hidden live row.
    const range = essence.storm ? 2.1 : 0.49;
    locks.ranges = [range];
    locks.lows = [-range];
    locks.highs = [range];
  }
  return locks;
}

function axis([low, high], spacing) {
  const intervals = Math.max(1, Math.ceil((high - low) / spacing));
  return Array.from({ length: intervals + 1 }, (_, i) => low + (high - low) * i / intervals);
}

/** Full rectangles for affine locks, not just a scaled covering interval. */
function lockCandidates(essence, gear, locks, group, step = SEARCH_STEP) {
  const domain = lockDomains(essence, gear, locks)[group];
  const target = rangeTargets(essence, gear, locks)[group];
  const amplitude = target.amax || 1;
  const qmax = gear.zero ? 2 ** gear.bits - 1 : 2 ** (gear.bits - 1) - 1;
  const candidates = [];
  const seen = new Set();
  const add = (x, y) => {
    const inBounds = (value, bounds) => Number.isFinite(value) && value >= bounds[0] - 1e-12 && value <= bounds[1] + 1e-12;
    if (gear.zero ? !inBounds(x, domain.lo) || !inBounds(y, domain.hi) : !inBounds(x, domain.r)) return;
    const key = `${x.toPrecision(14)}:${(y ?? 0).toPrecision(14)}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(gear.zero ? { lows: x, highs: y } : { ranges: x });
  };
  if (!gear.zero) {
    axis(domain.r, step * amplitude).forEach((value) => add(value));
    add(locks.ranges[group]);
    add(7 / 6 * amplitude); // The original review counterexample is explicitly reachable.
    for (const value of new Set(target.values.map(Math.abs))) {
      // Integer levels align values; half levels mark nearest-even code changes.
      for (let code = 0.5; code <= qmax; code += 0.5) add(qmax * value / code);
    }
  } else {
    for (const low of axis(domain.lo, step * amplitude)) {
      for (const high of axis(domain.hi, step * amplitude)) add(low, high);
    }
    add(locks.lows[group], locks.highs[group]);
    // Enumerate all zero codes at low-bit alignment/rounding breakpoints. A
    // scale and integer zero code define an affine grid; select REAL reachable
    // edges that produce it, rather than assuming [-r,r] is the affine domain.
    if (gear.bits <= 4) {
      for (const value of new Set(target.values.map(Math.abs))) {
        for (let code = 0.5; code <= qmax; code += 0.5) {
          const scale = value / code;
          if (!scale) continue;
          for (let zero = 0; zero <= qmax; zero++) {
            const lower = Math.max(-domain.lo[1], qmax * scale - domain.hi[1], (zero - 0.499999) * scale);
            const upper = Math.min(-domain.lo[0], qmax * scale - domain.hi[0], (zero + 0.499999) * scale);
            if (lower <= upper) {
              const negativeSpan = (lower + upper) / 2;
              add(-negativeSpan, qmax * scale - negativeSpan);
            }
          }
        }
      }
    }
  }
  return candidates;
}

/**
 * Deterministic multistart coordinate search over complete per-group candidate
 * banks. Reconstruction is cached, not damage: final output is buildSpell's.
 * Multiple groups are not an exhaustive Cartesian product; diagnostics say so.
 */
function searchLocks(essence, gear, power, floor, { step = SEARCH_STEP, restarts = SEARCH_RESTARTS, protected: selected } = {}) {
  const covering = defaultLocks(essence, gear);
  if (selected) Object.assign(covering, { protected: selected });
  const template = buildSpell(essence, gear, covering, power, floor);
  const rows = template.rows;
  const domains = lockDomains(essence, gear, covering);
  const banks = domains.map((_, group) => {
    const indices = rows.map((row, index) => row.group === group ? index : -1).filter((index) => index >= 0);
    return lockCandidates(essence, gear, covering, group, step).map((locks) => {
      const params = gear.zero ? affineParams(locks.lows, locks.highs, gear.bits) : symmetricParams(locks.ranges, gear.bits);
      const recon = indices.map((index) => rows[index].values.map((value, i) => rows[index].protected[i] ? value : quantizeValue(value, params).reconstructed));
      let error = 0;
      indices.forEach((index, r) => rows[index].values.forEach((value, i) => { error += (value - recon[r][i]) ** 2 * (essence.sensitivities?.[index] ?? 1); }));
      return { locks, indices, recon, error };
    });
  });
  const signal = template.reference.reduce((sum, value) => sum + value ** 2, 0);
  const score = (choice) => {
    if (essence.inputs) {
      const reconstructed = [];
      choice.forEach((index, group) => banks[group][index].indices.forEach((row, r) => { reconstructed[row] = banks[group][index].recon[r]; }));
      const weights = reconstructed[reconstructed.length - 1];
      const outputs = essence.inputs.map((input, token) => dot(essence.quantizeInputs ? reconstructed[token] : input, weights));
      return fidelity(template.reference, outputs);
    }
    if (essence.independentThreads) {
      let damage = 0;
      let threadSum = 0;
      choice.forEach((index, group) => banks[group][index].indices.forEach((row, r) => {
        const f = fidelity(rows[row].values, banks[group][index].recon[r]);
        damage += damageFor(f, power / rows.length, floor).damage;
        threadSum += f;
      }));
      return damage * 10 + threadSum;
    }
    const error = choice.reduce((sum, index, group) => sum + banks[group][index].error, 0);
    return Math.max(0, 1 - Math.sqrt(error / (signal || 1)));
  };
  let bestScore = -Infinity;
  let bestChoice;
  for (let restart = 0; restart < restarts; restart++) {
    const choice = banks.map((bank, group) => restart === 0
      ? bank.reduce((best, candidate, index) => candidate.error < bank[best].error ? index : best, 0)
      : Math.floor(((restart * 0.6180339 + group * 0.331) % 1) * bank.length));
    let current = score(choice);
    for (let pass = 0; pass < SEARCH_PASSES; pass++) {
      const before = current;
      for (let group = 0; group < banks.length; group++) {
        let bestIndex = choice[group];
        for (let index = 0; index < banks[group].length; index++) {
          choice[group] = index;
          const value = score(choice);
          if (value > current) { current = value; bestIndex = index; }
        }
        choice[group] = bestIndex;
      }
      if (current <= before + 1e-13) break;
    }
    if (current > bestScore) { bestScore = current; bestChoice = [...choice]; }
  }
  const locks = cloneLocks(covering);
  bestChoice.forEach((index, group) => Object.entries(banks[group][index].locks).forEach(([key, value]) => { locks[key][group] = value; }));
  return { model: buildSpell(essence, gear, locks, power, floor), locks, gear, domains, candidateCounts: banks.map((bank) => bank.length) };
}

/** Independent +/-3% corners as well as a seven-point common-error sweep. */
function perturbedLocks(locks, gear) {
  const keys = gear.zero ? ['lows', 'highs'] : ['ranges'];
  const coordinates = keys.flatMap((key) => locks[key].map((_, index) => ({ key, index })));
  const candidates = [];
  for (const error of [-0.03, -0.02, -0.01, 0, 0.01, 0.02, 0.03]) {
    const candidate = cloneLocks(locks);
    coordinates.forEach(({ key, index }) => { candidate[key][index] *= 1 + error; });
    candidates.push(candidate);
  }
  for (let mask = 0; mask < 2 ** coordinates.length; mask++) {
    const candidate = cloneLocks(locks);
    coordinates.forEach(({ key, index }, bit) => { candidate[key][index] *= mask & (1 << bit) ? 1.03 : 0.97; });
    candidates.push(candidate);
  }
  return candidates;
}

const GUARDIANS = ['nib', 'chime', 'brine', 'spindle', 'cinder', 'vesper', 'auric'];
const TECHNIQUES = ['bits', 'zero', 'calib', 'groups', 'spotlight', 'balance', 'budget'];
const summary = (model) => ({ fidelity: model.fidelity, damage: model.damage, bytes: model.cost, perfect: model.perfect, damagePerByte: rate(model) });

function bestOf(candidates) {
  return candidates.reduce((best, candidate) => !best || rate(candidate.model) > rate(best.model) ? candidate : best, null);
}

test('search includes the old wider lattice counterexample and all affine corners', () => {
  const essence = { rows: [{ label: 'Former Chime lattice', values: [-1, -1, 0, 0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 5, 6, 6].map((value) => value / 6) }] };
  const gear = { bits: 4 };
  const locks = defaultLocks(essence, gear);
  const candidates = lockCandidates(essence, gear, locks, 0);
  assert.ok(candidates.some((candidate) => Math.abs(candidate.ranges - 7 / 6) < 1e-12));
  const recovered = searchLocks(essence, gear, 19, FOES.chime.floor);
  assert.equal(recovered.model.damage, 24);
  assert.ok(recovered.model.fidelity > 1 - 1e-12);
  assert.ok(recovered.locks.ranges[0] > 1.11, 'the former narrow acceptance window cannot certify this search');
  const affineGear = { bits: 3, zero: true };
  const domain = lockDomains(essence, affineGear)[0];
  const affine = lockCandidates(essence, affineGear, defaultLocks(essence, affineGear), 0);
  for (const low of domain.lo) for (const high of domain.hi) {
    assert.ok(affine.some((candidate) => Math.abs(candidate.lows - low) < 1e-12 && Math.abs(candidate.highs - high) < 1e-12));
  }
});

function earlierPickerAlternatives(essence, power, floor, current, sameWidth, sameBit) {
  let best = current;
  const count = essence.weights?.length ?? essence.rows.reduce((sum, row) => sum + row.values.length, 0);
  // Any earlier Spotlight selection is allowed: Vesper's 16 weights or Auric's
  // 46 values. Enumerate EVERY single and pair, not only the suggested hottest
  // ones. Rectangles use .05*amax over the ENTIRE domain plus all low-bit
  // lattice alignments and rounding breakpoints.
  for (const bits of BITS) for (const zero of [false, true]) for (const groups of [false, true]) {
    for (const spotlight of [1, 2]) {
      const gear = { bits, zero, groups, spotlight };
      const packet = buildSpell(essence, gear, {}, power, floor).cost;
      // A proven perfect-damage upper bound, not a heuristic search cutoff.
      if (bits !== sameWidth && Math.round(power * 1.25) / packet <= rate(best.model)) continue;
      for (let first = 0; first < count; first++) {
        const lasts = spotlight === 1 ? [first] : Array.from({ length: count - 1 - first }, (_, i) => first + i + 1);
        for (const last of lasts) {
          const selected = spotlight === 1 ? [first] : [first, last];
          const candidate = searchLocks(essence, gear, power, floor, { protected: selected, step: 0.05 });
          if (rate(candidate.model) > rate(best.model)) best = candidate;
          if (bits === sameWidth && (!sameBit || candidate.model.damage > sameBit.model.damage)) sameBit = candidate;
        }
      }
    }
  }
  return { best, sameBit };
}

for (const id of GUARDIANS.filter((id) => id !== 'brine')) {
  test(`${id}: broad reachable locks, same-bit lesson, and +/-3% robustness`, (t) => {
    const foe = FOES[id];
    const power = 16 + 3 * foe.zone;
    t.diagnostic(JSON.stringify({ search: 'finite multistart coordinate search; not a continuous global-optimum proof', turns: [0, 3], seeds: [100, 103], symmetricDomain: '[.35,1.45]*amax', affineDomain: 'lo/hi extrema +/- .55*amax, zero included', step: SEARCH_STEP, restarts: SEARCH_RESTARTS, passes: SEARCH_PASSES, lattice: '7/6*amax; each value / integer and half-integer code; every reachable low-bit affine zero code', earlierTools: 'all applicable earlier toggles/counts; every prior Spotlight single/pair over full .05*amax rectangles, with perfect-damage upper bounds pruning only provably dominated widths', robustness: 'seven common relative-edge errors -3..3% plus every independent +/-3% corner; an exactly zero edge stays zero; Balance also samples alpha .47/.5/.53 with fresh covering rulers before range error' }));
    if (id === 'nib') t.diagnostic('Nib same-bit comparison is N/A: identical arithmetic. Taught 4 bits is compared against fully searched 2/3/8; no bits-specific bonus or fizzle override.');
    if (id === 'auric') t.diagnostic('Auric compares the same base 4-bit setting with/without Budget: uniform4 vs mixed8/2/2, then8/3/2. This is an equal-base/equal-payload comparison, NOT identical per-head widths. Actual payloads are23 vs22/24 B; all uniform widths remain in the any-bit baseline.');
    for (const turn of [0, 3]) {
      const phase = id === 'auric' && turn === 3 ? 2 : 1;
      const essence = createEssence(id, turn, seeded(100 + turn), phase, { successes: turn });
      const gear = intendedGear(id, phase, { successes: turn });
      const locks = intendedLocks(essence, gear);
      const intended = buildSpell(essence, gear, locks, power, foe.floor);
      const candidates = naiveGears(foe.zone).map((naive) => searchLocks(essence, naive, power, foe.floor));
      let best = bestOf(candidates);
      let sameBit = candidates.filter((candidate) => candidate.gear.bits === gear.bits).reduce((best, candidate) => !best || candidate.model.damage > best.model.damage ? candidate : best, null);
      if (foe.zone >= 5) ({ best, sameBit } = earlierPickerAlternatives(essence, power, foe.floor, best, gear.bits, sameBit));
      const imperfect = (gear.balance ? [0.47, 0.5, 0.53] : [0.5]).flatMap((alpha) =>
        perturbedLocks(intendedLocks(essence, gear, alpha), gear).map((candidate) => buildSpell(essence, gear, candidate, power, foe.floor)));
      const worst = imperfect.reduce((a, b) => rate(a) <= rate(b) ? a : b);
      const ratio = rate(intended) / rate(best.model);
      const robustRatio = rate(worst) / rate(best.model);
      t.diagnostic(JSON.stringify({ id, turn, phase, morph: essence.morphName, intended: { ...summary(intended), gear, locks }, naive: { ...summary(best.model), gear: best.gear, locks: best.locks, domains: best.domains, candidateCounts: best.candidateCounts }, sameBit: sameBit && summary(sameBit.model), worstLockError: summary(worst), ratio, robustRatio }));
      assert.ok(best.model.damage > 0, 'the best naive choice is usable, not an impossible straw opponent');
      assert.ok(ratio >= 1.2 - 1e-12, `${id} turn${turn}: ${ratio.toFixed(3)}x intended/best-naive damage per byte`);
      assert.ok(robustRatio >= 1 - 1e-12, `${id} turn${turn}: ${robustRatio.toFixed(3)}x at a reachable +/-3% lock error`);
      if (sameBit) assert.ok(intended.damage >= sameBit.model.damage * 1.2 + 2, 'same-bit (Auric equal-base) lesson decisively improves actual damage');
      if (id === 'nib') {
        const two = candidates.find((candidate) => candidate.gear.bits === 2).model;
        const eight = candidates.find((candidate) => candidate.gear.bits === 8).model;
        assert.ok(two.damage <= intended.damage / 4, 'even optimized 2-bit is weak');
        assert.ok(eight.damage <= intended.damage && eight.cost > intended.cost, '8-bit does not buy a stronger leaf hit');
      }
    }
  });
}

test('Brine: a forecast policy on a fixed ruler beats a full-domain fixed-policy baseline', (t) => {
  const foe = FOES.brine;
  const power = 22;
  const waves = Array.from({ length: 6 }, (_, turn) => createEssence('brine', turn, seeded(200 + turn)));
  const gear = intendedGear('brine');
  const models = waves.map((essence) => buildSpell(essence, gear, intendedLocks(essence, gear), power, foe.floor));
  const intended = { damage: models.reduce((sum, model) => sum + model.damage, 0), cost: models.reduce((sum, model) => sum + model.cost, 0) };
  const worst = { damage: waves.reduce((sum, essence) => sum + Math.min(...perturbedLocks(intendedLocks(essence, gear), gear).map((locks) => buildSpell(essence, gear, locks, power, foe.floor).damage)), 0), cost: intended.cost };
  let best;
  let sameBit;
  for (const bits of BITS) for (const zero of [false, true]) {
    const naive = { bits, zero, calib: false };
    const base = defaultLocks(waves[0], naive);
    // .025 ABSOLUTE units: full symmetric [.15,2.4] and full independent affine
    // [-2.4,0] x [0,2.4]. Add public archive lattices and both forecast ranges.
    const candidates = lockCandidates(waves[0], naive, base, 0, 0.025 / 2.2);
    candidates.push(...(zero ? [{ lows: -0.49, highs: 0.49 }, { lows: -2.1, highs: 2.1 }] : [{ ranges: 0.49 }, { ranges: 2.1 }]));
    for (const edges of candidates) {
      const locks = cloneLocks(base);
      for (const [key, value] of Object.entries(edges)) locks[key][0] = value;
      const results = waves.map((essence) => buildSpell(essence, naive, locks, power, foe.floor));
      const candidate = { damage: results.reduce((sum, model) => sum + model.damage, 0), cost: results.reduce((sum, model) => sum + model.cost, 0), gear: naive, locks };
      if (!best || rate(candidate) > rate(best)) best = candidate;
      if (bits === gear.bits && (!sameBit || rate(candidate) > rate(sameBit))) sameBit = candidate;
    }
  }
  t.diagnostic(JSON.stringify({ id: 'brine', turns: [0, 1, 2, 3, 4, 5], seeds: '200+turn', domain: lockDomains(waves[0], gear), step: '.025 absolute per edge, including independent affine edges and archive lattice breakpoints', policy: 'one fixed naive lock for all six waves at every width; intended explicit forecast picks .49 calm / 2.1 storm, never hidden live values', intended, waves: models.map(summary), naive: best, sameBit, worst, ratio: rate(intended) / rate(best), robustRatio: rate(worst) / rate(best) }));
  assert.ok(rate(intended) >= rate(best) * 1.2);
  assert.ok(rate(worst) >= rate(best));
  assert.ok(intended.damage >= sameBit.damage * 1.2 + 2);
  const calm = waves[0];
  const storm = waves[1];
  assert.ok(buildSpell(storm, gear, { ranges: [0.49] }, power, foe.floor).clippedCount > 0);
  assert.equal(buildSpell(storm, gear, { ranges: [0.49] }, power, foe.floor).damage, 0);
  assert.ok(buildSpell(calm, gear, { ranges: [2.1] }, power, foe.floor).fidelity < models[0].fidelity - 0.1);
});

function simulate(foeId, error = 0, { preStone = false, timed = true } = {}) {
  const foe = FOES[foeId];
  const maxHp = 40 + 8 * foe.zone;
  const maxBytes = 40 + 8 * foe.zone;
  const power = 16 + 3 * foe.zone;
  let hp = maxHp;
  let bytes = maxBytes;
  let snacks = 3;
  let foeHp = foe.hp;
  let successes = 0;
  let casts = 0;
  let guards = 0;
  let charges = 0;
  let spent = 0;
  let phaseTwoCasts = 0;
  let guardStreak = 0;
  let maxGuardStreak = 0;
  const actions = [];
  const threads = foe.zone === 3 ? Array.from({ length: 3 }, (_, i) => Math.floor(foe.hp / 3) + Number(i < foe.hp % 3)) : null;
  for (let turn = 0; turn < 40; turn++) {
    bytes = Math.min(maxBytes, bytes + 4);
    const phase = foe.zone === 6 && (foeHp <= foe.hp / 2 || successes >= 2) ? 2 : 1;
    const essence = createEssence(foeId, turn, seeded(987 + foe.zone + turn), phase, { successes });
    // Before this zone's stone, even its new switch is unavailable. Fine 8-bit
    // arithmetic is always unlocked; practice signals, not a secret multiplier,
    // make that expensive fallback usable in at most three casts.
    const gear = preStone ? normalizeGear({ bits: 8 }, TECHNIQUES.slice(0, Math.max(1, foe.zone))) : intendedGear(foeId, phase, { successes });
    const locks = intendedLocks(essence, gear);
    for (const key of gear.zero ? ['lows', 'highs'] : ['ranges']) locks[key] = locks[key].map((value) => value * (1 + error));
    const model = buildSpell(essence, gear, locks, power, foe.floor);
    let brace = false;
    if (timed && hp <= maxHp / 2 && snacks > 0) {
      hp = Math.min(maxHp, hp + Math.ceil(maxHp / 2));
      snacks--;
      actions.push('snack');
      guardStreak = 0;
    } else if (model.cost > bytes) {
      bytes = Math.min(maxBytes, bytes + 12);
      guards++;
      brace = true;
      actions.push('guard');
      maxGuardStreak = Math.max(maxGuardStreak, ++guardStreak);
    } else {
      bytes -= model.cost;
      spent += model.cost;
      casts++;
      guardStreak = 0;
      actions.push(`cast:${model.damage}/${model.cost}`);
      if (phase >= 2) phaseTwoCasts++;
      if (model.damage > 0) successes++;
      if (threads) {
        for (let i = 0; i < threads.length; i++) threads[i] = Math.max(0, threads[i] - model.threadDamages[i]);
        foeHp = threads.reduce((sum, value) => sum + value, 0);
      } else foeHp = Math.max(0, foeHp - model.damage);
    }
    const result = { won: foeHp === 0, turns: turn + 1, casts, guards, charges, spent, hp, bytes, snacks, phaseTwoCasts, maxGuardStreak, actions };
    if (!foeHp) return result;
    const attack = attackFor(foeId, turn, phase);
    charges += Number(attack.charge);
    for (let hit = 0; hit < attack.hits.length; hit++) hp -= Math.max(1, Math.round(attack.hits[hit] * (timed ? 0.6 : 1) * (brace && hit === 0 ? 0.5 : 1)));
    if (hp <= 0) return { ...result, won: false, hp, charges };
  }
  return { won: false, casts, guards, hp, bytes, actions };
}

test('short guardian fights expose charge, morph, and a viable imperfect-lock economy', (t) => {
  t.diagnostic('Natural progression: power16+3z, HP/B40+8z, no shards, +4B per turn, GUARD+12B/half first hit, three snacks, GOOD0.6 timed guards, no PERFECT guard refunds. Successful casts drive morphs; every Spindle thread must empty.');
  for (const id of GUARDIANS) for (const error of [0, -0.03, 0.03]) {
    const result = simulate(id, error);
    t.diagnostic(JSON.stringify({ id, error, ...result }));
    assert.ok(result.won, `${id} remains winnable at ${error * 100}% range error`);
    assert.ok(result.hp > 0 && result.bytes >= 0);
    assert.ok(result.charges >= 1, 'even the shortest guardian shows a charge');
    assert.ok(result.turns <= 15, 'no endurance/recharge tail');
    if (error === 0) {
      if (FOES[id].zone <= 1) assert.equal(result.casts, 3);
      else if (id === 'auric') {
        assert.ok(result.casts >= 4 && result.casts <= 5);
        assert.ok(result.phaseTwoCasts >= 2);
        assert.ok(result.maxGuardStreak <= 1, 'no two-byte extra recharge after a guard');
      } else assert.ok(result.casts >= 4 && result.casts <= 5, 'middle fights need about four clean casts');
    }
  }
});

test('ignoring guards is dangerous and earlier-tool staticlings remain short', (t) => {
  let losses = 0;
  for (const id of GUARDIANS) {
    const foe = FOES[id];
    const incoming = [0, 1, 2, 3].flatMap((turn) => attackFor(id, turn).hits).reduce((sum, value) => sum + value, 0);
    assert.ok(incoming >= 40 + 8 * foe.zone, `${id} punishes four unguarded turns`);
    losses += Number(!simulate(id, 0.03, { timed: false }).won);
  }
  assert.ok(losses >= 4, 'without timed guards/recovery several fights can actually be lost');
  for (let zone = 0; zone < 7; zone++) for (const error of [0, 0.03]) {
    const id = `static-${zone}`;
    const result = simulate(id, error, { preStone: true });
    t.diagnostic(JSON.stringify({ id, preStone: true, error, ...result }));
    assert.ok(result.won && result.casts <= 3, `${id}: earlier techniques/8-bit should finish within three casts`);
  }
});
