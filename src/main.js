import './styles.css';
import { LESSONS, evaluateEncounter } from './campaign.js';
import { GUIDE } from './field-guide.js';
import { IslandWorld, LOCATIONS } from './world.js';
import { drawSprite, spriteDataUrl } from './art.js';
import { loadAdventure, saveAdventure, newAdventure } from './save.js';
import { GameAudio } from './audio.js';
import { drawEncounterScene, SCENE_CAPTIONS } from './scenes.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fmt = value => Number.isFinite(value) ? (Math.abs(value) < 0.001 && value !== 0 ? value.toExponential(2) : Number(value.toFixed(4)).toString()) : '—';
const colors = ['#b6db8c', '#e6bc6a', '#88c6c3', '#b0a7d6', '#e5a070', '#c3a1d3', '#e6bc6a'];
const chapterLabels = ['Bit depth', 'Zero point', 'Calibration', 'Channels', 'Inference', 'Outliers', 'Deployment'];
const chapterOutcomes = ['The stepping stones align!', 'The zero bell rings!', 'The weather route clears!', 'Every thread finds its ruler!', 'The forge relays agree!', 'The outlier pulley balances!', 'The precision beacon wakes!'];
const images = new Map();
function sprite(kind) {
  if (!images.has(kind)) images.set(kind, spriteDataUrl(kind, 5));
  return images.get(kind);
}
let state = loadAdventure();
const audio = new GameAudio(state.sound);
let world;
let dialog;
let dialogKind = '';
let encounter = null;
let returnFocus = null;
let guideReturn = null;
let toastTimer;
let saveTimer;
let lastNearby = -1;
let storageAvailable = true;

function persist() {
  storageAvailable = saveAdventure(state);
  const indicator = document.querySelector('.save-indicator');
  if (indicator) indicator.textContent = storageAvailable ? 'SAVED ON THIS DEVICE' : 'SESSION ONLY · STORAGE UNAVAILABLE';
}

function toast(message) {
  const element = document.querySelector('.toast');
  element.textContent = message;
  element.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('visible'), 4200);
}

function chapter() { return Math.min(state.completed.length, 6); }

