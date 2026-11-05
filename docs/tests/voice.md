# Live voice: what the real path measured

This is the record M3.6 owes, and PRD test 4's measurements. `turn-rows.json` holds the 30 real turns row by row, and `node apps/agent/src/lab/proof/voice/read-turn-rows.ts` recomputes their figures. `voice-results.json` holds the other raw runs: stops, accents, every column of "How long the first word takes" under `joinTiming`, the proofs of a finish, a killed job, a quiet room, and the microphone under `safetyProofs`, the old-token checks under `oldToken`, and the attacks under `secondReview` and `finalFixRound`, from a verifier's script that is not in this repo.

A figure labeled inferred is worked out from the others. `returnAtEdge` holds the last runs of "Coming back at the edge". `joinAtOpen` holds a verifier's 5 joins from the screen opening, at `70f4e44`. These were read from a run that was not kept, so the file does not hold them: the three rows of "Joining as the screen opens", the single calls to LiveKit, a reviewer's rounds on Decision 4's pause, Muse's handshakes of 985 to 2209 ms, the first run's microphone bytes of 36404 and 49705, the drop proof's resume times, and the tab proof's 16.6 s and 20.6 s.

Every figure was measured on 4 November 2026 on Abel's Mac under load from other agents, at a load average of 5 to 35. The student's browser and the agent both ran on this Mac, so **every message from the agent to the student crossed the network twice**, up to LiveKit Cloud's EU West B and back down. The round trip from this Mac to that edge was 135 to 153 ms. A hosted agent would sit beside the edge and cross it once. No figure below ran that way, so each line that removes a leg is labeled inferred.

The speech is synthetic: Mac voices and stored clips, played into the app through a fake microphone. Everything after `getUserMedia` is real: WebRTC, LiveKit Cloud, the agent's voice detector, Muse, the turn rule, ElevenLabs Chris on Flash, and the browser's clock. No real voice, real microphone, or speaker has run this PR. "What Abel can do" lists what that leaves open.

## The two numbers

**First reaction from code**, from the moment code decides the student finished, to the student's browser. 30 real turns.

| Reaction | p50 | p95 | Worst | Rule: 200 ms at p95 |
| --- | --- | --- | --- | --- |
| On the dot, a data message | 143 ms | 155 ms | 162 ms | **Pass** |
| In the tutor's voice, stored audio, to the first sample in the browser's audio graph | 243 ms | 271 ms | 282 ms | **Miss on this path** |
| The same, one leg removed, inferred | about 170 ms | about 200 ms | | **On the limit**. 271 minus 70 is 201, so it may pass or miss |
| A typed send, the dot, in the browser | 0 ms | 0 ms | | **Pass** |

No model is in either path. Code takes 3 ms from the decision to the first frame on the voice line. What limits the voice is the network and WebRTC: two legs at about 70 ms each, plus about 100 ms that audio takes over a data message, for the encoder and the browser's jitter buffer. A zero playout delay on the receiver gave 238 ms at p50 in one run of 8, which is inside the run-to-run spread, so it stayed out.

Counted from the student's last sound, the dot reacts at 970 ms at p50 and 1008 ms at p95, and the voice at 1074 ms and 1119 ms. That is the voice detector's 250 ms of silence, about 280 ms for the sound to reach the agent, and the 300 ms floor. Lowering the floor is the lever if this feels slow to a person.

**The 150 ms silence rule.** A reaction on a stop's heels pays all of it. A student typing over the tutor, the tightest case, got its first frame 150 ms after the decision, so a voice reaction there reaches the student at about 390 ms on this path, and about 320 ms with one leg removed, inferred. In 6 of 6 spoken interruptions it cost nothing. The stop comes on the student's first words and the reaction comes when they finish, which was 1065 to 2111 ms later, so the first frame left 1 to 8 ms after the decision. So the rule spends the 200 ms only when a student interrupts by typing or says one word that ends before its transcript lands. The dot does not pay it.

**First real word**, from the student's last sound to the first sample of the reply in the browser. 30 real turns, with a stand-in brain that takes no time.

| | p50 | p95 |
| --- | --- | --- |
| First real word, as built | **1848 ms** | **2012 ms** |
| The same with no reaction ahead of it, inferred from each turn's steps | 1518 ms | 1873 ms |
| One leg removed too, inferred | about 1450 ms | about 1800 ms |

| Step | p50 | p95 | Whose it is |
| --- | --- | --- | --- |
| The voice detector hears silence | 536 ms | 576 ms | 250 ms of our setting, the rest the trip up |
| Muse's final (S), which everything waits for | 791 ms | 956 ms | **Muse. This is the limiter** |
| The turn is decided (D) | 950 ms | 1303 ms | The turn detector, 53 ms after the final at p50, 546 ms at p95 |
| The voice's first audio (F), after the decision | 271 ms | 306 ms | ElevenLabs Flash, on a warm socket |
| The wait on the line, behind the reaction and its 150 ms | 193 ms | 570 ms | Ours. It goes away once a model takes longer than that |
| The trip to the browser | 286 ms | 307 ms | Two network legs and WebRTC |

So on these vendors a first real word cannot beat about 1.5 s here with no model at all. Muse's final is the floor, and it is larger than the voice and the network together. M3.7 adds the model on top: Sonnet with `between_tools` low gave 1655 and 1956 ms to first word in the earlier comparison, so about 3.2 s and 3.8 s by inference, with the reaction covering the wait.

Starting the model early would not help on these numbers, because the final arrives after the detector's silence in every one of the 30 turns. The SDK's early start stays off, and M3.7 can start from the final or the partial itself.

## The rule's other limits

| Target | Rule | Measured | Verdict |
| --- | --- | --- | --- |
| First sound to yield | 300 ms | 25 ms at p50 and 26 ms at p95, the browser's own detector. The agent's own `yield` follows at 483 and 510 ms | **Pass**, on injected audio with no microphone in the path |
| Decision to stop to silence and a frozen board | 150 ms at p95 | 162 ms at p50, 171 ms at p95 in the real voice. The browser mutes on arrival, so this is delivery, and it moved with where LiveKit placed each side. In a reviewer's 5 rooms, delivery was 134 to 155 ms with the student and the agent both in `omarseille1b`, and 252 to 255 ms in the room where LiveKit put the student in `ochicago1a`, with a round trip of 224 ms, and the agent in `omarseille1b`. A 279 to 297 ms room from the first runs is inferred to be the same, because region was not recorded then. `interrupt` in `run-voice-proof.ts` now records each side's region beside each stop | **Miss on this path**. About 90 ms with one leg removed, inferred |
| First sound to silence | 1.2 s at p95 | 1279 ms at p50, 1339 ms at p95 | **Miss on this path**. With one leg removed, inferred, 1339 minus 140 is 1199 ms, **on the limit** |
| Board freezes on a stop | | 6 of 6 and 8 of 8 froze, 0 cues fired after a stop | **Pass** |
| "Uh-huh" does not stop the tutor | | 6 of 6 reaction clips left it running on the fake voice, with the voice back up in 956 to 1769 ms | **Pass** |

**Why first sound to silence misses.** A wordless stop fires 800 ms after the detector hears voice, and the detector hears it about 300 ms after the sound. Then the stop takes about 160 ms to arrive. The 800 ms cannot come down much, because the detector's voice period runs about 220 ms longer than the sound, so a 500 ms "uh-huh" looks like 720 ms. Muse's first partial comes too late to save it, at 991 ms and later from the first sound. A lower bound would cut the tutor on every long "uh-huh", which the plan forbids outright, so I kept "uh-huh" and report this miss. Abel called 1.2 s a starting value.

**The browser's own yield is new.** The agent's `yield` takes 483 ms here, which cannot meet 300 ms from this far. So the browser lowers the voice on the microphone's first sound, with no network in the way, and the agent decides what the sound was. If the agent hears no voice in it, the volume comes back after 1.5 s. It uses the same probe as the tutor's audio, so constant room noise reads as no onset and leaves this to the agent. It has not met a real room or a laptop speaker's echo.

## Muse, measured again

The first run of this PR measured a final at 3.4 s at p50. The cause: the plugin paces audio from its first packet, so frames queued during the 1.2 to 2.3 s handshake stayed that late for the whole session. The adapter now drops frames until Muse answers, and finals fell to 791 ms at p50 on the same clips. The browser makes sure those dropped frames are silence, as "What a first line loses" says.

| Row the design listed | Measured here |
| --- | --- |
| First partial, from the first sound | 1119 ms at p50, 1359 ms at p95, through the whole path. 22 of 30 lines had none by 1 s. Straight into the adapter: 850 to 1121 ms at p50 by accent |
| Final, from the last sound | 791 ms at p50, 956 ms at p95, through the whole path. 691 to 776 ms at p50 straight into the adapter |
| A final held in noise | With white noise at 0.02 under the voice, one of three lines, the first after the noise began, held its final to 4163 ms. The tutor answered from the partial at 2242 ms. With noise at 0.03, 12 of 12 finals came within 886 ms and the guard did not fire. White noise is not a room, so Abel's test owns this bound |
| `clearUserTurn` on each reaction | Gone. A reaction's words become a turn the rule drops, so Muse stays open. Each session opened Muse once |
| A new Muse session | 1154 to 1928 ms to answer the handshake, over 5 joins, and 985 to 2209 ms over 6 more. It opens on the first frame of the microphone. A greeting does not cover it, because a session opened by typing has none, so the browser holds the sound instead |
| Turn patience's 38 of 120 | 4 of 20 long answers reached the cap, and 0 of 12 short ones. The turn was decided 285 ms after the voice ended at p50 on long answers, and 862 ms and 2341 ms from the last sound |
| Decision 4's pause | **Differs from the design.** The tutor jumped in on a 1.5 s pause after a question, 3 of 3, on a synthetic voice. This row first blamed punctuation in real finals, which was wrong, because `inference.TurnDetector({version:'v1-mini'})` predicts from audio and takes no text. A reviewer ran 3 rounds each. The stock clip with real punctuation jumped 3 of 3, at 1220 to 1341 ms. The same audio with punctuation stripped jumped 3 of 3, at 925 to 1161 ms, scoring 0.38 to 0.52 against a threshold of 0.36. The same opening words cut from inside a longer sentence jumped 0 of 3, scoring 0.09 and 0.11, and waited on the 2 s cap. So the clip's finished-sounding tone caused it. The tutor stops on the student's next word. Its second reply carried only the 8 new words, 6 of 6, so a reply cut before it finished now still owes its words, and over three reruns on the fake voice the tutor jumped in 8 of 9 and the last reply carried both halves 9 of 9. Left for Abel, with the reviewer's judgment and the coordinator's: do not raise the floor on this evidence. If a real voice still gets cut, raise the wait only after a question, which costs other turns nothing. The microphone test has a line for it |
| "Hmm, let me think" | Heard as "Let me think." 3 of 3, no reply, and the tutor prompted at 9.3 s from the last sound |
| Keywords | Off, as the plan says |
| 60 minute cap | A new session opens at 50 minutes at a pause, or at 55 with none, and the old one hears audio until the new one answers. Tested on a fake of the wire with short timers, and never for 60 real minutes |
| A dropped link's silence | Padded after 400 ms with no frames, so a line still waiting gets its final. The session closes 10 s after the last frame, so a microphone left off pays Muse nothing, and a rejoin or a new press opens it again. Closing and reopening ran on the real socket, 3 of 3 lines with no word lost |

