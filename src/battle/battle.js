// The battle owns only its local copy of save data. The scene applies the result.
import { FOES, createEssence, attackFor } from './foes.js';
import { normalizeGear, buildSpell, defaultLocks, rangeTargets, lockDomains } from './spell.js';
import { drawBattleView, battleLayout, scanPanelContent } from './battle-view.js';
import { breathing, eventElapsed, guardJudgement, guardFeedback, GUARD_WINDOWS, TEACHING_GUARD_WINDOWS } from './timing.js';
import { formatFidelity } from './metrics.js';
import { Vfx } from '../art/vfx.js';
import { PAL } from '../art/palette.js';
import { clamp, lerp, rng } from '../engine/util.js';
import { BIT_CHOICES, TECHNIQUES, heroStats } from '../content/game-data.js';
import { COACH, LESSONS } from '../content/lessons.js';

const FALLBACK = {
  intro: 'The Static tangled this spirit. Find a grid that keeps its essence.',
  firstSnap: 'Watch the values. A tight range clips; a wide range makes big steps.',
  fizzle: 'Too noisy! Try a better range, more bits, or this spirit’s technique.',
  clipped: 'Orange motes fell outside the range. They clip to its edges.',
  perfect: 'Almost no reconstruction error. PERFECT adds a toy damage bonus!',
  technique: 'TUNE is free. Match the technique to the shape of the essence.',
  lowBytes: 'Not enough bytes. GUARD recovers 12 B; fewer bits cost less.',
  guard: 'Press confirm as the rings meet. Gold timing blocks more and returns 2 B.',
  charge: 'A heavy hit is coming. GUARD braces the next hit and restores bytes.',
  win: 'The Static breaks. A little precision, a new friend.',
};
const fmt = value => Number(value.toFixed(3)).toString();
const cloneLocks = locks => ({ ...locks, ranges: [...(locks.ranges ?? [])], lows: [...(locks.lows ?? [])], highs: [...(locks.highs ?? [])], protected: [...(locks.protected ?? [])] });
const cloneGear = gear => ({ ...gear, budget: gear.budget ? [...gear.budget] : null });
const FIRST_GRID = 'White dots are true values; lines are the levels. Red tethers show what the snap lost.';
// Session-only teaching memory, keyed by the save object without mutating it.
const guardTaught = new WeakSet();

export class Battle {
  constructor({ game, foeId, guardian = false, uid = null, zone = 0 }) {
    this.game = game;
    this.foe = FOES[foeId] ?? FOES['static-0'];
    this.foeId = this.foe.id;
    this.guardian = guardian;
    this.uid = uid;
    this.zone = zone;
    this.hero = { ...game.state.hero };
    this.techniques = [...(game.state.techniques ?? [])];
    this.gear = normalizeGear(cloneGear(game.state.gear ?? {}), this.techniques);
    if (this.techniques.includes('calib')) this.gear.calib = true;
    this.limits = game.stats?.() ?? heroStats(game.state);
    this.foeHp = this.foe.hp;
    this.bossPhase = 1;
    this.threadMax = this.foe.technique === 'groups' ? [Math.ceil(this.foe.hp / 3), Math.floor(this.foe.hp / 3), Math.floor(this.foe.hp / 3)] : null;
    if (this.threadMax) this.threadMax[2] = this.foe.hp - this.threadMax[0] - this.threadMax[1];
    this.threadHp = this.threadMax ? [...this.threadMax] : null;
    this.menu = 0;
    this.tuneIndex = 0;
    this.budgetIndex = 0;
    this.pickIndex = 0;
    this.phase = 'menu';
    this.phaseAge = 0;
    this.message = '';
    this.messageAge = 0;
    this.finished = false;
    this.result = null;
    this.stats = { perfects: 0, fizzles: 0, turns: 0, casts: 0, successes: 0, guards: 0, snacks: 0, guardBeats: 0, perfectGuards: 0, goodGuards: 0 };
    this.seen = new Set();
    this.lastSpell = null;
    this.lastCast = null;
    this.lastDamage = 0;
    this.resultMessages = [];
    this.braced = false;
    this.vfx = new Vfx({ reduced: game.reducedMotion });
    let seed = 7321 + zone * 101;
    for (const char of String(uid ?? foeId)) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
    this.random = rng(seed);
    this._beginTurn(true);
  }

  get canPause() { return this.phase === 'menu'; }

