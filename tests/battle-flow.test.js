import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../src/battle/battle.js';
import { newGame } from '../src/state.js';
import { heroStats, TECHNIQUE_ORDER } from '../src/content/game-data.js';
import { intendedGear } from '../src/battle/foes.js';
import { defaultLocks } from '../src/battle/spell.js';
import { battleLayout, battlePrompt, scanPanelContent } from '../src/battle/battle-view.js';
import { COACH } from '../src/content/lessons.js';

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
  assert.ok(battle.scanLines.some(line => line.includes('90% of past calm values')));
  assert.ok(battle.scanLines.some(line => line.includes('hidden')));
  assert.deepEqual(battle.gridModel.view, { min: -2.4, max: 2.4 });
});

test('guard resolves each hit once, spends brace on first hit, then grants next-turn bytes', () => {
  const { battle } = fixture();
  battle.hero.bytes = 0;
  battle.braced = true;
  battle.attack = { hits: [8, 8], gaps: [0.85, 0.55], telegraph: 'Two beats.', charge: false };
  battle._startGuard();
  assert.equal(battle.phase, 'guard-ready');
  tick(battle, [], 0.3);
  tick(battle, ['confirm']);
  assert.equal(battle.phase, 'guard');
  assert.equal(battle.guardWindows.good, 0.24);
  battle.guardAttempt = { grade: 'perfect', multiplier: 0.125, bytes: 2 };
  battle.guardElapsed = 1.2;
  tick(battle);
  assert.equal(battle.hero.hp, 39);
  assert.equal(battle.hero.bytes, 2);
  assert.equal(battle.braced, false);
  assert.equal(battle.hitIndex, 1);
  assert.equal(battle.guardWindows.good, 0.16);
  battle.guardAttempt = { grade: 'good', multiplier: 0.6, bytes: 0 };
  battle.guardElapsed = 1.8;
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
  tick(battle, [], 10);
  assert.equal(battle.phase, 'cast-result');
  assert.match(battle.message, /White dots are true values/);
  for (let i = 0; i < 10 && battle.phase === 'cast-result'; i++) tick(battle, ['confirm'], 0.3);
  assert.equal(battle.result.outcome, 'won');
  assert.deepEqual(battle.result.reward, { bytes: 6 });
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
    assert.equal(battle.result.stats.casts, 0);
    assert.equal(battle.result.stats.guardBeats, 0);
    assert.equal(JSON.stringify(game.state), before);
    assert.match(battle.describe(), new RegExp('Result ' + outcome));
  }
});

test('flee copy distinguishes a waiting guardian from a disengaged static patrol', () => {
  const guardian = fixture('nib').battle;
  const patrol = fixture('static-0').battle;
  guardian._end('fled');
  patrol._end('fled');
  assert.match(guardian.recap, /guardian/);
  assert.match(guardian.message, /guardian/);
  assert.match(patrol.recap, /staticling.*move away/);
  assert.match(patrol.message, /staticling.*home/);
  assert.doesNotMatch(patrol.recap + patrol.message, /guardian/i);
  assert.equal(patrol.result.outcome, 'fled');
  assert.equal(patrol.result.guardian, false);
});

test('new result coaches queue in order and cannot be skipped by a held confirm', () => {
  const { battle } = fixture('nib');
  battle.gear = intendedGear('nib');
  battle.locks = defaultLocks(battle.essence, battle.gear);
  battle._commitCast();
  tick(battle, [], 0.6);
  assert.equal(battle.resultRetained, true);
  assert.match(battle.message, /White dots are true values/);
  tick(battle, [], 5, ['confirm']);
  assert.match(battle.message, /White dots are true values/);
  tick(battle, ['confirm'], 0.3);
  assert.equal(battle.message, COACH.nib.firstSnap);
  tick(battle, ['confirm'], 0.1);
  assert.equal(battle.message, COACH.nib.firstSnap);
  tick(battle, ['confirm'], 0.2);
  assert.equal(battle.message, COACH.nib.technique);
});

test('SCAN retains prior snapshot, range and tethers after the next essence appears', () => {
  const { battle } = fixture('brine', 2);
  battle.gear = intendedGear('brine');
  battle.locks = { ...defaultLocks(battle.essence, battle.gear), ranges: [0.42] };
  battle._commitCast();
  battle._castResult();
  const snapshot = battle.lastCast;
  battle._beginTurn();
  assert.deepEqual(battle.locks.ranges, [0.42]);
  battle._scan();
  tick(battle, ['right']);
  assert.equal(battle.scanPage, 1);
  assert.equal(battle.gridModel.rows, snapshot.spell.rows);
  assert.equal(battle.gridModel.hidden, false);
  assert.equal(battle.gridModel.showError, true);
  assert.ok(battle.scanLines.some(line => line.includes('Last snap')));
  tick(battle, ['left']);
  assert.equal(battle.gridModel.hidden, true);
  assert.deepEqual(battle.gridModel.retainedBracket, { lo: snapshot.spell.rows[0].lo, hi: snapshot.spell.rows[0].hi });
});

