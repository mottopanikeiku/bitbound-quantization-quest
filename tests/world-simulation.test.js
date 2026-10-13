import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { INTERACTABLES, TILE, ENTRIES } from '../src/world/map.js';
import { newGame, sanitize } from '../src/state.js';
import { SnapBridge, PUZZLES } from '../src/world/puzzles.js';
import { ZONES } from '../src/content/game-data.js';

function harness(state = newGame()) {
  const calls = { battles: [], dialogues: [], endings: 0, puzzles: [], flags: [] };
  const game = {
    state, time: 0, reducedMotion: true, screen: { w: 384, h: 216 },
    audio: { play() {}, snapNotes() {} }, announce() {}, save() {}, toast() {},
    hasFlag: (id) => state.flags.includes(id),
    setFlag: (id, value = true) => {
      calls.flags.push({ id, value });
      if (value && !state.flags.includes(id)) state.flags.push(id);
      else if (!value) state.flags = state.flags.filter((flag) => flag !== id);
    },
    say: (lines, options = {}) => calls.dialogues.push({ lines, ...options }),
    unlockTechnique: (id) => { if (!state.techniques.includes(id)) state.techniques.push(id); },
    startBattle: (battle) => calls.battles.push(battle),
    playEnding: () => { calls.endings++; game.setFlag('ending-seen'); },
    solvePuzzle: (id) => { state.puzzles.push(id); calls.puzzles.push(id); },
  };
  return { game, state, calls, world: new World(game) };
}
function input(x = 0, y = 0, run = false, pressed = null) {
  return { axis: () => ({ x, y }), held: (key) => key === 'run' && run, pressed: (key) => key === pressed, repeat: (key) => key === pressed, consume() {}, pressTime: () => performance.now() };
}
function openGround(world) {
  // A wide empty synthetic patch isolates motion arithmetic from map authorship.
  world.map = { get: () => 'grass' };
  world.hero.x = 80;
  world.hero.y = 80;
  for (const enemy of world.statics) enemy.alive = false;
  world._resetTrail();
}

test('diagonal maximum speed is normalized and Shift accelerates smoothly to a faster run', () => {
  const a = harness().world;
  const b = harness().world;
  const run = harness().world;
  for (const world of [a, b, run]) openGround(world);
  a.update(1 / 60, input(1, 0));
  assert.ok(a.hero.vx > 0 && a.hero.vx < 68, 'first frame accelerates, not teleports to speed');
  for (let i = 0; i < 24; i++) {
    a.update(1 / 60, input(1, 0));
    b.update(1 / 60, input(1, 1));
    run.update(1 / 60, input(1, 0, true));
  }
  assert.ok(Math.abs(Math.hypot(b.hero.vx, b.hero.vy) - Math.hypot(a.hero.vx, a.hero.vy)) < 1e-9);
  assert.equal(run.hero.vx, 112);
  assert.equal(a.hero.vx, 68);
  assert.ok(run.hero.x > a.hero.x);
});

test('substepped collisions slide along walls instead of tunnelling or stopping both axes', () => {
  const { world } = harness();
  world.map = { get: (tx) => tx < 10 ? 'grass' : 'cliff' };
  world.hero.x = 154;
  world.hero.y = 80;
  world._move(world.hero, 60, 60);
  assert.ok(world.hero.x + 4 < 10 * TILE);
  assert.equal(world.hero.y, 140);
});

test('staticlings alert, contact-battle after grace, and abandon a distant chase', () => {
  const { world, game, calls } = harness();
  const enemy = world.statics[0];
  world.statics = [enemy];
  game.setFlag('stone-0');
  world.hero.x = enemy.x;
  world.hero.y = enemy.y;
  world.contactCooldown = 1;
  world._updateStaticlings(1 / 60);
  assert.equal(calls.battles.length, 0);
  world.contactCooldown = 0;
  world._updateStaticlings(1 / 60);
  assert.equal(calls.battles.length, 1);
  assert.equal(calls.battles[0].foeId, 'static-0');
  assert.equal(calls.battles[0].guardian, false);
  assert.ok(world.contactCooldown > 0);
  enemy.x += 24;
  world.contactCooldown = 0;
  enemy.mood = 'chase';
  world.hero.x = enemy.x + 150;
  world._updateStaticlings(1 / 60);
  assert.equal(enemy.mood, 'return');
});