  get tuneItems() {
    const items = [];
    if (this.techniques.includes('bits')) items.push({ key: 'bits', label: 'Bit Dial', value: this.gear.bits + ' BIT', active: true });
    for (const key of ['zero', 'calib', 'groups', 'spotlight', 'balance', 'budget']) {
      if (!this.techniques.includes(key)) continue;
      const value = key === 'spotlight' ? (this.gear.spotlight ? this.gear.spotlight + ' KEPT' : 'OFF')
        : key === 'budget' ? (this.gear.budget ? this.gear.budget.join('/') : 'OFF') : this.gear[key] ? 'ON' : 'OFF';
      items.push({ key, label: TECHNIQUES[key].name, value, active: Boolean(this.gear[key]) });
    }
    items.push({ key: 'ready', label: 'Ready', value: this.game.input?.lastDevice === 'touch' ? 'A' : 'ENTER', active: true });
    return items;
  }

  get techniqueAvailable() { return this.techniques.includes(this.foe.technique); }

  get availableHint() {
    if (this.techniqueAvailable) return this.foe.hint ?? TECHNIQUES[this.foe.technique]?.short ?? 'Fit the range before buying extra bits.';
    return this.techniques.includes('bits')
      ? 'More bits can help until you learn ' + (TECHNIQUES[this.foe.technique]?.name ?? 'the next tool') + '. Fit the range first.'
      : 'Fit your current 4-bit grid around the motes. A Grid Stone unlocks more tools.';
  }

  get gridModel() {
    const last = this.phase === 'scan' && this.scanPage > 0 ? this.lastCast : null;
    const revealed = Boolean(last) || ['snap', 'cast-result', 'result'].includes(this.phase);
    const spell = last?.spell ?? (revealed && this.lastSpell ? this.lastSpell : this.preview);
    const essence = last?.essence ?? this.essence;
    const hidden = Boolean(essence.hidden && !revealed);
    const priorRow = this.lastCast?.spell.rows[0];
    return {
      ...spell,
      view: essence.hidden ? { min: -2.4, max: 2.4 } : spell.view,
      snap: this.phase === 'snap' ? clamp(this.phaseAge / 0.42) : revealed ? 1 : 0,
      activeRow: last ? this.scanPage - 1 : this.phase === 'budget' ? this.budgetIndex : this.phase === 'cast-result' ? this.inspectRow ?? 0 : Math.max(0, spell.rows.findIndex(row => row.group === (this.lockSteps?.[this.lockIndex]?.group ?? 0))),
      hidden, ghosts: this.gear.calib ? essence.ghosts : undefined,
      retainedBracket: essence.hidden && priorRow && !last ? { lo: priorRow.lo, hi: priorRow.hi } : undefined,
      showError: revealed, showCodes: true,
      breathing: ['lock', 'balance'].includes(this.phase),
      fidelityLabel: spell.threadFidelities ? 'Thread minimum' : ['lock', 'balance'].includes(this.phase) ? 'Live fidelity' : spell.metric === 'output' ? 'Output fidelity' : spell.metric === 'sensitivity-weighted values' ? 'Weighted fidelity' : 'Fidelity',
      fidelity: hidden ? undefined : spell.fidelity,
      scoreFidelity: hidden ? undefined : spell.threadFidelities ? Math.min(...spell.threadFidelities) : spell.fidelity,
      floor: this.foe.floor,
      damage: hidden ? undefined : spell.damage,
      reducedMotion: this.game.reducedMotion,
    };
  }

  get lockLabel() {
    const step = this.lockSteps?.[this.lockIndex];
    if (!step) return 'LOCK RANGE';
    return (step.kind === 'r' ? 'RANGE' : step.kind === 'lo' ? 'LOW EDGE' : 'HIGH EDGE') + ' · ' + this.targets[step.group].label;
  }

  _sound(name) { this.game.audio?.play(name); }
  _say(text) { this.message = text; this.messageAge = 0; this.game.announce?.(text); }
  _coach(key, fallback, retain = false) {
    if (this.seen.has(key)) return false;
    let line = key === 'gridReading' ? FIRST_GRID : COACH[this.foeId]?.[key] ?? fallback ?? FALLBACK[key];
    if (!this.techniqueAvailable && ['intro', 'technique', 'fizzle', 'phase2', 'thinThread', 'win'].includes(key)) line = this.availableHint;
    if (!this.techniqueAvailable && key === 'firstSnap') line = 'Follow a true value to its nearest level. Short red tethers mean less error.';
    if (!this.techniqueAvailable && key === 'clipped') line = 'Orange values escaped the grid. Leave more room when you lock the next range.';
    if (!this.techniqueAvailable && key === 'perfect') line = 'A clean reconstruction! A faithful snap turns the same bytes into more damage.';
    if (!this.techniques.includes('bits') && key === 'lowBytes') line = 'Not enough bytes. GUARD recovers 12 B and braces the next hit.';
    if (!line) return false;
    this.seen.add(key);
    if (retain) this.resultMessages.push(line);
    else this._say(line);
    return true;
  }
  _phase(phase) { this.phase = phase; this.phaseAge = 0; }
  _refresh() { this.preview = buildSpell(this.essence, this.gear, this.locks, this.limits.power, this.foe.floor); }

