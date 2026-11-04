# Lesson kinds and the plan beside the replies

M3.9. The tutor picks the shape of a lesson from how the student asked, follows them when they change their mind, and never makes them wait for a plan.

## What a student gets

- A real problem goes hands-on in the first reply: a few words, the problem on the board, a task, and they try. This is a strong steer and not a promise, because a model writes the reply. The table under How it is proved says how often it held.
- A why question, language, or code with working to do gets a task in the first or second reply.
- A bare fact, such as "whats the capital of australia", gets its answer, and then a question or a task if there is something worth doing.
- A topic, a lesson, or a wish to understand teaches first, then picks an exercise to do together. One short problem after each concept that has working to do.
- A subject with no working gets an exercise that suits it, on the same board: put events in order, match pairs, pick on a diagram, fill a blank in a sentence, or explain it back. A sentence goes on the board with `text`, with the choices in a `place` task or a `write` task with `reads` and `accepts`, because math on the board refuses sentences.
- Their own words beat all of it. "No exercises" means none until they ask. "Let me try one" means now. "Just tell me" gets the answer the first time, and code lets it through.
- A new topic mid-session is normal. The tutor follows at once, the session's title changes, and "go back to my problem" works. It never tells them to start a new session unless a real limit is reached.

## Who decides what

The first reply cannot wait for anything, so the shape of that reply comes from the rules in `apps/agent/src/lesson-plan/lesson-rules.ts`, a block of its own last in prompt v2, and from two notes beside the student's words: `getProblemNote` adds `problem_now` when code can see a problem in them, and `getTeachFirstNote` adds `teach_first_now` when they ask to be taught. Neither goes on words that may be serious. Sonnet reads how the student asked and picks.

Prompt v2 asks for 15 words a turn, and that fought the exercises. So commands do not count as words, and a reply that sets a task may take 30. Both are in the turn note, as `exercise`, from `LESSON_TURN_NOTE`.

Beside each reply, `lesson-planner.ts` asks Haiku 5.5 what the message does to the lesson. The answer is a `PlanMove`: `stay`, `new` with a `LessonPlan`, or `back` to an earlier topic. Nothing waits for it. What it gives is what the first reply cannot have: a title for a switch, a spine of two to four steps, and a place to go back to.

`plan-progress.ts` holds the lesson as data: the plan now, the step it is on, and the plans left behind. A step ends when its exercise does, because that is the one moment code can see.

| Event | Seen as | Step |
| --- | --- | --- |
| The tutor sets a task | a kept `task` command | Stays, with an exercise open |
| Code sees it finished | work that closes the task, including words with no key, which close as `unknown` | Moves on |
| The tutor teaches again | `boardMode` `teach` while an exercise is open, when the tutor closes it before the student does | Moves on |
| The student leaves it | `leave`, or words that say they want something else | Stays |

`exercise_due` joins the step's note when no exercise is open and enough replies have ended on the step: one for `handsOn` and two for `teachFirst`. Help in a crisis starts that count over. "No exercises" stops it until they ask for one, and code reads those words, because a pushed note would otherwise beat them.

The next turn gets only the current step, as a `lesson_plan` note, and only when it changed. `system` stays frozen, so the prompt cache still holds. After compaction or a clean start the note goes again.

The tutor treats the note as a suggestion from something that sees less than it does. What the student just said comes first, and Staying safe comes before any plan.

## Safety

Three things hold serious words away from a title, and none of them is a guarantee.

- `MAY_BE_ABOUT_SAFETY` keeps words it recognises from the planner. It is a word list. On vague wordings it stopped 0 of 33 in the reviewer's run.
- Haiku is told to answer `stay` on anything about being hurt, drugs, sex, or a medical problem. That held those 33, and it is a model's answer.
- `getTrustedMove` turns a `new` move into `stay` when the student's words or the planner's topic hold a word from `NOT_FOR_A_TITLE`, such as grooming, consent, or antidepressants. The tutor still teaches, with no plan, and the session keeps the title it had. A shared device must not show "Age of consent in Lagos". The list catches only what it names, and a topic it misses can still become a title.

A switch with no topic, such as "Starting a new topic", also stays, so the old title remains. A title is cleaned in `parsePlanMove` and checked again by the API and the page. `groups-lessons.json` holds crisis messages in a lesson, on an open exercise, before a plan lands, and as the first message. `groups-safety.json` runs with the planner on.

## A switch and the title

The first words of a room come from the session's own title, so the first plan never renames it. Any later change of topic does: `sessionTitle` goes to the page, and `POST /agent/sessions/:id/title` saves it. A finished session keeps its title. A failed save keeps the session running, with the page's title and a trace.

The bar shows the new topic where it showed the subject, "Your question" included. After a reload in the same room, the planner tells the page the title again. In a new room, a card that has moved shows its saved title, because the save also clears its picture. A question in a new room shows "Your question" in the bar, because nothing saved says it moved, and the heading shows the title.

A card's picture belongs to the card's topic, so it goes at a switch and the visual stays empty, with no box where it stood. The save clears `artwork`, so the picture stays gone after a reload and on the sessions page. PR 87's scene plugs into the same seam, the `visual` prop.

## Moving to the board

