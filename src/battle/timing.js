// Timing is in seconds; input timestamps are in the performance.now() clock.
import { clamp } from '../engine/util.js';

export const GUARD_WINDOWS = Object.freeze({ perfect: 0.07, good: 0.16 });

export function guardJudgement(errorSeconds, braced = false) {
  const distance = Math.abs(errorSeconds);
  const grade = distance <= GUARD_WINDOWS.perfect + 1e-9 ? 'perfect' : distance <= GUARD_WINDOWS.good + 1e-9 ? 'good' : 'miss';
  return { grade, multiplier: (grade === 'perfect' ? 0.25 : grade === 'good' ? 0.6 : 1) * (braced ? 0.5 : 1), bytes: grade === 'perfect' ? 2 : 0 };
}

export function breathing(elapsed, period = 1.9) {
  return 0.5 - 0.5 * Math.cos((Math.PI * 2 * elapsed) / period);
}

// Back-project to the key event, not the next rendered frame. Cap correction at
// this frame's dt so a stale timestamp can never rewind a completed lock.
export function eventElapsed(elapsed, input, now, dt, speed = 1) {
  const stamp = input.pressTime?.('confirm') ?? now;
  return Math.max(0, elapsed - clamp((now - stamp) / 1000, 0, dt) * speed);
}
