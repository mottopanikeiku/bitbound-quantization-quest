// Integer-pixel battle composition. The grid is a stage, not a detached chart.
import { PAL } from '../art/palette.js';
import { drawBattleBackground } from '../art/backgrounds.js';
import { drawBattleCreature } from '../art/creatures.js';
import { drawText, wrapText, FONT_METRICS } from '../engine/font.js';
import { drawBar, drawMenu, drawWindow, drawIcon, drawCursor } from '../ui/kit.js';
import { drawGridPanel } from './gridviz.js';
import { GUARDIANS } from '../content/game-data.js';
import { clamp } from '../engine/util.js';

const COMMANDS = ['SNAP', 'TUNE', 'GUARD', 'SNACK', 'SCAN', 'FLEE'];
const COMMAND_HINTS = ['Lock a grid. Turn values into a spell.', 'Free: choose bits and techniques.', 'Brace next hit ×0.5. Recover 12 B.', 'Heal half your max HP. Uses a turn.', 'Free: inspect the essence and a hint.', 'Leave safely. This foe will reset.'];

export function battleLayout(screen) {
  const { w, h } = screen;
  const portrait = screen.portrait ?? w < 300;
  return portrait ? {
    portrait, foe: { x: Math.round(w / 2), y: Math.min(166, h - 191) },
    header: { x: 6, y: 5, w: w - 12, h: 26 },
    party: { x: 6, y: h - 105, w: w - 12, h: 45 },
    message: { x: 6, y: h - 55, w: w - 12, h: 49 },
    work: { x: 6, y: 36, w: w - 12, h: h - 146 },
    grid: { x: 6, y: 62, w: w - 12, h: h - 172 },
    command: { x: 6, y: h - 190, w: w - 12, h: 80 },
  } : {
    portrait, foe: { x: 265, y: 146 },
    header: { x: 8, y: 6, w: 170, h: 24 },
    party: { x: 8, y: h - 59, w: 140, h: 51 },
    message: { x: 154, y: h - 59, w: w - 162, h: 51 },
    work: { x: 8, y: 35, w: w - 16, h: h - 99 },
    grid: { x: 8, y: 48, w: 246, h: h - 112 },
    command: { x: 8, y: 66, w: 126, h: 82 },
  };
}

function textBlock(ctx, text, x, y, width, { color = PAL.ui.text, font = 'body', maxLines = 4, maxChars = Infinity, gap } = {}) {
  const lineHeight = gap ?? FONT_METRICS[font].lineHeight;
  let remaining = maxChars;
  const lines = wrapText(text, width, font).slice(0, maxLines);
  for (let i = 0; i < lines.length; i++) {
    drawText(ctx, lines[i], x, y + i * lineHeight, { color, font, maxChars: Math.max(0, remaining) });
    remaining -= lines[i].replaceAll('*', '').length;
  }
  return lines.length * lineHeight;
}

function ring(ctx, x, y, radius, color, thickness = 1) {
  ctx.fillStyle = color;
  // Rasterised circumference: no antialiased canvas paths or scaling.
  let px = radius | 0;
  let py = 0;
  let error = 1 - px;
  while (px >= py) {
    for (const [dx, dy] of [[px, py], [py, px], [-py, px], [-px, py], [-px, -py], [-py, -px], [py, -px], [px, -py]]) {
      ctx.fillRect(Math.round(x + dx), Math.round(y + dy), thickness, thickness);
    }
    py++;
    if (error < 0) error += 2 * py + 1;
    else { px--; error += 2 * (py - px) + 1; }
  }
}

