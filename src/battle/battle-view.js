// Integer-pixel battle composition. The grid is a stage, not a detached chart.
import { PAL } from '../art/palette.js';
import { drawBattleBackground } from '../art/backgrounds.js';
import { drawBattleCreature, battleCreatureSize, drawFriendEmblem } from '../art/creatures.js';
import { drawCharacter } from '../art/characters.js';
import { drawText, wrapText, FONT_METRICS } from '../engine/font.js';
import { drawBar, drawMenu, drawWindow, drawIcon, drawCursor } from '../ui/kit.js';
import { drawGridPanel } from './gridviz.js';
import { clamp } from '../engine/util.js';
import { formatFidelity } from './metrics.js';
import { drawGradeStamp } from '../art/vfx.js';
import { ASSISTS, assistAvailability } from './assists.js';
import { TALLY_STEPS, TALLY_DURATION } from './grade.js';

const COMMAND_HINTS = ['Lock a grid to turn values into a spell.', 'Choose bits and techniques for free.', 'Brace for the next hit and recover 12 B of charge.', 'Each friend can offer one partial plan per battle.', 'Spend a turn to heal half your max HP.', 'Inspect the essence and get a hint for free.'];

/**
 * Panels, creature and grid keep their designed composition inside a centred box; on larger or
 * oddly shaped screens the animated backdrop fills everything around it.
 */
const BATTLE_BOX = { landscape: { w: 480, h: 288 }, portrait: { w: 320, h: 480 } };

export function battleLayout(screen, foeId = 'nib', inputDriven = false) {
  const portrait = screen.portrait ?? screen.w < 300;
  const box = BATTLE_BOX[portrait ? 'portrait' : 'landscape'];
  const w = Math.min(screen.w, box.w);
  const h = Math.min(screen.h, box.h);
  const size = battleCreatureSize(foeId);
  const bottom = portrait ? Math.min(166, h - 191) : h - 63;
  const stage = { x: portrait ? Math.floor((w - size.w) / 2) : w - 8 - size.w, y: bottom - size.h, w: size.w, h: size.h };
  const layout = portrait ? {
    portrait, stage,
    header: { x: 6, y: 5, w: w - 12, h: 26 },
    party: { x: 6, y: h - 105, w: w - 12, h: 45 },
    message: { x: 6, y: h - 55, w: w - 12, h: 49 },
    work: { x: 6, y: 36, w: w - 12, h: h - 146 },
    reaction: { x: 6, y: 35, w: w - 12, h: 60 },
    grid: { x: 6, y: 109, w: w - 12, h: h - 219 },
    command: { x: 6, y: h - 190, w: w - 12, h: 80 },
  } : {
    portrait, stage,
    header: { x: 8, y: 6, w: 170, h: 24 },
    party: { x: 8, y: h - 59, w: 140, h: 51 },
    message: { x: 154, y: h - 59, w: w - 162, h: 51 },
    work: { x: 8, y: 35, w: w - 16, h: h - 99 },
    grid: { x: 8, y: 48, w: Math.min(246, stage.x - 14), h: h - 112 },
    command: { x: 8, y: 66, w: 126, h: 82 },
    commandHint: { x: 8, y: 35, w: 126, h: 25 },
    cost: { x: w - 82, y: 6, w: 74, h: 15 },
    result: { x: 8, y: 45, w: 180, h: 102 },
  };
  layout.foe = { x: stage.x + Math.floor(stage.w / 2), y: bottom };
  // Input-driven locks deliberately show a face reaction window beside the
  // causal arithmetic. Neither arithmetic nor effects paint across the plot.
  layout.castStage = portrait
    ? inputDriven ? { x: w - 68, y: 35, w: 62, h: 60 } : { ...layout.reaction }
    : inputDriven ? { x: stage.x, y: 35, w: stage.w, h: 60 } : stage;
  layout.causality = inputDriven ? portrait
    ? { x: 6, y: 35, w: w - 74, h: 60 }
    : { x: stage.x, y: 99, w: stage.w, h: h - 163 } : null;
  const guardTop = portrait ? bottom + 3 : layout.work.y;
  const guardBottom = layout.party.y - 4;
  const guardRadius = Math.min(47, Math.floor((guardBottom - guardTop) / 2));
  layout.guard = { x: layout.party.x + Math.floor(layout.party.w / 2), y: guardBottom - guardRadius, radius: guardRadius };
  const ox = Math.floor((screen.w - w) / 2);
  const oy = Math.floor((screen.h - h) / 2);
  const moved = new Set();
  for (const rect of Object.values(layout)) {
    if (!rect || typeof rect !== 'object' || moved.has(rect)) continue;
    moved.add(rect);
    rect.x += ox;
    rect.y += oy;
  }
  return layout;
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
  const mode = layout.portrait && battle.mode !== 'campaign' ? battle.mode === 'well' ? 'B' + battle.well.depth : battle.mode.toUpperCase() : '';
  const packetComparison = battle.mode === 'duel' && battle.phase === 'cast-result' && battle.essence.inputs;
  const hp = packetComparison ? `${battle.lastSpell.cost} B / FP32 ${battle.fenPayload.bytes} B` : battle.mode === 'duel' ? `ROUND ${battle.duelAccepted}/3` : `${mode ? mode + ' ' : ''}${battle.foeHp}/${battle.foe.hp}`;
  drawText(ctx, hp, r.x + r.w - 7, r.y + 5, { font: 'small', align: 'right', color: PAL.ui.dim });
  if (packetComparison) {
    drawBar(ctx, r.x + 7, r.y + r.h - 11, r.w - 14, 3, battle.lastSpell.cost, battle.fenPayload.bytes, { fill: PAL.ui.bytes });
    drawBar(ctx, r.x + 7, r.y + r.h - 6, r.w - 14, 3, battle.fenPayload.bytes, battle.fenPayload.bytes, { fill: PAL.ui.dim });
  } else if (battle.threadHp) {
    battle.threadHp.forEach((value, i) => drawBar(ctx, r.x + 7 + i * Math.floor((r.w - 18) / 3), r.y + r.h - 7, Math.floor((r.w - 24) / 3), 3, value, battle.threadMax[i], { fill: [PAL.rose[5], PAL.water[7], PAL.gold[6]][i] }));
  } else drawBar(ctx, r.x + 7, r.y + r.h - 7, r.w - 14, 3, battle.mode === 'duel' ? battle.duelAccepted : battle.foeHp, battle.foe.hp, { fill: battle.mode === 'duel' ? PAL.ui.good : battle.bossPhase === 2 ? PAL.ui.gold : PAL.ui.bad });
  if (!layout.portrait) {
    drawText(ctx, battle.mode === 'well' ? 'WELL B' + battle.well.depth : battle.mode === 'duel' ? 'DUEL ' + battle.duelAccepted + '/3' : battle.mode === 'practice' ? 'PRACTICE' : battle.guardian ? 'GUARDIAN' : 'STATIC', r.x + r.w + 9, r.y + 3, { font: 'small', color: PAL.ui.dim });
    if (battle.bossPhase === 2) drawText(ctx, 'PHASE 2', r.x + r.w + 9, r.y + 12, { font: 'small', color: PAL.ui.gold });
    const cost = battle.preview?.cost ?? 0;
    const chip = layout.cost;
    drawWindow(ctx, chip.x, chip.y, chip.w, chip.h, cost > battle.hero.bytes ? 'danger' : 'gold', t);
    drawIcon(ctx, 'byte', chip.x + 6, chip.y + 3);
    drawText(ctx, `${cost} B / CAST`, chip.x + chip.w - 6, chip.y + 4, { font: 'small', align: 'right', color: cost > battle.hero.bytes ? PAL.ui.error : PAL.ui.gold });
  }
}

