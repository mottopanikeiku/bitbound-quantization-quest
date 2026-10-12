export const SAVE_KEY = 'bitbound.adventure.v1';

export function newAdventure() {
  return { version: 1, started: false, completed: [], experiments: Array(7).fill(0), loadouts: {}, position: null, sound: false };
}

export function loadAdventure(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage.getItem(SAVE_KEY));
    if (!saved || saved.version !== 1) return newAdventure();
    const completed = [];
    for (let i = 0; i < 7 && saved.completed?.[i] === i; i++) completed.push(i);
    return { ...newAdventure(), started: saved.started === true, completed,
      sound: saved.sound === true,
      position: Number.isFinite(saved.position?.x) && Number.isFinite(saved.position?.y) ? saved.position : null,
      experiments: Array.from({ length: 7 }, (_, i) => Number.isSafeInteger(saved.experiments?.[i]) && saved.experiments[i] > 0 ? saved.experiments[i] : 0),
      loadouts: saved.loadouts && typeof saved.loadouts === 'object' && !Array.isArray(saved.loadouts) ? saved.loadouts : {} };
  } catch {
    return newAdventure();
  }
}

export function saveAdventure(state, storage = globalThis.localStorage) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    // Storage can be blocked or full. Gameplay still works for this session.
    return false;
  }
}
