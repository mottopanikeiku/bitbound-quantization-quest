import { PAL } from '../art/palette.js';
import { drawBattleBackground } from '../art/backgrounds.js';
import { drawCharacter } from '../art/characters.js';
import { drawSpirit } from '../art/creatures.js';
import { drawText } from '../engine/font.js';
import { drawWindow, drawMenu, drawParagraph, drawIcon, fitText } from '../ui/kit.js';
import { GUARDIANS, TECHNIQUES } from '../content/game-data.js';
import { newRun, sanitizeRun, clearFloor, RUN_VERSION } from '../well/run.js';
import { floorDescriptor, floorIdentity } from '../well/generation.js';
import { boonOffers, offerInfo, chooseBoon, boonOf } from '../well/boons.js';
import { seedHex, runKey } from '../well/streams.js';

// Decision cues describe fictional utility, never better encoded fidelity or free metadata.
const BOON_STYLE = {
  'byte-moss': ['byte', 'Bank charge for larger casts.'],
  'stout-lantern': ['heart', 'More room to try a new plan.'],
  'camp-kettle': ['heart', 'Recover while you keep descending.'],
  'echo-coil': ['shield', 'Pays off when you guard well.'],
  'soft-shield': ['shield', 'Soften each hit of a long volley.'],
  'steady-ribbon': ['run', 'Trade lock speed for control.'],
  'emergency-flask': ['heart', 'A safety net once per block.'],
  'pocket-picnic': ['snack', 'Make a recovery turn count.'],
  'first-light': ['bits', 'Start with an affordable cast.'],
  'quiet-reserve': ['byte', 'Brace early to bank more charge.'],
  'clear-bell': ['snack', 'Carry recovery beyond a warden.'],
  'braced-roots': ['shield', 'Brace before a heavy charge.'],
  rest: ['heart', 'Recover now; no boon slot used.'],
  recharge: ['byte', 'Bank charge now; no slot used.'],
};

