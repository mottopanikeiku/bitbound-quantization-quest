// World owns motion and presentation; save mutations only go through Game services.
import { MAP, TILE, REGIONS, PROPS as PLACEMENTS, INTERACTABLES, GATES, BRIDGES, STATICLINGS, ENTRIES, START, LIGHTHOUSE, createMapView } from './map.js';
import { PUZZLES, SnapBridge } from './puzzles.js';
import { npcDialogue, signText, stoneText, shrineDialogue, interactionName } from './content.js';
import { paintTerrainChunk, drawTerrainAnimated, isWalkable } from '../art/terrain.js';
import { drawCharacter } from '../art/characters.js';
import { drawSpirit, drawStaticling } from '../art/creatures.js';
import { PROPS, drawProp } from '../art/props.js';
import { createAmbience } from '../art/ambience.js';
import { medianCutPalette, buildPaletteLUT, bayer, rgbaOf, u32 } from '../art/paint.js';
import { PAL } from '../art/palette.js';
import { drawWorldHud } from '../ui/hud.js';
import { drawWindow, drawKeyCap } from '../ui/kit.js';
import { drawText, measureText } from '../engine/font.js';
import { HUB, GUARDIANS, ZONES, heroStats } from '../content/game-data.js';
import { clamp, approach, hash2, makeCanvas } from '../engine/util.js';

const CHUNK = 16;
const FACE = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const campItems = PLACEMENTS.filter((item) => item.interaction === 'camp');
const stoneItems = PLACEMENTS.filter((item) => item.interaction === 'stone');
const shrineItems = PLACEMENTS.filter((item) => item.interaction === 'shrine');
const sortedProps = [...PLACEMENTS].sort((a, b) => a.y - b.y);
const direction = (x, y) => Math.abs(x) > Math.abs(y) ? x < 0 ? 'left' : 'right' : y < 0 ? 'up' : 'down';

// These circles include the approach, not just the interaction's solid footprint.
const SAFE_RADII = { shrine: 56, camp: 40, stone: 40, cache: 40, puzzle: 40 };
const safeItems = INTERACTABLES.filter((item) => SAFE_RADII[item.interaction]);
const FLEE_GRACE = 6;
const clearFlag = (enemy) => `patrol-cleared-${enemy.uid}`;
const landmarkKinds = new Set(Object.keys(PROPS).filter((kind) => PROPS[kind].solid && !kind.startsWith('tree-') && !['bush', 'rock-s', 'rock-l', 'stump'].includes(kind)));
const colourLight = (word) => (word & 255) * 0.2126 + ((word >>> 8) & 255) * 0.7152 + ((word >>> 16) & 255) * 0.0722;
const colourDistance = (a, b) => 2 * ((a & 255) - (b & 255)) ** 2 + 4 * (((a >>> 8) & 255) - ((b >>> 8) & 255)) ** 2 + 3 * (((a >>> 16) & 255) - ((b >>> 16) & 255)) ** 2;

export function propVisible(item, cx, cy, width, height) {
  const d = item.kind === 'npc' ? { w: 24, h: 28, ax: 11, ay: 26 } : PROPS[item.kind];
  return d && item.x - d.ax < cx + width && item.x - d.ax + d.w > cx && item.y - d.ay < cy + height && item.y - d.ay + d.h > cy;
}

function rampTransition(a, middle, b) {
  if (a === b) return false;
  const ar = a & 255, ag = (a >>> 8) & 255, ab = (a >>> 16) & 255;
  const br = b & 255, bg = (b >>> 8) & 255, bb = (b >>> 16) & 255;
  const mr = middle & 255, mg = (middle >>> 8) & 255, mb = (middle >>> 16) & 255;
  const low = colourLight(a), high = colourLight(b), light = colourLight(middle);
  return Math.abs(high - low) >= 6 && Math.abs(high - low) <= 48 &&
    light >= Math.min(low, high) && light <= Math.max(low, high) &&
    Math.abs(ar - ag - br + bg) < 14 && Math.abs(ab - ag - bb + bg) < 14 &&
    Math.abs(ar - ag - mr + mg) < 14 && Math.abs(ab - ag - mb + mg) < 14;
}

const violetTones = PAL.violet.map(rgbaOf);
// Keep the actual biome hues. A little desaturation and a 20–30% violet shadow
// tint precede palette fitting; the Static removes detail, not the biome identity.
function staticGrade(r, g, b) {
  const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const light = clamp(luminance / 255);
  const position = light * (violetTones.length - 1);
  const index = Math.min(violetTones.length - 2, Math.floor(position));
  const strength = 0.2 + (1 - light) * 0.1;
  let word = 0xff000000;
  for (let channel = 0; channel < 3; channel++) {
    const violet = violetTones[index][channel] + (violetTones[index + 1][channel] - violetTones[index][channel]) * (position - index);
    const original = channel === 0 ? r : channel === 1 ? g : b;
    const muted = original * 0.92 + luminance * 0.08;
    word |= Math.round(muted + (violet - muted) * strength) << (channel * 8);
  }
  return word >>> 0;
}

function colourWave(zone, point, start, duration) {
  const region = REGIONS.find((item) => item.id === zone);
  const left = (region.x - 2) * TILE, right = (region.x + region.w + 2) * TILE;
  const top = (region.y - 3) * TILE, bottom = (region.y + region.h + 2) * TILE;
  const radius = Math.max(...[[left, top], [right, top], [left, bottom], [right, bottom]].map(([x, y]) => Math.hypot(x - point.x, y - point.y))) + 12;
  return { start, duration, radius, x: point.x, y: point.y };
}

export class World {
  constructor(game) {
    this.game = game;
    this.hero = { x: START.x, y: START.y, vx: 0, vy: 0, facing: START.facing, step: 0, moving: false };
    this.camera = { x: 0, y: 0 };
    this.cameraSnap = true;
    this.shrines = shrineItems;
    this.camp = campItems.find((item) => item.id === 'point-camp');
    this.statics = STATICLINGS.map((item) => ({ ...item, homeX: item.x, homeY: item.y, alive: true, lifecycle: 'DORMANT', mood: 'sleeping', clock: item.seed * 0.13, alertTime: 0, dir: 'down', disengaged: false, purifyUntil: 0 }));
    this.contactCooldown = 2.5;
    this.solved = new Set();
    this.restored = new Set();
    this.restorations = new Map();
    this.depthRipples = new Map();
    this.pendingStone = null;
    this.gateTimes = new Map();
    this.gateOpen = new Set();
    this.map = createMapView(this.solved);
    this.chunks = new Map();
    this.palettes = new Map();
    this.paletteSamples = new Map();
    this.ambiences = new Map();
    this.followers = [];
    this.trail = [];
    this.dust = [];
    this.stepDistance = 0;
    this.renderList = [];
    this.puzzle = null;
    this.nearby = null;
    this.lastWidth = 0;
    this.lastHeight = 0;
    this.worldLayer = null;
    this.actorLayer = null;
    this.materialLayer = null;
    this.heroSilhouettes = new Map();
    this.heroCover = null;
    this.rampMask = new Uint8Array(0);
    this.bridgePaths = new Map();
    this.bridgeDecks = new Map();
    for (const enemy of this.statics) this._syncPatrol(enemy);
    this._resetTrail();
  }

  get canPause() { return this.puzzle === null && this.pendingStone === null; }

