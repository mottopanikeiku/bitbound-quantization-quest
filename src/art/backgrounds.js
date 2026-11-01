// Original indexed pixel tapestries: paint once, cycle restrained ramps, sample by scanline.
// The two 128px Pix buffers are palette-index patterns, not RGBA sprites. No per-frame art noise.
import { PAL } from './palette.js';
import { Pix, mix, u32, bayer } from './paint.js';
import { clamp, makeCanvas } from '../engine/util.js';
import { drawText } from '../engine/font.js';

export const BACKGROUND_IDS = ['meadow', 'grove', 'cove', 'heights', 'forge', 'archives', 'spire', 'static', 'final', 'well', 'warden', 'duel'];

const SIZE = 128;
const MASK = SIZE - 1;
const PHASES = 24;
const SHADE_STEPS = 8;
const CALM_BANK = SHADE_STEPS * 8;
const CALM_STEPS = 8;
const TITLES = ['Bitleaf reverie', 'The offset cathedral', 'A tide of values', 'Three silken channels', 'Ember inference', 'The ink between', 'The precision court', 'The lost signal', 'Every bit a star', 'The Static Well', 'Court of the wardens', "Fen's chart room"];
// Each entry is a material ramp and a deliberately low brightness; highlights belong to the foe.
const THEMES = {
  meadow: { tones: [['forest', 0.3], ['forest', 1.0], ['forest', 1.7], ['grass', 2.3], ['gold', 1.9], ['forest', 1.5]], speed: 0.6, wave: 8, bend: 0.12 },
  grove: { tones: [['teal', 0.1], ['teal', 0.7], ['teal', 1.7], ['teal', 2.6], ['gold', 2.0], ['violet', 1.8]], speed: 0.46, wave: 7, bend: 0.09 },
  cove: { tones: [['water', 0.2], ['water', 1.0], ['water', 2.0], ['water', 3.2], ['rose', 1.7], ['water', 1.6]], speed: 0.8, wave: 12, bend: 0.15 },
  heights: { tones: [['night', 2.1], ['night', 3.1], ['sky', 1.2], ['alpine', 2.7], ['violet', 3.0], ['sky', 1.9]], speed: 0.52, wave: 10, bend: 0.08 },
  forge: { tones: [['ash', 0.0], ['ash', 0.9], ['ember', 1.2], ['ember', 2.5], ['gold', 2.8], ['ash', 1.5]], speed: 0.58, wave: 5, bend: 0.08 },
  archives: { tones: [['night', 0.9], ['violet', 0.6], ['violet', 1.7], ['violet', 2.8], ['gold', 2.3], ['night', 3.6]], speed: 0.38, wave: 9, bend: 0.12 },
  spire: { tones: [['night', 0.4], ['night', 1.5], ['teal', 0.9], ['teal', 2.6], ['gold', 2.7], ['night', 3.5]], speed: 0.47, wave: 11, bend: 0.12 },
  static: { tones: [['night', 0.4], ['violet', 0.8], ['violet', 1.6], ['violet', 3.0], ['teal', 2.7], ['night', 3.2]], speed: 0.95, wave: 13, bend: 0.19 },
  final: { tones: [['night', 0.1], ['night', 1.2], ['teal', 1.1], ['teal', 3.0], ['gold', 3.4], ['violet', 2.6]], speed: 0.56, wave: 14, bend: 0.17 },
};
const fields = new Map();
const frames = new Map();

function diamond(p, x, y, r, color) {
  p.line(x, y - r, x + r, y, color).line(x + r, y, x, y + r, color)
    .line(x, y + r, x - r, y, color).line(x - r, y, x, y - r, color);
}

function bit(p, x, y, one, color) {
  if (one) p.line(x + 1, y, x + 1, y + 4, color).line(x, y + 4, x + 2, y + 4, color);
  else p.rect(x, y, 3, 5, color).rect(x + 1, y + 1, 1, 3, 0);
}