function renderShell() {
  world?.destroy();
  document.querySelector('#app').innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <a class="brand" href="./" aria-label="Bitbound home"><img class="brand-mark" src="./favicon.svg" alt="" /><span><span class="brand-name">BITBOUND</span><span class="brand-subtitle">A QUANTIZATION ADVENTURE</span></span></a>
        <div class="top-actions"><span class="save-indicator">SAVED ON THIS DEVICE</span><button class="icon-button" data-action="guide">Field guide</button><button class="icon-button" data-action="sound" aria-pressed="${state.sound}">${state.sound ? 'Sound on' : 'Sound off'}</button><button class="icon-button" data-action="settings" aria-label="Adventure settings">Settings</button></div>
      </header>
      <main>
        <div class="game-layout">
          <section class="world-panel" aria-labelledby="world-title">
            <div class="panel-heading"><div><p class="eyebrow">EXPLORE · EXPERIMENT · BEFRIEND</p><h1 id="world-title">The Tensor Isles</h1></div><span class="status-pill">${state.completed.length === 7 ? 'ISLAND RESTORED' : 'ADVENTURE MODE'}</span></div>
            <div class="world-stage"><canvas id="world" width="480" height="288" tabindex="0" aria-label="Explorable pixel-art island. Use arrow keys or W A S D to move, then E or Enter near a guardian. The location buttons below are an equal alternative."></canvas><div class="world-overlay"><span class="location-tag">BITLEAF MEADOW</span><span class="world-hint">${state.completed.length === 7 ? 'Every spirit has found a home.' : 'Follow the golden beacon.'}</span></div></div>
            <div class="world-footer"><p class="control-hint"><kbd>W A S D</kbd> / <kbd>↑ ↓ ← →</kbd> move<br /><kbd>E</kbd> / <kbd>Enter</kbd> interact · tap a guardian to visit</p><div class="dpad" aria-label="Movement controls"><button data-dir="up" aria-label="Move up">↑</button><button data-dir="left" aria-label="Move left">←</button><button data-dir="down" aria-label="Move down">↓</button><button data-dir="right" aria-label="Move right">→</button></div><button class="interact-button" data-action="interact">Interact <span>E</span></button></div>
            <nav class="journey-strip" aria-label="Visit island locations">${regionButtons()}</nav>
          </section>
          <aside class="sidebar" aria-label="Your adventure"><div id="quest-container">${questCard()}</div><section class="collection-card"><div class="panel-heading"><h2>Your companions</h2><span id="team-count">${state.completed.length}/7</span></div><div class="collection-grid">${teamSlots()}</div><button class="secondary-button" data-action="team">Open spirit journal →</button></section><section class="tip-card"><p class="eyebrow">A LITTLE FIELD NOTE</p><p>Fewer bits means a lighter pack.<br /><strong>Not automatically a faster model.</strong></p><button class="research-link" data-guide="deployment">Why the difference? ↗</button></section></aside>
        </div>
        <div class="bottom-bar"><span class="chapter-count">${state.completed.length} OF 7 SPIRITS BEFRIENDED</span><div class="progress-track" role="progressbar" aria-label="Adventure progress" aria-valuemin="0" aria-valuemax="7" aria-valuenow="${state.completed.length}"><div class="progress-fill" style="width:${state.completed.length / 7 * 100}%"></div></div><span>SMALL BITS. BIG ADVENTURE.</span></div>
      </main>
      <footer class="site-footer"><span>Original pixel art. Real numerical experiments. Zero prerequisites.</span><span><button class="research-link" data-action="guide">Research & sources</button> · <a href="https://github.com/mottopanikeiku/bitbound-quantization-quest" target="_blank" rel="noopener noreferrer">Source code ↗</a></span></footer>
    </div>
    <dialog id="overlay" class="game-dialog" aria-labelledby="dialog-title"></dialog><div class="toast" role="status" aria-live="polite"></div>`;
  dialog = document.querySelector('#overlay');
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
  dialog.addEventListener('click', onDialogClick);
  dialog.addEventListener('change', event => {
    if (event.target.id === 'signal-choice' && encounter) {
      encounter.signal = Number(event.target.value);
      renderEncounter('#signal-choice', true);
    }
  });
  world = new IslandWorld(document.querySelector('#world'), {
    onEncounter: openEncounter,
    onLocked: id => toast(`Befriend ${LESSONS[Math.max(0, id - 1)].name} to open the path to ${LESSONS[id].place}.`),
    onMove: position => {
      state.position = position;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(persist, 250);
      updateNearby(position);
    },
  });
  world.setProgress(state.completed);
  if (state.position) world.setPosition(state.position);
  updateNearby(world.getPosition());
  persist();
}

function regionButtons() {
  return LESSONS.map(lesson => {
    const complete = state.completed.includes(lesson.id);
    const unlocked = lesson.id <= state.completed.length;
    return `<button class="region-stop ${complete ? 'complete' : lesson.id === chapter() ? 'current' : 'locked'}" data-travel="${lesson.id}" aria-disabled="${!unlocked}" aria-label="${complete ? 'Replay' : unlocked ? 'Visit' : 'Locked:'} ${esc(lesson.place)}${complete ? ', befriended' : ''}"><span class="region-number">${complete ? '✓' : String(lesson.id + 1).padStart(2, '0')}</span><span class="region-name">${esc(chapterLabels[lesson.id])}</span></button>`;
  }).join('');
}

function questCard() {
  if (state.completed.length === 7) return `<section class="quest-card"><p class="quest-label">ADVENTURE COMPLETE</p><img class="quest-sprite" src="${sprite('dragon')}" alt="Your dragon companion" /><h2>The island is alive again.</h2><p>Seven spirits. Seven ideas. One precision ranger.</p><button class="primary-button" data-action="ending">See your ending →</button><button class="secondary-button" data-action="team">Revisit your companions</button></section>`;
  const lesson = LESSONS[chapter()];
  return `<section class="quest-card" style="--biome:${colors[lesson.id]}"><div class="quest-number">CHAPTER ${String(lesson.id + 1).padStart(2, '0')} / 07</div><img class="quest-sprite" src="${sprite(lesson.sprite)}" alt="${esc(lesson.name)}, the ${esc(lesson.concept)} guardian" /><p class="quest-label">${esc(lesson.place)}</p><h2>${esc(lesson.title)}</h2><p>${esc(lesson.description)}</p><div class="quest-goal"><span>YOUR MISSION</span><p>${esc(lesson.goal)}</p></div><button class="primary-button" data-travel="${lesson.id}">Meet ${esc(lesson.name)} →</button><p class="quest-footnote">No timer. No wrong turns. Experiment freely.</p></section>`;
}

function teamSlots() {
  return LESSONS.map(lesson => {
    const caught = state.completed.includes(lesson.id);
    return `<button class="creature-slot ${caught ? 'caught' : ''}" data-creature="${lesson.id}" aria-label="${caught ? `Read about ${esc(lesson.name)}` : `Spirit ${lesson.id + 1}, not yet befriended`}"><img src="${sprite(lesson.sprite)}" alt="" /><span class="creature-name">${caught ? esc(lesson.name) : '???'}</span></button>`;
  }).join('');
}

function refreshProgress() {
  world.setProgress(state.completed);
  document.querySelector('#quest-container').innerHTML = questCard();
  document.querySelector('.collection-grid').innerHTML = teamSlots();
  document.querySelector('#team-count').textContent = `${state.completed.length}/7`;
  document.querySelector('.journey-strip').innerHTML = regionButtons();
  document.querySelector('.chapter-count').textContent = `${state.completed.length} OF 7 SPIRITS BEFRIENDED`;
  document.querySelector('.progress-fill').style.width = `${state.completed.length / 7 * 100}%`;
  document.querySelector('[role="progressbar"]').setAttribute('aria-valuenow', state.completed.length);
  document.querySelector('.status-pill').textContent = state.completed.length === 7 ? 'ISLAND RESTORED' : 'ADVENTURE MODE';
  document.querySelector('.world-hint').textContent = state.completed.length === 7 ? 'Every spirit has found a home.' : 'Follow the golden beacon.';
}

function updateNearby(position) {
  let nearest = 0;
  let distance = Infinity;
  for (const node of LOCATIONS) {
    const d = Math.hypot(position.x - node.x, position.y - node.y);
    if (d < distance) { distance = d; nearest = node.id; }
  }
  document.querySelector('.location-tag').textContent = LESSONS[nearest].place.toUpperCase();
  const close = distance <= 36 ? nearest : -1;
  if (close !== lastNearby) {
    lastNearby = close;
    const hint = document.querySelector('.world-hint');
    hint.textContent = close >= 0 && close <= state.completed.length ? `Press E to meet ${LESSONS[close].name}` : state.completed.length === 7 ? 'Every spirit has found a home.' : 'Follow the golden beacon.';
  }
}

function openDialog(kind, html, preserveScroll = false) {
  const scroll = preserveScroll ? dialog.querySelector('.dialog-inner')?.scrollTop ?? 0 : 0;
  if (!dialog.open) returnFocus = document.activeElement;
  dialogKind = kind;
  dialog.className = `game-dialog ${kind}-dialog`;
  dialog.innerHTML = `<div class="dialog-inner">${html}</div>`;
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('.dialog-inner').scrollTop = scroll;
}

function focusDialogSection(selector, focusSelector) {
  const section = dialog.querySelector(selector);
  const owner = dialog.querySelector('.dialog-inner');
  const top = owner.scrollTop + section.getBoundingClientRect().top - owner.getBoundingClientRect().top - dialog.querySelector('.dialog-header').offsetHeight - 12;
  owner.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  dialog.querySelector(focusSelector).focus({ preventScroll: true });
}

function dialogHeader(kicker, title, close = true) {
  return `<header class="dialog-header"><div><p class="dialog-kicker">${esc(kicker)}</p><h2 id="dialog-title">${esc(title)}</h2></div>${close ? '<button class="close-button" data-action="close" aria-label="Close dialog">×</button>' : ''}</header>`;
}

function closeDialog() {
  if (dialogKind === 'guide' && guideReturn) { returnFromGuide(); return; }
  if (dialogKind === 'intro' && !state.started) { state.started = true; persist(); }
  dialog.close();
  dialogKind = '';
  encounter = null;
  guideReturn = null;
  const opener = returnFocus?.isConnected ? returnFocus : document.querySelector('#world');
  opener?.focus({ preventScroll: true });
}

function showIntro() {
  openDialog('intro', `${dialogHeader('AN ORIGINAL PIXEL-ART ADVENTURE', 'Welcome to Bitbound')}<div class="dialog-content"><div class="intro-scene"><canvas id="intro-art" width="480" height="288" aria-label="A traveler and leafy spirit meet in a pixel-art woodland beneath a glowing sky"></canvas></div><p class="eyebrow">SMALL BITS. BIG ADVENTURE.</p><h1 class="intro-title">BITBOUND</h1><p class="intro-lede">An island of tiny tensor spirits is running out of room.<br />Can you make their magic smaller without losing its spark?</p><div class="intro-facts"><span><strong>7</strong> spirits to befriend</span><span><strong>0</strong> math prerequisites</span><span><strong>∞</strong> room to experiment</span></div><button class="primary-button start-button" data-action="start">${state.started ? 'Return to adventure' : 'Start adventure'} →</button><p class="intro-controls">WASD / arrows to wander · E to interact · tap to visit<br />Your adventure saves here. Sound is off until you choose it.</p><p class="intro-boundary">Real quantization math in a small toy world. Not a GPU benchmark.</p></div>`);
  drawStoryScene(document.querySelector('#intro-art'));
}

function drawStoryScene(canvas, ending = false) {
  const ctx = canvas.getContext('2d');
  const rect = (color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
  ctx.imageSmoothingEnabled = false;
  rect('#19382f', 0, 0, 480, 288);
  rect('#244c3e', 0, 76, 480, 45);
  rect('#42634b', 0, 121, 480, 45);
  rect('#759063', 0, 166, 480, 122);
  for (let i = 0; i < 35; i++) {
    const x = (i * 83 + 29) % 480;
    const y = (i * 47 + 13) % 108;
    rect(i % 3 ? '#b6cc97' : '#f5e3ab', x, y, 2, 2);
  }
  for (let ring = 0; ring < 7; ring++) rect(['#547556','#739563','#a7b97b','#d6d594','#f2dfa5','#f5e7bd','#f7eac9'][ring], 336 + ring * 3, 24 + ring * 3, 62 - ring * 6, 62 - ring * 6);
  for (let i = 0; i < 16; i++) {
    const x = i * 36 - 26;
    const height = 55 + (i * 13 % 47);
    rect('#19392f', x + 14, 166 - height, 8, height);
    rect('#315743', x, 152 - height, 34, height - 4);
    rect('#426a4d', x + 5, 144 - height, 24, height - 4);
    rect('#527951', x + 10, 140 - height, 14, 22);
  }
  rect('#345e51', 0, 214, 480, 74);
  rect('#477968', 0, 219, 480, 69);
  for (let i = 0; i < 20; i++) rect('#72a38a', (i * 37) % 480, 226 + (i * 11 % 55), 14 + i % 9, 2);
  rect('#4b6549', 116, 181, 248, 31);
  rect('#728354', 108, 177, 264, 27);
  rect('#9ba969', 116, 174, 248, 20);
  rect('#c5b985', 173, 177, 146, 21);
  rect('#ac9d71', 169, 198, 150, 8);
  for (let i = 0; i < 18; i++) {
    const x = 128 + (i * 29 % 217);
    const y = 184 + (i * 7 % 12);
    rect('#55704a', x, y, 2, 4);
    if (i % 3 === 0) rect(i % 2 ? '#e0a4a0' : '#e9d6a0', x - 1, y - 2, 4, 3);
  }
  if (ending) {
    LESSONS.forEach((lesson, i) => drawSprite(ctx, lesson.sprite, 74 + i * 48, 135 + (i % 2) * 8, 2));
  } else {
    drawSprite(ctx, 'player', 171, 142, 2);
    drawSprite(ctx, 'sprout', 246, 142, 2);
    rect('#304434', 225, 187, 15, 4);
    rect('#dfad63', 229, 173, 7, 14);
    rect('#f4dca1', 230, 169, 5, 11);
    rect('#f7eac9', 231, 167, 3, 6);
  }
  rect('#e6c075', 49, 226, 5, 10);
  rect('#c9dea0', 53, 221, 6, 8);
  rect('#c9dea0', 436, 207, 5, 9);
  rect('#e6c075', 440, 203, 4, 7);
}

function safeConfig(lesson, variant = 'base') {
  const saved = state.loadouts[loadoutKey(lesson.id, variant)] ?? {};
  return Object.fromEntries(lesson.controls.map(control => [control.key,
    control.options.some(option => option.value === saved[control.key]) ? saved[control.key] : lesson.initial[control.key]]));
}

function loadoutKey(id, variant = 'base') {
  return variant === 'base' ? id : `${id}:${variant}`;
}

function openEncounter(id) {
  if (dialog.open && dialogKind !== 'encounter') return;
  if (id > state.completed.length) return toast(`The path opens after you befriend ${LESSONS[id - 1].name}.`);
  const lesson = LESSONS[id];
  encounter = { lesson, variant: 'base', config: safeConfig(lesson), result: null, answer: null, hint: false, previous: null, signal: 0 };
  audio.play('select');
  renderEncounter();
}

function renderEncounter(focusSelector, preserveScroll = false) {
  const anchorTop = preserveScroll && focusSelector ? dialog.querySelector(focusSelector)?.getBoundingClientRect().top : undefined;
  const { lesson, config, variant, result, answer, hint, previous } = encounter;
  const practice = lesson.variants?.find(item => item.id === variant);
  const preview = result ?? evaluateEncounter(lesson.id, config, variant);
  const signal = preview.points[Math.min(encounter.signal, preview.points.length - 1)];
  const passed = result?.passed === true;
  const correct = answer !== null && lesson.question.options[answer]?.correct;
  openDialog('encounter', `${dialogHeader(`${esc(lesson.place)} · CHAPTER ${lesson.id + 1}`, lesson.title)}<div class="dialog-content" style="--biome:${colors[lesson.id]}">
    <div class="encounter-banner"><img class="encounter-sprite" src="${sprite(lesson.sprite)}" alt="${esc(lesson.name)}" /><div class="encounter-title"><span class="type-chip">${esc(lesson.concept)}</span><div class="dialogue-box"><span class="guardian-name">${esc(lesson.name)}</span><p>${esc(result ? result.passed ? lesson.dialogue[1] : result.feedback : lesson.dialogue[0])}</p></div></div></div>
    ${!result ? `<div class="encounter-scene"><canvas id="encounter-art" width="560" height="126" aria-label="${esc(SCENE_CAPTIONS[lesson.id])}"></canvas><p class="scene-caption">${esc(SCENE_CAPTIONS[lesson.id])}</p></div>` : ''}
    <div class="mission-goal"><span>${practice ? 'REPLAY CONTRACT' : 'MISSION'}</span><p>${esc(practice?.goal ?? lesson.goal)}</p>${lesson.id === 0 ? '<p class="control-help">One byte is eight bits. Rebuilding error (MSE) averages squared differences: lower is closer. Meet both the error limit and the byte budget.</p>' : ''}</div>
    ${state.completed.includes(lesson.id) && lesson.variants?.length ? `<nav class="replay-contracts" aria-label="Choose a practice case"><button class="replay-button ${variant === 'base' ? 'selected' : ''}" data-variant="base" aria-pressed="${variant === 'base'}">Original encounter</button>${lesson.variants.map(item => `<button class="replay-button ${variant === item.id ? 'selected' : ''}" data-variant="${esc(item.id)}" aria-pressed="${variant === item.id}">${esc(item.label)}</button>`).join('')}</nav>` : ''}
    ${practice ? `<p class="case-note">${esc(practice.description)} This is another practice case, not a generalization certificate.</p>` : ''}
    <div class="encounter-grid"><section class="tuning-panel" aria-label="Choose your quantization loadout"><h3 class="eyebrow" id="loadout-title" tabindex="-1">YOUR LOADOUT</h3>${lesson.controls.map(control => `<fieldset class="control-group"><legend>${esc(control.label)}</legend><p class="control-help">${esc(control.help)}</p><div class="option-grid">${control.options.map((option, i) => `<button class="option-button ${config[control.key] === option.value ? 'selected' : ''}" data-control="${esc(control.key)}" data-option="${i}" aria-pressed="${config[control.key] === option.value}"><span>${esc(option.label)}</span><small>${esc(option.detail)}</small></button>`).join('')}</div></fieldset>`).join('')}<button class="primary-button run-button" data-action="cast">Cast Quantize →</button><button class="hint-button" data-action="hint" aria-expanded="${hint}">${hint ? 'Hide field hint' : 'Need a field hint?'}</button>${hint ? `<div class="hint-box">${esc(lesson.hint)}</div>` : ''}<p class="control-help">Experiment as often as you like. Changing a setting clears the old result.</p></section>
    <section class="experiment-panel" aria-label="Numerical experiment"><div class="experiment-screen"><div class="chart-heading"><h3>${esc(preview.chartLabel)}</h3><span>${result ? 'TESTED LOADOUT' : 'LIVE PREVIEW'}</span></div><div class="chart-legend"><span>□ Original</span><span>■ Reconstructed</span><span class="clipping-key">■ Clipped</span></div><div class="quant-chart"><canvas id="quant-chart" width="560" height="174" aria-label="Original and reconstructed values. Exact values and errors are available in the numerical trace below."></canvas></div>${result ? `<div class="metrics-grid">${result.checks.map(check => `<div class="metric ${check.ok ? 'good' : 'bad'}"><span class="metric-label">${check.ok ? '✓' : '◇'} ${esc(check.label)}</span><strong class="metric-value">${esc(check.value)}</strong><span class="metric-target">Target: ${esc(check.target)}</span></div>`).join('')}</div>` : '<div class="empty-experiment"><strong>What happens when you change the loadout?</strong><p>The preview is live. Cast Quantize to test your choices against the mission.</p></div>'}
    <div class="signal-inspector"><label for="signal-choice">Inspect a signal <select id="signal-choice">${preview.points.map((_, i) => `<option value="${i}" ${encounter.signal === i ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label><p><strong>${fmt(signal.value)}</strong> original → <strong>${signal.code}</strong> integer code → <strong>${fmt(signal.reconstructed)}</strong> rebuilt <span>(error ${fmt(signal.error)}${signal.clipped ? '; clipped' : ''})</span></p>${lesson.id === 0 ? '<p>A tensor is a pack of numbers. We store short codes, then use a ruler (the scale) to read them back.</p>' : ''}</div>
    <div class="storage-caption">Stored tensor: <strong>${preview.storage.total} B</strong> = ${preview.storage.payload} B payload + ${preview.storage.metadata} B scale/zero-point metadata</div><div class="storage-bar" aria-hidden="true"><span class="storage-segment" style="width:${preview.storage.payload / preview.storage.total * 100}%"></span><span class="storage-segment metadata" style="width:${preview.storage.metadata / preview.storage.total * 100}%"></span></div><p class="control-help">Toy packed format. Not total device memory or a speed measurement.</p>
    ${previous ? `<details class="math-details"><summary>Compare your last cast</summary><p>${esc(previous.loadout)}</p><ul>${previous.checks.map(check => `<li>${esc(check.label)}: ${esc(check.value)} ${check.ok ? '✓' : '◇'}</li>`).join('')}</ul></details>` : ''}
    <details class="math-details"><summary>Open numerical trace & equations</summary><pre>${esc(preview.math)}\n${preview.params.map((p, i) => `Group ${i + 1}: scale=${fmt(p.scale)}, zero=${p.zero}, codes ${p.qmin}…${p.qmax}`).join('\n')}</pre><div class="trace-scroll"><table><caption>Actual quantize/dequantize values</caption><thead><tr><th>Input</th><th>Code</th><th>Rebuilt</th><th>Error</th><th>Group</th></tr></thead><tbody>${preview.points.map(point => `<tr><td>${fmt(point.value)}</td><td>${point.code}</td><td>${fmt(point.reconstructed)}</td><td>${fmt(point.error)}${point.clipped ? ' clipped' : ''}</td><td>${(point.group ?? 0) + 1}</td></tr>`).join('')}</tbody></table></div>${preview.extras?.length ? `<ul class="extras">${preview.extras.map(extra => `<li><strong>${esc(extra.label)}:</strong> ${esc(extra.value)}</li>`).join('')}</ul>` : ''}</details></div></section></div>
    ${result ? `<section class="result-feedback ${passed ? 'success' : 'retry'}" role="status" aria-live="polite"><div class="cast-outcome"><img src="${sprite(lesson.sprite)}" alt="" /><div><span class="guardian-name">${esc(lesson.name)}</span><h3 id="result-title" tabindex="-1">${passed ? esc(chapterOutcomes[lesson.id]) : `${esc(lesson.name)} has a new clue.`}</h3></div></div>${passed ? '<button class="primary-button field-step" data-action="field-check">Finish the field check ↓</button>' : '<button class="secondary-button field-step" data-action="adjust-loadout">Adjust your loadout ↑</button>'}<canvas id="encounter-art" class="outcome-scene" width="560" height="126" aria-label="${esc(SCENE_CAPTIONS[lesson.id])}"></canvas><p>${esc(result.feedback)}</p><p class="result-insight">${esc(result.insight)}</p></section>` : ''}
    ${passed ? `<section class="transfer-panel"><p class="eyebrow">ONE LAST FIELD CHECK · APPLY WHAT YOU FOUND</p><h3 class="transfer-title" tabindex="-1">${esc(lesson.question.prompt)}</h3><div class="answer-grid">${lesson.question.options.map((option, i) => `<button class="answer-button ${answer === i ? 'selected' : ''}" data-answer="${i}" aria-pressed="${answer === i}">${esc(option.label)}</button>`).join('')}</div>${answer !== null ? `<p class="answer-feedback ${correct ? 'success' : 'retry'}" role="status" tabindex="-1">${correct ? '✓' : '◇'} ${esc(lesson.question.options[answer].explanation)}</p>${!correct ? '<button class="secondary-button" data-action="field-check">Try another answer ↑</button>' : ''}` : ''}${correct ? `<button class="primary-button capture-button" data-action="capture">${state.completed.includes(lesson.id) ? 'Reaffirm your bond' : `Befriend ${esc(lesson.name)}`} →</button>` : ''}</section>` : ''}
    <div class="encounter-footnote"><span>${state.completed.includes(lesson.id) ? 'REPLAY · EXPERIMENT WITH A DIFFERENT LOADOUT' : 'NO TIMER · EVERY EXPERIMENT IS A CLUE'}</span><button class="research-link" data-guide="${esc(lesson.sourceIds[0])}">Read the field notes ↗</button></div>
    </div>`, preserveScroll);
  drawQuantizationChart(document.querySelector('#quant-chart'), preview);
  drawEncounterScene(document.querySelector('#encounter-art'), lesson, preview, config, Boolean(result));
  const target = focusSelector ? dialog.querySelector(focusSelector) : null;
  if (target) {
    if (anchorTop !== undefined) dialog.querySelector('.dialog-inner').scrollTop += target.getBoundingClientRect().top - anchorTop;
    target.focus({ preventScroll: preserveScroll });
  }
}

function drawQuantizationChart(canvas, result) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#10231e'; ctx.fillRect(0, 0, width, height);
  const points = result.points;
  if (!points.length) return;
  const min = Math.min(0, ...points.flatMap(p => [p.value, p.reconstructed]));
  const max = Math.max(0, ...points.flatMap(p => [p.value, p.reconstructed]));
  const span = max - min || 1;
  const y = value => 20 + (max - value) / span * (height - 48);
  ctx.font = '11px monospace';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const value = max - span * i / 4;
    const yy = Math.round(y(value));
    ctx.fillStyle = '#294238'; ctx.fillRect(42, yy, width - 55, 1);
    ctx.fillStyle = '#a0b6a0'; ctx.fillText(fmt(value), 4, yy);
  }
  const step = (width - 66) / points.length;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const x = Math.round(48 + step * (i + 0.5));
    const originalY = Math.round(y(p.value));
    const rebuiltY = Math.round(y(p.reconstructed));
    ctx.fillStyle = p.clipped ? '#d99593' : '#dfbc73';
    ctx.fillRect(x - 1, Math.min(originalY, rebuiltY), 2, Math.max(2, Math.abs(originalY - rebuiltY)));
    ctx.strokeStyle = '#f7eac9'; ctx.lineWidth = 1; ctx.strokeRect(x - 4, originalY - 4, 8, 8);
    ctx.fillStyle = p.clipped ? '#d99593' : '#b6db8c'; ctx.fillRect(x - 2, rebuiltY - 2, 5, 5);
    if (points.length <= 32 && (i % Math.max(1, Math.ceil(points.length / 16)) === 0)) {
      ctx.fillStyle = '#8ca78f'; ctx.fillText(String(i + 1), x - 3, height - 11);
    }
  }
}

