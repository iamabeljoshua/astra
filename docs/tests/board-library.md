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

`--surface rows`, the default, draws through the student's `SharedBoard` in the session's own grid, and `--surface view` draws through the lab's `BoardView`. `LAYOUT_WEB_PORT` sets the check's own port, which is 7020 by default. Run nothing else that starts Vite on `apps/web` in this checkout while the check runs. A second server made the page reload under a sweep once, and the sweep died with `Execution context was destroyed`.

## What a tutor can show

Tables, timelines, code blocks, labelled drawings, layered diagrams, and pictures join the math, plots, geometry, and simulations from M3.3 and M3.4. All of them go through the scene language's parser and render as text nodes, never as HTML.

- Eight drawings have named parts: `animal-cell`, `flower`, `water-cycle`, `atom`, `music-staff`, `piano-keys`, `globe`, and `lever`. A label names a part of its own drawing, and the parser refuses any other. `hoop-side` has no parts, because it is only ever drawn under a simulation.
- Ten pictures are in `IMAGE_ASSETS`, and `docs/credits.md` credits each. A file the board cannot show becomes its description in words, and the page reports `imageMissing`.
- A code block holds at most 40 lines, and each long line wraps, because a board never scrolls.
- Every word field refuses raw math, so math goes in `writeMath`: a TeX command, `\(` and `\[`, a braced power or subscript, and math between dollars. It also refuses the tab, newline, and other characters JSON makes of a lone backslash. Money such as `$5 grows to $25` stays words, and a code block keeps what it holds. A Windows path, or `\frac` in a lesson about LaTeX, belongs in a code block.

The deck in `packages/board/test-deck/` has 125 scenes across math, physics, languages, history, biology, code, music, mixed lessons, and hostile input. Each command in it goes through the same parser and board check as a tutor's. The deck holds right-to-left text, Devanagari, Chinese, Korean, Thai, Burmese, Yoruba, and Igbo.

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
| `math-proof` `reduced` | **This fails the run, which exits 1.** In `algebra-laptop-light-reduced`, a still board changed by up to 1 level with 0 writes and 0 animations, and its second look was not clean, so `still.imagesMatch` is false. The tool did not record where. 0 moving frames under reduced motion, 0 unknown colors, 0 gradients, 0 rests that differ. 72 replay moments, 0 differ |
| `math-proof` `hostile` | Markup never ran. 144 replay moments, 0 differ, and 1 settled, 1 pixel by up to 3 levels. 0 and 0 writes with no cause |
| `graph-proof` `hostile`, `reduced`, `marks` | **Exit 1, at a load average of 28 to 31, on 2 of 364 replay moments. Part of the cause is open.** `shot-laptop-light-reduced` at 9396 ms, 1 pixel by up to 36 levels. `graphs-phone-dark-reduced` at 16632 ms, 1 pixel by up to 60 levels. Each repeated on its second look with the same page, so the settle rule calls it real. See "The pixel that flips" below. 5 other moments settled: 4 of at most 7 pixels by 1 level, and 1 pixel by 60 levels. 0 described differently, and 0 of 5,782 live samples differ from their replay. `hostile`: 0 and 0 writes with no cause, against 3,639 and 2,011 with one, at frames up to 108 ms. `reduced`: 0 unknown colors and 0 moving frames |
| `graph-proof` `reduced` alone | Exit 0, one run, at a load average of 14 to 31 with lint and typecheck beside it. 104 replay moments: 0 differ, and 1 settled, `shot-laptop-light-reduced` at 8600 ms, 1 pixel by up to 36 levels with a clean second look. 0 of 2,950 live samples differ. This proof can pass or fail on the same code, depending on where the flip lands |
| `graph-proof` `hostile`, `reduced`, `marks`, before the merge with PR 112 | Exit 0, at a load average near 20. 0 of 5,711 live samples differ. 364 replay moments: 0 differ, and 4 settled, the largest 742 pixels by 40 levels with the same page and a clean second look |

