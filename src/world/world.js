// Island simulation and rendering. API fixed by the v2 contract; owned by World (stub below).
import { MAP, TILE } from './map.js';
import { paintTerrainChunk, isWalkable } from '../art/terrain.js';
import { drawCharacter } from '../art/characters.js';
import { drawSpirit, drawStaticling } from '../art/creatures.js';
import { drawProp } from '../art/props.js';
import { drawWorldHud } from '../ui/hud.js';
import { GUARDIANS, ZONES, heroStats } from '../content/game-data.js';
import { clamp } from '../engine/util.js';

export class World {
  constructor(game) {
    this.game = game;
    this.hero = { x: 6 * TILE, y: 13 * TILE + 8, facing: 'down', step: 0 };
    this.camera = { x: 0, y: 0 };
    this.shrines = GUARDIANS.map((g, i) => ({ id: g.id, key: g.key, x: (9 + i * 5) * TILE, y: 9 * TILE }));
    this.camp = { id: 'point-camp', x: 4 * TILE, y: 16 * TILE };
    this.statics = [{ uid: 'static-a', zone: 0, x: 20 * TILE, y: 18 * TILE, alive: true }];
    this.contactCooldown = 1;
  }

  setState(state) {
    if (state.position) {
      this.hero.x = state.position.x;
      this.hero.y = state.position.y;
    }
    this.hero.facing = state.facing;
  }

  get position() {
    return { x: this.hero.x, y: this.hero.y, zone: MAP.zoneAt(Math.floor(this.hero.x / TILE), Math.floor(this.hero.y / TILE)), facing: this.hero.facing };
  }

  devPlace(zoneId) {
    this.hero.x = this.shrines[zoneId].x;
    this.hero.y = this.shrines[zoneId].y + 40;
  }

  objective() {
    const next = this.game.state.friends.length;
    if (next >= 7) return { text: 'Return to the Lighthouse', x: this.camp.x, y: this.camp.y };
    const zone = ZONES[next];
    const shrine = this.shrines[next];
    if (!this.game.state.techniques.includes(zone.technique)) return { text: `Learn the ${zone.name} technique at the shrine`, x: shrine.x, y: shrine.y };
    return { text: `Befriend ${GUARDIANS[next].name}`, x: shrine.x, y: shrine.y };
  }

  restoreZone(zoneId) {}

  respawnStaticlings() {
    for (const s of this.statics) s.alive = true;
  }

  afterBattle(uid, outcome) {
    const s = this.statics.find((item) => item.uid === uid);
    if (s && outcome === 'won') s.alive = false;
    this.contactCooldown = 1.5;
  }

  returnToCamp() {
    this.hero.x = this.camp.x + 20;
    this.hero.y = this.camp.y;
  }

  _walkable(x, y) {
    return isWalkable(MAP.get(Math.floor(x / TILE), Math.floor(y / TILE)));
  }

  update(dt, input) {
    const game = this.game;
    this.contactCooldown = Math.max(0, this.contactCooldown - dt);
    const { x, y } = input.axis();
    const speed = input.held('run') ? 120 : 72;
    if (x || y) {
      this.hero.facing = Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'down' : 'up';
      this.hero.step += dt * 8;
      const nx = this.hero.x + x * speed * dt;
      const ny = this.hero.y + y * speed * dt;
      if (this._walkable(nx, this.hero.y)) this.hero.x = nx;
      if (this._walkable(this.hero.x, ny)) this.hero.y = ny;
    }
    for (const s of this.statics) {
      if (s.alive && this.contactCooldown === 0 && Math.hypot(s.x - this.hero.x, s.y - this.hero.y) < 12) {
        game.startBattle({ foeId: `static-${s.zone}`, guardian: false, uid: s.uid, zone: s.zone });
        return;
      }
    }
    if (!input.pressed('confirm')) return;
    input.consume('confirm');
    if (Math.hypot(this.camp.x - this.hero.x, this.camp.y - this.hero.y) < 24) {
      game.restAtCamp(this.camp.id);
      return;
    }
    for (const shrine of this.shrines) {
      if (Math.hypot(shrine.x - this.hero.x, shrine.y - this.hero.y) > 28) continue;
      const zone = ZONES[shrine.id];
      if (game.state.friends.includes(shrine.id)) game.say(`${GUARDIANS[shrine.id].name} is your friend now.`);
      else if (shrine.id > game.state.friends.length) game.say('A static seal. Befriend the earlier guardians first.');
      else if (!game.state.techniques.includes(zone.technique)) game.unlockTechnique(zone.technique);
      else game.startBattle({ foeId: shrine.key, guardian: true, uid: shrine.key, zone: shrine.id });
      return;
    }
  }

  draw(ctx, screen, t) {
    const viewW = screen.w;
    const viewH = screen.h;
    this.camera.x = clamp(this.hero.x - viewW / 2, 0, MAP.width * TILE - viewW);
    this.camera.y = clamp(this.hero.y - viewH / 2, 0, MAP.height * TILE - viewH);
    const cx = Math.round(this.camera.x);
    const cy = Math.round(this.camera.y);
    const tx0 = Math.floor(cx / TILE);
    const ty0 = Math.floor(cy / TILE);
    paintTerrainChunk(ctx, MAP, tx0, ty0, Math.ceil(viewW / TILE) + 1, Math.ceil(viewH / TILE) + 1, tx0 * TILE - cx, ty0 * TILE - cy);
    drawProp(ctx, 'campfire', this.camp.x - cx, this.camp.y - cy, { t });
    for (const shrine of this.shrines) {
      drawProp(ctx, `shrine-${shrine.id}`, shrine.x - cx, shrine.y - cy, { t });
      if (!this.game.state.friends.includes(shrine.id)) drawSpirit(ctx, shrine.id, shrine.x - cx, shrine.y - cy + 14, { t, corrupted: true });
    }
    for (const s of this.statics) if (s.alive) drawStaticling(ctx, s.zone, s.x - cx, s.y - cy, { t });
    const frame = Math.floor(this.hero.step) % 4;
    drawCharacter(ctx, 'hero', Math.round(this.hero.x - cx), Math.round(this.hero.y - cy), { dir: this.hero.facing, frame, t });
    const stats = heroStats(this.game.state);
    const objective = this.objective();
    drawWorldHud(ctx, screen, {
      zoneName: 'Bitleaf Meadow',
      hp: this.game.state.hero.hp,
      maxHp: stats.maxHp,
      bytes: this.game.state.hero.bytes,
      maxBytes: stats.maxBytes,
      snacks: this.game.state.hero.snacks,
      shards: this.game.state.shards.length,
      friends: this.game.state.friends,
      objective: objective && { text: objective.text, dx: objective.x - this.hero.x, dy: objective.y - this.hero.y },
    }, t);
  }
}