test('Grid Stone unlocks its technique before shrine dialogue can start a guardian battle', () => {
  const { world, game, state, calls } = harness();
  const stone = INTERACTABLES.find((item) => item.zone === 0 && item.interaction === 'stone');
  const shrine = INTERACTABLES.find((item) => item.zone === 0 && item.interaction === 'shrine');
  world._interact(shrine);
  assert.match(calls.dialogues.at(-1).lines, /sealed/);
  assert.equal(calls.battles.length, 0);
  world._interact(stone);
  calls.dialogues.at(-1).onDone();
  assert.equal(world._colourBits(0), 5, 'the visible colour ripple precedes the lesson');
  assert.deepEqual(state.techniques, [], 'do not cover the colour ripple with a lesson');
  game.time = 1.3;
  world.update(1 / 60, input());
  assert.deepEqual(state.techniques, ['bits']);
  assert.ok(world.statics.filter((enemy) => enemy.zone === 0).every((enemy) => enemy.lifecycle === 'ACTIVE'));
  world._interact(shrine);
  assert.equal(calls.battles.length, 0, 'pre-battle conversation is not skipped');
  calls.dialogues.at(-1).onDone();
  assert.equal(calls.battles[0].foeId, 'nib');
  assert.equal(calls.battles[0].guardian, true);
});

test('keeper teaches all first-conversation controls and the ending does not replay on free roam', () => {
  const { world, game, state, calls } = harness();
  const keeper = INTERACTABLES.find((item) => item.id === 'point-keeper');
  const lighthouse = INTERACTABLES.find((item) => item.interaction === 'lighthouse');
  world._interact(keeper);
  const tutorial = calls.dialogues.at(-1).lines.map((line) => line.text).join(' ');
  for (const key of ['WASD', 'Shift', 'Enter', 'Esc', 'N']) assert.ok(tutorial.includes(key), key);
  state.friends = [0, 1, 2, 3, 4, 5, 6];
  world._interact(lighthouse);
  assert.equal(calls.endings, 1);
  assert.ok(game.hasFlag('ending-seen'));
  world._interact(lighthouse);
  world._interact(keeper);
  assert.equal(calls.endings, 1);
  assert.equal(world.objective(), null);
});

test('dev placement survives the wrapper setState with a new save, and puzzle Escape closes its modal', () => {
  const { world, game, state } = harness();
  world.devPlace(0);
  world.setState(state);
  assert.equal(world.position.x, ENTRIES[0].x);
  assert.equal(world.position.y, ENTRIES[0].y);
  assert.equal(world.position.facing, ENTRIES[0].facing ?? 'up');
  world.puzzle = new SnapBridge(game, PUZZLES[0], { onClose: () => { world.puzzle = null; } });
  assert.equal(world.canPause, false);
  world.update(1 / 60, input(0, 0, false, 'cancel'));
  assert.equal(world.puzzle, null);
  assert.equal(world.canPause, true);
});

test('every Grid Stone adds exactly one colour bit once, while guardian restoration is a 2.2-second flood', () => {
  for (const zone of ZONES) {
    const { world, game, state } = harness();
    assert.equal(world._colourBits(zone.id), zone.corruptBits);
    world.awakenStone(zone.id);
    assert.equal(world._colourBits(zone.id), zone.corruptBits + 1);
    assert.equal(world.canPause, false);
    assert.ok(world.objective().text.includes(`${2 ** zone.corruptBits} → ${2 ** (zone.corruptBits + 1)} colours`));
    assert.equal(world.depthRipples.get(zone.id).duration, 1.05);
    assert.equal(state.flags.includes(`stone-${zone.id}`), false, 'an interrupted ripple cannot save a half-unlocked stone');
    game.time = 1.3;
    world.update(1 / 60, input());
    assert.equal(world.canPause, true);
    assert.ok(state.flags.includes(`stone-${zone.id}`));
    assert.ok(state.techniques.includes(zone.technique));
    world.awakenStone(zone.id);
    assert.equal(world.pendingStone, null, 'awakening twice cannot add another bit');
    assert.equal(world._colourBits(zone.id), zone.corruptBits + 1);
    world.restoreZone(zone.id);
    assert.equal(world.restorations.get(zone.id).duration, 2.2);
    assert.ok(world.restored.has(zone.id));
  }
});

