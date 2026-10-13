import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { World, propVisible } from '../src/world/world.js';
import { BRIDGES, PROPS as PLACEMENTS, INTERACTABLES, TILE } from '../src/world/map.js';
import { PUZZLES } from '../src/world/puzzles.js';
import { PROPS } from '../src/art/props.js';
import { PAL } from '../src/art/palette.js';
import { buildPaletteLUT, rgbaOf, u32 } from '../src/art/paint.js';
import { isWalkable } from '../src/art/terrain.js';
import { ZONES } from '../src/content/game-data.js';
import { newGame } from '../src/state.js';

function worldWith(puzzles = []) {
  const state = newGame();
  state.puzzles = [...puzzles];
  state.friends = [0, 1, 2, 3, 4, 5, 6];
  const game = {
    state, time: 0, reducedMotion: true, screen: { w: 384, h: 216 },
    hasFlag: (id) => state.flags.includes(id),
    setFlag: (id, value = true) => { state.flags = value ? [...new Set([...state.flags, id])] : state.flags.filter((flag) => flag !== id); },
    audio: { play() {} },
  };
  const world = new World(game);
  world.setState(state);
  world.statics = [];
  world.followers = [];
  return world;
}

// A small integer raster backend exercises the real procedural painters without
// a browser. It implements the three compositing operations used by world actors.
function canvas(width = 1, height = 1) {
  const image = { width, height };
  let pixels = new Uint32Array(width * height);
  const buffer = () => {
    if (pixels.length !== image.width * image.height) pixels = new Uint32Array(image.width * image.height);
    return pixels;
  };
  const context = {
    canvas: image, globalCompositeOperation: 'source-over', globalAlpha: 1, fillStyle: '#000000', commands: [],
    putImageData(data, dx, dy) {
      const source = new Uint32Array(data.data.buffer, data.data.byteOffset, data.width * data.height);
      for (let y = 0; y < data.height; y++) for (let x = 0; x < data.width; x++) {
        if (x + dx >= 0 && x + dx < image.width && y + dy >= 0 && y + dy < image.height) buffer()[(y + dy) * image.width + x + dx] = source[y * data.width + x];
      }
    },
    getImageData(sx, sy, w, h) {
      const words = new Uint32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x + sx >= 0 && x + sx < image.width && y + sy >= 0 && y + sy < image.height) words[y * w + x] = buffer()[(y + sy) * image.width + x + sx];
      return { width: w, height: h, data: new Uint8ClampedArray(words.buffer) };
    },
    clearRect(x, y, w, h) {
      for (let py = Math.max(0, y); py < Math.min(image.height, y + h); py++) for (let px = Math.max(0, x); px < Math.min(image.width, x + w); px++) buffer()[py * image.width + px] = 0;
    },
    fillRect(x, y, w, h) {
      for (let py = Math.max(0, y); py < Math.min(image.height, y + h); py++) for (let px = Math.max(0, x); px < Math.min(image.width, x + w); px++) this.pixel(px, py, u32(this.fillStyle));
    },
    pixel(x, y, source) {
      const index = y * image.width + x, dest = buffer()[index];
      const sa = (source >>> 24) / 255 * this.globalAlpha, da = (dest >>> 24) / 255;
      if (this.globalCompositeOperation === 'destination-out') buffer()[index] = (dest & 0xffffff) | (Math.round(da * (1 - sa) * 255) << 24);
      else if (this.globalCompositeOperation === 'source-in') buffer()[index] = (source & 0xffffff) | (Math.round(sa * da * 255) << 24);
      else {
        assert.equal(this.globalCompositeOperation, 'source-over');
        const alpha = sa + da * (1 - sa);
        let word = Math.round(alpha * 255) << 24;
        for (let channel = 0; channel < 3; channel++) word |= Math.round(alpha ? (((source >>> (channel * 8)) & 255) * sa + ((dest >>> (channel * 8)) & 255) * da * (1 - sa)) / alpha : 0) << (channel * 8);
        buffer()[index] = word;
      }
    },
    drawImage(source, ...args) {
      const [sx, sy, sw, sh, dx, dy, dw, dh] = args.length === 2 ? [0, 0, source.width, source.height, ...args, source.width, source.height] : args.length === 4 ? [0, 0, source.width, source.height, ...args] : args;
      this.commands.push({ source, operation: this.globalCompositeOperation, dx, dy });
      const data = source.getContext('2d').getImageData(sx, sy, sw, sh);
      const words = new Uint32Array(data.data.buffer);
      for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
        if (x + dx < 0 || x + dx >= image.width || y + dy < 0 || y + dy >= image.height) continue;
        this.pixel(x + dx, y + dy, words[Math.floor(y * sh / dh) * sw + Math.floor(x * sw / dw)]);
      }
    },
  };
  image.getContext = () => context;
  return image;
}