function cast() {
  if (!encounter) return;
  if (encounter.result) encounter.previous = {
    loadout: encounter.lesson.controls.map(c => `${c.label}: ${c.options.find(o => o.value === encounter.config[c.key]).label}`).join(' · '),
    checks: encounter.result.checks,
  };
  encounter.result = evaluateEncounter(encounter.lesson.id, encounter.config, encounter.variant);
  encounter.answer = null;
  state.experiments[encounter.lesson.id]++;
  state.loadouts[loadoutKey(encounter.lesson.id, encounter.variant)] = { ...encounter.config };
  persist();
  audio.play(encounter.result.passed ? 'win' : 'retry');
  renderEncounter();
  focusDialogSection('.result-feedback', '#result-title');
}

function capture() {
  const current = encounter;
  if (!current?.result?.passed || !current.lesson.question.options[current.answer]?.correct) return;
  const { lesson } = current;
  const first = !state.completed.includes(lesson.id);
  if (first) {
    if (lesson.id !== state.completed.length) return;
    state.completed.push(lesson.id);
  }
  state.loadouts[loadoutKey(lesson.id, current.variant)] = { ...current.config };
  persist();
  refreshProgress();
  audio.play('capture');
  openDialog('capture', `${dialogHeader(first ? 'A NEW FRIEND JOINS YOUR JOURNEY' : 'YOUR BOND GROWS STRONGER', first ? `${lesson.name} joined your team!` : `${lesson.name}, a bond reaffirmed!`)}<div class="dialog-content capture-screen" style="--biome:${colors[lesson.id]}"><div class="capture-art"><div class="capture-rays"></div><img src="${sprite(lesson.sprite)}" alt="${esc(lesson.name)}, ${first ? 'your new companion' : 'your trusted companion'}" /></div><h2 class="capture-title">${esc(lesson.name)} + you</h2><span class="reward-badge">${esc(lesson.concept)} BADGE</span><p class="takeaway">${esc(lesson.takeaway)}</p><p>${first ? lesson.id === 6 ? 'Every spirit is safe. The Tensor Isles have their spark back.' : `A new path opens: ${esc(LESSONS[lesson.id + 1].place)}.` : 'There is always another loadout to explore.'}</p><button class="primary-button continue-button" data-action="continue" data-finished="${lesson.id === 6 && state.completed.length === 7}">${lesson.id === 6 && state.completed.length === 7 ? 'See the island restored' : 'Back to the adventure'} →</button><button class="research-link" data-guide="${esc(lesson.sourceIds[0])}">Keep the field note ↗</button></div>`);
}

