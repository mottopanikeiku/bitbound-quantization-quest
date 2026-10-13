import test from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS, GLOSSARY, REAL_WORLD, FACTS, COACH, SOURCES } from '../src/content/lessons.js';
import { GUARDIANS, TECHNIQUE_ORDER, TECHNIQUES, ZONES, heroStats } from '../src/content/game-data.js';
import { kvCacheBytes } from '../src/quantization.js';
import { Battle } from '../src/battle/battle.js';
import { newGame } from '../src/state.js';

const lessonFields = ['id', 'title', 'technique', 'icon', 'lines', 'formula', 'real', 'recap', 'diagramCaption'];
const coachKeys = ['intro', 'firstSnap', 'fizzle', 'clipped', 'perfect', 'clippedPerfect', 'technique', 'lowBytes', 'guard', 'charge', 'win'];
const coachExtras = {
  brine: ['storm', 'calm'],
  spindle: ['thinThread'],
  cinder: ['hot'],
  vesper: ['outlier'],
  auric: ['phase2'],
};
const guardianIds = GUARDIANS.map((guardian) => guardian.key);
const foeIds = [...guardianIds, ...ZONES.map((zone) => `static-${zone.id}`)];
const sentenceSegmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
const fontCharacters = /^[\x20-\x7e±×÷≈→←↑↓•…—°²√∑★♥✓✗▼▶·]+$/u;

function shortText(text, limit, name) {
  assert.equal(typeof text, 'string', `${name} is text`);
  assert.equal(text.trim(), text, `${name} has no surrounding whitespace`);
  assert.ok(text.length > 0 && text.length <= limit, `${name}: ${text.length} characters, limit ${limit}`);
  assert.doesNotMatch(text, /[\r\n]/, `${name} is a single paragraph`);
  assert.match(text, fontCharacters, `${name} uses the contracted pixel-font characters`);
  assert.equal((text.match(/\*/g) ?? []).length % 2, 0, `${name} has paired highlight markers`);
  assert.doesNotMatch(text, /\*\*/, `${name} has no empty highlights`);
}

function sentenceCount(text) {
  return [...sentenceSegmenter.segment(text.replace(/\*/g, ''))].length;
}

function close(actual, expected, name) {
  assert.ok(Math.abs(actual - expected) <= Math.max(1, Math.abs(expected)) * 1e-12,
    `${name}: expected ${expected}, got ${actual}`);
}

function coachBattle(id, zone, learned = true) {
  const state = newGame();
  state.friends = Array.from({ length: zone }, (_, i) => i);
  state.techniques = TECHNIQUE_ORDER.slice(0, zone + Number(learned));
  state.gear = { ...state.gear, bits: 4, spotlight: 0, budget: null };
  const limits = heroStats(state);
  state.hero = { hp: limits.maxHp, bytes: limits.maxBytes, snacks: 3 };
  const game = { state, stats: () => limits, reducedMotion: true, screen: { w: 384, h: 216 }, input: { lastDevice: 'keyboard' } };
  return new Battle({ game, foeId: id, guardian: !id.startsWith('static'), zone, uid: 'coach-' + id });
}

function press(battle, key) {
  const keys = new Set([key]);
  battle.update(0.02, {
    pressed: action => keys.has(action), repeat: action => keys.has(action), held: () => false,
    consume: action => keys.delete(action), pressTime: () => performance.now(),
  });
}

function command(battle, index) {
  assert.equal(battle.phase, 'menu');
  battle.menu = index;
  press(battle, 'confirm');
}

const plain = text => text.replace(/\*/g, '');

