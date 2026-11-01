import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle, COMMANDS } from '../src/battle/battle.js';
import { newGame } from '../src/state.js';
import { TECHNIQUE_ORDER } from '../src/content/game-data.js';
import { buildSpell, defaultLocks } from '../src/battle/spell.js';
import { createEssence } from '../src/battle/foes.js';
import { GUARD_WINDOWS, guardJudgement } from '../src/battle/timing.js';
import { COACH } from '../src/content/lessons.js';
const input = (keys = [], held = []) => ({ pressed: key => keys.includes(key), repeat: key => keys.includes(key), held: key => held.includes(key), consume() {} });
function fixture(params = {}, reducedMotion = false) {
  const state = newGame(); state.techniques = [...TECHNIQUE_ORDER]; state.friends = [0, 1, 2]; state.flags = ['guard-taught', 'grid-read'];
  const events = [], flags = [];
  const game = { state, reducedMotion, stats: () => ({ maxHp: 80, maxBytes: 100, power: 22 }), emit: (type, data) => events.push({ type, ...data }), setFlag: flag => flags.push(flag), screen: { w: 384, h: 216 } };
  return { game, events, flags, battle: new Battle({ game, foeId: 'nib', ...params }) };
}
function cast(battle, { perfect = true, fizzle = false, damage = 10 } = {}) {
  battle.hero.bytes = 100;
  battle.locks = defaultLocks(battle.essence, battle.gear); battle._commitCast();
  battle.lastSpell = { ...battle.lastSpell, perfect, fizzle, damage }; battle.lastCast.spell = battle.lastSpell; battle._castResult();
}
function volley(battle, grades, offensive) {
  battle.volleyOffensive = offensive; battle.attack = { hits: grades.map(() => 4), gaps: grades.map(() => 0.65) };
  battle._startEnemy(); battle._startGuard();
  for (const grade of grades) { battle.guardAttempt = guardJudgement(grade === 'perfect' ? 0 : grade === 'good' ? 0.1 : 1); battle._resolveHit(); }
}
test('six commands replace FLEE with FRIENDS; free menus/cancels never alter Resonance', () => {
  const { battle } = fixture();
  assert.deepEqual(COMMANDS, ['SNAP', 'TUNE', 'GUARD', 'FRIENDS', 'SNACK', 'SCAN']);
  battle._setResonance(3);
  battle.menu = 3; battle.update(0.02, input(['confirm'])); assert.equal(battle.phase, 'friends');
  battle.update(0.02, input(['cancel'])); assert.equal(battle.resonance, 3); assert.equal(battle.stats.turns, 0);
  battle.menu = 5; battle.update(0.02, input(['confirm'])); battle.update(0.02, input(['cancel'])); assert.equal(battle.resonance, 3);
  battle.flee(); assert.equal(battle.result.outcome, 'fled'); assert.equal(battle.result.grade, null);
});
test('Resonance expression gains/loses/clears without changing actual damage', () => {
  const { battle, events } = fixture(); battle.foeHp = 300;
  cast(battle); assert.equal(battle.resonance, 1); assert.equal(battle.lastDamage, 10);
  volley(battle, ['perfect', 'perfect', 'perfect'], true); assert.equal(battle.resonance, 2);
  volley(battle, ['good', 'perfect'], true); assert.equal(battle.resonance, 2);
  volley(battle, ['miss', 'miss', 'miss'], true); assert.equal(battle.resonance, 0);
  battle._setResonance(3); volley(battle, ['perfect', 'perfect'], false); assert.equal(battle.resonance, 3);
  cast(battle, { perfect: false }); assert.equal(battle.resonance, 2);
  cast(battle, { perfect: false, fizzle: true, damage: 0 }); assert.equal(battle.resonance, 0);
  battle._setResonance(4); cast(battle, { damage: 0 }); assert.equal(battle.resonance, 0); assert.equal(battle.maxResonance, 4);
  assert.ok(events.some(event => event.type === 'resonance' && event.level === 4));
});
test('tally first confirm completes and requires a release and separate exit', () => {
  const { battle } = fixture(); battle._end('won');
  battle.update(0.2, input(['confirm'], ['confirm'])); assert.equal(battle.finished, false); assert.equal(battle.tallyAge, 1.66);
  battle.update(1, input(['confirm'], ['confirm'])); assert.equal(battle.finished, false);
  battle.update(0.1, input()); battle.update(0.1, input(['confirm'], ['confirm'])); assert.equal(battle.finished, true);
});
test('practice, duel and well never read campaign hero; all results carry isolated mode', () => {
  for (const mode of ['practice', 'duel', 'well']) {
    const { game } = fixture(); Object.defineProperty(game.state, 'hero', { get() { throw new Error('campaign hero read'); } });
    const well = { depth: 1, name: 'Toy floor', hp: 40, power: 4, floor: 0.65, family: 'bits', hero: { hp: 56, bytes: 56, snacks: 3 }, limits: { maxHp: 56, maxBytes: 56, power: 22 }, essence: (...args) => createEssence('nib', ...args), attack: () => ({ hits: [4], gaps: [0.85], charge: false }), rules: {} };
    const battle = new Battle({ game, foeId: 'nib', mode, duel: 'fen-offset', well }); battle._end('fled');
    assert.equal(battle.result.mode, mode); assert.equal(battle.result.reward.bytes, 0); assert.equal(battle.result.grade, null);
    assert.match(battle.describe(), new RegExp('Mode ' + mode));
  }
});
test('Fen accepts three resolved witnesses and rejects an oversized perfect packet', () => {
  const { battle } = fixture({ foeId: 'fen', mode: 'duel', duel: 'fen-offset' });
  battle.gear.bits = 8; battle.locks = defaultLocks(battle.essence, battle.gear); battle._commitCast(); battle._castResult();
  assert.equal(battle.duelAccepted, 0); assert.equal(battle.duelJudgement.packetOk, false);
  for (let i = 0; i < 3; i++) {
    battle.hero.bytes = 64; battle.gear.bits = 4; battle.gear.zero = true; battle.locks = defaultLocks(battle.essence, battle.gear);
    battle._commitCast(); battle._castResult(); assert.equal(battle.duelJudgement.accepted, true);
    battle._startEnemy(); if (i < 2) { assert.equal(battle.phase, 'telegraph'); battle._beginTurn(); }
  }
  assert.equal(battle.result.outcome, 'won'); assert.deepEqual(battle.result.duel, { accepted: 3, rounds: 3 }); assert.equal(battle.result.grade, null);
});
test('all Well hooks alter only labelled local charge, HP and control rules', () => {
  const well = { depth: 5, warden: true, wardenId: 'root-raster', name: 'Root Raster', hp: 80, power: 5, floor: 0.65, family: 'bits', hero: { hp: 56, bytes: 20, snacks: 3 }, limits: { maxHp: 56, maxBytes: 80, power: 22 }, techniques: ['bits'], friends: [0], essence: (...args) => createEssence('nib', ...args), attack: () => ({ hits: [10, 8], gaps: [0.85, 0.45], charge: false }), rules: { recharge: 2, perfectGuardBytes: 4, hitReduction: 2, steadyScale: 0.3, firstCastRebate: 6, firstGuardBytes: 4, snackBonus: 10, braceMultiplier: 0.4, echoHit: true, attackBonus: 2, emergencyHeal: 12 } };
  const { battle } = fixture({ mode: 'well', well });
  assert.equal(battle.hero.bytes, 22); assert.deepEqual(battle.attack.hits, [12, 8]); assert.deepEqual(battle.attack.gaps, [0.85, 0.65]);
  battle.menu = 2; battle.update(0.02, input(['confirm'])); assert.equal(battle.hero.bytes, 38);
  battle._startGuard(); battle.guardAttempt = guardJudgement(0, true); battle._resolveHit(); assert.equal(battle.hero.hp, 55); assert.equal(battle.hero.bytes, 42);
  battle._beginTurn(); battle.menu = 2; battle.update(0.02, input(['confirm'])); assert.equal(battle.hero.bytes, 56);
  battle._beginTurn(); battle.hero.hp = 1; battle.menu = 4; battle.update(0.02, input(['confirm'])); assert.equal(battle.hero.hp, 39);
  battle.hero.bytes = 50; battle.locks = defaultLocks(battle.essence, battle.gear); const packet = buildSpell(battle.essence, battle.gear, battle.locks, 22, 0.65);
  battle._commitCast(); battle._castResult(); assert.equal(battle.stats.packetBytes, packet.cost); assert.equal(battle.hero.bytes, 50 - packet.cost + 6);
  battle.hero.hp = 12; battle._startGuard(); battle.guardAttempt = guardJudgement(1); battle._resolveHit(); assert.equal(battle.emergencyUsed, true); battle._end('fled'); assert.equal(battle.result.well.emergencyUsed, true);
});
test('impact clocks never affect guard thresholds at 30,60,120 FPS or reduced motion', () => {
  for (const fps of [30, 60, 120]) for (const error of [-0.16, -0.07, 0.07, 0.16]) {
    const outcomes = [];
    for (const reduced of [false, true]) {
      const { battle } = fixture({}, reduced); battle._startGuard(); battle.guardTeaching = false; battle.phase = 'guard';
      battle.impact = { age: 0, pose: 0.075, flash: 0.09 }; battle.heroImpact = { age: 0, pose: 0.055, flash: 0.075 };
      battle.guardTarget = 0.85; battle.guardElapsed = battle.guardTarget + error - 1 / fps;
      const eventInput = { ...input(['confirm']), pressTime: () => performance.now() };
      battle.update(1 / fps, eventInput);
      assert.equal(battle.guardAttempt.grade, guardJudgement(error, false, GUARD_WINDOWS).grade);
      battle.guardElapsed = 2; battle.update(1 / fps, input());
      outcomes.push({ hero: battle.hero, stats: battle.stats, resonance: battle.resonance, phase: battle.phase });
    }
    assert.deepEqual(outcomes[0], outcomes[1]);
  }
});
test('grid-reading flag is persisted and suppresses only generic teaching', () => {
  const { battle, game, flags } = fixture(); game.state.flags = []; battle.seen.delete('gridReading');
  cast(battle); assert.ok(flags.includes('grid-read'));
  game.state.flags = ['grid-read']; const next = new Battle({ game, foeId: 'nib' }); cast(next);
  assert.ok(next.seen.has('firstSnap')); assert.ok(!next.resultMessages.some(line => line.includes('White dots')));
});

