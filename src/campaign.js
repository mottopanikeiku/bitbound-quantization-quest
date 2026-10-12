import {
  dot,
  evaluateCalibrated,
  kvCacheBytes,
  meanSquaredError,
  quantizeTensor,
  toyInference,
} from './quantization.js';

export const LESSONS = [
  {
    id: 0,
    place: 'Bitleaf Meadow',
    name: 'Nib',
    sprite: 'sprout',
    concept: 'Bits, rounding & storage',
    title: 'A smaller satchel, not a smaller promise',
    description: 'Nib has sixteen signal seeds and a very small satchel. Choose how many bits store each number, then inspect what survives the round trip.',
    dialogue: ['I packed every decimal. The satchel filed a complaint.', 'Can we keep the message and lose some luggage?'],
    goal: 'Keep mean squared reconstruction error at most 0.008 using at most 12 modeled bytes, including the scale.',
    hint: 'A code is not the original number. With scale 0.5 and zero-point 0, original 0.7 → code 1 → reconstruction 0.5. Try four bits: sixteen weights need 8 payload bytes plus a 4-byte scale. For Fine-detail practice, the stricter error target needs eight bits and allows 20 bytes.',
    takeaway: 'Precision and storage trade off. Count the scale, and inspect the reconstructed values—not just the bit count.',
    sourceIds: ['bits'],
    controls: [
      {
        key: 'bits', label: 'Detail levels · bits per value',
        help: 'Same sixteen numbers and range. More bits give a finer ruler but a larger ideal payload. This narrow symmetric ruler leaves one signed code unused.',
        options: [
          { value: 2, label: '2 bits', detail: '3 used levels · light but coarse' },
          { value: 4, label: '4 bits', detail: '15 used levels · middle ground' },
          { value: 8, label: '8 bits', detail: '255 used levels · more detail' },
        ],
      },
    ],
    initial: { bits: 2 },
    variants: [
      {
        id: 'fine-detail', label: 'Fine-detail courier',
        description: 'Practice variant: the same seeds carry a more delicate signal. The error target tightens and the satchel grows. The old four-bit recipe is no longer enough.',
        goal: 'Keep reconstruction MSE at most 0.00002 using at most 20 modeled bytes, including the scale.',
      },
    ],
    question: {
      prompt: 'A new courier has 32 four-bit values and one 4-byte scale. What is the modeled total, before other overhead?',
      options: [
        { label: '16 bytes', explanation: 'That counts only 32 × 4 / 8 = 16 payload bytes. The scale still needs four bytes.', correct: false },
        { label: '20 bytes', explanation: 'Yes: 16 bytes of ideal packed values + 4 bytes for the scale. This is not a browser-heap or whole-model measurement.', correct: true },
        { label: '128 bytes', explanation: 'That is the unquantized FP32 payload, 32 × 4 bytes. The proposed four-bit payload is smaller, but still has metadata.', correct: false },
      ],
    },
  },
  {
    id: 1,
    place: 'Offset Grove',
    name: 'Chime',
    sprite: 'crystal',
    concept: 'Symmetric & affine grids',
    title: 'Move zero, keep its meaning',
    description: 'Chime’s crystal notes lean toward positive values. Give them a centered ruler or an offset ruler, keeping four bits fixed.',
    dialogue: ['Zero is where I hang my hat. The door number can change.', 'Most of these notes live uphill. Shall we move the ruler?'],
    goal: 'Reconstruct the sixteen notes with MSE at most 0.04 within 13 modeled bytes, including scale and any zero-point.',
    hint: 'Compare the step sizes, not just the code signs. The affine ruler spends more levels on this shifted range. With scale 0.5 and zero-point 3, code 1 means −1 and code 3 means real zero.',
    takeaway: 'The zero-point is the code for real zero. Unsigned codes can represent negative values, and an offset grid can suit shifted data.',
    sourceIds: ['zero-point', 'bits'],
    controls: [
      {
        key: 'mode', label: 'Ruler placement · quantization scheme',
        help: 'Four bits in both cases. Symmetric uses signed −7…7; affine uses unsigned 0…15 with a fitted integer zero-point.',
        options: [
          { value: 'symmetric', label: 'Centered · symmetric', detail: 'Zero code = 0 · one scale' },
          { value: 'affine', label: 'Offset · affine', detail: 'Shifted zero code · scale + zero-point' },
        ],
      },
    ],
    initial: { mode: 'symmetric' },
    question: {
      prompt: 'A different unsigned ruler has scale 0.25 and zero-point 4. Which code reconstructs to −0.5?',
      options: [
        { label: 'Code −2', explanation: '−2 is the centered value before adding the zero-point, not an unsigned stored code. Add 4 to obtain the address.', correct: false },
        { label: 'Code 0', explanation: 'Code 0 reconstructs to 0.25 × (0 − 4) = −1. The zero-point is part of decoding.', correct: false },
        { label: 'Code 2', explanation: 'Exactly: 0.25 × (2 − 4) = −0.5. Code 4, not code 0, represents real zero.', correct: true },
      ],
    },
  },
  {
    id: 2,
    place: 'Calibration Cove',
    name: 'Brine',
    sprite: 'tide',
    concept: 'Calibration, clipping & shift',
    title: 'Choose a ruler for tomorrow’s tide',
    description: 'Brine has a calm archive and a mixed-weather archive. Fit a frozen four-bit ruler there, then try separate route readings. Repeated route results are practice feedback, not an untouched test.',
    dialogue: ['Yesterday was mostly drizzle. “Mostly” is doing heavy lifting.', 'My storm records are real. Whether to clip them depends on the route.'],
    goal: 'On the ordinary route, keep MSE at most 0.04 and clip none of the twelve practice readings.',
    hint: 'A calm archive cannot reveal the ±2.8 tides. Choose mixed weather, then compare full min/max against a ±3 cap. For Stormwatch practice, the near-±11 readings are important: retain the mixed archive’s full ±12 range instead.',
    takeaway: 'Calibration chooses the ruler; separate evaluation probes it. Clipping can help one workload and damage another.',
    sourceIds: ['calibration', 'bits'],
    controls: [
      {
        key: 'calibration', label: 'Weather archive · calibration data',
        help: 'Only this archive selects the scale. Route readings never enter the range calculation.',
        options: [
          { value: 'calm', label: 'Calm only', detail: 'Observed values within ±1' },
          { value: 'mixed', label: 'Mixed weather', detail: 'Typical tides, rare ±3, extreme ±12' },
        ],
      },
      {
        key: 'clipping', label: 'Range policy · fixed after calibration',
        help: 'The cap can shrink an observed range; it does not invent coverage absent from the archive.',
        options: [
          { value: 'minmax', label: 'Keep min/max', detail: 'Cover the largest archived magnitude' },
          { value: 'trim', label: 'Cap at ±3', detail: 'Finer spacing, but larger values clip' },
        ],
      },
    ],
    initial: { calibration: 'calm', clipping: 'minmax' },
    variants: [
      {
        id: 'storm', label: 'Stormwatch route',
        description: 'Practice variant: twelve new readings include important tides near ±11. The ordinary route’s ±3 cap now clips useful signals. This is a disclosed changed workload, not a random penalty.',
        goal: 'On Stormwatch, keep MSE at most 0.1 and clip none of the twelve practice readings.',
      },
    ],
    question: {
      prompt: 'A safety sensor now needs accurate readings near ±10, beyond a previously useful ±3 range. What should you do?',
      options: [
        { label: 'Revisit range selection and validate the new tail cases', explanation: 'Yes. Those readings now matter to the task. Recalibration, another clipping policy or more precision may be needed; the previous practice pass is not a guarantee.', correct: true },
        { label: 'Keep clipping: rare values are always noise', explanation: 'Rarity does not imply irrelevance. A rare safety-critical reading can be exactly the value the application must preserve.', correct: false },
        { label: 'Keep the range and collect more copies of calm data', explanation: 'More copies of easy cases do not reveal the missing range. Representativeness matters, not just sample count.', correct: false },
      ],
    },
  },
  {
    id: 3,
    place: 'Channel Heights',
    name: 'Spindle',
    sprite: 'moth',
    concept: 'Tensor, channel & group scales',
    title: 'Four wings, several rulers',
    description: 'Spindle’s four eight-thread wings have very different ranges. Split the four-bit rulers without filling the bag with scale spools.',
    dialogue: ['One blanket? For all these sizes?', 'Every extra ruler comes with a spool. I do not offer invisible pockets.'],
    goal: 'Keep all 32 weights at MSE at most 0.003 within 32 modeled bytes, including every scale.',
    hint: 'One shared scale is set by the ±7 wing and loses the tiny wing. One scale per row protects each range. Groups of four add even more scales—but their metadata counts against the same budget.',
    takeaway: 'Finer scales can protect small-range channels, but granularity changes metadata and kernel requirements—not just error.',
    sourceIds: ['granularity', 'bits'],
    controls: [
      {
        key: 'granularity', label: 'Sharing the ruler · granularity',
        help: 'Rows are output channels. Groups contain four consecutive values in row-major order; with eight values per row, no group crosses a row.',
        options: [
          { value: 'tensor', label: 'Whole tensor', detail: '1 ruler · 4 metadata bytes' },
          { value: 'channel', label: 'Per channel', detail: '4 rulers · 16 metadata bytes' },
          { value: 'group', label: 'Groups of 4', detail: '8 rulers · 32 metadata bytes' },
        ],
      },
    ],
    initial: { granularity: 'tensor' },
    question: {
      prompt: 'For a new tensor of 64 four-bit weights, you replace one FP32 scale with eight. What changes in this teaching format?',
      options: [
        { label: 'The value payload becomes eight times larger', explanation: 'The 64 weights still use four bits each. It is the number of scale records that changed, not the weight bit width.', correct: false },
        { label: 'Payload stays 32 B; scale metadata grows from 4 B to 32 B', explanation: 'Correct: 64 × 4 / 8 = 32 payload bytes, while eight 4-byte scales need 32 metadata bytes. Total rises from 36 to 64 bytes.', correct: true },
        { label: 'Nothing changes: scales are free', explanation: 'Scales must be represented somewhere. Their dtype and packing are format-dependent, but our declared FP32 scales cost four bytes each.', correct: false },
      ],
    },
  },
  {
    id: 4,
    place: 'Inference Forge',
    name: 'Cinder',
    sprite: 'ember',
    concept: 'Weights, activations & output error',
    title: 'Keep the message, not just the metal',
    description: 'Cinder’s two-output signal machine handles six eight-number messages. Quantize its learned weights and incoming activations separately, then run real toy dot products.',
    dialogue: ['Pretty ingots. Now let us see if the bell actually rings.', 'The recipe is weights. Today’s ingredients are activations.'],
    goal: 'Preserve all 6 reference classes with output MSE at most 0.01; use at most 16 B for weights + scales and 8 B of activation payload per input.',
    hint: 'Inspect the output, not just the weights. Two-bit inputs erase small but useful features; two-bit weights lose useful coefficients. Try W4 with A8. W8 exceeds the weight budget, while unquantized A32 exceeds the separate activation-payload budget.',
    takeaway: 'Weight and activation precision are separate. Test actual outputs: low weight MSE alone does not certify task quality.',
    sourceIds: ['weight-activation', 'integer-accumulators', 'ptq-qat'],
    controls: [
      {
        key: 'weightBits', label: 'Stored recipe · weight bits',
        help: 'Two output rows, one symmetric scale per row. The displayed storage ledger is for these weights only.',
        options: [
          { value: 2, label: 'W2', detail: 'Tiny coefficients can vanish' },
          { value: 4, label: 'W4', detail: '8 B payload + 8 B scales' },
          { value: 8, label: 'W8', detail: '16 B payload + 8 B scales' },
        ],
      },
      {
        key: 'activationBits', label: 'Incoming ingredients · activation precision',
        help: 'A2/A8 fits one dynamic scale per input. A32 means unquantized JS reference values, not emulated FP32 or FP16 arithmetic.',
        options: [
          { value: 2, label: 'A2', detail: '2 B payload per eight-value input' },
          { value: 8, label: 'A8', detail: '8 B payload per input + one scale' },
          { value: 32, label: 'A32 reference', detail: '32 B ideal FP32 payload; no QDQ' },
        ],
      },
    ],
    initial: { weightBits: 2, activationBits: 2 },
    question: {
      prompt: 'Two weight perturbations have equal MSE: (0.1, 0) and (0, 0.1). For input (100, 1), which output changes more?',
      options: [
        { label: 'They must change the output equally', explanation: 'Equal weight MSE does not account for which input multiplies the error. Output sensitivity depends on the input.', correct: false },
        { label: 'The second: its error is in the last weight', explanation: 'Position alone does not determine importance. Here the last input is only 1, while the first is 100.', correct: false },
        { label: 'The first: output changes by 10 instead of 0.1', explanation: 'Exactly: (0.1, 0) · (100, 1) = 10; (0, 0.1) · (100, 1) = 0.1. That is why we evaluate model outputs, not just weight error.', correct: true },
      ],
    },
  },
  {
    id: 5,
    place: 'Outlier Archives',
    name: 'Vesper',
    sprite: 'wisp',
    concept: 'Equivalent channel scaling',
    title: 'Balance the outlier pulley',
    description: 'One activation channel shouts while its weight whispers. Rescale the pair in opposite directions, then quantize both with four-bit grids. This two-channel mechanism analogy is not full SmoothQuant, GPTQ or AWQ.',
    dialogue: ['Please do not throw away the loud books. Some contain the ending.', 'I can lower one shelf—if the matching counterweight rises.'],
    goal: 'Preserve the unrounded two-channel product and keep output MSE at most 0.001 on six distinct practice inputs.',
    hint: 'The transformation is x₀/s and s·w₀. No scaling loses the quiet weight; too much scaling coarsens the first activation’s useful detail. Try factor 12, then compare factor 32. The data are deliberately small and grid-friendly, not evidence of a universal setting.',
    takeaway: 'Equivalent rescaling preserves the original computation before rounding. Quantization still introduces error, so balance both operands and evaluate.',
    sourceIds: ['smoothquant', 'gptq-awq', 'llm-int8', 'ptq-qat'],
    controls: [
      {
        key: 'factor', label: 'Pulley ratio · first-channel scaling',
        help: 'Divide activation channel 0 by this factor and multiply its matching weight by it. Channel 1 stays unchanged. A separate archive fixes the activation scale.',
        options: [
          { value: 1, label: '×1 · untouched', detail: 'Large activation, tiny weight' },
          { value: 4, label: '×4 · a little', detail: 'Some load moves to weights' },
          { value: 12, label: '×12 · balanced', detail: 'Comparable activation ranges' },
          { value: 32, label: '×32 · far across', detail: 'First activation becomes small' },
        ],
      },
    ],
    initial: { factor: 1 },
    question: {
      prompt: 'A new implementation divides one activation channel by 5 but forgets to multiply its matching weight by 5. What happens before any rounding?',
      options: [
        { label: 'That channel’s contribution is divided by 5', explanation: 'Right. The inverse weight transformation is essential. Without it, the unrounded model changes; this is not merely quantization error.', correct: true },
        { label: 'The output remains equivalent because values are smaller', explanation: 'Smaller values are not automatically equivalent values. Only matched inverse transformations cancel inside the product.', correct: false },
        { label: 'It becomes QAT and learns the missing factor', explanation: 'No optimizer or training update was specified. Rescaling is not QAT, and nothing automatically learns the omitted multiplication.', correct: false },
      ],
    },
  },
  {
    id: 6,
    place: 'Precision Spire',
    name: 'Auric',
    sprite: 'dragon',
    concept: 'Mixed precision & deployment planning',
    title: 'Light the beacon with a balanced pack',
    description: 'Pack a real 8→8→2 toy network: a sturdy backbone and a delicate output head. Separately budget a hypothetical transformer’s KV cache, then choose an honest validation plan.',
    dialogue: ['Other dragons hoard gold. I hoard rounding receipts.', 'Bring a small pack, a clear signal, and no imaginary benchmark.'],
    goal: 'Toy weights + scales ≤64 B, output MSE ≤0.0005, all 6 reference classes; separate KV payload ≤4 MiB, with real-model/device validation planned.',
    hint: 'The 64 backbone weights already lie on their four-bit grid; the 16 head weights contain small important differences. Try backbone 4 / head 8. An eight-bit KV estimate fits the separate paper budget, but select the plan that still checks cache/generation quality and profiles the real device.',
    takeaway: 'Allocate precision by sensitivity, count weights and cache separately, and validate the actual deployment. This toy does not test KV quality or device speed.',
    sourceIds: ['mixed-precision', 'kv-cache', 'deployment', 'fp8', 'nf4-qlora'],
    controls: [
      {
        key: 'backboneBits', label: 'Large compartment · backbone weights',
        help: '8 × 8 weights; one shared scale. Hidden values use ReLU and unquantized JS reference arithmetic.',
        options: [
          { value: 4, label: '4-bit backbone', detail: '32 B payload + 4 B scale' },
          { value: 8, label: '8-bit backbone', detail: '64 B payload + 4 B scale' },
        ],
      },
      {
        key: 'headBits', label: 'Sensitive compartment · output head',
        help: '2 × 8 weights; one scale per output row. Small opposing coefficients distinguish the two classes.',
        options: [
          { value: 4, label: '4-bit head', detail: '8 B payload + 8 B scales' },
          { value: 8, label: '8-bit head', detail: '16 B payload + 8 B scales' },
        ],
      },
      {
        key: 'deployment', label: 'Separate transformer · cache and validation plan',
        help: '12 layers, 1,024 tokens, 4 KV heads, dimension 32, batch 1. Cache figures are payload estimates only. Selecting a plan does not execute a benchmark or validate cache quality.',
        options: [
          { value: 'kv16', label: '16-bit KV estimate', detail: '6 MiB payload · checking not planned' },
          { value: 'kv8', label: '8-bit KV estimate', detail: '3 MiB payload · checking not planned' },
          { value: 'kv8-validate', label: '8-bit KV + validation plan', detail: 'Check quality, kernel support and real-device performance' },
        ],
      },
    ],
    initial: { backboneBits: 8, headBits: 4, deployment: 'kv16' },
    question: {
      prompt: 'Your separate transformer plan doubles cached tokens from 1,024 to 2,048 at eight bits. What can this game actually conclude?',
      options: [
        { label: 'The cache stays 3 MiB because the weights are four-bit', explanation: 'Weights and cached activations are separate. Doubling retained tokens doubles this ideal cache payload even when every weight stays unchanged.', correct: false },
        { label: 'KV payload becomes 6 MiB; generation quality and device performance still need real checks', explanation: 'Correct. The payload formula doubles, exceeding the 4 MiB paper budget. No cache quantizer, attention, generation or target-device benchmark ran here, so their quality and speed remain untested.', correct: true },
        { label: 'The cache becomes 6 MiB, proving generation remains accurate', explanation: 'The byte calculation is right, but it proves nothing about numerical attention error or long-context task quality. Those require the actual quantized model and runtime.', correct: false },
      ],
    },
  },
];