test('the seven lessons preserve the complete public data shape', () => {
  assert.deepEqual(Object.keys(LESSONS).sort(), [...TECHNIQUE_ORDER].sort());
  for (const id of TECHNIQUE_ORDER) {
    const lesson = LESSONS[id];
    assert.deepEqual(Object.keys(lesson).sort(), [...lessonFields].sort(), id);
    assert.equal(lesson.id, id);
    assert.equal(lesson.technique, id);
    assert.equal(lesson.icon, TECHNIQUES[id].icon);
    shortText(lesson.title, 40, `${id}.title`);
    assert.ok(Array.isArray(lesson.lines));
    assert.ok(lesson.lines.length >= 2 && lesson.lines.length <= 4, `${id} has 2-4 learning sentences`);
    for (const [index, line] of lesson.lines.entries()) {
      shortText(line, 110, `${id}.lines[${index}]`);
      assert.equal(sentenceCount(line), 1, `${id}.lines[${index}] is one sentence`);
    }
    shortText(lesson.formula, 110, `${id}.formula`);
    shortText(lesson.real, 260, `${id}.real`);
    assert.ok(sentenceCount(lesson.real) >= 1 && sentenceCount(lesson.real) <= 2, `${id}.real is 1-2 sentences`);
    shortText(lesson.recap, 110, `${id}.recap`);
    assert.equal(sentenceCount(lesson.recap), 1, `${id}.recap is one sentence`);
    shortText(lesson.diagramCaption, 110, `${id}.diagramCaption`);
  }
});

test('lesson copy distinguishes narrow codes, affine rounding, FP16 scales and game fidelity', () => {
  assert.match(LESSONS.bits.formula, /r\/\(2\^\(b-1\)-1\)/);
  assert.match(LESSONS.bits.lines.join(' '), /16 codes.*15 levels.*unused/);
  assert.match(LESSONS.zero.formula, /clamp\(roundEven\(x\/s\)\+z, 0, 2\^b-1\)/);
  assert.match(LESSONS.zero.formula, /s × \(q-z\)/);
  assert.match(LESSONS.groups.lines.join(' '), /2-byte FP16 scale/);
  assert.match(LESSONS.spotlight.lines.join(' '), /3 extra bytes each, including an index/);
  assert.match(LESSONS.balance.lines.join(' '), /before rounding/);
  assert.match(LESSONS.budget.formula, /clamp\(1 - relative error, 0, 1\)/);
  assert.match(LESSONS.budget.lines.join(' '), /damage is a game rule/);
  assert.match(REAL_WORLD.toyRules.join(' '), /sqrt\(sum\(\(ref-rec\)\^2\)\/sum\(ref\^2\)\)/);
  assert.match(REAL_WORLD.toyRules.join(' '), /zero reference/);
  assert.match(REAL_WORLD.toyRules.join(' '), /not model task accuracy/);
});

test('every guardian and practice foe has exactly its required coach keys', () => {
  assert.deepEqual(Object.keys(COACH).sort(), [...foeIds].sort());
  for (const id of foeIds) {
    assert.deepEqual(Object.keys(COACH[id]).sort(), [...coachKeys, ...(coachExtras[id] ?? [])].sort(), id);
    for (const [key, line] of Object.entries(COACH[id])) {
      shortText(line, 90, `${id}.${key}`);
    }
  }
});

test('coach technique hints refer to the matching zone mechanic', () => {
  const techniqueWords = [/Bit Dial|step/, /Zero-Shift/, /Tide Gauge/, /Group Rulers/, /TUNE|Spotlight/, /Balance/, /Bit Budget|per-head/];
  for (const zone of ZONES) {
    const guardian = guardianIds[zone.id];
    assert.match(COACH[guardian].technique, techniqueWords[zone.id], `${guardian} technique`);
    assert.match(COACH[`static-${zone.id}`].technique, techniqueWords[zone.id], `static-${zone.id} technique`);
  }
  assert.match(COACH.brine.storm, /tails/);
  assert.match(COACH.brine.calm, /tighter range/);
  assert.match(COACH.spindle.thinThread, /zero.*Group Rulers/);
  assert.match(COACH.cinder.hot, /matching weights/);
  assert.match(COACH.vesper.outlier, /matching weight/);
  assert.match(COACH.auric.phase2, /SCAN.*retune/);
});

