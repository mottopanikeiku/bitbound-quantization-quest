// Lead-owned wrapper: creates a Battle and hands its result to the game.
import { Battle } from '../battle/battle.js';

export class BattleScene {
  constructor(game) {
    this.game = game;
    this.battle = null;
    this.params = null;
    this.reported = false;
  }

  enter(params) {
    this.params = params;
    this.reported = false;
    this.battle = new Battle({ game: this.game, ...params });
  }

  get canPause() {
    return Boolean(this.battle?.canPause);
  }

  update(dt, input) {
    if (!this.battle) return;
    this.battle.update(dt, input);
    if (this.battle.finished && !this.reported) {
      this.reported = true;
      this.game.endBattle(this.battle.result, this.params);
    }
  }

  draw(ctx, screen, t) {
    this.battle?.draw(ctx, screen, t);
  }

  describe() {
    if (!this.battle) return '';
    if (typeof this.battle.describe === 'function') return this.battle.describe();
    return `Foe ${this.battle.foeId}`;
  }
}
