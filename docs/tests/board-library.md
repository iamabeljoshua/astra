# The board library: what was measured

This is the record for M3.5. A tutor can put anything the plan names on the 2D board, for any subject, and a tool proves that no text overlaps, clips, or leaves the board. Every figure here comes from the real page on Abel's Mac under load from other agents, and each section gives its load average. Nothing here spent voice credits, and two safety rounds of the tutor eval spent $0.03 and $0.06.

To run it all again, with `livekit-server` on the path:

```sh
pnpm test:board                                        # board tests, every plant, a quick sweep, and the strobes
node scripts/check-layout.ts --flash                   # every plant, the full sweep, and the flash check on every scene in both themes
node scripts/check-layout.ts --sheets .layout-check/sheets   # m3-5-deck.png and a sheet for each subject
node scripts/check-layout.ts --rates .layout-check/rates     # frame rates, and m3-5-tier.png
export WEB_PORT=7021 LAB_LIVEKIT_PORT=7022 LAB_LIVEKIT_UDP_PORT=7024 LAB_RELAY_PORT=7025 VITE_SUPABASE_URL=http://127.0.0.1:54421 VITE_SUPABASE_PUBLISHABLE_KEY=lab-proof
pnpm --filter @astra/agent proof --stored <a take from store-run.ts> --only library,library-phone-tier-held,library-phone-tier-measured --out /tmp/m3-5-tier
```

`LAYOUT_WEB_PORT` sets the check's own port, which is 7020 by default. Run nothing else that starts Vite on `apps/web` in this checkout while the check runs. A second server made the page reload under a sweep once, and the sweep died with `Execution context was destroyed`.

## What a tutor can show

Tables, timelines, code blocks, labelled drawings, layered diagrams, and pictures join the math, plots, geometry, and simulations from M3.3 and M3.4. All of them go through the scene language's parser and render as text nodes, never as HTML.

- Eight drawings have named parts: `animal-cell`, `flower`, `water-cycle`, `atom`, `music-staff`, `piano-keys`, `globe`, and `lever`. A label names a part of its own drawing, and the parser refuses any other. `hoop-side` has no parts, because it is only ever drawn under a simulation.
- Ten pictures are in `IMAGE_ASSETS`, and `docs/credits.md` credits each. A file the board cannot show becomes its description in words, and the page reports `imageMissing`.
- A code block holds at most 40 lines, and each long line wraps, because a board never scrolls.
- Every word field refuses raw math, so math goes in `writeMath`: a TeX command, `\(` and `\[`, a braced power or subscript, and math between dollars. It also refuses the tab, newline, and other characters JSON makes of a lone backslash. Money such as `$5 grows to $25` stays words, and a code block keeps what it holds. A Windows path, or `\frac` in a lesson about LaTeX, belongs in a code block.

The deck in `packages/board/test-deck/` has 119 scenes across math, physics, languages, history, biology, code, music, mixed lessons, and hostile input. Each command in it goes through the same parser and board check as a tutor's. The deck holds right-to-left text, Devanagari, Chinese, Korean, Thai, Burmese, Yoruba, and Igbo.

## The check

`scripts/check-layout.ts` draws each scene on the real page and reads what the browser laid out, not what was asked for. It draws at 10 board sizes on 8 screens, in both themes, and under reduced motion on a laptop and a phone. Each scene is read 40, 180, and 400 ms after each command lands, and again at rest.

It reports these as defects:

- Text on text, a label's own lines on each other, text off the board, text off its own element, text on a picture, and text cut by a box, a rounded corner, or a clip path.
- An element on an element, and an element or a mark off the board or on a neighbour.
- Any stroke through words. Every stroke on the board is walked every 2 px through the letters of every text box, curves, axes, rings, leaders, and box edges alike, and a tick number is the only text exempt. A plot's grid is the only stroke exempt, because it lies under each word's 3 px halo in the board's own color, so a label does not move for it either. See "The grid under words" below. Strokes that write a label count as that label's box.
- An arrow through a box, a node's label outside its box, and a leader that does not start beside its label.
- An element or a picture still unseen at rest, words too faint to read against what is behind them, a picture turned or cut to fit. An element counts as shown only by what is painted: `display: none`, `visibility: hidden`, `opacity: 0`, a clip path, or words in the board's own color all count as not shown. An element a full board moved off is the one exception, and the painter marks it.
- Raw TeX, a KaTeX error, an element that is not on the list, a broken or stretched image, and a number that is not finite.
- A color outside the tokens, a gradient, and text under 9 px with no `tooSmallToRead` report.
- A word left out, unless the board sent `labelWithoutRoom`, `imageMissing`, or `markWithoutTarget`.

