// Physical keys and touch buttons map to a small set of game actions.
// Scenes read held/pressed/repeat; the game loop calls update(dt) first and endFrame() last.

const CODE_ACTIONS = {
  KeyW: ['up'], ArrowUp: ['up'],
  KeyS: ['down'], ArrowDown: ['down'],
  KeyA: ['left'], ArrowLeft: ['left'],
  KeyD: ['right'], ArrowRight: ['right'],
  Enter: ['confirm'], NumpadEnter: ['confirm'], Space: ['confirm'], KeyE: ['confirm'], KeyZ: ['confirm'],
  Escape: ['cancel', 'pause'], Backspace: ['cancel'], KeyX: ['cancel'], KeyP: ['pause'],
  ShiftLeft: ['run'], ShiftRight: ['run'],
  KeyM: ['music'], KeyF: ['fullscreen'], KeyN: ['notes'],
};
// Fallback for browsers/keyboards that report no physical code.
const KEY_ACTIONS = {
  w: ['up'], arrowup: ['up'], s: ['down'], arrowdown: ['down'],
  a: ['left'], arrowleft: ['left'], d: ['right'], arrowright: ['right'],
  enter: ['confirm'], ' ': ['confirm'], e: ['confirm'], z: ['confirm'],
  escape: ['cancel', 'pause'], backspace: ['cancel'], x: ['cancel'], p: ['pause'],
  shift: ['run'], m: ['music'], f: ['fullscreen'], n: ['notes'],
};
const REPEAT_DELAY = 0.32;
const REPEAT_RATE = 0.1;
export const ACTIONS = ['up', 'down', 'left', 'right', 'confirm', 'cancel', 'run', 'pause', 'music', 'fullscreen', 'notes'];

function actionsFor(event) {
  return CODE_ACTIONS[event.code] ?? KEY_ACTIONS[event.key?.toLowerCase()] ?? null;
}

function ignoredTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, a, button:not([data-action])'));
}

export class Input {
  constructor(target = window) {
    this._sources = new Map(); // action -> Set of source ids holding it
    this._pressed = new Set();
    this._pressTime = new Map();
    this._consumed = new Set();
    this._holdTime = new Map();
    this._repeatAt = new Map();
    this._repeating = new Set();
    // Touch-first devices show A/B prompts before the first tap; any key press switches back.
    this.lastDevice = globalThis.matchMedia?.('(pointer: coarse)').matches ? 'touch' : 'keyboard';
    this._onKeyDown = (event) => {
      const actions = actionsFor(event);
      if (!actions || ignoredTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      this.lastDevice = 'keyboard';
      if (event.repeat) return;
      for (const action of actions) this._down(action, `key:${event.code || event.key}`, event.timeStamp);
    };
    this._onKeyUp = (event) => {
      const actions = actionsFor(event);
      if (!actions) return;
      for (const action of actions) this._up(action, `key:${event.code || event.key}`);
    };
    this._onBlur = () => this.clear();
    target.addEventListener('keydown', this._onKeyDown);
    target.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clear();
    });
  }

  _down(action, source, time = performance.now()) {
    let sources = this._sources.get(action);
    if (!sources) this._sources.set(action, (sources = new Set()));
    const wasHeld = sources.size > 0;
    sources.add(source);
    if (!wasHeld) {
      this._pressed.add(action);
      this._pressTime.set(action, time);
      this._holdTime.set(action, 0);
      this._repeatAt.set(action, REPEAT_DELAY);
    }
  }

  _up(action, source) {
    const sources = this._sources.get(action);
    if (!sources) return;
    sources.delete(source);
    if (sources.size === 0) {
      this._holdTime.delete(action);
      this._repeatAt.delete(action);
    }
  }

  /** Bind every element with data-action inside root as a holdable touch/mouse button. */
  bindTouch(root) {
    for (const element of root.querySelectorAll('[data-action]')) {
      const action = element.dataset.action;
      const id = `pointer:${action}:${Math.random().toString(36).slice(2)}`;
      const release = (event) => {
        element.classList.remove('is-held');
        this._up(action, id);
        if (event?.pointerId !== undefined && element.hasPointerCapture?.(event.pointerId)) {
          element.releasePointerCapture(event.pointerId);
        }
      };
      element.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        this.lastDevice = event.pointerType === 'mouse' ? 'mouse' : 'touch';
        element.setPointerCapture?.(event.pointerId);
        element.classList.add('is-held');
        this._down(action, id, event.timeStamp);
      });
      element.addEventListener('pointerup', release);
      element.addEventListener('pointercancel', release);
      element.addEventListener('lostpointercapture', release);
      element.addEventListener('contextmenu', (event) => event.preventDefault());
    }
  }

  /** Programmatic one-frame press (e.g. a DOM button that mirrors an action). */
  tap(action) {
    this._pressed.add(action);
    this._pressTime.set(action, performance.now());
  }

  update(dt) {
    this._repeating.clear();
    for (const [action, time] of this._holdTime) {
      const next = time + dt;
      this._holdTime.set(action, next);
      const at = this._repeatAt.get(action);
      if (next >= at) {
        this._repeating.add(action);
        this._repeatAt.set(action, at + REPEAT_RATE);
      }
    }
  }

  held(action) {
    return (this._sources.get(action)?.size ?? 0) > 0;
  }

  pressed(action) {
    return this._pressed.has(action) && !this._consumed.has(action);
  }

  /** Pressed this frame, or auto-repeating while held (menus). */
  repeat(action) {
    return !this._consumed.has(action) && (this._pressed.has(action) || this._repeating.has(action));
  }

  /** Event timestamp (performance.now() clock) of the latest press of an action. */
  pressTime(action) {
    return this._pressTime.get(action) ?? performance.now();
  }

  consume(action) {
    this._consumed.add(action);
  }

  anyPressed() {
    for (const action of this._pressed) if (!this._consumed.has(action)) return true;
    return false;
  }

  axis() {
    let x = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    let y = (this.held('down') ? 1 : 0) - (this.held('up') ? 1 : 0);
    if (x && y) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    return { x, y };
  }

  endFrame() {
    this._pressed.clear();
    this._consumed.clear();
  }

  /** Release everything (blur, scene transitions). */
  clear() {
    this._sources.clear();
    this._pressed.clear();
    this._consumed.clear();
    this._holdTime.clear();
    this._repeatAt.clear();
    this._repeating.clear();
    for (const element of document.querySelectorAll('[data-action].is-held')) element.classList.remove('is-held');
  }
}
