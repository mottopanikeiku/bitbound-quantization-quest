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
import { drawTransition, TRANSITION_KINDS } from './art/transitions.js';
import { applyEvent, BADGES } from './progress/progress.js';
import { Journal } from './ui/journal.js';
import { WellScene } from './scenes/well-scene.js';
import { originSpecies } from './content/static-dex.js';
import { INTERACTABLES } from './world/map.js';
import { campReachable } from './world/world.js';

const COVER_SECONDS = { fade: 0.32, 'battle-in': 0.9, 'battle-out': 0.45, wipe: 0.4, descend: 0.7 };

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
    // Badges unlocked mid-battle, celebrated once the battle scene is left.
    this.heldBadges = [];
    this.recapAt = 0;
    this.dialogue = new DialogueBox(this);
    this.lessonCard = new LessonCard(this);
    this.pauseMenu = new PauseMenu(this);
    this.codex = new Codex(this);
    this.toasts = new Toasts(this);
    this.journal = new Journal(this);
    this.titleScene = new TitleScene(this);
    this.introScene = new IntroScene(this);
    this.endingScene = new EndingScene(this);
    this.worldScene = new WorldScene(this);
    this.battleScene = new BattleScene(this);
    this.wellScene = new WellScene(this);
    this.scene = this.titleScene;
    this.scene.enter();
    this._readout = document.querySelector('#readout');
    this._lastAnnounce = '';
    this._sceneMark = '';
    this._fullscreenRequested = false;
    this._fullscreenRetry = null;
    this._markScene();
    this._wireButtons();
    this._syncMusicButton();
    this._syncFullscreenButton();
  }

  // ── Audio, music and page controls ────────────────────────────────────────

  /** Called from a user gesture (Title Enter): create/resume audio and start music. */
  startAudio() {
    this.audio.setEnabled(this.state.music);
    this.audio.unlock().then((running) => {
      if (this.state.music && !running) this.toast('Music is unavailable in this browser.', { kind: 'notice' });
    });
  }

  setMusicScene(name, fallback = 'overworld') {
    if (!this.audio.setScene(name)) this.audio.setScene(fallback);
  }

  toggleMusic() {
    this.state.music = !this.state.music;
    this.audio.setEnabled(this.state.music);
    if (this.scene !== this.titleScene) this.audio.unlock();
    this.toast(this.state.music ? 'Music on' : 'Music off', { kind: 'notice', ms: 1200 });
    this._syncMusicButton();
    this.save();
  }

  // ── Full screen ──────────────────────────────────────────────────────────

  get fullscreenSupported() {
    return Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen);
  }

  isFullscreen() {
    return Boolean(document.fullscreenElement);
  }

  /** F, the title button and the pause menu: switch now and remember the choice. */
  toggleFullscreen() {
    if (!this.fullscreenSupported) {
      this.toast('Full screen is unavailable in this browser.', { kind: 'notice' });
      return;
    }
    const on = !this.isFullscreen();
    this.state.fullscreen = on;
    this.save();
    this.setFullscreen(on, { explicit: true });
  }

  /** Starting play re-enters full screen silently; only explicit requests report failures. */
  setFullscreen(on, { retry = true, explicit = false } = {}) {
    if (!this.fullscreenSupported || on === this.isFullscreen()) return;
    this._fullscreenRequested = true;
    if (!on) {
      document.exitFullscreen().catch(() => (this._fullscreenRequested = false));
      return;
    }
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
      this._fullscreenRequested = false;
      // A touch press reaches the game before the browser counts it as a gesture (that happens
      // on release), so try once more on the next release or key press.
      if (retry) this._fullscreenRetry = explicit ? 'explicit' : 'auto';
      else if (explicit) this.toast('Full screen is unavailable here.', { kind: 'notice' });
    });
  }

  _fullscreenChanged() {
    const on = this.isFullscreen();
    const external = !this._fullscreenRequested;
    this._fullscreenRequested = false;
    // Keep Esc as the pause key where the browser allows it (hold Esc to leave full screen).
    if (on) navigator.keyboard?.lock?.(['Escape']).catch(() => {});
    else navigator.keyboard?.unlock?.();
    // Pressing Esc in full screen usually means "pause" even when the browser exits instead.
    const inWorld = this.scene === this.worldScene && this.worldScene.world.canPause !== false;
    const inBattle = this.scene === this.battleScene && this.battleScene.canPause;
    if (!on && external && !this.transition && !this._overlay() && (inWorld || inBattle)) this.openPause();
    this._syncFullscreenButton();
  }

  _wireButtons() {
    // Return keyboard focus to the game after mouse clicks on page buttons
    // (Input ignores keys while a plain button is focused).
    const refocus = () => this.screen.canvas.focus({ preventScroll: true });
    document.querySelector('#music-toggle')?.addEventListener('click', () => {
      this.toggleMusic();
      refocus();
    });
    const fullscreenButton = document.querySelector('#fullscreen-toggle');
    if (fullscreenButton) {
      fullscreenButton.hidden = !this.fullscreenSupported;
      fullscreenButton.addEventListener('click', () => {
        this.toggleFullscreen();
        refocus();
      });
    }
    document.addEventListener('fullscreenchange', () => this._fullscreenChanged());
    const retry = () => {
      if (!this._fullscreenRetry) return;
      const explicit = this._fullscreenRetry === 'explicit';
      this._fullscreenRetry = null;
      if (this.state.fullscreen) this.setFullscreen(true, { retry: false, explicit });
    };
    addEventListener('pointerup', retry, true);
    addEventListener('keydown', retry, true);
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

  _syncFullscreenButton() {
    const button = document.querySelector('#fullscreen-toggle');
    if (!button) return;
    const on = this.isFullscreen();
    button.setAttribute('aria-pressed', String(on));
    const label = button.querySelector('[data-label]');
    if (label) label.textContent = on ? 'Exit full screen' : 'Full screen';
  }

  /** Page chrome (title buttons) is shown only on the title; play is canvas only. */
  _markScene() {
    const name = this.sceneName();
    if (name === this._sceneMark) return;
    this._sceneMark = name;
    document.documentElement.dataset.scene = name;
  }

  sceneName() {
    const names = new Map([[this.battleScene, 'battle'], [this.worldScene, 'world'], [this.wellScene, 'well'], [this.titleScene, 'title'], [this.introScene, 'intro'], [this.endingScene, 'ending']]);
    return names.get(this.scene) ?? 'gallery';
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
    if (scene !== this.battleScene) this._celebrateBadges();
  }

  newGame() {
    const { music, fullscreen } = this.state;
    this.state = freshState();
    Object.assign(this.state, { music, fullscreen, started: true });
    this.worldScene.reset();
    this.startAudio();
    if (fullscreen) this.setFullscreen(true);
    this.save();
    this.cut(() => this._setScene(this.introScene));
  }

  continueGame() {
    this.startAudio();
    if (this.state.fullscreen) this.setFullscreen(true);
    this.cut(() => this._setScene(this.worldScene));
  }

  enterWorld(params = {}) {
    this.cut(() => this._setScene(this.worldScene, params));
  }

  /** Wipe the save and return to the title (pause → Restart adventure). */
  restart() {
    const { music, fullscreen } = this.state;
    this.state = freshState();
    Object.assign(this.state, { music, fullscreen });
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
    this.emit('ending');
    this.save();
    this.setMusicScene('ending');
    this.cut(() => this._setScene(this.endingScene));
  }

  /**
   * Start a battle. mode:
   *   'campaign' — island fights: guardians befriend, staticlings give bytes (the default);
   *   'practice' — a guardian rematch or species practice: grade and records only;
   *   'duel'     — Fen Float; duel is 'fen-offset' | 'fen-hot' | 'fen-crown';
   *   'well'     — a Static Well floor; well is the floor descriptor built by src/well.
   * species selects a staticling motif (dex id); golden marks the rare variant.
   * Practice, duels and Well floors never change the campaign hero, friends or rewards.
   */
  startBattle(params) {
    const from = params.mode === 'well' ? this.wellScene : this.worldScene;
    if (this.transition || this.scene !== from) return false;
    return this._enterBattle(params);
  }

  _enterBattle({ foeId, species = null, mode = 'campaign', guardian = false, uid = null, zone = 0, golden = false, duel = null, well = null }) {
    this.save();
    const { canvas, ctx } = makeCanvas(this.screen.w, this.screen.h);
    ctx.drawImage(this.screen.canvas, 0, 0);
    this.audio.play(golden ? 'golden' : 'charge');
    if (mode === 'duel') this.setMusicScene('rival', 'battle');
    else if (mode === 'well') this.setMusicScene(well?.warden ? 'warden' : 'well', well?.warden ? 'boss' : 'battle');
    else this.setMusicScene(guardian ? 'boss' : 'battle');
    const params = { foeId, species, mode, guardian, uid, zone, golden, duel, well };
    // Emitted once the battle owns the screen, so any badge it unlocks waits for the fight to end.
    return this.cut(() => {
      this._setScene(this.battleScene, params);
      this.emit('battle-start', { foeId, species, mode, guardian, golden, duel, depth: well?.depth ?? null });
    }, { kind: 'battle-in', from: canvas });
  }

  /**
   * Apply a finished battle's result, settled by mode, and return to the island or the Well.
   * result.again (practice and duels only) starts the same fight again straight away: neither
   * mode touches campaign supplies, so a retry costs nothing.
   */
  endBattle(result, params) {
    const state = this.state;
    const mode = params.mode ?? 'campaign';
    const won = result.outcome === 'won';
    const stats = heroStats(state);
    state.stats.battles++;
    state.stats.perfects += result.stats?.perfects ?? 0;
    state.stats.fizzles += result.stats?.fizzles ?? 0;
    // Only island fights change the saved loadout; practice, duels and the Well keep it.
    if (mode === 'campaign') state.gear = { ...state.gear, ...result.gear };
    if (result.guardTaught) this.setFlag('guard-taught');
    // Committed assists count per friend in completed fights (won or lost, not fled): cosmetic bonds.
    if (result.outcome !== 'fled') for (const key of result.assists ?? []) state.bonds[key] = Math.min(999, (state.bonds[key] ?? 0) + 1);
    this.emit('battle-end', {
      foeId: result.foeId,
      species: result.species ?? params.species ?? (String(result.foeId).startsWith('static-') ? originSpecies(params.zone) : null),
      mode,
      outcome: result.outcome,
      guardian: Boolean(params.guardian),
      golden: Boolean(params.golden),
      duel: params.duel ?? null,
      depth: params.well?.depth ?? null,
      grade: result.grade ?? null,
      stats: result.stats ?? {},
      maxResonance: result.maxResonance ?? 0,
      assists: result.assists ?? [],
    });
    if (mode === 'well') {
      this.cut(() => this._setScene(this.wellScene, { battleResult: result }), { kind: 'fade' });
      return;
    }
    const world = this.worldScene.world;
    const guardian = GUARDIANS.find((g) => g.key === result.foeId);
    let after = null;
    if (mode === 'duel') {
      if (won && !state.rival.won.includes(params.duel)) state.rival.won.push(params.duel);
      else if (result.outcome === 'lost') state.rival.losses++;
      after = () => world.afterDuel?.(params.duel, result.outcome);
    } else if (mode === 'practice') {
      const letter = result.grade?.letter;
      if (won && letter) after = () => this.toast(`Practice grade ${letter}`, { kind: 'reward', ms: 2600 });
    } else if (won && guardian && guardian.id === state.friends.length) {
      state.friends.push(guardian.id);
      const grown = heroStats(state);
      state.hero = {
        hp: Math.min(grown.maxHp, (result.hero.hp ?? 1) + 8 + Math.round(grown.maxHp * 0.25)),
        bytes: grown.maxBytes,
        snacks: Math.min(grown.maxSnacks, result.hero.snacks ?? state.hero.snacks),
      };
      this.emit('befriend', { guardian: guardian.id });
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
      const reward = won ? Math.max(0, Math.trunc(result.reward?.bytes ?? 0)) : 0;
      state.hero = {
        hp: Math.max(1, Math.min(stats.maxHp, result.hero.hp ?? state.hero.hp)),
        bytes: Math.max(0, Math.min(stats.maxBytes, (result.hero.bytes ?? state.hero.bytes) + reward)),
        snacks: Math.max(0, Math.min(stats.maxSnacks, result.hero.snacks ?? state.hero.snacks)),
      };
      if (reward) after = () => this.toast(`${params.golden ? 'Golden static cleared' : 'Static cleared'}: +${reward} B`, { kind: 'reward', ms: 2200 });
    }
    if (result.again && (mode === 'practice' || mode === 'duel')) return this._enterBattle(params);
    if (mode === 'campaign') world.afterBattle(params.uid, result.outcome);
    this.cut(
      () => {
        this._setScene(this.worldScene, { fromBattle: true });
        after?.();
        this.save();
      },
      { kind: 'fade' },
    );
  }

  /** Leave a battle from the pause menu (FLEE lives there so the command menu has room for FRIENDS). */
  fleeBattle() {
    const battle = this.scene === this.battleScene ? this.battleScene.battle : null;
    if (battle?.canPause && typeof battle.flee === 'function') battle.flee();
  }

  // ── The Static Well, the rival and travel ────────────────────────────────

  /** The Well scene offers Resume (a suspended run in state.wellRun) or a new expedition. */
  enterWell() {
    if (this.transition || this.scene !== this.worldScene) return false;
    this.save();
    this.audio.play('descend');
    const kind = TRANSITION_KINDS.includes('descend') ? 'descend' : 'fade';
    return this.cut(() => this._setScene(this.wellScene, {}), { kind, reveal: 'fade' });
  }

  /** Back to the island beside the well; the hero never moved, so no zone banner. */
  leaveWell() {
    if (this.transition || this.scene !== this.wellScene) return false;
    return this.cut(() => this._setScene(this.worldScene, { fromBattle: true }), { kind: 'fade' });
  }

  /** Fen Float's optional duels; the world starts them from his Talk / Duel / Later menu. */
  startRivalDuel(duelId) {
    return this.startBattle({ foeId: 'fen', mode: 'duel', duel: duelId, uid: duelId, zone: this.worldScene.world.position.zone });
  }

  /** Campfire travel (after Nib's friendship) to camps the hero has rested at and may reach. */
  travelTo(campId) {
    const camp = INTERACTABLES.find((item) => item.id === campId);
    if (this.transition || this.scene !== this.worldScene || !this.state.friends.length || !campReachable(this.state, camp)) return false;
    this.audio.play('travel');
    this.emit('travel', { to: campId });
    return this.cut(() => {
      this.worldScene.world.returnToCamp(campId);
      this.state.camp = campId;
      this.save();
    }, { kind: 'fade' });
  }

  setHat(id) {
    this.state.hat = id ?? null;
    this.emit('hat', { id: this.state.hat });
    this.save();
  }

  /** Pin one landmark (interactable id) as the world objective, or clear it with null. */
  setPin(id) {
    this.state.pin = id ?? null;
    this.save();
  }

  /**
   * Report a gameplay event to meta-progress (dex, records, badges). Badge unlocks are
   * celebrated at once outside battle; a fight keeps its screen and celebrates on return.
   */
  emit(type, data = {}) {
    const unlocked = applyEvent(this.state.progress, { type, ...data }, { state: this.state }) ?? [];
    this.heldBadges.push(...unlocked);
    if (this.scene !== this.battleScene) this._celebrateBadges();
    return unlocked;
  }

  _celebrateBadges() {
    for (const id of this.heldBadges.splice(0)) {
      const badge = BADGES.find((item) => item.id === id);
      if (!badge) continue;
      this.audio.play('badge');
      this.toast(`Badge earned: ${badge.name}`, { kind: 'badge', ms: 3600 });
    }
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
    this.emit('shard', { id });
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
    this.emit('cache', { id });
    // Report what actually arrived: snacks and bytes are capped.
    const hero = this.state.hero;
    const snacks = Math.min(stats.maxSnacks, hero.snacks + 1) - hero.snacks;
    const bytes = Math.min(stats.maxBytes, hero.bytes + 12) - hero.bytes;
    hero.snacks += snacks;
    hero.bytes += bytes;
    this.audio.play('cache');
    const parts = [snacks ? '+1 snack' : 'snacks full', bytes ? `+${bytes} B` : 'bytes full'];
    this.toast(`Picnic cache: ${parts.join(', ')}`, { kind: 'reward' });
    this.save();
    return true;
  }

  solvePuzzle(id) {
    if (this.state.puzzles.includes(id)) return false;
    this.state.puzzles.push(id);
    this.emit('puzzle', { id });
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
    if (!this.state.camps.includes(campId)) {
      this.state.camps.push(campId);
      this.emit('camp', { id: campId });
    }
    // Each rest is a new "visit": patrols return and their golden rolls are re-drawn (deterministic per visit).
    this.state.restCount = (this.state.restCount ?? 0) + 1;
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
    const inBattle = this.scene === this.battleScene;
    this.pauseMenu.open({
      musicOn: () => this.state.music,
      onResume: () => this.audio.play('menu-back'),
      onNotes: () => this.openNotes(),
      onJournal: () => this.openJournal(),
      onToggleMusic: () => this.toggleMusic(),
      ...(this.fullscreenSupported ? { fullscreenOn: () => this.isFullscreen(), onToggleFullscreen: () => this.toggleFullscreen() } : {}),
      ...(inBattle ? { onFlee: () => this.fleeBattle() } : { onRestart: () => this.restart() }),
    });
  }

  openNotes() {
    this.codex.open({ lessons: this.state.lessons, onClose: () => this.audio.play('menu-back') });
  }

  openJournal(tab = 'map') {
    this.audio.play('menu-move');
    this.journal.open({ tab, onClose: () => this.audio.play('menu-back') });
  }

  // ── Frame ────────────────────────────────────────────────────────────────

  _overlay() {
    if (this.lessonCard.active) return this.lessonCard;
    if (this.dialogue.active) return this.dialogue;
    if (this.journal.active) return this.journal;
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
        } else if (worldFree && input.pressed('journal')) {
          input.consume('journal');
          this.openJournal();
        } else if ((worldFree || battleFree) && input.pressed('pause')) {
          input.consume('pause');
          input.consume('cancel');
          this.openPause();
        } else this.scene.update(dt, input);
      }
    }
    this.toasts.update(dt);
    this._markScene();
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
    this.journal.draw(ctx, screen, this.time);
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
    const scene = this.sceneName();
    const overlay = this._overlay();
    const parts = [`Scene ${scene}`, `HP ${s.hero.hp}/${stats.maxHp}`, `Bytes ${s.hero.bytes}/${stats.maxBytes}`, `Friends ${s.friends.length}/7`];
    if (overlay) {
      const overlayName = overlay === this.lessonCard ? 'Lesson card' : overlay === this.dialogue ? 'Dialogue' : overlay === this.codex ? 'Field Notes' : overlay === this.journal ? 'Journal' : 'Pause menu';
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
    if (scene === 'well') parts.push(this.wellScene.describe());
    return parts.join('. ');
  }
}