test('first-grid and PERFECT copy explain reconstruction without claiming lossless snaps', () => {
  const first = 'White dots are true values; lines are the levels. Red tethers show what the snap lost.';
  assert.equal(COACH.nib.firstSnap, first);
  assert.equal(COACH['static-0'].firstSnap, first);
  assert.match(COACH.nib.perfect, /at least 98\.5% fidelity, not lossless/);
  for (const [id, coach] of Object.entries(COACH)) {
    assert.match(coach.clippedPerfect, /PERFECT.*tiny clipping.*error budget/, id);
    assert.doesNotMatch(coach.clippedPerfect, /widen|mistake|failed/i, id);
  }
});

test('Groups declares separate damage and an all-three PERFECT threshold', () => {
  const copy = plain(LESSONS.groups.lines.join(' '));
  assert.match(copy, /Each thread gets a third of the power/);
  assert.match(copy, /its own fidelity decides its damage/);
  assert.match(copy, /PERFECT.*all three threads at 98\.5%.*not lossless/);
  assert.match(COACH.spindle.firstSnap, /third of the power.*own F and D.*not the overall/);
  assert.match(COACH.spindle.perfect, /all three threads at 98\.5%/);
  assert.match(COACH.spindle.technique, /3-bit.*Group Rulers.*new bends.*4 bits/);
});

test('calibration copy keeps past regimes, a fixed ruler and uncertain future inputs distinct', () => {
  const copy = plain(LESSONS.calib.lines.join(' '));
  assert.match(copy, /past calm and storm waves/);
  assert.match(copy, /fixed ±2\.4 ruler.*last lock stays visible/);
  assert.match(copy, /tighter range for calm.*wider one for storms.*steps coarser/);
  assert.match(copy, /90% of past calm values fit.*not a guarantee/);
  assert.match(COACH.brine.technique, /both past regimes.*choose the range, not the ruler/);
  assert.doesNotMatch(COACH.brine.perfect, /Good forecast/);
  assert.match(COACH.chime.technique, /4 bits.*Zero-Shift.*16 codes/);
});

test('Balance coaching adapts the bit choice when the matched products change', () => {
  assert.match(COACH.vesper.intro, /both partners for outliers.*Balance.*TUNE.*SNAP/);
  assert.match(COACH.vesper.technique, /2-bit.*Balance.*0\.5.*products change.*3 bits/);
  assert.match(COACH.vesper.outlier, /each input and matching weight.*raw products stay unchanged/);
});

test('Spotlight instructions follow real SCAN numbers, TUNE count and SNAP selection affordances', () => {
  for (const id of ['cinder', 'static-4']) {
    const copy = plain(COACH[id].technique);
    assert.match(copy, /TUNE Spotlight to 2, then SNAP and choose the two hottest channels/);
    assert.match(plain(COACH[id].intro), /SCAN.*hot channel numbers/);
    assert.doesNotMatch(plain(COACH[id].intro), /SCAN.*bars/);
    const battle = coachBattle(id, 4);
    command(battle, 4);
    assert.equal(battle.phase, 'scan');
    const hot = battle.salience.map((value, index) => ({ value, index }))
      .sort((a, b) => b.value - a.value || a.index - b.index).slice(0, 2).map(item => item.index);
    const numbers = battle.scanLines.find(line => /Hot channels:/.test(line));
    assert.ok(numbers, `${id}: SCAN supplies channel numbers`);
    for (const index of hot) assert.match(numbers, new RegExp(`\\b${index + 1}\\b`));
    press(battle, 'cancel');
    command(battle, 1);
    assert.equal(battle.phase, 'tune');
    battle.tuneIndex = battle.tuneItems.findIndex(item => item.key === 'spotlight');
    assert.ok(battle.tuneIndex >= 0);
    press(battle, 'right');
    press(battle, 'right');
    assert.equal(battle.gear.spotlight, 2, 'TUNE sets only the number kept');
    assert.equal(battle.phase, 'tune', 'TUNE does not open the channel picker');
    press(battle, 'cancel');
    command(battle, 0);
    assert.equal(battle.phase, 'spotlight', 'SNAP opens the actual channel picker');
    assert.deepEqual(battle.locks.protected, []);
    for (const index of hot) {
      for (let steps = 0; battle.pickIndex !== index && steps < battle.salience.length; steps++) press(battle, 'right');
      assert.equal(battle.pickIndex, index);
      press(battle, 'confirm');
      assert.ok(battle.locks.protected.includes(index));
    }
    assert.equal(battle.phase, 'lock', 'range follows the two channel choices');
  }
  assert.match(plain(LESSONS.spotlight.lines.join(' ')), /TUNE Spotlight to 2, then SNAP.*SCAN shows their numbers/);
});

