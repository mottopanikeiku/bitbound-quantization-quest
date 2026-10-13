import { GUARDIANS, ZONES } from '../content/game-data.js';

// Three clean early casts, four in the middle, four-to-five across Auric's phases.
// An early charge keeps the shorter fights from removing the guard decision.
const HP = [60, 66, 100, 120, 140, 120, 156];
const POWER = [6, 7, 8, 9, 10, 11, 13];
const FLOORS = [0.65, 0.82, 0.75, 0.72, 0.78, 0.58, 0.88];
const INTROS = [
  'Nib shakes a new wave from its leaf. More bits make smaller steps!',
  'Chime rings mostly above zero. Half a mirrored ruler goes to waste.',
  'Brine hides the next wave. Read the forecast and the sample archive.',
  'Spindle has three threads. Each thread must survive its own rounding.',
  'Cinder feeds three sparks through sixteen weights. Two channels run hot.',
  'Vesper has opposing outliers in A and W. Both sides must be rounded.',
  'Auric has three heads, but their errors do not matter equally.',
];
const HINTS = [
  'Try 4 bits and cover the wave. 2 bits are rough; 8 bits cost more.',
  'Try Zero-Shift at 4 bits. Sixteen one-sided levels fit the bell without wasting half a mirrored ruler.',
  'The archive has calm and storm samples. Use a tight calm range, wide before a storm.',
  'Try Group Rulers at 3 bits. After two good casts, extra bends need 4 bits and fresh rulers.',
  'Spotlight the two largest input channels, then try 2-bit weights. Watch output fidelity.',
  'Try 2 bits and Balance near alpha 0.5. When unequal products appear, retune to 3 bits.',
  'Try head bits 8 / 2 / 2; in phase two the middle head needs 3. Sensitivities are 3 / 1 / 0.4.',
];
const STATIC_NAMES = ['Bit Sprig', 'Offbeat Shard', 'Ripple Static', 'Loose Thread', 'Coal Fleck', 'Ink Blot', 'Scale Spark'];

export const FOES = Object.fromEntries([
  ...GUARDIANS.map((g) => [g.key, {
    id: g.key,
    name: g.name,
    guardian: true,
    zone: g.zone,
    hp: HP[g.zone],
    power: POWER[g.zone],
    floor: FLOORS[g.zone],
    background: g.zone === 6 ? 'final' : ZONES[g.zone].key,
    technique: ZONES[g.zone].technique,
    intro: INTROS[g.zone],
    hint: HINTS[g.zone],
  }]),
  ...ZONES.map((z) => [`static-${z.id}`, {
    id: `static-${z.id}`,
    name: STATIC_NAMES[z.id],
    guardian: false,
    zone: z.id,
    hp: 18 + 2 * z.id,
    power: 2 + Math.floor(z.id / 3),
    floor: FLOORS[z.id],
    background: 'static',
    technique: z.technique,
    intro: `${STATIC_NAMES[z.id]} is practising ${z.name}'s trick.`,
    hint: HINTS[z.id],
  }]),
]);

// Deliberately legible toy signals, not samples from a trained neural network.
// The smooth sampled wave has a useful INT4 fit, while its thirds do not fit INT3.
const WAVE = [0, 3, 5, 6, 7, 6, 5, 3, 0, -3, -5, -6, -7, -6, -5, -3];
const BELL_LEVELS = Array.from({ length: 16 }, (_, i) => i / 15);
const THREAD = [0, 2, 3, 2, 0, -2, -3, -2];
const BENT_THREAD = [0, 3, 5, 7, 4, -2, -6, -7];
const CALM_ARCHIVE = [-0.49, -0.35, -0.28, -0.21, -0.14, -0.07, 0, 0.07, 0.14, 0.21, 0.28, 0.35, 0.42, -0.42, 0.14, 0];
const STORM_ARCHIVE = [-2.2, -1.8, -1.2, -0.6, -0.3, 0, 0.3, 0.6, 1.2, 1.8, 2.2, -0.6, 0.3, 0, 0.6, -0.3];
const CALM_LIVE = [0, 2, 4, 6, 7, 5, 2, -1, -4, -6, -7, -5, -2, 1, 3, 0];
const STORM_LIVE = [-7, -4, 1, 3, 6, 2, -2, -5, 7, 4, -1, -3, -6, 0, 2, 5];
const TOKEN_SIGNS = [
  [1, 1, 1, 1, -1, -1, 1, 1, -1, 1, -1, 1, 1, -1, 1, -1],
  [1, -1, 1, -1, 1, 1, -1, 1, 1, 1, 1, -1, -1, 1, -1, 1],
  [-1, 1, 1, 1, 1, -1, 1, -1, 1, -1, 1, 1, -1, 1, 1, -1],
];
// Fourteen crown values make the honest 8/2/2 and 8/3/2 packets 28/30 B.
// Four clean casts then need one 12 B recharge, not a last two-byte extra turn.
const PRECISE_HEAD = [-127, -109, -83, -57, -29, -11, 7, 31, 51, 79, 101, 127, 113, 67];
const LOPSIDED_HEAD = [-8, 0, 5, 12, 19, 27, 36, 45, 57, 71, 83, 99, 127, 108];

