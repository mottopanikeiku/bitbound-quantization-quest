import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../src/battle/battle.js';
import { newGame } from '../src/state.js';
import { heroStats, TECHNIQUE_ORDER } from '../src/content/game-data.js';
import { intendedGear } from '../src/battle/foes.js';
import { defaultLocks } from '../src/battle/spell.js';

function fixture(id = 'nib', zone = 0) {
  const state = newGame();
  state.friends = Array.from({ length: zone }, (_, i) => i);
  state.techniques = TECHNIQUE_ORDER.slice(0, zone + 1);
  const limits = heroStats(state);
  state.hero = { hp: limits.maxHp, bytes: limits.maxBytes, snacks: 3 };
  const sounds = [];
  const game = { state, stats: () => limits, reducedMotion: true, screen: { w: 384, h: 216 }, audio: { play: name => sounds.push(name), snapNotes() {}, glide() {} }, announce() {} };
  return { game, sounds, battle: new Battle({ game, foeId: id, guardian: !id.startsWith('static'), zone, uid: 'unit-' + id }) };
}

function input(keys = [], held = []) {
  const pressed = new Set(keys);
  return { pressed: key => pressed.has(key), repeat: key => pressed.has(key), held: key => held.includes(key), consume: key => pressed.delete(key), pressTime: () => performance.now() };
}
const tick = (battle, keys = [], dt = 0.02, held = []) => battle.update(dt, input(keys, held));
function choose(battle, menu) { battle.menu = menu; tick(battle, ['confirm']); }

function freeze(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  return Object.freeze(value);
}

test('battle owns save copies; free menus do not spend turns or refill bytes', () => {
  const { game, battle } = fixture('chime', 1);
  freeze(game.state);
  const before = JSON.stringify(game.state);
  const bytes = battle.hero.bytes;
  choose(battle, 1);
  assert.equal(battle.phase, 'tune');
  assert.deepEqual(battle.tuneItems.map(item => item.key), ['bits', 'zero', 'ready']);
  tick(battle, ['down']);
  tick(battle, ['right']);
  assert.equal(battle.gear.zero, true);
  assert.equal(battle.stats.turns, 0);
  tick(battle, ['cancel']);
  choose(battle, 4);
  assert.equal(battle.phase, 'scan');
  assert.equal(battle.canPause, false);
  tick(battle, ['confirm']);
  assert.equal(battle.phase, 'menu');
  assert.equal(battle.canPause, true);
  assert.equal(battle.hero.bytes, bytes);
  assert.equal(JSON.stringify(game.state), before);
});

test('unaffordable SNAP stays in menu; brace restores bytes and consumes one turn', () => {
  const { battle } = fixture();
  battle.hero.bytes = 0;
  choose(battle, 0);
  assert.equal(battle.phase, 'menu');
  assert.equal(battle.stats.turns, 0);
  choose(battle, 2);
  assert.equal(battle.phase, 'telegraph');
  assert.equal(battle.hero.bytes, 12);
  assert.equal(battle.braced, true);
  assert.equal(battle.stats.turns, 1);
});

test('snack heals half max HP, decrements a snack and consumes a turn', () => {
  const { battle } = fixture();
  battle.hero.hp = 3;
  choose(battle, 3);
  assert.equal(battle.hero.hp, 23);
  assert.equal(battle.hero.snacks, 2);
  assert.equal(battle.stats.turns, 1);
  assert.equal(battle.phase, 'telegraph');
});

test('all required lock flows are reachable with unlocked equipment', () => {
  for (const [id, zone, phase] of [['nib', 0, 'lock'], ['chime', 1, 'lock'], ['spindle', 3, 'lock'], ['cinder', 4, 'spotlight'], ['vesper', 5, 'balance'], ['auric', 6, 'budget']]) {
    const { battle } = fixture(id, zone);
    battle.gear = intendedGear(id);
    battle._previewDefaults();
    choose(battle, 0);
    assert.equal(battle.phase, phase, id);
    if (id === 'chime') assert.deepEqual(battle.lockSteps.map(step => step.kind), ['lo', 'hi']);
    if (id === 'spindle') assert.equal(battle.lockSteps.length, 3);
  }
});

