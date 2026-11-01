import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../src/battle/battle.js';
import { ASSISTS, assistAvailability, applyAssist, suggestBudget } from '../src/battle/assists.js';
import { buildSpell, defaultLocks, rangeTargets } from '../src/battle/spell.js';
import { newGame } from '../src/state.js';
import { TECHNIQUE_ORDER } from '../src/content/game-data.js';
function fixture(id) {
  const state = newGame(); state.friends = [0, 1, 2, 3, 4, 5, 6]; state.techniques = [...TECHNIQUE_ORDER];
  const events = [];
  const game = { state, reducedMotion: true, stats: () => ({ maxHp: 90, maxBytes: 100, power: 22 }), emit: (type, data) => events.push({ type, ...data }) };
  const battle = new Battle({ game, foeId: id }); battle.hero.bytes = 100;
  return { battle, events };
}
function press(battle, key) { battle.update(0.02, { pressed: action => action === key, repeat: action => action === key, held: () => false, consume() {} }); }
function arm(battle, key) { battle._friends(); battle.assistIndex = battle.friends.indexOf(key); battle.assistChoice = {}; battle._assistPreview(); press(battle, 'confirm'); }
test('every friend performs only its specified partial plan and real packet arithmetic', () => {
  for (const key of Object.keys(ASSISTS)) {
    const { battle } = fixture(key);
    if (key === 'cinder') battle.gear.spotlight = 2;
    const manual = { ...battle.locks, ranges: [...battle.locks.ranges], lows: [...battle.locks.lows], highs: [...battle.locks.highs], protected: [...battle.locks.protected] };
    const result = applyAssist(key, battle);
    assert.equal(result.ok, true, key);
    const manualGear = { ...battle.gear, budget: battle.gear.budget ? [...battle.gear.budget] : null };
    if (key === 'auric') Object.assign(manual, defaultLocks(battle.essence, manualGear));
    const targets = rangeTargets(battle.essence, manualGear, battle.locks);
    if (key === 'nib') manual.ranges[0] = targets[0].amax;
    if (key === 'chime') manual.lows[0] = Math.min(0, targets[0].min);
    if (key === 'brine') manual.ranges[0] = Math.max(...battle.essence.archive.calm.map(Math.abs));
    if (key === 'spindle') { const group = result.completed[0].group; manual.ranges[group] = targets[group].amax; }
    if (key === 'cinder') manual.protected = [...battle.locks.protected];
    if (key === 'vesper') manual.alpha = 0.5;
    assert.deepEqual(buildSpell(battle.essence, battle.gear, battle.locks), buildSpell(battle.essence, manualGear, manual), key);
    if (key === 'chime') assert.deepEqual(result.completed.map(step => step.kind), ['lo']);
    if (key === 'vesper') assert.equal(result.alpha, true);
    if (key === 'auric') assert.equal(result.completed.length, 0);
  }
});
test('one charge; canceled or unaffordable casts keep it; committed fizzles spend it', () => {
  const { battle, events } = fixture('chime');
  arm(battle, 'chime'); assert.equal(battle.phase, 'lock'); assert.deepEqual(battle.lockSteps.map(step => step.kind), ['hi']);
  press(battle, 'cancel'); assert.deepEqual(battle.assistsUsed, []); assert.equal(battle.gear.zero, false);
  arm(battle, 'chime'); battle.hero.bytes = 0; battle._commitCast(); assert.deepEqual(battle.assistsUsed, []);
  battle.hero.bytes = 100; arm(battle, 'chime'); battle.locks.highs[0] = 0.01; battle._commitCast(); battle._castResult();
  assert.equal(battle.lastSpell.fizzle, true); assert.deepEqual(battle.assistsUsed, ['chime']);
  assert.equal(events.filter(event => event.type === 'assist').length, 1);
  assert.equal(assistAvailability('chime', battle).ok, false);
});
test('privacy and applicability are checked before inspecting hidden rows', () => {
  const { battle } = fixture('brine');
  const rows = battle.essence.rows; battle.essence.rows = new Proxy(rows, { get() { throw new Error('hidden rows accessed'); } });
  for (const key of ['nib', 'chime', 'spindle', 'cinder', 'vesper', 'auric']) assert.equal(assistAvailability(key, battle).ok, false, key);
  assert.equal(assistAvailability('brine', battle).ok, true);
  applyAssist('brine', battle); assert.equal(battle.locks.ranges[0], 0.49);
  battle.assistChoice.archive = 'storm'; applyAssist('brine', battle); assert.equal(battle.locks.ranges[0], 2.2);
  battle.essence.rows = rows;
  battle.mode = 'duel'; assert.equal(assistAvailability('brine', battle).ok, false);
  const nib = fixture('nib').battle; nib.techniques = []; assert.equal(assistAvailability('nib', nib).ok, false);
});
test('Auric exhaustively scores 64 tuples with affordable ceilings and deterministic ties', () => {
  const { battle } = fixture('auric');
  for (const ceiling of [20, 24, 28, 32, 40]) {
    const best = suggestBudget(battle, ceiling);
    assert.ok(best.cost <= ceiling);
    const candidates = [];
    for (const a of [2, 3, 4, 8]) for (const b of [2, 3, 4, 8]) for (const c of [2, 3, 4, 8]) {
      const bits = [a, b, c], gear = { ...battle.gear, budget: bits };
      const spell = buildSpell(battle.essence, gear, defaultLocks(battle.essence, gear));
      if (spell.cost <= ceiling) candidates.push({ bits, cost: spell.cost, fidelity: spell.fidelity });
    }
    candidates.sort((a, b) => b.fidelity - a.fidelity || a.cost - b.cost || a.bits.join('').localeCompare(b.bits.join('')));
    assert.deepEqual(best, candidates[0]);
  }
  battle.hero.bytes = 1; assert.equal(suggestBudget(battle, 40), null);
  assert.equal(assistAvailability('auric', battle).ok, false);
});
test('Cinder preserves the automatic kept weight; Vesper skips alpha but not two rulers', () => {
  const cinder = fixture('cinder').battle; cinder.gear.spotlight = 2; arm(cinder, 'cinder');
  assert.equal(cinder.phase, 'spotlight'); assert.equal(cinder.locks.protected.length, 1);
  const first = cinder.locks.protected[0]; cinder.pickIndex = cinder.salience.map((value, index) => ({ value, index })).sort((a, b) => b.value - a.value)[1].index;
  press(cinder, 'confirm'); assert.equal(cinder.phase, 'lock'); assert.ok(cinder.locks.protected.includes(first)); assert.equal(cinder.preview.cost, 16);
  const vesper = fixture('vesper').battle; arm(vesper, 'vesper');
  assert.equal(vesper.phase, 'lock'); assert.equal(vesper.locks.alpha, 0.5); assert.equal(vesper.lockSteps.length, 2);
});
