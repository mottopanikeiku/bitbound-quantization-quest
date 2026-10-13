import test from "node:test";
import assert from "node:assert/strict";
import { loadAdventure, saveAdventure, newAdventure } from "../src/save.js";

test("denied browser storage access does not prevent a session-only adventure", () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("Storage denied");
    },
  });
  try {
    assert.deepEqual(loadAdventure(), newAdventure());
    assert.equal(saveAdventure(newAdventure()), false);
  } finally {
    if (descriptor)
      Object.defineProperty(globalThis, "localStorage", descriptor);
    else delete globalThis.localStorage;
  }
});

test("damaged saves preserve contiguous friendships and bound RPG resources", () => {
  const storage = {
    getItem: () =>
      JSON.stringify({
        version: 2,
        started: true,
        completed: [0, 1, 4],
        hero: { hp: 9000, bytes: -5, snacks: -1 },
        position: { x: "bad", y: 0 },
        gear: { ruler: "balanced" },
      }),
  };
  const loaded = loadAdventure(storage);
  assert.deepEqual(loaded.completed, [0, 1]);
  assert.equal(loaded.hero.hp, 96);
  assert.equal(loaded.hero.bytes, 0);
  assert.equal(loaded.hero.snacks, 0);
  assert.notEqual(loaded.gear.ruler, "balanced");
  assert.equal(loaded.position, null);
  assert.equal(loaded.started, true);
});

test("invalid JSON restarts safely and a full storage reports session-only mode", () => {
  assert.deepEqual(loadAdventure({ getItem: () => "{broken" }), newAdventure());
  assert.equal(
    saveAdventure(
      { ...newAdventure(), completed: [0] },
      {
        setItem() {
          throw new Error("Quota exceeded");
        },
      },
    ),
    false,
  );
});
