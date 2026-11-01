import test from 'node:test';
import assert from 'node:assert/strict';
import { World, specimenGolden, campReachable } from '../src/world/world.js';
import { STATICLINGS, INTERACTABLES, FEN_STATIONS, MAP_W, MAP_H, START, TILE, tileOpen } from '../src/world/map.js';
import { SPECIES } from '../src/content/static-dex.js';
import { fenDialogue, npcDialogue, GUARDIAN_HOME_LINES } from '../src/world/content.js';
import { newGame } from '../src/state.js';
import { measureText } from '../src/engine/font.js';

function harness(friends = [], restCount = 0) {
  const state = newGame();
  state.friends = friends;
  state.restCount = restCount;
  const calls = { battles: [], duels: [], seen: [], travel: [], speech: [], rests: 0, well: 0 };
  const game = { state, time: 0, reducedMotion: true, screen: { w: 384, h: 216 }, input: { lastDevice: 'keyboard' },
    audio: { play() {} }, announce() {}, save() {},
    hasFlag: (id) => state.flags.includes(id),
    setFlag(id, value = true) { state.flags = value ? [...new Set([...state.flags, id])] : state.flags.filter((flag) => flag !== id); },
    emit(type, data) { if (type === 'seen') calls.seen.push(data); },
    say(lines) { calls.speech.push(lines); },
    startBattle(params) { calls.battles.push(params); }, startRivalDuel(id) { calls.duels.push(id); },
    enterWell() { calls.well++; }, travelTo(id) { calls.travel.push(id); world.returnToCamp(id); },
    restAtCamp(id) { calls.rests++; state.restCount++; if (!state.camps.includes(id)) state.camps.push(id); world.respawnStaticlings(); },
  };
  const world = new World(game);
  world.setState(state);
  return { world, game, state, calls };
}
const input = (action) => ({ pressed: (key) => key === action, repeat: (key) => key === action, consume() {}, axis: () => ({ x: 0, y: 0 }), held: () => false });
const item = (id) => INTERACTABLES.find((entry) => entry.id === id);
function flood(world) {
  const queue = [[Math.floor(START.x / TILE), Math.floor(START.y / TILE)]];
  const seen = new Set([queue[0][1] * MAP_W + queue[0][0]]);
  for (let index = 0; index < queue.length; index++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = queue[index][0] + dx, y = queue[index][1] + dy, key = y * MAP_W + x;
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || seen.has(key) || !tileOpen(x, y, world.game.state.friends) || !world._walkable(x * TILE + 8, y * TILE + 8)) continue;
    seen.add(key); queue.push([x, y]);
  }
  return seen;
}

test('three unique authored species per zone are reachable without its guardian or bridge', () => {
  for (let zone = 0; zone < 7; zone++) {
    const { world } = harness(Array.from({ length: zone }, (_, i) => i));
    const reachable = flood(world), homes = STATICLINGS.filter((entry) => entry.zone === zone);
    assert.deepEqual(homes.map((entry) => entry.species).sort(), SPECIES.filter((entry) => entry.zone === zone).map((entry) => entry.id).sort());
    for (const home of homes) assert.ok(reachable.has(home.ty * MAP_W + home.tx), home.uid);
  }
});

test('golden is stable across reload, depends only on visit and uid, and uses all 32 bins', () => {
  const uid = STATICLINGS[0].uid;
  const rolls = Array.from({ length: 1024 }, (_, visit) => specimenGolden(visit, uid));
  assert.ok(rolls.some(Boolean) && rolls.some((golden) => !golden));
  assert.ok(rolls.filter(Boolean).length >= 16 && rolls.filter(Boolean).length <= 48);
  for (let visit = 0; visit < 64; visit++) {
    const a = harness([], visit).world, b = harness([], visit).world;
    assert.deepEqual(a.statics.map((entry) => entry.golden), b.statics.map((entry) => entry.golden));
    assert.equal(a.statics[0].golden, specimenGolden(visit, uid));
  }
});

test('awake on-screen sight emits once per specimen per rest, never for sleepers or offscreen homes', () => {
  const { world, state, calls } = harness();
  const enemy = world.statics[0]; world.statics = [enemy];
  world.hero.x = enemy.x; world.hero.y = enemy.y; world.camera.x = enemy.x - 40; world.camera.y = enemy.y - 40;
  world._updateStaticlings(0); assert.equal(calls.seen.length, 0);
  state.flags.push('stone-0'); world.contactCooldown = 3;
  world._updateStaticlings(0); world._updateStaticlings(0);
  assert.deepEqual(calls.seen, [{ species: enemy.species, golden: enemy.golden }]);
  world.camera.x += 1000; state.restCount++; world.respawnStaticlings(); world._updateStaticlings(0);
  assert.equal(calls.seen.length, 1);
  world.camera.x = enemy.x - 40; world._updateStaticlings(0); assert.equal(calls.seen.length, 2);
});

