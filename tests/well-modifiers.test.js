import test from 'node:test';
import assert from 'node:assert/strict';
import { newRun, clearFloor } from '../src/well/run.js';
import { floorDescriptor, WELL_MODIFIERS } from '../src/well/generation.js';
import { boonLimits, chooseBoon, boonOffers } from '../src/well/boons.js';
import { TECHNIQUE_ORDER } from '../src/content/game-data.js';

const fresh = seed => newRun({ seed, techniques: TECHNIQUE_ORDER, friends: [0, 1, 2, 3, 4, 5, 6] });
function examples() {
  const found = {};
  for (let seed = 0; seed < 128 && Object.keys(found).length < 6; seed++) {
    const run = fresh(seed);
    for (let depth = 3; depth <= 20; depth++) { const well = floorDescriptor(run, depth); if (well.modifier) found[well.modifier.id] ??= { run, well }; }
  }
  return found;
}
test('six modifiers have exact fictional effects without changing numerical floors', () => {
  const found = examples(); assert.equal(Object.keys(found).length, WELL_MODIFIERS.length);
  for (const { well } of Object.values(found)) assert.ok(well.floor > 0 && well.floor < 1);
  assert.equal(found['thin-air'].well.rules.recharge, 2);
  assert.equal(found['loaded-satchel'].well.limits.maxBytes, 48);
  assert.equal(found['loaded-satchel'].run.limits.maxBytes, 56);
  assert.equal(found['loaded-satchel'].well.hero.bytes, 48);
  const echo = found['long-echo'].well;
  for (let turn = 0; turn < 4; turn++) {
    const attack = echo.attack(turn);
    if (attack.charge) assert.equal(attack.hits.length, 1);
    else { assert.equal(attack.hits.length, 2); assert.equal(attack.hits[1], Math.ceil(attack.hits[0] * 0.6)); assert.equal(attack.gaps[1], 0.65); }
  }
  const warm = found['warm-current'].well;
  assert.equal(warm.power, (warm.warden ? 6 : 4) + warm.tier + 2);
});
test('Warm Current clear recovery, Kettle ordinary-only and Clear Bell totals', () => {
  const { run, well } = examples()['warm-current'];
  run.depth = well.depth; run.cleared = well.depth - 1;
  run.boons = { 'camp-kettle': 2, 'clear-bell': 2 }; run.limits = boonLimits(run);
  clearFloor(run, { outcome: 'won', hero: { hp: 1, bytes: 0, snacks: 1 }, stats: {} }, well);
  assert.equal(run.hero.hp, 1 + (well.warden ? 24 : 18));
  if (well.warden) { assert.equal(run.hero.bytes, 56); assert.equal(run.hero.snacks, 4); }
});
test('capacity replacement clamps resources and acquisition only grants rank delta', () => {
  const run = fresh(3); run.cleared = 13; run.depth = 14; run.pendingOffer = true;
  run.boons = { 'byte-moss': 2, 'stout-lantern': 2, 'camp-kettle': 1, 'clear-bell': 2, 'echo-coil': 2, 'soft-shield': 2 };
  run.limits = boonLimits(run); run.hero.bytes = 72;
  const offered = boonOffers(run).find(id => !run.boons[id]); assert.ok(offered);
  assert.equal(chooseBoon(run, offered, 'byte-moss'), true); assert.equal(run.hero.bytes, 56); assert.equal(run.limits.maxBytes, 56); assert.equal(Object.keys(run.boons).length, 6);
});

test('Storm Front tells the exact repeating forecast and preserves independent archive', () => {
  const { well } = examples()['storm-front'];
  for (let turn = 0; turn < 8; turn++) {
    const essence = well.essence(turn, Math.random, 1, { successes: 0 });
    const storm = [false, true, true, false][turn % 4];
    assert.equal(essence.hidden, true); assert.equal(essence.storm, storm);
    assert.equal(essence.forecast.toLowerCase().includes('storm'), storm);
    assert.deepEqual(essence.archive, well.essence(turn, () => 0, 1, { successes: 0 }).archive);
  }
});
