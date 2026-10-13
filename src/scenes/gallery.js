// DEV-only art gallery: ↑/↓ chooses a gallery, ←/→ pages within it.
import { PAL } from '../art/palette.js';
import { drawText } from '../engine/font.js';
import { galleries as terrain } from '../art/terrain.js';
import { galleries as props } from '../art/props.js';
import { galleries as ambience } from '../art/ambience.js';
import { galleries as creatures } from '../art/creatures.js';
import { galleries as characters } from '../art/characters.js';
import { galleries as portraits } from '../art/portraits.js';
import { galleries as backgrounds } from '../art/backgrounds.js';
import { galleries as vfx } from '../art/vfx.js';
import { galleries as transitions } from '../art/transitions.js';
import { galleries as grid } from '../battle/gridviz.js';
import { galleries as ui } from '../ui/kit.js';

const ALL = Object.entries({ ...terrain, ...props, ...ambience, ...creatures, ...characters, ...portraits, ...backgrounds, ...vfx, ...transitions, ...grid, ...ui });

export class GalleryScene {
  constructor(game, name = null) {
    this.game = game;
    this.index = Math.max(0, ALL.findIndex(([key]) => key === name));
    this.page = 0;
  }

  enter() {}

  update(dt, input) {
    if (input.repeat('down')) {
      this.index = (this.index + 1) % ALL.length;
      this.page = 0;
    }
    if (input.repeat('up')) {
      this.index = (this.index + ALL.length - 1) % ALL.length;
      this.page = 0;
    }
    if (input.repeat('right')) this.page++;
    if (input.repeat('left')) this.page = Math.max(0, this.page - 1);
  }

  draw(ctx, screen, t) {
    for (let y = 0; y < screen.h; y += 8) {
      for (let x = 0; x < screen.w; x += 8) {
        ctx.fillStyle = (x + y) % 16 === 0 ? PAL.night[1] : PAL.night[2];
        ctx.fillRect(x, y, 8, 8);
      }
    }
    const [name, paint] = ALL[this.index] ?? ['none', () => {}];
    ctx.save();
    try {
      paint(ctx, screen, t, this.page);
    } catch (error) {
      drawText(ctx, `Gallery error: ${error.message}`, 4, 4, { color: PAL.ui.bad });
    }
    ctx.restore();
    drawText(ctx, `${name}  page ${this.page}`, 4, screen.h - 11, { color: PAL.ui.dim, shadow: PAL.ink });
  }
}

export const GALLERY_NAMES = ALL.map(([key]) => key);
