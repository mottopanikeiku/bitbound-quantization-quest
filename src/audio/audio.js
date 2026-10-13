import { SCORES } from "./music.js";

const LOOK_AHEAD = 0.14;
const SCHEDULER_MS = 25;
const START_DELAY = 0.035;
const MASTER_LEVEL = 0.72;
const MUSIC_LEVEL = 0.76;
const MAX_EFFECT_VOICES = 32;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Frequency, delay seconds, duration seconds, timbre, level, optional end frequency.
// A short attack and a zero-ended release keep even the tiny UI sounds click-free.
const EFFECTS = {
  step: { notes: [[178, 0, 0.035, "triangle", 0.042, 112]], cooldown: 0.105 },
  select: { notes: [[523.25, 0, 0.045, "softPulse", 0.075], [783.99, 0.04, 0.07, "softPulse", 0.067]], cooldown: 0.05 },
  cast: { notes: [[293.66, 0, 0.09, "triangle", 0.14], [369.99, 0.06, 0.10, "softPulse", 0.09], [440, 0.12, 0.11, "softPulse", 0.09], [587.33, 0.19, 0.19, "bell", 0.16]], cooldown: 0.12, duck: 0.25 },
  hit: { notes: [[170, 0, 0.085, "triangle", 0.22, 48]], noise: [[0, 0.075, 0.11, 1100]], cooldown: 0.06 },
  enemy: { notes: [[330, 0, 0.12, "reed", 0.10, 120], [147, 0.055, 0.14, "triangle", 0.15, 73.5]], noise: [[0.02, 0.09, 0.06, 700]], cooldown: 0.12 },
  guard: { notes: [[293.66, 0, 0.20, "triangle", 0.14], [440, 0.03, 0.19, "triangle", 0.10], [587.33, 0.06, 0.17, "softPulse", 0.07]], noise: [[0, 0.04, 0.025, 2200]], cooldown: 0.15 },
  scan: { notes: [[587.33, 0, 0.055, "flute", 0.13], [880, 0.065, 0.055, "flute", 0.12], [1174.66, 0.13, 0.055, "flute", 0.11], [1760, 0.195, 0.10, "bell", 0.09]], cooldown: 0.18 },
  win: { notes: [[587.33, 0, 0.12, "softPulse", 0.10], [739.99, 0.10, 0.12, "softPulse", 0.10], [880, 0.20, 0.14, "softPulse", 0.09], [1174.66, 0.34, 0.32, "bell", 0.17]], cooldown: 0.3, duck: 0.45 },
  capture: { notes: [[587.33, 0, 0.13, "bell", 0.16], [739.99, 0.11, 0.14, "softPulse", 0.09], [987.77, 0.22, 0.15, "softPulse", 0.085], [880, 0.34, 0.14, "softPulse", 0.085], [739.99, 0.45, 0.14, "softPulse", 0.075], [1174.66, 0.57, 0.42, "bell", 0.18]], cooldown: 0.5, duck: 0.8 },
  retry: { notes: [[329.63, 0, 0.13, "triangle", 0.13], [293.66, 0.12, 0.15, "triangle", 0.12], [220, 0.25, 0.20, "triangle", 0.11]], cooldown: 0.25 },
  heal: { notes: [[587.33, 0, 0.15, "flute", 0.13], [739.99, 0.09, 0.16, "flute", 0.12], [880, 0.18, 0.18, "flute", 0.11], [739.99, 0.29, 0.14, "flute", 0.095], [1174.66, 0.39, 0.28, "bell", 0.14]], cooldown: 0.3, duck: 0.4 },
  snap: { notes: [[440, 0, 0.04, "pluck", 0.19, 587.33], [1174.66, 0.026, 0.08, "bell", 0.10]], noise: [[0, 0.018, 0.045, 3000]], cooldown: 0.045 },
  lock: { notes: [[392, 0, 0.05, "softPulse", 0.13], [587.33, 0.043, 0.13, "pluck", 0.17]], cooldown: 0.075 },
  clip: { notes: [[830.61, 0, 0.06, "reed", 0.12, 659.25], [622.25, 0.072, 0.09, "reed", 0.11, 493.88]], noise: [[0, 0.03, 0.035, 2600]], cooldown: 0.16 },
  fizzle: { notes: [[440, 0, 0.16, "softPulse", 0.10, 220], [207.65, 0.09, 0.20, "triangle", 0.14, 98]], noise: [[0.035, 0.21, 0.055, 1700]], cooldown: 0.28 },
  perfect: { notes: [[587.33, 0, 0.11, "bell", 0.18], [739.99, 0.07, 0.12, "bell", 0.17], [880, 0.14, 0.15, "bell", 0.16], [1174.66, 0.23, 0.40, "bell", 0.19], [587.33, 0.23, 0.34, "flute", 0.075]], cooldown: 0.35, duck: 0.45 },
  "guard-perfect": { notes: [[293.66, 0, 0.15, "triangle", 0.20], [880, 0.012, 0.17, "bell", 0.16], [1174.66, 0.075, 0.27, "bell", 0.17]], noise: [[0, 0.03, 0.045, 2900]], cooldown: 0.11, duck: 0.2 },
  "guard-good": { notes: [[293.66, 0, 0.14, "triangle", 0.17], [440, 0.014, 0.14, "pluck", 0.13]], noise: [[0, 0.025, 0.04, 1700]], cooldown: 0.10 },
  hurt: { notes: [[196, 0, 0.13, "reed", 0.16, 82.41], [98, 0.02, 0.16, "triangle", 0.14, 55]], noise: [[0, 0.065, 0.075, 900]], cooldown: 0.085 },
  charge: { notes: [[146.83, 0, 0.50, "reed", 0.10, 293.66], [220, 0.10, 0.46, "softPulse", 0.075, 440], [587.33, 0.39, 0.18, "bell", 0.13]], cooldown: 0.4, duck: 0.4 },
  shard: { notes: [[1174.66, 0, 0.11, "bell", 0.15], [1479.98, 0.065, 0.12, "bell", 0.13], [1760, 0.135, 0.22, "bell", 0.12]], cooldown: 0.11 },
  cache: { notes: [[293.66, 0, 0.06, "pluck", 0.13], [587.33, 0.06, 0.13, "softPulse", 0.11], [739.99, 0.13, 0.14, "softPulse", 0.11], [880, 0.22, 0.29, "bell", 0.17]], noise: [[0, 0.035, 0.03, 1400]], cooldown: 0.35, duck: 0.3 },
  restore: { notes: [[293.66, 0, 0.65, "pad", 0.11], [369.99, 0.10, 0.65, "pad", 0.085], [440, 0.20, 0.67, "pad", 0.085], [587.33, 0.32, 0.22, "bell", 0.16], [739.99, 0.43, 0.23, "bell", 0.15], [880, 0.54, 0.25, "bell", 0.14], [1174.66, 0.68, 0.55, "bell", 0.17]], cooldown: 0.8, duck: 1 },
  lesson: { notes: [[493.88, 0, 0.16, "pluck", 0.14], [587.33, 0.10, 0.17, "bell", 0.15], [880, 0.22, 0.28, "bell", 0.14]], cooldown: 0.3, duck: 0.35 },
  "menu-move": { notes: [[659.25, 0, 0.045, "pluck", 0.09, 739.99]], cooldown: 0.045 },
  "menu-back": { notes: [[587.33, 0, 0.065, "softPulse", 0.075], [392, 0.055, 0.085, "softPulse", 0.07]], cooldown: 0.085 },
  gate: { notes: [[146.83, 0, 0.36, "reed", 0.12, 293.66], [440, 0.14, 0.31, "flute", 0.10, 587.33], [880, 0.38, 0.32, "bell", 0.14]], noise: [[0.03, 0.28, 0.055, 2100]], cooldown: 0.55, duck: 0.55 },
};

