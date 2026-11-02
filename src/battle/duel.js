import { createEssence } from './foes.js';
import { dot, fidelity } from '../quantization.js';
import { weightedVectors } from './metrics.js';

const definitions = [
  ['fen-offset', 'The Decimal Backpack', 11, 64, 4, 'values'],
  ['fen-hot', 'Backup Atlas', 12, 64, 6, 'outputs'],
  ['fen-crown', 'Three-Pocket Atlas', 32, 184, 8, 'weighted'],
];
export const DUELS = Object.freeze(Object.fromEntries(definitions.map(([id, name, cap, fp32Bytes, power, metric]) => [id, Object.freeze({
  id, name, rounds: 3, target: 0.985, cap, fp32Bytes, power, metric,
  lines: Object.freeze({
    intro: 'Meet our agreed fidelity target with a smaller packet. My atlas will hold the decimals!',
    accept: 'Inside our tolerance! My backpack is taking notes.',
    reject: 'Not both checks yet. We can redraw this page; no hurry.',
    win: 'Precision where it matters! I still keep a wide atlas for other journeys.',
    lose: 'The maps can wait. Come back whenever you fancy another drawing session.',
  }),
})])));
function duelOf(id) {
  if (!DUELS[id]) throw new RangeError(`Unknown duel: ${id}`);
  return DUELS[id];
}

export function duelEssence(id, round = 0, random = () => 0.5) {
  duelOf(id);
  const index = Math.max(0, Math.min(2, Math.trunc(round)));
  if (id === 'fen-offset') {
    const amplitude = [0.96, 1, 1.04][index];
    const shift = (index * 5 + Math.floor(random() * 16)) % 16;
    return { foeId: id, turn: index, phase: 1, kind: 'zero', hidden: false, morphStage: 0,
      rows: [{ label: 'Fen bell', values: Array.from({ length: 16 }, (_, i) => ((i + shift) % 16) * amplitude / 15) }] };
  }
  const essence = createEssence(id === 'fen-hot' ? 'cinder' : 'auric', index, random, id === 'fen-crown' && index > 0 ? 2 : 1, { successes: index });
  essence.foeId = id;
  if (id === 'fen-crown' && index === 2) {
    essence.rows = [essence.rows[1], essence.rows[2], essence.rows[0]];
    essence.sensitivities = [essence.sensitivities[1], essence.sensitivities[2], essence.sensitivities[0]];
    essence.morphHint = 'The fine-detail head moved with its sensitivity, so revisit the allocation, not just the ranges.';
  }
  return essence;
}

/** Toy payload baseline, not a hardware measurement; shared inputs are not transmitted. */
export function fenBaseline(essence) {
  let reference;
  let reconstructed;
  let count;
  if (essence.inputs && essence.weights) {
    const weights = essence.weights.map(Math.fround);
    const inputs = essence.quantizeInputs ? essence.inputs.map(token => token.map(Math.fround)) : essence.inputs;
    reference = essence.inputs.map(token => dot(token, essence.weights));
    reconstructed = inputs.map(token => dot(token, weights));
    count = weights.length + (essence.quantizeInputs ? inputs.reduce((sum, token) => sum + token.length, 0) : 0);
  } else {
    const rows = essence.rows.map(row => ({ values: row.values, recon: row.values.map(Math.fround) }));
    ({ reference, reconstructed } = weightedVectors(rows, essence.sensitivities));
    count = rows.reduce((sum, row) => sum + row.values.length, 0);
    if (essence.independentThreads) return { bytes: count * 4, fidelity: Math.min(...rows.map(row => fidelity(row.values, row.recon))) };
  }
  return { bytes: count * 4, fidelity: fidelity(reference, reconstructed) };
}

/** Only a resolved spell is judged; no preview, essence oracle or technique bonus. */
export function judgeRound(id, spell) {
  const duel = duelOf(id);
  const f = spell.threadFidelities?.length ? Math.min(...spell.threadFidelities) : spell.fidelity;
  const cost = spell.cost;
  const fidelityOk = Number.isFinite(f) && f >= duel.target;
  const packetOk = Number.isFinite(cost) && cost > 0 && cost <= duel.cap;
  return { accepted: fidelityOk && packetOk, fidelityOk, packetOk, fidelity: f, cost, cap: duel.cap, target: duel.target, ratio: duel.fp32Bytes / cost };
}