test('contact carries species, uid, zone and deterministic cosmetic golden flag', () => {
  const { world, state, calls } = harness(); const enemy = world.statics[0]; world.statics = [enemy];
  state.flags.push('stone-0'); world.hero.x = enemy.x; world.hero.y = enemy.y; world.contactCooldown = 0;
  world._updateStaticlings(0);
  assert.deepEqual(calls.battles[0], { foeId: 'static-0', species: enemy.species, guardian: false, uid: enemy.uid, zone: 0, golden: enemy.golden });
});

test('friendly sanctuary stays at home and launches practice; restored shrine rematches are practice guardians', () => {
  const { world, calls } = harness([0]); const enemy = world.statics[0];
  assert.equal(enemy.lifecycle, 'PURIFIED');
  world._updateStaticlings(2); assert.deepEqual([enemy.x, enemy.y], [enemy.homeX, enemy.homeY]);
  world._interact(enemy); assert.deepEqual(world.panel.options, ['Practise', 'Leave']); assert.equal(world.canPause, false);
  world._updatePanel(input('confirm')); assert.equal(calls.battles[0].mode, 'practice'); assert.equal(calls.battles[0].species, enemy.species);
  world._interact(item('meadow-shrine')); assert.deepEqual(world.panel.options, ['Rematch', 'Leave']);
  world._updatePanel(input('confirm')); assert.deepEqual(calls.battles[1], { mode: 'practice', foeId: 'nib', guardian: true, zone: 0 });
  assert.equal(world.canPause, true);
});

test('rest happens immediately, travel requires Nib, lists only rested gate-safe camps, arrival grants four seconds', () => {
  const { world, state, calls } = harness();
  world._interact(item('point-camp')); assert.equal(calls.rests, 1); assert.deepEqual(world.panel.options, ['Stay', 'Travel', 'Leave']);
  world._updatePanel(input('down')); world._updatePanel(input('confirm')); assert.equal(world.panel, null); assert.match(calls.speech.at(-1), /Nib/); assert.deepEqual(calls.travel, []);
  state.friends = [0]; state.camps = ['point-camp', 'meadow-camp', 'grove-camp', 'spire-camp', 'made-up'];
  world._interact(item('point-camp')); world._updatePanel(input('down')); world._updatePanel(input('confirm'));
  assert.deepEqual(world.panel.options, ['Bitleaf Meadow', 'Offset Grove', 'Back']);
  assert.equal(world.canPause, false); world._updatePanel(input('confirm'));
  assert.deepEqual(calls.travel, ['meadow-camp']); assert.equal(calls.rests, 2); assert.equal(world.contactCooldown, 4);
  assert.ok(world._walkable(world.hero.x, world.hero.y));
  const before = world.position; world.returnToCamp('spire-camp'); assert.notEqual(world.position.zone, 6);
  assert.equal(campReachable(state, item('spire-camp')), false); assert.equal(campReachable(state, item('cove-camp')), false);
  assert.notEqual(before.zone, 6);
});

test('every rested gate-safe camp has a collision-safe arrival', () => {
  const { world, state } = harness([0, 1, 2, 3, 4, 5, 6]);
  state.camps = INTERACTABLES.filter((entry) => entry.interaction === 'camp').map((entry) => entry.id);
  for (const id of state.camps) { world.returnToCamp(id); assert.ok(world._walkable(world.hero.x, world.hero.y), id); assert.equal(world.contactCooldown, 4); }
});

test('Fen appears independently by named friendship at each nonblocking camp station', () => {
  for (const station of FEN_STATIONS) {
    const { world, state, calls } = harness(); world.hero.x = station.x; world.hero.y = station.y + 12; world.hero.facing = 'up';
    assert.notEqual(world._findInteraction()?.id, station.id);
    state.friends = [station.requires]; assert.equal(world._findInteraction()?.id, station.id);
    world._interact(station); assert.deepEqual(world.panel.options, ['Talk', 'Duel', 'Later']);
    world._updatePanel(input('down')); world._updatePanel(input('confirm')); assert.deepEqual(calls.duels, [station.id]);
    const before = fenDialogue(station.id, state); state.rival.won.push(station.id); assert.notDeepEqual(fenDialogue(station.id, state), before);
    for (const outcome of ['won', 'lost', 'fled']) { world.afterDuel(station.id, outcome); assert.ok(calls.speech.at(-1)[0].text.length > 0); }
  }
});

