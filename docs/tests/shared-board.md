# The shared board

M3.12. The student and the tutor work on one board. The student types on it, line by line, and acts on what the tutor sets, in any subject. Code checks what it can, at once, and the tutor reads the rest and says only what it can stand behind.

## The shape

A `task` has one general shape, set on a word of the tutor's, at any moment in a lesson. A new task replaces the open one, and work that finishes a task closes it, so the tutor can stop teaching, set something, wait, and go back to teaching.

| Way | What the student does | What code can be certain of |
| --- | --- | --- |
| `write` with `on` | Types lines of working on a math line | Each line, against the problem |
| `write` with `accepts` | Types a short answer | A match is right. A number against numbers can be wrong. Any other words go to the tutor |
| `write` with `reads` `words` or `code` | Types thoughts, answers, or code | Nothing. No line of code ever runs |
| `pick` | Picks a term of a math line or a node of a diagram | Against `answer`, if the tutor gave one |
| `place` | Puts an item in each slot, for steps in order, matching, and labels | Against `answer`, if the tutor gave one |
| `drag` | Moves a point along a plot's curve | `flat` and `zero`, read from the curve itself |

An answer key comes from the tutor, so code is certain only against that key. `drag` is the one way where code needs no key.

Lesson kinds are M3.9's. This board only has to let the tutor set any of these mid-lesson, and it does.

## The look

Abel chose the look of Prototype B, in `/Users/abel/startup/astra-tinker/board`, so a running session follows it and not `grid-cols-session`. The tutor's words stay on the left at `minmax(300px, 400px)`, and the right side holds the visual or the board. `SharedBoard` lays out rows in normal flow, each with a 240 px gutter for marks, notes, and "Read as", and the line being typed is the next row. The student writes in `ink` and the tutor in `pen`. `MovingDot` is the one dot: it rests over the tutor's words, flies to the line on a mark or a written line, dims on the live line, breathes while thinking, and grows with the voice's loudness.

These differ from `docs/DESIGN.md` on the prototype's say: no outer border on the board, the prototype's type sizes, and the proposed `pen` token. These differ from the prototype: the app's own top bar, no Numbers panel, no intro page, "Read as" on every line, a Talk button, Math keys as a row of keys for the plain line with no MathLive, and plain rounded pen strokes with no dependency for varying width.

## Teaching and hands-on

`boardMode` is a tutor command that lands on a word, so `{"kind":"boardMode","mode":"handsOn"}` before "together" in "let's try one together" moves the visual as that word plays. Anything new written or a task brings the board in by itself, so nothing lands hidden. `getVisualPlace` reads the move from the clock, 560 ms on `cubic-bezier(.2,.75,.2,1)`, to 30% in the top right corner, 12 px in, so a replay lands on the same frame and a frozen board stays frozen. The board keeps a column clear, so no line passes under the small visual. The student can click the small visual back up and put it back, which is the page's own and not in the log. Typing also brings the board in, because a student must always be able to answer. Reduced motion jumps. A phone stacks.

The seam for a scene is the `visual` prop of `BoardStageView`, through `LiveBoard`. What goes there is drawn once at full size and moved by a transform.

## Writing with the pen

Each stroke lands as it is drawn and goes through `inkStroke`, so it is in the log and a replay draws it. After a 2 s rest, or on Done, the row shows "Reading your writing" and the agent draws the strokes to a plain PNG itself, in `rasterize-ink.ts`, so what the model reads is exactly what the log holds and no picture crosses the data channel. Haiku 5.5 reads it, and reads words and labels as well as math, fixing nothing. Math it wrote still has to pass as math the board can set. A confidence under 0.7, or any symbol it names as doubtful, means code judges nothing and the tutor asks.

`pnpm --filter @astra/agent eval:ink` writes each line with the board's stroke font and reads it back. These are synthetic hands, so this is likely optimistic, and Abel's own hand is the real measure.