test('Bit Budget copy points to SNAP, not TUNE, for individual head bit controls', () => {
  for (const id of ['auric', 'static-6']) {
    assert.match(plain(COACH[id].technique), /TUNE Bit Budget ON, then SNAP.*per-head bits/);
    const battle = coachBattle(id, 6);
    command(battle, 1);
    battle.tuneIndex = battle.tuneItems.findIndex(item => item.key === 'budget');
    assert.ok(battle.tuneIndex >= 0);
    press(battle, 'right');
    assert.equal(battle.phase, 'tune');
    assert.deepEqual(battle.gear.budget, [4, 3, 2]);
    press(battle, 'cancel');
    command(battle, 0);
    assert.equal(battle.phase, 'budget');
    press(battle, 'right');
    assert.deepEqual(battle.gear.budget, [8, 3, 2], 'SNAP edits the selected head');
    press(battle, 'down');
    press(battle, 'left');
    assert.deepEqual(battle.gear.budget, [8, 2, 2], 'SNAP can select and edit a different head');
  }
  assert.match(plain(LESSONS.budget.lines.join(' ')), /Bit Budget.*TUNE, then SNAP to choose each head/);
});

test('pre-stone practice coaches make their unavailable technique conditional', () => {
  for (let zone = 0; zone < TECHNIQUE_ORDER.length; zone++) {
    const id = `static-${zone}`;
    const battle = coachBattle(id, zone, false);
    assert.ok(!battle.tuneItems.some(item => item.key === TECHNIQUE_ORDER[zone]), `${id}: its stone is not learned`);
    assert.match(COACH[id].technique, /[Ii]f.*learned|when learned|[Oo]nce.*learned/, `${id}: no unavailable control is commanded`);
    if (zone === 0) {
      assert.equal(battle.gear.bits, 4, 'the first practice grid already has four bits');
      assert.match(COACH[id].intro, /Choose SNAP, then lock the 4-bit bracket/);
      assert.match(COACH[id].lowBytes, /GUARD.*once Bit Dial is learned, TUNE/);
    } else {
      assert.ok(battle.tuneItems.some(item => item.key === 'bits'), `${id}: Bit Dial remains available`);
    }
  }
});

test('all eight areas have 3-5 short NPC facts', () => {
  assert.deepEqual(Object.keys(FACTS).sort(), ['hub', ...ZONES.map((zone) => zone.key)].sort());
  for (const [area, facts] of Object.entries(FACTS)) {
    assert.ok(Array.isArray(facts));
    assert.ok(facts.length >= 3 && facts.length <= 5, `${area} has 3-5 facts`);
    assert.equal(new Set(facts).size, facts.length, `${area} has no duplicate facts`);
    facts.forEach((fact, index) => shortText(fact, 120, `${area}[${index}]`));
  }
});

test('the glossary has 15-20 unique, short, one-or-two-sentence entries', () => {
  assert.ok(GLOSSARY.length >= 15 && GLOSSARY.length <= 20);
  assert.equal(new Set(GLOSSARY.map(({ term }) => term)).size, GLOSSARY.length);
  for (const { term, text } of GLOSSARY) {
    shortText(term, 36, `${term} term`);
    shortText(text, 240, `${term} definition`);
    assert.ok(sentenceCount(text) >= 1 && sentenceCount(text) <= 2, `${term} has 1-2 sentences`);
  }
});

