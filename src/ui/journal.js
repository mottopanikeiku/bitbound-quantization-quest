// Optional discovery, mastery and expression. The Map only pins; it never travels.
import { PAL } from '../art/palette.js';
import { drawText, wrapText } from '../engine/font.js';
import { drawWindow, drawScrim, drawIcon, drawBadge, fitText } from './kit.js';
import { drawBattleCreature } from '../art/creatures.js';
import { drawCharacter } from '../art/characters.js';
import { GUARDIANS, ZONES, HUB } from '../content/game-data.js';
import { WARDENS } from '../content/static-dex.js';
import { MAP, REGIONS, GATES, INTERACTABLES, TILE, START } from '../world/map.js';
import { BADGES, HATS, SPECIES, DUEL_IDS, completion, medalFor, unlockedHats } from '../progress/progress.js';

export const JOURNAL_TABS = Object.freeze(['map', 'dex', 'badges', 'records', 'look']);
const TITLES = { map: 'Map', dex: 'Dex', badges: 'Badges', records: 'Records', look: 'Look' };
const LANDMARKS = ['camp', 'stone', 'shrine', 'cache', 'puzzle', 'shard', 'well', 'lighthouse', 'fen'];
const GOLDEN_DISCLOSURE = 'Golden is cosmetic and rolls 1 in 32 per specimen per rest visit in the world, or by seed for Well specimens. Reloads keep the roll, and the fight stays the same with no extra rewards.';
const landmarkName = i => i.interaction === 'puzzle' ? 'Snap Bridge' : i.interaction === 'stone' ? 'Grid Stone' : i.interaction === 'shrine' ? `${GUARDIANS[i.zone].name}'s shrine` : i.interaction === 'camp' ? 'Campfire' : i.interaction === 'shard' ? 'Collected shard' : i.interaction === 'well' ? 'Static Well' : i.interaction === 'lighthouse' ? 'Lighthouse' : i.interaction === 'fen' ? 'Fen Float' : 'Snack cache';
const percent = n => `${(100 * (n ?? 0)).toFixed(1)}%`;
const zoneName = id => id < 0 ? HUB.name : ZONES[id].name;
function doneLandmark(i, state) {
  return i.interaction === 'shard' ? state.shards.includes(i.id) : i.interaction === 'cache' ? state.caches.includes(i.id) : i.interaction === 'puzzle' ? state.puzzles.includes(i.id) : i.interaction === 'camp' ? state.camps.includes(i.id) : i.interaction === 'stone' ? state.techniques.includes(ZONES[i.zone].technique) : i.interaction === 'shrine' ? state.friends.includes(i.zone) : i.interaction === 'lighthouse' ? state.flags.includes('ending-seen') : false;
}
// One reusable geometry raster per discovered/restored combination; no per-frame tile scan.
const overviewCache = new Map();
function overview(known, restored) {
  const key = `${known.join(',')}/${restored.join(',')}`;
  if (overviewCache.has(key)) return overviewCache.get(key);
  const image = document.createElement('canvas'); image.width = MAP.width; image.height = MAP.height;
  const ctx = image.getContext('2d');
  ctx.fillStyle = PAL.night[1]; ctx.fillRect(0, 0, MAP.width, MAP.height);
  for (let y = 0; y < MAP.height; y++) for (let x = 0; x < MAP.width; x++) {
    const terrain = MAP.get(x, y); if (['deep', 'water', 'void'].includes(terrain)) continue;
    const zone = MAP.zoneAt(x, y);
    ctx.fillStyle = !known.includes(zone) ? PAL.night[4] : zone < 0 || restored.includes(zone) ? PAL.teal[4] : PAL.violet[4];
    if (['path', 'bridge', 'plank'].includes(terrain) && known.includes(zone)) ctx.fillStyle = PAL.gold[3];
    ctx.fillRect(x, y, 1, 1);
  }
  if (overviewCache.size >= 32) overviewCache.delete(overviewCache.keys().next().value);
  overviewCache.set(key, image); return image;
}
export class Journal {
  constructor(game) { this.game = game; this.open_ = false; this.tab = 0; this.selected = 0; this.detail = false; this.scroll = 0; this.maxScroll = 0; this.landmark = 0; this.onClose = null; }
  get active() { return this.open_; }
  open({ tab = 'map', onClose = null } = {}) { this.open_ = true; this.tab = Math.max(0, JOURNAL_TABS.indexOf(tab)); this.selected = 0; this.detail = false; this.scroll = 0; this.landmark = 0; this.onClose = onClose; this.announce(); }
  close() { const done = this.onClose; this.open_ = false; this.onClose = null; this.game.announce('Journal closed.'); done?.(); }
  get page() { return JOURNAL_TABS[this.tab]; }
  knownRegions() {
    const state = this.game.state, pos = this.game.worldScene?.world?.hero ?? state.position ?? START;
    const current = MAP.zoneAt(Math.floor(pos.x / TILE), Math.floor(pos.y / TILE));
    const firstMissing = GUARDIANS.find(g => !state.friends.includes(g.id))?.id ?? 7;
    return REGIONS.filter(r => r.id < 0 || r.id <= firstMissing || r.id === current);
  }
  landmarks(region) { return INTERACTABLES.filter(i => i.zone === region.id && LANDMARKS.includes(i.interaction) && (i.interaction !== 'shard' || this.game.state.shards.includes(i.id))); }
  entries() {
    const s = this.game.state, p = s.progress;
    if (this.page === 'map') return this.knownRegions().map(r => ({ id: r.key, title: zoneName(r.id), region: r }));
    if (this.page === 'dex') return SPECIES.map((species, index) => { const entry = p.dex[species.id]; return { id: species.id, title: `${String(index + 1).padStart(2, '0')} ${entry?.seen ? species.name : '???'}`, species, entry }; });
    if (this.page === 'badges') return BADGES.map(b => ({ ...b, title: b.name }));
    if (this.page === 'look') return [{ id: null, title: 'No hat', text: 'Your original travelling look.' }, ...HATS.map(h => ({ ...h, title: h.name }))];
    return [...GUARDIANS.map(g => ({ id: g.key, title: g.name, guardian: g })), { id: 'fen', title: 'Fen Float' }, { id: 'well', title: 'Static Well' }];
  }
  announce() {
    const entry = this.entries()[this.selected], touch = this.game.input.lastDevice === 'touch';
    const action = this.page === 'map' ? `${touch ? 'A' : 'Enter'} chooses landmarks to pin.` : this.page === 'look' ? `${touch ? 'A' : 'Enter'} wears an unlocked hat.` : `${touch ? 'A' : 'Enter'} opens detail scrolling.`;
    this.game.announce(`Journal ${TITLES[this.page]}. ${entry?.title ?? ''}. Left and right change tabs; up and down select. ${action} ${touch ? 'B' : 'Escape'} goes back.`);
  }
  update(dt, input) {
    if (!this.open_) return;
    if (input.pressed('journal') || (input.pressed('pause') && !input.pressed('cancel'))) { input.consume('journal'); input.consume('pause'); this.close(); return; }
    if (input.pressed('cancel')) { input.consume('cancel'); input.consume('pause'); if (this.detail) { this.detail = false; this.scroll = 0; this.announce(); } else this.close(); return; }
    const right = input.repeat('right'), left = input.repeat('left');
    if (right || left) { this.tab = (this.tab + (right ? 1 : 4)) % 5; this.selected = 0; this.detail = false; this.scroll = 0; this.landmark = 0; this.game.audio.play('menu-move'); this.announce(); return; }
    const down = input.repeat('down'), up = input.repeat('up');
    const entries = this.entries(), entry = entries[this.selected];
    if (down || up) {
      const step = down ? 1 : -1;
      if (this.detail && this.page === 'map') { const landmarks = this.landmarks(entry.region); this.landmark = (this.landmark + step + landmarks.length) % Math.max(1, landmarks.length); const selected = landmarks[this.landmark]; this.game.announce(`${landmarkName(selected)}. ${doneLandmark(selected, this.game.state) ? 'Complete.' : 'Not complete.'} Confirm to pin.`); }
      else if (this.detail) this.scroll = Math.max(0, Math.min(this.maxScroll, this.scroll + step));
      else { this.selected = (this.selected + step + entries.length) % entries.length; this.scroll = 0; this.landmark = 0; this.announce(); }
      this.game.audio.play('menu-move');
    }
    if (input.pressed('confirm')) {
      input.consume('confirm');
      if (this.page === 'look') { if (entry.id === null || unlockedHats(this.game.state.progress).includes(entry.id)) { this.game.setHat(entry.id); this.game.announce(`${entry.title} selected.`); } else this.game.announce(`Locked: ${entry.text}`); }
      else if (this.page === 'map' && this.detail) { const landmark = this.landmarks(entry.region)[this.landmark]; if (landmark) { this.game.setPin(this.game.state.pin === landmark.id ? null : landmark.id); this.game.announce(this.game.state.pin ? `${landmarkName(landmark)} pinned, but the map does not travel there.` : 'Map pin cleared.'); } }
      else { this.detail = !this.detail; this.scroll = 0; this.game.announce(this.detail ? this.detailLines(entry).join(' ') : `${entry.title}.`); }
      this.game.audio.play('select');
    }
  }
  detailLines(entry) {
    const state = this.game.state, p = state.progress;
    if (this.page === 'map') return [`${entry.title}. ${entry.region.id < 0 || state.friends.includes(entry.region.id) ? 'Restored' : 'Still touched by Static'}.`, 'Up and down choose a known landmark, and confirming pins it without ever teleporting you.', ...this.landmarks(entry.region).map(i => `${landmarkName(i)}: ${doneLandmark(i, state) ? 'complete' : 'not complete'}.`)];
    if (this.page === 'dex') {
      const e = entry.entry;
      if (!e?.seen) return ['Unseen silhouette.', 'Discover this specimen on its shore or in the Static Well.', GOLDEN_DISCLOSURE];
      return ['Staticling species', e.mastered ? 'MASTERED · won with F ≥98.5% on every thread.' : e.resolved ? 'RESOLVED · win recorded.' : 'SEEN · not yet resolved.', ...(entry.species.lines ?? []), `Best ${e.metric} fidelity: ${percent(e.bestFidelity)}`, `Smallest winning packet: ${e.smallestPacket ?? '-'} B`, e.golden ? '★ Golden portrait won · cosmetic only.' : e.goldenSeen ? 'Golden specimen seen; not yet won.' : 'Golden portrait optional · never required.', GOLDEN_DISCLOSURE];
    }
    if (this.page === 'badges') return [p.badges.includes(entry.id) ? 'STAMP EARNED' : 'STAMP NOT YET EARNED', entry.text, 'Battle conditions settle only on a win, and practice and Well fights count.', 'Stamps are cosmetic and give no stat bonus.'];
    if (this.page === 'look') return [state.hat === entry.id ? 'CURRENT LOOK' : entry.id === null || unlockedHats(p).includes(entry.id) ? 'UNLOCKED · confirm to wear' : 'LOCKED', entry.text, 'Hats are expression, not equipment stats.'];
    if (entry.guardian) {
      const r = p.records[entry.id], xp = state.bonds[entry.id] ?? 0, level = xp >= 8 ? 3 : xp >= 3 ? 2 : 1;
      return [r ? `${r.grade} · ${r.score}/100 · ${medalFor(r.grade) ?? 'no'} medal` : 'No guardian record yet.', ...(r ? [`Best-score fight: ${r.turns} turns · ${r.bytes} packet B`, `Fidelity ${percent(r.fidelity)} · ${r.assisted ? 'assisted' : 'unassisted'}`, `Fewest turns: ${r.fewestTurns?.turns ?? '-'} · grade ${r.fewestTurns?.grade ?? '-'}`, `Fewest packet B: ${r.fewestBytes?.bytes ?? '-'} · grade ${r.fewestBytes?.grade ?? '-'}`] : []), `Assists: ${xp} · bond level ${level} (0 / 3 / 8)`, state.friends.includes(entry.guardian.id) ? `Rematch at ${ZONES[entry.guardian.zone].name}'s restored shrine, where practice changes no campaign supplies.` : `Befriend ${entry.title} to unlock shrine rematches.`, level === 3 ? 'Gold emblem frame unlocked.' : level === 2 ? 'Extra coaching line unlocked.' : 'Bonds unlock expression, never power.'];
    }
    if (entry.id === 'fen') return [`Duels won: ${completion(state).fen}/3`, ...DUEL_IDS.map((id, index) => { const d = p.duels[id]; return `${['Offset Grove', 'Inference Forge', 'Precision Spire'][index]}: ${d?.won || state.rival.won.includes(id) ? 'won' : 'not won'} · fewest casts ${d?.fewestCasts ?? '-'} · smallest accepted packet ${d?.smallestAcceptedPacket ?? '-'} B`; }), 'Fen duels are optional, isolated from campaign supplies.'];
    return [`Greatest cleared depth: B${p.well.best}`, `Best expedition score: ${p.well.bestScore}`, `Best cleared damage / packet B: ${p.well.bestRatio.toFixed(2)}`, `Cleared floors: ${p.well.floors} · expeditions ended: ${p.well.runs}`, `Last seed: ${p.well.lastSeed === null ? 'none' : p.well.lastSeed.toString(16).padStart(8, '0')}`, 'The Well unlocks at two friends, and depth counts cleared floors, never entered ones.', 'You can replay a seed at the Well entrance, with no timer or absence penalty.', 'Wardens (separate from the 21-species dex):', ...WARDENS.map(w => `${p.wardens[w.id]?.seen ? w.name : 'Unseen warden'}: ${p.wardens[w.id]?.mastered ? 'mastered' : p.wardens[w.id]?.resolved ? 'resolved' : p.wardens[w.id]?.seen ? 'seen' : 'unseen'}${p.wardens[w.id]?.golden ? ' · golden ★' : ''}`), 'Seed records include generator version and learned tools; different unlock sets are not comparable.', ...p.well.records.map(r => `${r.key}: B${r.depth} · ${r.score} points`)];
  }
  drawMap(ctx, screen, entry) {
    const state = this.game.state, known = this.knownRegions().map(r => r.id), r = entry.region;
    const x = 18, y = 60, scale = Math.max(1, Math.floor(Math.min((screen.portrait ? screen.w - 36 : Math.min(260, screen.w * .48)) / MAP.width, (screen.portrait ? 122 : screen.h - 94) / MAP.height)));
    const mw = MAP.width * scale, mh = MAP.height * scale;
    ctx.imageSmoothingEnabled = false; ctx.drawImage(overview(known, state.friends), x, y, mw, mh);
    ctx.fillStyle = PAL.ui.gold;
    const bx = x + r.x * scale, by = y + r.y * scale, bw = r.w * scale, bh = r.h * scale;
    ctx.fillRect(bx, by, bw, 1); ctx.fillRect(bx, by + bh - 1, bw, 1); ctx.fillRect(bx, by, 1, bh); ctx.fillRect(bx + bw - 1, by, 1, bh);
    for (const gate of GATES) if (known.includes(gate.zone)) { ctx.fillStyle = state.friends.includes(gate.requires) ? PAL.ui.gold : PAL.rose[4]; ctx.fillRect(x + gate.tx * scale, y + gate.ty * scale, 3, 3); }
    for (const camp of INTERACTABLES) if (camp.interaction === 'camp' && known.includes(camp.zone)) {
      ctx.fillStyle = state.camps.includes(camp.id) ? PAL.ui.gold : PAL.night[5];
      ctx.fillRect(x + camp.tx * scale - 1, y + camp.ty * scale - 1, 3, 3);
    }
    const icon = { stone: 'bits', shrine: 'friend', cache: 'snack', puzzle: 'groups', shard: 'shard', well: 'well', lighthouse: 'star', fen: 'map' };
    for (const item of this.landmarks(r)) if (item.interaction !== 'camp') drawIcon(ctx, icon[item.interaction], x + item.tx * scale - 3, y + item.ty * scale - 3);
    const position = this.game.worldScene?.world?.hero ?? state.position ?? START;
    drawIcon(ctx, 'pin', x + Math.floor(position.x / TILE) * scale - 3, y + Math.floor(position.y / TILE) * scale - 7);
    const dx = screen.portrait ? 18 : x + mw + 18, dy = screen.portrait ? y + mh + 15 : y, dw = screen.w - dx - 18;
    drawText(ctx, fitText(`↑↓ ${entry.title}`, dw), dx, dy, { color: PAL.ui.gold });
    drawText(ctx, r.id < 0 || state.friends.includes(r.id) ? 'RESTORED' : 'STATIC STILL HERE', dx, dy + 14, { font: 'small', color: PAL.ui.dim });
    const items = INTERACTABLES.filter(i => i.zone === r.id);
    const lines = ['camp', 'cache', 'puzzle', 'shard'].map(kind => { const list = items.filter(i => i.interaction === kind); return `${{camp:'Rested camps',cache:'Caches',puzzle:'Bridges',shard:'Shards'}[kind]}: ${list.filter(i => doneLandmark(i, state)).length}/${list.length}`; });
    let cy = dy + 28; for (const line of lines) { drawText(ctx, fitText(line, dw), dx, cy, { color: PAL.ui.text }); cy += 12; }
    drawText(ctx, 'Hidden shards: counts only', dx, cy, { font: 'small', color: PAL.ui.faint }); cy += 13;
    const landmarks = this.landmarks(r), visible = Math.max(1, Math.floor((screen.h - cy - 29) / 12));
    const start = this.detail ? Math.max(0, Math.min(this.landmark - Math.floor(visible / 2), landmarks.length - visible)) : 0;
    for (let i = start; i < Math.min(landmarks.length, start + visible); i++) { const item = landmarks[i], selected = this.detail && i === this.landmark; if (selected) { ctx.fillStyle = PAL.night[4]; ctx.fillRect(dx - 2, cy - 2, dw, 12); } drawText(ctx, fitText(`${state.pin === item.id ? '★' : doneLandmark(item, state) ? '✓' : '·'} ${landmarkName(item)}`, dw), dx, cy, { color: selected ? PAL.ui.gold : PAL.ui.dim }); cy += 12; }
    drawText(ctx, 'Teal restored · violet static', x, y + mh + 3, { font: 'small', color: PAL.ui.faint });
    if (!screen.portrait) drawText(ctx, 'Gold paths · red closed gates', x, y + mh + 12, { font: 'small', color: PAL.ui.faint });
  }
  draw(ctx, screen, t) {
    if (!this.open_) return;
    const { w, h, portrait } = screen, state = this.game.state, tally = completion(state);
    drawScrim(ctx, screen); drawWindow(ctx, 6, 6, w - 12, h - 12);
    drawText(ctx, 'THE ISLAND JOURNAL', 18, 15, { color: PAL.ui.gold });
    drawText(ctx, `Island ${tally.have}/53 · Dex ${tally.dex}/21 · Badges ${tally.badges}/20`, 18, 29, { font: 'small', color: PAL.ui.dim });
    drawWindow(ctx, 13, 40, w - 26, 16, 'glass');
    drawText(ctx, `← ${TITLES[this.page]} →  ${this.tab + 1}/5`, Math.round(w / 2), 44, { align: 'center', font: 'small', color: PAL.ui.gold });
    const entries = this.entries(), entry = entries[this.selected];
    if (this.page === 'map') this.drawMap(ctx, screen, entry);
    else {
      const listX = 18, listY = 66, listW = portrait ? w - 36 : Math.min(145, Math.round(w * .34));
      const visible = portrait ? 3 : Math.max(3, Math.floor((h - 99) / 15));
      const start = Math.max(0, Math.min(this.selected - Math.floor(visible / 2), entries.length - visible));
      for (let i = start; i < Math.min(entries.length, start + visible); i++) {
        const y = listY + (i - start) * 15, selected = i === this.selected;
        if (selected) { ctx.fillStyle = PAL.night[4]; ctx.fillRect(listX - 2, y - 2, listW, 14); }
        if (this.page === 'badges') drawBadge(ctx, entries[i].id, listX, y - 1, { earned: state.progress.badges.includes(entries[i].id), size: 12 });
        drawText(ctx, fitText(entries[i].title, listW - 17), listX + 15, y, { color: selected ? PAL.ui.gold : PAL.ui.dim });
      }
      drawText(ctx, `${this.selected + 1}/${entries.length}${this.page === 'dex' ? ' · 21 species' : ''}`, listX, listY + visible * 15 + 1, { font: 'small', color: PAL.ui.faint });
      const dx = portrait ? 18 : listX + listW + 12, dy = portrait ? 132 : 66, dw = w - dx - 18;
      drawText(ctx, fitText(entry.title, dw), dx, dy, { color: PAL.ui.gold });
      let cy = dy + 17;
      if (this.page === 'dex') { drawBattleCreature(ctx, entry.id, dx + Math.floor(dw / 2), cy + 62, { t: this.game.reducedMotion ? 0 : t, silhouette: !entry.entry?.seen, golden: entry.entry?.golden === true, reduced: this.game.reducedMotion }); if (entry.entry?.golden) drawIcon(ctx, 'golden', dx + dw - 12, cy + 5); cy += 69; }
      if (this.page === 'badges') { drawBadge(ctx, entry.id, dx, cy, { earned: state.progress.badges.includes(entry.id), size: 24 }); cy += 30; }
      if (this.page === 'look') { drawCharacter(ctx, 'hero', dx + 20, cy + 32, { dir: 'down', t: this.game.reducedMotion ? 0 : t, hat: entry.id }); cy += 41; }
      if (entry.guardian && state.progress.records[entry.id]) { const medal = medalFor(state.progress.records[entry.id].grade); if (medal) drawIcon(ctx, `medal-${medal}`, dx + dw - 10, dy); }
      const rows = this.detailLines(entry).flatMap(line => wrapText(line, dw, 'small'));
      const capacity = Math.max(1, Math.floor((h - cy - 28) / 9)); this.maxScroll = Math.max(0, rows.length - capacity); this.scroll = Math.min(this.scroll, this.maxScroll);
      for (let i = this.scroll; i < Math.min(rows.length, this.scroll + capacity); i++) drawText(ctx, rows[i], dx, cy + (i - this.scroll) * 9, { font: 'small', color: PAL.ui.text });
      if (this.maxScroll) drawText(ctx, this.detail ? '↑↓ scroll detail' : 'A / Enter: more detail', dx, h - 30, { font: 'small', color: PAL.ui.gold });
    }
    const touch = this.game.input.lastDevice === 'touch';
    const hint = this.page === 'map' ? this.detail ? '↑↓ Landmark · A pin · B back' : '↑↓ Shore · A landmarks · B close' : this.page === 'look' ? '↑↓ Look · A wear · B close' : this.detail ? '↑↓ Scroll · B index' : '↑↓ Entry · A detail · B close';
    drawText(ctx, fitText(touch ? `${hint} · ←→ tabs` : hint.replaceAll('A ', 'Enter ').replaceAll('B ', 'Esc ') + ' · ←→ tabs', w - 32, 'small'), Math.round(w / 2), h - 18, { font: 'small', align: 'center', color: PAL.ui.gold });
  }
}
