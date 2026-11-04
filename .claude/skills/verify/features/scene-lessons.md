# Scene lessons

A student opens a session and the tutor speaks. It starts on the plain board, and when a checked scene is ready it sets the scene up in words at a pause, and the scene plays on the board in time with those words. Without WebGPU, or while a scene is not ready, the lesson stays on the plain board. This is off unless the web app runs with `VITE_SCENE_LESSONS=1`.

## Sub-features

- `lesson-opens`: a session started from a card or a typed question opens a spoken lesson.
- `scene-at-pause`: a ready scene shows after the opening, with a set-up line first and no spinner.
- `scene-saved`: a scene made once plays with no write on the next session for that card.
- `scene-stop`: a typed reply freezes the scene on its second, and the tutor carries on from the cut word.
- `scene-themes`: the take follows the light and dark themes.
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

## Gotchas

- The API must read the same `SCENE_STORE_DIR` as the lesson service, or every take is refused.
- A card goes straight to its saved scene. A typed question goes through the router, whose topic can differ between runs, and a new topic writes a new scene and spends money.
- `.scene-store/` is local and ignored by git, so a fresh checkout has no saved scenes.
