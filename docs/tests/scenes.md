# Rich scenes from ManimGX

What this slice of M3.14 does, how to run it, and what it measured on Astra's own path, on 4 November 2026 on Abel's Mac. Each number comes from one run per topic unless it says otherwise.

## The path

A lesson asks the scene desk and never waits on it. Haiku 5.5 routes the request. For ManimGX, Opus 5.5 low in fast mode writes the code, with Sonnet 5.5 as the fallback past 45 s or on a failed check. Scenes and the library run on Anthropic models, which is Abel's choice, and the writer stays behind the `SceneWriter` interface. The code runs in a locked container: no network, a read-only disk, 2 CPUs, 512 MB, 64 processes, 90 s, 45 s a step, and 6 MB a take. The container makes both themes' takes at once, then one process runs `manimgx inspect` on both, makes pictures of each, and checks the layout. Text cut by the frame or too small fails the check. A line through text fails a card's first try. On a typed scene or a last try it stays as a note, because a rewrite costs a typed scene its moment and has often failed the same way. Sonnet 5.5 then reviews both themes' pictures with the code and every line the tutor could say in view, once at low effort and once at high, and a scene must pass both. Reviewers report and never rewrite. The take, the code, and the moments are saved only after both passes, whatever the lesson has done by then.

The browser plays a take by seconds on the board's clock. `runSimulation` plays a scene to a named moment over the words between two marks, so each moment lands on its word. A stop freezes it, and a rebuild from the log lands on the same second. A new question opens on words and the plain board, and the tutor brings a scene in at a pause, with a line pointing at it first. The first pause comes when the opening lines end, and the window is about 20 s after the opening ends. A scene can land at any line end in that time, and after the close too: the lesson waits out the rest of the window on the page, shows the scene, and asks the question again. Past that it is dropped from that lesson and stays saved, unless it is a typed scene whose student has gone, which stops. A question or card whose scene is saved already opens on it, right after "Let's take a look", with each moment on its word. The words the opening would have said are not spoken then, because they set up a picture the student is already watching.

A person talks in short lines, so every spoken line is usually under 25 words and never more than 45. A long line splits at its sentences, then at its commas, and a take's narration runs over several lines with its moments still on their words. The planner is asked for an opening of 6 lines and 4 more lines, of 6 to 14 words each. That keeps the opening about as long as it was, about 20 s, and gives a scene more line ends to land on.

## Why it is this shape