  _beginTurn(first = false) {
    this.hero.bytes = Math.min(this.limits.maxBytes, this.hero.bytes + 4);
    const changedPhase = this.foeId === 'auric' && (this.foeHp <= this.foe.hp / 2 || this.stats.successes >= 2) && this.bossPhase === 1;
    if (changedPhase) this.bossPhase = 2;
    const oldMorph = this.essence?.morphStage;
    this.essence = createEssence(this.foeId, this.stats.turns, this.random, this.bossPhase, { successes: this.stats.successes });
    const weights = this.essence.weights ?? this.essence.rows.flatMap(row => row.values);
    this.salience = weights.map((weight, i) => this.essence.inputs?.length ? Math.max(...this.essence.inputs.map(row => Math.abs(row[i] ?? 0))) : Math.abs(weight));
    this.locks = this._defaultLocks();
    this.attack = attackFor(this.foeId, this.stats.turns, this.bossPhase);
    this.charging = Boolean(this.attack.charge);
    this._refresh();
    this._phase('menu');
    if (first) this._coach('intro', this.foe.intro);
    else if (changedPhase) this._coach('phase2', 'Auric changes shape! Recheck which head needs the most bits.');
    else if (oldMorph !== this.essence.morphStage && this.essence.morphHint) this._say(this.techniqueAvailable ? this.essence.morphHint : this.availableHint);
    else if (this.charging) { this._sound('charge'); if (!this._coach('charge')) this._say(this.attack.telegraph); }
    else if (this.essence.forecast) this._say(this.essence.forecast + ' · +4 B');
    else this._say('+4 B. The essence shifts. Find its new fit.');
  }

  _defaultLocks() {
    const locks = cloneLocks(defaultLocks(this.essence, this.gear));
    if (this.essence.hidden && this.lastCast) {
      locks.ranges = [...this.lastCast.locks.ranges];
      locks.lows = [...this.lastCast.locks.lows];
      locks.highs = [...this.lastCast.locks.highs];
    }
    return locks;
  }

  _previewDefaults() { this.locks = this._defaultLocks(); this._refresh(); }

  _changeTune(direction) {
    const item = this.tuneItems[this.tuneIndex];
    if (!item || item.key === 'ready') return;
    const key = item.key;
    if (key === 'bits') this.gear.bits = BIT_CHOICES[(BIT_CHOICES.indexOf(this.gear.bits) + direction + BIT_CHOICES.length) % BIT_CHOICES.length];
    else if (key === 'spotlight') this.gear.spotlight = (this.gear.spotlight + direction + 3) % 3;
    else if (key === 'budget') this.gear.budget = this.gear.budget ? null : [4, 3, 2];
    else this.gear[key] = !this.gear[key];
    this._previewDefaults();
    this._sound('menu-move');
    this._say(TECHNIQUES[key]?.short ?? 'Change the grid, not the true values.');
  }

  _startCast() {
    if (this.preview.cost > this.hero.bytes && !this.gear.budget) {
      this._sound('fizzle');
      this._say('Need ' + this.preview.cost + ' B; you have ' + this.hero.bytes + '. ' + (this.techniques.includes('bits') ? 'GUARD or choose fewer bits.' : 'GUARD restores 12 B.'));
      this._coach('lowBytes');
      return;
    }
    this.locks = this._defaultLocks();
    this._sound('cast');
    const view = this.preview.view;
    const values = this.essence.rows.flatMap(row => row.values).slice(0, 24);
    if (!this.essence.hidden) this.game.audio?.glide?.(values.map(v => clamp((v - view.min) / (view.max - view.min || 1))), { duration: 0.25 });
    if (this.gear.budget) {
      this.budgetIndex = 0; this._phase('budget');
      this._say('Spend bits where errors matter. Compare each head and the weighted fidelity preview.');
    }
    else this._startSpecialLocks();
  }

  _startSpecialLocks() {
    if (this.gear.spotlight) {
      this.locks.protected = [];
      this.pickIndex = 0;
      this._phase('spotlight');
      this._say('Keep ' + this.gear.spotlight + ' weights exactly. Hot inputs amplify their errors. +3 B each.');
      this._coach('hot');
    } else this._startBalance();
  }