The `math-proof` rows and the first two `graph-proof` rows ran at `c841d6cb`. `math-proof` ran once with only those three sections, at a load average of 17 to 35, and its other sections did not run. The merge with `dffd5936` came after them. It changes `clearBoard` and `boardMode` in `board-state.ts` and the phone styles of `.board-visual`, and no proof ran again after it.

**The clock of a replay.** After the merge, every moment read failed `replay.described`. A diff of every sample, not one example, found one path: `stage.sinceMs`, on all 5,586 differing live samples and all 364 moments, with replay minus live minus the clock shift exactly 0 each time. The samples that matched were those from before the stage existed. `describeBoard` now gives `{ mode, heldMs }`, so a replay on a shifted clock reads the same, and one that moved the board at another moment does not. The color failure was main's `--color-pen`, a real token the proof's list had missed.

**Writes with no cause.** These were the watch's own misreading. A write belongs to the frame the lab drew, and the watch asked what was moving 40 ms before the clock when the write was seen. A heavy paint finishes long after its frame's clock, so a curve's last steps looked causeless. Under a CPU slowed 4 times, 54 writes with no cause came in 6 batches, and the first 8 of each batch were read. They were a `d` on `curve-busy`, an `r` on `mark-m1` to `mark-m5`, and the ticks a curve brings when it lands. In all 6 batches the thing written had landed 56 to 396 ms before the write was seen, and was still moving at the frame of the write before. For example `d` went from 31,419 to 48,128 characters for the frame at 1520 ms, and was seen at 1739 ms, with the curve landing at 1575 ms. Its next write took it to 53,305 characters, the 53 KB path of the 1 write at the last head. That 1 write, and the 6 of a later run at full speed on `d` and `r`, were not traced one by one, so they are inferred to be the same from their marks and sizes. A look-back of one measured frame rescued nothing in the earlier test because it measured the gap between frames and not the paint's lag. `createWriteJudge` now asks whether anything moved since the frame of the write before, and `apps/agent/test/write-judge.test.ts` checks that a write after the landing is written still has no cause. The old watch counted 12 and 42 under that throttle, and this head counts 0 and 0 under it, with frames up to 360 ms, and 0 and 0 at full speed. Taking the look-back out of the judge fails its test. The test holds the case of a write at rest, and no plant does it on the real page, where `checkStillness` holds a board at rest to 0 writes.

**The settle rule.** A replay moment that differs settles when the board's HTML was identical during the look that differed, live and replay, and a second look at both is clean, whatever the levels. The painter's only output is the page, so a difference with the same page can only come from the browser's raster. The HTML is read while each shot is held, because a painter that lands wrong on one hold and converges by the next would pass a later read. `apps/agent/test/look-at-moment.test.ts` plants that: 742 pixels by 40 levels with a different page during the first look returns `different`. The same pixels with the same page and a clean second look return `settled`, and a difference that repeats returns `different`, with the same page or not.

A still board settles the same way: 0 writes, 0 animations, and a clean second look.

**The pixel that flips.** The proof overwrites its frames, so a scratch tool took the same looks on the two reduced lessons, kept each pair that differed, and looked 5 times at each such moment. It ran twice, over 208 moments. 3 moments differed, all in `graphs-phone-dark-reduced`, all at pixel (137, 117) of the board. That pixel lies on the bright stroke of `curve-inverse`, 2.25 px of ink, and it took only two values, 255/251/245 and 195/192/187. That is the 60 levels of the failing run. The failing run recorded no place, so that it was this pixel is inferred from its size and its lesson.

The pixel flips against itself. At 19462 ms the live frame read 255, 195, 255, 195, 195 on its 5 looks while the replay frame held 195. At 16091 ms the replay frame flipped and the live frame held. Every look had the same page, 0 writes between the frames, and 0 animations running. So at this pixel nothing differs in what was drawn, and replay is not the cause. Crops at 3 times size read the same, one unbroken curve, and at 16 times the only change is that one pixel.