function drawHeader(ctx, battle, layout, t) {
  const r = layout.header;
  drawWindow(ctx, r.x, r.y, r.w, r.h, 'glass', t);
  drawText(ctx, battle.foe.name, r.x + 7, r.y + 4, { color: PAL.ui.text });
  const hp = `${battle.foeHp}/${battle.foe.hp}`;
  drawText(ctx, hp, r.x + r.w - 7, r.y + 5, { font: 'small', align: 'right', color: PAL.ui.dim });
  if (battle.threadHp) {
    battle.threadHp.forEach((value, i) => drawBar(ctx, r.x + 7 + i * Math.floor((r.w - 18) / 3), r.y + r.h - 7, Math.floor((r.w - 24) / 3), 3, value, battle.threadMax[i], { fill: [PAL.rose[5], PAL.water[7], PAL.gold[6]][i] }));
  } else drawBar(ctx, r.x + 7, r.y + r.h - 7, r.w - 14, 3, battle.foeHp, battle.foe.hp, { fill: battle.bossPhase === 2 ? PAL.ui.gold : PAL.ui.bad });
  if (!layout.portrait) {
    drawText(ctx, battle.guardian ? 'GUARDIAN' : 'PRACTICE', r.x + r.w + 9, r.y + 3, { font: 'small', color: PAL.ui.dim });
    if (battle.bossPhase === 2) drawText(ctx, 'PHASE 2', r.x + r.w + 9, r.y + 12, { font: 'small', color: PAL.ui.gold });
    const cost = battle.preview?.cost ?? 0;
    drawWindow(ctx, 302, 6, 74, 24, cost > battle.hero.bytes ? 'danger' : 'gold', t);
    drawIcon(ctx, 'byte', 308, 12);
    drawText(ctx, `${cost} B / CAST`, 370, 13, { font: 'small', align: 'right', color: cost > battle.hero.bytes ? PAL.ui.error : PAL.ui.gold });
  }
}

function drawParty(ctx, battle, layout, t) {
  const r = layout.party;
  drawWindow(ctx, r.x, r.y, r.w, r.h, battle.braced ? 'gold' : 'default', t);
  drawIcon(ctx, battle.braced ? 'shield' : 'heart', r.x + 7, r.y + 6);
  drawText(ctx, 'YOU', r.x + 19, r.y + 6, { font: 'small', color: PAL.ui.gold });
  const friends = battle.game.state.friends ?? [];
  friends.forEach((friend, i) => {
    const id = typeof friend === 'number' ? friend : GUARDIANS.findIndex(g => g.key === friend);
    const x = r.x + 45 + i * 10;
    ctx.fillStyle = GUARDIANS[id]?.color ?? PAL.ui.good;
    ctx.fillRect(x, r.y + 7, 7, 7);
    ctx.fillStyle = PAL.night[1];
    ctx.fillRect(x + 1, r.y + 9, 1, 1);
    ctx.fillRect(x + 5, r.y + 9, 1, 1);
  });
  const labelX = r.x + 7;
  const meterX = r.x + 45;
  const meterW = r.w - 53;
  drawText(ctx, `HP ${battle.hero.hp}`, labelX, r.y + 19, { font: 'small', color: battle.hero.hp < battle.limits.maxHp * 0.3 ? PAL.ui.warn : PAL.ui.text });
  drawBar(ctx, meterX, r.y + 21, meterW, 5, battle.hero.hp, battle.limits.maxHp, { fill: battle.hero.hp < battle.limits.maxHp * 0.3 ? PAL.ui.hpLow : PAL.ui.hp });
  drawText(ctx, `${battle.hero.bytes} B`, labelX, r.y + 31, { font: 'small', color: PAL.ui.bytes });
  drawBar(ctx, meterX, r.y + 33, meterW, 5, battle.hero.bytes, battle.limits.maxBytes, { fill: PAL.ui.bytes });
  if (!layout.portrait) drawText(ctx, `${battle.hero.snacks} snacks  ·  +4 B / turn`, r.x + 7, r.y + 42, { font: 'small', color: PAL.ui.dim });
}

