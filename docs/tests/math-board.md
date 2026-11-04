# Math on the board: what was measured

This is the record for M3.3. A student hears the tutor explain algebra and sees correct equations form in step with the words. Every figure here comes from the real lab page, on the real player, on Abel's Mac under load from other agents, at a load average of 7 to 36. All text is test text.

No figure here spends voice credits. The voice is the fake tone, with a word every 280 ms, or a stored real take of Chris from M3.2, played with `--stored`. A take's words do not match a math lesson's script, and that is the point: its word times are real speech with no pause arranged around a cue, so math lands in the middle of speech. The recording uses the Mac's free `say` voice, so a person can follow it, and no timing proof uses that voice.

To run it all again, with `livekit-server` on the path and a free web port:

```sh
export WEB_PORT=6240 LAB_LIVEKIT_PORT=7940 LAB_LIVEKIT_UDP_PORT=7942 LAB_RELAY_PORT=7943
pnpm --filter @astra/agent math-proof --out /tmp/m3-3-proof
pnpm --filter @astra/agent proof --fake --only math-algebra,math-every-word,math-dense-phone,math-hostile --out /tmp/m3-3-timing
pnpm --filter @astra/agent proof --stored <a take from store-run.ts> --only math-every-word,math-algebra,math-stored --out /tmp/m3-3-timing
pnpm --filter @astra/agent math-load --out /tmp/m3-3-load
```

## The data shape

Commands sit inside the sentence, as the design says. The board holds each equation as a `MathLine`, the source plus its `MathTerm` list. `getMathParts` splits source math at its top level into terms, operators, and relations. `transformMathLine` keeps a term's id through a rearrangement: order-keeping matches first, then a term that crossed the equals sign. So the `3` in `2x + 3 = 11` is the same `t3` in `2x = 11 - 3`. This runs anywhere, with no DOM, so the agent can read terms too.

At rest the DOM is plain KaTeX. KaTeX keeps no ids under `trust: false`, so a hidden copy wraps each term in a marker color, which passes through to every span it sets. That shows which ink each term made, and the visible tree stays exactly what KaTeX built.

A rearrangement uses the player's `entrance` motion, so a stop, a freeze frame, and a replay needed no new rules. Each piece of ink flies from its old place to its new one as a pure function of that one number. A glyph whose term changed still travels, so the 2 in `2x = 8` lands under the 8 in `x = 8/2`.

## Results

Every run below is on the real lab page, in Chromium, with the real player.

**Correct in every frame.** Each lesson played at laptop and phone width, in light and dark, with a check on every frame and every write to the board.

| What was checked | Result |
| --- | --- |
| Frames watched across 8 lesson runs | 9799 |
| Frames showing raw math source | 0 |
| Frames with a KaTeX error mark | 0 |
| Frames with a script, image, link, or form on the board | 0 |
| Frames where two placed elements overlap | 0 |
| Frames with ink outside the board | 0 |
| Frames with ink flying over another element | 0 |
| Frames showing the wrong equation for the clock | 0 |
| Frames with math drawn before its font arrived | 0 |
| Writes to the board with nothing moving and no cue | 0 |
| Equations at rest compared with a fresh plain KaTeX render in the same spot | 140, holding 2320 glyphs |
| Farthest any glyph sat from plain KaTeX | 0 px |
| Screenshots that differ from plain KaTeX, byte for byte | 0 of 44 |
| Pixels that jump as a move starts or ends, over 20 moves, past a difference of 24 of 255 | at most 1 |
| Colors on the board outside the theme's tokens, and gradients | 0 and 0 |

**Timing.** A math cue on a real voice. The take is Chris, stored from M3.2, so its word times are real speech and its words are not the lesson's. The rule is p95 within 100 ms of the word's sound at the ear, on cues really fired. The second table is the fake voice, where a word is placed by counting tone bursts, because every fake word is the same and matching by shape finds the wrong one.