function paintPatterns(id) {
  const base = new Pix(SIZE, SIZE);
  const detail = new Pix(SIZE, SIZE);
  // Broad, intentional colour clusters rather than single-pixel noise.
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let band;
      if (id === 'meadow') band = (x + y + Math.round(8 * Math.sin((x - y) * Math.PI / 64))) & 31;
      else if (id === 'grove') band = (x + y) & 31;
      else if (id === 'cove') band = (y + Math.round(9 * Math.sin(x * Math.PI / 32))) & 31;
      else if (id === 'heights') band = (x - y + 128) & 31;
      else if (id === 'forge') band = (y + Math.abs((x & 31) - 16)) & 31;
      else if (id === 'archives') band = (x + (y >> 4) * 8) & 31;
      else if (id === 'spire') band = (y + Math.round(12 * Math.cos(x * Math.PI / 64))) & 31;
      else if (id === 'static') band = (((x >> 3) + (y >> 3)) & 7) * 4;
      else band = (x + y + Math.round(8 * Math.sin((x - y) * Math.PI / 64))) & 31;
      base.set(x, y, band < 13 ? 0 : band < 26 ? 1 : 2);
    }
  }
  if (id === 'meadow') {
    // Four equally spaced levels and a travelling staircase, never a plant silhouette.
    for (let y = -32; y < SIZE + 32; y += 32) for (let x = -32; x < SIZE + 32; x += 32) {
      const xx = x + ((y & 32) ? 16 : 0);
      for (let level = 0; level < 4; level++) {
        const yy = y + 5 + level * 6;
        detail.line(xx + 2, yy, xx + 24, yy, 2);
        detail.rect(xx + 2, yy - 1, 2, 3, 3);
        const sample = xx + 7 + ((level + (x >> 5)) & 3) * 4;
        detail.rect(sample, yy - 1, 3, 3, level === 1 ? 4 : 3);
      }
      detail.line(xx + 28, y + 5, xx + 28, y + 12, 3)
        .line(xx + 28, y + 12, xx + 31, y + 12, 3)
        .line(xx + 31, y + 12, xx + 31, y + 19, 3);
    }
  } else if (id === 'grove') {
    for (let y = -32; y < SIZE + 32; y += 32) for (let x = -32; x < SIZE + 32; x += 32) {
      const xx = x + ((y & 32) ? 16 : 0);
      diamond(detail, xx, y, 14, 2);
      detail.poly([[xx, y - 9], [xx + 5, y], [xx, y + 10], [xx - 5, y]], 3);
      detail.line(xx, y - 7, xx, y + 7, 5).line(xx - 3, y - 1, xx, y - 7, 4);
      detail.rect(xx + 13, y + 15, 3, 3, 4);
    }
  } else if (id === 'cove') {
    for (let y = -32; y < SIZE + 32; y += 32) {
      for (let x = 0; x < SIZE; x++) {
        const wave = Math.round(9 * Math.sin(x * Math.PI / 32));
        detail.set(x, y + wave, 3);
        if ((x & 7) === 0) detail.rect(x - 1, y + Math.round(wave / 4) * 4 + 7, 3, 3, 4);
        if ((x & 15) < 8) detail.set(x, y + wave + 14, 2);
      }
    }
  } else if (id === 'heights') {
    for (let y = -32; y < SIZE + 32; y += 32) for (let x = 0; x < SIZE; x++) {
      const thread = Math.round(7 * Math.sin(x * Math.PI / 32));
      detail.set(x, y + thread, 3);
      detail.set(x, y - thread + 9, 5);
      detail.set(x, y + thread + 17, 2);
      if ((x & 31) === 16) diamond(detail, x, y + 9, 3, 4);
    }
  } else if (id === 'forge') {
    for (let y = -16; y < SIZE; y += 32) for (let x = -16; x < SIZE; x += 32) {
      detail.line(x, y, x + 32, y, 2).line(x, y, x, y + 32, 2);
      detail.line(x + 2, y + 2, x + 29, y + 2, 5);
      diamond(detail, x + 16, y + 16, 9, 2);
      detail.poly([[x + 16, y + 8], [x + 21, y + 17], [x + 16, y + 23], [x + 12, y + 17]], 3);
      detail.rect(x + 15, y + 14, 2, 5, 4);
      for (let i = 0; i < 3; i++) detail.rect(x + 5 + i * 3, y + 27, 2, 2, 3);
    }
  } else if (id === 'archives') {
    for (let y = -8; y < SIZE; y += 32) for (let x = -16; x < SIZE; x += 32) {
      const xx = x + ((y & 32) ? 16 : 0);
      // Rune-pages: a margin, a tall outlier, and three small level glyphs.
      detail.line(xx + 4, y + 5, xx + 4, y + 24, 2).line(xx + 4, y + 24, xx + 24, y + 24, 2);
      detail.line(xx + 10, y + 7, xx + 10, y + 20, 3).line(xx + 8, y + 7, xx + 14, y + 7, 4);
      detail.line(xx + 10, y + 14, xx + 18, y + 14, 3).line(xx + 18, y + 14, xx + 18, y + 20, 3);
      detail.rect(xx + 21, y + 8, 3, 2, 5).rect(xx + 21, y + 12, 3, 2, 5).rect(xx + 21, y + 18, 3, 2, 3);
    }
  } else if (id === 'final') {
    for (let y = -32; y < SIZE + 32; y += 64) for (let x = -32; x < SIZE + 32; x += 64) {
      detail.circle(x, y, 25, (xx, yy, nx, ny) => nx * nx + ny * ny > 0.91 ? 2 : null);
      diamond(detail, x, y, 17, 5);
      detail.line(x - 6, y, x + 6, y, 4).line(x, y - 6, x, y + 6, 4);
      detail.rect(x - 1, y - 1, 3, 3, 3);
      for (let k = -2; k <= 2; k++) {
        detail.rect(x + k * 4 - 1, y - 25, 2, 3, 4);
        detail.rect(x - 25, y + k * 4 - 1, 3, 2, 3);
      }
      diamond(detail, x + 32, y + 32, 6, 4);
      detail.rect(x + 31, y + 31, 3, 3, 5);
    }
  } else if (id === 'spire') {
    for (let y = -32; y < SIZE + 32; y += 32) for (let x = -32; x < SIZE + 32; x += 32) {
      const xx = x + ((y & 32) ? 16 : 0);
      diamond(detail, xx, y, 16, 2);
      detail.line(xx - 12, y, xx, y + 11, 3).line(xx, y + 11, xx + 12, y, 3);
      diamond(detail, xx, y - 2, 4, 4);
      detail.rect(xx - 1, y - 3, 2, 2, 5);
    }
  } else {
    for (let y = 0; y < SIZE; y += 16) for (let x = 0; x < SIZE; x += 16) {
      const code = ((x >> 4) ^ (y >> 4)) & 3;
      bit(detail, x + 3, y + 4, code & 1, 3);
      bit(detail, x + 9, y + 4, code & 2, code === 3 ? 4 : 2);
      if (code === 0) detail.line(x, y + 12, x + 11, y + 12, 5);
      if (code === 2) detail.rect(x + 8, y + 13, 6, 2, 2);
    }
  }
  return { base: new Uint8Array(base.data), detail: new Uint8Array(detail.data) };
}

