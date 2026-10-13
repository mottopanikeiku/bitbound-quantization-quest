import "./styles.css";
import { IslandWorld } from "./world.js";
import { GameAudio } from "./audio.js";
import { Battle, COMMANDS, FOES, RULER_NAMES } from "./battle.js";
import {
  drawBattle,
  drawDialogue,
  drawEnding,
  drawPause,
  drawTitle,
  drawWorldHud,
  nextObjective,
} from "./battle-view.js";
import { loadAdventure, newAdventure, saveAdventure } from "./save.js";
import { feedbackSummary, feedbackCaption } from "./cast-feedback.js";

let state = loadAdventure();
let mode = "title";
let returnMode = "world";
let battle = null;
let dialogue = "";
let notice = "";
let noticeUntil = 0;
let pauseChoice = 0;
let resetQuestion = false;
let saveTimer;
let lastFrame = 0;
let lastReadout = "";
let statusClock = 0;
let musicClock = 0;
let desktopLayout = "";
const held = new Set();
const audio = new GameAudio(false);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const phoneMedia = matchMedia("(max-width:700px)");
let phoneLayout = "";
const directions = {
  w: [0, -1],
  arrowup: [0, -1],
  a: [-1, 0],
  arrowleft: [-1, 0],
  s: [0, 1],
  arrowdown: [0, 1],
  d: [1, 0],
  arrowright: [1, 0],
};

document.querySelector("#app").innerHTML = `
  <main class="rpg-shell">
    <header class="rpg-header"><a class="brand" href="./"><img src="./favicon.svg" alt=""/><span>BITBOUND<small>THE STATIC ISLE</small></span></a><div class="header-actions"><button id="music" aria-pressed="${state.music}"><span class="music-led" aria-hidden="true"></span><span id="music-label">Music ${state.music ? "on" : "off"}</span><kbd>M</kbd></button><button id="fullscreen" aria-label="Toggle full screen">Full screen <kbd>F</kbd></button></div></header>
    <section class="handheld" aria-label="Bitbound role-playing game"><div class="console-label"><span>PRECISION POCKET</span><span class="power-label"><i></i> POWER</span></div>
      <div id="phone-hud" class="phone-hud" hidden><span id="phone-location"></span><span id="phone-health"></span><span id="phone-objective"></span><span id="phone-charge"></span></div>
      <div class="game-screen" id="screen"><canvas id="game" width="480" height="288" tabindex="0" role="application" aria-label="Bitbound. Press Enter to start with music. WASD moves; Shift runs; E interacts; M mutes."></canvas><button id="start" class="title-hitbox" aria-label="Begin adventure with music"><span class="sr-only">Begin adventure</span></button><div id="command-buttons" class="command-overlay" hidden></div></div>
      <div id="phone-panel" class="phone-panel" hidden><p id="phone-loadout" hidden></p><p id="phone-message"></p><p id="phone-cast" hidden></p><div id="phone-options" class="phone-options"></div></div>
      <div class="console-footer"><span class="control-legend"><kbd>WASD</kbd> move <kbd>SHIFT</kbd> run <kbd>E</kbd> interact <kbd>ESC</kbd> pause</span><span id="save-light">LOCAL SAVE</span></div>
    </section>
    <div class="touch-controls" aria-label="Gamepad controls"><div class="dpad"><button data-dir="w" aria-label="Up">↑</button><button data-dir="a" aria-label="Left">←</button><span aria-hidden="true"></span><button data-dir="d" aria-label="Right">→</button><button data-dir="s" aria-label="Down">↓</button></div><div class="gamepad-actions"><button id="touch-b" aria-label="Back or pause">B</button><button id="touch-a" aria-label="Interact or confirm">A</button><button id="touch-q" aria-label="Cycle spell bits">BITS</button></div></div>
    <p class="game-caption">Explore. Battle the static. Make seven very unusual friends.</p>
    <footer class="rpg-footer"><span>Original art & music. Real toy quantization.</span><a href="https://github.com/mottopanikeiku/bitbound-quantization-quest/blob/main/RESEARCH.md" target="_blank" rel="noopener noreferrer">Research & source ↗</a></footer>
    <p id="readout" class="sr-only" role="status" aria-live="polite"></p>
  </main>`;
