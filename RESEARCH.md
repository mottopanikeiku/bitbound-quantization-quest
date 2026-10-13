# Research and design decisions

Bitbound is a keyboard-controlled pixel RPG whose spells use real toy quantization, not a compressed LLM runtime or a hardware benchmark. Independently scoped foundations, inference-deployment, game-design, world/music and adversarial workers supported the implementation. The integration owner verifies the actual game. External research supports mechanisms and design rationale; it does not establish universal enjoyment or retained learning.

## Numerical contract

For positive scale `s`, integer zero-point `z`, and declared code endpoints:

```text
q = clamp(roundNearestEven(x / s) + z, qmin, qmax)
x_reconstructed = s * (q - z)
error = x_reconstructed - x
MSE = mean(error * error)
```

[ONNX QuantizeLinear](https://onnx.ai/onnx/operators/onnx__QuantizeLinear.html) specifies nearest-even rounding of the division, then adding the zero-point. Rounding after adding an odd zero-point changes tie outcomes. JavaScript's `Math.round` is not this rule. [DequantizeLinear](https://onnx.ai/onnx/operators/onnx__DequantizeLinear.html) defines reconstruction, not recovery of discarded information.

The game's signed symmetric quantizer deliberately uses the **narrow** code range `[-(2^(b-1)-1), +(2^(b-1)-1)]`, zero-point zero, and `s=maxAbs/qmax`. For INT4 that is -7…7; the full signed dtype also contains -8. The unused code is a convention, not a NaN or smaller storage width. Affine quantization uses full unsigned codes, extends the observed interval to include real zero, and computes the final reconstruction interval after integer zero-point rounding. [LiteRT's specification](https://developers.google.com/edge/litert/conversion/tensorflow/quantization/quantization_spec) illustrates why weight and activation range conventions differ.

Clipping is reported as an input outside the final reconstruction interval, which is not always the same as an integer code changed by clamping. Nearest-grid rounding can have an error of at most half a step; endpoint clipping can have much larger error. The game computes finite-tensor MSE, not an assumed uniform-noise formula. All arithmetic uses JavaScript numbers; it is not bit-exact FP16 or a deployed integer kernel.

## Storage and inference are different measurements

The declared toy format packs payload globally and adds an FP32 scale per group, plus one byte per affine zero-point. Metadata storage is an explicit teaching assumption, not a universal model-file format. Odd payload lengths, group counts, implicit symmetric zero-points, layout/padding and unquantized tensors matter. [ONNX's INT4 documentation](https://onnx.ai/onnx/technical/int4.html) separates packing from numerical semantics.

Per-output-channel means one ruler for each weight-matrix row. Finer groups can improve reconstruction but need more metadata and supported kernels. A low weight MSE does not guarantee accurate forward outputs: inputs can amplify sensitive-coordinate errors. A cast computes three actual linear dot products from quantized weights and activation wavelets and compares them with the unrounded reference. Timing error and quantization error both enter those outputs. Fictional spell damage uses normalized output residuals and an explicitly game-designed loss-to-damage curve, not ground-truth classification accuracy. [Jacob et al., CVPR 2018](https://arxiv.org/html/1712.05877), §§2–3, explains affine representations, wider integer accumulators/biases and simulated quantization during training. [ONNX MatMulInteger](https://onnx.ai/onnx/operators/onnx__MatMulInteger.html) uses an INT32 output; the game instead performs reconstructed floating dot products with JavaScript Numbers.

## Calibration and evaluation

Static activation parameters are selected offline from representative workload inputs; dynamic parameters are computed during inference and incur additional work. Calibration is not retraining. Widening a range protects tails but makes the grid coarser; clipping a calibration extreme can improve the chosen practice objective while harming other inputs. Neither 'always cover the maximum' nor 'always clip outliers' is safe.

SCAN reads a synthetic enemy calibration archive; attack signals are separate gameplay/practice inputs, not an untouched statistical test set. Full-range fitting covers the archive; trimmed fitting caps absolute values at its 85th percentile before fitting. Brine's archive includes ordinary weather and a rare large tail, while charged turns change the current signals. Neither strategy always wins. Real deployment still requires untuned held-out task evaluation. [ONNX Runtime's documentation](https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html) covers static/dynamic selection, calibration methods, debugging and hardware-dependent performance. [Nagel et al., A White Paper on Neural Network Quantization](https://arxiv.org/abs/2106.08295) discusses rounding/clipping, granularity and task-quality objectives.

## Modern methods: mechanisms, not magic upgrades

- **PTQ vs QAT:** PTQ starts after training but can still rescale or compensate weights. QAT normally trains floating shadow parameters through simulated quantize/dequantize forward numerics and a surrogate backward pass, then converts to a matching deployment scheme. Neither is an automatic latency bonus. [TorchAO QAT](https://pytorch.org/blog/quantization-aware-training/) and [QAT + LoRA](https://pytorch.org/blog/quantization-aware-training-in-torchao-ii/).
- **GPTQ:** layer-output reconstruction with approximate second-order weight-error compensation, not mere weight rounding or a universal quality winner. [Original paper](https://arxiv.org/html/2210.17323), §§3–4.
- **AWQ:** activation-guided channel scaling protects important weight contributions; activation guidance is not itself activation quantization. [Original paper](https://arxiv.org/html/2306.00978v4), §3.
- **SmoothQuant:** equivalent inverse feature scaling, `X W = (X / s) (s W)`, shifts numerical range burden between activations and weights before both are quantized. The original method targets INT8 W8A8; the game's lower-bit spell uses sixteen positive feature scales across three pulse/output rows. This is a mechanism analogy, not the full SmoothQuant recipe. The paired unrounded product is stationary while the computed reconstructed product can change. [Original paper](https://proceedings.mlr.press/v202/xiao23c.html), §4.
- **LLM.int8():** ordinary feature dimensions use an INT8 path, outlier dimensions a higher-precision path; the results are combined. It does not discard difficult inputs. [Original paper](https://arxiv.org/abs/2208.07339), §3 and Appendix D.
- **FP8 vs INT8:** same bit count, different grids and hardware paths. Integer reconstruction has constant spacing for a fixed scale; floating-point spacing changes with magnitude. E4M3 and E5M2 trade precision against range. [FP8 Formats for Deep Learning](https://arxiv.org/abs/2209.05433), §§2–3.
- **NF4 / QLoRA:** NF4 is a nonuniform weight codebook; QLoRA trains adapters through a frozen quantized base, typically using wider computation. Training-memory savings are not evidence of the fastest inference path, and QLoRA is not synonymous with QAT. [Original paper](https://arxiv.org/html/2305.14314), §3.

W4A16/W8A8 labels omit exact formats, packing, group sizes, accumulators, untouched operations and kernel choice. The game never calls unrounded JavaScript activations A16. Performance depends on the actual exported artifact, runtime, device, tensor shapes, batch, prefill/decode phase and context. [PyTorch's deployment report](https://pytorch.org/blog/accelerating-llm-inference/) illustrates workload-dependent ordering; no reported timing is transplanted into gameplay.

## KV cache and deployment

Weights and the attention KV cache are distinct. For the declared full-attention model, ideal cache payload is:

```text
2 × layers × active sequences × tokens × KV heads × head dimension × bits / 8
```

Use actual KV heads, not query heads, particularly with grouped-query attention. Quantizing weights alone does not change cache precision. Metadata, residual high-precision cache, alignment, workspace and other runtime allocations are excluded from this research-context payload estimate. The RPG does not execute attention, estimate a real deployed cache or validate generation quality. [KIVI](https://arxiv.org/html/2402.02750), §§2–3, and [vLLM KV documentation](https://docs.vllm.ai/en/stable/features/quantization/quantized_kvcache/) explain separate cache choices, scales and quality risks.

A real acceptance procedure must measure untuned task quality, long-context behavior, peak device memory, time to first token, inter-token latency and workload throughput on the target device/runtime. A green toy result and an in-game ending do not verify those properties.

## Learning and game flow

The retained design is a movement-first original creature RPG: held WASD and a scrolling camera, physical NPC/camp/cache interactions, avoidable roaming contact encounters, keyboard-controlled turn-based battles and three active timing pulses per cast. HP, byte charge, guarded attacks, scanning, healing, retreat and companion unlocks create decisions rather than numerical forms. Seven guardian victories restore the island. There are no click-travel buttons, compulsory articles, quizzes, grinding gates or random captures. Original multi-voice chiptunes change between exploration, battle, boss, victory and ending scenes.

The earlier worksheet-like flow was rejected by the player. The cutover integrates the numerical model into attacks: 48 weights and 48 activation samples use a declared packed packet format; finer precision and extra per-channel metadata cost more fictional byte charge. Feature balancing multiplies each weight by a positive scale and divides its paired input by the same scale, preserving the unrounded dot product; recomputation after quantization can change the spell. The green cursor shows reconstructed output-equivalent amplitude, while white is raw aim and gold is the target. Axis ticks are visual coordinates, not claims of individual output-code locations. Each pulse receives an aiming-camera zoom without changing its fitted quantizer.

Independent adversaries challenged numerical bookkeeping, restart latches, enemy resets, HP rounding, overlapped objective guidance, native keyboard focus and unreadable portrait glyphs. The implementation uses a clean simulation reload for a new game, integer HP numerals with animated bars, one HUD owner, and reflowed native portrait controls. These design/implementation checks are not claims of scientifically measured learning, addictiveness or universal fun.

Evidence motivating, not proving, these choices:

- [Habgood & Ainsworth, 2011](https://tca2.education.illinois.edu/docs/librariesprovider23/default-document-library/j-of-the-learning-sc-2011-habgood.pdf?sfvrsn=c838d23d_2): educational content integrated into the action, not merely end-of-level trivia.
- [Butler, 2010](https://bpb-us-e2.wpmucdn.com/sites.wustl.edu/dist/8/805/files/2026/06/Butler-2010-Repeated-testing-produces-superior-transfer-of-learning-relative-to-repeated-studying.pdf): retrieval with feedback can support transfer to new inferential questions; it is not evidence that a single immediate check certifies retained knowledge.
- [Moreno, 2004](https://link.springer.com/article/10.1023/B:TRUC.0000021811.66966.1d): explanatory versus merely corrective feedback; publisher abstract verified, not a claimed game-specific effect size.
- [Ryan, Rigby & Przybylski, 2006](https://selfdeterminationtheory.org/SDT/documents/2006_RyanRigbyPrzybylski_MandE.pdf): autonomy and competence relate to enjoyment; badges alone do not make a game appealing.
- [WCAG keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html), [drag alternatives](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements), [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) and [status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html): semantic controls, readable numerical alternatives, clear focus and text outcomes. Browser checks are not a blanket WCAG-conformance claim.

## Agent setup

The project uses simple bounded orchestrator-workers, not an agent framework in the game. Research, art, styling and encounter code have owned files and fixed interfaces; independent adversarial checks challenge numerics and player flow. One lead integrates, runs consolidated verification, and publishes meaningful commits. This follows [Anthropic's effective-agents guidance](https://www.anthropic.com/engineering/building-effective-agents) and [multi-agent research engineering report](https://www.anthropic.com/engineering/multi-agent-research-system).