function showGuide(id) {
  const entry = GUIDE.find(item => item.id === id) ?? GUIDE[0];
  const changingTopic = dialog.open && dialogKind === 'guide';
  const navScroll = changingTopic ? dialog.querySelector('.guide-nav').scrollTop : 0;
  if (!changingTopic) guideReturn = dialog.open ? {
    kind: dialogKind,
    html: dialog.querySelector('.dialog-inner').innerHTML,
    scroll: dialog.querySelector('.dialog-inner').scrollTop,
    topic: entry.id,
  } : null;
  openDialog('guide', `${dialogHeader('RESEARCH-BACKED FIELD NOTES', 'The Quantization Field Guide')}<div class="dialog-content"><p class="guide-intro">Start with the intuition. Open the equations. Follow the original research.</p><div class="guide-layout"><nav class="guide-nav" aria-label="Field guide topics">${GUIDE.map(item => `<button class="${item.id === entry.id ? 'active' : ''}" data-guide="${esc(item.id)}" ${item.id === entry.id ? 'aria-current="page"' : ''}>${esc(item.title)}</button>`).join('')}</nav><article class="guide-article"><span class="guide-tag">${esc(entry.tag)}</span><h2>${esc(entry.title)}</h2><p class="guide-summary">${esc(entry.summary)}</p>${entry.body.map(paragraph => `<p>${esc(paragraph)}</p>`).join('')}${entry.formula ? `<pre class="formula">${esc(entry.formula)}</pre>` : ''}<h3>Primary sources</h3><ul class="source-list">${entry.sources.map(source => `<li><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.label)} ↗</a></li>`).join('')}</ul></article></div><p class="guide-boundary">The island is a teaching model. Successful toy experiments are not evidence that a real LLM meets an accuracy or latency target.</p></div>`, changingTopic);
  if (guideReturn) {
    const back = document.createElement('button');
    back.className = 'secondary-button guide-back';
    back.dataset.action = 'guide-back';
    const destination = { encounter: 'your experiment', collection: 'your journal', ending: 'your ending', capture: 'your companion' };
    back.textContent = `← Back to ${destination[guideReturn.kind] ?? 'the adventure'}`;
    document.querySelector('.guide-intro').after(back);
  }
  dialog.querySelector('.guide-nav').scrollTop = navScroll;
  dialog.querySelector('.guide-nav [aria-current="page"]').focus({ preventScroll: true });
}