| Lines | Read exactly | Code said | Worst case |
| --- | --- | --- | --- |
| 44 wrong math lines | 44 | 39 wrong, 5 unsure | 0 read as right |
| 12 right math lines | 12 | 8 right, 4 unsure | 0 called wrong |
| 16 lines of words, one misspelled on purpose | 16 | Not judged | 0 fixed |

It cost $0.007 for 72 reads, at 1.9 s a read.

## Dragging a point

A `drag` task puts the student's point on the curve, near its start, with a ring until it is first moved. It moves in steps of about a fiftieth of the plot, and only from near the point. Letting go sends the whole path, and a press that moved nothing sends nothing. The check is never finer than the point can move, so a wide plot can always be landed. A wrong place waits, because the student may be trying places, and the tutor looks at a pause. The moves land in the log with the work, so a replay moves the point at the same moments.

A line the tutor rewrites with a change takes what hung on it, as PR 88 made it: the student's ring and any task on that line. It says something new, so the ring no longer points at anything, and the tutor sets a new task if it wants one.

## Answering aloud

Any exercise can be answered by voice, as well as by typing or the pen. The microphone stays off until Talk.

- Muse's final goes down the same road as a typed or written line. It lands on the board, and `Read as` shows how it was heard, with "Not what you said? Type it."
- `decideSpoken` in `apps/agent/src/tutor/watcher/spoken-answer.ts` decides with code first. With no open task, or for a question, a word to the tutor, or a task of code, it stays conversation and no line lands.
- Spoken math reads through `readLine`: "two x equals eight" is `2x = 8`, never fixed and never solved. Muse writes words, so number words run to ninety-nine.
- A cheap model reads only what code cannot: a line that might be misheard math, or an answer in words. It is told what the student was asked for. A doubt means code judges nothing and the tutor asks.
- A pick needs one part named. A place needs every item named, or pairs of slot and item.
- `pnpm --filter @astra/agent eval:spoken` runs the table in `evals/tutor-turns/spoken-lines.json`, which holds Muse's real finals on clips in two Mac voices. Wrong lines read as right must stay at zero.

From the end of speech to the line on the page, on 4 November, was 2.5 s at p50 and 4.1 s at most, over 6 lines. About 1.1 s of that is the audio path, 0.2 s the voice detector, 0.6 to 0.9 s Muse's final, under 20 ms code, and 0.3 s back to the page. The agent ran on the same Mac as the browser, with LiveKit's cloud between them, so the path should be shorter in production. Landing on Muse's last partial is not built, and would save little. Over the 64 clips the last partial always matched the final, and the whole line usually arrived with the final itself, at most 1.5 s before it.

## Changing the subject

The student can leave at any moment, and the tutor follows with no fuss.

- A new topic or a wish to stop, typed or said, closes the open task: `wantsSomethingElse` in `check-work.ts`. Said aloud, it is `{ way: 'leave' }` and no line lands.
- `boardMode` teach and `clearBoard` close it too, so a task never holds a later line.
- `pnpm --filter @astra/agent eval:switch` runs these turns on the real model, including back to an old problem and a question about an old lesson. "New session" must never appear unless a real limit is reached.

## What a verdict means

`checkWork` is one pure function, on the page and on the agent, so the page reacts before any message returns and the agent does not take the page's word for it. It returns `right`, `wrong`, or `unknown`.

- `wrong` means code is certain. A student states no claim, so a typed line is a step only where it can be shown to be one: a one-letter equation, and a line that claims the answer or carries a whole side with its letter over from the line before. Everything else is `unknown`, and the tutor asks.
- That leaves out true calculus (`x^2` to `2x`), base 2 (`1 + 1 = 10`), clock arithmetic (`10 + 5 = 3`), and a new problem (`x + 1 = 2` to `x + 2 = 5`), all of which arithmetic would call false. An expression is never called wrong, because its rewrite could be a derivative or an inverse.
- `packages/board/test/step-table.ts` holds the table. 88 true rows give 0 false alarms, 35 right and 53 unknown. 27 false rows give 0 praised, 18 wrong and 9 unknown. `step-generator.test.ts` runs 3,000 made-up equations, with 18,000 true steps and about 17,900 false ones, and no true step is wrong and no false step is right. Its truth comes from plain arithmetic, not from the checker.
- `unknown` is honest and it costs something. `x + 3 = 11` on `2x + 3 = 11` is false and stays `unknown`, because `3x + 3 = 7` looks the same from here. The tutor can still ask about it.

