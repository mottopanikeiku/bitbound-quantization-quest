import { availableRulers, newGear } from "./battle.js";

export const SAVE_KEY = "bitbound.rpg.v2";
export function newAdventure() {
  return {
    version: 2,
    started: false,
    completed: [],
    collected: [],
    position: null,
    music: true,
    gear: newGear(),
    hero: { hp: 80, maxHp: 80, bytes: 256, maxBytes: 256, snacks: 3 },
  };
}
const bounded = (value, fallback, max) =>
  Number.isFinite(value)
    ? Math.max(0, Math.min(max, Math.trunc(value)))
    : fallback;
export function loadAdventure(storage) {
  try {
    storage ??= globalThis.localStorage;
    const saved = JSON.parse(storage.getItem(SAVE_KEY));
    if (!saved || saved.version !== 2) return newAdventure();
    const completed = [];
    for (let i = 0; i < 7 && saved.completed?.[i] === i; i++) completed.push(i);
    const maxHp = 80 + completed.length * 8;
    const gear = newGear();
    if ([2, 4, 8].includes(saved.gear?.weightBits))
      gear.weightBits = saved.gear.weightBits;
    if ([2, 4, 8].includes(saved.gear?.activationBits))
      gear.activationBits = saved.gear.activationBits;
    if (availableRulers(completed).includes(saved.gear?.ruler))
      gear.ruler = saved.gear.ruler;
    return {
      version: 2,
      started: saved.started === true,
      completed,
      gear,
      music: saved.music !== false,
      collected: Array.isArray(saved.collected)
        ? [
            ...new Set(
              saved.collected.filter(
                (id) => typeof id === "string" && id.length < 40,
              ),
            ),
          ].slice(0, 64)
        : [],
      position:
        Number.isFinite(saved.position?.x) && Number.isFinite(saved.position?.y)
          ? { x: saved.position.x, y: saved.position.y }
          : null,
      hero: {
        maxHp,
        maxBytes: 256,
        hp: bounded(saved.hero?.hp, maxHp, maxHp),
        bytes: bounded(saved.hero?.bytes, 256, 256),
        snacks: bounded(saved.hero?.snacks, 3, 9),
      },
    };
  } catch {
    return newAdventure();
  }
}
export function saveAdventure(state, storage) {
  try {
    storage ??= globalThis.localStorage;
    storage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
