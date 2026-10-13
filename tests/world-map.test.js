import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP, MAP_W, MAP_H, TILE, REGIONS, LEGEND, START, ENTRIES, GATES, BRIDGES, INTERACTABLES, STATICLINGS, createMapView, tileOpen } from '../src/world/map.js';
import { TERRAIN_TYPES, isWalkable } from '../src/art/terrain.js';
import { PUZZLES, breathing, evaluatePuzzle, puzzleRange } from '../src/world/puzzles.js';
import { World } from '../src/world/world.js';
import { newGame } from '../src/state.js';

function flood(friends, puzzles = [], walkable = null) {
  const seen = new Set();
  const startX = Math.floor(START.x / TILE);
  const startY = Math.floor(START.y / TILE);
  const queue = [[startX, startY]];
  seen.add(startY * MAP_W + startX);
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const tx = x + dx;
      const ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
      const id = ty * MAP_W + tx;
      if (seen.has(id) || !tileOpen(tx, ty, friends, puzzles) || (walkable && !walkable(tx * TILE + 8, ty * TILE + 8))) continue;
      seen.add(id);
      queue.push([tx, ty]);
    }
  }
  return seen;
}

function gameFor(state = newGame()) {
  return {
    state, time: 0, screen: { w: 384, h: 216 }, reducedMotion: false,
    audio: { play() {} }, hasFlag: (id) => state.flags.includes(id),
    setFlag: (id) => { if (!state.flags.includes(id)) state.flags.push(id); },
  };
}

// This is the map's authored contract, including the lead's explicit correction
// of the original 14+7=16 typo: seven bridge rewards + seven zone secrets + two hub secrets.
test('island uses known terrain, seven complete zones and exactly two byte upgrades', () => {
  assert.equal(MAP_W, 120);
  assert.equal(MAP_H, 90);
  assert.equal(REGIONS.length, 8);
  assert.equal(MAP.zoneAt(Math.floor(START.x / TILE), Math.floor(START.y / TILE)), -1);
  for (const type of Object.values(LEGEND)) assert.ok(TERRAIN_TYPES.includes(type), type);
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) assert.ok(TERRAIN_TYPES.includes(MAP.get(x, y)), `${x},${y}`);
  assert.equal(MAP.get(-1, 0), 'void');
  assert.equal(GATES.length, 6);
  assert.equal(INTERACTABLES.filter((item) => item.interaction === 'shard').length, 16);
  for (let zone = 0; zone < 7; zone++) {
    assert.equal(STATICLINGS.filter((item) => item.zone === zone).length, 3);
    for (const kind of ['stone', 'shrine', 'camp', 'cache', 'puzzle']) assert.equal(INTERACTABLES.filter((item) => item.zone === zone && item.interaction === kind).length, 1, `${zone}: ${kind}`);
    assert.equal(INTERACTABLES.filter((item) => item.zone === zone && item.interaction === 'npc').length, 2);
    assert.equal(MAP.zoneAt(ENTRIES[zone].tx, ENTRIES[zone].ty), zone);
  }
});

test('each guardian opens exactly the next shore; no gate has a terrain bypass', () => {
  for (let count = 0; count <= 6; count++) {
    const friends = Array.from({ length: count }, (_, i) => i);
    const reachable = flood(friends);
    for (const entry of ENTRIES) {
      assert.equal(reachable.has(entry.ty * MAP_W + entry.tx), entry.zone <= count, `with ${count} friends, zone ${entry.zone}`);
    }
    for (const gate of GATES) {
      assert.ok(gate.cells.every(([x, y]) => isWalkable(MAP.get(x, y))), `${gate.id} is on its crossing`);
    }
  }
});

test('all interactables stand on walkable terrain and are reachable with their bridges solved', () => {
  const friends = Array.from({ length: 7 }, (_, i) => i);
  const puzzles = PUZZLES.map((item) => item.id);
  const reachable = flood(friends, puzzles);
  for (const item of INTERACTABLES) {
    assert.ok(isWalkable(MAP.get(item.tx, item.ty)), `${item.id}: ${MAP.get(item.tx, item.ty)}`);
    assert.ok(reachable.has(item.ty * MAP_W + item.tx), `${item.id} is unreachable`);
  }
});

