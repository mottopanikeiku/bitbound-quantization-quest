# Research and design decisions

Bitbound is a keyboard-first pixel RPG whose spells run real, toy-sized quantization arithmetic. It is not a compressed language model, an inference runtime or a hardware benchmark. This file records the numerical contract the code implements, the primary sources behind every technical claim the game makes, and the design reasoning behind the v2 rebuild. The per-claim ledger with quoted passages lives with the teaching data (`src/content/lessons.js`, `SOURCES`).

## Why v2

The v1 RPG was judged *all bad*: the art was not good, the aesthetics were weak, it was not fun and it did not teach. Its battles were abstract timing pulses on a ruler; the player never saw a value being quantized, and techniques never mattered. v2 rebuilt the game around four pillars:

- **Teaching by sight.** The quantization grid *is* the attack. Values appear as motes, the chosen bit width draws the levels, the player locks the range, and the snap animation shows rounding error, clipping, zero-points, group scales, protected values and per-head precision.
- **Fun.** Every guardian is a puzzle its zone's technique solves; the naive approach stays possible but slow. Bits cost bytes, so each turn is a decision. Enemy attacks are telegraphed and guarded with timing. Exploration rewards shards, caches, Snap Bridge puzzles and humour.
- **Art.** One pixel scale on a canvas that fills the window (at least 384×216 game pixels in landscape and 216×320 in portrait), a hue-shifted master palette, top-left lighting, cluster shading, selective outlines, idle animation, EarthBound-style animated battle backdrops and colour depth as the visual language of the Static: corrupted zones are rendered with fewer colours and regain them as you progress.
- **Aesthetics.** An original proportional pixel font, framed windows, typewriter dialogue with portraits, a compact HUD and quantization-themed transitions.

## Numerical contract

The core lives in `src/quantization.js`; spells in `src/battle/spell.js`.

```text
symmetric (narrow):  qmax = 2^(b−1) − 1,  s = r / qmax,  q = clamp(roundEven(x / s), −qmax, qmax),  x̂ = s·q
affine (zero-point): lo' = min(lo, 0), hi' = max(hi, 0), n = 2^b − 1, s = (hi' − lo') / n,
                     z = clamp(roundEven(−lo' / s), 0, n),  q = clamp(roundEven(x / s) + z, 0, n),  x̂ = s·(q − z)
fidelity:            F = clamp(1 − ‖ref − x̂‖₂ / ‖ref‖₂, 0, 1)
```