test('teach-once tool and error flags preserve new help and SCAN replay', () => {
  const { battle, game, flags } = fixture({ foeId: 'chime' });
  game.state.flags = ['grid-read']; battle.gear.zero = true;
  cast(battle, { perfect: false, fizzle: true, damage: 0 });
  assert.ok(flags.includes('taught-zero')); assert.ok(flags.includes('taught-fizzle'));
  game.state.flags.push(...flags);
  const next = new Battle({ game, foeId: 'chime' }); next.gear.zero = true;
  cast(next, { perfect: false, fizzle: true, damage: 0 });
  assert.equal(next.resultMessages.length, 0);
  next._scan(); next.scanPage = 1; next._scanPage();
  assert.ok(next.scanLines.includes(COACH.chime.fizzle), 'optional SCAN keeps the exact help available');
  const newTool = new Battle({ game, foeId: 'spindle' }); cast(newTool, { perfect: false });
  assert.ok(newTool.seen.has('technique'), 'a different tool still receives its help');
});

test('results recognize first specimen, first clear and a coherent personal best', () => {
  const fresh = fixture({ species: 'stepbud', foeId: 'static-0' }).battle;
  fresh._end('won'); assert.equal(fresh.recognition, 'NEW SPECIMEN'); assert.equal(fresh.foe.hp, 45);
  const origin = fixture({ species: 'bit-sprig', foeId: 'static-0' }).battle;
  assert.equal(origin.foe.hp, 18);
  const first = fixture().battle; first._end('won'); assert.equal(first.recognition, 'FIRST CLEAR');
  const { battle, game } = fixture(); game.state.progress.records.nib = { grade: 'C', score: 1 };
  battle.casts = [{ fidelity: 1, cost: 10 }]; battle.stats.turns = 1;
  battle._end('won'); assert.equal(battle.recognition, 'PERSONAL BEST');
  assert.deepEqual(game.state.progress.records.nib, { grade: 'C', score: 1 }, 'comparison reads before battle settlement');
});