| Measure | Result |
| --- | --- |
| Full sweep with the stroke walk, at this head | 32,088 renders, 513,217 text boxes, in 89 s at a load average of 14 to 30, with 0 renders with a defect. 128 elements too small to read and 105 labels with no room went to the tutor and stay out of the defects |
| Planted defects | 78 plants: 57 in the page, 20 in the library, and 1 flash, all caught, and `pnpm test:board` exits 0. `a note ignores the ring it names` now plants at phone width in `mixed-note-beside-its-ring`, whose note has no room below its ring and lands across it with the plant in, and clears it without. The first `pnpm test:board` at this head stopped on 3 time limits in the board's tests at a load average of 30, with other gates beside it: `figure-fuzz` at 5 s, and `read-line` at 189 and 196 ms against 150 ms. All 1,778 passed when run again, and with 2 workers |
| Flash check, at this head | All 119 scenes in both themes, 7,050 frames in 356 s at the same load: at most 2 flashes in any second, in `hostile-many-at-once` in dark, and the limit is 3. With the picture's hold planted out, 4 |

A plant either breaks the page or rewrites one line of the library as it is served, and never touches the disk. Each must be caught by the kind of defect it plants.

**What the check found.** On the first pass the sweep with the new checks found faults the old one missed, and each is fixed:

- A long arrow's corners cut through its neighbours. Rows of different heights let a diagonal start beside a taller box, and the painter's rounding pulled a corner into the next box.
- Edge labels sat on their own arrows, and two labels in a gap landed on each other.
- A curve with no values to draw lost its name with no report, which only showed once the check stopped counting a screen reader's name as shown words.
- A picture placed and cleared 4 times a second flashed 4 times a second.

A third pass, on the full sweep with the stroke walk, found a leader running through a longer label beside it on the two smallest boards. The left labels now end level, so each leader leaves the column at once. The same pass found a wide fallback glyph in `hostile-wide-scripts` over the top of a plot on the small phone and the fold, which now has room for that font.

A second pass, after a review showed the check could not see hidden words or strokes through text, found 242 crossings on 98 of the 2,648 renders of the quick sweep. Curves, axes, and rings ran through labels in `history-school-of-athens`, `physics-wave-plot`, `biology-population-curve`, `music-sound-wave`, `mixed-marks-on-parts`, and `math-marked-parabola`, among others. A label now clears every line, stacks its words if it must, and tells the tutor when no spot is left. A ring squares up around a wide box so the box's corners stay inside it. On a phone, a dense wave leaves no room for `crest (0.25, 1)` in `physics-wave-plot` or `loudest push (0.0011, 1)` in `music-sound-wave`, so those two labels go to the tutor as `labelWithoutRoom`.

**The grid under words.** The grid does cross words: 89 of the 169 words on 66 plots at the laptop, phone, and fold sizes. The exemption hides no defect a student would meet. The grid is a 1 px line at a contrast of 1.39 in light and 1.32 in dark, against 14.5 and 18.84 for ink and 5.83 and 7.42 for second ink, and the halo cuts it around each letter. Crops at 3 times size of `y = x squared minus 2x minus 3`, a word crossed twice, read clean in both themes, so the line shows only as a faint mark between letters. The check does not read the halo itself. Without the halo, ink over the line still has a contrast of 10.44 in light and 14.24 in dark.

## Arrows

A layered diagram now changes direction only in the gaps between ranks. Inside a rank a line runs straight, in a lane of its own, so it cannot touch a box. The painter rounds a corner by 4 pixels at most, because a point now stands each side of it. An edge label takes the nearest spot beside its own line that clears every line and every other label. A node pointing at itself gets a small loop outside its box.