- Rounding is to nearest, ties to even, applied to `x / s` **before** the zero-point is added, as specified by [ONNX QuantizeLinear](https://onnx.ai/onnx/operators/onnx__QuantizeLinear.html); reconstruction follows [DequantizeLinear](https://onnx.ai/onnx/operators/onnx__DequantizeLinear.html) and cannot recover discarded information.
- The symmetric grid deliberately uses the **narrow** range (INT4: −7…7), so zero is exact and the grid is mirrored; the full INT4 type also contains −8 ([ONNX INT4](https://onnx.ai/onnx/technical/int4.html)). Narrow signed weights are a documented convention, e.g. [LiteRT's INT8 specification](https://developers.google.com/edge/litert/conversion/tensorflow/quantization/quantization_spec) uses −127…127 for weights. The game labels −7…7 as *its* INT4 choice.
- Affine grids keep real zero exactly representable through an integer zero-point ([Jacob et al., 2018](https://arxiv.org/html/1712.05877), §2.1).
- Inside the grid, rounding error is at most half a step; values outside are clipped, and widening the range to avoid clipping increases rounding error ([Nagel et al., 2021](https://arxiv.org/html/2106.08295v1), §2.2). On the narrow grid one extra bit shrinks the step by `(2^(b−1) − 1)/(2^b − 1)` — a third from 2→3 bits, approaching one half at higher precision — so the game never claims an exact halving. The ≈6 dB per bit rule is stated only for an ideal full-scale uniform quantizer ([TI SLAA323A](https://www.ti.com/lit/an/slaa323a/slaa323a.pdf), §2.1).
- Fidelity is computed on the spell's declared reference: the essence values themselves, or the outputs `y = Σ aᵢwᵢ` for input-driven guardians (Cinder, Vesper), because low weight error does not guarantee low output error.
- All arithmetic uses JavaScript numbers; it is not a bit-exact FP16 emulator or an integer kernel.

### Declared packet and fictional rules

A spell's byte cost is a **declared teaching packet**: `ceil(N·b/8)` payload bytes + a 2-byte FP16 scale per group + 1 byte per affine zero-point + 3 bytes per Spotlight value (FP16 value + 1-byte index). Balance factors are folded into neighbouring weights (0 bytes); Bit Budget sums per-head packets. Real formats differ in layout, padding, zero-point storage and untouched tensors.

Damage is `round(power · clamp((F − floor)/(1 − floor), 0, 1)^1.4)`, with **PERFECT** (×1.25) at `F ≥ 0.985` and **FIZZLE** below the guardian's floor (the live meter marks that floor). Spindle is the one declared exception: each of its three threads carries a third of the power and is scored on its own fidelity, and PERFECT needs all three, so a thick thread cannot hide a destroyed thin one; the panel shows the per-thread results. Bit Budget weights each head's values by √sensitivity, so error energy is weighted by the declared sensitivity, identically in the battle and in its lesson diagram. Damage, HP and byte charge are game rules. Fidelity is not task accuracy and nothing in the game measures latency or device memory.

### Guardian acceptance

Each guardian must be beaten best by its zone's technique without any hidden bonus. `tests/battle-acceptance.test.js` searches the full reachable lock domain of every naive alternative (earlier tools, every bit width, ranges sampled at 0.025·amax plus lattice breakpoints such as 7/6·amax, several restarts) on fixed seeds and requires the intended technique to reach at least 1.2× the best naive damage per byte, and at least 1.0× when its own locks are off by ±3%. Measured on the final fixtures (damage/bytes; finite search, not a proof of a global optimum):

| Guardian | Intended | Best naive found | Ratio | Worst ±3% |
| --- | --- | --- | ---: | ---: |
| Nib (Bit Dial; 4 vs optimized 2/3/8 bits) | 20 / 10 | 9 / 8 | 1.78 | 1.24 |
| Chime | 24 / 11 | 24 / 18 | 1.64 | 1.02 |
| Brine (six waves, forecast vs fixed policy) | 162 / 60 | 162 / 108 | 1.80 | 1.20 |
| Spindle (initial / morphed) | 30 / 15 · 30 / 18 | 10 / 11 · 21 / 26 | 2.20 · 2.06 | 1.54 · 1.44 |
| Cinder | 35 / 12 | 35 / 18 | 1.50 | 1.50 |
| Vesper (initial / morphed) | 39 / 20 · 39 / 28 | 39 / 75 · 38 / 46 | 3.75 · 1.69 | 2.40 · 1.08 |
| Auric (phase 1 / 2) | 43 / 28 · 43 / 30 | 42 / 48 · 42 / 48 | 1.76 · 1.64 | 1.10 · 1.03 |

Zero-Shift honestly saves about one bit, so Chime's essence needs sixteen one-sided levels: affine 4-bit fits it, while a mirrored grid needs 8 bits for the same quality. An earlier version claimed a 1.5× advantage that a reviewer refuted with a reachable 4-bit symmetric lock (7/6·amax on a 1/6 lattice); the data and the acceptance search were changed rather than the baseline narrowed.

## Techniques: what the game shows and what it does not claim

| Technique | In the game | Real-world analogue | Boundary |
| --- | --- | --- | --- |
| Bit Dial | 2/3/4/8-bit grids; lock the range on a smooth wave | Bit width sets codes; range trades rounding vs clipping ([Nagel et al.](https://arxiv.org/html/2106.08295v1) §2.2) | Toy waves, not trained weights |
| Zero-Shift | Lock low then high edges; affine grid uses every code on mostly-positive data | Affine quantization with zero-point ([Jacob et al.](https://arxiv.org/html/1712.05877) §2.1) | One tensor, one zero-point |
| Tide Gauge | Next wave hidden; choose the range from a calm/storm sample archive and a forecast | Static activation ranges from calibration data; dynamic ranges cost runtime work ([ONNX Runtime](https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html)) | Samples cannot bound arbitrary future inputs; the storm illustrates distribution shift, not an LLM measurement |
| Group Rulers | Each thread gets its own scale for +2 B | Per-channel / group-wise scales; INT4 weight-only with groups of 128 is a common setting ([AWQ](https://arxiv.org/html/2306.00978v4) §5.1; [Nagel et al.](https://arxiv.org/html/2106.08295v1) §2.2.3) | 128 is a choice, not a law; metadata per weight is `scale bits / group size` ([QLoRA](https://arxiv.org/html/2305.14314) §3 arithmetic) |
| Spotlight | Keep the weights that meet hot inputs exactly (3 B each) | Output error scales with the input that multiplies a weight error; salient channels matter ([AWQ](https://arxiv.org/html/2306.00978v4) §3.1, Eq. 3); outlier dimensions kept in 16-bit ([LLM.int8()](https://arxiv.org/abs/2208.07339)) | **Not AWQ** (AWQ protects by per-channel scaling, not by keeping FP16 values) and not LLM.int8()'s matrix decomposition |
| Balance | Slide α: activations ÷ s, weights × s, then quantize both | SmoothQuant's equivalent rescaling `Y = (X diag(s)⁻¹)(diag(s) W)` ([Xiao et al., 2023](https://proceedings.mlr.press/v202/xiao23c/xiao23c.pdf) §4) | The game's factors are chosen interactively at low bit widths; the paper targets W8A8 and α is model-dependent |
| Bit Budget | Assign bits per head by sensitivity | Mixed precision: sensitive layers or features stay wider ([LLM.int8()](https://arxiv.org/abs/2208.07339); [vLLM KV-cache layer skipping](https://docs.vllm.ai/en/stable/features/quantization/quantized_kvcache/)) | Sensitivities are declared, not measured from a model |

Field Notes also cover, without executing them: GPTQ's layer-output reconstruction with second-order error compensation ([Frantar et al.](https://arxiv.org/html/2210.17323) §§3–4), NF4's normal-quantile codebook in QLoRA ([Dettmers et al.](https://arxiv.org/html/2305.14314) §3), FP8 E4M3/E5M2 range–precision trade-offs ([Micikevicius et al.](https://arxiv.org/html/2209.05433) §3), FP4 E2M1 levels ([ONNX FLOAT4](https://onnx.ai/onnx/technical/float4.html)) and the KV cache.

## Sizes in the ending

All sizes are decimal GB (1 GB = 10⁹ B, [NIST](https://physics.nist.gov/cuu/Units/binary.html)). The Oracle is a hypothetical 8-billion-weight model:

| Format | Arithmetic | Weight bytes |
| --- | --- | --- |
| FP16 | 8×10⁹ × 16 / 8 | 16 GB |
| INT8 payload | 8×10⁹ × 8 / 8 | 8 GB (before metadata) |
| INT4 + FP16 scale per 128 weights | 8×10⁹ × (4 + 16/128) / 8 | 4.125 GB |

These count weights only. Inference also needs the KV cache, activations and runtime buffers ([vLLM memory profiling](https://docs.vllm.ai/en/v0.18.1/api/vllm/utils/mem_utils/)). For standard full attention the ideal cache payload is `2 × layers × sequences × tokens × KV heads × head dim × bits / 8`, counting KV heads rather than query heads ([vLLM AttentionSpec](https://docs.vllm.ai/en/v0.11.0/api/vllm/v1/kv_cache_interface.html)); the cache can be quantized separately from the weights ([KIVI](https://arxiv.org/html/2402.02750) §2). Smaller files do not guarantee faster or equally accurate inference ([ONNX Runtime FAQ](https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html#why-am-i-not-seeing-performance-improvements)); a real deployment must measure task quality, memory and latency on the target device.

## Learning and game design

- **Integrated, not appended.** The technique is the mechanic that beats each guardian, and the grid shows *why* a cast was good or bad: rounding tethers, clipped motes, per-row results, and for input-driven guardians the true versus rebuilt outputs. This follows the integrated-learning results of [Habgood & Ainsworth, 2011](https://tca2.education.illinois.edu/docs/librariesprovider23/default-document-library/j-of-the-learning-sc-2011-habgood.pdf?sfvrsn=c838d23d_2): content inside the core action, not end-of-level trivia.
- **Explanatory feedback that stays.** A FIZZLE or clipped cast shows the tethers and clipped motes with a one-line coach explanation, rather than a bare right/wrong ([Moreno, 2004](https://link.springer.com/article/10.1023/B:TRUC.0000021811.66966.1d)). First-time results wait for the player instead of expiring into the enemy turn, and SCAN replays the last snap; coaching only names tools the player has unlocked.
- **Decisions, not recipes.** Brine's live wave is hidden on a fixed ruler, so the player must read the forecast and archive and choose a tight or wide range; stronger guardians change shape after two good casts; each zone's Snap Bridge asks for its technique in a different setting than its battle. Techniques are recalled and reapplied rather than reread ([Butler, 2010](https://bpb-us-e2.wpmucdn.com/sites.wustl.edu/dist/8/805/files/2026/06/Butler-2010-Repeated-testing-produces-superior-transfer-of-learning-relative-to-repeated-studying.pdf)).
- **Lesson before practice.** A zone's staticlings stay asleep until its Grid Stone has taught the technique, practise it while the zone is corrupted, and disappear when it is restored, so fights never demand a tool the player does not have and exploration is not taxed by solved encounters.
- **Autonomy and competence.** Free TUNE/SCAN, optional Field Notes, optional exploration rewards and skippable lessons; difficulty comes from timing and resource choices, not grinding ([Ryan, Rigby & Przybylski, 2006](https://selfdeterminationtheory.org/SDT/documents/2006_RyanRigbyPrzybylski_MandE.pdf)).
- **Access.** Keyboard and touch for every action, a live status line on the canvas (`aria-label`) and a polite status region, reduced motion that keeps timing identical ([WCAG 2.2 keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html), [status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html), [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)). These checks are not a blanket conformance claim.

These sources motivate the design; they do not prove that this game produces retained learning or universal enjoyment.

## Verification

- **Tests and build.** `npm test` passes 153 tests: the quantization core, the save format (including the remembered full-screen choice), battle math/flow/timing/display, the guardian acceptance search above, world map reachability with progressive gates, patrol dynamics, all seven Snap Bridge curricula (each solvable with its technique, none with the old two-bit recipe), lesson content limits and arithmetic, lesson-card pagination (no heading separated from its text), and the window-fit rules: whole-window coverage, design minimums, whole-pixel scales, and letterboxing only at extreme aspect ratios. `npm run build` produces the static bundle; DEV routes and galleries are stripped from it.
- **Full campaign.** On the 2.0.0 source (the 2.1.0 full-window update changed layout, full screen and prompts, not battle or world rules), from a cleared save: title → New Game → intro → keeper → every Grid Stone and guardian in order → lighthouse → Oracle ending → free roam, driven by real keyboard events. A read-only observer timed locks and guards from on-screen state; Brine's hidden waves were locked from the forecast and archive, never from the live values. Guardian fights took Nib 5, Chime 7, Brine 8, Spindle 8, Cinder 5, Vesper 7 and Auric 11 turns. A deliberate defeat against Chime returned the hero to camp with friends kept; reload → Continue restored friends, techniques, HP, bytes and position; pause → Restart asked for confirmation and erased the save. No AudioContext existed before the first Enter; the title, overworld, seven zone themes, battle, boss, victory and ending scenes all played; the browser error log stayed empty.
- **Touch.** An emulated 390×844 phone with a coarse pointer used the D-pad to walk, A to talk and cast, and STEADY + A to lock a grid, with prompts naming A/B/STEADY and no horizontal scrolling. On the full-window build, emulated iPhone 12 (portrait and landscape) and iPhone 14 Pro Max screens showed A/B prompts before the first tap. In landscape, A alone started the game and entered full screen, the D-pad walked, and START/B paused and resumed. The canvas filled the space above the controls in portrait and between them in landscape.
- **Full screen and window shapes.** A 1280×800 window was covered edge to edge (400×250 game pixels, 3.2 CSS px each). Enter on the title entered full screen; F left it and the choice survived a reload; leaving full screen through the browser paused play. Square (1000×1000), ultrawide (1720×720), tall (960×1040) and laptop (1366×625) windows were also covered edge to edge. The title, intro, world, battle menu, Snap Bridge, lesson card, dialogue, Field Notes, pause menu and ending were each checked in at least two of those shapes, and everything stayed inside the canvas. A grid lock, a full cast with its hit effects, and the guard ring were checked on the square window.
- **Production bundle.** `vite preview` of `dist/`: title → Enter (full screen) → world, walking, F, pause, reload; no console errors and no DEV handle.
- **Independent review.** Read-only reviewers checked numerics (recomputation, reachable baselines, mutation probes), battle feel, a first play-through and art direction. Their findings drove the second wave: retained first-time explanations, a real calibration decision for Brine, shorter fights that change shape, per-thread and output-level displays, guard EARLY/LATE feedback and a teaching beat, portrait reaction strips, seven distinct zone compositions, technique-specific Snap Bridges, the patrol lifecycle, corruption that keeps landmarks and creatures readable, friend emblems and an illustrated Oracle ending.
- **Not checked.** Human listening; physical phones and Safari; novice usability or learning outcomes. The automated player is not a human, so human difficulty is known only from reviewer play.

## Agent setup

The rebuild used one integration lead and bounded parallel workers with exclusive file ownership and a fixed interface contract (world art, creature art, battle art, battle system, world, interface, teaching content, audio), followed by independent read-only reviewers for numerics, battle feel, a first play-through and art direction, whose findings drove a second wave of fixes. The harness reported the same model family (`openai-codex/gpt-6-astra`) for builders and reviewers, so this is role independence, not model-family independence. The lead owned the engine, game flow, integration, consolidated verification and publication. This follows [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) and [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system).
