import test from 'node:test';
import assert from 'node:assert/strict';
import {
  roundEven,
  symmetricParams,
  affineParams,
  fitSymmetric,
  quantizeValue,
  quantizeVector,
  levelsOf,
  fidelity,
  relativeError,
  packetBytes,
  kvCacheBytes,
} from '../src/quantization.js';

test('nearest-even ties work on both sides of zero', () => {
  assert.deepEqual([-2.5, -1.5, -0.5, 0.5, 1.5, 2.5].map(roundEven), [-2, -2, 0, 0, 2, 2]);
});

test('affine zero is exact and the zero-point is added after rounding', () => {
  const p = affineParams(-1, 2, 4);
  assert.equal(p.zero, 5);
  assert.equal(quantizeValue(0, p).reconstructed, 0);
  assert.equal(quantizeValue(p.scale * 0.5, p).code, 5);
  assert.equal(quantizeValue(-p.scale * 0.5, p).code, 5);
});

test('affine ranges are extended to contain zero and use every code', () => {
  const p = affineParams(0.5, 1, 2);
  assert.equal(p.min, 0);
  assert.equal(levelsOf(p).length, 4);
  assert.ok(levelsOf(p).includes(0));
});

test('narrow symmetric grids use 2^b − 1 mirrored levels and saturate', () => {
  const p = symmetricParams(1, 4);
  assert.equal(p.qmin, -7);
  assert.equal(p.qmax, 7);
  assert.equal(levelsOf(p).length, 15);
  assert.equal(levelsOf(symmetricParams(1, 2)).length, 3);
  assert.equal(quantizeValue(20, p).reconstructed, 1);
  assert.equal(quantizeValue(-20, p).code, -7);
  assert.equal(quantizeValue(-20, p).clipped, true);
});

test('in-range rounding error never exceeds half a step', () => {
  const p = symmetricParams(1.3, 3);
  for (let x = -1.3; x <= 1.3; x += 0.01) {
    assert.ok(Math.abs(quantizeValue(x, p).error) <= p.scale / 2 + 1e-12);
  }
});

test('a shared scale rounds a tiny row to zero; its own scale preserves it', () => {
  const big = [-3, -1.5, 0.4, 3];
  const tiny = [-0.05, 0.02, 0.04, 0.05];
  const shared = fitSymmetric([...big, ...tiny], 3);
  assert.equal(fidelity(tiny, quantizeVector(tiny, shared).recon), 0);
  assert.ok(fidelity(tiny, quantizeVector(tiny, fitSymmetric(tiny, 3)).recon) > 0.8);
});

test('fidelity is one minus the relative error and handles silence', () => {
  assert.equal(fidelity([1, 2], [1, 2]), 1);
  assert.equal(relativeError([0, 0], [0, 0]), 0);
  assert.equal(relativeError([0, 0], [1, 0]), 1);
  assert.ok(Math.abs(fidelity([3, 4], [3, 3]) - 0.8) < 1e-12);
});

test('declared packets count payload, FP16 scales, zero-points and kept values', () => {
  assert.deepEqual(packetBytes({ count: 16, bits: 4 }), { payload: 8, scales: 2, zeros: 0, spotlight: 0, total: 10 });
  assert.equal(packetBytes({ count: 16, bits: 3, affine: true }).total, 9);
  assert.equal(packetBytes({ count: 24, bits: 3, groups: 3 }).total, 15);
  assert.equal(packetBytes({ count: 16, bits: 3, spotlight: 2 }).total, 14);
});

test('KV payload uses KV head count, both K and V, batch and context', () => {
  assert.equal(kvCacheBytes({ layers: 12, tokens: 1024, kvHeads: 4, headDim: 32, bits: 8 }), 3 * 1024 ** 2);
  assert.equal(kvCacheBytes({ layers: 12, tokens: 1024, kvHeads: 4, headDim: 32, bits: 16, batch: 2 }), 12 * 1024 ** 2);
});
