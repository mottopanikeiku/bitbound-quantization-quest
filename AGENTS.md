# Working on Bitbound

An original educational browser RPG. No runtime agents, API keys, analytics, remote assets, or copyrighted franchise characters.

## Bounded orchestration

Use an integration owner and independent specialists: numerical research, deployment research, game/learning design, and adversarial review. Each slice gets an objective, owned files, a fixed interface, observable acceptance criteria and an artifact handoff. Do not let parallel workers edit the same file. The integration owner handles commits and consolidated verification after a wave, not competing mid-flight builds.

This follows [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) and [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system): simple composable workflows, explicitly bounded delegation, primary-source research, artifact-based handoffs and end-state verification.

## Dispatch and acceptance

- State one result, an exhaustive write allowlist, fixed interfaces/units, concrete player actions and required evidence. No unbounded child spawning or shared-file edits.
- Record actual runtime provider/model identifiers. Agent names are not model provenance. Pin a discovered model selector when a specific model is requested; do not silently report fallback workers as that model.
- Browser origins isolate saves, not builds. All previews of `dist/` share the same candidate: the lead freezes it during review and records the loaded JS/CSS identity. Source changes remain unverified candidates until the consolidated rebuild.
- Separate implemented, observed-pass, observed-fail and not-checked. Numerical/source review is not a seven-guardian playthrough; generated audio is not human listening; a successful CI deployment is not gameplay verification.
- Only the integration owner builds/tests/formats after a wave, resolves contradictory findings, pushes commits and approves publication. Play the final candidate through all seven friendships and ending; verify both restart paths, retained feedback, portrait controls, earned saves and all music scenes.

These contracts adapt [OpenAI's GPT-6 prompting guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra#prompting-best-practices), [Codex prompting guidance](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide), and the Anthropic references above. Family/model-specific guidance is a starting point, not empirically optimal Sol prompting or a reason to add a runtime agent framework.


## Quality contract

- Quantization must affect actual gameplay through computed reconstruction, toy forward outputs and declared packet costs. Damage/byte charge are fictional game rules, never task accuracy/device memory.
- Verify technical claims against primary papers/official docs. Keep beginner explanations and inspectable equations consistent.
- Adversarial review covers both mathematical correctness and novice gameplay: discoverability, meaningful choices, retry feedback, mobile/keyboard accessibility, and transfer beyond the toy experiment.
- Original procedural pixel art and multi-voice music; no external font/art/audio requests. Respect reduced motion without disabling gameplay. Title Enter explicitly starts with music; M mutes.
- Play the actual RPG: held WASD/camera/collision, physical NPCs, contact encounters, timed attacks, foe turns, guard/scan/snacks, camp recovery, progression, save/restart and ending. No click-travel, mandatory forms, research articles or quizzes. Inspect desktop and reflowed mobile screenshots; numerical tests do not replace playthroughs.
- Use small meaningful commits. Generated dependencies and build output stay ignored.