const MEADOW_WEIGHTS = [-1, -0.9, -0.75, -0.6, -0.35, -0.2, -0.1, 0, 0.1, 0.2, 0.35, 0.6, 0.75, 0.9, 1, 0.5];
const GROVE_WEIGHTS = [-1, -0.8, -0.3, 0, 0.4, 0.8, 1.4, 2, 2.6, 3, 3.6, 4.2, 4.8, 5.6, 6.4, 7];
const TIDE_ARCHIVES = {
  calm: [-1, -0.8, -0.6, -0.3, 0, 0.2, 0.6, 1],
  mixed: [-12, -3, -2.6, -1, -0.7, -0.3, 0, 0.4, 0.9, 2.5, 3, 12],
};
const TIDE_ROUTES = {
  base: [-0.9, -0.7, -0.45, -0.2, 0.1, 0.35, 0.55, 0.85, -2.7, 2.8, -2.4, 2.6],
  storm: [-11.6, -10.2, -8.4, -6.6, -3.5, -1.8, 1.6, 3.6, 6.7, 8.6, 10.5, 11.4],
};
const WING_WEIGHTS = [
  [-0.08, -0.06, -0.035, -0.012, 0.009, 0.03, 0.055, 0.08],
  [-0.9, -0.72, -0.4, -0.12, 0.1, 0.38, 0.7, 0.9],
  [-7, -5, -3, -1, 1, 3, 5, 7],
  [-2.1, -1.5, -0.9, -0.3, 0.3, 0.9, 1.5, 2.1],
];
const FORGE_WEIGHTS = [
  [1, 0.6, -0.5, 0.3, -0.7, 0.2, 0.4, -0.1],
  [-0.4, 1, 0.3, -0.6, 0.2, -0.8, 0.1, 0.5],
];
const FORGE_INPUTS = [
  [1, 0.2, -0.3, 0.1, -0.4, 0.2, 0.1, -0.2],
  [0.1, 1, 0.2, -0.2, 0.1, -0.4, 0.2, 0.3],
  [-0.3, 0.4, 1, 0.2, 0.3, -0.1, 0.2, 0.1],
  [0.2, -0.3, 0.1, 1, 0.4, 0.2, -0.1, 0.2],
  [0.3, 0.1, -0.2, 0.4, 1, 0.2, 0.3, -0.1],
  [-0.2, 0.3, 0.2, -0.1, 0.2, 1, 0.4, 0.1],
];
const ARCHIVE_WEIGHTS = [0.035, 0.98];
const ARCHIVE_CALIBRATION = [[-12, 1], [-6, -0.5], [0, 0.25], [6, 0.5], [12, -1]];
const ARCHIVE_INPUTS = [
  [-72 / 7, -5 / 7], [-36 / 7, 3 / 7], [-12 / 7, 1 / 7],
  [24 / 7, -2 / 7], [60 / 7, 4 / 7], [72 / 7, -6 / 7],
];
const SPIRE_BACKBONE = [
  [7, 0, 0, 0, 0, 0, 0, 0],
  [0, 7, 1, 0, 0, 0, 0, 0],
  [0, 1, 7, 0, 0, 0, 0, 0],
  [0, 0, 0, 7, -1, 0, 0, 0],
  [0, 0, 0, -1, 7, 0, 0, 0],
  [0, 0, 0, 0, 0, 7, 1, 0],
  [0, 0, 0, 0, 0, 1, 7, 0],
  [0, 0, 0, 0, 0, 0, 0, 7],
];
const SPIRE_HEAD = [
  [1, 0.06, -0.06, 0.04, -0.04, 0.03, -0.03, 0.02],
  [1, -0.06, 0.06, -0.04, 0.04, -0.03, 0.03, -0.02],
];
const SPIRE_INPUTS = [
  [0.2, 1, 0, 0.1, 0, 0, 0.1, 0],
  [0.2, 0, 1, 0, 0.1, 0.1, 0, 0],
  [0.1, 0, 0, 1, 0.2, 0, 0, 0.1],
  [0.1, 0, 0, 0.2, 1, 0, 0, 0.1],
  [0.3, 0.1, 0, 0, 0, 1, 0.1, 0.2],
  [0.3, 0, 0.1, 0, 0, 0.1, 1, -0.2],
];