const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
const startButton = document.querySelector("#start");
const commands = document.querySelector("#command-buttons");
const musicButton = document.querySelector("#music");
const musicData = new Uint8Array(256);

function persist() {
  clearTimeout(saveTimer);
  saveTimer = null;
  document.querySelector("#save-light").textContent = saveAdventure(state)
    ? "LOCAL SAVE"
    : "SESSION ONLY";
}
function announce(message, seconds = 4) {
  notice = message;
  noticeUntil = performance.now() + seconds * 1000;
}
function clearInput() {
  held.clear();
  document
    .querySelectorAll("[data-dir]")
    .forEach((button) => button.classList.remove("held"));
}
function focusGame() {
  canvas.focus({ preventScroll: true });
}
function syncControls() {
  startButton.hidden = mode !== "title";
  startButton.setAttribute(
    "aria-label",
    `${state.started ? "Continue" : "Begin"} adventure ${state.music ? "with music" : "with music muted"}`,
  );
  const layout =
    mode === "battle" &&
    !phoneMedia.matches &&
    ["menu", "tune"].includes(battle.phase)
      ? battle.phase
      : "";
  commands.hidden = !layout;
  if (desktopLayout !== layout) {
    commands.innerHTML =
      layout === "menu"
        ? COMMANDS.map(
            (name, index) =>
              `<button data-command="${index}" style="left:${((19 + (index % 2) * 155) / 480) * 100}%;top:${((202 + Math.floor(index / 2) * 25) / 288) * 100}%;" aria-label="${name}"><span class="sr-only">${name}</span></button>`,
          ).join("")
        : layout === "tune"
          ? tuneLabels()
              .map(
                (label, index) =>
                  `<button data-tune-row="${index}" style="left:3.96%;top:${((194 + index * 20) / 288) * 100}%;width:91.67%;height:6.25%;" aria-label="${label}. Activate to cycle."><span class="sr-only">${label}</span></button>`,
              )
              .join("")
          : "";
    desktopLayout = layout;
  }
  updateDesktopTuneLabels();
  updatePhoneUi();
}

function tuneLabels() {
  const range = { native: "Standard", full: "Scanned", trim: "Trimmed" }[
    battle.gear.range
  ];
  return [
    `Weights: ${battle.gear.weightBits} bit`,
    `Samples: ${battle.gear.activationBits} bit`,
    `Ruler: ${RULER_NAMES[battle.gear.ruler]}`,
    `Range: ${range}`,
  ];
}
function updateDesktopTuneLabels() {
  if (desktopLayout !== "tune") return;
  const labels = tuneLabels();
  for (const button of commands.querySelectorAll("[data-tune-row]")) {
    button.setAttribute(
      "aria-label",
      `${labels[Number(button.dataset.tuneRow)]}. Activate to cycle; arrows change.`,
    );
  }
}