const previousDocument = globalThis.document, previousImageData = globalThis.ImageData;
before(() => {
  globalThis.document = { createElement: (kind) => { assert.equal(kind, 'canvas'); return canvas(); } };
  globalThis.ImageData = class { constructor(data, width, height) { this.data = data; this.width = width; this.height = height; } };
});
after(() => {
  if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  if (previousImageData === undefined) delete globalThis.ImageData; else globalThis.ImageData = previousImageData;
});

function pixels(image) { return new Uint32Array(image.data.buffer, image.data.byteOffset, image.width * image.height); }
function imageOf(width, height, colour) {
  const words = Uint32Array.from({ length: width * height }, (_, i) => u32(typeof colour === 'function' ? colour(i % width, Math.floor(i / width)) : colour));
  return { width, height, data: new Uint8ClampedArray(words.buffer) };
}
const light = (word) => { const [r, g, b] = rgbaOf(word); return r * 0.2126 + g * 0.7152 + b * 0.0722; };

test('solved four-cell crossings center five-pixel-offset entries in both directions, including bends', () => {
  const orientations = new Set();
  let bends = 0;
  for (const bridge of BRIDGES) {
    const nodes = [bridge.bank, ...bridge.cells, bridge.reward];
    assert.equal(bridge.cells.length, 4);
    for (let i = 1; i < nodes.length; i++) orientations.add(nodes[i].x === nodes[i - 1].x ? 'vertical' : 'horizontal');
    if (nodes.some((node, i) => i > 1 && (node.x - nodes[i - 1].x) * (nodes[i - 1].y - nodes[i - 2].y) !== (node.y - nodes[i - 1].y) * (nodes[i - 1].x - nodes[i - 2].x))) bends++;
    for (const ordered of [nodes, [...nodes].reverse()]) for (const offset of [-5, 5]) {
      const world = worldWith([bridge.id]);
      const horizontal = ordered[1].x !== ordered[0].x;
      world.hero.x = ordered[0].x + (horizontal ? 0 : offset);
      world.hero.y = ordered[0].y + (horizontal ? offset : 0);
      assert.equal(world._walkable(world.hero.x, world.hero.y), true, `${bridge.id}: dry approach`);
      for (let i = 1; i < ordered.length; i++) {
        world._move(world.hero, ordered[i].x - ordered[i - 1].x, ordered[i].y - ordered[i - 1].y);
        assert.ok(Math.abs(world.hero.x - ordered[i].x) < 0.001 && Math.abs(world.hero.y - ordered[i].y) < 0.001, `${bridge.id}: offset ${offset}, segment ${i}`);
        assert.equal(world._walkable(world.hero.x, world.hero.y), true);
      }
    }
  }
  assert.deepEqual(orientations, new Set(['vertical', 'horizontal']));
  assert.ok(bends >= 3, 'authored grove/archive/spire bends are exercised, not flattened into an axis');
});

test('bridge assistance never opens unsolved cells, adjacent water, or solid pedestal footprints', () => {
  for (const bridge of BRIDGES) {
    const unsolved = worldWith();
    unsolved.hero.x = bridge.bank.x;
    unsolved.hero.y = bridge.bank.y;
    unsolved._move(unsolved.hero, bridge.cells[0].x - bridge.bank.x, bridge.cells[0].y - bridge.bank.y);
    assert.ok(Math.floor(unsolved.hero.x / TILE) !== bridge.cells[0].tx || Math.floor(unsolved.hero.y / TILE) !== bridge.cells[0].ty, bridge.id);
    const solved = worldWith([bridge.id]);
    let wetEdges = 0;
    for (const cell of bridge.cells) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      if (isWalkable(solved.map.get(cell.tx + dx, cell.ty + dy))) continue;
      wetEdges++;
      assert.equal(solved._walkable(cell.x + dx * TILE, cell.y + dy * TILE), false, `${bridge.id}: no invisible widening`);
    }
    assert.ok(wetEdges > 0);
    const pedestal = INTERACTABLES.find((item) => item.id === bridge.id);
    assert.equal(solved._walkable(pedestal.x, pedestal.y), false, `${bridge.id}: pedestal remains solid`);
  }
});

