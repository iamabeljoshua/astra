# Fast scenes

What `ASTRA_FAST_SCENES` does, how to run it, and what it measured on 5 November 2026 on Abel's Mac, on real sessions in real Chrome with the tone voice. Load was 7 to 63 on 12 cores, with swap near full.

## The path

A scene is a recipe: spoken lines, approved parts, motions, labels, and a camera, written as JSON Lines by one Haiku call. A strict schema reads each line in `apps/agent/src/scenes/recipe/recipe.ts`, and any field it does not list never gets past it. No field is ever run. The parts in `recipe/parts/` are the only code, kept in the repo and named by a hash of their source. A saved scene holds the exact part code it played with, so a later edit cannot change an old seek or replay.

The chain is saved scene, then recipe, then words and the board with nothing said. `ASTRA_FRESH_DRAW` adds a fresh drawing after the recipe, in `docs/tests/fresh-draw.md`. The ManimGX writer and live written code stay off on this path, so a math topic with no saved scene gets the board alone. Route and match run beside the recipe call. A safety or dangerous read stops the picture, and a picture never lands before the read has answered.

A scene lands on the voice's clock. `speak-turn.ts` tells the session as the student reaches the quiet after a sentence, and the session stops the reply there and says the scene's lines in its place. The brain hears exactly what was heard. A question with words after it counts as a sentence end, and one that ends the reply has no next word. If the reply ends first, the scene lands at the pause.

## Whose words

The recipe call writes the lines, with the tutor's own voice rules read from the live prompt, the topic, and the student's level. `RecipeAsk` holds no other field, so nothing else about a student can reach it. A tutor's reply that carries its own recipe read better on the 8 topics tried, with first words at a median of 4.5 s and the recipe done at 5.1 s, and the separate Haiku call took 2.9 s and Sonnet 4.7 s. It lost for two reasons. A reply is written with the student's notes in view, so its lines could not be saved for the next student. And the parts' 18,700 characters would go in every tutor call, which grows with the catalogue. A reader of the real frames still says the join between the tutor and the scene can sound like two people. That is the first thing to revisit.

## A new topic, a side question, a return

`apps/agent/src/tutor/scene-screen.ts` owns what is on screen, its lesson title, and any words a student's line cut. A new title takes the old picture away on the next beat and asks for its own scene, whether or not the tutor asked. A title that names the scene on screen changes nothing, so a side question keeps the picture, and the rest of its lines play at the pause after the answer, from the start of the line they were cut in. Past one more student turn they are dropped. A title on the shelf brings that scene back at the moment it reached, and a scene heard to its end comes back on its last moment. A crisis drops all words left, and no scene talks until the student speaks again.

The next beat is the limit on taking a picture away. A reply whose words have all reached the voice has no next beat until the next stretch.

## Review and saving

A recipe shows before its review, because it runs no model code. A Sonnet read behind the picture writes to `<store>/recipe-reviews.jsonl`. A clean read saves a shared copy for that topic and level, and a hold keeps it from the library. It never pulls a picture. It held 3 of 24 here, with reasons such as "the recipe has no move on 'slip'". It also kept scenes a person's reading faulted, so it is not a truth check. The owner's own copy stays either way, for replay.

## Parts

`node scripts/parts-approval.ts` serves a page on 127.0.0.1:7670 to approve each part by eye, saved to `recipe/parts/approvals.json`. Editing a part takes back its approval. `getUsableParts` gives the model only approved parts, unless `ASTRA_FAST_SCENES_ANY_PART=1` outside production. `node scripts/check-parts.ts` draws every part in real Chrome with all its motions, and fails one that throws, draws nothing, or is not the same frame when drawn again. Misses go to `<store>/part-misses.jsonl` with their topic, reason, and level, and no student.

## Where it can draw

The page needs `VITE_FAST_SCENES=1`. Depth needs `VITE_KIT_SCENES=1`, a width above 860 px, no reduced motion, and the worker sandbox's own check. Otherwise the recipe draws flat, with no bloom and a fixed side view. Both run in the worker sandbox, so both need WebGL2 on an `OffscreenCanvas` in a browser that sandbox has been measured on, which today means Chromium. Safari, Firefox, and Chrome on iOS get words and the board until it is measured there, and so does a page with no WebGL.

## Measured

| Check | Result |
| --- | --- |
| From Home, pressing Start session to the picture on the page | 20 scenes: p50 16.3 s, p95 20.5 s, worst 20.5 s. 8 of 20 under 15 s. Load 7 to 41 |
| From Home, to first words | p50 7.0 s, p95 10.2 s, worst 10.7 s, which includes the greeting |
| The tutor's ask to the scene landing | 29 asks: p50 5.7 s, p95 9.5 s, worst 13.1 s |
| The recipe call | 32 calls: p50 2.7 s, p95 3.6 s, worst 4.4 s, about $0.0004 |
| The page having the scene to the scene landing | 26 scenes: mean 1.8 s, p50 1.4 s, p95 4.3 s, worst 6.2 s. The prototype's arithmetic said a mean of 1.65 s and at most 4.1 s |
| Typed mid-lesson, the line to a fresh scene | 7.8, 8.8, and 9.7 s at load 6 to 10. 13.4, 14.3, and 18.2 s at load 41 to 63 |
| Typed mid-lesson, the line to a saved scene | 6.6 s at load about 30 |
| No part fits | Bees, helicopter, submarine, rocket engine on no WebGL: words and the board, and the miss logged |
| All 31 parts in the worker sandbox | 29 passed on the full run, and `moonPhases` and `seasons` passed after a fix, along with `alveoli` and `lungs`, in both directions at 7 times |
| A side question | The picture stayed and its time ran from 6.8 to 18 s after the answer |
| A new topic | The old picture left at 9 s and the new one came at 11.1 s after the line |
| Real Chris, from Home | One scene, 14.2 s, first words 4.7 s, load 9.5, on the moon's phases |
| Replay on Light and Dark | The scene played on both from the same second, on one lesson. Seeks gave the same frame forward and backward at 3 points in Dark |
| Hands-on, in Dark | The scene went to 30% of the right side, 12 px from its edges. A click brought it back big, and a second click put it back |
| A crisis during a scene | The scene held 4.2 s, the picture went to the corner, the help line played, and no scene words came back |

The press to the ask costs more than everything after it, about 8 to 11 s from Home on these runs, in session start, joining the room, the greeting, and the tutor's first words. That is what keeps Home from 15 s on this Mac. No run here was on a quiet machine. All but the last lesson ran with no `ASTRA_AGENT_KEY`, so with no profile, level, or memory read, which a real session does.

## What this does not prove

- That the lines are true. A person's reading of the frames found faults in lines the review kept, such as a signal starting "in the cell body" and "Blue blood".
- That a part's own cycle matches its words. A cycle runs on its own clock, so a line can name a stroke the part is not showing.
- Chris's voice over a cut, on most of these numbers. They used the tone voice.
- A phone, a laptop with Intel or AMD graphics, or a slow link. Phone width was a viewport in Chrome on this Mac.
- The approval page's pixels, which were not read before this was written.