## What code refuses of the tutor

The model is not trusted with a student's work. These run before anyone hears a word.

- A check or a cross cannot go against code, and neither can land on `unknown` work. Real Sonnet tried a cross on an `unknown` line in the first evaluation run.
- Words that sound like praise, opening a reply to a wrong line, stop that reply, and the model tries again with a correction.
- The answer, written or said, is refused until the student has had two turns at the problem.
- Names like `s1` are kept for the student's lines.

Words after a question are dropped and commands are kept, so the tutor can ask and then set the task. The question's beat waits for the end of the stream, which it did already, so this adds no delay to the first word.

## When the tutor speaks

`watch-rule.ts` decides, from timing and code's facts. Prototype B measured Haiku alone wrongly interrupting 28 of 60. A cheap model only says what unsent words mean, and only when the rule asks, so a reading alone cannot interrupt.

A right line waits. A wrong line, a finished task, a question, and any words get a reply at once. Only a short fixed list such as "hmm" and "let me think" passes with no reply, because a line of words can hold a disclosure and a model must not be able to stay quiet on one. A line in a code task that is a plain sentence still goes to the tutor. `pnpm eval:board` holds this and the rest to a real model.

Unsent words stay in the browser until a pause of a few seconds. Then they can go to the tutor service and to Anthropic. The privacy page says so.

## The log and replay

Work reaches the log as `worked`, written by the agent with its own reading and verdict. Live and replay reduce the same operations, so they cannot drift. Older rows parse untouched. `shared-board-replay.test.ts` checks the same board at every moment.

## Safety

A typed line is hostile input. The reader builds math only from an allow list of characters, so a backslash can never reach KaTeX, and every word on the page is a text node. A line longer than 200 characters is words. `read-line.test.ts` runs 34 hostile lines and holds each under 150 ms. The worst line it found on the real page took 47 ms to land. A flood is bounded too: 20 held notes of work, 2,000 pieces of work in a session, and a fixed amount of ink drawn into one picture.

## While the tutor connects

The right side shows the dots of a still grid drifting into the Saturn from sign-in, with its rings slowly turning: `ConnectingSaturn`, `ui/dots/gatherDots.ts`, and `ui/dots/gatherPainter.ts`. "Connecting your tutor" shows in the words column. The voice never waits for it. It runs until the tutor's first turn, from `isTutorOnTheWay`, the same test the room's joining at open uses. When the tutor is there, the dots go home over 500 ms, one dot shows for 280 ms in the middle of the side and flies to rest above the words, and the canvas stops. Reduced motion paints a still Saturn once. Abel chose this from five options.

The reply box and Talk stay away for a normal connection. After 8 s of connecting they come back under "Connecting your tutor", with Saturn still turning, so nobody feels stuck on a slow connection. A laptop's keys land in the box at once, and a touch screen's keyboard stays closed. A reply sent then shows as waiting and reaches the tutor when the room opens, and a press of Talk waits the same way. A half typed draft keeps its box when the tutor comes, until it is sent. If the room closes with no tutor, the reply says it did not reach the tutor. This is the owner's default, and Abel has not answered yet. On Abel's demo, a tutor's first turn came 0.9 to 4.1 s after its job started, so 8 s catches only slow ones.

## The cost line

For Abel and testers. A small estimate beside the state line, for the session so far: the model from usage, the voice from characters at the recorded rate, and Muse from open time. The agent sends it at the end of a reply only with `ASTRA_SHOW_COST=1`, and the page shows it only in a build with `VITE_SHOW_COST=1`. `refuseCostLine` in `apps/web/build-guards.ts` fails any other build that holds it, and `SessionCost.test.tsx` runs real builds both ways.

## Hearing what left

