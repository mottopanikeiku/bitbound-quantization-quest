// Battle state machine. API fixed by the v2 contract; owned by Battle (stub below).
import { FOES } from './foes.js';
import { drawBattleView } from './battle-view.js';

export class Battle {
  constructor({ game, foeId, guardian = false, uid = null, zone = 0 }) {
    this.game = game;
    this.foe = FOES[foeId] ?? FOES['static-0'];
    this.foeId = this.foe.id;
    this.guardian = guardian;
    this.uid = uid;
    this.zone = zone;
    this.hero = { ...game.state.hero };
    this.gear = { ...game.state.gear };
    this.foeHp = this.foe.hp;
    this.menu = 0;
    this.message = `${this.foe.name} blocks the way!`;
    this.phase = 'menu';
    this.finished = false;
    this.result = null;
    this.stats = { perfects: 0, fizzles: 0, turns: 0 };
  }

  get canPause() {
    return this.phase === 'menu';
  }

  _end(outcome) {
    this.phase = 'result';
    this.result = { outcome, hero: { ...this.hero }, gear: { ...this.gear }, guardian: this.guardian, foeId: this.foeId, stats: { ...this.stats } };
  }

  update(dt, input) {
    if (this.phase === 'result') {
      if (input.pressed('confirm')) {
        input.consume('confirm');
        this.finished = true;
      }
      return;
    }
    if (input.repeat('up') || input.repeat('left')) this.menu = (this.menu + 2) % 3;
    if (input.repeat('down') || input.repeat('right')) this.menu = (this.menu + 1) % 3;
    if (!input.pressed('confirm')) return;
    input.consume('confirm');
    this.stats.turns++;
    if (this.menu === 0) {
      this.foeHp = Math.max(0, this.foeHp - 20);
      this.message = 'SNAP! 20 damage.';
      if (this.foeHp === 0) return this._end('won');
    } else if (this.menu === 2) return this._end('fled');
    this.hero.hp = Math.max(0, this.hero.hp - 5);
    this.message += ' The foe strikes for 5.';
    if (this.hero.hp === 0) this._end('lost');
  }

  draw(ctx, screen, t) {
    drawBattleView(ctx, screen, this, t);
  }
}