// Cache the equivalent of a palette-coloured stage wash, rather than alpha-blending
// another full-screen surface every frame. Both colours originate in PAL ramps.
function washWord(base, tint, amount) {
  const r = Math.round((base & 255) + ((tint & 255) - (base & 255)) * amount);
  const g = Math.round(((base >>> 8) & 255) + (((tint >>> 8) & 255) - ((base >>> 8) & 255)) * amount);
  const b = Math.round(((base >>> 16) & 255) + (((tint >>> 16) & 255) - ((base >>> 16) & 255)) * amount);
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

function getField(id) {
  let field = fields.get(id);
  if (field) return field;
  const theme = THEMES[id];
  const palettes = [];
  for (let phase = 0; phase < PHASES; phase++) {
    const palette = new Uint32Array(CALM_BANK * CALM_STEPS);
    for (let shade = 0; shade < SHADE_STEPS; shade++) for (let i = 0; i < theme.tones.length; i++) {
      const [name, level] = theme.tones[i];
      const ramp = PAL[name];
      const cycle = Math.sin(phase * Math.PI * 2 / PHASES + i * 1.35) * (i > 1 ? 0.3 : 0.08);
      const v = clamp(level + cycle - shade * 0.22, 0, ramp.length - 1);
      const low = Math.floor(v);
      const base = u32(mix(ramp[low], ramp[Math.min(ramp.length - 1, low + 1)], v - low));
      // A dim blue-grey neutral keeps purple corruption distinct; retain 12% of
      // the tapestry at full calm so the stage never becomes a flat cut-out.
      const quiet = clamp(0.65 + i * 0.012 + cycle * 0.025 - shade * 0.065, 0, 2);
      const quietLow = Math.floor(quiet);
      const tint = u32(mix(PAL.dusk[quietLow], PAL.dusk[quietLow + 1], quiet - quietLow));
      for (let calm = 0; calm < CALM_STEPS; calm++) {
        palette[calm * CALM_BANK + shade * 8 + i] = washWord(base, tint, calm / (CALM_STEPS - 1) * 0.88);
      }
    }
    palettes.push(palette);
  }
  field = { ...paintPatterns(id), palettes, theme };
  fields.set(id, field);
  return field;
}

function getFrame(w, h, stage) {
  const key = `${w}:${h}:${stage ? `${stage.x}:${stage.y}:${stage.w}:${stage.h}` : 'auto'}`;
  let frame = frames.get(key);
  if (frame) return frame;
  const { canvas, ctx } = makeCanvas(w, h);
  const image = ctx.createImageData(w, h);
  const shade = new Uint16Array(w * h);
  const portrait = h > w;
  const cx = stage ? stage.x + stage.w / 2 : w * (portrait ? 0.5 : 0.73);
  const cy = stage ? stage.y + stage.h / 2 : portrait ? Math.min(118, h * 0.3) : h * 0.46;
  const rx = stage ? Math.max(70, stage.w * 0.72 + 22) : w * (portrait ? 0.5 : 0.34);
  const ry = stage ? Math.max(62, stage.h * 0.72 + 18) : portrait ? 94 : h * 0.48;
  const edges = new Float32Array(w);
  for (let x = 0; x < w; x++) edges[x] = (Math.abs(x / w - 0.5) * 2) ** 3 * 2;
  for (let y = 0; y < h; y++) {
    const bottom = clamp((y / h - 0.42) / 0.58);
    const top = clamp((0.15 - y / h) / 0.15);
    const vertical = bottom ** 1.6 * 5.8 + top * 1.3;
    const dy = (y - cy) / ry;
    for (let x = 0; x < w; x++) {
      const threshold = bayer(x, y);
      const dx = (x - cx) / rx;
      const falloff = clamp((1 - dx * dx - dy * dy) / 0.65);
      const calm = falloff * falloff * (3 - 2 * falloff);
      // Dither only between adjacent wash strengths, never between the original
      // pattern and an opaque patch. Geometry is cached; the hot loop is unchanged.
      const bank = Math.min(CALM_STEPS - 1, Math.floor(calm * (CALM_STEPS - 1) + threshold)) * CALM_BANK;
      shade[y * w + x] = bank + Math.min(7, Math.floor(edges[x] + vertical + threshold)) * 8;
    }
  }
  frame = { canvas, ctx, image, words: new Uint32Array(image.data.buffer), shade };
  // Only sizes, not times, are retained. A resize cannot grow this cache indefinitely.
  if (frames.size === 8) frames.delete(frames.keys().next().value);
  frames.set(key, frame);
  return frame;
}

const stages = new Map();

function masonry(p, ramp, tier) {
  const tones = [PAL.night[0], mix(PAL.stone[1], ramp[0], 0.45), mix(PAL.stone[2], ramp[1], 0.45), mix(PAL.stone[3], ramp[2], 0.35)];
  p.rect(0, 0, p.w, p.h, (x, y) => {
    const distance = Math.max(Math.abs(x-p.w*.5)/(p.w*.52),Math.abs(y-p.h*.38)/(p.h*.67));
    if(distance < .19) return PAL.night[0];
    const course = Math.floor(y / 22);
    const bx = (x + (course & 1) * 24) % 48;
    const by = y % 22;
    if (bx < 2 || by < 2) return tones[0];
    const light = Math.max(0, 1 - y / p.h) * (1 - tier * 0.08);
    if (by < 4 || bx < 4) return tones[light > 0.35 && distance > .5 ? 3 : 2];
    if (by > 18 || bx > 43) return tones[1];
    // Broad facets and a few chips, not per-pixel noise.
    return distance < .48 || (bx > 27 && by > 11) || (bx < 13 && by > 15) ? tones[1] : tones[2];
  });
}

function staticLayer(w, h, ramp, quiet) {
  const p = new Pix(w + 32, h + 32);
  const qx = quiet ? quiet.x + quiet.w / 2 : w * 0.52;
  const qy = quiet ? quiet.y + quiet.h / 2 : h * 0.38;
  for (let y = 8; y < h + 32; y += 24) for (let x = 6; x < w + 32; x += 32) {
    const calm = Math.abs(x - qx) < (quiet ? quiet.w * .65 : w * .25) && Math.abs(y-qy) < (quiet ? quiet.h*.65 : h*.28);
    if (calm) continue;
    bit(p, x, y, ((x >> 5) ^ (y >> 3)) & 1, ramp[3]);
    p.line(x+8,y+3,x+24,y+3,ramp[1]).line(x+16,y-4,x+16,y+11,ramp[1]);
  }
  return p.toCanvas();
}

function warmShaftLight(p, tier) {
  const cx = Math.floor(p.w * 0.34);
  // Lantern light is a material wash, not a screen-wide flashing overlay.
  const glow = new Pix(p.w, p.h);
  glow.rect(0, 0, p.w, Math.floor(p.h * 0.64), (x,y) => {
    const spread = 12 + y * 0.65;
    const fall = Math.max(0, 1 - Math.abs(x-cx) / spread) * Math.max(0, 1-y/(p.h*.65)) / (1+tier*.35);
    return bayer(x,y) < fall * 0.35 ? PAL.gold[2] : null;
  });
  // The cached wash composites once, so warm light does not eat frame time.
  const target = p.toCanvas();
  const ctx = target.getContext('2d');
  ctx.globalAlpha = 0.18;
  ctx.drawImage(glow.toCanvas(),0,0);
  ctx.globalAlpha = 1;
  const lantern = new Pix(15,25);
  lantern.rect(7,0,1,9,PAL.stone[3]).rect(3,8,9,14,PAL.gold[0]);
  lantern.rect(4,10,7,10,PAL.gold[4]).rect(5,11,3,7,PAL.gold[6]);
  lantern.rect(2,8,11,2,PAL.stone[4]).rect(2,21,11,2,PAL.stone[2]);
  lantern.rect(7,10,1,10,PAL.gold[1]);
  ctx.drawImage(lantern.toCanvas(),cx-7,0);
  return target;
}

function calmStage(canvas, id, quiet) {
  const w = canvas.width;
  const h = canvas.height;
  const cx = quiet ? quiet.x + quiet.w/2 : w * .5;
  const cy = quiet ? quiet.y + quiet.h/2 : h * .4;
  const rx = quiet ? Math.max(30,quiet.w*.7) : w * .31;
  const ry = quiet ? Math.max(30,quiet.h*.7) : h * .30;
  const ctx = canvas.getContext('2d');
  const image = ctx.getImageData(0,0,w,h);
  const words = new Uint32Array(image.data.buffer);
  const tint = u32(id === 'duel' ? PAL.wood[0] : PAL.night[0]);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const amount = clamp(1-((x-cx)/rx)**2-((y-cy)/ry)**2);
    if(amount>0) words[y*w+x]=washWord(words[y*w+x],tint,amount*amount*.66);
  }
  ctx.putImageData(image,0,0);
  return canvas;
}

