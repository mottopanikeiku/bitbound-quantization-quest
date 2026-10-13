import { drawSprite, drawNoiseSprite } from "./art.js";
import { COMMANDS, FOES, RULER_NAMES } from "./battle.js";
import { text, centered, wrapped, panel, textWidth } from "./pixel-text.js";
import { LOCATIONS } from "./world.js";
import { drawCastFeedback, feedbackSummary } from "./cast-feedback.js";

const C = {
  ink: "#17293a",
  cream: "#fff1c8",
  pale: "#b7c6d3",
  mint: "#93d6ac",
  gold: "#f3c66d",
  red: "#ef937e",
  blue: "#89cae1",
};
const BACKDROP = ["#29394f", "#3e3b57", "#4a405c", "#35435a"];
const CONFETTI = [C.gold, C.mint, C.blue];
function bar(ctx, x, y, width, ratio, color, height = 5) {
  ctx.fillStyle = "#0b1c2b";
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.max(0, Math.round(width * ratio)), height);
}
function platform(ctx, x, y, width, color) {
  ctx.fillStyle = "#132b40";
  ctx.fillRect(x + 8, y, width - 16, 12);
  ctx.fillRect(x, y + 3, width, 6);
  ctx.fillStyle = color;
  ctx.fillRect(x + 8, y, width - 16, 3);
}
export function drawBattle(ctx, battle, time, reduced = false, mobile = false) {
  const motion = reduced ? 0 : time / 1000;
  const color = battle.foe.color;
  ctx.fillStyle = "#233448";
  ctx.fillRect(0, 0, 480, 288);
  // Original gently undulating ribbon backdrop, not a franchise battle background.
  for (let row = 0; row < 22; row++) {
    ctx.fillStyle = BACKDROP[(row + battle.id) % BACKDROP.length];
    const shift = Math.round(Math.sin(row * 0.7 + motion * 0.9) * 12);
    for (let x = -24; x < 500; x += 40)
      ctx.fillRect(x + shift, row * 9 + 1, 25, 5);
  }
  ctx.fillStyle = "#26394c";
  ctx.fillRect(0, 141, 480, 53);
  platform(ctx, 28, 165, 156, "#76a799");
  platform(ctx, 271, 143, 152, color);
  const enemyShake =
    !reduced && battle.phase === "resolve"
      ? Math.round(
          Math.sin(battle.clock * 55) * Math.max(0, 5 - battle.clock * 5),
        )
      : 0;
  const heroShake =
    !reduced && battle.phase === "enemy"
      ? Math.round(
          Math.sin(battle.clock * 50) * Math.max(0, 4 - battle.clock * 4),
        )
      : 0;
  const float = Math.round(Math.sin(motion * 2) * 2);
  drawSprite(ctx, "player", 38 + heroShake, 112, 2, 7);
  if (battle.completed.length)
    drawSprite(
      ctx,
      FOES[battle.completed.at(-1)].sprite,
      97 + heroShake,
      103 + float,
      2,
    );
  if (battle.boss)
    drawSprite(ctx, battle.foe.sprite, 297 + enemyShake, 65 + float, 4);
  else
    drawNoiseSprite(
      ctx,
      battle.id,
      297 + enemyShake,
      63 + float,
      5,
      Math.floor(motion * 2) % 2,
    );
  if (!mobile) {
    if (battle.charged && ["menu", "tune", "aim"].includes(battle.phase)) {
      panel(ctx, 433, 78, 26, 28, "#824852", "#eaba7e");
      text(ctx, "!", 440, 84, 2, C.cream);
    }
    panel(ctx, 10, 9, 187, 98, "#203847", "#92b9b0");
    text(ctx, "YOU + YOUR FRIENDS", 19, 17, 1, C.cream);
    text(ctx, `HP${battle.hero.hp}/${battle.hero.maxHp}`, 19, 34, 3, C.cream);
    bar(ctx, 19, 63, 167, battle.shownHeroHp / battle.hero.maxHp, C.mint);
    text(ctx, `${battle.hero.bytes}B`, 19, 80, 3, C.blue);
    text(ctx, "BYTE MANA", 115, 87, 1, C.blue);
    panel(ctx, 220, 8, 250, 33, "#203847", color);
    text(
      ctx,
      battle.boss
        ? battle.id === 6
          ? "NOISE WYRM"
          : battle.foe.friend
        : "STATICLING",
      229,
      14,
      3,
      C.cream,
    );
    bar(ctx, 277, 44, 151, battle.shownHp / battle.maxHp, color);
    text(ctx, `${battle.hp}/${battle.maxHp}`, 277, 52, 2, C.cream);
  }
  if (battle.phase === "resolve") {
    const fraction = Math.min(1, battle.clock / 0.7);
    for (let i = 0; i < 3; i++) {
      const x = 140 + fraction * 180;
      const y = 105 + i * 16 - Math.sin(fraction * Math.PI) * 36;
      ctx.fillStyle = i === 0 ? C.gold : i === 1 ? C.mint : C.blue;
      ctx.fillRect(Math.round(x), Math.round(y), 8, 4);
      ctx.fillRect(Math.round(x) - 5, Math.round(y) + 1, 5, 2);
    }
    text(
      ctx,
      `-${battle.damage}`,
      327,
      Math.round(76 - Math.min(1, battle.clock) * 18),
      2,
      C.gold,
    );
  } else if (battle.phase === "enemy") {
    const fraction = Math.min(1, battle.clock / 0.6);
    ctx.fillStyle = C.red;
    ctx.fillRect(Math.round(320 - fraction * 210), 125, 13, 7);
    text(
      ctx,
      `-${battle.enemyDamage}`,
      62,
      Math.round(94 - battle.clock * 15),
      2,
      C.red,
    );
  } else if (battle.phase === "support") {
    const glyph = battle.guarded ? "+" : battle.scanned ? "=" : "+";
    text(ctx, glyph, 88, 93 - Math.round(battle.clock * 12), 3, C.blue);
  }
  if (!mobile && ["menu", "tune", "resolve", "enemy"].includes(battle.phase)) {
    drawCastFeedback(ctx, battle, { preview: battle.phase === "tune" });
  }
  if (battle.phase === "aim") drawAim(ctx, battle, mobile);
  if (battle.phase === "result") drawResult(ctx, battle, time, reduced, mobile);
  else if (!mobile && battle.phase === "tune") drawTune(ctx, battle);
  else if (!mobile && battle.phase !== "aim") drawCommands(ctx, battle);
}
function drawCommands(ctx, battle) {
  panel(ctx, 10, 169, 460, 23);
  text(
    ctx,
    battle.message.length > 37
      ? battle.message.slice(0, 34) + "..."
      : battle.message,
    21,
    175,
    2,
    C.cream,
  );
  panel(ctx, 10, 196, 460, 83);
  for (let i = 0; i < COMMANDS.length; i++) {
    const x = 25 + (i % 2) * 155;
    const y = 205 + Math.floor(i / 2) * 25;
    if (battle.phase === "menu" && battle.menu === i) {
      ctx.fillStyle = "#355770";
      ctx.fillRect(x - 6, y - 3, 142, 24);
      text(ctx, ">", x, y, 2, C.gold);
    }
    text(ctx, COMMANDS[i], x + 18, y, 3, i === battle.menu ? C.gold : C.cream);
  }
  text(
    ctx,
    `W${battle.gear.weightBits} A${battle.gear.activationBits}`,
    352,
    207,
    2,
    C.blue,
  );
  text(ctx, `${battle.prepared.bytes}B`, 352, 232, 2, C.blue);
  text(ctx, "PACKET", 352, 249, 1, C.pale);
  text(ctx, `SNACKS ${battle.hero.snacks}`, 352, 266, 1, C.pale);
}
function drawTune(ctx, battle) {
  panel(ctx, 10, 165, 460, 114);
  text(ctx, "SPELL GEAR", 23, 175, 2, C.gold);
  text(ctx, `${battle.prepared.bytes}B`, 371, 175, 2, C.blue);
  const rows = [
    ["WEIGHTS", `${battle.gear.weightBits} BIT`],
    ["SAMPLES", `${battle.gear.activationBits} BIT`],
    ["RULER", RULER_NAMES[battle.gear.ruler]],
    [
      "RANGE",
      battle.gear.range === "native"
        ? "STANDARD"
        : battle.gear.range === "full"
          ? "SCANNED"
          : "TRIMMED",
    ],
  ];
  rows.forEach(([label, value], i) => {
    const y = 196 + i * 20;
    if (battle.tuneRow === i) {
      ctx.fillStyle = "#355770";
      ctx.fillRect(19, y - 2, 440, 18);
      text(ctx, ">", 24, y, 2, C.gold);
    }
    text(ctx, label, 43, y, 2, C.cream);
    text(ctx, `< ${value} >`, 227, y, 2, C.blue);
  });
  const packet = feedbackSummary(battle);
  const grid =
    packet.activation.length === 1
      ? `ZERO ${packet.activation[0].zeroCode} [${Number(packet.activation[0].min.toFixed(2))},${Number(packet.activation[0].max.toFixed(2))}]`
      : `${packet.activation.length} ROW/PULSE RULERS`;
  text(ctx, "W/S CHOOSE . A/D CHANGE . ESC BACK", 23, 272, 1, C.pale);
  text(
    ctx,
    `${packet.payloadBytes} PAYLOAD + ${packet.metadataBytes} RULERS . ${grid}`,
    23,
    281,
    1,
    C.blue,
  );
}
function drawAim(ctx, battle, mobile = false) {
  panel(ctx, 10, 180, 460, 98, "#17384a", "#92c6d3");
  const left = 32;
  const width = 416;
  const { min, max } = battle.axis;
  const position = (value) =>
    Math.max(
      left,
      Math.min(left + width, left + ((value - min) / (max - min)) * width),
    );
  text(ctx, `PULSE ${battle.shots.length + 1}/3`, 23, 189, 2, C.gold);
  text(
    ctx,
    `W${battle.gear.weightBits} A${battle.gear.activationBits}`,
    350,
    189,
    2,
    C.blue,
  );
  ctx.fillStyle = "#4f7182";
  ctx.fillRect(left, 222, width, 2);
  const ticks = 16; // Axis marks, not a claim of individual output-code locations.
  ctx.fillStyle = "#45677a";
  for (let i = 0; i <= ticks; i++)
    ctx.fillRect(Math.round(left + (i / ticks) * width), 216, 1, 14);
  const targetX = Math.round(position(battle.targets[battle.shots.length]));
  ctx.fillStyle = C.gold;
  ctx.fillRect(targetX - 6, 213, 13, 20);
  ctx.fillStyle = "#17384a";
  ctx.fillRect(targetX - 4, 215, 9, 16);
  text(ctx, "TARGET", targetX - 18, 203, 1, C.gold);
  const rawX = Math.round(position(battle.rawCursor));
  const codedX = Math.round(position(battle.codedCursor));
  ctx.fillStyle = C.cream;
  ctx.fillRect(rawX - 1, 209, 3, 30);
  ctx.fillStyle = C.mint;
  ctx.fillRect(codedX - 3, 218, 7, 9);
  if (!mobile) {
    text(ctx, "SPACE / ENTER: STOP", 23, 248, 2, C.cream);
    text(ctx, "GREEN = REBUILT SIGNAL", 23, 265, 1, C.blue);
  }
}
function drawResult(ctx, battle, time, reduced, mobile = false) {
  ctx.fillStyle = "rgba(13,25,40,0.83)";
  ctx.fillRect(0, 0, 480, 288);
  const won = battle.outcome === "won";
  const y = reduced ? 0 : Math.sin(time / 300) * 2;
  centered(
    ctx,
    won
      ? "STATIC CLEARED!"
      : battle.outcome === "lost"
        ? "TAKE A BREATHER"
        : "SAFE RETREAT",
    37,
    2,
    won ? C.gold : C.blue,
  );
  if (won && !battle.boss) drawNoiseSprite(ctx, battle.id, 195, 70 + y, 5);
  else drawSprite(ctx, won ? battle.foe.sprite : "player", 192, 70 + y, 4);
  if (!mobile) {
    panel(ctx, 28, 185, 424, 81);
    centered(
      ctx,
      won && battle.boss
        ? `${battle.foe.friend} joins your party!`
        : battle.message,
      201,
      1,
      C.cream,
    );
    if (won && battle.boss)
      centered(ctx, "+8 MAX HP . A NEW PATH OPENS", 220, 1, C.mint);
    else if (won) centered(ctx, "+16 CHARGE . KEEP EXPLORING", 220, 1, C.mint);
    else if (battle.outcome === "lost")
      centered(ctx, "REST AT CAMP. NO FRIENDS LOST.", 220, 1, C.mint);
    centered(ctx, "ENTER / SPACE TO CONTINUE", 245, 1, C.gold);
  }
  if (won && !reduced)
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = i % 4 === 3 ? battle.foe.color : CONFETTI[i % 4];
      ctx.fillRect(
        30 + ((i * 47) % 420),
        Math.round((time / 24 + i * 17) % 170),
        2,
        3,
      );
    }
}
export function drawTitle(ctx, world, state, time, reduced) {
  world.render(time);
  ctx.fillStyle = "rgba(14,33,40,0.84)";
  ctx.fillRect(0, 0, 480, 288);
  for (let i = 0; i < 7; i++)
    drawSprite(
      ctx,
      FOES[i].sprite,
      49 + i * 55,
      139 + (reduced ? 0 : Math.round(Math.sin(time / 500 + i) * 3)),
      2,
    );
  centered(ctx, "BITBOUND", 48, 5, "#071e29");
  centered(ctx, "BITBOUND", 45, 5, C.cream);
  centered(ctx, "THE STATIC ISLE", 98, 2, C.mint);
  panel(ctx, 81, 210, 318, 35, "#203847", C.gold);
  centered(
    ctx,
    state.started
      ? "ENTER: CONTINUE YOUR ADVENTURE"
      : "ENTER: BEGIN YOUR ADVENTURE",
    223,
    1,
    C.gold,
  );
  centered(
    ctx,
    state.music
      ? "STARTS WITH ORIGINAL MUSIC . M: MUTE"
      : "MUSIC OFF . M: TURN IT ON",
    256,
    1,
    C.pale,
  );
  centered(ctx, "WASD MOVE . SHIFT RUN . E INTERACT", 276, 1, C.pale);
}
export function nextObjective(state, position) {
  const id = state.completed.length;
  if (id >= 7) return "ISLAND RESTORED";
  const target = LOCATIONS[id];
  const dx = target.x - position.x;
  const dy = target.y - position.y;
  const direction = `${dy < -12 ? "N" : dy > 12 ? "S" : ""}${dx < -12 ? "W" : dx > 12 ? "E" : ""}`;
  return `NEXT: ${FOES[id].friend} / ${direction || "HERE"}`;
}

