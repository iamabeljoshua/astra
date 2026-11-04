# Keeping the next scene ready

M3.13. During a lesson, the next visual is already in the page when the tutor reaches it, so a scene lands on its word and nobody waits. Voice and the 2D board never wait on a scene. A scene that misses its moment is dropped silently and stays saved.

## What happens

The plan from M3.9 says what is next: the concept after this one, or the exercise after it. `apps/agent/src/scene-queue/scene-queue.ts` holds that as data, one entry per scene, each `making`, `ready`, `due`, or `shown`.

1. A plan arrives. Haiku reads its steps against the titles the store holds, then each pick is read again against what that scene really says. A title that is not word for word on the list is thrown out.
2. If a saved scene fits the step the lesson is on, it is due now, for free.
3. For the next step, a saved scene is fetched into the page. If there is none, a write starts only when the rule below allows, and at most one runs ahead. A step with only an exercise gets a saved scene or nothing, because a picture could give away what the student is about to work out.
4. When the bytes are in the page, the next `lesson_plan` note names the scene as `picture_topic`. The tutor asks for it by that name as it goes on to that idea, and says nothing about it. Code stops any word about a picture that is not on screen, as it did before.
5. The lesson also reaches a step on its own, when code sees an exercise end or a student says "skip that". Either way the scene becomes due and lands at the next pause, through `speakScene`, the same seam as any scene: the picture is on screen before the setup line's first word.

The page holds the bytes and nothing more until the pause, because it has one player and the last scene may still be on screen. So only the first frame is left to do.

## What it costs

A rule in `apps/agent/src/scene-queue/ahead-budget.ts`, in code, with no model asked.

| Number | Value | Why |
| --- | --- | --- |
| Guide for one written scene | $0.265 | What M3.15 measured for a saved scene |
| Writes ahead in a session | 2 | About $0.53 |
| A session's scene spending that can still start one | $0.285 | So the guide still fits under the $0.55 ceiling. The $0.80 a session's scenes may cost stays as the hard stop |
| Left of the student's day below which nothing is prepared | $0.60 | About 80 spoken turns, so a student near their limit keeps their tutor rather than a picture |
| Load per core above which nothing is prepared | 1.5 | `ASTRA_SCENES_AHEAD_LOAD_PER_CORE` |
| Last reply's first text above which nothing is prepared | 4 s | The voice is already under strain |

Ahead-of-time writes go through the same caps as any scene, so they count against the student's $3 a day. The API now answers a charge with what is left today. Until it has answered once, nothing is prepared, because an unknown day is not a roomy one.

@@COSTS@@

## What stops it

- **Distress.** Words the scene check reads as a student in danger, and a tutor reply that says the crisis lines, stop the queue for the rest of the session. What was being written stops, and nothing more lands. A word that only might be about safety, such as "hits" in "the ball hits the rim", holds the queue until the student's next line, and drops whatever was waiting to land.
- **A switch.** A new topic stops the write ahead and drops what was waiting. A scene already saved stays with that student and costs nothing if they come back. A typed scene never goes to anyone else, and a shared scene comes only from the server's own list, so the queue can only read those.
- **A skip.** "Skip that", "can we skip this", or "let's move on" moves the step on at once, ahead of any plan. "How do you skip count by fives" does not.
- **Its moment passing.** When the lesson moves to another step, whatever was waiting to land goes, with no word said, so a late scene never interrupts a later concept. Past about 20 s from the first pause it goes too. Either way a scene being written goes on and is saved.
- **A page that cannot play one.** Nothing is prepared, and nothing is written.
- **No running lesson.** No plan means no queue. Nothing is prepared before a student arrives, and that is on purpose: no worker prepares scenes per student ahead of them. That is post-MVP.

## Measured

@@MEASURED@@

## Run it

Beside what `docs/tests/scenes.md` lists, with your own store and LiveKit agent name:

```sh
ASTRA_TUTOR_SCENES=1 SCENE_STORE_DIR=<your store> pnpm agent
pnpm --filter @astra/agent next-scene-proof --web <your stack> --out <folder> --trace <ASTRA_VOICE_TRACE folder> --ask "Teach me about Saturn's rings"
pnpm --filter @astra/agent eval:library-match
```

`ASTRA_SCENES_AHEAD=0` turns the queue off, so a session asks for what it asks for and nothing more. The proof takes `--event skip@1`, `reload@1`, or `switch@1:<words>`, and saves each landing as a picture.

## What this does not prove

@@LIMITS@@
