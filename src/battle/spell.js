import {
  symmetricParams,
  affineParams,
  quantizeVector,
  levelsOf,
  fidelity,
  packetBytes,
  dot,
} from '../quantization.js';
import { weightedVectors } from './metrics.js';

const BITS = [2, 3, 4, 8];
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const validBits = (bits) => BITS.includes(bits) ? bits : 4;

/** Canonical saved gear: Spotlight is a count; Budget is null or three bit widths. */
export function normalizeGear(gear = {}, techniques) {
  const unlocked = techniques === undefined ? null : new Set(techniques);
  const has = (id) => unlocked === null || unlocked.has(id);
  return {
    bits: validBits(gear.bits),
    zero: has('zero') && gear.zero === true,
    calib: has('calib') && gear.calib === true,
    groups: has('groups') && gear.groups === true,
    spotlight: has('spotlight') && Number.isInteger(gear.spotlight) ? Math.max(0, Math.min(2, gear.spotlight)) : 0,
    balance: has('balance') && gear.balance === true,
    budget: has('budget') && Array.isArray(gear.budget) && gear.budget.length === 3 && gear.budget.every((bits) => BITS.includes(bits)) ? [...gear.budget] : null,
  };
}

/** Fictional damage, not a hardware speedup or model-accuracy measurement. */
export function damageFor(value, power = 16, floor = 0.6) {
  const f = clamp01(value);
  const perfect = f >= 0.985;
  const fizzle = f < floor;
  const fraction = floor >= 1 ? (f === 1 ? 1 : 0) : clamp01((f - floor) / (1 - floor));
  return { damage: Math.round(power * fraction ** 1.4 * (perfect ? 1.25 : 1)), perfect, fizzle };
}

function bounds(values) {
  let min = Infinity;
  let max = -Infinity;
  let amax = 0;
  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
    amax = Math.max(amax, Math.abs(value));
  }
  return { min: values.length ? min : 0, max: values.length ? max : 0, amax };
}

function selectedChannels(essence, gear, locks, values) {
  if (gear.spotlight === 0) return [];
  if (Array.isArray(locks.protected)) {
    return [...new Set(locks.protected.filter((i) => Number.isInteger(i) && i >= 0 && i < values.length))].slice(0, gear.spotlight);
  }
  const scores = values.map((value, index) => {
    let score = Math.abs(value);
    if (essence.inputs && essence.weights) {
      score = 0;
      for (const token of essence.inputs) score = Math.max(score, Math.abs(token[index]));
    }
    return { index, score };
  });
  scores.sort((a, b) => b.score - a.score || a.index - b.index);
  return scores.slice(0, gear.spotlight).map(({ index }) => index);
}

