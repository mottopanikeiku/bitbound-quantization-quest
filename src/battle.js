import {
  dot,
  meanSquaredError,
  parameters,
  quantizeTensor,
  quantizeValue,
  storageBytes,
} from "./quantization.js";

const SIGNED = [
  -0.9, -0.6, -0.3, 0.15, 0.45, 0.8, 1, 0.7, 0.35, 0.05, -0.25, -0.65, -1,
  -0.75, -0.4, 0.2,
];
const POSITIVE = [
  0.12, 0.28, 0.45, 0.7, 1, 0.82, 0.6, 0.35, 0.18, 0.3, 0.65, 0.9, 0.75, 0.48,
  0.22, 0.1,
];
// Each repeating cadence starts at turn zero; values above 1 telegraph a charge.
export const FOES = [
  {
    name: "Static Sprout",
    friend: "Nib",
    sprite: "sprout",
    color: "#91bd69",
    hp: 54,
    power: 10,
    cadence: [1, 1, 1.9],
    peaks: [-0.7, 0.35, 0.85],
    ranges: [1, 1, 1],
    weights: [1, 1, 1],
    hint: "Small codes. Big heart.",
  },
  {
    name: "Crooked Chime",
    friend: "Chime",
    sprite: "crystal",
    color: "#eac87b",
    hp: 68,
    power: 12,
    cadence: [1, 1.6, 1, 1],
    chargeCue: "Chime's echo swells... GUARD!",
    peaks: [0.45, 1.7, 2.65],
    ranges: [3, 3, 3],
    // Calibration keeps the positive wavelets, with a small negative tail.
    archive: [-1, 0.45, 0.7, 1.2, 1.7, 2.2, 2.65, 3],
    weights: [1, 1, 1],
    positive: true,
    hint: "Mostly bright notes. A small low tail.",
  },
  {
    name: "Thunder Brine",
    friend: "Brine",
    sprite: "tide",
    color: "#70bec3",
    hp: 82,
    power: 14,
    cadence: [1, 1, 1.8, 1],
    chargeCue: "Brine gathers a tidal blast... GUARD!",
    peaks: [0.65, -2.7, 2.2],
    ranges: [10, 10, 10],
    archive: [-3, -2.7, -1.5, 0.3, 0.65, 1.2, 2.2, 3, 10],
    weights: [1, 1, 1],
    storm: true,
    stormPeaks: [-8, 7, 10],
    stormTurns: [1, 2],
    hint: "Watch the weather. Fit your ruler.",
  },
  {
    name: "Tangled Spindle",
    friend: "Spindle",
    sprite: "moth",
    color: "#b5a3d9",
    hp: 94,
    power: 15,
    cadence: [1, 1, 1, 1.7, 1],
    chargeCue: "Spindle draws its threads tight... GUARD!",
    peaks: [-4.2, 0.75, 0.13],
    ranges: [5, 1, 0.16],
    weights: [0.028, 0.3, 1],
    hint: "Three channels. Three very different scales.",
  },
  {
    name: "Furnace Cinder",
    friend: "Cinder",
    sprite: "ember",
    color: "#efad75",
    hp: 108,
    power: 17,
    cadence: [1, 1.5, 1, 1.5, 1, 1],
    chargeCue: "Cinder flares for a hot blast... GUARD!",
    peaks: [-0.65, 0.32, 0.86],
    ranges: [1, 1, 1],
    weights: [1, 1, 1],
    delicate: true,
    hint: "Weights and samples both carry the signal.",
  },
  {
    name: "Overgrown Vesper",
    friend: "Vesper",
    sprite: "wisp",
    color: "#c49ddb",
    hp: 122,
    power: 19,
    cadence: [1, 1, 1.7, 1, 1, 1, 1.7],
    chargeCue: "Vesper's shadow expands... GUARD!",
    peaks: [-0.75, 0.38, 0.88],
    ranges: [1, 1, 1],
    weights: [1, 1, 1],
    outlier: true,
    hint: "A big input can share its burden with a weight.",
  },
  {
    name: "The Noise Wyrm",
    friend: "Auric",
    sprite: "dragon",
    color: "#edd286",
    hp: 152,
    power: 21,
    cadence: [1, 1.6, 1, 1, 1.85, 1],
    chargeCue: "Auric gathers a roaring breath... GUARD!",
    peaks: [-0.8, 0.37, 0.91],
    ranges: [1, 1, 1],
    weights: [0.18, 0.55, 1],
    delicate: true,
    hint: "Keep the important parts precise.",
  },
];
export const COMMANDS = ["CAST", "TUNE", "GUARD", "SCAN", "SNACK", "RUN"];
export const RULERS = ["shared", "offset", "channel", "balanced"];
export const RULER_NAMES = {
  shared: "Shared",
  offset: "Zero-shift",
  channel: "Channels",
  balanced: "Balance",
};
export function newGear() {
  return { weightBits: 4, activationBits: 4, ruler: "shared", range: "native" };
}
export function availableRulers(completed) {
  const count = completed.length;
  return RULERS.filter(
    (_, index) =>
      index === 0 ||
      (index === 1 && count >= 1) ||
      (index === 2 && count >= 3) ||
      (index === 3 && count >= 5),
  );
}

