# Bitbound

An original pixel-art browser RPG about **quantization for inference**. Explore an island, befriend tensor spirits, and learn by changing numerical experiments rather than memorizing jargon.

## Run locally

Node.js 22.12 or newer:

```sh
npm install
npm run dev
```

Open the URL printed by Vite. `npm run build` produces a static site in `dist/`; `npm run preview` serves that build.

## Educational boundaries

Experiments use small deterministic tensors and toy inference in the browser, not a downloaded LLM. Quantize/dequantize, reconstruction error and storage calculations are real. They are **not hardware benchmarks**, and fewer bits do not guarantee faster inference. Real deployment must validate model quality, memory and latency on the target runtime/device.

Primary starting references: [ONNX QuantizeLinear](https://onnx.ai/onnx/operators/onnx__QuantizeLinear.html), [ONNX Runtime quantization](https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html). Research and design use bounded specialist workers plus independent adversarial review; see [AGENTS.md](AGENTS.md).

All world, character and pixel artwork is original. Inspired by the feel of classic handheld RPGs; not affiliated with Nintendo or Pokémon.