`packages/board/test/layout-graph.test.ts` draws 1,000 random graphs with skips, loops, returns, and repeats, at random widths, with no arrow on a box or a label and no label on a label. The sweep then checks the same on the real page, by walking each path every 4 px with `getPointAtLength`.

## Flashing

The board's only motion is drawing and fading, so a normal lesson cannot flash. What can flash is a tutor sending commands faster than speech, so the deck has three strobe scenes, with a picture or a full table placed and cleared 3 to 6 times a second.

`scripts/layout/flash-check.ts` steps each strobe scene 20 times a simulated second and every other scene 10 times, in both themes, reads the pixels, and counts WCAG's general flash: a pair of opposing changes of 10% luminance, with the darker side under 80%, over 25% of a 10 degree field, which is 21,824 pixels. It counts pixels on the whole board and does not ask that they touch, which is stricter than WCAG for change that is scattered. It reads a shot at a quarter of each side, so a thin line can average out below the luminance change, and text and ink are only counted as far as that blur leaves them. WCAG's Understanding page gives a larger area, 87,296 CSS pixels, and this uses the smaller figure from its definition. It does not check saturated red.

A picture now waits unseen for 42% of its entrance, which is 168 ms. A picture cleared and placed again faster than that never shows, and one cleared more slowly cannot pass 3 flashes a second. Text and ink have too little area to count.

## Frame rates and tiers

Each row is 3 runs of 6 s, against the real clock, at a load average of 11.9 to 23.1, in frames a second.

| Scene | Laptop board, top tier | Phone board, CPU 4 times slower, lowest tier |
| --- | --- | --- |
| `physics-jump-shot`, the baseline | 54 to 60 | 59.7 to 60 |
| `mixed-every-kind` | 57.5 to 60 | 57.8 to 60 |
| `mixed-phone-heavy` | 58.3 to 60 | 55.3 to 60 |
| `hostile-many-at-once` | 59.7 to 60 | 54.5 to 58.7 |
| `hostile-widest-table` | 58.2 to 60 | 51.2 to 59.7 |
| `code-forty-lines` | 50.4 to 59.7 | 55.8 to 60 |
| `hostile-handwritten-diagram` | 57.3 to 60 | 47 to 59.5 |

A fixed task took 25 ms at full speed and 102 ms under the 4 times throttle, so the throttle reached the page. The tool checks this on each run, because a first run lost its throttle when its browser session closed and read 60 fps everywhere.

The laptop figure is capped by the 60 Hz display. Runs happen on a development build, with other agents' work on the machine, so a quiet machine and a built app can only do better. Each scene's phone run follows its laptop run, so both meet the same load. A scene is judged on its best run, because other work can only slow a run, and the range is shown beside it. M3.2's code has no deck page, so the baseline is M3.2's own lesson content, `physics-jump-shot`, played at this head between the others.

`createTierWatch` in `packages/board/src/player/quality-tiers.ts` sets the tier from the frames it sees. Tier 1 paints moving things about 30 times a second, and tier 2 also lands each drawing at once. Below 50 fps for a second drops from the top, and below 28 fps drops again. Audio, captions, and the clock never pass through it. `ScenePlayerLab` now holds tier 0 unless a run asks for `?tier=measured`, so a replay proof cannot see a tier change under load. The student's board has no tier set, so it measures.

A real room played `library`, a mixed lesson with a drawing, a diagram, a table, a timeline, a picture, code, and a curve, on a stored take of Chris, one run each at a load average of about 20 to 30. Drift is the cue against the word's sound in the recorded audio, in ms.

| Run | Tier | Cue drift p50, p95, worst | Cues over 100 ms late | Words found in the audio | Replay samples that differ |
| --- | --- | --- | --- | --- | --- |
| Laptop, full speed | Held at 0 | 22, 65, 65 | 0 of 11 | 103 of 105 | 0 of 764 |
| Phone width, CPU 12 times slower | Held at 0 | 64, 242, 242 | 4 of 11 | 104 of 105 | 0 of 780 |
| Phone width, CPU 12 times slower | Measured: tier 1 at 12 s, tier 2 at 50 s | 26, 229, 229 | 1 of 12 | 105 of 105 | 0 of 763 |