function drawParty(ctx, battle, layout, t) {
  const r = layout.party;
  drawWindow(ctx, r.x, r.y, r.w, r.h, battle.braced || battle.resonance === 4 ? 'gold' : 'default', t);
  const impact = battle.heroImpact;
  if (impact && impact.age < impact.flash) {
    ctx.strokeStyle = impact.grade === 'perfect' ? PAL.ui.gold : PAL.ui.bad;
    ctx.lineWidth = 1;
    const shake = battle.game.reducedMotion || impact.grade === 'perfect' ? 0 : Math.round(Math.sin(impact.age * 110) * (battle.attack.charge ? 2 : 1) * Math.max(0, 1 - impact.age / 0.14));
    ctx.strokeRect(r.x + 1 + shake, r.y + 1, r.w - 2, r.h - 2);
  }
  if (battle.hero.hp < battle.limits.maxHp * 0.25) {
    ctx.strokeStyle = PAL.ui.hpLow;
    ctx.globalAlpha = battle.game.reducedMotion ? 0.7 : 0.55 + Math.sin(t * 2) * 0.15;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.globalAlpha = 1;
  }
  const reduced = battle.game.reducedMotion;
  const shake = !reduced && impact && impact.grade !== 'perfect' ? Math.round(Math.sin(impact.age * 110) * (battle.attack.charge ? 2 : 1) * Math.max(0, 1 - impact.age / (battle.attack.charge ? 0.14 : 0.1))) : 0;
  drawCharacter(ctx, 'hero', r.x + 17 + shake, r.y + 43, { dir: 'right', frame: -1, hat: battle.game.state.hat, t: !reduced && impact && impact.age < impact.pose ? impact.time : t });
  if (impact && impact.grade === 'perfect' && impact.age < impact.flash) drawIcon(ctx, 'shield', r.x + 15, r.y + 15);
  drawText(ctx, 'YOU', r.x + 7, r.y + 6, { font: 'small', color: PAL.ui.gold });
  const friends = battle.friends ?? [];
  friends.forEach((friend, i) => {
    const size = layout.portrait ? 12 : 10;
    const x = r.x + 44 + i * (size + 2);
    drawFriendEmblem(ctx, friend, x, r.y + 4, { t, size });
    if ((battle.game.state.bonds?.[friend] ?? 0) >= 8) { ctx.strokeStyle = PAL.ui.gold; ctx.strokeRect(x - 1, r.y + 3, size + 2, size + 2); }
  });
  const labelX = r.x + 31;
  const meterX = r.x + 66;
  const meterW = r.w - 74;
  drawText(ctx, `HP ${battle.hero.hp}`, labelX, r.y + 19, { font: 'small', color: battle.hero.hp < battle.limits.maxHp * 0.3 ? PAL.ui.warn : PAL.ui.text });
  drawBar(ctx, meterX, r.y + 21, meterW, 5, battle.hero.hp, battle.limits.maxHp, { fill: battle.hero.hp < battle.limits.maxHp * 0.3 ? PAL.ui.hpLow : PAL.ui.hp });
  drawText(ctx, `${battle.hero.bytes} B`, labelX, r.y + 31, { font: 'small', color: PAL.ui.bytes });
  drawBar(ctx, meterX, r.y + 33, meterW, 5, battle.hero.bytes, battle.limits.maxBytes, { fill: PAL.ui.bytes });
  const pipX = layout.portrait ? r.x + r.w - 49 : r.x + r.w - 39;
  const pipY = layout.portrait ? r.y + 6 : r.y + 42;
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i < battle.resonance ? PAL.ui.gold : PAL.night[4];
    ctx.fillRect(pipX + i * 8, pipY, 5, 5);
  }
  if (!layout.portrait) drawText(ctx, battle.resonance === 4 ? 'FULL RESONANCE' : `${battle.hero.snacks} snacks · R ${battle.resonance}/4`, r.x + 31, r.y + 42, { font: 'small', color: battle.resonance === 4 ? PAL.ui.gold : PAL.ui.dim });
}