function updatePhoneUi() {
  const hud = document.querySelector("#phone-hud");
  const panel = document.querySelector("#phone-panel");
  const phone = phoneMedia.matches;
  hud.hidden = !phone || mode === "title";
  panel.hidden = !phone;
  if (!phone) return;
  const inBattle =
    mode === "battle" || (mode === "paused" && returnMode === "battle");
  const hero = inBattle ? battle.hero : state.hero;
  document.querySelector("#phone-location").textContent = inBattle
    ? battle.boss
      ? battle.foe.friend
      : "Staticling"
    : world.getZone().name;
  document.querySelector("#phone-health").textContent =
    `HP ${hero.hp}/${hero.maxHp}`;
  document.querySelector("#phone-objective").textContent = inBattle
    ? `FOE ${battle.hp}/${battle.maxHp}`
    : nextObjective(state, world.getPosition());
  document.querySelector("#phone-charge").textContent = `${hero.bytes}B mana`;
  panel.classList.toggle("in-battle", inBattle);
  panel.dataset.phase = inBattle ? battle.phase : mode;
  const loadout = document.querySelector("#phone-loadout");
  loadout.hidden = !inBattle;
  if (inBattle)
    loadout.textContent = `W${battle.gear.weightBits}/A${battle.gear.activationBits} · Cast ${battle.prepared.bytes}B · Snacks ${hero.snacks}`;
  const castInfo = document.querySelector("#phone-cast");
  castInfo.hidden = !inBattle || mode === "paused" || battle.phase === "aim";
  if (inBattle) {
    const preview = battle.phase === "tune";
    const packet = feedbackSummary(battle);
    const caption = feedbackCaption(battle, { preview });
    if (preview) {
      const grid = packet.activation
        .map(
          (p) =>
            `0=code ${p.zeroCode} [${Number(p.min.toFixed(2))},${Number(p.max.toFixed(2))}]`,
        )
        .join(" / ");
      castInfo.textContent = `${packet.payloadBytes}B payload + ${packet.metadataBytes}B rulers. ${grid}. ${caption}`;
    } else castInfo.textContent = caption;
    if (!castInfo.textContent) castInfo.hidden = true;
  }
  let message = "";
  let options = "";
  const key = `${mode}:${battle?.phase}:${resetQuestion}`;
  if (mode === "title")
    message = `${state.music ? "Start with original music." : "Music is muted."} A or Enter to begin.`;
  else if (mode === "world")
    message = (
      noticeUntil > performance.now()
        ? notice
        : world.getPrompt() || "Hold D-pad to walk. A interacts. B pauses."
    ).replace(/^E:/, "A:");
  else if (mode === "dialogue") {
    message = dialogue;
    options = "<button data-phone-confirm>Continue · A</button>";
  } else if (mode === "ending") {
    message = "Seven friends. The island is alive again!";
    options = "<button data-phone-confirm>Keep exploring · A</button>";
  } else if (mode === "paused") {
    message = resetQuestion
      ? "Start a new game? This replaces your RPG save."
      : "Paused · D-pad chooses, A confirms, B returns.";
    const labels = resetQuestion
      ? ["Keep adventure", "Reset RPG save"]
      : ["Resume", state.music ? "Music on" : "Music off", "New game"];
    options = labels
      .map(
        (label, index) =>
          `<button data-phone-pause="${index}">${label}</button>`,
      )
      .join("");
  } else if (mode === "battle") {
    message =
      battle.phase === "aim"
        ? `Pulse ${battle.shots.length + 1}/3. Press A on the gold target. Green is the rebuilt signal.`
        : battle.phase === "tune"
          ? "D-pad chooses / changes. A cycles. B returns."
          : battle.message;
    if (battle.phase === "menu")
      options = COMMANDS.map(
        (name, index) =>
          `<button data-phone-command="${index}">${name}</button>`,
      ).join("");
    else if (battle.phase === "tune")
      options =
        Array.from(
          { length: 4 },
          (_, index) => `<button data-phone-tune="${index}"></button>`,
        ).join("") + "<button data-phone-back>Back · B</button>";
    else if (battle.phase === "aim")
      options = "<button data-phone-confirm>A · Stop pulse</button>";
    else if (battle.phase === "result")
      options = "<button data-phone-confirm>Continue · A</button>";
  }
  document.querySelector("#phone-message").textContent = message;
  if (phoneLayout !== key) {
    document.querySelector("#phone-options").innerHTML = options;
    phoneLayout = key;
  }
  for (const button of document.querySelectorAll("[data-phone-command]"))
    button.classList.toggle(
      "selected",
      Number(button.dataset.phoneCommand) === battle?.menu,
    );
  for (const button of document.querySelectorAll("[data-phone-pause]")) {
    button.classList.toggle(
      "selected",
      Number(button.dataset.phonePause) === pauseChoice,
    );
    if (Number(button.dataset.phonePause) === 1 && !resetQuestion)
      button.textContent = state.music ? "Music on" : "Music off";
  }
  if (mode === "battle" && battle.phase === "tune") {
    const labels = tuneLabels();
    for (const button of document.querySelectorAll("[data-phone-tune]")) {
      const row = Number(button.dataset.phoneTune);
      button.textContent = labels[row];
      button.classList.toggle("selected", row === battle.tuneRow);
    }
  }
}
const world = new IslandWorld(canvas, {
  onEncounter: (encounter) => {
    if (mode !== "world") return;
    clearInput();
    battle = new Battle({
      ...encounter,
      hero: state.hero,
      gear: state.gear,
      completed: state.completed,
    });
    mode = "battle";
    audio.setScene(encounter.boss ? "boss" : "battle");
    audio.play("select");
    syncControls();
    focusGame();
  },
  onInteract: (interaction) => {
    if (mode !== "world") return;
    clearInput();
    if (interaction.kind === "camp") {
      state.hero.hp = state.hero.maxHp;
      state.hero.bytes = state.hero.maxBytes;
      state.hero.snacks = Math.max(3, state.hero.snacks);
      dialogue =
        "Campfire nap! HP and byte charge restored. Three snacks packed for the road.";
      audio.play("heal");
    } else if (interaction.kind === "pickup") {
      if (state.collected.includes(interaction.id)) return;
      state.collected.push(interaction.id);
      state.hero.snacks = Math.min(9, state.hero.snacks + 1);
      state.hero.bytes = Math.min(state.hero.maxBytes, state.hero.bytes + 32);
      world.setCollected(state.collected);
      dialogue = "Found a picnic cache! +1 snack and +32 byte charge.";
      audio.play("capture");
    } else
      dialogue =
        interaction.text || "The island feels a little brighter with you here.";
    mode = "dialogue";
    persist();
    syncControls();
    focusGame();
  },
  onMove: (position) => {
    state.position = position;
    if (!saveTimer)
      saveTimer = setTimeout(() => {
        saveTimer = null;
        persist();
      }, 650);
  },
});
world.setProgress(state.completed);
world.setCollected(state.collected);
if (state.position) world.setPosition(state.position);
if (state.hero.hp === 0) {
  state.hero.hp = state.hero.maxHp;
  state.hero.bytes = 256;
  world.setPosition({ x: 62, y: 216 });
}

