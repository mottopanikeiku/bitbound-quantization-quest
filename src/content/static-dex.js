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

export const SPECIES = Object.freeze(
  ROSTER.flatMap((row, zone) => [0, 2, 4].map((i) => Object.freeze({
    id: row[i],
    zone,
    family: ZONES[zone].technique,
    name: row[i + 1],
    origin: i === 0,
    lines: Object.freeze([]),
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
].map(([id, name], zone) => Object.freeze({ id, zone, family: ZONES[zone].technique, name, lines: Object.freeze([]) })));

const BY_ID = new Map([...SPECIES, ...WARDENS].map((entry) => [entry.id, entry]));

/** Species or warden by id, or null. */
export function dexEntryOf(id) {
  return BY_ID.get(id) ?? null;
}

/** The zone's original staticling species id (its v2 foe id is `static-${zone}`). */
export function originSpecies(zone) {
  return SPECIES.find((species) => species.zone === zone && species.origin)?.id ?? null;
}