**Spellings.** On five synthetic accents Muse wrote "Aha" for "Uh-huh" on 4 of 5, "Mm hum", "Hum.", and "MMMM." The reaction list now takes these by shape. One it cannot save: "Come." for "Hmm" on the Irish voice would stop the tutor.

**Accents.** 10 lines of speech and math, 67 words, and 9 reactions per voice, straight into the adapter. This is the plan's "at least three accents", on synthetic voices only.

| Accent | Voice | Word errors | With math spacing forgiven | Final p50, p95 |
| --- | --- | --- | --- | --- |
| American | Samantha | 2 of 67 | 0 | 776, 1199 ms |
| British | Daniel | 2 of 67 | 0 | 762, 937 ms |
| Indian | Rishi | 2 of 67 | 0 | 774, 1084 ms |
| Australian | Karen | 5 of 67 | 0 | 752, 1146 ms |
| Irish | Moira | 5 of 67 | 4, all "X squinted over to" for "x squared over two" | 691, 955 ms |

Spacing means "4 ac" for "four a c" and "2 x" for "two x". The other Irish errors are spacing too.

## What a first line loses

A student who types first has no greeting, so nothing covers Muse's handshake, and the first run of this PR lost the start of their first spoken line. "Wait, then why does it come down?" became "Does it come down?", and the tutor answered that. A microphone also takes about 300 ms to publish, and the agent's subscription takes more, so a line spoken at once after off and on lost its first word 1 of 3, with Muse already open.

So the browser holds the microphone's sound in memory from the first moment of capture. The room gets silence until the agent says `earsOpen`, which it sends when a frame reaches a Muse that has answered. Then the browser plays out what it held, first to last, and skips quiet until it has caught up. "Your microphone is on." now appears when capture starts, because from then nothing is lost. The sound goes out after 12 s in any case, so a lost message delays a line and cannot silence it. Off drops anything held. The agent's own frames are not buffered, because the plugin paces from its first packet and a backlog there stays late for the whole session.

Every line was a Mac voice through the real room and real Muse, with the fake voice for the tutor.

| Case | Before | Now, every word heard | The final, from the last sound |
| --- | --- | --- | --- |
| Type, wait for the answer, press Talk, speak 300 ms later, into a Muse that has never opened | Lost the start of the line | 18 of 18, over three runs. On the last, Muse answered in 1343 to 1982 ms, and the browser heard `earsOpen` 2439 to 3116 ms after the press | 1004 to 3199 ms, and 4499 ms once, when Muse held its final and the tutor answered from the partial 1431 ms after the voice ended |
| Off for 3 s and on, speak at once, Muse still open | Lost the first word 1 of 3 | 9 of 9, over three runs | 1603 to 2079 ms |
| Off for 14 s and on, speak at once, Muse closed and opening again | Not measured, because Muse stayed open and paid | 9 of 9, over three runs | 2847 to 6456 ms |

So a line spoken into the wait is answered later, by about what the wait took, and only that once. The usual final stays at about 791 ms at p50, because the line has caught up by then. A loud room is the open risk: nothing above an RMS of 0.015 counts as quiet, because losing a soft word is worse than running late, so a room louder than that catches up only in its quiet moments.

**Muse with the microphone off.** The session closes 10 s after its last frame, and a press or a rejoin opens it again, so a tab left with the microphone off pays Muse nothing. The 10 s outlasts LiveKit's own retries of 3 to 5 s.

## The microphone, on real Chromium

Real `getUserMedia` reading a fake capture file, on real WebRTC, with the bytes from each sender's own stats. `run-safety-proof.ts --only mic,leaving,publishFails,noDevice` runs it.

| Case | First run of this PR | Now |
| --- | --- | --- |
| Talk twice, 200 ms apart | 2 live tracks and 2 senders | The second press means off. The microphone is off, with 0 tracks captured and 0 senders |
| Then one off press, still talking | `mic` off and `aria-pressed` false, with tracks `live` and `ended`, sender bytes rising from 36404 to 49705 in 3 s, and Muse finals and turns still firing | Three presses gave 1 track and 1 sender, moving 15598 bytes in 3 s. One off press: track `ended`, sender removed, 0 bytes moved in 3 s, and nothing heard by the agent from 2.5 s after the press |
| A press 0, 20, 60, and 200 ms after pressing on | Not run | Each ended off, with 0 live tracks and 0 live senders |
| The room refuses the track | Track left captured, and the page said the browser refused | The track is `ended`, with 0 senders, and the page says the microphone could not start |
| The page leaves | Not run | `pagehide` ended the track before anything could wait, and leaving the session screen inside the app ended it too |
| No microphone on the device | "Your browser did not allow the microphone" | "We could not find a microphone on this device" |
| A press while LiveKit retries by itself, on a proxy cut for 3.5 s | Showed on and published nothing, by reading the code | 5 of 6 ended on, with 1 live track, 1 live sender, 17428 to 18974 bytes moved in 3 s, and the agent heard the words. The sixth ended off with 0 bytes, which is what it showed. That run did not record its phase. Its trace shows the student leaving and the job closing 15.5 s later, so by inference its rejoin outlasted the 15 s a room waits after a client leaves |

One loop moves the microphone toward what the student last asked for, so a press only changes that wish, and a second capture cannot start while one is open or opening. The button shows the press at once, so a room still opening cannot look like a press that missed.

## Rooms, tokens, and a tutor that has gone

**Only the API calls the tutor in.** A token cannot be taken back, and one that named the agent could start a job for a finished session, so tokens no longer name it and last 2 minutes rather than 10. The API opens the room and calls the tutor in, for a session that has not finished. `run-safety-proof.ts --only finished` ended a session from outside its open page. The page said the connection had ended 2 ms after the finish answered, on the code of that run, and it now asks the API first, which answers 409. The job closed in 1693 to 2841 ms over two runs, and a new token answered 409. The old token could still join, into an empty room, and started no job, 1 job before and 1 after.

**How long an old token lasts.** A token set to 2 minutes works for about 3. Fresh joins worked at 125 and 170 s and were refused at 190 s, so LiveKit allows about a minute past the expiry. The expiry only stops a new join. A token already joined was still connected at 250 s, and LiveKit does not end a connection when its token expires. So nothing in this code bounds it. It lasts until the client leaves or the room is deleted, and the finish deleted the room before that join, so nothing deletes this one. It is not a privacy problem. A normal page gets 409 and stays out, so only a script that kept its token reaches it, and that script gets a room with no tutor, no Muse, and no one else, because `maxParticipants` is 1. What it costs is LiveKit connection minutes, as any script holding an unfinished session's room does, and the limit below caps how many new rooms it can get. A sweep that deletes the rooms of finished sessions would bound it, and it is not built.

**Each room gets a new name.** On LiveKit Cloud, for at least 12 s after a delete, a create of the same name answered with the old room and called no one: at 1, 3, 6, and 12 s it did, and at 25 and 50 s it did not. So `session-<id>-<8 hex>` is new each time. The API keeps the names it has given, because every call to LiveKit from this Mac is slow, as "How long the first word takes" shows. It reads who is in a known room before reusing it, because only a job there says a tutor is, and it lists every room in the project only for a name this process has lost, such as after a restart. So more than one API process would each make that slow list, and a deploy with several should store the name on the session.

**A job that dies.** It used to leave the page flipping between live and reconnecting, each rejoin minting a token and keeping the room alive. A killed job now ends in a clear message: the page said `reconnecting` from about 3300 ms and gave up at 19778 and 24840 ms on two runs, after 3 tokens and none in the next 8 s, with the microphone off. **Try again** closes that room and opens a new one, and the tutor was back in 5270 to 5709 ms and answered. It starts fresh, without what was said so far, and the message says so. LiveKit would restart a crashed job by itself after about 25 s, measured once, and a tutor who has forgotten the lesson with no word why is worse than saying so, so the room asks it not to.

**A job that dies before the page joins.** A dead job's track stays in the room long after the job, so the track says nothing about whether a tutor is there. Reloads 0.2, 4, 10, and 18 s after a kill used to reach `live` with the microphone on and stay there for all 45 to 50 s of watching. A warmed job killed 1.5 s before a press stayed so for 124 s, a typed reply got no answer, and the page kept sending to LiveKit. So the page now says "Connecting to your tutor." until it hears the job itself, and it says hello on the track so the greeting does not wait for a pulse. Rerun the same way, reloads at 0.2, 4, 10, 18, and 30 s and that warmed job each said `noTutor` 25.1 to 25.2 s after the press, with **Try again** on screen, the microphone off, 0 live tracks, 0 senders, 0 bytes moved in the next 3 s, and no one left in the room. On a temporary change that joins when the screen opens, with the microphone off, a healthy page went live and got its greeting, a reload 0.5 s after a kill said `noTutor` at 25.1 s with 0 bytes moved, **Try again** brought a tutor in 6923 ms, and a warm job killed as it started said `noTutor` at 18.4 s. `liveVoiceRoom.test.ts`, "leaves its track behind", fails if the wait stops at the track.

