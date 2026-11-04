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
| `drag` | Moves a point along a plot's curve, which needs M3.4's plots on the page | `flat` and `zero`, read from the curve itself |

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
| 44 wrong math lines | 44 | 37 wrong, 7 unsure | 0 read as right |
| 12 right math lines | 12 | 9 right, 3 unsure | 0 called wrong |
| 16 lines of words, one misspelled on purpose | 16 | Not judged | 0 fixed |

It cost $0.007 for 72 reads, at 1.53 s a read.

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

## For later owners

- M3.9: a direct question goes hands-on. A topic teaches first and then picks an exercise. Set a task, wait for `task_done`, and go on teaching. Nothing else is needed.
- M3.10: the session log stays in memory until you store it, and the privacy page's planned list says it will hold this work.
- M3.11: handwriting is here. Uploads, photos, and PDFs are yours.
- The tutor's pen colour is a proposal, in `docs/DESIGN.md`, waiting for Abel.
