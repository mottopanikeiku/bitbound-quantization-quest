// Static-dex identity: 21 staticling species (three per zone, one numerical motif each) and the
// seven wardens of the Static Well. Ids are stable save keys shared by battle, world, art and Journal.
// Each species: { id, zone, family (technique id), name, origin, lines: [two flavour sentences] }.
// `origin` marks the zone's original v2 staticling, whose motif is createEssence(`static-${zone}`).
import { ZONES } from './game-data.js';

const ROSTER = [
  ['bit-sprig', 'Bit Sprig', 'stepbud', 'Stepbud', 'ripple-seed', 'Ripple Seed'],
  ['offbeat-shard', 'Offbeat Shard', 'crooked-pebble', 'Crooked Pebble', 'lantern-sliver', 'Lantern Sliver'],
  ['ripple-static', 'Ripple Static', 'foam-flicker', 'Foam Flicker', 'undertow-dot', 'Undertow Dot'],
  ['loose-thread', 'Loose Thread', 'whisper-knot', 'Whisper Knot', 'loomlet', 'Loomlet'],
  ['coal-fleck', 'Coal Fleck', 'kiln-cricket', 'Kiln Cricket', 'ember-chip', 'Ember Chip'],
  ['ink-blot', 'Ink Blot', 'margin-mote', 'Margin Mote', 'index-wisp', 'Index Wisp'],
  ['scale-spark', 'Scale Spark', 'crown-crumb', 'Crown Crumb', 'prism-pip', 'Prism Pip'],
];

const FLAVOUR = {
  'bit-sprig': ['It combs its leaf into a wave and calls that gardening.', 'Four-bit steps fit its toy wave without paying for eight-bit slots.'],
  stepbud: ['It builds terraces, then complains that the stairs are too tidy.', 'Its symmetric terraces need a ruler wide enough for both signs.'],
  'ripple-seed': ['It packs two tall tails for a very small pond.', 'Its central values and taller tails make clipping a visible range trade.'],
  'offbeat-shard': ['It hums on the sunny side of zero and misses every downbeat.', 'A shifted four-bit grid fits its sixteen one-sided levels.'],
  'crooked-pebble': ['It insists downhill is the polite direction to roll.', 'Its negative bell uses an integer zero-point on an affine grid.'],
  'lantern-sliver': ['It lights both sides of the path, mostly by accident.', 'Its two-sided interval has a four-bit integer zero-point witness.'],
  'ripple-static': ['It brings a weather report to every puddle party.', 'Its forecast guides a range choice from independent calm and storm archives.'],
  'foam-flicker': ['It practises calm breathing until one enormous sneeze.', 'Its mostly calm sequence still needs a wide ruler for the forecast storm.'],
  'undertow-dot': ['It orders two storms and a calm to take away.', 'Its hidden live values differ from the public historical samples.'],
  'loose-thread': ['It trails three scarves and pretends this was intentional.', 'Separate rulers let each toy thread keep its own small steps.'],
  'whisper-knot': ['Its quietest scarf is also its proudest.', 'Its tiny third thread needs its own scale, not the loudest thread’s ruler.'],
  loomlet: ['It learns a new bend and immediately shows everyone twice.', 'After two successful casts its bent threads need finer steps.'],
  'coal-fleck': ['It heats the kettle through two suspiciously tidy sparks.', 'Protecting weights at hot input channels preserves its toy dot products.'],
  'kiln-cricket': ['It chirps from opposite corners of the same furnace.', 'Its hot input pair stays paired with the corresponding weights when reordered.'],
  'ember-chip': ['It wears its biggest weights as cold, impressive earrings.', 'Its largest weights are not its hottest input channels.'],
  'ink-blot': ['It shelves ink by height and books by inverse height.', 'Paired rescaling preserves raw products before both tensors are rounded.'],
  'margin-mote': ['It swaps the tall shelf and the tiny shelf to feel adventurous.', 'Its opposing activation and weight scales can be balanced before rounding.'],
  'index-wisp': ['It files two bookmarks under one enormous book.', 'Two input tokens share weights, and both inputs are quantized.'],
  'scale-spark': ['It gives the crown pocket most of its suitcase.', 'Its declared head sensitivities weight reconstruction error in the toy metric.'],
  'crown-crumb': ['It calls the expensive pocket a very small royal treasury.', 'Fine detail in the sensitive head benefits from a nonuniform bit allocation.'],
  'prism-pip': ['It unfolds a wing only after checking that everyone is watching.', 'Its middle head gains levels after two successes and needs another bit.'],
  'root-raster': ['It grows staircases underground and never installs a handrail.', 'Its second shape changes the range trade without changing the damage floor.'],
  'offbeat-bell': ['It rings below zero just to surprise the choir.', 'Its shifted grid keeps real zero representable with an integer zero-point.'],
  'undertow-ledger': ['It records every storm under miscellaneous splashes.', 'A regime forecast names weather, not hidden live extrema.'],
  'loom-of-three': ['It weaves three cloaks and refuses to share a measuring tape.', 'Every independent thread must survive its own quantization error.'],
  'furnace-witness': ['It takes furnace attendance by counting the hottest sparks.', 'Its moved hot channels still contribute through paired input-weight products.'],
  'index-shade': ['It haunts only libraries with uneven shelving.', 'Balancing preserves unrounded products, not automatically rounded outputs.'],
  'crown-allocator': ['It changes pockets halfway through every royal inspection.', 'Its sensitivity follows the head when the fine-detail head changes position.'],
};

export const SPECIES = Object.freeze(
  ROSTER.flatMap((row, zone) => [0, 2, 4].map((i) => Object.freeze({
    id: row[i],
    zone,
    family: ZONES[zone].technique,
    name: row[i + 1],
    origin: i === 0,
    lines: Object.freeze(FLAVOUR[row[i]]),
  }))),
);

export const WARDENS = Object.freeze([
  ['root-raster', 'Root Raster'],
  ['offbeat-bell', 'Offbeat Bell'],
  ['undertow-ledger', 'Undertow Ledger'],
  ['loom-of-three', 'Loom of Three'],
  ['furnace-witness', 'Furnace Witness'],
  ['index-shade', 'Index Shade'],
  ['crown-allocator', 'Crown Allocator'],
].map(([id, name], zone) => Object.freeze({ id, zone, family: ZONES[zone].technique, name, lines: Object.freeze(FLAVOUR[id]) })));

const BY_ID = new Map([...SPECIES, ...WARDENS].map((entry) => [entry.id, entry]));

/** Species or warden by id, or null. */
export function dexEntryOf(id) {
  return BY_ID.get(id) ?? null;
}

/** The zone's original staticling species id (its v2 foe id is `static-${zone}`). */
export function originSpecies(zone) {
  return SPECIES.find((species) => species.zone === zone && species.origin)?.id ?? null;
}