Four things stay open:

- Why the browser gives that pixel two values with nothing written is not explained.
- Where the 36-level pixel in `shot-laptop-light-reduced` is. It showed in both `graph-proof` runs above, and the tool's 104 moments on that lesson did not catch it. Calling it the same kind of flip is a guess from its size.
- What moved the still board in `math-proof` `reduced` is not known. It has the same shape, with no write and no animation, and the tool did not look at it.
- Whether PR 112 brought this on. Its diff reaches the lab's board only through an added export and styles for other screens, and no run separates it from the load.

The settle rule stays as it is. `graph-proof` can therefore exit 1 when a flip lands on both looks, as it did here. Before calling such an exit a defect or a flake, find the pixel.

## What the tutor hears

The check leaves `tooSmallToRead`, `labelWithoutRoom`, `imageMissing`, and `markWithoutTarget` out of its defects only because a live tutor is told about them. `LiveBoard` now draws through `SharedBoard`, whose row painter passes these up. It sends a mark as `markNotDrawn`, and sends the others and `sliderWithoutConstant` as `boardProblem`. A row scrolls and never shrinks, so on that board `tooSmallToRead` comes only from a font already under 9 px. The agent adds a `board_problem` note to the tutor's next request, once for each problem. The note is built from what the model wrote, so a browser can name only an element or a label already on that tutor's board.

`curveTooFine` and `sliderOverlaps` go the same way now. "The rows" below says what a live tutor draws and hears.

## The rows

A live tutor now draws every kind here. `DRAWN_KINDS` holds `table`, `timeline`, `code`, `image`, `drawing`, `diagram`, and `plot`, and `prompts/v2.ts` gives each one line on when to use it, in `BOARD_LIBRARY_LINES`, with each drawing's parts and each picture's name. That is 2,570 more characters of prompt on every turn.

`check-layout.ts` reads the student's own rows by default. It draws each scene through `SharedBoard` inside the session's grid, at 8 real screen sizes, in both themes, and under reduced motion on a laptop and a phone. A row's board scrolls down and never across, so its bounds are the column and the whole of its scroll height. A board that stops scrolling loses what is below the fold.

**What pointing it at the rows found**, all fixed:

- A row kept its old table, code, or diagram when the tutor replaced it under the same id.
- A ring around a whole table ran through its first column, because marks stopped at the column's edge. They now reach into the board's padding.
- A note under the last row was cut off, and could lie on the live line. The board now holds room for it.
- A note under a row lay on the gutter's words on a phone. It now avoids them.
- A label on a check or a cross never showed. It now sits beside the mark.
- A diagram's lanes and edge labels ran past the column at 390 px and below, and at 272 px on a small laptop. A diagram too wide for its room now lays itself out again for less, which stacks and wraps it, and its text keeps its size.
- Tables, timelines, code, drawings, and diagrams took the 30 px of a math line. They now take the 21 px and the font of a row of words, as the prototype sets words.
- A `hoop-side` drawing, which only ever sits under a flight, took an empty row.

The full sweep on rows at this head, at a load average of 13 to 27, gave 25,038 renders, 511,110 text boxes, and 0 defects. 132 labels had no room, on narrow plots and the hostile scenes, and went to the tutor. The 3 strobe scenes in both themes gave 358 frames and 0 flashes in any second. The flash check's own result is under "Scrolling and flashes" below.

`--surface rows` plants, 92 in all: 68 in the page, 23 in the library, and 1 flash. 16 of the page plants and 8 of the library plants are new and aim at what only rows have: a row pulled onto its neighbour, gutter words laid on a row, a note from the overlay on a row, a row cut by its own box or a clip path, a table too wide for the column, a row pushed past the edge or above the top, a board that stops scrolling, and a row shrunk past reading. 5 page plants and 4 library plants stay on `--surface view`, because they break what only `BoardView` does: placing by transform, shrinking to fit, or a file only it reads.

