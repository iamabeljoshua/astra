# The board library: what was measured

This is the record for M3.5. A tutor can put anything the plan names on the 2D board, for any subject, and a tool proves that no text overlaps, clips, or leaves the board. Every figure here comes from the real page on Abel's Mac under load from other agents, and each section gives its load average. Nothing here spent voice credits or model credits.

To run it all again, with `livekit-server` on the path:

```sh
pnpm test:board                                        # board tests, every plant, a quick sweep, and the strobes
node scripts/check-layout.ts --flash                   # every plant, the full sweep, and the flash check on every scene
node scripts/check-layout.ts --sheets .layout-check/sheets   # m3-5-deck.png and a sheet for each subject
node scripts/check-layout.ts --rates .layout-check/rates     # frame rates, and m3-5-tier.png
export WEB_PORT=7021 LAB_LIVEKIT_PORT=7022 LAB_LIVEKIT_UDP_PORT=7024 LAB_RELAY_PORT=7025 VITE_SUPABASE_URL=http://127.0.0.1:54421 VITE_SUPABASE_PUBLISHABLE_KEY=lab-proof
pnpm --filter @astra/agent proof --stored <a take from store-run.ts> --only library,library-phone-tier-held,library-phone-tier-measured --out /tmp/m3-5-tier
```

`LAYOUT_WEB_PORT` sets the check's own port, which is 7020 by default.

## What a tutor can show

Tables, timelines, code blocks, labelled drawings, layered diagrams, and pictures join the math, plots, geometry, and simulations from M3.3 and M3.4. All of them go through the scene language's parser and render as text nodes, never as HTML.

- Eight drawings have named parts: `animal-cell`, `flower`, `water-cycle`, `atom`, `music-staff`, `piano-keys`, `globe`, and `lever`. A label names a part of its own drawing, and the parser refuses any other. `hoop-side` has no parts, because it is only ever drawn under a simulation.
- Ten pictures are in `IMAGE_ASSETS`, and `docs/credits.md` credits each. A file the board cannot show becomes its description in words, and the tutor hears about it.
- A code block holds at most 40 lines, and each long line wraps, because a board never scrolls.
- Text and a picture's description refuse raw TeX, so math goes in `writeMath`.

The deck in `packages/board/test-deck/` has 118 scenes across math, physics, languages, history, biology, code, music, mixed lessons, and hostile input. Each command in it goes through the same parser and board check as a tutor's. The deck holds right-to-left text, Devanagari, Chinese, Korean, Thai, Burmese, Yoruba, and Igbo.

## The check

`scripts/check-layout.ts` draws each scene on the real page and reads what the browser laid out, not what was asked for. It draws at 10 board sizes on 8 screens, in both themes, and under reduced motion on a laptop and a phone. Each scene is read 40, 180, and 400 ms after each command lands, and again at rest.

It reports these as defects:

- Text on text, text off the board, text off its own element, and text cut by a box.
- An element on an element, and an element or a mark off the board or on a neighbour.
- An arrow through a box, and an arrow through words.
- Raw TeX, a KaTeX error, an element that is not on the list, a broken or stretched image, and a number that is not finite.
- A color outside the tokens, a gradient, and text under 9 px that nothing told the tutor about.
- A word left out, unless the board told the tutor.

| Measure | Result |
| --- | --- |
| Full sweep | 31,776 renders, 503,056 text boxes, 0 defects, in about a minute |
| Planted defects | 36 of 36 caught: 21 in the page, 14 in the library, and 1 flash |
| Flash check | 358 frames on the 3 strobe scenes in both themes, at most 0 flashes in any second. With the picture's hold planted out, 4 |

A plant either breaks the page or rewrites one line of the library as it is served, and never touches the disk. Each must be caught by the kind of defect it plants.

**What the check found.** On the first pass the sweep with the new checks found faults the old one missed, and each is fixed:

- A long arrow's corners cut through its neighbours. Rows of different heights let a diagonal start beside a taller box, and the painter's rounding pulled a corner into the next box.
- Edge labels sat on their own arrows, and two labels in a gap landed on each other.
- A curve with no values to draw lost its name with no report, which only showed once the check stopped counting a screen reader's name as shown words.
- A picture placed and cleared 4 times a second flashed 4 times a second.

## Arrows

