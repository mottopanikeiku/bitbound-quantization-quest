# Bitbound — The Static Isle

**[Play the RPG →](https://mottopanikeiku.github.io/bitbound-quantization-quest/)**

An original pixel-art browser RPG about quantization for inference. **Hold WASD to explore**, avoid or battle roaming staticlings, free seven spirits, and bring the island back to life. Original multi-voice chiptune music changes between exploration, normal battles, bosses, victory and the ending.

This is a gameplay-first replacement of the earlier learning interface: **no click-to-travel map, compulsory articles, numerical forms or knowledge quizzes**. Quantization changes your spells while you play.

## Controls

| Key | Action |
| --- | --- |
| Enter | Begin/continue; start the original music |
| WASD / arrows | Hold to walk; navigate battle menus |
| Shift | Run on the island |
| E / Enter / Space | Interact with a nearby spirit, camp or cache |
| Space / Enter | Stop each of the three moving pulses during a cast |
| Q / 1 / 2 / 3 | Cycle / select 2-, 4- or 8-bit spell gear |
| Escape | Back from tuning; pause/resume |
| M | Toggle music and effects |
| F | Full screen |

On touch devices, hold the D-pad to walk; **A** interacts/confirms/locks a pulse and **B** returns/pauses. Portrait HUDs and battle menus reflow as readable HTML rather than shrinking desktop glyphs.

## Play loop

- Walk a camera-following island with real terrain collision, protected camps, hidden snack caches and moving enemies. The gold lantern and compass point toward your next spirit. Clicking the world never teleports you.
- Contact a staticling or challenge a nearby guardian to enter a turn-based battle. **CAST** times three pulses; the white cursor is your aim and the green cursor is the reconstructed toy signal.
- **TUNE** changes weight/sample precision and unlocked rulers. **SCAN** fits activation ranges to the enemy's calibration archive. **GUARD** reduces the next attack and restores byte charge. **SNACK** heals; **RUN** retreats.
- Watch charged attacks: guarding matters. Win friendships, gain maximum HP, unlock new rulers and acquire a following companion. Defeat returns you to camp without deleting friends; no grinding or random capture is required.
- Camps heal/recharge and restock snacks. Progress, position, gear, caches and music preference stay locally on this device. The RPG uses a separate save format; former quiz completions are not battle victories.

## Quantization inside the game

| Spirit | Mechanism expressed through play |
| --- | --- |
| Nib | Cheap low-bit packets versus coarse reconstructed signals |
| Chime | Scanning an off-center distribution and an affine zero-shift ruler |
| Brine | Calibration coverage, percentile trimming and changing storm tails |
| Spindle | Independent channel scales preserve small signals, at extra metadata cost |
| Cinder | Both quantized weights and activation samples affect actual forward outputs |
| Vesper | Inverse input/weight balancing preserves the unrounded product before quantization |
| Auric | Allocating precision while managing the spell packet budget |

Each cast has 48 weight values and 48 activation samples. The declared teaching format globally packs the payload and stores a four-byte scale per symmetric group (plus a byte-wide zero-point for affine groups). For one symmetric group in each operand:

| Weight/sample gear | Modeled spell packet |
| --- | ---: |
| W2 / A2 | 32 B |
| W4 / A4 | 56 B |
| W8 / A8 | 104 B |

The browser calculates quantize/dequantize and **three actual linear dot products**, comparing them with unrounded reference outputs. The green aiming cursor reflects that computed reconstruction, not a preset success animation. More bits do not give a fixed damage bonus: precision, fitted range, grouping, input timing and the current signals all affect the result.

**Damage and byte charge are fictional RPG rules.** Packet bytes model a declared representation, not JavaScript heap or device memory. The game is not a trained LLM, optimized INT kernel, FP16 emulator, task-accuracy benchmark or GPU speed test. Research covers modern deployment methods and KV cache separately; those algorithms are not secretly executed in the game.

## Research and verification

[RESEARCH.md](RESEARCH.md) contains the primary-source numerical contract, calibration/deployment caveats, GPTQ/AWQ/SmoothQuant/FP8/NF4/QLoRA and KV-cache synthesis, and gameplay-design rationale. [AGENTS.md](AGENTS.md) defines bounded ownership and independent adversarial review.

Eighteen numerical/combat/save-boundary tests pass. The actual keyboard browser campaign earned all seven friendships and reached the ending without save or module-state injection; both bridges and all guardian routes were traversed on foot. The earned seven-friend save survived reload. Browser play also exercises guard/scan/snacks, camp recovery, retained aim/code traces, fixed-input tuning, native keyboard controls, and 320/375px portrait actions. Independent numerical and player reviews identified and drove fixes for restart state, HUD overlap, stale displayed HP, unreadable portrait text and missing gear/stock feedback.

The refined five-scene soundtrack produces real destination-connected Web Audio signal. Independent Sol 6.1 checks observed sustained exploration/victory loops, actual contact/boss transitions, mute/resume and rapid toggles; the lead reached the ending and observed its running soundtrack. This is signal/continuity evidence and source composition review, not a claim of human listening or universal musical enjoyment.

These are bounded software/visual checks, not evidence of universal enjoyment, retained human learning or blanket accessibility conformance.

## Run locally

Node.js 22.12 or newer:

```sh
npm install
npm run dev
```

Open the URL printed by Vite. `npm test` checks behavioral boundaries; `npm run build` creates the static game in `dist/`; `npm run preview` serves it. GitHub Actions verifies and deploys successful main-branch commits to GitHub Pages.

Plain JavaScript modules and Vite; no runtime framework, backend, account, API key, analytics, model download or remote font/art/music dependencies. All character/world artwork and melodies are original. Inspired by classic handheld RPGs, not affiliated with Nintendo, Pokémon or EarthBound. MIT licensed.