test('glossary covers every requested concept without treating formats as interchangeable', () => {
  const terms = GLOSSARY.map(({ term }) => term).join(' | ');
  for (const term of [
    'Bit', 'byte', 'Code', 'level', 'Scale', 'step', 'Range', 'Rounding error', 'Clipping',
    'Zero-point', 'Symmetric', 'affine', 'Calibration', 'Static', 'dynamic', 'Group', 'per-channel',
    'Outlier', 'Salient weight', 'activation', 'Weight-only', 'W+A', 'Mixed precision', 'NF4', 'FP8', 'FP4',
    'KV cache', 'SQNR',
  ]) {
    assert.ok(terms.toLowerCase().includes(term.toLowerCase()), `glossary includes ${term}`);
  }
  assert.match(GLOSSARY.find(({ term }) => term === 'NF4').text, /nonuniform.*16 levels/);
  assert.match(GLOSSARY.find(({ term }) => term === 'SQNR').text, /ideal.*6 dB.*full-scale sine wave/);
  assert.match(LESSONS.spotlight.real, /by scaling.*not the full AWQ method/);
});

test('Oracle payload sizes derive from eight billion weights times bits divided by eight', () => {
  const oracle = REAL_WORLD.oracle;
  assert.equal(oracle.weights, 8e9);
  assert.equal(oracle.bytesPerGB, 1e9);
  assert.equal(oracle.unit, 'decimal GB');
  assert.equal(oracle.fp16Bits, 16);
  assert.equal(oracle.int8Bits, 8);
  assert.equal(oracle.int4Bits, 4);
  for (const [bits, bytes, gb] of [
    [oracle.fp16Bits, oracle.fp16Bytes, oracle.fp16GB],
    [oracle.int8Bits, oracle.int8Bytes, oracle.int8GB],
    [oracle.int4Bits, oracle.int4PayloadBytes, 4],
  ]) {
    assert.equal(bytes, oracle.weights * bits / 8);
    close(gb, bytes / oracle.bytesPerGB, `${bits}-bit payload GB`);
  }
  assert.equal(oracle.fp16GB, 16);
  assert.equal(oracle.int8GB, 8);
});

test('Oracle INT4 storage includes exactly one FP16 scale per 128 weights', () => {
  const oracle = REAL_WORLD.oracle;
  assert.equal(oracle.groupSize, 128);
  assert.equal(oracle.scaleBits, 16);
  assert.equal(oracle.zeroPointBits, 0);
  assert.equal(oracle.scaleGroups, Math.ceil(oracle.weights / oracle.groupSize));
  assert.equal(oracle.scaleBytes, oracle.scaleGroups * oracle.scaleBits / 8);
  assert.equal(oracle.int4BitsPerWeight, oracle.int4Bits + oracle.scaleBits / oracle.groupSize);
  assert.equal(oracle.int4BitsPerWeight, 4.125);
  assert.equal(oracle.int4Bytes, oracle.int4PayloadBytes + oracle.scaleBytes);
  assert.equal(oracle.int4Bytes, oracle.weights * oracle.int4BitsPerWeight / 8);
  assert.equal(oracle.int4GB, oracle.int4Bytes / oracle.bytesPerGB);
  assert.equal(oracle.int4GB, 4.125);
  assert.match(oracle.assumptions, /no stored zero-points or padding/);
  assert.match(oracle.assumptions, /not total inference memory/);
});

