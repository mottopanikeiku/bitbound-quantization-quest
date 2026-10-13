# Working on Bitbound

An original educational browser RPG. No runtime agents, API keys, analytics, remote assets, or copyrighted franchise characters.

## Architecture

One 2D canvas at one pixel scale covers the whole window, or the whole screen in full screen. `fitScreen` in `src/engine/screen.js` sizes it from the stage's shape: landscape from 384×216 to 640×480 game pixels, portrait (taller than wide) from 216×320 to 400×640. Each game pixel is a whole number of device pixels whenever that shrinks the art by at most 25%. Every scene lays out from `screen.w`, `screen.h` and `screen.portrait`. Compositions designed for the minimum size (the battle, lesson cards) centre in a capped box while backdrops and the world fill the rest.

| Area | Files |
| --- | --- |
| Engine and flow | `src/main.js`, `src/game.js`, `src/state.js` (save v3), `src/engine/{screen,input,util,font}.js`, `src/scenes/*` |
| Art (procedural, cached) | `src/art/{palette,paint}.js` (master palette, alias-free `Pix` painter), `terrain`, `props`, `ambience`, `creatures`, `characters`, `portraits`, `backgrounds`, `vfx`, `transitions` |
| Battle | `src/battle/{battle,battle-view,foes,spell,gridviz,timing}.js` on the math core `src/quantization.js` |
| World | `src/world/{map,world,content,puzzles}.js` |
| Interface | `src/ui/*` (windows, HUD, dialogue, lesson cards, Field Notes, pause, toasts) |
| Teaching data | `src/content/lessons.js` (lessons, glossary, coach lines, facts, real-world sizes, primary sources) |
| Audio | `src/audio/{audio,music}.js` (no AudioContext before a user gesture) |

DEV-only routes (stripped from production): `?gallery=<name>` (every art/UI gallery; ↑/↓ gallery, ←/→ page), `?zone=0..6`, `?battle=<foeId>[&friends=N]`, `?scene=intro|ending`, plus `&nosave`. `window.__bitbound` is the Game; `#game[aria-label]` carries a live status line (`game.describe()`, `battle.describe()`, `world.describe()`).

## Bounded orchestration

Use one integration owner and parallel specialists with an exclusive file allowlist, a fixed interface contract and observable acceptance criteria; independent reviewers are read-only and report findings with reproductions. Do not let parallel workers edit the same file. The integration owner handles commits and consolidated verification after a wave, not competing mid-flight builds.

This follows [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) and [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system): simple composable workflows, explicitly bounded delegation, primary-source research, artifact-based handoffs and end-state verification.

## Dispatch and acceptance

- State one result, an exhaustive write allowlist, fixed interfaces/units, concrete player actions and required evidence. No unbounded child spawning or shared-file edits.
- Record actual runtime provider/model identifiers. Agent names are not model provenance: role independence (a reviewer that did not build the code) is not model-family independence unless the runtime identifiers differ.
- Workers share one tree: keep every file importable at all times. Reviewers serve without hot reload so their page never resets mid-fight: a `/tmp` Vite config with `root` set to the repo, `server.hmr: false` and `server.watch.ignored: ['**/*']`.
- Separate implemented, observed-pass, observed-fail and not-checked. Numerical/source review is not a playthrough; generated audio is not human listening; a successful CI deployment is not gameplay verification.
- Only the integration owner builds/tests after a wave, resolves contradictory findings, commits and approves publication. Play the final candidate from New Game through all seven friendships and the ending with real keyboard input (a read-only observer may time inputs; never inject state); verify save/Continue, restart, defeat-to-camp, full screen entry and exit, portrait and landscape touch controls, and every music scene.

## Quality contract

- Quantization must affect play through computed reconstruction on visible grids: values snap to levels the player can see, and fidelity/damage follow from the resulting error. Damage, HP and byte charge are fictional rules, never task accuracy or device memory; no hidden technique bonuses.
- Verify technical claims against primary sources (ledger in `src/content/lessons.js` `SOURCES`); keep beginner copy, diagrams and battle labels numerically consistent with the code.
- Each guardian is a puzzle its zone's technique solves better than the best reachable naive configuration, without knife-edge planted data; the result of each new kind of cast stays on screen until the player continues.
- Original procedural pixel art (one scale, top-left light, cluster shading, selective outlines) and original multi-voice music; no external font/art/audio requests. Respect reduced motion without changing gameplay timing. Title Enter starts music; M mutes.
- Keyboard and touch for everything; no click-travel, mandatory forms, research articles or quizzes. Inspect screenshots of a normal desktop window, unusual window shapes (square, ultrawide, tall) and phone portrait and landscape; numerical tests do not replace playthroughs.
- Use small meaningful commits. Generated dependencies and build output stay ignored.
