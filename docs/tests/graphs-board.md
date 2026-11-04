# Graphs, geometry, and motion on the board: what was measured

This is the record for M3.4. Voice and the 2D board carry every lesson and never wait, so this board has to teach well on its own: curves that draw in time with the tutor's words, shapes that move, and sliders that show cause and effect. Every figure here comes from the real lab page, on the real player, on Abel's Mac under load from other agents, at a load average near 8. All text is test text.

No figure here spends voice credits. The voice is the fake tone, or a stored real take of Chris from M3.2, played with `--stored`. A take's words do not match the lesson's script, so cue timing is real and the sense is not. The recording uses the Mac's free `say` voice, so a person can follow it, and no timing proof uses that voice.

To run it all again, with `livekit-server` on the path and a free web port:

```sh
export WEB_PORT=6360 LAB_LIVEKIT_PORT=7960 LAB_LIVEKIT_UDP_PORT=7962 LAB_RELAY_PORT=7963
pnpm --filter @astra/agent graph-proof --out /tmp/m3-4-proof
pnpm --filter @astra/agent graph-proof --stored <a take from store-run.ts> --only stored,late-words,slider --out /tmp/m3-4-stored
pnpm --filter @astra/agent proof --stored <a take from store-run.ts> --only graph-shot,graph-shot-every-third,graph-curves,graph-shot-every-third-phone --out /tmp/m3-4-timing
pnpm --filter @astra/agent math-load --first plot --out /tmp/m3-4-load
```

## The data shape

A figure is a pure function. `getFigureMarks` takes the board, the moment, and a size in pixels, and returns a list of marks, each with a key: a path, a shaded area, a dot, or some text. `createFigurePainter` turns marks into SVG by key and writes only what changed. Nothing but the clock feeds it, and it runs in plain Node, so a freeze, a rewind, and a replay needed no new rules, and the tests read the same marks a student sees.

A plot is a `Scene` through the catalog, with no timeline of its own, and its constants are its parameters. So a slider sample, a stored row, and a replay all reach a curve the same way as they reach a ball.

A figure draws at its true size and never scales, so its text stays 12 px at any width. A label's width is an estimate that runs slightly wide, with no read from the page, so layout is the same on every frame and every replay.

## Results

Numbers below are from the runs at `98a6408`, whose tree is the same as `26b92bf`. The one code commit after that changes how a missing part is reported and when a hoop goes, and "Final head" below has the rerun.

**Correct math.** Each of these reads the page, not the code that drew it. Zero comes from the axes, the scale from a tick, and the expected value from a formula worked in the proof.

| Check | Result |
| --- | --- |
| Ball against the worked arc at 8 moments of the flight, laptop and phone | at most 0.12 px off |
| Ball's landing after a drag from 4.2 to 8.4 m/s | 12.197 m against a worked 12.197 m, and 1.99995 and 2.00000 times the first landing |
| Ball's landing after a launch angle drag to 30 degrees | 17.674 m against a worked 17.674 m, off by at most 0.7 mm |
| Scale while a student drags, sideways speed and launch angle | held, to within what marks can record |
| A false line through an asymptote, a jump, or a domain edge, on `1/x`, `tan(x)`, `abs(x-1)/(x-1)`, `sqrt(x)`, `sin(x)/x` | none, in `plot.test.ts`, which asserts the tallest step in any drawn line |
| Numbers that are not finite, in any mark, from 2000 random expressions tried | 0 |

**On every frame.** 16 lesson runs on the fake voice: `shot` and `graphs` at laptop and phone in light and dark, and `number-line`, `triangle`, `free-body`, and `launch` at laptop light and phone dark.

| What was checked | Result |
| --- | --- |
| Frames watched | 16,580 |
| Text labels checked against each other and their figure's edge | 175,558 |
| Frames with text on text, or text outside its figure | 0 and 0 |
| Frames where two placed elements overlap, or sit outside the board | 0 and 0 |
| Frames with a script, image, link, or stray input on the board | 0 |
| Writes to the board with nothing moving and no cue | 0 |
| Frames as shown live that differ from the log at that moment | 0 of 16,580 |
| Colors on the board outside the theme's tokens, and gradients | 0 and 0 |
| After each lesson, over 3 s: writes, animations, and screenshots that changed | 0, 0, and 0 of 16 |
| Live board against replay, by screenshot, at 640 moments | 0 differ |

The stored Chris take gave the same zeros on 3 runs and 4,214 frames.

**Frame rate.** Frame gap at p50 was 16.7 ms and at p95 16.8 to 18.4 ms, across all 16 runs. 1 frame of 16,580 took more than 34 ms, at 78 ms, under load from other agents.

**A word's timing.** The rule is p95 within 100 ms of the word's sound at the ear, on cues really fired. Stored Chris, no credits.