All 105 caption words showed in all three runs, and all 12 cues fired. The board dropped a tier by itself, and the words and the audio kept their place while it did. One run each shows the drop and no harm to the voice, and it is too few to claim the lower drift as a gain. The misses at 12 times slower are a main thread stalled for up to 1.9 s, far past a mid-range phone, and the 4 times runs in the table above hold 47 fps or better.

On the deck alone, `mixed-phone-heavy` on a measured tier at 12 times slower dropped to tier 1 at 2.4 s and tier 2 at 3.4 s, at 18 fps over the run and 28 fps over its last half. `packages/board/test/quality-tiers.test.ts` covers the watch itself, including a hidden tab, a slow moment that is no drop, and the longer wait after a climb that did not hold.

## The proof gate

`getProofFailures` now fails on eight more keys: `still.imagesMatch`, `summary.wasRun`, `summary.hasScript`, `colors.unknownColors`, `colors.gradients`, `rests.differingImages`, `rests.motionLeft`, and `frames.movingWithReducedMotion`. Before this each of those could report a fault and still exit 0.

`math-proof` no longer counts what the board writes while the proof itself holds it at another moment, which were the 97 writes with no cause in `marks-and-labels`. The page checks now allow `img.board-image`, and only that image.

The repaint comment was wrong. With 0 writes to the page, a repaint has moved 140 pixels by up to 36 levels, so a browser's raster alone can pass any limit on levels, and levels cannot tell raster from a real change.

What the proofs gave at this code, on the fake voice:

| Proof | Result |
| --- | --- |
| `math-proof` `marks-and-labels`, laptop and phone | 0 writes with no cause, against 97 before. 88 replay moments, 0 differ |
| `math-proof` `reduced` | 0 moving frames under reduced motion, 0 unknown colors, 0 gradients, 0 rests that differ. 1 still board moved one pixel by one level with 0 writes |
| `math-proof` `hostile` | Markup never ran. 144 replay moments, 0 differ |
| `graph-proof` `reduced`, `hostile`, `marks` | Exit 0, on the fixes before this head's comment removal, one rename in the watch, and main's test-only merge, at a load average near 20. 0 of 5,711 live samples differ from their replay. 364 replay moments: 0 differ, 0 described differently, and 4 settled as raster, the largest 742 pixels by 40 levels with the same page and a clean second look. `hostile`: 0 and 0 writes with no cause, against 3,659 and 2,014 with one, at frames up to 80 ms. `reduced`: 0 unknown colors and 0 moving frames |

The `math-proof` rows are from before the merge with main and were not run again, though they share the frame watch that changed below.

**The clock of a replay.** After the merge, every moment read failed `replay.described`. A diff of every sample, not one example, found one path: `stage.sinceMs`, on all 5,586 differing live samples and all 364 moments, with replay minus live minus the clock shift exactly 0 each time. The samples that matched were those from before the stage existed. `describeBoard` now gives `{ mode, heldMs }`, so a replay on a shifted clock reads the same, and one that moved the board at another moment does not. The color failure was main's `--color-pen`, a real token the proof's list had missed.

**Writes with no cause.** These were the watch's own misreading. A write belongs to the frame the lab drew, and the watch asked what was moving 40 ms before the clock when the write was seen. A heavy paint finishes long after its frame's clock, so a curve's last steps looked causeless. Under a CPU slowed 4 times, 54 writes with no cause came in 6 batches, and the first 8 of each batch were read. They were a `d` on `curve-busy`, an `r` on `mark-m1` to `mark-m5`, and the ticks a curve brings when it lands. In all 6 batches the thing written had landed 56 to 396 ms before the write was seen, and was still moving at the frame of the write before. For example `d` went from 31,419 to 48,128 characters for the frame at 1520 ms, and was seen at 1739 ms, with the curve landing at 1575 ms. Its next write took it to 53,305 characters, the 53 KB path of the 1 write at the last head. That 1 write, and the 6 of a later run at full speed on `d` and `r`, were not traced one by one, so they are inferred to be the same from their marks and sizes. A look-back of one measured frame rescued nothing in the earlier test because it measured the gap between frames and not the paint's lag. `createWriteJudge` now asks whether anything moved since the frame of the write before, and `apps/agent/test/write-judge.test.ts` checks that a write after the landing is written still has no cause. The old watch counted 12 and 42 under that throttle, and this head counts 0 and 0 under it, with frames up to 360 ms, and 0 and 0 at full speed. Taking the look-back out of the judge fails its test. The test holds the case of a write at rest, and no plant does it on the real page, where `checkStillness` holds a board at rest to 0 writes.

