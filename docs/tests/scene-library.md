# The scene library

What M3.15 does, how to run it, and what it measured on 4 November 2026 on Abel's Mac, with other work running on the same machine.

## What it holds

133 scenes on the server's own list, written once. There is one opening scene for each of the 48 Home topics in `apps/api/src/picks/library.json`, and 5 deeper scenes for each of 17 of them in `apps/api/src/picks/deeper-scenes.json`. A scene's id comes from its title, so a card opens on its scene through the path M3.14 built, with no router call and no write. A typed question reaches a listed scene only when the router names its title exactly.

The run saved 130 of the 133 and a person's read flagged 6 of those, so 124 are served. Three are missing after 4 tries each, and a live lesson writes them when a student asks: `slope-friction` (one Home card, the review refused its forces), `seasons-deeper-5`, and `rainbow-deeper-5` (both ran out of time drawing).

No worker adds to it. Only these titles can make a scene every student sees, and the run writes nothing else.

Every scene passed the code checks, the layout check, and both review passes before it joined. The review is a strict filter and not a truth gate, so each scene still says "Not yet checked by a person".

Every scene here is ManimGX, because the kit path has not landed. The router is not asked, because a card's saved scene wins before the router is called, and a pick of the kit would leave a card with no scene today.

## Where it lives

The takes, frames, and records are in a store, a folder named by `SCENE_STORE_DIR`, with the shape PR 87 built. They are not in git. The library's own store is `/Users/abel/startup/astra-scene-library`, outside any worktree, so cleaning up a worktree cannot lose it. To use it, point the lesson service and the API at that folder.

Hosted, the same rule holds: the lesson service and the API must read one folder, or every take is refused. It is 119 MB, and it cannot go in the image, because `flags/` and the shared voice shelf are written while the app runs, and a deploy must not lose them. So it goes on a persistent disk, 2 GB to leave room for voice, copied up once as a tar of this folder. That works when both services run on one host. If they run as two services, a Render disk attaches to only one, so the takes would have to move to object storage behind `scene-store.ts` and the API's reader. That is a hosting decision for Abel, and it is not built.

The repo holds the list, the code, the tests, this page, and `scene-library-ledger.jsonl`, the run's spend by call. It holds no student data.

## Run it

```sh
SCENE_STORE_DIR=/Users/abel/startup/astra-scene-library node apps/agent/src/scenes/library/run-library.ts --lanes 4 --containers 2 --limit 35 --most-tries 4
```

Run it again to resume. It reads what is saved and what the ledger says, and it starts where it stopped. A saved scene costs nothing, and a plan already paid for is used again. A lock in `library-run/run.lock` stops a second run. After a reboot, if that process id now belongs to something else, delete the lock.

Each try is one plan, up to two writes, and both reviews, and it ends in a line in `library-run/ledger.jsonl`. Openings go first, and every scene of a kind gets its first try before any gets a second. A later try fixes the last try's code. Words a check refused are written again and told why. A failed try leaves no record a live lesson waits on, so a missing scene is just written live.

`--lanes` is more than `--containers` because a lane waiting on a model holds no container. The run stops starting tries when the ledger is within $1.20 of `--limit`, and refuses any model call past the limit.

Other tools in `apps/agent/src/scenes/library/`:

- `contact-sheet.ts` draws each scene's first and last frames, in both themes, into `library-run/contact/`.
- `audit-library.ts` runs every free check again on what is stored, and prints the library's capitalised names.
- `opening-proof.ts` opens saved cards on a running lesson service as a new student, and clocks them.

## Models

Plain Opus 5.5 at low effort plans and writes, at $4 and $20 a million tokens. Fast mode costs twice that for speed nobody here waits on. Sonnet 5.5 reviews, at low effort and then high, and a refusal at low skips the high pass. Haiku 5.5 reads names. Batch pricing would halve this, but one scene chains a plan, a write, a render, and a review. Most batches finish within an hour and the limit is 24, so a run would miss its day.

## Voice on first play

No voice is paid for ahead. The balance could not cover about 40,000 credits. Lesson audio is kept already: a card's lines go in `.scene-store/voice`, and any later student's lesson plays them for free.