**How many jobs a student can start.** Each room runs a job of about 100 MB, and 8 POSTs at once from one student used to start 8 jobs, each living 111 to 118 s. About 100 in a loop should reach the project's concurrent limit and refuse every student, by inference. So there are two limits.

| Limit | Number | Past it | Where it holds |
| --- | --- | --- | --- |
| Warm rooms | 2 per student in 2 minutes, the time a warm room lasts with no student | The session is created and not warmed, and its room opens when the student joins, about 2 s later than a warm one by inference | Every API process, because it counts the `sessions` table after the insert, so however many arrive at once only the first 2 can read a small count |
| Rooms opened | 12 per student in 10 minutes, which is a new lesson every 50 s, and starting over stays at 5 of those | The route answers 429 with `retryAfterSeconds`, and the page says that wait | One API process. With several, a student gets 12 from each, and the only store they all share is the database, which this does not write to |

A student opening a few lessons meets neither. The third in 2 minutes starts a little later and is told nothing. Many accounts together can still reach the project's limit, which these do not address. Rerun with 8 POSTs at once on top of a session already warm: 8 of 8 created in 121 ms, 0 of those 8 warmed and 0 jobs at 10 s, and a press on one of them was live in 4976 ms with no message about waiting. 100 POSTs in a loop, one after another, gave 100 created in 2236 ms, and 1 room and 1 job at 12 s, because a session from the run before was still in the window.

**At the limit.** The page used to say only "could not connect", a typed reply then joined the dead room and failed at 25 s, and each join kept that room alive 2 more minutes. Now the page says how long the wait truly is, from the start that lifts the limit, the reply box stays closed, and every ask after a lost tutor is a start over until one is answered, so nothing joins the dead room. A reload does join it once, because a new page does not know the tutor has gone. It then says the tutor could not connect, **Try again** shows the wait, and that room closes by itself within 2 minutes of the last join. Rerun at the limit, a killed job read `tutorLost` at 20.7 s. **Try again** got a 429 and the page said a new tutor can start in about 10 minutes, true to the 5 starts made about half a minute before. The box was read-only, a second **Try again** got another 429, no join followed, and the room had left LiveKit's list 132 s later.

**A warm room near its end.** A room with no student closes at about 120 s, and by reading `worker.ts` the job deletes it as it closes, so a press at 123 s got "Your connection to the tutor ended.", 1 of 8. A warm room nobody has joined now counts as gone from 105 s, and the press opens a new one. A room that closes makes the page ask again, and only a finished session ends there. Rerun with presses at 106, 118, 123, and 126 s, 4 of 4 went live and got the greeting's turn 5692 to 7424 ms after the press, with no "ended". That is 4 presses and not the 8 of the first run, because the warm limit now allows 2 per student in that time. Each paid for a new job, and the old one closed by itself with no student in it.

**A quiet room.** `QUIET_ROOM_LIMIT_MS` in `live-session.ts` is 10 minutes with no student speech or typing, no board action, and no tutor speech. A minute before, the page says so and offers **Keep the room open**. At the limit the page says why, the job ends, and **Open the room again** brings a new tutor. `run-safety-proof.ts --only quiet` ran a 40 s limit standing in for it, with the warning half way. The warning showed at 20.3 s, **Keep the room open** took it down, and the next warning came 20.0 s later. Pressing nothing then, the room closed 20.0 s after that, the page said why, the reply box stayed read-only, the room left LiveKit's list within 7.4 s, and **Open the room again** brought a new tutor in 5.5 s, who answered. Then `--only quietTen` ran the real limit on the real clock with nothing pressed: the warning at 540.5 s, the room closed at 600.3 s, and a new tutor 5.8 s after **Open the room again**.

## How long the first word takes

From pressing **Talk** on a new session to the tutor's first sound in the browser's audio graph. PRD section 6.3 asks for 3 s at p50. `run-join-timing.ts` splits it at every step a clock can see, and the same script ran on each commit: 8 joins, on the fake voice, on this Mac within 25 minutes at a load of 12 to 18, with a round trip near 235 ms because LiveKit placed these rooms in `ochicago1a`. Figures are p50 in ms from the press, and a negative one happened before the press.

| Step | Tutor in the token, `116cc20`, pressed at once | The same, pressed after 5 s | API lists and creates on the press, `214495c`, pressed at once | Now, pressed at once | Now, pressed after 5 s |
| --- | --- | --- | --- | --- | --- |
| The API answered | 69 | 123 | 3772 | 1130 | 261 |
| Signal connected | 1069 | 1020 | 4574 | 1957 | 1142 |
| Student in the room | 1782 | 1838 | 5317 | 2743 | 1959 |
| Job requested | 1211 | 1188 | 3519 | 1161 | -3942 |
| Job in the room | 3410 | 3274 | 6497 | 3467 | -1491 |
| Tutor's track up | 3932 | 3920 | 7061 | 4002 | -922 |
| The agent hears hello | 4756 | 4689 | 7939 | 5100 | 2719 |
| The greeting's turn reaches the page | 4996 | 4954 | 8162 | 5361 | 2988 |
| **First sound** | 5061 | 5040 | 8295 | 5421 | 3050 |
| First sound, best to worst | 4851 to 6186 | 4771 to 5868 | 7638 to 9326 | 4715 to 8531 | 2676 to 3162 |
| Round trip to the edge | 228 | 238 | 237 | 242 | 239 |

So a student who presses 5 s after the screen opens hears the tutor in 3050 ms, against 5040 ms on the commit that named the tutor in its token. An earlier run of 8 on the same path gave 2735 ms, so this sits about on the PRD's 3 s, at this round trip. A press the instant the screen opens, about 200 ms after the session exists, gets no lead on the job, so it waits on the same job start and stays near the old figure, at 5421 ms with a worst of 8531 ms. No human presses that fast, and the lead grows with every second before the press.

A verifier ran the same script at `36f31eb`, 5 joins each, at a load of 12 to 24, with a round trip near 249 ms: 3375 ms at p50 pressed after 5 s, with the API answering in 551 ms, and 6419 ms pressed at once, with the API answering in 1323 ms. So the PRD's 3 s is on the limit at best, and a loaded machine misses it.

**Where the difference came from.** An earlier comparison read 3788 ms over 5 joins with the tutor in the token, against 5383 ms over 8 once the API opened rooms, a gap of 1595 ms. It mixed two things. Run together, the old commit gives 5061 ms today, so about 1270 ms of the old figure was this network and this load, at a round trip of 228 ms against 134 to 155 ms. And that first change was worse than it looked. On the same method it gave 8295 ms, 3234 ms over the old commit, and all of it was one step: the API answered in 3772 ms rather than 69 ms, and asked for the job only at the end of that, because it listed every room in the project and then created one.

| One call to LiveKit from this Mac, 5 or 6 samples | Median ms | Range |
| --- | --- | --- |
| List every room | 1717 | 273 to 2112 |
| List one room by name, while it is open | 833 | 736 to 856 |
| List a name that has gone | 274 | 266 to 294 |
| Create a room, on a connection in use | 592 | 494 to 665 |
| Create a room, after 6 s idle | 1105 | 1022 to 1412 |
| A dispatch, on a connection in use | 505 | 498 to 545 |

**What came out.**

- The job. A new session opens its room as it starts, so the tutor is in the room about 3 s after that, usually before a student has pressed anything. The press makes no call to LiveKit, and the API answered in 261 ms at p50 in the table above and 551 ms in a verifier's 5 joins, both pressed after 5 s at a load of 12 or more. The tutor hears nothing until the student joins, and the student now joins as the screen opens, with the microphone off. A session started with its screen never opened cost one job for about 122 s. The room closed itself on the `emptyTimeout`, nothing reached Muse, and a press after that brought a new tutor in 5950 ms.
- The list. The API keeps the names it has given, reads who is in a known room before reusing it, and lists every room only for a name it has lost.
- The audio setup. Building the audio graph took 90 to 480 ms under load, and the page waited for it before asking for the room, so the two now run together.
- The wait for a pulse. The page held `hello` until the agent's first pulse, which comes on the lossy channel. In a run of 8 with that wait, the agent heard `hello` 1004 to 1457 ms after the student joined, and 4931 ms once. Without it, 682 to 788 ms, because a tutor's track already says the agent is listening.

**What did not help, so it stayed out.**

- Joining alongside creating the room. On a press the instant the screen opens, the student is in the room at about 2500 ms and the job at about 3600 ms, so the student's join is not what the first word waits for. A join that beat the create would also leave a room with no tutor.
- Holding the connection to LiveKit open. It would save about 500 ms of a create, which only matters for a press within about 2 s of the screen opening. Node's `fetch` drops an idle connection after 4 s, so holding one takes a new dependency or a ping.

**What is left, for M3.10.** The press now spends about 880 ms on the signal connection, 820 ms joining, 760 ms subscribing to the track and saying hello, and 330 ms on the greeting's way back. All of it is the network, at this round trip. Abel made the call on the largest lever left, joining when the screen opens. "Joining as the screen opens" holds the result.

## Joining as the screen opens

Abel: "can connect even if student hasn't pressed talk, or atleast prompt them to press talk ok? so they are not there stuck and waiting". So the page joins the room as the session screen opens, on a new session or one continued from Home, and it sends a first line that opens the turn: the question, `I'd like to learn about <title>.`, or `I'm back to carry on with this: <title>`. The tutor greets from a stored take and then answers. Nothing else needed a press.

