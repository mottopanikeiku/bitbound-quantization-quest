import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/world.js';
import { INTERACTABLES, TILE, ENTRIES } from '../src/world/map.js';
import { newGame } from '../src/state.js';
import { SnapBridge, PUZZLES } from '../src/world/puzzles.js';
import { ZONES } from '../src/content/game-data.js';

function harness() {
  const state = newGame();
  const calls = { battles: [], dialogues: [], endings: 0, puzzles: [] };
  const game = {
    state, time: 0, reducedMotion: true, screen: { w: 384, h: 216 },
    audio: { play() {}, snapNotes() {} }, announce() {}, save() {}, toast() {},
    hasFlag: (id) => state.flags.includes(id),
    setFlag: (id) => { if (!state.flags.includes(id)) state.flags.push(id); },
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
  const { world, calls } = harness();
  const enemy = world.statics[0];
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
  enemy.mood = 'chase';
  world.hero.x += 150;
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