  _startBalance() {
    if (this.gear.balance && this.essence.inputs?.length) {
      this.breathAge = 0;
      this.locks.alpha = 0.5;
      this._phase('balance');
      this._say('A shrinks; W grows; raw A×W stays the same. Lock alpha, then compare rounded products.');
    } else this._startRangeLocks();
  }

  _startRangeLocks() {
    this.targets = rangeTargets(this.essence, this.gear, this.locks);
    if (!this.essence.hidden) {
      this.locks.ranges = this.targets.map(target => target.amax || 1);
      this.locks.lows = this.targets.map(target => target.min);
      this.locks.highs = this.targets.map(target => target.max);
    }
    this.domains = lockDomains(this.essence, this.gear, this.locks);
    this.lockSteps = this.targets.flatMap((target, group) => this.gear.zero ? [{ kind: 'lo', group }, { kind: 'hi', group }] : [{ kind: 'r', group }]);
    this.lockIndex = 0;
    this.breathAge = 0;
    this._phase('lock');
    this._refresh();
    if (!this.seen.has('gridReading')) this._say(FIRST_GRID);
    else if (this.essence.hidden) this._say((this.essence.forecast ?? 'The live wave is hidden.') + ' Both archives stay on the same ruler.');
    else this._say('Lock the breathing grid. Hold steady to slow it; go back to retune.');
  }

  _breatheAt(elapsed) {
    const p = breathing(elapsed, Math.max(1.6, 2.12 - this.foe.zone * 0.065));
    if (this.phase === 'balance') {
      this.locks.alpha = p;
      const targets = rangeTargets(this.essence, this.gear, this.locks);
      this.locks.ranges = targets.map(target => target.amax);
      this.locks.lows = targets.map(target => target.min);
      this.locks.highs = targets.map(target => target.max);
    } else {
      const step = this.lockSteps[this.lockIndex];
      const domain = this.domains[step.group][step.kind];
      const value = lerp(domain[0], domain[1], p);
      if (step.kind === 'r') this.locks.ranges[step.group] = value;
      if (step.kind === 'lo') this.locks.lows[step.group] = value;
      if (step.kind === 'hi') this.locks.highs[step.group] = Math.max(value, this.locks.lows[step.group] + 1e-8);
    }
    this._refresh();
  }

  _commitCast() {
    this._refresh();
    if (this.preview.cost > this.hero.bytes) {
      this._phase('menu');
      this._say('That packet needs ' + this.preview.cost + ' B. GUARD restores 12 B.');
      this._sound('fizzle');
      return;
    }
    this.hero.bytes -= this.preview.cost;
    this.stats.turns++;
    this.stats.casts++;
    this.lastSpell = this.preview;
    this.lastCast = { spell: this.lastSpell, essence: this.essence, locks: cloneLocks(this.locks), gear: cloneGear(this.gear) };
    this.lastDamage = 0;
    this._phase('snap');
    this._sound('snap');
    const spell = this.lastSpell;
    const { min, max } = spell.view;
    const notes = spell.rows.flatMap(row => row.recon).slice(0, 24).map(value => clamp((value - min) / (max - min || 1)));
    this.game.audio?.snapNotes?.(notes, { bits: this.gear.bits, gap: 0.025 });
    this._effect('snap');
    this._say('SNAP! Values slide to the nearest reconstruction level.');
  }

