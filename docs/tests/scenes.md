# Rich scenes from ManimGX

What this slice of M3.14 does, how to run it, and what it measured on Astra's own path, on 4 November 2026 on Abel's Mac. Each number comes from one run per topic unless it says otherwise.

## The path

A lesson asks the scene desk and never waits on it. Haiku 5.5 routes the request. For ManimGX, Opus 5.5 low in fast mode writes the code, with Sonnet 5.5 as the fallback past 45 s or on a failed check. The code runs in a locked container: no network, a read-only disk, 2 CPUs, 512 MB, 64 processes, 90 s, and 6 MB a take. The container makes a take per theme, then `manimgx inspect` makes pictures and checks the layout. Text crossed by a line, cut by the frame, or too small fails the check. Sonnet 5.5 then reviews the pictures with the code in view, once at low effort and once at high, and a scene must pass both. Reviewers report and never rewrite. The take, the code, and the moments are saved, whatever the lesson has done by then.

The browser plays a take by seconds on the board's clock. `runSimulation` plays a scene to a named moment over the words between two marks, so each moment lands on its word. A stop freezes it, and a rebuild from the log lands on the same second. The tutor sets a scene up in words at a pause. A scene not ready about 20 s after the opening ends is dropped from that lesson and stays saved.

## Why it is this shape

- A writer reads a `SceneBrief`, which holds a topic and shared truth and has no field that could hold a student. A card's title is already a clean topic. A typed question goes through the router, which names the topic with nothing about the person, and a topic that points at one person gets no scene.
- The API reads a lesson's title from the session and not from the browser, so a page cannot put other words into a lesson.
- A wrong scene is the worst failure. A router reply that names no known engine gets no scene, and a review reply that cannot be read fails, because only a clear pass may reach a student.
- A scene the review failed is saved too, marked, so nobody pays to write it again and a person can read why. The API sends only checked scenes, so a rejected take stays on the disk.
- The container is the wall, and the gate is only a first line. The gate refuses values a scene does not declare, so nothing about a student can slip in as a new name. The worker runs untrusted code, so the agent checks every record's length before keeping it.
- Past 45 s the fallback writer gets the job, rather than racing two writers at double the cost.
- The 6 MB limit: 2 of the test's 65 takes went past it, and the largest was 21 MB raw and 17.7 MB compressed. A take that large would stall a laptop on a slow line.
- A take is made on nominal times, because the same take plays under any voice. `overWords` then lands each moment on its word.
- A take is one immutable file per theme, compressed once so the API can send it as is. Moving to object storage later changes only `scene-store.ts` and the API's reader.
- In the browser a take is untrusted data, so anything it throws costs that take and leaves the plain board underneath.
- The planner streams, so the tutor speaks the first line as soon as it is written and is not silent while the rest comes.
- The lesson service is local only, with a dev key, because it stands in until M3.6's live room. Lessons stay off unless a build sets `VITE_SCENE_LESSONS=1`. A request the router sends to the kit stays on the plain board until the kit path lands.

## Run it

```sh
pnpm --filter @astra/scene-worker image
SCENE_STORE_DIR=$PWD/.scene-store pnpm --filter @astra/agent lesson
SCENE_STORE_DIR=$PWD/.scene-store SCENE_LESSON_SERVICE_URL=http://127.0.0.1:7975 NODE_ENV=development API_PORT=3330 pnpm --filter @astra/api exec nest start
VITE_SCENE_LESSONS=1 WEB_PORT=6330 API_PORT=3330 pnpm --filter @astra/web exec vite
```

The lesson service listens on `SCENE_LESSON_PORT`, 7975 by default, and starts its own LiveKit on `LESSON_LIVEKIT_PORT`, 7970 by default. `LESSON_FAKES=1` runs a whole lesson with no model and the real container. `LESSON_VOICE=tone` spends no voice credits. `LESSON_VOICE_CHARACTER_LIMIT` caps live speech, past which the voice falls back to a tone so a proof cannot overspend, and words already spoken play from `.scene-store/voice`.

`apps/agent/src/scenes/proof/` holds the proofs. `lesson-proof.ts` drives a real session and checks cues, seeks, and replay. `prepare-scene.ts` writes one scene. `router-blind.ts`, `truth-run.ts`, and `review-rerun.ts` made the tables below. `remake-takes.ts` makes takes again from stored code, with no model call, under the id of the pinned engine version, which is what a new engine version or a new look costs.

## Live results

