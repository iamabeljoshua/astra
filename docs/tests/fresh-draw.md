# Fresh drawings

What `ASTRA_FRESH_DRAW` does, how to run it, and what it measured on 5 November 2026 on Abel's Mac, on real sessions in real Chrome with the tone voice.

## The chain

Saved scene, then ready-made parts, then a fresh drawing, then words and the board with nothing said. The voice never waits on any of them, and a student who never sees a picture hears nothing about one.

The recipe call from `docs/tests/fast-scenes.md` runs first. When it says no part fits, or it fails, one Sonnet 5.5 call writes the spoken lines and Canvas 2D code together in one reply, from `apps/agent/src/scenes/prompts/fresh-draw.md`. The lines follow the tutor's live voice rules, read from the live prompt with `getTutorVoiceRules`, and the student's level, so they do not sound like a second person. A page with no WebGL skips the recipe call and goes straight to the drawing.

The lines and the drawing come from one reply and share moment names, so each line plays with what it names. `readFreshDrawing` drops a line whose moment the code never uses, because nothing on screen would match its words.

A drawing lands at the next sentence, as a recipe does, with the old picture cleared on a new topic. A crisis, a stop, a seek, and a replay take the path they take for a recipe. A later idea in a lesson's plan gets a drawing too, because `prepare` runs the same work.

## Who may run what

Model-written code now runs on a student's device, so three walls hold.

1. **The code check.** `readFreshDrawing` refuses code with no `scene(kit)`, a name that reaches outside the worker, an address, or too many lines, and `getCodeProblems` reads it as it reads any scene's code. `getCleanLines` reads the spoken lines as it reads a recipe's.
2. **The worker.** `packages/board/src/scene2d/runtime.js` is a small runtime beside the Three.js one. It runs in the same worker and the same `<iframe sandbox="allow-scripts">` with the same CSP, and both call `scene3d/lock-down.js`, so a fix there reaches both. `node scripts/check-kit-sandbox.ts` runs the same reach attempts and the same spin checks against it. It has no WebGL, so a device without WebGL can still have a drawing.
3. **The frame check.** Before the runtime says ready, `scene2d/frame-check.js` draws each spoken line twice and reads the frame. See below.

## What the frame check catches

| Finding | What happens |
| --- | --- |
| The drawing throws while building or at a sampled second | No picture |
| A blank frame, read as too few edges at 320 by 180, so a sky alone reads as blank | No picture |
| Text cut by the frame | No picture |
| Text showing `NaN`, `undefined`, `Infinity`, or a long unrounded number | No picture |
| A number a canvas would silently ignore, such as `NaN` passed to `lineTo` | No picture |
| A label's pointer off the frame or on plain background | The label stays and its pointer goes |

A pointer on nothing costs only the pointer because a person read the helicopter with its pointer on plain air as right, and refusing the picture for that lost 2 of the 8 right pictures in the saved set. It cannot see a wrong fact, force on the wrong part of a motor, or a huge disc for an electron. No model review gates a picture.

"No picture" means nothing is said, and the own copy is taken back so that asking again draws a new one.

## Saving

A drawing is saved for its owner first, because the API has to serve it to the page. Only once the page says its frame check passed does a Sonnet read run behind the picture, writing to `<store>/recipe-reviews.jsonl`. A clean read saves a shared copy for that topic and level. A hold never takes a picture from anyone: the owner keeps their copy, and the next student gets a drawing of their own. A typed topic is a student's words shaped by a model, so this read is the step that lets it reach other students.

A second ask by the same student is near instant, in the same words or in others, because `match` looks through their own drawings as well as the shared ones.

## Spend

The drawing's cost goes through the tutor's caps and counts toward `ASTRA_SCENE_SESSION_LIMIT_USD`. A lesson makes at most 6 fresh drawings. A saved copy does not count.

## Run it

The agent needs `ASTRA_FRESH_DRAW=1` with `ASTRA_FAST_SCENES=1`. The page needs `VITE_FRESH_DRAW=1` with `VITE_FAST_SCENES=1`. With the agent's switch off, no drawing is written and a saved one is not played. With both off, main behaves as before, apart from one thing on the kit path: the frame's page tells the worker when it is first laid out, because a frame's script runs before its parent has sized it.

`node scripts/check-canvas-scene.ts --scenes <folder> --out <folder>` runs saved drawings through the real frame in real Chrome, with no model. `node apps/agent/src/scenes/proof/fresh-draw-proof.ts --web <url> --plan <file> --out <folder> --trace <folder>` drives whole lessons and saves a frame for each line. After a change to `packages/board/src/scene2d/` or `scene3d/lock-down.js`, run `node scripts/build-kit.ts` from `apps/web`.

## Measured

Real Sonnet 5.5, a real page in real Chrome 156, headed, muted, with the fake voice, on Abel's Mac at load 6 to 9 on 12 cores with swap near full.

| Check | Result |
| --- | --- |
| Helicopter, typed mid-lesson | 24.7 s from the line to the picture: line to ask 3.1 s, recipe call 1.5 s, writing 13.6 s, page 0.25 s, then 6.2 s waiting for the next sentence. A whole helicopter, with the words "That's the whole machine: a fuselage hanging under a spinning main rotor." |
| Helicopter from Home, before the rule that the first moment shows the whole object | 19.9 s from pressing Start and 14.2 s from the ask. It drew a rotor blade and no helicopter, for the tutor's topic "how a helicopter rotor creates lift" |
| The same student asking again, in other words | 11.6 s from pressing Start and 5.7 s from the ask. The page had the drawing 1.8 s after the ask, no drawing was written, and the rest was the wait for the next sentence |
| Sewing machine from Home | 18.6 s from pressing Start and 13.3 s from the ask. Needle, thread, cloth, and bobbin, as a plain diagram |
| Rainbow from Home, where a part fits | 11.3 s from pressing Start, with no drawing written |
| The 10 saved lab drawings through the frame check | All 10 played, 108 to 1056 ms from the frame opening to ready. Pointers went from "Air pushed down" on the helicopter, "Electron" on the atom, "Force" on the motor, and "Ballast tank" on the submarine. A person had faulted the atom and motor for those labels, and read the helicopter and submarine as right |
| Cost of one new drawing | $0.028 to $0.035 for the writer when it wrote its prompt to the cache, and the read behind it $0.007 to $0.008 |
| The read behind the picture | Held all 3 new drawings, and passed the one recipe and one part scene it read. So no drawing here reached a second student, and the owner kept each |
| Joining | 3 of 8 lessons from Home said "Your tutor could not connect just now" with no job reaching the agent, and LiveKit logged "not dispatching agent job since no worker is available" with its CPU at 0.9. Those lessons never reached a drawing |

## What this does not prove

- That a drawing is true. Nothing here reads whether a fact is right, and the line under each drawing says so: "Drawn for this topic. Not yet checked by a person."
- That the words match the picture beyond the moment names. A line can name a moment the drawing uses and still say more than it shows.
- A flash check. The prompt forbids flashing and strobing, and no code reads it, as `check-kit-scene.ts` does for a person's review.
- Fractions in Newsreader. The worker loads Barlow only, so `kit.fraction` and `kit.formula` fall back to a system serif.
- Safari, Firefox, a phone, or a laptop with Intel or AMD graphics. The sandbox is measured on Chrome only, so the rest get words and the board.
