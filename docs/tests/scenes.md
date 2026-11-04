# Rich scenes from ManimGX

What this slice of M3.14 does, how to run it, and what it measured on Astra's own path, on 4 November 2026 on Abel's Mac. Each number comes from one run per topic unless it says otherwise.

## The path

A lesson asks the scene desk and never waits on it. Haiku 5.5 routes the request. For ManimGX, Opus 5.5 low in fast mode writes the code, with Sonnet 5.5 as the fallback past 45 s or on a failed check. The code runs in a locked container: no network, a read-only disk, 2 CPUs, 512 MB, 64 processes, 90 s, and 6 MB a take. The container makes a take per theme, then `manimgx inspect` makes pictures of each take and checks the layout. Text crossed by a line, cut by the frame, or too small fails the check. Sonnet 5.5 then reviews both themes' pictures with the code and every line the tutor could say in view, once at low effort and once at high, and a scene must pass both. Reviewers report and never rewrite. The take, the code, and the moments are saved only after both passes, whatever the lesson has done by then.

The browser plays a take by seconds on the board's clock. `runSimulation` plays a scene to a named moment over the words between two marks, so each moment lands on its word. A stop freezes it, and a rebuild from the log lands on the same second. The tutor sets a scene up in words at a pause. A scene not ready about 20 s after the opening ends is dropped from that lesson and stays saved.

## Why it is this shape

- A writer reads a `SceneBrief`, which holds a topic and shared truth and has no field that could hold a student. The API takes a card's title from `library.json` by `topicId`, on creating the session and again on opening the lesson, and ignores any title a browser sent. A typed question goes through the router, which names the topic, and a topic that visibly points at one person gets no scene.
- A shared scene comes only from the server's own topic list. A typed question's scene stays with the student who asked, under a key that holds their ID, and the take route answers 404 to anyone else. A router-cleaned topic is still a student's words shaped by a model, and injection reached the board in the review. Only a person or a later moderated step can promote one.
- A model can write anything, so a code check runs on every plan before a word is spoken and on every scene's code before it runs: no address or link, no insult or accusation, no other alphabet, no first and last name, and a plan must touch its topic. The review asks the same questions with judgment. The check is a first screen and names only what a pattern can see.
- A wrong scene is the worst failure. A router reply that names no known engine gets no scene, and only a clear pass may reach a student.
- A scene the review failed leaves only its words, in `refusals/`, so nobody pays to write it again and a person can read why. No take or picture from that run is kept, and its plan is never said again.
- An error is never a verdict. A review or writer that errors saves nothing and blocks nothing. The topic can try again after 5 minutes, at most 3 times a day, so one overloaded reply costs a retry and a broken topic cannot spend without end.
- Two students on one new card share one plan and one scene, because the words and the pictures come from one plan. A folder appears whole and the first passing save stays, so a take's address never changes what it serves.
- The container is the wall, and the gate is only a first line. Model-written code runs under its own uid, so it cannot open the descriptors of the process that writes records. That process starts as root with only the rights to step down, and it ends whatever a scene left running after each step. A pinned seccomp profile refuses user namespaces, sockets, `ptrace`, and `mount` even on a daemon set to unconfined. There is no logging driver, so nothing a job prints reaches a disk. The agent reads every record as untrusted: known themes only, one take a theme, and caps on records and bytes. Paths come only from ids the server made. The base image is pinned by digest and each wheel by hash.
- Past 45 s the fallback writer gets the job, rather than racing two writers at double the cost.
- The 6 MB limit: 2 of the test's 65 takes went past it, and the largest was 21 MB raw and 17.7 MB compressed. A take that large would stall a laptop on a slow line.
- A take is made on nominal times, because the same take plays under any voice. `overWords` then lands each moment on its word.
- A take is one immutable file per theme, compressed once, off the event loop, so the API can send it as is. Moving to object storage later changes only `scene-store.ts` and the API's reader.
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

The lesson service listens on `SCENE_LESSON_PORT`, 7975 by default, and starts its own LiveKit on `LESSON_LIVEKIT_PORT`, 7970 by default, tied to it so a crash leaves no LiveKit behind. `LESSON_FAKES=1` runs a whole lesson with no model and the real container. `LESSON_VOICE=tone` spends no voice credits.