export function battlePrompt(battle) {
  const touch = battle.game.input?.lastDevice === 'touch';
  const act = touch ? 'A' : 'ENTER';
  const back = touch ? 'B' : 'ESC';
  if (battle.phase === 'menu') return touch ? 'D-pad choose · A select · START pause' : 'ARROWS choose · ENTER confirm · N notes';
  if (battle.phase === 'tune') return `← → change · ${act} toggle · ${back} ready`;
  if (battle.phase === 'scan') return battle.lastCast ? `←→ Current/Last · ↑↓ scroll · ${back} back` : `↑↓ scroll · ${act}/${back} return`;
  if (battle.phase === 'friends') return `↑↓ friend · ←→ plan · ${act} arm · ${back} back`;
  if (battle.phase === 'result') {
    if (battle.result?.grade && battle.tallyAge < TALLY_DURATION) return `${act} finish tally`;
    if (battle.mode === 'practice' || battle.mode === 'duel') return `←→ ${battle.resultChoice ? 'Continue · >AGAIN' : '>CONTINUE · Again'} · ${act}`;
    return `${act} continue`;
  }
  if (['lock', 'balance'].includes(battle.phase)) return touch ? 'A lock · hold STEADY · B back' : 'ENTER lock · SHIFT steady · ESC back';
  if (battle.phase === 'spotlight') return `${touch ? 'D-pad' : 'Arrows'} channel · ${act} keep · ${back} back`;
  if (battle.phase === 'budget') return `↑↓ head · ←→ bits · ${act} ready`;
  if (battle.phase === 'guard-ready') return `Release ${act} · tap ${act} when ready`;
  if (battle.phase === 'guard') return battle.guardAttempt ? 'TAP USED · wait for the next beat' : `Tap ${act} as the rings meet`;
  if (battle.phase === 'cast-result') {
    if (battle.lastSpell.rows.length > 1) return `←→ inspect row · ${act} read on`;
    if (battle.resultRetained) return `${act} read on${battle.resultMessages.length ? ' · ' + (battle.resultMessages.length + 1) + ' notes' : ''}`;
    return `Auto · ${act} continue · hold to speed`;
  }
  return `Hold ${act} to speed animations`;
}

function drawMessage(ctx, battle, layout, t) {
  const r = layout.message;
  drawWindow(ctx, r.x, r.y, r.w, r.h, 'dialog', t);
  textBlock(ctx, battle.message, r.x + 8, r.y + 6, r.w - 16, { maxLines: 3, maxChars: Math.floor((battle.messageAge ?? 10) * 82) });
  drawText(ctx, battlePrompt(battle), r.x + 8, r.y + r.h - 11, { font: 'small', color: PAL.ui.dim });
}

function drawTune(ctx, battle, layout, t) {
  const r = layout.work;
  const items = battle.tuneItems ?? [];
  const listW = layout.portrait ? r.w : 162;
  const visible = layout.portrait ? Math.min(4, items.length) : Math.max(2, Math.floor((r.h - 29) / 13));
  const listH = layout.portrait ? 29 + visible * 13 : r.h;
  drawWindow(ctx, r.x, r.y, listW, listH, 'default', t);
  drawText(ctx, 'TUNE · FREE', r.x + 8, r.y + 6, { color: PAL.ui.gold });
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
  drawGridPanel(ctx, grid, battle.gridModel, t, { focusRow: layout.portrait, compact: true, showLegend: false, title: 'PREVIEW · IDEAL RANGE', reduced: battle.game.reducedMotion });
}

