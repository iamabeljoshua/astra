# Keeping the next scene ready

M3.13. During a lesson, the next visual is already in the page when the tutor reaches it, so a scene lands on its word and nobody waits. Voice and the 2D board never wait on a scene. A scene that misses its moment is dropped silently and stays saved.

## What happens

The plan from M3.9 says what is next: the concept after this one, or the exercise after it. `apps/agent/src/scene-queue/scene-queue.ts` holds that as data, one entry per scene, each `making`, `ready`, `due`, `asked`, or `shown`. Due means it waits for the reply being written, and asked means it is with the desk, waiting for the pause.

1. A plan arrives. Haiku reads its steps against the titles the store holds, then each pick is read again against what that scene really says. A title that is not word for word on the list is thrown out.
2. If a saved scene fits the step the lesson is on, it is due now, for free.
3. For the next step, a saved scene is fetched into the page. If there is none, a write starts only when the rule below allows, and at most one runs ahead. A step with only an exercise gets a saved scene or nothing, because a picture could give away what the student is about to work out.
4. When the bytes are in the page, the next `lesson_plan` note names the scene as `picture_topic`. The tutor asks for it by that name as it goes on to that idea, and says nothing about it. Code stops any word about a picture that is not on screen, as it did before.
5. The lesson also reaches a step on its own, when code sees an exercise end or a student asks what is next. Either way the scene becomes due. The desk is asked for it only once the reply to the student's last words has been read and is not a safety reply. It lands at the next pause, through `speakScene`, the same seam as any scene: the picture is on screen before the setup line's first word.

The page holds the bytes and nothing more until the pause, because it has one player and the last scene may still be on screen. So only the first frame is left to do. The list of saved titles is read one file at a time, because a voice is playing while it runs.

## What it costs

A rule in `apps/agent/src/scene-queue/ahead-budget.ts`, in code, with no model asked.

| Number | Value | Why |
| --- | --- | --- |
| Guide for one written scene | $0.265 | The figure this work was given, from what a saved scene has cost the library's run |
| Writes ahead in a session | 2 | About $0.53 |
| A session's scene spending that can still start one | $0.285 | So the guide still fits under the $0.55 ceiling. The $0.80 a session's scenes may cost stays as the hard stop |
| Left of the student's day below which nothing is prepared | $0.60 | About 80 spoken turns, so a student near their limit keeps their tutor rather than a picture |
| Load per core above which nothing is prepared | 1.5 | `ASTRA_SCENES_AHEAD_LOAD_PER_CORE` |
| Last reply's first text above which nothing is prepared | 4 s | The voice is already under strain |

Ahead-of-time writes go through the same caps as any scene, so they count against the student's $3 a day. The API now answers a charge with what is left today. Until it has answered once, nothing is prepared, because an unknown day is not a roomy one.

| A session of 30 messages | Cost |
| --- | --- |
| Without this | About $0.22: $0.0072 a spoken turn, the figure M3.7 measured, and $0.0045 of plans. On these runs a turn cost $0.0026 off and $0.0029 on, because turns are shorter now |
| With this, library scenes only | About the same. A plan's library read cost about $0.0003, by 14 asks for $0.0077 with their plans |
| With this, at the most it can write | About $0.75 by the guide, with two writes at $0.265. Real writes cost about $0.16 to $0.18 on these runs, by the ledger around each run, and one that fails its checks still costs its tries |
| Voice, in every case with a landing | About 600 characters a scene, about $0.024 at $40 a million, not counted above. A session does not keep its voice, so each play pays again. It counts toward the project's 20,000 characters a day, so about 33 landings a day, an estimate. That is the next limit this meets, and a shelf for tutor scenes would lift it |


## What stops it

- **Distress.** Words the scene check reads as a student in danger, and a tutor reply with the words only a safety reply uses, stop the queue for the rest of the session. What was being written stops, and nothing more lands. A word that only might be about safety, such as "hits" in "the ball hits the rim", holds the queue until the student's next line, and drops whatever was waiting to land.
- **A switch.** A new topic stops the write ahead, and any write left over from the old lesson. What was waiting ended on the student's turn already. A scene already saved stays with that student and costs nothing if they come back. A typed scene never goes to anyone else, and a shared scene comes only from the server's own list, so the queue can only read those.
- **A student's turn.** Any student line ends what was waiting to land, because what they just said may change everything.
- **A skip.** "Skip that", "can we skip this", or "let's move on" moves the step on at once, ahead of any plan, and code puts up no picture in its place. The tutor can still ask for the next one by name on a later turn. "How do you skip count by fives" moves nothing.
- **Its moment passing.** When the lesson moves to another step, whatever was waiting to land goes, with no word said, so a late scene never interrupts a later concept. Past about 20 s from the first pause it goes too. A scene being written when its moment passes goes on and is saved, and no other write starts until it ends. One the lesson went past before it was due stops.
- **A page that cannot play one.** Nothing is prepared, and nothing is written.
- **No running lesson.** No plan means no queue. Nothing is prepared before a student arrives, and that is on purpose: no worker prepares scenes per student ahead of them. That is post-MVP.

## Measured

Real Sonnet, real Haiku, real page, tone voice, on 4 November 2026, on the Mac ten lanes share. Its load was 11 to 35 on 12 cores, so the pressure rule was raised for these runs with `ASTRA_SCENES_AHEAD_LOAD_PER_CORE=20`. On its default this Mac would prepare nothing, and that is the rule working. Each number is from a few runs, so read them as what happened and not as a rate. Cue means the tutor asking for the scene, or the lesson reaching its step.

