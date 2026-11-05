# Keeping the next scene ready

M3.13. During a lesson, the next visual is already in the page when the tutor reaches it, so a scene lands on its word and nobody waits. Voice and the 2D board never wait on a scene. A scene that misses its moment is dropped silently and stays saved.

## What happens

The plan from M3.9 says what is next: the concept after this one, or the exercise after it. `apps/agent/src/scene-queue/scene-queue.ts` holds that as data, one entry per scene, each `making`, `ready`, `due`, `asked`, or `shown`. Due means it waits for the reply being written, and asked means it is with the desk, waiting for the pause.

1. The first plan on a topic arrives. Haiku reads its steps against the titles the store holds, then each pick is read again against what that scene really says. A title that is not word for word on the list is thrown out.
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
- **A stop at the router.** Any stop here also stops a router still answering, and its answer starts no plan and no write.
- **A switch.** A new topic stops the write ahead, and any write left over from the old lesson. What was waiting ended on the student's turn already. A scene already saved stays with that student and costs nothing if they come back. A typed scene never goes to anyone else, and a shared scene comes only from the server's own list, so the queue can only read those.
- **A student's turn.** Any student line ends what was waiting to land, because what they just said may change everything.
- **A skip.** "Skip that", "can we skip this", or "let's move on" moves the step on at once, ahead of any plan, and code puts up no picture in its place. The tutor can still ask for the next one by name on a later turn. "How do you skip count by fives" moves nothing.
- **Its moment passing.** When the lesson moves to another step, whatever was waiting to land goes, with no word said, so a late scene never interrupts a later concept. Past about 20 s from the first pause it goes too, and 35 s from the ask at the latest, which is the plug-in's own bound. A scene being written when its moment passes goes on and is saved, and no other write starts until it ends. One the lesson went past before it was due stops.
- **A closed tutor.** A reply that closes the tutor stops the queue for good, and any write ahead with it. A scene's next model call also refuses once the tutor is closed.
- **End.** An End press ends all of it before the recap. Nothing lands from then on, the session is never at a pause again, and a plan that arrives after it reads no library.
- **A flag.** The list of saved titles leaves out a flagged scene. It is read once for a topic, so a title can be flagged after that read, and then it is not prepared. A scene flagged while it waits ready does not land and takes no first frame.
- **The limits.** A shared scene counts when it would land, whoever asked for it, so one readied before a student's last play does not play past it. A student's own scene still plays. A new write counts toward the 6 asks when it is asked for, and past 6 no new write is readied, because it could never land. A saved scene does not count, and the student's shared plays a day cap it.
- **A page that cannot play one.** No library is read, nothing is prepared, and nothing is written.
- **No running lesson.** No plan means no queue. Nothing is prepared before a student arrives, and that is on purpose: no worker prepares scenes per student ahead of them. That is post-MVP.

## Measured

Every run below came before the merge of the plug-in's last fix round, apart from the one marked as after it. Real Sonnet, real Haiku, real page, tone voice, on 4 November 2026, on the Mac ten lanes share. Its load was 11 to 35 on 12 cores, so the pressure rule was raised for these runs with `ASTRA_SCENES_AHEAD_LOAD_PER_CORE=20`. On its default this Mac would prepare nothing, and that is the rule working. Each number is from a few runs, so read them as what happened and not as a rate. Cue means the tutor asking for the scene, or the lesson reaching its step.