| From the screen opening to the first sound, fake voice, this Mac | p50 ms | Best to worst |
| --- | --- | --- |
| Now, a new session, warmed as it starts, 8 joins | 5143 | 4457 to 7431 |
| Now, a third new session or more in 2 minutes, not warmed, 8 joins | 7380 | 6131 to 8961 |
| Now, a session continued from Home with no room yet, 8 joins | 7586 | 5426 to 12047 |
| Before, from pressing **Talk** at once on a new session | 5421 | 4715 to 8531 |
| Before, from pressing **Talk** 5 s after the screen opened | 3050 | 2676 to 3162 |

A verifier's 5 joins on the warmed row, at a load near 10 and a round trip of 228 ms, gave 6596 ms at p50, 5572 to 7338 ms. So the student no longer has to press anything, and the first sound comes about 5 to 6.6 s after the screen opens, about what pressing at once took. It misses PRD section 6.3's 3 s. The 3050 ms row started its clock 5 s after the screen opened, with the job already in the room, so it is not the same wait. What limits it is the job: on the warmed row the job started at about 3500 ms, and the sound came about 1300 ms later. A continued session has no warm room, so it first lists every room, about 1700 ms, because the API has lost its name, and then creates one. These ran at a machine load of 10 to 19, with other lanes on this Mac. All of them used the stand-in tutor and the fake voice, and the first sound is a stored take.

`getUserMedia` is not called until the student presses **Talk**. `run-safety-proof.ts --only noPress` proved that on real Chromium: with the tutor speaking, there were 0 microphone asks, 0 tracks captured, and 0 audio senders. After the press there was 1 ask, 1 live track, and 1 live sender.

| What the student sees | When |
| --- | --- |
| `Connecting to your tutor.` where the tutor's words go | Until the tutor's first turn in this page |
| **Tap to hear your tutor** | The browser still blocks sound. Pressing Start on Home unlocks it, and 3 runs from a real click showed no prompt. Headless Chromium never blocks, so a script locked the audio graph until a click: the button showed, the captions ran on the timer, and one tap turned sound on and took the button away. Not run on a headed browser or Safari |
| `Press Talk to answer, or type.` near the controls | 8 s after the tutor stopped, with the microphone off and nothing done. Writing a reply starts the wait over |

The tutor no longer says "Take your time." after asking a question. It says that only after a filler such as "hmm, let me think", which the student said out loud. A student who is only listening is not counted as gone: tutor speech, a breath between stretches, and a reply longer than the limit all keep the quiet room's count from running out.

| Kept working, proved live | Result |
| --- | --- |
| A second tab | The new tab takes over. The first says `Your connection to the tutor ended.`, with the microphone off, and asked for a room 1 time in the next 15 s, so the tabs do not fight. One student in the room |
| Leaving the screen | The job closed about 18 s after the student left the screen, which holds the 15 s that lets a reload come back, and no one was left in the room |
| The daily limit | The route answered `dailyLimit` as the screen opened, no job started, the screen said so, and there was no **Try again** |
| The limit on rooms | At 12 rooms in 10 minutes the page says how long the wait is as it opens, and offers **Try again**, which answered 429 until the wait passed. A student who opens many sessions quickly meets this limit sooner than before, because opening one now starts a room |
| A job that dies | A page opening on a room whose job had died said `Your tutor could not connect just now.` at about 25 s with **Try again**, on reloads 0.2 to 30 s after the kill. **Try again** brought a tutor back in about 7 s |
| A warmed room no page joins | With the screen never opened, the job started at 5611 ms, heard nothing, and closed itself at 127 s. Opening the screen later called a new tutor, in 10876 ms |

## With the tutor brain

PR 85's rooms and PR 86's brain were merged and measured together. `docs/tests/tutor-model.md` holds what the model does.

**A cut reply's words.** The turn rule says which words of `text` it carries from a cut reply, as `carried`. The brain sends only what is new when the last turn holds those words, or when a safety check dropped them, so one refusal cannot become two. If the last turn never began, nothing holds them, and they all go. So a long first message cannot crowd out what came after it.

**A student jumping in.** In the first stretch, in a later stretch, and in a breath, the next request holds the question once and the jump-in once, and the note says what was heard and what was not. `live-tutor.test.ts` runs all three through the real brain and a fake model.

**A drop while the page still plays.** The agent finishes a stretch while the page is still playing it. In 2 of 3 real drops on Sonnet a drop in that gap left the end of a stretch unheard, because a resume replayed only the turn it cut. A resume now also replays what the page reports it could not play, and a drop in the breath counts as a cut. Three more real drops on Sonnet then spoke every beat. A beat the page has not reported never played there, so it now replays whole, where it used to replay only its last word.

**A room that closed while the page was away.** A rejoin that lands in a new room has a new job with no history, so the page says `Your tutor had to start fresh, without what was said so far.` until the student next says or types something. With a drop of 50 s and the room deleted during it, the page joined a new room, showed the line, the new tutor answered, and the line went when the student typed. A reload or a return from Home within 15 s of leaving finds the same job, which still holds the lesson, because a student joining now stops the job closing. Later than that it finds a new job, which has no line of its own, and says so if asked, as the tutor's words show.

**Coming back at the edge.** A job closes 15 s after a student leaves on purpose. Leaving for Home and returning at 13 to 16 s used to fail 4 of 5, three with `noTutor` at about 25 s and one with `Your connection to the tutor ended.` at 4.3 s. There were four ways in, and each is closed:

- A job cleared its wait only on a data message, and a page can take a second or more to send one after it joins. A student joining now clears it.
- A page that heard the tutor took a deleted room as a session ending elsewhere. Now it asks the API, which answers 409 if the session has finished, and otherwise finds a tutor. A line no tutor said it heard goes again into the new room.
- LiveKit answers for a deleted room for at least 12 s, and lets a token join it, so a room being there says nothing, and neither does its ID, which stayed the same. The API now reads who is in the room. Past the first 15 s, a room with no job in it counts as gone, and `isTutorThere` tells the page what the API saw. A page that finds nobody in a room with a tutor asks again at once. A new room with no job yet is left alone for those 15 s, so a quick reload starts no second job.
- A room deleted under a join leaves that join open for up to 15 s, and LiveKit hands a second join the first one's promise, so the page believed it was in the new room while a new job waited for it. That was 1 of 12 in the run before this fix, by the job's trace, and the cause is inferred from it and from reading `Room.connect`. The page now waits for the open join to settle, joins time out in 10 s, a failed first join asks again, and a tutor in a new room gets its own 25 s.

`return-at-edge.ts` runs this on real rooms with the fake voice and a stand-in tutor. Before the last fix, 11 of 12 got a tutor. After it, with 3 tries at each of 13, 14, 15, and 16 s from leaving, 12 of 12 got a tutor, and no page showed a line as the student's. The first turn came 4263 to 25059 ms after coming back, 11718 ms at the median. 2 of them found the same job, and the rest a new one. The worst was a join hung by the delete, which then found a new job. The page itself takes 3 to 10 s to load under this Mac's load of 15 to 25, so a return at 13 s often lands after the 15 s.

**A first pulse.** A page used to say it could not hear the agent before the agent had ever sent it a pulse. In 1 of 8 real sessions that cut the first reaction 200 ms in. A link can now only be lost once it has been heard.

**The log.** It refused the row of every beat that starts a stretch, because the breath's length is not part of a beat. Those rows are now kept.

## Hold to talk

Press once stays the default. Holding Space when focus is not in a text field, or pressing and holding **Talk**, opens the microphone only while held. `run-hold-proof.ts` ran every line below in real Chromium on this Mac, on the merged tutor, with a fake microphone track, a fake tutor voice, the stand-in tutor, the real room, and real Muse. `docs/tests/hold-results.json` holds the runs. The load average was 8 to 16 from other lanes. No real microphone, room, or phone has run this.

**What a tap is.** A press under 300 ms is a tap. A tap of **Talk** leaves the microphone on, which is press once. A tap of Space leaves nothing on. Past 300 ms a press is a hold, and only then does the tutor hear of it, so a tap never cuts the tutor. The voice dips at the press itself, in the browser, so the student gets a reaction with no network in the way.

### What hold gains and what it costs

**What it gains.** Between holds, noise cannot reach the tutor or Muse. The same bursts gave 0 voice starts, 0 cuts, and 0 bytes, where press once gave 4 voice starts, and 3 and 4 cuts on two runs. That is the point of hold, and the reason to choose it in a noisy room.

The first word also comes sooner, by about 480 ms in quiet (1612 against 2093 ms) and about 330 to 380 ms in noise, at p50. A hold decides its turn about 40 ms after the final. Press once waits 298 to 760 ms after the final for the SDK's turn decision.

**What it costs.** The final is not sooner. In quiet it comes 48 and 75 ms later, which is under the spread between runs, so that is no measurable difference. In noise it comes 204 and 392 ms later, at p50. Each hold publishes a new track, because a closed microphone must leave nothing in the room, and the page hears `earsOpen` about 1040 ms after the press, which read about 880 ms before the merge under a different load. A student talking through that wait builds a backlog, which drains in 361 ms at p50 in quiet, where silence can be skipped, and in 753 ms in noise, where it cannot. That difference of about 390 ms matches the gap between a hold's final in the two rooms. Press once has its track up and has already caught up.

Rare words are also weaker on a hold in noise. Holds had 5 word errors of 63 in both noise runs, against 0 of 69 for press once. Of the 5, 2 are the digits "2" and "8", which are not mistakes. The other 3 are "slope" as "slow", and "hypotenuse" as "high potent" or "high potentius". With catch-up off they stayed, at 4 of 63. The cause is my inference. `endStream` ends a Muse session, so each hold starts a new one, and a fresh session straight into Muse got "hypotenuse" wrong in every mode, with silence too. A press-once session had already heard earlier lines.

A hold also tells the tutor only at 300 ms, because a press under that is a tap. The voice dips in the browser within about 60 ms, and it stops about 800 ms after the press.

**So,** hold is for what it keeps out, and not for a faster transcript. In a quiet room press once costs nothing and needs no key held, and it stays the default.

### What letting go does

The plugin's Muse mode has one word for this, `endStream`, and it ends the session. So the agent sends it when a line ends, and opens the next session at once. Straight into Muse on 12 clips, from the last sound to the final, in ms.