function signal(foe, amplitude, row) {
  const shape = foe.positive ? POSITIVE : SIGNED;
  return shape.map(
    (value, i) => amplitude * (foe.outlier && i === 0 ? 12 : value),
  );
}
function weights(foe, row) {
  const shape = foe.positive ? POSITIVE : SIGNED;
  return shape.map(
    (value, i) =>
      foe.weights[row] * (foe.outlier ? (i === 0 ? 0.07 : value * 0.1) : value),
  );
}

// This is a small three-output linear spell, not a trained model or a hardware kernel.
// The byte charge is fictional; packet sizes use the declared packed toy format.
export function prepareSpell(id, gear, scanned = false) {
  const foe = FOES[id];
  const originalWeights = [0, 1, 2].map((row) => weights(foe, row));
  const observed = [0, 1, 2].map((row) => signal(foe, foe.ranges[row], row));
  const scales = Array(16).fill(1);
  if (gear.ruler === "balanced") {
    for (let i = 0; i < 16; i++) {
      const activationPeak = Math.max(
        ...observed.map((row) => Math.abs(row[i])),
      );
      const weightPeak = Math.max(
        ...originalWeights.map((row) => Math.abs(row[i])),
      );
      scales[i] = Math.sqrt(
        Math.max(activationPeak, 0.001) / Math.max(weightPeak, 0.001),
      );
    }
  }
  const transformedWeights = originalWeights.map((row) =>
    row.map((value, i) => value * scales[i]),
  );
  const granularity = gear.ruler === "channel" ? "channel" : "tensor";
  const w = quantizeTensor(transformedWeights, {
    bits: gear.weightBits,
    granularity,
  });
  const mode = gear.ruler === "offset" ? "affine" : "symmetric";
  const calibration = [0, 1, 2].map((row) =>
    (foe.archive ?? [foe.ranges[row]]).flatMap((amplitude) =>
      signal(foe, amplitude, row).map((value, i) => value / scales[i]),
    ),
  );
  const sourceRows =
    scanned && gear.range !== "native"
      ? calibration
      : [0, 1, 2].map(() => [-1, 0, 1]);
  const groups = granularity === "channel" ? sourceRows : [sourceRows.flat()];
  const params = groups.map((group) => {
    let values = group;
    if (gear.range === "trim" && scanned) {
      const sorted = group.map(Math.abs).sort((a, b) => a - b);
      const cap = sorted[Math.floor((sorted.length - 1) * 0.85)];
      values = group.map((value) => Math.max(-cap, Math.min(cap, value)));
    }
    return parameters(values, { bits: gear.activationBits, mode });
  });
  const activationStorage = storageBytes(
    48,
    gear.activationBits,
    params.length,
    mode,
  );
  return {
    foe,
    originalWeights,
    scales,
    w,
    params,
    activationStorage,
    bytes: w.storage.total + activationStorage.total,
    gains: originalWeights.map((row, index) => dot(row, signal(foe, 1, index))),
  };
}

