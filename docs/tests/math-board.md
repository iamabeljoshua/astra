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

At rest the DOM is plain KaTeX. KaTeX keeps no ids under `trust: false`, so a hidden copy wraps each term in a marker color, which passes through to every span it sets. That shows which ink each term made, and the visible tree stays exactly what KaTeX built. Each wrap sits in its own group, so a part written with no braces, as in `x^2`, `\hat x`, or `\frac\pi2`, can still stand as a script or an argument.

A rearrangement uses the player's `entrance` motion, so a stop, a freeze frame, and a replay needed no new rules. Each piece of ink flies from its old place to its new one as a pure function of that one number. A glyph whose term changed still travels, so the 2 in `2x = 8` lands under the 8 in `x = 8/2`.

## Results

Every run below is on the real lab page, in Chromium, with the real player.

**Correct in every frame.** Each lesson played at laptop and phone width, in light and dark, with a check on every frame and every write to the board.

| What was checked | Result |
| --- | --- |
| Frames watched across 8 lesson runs | 9776 |
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

The fix round that bounded the tree and changed how fonts wait ran the core scenarios again at its head. On the stored take, a cue on every word was p95 43 ms, the algebra lesson 23 ms, and M3.2's lesson 28 ms. On the fake voice, a cue on every word was 25 ms, the algebra lesson 32 ms, the dense lesson at phone width with the CPU slowed 4 times 50 ms, and the hostile lesson 40 ms. Every cue fired, and 0 of 1868 replay samples differed. The other rows above are from the head before it, and nothing in that round touches their cue path.

**Freeze.** The tutor was cut off 0.28 to 0.34 of the way through a move, at both widths in both themes. 4 of 4 boards were byte for byte identical 1.5 s apart, with 0 writes to the page and 0 running animations. The log holds the cut as `drawnFraction`. After a resume, each board ended on `x = 4`.

**Replay.** The live board and the board rebuilt from the log were compared at 504 moments, many of them in the middle of a move, as screenshots. 0 differ.

**Stillness.** After each of 10 lessons, the board was watched for 3 s. It took 0 writes, ran 0 animations, and 9 of 10 screenshots matched byte for byte. The tenth differs by about one level in one pixel, worked out from its PSNR of 100.7 dB on a board of about 180,000 pixels, with no write to the page, so I read it as raster rounding.

**Reduced motion.** Two full lessons with the setting on, 2442 frames. 0 frames had a moved or clipped glyph or a part-drawn stroke. Math and ink fade in on their word, equations cross fade, and the rest of the results above hold.

**Hostile content.** 14 of 14 bad commands sent over the real data channel were refused by the parser: a macro bomb, a huge rule, links, raw attributes, a color, a pixel position, poisoned ids, a comment, a run of accent marks, and more. KaTeX then refused `x^2^3`, `\frac{1}`, and the last good equation stayed. Markup in plain text, in handwriting, in math, and in diagram labels showed as text or strokes. 0 frames had a script, image, or link, and the page's `window.pwned` stayed unset. The board fit every width, and the lesson ran on to `x = 6`.

**Late fonts.** With every KaTeX font held back 0.6 s and the lesson started at once, 0 frames drew math before its font had arrived. The math appeared when the fonts did, in the right place.

**A font that fails.** All three formats of `KaTeX_Main-Regular` aborted, on the algebra lesson at both widths. Each board ended on `x = 4`, visible, with the `=` and the `4` in fallback glyphs, and 240 and 222 pixels of ink. The failure was known before the first equation, so nothing waited. `onBoardProblem` got `fontFallback` with the reason `failed`, once. All 9 cues fired on each, and 72 of 72 replay moments matched by bytes.

**A font that stalls.** Every KaTeX font request held open with no answer. On the algebra lesson at laptop width and the rare-fonts lesson at phone width, the first equation stayed hidden for 999.6 ms and 1000.5 ms, then showed in fallback glyphs with 439 and 386 pixels of ink. Over that wait the board's clock moved 2.3 ms and 3.2 ms against the wall clock, so the wait did not hold it back. Each missing font reported `slow`, and every cue fired. Once the fonts were let through, all 9 equations at rest matched plain KaTeX, with a worst offset of 0 px and 0 images differing. KaTeX's default stylesheet sets `font-display: block`, which keeps text blank for 3 s after a font is first used, so a page could report a visible equation and show nothing. On a stalled font, that stylesheet showed 0 pixels of ink at 1.1, 1.5, and 2.5 s, and the swap build showed 206 at each. So the board loads the swap build, and `renderMath.test.ts` fails if any KaTeX font the board loads is set to anything but `swap`. A font that lands with no frame before a rebuild, as when a move ends, is measured again before that rebuild. The wrapper then holds its true width of 130 px, where it used to stay at 124 px, on Chromium and Firefox.

