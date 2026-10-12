# Bitbound

An original pixel-art browser RPG about **quantization for inference**. Explore an island, befriend tensor spirits, and learn by changing numerical experiments rather than memorizing jargon.

**[Play Bitbound in your browser →](https://mottopanikeiku.github.io/bitbound-quantization-quest/)**

No account, API key, model download, or paid service. Progress stays in your browser. Sound is opt-in; your device’s reduced-motion setting is respected.

## The adventure

Move with **WASD / arrow keys**, interact with **E / Enter**, or use the touch controls and location buttons. Each guardian has a live numerical puzzle, causal feedback, an inspectable trace, and a short application check. Befriend all seven to restore the island.

| Guardian | What you make work |
| --- | --- |
| Nib · Bitleaf Meadow | Bit width, rounding, reconstruction error and the storage budget |
| Chime · Offset Grove | A scale and zero-point that suit an off-center distribution |
| Brine · Calibration Cove | Representative calibration, range coverage and clipping trade-offs |
| Spindle · Channel Heights | Per-tensor, per-channel and group scales—including metadata costs |
| Cinder · Inference Forge | Separately quantized weights/activations and actual toy forward outputs |
| Vesper · Outlier Archives | An equivalent channel-rescaling experiment before and after rounding |
| Auric · Precision Spire | Mixed precision in a two-layer model, a separate KV payload estimate, and a real-validation plan |

Completed guardians remain visitable. **Fine-detail courier** and **Stormwatch** change the objectives/data, so an earlier solution no longer wins. No lives, timers, grinding, random captures, or streaks.

The in-game **15-entry Field Guide** covers equations, signed/narrow conventions, integer accumulators, PTQ/QAT, GPTQ, AWQ, SmoothQuant, LLM.int8(), FP8, NF4/QLoRA, mixed precision, KV cache/GQA, and target-device validation. See [RESEARCH.md](RESEARCH.md) for the deeper source-backed synthesis and design rationale.

## Run locally

Node.js 22.12 or newer:

```sh
npm install
npm run dev
```

Open the URL printed by Vite. `npm run build` produces a static site in `dist/`; `npm run preview` serves that build.

`npm test` checks numerical and save-state boundaries. GitHub Actions runs these checks, builds the static game, and deploys successful main-branch commits to GitHub Pages.

## Verification

- Ten numerical/save-state tests pass; the production bundle builds successfully.
- Actual Chromium playthroughs completed all seven friendships, the ending and both changed-case replays. Wrong answers, stale-result clearing, reload persistence and reset cancellation were exercised.
- Desktop, 375px and 320px interactions were checked, including keyboard isolation, reduced motion, contextual guide returns and visible continuation/retry actions. All seven guardians are reachable on foot; both bridges were crossed using the real collision/movement code.
- Independent numerical and player-flow reviews drove the full-width guardian outcomes, readable instructional type, stable control anchors and guide-focus fixes. The twelve Forge outputs were also checked against an independent rational calculation.

These are bounded software/visual checks, not evidence of retained human learning, universal enjoyment, or blanket accessibility conformance.


## Implementation

Plain JavaScript modules and Vite; no runtime framework. Hand-authored procedural pixel sprites and a cached canvas island, semantic HTML learning controls, local-only saves, and original synthesized chip sounds. All seven locations support walking or equal-status direct travel. Browser verification—not just numerical tests—covers progression, the ending, replays, narrow-screen layouts and interaction state.

## Educational boundaries

Experiments use small deterministic tensors and toy inference in the browser, not a downloaded LLM. Quantize/dequantize, reconstruction error and storage calculations are real. They are **not hardware benchmarks**, and fewer bits do not guarantee faster inference. Real deployment must validate model quality, memory and latency on the target runtime/device.

The browser uses JavaScript Numbers, not an FP16 emulator or optimized integer kernel. Reference-class agreement is not ground-truth accuracy. Displayed validation data becomes practice when reused for tuning. The outlier puzzle illustrates an equivalent-rescaling mechanism, not full SmoothQuant. The KV estimate is for a separate hypothetical transformer: it does not execute or validate quantized attention/generation. Algorithms described in the guide are not secretly run by the game.

Primary starting references: [ONNX QuantizeLinear](https://onnx.ai/onnx/operators/onnx__QuantizeLinear.html), [ONNX Runtime quantization](https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html). Research and design use bounded specialist workers plus independent adversarial review; see [AGENTS.md](AGENTS.md).

All world, character and pixel artwork is original. Inspired by the feel of classic handheld RPGs; not affiliated with Nintendo or Pokémon.
