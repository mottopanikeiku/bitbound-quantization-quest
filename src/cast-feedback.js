import { panel, text } from "./pixel-text.js";

const C = {
  ink: "#203847",
  border: "#92b9b0",
  rail: "#526d7d",
  pale: "#b7c6d3",
  aim: "#ffffff",
  rebuilt: "#93d6ac",
  target: "#f3c66d",
};

// Retained casts own their targets; never pair an old shot with a new turn.
// resolveSpell's preview uses current targets as BOTH desired and raw input.
function trace(battle, preview) {
  if (preview) {
    if (!battle.preview) return null;
    return {
      targets: battle.targets,
      raw: battle.targets,
      rebuilt: battle.preview.landings,
      clipped: battle.preview.clipped,
      mse: battle.preview.mse,
    };
  }
  return battle.lastCast ?? null;
}

function pulseSummary(cast) {
  return cast.targets.map((target, i) => ({
    target,
    aim: cast.raw[i],
    rebuilt: cast.rebuilt[i],
  }));
}

/**
 * Toy packet bytes and fitted activation parameters for the CURRENT gear.
 * activation entries follow prepared.params order: one shared entry or three
 * channel entries. min/max are the actual reconstructed quantizer endpoints,
 * not the aiming camera and not output-equivalent pulse amplitudes.
 * Optional lastCast/preview contain three { target, aim, rebuilt } pulses;
 * only lastCast has damage. These are game measurements, not task accuracy.
 */
export function feedbackSummary(battle) {
  const prepared = battle.prepared;
  if (!prepared) return null;
  const weightPayloadBytes = prepared.w.storage.payload;
  const activationPayloadBytes = prepared.activationStorage.payload;
  const metadataBytes =
    prepared.w.storage.metadata + prepared.activationStorage.metadata;
  const summary = {
    weightPayloadBytes,
    activationPayloadBytes,
    payloadBytes: weightPayloadBytes + activationPayloadBytes,
    metadataBytes,
    totalBytes: weightPayloadBytes + activationPayloadBytes + metadataBytes,
    activation: prepared.params.map((p) => ({
      zeroCode: p.zero,
      min: p.min,
      max: p.max,
    })),
  };
  if (battle.lastCast) {
    summary.lastCast = {
      damage: battle.lastCast.damage,
      clipped: battle.lastCast.clipped,
      mse: battle.lastCast.mse,
      pulses: pulseSummary(battle.lastCast),
    };
  }
  const comparison = trace(battle, true);
  if (comparison) {
    summary.preview = {
      clipped: comparison.clipped,
      mse: comparison.mse,
      pulses: pulseSummary(comparison),
    };
  }
  return summary;
}

// Each row is a linear, target-centered camera with its own amplitude scale.
// The scale depends ONLY on the fixed input, so tuning cannot move the gold
// target or white aim. Off-camera values use arrows, not false endpoint dots.
function marker(ctx, value, target, extent, y, color, below) {
  const offset = ((value - target) / extent) * 40;
  ctx.fillStyle = color;
  const top = below ? y + 2 : y - 4;
  if (offset < -40 || offset > 40) {
    const direction = offset < -40 ? -1 : 1;
    const edge = direction < 0 ? 200 : 280;
    ctx.fillRect(edge, top + 1, 1, 1);
    ctx.fillRect(edge - direction, top, 1, 3);
    ctx.fillRect(edge - direction * 2, top - 1, 1, 5);
  } else {
    ctx.fillRect(239 + Math.round(offset), top, 3, 3);
  }
}

/** Draw only real retained shots, or the explicitly requested TUNE preview. */
export function drawCastFeedback(ctx, battle, { preview = false } = {}) {
  const cast = trace(battle, preview);
  if (!cast) return;
  // Panel including pixel shadow stays within x180..290, y111..164.
  panel(ctx, 180, 111, 108, 51, C.ink, C.border);
  text(ctx, preview ? "SAME INPUT" : "LAST CAST", 186, 115, 1, C.pale);
  for (let i = 0; i < 3; i++) {
    const y = 127 + i * 10;
    const target = cast.targets[i];
    const aim = cast.raw[i];
    // A zero-only input still needs a visible camera, not an invented sample.
    const magnitude = Math.max(Math.abs(target), Math.abs(aim));
    const extent = magnitude === 0 ? 1 : magnitude * 2;
    text(ctx, i + 1, 186, y - 3, 1, C.pale);
    ctx.fillStyle = C.rail;
    ctx.fillRect(200, y, 81, 1);
    ctx.fillRect(200, y - 1, 1, 3);
    ctx.fillRect(280, y - 1, 1, 3);
    // Separate vertical lanes keep all three marks visible when they coincide.
    ctx.fillStyle = C.target;
    ctx.fillRect(240, y - 1, 1, 3);
    ctx.fillRect(239, y, 3, 1);
    marker(ctx, aim, target, extent, y, C.aim, false);
    marker(ctx, cast.rebuilt[i], target, extent, y, C.rebuilt, true);
  }
  text(ctx, "AIM", 186, 155, 1, C.aim);
  text(ctx, "CODE", 214, 155, 1, C.rebuilt);
  text(ctx, "GOAL", 250, 155, 1, C.target);
}

function percent(value) {
  const scaled = value * 100;
  if (scaled > 0 && scaled < 0.1) return "<0.1%";
  return `${scaled.toFixed(1).replace(/\.0$/, "")}%`;
}

/**
 * Mean absolute offsets use each target's amplitude (floor 0.25, matching the
 * game's timing comparison). Coding shift is rebuilt minus RAW aim, not the
 * total target miss; it includes the spell's weight and activation coding.
 */
export function feedbackCaption(battle, { preview = false } = {}) {
  const cast = trace(battle, preview);
  if (!cast) return "";
  let aimMiss = 0;
  let codeShift = 0;
  for (let i = 0; i < 3; i++) {
    const scale = Math.max(0.25, Math.abs(cast.targets[i]));
    aimMiss += Math.abs(cast.raw[i] - cast.targets[i]) / scale;
    codeShift += Math.abs(cast.rebuilt[i] - cast.raw[i]) / scale;
  }
  const start = preview
    ? "Same input: aim fixed"
    : `${cast.damage} damage; aim miss ${percent(aimMiss / 3)}`;
  const clipping = cast.clipped
    ? `${cast.clipped} samples clipped`
    : "no clipping";
  return `${start}; code shift ${percent(codeShift / 3)}; ${clipping}.`;
}