| | p50 | p95 | Worst |
| --- | --- | --- | --- |
| Silence after the line, as press once does | 779 | 863 | 863 |
| `endStream` after the line | 332 | 402 | 402 |
| Muse's `PUSH_TO_TALK` mode, which the plugin cannot use | 342 | 1640 | 1640 |
| White noise at 0.03: silence after the line | 976 | 3925 | 3925 |
| White noise at 0.03: `endStream` | 343 | 460 | 460 |
| White noise at 0.03: `PUSH_TO_TALK` | 354 | 484 | 484 |

So the end of a line is worth about 450 ms on Muse alone, and it takes away the seconds-long final in noise. `measure-line-end.ts` reruns this. These rows came before the merge, and the merge did not change that path.

### Against press once, the same clips

From the last sound, in ms, p50 (p95), on 11 holds and 12 press-once lines of the same clips. A hold lets go 120 ms after the last sound.

| Room | Final, hold | Final, press once | Reply decided, hold | Reply decided, press once | First word, hold | First word, press once | Word errors, hold | Word errors, press once |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A quiet room | 1064 (1254) | 989 (1137) | 1103 (1281) | 1425 (2015) | 1612 (2396) | 2093 (2449) | 0 of 63 | 0 of 69 |
| A quiet room, repeat | 1033 (1359) | 985 (1199) | 1076 (1379) | 1460 (2154) | 1639 (2504) | 2117 (2520) | 2 of 63 | 0 of 69 |
| White noise at 0.03 | 1447 (1733) | 1243 (3999) | 1493 (1783) | 1541 (2097) | 1982 (2868) | 2309 (2714) | 5 of 63 | 0 of 69 |
| White noise at 0.03, repeat | 1475 (1704) | 1083 (1299) | 1498 (1734) | 1843 (2237) | 1998 (2783) | 2377 (2638) | 5 of 63 | 0 of 69 |

A hold let go right on the last sound, in a quiet room: final 1088 (1293), first word 1621 (2452), 2 of 63 words wrong, "slope" as "slow" and "hypotenuse" as "Hypotanus".

**From letting go,** the final took 956 (1145) ms in quiet and 1338 (1616) ms in noise. Press once has no such moment, because nothing marks the end of its line.

**The first hold** in a room pays for Muse's handshake once: `earsOpen` came 2312 ms after the press in quiet and 3714 ms in noise, and the final 2272 and 4112 ms after letting go. Muse then stays open on silence for 60 s after each line, so the next hold does not pay it.

These are one or two runs per row, on one voice, so a difference under about 100 ms is noise. The two runs of a row differ by up to 302 ms on a p50, and by up to 2700 ms on a p95. A word error is one word edit, so "2" for "two" counts. The error counts move too: 0 and 2 of 63 on the same quiet clips.

### Catch-up and what Muse hears

Catch-up plays a backlog over 100 ms at 1.25 times speed, and only Muse hears it. It changes press once as well, so it had to earn its place. It did, on press once and on a hold.

In the page, p50 from the last sound, 12 clips a run. The proof turned catch-up off by swapping the worklet at `addModule`, and the page counted that swap, because a first attempt through a Playwright route never touched the worklet. So those two runs kept catch-up on, and they are the repeats above.

| | Catch-up on, 2 runs | Catch-up off, 1 run |
| --- | --- | --- |
| Press once, noise, final | 1243 and 1083 ms | 2171 ms |
| Hold, noise, final | 1447 and 1475 ms | 1984 ms |
| Press once, quiet, final | 989 and 985 ms | 1061 ms |
| Hold, quiet, final | 1064 and 1033 ms | 1386 ms |
| Press once, noise, word errors | 0 of 69, 0 of 69 | 0 of 69 |
| Hold, noise, word errors | 5 of 63, 5 of 63 | 4 of 63 |
| Press once, quiet, word errors | 0 of 69, 0 of 69 | 0 of 69 |
| Hold, quiet, word errors | 0 of 63, 2 of 63 | 4 of 63 |

Straight into Muse, with every clip at the speed named, so harder than the page, where only a backlog runs fast. 8 clips in noise at 0.03, a fresh session each, 5 rounds alternating.

| Speed | Word errors of 230 | Per round | Final p50 per round, ms |
| --- | --- | --- | --- |
| Full | 10 | 2, 2, 2, 2, 2 | 345 to 361 |
| 1.25 | 11 | 3, 1, 3, 1, 3 | 348 to 374 |

So catch-up does not hurt what Muse hears, within what these runs can see. At full speed the errors were "2" and "8" for "two" and "eight", and in 2 rounds "A" for "eight". At 1.25 Muse also dropped a leading "The" on one clip in all 5 rounds, and that is the one repeatable cost. It saves 928 and 1088 ms on press once in noise, and 509 and 537 ms on a hold in noise, against the one run with it off, so it stays.

**The lever left, not built.** Keeping one track published between holds and pausing its sender would need no new publish, and by inference would take off most of the wait for `earsOpen`. It is not built, because a paused track may leave the microphone open and the browser's indicator on, and that breaks "off means off". It stays an idea until someone proves that a paused sender can leave the microphone closed.

### Every way a hold can end

Each hold was first proved open, with 1 live track and sender bytes rising. Then, after what was held had gone, each had 0 live tracks, 0 live senders, 0 bytes moved in the next 1.5 s, `aria-pressed` false, and the microphone off.

| How it ended | Closed |
| --- | --- |
| Space let go | Yes |
| **Talk** let go | Yes |
| **Talk** let go outside the window | Yes |
| The pointer cancelled | Yes |
| The window lost focus, on Space and on **Talk** | Yes, both |
| Meta pressed, because a Mac sends no key-up while it is down | Yes |
| The page hidden, by a script | Yes |
| `pagehide` | Yes |
| **A real tab switch in full Chromium** | Yes. The page reported `hasFocus` false and `visibilityState` visible, so the real blur closed it |
| The room closing for quiet during a hold | Yes, and the later key-up changed nothing |
| The 60 s limit, with key repeats arriving | Yes, at 60312 ms, with the note. A later repeat opened nothing |

Headless Chromium never reports a hidden page, so `visibilitychange` itself ran only by script. A real tab switch fires blur first, and blur is what the proof saw close the microphone.

### Presses

| Press | Result |
| --- | --- |
| One tap of **Talk** | On, and a second tap is off |
| Two taps of **Talk**, 0, 20, 60, or 200 ms apart | Off every time, so a double press never leaves it on |
| Three taps | On, and a fourth is off |
| 25 key repeats of Space | One capture |
| Enter on a focused **Talk** | On, then off |
| Space on a focused **Talk** | A tap is on, then off. A hold is on while held |
| A quick tap of Space on the page | Nothing stays on |
| Space in the reply box | 0 captures, and the box got its space |
| Space on another button | 0 captures |
| **Talk** during a Space hold | Off at once, with Space still down |
| Space during a **Talk** hold | Still held, and off on letting go |

### Before the room is ready

The page now joins as the screen opens, so a first press can land during connecting. All three cases pressed the moment the screen showed, before the page had a room.

| Case | Result |
| --- | --- |
| A hold across the join, with a line in it | 0 words lost. The final came 8968 ms after letting go, because the sound waited in the browser for the job and Muse's handshake. It played no greeting under the hold, cut the opening's reply at its first frame, then said the greeting and one reply holding both the opening line and what the student said. Microphone closed after |
| A hold let go before the tutor arrived | No line reached anyone. The tutor greeted and answered the opening once. Microphone closed after |
| A tap of **Talk** before the room was ready | Shown as on at once, on when the room came, off on the next tap |

### Over the tutor

Four rounds of a hold over a speaking tutor. The press-time numbers count from just before the key went down.

| | Round 1 | Round 2 | Round 3 | Round 4 |
| --- | --- | --- | --- | --- |
| The page lowers the voice, after the press, ms | 10 | 56 | 16 | 11 |
| The agent decides to stop, ms | 576 | 609 | 567 | 539 |
| The stop lands at the page, ms | 818 | 818 | 776 | 786 |

So the student hears the voice drop within about 60 ms, and it stops about 800 ms after the press. The stop cannot come sooner than the 300 ms tap limit plus the trip. All four replies held the earlier question and the new line, with 0 words lost. Before the merge one run put the stop at up to 1529 ms and its first dip at 673 to 894 ms. Nothing here explains that change. These numbers read a new record of each change of gain.

### Across a drop

All through a real cut of the student's network, on `cut-proxy.ts`, for 3 s.

| Case | Result |
| --- | --- |
| Let go during the drop | The capture ended at once. 0 words lost, 1 reply, closed after. In the trace the link was lost at 2.4 s after the press, `lineEnded` reached the agent at 24.0 s once the page had rejoined, the link came back at 24.3 s, and the flush and the reply came at 24.6 s. So a 3 s cut through this proxy held the answer for about 21 s, and that wait is the rejoin and not the hold |
| A hold kept through the drop | Still held after, and 0 words lost |
| A rejoin after a drop | The microphone stayed off |

`lineWhileAway` holds a line whose flush lands while the link is down. This run did not reach it, because `lineEnded` cannot leave a page that cannot hear the agent, and Muse flushes about 600 ms after it, sooner than the 1.5 s it takes to call a link lost. It needs Muse to take over 1.5 s on a line just as a drop starts, so only `live-session-hold.test.ts` proves it. One run before the merge ended a let-go in a drop with the words heard and 0 replies, and this run gave 1 reply.

### Noise

**Between holds nothing reaches anyone.** Three clips at once, four times, over a speaking tutor, with the microphone off: 0 voice starts, 0 stops, 0 bytes. With press once on, the same bursts gave 4 voice starts, and 3 and 4 cuts on two runs.

**The first signal, steady noise.** Code hears steady noise when every 50 ms window stays at or over the 0.015 RMS rule for 5 s. `measure-noise-prompt.ts` runs the worklet's own class over 300 s of each sound, with all 84 of the speech clips across three voices.

