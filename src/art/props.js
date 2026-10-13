// World props. API fixed by the v2 contract; art owned by WorldArt (stub below).
import { PAL } from './palette.js';

const box = (w, h, solid = true) => ({ w, h, ax: Math.floor(w / 2), ay: h - 2, solid: solid ? [-Math.floor(w / 4), -4, Math.ceil(w / 2), 5] : null });

/** PROPS[kind] = { w, h, ax, ay, solid: [x, y, w, h] relative to the anchor | null }. */
export const PROPS = {
  'tree-oak': box(32, 40), 'tree-pine': box(24, 40), 'tree-palm': box(28, 40), 'tree-willow': box(36, 40),
  'tree-dead': box(24, 32), 'tree-crystal': box(24, 36), bush: box(16, 14), 'rock-s': box(12, 10), 'rock-l': box(24, 20),
  stump: box(14, 10), mushroom: box(8, 8, false), reeds: box(12, 12, false), flowerbed: box(16, 10, false),
  'fence-h': box(16, 12), 'fence-v': box(6, 18), sign: box(14, 16), lamp: box(8, 24), lantern: box(10, 14),
  campfire: box(16, 14), tent: box(32, 26), 'house-a': box(48, 48), 'house-b': box(56, 52), 'house-c': box(40, 44),
  lighthouse: box(40, 88), well: box(20, 22), dock: box(32, 16, false), boat: box(32, 18), gridstone: box(20, 32),
  'shrine-0': box(48, 48), 'shrine-1': box(48, 48), 'shrine-2': box(48, 48), 'shrine-3': box(48, 48),
  'shrine-4': box(48, 48), 'shrine-5': box(48, 48), 'shrine-6': box(56, 64), gate: box(48, 32), cache: box(14, 12),
  shard: box(10, 12, false), pedestal: box(16, 20), 'stone-float': box(16, 12, false), bookshelf: box(24, 32),
  pillar: box(16, 36), anvil: box(20, 14), furnace: box(32, 36), 'crystal-cluster': box(20, 22), statue: box(20, 34), banner: box(12, 28),
};

/** (x, y) = the anchor point on screen. opts: { t, variant, biome, state }. */
export function drawProp(ctx, kind, x, y, opts = {}) {
  const def = PROPS[kind];
  if (!def) return;
  ctx.fillStyle = kind.startsWith('tree') ? PAL.leaf[4] : kind === 'gate' ? PAL.violet[5] : PAL.stone[5];
  ctx.fillRect(Math.round(x - def.ax), Math.round(y - def.ay), def.w, def.h);
}

export const galleries = {
  props(ctx, screen, t) {
    let x = 4;
    let y = 50;
    for (const kind of Object.keys(PROPS)) {
      drawProp(ctx, kind, x + PROPS[kind].ax, y, { t });
      x += PROPS[kind].w + 4;
      if (x > screen.w - 40) {
        x = 4;
        y += 60;
      }
    }
  },
};