test('every zone patrol is visibly dormant and stationary until its own stone is awake', () => {
  for (const zone of ZONES) {
    const { world, game, calls } = harness();
    const enemy = world.statics.find((item) => item.zone === zone.id);
    world.statics = [enemy];
    world.hero.x = enemy.x;
    world.hero.y = enemy.y;
    world.contactCooldown = 0;
    world._updateStaticlings(3);
    assert.equal(enemy.lifecycle, 'DORMANT');
    assert.equal(enemy.mood, 'sleeping');
    assert.equal(enemy.alive, true, 'sleeping patrol remains visible');
    assert.deepEqual([enemy.x, enemy.y], [enemy.homeX, enemy.homeY]);
    assert.equal(calls.battles.length, 0, 'walking over a sleeper cannot bypass its lesson');
    if (zone.id > 0) {
      game.setFlag(`stone-${zone.id - 1}`);
      world._updateStaticlings(1);
      assert.equal(enemy.lifecycle, 'DORMANT', 'the previous zone technique is insufficient');
    }
    game.setFlag(`stone-${zone.id}`);
    world._updateStaticlings(1 / 60);
    assert.equal(enemy.lifecycle, 'ACTIVE');
    assert.equal(calls.battles.length, 1, `${zone.key} permits practice after the stone`);
  }
});

test('cleared active patrols survive Continue, but an explicit rest re-arms only active zones', () => {
  const { world, game, state } = harness();
  game.setFlag('stone-0');
  const enemy = world.statics.find((item) => item.zone === 0);
  const dormant = world.statics.find((item) => item.zone === 1);
  world.afterBattle(enemy.uid, 'won');
  assert.equal(enemy.alive, false);
  assert.ok(game.hasFlag(`patrol-cleared-${enemy.uid}`));

  const resumed = harness(sanitize(JSON.parse(JSON.stringify(state))));
  resumed.world.setState(resumed.state);
  const resumedEnemy = resumed.world.statics.find((item) => item.uid === enemy.uid);
  assert.equal(resumedEnemy.lifecycle, 'ACTIVE');
  assert.equal(resumedEnemy.alive, false, 'Continue does not charge another practice battle');
  resumed.world.respawnStaticlings();
  assert.equal(resumedEnemy.alive, true);
  assert.equal(resumed.game.hasFlag(`patrol-cleared-${enemy.uid}`), false);
  assert.deepEqual([resumedEnemy.x, resumedEnemy.y], [resumedEnemy.homeX, resumedEnemy.homeY]);
  assert.equal(resumed.world.statics.find((item) => item.uid === dormant.uid).mood, 'sleeping');
  assert.ok(resumed.calls.flags.filter((call) => call.value === false).every((call) => call.id.includes('meadow-static')));

  const afterRest = harness(sanitize(JSON.parse(JSON.stringify(resumed.state))));
  afterRest.world.setState(afterRest.state);
  assert.equal(afterRest.world.statics.find((item) => item.uid === enemy.uid).alive, true, 'Continue retains an explicit rest respawn');
  for (let i = 0; i < 160; i++) {
    afterRest.world.afterBattle(enemy.uid, 'won');
    afterRest.world.respawnStaticlings();
  }
  assert.deepEqual(afterRest.state.flags, ['stone-0'], 'rest never creates an ever-growing epoch log');
});

test('friendship purifies every patrol immediately and rest or Continue cannot revive it', () => {
  const { world, game, state, calls } = harness();
  game.setFlag('stone-0');
  world._updateStaticlings(0);
  const enemies = world.statics.filter((enemy) => enemy.zone === 0);
  enemies[0].mood = 'chase';
  state.friends.push(0);
  world.restoreZone(0);
  for (const enemy of enemies) {
    assert.equal(enemy.lifecycle, 'PURIFIED');
    assert.equal(enemy.alive, false);
    assert.equal(enemy.mood, 'purified');
    assert.ok(enemy.purifyUntil > game.time && enemy.purifyUntil <= game.time + 1);
  }
  world.hero.x = enemies[0].x;
  world.hero.y = enemies[0].y;
  world.contactCooldown = 0;
  game.time = 1;
  world._updateStaticlings(1);
  assert.equal(calls.battles.length, 0);
  assert.ok(enemies.every((enemy) => enemy.purifyUntil < game.time));
  world.respawnStaticlings();
  assert.ok(enemies.every((enemy) => !enemy.alive && enemy.lifecycle === 'PURIFIED'));
  const resumed = harness(sanitize(JSON.parse(JSON.stringify(state))));
  resumed.world.setState(resumed.state);
  resumed.world.respawnStaticlings();
  assert.ok(resumed.world.statics.filter((enemy) => enemy.zone === 0).every((enemy) => !enemy.alive && enemy.lifecycle === 'PURIFIED'));
  assert.doesNotMatch(resumed.world.describe(), /Staticling chasing/);
});

