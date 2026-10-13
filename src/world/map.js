// Island map data. Owned by World (stub below: a small walled field).
export const TILE = 16;
export const MAP_W = 48;
export const MAP_H = 27;

export const MAP = {
  width: MAP_W,
  height: MAP_H,
  get(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return 'void';
    if (tx < 2 || ty < 2 || tx >= MAP_W - 2 || ty >= MAP_H - 2) return 'water';
    if (ty === 13) return 'path';
    return 'grass';
  },
  biome() {
    return 'meadow';
  },
  zoneAt() {
    return 0;
  },
};