`boardMode` `handsOn` lands on a spoken word, in the log, as PR 88 and M3.12 built it. The rules ask for it directly before a word such as "together". When the tutor writes first, that command brings the board in at its own word, which is logged and lands the same. Typing also brings the board in, because a student must always be able to answer.

Teaching with no scene has no visual to move, so the board stays full and clean. A card's picture stands big until the first thing that brings the board in, and when the tutor draws while teaching, that is what moves it. So the picture often goes small sooner than Option 2 shows, until scenes are the thing teaching draws on. That is for the plug-in round.

`pnpm --filter @astra/agent lesson-proof --web <your stack> --out <folder>` drives all of this on the real page. `visual` is exact on `ASTRA_TUTOR_MODEL=recorded`, where "let me try one" says `boardMode` on "together".

## What it costs

Haiku 5.5 at $0.10 and $0.50 a million tokens. `pnpm --filter @astra/agent eval:plans` replays the 30 messages of `turns-30.json`, one at a time, through the planner a room uses.

| Measured on 4 November | Value |
| --- | --- |
| Plan calls in a 30 message session | 28, because 2 lines are math and need none |
| Cost of those calls | $0.0045, which is 0.15% of the $3 daily limit |
| Time for a plan, one at a time | 1.7 s at p50, 2.4 s at p95 |
| Time for a plan, 47 at once | 1.7 s at p50, 3.3 s at p95, 3.5 s at most |
| A plan's limit | 5 s, then the tutor teaches on |

The rules add about 4,600 characters to the cached prompt, so about $0.00015 a turn on a cache read and about $0.003 on each cache write (computed from the price list, not measured). The turn note adds about 30 tokens a turn. A spoken turn averages $0.0072, so a chatty student's 417 turns a day on the $3 limit become about 400.

## How it is proved

| Promise | Proof |
| --- | --- |
| A real problem gets a task, a topic teaches first, no working means words, and their words overrule | `eval:kinds`, on the real tutor and the real planner. Measured counts are in the PR |
| A plan never holds a word, and a failed one means the tutor just teaches | `eval:kinds --planner fail`, and `lesson-plan.test.ts` with a planner that never answers |
| A plan is right about what the student wants | `eval:plans`, including every crisis message in `groups-safety.json` |
| A model line saying "new session", "new lesson", "different session", or "new conversation" goes back for other words | `getWordsProblem`, with `lesson-plan.test.ts`. Other wordings are not caught |
| No first attempt can claim a feeling | `getClaimProblem`, with `lesson-plan.test.ts` and `eval:groups` |
| A switch, a title, and the way back | `eval:switch`, and `lesson-proof --only switch` on the real page |
| The move lands on a word, in the log, in about 560 ms | `lesson-proof --only visual` on a recorded tutor |

Measured on 4 November with the rules last in prompt v2, on one run of each wording, with a model playing the student:

| Measure | Before this round, on v2 | After |
| --- | --- | --- |
| `eval:kinds` failed checks | 10, in 25 groups | 0 or 1 in 33 groups, over the last two runs. The 1 was "how do you say good morning in spanish" with no task by reply 2 |
| Topics taught first | none set a task early, but first task at reply 3 to 5 or never | 12 of 12, all first task at reply 3 |
| The reviewer's 12 direct wordings, task in reply 1 | 4 | 5, and 10 by reply 2 |
| The reviewer's 24 repeats, task in reply 1 | 11 | 11 |
| Of those 24, why, language, and code | 3 of 10 | 7 of 10 |
| Of those 24, bare facts | 4 of 10 | 0 of 10, by design: they get the answer |
| A sentence with a blank | 4 of 4 commands refused | 0 of 4 refused |

Known misses. "if i drop a ball from 20 meters how long till it hits the ground" set no task in three replies in 1 of 2 runs, because code sees no numbers to work and "hits" keeps it from the planner. "whats a derivative?" reads as a concept and set its task at reply 3. A diagram edge with no label is refused, which cost the heart question its picture in 2 of 2.

## Where the rules sit

They come last in prompt v2, after Notes you receive, and that was measured on the prompt before v2. With the same words placed before Being right, crisis replies said "I'm glad" about 1.5 times in 16 turns. Placed last it was 0.5, and the prompt with no rules at all, with the planner on, was 0.25 over the same turns. The base, with neither, was 0 in 64 turns. The cause is not known, so this is a measure and not an explanation.

So `getClaimProblem` holds the prompt's own list in code. A reply that claims a feeling goes back for other words before the student hears it, on a first attempt only, because help for a student in crisis must get out even in imperfect words. Anyone moving this block must still rerun `eval:groups` a few times and read the replies.

## Cut for time

- Plans saved with the session, and the migration, entity, DTOs, and legal text for it. A plan lives in the room, so a new room starts again from the saved title.
- "Concept 2 of 5" on the session screen and what comes next on the continue card.
- Skipping ahead when a student shows they know more, as data. The tutor does this by reading them, and the plan does not change.
- Examples from a student's interests in the plan. The tutor has them in its own note.
- Scenes named in the plan, which M3.13 reads.
- A session from a card keeps its `topicId` after a rename, so that card can reopen a session now about something else.
