// Real (toy-sized) quantization arithmetic used by every spell, puzzle and diagram.
// ONNX-style nearest-even rounding; JS numbers, not a hardware INT kernel or FP16 emulator.

export function roundEven(value) {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction < 0.5) return floor;
  if (fraction > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * Narrow symmetric grid for a locked range r: codes −qmax…qmax (INT4: −7…7; the
 * extra −8 code is deliberately unused so zero is exact and the grid is mirrored).
 */
export function symmetricParams(range, bits) {
  const qmax = 2 ** (bits - 1) - 1;
  const magnitude = Math.abs(range);
  const scale = magnitude > 0 ? magnitude / qmax : 1;
  return { bits, mode: 'sym', qmin: -qmax, qmax, scale, zero: 0, min: -qmax * scale, max: qmax * scale };
}

/**
 * Affine (zero-point) grid for a locked interval [lo, hi], extended to contain 0 so
 * zero stays exactly representable. Uses all 2^bits unsigned codes.
 */
export function affineParams(lo, hi, bits) {
  const qmax = 2 ** bits - 1;
  const low = Math.min(lo, hi, 0);
  const high = Math.max(lo, hi, 0);
  const scale = high > low ? (high - low) / qmax : 1;
  const zero = Math.max(0, Math.min(qmax, roundEven(-low / scale)));
  return { bits, mode: 'affine', qmin: 0, qmax, scale, zero, min: scale * (0 - zero), max: scale * (qmax - zero) };
}

/** Fit a symmetric grid to cover the largest magnitude. */
export function fitSymmetric(values, bits) {
  return symmetricParams(values.reduce((m, v) => Math.max(m, Math.abs(v)), 0), bits);
}

/** Fit an affine grid to cover [min, max] (and zero). */
export function fitAffine(values, bits) {
  return affineParams(Math.min(...values), Math.max(...values), bits);
}

export function quantizeValue(value, params) {
  const rawCode = roundEven(value / params.scale) + params.zero;
  const code = Math.max(params.qmin, Math.min(params.qmax, rawCode));
  const reconstructed = params.scale * (code - params.zero);
  return {
    value,
    code,
    reconstructed,
    error: reconstructed - value,
    clipped: value < params.min - 1e-12 || value > params.max + 1e-12,
  };
}

/** Quantize a vector with one grid; returns parallel arrays. */
export function quantizeVector(values, params) {
  const codes = new Array(values.length);
  const recon = new Array(values.length);
  const clipped = new Array(values.length);
  values.forEach((value, i) => {
    const point = quantizeValue(value, params);
    codes[i] = point.code;
    recon[i] = point.reconstructed;
    clipped[i] = point.clipped;
  });
  return { codes, recon, clipped, clippedCount: clipped.filter(Boolean).length };
}

/** Every reconstruction level of a grid, ascending. */
export function levelsOf(params) {
  const levels = [];
  for (let code = params.qmin; code <= params.qmax; code++) levels.push(params.scale * (code - params.zero));
  return levels;
}

export function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

export function meanSquaredError(reference, actual) {
  let sum = 0;
  for (let i = 0; i < reference.length; i++) sum += (reference[i] - actual[i]) ** 2;
  return sum / Math.max(1, reference.length);
}

/** ‖ref − rec‖₂ / ‖ref‖₂ (0 when both are zero). */
export function relativeError(reference, actual) {
  let noise = 0;
  let signal = 0;
  for (let i = 0; i < reference.length; i++) {
    noise += (reference[i] - actual[i]) ** 2;
    signal += reference[i] ** 2;
  }
  if (signal === 0) return noise === 0 ? 0 : 1;
  return Math.sqrt(noise / signal);
}

/** Game fidelity: 1 − relative error, clamped to [0, 1]. */
export function fidelity(reference, actual) {
  return Math.max(0, Math.min(1, 1 - relativeError(reference, actual)));
}

/**
 * Declared toy packet (a teaching format, not a universal file layout): packed payload,
 * a 2-byte FP16 scale per group, a 1-byte zero-point per affine group and 3 bytes per
 * Spotlight value (FP16 value + 1-byte index).
 */
export function packetBytes({ count, bits, groups = 1, affine = false, spotlight = 0 }) {
  const payload = Math.ceil((count * bits) / 8);
  const scales = 2 * groups;
  const zeros = affine ? groups : 0;
  const kept = 3 * spotlight;
  return { payload, scales, zeros, spotlight: kept, total: payload + scales + zeros + kept };
}

/** Ideal K+V cache payload (no metadata/alignment), counting KV heads, not query heads. */
export function kvCacheBytes({ layers, tokens, kvHeads, headDim, bits, batch = 1 }) {
  return (2 * layers * tokens * kvHeads * headDim * batch * bits) / 8;
}
