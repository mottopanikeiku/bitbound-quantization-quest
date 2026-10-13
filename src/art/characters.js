// Chibi cast, authored at native resolution. Each direction/walk/blink pose is
// cached, with asymmetric accessories kept on their owner's anatomical side.
import { PAL } from './palette.js';
import { LIGHT, shadeRamp, spriteCache } from './paint.js';
import { drawText } from '../engine/font.js';

export const CHARACTER_IDS = ['hero', 'keeper', 'kid', 'fisher', 'smith', 'librarian', 'hiker', 'botanist', 'sailor', 'scholar', 'cat', 'frog'];
// Shared with the bespoke portrait painter: clothing and complexion do not
// change when a villager starts a conversation.
export const CHARACTER_LOOKS = Object.freeze({
  hero: { coat: 'teal', trim: 'rose', hair: 'wood', skin: 5 },
  keeper: { coat: 'roofBlue', trim: 'gold', hair: 'snow', skin: 4 },
  kid: { coat: 'rose', trim: 'gold', hair: 'wood', skin: 5 },
  fisher: { coat: 'teal', trim: 'sand', hair: 'ash', skin: 3 },
  smith: { coat: 'ash', trim: 'ember', hair: 'stone', skin: 2 },
  librarian: { coat: 'violet', trim: 'gold', hair: 'ash', skin: 4 },
  hiker: { coat: 'roof', trim: 'sand', hair: 'wood', skin: 5 },
  botanist: { coat: 'leaf', trim: 'rose', hair: 'wood', skin: 3 },
  sailor: { coat: 'roofBlue', trim: 'cream', hair: 'wood', skin: 4 },
  scholar: { coat: 'violet', trim: 'teal', hair: 'stone', skin: 3 },
});
const DIRS = ['down', 'left', 'up', 'right'];
const STEP = [0, 1, 0, -1];
function ramp(name) { return PAL[name]; }
function lightBall(p, x, y, rx, ry, colors) {
  p.ellipse(x, y, rx, ry, colors[0]);
  p.ellipse(x, y, rx - .7, ry - .7, (px, py, nx, ny, nz) => shadeRamp(colors, .27 + .72 * Math.max(0, nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z), px, py));
}
function outlinedRect(p, x, y, w, h, colors) {
  p.rect(x, y, w, h, colors[0]); p.rect(x + 1, y + 1, w - 2, h - 2, colors[Math.floor(colors.length * .55)]);
  p.line(x + 1, y + 1, x + w - 2, y + 1, colors.at(-2));
  p.line(x + 1, y + 2, x + 1, y + h - 2, colors[Math.floor(colors.length * .7)]);
}
function lattice(p, x, y, pulse) {
  p.ellipseDither(x + 3, y + 3, 5, 5, PAL.teal[6], pulse ? .26 : .12);
  p.poly([[x, y + 2], [x + 3, y], [x + 6, y + 2], [x + 3, y + 4]], PAL.teal[3]);
  p.poly([[x, y + 2], [x + 3, y + 4], [x + 3, y + 7], [x, y + 5]], PAL.teal[5]);
  p.poly([[x + 3, y + 4], [x + 6, y + 2], [x + 6, y + 5], [x + 3, y + 7]], PAL.teal[2]);
  p.line(x, y + 2, x + 3, y, PAL.teal[9]).line(x + 3, y, x + 6, y + 2, PAL.teal[8]);
  p.line(x, y + 2, x + 3, y + 4, PAL.teal[9]).line(x + 3, y + 4, x + 6, y + 2, PAL.teal[8]);
  p.line(x, y + 2, x, y + 5, PAL.teal[8]).line(x + 3, y + 4, x + 3, y + 7, PAL.teal[8]);
  p.line(x + 6, y + 2, x + 6, y + 5, PAL.teal[7]).line(x, y + 5, x + 3, y + 7, PAL.teal[7]);
  p.line(x + 3, y + 7, x + 6, y + 5, PAL.teal[6]).set(x + 3, y + 2, PAL.cream[3]);
}
function headwear(p, id, y, dir, look) {
  const back = dir === 'up', side = dir === 'left' || dir === 'right', sign = dir === 'left' ? -1 : 1;
  if (id === 'hero') {
    lightBall(p, 11, y + 2, 6, 3, PAL.teal);
    p.rect(6, y + 2, 11, 2, PAL.teal[2]);
    p.rect(side ? 8 + sign * 5 : 6, y + 4, side ? 7 : 12, 2, PAL.teal[1]);
    p.rect(side ? 8 + sign * 5 : 6, y + 4, side ? 6 : 10, 1, PAL.teal[6]);
    p.set(8, y + 1, PAL.teal[8]);
    if (!back) p.rect(10, y + 2, 2, 2, PAL.gold[6]);
  } else if (id === 'keeper') {
    p.rect(6, y, 11, 4, PAL.roofBlue[1]); p.rect(7, y, 9, 2, PAL.roofBlue[4]);
    p.line(5, y + 4, 17, y + 4, PAL.gold[4]); p.rect(7, y + 3, 9, 1, PAL.roofBlue[2]);
    if (!back) p.set(11, y + 2, PAL.gold[7]);
  } else if (id === 'fisher' || id === 'hiker') {
    lightBall(p, 11, y + 2, 6, 4, PAL.sand);
    lightBall(p, 11, y + 5, id === 'fisher' ? 9 : 8, 2, PAL.sand);
    p.rect(6, y + 3, 11, 1, id === 'hiker' ? PAL.roof[3] : PAL.teal[3]);
    if (id === 'hiker') p.set(15, y + 1, PAL.cream[3]);
  } else if (id === 'smith') {
    p.rect(6, y + 3, 11, 2, PAL.ember[3]); p.line(6, y + 3, 15, y + 3, PAL.ember[6]);
    p.rect(16, y + 4, 3, 2, PAL.ember[4]);
  } else if (id === 'librarian') {
    lightBall(p, 15, y + 1, 3, 3, PAL.ash); p.set(14, y, PAL.gold[5]);
  } else if (id === 'botanist') {
    p.poly([[4, y + 4], [8, y], [15, y], [19, y + 4]], PAL.leaf[2]);
    p.poly([[5, y + 3], [8, y], [13, y], [16, y + 3]], PAL.leaf[5]);
    p.line(3, y + 5, 19, y + 5, PAL.leaf[1]);
    p.rect(15, y + 1, 3, 3, PAL.rose[4]); p.set(16, y + 2, PAL.gold[6]);
  } else if (id === 'sailor') {
    p.rect(6, y + 1, 11, 3, PAL.snow[3]); p.rect(7, y, 9, 3, PAL.cream[3]);
    p.rect(5, y + 4, 13, 2, PAL.roofBlue[2]); p.rect(7, y + 4, 9, 1, PAL.roofBlue[5]);
  } else if (id === 'scholar') {
    lightBall(p, 11, y + 2, 7, 5, PAL.violet);
    p.line(5, y + 2, 15, y + 5, PAL.violet[6]); p.line(6, y + 4, 12, y + 6, PAL.violet[2]);
    p.rect(10, y + 3, 3, 3, PAL.teal[5]); p.set(11, y + 3, PAL.teal[8]);
    p.line(17, y + 3, 18, y + 10, PAL.gold[5]);
  } else if (id === 'kid') {
    lightBall(p, 4, y + 6, 3, 4, ramp(look.hair)); lightBall(p, 18, y + 6, 3, 4, ramp(look.hair));
    p.rect(4, y + 3, 2, 2, PAL.gold[6]); p.rect(17, y + 3, 2, 2, PAL.gold[6]);
  }
}
function humanoid(p, id, dir, frame, blink, breathe) {
  const look = CHARACTER_LOOKS[id], coat = ramp(look.coat), hair = ramp(look.hair);
  const back = dir === 'up', side = dir === 'left' || dir === 'right', facing = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
  const walk = frame < 0 ? 0 : STEP[frame], bob = frame < 0 ? -breathe : -(frame % 2);
  const small = id === 'kid', hy = (small ? 5 : 2) + bob, by = 15 + bob, bw = side ? 8 : 10;
  // Back-mounted equipment is deliberately occluded by the owner, not pasted on.
  if (id === 'hiker') {
    outlinedRect(p, side ? 7 - facing * 4 : 5, 12 + bob, side ? 6 : 13, 10, PAL.sand);
    p.rect(side ? 8 - facing * 4 : 7, 11 + bob, side ? 4 : 9, 3, PAL.teal[3]);
  }
  if (id === 'hero' && back) {
    p.line(19, 10 + bob, 19, 24, PAL.wood[2]); lattice(p, 16, 4 + bob, breathe);
  }
  // Feet alternate depth as well as stride; down/up and profile are distinct.
  const leftY = 24 + Math.max(0, walk), rightY = 24 + Math.max(0, -walk);
  p.rect(side ? 9 - walk * 2 : 7, leftY - 3, 4, 5, PAL.ink);
  p.rect(side ? 10 + walk * 2 : 12, rightY - 3, 4, 5, PAL.ink);
  p.rect(side ? 9 - walk * 2 : 7, leftY - 2, 3, 2, PAL.wood[3]);
  p.rect(side ? 10 + walk * 2 : 12, rightY - 2, 3, 2, PAL.wood[3]);
  const bx = 11 - bw / 2;
  outlinedRect(p, bx, by, bw, small ? 7 : 9, coat);
  if (id === 'librarian' || id === 'scholar') {
    p.poly([[bx, by + 3], [bx - 1, 23], [bx + bw, 23], [bx + bw - 1, by + 3]], coat[3]);
    p.line(bx, 22, bx + bw - 1, 22, PAL.gold[4]);
  }
  const sy = by + 2;
  for (const d of [-1, 1]) {
    if (side && d === -facing) continue;
    const ax = side ? 11 : 11 + d * 6;
    p.rect(ax - 1, sy + d * walk, 3, 4, coat[d < 0 ? Math.min(coat.length - 1, 5) : 2]);
    p.rect(ax - 1, sy + 3 + d * walk, 3, 2, PAL.skin[look.skin]);
    p.set(ax + 1, sy + 4 + d * walk, PAL.skin[Math.max(0, look.skin - 2)]);
  }
  if (id === 'hero') {
    p.line(7, by, 15, by + 6, PAL.wood[2]); p.line(8, by, 15, by + 5, PAL.wood[5]);
    outlinedRect(p, side ? 7 - facing * 3 : 14, by + 3, 5, 5, PAL.wood); p.set(side ? 9 - facing * 3 : 16, by + 5, PAL.gold[6]);
    p.rect(7, by - 1, 9, 2, PAL.rose[4]); p.rect(back ? 5 : 14, by + 1, 3, 3 + Math.abs(walk), PAL.rose[3]);
    p.set(back ? 5 : 15, by + 1, PAL.rose[6]);
  } else if (id === 'keeper') {
    if (!back) { p.line(11, by + 2, 11, by + 7, PAL.gold[3]); p.set(12, by + 3, PAL.gold[6]); p.set(12, by + 6, PAL.gold[6]); }
    const lx = side ? 16 : 2;
    p.line(lx + 2, by + 1, lx + 2, by + 4, PAL.gold[3]); outlinedRect(p, lx, by + 4, 5, 6, PAL.gold); p.rect(lx + 2, by + 5, 1, 3, PAL.gold[8]);
  } else if (id === 'smith') {
    p.rect(8, by + 1, 7, 6, PAL.wood[2]); p.line(8, by + 1, 8, by + 6, PAL.wood[5]); p.rect(9, by + 4, 4, 2, PAL.wood[1]);
    p.line(19, by + 1, 19, by + 8, PAL.wood[4]); outlinedRect(p, 16, by, 7, 4, PAL.stone);
  } else if (id === 'librarian') {
    p.rect(14, by + 3, 5, 6, PAL.roof[2]); p.rect(15, by + 3, 3, 5, PAL.cream[2]); p.line(15, by + 5, 17, by + 5, PAL.cream[0]);
  } else if (id === 'fisher') {
    p.line(20, 4 + bob, 18, 25, PAL.wood[4]); p.line(20, 4 + bob, 22, 15, PAL.cream[0]);
    p.rect(7, by + 3, 3, 3, PAL.sand[4]);
  } else if (id === 'hiker') {
    p.line(20, by - 2, 18, 26, PAL.wood[4]); p.set(20, by - 2, PAL.cream[3]);
  } else if (id === 'botanist') {
    p.line(9, by, 9, by + 7, PAL.sand[4]); p.line(14, by, 14, by + 7, PAL.sand[3]);
    p.rect(17, by + 4, 5, 4, PAL.roof[3]); p.rect(16, by + 3, 7, 2, PAL.roof[5]);
    p.line(19, by + 3, 19, by - 2, PAL.leaf[5]); p.line(19, by + 1, 16, by, PAL.leaf[6]);
    p.rect(18, by - 3, 3, 3, PAL.rose[4]); p.set(19, by - 2, PAL.gold[6]);
  } else if (id === 'sailor') {
    for (let y = by + 2; y < by + 7; y += 2) p.rect(bx + 1, y, bw - 2, 1, PAL.cream[2]);
    p.line(7, by, 11, by + 4, PAL.roof[4]); p.line(15, by, 11, by + 4, PAL.roof[4]);
  } else if (id === 'scholar') {
    outlinedRect(p, 16, by + 2, 4, 7, PAL.cream); p.line(17, by + 4, 19, by + 4, PAL.gold[3]);
  } else if (id === 'kid') p.rect(9, by + 2, 4, 3, PAL.gold[5]);
  // Head: one strong silhouette, side nose, shaded hair, no mirrored lighting.
  lightBall(p, 11, hy + 7, 6, 6, hair);
  if (!back) {
    const fx = 11 + facing, skin = [PAL.skin[Math.max(0, look.skin - 3)], PAL.skin[Math.max(0, look.skin - 1)], PAL.skin[look.skin], PAL.skin[Math.min(6, look.skin + 1)]];
    lightBall(p, fx, hy + 8, side ? 4 : 5, 4.5, skin);
    if (side) p.rect(fx + facing * 3, hy + 7, 2, 3, PAL.skin[look.skin]);
    p.line(7, hy + 5, side ? 12 - facing : 14, hy + 5, hair[3]);
    p.set(8, hy + 6, hair[2]);
    const eyes = side ? [fx + facing * 2] : [9, 14];
    for (const ex of eyes) { p.rect(ex, hy + 8, blink ? 2 : 1, blink ? 1 : 2, PAL.ink); if (!blink && id === 'hero') p.set(ex, hy + 8, PAL.teal[1]); }
    p.set(fx, hy + 11, PAL.skin[Math.max(0, look.skin - 2)]);
    if (id === 'keeper') {
      p.poly([[6, hy + 10], [10, hy + 12], [16, hy + 10], [14, hy + 15], [10, hy + 16], [7, hy + 13]], PAL.snow[2]);
      p.line(7, hy + 11, 10, hy + 14, PAL.cream[3]); p.set(10, hy + 11, PAL.skin[2]);
    }
    if (id === 'librarian' || id === 'scholar') {
      const glass = PAL.gold[5];
      p.rect(7 + facing, hy + 7, 4, 4, glass); p.rect(8 + facing, hy + 8, 2, 2, PAL.skin[look.skin]); p.set(9 + facing, hy + 8, PAL.ink);
      if (!side && id === 'librarian') { p.rect(12, hy + 7, 4, 4, glass); p.rect(13, hy + 8, 2, 2, PAL.skin[look.skin]); p.set(14, hy + 8, PAL.ink); p.set(11, hy + 8, glass); }
    }
  } else {
    p.line(8, hy + 6, 8, hy + 10, hair[Math.min(hair.length - 1, 5)]);
    if (id === 'botanist') { p.line(14, hy + 8, 14, hy + 16, hair[2]); p.set(14, hy + 16, PAL.rose[5]); }
  }
  headwear(p, id, hy, dir, look);
  if (id === 'hero' && !back) { p.line(20, 12 + bob, 20, 25, PAL.wood[2]); p.line(19, 12 + bob, 19, 24, PAL.wood[5]); lattice(p, 16, 5 + bob, breathe); }
}
function critter(p, id, dir, frame, blink) {
  const f = frame < 0 ? 0 : frame, step = STEP[f], back = dir === 'up', side = dir === 'left' || dir === 'right', d = dir === 'left' ? -1 : 1;
  if (id === 'cat') {
    const x = side ? 10 - d * 2 : 11, y = 18 - Math.abs(step);
    p.line(x + d * 5, y + 2, x + d * 8, y - 2, PAL.wood[3]); p.line(x + d * 8, y - 2, x + d * 8, y - 6, PAL.wood[3]);
    lightBall(p, x, y + 1, side ? 7 : 5, 5, PAL.sand);
    for (const off of [-3, 3]) p.rect(x + off + (side ? step : 0), 22, 2, 3, PAL.wood[2]);
    const hx = side ? x + d * 4 : x;
    p.poly([[hx - 5, y - 2], [hx - 5, y - 8], [hx - 1, y - 5], [hx + 2, y - 5], [hx + 5, y - 8], [hx + 5, y - 2]], PAL.wood[2]);
    lightBall(p, hx, y - 2, 6, 5, PAL.sand); p.set(hx - 4, y - 6, PAL.rose[5]); p.set(hx + 4, y - 6, PAL.rose[5]);
    p.rect(hx - 1, y - 6, 2, 3, PAL.wood[4]);
    if (!back) {
      p.rect(hx - 3, y - 3, blink ? 2 : 1, blink ? 1 : 2, PAL.ink); p.rect(hx + 3, y - 3, blink ? 2 : 1, blink ? 1 : 2, PAL.ink);
      p.set(hx, y, PAL.rose[3]); p.line(hx - 6, y, hx - 3, y + 1, PAL.cream[2]); p.line(hx + 3, y + 1, hx + 6, y, PAL.cream[2]);
    }
  } else {
    const y = 20 - Math.abs(step);
    lightBall(p, side ? 10 - d * 4 : 6, 23, 4, 2, PAL.leaf); lightBall(p, side ? 11 + d * 4 : 16, 23, 4, 2, PAL.leaf);
    lightBall(p, 11, y, 8, 5, PAL.teal);
    if (!back) lightBall(p, side ? 11 + d * 3 : 11, y + 2, 5, 3, PAL.cream);
    if (side) {
      lightBall(p, 11 + d * 4, y - 4, 3, 3, PAL.leaf);
      p.rect(11 + d * 5, y - 5, blink ? 2 : 1, blink ? 1 : 2, PAL.ink);
      p.line(11 + d * 3, y + 1, 11 + d * 7, y + 1, PAL.teal[1]);
    } else {
      lightBall(p, 6, y - 4, 3, 3, PAL.leaf); lightBall(p, 16, y - 4, 3, 3, PAL.leaf);
      if (!back) { p.rect(6, y - 5, blink ? 2 : 1, blink ? 1 : 2, PAL.ink); p.rect(16, y - 5, blink ? 2 : 1, blink ? 1 : 2, PAL.ink); p.line(8, y + 1, 14, y + 1, PAL.teal[1]); }
    }
    p.set(9, y - 2, PAL.teal[7]); p.set(13, y - 3, PAL.teal[7]);
  }
}