function begin() {
  mode = "world";
  state.started = true;
  clearInput();
  audio.setScene("overworld");
  audio.setEnabled(state.music);
  audio.unlock().then((running) => {
    if (state.music && !running)
      announce("Music is unavailable in this browser.");
  });
  announce(
    state.completed.length
      ? "Welcome back. Your friends are waiting."
      : "WASD to explore. E by a spirit. A campfire heals you.",
    6,
  );
  persist();
  syncControls();
  focusGame();
}
function toggleMusic() {
  state.music = !state.music;
  audio.setEnabled(state.music);
  musicButton.setAttribute("aria-pressed", String(state.music));
  document.querySelector("#music-label").textContent =
    `Music ${state.music ? "on" : "off"}`;
  if (mode !== "title") audio.unlock();
  persist();
  syncControls();
}
function consumeBattleEvent() {
  const event = battle?.takeEvent();
  if (event) {
    audio.play(event);
    if (event === "win") audio.setScene("victory");
  }
}
function finishBattle() {
  const outcome = battle.outcome;
  state.hero = { ...battle.hero };
  state.gear = { ...battle.gear, range: "native" };
  world.finishEncounter(battle.uid, outcome === "won");
  if (outcome === "won") {
    if (battle.boss && battle.id === state.completed.length) {
      state.completed.push(battle.id);
      state.hero.maxHp = 80 + state.completed.length * 8;
      state.hero.hp = Math.min(state.hero.maxHp, state.hero.hp + 24);
      state.hero.bytes = Math.min(256, state.hero.bytes + 40);
      world.setProgress(state.completed);
      audio.play("capture");
      const unlocked = {
        1: "Zero-shift ruler unlocked! TUNE changes your gear.",
        3: "Channel rulers unlocked! Give small signals their own scale.",
        5: "Balance ruler unlocked! Share outlier work between inputs and weights.",
      }[state.completed.length];
      announce(
        unlocked ||
          (state.completed.length === 7
            ? `${battle.foe.friend} follows you now. The island is restored!`
            : `${battle.foe.friend} follows you now. Find the next spirit!`),
        7,
      );
    } else {
      state.hero.bytes = Math.min(256, state.hero.bytes + 16);
      announce("Static cleared. +16 byte charge!");
    }
  } else if (outcome === "lost") {
    state.hero.hp = state.hero.maxHp;
    state.hero.bytes = 256;
    state.hero.snacks = Math.max(3, state.hero.snacks);
    world.setPosition({ x: 62, y: 216 });
    announce(
      "Back at camp. Friends kept. Try different gear or guard the big attacks.",
      7,
    );
  } else announce("You got away. A camp can recharge you.");
  state.position = world.getPosition();
  const finalVictory = outcome === "won" && battle.boss && battle.id === 6;
  battle = null;
  mode = finalVictory ? "ending" : "world";
  clearInput();
  audio.setScene(finalVictory ? "ending" : "overworld");
  persist();
  syncControls();
  focusGame();
}
function pause() {
  returnMode = mode;
  mode = "paused";
  pauseChoice = 0;
  resetQuestion = false;
  clearInput();
  syncControls();
  audio.play("select");
}
function resume() {
  mode = returnMode;
  resetQuestion = false;
  clearInput();
  syncControls();
  focusGame();
}
function confirm() {
  if (mode === "title") begin();
  else if (mode === "world") {
    world.interact();
  } else if (mode === "dialogue") {
    mode = "world";
    clearInput();
    syncControls();
    audio.play("select");
  } else if (mode === "ending") {
    mode = "world";
    audio.setScene("overworld");
    syncControls();
    announce("All seven spirits are home. The island is yours to explore.");
  } else if (mode === "battle") {
    if (battle.phase === "result") finishBattle();
    else {
      battle.confirm();
      consumeBattleEvent();
      syncControls();
    }
  } else if (mode === "paused") {
    if (resetQuestion) {
      if (pauseChoice === 0) {
        resetQuestion = false;
        pauseChoice = 0;
      } else {
        state = newAdventure();
        clearInput();
        persist();
        world.destroy();
        audio.destroy();
        window.location.reload();
        return;
      }
    } else if (pauseChoice === 0) resume();
    else if (pauseChoice === 1) toggleMusic();
    else {
      resetQuestion = true;
      pauseChoice = 0;
    }
    audio.play("select");
  }
}
function back() {
  if (mode === "title") return;
  if (mode === "paused") {
    if (resetQuestion) {
      resetQuestion = false;
      pauseChoice = 0;
    } else resume();
  } else if (mode === "dialogue") {
    mode = "world";
    syncControls();
  } else if (mode === "battle" && battle.phase === "tune") {
    battle.back();
    consumeBattleEvent();
    syncControls();
  } else if (mode === "ending") confirm();
  else pause();
}
function menuMove(dx, dy) {
  if (mode === "battle") {
    battle.move(dx, dy);
    consumeBattleEvent();
    syncControls();
  } else if (mode === "paused" && dy) {
    pauseChoice =
      (pauseChoice + dy + (resetQuestion ? 2 : 3)) % (resetQuestion ? 2 : 3);
    audio.play("select");
  }
}
function handleKey(event) {
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.target.matches('input, textarea, select, [contenteditable="true"]')
  )
    return;
  if (event.target.closest("a")) return;
  const key = event.key.toLowerCase();
  if (
    ["enter", " "].includes(key) &&
    event.target.closest(".header-actions, .phone-panel")
  )
    return;
  if (directions[key]) {
    event.preventDefault();
    if (mode === "world") held.add(key);
    else if (!event.repeat) {
      menuMove(...directions[key]);
      focusGame();
    }
    return;
  }
  if (key === "shift") {
    held.add("shift");
    return;
  }
  if (event.repeat) return;
  if (["enter", " ", "e", "escape", "m", "q", "f", "1", "2", "3"].includes(key))
    event.preventDefault();
  if (key === "m") toggleMusic();
  else if (key === "f") toggleFullscreen();
  else if (key === "escape") back();
  else if (key === "q" && mode === "battle") {
    battle.cycleBits();
    consumeBattleEvent();
  } else if (
    ["1", "2", "3"].includes(key) &&
    mode === "battle" &&
    ["menu", "tune"].includes(battle.phase)
  ) {
    battle.gear.weightBits = battle.gear.activationBits = [2, 4, 8][
      Number(key) - 1
    ];
    battle.refresh();
    audio.play("select");
  } else if (["enter", " ", "e"].includes(key)) confirm();
}
function toggleFullscreen() {
  const element = document.querySelector(".handheld");
  if (document.fullscreenElement) document.exitFullscreen();
  else
    element
      .requestFullscreen?.()
      .catch(() => announce("Full screen is unavailable in this browser."));
}
window.addEventListener("keydown", handleKey);
window.addEventListener("keyup", (event) =>
  held.delete(event.key.toLowerCase()),
);
window.addEventListener("blur", clearInput);
document.addEventListener("visibilitychange", () => {
  clearInput();
  lastFrame = 0;
});
canvas.addEventListener("pointerdown", focusGame);
startButton.addEventListener("click", begin);
musicButton.addEventListener("click", () => {
  toggleMusic();
  focusGame();
});
document
  .querySelector("#fullscreen")
  .addEventListener("click", toggleFullscreen);