function returnFromGuide() {
  const previous = guideReturn;
  if (!previous) return;
  guideReturn = null;
  openDialog(previous.kind, previous.html);
  if (previous.kind === 'encounter' && encounter) {
    const preview = encounter.result ?? evaluateEncounter(encounter.lesson.id, encounter.config, encounter.variant);
    drawQuantizationChart(dialog.querySelector('#quant-chart'), preview);
    drawEncounterScene(dialog.querySelector('#encounter-art'), encounter.lesson, preview, encounter.config, Boolean(encounter.result));
  } else if (previous.kind === 'ending') drawStoryScene(dialog.querySelector('#ending-art'), true);
  dialog.querySelector('.dialog-inner').scrollTop = previous.scroll;
  dialog.querySelector(`[data-guide="${previous.topic}"]`)?.focus({ preventScroll: true });
}

function showTeam(id) {
  const lesson = LESSONS[id];
  if (lesson && !state.completed.includes(id)) return toast(`This spirit is still waiting in ${lesson.place}. Follow your current quest to meet it.`);
  const content = lesson ? `<div class="collection-detail"><img class="collection-art" src="${sprite(lesson.sprite)}" alt="${esc(lesson.name)}" /><div class="collection-lore"><span class="badge-label">${esc(lesson.concept)} BADGE</span><h2>${esc(lesson.name)}</h2><p>${esc(lesson.place)}</p><p>${esc(lesson.takeaway)}</p><p>${state.experiments[id]} numerical experiment${state.experiments[id] === 1 ? '' : 's'} explored.</p><button class="primary-button" data-replay="${id}">Visit for another experiment →</button><button class="secondary-button" data-guide="${esc(lesson.sourceIds[0])}">Read the research</button></div></div>` : `<p>Every spirit keeps a lesson. Your team grows when you solve an experiment and apply what you discovered.</p><div class="collection-grid journal-grid">${teamSlots()}</div>${state.completed.length ? `<p>${state.completed.length} bonds made. Select a companion to revisit its lesson.</p>` : '<p>Your first friend is waiting in Bitleaf Meadow. Meet Nib to begin.</p><button class="primary-button" data-replay="0">Meet Nib →</button>'}`;
  openDialog('collection', `${dialogHeader('YOUR COMPANIONS · YOUR DISCOVERIES', 'The Spirit Journal')}<div class="dialog-content">${content}</div>`);
}

