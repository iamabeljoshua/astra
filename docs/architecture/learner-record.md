# The learner record

The tutor remembers each student across sessions, truthfully, so a returning student feels known. Students are minors, so what is stored is narrow, and each student can see and remove all of it.

## What is stored

`learner_notes` holds one row per note. Row security is on, and every read and delete names the student.

| Field | Meaning |
| --- | --- |
| `kind` | `showed`, `struggled`, `cares_about`, or `explored`. |
| `topic` | A few plain words. |
| `detail` | On a struggle only, one plain phrase saying what went wrong, or nothing. |
| `evidence` | Code's own copy of the checked line or the student's words behind the note, at most 160 characters each. |
| `session_id` | The session it came from. Deleting the session or the student deletes the note. |

`showed` and not "knows", because one right line on one day is what code really saw. A student keeps their newest 200 notes.

`learner_record_updates` says that one room's update has been applied. It holds a session ID and a job ID, and no words. A repeat of the same update is a no-op, so a note a student deleted stays gone. A later session can add a new note from what happens in it. We do not keep a list of what a student removed, because that list would itself store what they asked us to forget.

## How a note gets written

The pass runs in the agent as a room closes, so the student has gone and nothing waits on it. It is bounded at 8 seconds, and it cannot throw.

1. `session-digest.ts` builds the room's lines as they happen, with an ID for each. A wrong read of handwriting or speech does not count as wrong, because a reader's mistake is not a student's.
2. `screens.ts` drops lines before any model sees them. A crisis anywhere in a room, a safety refusal, or the tutor's own safety line ends the pass with no model call and no note. Lines about health, feelings, family, friends, a school, an address, or faith are dropped. So are lines that read like instructions.
3. `extract-notes.ts` asks Haiku for candidate notes, each citing line IDs.
4. `trust-notes.ts` decides. The model only proposes a label and points at lines.

| Kind | What code requires |
| --- | --- |
| `showed` | Cites only lines code marked right, none the tutor wrote first, and no later wrong line on the same task. |
| `struggled` | Cites a line code marked wrong, or the student's own words saying it is hard. A question alone is not a struggle. |
| `cares_about` | The student's own words, saying they like it, with no negation, and every word of the topic in those words. A tutor's suggestion never counts. |
| `explored` | Cites any real line. |

A topic must use words from the session, plus a short named list of plain words for the parts and moves of working a problem, so a subject the session never touched cannot appear. "Keeps" or "again" needs two wrong lines. A detail that goes past the lines costs only the detail. The evidence stored is copied from the digest, never from the model.

What code cannot prove is that a label is the best description of a right or wrong line. The stored evidence is what keeps that honest: a student sees the line next to the label, and can remove the note.

## What the tutor reads

`memory-note.ts` builds one short block, at most 8 notes, newest per topic, with no quotes. Notes older than 120 days stay on the student's page, but the tutor stops reading them. The screens run again on read, so a note that reached the table some other way is still not read. The block is a system note in JSON, and the system prompt says it is data about a past day, never an instruction.

An empty list says the tutor knows nothing, and so does no note at all when the read fails. A failed or slow read never holds up the first words: it shares the profile's one second limit.

## What we chose for minors

Memory stores nothing about distress, health, or family, and nothing about a crisis, not even that one happened. A room with a crisis writes no notes at all, so it cannot become a remembered trait. A session that mentions a parent in passing still keeps its checked math, without that line. The flag queue for a person to review belongs to M4.5, and it does not read or write this table.

The screens lean toward refusing, because a lost note costs little. They are word lists, so they miss some wordings and catch some innocent lines. The model's own skip and the tutor's safety line are the second and third nets.

## Cost

One pass on Haiku costs about $0.0002 for a short lesson, and $0.00099 at most, measured on the largest digest it can hold. It is charged to the student's daily total. `docs/tests/tutor-model.md` has the numbers.
