// Game orchestration: scenes, overlays, transitions, persistence and audio.
// Scenes and overlays receive this object as `game` (see the v2 contract, §3).
import { Screen } from './engine/screen.js';
import { Input } from './engine/input.js';
import { makeCanvas } from './engine/util.js';
import { GameAudio } from './audio/audio.js';
import { loadGame, newGame as freshState, saveGame } from './state.js';
import { GUARDIANS, ZONES, heroStats } from './content/game-data.js';
import { DialogueBox } from './ui/dialogue.js';
import { LessonCard } from './ui/lesson.js';
import { PauseMenu } from './ui/pause.js';
import { Codex } from './ui/codex.js';
import { Toasts } from './ui/toasts.js';
import { TitleScene } from './scenes/title.js';
import { IntroScene } from './scenes/intro.js';
import { EndingScene } from './scenes/ending.js';
import { WorldScene } from './scenes/world-scene.js';
import { BattleScene } from './scenes/battle-scene.js';
import { drawTransition } from './art/transitions.js';

const COVER_SECONDS = { fade: 0.32, 'battle-in': 0.9, 'battle-out': 0.45, wipe: 0.4 };

export class Game {
  constructor({ canvas, stage, storage = globalThis.localStorage }) {
    this.storage = storage;
    this.screen = new Screen(canvas, stage);
    this.input = new Input(window);
    this.state = loadGame(storage);
    this.audio = new GameAudio(false);
    this.saving = true;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion = motion.matches;
    motion.addEventListener?.('change', () => (this.reducedMotion = motion.matches));
    this.time = 0;
    this.transition = null;
    // Victory recap card waits until the zone's colour flood has played.
    this.pendingRecap = null;
    this.recapAt = 0;
    this.dialogue = new DialogueBox(this);
    this.lessonCard = new LessonCard(this);
    this.pauseMenu = new PauseMenu(this);
    this.codex = new Codex(this);
    this.toasts = new Toasts(this);
    this.titleScene = new TitleScene(this);
    this.introScene = new IntroScene(this);
    this.endingScene = new EndingScene(this);
    this.worldScene = new WorldScene(this);
    this.battleScene = new BattleScene(this);
    this.scene = this.titleScene;
    this.scene.enter();
    this._readout = document.querySelector('#readout');
    this._lastAnnounce = '';
    this._wireButtons();
    this._syncMusicButton();
  }

  // ── Audio, music and page controls ────────────────────────────────────────

  /** Called from a user gesture (Title Enter): create/resume audio and start music. */
  startAudio() {
    this.audio.setEnabled(this.state.music);
    this.audio.unlock().then((running) => {
      if (this.state.music && !running) this.toast('Music is unavailable in this browser.', { kind: 'notice' });
    });
  }

  setMusicScene(name) {
    if (!this.audio.setScene(name)) this.audio.setScene('overworld');
  }

