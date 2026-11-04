# Recap and replay

M4.4. A session ends with a short, true recap, and a student can reopen a past lesson and watch it again, with its board, captions, and their own work.

## The shape

`SessionEvent` was already the log. M4.4 saves it, and adds one thing to it: what the student said and typed, as `studentSpoke` text.

| Stored | Where | Written by |
| --- | --- | --- |
| Each event of a run of the log | `session_log_events`, one row per `session_id`, `run_id`, and `seq`, with the whole event as JSON | The agent, every 5 s and at close, through `POST /agent/sessions/:id/log` |
| What the session's end said | `sessions.recap`, a `SessionRecap` | The agent, through `POST /agent/sessions/:id/recap` |
| The student's own answer to the thing to try | `sessions.recap_answer` | The page, through `PUT /sessions/:id/recap-answer` |
| That the student deleted these | `sessions.replay_deleted_at` | `DELETE /sessions/:id/replay` |

A beat's row grows as it plays, so saving a row again replaces it. Each job keeps its own clock and count, so a session the student came back to has one run per tutor. A replay plays the runs one after another, skips the time between them, and starts each on a clear board, because that tutor did.

`GET /sessions/:id/replay` names the student in its read, so another student's session answers 404 for a read and for a delete. The API does not read inside an event. The page parses each one with `parseSessionEvent`, and a row it refuses is left out, so one bad row cannot take a lesson with it.

## What plays

The board comes from `getBoardAt` on `getLogOperations`, the same reducer the live board reads, through `SharedBoard` and `BoardStageView`. There is no second player. `replay.test.ts` holds the same board against the live operations at every seek point, in any order.

The clock is one number, `replayClock.ts`, read once a frame while playing, so pause, seek, and speed have nothing else to agree with. A word shows from when it really played, and a word a cut beat never played does not show.

**The tutor's voice.** It is not stored, because the plan says no stored raw audio and no storage service is set up. A replay does not make it again, because the plan needs Abel's word for that. So a replay shows the exact words as captions and, by default, reads them in the device's own voice with `speechSynthesis`, at a rate fitted to how long the beat really took. The screen says this in one line. It uses only a voice with `localService` true, so the tutor's words, which can repeat a student's, reach no outside service. A browser with no such voice stays silent and says so.

| Choice | Credits per replay | Cost per replay, 30 min lesson | Needs |
| --- | --- | --- | --- |
| Captions and the device's voice, built | 0 | $0 | Nothing |
| Make the voice again with Chris on each replay | About 6,750 | About $0.54, at the listed $40 a million characters and an estimate of 15 min of speech, 13,500 characters | Abel's word |
| Keep the voice as it was made | 0 | About 3 MB a lesson at 24 kbps, plus an encoder and a store | A new dependency, a store, and a change to the plan's "no stored raw audio" |

The estimate has not been measured on a real lesson.

## The recap

`endingSession` comes from the page. The agent stops the tutor, hears nothing more from the student, and decides in code. A student's own words that mean they may not be safe, or the tutor's own safety reply, make a gentle ending: one fixed line with no model and no word about the work. With fewer than 30 words heard and no work there is nothing to look back on, so there is no recap and the page leaves at once. Anything else goes to Haiku 5.5, with the log's words as data.

What code holds the model to, in `recap-rules.ts`:

- `gotRight` exists only if code itself called some work right. A draft line about anything else is dropped. A line naming a number outside that work is replaced with one code writes, such as "You got x equals 4 right."
- `covered` and `tryNext` may not praise, may not say what the student did, and `covered` may not name a number nobody said or a topic with no word in what was said.
- At most 22 words a line and 60 in all, which is about 25 s.
- A model that reads possible distress, or refuses to read at all, makes the ending gentle.
- Past a spending limit, a timeout of 6 s, or two failed drafts, there is no recap and the session ends as it would have.

The recap is an ordinary turn on the voice line, so it reaches the log and plays back in a replay. The session finishes when End is pressed, and `keepsRoomForRecap` leaves the room open for at most 2 minutes. The agent closes it as soon as the recap has played.

`pnpm --filter @astra/agent eval:recap` runs ten logs three times each on the real model, including wrong work only, a student who gives the model orders, and two kinds of distress with no plain word in them.

| Run | Held | Cost | Time |
| --- | --- | --- | --- |
| 4 November, Haiku 5.5 | 30 of 30 | $0.0025 | 1.0 to 2.5 s a recap, 1.2 s at the median, on a loaded Mac |

The last run's 17 rows of a 41 s lesson took about 8 KB as JSON, so a 30 minute lesson would be about 350 KB. That is an estimate from one short lesson.

## Proof

`apps/agent/src/lab/proof/recap-replay-proof.ts` holds a lesson on the real tutor with the fake voice, ends it, opens it from Sessions, and scrubs. It fails if a board reached by seeking back differs by one byte of its screenshot from the same moment reached going forward, if pause does not hold, or if another student gets anything but a 404. `--goal gentle` and `--goal nothing` prove the two other endings. A real voice has not read a recap, because one recap is about 125 credits and this lane had 50. It goes down the same `speak` path as every turn.

| What the run on 4 November found, on real Sonnet and Haiku with the fake voice, on a loaded Mac | Result |
| --- | --- |
| End pressed to recap on screen, with a lesson in it | 2.4 to 3.3 s over 3 runs |
| End pressed to Home, with nothing in the session | 1.3 s, with no recap shown |
| A session where the student disclosed being hurt | The gentle line, decided in under 40 ms with no model |
| Three seek points, reached forward and then back | The board's screenshot is byte for byte the same |
| Speed at 2x | 2.15 times real time over 2 s |
| Pause held for 800 ms | Did not move |
| Another student, signed in, on read and delete | 404, with nothing of the lesson in the body |
| No token | 401 |
| Delete, then the list | The row goes back to `Open`, and the session says nothing is saved |

## A crisis session

The gentle line tells them to talk to an adult they trust or call their local emergency number, as the tutor's own safety reply does. The session's log and recap stay, as any session's do, so its words can be replayed and deleted by that student. Whether a crisis session should be kept at all is on the lawyer's card.

## The seam for memory

`onRecap` in `createLiveSession`, which `worker.ts` fills in. M4.1 takes `recap.covered` of a `lesson` recap there. A `gentle` recap holds nothing to note.

## What differs from the plan

- The check question is the recap's one thing to try. The student answers it alone in one typed line, on the recap or later on the replay, and it is stored with the session. Code does not judge it, and M4.1's record reads it from there.
- There is no key-moments command. Code picks the moments.
- A student who continues a session gets a new tutor on a clear board, as today. The log is there to restore from, and that is not built.
- 3D scenes replay through the same `catalog` argument of `getBoardAt` once a scene command is on this branch. Nothing here has run one.
