// Lead-owned wrapper: owns the World instance, zone music/banners and autosave.
import { World } from '../world/world.js';
import { HUB, ZONES } from '../content/game-data.js';

export class WorldScene {
  constructor(game) {
    this.game = game;
    this.world = new World(game);
    this.zone = null;
    this.saveClock = 0;
    this.lastSaved = '';
  }

  /** Fresh island simulation (new game / restart). */
  reset() {
    this.world = new World(this.game);
    this.zone = null;
  }

  enter(params = {}) {
    this.world.setState(this.game.state);
    this.zone = null;
    // Returning from a battle restores zone music without repeating the banner.
    this._syncZone(!params.fromBattle);
    if (params.afterEnding) this.game.toast('All seven friends are home. Explore freely!', { kind: 'reward', ms: 4000 });
  }

  _syncZone(banner = true) {
    const zone = this.world.position.zone;
    if (zone === this.zone) return;
    this.zone = zone;
    const info = ZONES[zone];
    this.game.setMusicScene(info ? info.key : 'overworld');
    if (banner) this.game.toast(info ? info.name : HUB.name, { kind: 'zone', ms: 2400 });
  }

  update(dt, input) {
    this.world.update(dt, input);
    if (this.game.scene !== this) return;
    this._syncZone();
    this.saveClock += dt;
    if (this.saveClock >= 2) {
      this.saveClock = 0;
      const p = this.world.position;
      const key = `${Math.round(p.x)},${Math.round(p.y)}`;
      if (key !== this.lastSaved) {
        this.lastSaved = key;
        this.game.save();
      }
    }
  }

  draw(ctx, screen, t) {
    this.world.draw(ctx, screen, t);
  }
}