function format(value, digits = 6) {
  if (value !== 0 && Math.abs(value) < 0.000001) return value.toExponential(2);
  return String(Number(value.toFixed(digits)));
}

function vector(values) {
  return `[${values.map(value => format(value)).join(', ')}]`;
}

function matrix(rows) {
  return rows.map(row => vector(row)).join('\n');
}

function check(label, value, target, ok) {
  return { label, value, target, ok };
}

function result(tensor, { checks, feedback, insight, chartLabel, extras, math }) {
  return {
    passed: checks.every(item => item.ok),
    checks,
    feedback,
    insight,
    points: tensor.points.map(point => point.group === undefined ? { ...point, group: 0 } : point),
    params: tensor.params,
    storage: tensor.storage,
    chartLabel,
    extras,
    math,
  };
}

function rulerMath(tensor) {
  return tensor.params.map((p, index) =>
    `Ruler ${index + 1}: scale=${format(p.scale)}, z=${p.zero}, codes=${p.qmin}…${p.qmax}, interval=[${format(p.min)}, ${format(p.max)}]`
  ).join('\n');
}

function workedPoint(point) {
  return `Original ${format(point.value)} → stored code ${point.code} → reconstruction ${format(point.reconstructed)}; error ${format(point.error)}`;
}

function meadow(config, variant) {
  const bits = Number(config.bits);
  const fine = variant === 'fine-detail';
  const targetMse = fine ? 0.00002 : 0.008;
  const budget = fine ? 20 : 12;
  const q = quantizeTensor([MEADOW_WEIGHTS], { bits });
  const quality = q.mse <= targetMse;
  const fits = q.storage.total <= budget;
  const feedback = !quality
    ? `The ${bits}-bit ruler merges too much detail: MSE ${format(q.mse)} exceeds ${format(targetMse)}. Try more levels${fine ? '; the Fine-detail satchel now allows eight bits' : ' without jumping past the 12-byte satchel'}.`
    : !fits
      ? `The signal is clear, but ${q.storage.total} B exceeds the ${budget} B satchel. Reduce payload while preserving the error target; the scale still costs 4 B.`
      : `Nib’s satchel closes: ${q.storage.payload} B of values + ${q.storage.metadata} B of scale, with MSE ${format(q.mse)}. ${fine ? 'The new quality requirement genuinely needed a finer grid.' : 'You kept useful detail without buying the largest grid.'}`;
  return result(q, {
    checks: [
      check('Reconstruction MSE', format(q.mse), `≤ ${format(targetMse)}`, quality),
      check('Modeled tensor total', `${q.storage.total} B`, `≤ ${budget} B, including scale`, fits),
    ],
    feedback,
    insight: 'These are ideal packed bytes plus declared metadata, not JavaScript heap memory. More bits can reduce error; fewer bits can reduce storage. Neither measures device speed.',
    chartLabel: `Sixteen signal seeds · ${bits}-bit QDQ${fine ? ' · Fine-detail practice' : ''}`,
    extras: [
      { label: 'Used symmetric levels', value: `${2 ** bits - 1} of ${2 ** bits} available bit patterns` },
      { label: 'FP32 reference payload', value: '64 B (16 × 4 B), before any other overhead' },
      { label: 'Worked seed', value: workedPoint(q.points[10]) },
      { label: 'Practice status', value: fine ? 'Changed quality/budget scenario; not a generalization test' : 'Deterministic finite tensor; not a model-quality benchmark' },
    ],
    math: `q = clamp(roundEven(x / scale), qmin, qmax)\nx_hat = scale × q\n${rulerMath(q)}\n${workedPoint(q.points[10])}\nMSE = sum(error²) / 16 = ${format(q.mse)}\nPayload = ceil(16 × ${bits} / 8) = ${q.storage.payload} B\nMetadata = 1 FP32 scale = 4 B\nTotal = ${q.storage.total} B\nFull signed storage includes an extra negative code; this narrow symmetric quantizer leaves it unused.`,
  });
}