function showEnding() {
  if (state.completed.length !== 7) return;
  openDialog('ending', `${dialogHeader('THE TENSOR ISLES ARE RESTORED', 'A precision ranger, at last.')}<div class="dialog-content"><div class="ending-scene"><canvas id="ending-art" width="480" height="288" aria-label="All seven original spirits gather on a restored island"></canvas></div><h2 class="ending-title">Small bits.<br />A brighter world.</h2><p>You did not save the island by choosing the smallest number.<br />You explored <strong>where precision matters.</strong></p><div class="ending-stats"><span><strong>7</strong> spirits befriended</span><span><strong>${state.experiments.reduce((a, b) => a + b, 0)}</strong> experiments explored</span><span><strong>1</strong> precision ranger</span></div><div class="ending-creatures">${LESSONS.map(l => `<img src="${sprite(l.sprite)}" alt="${esc(l.name)}" />`).join('')}</div><p class="ending-note">Your real-world quest: compare model quality on held-out tasks, account for weights + activations + KV cache, and measure latency on your target device. A toy-world win is a beginning, not a deployment certificate.</p><div class="ending-actions"><button class="primary-button" data-action="close">Keep exploring →</button><button class="secondary-button" data-guide="deployment">Plan a real deployment</button></div></div>`);
  drawStoryScene(document.querySelector('#ending-art'), true);
}