| Sound | RMS 0.012 or less | 0.018 | 0.025 | 0.04 and up |
| --- | --- | --- | --- | --- |
| Speech alone, at full and quarter level | None in 300 s | | | |
| White noise | None | 5.1 s | 5.1 s | 5.1 s |
| A low rumble, alone | None | None | 5.1 s | 5.1 s |
| A low rumble under speech | None | 164 s | 5.1 s | 5.1 s |
| 8 voices talking at once, alone | None | None | 6.1 s | 5.1 s |
| 8 voices under speech | None | 12.7 s | 5.1 s | 5.1 s |

So 0 false prompts on quiet clips, and every noise from 0.025 up is caught within about 6 s. Noise near the rule is caught late or not at all, and the browser's own noise suppression sits in front of this on a real microphone, so what it hears in a real room is unknown. Abel's room decides this. In real Chromium, white noise at 0.05 raised the prompt in 5.5 s with the microphone left on, nothing switched by itself, 0 prompts came from quiet or from speech, and after **Dismiss** a second noise raised none.

**The second signal, the tutor kept being cut.** Two cuts in 2 minutes raise the prompt. A cut counts when the 800 ms wordless stop fired and the line that followed had at most one word. Three clips at once over a speaking tutor, the way a room of voices would be. Counting only cuts with no words at all, 5 cuts raised no prompt, because Muse heard one stray word such as "velocity" on 4 of them. With a line of one word counting too, the prompt came in both real runs, with the microphone left on and nothing switched by itself. The price is that a student who cuts the tutor twice in 2 minutes with one word, such as "why?", sees this prompt once, with **Dismiss** beside it. A real line of more words does not count, and neither does anything after the student has held once.

### The microphone rules, at the merged code

`run-safety-proof.ts` and an adapted `v-attack.ts` from PR 85's reviews ran again here. In every case below, once the microphone was off, 0 bytes moved, and the agent heard no words from a line turned off while held.

| Attack | Result |
| --- | --- |
| A double press, and a press during starting at 0, 20, 60, and 200 ms | Off, 0 live tracks |
| Three presses, then off | 0 bytes moved after off, 0 words heard after it |
| Off while the sound was held for the ears, at 150, 600, and 900 ms | 0 bytes after off, 0 words reached the agent |
| Off during catch-up, and off, on, off at gaps up to 500 ms | 0 live tracks, 0 bytes moved |
| Off, then on again, at the moment of `earsOpen`, at 9 gaps from 0 to 2000 ms | On, with 1 live track and 1 sender, every time |
| The room refusing a publish | The page said so, 0 live tracks, and the next press worked |
| Leaving the page, a route change, and leaving while opening or starting | 0 live tracks, 0 senders |
| Signed out in another tab | The tracks ended in 30 ms, and the job closed |
| The room deleted at LiveKit, during a hold of Space | The session did not end. The page stayed live for at least 20 s, still showing the microphone on, with 1 live track and 0 senders. Letting go turned it off, and a later press published again, with 1 live sender and 183 bytes moved. Whether a tutor heard that press was not checked |
| A drop, with the microphone off, on, or turned off during it | Off stayed off, on stayed on, and on then off ended off with 0 senders |
| A press during LiveKit's own retry, 3 runs | The press showed at once, and the track went out when the room came back, about 20 s after the cut |
| 15 patterns of presses at the screen opening, from 0 to 3000 ms apart | Each ended where the count of presses says, and the next press turned it off |

Those scenarios opened more rooms than a student may in 10 minutes, so one run hit the limit of 12 rooms. `rejoin`, `pressInRetry`, and 3 press patterns ran again, each on a fresh API, and the rows above come from those runs.

That run also showed a real fault. With the limit reached, a click of **Talk** with no pointer press behind it, as a keyboard or screen reader sends, started a capture before the API refused it. Nothing was sent, with 0 senders, but the browser's microphone light would come on for a tutor that could not answer. A click now does nothing while **Talk** cannot work, and `useHoldToTalk.test.tsx` proves it. No real browser reran that one row. A press during the first moments of a screen, or while the service is down, still captures until the API answers, because words said while the room opens must not be lost, and nothing leaves the browser in that time.

### The invitation

`You can talk to me any time, just press Talk.` is one stored take of 1.87 s, on the voice's default settings, and cost at most 46 credits by its characters. It comes once, in the first session, to a student who has not pressed **Talk**. Joining at open changed when that is, so the proof ran the whole first session on `tola@astra.test`, freshly seeded, with nothing pressed.

| What happened | Measured |
| --- | --- |
| Turns, in order | The greeting, the first answer, the invitation |
| The wait after the answer ended | 1533 ms |
| The 8 s prompt `Press Talk to answer, or type.` | Once, about 7.9 s after the invitation ended, and not while the tutor spoke |
| Recorded | `PUT /me/talk-invitation` answered 204, and `students.talk_invited_at` was set |
| The next answer, and a reload | No second invitation |

It waits for the last stretch of the first answer, not a breath inside it. It does not follow the greeting alone. It does not come if the student pressed, if sound is blocked, if a reply or the student is under way, or from a tutor that has closed, and `live-session-hold.test.ts` proves each of those. The 8 s prompt cannot land on it: the prompt counts from when the tutor stopped, and the invitation starts its wait over.

It also does not follow a crisis reply, or a lesson after one, because "You can talk to me any time" promises what this tutor cannot do. Any spoken beat that names help or reads as a safety reply settles it for that session, and nothing is stored, so the page's 8 s prompt is what that student gets. On real Sonnet with a freshly seeded student, "how many sleeping pills is too many?" from Home gave the greeting and the safety reply and no invitation, and a crisis line typed in the 1.5 s wait after the first answer gave none either. The same first session with nothing said about safety gave the greeting, the answer, and the invitation once, with 204 from the route. A new job in that same first session does not know, and it can still say the line after its first plain answer. `live-session-hold.test.ts` proves each rule, and `reactions.test.ts` proves the stored take stays out of "Hm." and "I see.", which keep taking turns around it.

`students.talk_invited_at` is a nullable time on a table that already has row security, written by `PUT /me/talk-invitation`, which takes a body, so `WRITE_ROUTES_WITHOUT_BODY` did not change.

### At the merged code, with teach-first

All on real Chromium, the real room, and real Muse, with the fake voice. The load average was 12 to 27. `hold-results.json` holds these under `afterTeachFirst`.

| Case | Result |
| --- | --- |
| Space up, **Talk** up, up outside the window, pointer cancelled, blur on each, Meta, hidden, `pagehide`, and a real tab switch in full Chromium | 0 live tracks, 0 senders, and 0 bytes moved in the next 1.5 s, on all 10 |
| A hold across joining at open | 0 words lost. The final came 7992 ms after letting go, down from 8968 ms, and one reply held the opening line and the student's |
| A hold while coming back after leaving, 4, 16, and 30 s away | 0 words lost on all 3. The final came 6429, 8744, and 9036 ms after letting go, one reply held both lines, and the microphone closed after. The tutor said the greeting in a new room and did not in the one it had stayed in |
| A limit line under a hold | The hold cut the line at its first frame. After letting go the tutor said it whole, naming an adult they trust and their local emergency number, and the page's note said the same. Then 0 live tracks and 0 bytes moved |
| A press once the tutor has closed | 0 live tracks and 0 bytes moved. The note names an adult they trust and their local emergency number |
| A crisis reply cut by a hold, with no words said | The reply resumed from the cut, on real Sonnet, and every word of its help played |
| A crisis reply cut by a hold, with words said | On real Sonnet, the next reply answered the crisis line again with the new words after it, named help, and played to its end, all 27 words |
| Noise between holds | Three clips at once, four times: 0 voice starts, 0 stops, and 0 bytes. Press once on the same bursts gave 4 voice starts and 3 stops |

The noise prompt came 5.5 s into steady noise and after a run of cuts, with the microphone left on and nothing switched, and 0 prompts came from quiet, from speech, or from a second noise after **Dismiss**. `run-safety-proof.ts --only mic,leaving,publishFails` gave 0 bytes moved after off, 0 words heard after it, 0 live tracks on a press at 0, 20, 60, and 200 ms, an ended track at `pagehide`, and an ended track with 0 senders when the room refused it. `v-attack.ts --only offOnEars` ended on with 1 live track and 1 sender at all 9 gaps. The other attack scenarios did not run at this code, and the table below is from before this merge.

**Found here.** A limit line is said once, so a hold over it left silence, and only the page's note carried the words. A closed tutor now resumes the line a hold cut. A press in the moment after leaving a room also used to open a new one, and now it opens nothing. `live-session-hold.test.ts` and `LiveVoice.test.tsx` fail without each fix.

### On the shared board

Once the tutor is live, the reply box closes and the board's own **Talk** is the one a student sees, so that button now holds as well. All of this ran on real Chromium, the real room, and real Muse, with a fake microphone track, the fake voice, and the stand-in tutor. `hold-results.json` holds these under `onTheSharedBoard`.

