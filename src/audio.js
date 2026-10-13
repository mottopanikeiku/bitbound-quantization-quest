import { SCORES } from "./music.js";

const LOOK_AHEAD = 0.14;
const SCHEDULER_MS = 25;
const START_DELAY = 0.035;
const MASTER_LEVEL = 0.62;
const MAX_EFFECT_VOICES = 32;

// Frequency, delay, duration, waveform, level, optional final frequency.
// These short gestures sit above the continuous score, never replace it.
const EFFECTS = {
  step: { notes: [[190, 0, 0.035, "triangle", 0.045, 120]], cooldown: 0.09 },
  select: {
    notes: [
      [523.25, 0, 0.045, "square", 0.052],
      [783.99, 0.04, 0.06, "square", 0.047],
    ],
    cooldown: 0.05,
  },
  cast: {
    notes: [
      [293.66, 0, 0.08, "triangle", 0.14],
      [369.99, 0.06, 0.09, "square", 0.065],
      [440, 0.12, 0.09, "square", 0.065],
      [587.33, 0.19, 0.16, "triangle", 0.14],
    ],
    cooldown: 0.1,
  },
  hit: {
    notes: [[170, 0, 0.085, "triangle", 0.22, 48]],
    noise: [[0, 0.075, 0.14, 1100]],
    cooldown: 0.055,
  },
  enemy: {
    notes: [
      [330, 0, 0.12, "sawtooth", 0.072, 120],
      [147, 0.055, 0.14, "triangle", 0.15, 73.5],
    ],
    noise: [[0.02, 0.09, 0.07, 700]],
    cooldown: 0.1,
  },
  guard: {
    notes: [
      [293.66, 0, 0.2, "triangle", 0.14],
      [440, 0.03, 0.19, "triangle", 0.095],
      [587.33, 0.06, 0.16, "square", 0.04],
    ],
    noise: [[0, 0.06, 0.035, 2200]],
    cooldown: 0.15,
  },
  scan: {
    notes: [
      [587.33, 0, 0.045, "triangle", 0.12],
      [880, 0.065, 0.045, "triangle", 0.105],
      [1174.66, 0.13, 0.045, "triangle", 0.095],
      [1760, 0.195, 0.09, "triangle", 0.07],
    ],
    cooldown: 0.16,
  },
  win: {
    notes: [
      [587.33, 0, 0.11, "square", 0.065],
      [739.99, 0.1, 0.11, "square", 0.065],
      [880, 0.2, 0.12, "square", 0.06],
      [1174.66, 0.34, 0.27, "triangle", 0.14],
    ],
    cooldown: 0.25,
  },
  capture: {
    notes: [
      [587.33, 0, 0.12, "triangle", 0.14],
      [739.99, 0.11, 0.12, "square", 0.06],
      [987.77, 0.22, 0.13, "square", 0.055],
      [880, 0.34, 0.12, "square", 0.055],
      [739.99, 0.45, 0.12, "square", 0.05],
      [1174.66, 0.57, 0.38, "triangle", 0.14],
    ],
    cooldown: 0.3,
  },
  retry: {
    notes: [
      [329.63, 0, 0.11, "triangle", 0.13],
      [293.66, 0.12, 0.13, "triangle", 0.12],
      [220, 0.25, 0.18, "triangle", 0.11],
    ],
    cooldown: 0.2,
  },
  heal: {
    notes: [
      [587.33, 0, 0.13, "triangle", 0.13],
      [739.99, 0.09, 0.14, "triangle", 0.12],
      [880, 0.18, 0.16, "triangle", 0.11],
      [739.99, 0.29, 0.12, "triangle", 0.095],
      [1174.66, 0.39, 0.25, "triangle", 0.11],
    ],
    cooldown: 0.25,
  },
};

