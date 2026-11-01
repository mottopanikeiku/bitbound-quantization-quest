// Offline numerical certification; run with node scripts/motif-audit.mjs.
// Full-domain searches and every earlier Spotlight picker live here, not in unit tests.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { SPECIES, WARDENS } from '../src/content/static-dex.js';
import { MOTIFS, WARDEN_MOTIFS, createMotifEssence, createWardenEssence, motifIntendedGear, motifPar, motifHp } from '../src/battle/species.js';
import { FOES, createEssence } from '../src/battle/foes.js';
import { buildSpell, defaultLocks, rangeTargets, lockDomains, damageFor } from '../src/battle/spell.js';
import { symmetricParams, affineParams, quantizeValue, fidelity, dot } from '../src/quantization.js';

const certificates = [];
let failures = 0;
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const mathFingerprint = createHash('sha256').update(['quantization.js', 'battle/spell.js', 'battle/metrics.js'].map(path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')).join('\\n')).digest('hex');
function test(name, run) {
  try {
    run({ diagnostic(message) {
      const row = JSON.parse(message);
      certificates.push(row);
      console.log(message);
    } });
    console.log(`PASS ${name}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

const BITS = [2, 3, 4, 8];
const rate = spell => spell.damage / spell.cost;
const rng = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const axis = ([lo, hi], spacing) => {
  const intervals = Math.max(1, Math.ceil((hi - lo) / spacing));
  return Array.from({ length: intervals + 1 }, (_, i) => lo + (hi - lo) * i / intervals);
};
function intendedLocks(essence, gear, alpha = 0.5) {
  const locks = defaultLocks(essence, gear);
  if (gear.balance) {
    locks.alpha = alpha;
    const targets = rangeTargets(essence, gear, locks);
    locks.ranges = targets.map(target => target.amax || 1);
    locks.lows = targets.map(target => target.min);
    locks.highs = targets.map(target => target.max);
  }
  if (essence.hidden) locks.ranges = [essence.storm ? 2.1 : 0.49];
  return locks;
}

// Full live UI domains, low-bit integer/half-code lattices, and the 7/6 counterexample.
// Multistart coordinate search for multiple groups is evidence, not an analytic global optimum.
function candidates(essence, gear, locks, group) {
  const domain = lockDomains(essence, gear, locks)[group];
  const target = rangeTargets(essence, gear, locks)[group];
  const amplitude = target.amax || 1;
  const spacing = essence.hidden ? 0.025 : amplitude * 0.025;
  const qmax = gear.zero ? 2 ** gear.bits - 1 : 2 ** (gear.bits - 1) - 1;
  const result = [];
  const seen = new Set();
  function add(a, b) {
    const within = (v, d) => v >= d[0] - 1e-12 && v <= d[1] + 1e-12;
    if (gear.zero ? !within(a, domain.lo) || !within(b, domain.hi) : !within(a, domain.r)) return;
    const key = `${a.toPrecision(12)}:${b?.toPrecision(12)}`;
    if (!seen.has(key)) { seen.add(key); result.push(gear.zero ? { lows: a, highs: b } : { ranges: a }); }
  }
  if (!gear.zero) {
    for (const r of axis(domain.r, spacing)) add(r);
    add(locks.ranges[group]); add(7 * amplitude / 6);
    for (const value of new Set(target.values.map(Math.abs))) for (let code = 0.5; code <= qmax; code += 0.5) add(qmax * value / code);
  } else {
    for (const lo of axis(domain.lo, spacing)) for (const hi of axis(domain.hi, spacing)) add(lo, hi);
    add(locks.lows[group], locks.highs[group]);
    if (gear.bits <= 4) for (const value of new Set(target.values.map(Math.abs))) for (let code = 0.5; code <= qmax; code += 0.5) {
      const scale = value / code;
      if (!scale) continue;
      for (let zero = 0; zero <= qmax; zero++) {
        const lo = Math.max(-domain.lo[1], qmax * scale - domain.hi[1], (zero - 0.499999) * scale);
        const hi = Math.min(-domain.lo[0], qmax * scale - domain.hi[0], (zero + 0.499999) * scale);
        if (lo <= hi) add(-(lo + hi) / 2, qmax * scale - (lo + hi) / 2);
      }
    }
  }
  return result;
}

const bankCache = new WeakMap();
function search(essence, gear, floor, selected) {
  const covering = defaultLocks(essence, gear);
  if (selected) covering.protected = selected;
  const template = buildSpell(essence, gear, covering, 22, floor);
  let cache = bankCache.get(essence);
  if (!cache) { cache = new Map(); bankCache.set(essence, cache); }
  const banks = lockDomains(essence, gear, covering).map((_, group) => {
    const indices = template.rows.map((row, i) => row.group === group ? i : -1).filter(i => i >= 0);
    const key = `${gear.bits}:${gear.zero}:${indices}:${indices.map(i => template.rows[i].protected.map(Number).join('')).join(':')}`;
    const cacheable = indices.every(i => !template.rows[i].protected.some(Boolean));
    if (cache.has(key)) return cache.get(key);
    const bank = candidates(essence, gear, covering, group).map(edges => {
      const params = gear.zero ? affineParams(edges.lows, edges.highs, gear.bits) : symmetricParams(edges.ranges, gear.bits);
      const rows = indices.map(i => template.rows[i].values.map((value, j) => template.rows[i].protected[j] ? value : quantizeValue(value, params).reconstructed));
      const error = indices.reduce((sum, i, r) => sum + template.rows[i].values.reduce((s, value, j) => s + (value - rows[r][j]) ** 2 * (essence.sensitivities?.[i] ?? 1), 0), 0);
      return { edges, indices, rows, error };
    });
    if (cacheable) cache.set(key, bank);
    return bank;
  });
  function evaluate(choice) {
    const locks = structuredClone(covering);
    choice.forEach((index, group) => Object.entries(banks[group][index].edges).forEach(([key, value]) => { locks[key][group] = value; }));
    return buildSpell(essence, gear, locks, 22, floor);
  }
  if (!essence.inputs) {
    const choice = banks.map(bank => bank.reduce((best, candidate, i) => {
      if (!essence.independentThreads) return candidate.error < bank[best].error ? i : best;
      const score = item => item.rows.reduce((sum, row, r) => sum + damageFor(fidelity(template.rows[item.indices[r]].values, row), 22 / template.rows.length, floor).damage, 0);
      return score(candidate) > score(bank[best]) ? i : best;
    }, 0));
    return evaluate(choice);
  }
  function score(choice) {
    if (essence.inputs || essence.independentThreads) {
      const rows = [];
      choice.forEach((index, group) => banks[group][index].indices.forEach((i, r) => { rows[i] = banks[group][index].rows[r]; }));
      if (essence.inputs) return fidelity(template.reference, essence.inputs.map((input, token) => dot(essence.quantizeInputs ? rows[token] : input, rows[rows.length - 1])));
      // Real rounded per-thread damage, including dead threads, determines efficiency.
      return rows.reduce((sum, row, i) => sum + damageFor(fidelity(template.rows[i].values, row), 22 / rows.length, floor).damage, 0) / template.cost;
    }
    return -choice.reduce((sum, index, group) => sum + banks[group][index].error, 0);
  }
  let best;
  for (let restart = 0; restart < 4; restart++) {
    const choice = banks.map((bank, group) => restart === 0 ? bank.reduce((i, item, j) => item.error < bank[i].error ? j : i, 0) : Math.floor(((restart * 0.6180339 + group * 0.331) % 1) * bank.length));
    let current = score(choice);
    for (let pass = 0; pass < 3; pass++) for (let group = 0; group < banks.length; group++) {
      let chosen = choice[group];
      for (let i = 0; i < banks[group].length; i++) {
        choice[group] = i;
        const value = score(choice);
        if (value > current) { current = value; chosen = i; }
      }
      choice[group] = chosen;
    }
    const spell = evaluate(choice);
    if (!best || rate(spell) > rate(best)) best = spell;
  }
  return best;
}

function bestEarlier(essence, zone, floor, intended) {
  let best = { damage: 0, cost: 1 };
  for (const bits of zone === 0 ? [2, 3, 8] : BITS) for (const zero of zone >= 2 ? [false, true] : [false]) for (const groups of zone >= 4 ? [false, true] : [false]) for (const spotlight of zone >= 5 ? [0, 1, 2] : [0]) {
    const gear = { bits, zero, groups, spotlight };
    const count = essence.weights?.length ?? essence.rows.reduce((s, row) => s + row.values.length, 0);
    const cost = buildSpell(essence, gear, {}, 22, floor).cost;
    const upper = essence.independentThreads ? 3 * Math.round(22 / 3 * 1.25) / cost : Math.round(22 * 1.25) / cost;
    if (upper <= rate(best)) continue; // Proven perfect-damage bound, never a heuristic cutoff.
    const selections = spotlight === 0 ? [undefined] : Array.from({ length: count }, (_, first) => spotlight === 1 ? [[first]] : Array.from({ length: count - first - 1 }, (_, j) => [first, first + j + 1])).flat();
    for (const selection of selections) {
      const spell = search(essence, gear, floor, selection);
      if (rate(spell) > rate(best)) best = spell;
    }
  }
  return best;
}

function corners(locks, gear, essence) {
  const templates = gear.balance && essence ? [0.47, 0.5, 0.53].map(alpha => intendedLocks(essence, gear, alpha)) : [locks];
  return templates.flatMap(template => {
    const coordinates = (gear.zero ? ['lows', 'highs'] : ['ranges']).flatMap(key => template[key].map((_, i) => [key, i]));
    return Array.from({ length: 2 ** coordinates.length }, (_, mask) => {
      const copy = structuredClone(template);
      coordinates.forEach(([key, i], bit) => { copy[key][i] *= mask & (1 << bit) ? 1.03 : 0.97; });
      return copy;
    });
  });
}

// Lead clarification: the seven unchanged v2 practice origins are diagnostic,
// not new technique-advantage puzzles; all new species and wardens are strict.
for (const entry of [...SPECIES, ...WARDENS]) {
  const provider = MOTIFS[entry.id] ? createMotifEssence : createWardenEssence;
  test(`${entry.id}: deterministic structure, 32 seeds and drift endpoints, robust reachable intended locks`, () => {
    for (const stage of [0, 2]) for (const seed of [...Array.from({ length: 32 }, (_, i) => i + 1), 0, 1]) {
      const random = seed === 0 ? () => 0 : seed === 1 ? () => 1 : rng(seed);
      const x = provider(entry.id, stage, random, 1, { successes: stage });
      const y = provider(entry.id, stage, seed === 0 ? () => 0 : seed === 1 ? () => 1 : rng(seed), 1, { successes: stage });
      assert.deepEqual(x, y);
      assert.equal(x.kind, entry.family);
      assert.ok(x.rows.every(row => typeof row.label === 'string' && row.values.every(Number.isFinite)));
      assert.equal(typeof x.hidden, 'boolean');
      const gear = motifIntendedGear(entry.id, 1, { successes: stage });
      const locks = intendedLocks(x, gear);
      const nominal = buildSpell(x, gear, locks, 22, FOES[`static-${entry.zone}`].floor);
      if (!entry.origin) assert.ok(Math.min(...(nominal.threadFidelities ?? [nominal.fidelity])) >= 0.95 - 1e-12);
      const domains = lockDomains(x, gear, locks);
      const keys = gear.zero ? ['lows', 'highs'] : ['ranges'];
      const coords = keys.flatMap(key => locks[key].map((_, i) => [key, i]));
      for (let mask = 0; mask < 2 ** coords.length; mask++) {
        const perturbed = structuredClone(locks);
        coords.forEach(([key, i], bit) => { perturbed[key][i] *= mask & (1 << bit) ? 1.03 : 0.97; });
        for (const [key, i] of coords) {
          const domain = domains[i][key === 'ranges' ? 'r' : key === 'lows' ? 'lo' : 'hi'];
          assert.ok(perturbed[key][i] >= domain[0] - 1e-12 && perturbed[key][i] <= domain[1] + 1e-12);
        }
        const spell = buildSpell(x, gear, perturbed, 22, FOES[`static-${entry.zone}`].floor);
        const floor = FOES[`static-${entry.zone}`].floor;
        if (!entry.origin) assert.ok((spell.threadFidelities ? Math.min(...spell.threadFidelities) : spell.fidelity) >= Math.min(0.95, floor + 0.15) - 1e-12, `${entry.id} stage${stage}: ${spell.fidelity} threads ${spell.threadFidelities}`);
      }
    }
    if (entry.origin) assert.deepEqual(provider(entry.id, 3, rng(9), 2, { successes: 3 }), createEssence(`static-${entry.zone}`, 3, rng(9), 2, { successes: 3 }));
    assert.ok(motifPar(entry.id).bytes > 0 && motifPar(entry.id).turns >= 2);
  });
  if (entry.zone !== 2) test(`${entry.id}: intended packet beats all earlier tools in broad reachable search`, t => {
    for (const successes of [0, 2]) for (const shape of entry.origin ? [0] : [0, 1]) {
      let draw = 0;
      const essence = provider(entry.id, successes, entry.origin ? () => 0.5 : () => draw++ === 0 ? (shape + 0.5) / 64 : 0.5, 1, { successes });
      const gear = motifIntendedGear(entry.id, 1, { successes });
      const floor = FOES[`static-${entry.zone}`].floor;
      const intended = buildSpell(essence, gear, intendedLocks(essence, gear), 22, floor);
      const earlier = bestEarlier(essence, entry.zone, floor, intended);
      const ratio = rate(intended) / rate(earlier);
      const cornerSpells = corners(intendedLocks(essence, gear), gear, essence).map(locks => buildSpell(essence, gear, locks, 22, floor));
      const worst = Math.min(...cornerSpells.map(rate));
      const minFidelity = Math.min(...cornerSpells.flatMap(spell => spell.threadFidelities ?? [spell.fidelity]));
      const affordable = spell => ({ charge56: Math.floor(56 / spell.cost), charge64: Math.floor(64 / spell.cost) });
      t.diagnostic(JSON.stringify({ id: entry.id, successes, shape, fingerprint: fingerprint([essence, gear, floor]), grandfathered: !!entry.origin, hp: motifHp(entry.id), ratio, robustRatio: worst / rate(earlier), minFidelity, intended: { fidelity: intended.fidelity, damage: intended.damage, cost: intended.cost, affordable: affordable(intended) }, earlier: { fidelity: earlier.fidelity, damage: earlier.damage, cost: earlier.cost, affordable: affordable(earlier) } }));
      if (!entry.origin) {
        assert.ok(ratio >= 1.2 - 1e-12, `${entry.id} stage${successes}: ${ratio}x`);
        assert.ok(worst >= rate(earlier) - 1e-12, `${entry.id} stage${successes}: robust ratio ${worst / rate(earlier)}`);
        // Common scale, cyclic reordering and joint channel permutation conjugate
        // the same quantizers/domains; certify each shape once, then exercise its
        // transformed casts over 32 seeded drifts and both declared endpoints.
        for (let seed = 0; seed <= 33; seed++) {
          let draw = 0;
          const source = rng(seed);
          const random = () => draw++ === 0 ? (shape + 0.5) / 64 : seed === 0 ? 0 : seed === 33 ? 1 : source();
          const sample = provider(entry.id, seed, random, 1, { successes });
          const sampleLocks = intendedLocks(sample, gear);
          const spell = buildSpell(sample, gear, sampleLocks, 22, floor);
          assert.ok(rate(spell) >= 1.2 * rate(earlier) - 1e-12, `${entry.id} shape${shape} seed${seed}: nominal ratio ${rate(spell) / rate(earlier)}`);
          for (const locks of corners(sampleLocks, gear, sample)) {
            const corner = buildSpell(sample, gear, locks, 22, floor);
            assert.ok(rate(corner) >= rate(earlier) - 1e-12, `${entry.id} shape${shape} seed${seed}: robust ratio ${rate(corner) / rate(earlier)}`);
          }
        }
      }
    }
  });
}

for (const entry of [...SPECIES, ...WARDENS].filter(entry => entry.zone === 2)) {
  test(`${entry.id}: truthful public forecast beats full-domain fixed earlier policy`, t => {
    const provider = entry.origin || MOTIFS[entry.id] ? createMotifEssence : createWardenEssence;
    for (const successes of [0, 2]) for (const shape of entry.origin ? [0] : [0, 1]) {
      const waves = Array.from({ length: 12 }, (_, turn) => {
        let draw = 0;
        return provider(entry.id, turn, entry.origin ? () => 0.5 : () => draw++ === 0 ? (shape + 0.5) / 64 : 0.5, 1, { successes });
      });
      const floor = FOES['static-2'].floor;
      const gear = motifIntendedGear(entry.id);
      const intended = waves.map(wave => buildSpell(wave, gear, intendedLocks(wave, gear), 22, floor));
      const intendedRate = intended.reduce((s, spell) => s + spell.damage, 0) / intended.reduce((s, spell) => s + spell.cost, 0);
      const worstRate = waves.reduce((s, wave) => s + Math.min(...corners(intendedLocks(wave, gear), gear).map(locks => buildSpell(wave, gear, locks, 22, floor).damage)), 0) / intended.reduce((s, spell) => s + spell.cost, 0);
      let best = 0;
      let bestCost = 0;
      for (const bits of BITS) for (const zero of [false, true]) {
        const earlierGear = { bits, zero };
        const cost = buildSpell(waves[0], earlierGear, {}, 22, floor).cost;
        if (Math.round(22 * 1.25) / cost <= best) continue;
        const locks = defaultLocks(waves[0], earlierGear);
        const bank = candidates(waves[0], earlierGear, locks, 0);
        for (const edges of bank) {
          const policy = structuredClone(locks);
          for (const [key, value] of Object.entries(edges)) policy[key][0] = value;
          const damage = waves.reduce((sum, wave) => sum + buildSpell(wave, earlierGear, policy, 22, floor).damage, 0);
          const candidate = damage / (cost * waves.length);
          if (candidate > best) { best = candidate; bestCost = cost; }
        }
      }
      const affordable = cost => ({ charge56: Math.floor(56 / cost), charge64: Math.floor(64 / cost) });
      t.diagnostic(JSON.stringify({ id: entry.id, successes, shape, fingerprint: fingerprint([waves, gear, floor]), grandfathered: !!entry.origin, ratio: intendedRate / best, robustRatio: worstRate / best, minFidelity: Math.min(...waves.flatMap(wave => corners(intendedLocks(wave, gear), gear).map(locks => buildSpell(wave, gear, locks, 22, floor).fidelity))), intended: { fidelity: Math.min(...intended.map(spell => spell.fidelity)), damage: intendedRate * intended[0].cost, cost: intended[0].cost, affordable: affordable(intended[0].cost) }, earlier: { damage: best * bestCost, cost: bestCost, affordable: affordable(bestCost) } }));
      if (!entry.origin) { assert.ok(intendedRate >= 1.2 * best - 1e-12); assert.ok(worstRate >= best - 1e-12); }
      if (!entry.origin) for (let seed = 0; seed <= 33; seed++) {
        const samples = Array.from({ length: 12 }, (_, turn) => {
          let draw = 0;
          const source = rng(seed + turn * 17);
          return provider(entry.id, turn, () => draw++ === 0 ? (shape + 0.5) / 64 : seed === 0 ? 0 : seed === 33 ? 1 : source(), 1, { successes });
        });
        const models = samples.map(sample => buildSpell(sample, gear, intendedLocks(sample, gear), 22, floor));
        const rate = models.reduce((s, spell) => s + spell.damage, 0) / models.reduce((s, spell) => s + spell.cost, 0);
        const robust = samples.reduce((s, sample) => s + Math.min(...corners(intendedLocks(sample, gear), gear).map(locks => buildSpell(sample, gear, locks, 22, floor).damage)), 0) / models.reduce((s, spell) => s + spell.cost, 0);
        assert.ok(rate >= 1.2 * best - 1e-12);
        assert.ok(robust >= best - 1e-12);
      }
      for (const wave of waves) {
        assert.equal(wave.hidden, true);
        assert.deepEqual(lockDomains(wave, gear)[0].r, [0.15, 2.4]);
        assert.ok(wave.forecast.startsWith(wave.storm ? 'Storm' : 'Calm'));
        assert.notDeepEqual(wave.rows[0].values, wave.archive[wave.storm ? 'storm' : 'calm']);
      }
    }
  });
}

test('all 64 fixture arrangements preserve numerical teaching and modifiers keep channel pairs', () => {
  for (const entry of [...SPECIES.filter(entry => !entry.origin), ...WARDENS]) {
    const provider = MOTIFS[entry.id] ? createMotifEssence : createWardenEssence;
    for (const successes of [0, 2]) for (let fixture = 0; fixture < 64; fixture++) {
      let draw = 0;
      const random = () => draw++ === 0 ? (fixture + 0.5) / 64 : fixture % 2 ? 1 : 0;
      const essence = provider(entry.id, 3, random, 1, { successes });
      const gear = motifIntendedGear(entry.id, 1, { successes });
      const floor = FOES[`static-${entry.zone}`].floor;
      const nominal = buildSpell(essence, gear, intendedLocks(essence, gear), 22, floor);
      assert.ok(Math.min(...(nominal.threadFidelities ?? [nominal.fidelity])) >= 0.95 - 1e-12);
      for (const locks of corners(intendedLocks(essence, gear), gear, essence)) {
        const spell = buildSpell(essence, gear, locks, 22, floor);
        assert.ok(Math.min(...(spell.threadFidelities ?? [spell.fidelity])) >= Math.min(0.95, floor + 0.15) - 1e-12, `${entry.id} fixture${fixture} stage${successes}`);
      }
      if (WARDEN_MOTIFS[entry.id] && successes >= 2) { assert.equal(essence.morphStage, 1); assert.ok(essence.morphHint.length > 0); }
    }
  }
  for (const id of ['kiln-cricket', 'margin-mote', 'index-wisp', 'furnace-witness', 'index-shade']) {
    const provider = MOTIFS[id] ? createMotifEssence : createWardenEssence;
    const ordinary = provider(id, 4, rng(71), 1, { successes: 2 });
    const moved = provider(id, 4, rng(71), 1, { successes: 2, crosswind: true });
    ordinary.inputs.forEach((token, i) => assert.ok(Math.abs(dot(token, ordinary.weights) - dot(moved.inputs[i], moved.weights)) < 1e-9));
  }
  for (const id of ['ripple-static', 'foam-flicker', 'undertow-dot', 'undertow-ledger']) {
    const provider = MOTIFS[id] ? createMotifEssence : createWardenEssence;
    for (const regime of ['calm', 'storm']) {
      const essence = provider(id, 4, rng(71), 1, { regime });
      assert.equal(essence.storm, regime === 'storm');
      assert.ok(essence.forecast.startsWith(regime === 'storm' ? 'Storm' : 'Calm'));
    }
  }
});

test('new species HP clears in two intended casts and packet pars include the warden morph', () => {
  for (const entry of [...SPECIES, ...WARDENS]) {
    if (entry.origin) { assert.equal(motifHp(entry.id), null); continue; }
    const provider = MOTIFS[entry.id] ? createMotifEssence : createWardenEssence;
    const par = motifPar(entry.id);
    let hp = motifHp(entry.id);
    let bytes = 0;
    for (let turn = 0; turn < par.turns; turn++) {
      assert.ok(hp > 0, `${entry.id} should need all ${par.turns} benchmark casts`);
      const essence = provider(entry.id, turn, () => 0.5, 1, { successes: turn });
      const gear = motifIntendedGear(entry.id, 1, { successes: turn });
      const spell = buildSpell(essence, gear, intendedLocks(essence, gear), 22, FOES[`static-${entry.zone}`].floor);
      hp -= spell.damage;
      bytes += spell.cost;
    }
    assert.ok(hp <= 0, `${entry.id} must clear by par`);
    assert.equal(bytes, par.bytes);
  }
});

test('dex flavour is two short honest sentences for all entries', () => {
  for (const entry of [...SPECIES, ...WARDENS]) {
    assert.equal(entry.lines.length, 2);
    for (const line of entry.lines) assert.ok(line.length <= 140 && /[.!?]$/.test(line));
  }
  assert.equal(Object.keys(MOTIFS).length, 21);
  assert.equal(Object.keys(WARDEN_MOTIFS).length, 7);
});

console.table(certificates.map(row => ({
  species: row.id, stage: row.successes, shape: row.shape,
  packet: row.intended?.cost, earlierPacket: row.earlier?.cost,
  ratio: row.ratio.toFixed(3), robust: row.robustRatio.toFixed(3),
  charge56: row.intended?.affordable?.charge56, earlier56: row.earlier?.affordable?.charge56,
  charge64: row.intended?.affordable?.charge64, earlier64: row.earlier?.affordable?.charge64,
})));
console.log(`MOTIF_CERTIFICATES=${JSON.stringify({ math: mathFingerprint, entries: certificates })}`);
console.log(`Audit complete: ${failures} failed checks.`);
if (failures) process.exitCode = 1;
