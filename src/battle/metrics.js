// Shared by combat and teaching diagrams: sensitivities weight L2 ENERGY.
import { fidelity } from '../quantization.js';

export function weightedVectors(rows, sensitivities) {
  const reference = [];
  const reconstructed = [];
  rows.forEach((row, index) => {
    const factor = Math.sqrt(Math.max(0, sensitivities?.[index] ?? 1));
    row.values.forEach((value, i) => {
      reference.push(value * factor);
      reconstructed.push((row.recon?.[i] ?? value) * factor);
    });
  });
  return { reference, reconstructed };
}

export function weightedFidelity(rows, sensitivities) {
  const { reference, reconstructed } = weightedVectors(rows, sensitivities);
  return fidelity(reference, reconstructed);
}

// Floating point roundoff alone may count as exact; rounded percentages never do.
export function formatFidelity(value) {
  if (!Number.isFinite(value)) return '?';
  if (value >= 1 - 1e-12) return '100%';
  const percent = Math.max(0, Math.min(99.9, Math.round(value * 1000) / 10));
  return percent >= 95 ? percent.toFixed(1) + '%' : Math.floor(percent) + '%';
}
