// A Static Well expedition. The run has its own hero and limits, so the island adventure is
// never at risk; the save keeps one suspended run between floors (state.wellRun).
import { TECHNIQUE_ORDER, GUARDIANS } from '../content/game-data.js';

export const RUN_VERSION = 1;
/** Every expedition starts from the same fictional resources, whatever the campaign stats. */
export const RUN_START = Object.freeze({ maxHp: 56, maxBytes: 56, power: 22, maxSnacks: 3 });

const whole = (value, min, max) => (Number.isFinite(value) ? Math.max(min, Math.min(max, Math.trunc(value))) : null);

/** A fresh expedition; techniques and friends are captured when it starts. */
export function newRun({ seed, techniques, friends }) {
  return {
    version: RUN_VERSION,
    seed: seed >>> 0,
    depth: 1,
    cleared: 0,
    score: 0,
    techniques: TECHNIQUE_ORDER.filter((id) => techniques.includes(id)),
    friends: GUARDIANS.filter((g) => friends.includes(g.id)).map((g) => g.id),
    hero: { hp: RUN_START.maxHp, bytes: RUN_START.maxBytes, snacks: 3 },
    limits: { ...RUN_START },
    boons: {},
  };
}

/** Validate a saved run against the current adventure (never throws); null when unusable. */
export function sanitizeRun(saved, state) {
  if (!saved || typeof saved !== 'object' || saved.version !== RUN_VERSION) return null;
  const seed = whole(saved.seed, 0, 0xffffffff), depth = whole(saved.depth, 1, 9999);
  if (seed === null || depth === null) return null;
  const run = newRun({ seed, techniques: Array.isArray(saved.techniques) ? saved.techniques.filter((id) => state.techniques.includes(id)) : [], friends: Array.isArray(saved.friends) ? saved.friends.filter((id) => state.friends.includes(id)) : [] });
  run.depth = depth;
  run.cleared = whole(saved.cleared, 0, depth) ?? 0;
  run.score = whole(saved.score, 0, 1e9) ?? 0;
  run.limits = {
    maxHp: whole(saved.limits?.maxHp, 1, 999) ?? RUN_START.maxHp,
    maxBytes: whole(saved.limits?.maxBytes, 1, 999) ?? RUN_START.maxBytes,
    power: whole(saved.limits?.power, 1, 999) ?? RUN_START.power,
    maxSnacks: whole(saved.limits?.maxSnacks, 0, 9) ?? RUN_START.maxSnacks,
  };
  run.hero = {
    hp: whole(saved.hero?.hp, 1, run.limits.maxHp) ?? run.limits.maxHp,
    bytes: whole(saved.hero?.bytes, 0, run.limits.maxBytes) ?? run.limits.maxBytes,
    snacks: whole(saved.hero?.snacks, 0, run.limits.maxSnacks) ?? 0,
  };
  return run.techniques.length ? run : null;
}