  _castResult() {
    const spell = this.lastSpell;
    if (this.threadHp && spell.threadDamages) {
      this.threadHp = this.threadHp.map((hp, i) => {
        const damage = Math.min(hp, spell.threadDamages[i] ?? 0);
        this.lastDamage += damage;
        return hp - damage;
      });
      this.foeHp = this.threadHp.reduce((sum, hp) => sum + hp, 0);
    } else {
      this.lastDamage = Math.min(this.foeHp, spell.damage);
      this.foeHp -= this.lastDamage;
    }
    if (spell.fizzle) this.stats.fizzles++;
    if (spell.perfect) this.stats.perfects++;
    if (this.lastDamage > 0) this.stats.successes++;
    this._phase('cast-result');
    const kind = spell.fizzle ? 'fizzle' : spell.perfect ? 'perfect' : 'hit';
    this._sound(kind);
    if (spell.clippedCount) this._sound('clip');
    this._effect(kind);
    const anchor = this._anchor();
    this.vfx.text(spell.fizzle ? 'FIZZLE' : String(this.lastDamage), anchor.x, anchor.y - 56, { color: spell.fizzle ? PAL.ui.dim : spell.perfect ? PAL.ui.gold : PAL.ui.text, ms: 950 });
    if (!this.game.reducedMotion && this.lastDamage) this.vfx.shake(spell.perfect ? 4 : 2, 180);
    const score = spell.threadFidelities ? Math.min(...spell.threadFidelities) : spell.fidelity;
    this.resultSummary = (spell.perfect ? 'PERFECT! ' : spell.fizzle ? 'FIZZLE! ' : '') + this.lastDamage + ' damage · ' + formatFidelity(score) + (spell.threadFidelities ? ' weakest thread · ' : ' fidelity · ') + spell.cost + ' B.';
    this.resultMessages = [];
    this._coach('gridReading', FIRST_GRID, true);
    this._coach('firstSnap', undefined, true);
    this._coach('technique', undefined, true);
    if (spell.fizzle) this._coach('fizzle', undefined, true);
    else if (spell.perfect) {
      if (spell.clippedCount) this._coach('clippedPerfect', 'PERFECT fit — tiny clipping stayed within the error budget.', true);
      else this._coach('perfect', undefined, true);
    } else if (spell.clippedCount && score < 0.95) this._coach('clipped', undefined, true);
    if (this.threadHp && spell.threadDamages?.some(damage => damage === 0)) this._coach('thinThread', 'The thin thread rounded to zero. It needs its own ruler.', true);
    this.resultRetained = this.resultMessages.length > 0 || spell.fizzle || Boolean(spell.clippedCount && score < 0.95);
    this._say(this.resultMessages.shift() ?? this.resultSummary);
  }

  _startEnemy() {
    if (this.foeHp <= 0) return this._end('won');
    this._phase('telegraph');
    this._sound(this.attack.charge ? 'charge' : 'enemy');
    this._say(this.attack.telegraph);
  }

  _startGuard() {
    this.guardElapsed = 0;
    this.hitIndex = 0;
    this.guardTarget = this.attack.gaps?.[0] ?? 0.85;
    this.guardAttempt = null;
    this.guardFeedback = '';
    this.guardTeaching = !guardTaught.has(this.game.state) && !(this.game.hasFlag?.('guard-taught') ?? this.game.state.flags?.includes('guard-taught'));
    this.guardReadyReleased = false;
    this._phase(this.guardTeaching ? 'guard-ready' : 'guard');
    if (this.guardTeaching) this._say('Release, then tap once when the rings meet. The first beat has a wider timing window.');
    else this._say('One tap per beat. Wait for the moving ring to meet the shield ring.');
  }

  get guardWindows() {
    return this.guardTeaching && this.hitIndex === 0 ? TEACHING_GUARD_WINDOWS : GUARD_WINDOWS;
  }

  _resolveHit() {
    const judgement = this.guardAttempt ?? guardJudgement(1, this.braced);
    this.stats.guardBeats++;
    if (judgement.grade === 'perfect') this.stats.perfectGuards++;
    if (judgement.grade === 'good') this.stats.goodGuards++;
    if (!this.guardAttempt) this.guardFeedback = 'LATE';
    const damage = Math.max(1, Math.round(this.attack.hits[this.hitIndex] * judgement.multiplier));
    this.hero.hp = Math.max(0, this.hero.hp - damage);
    this.hero.bytes = Math.min(this.limits.maxBytes, this.hero.bytes + judgement.bytes);
    this.braced = false;
    this._sound(judgement.grade === 'perfect' ? 'guard-perfect' : judgement.grade === 'good' ? 'guard-good' : 'hurt');
    const r = battleLayout(this.game.screen ?? { w: 384, h: 216 }).party;
    this.vfx.spawn(judgement.grade === 'miss' ? 'hit' : 'guard', r.x + Math.floor(r.w / 2), r.y + 12);
    this.vfx.text('-' + damage, r.x + Math.floor(r.w / 2), r.y, { color: judgement.grade === 'miss' ? PAL.ui.bad : PAL.ui.good, font: 'body', ms: 600, rise: 14 });
    this._say((judgement.grade === 'perfect' ? 'PERFECT guard! +2 B. ' : judgement.grade === 'good' ? 'GOOD guard! ' : this.guardFeedback + ' — tap used. ') + damage + ' HP lost.');
    if (this.hero.hp <= 0) return this._end('lost');
    this.hitIndex++;
    if (this.hitIndex >= this.attack.hits.length) {
      this._phase('enemy-result');
    } else {
      this.guardTarget += this.attack.gaps?.[this.hitIndex] ?? 0.62;
      this.guardAttempt = null;
      this.guardFeedback = '';
    }
  }

