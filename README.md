# Bitbound — The Static Isle

**[Play in your browser →](https://mottopanikeiku.github.io/bitbound-quantization-quest/)**

An original pixel-art RPG where **quantization is the magic**. The Static has squeezed a colourful island into a handful of bits. Explore it with the Gridstaff, snap scattered values onto grids of levels, befriend seven corrupted guardian spirits and give the island its colour back.

Every spell is real (toy-sized) quantization arithmetic: the values you see are rounded to the levels you see, and the damage you deal comes from the error you see.

## Controls

| Key | Action |
| --- | --- |
| Enter | Start (starts the original soundtrack) · confirm |
| WASD / arrow keys | Walk · choose menu items |
| Shift | Run · *steady hands* while locking a grid (half speed) |
| Enter / Space / E | Talk, read, interact · lock a grid edge · time a guard |
| Esc | Back · pause (Resume, Field Notes, Music, Restart) |
| N | Field Notes: every technique you have learned, a glossary and real model sizes |
| M | Music on/off |
| F | Full screen |

Phones and tablets get an on-screen D-pad with **A** (act), **B** (back), **STEADY** (hold to run or to slow a breathing lock) and **START** (pause); the game reflows into a tall portrait layout and its prompts switch to the buttons you are using.

## How a cast works

1. **SNAP** opens the grid panel. The guardian's *essence* appears as glowing motes: the true values your spell must carry.
2. Your **bits** decide how many levels the grid has (4 bits → 16 codes; the mirrored grid uses 15 of them).
3. A **bracket breathes** in and out. Press Enter to lock the range. Too tight and values are **clipped**; too wide and the steps between levels get coarse.
4. The motes **snap** to their nearest level. Red tethers show each rounding error, orange motes were clipped, and you can hear the snapped values as notes.
5. **Fidelity** = 1 − relative error, measured on the values — or, for guardians that feed inputs through weights, on the outputs. The meter marks the guardian's fizzle floor; ≥ 98.5 % is a **PERFECT** (×1.25); below the floor the cast **FIZZLES**.

The first time something new happens (your first snap, a fizzle, clipping, a technique) the result waits until you have read it; SCAN can replay your last snap row by row.

More bits cost more **bytes** (your spell resource, refilled by GUARD, camps and each turn). Picking the cheapest grid that still lands the spell is the whole game.

Between your casts the guardian attacks: watch the telegraph and tap confirm once as the rings meet (the game tells you if you were early or late), GUARD to brace against charge attacks, and eat a SNACK when things go wrong. TUNE and SCAN are free. After a couple of good casts the stronger guardians change shape, so the same recipe will not carry a whole fight.

## Seven guardians, seven techniques

Each zone's Grid Stone teaches a technique with an animated lesson card; its guardian is a puzzle that technique solves.

| Zone · guardian | Technique | What you do | The real idea |
| --- | --- | --- | --- |
| Bitleaf Meadow · Nib | Bit Dial | Pick 2/3/4/8 bits, lock a range around a smooth wave | Bits set the number of levels; range trades rounding against clipping |
| Offset Grove · Chime | Zero-Shift | Lock a low edge, then a high edge, for mostly-positive values | Affine quantization: a zero-point lets lopsided data use every code |
| Calibration Cove · Brine | Tide Gauge | The next wave is hidden; read the forecast and the calm/storm archive, then lock a tight or wide range on a fixed ruler | Calibration picks static activation ranges from sample data |
| Channel Heights · Spindle | Group Rulers | Three threads of very different sizes each get their own scale | Per-channel / group-wise scales protect small values |
| Inference Forge · Cinder | Spotlight | Keep the two weights that meet hot inputs in 16-bit | Error that matters is error in the *outputs*; salient weights deserve protection |
| Outlier Archives · Vesper | Balance | Slide α to move range from huge activations into the weights, then round both | SmoothQuant-style rescaling: `x·w = (x/s)·(s·w)` before rounding |
| Precision Spire · Auric | Bit Budget | Spend bits per head according to how sensitive each head is | Mixed precision: not every layer needs the same bits |

Each region is its own place — an open meadow, a canopy grove, a curving cove, terraced heights, a furnace yard, a ruined reading hall and a terraced spire — and each hides a **Snap Bridge**: a puzzle for that zone's technique (merge nearby heights into a walkway, hit two uneven banks with a zero-point, choose a range for hidden tides, keep a three-scale staircase, protect the heavily loaded plate, keep paired products while rounding both, split a fixed packet budget). **Staticlings** sleep until a zone's Grid Stone wakes them, chase while the zone is corrupted (short practice battles, +6 B per win) and vanish when its guardian is befriended. Sixteen **bit shards** (eight make a byte: +16 max bytes), picnic caches, camps and villagers with strange opinions and true facts reward exploring. Corrupted zones are drawn with only a few colours; waking a Grid Stone adds one bit of colour depth, and befriending the guardian floods the zone with full colour. The Lighthouse Oracle's ending shows what the techniques mean for a real 8-billion-weight model: 16 GB at 16-bit, 8 GB at 8-bit, about 4.1 GB at 4-bit with group scales.

## Honest toy rules

- Quantize/dequantize uses ONNX-style nearest-even rounding with a narrow symmetric grid (INT4 = −7…7) or an affine grid with a zero-point. Calculations use JavaScript numbers, not a hardware integer kernel or a bit-exact FP16 emulator.
- Spell **bytes** follow a declared teaching packet: packed payload + a 2-byte FP16 scale per group + 1 byte per affine zero-point + 3 bytes per Spotlight value. Real formats lay metadata out differently.
- **Damage, HP and byte charge are fictional game rules.** Fidelity is a reconstruction metric on the spell's own values or outputs, not task accuracy, and nothing here measures speed or device memory.
- Spotlight is a salience demonstration, not AWQ; Balance mirrors SmoothQuant's rescaling identity, not its full recipe. [RESEARCH.md](RESEARCH.md) lists the primary sources and the boundaries of every claim.

## Run locally

Node.js 22.12 or newer:

```sh
npm install
npm run dev
```

`npm test` runs the numerical, battle, world, save and content tests; `npm run build` writes the static game to `dist/`; `npm run preview` serves it. GitHub Actions tests and deploys successful `main` commits to GitHub Pages.

Plain JavaScript modules and Vite; no framework, backend, account, analytics, model download or remote font/art/audio. Every sprite, tile, font glyph and melody is generated in code and original. Inspired by classic handheld RPGs; not affiliated with Nintendo, Pokémon or EarthBound. MIT licensed.
