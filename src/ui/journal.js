// The Journal: island map, Static-dex, badges and records, opened with J or from the pause menu.
import { PAL } from '../art/palette.js';
import { drawText } from '../engine/font.js';
import { drawWindow, drawScrim, panelLift, fitText } from './kit.js';
import { GUARDIANS } from '../content/game-data.js';
import { BADGES, SPECIES, completion, medalFor } from '../progress/progress.js';

export const JOURNAL_TABS = Object.freeze(['map', 'dex', 'badges', 'records']);
const TITLES = { map: 'Island', dex: 'Static-dex', badges: 'Badges', records: 'Records' };

export class Journal {
  constructor(game) { this.game = game; this.open_ = false; this.tab = 0; this.age = 0; this.onClose = null; }
  get active() { return this.open_; }

  open({ tab = 'map', onClose = null } = {}) {
    this.open_ = true;
    this.tab = Math.max(0, JOURNAL_TABS.indexOf(tab));
    this.age = 0;
    this.onClose = onClose;
    this.game.announce(`Journal: ${TITLES[JOURNAL_TABS[this.tab]]}. Left and right change pages.`);
  }

  close() { const done = this.onClose; this.open_ = false; this.onClose = null; done?.(); }

  update(dt, input) {
    if (!this.open_) return;
    this.age += dt;
    if (input.pressed('cancel') || input.pressed('journal')) {
      input.consume('cancel'); input.consume('pause'); input.consume('journal');
      this.close();
      return;
    }
    const step = input.repeat('right') ? 1 : input.repeat('left') ? -1 : 0;
    if (step) {
      this.tab = (this.tab + step + JOURNAL_TABS.length) % JOURNAL_TABS.length;
      this.game.audio.play('menu-move');
      this.game.announce(`Journal: ${TITLES[JOURNAL_TABS[this.tab]]}.`);
    }
  }

  lines() {
    const state = this.game.state, progress = state.progress;
    const tab = JOURNAL_TABS[this.tab];
    if (tab === 'map') {
      const done = completion(state);
      return [`Completion ${done.percent}%`, ...done.parts.map((part) => `${part.label}: ${part.have}/${part.total}`), `Well best: B${progress.well.best}`];
    }
    if (tab === 'dex') {
      return SPECIES.map((species) => {
        const entry = progress.dex[species.id];
        return entry?.seen ? `${species.name}: cleared ${entry.cleared}${entry.golden ? ` · golden ${entry.golden}` : ''}` : '??? not yet seen';
      });
    }
    if (tab === 'badges') {
      return BADGES.length ? BADGES.map((badge) => `${progress.badges.includes(badge.id) ? '★' : '·'} ${badge.name}`) : ['No badges yet.'];
    }
    return GUARDIANS.map((guardian) => {
      const record = progress.records[guardian.key];
      return record ? `${guardian.name}: ${record.grade} (${medalFor(record.grade) ?? 'no medal'}) · ${record.turns} turns` : `${guardian.name}: no record`;
    });
  }

  draw(ctx, screen, t) {
    if (!this.open_) return;
    const w = Math.min(screen.w - 16, 360), h = Math.min(screen.h - 16, 240);
    const x = Math.round((screen.w - w) / 2), y = Math.round((screen.h - h) / 2) + panelLift(this.age, this.game.reducedMotion);
    drawScrim(ctx, screen);
    drawWindow(ctx, x, y, w, h, 'default', t);
    drawText(ctx, `← ${TITLES[JOURNAL_TABS[this.tab]]} →`, x + Math.round(w / 2), y + 10, { align: 'center', color: PAL.ui.gold });
    let cy = y + 30;
    for (const line of this.lines()) {
      if (cy > y + h - 24) break;
      drawText(ctx, fitText(line, w - 28), x + 14, cy, { color: PAL.ui.text });
      cy += 12;
    }
    drawText(ctx, 'J / Esc close', x + Math.round(w / 2), y + h - 15, { font: 'small', align: 'center', color: PAL.ui.faint });
  }
}