  setState(state) {
    const position = state.position ?? this.hero;
    this.solved = new Set(state.puzzles);
    this.map = createMapView(this.solved);
    this.chunks.clear();
    this.restored = new Set([...state.friends, ...ZONES.filter((zone) => state.flags.includes(`restored-${zone.id}`)).map((zone) => zone.id)]);
    this.hero.x = position.x;
    this.hero.y = position.y;
    this.hero.facing = state.position ? state.facing ?? 'down' : this.hero.facing;
    this.hero.vx = this.hero.vy = 0;
    if (!this._walkable(this.hero.x, this.hero.y)) {
      const camp = campItems.find((item) => item.id === state.camp) ?? this.camp;
      this.hero.x = camp.x + 20;
      this.hero.y = camp.y + 16;
      if (!this._walkable(this.hero.x, this.hero.y)) {
        this.hero.x = START.x;
        this.hero.y = START.y;
      }
    }
    this.gateOpen = new Set(GATES.filter((gate) => state.friends.includes(gate.requires)).map((gate) => gate.id));
    for (const enemy of this.statics) {
      this._syncPatrol(enemy);
      enemy.alive = enemy.lifecycle !== 'PURIFIED' && !this.game.hasFlag(clearFlag(enemy));
    }
    this._syncFollowers();
    this._resetTrail();
    this.cameraSnap = true;
    this.contactCooldown = Math.max(this.contactCooldown, 2);
  }

  get position() {
    return { x: this.hero.x, y: this.hero.y, zone: MAP.zoneAt(Math.floor(this.hero.x / TILE), Math.floor(this.hero.y / TILE)), facing: this.hero.facing };
  }

  devPlace(zoneId) {
    const entry = ENTRIES[zoneId] ?? START;
    this.hero.x = entry.x;
    this.hero.y = entry.y;
    this.hero.vx = this.hero.vy = 0;
    this.hero.facing = entry.facing ?? 'up';
    this.cameraSnap = true;
    this.contactCooldown = 3;
    this._resetTrail();
  }

  objective() {
    const next = ZONES.find((zone) => !this.game.state.friends.includes(zone.id));
    if (this.pendingStone) {
      const zone = this.pendingStone.zone, bits = ZONES[zone].corruptBits;
      return { text: `${bits} → ${bits + 1} bits: ${2 ** bits} → ${2 ** (bits + 1)} colours`, x: stoneItems[zone].x, y: stoneItems[zone].y };
    }
    if (!next) return this.game.hasFlag('ending-seen') ? null : { text: 'Bring seven friends to the Lighthouse', x: LIGHTHOUSE.x, y: LIGHTHOUSE.y + 16 };
    if (next.id > 0 && this.position.zone !== next.id && this.position.zone < next.id) {
      const gate = GATES.find((item) => item.requires === next.id - 1);
      return { text: `Through the gate to ${next.name}`, x: gate.x, y: gate.y };
    }
    if (!this._stoneAwake(next.id)) {
      const stone = stoneItems[next.id];
      return { text: `Wake the ${next.name} Grid Stone`, x: stone.x, y: stone.y };
    }
    const shrine = this.shrines[next.id];
    return { text: `Befriend ${GUARDIANS[next.id].name} at the shrine`, x: shrine.x, y: shrine.y };
  }

  _stoneAwake(zone) {
    return this.game.hasFlag(`stone-${zone}`) || this.game.state.techniques.includes(ZONES[zone].technique);
  }

  _colourBits(zone) {
    return ZONES[zone].corruptBits + (this._stoneAwake(zone) || this.pendingStone?.zone === zone ? 1 : 0);
  }

  awakenStone(zone) {
    if (!ZONES[zone] || this._stoneAwake(zone) || this.pendingStone) return;
    const bits = ZONES[zone].corruptBits;
    this.depthRipples.set(zone, colourWave(zone, stoneItems[zone], this.game.time, 1.05));
    this.pendingStone = { zone, ready: this.game.time + 1.2 };
    this.hero.vx = this.hero.vy = 0;
    this.hero.moving = false;
    this.contactCooldown = 3;
    this.game.audio.play('restore');
    this.game.announce(`One more colour bit: ${bits} to ${bits + 1} bits, ${2 ** bits} to ${2 ** (bits + 1)} colours.`);
  }

  restoreZone(zoneId) {
    const shrine = this.shrines[zoneId];
    if (!shrine) return;
    this.restored.add(zoneId);
    this.restorations.set(zoneId, colourWave(zoneId, shrine, this.game.time, 2.2));
    this.game.setFlag(`restored-${zoneId}`);
    for (const enemy of this.statics) if (enemy.zone === zoneId) {
      this._syncPatrol(enemy);
      if (!this.game.hasFlag(clearFlag(enemy))) enemy.purifyUntil = this.game.time + 0.8;
    }
    const gate = GATES.find((item) => item.requires === zoneId);
    if (gate && this.game.state.friends.includes(zoneId)) {
      this.gateTimes.set(gate.id, this.game.time);
      this.game.audio.play('gate');
    }
    this._syncFollowers();
  }

  _patrolLifecycle(zone) {
    if (this.restored.has(zone) || this.game.state.friends.includes(zone) || this.game.hasFlag(`restored-${zone}`)) return 'PURIFIED';
    return this._stoneAwake(zone) ? 'ACTIVE' : 'DORMANT';
  }

  _resetPatrol(enemy) {
    enemy.x = enemy.homeX;
    enemy.y = enemy.homeY;
    enemy.mood = enemy.lifecycle === 'DORMANT' ? 'sleeping' : enemy.lifecycle === 'PURIFIED' ? 'purified' : 'wander';
    enemy.alertTime = 0;
  }

  _syncPatrol(enemy) {
    const lifecycle = this._patrolLifecycle(enemy.zone);
    if (lifecycle === enemy.lifecycle) return;
    const visible = enemy.alive;
    enemy.lifecycle = lifecycle;
    enemy.alive = lifecycle !== 'PURIFIED' && !this.game.hasFlag(clearFlag(enemy));
    if (lifecycle === 'PURIFIED') {
      enemy.mood = 'purified';
      if (visible) enemy.purifyUntil = this.game.time + 0.8;
    } else this._resetPatrol(enemy);
  }

  _safeAt(x, y, zone) {
    return safeItems.some((item) => item.zone === zone && (x - item.x) ** 2 + (y - item.y) ** 2 <= SAFE_RADII[item.interaction] ** 2);
  }

  respawnStaticlings() {
    for (const enemy of this.statics) {
      this._syncPatrol(enemy);
      if (enemy.lifecycle !== 'ACTIVE') continue;
      // One reversible flag per patrol keeps repeated rest/Continue saves bounded.
      this.game.setFlag(clearFlag(enemy), false);
      enemy.alive = true;
      enemy.disengaged = false;
      this._resetPatrol(enemy);
    }
    this.contactCooldown = 3;
  }

  afterBattle(uid, outcome) {
    const enemy = this.statics.find((item) => item.uid === uid);
    if (enemy) {
      this._syncPatrol(enemy);
      if (outcome === 'won') {
        enemy.alive = false;
        enemy.mood = 'cleared';
        this.game.setFlag(clearFlag(enemy));
      } else {
        this._resetPatrol(enemy);
        // A fleeing hero must also leave the notice circle before this patrol
        // can re-arm; waiting beside its home never causes a contact loop.
        enemy.disengaged = outcome === 'fled';
      }
    }
    this.contactCooldown = outcome === 'fled' ? FLEE_GRACE : 3;
    for (const patrol of this.statics) if (patrol.mood === 'chase' || patrol.mood === 'alert') patrol.mood = 'return';
    this.hero.vx = this.hero.vy = 0;
  }

