import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP, MAP_W, MAP_H, TILE, REGIONS, LEGEND, START, ENTRIES, GATES, BRIDGES, INTERACTABLES, STATICLINGS, createMapView, tileOpen } from '../src/world/map.js';
import { TERRAIN_TYPES, isWalkable } from '../src/art/terrain.js';
import { PUZZLES } from '../src/world/puzzles.js';
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
    setFlag: (id, value = true) => {
      const index = state.flags.indexOf(id);
      if (value && index < 0) state.flags.push(id);
      else if (!value && index >= 0) state.flags.splice(index, 1);
    },
    save() {}, announce() {},
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
    for (const item of INTERACTABLES) {
      if (item.zone > count || item.puzzle) continue;
      assert.ok(reachable.has(item.ty * MAP_W + item.tx), `with ${count} friends, ${item.id} must be reachable without a later gate`);
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

test('seven compositions have independently authored landmark and bridge arrangements', () => {
  const layouts = REGIONS.filter((region) => region.id >= 0);
  const arrangements = layouts.map((region) => JSON.stringify([region.entry, region.stone, region.shrine, region.camp, region.bridge]));
  assert.equal(new Set(arrangements).size, 7);
  assert.equal(new Set(layouts.map((region) => JSON.stringify(region.entry))).size, 7);
  assert.equal(new Set(layouts.map((region) => JSON.stringify(region.stone))).size, 7);
  for (const bridge of BRIDGES) {
    const path = [bridge.bank, ...bridge.cells, bridge.reward];
    assert.equal(bridge.cells.length, 4, 'four physical treads match every puzzle reconstruction');
    for (let i = 1; i < path.length; i++) {
      assert.equal(Math.abs(path[i].tx - path[i - 1].tx) + Math.abs(path[i].ty - path[i - 1].ty), 1, `${bridge.id}: ordered orthogonal tread`);
    }
    assert.ok(isWalkable(MAP.get(bridge.bank.tx, bridge.bank.ty)), `${bridge.id}: dry approach`);
    assert.ok(isWalkable(MAP.get(bridge.reward.tx, bridge.reward.ty)), `${bridge.id}: dry landing`);
  }
});

test('patrol homes leave the protected service radii and their wander leash clear', () => {
  const state = newGame();
  state.friends = [0, 1, 2, 3, 4, 5, 6];
  state.puzzles = PUZZLES.map((puzzle) => puzzle.id);
  const world = new World(gameFor(state));
  world.setState(state);
  for (const patrol of STATICLINGS) {
    assert.ok(world._walkable(patrol.x, patrol.y, 3), `${patrol.uid}: solid home`);
    for (const service of INTERACTABLES) {
      if (service.zone !== patrol.zone || !['shrine', 'camp', 'stone', 'cache', 'puzzle'].includes(service.interaction)) continue;
      const radius = service.interaction === 'shrine' ? 56 : 40;
      assert.ok(Math.hypot(service.x - patrol.x, service.y - patrol.y) >= radius + 28, `${patrol.uid} is too near ${service.id}`);
    }
  }
});

test('state application is idempotent; rest returns only cleared active-zone patrols', () => {
  const state = newGame();
  state.friends = [0, 1, 2, 3, 4];
  state.techniques = ['bits', 'zero', 'calib', 'groups', 'spotlight', 'balance'];
  const world = new World(gameFor(state));
  world.setState(state);
  const first = world.position;
  world.setState(state);
  assert.deepEqual(world.position, first);
  assert.equal(world.followers.length, 4);
  const enemy = world.statics.find((item) => item.zone === 5);
  world.afterBattle(enemy.uid, 'won');
  assert.equal(enemy.alive, false);
  world.setState(state);
  assert.equal(enemy.alive, false);
  world.respawnStaticlings();
  assert.equal(enemy.alive, true);
  assert.ok(world.statics.filter((item) => item.zone < 5).every((item) => !item.alive), 'rest cannot repopulate restored shores');
  assert.ok(world.contactCooldown >= 3);
});
