import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, newGame, sanitize, saveGame, SAVE_KEY } from '../src/state.js';

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