Every lesson charges a ledger, `.scene-store/lesson-spend.jsonl` unless `LESSON_SPEND_FILE` names another. A student can open 6 lessons in 10 minutes and run 2 at once, and no model is called and no word is spoken until a student has joined the room. Limits, each read from the environment:

| Variable | Default | Limits |
| --- | --- | --- |
| `LESSON_SPEND_LIMIT` | $20 | All model spending in the ledger |
| `LESSON_STUDENT_SPEND_LIMIT` | $2 | One student's model spending in 24 hours |
| `LESSON_VOICE_TOTAL_LIMIT` | 20,000 characters | All live speech in the ledger |
| `LESSON_VOICE_CHARACTER_LIMIT` | 1,500 characters | One student's live speech in 24 hours |

Past a voice limit that student's voice falls back to a tone, and no other student's voice changes. A line already spoken in full plays from `.scene-store/voice` for free. A saved line proves it is whole by its length against its word times, so a cut line is never kept.

`apps/agent/src/scenes/proof/` holds the proofs. `lesson-proof.ts` drives a real session and checks cues, seeks, and replay. `prepare-scene.ts` writes one scene. `router-blind.ts`, `truth-run.ts`, and `review-rerun.ts` made the tables below. `remake-takes.ts --from <store>` makes takes and pictures again from stored code under the id of the pinned engine version, which is what a new engine version or a new look costs. Given `--ledger`, it also reviews them, so a stored scene passes today's review before it is shared. It keeps only library titles.

## Live results

| Check | Result |
| --- | --- |
| New question to a scene the student sees | 31.1 s and 34.1 s from the ask, in two runs that showed it, measured on the page. On the server, the scene was ready at 26.6 s and the lesson took it at the next pause, 27.3 s in the first run. Words started at 1.8 s, and the plain board never waited |
| Scene made from a topic, plan included | 21 to 57 s, median 33 s, on 5 runs with one review pass. Plan about 7 s, writer 4 to 21 s, container 6 to 24 s, low review 3 to 8 s |
| Cost of one scene | $0.07 to $0.18 on those runs, plus about $0.03 for the second review pass |
| Frame rate during a lesson | 60 fps, frame gap p95 17 ms, on Abel's Mac only |
| Take in the browser | 96 ms from `loadScene` to a first frame ready, engine already fetched from sign-in |
| Take size | 0.41 to 1.63 MB raw, 0.06 to 0.7 MB as sent |
| Cue against its word | p50 11 to 14 ms, worst cue 27 to 51 ms, over 4 lessons of 8 to 10 cues each. With so few cues, a p95 is just the worst cue |
| Seek and replay | 12 of 12 shuffled seeks gave the same second and the same pixels, live against a rebuild from the log, in 2 lessons |
| A stop | The scene held 8.1 s for 1.5 s after a typed reply, then carried on from the cut word |
| No WebGPU | No engine fetched on Home, no scene asked for, words and the plain board carried on |
| Damaged take | Refused, plain board carried on, no page error |
| Scene later than its window | The lesson ended on the plain board, the scene was saved 34 s later, and the next session on that card had it in under 1 s with no write |
| Both writers fail the checks | The lesson carried on and ended on the plain board. Seen once on a real question |

## Router

Haiku 5.5 alone on the test's blind set of 44 requests, with labels fixed before any model saw them: 40 right, median 885 ms, $0.0026 for all 44. No request that wanted no drawing got a scene. One reply carried no JSON and counts as no scene. In the test, GPT-6.1 Luna got 39 of 44.

## Truth

The review is a strict filter and not a truth gate. On real scenes, neither pass clearly separates true from false in samples this small, as the table below shows, so it can stop a true scene and let a false one through. The "Not yet checked by a person" label stays on every scene and every line for that reason, on the scene and on the plain board.

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
- That a scene's take matches its pictures. The pictures come from `manimgx inspect` running the code, not from the take's bytes, so code that draws something else outside `inspect` passes the pictures. The reviewer reads the code too, which is the only check on that.
- That the words of a fresh lesson are checked before they are heard. The code check runs first, and the review looks at the plan only when it reviews the scene, which is after the opening has been spoken. A plan a review refuses is never said again.