  returnToCamp(campId) {
    const camp = campItems.find((item) => item.id === campId) ?? this.camp;
    this.hero.x = camp.x + 20;
    this.hero.y = camp.y + 16;
    this.hero.facing = 'down';
    this.hero.vx = this.hero.vy = 0;
    this.cameraSnap = true;
    this.contactCooldown = 4;
    this._resetTrail();
  }

  _walkable(x, y, radius = 4) {
    const left = x - radius;
    const right = x + radius;
    const top = y - 5;
    const bottom = y + 1;
    for (const px of [left, right]) for (const py of [top, bottom]) {
      if (!isWalkable(this.map.get(Math.floor(px / TILE), Math.floor(py / TILE)))) return false;
    }
    for (const gate of GATES) {
      if (this.game.state.friends.includes(gate.requires)) continue;
      for (const [tx, ty] of gate.cells) if (right >= tx * TILE && left < (tx + 1) * TILE && bottom >= ty * TILE && top < (ty + 1) * TILE) return false;
    }
    for (const item of PLACEMENTS) {
      if (item.interaction === 'shard' || item.kind === 'stone-float') continue;
      const solid = item.kind === 'npc' ? [-5, -5, 10, 7] : PROPS[item.kind]?.solid;
      if (!solid) continue;
      const [sx, sy, sw, sh] = solid;
      if (right > item.x + sx && left < item.x + sx + sw && bottom > item.y + sy && top < item.y + sy + sh) return false;
    }
    return true;
  }

  _centerOnBridge(body, dx, dy, radius) {
    let best = null, bestDistance = Infinity;
    for (const bridge of BRIDGES) {
      if (!this.solved.has(bridge.id)) continue;
      for (const segment of this._bridgePath(bridge).segments) {
        const forward = segment.axis === 'x' ? dx : dy;
        const sideways = segment.axis === 'x' ? dy : dx;
        const across = body[segment.cross] - segment.center;
        if (!forward || Math.abs(sideways) >= Math.abs(forward) || Math.abs(across) > TILE / 2 - 1) continue;
        const along = body[segment.axis], next = along + forward;
        if (next < segment.low - 4 || next > segment.high + 4) continue;
        if (along < segment.low && forward < 0 || along > segment.high && forward > 0) continue;
        const distance = across ** 2 + (along - clamp(along, segment.low, segment.high)) ** 2;
        if (distance < bestDistance) { best = segment; bestDistance = distance; }
      }
    }
    if (!best) return;
    const forward = best.axis === 'x' ? dx : dy;
    const centered = approach(body[best.cross], best.center, Math.abs(forward) * 0.7);
    const x = best.cross === 'x' ? centered : body.x, y = best.cross === 'y' ? centered : body.y;
    // Bend/entry assistance uses ordinary footprint collision. The visible
    // four-cell path is never widened and a nearby solid prop still wins.
    if (this._walkable(x, y, radius)) body[best.cross] = centered;
  }