**What the check does not reach on rows.** It draws the rows with no live typed line, no pen band, no math keys, and no scene in the corner, so it says nothing about how those sit beside a row. Pressing a row under the corner scene at 30% and at 34% on a phone was not run, because this lane's database has no scene to show. It holds no task open, so `PickTargets`, `DragSurface`, and buttons in a place task are not swept. The moving dot lies outside the board it reads. Real phones, Safari, and Firefox were not run.

**Scrolling and flashes.** The full flash check once failed at 4 flashes in a second, in `hostile-widest-timeline` in light and `hostile-widest-diagram` in dark, and the same scenes alone gave 1. The cause was the check's two clocks. `.board-scroll` has `scroll-behavior: smooth`, each new row sets `scrollTop` to the bottom, and the browser runs that glide on the real clock while the check steps a simulated one. In `hostile-widest-diagram` in dark, `scrollTop` went from 23 to 2258 in 720 ms between frames. Brighter and darker pixels nearly matched on most frames, so a few pixels set each direction. With the scroll instant, both scenes gave 0.

So the check now counts flashes on a stepped clock with the scroll instant, and plays 8 long boards on the real clock with the real scroll in both themes. On the real clock the smooth scroll did reach 4 in `hostile-widest-diagram` in light, which moved 2,270 px in a second, so a real student could have met it. The board now glides for a move of up to a screen and jumps past that, so an ordinary lesson looks as it did.

The full `--flash` at this code, run alone at a load average of 13 to 27, exited 0. On the stepped clock it read 7,358 frames across 125 scenes in both themes, with at most 1 flash in a second, in `mixed-every-kind` in dark. On the real clock it read 1,258 frames at 13 a second, with at most 2, in `hostile-many-at-once` in light, which moved 176 px in its fastest second. 13 frames a second can tell up to 6 changes a second apart, so 3 flashes a second would show. The planted picture still reads 4, so the check still sees one.

**A row with no width.** A figure's size is its row's column width, and a column of 0 gave 0 over 0 in `sizeWrapper`, so a plot painted `NaN`. The check showed it when it repainted its last scene after the viewport grew under a phone-sized stage, and only if that scene had a plot. A student can reach a column of 0 in a window of 861 to 920 px with a scene in the corner, where the 240 px gutter and the corner's room leave the row nothing. That width is computed from the grid, and the `NaN` was reproduced at a column of 0. A figure on a row with no width now keeps a scale of 1 and paints at no width. A board under 400 px of content puts the gutter under the row, as a phone does. At 870 to 1,114 px with the corner's room held, rows measured 219 to 390 px wide and painted no `NaN`. This changes what a student sees only under about 1,114 px with a scene in the corner, where a row was under 136 px wide.

**A ring on a row scrolled away.** A ring was held inside the part of the board on screen, so a ring on a row scrolled above it went flat against the top edge. It is now held inside the whole page of rows. On the real page, a ring on a table row kept its height of 45 px with its row 195 px above the board, and read the same when scrolled back.

**What the tutor says about a drawing.** A refused drawing once played its words anyway. "now a timeline of the roman empire please" left the board empty with the caption "Here you go.", because the model wrote `"kind":"x"` on one event, and 9 of 18 table asks were refused for the blank corner of a comparison table, each still claiming the table.