function grove(config) {
  const q = quantizeTensor([GROVE_WEIGHTS], { bits: 4, mode: config.mode });
  const p = q.params[0];
  const quality = q.mse <= 0.04;
  return result(q, {
    checks: [
      check('Reconstruction MSE', format(q.mse), '≤ 0.04', quality),
      check('Modeled tensor total', `${q.storage.total} B`, '≤ 13 B, including metadata', q.storage.total <= 13),
    ],
    feedback: quality
      ? `Chime’s uphill notes fit a finer grid: scale ${format(p.scale)}, zero stored as code ${p.zero}. The zero-point costs one metadata byte; its integer rounding also nudges the endpoints.`
      : `The centered ruler spends much of its range below these mostly positive notes. Its step is ${format(p.scale)} and MSE is ${format(q.mse)}. Try shifting the zero-point with the affine option.`,
    insight: 'Unsigned is a property of the stored codes, not the reconstructed signs. Affine helps this distribution, not every distribution. “Outside range” uses the final zero-aligned endpoints.',
    chartLabel: `Sixteen shifted notes · ${config.mode} 4-bit QDQ`,
    extras: [
      { label: 'Code for real zero', value: `${p.zero} → ${format(p.scale * (p.zero - p.zero))}` },
      { label: 'Observed data range', value: '−1 to 7' },
      { label: 'Final reconstruction interval', value: `${format(p.min)} to ${format(p.max)}` },
      { label: 'Outside final interval', value: `${q.clipped} / 16 (rounded zero-point can nudge an endpoint)` },
      { label: 'Metadata convention', value: config.mode === 'affine' ? '4 B FP32 scale + 1 B zero-point' : '4 B FP32 scale; zero-point 0 is implicit' },
    ],
    math: `Observed a = −1, b = 7\n${config.mode === 'affine' ? 'Affine: scale = (b − a) / 15; z = clamp(roundEven(−a / scale), 0, 15)' : 'Narrow symmetric: scale = max(abs(values)) / 7; z = 0'}\n${rulerMath(q)}\nq = clamp(roundEven(x / scale) + z, qmin, qmax)\nx_hat = scale × (q − z)\n${workedPoint(q.points[3])}\n${workedPoint(q.points[0])}\nMSE = sum(error²) / 16 = ${format(q.mse)}\nTotal = ${q.storage.payload} B payload + ${q.storage.metadata} B metadata = ${q.storage.total} B`,
  });
}