function drawMessage(ctx, battle, layout, t) {
  const r = layout.message;
  drawWindow(ctx, r.x, r.y, r.w, r.h, 'dialog', t);
  textBlock(ctx, battle.message, r.x + 8, r.y + 6, r.w - 16, { maxLines: 3, maxChars: Math.floor((battle.messageAge ?? 10) * 82) });
  const footer = battle.phase === 'menu' ? (layout.portrait ? `${battle.preview?.cost ?? 0} B / cast  ·  ${battle.hero.snacks} snacks` : 'ARROWS choose   ENTER confirm')
    : battle.phase === 'tune' ? '← → change   ESC ready'
    : battle.phase === 'scan' ? 'ENTER / ESC return'
    : battle.phase === 'result' ? 'ENTER continue'
    : ['lock', 'balance'].includes(battle.phase) ? 'ENTER lock   SHIFT steady   ESC back'
    : battle.phase === 'spotlight' ? '← → channel   ENTER keep   ESC back'
    : battle.phase === 'budget' ? '↑ ↓ head   ← → bits   ENTER ready'
    : battle.phase === 'guard' ? 'ENTER as the rings meet!'
    : battle.phase === 'cast-result' ? 'ENTER continue · hold to speed up' : 'Hold ENTER to speed animations';
  drawText(ctx, footer, r.x + 8, r.y + r.h - 11, { font: 'small', color: PAL.ui.dim });
}

function drawTune(ctx, battle, layout, t) {
  const r = layout.work;
  const listW = layout.portrait ? r.w : 162;
  const listH = layout.portrait ? Math.max(85, Math.floor(r.h * 0.52)) : r.h;
  drawWindow(ctx, r.x, r.y, listW, listH, 'default', t);
  drawText(ctx, 'TUNE · FREE', r.x + 8, r.y + 6, { color: PAL.ui.gold });
  const items = battle.tuneItems ?? [];
  const visible = Math.max(2, Math.floor((listH - 29) / 13));
  const start = clamp(battle.tuneIndex - visible + 1, 0, Math.max(0, items.length - visible));
  items.slice(start, start + visible).forEach((item, offset) => {
    const index = offset + start;
    const y = r.y + 22 + offset * 13;
    if (index === battle.tuneIndex) {
      ctx.fillStyle = PAL.night[4];
      ctx.fillRect(r.x + 4, y - 2, listW - 8, 12);
      drawCursor(ctx, r.x + 6, y, t);
    }
    drawText(ctx, item.label, r.x + 16, y, { color: index === battle.tuneIndex ? PAL.ui.gold : PAL.ui.text });
    drawText(ctx, item.value, r.x + listW - 9, y + 1, { font: 'small', align: 'right', color: item.active ? PAL.ui.good : PAL.ui.dim });
  });
  if (items.length > visible) drawText(ctx, `${start + 1}–${Math.min(start + visible, items.length)}/${items.length}`, r.x + listW - 7, r.y + 7, { font: 'small', align: 'right', color: PAL.ui.dim });
  const grid = layout.portrait ? { x: r.x, y: r.y + listH + 4, w: r.w, h: r.h - listH - 4 } : { x: r.x + listW + 6, y: r.y, w: r.w - listW - 6, h: r.h };
  drawGridPanel(ctx, grid, battle.gridModel, t, { compact: true, showLegend: false, title: 'PREVIEW · IDEAL RANGE', reduced: battle.game.reducedMotion });
}

function drawScan(ctx, battle, layout, t) {
  const r = layout.work;
  drawWindow(ctx, r.x, r.y, r.w, r.h, 'default', t);
  drawIcon(ctx, 'scan', r.x + 9, r.y + 7);
  drawText(ctx, 'ESSENCE SCAN', r.x + 23, r.y + 6, { color: PAL.ui.gold });
  const lines = battle.scanLines ?? [];
  const colWidth = layout.portrait ? r.w - 18 : 173;
  let y = r.y + 23;
  for (const line of lines) y += textBlock(ctx, line, r.x + 9, y, colWidth, { maxLines: 2, font: 'small', gap: 9, color: PAL.ui.text }) + 4;
  if (!layout.portrait) drawGridPanel(ctx, { x: r.x + 184, y: r.y + 20, w: r.w - 192, h: r.h - 28 }, battle.gridModel, t, { compact: true, showLegend: false, title: battle.essence.hidden ? 'ARCHIVE · NOT LIVE' : 'VALUE DISTRIBUTION' });
}