function stageCanvas(w, h, id, depth, quiet) {
  const tier = clamp(Math.floor((depth - 1) / 5), 0, 6);
  const key = `${id}:${w}:${h}:${tier}:${quiet ? `${quiet.x}:${quiet.y}:${quiet.w}:${quiet.h}` : 'auto'}`;
  if (stages.has(key)) return stages.get(key);
  const p = new Pix(w, h);
  const cx = w >> 1;
  const cy = Math.floor(h * 0.38);
  const ramp = tier < 2 ? PAL.teal : tier < 4 ? PAL.violet : PAL.water;
  p.rect(0, 0, w, h, PAL.night[0]);
  if (id === 'duel') {
    const horizon = Math.floor(h * 0.52);
    p.rect(0, 0, w, h, PAL.wood[0]);
    // Shaded panelled walls with long, clustered grain and a faint paper grid.
    for (let x = 0; x < w; x += 26) {
      p.rect(x,0,2,horizon+6,PAL.wood[1]).rect(x+2,0,1,horizon+6,PAL.wood[2]);
      for (let y = 9; y < horizon; y += 17) p.line(x+9,y,x+15,y+4,PAL.wood[1]);
    }
    p.rect(16,0,w-32,13,(x,y)=>bayer(x,y)<(1-y/14)*.24?PAL.wood[2]:null);
    p.rect(14, 14, w - 28, horizon, PAL.water[1]);
    p.rect(17, 17, w - 34, horizon - 6, PAL.sky[1]);
    p.rect(17, Math.floor(horizon * 0.60), w - 34, Math.floor(horizon * 0.40), PAL.water[2]);
    p.rect(17,17,w-34,Math.floor(horizon*.6)-17,(x,y)=>bayer(x,y)<Math.max(0,1-y/horizon)*.45?PAL.sky[2]:null);
    for (let y = Math.floor(horizon * 0.60) + 7; y < horizon; y += 12)
      for (let x = 20; x < w - 20; x += 34) p.rect(x + (y & 8), y, 18, 1, PAL.water[3]);
    p.poly([[w-78, Math.floor(horizon*0.60)],[w-59,Math.floor(horizon*0.60)-10],[w-34,Math.floor(horizon*0.60)]],PAL.teal[1]);
    p.line(w-78,Math.floor(horizon*0.60),w-33,Math.floor(horizon*0.60),PAL.water[4]);
    p.line(16,14,w-17,14,PAL.wood[4]).line(14,16,14,horizon,PAL.wood[3]);
    p.poly([[17,17],[29,17],[24,horizon-9],[17,horizon-3]],PAL.roofBlue[1]);
    p.poly([[w-29,17],[w-17,17],[w-17,horizon-3],[w-24,horizon-9]],PAL.roofBlue[1]);
    p.line(21,20,19,horizon-13,PAL.roofBlue[3]);
    p.rect(cx - 3, 14, 6, horizon, PAL.wood[2]);
    p.rect(14, Math.floor(horizon * 0.60) - 3, w - 28, 6, PAL.wood[2]);
    p.rect(8, horizon + 6, w - 16, h - horizon, PAL.wood[1]);
    for (let y = horizon + 18; y < h; y += 18) p.line(8, y, w - 8, y, PAL.wood[0]);
    for (let y = horizon + 9; y < h; y += 18) for (let x = 12; x < w - 14; x += 38) {
      p.line(x,y+4,x+23,y+4,PAL.wood[2]).line(x+4,y+7,x+31,y+7,PAL.wood[0]);
      if ((x+y)%3===0) p.ellipse(x+26,y+10,4,1,PAL.wood[0]);
    }
    // Window quadrants throw a warm, dithered trapezoid over the desk.
    const deskLight = mix(PAL.wood[1],PAL.wood[3],.24);
    p.rect(9,horizon+7,w-18,h-horizon-7,(x,y)=>{
      const u=(y-horizon)/Math.max(1,h-horizon);
      const left=20+u*24;
      const right=w-20-u*12;
      if(x<left||x>right||Math.abs(x-cx)<4+u*4) return null;
      const shade=Math.max(0,.38-u*.32);
      return bayer(x,y)<shade?deskLight:null;
    });
    p.rect(24,horizon-28,34,22,PAL.sand[2]).rect(26,horizon-26,30,18,PAL.sand[3]);
    for(let x=30;x<54;x+=8)p.line(x,horizon-25,x,horizon-10,PAL.sand[2]);
    p.line(28,horizon-20,53,horizon-20,PAL.sand[2]);
    p.line(31,horizon-13,41,horizon-22,PAL.teal[1]).line(41,horizon-22,49,horizon-14,PAL.teal[1]);
    p.rect(25,horizon-27,2,2,PAL.gold[5]).rect(54,horizon-27,2,2,PAL.gold[5]);
    // A nautical chart pinned beside the clear battle stage, with a compass and grid.
    const chartW = Math.max(50, Math.floor(w * 0.25));
    p.rect(22, horizon + 17, chartW, Math.max(33, h - horizon - 40), PAL.sand[2]);
    p.rect(25, horizon + 20, chartW - 6, Math.max(27, h - horizon - 46), PAL.sand[3]);
    for (let x = 31; x < 20 + chartW; x += 12) p.line(x, horizon + 22, x, h - 24, PAL.sand[2]);
    for (let y = horizon + 26; y < h - 22; y += 12) p.line(27, y, chartW + 18, y, PAL.sand[2]);
    diamond(p, 41, horizon + 38, 10, PAL.gold[5]);
    p.line(41, horizon + 25, 41, horizon + 51, PAL.cream[1]);
    p.line(chartW-5,horizon+29,chartW+10,horizon+38,PAL.teal[1]);
    p.line(chartW+10,horizon+38,chartW-1,horizon+50,PAL.teal[1]);
    p.rect(chartW-6,horizon+28,3,3,PAL.gold[5]).rect(chartW-2,horizon+49,3,3,PAL.gold[5]);
    p.rect(24,horizon+18,2,2,PAL.cream[2]).rect(chartW+17,horizon+18,2,2,PAL.cream[2]);
    for (let i = 0; i < 3; i++) p.rect(w - 49 + i * 7, horizon + 23 + i * 4, 6, 35 - i * 4, PAL.sand[2 + (i & 1)]);
    // The pack lives on the edge of the stage, never underneath the creature.
    const px = w - 42;
    const py = Math.min(h-12, horizon + 59);
    p.ellipse(px,py+1,25,5,PAL.shadow);
    p.poly([[px-18,py],[px-20,py-26],[px-13,py-40],[px+12,py-43],[px+22,py-24],[px+19,py]],PAL.wood[0]);
    p.poly([[px-15,py-2],[px-16,py-26],[px-10,py-36],[px+11,py-37],[px+17,py-23],[px+15,py-2]],PAL.teal[1]);
    p.poly([[px-16,py-26],[px-10,py-36],[px+11,py-37],[px+15,py-28],[px-5,py-21]],PAL.teal[2]);
    p.rect(px-8,py-35,4,29,PAL.wood[3]).rect(px+8,py-35,3,29,PAL.wood[2]);
    p.rect(px-5,py-24,10,8,PAL.gold[2]).rect(px-3,py-22,6,4,PAL.gold[4]);
    for(let i=0;i<4;i++){
      const xx=px-15+i*8;
      const yy=py-45-(i&1)*6;
      p.rect(xx,yy,7,20,PAL.sand[2]).rect(xx+1,yy+1,3,18,PAL.sand[4]);
      p.ellipse(xx+3,yy,3,2,PAL.sand[5]).ellipse(xx+3,yy,1,1,PAL.wood[1]);
      bit(p,xx+1,yy+8,i&1,PAL.wood[2]);
    }
  } else {
    masonry(p, ramp, tier);
    // Concentric masonry frames and rails converge toward a dark vanishing point.
    for (let i = 0; i < 7; i++) {
      const k = (7 - i) / 7;
      const rw = Math.floor(w * 0.48 * k * k) + 6;
      const rh = Math.floor(h * 0.64 * k * k) + 5;
      const rim = Math.max(3, 9 - i);
      p.rect(cx+rw-rim,cy-rh,rim,rh*2,ramp[0]);
      p.rect(cx-rw,cy+rh-rim,rw*2,rim,ramp[0]);
      p.rect(cx-rw+1,cy-rh+1,rw*2-2,rim-1,ramp[2]);
      p.rect(cx-rw+1,cy-rh+rim,rim-1,rh*2-rim-1,ramp[1]);
      p.line(cx-rw+1, cy-rh+1, cx+rw-2, cy-rh+1, mix(PAL.stone[3],ramp[3],.55));
      if (i < 4) {
        for (let x = cx-rw+12; x < cx+rw-10; x += 24) {
          p.rect(x, cy+rh-2, 4, 2, ramp[3]);
          p.rect(x, cy-rh+2, 1, 2, PAL.night[0]);
        }
        for (let y = cy-rh+12; y < cy+rh-6; y += 20) {
          p.rect(cx-rw+1,y,2,1,PAL.night[0]).rect(cx+rw-3,y+8,2,1,PAL.night[0]);
          if (i < 2 && (y & 16)) p.rect(cx-rw+4,y-3,3,6,PAL.gold[1]).rect(cx-rw+5,y-2,1,3,PAL.gold[4]);
        }
      }
    }
    p.line(3, 0, cx-7, cy-5, ramp[2]).line(w-4, 0, cx+7, cy-5, ramp[1]);
    p.line(0, h-1, cx-7, cy+5, ramp[2]).line(w-1, h-1, cx+7, cy+5, ramp[1]);
    if (id === 'warden') {
      // Tall columns, a broken crown and a restrained red-gold warding seal.
      for (const x of [Math.floor(w * 0.12), Math.floor(w * 0.88)]) {
        p.rect(x-8, 18, 17, h-25, PAL.violet[1]).rect(x-6, 18, 4, h-25, PAL.violet[3]);
        p.rect(x-11, 18, 23, 5, PAL.gold[2]).rect(x-11, h-23, 23, 5, PAL.gold[2]);
      }
      diamond(p, cx, cy, Math.floor(Math.min(w, h)*0.28), PAL.gold[2]);
      diamond(p, cx, cy, Math.floor(Math.min(w, h)*0.23), PAL.violet[2]);
      p.poly([[cx-24,20],[cx-20,34],[cx+20,34],[cx+24,20],[cx+10,27],[cx,15],[cx-10,27]], PAL.gold[3]);
      p.line(cx-21,21,cx-18,30,PAL.gold[5]);
    }
  }
  const canvas = calmStage(id === 'duel' ? p.toCanvas() : warmShaftLight(p,tier),id,quiet);
  const result = { canvas, signal: id === 'duel' ? null : staticLayer(w,h,ramp,quiet) };
  if (stages.size >= 16) stages.delete(stages.keys().next().value);
  stages.set(key, result);
  return result;
}