function cove(config, variant) {
  const calibration = TIDE_ARCHIVES[config.calibration];
  const inputs = TIDE_ROUTES[variant];
  const storm = variant === 'storm';
  const observed = Math.max(...calibration.map(Math.abs));
  const range = config.clipping === 'trim' ? Math.min(observed, 3) : observed;
  const options = { bits: 4, range };
  const q = evaluateCalibrated(inputs, calibration, options);
  const archive = evaluateCalibrated(calibration, calibration, options);
  const future = storm ? [-18, 18] : [-9, 9];
  const shifted = evaluateCalibrated(future, calibration, options);
  const targetMse = storm ? 0.1 : 0.04;
  const coverage = q.clipped === 0;
  const quality = q.mse <= targetMse;
  let feedback;
  if (!coverage) {
    feedback = config.calibration === 'calm'
      ? `The calm archive fixes the range at ±${format(range)}, so ${q.clipped} route readings fall outside it. Include mixed weather before deciding which tails can be clipped.`
      : `The ±${format(range)} cap clips ${q.clipped} important ${storm ? 'Stormwatch' : 'route'} readings. These tails are part of this workload; compare the full mixed-weather range.`;
  } else if (!quality) {
    feedback = `Coverage is good, but the ${format(q.params[0].scale)} step is too coarse: MSE ${format(q.mse)} exceeds ${format(targetMse)}. For this ordinary route, compare the ±3 cap and inspect what it sacrifices in the archive.`;
  } else {
    feedback = storm
      ? `Brine keeps the storm in the story: ±${format(range)} covers the new tails with MSE ${format(q.mse)}. The old ±3 cap was useful on a different route, not universally correct.`
      : `The ordinary route passes at MSE ${format(q.mse)} with no clipped readings. This policy deliberately clips ${archive.clipped} archived extremes; it would be unsuitable if those extremes became important deployment inputs.`;
  }
  return result(q, {
    checks: [
      check('Route reconstruction MSE', format(q.mse), `≤ ${format(targetMse)}`, quality),
      check('Route readings outside range', `${q.clipped} / ${inputs.length}`, '0 clipped readings', coverage),
    ],
    feedback,
    insight: 'The archive fits the ruler; the disjoint route supplies practice feedback. Repeatedly choosing settings from these results is tuning, not untouched held-out certification. The future probe is deliberately unscored.',
    chartLabel: `${storm ? 'Stormwatch' : 'Ordinary'} route · twelve held-apart practice readings`,
    extras: [
      { label: 'Calibration archive', value: `${config.calibration} · observed magnitude ${observed} · fitted limit ±${format(range)}` },
      { label: 'Calibration MSE / clipping', value: `${format(archive.mse)} / ${archive.clipped} of ${calibration.length} values outside range` },
      { label: 'Further-shift probe (not scored)', value: `${vector(future)} → ${vector(shifted.reconstructed)}; ${shifted.clipped} clipped` },
      { label: 'Displayed storage basis', value: 'Twelve practice activation values + one scale; not whole-model memory' },
    ],
    math: `Calibration only: ${vector(calibration)}\nRoute, not used to fit scale: ${vector(inputs)}\nObserved A = ${observed}; chosen range = ${config.clipping === 'trim' ? 'min(A, 3)' : 'A'} = ${format(range)}\n${rulerMath(q)}\n${workedPoint(q.points[inputs.length - 1])}\nRoute MSE = sum(error²) / ${inputs.length} = ${format(q.mse)}\nRoute outside-range count = ${q.clipped}\nFurther shift ${vector(future)}: MSE ${format(shifted.mse)}, ${shifted.clipped} clipped (not scored)\nAll three evaluations reuse the same calibration-derived parameters. Replays are practice, not fresh independent tests.`,
  });
}

