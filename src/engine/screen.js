import { clamp } from './util.js';

/** Smallest logical canvas each orientation's layouts are designed for. */
export const MIN_LANDSCAPE = Object.freeze({ w: 384, h: 216 });
export const MIN_PORTRAIT = Object.freeze({ w: 216, h: 320 });
/** Beyond these (extreme aspect ratios only) the canvas stops growing and is letterboxed. */
export const MAX_LANDSCAPE = Object.freeze({ w: 640, h: 480 });
export const MAX_PORTRAIT = Object.freeze({ w: 400, h: 640 });
/** Whole device-pixel scales stay crisp; accept art up to this much smaller to keep them. */
const SNAP_TOLERANCE = 1.25;

/**
 * Fit the logical canvas to a stage so the game covers all of it. The logical size grows with
 * the stage's aspect ratio and is never below the orientation's design minimum. Each game pixel
 * spans a whole number of device pixels when that costs at most 25% of the art's size; otherwise
 * a fractional scale fills the stage exactly. Sizes are CSS pixels; scale is CSS px per game px.
 */
export function fitScreen(availW, availH, dpr = 1) {
  const portrait = availH > availW;
  const min = portrait ? MIN_PORTRAIT : MIN_LANDSCAPE;
  const max = portrait ? MAX_PORTRAIT : MAX_LANDSCAPE;
  const deviceW = availW * dpr;
  const deviceH = availH * dpr;
  const ideal = Math.min(deviceW / min.w, deviceH / min.h);
  const whole = Math.floor(ideal);
  const crisp = whole >= 2 && ideal / whole <= SNAP_TOLERANCE;
  const pixel = crisp ? whole : ideal; // device pixels per game pixel
  const scale = pixel / dpr;
  // Crisp: round the logical size up and let the stage crop under one game pixel per edge.
  // Fractional: round to the nearest pixel and stretch the canvas over the stage exactly.
  const span = (device, lo, hi) => clamp(crisp ? Math.ceil(device / pixel - 1e-9) : Math.round(device / pixel), lo, hi);
  const w = span(deviceW, min.w, max.w);
  const h = span(deviceH, min.h, max.h);
  const fills = (device, hi) => !crisp && Math.round(device / pixel) <= hi;
  return {
    w,
    h,
    portrait,
    crisp,
    scale,
    cssW: fills(deviceW, max.w) ? availW : w * scale,
    cssH: fills(deviceH, max.h) ? availH : h * scale,
  };
}

/**
 * The single game canvas. It always covers its stage (the whole window, or the whole screen in
 * full screen): the logical size adapts to the stage, so every scene lays out from w/h.
 */
export class Screen {
  constructor(canvas, stage) {
    this.canvas = canvas;
    this.stage = stage;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.w = MIN_LANDSCAPE.w;
    this.h = MIN_LANDSCAPE.h;
    this.portrait = false;
    this.crisp = true;
    this.scale = 1;
    this._lastChange = -Infinity;
    this._settle = null;
    this._observer = new ResizeObserver(() => this._stageChanged());
    this._observer.observe(stage);
    addEventListener('orientationchange', () => this.resize());
    this._watchPixelRatio();
    this.resize();
  }

  /** Moving between monitors or zooming can change devicePixelRatio without resizing the stage. */
  _watchPixelRatio() {
    const query = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    query.addEventListener?.('change', () => {
      this.resize();
      this._watchPixelRatio();
    }, { once: true });
  }

  /**
   * A lone change (entering full screen, rotating a phone) applies at once. While a window is
   * being dragged, the size settles first, so caches keyed by canvas size see two sizes per drag
   * instead of every intermediate one.
   */
  _stageChanged() {
    const now = performance.now();
    const dragging = now - this._lastChange < 250;
    this._lastChange = now;
    clearTimeout(this._settle);
    if (dragging) this._settle = setTimeout(() => this.resize(), 160);
    else this.resize();
  }

  resize() {
    const fit = fitScreen(Math.max(1, this.stage.clientWidth), Math.max(1, this.stage.clientHeight), window.devicePixelRatio || 1);
    if (this.canvas.width !== fit.w) this.canvas.width = fit.w;
    if (this.canvas.height !== fit.h) this.canvas.height = fit.h;
    this.canvas.style.width = `${fit.cssW}px`;
    this.canvas.style.height = `${fit.cssH}px`;
    this.ctx.imageSmoothingEnabled = false;
    this.w = fit.w;
    this.h = fit.h;
    this.portrait = fit.portrait;
    this.crisp = fit.crisp;
    this.scale = fit.scale;
    document.documentElement.dataset.orientation = fit.portrait ? 'portrait' : 'landscape';
  }
}