| Stored Chris | Runs, cues fired | p95 ms | Worst ms | Over 40 ms early | Replay samples differing |
| --- | --- | --- | --- | --- | --- |
| The shot lesson | 2, 26 of 26 | 30 to 37 | 37 | 0 | 0 of 664 |
| A cue on every third word | 2, 78 of 78 | 31 to 39 | 39 | 0 | 0 of 878 |
| Every third word, phone width, CPU slowed 4 times | 1, 39 of 39 | 35 | 35 | 0 | 0 of 440 |
| Phone width, CPU slowed 4 times | 1, 13 of 13 | 27 | 27 | 0 | 0 of 332 |
| Curves | 1, 13 of 13 | 24 | 24 | 0 | 0 of 483 |
| With a student's drag after it | 1, 13 of 13 | 35 | 35 | 0 | 0 of 503 |
| 40 ms delay, 30 ms jitter, 1% loss | 1, 13 of 13 | 60 | 60 | 9 | 0 of 332 |
| 100 ms delay, 70 ms jitter, 4% loss | 5, 65 of 65 | 107 to 311 | 311 | 6 to 11 of 13 | 0 of 1,660 |

The last row misses the 100 ms rule on all 5 runs, on a link V1 and decision 3 leave out. This PR does not touch the clock, and I read this as the lag step `docs/architecture/live-session.md` gives M3.6, because M3.2's own lessons on the same take and link run early too, at p95 44 to 104 ms in 6 runs. That the graph lesson runs higher than those is measured, and why is not settled.

The fake voice, placed by counting tone bursts, gave p95 29 ms on the shot lesson and 11 ms on every third word.

**A cue over words with its later word times late.** This row was M3.2's: 8 of 56 real-time samples differed by up to 0.33 scene seconds. The browser now aims a cue with what it knows and an estimate from the beat's own words, aims again from where the motion is when more times land, and reports each aim in `cueAims`. The proof sends each word time at its own moment, so no cue knows its last word as it fires.

| Word times land one by one | Runs | Aims reported | Live frames differing from the log | Screenshots differing | Steps backward |
| --- | --- | --- | --- | --- | --- |
| Stored Chris | 3 | 46 | 0 of 4,216 | 0 of 156 | 0 |
| Fake voice | 3 | 11 | 0 of 4,178 | 0 of 156 | 0 |

Once a cue's last word time is known, its last aim is that word: an error of 0 ms on every cue, read from the log. `over-words.test.ts` fails on 26 frames with the report turned off, and shows a step backward.

**Freeze.** The tutor was cut off with the ball in the air, at both widths and on the stored take. 3 of 3 boards were byte for byte identical 1.5 s apart, with 0 writes and 0 animations. After a resume the ball landed at 6.099 m, the worked 6.099 m, and 168 moments of the replay matched by screenshot.

**A move landing on a move.** A rearrangement that lands on a running one now lets that one hurry to its end in at most 120 ms, and then starts. Unit tests pin that no equation changes until the first is at rest. The most pixels changing in one 16 ms step were 510 to 588 with this, against 640 to 696 with it turned off, and 192 to 421 on a plain move, so a landing costs about what the busiest plain step does and does not spike.

**Slider.** A real mouse dragged the slider in 24 steps. From each move to the first write on the figure took a p50 of 1.6 to 2.2 ms, a p95 of 1.8 to 3.3 ms, and a worst of 18.3 ms. The log held the drag, and a replay of it matched by screenshot at 8 of 8 moments.

**M3.3's lessons still hold.** `algebra` and `dense` at both widths in both themes, 8 runs: 0 frames with overlap, 0 wrong equations, 0 writes with no cause, and 0 replay screenshots differing. A cut held 4 of 4 byte for byte.

**Reduced motion.** Two full lessons with the setting on, 2,872 frames. The ball took 5 places, one for each cue that moves it, and each curve went straight to whole. The rest of the results above hold.

**Hostile input.** 15 of 15 bad commands over the real data channel were refused by the parser: code in an expression, a property reach, a call to a global, `x**2`, an expression too long, nesting too deep, a backward domain, a domain past the limit, poisoned names, a pixel position, a rate past its range, and gravity of zero. Then a lesson of allowed but awful input played: markup in a label, 80 wide letters, a domain of two million, five marks on one spot, a curve nested as deep as allowed, `9^9^9^9^x`, a curve with no real values, a constant set past its range, and a side running off its figure. 0 frames had a script or image, `window.pwned` stayed unset, 0 frames had text on text, and the lesson ran to its end.

**Bounds on model input.** An expression has at most 200 characters and 32 levels. One curve takes at most 4,000 evaluations. A label has at most 80 characters, 4 lines, one font size, and no stack of more than 2 combining marks, the same limit as math. A figure draws its newest 64 attachments and 8 curves, and readouts take at most 30% of its height. A figure's SVG has no nesting from model text, so math's tree depth limit has nothing to apply to.