function drawSpotlight(ctx, battle, layout, t) {
  const r = layout.work;
  drawWindow(ctx, r.x, r.y, r.w, r.h, 'gold', t);
  drawText(ctx, `SPOTLIGHT · KEEP ${battle.gear.spotlight}`, r.x + 9, r.y + 6, { color: PAL.ui.gold });
  drawText(ctx, 'Tall bars = inputs amplify this weight', r.x + 9, r.y + 19, { font: 'small', color: PAL.ui.dim });
  const hot = battle.salience;
  const cols = layout.portrait ? 8 : 16;
  const rows = Math.ceil(hot.length / cols);
  const cellW = Math.floor((r.w - 18) / cols);
  const cellH = Math.floor((r.h - 42) / rows);
  const largest = Math.max(1e-9, ...hot);
  hot.forEach((value, i) => {
    const x = r.x + 9 + (i % cols) * cellW;
    const y = r.y + 35 + Math.floor(i / cols) * cellH;
    const selected = battle.locks.protected.includes(i);
    if (i === battle.pickIndex) drawWindow(ctx, x - 1, y - 3, cellW - 1, cellH, 'glass', t);
    const barH = Math.max(2, Math.round((cellH - 17) * value / largest));
    ctx.fillStyle = selected ? PAL.gold[6] : value > largest * 0.5 ? PAL.ember[6] : PAL.water[5];
    ctx.fillRect(x + 4, y + cellH - 20 - barH, Math.max(3, cellW - 11), barH);
    drawText(ctx, String(i + 1), x + Math.floor(cellW / 2) - 1, y + cellH - 17, { align: 'center', font: 'small', color: selected ? PAL.ui.gold : PAL.ui.text });
    if (selected) drawIcon(ctx, 'star', x + Math.floor(cellW / 2) - 5, y - 2);
  });
}

function drawBudget(ctx, battle, layout, t) {
  const r = layout.work;
  drawWindow(ctx, r.x, r.y, r.w, r.h, 'gold', t);
  drawText(ctx, 'BIT BUDGET · THREE HEADS', r.x + 9, r.y + 7, { color: PAL.ui.gold });
  const labels = ['CROWN', 'WING', 'TAIL'];
  const sensitivities = battle.essence.sensitivities ?? [3, 1, 0.4];
  const listWidth = layout.portrait ? r.w : 174;
  for (let i = 0; i < 3; i++) {
    const y = r.y + 26 + i * 24;
    if (battle.budgetIndex === i) drawCursor(ctx, r.x + 9, y, t);
    drawText(ctx, labels[i], r.x + 21, y, { color: battle.budgetIndex === i ? PAL.ui.gold : PAL.ui.text });
    drawText(ctx, `${sensitivities[i]}× sensitive`, r.x + 21, y + 10, { font: 'small', color: PAL.ui.dim });
    drawText(ctx, `← ${battle.gear.budget[i]} BIT →`, r.x + listWidth - 12, y + 3, { font: 'small', align: 'right', color: PAL.ui.good });
  }
  const previewRect = layout.portrait
    ? { x: r.x + 6, y: r.y + 108, w: r.w - 12, h: r.h - 128 }
    : { x: r.x + 179, y: r.y + 22, w: r.w - 185, h: r.h - 42 };
  if (previewRect.h >= 42) drawGridPanel(ctx, previewRect, battle.gridModel, t, { compact: true, showLegend: false, title: 'SPEND WHERE ERROR MATTERS' });
  drawText(ctx, `${battle.preview.cost} B packet · change bits where it matters`, r.x + 9, r.y + r.h - 12, { font: 'small', color: battle.preview.cost > battle.hero.bytes ? PAL.ui.error : PAL.ui.bytes });
}

