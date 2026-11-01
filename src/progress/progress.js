// Meta-progress: Static-dex, per-foe records, Well records, lifetime counters and badges.
// The game stores this object as state.progress and reports gameplay events to applyEvent.
// applyEvent mutates the given progress and returns the ids of badges unlocked by the event.
import { GUARDIANS } from '../content/game-data.js';
import { SPECIES } from '../content/static-dex.js';

/** Staticling species shown in the Static-dex (shared roster). */
export { SPECIES };

/** { id, name, text, icon } — unlocked by applyEvent. */
export const BADGES = Object.freeze([]);

/** { id, name, text } — cosmetic hats for the hero. */
export const HATS = Object.freeze([]);

export const GRADE_ORDER = Object.freeze(['C', 'B', 'A', 'S']);
const MEDALS = { S: 'gold', A: 'silver', B: 'bronze' };

const COUNTERS = ['casts', 'perfects', 'fizzles', 'perfectGuards', 'maxResonance', 'assists', 'goldens', 'wins'];

export function newProgress() {
  return {
    badges: [],
    dex: {},
    records: {},
    well: { best: 0, bestScore: 0, runs: 0, floors: 0 },
    counters: Object.fromEntries(COUNTERS.map((key) => [key, 0])),
  };
}

const whole = (value, max = 1e9) => (Number.isFinite(value) ? Math.max(0, Math.min(max, Math.trunc(value))) : 0);
const known = (list, id) => list.some((item) => item.id === id);
const recordable = (id) => typeof id === 'string' && id.length > 0 && id.length <= 48;

/** Validate untrusted saved progress (never throws). */
export function sanitizeProgress(saved) {
  const progress = newProgress();
  if (!saved || typeof saved !== 'object') return progress;
  if (Array.isArray(saved.badges)) progress.badges = [...new Set(saved.badges.filter((id) => known(BADGES, id)))];
  for (const species of SPECIES) {
    const entry = saved.dex?.[species.id];
    if (!entry || typeof entry !== 'object') continue;
    progress.dex[species.id] = { seen: entry.seen === true, cleared: whole(entry.cleared), goldenSeen: entry.goldenSeen === true, golden: whole(entry.golden) };
  }
  for (const [id, record] of Object.entries(saved.records ?? {})) {
    if (!recordable(id) || !record || !GRADE_ORDER.includes(record.grade)) continue;
    progress.records[id] = { grade: record.grade, score: whole(record.score, 100), turns: whole(record.turns, 999), fidelity: Number.isFinite(record.fidelity) ? Math.max(0, Math.min(1, record.fidelity)) : 0 };
  }
  progress.well = { best: whole(saved.well?.best, 9999), bestScore: whole(saved.well?.bestScore), runs: whole(saved.well?.runs), floors: whole(saved.well?.floors) };
  for (const key of COUNTERS) progress.counters[key] = whole(saved.counters?.[key]);
  return progress;
}

function dexEntry(progress, species) {
  if (!known(SPECIES, species)) return null;
  progress.dex[species] ??= { seen: false, cleared: 0, goldenSeen: false, golden: 0 };
  return progress.dex[species];
}

/** Better grade wins; a tie keeps the higher score. */
function better(record, grade) {
  if (!record) return true;
  const a = GRADE_ORDER.indexOf(grade.letter), b = GRADE_ORDER.indexOf(record.grade);
  return a > b || (a === b && grade.score > record.score);
}

/** Apply one event ({ type, ...data }); returns newly unlocked badge ids. */
export function applyEvent(progress, event, ctx = {}) {
  const c = progress.counters;
  switch (event.type) {
    case 'cast':
      c.casts++;
      if (event.perfect) c.perfects++;
      if (event.fizzle) c.fizzles++;
      break;
    case 'guard':
      if (event.grade === 'perfect') c.perfectGuards++;
      break;
    case 'resonance':
      c.maxResonance = Math.max(c.maxResonance, whole(event.level, 99));
      break;
    case 'assist':
      c.assists++;
      break;
    case 'seen': {
      const entry = dexEntry(progress, event.species);
      if (entry) {
        entry.seen = true;
        if (event.golden) entry.goldenSeen = true;
      }
      break;
    }
    case 'battle-end': {
      if (event.outcome !== 'won') break;
      c.wins++;
      const entry = dexEntry(progress, event.species);
      if (entry) {
        entry.seen = true;
        entry.cleared++;
        if (event.golden) {
          entry.goldenSeen = true;
          entry.golden++;
          c.goldens++;
        }
      }
      const grade = event.grade;
      if (grade && GRADE_ORDER.includes(grade.letter) && recordable(event.foeId) && !event.well && !event.duel) {
        const record = progress.records[event.foeId];
        const fresh = { grade: grade.letter, score: whole(grade.score, 100), turns: whole(event.stats?.turns, 999), fidelity: Number.isFinite(grade.fidelity) ? grade.fidelity : 0 };
        if (better(record, grade)) progress.records[event.foeId] = fresh;
        else if (fresh.turns && (!record.turns || fresh.turns < record.turns)) record.turns = fresh.turns;
      }
      break;
    }
    case 'well-floor':
      progress.well.floors++;
      progress.well.best = Math.max(progress.well.best, whole(event.depth, 9999));
      break;
    case 'well-end':
      progress.well.runs++;
      progress.well.best = Math.max(progress.well.best, whole(event.depth, 9999));
      progress.well.bestScore = Math.max(progress.well.bestScore, whole(event.score));
      break;
    default:
      break;
  }
  return [];
}

export function medalFor(letter) {
  return MEDALS[letter] ?? null;
}

/** Hats the hero may wear, given progress. */
export function unlockedHats() {
  return [];
}

/** Overall completion for the Journal and title: parts are { id, label, have, total }. */
export function completion(state) {
  const progress = state.progress ?? newProgress();
  const parts = [
    { id: 'friends', label: 'Friends', have: state.friends.length, total: GUARDIANS.length },
    { id: 'shards', label: 'Bit shards', have: state.shards.length, total: 16 },
    { id: 'dex', label: 'Static-dex', have: SPECIES.filter((s) => progress.dex[s.id]?.cleared).length, total: SPECIES.length },
  ];
  const have = parts.reduce((sum, part) => sum + Math.min(part.have, part.total), 0);
  const total = parts.reduce((sum, part) => sum + part.total, 0);
  return { percent: total ? Math.floor((100 * have) / total) : 0, parts };
}
