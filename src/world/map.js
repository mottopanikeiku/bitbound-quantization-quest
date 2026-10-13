// The Static Isle: eight hand-authored shores joined by a single clockwise route.
// ASCII is terrain, not collision art. Placement coordinates are tile centres.
import { TERRAIN_TYPES, isWalkable } from '../art/terrain.js';
import { ZONES } from '../content/game-data.js';
import { ZONE_LAYOUTS } from './layouts.js';

export const TILE = 16;
export const MAP_W = 120;
export const MAP_H = 90;
export const LEGEND = Object.freeze({
  ' ': 'deep', '~': 'water', s: 'sand', '.': 'grass', ',': 'tallgrass', f: 'flowers',
  '=': 'path', o: 'stone', '#': 'cliff', b: 'bridge', a: 'ash', l: 'lava', r: 'ruin',
  c: 'crystal', n: 'snow', p: 'plank', T: 'grass', Y: 'stone',
});

// T/Y mark deliberately placed tree/rock silhouettes, not random scatter.
export const REGIONS = [
  { id: -1, key: 'point', x: 47, y: 66, ascii: [
    '        ~~~~~~~~~~~        ',
    '     ~~~sssssssssss~~~     ',
    '   ~~ss...T....T...sss~~   ',
    '  ~ss................ss~  ',
    ' ~ss...f....f.........ss~  ',
    ' ~s...................ss~ ',
    '~ss.......ooooo........ss~',
    '~s...T....ooooo.....T...s~',
    '~s........ooooo.........s~',
    '~s..f......===......f...s~',
    '~s.........===..........s~',
    '~s..==================..s~',
    '~s.........===..........s~',
    '~s....f....===....f.....s~',
    '~ss........===.........ss~',
    ' ~s....T...===.....T...ss~ ',
    ' ~ss.......===........ss~ ',
    '  ~ss......ppp......sss~  ',
    '   ~ssssssspppsssssss~~   ',
    '    ~~~~~~~ppp~~~~~~~     ',
    '          ~ppp~           ',
    '          ~~~~~           ',
    '                          ',
  ] },
  ...ZONE_LAYOUTS,
];

const terrain = new Uint8Array(MAP_W * MAP_H);
const zones = new Int8Array(MAP_W * MAP_H).fill(-1);
const biomes = new Array(MAP_W * MAP_H).fill('point');
const terrainIndex = Object.fromEntries(TERRAIN_TYPES.map((name, index) => [name, index]));
terrain.fill(terrainIndex.deep);
const inside = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
function tile(x, y, type, zone, biome) {
  if (!inside(x, y)) return;
  const index = y * MAP_W + x;
  terrain[index] = terrainIndex[type];
  zones[index] = zone;
  biomes[index] = biome;
}
export const PROPS = [];
export const INTERACTABLES = [];
export const STATICLINGS = [];
export const BRIDGES = [];
export const ENTRIES = [];
const treeKinds = ['tree-oak', 'tree-willow', 'tree-palm', 'tree-pine', 'tree-dead', 'tree-dead', 'tree-crystal'];
const groundTypes = ['grass', 'grass', 'sand', 'snow', 'ash', 'ruin', 'stone'];
const roadTypes = ['path', 'path', 'sand', 'stone', 'stone', 'plank', 'crystal'];
const point = (region, x, y) => ({ tx: region.x + x, ty: region.y + y, x: (region.x + x) * TILE + 8, y: (region.y + y) * TILE + 8 });
function place(region, id, kind, x, y, extra = {}) {
  const item = { id, kind, zone: region.id, biome: region.key, ...point(region, x, y), ...extra };
  PROPS.push(item);
  if (item.interaction) INTERACTABLES.push(item);
  return item;
}
function trail(region, points, width = 1, type = roadTypes[region.id] ?? 'path') {
  for (let i = 1; i < points.length; i++) {
    let [x, y] = points[i - 1];
    const [endX, endY] = points[i];
    for (;;) {
      for (let dy = 0; dy < width; dy++) for (let dx = 0; dx < width; dx++) tile(region.x + x + dx, region.y + y + dy, type, region.id, region.key);
      if (x === endX && y === endY) break;
      if (x !== endX) x += Math.sign(endX - x);
      else y += Math.sign(endY - y);
    }
  }
}

