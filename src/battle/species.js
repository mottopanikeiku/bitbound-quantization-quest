import { SPECIES, WARDENS, dexEntryOf } from '../content/static-dex.js';
import { createEssence, intendedGear } from './foes.js';

const GUARDIANS = ['nib', 'chime', 'brine', 'spindle', 'cinder', 'vesper', 'auric'];
const PACKETS = [10, 11, 10, 15, 12, 20, 28];
// Finite authored banks: no runtime independent value noise. Certification lives in species.test.js.
// Each bank combines two discrete shape choices with 32 cyclic channel/row arrangements.
const bank = entry => Object.freeze(Array.from({ length: 64 }, (_, index) => Object.freeze({ shape: index % 2, shift: Math.floor(index / 2) })));
export const MOTIFS = Object.freeze(Object.fromEntries(SPECIES.map(entry => [entry.id, Object.freeze({ ...entry, fixtures: bank(entry) })])));
export const WARDEN_MOTIFS = Object.freeze(Object.fromEntries(WARDENS.map(entry => [entry.id, Object.freeze({ ...entry, fixtures: bank(entry) })])));
const TERRACES = [0, 1, 2, 4, 7, 7, 4, 2, 0, -1, -2, -4, -7, -7, -4, -2];
const TAILS = [0, 1, 2, 3, 2, 1, 0, -1, -2, -3, -2, -1, 0, 7, 0, -7];

function entryOf(id) {
  const entry = dexEntryOf(id);
  if (!entry) throw new RangeError(`Unknown motif: ${id}`);
  return entry;
}
const rotate = (values, shift) => values.map((_, i) => values[((i + shift) % values.length + values.length) % values.length]);
function reorderHeads(essence, order) {
  essence.rows = order.map(i => essence.rows[i]);
  essence.sensitivities = order.map(i => essence.sensitivities[i]);
}
function headOrder(id, second, crosswind = false) {
  const shift = id === 'crown-crumb' ? 1 : id === 'prism-pip' ? 2 : id === 'crown-allocator' && second ? 1 : 0;
  return rotate([0, 1, 2], shift + (crosswind && second ? 1 : 0));
}

/** Origins delegate to the unchanged campaign provider, including its RNG stream. */
export function createMotifEssence(speciesId, turn = 0, random = () => 0.5, phase = 1, options = {}) {
  const entry = entryOf(speciesId);
  if (!MOTIFS[speciesId]) throw new RangeError(`Not a species: ${speciesId}`);
  if (entry.origin) {
    const essence = createEssence(`static-${entry.zone}`, turn, random, phase, options);
    return modifiers(essence, entry, options);
  }
  return variant(entry, turn, random, phase, options, false);
}

export function createWardenEssence(wardenId, turn = 0, random = () => 0.5, phase = 1, options = {}) {
  const entry = entryOf(wardenId);
  if (!WARDEN_MOTIFS[wardenId]) throw new RangeError(`Not a warden: ${wardenId}`);
  return variant(entry, turn, random, phase, options, true);
}