| Check | Result |
| --- | --- |
| New question to a shown scene | 26.6 s and 29.5 s from the ask, in two runs that showed it. Words started at 1.8 s, and the plain board never waited |
| Scene made from a topic, plan included | 21 to 57 s, median 33 s, on 5 runs with one review pass. Plan about 7 s, writer 4 to 21 s, container 6 to 24 s, low review 3 to 8 s |
| Cost of one scene | $0.07 to $0.18 on those runs, plus about $0.03 for the second review pass |
| Frame rate during a lesson | 60 fps, frame gap p95 17 ms, on Abel's Mac only |
| Take in the browser | 96 ms from `loadScene` to a first frame ready, engine already fetched from sign-in |
| Take size | 0.41 to 1.63 MB raw, 0.06 to 0.7 MB as sent |
| Cue against its word | p50 11 to 14 ms, p95 27 to 51 ms, worst 51 ms, over 4 lessons |
| Seek and replay | 12 of 12 shuffled seeks gave the same second and the same pixels, live against a rebuild from the log, in 2 lessons |
| A stop | The scene held 8.1 s for 1.5 s after a typed reply, then carried on from the cut word |
| No WebGPU | No engine fetched on Home, no scene asked for, words and the plain board carried on |
| Damaged take | Refused, plain board carried on, no page error |
| Scene later than its window | The lesson ended on the plain board, the scene was saved 34 s later, and the next session on that card had it in under 1 s with no write |
| Both writers fail the checks | The lesson carried on and ended on the plain board. Seen once on a real question |

## Router

Haiku 5.5 alone on the test's blind set of 44 requests, with labels fixed before any model saw them: 40 right, median 885 ms, $0.0026 for all 44. No request that wanted no drawing got a scene. One reply carried no JSON and counts as no scene. In the test, GPT-6.1 Luna got 39 of 44.

## Truth

The test's 9 topics and its exact narrations, through this path. One blind scorer read the scenes against the truth lists fixed before the test, with no sight of any verdict.

| Measure | This path, Opus 5.5 fast | Test, Opus 5.5 fast | Test, GPT-6.1 Sol |
| --- | --- | --- | --- |
| Items true | 48 of 64, 75% | 59 of 69, 86% | 89% |
| Scenes with a critical item false | 7 of 8 | 7 of 9 | 4 of 9 |
| Topics with no scene | 1, Fourier, failed the layout check twice | 0 | 0 |

The scorer here is not the test's, so 75% against 86% may be the reader and not the writer. This path saw frames from `manimgx inspect` and no probes. Six of these nine topics go to the kit under the delegation table, so they would not take this path in a lesson.

| Scene | Items true | Critical items false | Reviewer, low | Reviewer, high | Both must pass |
| --- | --- | --- | --- | --- | --- |
| Moon | 8 of 11 | 2 | stop | stop | stop |
| Heart | 5 of 8 | 2 | stop | pass | stop |
| Black hole | 6 of 8 | 2 | pass | pass | **shows** |
| Seasons | 7 of 8 | 1 | stop | pass | stop |
| Electric field | 3 of 7 | 4 | stop, and pass on a rerun | stop | stop |
| Mitosis | 8 of 8 | 0 | stop | pass | stop, wrongly |
| Pythagoras | 6 of 7 | 1 | stop | pass | stop |
| DNA | 5 of 7 | 2 | stop | pass | stop |

Planted errors, 8 scenes from the test with one false fact each: low 8 of 8, high 8 of 8, including the motion error that Sol missed. Clean scenes from the test: low stopped 3 of 4, high stopped 1 of 4. So one pass disagreed with itself at the other effort on most real scenes, and medium did no better on the 8 scenes tried. Both together stopped every planted error and 7 of the 8 real scenes, one wrongly, and let one flawed scene through. Reviews at high took 6 to 35 s, and both passes cost about $0.05.

The 6 scenes made for math and graph topics from the planner's own words passed both passes. I checked their frames and code by eye and found nothing false. They had no truth list and no blind score, so that is weaker than the table above.

## What this does not prove

- Real laptops with Intel or AMD graphics. Everything ran on one Mac with Metal.
- Live words from a model on the scene's moments. The stand-in plan writes them today, and M3.7 takes that over.
- Safari and Firefox on this path. The test ran them, and this path did not.
- The kit path, the curated library, declared values through a live lesson, and the fit router's library match. A declared value is refused or accepted by the gate's tests, and no live lesson used one.