document.querySelector("#touch-a").addEventListener("pointerdown", (event) => {
  event.preventDefault();
  confirm();
  focusGame();
});
document.querySelector("#touch-b").addEventListener("pointerdown", (event) => {
  event.preventDefault();
  back();
  focusGame();
});
document.querySelector("#touch-q").addEventListener("pointerdown", (event) => {
  event.preventDefault();
  if (mode === "battle") {
    battle.cycleBits();
    consumeBattleEvent();
  }
  focusGame();
});
for (const button of document.querySelectorAll("[data-dir]")) {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    button.classList.add("held");
    if (mode === "world") held.add(button.dataset.dir);
    else menuMove(...directions[button.dataset.dir]);
    focusGame();
  });
  const release = () => {
    held.delete(button.dataset.dir);
    button.classList.remove("held");
  };
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
}
commands.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || mode !== "battle") return;
  if (battle.phase === "menu" && button.dataset.command !== undefined) {
    battle.menu = Number(button.dataset.command);
    confirm();
    focusGame();
  } else if (battle.phase === "tune" && button.dataset.tuneRow !== undefined) {
    battle.tuneRow = Number(button.dataset.tuneRow);
    battle.changeGear();
    audio.play("select");
    syncControls();
  }
});
commands.addEventListener("focusin", (event) => {
  if (battle?.phase === "menu" && event.target.dataset.command !== undefined)
    battle.menu = Number(event.target.dataset.command);
  else if (
    battle?.phase === "tune" &&
    event.target.dataset.tuneRow !== undefined
  )
    battle.tuneRow = Number(event.target.dataset.tuneRow);
});
document.querySelector("#phone-options").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (
    button.dataset.phoneCommand !== undefined &&
    mode === "battle" &&
    battle.phase === "menu"
  ) {
    battle.menu = Number(button.dataset.phoneCommand);
    confirm();
  } else if (
    button.dataset.phoneTune !== undefined &&
    mode === "battle" &&
    battle.phase === "tune"
  ) {
    battle.tuneRow = Number(button.dataset.phoneTune);
    battle.changeGear();
    audio.play("select");
  } else if (button.dataset.phonePause !== undefined && mode === "paused") {
    pauseChoice = Number(button.dataset.phonePause);
    confirm();
  } else if (button.hasAttribute("data-phone-back")) back();
  else if (button.hasAttribute("data-phone-confirm")) confirm();
  updatePhoneUi();
  focusGame();
});
phoneMedia.addEventListener("change", () => {
  phoneLayout = "";
  syncControls();
});