function drawStage(ctx, screen, id, t, depth, reduced, quiet) {
  const stage = stageCanvas(screen.w, screen.h, id, depth, quiet);
  ctx.drawImage(stage.canvas, 0, 0);
  const w = screen.w;
  const h = screen.h;
  const clock = reduced ? 0 : t;
  if (stage.signal) {
    ctx.save();
    ctx.globalAlpha = id === 'warden' ? 0.13 : 0.22;
    const drift = Math.floor(clock * 2) % 24;
    for(let y=0;y<h;y+=8){
      const sway = reduced ? 0 : Math.round(Math.sin(y*.035+clock*.4)*4);
      ctx.drawImage(stage.signal,16+sway,y+drift,w,Math.min(8,h-y),0,y,w,Math.min(8,h-y));
    }
    ctx.restore();
  }
  if(id === 'duel'){
    // The open sea shimmers through the window, not across its timber frame.
    const horizon = Math.floor(h*.52);
    ctx.fillStyle=PAL.water[4];
    for(let row=0;row<4;row++){
      const y=Math.floor(horizon*.67)+row*7;
      const drift=Math.floor(clock*4+row*11);
      for(let x=24;x<w-27;x+=53){
        const xx=24+(x+drift)%Math.max(1,w-60);
        if(Math.abs(xx-w/2)>15)ctx.fillRect(xx,y,10,1);
      }
    }
    const phase = reduced ? 0.4 : (clock%17)/17;
    if(phase>.12&&phase<.72){
      const gx=Math.round(25+phase*(w-65));
      const gy=Math.round(horizon*.32);
      ctx.fillStyle=PAL.sky[0];
      ctx.fillRect(gx-5,gy-1,4,1);ctx.fillRect(gx-2,gy,5,1);ctx.fillRect(gx+3,gy-1,4,1);
    }
  }
  // Twelve purposeful glints, not a noisy full-screen overlay.
  for (let i = 0; i < 12; i++) {
    const x = Math.round((i * 53 + 23) % w);
    const y = Math.round((i * 29 + clock * (id === 'duel' ? 3 : 12)) % h);
    ctx.fillStyle = id === 'duel' ? PAL.water[4] : id === 'warden' ? PAL.gold[3] : depth < 11 ? PAL.teal[3] : depth < 21 ? PAL.violet[3] : PAL.water[3];
    if (id === 'duel') {
      const xx = 20 + x % Math.max(1,w-48);
      const yy = 20 + y % Math.max(1,Math.floor(h * .48)-25);
      if(Math.abs(xx-w/2)>14)ctx.fillRect(xx,yy,8,1);
    }
    else if (!quiet || x < quiet.x || x > quiet.x+quiet.w || y < quiet.y || y > quiet.y+quiet.h) ctx.fillRect(x, y, 2, 3);
  }
}

