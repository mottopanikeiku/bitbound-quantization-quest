// Encounter grades are fictional mastery records, never model/task accuracy.
export const GUARDIAN_PAR = Object.freeze(Object.fromEntries([
  ['nib', 30, 3], ['chime', 33, 3], ['brine', 40, 4], ['spindle', 66, 4],
  ['cinder', 48, 4], ['vesper', 96, 5], ['auric', 116, 5],
].map(([id, bytes, turns]) => [id, Object.freeze({ bytes, turns })])));
export const TALLY_DURATION = 1.66;
export const TALLY_STEPS = Object.freeze([0.18, 0.48, 0.78, 1.03, 1.28, 1.48, 1.66]);
const clamp = n => Math.max(0, Math.min(1, n));
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
export function gradeBattle({ casts = [], beats = [], turns = 0, foe = {}, par = GUARDIAN_PAR[foe.id] ?? { bytes: 10, turns: 1 } } = {}) {
  const floor = foe.floor ?? 0.6;
  const fidelities = casts.map(cast => cast.threadFidelities?.length ? Math.min(...cast.threadFidelities) : cast.fidelity ?? 0);
  const Q = mean(casts.map((cast, i) => cast.fizzle ? 0 : clamp((fidelities[i] - floor) / (1 - floor))));
  const packetBytes = casts.reduce((sum, cast) => sum + (cast.cost ?? cast.packet?.total ?? 0), 0);
  const E = packetBytes > 0 ? clamp(par.bytes / packetBytes) : 1;
  const tested = beats.filter(beat => beat.offensive === true);
  const G = tested.length ? mean(tested.map(beat => beat.grade === 'perfect' ? 1 : beat.grade === 'good' ? 0.6 : 0)) : 1;
  const T = turns > 0 ? clamp(par.turns / turns) : 1;
  const score = Math.round(30 * Q + 35 * E + 20 * G + 15 * T);
  const unmet = [];
  if (casts.some(cast => cast.fizzle)) unmet.push('S needs no fizzles');
  if (E < 0.85) unmet.push('S needs packet efficiency ≥85%');
  if (G < 0.8) unmet.push('S needs guard quality ≥80%');
  const letter = score >= 90 && !unmet.length ? 'S' : score >= 80 ? 'A' : score >= 65 ? 'B' : 'C';
  return { letter, score, Q, E, G, T, fidelity: mean(fidelities), packetBytes,
    lines: [
      { label: 'Q · fidelity', value: Math.round(Q * 100) + '%', points: 30 * Q },
      { label: 'E · packet', value: packetBytes + ' / ' + par.bytes + ' B par', points: 35 * E },
      { label: tested.length ? 'G · guard' : 'guard not tested', value: tested.length ? Math.round(G * 100) + '%' : 'neutral', points: 20 * G },
      { label: 'T · turns', value: turns + ' / ' + par.turns + ' par', points: 15 * T },
    ], unmet };
}