function rotateScale(values, shift, scale) {
  const offset = ((shift % values.length) + values.length) % values.length;
  return values.map((_, i) => values[(i + offset) % values.length] * scale);
}

function foeFor(id) {
  const foe = FOES[id];
  if (!foe) throw new RangeError(`Unknown foe: ${id}`);
  return foe;
}

/** Every random choice uses the supplied RNG; time only comes from turn/phase. */
export function createEssence(foeId, turn = 0, random = () => 0.5, phase = 1, { successes = turn } = {}) {
  const foe = foeFor(foeId);
  const tick = Math.max(0, Math.trunc(turn));
  const drift = 0.96 + 0.08 * random();
  const shift = tick * 3;
  const morphed = foe.guardian && successes >= 2 && foe.zone >= 3;
  const second = phase >= 2 || morphed;
  const base = { foeId, turn: tick, phase, kind: foe.technique, hidden: false, morphStage: Number(morphed) };

  if (foe.zone === 0) {
    return { ...base, rows: [{ label: 'Leaf wave', values: rotateScale(WAVE, shift, drift / 7) }] };
  }
  if (foe.zone === 1) {
    return { ...base, rows: [{ label: 'Bell glow', values: rotateScale(BELL_LEVELS, shift, drift) }] };
  }
  if (foe.zone === 2) {
    const storm = tick % 2 === 1;
    // Archives are fixed, independent past distributions. The forecast discloses
    // a regime, not the actual sample; live spacing, order and density differ.
    const amplitude = (storm ? 2.1 : 0.49) * (0.995 + 0.01 * random());
    const calmSample = [...CALM_ARCHIVE];
    const stormSample = [...STORM_ARCHIVE];
    return {
      ...base,
      hidden: true,
      storm,
      forecast: storm ? 'Storm next: tails around +/-2.1. Choose a wide range.' : 'Calm next: tails around +/-0.49. Choose a tight range.',
      ghosts: [...calmSample, ...stormSample],
      archive: { calm: calmSample, storm: stormSample },
      rows: [{ label: storm ? 'Hidden storm' : 'Hidden calm', values: rotateScale(storm ? STORM_LIVE : CALM_LIVE, shift, amplitude / 7) }],
    };
  }
  if (foe.zone === 3) {
    const shape = morphed ? BENT_THREAD : THREAD;
    const magnitudes = foe.guardian ? [3, 0.4, 0.05] : [1, 0.4, 0.16];
    return {
      ...base,
      morphName: morphed ? 'Extra bends' : 'Three simple threads',
      morphHint: morphed ? 'New bends do not fit the old 3-bit steps. Try 4 bits with Group Rulers.' : '',
      independentThreads: true,
      rows: magnitudes.map((magnitude, i) => ({
        label: ['Rope', 'Silk', 'Whisper'][i],
        values: rotateScale(shape, shift + i, magnitude * drift / (morphed ? 7 : 3)),
      })),
    };
  }
  if (foe.zone === 4) {
    // The hot products nearly cancel. Cold inputs are genuinely small, so
    // protecting the hot weights is useful throughout a broad range interval,
    // not only at a PERFECT lattice point. A practice foe has a larger residual.
    const hot = morphed ? [(tick * 2) % 16, (tick * 2 + 7) % 16] : [(tick * 2) % 16, (tick * 2 + 1) % 16];
    const weights = Array.from({ length: 16 }, (_, i) => morphed ? [0, 0.3, 0.7, 1][i % 4] : i % 2 === 0 ? 1 : -1);
    weights[hot[0]] = (morphed ? 0.23 : 0.37) * drift;
    weights[hot[1]] = (morphed ? -0.53 : -0.41) * drift;
    const desired = foe.guardian ? [0.21, -0.17, 0.29] : [2.1, 1.7, 2.9];
    const inputs = desired.map((target, token) => {
      const a = weights.map((_, i) => (morphed ? 0.0005 : 0.002) * Math.sin((i + 1) * (token + 1) + tick));
      a[hot[0]] = ((morphed ? 24 : 8) + token * 0.35) / drift;
      a[hot[1]] = (target - a[hot[0]] * weights[hot[0]]) / weights[hot[1]];
      return a;
    });
    return {
      ...base, inputs, weights, quantizeInputs: false, hotChannels: hot,
      morphName: morphed ? 'Split heat' : 'Paired heat',
      morphHint: morphed ? 'The hot inputs split apart and their heights change. Choose by input heat, not weight size.' : '',
      rows: [{ label: 'Kiln weights', values: weights }],
    };
  }
  if (foe.zone === 5) {
    const hot = tick % 16;
    const scales = foe.guardian ? [24, 10, 4, 1.6, 0.65, 0.26, 0.1, 0.04] : [4, 3, 2, 1.6, 1, 0.8, 0.6, 0.4];
    const amplitudes = Array.from({ length: 16 }, (_, i) => scales[(i + tick) % scales.length] * drift);
    // Opposing A/W outliers disappear together under paired rescaling. The
    // second shape changes product magnitudes, so the original 2-bit grid is
    // no longer sufficient even after balancing: a real new bit decision.
    const weights = amplitudes.map((amplitude, i) => {
      const level = morphed ? 1 + ((i + tick) % 3) : 1;
      return (i % 2 === 0 ? 1 : -1) * level * level / amplitude;
    });
    const inputs = TOKEN_SIGNS.map((signs) => amplitudes.map((amplitude, i) =>
      amplitude * (i % 2 === 0 ? 1 : -1) * signs[(i + tick) % 16]));
    return {
      ...base,
      inputs,
      weights,
      quantizeInputs: true,
      hotChannels: [hot],
      morphName: morphed ? 'Unequal products' : 'Opposing outliers',
      morphHint: morphed ? 'The balanced products now have three magnitudes. Keep Balance, but try 3 bits.' : '',
      rows: [
        ...inputs.map((values, i) => ({ label: `Token ${i + 1}: A`, values })),
        { label: 'Library W', values: weights },
      ],
    };
  }

  return {
    ...base,
    morphName: second ? 'The wing unfolds' : 'Fine crown',
    morphHint: second ? 'The wing has extra levels now. Keep 8 crown bits and raise the wing to 3.' : '',
    sensitivities: [3, 1, 0.4],
    rows: [
      { label: 'Crown x3', values: rotateScale(second ? LOPSIDED_HEAD : PRECISE_HEAD, shift, (second ? 1.7 : 1) * drift / 127) },
      { label: 'Wing x1', values: rotateScale(second ? [0, 1, 2, 3, 2, 1, 0, -1, -2, -3, -2, -1, 0, 1, 3, 0] : [0, 1, 1, 0, -1, -1, 0, 1, 0, -1, 1, 0, 0, -1, 1, 0], shift, (second ? 0.2 : 0.3) * drift) },
      { label: 'Tail x0.4', values: rotateScale(second ? [0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1] : [0, 1, 0, -1, 1, 0, -1, 0, 1, -1, 0, 1, 0, -1, 0, 1], shift, (second ? 0.12 : 0.1) * drift) },
    ],
  };
}