**Math that builds too much.** KaTeX reads U+0300 to U+036F as accents and nests each one, with no brace for the parser to count, and the reviewer's run of 135 marks crashed the tab. A run of more than 2 of those marks is now refused by the parser, and the tree itself is measured before any of it becomes DOM, so a trick nobody listed is held too. Marks from every other block set as plain characters and nest nothing, so the parser takes them: 495 of U+20D7 stay at 8 levels, and `\text{जोड़ें}`, which holds three in a row, sets normally. `tex-commands.test.ts` runs every mark in Unicode through real KaTeX, and the parser refuses a run of 30 exactly when KaTeX cannot set it.

| Fuzz of 640 sources built from the allowed commands, on the real board, past the parser on purpose | Laptop | Phone |
| --- | --- | --- |
| Tab crashes | 0 | 0 |
| Sources the parser would have taken | 401 | 393 |
| Sources the board set | 369 | 357 |
| Deepest the board's tree went, in levels | 119 | 116 |
| Most nodes on the board | 2996 | 3011 |
| Sources set outside the board | 0 | 0 |
| Frames showing raw source | 0 | 0 |
| Slowest source, from write to two frames later | 64 ms | 64 ms |

The fuzz nests each structure up to 14 levels, chains each one to 500 characters, fills matrices, and puts runs of up to 495 marks on a character. A smaller one, across 800 sources in `renderMath.test.ts`, runs in CI on the real DOM nodes. A row of the real log rewritten to hold 300 marks, as a log kept from before this limit could, was refused by `parseSessionEvent`. Rebuilt anyway, as a log that skipped that check would be, the board refused it through `onMathRefused`, kept `x = 4`, and its tree stayed at 10 levels and 60 nodes.

**Rings on parts with no braces.** The `marks-and-labels` lesson rings `2` in `x^2 + 1`, `\pi` in `\frac\pi2 = y`, `i` in `\sum_i x_i`, and `\hat x`, over the real data channel at both widths. All 4 rings drew. A fifth highlight, on `q`, which is not in the line, drew nothing and reported `markWithoutTarget` once. 88 of 88 replay moments matched by bytes. `renderMath.test.ts` checks which ink belongs to a part for 31 more, and includes `\sum`, `\lim`, `\sin`, `\gcd`, `\limsup\nolimits`, a matrix cell, and a whole matrix.

**Diagram labels.** The same lesson draws nodes `H₂O`, `Δv`, `πr²`, and `Water`, an edge `→ heat`, and an edge `runs`. At both widths, `H₂O`, `Δv`, and `πr²` each sit inside their box, `→ heat` touches no box, `Water` and `runs` stay strokes, and no label leaves the board. An edge that crosses to the next row sets its label in the gap between the rows. `Find Δv`, a handwritten note, stays plain text.

**Resizing.** A finished dense lesson went from 1366 px to 390 px to 320 px and back. For 2 frames right after a resize the board still had its old layout, because it repaints on the next frame. Then it fit, and all 28 equations matched plain KaTeX.

**Load and size.** Measured on a production build of the real `BoardView`, on top of what Home already loads, served with gzip, cold each time, 3 runs a side, alternating, at a load average near 10. On Slow 4G the first equation shows 549 ms after the script arrives, inside the 1 s a font may hold it, so that link sees no fallback glyphs.

| | Bytes |
| --- | --- |
| Board script, including KaTeX | 340.9 KB, 106.3 KB gzipped |
| Board stylesheet | 29.8 KB, 8.0 KB gzipped |
| Fonts fetched for the first equation | 54.2 KB in 4 files |

| From asking for the board to the first equation on screen | Median | Range |
| --- | --- | --- |
| This Mac, no throttling | 74 ms | 64 to 85 ms |
| Slow 4G, 1.6 Mbps and 150 ms, with CPU slowed 4 times | 1282 ms | 1279 to 1285 ms |

On Slow 4G the limiter is the network: about 169 KB at 200 KB a second is about 845 ms of the 1282 ms, by arithmetic, and the rest is round trips and a slowed CPU. A cue's render and measure took a median of 0.7 ms for the quadratic formula and 6.9 ms for the longest allowed line on this Mac. With the CPU slowed 4 times those were 3.3 ms and 29 ms. These are the median of 40 runs in the last sample, after the code had warmed up, and the first render of a session is the slower case.

