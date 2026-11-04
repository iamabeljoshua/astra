# The learner record

The tutor remembers each student across sessions, truthfully, so a returning student feels known. Students are minors, so what is stored is narrow, and each student can see and remove all of it.

## What is stored

`learner_notes` holds one row per note. Row security is on, and every read and delete names the student.

| Field | Meaning |
| --- | --- |
| `kind` | `showed`, `struggled`, `cares_about`, or `explored`. |
| `topic` | A few words, every one from a closed list. |
| `detail` | On a struggle only, one phrase from the same list saying what went wrong, or nothing. |
| `evidence` | Code's own copy of a checked line of math or a task done on the board, or `source: 'words'` with no text, which says only that the note stands on what the student said. |
| `session_id` | The session it came from. Deleting the session or the student deletes the note. |

`showed` and not "knows", because one right line on one day is what code really saw. A student keeps their newest 200 notes.

No note stores a student's free words, on any kind. A typed line becomes evidence only as the math in it, so "x = 4 my snap is chi_oma2011" keeps `x = 4`, and a line with no math keeps nothing. The API refuses a `words` row that holds text.

`learner_record_updates` says that one room's update has been applied. It holds a session ID and a job ID, and no words. A repeat of the same update is a no-op, so a note a student deleted stays gone. A later session can add a new note from what happens in it. We do not keep a list of what a student removed, because that list would itself store what they asked us to forget.

## How a note gets written

The pass runs in the agent as a room closes, so the student has gone and nothing waits on it. It is bounded at 8 seconds, and it cannot throw.

1. `session-digest.ts` builds the room's lines as they happen, with an ID for each. A wrong read of handwriting or speech does not count as wrong, because a reader's mistake is not a student's.
2. `screens.ts` drops lines before any model sees them. A crisis anywhere in a room, a safety refusal, or the tutor's own safety line ends the pass with no model call and no note. Lines it reads as about health, feelings, family, friends, a school, an address, or faith are dropped, and so are lines that read like instructions. It is a word list and it misses wordings, so it does not decide what is kept.
3. `extract-notes.ts` asks Haiku for candidate notes, each citing line IDs.
4. `trust-notes.ts` decides. The model only proposes a label and points at lines.

| Kind | What code requires |
| --- | --- |
| `showed` | Cites only lines code marked right, with no later wrong line on the same task. The tutor must not have shown the line first, on the board or aloud, either way round and however it was written, and must not have said its answer in the last 3 turns. The student must not have said it was a guess, in their words just before or after. |
| `struggled` | Cites a line code marked wrong, or the student's own words saying it is hard. A question alone is not a struggle. |
| `cares_about` | A plain first-person statement, such as "i love football", with every word of the topic in that clause. A line with "used to", "nobody", a negation, "lol", a capitalized word, or a question loses the note, so sarcasm costs a note rather than keeping a false one. A tutor's suggestion never counts. |
| `explored` | Cites any real line. |

A topic passes only if every word is on the lists in `topic-words.ts`: school subjects and concepts drawn from `apps/api/src/picks/library.json`, the deeper scenes, and the curriculum the tutor teaches, plus the parts and moves of working a problem, and for `cares_about` a short list of ordinary interests. Words match whole, with no stemming. Anything else loses the note, so places, names, schools, faith, health, substances, and sexuality are not kept because they are not on the list. `sex education` and `vaping` stay out on purpose. A topic must also use words from the session, so a subject the session never touched cannot appear. "Keeps" or "again" needs two wrong lines. A detail off the list or past the lines costs only the detail. Board evidence is copied from the digest, never from the model.

What code cannot prove is that a label is the best description of a right or wrong line. A student sees a checked line next to its label and can remove the note. A note that stands on their words shows only that it did, and they can remove it too.

## What the tutor reads

`memory-note.ts` builds one short block, at most 8 notes, newest per topic, with no evidence lines. Notes older than 120 days stay on the student's page, but the tutor stops reading them. The screens and the list run again on read, so a note that reached the table some other way is still not read. The block is a system note in JSON, and the system prompt says it is data about a past day, never an instruction.

An empty list says the tutor knows nothing, and so does no note at all when the read fails. A failed or slow read never holds up the first words: it shares the profile's one second limit.

## What Home reads

`picks/record-picks.ts` turns notes into cards, in code, as Home loads. No model is involved, and a failed read gives a Home built from sessions and the library.

| Kind | Card | Most on screen |
| --- | --- | --- |
| `struggled` | The library topic that names it, one with deeper scenes first, else the library lesson it happened in, else a lesson of its own if the words name something to teach. | 2 |
| `showed` | The library topic that names it if unstarted, else the next topic in that subject. | 1 |
| `cares_about` | An unstarted library topic that names it. A liking alone is not a lesson. | 1 |
| `explored` | None. | 0 |

The newest note on a topic stands, so a right answer settles an earlier struggle and a later struggle reopens it. A note from the session on the continue card waits. A session started on the topic since the note takes its card away. Finished topics stay away, and two topics in progress still fit on screen, as M2.12 requires.

A library topic can list other names in `alsoCalled` in `library.json`, because a note says "free-body diagrams" and the title says "What holds a block on a slope". A note names a topic only when all its subject words match, because a true reason on the wrong card is still misleading.

`usable-notes.ts` keeps the newest note on each topic and drops any past 120 days. It holds no word list of its own: a topic is on the fixed list before it is written, and a card shows only the topic, not the detail, the evidence, or the session's title. Unlike the tutor's brief, Home does not run the list again as it reads.

A topic with deeper scenes comes from `deeper-scenes.json`, the server's own list, so Home's load never reads the scene store. A flagged or missing scene does not change the card, because only the store knows about those.

`pick-reasons.ts` holds each reason as one whole sentence, with `{day}` where the page puts the day, because only the browser knows the student's time zone. Rewording a struggle changes one string there.

## What we chose for minors

Memory stores nothing about distress, health, or family, and nothing about a crisis, not even that one happened. A room with a crisis writes no notes at all, so it cannot become a remembered trait. A session that mentions a parent in passing still keeps its checked math, without that line. The flag queue for a person to review belongs to M4.5, and it does not read or write this table.

A lost note costs little, and a kept disclosure costs a lot, so the shape of a note carries this: no free words are stored, and a topic comes from a closed list. The screens are word lists that miss some wordings and catch some innocent lines, and they decide only what the model sees. A wording they miss still leaves nothing in the table but a listed topic. A listed word can still be true of someone, so "lungs" can sit behind a line about asthma, with the line itself gone. The model's own skip and the tutor's safety line are further nets on a crisis.

## Cost

One pass on Haiku costs about $0.0002 for a short lesson, and $0.00099 at most, measured on the largest digest it can hold. It is charged to the student's daily total. `docs/tests/tutor-model.md` has the numbers.
