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
pnpm --filter @astra/agent graph-proof --only waves,extremes,keyboard,reuse,marks,labels,slider-name --out /tmp/m3-4-fix
pnpm --filter @astra/agent graph-proof --only replaced,pair,fine --out /tmp/m3-4-fix-2
```

`graph-proof` and `math-proof` exit non-zero when a proof fails, and print `FAILED` with where it failed.

## The data shape

A figure is a pure function. `getFigureMarks` takes the board, the moment, and a size in pixels, and returns a list of marks, each with a key: a path, a shaded area, a dot, or some text. `createFigurePainter` turns marks into SVG by key and writes only what changed. Nothing but the clock feeds it, and it runs in plain Node, so a freeze, a rewind, and a replay needed no new rules, and the tests read the same marks a student sees.

A plot is a `Scene` through the catalog, with no timeline of its own, and its constants are its parameters. So a slider sample, a stored row, and a replay all reach a curve the same way as they reach a ball.

A figure draws at its true size and never scales, so its text stays 12 px at any width. A label in the known letters has an estimated width that runs slightly wide, with no read from the page, so layout is the same on every frame, every replay, and every device. A glyph outside them runs from a hair to more than 6 em, depending on the font each device falls back to, so the browser measures that text once on a canvas and keeps the answer for the life of the page.

## Results

The tables here are from the runs at `98a6408`, before the review. "After the review" below has the rerun at the end of the fix round.

**Correct math.** Each of these reads the page, not the code that drew it. Zero comes from the axes, the scale from a tick, and the expected value from a formula worked in the proof.

| Check | Result |
| --- | --- |
| Ball against the worked arc at 8 moments of the flight, laptop and phone | at most 0.12 px off |
| Ball's landing after a drag from 4.2 to 8.4 m/s | 12.197 m against a worked 12.197 m, and 1.99995 and 2.00000 times the first landing |
| Ball's landing after a launch angle drag to 30 degrees | 17.674 m against a worked 17.674 m, off by at most 0.7 mm |
| Scale while a student drags, sideways speed and launch angle | held, to within what marks can record |
| A false line through an asymptote, a jump, or a domain edge, on `1/x`, `tan(x)`, `abs(x-1)/(x-1)`, `sqrt(x)`, `sin(x)/x` | none, in `plot.test.ts`, which asserts that no line crosses a pole and that no step in a drawn line is taller than 1/8 of the axes, the height the sampler always looks inside |
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

The last row misses the 100 ms rule on all 5 runs, on a link V1 and decision 3 leave out. This PR does not touch the clock. Its reviewer settled why the graph lesson runs higher than M3.2's on the same take and link, at p95 44 to 104 ms in 6 runs. On the bad link, a cue on a word after a pause sits near -28 ms whatever the lag is, and a cue in mid-phrase shows the full lag, so the shot lesson looks worse because nearly every cue in it is mid-phrase. A text-only copy of it gave p95 146, 172, 44, 114, and 37 ms at this PR's head, so figures are not the cause. There is no measurable difference from this PR, with small effects not ruled out, and the lag is M3.6's.

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

**Bounds on model input.** An expression has at most 200 characters and 32 levels. A curve at one set of constants takes at most 4,000 evaluations. First placement also fits the y range through every value its constants can reach, at 97 samples for each of up to 82 sets, so a curve with four constants takes up to 7,954 more. Measuring what stands far above the rest takes at most 72 evaluations for each of 6 tops at each end, and 72 more for one near the edge of the domain, so about 13,700 in all at worst. A fixed `yRange` skips that fit, and so does every later constant. The range of a slider or a constant is at least 1e-6 wide, the same as a domain, and its numbers show at most 12 decimals. A label has at most 80 characters, 4 lines, one font size, and no stack of more than 2 combining marks, the same limit as math. A figure draws its newest 64 attachments and 8 curves, and readouts take at most 30% of its height. A figure's SVG has no nesting from model text, so math's tree depth limit has nothing to apply to.

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
| The hardest curve allowed with a fixed `yRange`, sampled from nothing | 1.9 and 8.1 | 2.8 and 12.5 |
| A flight, after a drag of 6,000 samples | 0.2 and 0.5 | 0.7 and 2.4 |

## After the review

The review found five blockers and a list of smaller faults. This is the rerun after the fix round, on the same Mac at a load near 20, against a load near 8 above. `graph-proof` now holds the review's cases as lessons, so `--only waves,extremes,keyboard,reuse,marks,labels,slider-name` runs them again.

**A wave stays whole.** Read off the real page. The slider was dragged with a real mouse, and each number is the same at laptop and phone width.

| Curve | Before | After | Evaluations before and after |
| --- | --- | --- | --- |
| `sin(a*x)` on [-10, 10], a from 1 to 3 | 1 piece, 100% of the width | 1 piece, 100% | |
| `sin(a*x)`, a = 4 | 26 pieces, 60% | 1 piece, 100% | 3,155 and 741 |
| `sin(a*x)`, a = 10 | 64 pieces, 21% | 1 piece, 100% | 3,501 and 1,687 |
| `sin(x)` on [-50, 50] | 32 pieces, 44% | 1 piece, 100% | 3,297 and 846 |
| `sin(2*pi*x)` on [-10, 10] | 40 pieces, 33% | 1 piece, 100% | 3,441 and 1,033 |
| `abs(sin(x))` on [-20, 20] | 26 pieces, 59% | 1 piece, 100% | 3,189 and 623 |
| `sin(30*x)` on [-10, 10] | 192 pieces, 9% | 1 piece, 100% | 3,703 and 3,841 |

A false line stays out. `1/x` is 2 pieces, `tan(x)` on [-5, 5] is 5, `tan(10*x)` is 65 for its 64 poles, a jump is 2, and `sqrt(x)` starts at zero, all with no line across a break. 3,000 random continuous curves gave 5 with a gap, all finer than a pixel, at more than 300 periods across the axes.

**No number in a command can take the page down.** A slider narrower than 1e-6 is refused, on the page as well as in the parser. Every figure and slider kind then played at the edge of what the parser takes, on 7 turns at 2 widths, with 42 slider moves by key: 0 page errors, 0 console errors, 0 frames holding a number that is not finite, 0 frames of text on text, 0 of 2,741 live frames differing from the log, 0 of 368 replay moments differing, and 0 of 29 moments after the slider moves differing. 20,000 rounds of extreme numbers through every figure's marks gave nothing that is not finite, and 150 rounds through `BoardView`, live and from a stored row, gave the same.

**A reused id takes its new content.** In the lesson from the review, the slider reused for the second curve reads min 10, max 20, value 15, and name `b`, its figure reads "second", and 5 key presses moved the curve. A slider no longer stays on a replaced curve, as "After the second review" says.

**A slider has a name.** The browser's tree reads role slider and name "Sideways speed". `aria-valuetext` is "4.2 m/s", and the board holds no live region.

**A flight that never leaves the ground has axes.** So does `10^308*x`. Pictures from the lab are in the run's folder, with a ball on the ground at 0 m and 0 frames holding a number that is not finite.

**A key press replays on its own millisecond.** 8 of 8 key presses log 0 ms from the board that used them, at both widths, and 0 of 36 held moments differ. Before, 8 of 8 were 1 ms early, and 7 of 12 moments differed.

**Marks say what they could not draw.** A mark on a number line part, a value off a line, a mark on a part a curve lacks, and a value past its axes each report. A mark on a path draws. A mark on a point that was later hidden reports nothing, because it was drawn.

**Wide text keeps clear.** A label of 3 `﷽`, of cuneiform, of emoji, of Burmese, of Arabic, and an 80 character word on one curve gave 0 frames of text on text at both widths. On the phone, 2 of them have no room and report it.

**What held.** On the fake voice unless it says stored Chris.

| What was checked | Result |
| --- | --- |
| Lesson runs, frames, and labels | 16, 16,835, and 177,966 |
| Frames with text on text, text outside its figure, two elements overlapping, or an element off the board | 0, 0, 0, and 0 |
| Live frames that differ from the log | 0 of 16,835 |
| Replay screenshots that differ | 1 of 640, by 88 pixels with the board's description equal, on a run before a proof waited for its frame to paint. That lesson and width reran clean twice, and the old head shows the same kind of difference on it |
| Writes and animations with nothing moving, after each lesson | 0 and 0, on all 16 |
| Screenshots 3 s apart after a lesson that differ | 2 of 16, in a line's antialiasing with 0 writes. In 2 alternating reruns of 3 lessons, 1 of 6 at this head and 2 of 6 at the old head, so this is the page's rendering under load and not this PR |
| Frame gap | p50 16.7 ms, p95 16.9 to 17.6 ms, worst 99.6 ms, and 6 frames over 34 ms |
| Stored Chris | 3 lesson runs, 4,250 frames, 57,192 labels, and all of the above at 0, with 0 of 156 screenshots differing |
| Word times landing one by one, stored Chris | 3 runs, 4,229 frames, 0 differing, 0 steps backward, and 0 of 156 screenshots differing |
| Ball against the worked arc | at most 0.116 px off |
| Landing after doubling the speed | 1.99995 and 2.00000 times as far, off by at most 0.27 mm |
| Launch angle dragged to 30 degrees | 17.675 and 17.673 m against a worked 17.674 m, scale held |
| Freeze | 2 of 2 byte for byte, 0 writes, a resume at 6.099 m, and 0 of 112 replay moments differing |
| A real mouse drag, replayed | 8 of 8 moments at both widths, on both voices |
| First write after a slider move | p50 1.9 to 2.6 ms and p95 2.4 to 6.2 ms in 8 runs, against p95 2.2 to 6.4 ms in 4 runs of the old head alternating with 4 of these, so no measurable difference, and the spread is too wide to rule out a small one |
| A move landing on a move | at most 521 to 584 pixels in one 16 ms step, against 192 to 511 on a plain move |
| Bad commands refused | 15 of 15 at both widths, with 0 frames of text on text |
| Reduced motion | 2 runs, 2,867 frames, and the ball in 5 places |
| A word's timing, stored Chris, shot lesson | 3 runs, 39 of 39 cues fired, p95 29, 34, and 54 ms against a 100 ms rule, and on the slowest run 2 cues more than 40 ms early |
| A word's timing, stored Chris, curves | 1 run, 13 of 13 cues fired, and p95 28 ms |
| M3.3's math proof | 19 lesson runs, 20,596 frames, 0 frames overlapping or showing raw source or a wrong equation, and 0 of 664 replay moments differing. 2 writes with no cause on one phone run did not come back on a rerun |

The review's own flight, with a slider, key presses, a stop, a drag while frozen, and a resize, gave 3 of 3 with the scale held and a frozen board still, 0 of 300 described moments differing, 0 of 60 screenshots differing, and 0 frames of text on text in 5,303 frames.

**Load and cost.** At a load near 15, against 9 above.

| | Before the review | Now |
| --- | --- | --- |
| Board script, gzipped | 120.7 KB | 122.1 KB |
| Board script | 381.9 KB | 385.7 KB |
| First plot, this Mac | 53 ms | 71 ms, from 59 to 82 ms |
| First plot, Slow 4G with CPU slowed 4 times | 874 ms | 920 ms, from 907 to 957 ms |

No figure code reaches the app's own bundle yet, because only the lab imports `BoardView`.

| A frame's cost, on this Mac and with CPU slowed 4 times | Median ms | Worst ms |
| --- | --- | --- |
| Whole board and marks for a flight | 0.1 and 0.9 | 2 and 12.7 |
| A curve at a new constant | 0.1 and 0.8 | 0.9 and 5.1 |
| The hardest curve with a fixed `yRange`, sampled from nothing | 2.9 and 14.3 | 5 and 20.8 |
| A 170 character curve with four constants, placed and drawn from nothing | 17.3 and 87.4 | 20.6 and 107.8 |

The last row is the review's correction. The old row used a fixed `yRange`, which skips the fit that takes most of the time on placing, at 7,954 evaluations against at most 4,000 to draw. It is a long task on a slow phone, listed under Limits.

## Choices worth keeping

- A gap means a real break. A continuous curve shrinks when a step is halved and a jump or a pole does not, so a line stops only where 8 halvings in a row failed to shrink a step, which reaches a hundredth of a pixel. Detail goes where the line bends or a step is tall, and a step that is merely steep needs no more samples than its shape does.
- Past the budget a line is drawn only where something proves it, and the figure says "Too fine to draw here". A wave passes through its heights and shrinks when halved, and a jump or a pole does neither. So among the nearest 1,024 samples, a line may not cross a height taller than 1/32 of the view that no sample reached. Where fewer than 1 in 32 of the tallest steps ever shrank, a tall step that never shrank is taken for a jump. No setting of the old halving count could do this, because a jump found on a late pass has had no halvings to count.
- A figure placed again with any change takes what hangs on it, like `hide`. Marks, shading, arrows, readouts, sliders, ghost paths, and curves drawn over it all go, because each was said about what the figure showed. The tutor places again what still applies. The exact same command by value keeps them, because every word on it still holds.
- A curve's axes hold its whole finite peak. Only what grows without bound is cut, and a halving climb from the sample tells them apart: a finite top settles as the steps shrink, and a pole or a log goes on gaining. A pole within one sample's spacing past the edge of the domain counts as growing, because `tan(x)` on [-1.57, 1.57] would otherwise flatten into a line with two spikes.
- The first samples of a curve sit on a slightly uneven grid, so a fast wave cannot meet them at the same phase every time and draw as a slow wave or a flat line.
- A slider's number is no live region. A value moving while the tutor talks must not speak over the voice, so a screen reader gets it from `aria-valuetext` when the student is on the slider.
- A flight offers one way to say its speed at a time: a speed with an angle, or a sideways speed with an upward one. The speed holds two numbers, so a slider from each way cannot both hold what the student set. The parser refuses such a pair in one beat, and the board keeps the first and reports the second across beats. When the tutor sets a speed the other way, the board keeps the flight as it is and holds its speed the new way, so nothing replays against an older value.
- A play over words should end on the word a mark fires on, because a mark on a moving ball stays where the ball was. The tutor's prompt must say so.
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
- A curve with features narrower than its sampling grid that never touch a sample cannot be seen by any sampler. A narrow pulse between two samples is missed, and a square wave faster than about 1 period for 2 samples loses some of its pulses. Gaussian pulses 1 px wide are lost in 13 of 253 placements, and pulses 1.74 px wide are always found. A peak too narrow for the 97 samples of the y fit to see can still sit above the axes.
- Past the budget of 4,000 evaluations a curve is finer than the pixels that draw it, about 4 samples for each of the 955 periods of `sin(300*x)` on a width of 20. It draws as a solid band with a rough edge. A square wave past the budget draws as its two lines, with a short gap where a run of samples missed one of them. `tan(100*x)` has 636 poles and every column is truly solid to its axis top, and it draws as a solid core with spikes and leaves the rest of the height unproven. The figure says "Too fine to draw here" for each of these, and the board reports `curveTooFine`.
- The note reports what the sampler could not prove, so it can come and go while a slider moves through the range where a curve stops being resolved, such as `sin(a*x)` near a = 165 to 260, and it can be absent where the picture is exactly true, such as a square wave whose every jump was found. A screen reader hears the figure's name and not the note.
- A band with a thin hole on a slope, such as `x+1/sin(100*x)`, can have lines across the hole, because the hole moves up with the slope and samples nearby fill its heights. The figure says it is too fine.
- A steep but continuous rise inside a curve that is past the budget can show a gap, under the note, where it is not resolved.
- A jump under about 1% of the view's height draws no gap, a logistic at k = 10^5 on [-3, 3] shows a tiny gap, `tan(35*x)` has ragged tips, and a few frequencies far above 40,000 meet the grid so that a band reads as a thinner one.
- A tutor's own word on a curve is not rechecked when a slider or a constant moves that curve. "minimum" stays on `a*x^2` when the student drags a below zero, though its computed coordinates stay true. The tutor must not name what a slider can change.
- A slider on a constant its curve does not have is disabled and shows no value, and nothing reports it yet. A slider's range can leave out the flight's starting value, so its first press lands inside the range.
- A mixed label, in the known letters and others, is measured by the browser, so it can shift a few pixels on a fresh page with another font state. A replay on the same page stays exact.
- The slider has not been used with a real screen reader. The browser's tree reads its name and value, and that is all that was measured.
- A very heavy curve stalls a slow device. Nine curves with four constants placed on one word, or three of them reshaping at once, take long tasks with the CPU slowed 4 times.
- Touch was never driven, and Safari, Firefox, and real phones are untested. M3.6 and M3.10 own those. A real voice has not paced these lessons. The stored take has real word times over other words, and the late word proof stands in for real late alignment.