- A writer reads a `SceneBrief`, which holds a topic and shared truth and has no field that could hold a student. The API takes a card's title from `library.json` by `topicId`, on creating the session and again on opening the lesson, and ignores any title a browser sent. A typed question goes through the router, which names the topic, and a topic that visibly points at one person gets no scene.
- A shared scene comes only from the server's own topic list. A typed question's scene stays with the student who asked, under a key that holds their ID, and the take route answers 404 to anyone else. A router-cleaned topic is still a student's words shaped by a model, and injection reached the board in the review. Only a person or a later moderated step can promote one.
- A model can write anything, so a code check runs on every plan before a word is spoken and on every scene's code before it runs: no address or link, no insult or accusation, no other alphabet, no first and last name, and a plan must touch its topic. The review asks the same questions with judgment. The check is a first screen and names only what a pattern can see.
- A wrong scene is the worst failure. A router reply that names no known engine gets no scene, and only a clear pass may reach a student.
- A scene the review failed leaves only its words, in `refusals/`, so nobody pays to write it again soon and a person can read why. No take or picture from that run is kept, and its plan is never said again. The review can refuse a true scene, and on a card that would leave it with no scene for anyone, so a refusal can be written again after an hour, with errors counting toward the same 3 tries a day.
- A plan that fails a check or will not parse is asked for once more, naming what went wrong and keeping a first line already said, at about $0.007. A narration that runs long is cut at a whole sentence and not thrown away. A card always teaches on the plain board: from the plan's clean lines if it stayed on the topic, or from the library's own question if not, and it says so when no model will answer. A typed question with no plan hears that there is no lesson for it, and the page offers a way back to Home and no reply box.
- An error is never a verdict. A review or writer that errors saves nothing and blocks nothing. The topic can try again after 5 minutes, at most 3 times a day, so one overloaded reply costs a retry and a broken topic cannot spend without end.
- Two students on one new card share one plan and one scene, because the words and the pictures come from one plan. A folder appears whole and the first passing save stays, so a take's address never changes what it serves.
- The container is the wall, and the gate is only a first line. Model-written code runs under its own uid, so it cannot open the descriptors of the process that writes records. That process starts as root with only the rights to step down. It ends whatever a scene left running after each step and at each step's limit, by taking the scene's uid as its effective one for a single `kill(-1)`, so no child exists for a daemon to kill first, and nothing under that uid can signal or read it. At most 4 containers run at once, and the rest wait in line. A pinned seccomp profile refuses user namespaces, sockets, `ptrace`, and `mount` even on a daemon set to unconfined. There is no logging driver, so nothing a job prints reaches a disk. The agent reads every record as untrusted: known themes only, one take a theme, and caps on records and bytes. Paths come only from ids the server made. The base image is pinned by digest and each wheel by hash.
- Past 45 s the fallback writer gets the job, rather than racing two writers at double the cost.
- The 6 MB limit: 2 of the test's 65 takes went past it, and the largest was 21 MB raw and 17.7 MB compressed. A take that large would stall a laptop on a slow line.
- A take is made on nominal times, because the same take plays under any voice. `overWords` then lands each moment on its word.
- A take is one immutable file per theme, compressed once, off the event loop, so the API can send it as is. Moving to object storage later changes only `scene-store.ts` and the API's reader.
- In the browser a take is untrusted data, so anything it throws costs that take and leaves the plain board underneath.
- The planner streams, so the tutor speaks the first line as soon as it is written and is not silent while the rest comes, and the writer starts as soon as the narration and plan have arrived. A plan the checks then refuse stops that write.
- `manimgx inspect` took about 6 s a theme whatever the number of pictures, nearly all of it the first picture, in the renderer's start-up and shader optimisation. So both themes share one process and shaders go unoptimised. A pixel comparison of both themes' sheets found no difference on one 2D scene.
- The first screen reads board math and listed names as well as spoken words. A pair of listed first and last names counts in any case, and capitalised pairs count as before. A name not on the lists, written with no capitals, reaches only the review.
- Lesson audio is kept to save credits. A card's lines are in `.scene-store/voice`, and any student's lesson on that card can play them. A typed lesson's lines are in `.scene-store/student-voice/<student id>/<scene id>`, are played only to that student, and are removed with the rest of that student's data. Before a typed lesson has a topic it keeps nothing, and it only says the app's fixed lines then.
- The lesson service is local only, with a dev key, because it stands in until M3.6's live room. Lessons stay off unless a build sets `VITE_SCENE_LESSONS=1`. A request the router sends to the kit stays on the plain board until the kit path lands.

## Run it

```sh
pnpm --filter @astra/scene-worker image
SCENE_STORE_DIR=$PWD/.scene-store pnpm --filter @astra/agent lesson
SCENE_STORE_DIR=$PWD/.scene-store SCENE_LESSON_SERVICE_URL=http://127.0.0.1:7975 NODE_ENV=development API_PORT=3330 pnpm --filter @astra/api exec nest start
VITE_SCENE_LESSONS=1 WEB_PORT=6330 API_PORT=3330 pnpm --filter @astra/web exec vite
```

The lesson service listens on `SCENE_LESSON_PORT`, 7975 by default, and starts its own LiveKit on `LESSON_LIVEKIT_PORT`, 7970 by default, tied to it so a crash leaves no LiveKit behind. `LESSON_FAKES=1` runs a whole lesson with no model and the real container. `LESSON_VOICE=tone` spends no voice credits.

Every lesson charges a ledger, `.scene-store/lesson-spend.jsonl` unless `LESSON_SPEND_FILE` names another. It holds student IDs, models, costs, and voice characters, and none of a student's words. A stream stopped early has no final usage, so the ledger counts its input and estimates its output at 4 characters a token. A student can open 6 lessons in 10 minutes and have 2 with a page on them at once, so a lesson they have gone back from does not hold a place, and no model is called and no word is spoken until a student has joined the room. All four limits count one UTC day, as M3.7's ledger does. A 429 says which limit a student hit and how long it really lasts, and the page says that. Limits, each read from the environment:

| Variable | Default | Limits |
| --- | --- | --- |
| `LESSON_SPEND_LIMIT` | $20 | All model spending in a UTC day |
| `LESSON_STUDENT_SPEND_LIMIT` | $2 | One student's model spending in a UTC day |
| `LESSON_VOICE_TOTAL_LIMIT` | 20,000 characters | All live speech in a UTC day |
| `LESSON_VOICE_CHARACTER_LIMIT` | 1,500 characters | One student's live speech in a UTC day |