So the first student to open a scene hears it live. That costs nothing in their wait beyond the voice's first audio, about 271 ms at p50 in `docs/tests/voice.md`. It costs about 600 characters of voice, about 300 credits, charged to that student's own daily allowance of 1,500 characters and to the day's 20,000. A student who is first on three scenes in a day reaches their limit and hears a tone, with the page saying why. As an estimate, 20,000 characters a day covers about 33 first plays. Every later student pays nothing.

## Flagging

A named reviewer opens `/scene-library`, sees a sample of 18 openings and 6 deeper scenes with their frames and words, and can flag one. A flag is a file in `flags/`, so it survives a reload and a restart. A flagged scene is found by no lesson and written again by none, and its take route answers 404, so that topic goes on from words and the plain board. It is not written live, which is the difference from a missing scene: the first save keeps its folder, so a corrected scene needs that folder removed first. "I looked at it" clears the flag and the same scene shows again.

Name reviewers by student ID in `SCENE_REVIEWER_IDS`, comma separated, on the API. With none named, everyone gets a 403.

## Measured

From the finished run on 4 November 2026. `scene-library-ledger.jsonl` holds the spend by call, and `library-run/summary.json` in the store names the missing scenes.

| Check | Result |
| --- | --- |
| The whole run | 130 of 133 saved, $29.76 under the $35 ceiling, 190 tries: 130 saved, 39 refused by the review, 20 failed drawing, 1 refused plan. Store 119 MB |
| 8 scenes one at a time, before the changes below | 3 saved on their first try, $0.975, 17.7 minutes, $0.122 a try. Sonnet repairs passed 1 of 6 |
| Changes after that | Opus repairs its own code, a later try gets the last code and its problems, more lanes than containers, openings first |
| Free checks on what is stored, `audit-library.ts` | 130 scenes, 2,194 lines, about 610 characters of voice a scene. No check fails. Layout notes on 2: `savings-growth`, `rainbow-deeper-3`. No long dash in any line |
| A person's read, below | 98 good, 26 flawed, 6 wrong and flagged |
| First frame on a real page, a saved card, tone voice, a real API and browser, 5 cards | Pressing the card to the scene on screen: 6.24, 7.54, 7.66, 8.23, 8.50 s, median 7.66 s. Load 30 to 33 on 12 cores with other lanes running. $0 and no model call |
| Where those seconds go, read from the lesson log | The page opens in 0.5 to 1.9 s. Then 3.3 s from the lesson starting until the student has joined the room, 50 ms to find the saved scene, 1.15 s for "Let's take a look", and 0.9 s to the page saying the scene is showing. The store is not the limit, and the 5 s goal is not met on this loaded Mac. The time on an idle Mac was not measured |
| `/scene-library` on a real API and browser, `SCENE_REVIEWER_IDS` set to a dev student | A non-reviewer gets 403 on the sample and on a flag, and the page says it is not for them. The reviewer sees 24 cards, flags one: `flags/` holds the file with their ID, the take route goes from 200 to 404, the flag holds over a reload, and "I looked at it" removes the file |
| A sudden stop, `kill -9` on the live run | Resumed 100 s later. 0 new charges for 12 saved scenes, 0 new plans for 4 scenes in flight, 2 containers |

## A person's read

Every saved scene's lines were read as a student hears them on a saved card: the setup line, the narration, the 4 more lines, and the close. The 6 opening lines are not spoken there, so words that lean on them count as a flaw. The pictures were read from the contact sheets, the first and last frame of each scene in light and dark, at full size. The frames between were not looked at, except by the review. Wrong means a false fact or a misleading picture, and those are flagged. Flawed means true, with a term left unexplained, a word leaning on what nobody heard, or a small layout fault.