| Check | With this | Without |
| --- | --- | --- |
| Scenes seen on a topic the library covers | 1 or 2 a session, on 10 of 10 sessions | 0, on 3 of 3 sessions. The tutor asked once each, in its own words, and the router sent each ask elsewhere. It only finds a saved scene when its words match a title |
| Next scene in the page before its cue | 20.5, 35.9, 38.4, and 55.4 s ahead. A saved take was in the page about 1 s after it was started | Never. Nothing is fetched ahead |
| Cue to scene seen, saved scene | 6.2 to 18.2 s on 14 landings, nearly all of it the rest of the tutor's reply | M3.14 measured 11.6 to 20.9 s on a saved scene, on 8 runs, not at this head |
| Reply's end to scene landed, saved scene | 48 to 993 ms on 10 of 13. The other 3 were 5.3 to 5.7 s, which by their length is the 5 s of room to answer after a question, an inference | |
| The cue against its word, the budget being 100 ms | 2 to 9 ms on 6 landings. The first frame is drawn before the word, because the tutor speaks only once the page says the take is loaded. The page's own reading of the scene was 137 to 208 ms after the cue, through a poll of 80 ms and the fade in, so it cannot show the first pixel closer than that | |
| A written scene | Fresh writes: 0 of 4 landed on their cue, for three reasons, each now fixed or known. One fresh write sat ready in the page 39 s before the student asked what was next, and lost its turn to another ask by the tutor, which is now passed over. The tutor did not ask for one that sat ready for 97 s, and a student asking what is next now reaches it. Two more missed, as below. Written earlier: a scene written for this student in an earlier session landed 12.9 and 14.8 s after the tutor asked, for no new spending | 0 of 1. The tutor asked for nothing in 130 s. M3.14 measured 0 of 3, dropped at about 32 to 36 s |
| Library match, read by eye | 12 picks over 47 steps on 14 asks, none wrong. Before the second read 5 of 17 were wrong, such as a jump shot for a free kick and a quadratic for a logarithm | |

So this head has no measurement of a fresh write landing on its cue, and that is the gap this table leaves. A written scene has a harder race than a saved one. It took 75 to 114 s here, and a student who says "next" every 15 to 25 s reaches the step first. That cost 2 misses in a row on one session, which stayed saved or failed its checks.

| Whether voice waited | First text p50, p95 | First beat p50, p95 | Turns | Load |
| --- | --- | --- | --- | --- |
| Off | 1498, 2117 ms | 1765, 2827 ms | 27 | 11 to 28 |
| On, first set | 1516, 2812 ms | 1690, 2775 ms | 35 | 24 to 35 |
| On, second set | 1859, 3410 ms | 2094, 3020 ms | 30 | 19 to 31 |

Nothing the queue does sits on a turn's path: it only reads a regular expression there. The second set's slower first text came at a higher load, so I read it as the machine, and that is an inference. These runs do not rule out a small cost.

| Attack on the real page | What happened |
| --- | --- |
| "i want to kill myself" with the next scene ready in the page | The tutor's own crisis words, the queue stopped, and no scene landed in the rest of the run |
| "skip that" over a scene | The narration stopped at once and did not resume, the scene went to the corner, and nothing else landed in the 75 s the run went on |
| A switch to another topic with a write running | The write stopped about 2 s later, and the new lesson read its own library. That run was before the last change to what a switch ends |
| A reload with a scene on screen and the next one ready | The scene came back and filled the board. The next take was fetched again, 35.9 s before its cue, and it landed |

Pictures: `next-scene-proof --out` saves `scene-N-landed.png`, `after-skip.png`, and `after-reload.png`.


## Run it

Beside what `docs/tests/scenes.md` lists, with your own store and LiveKit agent name:

```sh
ASTRA_TUTOR_SCENES=1 SCENE_STORE_DIR=<your store> pnpm agent
pnpm --filter @astra/agent next-scene-proof --web <your stack> --out <folder> --trace <ASTRA_VOICE_TRACE folder> --ask "Teach me about Saturn's rings"
pnpm --filter @astra/agent eval:library-match
```

`ASTRA_SCENES_AHEAD=0` turns the queue off, so a session asks for what it asks for and nothing more. The proof takes `--event skip@1`, `reload@1`, or `switch@1:<words>`, and saves each landing as a picture.

## What this does not prove

- That this holds on a machine with room, or on a real laptop with Intel or AMD graphics. Every run shared one loaded Mac with Metal.
- Spoken student words. The driver typed.
- The real voice. A real voice would change how long a reply takes, and the cue to scene wait with it.
- How often a real student reaches a written scene in time. The driver's pace is a guess, so the share ready in time is not a measure.
- A full lesson of many concepts. The longest run was 190 s.
- Near-limit and pressure rules on a real page. Tests hold them, and the proof raised one on purpose.

Known and not fixed here. A scene's first frame is empty on most takes, because a take starts from nothing at second 0, so the box stays blank through the setup line, about 2 to 3 s, while the tutor says "Watch". That is the seam M3.14 built, and it needs its own change. A tutor told `picture_topic` does not always ask for it, so a scene can sit ready until a student asks what is next or code sees an exercise end. A due scene lost to a task the tutor set in the same reply is dropped, by the window.