Past a voice limit that student's voice falls back to a tone and the page says why. A line already spoken in full, on the shelf that lesson may read, plays for free. A saved line proves it is whole by its length against its word times, so a cut line is never kept.

`apps/agent/src/scenes/proof/` holds the proofs. `lesson-proof.ts` drives a real session and checks cues, seeks, and replay. `prepare-scene.ts` writes one scene. `router-blind.ts`, `truth-run.ts`, and `review-rerun.ts` made the tables below. `remake-takes.ts --from <store>` makes takes and pictures again from stored code under the id of the pinned engine version, which is what a new engine version or a new look costs. Given `--ledger`, it also reviews them, so a stored scene passes today's review before it is shared. It keeps only library titles.

## Removing one student's data

The app has no delete button yet, so a person removes these by hand, with the student's ID:

- Each folder in `.scene-store/scenes` whose `scene.json` has that `ownerId`.
- Each file in `.scene-store/refusals` whose `key.ownerId` is that ID.
- The folder `.scene-store/student-voice/<student id>`.
- The lines in `lesson-spend.jsonl` with that `studentId`.

A store made before typed lines moved can hold them in `.scene-store/voice`, with no ID, and those cannot be found for a student, so clear that folder once.

## Requests a tutor should not teach

A request about a student hurting themselves or being in danger gets the tutor brain's own wording on M3.7's branch, which points to an adult they trust and local emergency help and names no hotline. The page then offers a way back to Home. A code check catches the plainest wording before any model hears it, and the router catches the rest. A router that answers in prose twice counts as this too, because that has been a model answering such a question. A plan or a review refuses the specifics of how to make or do something dangerous, even framed as safety. A code check on plans also refuses bleach named with acid or ammonia, lethal doses, and a few more. It is short and names only what a pattern can see. No lawyer or safeguarding reader has seen any of this, and M4.5 owns the real answer.

## Live results

| Check | Result |
| --- | --- |
| New question to a scene the student sees, before this slice's fix round | 31.1 s and 34.1 s from the ask, in two runs that showed it, measured on the page. On the server, the scene was ready at 26.6 s and the lesson took it at the next pause, 27.3 s in the first run. Words started at 1.8 s, and the plain board never waited |
| Scene made from a topic, plan included | 21 to 57 s, median 33 s, on 5 runs with one review pass. Plan about 7 s, writer 4 to 21 s, container 6 to 24 s, low review 3 to 8 s |
| Cost of one scene | $0.07 to $0.18 on those runs, plus about $0.03 for the second review pass |
| With pictures of both themes and the uid split, before this round | Container 12 to 35 s on 7 runs, against 6 to 24 s before, and both review passes $0.05 to $0.06 a scene. Two fresh scenes whole, $0.12 in 27 s and $0.16 in 51 s |
| One process for both themes' pictures | Both themes with pictures took 4.1 to 6.4 s alone on 9 runs, against 13.4 to 20.9 s before. Inside the 11 lessons it took 5.0 to 41.2 s |
| A fresh scene at the head before this round | The service logged `shown` at 43.4 s in one run, and that is not the page, which shows a scene after its setup line. No page proof caught a fresh scene at that head. A later check on the page counted 1 of 6 fresh typed questions landing, for $1.02 |
| Fresh typed questions, from the ask to what the page first shows | 3 of 6 landed, and 4 of 11 with the later runs. The tables below have each run. It was 1 of 6 before this round |
| Frame rate during a lesson | 60 fps, frame gap p95 17 ms, on Abel's Mac only |
| Take in the browser | 96 ms from `loadScene` to a first frame ready, engine already fetched from sign-in |
| Take size | 0.41 to 1.63 MB raw, 0.06 to 0.7 MB as sent |
| Cue against its word | p50 11 to 14 ms, worst cue 27 to 51 ms, over 4 lessons of 8 to 10 cues each. With so few cues, a p95 is just the worst cue |
| Seek and replay | 12 of 12 shuffled seeks gave the same second and the same pixels, live against a rebuild from the log, in 2 lessons |
| A stop | The scene held 8.1 s for 1.5 s after a typed reply, then carried on from the cut word |
| No WebGPU | No engine fetched on Home, no scene asked for, words and the plain board carried on |
| Damaged take | Refused, plain board carried on, no page error |
| A saved scene opening a lesson | On the page at 2.7 to 6.5 s from the ask on fakes and 5.08 s from opening the page on real models, against 24 to 25 s before this round. With its lines as separate turns, 12 of 12 seeks matched a rebuild, in second and pixels, on a saved scene and on a fresh one |
| Scene later than its window | The lesson ended on the plain board, the scene was saved 34 s later, and the next session on that card had it in under 1 s with no write |
| Both writers fail the checks | The lesson carried on and ended on the plain board. Seen once on a real question |