function drawCast(ctx, battle, layout, t) {
  const r = layout.grid;
  let title = 'SNAP · RECONSTRUCTING';
  if (battle.phase === 'lock') title = `${battle.lockLabel} · ${battle.lockIndex + 1}/${battle.lockSteps.length}`;
  if (battle.phase === 'balance') title = `BALANCE · ALPHA ${battle.locks.alpha.toFixed(2)}`;
  if (battle.phase === 'cast-result') title = battle.lastSpell.fizzle ? 'FIZZLE · TOO NOISY' : battle.lastSpell.perfect ? 'PERFECT · 1.25×' : `${battle.lastDamage} DAMAGE · ${Math.round(battle.lastSpell.fidelity * 100)}% FIDELITY`;
  drawText(ctx, title, r.x + 3, r.y - 12, { font: 'small', color: battle.phase === 'cast-result' && battle.lastSpell.fizzle ? PAL.ui.error : PAL.ui.gold });
  drawGridPanel(ctx, r, battle.gridModel, t, { reduced: battle.game.reducedMotion, independentRows: battle.gear.groups || Boolean(battle.gear.budget), showLegend: !layout.portrait || r.h > 150 });
  if (!layout.portrait) {
    const x = r.x + r.w + 9;
    const width = 384 - x - 10;
    const cue = battle.phase === 'balance' ? 'a ÷ s · w × s\nSame product; round both.'
      : battle.phase === 'cast-result' ? `${battle.lastSpell.clippedCount} clipped · red = error`
      : battle.essence.hidden ? 'Ghosts: past\n?: hidden live' : 'Tight: clips\nWide: coarse steps';
    drawWindow(ctx, x, 36, width, 24, 'glass', t);
    textBlock(ctx, cue, x + 5, 41, width - 10, { font: 'small', maxLines: 2, color: PAL.ui.dim });
  }
}

function drawEnemyTurn(ctx, battle, layout, t) {
  const r = layout.work;
  if (battle.phase === 'telegraph') {
    const h = layout.portrait ? 47 : 34;
    const y = r.y + r.h - h;
    drawWindow(ctx, r.x, y, r.w, h, battle.attack.charge ? 'danger' : 'glass', t);
    drawIcon(ctx, battle.attack.charge ? 'bolt' : 'shield', r.x + 8, y + 8);
    textBlock(ctx, battle.attack.telegraph, r.x + 23, y + 7, r.w - 31, { maxLines: 3, color: battle.attack.charge ? PAL.ui.warn : PAL.ui.text });
  }
  if (battle.phase === 'guard') {
    const centerX = layout.party.x + Math.floor(layout.party.w / 2);
    const centerY = layout.party.y - 20;
    const remaining = battle.guardTarget - battle.guardElapsed;
    const radius = Math.round(13 + Math.max(-0.15, remaining) * 40);
    ring(ctx, centerX, centerY, 13, PAL.ui.good, 2);
    ring(ctx, centerX, centerY, Math.max(5, radius), Math.abs(remaining) < 0.07 ? PAL.ui.gold : PAL.ui.border, 2);
    drawIcon(ctx, 'shield', centerX - 3, centerY - 3);
    drawText(ctx, `${battle.hitIndex + 1}/${battle.attack.hits.length}`, centerX + 37, centerY - 2, { font: 'small', color: PAL.ui.gold });
    drawText(ctx, battle.guardAttempt == null ? 'ENTER' : battle.guardAttempt.grade.toUpperCase(), centerX, centerY + 17, { font: 'small', align: 'center', color: battle.guardAttempt?.grade === 'miss' ? PAL.ui.bad : PAL.ui.gold });
  }
}

