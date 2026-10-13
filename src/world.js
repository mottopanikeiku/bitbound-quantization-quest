import { drawSprite, drawNoiseSprite } from './art.js';

export const LOCATIONS = Object.freeze([
  Object.freeze({ id: 0, x: 78, y: 200 }),
  Object.freeze({ id: 1, x: 126, y: 88 }),
  Object.freeze({ id: 2, x: 222, y: 184 }),
  Object.freeze({ id: 3, x: 302, y: 76 }),
  Object.freeze({ id: 4, x: 378, y: 190 }),
  Object.freeze({ id: 5, x: 286, y: 252 }),
  Object.freeze({ id: 6, x: 422, y: 64 }),
]);

const WIDTH = 480;
const HEIGHT = 288;
const ZOOM = 2;
const VIEW_WIDTH = WIDTH / ZOOM;
const VIEW_HEIGHT = HEIGHT / ZOOM;
const WALK_SPEED = 38;
const DASH_SPEED = 60;
const KINDS = ['sprout', 'crystal', 'tide', 'moth', 'ember', 'wisp', 'dragon'];
const GUARDIANS = ['Nib', 'Chime', 'Brine', 'Spindle', 'Cinder', 'Vesper', 'Auric'];
const ZONES = ['Bitleaf Meadow', 'Offset Grove', 'Calibration Cove', 'Channel Heights', 'Inference Forge', 'Outlier Archives', 'Precision Spire'];
const GREETINGS = [
  'The garden is singing again. Take a leaf for the road!',
  'A clear note at last! The long bridge leads to Brine.',
  'Quiet water, happy tadpoles. The northern steps lead to Spindle.',
  'The stars are steady. Cinder waits across the eastern river.',
  'The forge is warm again. Vesper lives in the southern ruins.',
  'Every book has its voice. The last beacon is northeast.',
  'Seven friends, one island. There is always a place for you here.',
];
const CAMPS = [
  { kind: 'camp', id: 'shore-camp', name: 'Shore Camp', x: 60, y: 234, radius: 17 },
  { kind: 'camp', id: 'crossroads-camp', name: 'Crossroads Camp', x: 246, y: 216, radius: 17 },
  { kind: 'camp', id: 'heights-camp', name: 'Highland Camp', x: 344, y: 99, radius: 17 },
];
const PICKUPS = [
  { kind: 'pickup', id: 'cache-meadow', x: 133, y: 230, radius: 14 },
  { kind: 'pickup', id: 'cache-grove', x: 139, y: 107, radius: 14 },
  { kind: 'pickup', id: 'cache-tide', x: 246, y: 179, radius: 14 },
  { kind: 'pickup', id: 'cache-heights', x: 270, y: 108, radius: 14 },
  { kind: 'pickup', id: 'cache-forge', x: 390, y: 220, radius: 14 },
  { kind: 'pickup', id: 'cache-archive', x: 308, y: 257, radius: 14 },
  { kind: 'pickup', id: 'cache-tower', x: 438, y: 83, radius: 14 },
];
const SIGNS = [
  { kind: 'dialogue', id: 'crossroads-sign', x: 131, y: 220, radius: 14,
    text: 'North: Offset Grove. East: Calibration Cove. Gold lanterns mark your next friend.' },
];
const NOISE_SPAWNS = [
  { id: 0, x: 144, y: 218, roam: 16 }, { id: 1, x: 151, y: 115, roam: 13 },
  { id: 2, x: 245, y: 163, roam: 15 }, { id: 3, x: 318, y: 103, roam: 16 },
  { id: 4, x: 407, y: 192, roam: 16 }, { id: 5, x: 333, y: 244, roam: 14 },
  { id: 6, x: 434, y: 99, roam: 13 }, { id: 0, x: 97, y: 144, roam: 14 },
  { id: 4, x: 337, y: 224, roam: 15 },
];
const COAST = [
  [28, 162], [38, 162], [38, 132], [46, 132], [46, 106], [58, 106], [58, 70],
  [74, 70], [74, 44], [96, 44], [96, 34], [144, 34], [144, 30], [176, 30],
  [176, 42], [218, 42], [218, 34], [244, 34], [244, 22], [284, 22], [284, 16],
  [326, 16], [326, 24], [356, 24], [356, 28], [382, 28], [382, 20], [438, 20],
  [438, 30], [456, 30], [456, 52], [466, 52], [466, 100], [458, 100], [458, 118],
  [442, 118], [442, 146], [448, 146], [448, 206], [438, 206], [438, 230],
  [420, 230], [420, 246], [390, 246], [390, 264], [352, 264], [352, 276],
  [268, 276], [268, 270], [214, 270], [214, 260], [160, 260], [160, 266],
  [110, 266], [110, 258], [78, 258], [78, 248], [54, 248], [54, 232],
  [38, 232], [38, 208], [28, 208],
];
const GRASS = [
  [38, 174], [40, 174], [40, 166], [48, 166], [48, 138], [56, 138], [56, 110],
  [66, 110], [66, 78], [80, 78], [80, 52], [100, 52], [100, 42], [142, 42],
  [142, 38], [172, 38], [172, 50], [222, 50], [222, 42], [250, 42], [250, 30],
  [286, 30], [286, 24], [320, 24], [320, 32], [352, 32], [352, 36], [388, 36],
  [388, 28], [432, 28], [432, 38], [448, 38], [448, 60], [456, 60], [456, 96],
  [450, 96], [450, 112], [434, 112], [434, 150], [440, 150], [440, 202],
  [430, 202], [430, 224], [412, 224], [412, 238], [382, 238], [382, 256],
  [346, 256], [346, 268], [274, 268], [274, 262], [216, 262], [216, 252],
  [162, 252], [162, 258], [114, 258], [114, 250], [82, 250], [82, 240],
  [62, 240], [62, 224], [46, 224], [46, 200], [38, 200],
];
const POND = [
  [166, 142], [178, 142], [178, 132], [200, 132], [200, 136], [214, 136],
  [214, 148], [222, 148], [222, 170], [214, 170], [214, 182], [200, 182],
  [200, 190], [176, 190], [176, 182], [162, 182], [162, 164], [154, 164],
  [154, 148], [166, 148],
];
const RIVER = [
  [326, 114], [346, 114], [346, 122], [378, 122], [378, 132], [414, 132],
  [414, 140], [450, 140], [450, 158], [430, 158], [430, 154], [374, 154],
  [374, 146], [346, 146], [346, 134], [326, 134],
];
const ROADS = [
  { to: 2, points: [[78, 216], [118, 216], [118, 208], [174, 208], [174, 200], [206, 200]] },
  { to: 1, points: [[78, 216], [78, 160], [94, 160], [94, 120], [110, 120], [110, 104]] },
  { to: 2, points: [[110, 104], [166, 104], [166, 120], [206, 120], [206, 200]] },
  { to: 3, points: [[206, 200], [246, 200], [246, 144], [270, 144], [270, 120], [286, 120], [286, 96]] },
  { to: 6, points: [[286, 96], [334, 96], [334, 88], [382, 88], [382, 80], [406, 80]] },
  { to: 4, points: [[206, 200], [246, 200], [246, 216], [334, 216], [334, 208], [366, 208]] },
  { to: 6, points: [[366, 208], [406, 208], [406, 80]] },
  { to: 5, points: [[366, 208], [366, 240], [318, 240], [318, 256], [270, 256]] },
  { to: 5, points: [[206, 200], [230, 200], [230, 240], [254, 240], [254, 256], [270, 256]] },
];
const DIGITS = [
  ['010', '110', '010', '010', '111'], ['110', '001', '010', '100', '111'],
  ['110', '001', '010', '001', '110'], ['101', '101', '111', '001', '001'],
  ['111', '100', '110', '001', '110'], ['011', '100', '111', '101', '111'],
  ['111', '001', '010', '010', '010'],
];
const WATER_GLINTS = [
  [13, 87], [32, 54], [43, 268], [18, 237], [178, 20], [222, 13], [373, 14],
  [456, 253], [463, 194], [401, 273], [197, 278], [83, 278], [20, 133],
  [175, 151], [185, 175], [164, 165], [355, 130], [386, 140], [429, 148],
];

function surface(width = WIDTH, height = HEIGHT) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function rect(ctx, x, y, width, height, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
}

function shape(ctx, points, color, dx = 0, dy = 0) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0][0] + dx, points[0][1] + dy);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0] + dx, points[i][1] + dy);
  ctx.closePath();
  ctx.fill();
}

function coastLine(ctx, points, color, width) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.lineJoin = 'miter';
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function route(ctx, points, width, color) {
  const half = width / 2;
  for (let i = 1; i < points.length; i += 1) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    rect(ctx, Math.min(ax, bx) - half, Math.min(ay, by) - half,
      Math.abs(ax - bx) + width, Math.abs(ay - by) + width, color);
  }
}

function inside(x, y, points) {
  let yes = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [ax, ay] = points[i];
    const [bx, by] = points[j];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) yes = !yes;
  }
  return yes;
}

function nearRoad(x, y, margin) {
  for (const road of ROADS) {
    for (let i = 1; i < road.points.length; i += 1) {
      const [ax, ay] = road.points[i - 1];
      const [bx, by] = road.points[i];
      if (x >= Math.min(ax, bx) - margin && x <= Math.max(ax, bx) + margin
          && y >= Math.min(ay, by) - margin && y <= Math.max(ay, by) + margin) return true;
    }
  }
  return false;
}

