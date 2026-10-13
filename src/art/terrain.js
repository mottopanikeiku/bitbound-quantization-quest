// Terrain painter. API fixed by the v2 contract; art owned by WorldArt (stub below).
import { PAL } from './palette.js';

export const TERRAIN_TYPES = ['void', 'deep', 'water', 'sand', 'grass', 'tallgrass', 'flowers', 'path', 'stone', 'cliff', 'bridge', 'ash', 'lava', 'ruin', 'crystal', 'snow', 'plank'];

const FLAT = {
  void: PAL.night[0], deep: PAL.water[2], water: PAL.water[5], sand: PAL.sand[5], grass: PAL.grass[4],
  tallgrass: PAL.grass[3], flowers: PAL.grass[5], path: PAL.dirt[4], stone: PAL.stone[5], cliff: PAL.stone[3],
  bridge: PAL.wood[4], ash: PAL.ash[4], lava: PAL.ember[5], ruin: PAL.stone[4], crystal: PAL.teal[5], snow: PAL.snow[4], plank: PAL.wood[5],
};

export function isWalkable(type) {
  return !['void', 'deep', 'water', 'cliff', 'lava'].includes(type);
}

/** map.get(tx, ty) → terrain type; map.biome(tx, ty) → biome key. */
export function paintTerrainChunk(ctx, map, tx0, ty0, tw, th, ox = 0, oy = 0) {
  for (let ty = ty0; ty < ty0 + th; ty++) {
    for (let tx = tx0; tx < tx0 + tw; tx++) {
      ctx.fillStyle = FLAT[map.get(tx, ty)] ?? FLAT.void;
      ctx.fillRect(ox + (tx - tx0) * 16, oy + (ty - ty0) * 16, 16, 16);
    }
  }
}

export function drawTerrainAnimated(ctx, map, camX, camY, viewW, viewH, t) {}

export const galleries = {
  terrain(ctx, screen) {
    let x = 4;
    for (const type of TERRAIN_TYPES) {
      ctx.fillStyle = FLAT[type];
      ctx.fillRect(x, 20, 16, 16);
      x += 20;
    }
  },
};