function drawFriends(ctx, battle, layout, t) {
  const r = layout.work;
  const listW = layout.portrait ? r.w : 170;
  const visible = Math.min(battle.friends.length, layout.portrait ? 4 : 5);
  const listH = layout.portrait ? 29 + visible * 15 : r.h;
  drawWindow(ctx, r.x, r.y, listW, listH, 'gold', t);
  drawText(ctx, 'FRIENDS · PARTIAL PLANS', r.x + 8, r.y + 6, { font: 'small', color: PAL.ui.gold });
  const start = Math.max(0, battle.assistIndex - visible + 1);
  for (let i = start; i < Math.min(battle.friends.length, start + visible); i++) {
    const key = battle.friends[i];
    const y = r.y + 22 + (i - start) * 15;
    const available = assistAvailability(key, battle);
    if (i === battle.assistIndex) drawCursor(ctx, r.x + 6, y, t);
    const xp = battle.game.state.bonds?.[key] ?? 0;
    const level = xp >= 8 ? 3 : xp >= 3 ? 2 : 1;
    drawFriendEmblem(ctx, key, r.x + 16, y - 2, { t, size: 12, bondLevel: level });
    if (level === 3) { ctx.strokeStyle = PAL.ui.gold; ctx.strokeRect(r.x + 15, y - 3, 14, 14); }
    drawText(ctx, key.toUpperCase() + ' L' + level, r.x + 32, y, { font: 'small', color: available.ok ? PAL.ui.text : PAL.ui.dim });
    drawText(ctx, battle.assistsUsed.includes(key) ? 'SPENT' : '1/1', r.x + listW - 8, y, { font: 'small', align: 'right', color: available.ok ? PAL.ui.good : PAL.ui.dim });
  }
  const key = battle.friends[battle.assistIndex];
  const grid = layout.portrait ? { x: r.x, y: r.y + listH + 4, w: r.w, h: r.h - listH - 4 } : { x: r.x + listW + 6, y: r.y, w: r.w - listW - 6, h: r.h };
  if (grid.h >= 42) drawGridPanel(ctx, grid, battle.gridModel, t, { compact: true, focusRow: layout.portrait, showLegend: false, reduced: battle.game.reducedMotion, title: ASSISTS[key].name.toUpperCase() });
}

export function scanPanelContent(battle, layout) {
  const r = layout.work;
  const multi = battle.gridModel.rows.length > 1;
  const chartHeight = layout.portrait ? multi ? Math.min(140, Math.floor(r.h * 0.62)) : Math.min(battle.scanPage > 0 ? 104 : 92, Math.floor(r.h * 0.44)) : r.h - 28;
  const text = { x: r.x + 9, y: r.y + 23, w: layout.portrait ? r.w - 18 : 173, h: layout.portrait ? r.h - chartHeight - 35 : r.h - 36 };
  const chart = layout.portrait
    ? { x: r.x + 6, y: r.y + r.h - chartHeight - 5, w: r.w - 12, h: chartHeight }
    : { x: r.x + 184, y: r.y + 20, w: r.w - 192, h: chartHeight };
  return { text, chart, rows: (battle.scanLines ?? []).flatMap(line => wrapText(line, text.w, 'small')), capacity: Math.max(1, Math.floor(text.h / 9)) };
}

function drawScan(ctx, battle, layout, t) {
  const r = layout.work;
  drawWindow(ctx, r.x, r.y, r.w, r.h, 'default', t);
  drawIcon(ctx, 'scan', r.x + 9, r.y + 7);
  const last = battle.scanPage > 0;
  drawText(ctx, last ? `SCAN · LAST SNAP ${battle.scanPage}/${battle.lastCast.spell.rows.length}` : 'SCAN · CURRENT ESSENCE', r.x + 23, r.y + 6, { color: PAL.ui.gold });
  const { text, chart, rows, capacity } = scanPanelContent(battle, layout);
  const start = Math.min(battle.scanScroll ?? 0, Math.max(0, rows.length - capacity));
  rows.slice(start, start + capacity).forEach((line, index) => drawText(ctx, line, text.x, text.y + index * 9, { font: 'small', color: PAL.ui.text }));
  if (rows.length > capacity) drawText(ctx, `↑ ↓ ${start + 1}–${Math.min(start + capacity, rows.length)}/${rows.length}`, text.x, text.y + text.h + 2, { font: 'small', color: PAL.ui.gold });
  drawGridPanel(ctx, chart, battle.gridModel, t, { focusRow: layout.portrait, compact: true, showLegend: false, title: last ? 'LAST SNAP · RED = ERROR' : battle.essence.hidden ? 'BOTH ARCHIVES · FIXED RULER' : 'VALUE DISTRIBUTION' });
}