**The settle rule.** A replay moment that differs settles when the board's HTML was identical during the look that differed, live and replay, and a second look at both is clean, whatever the levels. The painter's only output is the page, so a difference with the same page can only come from the browser's raster. The HTML is read while each shot is held, because a painter that lands wrong on one hold and converges by the next would pass a later read. `apps/agent/test/look-at-moment.test.ts` plants that: 742 pixels by 40 levels with a different page during the first look returns `different`. The same pixels with the same page and a clean second look return `settled`, and a difference that repeats returns `different`, with the same page or not.

A still board settles the same way: 0 writes, 0 animations, and a clean second look.

## What the tutor hears

The check leaves `tooSmallToRead`, `labelWithoutRoom`, `imageMissing`, and `markWithoutTarget` out of its defects only because a live tutor is told about them. `LiveBoard` now draws through `SharedBoard`, whose row painter passes these up. It sends a mark as `markNotDrawn`, and sends the others and `sliderWithoutConstant` as `boardProblem`. A row scrolls and never shrinks, so on that board `tooSmallToRead` comes only from a font already under 9 px. The agent adds a `board_problem` note to the tutor's next request, once for each problem. The note is built from what the model wrote, so a browser can name only an element or a label already on that tutor's board.

`curveTooFine` and `sliderOverlaps` still stop at the page, and the wiring PR forwards them. `eval:groups --file safety` ran on prompt v2 with the `board_problem` line, for $0.03 before the merge with PR 109 and $0.06 after it: 52 of 52 checks passed both times. No case in that file sends a `board_problem` note, so this shows the line does no harm to safety and says nothing about how the tutor answers a note.

## Choices worth keeping

- The check reads the page and not the layout code, so a browser's real line breaks and fallback fonts count.
- A too-small element goes to the tutor as a note and stays out of the defects, because the tutor asked for more than the board can hold. Outside the hostile scenes, that means `code-forty-lines` at 7 sizes and one diagram on the two smallest phones.
- Table words stay whole while the table fits, and break only when it cannot fit any other way.
- A note with no room beside its mark takes the free spot nearest the mark, not the first one it finds.

## Limits

- `createTierWatch` throws away any gap over a second as a hidden tab, so a real stall that long does not count toward dropping a tier.
- Real phones, Safari, and Firefox were not run. The phone figures are a laptop's Chromium at a phone's width with its CPU slowed.
- `hide` and `clearBoard` still remove an element at once.
- A very wide table on a small phone can still break words, and a 40-line code block on a phone is too small to read. The page reports the second, and a live tutor can write code only after the wiring PR.
- A handwritten label's words are checked through its name for a screen reader and the box its strokes make, not letter by letter.
- A label naming the wrong part of a drawing, when the sheet itself holds the wrong spot, needs a person's eye. Every drawing was looked at full size for this round, and the check only proves that a leader starts beside its own label.
- CI runs the sweep on two boards. The plants and the strobes take longer than its job allows, and `pnpm test:board` runs them.
- **This PR does not reach a live tutor yet.** Main's `DRAWN_KINDS` in `apps/agent/src/tutor/board-memory.ts` refuses `table`, `timeline`, `code`, `image`, and `drawing`, and the tutor's prompt does not name the new drawings, parts, and pictures. A wiring PR after this PR lands adds all of them to `DRAWN_KINDS` with prompt lines, forwards `curveTooFine` and `sliderOverlaps`, and reruns the crisis lane.
- **The check reads `BoardView`, and the live board is `SharedBoard`.** Since PR 97 a student's board paints rows through `createBoardRowPainting`, and the deck never draws through it. Every figure above is true of `BoardView`, which the lab and replay use. The wiring PR must point the check at the rows before a live tutor draws these kinds, or the proof will not cover the board the student sees.
