# Live voice: what the real path measured

This is the record M3.6 owes, and PRD test 4's measurements. `voice-results.json` holds the numbers behind every table, and `turn-rows.json` holds the 30 real turns row by row. `node apps/agent/src/lab/proof/voice/read-turn-rows.ts` recomputes their figures.

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
| Decision 4's pause | **Differs from the design.** The tutor jumped in on a 1.5 s pause after a question, 3 of 3, on a synthetic voice. This row first blamed punctuation in real finals, which was wrong, because `inference.TurnDetector({version:'v1-mini'})` predicts from audio and takes no text. A reviewer ran 3 rounds each. The stock clip with real punctuation jumped 3 of 3, at 1220 to 1341 ms. The same audio with punctuation stripped jumped 3 of 3, at 925 to 1161 ms, scoring 0.38 to 0.52 against a threshold of 0.36. The same opening words cut from inside a longer sentence jumped 0 of 3, scoring 0.09 and 0.11, and waited on the 2 s cap. So the clip's finished-sounding tone caused it. The tutor stops on the student's next word. Its second reply carried only the 8 new words, 6 of 6, so a reply cut before it finished now still owes its words, and the rerun carried both halves 3 of 3 on the fake voice. Left for Abel, with the reviewer's judgment and the coordinator's: do not raise the floor on this evidence. If a real voice still gets cut, raise the wait only after a question, which costs other turns nothing. The microphone test has a line for it |
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
| Type, wait for the answer, press Talk, speak 300 ms later, into a Muse that has never opened | Lost the start of the line | 12 of 12, over two runs. On the last run Muse answered in 1185 to 2011 ms, and the browser heard `earsOpen` 2247 to 3200 ms after the press | 1004 to 2069 ms on the last run. 1195 to 2953 ms on the first, and 4499 ms once, when Muse held its final and the tutor answered from the partial 1431 ms after the voice ended |
| Off for 3 s and on, speak at once, Muse still open | Lost the first word 1 of 3 | 6 of 6, over two runs | 1797 to 2029 ms on the last run, 1603 to 1910 ms on the first |
| Off for 14 s and on, speak at once, Muse closed and opening again | Not measured, because Muse stayed open and paid | 6 of 6, over two runs | 3214 to 6456 ms on the last run, 2847 to 3635 ms on the first |

So a line spoken into the wait is answered later, by about what the wait took, and only that once. The usual final stays at about 791 ms at p50, because the line has caught up by then. A loud room is the open risk: nothing above an RMS of 0.015 counts as quiet, because losing a soft word is worse than running late, so a room louder than that catches up only in its quiet moments.

**Muse with the microphone off.** The session closes 10 s after its last frame, and a press or a rejoin opens it again, so a tab left with the microphone off pays Muse nothing. The 10 s outlasts LiveKit's own retries of 3 to 5 s.

## The microphone, on real Chromium

Real `getUserMedia` reading a fake capture file, on real WebRTC, with the bytes from each sender's own stats. `run-safety-proof.ts --only mic,leaving,publishFails,noDevice` runs it.

| Case | First run of this PR | Now |
| --- | --- | --- |
| Talk twice, 200 ms apart | 2 live tracks and 2 senders | The second press means off. The microphone is off, with 0 tracks captured and 0 senders |
| Then one off press, still talking | `mic` off and `aria-pressed` false, with tracks `live` and `ended`, sender bytes rising from 36404 to 49705 in 3 s, and Muse finals and turns still firing | Three presses gave 1 track and 1 sender, moving 18755 bytes in 3 s. One off press: track `ended`, sender removed, 0 bytes moved in 3 s, and nothing heard by the agent from 2.5 s after the press |
| A press 0, 20, 60, and 200 ms after pressing on | Not run | Each ended off, with 0 live tracks and 0 live senders |
| The room refuses the track | Track left captured, and the page said the browser refused | The track is `ended`, with 0 senders, and the page says the microphone could not start |
| The page leaves | Not run | `pagehide` ended the track before anything could wait, and leaving the session screen inside the app ended it too |
| No microphone on the device | "Your browser did not allow the microphone" | "We could not find a microphone on this device" |

One loop moves the microphone toward what the student last asked for, so a press only changes that wish, and a second capture cannot start while one is open or opening. The button shows the press at once, so a room still opening cannot look like a press that missed.

## Rooms, tokens, and a tutor that has gone

**Only the API calls the tutor in.** A token cannot be taken back, and one that named the agent could start a job for a finished session, so tokens no longer name it and last 2 minutes rather than 10. The API opens the room and calls the tutor in, for a session that has not finished. `run-safety-proof.ts --only finished` ended a session from outside its open page. The page said the connection had ended 2 ms after the finish answered, the job closed in 2841 ms, and a new token answered 409. The old token could still join for its last moments, into an empty room, and started no job, 1 job before and 1 after. That join reaches LiveKit and nothing else, and it ends when the token does.

**Each room gets a new name.** On LiveKit Cloud, for at least 12 s after a delete, a create of the same name answered with the old room and called no one: at 1, 3, 6, and 12 s it did, and at 25 and 50 s it did not. So `session-<id>-<8 hex>` is new each time, and the API finds a session's open room by listing rooms and matching that start, so a rejoin or a reload finds its tutor. That list is every room in the project, which is fine at this size. A later PR can store the name on the session.

**A job that dies.** It used to leave the page flipping between live and reconnecting, each rejoin minting a token and keeping the room alive. A killed job now ends in a clear message: the page said `reconnecting` from 3292 ms and gave up at 19778 ms, after 3 tokens and none in the next 8 s, with the microphone off. **Try again** closes that room and opens a new one, and the tutor was back in 5709 ms and answered. It starts fresh, without what was said so far, and the message says so. LiveKit would restart a crashed job by itself after about 25 s, measured once, and a tutor who has forgotten the lesson with no word why is worse than saying so, so the room asks it not to.

