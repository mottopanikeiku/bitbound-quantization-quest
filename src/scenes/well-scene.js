// The Static Well: an endless descent below Lighthouse Point. Each floor is one battle;
// the run keeps its own hero and limits, so the island adventure is never at risk.
// Between floors the run is suspended in state.wellRun and can be resumed later.
import { PAL } from '../art/palette.js';
import { drawText } from '../engine/font.js';
import { drawWindow, drawMenu } from '../ui/kit.js';
import { ZONES, TECHNIQUE_ORDER } from '../content/game-data.js';
import { newRun } from '../well/run.js';

export class WellScene {
  constructor(game) { this.game = game; this.run = null; this.age = 0; this.menu = []; this.selected = 0; this.summary = null; }

  /** Current floor (B1, B2, …); 0 outside a run. */
  get depth() { return this.run?.depth ?? 0; }

  enter(params = {}) {
    this.age = 0;
    this.selected = 0;
    this.game.setMusicScene('well');
    if (params.battleResult) this._afterBattle(params.battleResult);
    else {
      this.run = this.game.state.wellRun;
      this.summary = null;
    }
    this._buildMenu();
    this.game.announce(this.describe());
  }

  _buildMenu() {
    if (this.summary) this.menu = [{ key: 'leave', label: 'Climb out' }];
    else if (this.run) this.menu = [{ key: 'descend', label: `Descend to B${this.run.depth}` }, { key: 'suspend', label: 'Rest & leave (run saved)' }, { key: 'abandon', label: 'End expedition' }];
    else this.menu = [{ key: 'new', label: 'Begin an expedition' }, { key: 'leave', label: 'Climb out' }];
  }

  _newRun() {
    const state = this.game.state;
    const seed = (Math.random() * 0x100000000) >>> 0;
    this.run = newRun({ seed, techniques: state.techniques, friends: state.friends });
    this._suspend();
  }

  _suspend() {
    this.game.state.wellRun = this.run;
    this.game.save();
  }

  _afterBattle(result) {
    const run = this.run;
    run.hero = { ...result.hero };
    if (result.outcome === 'won') {
      run.cleared = run.depth;
      run.score += 100;
      this.game.emit('well-floor', { depth: run.depth, score: run.score });
      run.depth++;
      this._suspend();
    } else this._endRun(result.outcome === 'lost' ? 'defeat' : 'climb');
  }

  _endRun(cause) {
    const run = this.run;
    this.summary = { depth: run.cleared, score: run.score, seed: run.seed, cause };
    this.game.emit('well-end', { depth: run.cleared, score: run.score, seed: run.seed, cause });
    this.run = null;
    this.game.state.wellRun = null;
    this.game.save();
  }

  _descend() {
    const run = this.run;
    const families = TECHNIQUE_ORDER.filter((id) => run.techniques.includes(id));
    const zone = ZONES.find((z) => z.technique === families[(run.depth - 1) % families.length]).id;
    this.game.startBattle({
      foeId: `static-${zone}`,
      mode: 'well',
      uid: `well-${run.seed}-${run.depth}`,
      zone,
      well: { depth: run.depth, warden: run.depth % 5 === 0, hero: { ...run.hero }, limits: { ...run.limits } },
    });
  }

  update(dt, input) {
    this.age += dt;
    if (this.age < 0.3) return;
    if (input.repeat('up')) this.selected = (this.selected + this.menu.length - 1) % this.menu.length;
    if (input.repeat('down')) this.selected = (this.selected + 1) % this.menu.length;
    if (input.pressed('cancel')) {
      input.consume('cancel');
      input.consume('pause');
      this.game.leaveWell();
      return;
    }
    if (!input.pressed('confirm')) return;
    input.consume('confirm');
    const key = this.menu[this.selected]?.key;
    if (key === 'new') { this._newRun(); this._buildMenu(); }
    else if (key === 'descend') this._descend();
    else if (key === 'suspend' || key === 'leave') this.game.leaveWell();
    else if (key === 'abandon') { this._endRun('climb'); this._buildMenu(); }
  }

  draw(ctx, screen, t) {
    const { w, h } = screen;
    ctx.fillStyle = PAL.night[0];
    ctx.fillRect(0, 0, w, h);
    const ww = Math.min(w - 24, 260), wh = 132, x = Math.round((w - ww) / 2), y = Math.round((h - wh) / 2);
    drawWindow(ctx, x, y, ww, wh, 'default', t);
    const run = this.run, summary = this.summary;
    const title = summary ? `Expedition over · cleared B${summary.depth}` : run ? `The Static Well · B${run.depth}` : 'The Static Well';
    drawText(ctx, title, x + ww / 2, y + 10, { align: 'center', color: PAL.ui.gold });
    const info = summary ? `Score ${summary.score} · seed ${summary.seed.toString(16).padStart(8, '0')}` : run ? `HP ${run.hero.hp}/${run.limits.maxHp} · ${run.hero.bytes} B · score ${run.score}` : `Best: cleared B${this.game.state.progress.well.best}`;
    drawText(ctx, info, x + ww / 2, y + 28, { align: 'center', color: PAL.ui.dim });
    drawMenu(ctx, x + 18, y + 52, this.menu.map((item) => item.label), this.selected, { colWidth: ww - 36, rowHeight: 17, t: this.game.reducedMotion ? 0 : t });
  }

  describe() {
    if (this.summary) return `Well expedition over. Cleared B${this.summary.depth}. Score ${this.summary.score}`;
    if (!this.run) return 'Well entrance';
    return `Well B${this.run.depth}. Run HP ${this.run.hero.hp}/${this.run.limits.maxHp}. Score ${this.run.score}`;
  }
}