export function rebuiltAmplitude(prepared, amplitude, row) {
  const input = signal(prepared.foe, amplitude, row);
  const p =
    prepared.params.length === 1 ? prepared.params[0] : prepared.params[row];
  const actual = input.map(
    (value, i) => quantizeValue(value / prepared.scales[i], p).reconstructed,
  );
  return dot(prepared.w.reconstructedRows[row], actual) / prepared.gains[row];
}

export function resolveSpell(prepared, desiredAmplitudes, rawAmplitudes) {
  const reference = [];
  const actual = [];
  const relative = [];
  const landings = [];
  let clipped = 0;
  for (let row = 0; row < 3; row++) {
    const desired = signal(prepared.foe, desiredAmplitudes[row], row);
    const raw = signal(prepared.foe, rawAmplitudes[row], row);
    const p =
      prepared.params.length === 1 ? prepared.params[0] : prepared.params[row];
    const rebuilt = raw.map((value, i) => {
      const point = quantizeValue(value / prepared.scales[i], p);
      if (point.clipped) clipped++;
      return point.reconstructed;
    });
    const ref = dot(prepared.originalWeights[row], desired);
    const out = dot(prepared.w.reconstructedRows[row], rebuilt);
    reference.push(ref);
    actual.push(out);
    const denominator = Math.max(
      Math.abs(ref),
      Math.abs(prepared.gains[row]) * 0.18,
    );
    relative.push((out - ref) / denominator);
    landings.push(out / prepared.gains[row]);
  }
  const error = relative.reduce((sum, value) => sum + value * value, 0) / 3;
  return {
    bytes: prepared.bytes,
    reference,
    actual,
    landings,
    clipped,
    mse: meanSquaredError(reference, actual),
    relativeError: error,
    quality: Math.max(
      0.025,
      Math.exp(-error * (prepared.foe.delicate ? 7 : 4)),
    ),
  };
}