/** Fills the canvas. stage places a calm tapestry zone; depth tints Well masonry by capped five-floor tiers. */
export function drawBattleBackground(ctx, screen, id, t, { intensity = 1, reduced = false, stage = null, depth = 1 } = {}) {
  if (id === 'well' || id === 'warden' || id === 'duel') {
    drawStage(ctx, screen, id, t, depth, reduced, stage);
    return;
  }
  id = THEMES[id] ? id : 'static';
  const w = screen.w | 0;
  const h = screen.h | 0;
  const { base, detail, palettes, theme } = getField(id);
  const frame = getFrame(w, h, stage);
  const time = t * (reduced ? 0.17 : theme.speed);
  const palette = palettes[((Math.floor(time * 3) % PHASES) + PHASES) % PHASES];
  const amount = reduced ? 0 : clamp(intensity, 0, 3);
  const compression = 1 + Math.sin(time * 0.7) * theme.bend * amount;
  const driftX = Math.floor(time * 3);
  const driftY = Math.floor(time * 4);
  const secondDrift = Math.floor(time * -2);
  const { words, shade } = frame;
  const rowWidth = Math.min(w, SIZE);
  for (let y = 0; y < h; y++) {
    const wave = Math.sin(y * 0.034 + time * 1.7) * theme.wave + Math.sin(y * 0.091 - time) * 2;
    const interlace = (y & 1 ? 1 : -1) * Math.min(1, amount * 0.5);
    const dx = Math.round(wave * amount + interlace) + driftX;
    const sy = ((Math.floor(y * compression) + driftY) & MASK) * SIZE;
    const mx = Math.round(Math.sin(y * 0.023 - time) * theme.wave * amount * 0.6) + secondDrift;
    const my = ((Math.floor(y * (2 - compression)) - driftY) & MASK) * SIZE;
    const row = y * w;
    // The tapestry repeats every 128px: sample its two layers once per repeat,
    // then apply the screen-space vignette. A 384px row avoids 2/3 of the sampling.
    for (let x = 0; x < rowWidth; x++) {
      const motif = detail[my + ((x + mx) & MASK)];
      const index = motif || base[sy + ((x + dx) & MASK)];
      for (let xx = x; xx < w; xx += SIZE) {
        const pixel = row + xx;
        words[pixel] = palette[shade[pixel] + index];
      }
    }
  }
  frame.ctx.putImageData(frame.image, 0, 0);
  ctx.drawImage(frame.canvas, 0, 0);
}

