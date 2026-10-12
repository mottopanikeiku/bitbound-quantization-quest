import test from 'node:test';
import assert from 'node:assert/strict';
import { roundEven, parameters, quantizeValue, quantizeTensor, evaluateCalibrated, toyInference, kvCacheBytes } from '../src/quantization.js';

test('nearest-even ties work on both sides of zero', () => {
  assert.deepEqual([-2.5, -1.5, -0.5, 0.5, 1.5, 2.5].map(roundEven), [-2, -2, 0, 0, 2, 2]);
});

test('affine zero is exact and offset is applied after rounding', () => {
  const p = parameters([-1, 2], { bits: 4, mode: 'affine' });
  assert.equal(p.zero, 5);
  assert.equal(quantizeValue(0, p).reconstructed, 0);
  assert.equal(quantizeValue(p.scale * 0.5, p).code, 5);
  assert.equal(quantizeValue(-p.scale * 0.5, p).code, 5);
});

test('zero tensors stay finite and symmetric narrow range saturates', () => {
  const zero = quantizeTensor([[0, 0, 0]], { bits: 2 });
  assert.equal(zero.mse, 0);
  assert.equal(zero.params[0].scale, 1);
  const p = parameters([-1, 1], { bits: 4 });
  assert.equal(p.qmin, -7);
  assert.equal(p.qmax, 7);
  assert.equal(quantizeValue(20, p).reconstructed, 1);
  assert.equal(quantizeValue(-20, p).code, -7);
});

test('representative calibration prevents held-out saturation', () => {
  const values = [-2.5, -0.25, 0, 0.25, 2.5];
  const narrow = evaluateCalibrated(values, [-1, 1], { bits: 4 });
  const broad = evaluateCalibrated(values, [-3, 3], { bits: 4 });
  assert.equal(narrow.clipped, 2);
  assert.equal(broad.clipped, 0);
  assert.ok(broad.mse < narrow.mse);
});

test('per-channel scales preserve a small channel and account for metadata', () => {
  const rows = [[-0.1, 0, 0.1], [-7, 0, 7]];
  const tensor = quantizeTensor(rows, { bits: 4 });
  const channel = quantizeTensor(rows, { bits: 4, granularity: 'channel' });
  assert.equal(tensor.reconstructedRows[0][2], 0);
  assert.equal(channel.reconstructedRows[0][2], 0.1);
  assert.equal(channel.storage.payload, 3);
  assert.equal(channel.storage.metadata, 8);
  assert.equal(channel.storage.total, 11);
  assert.ok(channel.mse < tensor.mse);
});

test('toy inference can change the winning class despite weight compression', () => {
  const result = toyInference([[1, 0.2], [0.1, 0.8]], [[0.7, 0.8]], { weightBits: 2, activationBits: 32 });
  assert.equal(result.predictions[0].reference, 0);
  assert.equal(result.predictions[0].actual, 1);
  assert.equal(result.agreement, 0);
});

test('KV payload uses KV head count, both K and V, batch and context', () => {
  assert.equal(kvCacheBytes({ layers: 12, tokens: 1024, kvHeads: 4, headDim: 32, bits: 8 }), 3 * 1024 ** 2);
  assert.equal(kvCacheBytes({ layers: 12, tokens: 1024, kvHeads: 4, headDim: 32, bits: 16, batch: 2 }), 12 * 1024 ** 2);
});