| Check | With this | Without |
| --- | --- | --- |
| Scenes seen on a topic the library covers | 1 or 2 a session, on 10 of 10 sessions | 0, on 3 of 3 sessions. The tutor asked once each, in its own words, and the router sent each ask elsewhere. It only finds a saved scene when its words match a title |
| Next scene in the page before its cue | 20.5, 35.9, 38.4, and 55.4 s ahead. A saved take was in the page about 1 s after it was started | Never. Nothing is fetched ahead |
| Cue to scene seen, saved scene | 6.2 to 18.2 s on 14 landings, nearly all of it the rest of the tutor's reply | M3.14 measured 11.6 to 20.9 s on a saved scene, on 8 runs, not at this head |
| Reply's end to scene landed, saved scene | 48 to 993 ms on 10 of 13. The other 3 were 5.3 to 5.7 s, which by their length is the 5 s of room to answer after a question, an inference | |
| The cue against its word, the budget being 100 ms | 2 to 9 ms on 6 landings. The first frame is drawn before the word, because the tutor speaks only once the page says the take is loaded. The page's own reading of the scene was 137 to 208 ms after the cue, through a poll of 80 ms and the fade in, so it cannot show the first pixel closer than that | |
| A written scene | Fresh writes: 0 of 4 landed on their cue, for three reasons, each now fixed or known. One fresh write sat ready in the page 39 s before the student asked what was next, and lost its turn to another ask by the tutor, which is now passed over. The tutor did not ask for one that sat ready for 97 s, and a student asking what is next now reaches it. Two more missed, as below. Written earlier: a scene written for this student in an earlier session landed 12.9 and 14.8 s after the tutor asked, for no new spending | 0 of 1. The tutor asked for nothing in 130 s. M3.14 measured 0 of 3, dropped at about 32 to 36 s |
| After the merge of that fix round, a saved scene | Seen 15.9 s after its cue, with the cue 5 ms from its word, at load 44 | |
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
| A crisis with the next scene ready, after the recap and the plug-in landed | The tutor's crisis words, the queue stopped, and no scene in the 40 s watched after it |
| End with the next scene ready, after the recap and the plug-in landed | The recap showed, and no new scene played in the 40 s watched after it. The scene already seen stayed in the corner |

| First text, before the last merge of main | p50 | Slowest | Turns |
| --- | --- | --- | --- |
| Off, `ASTRA_SCENES_AHEAD=0` | 1760 ms | 1970 ms | 5 |
| On | 1709 ms | 2332 ms | 5 |

That is too few turns on too loaded a machine to call equal or to call a cost. The turns on include replies after a scene, which carry a longer note, and the turns off do not, which may be part of the gap. That is an inference. The earlier table found no clear cost on 27 to 35 turns a set.

Pictures: `next-scene-proof --out` saves `scene-N-landed.png`, `after-skip.png`, and `after-reload.png`.


## A lesson that runs on

Abel: "why lessons are so short and only teach for like 1 minute or 30 seconds? when i say rockets how they escape, shouldnt it be able to tech me for like 20 minutes on that subject and give me exercises and teach me more and more?? without me having to ask for it to continue". Short turns stay, so depth comes from many of them.