test('Well waits kindly for two friends and opens without campaign mutation', () => {
  const { world, state, calls } = harness([0]); world._interact(item('point-well')); assert.equal(calls.well, 0); assert.match(calls.speech.at(-1), /two friends/);
  state.friends.push(1); world._interact(item('point-well')); assert.equal(calls.well, 1);
});

test('pin targets only known unfinished landmarks and falls back after completion', () => {
  const { world, state } = harness();
  state.pin = 'meadow-cache'; assert.equal(world.objective().x, item(state.pin).x); assert.match(world.objective().text, /^Pin:/);
  state.caches.push(state.pin); assert.doesNotMatch(world.objective().text, /^Pin:/);
  state.pin = 'spire-cache'; assert.doesNotMatch(world.objective().text, /^Pin:/);
  state.pin = 'meadow-hidden'; assert.doesNotMatch(world.objective().text, /^Pin:/);
  state.pin = 'bridge-0'; assert.match(world.objective().text, /^Pin:/); world.solved.add(state.pin); assert.doesNotMatch(world.objective().text, /^Pin:/);
  state.pin = 'meadow-stone'; assert.match(world.objective().text, /^Pin:/); state.flags.push('stone-0'); assert.doesNotMatch(world.objective().text, /^Pin:/);
});

test('world marks and reward effects remain bounded and expire without locking movement', () => {
  const { world } = harness();
  for (let i = 0; i < 200; i++) { world._mark('foot', 20, 20, 2); world._effect('shard', 20, 20, 0.81); }
  assert.equal(world.marks.length, 24); assert.equal(world.effects.length, 12); assert.equal(world.canPause, true);
  world._updateJuice(3); assert.ok(world.marks.every((mark) => mark.life === 0)); assert.ok(world.effects.every((effect) => effect.life === 0));
});

test('NPC repeats are short personal replies and every restored resident has a distinct voice', () => {
  const { state } = harness();
  const replies = [];
  for (const npc of INTERACTABLES.filter((entry) => entry.interaction === 'npc' && entry.zone >= 0)) {
    assert.equal(npcDialogue(npc, state, true).length, 3);
    assert.equal(npcDialogue(npc, state, false).length, 1);
    state.friends = [npc.zone];
    const restored = npcDialogue(npc, state, false);
    assert.equal(restored.length, 1);
    replies.push(restored[0].text);
    state.friends = [];
  }
  assert.equal(new Set(replies).size, replies.length);
  assert.equal(new Set(GUARDIAN_HOME_LINES).size, 7);
  const cat = INTERACTABLES.find((entry) => entry.id === 'point-cat');
  assert.match(npcDialogue(cat, state, true)[0].text, /no technical advice/);
});

test('guide follows traversable Grove exits and Heights stair openings without revealing collectibles', () => {
  for (const zone of [1, 3]) {
    const { world, state } = harness(Array.from({ length: zone + (zone === 1 ? 1 : 0) }, (_, index) => index));
    if (zone === 1) {
      world.solved.add('bridge-1');
      const shard = INTERACTABLES.find((entry) => entry.id === 'grove-bridge-shard');
      world.hero.x = shard.x; world.hero.y = shard.y;
    } else {
      world.devPlace(3);
      state.flags.push('stone-3');
    }
    const objective = world.objective();
    assert.ok(objective.waypoint, `zone ${zone} has a route opening`);
    assert.ok(world._lineOpen(world.hero.x, world.hero.y, objective.waypoint.x, objective.waypoint.y));
    const route = world.navigation;
    assert.ok(route.path.length > 2);
    assert.ok(route.path.every((point) => world._walkable(point.x, point.y)));
    world.objective();
    assert.strictEqual(world.navigation, route, 'stationary guidance reuses its route');
    assert.doesNotMatch(objective.text, /hidden|shard/i);
  }
});

test('world menus fit minimum landscape and portrait without covering the hero centre', () => {
  const { world, game } = harness([0]);
  for (const screen of [{ w: 384, h: 216, portrait: false }, { w: 216, h: 320, portrait: true }]) {
    game.screen = screen;
    for (const line of GUARDIAN_HOME_LINES) {
      world._openPanel('Guardian shrine', ['Rematch', 'Leave'], () => {}, `${line} Rematches keep island supplies safe.`);
      const panel = world.panel;
      assert.ok(panel.lines.every((text) => measureText(text, 'small') <= panel.width - 20));
      assert.ok(62 + panel.lines.length * 10 + panel.options.length * 18 <= screen.h - 16);
    }
    if (!screen.portrait) assert.ok(8 + world._panelWidth(screen) < screen.w / 2);
  }
});