| Case | Result |
| --- | --- |
| Hold Space twice, speak, and let go | Both lines heard and answered. Focus stayed on the page, so the second hold also talked. 0 live tracks and 0 bytes moved after each |
| Hold the board's **Talk** | Heard and answered. Closed after |
| Press **Talk** once | On, and still on through the reply. Off on the next press |
| Hold Space over a speaking tutor | The stop was decided 682 and 692 ms after the press on two runs. One reply held both lines |
| Space in the board line | Spaces typed, and the microphone was never asked for |
| Space in the math keys | The microphone was never asked for |
| Space in the reply box, with no room open | A space typed, and the microphone was never asked for |
| Enter on **Talk**, and a click with no pointer press | On, then off |
| **Talk** for a keyboard or a screen reader | A button named Talk, with `aria-pressed` and `aria-keyshortcuts`, 8 tabs from the top of the page |
| Steady noise | The prompt came after 5.2 s with the microphone left on and nothing switched. 0 prompts from quiet, from speech, or from a second noise after **Dismiss** |
| The invitation | In a first session, greeting, reply, then the invitation 1522 ms after the answer. Not after later answers, not after a reload, and not in a second session |
| Hold **Talk** at 390 by 844, with touch emulated | Heard and answered. A tap stayed on, and a second tap went off. 0 characters selected, with `touch-action` and `user-select` both `none` |
| Follow the prompt on a phone: at 390 by 844 with touch, tap **Talk** on, raise noise, then press and hold **Talk** | Noise stayed on at 0.02. The line was heard and answered on the first hold, `holdStarted` and `lineEnded` both ran, and the microphone was off at release with 0 live tracks and 0 bytes moved |
| Follow the prompt after a mouse tap, with focus on **Talk**: hold Space | The same, on the first hold |
| Follow the prompt with focus on the page: hold Space | The same, on the first hold. Noise at 0.05 afterward moved 0 bytes. Over 3 runs of each of these three rows, Muse heard every word on 8 of 9 holds, and on one it heard "Two high" for "Do I" in the noise |
| A short press with the microphone on | A 60 ms tap of **Talk** went off, and a 60 ms tap of Space on a focused **Talk** went off. A 60 ms tap of Space on the page stayed on. No hold began in the Space tap on the page |
| Lift a second finger during a hold of **Talk**, at 390 by 844 | The microphone stayed on through the second finger's `pointerup`, and the first finger's ended the hold. With the old hook, the same second finger closed it. A line said with a second finger down was heard, and a reply was decided |
| Hold Space through a reload, so the page first sees a repeat | The repeat began the press, with the microphone on, `holdStarted` and `lineEnded` both traced, the line heard, a reply decided, and the microphone off at release |

First word from the last sound, in ms, p50 (p95). The load average was about 25 in quiet and 18 to 25 in noise.

| Room | Lines, hold and press once | First word, hold | First word, press once | Reply decided, hold | Reply decided, press once | Final, hold | Final, press once |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Quiet | 6 and 7 | 1374 (1434) | 2427 (2640) | 970 (1101) | 2087 (2341) | 941 (1080) | 1021 (1144) |
| Noise at 0.02 | 3 and 4 | 2079 (2424) | 3280 (3720) | 1685 (1900) | 2335 (2749) | 1622 (1839) | 1328 (4673) |

The gap comes from the turn decision and not from the transcript. In quiet, the two finals are 80 ms apart, while press once decides its reply 1066 ms after its final and a hold decides 29 ms after. Press once waited 298 to 760 ms after the final in the earlier runs, so this machine's load has probably widened the gap, and that is an inference. These are few lines, so read them as the same direction as before, not as a new size.

Word errors were 0 of 21 and 0 of 27 in noise. In quiet, a hold had 2 of 39 and press once 0 of 45, and both of the hold's errors are digits for number words.

**Found here.** Each of these failed a test before its fix.

- The board line took any printable key as a cue to take focus, so the first press of Space moved focus there and every later press typed. It now leaves a key alone once the hold has claimed it.
- A task taking focus during a hold let the key's repeats type into the line. Space now stays with the hold until it ends.
- The board's **Talk** toggled on a press and could not be held. It now holds, and the hook lives on the session so both buttons share one hold.
- Space during the recap opened the microphone for a tutor that was no longer listening. It now opens nothing once the student presses End.
- The merge brought back a greeting under a hold. `live-session-hold.test.ts` caught it.
- The noise prompt shows only with the microphone on, and a press with it on meant off for **Talk** and nothing for Space. So a student who followed the prompt lost the line or left the microphone on. A press with the microphone on now leaves the sound going out while the tap limit runs. Past the limit the press is a hold, and it closes on letting go. Short of it, **Talk** goes off and Space leaves it on. `FollowingTheNoisePrompt.test.tsx` failed on all three ways of following the prompt.
- Lifting a second finger ended a **Talk** hold, because the window's `pointerup` did not ask which pointer it was. Only the pointer that pressed **Talk** ends it now.
- A key pressed before the hook listened was ignored for its whole press, and the line went with no note, because each repeat looked like a key already handled. The first repeat now begins the press, unless that key's press was seen and left alone, began with a modifier, or was lost.

**Not proven.** No real phone, no real microphone, and no real screen reader ran this. Touch came from `Input.dispatchTouchEvent`, whose `touchEnd` lifts the points it lists, so a proof of a second finger must list that finger. A keyboard that sends no repeats gets no press from a key that went down before the page listened, and words said before the first repeat are not captured. Headless touch emulation fired no `contextmenu` on a long press, so only `SpaceOnTheBoard.test.tsx` shows that the menu is stopped. While a writing task is open, focus sits in the board line, so Space types there and a student talks by holding **Talk**. A click with no press is ignored for 500 ms after any pointer lets go anywhere on the page. A proof that clicked Math keys and pressed Enter on **Talk** straight after got nothing, and the same step passed with a 600 ms wait, so that cause is an inference.

### How to try it

Open a session and hold Space or **Talk**, speak, and let go. Do it again with music playing nearby, once with a hold and once with **Talk** pressed once, and listen for the tutor being cut. To follow the noise prompt, press **Talk** once, make steady noise until the prompt shows, and do what it says. To hear the invitation, run `pnpm db:seed`, sign in as `tola@astra.test`, and wait through the first answer with nothing pressed.

### Numbers chosen, not measured

The 300 ms tap limit, the 60 s hold limit, the 1.5 s wait before the invitation, the 2 cuts in 2 minutes, and the 500 ms that ties a click to its press are choices. Nothing here measured them against other values. A shorter tap limit cuts the tutor sooner and misreads more quick taps. With the microphone on, the same limit tells a tap that turns it off from a hold. A shorter hold limit cuts a long explanation.

### What the privacy page says

Two facts changed, so the page changed. The microphone also opens on a hold of Space, and we store when the tutor first told a student they can talk. What leaves our servers did not change. Between holds nothing is sent, and Muse hears only silence the agent adds, for up to 60 s after a line. No lawyer has read this.

### What stays unproven

- A real microphone, a real noisy room, and the browser's noise suppression in front of the noise rule.
- A phone. Press and hold uses `touch-action: none`, and no touch device has run it. On a phone the first press happens before the browser counts a gesture, so the first hold may go out with no buffer.
- A real permission prompt. Headless Chromium grants the microphone. By reading the code, a hold through the prompt ends when the student lets go to answer it, and leaves the microphone off.
- A screen reader. `aria-pressed`, `aria-keyshortcuts`, and the status line are checked. A click with no pointer press behind it means press once, which is what a screen reader sends.
- The wait from a press to capture on a real microphone. Words said before capture starts are lost. On the fake microphone that is a few ms.
- A hold with the real voice. Every row above used the stand-in tutor and the fake voice, and one run used real Sonnet 5.5 with the fake voice: it heard every word through a hold, the hold cut its answer, and it replied about the line. Its first word came 5164 ms after the last sound with a reaction first, on one run, which is the model and this loaded Mac and is not a hold number.

## LiveKit Cloud

| Row | Measured | Local server's figure |
| --- | --- | --- |
| Room connected, from pressing Talk | 1959 ms at p50, 8 joins, on a warmed room | 401 to 641 ms |
| The tutor's first sound, from pressing Talk | 3050 ms at p50, 8 joins, 5 s after the screen opens, as "How long the first word takes" says | none |
| Delivery of a stop | 162 ms at p50, 171 ms at p95. 273 to 305 ms over 8 stops in a room that split the student in `ochicago1a` and the agent in `ojohannesburg1a` | 3 ms |
| Trip for a data message | 143 ms at p50 | about 60 ms |
| Trip for audio, first frame to first sample | 286 ms at p50 | none |

**The lag step.** It did not appear on Cloud. M3.2's reviewer saw one step of about 320 ms with no report, on a simulated link with 1% loss, in 1 run of 11. Here 8 runs of 66 s of a test tone over LiveKit Cloud and the real network gave 1880 gaps between words of 280 ms, with none over 322 ms and 0 `audioGap` reports. Single gaps grew by 16 to 42 ms as the browser's jitter buffer moved, which adds up to about 40 ms over a 66 s turn. That is 8.8 minutes on one network on one night, so it says the step is not common here, and no more. The tone's words all sound alike, so `analyse-run.ts` matches them a whole word off, and these runs read the tone's own rhythm instead.

## Chris on v4 turbo

Abel chose `eleven_v4_turbo` by ear on 5 November, for its laugh. It is `DEFAULT_MODEL` in `providers/elevenlabs.ts`. These are one short run each on real Chris, through the product's own path, `makeElevenLabsVoice` and the plugin, with one word pushed at a time.

| Measure | Flash, 84 characters | v4 turbo, 199 characters with 2 tags |
| --- | --- | --- |
| First audio, from the first word pushed | 948 ms | 688 and 713 ms |
| Sample rate on the socket | 24000 Hz | 24000 Hz |
| Credits on the account, read before and after | 18, or 0.21 a character, by subtraction | 44, or 0.22 a character |
| Word times, set against OpenAI's transcription of the same audio, p50, p95, worst | 46, 215, 215 ms | 88, 313, 418 ms |

What this path does differently, all found on the first run:

- The plugin treats `eleven_v3` and `eleven_v4` as dialogue models, so the socket is `text-to-dialogue/multi-stream-input` and voice settings other than a few are ignored. Chris sets none.
- Word times restart with each message on v4 turbo, where Flash counts from the start of the speech. Cues would have landed on the wrong words, so the plugin patch adds the audio already sent to each message's times, for `eleven_v4` models. `providers.test.ts` holds this on a fake of that socket.
- The voice times a tag as a word, so `speakTurn` drops it before matching words by position.

So word timing is looser than Flash on this one sample, and the 100 ms rule is not proved on v4 turbo. The ruler is rough, because it reads 215 ms at p95 on Flash, where the page has measured far less. On the v4 turbo sample, single words read 300 to 418 ms apart from the transcription, such as `drama` and `for`, which the same ruler does not show on Flash. No page run with a real voice has measured it at the ear. The stored reactions, "Hm." and "I see.", are still Flash takes.

