# Fast scenes

What `ASTRA_FAST_SCENES` does, how to run it, and what it measured on 5 November 2026 on Abel's Mac, on real sessions in real Chrome with the tone voice. Load was 7 to 63 on 12 cores, with swap near full.

## The path

A scene is a recipe: spoken lines, approved parts, motions, labels, and a camera, written as JSON Lines by one Haiku call. A strict schema reads each line in `apps/agent/src/scenes/recipe/recipe.ts`, and any field it does not list never gets past it. No field is ever run. The parts in `recipe/parts/` are the only code, kept in the repo and named by a hash of their source. A saved scene holds the exact part code it played with, so a later edit cannot change an old seek or replay.

The chain is saved scene, then recipe, then words and the board with nothing said. `ASTRA_FRESH_DRAW` adds a fresh drawing after the recipe, in `docs/tests/fresh-draw.md`. The ManimGX writer and live written code stay off on this path, so a math topic with no saved scene gets the board alone. Route and match run beside the recipe call. A safety or dangerous read stops the picture, and a picture never lands before the read has answered.

A scene lands at the end of the tutor's sentence. Once the page has the picture, the session asks the reply to end there and starts the scene's turn behind it. `speak-turn.ts` stops sending audio about 100 ms before the first word of the next sentence, on what has really left the agent and not on a guess at the source's queue, so no word of that sentence is heard. It waits for that audio to play, then stops the turn, and the scene's lines start after the line's usual silence. The brain hears exactly what was sent. A question with words after it counts as a sentence end. A reply with nothing heard yet ends at once for an early picture, and a student who talks over the end of the sentence stops it at once. If the reply ends first, the scene lands at the pause.

## Whose words

The recipe call writes the lines, with the tutor's own voice rules read from the live prompt, the topic, and the student's level. `RecipeAsk` holds no other field, so nothing else about a student can reach it. A tutor's reply that carries its own recipe read better on the 8 topics tried, with first words at a median of 4.5 s and the recipe done at 5.1 s, and the separate Haiku call took 2.9 s and Sonnet 4.7 s. It lost for two reasons. A reply is written with the student's notes in view, so its lines could not be saved for the next student. And the parts' 18,700 characters would go in every tutor call, which grows with the catalogue. A reader of the real frames still says the join between the tutor and the scene can sound like two people. That is the first thing to revisit.

## A new topic, a side question, a return

`apps/agent/src/tutor/scene-screen.ts` owns what is on screen, its lesson title, and any words a student's line cut. A new title takes the old picture away on the next beat and asks for its own scene, whether or not the tutor asked. A title that names the scene on screen changes nothing, so a side question keeps the picture, and the rest of its lines play at the pause after the answer, from the start of the line they were cut in. Past one more student turn they are dropped. A title on the shelf brings that scene back at the moment it reached, and a scene heard to its end comes back on its last moment. A crisis drops all words left, and no scene talks until the student speaks again.

The next beat is the limit on taking a picture away. A reply whose words have all reached the voice has no next beat until the next stretch.

## Review and saving

A recipe shows before its review, because it runs no model code. A Sonnet read behind the picture writes to `<store>/recipe-reviews.jsonl`. A clean read saves a shared copy for that topic and level, and a hold keeps it from the library. It never pulls a picture. It held 3 of 24 here, with reasons such as "the recipe has no move on 'slip'". It also kept scenes a person's reading faulted, so it is not a truth check. The owner's own copy stays either way, for replay.

## Parts

`node scripts/parts-approval.ts` serves a page on 127.0.0.1:7670 to approve each part by eye, saved to `recipe/parts/approvals.json`. Abel approved all 31 parts on 6 November 2026, recorded against each part's code at that commit, so main uses them without `ASTRA_FAST_SCENES_ANY_PART`. Editing a part takes back its approval. `getUsableParts` gives the model only approved parts, unless `ASTRA_FAST_SCENES_ANY_PART=1` outside production. `node scripts/check-parts.ts` draws every part in real Chrome with all its motions, and fails one that throws, draws nothing, or is not the same frame when drawn again. Misses go to `<store>/part-misses.jsonl` with their topic, reason, and level, and no student.

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

## The chain with everything on

A student's own ask tries, in order: a saved scene, parts, a fresh drawing, live 3D, then words and the board. `createRecipeWork` holds the order. It reaches live 3D only on a typed question the router read as a solid thing, after no saved scene matched, no part fit, and no fresh drawing came, and with `ASTRA_KIT_LIVE=1`. The queue and a card never reach it. A live scene runs its frame check and page in PR 127's worker, and a review that passes sets `reviewed` on its record, which the take route asks for.

## The starter library