  _bridgePath(bridge) {
    let path = this.bridgePaths.get(bridge.id);
    if (path) return path;
    const heights = PUZZLES[bridge.zone].settledHeights;
    const low = Math.min(...heights), span = Math.max(...heights) - low;
    const lifts = [0, ...heights.map((height) => span < 1e-8 ? 0 : (height - low) / span * 6), 0];
    const nodes = [bridge.bank, ...bridge.cells, bridge.reward];
    const segments = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i], b = nodes[i + 1], axis = a.x === b.x ? 'y' : 'x', cross = axis === 'x' ? 'y' : 'x';
      // The support ramp starts/ends at the physical bridge edge; banks stay
      // at height zero. Movement centering also covers the adjacent dry pads.
      const x = i === 0 ? (a.x + b.x) / 2 : a.x, y = i === 0 ? (a.y + b.y) / 2 : a.y;
      const endX = i === nodes.length - 2 ? (a.x + b.x) / 2 : b.x;
      const endY = i === nodes.length - 2 ? (a.y + b.y) / 2 : b.y;
      segments.push({ axis, cross, center: a[cross], low: Math.min(a[axis], b[axis]), high: Math.max(a[axis], b[axis]), x, y, dx: endX - x, dy: endY - y, from: lifts[i], to: lifts[i + 1] });
    }
    path = { segments, cells: new Map(bridge.cells.map((cell) => [`${cell.tx},${cell.ty}`, cell])) };
    this.bridgePaths.set(bridge.id, path);
    return path;
  }

  _pathLift(path, x, y) {
    let nearest = Infinity, lift = 0;
    for (const segment of path.segments) {
      const fraction = clamp(((x - segment.x) * segment.dx + (y - segment.y) * segment.dy) / (segment.dx ** 2 + segment.dy ** 2));
      const distance = (x - segment.x - segment.dx * fraction) ** 2 + (y - segment.y - segment.dy * fraction) ** 2;
      if (distance < nearest) { nearest = distance; lift = segment.from + (segment.to - segment.from) * fraction; }
    }
    return Math.round(lift);
  }

  _bridgeLift(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    for (const bridge of BRIDGES) if (this.solved.has(bridge.id) && bridge.cells.some((cell) => cell.tx === tx && cell.ty === ty)) return this._pathLift(this._bridgePath(bridge), x, y);
    return 0;
  }
  _move(body, dx, dy, radius = 4) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4));
    for (let i = 0; i < steps; i++) {
      if (body === this.hero) this._centerOnBridge(body, dx / steps, dy / steps, radius);
      if (this._walkable(body.x + dx / steps, body.y, radius)) body.x += dx / steps;
      else if (body === this.hero) body.vx = 0;
      if (this._walkable(body.x, body.y + dy / steps, radius)) body.y += dy / steps;
      else if (body === this.hero) body.vy = 0;
    }
  }

  _syncFollowers() {
    const wanted = this.game.state.friends.slice(-4);
    this.followers = wanted.map((zone, i) => this.followers.find((friend) => friend.zone === zone) ?? { zone, x: this.hero.x, y: this.hero.y + (i + 1) * 15, dir: 'down', moving: false });
  }

  _resetTrail() {
    this.trail.length = 0;
    for (let i = 0; i < 42; i++) this.trail.push({ x: this.hero.x, y: this.hero.y + i * 3, dir: this.hero.facing });
    for (let i = 0; i < this.followers.length; i++) {
      this.followers[i].x = this.hero.x;
      this.followers[i].y = this.hero.y + (i + 1) * 18;
    }
  }

  _updateFollowers(dt) {
    const first = this.trail[0];
    if (Math.hypot(this.hero.x - first.x, this.hero.y - first.y) >= 3) {
      this.trail.unshift({ x: this.hero.x, y: this.hero.y, dir: this.hero.facing });
      if (this.trail.length > 64) this.trail.pop();
    }
    for (let i = 0; i < this.followers.length; i++) {
      const friend = this.followers[i];
      const target = this.trail[Math.min(this.trail.length - 1, (i + 1) * 6)];
      const dx = target.x - friend.x;
      const dy = target.y - friend.y;
      friend.moving = Math.hypot(dx, dy) > 1.5;
      if (friend.moving) friend.dir = direction(dx, dy);
      const follow = 1 - Math.exp(-dt * 11);
      friend.x += dx * follow;
      friend.y += dy * follow;
    }
  }

  _updateStaticlings(dt) {
    const zone = this.position.zone;
    const heroSafe = this._safeAt(this.hero.x, this.hero.y, zone);
    for (const enemy of this.statics) {
      this._syncPatrol(enemy);
      if (!enemy.alive || enemy.lifecycle !== 'ACTIVE' || Math.abs(enemy.x - this.hero.x) > 360 || Math.abs(enemy.y - this.hero.y) > 320) continue;
      enemy.clock += dt;
      const dx = this.hero.x - enemy.x, dy = this.hero.y - enemy.y;
      const distance = Math.hypot(dx, dy);
      const homeDistance = Math.hypot(enemy.x - enemy.homeX, enemy.y - enemy.homeY);
      if (enemy.disengaged && (distance >= 96 || zone !== enemy.zone)) enemy.disengaged = false;
      const protectedApproach = heroSafe || this._safeAt(enemy.x, enemy.y, enemy.zone);
      const canPursue = !protectedApproach && !enemy.disengaged && this.contactCooldown === 0 && zone === enemy.zone;
      if (!canPursue && (enemy.mood === 'chase' || enemy.mood === 'alert')) {
        enemy.mood = 'return';
        enemy.alertTime = 0;
      }
      if (enemy.mood === 'wander' && canPursue && distance < 80) {
        enemy.mood = 'alert';
        enemy.alertTime = 0.45;
        this.game.audio.play('scan');
      }
      let vx = 0, vy = 0;
      if (enemy.mood === 'alert') {
        enemy.alertTime -= dt;
        if (enemy.alertTime <= 0) enemy.mood = 'chase';
      } else if (enemy.mood === 'chase') {
        if (distance > 140 || homeDistance > 165) enemy.mood = 'return';
        else if (distance > 1) { vx = dx / distance * 51; vy = dy / distance * 51; }
      } else if (enemy.mood === 'return') {
        if (homeDistance < 4) this._resetPatrol(enemy);
        else { vx = (enemy.homeX - enemy.x) / homeDistance * 31; vy = (enemy.homeY - enemy.y) / homeDistance * 31; }
      } else if (!enemy.disengaged) {
        const tick = Math.floor(enemy.clock / 2.8);
        const angle = hash2(enemy.seed, tick, 317) * Math.PI * 2;
        if (enemy.clock % 2.8 < 1.5) {
          vx = homeDistance > 28 ? (enemy.homeX - enemy.x) / homeDistance * 15 : Math.cos(angle) * 15;
          vy = homeDistance > 28 ? (enemy.homeY - enemy.y) / homeDistance * 15 : Math.sin(angle) * 15;
        }
      }
      if (vx || vy) {
        enemy.dir = direction(vx, vy);
        const nx = enemy.x + vx * dt, ny = enemy.y + vy * dt;
        if (enemy.mood === 'chase' && this._safeAt(nx, ny, enemy.zone)) enemy.mood = 'return';
        else if (MAP.zoneAt(Math.floor(nx / TILE), Math.floor(ny / TILE)) === enemy.zone) this._move(enemy, vx * dt, vy * dt, 3);
      }
      if (distance < 13 && canPursue && (enemy.mood === 'chase' || enemy.mood === 'alert')) {
        this.contactCooldown = 3;
        this.hero.vx = this.hero.vy = 0;
        this.game.startBattle({ foeId: `static-${enemy.zone}`, guardian: false, uid: enemy.uid, zone: enemy.zone });
        return true;
      }
    }
    return false;
  }

  _findInteraction() {
    const [fx, fy] = FACE[this.hero.facing];
    let best = null;
    let score = Infinity;
    for (const item of INTERACTABLES) {
      if (item.interaction === 'shard' && (this.game.state.shards.includes(item.id) || (item.puzzle && !this.solved.has(item.puzzle)))) continue;
      if (item.interaction === 'cache' && this.game.state.caches.includes(item.id)) continue;
      const dx = item.x - this.hero.x;
      const dy = item.y - this.hero.y;
      const distance = Math.hypot(dx, dy);
      const maxDistance = item.interaction === 'lighthouse' ? 40 : item.interaction === 'shrine' ? 37 : 28;
      if (distance > maxDistance) continue;
      const dot = distance ? (dx * fx + dy * fy) / distance : 1;
      if (distance > 16 && dot < -0.35) continue;
      const candidateScore = distance - dot * 8;
      if (candidateScore < score) { best = item; score = candidateScore; }
    }
    return best;
  }

  _interact(item) {
    const game = this.game;
    this.hero.vx = this.hero.vy = 0;
    if (item.interaction === 'npc') {
      if (item.id === 'point-keeper' && game.state.friends.length === 7) {
        if (game.hasFlag('ending-seen')) game.say({ speaker: 'Keeper Moss', portrait: 'keeper', text: 'The Oracle is home. The kettle has finally stopped applauding. Your island, and all its side trails, are yours to explore.' });
        else game.say(npcDialogue(item, game.state), { onDone: () => game.playEnding() });
        return;
      }
      const first = !game.hasFlag(`talk-${item.id}`);
      game.setFlag(`talk-${item.id}`);
      game.say(npcDialogue(item, game.state, first));
      game.save();
    } else if (item.interaction === 'sign') game.say(signText(item.zone));
    else if (item.interaction === 'camp') game.restAtCamp(item.id);
    else if (item.interaction === 'cache') game.openCache(item.id);
    else if (item.interaction === 'shard') game.collectShard(item.id);
    else if (item.interaction === 'stone') {
      if (this._stoneAwake(item.zone)) game.say([stoneText(item.zone), 'The stone is awake. Its guardian shrine is unsealed. N opens your Field Notes.']);
      else game.say([stoneText(item.zone)], { onDone: () => this.awakenStone(item.zone) });
    } else if (item.interaction === 'shrine') {
      if (game.state.friends.includes(item.zone)) game.say({ speaker: GUARDIANS[item.zone].name, portrait: GUARDIANS[item.zone].key, text: 'A little more colour. A little less lonely. Thanks for finding me.' });
      else if (item.zone > 0 && !game.state.friends.includes(item.zone - 1)) game.say('The Static seal is still strong. Help the earlier guardians first.');
      else if (!this._stoneAwake(item.zone)) game.say('The shrine is sealed. Wake this zone’s glowing Grid Stone first.');
      else game.say(shrineDialogue(item.zone), { onDone: () => game.startBattle({ foeId: GUARDIANS[item.zone].key, guardian: true, uid: item.id, zone: item.zone }) });
    } else if (item.interaction === 'lighthouse') {
      if (game.hasFlag('ending-seen')) game.say({ speaker: 'The Oracle', portrait: 'oracle', text: 'A smaller satchel. A larger circle of friends. Thank you for bringing me home.' });
      else if (game.state.friends.length === 7) game.playEnding();
      else game.say({ speaker: 'The Lighthouse', portrait: 'oracle', text: 'A warm light, an enormous empty chair. Bring all seven spirit friends home.' });
    } else if (item.interaction === 'puzzle') {
      if (this.solved.has(item.id)) game.say('Four stones, a steady crossing. Your bridge remembers. The shard is on the far bank.');
      else {
        this.puzzle = new SnapBridge(game, PUZZLES[item.zone], {
          onSolve: () => {
            this.solved.add(item.id);
            for (const cell of BRIDGES[item.zone].cells) this.chunks.delete(`${Math.floor(cell.tx / CHUNK)},${Math.floor(cell.ty / CHUNK)}`);
          },
          onClose: () => {
            this.puzzle = null;
            this.contactCooldown = 2;
            if (this.solved.has(item.id)) game.toast('SNAP! The crossing is steady. Reach the bit shard.', { kind: 'reward', ms: 3000 });
          },
        });
      }
    }
  }

  _ambience(biome) {
    let ambience = this.ambiences.get(biome);
    if (!ambience) {
      ambience = createAmbience(biome, { reduced: this.game.reducedMotion });
      this.ambiences.set(biome, ambience);
    }
    return ambience;
  }

  _updateCamera(dt, screen) {
    const look = this.game.reducedMotion ? 0 : 1;
    const x = clamp(this.hero.x + this.hero.vx * 0.18 * look - screen.w / 2, 0, MAP.width * TILE - screen.w);
    const y = clamp(this.hero.y + this.hero.vy * 0.14 * look - screen.h * 0.56, 0, MAP.height * TILE - screen.h);
    const follow = this.cameraSnap ? 1 : 1 - Math.exp(-dt * 7);
    this.camera.x += (x - this.camera.x) * follow;
    this.camera.y += (y - this.camera.y) * follow;
    this.cameraSnap = false;
  }

  update(dt, input) {
    const screen = this.game.screen;
    this.contactCooldown = Math.max(0, this.contactCooldown - dt);
    if (this.pendingStone) {
      this._updateCamera(dt, screen);
      if (this.game.time >= this.pendingStone.ready) {
        const zone = this.pendingStone.zone;
        this.pendingStone = null;
        this.game.setFlag(`stone-${zone}`);
        this.game.unlockTechnique(ZONES[zone].technique);
        for (const enemy of this.statics) if (enemy.zone === zone) this._syncPatrol(enemy);
      }
      return;
    }
    if (this.puzzle) {
      this.puzzle.update(dt, input);
      this._updateCamera(dt, screen);
      return;
    }
    const axis = input.axis();
    const magnitude = Math.max(1, Math.hypot(axis.x, axis.y));
    const x = axis.x / magnitude;
    const y = axis.y / magnitude;
    const speed = input.held('run') ? 112 : 68;
    this.hero.vx = approach(this.hero.vx, x * speed, dt * (x ? 530 : 760));
    this.hero.vy = approach(this.hero.vy, y * speed, dt * (y ? 530 : 760));
    if (x || y) this.hero.facing = direction(x, y);
    const oldX = this.hero.x;
    const oldY = this.hero.y;
    this._move(this.hero, this.hero.vx * dt, this.hero.vy * dt);
    const distance = Math.hypot(this.hero.x - oldX, this.hero.y - oldY);
    this.hero.moving = distance > 0.08;
    this.hero.step += distance / 7;
    this.stepDistance += distance;
    if (this.stepDistance > (this.game.reducedMotion ? 24 : 13)) {
      this.stepDistance = 0;
      if (this.dust.length < 12) this.dust.push({ x: this.hero.x, y: this.hero.y, life: 0.3 });
      this.game.audio.play('step');
    }
    for (let i = this.dust.length - 1; i >= 0; i--) {
      this.dust[i].life -= dt;
      if (this.dust[i].life <= 0) this.dust.splice(i, 1);
    }
    this._syncFollowers();
    this._updateFollowers(dt);
    this._updateCamera(dt, screen);
    const zone = this.position.zone;
    const biome = zone < 0 ? 'point' : ZONES[zone].biome;
    this._ambience(biome).update(dt, this.camera.x, this.camera.y, screen.w, screen.h);
    if (zone >= 0 && !this.restored.has(zone)) this._ambience('static').update(dt, this.camera.x, this.camera.y, screen.w, screen.h);
    for (const gate of GATES) if (this.game.state.friends.includes(gate.requires) && !this.gateOpen.has(gate.id)) {
      this.gateOpen.add(gate.id);
      this.gateTimes.set(gate.id, this.game.time);
      this.game.audio.play('gate');
    }
    this.nearby = this._findInteraction();
    if (input.pressed('confirm') && this.nearby) {
      input.consume('confirm');
      this._interact(this.nearby);
      return;
    }
    this._updateStaticlings(dt);
  }

  _chunk(cx, cy) {
    const key = `${cx},${cy}`;
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = makeCanvas(CHUNK * TILE, CHUNK * TILE);
      paintTerrainChunk(chunk.ctx, this.map, cx * CHUNK, cy * CHUNK, CHUNK, CHUNK, 0, 0);
      this.chunks.set(key, chunk);
    }
    return chunk.canvas;
  }

  _drawTerrain(ctx, cx, cy, width, height, t) {
    const size = CHUNK * TILE;
    const x0 = Math.floor(cx / size);
    const y0 = Math.floor(cy / size);
    const x1 = Math.floor((cx + width) / size);
    const y1 = Math.floor((cy + height) / size);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) ctx.drawImage(this._chunk(x, y), x * size - cx, y * size - cy);
    drawTerrainAnimated(ctx, this.map, cx, cy, width, height, this.game.reducedMotion ? 0 : t);
  }

  _propState(item) {
    if (item.interaction === 'stone') return this._stoneAwake(item.zone) || this.pendingStone?.zone === item.zone ? 'awake' : 'sleeping';
    if (item.interaction === 'shrine') return this.restored.has(item.zone) ? 'restored' : this._stoneAwake(item.zone) ? 'open' : 'sealed';
    if (item.interaction === 'cache') return this.game.state.caches.includes(item.id) ? 'open' : 'closed';
    return undefined;
  }

  _heroSilhouette() {
    const dir = this.hero.facing;
    let canvas = this.heroSilhouettes.get(dir);
    if (canvas) return canvas;
    const surface = makeCanvas(32, 36);
    drawCharacter(surface.ctx, 'hero', 16, 30, { dir, frame: -1, t: 1 });
    const image = surface.ctx.getImageData(0, 0, 32, 36);
    const source = new Uint32Array(image.data.buffer);
    const alpha = Uint8Array.from(source, (word, i) => i < 30 * 32 && word >>> 24 > 127 ? 1 : 0);
    for (let i = 0; i < source.length; i++) {
      if (!alpha[i]) { source[i] = 0; continue; }
      const edge = !alpha[i - 1] || !alpha[i + 1] || !alpha[i - 32] || !alpha[i + 32];
      source[i] = u32(edge ? PAL.cream[2] : PAL.teal[2]);
    }
    surface.ctx.putImageData(image, 0, 0);
    canvas = surface.canvas;
    this.heroSilhouettes.set(dir, canvas);
    return canvas;
  }

  _drawSolvedBridge(ctx, bridge, cx, cy) {
    let deck = this.bridgeDecks.get(bridge.id);
    if (!deck) {
      const path = this._bridgePath(bridge);
      const left = Math.min(...bridge.cells.map((cell) => cell.tx)) * TILE;
      const top = Math.min(...bridge.cells.map((cell) => cell.ty)) * TILE;
      const right = (Math.max(...bridge.cells.map((cell) => cell.tx)) + 1) * TILE;
      const bottom = (Math.max(...bridge.cells.map((cell) => cell.ty)) + 1) * TILE;
      const surface = makeCanvas(right - left, bottom - top + 6);
      // Rasterize the four connected treads once, including corner profiles.
      // Hero/friend feet use this exact height field, not a separate flat lane.
      for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
        const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
        if (!path.cells.has(`${tx},${ty}`)) continue;
        const lift = this._pathLift(path, x, y);
        const edge = x % TILE === 0 && !path.cells.has(`${tx - 1},${ty}`) || x % TILE === TILE - 1 && !path.cells.has(`${tx + 1},${ty}`) || y % TILE === 0 && !path.cells.has(`${tx},${ty - 1}`) || y % TILE === TILE - 1 && !path.cells.has(`${tx},${ty + 1}`);
        surface.ctx.fillStyle = PAL.stone[2];
        surface.ctx.fillRect(x - left, y - top + 6 - lift, 1, lift + 1);
        surface.ctx.fillStyle = edge ? PAL.teal[5] : x % TILE === 0 || y % TILE === 0 ? PAL.stone[3] : PAL.stone[5];
        surface.ctx.fillRect(x - left, y - top + 6 - lift, 1, 1);
      }
      deck = { canvas: surface.canvas, x: left, y: top - 6 };
      this.bridgeDecks.set(bridge.id, deck);
    }
    ctx.drawImage(deck.canvas, deck.x - cx, deck.y - cy);
  }

  _drawEntities(ctx, actors, cx, cy, width, height, t) {
    const list = this.renderList;
    list.length = 0;
    for (const item of sortedProps) {
      if (!propVisible(item, cx, cy, width, height)) continue;
      if (item.interaction === 'shard' && this.game.state.shards.includes(item.id)) continue;
      if (PROPS[item.kind]?.ground) {
        drawProp(ctx, item.kind, Math.round(item.x - cx), Math.round(item.y - cy), { t, biome: item.biome, variant: item.variant ?? item.zone + 1, reduced: this.game.reducedMotion });
        continue;
      }
      list.push({ type: 'prop', y: item.y, item });
      if (item.interaction === 'shrine' && !this.restored.has(item.zone)) list.push({ type: 'guardian', y: item.y + 13, item });
    }
    for (const bridge of BRIDGES) {
      if (this.solved.has(bridge.id)) {
        if (bridge.cells.some((cell) => cell.x > cx - TILE && cell.x < cx + width + TILE && cell.y > cy - TILE && cell.y < cy + height + TILE)) this._drawSolvedBridge(ctx, bridge, cx, cy);
        continue;
      }
      const puzzle = this.puzzle?.puzzle.id === bridge.id ? this.puzzle : null;
      const heights = puzzle && ['snap', 'result'].includes(puzzle.phase) ? puzzle.result.recon : PUZZLES[bridge.zone].idleHeights ?? PUZZLES[bridge.zone].values;
      for (let i = 0; i < bridge.cells.length; i++) {
        const cell = bridge.cells[i];
        if (cell.x < cx - 20 || cell.x > cx + width + 20 || cell.y < cy - 20 || cell.y > cy + height + 30) continue;
        const shift = Math.round(heights[i] / PUZZLES[bridge.zone].amax * 10);
        list.push({ type: 'float', y: cell.y, item: { ...cell, shift, biome: ZONES[bridge.zone].biome } });
      }
    }
    for (const gate of GATES) {
      const opening = this.gateTimes.get(gate.id);
      const open = this.game.state.friends.includes(gate.requires);
      if (open && (opening === undefined || t - opening > 1.1)) continue;
      if (!propVisible(gate, cx, cy, width, height)) continue;
      list.push({ type: 'gate', y: gate.y, item: gate, opening: open });
    }
    for (const enemy of this.statics) if ((enemy.alive || enemy.purifyUntil > t) && enemy.x > cx - 20 && enemy.x < cx + width + 20 && enemy.y > cy - 10 && enemy.y < cy + height + 25) list.push({ type: 'static', y: enemy.y, item: enemy });
    for (const friend of this.followers) list.push({ type: 'friend', y: friend.y, item: friend });
    list.push({ type: 'hero', y: this.hero.y, item: this.hero });
    list.sort((a, b) => a.y - b.y);
    const heroX = Math.round(this.hero.x - cx), heroY = Math.round(this.hero.y - cy) - this._bridgeLift(this.hero.x, this.hero.y);
    let heroDrawn = false;
    // Foreground props erase actors in normal Y-order. Only the hero gets a
    // cached, motion-stable silhouette, clipped to the actual overhang pixels.
    const prop = (kind, x, y, options) => {
      const opts = { ...options, reduced: this.game.reducedMotion };
      drawProp(ctx, kind, x, y, opts);
      if (this.materialLayer) {
        const material = this.materialLayer.ctx;
        material.globalCompositeOperation = landmarkKinds.has(kind) ? 'source-over' : 'destination-out';
        drawProp(material, kind, x, y, opts);
        material.globalCompositeOperation = 'source-over';
      }
      actors.globalCompositeOperation = 'destination-out';
      drawProp(actors, kind, x, y, opts);
      actors.globalCompositeOperation = 'source-over';
      if (!heroDrawn || !propVisible({ kind, x, y }, heroX - 16, heroY - 30, 32, 36)) return;
      this.heroCover ??= makeCanvas(32, 36);
      const cover = this.heroCover.ctx;
      cover.clearRect(0, 0, 32, 36);
      drawProp(cover, kind, x - heroX + 16, y - heroY + 30, opts);
      cover.globalCompositeOperation = 'source-in';
      cover.drawImage(this._heroSilhouette(), 0, 0);
      cover.globalCompositeOperation = 'source-over';
      actors.drawImage(this.heroCover.canvas, heroX - 16, heroY - 30);
    };
    for (const entry of list) {
      const item = entry.item;
      const x = Math.round(item.x - cx), y = Math.round(item.y - cy);
      if (entry.type === 'prop') {
        if (item.kind === 'npc') drawCharacter(actors, item.character, x, y, { dir: this.nearby?.id === item.id ? direction(this.hero.x - item.x, this.hero.y - item.y) : 'down', frame: -1, t });
        else prop(item.kind, x, y, { t, variant: item.variant ?? item.zone + 1, biome: item.biome, state: this._propState(item) });
      } else if (entry.type === 'guardian') drawSpirit(actors, GUARDIANS[item.zone].key, x, y + 13, { t, dir: 'down', moving: false, corrupted: true });
      else if (entry.type === 'float') prop('stone-float', x, y - item.shift, { t, biome: item.biome, state: 'floating' });
      else if (entry.type === 'gate') prop('gate', x, y, { t: entry.opening ? t - this.gateTimes.get(item.id) : t, state: entry.opening ? 'opening' : 'closed', biome: item.biome, variant: item.orientation === 'vertical' ? 1 : 0, progress: entry.opening ? clamp((t - this.gateTimes.get(item.id)) / 1.1) : 0 });
      else if (entry.type === 'static') {
        if (item.lifecycle === 'PURIFIED') {
          const age = 0.8 - (item.purifyUntil - t);
          actors.fillStyle = PAL.gold[6];
          for (let i = 0; i < (this.game.reducedMotion ? 2 : 4); i++) {
            const sx = x + Math.round(Math.cos(i * Math.PI / 2) * (3 + age * 9));
            const sy = y - 8 + Math.round(Math.sin(i * Math.PI / 2) * (3 + age * 7) - age * 6);
            actors.fillRect(sx - 1, sy, 3, 1);
            actors.fillRect(sx, sy - 1, 1, 3);
          }
        } else {
          const sleeping = item.lifecycle === 'DORMANT';
          drawStaticling(actors, item.zone, x, y, { t: sleeping ? 0 : t, dir: item.dir, alert: !sleeping && (item.mood === 'alert' || item.mood === 'chase') });
          if (sleeping) drawText(actors, 'z', x + 6, y - 22, { font: 'small', color: PAL.cream[1], shadow: PAL.shadow });
        }
      } else if (entry.type === 'friend') drawSpirit(actors, GUARDIANS[item.zone].key, x, y - this._bridgeLift(item.x, item.y), { t, dir: item.dir, moving: item.moving, corrupted: false });
      else {
        drawCharacter(actors, 'hero', heroX, heroY, { dir: this.hero.facing, frame: this.hero.moving ? Math.floor(this.hero.step) % 4 : -1, t });
        heroDrawn = true;
      }
    }
  }

  _paletteSample(zone) {
    let samples = this.paletteSamples.get(zone);
    if (samples) return samples;
    const region = REGIONS.find((item) => item.id === zone);
    const surface = makeCanvas(region.w * TILE, region.h * TILE);
    paintTerrainChunk(surface.ctx, this.map, region.x, region.y, region.w, region.h, 0, 0);
    const image = surface.ctx.getImageData(0, 0, surface.canvas.width, surface.canvas.height);
    const words = new Uint32Array(image.data.buffer);
    const ground = [], material = [], warm = [], glow = [];
    const grade = (word) => staticGrade(word & 255, (word >>> 8) & 255, (word >>> 16) & 255);
    const stride = Math.max(1, Math.floor(words.length / 2048));
    for (let i = 0; i < words.length; i += stride) {
      const tx = region.x + Math.floor((i % image.width) / TILE), ty = region.y + Math.floor(i / image.width / TILE);
      if (MAP.zoneAt(tx, ty) === zone && isWalkable(this.map.get(tx, ty))) ground.push(grade(words[i]));
    }
    // Sample each material at its own scale. A tiny campfire gets the same
    // fitting budget as a wall; neither can be drowned out by the floor area.
    const kinds = new Set();
    for (const item of sortedProps) {
      if (item.zone !== zone || item.kind === 'npc' || kinds.has(item.kind)) continue;
      kinds.add(item.kind);
      const d = PROPS[item.kind], prop = makeCanvas(d.w, d.h);
      drawProp(prop.ctx, item.kind, d.ax, d.ay, { t: 0, biome: item.biome, variant: item.variant ?? zone + 1, state: item.interaction === 'shrine' ? 'open' : 'awake', reduced: true });
      const data = prop.ctx.getImageData(0, 0, d.w, d.h);
      const pixels = new Uint32Array(data.data.buffer);
      const opaque = [];
      for (const word of pixels) if (word >>> 24 > 127) opaque.push(grade(word));
      const step = Math.max(1, Math.floor(opaque.length / 256));
      for (let i = 0; i < opaque.length; i += step) {
        const word = opaque[i];
        material.push(word);
        if (['campfire', 'lamp', 'lantern', 'furnace', 'forge-stack'].includes(item.kind)) warm.push(word);
        if (item.interaction === 'stone' || item.interaction === 'shrine') glow.push(word);
      }
    }
    samples = { ground, material, warm, glow };
    this.paletteSamples.set(zone, samples);
    return samples;
  }

  _palette(zone, bits = this._colourBits(zone)) {
    const key = `${zone}:${bits}`;
    let palette = this.palettes.get(key);
    if (palette) return palette;
    const samples = this._paletteSample(zone);
    const asImage = (words) => ({ data: new Uint8ClampedArray(Uint32Array.from(words).buffer), width: words.length, height: 1 });
    const graded = (colour) => staticGrade(...rgbaOf(colour).slice(0, 3));
    const nearest = (words, target) => words.reduce((best, word) => colourDistance(word, target) < colourDistance(best, target) ? word : best);
    const ground = u32(medianCutPalette(asImage(samples.ground), 1)[0]);
    const highlight = nearest(samples.glow, graded(zone === 6 ? PAL.teal[7] : PAL.stone[6]));
    const warmth = nearest(samples.warm, graded(PAL.gold[6]));
    // All depths retain four semantic roles: outline, biome floor, cool/lit
    // structure, warm fire. Extra bits refine the same balanced clean sample.
    const colours = [...new Set([
      nearest(samples.material, graded(PAL.stone[0])),
      ground,
      highlight,
      warmth,
    ])];
    const balanced = [...samples.ground, ...samples.material];
    const count = 2 ** bits;
    const candidates = [...new Set(medianCutPalette(asImage(balanced), count * 2).map(u32))];
    if (new Set([...colours, ...candidates]).size < count) candidates.push(...new Set(balanced));
    while (colours.length < count) {
      let best = 0, distance = -1;
      for (const candidate of candidates) {
        const separation = Math.min(...colours.map((colour) => colourDistance(candidate, colour)));
        if (separation > distance) { best = candidate; distance = separation; }
      }
      colours.push(best);
    }
    const fitted = buildPaletteLUT(colours);
    // Fold the mild violet grade into the lookup once; actors never enter it.
    const lut = new Uint8Array(32768);
    const materialLut = bits === 2 ? new Uint8Array(32768) : lut;
    for (let r = 0; r < 32; r++) for (let g = 0; g < 32; g++) for (let b = 0; b < 32; b++) {
      const R = r * 8 + 4, G = g * 8 + 4, B = b * 8 + 4;
      const colour = staticGrade(R, G, B);
      const index = (((colour & 255) >> 3) << 10) | ((((colour >>> 8) & 255) >> 3) << 5) | (((colour >>> 16) & 255) >> 3);
      const source = (r << 10) | (g << 5) | b;
      lut[source] = fitted.lut[index];
      materialLut[source] = lut[source];
      if (bits === 2) {
        // Identical stone/wood can occur in both paving and walls. A real prop
        // alpha mask selects material roles without adding a fifth colour.
        const light = R * 0.2126 + G * 0.7152 + B * 0.0722;
        const warm = light >= 65 && R > G * 1.4 && R > B * 1.2 || light > 145 && R > B + 20 && G > B + 12;
        if (warm) materialLut[source] = colours.indexOf(warmth);
        else if (light >= 65 && Math.max(R, G, B) - Math.min(R, G, B) < 72) materialLut[source] = colours.indexOf(highlight);
      }
    }
    palette = { ...fitted, lut, materialLut };
    this.palettes.set(key, palette);
    return palette;
  }

  _rampTransitions(image) {
    const { width, height } = image;
    const words = new Uint32Array(image.data.buffer, image.data.byteOffset, width * height);
    if (this.rampMask.length < words.length) this.rampMask = new Uint8Array(words.length);
    this.rampMask.fill(0, 0, words.length);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (x > 0 && x < width - 1 && rampTransition(words[i - 1], words[i], words[i + 1]) || y > 0 && y < height - 1 && rampTransition(words[i - width], words[i], words[i + width])) this.rampMask[i] = 1;
    }
    return this.rampMask;
  }

  _posterize(image, palette, transitions, ox, oy, mask, materials = null) {
    const { width, height } = image;
    const words = new Uint32Array(image.data.buffer, image.data.byteOffset, width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x, word = words[i];
      if (word >>> 24 === 0 || !mask(x, y)) continue;
      const offset = transitions[i] ? (bayer(x + ox, y + oy) - 0.5) * 8 : 0;
      const r = clamp((word & 255) + offset, 0, 255) >> 3;
      const g = clamp(((word >>> 8) & 255) + offset, 0, 255) >> 3;
      const b = clamp(((word >>> 16) & 255) + offset, 0, 255) >> 3;
      const lut = materials && materials[i] >>> 24 > 127 ? palette.materialLut : palette.lut;
      words[i] = (palette.words[lut[(r << 10) | (g << 5) | b]] & 0xffffff) | (word & 0xff000000);
    }
  }

  _corrupt(ctx, cx, cy, width, height, t) {
    const regions = new Map();
    for (let ty = Math.floor(cy / TILE); ty <= Math.floor((cy + height - 1) / TILE); ty++) {
      for (let tx = Math.floor(cx / TILE); tx <= Math.floor((cx + width - 1) / TILE); tx++) {
        const zone = MAP.zoneAt(tx, ty);
        if (zone < 0) continue;
        const restore = this.restorations.get(zone);
        if (restore && t - restore.start >= restore.duration) this.restorations.delete(zone);
        if (this.restored.has(zone) && !this.restorations.has(zone)) continue;
        let bounds = regions.get(zone);
        if (!bounds) regions.set(zone, (bounds = { x: width, y: height, r: 0, b: 0 }));
        bounds.x = Math.min(bounds.x, Math.max(0, tx * TILE - cx));
        bounds.y = Math.min(bounds.y, Math.max(0, ty * TILE - cy));
        bounds.r = Math.max(bounds.r, Math.min(width, (tx + 1) * TILE - cx));
        bounds.b = Math.max(bounds.b, Math.min(height, (ty + 1) * TILE - cy));
      }
    }
    for (const [zone, bounds] of regions) {
      const ox = cx + bounds.x;
      const oy = cy + bounds.y;
      const restore = this.restorations.get(zone);
      const radius = restore ? clamp((t - restore.start) / restore.duration) * restore.radius : -1;
      let ripple = this.depthRipples.get(zone);
      if (ripple && t - ripple.start >= ripple.duration) {
        this.depthRipples.delete(zone);
        ripple = null;
      }
      const depthRadius = ripple ? clamp((t - ripple.start) / ripple.duration) * ripple.radius : 0;
      const image = ctx.getImageData(bounds.x, bounds.y, bounds.r - bounds.x, bounds.b - bounds.y);
      const bits = this._colourBits(zone);
      const needsColour = (x, y, outsideRipple = false) => {
        const wx = ox + x, wy = oy + y;
        if (MAP.zoneAt(wx >> 4, wy >> 4) !== zone) return false;
        if (restore) {
          const r = radius + (bayer(wx, wy) - 0.5) * 16;
          if ((wx - restore.x) ** 2 + (wy - restore.y) ** 2 <= r * r) return false;
        }
        if (!ripple) return true;
        const r = depthRadius + (bayer(wx, wy) - 0.5) * 10;
        const outside = (wx - ripple.x) ** 2 + (wy - ripple.y) ** 2 > r * r;
        return outside === outsideRipple;
      };
      const transitions = this._rampTransitions(image);
      const materialImage = bits === 2 || ripple && ZONES[zone].corruptBits === 2 ? this.materialLayer.ctx.getImageData(bounds.x, bounds.y, image.width, image.height) : null;
      const materials = materialImage && new Uint32Array(materialImage.data.buffer, materialImage.data.byteOffset, image.width * image.height);
      this._posterize(image, this._palette(zone, bits), transitions, ox, oy, (x, y) => needsColour(x, y), materials);
      if (ripple) this._posterize(image, this._palette(zone, ZONES[zone].corruptBits), transitions, ox, oy, (x, y) => needsColour(x, y, true), materials);
      ctx.putImageData(image, bounds.x, bounds.y);
    }
  }

  draw(ctx, screen, t) {
    if (screen.w !== this.lastWidth || screen.h !== this.lastHeight) {
      this.cameraSnap = true;
      this.lastWidth = screen.w;
      this.lastHeight = screen.h;
      this.worldLayer = makeCanvas(screen.w, screen.h);
      this.actorLayer = makeCanvas(screen.w, screen.h);
      this.materialLayer = makeCanvas(screen.w, screen.h);
    }
    if (this.cameraSnap) this._updateCamera(0, screen);
    const cx = Math.round(this.camera.x);
    const cy = Math.round(this.camera.y);
    const environment = this.worldLayer.ctx;
    const actors = this.actorLayer.ctx;
    actors.clearRect(0, 0, screen.w, screen.h);
    this.materialLayer.ctx.clearRect(0, 0, screen.w, screen.h);
    this._drawTerrain(environment, cx, cy, screen.w, screen.h, t);
    for (const dust of this.dust) {
      environment.fillStyle = PAL.sand[4];
      const shift = Math.round((0.3 - dust.life) * 9);
      environment.fillRect(Math.round(dust.x - cx) - shift - 1, Math.round(dust.y - cy) - shift, 2, 1);
      environment.fillRect(Math.round(dust.x - cx) + shift + 1, Math.round(dust.y - cy) + 1, 2, 1);
    }
    this._drawEntities(environment, actors, cx, cy, screen.w, screen.h, t);
    const zone = this.position.zone;
    const biome = zone < 0 ? 'point' : ZONES[zone].biome;
    this._ambience(biome).draw(environment, cx, cy, t);
    if (zone >= 0 && !this.restored.has(zone)) this._ambience('static').draw(environment, cx, cy, t);
    this._corrupt(environment, cx, cy, screen.w, screen.h, t);
    ctx.drawImage(this.worldLayer.canvas, 0, 0);
    ctx.drawImage(this.actorLayer.canvas, 0, 0);
    if (this.nearby && !this.puzzle && !this.pendingStone && !this.game.dialogue?.active && !this.game.lessonCard?.active && !this.game.pauseMenu?.active && !this.game.codex?.active) {
      const item = this.nearby;
      const label = { npc: 'Talk', camp: 'Rest', stone: 'Learn', shrine: 'Meet', puzzle: 'Bridge', cache: 'Open', shard: 'Take', sign: 'Read', lighthouse: 'Enter' }[item.interaction];
      const width = measureText(label, 'body') + 24;
      const x = clamp(Math.round(item.x - cx - width / 2), 5, screen.w - width - 5);
      const top = item.kind === 'npc' ? 24 : PROPS[item.kind]?.h ?? 16;
      const y = clamp(Math.round(Math.min(item.y - top - 13, this.hero.y - 43) - cy), 30, screen.h - 42);
      drawWindow(ctx, x, y, width, 15, 'glass', t);
      drawKeyCap(ctx, this.game.input?.lastDevice === 'touch' ? 'A' : 'E', x + 3, y + 3);
      drawText(ctx, label, x + 18, y + 4, { color: PAL.ui.text });
    }
    const stats = heroStats(this.game.state);
    const objective = this.objective();
    drawWorldHud(ctx, screen, {
      zoneName: zone < 0 ? HUB.name : ZONES[zone].name,
      hp: this.game.state.hero.hp, maxHp: stats.maxHp,
      bytes: this.game.state.hero.bytes, maxBytes: stats.maxBytes,
      snacks: this.game.state.hero.snacks, shards: this.game.state.shards.length,
      friends: this.game.state.friends,
      objective: objective && { text: objective.text, dx: objective.x - this.hero.x, dy: objective.y - this.hero.y },
    }, t);
    this.puzzle?.draw(ctx, screen, t);
  }

  describe() {
    if (this.puzzle) return this.puzzle.describe();
    if (this.pendingStone) return `Grid Stone awakening. ${ZONES[this.pendingStone.zone].corruptBits} to ${this._colourBits(this.pendingStone.zone)} colour bits.`;
    const chasers = this.statics.filter((enemy) => enemy.alive && enemy.mood === 'chase').length;
    return `${this.nearby ? interactionName(this.nearby, this.game.state) + '. ' : ''}${chasers ? `${chasers} Staticling chasing. ` : ''}${this.objective()?.text ?? 'Explore the island'}.`;
  }
}