function buildBridge(region) {
  const design = region.bridge;
  const ground = groundTypes[region.id];
  // Carve a narrow shore/chasm channel around its authored polyline, not the
  // same rectangular swimming pool in every biome. The terminal islet has a
  // three-tile landing, surrounded by a full wet margin.
  for (const [x, y] of [...design.cells, design.reward]) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      tile(region.x + x + dx, region.y + y + dy, design.water, region.id, region.key);
    }
  }
  const [rx, ry] = design.reward;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    tile(region.x + rx + dx, region.y + ry + dy, design.water, region.id, region.key);
  }
  const [bx, by] = design.bank;
  const dx = design.cells[0][0] - bx, dy = design.cells[0][1] - by;
  for (let back = 0; back <= 1; back++) for (let side = -1; side <= 1; side++) {
    tile(region.x + bx - dx * back - dy * side, region.y + by - dy * back + dx * side, ground, region.id, region.key);
  }
  const last = design.cells.at(-1);
  const endX = rx - last[0], endY = ry - last[1];
  for (let side = -1; side <= 1; side++) tile(region.x + rx - endY * side, region.y + ry + endX * side, ground, region.id, region.key);
  const bridge = {
    id: `bridge-${region.id}`, zone: region.id,
    bank: point(region, bx, by), reward: point(region, rx, ry),
    cells: design.cells.map(([x, y]) => point(region, x, y)),
  };
  BRIDGES.push(bridge);
  place(region, bridge.id, 'pedestal', ...design.pedestal, { interaction: 'puzzle' });
  place(region, `${region.key}-bridge-shard`, 'shard', rx, ry, { interaction: 'shard', puzzle: bridge.id });
}

for (const region of REGIONS) {
  region.w = Math.max(...region.ascii.map((row) => row.length));
  region.h = region.ascii.length;
  // The biome includes a little surrounding sea, so tall tree crowns crossing
  // the ASCII shoreline retain the same colour depth as their own trunks.
  if (region.id >= 0) for (let y = region.y - 3; y < region.y + region.h + 2; y++) {
    for (let x = region.x - 2; x < region.x + region.w + 2; x++) {
      if (!inside(x, y) || terrain[y * MAP_W + x] !== terrainIndex.deep) continue;
      zones[y * MAP_W + x] = region.id;
      biomes[y * MAP_W + x] = region.key;
    }
  }
  region.ascii.forEach((row, y) => [...row].forEach((char, x) => {
    tile(region.x + x, region.y + y, char === '=' ? roadTypes[region.id] ?? 'path' : LEGEND[char], region.id, region.key);
    if (char === 'T' || char === 'Y') place(region, `${region.key}-silhouette-${x}-${y}`, char === 'T' ? treeKinds[Math.max(0, region.id)] : 'rock-l', x, y, { variant: x + y });
  }));
  if (region.id < 0) continue;
  const z = region.id;
  const ground = groundTypes[z];
  const [ex, ey, facing] = region.entry;
  ENTRIES[z] = { zone: z, ...point(region, ex, ey), facing };
  buildBridge(region);
  place(region, `${region.key}-stone`, 'gridstone', ...region.stone, { interaction: 'stone' });
  place(region, `${region.key}-shrine`, region.shrineKind ?? `shrine-${z}`, ...region.shrine, { interaction: 'shrine' });
  place(region, `${region.key}-camp`, 'campfire', ...region.camp, { interaction: 'camp' });
  place(region, `${region.key}-tent`, 'tent', ...region.tent);
  place(region, `${region.key}-cache`, 'cache', ...region.cache, { interaction: 'cache' });
  place(region, `${region.key}-hidden`, 'shard', ...region.hidden, { interaction: 'shard' });
  place(region, `${region.key}-sign`, 'sign', ...region.sign, { interaction: 'sign' });
  place(region, `${region.key}-npc-a`, 'npc', ...region.npcs[0], { interaction: 'npc', character: ['botanist', 'scholar', 'fisher', 'hiker', 'smith', 'librarian', 'scholar'][z] });
  place(region, `${region.key}-npc-b`, 'npc', ...region.npcs[1], { interaction: 'npc', character: ['kid', 'botanist', 'sailor', 'scholar', 'hiker', 'kid', 'hiker'][z] });
  for (const [kind, x, y] of region.props) place(region, `${region.key}-${kind}-${x}-${y}`, kind, x, y);
  for (const item of INTERACTABLES.filter((item) => item.zone === z)) tile(item.tx, item.ty, ground, z, region.key);
  // Authored homes sit away from service approaches. Lifecycle activation is
  // handled by the world: sleeping before the stone, purified after friendship.
  for (let i = 0; i < region.patrols.length; i++) {
    const [x, y] = region.patrols[i];
    tile(region.x + x, region.y + y, ground, z, region.key);
    STATICLINGS.push({ uid: `${region.key}-static-${i}`, zone: z, ...point(region, x, y), seed: z * 13 + i });
  }
}