export const EFFECT_NAMES = Object.freeze(Object.keys(EFFECTS));

// Sixteen D-major degrees, D4–E6. Interpolation is continuous in log pitch, so an
// 8-bit grid has 256 distinct pitches rather than collapsing to a 16-note scale.
// This is an audible illustration, not a second implementation of game quantization.
const AUDIO_SCALE = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24, 26];
function valueFrequency(value) {
  const position = clamp(value, 0, 1) * (AUDIO_SCALE.length - 1);
  const index = Math.floor(position);
  const semitone = AUDIO_SCALE[index] +
    ((AUDIO_SCALE[index + 1] ?? AUDIO_SCALE[index]) - AUDIO_SCALE[index]) * (position - index);
  return 293.6647679174076 * 2 ** (semitone / 12);
}

export class GameAudio {
  // Construction, scene changes and setEnabled never create an AudioContext.
  constructor(enabled = false) {
    this.enabled = Boolean(enabled);
    this.context = null;
    this.analyser = null;
    this.scene = "overworld";
    this._unlocked = false;
    this._destroyed = false;
    this._audible = false;
    this._timer = null;
    this._cursor = 0;
    this._nextStepTime = 0;
    this._runStartTime = 0;
    this._runStartCursor = 0;
    this._voices = new Set();
    this._effectVoices = 0;
    this._lastEffects = new Map();
    this._pendingEffects = [];
    this._pendingCursor = 0;
    this._graphNodes = [];
    this._waves = new Map();
    this._document = null;
    this._transition = null;
    this._syncRequested = false;
    this._destroySignal = new Promise((resolve) => { this._resolveDestroyed = resolve; });
    this._duckUntil = 0;
    this._onVisibility = () => this._reconcile();
    this._onContextState = () => {
      if (this.context.state === "running" && this._canPlay()) this._startMusic();
      else this._pause();
    };
  }

