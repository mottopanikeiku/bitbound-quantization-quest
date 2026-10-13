// Deterministic world-coordinate weather: camera motion reveals an existing field,
// never a screen-space particle shower. Only nearby lattice cells are retained.
import { PAL, BIOME } from './palette.js';
import { spriteCache, bayer } from './paint.js';
import { hash2 } from '../engine/util.js';
import { drawText } from '../engine/font.js';
import { drawTerrainDemo } from './terrain.js';
import { drawProp } from './props.js';

const BIOMES = [...Object.keys(BIOME), 'static'];
const CELL = 96;
const mod = (n, d) => ((n % d) + d) % d;

function moteSprite(biome, kind, frame) {
  return spriteCache(`ambience:${biome}:${kind}:${frame}`, 16, 16, (p) => {
    if (biome === 'static') {
      const c = frame % 2 ? PAL.violet[6] : PAL.teal[6];
      p.rect(5, 7, 5 + frame, 1, c); p.rect(7, 8, 3, 1, PAL.violet[2]); p.set(4, 9, PAL.violet[4]);
    } else if (biome === 'grove') {
      p.ellipseDither(8, 8, 4, 4, PAL.gold[5], 0.18 + frame * 0.07);
      p.rect(7, 7, 2, 2, PAL.gold[frame === 2 ? 8 : 6]);
    } else if (biome === 'cove' && kind === 0) {
      // Paired angular wings read as a passing gull's shadow, not a bird sprite.
      p.line(2, 7 + frame % 2, 6, 5, PAL.shadow); p.line(6, 5, 8, 8, PAL.shadow);
      p.line(8, 8, 10, 5, PAL.shadow); p.line(10, 5, 14, 7 + frame % 2, PAL.shadow);
    } else if (biome === 'cove') {
      p.rect(6, 7, 3, 1, PAL.water[9]); p.set(10, 5, PAL.water[8]); p.set(5, 8, PAL.water[7]);
    } else if (biome === 'heights' && kind === 0) {
      p.line(3, 10, 12, 7, PAL.snow[2]); p.line(7, 10, 13, 8, PAL.snow[1]);
    } else if (biome === 'heights') {
      p.rect(7, 7, frame === 1 ? 2 : 1, 1, PAL.snow[4]); p.set(7, 8, PAL.snow[2]);
    } else if (biome === 'forge' && kind === 0) {
      p.ellipseDither(8, 8, 7, 5, PAL.ash[2], 0.3);
      p.ellipseDither(6, 6, 4, 3, PAL.ash[4], 0.18);
    } else if (biome === 'forge') {
      p.ellipseDither(8, 8, 3, 4, PAL.ember[4], 0.2);
      p.rect(8, 6, 1, 2, PAL.ember[frame === 1 ? 8 : 6]); p.set(8, 8, PAL.ember[4]);
    } else if (biome === 'archives' && kind === 0) {
      p.poly([[5, 4], [10, 5 + frame % 2], [11, 11], [6, 10]], PAL.cream[0]);
      p.poly([[5, 4], [9, 5], [10, 10], [6, 9]], PAL.cream[2]);
      p.line(6, 6, 8, 6, PAL.wood[3]); p.line(7, 8, 9, 8, PAL.wood[3]);
    } else if (biome === 'spire') {
      const c = kind === 0 ? PAL.gold[7] : PAL.teal[7];
      if (frame === 2) { p.rect(6, 8, 5, 1, c); p.rect(8, 6, 1, 5, c); }
      else p.set(8, 8, c);
    } else if (biome === 'meadow' && kind === 0) {
      p.rect(6, 7, frame === 1 ? 1 : 3, 2, PAL.rose[6]); p.set(7, 8, PAL.rose[4]);
    } else {
      p.set(8, 7, PAL.gold[7]); p.set(7, 8, PAL.gold[5]);
      if (frame === 2) p.set(8, 8, PAL.cream[3]);
    }
  });
}