const hub = REGIONS[0];
export const START = { ...point(hub, 11, 10), facing: 'up' };
export const LIGHTHOUSE = place(hub, 'point-lighthouse', 'lighthouse', 13, 8, { interaction: 'lighthouse' });
place(hub, 'point-keeper', 'npc', 11, 9, { character: 'keeper', interaction: 'npc' });
place(hub, 'point-kid', 'npc', 8, 12, { character: 'kid', interaction: 'npc' });
place(hub, 'point-fisher', 'npc', 14, 18, { character: 'fisher', interaction: 'npc' });
place(hub, 'point-cat', 'npc', 18, 11, { character: 'cat', interaction: 'npc' });
place(hub, 'point-camp', 'campfire', 6, 15, { interaction: 'camp' });
place(hub, 'point-tent', 'tent', 5, 14);
place(hub, 'point-sign', 'sign', 9, 11, { interaction: 'sign' });
place(hub, 'point-house-a', 'house-a', 6, 8);
place(hub, 'point-house-b', 'house-b', 20, 8);
place(hub, 'point-house-c', 'house-c', 20, 15);
place(hub, 'point-well', 'well', 16, 12);
place(hub, 'point-lamp-a', 'lamp', 10, 9);
place(hub, 'point-lamp-b', 'lamp', 14, 15);
place(hub, 'point-dock', 'dock', 11, 19);
place(hub, 'point-boat', 'boat', 14, 20);
place(hub, 'point-hidden-west', 'shard', 3, 5, { interaction: 'shard' });
place(hub, 'point-hidden-east', 'shard', 23, 17, { interaction: 'shard' });
trail(hub, [[2, 11], [11, 11], [11, 8]], 2);
trail(hub, [[3, 5], [3, 11]], 1);
trail(hub, [[21, 15], [23, 15], [23, 17]], 1);
for (const item of INTERACTABLES.filter((item) => item.zone < 0)) tile(item.tx, item.ty, 'grass', -1, 'point');