/** A delay belongs to each hit, measured from the previous hit (or telegraph end). */
export function attackFor(foeId, turn = 0, phase = 1) {
  const foe = foeFor(foeId);
  const beat = ((Math.trunc(turn) % 4) + 4) % 4;
  const power = foe.power + (foe.zone === 6 && phase >= 2 ? 1 : 0);
  const morph = [
    'The leaf wave rolls into a new phase.',
    'The bright bell values trade places.',
    turn % 2 === 0 ? 'A storm is gathering for the next wave.' : 'The next wave will be calm.',
    'The three threads slip past one another.',
    'Two different kiln channels glow hot.',
    'The outlier slips into another channel.',
    phase >= 2 ? 'The middle head grows a new tail. Revisit its bits.' : 'The crown head shifts its fine detail.',
  ][foe.zone];
  if (beat === 1) {
    return { name: 'Static charge', telegraph: `${foe.name} draws in a heavy charge. GUARD can brace it!`, hits: [power * 2 + 2], gaps: [0.85], charge: true, morph };
  }
  if (beat === 2 || beat === 3) {
    const triple = foe.guardian && foe.zone >= 3 && beat === 3;
    return {
      name: triple ? 'Three-beat ripple' : 'Echo taps',
      telegraph: triple ? 'Three rings: tap, quick tap, then wait for the third.' : 'Two rings are coming. Guard each beat separately.',
      hits: triple ? [power, Math.max(1, power - 1), power] : [power, Math.max(1, power - 1)],
      gaps: triple ? [0.85, 0.45, 0.7] : [0.85, 0.55],
      charge: false,
      morph,
    };
  }
  return { name: 'Static nudge', telegraph: `${foe.name} winds up. Confirm when the ring meets the mark.`, hits: [power + 1], gaps: [0.85], charge: false, morph };
}

/** Public, deterministic teaching fixtures; these do not change the spell's math. */
export function intendedGear(foeId, phase = 1, { successes = 0 } = {}) {
  const zone = foeFor(foeId).zone;
  const gear = { bits: 4, zero: false, calib: false, groups: false, spotlight: 0, balance: false, budget: null };
  if (zone === 1) Object.assign(gear, { bits: 4, zero: true });
  if (zone === 2) gear.calib = true;
  if (zone === 3) Object.assign(gear, { bits: successes >= 2 ? 4 : 3, groups: true });
  if (zone === 4) Object.assign(gear, { bits: 2, spotlight: 2 });
  if (zone === 5) Object.assign(gear, { bits: successes >= 2 ? 3 : 2, balance: true });
  if (zone === 6) gear.budget = [8, phase >= 2 || successes >= 2 ? 3 : 2, 2];
  return gear;
}