function showSettings() {
  openDialog('settings', `${dialogHeader('MAKE YOURSELF AT HOME', 'Adventure settings')}<div class="dialog-content settings-panel"><div class="setting-row"><div><h3>Original chip sounds</h3><p>Quiet synthesized tones. No audio downloads.</p></div><button class="secondary-button" data-action="sound" aria-pressed="${state.sound}">${state.sound ? 'Sound on' : 'Sound off'}</button></div><div class="setting-row"><div><h3>Motion</h3><p>The game respects your device’s reduced-motion setting. No timers or flashing effects.</p></div></div><div class="setting-row"><div><h3>Your save</h3><p>${storageAvailable ? 'Stored only in this browser on this device. No account, tracking or upload.' : 'This browser is blocking local storage. Progress is available for this session only.'}</p></div></div><div class="setting-row"><button class="secondary-button" data-action="intro">Replay the introduction</button><button class="secondary-button danger-button" data-action="reset-question">Start a new adventure</button></div></div>`);
}

function toggleSound() {
  state.sound = !state.sound;
  audio.setEnabled(state.sound);
  persist();
  document.querySelectorAll('[data-action="sound"]').forEach(button => { button.textContent = state.sound ? 'Sound on' : 'Sound off'; button.setAttribute('aria-pressed', state.sound); });
}