test('Brine breathing uses the same absolute interval in calm and storm', () => {
  const { battle } = fixture('brine', 2);
  const domains = [];
  for (const turn of [0, 1, 2, 3]) {
    battle.stats.turns = turn;
    battle._beginTurn();
    battle._startRangeLocks();
    domains.push(battle.domains);
    battle._breatheAt(0);
    assert.equal(battle.locks.ranges[0], 0.15);
    battle._breatheAt(Math.max(1.6, 2.12 - battle.foe.zone * 0.065) / 2);
    assert.equal(battle.locks.ranges[0], 2.4);
  }
  for (const domain of domains) assert.deepEqual(domain, domains[0]);
});

test('guard feedback latches one attempt and teaching is once per game state', () => {
  const { battle, game } = fixture();
  battle.attack = { hits: [8], gaps: [0.85] };
  battle._startGuard();
  tick(battle, [], 0.3);
  tick(battle, ['confirm']);
  tick(battle, ['confirm']);
  assert.equal(battle.guardFeedback, 'EARLY');
  const attempt = battle.guardAttempt;
  tick(battle, ['confirm'], 0.7);
  assert.equal(battle.guardAttempt, attempt);
  const next = new Battle({ game, foeId: 'nib', guardian: true });
  next._startGuard();
  assert.equal(next.phase, 'guard');
  assert.equal(next.guardWindows.good, 0.16);
});

test('portrait reaction and damage stay above the plot', () => {
  const { battle, game } = fixture('cinder', 4);
  game.screen = { w: 216, h: 374, portrait: true };
  battle.phase = 'cast-result';
  const layout = battleLayout(game.screen);
  assert.equal(layout.reaction.h, 60);
  assert.ok(layout.reaction.y + layout.reaction.h < layout.grid.y);
  const anchor = battle._anchor();
  assert.ok(anchor.y - 56 >= layout.reaction.y);
  assert.ok(anchor.y - 40 < layout.grid.y);
  assert.ok(anchor.x > layout.reaction.w / 2);
});

test('PERFECT with tiny clipping never asks the player to widen the grid', () => {
  const { battle } = fixture('cinder', 4);
  battle.gear = intendedGear('cinder');
  battle.locks = defaultLocks(battle.essence, battle.gear);
  battle.locks.ranges = battle.locks.ranges.map(range => range * 0.999);
  battle._commitCast();
  battle._castResult();
  assert.equal(battle.lastSpell.perfect, true);
  assert.ok(battle.lastSpell.clippedCount > 0);
  assert.ok(battle.resultMessages.includes(COACH.cinder.clippedPerfect));
  assert.ok(!battle.resultMessages.includes(COACH.cinder.clipped));
});

test('native guardian stages and casting panels never overlap their neighbours', () => {
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  for (const id of ['nib', 'chime', 'brine', 'spindle', 'cinder', 'vesper', 'auric']) {
    for (const screen of [{ w: 384, h: 216 }, { w: 216, h: 374, portrait: true }]) {
      const l = battleLayout(screen, id, ['cinder', 'vesper'].includes(id));
      assert.ok(l.stage.x >= 0 && l.stage.x + l.stage.w <= screen.w, id);
      assert.ok(l.stage.y >= 0 && l.stage.y + l.stage.h < l.party.y, id);
      assert.equal(overlap(l.castStage, l.grid), false, id);
      if (l.causality) {
        assert.equal(overlap(l.castStage, l.causality), false, id);
        assert.equal(overlap(l.grid, l.causality), false, id);
      }
      if (l.commandHint) assert.equal(overlap(l.stage, l.commandHint), false, id);
    }
  }
});