  setEnabled(enabled) {
    if (this._destroyed) return Promise.resolve(false);
    this.enabled = Boolean(enabled);
    return this._reconcile();
  }

  // Called after a genuine Enter/pointer gesture; hasBeenActive also permits the
  // game's next animation frame to do the unlocking, rather than only the handler.
  async unlock() {
    if (this._destroyed) return false;
    if (!this.context) {
      if (globalThis.navigator?.userActivation && !navigator.userActivation.hasBeenActive) return false;
      const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContext) return false;
      try {
        this.context = new AudioContext({ latencyHint: "interactive" });
        this._buildGraph();
      } catch {
        for (const node of this._graphNodes) node.disconnect();
        this._graphNodes.length = 0;
        this.context?.close().catch(() => {});
        this.context = null;
        this.analyser = null;
        return false;
      }
      this._document = typeof document === "undefined" ? null : document;
      this._document?.addEventListener("visibilitychange", this._onVisibility);
      this.context.addEventListener("statechange", this._onContextState);
    }
    this._unlocked = true;
    return this._reconcile();
  }

  setScene(scene) {
    if (this._destroyed || !Object.hasOwn(SCORES, scene)) return false;
    if (scene === this.scene) return true;
    this._haltScheduler(false);
    this._stopVoices("music", 0.022);
    this.scene = scene;
    this._cursor = 0;
    if (this.context) {
      this._musicFilter.frequency.setTargetAtTime(SCORES[scene].cutoff, this.context.currentTime, 0.025);
      if (this._canPlay() && this.context.state === "running") this._startMusic();
    }
    return true;
  }

  play(name) {
    if (!this._canPlay() || this.context?.state !== "running") return false;
    // Legacy callers used select as the fallback for unnamed UI confirmations.
    const key = Object.hasOwn(EFFECTS, name) ? name : "select";
    const effect = EFFECTS[key];
    const now = this.context.currentTime;
    if (now - (this._lastEffects.get(key) ?? -Infinity) < effect.cooldown) return false;
    this._lastEffects.set(key, now);
    if (effect.duck) this._duckMusic(effect.duck);
    const start = now + 0.005;
    for (const [frequency, delay, duration, wave, level, endFrequency] of effect.notes)
      this._tone(frequency, start + delay, duration, wave, level, "sfx", endFrequency);
    for (const [delay, duration, level, cutoff] of effect.noise ?? [])
      this._noise(start + delay, duration, level, cutoff, "sfx");
    return true;
  }

  /** Values in [0,1], gap in seconds. Callers normalize true/rebuilt values alike. */
  snapNotes(levels01, { bits = 4, gap = 0.045 } = {}) {
    if (!this._canPlay() || this.context?.state !== "running" || !levels01?.length) return false;
    const depth = clamp(Math.round(Number.isFinite(bits) ? bits : 4), 1, 8);
    const codes = 2 ** depth - 1;
    const spacing = clamp(Number.isFinite(gap) ? gap : 0.045, 0.018, 0.3);
    const values = Array.from(levels01).filter(Number.isFinite);
    if (!values.length) return false;
    this._clearPreview();
    const start = this.context.currentTime + 0.008;
    this._pendingEffects = values.map((value, index) => {
      const grid = Math.round(clamp(value, 0, 1) * codes) / codes;
      // Low-bit codes land on actual scale degrees; high-bit codes interpolate.
      const musical = depth <= 4 ? Math.round(grid * 15) / 15 : grid;
      return { frequency: valueFrequency(musical), start: start + index * spacing,
        duration: Math.min(0.17, spacing * 1.65) };
    });
    this._duckMusic(spacing * values.length + 0.1, 0.48);
    this._drainEffects(this.context.currentTime);
    return true;
  }

  /** The same pitch contour without discrete codes: one continuous portamento. */
  glide(values01, { duration = 0.85 } = {}) {
    if (!this._canPlay() || this.context?.state !== "running" || !values01?.length) return false;
    const values = Array.from(values01).filter(Number.isFinite);
    if (!values.length) return false;
    const seconds = clamp(Number.isFinite(duration) ? duration : 0.85, 0.08, 8);
    this._clearPreview();
    this._duckMusic(seconds, 0.48);
    this._tone(valueFrequency(values[0]), this.context.currentTime + 0.008,
      seconds, "flute", 0.16, "preview", undefined, values.map(valueFrequency));
    return true;
  }

  destroy() {
    if (this._destroyed) return Promise.resolve();
    this._destroyed = true;
    this._resolveDestroyed();
    this.enabled = false;
    this._unlocked = false;
    this._syncRequested = false;
    this._pause();
    this._document?.removeEventListener("visibilitychange", this._onVisibility);
    this.context?.removeEventListener("statechange", this._onContextState);
    for (const node of this._graphNodes) node.disconnect();
    this._graphNodes.length = 0;
    this._waves.clear();
    this._noiseBuffer = null;
    this.analyser = null;
    this._document = null;
    if (this.context && this.context.state !== "closed") return this.context.close().catch(() => {});
    return Promise.resolve();
  }

  _buildGraph() {
    const context = this.context;
    this._musicGain = context.createGain();
    this._musicGain.gain.value = MUSIC_LEVEL;
    this._musicFilter = context.createBiquadFilter();
    this._musicFilter.type = "lowpass";
    this._musicFilter.frequency.value = SCORES[this.scene].cutoff;
    this._musicFilter.Q.value = 0.45;
    this._effectsGain = context.createGain();
    this._effectsGain.gain.value = 0.94;
    this._master = context.createGain();
    this._master.gain.value = 0;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 10;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.14;
    // The soft ceiling is after the compressor; even simultaneous reward sounds
    // cannot exceed full scale. Normal gameplay stays in its near-linear region.
    const limiter = context.createWaveShaper();
    const curve = new Float32Array(2049);
    for (let i = 0; i < curve.length; i++) {
      const x = i * 2 / (curve.length - 1) - 1;
      curve[i] = 0.88 * Math.tanh(x / 0.88);
    }
    limiter.curve = curve;
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.65;
    this._musicGain.connect(this._musicFilter);
    this._musicFilter.connect(this._master);
    this._effectsGain.connect(this._master);
    this._master.connect(compressor);
    compressor.connect(limiter);
    limiter.connect(this.analyser);
    this.analyser.connect(context.destination);
    this._graphNodes = [this._musicGain, this._musicFilter, this._effectsGain,
      this._master, compressor, limiter, this.analyser];

    const harmonics = {
      softPulse: [0, 1, 0, 0.24, 0, 0.10, 0, 0.045],
      reed: [0, 1, 0.28, 0.16, 0.12, 0.07, 0.035],
      bell: [0, 1, 0.07, 0.29, 0, 0.06],
      pluck: [0, 1, 0.32, 0.15, 0.06, 0.025],
      flute: [0, 1, 0.08, 0.035],
      pad: [0, 1, 0, 0.075, 0, 0.025],
    };
    for (const [name, partials] of Object.entries(harmonics))
      this._waves.set(name, context.createPeriodicWave(new Float32Array(partials.length), new Float32Array(partials)));
    // One reusable deterministic noise sample; no sample downloads or per-frame RNG.
    this._noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.5), context.sampleRate);
    const samples = this._noiseBuffer.getChannelData(0);
    let seed = 0x15a4e35;
    for (let i = 0; i < samples.length; i++) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      samples[i] = (seed >>> 0) / 2147483648 - 1;
    }
  }

  _canPlay() {
    return this.enabled && this._unlocked && !this._destroyed && !this._document?.hidden;
  }

  _reconcile() {
    if (!this._canPlay()) this._pause();
    if (!this.context || !this._unlocked || this._destroyed || this.context.state === "closed")
      return Promise.resolve(false);
    this._syncRequested = true;
    if (!this._transition) {
      // Serialize suspend/resume so a late mute cannot win a rapid unmute.
      this._transition = this._settle().finally(() => {
        this._transition = null;
        if (this._syncRequested && !this._destroyed) this._reconcile();
      });
    }
    return this._transition;
  }

  async _settle() {
    while (this._syncRequested && !this._destroyed) {
      this._syncRequested = false;
      const shouldPlay = this._canPlay();
      try {
        // Some browsers leave resume() pending if close() wins its startup race.
        // Destruction must still settle every public unlock/setEnabled promise.
        await Promise.race([
          shouldPlay ? this.context.resume() : this.context.suspend(),
          this._destroySignal,
        ]);
      } catch {
        this._pause();
        return false;
      }
      if (this._destroyed) return false;
      if (this._canPlay() && this.context.state === "running") this._startMusic();
      else this._pause();
      if (shouldPlay !== this._canPlay()) this._syncRequested = true;
    }
    return this._canPlay() && this.context.state === "running";
  }

  _startMusic() {
    if (this._timer !== null || !this._canPlay() || this.context.state !== "running") return;
    const now = this.context.currentTime;
    if (!this._audible) {
      this._master.gain.cancelScheduledValues(now);
      this._master.gain.setValueAtTime(0, now);
      this._master.gain.linearRampToValueAtTime(MASTER_LEVEL, now + 0.025);
      this._audible = true;
    }
    this._nextStepTime = now + START_DELAY;
    this._runStartTime = this._nextStepTime;
    this._runStartCursor = this._cursor;
    this._timer = setInterval(() => this._schedule(), SCHEDULER_MS);
    this._schedule();
  }

  _haltScheduler(preserve) {
    if (this._timer === null) return;
    clearInterval(this._timer);
    this._timer = null;
    if (preserve) {
      const score = SCORES[this.scene];
      const elapsedSteps = Math.max(0, Math.ceil((this.context.currentTime - this._runStartTime) / score.stepSeconds));
      this._cursor = (this._runStartCursor + elapsedSteps) % score.steps.length;
    }
  }

  _pause() {
    this._haltScheduler(true);
    this._stopVoices(null, 0);
    this._pendingEffects.length = 0;
    this._pendingCursor = 0;
    this._lastEffects.clear();
    this._audible = false;
    this._duckUntil = 0;
    if (this._master) {
      const now = this.context.currentTime;
      this._master.gain.cancelScheduledValues(now);
      this._master.gain.setValueAtTime(0, now);
      this._musicGain.gain.cancelScheduledValues(now);
      this._musicGain.gain.setValueAtTime(MUSIC_LEVEL, now);
    }
  }

  _duckMusic(duration, amount = 0.62) {
    const now = this.context.currentTime;
    this._duckUntil = Math.max(this._duckUntil, now + duration);
    const gain = this._musicGain.gain;
    if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(now);
    else { const value = gain.value; gain.cancelScheduledValues(now); gain.setValueAtTime(value, now); }
    gain.linearRampToValueAtTime(MUSIC_LEVEL * amount, now + 0.015);
    gain.setValueAtTime(MUSIC_LEVEL * amount, this._duckUntil);
    gain.linearRampToValueAtTime(MUSIC_LEVEL, this._duckUntil + 0.22);
  }

  _clearPreview() {
    this._pendingEffects.length = 0;
    this._pendingCursor = 0;
    this._stopVoices("preview", 0.012);
  }

  _drainEffects(now) {
    while (this._pendingCursor < this._pendingEffects.length) {
      const note = this._pendingEffects[this._pendingCursor];
      if (note.start >= now + LOOK_AHEAD) break;
      this._pendingCursor++;
      if (note.start < now - 0.05) continue;
      this._tone(note.frequency, Math.max(note.start, now + 0.001), note.duration,
        "bell", 0.18, "preview");
    }
    if (this._pendingCursor === this._pendingEffects.length) {
      this._pendingEffects.length = 0;
      this._pendingCursor = 0;
    }
  }

  _schedule() {
    if (!this._canPlay() || this.context.state !== "running") { this._pause(); return; }
    const score = SCORES[this.scene];
    const now = this.context.currentTime;
    if (this._nextStepTime < now - 0.025) {
      // Skip late ticks, never machine-gun stale notes after a slow frame/tab wake.
      const missed = Math.ceil((now - this._nextStepTime) / score.stepSeconds);
      this._cursor = (this._cursor + missed) % score.steps.length;
      this._nextStepTime += missed * score.stepSeconds;
    }
    while (this._nextStepTime < now + LOOK_AHEAD) {
      for (const event of score.steps[this._cursor]) this._scoreEvent(event, this._nextStepTime);
      this._cursor = (this._cursor + 1) % score.steps.length;
      this._nextStepTime += score.stepSeconds;
    }
    this._drainEffects(now);
  }

  _scoreEvent(event, time) {
    const start = time + (event.delay ?? 0);
    if (event.voice === "tone")
      this._tone(event.frequency, start, event.duration, event.wave, event.level, "music");
    else this._drum(event.voice, start, event.level);
  }

  _tone(frequency, start, duration, wave, level, category, endFrequency, contour) {
    const context = this.context;
    const source = context.createOscillator();
    const envelope = context.createGain();
    if (this._waves.has(wave)) source.setPeriodicWave(this._waves.get(wave));
    else source.type = wave;
    source.frequency.setValueAtTime(frequency, start);
    if (contour?.length > 1) {
      for (let i = 1; i < contour.length; i++)
        source.frequency.exponentialRampToValueAtTime(contour[i], start + duration * i / (contour.length - 1));
    } else if (endFrequency) source.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    const attack = Math.min(wave === "pad" ? 0.065 : 0.007, duration * 0.18);
    const decay = Math.min(wave === "bell" || wave === "pluck" ? 0.055 : 0.036, duration * 0.25);
    const release = Math.min(wave === "pad" ? 0.16 : 0.07, duration * 0.3);
    const sustain = level * (wave === "bell" ? 0.25 : wave === "pluck" ? 0.18 : 0.72);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(level, start + attack);
    envelope.gain.exponentialRampToValueAtTime(sustain, start + attack + decay);
    envelope.gain.setValueAtTime(sustain, start + duration - release);
    envelope.gain.linearRampToValueAtTime(0, start + duration);
    source.connect(envelope);
    envelope.connect(category === "music" ? this._musicGain : this._effectsGain);
    this._trackVoice(source, envelope, [source, envelope], start, category);
    source.start(start);
    source.stop(start + duration + 0.005);
  }

  _noise(start, duration, level, cutoff, category) {
    const context = this.context;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = this._noiseBuffer;
    filter.type = "highpass";
    filter.frequency.value = cutoff;
    filter.Q.value = 0.6;
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(level, start + 0.002);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration - 0.003);
    envelope.gain.linearRampToValueAtTime(0, start + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(category === "music" ? this._musicGain : this._effectsGain);
    this._trackVoice(source, envelope, [source, filter, envelope], start, category);
    source.start(start);
    source.stop(start + duration + 0.005);
  }

  _drum(kind, start, level) {
    if (kind === "kick") this._tone(142, start, 0.13, "sine", 0.25 * level, "music", 43);
    else if (kind === "snare") {
      this._noise(start, 0.105, 0.105 * level, 1300, "music");
      this._tone(185, start, 0.07, "triangle", 0.07 * level, "music", 115);
    } else if (kind === "tom" || kind === "conga") {
      this._tone(kind === "conga" ? 320 : 185, start, 0.14,
        "triangle", 0.16 * level, "music", kind === "conga" ? 175 : 77);
    } else if (kind === "rim") {
      this._tone(920, start, 0.025, "pluck", 0.12 * level, "music", 680);
      this._noise(start, 0.022, 0.035 * level, 1800, "music");
    } else if (kind === "metal") {
      this._tone(1174, start, 0.07, "bell", 0.075 * level, "music");
      this._tone(1631, start, 0.045, "sine", 0.035 * level, "music");
    } else this._noise(start, kind === "open" ? 0.12 : kind === "shaker" ? 0.06 : 0.035,
      (kind === "shaker" ? 0.025 : 0.032) * level, kind === "shaker" ? 2600 : 3800, "music");
  }

  _trackVoice(source, envelope, nodes, start, category) {
    if (category !== "music" && this._effectVoices >= MAX_EFFECT_VOICES) {
      for (const voice of this._voices) {
        if (voice.category !== "music") { this._cutVoice(voice, 0); break; }
      }
    }
    const voice = { source, envelope, nodes, start, category, released: false };
    this._voices.add(voice);
    if (category !== "music") this._effectVoices++;
    source.onended = () => this._disposeVoice(voice);
  }

  _stopVoices(category, fade) {
    for (const voice of this._voices)
      if (!category || voice.category === category) this._cutVoice(voice, fade);
  }

  _cutVoice(voice, fade) {
    const now = this.context.currentTime;
    if (fade && voice.start < now && this.context.state === "running") {
      if (voice.released) return;
      const gain = voice.envelope.gain;
      if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(now);
      else { const level = gain.value; gain.cancelScheduledValues(now); gain.setValueAtTime(level, now); }
      gain.linearRampToValueAtTime(0, now + fade);
      voice.source.stop(now + fade + 0.003);
      voice.released = true;
    } else {
      voice.source.stop(now);
      this._disposeVoice(voice);
    }
  }

  _disposeVoice(voice) {
    if (!this._voices.delete(voice)) return;
    if (voice.category !== "music") this._effectVoices--;
    voice.source.onended = null;
    for (const node of voice.nodes) node.disconnect();
  }
}
