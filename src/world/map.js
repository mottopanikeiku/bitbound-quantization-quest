// The Static Isle: eight hand-authored shores joined by a single clockwise route.
// ASCII is terrain, not collision art. Placement coordinates are tile centres.
import { TERRAIN_TYPES, isWalkable } from '../art/terrain.js';
import { ZONES } from '../content/game-data.js';

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
  { id: 0, key: 'meadow', x: 15, y: 64, ascii: [
    '      ~~~~~~~~~~~~~        ',
    '   ~~~ssff....ffsss~~~     ',
    '  ~ss..ff..T...ff..ss~     ',
    ' ~s..................ss~  ',
    '~ss...,,........,,....ss~ ',
    '~s....,,...fff..,,.....s~ ',
    '~s..T......fff......T..s~ ',
    '~s.........===.........ss~',
    '~s....================..s~',
    '~s.........===..........s~',
    '~s..ff.....===....ff....s~',
    '~s..ff.....===....ff....s~',
    '~s.........===..........s~',
    '~s.....T...===..........s~',
    '~s.........===.....T....s~',
    '~s...================...s~',
    '~ss........===.........ss~',
    ' ~s...,,...===...,,....s~ ',
    ' ~ss..,,.........,,...ss~ ',
    '  ~ss.....f....f.....ss~  ',
    '   ~~sss..........sss~    ',
    '      ~sssssssssss~~      ',
    '       ~~~~~~~~~~~        ',
  ] },
  { id: 1, key: 'grove', x: 4, y: 36, ascii: [
    '       ~~~~~~~~~~~~        ',
    '    ~~~sTT....TTsss~~~     ',
    '  ~~sT............Tss~~   ',
    ' ~sT....,,,..,,,.....Ts~  ',
    ' ~s.....,,,..,,,......s~  ',
    '~sT...................Ts~',
    '~s....T....===....T.....s~',
    '~s.........===..........s~',
    '~s...================...s~',
    '~s.........===..........s~',
    '~s..T......===.....T....s~',
    '~s....~~~~~===..........s~',
    '~s....~~~~~bbb....,,,....s~',
    '~s....~~~~~===....,,,....s~',
    '~s.........===..........s~',
    '~s...================...s~',
    '~s.........===.....T....s~',
    '~s..T......===..........s~',
    '~s.....,,,.....,,,.....Ts~',
    ' ~s....,,,.....,,,.....s~ ',
    '  ~sT...............Tss~  ',
    '   ~~sssssssssssssss~~    ',
    '      ~~~~~~~~~~~~~       ',
  ] },
  { id: 2, key: 'cove', x: 12, y: 8, ascii: [
    '       ~~~~~~~~~~~~~       ',
    '    ~~~sssssssssssss~~~    ',
    '  ~~sss............ssss~  ',
    ' ~ss....T.........T....ss~ ',
    '~ss....................s~ ',
    '~s.......ssssssss.......s~',
    '~s......ss~~~~~~ss......s~',
    '~s.....ss~~~~~~~ss......s~',
    '~s...================...s~',
    '~s.........===..........s~',
    '~ss..T.....===....T....ss~',
    ' ~ss.......===.........s~ ',
    '  ~ss......===.........s~ ',
    '   ~ss.....===....T....s~ ',
    '    ~ss....===.........s~ ',
    '     ~ss...===========.s~ ',
    '      ~ss..===.........s~ ',
    '       ~ss.===.........s~ ',
    '        ~ss.....T.....ss~ ',
    '         ~sss.........s~  ',
    '          ~~ssssssssss~   ',
    '            ~~~~~~~~~~    ',
    '                          ',
  ] },
  { id: 3, key: 'heights', x: 45, y: 3, ascii: [
    '        ###########        ',
    '     ###nnnnnnnnnnn###     ',
    '   ##nnnYnnnnnnYnnnnn##   ',
    '  ##nnnnnnnnnnnnnnnnnn##  ',
    ' ##nnnnnnnnnnnnnnnnnnnn## ',
    ' #nnn####nnnnn####nnnnnn# ',
    '##nnn#ooonnnnnooo#nnnnnn##',
    '#nnnnoooooo===oooonnnnnnn#',
    '#nnoo================oonn#',
    '#nnoooooooo===oooooooonnn#',
    '#nnnnnnnooo===ooonnnnnnnn#',
    '#nnnYnnnooo===ooonnnnYnnn#',
    '#nnnnnnnooo===ooonnnnnnnn#',
    '#nnn###nooo===ooon###nnnn#',
    '#nnn#oonooo===ooonoo#nnnn#',
    '#nnoo================oonn#',
    '#nnoooooooo===oooooooonnn#',
    '#nnnnnnnnoo===oonnnnnnnnn#',
    '##nnnnnnnnnnnnnnnnnnnnn##',
    ' #nnnYnnnnnnnnnnnnYnnnn# ',
    '  ##nnnnnnnnnnnnnnnnn##  ',
    '    ####nnnnnnnnn####    ',
    '        #########        ',
  ] },
  { id: 4, key: 'forge', x: 80, y: 11, ascii: [
    '       ############        ',
    '    ###aaaaaaaaaaaa###     ',
    '  ##aaaYaaaaaaaaYaaaaa##   ',
    ' ##aaaaaaaaaaaaaaaaaaaa## ',
    ' #aaalllaaaaaaaaalllaaaa#  ',
    '##aalllllaaaaaaalllllaaa##',
    '#aaalllllaa===aalllllaaaa#',
    '#aaaalllaaa===aaalllaaaaa#',
    '#aaaa================aaaa#',
    '#aaaaaaaaaa===aaaaaaaaaaa#',
    '#aaaYaaaaaa===aaaaaaYaaaa#',
    '#aaaaaaaaaa===aaaaaaaaaaa#',
    '#aaalllaaaa===aaaalllaaaa#',
    '#aalllllaaa===aaalllllaaa#',
    '#aaalllaaaa===aaaalllaaaa#',
    '#aaaa================aaaa#',
    '#aaaaaaaaaa===aaaaaaaaaaa#',
    '#aaaYaaaaaa===aaaaaaYaaaa#',
    '##aaaaaaaaaaaaaaaaaaaaa##',
    ' #aaaaalllaaaaaalllaaaa#  ',
    '  ##aaaaaaaaaaaaaaaaa##   ',
    '    ###aaaaaaaaaaa###     ',
    '       ###########        ',
  ] },
  { id: 5, key: 'archives', x: 85, y: 42, ascii: [
    '     #################     ',
    '   ##rrrrrrrrrrrrrrrrr##   ',
    '  ##rrYrrrrrrrrrrrYrrrr##  ',
    ' ##rrrrrrrrrrrrrrrrrrrrr## ',
    ' #rrr###rrrrrrrrr###rrrr#  ',
    ' #rrr#rrrrrrrrrrrrr#rrrr#  ',
    '##rrrrrrrrr===rrrrrrrrrr##',
    '#rrrrrrrrrr===rrrrrrrrrrr#',
    '#rrrr================rrrr#',
    '#rrrrrrrrrr===rrrrrrrrrrr#',
    '#rrrYrrrrrr===rrrrrYrrrrr#',
    '#rrrrrrrrrr===rrrrrrrrrrr#',
    '#rrrr###rrr===rrr###rrrrr#',
    '#rrrr#rrrrr===rrrrr#rrrrr#',
    '#rrrrrrrrrr===rrrrrrrrrrr#',
    '#rrrr================rrrr#',
    '#rrrrrrrrrr===rrrrrrrrrrr#',
    '#rrrrrrrrrr===rrrrrrrrrrr#',
    '##rrrYrrrrrrrrrrrrrYrrr##',
    ' #rrrrrrrrrrrrrrrrrrrrr#  ',
    '  ##rrrrrrrrrrrrrrrrr##   ',
    '    #################     ',
    '                          ',
  ] },
  { id: 6, key: 'spire', x: 47, y: 34, ascii: [
    '          #######          ',
    '       ###cccooccc###       ',
    '     ##cccoooooooccc##     ',
    '    #cccooooooooocccc#     ',
    '   #cccoooooooooooccc#    ',
    '  #cccoooooooooooooccc#   ',
    ' ##ccoooooo===oooooocc##  ',
    ' #ccooooooo===ooooooocc#  ',
    '#ccoo================occ# ',
    '#cooooooooo===oooooooocc# ',
    '#coooYooooo===ooooYoooocc#',
    '#cooooooooo===oooooooocc#',
    '#cooooooooo===oooooooocc#',
    '#ccoooooooo===ooooooocc# ',
    ' #ccooooooo===oooooocc#  ',
    ' #cco================c#  ',
    ' ##ccoooooo===oooooocc##  ',
    '  #cccooooo===ooooccc#   ',
    '   #cccoooooooooccc#    ',
    '    #cccoooooooccc#     ',
    '     ##cccoooccc##      ',
    '       ###ccc###        ',
    '          ###           ',
  ] },
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
  // Central lane + short side trails make landmarks visible without filling every clearing.
  trail(region, [[11, 20], [11, 8], [20, 8]], 1);
  trail(region, [[5, 15], [21, 15]], 1);
  trail(region, [[11, 10], [4, 10], [4, 8]], 1);
  trail(region, [[20, 15], [22, 15], [22, 18]], 1);
  for (const [x, y] of [[9, 14], [18, 8], [6, 15], [13, 12], [21, 13], [7, 9], [22, 18], [4, 8], [12, 17]]) {
    tile(region.x + x, region.y + y, ground, z, region.key);
  }
  ENTRIES[z] = { zone: z, ...point(region, 11, 18) };
  place(region, `${region.key}-stone`, 'gridstone', 9, 14, { interaction: 'stone' });
  place(region, `${region.key}-shrine`, `shrine-${z}`, 18, 8, { interaction: 'shrine' });
  place(region, `${region.key}-camp`, 'campfire', 6, 15, { interaction: 'camp' });
  place(region, `${region.key}-tent`, 'tent', 5, 14);
  place(region, `${region.key}-cache`, 'cache', 7, 9, { interaction: 'cache' });
  place(region, `${region.key}-hidden`, 'shard', 22, 18, { interaction: 'shard' });
  place(region, `${region.key}-sign`, 'sign', 12, 17, { interaction: 'sign' });
  place(region, `${region.key}-npc-a`, 'npc', 13, 12, { interaction: 'npc', character: ['botanist', 'scholar', 'fisher', 'hiker', 'smith', 'librarian', 'scholar'][z] });
  place(region, `${region.key}-npc-b`, 'npc', 21, 13, { interaction: 'npc', character: ['kid', 'botanist', 'sailor', 'scholar', 'hiker', 'kid', 'hiker'][z] });
  // A genuine isolated reward islet: the four stones are the only dry route.
  for (let y = 1; y <= 7; y++) for (let x = 2; x <= 8; x++) tile(region.x + x, region.y + y, z >= 3 ? 'deep' : 'water', z, region.key);
  tile(region.x + 5, region.y + 2, ground, z, region.key);
  tile(region.x + 5, region.y + 3, ground, z, region.key);
  for (let x = 3; x <= 6; x++) tile(region.x + x, region.y + 8, ground, z, region.key);
  const bridge = { id: `bridge-${z}`, zone: z, cells: [4, 5, 6, 7].map((y) => point(region, 5, y)) };
  BRIDGES.push(bridge);
  place(region, bridge.id, 'pedestal', 4, 8, { interaction: 'puzzle' });
  place(region, `${region.key}-bridge-shard`, 'shard', 5, 2, { interaction: 'shard', puzzle: bridge.id });
  // Distinct landmarks and colour accents flank, rather than obscure, the route.
  const landmarks = [
    [['tree-oak', 17, 5], ['flowerbed', 15, 11], ['stump', 23, 17], ['flowerbed', 18, 18]],
    [['tree-willow', 17, 5], ['crystal-cluster', 15, 11], ['mushroom', 19, 18], ['lantern', 9, 10]],
    [['boat', 24, 10], ['reeds', 14, 5], ['tree-palm', 19, 18], ['dock', 23, 12]],
    [['banner', 15, 7], ['pillar', 22, 10], ['tree-pine', 18, 18], ['banner', 9, 11]],
    [['furnace', 16, 5], ['anvil', 15, 12], ['banner', 22, 10], ['rock-l', 19, 19]],
    [['bookshelf', 16, 5], ['bookshelf', 23, 10], ['pillar', 15, 11], ['lantern', 19, 18]],
    [['pillar', 16, 5], ['pillar', 22, 6], ['crystal-cluster', 15, 11], ['statue', 19, 18]],
  ][z];
  for (const [kind, x, y] of landmarks) place(region, `${region.key}-${kind}-${x}`, kind, x, y);
  for (let i = 0; i < 3; i++) {
    const [x, y] = [[18, 16], [21, 11], [13, 6]][i];
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
  { from: -1, to: 0, points: [[49, 77], [40, 77], [40, 80], [26, 80]], gate: null },
  { from: 0, to: 1, points: [[26, 79], [26, 55], [15, 55]], gate: [26, 61, 'horizontal'] },
  { from: 1, to: 2, points: [[15, 44], [23, 44], [23, 27]], gate: [23, 33, 'horizontal'] },
  { from: 2, to: 3, points: [[31, 23], [56, 23], [56, 18]], gate: [41, 23, 'vertical'] },
  { from: 3, to: 4, points: [[64, 18], [75, 18], [75, 26], [91, 26]], gate: [73, 18, 'vertical'] },
  { from: 4, to: 5, points: [[98, 26], [98, 57]], gate: [98, 38, 'horizontal'] },
  { from: 5, to: 6, points: [[96, 57], [78, 57], [78, 49], [58, 49]], gate: [80, 57, 'vertical'] },
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