test('SCAN overflow is scrollable, measured, and never silently drops text', () => {
  const { battle, game } = fixture('vesper', 5);
  battle._scan();
  battle.scanLines = Array.from({ length: 24 }, (_, i) => 'A measured scan sentence number ' + i + '.');
  for (const screen of [{ w: 384, h: 216 }, { w: 216, h: 374, portrait: true }]) {
    game.screen = screen;
    battle.scanScroll = 0;
    const content = scanPanelContent(battle, battleLayout(screen, 'vesper'));
    assert.ok(content.rows.length > content.capacity);
    for (let i = 0; i < 100; i++) tick(battle, ['down']);
    assert.equal(battle.scanScroll, content.rows.length - content.capacity);
    assert.match(content.rows.slice(battle.scanScroll).at(-1), /23/);
    tick(battle, ['up']);
    assert.equal(battle.scanScroll, content.rows.length - content.capacity - 1);
  }
});

test('all battle prompts use touch actions, never keyboard names, on touch', () => {
  const { battle, game } = fixture();
  game.input = { lastDevice: 'touch' };
  battle.lastSpell = { rows: [{}] };
  for (const phase of ['menu', 'tune', 'scan', 'result', 'lock', 'balance', 'spotlight', 'budget', 'guard-ready', 'guard', 'cast-result', 'snap', 'telegraph', 'enemy-result']) {
    battle.phase = phase;
    const prompt = battlePrompt(battle);
    assert.doesNotMatch(prompt, /ENTER|ESC|SHIFT/, phase);
    assert.match(prompt, /\bA\b/, phase);
  }
  battle.phase = 'lock';
  assert.equal(battlePrompt(battle), 'A lock · hold STEADY · B back');
});

test('missing tools get attainable advice and never open an empty TUNE', () => {
  const { game } = fixture();
  game.state.techniques = [];
  const first = new Battle({ game, foeId: 'static-0' });
  assert.match(first.message, /current 4-bit grid/);
  choose(first, 1);
  assert.equal(first.phase, 'menu');
  assert.match(first.message, /No tuning tools yet/);
  game.state.techniques = ['bits'];
  const shifted = new Battle({ game, foeId: 'chime', guardian: true });
  assert.match(shifted.message, /More bits can help until you learn Zero-Shift/);
  shifted._scan();
  assert.equal(shifted.message, shifted.availableHint);
  assert.ok(shifted.scanLines.includes(shifted.availableHint));
});

test('completed first-guard teaching is returned to the save owner on every outcome', () => {
  for (const outcome of ['won', 'lost', 'fled']) {
    const { battle } = fixture();
    battle._startGuard();
    tick(battle, [], 0.3);
    tick(battle, ['confirm']);
    battle._end(outcome);
    assert.equal(battle.result.guardTaught, true);
  }
  const { battle, game } = fixture();
  game.state.flags.push('guard-taught');
  battle._startGuard();
  assert.equal(battle.phase, 'guard');
  assert.equal(battle.guardWindows.good, 0.16);
});

test('an unaffordable Budget can still be opened and reduced before spending bytes', () => {
  const { battle } = fixture('auric', 6);
  battle.gear = intendedGear('auric');
  battle._previewDefaults();
  battle.hero.bytes = 18;
  assert.ok(battle.preview.cost > battle.hero.bytes);
  choose(battle, 0);
  assert.equal(battle.phase, 'budget');
  assert.match(battle.message, /weighted fidelity preview/);
  tick(battle, ['left']);
  tick(battle, ['left']);
  tick(battle, ['left']);
  assert.equal(battle.gear.budget[0], 2);
  assert.equal(battle.preview.cost, 18);
  assert.equal(battle.hero.bytes, 18);
  assert.equal(battle.stats.turns, 0);
  tick(battle, ['confirm']);
  assert.equal(battle.phase, 'lock');
});

test('incoming guard rings stay between the visible foe and party on portrait screens', () => {
  for (const h of [334, 374, 420]) {
    const layout = battleLayout({ w: 216, h, portrait: true }, 'auric');
    assert.ok(layout.guard.y - layout.guard.radius > layout.foe.y);
    assert.ok(layout.guard.y + layout.guard.radius < layout.party.y);
  }
});

test('Last snap pages expose every historical row without changing the saved cast', () => {
  const { battle } = fixture('vesper', 5);
  battle.gear = intendedGear('vesper');
  battle.locks = defaultLocks(battle.essence, battle.gear);
  battle._commitCast();
  battle._castResult();
  const snapshot = battle.lastCast;
  battle._beginTurn();
  battle._scan();
  for (let row = 0; row < snapshot.spell.rows.length; row++) {
    tick(battle, ['right']);
    assert.equal(battle.gridModel.rows, snapshot.spell.rows);
    assert.equal(battle.gridModel.activeRow, row);
    assert.equal(battle.gridModel.showError, true);
  }
  tick(battle, ['right']);
  assert.equal(battle.scanPage, 0);
  assert.equal(battle.lastCast, snapshot);
});
