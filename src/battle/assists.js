import { GUARDIANS, BIT_CHOICES } from '../content/game-data.js';
import { affineParams } from '../quantization.js';
import { buildSpell, defaultLocks, rangeTargets } from './spell.js';

export const ASSISTS = Object.freeze(Object.fromEntries([
  ['nib', 'Cover the Wave', 'Cover one visible symmetric ruler; you choose bits.', 'bits', 'Nib: Room for the wave, not every possible decimal.'],
  ['chime', 'Zero Anchor', 'Anchor one low edge; you lock high.', 'zero', 'Chime: Zero is home; give the bell room to ring.'],
  ['brine', 'Archive Echo', 'Choose a public archive, not the hidden live wave.', 'calib', 'Brine: Yesterday’s tide is a guide, not a promise.'],
  ['spindle', 'Mind the Whisper', 'Cover one row; other rulers stay yours.', 'groups', 'Spindle: A whisper deserves its own shelves.'],
  ['cinder', 'Hot Lantern', 'Protect one hot input weight; pay its +3 B.', 'spotlight', 'Cinder: Follow the input heat, not the biggest weight.'],
  ['vesper', 'Paired Shelves', 'Set alpha 0.5; you lock both tensors.', 'balance', 'Vesper: Same raw product, different rounding shelves.'],
  ['auric', 'Packet Sketch', 'Choose a ceiling, review bits, lock all rulers.', 'budget', 'Auric: Each head earns its bits through its error.'],
].map(([key, name, short, technique, coaching]) => [key, Object.freeze({ name, short, technique, coaching })])));
export function friendKeys(friends = []) {
  return friends.map(friend => typeof friend === 'number' ? GUARDIANS[friend]?.key : friend).filter(key => ASSISTS[key]);
}
export function assistAvailability(key, battle) {
  const assist = ASSISTS[key];
  const no = reason => ({ ok: false, reason });
  if (!assist) return no('Unknown friend.');
  if (battle.mode === 'duel') return no('Fen’s duels are yours alone.');
  if (!friendKeys(battle.friends ?? battle.game.state.friends).includes(key)) return no('Befriend this guardian first.');
  if (!battle.techniques.includes(assist.technique)) return no('Learn ' + assist.technique + ' first.');
  if (battle.assistsUsed?.includes(key)) return no('This friend already helped this battle.');
  const essence = battle.essence;
  if (key === 'brine') return essence.hidden && essence.archive ? { ok: true, reason: '' } : no('Archive Echo needs a hidden wave with public archives.');
  if (essence.hidden) return no('This assist cannot inspect hidden live values.');
  if (key === 'nib' && (battle.phase === 'friends' ? battle.assistGear ?? battle.gear : battle.gear).zero) return no('Cover the Wave needs a symmetric ruler.');
  if (key === 'spindle' && essence.rows.length < 2) return no('Mind the Whisper needs multiple visible rows.');
  if ((key === 'cinder' || key === 'vesper') && !essence.inputs?.length) return no('This assist needs visible input channels.');
  if (key === 'vesper' && essence.quantizeInputs !== true) return no('Paired Shelves needs both inputs and weights to be rounded.');
  if (key === 'auric' && (!essence.sensitivities || essence.rows.length !== 3)) return no('Packet Sketch needs three sensitivity heads.');
  if (key === 'auric' && (![20, 24, 28, 32, 40].includes(battle.assistChoice?.ceiling ?? 32) || (battle.assistChoice?.ceiling ?? 32) > battle.hero.bytes)) return no('Choose an affordable 20/24/28/32/40 B ceiling.');
  if (key === 'auric' && !suggestBudget(battle, battle.assistChoice?.ceiling ?? 32)) return no('No covering packet fits this affordable ceiling.');
  return { ok: true, reason: '' };
}
const budgetPlans = new WeakMap();
/** Exhaustive bounded planner. All scores and bytes come from buildSpell. */
export function suggestBudget(battle, ceiling) {
  const cap = Math.min(ceiling, battle.hero.bytes);
  const g = battle.phase === 'friends' ? battle.assistGear ?? battle.gear : battle.gear;
  const signature = [g.bits, g.zero, g.groups, g.spotlight, g.balance, g.calib].join('/');
  let cache = budgetPlans.get(battle);
  if (!cache || cache.essence !== battle.essence || cache.signature !== signature) {
    cache = { essence: battle.essence, signature, caps: new Map() };
    budgetPlans.set(battle, cache);
  }
  if (cache.caps.has(cap)) return cache.caps.get(cap);
  let best = null;
  for (const a of BIT_CHOICES) for (const b of BIT_CHOICES) for (const c of BIT_CHOICES) {
    const bits = [a, b, c];
    const gear = { ...g, budget: bits };
    const locks = defaultLocks(battle.essence, gear);
    const spell = buildSpell(battle.essence, gear, locks, battle.limits.power, battle.foe.floor);
    if (spell.cost > cap) continue;
    if (!best || spell.fidelity > best.fidelity + 1e-12 || (Math.abs(spell.fidelity - best.fidelity) <= 1e-12 && (spell.cost < best.cost || (spell.cost === best.cost && bits.join('') < best.bits.join(''))))) best = { bits, cost: spell.cost, fidelity: spell.fidelity };
  }
  cache.caps.set(cap, best);
  return best;
}
/** Idempotent partial preparation; callers reset locks first, then skip completed steps only. */
export function applyAssist(key, battle) {
  const available = assistAvailability(key, battle);
  if (!available.ok) return available;
  const { gear, locks, essence } = battle;
  const choice = battle.assistChoice ?? {};
  const plan = { completed: [], line: ASSISTS[key].short };
  if (key === 'chime') gear.zero = true;
  if (key === 'spindle') gear.groups = true;
  if (key === 'brine') {
    // Archive Echo must not even inspect the concealed live row.
    gear.calib = true; gear.zero = false;
    const archive = choice.archive === 'storm' ? 'storm' : 'calm';
    locks.ranges[0] = Math.max(...essence.archive[archive].map(Math.abs));
    plan.group = 0;
    plan.completed.push({ kind: 'r', group: 0 });
    plan.line = archive + ' archive peak ±' + locks.ranges[0] + '; the live wave stays hidden.';
    battle.assistPlan = plan;
    return { ok: true, reason: '', ...plan };
  }
  if (key === 'cinder') {
    gear.spotlight = Math.max(1, gear.spotlight);
    const heat = essence.weights.map((_, i) => Math.max(...essence.inputs.map(row => Math.abs(row[i] ?? 0))));
    const channel = heat.indexOf(Math.max(...heat));
    const manual = battle.assistPlan?.channel === channel ? locks.protected ?? [] : [];
    locks.protected = [channel, ...manual.filter(i => i !== channel)].slice(0, gear.spotlight);
    plan.channel = channel;
    plan.line = 'Hot Lantern keeps channel ' + (channel + 1) + ' · +3 B metadata.';
  }
  if (key === 'vesper') { gear.balance = true; locks.alpha = 0.5; plan.alpha = true; plan.line = 'α = 0.5 · a·w = (a/s)(s·w) before rounding.'; }
  if (key === 'auric') {
    const suggestion = suggestBudget(battle, choice.ceiling ?? 32);
    gear.budget = [...suggestion.bits];
    const covering = defaultLocks(essence, gear);
    locks.ranges = covering.ranges; locks.lows = covering.lows; locks.highs = covering.highs;
    plan.suggestion = suggestion;
    plan.line = suggestion.bits.join('/') + ' bits · ' + suggestion.cost + ' B under ' + (choice.ceiling ?? 32) + ' B ceiling; you lock every ruler.';
  }
  const targets = rangeTargets(essence, gear, locks);
  let group = Math.min(choice.group ?? 0, targets.length - 1);
  if (key === 'spindle' && choice.group === undefined) group = targets.reduce((smallest, target, i) => target.amax < targets[smallest].amax ? i : smallest, 0);
  plan.group = group;
  if (key === 'nib' || key === 'spindle') {
    plan.line = targets[group].label + ' covered at ±' + targets[group].amax.toFixed(3) + '. Bits and other rulers stay yours.';
    if (gear.zero) {
      locks.lows[group] = Math.min(0, targets[group].min);
      locks.highs[group] = Math.max(0, targets[group].max);
      plan.completed.push({ kind: 'lo', group }, { kind: 'hi', group });
    } else {
      locks.ranges[group] = targets[group].amax || 1;
      plan.completed.push({ kind: 'r', group });
    }
  }
  if (key === 'chime') {
    locks.lows[group] = Math.min(0, targets[group].min);
    const params = affineParams(locks.lows[group], Math.max(0, targets[group].max), gear.bits);
    plan.completed.push({ kind: 'lo', group });
    plan.line = 'Zero Anchor low ' + locks.lows[group].toFixed(3) + ' · z=' + params.zero + '. You lock high.';
  }
  battle.assistPlan = plan;
  return { ok: true, reason: '', ...plan };
}