function cloudSprite(variant) {
  return spriteCache(`ambience:cloud:${variant}`, 160, 88, (p) => {
    // Overlapping blobs are sampled as one union, so joins have no dark seams.
    const blobs = [[45, 43, 37, 21], [76, 34, 37, 26], [111, 47, 36, 22], [86, 62, 47, 19]];
    p.rect(0, 0, 160, 88, (x, y) => {
      let coverage = 0;
      for (const [cx, cy, rx, ry] of blobs) {
        const dx = (x - cx - variant * 3) / rx, dy = (y - cy) / ry;
        coverage = Math.max(coverage, 1 - dx * dx - dy * dy);
      }
      return coverage > 0 && bayer(x, y) < Math.min(0.72, coverage * 0.8) ? PAL.shadow : null;
    });
  });
}

function shaftSprite() {
  return spriteCache('ambience:grove-shaft', 96, 180, (p) => {
    for (let y = 0; y < 180; y++) {
      const middle = 76 - Math.floor(y * 0.3), width = 3 + Math.floor(y / 20);
      for (let x = middle - width; x <= middle + width; x++) {
        const density = (1 - Math.abs(x - middle) / (width + 1)) * (1 - y / 240) * 0.35;
        if (bayer(x, y) < density) p.set(x, y, PAL.gold[6]);
      }
    }
  });
}

/** update records the viewport; draw derives positions from absolute t (seconds).
 * Reduced mode halves emitters, freezes cloud drift and removes shaft flicker. */
export function createAmbience(biome, { reduced = false } = {}) {
  biome = BIOMES.includes(biome) ? biome : 'point';
  let width = 384, height = 216, cellsKey = '', particles = [];
  const seed = BIOMES.indexOf(biome) * 37 + 107;
  const density = reduced ? 2 : 4;

  function populate(camX, camY) {
    const left = Math.floor((camX - 48) / CELL), right = Math.floor((camX + width + 48) / CELL);
    const top = Math.floor((camY - 48) / CELL), bottom = Math.floor((camY + height + 48) / CELL);
    const key = `${left}:${right}:${top}:${bottom}`;
    if (key === cellsKey) return;
    cellsKey = key;
    particles = [];
    for (let cy = top; cy <= bottom; cy++) for (let cx = left; cx <= right; cx++) for (let i = 0; i < density; i++) {
      particles.push({
        x: cx * CELL + hash2(cx, cy, seed + i * 3) * CELL,
        y: cy * CELL + hash2(cx, cy, seed + i * 3 + 1) * CELL,
        phase: hash2(cx, cy, seed + i * 3 + 2) * 30,
        kind: i === 0 ? 0 : 1,
      });
    }
  }

  return {
    biome,
    update(dt, camX, camY, viewW, viewH) {
      width = viewW; height = viewH;
      populate(camX, camY);
    },
    draw(ctx, camX, camY, t) {
      if (!particles.length) populate(camX, camY);
      const alpha = ctx.globalAlpha;
      if (biome !== 'static') {
        // World-anchored 320 px cloud field; no parallax relative to the ground.
        const drift = reduced ? 0 : t * 2;
        const left = Math.floor((camX - drift - 160) / 320), top = Math.floor((camY - 88) / 240);
        for (let cy = top; cy <= Math.floor((camY + height) / 240); cy++) for (let cx = left; cx <= Math.floor((camX + width - drift) / 320); cx++) {
          const wx = cx * 320 + hash2(cx, cy, 12) * 100 + drift;
          const wy = cy * 240 + hash2(cx, cy, 13) * 80;
          const x = Math.round(wx - camX), y = Math.round(wy - camY);
          if (x > width || x < -160 || y > height || y < -88) continue;
          ctx.globalAlpha = alpha * (biome === 'spire' ? 0.07 : 0.105);
          ctx.drawImage(cloudSprite(mod(cx + cy, 2)), x, y);
        }
      }
      if (biome === 'grove') {
        ctx.globalAlpha = alpha * (reduced ? 0.13 : 0.12 + Math.sin(t * 0.45) * 0.025);
        const left = Math.floor((camX - 96) / 240);
        for (let col = left; col <= Math.floor((camX + width) / 240); col++) {
          const x = Math.round(col * 240 + 72 - camX);
          const y = Math.round(Math.floor(camY / 240) * 240 - camY);
          ctx.drawImage(shaftSprite(), x, y);
        }
      }
      for (const particle of particles) {
        const phase = particle.phase + t * (reduced ? 0.25 : 1);
        let wx = particle.x + Math.sin(phase * 0.45) * 13;
        let wy = particle.y + Math.sin(phase * 0.3) * 9;
        let motionFade = 1;
        if (biome === 'forge') {
          const life = mod(phase * 5, 32) / 32;
          wy -= life * 32 - 16;
          motionFade = Math.sin(life * Math.PI);
        } else if (biome === 'heights' || biome === 'cove') {
          const life = mod(phase * 8, 48) / 48;
          wx += life * 48 - 24; wy += Math.sin(phase * 0.35) * 8;
          motionFade = Math.sin(life * Math.PI);
        } else if (biome === 'meadow' || biome === 'archives') {
          wx += Math.sin(phase * 0.25) * 12; wy += Math.cos(phase * 0.3) * 10;
        }
        const x = Math.round(wx - camX) - 8, y = Math.round(wy - camY) - 8;
        if (x < -16 || y < -16 || x > width || y > height) continue;
        const pulse = Math.sin(phase * 1.5);
        if (biome === 'static' && pulse < 0.25 || biome === 'spire' && pulse < -0.45) continue;
        const fade = biome === 'grove' ? 0.5 + pulse * 0.25 : biome === 'static' ? 0.45 : biome === 'cove' && particle.kind === 0 ? 0.28 : biome === 'point' ? 0.48 : 0.64;
        ctx.globalAlpha = alpha * fade * motionFade;
        const frame = reduced ? 1 : mod(Math.floor(phase * 2), 3);
        ctx.drawImage(moteSprite(biome, particle.kind, frame), x, y);
      }
      ctx.globalAlpha = alpha;
    },
  };
}