- **The tutor goes on by itself.** `apps/agent/src/live/tutor-lead.ts` decides. A reply that asks nothing is followed by the next, and the model starts as the last reply ends, so a student hears about 2 s of quiet. Any speech, typing, or work holds it or cuts it, as for any reply, and the stop button holds it until the student does something.
- **It waits only on a real ask.** After a question it waits 12 s, says the answer itself, and goes on. After a task it waits 40 s, works it, and goes on. Once one has gone by with no sign of them, those are 7 s and 20 s, because a student who is only listening should not sit through the full wait on every exercise. About 5 s after the tutor has answered a try at a task, it moves on.
- **A student who only listens is never stopped.** It holds only on a real sign they have gone: the tab out of sight, the page gone, or the lesson over. A tab out of sight comes from the page's own `pageHidden` message, and a screen lock counts. The tutor finishes what it is saying, and nothing goes on, and no scene lands, until they come back.
- **No word and no input.** With no lesson left, as after a plain question, it holds after 10 minutes. In a running lesson it goes to the plan's end, because a listener and a student who walked away with the tab open look the same from here, and a 10 minute hold would stop the first at 10 minutes. `mostQuietInALessonMs`, at 35 minutes, is only for a plan that somehow never ends. The quiet limit closes the room 10 minutes after any hold.
- **After a safety reply nothing goes on by itself**, until the student asks to be taught again.
- **A card's plan comes from the server.** `getCardMaterial` in `scene-library.ts` gives the card's idea and its deeper titles, each with its `opening` and `more` lines and whether a saved scene may play. The brief carries it, so nothing is read from disk during a turn, and the queue above takes those titles without asking a model. A card with no deeper titles keeps its first step and takes the rest from the planner.
- **A plan runs on.** Near its end the planner writes the next ideas, seeing the titles so far and what the tutor really said, up to 16. Past that the tutor asks what they want next, and nothing goes on by itself.
- **Their words beat the count.** "go on", "teach me more", "what's next", and the like end `exercise_due`, and move on once the idea has been taught. In any other language the tutor reads it itself, and the planner's `wants` carries it a turn later.
- **Saved scenes.** The shelf is read again for each batch of ideas the planner adds, so a later idea or a typed topic gets a saved scene if one fits. A saved scene no longer counts toward the 6 asks in a session, because those stop new writes. They count toward `ASTRA_SHARED_PLAYS_A_DAY`, now 18 a student, about three whole lessons. Each play is spoken again through the live voice, because this path keeps no voice. A play measured about 422 characters, so 94 credits at 22 credits per 99 characters. 18 plays cost one student up to about 1,700 credits a day, about $0.30. The project's own daily credit limit, 1,500 by default, is lower than that and stops first. Setting it for real use is a hosting decision.
- **Exercises.** A student listening hears 7 replies on a card's idea, or 6 on a planned one, before the exercise. One who is talking gets there after 3 or 2. In a reply that sets the exercise, a line that shows its own answer, such as `100 - 30 = 70`, is stopped before the student sees it, and elsewhere a task on such a line is refused.
- **Code picks the kind.** `hasWorkingToDo` reads a card's lines for a number or a quantity, and a planned step's exercise for a digit, and the note then says `exercise_kind`. `problem` means a write task on a math line with numbers, or a pick. `board` means anything but a second written answer in a row. Any other task, or a bare question with no task, goes back once, and no filler plays. The second try stands, so a student always has something to do. Words already spoken stay spoken, so a reply that had started on another kind can sound like two starts.
- **Numbers.** On a problem nobody tried, the lead note carries `code_worked_it`, the value `compute` gets for the line. The tutor is told to use it to at most three figures. What it says aloud is still not checked.
- **Words.** A reply that opens on "Next,", "Time for a quick one.", "Fair enough.", or "Fine, skip it." has them taken off in code, with no wait, and "Next," goes from the start of any sentence. A reply that announces a correction goes back once, and says what is true as a plain line.

One lesson on the rocket card, real Sonnet and Haiku, the fake voice in real time, in Node, with a student who answers tasks and says nothing else:

| Run | Ideas | Scenes | Exercises | Taught for | Longest quiet, nothing open | First text p50, early and late | Cost | Voice |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 12 ideas at most | 12 | 6 | 8 number problems, 3 place, 1 pick | 16.8 min | 3.1 s | 2174, 2037 ms | $0.027 a minute | 620 characters a minute |
| 14 ideas at most, compaction forced at 30,000 tokens | 14 | 6 | 1 number problem, 9 written, 1 own words, 3 place | 17.9 min | 3.8 s while teaching, then 75 s held after its one check | 2317, 1474 ms | $0.021 a minute | 610 characters a minute |
| 16 ideas allowed, a student who says nothing at all, stopped by hand at the spending limit | 13 of 16 | 5 | 11 number problems, 1 match | 18.7 min, and still going | 5.3 s while teaching, 43 s on the first exercise and 20 to 23 s on the rest | Not kept, because the run was stopped before it wrote them | $0.036 a minute, or $0.029 without its compaction | 636 characters a minute |
| Abel's own words, "rockets how they escape", typed, same student, stopped by hand at the same limit | 6 of 8 | 3 | 1 number problem, 4 pick or order on the board | 10.3 min, and still going | 6.7 s while teaching, 22.5 s on an exercise | Not kept | $0.016 a minute | 750 characters a minute |