So M3.10 should start fetching the board chunk when a session starts, because the first word comes a second or more later, and the fetch can finish in that time on a slow link. From a cue to the frame after its element mounts took p50 27 ms and worst 75 ms at laptop width on the stored take, and p50 32 ms and worst 101 ms at phone width with the CPU slowed 4 times.

## Choices worth keeping

- The newest element always stays on the board, and the oldest leaves whole. The tutor is talking about what it just wrote, and a line cut in half reads as a bug.
- Math KaTeX refuses never reaches the student. The last good equation stays, and the refusal goes to `onMathRefused`.
- An equation waits at most 1 s for a font, measured on the wall clock from when an equation first needs that font. A slow phone link brings a font inside that, and past it a student reading fallback glyphs is better off than a student looking at nothing. The next equation does not wait again for a font that already ran out of time.
- The limits on a tree are 120 levels and 3000 nodes. Eleven `pmatrix` inside each other, the deepest nesting of one command the parser allows, reach 114 levels, the deepest source in the fuzz reaches 119, a line of `a+` terms at the 500 character limit holds about 2500 nodes, and a tab crashed at about 650 levels. A line of `a_1+` terms passes 3000 nodes at 111 terms, about 445 characters, and a matrix of 470 empty columns holds 8491 nodes. Both are refused.
- A mark that never finds a target reports `markWithoutTarget`, once for each use of its id, so an id used again on a missing target still reports. A mark that had a target and lost it, because its term left through a rearrangement or its equation was hidden, reports nothing, because that is the board doing as it was told.
- A function name is one piece of ink, even where KaTeX sets one of its letters in its own span, as with the `g` of `\log`, so a move carries the name whole.
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

- Handwriting is the EMS Tech stroke set, which covers Latin letters. A line with any other character shows as plain text, and that holds for each diagram label on its own. Math is set with KaTeX's own fonts, and it is written glyph by glyph rather than stroke by stroke, because a font glyph has no strokes to follow.
- `hide` and `clearBoard` remove an element at once, so lines below a hidden one jump up. `docs/DESIGN.md` allows a quiet fade here, and M3.5 can add it.
- A `transformMath` that lands while another is still running starts from the plain tree of the one before. A tutor who rearranges on every word gets correct equations and a small jump, and the stored line and the every-word lesson show this.
- `annotate.label` is not drawn on math yet. M3.12 owns notes beside a line.
- No real voice has spoken these scripts. The real speech here is a stored take of other words, so cue timing is real and the sense is not. M3.7 is the first real model writing math, and it should run `parseSceneCommand` and then `canRenderTex` from `@astra/board/tex-check`, which plain Node can import, before a command reaches a student. `canRenderTex` alone is not a safety check, because it says yes to `\href`, which KaTeX sets as inert text.
- A part KaTeX sets inside one piece of ink cannot be ringed, such as `a` in `\text{area}`, and neither can `1` in `\frac12`, because a number stays one token. Both report `markWithoutTarget`. M3.7's prompt should ask for `\frac{1}{2}`.
- A `transformMath` that KaTeX refuses still sits in the board's state, so `describeBoard` names the source the student never saw until the next good write. The student's board keeps the last good equation. M3.7 stops this at the source with `canRenderTex`.
- `buildTexTree` uses `katex.__renderToDomTree`, which KaTeX names as internal. `katex` is pinned at 0.19.1. With the call gone, the board refuses all math, so a test that expects a refusal would pass with nothing to refuse. `renderMath.test.ts` and `tex-commands.test.ts` check before each test that the call still builds a tree, and every test in both fails if it goes away.
- On Playwright's WebKit with the swap build, a held font's status reads `error` while it is still held, and `document.fonts.check` returns true. So the board sees no missing font, holds nothing, and reports nothing. When the font lands, nothing measures again, and a ring sat 6.7 px off its glyph. This has not been seen on real Safari.
- KaTeX refuses decomposed text that holds a mark it has no accent for, such as the U+0323 of decomposed Vietnamese, Yoruba, and Igbo, or the U+0314 of decomposed polytonic Greek, and the board keeps the last good equation. The composed form of each sets. Of the 13 languages tried, only decomposed Greek also holds a run of 3 marks from U+0300 to U+036F, which the parser refuses.
- Safari, Firefox, and real phones are untested. M3.6 and M3.10 own those.
