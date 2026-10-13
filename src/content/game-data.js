// Shared, stable game identity data. Mechanics live in battle/, places in world/.

export const HUB = Object.freeze({ key: 'point', name: 'Lighthouse Point', biome: 'point' });

export const ZONES = Object.freeze([
  { id: 0, key: 'meadow', name: 'Bitleaf Meadow', biome: 'meadow', guardian: 0, technique: 'bits', corruptBits: 4 },
  { id: 1, key: 'grove', name: 'Offset Grove', biome: 'grove', guardian: 1, technique: 'zero', corruptBits: 4 },
  { id: 2, key: 'cove', name: 'Calibration Cove', biome: 'cove', guardian: 2, technique: 'calib', corruptBits: 3 },
  { id: 3, key: 'heights', name: 'Channel Heights', biome: 'heights', guardian: 3, technique: 'groups', corruptBits: 3 },
  { id: 4, key: 'forge', name: 'Inference Forge', biome: 'forge', guardian: 4, technique: 'spotlight', corruptBits: 3 },
  { id: 5, key: 'archives', name: 'Outlier Archives', biome: 'archives', guardian: 5, technique: 'balance', corruptBits: 2 },
  { id: 6, key: 'spire', name: 'Precision Spire', biome: 'spire', guardian: 6, technique: 'budget', corruptBits: 2 },
].map(Object.freeze));

export const GUARDIANS = Object.freeze([
  { id: 0, key: 'nib', name: 'Nib', species: 'sprout', zone: 0, title: 'the Bitleaf Sprout', color: '#82b84f' },
  { id: 1, key: 'chime', name: 'Chime', species: 'crystal', zone: 1, title: 'the Crooked Chime', color: '#72d6bc' },
  { id: 2, key: 'brine', name: 'Brine', species: 'tide', zone: 2, title: 'the Tide Keeper', color: '#5cb4d8' },
  { id: 3, key: 'spindle', name: 'Spindle', species: 'moth', zone: 3, title: 'the Thread Weaver', color: '#c79ae6' },
  { id: 4, key: 'cinder', name: 'Cinder', species: 'ember', zone: 4, title: 'the Kiln Keeper', color: '#fb9433' },
  { id: 5, key: 'vesper', name: 'Vesper', species: 'wisp', zone: 5, title: 'the Ink Wisp', color: '#a66dd2' },
  { id: 6, key: 'auric', name: 'Auric', species: 'dragon', zone: 6, title: 'the Precision Wyrm', color: '#f9d65a' },
].map(Object.freeze));

export const TECHNIQUE_ORDER = Object.freeze(['bits', 'zero', 'calib', 'groups', 'spotlight', 'balance', 'budget']);

export const TECHNIQUES = Object.freeze({
  bits: { id: 'bits', name: 'Bit Dial', short: 'Choose 2, 3, 4 or 8 bits and lock the range.', icon: 'bits' },
  zero: { id: 'zero', name: 'Zero-Shift', short: 'Slide the grid with a zero-point: lock low, then high.', icon: 'zero' },
  calib: { id: 'calib', name: 'Tide Gauge', short: 'Read past samples to choose a range before new data arrives.', icon: 'calib' },
  groups: { id: 'groups', name: 'Group Rulers', short: 'Give each group of values its own scale.', icon: 'groups' },
  spotlight: { id: 'spotlight', name: 'Spotlight', short: 'Keep the few values that matter most in 16-bit.', icon: 'spotlight' },
  balance: { id: 'balance', name: 'Balance', short: 'Move range between activations and weights.', icon: 'balance' },
  budget: { id: 'budget', name: 'Bit Budget', short: 'Spend different bits on different layers.', icon: 'budget' },
});

export const BIT_CHOICES = Object.freeze([2, 3, 4, 8]);

/** Derived hero stats; every number here is a fictional game rule. */
export function heroStats(state) {
  const friends = state.friends.length;
  const shards = state.shards.length;
  return {
    maxHp: 40 + 8 * friends,
    maxBytes: 40 + 8 * friends + 16 * Math.floor(shards / 8),
    power: 16 + 3 * friends,
    maxSnacks: 5,
  };
}