| Scene | Rating | Why |
| --- | --- | --- |
| `braking-distance` | wrong, flagged | "Brakes remove that energy at a steady rate" is true per metre and false per second, and a student hears per second. That rate would make distance grow with speed cubed |
| `great-pyramid` | wrong, flagged | Gives the 3, 4, 5 knotted rope as how the pyramids were squared. No record shows that method there. "Truly perfect corners" is also false |
| `black-hole-edge-deeper-1` | wrong, flagged | A sun's mass is "about three kilometers across". That is the radius, and across is about six |
| `black-hole-edge-deeper-3` | wrong, flagged | In dark, the black hole is a bright white disc |
| `black-hole-edge-deeper-4` | wrong, flagged | In dark, the black hole is a bright white disc while the words say "a dark shadow" |
| `black-hole-edge-deeper-5` | wrong, flagged | In dark, the black hole is a bright white disc |
| `savings-growth` | flawed | A box runs through the "+$10" label at 12.3 s. "Year two adds eleven dollars" comes with no starting sum |
| `moving-clocks` | flawed | Gamma's formula is on the board, and muons are unexplained |
| `sunflower-spirals` | flawed | The golden angle and golden ratio are named, never explained |
| `pythagoras` | flawed | "The triangle" and "hypotenuse, as promised" lean on the opening. The picture carries the proof |
| `quadratics` | flawed | "Is zero too" leans on the opening, and "real number" is unexplained |
| `free-throw-odds` | flawed | "Her next shot", with no shooter heard |
| `engine-burn` | flawed | "Hydrocarbon" is unexplained. The burned gas is "mostly carbon dioxide and water", and the exhaust is mostly nitrogen, as `engine-burn-deeper-3` says |
| `recursion` | flawed | Recursion, "factorial", and "base case" are not explained in what is heard |
| `saturn-rings` | flawed | A broken moon is one leading idea for how the rings formed, and the scene says it as settled |
| `star-atoms` | flawed | "Stars made the atoms in every living thing" skips hydrogen, from the Big Bang. "Fusing" is unexplained |
| `minor-chord` | flawed | "Half steps" are defined only in the opening |
| `string-pitch` | flawed | "Octave" is unexplained, and the picture's ν is never named |
| `star-atoms-deeper-3` | flawed | Says gold forms in a supernova's blast. `star-atoms-deeper-5` says neutron star collisions, the better supported answer |
| `star-atoms-deeper-4` | flawed | "Mass number" is unexplained |
| `jump-shot-deeper-1` | flawed | "Sine theta" is unexplained |
| `jump-shot-deeper-5` | flawed | "Range" and "sine" are unexplained in what is heard |
| `rainbow-deeper-2` | flawed | "The shadow point" leans on the opening |
| `rainbow-deeper-3` | flawed | Two lines run about 0.3 past the bottom edge, and the board's n is unexplained |
| `moving-clocks-deeper-2` | flawed | Muons are unexplained |
| `derivative-deeper-3` | flawed | "f prime of x" is unexplained |
| `quadratics-deeper-3` | flawed | "Discriminant" is defined only in the opening, though the picture shows it |
| `sunflower-spirals-deeper-1` | flawed | The golden ratio is named, never explained |
| `sunflower-spirals-deeper-2` | flawed | The golden angle is named, never explained |
| `sunflower-spirals-deeper-5` | flawed | The golden angle is named, never explained |
| `periodic-table-deeper-1` | flawed | The opening says "by size", heard only when a device cannot play the scene. The narration's proton count is right |
| `engine-burn-deeper-2` | flawed | "Breaks those bonds and gives the energy back" is loose: breaking a bond takes energy, and forming new ones gives more back |
| Every other saved scene, 98 | good | jump-shot, free-kick, breaking-wave, rainbow, rocket-escape, circuit-current, expected-goals, derivative, magic-square, perspective, positive-test, balancing-equations, periodic-table, browned-food, cake-rise, indigo-dye, alchemists, game-worlds, fastest-route, binary-counting, sorting-speed, music-file, two-strangers, programmable-loom, moon-face, seasons, black-hole-edge, dna-copying, still-frames, plato-aristotle, socrates-trial, bread-revolution, van-gogh-motion, and the remaining deeper scenes of each topic |

The names in what is said are figures school books teach, or names of things: Einstein, Dürer, Pythagoras, Plato, Aristotle, Socrates, Van Gogh, Dijkstra, Jacquard, Fibonacci, Diffie-Hellman, Maillard, Roche, Schwarzschild, Encke. Each attribution read true. No living person and no private person appears.

The saved takes cannot be edited, so a flawed scene stays until a rewrite. A rewrite is not in this PR, because this round spends nothing on writing.

## What this does not prove

- That the scenes are true. One careful read is not an expert's, and the frames between the first and last were read only by the review.
- A first frame under 5 s. Measured here at a median of 7.66 s on a loaded Mac, and the limit is before the store is read.
- What a student on a flagged card sees on a page. The take route's 404 is proven here, and the fall to the plain board by the tests.