test('solid prop rectangles leave an approachable side for every interaction', () => {
  const state = newGame();
  state.friends = [0, 1, 2, 3, 4, 5, 6];
  state.puzzles = PUZZLES.map((item) => item.id);
  const world = new World(gameFor(state));
  world.setState(state);
  const reachable = flood(state.friends, state.puzzles, (x, y) => world._walkable(x, y));
  for (const item of INTERACTABLES) {
    const radius = item.interaction === 'shrine' ? 37 : item.interaction === 'lighthouse' ? 40 : 28;
    let approachable = false;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (Math.hypot(dx, dy) * TILE <= radius && reachable.has((item.ty + dy) * MAP_W + item.tx + dx)) approachable = true;
    }
    assert.ok(approachable, `${item.id}: no reachable interaction position`);
  }
});

test('bridge shards cannot be reached around the moat; solving is per-world', () => {
  const friends = [0, 1, 2, 3, 4, 5, 6];
  const before = flood(friends);
  const solved = new Set();
  const view = createMapView(solved);
  const other = createMapView(new Set());
  for (const bridge of BRIDGES) {
    const reward = INTERACTABLES.find((item) => item.puzzle === bridge.id);
    assert.ok(!before.has(reward.ty * MAP_W + reward.tx), `${bridge.id}: reward bypass`);
    for (const cell of bridge.cells) assert.ok(!isWalkable(MAP.get(cell.tx, cell.ty)), `${bridge.id}: dry unsolved stone`);
    solved.add(bridge.id);
    for (const cell of bridge.cells) {
      assert.equal(view.get(cell.tx, cell.ty), 'stone');
      assert.notEqual(other.get(cell.tx, cell.ty), 'stone');
    }
  }
});

test('all seven Snap Bridges require a choice, have non-clipping solutions and useful timing windows', () => {
  for (const puzzle of PUZZLES) {
    assert.equal(evaluatePuzzle(puzzle).solved, false, `${puzzle.id}: default is already solved`);
    let wins = 0;
    let witness = null;
    for (const bits of [2, 3, 4, 8]) for (let step = 0; step <= 220; step++) {
      const config = { bits, p: step / 220 };
      const result = evaluatePuzzle(puzzle, config);
      if (result.solved) { wins++; witness = config; }
    }
    assert.ok(wins >= 20, `${puzzle.id}: only ${wins} winning samples`);
    assert.ok(witness, `${puzzle.id}: no solution`);
    const solution = evaluatePuzzle(puzzle, witness);
    assert.equal(solution.clippedCount, 0);
    assert.ok(solution.recon.every((value) => Math.abs(value - solution.recon[0]) < 1e-9));
    assert.equal(evaluatePuzzle(puzzle, { bits: 2, p: 0 }).solved, false, 'clipping everything is not a valid walkway');
  }
});

test('Zero-Shift really changes the bucket boundaries, and breathing uses the battle oscillator', () => {
  const puzzle = PUZZLES[1];
  const sym = evaluatePuzzle(puzzle, { bits: 2, p: 0.8 });
  const affine = evaluatePuzzle(puzzle, { bits: 2, p: 0.8, tool: true });
  assert.notDeepEqual(sym.recon, affine.recon);
  assert.equal(affine.rows[0].levels.length, 4);
  assert.equal(sym.rows[0].levels.length, 3);
  assert.equal(breathing(0), 0);
  assert.equal(breathing(0.95), 1);
  assert.ok(Math.abs(breathing(0.475) - 0.5) < 1e-12);
  assert.equal(puzzleRange(puzzle, 0), puzzle.amax * 0.35);
  assert.ok(Math.abs(puzzleRange(puzzle, 1) - puzzle.amax * 1.45) < 1e-12);
});

test('world state application is idempotent, and defeated staticlings return only at rest', () => {
  const state = newGame();
  state.friends = [0, 1, 2, 3, 4];
  state.techniques = ['bits', 'zero', 'calib', 'groups', 'spotlight'];
  const world = new World(gameFor(state));
  world.setState(state);
  const first = world.position;
  world.setState(state);
  assert.deepEqual(world.position, first);
  assert.equal(world.followers.length, 4);
  const enemy = world.statics[0];
  world.afterBattle(enemy.uid, 'won');
  assert.equal(enemy.alive, false);
  world.setState(state);
  assert.equal(enemy.alive, false);
  world.respawnStaticlings();
  assert.equal(enemy.alive, true);
  assert.equal(world.contactCooldown, 3);
});