function prepare(essence, rawGear, locks) {
  const gear = normalizeGear(rawGear);
  const driven = Array.isArray(essence.inputs) && Array.isArray(essence.weights);
  const quantizeInputs = driven && essence.quantizeInputs === true;
  const alpha = Number.isFinite(locks.alpha) ? clamp01(locks.alpha) : 0.5;
  let factors;
  let inputs;
  let weights;
  let rows;
  let weightRow = -1;
  if (driven) {
    factors = essence.weights.map((weight, channel) => {
      if (!gear.balance) return 1;
      let activationMax = 0;
      for (const token of essence.inputs) activationMax = Math.max(activationMax, Math.abs(token[channel]));
      // A zero activation or weight contributes no product; leave that channel alone.
      if (activationMax === 0 || weight === 0) return 1;
      return activationMax ** alpha / Math.abs(weight) ** (1 - alpha);
    });
    inputs = essence.inputs.map((token) => token.map((value, channel) => value / factors[channel]));
    weights = essence.weights.map((value, channel) => value * factors[channel]);
    rows = quantizeInputs ? inputs.map((values, i) => ({ values, label: `Token ${i + 1}: A`, source: 'activation' })) : [];
    weightRow = rows.length;
    rows.push({ values: weights, label: essence.rows[essence.rows.length - 1]?.label ?? 'Weights', source: 'weight' });
  } else {
    rows = essence.rows.map((row) => ({ values: row.values, label: row.label, source: 'value' }));
  }

  const selected = selectedChannels(essence, gear, locks, driven ? essence.weights : rows.flatMap((row) => row.values));
  const kept = new Set(selected);
  let offset = 0;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    row.protected = row.values.map((_, i) => driven ? r === weightRow && kept.has(i) : kept.has(offset + i));
    offset += row.values.length;
  }

  // Inputs and weights are distinct tensors, never one shared grid. Groups can
  // further split activation tokens; Budget gives each value-head its own packet.
  const budget = !driven && Array.isArray(essence.sensitivities) && rows.length === 3 && gear.budget !== null;
  const groups = [];
  const addGroup = (rowIndices, label, bits) => {
    const values = [];
    for (const index of rowIndices) {
      const row = rows[index];
      row.group = groups.length;
      for (let i = 0; i < row.values.length; i++) if (!row.protected[i]) values.push(row.values[i]);
    }
    groups.push({ label, rowIndices, values, bits, ...bounds(values) });
  };
  if (quantizeInputs) {
    if (gear.groups) {
      for (let r = 0; r < weightRow; r++) addGroup([r], rows[r].label, gear.bits);
    } else {
      addGroup(Array.from({ length: weightRow }, (_, i) => i), 'All activation tokens', gear.bits);
    }
    addGroup([weightRow], rows[weightRow].label, gear.bits);
  } else if (gear.groups || budget) {
    for (let r = 0; r < rows.length; r++) addGroup([r], rows[r].label, budget ? gear.budget[r] : gear.bits);
  } else {
    addGroup(rows.map((_, i) => i), rows.length === 1 ? rows[0].label : 'Shared ruler', gear.bits);
  }
  if (essence.hidden && Array.isArray(essence.ghosts) && groups.length === 1) {
    // Both archives are always public. Neither the forecast nor the hidden
    // current values may silently pick a different lock domain or default.
    const archive = essence.archive
      ? [...essence.archive.calm, ...essence.archive.storm]
      : essence.ghosts;
    const values = archive.filter((_, i) => !kept.has(i % rows[0].values.length));
    Object.assign(groups[0], { values, ...bounds(values) });
  }
  return { gear, driven, quantizeInputs, factors, inputs, weights, weightRow, rows, groups, selected, budget };
}

/** Range-lock groups AFTER Balance and removal of Spotlight values from fitting. */
export function rangeTargets(essence, gear, locks = {}) {
  return prepare(essence, gear, locks).groups.map(({ label, values, amax, min, max }) => ({ label, values, amax, min, max }));
}

/**
 * The actual reachable breathing intervals, shared by UI and acceptance search.
 * Brine uses one absolute ruler on every turn, not a forecast-sized oracle.
 */
export function lockDomains(essence, gear, locks = {}) {
  return rangeTargets(essence, gear, locks).map((target) => {
    if (essence.hidden) return { r: [0.15, 2.4], lo: [-2.4, 0], hi: [0, 2.4] };
    const amplitude = target.amax || 1;
    const low = Math.min(0, target.min);
    const high = Math.max(0, target.max);
    return {
      r: [0.35 * amplitude, 1.45 * amplitude],
      lo: [low - 0.55 * amplitude, Math.min(0, low + 0.55 * amplitude)],
      hi: [Math.max(0, high - 0.55 * amplitude), high + 0.55 * amplitude],
    };
  });
}

function coveringLocks(state) {
  return {
    ranges: state.groups.map((group) => group.amax || 1),
    lows: state.groups.map((group) => group.min),
    highs: state.groups.map((group) => group.max),
    alpha: 0.5,
    protected: state.selected,
  };
}

/** Covering min/max defaults, not an oracle that searches for minimum output error. */
export function defaultLocks(essence, gear) {
  return coveringLocks(prepare(essence, gear, {}));
}

function packetFor(state) {
  if (!state.budget) {
    return packetBytes({
      count: state.rows.reduce((count, row) => count + row.values.length, 0),
      bits: state.gear.bits,
      groups: state.groups.length,
      affine: state.gear.zero,
      spotlight: state.selected.length,
    });
  }
  const heads = state.rows.map((row, index) => packetBytes({
    count: row.values.length,
    bits: state.gear.budget[index],
    affine: state.gear.zero,
    spotlight: row.protected.reduce((count, kept) => count + Number(kept), 0),
  }));
  const packet = { payload: 0, scales: 0, zeros: 0, spotlight: 0, total: 0, heads };
  for (const head of heads) {
    packet.payload += head.payload;
    packet.scales += head.scales;
    packet.zeros += head.zeros;
    packet.spotlight += head.spotlight;
    packet.total += head.total;
  }
  return packet;
}