For a tester chasing a sound that does not match the words. `ASTRA_SAVE_HEARD` names a folder, and each tutor turn saves there the words sent to the voice, what the page was told, the voice's `wordMismatches`, and a WAV of the audio that left. A production room never records, and the student's voice never passes here.

## Parity with the prototype

Abel's rule: everything a student can see or do on the prototype exists on the real board. Walked from `astra-tinker/board/public/app.js`, `plain.js`, `index.html`, and `style.css`. Proofs are tests, or page runs with screenshots in the coordinator's `board-compare` folder.

### Typing

| Behavior | Real board | Proof |
|---|---|---|
| Live math as typed, words and math mixed in one line | Yes | `TypedLine.test.tsx`, `read-line.test.ts` |
| Caret, and raw text when clicking in or arrowing back | Yes | `TypedLine.test.tsx` |
| Placeholder gone after the first lines | Yes. Words changed by Abel's voice slice | `TypedLine.test.tsx` |
| Any key typed anywhere goes to the line | Yes | `TypedLine.test.tsx` |
| Enter sends, and the line lands with its tick | Yes, 37 to 61 ms | perf probe, `term-demo` run |
| A right finished line lands by itself after 2.2 s | Yes | `TypedLine.test.tsx` |
| Underline in the pen colour when asked | Yes | `side-by-side-*` |
| A task focuses the line and closes pen and keys | Yes | `LiveBoard`, `pen-freehand` run |
| Read as beside the line | Yes, on every line, by the brief. The prototype shows it only for the pen | `side-by-side-*` |

### Clicking a term

| Behavior | Real board | Proof |
|---|---|---|
| Terms clickable only during the task, dashed underline in the pen colour | Yes | `term-proof-1-open.png` |
| Hover tints the term | Yes | `term-proof-2-hover.png` |
| Hover starts a guessed reply after 160 ms | Not yet. See Head start | |
| One click draws the student's ring in ink, others stop being clickable | Yes, ring and word in 39 ms on 5179 | `term-proof-3-clicked.png`, `term-demo` run |
| "Mm-hm." or "Hm." at once by what code found, in the tutor's voice | Yes | `board-work.test.ts`, `term-demo` run |
| A line typed during the pick is checked against that line, and the terms stay until a click or the finished answer | Yes | `board-work.test.ts`, Lane 1 |
| The tutor opens an equation with this | Yes, in the prompt | `term-demo` run |

### Marks, notes, circles

| Behavior | Real board | Proof |
|---|---|---|
| Check and cross drawn by hand in the gutter | Yes | `side-by-side-*`, `GutterMark` |
| Notes in the pen, in the gutter, fading up | Yes | `side-by-side-*` |
| Loose loop around a term in 340 ms, in the pen | Yes | `side-by-side-*-3-wrong-line` |
| Ring on a term of a handwritten line, in its Read as | Yes | `ink-ring.png` |
| Earlier crossed lines struck when a right step comes | Yes | `boardRows.test.ts` |
| Code refuses a mark that contradicts it | Yes | `eval:board`, `board-work.test.ts` |
| Tutor's line writes itself in | Yes, by the board's stroke painter. The prototype uses a wipe | `side-by-side-*-1-tutor-writes` |

### The pen

| Behavior | Real board | Proof |
|---|---|---|
| Band with a dashed guide, opened by Pen or by a task | Yes | `pen-freehand-1-writing-light.png`, `byHand` run |
| Strokes that vary in width | Yes, `perfect-freehand` 1.2.3, MIT, about 2 KB gzipped in the main bundle | `pen-freehand-1-writing-light.png` |
| Done appears after the first stroke | Yes | `pen-freehand-1-writing-light.png` |
| Reading starts as the pen rests, 650 ms | Yes | trace `inkReadStarted` 1.4 s ahead of `inkDone`, `board-work.test.ts` |
| A 2 s pause sends the line | Yes | `PenBand` |
| The strokes stay on the board at their size | Yes | `ink-ring.png` |
| Read as, with "Not what you wrote? Type it." | Yes | `ink-ring.png` |

### Math keys