| Stored Chris, no credits | Runs, cues fired | p95 ms | Worst ms | Replay samples differing |
| --- | --- | --- | --- | --- |
| A cue on every word, mid speech | 3, 36 of 36 | 28 to 40 | 40 | 0 of 273 |
| The same, phone width, CPU slowed 4 times | 1, 12 of 12 | 30 to 30 | 30 | 0 of 91 |
| Algebra lesson | 3, 27 of 27 | 23 to 59 | 59 | 0 of 1149 |
| Dense lesson | 1, 9 of 9 | 27 to 27 | 27 | 0 of 328 |
| Dense lesson, phone width, CPU slowed 4 times | 1, 9 of 9 | 30 to 30 | 30 | 0 of 328 |
| Algebra, 40 ms delay, 30 ms jitter, 1% loss | 1, 9 of 9 | 53 to 53 | 53 | 0 of 383 |
| Algebra, 100 ms delay, 70 ms jitter, 4% loss | 1, 9 of 9 | 28 to 28 | 28 | 0 of 383 |
| Five words, five cues, three times | 1, 15 of 15 | 30 to 30 | 30 | 0 of 184 |
| M3.2's own lesson on the new board | 1, 15 of 15 | 31 to 31 | 31 | 0 of 518 |
| The same two runs in dark, which draws on the same clock | 2, 21 of 21 | 21 to 43 | 43 | 0 of 419 |

| Fake voice | Runs, cues fired | p95 ms | Worst ms | Replay samples differing |
| --- | --- | --- | --- | --- |
| A cue on every word | 3, 36 of 36 | 22 to 38 | 38 | 0 of 306 |
| Algebra lesson | 3, 27 of 27 | 15 to 33 | 33 | 0 of 1164 |
| Dense lesson, phone width, CPU slowed 4 times | 1, 9 of 9 | 16 to 16 | 16 | 0 of 343 |
| Hostile lesson | 1, 18 of 18 | 15 to 15 | 15 | 0 of 377 |

Frame time stayed at 17 to 18 ms at p95 in those runs. M3.2's interrupt scenario still stops at p95 2 ms.

**Freeze.** The tutor was cut off 0.28 to 0.29 of the way through a move, at both widths in both themes. 4 of 4 boards were byte for byte identical 1.5 s apart, with 0 writes to the page and 0 running animations. The log holds the cut as `drawnFraction`. After a resume, each board ended on `x = 4`.

**Replay.** The live board and the board rebuilt from the log were compared at 504 moments, many of them in the middle of a move, as screenshots. 0 differ.

**Stillness.** After each of 10 lessons, the board was watched for 3 s. It took 0 writes, ran 0 animations, and 9 of 10 screenshots matched byte for byte. The tenth differs by one level of red in one pixel, worked out from its PSNR of 105.7 dB on that channel, with no write to the page, so I read it as raster rounding.

**Reduced motion.** Two full lessons with the setting on, 2449 frames. 0 frames had a moved or clipped glyph or a part-drawn stroke. Math and ink fade in on their word, equations cross fade, and the rest of the results above hold.

**Hostile content.** 13 of 13 bad commands sent over the real data channel were refused by the parser: a macro bomb, a huge rule, links, raw attributes, a color, a pixel position, poisoned ids, a comment, and more. KaTeX then refused `x^2^3`, `\frac{1}`, and the last good equation stayed. Markup in plain text, in handwriting, in math, and in diagram labels showed as text or strokes. 0 frames had a script, image, or link, and the page's `window.pwned` stayed unset. The board fit every width, and the lesson ran on to `x = 6`.

**Late fonts.** With every KaTeX font held back 2.5 s and the lesson started at once, 0 frames drew math before its font had arrived. The math appeared when the fonts did, in the right place. That took 5 writes with no cue, which are the board placing the equation when its fonts landed.

**Resizing.** A finished dense lesson went from 1366 px to 390 px to 320 px and back. For 2 frames right after a resize the board still had its old layout, because it repaints on the next frame. Then it fit, and all 28 equations matched plain KaTeX.

**Load and size.** Measured on a production build of the real `BoardView`, on top of what Home already loads, served with gzip, cold each time, 5 runs a side, alternating, at a load average near 10.

| | Bytes |
| --- | --- |
| Board script, including KaTeX | 336.7 KB, 104.7 KB gzipped |
| Board stylesheet | 29.8 KB, 8.0 KB gzipped |
| Fonts fetched for the first equation | 54.2 KB in 4 files |

| From asking for the board to the first equation on screen | Median | Range |
| --- | --- | --- |
| This Mac, no throttling | 74 ms | 67 to 89 ms |
| Slow 4G, 1.6 Mbps and 150 ms, with CPU slowed 4 times | 1262 ms | 1253 to 1297 ms |

On Slow 4G the limiter is the network: about 167 KB at 200 KB a second is about 834 ms of the 1262 ms, by arithmetic, and the rest is round trips and a slowed CPU. A cue's render and measure took a median of 0.6 ms for the quadratic formula and 6.4 ms for the longest allowed line on this Mac. With the CPU slowed 4 times those were 2.9 ms and 26.3 ms. These are the median of 40 runs in the last sample, after the code had warmed up, and the first render of a session is the slower case.

