# Lesson kinds and the plan beside the replies

M3.9. The tutor picks the shape of a lesson from how the student asked, follows them when they change their mind, and never makes them wait for a plan.

## What a student gets

- A direct question or a problem goes hands-on in the first reply: a few words, the problem on the board, a task, and they try. The answer waits until they have tried, unless they say they just want it.
- A topic, a lesson, or a wish to understand teaches first, then picks an exercise to do together. One short problem after each concept that has working to do.
- A subject with no working gets an exercise that suits it, on the same board, with words: put events in order, match pairs, pick on a diagram, or explain it back.
- Their own words beat all of it. "No exercises" means none until they ask. "Let me try one" means now.
- A new topic mid-session is normal. The tutor follows at once, the session's title changes, and "go back to my problem" works. It never tells them to start a new session unless a real limit is reached.

## Who decides what

The first reply cannot wait for anything, so the shape of that reply comes from the rules in `apps/agent/src/lesson-plan/lesson-rules.ts`, a block of its own in the tutor's prompt. Sonnet reads how the student asked and picks.

Beside each reply, `lesson-planner.ts` asks Haiku 5.5 what the message does to the lesson. The answer is a `PlanMove`: `stay`, `new` with a `LessonPlan`, or `back` to an earlier topic. Nothing waits for it. What it gives is what the first reply cannot have: a title for a switch, a spine of two to four steps, and a place to go back to.

`plan-progress.ts` holds the lesson as data: the plan now, the step it is on, and the plans left behind. A step ends when its exercise does, because that is the one moment code can see.

| Event | Seen as | Step |
| --- | --- | --- |
| The tutor sets a task | a kept `task` command | Stays, with an exercise open |
| Code sees it finished | work that closes the task, and is right or wrong | Moves on |
| The tutor teaches again | `boardMode` `teach` with an exercise open, which is how words with no key end | Moves on |
| The student leaves it | `leave`, or work that closes the task as `unknown` | Stays |

The next turn gets only the current step, as a `lesson_plan` note, and only when it changed. `system` stays frozen, so the prompt cache still holds. After compaction or a clean start the note goes again.

The tutor treats the note as a suggestion from something that sees less than it does. What the student just said comes first, and Staying safe comes before any plan.

## Safety

Words that may be about safety never reach the planner, by the same check the brain uses on a refused message, and the planner holds any such words it does see at `stay`. So serious words cannot become a session's title. A title is cleaned in `parsePlanMove` and checked again by the API and the page. `groups-lessons.json` holds crisis messages in a lesson, on an open exercise, before a plan lands, and as the first message. `groups-safety.json` runs with the planner on.

## A switch and the title

The first words of a room come from the session's own title, so the first plan never renames it. Any later change of topic does: `sessionTitle` goes to the page, and `POST /agent/sessions/:id/title` saves it. A finished session keeps its title. A failed save keeps the session running, with the page's title and a trace.

The bar shows the new topic where it showed the subject, "Your question" included. After a reload it shows the subject again, and the saved title stays in the heading, the sessions page, and the carry-on line.

A card's picture belongs to the card's topic, so it goes at a switch and the visual stays empty, with no box where it stood. PR 87's scene plugs into the same seam, the `visual` prop.

## Moving to the board

`boardMode` `handsOn` lands on a spoken word, in the log, as PR 88 and M3.12 built it. The rules ask for it directly before a word such as "together". When the tutor writes first, that command brings the board in at its own word, which is logged and lands the same. Typing also brings the board in, because a student must always be able to answer.

Teaching with no scene has no visual to move, so the board stays full and clean. A card's picture stands big until the first thing that brings the board in, and when the tutor draws while teaching, that is what moves it. So the picture often goes small sooner than Option 2 shows, until scenes are the thing teaching draws on. That is for the plug-in round.

`pnpm --filter @astra/agent lesson-proof --web <your stack> --out <folder>` drives all of this on the real page. `visual` is exact on `ASTRA_TUTOR_MODEL=recorded`, where "let me try one" says `boardMode` on "together".

## Cut for time

- Plans saved with the session, and the migration, entity, DTOs, and legal text for it. A plan lives in the room, so a new room starts again from the saved title.
- "Concept 2 of 5" on the session screen and what comes next on the continue card.
- Skipping ahead when a student shows they know more, as data. The tutor does this by reading them, and the plan does not change.
- Examples from a student's interests in the plan. The tutor has them in its own note.
- Scenes named in the plan, which M3.13 reads.
- A session from a card keeps its `topicId` after a rename, so that card can reopen a session now about something else.
