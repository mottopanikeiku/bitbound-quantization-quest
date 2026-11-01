import test from 'node:test';
import assert from 'node:assert/strict';
import { newRun, sanitizeRun, clearFloor, RUN_VERSION, RUN_START } from '../src/well/run.js';
import { floorIdentity, floorDescriptor, floorStats, familyBlock, WELL_MODIFIERS } from '../src/well/generation.js';
import { WELL_BOONS, boonLimits, boonRules, boonOffers, chooseBoon } from '../src/well/boons.js';
import { floorScore } from '../src/well/score.js';
import { stream, seedHex } from '../src/well/streams.js';
import { buildSpell, defaultLocks } from '../src/battle/spell.js';
import { WellScene } from '../src/scenes/well-scene.js';

const state = { techniques: ['bits', 'zero', 'calib', 'groups', 'spotlight', 'balance', 'budget'], friends: [0, 1, 2, 3, 4, 5, 6] };
const fresh = (seed = 12345, techniques = state.techniques) => newRun({ seed, techniques, friends: state.friends });
const win = (well) => ({ outcome: 'won', hero: { hp: 20, bytes: 10, snacks: 1 }, stats: { damageDealt: well.hp, packetBytes: 20, casts: 2, perfects: 2, guardBeats: 2, perfectGuards: 1, goodGuards: 1 }, well: { emergencyUsed: true } });