function onDialogClick(event) {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.variant !== undefined && encounter && state.completed.includes(encounter.lesson.id)) {
    const variant = target.dataset.variant;
    if (variant !== 'base' && !encounter.lesson.variants?.some(item => item.id === variant)) return;
    encounter.variant = variant;
    encounter.config = safeConfig(encounter.lesson, variant);
    encounter.result = null;
    encounter.answer = null;
    encounter.previous = null;
    encounter.signal = 0;
    renderEncounter(`[data-variant="${variant}"]`, true);
    return;
  }
  if (target.dataset.control) {
    const control = encounter.lesson.controls.find(c => c.key === target.dataset.control);
    const option = control.options[Number(target.dataset.option)];
    if (encounter.result) encounter.previous = { loadout: encounter.lesson.controls.map(c => `${c.label}: ${c.options.find(o => o.value === encounter.config[c.key]).label}`).join(' · '), checks: encounter.result.checks };
    encounter.config[control.key] = option.value;
    state.loadouts[loadoutKey(encounter.lesson.id, encounter.variant)] = { ...encounter.config };
    persist();
    encounter.result = null;
    encounter.answer = null;
    audio.play('select');
    renderEncounter(`[data-control="${control.key}"][data-option="${target.dataset.option}"]`, true);
    return;
  }
  if (target.dataset.answer !== undefined) {
    encounter.answer = Number(target.dataset.answer);
    audio.play(encounter.lesson.question.options[encounter.answer].correct ? 'select' : 'retry');
    renderEncounter();
    focusDialogSection('.answer-feedback', '.answer-feedback');
    return;
  }
  if (target.dataset.guide) { showGuide(target.dataset.guide); return; }
  if (target.dataset.creature !== undefined) { showTeam(Number(target.dataset.creature)); return; }
  if (target.dataset.replay !== undefined) {
    const id = Number(target.dataset.replay);
    closeDialog();
    world.travel(id);
    return;
  }
  switch (target.dataset.action) {
    case 'close': closeDialog(); break;
    case 'start': state.started = true; persist(); closeDialog(); document.querySelector('#world').focus(); toast(state.completed.length === 7 ? 'Your island is restored. Revisit a spirit or try a replay contract.' : state.completed.length ? `Welcome back. ${LESSONS[state.completed.length].name} is waiting along the next path.` : 'Welcome, traveler. Meet Nib in the meadow, or follow the golden beacon.'); break;
    case 'cast': cast(); break;
    case 'hint': encounter.hint = !encounter.hint; renderEncounter('[data-action="hint"]', true); break;
    case 'field-check': focusDialogSection('.transfer-panel', '.transfer-title'); break;
    case 'adjust-loadout': focusDialogSection('.tuning-panel', '#loadout-title'); break;
    case 'capture': capture(); break;
    case 'continue': { const finished = target.dataset.finished === 'true'; closeDialog(); if (finished) showEnding(); break; }
    case 'sound': toggleSound(); break;
    case 'intro': showIntro(); break;
    case 'guide-back': returnFromGuide(); break;
    case 'reset-question': openDialog('settings', `${dialogHeader('YOUR CURRENT SAVE WILL BE REPLACED', 'Start fresh?')}<div class="dialog-content"><p>This removes your seven-spirit adventure from this browser. It does not change anything on GitHub.</p><div class="ending-actions"><button class="primary-button" data-action="close">Keep my adventure</button><button class="secondary-button danger-button" data-action="reset">Start fresh</button></div></div>`); break;
    case 'reset': closeDialog(); clearTimeout(saveTimer); state = newAdventure(); audio.setEnabled(false); persist(); renderShell(); showIntro(); break;
  }
}

// One delegated listener survives shell refreshes; native dialogs trap focus.
document.querySelector('#app').addEventListener('click', event => {
  if (event.composedPath().includes(dialog)) return;
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.dir) {
    const directions = { up: [0, -1], left: [-1, 0], down: [0, 1], right: [1, 0] };
    world.move(...directions[target.dataset.dir]); audio.play('step'); return;
  }
  if (target.dataset.travel !== undefined) { world.travel(Number(target.dataset.travel)); return; }
  if (target.dataset.creature !== undefined) { showTeam(Number(target.dataset.creature)); return; }
  if (target.dataset.guide) { showGuide(target.dataset.guide); return; }
  switch (target.dataset.action) {
    case 'guide': showGuide(); break;
    case 'sound': toggleSound(); break;
    case 'settings': showSettings(); break;
    case 'team': showTeam(); break;
    case 'ending': showEnding(); break;
    case 'interact': if (!world.interact()) toast('Move closer to a spirit, or use a location button below the island.'); break;
  }
});

window.addEventListener('keydown', event => {
  if (dialog.open || event.ctrlKey || event.metaKey || event.altKey) return;
  const active = document.activeElement;
  if (active?.matches('input, textarea, select, button, a, [contenteditable="true"]')) return;
  const key = event.key.toLowerCase();
  const moves = { arrowup: [0, -1], w: [0, -1], arrowleft: [-1, 0], a: [-1, 0], arrowdown: [0, 1], s: [0, 1], arrowright: [1, 0], d: [1, 0] };
  if (moves[key]) { event.preventDefault(); world.move(...moves[key]); audio.play('step'); }
  else if (key === 'e' || key === 'enter') { event.preventDefault(); if (!world.interact()) toast('A spirit is waiting nearby. Tap its landmark or choose a location below.'); }
});
window.addEventListener('pagehide', () => { clearTimeout(saveTimer); persist(); });
renderShell();
if (!state.started) showIntro();
