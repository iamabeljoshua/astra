# The scene library

What M3.15 does, how to run it, and what it measured on 4 November 2026 on Abel's Mac, with other work running on the same machine.

## What it holds

133 scenes on the server's own list, written once. There is one opening scene for each of the 48 Home topics in `apps/api/src/picks/library.json`, and 5 deeper scenes for each of 17 of them in `apps/api/src/picks/deeper-scenes.json`. A scene's id comes from its title, so a card opens on its scene through the path M3.14 built, with no router call and no write. A typed question reaches a listed scene only when the router names its title exactly.

No worker adds to it. Only these titles can make a scene every student sees, and the run writes nothing else.

Every scene passed the code checks, the layout check, and both review passes before it joined. The review is a strict filter and not a truth gate, so each scene still says "Not yet checked by a person".

Every scene here is ManimGX, because the kit path has not landed. The router is not asked, because a card's saved scene wins before the router is called, and a pick of the kit would leave a card with no scene today.

## Where it lives

The takes, frames, and records are in a store, a folder named by `SCENE_STORE_DIR`, with the shape PR 87 built. They are not in git. The library's own store is `/Users/abel/startup/astra-scene-library`, outside any worktree, so cleaning up a worktree cannot lose it. To use it, point the lesson service and the API at that folder.

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

A named reviewer opens `/scene-library`, sees a sample of 18 openings and 6 deeper scenes with their frames and words, and can flag one. A flag is a file in `flags/`, so it survives a reload and a restart. A flagged scene is found by no lesson and written again by none, and its take route answers 404, so that topic goes on from words and the plain board. "I looked at it" clears the flag.

Name reviewers by student ID in `SCENE_REVIEWER_IDS`, comma separated, on the API. With none named, everyone gets a 403.

## Measured

These are from a run that had not finished when this was written. `scene-library-ledger.jsonl` holds the spend by call up to that commit, and `library-run/summary.json` in the store holds the rest.

| Check | Result |
| --- | --- |
| 8 scenes one at a time, on the path before the changes below | 3 saved on their first try, $0.975, 17.7 minutes, $0.122 a try. Planner $0.028, writer $0.047, Sonnet repair $0.026, each review pass $0.031. Sonnet repairs passed 1 of 6 |
| Changes after that | Opus repairs its own code, a later try gets the last code and its problems, more lanes than containers, openings first |
| Opening a saved card, with a tone voice and no page | 2.6 to 4.5 s from opening the lesson to the tutor sending the take, on the 4 of 5 openings read. No model call and no voice spend. The page's first frame is not in this number. M3.14 measured 96 ms for that part |
| A sudden stop, `kill -9` on the live run | Resumed 100 s later. 0 new charges for 12 saved scenes, 0 new plans for 4 scenes in flight, 2 containers |

## What this does not prove

- A first frame on a real page from this store. That needs the API, and this branch did not run it with a database.
- That the scenes are true. A person has read only a small sample, and the review is a filter.