/** Anchor is bottom-centre feet, independent of facing, walk and accessories. */
export function drawCharacter(ctx, id, x, y, opts = {}) {
  const chosen = CHARACTER_IDS.includes(id) ? id : 'hero', dir = DIRS.includes(opts.dir) ? opts.dir : 'down';
  const frame = opts.frame == null || opts.frame < 0 ? -1 : Math.floor(opts.frame) % 4, t = opts.t ?? 0;
  const blink = Math.floor(t * 8 + CHARACTER_IDS.indexOf(chosen) * 3) % 39 === 0, breathe = Math.floor(t * 2) % 2;
  const image = spriteCache(`character-v2:${chosen}:${dir}:${frame}:${+blink}:${breathe}`, 24, 28, (p) => {
    if (chosen === 'cat' || chosen === 'frog') critter(p, chosen, dir, frame, blink);
    else humanoid(p, chosen, dir, frame, blink, breathe);
  });
  const shade = spriteCache('character-shadow-v2', 18, 5, (p) => p.ellipseDither(9, 2, 7, 2, PAL.shadow, .65));
  ctx.drawImage(shade, Math.round(x - 9), Math.round(y - 3));
  ctx.drawImage(image, Math.round(x - 11), Math.round(y - 26));
}

function characterGallery(ctx, screen, t, page = 0) {
  const ids = CHARACTER_IDS.slice((page % 6) * 2, (page % 6) * 2 + 2), portrait = screen.w < 300;
  ctx.fillStyle = PAL.night[1]; ctx.fillRect(0, 0, screen.w, screen.h);
  drawText(ctx, 'The people of Lighthouse Point', 8, 6, { color: PAL.cream[3] });
  drawText(ctx, 'Four directions / four native-pixel steps', 8, 19, { font: 'small', color: PAL.ui.dim });
  ids.forEach((id, i) => {
    const px = portrait ? 8 : 8 + i * 188, py = portrait ? 37 + i * Math.floor((screen.h - 58) / 2) : 37;
    const ph = portrait ? Math.floor((screen.h - 62) / 2) : 157;
    ctx.fillStyle = PAL.night[3]; ctx.fillRect(px, py, portrait ? screen.w - 16 : 179, ph);
    ctx.fillStyle = PAL.night[4]; ctx.fillRect(px, py, portrait ? screen.w - 16 : 179, 1);
    drawText(ctx, id, px + 8, py + 6, { color: PAL.gold[6] });
    const rowH = Math.min(31, Math.floor((ph - 22) / 4));
    DIRS.forEach((dir, row) => {
      const y = py + 20 + (row + 1) * rowH;
      drawText(ctx, dir.toUpperCase(), px + 7, y - 15, { font: 'small', color: PAL.ui.dim });
      for (let f = 0; f < 4; f++) drawCharacter(ctx, id, px + 68 + f * 27, y, { dir, frame: f, t });
    });
  });
}
export const galleries = { characters: characterGallery };
