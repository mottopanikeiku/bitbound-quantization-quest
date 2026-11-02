// Bounded, saveable Journal state. Only resolved gameplay events qualify a fight.
import { GUARDIANS, TECHNIQUE_ORDER } from '../content/game-data.js';
import { SPECIES, WARDENS } from '../content/static-dex.js';
import { INTERACTABLES } from '../world/map.js';
export { SPECIES };

export const BADGES = Object.freeze([
  ['first-friend', 'First Colour', 'Befriend Nib.'],
  ['seven-friends', 'Homeward Circle', 'Befriend all seven guardians.'],
  ['first-perfect', 'Clear as a Bell', 'Win with a resolved PERFECT cast.'],
  ['three-casts', 'Three Clean Notes', 'Win with three consecutive PERFECT casts; non-cast actions do not reset the chain.'],
  ['guard-triad', 'Ring Reader', 'Win with three PERFECT guard beats.'],
  ['recovery', 'Better Next Time', 'Win after a fizzle followed immediately by a non-fizzle cast with every fidelity at least 95%.'],
  ['bit-fit', 'Just Enough Shelves', 'Win a Bit Dial fight: 4 bits, no Zero-Shift or groups, F ≥98.5%, no clipping, packet ≤10 B.'],
  ['zero-fit', 'Give Zero a Home', 'Win a Zero-Shift fight: shifted 4-bit cast, F ≥98.5%, packet ≤11 B.'],
  ['tide-fit', 'Weather Eye', 'Win a Tide Gauge fight: calm and storm casts each F ≥97%, ≤4 bits, no clipping, packet ≤10 B.'],
  ['group-fit', 'Every Thread Matters', 'Win a Group Rulers fight: groups on, ≤4 bits, all three threads ≥98.5%, packet ≤18 B.'],
  ['spotlight-fit', 'Hot-Channel Keeper', 'Win a Spotlight fight: protect two hot channels, 2 bits, output F ≥98.5%, packet ≤12 B.'],
  ['balance-fit', 'Equal Exchange', 'Win a Balance fight: balance and input quantization on, ≤3 bits, output F ≥98.5%, packet ≤28 B.'],
  ['budget-fit', 'Small Crown', 'Win a Bit Budget fight: per-head allocation with different widths, F ≥98.5%, packet ≤32 B.'],
  ['seven-bridges', 'Side-Trail Engineer', 'Solve all seven authored Snap Bridges.'],
  ['sixteen-shards', 'Two Whole Bytes', 'Collect all sixteen island shards.'],
  ['eight-camps', 'Hearthfinder', 'Rest at all eight island camps.'],
  ['dex-complete', 'Static Naturalist', 'Resolve all 21 species, though golden portraits are optional.'],
  ['fen-three', 'Smaller Satchel', 'Win all three Fen Float duels.'],
  ['well-five', 'First Descent', 'Clear B5 in one Well expedition.'],
  ['well-fifteen', 'Lantern Below', 'Clear B15 in one Well expedition.'],
].map(([id, name, text]) => Object.freeze({ id, name, text, icon: id })));
export const HATS = Object.freeze([
  ['lantern-cap', 'Lantern Cap', 'Clear Well B5.', 5],
  ['static-hood', 'Static Hood', 'Clear Well B10.', 10],
  ['crown-of-levels', 'Crown of Levels', 'Clear Well B15.', 15],
  ['oracle-halo', 'Oracle Halo', 'Clear Well B20.', 20],
  ['fen-scarf', 'Fen Scarf', 'Win all three Fen duels.', null],
  ['naturalist-cap', 'Naturalist Cap', 'Resolve all 21 species.', null],
].map(([id, name, text, depth]) => Object.freeze({ id, name, text, depth })));
export const GRADE_ORDER = Object.freeze(['C', 'B', 'A', 'S']);
export const DUEL_IDS = Object.freeze(['fen-offset', 'fen-hot', 'fen-crown']);
export const ISLAND_IDS = Object.freeze(Object.fromEntries(['shard', 'cache', 'puzzle', 'camp'].map(kind => [kind, Object.freeze(INTERACTABLES.filter(i => i.interaction === kind).map(i => i.id))])));
const COUNTERS = ['casts', 'perfects', 'fizzles', 'perfectGuards', 'maxResonance', 'assists', 'goldens', 'wins'];
const FIGHT_FLAGS = ['first-perfect', 'three-casts', 'recovery', 'bit-fit', 'zero-fit', 'group-fit', 'spotlight-fit', 'balance-fit', 'budget-fit'];
const MODES = ['campaign', 'practice', 'duel', 'well'];
const RECORD_IDS = [...GUARDIANS.map(g => g.key), ...SPECIES.map(s => s.id), ...GUARDIANS.map(g => `static-${g.zone}`)];
const whole = (v, max = 1e9) => Number.isFinite(v) ? Math.max(0, Math.min(max, Math.trunc(v))) : 0;
const unit = v => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
const packet = v => Number.isFinite(v) && v > 0 ? Math.min(1e6, v) : null;
const memberCount = (list, ids) => ids.filter(id => Array.isArray(list) && list.includes(id)).length;
const all = (list, ids) => memberCount(list, ids) === ids.length;
const freshEntry = () => ({ seen: false, resolved: false, mastered: false, goldenSeen: false, golden: false, cleared: 0, bestFidelity: 0, smallestPacket: null, metric: 'values' });
export function newProgress() {
  return { badges: [], dex: {}, wardens: {}, records: {}, duels: {}, well: { best: 0, bestScore: 0, bestRatio: 0, runs: 0, floors: 0, lastSeed: null, lastVersion: null, records: [] }, counters: Object.fromEntries(COUNTERS.map(k => [k, 0])), fight: null };
}
function wellRecord(value) {
  if (!value || typeof value.key !== 'string' || value.key.length > 160) return null;
  const [version, seed, tools, ...extra] = value.key.split(':');
  if (extra.length || !/^[1-9][0-9]{0,3}$/.test(version) || !/^[0-9A-F]{8}$/.test(seed)) return null;
  const techniques = tools?.split(',') ?? [];
  if (!techniques.length || TECHNIQUE_ORDER.filter(id => techniques.includes(id)).join(',') !== tools) return null;
  return { key: value.key, depth: whole(value.depth, 9999), score: whole(value.score), bestRatio: Number.isFinite(value.bestRatio) ? Math.max(0, Math.min(10000, value.bestRatio)) : 0 };
}
function cleanFight(f) {
  if (!f || !MODES.includes(f.mode) || ![...RECORD_IDS, ...WARDENS.map(w => w.id), 'fen'].includes(f.foeId)) return null;
  return { foeId: f.foeId, species: [...SPECIES, ...WARDENS].some(s => s.id === f.species) ? f.species : null, mode: f.mode, duel: DUEL_IDS.includes(f.duel) ? f.duel : null, golden: f.golden === true, casts: whole(f.casts, 1e6), bytes: whole(f.bytes), perfectChain: whole(f.perfectChain, 3), perfectGuards: whole(f.perfectGuards, 3), previousFizzle: f.previousFizzle === true, calm: f.calm === true, storm: f.storm === true, bestFidelity: unit(f.bestFidelity), mastered: f.mastered === true, smallestPacket: packet(f.smallestPacket), smallestAcceptedPacket: packet(f.smallestAcceptedPacket), metric: ['values', 'outputs', 'weighted'].includes(f.metric) ? f.metric : 'values', assisted: f.assisted === true, flags: FIGHT_FLAGS.filter(id => Array.isArray(f.flags) && f.flags.includes(id)) };
}
/** Treat save data as untrusted. Unknown ids and unbounded logs never survive. */
export function sanitizeProgress(saved) {
  const p = newProgress();
  if (!saved || typeof saved !== 'object') return p;
  p.badges = BADGES.filter(b => Array.isArray(saved.badges) && saved.badges.includes(b.id)).map(b => b.id);
  for (const [key, roster] of [['dex', SPECIES], ['wardens', WARDENS]]) for (const s of roster) {
    const e = saved[key]?.[s.id];
    if (!e || typeof e !== 'object') continue;
    const resolved = e.resolved === true || whole(e.cleared) > 0 || e.mastered === true || e.golden === true || whole(e.golden) > 0;
    p[key][s.id] = { seen: e.seen === true || resolved || e.goldenSeen === true, resolved, mastered: e.mastered === true, goldenSeen: e.goldenSeen === true || e.golden === true || whole(e.golden) > 0, golden: e.golden === true || whole(e.golden) > 0, cleared: Math.max(resolved ? 1 : 0, whole(e.cleared)), bestFidelity: unit(e.bestFidelity), smallestPacket: packet(e.smallestPacket), metric: ['values', 'outputs', 'weighted'].includes(e.metric) ? e.metric : 'values' };
  }
  for (const id of RECORD_IDS) {
    const r = saved.records?.[id];
    if (!r || !GRADE_ORDER.includes(r.grade)) continue;
    p.records[id] = { grade: r.grade, score: whole(r.score, 100), turns: whole(r.turns, 1e6), bytes: whole(r.bytes), fidelity: unit(r.fidelity), assisted: r.assisted === true, fewestTurns: r.fewestTurns && GRADE_ORDER.includes(r.fewestTurns.grade) ? { turns: whole(r.fewestTurns.turns, 1e6), grade: r.fewestTurns.grade } : null, fewestBytes: r.fewestBytes && GRADE_ORDER.includes(r.fewestBytes.grade) ? { bytes: whole(r.fewestBytes.bytes), grade: r.fewestBytes.grade } : null };
  }
  for (const id of DUEL_IDS) {
    const d = saved.duels?.[id];
    if (d && typeof d === 'object') p.duels[id] = { won: d.won === true, fewestCasts: whole(d.fewestCasts, 1e6) || null, smallestAcceptedPacket: packet(d.smallestAcceptedPacket) };
  }
  p.well = { best: whole(saved.well?.best, 9999), bestScore: whole(saved.well?.bestScore), runs: whole(saved.well?.runs), floors: whole(saved.well?.floors), lastSeed: Number.isInteger(saved.well?.lastSeed) && saved.well.lastSeed >= 0 && saved.well.lastSeed <= 0xffffffff ? saved.well.lastSeed : null, lastVersion: whole(saved.well?.lastVersion, 9999) || null };
  p.well.bestRatio = Number.isFinite(saved.well?.bestRatio) ? Math.max(0, Math.min(10000, saved.well.bestRatio)) : 0;
  p.well.records = Array.isArray(saved.well?.records) ? saved.well.records.slice(0, 24).map(wellRecord).filter((r, i, list) => r && list.findIndex(other => other?.key === r.key) === i) : [];
  for (const k of COUNTERS) p.counters[k] = whole(saved.counters?.[k], k === 'maxResonance' ? 4 : 1e9);
  p.fight = cleanFight(saved.fight);
  return p;
}
function entryFor(p, id) {
  const key = SPECIES.some(s => s.id === id) ? 'dex' : WARDENS.some(s => s.id === id) ? 'wardens' : null;
  if (!key) return null;
  return p[key][id] ??= freshEntry();
}
function castInto(f, e) {
  const gear = e.gear ?? {}, bits = e.bits, cost = packet(e.cost), threads = e.threadFidelities;
  const fidelity = Number.isFinite(e.fidelity) ? unit(e.fidelity) : 0;
  const minimum = Array.isArray(threads) && threads.length ? Math.min(fidelity, ...threads.map(unit)) : fidelity;
  const good = target => !e.fizzle && minimum >= target;
  const flag = id => { if (!f.flags.includes(id)) f.flags.push(id); };
  f.casts = Math.min(1e6, f.casts + 1); f.bytes = Math.min(1e9, f.bytes + (cost ?? 0));
  f.assisted ||= Boolean(e.assisted);
  f.bestFidelity = Math.max(f.bestFidelity, minimum); f.mastered ||= good(.985);
  if (good(0) && cost) f.smallestPacket = Math.min(f.smallestPacket ?? Infinity, cost);
  if (['values', 'outputs', 'weighted'].includes(e.metric)) f.metric = e.metric;
  if (e.perfect === true) { flag('first-perfect'); f.perfectChain = Math.min(3, f.perfectChain + 1); if (f.perfectChain === 3) flag('three-casts'); } else f.perfectChain = 0;
  if (f.previousFizzle && good(.95)) flag('recovery');
  f.previousFizzle = e.fizzle === true;
  if (!cost) return;
  if (e.family === 'bits' && bits === 4 && gear.zero === false && gear.groups === false && good(.985) && cost <= 10 && e.clipped === 0) flag('bit-fit');
  if (e.family === 'zero' && gear.zero === true && bits === 4 && good(.985) && cost <= 11) flag('zero-fit');
  if (e.family === 'calib' && bits <= 4 && bits >= 2 && good(.97) && cost <= 10 && e.clipped === 0) { if (e.regime === 'calm') f.calm = true; if (e.regime === 'storm') f.storm = true; }
  if (e.family === 'groups' && gear.groups === true && bits <= 4 && bits >= 2 && Array.isArray(threads) && threads.length === 3 && good(.985) && cost <= 18) flag('group-fit');
  const protectedHot = e.protectedHotChannels ?? (Array.isArray(e.protectedChannels) && Array.isArray(e.hotChannels) ? new Set(e.protectedChannels.filter(i => e.hotChannels.includes(i))).size : 0);
  if (e.family === 'spotlight' && protectedHot === 2 && bits === 2 && e.metric === 'outputs' && good(.985) && cost <= 12) flag('spotlight-fit');
  if (e.family === 'balance' && gear.balance === true && bits <= 3 && bits >= 2 && e.quantizeInputs === true && e.metric === 'outputs' && good(.985) && cost <= 28) flag('balance-fit');
  if (e.family === 'budget' && Array.isArray(gear.budget) && gear.budget.length === 3 && gear.budget.every(b => [2, 3, 4, 8].includes(b)) && new Set(gear.budget).size >= 2 && good(.985) && cost <= 32) flag('budget-fit');
  const cap = { 'fen-offset': 11, 'fen-hot': 12, 'fen-crown': 32 }[f.duel];
  if (f.mode === 'duel' && good(.985) && cost <= cap) f.smallestAcceptedPacket = Math.min(f.smallestAcceptedPacket ?? Infinity, cost);
}
function recordWin(p, f, e) {
  const grade = e.grade;
  if (!GRADE_ORDER.includes(grade?.letter) || !RECORD_IDS.includes(e.foeId) || !['campaign', 'practice'].includes(f.mode)) return;
  const r = p.records[e.foeId], turns = whole(e.stats?.turns, 1e6), bytes = whole(e.stats?.packetBytes ?? f.bytes);
  const fresh = { grade: grade.letter, score: whole(grade.score, 100), turns, bytes, fidelity: unit(grade.fidelity), assisted: f.assisted || Boolean(e.assists?.length) };
  const better = !r || GRADE_ORDER.indexOf(fresh.grade) > GRADE_ORDER.indexOf(r.grade) || (fresh.grade === r.grade && fresh.score > r.score);
  p.records[e.foeId] = { ...(better ? fresh : r), fewestTurns: !r?.fewestTurns || turns < r.fewestTurns.turns ? { turns, grade: fresh.grade } : r.fewestTurns, fewestBytes: !r?.fewestBytes || bytes < r.fewestBytes.bytes ? { bytes, grade: fresh.grade } : r.fewestBytes };
}
/** A battle end consumes its saved aggregate once; earned badge ids never re-award. */
export function applyEvent(p, e, { state = {} } = {}) {
  if (!e || typeof e !== 'object') return [];
  const earned = [];
  const award = id => { if (!p.badges.includes(id)) { p.badges.push(id); earned.push(id); } };
  const c = p.counters;
  if (e.type === 'seen' || e.type === 'battle-start') {
    const entry = entryFor(p, e.species);
    if (entry) { entry.seen = true; entry.goldenSeen ||= e.golden === true; }
  }
  if (e.type === 'battle-start') p.fight = cleanFight({ ...e, mode: e.mode ?? 'campaign' });
  const f = p.fight;
  if (e.type === 'cast' && f && (!e.foeId || e.foeId === f.foeId) && (!e.mode || e.mode === f.mode)) {
    castInto(f, e); c.casts = whole(c.casts + 1); if (e.perfect) c.perfects = whole(c.perfects + 1); if (e.fizzle) c.fizzles = whole(c.fizzles + 1);
  }
  if (e.type === 'guard' && f && e.grade === 'perfect') { f.perfectGuards = Math.min(3, f.perfectGuards + 1); c.perfectGuards = whole(c.perfectGuards + 1); }
  if (e.type === 'resonance' && f) c.maxResonance = Math.max(c.maxResonance, whole(e.level, 4));
  if (e.type === 'assist' && f) c.assists = whole(c.assists + 1);
  if (e.type === 'battle-end' && f && e.foeId === f.foeId && (e.mode ?? 'campaign') === f.mode) {
    p.fight = null;
    if (e.outcome === 'won') {
      c.wins = whole(c.wins + 1);
      const entry = entryFor(p, e.species ?? f.species);
      if (entry) { entry.seen = entry.resolved = true; entry.cleared = whole(entry.cleared + 1); entry.mastered ||= f.mastered; entry.bestFidelity = Math.max(entry.bestFidelity, f.bestFidelity); if (f.smallestPacket) entry.smallestPacket = Math.min(entry.smallestPacket ?? Infinity, f.smallestPacket); entry.metric = f.metric; if (e.golden || f.golden) { entry.goldenSeen = entry.golden = true; c.goldens = whole(c.goldens + 1); } }
      f.flags.forEach(award); if (f.perfectGuards >= 3) award('guard-triad'); if (f.calm && f.storm) award('tide-fit');
      recordWin(p, f, e);
      if (f.mode === 'duel' && DUEL_IDS.includes(f.duel)) { const d = p.duels[f.duel]; p.duels[f.duel] = { won: true, fewestCasts: Math.min(d?.fewestCasts ?? Infinity, whole(e.stats?.casts ?? f.casts, 1e6)), smallestAcceptedPacket: f.smallestAcceptedPacket ? Math.min(d?.smallestAcceptedPacket ?? Infinity, f.smallestAcceptedPacket) : d?.smallestAcceptedPacket ?? null }; }
    }
  }
  if (e.type === 'well-floor') { p.well.floors = whole(p.well.floors + 1); p.well.best = Math.max(p.well.best, whole(e.depth, 9999)); p.well.bestScore = Math.max(p.well.bestScore, whole(e.score)); }
  if (e.type === 'well-end') {
    p.well.runs = whole(p.well.runs + 1); p.well.best = Math.max(p.well.best, whole(e.depth, 9999)); p.well.bestScore = Math.max(p.well.bestScore, whole(e.score));
    p.well.lastSeed = Number.isInteger(e.seed) && e.seed >= 0 && e.seed <= 0xffffffff ? e.seed : p.well.lastSeed; p.well.lastVersion = whole(e.version, 9999) || p.well.lastVersion;
    const fresh = wellRecord(e);
    if (fresh) {
      p.well.bestRatio = Math.max(p.well.bestRatio, fresh.bestRatio);
      const records = p.well.records, index = records.findIndex(r => r.key === fresh.key), old = records[index];
      if (!old || fresh.depth > old.depth || (fresh.depth === old.depth && fresh.score > old.score)) {
        if (old) records[index] = fresh; else records.push(fresh);
        records.sort((a, b) => b.depth - a.depth || b.score - a.score); records.length = Math.min(24, records.length);
      }
    }
  }
  if (Array.isArray(state.friends) && state.friends.includes(0)) award('first-friend');
  if (all(state.friends, GUARDIANS.map(g => g.id))) award('seven-friends');
  if (all(state.puzzles, ISLAND_IDS.puzzle)) award('seven-bridges');
  if (all(state.shards, ISLAND_IDS.shard)) award('sixteen-shards');
  if (all(state.camps, ISLAND_IDS.camp)) award('eight-camps');
  if (SPECIES.every(s => p.dex[s.id]?.resolved)) award('dex-complete');
  if (DUEL_IDS.every(id => p.duels[id]?.won || state.rival?.won?.includes(id))) award('fen-three');
  if (p.well.best >= 5) award('well-five'); if (p.well.best >= 15) award('well-fifteen');
  return earned;
}
export function medalFor(letter) { return { S: 'gold', A: 'silver', B: 'bronze' }[letter] ?? null; }
export function unlockedHats(p) { return HATS.filter(h => h.depth ? p?.well?.best >= h.depth : h.id === 'fen-scarf' ? DUEL_IDS.every(id => p?.duels?.[id]?.won) || p?.badges?.includes('fen-three') : SPECIES.every(s => p?.dex?.[s.id]?.resolved)).map(h => h.id); }
/** The island percentage never includes optional or endless collection goals. */
export function completion(state = {}) {
  const p = state.progress ?? newProgress();
  const parts = [
    ['friends', 'Friends', memberCount(state.friends, GUARDIANS.map(g => g.id)), 7],
    ['techniques', 'Techniques', memberCount(state.techniques, TECHNIQUE_ORDER), 7],
    ['puzzles', 'Snap Bridges', memberCount(state.puzzles, ISLAND_IDS.puzzle), 7],
    ['shards', 'Bit shards', memberCount(state.shards, ISLAND_IDS.shard), 16],
    ['caches', 'Caches', memberCount(state.caches, ISLAND_IDS.cache), 7],
    ['camps', 'Rested camps', memberCount(state.camps, ISLAND_IDS.camp), 8],
    ['ending', 'Lighthouse ending', state.flags?.includes('ending-seen') ? 1 : 0, 1],
  ].map(([id, label, have, total]) => ({ id, label, have, total }));
  const have = parts.reduce((n, part) => n + part.have, 0);
  return { have, total: 53, percent: Math.floor(have * 100 / 53), parts, dex: SPECIES.filter(s => p.dex[s.id]?.resolved).length, mastered: SPECIES.filter(s => p.dex[s.id]?.mastered).length, badges: memberCount(p.badges, BADGES.map(b => b.id)), fen: DUEL_IDS.filter(id => p.duels[id]?.won || state.rival?.won?.includes(id)).length, well: p.well.best };
}