function updateReadout() {
  const inBattle =
    mode === "battle" || (mode === "paused" && returnMode === "battle");
  const hero = inBattle ? battle.hero : state.hero;
  let info;
  if (inBattle) {
    info = `${mode === "paused" ? "Paused. " : ""}${battle.foe.name}. ${battle.phase}. Enemy HP ${battle.hp}/${battle.maxHp}. Your HP ${hero.hp}/${hero.maxHp}. Charge ${hero.bytes} bytes. ${battle.message}`;
    if (battle.phase === "menu")
      info += ` Selected ${COMMANDS[battle.menu]}. Spell W${battle.gear.weightBits} A${battle.gear.activationBits}, ${battle.prepared.bytes} bytes.`;
    if (battle.phase === "tune") {
      const labels = tuneLabels();
      info += ` Selected ${labels[battle.tuneRow]}. ${labels.join("; ")}. Packet ${battle.prepared.bytes} bytes. ${feedbackCaption(battle, { preview: true })}`;
      updateDesktopTuneLabels();
    }
    if (battle.phase === "aim") {
      const target = battle.targets[battle.shots.length];
      canvas.setAttribute(
        "aria-label",
        `${info} Pulse ${battle.shots.length + 1}. Target ${target.toFixed(3)}. Your aim ${battle.rawCursor.toFixed(3)}. Rebuilt ${battle.codedCursor.toFixed(3)}. Space to lock.`,
      );
    } else canvas.setAttribute("aria-label", info);
  } else {
    const position = world.getPosition();
    info =
      mode === "title"
        ? `Bitbound. Enter to ${state.started ? "continue" : "begin"}. ${state.music ? "Starts with music" : "Music muted"}.`
        : `${world.getZone().name}. HP ${hero.hp}/${hero.maxHp}. Charge ${hero.bytes} bytes. ${state.completed.length}/7 spirits befriended. ${mode === "dialogue" ? dialogue : noticeUntil > performance.now() ? notice : "WASD moves. Shift runs. E interacts."}`;
    canvas.setAttribute(
      "aria-label",
      `${info} Position ${position.x.toFixed(1)}, ${position.y.toFixed(1)}. Mode ${mode}.`,
    );
  }
  if (info !== lastReadout) {
    document.querySelector("#readout").textContent = info;
    lastReadout = info;
  }
}
function frame(time) {
  const dt = lastFrame ? Math.min(0.05, (time - lastFrame) / 1000) : 0;
  lastFrame = time;
  requestAnimationFrame(frame);
  if (document.hidden) return;
  if (mode === "world") {
    let x = 0;
    let y = 0;
    for (const key of held) {
      const direction = directions[key];
      if (direction) {
        x += direction[0];
        y += direction[1];
      }
    }
    world.update(dt, {
      x: Math.sign(x),
      y: Math.sign(y),
      dash: held.has("shift"),
    });
  } else if (mode === "battle") {
    const before = battle.phase;
    battle.update(dt);
    consumeBattleEvent();
    if (battle.phase !== before) syncControls();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const paintMode = mode === "paused" ? returnMode : mode;
  if (paintMode === "title")
    drawTitle(ctx, world, state, time, reducedMotion.matches);
  else if (paintMode === "battle")
    drawBattle(ctx, battle, time, reducedMotion.matches, phoneMedia.matches);
  else if (paintMode === "ending")
    drawEnding(ctx, state, time, reducedMotion.matches);
  else {
    world.render(time);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!phoneMedia.matches) {
      drawWorldHud(
        ctx,
        state,
        world.getZone(),
        world.getPosition(),
        world.getPrompt(),
        noticeUntil > time ? notice : "",
      );
      if (paintMode === "dialogue") drawDialogue(ctx, dialogue);
    }
  }
  if (mode === "paused") {
    if (phoneMedia.matches) {
      ctx.fillStyle = "rgba(11,25,37,0.7)";
      ctx.fillRect(0, 0, 480, 288);
    } else drawPause(ctx, state, pauseChoice, resetQuestion);
  }
  statusClock += dt;
  musicClock += dt;
  if (statusClock > 0.12) {
    statusClock = 0;
    updateReadout();
    updatePhoneUi();
  }
  if (musicClock > 0.08) {
    musicClock = 0;
    let energy = 0;
    if (audio.analyser && audio.enabled && audio.context?.state === "running") {
      audio.analyser.getByteTimeDomainData(musicData);
      for (let i = 0; i < musicData.length; i++)
        energy += (musicData[i] - 128) ** 2;
      energy = Math.sqrt(energy / musicData.length) / 32;
    }
    musicButton.style.setProperty("--level", String(Math.min(1, energy)));
    musicButton.dataset.audioState = audio.context?.state ?? "locked";
    musicButton.dataset.scene = audio.scene;
    musicButton.dataset.level = energy.toFixed(4);
  }
}
window.addEventListener("pagehide", () => {
  clearInput();
  persist();
});
syncControls();
updateReadout();
requestAnimationFrame(frame);