**Load and size.** Measured on a production build of the real `BoardView`, on top of what Home already loads, served with gzip, cold each time, at a load average near 9.

| | Bytes |
| --- | --- |
| Board script, including KaTeX | 381.7 KB, 120.6 KB gzipped |
| Board stylesheet | 29.8 KB, 8.0 KB gzipped |

| From asking for the board to the first thing on screen | Median | Range |
| --- | --- | --- |
| First plot, this Mac, no throttling | 55 ms | 48 to 58 ms |
| First plot, Slow 4G, 1.6 Mbps and 150 ms, with CPU slowed 4 times | 863 ms | 852 to 864 ms |
| First equation, this Mac, no throttling | 71 ms | 69 to 83 ms |
| First equation, Slow 4G with CPU slowed 4 times | 1359 ms | 1344 to 1362 ms |

A plot needs no font fetch, which is why it beats an equation on Slow 4G.

| A frame's cost on the main thread, on this Mac and with CPU slowed 4 times | Median ms | Worst ms |
| --- | --- | --- |
| Whole board and marks for a flight with arrows, a readout, and a slider | 0.1 and 0.4 | 2.2 and 8.1 |
| A curve at a new constant, as in a drag | 0.1 and 0.7 | 0.6 and 1.9 |
| A curve at rest | 0 and 0.1 | 0.2 and 0.9 |
| The hardest curve allowed, sampled from nothing | 1.9 and 8.1 | 2.8 and 12.5 |
| A flight, after a drag of 6,000 samples | 0.2 and 0.5 | 0.7 and 2.4 |

**Final head.** At `905631a`, the last commit that changes the board, on the stored take: 3 lesson runs with 4,217 frames, 56,768 labels, and 0 of everything above, with 0 of 4,217 live frames and 0 of 156 screenshots differing from the replay. The ball was at most 0.11 px off the worked arc, landed 1.99995 and 2.00000 times as far after the drag, and froze byte for byte on 2 of 2 boards, with 112 replay moments matching. 15 of 15 bad commands were refused again on 2 runs, with 0 frames of text on text.

## Choices worth keeping

- A gap is the safe failure. A curve that steps too far after every refinement breaks there, because a gap shows less than the truth and a line through an asymptote shows something false.
- Axes do not move while a student drags. They are fitted on placement to every value a slider or constant can reach, sampled through its range and not only at its ends, because a launch angle lands farthest in the middle. Otherwise the curve moves and the axes move with it, and the change cannot be seen.
- A world with a ground uses one scale both ways, so an arc has its true shape. A graph fills its axes, because x and y measure different things.
- A mark on a moving ball stays where the ball was when the mark landed, because "the top" is a place. A vector on the ball goes on following it.
- A tracked arrow's length is where the ball would be in 0.25 s, so it is a true measure of speed, the sideways arrow holds its length, and the upward arrow shrinks and flips.
- A cue is logged at or after the moment it fired, and a frame fires what is due before it reads the board, because the audio clock moves in steps and a cue could otherwise show one frame after its replay.

## Differences from the plan

- Files beyond the plan's list: `packages/board/src/figure/` holds what plots, geometry, and motion share. `apps/web/src/board/sliderItem.ts` is the slider, and `apps/agent/src/lab/graph-lessons.ts` and `proof/graph-*` are the lessons and proofs.
- New in the language, which settles M3.4's open row: `readout`, a play's `rate`, the `launchAngle` and `launchSpeed` controls, a constant on `setParameter`, and `cueAims` in a report. Stored rows still parse.
- The plan marks perf as not applicable. The brief for this PR asked for load and frame rate, so they are measured above.
- The issue asks for one slider. Sliders on a curve's constants and on a launch angle work the same way.

## Limits

- `hide` removes an arrow at once, so the PRD's "fades on lets go" is a removal for now. `docs/DESIGN.md` allows a quiet fade, and M3.5 can add it for everything hidden.
- A hoop is drawn only under a simulation. Other uses of `drawing` stay with M3.5. Its rim sits where the first arc comes down through 3.05 m, so the first shot goes in by construction.
- A focus on a part draws the dot only on a ball. On a geometry point or a curve it shows nothing.
- With reduced motion a stop can move the ball back, because the ball shows at the end of its motion and a stop holds where it really was.
- A curve with features narrower than its sampling grid that never touch a sample cannot be seen by any sampler. Past the 4,000 evaluation budget a curve shows gaps, as `tan(3000*x)` does.
- Touch was never driven, and Safari, Firefox, and real phones are untested. M3.6 and M3.10 own those. A real voice has not paced these lessons. The stored take has real word times over other words, and the late word proof stands in for real late alignment.