A layered diagram now changes direction only in the gaps between ranks. Inside a rank a line runs straight, in a lane of its own, so it cannot touch a box. The painter rounds a corner by 4 pixels at most, because a point now stands each side of it. An edge label takes the nearest spot beside its own line that clears every line and every other label. A node pointing at itself gets a small loop outside its box.

`packages/board/test/layout-graph.test.ts` draws 1,000 random graphs with skips, loops, returns, and repeats, at random widths, with no arrow on a box or a label and no label on a label. The sweep then checks the same on the real page, by walking each path every 4 px with `getPointAtLength`.

## Flashing

The board's only motion is drawing and fading, so a normal lesson cannot flash. What can flash is a tutor sending commands faster than speech, so the deck has three strobe scenes, with a picture or a full table placed and cleared 3 to 6 times a second.

`scripts/layout/flash-check.ts` steps each strobe scene 20 times a simulated second and every other scene 10 times, reads the pixels, and counts WCAG's general flash: a pair of opposing changes of 10% luminance, with the darker side under 80%, over 25% of a 10 degree field, which is 21,824 pixels. It counts pixels on the whole board and does not ask that they touch. It does not check saturated red.

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

`getProofFailures` now fails on `still.imagesMatch`, `summary.wasRun`, `summary.hasScript`, `colors.unknownColors`, `colors.gradients`, `rests.differingImages`, `rests.motionLeft`, and `frames.movingWithReducedMotion`. Before this each of those could report a fault and still exit 0.

`math-proof` no longer counts what the board writes while the proof itself holds it at another moment, which were the 97 writes with no cause in `marks-and-labels`. The page checks now allow `img.board-image`, and only that image.

The repaint comment was wrong. With 0 writes to the page, a repaint has moved 140 pixels by up to 36 levels, so a browser's raster alone can break the limit of 2 levels.

What the proofs gave at this code, on the fake voice:

| Proof | Result |
| --- | --- |
| `math-proof` `marks-and-labels`, laptop and phone | 0 writes with no cause, against 97 before. 88 replay moments, 0 differ |
| `math-proof` `reduced` | 0 moving frames under reduced motion, 0 unknown colors, 0 gradients, 0 rests that differ. 1 still board moved one pixel by one level with 0 writes |
| `math-proof` `hostile` | Markup never ran. 144 replay moments, 0 differ |
| `graph-proof` `reduced`, `hostile`, `marks` | 2 of 364 replay moments differ: 1 pixel by 53 levels and 742 pixels by 40 levels. Both had the same page and a clean second look |

A still board now takes the same second look as a replay moment, under the same limit of 2 levels, so one pixel of raster does not fail a proof and a real change does.

**A rule for countersign, not in the gate.** A difference settles when the page's HTML is identical at both moments and a second look at both is clean, whatever the levels. The painter's only output is the page, so a difference with the same page can only come from the browser's raster, and `writes` and `animations` already fail on anything still moving. Each of the 2 moments above would settle under it, and none that had a different page would. `lookAtMoment` logs the page comparison today, so every run adds evidence. The rule is one commit on `feat/m3-5-settle-rule`.

## Choices worth keeping

- The check reads the page and not the layout code, so a browser's real line breaks and fallback fonts count.
- A too-small element is reported to the tutor and left out of the defects, because the tutor asked for more than the board can hold. Outside the hostile scenes, that means `code-forty-lines` at 7 sizes and one diagram on the two smallest phones.
- Table words stay whole while the table fits, and break only when it cannot fit any other way.
- A note with no room beside its mark takes the free spot nearest the mark, not the first one it finds.

## Limits

- Real phones, Safari, and Firefox were not run. The phone figures are a laptop's Chromium at a phone's width with its CPU slowed.
- `hide` and `clearBoard` still remove an element at once.
- A very wide table on a small phone can still break words, and a 40-line code block on a phone is too small to read. The tutor hears about the second.
- A handwritten label's words can only be checked through its name for a screen reader.
- CI runs the sweep on two boards. The plants and the strobes take longer than its job allows, and `pnpm test:board` runs them.
- The tutor's prompt does not name the new drawings, parts, and pictures yet. That belongs to M3.7.
- PR 97 adds `--color-pen`. The check's token list holds `pen` already, so the two can land in either order.