function drawSpotlight(ctx, battle, layout, t) {
  const r = layout.work;
  drawWindow(ctx, r.x, r.y, r.w, r.h, 'gold', t);
  drawText(ctx, `SPOTLIGHT · KEEP ${battle.gear.spotlight}`, r.x + 9, r.y + 6, { color: PAL.ui.gold });
  textBlock(ctx, 'This input multiplies this weight’s rounding error, so keep hot channels.', r.x + 9, r.y + 19, r.w - 18, { font: 'small', maxLines: 2, color: PAL.ui.dim });
  const hot = battle.salience;
  const cols = layout.portrait ? 8 : 16;
  const rows = Math.ceil(hot.length / cols);
  const cellW = Math.floor((r.w - 18) / cols);
  const cellH = Math.floor((r.h - 50) / rows);
  const largest = Math.max(1e-9, ...hot);
  hot.forEach((value, i) => {
    const x = r.x + 9 + (i % cols) * cellW;
    const y = r.y + 43 + Math.floor(i / cols) * cellH;
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
  const labels = battle.essence.rows.map(row => row.label.split(' ')[0].toUpperCase());
  const sensitivities = battle.essence.sensitivities ?? [3, 1, 0.4];
  const listWidth = layout.portrait ? r.w : 174;
  for (let i = 0; i < 3; i++) {
    const y = r.y + 26 + i * (layout.portrait ? 15 : 24);
    if (battle.budgetIndex === i) drawCursor(ctx, r.x + 9, y, t);
    drawText(ctx, labels[i] + (layout.portrait ? ' ×' + sensitivities[i] : ''), r.x + 21, y, { color: battle.budgetIndex === i ? PAL.ui.gold : PAL.ui.text });
    if (!layout.portrait) drawText(ctx, `${sensitivities[i]}× sensitive`, r.x + 21, y + 10, { font: 'small', color: PAL.ui.dim });
    drawText(ctx, `← ${battle.gear.budget[i]} BIT →`, r.x + listWidth - 12, y + 3, { font: 'small', align: 'right', color: PAL.ui.good });
  }
  const previewRect = layout.portrait
    ? { x: r.x + 6, y: r.y + 69, w: r.w - 12, h: r.h - 89 }
    : { x: r.x + 179, y: r.y + 22, w: r.w - 185, h: r.h - 42 };
  if (previewRect.h >= 42) drawGridPanel(ctx, previewRect, battle.gridModel, t, { focusRow: layout.portrait, compact: true, showLegend: false, title: 'SPEND WHERE ERROR MATTERS' });
  drawText(ctx, `${battle.preview.cost} B packet · change bits where it matters`, r.x + 9, r.y + r.h - 12, { font: 'small', color: battle.preview.cost > battle.hero.bytes ? PAL.ui.error : PAL.ui.bytes });
}

const numeric = value => Math.abs(value) >= 100 ? value.toFixed(0) : Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2);

function drawCausality(ctx, battle, rect, t) {
  const spell = ['snap', 'cast-result'].includes(battle.phase) ? battle.lastSpell : battle.preview;
  const essence = battle.essence;
  if (!essence.inputs || !spell) return;
  drawWindow(ctx, rect.x, rect.y, rect.w, rect.h, 'glass', t);
  const x = rect.x + 5;
  const width = rect.w - 10;
  const channel = battle.locks.protected[0] ?? battle.salience.indexOf(Math.max(...battle.salience));
  const weight = spell.rows.find(row => row.source === 'weight');
  const activation = spell.rows.find(row => row.source === 'activation');
  if (!activation) {
    drawText(ctx, `HOT #${channel + 1} · TRUE > REBUILT`, x, rect.y + 5, { font: 'small', color: PAL.ui.gold });
    const max = Math.max(1e-6, ...spell.reference.map(Math.abs), ...spell.reconstructed.map(Math.abs));
    for (let i = 0; i < spell.reference.length; i++) {
      const y = rect.y + 15 + i * 11;
      drawText(ctx, `${i + 1}: ${numeric(spell.reference[i])} > ${numeric(spell.reconstructed[i])}`, x, y, { font: 'small', color: PAL.ui.text });
      const center = x + Math.floor(width / 2);
      for (const [value, color, offset] of [[spell.reference[i], PAL.cream[6], 7], [spell.reconstructed[i], PAL.water[6], 9]]) {
        const size = Math.round(value / max * (width / 2 - 2));
        ctx.fillStyle = color;
        ctx.fillRect(size < 0 ? center + size : center, y + offset, Math.max(1, Math.abs(size)), 1);
      }
    }
    if (rect.h >= 75) textBlock(ctx, `HOT #${channel + 1}: input × weight error`, x, rect.y + 53, width, { font: 'small', maxLines: 3, color: PAL.ui.warn });
    else if (rect.h >= 60) drawText(ctx, `HOT #${channel + 1} amplifies error`, x, rect.y + rect.h - 9, { font: 'small', color: PAL.ui.warn });
  } else {
    const rawA = essence.inputs[0][channel];
    const rawW = essence.weights[channel];
    const a = activation.values[channel];
    const w = weight.values[channel];
    const product = activation.recon[channel] * weight.recon[channel];
    drawText(ctx, battle.gear.balance ? `#${channel + 1} A SHRINKS · W GROWS` : `PAIRED CHANNEL ${channel + 1}`, x, rect.y + 5, { font: 'small', color: PAL.ui.gold });
    drawText(ctx, `A ${numeric(rawA)} > ${numeric(a)}`, x, rect.y + 15, { font: 'small', color: PAL.water[7] });
    drawText(ctx, `W ${numeric(rawW)} > ${numeric(w)}`, x, rect.y + 24, { font: 'small', color: PAL.rose[6] });
    drawText(ctx, `RAW A×W ${numeric(rawA * rawW)} = ${numeric(a * w)}`, x, rect.y + 34, { font: 'small', color: PAL.ui.text });
    drawText(ctx, `Rounded: ${numeric(product)}`, x, rect.y + 43, { font: 'small', color: PAL.ui.gold });
    if (rect.h >= 75) textBlock(ctx, 'A shrinks; W grows; raw A×W stays the same.', x, rect.y + 54, width, { font: 'small', maxLines: 3, color: PAL.ui.dim });
  }
}

function drawCast(ctx, battle, layout, t) {
  const r = layout.grid;
  let title = 'SNAP · RECONSTRUCTING';
  if (battle.phase === 'lock') title = `${battle.lockLabel} · ${battle.lockIndex + 1}/${battle.lockSteps.length}`;
  if (battle.phase === 'balance') title = `BALANCE · ALPHA ${battle.locks.alpha.toFixed(2)}`;
  if (battle.phase === 'cast-result') title = battle.lastSpell.fizzle ? 'FIZZLE · TOO NOISY' : battle.lastSpell.perfect ? 'PERFECT · 1.25×' : `${battle.lastDamage} DAMAGE · ${formatFidelity(battle.gridModel.scoreFidelity)}${battle.lastSpell.threadFidelities ? ' MIN THREAD' : ' FIDELITY'}`;
  if (battle.phase === 'cast-result' && battle.mode === 'duel') title = `ROUND ${battle.duelAccepted}/3 · ${formatFidelity(battle.gridModel.scoreFidelity)} FIDELITY`;
  textBlock(ctx, title, r.x + 3, r.y - 12, r.w - 6, { font: 'small', maxLines: 1, color: battle.phase === 'cast-result' && battle.lastSpell.fizzle ? PAL.ui.error : PAL.ui.gold });
  drawGridPanel(ctx, r, battle.gridModel, t, { focusRow: layout.portrait, reduced: battle.game.reducedMotion, independentRows: battle.gear.groups || Boolean(battle.gear.budget), showLegend: !layout.portrait || r.h > 150 });
  if (layout.causality) drawCausality(ctx, battle, layout.causality, t);
}

function drawDuelComparison(ctx, battle, layout, t) {
  if (battle.mode === 'duel' && battle.phase === 'cast-result' && !battle.essence.inputs) {
    const judge = battle.duelJudgement;
    const x = layout.grid.x + layout.grid.w + 8;
    const box = layout.portrait ? { ...layout.reaction, h: 72 } : { x, y: 35, w: layout.work.x + layout.work.w - x, h: 72 };
    // Draw last: the opaque result card covers the reaction sprite and its VFX.
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = PAL.night[1];
    ctx.fillRect(box.x, box.y, box.w, box.h);
    drawWindow(ctx, box.x, box.y, box.w, box.h, 'default', t);
    drawText(ctx, `${judge.fidelityOk ? 'OK' : 'NO'} F ≥98.5%`, box.x + 5, box.y + 5, { font: 'small', color: judge.fidelityOk ? PAL.ui.good : PAL.ui.warn });
    drawText(ctx, 'FP32 F ' + formatFidelity(battle.fenPayload.fidelity), box.x + box.w - 5, box.y + 5, { font: 'small', align: 'right', color: PAL.ui.dim });
    drawText(ctx, `${judge.packetOk ? 'OK' : 'NO'} ≤${judge.cap} B · ${battle.duelAccepted}/3`, box.x + 5, box.y + 15, { font: 'small', color: judge.packetOk ? PAL.ui.good : PAL.ui.warn });
    drawText(ctx, `YOU ${judge.cost} B / FP32 ${battle.fenPayload.bytes} B`, box.x + 5, box.y + 26, { font: 'small', color: PAL.ui.bytes });
    drawBar(ctx, box.x + 5, box.y + 36, box.w - 10, 3, judge.cost, battle.fenPayload.bytes, { fill: PAL.ui.bytes });
    drawBar(ctx, box.x + 5, box.y + 41, box.w - 10, 3, battle.fenPayload.bytes, battle.fenPayload.bytes, { fill: PAL.ui.dim });
    drawText(ctx, 'TOY PAYLOAD BASELINE', box.x + 5, box.y + 49, { font: 'small', color: PAL.ui.dim });
    drawText(ctx, 'NOT A HARDWARE MEASUREMENT', box.x + 5, box.y + 59, { font: 'small', color: PAL.ui.dim });
    ctx.restore();
  }
}

function drawEnemyTurn(ctx, battle, layout, t) {
  const r = layout.portrait ? layout.work : { ...layout.work, w: layout.stage.x - 14 };
  if (battle.phase === 'telegraph') {
    const h = 47;
    const y = r.y + r.h - h;
    drawWindow(ctx, r.x, y, r.w, h, battle.attack.charge ? 'danger' : 'glass', t);
    drawIcon(ctx, battle.attack.charge ? 'bolt' : 'shield', r.x + 8, y + 8);
    textBlock(ctx, battle.attack.telegraph, r.x + 23, y + 7, r.w - 31, { maxLines: 3, color: battle.attack.charge ? PAL.ui.warn : PAL.ui.text });
  }
  if (battle.phase === 'guard' || battle.phase === 'guard-ready') {
    const centerX = layout.guard.x;
    const centerY = layout.guard.y;
    const remaining = battle.guardTarget - battle.guardElapsed;
    const radius = Math.round(13 + Math.max(-0.15, remaining) * (layout.guard.radius - 13) / 0.85);
    const attempted = battle.guardAttempt != null;
    ring(ctx, centerX, centerY, 13, attempted ? PAL.ui.dim : PAL.ui.good, 2);
    if (!attempted) ring(ctx, centerX, centerY, Math.max(5, radius), Math.abs(remaining) < battle.guardWindows.perfect ? PAL.ui.gold : PAL.ui.border, 2);
    drawIcon(ctx, 'shield', centerX - 3, centerY - 3);
    drawText(ctx, `${battle.hitIndex + 1}/${battle.attack.hits.length}`, centerX + 37, centerY - 2, { font: 'small', color: PAL.ui.gold });
    drawText(ctx, battle.phase === 'guard-ready' ? 'READY?' : attempted ? battle.guardFeedback + ' · TAP USED' : 'TAP ONCE', centerX, centerY + 17, { font: 'small', align: 'center', color: battle.guardAttempt?.grade === 'miss' ? PAL.ui.bad : PAL.ui.gold });
  }
}

function drawResult(ctx, battle, layout, t) {
  const won = battle.result.outcome === 'won';
  const r = layout.work;
  drawWindow(ctx, r.x, r.y, r.w, r.h, won ? 'gold' : 'default', t);
  const grade = battle.result.grade;
  const title = battle.mode === 'duel' ? won ? 'FEN · THREE AGREED ROUNDS!' : 'THE MAPS CAN WAIT'
    : battle.mode === 'practice' ? 'PRACTICE COMPLETE'
    : battle.mode === 'well' ? 'WELL B' + battle.well.depth + (won ? ' CLEARED' : ' · LANTERN HOME')
    : won ? battle.guardian ? `${battle.foe.name} became your friend!` : 'The Static drifts away!' : battle.result.outcome === 'lost' ? 'A light will guide you home.' : 'You slip away safely.';
  textBlock(ctx, (battle.recognition ? battle.recognition + ' · ' : '') + title, r.x + 9, r.y + 6, r.w - 18, { font: 'small', color: won ? PAL.ui.gold : PAL.ui.text, maxLines: 2 });
  if (!grade) {
    textBlock(ctx, battle.mode === 'duel' ? `${battle.duelAccepted}/3 rounds · ${battle.stats.casts} casts. The FP32 payload baseline is a toy, not a hardware measurement.` : battle.recap, r.x + 9, r.y + 34, r.w - 18, { font: 'small', maxLines: 4, color: PAL.ui.dim });
    return;
  }
  const rowY = r.y + 25;
  const rowH = layout.portrait ? 20 : 13;
  const totalShown = battle.tallyAge >= TALLY_STEPS[5];
  for (let i = 0; i < grade.lines.length; i++) {
    const line = grade.lines[i];
    const shown = battle.tallyAge >= TALLY_STEPS[i + 1];
    drawText(ctx, line.label, r.x + 9, rowY + i * rowH, { font: 'small', color: shown ? PAL.ui.text : PAL.ui.dim });
    // The stamp is 40 px wide; reserve its column throughout the tally and landing.
    if (shown) drawText(ctx, `${line.value} · ${line.points.toFixed(1)}`, r.x + r.w - 58, rowY + i * rowH, { font: 'small', align: 'right', color: PAL.ui.gold });
  }
  const footerY = rowY + 4 * rowH;
  if (totalShown) {
    drawText(ctx, `${grade.score}/100 · R ${battle.maxResonance}/4`, r.x + 9, footerY, { font: 'small', color: PAL.ui.gold });
    drawGradeStamp(ctx, r.x + r.w - 26, footerY + 16, grade.letter, Math.max(0, battle.tallyAge - TALLY_STEPS[5]), { scale: 1, reduced: battle.game.reducedMotion });
    const detail = grade.unmet.length ? grade.unmet.join(' · ') : battle.newBest ? 'NEW BEST · comparable foe record' : 'Won-fight mastery record';
    if (battle.tallyAge >= TALLY_DURATION) textBlock(ctx, detail + (battle.assistsUsed.length ? ' · Assisted: ' + battle.assistsUsed.join(', ') : ' · Unassisted'), r.x + 9, footerY + 12, r.w - 57, { font: 'small', color: battle.newBest ? PAL.ui.gold : PAL.ui.dim, maxLines: layout.portrait ? 3 : 2 });
  }
}

export function drawBattleView(ctx, screen, battle, t) {
  const layout = battleLayout(screen, battle.artId ?? battle.foeId, Boolean(battle.essence.inputs));
  const casting = ['lock', 'balance', 'snap', 'cast-result'].includes(battle.phase);
  const visibleStage = casting ? layout.castStage : layout.stage;
  drawBattleBackground(ctx, screen, battle.foe.background, t, { depth: battle.well?.depth, stage: visibleStage, reduced: battle.game.reducedMotion, intensity: battle.bossPhase === 2 ? 1.15 : 0.8 });
  const offset = battle.vfx?.offset ?? { x: 0, y: 0 };
  const cropped = casting && (layout.portrait || Boolean(battle.essence.inputs));
  const creatureX = visibleStage.x + Math.floor(visibleStage.w / 2);
  const creatureY = cropped ? visibleStage.y + battleCreatureSize(battle.artId ?? battle.foeId).h - 12 : layout.foe.y;
  if (cropped) {
    ctx.save(); ctx.beginPath();
    ctx.rect(visibleStage.x, visibleStage.y, visibleStage.w, visibleStage.h); ctx.clip();
  }
  const impact = battle.impact;
  const reduced = battle.game.reducedMotion;
  drawBattleCreature(ctx, battle.artId ?? battle.foeId, Math.round(creatureX + offset.x), Math.round(creatureY + offset.y), {
    t: !reduced && impact && impact.age < impact.pose ? impact.time : t,
    golden: battle.golden,
    corrupted: battle.mode !== 'duel' && !(battle.result?.outcome === 'won' && battle.phaseAge > 0.18),
    flash: !reduced && impact && impact.age < impact.flash ? 1 - impact.age / impact.flash : 0,
    hurt: !reduced && impact && impact.age < impact.pose ? 0.7 : 0,
    squash: !reduced && battle.phase === 'telegraph' ? Math.sin(battle.phaseAge * 6) * 0.15 : 0,
    phase: battle.bossPhase,
  });
  if (reduced && impact && impact.age < 0.12) {
    ctx.strokeStyle = PAL.ui.gold; ctx.strokeRect(visibleStage.x, visibleStage.y, visibleStage.w, visibleStage.h);
  }
  if (cropped) ctx.restore();
  drawHeader(ctx, battle, layout, t);
  if (battle.phase === 'menu') {
    const r = layout.command;
    drawWindow(ctx, r.x, r.y, r.w, r.h, 'default', t);
    drawMenu(ctx, r.x + 7, r.y + 8, battle.commands, battle.menu, { cols: 2, colWidth: Math.floor((r.w - 13) / 2), rowHeight: 17, t, disabled: !battle.friends?.length || battle.mode === 'duel' ? new Set([3]) : new Set() });
    drawText(ctx, battle.charging ? 'CHARGE INCOMING · BRACE!' : `TURN ${battle.stats.turns + 1} · ${battle.preview?.cost ?? 0} B SNAP`, r.x + 8, r.y + r.h - 13, { font: 'small', color: battle.charging ? PAL.ui.warn : PAL.ui.bytes });
    if (!layout.portrait) {
      const hint = layout.commandHint;
      drawWindow(ctx, hint.x, hint.y, hint.w, hint.h, 'glass', t);
      textBlock(ctx, battle.menu === 3 && !battle.friends?.length ? 'Befriend a guardian first.' : battle.menu === 3 && battle.mode === 'duel' ? 'Fen’s duels are yours alone.' : battle.menu === 1 && battle.tuneItems.length === 1 ? 'Grid Stones unlock new tuning tools.' : COMMAND_HINTS[battle.menu], hint.x + 6, hint.y + 6, hint.w - 12, { font: 'small', maxLines: 2, color: PAL.ui.dim });
    }
  } else if (battle.phase === 'tune') drawTune(ctx, battle, layout, t);
  else if (battle.phase === 'friends') drawFriends(ctx, battle, layout, t);
  else if (battle.phase === 'scan') drawScan(ctx, battle, layout, t);
  else if (battle.phase === 'spotlight') drawSpotlight(ctx, battle, layout, t);
  else if (battle.phase === 'budget') drawBudget(ctx, battle, layout, t);
  else if (casting) drawCast(ctx, battle, layout, t);
  else if (battle.phase === 'result') drawResult(ctx, battle, layout, t);
  drawParty(ctx, battle, layout, t);
  drawMessage(ctx, battle, layout, t);
  drawEnemyTurn(ctx, battle, layout, t);
  if (casting) {
    ctx.save(); ctx.beginPath(); ctx.rect(visibleStage.x, visibleStage.y, visibleStage.w, visibleStage.h); ctx.clip();
    battle.vfx?.draw(ctx); ctx.restore();
  } else battle.vfx?.draw(ctx);
  drawDuelComparison(ctx, battle, layout, t);
}