  _anchor() {
    const layout = battleLayout(this.game.screen ?? { w: 384, h: 216 }, this.foeId, Boolean(this.essence.inputs));
    const stage = ['lock', 'balance', 'snap', 'cast-result'].includes(this.phase) ? layout.castStage : layout.stage;
    return { x: stage.x + Math.floor(stage.w / 2), y: stage.y + Math.round(stage.h * 0.55) + 40 };
  }
  _effect(kind) { const p = this._anchor(); this.vfx.spawn(kind, p.x, p.y - 40); }

  _end(outcome) {
    this._phase('result');
    this.result = { outcome, hero: { ...this.hero }, gear: cloneGear(this.gear), guardian: this.guardian, foeId: this.foeId, stats: { ...this.stats }, guardTaught: guardTaught.has(this.game.state) };
    if (outcome === 'won' && !this.guardian) this.result.reward = { bytes: 6 };
    this.recap = outcome === 'won' ? this.techniqueAvailable ? LESSONS[this.foe.technique]?.recap ?? 'Fewer bytes, faithful values. That is the art of quantization.' : 'Fit a useful range with the tools you have. Grid Stones bring new choices.'
      : outcome === 'lost' ? 'Friends stay with you. Rest, retune, and try again.' : 'Nothing is lost. The guardian waits with a fresh essence.';
    if (outcome === 'won') {
      this._sound('win');
      this._effect('purify');
      this._say(this.guardian ? this.foe.name + ' became your friend!' : 'You cleared a pocket of Static!');
      this._coach('win');
    } else {
      this._sound(outcome === 'lost' ? 'hurt' : 'menu-back');
      this._say(outcome === 'lost' ? 'Your friends carry you to the campfire.' : 'You leave the fight. The guardian will reset.');
    }
  }

  _scan() {
    this.scanPage = 0;
    this._phase('scan');
    this._scanPage();
    this._sound('scan');
    this._say(this.availableHint);
  }