`recipe/starter/` holds 24 recipes from the Haiku run Abel enjoyed, about 26 KB. Run this once per store:

```
SCENE_STORE_DIR=<store> ASTRA_FAST_SCENES_ANY_PART=1 node scripts/import-recipes.ts
```

Each recipe gets the reading a fresh recipe gets: the schema, the part check, and the word check, with no model. It saves as a shared scene under its own topic, and a second run changes nothing. `--from <run folder>` first copies a lab run's passing recipes into the library. Of the 33 in `A-haiku`, these stayed out: `car-engine`, which a person found wrong, `dev-seasons`, whose recipe names no part, and `atom`, `bees`, `dev-mars`, `helicopter`, `motor`, `sewing`, and `submarine`, where the model said no part fits. No model reviewed the 24, and I read their words, not their frames.

A question with the same words as a saved title in another form, such as "How does a jet engine work?", plays with no model read. Words that differ go to the matcher as before.

## The first seconds

The job starts about 0.5 s after the press, because the API opens the room as the session saves. It reads `GET /agent/sessions/:id/opening`, which names the room's student and a typed question, for the worker alone. LiveKit's dispatch metadata and the tutor's brief stay free of both, as their tests require.

- **The picture starts at the press.** The worker asks for the scene from the student's words before the page joins, and sends it once the page says it can play.
- **The page's first messages need no wait.** The job hears them up to 2 s before LiveKit names their sender. The API named the only student with a token for the room, so the worker reads them at once. That took first words from 3.1 to 3.9 s to 1.4 to 3.8 s.
- **The picture is the first teaching.** The greeting plays as it did, because it says this is an AI tutor. When it ends, a ready picture comes before the tutor's first line. The first reply holds its first word 2.5 s at most for a picture on its way, once. `isClearToLand` already waits for the safety read, so a picture never comes ahead of it, and a crisis still ends the ask.
- **The stylish wait.** With `VITE_FAST_SCENES=1`, the connecting screen shows the topic and holds its dots until the picture lands, 5 s from the press at most. The shared board gains nothing. Only past 15 s without a tutor does the screen say why.

A saved scene's first run went on past its picture with no dead air: the scene's lines ran to 18.3 s, and the tutor's next line followed in the same second. A reply cut this way is paid for and never heard, $0.0345 on a cold prompt cache in that run.

The plan and the first reply still start when the page's line arrives, 1.2 to 2.9 s after the press. Starting them at the job would need the brain to run a turn with nobody to hear it.

Measured on 5 November 2026 in real Chrome, headed and muted, with the fake voice and real models. It was never a quiet Mac.

| Stage, from the press | Before, 4 presses at load 5 to 10 | Now, 12 presses at load 7 to 19 |
| --- | --- | --- |
| Session saved | 0.1 to 0.2 s | The same |
| The page opens | 0.7 to 0.8 s | 0.7 to 1.1 s |
| The job in the room | 0.5 to 2.9 s | 0.6 to 3.3 s |
| The page in the room | 1.2 to 3.0 s | 1.3 to 2.9 s |
| The job reads the page's line | about 3 s | With the page in the room, or as it reads the opening route |
| First words, the greeting | 3.1 to 3.9 s | 1.4 to 3.8 s |
| The scene asked for | 5.8 s | 0.7 to 3.3 s |
| Picture and its first line, saved | 11.4 s | 4.2, 4.2, 4.4, and 5.0 s on the final code. 5.1 and 5.9 s on the two heads before it |
| Picture and its first line, fresh parts | p50 16.3 s, in the table above | 7.2 s, real, before the first word held. 7.9 s after it, with a 2 s fake writer and the job at 3.3 s |
| No part fits, the reply's first sound | 6.7 s | 3.6 and 5.8 s |

## What this does not prove

- Live 3D with a real writer on this tree. Its budget here was $0.40 and one fresh scene costs about $0.47, so a real headless Chromium ran the frame check on a small scene and a hostile one in PR 127's worker, and the fake writer ran the route. `docs/tests/scenes.md` holds what PR 126 measured before the merge.
- A Home card on the page. A card's saved scene already opens its lesson, and `How DNA copies itself` is the one card title the library shares today.
- Chris's voice on these numbers. They used the fake voice.
- That the lines are true. A person's reading of the frames found faults in lines the review kept, such as a signal starting "in the cell body" and "Blue blood".
- That a part's own cycle matches its words. A cycle runs on its own clock, so a line can name a stroke the part is not showing.
- Chris's voice over a cut, on most of these numbers. They used the tone voice.
- A phone, a laptop with Intel or AMD graphics, or a slow link. Phone width was a viewport in Chrome on this Mac.
- The approval page's pixels, which were not read before this was written.
