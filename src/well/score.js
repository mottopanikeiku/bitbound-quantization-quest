import { clamp } from '../engine/util.js';
export const SCORE_PARTS = Object.freeze(['clear', 'efficiency', 'perfect', 'guard', 'warden']);
export const emptyScore = () => Object.fromEntries(SCORE_PARTS.map((key) => [key, 0]));
/** Packet expenditure includes fizzles and ignores every fictional charge rebate. */
export function floorScore(stats, warden = false) {
  const D = Math.max(0, stats.damageDealt ?? 0), B = Math.max(0, stats.packetBytes ?? 0);
  const casts = Math.max(0, stats.casts ?? 0), beats = Math.max(0, stats.guardBeats ?? 0);
  const ratio = B ? D / B : 0;
  const components = {
    clear: 100, efficiency: Math.round(100 * clamp(ratio, 0, 2)),
    perfect: casts ? Math.round(50 * clamp((stats.perfects ?? 0) / casts)) : 0,
    guard: beats ? Math.round(50 * clamp(((stats.perfectGuards ?? 0) + 0.5 * (stats.goodGuards ?? 0)) / beats)) : 0,
    warden: warden ? 100 : 0,
  };
  return { components, total: SCORE_PARTS.reduce((sum, key) => sum + components[key], 0), ratio, damage: D, bytes: B };
}