function heights(config) {
  const q = quantizeTensor(WING_WEIGHTS, { bits: 4, granularity: config.granularity, groupSize: 4 });
  const quality = q.mse <= 0.003;
  const fits = q.storage.total <= 32;
  const smallMse = meanSquaredError(WING_WEIGHTS[0], q.reconstructedRows[0]);
  const feedback = !quality
    ? `One shared scale follows the ±7 wing and loses the smaller wings. Total MSE ${format(q.mse)} is too high. Try a separate ruler for each output-channel row.`
    : !fits
      ? `The threads look good, but ${q.params.length} scale spools cost ${q.storage.metadata} B. With ${q.storage.payload} B of values, ${q.storage.total} B exceeds the 32 B bag. Share within each channel instead of each four-thread group.`
      : `Spindle unfolds all four wings: ${q.params.length} rulers protect their different ranges, and ${q.storage.payload} B + ${q.storage.metadata} B exactly fits the modeled bag.`;
  return result(q, {
    checks: [
      check('Weight reconstruction MSE', format(q.mse), '≤ 0.003', quality),
      check('Modeled weight total', `${q.storage.total} B`, '≤ 32 B, including every scale', fits),
    ],
    feedback,
    insight: 'The payload stays fixed when granularity changes. Scale count, metadata and supported kernel layouts do not. A channel means one row here, not one value.',
    chartLabel: 'Four output channels · eight weights per wing',
    extras: [
      { label: 'Channel magnitudes', value: '0.08 / 0.9 / 7 / 2.1' },
      { label: 'Smallest-wing MSE', value: format(smallMse) },
      { label: 'Rulers and metadata', value: `${q.params.length} × 4 B = ${q.storage.metadata} B` },
      { label: 'Ideal weight payload', value: `${q.storage.payload} B for every granularity option` },
    ],
    math: `Original rows (output channels):\n${matrix(WING_WEIGHTS)}\n${rulerMath(q)}\n${workedPoint(q.points[2])}\nMSE = sum(error²) / 32 = ${format(q.mse)}\nPayload = ceil(32 × 4 / 8) = 16 B\nMetadata = ${q.params.length} FP32 scales × 4 = ${q.storage.metadata} B\nModeled total = ${q.storage.total} B\nGroups are row-major blocks of four; all row lengths are divisible by four.`,
  });
}

function forge(config) {
  const weightBits = Number(config.weightBits);
  const activationBits = Number(config.activationBits);
  const q = toyInference(FORGE_WEIGHTS, FORGE_INPUTS, { weightBits, activationBits });
  const activationPayload = Math.ceil(8 * activationBits / 8);
  const activationMetadata = activationBits === 32 ? 0 : 4;
  const classOk = q.agreement === q.total;
  const quality = q.outputMse <= 0.01;
  const weightsFit = q.storage.total <= 16;
  const activationsFit = activationPayload <= 8;
  const example = FORGE_INPUTS[4];
  const exampleActivation = activationBits === 32 ? example : quantizeTensor([example], { bits: activationBits }).reconstructed;
  let feedback;
  if (!quality || !classOk) {
    feedback = activationBits === 2
      ? `The two-bit activation grid erases small ingredients before the dot products. Output MSE is ${format(q.outputMse)} and only ${q.agreement}/${q.total} reference classes agree. Try A8; better weights alone cannot restore erased inputs.`
      : `The ${weightBits}-bit weight recipe loses useful coefficients: output MSE ${format(q.outputMse)}, agreement ${q.agreement}/${q.total}. Increase weight detail while keeping the separate weight budget in view.`;
  } else if (!weightsFit) {
    feedback = `The outputs survive, but weight payload plus two scales is ${q.storage.total} B, above 16 B. Try W4 before paying for W8 everywhere.`;
  } else if (!activationsFit) {
    feedback = `The outputs survive, but the A32 reference needs ${activationPayload} ideal payload bytes per input, above 8 B. Try dynamic A8 and rerun; its scale is reported separately.`;
  } else {
    feedback = `Cinder’s signal rings true: ${q.agreement}/${q.total} reference classes agree, output MSE ${format(q.outputMse)}. The recipe uses ${q.storage.total} B, and each input uses ${activationPayload} B of activation payload plus its ${activationMetadata} B scale.`;
  }
  return result(q, {
    checks: [
      check('Reference class agreement', `${q.agreement} / ${q.total}`, '6 / 6, not ground-truth accuracy', classOk),
      check('Toy output MSE', format(q.outputMse), '≤ 0.01', quality),
      check('Modeled weight total', `${q.storage.total} B`, '≤ 16 B, including 2 scales', weightsFit),
      check('Activation payload / input', `${activationPayload} B`, '≤ 8 B; scale reported separately', activationsFit),
    ],
    feedback,
    insight: 'These are real QDQ operands and dot products in JavaScript, not integer hardware inference. Class agreement compares with this toy’s reference, not labeled task accuracy. A32 is unquantized reference arithmetic, never A16.',
    chartLabel: `Two weight rows · W${weightBits} with A${activationBits} inputs`,
    extras: [
      { label: 'Weight reconstruction MSE', value: `${format(q.mse)} (not the output error)` },
      { label: 'Reference → actual classes', value: q.predictions.map((p, i) => `${i + 1}: ${p.reference}→${p.actual}`).join(' · ') },
      { label: 'One-input activation ledger', value: `${activationPayload} B ideal payload + ${activationMetadata} B dynamic-scale metadata; separate from weight store` },
      { label: 'Input 5 outputs', value: `reference ${vector(q.reference[4])} → QDQ ${vector(q.actual[4])}` },
      { label: 'Accumulator / execution', value: 'JS floating-point sums; no INT32 overflow or requantization emulated' },
    ],
    math: `Full weight rows:\n${matrix(FORGE_WEIGHTS)}\nReconstructed W${weightBits} rows:\n${matrix(q.reconstructedRows)}\nAll six practice inputs:\n${matrix(FORGE_INPUTS)}\nInput 5 original: ${vector(example)}\nInput 5 A${activationBits}: ${vector(exampleActivation)}\ny_j = sum(W[j,i] × x[i]); actual uses reconstructed weights and selected activations\nInput 5 reference outputs: ${vector(q.reference[4])}\nInput 5 actual outputs: ${vector(q.actual[4])}\nOutput MSE over 12 outputs = ${format(q.outputMse)}\nArgmax picks the first class on a tie. Agreement = ${q.agreement}/${q.total}\n${rulerMath(q)}\nWeight storage = ${q.storage.payload} + ${q.storage.metadata} = ${q.storage.total} B\nActivation payload for one 8-value input = ${activationPayload} B; extra scale = ${activationMetadata} B\nA32 is a reference label with an ideal FP32 payload estimate, not FP32-rounded JS execution.`,
  });
}

