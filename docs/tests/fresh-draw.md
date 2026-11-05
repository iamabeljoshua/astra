# Fresh drawings

What `ASTRA_FRESH_DRAW` does, how to run it, and what it measured on 5 November 2026 on Abel's Mac, on real sessions in real Chrome with the tone voice.

## The chain

Saved scene, then ready-made parts, then a fresh drawing, then words and the board with nothing said. The voice never waits on any of them, and a student who never sees a picture hears nothing about one.

A line that asks about something starts the work at once, without waiting for the tutor to ask, and the tutor's own ask in reply to that line starts nothing more. The recipe call from `docs/tests/fast-scenes.md` and one Sonnet 5.5 call run side by side. The Sonnet call writes the spoken lines and Canvas 2D code together in one reply, from `apps/agent/src/scenes/prompts/fresh-draw.md`. A part that fits or a saved copy stops it at once, at about a third of a cent, and a line that wants no picture stops when the router answers. The lines follow the tutor's live voice rules, read from the live prompt with `getTutorVoiceRules`, and the student's level, so they do not sound like a second person. A page with no WebGL skips the recipe call and goes straight to the drawing.

The lines and the drawing come from one reply and share moment names, so each line plays with what it names. `readFreshDrawing` drops a line whose moment the code never uses, because nothing on screen would match its words.

A drawing lands at the next comma or sentence, where a recipe waits for a sentence, with the old picture cleared on a new topic. A drawing the student has moved on from stops being written. A crisis, a stop, a seek, and a replay take the path they take for a recipe. A later idea in a lesson's plan gets a drawing too, because `prepare` runs the same work.

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

The drawing's cost goes through the tutor's caps and counts toward `ASTRA_SCENE_SESSION_LIMIT_USD`. A lesson makes at most 6 fresh drawings, counted when written, so one stopped early does not count. A saved copy does not count.

Tokens are the limiter, because Sonnet writes about 160 a second. The prompt asks for 20 short lines and the kit's short forms, `kit.shape`, `kit.bar`, `kit.disc`, `kit.flow`, and `kit.place`, and `show` and `hide` on a label or arrow take the place of writing out a fade. A drawing was about 1,700 tokens and is now about 1,000. The call has thinking off, because adaptive thinking held the first words of one drawing to 7.5 s and let another run out of tokens on "Introduction to calculus". The limit is 5,000 tokens, which is room to spare, because a reply cut at the limit cannot run.

## Run it

The agent needs `ASTRA_FRESH_DRAW=1` with `ASTRA_FAST_SCENES=1`. The page needs `VITE_FRESH_DRAW=1` with `VITE_FAST_SCENES=1`. With the agent's switch off, no drawing is written and a saved one is not played. With both off, main behaves as before, apart from one thing on the kit path: the frame's page tells the worker when it is first laid out, because a frame's script runs before its parent has sized it.

`node scripts/check-canvas-scene.ts --scenes <folder> --out <folder>` runs saved drawings through the real frame in real Chrome, with no model. `node apps/agent/src/scenes/proof/fresh-draw-proof.ts --web <url> --plan <file> --out <folder> --trace <folder>` drives whole lessons and saves a frame for each line. After a change to `packages/board/src/scene2d/` or `scene3d/lock-down.js`, run `node scripts/build-kit.ts` from `apps/web`.

## Measured

Real Sonnet 5.5, a real page in real Chrome 156, headed, muted, with the fake voice, on Abel's Mac at load 6 to 13 on 12 cores with swap near full. The first table is before the speed work.

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

### Speed, by stage

Each column is one lesson, read once, because budget allowed no more. The later column has a Haiku tutor to save money, which can move the wait to land but not the writing.

| Stage | Sonnet tutor, full prompt, typed mid-lesson | Haiku tutor, short drawing, typed mid-lesson |
| --- | --- | --- |
| The line to the ask | 3.1 s | About 0.3 s |
| Waiting on the recipe call | 1.5 s | 0 s, side by side |
| Writing | 13.6 s | 7.5 s |
| Page and frame check | 0.25 s | 0.24 s |
| Waiting to land | 6.2 s, for a sentence | 1.1 s, for a comma or sentence |
| The line to the picture on screen | 24.7 s | 9.35 s, a whole helicopter |

From Home, pressing Start to the picture went from 19.9 s to 12.3 s on one lesson each, with first words at about 3.2 s both times. The ask to landing went from 14.2 s to 8.75 s. The other 3.5 s is the session starting.

### Writers on the short prompt

Six topics with no tutor and no lesson, timed from the call to the last token. "Right" is one person reading 4 frames of each, with the words beside them.

| Writer | Time | Right | What went wrong |
| --- | --- | --- | --- |
| Sonnet 5.5, thinking on | 6.6 to 8.3 s, and 12.1 s on the sewing machine | 5 of 6 | Bees: "Back at the hive, she passes it mouth to mouth", with no hive drawn |
| `gpt-5.4-mini` | 4.1 to 7.2 s | 2 of 6 | Helicopter a grey blob on three legs. Comet a red ball with no tail. Bees a house and then an empty field. Sewing machine a shapeless mass |
| `gpt-6-luna` | 6.1 to 9.8 s, and 14.9 s on the helicopter | 2 of 6 | Helicopter and comet were syntax errors, so no picture. Bees a blob. Rainbow's colours gone by its last line |

Sonnet with thinking off took 7.4 to 9.0 s on the helicopter, the sewing machine, and calculus. Those 3 drew whole objects, and the helicopter and submarine lessons above ran on it. The fastest that can do it right is still Sonnet. "Introduction to calculus" drew a bike on a hill at 1,127 tokens.

### Painting as it arrives

Not built. The whole object's lines arrive about 2 s before the last line, at 4.7 to 5.7 s of 6.6 to 8.3 s, so it would bring the first picture about 2 s sooner. Canvas code can do it only with a new frame for each step, because the worker's CSP refuses `eval`, and `check-kit-sandbox.ts` holds it to that. A frame took 90 to 130 ms to open. The data form needs no new frame, and it scored 5 of 10 right in the lab against 8 of 10 for code. A frame per step is the one to try if 9 s is still too slow.

## What this does not prove

- That a drawing is true. Nothing here reads whether a fact is right, and the line under each drawing says so: "Drawn for this topic. Not yet checked by a person."
- That the words match the picture beyond the moment names. A line can name a moment the drawing uses and still say more than it shows.
- A flash check. The prompt forbids flashing and strobing, and no code reads it, as `check-kit-scene.ts` does for a person's review.
- Fractions in Newsreader. The worker loads Barlow only, so `kit.fraction` and `kit.formula` fall back to a system serif.
- Safari, Firefox, a phone, or a laptop with Intel or AMD graphics. The sandbox is measured on Chrome only, so the rest get words and the board.
