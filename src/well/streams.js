import { hash2, rng } from '../engine/util.js';

/** Stable tagged sub-seeds: no shared mutable generator can be advanced by a menu. */
export function stream(run, floor, tag, turn = 0, family = '') {
  let salt = 2166136261;
  for (const char of `${run.version}:${family}:${tag}`) salt = Math.imul(salt ^ char.charCodeAt(0), 16777619) >>> 0;
  const seed = (hash2(floor, turn, run.seed ^ salt) * 0x100000000) >>> 0;
  return rng(seed);
}
export const seedHex = (seed) => (seed >>> 0).toString(16).padStart(8, '0').toUpperCase();
export const runKey = (run) => `${run.version}:${seedHex(run.seed)}:${run.techniques.join(',')}`;
export function shuffled(items, random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