test('saved nonflat bridge profiles and hero feet use the same cached support heights', () => {
  for (const bridge of BRIDGES) {
    const world = worldWith([bridge.id]), heights = PUZZLES[bridge.zone].settledHeights;
    const min = Math.min(...heights), span = Math.max(...heights) - min;
    const path = world._bridgePath(bridge);
    assert.strictEqual(world._bridgePath(bridge), path);
    for (const [i, cell] of bridge.cells.entries()) {
      assert.equal(world._bridgeLift(cell.x, cell.y), span < 1e-8 ? 0 : Math.round((heights[i] - min) / span * 6));
      assert.equal(world._bridgeLift(cell.x, cell.y), world._pathLift(path, cell.x, cell.y));
    }
    assert.equal(world._bridgeLift(bridge.bank.x, bridge.bank.y), 0);
    assert.equal(world._bridgeLift(bridge.reward.x, bridge.reward.y), 0);
    const output = canvas(160, 160).getContext('2d');
    world._drawSolvedBridge(output, bridge, bridge.cells[0].x - 64, bridge.cells[0].y - 64);
    const deck = world.bridgeDecks.get(bridge.id);
    world._drawSolvedBridge(output, bridge, 0, 0);
    assert.strictEqual(world.bridgeDecks.get(bridge.id), deck, 'walking does not repaint or refit the treads');
    if (bridge.zone === 0) assert.equal(span, 0, 'the first bucket bridge remains flat');
    else assert.ok(span > 0, 'later concepts retain distinct physical levels');
  }
});

test('large architecture culls by declared sprite bounds, including the top of the 96 by 104 sanctum', () => {
  assert.equal(PROPS['spire-sanctum'].w, 96);
  assert.equal(PROPS['spire-sanctum'].h, 104);
  assert.equal(propVisible({ kind: 'spire-sanctum', x: 48, y: 205 }, 0, 0, 100, 104), true, 'last visible roof row must not pop away');
  assert.equal(propVisible({ kind: 'spire-sanctum', x: 140, y: 90 }, 0, 0, 100, 104), true, 'overhanging left edge remains visible');
  assert.equal(propVisible({ kind: 'spire-sanctum', x: 150, y: 90 }, 0, 0, 100, 104), false);
});

test('walkable stairs draw before actors and never erase them through the Y-sorted prop pass', () => {
  const stairs = PLACEMENTS.find((item) => item.kind === 'terrace-stairs');
  assert.ok(stairs);
  assert.equal(PROPS[stairs.kind].ground, true);
  const world = worldWith();
  world.hero.x = stairs.x;
  world.hero.y = stairs.y - 8;
  const environment = canvas(96, 128).getContext('2d'), actors = canvas(96, 128).getContext('2d');
  world._drawEntities(environment, actors, stairs.x - 48, stairs.y - 96, 96, 128, 0);
  assert.equal(world.renderList.some((entry) => entry.item === stairs), false);
  assert.ok(environment.commands.some((command) => command.source.width === 32 && command.source.height === 32));
  assert.equal(actors.commands.some((command) => command.operation === 'destination-out' && command.source.width === 32 && command.source.height === 32), false);
});

test('an occluded hero gets a cached stable outline while foreground props keep normal actor erasure', () => {
  const tree = PLACEMENTS.find((item) => item.zone === -1 && item.kind.startsWith('tree-'));
  assert.ok(tree);
  const world = worldWith();
  world.hero.x = tree.x;
  world.hero.y = tree.y - 14;
  world.hero.facing = 'down';
  const environment = canvas(96, 96).getContext('2d'), actors = canvas(96, 96).getContext('2d');
  world._drawEntities(environment, actors, tree.x - 48, tree.y - 64, 96, 96, 0);
  assert.ok(world.heroCover, 'the canopy intersects the hero');
  assert.ok(actors.commands.some((command) => command.operation === 'destination-out'), 'ordinary occlusion is preserved');
  assert.ok(actors.commands.some((command) => command.source === world.heroCover.canvas));
  const outline = world._heroSilhouette();
  const colours = new Set([...pixels(outline.getContext('2d').getImageData(0, 0, 32, 36))].filter((word) => word >>> 24));
  assert.deepEqual(colours, new Set([u32(PAL.cream[2]), u32(PAL.teal[2])]));
  world.hero.moving = true;
  world.hero.step = 3;
  world._drawEntities(environment, actors, tree.x - 48, tree.y - 64, 96, 96, 9);
  assert.strictEqual(world._heroSilhouette(), outline, 'animation and time cannot flicker the safety silhouette');
});

test('each corruption palette has exactly 2^bits unique colours and caches both stone depths', () => {
  const world = worldWith();
  for (const zone of ZONES) for (const bits of [zone.corruptBits, zone.corruptBits + 1]) {
    const palette = world._palette(zone.id, bits);
    assert.equal(palette.size, 2 ** bits, `${zone.key}: palette size`);
    assert.equal(new Set(palette.words).size, 2 ** bits, `${zone.key}: no duplicate slots`);
    assert.strictEqual(world._palette(zone.id, bits), palette, 'no nearest-colour rebuild per frame');
  }
});