## Six fresh typed questions

Real models and a real page, with the tone voice, on 4 November 2026, on the Mac the rest of the program shares. "Seen" is the first moment the page shows the scene, from pressing Enter. A dash means it never showed. "Ready" is on the service's clock, about 1 s behind the page's, and the window closed at about 42 to 44 s on it. Every line was 15 words or fewer, apart from the scene's narration, which played as one long turn in these six and now plays line by line.

| Question | First words | Container | Ready | Seen | Cost | What happened |
| --- | --- | --- | --- | --- | --- | --- |
| A common denominator for one third and one fourth | 4.4 s | 17.4 s | 39.5 s | 44.0 s | $0.129 | Landed, after the close |
| What the slope of a line tells you | 2.3 s | 31.7 s | 57.8 s | none | $0.155 | Container too slow |
| How binary search finds a number | 2.9 s | 41.2 s | 68.0 s | none | $0.142 | Container too slow |
| Why a triangle's area is half base times height | 4.2 s | 7.9 s | 28.5 s | 33.7 s | $0.118 | Landed at a line end |
| What standard deviation measures | 4.2 s | 5.0 s | 38.4 s | 44.2 s | $0.196 | Landed, after the close |
| Graphing y equals two x plus one | 4.5 s | 2 tries failed | none | none | $0.090 | Both writers drew a line through a label, which now stays as a note |

So 3 of 6 landed, for $0.83, and every scene that landed had a container of 17.4 s or less.

The two slow containers are what this machine does and not what those scenes cost. Replaying the same saved code alone took 4.8 to 5.8 s, then 14 to 19 s, then 5.6 s, within a few minutes. Its swap was 16 of 17.4 GB and its load about 13 on 12 cores, with other lanes running, so memory pressure is my inference for the limiter. At the replay's times both would have been ready at about 32 s and landed. That is an inference, not a measurement.

I ran five more at the final code, four on purpose and one by accident, when a proof's question got a new topic from the router. These had each line as its own turn, and the longest caption was 21 words.

| Question | First words | Container | Ready | Seen | Cost | What happened |
| --- | --- | --- | --- | --- | --- | --- |
| What a prime number is | 4.6 s | 25.5 s | 50.4 s | none | $0.193 | Container too slow |
| Multiplying two matrices | 3.0 s | First try failed | none | none | $0.126 | A label under the size limit, and the second try had not finished when the student left |
| The mean, median, and mode | 5.2 s | 33.3 s | 64.4 s | none | $0.204 | Container too slow |
| Solving two x plus three equals eleven | 2.2 s | 38.4 s | 54.9 s | none | $0.122 | Container too slow |
| The mean, median, and mode, from the proof | Not read | 12.0 s | 34.2 s | 38.7 s from opening the page | $0.146 | Landed |

Over all 11, 4 landed. All 4 had a container of 17.4 s or less, all 5 with a container of 25.5 s or more missed, and the other 2 failed a layout check.

## What sharing costs

A card's scene is written once and is free for every later student. A typed question's scene is written once per student, because it is never shown to another student, so a question two students ask costs two writes. Each write is about $0.12 to $0.21. A question that a router names exactly as a card's title still uses the card's scene for free, and the library of 133 scenes absorbs the common topics for about $10 once. As an estimate with no real traffic behind it: 1,000 students each asking 3 typed questions that draw a scene is 3,000 writes, about $360 to $630, and sharing by topic would have paid only for the distinct topics among them.

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
- That the words of a fresh lesson are checked before they are heard. The code check runs first, and the review looks at the plan only when it reviews the scene, which is after the opening has been spoken. A plan a review refuses is never said again. A lesson with no scene, such as a plain fact or one the router sends to the kit, gets the code check alone.
- That a name in a topic is safe. A lesson can name what its own topic names, so a name that gets past the router, as "the Sam Smells method" did, can be spoken in that student's own lesson. It reaches nobody else.
- That the window holds on a slower machine, or that it would land more on a quiet one. These runs share one Mac with other work, and the same code took 5 s or 41 s depending on what else was running. Nothing here measures a machine with room to spare.
