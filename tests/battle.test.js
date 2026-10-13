import test from "node:test";
import assert from "node:assert/strict";
import {
  Battle,
  FOES,
  newGear,
  prepareSpell,
  resolveSpell,
} from "../src/battle.js";

const hero = () => ({
  hp: 80,
  maxHp: 80,
  bytes: 256,
  maxBytes: 256,
  snacks: 3,
});
test("a spell must be affordable and its three pulses charge the packet once", () => {
  const fight = new Battle({
    id: 0,
    hero: hero(),
    gear: newGear(),
    completed: [],
  });
  fight.hero.bytes = 55;
  fight.confirm();
  assert.equal(fight.phase, "menu");
  assert.equal(fight.hero.bytes, 55);
  fight.hero.bytes = 56;
  fight.confirm();
  assert.equal(fight.phase, "aim");
  assert.equal(fight.hero.bytes, 0);
  fight.confirm();
  fight.confirm();
  fight.confirm();
  assert.equal(fight.hero.bytes, 0);
  assert.equal(fight.phase, "resolve");
});
test("guard restores bounded charge and reduces the telegraphed enemy hit", () => {
  const fight = new Battle({
    id: 0,
    hero: hero(),
    gear: newGear(),
    completed: [],
  });
  fight.turn = 2;
  fight.hero.bytes = 240;
  fight.menu = 2;
  fight.confirm();
  fight.update(0.9);
  assert.equal(fight.hero.bytes, 256);
  assert.equal(fight.enemyDamage, 5);
  assert.equal(fight.hero.hp, 75);
});
test("independent channel scales preserve a small signal at an actual metadata cost", () => {
  const shared = prepareSpell(3, { ...newGear(), range: "full" }, true);
  const channel = prepareSpell(
    3,
    { ...newGear(), range: "full", ruler: "channel" },
    true,
  );
  const target = FOES[3].peaks;
  const a = resolveSpell(shared, target, target);
  const b = resolveSpell(channel, target, target);
  assert.ok(b.relativeError < a.relativeError / 4);
  assert.equal(channel.bytes - shared.bytes, 16);
});
test("scanning a shifted signal removes real clipping rather than granting a fixed damage bonus", () => {
  const gear = { ...newGear(), ruler: "offset", range: "full" };
  const target = FOES[1].peaks;
  const before = resolveSpell(prepareSpell(1, gear, false), target, target);
  const after = resolveSpell(prepareSpell(1, gear, true), target, target);
  assert.ok(before.clipped > 0);
  assert.equal(after.clipped, 0);
  assert.ok(after.relativeError < before.relativeError / 10);
});

test("a retained cast does not acquire the next turn's storm targets", () => {
  const fight = new Battle({
    id: 2,
    hero: hero(),
    gear: newGear(),
    completed: [],
  });
  fight.confirm();
  fight.confirm();
  fight.confirm();
  fight.confirm();
  const retained = fight.lastCast;
  assert.deepEqual(retained.targets, FOES[2].peaks);
  const recordedAims = retained.raw.slice();
  fight.update(1.2);
  fight.update(1.2);
  assert.equal(fight.phase, "menu");
  assert.equal(fight.charged, false);
  assert.deepEqual(fight.targets, FOES[2].stormPeaks);
  assert.deepEqual(retained.targets, FOES[2].peaks);
  fight.confirm();
  fight.confirm();
  assert.deepEqual(retained.raw, recordedAims);
});

test("tuning compares the same unrounded input while changing reconstructed outputs", () => {
  const fight = new Battle({
    id: 0,
    hero: hero(),
    gear: { ...newGear(), weightBits: 2, activationBits: 2 },
    completed: [],
  });
  const reference = fight.preview.reference.slice();
  const coarse = fight.preview.relativeError;
  fight.cycleBits();
  assert.deepEqual(fight.preview.reference, reference);
  assert.ok(fight.preview.relativeError < coarse / 4);
});

test("the scanned offset guardian uses a nonzero code for exact real zero", () => {
  const prepared = prepareSpell(
    1,
    { ...newGear(), ruler: "offset", range: "full" },
    true,
  );
  assert.ok(prepared.params[0].zero > 0);
  const zero = resolveSpell(prepared, [0, 0, 0], [0, 0, 0]);
  assert.deepEqual(zero.actual, [0, 0, 0]);
  assert.equal(zero.clipped, 0);
});

test("paired balancing preserves the reference while removing outlier clipping", () => {
  const gear = { ...newGear(), weightBits: 8, activationBits: 8 };
  const target = FOES[5].peaks;
  const unbalanced = resolveSpell(prepareSpell(5, gear), target, target);
  const balanced = resolveSpell(
    prepareSpell(5, { ...gear, ruler: "balanced" }),
    target,
    target,
  );
  assert.deepEqual(balanced.reference, unbalanced.reference);
  assert.ok(unbalanced.clipped > 0);
  assert.equal(balanced.clipped, 0);
  assert.ok(balanced.relativeError < unbalanced.relativeError / 10);
});