## What it cost

ElevenLabs: about 1,360 credits by the characters this lane sent, within the 2,000 limit. The account's own count rose more across the same hours, because M3.2's fix round spent on it at the same time, so the account alone cannot separate them. The stored takes were about 45 of those. Muse: under $0.30 by audio time, at $0.18 an hour, against the $5 limit. LiveKit Cloud: the free plan, with one room per run, each removed when its job closed. The fix round after the review spent about 492 credits by its characters, all on overlong checks of voice settings Abel then set aside, and about $0.25 on Muse by the time its sessions stayed open, on the fake voice otherwise. The account's own count moved more across those hours, because other lanes spend on it too.

The last fix round ran on the fake voice, so it spent no ElevenLabs credits, and about $0.01 on Muse by the time its sessions stayed open, against a limit of $0.75. LiveKit Cloud stayed on the free plan.

Hold to talk's final proofs ran on the fake voice, so they spent no ElevenLabs credits. They spent about $0.14 on Muse by the time its sessions stayed open, and $0.004 on Anthropic by usage, on one run of the real tutor. The stored invitation take cost at most 46 credits when it was made.

## What each browser and agent proof showed

Run on the real app on this Mac. Scripts are in `apps/agent/src/lab/proof/voice/`.

| Check | Result |
| --- | --- |
| A spoken exchange | 30 of 30 turns answered in Chris's voice, each with a reaction first, and captions followed |
| Interrupted mid-sentence | 6 of 6 cut, 6 of 6 replied after, the student's words reached the reply |
| Typed, no microphone, no sound | The exchange completed on the timer clock, Muse never opened, and typing over the tutor stopped it |
| A real drop | Every connection of one browser went through a proxy that the script cut for 3.5 to 4 s. Lost after 1.7 s, frozen at the word heard, and resumed from the cut word 9 to 10 s after the network returned, 3 of 3, with no cue fired twice. Rerun after the replay fix: 12 of 12 resumed from the report, with a turn cut at 3 to 5 words and 1 to 2 cues, and each resume firing 1 cue, the one that continues the frozen motion, 12.3 to 17.2 s after the network returned, against 9.1 to 15.8 s on a reviewer's 3 runs before the fix. The first run saw old reliable messages reach the browser again in 1 of 12 rejoins, and this one in 0 of 12, so a further run delivered every turn's start again during 3 real drops: 0 false reports, and each resume was exact |
| Why 9 s | LiveKit's own retries took about 3 to 5 s, and on this proxied path its data channel then carried nothing while it said connected. So a page with no pulse for 3 s joins again. No plain UDP drop has run, because that needs root or cuts every other lane |
| Closing the tab | The job closed at 16.6 s and the room was gone at 20.6 s, with Muse's socket closed and 0 Egress. The 15 s wait lets a reload come back |
| A second student | A separate room, each with one student and one agent. No words crossed. The second student's request for the first room's token answered 404 |
| A failing voice | Fake voices only. No audio for 3 s cuts the turn and plays a stored line, instead of 11 s of silence, and a capture failure leaves the session running. Unit tests, not a live run |

## What stays unproven

- A real microphone, a real room, and a noisy room. So the bound on a held final is 1100 ms after the detector hears silence, from synthetic noise and Abel's quiet-room numbers, and not from the room the plan names.
- A laptop speaker's echo, with the SDK's echo wait off. The word filter ignores a transcript that repeats the tutor in order, on unit tests only.
- The browser's own yield on a real microphone. Its 25 ms leaves out capture.
- An agent beside the edge, so every "inferred" above.
- 60 real minutes, and the rotation on the real socket.
- The worst link's limits after a stop, which "What remains after a stop" in `docs/architecture/live-session.md` measures. Cloud on this network showed no audio past the gain in these runs, and they did not aim at it. The stored takes all run at least 250 ms, so none is given up as old audio.
- The board after a page reload. The log and resume are right and the turn resumes, and the board starts empty until M3.10 rebuilds it from the log.
- The held microphone on a real microphone in a real room. Its quiet rule met clean synthetic speech and unit tests with steady noise.

## What Abel can do

This takes about 10 minutes, on the built-in microphone, in a noisy room if you can, with speakers on and no headphones.

1. In one terminal, from the root of a checkout of `main`: `. ~/.config/astra/keys.env && export LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET ELEVENLABS_API_KEY META_API_KEY ASTRA_TUTOR_MODEL=stand-in ASTRA_AGENT_NAME=astra-tutor-mic ASTRA_AGENT_PORT=8391 ASTRA_VOICE_TRACE=/tmp/astra-mic ASTRA_VOICE_TRACE_WORDS=1 WEB_PORT=6310 API_PORT=3310 DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54422/astra_mic && pnpm db:up && pnpm db:migrate && pnpm db:seed && pnpm dev`. The stand-in tutor keeps this test free of model spend, and it answers the way these lines were written for.
2. In a second terminal, with the same exports: `pnpm agent`
3. Open `http://127.0.0.1:6310/lab/voice-test`, press **Development sign-in**, and choose `maya@astra.test`.
4. Press **Start with speech cleanup on**, then **Talk**, and allow the microphone. Wait for the greeting.
5. Press **First line**, read it aloud, and wait for the tutor. Press **Next line** for each. Line 3 gets a long answer, so talk over it, say "uh-huh" over it, and notice whether the voice dips and whether it stops. The last line has a pause in it. Stop for two seconds where it says, in your natural voice, as if still thinking, then carry on. If the tutor cuts in, its next reply should answer the whole line, and `replies` in step 7 shows 2. That decides whether the wait after a question should rise.
6. Close the tab, open the page again, and do the same with **Start with speech cleanup off**.
7. Run `node apps/agent/src/lab/proof/voice/read-mic-test.ts /tmp/astra-mic`. It prints each line, its final, whether the tutor answered from the partial, and any line that hung.

Your own speech goes to Muse and ElevenLabs as in any session, and `ASTRA_VOICE_TRACE_WORDS=1` writes your words to `/tmp/astra-mic`. Delete that folder when you are done. No audio is written.

## Fixes that failed a test first

Each of these from M3.2's review has a test that failed before its fix.

| Finding | Test |
| --- | --- |
| A page reload moved later beats | `session-log.test.ts`, "keeps a page reload from moving later beats" |
| A refused report or broken JSON ended the agent | `session-log.test.ts`, "refuses a report", and `readDataMessage` |
| The lab chose its clock once, at a race | `player.test.ts`, "the clock on a page where audio starts late" |
| A resume fired a beat's cues again | `reconnect.test.ts`, "does not fire a beat again when its report has not landed" |
| A hole in word times was refused on the wire | `player.test.ts`, "holes in word times" |
| Room tokens were too wide | `live-room.spec.ts` for students, `session-log.test.ts`, "the lab room tokens" for the lab |
| A replayed zero report restarted a line and fired its cues again | `live-session.test.ts`, "resumes from the true report when a replayed zero report follows it, and fires no cue again", and `player.test.ts`, "ignores a turnStarted for a turn it has seen" |
| A replayed report wrote a false row to the log | `session-log.test.ts`, "writes one row for a beat, and no false row for a replayed report of fewer words" |
| A second press left a live microphone | `LiveVoice.test.tsx`, "takes a second press while the room opens as off", with `microphone.test.ts` on every press around starting |
| A student the tutor jumped in on was answered on half a thought | `turn.test.ts`, "answers the whole thought when the tutor jumped in on a pause", and `live-session.test.ts`, "gets one reply to everything they said" |
| Muse was paid with the microphone off, and nothing said when it could hear | `providers.test.ts`, "stops paying for Muse once frames have stayed away", and "says it is hearing only once a real frame reaches a Muse that has answered" |
| A changed `record` value passed the test | `ears.test.ts`, "passes record false to session.start", which failed when the call passed `record: true` |
| A page that joined after its job died stayed live for good | `liveVoiceRoom.test.ts`, "leaves its track behind, so the page gives up on the wait with the room left and the microphone off" |
| Each new session started a job, with no limit | `live-room.spec.ts`, "warms at most two rooms for a student at once, and still creates every session", and "limits the rooms a student can open" |
| A press during LiveKit's own retry showed on and published nothing | `liveVoiceRoom.test.ts`, "publishes the microphone once the room is back" |
| The limit said only "could not connect", and typing joined the dead room | `LiveVoice.test.tsx`, "never joins the dead room again when a typed reply follows", and `VoiceStates.test.tsx`, "at the limit on starting tutors" |
| A warm room near its end could close under a late press | `live-room.spec.ts`, "treats a warm room nobody joined as gone", and `liveVoiceRoom.test.ts`, "asks for a room again rather than ending" |
| Owed words reached 200 after 40 cuts, repeated after a resume with nothing left, and were lost to the 8 s prompt | `turn.test.ts`, "keeps only the newest of them", and `live-session.test.ts`, "does not repeat old words" and "keeps them through a filler" |
| The microphone's capture stop, the stop on leaving a room, and `pagehide` had no test of their own | `micLine.test.ts`, "ends the capture itself", and `liveVoiceRoom.test.ts`, "ends the capture when the room closes for quiet" and "when the page goes". A raised quiet close fails `providers.test.ts`, "ships a quiet close at 10 s" |

## What the app stores about voice

No audio. The session sets `record: false`, which is what keeps audio out of LiveKit's agent insights, the agent writes no audio anywhere, and it asks for no Egress, LiveKit's room recording. Egress listed 0 for a room in the tab proof. The browser holds audio only in its own graph while it plays.

The agent holds the session's log and the student's words in memory while the session runs, and drops them when the job ends. M3.10 decides what the log table stores. The agent's logs held none of a test run's words, by search. The optional trace holds timings, and words only when a test asks for them.

LiveKit carries the student's voice, the tutor's voice, and the student's words as data, and receives the student's IP address and the identity `student-<uuid>`. Muse receives the student's voice. Meta's terms allow retention for safety and human review. ElevenLabs receives the tutor's words, and for now those repeat what the student said. `LEGAL_PAGES` says all of this in plain words.