**A quiet room.** `QUIET_ROOM_LIMIT_MS` in `live-session.ts` is 10 minutes with no student speech or typing, no board action, and no tutor speech. A minute before, the page says so and offers **Keep the room open**. At the limit the page says why, the job ends, and **Open the room again** brings a new tutor. QUIET_RUN_GOES_HERE

## LiveKit Cloud

| Row | Measured | Local server's figure |
| --- | --- | --- |
| Room connected, from pressing Talk | 1273 ms at p50, 2063 ms worst, 5 joins | 401 to 641 ms |
| The tutor's first sound, from pressing Talk | 3788 ms at p50, 7469 ms worst, over 5 joins with the tutor named in the token. **5383 ms at p50, 5810 ms worst, over 8 joins since the API opens the room**, on the fake voice both times | none |
| Delivery of a stop | 162 ms at p50, 171 ms at p95. 273 to 305 ms over 8 stops in a room that split the student in `ochicago1a` and the agent in `ojohannesburg1a` | 3 ms |
| Trip for a data message | 143 ms at p50 | about 60 ms |
| Trip for audio, first frame to first sample | 286 ms at p50 | none |

So a session's first word misses PRD section 6.3's 3 s at p50 from pressing Talk. A worker with an idle process takes about 2.3 s to start a job, and 6.4 s on one join. Since the API opens the room, a first word takes about 1.5 s longer, because creating a room took 1286 ms on Cloud, and that wait now comes before the job is called, where before it ran beside it. That is the cost of a tutor no token can call in, and safety comes first here. M3.10 owns this number, and opening the room when the session screen loads is its first lever.

**The lag step.** It did not appear on Cloud. M3.2's reviewer saw one step of about 320 ms with no report, on a simulated link with 1% loss, in 1 run of 11. Here 8 runs of 66 s of a test tone over LiveKit Cloud and the real network gave 1880 gaps between words of 280 ms, with none over 322 ms and 0 `audioGap` reports. Single gaps grew by 16 to 42 ms as the browser's jitter buffer moved, which adds up to about 40 ms over a 66 s turn. That is 8.8 minutes on one network on one night, so it says the step is not common here, and no more. The tone's words all sound alike, so `analyse-run.ts` matches them a whole word off, and these runs read the tone's own rhythm instead.

## What it cost

ElevenLabs: about 1,360 credits by the characters this lane sent, within the 2,000 limit. The account's own count rose more across the same hours, because M3.2's fix round spent on it at the same time, so the account alone cannot separate them. The stored takes were about 45 of those. Muse: under $0.30 by audio time, at $0.18 an hour, against the $5 limit. LiveKit Cloud: the free plan, with one room per run, each removed when its job closed.

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
- What the tutor says when the model is real. This is a stand-in.
- Ten real quiet minutes. A short limit stood in for them.
- The held microphone on a real microphone in a real room. Its quiet rule met clean synthetic speech and unit tests with steady noise.

## What Abel can do

This takes about 10 minutes, on the built-in microphone, in a noisy room if you can, with speakers on and no headphones.

1. In one terminal: `cd /Users/abel/startup/astra-worktrees/m3-6 && . ~/.config/astra/keys.env && export LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET ELEVENLABS_API_KEY META_API_KEY ASTRA_AGENT_NAME=astra-tutor-m3-6 ASTRA_AGENT_PORT=8391 ASTRA_VOICE_TRACE=/tmp/m3-6-mic ASTRA_VOICE_TRACE_WORDS=1 WEB_PORT=6310 API_PORT=3310 DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54422/astra_m3_6 && pnpm dev`
2. In a second terminal, with the same exports: `pnpm agent`
3. Open `http://127.0.0.1:6310/lab/voice-test`, press **Development sign-in**, and choose `maya@astra.test`.
4. Press **Start with speech cleanup on**, then **Talk**, and allow the microphone. Wait for the greeting.
5. Press **First line**, read it aloud, and wait for the tutor. Press **Next line** for each. Line 3 gets a long answer, so talk over it, say "uh-huh" over it, and notice whether the voice dips and whether it stops. The last line has a pause in it. Stop for two seconds where it says, in your natural voice, as if still thinking, then carry on. If the tutor cuts in, its next reply should answer the whole line, and `replies` in step 7 shows 2. That decides whether the wait after a question should rise.
6. Close the tab, open the page again, and do the same with **Start with speech cleanup off**.
7. Run `node apps/agent/src/lab/proof/voice/read-mic-test.ts /tmp/m3-6-mic`. It prints each line, its final, whether the tutor answered from the partial, and any line that hung.

Your own speech goes to Muse and ElevenLabs as in any session, and `ASTRA_VOICE_TRACE_WORDS=1` writes your words to `/tmp/m3-6-mic`. Delete that folder when you are done. No audio is written.

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

## What the app stores about voice

No audio. The session sets `record: false`, which is what keeps audio out of LiveKit's agent insights, the agent writes no audio anywhere, and it asks for no Egress, LiveKit's room recording. Egress listed 0 for a room in the tab proof. The browser holds audio only in its own graph while it plays.

The agent holds the session's log and the student's words in memory while the session runs, and drops them when the job ends. M3.10 decides what the log table stores. The agent's logs held none of a test run's words, by search. The optional trace holds timings, and words only when a test asks for them.

LiveKit carries the student's voice, the tutor's voice, and the student's words as data, and receives the student's IP address and the identity `student-<uuid>`. Muse receives the student's voice. Meta's terms allow retention for safety and human review. ElevenLabs receives the tutor's words, and for now those repeat what the student said. `LEGAL_PAGES` says all of this in plain words.