function archives(config) {
  const factor = Number(config.factor);
  const scaledWeights = [ARCHIVE_WEIGHTS[0] * factor, ARCHIVE_WEIGHTS[1]];
  const scaledCalibration = ARCHIVE_CALIBRATION.map(([a, b]) => [a / factor, b]);
  const scaledInputs = ARCHIVE_INPUTS.map(([a, b]) => [a / factor, b]);
  const weights = quantizeTensor([scaledWeights], { bits: 4 });
  const q = evaluateCalibrated(scaledInputs.flat(), scaledCalibration.flat(), { bits: 4 });
  const reference = ARCHIVE_INPUTS.map(input => dot(ARCHIVE_WEIGHTS, input));
  const transformed = scaledInputs.map(input => dot(scaledWeights, input));
  const actual = scaledInputs.map((_, index) => dot(weights.reconstructed, q.reconstructed.slice(index * 2, index * 2 + 2)));
  const outputMse = meanSquaredError(reference, actual);
  const identityError = Math.max(...reference.map((value, index) => Math.abs(value - transformed[index])));
  const identityOk = identityError <= 1e-12;
  const quality = outputMse <= 0.001;
  let feedback;
  if (!identityOk) {
    feedback = `The inverse transformation changed the unrounded output by ${format(identityError)}. Both sides must use the same positive factor: x₀/s and s·w₀.`;
  } else if (!quality) {
    feedback = factor === 1
      ? `The small first weight reconstructs to ${format(weights.reconstructed[0])}, and the shared activation step is ${format(q.params[0].scale)}. Useful contributions disappear. Move some range from the loud activation into its matching weight.`
      : factor === 32
        ? `The identity is still intact before rounding, but the first activation is now small relative to the shared grid. Output MSE ${format(outputMse)} misses 0.001. Compare a less extreme factor rather than assuming more scaling always helps.`
        : `The original product is preserved, but the second activation still shares a coarse ${format(q.params[0].scale)} step. Rounded output MSE is ${format(outputMse)}. Try balancing the channel ranges more closely.`;
  } else {
    feedback = `Vesper keeps every chapter: the unrounded identity holds and actual rounded output MSE is ${format(outputMse)}. This factor suits these crafted practice values; it is not a universal SmoothQuant setting.`;
  }
  return result(q, {
    checks: [
      check('Unrounded identity drift', format(identityError), '≤ 1e−12 (JS rounding tolerance)', identityOk),
      check('Toy output MSE', format(outputMse), '≤ 0.001 on 6 practice inputs', quality),
    ],
    feedback,
    insight: 'This is a two-channel rescaling analogy with real four-bit QDQ, not full SmoothQuant/GPTQ/AWQ. There is no training or scripted method bonus. Repeated practice inputs are not independent generalization evidence.',
    chartLabel: `Scaled practice activations · paired channels · factor ${factor}`,
    extras: [
      { label: 'Weight transformation', value: `${vector(ARCHIVE_WEIGHTS)} → ${vector(scaledWeights)} → QDQ ${vector(weights.reconstructed)}` },
      { label: 'Activation / weight step', value: `${format(q.params[0].scale)} / ${format(weights.params[0].scale)}` },
      { label: 'Reference outputs', value: vector(reference) },
      { label: 'Rounded outputs', value: vector(actual) },
      { label: 'Displayed storage basis', value: `${q.storage.total} B = all 12 plotted practice activation values + one scale; not peak runtime memory` },
      { label: 'Separate weight store', value: `${weights.storage.payload} B payload + ${weights.storage.metadata} B scale = ${weights.storage.total} B` },
      { label: 'Single-input activation payload', value: '1 B for two 4-bit values; the shared static scale is separate' },
    ],
    math: `Original weights: ${vector(ARCHIVE_WEIGHTS)}\nOriginal calibration records:\n${matrix(ARCHIVE_CALIBRATION)}\nDistinct practice inputs:\n${matrix(ARCHIVE_INPUTS)}\nx′ = [x₀/${factor}, x₁]; w′ = [${factor}×w₀, w₁]\nw·x = w′·x′ before rounding (maximum JS difference ${format(identityError)})\nScaled weights: ${vector(scaledWeights)}\nWeight QDQ: ${vector(weights.reconstructed)}\nActivation parameters fit ONLY from transformed calibration records:\n${rulerMath(q)}\nWeight parameters:\n${rulerMath(weights)}\nReference y: ${vector(reference)}\nUnrounded transformed y: ${vector(transformed)}\nActual y = QDQ(w′)·QDQ(x′): ${vector(actual)}\nOutput MSE = sum((actual − reference)²) / 6 = ${format(outputMse)}\nThe deliberately grid-friendly data illustrate the mechanism, not a measured LLM result.`,
  });
}

function twoLayer(backbone, head, inputs) {
  const hidden = inputs.map(input => backbone.map(row => Math.max(0, dot(row, input))));
  const outputs = hidden.map(input => head.map(row => dot(row, input)));
  return { hidden, outputs };
}

function winner(outputs) {
  return outputs.indexOf(Math.max(...outputs));
}