test('size comparisons compute payload and scale metadata independently', () => {
  assert.ok(REAL_WORLD.sizes.length >= 3);
  assert.equal(new Set(REAL_WORLD.sizes.map(({ label }) => label)).size, REAL_WORLD.sizes.length);
  for (const size of REAL_WORLD.sizes) {
    shortText(size.label, 40, `${size.label} label`);
    shortText(size.text, 180, `${size.label} text`);
    for (const key of ['weights', 'bits', 'groupSize', 'scaleBits', 'zeroPointBits', 'bytes']) {
      assert.ok(Number.isSafeInteger(size[key]) && size[key] >= 0, `${size.label}.${key} is a nonnegative integer`);
    }
    assert.ok(size.weights > 0 && size.bits > 0);
    const payload = Math.ceil(size.weights * size.bits / 8);
    const groups = size.groupSize === 0 ? 0 : Math.ceil(size.weights / size.groupSize);
    const metadata = groups * (size.scaleBits + size.zeroPointBits) / 8;
    if (groups === 0) assert.equal(size.scaleBits + size.zeroPointBits, 0);
    assert.equal(size.bytes, payload + metadata, size.label);
    close(size.gb, size.bytes / 1e9, `${size.label} decimal GB`);
    assert.match(size.text, /decimal GB/);
  }
  const smallerGroups = REAL_WORLD.sizes.find(({ groupSize }) => groupSize === 64);
  assert.equal(smallerGroups.bytes - REAL_WORLD.oracle.int4Bytes, REAL_WORLD.oracle.scaleBytes);
});

test('the KV example uses both caches and KV heads, not query heads', () => {
  const { formula, assumptions, example } = REAL_WORLD.oracle.kvCache;
  assert.match(formula, /2 × layers × sequences × tokens × KV heads × head size × bits\/8/);
  assert.match(assumptions.join(' '), /full-attention/);
  assert.match(assumptions.join(' '), /KV heads, not query heads/);
  assert.match(assumptions.join(' '), /same retained token count/);
  assert.match(assumptions.join(' '), /metadata, padding, residual high-precision cache/);
  const bytes = 2 * example.layers * example.batch * example.tokens * example.kvHeads * example.headDim * example.bits / 8;
  assert.equal(example.bytes, bytes);
  assert.equal(example.bytes, kvCacheBytes(example));
  close(example.gb, bytes / 1e9, 'KV decimal GB');
  assert.equal(example.bytes, 1_073_741_824);
  assert.notEqual(example.gb, 1, 'one GiB is not one decimal GB');
  shortText(example.text, 120, 'KV example');
});

test('ending copy keeps the storage assumptions and inference caveats visible', () => {
  const lines = REAL_WORLD.oracle.lines;
  assert.ok(lines.length >= 4);
  lines.forEach((line, index) => shortText(line, 110, `oracle.lines[${index}]`));
  const copy = lines.join(' ');
  assert.match(copy, /16 GB.*8 GB.*4 GB.*0\.125 GB.*4\.125 bits\/weight.*4\.125 GB/);
  assert.match(copy, /no zero-points or padding/);
  assert.match(copy, /decimal.*1,000,000,000 bytes/);
  assert.match(copy, /KV cache.*activations.*workspaces/);
  assert.match(copy, /not guaranteed speed or accuracy/);
});

test('technical sources have primary HTTPS links and cover the required methods', () => {
  const hosts = new Set([
    'onnx.ai', 'arxiv.org', 'developers.google.com', 'physics.nist.gov', 'onnxruntime.ai',
    'proceedings.mlr.press', 'docs.vllm.ai', 'www.ti.com',
  ]);
  const claims = new Set();
  for (const source of SOURCES) {
    assert.deepEqual(Object.keys(source).sort(), ['claim', 'url']);
    assert.ok(source.claim.length >= 20 && source.claim.length <= 300);
    assert.ok(!claims.has(source.claim), 'source claims are unique');
    claims.add(source.claim);
    const url = new URL(source.url);
    assert.equal(url.protocol, 'https:');
    assert.ok(hosts.has(url.hostname), `${source.url} is a primary publisher`);
  }
  const urls = SOURCES.map(({ url }) => url).join(' ');
  for (const identifier of [
    'QuantizeLinear', 'DequantizeLinear', '1712.05877', '2106.08295', '2210.17323',
    '2306.00978', 'xiao23c', '2208.07339', '2305.14314', '2209.05433',
    'float4.html', '2402.02750', 'quantized_kvcache', 'kv_cache_interface', 'slaa323a',
  ]) {
    assert.ok(urls.includes(identifier), `source coverage includes ${identifier}`);
  }
});