export function drawWorldHud(ctx, state, zone, position, prompt, notice = "") {
  panel(
    ctx,
    8,
    8,
    Math.min(278, textWidth(zone.name, 1) + 26),
    19,
    "#203847",
    "#e4d2a3",
  );
  text(ctx, zone.name, 17, 14, 1, C.cream);
  const goal = nextObjective(state, position);
  panel(ctx, 8, 33, textWidth(goal, 1) + 20, 19, "#203847", C.gold);
  text(ctx, goal, 17, 39, 1, C.gold);
  panel(ctx, 310, 8, 162, 42, "#203847", "#92b9b0");
  text(ctx, `HP ${state.hero.hp}/${state.hero.maxHp}`, 320, 14, 2, C.mint);
  text(
    ctx,
    `${state.hero.bytes}B . ${state.completed.length}/7 FRIENDS`,
    320,
    36,
    1,
    C.blue,
  );
  const message = notice || prompt;
  if (message) {
    panel(ctx, 8, 245, 464, 35, "#203847", C.gold);
    wrapped(ctx, message, 18, 252, 444, 1, C.cream);
  }
}
export function drawDialogue(ctx, message) {
  panel(ctx, 10, 207, 460, 71);
  wrapped(ctx, message, 24, 220, 429, 1, C.cream, 5);
  text(ctx, "ENTER / E", 397, 264, 1, C.gold);
}
export function drawPause(ctx, state, selection, reset = false) {
  ctx.fillStyle = "rgba(11,25,37,0.7)";
  ctx.fillRect(0, 0, 480, 288);
  panel(ctx, 110, 32, 260, 224);
  centered(ctx, reset ? "START A NEW GAME?" : "PAUSED", 49, 2, C.gold);
  const options = reset
    ? ["KEEP ADVENTURE", "RESET RPG SAVE"]
    : ["RESUME", state.music ? "MUSIC: ON" : "MUSIC: OFF", "NEW GAME"];
  options.forEach((value, i) => {
    const y = 94 + i * 26;
    if (selection === i) {
      ctx.fillStyle = "#355770";
      ctx.fillRect(124, y - 5, 232, 22);
      text(ctx, ">", 133, y, 1, C.gold);
    }
    text(ctx, value, 153, y, 1, C.cream);
  });
  centered(
    ctx,
    `${state.completed.length}/7 SPIRITS BEFRIENDED`,
    193,
    1,
    C.mint,
  );
  centered(ctx, "W/S + ENTER . ESC TO RETURN", 223, 1, C.pale);
}
export function drawEnding(ctx, state, time, reduced) {
  ctx.fillStyle = "#203847";
  ctx.fillRect(0, 0, 480, 288);
  centered(ctx, "THE ISLE IS ALIVE AGAIN", 37, 2, C.gold);
  centered(ctx, "SMALL BITS. BIG FRIENDSHIPS.", 72, 1, C.mint);
  for (let i = 0; i < 7; i++)
    drawSprite(
      ctx,
      FOES[i].sprite,
      31 + i * 62,
      112 + (reduced ? 0 : Math.sin(time / 350 + i) * 4),
      2,
    );
  centered(ctx, "SEVEN SPIRITS. YOUR OWN WAY THROUGH.", 198, 1, C.cream);
  centered(ctx, "KEEP EXPLORING. TRY A DIFFERENT SPELL GEAR.", 222, 1, C.blue);
  panel(ctx, 99, 245, 282, 27, "#355770", C.gold);
  centered(ctx, "ENTER: BACK TO THE ISLE", 255, 1, C.gold);
}
