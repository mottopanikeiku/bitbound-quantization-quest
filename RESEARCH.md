# Quantization and game systems

The numerical core is [src/quantization.js](src/quantization.js). [buildSpell](src/battle/spell.js) turns a player's grid choices into reconstructed values, packet bytes, fidelity and damage. The lesson diagrams use the same arithmetic as battles.

## Grids and reconstruction

```text
symmetric (narrow):  qmax = 2^(b−1) − 1,  s = r / qmax
                     q = clamp(roundEven(x / s), −qmax, qmax),  x̂ = s·q

affine (zero-point): lo' = min(lo, 0),  hi' = max(hi, 0),  n = 2^b − 1
                     s = (hi' − lo') / n,  z = clamp(roundEven(−lo' / s), 0, n)
                     q = clamp(roundEven(x / s) + z, 0, n),  x̂ = s·(q − z)

fidelity:            F = clamp(1 − ‖ref − x̂‖₂ / ‖ref‖₂, 0, 1)
```

Rounding uses nearest-even ties, applied before adding the zero-point, as in [ONNX QuantizeLinear](https://onnx.ai/onnx/operators/onnx__QuantizeLinear.html). Reconstruction follows [DequantizeLinear](https://onnx.ai/onnx/operators/onnx__DequantizeLinear.html).

The symmetric grid is narrow: 4 bits use −7…7 so the levels mirror around zero. The full INT4 type also contains −8. Narrow signed weights are also used in [LiteRT's INT8 specification](https://ai.google.dev/edge/litert/models/quantization_spec), which gives weights the range −127…127.

Within the range, rounding error is at most half a step. Outside it, values clip. Widening the range reduces clipping but coarsens the steps. On this narrow grid, one extra bit multiplies the step by `(2^(b−1) − 1)/(2^b − 1)`: one third from 2 to 3 bits, approaching one half at higher precision.

For ordinary foes, fidelity compares the original and reconstructed values. For input-driven foes such as Cinder and Vesper, it compares outputs `y = Σ aᵢwᵢ`. Spindle scores each thread separately so a large thread cannot hide a destroyed small one. Bit Budget weights each head's values by the square root of its sensitivity, making squared error proportional to sensitivity.

## Packet bytes and damage

Each spell charges for a teaching packet:

- Packed payload: `ceil(N·bits/8)` bytes.
- Scales: 2 bytes per group.
- Affine zero-points: 1 byte each.
- Spotlight values: 3 bytes each, for a 16-bit value and a 1-byte index.

Bit Budget sums the per-head packets. Balance factors are folded into neighbouring weights and add no bytes. Real file formats have their own padding and metadata layouts.

Damage is `round(power · clamp((F − floor)/(1 − floor), 0, 1)^1.4)`. A cast fizzles below the foe's fidelity floor; a PERFECT cast at `F ≥ 0.985` multiplies damage by 1.25. Spindle gives each thread a third of the power and requires all three to meet the PERFECT threshold.

Calculations use JavaScript numbers. Fidelity is reconstruction quality, not model accuracy; the game does not emulate FP16 arithmetic or measure inference speed and device memory. HP, damage, charge, grades and Well scores are game rules.

## Teaching sources

| Technique | Source | How the game uses it |
| --- | --- | --- |
| Bit Dial | [Nagel et al., 2021](https://arxiv.org/abs/2106.08295), §2.2 | Choose a bit width and trade clipping against rounding error |
| Zero-Shift | [Jacob et al., 2018](https://arxiv.org/abs/1712.05877), §2.1 | Use an integer zero-point to keep real zero representable on an affine grid |
| Tide Gauge | [ONNX Runtime quantization](https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html) | Choose static ranges from calm and storm sample archives; the next wave is hidden |
| Group Rulers | [Nagel et al.](https://arxiv.org/abs/2106.08295), §2.2.3; [QLoRA](https://arxiv.org/abs/2305.14314), §3 | Give differently sized threads separate scales and charge for their metadata |
| Spotlight | [AWQ](https://arxiv.org/abs/2306.00978), §3.1; [LLM.int8()](https://arxiv.org/abs/2208.07339) | Keep selected weights exact to show why their paired inputs matter to output error |
| Balance | [SmoothQuant](https://proceedings.mlr.press/v202/xiao23c.html), §4 | Apply `x·w = (x/s)·(s·w)`, then quantize both sides |
| Bit Budget | [LLM.int8()](https://arxiv.org/abs/2208.07339); [vLLM quantized KV cache](https://docs.vllm.ai/en/stable/features/quantization/quantized_kvcache/) | Spend bits according to the example's assigned head sensitivities |

Spotlight demonstrates salience by keeping selected values exact; AWQ instead protects important channels through scaling. Balance uses SmoothQuant's rescaling identity with interactive low-bit grids rather than the paper's W8A8 recipe. The example head sensitivities are assigned by the game.

Field Notes also introduce [GPTQ](https://arxiv.org/abs/2210.17323), NF4, [FP8](https://arxiv.org/abs/2209.05433), [FP4](https://onnx.ai/onnx/technical/float4.html) and the KV cache. The in-game explanations and source excerpts live in [src/content/lessons.js](src/content/lessons.js).

## Comparing battle strategies

[tests/battle-acceptance.test.js](tests/battle-acceptance.test.js) compares each guardian's intended technique with earlier tools across reachable bit widths and lock ranges. It samples ranges at `0.025·amax`, includes lattice breakpoints and uses several restarts. These are finite searches. The tests require at least 1.2× damage per byte at the intended lock and at least 1.0× with ±3% lock error.

| Guardian | Intended damage / bytes | Best earlier strategy found | Ratio | Worst ±3% ratio |
| --- | --- | --- | ---: | ---: |
| Nib, 4 vs 2/3/8 bits | 20 / 10 | 9 / 8 | 1.78 | 1.24 |
| Chime | 24 / 11 | 24 / 18 | 1.64 | 1.02 |
| Brine, six waves | 162 / 60 | 162 / 108 | 1.80 | 1.20 |
| Spindle, initial / changed shape | 30 / 15 · 30 / 18 | 10 / 11 · 21 / 26 | 2.20 · 2.06 | 1.54 · 1.44 |
| Cinder | 35 / 12 | 35 / 18 | 1.50 | 1.50 |
| Vesper, initial / changed shape | 39 / 20 · 39 / 28 | 39 / 75 · 38 / 46 | 3.75 · 1.69 | 2.40 · 1.08 |
| Auric, phases 1 / 2 | 43 / 28 · 43 / 30 | 42 / 48 · 42 / 48 | 1.76 · 1.64 | 1.10 · 1.03 |

Chime's values need sixteen one-sided levels. Affine 4-bit fits them, while the symmetric grid needs 8 bits for the same quality. The comparison searches wider symmetric locks too, including `7/6·amax`.

The 14 added species and seven Well wardens have their own data patterns. [scripts/motif-audit.mjs](scripts/motif-audit.mjs) searches their earlier-tool alternatives; [tests/species.test.js](tests/species.test.js) checks the saved comparisons against fingerprints of the examples and numerical code. Run `node scripts/motif-audit.mjs` to recompute those comparisons. The seven original staticlings remain short practice fights.

## Friends, grades and repeat battles

Each befriended guardian can assist once per battle. An assist sets part of the next cast: a covering range, one zero edge, an archive range, one thread's ruler, a protected weight, Balance α = 0.5, or a per-head bit allocation under a byte ceiling. The player finishes the other choices. Assists use `buildSpell` and add no damage bonus; Fen's duels disable them.

A win scores `round(30·Q + 35·E + 20·G + 15·T)`:

- `Q`: mean fidelity above the foe's floor, with zero for fizzles.
- `E`: par bytes divided by total packet bytes spent, including fizzles.
- `G`: guard quality after damaging casts: PERFECT = 1, GOOD = 0.6, miss = 0.
- `T`: par turns divided by turns taken.

S requires 90 points, no fizzles, `E ≥ 0.85` and `G ≥ 0.8`. A begins at 80 and B at 65. Practice and rematches use first-meeting hero stats, without shard bonuses. Resonance changes music and effects, not damage or rewards.

Fen's three duels require three accepted rounds at fidelity ≥ 0.985 within packet caps of 11, 12 and 32 bytes. Their comparison payloads store the same values as FP32: 64, 64 and 184 bytes. Reconstruction uses `Math.fround`.

The Static Well generates floors from a 32-bit seed and the techniques known when the run starts. Separate random streams generate floors, boon offers and golden variants. Boons and modifiers change supplies, recovery and attack patterns while leaving quantization arithmetic unchanged. Each floor scores 100 for a clear, up to 200 for damage per packet byte, up to 50 each for PERFECT casts and guard quality, and 100 for a warden. Runs suspend between floors.

Golden specimens use a deterministic 1-in-32 hash of the specimen and camp-rest count, or a seeded floor choice in the Well. They are cosmetic and stay the same across reloads.

## Model sizes in the ending

The Oracle is a hypothetical 8-billion-weight model. Sizes use decimal GB:

| Format | Arithmetic | Weight storage |
| --- | --- | --- |
| FP16 | 8×10⁹ × 16 / 8 | 16 GB |
| INT8 payload | 8×10⁹ × 8 / 8 | 8 GB before metadata |
| INT4 with an FP16 scale per 128 weights | 8×10⁹ × (4 + 16/128) / 8 | 4.125 GB |

Inference also needs the KV cache, activations and runtime buffers. For standard full attention, ideal KV-cache payload is `2 × layers × sequences × tokens × KV heads × head dim × bits / 8`. It counts KV heads, not query heads. [KIVI](https://arxiv.org/abs/2402.02750) describes quantizing the cache separately from weights. Smaller storage alone does not establish faster or equally accurate inference.

## Code layout

| Area | Files |
| --- | --- |
| Game loop, scenes and saves | `src/main.js`, `src/game.js`, `src/scenes/`, `src/state.js` |
| Input, canvas sizing and pixel text | `src/engine/` |
| Generated art and audio | `src/art/`, `src/audio/` |
| Battles, grids and quantization | `src/battle/`, `src/quantization.js` |
| World and bridge puzzles | `src/world/` |
| Well runs | `src/well/`, `src/scenes/well-scene.js` |
| Progress and Journal | `src/progress/`, `src/content/static-dex.js`, `src/ui/journal.js` |
| Lessons and sources | `src/content/lessons.js` |

Scenes lay out from the canvas width, height and portrait flag. Keyboard and touch share the same actions. Reduced motion changes drawing without changing battle timing.

`game.endBattle` handles rewards by mode: practice, duels and Well runs leave campaign supplies unchanged. Progress events update records and award each badge once. First-time explanations are saved per adventure. Save format 4 can read the previous format's storage key without overwriting it.

During `npm run dev`, routes such as `?battle=nib`, `?well&friends=3`, `?journal=map`, `?zone=0` and `?gallery=species` open specific screens. Add `&nosave` to disable saving. The development game object is available as `window.__bitbound`; these shortcuts are removed from production builds. The canvas's `aria-label` exposes the current scene and battle status.