test('isolated start captures friends and techniques without campaign resources', () => {
  const run = fresh(); assert.equal(RUN_VERSION, 2); assert.deepEqual(run.limits, RUN_START);
  assert.deepEqual(run.hero, { hp: 56, bytes: 56, snacks: 3 });
  assert.deepEqual(run.techniques, state.techniques); assert.notEqual(run.techniques, state.techniques);
  assert.deepEqual(run.friends, state.friends); assert.notEqual(run.friends, state.friends);
  assert.equal(seedHex(0xffffffff), 'FFFFFFFF'); assert.equal(seedHex(0), '00000000');
});
test('seed, turn and independent tags reproduce despite menus, SCAN and other streams', () => {
  for (let seed = 0; seed < 32; seed++) {
    const run = fresh(seed), replay = fresh(seed), a = floorDescriptor(run);
    const before = a.essence(2, () => 0.01, 1, { successes: 1 });
    for (let i = 0; i < 100; i++) { stream(run, 1, 'boon-offer')(); stream(run, 1, 'variant')(); a.essence(99, Math.random); a.attack(99); }
    assert.deepEqual(before, a.essence(2, () => 0.99, 1, { successes: 1 }));
    assert.deepEqual(before, floorDescriptor(replay).essence(2, Math.random, 1, { successes: 1 }));
    assert.deepEqual(floorIdentity(run), floorIdentity(replay));
    assert.deepEqual(a.attack(2), floorDescriptor(replay).attack(2));
  }
  assert.notEqual(stream(fresh(), 1, 'essence')(), stream(fresh(), 1, 'variant')());
});
test('family balance, learned families only, alternating pair and rotating wardens', () => {
  for (let n = 1; n <= 7; n++) {
    const run = fresh(321, state.techniques.slice(0, n)), wardens = [];
    for (let b = 0; b < n * 2; b++) {
      const block = familyBlock(run, b); assert.equal(block.length, 5);
      assert.ok(block.every((family) => run.techniques.includes(family)));
      if (n >= 3) for (const family of run.techniques) assert.ok(block.filter((id) => id === family).length <= 2);
      if (n === 2) for (let i = 1; i < 5; i++) assert.notEqual(block[i], block[i - 1]);
      wardens.push(block[4]);
      for (let i = 1; i <= 5; i++) assert.equal(floorIdentity(run, b * 5 + i).warden, i === 5);
    }
    assert.equal(new Set(wardens.slice(0, n)).size, n);
  }
  const one = fresh(21, ['bits']); assert.notEqual(floorIdentity(one, 1).species, floorIdentity(one, 2).species);
});
test('HP/power tables, family floors and capped tier', () => {
  assert.deepEqual(Array.from({ length: 7 }, (_, u) => floorStats(u * 5 + 1).hp), [40, 43, 46, 50, 53, 56, 59]);
  assert.deepEqual(Array.from({ length: 7 }, (_, u) => floorStats(u * 5 + 5).hp), [66, 69, 71, 74, 77, 79, 82]);
  assert.equal(floorStats(9996).tier, 6); assert.equal(floorStats(9996).power, 10); assert.equal(floorStats(10000).power, 12);
  for (let depth = 1; depth <= 40; depth++) { const well = floorDescriptor(fresh(), depth); assert.equal(well.floor, [0.65, 0.82, 0.75, 0.72, 0.78, 0.58, 0.88][well.zone]); }
});
test('one disclosed compatible modifier per block and clean early floors', () => {
  assert.equal(WELL_MODIFIERS.length, 6);
  for (let b = 0; b < 8; b++) {
    const cards = [1, 2, 3, 4, 5].map((i) => floorIdentity(fresh(999), b * 5 + i));
    assert.equal(cards[0].modifier, null); assert.equal(cards[1].modifier, null);
    assert.equal(cards.slice(2, 4).filter((card) => card.modifier).length, 1);
    assert.equal(Boolean(cards[4].modifier), b >= 1);
    for (const card of cards) if (card.modifier?.families) assert.ok(card.modifier.families.includes(card.family));
  }
});
test('boons have exact bounded total ranks and cannot alter spell fidelity or packet bytes', () => {
  assert.equal(WELL_BOONS.length, 12);
  const run = fresh(7, ['bits']), essence = floorDescriptor(run).essence(0), gear = { bits: 4, zero: false, groups: false, spotlight: 0, balance: false, budget: false };
  const before = buildSpell(essence, gear, defaultLocks(essence, gear), { power: 22, floor: 0.65 });
  run.boons = Object.fromEntries(WELL_BOONS.map((boon) => [boon.id, 2])); run.limits = boonLimits(run);
  assert.deepEqual(run.limits, { maxHp: 72, maxBytes: 72, power: 22, maxSnacks: 5 });
  assert.deepEqual(boonRules(run), { recharge: 4, perfectGuardBytes: 4, hitReduction: 2, steadyScale: 0.3, firstCastRebate: 6, firstGuardBytes: 6, snackBonus: 10, braceMultiplier: 0.4, emergencyHeal: 12, emergencyUsed: false });
  const after = buildSpell(essence, gear, defaultLocks(essence, gear), { power: 22, floor: 0.65 });
  assert.equal(before.fidelity, after.fidelity); assert.deepEqual(before.packet, after.packet); assert.equal(before.cost, after.cost);
});
test('offers deterministic, distinct roles, upgrades once and explicit six-slot replacement', () => {
  const run = fresh(); run.cleared = 1; run.depth = 2; run.pendingOffer = true;
  const offers = boonOffers(run); assert.equal(new Set(offers).size, 3); assert.deepEqual(offers, boonOffers(JSON.parse(JSON.stringify(run))));
  const roles = offers.map((id) => WELL_BOONS.find((boon) => boon.id === id).role); assert.equal(new Set(roles).size, 3);
  assert.equal(chooseBoon(run, offers[0]), true); const hero = { ...run.hero }; assert.equal(chooseBoon(run, offers[0]), false); assert.deepEqual(run.hero, hero);
  run.boons = Object.fromEntries(WELL_BOONS.slice(0, 6).map((boon) => [boon.id, 1])); run.limits = boonLimits(run); run.pendingOffer = true;
  const newId = boonOffers(run).find((id) => !run.boons[id]);
  if (newId) { assert.equal(chooseBoon(run, newId), false); assert.equal(chooseBoon(run, newId, Object.keys(run.boons)[0]), true); assert.equal(Object.keys(run.boons).length, 6); }
  run.pendingOffer = true; run.boons = Object.fromEntries(WELL_BOONS.map((boon) => [boon.id, 2])); assert.deepEqual(boonOffers(run), ['rest', 'recharge']);
});
test('exact score formula includes spent packets and no untested-guard points', () => {
  const score = floorScore({ damageDealt: 40, packetBytes: 25, perfects: 2, casts: 3, perfectGuards: 1, goodGuards: 2, guardBeats: 4 }, true);
  assert.deepEqual(score.components, { clear: 100, efficiency: 160, perfect: 33, guard: 25, warden: 100 }); assert.equal(score.total, 418);
  assert.equal(floorScore({ damageDealt: 100, packetBytes: 1 }).total, 300);
  assert.equal(floorScore({ damageDealt: 10, packetBytes: 0 }).total, 100);
});
test('recovery, warden snacks, emergency reset and settlement idempotence', () => {
  const run = fresh(), first = floorDescriptor(run); clearFloor(run, win(first), first);
  assert.deepEqual(run.hero, { hp: 26, bytes: 18, snacks: 1 }); assert.equal(run.pendingOffer, true); assert.equal(run.emergencyUsed, true);
  const copy = JSON.stringify(run); assert.equal(clearFloor(run, win(first), first), null); assert.equal(JSON.stringify(run), copy);
  chooseBoon(run, 'skip');
  for (let d = 2; d <= 5; d++) { const floor = floorDescriptor(run); clearFloor(run, win(floor), floor); if (run.pendingOffer) chooseBoon(run, 'skip'); }
  assert.equal(run.hero.bytes, run.limits.maxBytes); assert.equal(run.hero.snacks, 2); assert.equal(run.emergencyUsed, false); assert.equal(run.cleared, 5);
});
test('suspend/resume grants nothing extra, including pending offer and one-time acquisition', () => {
  const run = fresh(), floor = floorDescriptor(run); clearFloor(run, win(floor), floor);
  const resumed = sanitizeRun(JSON.parse(JSON.stringify(run)), state); assert.ok(resumed); assert.deepEqual(resumed.hero, run.hero); assert.equal(resumed.score, run.score); assert.equal(resumed.pendingOffer, true);
  const choice = boonOffers(resumed)[0]; chooseBoon(resumed, choice);
  const again = sanitizeRun(JSON.parse(JSON.stringify(resumed)), state); assert.ok(again); assert.deepEqual(again.hero, resumed.hero); assert.equal(chooseBoon(again, choice), false);
});
test('forged run sanitizer rejects bad power, future floors, ranks, score and unlocks', () => {
  const valid = fresh(); assert.ok(sanitizeRun(valid, state));
  const mutations = [r => r.seed = -1, r => r.seed = 1.5, r => r.depth = 2, r => r.limits.power = 999, r => r.limits.maxHp = 999, r => r.hero.bytes = 999, r => r.boons['soft-shield'] = 3, r => r.boons['soft-shield'] = 1, r => r.pendingOffer = true, r => r.score = 500, r => r.techniques.push('fake'), r => r.friends.push(99), r => r.components.guard = 50, r => r.version++];
  for (const mutate of mutations) { const forged = structuredClone(valid); mutate(forged); assert.equal(sanitizeRun(forged, state), null); }
  assert.equal(sanitizeRun(valid, { ...state, techniques: [] }), null); assert.equal(sanitizeRun(null, state), null);
});
test('golden roll comes only from independent variant stream at exactly 1/32', () => {
  let golden = 0;
  for (let seed = 0; seed < 1024; seed++) { const run = fresh(seed); const card = floorIdentity(run); assert.equal(card.golden, stream(run, 1, 'variant', 0, card.family)() < 1 / 32); golden += Number(card.golden); }
  assert.ok(golden > 10 && golden < 60);
});
test('scene refuses below two friends and resumes without recovery or mutation', () => {
  const game = { state: { ...state, friends: [0], progress: { well: { best: 0 } }, wellRun: null }, setMusicScene() {}, announce() {}, save() {}, audio: { play() {} } };
  const scene = new WellScene(game); scene.enter(); assert.deepEqual(scene.menu.map(item => item.key), ['leave']);
  game.state.friends = state.friends; game.state.wellRun = fresh(); scene.enter(); assert.equal(scene.menu[0].key, 'resume'); const before = JSON.stringify(game.state.wellRun); scene._choose('resume'); assert.equal(JSON.stringify(scene.run), before);
});