/** Payload retains each low-bit slot; a Spotlight value adds FP16 + its byte index. */
export function spellCost(essence, gear, locks = {}) {
  return packetFor(prepare(essence, gear, locks)).total;
}

export function buildSpell(essence, rawGear, locks = {}, power = 16, floor = 0.6) {
  const state = prepare(essence, rawGear, locks);
  const params = state.groups.map((group, i) => {
    if (state.gear.zero) {
      const lo = Number.isFinite(locks.lows?.[i]) ? locks.lows[i] : group.min;
      const hi = Number.isFinite(locks.highs?.[i]) ? locks.highs[i] : group.max;
      return affineParams(lo, hi, group.bits);
    }
    const range = Number.isFinite(locks.ranges?.[i]) && locks.ranges[i] > 0 ? locks.ranges[i] : group.amax || 1;
    return symmetricParams(range, group.bits);
  });
  let clippedCount = 0;
  let viewMin = 0;
  let viewMax = 0;
  const rows = state.rows.map((row) => {
    const grid = params[row.group];
    const rounded = quantizeVector(row.values, grid);
    for (let i = 0; i < row.values.length; i++) {
      if (row.protected[i]) {
        rounded.recon[i] = row.values[i];
        rounded.codes[i] = null;
        rounded.clipped[i] = false;
      }
      if (rounded.clipped[i]) clippedCount++;
      viewMin = Math.min(viewMin, row.values[i]);
      viewMax = Math.max(viewMax, row.values[i]);
    }
    viewMin = Math.min(viewMin, grid.min);
    viewMax = Math.max(viewMax, grid.max);
    return {
      values: row.values,
      recon: rounded.recon,
      levels: levelsOf(grid),
      lo: grid.min,
      hi: grid.max,
      bits: grid.bits,
      scale: grid.scale,
      zero: grid.zero,
      codes: rounded.codes,
      clipped: rounded.clipped,
      protected: row.protected,
      label: row.label,
      group: row.group,
      source: row.source,
    };
  });

  let reference;
  let reconstructed;
  let headFidelities;
  if (state.driven) {
    reference = essence.inputs.map((token) => dot(token, essence.weights));
    const rebuiltWeights = rows[state.weightRow].recon;
    reconstructed = state.inputs.map((token, i) => dot(state.quantizeInputs ? rows[i].recon : token, rebuiltWeights));
  } else {
    ({ reference, reconstructed } = weightedVectors(rows, essence.sensitivities));
    if (essence.sensitivities) headFidelities = rows.map((row) => fidelity(row.values, row.recon));
  }
  const f = fidelity(reference, reconstructed);
  let result = damageFor(f, power, floor);
  let threadFidelities;
  let threadDamages;
  if (essence.independentThreads) {
    // Spindle is three independent targets, each allocated one third of cast
    // power. A strong rope cannot conceal a wholly rounded-away whisper thread.
    threadFidelities = rows.map((row) => fidelity(row.values, row.recon));
    const threads = threadFidelities.map((value) => damageFor(value, power / rows.length, floor));
    threadDamages = threads.map((thread) => thread.damage);
    result = {
      damage: threadDamages.reduce((sum, damage) => sum + damage, 0),
      perfect: threads.every((thread) => thread.perfect),
      fizzle: threads.every((thread) => thread.fizzle),
    };
  }
  const packet = packetFor(state);
  return {
    cost: packet.total,
    packet,
    fidelity: f,
    ...result,
    clippedCount,
    rows,
    view: essence.hidden ? { min: -2.4, max: 2.4 } : viewMin === viewMax ? { min: -1, max: 1 } : { min: viewMin, max: viewMax },
    reference,
    reconstructed,
    metric: state.driven ? 'output' : essence.sensitivities ? 'sensitivity-weighted values' : 'values',
    headFidelities,
    threadFidelities,
    threadDamages,
    balanceFactors: state.factors,
  };
}
