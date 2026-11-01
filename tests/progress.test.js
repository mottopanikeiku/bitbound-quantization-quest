import test from 'node:test';
import assert from 'node:assert/strict';
import { BADGES, HATS, SPECIES, ISLAND_IDS, DUEL_IDS, newProgress, sanitizeProgress, applyEvent, completion, unlockedHats } from '../src/progress/progress.js';
import { WARDENS } from '../src/content/static-dex.js';
import { GUARDIANS, TECHNIQUE_ORDER } from '../src/content/game-data.js';
import { INTERACTABLES } from '../src/world/map.js';
const state = () => ({ friends: [], techniques: [], shards: [], caches: [], puzzles: [], camps: [], flags: [], rival: { won: [] } });
const cast = overrides => ({ type: 'cast', family: 'bits', fidelity: .99, threadFidelities: null, perfect: true, fizzle: false, clipped: 0, bits: 4, cost: 10, gear: { zero: false, groups: false, balance: false, budget: null }, metric: 'values', ...overrides });
function fight(p, casts, { outcome = 'won', foeId = 'nib', species = null, mode = 'practice', golden = false, duel = null, turns = casts.length, grade = { letter: 'A', score: 85, fidelity: .99 }, bytes = casts.reduce((n, c) => n + (c.type === 'cast' ? c.cost : 0), 0) } = {}, s = state()) {
  applyEvent(p, { type: 'battle-start', foeId, species, mode, golden, duel }, { state: s });
  for (const event of casts) { const ids = applyEvent(p, event, { state: s }); assert.ok(!ids.some(id => ['first-perfect', 'three-casts', 'guard-triad', 'recovery', 'bit-fit', 'zero-fit', 'tide-fit', 'group-fit', 'spotlight-fit', 'balance-fit', 'budget-fit'].includes(id)), 'fight badges wait for battle-end'); }
  return applyEvent(p, { type: 'battle-end', foeId, species, mode, outcome, golden, duel, grade, stats: { turns, casts: casts.filter(e => e.type === 'cast').length, packetBytes: bytes } }, { state: s });
}
const fightCases = [
  ['first-perfect', [cast({})], [cast({ perfect: false })]],
  ['three-casts', [cast({}), { type: 'guard', grade: 'good' }, cast({}), cast({})], [cast({}), cast({ perfect: false }), cast({}), cast({})]],
  ['guard-triad', [1, 2, 3].map(() => ({ type: 'guard', grade: 'perfect' })), [{ type: 'guard', grade: 'perfect' }, { type: 'guard', grade: 'perfect' }, { type: 'guard', grade: 'good' }]],
  ['recovery', [cast({ fizzle: true, perfect: false }), { type: 'guard', grade: 'good' }, cast({ fidelity: .95, perfect: false })], [cast({ fizzle: true, perfect: false }), cast({ fidelity: .94, perfect: false }), cast({ fidelity: .99 })]],
  ['bit-fit', [cast({ fidelity: .985 })], [cast({ clipped: 1 })]],
  ['zero-fit', [cast({ family: 'zero', cost: 11, gear: { zero: true } })], [cast({ family: 'zero', cost: 12, gear: { zero: true } })]],
  ['tide-fit', ['calm', 'storm'].map(regime => cast({ family: 'calib', regime, fidelity: .97 })), ['calm', 'calm'].map(regime => cast({ family: 'calib', regime, fidelity: .97 }))],
  ['group-fit', [cast({ family: 'groups', cost: 18, gear: { groups: true }, threadFidelities: [.985, .99, 1] })], [cast({ family: 'groups', cost: 18, gear: { groups: true }, threadFidelities: [.985, .984, 1] })]],
  ['spotlight-fit', [cast({ family: 'spotlight', bits: 2, cost: 12, protectedHotChannels: 2, metric: 'outputs' })], [cast({ family: 'spotlight', bits: 2, cost: 12, protectedHotChannels: 1, metric: 'outputs' })]],
  ['balance-fit', [cast({ family: 'balance', bits: 3, cost: 28, gear: { balance: true }, quantizeInputs: true, metric: 'outputs' })], [cast({ family: 'balance', bits: 3, cost: 28, gear: { balance: true }, quantizeInputs: false, metric: 'outputs' })]],
  ['budget-fit', [cast({ family: 'budget', cost: 32, gear: { budget: [8, 3, 2] } })], [cast({ family: 'budget', cost: 32, gear: { budget: [4, 4, 4] } })]],
];
for (const [id, positive, negative] of fightCases) {
  test(`${id}: positive, negative, lost and fled`, () => {
    const p = newProgress(); assert.ok(fight(p, positive).includes(id));
    assert.ok(!fight(newProgress(), negative).includes(id));
    for (const outcome of ['lost', 'fled']) assert.ok(!fight(newProgress(), positive, { outcome }).includes(id));
    assert.ok(!fight(p, positive).includes(id), 'held stamps never re-unlock');
  });
}
const metaCases = [
  ['first-friend', s => { s.friends = [0]; }, s => { s.friends = [1]; }],
  ['seven-friends', s => { s.friends = GUARDIANS.map(g => g.id); }, s => { s.friends = [0, 1, 2, 3, 4, 5, 99]; }],
  ['seven-bridges', s => { s.puzzles = [...ISLAND_IDS.puzzle]; }, s => { s.puzzles = [...ISLAND_IDS.puzzle.slice(1), 'fake']; }],
  ['sixteen-shards', s => { s.shards = [...ISLAND_IDS.shard]; }, s => { s.shards = [...ISLAND_IDS.shard.slice(1), 'fake']; }],
  ['eight-camps', s => { s.camps = [...ISLAND_IDS.camp]; }, s => { s.camps = [...ISLAND_IDS.camp.slice(1), 'fake']; }],
  ['fen-three', s => { s.rival.won = [...DUEL_IDS]; }, s => { s.rival.won = ['fen-offset', 'fen-hot', 'fake']; }],
];
for (const [id, positive, negative] of metaCases) test(`${id}: exact positive/negative membership`, () => {
  const yes = state(), no = state(), p = newProgress(); positive(yes); negative(no);
  assert.ok(applyEvent(p, { type: 'camp' }, { state: yes }).includes(id));
  assert.ok(!applyEvent(newProgress(), { type: 'camp' }, { state: no }).includes(id));
  assert.ok(!applyEvent(sanitizeProgress(p), { type: 'camp' }, { state: yes }).includes(id));
});
for (const [id, depth] of [['well-five', 5], ['well-fifteen', 15]]) test(`${id}: cleared threshold positive/negative`, () => {
  assert.ok(applyEvent(newProgress(), { type: 'well-floor', depth }).includes(id));
  assert.ok(!applyEvent(newProgress(), { type: 'well-floor', depth: depth - 1 }).includes(id));
  const p = newProgress(); applyEvent(p, { type: 'battle-start', foeId: 'nib', mode: 'well', depth }); assert.ok(!p.badges.includes(id));
});
test('dex-complete: all 21 won species, no wardens or gold required', () => {
  const p = newProgress();
  for (const species of SPECIES.slice(0, 20)) fight(p, [cast({})], { foeId: `static-${species.zone}`, species: species.id });
  assert.ok(!p.badges.includes('dex-complete'));
  for (const w of WARDENS) fight(p, [cast({})], { foeId: 'static-0', species: w.id, mode: 'well' });
  assert.ok(!p.badges.includes('dex-complete'));
  assert.ok(fight(p, [cast({})], { foeId: 'static-6', species: SPECIES[20].id }).includes('dex-complete'));
});
test('exact roster: 20 stamps and 6 hats', () => {
  assert.equal(BADGES.length, 20); assert.equal(new Set(BADGES.map(b => b.id)).size, 20);
  assert.equal(HATS.length, 6); assert.equal(fightCases.length + metaCases.length + 3, 20);
});
test('battle qualifiers reset at start and ignore casts outside a fight', () => {
  const p = newProgress(); applyEvent(p, cast({})); assert.equal(p.counters.casts, 0);
  fight(p, [cast({}), cast({})], { outcome: 'lost' });
  assert.ok(!fight(p, [cast({})]).includes('three-casts'));
  const recovery = [cast({ fizzle: true, perfect: false }), cast({ fidelity: .99, threadFidelities: [.94, 1, 1] })];
  assert.ok(!fight(newProgress(), recovery).includes('recovery'));
});
test('each technique qualifier rejects a wrong family, over-cap packet and fizzle', () => {
  for (const [id, events] of fightCases.filter(([id]) => id.endsWith('-fit'))) {
    for (const patch of [{ family: 'wrong' }, { cost: 100 }, { fizzle: true }]) {
      assert.ok(!fight(newProgress(), events.map(e => e.type === 'cast' ? { ...e, ...patch } : e)).includes(id), `${id}: ${JSON.stringify(patch)}`);
    }
  }
});
test('dex seen, resolved, mastered, golden transitions use resolved thread minimum', () => {
  const p = newProgress(), id = SPECIES[0].id;
  applyEvent(p, { type: 'seen', species: id, golden: true });
  assert.equal(p.dex[id].seen, true); assert.equal(p.dex[id].goldenSeen, true); assert.equal(p.dex[id].resolved, false);
  fight(p, [cast({})], { species: id, outcome: 'lost', golden: true }); assert.equal(p.dex[id].resolved, false);
  fight(p, [cast({ cost: 9, threadFidelities: [.99, .984, 1] })], { species: id }); assert.equal(p.dex[id].resolved, true); assert.equal(p.dex[id].mastered, false);
  fight(p, [cast({ cost: 10, threadFidelities: [.985, .99, 1] })], { species: id, golden: true });
  assert.equal(p.dex[id].mastered, true); assert.equal(p.dex[id].golden, true); assert.equal(p.dex[id].smallestPacket, 9); assert.equal(p.dex[id].bestFidelity, .985);
  fight(p, [cast({})], { species: WARDENS[0].id, mode: 'well' }); assert.equal(p.wardens[WARDENS[0].id].mastered, true); assert.equal(completion({ progress: p }).dex, 1);
});
test('guardian record fields stay one coherent run; extrema have their own grades', () => {
  const p = newProgress();
  fight(p, [cast({ assisted: 'nib' })], { turns: 5, bytes: 50, grade: { letter: 'S', score: 92, fidelity: .99 } });
  fight(p, [cast({})], { turns: 2, bytes: 20, grade: { letter: 'A', score: 89, fidelity: .98 } });
  assert.deepEqual(p.records.nib, { grade: 'S', score: 92, turns: 5, bytes: 50, fidelity: .99, assisted: true, fewestTurns: { turns: 2, grade: 'A' }, fewestBytes: { bytes: 20, grade: 'A' } });
  fight(p, [cast({})], { turns: 6, bytes: 60, grade: { letter: 'S', score: 96, fidelity: 1 }, mode: 'campaign' });
  assert.equal(p.records.nib.turns, 6); assert.equal(p.records.nib.fewestTurns.turns, 2);
  const before = structuredClone(p.records); fight(p, [cast({})], { mode: 'well', turns: 1 }); fight(p, [cast({})], { mode: 'duel', turns: 1 }); assert.deepEqual(p.records, before);
});
test('duel records are separate and accepted packet minimum excludes rejected casts', () => {
  const p = newProgress(); fight(p, [cast({ cost: 8, fidelity: .9 }), cast({ cost: 11 }), cast({ cost: 10 })], { mode: 'duel', foeId: 'fen', duel: 'fen-offset' });
  assert.deepEqual(p.duels['fen-offset'], { won: true, fewestCasts: 3, smallestAcceptedPacket: 10 }); assert.deepEqual(p.records, {});
});
test('island completion is exactly 53 authored memberships, not arbitrary lengths', () => {
  for (const kind of ['camp', 'shard', 'cache', 'puzzle']) assert.deepEqual(ISLAND_IDS[kind], INTERACTABLES.filter(i => i.interaction === kind).map(i => i.id));
  const s = state(); Object.assign(s, { friends: GUARDIANS.map(g => g.id), techniques: [...TECHNIQUE_ORDER], puzzles: [...ISLAND_IDS.puzzle], shards: [...ISLAND_IDS.shard], caches: [...ISLAND_IDS.cache], camps: [...ISLAND_IDS.camp], flags: ['ending-seen'] });
  assert.equal(completion(s).have, 53); assert.equal(completion(s).total, 53); assert.equal(completion(s).percent, 100);
  s.shards.push('fake', ...ISLAND_IDS.shard); s.friends.push(99, 0); assert.equal(completion(s).have, 53);
  s.shards = [...ISLAND_IDS.shard.slice(1), 'fake']; assert.equal(completion(s).have, 52);
  const p = newProgress(); for (const id of SPECIES.map(s => s.id)) p.dex[id] = { resolved: true }; p.badges = BADGES.map(b => b.id); p.well.best = 999; p.duels = Object.fromEntries(DUEL_IDS.map(id => [id, { won: true }]));
  assert.equal(completion({ ...state(), progress: p }).have, 0); assert.equal(completion({ ...state(), progress: p }).dex, 21);
});
test('hat unlocks have exact finite thresholds and no gold requirement', () => {
  const p = newProgress(); assert.deepEqual(unlockedHats(p), []);
  for (const [depth, count] of [[4, 0], [5, 1], [9, 1], [10, 2], [14, 2], [15, 3], [19, 3], [20, 4]]) { p.well.best = depth; assert.equal(unlockedHats(p).length, count); }
  p.duels = Object.fromEntries(DUEL_IDS.map(id => [id, { won: true }])); assert.ok(unlockedHats(p).includes('fen-scarf'));
  p.dex = Object.fromEntries(SPECIES.map(s => [s.id, { resolved: true }])); assert.equal(unlockedHats(p).length, 6);
  p.dex[SPECIES[0].id].resolved = false; assert.ok(!unlockedHats(p).includes('naturalist-cap'));
});
test('sanitizer rejects unknown ids and bounds fields; applying it is idempotent', () => {
  const p = sanitizeProgress({ badges: ['first-friend', 'first-friend', 'fake'], dex: { fake: { seen: true }, [SPECIES[0].id]: { mastered: true, golden: true, cleared: Infinity, bestFidelity: 7, smallestPacket: -1 } }, records: { fake: { grade: 'S' }, nib: { grade: 'S', score: 999, turns: Infinity, bytes: -7, fidelity: 8, fewestTurns: { turns: -3, grade: 'A' } } }, well: { best: 999999, bestScore: Infinity, lastSeed: -1, lastVersion: 1e8 }, counters: { casts: 1e20, maxResonance: 999 }, fight: { foeId: 'fake', mode: 'practice', flags: Array(1000).fill('fake') } });
  assert.deepEqual(p.badges, ['first-friend']); assert.equal(Object.keys(p.dex).length, 1); assert.equal(p.dex[SPECIES[0].id].seen, true); assert.equal(p.dex[SPECIES[0].id].resolved, true); assert.equal(p.dex[SPECIES[0].id].smallestPacket, null);
  assert.equal(p.records.nib.score, 100); assert.equal(p.records.nib.bytes, 0); assert.equal(p.well.best, 9999); assert.equal(p.well.lastSeed, null); assert.equal(p.counters.maxResonance, 4); assert.equal(p.fight, null);
  assert.deepEqual(sanitizeProgress(p), p); for (const value of [null, 5, 'x', [], {}]) assert.doesNotThrow(() => sanitizeProgress(value));
});
test('saved per-fight aggregate survives reload; replayed battle-end never awards twice', () => {
  let p = newProgress(); const start = { type: 'battle-start', foeId: 'nib', species: SPECIES[0].id, mode: 'practice' };
  applyEvent(p, start); for (let i = 0; i < 3; i++) applyEvent(p, cast({}));
  p = sanitizeProgress(JSON.parse(JSON.stringify(p)));
  const end = { type: 'battle-end', foeId: 'nib', species: SPECIES[0].id, mode: 'practice', outcome: 'won', grade: { letter: 'S', score: 95 }, stats: { casts: 3, turns: 3, packetBytes: 30 } };
  assert.ok(applyEvent(p, end).includes('three-casts')); p = sanitizeProgress(p); const before = structuredClone(p);
  assert.deepEqual(applyEvent(p, end), []); assert.deepEqual(p, before);
  assert.ok(!fight(p, [cast({}), cast({}), cast({})], { species: SPECIES[0].id }).includes('three-casts'));
});
test('Well records retain the last replay seed/version separately from best depth', () => {
  const p = newProgress(); applyEvent(p, { type: 'well-end', depth: 15, score: 6000, seed: 0xffffffff, version: 2 }); applyEvent(p, { type: 'well-end', depth: 2, score: 300, seed: 0, version: 2 });
  assert.equal(p.well.best, 15); assert.equal(p.well.bestScore, 6000); assert.equal(p.well.lastSeed, 0); assert.equal(sanitizeProgress(p).well.lastVersion, 2);
});
test('Well seed/unlock records stay bounded and coherent', () => {
  const p = newProgress();
  for (let i = 0; i < 30; i++) applyEvent(p, { type: 'well-end', key: `2:${i.toString(16).padStart(8, '0').toUpperCase()}:bits,zero`, depth: i, score: i * 100, bestRatio: i / 10 });
  assert.equal(p.well.records.length, 24); assert.equal(p.well.bestRatio, 2.9);
  const key = p.well.records[0].key;
  applyEvent(p, { type: 'well-end', key, depth: 1, score: 99999, bestRatio: 4 });
  assert.equal(p.well.records[0].depth, 29); assert.equal(p.well.records[0].score, 2900);
  assert.deepEqual(sanitizeProgress(p), p);
  assert.deepEqual(sanitizeProgress({ well: { records: [{ key: '2:00000001:fake', depth: 999 }] } }).well.records, []);
});
