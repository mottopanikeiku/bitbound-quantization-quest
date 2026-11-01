import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, newGame, sanitize, saveGame, SAVE_KEY, LEGACY_SAVE_KEYS } from '../src/state.js';
import { newRun } from '../src/well/run.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
}

test('a saved adventure round-trips through storage', () => {
  const storage = memoryStorage();
  const state = newGame();
  state.started = true;
  state.friends = [0, 1];
  state.techniques = ['bits', 'zero'];
  state.gear.zero = true;
  state.shards = ['meadow-a'];
  state.position = { x: 412.5, y: 300 };
  assert.equal(saveGame(state, storage), true);
  const loaded = loadGame(storage);
  assert.deepEqual(loaded.friends, [0, 1]);
  assert.equal(loaded.gear.zero, true);
  assert.deepEqual(loaded.position, { x: 412.5, y: 300 });
  assert.equal(loaded.hero.hp, state.hero.hp);
});

test('older save formats and corrupt JSON start a fresh adventure', () => {
  assert.equal(loadGame(memoryStorage({ [SAVE_KEY]: '{oops' })).started, false);
  assert.equal(sanitize({ version: 2, started: true, completed: [0, 1] }).started, false);
});

test('full screen starts on, and a player who turns it off keeps it off', () => {
  const storage = memoryStorage();
  const state = newGame();
  assert.equal(state.fullscreen, true);
  state.fullscreen = false;
  saveGame(state, storage);
  assert.equal(loadGame(storage).fullscreen, false);
  assert.equal(sanitize({ version: 3, music: false }).fullscreen, true, 'saves from before the option enter full screen');
});

test('friends must be an in-order prefix and gear needs its technique', () => {
  const state = sanitize({
    version: 3,
    friends: [0, 2, 3],
    techniques: ['bits', 'groups', 'not-a-technique'],
    gear: { bits: 5, zero: true, groups: true, spotlight: 2, budget: [8, 8, 8] },
  });
  assert.deepEqual(state.friends, [0]);
  assert.deepEqual(state.techniques, ['bits', 'groups']);
  assert.deepEqual(state.gear, { bits: 4, zero: false, groups: true, spotlight: 0, balance: false, budget: null });
});

test('hero values are clamped to the stats earned so far', () => {
  const state = sanitize({ version: 3, friends: [0], hero: { hp: 999, bytes: -4, snacks: 12 } });
  assert.equal(state.hero.hp, 48);
  assert.equal(state.hero.bytes, 0);
  assert.equal(state.hero.snacks, 5);
});

test('a v3 save keeps its adventure when it migrates to v4', () => {
  const v3 = { version: 3, started: true, friends: [0, 1, 2], techniques: ['bits', 'zero', 'calib'], shards: ['meadow-hidden'], camp: 'cove-camp', position: { x: 300, y: 200 }, stats: { battles: 9, perfects: 4, fizzles: 1 } };
  const storage = memoryStorage({ [LEGACY_SAVE_KEYS[0]]: JSON.stringify(v3) });
  const loaded = loadGame(storage);
  assert.equal(loaded.version, 4);
  assert.equal(loaded.started, true);
  assert.deepEqual(loaded.friends, [0, 1, 2]);
  assert.deepEqual(loaded.position, { x: 300, y: 200 });
  assert.equal(loaded.stats.battles, 9);
  assert.deepEqual(loaded.camps, ['point-camp', 'cove-camp'], 'the respawn camp counts as lit');
  assert.deepEqual(loaded.rival, { won: [], losses: 0 });
  assert.equal(loaded.wellRun, null);
  assert.deepEqual(loaded.bonds, {});
  assert.equal(loaded.progress.well.best, 0);
  saveGame(loaded, storage);
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).version, 4, 'the next save writes the v4 key');
  loaded.friends.push(3);
  saveGame(loaded, storage);
  assert.equal(loadGame(storage).friends.length, 4, 'the v4 save wins over the untouched legacy key');
});

test('v4 meta-progress round-trips and untrusted values are clamped or dropped', () => {
  const state = sanitize({
    version: 4,
    started: true,
    friends: [0],
    techniques: ['bits'],
    camps: ['meadow-camp', 42, 'x'.repeat(60)],
    bonds: { nib: 3, chime: -2, ghost: 9 },
    rival: { won: ['fen-hot', 'fen-hot', 'fen-zzz'], losses: 2.9 },
    hat: 'not-a-hat',
    pin: 'meadow-hidden',
    wellRun: newRun({ seed: 3735928559, techniques: ['bits'], friends: [0] }),
    progress: {
      dex: { 'bit-sprig': { seen: true, cleared: 3, golden: 1, goldenSeen: true }, 'static-99': { seen: true } },
      records: { nib: { grade: 'S', score: 94, turns: 5, fidelity: 0.97 }, chime: { grade: 'Z', score: 10 } },
      well: { best: 12, bestScore: 80, runs: 4, floors: 30 },
    },
  });
  assert.deepEqual(state.camps, ['point-camp', 'meadow-camp']);
  assert.deepEqual(state.bonds, { nib: 3 });
  assert.deepEqual(state.rival, { won: ['fen-hot'], losses: 2 });
  assert.equal(state.hat, null);
  assert.equal(state.pin, 'meadow-hidden');
  assert.equal(state.wellRun.seed, 3735928559, 'a valid suspended run survives');
  const forged = sanitize({ version: 4, started: true, friends: [0], techniques: ['bits'], wellRun: newRun({ seed: 7, techniques: ['bits', 'zero'], friends: [0] }) });
  assert.equal(forged.wellRun, null, 'a run using a technique the adventure has not learned is dropped');
  assert.deepEqual(Object.keys(state.progress.dex), ['bit-sprig']);
  assert.ok(state.progress.dex['bit-sprig'].golden, 'a caught golden survives sanitizing');
  assert.deepEqual(Object.keys(state.progress.records), ['nib']);
  assert.equal(state.progress.well.best, 12);
});