const galleryWeather = new Map();
export const galleries = {
  ambience(ctx, screen, t, page = 0) {
    const biome = BIOMES[mod(page, BIOMES.length)];
    const base = biome === 'static' ? 'archives' : biome;
    ctx.fillStyle = PAL.night[1]; ctx.fillRect(0, 0, screen.w, screen.h);
    drawTerrainDemo(ctx, screen, t, base);
    const lower = screen.h - 53;
    const tree = base === 'cove' ? 'tree-palm' : base === 'heights' ? 'tree-pine' : base === 'forge' ? 'tree-dead' : base === 'spire' ? 'tree-crystal' : 'tree-oak';
    drawProp(ctx, tree, 31, lower, { t, biome: base });
    drawProp(ctx, tree, 60, lower - 12, { t, biome: base, variant: 2 });
    drawProp(ctx, 'gridstone', Math.round(screen.w * 0.44), lower, { t, biome: base, state: 'awake' });
    drawProp(ctx, 'lamp', Math.round(screen.w * 0.59), lower - 9, { t, biome: base });
    let weather = galleryWeather.get(biome);
    if (!weather) { weather = createAmbience(biome); galleryWeather.set(biome, weather); }
    weather.update(1 / 60, 0, 0, screen.w, screen.h);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 27, screen.w, screen.h - 53); ctx.clip();
    weather.draw(ctx, 0, 0, t); ctx.restore();
    drawText(ctx, `${biome} / air & light`, 8, 7, { color: PAL.cream[2] });
    const captions = { point: 'sunset motes · drifting cloud shade', meadow: 'petals & pollen · drifting cloud shade', grove: 'fireflies · sun shafts · cloud shade', cove: 'sea spray · gull shadows · cloud shade', heights: 'wind ribbons · alpine snow', forge: 'cinders · chimney-dark smoke', archives: 'wandering pages · lantern motes', spire: 'aurora sparks · night cloud shade', static: 'low-bit flecks · broken scanlines' };
    drawText(ctx, captions[biome], 8, screen.h - 26, { font: 'small', color: PAL.ui.dim });
  },
};
