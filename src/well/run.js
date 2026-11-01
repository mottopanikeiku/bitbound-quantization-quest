/**
 * Static Well save API (generator v2).
 * `depth` is the next floor; `cleared === depth - 1`. Captured techniques/friends never
 * grow mid-expedition. `pendingOffer` survives leaving on a boon screen: Resume restores
 * the choice, not the clear heal. `emergencyUsed` lasts one five-floor block.
 * Limits are derived ONLY from boons. Floor-only modifiers and provider functions are
 * never serialized. `components` is the additive score ledger; `lastFloor` is display-only.
 * Call clearFloor once with the matching descriptor, then save; call chooseBoon separately.
 */
import { TECHNIQUE_ORDER, GUARDIANS } from '../content/game-data.js';
import { boonOf, boonLimits } from './boons.js';
import { emptyScore, SCORE_PARTS, floorScore } from './score.js';

export const RUN_VERSION = 2;
export const RUN_START = Object.freeze({ maxHp: 56, maxBytes: 56, power: 22, maxSnacks: 3 });
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const canonical = (saved, allowed) => Array.isArray(saved) && saved.length <= allowed.length && new Set(saved).size === saved.length && saved.every((id) => allowed.includes(id));

export function newRun({ seed, techniques = [], friends = [] }) {
  return {
    version: RUN_VERSION, seed: seed >>> 0, depth: 1, cleared: 0, score: 0,
    techniques: TECHNIQUE_ORDER.filter((id) => techniques.includes(id)),
    friends: GUARDIANS.filter((g) => friends.includes(g.id)).map((g) => g.id),
    hero: { hp: 56, bytes: 56, snacks: 3 }, limits: { ...RUN_START }, boons: {},
    pendingOffer: false, emergencyUsed: false, components: emptyScore(), bestRatio: 0, lastFloor: null,
  };
}

/** Rehydrate untrusted local saves; forged capacities/power, rank overflow and future floors fail closed. */
export function sanitizeRun(saved, state) {
  if (!saved || typeof saved !== 'object' || saved.version !== RUN_VERSION) return null;
  if (!integer(saved.seed, 0, 0xffffffff) || !integer(saved.depth, 1, 9999) || saved.cleared !== saved.depth - 1) return null;
  if (!canonical(saved.techniques, state.techniques ?? []) || !saved.techniques.length || !canonical(saved.friends, state.friends ?? [])) return null;
  if (saved.techniques.some((id) => !TECHNIQUE_ORDER.includes(id)) || saved.friends.some((id) => !GUARDIANS.some((g) => g.id === id))) return null;
  const run = newRun(saved), entries = saved.boons && typeof saved.boons === 'object' && !Array.isArray(saved.boons) ? Object.entries(saved.boons) : null;
  if (!entries || entries.length > 6 || entries.some(([id, rank]) => !boonOf(id) || !integer(rank, 1, 2))) return null;
  const offerCount = Math.floor(saved.cleared / 5) * 2 + (saved.cleared % 5 >= 1 ? 1 : 0) + (saved.cleared % 5 >= 3 ? 1 : 0);
  if (entries.reduce((sum, [, rank]) => sum + rank, 0) > offerCount - (saved.pendingOffer ? 1 : 0)) return null;
  if (typeof saved.pendingOffer !== 'boolean' || (saved.pendingOffer && ![1, 3].includes(saved.cleared % 5)) || typeof saved.emergencyUsed !== 'boolean') return null;
  run.boons = Object.fromEntries(entries);
  run.limits = boonLimits(run);
  if (Object.keys(RUN_START).some((key) => saved.limits?.[key] !== run.limits[key])) return null;
  if (!integer(saved.hero?.hp, 1, run.limits.maxHp) || !integer(saved.hero?.bytes, 0, run.limits.maxBytes) || !integer(saved.hero?.snacks, 0, run.limits.maxSnacks)) return null;
  const maxParts = { clear: saved.cleared * 100, efficiency: saved.cleared * 200, perfect: saved.cleared * 50, guard: saved.cleared * 50, warden: Math.floor(saved.cleared / 5) * 100 };
  if (SCORE_PARTS.some((key) => !integer(saved.components?.[key], 0, maxParts[key]))) return null;
  if (saved.components.clear !== maxParts.clear || saved.components.warden !== maxParts.warden || saved.score !== SCORE_PARTS.reduce((sum, key) => sum + saved.components[key], 0)) return null;
  if (!Number.isFinite(saved.bestRatio) || saved.bestRatio < 0 || saved.bestRatio > 10000) return null;
  Object.assign(run, { depth: saved.depth, cleared: saved.cleared, score: saved.score, hero: { ...saved.hero }, pendingOffer: saved.pendingOffer, emergencyUsed: saved.emergencyUsed, components: { ...saved.components }, bestRatio: saved.bestRatio });
  // Last-floor display is derived bounded score data, not a reward authority.
  if (saved.lastFloor && saved.cleared) {
    const last = saved.lastFloor;
    if (SCORE_PARTS.every((key) => integer(last.components?.[key], 0, key === 'efficiency' ? 200 : key === 'perfect' || key === 'guard' ? 50 : 100)) && integer(last.total, 100, 500) && Number.isFinite(last.ratio) && last.ratio >= 0 && last.ratio <= 10000) {
      run.lastFloor = { components: { ...last.components }, total: last.total, ratio: last.ratio };
    }
  }
  return run;
}

/** A result is settled only at its current floor. Replayed settlement cannot grant recovery twice. */
export function clearFloor(run, result, encounter) {
  if (result.outcome !== 'won' || encounter.depth !== run.depth || run.pendingOffer) return null;
  const score = floorScore(result.stats ?? {}, encounter.warden);
  run.hero = {
    hp: Math.max(1, Math.min(run.limits.maxHp, result.hero.hp)),
    bytes: Math.max(0, Math.min(run.limits.maxBytes, result.hero.bytes)),
    snacks: Math.max(0, Math.min(run.limits.maxSnacks, result.hero.snacks)),
  };
  const warm = encounter.modifier?.id === 'warm-current';
  const heal = encounter.warden ? (warm ? 24 : 16) : (warm ? 12 : 6) + 3 * (run.boons['camp-kettle'] ?? 0);
  run.hero.hp = Math.min(run.limits.maxHp, run.hero.hp + heal);
  run.hero.bytes = encounter.warden ? run.limits.maxBytes : Math.min(run.limits.maxBytes, run.hero.bytes + 8);
  if (encounter.warden) run.hero.snacks = Math.min(run.limits.maxSnacks, run.hero.snacks + 1 + (run.boons['clear-bell'] ?? 0));
  run.emergencyUsed = encounter.warden ? false : Boolean(result.well?.emergencyUsed ?? run.emergencyUsed);
  run.cleared = run.depth++;
  run.score += score.total;
  for (const key of SCORE_PARTS) run.components[key] += score.components[key];
  run.bestRatio = Math.max(run.bestRatio, score.ratio);
  run.lastFloor = score;
  run.pendingOffer = [1, 3].includes(run.cleared % 5);
  return score;
}