function variant(entry, turn, random, phase, { successes = 0, crosswind = false, regime } = {}, warden) {
  const fixture = (MOTIFS[entry.id] ?? WARDEN_MOTIFS[entry.id]).fixtures[Math.min(63, Math.max(0, Math.floor(random() * 64)))];
  const drift = 0.92 + 0.16 * random();
  const second = successes >= 2;
  // Base fixture choice is finite and independent of elapsed time and live RNG jitter.
  const essence = createEssence(GUARDIANS[entry.zone], fixture.shape, () => 0.5, phase, { successes: second && entry.id !== 'index-wisp' ? 2 : 0 });
  essence.foeId = entry.id;
  essence.turn = Math.max(0, Math.trunc(turn));
  essence.morphStage = Number(second && (warden || entry.zone >= 3 && entry.id !== 'index-wisp'));
  const shift = fixture.shift + essence.turn * 3;
  if (entry.zone === 0) {
    const shape = entry.id === 'stepbud' || (warden && !second) ? TERRACES : TAILS;
    essence.rows[0] = { label: shape === TERRACES ? 'Symmetric terraces' : 'Small ripple, tall tails', values: rotate(shape, shift).map(v => v * drift / 7) };
  } else if (entry.zone === 1) {
    if (entry.id === 'crooked-pebble' || (warden && second)) essence.rows[0].values = essence.rows[0].values.map(v => -v);
    if (entry.id === 'lantern-sliver') essence.rows[0].values = essence.rows[0].values.map(v => v - 4 / 15);
    // Twenty-four authored samples amortize affine metadata and retain a useful
    // +/-3% lock margin at toy power 22; no hidden damage or floor adjustment.
    essence.rows[0].values.push(...essence.rows[0].values.slice(0, 8));
    essence.rows[0].values = rotate(essence.rows[0].values, shift).map(v => v * drift);
  } else if (entry.zone === 2) {
    const sequence = entry.id === 'foam-flicker' ? [false, true, false] : entry.id === 'undertow-dot' ? [true, true, false] : second ? [true, false, true, false] : [false, true];
    const storm = regime ? regime === 'storm' : sequence[essence.turn % sequence.length];
    const live = createEssence('brine', storm ? 1 : 0, () => fixture.shape, phase);
    Object.assign(essence, { storm, hidden: true, rows: live.rows, archive: live.archive, ghosts: live.ghosts, forecast: live.forecast });
    // Preserve independent archives and expected bands; no common amplitude drift on hidden data.
    essence.rows[0].values = rotate(essence.rows[0].values, shift);
  } else if (entry.zone === 3) {
    const magnitudes = entry.id === 'whisper-knot' ? [1 / 3, 0.5, 0.6] : [1, 1, 1];
    essence.rows.forEach((row, i) => { row.values = rotate(row.values, shift).map(v => v * magnitudes[i] * drift); });
    essence.rows = rotate(essence.rows, fixture.shape);
  } else if (entry.zone === 4 || entry.zone === 5) {
    if (entry.id === 'margin-mote') {
      const amplitudes = essence.inputs[0].map(Math.abs);
      essence.inputs = essence.inputs.map(token => token.map((v, i) => v / (amplitudes[i] ** 2)));
      essence.weights = essence.weights.map((v, i) => v * amplitudes[i] ** 2);
    }
    if (entry.id === 'index-wisp') essence.inputs = essence.inputs.slice(0, 2);
    if (entry.id === 'kiln-cricket' && !second) {
      const old = essence.hotChannels[1];
      const moved = (essence.hotChannels[0] + 7) % 16;
      for (const values of [essence.weights, ...essence.inputs]) [values[old], values[moved]] = [values[moved], values[old]];
      essence.hotChannels[1] = moved;
    }
    const offset = shift + (entry.id === 'kiln-cricket' ? 5 : 0);
    essence.weights = rotate(essence.weights, offset).map(v => v * drift);
    essence.inputs = essence.inputs.map(token => rotate(token, offset).map(v => v / drift));
    essence.hotChannels = essence.hotChannels.map(i => ((i - offset) % 16 + 16) % 16);
    essence.rows = essence.quantizeInputs ? [...essence.inputs.map((values, i) => ({ label: `Token ${i + 1}: A`, values })), { label: 'Library W', values: essence.weights }] : [{ label: 'Hot-channel weights', values: essence.weights }];
  } else {
    essence.rows.forEach(row => { row.values = rotate(row.values, shift).map(v => v * drift); });
    reorderHeads(essence, headOrder(entry.id, second));
  }
  if (warden && second) {
    essence.morphName = 'Second pattern';
    essence.morphHint = [
      'The terraces become a narrow ripple with taller tails, so inspect the new range trade.',
      'The bell now lies below zero, so lock both affine edges around the negative notes.',
      'The weather order changes, so keep using the forecast and the independent archives.',
      'New bends need four-bit steps, so keep a separate ruler for every thread.',
      'The hot pair splits apart, so follow the input heat, not the biggest weight.',
      'Products now have three magnitudes, so keep Balance and try three bits.',
      'The fine-detail head moves with its sensitivity, so move its eight-bit allocation too.',
    ][entry.zone];
  }
  return modifiers(essence, entry, { successes, crosswind, regime });
}

/** Explicit Well modifiers never alter values independently or leak concealed extrema. */
function modifiers(essence, entry, { successes = 0, crosswind = false, regime } = {}) {
  if (entry.zone === 2 && regime && essence.storm !== (regime === 'storm')) {
    const live = createEssence('brine', regime === 'storm' ? 1 : 0, () => 0.5, essence.phase);
    Object.assign(essence, { rows: live.rows, storm: live.storm, forecast: live.forecast });
  }
  if (crosswind && successes >= 2) {
    if (essence.inputs) {
      essence.inputs = essence.inputs.map(token => rotate(token, 5));
      essence.weights = rotate(essence.weights, 5);
      essence.hotChannels = essence.hotChannels.map(i => (i + 11) % 16);
      essence.rows = essence.quantizeInputs ? [...essence.inputs.map((values, i) => ({ label: `Token ${i + 1}: A`, values })), { label: 'Library W', values: essence.weights }] : [{ label: 'Hot-channel weights', values: essence.weights }];
    } else if (essence.sensitivities) reorderHeads(essence, [1, 2, 0]);
    else essence.rows = rotate(essence.rows, 1);
  }
  return essence;
}

export function motifIntendedGear(id, phase = 1, { successes = 0, crosswind = false } = {}) {
  const entry = entryOf(id);
  const gear = intendedGear(`static-${entry.zone}`, phase, { successes });
  // Original practice groups and balance do not morph; their original coarse recipe remains valid.
  if (entry.origin && entry.zone === 3) gear.bits = 3;
  if (entry.origin && entry.zone === 5) gear.bits = 2;
  // The two-token Index Wisp bank retains coarse products in both stages.
  if (id === 'index-wisp') gear.bits = 2;
  if (entry.zone === 6) {
    const order = headOrder(id, successes >= 2, crosswind);
    gear.budget = order.map(i => gear.budget[i]);
  }
  return gear;
}

/** Toy encounter HP at the published run-power benchmark; origins keep their v2 HP. */
export function motifHp(id) {
  const entry = entryOf(id);
  return entry.origin ? null : WARDEN_MOTIFS[id] ? 96 : 45;
}

/** Published intended-play packet par at toy run power 22; byte charge rebates are excluded. */
export function motifPar(id) {
  const entry = entryOf(id);
  const turns = WARDEN_MOTIFS[id] ? 4 : 2;
  const first = entry.zone === 1 && !entry.origin ? 15 : entry.id === 'index-wisp' ? 16 : PACKETS[entry.zone];
  const late = entry.zone === 3 ? 18 : entry.zone === 5 ? 28 : entry.zone === 6 ? 30 : first;
  return { bytes: turns <= 2 ? first * turns : first * 2 + late * (turns - 2), turns };
}
