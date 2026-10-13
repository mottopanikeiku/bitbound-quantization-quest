import { GUARDIANS, ZONES } from '../content/game-data.js';

// Guardians last long enough to expose their charge, rhythm, and byte-economy decisions.
// Staticlings below retain their one-to-three-cast practice role.
const HP = [84, 100, 120, 132, 150, 134, 224];
const POWER = [6, 7, 8, 9, 10, 11, 13];
const FLOORS = [0.65, 0.82, 0.83, 0.72, 0.78, 0.58, 0.88];
const INTROS = [
  'Nib shakes a new wave from its leaf. More bits make smaller steps!',
  'Chime rings mostly above zero. Half a mirrored ruler goes to waste.',
  'Brine hides the next wave. Read the forecast and the sample archive.',
  'Spindle has three threads. Each thread must survive its own rounding.',
  'Cinder feeds three sparks through sixteen weights. Two channels run hot.',
  'Vesper has one enormous activation channel. Both sides must be rounded.',
  'Auric has three heads, but their errors do not matter equally.',
];
const HINTS = [
  'Try 4 bits and cover the wave. 2 bits are rough; 8 bits cost more.',
  'Try Zero-Shift at 3 bits. Keep the small negative tail and the tall positive side.',
  'The archive has calm and storm samples. Use a tight calm range, wide before a storm.',
  'Turn on Group Rulers at 3 bits. The tiny thread needs a tiny step, not a giant ruler.',
  'Spotlight the two largest input channels, then try 2-bit weights. Watch output fidelity.',
  'Try 3 bits and Balance near alpha 0.5. Divide A, multiply W, then round BOTH grids.',
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
    hp: 18 + 3 * z.id,
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
const GELU = [-1, -1, 0, 0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 5, 6, 6];
const THREAD = [0, 2, 3, 2, 0, -2, -3, -2];
const STORM = [-7, 1, 0, -1, 1, 2, 0, -2, 7, -1, 1, 0, -2, 2, 1, -1];
const PRECISE_HEAD = [-127, -109, -83, -57, -29, -11, 7, 31, 51, 79, 101, 127, 113, 67, 23, -43];
const LOPSIDED_HEAD = [-8, 0, 5, 12, 19, 27, 36, 45, 57, 71, 83, 99, 127, 108, 64, 32];

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
export function createEssence(foeId, turn = 0, random = () => 0.5, phase = 1) {
  const foe = foeFor(foeId);
  const tick = Math.max(0, Math.trunc(turn));
  const drift = 0.96 + 0.08 * random();
  const shift = tick * 3;
  const base = { foeId, turn: tick, phase, kind: foe.technique, hidden: false };

  if (foe.zone === 0) {
    return { ...base, rows: [{ label: 'Leaf wave', values: rotateScale(WAVE, shift, drift / 7) }] };
  }
  if (foe.zone === 1) {
    return { ...base, rows: [{ label: 'Bell glow', values: rotateScale(GELU, shift, drift / 6) }] };
  }
  if (foe.zone === 2) {
    const storm = tick % 2 === 1;
    const stormPeak = [1.8, 2.0, 2.2][Math.floor(tick / 2) % 3];
    const amplitude = (storm ? stormPeak : 0.49) * (0.998 + 0.004 * random());
    const calmSample = rotateScale(WAVE, shift, 0.49 / 7);
    const stormSample = rotateScale(STORM, shift, stormPeak / 7);
    return {
      ...base,
      hidden: true,
      storm,
      forecast: storm ? `Storm next: tails near +/-${stormPeak.toFixed(1)}. Read the storm archive.` : 'Calm next: most of the wave fits inside +/-0.5.',
      ghosts: storm ? stormSample : calmSample,
      archive: { calm: calmSample, storm: stormSample },
      rows: [{ label: storm ? 'Hidden storm' : 'Hidden calm', values: rotateScale(storm ? STORM : WAVE, shift, amplitude / 7) }],
    };
  }
  if (foe.zone === 3) {
    return {
      ...base,
      independentThreads: true,
      rows: [3, 0.4, 0.05].map((magnitude, i) => ({
        label: ['Rope', 'Silk', 'Whisper'][i],
        values: rotateScale(THREAD, shift + i, magnitude * drift / 3),
      })),
    };
  }
  if (foe.zone === 4) {
    // Hot inputs amplify weight error. A modest residual makes cancellation visible
    // without changing fidelity or adding a technique-specific damage multiplier.
    const hot = [(tick * 2) % 16, (tick * 2 + 1) % 16];
    const weights = Array.from({ length: 16 }, (_, i) => i % 2 === 0 ? 1 : -1);
    weights[hot[0]] = 0.37 * drift;
    weights[hot[1]] = -0.41 * drift;
    const anchor = (hot[1] + 1) % 16;
    const desired = [0.21, -0.17, 0.29];
    const inputs = desired.map((target, token) => {
      const a = weights.map((_, i) => 0.04 * Math.sin((i + 1) * (token + 1) + tick));
      a[hot[0]] = (8 + token * 0.35) / drift;
      a[hot[1]] = (8.15 - token * 0.2) / drift;
      a[anchor] = 0;
      let subtotal = 0;
      for (let i = 0; i < weights.length; i++) subtotal += a[i] * weights[i];
      a[anchor] = (target - subtotal) / weights[anchor];
      return a;
    });
    return { ...base, inputs, weights, quantizeInputs: false, hotChannels: hot, rows: [{ label: 'Kiln weights', values: weights }] };
  }
  if (foe.zone === 5) {
    const hot = tick % 16;
    const amplitudes = Array.from({ length: 16 }, (_, i) => i === hot ? 20 * drift : (0.6 + (i % 5) * 0.2) * drift);
    // Unequal channel products make alpha a real tradeoff: at 0.5 both sides
    // become 1/2/3-level magnitudes, while the endpoints burden one tensor.
    const weights = amplitudes.map((amplitude, i) => {
      const level = 1 + ((i + tick) % 3);
      return (i % 2 === 0 ? 1 : -1) * level * level / amplitude;
    });
    const inputs = [0, 1, 2].map((token) => amplitudes.map((amplitude, i) => {
      const sign = i % 2 === 0 ? 1 : -1;
      const position = (i + token * 3 + tick) % 8;
      const pulse = position < 5 ? 1 : position < 7 ? -1 : 0;
      return amplitude * sign * pulse;
    }));
    return {
      ...base,
      inputs,
      weights,
      quantizeInputs: true,
      hotChannels: [hot],
      rows: [
        ...inputs.map((values, i) => ({ label: `Token ${i + 1}: A`, values })),
        { label: 'Library W', values: weights },
      ],
    };
  }

  const second = phase >= 2;
  return {
    ...base,
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
  if (beat === 2) {
    return { name: 'Static charge', telegraph: `${foe.name} draws in a heavy charge. GUARD can brace it!`, hits: [power * 2 + 2], gaps: [0.85], charge: true, morph };
  }
  if (beat === 1 || beat === 3) {
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
export function intendedGear(foeId, phase = 1) {
  const zone = foeFor(foeId).zone;
  const gear = { bits: 4, zero: false, calib: false, groups: false, spotlight: 0, balance: false, budget: null };
  if (zone === 1) Object.assign(gear, { bits: 3, zero: true });
  if (zone === 2) gear.calib = true;
  if (zone === 3) Object.assign(gear, { bits: 3, groups: true });
  if (zone === 4) Object.assign(gear, { bits: 2, spotlight: 2 });
  if (zone === 5) Object.assign(gear, { bits: 3, balance: true });
  if (zone === 6) gear.budget = [8, phase >= 2 ? 3 : 2, 2];
  return gear;
}
