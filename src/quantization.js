// ONNX-style nearest-even rounding, affine quantize/dequantize, and toy storage.
// Calculations use JS numbers, not a hardware INT kernel or an FP16 emulator.
export function roundEven(value) {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction < 0.5) return floor;
  if (fraction > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

export function parameters(values, { bits = 4, mode = 'symmetric', range } = {}) {
  if (mode === 'affine') {
    const qmin = 0;
    const qmax = 2 ** bits - 1;
    const min = Math.min(0, ...values);
    const max = Math.max(0, ...values);
    const scale = max === min ? 1 : (max - min) / (qmax - qmin);
    const zero = Math.max(qmin, Math.min(qmax, roundEven(qmin - min / scale)));
    return { bits, mode, qmin, qmax, scale, zero, min: scale * (qmin - zero), max: scale * (qmax - zero) };
  }
  // Narrow symmetric convention: INT4 uses -7..7; -8 is deliberately unused.
  // This is one convention, not the definition of every signed quantizer.
  const qmax = 2 ** (bits - 1) - 1;
  const magnitude = range ?? Math.max(...values.map(Math.abs), 0);
  const scale = magnitude === 0 ? 1 : magnitude / qmax;
  return { bits, mode, qmin: -qmax, qmax, scale, zero: 0, min: -qmax * scale, max: qmax * scale };
}

export function quantizeValue(value, params) {
  const rawCode = roundEven(value / params.scale) + params.zero;
  const code = Math.max(params.qmin, Math.min(params.qmax, rawCode));
  const reconstructed = params.scale * (code - params.zero);
  return { value, code, reconstructed, error: reconstructed - value,
    clipped: value < params.min - 1e-12 || value > params.max + 1e-12 };
}

export function meanSquaredError(reference, actual) {
  return reference.reduce((sum, value, i) => sum + (value - actual[i]) ** 2, 0) / reference.length;
}

export function storageBytes(count, bits, groupCount = 1, mode = 'symmetric') {
  const payload = Math.ceil(count * bits / 8);
  // Explicit teaching format: FP32 scale + optional byte-wide zero-point/group.
  // Real runtimes may pack metadata differently and add alignment/other tensors.
  const metadata = groupCount * (4 + (mode === 'affine' ? 1 : 0));
  return { payload, metadata, total: payload + metadata };
}

export function quantizeTensor(rows, options = {}) {
  const { bits = 4, mode = 'symmetric', granularity = 'tensor', groupSize = 4, range } = options;
  const values = rows.flat();
  const groups = [];
  if (granularity === 'channel') {
    let offset = 0;
    for (const row of rows) {
      groups.push(row.map((_, i) => offset + i));
      offset += row.length;
    }
  } else if (granularity === 'group') {
    for (let offset = 0; offset < values.length; offset += groupSize) {
      groups.push(values.slice(offset, offset + groupSize).map((_, i) => offset + i));
    }
  } else {
    groups.push(values.map((_, i) => i));
  }
  const points = Array(values.length);
  const params = groups.map((indices, group) => {
    const p = parameters(indices.map(i => values[i]), { bits, mode, range });
    for (const i of indices) points[i] = { ...quantizeValue(values[i], p), group };
    return p;
  });
  const reconstructed = points.map(p => p.reconstructed);
  let offset = 0;
  const reconstructedRows = rows.map(row => {
    const result = reconstructed.slice(offset, offset + row.length);
    offset += row.length;
    return result;
  });
  return { values, points, params, reconstructed, reconstructedRows,
    mse: meanSquaredError(values, reconstructed), clipped: points.filter(p => p.clipped).length,
    storage: storageBytes(values.length, bits, groups.length, mode) };
}

export function evaluateCalibrated(values, calibration, options = {}) {
  const params = parameters(calibration, options);
  const points = values.map(value => quantizeValue(value, params));
  const reconstructed = points.map(p => p.reconstructed);
  return { values, points, params: [params], reconstructed,
    mse: meanSquaredError(values, reconstructed), clipped: points.filter(p => p.clipped).length,
    storage: storageBytes(values.length, options.bits ?? 4, 1, options.mode ?? 'symmetric') };
}

export function dot(weights, input) {
  return weights.reduce((sum, value, i) => sum + value * input[i], 0);
}

export function toyInference(weightRows, inputs, { weightBits = 4, activationBits = 32, granularity = 'channel' } = {}) {
  const quantized = quantizeTensor(weightRows, { bits: weightBits, granularity });
  const reference = inputs.map(input => weightRows.map(row => dot(row, input)));
  const actual = inputs.map(input => {
    const activations = activationBits === 32 ? input : quantizeTensor([input], { bits: activationBits }).reconstructed;
    return quantized.reconstructedRows.map(row => dot(row, activations));
  });
  const winner = outputs => outputs.indexOf(Math.max(...outputs));
  const agreement = reference.filter((outputs, i) => winner(outputs) === winner(actual[i])).length;
  return { ...quantized, reference, actual, agreement, total: inputs.length,
    outputMse: meanSquaredError(reference.flat(), actual.flat()),
    predictions: reference.map((outputs, i) => ({ reference: winner(outputs), actual: winner(actual[i]), outputs, reconstructed: actual[i] })) };
}

export function kvCacheBytes({ layers, tokens, kvHeads, headDim, bits, batch = 1 }) {
  // K and V, no metadata/alignment. KV heads (not query heads), including GQA.
  return 2 * layers * tokens * kvHeads * headDim * batch * bits / 8;
}