  _scanPage() {
    this.scanScroll = 0;
    if (this.scanPage > 0 && this.lastCast) {
      const spell = this.lastCast.spell;
      this.scanLines = [
        'Last snap · ' + spell.cost + ' B · ' + this.lastDamage + ' damage',
        formatFidelity(spell.fidelity) + ' ' + (spell.metric === 'output' ? 'output fidelity' : 'fidelity'),
        ...spell.rows.map(row => row.label + ': ' + fmt(row.lo) + ' to ' + fmt(row.hi)),
        spell.clippedCount + ' clipped · red tethers are error',
      ];
      return;
    }
    const values = this.essence.hidden ? this.essence.ghosts ?? [] : this.essence.rows.flatMap(row => row.values);
    const rms = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / Math.max(1, values.length));
    const outliers = values.filter(value => Math.abs(value) > rms * 2).length;
    if (this.essence.hidden) {
      const p90 = archive => {
        const sorted = [...archive].map(Math.abs).sort((a, b) => a - b);
        return fmt(sorted[Math.floor((sorted.length - 1) * 0.9)] ?? 0);
      };
      this.scanLines = [
        'Live wave hidden. ' + values.length + ' archived values.',
        'Min ' + fmt(Math.min(...values)) + ' · max ' + fmt(Math.max(...values)) + ' · outliers ' + outliers,
        '90% of past calm values fit within ±' + p90(this.essence.archive.calm) + '.',
        '90% of past storm values fit within ±' + p90(this.essence.archive.storm) + '.',
        this.essence.forecast ?? 'Read the forecast before choosing a range.',
      ];
    } else this.scanLines = [
      values.length + ' values · ' + this.essence.rows.length + ' row(s)',
      'Min ' + fmt(Math.min(...values)) + ' · max ' + fmt(Math.max(...values)),
      'Outliers (>2× RMS): ' + outliers,
      ...(this.essence.inputs ? ['Fidelity compares outputs: sum a×w.', 'Hot channels: ' + this.salience.map((value, index) => ({ value, index })).sort((a, b) => b.value - a.value).slice(0, 2).map(item => item.index + 1).join(', ')] : []),
      this.availableHint,
    ];
  }

  update(dt, input) {
    if (this.finished) return;
    const now = performance.now();
    this.phaseAge += dt;
    this.messageAge += dt;
    this.vfx.update(dt);
    const confirm = input.pressed('confirm');
    const cancel = input.pressed('cancel');
    const speed = input.held('confirm') ? 2.5 : 1;
    const take = action => input.consume(action);
    const back = () => { take('cancel'); input.consume('pause'); this._sound('menu-back'); this._phase('menu'); this._previewDefaults(); this._say('Ready when you are. TUNE and SCAN are free.'); };
    if (this.phase === 'result') {
      if (confirm && this.phaseAge > 0.5) { take('confirm'); this._sound('select'); this.finished = true; }
      return;
    }
    if (['scan', 'tune', 'budget', 'spotlight', 'balance', 'lock'].includes(this.phase) && cancel) { back(); return; }
    if (this.phase === 'menu') {
      let next = this.menu;
      if (input.repeat('left')) next = this.menu % 2 === 0 ? this.menu + 1 : this.menu - 1;
      if (input.repeat('right')) next = this.menu % 2 === 0 ? this.menu + 1 : this.menu - 1;
      if (input.repeat('up')) next = (this.menu + 4) % 6;
      if (input.repeat('down')) next = (this.menu + 2) % 6;
      if (next !== this.menu) { this.menu = next; this._sound('menu-move'); }
      if (!confirm) return;
      take('confirm'); this._sound('select');
      if (this.menu === 0) this._startCast();
      if (this.menu === 1) {
        if (this.tuneItems.length === 1) { this._say('No tuning tools yet. Choose SNAP and fit your current grid.'); this._sound('menu-back'); return; }
        this.tuneIndex = 0; this._phase('tune'); this._say('Choose only the tools you need. A smaller packet leaves bytes for later.');
      }
      if (this.menu === 2) {
        this.stats.turns++; this.stats.guards++; this.braced = true;
        this.hero.bytes = Math.min(this.limits.maxBytes, this.hero.bytes + 12);
        this._sound('guard'); this._startEnemy();
      }
      if (this.menu === 3) {
        if (this.hero.snacks <= 0) { this._say('No snacks left. A campfire will restock them.'); this._sound('menu-back'); return; }
        this.hero.snacks--; this.hero.hp = Math.min(this.limits.maxHp, this.hero.hp + Math.ceil(this.limits.maxHp * 0.5));
        this.stats.turns++; this.stats.snacks++; this._sound('heal'); this._effect('heal'); this._startEnemy();
      }
      if (this.menu === 4) this._scan();
      if (this.menu === 5) this._end('fled');
      return;
    }
    if (this.phase === 'tune') {
      if (input.repeat('up')) { this.tuneIndex = (this.tuneIndex + this.tuneItems.length - 1) % this.tuneItems.length; this._sound('menu-move'); }
      if (input.repeat('down')) { this.tuneIndex = (this.tuneIndex + 1) % this.tuneItems.length; this._sound('menu-move'); }
      if (input.repeat('left')) this._changeTune(-1);
      if (input.repeat('right')) this._changeTune(1);
      if (confirm) { take('confirm'); if (this.tuneItems[this.tuneIndex].key === 'ready') back(); else this._changeTune(1); }
      return;
    }
    if (this.phase === 'scan') {
      if (this.lastCast && (input.repeat('left') || input.repeat('right'))) {
        const pages = this.lastCast.spell.rows.length + 1;
        this.scanPage = (this.scanPage + (input.repeat('right') ? 1 : -1) + pages) % pages;
        this._scanPage(); this._sound('menu-move');
      }
      const { rows, capacity } = scanPanelContent(this, battleLayout(this.game.screen ?? { w: 384, h: 216 }, this.foeId));
      const scroll = input.repeat('up') ? -1 : input.repeat('down') ? 1 : 0;
      if (scroll) { this.scanScroll = clamp(this.scanScroll + scroll, 0, Math.max(0, rows.length - capacity)); this._sound('menu-move'); }
      if (confirm) { take('confirm'); back(); }
      return;
    }
    if (this.phase === 'budget') {
      if (input.repeat('up')) { this.budgetIndex = (this.budgetIndex + 2) % 3; this._sound('menu-move'); }
      if (input.repeat('down')) { this.budgetIndex = (this.budgetIndex + 1) % 3; this._sound('menu-move'); }
      const direction = input.repeat('left') ? -1 : input.repeat('right') ? 1 : 0;
      if (direction) { const i = this.budgetIndex; this.gear.budget[i] = BIT_CHOICES[(BIT_CHOICES.indexOf(this.gear.budget[i]) + direction + 4) % 4]; this._previewDefaults(); this._sound('menu-move'); }
      if (confirm) { take('confirm'); this._sound('lock'); this._startSpecialLocks(); }
      return;
    }
    if (this.phase === 'spotlight') {
      const direction = input.repeat('left') ? -1 : input.repeat('right') ? 1 : input.repeat('up') ? -8 : input.repeat('down') ? 8 : 0;
      if (direction) { this.pickIndex = (this.pickIndex + direction + this.salience.length) % this.salience.length; this._sound('menu-move'); }
      if (confirm) {
        take('confirm'); this._sound('lock');
        const at = this.locks.protected.indexOf(this.pickIndex);
        if (at >= 0) this.locks.protected.splice(at, 1); else this.locks.protected.push(this.pickIndex);
        this._refresh();
        if (this.locks.protected.length >= this.gear.spotlight) this._startBalance();
      }
      return;
    }
    if (this.phase === 'balance' || this.phase === 'lock') {
      const steady = input.held('run') ? 0.5 : 1;
      this.breathAge += dt * steady;
      this._breatheAt(confirm ? eventElapsed(this.breathAge, input, now, dt, steady) : this.breathAge);
      if (confirm) {
        take('confirm'); this._sound('lock');
        if (this.phase === 'balance') this._startRangeLocks();
        else if (++this.lockIndex >= this.lockSteps.length) this._commitCast();
        else { this.breathAge = 0; this._say(this.lockLabel + '. Each ruler spends metadata bytes.'); }
      }
      return;
    }
    if (this.phase === 'snap') { this.phaseAge += dt * (speed - 1); if (this.phaseAge >= 0.5) this._castResult(); return; }
    if (this.phase === 'cast-result') {
      const direction = input.repeat('left') ? -1 : input.repeat('right') ? 1 : 0;
      if (direction) {
        this.inspectRow = ((this.inspectRow ?? 0) + direction + this.lastSpell.rows.length) % this.lastSpell.rows.length;
        this.resultRetained = true; this._sound('menu-move');
      }
      if (!this.resultRetained) this.phaseAge += dt * (speed - 1);
      if ((confirm && this.phaseAge >= 0.25) || (!this.resultRetained && this.phaseAge >= 1.4)) {
        if (confirm) { take('confirm'); this._sound('select'); }
        if (this.resultMessages.length) { this._say(this.resultMessages.shift()); this.phaseAge = 0; }
        else this._startEnemy();
      }
      return;
    }
    if (this.phase === 'telegraph') { this.phaseAge += dt * (speed - 1); if (this.phaseAge >= 0.8) this._startGuard(); return; }
    if (this.phase === 'guard-ready') {
      if (!input.held('confirm')) this.guardReadyReleased = true;
      if (confirm && this.guardReadyReleased && this.phaseAge >= 0.25) {
        take('confirm'); guardTaught.add(this.game.state); this._phase('guard'); this._sound('select');
      }
      return;
    }
    if (this.phase === 'guard') {
      this.guardElapsed += dt;
      if (confirm) {
        take('confirm');
        if (this.guardAttempt == null) {
          const error = eventElapsed(this.guardElapsed, input, now, dt) - this.guardTarget;
          this.guardAttempt = guardJudgement(error, this.braced, this.guardWindows);
          this.guardFeedback = guardFeedback(error, this.guardAttempt);
          this._say(this.guardFeedback + ' · tap used for this beat.');
        }
      }
      if (this.guardElapsed >= this.guardTarget + this.guardWindows.good + 0.1) this._resolveHit();
      return;
    }
    if (this.phase === 'enemy-result') { this.phaseAge += dt * (speed - 1); if (this.phaseAge >= 0.45) this._beginTurn(); }
  }

  draw(ctx, screen, t) { drawBattleView(ctx, screen, this, t); }

  describe() {
    return 'Foe ' + this.foeId + '. Phase ' + this.phase + '. Foe HP ' + this.foeHp + '/' + this.foe.hp + '. Hero HP ' + this.hero.hp + '. Bytes ' + this.hero.bytes + '. Cost ' + this.preview.cost + '. Menu ' + ['SNAP', 'TUNE', 'GUARD', 'SNACK', 'SCAN', 'FLEE'][this.menu]
      + (this.phase === 'lock' ? '. Lock ' + this.lockLabel : '')
      + (this.phase === 'guard' ? '. Hit ' + (this.hitIndex + 1) + '/' + this.attack.hits.length : '')
      + (this.lastSpell ? '. Last fidelity ' + this.lastSpell.fidelity.toFixed(3) + '. Damage ' + this.lastDamage : '')
      + (this.result ? '. Result ' + this.result.outcome : '') + '. ' + this.message.replaceAll('*', '');
  }
}
