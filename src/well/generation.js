import { ZONES, GUARDIANS, TECHNIQUE_ORDER } from '../content/game-data.js';
import { FOES, attackFor } from '../battle/foes.js';
import { MOTIFS, WARDEN_MOTIFS, createMotifEssence, createWardenEssence } from '../battle/species.js';
import { boonRules } from './boons.js';
import { stream, shuffled, runKey } from './streams.js';

export const WELL_MODIFIERS = Object.freeze([
  { id: 'thin-air', name: 'Thin Air', text: 'Turn recharge +2 B, not +4.' },
  { id: 'crosswind', name: 'Crosswind', text: 'After 2 good casts, paired order shifts.', families: ['groups', 'spotlight', 'balance', 'budget'] },
  { id: 'storm-front', name: 'Storm Front', text: 'Forecast: calm, storm, storm, calm.', families: ['calib'] },
  { id: 'long-echo', name: 'Long Echo', text: 'Non-charge: second hit x0.6 after 0.65s.' },
  { id: 'loaded-satchel', name: 'Loaded Satchel', text: 'This floor: max charge -8 B.' },
  { id: 'warm-current', name: 'Warm Current', text: 'Power +2; clear heals 12/24 HP.' },
].map(Object.freeze));
export function floorStats(depth) {
  const tier = Math.min(6, Math.floor((depth - 1) / 5)), warden = depth % 5 === 0;
  return { tier, warden, hp: Math.round(22 * (warden ? 3 + 0.12 * tier : 1.8 + 0.15 * tier)), power: (warden ? 6 : 4) + tier };
}
/** A whole block is planned together, so the warden counts toward the family balance. */
export function familyBlock(run, block) {
  const eligible = TECHNIQUE_ORDER.filter((family) => run.techniques.includes(family));
  if (!eligible.length) throw new RangeError('A Well run needs a learned family.');
  const rotation = shuffled(eligible, stream(run, 0, 'warden-rotation'));
  const warden = rotation[block % rotation.length];
  if (eligible.length <= 2) {
    const other = eligible.find((family) => family !== warden) ?? warden;
    return [warden, other, warden, other, warden];
  }
  const bag = shuffled(eligible.filter((family) => family !== warden), stream(run, block + 1, 'family-bag'));
  const result = bag.slice(0, 4);
  const counts = Object.fromEntries(eligible.map((family) => [family, Number(family === warden) + result.filter((id) => id === family).length]));
  while (result.length < 4) {
    const next = shuffled(eligible, stream(run, block + 1, 'family-fill', result.length)).sort((a, b) => counts[a] - counts[b])[0];
    result.push(next); counts[next]++;
  }
  return [...result, warden];
}
const identityCache = new WeakMap();
export function floorIdentity(run, depth = run.depth) {
  // Captured unlocks never change during a run. Keep only its current card, not a floor log.
  const cached = identityCache.get(run);
  if (cached?.depth === depth) return cached.card;
  const block = Math.floor((depth - 1) / 5), slot = (depth - 1) % 5;
  const family = familyBlock(run, block)[slot], stats = floorStats(depth);
  const entries = Object.values(stats.warden ? WARDEN_MOTIFS : MOTIFS).filter((entry) => entry.family === family);
  // Species rotate in each family, even when a defensive one-family save is resumed.
  const order = shuffled(entries, stream(run, 0, 'motif-rotation', 0, family));
  let visits = 0;
  for (let b = 0; b <= block; b++) {
    const schedule = familyBlock(run, b);
    for (let s = 0; s < (b === block ? slot : 4); s++) if (schedule[s] === family) visits++;
  }
  const entry = order[stats.warden ? 0 : visits % order.length];
  const modifierSlot = stream(run, block * 5 + 1, 'modifier-slot')() < 0.5 ? 2 : 3;
  let modifier = null;
  if ((!stats.warden && slot === modifierSlot) || (stats.warden && stats.tier >= 1)) {
    const compatible = WELL_MODIFIERS.filter((item) => !item.families || item.families.includes(family));
    // Every budget witness is <=32 B; minimum capacity here is 48 B.
    modifier = compatible[Math.floor(stream(run, depth, 'modifier', 0, family)() * compatible.length)];
  }
  const card = Object.freeze({ depth, block, family, zone: ZONES.find((zone) => zone.technique === family).id, ...stats, name: entry.name, species: entry.id, modifier, golden: stream(run, depth, 'variant', 0, family)() < 1 / 32 });
  identityCache.set(run, { depth, card });
  return card;
}

export function floorDescriptor(run, depth = run.depth) {
  const card = floorIdentity(run, depth), { family, zone, warden, modifier } = card;
  const limits = { ...run.limits }, hero = { ...run.hero }, rules = boonRules(run);
  if (modifier?.id === 'thin-air') rules.recharge = 2;
  if (modifier?.id === 'loaded-satchel') limits.maxBytes -= 8;
  hero.bytes = Math.min(hero.bytes, limits.maxBytes);
  const power = card.power + (modifier?.id === 'warm-current' ? 2 : 0);
  return {
    ...card, power, uid: `well:${runKey(run)}:${depth}`, wardenId: warden ? card.species : null,
    floor: FOES[`static-${zone}`].floor, hero, limits, rules, rulesApplied: ['echoHit', 'attackBonus'],
    techniques: [...run.techniques], friends: [...run.friends],
    essence(turn = 0, _random, phase = 1, options = {}) {
      const random = stream(run, depth, 'essence', turn, family);
      const provider = warden ? createWardenEssence : createMotifEssence;
      const context = { ...options, crosswind: modifier?.id === 'crosswind' };
      if (modifier?.id === 'storm-front') context.regime = ['calm', 'storm', 'storm', 'calm'][((turn % 4) + 4) % 4];
      return provider(card.species, turn, random, phase, context);
    },
    attack(turn = 0, phase = 1) {
      const id = warden ? GUARDIANS[zone].key : `static-${zone}`;
      const beat = turn + Math.floor(stream(run, depth, 'attacks', 0, family)() * 4);
      const attack = attackFor(id, beat, phase);
      const basePower = FOES[id].power + (zone === 6 && phase >= 2 ? 1 : 0);
      const delta = power - basePower;
      const hits = attack.hits.map((hit) => Math.max(1, hit + delta * (attack.charge ? 2 : 1)));
      const result = { ...attack, telegraph: attack.telegraph.replace(FOES[id].name, card.name), hits, gaps: [...attack.gaps] };
      if (modifier?.id === 'long-echo' && !attack.charge) {
        result.hits = [hits[0], Math.ceil(hits[0] * 0.6)];
        result.gaps = [attack.gaps[0], 0.65];
        result.telegraph = 'Long Echo: two rings; the second follows after 0.65s.';
      }
      return result;
    },
  };
}