test('four-colour late palettes retain a warm fire and a brighter landmark than their broad floors', () => {
  const world = worldWith();
  for (const zone of [5, 6]) {
    const palette = world._palette(zone, 2);
    const image = imageOf(3, 1, (x) => [PAL.ember[6], zone === 6 ? PAL.teal[7] : PAL.stone[6], zone === 6 ? PAL.teal[3] : PAL.stone[3]][x]);
    world._posterize(image, palette, new Uint8Array(3), 0, 0, () => true, Uint32Array.of(0xff000000, 0xff000000, 0));
    const [fire, landmark, floor] = pixels(image), [r, g, b] = rgbaOf(fire);
    assert.ok(r > g + 25 && g > b + 5, `zone ${zone}: fire is warm, not violet`);
    assert.notEqual(landmark, floor, `zone ${zone}: material separation`);
    assert.ok(light(landmark) > light(floor) + 28, `zone ${zone}: focal value separation`);
  }
});

test('dithering is limited to nearby same-material ramp transitions, never a flat floor or hue edge', () => {
  const world = worldWith();
  const flat = imageOf(8, 8, '#787878');
  assert.ok([...world._rampTransitions(flat)].every((value) => value === 0));
  const palette = buildPaletteLUT(['#606060', '#909090']);
  world._posterize(flat, palette, world._rampTransitions(flat), 13, 21, () => true);
  assert.equal(new Set(pixels(flat)).size, 1, 'world-anchored Bayer must not texture uniform ground');
  const ramp = imageOf(8, 8, (x) => { const c = 40 + x * 8; return ((255 << 24) | (c << 16) | (c << 8) | c) >>> 0; });
  assert.ok([...world._rampTransitions(ramp)].some((value) => value === 1));
  const hueEdge = imageOf(8, 8, (x) => x < 4 ? '#9c553d' : '#237f78');
  assert.ok([...world._rampTransitions(hueEdge)].every((value) => value === 0), 'wood/teal material border is not a shading ramp');
  const mask = world.rampMask;
  world._rampTransitions(flat);
  assert.strictEqual(world.rampMask, mask, 'transition storage is reused');
});

test('four-colour landmark masks separate identical paving/wall colours and retain warm tent faces', () => {
  const world = worldWith();
  for (const zone of [5, 6]) {
    const palette = world._palette(zone, 2);
    const image = imageOf(5, 1, (x) => [PAL.stone[3], PAL.stone[3], PAL.roof[4], PAL.ember[9], PAL.stone[0]][x]);
    world._posterize(image, palette, new Uint8Array(5), 0, 0, () => true, Uint32Array.of(0, 0xff000000, 0xff000000, 0xff000000, 0xff000000));
    const [paving, wall, tent, fire, outline] = pixels(image);
    assert.notEqual(paving, wall, 'identical source stone has different environmental/material roles');
    assert.ok(light(wall) > light(paving) + 28);
    assert.ok(light(outline) < light(wall) - 40, 'landmark recesses stay dark');
    for (const word of [tent, fire]) {
      const [r, g, b] = rgbaOf(word);
      assert.ok(r > g && g > b, 'tent cloth and fire core retain the warm slot');
    }
    assert.ok([...pixels(image)].every((word) => palette.words.includes(word)), 'material lookup introduces no extra colours');
  }
});

test('prop alpha masks constrain material remapping and corruption never recolours actors', () => {
  const tent = PLACEMENTS.find((item) => item.zone === 5 && item.kind === 'tent');
  assert.ok(tent);
  const world = worldWith();
  world.restored.delete(5);
  world.hero.x = tent.x + 22;
  world.hero.y = tent.y + 12;
  const environment = canvas(96, 96).getContext('2d'), actors = canvas(96, 96).getContext('2d'), mask = canvas(96, 96);
  world.materialLayer = { canvas: mask, ctx: mask.getContext('2d') };
  const cx = tent.x - 48, cy = tent.y - 48;
  world._drawEntities(environment, actors, cx, cy, 96, 96, 0);
  const materials = pixels(world.materialLayer.ctx.getImageData(0, 0, 96, 96));
  assert.ok(materials.some((word) => word >>> 24));
  assert.ok(materials.some((word) => !(word >>> 24)), 'transparent prop corners do not remap a rectangular patch of floor');
  const before = actors.getImageData(0, 0, 96, 96);
  assert.ok(new Set([...pixels(before)].filter((word) => word >>> 24)).size > 4);
  world._corrupt(environment, cx, cy, 96, 96, 0);
  assert.deepEqual(actors.getImageData(0, 0, 96, 96).data, before.data, 'the full-colour actor layer is outside posterization');
});