/** Lantern-platform descent. All choices are untimed, all rewards are committed once. */
export class WellScene {
  constructor(game) {
    this.game = game; this.run = null; this.age = 0; this.selected = 0;
    this.summary = null; this.menu = []; this.view = 'entrance'; this.encounter = null;
    this.lastSeed = null; this.confirmAction = null; this.replaceOffer = null;
    this.boonReveal = null;
  }
  get depth() { return this.run?.depth ?? 0; }
  enter(params = {}) {
    this.age = 0; this.selected = 0; this.boonReveal = null;
    this.game.setMusicScene('well');
    if (params.battleResult && this.run) this._afterBattle(params.battleResult);
    else { this.run = null; this.summary = null; this.view = 'entrance'; }
    this._buildMenu(); this._announce();
  }
  _unlocked() { return this.game.state.friends.length >= 2; }
  _replaySeed() {
    const saved = this.game.state.progress?.well?.lastSeed;
    if (typeof saved === 'number') return saved;
    if (saved && saved.version === RUN_VERSION) return saved.seed;
    return this.lastSeed;
  }
  _buildMenu() {
    this.selected = 0;
    if (!this._unlocked()) this.menu = [{ key: 'leave', label: 'Back to the island' }];
    else if (this.view === 'boon-taken') this.menu = [{ key: 'continue', label: 'Continue descent' }];
    else if (this.view === 'confirm') this.menu = [{ key: 'back', label: 'Keep this expedition' }, { key: 'yes', label: 'End this expedition' }];
    else if (this.view === 'replace') this.menu = [...Object.keys(this.run.boons).map((id) => ({ key: id, label: `${boonOf(id).name} ${this.run.boons[id]}` })), { key: 'back', label: 'Keep all six / back' }];
    else if (this.view === 'boon') this.menu = [...boonOffers(this.run).map((id) => ({ key: id, label: offerInfo(this.run, id).name })), { key: 'skip', label: 'Skip boon' }];
    else if (this.summary) this.menu = [{ key: 'entrance', label: 'Expedition menu' }, { key: 'leave', label: 'Climb out' }];
    else if (this.run) this.menu = [{ key: 'descend', label: `Descend to B${this.run.depth}` }, { key: 'suspend', label: 'Rest & leave (saved)' }, { key: 'end', label: 'End expedition' }];
    else {
      this.menu = [];
      if (this.game.state.wellRun) this.menu.push({ key: 'resume', label: 'Resume expedition' });
      this.menu.push({ key: 'new', label: 'New expedition' });
      if (this._replaySeed() != null) this.menu.push({ key: 'replay', label: 'Replay last seed' });
      this.menu.push({ key: 'leave', label: 'Back to the island' });
    }
  }
  _announce() { this.game.announce(`${this.describe()}. ${this.menu[this.selected]?.label ?? ''}`); }
  _save() { this.game.state.wellRun = this.run; this.game.save(); }
  _start(seed) {
    this.run = newRun({ seed, techniques: this.game.state.techniques, friends: this.game.state.friends });
    this.summary = null; this.view = 'boundary'; this.encounter = null; this._save(); this._buildMenu();
  }
  _resume() {
    this.run = sanitizeRun(this.game.state.wellRun, this.game.state);
    if (!this.run) { this.game.state.wellRun = null; this.game.save(); this.view = 'entrance'; }
    else this.view = this.run.pendingOffer ? 'boon' : 'boundary';
    this._buildMenu();
  }
  _afterBattle(result) {
    if (result.outcome !== 'won') { this._endRun(result.outcome === 'lost' ? 'defeat' : 'climb'); return; }
    const encounter = this.encounter ?? floorDescriptor(this.run);
    const score = clearFloor(this.run, result, encounter);
    if (!score) return;
    this.game.emit('well-floor', { depth: this.run.cleared, warden: encounter.warden, score: this.run.score });
    this.encounter = null; this.view = this.run.pendingOffer ? 'boon' : 'boundary'; this._save();
  }
  _endRun(cause) {
    const run = this.run ?? this.game.state.wellRun;
    if (!run) return;
    this.lastSeed = run.seed;
    this.summary = { depth: run.cleared, score: run.score, components: { ...run.components }, bestRatio: run.bestRatio, seed: run.seed, cause };
    this.game.emit('well-end', { depth: run.cleared, score: run.score, seed: run.seed, version: run.version, key: runKey(run), bestRatio: run.bestRatio, components: { ...run.components }, cause });
    this.run = null; this.encounter = null; this.game.state.wellRun = null; this.view = 'summary'; this.game.save();
  }
  _descend() {
    const well = floorDescriptor(this.run);
    this.encounter = well; this._save(); this.game.audio.play('descend');
    this.game.startBattle({ foeId: `static-${well.zone}`, species: well.species, mode: 'well', uid: well.uid, zone: well.zone, golden: well.golden, well });
  }
  _choose(key) {
    if (this.view === 'confirm') {
      const action = this.confirmAction;
      if (key === 'back') { this.view = this.run ? 'boundary' : 'entrance'; this.confirmAction = null; this._buildMenu(); return; }
      const replaySeed = this._replaySeed();
      this._endRun('climb');
      if (action === 'new' || action === 'replay') this._start(action === 'replay' ? replaySeed : (Math.random() * 0x100000000) >>> 0);
      else this._buildMenu();
      return;
    }
    if (this.view === 'replace') {
      if (key !== 'back' && this._takeBoon(this.replaceOffer, key)) { this.replaceOffer = null; return; }
      else this.view = 'boon';
      this.replaceOffer = null; this._buildMenu(); return;
    }
    if (this.view === 'boon') {
      if (key !== 'skip' && boonOf(key) && !this.run.boons[key] && Object.keys(this.run.boons).length >= 6) { this.replaceOffer = key; this.view = 'replace'; this._buildMenu(); return; }
      if (key === 'skip') { if (chooseBoon(this.run, key)) { this.view = 'boundary'; this._save(); this._buildMenu(); } }
      else this._takeBoon(key);
      return;
    }
    if (key === 'new' || key === 'replay') {
      if (this.game.state.wellRun) { this.confirmAction = key; this.view = 'confirm'; this._buildMenu(); }
      else this._start(key === 'replay' ? this._replaySeed() : (Math.random() * 0x100000000) >>> 0);
    } else if (key === 'resume') this._resume();
    else if (key === 'descend') this._descend();
    else if (key === 'end') { this.confirmAction = 'end'; this.view = 'confirm'; this._buildMenu(); }
    else if (key === 'suspend' || key === 'leave') { if (this.run) this._save(); this.game.leaveWell(); }
    else if (key === 'entrance') { this.summary = null; this.view = 'entrance'; this._buildMenu(); }
  }
  _takeBoon(id, replacement = null) {
    const offers = boonOffers(this.run).map((key) => ({ id: key, ...offerInfo(this.run, key), held: this.run.boons[key] ?? 0 }));
    if (!chooseBoon(this.run, id, replacement)) return false;
    this.boonReveal = { offers, id, selected: offers.findIndex((offer) => offer.id === id), age: 0, replacement };
    this.view = 'boon-taken'; this.game.audio.play('boon'); this._save(); this._buildMenu();
    return true;
  }
  _finishBoonReveal() { this.boonReveal = null; this.view = 'boundary'; this._buildMenu(); this._announce(); }
  update(dt, input) {
    this.age += dt;
    if (this.view === 'boon-taken') {
      this.boonReveal.age += dt;
      if (input.pressed('confirm')) { input.consume('confirm'); this._finishBoonReveal(); }
      else if (input.pressed('cancel')) { input.consume('cancel'); input.consume('pause'); this._save(); this.game.leaveWell(); }
      else if (this.boonReveal.age >= 0.65) this._finishBoonReveal();
      return;
    }
    if (this.age < 0.2) return;
    let step = 0;
    if (input.repeat('up') || input.repeat('left')) step--;
    if (input.repeat('down') || input.repeat('right')) step++;
    if (step) { this.selected = (this.selected + step + this.menu.length) % this.menu.length; this.game.audio.play('menu'); this._announce(); }
    if (input.pressed('cancel')) {
      input.consume('cancel'); input.consume('pause');
      if (this.view === 'confirm' || this.view === 'replace') this._choose('back');
      else { if (this.run) this._save(); this.game.leaveWell(); }
      this._announce(); return;
    }
    if (input.pressed('confirm')) { input.consume('confirm'); this._choose(this.menu[this.selected]?.key); this._announce(); }
  }
  _shaft(ctx, screen, t) {
    const { w, h, portrait } = screen, x = portrait ? Math.round(w / 2) : 72;
    const picking = this.view === 'boon' || this.view === 'boon-taken';
    const y = picking ? (portrait ? 42 : 30) : portrait ? 76 : Math.round(h / 2) + 22;
    const motion = this.game.reducedMotion ? 0 : Math.floor(t * 10) % 32;
    ctx.fillStyle = PAL.wood[1]; ctx.fillRect(x - 51, 0, 2, y + 8); ctx.fillRect(x + 50, 0, 2, y + 8);
    for (let i = -1; i < Math.ceil(h / 32); i++) { ctx.fillStyle = PAL.night[4]; ctx.fillRect(x - 65, i * 32 + motion, 8, 3); ctx.fillRect(x + 57, i * 32 + motion, 8, 3); }
    ctx.fillStyle = PAL.wood[1]; ctx.fillRect(x - 56, y, 112, 10);
    ctx.fillStyle = PAL.wood[4]; ctx.fillRect(x - 55, y, 110, 2);
    ctx.fillStyle = PAL.wood[2]; ctx.fillRect(x - 53, y + 4, 106, 3);
    const friends = this.run?.friends ?? this.game.state.friends;
    drawCharacter(ctx, 'hero', x - 22, y, { t, dir: 'down', hat: this.game.state.hat });
    friends.slice(0, 4).forEach((id, i) => drawSpirit(ctx, GUARDIANS[id].key, x + i * 18 - 2, y, { t, dir: 'down' }));
    ctx.fillStyle = PAL.gold[2]; ctx.fillRect(x - 47, y - 22, 7, 12);
    ctx.fillStyle = PAL.gold[5]; ctx.fillRect(x - 46, y - 19, 5, 6);
    ctx.fillStyle = PAL.cream[3]; ctx.fillRect(x - 45, y - 18, 2, 3);
    if (!picking) drawText(ctx, this.run ? `B${this.run.depth}` : 'STATIC WELL', x, portrait ? 12 : y + 20, { align: 'center', color: PAL.ui.gold });
  }
  _scoreLines(ctx, components, x, y, width) {
    const labels = { clear: 'Clears', efficiency: 'Damage / packet B', perfect: 'PERFECT casts', guard: 'Guard beats', warden: 'Wardens' };
    for (const [key, label] of Object.entries(labels)) { drawText(ctx, label, x, y, { font: 'small', color: PAL.ui.dim }); drawText(ctx, `+${components[key]}`, x + width, y, { font: 'small', align: 'right', color: PAL.ui.gold }); y += 11; }
  }
  draw(ctx, screen, t) {
    const { w, h, portrait } = screen, run = this.run, summary = this.summary;
    const card = run ? floorIdentity(run) : null;
    drawBattleBackground(ctx, screen, card?.warden ? 'warden' : 'well', t, { depth: run?.depth ?? 1, reduced: this.game.reducedMotion });
    this._shaft(ctx, screen, t);
    if (this.view === 'boon' || this.view === 'boon-taken') {
      const taken = this.boonReveal, held = Object.keys(run.boons).length;
      const offers = taken?.offers ?? boonOffers(run).map((id) => ({ id, ...offerInfo(run, id), held: run.boons[id] ?? 0 }));
      const top = portrait ? 68 : 56, cw = portrait ? w - 20 : Math.floor((w - 32) / 3), ch = portrait ? 68 : 126;
      drawText(ctx, `B${run.cleared} CLEAR +${run.lastFloor?.total ?? 0} · HELD ${held}/6`, portrait ? w / 2 : w - 12, portrait ? 54 : 15, { align: portrait ? 'center' : 'right', color: PAL.ui.gold, font: 'small' });
      drawText(ctx, 'Choose one boon, or skip', portrait ? w / 2 : w - 12, portrait ? 12 : 29, { align: portrait ? 'center' : 'right', color: PAL.ui.dim, font: 'small' });
      offers.forEach((info, i) => {
        const x = portrait ? 10 : 8 + i * (cw + 8), y = portrait ? top + i * (ch + 3) : top;
        const selected = taken ? taken.selected === i : this.selected === i;
        const [icon, decision] = BOON_STYLE[info.id];
        drawWindow(ctx, x, y, cw, ch, selected ? 'gold' : 'default', t);
        drawIcon(ctx, icon, x + 8, y + 7);
        drawText(ctx, fitText(info.name, cw - 32, 'small'), x + 22, y + 7, { font: 'small', color: PAL.ui.gold });
        drawText(ctx, info.rank ? (info.held ? 'RANK UP' : 'NEW') : 'ONE USE', x + 8, y + 19, { font: 'small', color: PAL.ui.dim });
        for (let pip = 0; pip < 2 && info.rank; pip++) {
          ctx.fillStyle = pip < info.rank ? PAL.gold[5] : PAL.night[5];
          ctx.fillRect(x + cw - 23 + pip * 8, y + 20, 5, 5);
        }
        const textY = y + (portrait ? 30 : 36);
        const after = drawParagraph(ctx, info.text, x + 8, textY, cw - 16, { font: 'small', color: PAL.ui.text });
        drawParagraph(ctx, decision, x + 8, portrait ? Math.max(y + 49, after + 2) : y + 77, cw - 16, { font: 'small', color: PAL.ui.gold });
        if (!portrait) drawText(ctx, info.rank ? `RANK ${info.rank}/2` : 'NO SLOT', x + 8, y + ch - 16, { font: 'small', color: PAL.ui.dim });
        if (taken?.selected === i) {
          // Local gold stamp, not a full-screen flash. Reduced motion uses the same static mark.
          const stampW = 50, stampX = x + cw - stampW - 7, stampY = y + ch - 17;
          ctx.fillStyle = PAL.night[2]; ctx.fillRect(stampX, stampY, stampW, 12);
          ctx.fillStyle = PAL.gold[5]; ctx.fillRect(stampX, stampY, stampW, 1);
          drawText(ctx, 'TAKEN', stampX + stampW / 2, stampY + 3, { align: 'center', font: 'small', color: PAL.ui.gold });
          if (!this.game.reducedMotion && taken.age < 0.18) {
            ctx.fillStyle = PAL.cream[3]; ctx.fillRect(x + 3, y + 3, cw - 6, 1); ctx.fillRect(x + 3, y + 3, 1, ch - 6);
          }
        }
      });
      const skipY = portrait ? top + offers.length * (ch + 3) + 3 : top + ch + 8;
      drawMenu(ctx, portrait ? 16 : Math.round(w / 2) - 52, skipY, [taken ? 'Boon taken' : 'Skip boon'], !taken && this.selected === offers.length ? 0 : -1, { colWidth: portrait ? w - 32 : 104, t: this.game.reducedMotion ? 0 : t });
      const chosen = offers[taken ? taken.selected : this.selected];
      if (!portrait && chosen && held >= 6 && !chosen.held && chosen.rank) drawText(ctx, 'Six held: choose which boon to drop next.', w / 2, h - 23, { font: 'small', align: 'center', color: PAL.ui.dim });
    } else {
      const ww = portrait ? w - 20 : Math.min(270, w - 158), x = portrait ? 10 : w - ww - 8;
      const panelH = portrait ? Math.min(218, h - 108) : Math.min(196, h - 16), y = portrait ? 98 : Math.round((h - panelH) / 2);
      drawWindow(ctx, x, y, ww, panelH, summary ? 'gold' : 'default', t);
      let menuY = y + 60;
      if (!this._unlocked()) { drawText(ctx, 'A lantern for later', x + 12, y + 12, { color: PAL.ui.gold }); drawParagraph(ctx, 'Bring two guardian friends. The Well will be here whenever you like.', x + 12, y + 33, ww - 24, { font: 'small' }); menuY = y + 104; }
      else if (summary) {
        drawText(ctx, `Cleared B${summary.depth} · ${summary.cause === 'defeat' ? 'Lantern home' : 'Climbed out'}`, x + 12, y + 11, { font: 'small', color: PAL.ui.gold });
        drawText(ctx, `Score ${summary.score} · seed ${seedHex(summary.seed)}`, x + 12, y + 27, { font: 'small' });
        this._scoreLines(ctx, summary.components, x + 12, y + 45, ww - 24);
        drawText(ctx, `Best B${this.game.state.progress?.well?.best ?? 0} · best D/B ${summary.bestRatio.toFixed(2)}`, x + 12, y + 106, { font: 'small', color: PAL.ui.dim }); menuY = y + 128;
      } else if (this.view === 'confirm') {
        drawText(ctx, 'End saved expedition?', x + 12, y + 12, { color: PAL.ui.gold, font: 'small' });
        drawParagraph(ctx, 'Only this run ends. Your island, discoveries and records stay.', x + 12, y + 34, ww - 24, { font: 'small' }); menuY = y + 82;
      } else if (this.view === 'replace') {
        drawText(ctx, fitText(`Take ${boonOf(this.replaceOffer).name}?`, ww - 24, 'small'), x + 12, y + 12, { color: PAL.ui.gold, font: 'small' });
        const drop = boonOf(this.menu[this.selected]?.key);
        drawText(ctx, fitText(`HELD 6/6 · ${drop ? `Drop ${drop.name}` : 'Keep all six'}`, ww - 24, 'small'), x + 12, y + 27, { color: PAL.ui.dim, font: 'small' });
        menuY = y + 48;
      }
      else if (run) {
        drawText(ctx, `B${card.depth} · ${card.warden ? 'WARDEN' : 'SPECIMEN'}${card.golden ? ' · GOLDEN' : ''}`, x + 12, y + 10, { color: PAL.ui.gold, font: 'small' });
        drawText(ctx, card.name, x + 12, y + 24, { color: PAL.ui.text });
        drawText(ctx, `${TECHNIQUES[card.family].name} · HP ${card.hp} · power ${card.power + (card.modifier?.id === 'warm-current' ? 2 : 0)}`, x + 12, y + 40, { font: 'small', color: PAL.ui.dim });
        drawParagraph(ctx, card.modifier ? `${card.modifier.name}: ${card.modifier.text}` : 'No modifier. Read the pattern, then descend.', x + 12, y + 53, ww - 24, { font: 'small' });
        drawText(ctx, `You: ${run.hero.hp}/${run.limits.maxHp} HP · ${run.hero.bytes} B · ${run.hero.snacks} snacks`, x + 12, y + 82, { font: 'small' });
        drawText(ctx, `Score ${run.score} · seed ${seedHex(run.seed)}`, x + 12, y + 95, { font: 'small', color: PAL.ui.dim });
        if (run.lastFloor) { const s = run.lastFloor; drawText(ctx, `Last: +${s.total} = 100 +${s.components.efficiency} D/B +${s.components.perfect} P`, x + 12, y + 109, { font: 'small', color: PAL.ui.gold }); drawText(ctx, `+${s.components.guard} guard +${s.components.warden} warden`, x + 12, y + 120, { font: 'small', color: PAL.ui.dim }); }
        menuY = y + 138;
      } else {
        drawText(ctx, 'The Static Well', x + 12, y + 12, { color: PAL.ui.gold });
        drawParagraph(ctx, 'Five-floor blocks. Your own 56 HP, 56 B, 3 snacks. No island risk.', x + 12, y + 34, ww - 24, { font: 'small' });
        drawText(ctx, `Best B${this.game.state.progress?.well?.best ?? 0} · generator v${RUN_VERSION}`, x + 12, y + 69, { font: 'small', color: PAL.ui.dim }); menuY = y + 94;
      }
      drawMenu(ctx, x + 12, menuY, this.menu, this.selected, { colWidth: ww - 24, rowHeight: this.view === 'replace' ? 17 : 15, t: this.game.reducedMotion ? 0 : t });
    }
    const touch = this.game.input.lastDevice === 'touch';
    drawText(ctx, touch ? 'Arrows choose · A confirm · B rest & leave' : 'Arrows choose · Enter confirm · Esc rest & leave', w / 2, h - 10, { align: 'center', font: 'small', color: PAL.ui.dim });
  }
  describe() {
    if (!this._unlocked()) return 'The Well welcomes you after two guardian friendships.';
    if (this.summary) return `Well expedition over. Cleared B${this.summary.depth}. Score ${this.summary.score}. Seed ${seedHex(this.summary.seed)}. Clear ${this.summary.components.clear}, efficiency ${this.summary.components.efficiency}, PERFECT ${this.summary.components.perfect}, guards ${this.summary.components.guard}, wardens ${this.summary.components.warden}.`;
    if (!this.run) return `Well entrance. ${this.game.state.wellRun ? 'Saved expedition available.' : 'New expedition available.'}`;
    if (this.view === 'boon-taken') return `${boonOf(this.boonReveal.id)?.name ?? this.boonReveal.id} taken. ${this.boonReveal.replacement ? `Replaced ${boonOf(this.boonReveal.replacement).name}. ` : ''}Held ${Object.keys(this.run.boons).length}/6. Continue when ready.`;
    if (this.view === 'replace') { const drop = boonOf(this.menu[this.selected]?.key); return `Held six boons. Take ${boonOf(this.replaceOffer).name}. ${drop ? `Replace ${drop.name} rank ${this.run.boons[drop.id]}.` : 'Keep all six and return to the offers.'}`; }
    if (this.view === 'boon') { const id = this.menu[this.selected]?.key; const info = id === 'skip' ? { name: 'Skip', text: 'Keep your current boons.' } : offerInfo(this.run, id); return `B${this.run.cleared} clear. Score ${this.run.score}. ${info.name}: ${info.text}`; }
    const floor = floorIdentity(this.run);
    return `Well B${this.run.depth}. ${floor.name}, ${floor.family}${floor.warden ? ', warden' : ''}${floor.golden ? ', golden' : ''}. ${floor.modifier ? `${floor.modifier.name}: ${floor.modifier.text}` : 'No modifier.'} Run HP ${this.run.hero.hp}/${this.run.limits.maxHp}, ${this.run.hero.bytes} byte charge, ${this.run.hero.snacks} snacks. Score ${this.run.score}.`;
  }
}