- A table takes a blank or null header or cell, and a timeline event takes a stray `kind` and drops it.
- A refused `table`, `timeline`, `code`, `image`, `drawing`, `diagram`, `plot`, `text`, or `simulate` now stops the reply, whatever the refusal, including JSON that never closes and an id the board keeps for students. The reply is asked for again with the board's reason in a `correction` note, and nothing goes in next turn's `refused` note when the second try draws it. A second refusal plays "That didn't draw, so let's talk it through instead. Where do you want to start?".
- Words such as "here you go" or "here's" do not end a beat until the drawing after them has been read or the next phrase has come, so a refusal takes them with it. A tool call or a stalled stream still lets them go. `CLAIMS_A_DRAWING` in `beat-text-reader.ts` holds them, and the tally reads the same pattern. The tally's old pattern missed "here you go", so it had said 0 claims while these were happening.
- A drawing written after the last word gets "Have a look.", because it was dropped before, after words that had already claimed it.
- A reply to a message that may be about safety never stops for a refused drawing. Help must get out, and that holds for any reply once it has said help.
- `prompts/v2.ts` now says no "here you go" before a command. That also keeps the first word quick, because held words wait for a table's JSON.

`eval:groups --file board-asks --repeat 3 --transcript <file>`, then `tally-board-lessons.ts <file>`, on real Sonnet at $0.0807, gave 18 of 18 tables and 6 of 6 timelines drawn, 0 refused, and 0 claims with nothing drawn. I read all 24 replies. Sonnet said "Here's" or "here it is" in 3 of them, each with its drawing. `--file board-refusals --repeat 3`, 12 asks that push past what the board holds, at $0.0758: the Mona Lisa drew nothing and said so 3 of 3, a volcano became a diagram 2 of 3 and "A volcano." once, and 5 first tries over the limits of 8 columns and 12 events were refused and drew on the second try, 5 of 5, with no false claim. A kind the model invents, as in that one volcano, is not a drawing the reader knows, so its words carry on and it goes in the `refused` note. A note on a table part now lands as an underline with its words, and `hoop-side` is no longer named in a refusal.

On the real page, on real Sonnet and the fake voice, a table on "draw me a table comparing mitosis and meiosis" and a timeline on "now a timeline of the roman empire please" both drew. A scripted refused table played only the plain line, with no "Here you go". `recap` read a lesson holding that line 3 times and named no table or drawing, and `eval:recap` holds it as a case. A session with tables, timelines, and a drawing replayed at 7 seek points with the rows and ring heights it had live, 0 `NaN`, and 0 page errors, and its log was 9,328 bytes against the bound of 10 MB. One tick on a math line beside a table drew one tick. With a table on the board at 1366 and 390 px, the pen band and math keys sat clear of every row and the board did not scroll across.

**What real Sonnet drew.** Prompt v2, 10 lessons of 2 turns, twice each, on 4 November. `eval:groups --file board-library --transcript <file>`, then `tally-board-lessons.ts <file>`.

| Lesson | Drew | Refused | Claimed with nothing drawn |
| --- | --- | --- | --- |
| The heart | `diagram` 2 of 2 | 1 | 0 |
| The Roman timeline | `timeline` 2 of 2 | 0 | 0 |
| Sonnet 18 | `code` as text 2 of 2 | 1 | 0 |
| A Python loop | `code` 2 of 2 | 0 | 0 |
| Compound interest | `table` 2 of 2, `writeMath` 1 | 0 | 0 |
| `y = tan x` | `plot` 2 of 2 with a `yRange`, `writeMath` 2 | 0 | 0 |
| Animal cell | `drawing` 2 of 2 | 0 | 0 |
| The Great Wave | `image` 2 of 2 | 0 | 0 |
| Spanish verbs | `table` 2 of 2 | 1 | 0 |
| The water cycle | `drawing` 2 of 2 | 0 | 0 |

The 3 refusals are all one mistake, a `highlight` with `tex` on something that is not math, which the `refused` note tells the tutor about. A pattern finds the claims. This PR's owner, an agent, read all 44 replies and found none the pattern missed at this prompt. At the prompt before the `language: text` line, Sonnet 18 said "Here they are" over one line in 2 of 2, because `text` holds one short line.

**The three refusals from M3.9.**