So M3.10 should start fetching the board chunk when a session starts, because the first word comes a second or more later, and the fetch can finish in that time on a slow link. From a cue to the frame after its element mounts took p50 27 ms and worst 75 ms at laptop width on the stored take, and p50 32 ms and worst 101 ms at phone width with the CPU slowed 4 times.

## Choices worth keeping

- The newest element always stays on the board, and the oldest leaves whole. The tutor is talking about what it just wrote, and a line cut in half reads as a bug.
- Math KaTeX refuses never reaches the student. The last good equation stays, and the refusal goes to `onMathRefused`.
- A rewrite with more than six loose glyphs fades instead of flying. A student can follow a few pieces moving, and a crowd crossing each other reads as noise, which the matrix step showed when it flew.
- The `say` voice exists only so a person can follow the recording. Its word times are each word's share of the phrase, so no timing proof uses it.
- A full board makes room in the first third of a new element's entrance, and the writing starts once it has, so no ink is drawn below the edge.

## Why KaTeX

The plan and the approved design name KaTeX. I measured the alternatives before keeping it, on this Mac on 4 November 2026.

| Library | Version | Script, minified | Script, gzipped | What it builds |
| --- | --- | --- | --- | --- |
| KaTeX | 0.19.1 | 273 KB | 76.5 KB, plus 3.6 KB of CSS | Plain spans with a box for each glyph, in its own fonts |
| Temml | 0.14.0 | 168 KB | 49.7 KB, plus 2.8 KB of CSS | MathML, which the browser lays out |
| MathJax | 4.1.3 | 997 KB | 282.5 KB | Its own output, with more of TeX |

KaTeX is what makes the term by term move possible. Each glyph is an element with a box we can measure and move, the output is the same in every browser, and its fonts are served by us. MathJax costs nearly four times the bytes for parts of TeX a school lesson does not use. Temml saves 27 KB, but MathML leaves layout to each browser, so glyph positions and flights would differ between them, and I did not try to animate it. That last point is my reading and not a measurement.

Math rendering stays out of Home. The lab is development only, so `katex` is in no production chunk today, which a search of a real build confirmed, and M3.10 should load the board as a route chunk, the way `math-load` does.

## Differences from the plan

- Files beyond the plan's list: the React side is in `apps/web/src/board/`, because `packages/board` stays free of React. `apps/web/math-load/` is the load measure's page. `packages/board/src/drawing.ts` and `packages/board/src/math/tex-check.ts` are entries that keep KaTeX and its stylesheet out of the package's main entry, which the agent imports in plain Node. `packages/board/scripts/` builds the stroke data, and `getMathParts` and the command list are in `packages/contracts`, so the agent can read terms.
- `writeMath`, `transformMath`, and `text` gained `overWords`. The plan says the player gains it, and the language had it only on `runSimulation` and `reveal`.
- Plots stay with M3.4, which draws them. This PR settles `plot.constants`, `shadeArea`, and `slider.constant`, and `evaluatePlotExpression` takes constants. No plot is drawn here.
- The plan marks perf as not applicable. The brief for this PR asked for load time and bundle size, so they are measured below.

## Limits

- Handwriting is the EMS Tech stroke set, which covers Latin letters. A line with any other character shows as plain text. Math is set with KaTeX's own fonts, and it is written glyph by glyph rather than stroke by stroke, because a font glyph has no strokes to follow.
- `hide` and `clearBoard` remove an element at once, so lines below a hidden one jump up. `docs/DESIGN.md` allows a quiet fade here, and M3.5 can add it.
- A `transformMath` that lands while another is still running used to start from the plain tree of the one before, with a small jump. M3.4 fixed this: the running move hurries to its end in at most 120 ms, and then the new one starts. `docs/tests/graphs-board.md` has the measure.
- `annotate.label` was not drawn on math. M3.4 draws it under the term it marks, clear of other text. M3.12 owns notes in the student's own margin.
- No real voice has spoken these scripts. The real speech here is a stored take of other words, so cue timing is real and the sense is not. M3.7 is the first real model writing math, and it should check `canRenderTex` from `@astra/board/tex-check`, which plain Node can import, before a command reaches a student.
- Safari, Firefox, and real phones are untested. M3.6 and M3.10 own those.
