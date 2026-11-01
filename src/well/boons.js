import { stream, shuffled } from './streams.js';

// Rank descriptions are TOTAL effects. These rules change fictional resources, never packets.
export const WELL_BOONS = Object.freeze([
  ['byte-moss', 'Byte Moss', 'capacity', ['Max charge +8 B; gain 8 B.', 'Max charge +16 B; gain 8 B.']],
  ['stout-lantern', 'Stout Lantern', 'capacity', ['Max HP +8; heal 8 HP.', 'Max HP +16; heal 8 HP.']],
  ['camp-kettle', 'Camp Kettle', 'capacity', ['Ordinary clears heal +3 HP.', 'Ordinary clears heal +6 HP.']],
  ['echo-coil', 'Echo Coil', 'guard', ['PERFECT guard recovers +1 B.', 'PERFECT guard recovers +2 B.']],
  ['soft-shield', 'Soft Shield', 'guard', ['Each hit -1 HP; minimum 1.', 'Each hit -2 HP; minimum 1.']],
  ['steady-ribbon', 'Steady Ribbon', 'economy', ['STEADY lock clock x0.40.', 'STEADY lock clock x0.30.']],
  ['emergency-flask', 'Emergency Flask', 'capacity', ['At <=25% HP: heal 8 once/block.', 'At <=25% HP: heal 12 once/block.']],
  ['pocket-picnic', 'Pocket Picnic', 'capacity', ['SNACK heals +6 HP.', 'SNACK heals +10 HP.']],
  ['first-light', 'First Light', 'economy', ['First non-fizzle cast: +4 B.', 'First non-fizzle cast: +6 B.']],
  ['quiet-reserve', 'Quiet Reserve', 'economy', ['First GUARD: extra +4 B.', 'First GUARD: extra +6 B.']],
  ['clear-bell', 'Clear Bell', 'capacity', ['Warden: extra snack +1; cap 4.', 'Warden: extra snacks +2; cap 5.']],
  ['braced-roots', 'Braced Roots', 'guard', ['GUARD braces next hit x0.45.', 'GUARD braces next hit x0.40.']],
].map(([id, name, role, lines]) => Object.freeze({ id, name, role, lines: Object.freeze(lines) })));
export const boonOf = (id) => WELL_BOONS.find((boon) => boon.id === id) ?? null;
const rank = (run, id) => run.boons[id] ?? 0;
export function boonLimits(run) {
  return { maxHp: 56 + 8 * rank(run, 'stout-lantern'), maxBytes: 56 + 8 * rank(run, 'byte-moss'), power: 22, maxSnacks: 3 + rank(run, 'clear-bell') };
}
export function boonRules(run) {
  const ribbon = rank(run, 'steady-ribbon'), flask = rank(run, 'emergency-flask');
  const picnic = rank(run, 'pocket-picnic'), light = rank(run, 'first-light'), reserve = rank(run, 'quiet-reserve');
  return {
    recharge: 4, perfectGuardBytes: 2 + rank(run, 'echo-coil'), hitReduction: rank(run, 'soft-shield'),
    steadyScale: ribbon ? [0, 0.4, 0.3][ribbon] : 0.5,
    firstCastRebate: [0, 4, 6][light], firstGuardBytes: [0, 4, 6][reserve], snackBonus: [0, 6, 10][picnic],
    braceMultiplier: [0.5, 0.45, 0.4][rank(run, 'braced-roots')],
    emergencyHeal: [0, 8, 12][flask], emergencyUsed: run.emergencyUsed,
  };
}
export function boonOffers(run) {
  const random = stream(run, run.cleared, 'boon-offer');
  const available = WELL_BOONS.filter((boon) => rank(run, boon.id) < 2);
  const chosen = [];
  for (const role of shuffled(['capacity', 'guard', 'economy'], random)) {
    const pool = available.filter((boon) => boon.role === role);
    if (pool.length) chosen.push(pool[Math.floor(random() * pool.length)].id);
  }
  for (const boon of shuffled(available, random)) if (chosen.length < 3 && !chosen.includes(boon.id)) chosen.push(boon.id);
  for (const id of ['rest', 'recharge']) if (chosen.length < 3) chosen.push(id);
  return chosen;
}
export function offerInfo(run, id) {
  if (id === 'rest') return { name: 'Rest', rank: 0, text: 'Heal 6 HP (one use).' };
  if (id === 'recharge') return { name: 'Recharge', rank: 0, text: 'Recover 8 B charge (one use).' };
  const boon = boonOf(id), next = rank(run, id) + 1;
  return { name: boon.name, rank: next, text: boon.lines[next - 1] };
}
/** Commit one choice, once. A full loadout explicitly requires a replacement id. */
export function chooseBoon(run, id, replace = null) {
  if (!run.pendingOffer || (id !== 'skip' && !boonOffers(run).includes(id))) return false;
  if (id !== 'skip' && id !== 'rest' && id !== 'recharge') {
    if (!run.boons[id] && Object.keys(run.boons).length >= 6) {
      if (!Object.hasOwn(run.boons, replace)) return false;
      delete run.boons[replace];
      run.limits = boonLimits(run);
      run.hero.hp = Math.min(run.hero.hp, run.limits.maxHp);
      run.hero.bytes = Math.min(run.hero.bytes, run.limits.maxBytes);
      run.hero.snacks = Math.min(run.hero.snacks, run.limits.maxSnacks);
    }
    run.boons[id] = rank(run, id) + 1;
    run.limits = boonLimits(run);
    if (id === 'stout-lantern') run.hero.hp = Math.min(run.limits.maxHp, run.hero.hp + 8);
    if (id === 'byte-moss') run.hero.bytes = Math.min(run.limits.maxBytes, run.hero.bytes + 8);
  } else if (id === 'rest') run.hero.hp = Math.min(run.limits.maxHp, run.hero.hp + 6);
  else if (id === 'recharge') run.hero.bytes = Math.min(run.limits.maxBytes, run.hero.bytes + 8);
  run.pendingOffer = false;
  return true;
}