test('Spotlight chosen channels and Balance alpha survive range preparation', () => {
  const { battle } = fixture('vesper', 5);
  battle.gear = { ...intendedGear('vesper'), spotlight: 2 };
  battle._previewDefaults();
  battle.locks.protected = [3, 9];
  battle.locks.alpha = 0.37;
  battle._startRangeLocks();
  assert.deepEqual(battle.locks.protected, [3, 9]);
  assert.equal(battle.locks.alpha, 0.37);
  assert.equal(battle.lockSteps.length, 2);
});

test('Brine SCAN and preview hide live fidelity but reveal calibration statistics', () => {
  const { battle } = fixture('brine', 2);
  choose(battle, 4);
  assert.equal(battle.gridModel.hidden, true);
  assert.equal(battle.gridModel.fidelity, undefined);
  assert.ok(battle.scanLines.some(line => line.includes('p90')));
  assert.ok(battle.scanLines.some(line => line.includes('hidden')));
});

test('guard resolves each hit once, spends brace on first hit, then grants next-turn bytes', () => {
  const { battle } = fixture();
  battle.hero.bytes = 0;
  battle.braced = true;
  battle.attack = { hits: [8, 8], gaps: [0.85, 0.55], telegraph: 'Two beats.', charge: false };
  battle._startGuard();
  battle.guardAttempt = { grade: 'perfect', multiplier: 0.125, bytes: 2 };
  battle.guardElapsed = 1.01;
  tick(battle);
  assert.equal(battle.hero.hp, 39);
  assert.equal(battle.hero.bytes, 2);
  assert.equal(battle.braced, false);
  assert.equal(battle.hitIndex, 1);
  battle.guardAttempt = { grade: 'good', multiplier: 0.6, bytes: 0 };
  battle.guardElapsed = 1.6;
  tick(battle);
  assert.equal(battle.hero.hp, 34);
  assert.equal(battle.phase, 'enemy-result');
  tick(battle, [], 0.5);
  assert.equal(battle.phase, 'menu');
  assert.equal(battle.hero.bytes, 6);
});

test('cast reaches result, snapshots reward data and requires a fresh confirm', () => {
  const { battle, game } = fixture('static-0');
  const before = JSON.stringify(game.state);
  battle.gear = intendedGear('static-0');
  battle.locks = defaultLocks(battle.essence, battle.gear);
  battle.foeHp = 1;
  battle._commitCast();
  assert.equal(battle.phase, 'snap');
  tick(battle, [], 0.6);
  assert.equal(battle.phase, 'cast-result');
  assert.equal(battle.foeHp, 0);
  tick(battle, [], 1.4);
  assert.equal(battle.result.outcome, 'won');
  assert.equal(battle.finished, false);
  tick(battle, ['confirm'], 0.6);
  assert.equal(battle.finished, true);
  assert.equal(JSON.stringify(game.state), before);
  assert.notEqual(battle.result.gear, battle.gear);
});

test('both flee and defeat return complete result objects without applying save changes', () => {
  for (const outcome of ['fled', 'lost']) {
    const { battle, game } = fixture();
    const before = JSON.stringify(game.state);
    battle._end(outcome);
    assert.equal(battle.result.foeId, 'nib');
    assert.equal(battle.result.guardian, true);
    assert.equal(battle.result.outcome, outcome);
    assert.deepEqual(Object.keys(battle.result.stats), ['perfects', 'fizzles', 'turns']);
    assert.equal(JSON.stringify(game.state), before);
    assert.match(battle.describe(), new RegExp('Result ' + outcome));
  }
});