| Behavior | Real board | Proof |
|---|---|---|
| MathLive field and its keyboard | Yes, `mathlive` 0.111.4, MIT. Its own chunk, 804 KB, 219 KB gzipped, loaded only on opening. No fonts or sounds of its own | `math-keys-2-typed-dark.png`, `MathField.test.tsx` |
| Enter sends the math as set, and leaving the field or the window sends nothing | Yes, checked by what it holds | `board-work.test.ts`, `MathField.test.tsx`, `math-keys-3-sent-*` |
| The menu toggle hidden | Yes | `math-keys-*` |
| The keyboard in the theme, with room kept for the words and tools | Added. On the prototype it covers them | `math-keys-2-typed-dark.png` |

### The tutor beside you

| Behavior | Real board | Proof |
|---|---|---|
| The dot: rests above the words, flies to lines, dims watching, breathes thinking, pulses with loudness | Yes | `MovingDot`, `stage-*` |
| Words lit as spoken, earlier lines faint above | Yes | `BoardCaption.test.tsx` |
| State line: Talking, Reading your work, Waiting for you, Watching, Stopped | Yes | `tutorState.test.ts`, `math-keys-*` |
| Esc stops the tutor and the dot goes home | Yes | `keys-pen` run |
| Sending anything cuts the tutor off | Yes | `turn-rule` tests |
| A reply holds its first word while the hands are moving | Yes, with an 8 s limit the prototype does not have, so a long typist still gets the reply | `board-work.test.ts` |
| Looks while typing at 3, 6, 10, 15, 25 s, and idle at 10 to 90 s | Yes | `TypedLine.test.tsx` |
| The watcher: quiet while talking, 8 s after a question, after speaking up, and when the rule sees no reason | Yes | `watch-rule.test.ts` |
| A cheap model reads only what unsent words mean | Yes | `watch-rule.test.ts`, `eval:board` |
| The tutor is told what the student already heard | Yes, `already_reacted` | `work-note.ts`, `eval:board` |

### Graphs

| Behavior | Real board | Proof |
|---|---|---|
| Plot drawn in the flow, with grid, ticks, and a true minus sign | Yes, by PR 88's figure painter. The grid follows its ticks, and the prototype has one line a unit | `drag-light-1366-*`, `figure.test.ts` |
| Draggable point with a pulsing ring and its coordinates | Yes. Arrow keys and Enter also move and send it, which the prototype does not have | `drag-point.test.ts`, `DragSurface.test.tsx`, `drag-*-1-waiting` |
| Tangent riding on the point, with its slope written | Yes | `drag-point.test.ts`, `m3-12-task-*` |
| Code's check on release, with "Mm-hm." or "Hm." | Yes, 37 to 58 ms on the page, on the drags measured | `drag-proof.mjs`, `board-work.test.ts` |

### Layout

| Behavior | Real board | Proof |
|---|---|---|
| Words left, board right, at the prototype's widths | Yes | `side-by-side-*` |
| Light and dark, with the pen colour in each | Yes | `side-by-side-*`, `tokens.test.ts` |
| Phone stacks, hint hidden, gutter under the line | Yes | `real-light-phone.png` |
| Reduced motion | Yes | `boardStage.test.ts` |

### Left out

| Behavior | Why |
|---|---|
| Numbers panel, the cost line, the switches | Test tools, by Abel's rule |
| The intro screen and "Start at" | Abel's choice. The real home and session start replace them |
| The fixed three-part lesson | Abel's choice. Lesson shape belongs to M3.9 |
| Head start: a guessed reply while typing, hovering, dragging, or writing | Abel's choice to build it last, after everything else. The hover tint stays until then |

## For later owners

- M3.9: a direct question goes hands-on. A topic teaches first and then picks an exercise. Set a task, wait for `task_done`, and go on teaching. Nothing else is needed.
- M3.10: the session log stays in memory until you store it, and the privacy page's planned list says it will hold this work.
- M3.11: handwriting is here. Uploads, photos, and PDFs are yours.
- PR 87's scene: the seam is the `visual` prop of `BoardStageView`.
- The tutor's pen colour is a proposal, in `docs/DESIGN.md`, waiting for Abel.