function randomSource(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function flower(ctx, x, y, color, full = true) {
  rect(ctx, x, y + 1, 1, 4, '#648452');
  rect(ctx, x - 1, y + 3, 3, 1, '#769451');
  if (full) {
    rect(ctx, x - 1, y - 1, 3, 3, color);
    rect(ctx, x, y, 1, 1, '#e9c675');
  } else rect(ctx, x, y, 1, 2, '#99b373');
}

function reeds(ctx, x, y) {
  rect(ctx, x, y - 7, 1, 9, '#527d66');
  rect(ctx, x + 3, y - 5, 1, 7, '#658964');
  rect(ctx, x - 3, y - 4, 1, 6, '#759c70');
  rect(ctx, x - 1, y - 9, 2, 3, '#b9ab76');
  rect(ctx, x + 3, y - 7, 2, 3, '#ccb987');
}

function sparkle(ctx, x, y, color) {
  rect(ctx, x, y - 2, 1, 5, color);
  rect(ctx, x - 2, y, 5, 1, color);
}

function tree(ctx, style = 'oak') {
  // A stepped, layered crown, not a circle. Local canvas is 34 × 40.
  rect(ctx, 7, 35, 23, 3, '#668060');
  rect(ctx, 13, 27, 9, 10, '#53614a');
  rect(ctx, 16, 24, 4, 12, '#93794d');
  rect(ctx, 20, 29, 3, 6, '#b09a61');
  if (style === 'pine') {
    const silhouette = [[15, 1], [19, 1], [19, 5], [22, 5], [22, 9], [25, 9], [25, 13], [28, 13], [28, 18], [31, 18], [31, 23], [33, 23], [33, 28], [26, 28], [26, 31], [8, 31], [8, 28], [1, 28], [1, 23], [4, 23], [4, 18], [7, 18], [7, 13], [10, 13], [10, 9], [13, 9], [13, 5], [15, 5]];
    shape(ctx, silhouette, '#375b49');
    shape(ctx, [[15, 5], [18, 5], [18, 11], [22, 11], [22, 16], [26, 16], [26, 23], [29, 23], [29, 26], [5, 26], [5, 23], [9, 23], [9, 18], [12, 18], [12, 12], [15, 12]], '#628764');
    rect(ctx, 15, 9, 3, 6, '#a4b982');
    rect(ctx, 11, 18, 6, 2, '#8faf79');
    rect(ctx, 6, 25, 9, 2, '#8faf79');
    rect(ctx, 22, 23, 6, 2, '#486f55');
    return;
  }
  const willow = style === 'willow';
  const outline = willow ? '#456959' : '#426344';
  const mid = willow ? '#6d9b79' : '#719659';
  const light = willow ? '#a2b998' : '#a5be76';
  shape(ctx, [[12, 1], [22, 1], [22, 4], [28, 4], [28, 8], [32, 8], [32, 16], [34, 16], [34, 24], [30, 24], [30, 28], [24, 28], [24, 31], [9, 31], [9, 28], [3, 28], [3, 23], [0, 23], [0, 12], [3, 12], [3, 7], [8, 7], [8, 4], [12, 4]], outline);
  shape(ctx, [[11, 5], [23, 5], [23, 8], [28, 8], [28, 13], [30, 13], [30, 21], [25, 21], [25, 25], [15, 25], [15, 28], [8, 28], [8, 24], [3, 24], [3, 14], [6, 14], [6, 9], [11, 9]], mid);
  rect(ctx, 10, 7, 11, 3, light);
  rect(ctx, 6, 11, 9, 3, light);
  rect(ctx, 5, 15, 4, 4, light);
  rect(ctx, 20, 10, 6, 2, '#b7cc90');
  rect(ctx, 15, 18, 8, 3, '#87a865');
  rect(ctx, 21, 23, 8, 2, '#527b52');
  rect(ctx, 8, 24, 6, 2, '#8bab6d');
  if (willow) {
    rect(ctx, 2, 18, 2, 16, '#658d6b');
    rect(ctx, 6, 25, 2, 11, '#89aa80');
    rect(ctx, 28, 18, 2, 16, '#709a77');
    rect(ctx, 31, 17, 2, 12, '#93b88a');
  } else {
    rect(ctx, 12, 14, 2, 2, '#d0c181');
    rect(ctx, 24, 18, 2, 2, '#d0c181');
  }
}

function cabin(ctx, restored) {
  rect(ctx, 4, 37, 36, 4, '#6b8060');
  rect(ctx, 5, 17, 32, 20, '#74644d');
  rect(ctx, 7, 17, 28, 18, '#ddcea2');
  rect(ctx, 8, 19, 26, 2, '#e9ddb7');
  rect(ctx, 9, 26, 7, 7, '#7b9477');
  rect(ctx, 10, 27, 5, 5, restored ? '#f8daa1' : '#a9b5a0');
  rect(ctx, 12, 27, 1, 5, '#697f66');
  rect(ctx, 10, 29, 5, 1, '#697f66');
  rect(ctx, 23, 25, 9, 12, '#687455');
  rect(ctx, 25, 27, 5, 10, '#a68155');
  rect(ctx, 28, 31, 1, 1, '#f1d792');
  rect(ctx, 23, 37, 10, 2, '#ddc88f');
  shape(ctx, [[0, 17], [3, 17], [3, 13], [7, 13], [7, 9], [11, 9], [11, 5], [15, 5], [15, 2], [29, 2], [29, 6], [33, 6], [33, 10], [37, 10], [37, 14], [42, 14], [42, 19], [0, 19]], '#52654b');
  shape(ctx, [[3, 15], [7, 15], [7, 11], [11, 11], [11, 7], [15, 7], [15, 4], [27, 4], [27, 8], [31, 8], [31, 12], [35, 12], [35, 15], [39, 15], [39, 17], [3, 17]], '#a5b177');
  rect(ctx, 13, 8, 15, 2, '#c5cc91');
  rect(ctx, 8, 12, 9, 2, '#c5cc91');
  rect(ctx, 23, 12, 9, 2, '#879b61');
  rect(ctx, 5, 17, 34, 2, '#d0c791');
  rect(ctx, 31, 2, 5, 9, '#7b7c62');
  rect(ctx, 30, 1, 7, 2, '#c9b995');
  rect(ctx, 4, 31, 3, 5, '#7d8a53');
  rect(ctx, 35, 24, 2, 10, '#6a945e');
  if (restored) {
    flower(ctx, 4, 29, '#e3a0a0');
    flower(ctx, 37, 28, '#f2d99b');
    rect(ctx, 18, 21, 2, 2, '#df9e95');
    rect(ctx, 17, 23, 4, 1, '#8aab70');
  }
}

function crystals(ctx, restored) {
  const edge = restored ? '#466e70' : '#647974';
  const dark = restored ? '#6e9fa6' : '#92a69b';
  const mid = restored ? '#a6d2c7' : '#b5c3ad';
  const shine = restored ? '#e0f0d5' : '#d2d4b7';
  rect(ctx, 2, 28, 23, 4, '#789479');
  shape(ctx, [[10, 2], [14, 2], [14, 6], [18, 6], [18, 27], [15, 30], [6, 30], [6, 11], [8, 11], [8, 6], [10, 6]], edge);
  shape(ctx, [[11, 6], [13, 6], [13, 9], [15, 9], [15, 25], [12, 28], [8, 28], [8, 12], [10, 12], [10, 9], [11, 9]], mid);
  rect(ctx, 10, 12, 2, 13, shine);
  rect(ctx, 14, 13, 2, 13, dark);
  shape(ctx, [[21, 13], [24, 13], [24, 17], [27, 17], [27, 27], [23, 31], [18, 31], [18, 19], [21, 19]], edge);
  rect(ctx, 21, 19, 3, 10, dark);
  rect(ctx, 21, 17, 2, 8, mid);
  shape(ctx, [[2, 18], [5, 18], [5, 21], [8, 21], [8, 31], [2, 31], [0, 27], [0, 22], [2, 22]], edge);
  rect(ctx, 3, 22, 2, 6, mid);
  if (restored) {
    sparkle(ctx, 12, 3, '#f7edc1');
    rect(ctx, 23, 15, 1, 3, '#f5e9c9');
  }
}

function observatory(ctx, restored) {
  const stone = restored ? '#e0d5bd' : '#b2b5a4';
  rect(ctx, 5, 37, 44, 4, '#7f9287');
  rect(ctx, 7, 33, 39, 4, '#b4bbae');
  rect(ctx, 7, 17, 7, 18, '#738781');
  rect(ctx, 9, 15, 6, 19, stone);
  rect(ctx, 10, 21, 2, 10, '#f0dfbc');
  rect(ctx, 37, 14, 7, 21, '#788784');
  rect(ctx, 37, 14, 5, 20, stone);
  rect(ctx, 35, 12, 11, 4, '#c8c8b3');
  rect(ctx, 6, 13, 11, 4, '#c8c8b3');
  rect(ctx, 13, 7, 24, 6, '#82958c');
  rect(ctx, 15, 5, 21, 6, stone);
  rect(ctx, 16, 5, 19, 2, '#eadfbe');
  // The crescent is masonry: square-cut inner and outer stair-steps.
  const moon = restored ? '#f3d390' : '#b9bca9';
  rect(ctx, 22, 1, 10, 2, moon);
  rect(ctx, 19, 3, 5, 3, moon);
  rect(ctx, 18, 6, 4, 6, moon);
  rect(ctx, 20, 12, 5, 3, moon);
  rect(ctx, 24, 14, 10, 2, moon);
  rect(ctx, 32, 11, 3, 3, moon);
  rect(ctx, 29, 4, 2, 2, '#84918e');
  rect(ctx, 28, 22, 3, 10, '#6e7f7c');
  rect(ctx, 23, 31, 13, 2, '#8b978e');
  rect(ctx, 27, 20, 10, 4, '#6d8280');
  rect(ctx, 34, 17, 6, 6, '#839d98');
  rect(ctx, 39, 16, 3, 7, '#d5c8a5');
  rect(ctx, 26, 21, 2, 2, '#d6bb88');
  if (restored) {
    sparkle(ctx, 47, 8, '#f0d8a5');
    sparkle(ctx, 4, 8, '#e2d4e3');
    rect(ctx, 10, 19, 3, 10, '#b5a5c5');
    rect(ctx, 39, 18, 3, 11, '#b5a5c5');
    rect(ctx, 10, 28, 2, 3, '#e8d6aa');
    rect(ctx, 40, 28, 2, 3, '#e8d6aa');
  }
}

function tideShrine(ctx, restored) {
  rect(ctx, 1, 23, 24, 3, '#789988');
  rect(ctx, 4, 9, 4, 15, '#638b7d');
  rect(ctx, 19, 9, 4, 15, '#638b7d');
  rect(ctx, 5, 9, 2, 12, '#c4cfaa');
  rect(ctx, 20, 9, 2, 12, '#c4cfaa');
  rect(ctx, 2, 6, 23, 4, '#647e6f');
  rect(ctx, 0, 4, 27, 3, '#a2b58d');
  rect(ctx, 3, 2, 21, 3, '#b9c6a3');
  rect(ctx, 11, 9, 1, 6, '#738a76');
  rect(ctx, 10, 14, 6, 7, '#486d69');
  rect(ctx, 11, 15, 4, 4, restored ? '#e9e7b3' : '#88a89e');
  rect(ctx, 12, 20, 2, 2, '#b2ab81');
  if (restored) {
    rect(ctx, 5, 11, 2, 8, '#93c9bd');
    rect(ctx, 20, 11, 2, 8, '#93c9bd');
    rect(ctx, 6, 20, 2, 3, '#e5b3a4');
    rect(ctx, 21, 20, 2, 3, '#e5b3a4');
    sparkle(ctx, 13, 16, '#f5eabd');
  }
}

function forge(ctx, restored) {
  rect(ctx, 3, 42, 50, 3, '#877e5f');
  rect(ctx, 7, 22, 42, 20, '#685c4c');
  rect(ctx, 9, 23, 38, 17, '#a19170');
  rect(ctx, 10, 25, 36, 3, '#c1ad84');
  rect(ctx, 11, 32, 8, 2, '#7e775d');
  rect(ctx, 22, 35, 7, 2, '#7e775d');
  rect(ctx, 38, 25, 7, 2, '#7e775d');
  shape(ctx, [[1, 23], [1, 19], [5, 19], [5, 15], [9, 15], [9, 11], [14, 11], [14, 8], [43, 8], [43, 12], [48, 12], [48, 17], [53, 17], [53, 21], [56, 21], [56, 25], [1, 25]], '#725a47');
  shape(ctx, [[5, 21], [5, 18], [10, 18], [10, 14], [15, 14], [15, 11], [40, 11], [40, 15], [45, 15], [45, 19], [49, 19], [49, 22], [5, 22]], '#bf8260');
  rect(ctx, 15, 12, 22, 2, '#d6a275');
  rect(ctx, 11, 17, 31, 2, '#d6a275');
  rect(ctx, 8, 21, 40, 2, '#a76d53');
  rect(ctx, 14, 19, 2, 3, '#8e664f');
  rect(ctx, 27, 14, 2, 5, '#a26d51');
  rect(ctx, 40, 19, 2, 3, '#8e664f');
  rect(ctx, 7, 4, 10, 16, '#776e59');
  rect(ctx, 9, 6, 6, 12, '#ad9b77');
  rect(ctx, 6, 3, 12, 4, '#b9ad87');
  rect(ctx, 8, 2, 8, 2, '#5f6150');
  rect(ctx, 28, 27, 17, 15, '#6a604d');
  rect(ctx, 31, 27, 11, 3, '#c4aa7c');
  rect(ctx, 29, 30, 15, 11, '#484d40');
  rect(ctx, 32, 32, 9, 8, restored ? '#c87f4e' : '#6f7259');
  rect(ctx, 30, 40, 13, 2, '#d3b17b');
  rect(ctx, 13, 27, 10, 6, '#63715b');
  rect(ctx, 15, 28, 6, 4, restored ? '#f0c57c' : '#87977a');
  rect(ctx, 17, 28, 1, 4, '#817956');
  rect(ctx, 13, 35, 9, 2, '#526259');
  rect(ctx, 11, 33, 13, 3, '#84918a');
  rect(ctx, 15, 37, 5, 4, '#53645a');
  if (restored) {
    rect(ctx, 35, 34, 4, 6, '#edbe6b');
    rect(ctx, 34, 37, 7, 3, '#f4d492');
    rect(ctx, 36, 32, 2, 5, '#f3d492');
    rect(ctx, 35, 38, 3, 2, '#fae4af');
    rect(ctx, 19, 26, 2, 4, '#dfb66c');
    rect(ctx, 10, 8, 4, 8, '#dfab67');
    rect(ctx, 11, 9, 2, 6, '#f3d291');
    rect(ctx, 5, 0, 6, 1, '#c8c8ae');
    rect(ctx, 11, 0, 5, 2, '#d7d2b5');
  }
}

function archive(ctx, restored) {
  rect(ctx, 0, 31, 52, 4, '#667e71');
  rect(ctx, 3, 28, 46, 4, '#bcc0a3');
  rect(ctx, 6, 13, 7, 16, '#77887c');
  rect(ctx, 7, 11, 7, 18, '#c2c3aa');
  rect(ctx, 8, 15, 2, 12, '#e0d7b5');
  rect(ctx, 37, 11, 8, 18, '#a0af99');
  rect(ctx, 38, 12, 3, 16, '#e0d7b5');
  rect(ctx, 4, 9, 12, 4, '#d0ccb0');
  rect(ctx, 35, 9, 12, 4, '#d0ccb0');
  rect(ctx, 5, 27, 11, 3, '#9ca68d');
  rect(ctx, 35, 27, 12, 3, '#9ca68d');
  rect(ctx, 12, 5, 28, 5, '#879b8a');
  rect(ctx, 17, 2, 18, 5, '#b5bda3');
  rect(ctx, 20, 0, 10, 4, '#ccd0b0');
  rect(ctx, 15, 6, 23, 2, '#dcd6b7');
  rect(ctx, 21, 23, 12, 6, '#7c9084');
  rect(ctx, 19, 22, 16, 3, '#b2b99d');
  rect(ctx, 21, 18, 6, 4, '#cec8a9');
  rect(ctx, 27, 18, 6, 4, '#dad2b1');
  rect(ctx, 26, 18, 1, 4, '#8e927e');
  rect(ctx, 43, 18, 3, 9, '#6e9470');
  rect(ctx, 40, 21, 4, 2, '#9bb381');
  rect(ctx, 3, 20, 5, 3, '#8faa79');
  if (restored) {
    rect(ctx, 18, 8, 5, 11, '#9885ab');
    rect(ctx, 29, 8, 5, 11, '#9885ab');
    rect(ctx, 19, 10, 3, 6, '#c2a8cc');
    rect(ctx, 30, 10, 3, 6, '#c2a8cc');
    rect(ctx, 20, 18, 2, 2, '#e7c890');
    rect(ctx, 30, 18, 2, 2, '#e7c890');
    rect(ctx, 22, 18, 4, 3, '#f1e1ad');
    rect(ctx, 28, 18, 4, 3, '#f4e7bb');
    sparkle(ctx, 27, 15, '#f2d59a');
    flower(ctx, 2, 28, '#be9dbe');
    flower(ctx, 49, 28, '#d4b8cc');
  }
}

function tower(ctx, restored) {
  rect(ctx, 5, 47, 34, 4, '#7e987e');
  rect(ctx, 9, 28, 27, 19, '#758d77');
  rect(ctx, 11, 26, 23, 21, '#c5cdb0');
  rect(ctx, 12, 28, 4, 17, '#e2dec0');
  rect(ctx, 30, 28, 4, 18, '#a6b99d');
  rect(ctx, 13, 37, 8, 1, '#a6b89b');
  rect(ctx, 23, 32, 8, 1, '#a6b89b');
  rect(ctx, 17, 12, 13, 15, '#9fb29a');
  rect(ctx, 19, 12, 9, 13, '#d5d9b7');
  rect(ctx, 20, 17, 6, 6, '#688b79');
  rect(ctx, 22, 18, 3, 4, restored ? '#f4d898' : '#8eaca0');
  rect(ctx, 21, 35, 9, 12, '#5e7b69');
  rect(ctx, 23, 37, 5, 10, restored ? '#cbb883' : '#8ca18b');
  rect(ctx, 19, 47, 13, 2, '#e2d6b0');
  shape(ctx, [[2, 27], [2, 24], [7, 24], [7, 21], [11, 21], [11, 18], [16, 18], [16, 21], [31, 21], [31, 18], [35, 18], [35, 22], [40, 22], [40, 25], [43, 25], [43, 29], [2, 29]], '#496d59');
  rect(ctx, 8, 24, 31, 3, restored ? '#86b692' : '#7ea18a');
  rect(ctx, 13, 22, 22, 2, '#a1b99a');
  rect(ctx, 4, 28, 37, 2, restored ? '#e1c27d' : '#b0b789');
  shape(ctx, [[11, 13], [11, 10], [15, 10], [15, 7], [19, 7], [19, 4], [23, 4], [23, 1], [25, 1], [25, 5], [29, 5], [29, 8], [33, 8], [33, 11], [37, 11], [37, 14], [11, 14]], '#527860');
  rect(ctx, 17, 10, 15, 2, '#a8c49d');
  rect(ctx, 21, 7, 7, 3, restored ? '#d8cf8e' : '#99b18c');
  rect(ctx, 12, 13, 25, 2, '#c4bd85');
  if (restored) {
    rect(ctx, 24, 0, 1, 4, '#efcf82');
    rect(ctx, 25, 0, 8, 2, '#eac278');
    rect(ctx, 25, 2, 6, 1, '#cf9e57');
    rect(ctx, 10, 30, 3, 12, '#d4b36e');
    rect(ctx, 32, 30, 3, 12, '#d4b36e');
    rect(ctx, 10, 40, 2, 4, '#f0d99a');
    rect(ctx, 33, 40, 2, 4, '#f0d99a');
    sparkle(ctx, 5, 10, '#f1d795');
    sparkle(ctx, 39, 6, '#f1d795');
  }
}

/** Scrolling island simulation. The host owns input, pause state, and the single animation loop. */
export class IslandWorld {
  constructor(canvas, { onEncounter = () => {}, onInteract = () => {}, onMove = () => {} } = {}) {
    this.canvas = canvas;
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) throw new Error('Bitbound needs a browser with a 2D canvas.');
    this.ctx.imageSmoothingEnabled = false;
    this.onEncounter = onEncounter;
    this.onInteract = onInteract;
    this.onMove = onMove;
    this._position = { kind: 'player', x: 62, y: 216, depth: 216 };
    this._companion = { kind: 'companion', id: -1, x: 62, y: 216, depth: 216 };
    this._completed = new Set();
    this._collected = new Set();
    this._frontier = 0;
    this._zone = 0;
    this._destroyed = false;
    this._phase = 0;
    this._walkDistance = 0;
    this._facing = 'south';
    this._playerPose = 0;
    this._contactCooldown = 2;
    this._interactionCooldown = 0;
    this._activeEncounter = null;
    this._camera = { x: 0, y: HEIGHT - VIEW_HEIGHT };
    this._trailX = new Float32Array(128);
    this._trailY = new Float32Array(128);
    this._trailHead = 0;
    this._trailCount = 0;
    this._random = randomSource(0x501ace);
    this._props = [];
    this._pathStones = [];
    this._terrain = surface();
    this._progress = surface();
    this._markers = surface();
    this._atlas = surface(192, 288);
    this._noiseAtlas = surface(126, 36);
    this._makeTerrain();
    this._makeAtlas();
    this._enemies = NOISE_SPAWNS.map((spawn, index) => ({
      ...spawn, kind: 'noise', uid: `noise-${index}`, depth: spawn.y,
      homeX: spawn.x, homeY: spawn.y, targetX: spawn.x, targetY: spawn.y,
      turnTimer: 0, chasing: false, defeated: false,
    }));
    this._guardians = LOCATIONS.map((location) => ({
      ...location, kind: 'guardian', depth: location.y, radius: 22,
    }));
    const camps = CAMPS.map((camp) => ({ ...camp, depth: camp.y }));
    const pickups = PICKUPS.map((pickup) => ({ ...pickup, depth: pickup.y }));
    this._interactables = [...this._guardians, ...camps, ...pickups, ...SIGNS];
    this._entities = [
      ...this._props, ...this._guardians, ...camps, ...pickups,
      ...this._enemies, this._position, this._companion,
    ];
    this._media = window.matchMedia('(prefers-reduced-motion: reduce)');
    this._reducedMotion = this._media.matches;
    canvas.setAttribute('role', 'application');
    this._resetTrail();
    this.setProgress([]);
    this.render(0);
  }

  _makeAtlas() {
    const ctx = this._atlas.getContext('2d');
    for (let id = 0; id < KINDS.length; id += 1) drawSprite(ctx, KINDS[id], id * 24, 0);
    for (let pose = 0; pose < 8; pose += 1) drawSprite(ctx, 'player', 168, pose * 24, 1, pose);
    // Extend the original side portraits with two actual walking strides.
    for (let pose = 8; pose < 12; pose += 1) {
      const left = pose < 10;
      const stride = pose % 2;
      const top = pose * 24;
      drawSprite(ctx, 'player', 168, top, 1, left ? 6 : 7);
      ctx.clearRect(168, top + 20, 24, 4);
      for (const [x, y] of [[stride ? 10 : 8, 20], [stride ? 12 : 14, 21]]) {
        const legX = 168 + (left ? 24 - x - 4 : x);
        rect(ctx, legX, top + y, 3, 3, '#35433a');
        rect(ctx, legX + 1, top + y, 1, 2, '#49675a');
        rect(ctx, legX - (left ? 1 : 0), top + y + 1, 4, 2, '#35433a');
        rect(ctx, legX + (left ? 0 : 1), top + y + 1, 2, 1, '#aa8253');
      }
    }
    const noise = this._noiseAtlas.getContext('2d');
    for (let id = 0; id < KINDS.length; id += 1) {
      for (let frame = 0; frame < 2; frame += 1) drawNoiseSprite(noise, id, id * 18, frame * 18, 1, frame);
    }
  }

  _addProp(x, y, width, height, depth, paint, restoreId = -1) {
    const normal = surface(width, height);
    paint(normal.getContext('2d'), false);
    let restored = normal;
    if (restoreId !== -1) {
      restored = surface(width, height);
      paint(restored.getContext('2d'), true);
    }
    this._props.push({ x, y, depth, normal, restored, restoreId });
  }

  _makeTerrain() {
    const ctx = this._terrain.getContext('2d');
    const maskCanvas = surface();
    const mask = maskCanvas.getContext('2d', { willReadFrequently: true });
    const random = randomSource(0xb17b0a);
    rect(ctx, 0, 0, WIDTH, HEIGHT, '#70999a');
    // Long broken current lines give the sea scale without resembling a repeated tile grid.
    for (let i = 0; i < 140; i += 1) {
      const x = Math.floor(random() * WIDTH);
      const y = Math.floor(random() * HEIGHT);
      rect(ctx, x, y, 5 + Math.floor(random() * 14), 1, i % 3 === 0 ? '#8aafaa' : '#789f9e');
    }
    coastLine(ctx, COAST, '#64908f', 22);
    coastLine(ctx, COAST, '#9ebeb0', 14);
    shape(ctx, COAST, '#537f7c', 2, 5);
    shape(ctx, COAST, '#cfbd8f');
    coastLine(ctx, COAST, '#e0d0a5', 2);
    shape(ctx, GRASS, '#7d9c68', 0, 3);
    shape(ctx, GRASS, '#9cb878');
    shape(mask, COAST, '#ffffff');
    shape(ctx, [[60, 110], [80, 110], [80, 58], [104, 58], [104, 43], [168, 43], [168, 54], [217, 54], [217, 94], [192, 94], [192, 114], [148, 114], [148, 150], [100, 150], [100, 164], [63, 164]], '#8daa70');
    shape(ctx, [[92, 72], [104, 72], [104, 61], [139, 61], [139, 67], [155, 67], [155, 91], [165, 91], [165, 105], [122, 105], [122, 111], [91, 111]], '#9ab6a0');
    shape(ctx, [[48, 179], [73, 179], [73, 171], [107, 171], [107, 181], [142, 181], [142, 201], [163, 201], [163, 224], [143, 224], [143, 242], [94, 242], [94, 235], [62, 235], [62, 221], [48, 221]], '#aec284');
    shape(ctx, [[254, 44], [270, 44], [270, 32], [310, 32], [310, 40], [330, 40], [330, 81], [322, 81], [322, 93], [265, 93], [265, 85], [254, 85]], '#81978c', 0, 5);
    shape(ctx, [[254, 44], [270, 44], [270, 32], [310, 32], [310, 40], [330, 40], [330, 81], [322, 81], [322, 89], [265, 89], [265, 81], [254, 81]], '#b5bdb0');
    rect(ctx, 259, 49, 2, 24, '#ccd0bb');
    rect(ctx, 268, 87, 51, 2, '#cbd0b9');
    for (let i = 0; i < 6; i += 1) rect(ctx, 278 + i * 7, 90, 3, 4, '#71897d');
    shape(ctx, [[337, 158], [350, 158], [350, 150], [386, 150], [386, 162], [397, 162], [397, 199], [389, 199], [389, 212], [348, 212], [348, 202], [333, 202], [333, 178], [337, 178]], '#b6ac7c');
    shape(ctx, [[260, 218], [279, 218], [279, 209], [299, 209], [299, 218], [313, 218], [313, 251], [324, 251], [324, 267], [278, 267], [278, 261], [260, 261]], '#98aa8d');
    shape(ctx, [[395, 37], [411, 37], [411, 31], [435, 31], [435, 49], [445, 49], [445, 79], [432, 79], [432, 95], [397, 95], [397, 77], [388, 77], [388, 48], [395, 48]], '#b0c194');
    // Small, deterministic tufts follow the landscape rather than a visible tile lattice.
    for (let i = 0; i < 1900; i += 1) {
      const x = 35 + Math.floor(random() * 415);
      const y = 29 + Math.floor(random() * 239);
      if (!inside(x, y, GRASS) || nearRoad(x, y, 9)) continue;
      const color = i % 3 === 0 ? '#a9bf85' : i % 3 === 1 ? '#8eaa71' : '#91ae75';
      rect(ctx, x, y, i % 4 === 0 ? 2 : 1, 1, color);
      if (i % 11 === 0) {
        rect(ctx, x, y - 2, 1, 2, '#78995e');
        rect(ctx, x + 2, y - 1, 1, 1, '#78995e');
      }
    }
    // The west pool and the east estuary are genuinely impassable except at their bridges.
    coastLine(ctx, POND, '#779768', 6);
    shape(ctx, POND, '#648e87');
    coastLine(ctx, POND, '#adc19b', 2);
    shape(ctx, [[170, 149], [182, 149], [182, 142], [201, 142], [201, 152], [214, 152], [214, 169], [203, 169], [203, 179], [178, 179], [178, 173], [166, 173], [166, 159], [170, 159]], '#81aaa0');
    shape(mask, POND, '#000000');
    coastLine(ctx, RIVER, '#849d77', 4);
    shape(ctx, RIVER, '#699a98');
    shape(mask, RIVER, '#000000');
    rect(ctx, 328, 117, 15, 3, '#bad3bd');
    rect(ctx, 330, 120, 11, 12, '#99c2b3');
    rect(ctx, 333, 119, 2, 15, '#d1dfc6');
    rect(ctx, 338, 120, 2, 13, '#b5d4c0');
    rect(ctx, 328, 133, 18, 2, '#b9d6bf');
    rect(ctx, 382, 135, 11, 1, '#a2c6b2');
    rect(ctx, 420, 145, 14, 1, '#a2c6b2');
    for (const road of ROADS) route(ctx, road.points, 16, '#91a172');
    for (const road of ROADS) route(ctx, road.points, 14, '#bcad7b');
    for (const road of ROADS) {
      route(ctx, road.points, 10, '#ddca96');
      // Ten clear pixels allow the full collision footprint through every connected junction.
      route(mask, road.points, 10, '#ffffff');
      for (let i = 1; i < road.points.length; i += 1) {
        const [ax, ay] = road.points[i - 1];
        const [bx, by] = road.points[i];
        const length = Math.abs(ax - bx) + Math.abs(ay - by);
        const dx = Math.sign(bx - ax);
        const dy = Math.sign(by - ay);
        for (let distance = 8; distance < length; distance += 16) {
          const x = ax + dx * distance;
          const y = ay + dy * distance;
          rect(ctx, x - 2, y - 2, 3, 1, '#efddb0');
          rect(ctx, x + 1, y + 2, 2, 1, '#bfad7d');
          this._pathStones.push({ x, y, to: road.to });
        }
      }
    }
    // Stair treads on the heights; both bridges are twelve-pixel-wide safe passages.
    for (let y = 82; y < 96; y += 3) {
      rect(ctx, 280, y, 30, 2, '#cbd0b5');
      rect(ctx, 281, y + 2, 28, 1, '#8c9b86');
    }
    for (const [x, y, height] of [[198, 128, 68], [398, 126, 40]]) {
      rect(ctx, x - 2, y, 20, height, '#5d7560');
      rect(ctx, x, y, 16, height, '#bca579');
      for (let plank = y + 2; plank < y + height; plank += 4) {
        rect(ctx, x + 1, plank, 14, 1, '#dfc698');
        rect(ctx, x + 1, plank + 1, 14, 1, '#958967');
      }
      rect(ctx, x - 1, y, 2, height, '#737450');
      rect(ctx, x + 15, y, 2, height, '#737450');
      for (let post = y; post < y + height; post += 12) {
        rect(ctx, x - 2, post, 3, 3, '#e2cf9f');
        rect(ctx, x + 15, post, 3, 3, '#e2cf9f');
      }
      rect(mask, x + 2, y, 12, height, '#ffffff');
      rect(mask, x - 2, y, 3, height, '#000000');
      rect(mask, x + 15, y, 3, height, '#000000');
    }
    for (const [x, y] of [[159, 148], [160, 176], [176, 188], [193, 135], [216, 149], [218, 175], [348, 124], [378, 153], [426, 160], [441, 144]]) reeds(ctx, x, y);
    for (const [x, y] of [[176, 159], [187, 145], [182, 181]]) {
      rect(ctx, x - 3, y, 7, 3, '#527e65');
      rect(ctx, x - 2, y - 1, 5, 2, '#95b680');
      rect(ctx, x + 1, y, 1, 2, '#739d74');
    }
    // A tiny hand-built mooring and skiff introduce the island's starting shore.
    rect(ctx, 27, 215, 22, 3, '#7e7a58');
    rect(ctx, 29, 213, 19, 2, '#c6b487');
    for (let x = 30; x < 47; x += 4) rect(ctx, x, 213, 1, 3, '#a18e67');
    rect(ctx, 25, 211, 3, 8, '#d1bd90');
    rect(ctx, 37, 214, 3, 7, '#d1bd90');
    shape(ctx, [[10, 218], [13, 218], [13, 215], [22, 215], [22, 218], [25, 218], [25, 224], [22, 224], [22, 227], [13, 227], [13, 224], [10, 224]], '#49695f');
    rect(ctx, 13, 218, 9, 6, '#b99565');
    rect(ctx, 15, 219, 5, 4, '#687965');
    rect(ctx, 12, 220, 11, 1, '#d6b982');
    rect(ctx, 17, 214, 1, 11, '#d9c999');
    // Raised meadow beds remain seedlings until Nib is befriended.
    for (const [x, y] of [[134, 181], [141, 193], [113, 230]]) {
      rect(ctx, x - 2, y - 1, 12, 8, '#8e8e5f');
      rect(ctx, x - 1, y, 10, 5, '#b6ab79');
      flower(ctx, x + 1, y + 1, '#d9ac98', false);
      flower(ctx, x + 6, y + 2, '#e7d39b', false);
    }
    for (let i = 0; i < 65; i += 1) {
      const x = 50 + Math.floor(random() * 377);
      const y = 62 + Math.floor(random() * 185);
      if (!inside(x, y, GRASS) || inside(x, y, POND) || inside(x, y, RIVER) || nearRoad(x, y, 11)) continue;
      if (i % 3 === 0) flower(ctx, x, y, ['#e3c589', '#dba297', '#d7d6a5'][Math.floor(i / 3) % 3]);
      else {
        rect(ctx, x, y, 4, 2, '#869975');
        rect(ctx, x + 1, y - 1, 3, 1, '#c0c5a0');
      }
    }
    // Ruin paving, the tower forecourt, and a trail sign are small pieces of environmental storytelling.
    for (const [x, y, width] of [[266, 249, 8], [278, 253, 6], [294, 251, 7], [302, 257, 5], [412, 68, 8], [423, 73, 7], [431, 69, 6]]) {
      rect(ctx, x, y, width, 3, '#8da18a');
      rect(ctx, x, y, width - 1, 1, '#ccd0ae');
    }
    rect(ctx, 130, 215, 2, 8, '#8a7952');
    rect(ctx, 126, 214, 10, 4, '#a38c5e');
    rect(ctx, 128, 215, 6, 1, '#dfc793');
    rect(ctx, 134, 215, 3, 2, '#b69c69');
    this._addProp(91, 164, 43, 43, 201, cabin, 0);
    rect(mask, 96, 182, 31, 19, '#000000');
    this._addProp(91, 58, 28, 34, 90, crystals, 1);
    this._addProp(142, 53, 28, 34, 85, crystals, 1);
    rect(mask, 97, 81, 19, 10, '#000000');
    rect(mask, 148, 76, 19, 10, '#000000');
    this._addProp(267, 29, 54, 43, 69, observatory, 3);
    rect(mask, 274, 50, 8, 15, '#000000');
    rect(mask, 304, 45, 8, 14, '#000000');
    this._addProp(219, 153, 28, 28, 178, tideShrine, 2);
    rect(mask, 223, 162, 4, 15, '#000000');
    rect(mask, 238, 162, 4, 15, '#000000');
    this._addProp(337, 145, 57, 46, 187, forge, 4);
    rect(mask, 344, 168, 40, 19, '#000000');
    this._addProp(261, 213, 53, 37, 247, archive, 5);
    rect(mask, 267, 226, 8, 17, '#000000');
    rect(mask, 298, 225, 9, 18, '#000000');
    rect(mask, 281, 236, 13, 6, '#000000');
    this._addProp(401, 13, 44, 53, 62, tower, 6);
    rect(mask, 410, 30, 27, 29, '#000000');
    const trees = [
      [66, 126, 'oak'], [87, 64, 'pine'], [114, 53, 'pine'], [171, 77, 'oak'],
      [196, 78, 'oak'], [229, 70, 'oak'], [239, 104, 'pine'], [53, 191, 'willow'],
      [95, 244, 'oak'], [150, 244, 'oak'], [196, 245, 'pine'], [343, 65, 'pine'],
      [367, 62, 'pine'], [434, 110, 'oak'], [430, 194, 'willow'], [390, 238, 'pine'],
      [52, 153, 'pine'], [140, 157, 'oak'], [124, 138, 'oak'], [319, 179, 'pine'],
      [282, 181, 'willow'], [352, 260, 'oak'],
    ];
    for (const [x, y, style] of trees) {
      this._addProp(x - 17, y - 37, 34, 40, y, (treeCtx) => tree(treeCtx, style));
      rect(mask, x - 3, y - 5, 7, 7, '#000000');
    }
    const pixels = mask.getImageData(0, 0, WIDTH, HEIGHT).data;
    const clear = new Uint8Array(WIDTH * HEIGHT);
    for (let y = 3; y < HEIGHT - 3; y += 1) {
      for (let x = 4; x < WIDTH - 4; x += 1) {
        const index = y * WIDTH + x;
        clear[index] = pixels[index * 4] > 127
          && pixels[((y - 2) * WIDTH + x - 3) * 4] > 127
          && pixels[((y - 2) * WIDTH + x + 3) * 4] > 127
          && pixels[((y + 2) * WIDTH + x - 3) * 4] > 127
          && pixels[((y + 2) * WIDTH + x + 3) * 4] > 127 ? 1 : 0;
      }
    }
    // Only connected, foot-sized ground is valid for movement or save restoration.
    // Both hand-built bridges join the same road network; water never becomes a shortcut.
    this._walkable = new Uint8Array(WIDTH * HEIGHT);
    const queue = new Int32Array(WIDTH * HEIGHT);
    const start = 216 * WIDTH + 62;
    let first = 0;
    let last = 1;
    queue[0] = start;
    this._walkable[start] = 1;
    const neighbors = [-1, 1, -WIDTH, WIDTH];
    while (first < last) {
      const index = queue[first++];
      for (const offset of neighbors) {
        const next = index + offset;
        if (clear[next] && !this._walkable[next]) {
          this._walkable[next] = 1;
          queue[last++] = next;
        }
      }
    }
  }

  _makeProgress() {
    const floor = this._progress.getContext('2d');
    const markers = this._markers.getContext('2d');
    floor.clearRect(0, 0, WIDTH, HEIGHT);
    markers.clearRect(0, 0, WIDTH, HEIGHT);
    for (const stone of this._pathStones) {
      if (stone.to > this._frontier) continue;
      rect(floor, stone.x - 2, stone.y - 2, 3, 1,
        this._completed.has(stone.to) ? '#8aa77c' : '#f2dda3');
      if (stone.to === this._frontier) rect(floor, stone.x - 1, stone.y, 2, 1, '#e7bb6f');
    }
    for (const location of LOCATIONS) {
      const { id, x, y } = location;
      const complete = this._completed.has(id);
      const frontier = id === this._frontier;
      const unlocked = id <= this._frontier;
      // Chamfered flagstones anchor the creatures without a generic selection circle.
      const paving = complete ? '#8eae83' : frontier ? '#c1b276' : '#92a58a';
      rect(floor, x - 9, y - 3, 18, 5, '#718b6d');
      rect(floor, x - 7, y - 5, 14, 8, paving);
      rect(floor, x - 5, y + 2, 10, 2, complete ? '#bbd0a0' : '#c7c69e');
      rect(floor, x - 6, y - 2, 12, 3, '#738d6e');
      if (frontier) {
        // A quiet, permanent gold beacon, never a flashing locked node.
        rect(markers, x - 19, y - 20, 2, 22, '#817e51');
        rect(markers, x - 21, y - 23, 6, 6, '#7c754c');
        rect(markers, x - 20, y - 24, 4, 6, '#f1d489');
        rect(markers, x - 19, y - 23, 2, 3, '#fff0be');
        rect(floor, x - 22, y + 1, 8, 2, '#c2b47b');
        sparkle(markers, x + 18, y - 14, '#f6df9c');
      }
      const bx = x + 8;
      const by = y - 26;
      rect(markers, bx + 1, by, 9, 12, '#40564a');
      rect(markers, bx, by + 1, 11, 9, '#40564a');
      rect(markers, bx + 1, by + 1, 9, 9, complete ? '#c0d59d' : frontier ? '#edca80' : '#b3bba6');
      if (complete) {
        rect(markers, bx + 2, by + 5, 2, 2, '#456950');
        rect(markers, bx + 4, by + 7, 2, 2, '#456950');
        rect(markers, bx + 5, by + 5, 2, 2, '#456950');
        rect(markers, bx + 7, by + 3, 2, 2, '#456950');
      } else if (!unlocked) {
        rect(markers, bx + 3, by + 2, 5, 4, '#5d7166');
        rect(markers, bx + 4, by + 3, 3, 3, '#b3bba6');
        rect(markers, bx + 2, by + 5, 7, 4, '#5d7166');
        rect(markers, bx + 5, by + 6, 1, 2, '#d6d9be');
      } else {
        const digit = DIGITS[id];
        for (let row = 0; row < digit.length; row += 1) {
          for (let col = 0; col < digit[row].length; col += 1) {
            if (digit[row][col] === '1') rect(markers, bx + 4 + col, by + 3 + row, 1, 1, '#5a6345');
          }
        }
      }
    }
    // Each friendship permanently restores something specific to its biome.
    if (this._completed.has(0)) {
      for (const [x, y, color] of [[135, 181, '#e4a3a0'], [141, 184, '#edcd95'], [143, 193, '#e3a6a4'], [148, 195, '#f3d6a3'], [115, 231, '#f1d7a2'], [120, 231, '#d9a1a0'], [61, 204, '#f0d6a1'], [95, 225, '#e4aa9b'], [102, 228, '#eedca8']]) flower(floor, x, y, color);
      rect(floor, 130, 176, 2, 7, '#739767');
      rect(floor, 129, 175, 4, 2, '#d7b199');
    }
    if (this._completed.has(1)) {
      for (const [x, y] of [[103, 91], [148, 91], [136, 69]]) {
        rect(floor, x - 4, y, 9, 2, '#b5d0ad');
        sparkle(markers, x, y - 8, '#d6e8c3');
      }
    }
    if (this._completed.has(2)) {
      for (const [x, y] of [[176, 159], [187, 145], [182, 181]]) {
        rect(floor, x - 1, y - 3, 3, 3, '#eab7ae');
        rect(floor, x, y - 2, 1, 1, '#f3dfb0');
      }
      for (let y = 138; y < 190; y += 12) {
        rect(floor, 198, y, 2, 6, '#a9cead');
        rect(floor, 215, y, 2, 5, '#a9cead');
        rect(floor, 198, y, 2, 2, '#ebbdad');
        rect(floor, 215, y, 2, 2, '#ebbdad');
      }
    }
    if (this._completed.has(3)) {
      for (const [x, y] of [[263, 79], [316, 84], [297, 43]]) sparkle(markers, x, y, '#ead8b8');
      rect(floor, 280, 82, 30, 1, '#efe0b1');
      flower(floor, 269, 85, '#c5aecb');
      flower(floor, 322, 87, '#dfc5d6');
    }
    if (this._completed.has(4)) {
      rect(floor, 367, 187, 16, 5, '#c6af77');
      rect(floor, 370, 188, 10, 2, '#ddbf7f');
      rect(markers, 332, 192, 2, 9, '#807852');
      rect(markers, 331, 190, 4, 4, '#e7b975');
      rect(markers, 332, 190, 2, 2, '#f3dda1');
    }
    if (this._completed.has(5)) {
      for (const [x, y] of [[263, 252], [304, 256], [296, 265], [279, 264]]) flower(floor, x, y, '#c7a8c2');
      rect(floor, 281, 248, 15, 2, '#d9cca8');
      sparkle(markers, 310, 225, '#dcc6d9');
    }
    if (this._completed.has(6)) {
      for (const [x, y] of [[402, 71], [433, 76], [443, 59]]) sparkle(markers, x, y, '#eddda9');
      rect(floor, 414, 68, 17, 2, '#d6c786');
      flower(floor, 438, 77, '#edd6a1');
      flower(floor, 396, 70, '#e4bba0');
    }
  }

  /** Advance gameplay in seconds; omitting this call pauses every actor and cooldown. */
  update(dt, input = {}) {
    if (this._destroyed || this._activeEncounter || !Number.isFinite(dt) || dt <= 0) return;
    const elapsed = Math.min(dt, 0.05);
    this._reducedMotion = this._media.matches;
    this._contactCooldown = Math.max(0, this._contactCooldown - elapsed);
    this._interactionCooldown = Math.max(0, this._interactionCooldown - elapsed);
    let dx = Number.isFinite(input.x) ? Math.max(-1, Math.min(1, input.x)) : 0;
    let dy = Number.isFinite(input.y) ? Math.max(-1, Math.min(1, input.y)) : 0;
    const magnitude = Math.hypot(dx, dy);
    if (magnitude > 1) {
      dx /= magnitude;
      dy /= magnitude;
    }
    if (dx || dy) {
      this._facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'west' : 'east') : (dy < 0 ? 'north' : 'south');
    }
    const speed = input.dash ? DASH_SPEED : WALK_SPEED;
    const distance = this._moveActor(this._position, dx * speed * elapsed, dy * speed * elapsed, true);
    this._walkDistance += distance;
    const step = Math.floor(this._walkDistance / 4) % 2;
    if (this._facing === 'west') this._playerPose = distance ? 8 + step : 6;
    else if (this._facing === 'east') this._playerPose = distance ? 10 + step : 7;
    else if (this._facing === 'north') this._playerPose = distance ? 4 + step : 3;
    else this._playerPose = distance ? 1 + step : 0;
    this._updateCompanion();
    this._updateZone();
    this._updateCamera(elapsed);
    if (distance) this.onMove(this.getPosition());
    this._updateEnemies(elapsed);
  }

  _canStand(x, y) {
    const px = Math.round(x);
    const py = Math.round(y);
    return px >= 4 && px < WIDTH - 4 && py >= 3 && py < HEIGHT - 3
      && this._walkable[py * WIDTH + px] === 1;
  }

  _moveActor(actor, dx, dy, recordTrail = false) {
    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)));
    if (!steps) return 0;
    const startX = actor.x;
    const startY = actor.y;
    const stepX = dx / steps;
    const stepY = dy / steps;
    // Subpixel axis steps prevent tunneling and let a traveler slide along a wall.
    for (let step = 0; step < steps; step += 1) {
      if (stepX && this._canStand(actor.x + stepX, actor.y)) {
        actor.x += stepX;
        if (recordTrail) this._recordTrail();
      }
      if (stepY && this._canStand(actor.x, actor.y + stepY)) {
        actor.y += stepY;
        if (recordTrail) this._recordTrail();
      }
    }
    actor.depth = actor.y;
    return Math.hypot(actor.x - startX, actor.y - startY);
  }

  _resetTrail() {
    this._trailHead = 0;
    this._trailCount = 1;
    this._trailX[0] = this._position.x;
    this._trailY[0] = this._position.y;
    this._companion.x = this._position.x;
    this._companion.y = this._position.y;
    this._companion.depth = this._position.y;
  }

  _recordTrail() {
    const { x, y } = this._position;
    if (Math.hypot(x - this._trailX[this._trailHead], y - this._trailY[this._trailHead]) < 0.5) return;
    this._trailHead = (this._trailHead + 1) % this._trailX.length;
    this._trailX[this._trailHead] = x;
    this._trailY[this._trailHead] = y;
    this._trailCount = Math.min(this._trailCount + 1, this._trailX.length);
  }

  _updateCompanion() {
    if (this._companion.id === -1) return;
    let x = this._position.x;
    let y = this._position.y;
    let remaining = 14;
    // Follow the actual foot trail, including bridge turns, rather than cutting across water.
    for (let offset = 0; offset < this._trailCount; offset += 1) {
      const index = (this._trailHead - offset + this._trailX.length) % this._trailX.length;
      const previousX = this._trailX[index];
      const previousY = this._trailY[index];
      const segment = Math.hypot(previousX - x, previousY - y);
      if (segment >= remaining) {
        const ratio = remaining / segment;
        const nextX = x + (previousX - x) * ratio;
        const nextY = y + (previousY - y) * ratio;
        if (this._canStand(nextX, nextY)) {
          x = nextX;
          y = nextY;
        } else {
          x = previousX;
          y = previousY;
        }
        break;
      }
      remaining -= segment;
      x = previousX;
      y = previousY;
    }
    this._companion.x = x;
    this._companion.y = y;
    this._companion.depth = y;
  }

  _isProtected(x, y) {
    for (const camp of CAMPS) {
      if ((x - camp.x) ** 2 + (y - camp.y) ** 2 < 20 ** 2) return true;
    }
    for (const location of LOCATIONS) {
      if ((x - location.x) ** 2 + (y - location.y) ** 2 < 16 ** 2) return true;
    }
    return false;
  }

  _choosePatrol(enemy) {
    enemy.targetX = enemy.homeX;
    enemy.targetY = enemy.homeY;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const angle = this._random() * Math.PI * 2;
      const radius = enemy.roam * (0.4 + this._random() * 0.6);
      const x = enemy.homeX + Math.cos(angle) * radius;
      const y = enemy.homeY + Math.sin(angle) * radius;
      if (this._canStand(x, y) && !this._isProtected(x, y)) {
        enemy.targetX = x;
        enemy.targetY = y;
        break;
      }
    }
    enemy.turnTimer = 1.5 + this._random() * 2.5;
  }

  _updateEnemies(dt) {
    const player = this._position;
    const protectedPlayer = this._isProtected(player.x, player.y);
    for (const enemy of this._enemies) {
      if (enemy.defeated) continue;
      const distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
      enemy.chasing = !protectedPlayer && this._contactCooldown === 0 && distance < 29
        && Math.hypot(player.x - enemy.homeX, player.y - enemy.homeY) < 45;
      enemy.turnTimer -= dt;
      if (!enemy.chasing && (enemy.turnTimer <= 0
          || Math.hypot(enemy.targetX - enemy.x, enemy.targetY - enemy.y) < 1)) this._choosePatrol(enemy);
      const targetX = enemy.chasing ? player.x : enemy.targetX;
      const targetY = enemy.chasing ? player.y : enemy.targetY;
      const dx = targetX - enemy.x;
      const dy = targetY - enemy.y;
      const length = Math.hypot(dx, dy);
      if (length > 0.01) {
        // Even a walking hero outruns noise; sprinting is for choosing one's battles.
        const travel = Math.min(length, (enemy.chasing ? 23 : 11) * dt);
        const moved = this._moveActor(enemy, dx / length * travel, dy / length * travel);
        if (moved < travel * 0.25) enemy.turnTimer = 0;
      }
      if (!protectedPlayer && this._contactCooldown === 0
          && Math.hypot(player.x - enemy.x, player.y - enemy.y) < 8) {
        this._activeEncounter = enemy.uid;
        this.onEncounter({ id: enemy.id, boss: false, uid: enemy.uid });
        return;
      }
    }
  }

  _updateCamera(dt, snap = false) {
    const targetX = Math.max(0, Math.min(WIDTH - VIEW_WIDTH, this._position.x - VIEW_WIDTH / 2));
    const targetY = Math.max(0, Math.min(HEIGHT - VIEW_HEIGHT, this._position.y - VIEW_HEIGHT / 2));
    const blend = snap || this._reducedMotion ? 1 : 1 - Math.exp(-12 * dt);
    this._camera.x += (targetX - this._camera.x) * blend;
    this._camera.y += (targetY - this._camera.y) * blend;
  }

  _updateZone() {
    let distance = Infinity;
    for (const location of LOCATIONS) {
      const squared = (location.x - this._position.x) ** 2 + (location.y - this._position.y) ** 2;
      if (squared < distance) {
        distance = squared;
        this._zone = location.id;
      }
    }
  }

  _findInteraction() {
    let nearest = null;
    let distance = Infinity;
    for (const target of this._interactables) {
      if (target.kind === 'pickup' && this._collected.has(target.id)) continue;
      const squared = (target.x - this._position.x) ** 2 + (target.y - this._position.y) ** 2;
      if (squared <= target.radius ** 2 && squared < distance) {
        nearest = target;
        distance = squared;
      }
    }
    return nearest;
  }

  /** Call on the host's E/Enter/Space press, not while the key is held. */
  interact() {
    if (this._destroyed || this._activeEncounter || this._interactionCooldown > 0) return false;
    const target = this._findInteraction();
    if (!target) return false;
    this._interactionCooldown = 0.25;
    if (target.kind === 'guardian') {
      if (this._completed.has(target.id)) {
        this.onInteract({ kind: 'dialogue', id: target.id, text: `${GUARDIANS[target.id]}: ${GREETINGS[target.id]}` });
      } else if (target.id !== this._frontier) {
        this.onInteract({
          kind: 'dialogue', id: target.id,
          text: `${GUARDIANS[target.id]}: Find ${GUARDIANS[this._frontier]} first. Follow the gold lantern.`,
        });
      } else {
        const uid = `guardian-${target.id}`;
        this._activeEncounter = uid;
        this.onEncounter({ id: target.id, boss: true, uid });
      }
    } else if (target.kind === 'camp') {
      this._contactCooldown = 3;
      this.onInteract({ kind: 'camp', id: target.id, text: `${target.name}: a warm fire and a moment to breathe.` });
    } else if (target.kind === 'pickup') {
      this._collected.add(target.id);
      this.onInteract({ kind: 'pickup', id: target.id, text: 'A snack tucked inside a leaf-wrapped trail cache.' });
    } else {
      this.onInteract({ kind: 'dialogue', id: target.id, text: target.text });
    }
    return true;
  }

  /** Battle settlement: progress/rewards remain host-owned; contact gets a grace period. */
  finishEncounter(uid, won) {
    if (this._destroyed) return;
    const enemy = this._enemies.find((creature) => creature.uid === uid);
    if (enemy) {
      enemy.chasing = false;
      if (won) enemy.defeated = true;
      else {
        enemy.x = enemy.homeX;
        enemy.y = enemy.homeY;
        enemy.depth = enemy.y;
        enemy.targetX = enemy.homeX;
        enemy.targetY = enemy.homeY;
        enemy.turnTimer = 1;
      }
    }
    if (this._activeEncounter === uid) this._activeEncounter = null;
    this._contactCooldown = 3;
    this._interactionCooldown = 0.25;
  }

  /** Draw only; actor movement never depends on rendering or motion preferences. */
  render(time = 0) {
    if (this._destroyed) return;
    this._reducedMotion = this._media.matches;
    this._phase = this._reducedMotion ? 0 : Math.floor(time / 180) % 8;
    const ctx = this.ctx;
    const cameraX = Math.round(this._camera.x * ZOOM) / ZOOM;
    const cameraY = Math.round(this._camera.y * ZOOM) / ZOOM;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.save();
    ctx.scale(ZOOM, ZOOM);
    ctx.translate(-cameraX, -cameraY);
    ctx.drawImage(this._terrain, 0, 0);
    ctx.drawImage(this._progress, 0, 0);
    const shift = this._reducedMotion ? 0 : this._phase % 3;
    for (let i = 0; i < WATER_GLINTS.length; i += 1) {
      const [x, y] = WATER_GLINTS[i];
      rect(ctx, x + (i % 2 === 0 ? shift : -shift), y, 5, 1, '#b0cbc0');
      rect(ctx, x + 2 + (i % 2 === 0 ? shift : -shift), y + 1, 6, 1, '#8db5aa');
    }
    this._entities.sort((a, b) => a.depth - b.depth);
    for (const entity of this._entities) {
      if (entity.kind === 'player') this._drawPlayer();
      else if (entity.kind === 'guardian') this._drawGuardian(entity);
      else if (entity.kind === 'companion') this._drawCompanion();
      else if (entity.kind === 'noise') this._drawNoise(entity);
      else if (entity.kind === 'camp') this._drawCamp(entity);
      else if (entity.kind === 'pickup') this._drawPickup(entity);
      else ctx.drawImage(this._completed.has(entity.restoreId) ? entity.restored : entity.normal, entity.x, entity.y);
    }
    ctx.drawImage(this._markers, 0, 0);
    ctx.restore();
  }

  _drawPlayer() {
    const x = Math.round(this._position.x);
    const y = Math.round(this._position.y);
    rect(this.ctx, x - 5, y - 2, 11, 3, '#678365');
    rect(this.ctx, x - 7, y - 1, 15, 1, '#78936c');
    this.ctx.drawImage(this._atlas, 168, this._playerPose * 24, 24, 24, x - 12, y - 24, 24, 24);
    if (this._contactCooldown > 0) {
      // A steady shield, not a flashing invulnerability effect.
      shape(this.ctx, [[x + 9, y - 21], [x + 15, y - 21], [x + 15, y - 16], [x + 12, y - 13], [x + 9, y - 16]], '#e4edc6');
      rect(this.ctx, x + 11, y - 19, 2, 4, '#79a39b');
    }
  }

  _drawGuardian(guardian) {
    const { id, x, y } = guardian;
    const awake = id <= this._frontier || this._completed.has(id);
    const bob = !this._reducedMotion && awake && (this._phase + id) % 8 < 3 ? -1 : 0;
    rect(this.ctx, x - 7, y - 2, 14, 3, '#708a70');
    this.ctx.globalAlpha = awake ? 1 : 0.78;
    this.ctx.drawImage(this._atlas, id * 24, 0, 24, 24, x - 12, y - 24 + bob, 24, 24);
    this.ctx.globalAlpha = 1;
  }

  _drawCompanion() {
    if (this._companion.id === -1) return;
    const x = Math.round(this._companion.x);
    const y = Math.round(this._companion.y);
    const bob = !this._reducedMotion && this._phase % 4 < 2 ? -1 : 0;
    rect(this.ctx, x - 4, y - 1, 9, 2, '#7b956f');
    this.ctx.drawImage(this._atlas, this._companion.id * 24, 0, 24, 24, x - 8, y - 16 + bob, 16, 16);
  }

  _drawNoise(enemy) {
    if (enemy.defeated) return;
    const x = Math.round(enemy.x);
    const y = Math.round(enemy.y);
    const frame = this._reducedMotion ? 0 : this._phase % 2;
    rect(this.ctx, x - 6, y - 1, 13, 2, '#777b7f');
    this.ctx.drawImage(this._noiseAtlas, enemy.id * 18, frame * 18, 18, 18, x - 9, y - 18, 18, 18);
    if (enemy.chasing) {
      rect(this.ctx, x - 1, y - 25, 3, 5, '#f5d1a1');
      rect(this.ctx, x, y - 24, 1, 3, '#9c524d');
      rect(this.ctx, x, y - 19, 1, 1, '#9c524d');
    }
  }

  _drawCamp(camp) {
    const { x, y } = camp;
    const flame = this._reducedMotion ? 0 : this._phase % 2;
    rect(this.ctx, x - 8, y - 1, 16, 3, '#7f8767');
    rect(this.ctx, x - 6, y - 2, 12, 3, '#61766c');
    rect(this.ctx, x - 5, y - 1, 10, 2, '#bcad87');
    rect(this.ctx, x - 5, y - 3, 11, 2, '#7f644d');
    rect(this.ctx, x - 3, y - 6, 7, 4, '#c57d4e');
    rect(this.ctx, x - 2, y - 10 - flame, 4, 8 + flame, '#edb76c');
    rect(this.ctx, x, y - 8, 3, 6, '#f5dba0');
    rect(this.ctx, x - 1, y - 5, 2, 3, '#fff0c2');
    rect(this.ctx, x + 10, y - 16, 1, 17, '#846d50');
    rect(this.ctx, x + 11, y - 16, 9, 8, '#688f85');
    rect(this.ctx, x + 14, y - 15, 2, 6, '#e8dec1');
    rect(this.ctx, x + 12, y - 13, 6, 2, '#e8dec1');
  }

  _drawPickup(pickup) {
    if (this._collected.has(pickup.id)) return;
    const { x, y } = pickup;
    rect(this.ctx, x - 6, y - 1, 13, 2, '#7d8a68');
    rect(this.ctx, x - 5, y - 7, 11, 7, '#576d50');
    rect(this.ctx, x - 4, y - 6, 9, 5, '#acaa73');
    rect(this.ctx, x - 5, y - 8, 11, 3, '#7a9e65');
    rect(this.ctx, x - 3, y - 9, 7, 2, '#b1cb8d');
    rect(this.ctx, x - 1, y - 8, 3, 7, '#e4cb8f');
    rect(this.ctx, x, y - 4, 1, 2, '#8a7950');
    if (this._reducedMotion || this._phase % 4 < 2) sparkle(this.ctx, x + 6, y - 12, '#f7e4ab');
  }

  getPrompt() {
    const target = this._findInteraction();
    if (target?.kind === 'guardian') {
      return this._completed.has(target.id) || target.id !== this._frontier
        ? `E: Talk to ${GUARDIANS[target.id]}`
        : `E: Challenge ${GUARDIANS[target.id]}`;
    }
    if (target?.kind === 'camp') return 'E: Rest at camp';
    if (target?.kind === 'pickup') return 'E: Open snack cache';
    if (target) return 'E: Trail sign';
    return '';
  }

  setProgress(completedIds = []) {
    if (this._destroyed) return;
    this._completed = new Set();
    let companion = -1;
    for (const id of completedIds) {
      if (Number.isInteger(id) && id >= 0 && id < LOCATIONS.length) {
        this._completed.add(id);
        companion = Math.max(companion, id);
      }
    }
    this._frontier = 0;
    while (this._completed.has(this._frontier)) this._frontier += 1;
    this._companion.id = companion;
    this._updateCompanion();
    const destination = this._frontier < LOCATIONS.length
      ? `Follow the gold lantern to ${GUARDIANS[this._frontier]} in ${ZONES[this._frontier]}.`
      : 'All seven guardians are friends and their island landmarks are restored.';
    this.canvas.setAttribute('aria-label', `Scrolling pixel-art Bitbound island. ${this._completed.size} of 7 guardians befriended. ${destination} Hold WASD or arrow keys to walk, Shift to dash, and E, Enter or Space to interact nearby. Avoid roaming purple noise creatures or touch them to battle. Campfires heal; leaf caches hold snacks.`);
    this._makeProgress();
  }

  setCollected(ids = []) {
    if (!this._destroyed) this._collected = new Set(ids);
  }

  getZone() {
    return { id: this._zone, name: ZONES[this._zone] };
  }

  getPosition() {
    return { x: this._position.x, y: this._position.y };
  }

  /** Restore continuous coordinates only on connected ground, never onto water or a prop. */
  setPosition(position) {
    if (this._destroyed || !position || !Number.isFinite(position.x) || !Number.isFinite(position.y)
        || !this._canStand(position.x, position.y)) return false;
    this._position.x = position.x;
    this._position.y = position.y;
    this._position.depth = position.y;
    this._playerPose = 0;
    this._facing = 'south';
    this._walkDistance = 0;
    this._contactCooldown = 3;
    this._resetTrail();
    this._updateZone();
    this._updateCamera(0, true);
    return true;
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    const layers = new Set([this._terrain, this._progress, this._markers, this._atlas, this._noiseAtlas]);
    for (const prop of this._props) {
      layers.add(prop.normal);
      layers.add(prop.restored);
    }
    for (const layer of layers) {
      layer.width = 0;
      layer.height = 0;
    }
    this._props.length = 0;
    this._entities.length = 0;
    this._enemies.length = 0;
    this._interactables.length = 0;
    this._walkable = null;
    this.onEncounter = () => {};
    this.onInteract = () => {};
    this.onMove = () => {};
  }
}
