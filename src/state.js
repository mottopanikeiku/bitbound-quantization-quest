import { BIT_CHOICES, GUARDIANS, TECHNIQUE_ORDER, heroStats } from './content/game-data.js';
import { newProgress, sanitizeProgress, unlockedHats } from './progress/progress.js';
import { sanitizeRun } from './well/run.js';

export const SAVE_KEY = 'bitbound.rpg.v4';
/** Older saves are read once and migrated on the next save; their keys are never written or deleted. */
export const LEGACY_SAVE_KEYS = Object.freeze(['bitbound.rpg.v3']);
export const START_CAMP = 'point-camp';
/** Fen Float's three optional duels, unlocked by friendships and won in any order. */
export const FEN_DUELS = Object.freeze(['fen-offset', 'fen-hot', 'fen-crown']);

export function newGear() {
  return { bits: 4, zero: false, groups: false, spotlight: 0, balance: false, budget: null };
}

export function newGame() {
  const state = {
    version: 4,
    started: false,
    music: true,
    // Full screen is entered when play starts; turning it off (F or pause menu) is remembered.
    fullscreen: true,
    position: null,
    facing: 'down',
    camp: START_CAMP,
    friends: [],
    techniques: [],
    lessons: [],
    shards: [],
    caches: [],
    puzzles: [],
    flags: [],
    hero: { hp: 0, bytes: 0, snacks: 3 },
    gear: newGear(),
    stats: { battles: 0, perfects: 0, fizzles: 0 },
    // v4: campfires the hero has rested at (travel targets), assists used per friend,
    // Fen's duels won, the equipped hat, a pinned map landmark, a suspended Well run
    // and meta-progress (dex, records, badges, Well records).
    camps: [START_CAMP],
    bonds: {},
    rival: { won: [], losses: 0 },
    hat: null,
    pin: null,
    restCount: 0,
    wellRun: null,
    progress: newProgress(),
  };
  const stats = heroStats(state);
  state.hero.hp = stats.maxHp;
  state.hero.bytes = stats.maxBytes;
  return state;
}

const idList = (value, limit = 96) =>
  Array.isArray(value)
    ? [...new Set(value.filter((id) => typeof id === 'string' && id.length > 0 && id.length <= 48))].slice(0, limit)
    : [];
const whole = (value, fallback, min, max) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, Math.trunc(value))) : fallback;

/** Validate untrusted saved data into a well-formed state (never throws). */
export function sanitize(saved) {
  const state = newGame();
  if (!saved || typeof saved !== 'object' || (saved.version !== 3 && saved.version !== 4)) return state;
  state.started = saved.started === true;
  state.music = saved.music !== false;
  state.fullscreen = saved.fullscreen !== false;
  for (let i = 0; i < 7 && saved.friends?.[i] === i; i++) state.friends.push(i);
  state.techniques = TECHNIQUE_ORDER.filter((id) => idList(saved.techniques).includes(id));
  state.lessons = idList(saved.lessons, 32);
  state.shards = idList(saved.shards, 32);
  state.caches = idList(saved.caches, 32);
  state.puzzles = idList(saved.puzzles, 16);
  state.flags = idList(saved.flags, 256);
  state.camp = typeof saved.camp === 'string' && saved.camp.length <= 48 ? saved.camp : START_CAMP;
  if (['down', 'up', 'left', 'right'].includes(saved.facing)) state.facing = saved.facing;
  if (Number.isFinite(saved.position?.x) && Number.isFinite(saved.position?.y)) {
    state.position = { x: saved.position.x, y: saved.position.y };
  }
  const stats = heroStats(state);
  state.hero = {
    hp: whole(saved.hero?.hp, stats.maxHp, 1, stats.maxHp),
    bytes: whole(saved.hero?.bytes, stats.maxBytes, 0, stats.maxBytes),
    snacks: whole(saved.hero?.snacks, 3, 0, stats.maxSnacks),
  };
  const has = (id) => state.techniques.includes(id);
  const gear = saved.gear ?? {};
  state.gear = {
    bits: BIT_CHOICES.includes(gear.bits) ? gear.bits : 4,
    zero: has('zero') && gear.zero === true,
    groups: has('groups') && gear.groups === true,
    spotlight: has('spotlight') ? whole(gear.spotlight, 0, 0, 2) : 0,
    balance: has('balance') && gear.balance === true,
    budget:
      has('budget') && Array.isArray(gear.budget) && gear.budget.length === 3 && gear.budget.every((b) => BIT_CHOICES.includes(b))
        ? [...gear.budget]
        : null,
  };
  state.stats = {
    battles: whole(saved.stats?.battles, 0, 0, 1e6),
    perfects: whole(saved.stats?.perfects, 0, 0, 1e6),
    fizzles: whole(saved.stats?.fizzles, 0, 0, 1e6),
  };
  // A v3 save keeps its adventure; its respawn camp counts as lit and v4 meta-progress starts fresh.
  state.camps = [...new Set([START_CAMP, state.camp, ...idList(saved.camps, 16)])];
  state.restCount = whole(saved.restCount, 0, 0, 1e9);
  if (saved.version === 4) {
    for (const guardian of GUARDIANS) {
      const xp = whole(saved.bonds?.[guardian.key], 0, 0, 999);
      if (xp > 0) state.bonds[guardian.key] = xp;
    }
    state.rival = { won: FEN_DUELS.filter((id) => idList(saved.rival?.won, 3).includes(id)), losses: whole(saved.rival?.losses, 0, 0, 1e6) };
    state.progress = sanitizeProgress(saved.progress);
    state.hat = unlockedHats(state.progress).includes(saved.hat) ? saved.hat : null;
    state.pin = typeof saved.pin === 'string' && saved.pin.length <= 48 ? saved.pin : null;
    state.wellRun = sanitizeRun(saved.wellRun, state);
  }
  return state;
}

/** The current save, or a migrated legacy save, or a fresh adventure. */
export function loadGame(storage = globalThis.localStorage) {
  try {
    for (const key of [SAVE_KEY, ...LEGACY_SAVE_KEYS]) {
      const raw = storage.getItem(key);
      if (raw !== null) return sanitize(JSON.parse(raw));
    }
  } catch {
    // Corrupt JSON or blocked storage: play on with a fresh adventure.
  }
  return newGame();
}

export function saveGame(state, storage = globalThis.localStorage) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