// Only these necks connect shores. Gate cross-sections cover the ENTIRE neck.
const ROUTES = [
  { from: -1, to: 0, points: [[49, 77], [40, 77]], gate: null },
  { from: 0, to: 1, points: [[26, 65], [26, 57], [15, 57]], gate: [26, 61, 'horizontal'] },
  { from: 1, to: 2, points: [[23, 37], [23, 28]], gate: [23, 33, 'horizontal'] },
  { from: 2, to: 3, points: [[37, 22], [46, 22]], gate: [41, 22, 'vertical'] },
  { from: 3, to: 4, points: [[70, 17], [75, 17], [75, 26], [81, 26]], gate: [73, 17, 'vertical'] },
  { from: 4, to: 5, points: [[98, 32], [98, 43]], gate: [98, 38, 'horizontal'] },
  { from: 5, to: 6, points: [[86, 57], [78, 57], [78, 53], [72, 53]], gate: [80, 57, 'vertical'] },
];
export const GATES = [];
for (const route of ROUTES) {
  let distance = 0;
  const segments = route.points.slice(1).map(([x, y], i) => Math.abs(x - route.points[i][0]) + Math.abs(y - route.points[i][1]));
  const total = segments.reduce((a, b) => a + b, 0);
  for (let i = 1; i < route.points.length; i++) {
    let [x, y] = route.points[i - 1];
    const [endX, endY] = route.points[i];
    for (;;) {
      const zone = distance < total / 2 ? route.from : route.to;
      const biome = zone < 0 ? 'point' : ZONES[zone].biome;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const old = TERRAIN_TYPES[terrain[(y + dy) * MAP_W + x + dx]];
        tile(x + dx, y + dy, ['deep', 'water', 'cliff', 'lava'].includes(old) ? 'bridge' : roadTypes[zone] ?? 'path', zone, biome);
      }
      if (x === endX && y === endY) break;
      if (x !== endX) x += Math.sign(endX - x);
      else y += Math.sign(endY - y);
      distance++;
    }
  }
  if (route.gate) {
    const [tx, ty, orientation] = route.gate;
    const cells = orientation === 'horizontal' ? [[tx, ty], [tx + 1, ty]] : [[tx, ty], [tx, ty + 1]];
    GATES.push({ id: `gate-${route.from}`, kind: 'gate', requires: route.from, zone: route.to, biome: ZONES[route.to].biome, tx, ty, x: tx * TILE + 16, y: ty * TILE + 16, orientation, cells });
  }
}

// Remove silhouettes overwritten by a trail or the puzzle moat. Placement lists stay
// authoritative; decorative tree trunks never secretly seal a narrow bridge.
for (let i = PROPS.length - 1; i >= 0; i--) {
  const item = PROPS[i];
  if (!item.id.includes('-silhouette-')) continue;
  const type = TERRAIN_TYPES[terrain[item.ty * MAP_W + item.tx]];
  if (type === 'path' || type === 'bridge' || !isWalkable(type)) PROPS.splice(i, 1);
}

export const MAP = {
  width: MAP_W,
  height: MAP_H,
  get(tx, ty) { return inside(tx, ty) ? TERRAIN_TYPES[terrain[ty * MAP_W + tx]] : 'void'; },
  biome(tx, ty) { return inside(tx, ty) ? biomes[ty * MAP_W + tx] : 'point'; },
  zoneAt(tx, ty) { return inside(tx, ty) ? zones[ty * MAP_W + tx] : -1; },
};

/** A per-world view: solving a bridge cannot leak into a second game instance. */
export function createMapView(solved = new Set()) {
  const bridgeTiles = new Map();
  for (const bridge of BRIDGES) for (const cell of bridge.cells) bridgeTiles.set(cell.ty * MAP_W + cell.tx, bridge.id);
  return {
    ...MAP,
    get(tx, ty) {
      const id = bridgeTiles.get(ty * MAP_W + tx);
      return id && solved.has(id) ? 'stone' : MAP.get(tx, ty);
    },
  };
}

/** Tile-level topology used by map tests; props add their own local solid rectangles. */
export function tileOpen(tx, ty, friends = [], puzzles = []) {
  const bridge = BRIDGES.find((item) => item.cells.some((cell) => cell.tx === tx && cell.ty === ty));
  if (!(bridge && puzzles.includes(bridge.id)) && !isWalkable(MAP.get(tx, ty))) return false;
  return !GATES.some((gate) => !friends.includes(gate.requires) && gate.cells.some(([x, y]) => x === tx && y === ty));
}