test('practice and duel Again is opt-in, skippable and uses a separate confirm', () => {
  for (const mode of ['practice', 'duel']) {
    const { battle } = fixture({ mode, duel: 'fen-offset' }); battle._end('won');
    assert.equal(battle.resultChoice, 0); assert.equal(battle.result.again, undefined);
    battle.update(0.001, input(['right'])); assert.equal(battle.resultChoice, 1);
    battle.update(0.001, input(['confirm']));
    if (mode === 'practice') {
      assert.equal(battle.finished, false); assert.equal(battle.tallyAge, 1.66);
      battle.update(0.001, input()); battle.update(0.001, input(['confirm']));
    }
    assert.equal(battle.finished, true); assert.equal(battle.result.again, true);
  }
});

test('calibration event exposes resolved regime, not concealed live values', () => {
  const { battle, events } = fixture({ foeId: 'brine' });
  cast(battle);
  assert.equal(events.find(event => event.type === 'cast').regime, 'calm');
  battle._beginTurn(); cast(battle);
  assert.equal(events.filter(event => event.type === 'cast').at(-1).regime, 'storm');
});

test('rematches are fought at the first-meeting level however strong the hero has grown', () => {
  // A late-game hero (power 37) once cleared Chime with two fat 8-bit packets and earned an S.
  const early = fixture({ foeId: 'chime', mode: 'practice', guardian: true, zone: 1 });
  const late = fixture({ foeId: 'chime', mode: 'practice', guardian: true, zone: 1 });
  late.game.stats = () => ({ maxHp: 96, maxBytes: 112, power: 37, maxSnacks: 5 });
  const relaunched = new Battle({ game: late.game, foeId: 'chime', mode: 'practice', guardian: true, zone: 1 });
  assert.deepEqual(relaunched.limits, early.battle.limits);
  assert.equal(relaunched.limits.power, 19, 'Chime is first met with one friend');
  assert.equal(new Battle({ game: late.game, foeId: 'chime', zone: 1 }).limits.power, 37, 'campaign fights keep the hero’s current strength');
});
