# Scene lessons

A student opens a session and the tutor speaks. It starts on the plain board, and when a checked scene is ready it sets the scene up in words at a pause, and the scene plays on the board in time with those words. Without WebGPU, or while a scene is not ready, the lesson stays on the plain board. This is off unless the web app runs with `VITE_SCENE_LESSONS=1`.

## Sub-features

- `lesson-opens`: a session started from a card or a typed question opens a spoken lesson.
- `scene-at-pause`: a ready scene shows after the opening, with a set-up line first and no spinner.
- `scene-saved`: a scene made once plays with no write on the next session for that card.
- `scene-stop`: a typed reply freezes the scene on its second, and the tutor carries on from the cut word.
- `scene-themes`: the take follows the light and dark themes.
- `next-scene`: in a tutor session, the next idea's scene is held in the page before the tutor reaches it, and lands at the pause after the tutor goes on. `pnpm --filter @astra/agent next-scene-proof` drives it, and `docs/tests/lesson-flow.md` has the setup.
- `plain-board-falls-back`: no WebGPU, a damaged take, or a kit-bound request stays on the plain board.

## How to get to it (user POV)

- Sign in, then press a card on Home.
- Sign in, then type a question into the box on Home and send it.

## Driving it with pnpm verify

Preconditions: `pnpm verify` does not start the lesson service, so start the stack with the commands in `docs/tests/scenes.md`, with `pnpm --filter @astra/scene-worker image` run once. Use `LESSON_VOICE=tone` unless the run needs Chris. Run the commands from `apps/agent`.

- `scene-at-pause`: `WEB_PORT=6330 node src/scenes/proof/lesson-proof.ts --card "What a derivative really measures" --out <folder>` passes when `summary.json` has a `firstSceneAtS` and `proofs.json` has `samePixels` of 12.
- `scene-stop`: add `--stopAt 8`. `stop.json` shows `isFrozen` true.
- `scene-themes`: add `--theme dark --switchTheme`. `after-theme-switch.png` shows the other theme's take.
- `plain-board-falls-back`: add `--noGpu` or `--damageTake`. `firstSceneAtS` is null and the caption reaches the closing question.

## In a tutor session

The real session path has its own switch, `ASTRA_TUTOR_SCENES=1` on the agent and `VITE_TUTOR_SCENES=1` on the web build, with the same `SCENE_STORE_DIR` on the agent and the API.

Live 3D writing has one more switch, `ASTRA_KIT_LIVE=1` on the agent, with `VITE_KIT_SCENES=1` on the web build. To drive it, run `node src/scenes/proof/tutor-scene-proof.ts --web <url> --realChrome --ask "how do volcanoes erupt" --out <folder>` from `apps/agent`, on a stack with its own student, because a proof ends the session it drives. `--realChrome` runs real Chrome, headed and muted, with none of the defaults a driver adds. Each fresh question costs about $0.30.

- `tutor-scene`: from `apps/agent`, `node src/scenes/proof/tutor-scene-proof.ts --card "What a derivative really measures" --trace <trace folder> --out <folder>` passes when `summary.json` has a `sceneSeenAtS`, a `smallPlace` with `share` 0.3 and both insets 12, and a `clickedBack` with `isBigOverBoard` true. It sends a line that asks for a problem to work on, and the tutor's own `boardMode` or task moves the scene.
- `--noGpu` and `--damageTake` give no scene and no word about one.
- The seeded student's cards change, and a card needs a saved scene to land at once. A typed question writes a new scene, and on a loaded Mac that takes far longer than its window.

## 3D scenes

`VITE_KIT_SCENES=1` on the web build plays a topic's stored kit scene from `<store>/kit/<topicId>/` beside its 2D take. `apps/agent/src/scenes/proof/tutor-scene-proof.ts` runs on real Chrome by default, because the headless shell keeps a sandboxed frame in the page's own process. Add `--headed` for a real window. Its flags are `--phone`, `--noWebgl`, `--reducedMotion`, `--kitFails`, `--kitSlowMs <ms>`, `--kitStallsAfterFrames <count>`, `--seekTimes <list>`, `--replay`, and `--replayNoScene`. `[data-engine]` says `kit` or `flat`. Every headed browser needs `--mute-audio`. A run needs `ASTRA_SHARED_PLAYS_A_DAY` and `ASTRA_SPEND_LIMIT_CREDITS` raised on the agent, and a session on the card takes the card off Home, so clear that student's sessions between runs.

## Gotchas

- The API must read the same `SCENE_STORE_DIR` as the lesson service, or every take is refused.
- A card goes straight to its saved scene. A typed question goes through the router, whose topic can differ between runs, and a new topic writes a new scene and spends money.
- `.scene-store/` is local and ignored by git, so a fresh checkout has no saved scenes.