export class Battle {
  constructor({ id, boss = true, uid, hero, gear, completed }) {
    this.id = id;
    this.boss = boss;
    this.uid = uid;
    this.foe = FOES[id];
    this.hero = { ...hero };
    this.completed = completed.slice();
    this.gear = { ...gear, range: "native" };
    if (!availableRulers(completed).includes(this.gear.ruler))
      this.gear.ruler = "shared";
    this.maxHp = boss ? this.foe.hp : Math.round(30 + id * 6);
    this.hp = this.maxHp;
    this.shownHp = this.hp;
    this.shownHeroHp = hero.hp;
    this.phase = "menu";
    this.menu = 0;
    this.tuneRow = 0;
    this.clock = 0;
    this.turn = 0;
    this.scanned = false;
    this.guarded = false;
    this.outcome = null;
    this.shots = [];
    this.message = boss
      ? `${this.foe.name} blocks the way!`
      : "A roaming staticling appeared!";
    this.event = null;
    this.analysis = null;
    this.lastCast = null;
    this.damage = 0;
    this.enemyDamage = 0;
    this.refresh();
  }
  refresh() {
    this.prepared = prepareSpell(this.id, this.gear, this.scanned);
    this.refreshPreview();
  }
  refreshPreview() {
    // Fixed input separates quantization drift from timing; never run per frame.
    this.preview = resolveSpell(this.prepared, this.targets, this.targets);
  }
  get targets() {
    if (
      this.foe.storm &&
      this.foe.stormTurns.includes(this.turn % this.foe.cadence.length)
    )
      return this.foe.stormPeaks;
    return this.foe.peaks;
  }
  get axis() {
    // Each pulse gets a readable aiming camera. This does not change its quantizer.
    const magnitude = Math.max(
      0.2,
      Math.abs(this.targets[Math.min(this.shots.length, 2)]) * 1.28,
    );
    return { min: this.foe.positive ? 0 : -magnitude, max: magnitude };
  }
  get rawCursor() {
    const { min, max } = this.axis;
    const speed = this.id === 0 ? 1.75 : 2.1;
    const ratio =
      (1 - Math.cos(this.clock * speed + this.shots.length * 0.85)) / 2;
    return min + ratio * (max - min);
  }
  get codedCursor() {
    return rebuiltAmplitude(this.prepared, this.rawCursor, this.shots.length);
  }
  get charged() {
    return this.foe.cadence[this.turn % this.foe.cadence.length] > 1;
  }
  move(dx, dy) {
    if (this.phase === "menu") {
      const row = Math.floor(this.menu / 2);
      const col = this.menu % 2;
      this.menu = ((row + dy + 3) % 3) * 2 + ((col + dx + 2) % 2);
      this.event = "select";
    } else if (this.phase === "tune") {
      if (dy) this.tuneRow = (this.tuneRow + dy + 4) % 4;
      if (dx) this.changeGear(dx);
      this.event = "select";
    }
  }
  changeGear(direction = 1) {
    const cycle = (current, values) =>
      values[
        (values.indexOf(current) + direction + values.length) % values.length
      ];
    if (this.tuneRow === 0)
      this.gear.weightBits = cycle(this.gear.weightBits, [2, 4, 8]);
    if (this.tuneRow === 1)
      this.gear.activationBits = cycle(this.gear.activationBits, [2, 4, 8]);
    if (this.tuneRow === 2)
      this.gear.ruler = cycle(this.gear.ruler, availableRulers(this.completed));
    if (this.tuneRow === 3)
      this.gear.range = cycle(
        this.gear.range,
        this.scanned ? ["native", "full", "trim"] : ["native"],
      );
    this.refresh();
  }
  cycleBits() {
    if (!["menu", "tune"].includes(this.phase)) return;
    const values = [2, 4, 8];
    this.gear.weightBits =
      values[(values.indexOf(this.gear.weightBits) + 1) % 3];
    this.gear.activationBits = this.gear.weightBits;
    this.refresh();
    this.event = "select";
  }
  back() {
    if (this.phase === "tune") {
      this.phase = "menu";
      this.message = "Ready when you are.";
      this.event = "select";
    }
  }
  confirm() {
    if (this.phase === "tune") {
      this.changeGear();
      return;
    }
    if (this.phase === "aim") {
      this.shots.push(this.rawCursor);
      this.event = "cast";
      if (this.shots.length === 3) {
        const targets = this.targets;
        this.analysis = resolveSpell(this.prepared, targets, this.shots);
        const aimError =
          this.shots.reduce(
            (sum, value, i) =>
              sum +
              Math.abs(value - targets[i]) /
                Math.max(0.25, Math.abs(targets[i])),
            0,
          ) / 3;
        this.damage = Math.max(
          1,
          Math.round(
            (34 + this.completed.length * 2) *
              this.analysis.quality *
              (aimError < 0.07 ? 1.15 : 1),
          ),
        );
        // Preserve this cast's weather and locked aims before the turn advances.
        this.lastCast = {
          targets: targets.slice(),
          raw: this.shots.slice(),
          rebuilt: this.analysis.landings.slice(),
          damage: this.damage,
          clipped: this.analysis.clipped,
          mse: this.analysis.mse,
        };
        this.hp = Math.max(0, this.hp - this.damage);
        this.message = this.analysis.clipped
          ? `${this.damage} damage · signal clipped!`
          : `${this.damage} damage${aimError < 0.07 ? " · nice timing!" : ""}`;
        this.phase = "resolve";
        this.clock = 0;
        this.event = "hit";
      }
      return;
    }
    if (this.phase !== "menu") return;
    const command = COMMANDS[this.menu];
    if (command === "CAST") {
      if (this.hero.bytes < this.prepared.bytes) {
        this.message = "Low charge! GUARD restores 48 bytes.";
        this.event = "retry";
        return;
      }
      this.hero.bytes -= this.prepared.bytes;
      this.shots = [];
      this.phase = "aim";
      this.clock = 0;
      this.message = "SPACE on the target. Three pulses!";
      this.event = "select";
    } else if (command === "TUNE") {
      this.phase = "tune";
      this.tuneRow = 0;
      this.message = "W/S choose · A/D change · ESC back";
      this.event = "select";
    } else if (command === "GUARD") {
      this.guarded = true;
      this.hero.bytes = Math.min(this.hero.maxBytes, this.hero.bytes + 48);
      this.message = "Shield up! +48 byte charge";
      this.phase = "support";
      this.clock = 0;
      this.event = "guard";
    } else if (command === "SCAN") {
      this.scanned = true;
      this.gear.range = "full";
      this.refresh();
      this.message = "Signal scanned. Your ruler now fits its range.";
      this.phase = "support";
      this.clock = 0;
      this.event = "scan";
    } else if (command === "SNACK") {
      if (this.hero.snacks <= 0) {
        this.message = "No snacks. Find a camp or a chest!";
        this.event = "retry";
        return;
      }
      this.hero.snacks--;
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + 45);
      this.message = "Crunch! +45 HP";
      this.phase = "support";
      this.clock = 0;
      this.event = "heal";
    } else {
      this.outcome = "escape";
      this.phase = "result";
      this.message = "A tactical retreat. Try another approach!";
      this.event = "retry";
    }
  }
  update(dt) {
    this.clock += dt;
    this.shownHp += (this.hp - this.shownHp) * Math.min(1, dt * 9);
    this.shownHeroHp += (this.hero.hp - this.shownHeroHp) * Math.min(1, dt * 9);
    if (this.phase === "resolve" && this.clock > 1.15) {
      if (this.hp === 0) {
        this.outcome = "won";
        this.phase = "result";
        this.message = this.boss
          ? `${this.foe.friend} is free of the static!`
          : "The staticling fizzles away!";
        this.event = "win";
      } else this.enemyTurn();
    } else if (this.phase === "support" && this.clock > 0.8) this.enemyTurn();
    else if (this.phase === "enemy" && this.clock > 1.1) {
      if (this.hero.hp === 0) {
        this.outcome = "lost";
        this.phase = "result";
        this.message = "Take a breather. Your friends stay with you.";
        this.event = "retry";
      } else {
        const targets = this.targets;
        this.turn++;
        if (this.targets !== targets) this.refreshPreview();
        this.phase = "menu";
        this.menu = 0;
        this.clock = 0;
        this.message = this.charged
          ? (this.foe.chargeCue ?? "A big attack is charging... GUARD!")
          : this.foe.storm && this.targets === this.foe.stormPeaks
            ? "Storm! CAST or TUNE the range."
            : "Your turn. Make every byte count.";
      }
    }
  }
  enemyTurn() {
    const base = this.boss ? this.foe.power : Math.max(7, this.foe.power - 5);
    this.enemyDamage = Math.round(
      base *
        this.foe.cadence[this.turn % this.foe.cadence.length] *
        (this.guarded ? 0.28 : 1),
    );
    this.hero.hp = Math.max(0, this.hero.hp - this.enemyDamage);
    this.message = `${this.guarded ? "Shield absorbs the blast! " : ""}${this.enemyDamage} damage`;
    this.phase = "enemy";
    this.clock = 0;
    this.guarded = false;
    this.event = "enemy";
  }
  takeEvent() {
    const event = this.event;
    this.event = null;
    return event;
  }
}