  toggleMusic() {
    this.state.music = !this.state.music;
    this.audio.setEnabled(this.state.music);
    if (this.scene !== this.titleScene) this.audio.unlock();
    this.toast(this.state.music ? 'Music on' : 'Music off', { kind: 'notice', ms: 1200 });
    this._syncMusicButton();
    this.save();
  }

  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => this.toast('Full screen is unavailable here.'));
  }

  _wireButtons() {
    // Return keyboard focus to the game after mouse clicks on page buttons
    // (Input ignores keys while a plain button is focused).
    const refocus = () => this.screen.canvas.focus({ preventScroll: true });
    document.querySelector('#music-toggle')?.addEventListener('click', () => {
      this.toggleMusic();
      refocus();
    });
    document.querySelector('#fullscreen-toggle')?.addEventListener('click', () => {
      this.toggleFullscreen();
      refocus();
    });
    const touch = document.querySelector('#touch');
    if (touch) this.input.bindTouch(touch);
    this.screen.canvas.addEventListener('pointerdown', refocus);
  }

  _syncMusicButton() {
    const button = document.querySelector('#music-toggle');
    if (!button) return;
    button.setAttribute('aria-pressed', String(this.state.music));
    const label = button.querySelector('[data-label]');
    if (label) label.textContent = this.state.music ? 'Music on' : 'Music off';
  }

  /** Screen-reader status (polite live region). */
  announce(text) {
    if (!this._readout || !text || text === this._lastAnnounce) return;
    this._lastAnnounce = text;
    this._readout.textContent = text.replace(/\*/g, '');
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  save() {
    if (this.scene === this.worldScene) {
      const position = this.worldScene.world.position;
      this.state.position = { x: position.x, y: position.y };
      this.state.facing = position.facing;
    }
    if (!this.saving) return true;
    return saveGame(this.state, this.storage);
  }

  stats() {
    return heroStats(this.state);
  }

  // ── Scene flow ───────────────────────────────────────────────────────────

  /** Cover with `kind`, run `swap`, then reveal with `reveal`. */
  cut(swap, { kind = 'fade', reveal = 'fade', from = null } = {}) {
    if (this.transition) return false;
    this.input.clear();
    this.transition = { kind, reveal, from, swap, t: 0, covering: true };
    return true;
  }

  _setScene(scene, params) {
    this.scene = scene;
    scene.enter(params);
  }

  newGame() {
    const music = this.state.music;
    this.state = freshState();
    this.state.music = music;
    this.state.started = true;
    this.worldScene.reset();
    this.startAudio();
    this.save();
    this.cut(() => this._setScene(this.introScene));
  }

  continueGame() {
    this.startAudio();
    this.cut(() => this._setScene(this.worldScene));
  }

  enterWorld(params = {}) {
    this.cut(() => this._setScene(this.worldScene, params));
  }

  /** Wipe the save and return to the title (pause → Restart adventure). */
  restart() {
    const music = this.state.music;
    this.state = freshState();
    this.state.music = music;
    this.pendingRecap = null;
    this.save();
    this.worldScene.reset();
    // Restart is reachable only from the pause menu (dialogue/lesson cannot be open then);
    // close menus without firing gameplay callbacks.
    if (this.codex.active) this.codex.close();
    if (this.pauseMenu.active) this.pauseMenu.close();
    this.toasts.clear?.();
    this.setMusicScene('title');
    this.cut(() => this._setScene(this.titleScene));
  }

  playEnding() {
    this.setFlag('ending-seen');
    this.save();
    this.setMusicScene('ending');
    this.cut(() => this._setScene(this.endingScene));
  }

  startBattle({ foeId, guardian = false, uid = null, zone = 0 }) {
    if (this.transition || this.scene !== this.worldScene) return false;
    this.save();
    const { canvas, ctx } = makeCanvas(this.screen.w, this.screen.h);
    ctx.drawImage(this.screen.canvas, 0, 0);
    this.audio.play('charge');
    this.setMusicScene(guardian ? 'boss' : 'battle');
    return this.cut(() => this._setScene(this.battleScene, { foeId, guardian, uid, zone }), { kind: 'battle-in', from: canvas });
  }

  /** Apply a finished battle's result to the save and return to the island. */
  endBattle(result, params) {
    const state = this.state;
    const stats = heroStats(state);
    state.stats.battles++;
    state.stats.perfects += result.stats?.perfects ?? 0;
    state.stats.fizzles += result.stats?.fizzles ?? 0;
    state.gear = { ...state.gear, ...result.gear };
    if (result.guardTaught) this.setFlag('guard-taught');
    const world = this.worldScene.world;
    const guardian = GUARDIANS.find((g) => g.key === result.foeId);
    let after = null;
    if (result.outcome === 'won' && guardian && guardian.id === state.friends.length) {
      state.friends.push(guardian.id);
      const grown = heroStats(state);
      state.hero = {
        hp: Math.min(grown.maxHp, (result.hero.hp ?? 1) + 8 + Math.round(grown.maxHp * 0.25)),
        bytes: grown.maxBytes,
        snacks: Math.min(grown.maxSnacks, result.hero.snacks ?? state.hero.snacks),
      };
      after = () => {
        world.restoreZone(guardian.zone);
        this.audio.play('restore');
        this.toast(`${guardian.name} joined you! Max HP +8, bytes +8.`, { kind: 'reward', ms: 4200 });
        this.pendingRecap = ZONES[guardian.zone].technique;
        this.recapAt = this.time + 2.4;
      };
    } else if (result.outcome === 'lost') {
      state.hero = { hp: stats.maxHp, bytes: stats.maxBytes, snacks: Math.max(3, result.hero.snacks ?? 0) };
      after = () => {
        world.returnToCamp(state.camp);
        this.toast('You wake by the campfire. Friends kept; try a new plan.', { kind: 'notice', ms: 4200 });
      };
    } else {
      const reward = result.outcome === 'won' ? Math.max(0, Math.trunc(result.reward?.bytes ?? 0)) : 0;
      state.hero = {
        hp: Math.max(1, Math.min(stats.maxHp, result.hero.hp ?? state.hero.hp)),
        bytes: Math.max(0, Math.min(stats.maxBytes, (result.hero.bytes ?? state.hero.bytes) + reward)),
        snacks: Math.max(0, Math.min(stats.maxSnacks, result.hero.snacks ?? state.hero.snacks)),
      };
      if (reward) after = () => this.toast(`Static cleared: +${reward} B`, { kind: 'reward', ms: 2200 });
    }
    world.afterBattle(params.uid, result.outcome);
    this.cut(
      () => {
        this._setScene(this.worldScene, { fromBattle: true });
        after?.();
        this.save();
      },
      { kind: 'fade' },
    );
  }

  // ── Services for scenes and overlays ─────────────────────────────────────

  say(lines, { onDone = null } = {}) {
    this.dialogue.open({ lines, onDone });
    const first = Array.isArray(lines) ? lines[0] : lines;
    this.announce(typeof first === 'string' ? first : first?.text);
  }

  lesson(id, { mode = 'learn', onDone = null } = {}) {
    if (!this.state.lessons.includes(id)) this.state.lessons.push(id);
    this.audio.play('lesson');
    this.lessonCard.open({ id, mode, onDone });
  }

  toast(text, { kind = 'notice', ms = 2600 } = {}) {
    this.toasts.show(text, { kind, ms });
    this.announce(text);
  }

  unlockTechnique(id) {
    if (this.state.techniques.includes(id)) return false;
    this.state.techniques.push(id);
    this.save();
    this.lesson(id, { mode: 'learn' });
    return true;
  }

  collectShard(id) {
    if (this.state.shards.includes(id)) return false;
    this.state.shards.push(id);
    const count = this.state.shards.length;
    this.audio.play('shard');
    if (count % 8 === 0) {
      this.state.hero.bytes = this.stats().maxBytes;
      this.toast('8 bits make a byte! Max bytes +16.', { kind: 'reward', ms: 3600 });
    } else this.toast(`Bit shard ${count % 8}/8 toward your next byte`, { kind: 'reward' });
    this.save();
    return true;
  }

  openCache(id) {
    if (this.state.caches.includes(id)) return false;
    const stats = this.stats();
    this.state.caches.push(id);
    this.state.hero.snacks = Math.min(stats.maxSnacks, this.state.hero.snacks + 1);
    this.state.hero.bytes = Math.min(stats.maxBytes, this.state.hero.bytes + 12);
    this.audio.play('cache');
    this.toast('Picnic cache: +1 snack, +12 bytes', { kind: 'reward' });
    this.save();
    return true;
  }

  solvePuzzle(id) {
    if (this.state.puzzles.includes(id)) return false;
    this.state.puzzles.push(id);
    this.audio.play('restore');
    this.save();
    return true;
  }

  restAtCamp(campId) {
    const stats = this.stats();
    this.state.hero.hp = stats.maxHp;
    this.state.hero.bytes = stats.maxBytes;
    this.state.hero.snacks = Math.max(3, this.state.hero.snacks);
    this.state.camp = campId;
    this.worldScene.world.respawnStaticlings();
    this.audio.play('heal');
    this.toast('Rested: HP and bytes restored. Awake patrols return home.', { kind: 'notice', ms: 3200 });
    this.save();
  }

  /** Set (default) or clear a progression flag. */
  setFlag(id, value = true) {
    const at = this.state.flags.indexOf(id);
    if (value && at < 0) this.state.flags.push(id);
    else if (!value && at >= 0) this.state.flags.splice(at, 1);
  }

  hasFlag(id) {
    return this.state.flags.includes(id);
  }

  openPause() {
    this.audio.play('menu-move');
    this.pauseMenu.open({
      musicOn: () => this.state.music,
      onResume: () => this.audio.play('menu-back'),
      onNotes: () => this.openNotes(),
      onToggleMusic: () => this.toggleMusic(),
      onRestart: () => this.restart(),
    });
  }

  openNotes() {
    this.codex.open({ lessons: this.state.lessons, onClose: () => this.audio.play('menu-back') });
  }

  // ── Frame ────────────────────────────────────────────────────────────────

  _overlay() {
    if (this.lessonCard.active) return this.lessonCard;
    if (this.dialogue.active) return this.dialogue;
    if (this.codex.active) return this.codex;
    if (this.pauseMenu.active) return this.pauseMenu;
    return null;
  }

  update(dt) {
    const input = this.input;
    this.time += dt;
    input.update(dt);
    if (input.pressed('music')) {
      input.consume('music');
      if (this.scene !== this.titleScene) this.toggleMusic();
      else {
        this.state.music = !this.state.music;
        // Never unlocks or creates an AudioContext; mutes already-running title music.
        this.audio.setEnabled(this.state.music);
        this._syncMusicButton();
        this.save();
        this.toast(this.state.music ? 'Music on: it starts with Enter' : 'Muted: Enter starts silently', { kind: 'notice', ms: 1400 });
      }
    }
    if (input.pressed('fullscreen')) {
      input.consume('fullscreen');
      this.toggleFullscreen();
    }
    if (this.transition) {
      this._advanceTransition(dt);
    } else {
      const overlay = this._overlay();
      const recapDue = this.pendingRecap && !overlay && this.scene === this.worldScene && this.time >= this.recapAt;
      if (recapDue) {
        const id = this.pendingRecap;
        this.pendingRecap = null;
        this.lesson(id, { mode: 'recap' });
      } else if (overlay) overlay.update(dt, input);
      else {
        const inWorld = this.scene === this.worldScene;
        const inBattle = this.scene === this.battleScene;
        const worldFree = inWorld && this.worldScene.world.canPause !== false;
        const battleFree = inBattle && this.battleScene.canPause;
        if ((worldFree || battleFree) && input.pressed('notes')) {
          input.consume('notes');
          this.openNotes();
        } else if ((worldFree || battleFree) && input.pressed('pause')) {
          input.consume('pause');
          input.consume('cancel');
          this.openPause();
        } else this.scene.update(dt, input);
      }
    }
    this.toasts.update(dt);
    this._labelClock = (this._labelClock ?? 0) + dt;
    if (this._labelClock >= 0.2) {
      this._labelClock = 0;
      const label = this.describe();
      if (label !== this._label) {
        this._label = label;
        this.screen.canvas.setAttribute('aria-label', label);
      }
    }
    input.endFrame();
  }

  _advanceTransition(dt) {
    const tr = this.transition;
    const kind = tr.covering ? tr.kind : tr.reveal;
    tr.t += dt / (COVER_SECONDS[kind] ?? 0.35);
    if (tr.t < 1) return;
    if (tr.covering) {
      tr.covering = false;
      tr.t = 0;
      tr.swap?.();
    } else this.transition = null;
  }

  draw() {
    const { ctx } = this.screen;
    const screen = this.screen;
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    this.scene.draw(ctx, screen, this.time);
    this.pauseMenu.draw(ctx, screen, this.time);
    this.codex.draw(ctx, screen, this.time);
    this.dialogue.draw(ctx, screen, this.time);
    this.lessonCard.draw(ctx, screen, this.time);
    this.toasts.draw(ctx, screen, this.time);
    if (this.transition) {
      const tr = this.transition;
      const kind = tr.covering ? tr.kind : tr.reveal;
      const p = tr.covering ? Math.min(1, tr.t) : 1 - Math.min(1, tr.t);
      drawTransition(ctx, screen, kind, p, { from: tr.covering ? tr.from : null, reduced: this.reducedMotion });
    }
  }

  /** Compact status line for assistive tech and automated checks. */
  describe() {
    const s = this.state;
    const stats = this.stats();
    const names = new Map([[this.battleScene, 'battle'], [this.worldScene, 'world'], [this.titleScene, 'title'], [this.introScene, 'intro'], [this.endingScene, 'ending']]);
    const scene = names.get(this.scene) ?? 'gallery';
    const overlay = this._overlay();
    const parts = [`Scene ${scene}`, `HP ${s.hero.hp}/${stats.maxHp}`, `Bytes ${s.hero.bytes}/${stats.maxBytes}`, `Friends ${s.friends.length}/7`];
    if (overlay) {
      const overlayName = overlay === this.lessonCard ? 'Lesson card' : overlay === this.dialogue ? 'Dialogue' : overlay === this.codex ? 'Field Notes' : 'Pause menu';
      parts.push(`Overlay ${overlayName}`);
    }
    if (scene === 'world') {
      const world = this.worldScene.world;
      const p = world.position;
      parts.push(`Zone ${p.zone}`, `Position ${Math.round(p.x)},${Math.round(p.y)}`);
      const detail = typeof world.describe === 'function' ? world.describe() : '';
      if (detail) parts.push(detail);
    }
    if (scene === 'battle') parts.push(this.battleScene.describe());
    return parts.join('. ');
  }
}
