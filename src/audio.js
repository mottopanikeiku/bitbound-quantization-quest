const MELODIES = {
  step: [[220, 0, 0.025]],
  select: [[440, 0, 0.06], [660, 0.05, 0.08]],
  cast: [[261.63, 0, 0.08], [329.63, 0.08, 0.08], [392, 0.16, 0.12]],
  retry: [[293.66, 0, 0.1], [261.63, 0.12, 0.16]],
  win: [[523.25, 0, 0.1], [659.25, 0.1, 0.1], [783.99, 0.2, 0.12], [1046.5, 0.34, 0.24]],
  capture: [[392, 0, 0.1], [523.25, 0.1, 0.1], [659.25, 0.2, 0.1], [783.99, 0.3, 0.1], [659.25, 0.4, 0.1], [1046.5, 0.55, 0.36]],
};

export class GameAudio {
  constructor(enabled = false) { this.enabled = enabled; this.context = null; }
  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled) this.play('select');
    else if (this.context) this.context.suspend();
  }
  play(name) {
    if (!this.enabled) return;
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) return;
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') this.context.resume();
    const start = this.context.currentTime;
    for (const [frequency, delay, duration] of MELODIES[name] ?? MELODIES.select) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = name === 'step' ? 'triangle' : 'square';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start + delay);
      gain.gain.linearRampToValueAtTime(name === 'step' ? 0.012 : 0.028, start + delay + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, start + delay + duration);
      oscillator.connect(gain);
      gain.connect(this.context.destination);
      oscillator.start(start + delay);
      oscillator.stop(start + delay + duration + 0.01);
    }
  }
}