function drawResult(ctx, battle, layout, t) {
  const won = battle.result.outcome === 'won';
  const r = layout.portrait ? layout.work : { x: 8, y: 45, w: 180, h: 102 };
  const y = layout.portrait ? Math.max(layout.foe.y + 8, r.y + Math.floor(r.h * 0.48)) : r.y;
  const h = Math.min(layout.portrait ? 89 : 102, r.y + r.h - y);
  drawWindow(ctx, r.x, y, r.w, h, won ? 'gold' : 'default', t);
  const title = won ? battle.guardian ? `${battle.foe.name} became your friend!` : 'The Static drifts away!' : battle.result.outcome === 'lost' ? 'A light will guide you home.' : 'You slip away safely.';
  textBlock(ctx, title, r.x + 9, y + 7, r.w - 18, { color: won ? PAL.ui.gold : PAL.ui.text, maxLines: 2 });
  const recapY = y + 33;
  textBlock(ctx, battle.recap, r.x + 9, recapY, r.w - 18, { font: 'small', maxLines: 3, color: PAL.ui.dim });
  if (h > 65) drawText(ctx, `${battle.stats.turns} turns · ${battle.stats.perfects} perfect · ${battle.stats.fizzles} fizzle`, r.x + 9, y + h - 13, { font: 'small', color: PAL.ui.good });
}

export function drawBattleView(ctx, screen, battle, t) {
  const layout = battleLayout(screen);
  drawBattleBackground(ctx, screen, battle.foe.background, t, { reduced: battle.game.reducedMotion, intensity: battle.bossPhase === 2 ? 1.15 : 0.8 });
  const offset = battle.vfx?.offset ?? { x: 0, y: 0 };
  const casting = ['lock', 'balance', 'snap', 'cast-result'].includes(battle.phase);
  const creatureX = !layout.portrait ? casting ? 321 : battle.phase === 'result' ? 283 : layout.foe.x : layout.foe.x;
  const creatureY = layout.portrait && casting ? layout.foe.y - 24 : layout.foe.y;
  drawBattleCreature(ctx, battle.foeId, Math.round(creatureX + offset.x), Math.round(creatureY + offset.y), {
    t, corrupted: !(battle.result?.outcome === 'won' && battle.phaseAge > 0.48),
    flash: battle.phase === 'snap' ? Math.max(0, 1 - battle.phaseAge * 4) : battle.phase === 'result' && battle.result.outcome === 'won' ? Math.max(0, 1 - Math.abs(battle.phaseAge - 0.48) * 3) : 0,
    hurt: battle.phase === 'cast-result' && battle.phaseAge < 0.3 ? 0.7 : 0,
    squash: battle.phase === 'telegraph' ? Math.sin(battle.phaseAge * 6) * 0.15 : 0,
    phase: battle.bossPhase,
  });
  drawHeader(ctx, battle, layout, t);
  if (battle.phase === 'menu') {
    const r = layout.command;
    drawWindow(ctx, r.x, r.y, r.w, r.h, 'default', t);
    drawMenu(ctx, r.x + 7, r.y + 8, COMMANDS, battle.menu, { cols: 2, colWidth: Math.floor((r.w - 13) / 2), rowHeight: 17, t });
    drawText(ctx, battle.charging ? 'CHARGE INCOMING · BRACE!' : `TURN ${battle.stats.turns + 1} · ${battle.preview?.cost ?? 0} B SNAP`, r.x + 8, r.y + r.h - 13, { font: 'small', color: battle.charging ? PAL.ui.warn : PAL.ui.bytes });
    if (!layout.portrait) {
      drawWindow(ctx, 187, 36, 189, 25, 'glass', t);
      textBlock(ctx, COMMAND_HINTS[battle.menu], 193, 42, 177, { font: 'small', maxLines: 2, color: PAL.ui.dim });
    }
  } else if (battle.phase === 'tune') drawTune(ctx, battle, layout, t);
  else if (battle.phase === 'scan') drawScan(ctx, battle, layout, t);
  else if (battle.phase === 'spotlight') drawSpotlight(ctx, battle, layout, t);
  else if (battle.phase === 'budget') drawBudget(ctx, battle, layout, t);
  else if (casting) drawCast(ctx, battle, layout, t);
  else if (battle.phase === 'result') drawResult(ctx, battle, layout, t);
  drawParty(ctx, battle, layout, t);
  drawMessage(ctx, battle, layout, t);
  drawEnemyTurn(ctx, battle, layout, t);
  battle.vfx?.draw(ctx);
}