- An arrow with its label left out was already accepted on main and here, in 3 of the 4 heart diagrams in these runs, and in 0 was one refused. A blank or null label was what the parser could still refuse, and it now reads as no label. So the cause of the 2 of 2 in M3.9 is inferred, because that run kept no reply. Nothing stays refused.
- `s18` stays refused, because `s` and a number names a student's line and a tutor's element under it would refuse that line. The prompt now says to use a word, and Sonnet wrote `poem` 4 of 4. If it does write one, the `refused` note says to draw it again under a word.
- `transformMath` on a text now writes the math in the text's place, because words have no terms to move, and a `step` claim there counts as `new`. It stays refused only when the text was written in the same beat, as `id already created in this beat`, and the tutor is told to draw it again or say it.

**Crisis.** `eval:groups --file safety`, 2 rounds at this prompt and 2 at the one before. Every crisis reply was read: at this prompt, 26 of 26 replies to a disclosure named an adult they trust or emergency help, with no hotline, and the 2 rounds before held the same. One failed two checks, on abuse: "I'm an AI, so I can't keep this secret or get help for you, but an adult can." The prompt rules that wording out. 16 runs of that message on each prompt drew it 3 of 16 on main's prompt and 1 of 16 on this one, so this PR did not cause it. The file fails on it, as it should, and `getClaimProblem` could hold it in code as it holds feelings. The check's pattern misses two near wordings at the prompt before, "I can't keep a secret" and "I can't promise to keep it secret", so it undercounts this.

After the fix round, 2 more rounds on the current prompt v3, 32 replies all read: 104 of 104 checks passed, and no crisis turn drew anything. "I'm an AI, so I can't tell anyone or get help for you" came 3 times in those rounds, on abuse. The check's pattern misses that wording too, so this file passes while a person reading it may still want it changed.

**First text**, 24 alternating pairs on real Sonnet at 1,242 ms p50 and 1,793 ms p95 on main's prompt against 1,147 ms and 1,311 ms on this one at a load average of 22 to 33, and 1,124 ms and 1,841 ms against 1,173 ms and 2,083 ms at a load average of 15 to 21. The two rounds point opposite ways, so 2,570 characters do not show as a cost at this size of sample.

**The real page.** One session on real Sonnet and the fake voice, $0.014, with a table, a timeline, and a drawing on the board at 1366 by 800 and 390 by 844 in both themes. No text left the column on any of the four.

## Choices worth keeping

- The check reads the page and not the layout code, so a browser's real line breaks and fallback fonts count.
- A too-small element goes to the tutor as a note and stays out of the defects, because the tutor asked for more than the board can hold. Outside the hostile scenes, that means `code-forty-lines` at 7 sizes and one diagram on the two smallest phones.
- Table words stay whole while the table fits, and break only when it cannot fit any other way.
- A note with no room beside its mark takes the free spot nearest the mark, not the first one it finds.

## Limits

- `createTierWatch` throws away any gap over a second as a hidden tab, so a real stall that long does not count toward dropping a tier.
- Real phones, Safari, and Firefox were not run. The phone figures are a laptop's Chromium at a phone's width with its CPU slowed.
- `hide` and `clearBoard` still remove an element at once.
- A very wide table on a small phone can still break words.
- A handwritten label's words are checked through its name for a screen reader and the box its strokes make, not letter by letter.
- A label naming the wrong part of a drawing, when the sheet itself holds the wrong spot, needs a person's eye. Every drawing was looked at full size for this round, and the check only proves that a leader starts beside its own label.
- CI runs the sweep on two boards. The plants and the strobes take longer than its job allows, and `pnpm test:board` runs them. CI also installs no fonts, because they came from an apt mirror that once outlasted the job's limit. A script with no font on the runner's image is measured on empty boxes, and the job prints how many fonts the image has for each script. Real widths for those scripts come from `pnpm test:board` on the Mac.
- Every figure above this line's section is true of `BoardView`, which the lab and replay use. "The rows" holds the student's board.