export class GameAudio {
  // Construction and module import never create an AudioContext or start music.
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
    this._graphNodes = [];
    this._document = null;
    this._transition = null;
    this._syncRequested = false;
    this._onVisibility = () => {
      this._reconcile();
    };
    this._onContextState = () => {
      if (this.context.state === "running" && this._canPlay())
        this._startMusic();
      else this._pause();
    };
  }

  setEnabled(enabled) {
    if (this._destroyed) return Promise.resolve(false);
    this.enabled = Boolean(enabled);
    return this._reconcile();
  }

  // Call from Enter/click/touch, not from loading a save or rendering a screen.
  // Resolves to whether sound is running; false also covers unsupported browsers.
  async unlock() {
    if (this._destroyed) return false;
    if (!this.context) {
      const AudioContext =
        globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContext) return false;
      try {
        this.context = new AudioContext({ latencyHint: "interactive" });
      } catch {
        return false;
      }
      this._buildGraph();
      this._document = typeof document === "undefined" ? null : document;
      this._document?.addEventListener("visibilitychange", this._onVisibility);
      this.context.addEventListener("statechange", this._onContextState);
    }
    this._unlocked = true;
    // _settle starts synchronously, so its initial resume is inside the gesture.
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
      this._musicFilter.frequency.setTargetAtTime(
        SCORES[scene].cutoff,
        this.context.currentTime,
        0.025,
      );
      if (this._canPlay() && this.context.state === "running")
        this._startMusic();
    }
    return true;
  }

  play(name) {
    if (!this._canPlay() || this.context?.state !== "running") return false;
    const key = Object.hasOwn(EFFECTS, name) ? name : "select";
    const effect = EFFECTS[key];
    const now = this.context.currentTime;
    if (now - (this._lastEffects.get(key) ?? -Infinity) < effect.cooldown)
      return false;
    this._lastEffects.set(key, now);
    const start = now + 0.005;
    for (const [
      frequency,
      delay,
      duration,
      wave,
      level,
      endFrequency,
    ] of effect.notes) {
      this._tone(
        frequency,
        start + delay,
        duration,
        wave,
        level,
        "sfx",
        endFrequency,
      );
    }
    for (const [delay, duration, level, cutoff] of effect.noise ?? []) {
      this._noise(start + delay, duration, level, cutoff, "sfx");
    }
    return true;
  }

  destroy() {
    if (this._destroyed) return Promise.resolve();
    this._destroyed = true;
    this.enabled = false;
    this._unlocked = false;
    this._syncRequested = false;
    this._pause();
    this._document?.removeEventListener("visibilitychange", this._onVisibility);
    this.context?.removeEventListener("statechange", this._onContextState);
    for (const node of this._graphNodes) node.disconnect();
    this._graphNodes.length = 0;
    this._noiseBuffer = null;
    this.analyser = null;
    this._document = null;
    if (this.context && this.context.state !== "closed")
      return this.context.close().catch(() => {});
    return Promise.resolve();
  }

  _buildGraph() {
    const context = this.context;
    this._musicGain = context.createGain();
    this._musicGain.gain.value = 0.82;
    this._musicFilter = context.createBiquadFilter();
    this._musicFilter.type = "lowpass";
    this._musicFilter.frequency.value = SCORES[this.scene].cutoff;
    this._musicFilter.Q.value = 0.45;
    this._effectsGain = context.createGain();
    this._effectsGain.gain.value = 0.82;
    this._master = context.createGain();
    this._master.gain.value = 0;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 14;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.12;
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.65;
    this._musicGain.connect(this._musicFilter);
    this._musicFilter.connect(this._master);
    this._effectsGain.connect(this._master);
    this._master.connect(compressor);
    compressor.connect(this.analyser);
    this.analyser.connect(context.destination);
    this._graphNodes = [
      this._musicGain,
      this._musicFilter,
      this._effectsGain,
      this._master,
      compressor,
      this.analyser,
    ];

    // One reusable, deterministic noise sample; each hit gets its own short source.
    this._noiseBuffer = context.createBuffer(
      1,
      Math.ceil(context.sampleRate * 0.5),
      context.sampleRate,
    );
    const samples = this._noiseBuffer.getChannelData(0);
    let seed = 0x15a4e35;
    for (let i = 0; i < samples.length; i += 1) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      samples[i] = (seed >>> 0) / 2147483648 - 1;
    }
  }

  _canPlay() {
    return (
      this.enabled &&
      this._unlocked &&
      !this._destroyed &&
      !this._document?.hidden
    );
  }

  _reconcile() {
    if (!this._canPlay()) this._pause();
    if (
      !this.context ||
      !this._unlocked ||
      this._destroyed ||
      this.context.state === "closed"
    )
      return Promise.resolve(false);
    this._syncRequested = true;
    if (!this._transition) {
      // One serialized transition prevents a late suspend from winning a rapid unmute.
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
        if (shouldPlay) await this.context.resume();
        else await this.context.suspend();
      } catch {
        this._pause();
        return false;
      }
      if (this._destroyed) return false;
      if (this._canPlay() && this.context.state === "running")
        this._startMusic();
      else this._pause();
      if (shouldPlay !== this._canPlay()) this._syncRequested = true;
    }
    return this._canPlay() && this.context.state === "running";
  }

  _startMusic() {
    if (
      this._timer !== null ||
      !this._canPlay() ||
      this.context.state !== "running"
    )
      return;
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
      const elapsedSteps = Math.max(
        0,
        Math.ceil(
          (this.context.currentTime - this._runStartTime) / score.stepSeconds,
        ),
      );
      this._cursor = (this._runStartCursor + elapsedSteps) % score.steps.length;
    }
  }

  _pause() {
    // Discard queued voices, not the musical cursor: hidden/muted time is paused.
    this._haltScheduler(true);
    this._stopVoices(null, 0);
    this._lastEffects.clear();
    this._audible = false;
    if (this._master) {
      const now = this.context.currentTime;
      this._master.gain.cancelScheduledValues(now);
      this._master.gain.setValueAtTime(0, now);
    }
  }

  _schedule() {
    if (!this._canPlay() || this.context.state !== "running") {
      this._pause();
      return;
    }
    const score = SCORES[this.scene];
    const now = this.context.currentTime;
    if (this._nextStepTime < now - 0.025) {
      // A busy frame must skip missed ticks, never play a burst of stale notes.
      const missed = Math.ceil((now - this._nextStepTime) / score.stepSeconds);
      this._cursor = (this._cursor + missed) % score.steps.length;
      this._nextStepTime += missed * score.stepSeconds;
    }
    while (this._nextStepTime < now + LOOK_AHEAD) {
      for (const event of score.steps[this._cursor]) {
        if (event.voice === "tone") {
          this._tone(
            event.frequency,
            this._nextStepTime,
            event.duration,
            event.wave,
            event.level,
            "music",
          );
        } else {
          this._drum(event.voice, this._nextStepTime, event.level);
        }
      }
      this._cursor = (this._cursor + 1) % score.steps.length;
      this._nextStepTime += score.stepSeconds;
    }
  }

  _tone(frequency, start, duration, wave, level, category, endFrequency) {
    const context = this.context;
    const source = context.createOscillator();
    const envelope = context.createGain();
    source.type = wave;
    source.frequency.setValueAtTime(frequency, start);
    if (endFrequency)
      source.frequency.exponentialRampToValueAtTime(
        endFrequency,
        start + duration,
      );
    const attack = Math.min(0.008, duration * 0.18);
    const decay = Math.min(0.036, duration * 0.25);
    const release = Math.min(0.06, duration * 0.3);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(level, start + attack);
    envelope.gain.exponentialRampToValueAtTime(
      level * 0.72,
      start + attack + decay,
    );
    envelope.gain.setValueAtTime(level * 0.72, start + duration - release);
    envelope.gain.linearRampToValueAtTime(0, start + duration);
    source.connect(envelope);
    envelope.connect(
      category === "music" ? this._musicGain : this._effectsGain,
    );
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
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(
      category === "music" ? this._musicGain : this._effectsGain,
    );
    this._trackVoice(
      source,
      envelope,
      [source, filter, envelope],
      start,
      category,
    );
    source.start(start);
    source.stop(start + duration + 0.005);
  }

  _drum(kind, start, level) {
    if (kind === "kick") {
      this._tone(142, start, 0.13, "sine", 0.25 * level, "music", 43);
    } else if (kind === "snare") {
      this._noise(start, 0.105, 0.105 * level, 1300, "music");
      this._tone(185, start, 0.07, "triangle", 0.07 * level, "music", 115);
    } else if (kind === "tom") {
      this._tone(185, start, 0.14, "triangle", 0.16 * level, "music", 77);
    } else {
      // Keep a soft hat body below the scene low-pass (3.9–5.1 kHz), not above it.
      this._noise(
        start,
        kind === "open" ? 0.12 : 0.035,
        0.032 * level,
        3800,
        "music",
      );
    }
  }

  _trackVoice(source, envelope, nodes, start, category) {
    if (category === "sfx" && this._effectVoices >= MAX_EFFECT_VOICES) {
      for (const voice of this._voices) {
        if (voice.category === "sfx") {
          this._cutVoice(voice, 0);
          break;
        }
      }
    }
    const voice = { source, envelope, nodes, start, category, released: false };
    this._voices.add(voice);
    if (category === "sfx") this._effectVoices += 1;
    source.onended = () => this._disposeVoice(voice);
  }

  _stopVoices(category, fade) {
    for (const voice of this._voices) {
      if (!category || voice.category === category) this._cutVoice(voice, fade);
    }
  }

  _cutVoice(voice, fade) {
    const now = this.context.currentTime;
    if (fade && voice.start < now && this.context.state === "running") {
      if (voice.released) return;
      const gain = voice.envelope.gain;
      if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(now);
      else {
        const level = gain.value;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(level, now);
      }
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
    if (voice.category === "sfx") this._effectVoices -= 1;
    voice.source.onended = null;
    for (const node of voice.nodes) node.disconnect();
  }
}