function sample(ctx, x, y, w, h, id, t, label, opts) {
  ctx.fillStyle = PAL.night[5];
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.save();
  ctx.translate(x, y);
  drawBattleBackground(ctx, { w, h }, id, t, opts);
  ctx.restore();
  drawText(ctx, label, x + 5, y + h - 12, { font: 'small', color: PAL.ui.dim, shadow: PAL.ink });
}

export const galleries = {
  backgrounds(ctx, screen, t, page = 0) {
    const variant = ((page % 18) + 18) % 18;
    const index = variant < 12 ? variant : 9;
    const id = BACKGROUND_IDS[index];
    const depth = variant === 12 || variant === 15 ? 11 : variant === 13 || variant === 16 ? 21 : variant === 14 || variant === 17 ? 31 : 1;
    const reduced = variant >= 15;
    const opts = { depth, reduced };
    ctx.fillStyle = PAL.night[0];
    ctx.fillRect(0, 0, screen.w, screen.h);
    drawText(ctx, `${String(index + 1).padStart(2, '0')}  ${TITLES[index]}`, 10, 7, { color: PAL.ui.text });
    drawText(ctx, index < 9 ? 'PALETTE + TWO SCANLINE TAPESTRIES' : `${id === 'duel' ? 'SEA WIND + CARTOGRAPHY' : `DEPTH B${depth} + STATIC MASONRY`}${reduced ? ' · STILL' : ''}`, 10, 20, { font: 'small', color: PAL.ui.faint });
    if (screen.w > screen.h) {
      sample(ctx, 10, 44, 238, 134, id, t, 'LANDSCAPE', opts);
      sample(ctx, 268, 31, 102, 170, id, t, 'PORTRAIT', opts);
      drawText(ctx, id, 10, 186, { color: PAL.ui.gold });
    } else {
      sample(ctx, 8, 37, 200, 113, id, t, 'LANDSCAPE', opts);
      const h = Math.min(216, screen.h - 181);
      const w = Math.round(h * 0.6);
      sample(ctx, Math.floor((screen.w - w) / 2), 165, w, h, id, t, 'PORTRAIT', opts);
    }
  },
};
