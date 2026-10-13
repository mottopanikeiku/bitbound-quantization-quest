import { clamp } from './util.js';

export const LANDSCAPE_W = 384;
export const LANDSCAPE_H = 216;
export const PORTRAIT_W = 216;
export const PORTRAIT_MIN_H = 320;
export const PORTRAIT_MAX_H = 420;

/**
 * One canvas, one pixel scale. Landscape is always 384×216; portrait containers get
 * 216 × H (H ∈ [320, 420]) so phone text stays readable. CSS scales the canvas with
 * an integer device-pixel factor whenever at least two device pixels fit.
 */
export class Screen {
  constructor(canvas, stage) {
    this.canvas = canvas;
    this.stage = stage;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.w = LANDSCAPE_W;
    this.h = LANDSCAPE_H;
    this.portrait = false;
    this.scale = 1;
    this._listeners = new Set();
    this._observer = new ResizeObserver(() => this.resize());
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

  onResize(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  resize() {
    const availW = Math.max(1, this.stage.clientWidth);
    const availH = Math.max(1, this.stage.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    const portrait = availH > availW * 1.15;
    let w = LANDSCAPE_W;
    let h = LANDSCAPE_H;
    if (portrait) {
      w = PORTRAIT_W;
      h = clamp(Math.floor(availH / (availW / PORTRAIT_W)), PORTRAIT_MIN_H, PORTRAIT_MAX_H);
    }
    let scale = Math.min(availW / w, availH / h);
    const devicePixels = Math.floor(scale * dpr);
    if (devicePixels >= 2) scale = devicePixels / dpr;
    const changed = w !== this.w || h !== this.h || portrait !== this.portrait;
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.canvas.style.width = `${Math.round(w * scale)}px`;
    this.canvas.style.height = `${Math.round(h * scale)}px`;
    this.ctx.imageSmoothingEnabled = false;
    this.w = w;
    this.h = h;
    this.portrait = portrait;
    this.scale = scale;
    document.documentElement.style.setProperty('--px', `${scale}px`);
    document.documentElement.dataset.orientation = portrait ? 'portrait' : 'landscape';
    for (const listener of this._listeners) listener(this, changed);
  }
}