The 16 ideas should reach about 23 minutes, an estimate from 86 s an idea on the silent run, and no run has measured the last three. The silent run ran before the last edits to steering, so its steps from the planner were steered by a wider list of words than the code now uses. The typed run is on the final steering and is why that list narrowed: on the wider one, a lesson on sonnets was told to write math. 610 characters a minute is about 136 credits a minute, about 2,700 credits for 20 minutes, on the fake voice's pace. The first run's prompt reached 59,041 tokens, about 450 a reply, so the real trigger of 60,000 fires at about 20 minutes. The second run compacted twice, at 577 s and 935 s, and the lesson carried on with nothing said word for word again.

## Run it

Beside what `docs/tests/scenes.md` lists, with your own store and LiveKit agent name:

```sh
ASTRA_TUTOR_SCENES=1 SCENE_STORE_DIR=<your store> pnpm agent
pnpm --filter @astra/agent next-scene-proof --web <your stack> --out <folder> --trace <ASTRA_VOICE_TRACE folder> --ask "Teach me about Saturn's rings"
pnpm --filter @astra/agent eval:library-match
pnpm --filter @astra/agent eval:whole-lessons --out <folder> --spend <new ledger> --students quiet,nudging --replies 13
pnpm --filter @astra/agent eval:whole-lessons --out <folder> --spend <new ledger> --only rocket --students tasks --replies 9999 --minutes 22
node apps/agent/src/lesson-plan/eval/whole-lesson-page.ts --web <your stack> --out <folder> --trace <ASTRA_VOICE_TRACE folder> --says "6:teach me more" --replies 12
node apps/agent/src/lesson-plan/eval/whole-lesson-page.ts --web <your stack> --out <folder> --trace <ASTRA_VOICE_TRACE folder> --hide-after 3 --hide-for 40 --replies 7
```

`ASTRA_SCENES_AHEAD=0` turns the queue off, so a session asks for what it asks for and nothing more. The proof takes `--event skip@1`, `reload@1`, `switch@1:<words>`, `crisisWhenReady`, or `endWhenReady`, and saves each landing as a picture.

## What this does not prove

- That this holds on a machine with room, or on a real laptop with Intel or AMD graphics. Every run shared one loaded Mac with Metal.
- Spoken student words. The driver typed.
- The real voice. A real voice would change how long a reply takes, and the cue to scene wait with it.
- How often a real student reaches a written scene in time. The driver's pace is a guess, so the share ready in time is not a measure.
- A full lesson of many concepts on a real page. "A lesson that runs on" below measured one in Node with the fake voice.
- That a lesson reaches 20 minutes with nobody there. The silent run was going at 18.7 minutes on idea 13 of 16 when it was stopped at the spending limit. Stopping at the plan's end is held by a test, on no real run.
- That the exercise mix holds on a typed topic. On a card, code reads the lines, and 11 of 12 were number problems. On a typed topic, code takes the planner's word, and it wrote digits on 1 of 5, with 2 of the 5 an order on the board. The kit's 17 scenes add no pictures here: each is a second take of a title already on the shelf, under `<store>/kit/<topicId>/`, so nothing in the queue changes when they land, and a topic with no title on the shelf, such as photosynthesis, still gets none.
- A worst case on a real voice. A student who walks away with the tab open on a visible page costs one lesson. Measured over 18.7 minutes: $0.67 on the model, one compaction included, and 11,869 characters, about 2,640 credits at 22 credits per 99 characters. For 16 ideas, an estimate: about 23 minutes, $0.80, and about 3,250 credits. The project's daily credit limit, 1,500 by default, stops the lesson at about 11 minutes, so that default must rise before a real voice can teach for 20. If a plan somehow never ended, the $1 a session limit stops the model first.
- First text against main, in alternating pairs, on this prompt. Inside one lesson it was no slower late than early.
- Near-limit and pressure rules on a real page. Tests hold them, and the proof raised one on purpose.

Known and not fixed here. A scene's first frame is empty on most takes, because a take starts from nothing at second 0, so the box stays blank through the setup line, about 2 to 3 s, while the tutor says "Watch". That is the seam M3.14 built, and it needs its own change. A tutor told `picture_topic` does not always ask for it, so a scene can sit ready until a student asks what is next or code sees an exercise end. A due scene lost to a task the tutor set in the same reply is dropped, by the window.