test('restoration flags purify patrols even before the friendship list is reapplied', () => {
  const { world, game } = harness();
  game.setFlag('stone-6');
  world.restoreZone(6);
  world.respawnStaticlings();
  assert.ok(world.statics.filter((enemy) => enemy.zone === 6).every((enemy) => !enemy.alive && enemy.lifecycle === 'PURIFIED'));
});

test('FLEE returns the patrol home and requires both six seconds and leaving its notice circle', () => {
  const { world, game, calls, state } = harness();
  game.setFlag('stone-0');
  const enemy = world.statics.find((item) => item.zone === 0);
  world.statics = [enemy];
  world._syncPatrol(enemy);
  enemy.x += 24;
  enemy.mood = 'chase';
  world.hero.x = enemy.homeX;
  world.hero.y = enemy.homeY;
  world.afterBattle(enemy.uid, 'fled');
  assert.deepEqual([enemy.x, enemy.y], [enemy.homeX, enemy.homeY]);
  assert.equal(world.contactCooldown, 6);
  world.setState(state); // The real world scene reapplies state after battle.
  assert.equal(enemy.disengaged, true);
  assert.equal(world.contactCooldown, 6);
  for (let i = 0; i < 5; i++) {
    world.contactCooldown--;
    world._updateStaticlings(1);
    assert.notEqual(enemy.mood, 'alert');
    assert.notEqual(enemy.mood, 'chase');
  }
  world.contactCooldown = 0;
  world._updateStaticlings(1);
  assert.equal(enemy.disengaged, true, 'standing near home cannot trigger an immediate rematch');
  assert.equal(calls.battles.length, 0);
  world.hero.x = enemy.homeX + 120;
  world._updateStaticlings(1 / 60);
  assert.equal(enemy.disengaged, false);
  world.hero.x = enemy.x;
  world.hero.y = enemy.y;
  world._updateStaticlings(1 / 60);
  assert.equal(calls.battles.length, 1, 'deliberately returning later still permits practice');
});

test('shrine, camp, stone, cache and bridge-pedestal approaches suppress pursuit and contact', () => {
  const radii = { shrine: 56, camp: 40, stone: 40, cache: 40, puzzle: 40 };
  for (const [interaction, radius] of Object.entries(radii)) {
    const { world, game, calls } = harness();
    game.setFlag('stone-0');
    const enemy = world.statics.find((item) => item.zone === 0);
    world.statics = [enemy];
    world._syncPatrol(enemy);
    const item = INTERACTABLES.find((entry) => entry.zone === 0 && entry.interaction === interaction);
    world.hero.x = item.x + radius - 2;
    world.hero.y = item.y;
    enemy.x = world.hero.x;
    enemy.y = world.hero.y;
    enemy.homeX = item.x + radius + 64;
    enemy.homeY = item.y;
    enemy.mood = 'chase';
    world.contactCooldown = 0;
    assert.equal(world._safeAt(world.hero.x, world.hero.y, 0), true, interaction);
    world._updateStaticlings(1 / 60);
    assert.equal(calls.battles.length, 0, interaction);
    assert.equal(enemy.mood, 'return', interaction);
    // Even a hero just outside the circle cannot be contacted by a patrol
    // whose own feet are still inside the protected approach.
    world.hero.x = item.x + radius + 4;
    enemy.x = item.x + radius - 2;
    enemy.y = item.y;
    enemy.mood = 'chase';
    world._updateStaticlings(1 / 60);
    assert.equal(calls.battles.length, 0, `${interaction}: enemy inside`);
    assert.notEqual(enemy.mood, 'chase');
  }
});
