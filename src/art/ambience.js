// Biome ambience particles. API fixed by the v2 contract; art owned by WorldArt (stub below).

export function createAmbience(biome, { reduced = false } = {}) {
  return {
    biome,
    update(dt, camX, camY, viewW, viewH) {},
    draw(ctx, camX, camY, t) {},
  };
}

export const galleries = {
  ambience(ctx, screen, t) {},
};