function spire(config) {
  const backboneBits = Number(config.backboneBits);
  const headBits = Number(config.headBits);
  const backbone = quantizeTensor(SPIRE_BACKBONE, { bits: backboneBits });
  const head = quantizeTensor(SPIRE_HEAD, { bits: headBits, granularity: 'channel' });
  const reference = twoLayer(SPIRE_BACKBONE, SPIRE_HEAD, SPIRE_INPUTS);
  const actual = twoLayer(backbone.reconstructedRows, head.reconstructedRows, SPIRE_INPUTS);
  const outputMse = meanSquaredError(reference.outputs.flat(), actual.outputs.flat());
  const agreement = reference.outputs.filter((row, index) => winner(row) === winner(actual.outputs[index])).length;
  const storage = {
    payload: backbone.storage.payload + head.storage.payload,
    metadata: backbone.storage.metadata + head.storage.metadata,
    total: backbone.storage.total + head.storage.total,
  };
  const combined = {
    points: [...backbone.points, ...head.points.map(point => ({ ...point, group: point.group + backbone.params.length }))],
    params: [...backbone.params, ...head.params],
    storage,
  };
  const cacheBits = config.deployment === 'kv16' ? 16 : 8;
  const cacheBytes = kvCacheBytes({ layers: 12, tokens: 1024, kvHeads: 4, headDim: 32, bits: cacheBits });
  const cacheMib = cacheBytes / (1024 * 1024);
  const quality = outputMse <= 0.0005;
  const classOk = agreement === SPIRE_INPUTS.length;
  const fits = storage.total <= 64;
  const cacheFits = cacheBytes <= 4 * 1024 * 1024;
  const validationPlanned = config.deployment === 'kv8-validate';
  let feedback;
  if (!quality || !classOk) {
    feedback = `The ${headBits}-bit head loses sensitive differences: toy output MSE ${format(outputMse)}, class agreement ${agreement}/6. Give the small head more precision before widening the sturdy backbone.`;
  } else if (!fits) {
    feedback = `The signal survives, but the toy weight store is ${storage.total} B, over 64 B. Its 64 backbone weights were built on the four-bit grid; reserve the higher precision for the smaller head.`;
  } else if (!cacheFits) {
    feedback = `The toy model fits, but the separate ${cacheBits}-bit KV estimate is ${format(cacheMib)} MiB, above the 4 MiB payload cap. An eight-bit estimate reduces this ledger, not proof of preserved cache or generation quality.`;
  } else if (!validationPlanned) {
    feedback = 'The toy and paper memory checks pass. A small payload is not a deployment result: select a plan to check real kernel support, KV/generation quality and target-device latency/peak memory.';
  } else {
    feedback = `Auric lights the beacon: the ${backboneBits}/${headBits}-bit toy uses ${storage.total} B and preserves ${agreement}/6 reference classes. The separate KV payload estimate is ${format(cacheMib)} MiB. Your validation plan is accepted—not executed; KV/generation quality, device support and speed remain untested.`;
  }
  return result(combined, {
    checks: [
      check('Modeled toy weight total', `${storage.total} B`, '≤ 64 B, including 3 scales', fits),
      check('Two-layer output MSE', format(outputMse), '≤ 0.0005', quality),
      check('Reference class agreement', `${agreement} / 6`, '6 / 6, not labeled task accuracy', classOk),
      check('Separate KV payload estimate', `${format(cacheMib)} MiB`, '≤ 4 MiB, metadata excluded', cacheFits),
      check('Real validation plan', validationPlanned ? 'Planned, not performed' : 'Not yet planned', 'Quality + support + device profiling planned', validationPlanned),
    ],
    feedback,
    insight: 'Two separate exercises: actual 8→8→2 toy inference, and payload arithmetic for a hypothetical 12-layer transformer cache. No cache quantizer, attention, generation or benchmark runs here. Real KV quality and performance still require validation.',
    chartLabel: `Mixed weights · 64 backbone at ${backboneBits} bits + 16 head at ${headBits} bits`,
    extras: [
      { label: 'Backbone storage', value: `${backbone.storage.payload} B payload + ${backbone.storage.metadata} B scale = ${backbone.storage.total} B` },
      { label: 'Head storage', value: `${head.storage.payload} B payload + ${head.storage.metadata} B scales = ${head.storage.total} B` },
      { label: 'Reference → actual classes', value: reference.outputs.map((row, index) => `${index + 1}: ${winner(row)}→${winner(actual.outputs[index])}`).join(' · ') },
      { label: 'First input outputs', value: `${vector(reference.outputs[0])} → ${vector(actual.outputs[0])}` },
      { label: 'Separate KV ledger', value: `${cacheBytes.toLocaleString('en-US')} B = ${format(cacheMib)} MiB ideal payload; no metadata, residual buffer or allocator overhead` },
      { label: 'If context doubles (not scored)', value: `${format(2 * cacheMib)} MiB KV payload at 2,048 tokens; toy weight storage unchanged` },
      { label: 'Still untested', value: 'Real task + KV/generation quality, kernel support, latency, throughput and peak runtime memory' },
    ],
    math: `Unquantized 8 × 8 backbone Wb:\n${matrix(SPIRE_BACKBONE)}\nUnquantized 2 × 8 head Wh:\n${matrix(SPIRE_HEAD)}\nSix practice inputs:\n${matrix(SPIRE_INPUTS)}\nReference h = ReLU(Wb·x); reference y = Wh·h\nActual h = ReLU(QDQ_${backboneBits}(Wb)·x)\nActual y = QDQ_${headBits}(Wh)·actual_h\nNo biases. Inputs/hidden activations remain unquantized JS reference values, not A16.\nFirst reference hidden: ${vector(reference.hidden[0])}\nFirst actual hidden: ${vector(actual.hidden[0])}\nFirst reference output: ${vector(reference.outputs[0])}\nFirst actual output: ${vector(actual.outputs[0])}\nOutput MSE over 12 outputs = ${format(outputMse)}\nClass argmax breaks ties toward class 0; agreement ${agreement}/6\n${rulerMath(combined)}\nToy storage = ceil(64×${backboneBits}/8) + ceil(16×${headBits}/8) + 3×4 = ${storage.total} B\n\nSEPARATE transformer cache estimate (not part of the 8→8→2 model):\nKV bytes = 2 × layers × tokens × KV_heads × head_dim × batch × bits/8\n= 2 × 12 × 1024 × 4 × 32 × 1 × ${cacheBits}/8 = ${cacheBytes} B = ${format(cacheMib)} MiB\nUse KV heads, not query heads. 1 MiB = 1024² bytes.\nScales, alignment, residual buffers and all other memory are excluded.\nEight-bit KV quality, attention/generation behavior and real-device performance are NOT simulated or verified. Selecting the plan merely commits to checking them.`,
  });
}

export function evaluateEncounter(id, config = {}, variant = 'base') {
  const index = Number(id);
  const lesson = LESSONS[index];
  if (!lesson) throw new RangeError(`Unknown encounter: ${id}`);
  if (variant !== 'base' && !lesson.variants?.some(item => item.id === variant)) {
    throw new RangeError(`Unknown practice variant ${variant} for encounter ${id}`);
  }
  const selection = { ...lesson.initial, ...config };
  switch (index) {
    case 0: return meadow(selection, variant);
    case 1: return grove(selection);
    case 2: return cove(selection, variant);
    case 3: return heights(selection);
    case 4: return forge(selection);
    case 5: return archives(selection);
    case 6: return spire(selection);
    default: throw new RangeError(`Unknown encounter: ${id}`);
  }
}
