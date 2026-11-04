# The live session

Status: approved by Abel on 3 November 2026, who asked for a modular design so providers and models can be switched later. Abel chose the vendors the same day: ElevenLabs for the voice, Meta's Muse Voice Transcribe for transcription, and LiveKit Cloud with our own accounts. No proof here has run either new vendor. Only types, parsers, their tests, one lint rule, and throwaway proofs exist. A separate speed test then measured the real vendors from Abel's Mac on a West African network, on synthetic speech. Its figures are labeled as that. Abel then answered the choices it reopened, on 3 and 4 November, and "Decided since this merged" lists them. `docs/plans/mvp.md` now carries the changes, and it leads where this document and the plan differ.

## Decide here

**What you agreed to.** The tutor writes one script with each drawing placed inside the sentence. The agent sends the words to the voice and the drawings to the browser. The browser counts the samples of the tutor's own audio and fires each drawing on its word. If the voice falls behind, the agent says so, and the count skips that silence. When the student speaks, the tutor lowers its voice within about 200 ms and cuts off mid-word on the first real word. "Uh-huh" lowers the voice too, at 154 to 166 ms and for 833 to 902 ms on a reviewer's run with fakes, and does not cut it off, even over a question. The browser reports what it played, and that report becomes the log, the replay, and the note to the tutor. It runs on Node and LiveKit, with the voice, the transcriber, and the model each behind an adapter we own. Every number comes from runs with fake vendors unless it says otherwise, so "Still unproven" is part of the deal. "What changes in the plan" lists every change.

**New since you approved: the agent's `audioGap` report.** What you approved had the browser work out a stall alone. That failed, as "How a drawing lands on its word" shows, so the agent now reports each stall. This changes the mechanism and not the promise, the money, or the vendor. During a stall the clock now depends on the agent and the data channel. M3.2 gains a small publisher, and M3.6 gains the report in `ttsNode`. On the runs so far it beats the rule you approved: with fakes, a 500 ms stall fired at a p95 of 8 ms against 495 ms.

**New since you approved: real vendor numbers.** A speed test on 3 November measured the steps of a reply from Abel's Mac on a West African network, on synthetic speech, on the vendors' own sockets and not through this design. Inferred first sound on the best row is about 2.1 s at p50 and 3.1 s at p95, or about 1.6 and 2.6 s with this network removed, against V1's 800 ms and 1.5 s. Flash and Turbo send word times in the same message as their audio, not ahead of it. Muse's first partials came at a p50 of 966 ms, not the fake's 674 ms. "The time budget" has the figures and their limits.

**Decided since this merged.** You made these calls after this document merged, and the rest of it now reads them as settled.

- Muse stays for transcription, after your real microphone test, with a guard for held finals in M3.6.
- Chris is the voice, ElevenLabs voice id `iP95p4xoKVk53GoZ742B`. You chose him on 4 November in place of Casey, by ear. He stays on Flash unless you say otherwise.
- Sonnet 5.5 is the tutor, with code reacting first and a timeout for stalls. There is no talking router for now.
- Two perf numbers replace V1's rule. A first reaction under 200 ms from code, and a first real word as fast as the vendors allow.
- The shared board is M3.12, between M3.7 and M3.10, and M3.11 narrows to ink and uploads.
- 3D comes from a checked library first, with live generation as the fallback. A queue prepares the current and next concept's scenes. These are M3.13 and M3.14, and the scene test is still running, so their details may change.
- LiveKit runs on a free Cloud project until real students.
- M3.6 built the session with the SDK as the ears only: the room's audio, the voice detector, Muse, and the turn detector. The tutor speaks only through `createVoiceLine` and `speakTurn`, the path M3.2 proved, so the SDK's `ttsNode`, `llmNode`, and speech handles never run. This replaces the rows below that name them, and `docs/tests/voice.md` says why and what it measured. M3.7 calls the model from the session and not from `llmNode`.
- Outside this design, and listed so nobody reads them as open. No parent consent, parent alerts, or parent summaries, with the under-13 rule kept and a lawyer's review before real students. Onboarding is name, date of birth, class level, interests, a goal, then Home, so it has no voice choice and no first exchange. Sign-in uses an email code. Sign-in and onboarding use the made-of-dots look.

**The reference to beat.** You tried a real Aristotle session: "it felt human in the conversation, like i could interrupt and talk to it, ask for clarification and it just knows what to say next like a human tutor would, and it takes it at my pace". That is one person's impression of one session, and no machine test of Aristotle exists. It says nothing on reply speed or the board, so this document claims nothing about those from it.

| What you felt | How this design delivers it | Proven, with fakes | Not proven |
| --- | --- | --- | --- |
| Interrupt it and talk back | The tutor yields at about 171 ms and cuts off on the first real word, with the board frozen. That cut came at about 674 ms on a fake interim. Muse's real first partials came at a p50 of 966 ms and a p95 of 1351 ms on synthetic speech, and 57 of 120 lines had none by 1 s. "Wait." alone stops it. "Uh-huh" does not, even over a question. A long noise pauses it, and it picks up from the cut word with the ball moving again. | All of that except Muse's partials, in live runs. The rule, reader, clock, and browser together in real Chromium. | Real transcript timing in a live session, a laptop speaker's echo, and Safari, iOS, and Android. |
| Ask for clarification, and it knows what to say next | The browser reports the word and frame where it stopped. The next turn gets a note with what was heard, what was not, and what is on the board. M3.9 adds the lesson's current step. | Only the facts reaching the agent. | Whether the reply is right. The speed test timed real models on a test prompt and did not judge teaching, so no real model has run this design. This is the largest unknown here. M3.7 and M3.8 own it, and M3.8 gains a test for it. |
| It goes at my pace | A question ends the turn. "Hmm" holds the floor for 8 s. Real words after a question or an interruption wait 2 s under decision 4. | The waits, with exact words from the fake. | Whether real transcripts catch "hmm", and whether the teaching itself paces well, which is M3.8's. |

**What you must do, and when.**

1. Now. Confirm ElevenLabs' training opt-out on `elevenlabs-balance`. Meta has no such setting for API use. Its designation policy lists Muse Voice Transcribe as a Standard Model, so using it is Standard Services. M3.6 pins the model name, and the legal review rechecks the list. M3.2 and M3.6 use test text and test speech only.
2. Done on 3 November. The Anthropic, LiveKit, ElevenLabs, and Meta keys each answered a read-only call, and the speed test measured all three models' first words, as "The time budget" says.
3. Before the first real student. Ask Anthropic for the Scale tier and a zero-retention agreement. Have a lawyer review the age rules below and "What leaves our servers".

**The working total: about $848 a month for all four services, or about $1,290 with background work and the PRD's 30% buffer.** That is Sonnet with compaction, the tutor you chose, on the vendors you chose. API hosting, about $200 by the PRD's guess, is on top, so about $1,490 against your $2,000. A beta month means 12,000 minutes in 30-minute sessions. These are listed prices, read on 3 November 2026.

| # | Decision | Answer or options | Beta month | Status |
| --- | --- | --- | --- | --- |
| 1 | The design | Approved | $0 | Settled |
| 2 | Agent language | Node, because only Node shares our types | $0 | Settled |
| 3 | What V2's 150 ms measures | A. The agent's decision to silence, plus limits the student can feel | $0 | Settled |
| 4 | Turn patience | B. 8 s after a filler, 1 s after real words, and 2 s when the tutor just asked a question or was just interrupted. It breaks V1's p95 on long answers | $0 | Settled |
| 5 | Stock phrases | "Let me work that out.", plus short reactions from code, as you added on 3 November | About $0 | Settled |
| 6 | The voice | ElevenLabs, voice Chris, with the training opt-out on, on Flash unless you say otherwise | $240, the same on Flash and Turbo | Settled, with the model decided in M3.2 |
| 7 | Transcription | Meta's Muse Voice Transcribe, kept after your real microphone test on 3 November. Nova-3 stays reachable behind the adapter | $36 | Settled |
| 8, 9 | Hosting | LiveKit Cloud with our own accounts, not Inference, on a free project until real students | $120 on Ship, once real students start | Settled |
| 10 | The model | Sonnet 5.5, with no talking router for now, after the tests and comparison on 3 November | Model alone, with compaction, Sonnet $452. For comparison, Opus $1,122 and Haiku $30 | Settled |
| 11 | Long sessions | B. Compact in the background, with our own summary as the fallback | Saves $219 on Opus, $96 on Sonnet | Settled |

**What you answered.** The speed test reopened these, and you answered each one on 3 November. Each stays replaceable as this table says.

| Card | Your answer | What keeps it replaceable |
| --- | --- | --- |
| `voice-choice` | Chris, chosen by ear on 4 November in place of Casey, on Flash unless you say otherwise. Eric is out, because he gave overlong audio on some lines. One line ran 7 to 10 s instead of 1.7 s on Turbo in 14 of 24 calls. On that line Chris ran 0 of 40 overlong on Flash, and Casey 0 of 60 on Flash and 0 of 40 on Turbo | `VoiceAdapter`, plus M3.2's measurements again |
| `tutor-model-choice` | Decision 10, Sonnet 5.5, on the Sonnet cost rows. No talking router for now | `TutorModelAdapter`, plus M3.8's evaluations rerun |
| `first-sound-target` | Two numbers replace V1's 800 ms and 1.5 s. A first reaction under 200 ms from code, and a first real word as fast as the vendors allow | No adapter. They are numbers in M3.6's, M3.7's, and M3.10's rules |
| `board-camera-and-3d` | Library first, with live generation as the fallback, under "The board's direction" | No adapter. M3.2's player lets a scene be any deterministic function of the clock |

**The vendors you chose.** You chose these on 3 November 2026, and kept them after the speed test, as "What you answered" says. No proof here has run either new vendor, so "What M3.2 and M3.6 must measure again" lists what those PRs owe.

| Service | Choice | A month, at listed prices read 3 November 2026 | How it adds up |
| --- | --- | --- | --- |
| Hosting | LiveKit Cloud with our own accounts, not Inference. A free project until real students | $120 | Ship from $50 with 5,000 agent minutes, then 7,000 minutes at $0.01 |
| Transcription | Meta's Muse Voice Transcribe | $36 | 12,000 minutes at $3 per 1,000 |
| Voice | ElevenLabs, Chris, on Flash | $240 | 6M characters at $40 per million, the listed price for both |
| **The route** | | **$396** | |

**The age rules, which you set aside.** You chose these knowing both rules. Meta's terms, section 10.1, bar end users under 18 and products targeted at them. ElevenLabs' usage policy bars products directed at under-18s without its written approval. Astra is for students 13 and up, and you also turned parent consent off on 4 November. A lawyer reviews all of this before real students.

**The reference.** Cartesia and Deepgram remain the reference the proofs ran against, because `fake-providers.mjs` speaks only their wires. The proofs and their adapters stay as they are, so a Cartesia or Deepgram figure below describes that reference and not the vendors you chose.

| 30-minute sessions, all four services, on the vendors you chose | Model alone, a month | A month | With background work and a 30% buffer | Per minute on that basis, against the PRD's $0.15 |
| --- | --- | --- | --- | --- |
| **Sonnet, compaction, the tutor you chose** | $452 | **$848** | **$1,289** | $0.107 |
| Sonnet, history grows | $548 | $944 | $1,415 | $0.118 |
| Opus, compaction, 200 thinking tokens a turn | $1,122 | $1,518 | $2,160 | $0.180 |
| Opus, history grows, 200 thinking tokens a turn | $1,341 | $1,737 | $2,445 | $0.204 |
| Opus, compaction, no thinking, which cannot be set | $903 | $1,299 | $1,876 | $0.156 |
| Haiku, compaction | $30 | $426 | $741 | $0.062 |

So on the PRD's own basis, Opus misses $0.15 in every row, and Sonnet and Haiku meet it. With the buffer and $200 of hosting, every Opus row breaks the $2,000 budget, at $2,360, $2,645, and $2,076. Before hosting, the row with no thinking is $1,876. On the reference route, which `results/cost.json` prices at $527, those rows are $2,331, $2,615, and $2,046, each before $200 of hosting.

| One hour of tutoring. PRD Q21 sells 5 hours for $49, which is $9.80 an hour | All four services | With background work and a 30% buffer |
| --- | --- | --- |
| Opus, flat 15,000 token prompt, as the PRD assumed | $5.58 | $8.19 |
| Opus, 60 minutes, history grows | $11.28 | $15.59 |
| Opus, 60 minutes, compaction | $7.63 | $10.86 |
| Sonnet, 60 minutes, history grows | $5.86 | $8.55 |
| Sonnet, 60 minutes, compaction | $4.31 | $6.53 |
| Haiku, 60 minutes, history grows | $3.35 | $5.29 |

The first row's $0.093 a minute is $0.060 for the model, $0.0200 for ElevenLabs ($240 over 12,000 minutes), $0.0030 for Muse ($36 over 12,000 minutes), and $0.0100 for LiveKit ($50 plus 7,000 minutes at $0.01, over 12,000 minutes). The model's $0.060 is 3 turns a minute of 15,000 cached tokens at $0.20, 1,000 new tokens at $5, and 600 output tokens at $20, per million. History growth adds about 1,600 tokens a turn, because history is append-only. `results/cost.json` is the output of `cost.mjs`, which shows every step of the model's cost and still prices the reference route, Cartesia Scale at $299 and Deepgram with keyterms at $108. These tables keep its model figures and change the route: a month is the model plus $396, and the buffered column is that plus $144 of background work, times 1.3. All prices are listed prices as read on 3 November 2026. They are estimates until M3.7 and M3.10 measure real tokens. Sonnet rows assume 0 thinking tokens. At 200 tokens its compaction row is $561, $957, and $1,431, which changes no decision.

**The words in this document.**

- V1: first tutor sound within 800 ms at p50 and 1.5 s at p95 of the student finishing, which you replaced with the two numbers above. V2: on interruption, speech and board stop within 150 ms, and "uh-huh" stops neither. V5: the tutor resumes after a dropped connection.
- B1: a drawing starts within 100 ms of its word. B2: a turn's first drawing within 1 s of its first word. B5: the board library. B6: rewind. B7: exact replay from the log. B8: student drawing and uploads. These are PRD codes. The budget's steps below are called D, S, M, and F so they do not collide.
- T1: never hand over the answer early. T3: no third question on one point. T5: wait at least 8 s after a question, and "hmm, let me think" does not end the student's turn. T6: all numbers come from code. S5: raw audio is not stored. S6: no training on under-18 data.
- Aristotle: heyaristotle.com, the closest competitor. "Beats Aristotle" is a target until M3.10, when you can compare them.
- Beat: one spoken phrase with its drawings inside it. Cue: one drawing and the word it belongs to. Yield: the tutor lowers its voice. Stop: the tutor cuts off and the board freezes. The note: what the next turn is told about what was heard, what was not, and what is on the board. Compaction: replacing old history with a short summary, so a long session stops getting dearer.
- Flush: telling the voice to speak the text it has now. RTP: the numbered timestamps on each audio packet. Jitter buffer: where the browser holds packets to smooth an uneven network, which delays audio by a varying amount. p50 and p95: half and 95% of cases are at or under this value. Thinking blocks: the model's private reasoning, billed as output and written before the first word.

## The design in one page

**The story.** A student says "Wait, then why does it come down?" while the ball is flying. About 171 ms after their first sound, the tutor drops about 12 dB and keeps talking. The first real word arrives about 674 ms in on a fake transcript, and about 1 s in on Muse's real first partials. The tutor cuts off mid-word, the ball freezes on that frame, and the caption stops on that word. The browser reports what played. The tutor answers knowing where it stopped.

The board is the PRD's own bet and is separate from your note. Drawings land on their words, and motion can arrive on a word, because speech, captions, and board read one clock.

```text
 STUDENT'S BROWSER (apps/web)              LIVEKIT             AGENT (apps/agent, Node)             PAID SERVICES
+-------------------------------+        +---------+        +------------------------------+
| microphone ------ voice ------|------->|         |------->| voice and turn detection     |
| <audio> <-------- tutor voice |<-------|  room   |<-------| speech to text <-adapter-----|-----> Muse
| clock: counts samples         |        |         |        | tutor voice <-adapter--------|-----> ElevenLabs
| ScenePlayer: fires drawings   |<-------|         |<-------| tutor turn <-adapter---------|-----> Anthropic
| played reports, slider drags  |------->|         |------->| session log (only writer)    |
+-------------------------------+        +---------+        +---------------+--------------+
        | sign in, start a session, get a join token                        | log events, lesson context
        v                                                                   v
+------------------------------------------------------------------------------------------+
| API (apps/api, NestJS) ------> Postgres on Supabase, public schema with row security on  |
+------------------------------------------------------------------------------------------+
```

The browser owns what the student heard and saw, and never writes the log or talks to the model. The agent owns the turn, the model call, the voice, the decision to stop, and the only write to the log. It never decides what played, because it asks the browser. LiveKit carries audio and data. The API handles sign-in, join tokens, and storage, and takes no part in a turn.

## A beat, and how the model writes one

A command belongs to the word after it. The model writes plain text, one beat per line:

```text
Your {"kind":"vector","id":"hand-push","on":"shot.ball","angleDegrees":0,"length":"medium","label":"hand"}hand, right up until it {"kind":"hide","target":"hand-push"}lets go.
After that?
```

This replaces the PRD section 8 sketch of `say` plus `cues` with `atWord` counts, because a model that counts words puts drawings on the wrong word. The PRD says the architecture step owns the final types.

The agent reads this as it streams. `apps/agent/src/tutor/beat-text-reader.ts` is that reader, moved in M3.7, and `apps/agent/test/beats-stream.test.ts` is its test, which runs its tricky cases at 4 stream sizes against the real parser. M3.7 changed two rules below, and `docs/tests/tutor-model.md` says why: any question ends the turn, and a beat ends at a sentence end or a clause. Its rules:

- A brace, any spaces or newlines, then a quote starts a command, with its keys in any order. Other braces are dropped, so `{1, 2, 3}` is read as "1, 2, 3". A pretty-printed command is a command. An oversized one is read to its end and refused, and none of it is spoken.
- A refused command is dropped and reported, and its words still play. When JSON breaks, the words after the break are spoken. The one loss: a quoted string that never closes takes the rest of its line, and that is reported. M3.7 counts these.
- A beat holds at most 60 words, 600 characters, and 12 commands. Past a word or character limit the reader opens another beat. A 13th command is dropped and reported, and its words still play.
- A line that ends in a question sets `expectsReply`, and the reader stops the turn there. So the tutor cannot write "What pulls on it?" and then answer itself.
- Markdown marks, emoji, zero-width characters, and bidi controls are not spoken. The reader removes them, because the SDK's own filter runs before `ttsNode` and changes commands. `(x-1)*(x+1)*(x+2)` lost its `*`, and `fs[i](x)` became `fsi`. M3.6 sets `ttsTextTransforms: null`. In a live run with the filter on, 0 of 4 test commands arrived unchanged, and with it off 4 of 4 did.
- A command that names nothing on the board, or the wrong kind of element, is dropped by `getBoardProblem`, and its words still play. So a dropped `simulate` takes its later `runSimulation` with it, and the note to the model says what never appeared.

The reader removes the `*` from `2*3` too, so it speaks "23". The prompt must write math in words in speech, which M3.7 sets and M3.8 tests.

**Flushing.** The figures in these three paragraphs are the reference: Cartesia's documented behavior and a fake of its wire. ElevenLabs flushes differently, and M3.2 measures it. LiveKit's Cartesia plugin holds text until a sentence ends, so a long first sentence would wait for the model to finish writing it. The agent flushes before each command, at each beat end, and after a turn's first 8 words. At 100 tokens a second with fakes, first audio came 98 ms after the first words with this rule, and 801 ms with no flush in the first round's run. A flush falls between words, and a command inside a word waits for that word to finish.

This has limits. Cartesia's docs warn that a chunk with no sentence-ending punctuation can wait in its buffer and "sometimes ends with odd or distorted sounds", and 9 of the 19 flushes in the sample session end mid-sentence. Its docs say a context closes 1 second after its last audio. Commands are slow to write, so the flagship beat has a modeled gap of 35 to 313 ms in the audio, depending on model speed. The fake never closes a context and sends word times before audio, so none of this has met real behavior.

The fallback, in order: flush only at commas and sentence ends, and let a cue wait for its word. Open a new context when one has closed, and add the time already played to its word times. Have the prompt place commands at clause boundaries. `pushText` is marked deprecated in the SDK, and a flush sentinel in its replacement ends the input, so M3.6 pins `@livekit/agents` 1.9.5.

**Facts from the Claude API docs, read through the `claude-api` skill.** Text after the last tool call stays `text` on all three models, and that is where the speech goes. `tool_choice` of `any` or `tool` returns a 400 on Opus 5.5 and Sonnet 5.5, so plain text is safer than a `speak` tool. On both, for accounts created on or after 31 August 2026, editing an earlier turn invalidates later thinking blocks. So an interrupted turn stays in history as written, the truth goes after the student's next message as a `role: "system"` note, and M3.7 keeps its own history, because the SDK rewrites an interrupted turn itself. A tool call comes before the words, so `compute` means two requests, and the agent plays "Let me work that out." under decision 5.

## How a drawing lands on its word

**The method.** The agent sends word times as the voice gives them. The fakes gave them ahead of the audio. Real Flash and Turbo do not. In the speed test they arrived in the same message as their audio, in 75 of 75 messages, so the design must be proven with that, and "If word times arrive with or after the audio" has the fallback. The browser taps the tutor's audio with an `AudioWorklet`, finds the first audible sample of the turn, and counts from there. A cue fires when the count reaches its word and the current 3 ms block of audio has sound. The count runs through natural pauses, because the word times include them. It runs through lost audio too, because the time of those words passed with them.

One silence is not on the timeline: the voice falling behind. Only the agent can see that, so the agent says so. It tracks when its queued audio runs out, and sends `audioGap` with no length at that moment. Audio already on its way is slower than a data message, so this usually reaches the browser before the silence does. When audio returns, it sends the length. The count holds just short of the gap for at most 3 s, a starting guess, then skips it. Lateness too small to run the queue dry adds up, and the agent sends it as a length once it reaches 20 ms. A stall at a flush is the likely case, because the agent flushes before each command, so a stall lands right on a drawing's word.

**The browser cannot work this out alone.** The first two rounds tried, moving the count back to the next word after a silence unless RTP said audio was lost. RTP stands still in a loss, and also in the quiet part of a stall or a pause, so once speech has pauses it cannot tell them apart. A 1 s loss every 8 s with a pause every 4 words was called late on 7 of 35 long silences across three runs, and each wrong call moved the count back for the rest of that turn. The browser's own packet count is no better: read when the audio returned, it showed the loss on only 11 of 35. A stall shorter than the worklet's 107 ms silence test is invisible to both.

Those rounds' table also never fired a cue. It replayed the rule at each word's own moment, so a word right after a stall scored near 0 by construction. Every number below fired live.

Fired live in real Chromium over real WebRTC, with a relay adding delay and loss, on a test tone. Error from where each word really was, in ms, at p95, with about 200 words a run. The first row is the clock after this round's fix, rerun on the columns it names. Every other row ran at `02b8b67`, before the fix.

| Method | Clean | 40 ms delay, 30 ms jitter, 1% loss | 100 ms delay, 70 ms jitter, 4% loss | Voice 90 ms late | Voice 200 ms late | Voice 500 ms late | 1 s lost every 8 s, with pauses, three runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Count samples, skip what the agent reports (chosen), after the fix** | 5 | not rerun | not rerun | not rerun | 7 | 8 | 26 to 125 |
| The same, before the fix | 19 | 6 | 26 | 36 | 6 | 7 | 19 to 59 |
| Browser guesses from packet loss, gate on each block | 19 | 6 | 26 | 89 | 18 | 17 | 3220 to 4106 |
| Browser guesses from RTP, gate on each block | 19 | 6 | 26 | 89 | 18 | 17 | 1556 to 2737 |
| Browser guesses from RTP, gate at 107 ms of silence (the last round) | 19 | 6 | 26 | 89 | 195 | 495 | 1488 to 2477 |
| Count samples only | 19 | 6 | 26 | 89 | 201 | 500 | 19 to 59 |
| RTP only | 34 | 20 | 26 | 84 | 208 | 503 | 23 to 61 |
| When a data message arrives | 80 | 168 | 280 | 167 | 278 | 569 | 920 to 1753 |

B1 allows 100 ms. These leave out the speaker, 32 ms on this fake device, and the screen, because M3.2 draws on the next frame, up to 16 ms later. Data messages miss because the jitter buffer holds the audio and not the data. `results/README.md` has every run, with the worst case and the early counts, and `results/clock-fixed.json` and `results/clock-attack.json` hold this round's reruns. The lost audio cell moved from a range of 19 to 59 ms to a range of 26 to 125 ms, and one of those runs misses B1. No report was sent on those runs, and the clock's figures there equal the count alone's, so the blackouts set that spread and not this round's change. A reviewer's three runs gave p95 19, 20, and 101 ms. Two of them had a worst of 779 and 552 ms, and the count alone and RTP gave the same worst, so the blackouts set those too. The clean cell's 5 against 19 is run-to-run spread and not the fix, because the chosen clock equals the count alone in both runs.

The agent's report is read from its own frames, with no knowledge of the stall we cause: 498 ms at p50 and 502 ms at worst for a 500 ms stall, and 90 ms at p50 and 92 ms at worst for a 90 ms one. In the built session after the fix, with the reader and the SDK's real audio path, 6 runs with a stalling voice gave 24 cues in real Chromium, 0 of them more than 40 ms early, and a worst error of 14 ms, against 24, 0, and 35 ms before it. The agent read those stalls as 531 to 539 ms, and the browser heard 526 to 540 ms of silence. Offline on real `say` speech, with random pauses and a 500 ms stall at a word start or inside a word, the worst p95 was 16 ms, with the stall list standing in for the report. Noisy word times hurt directly, with a median p95 of 62 ms at 30 ms of noise, so M3.2 measures ElevenLabs'. A first look in the speed test's `elevenlabs-word-error.json` gave absolute error at p50 12 to 44 ms and p95 261 to 322 ms on Flash and Turbo, n of 9 to 13, with the largest at sentence ends. The method is not validated. If that p95 is real, those words miss B1, so this bears on the bet directly.

**What this bounds for one turn.** The clock restarts each turn, so any error ends there. At `02b8b67` three faults let a turn's error run on. This round fixed all three in the proofs, and M3.2 carries the fixes into real code.

- A voice slower than real time ran away with no report, because `createPlayoutTracker` dropped lateness under 20 ms instead of adding it up. At 90% speed that gave p95 600 ms, worst 639 ms, and 94 of 104 cues more than 40 ms early, and at 97%, p95 160 ms and worst 178 ms. A 15 ms stall every 2 words gave p95 76 ms. The tracker now adds lateness up and reports it at 20 ms. Rerun live, 90% speed gave p95 23 ms, worst 30 ms, and 0 of 102 cues more than 40 ms early. 97% gave p95 21 ms and worst 22 ms. The 15 ms stalls gave p95 18 ms. Whether a real voice does this is unknown.
- A lost closing report held the position forever, so cues never fired for about half the heard words, and by reading `stop-page.js`, `questionHeard` then never went out. The count now holds for at most 3 s, and that gap then counts as a lost report. The 3 s is a starting guess. It sat above a longest modeled stall of about 2.7 s, which comes only from `results/README.md`, from Cartesia's close, and real stalls are longer, such as Sonnet's 9 to 10 s in the speed test. With a closing report on time, length does not matter, and the bound only limits the damage from a late or lost close. With every closing report dropped on a 500 ms stall, 113 of 113 cues fired, at p95 2481 ms and worst 2493 ms. The count is never more than 3 s behind, so a turn's last 3 s can go unfired: with 40 ms stalls every 2 words and every closing report dropped, 70 of 110 fired in these 6 s turns.
- One path to that loss was real but rare: a frame in the same tick as the dry timer, below the 20 ms line, got no closing report, 3 of 400 times. A frame after a dry report now always closes the gap. A gap still open when a turn ends gets no closing report, because no later word needs one and the next turn starts a fresh clock.

A missing report leaves later cues early by that one stall, and no more. A late report lets a cue fire early until it lands, and a late closing report holds a cue until it lands, so both go on both channels. A 1500 ms stall gave p95 7 ms, and 0 of 101 cues more than 40 ms early with its closing report held back 150 ms. The bound has a cost from about 2.9 s, once the stall plus the closing report's lateness pass 3 s. On a reviewer's runs, a 2900 ms stall gave p95 77 ms with its close held back 150 ms, and p95 2402 ms with it held back 300 ms. At exactly 3000 ms with it held back 150 ms, it gave p95 2529 ms, worst 2875 ms, and 45 of 101 cues more than 40 ms early. A 3500 ms stall gave p95 8 ms with the report on time, but 50 of 109 cues fired more than 40 ms early with it held back 150 ms, because the count had run on by the time the audio returned. Those cues fire all together when the audio returns, up to about 3.2 s early at a 3 s stall by reading the rule, and a longer stall can reach further. M3.2 measures how long real stalls get. On the worst link with a 500 ms stall, four runs after the fix gave p95 13, 32, 43, and 49 ms, worst 24 to 92 ms, and 0 to 13 of about 100 cues more than 40 ms early. Runs before the fix gave 30 and 49 ms, so the fix did not change this case. If a first sound is lost, or a very late turn message lands after a silence of 107 ms or more, every cue in that turn is late by that much, and nothing corrects it.

**Where a turn starts.** A turn's first sound follows the last turn's audio by at least 150 ms of silence, and the agent guarantees it. `createVoiceLine` is the one way into the voice track. It lets a turn send nothing, no message and no frame, until the turn before has played out and that silence has passed. A stop acts only on a live turn. On a turn that has finished it sends nothing, because no silence follows it and the browser would mute the next turn. A turn stopped while it waits leaves the line taken until the turn before it has gone, and only the last turn to open may clear the queue, so a stop on an older live turn cannot touch a new turn's audio. So a turn's first sound is an onset and the browser reads it with no guess, apart from the limit at the end of this section. `speakTurn`'s `finished` means the audio has left the queue, which the agent can know, and not that the student has heard it, which only a report can say. `finished` never rejects: a frame the source refuses or a voice that throws ends the turn as a stop, and `onFailure` says why.

Silence is the mark because it is the one thing that travels in order with the audio, through Opus and the jitter buffer. A data message cannot mark a sample, because the jitter buffer holds the audio and not the data, the 80 to 280 ms in the table above. RTP timestamps could, but `rtc-node` does not expose them on the sending side. Waiting for the browser's report costs a round trip and needs a bound of its own, and after a stop it still leaves no silence, because the report leaves while old audio is still arriving.

The browser's half is six rules.

- A `turnStarted` reports whatever the turn before left open, so no beat is lost from the log, and a beat with every word heard counts as finished.
- A turn closes on its own `end`, in audio order, so the next onset belongs to the next turn even when its message comes later and no tick ran between them.
- For 110 ms after a stop, a word in the audio still arriving does not count as a first sound, because the next turn's sound cannot come that soon. That rests on the agent's silence, and a turn that sent no audio leaves none. So the window opens only if the stopped turn had word times, which go out with its first audio, or sound in the last 300 ms, and a turn right after a failed one keeps its first sound.
- A `turnStarted` does not open the gain while old audio can still be arriving. The gain waits out those 110 ms and any sound that began inside them, and opens on that sound's `end`, or 500 ms after the stop if no `end` comes. An `end` reaches the browser 107 ms after the last audible sample, and the new sound came at least 128 ms after it, so the gain opens ahead of the new sound.
- A sound under 200 ms that ends within 500 ms of a stop stops counting as a first sound, and the next onset takes its place. A stop cuts old audio off, so a word of it that starts past the 110 ms ends short, while 48 of 48 phrases in 9 real takes ran 250 ms or more.
- If no onset comes within 1 s of the first word times, the clock starts at the first audible block since `turnStarted`, or at that moment if there is none, so a merged start or a lost sound can delay a turn and cannot stop it. This is the bound on a broken guarantee, and no live run has needed it.

**What remains after a stop, on the worst link only.** Silence cannot tell a word of old audio from a first sound, because both follow a silence the probe accepts. A wider window cannot either, because on the worst link old words started up to 227 ms after a stop, and a next turn's first sound came as soon as 204 ms after one on a clean link and 168 ms on the worst. Six runs on the worst link, stored Chris, with stops aimed at phrase starts, gave 126 stops and 119 next turns the tool could place. A word of old audio started past the 110 ms on 6 of those stops, 113 to 227 ms after the stop and 21 to 141 ms long. The clock gave up all 6, and each next turn's cues counted from its real first sound. So three things are left, and M3.6 holds them under "For later owners".

- That word still passes the gain if the gain has opened. It did on 2 of 119 stops, for 12 and 74 ms.
- A cue on the next turn's first word can fire on that word, up to about 300 ms early, if the word times have landed by then. That is from reading the rule, because these runs put no cue on a first word.
- An old word of 200 ms or more keeps its turn early by the gap to the real first sound. None came at this head. Under a 150 ms rule, a word of 182 ms ran one turn 328 ms early. Before any such rule, a reviewer's 20 stops held one turn 218 ms early, and 58 of mine held two, 239 and 279 ms early. Replay stayed exact in all of them, because a replay reads what fired.

The same aimed stops on a clean link and on 40 ms of delay, 30 ms of jitter, and 1% loss gave none of this, on 40 next turns each. `docs/tests/scene-player.md` has the rows.

The cost is small and falls in one place. A turn on a quiet line pays nothing, since the wait is the time left of 150 ms since sound last left the agent. A turn on a stop's heels pays all of it, so **a reaction right after a stop spends 150 ms of M3.6's 200 ms**, and M3.6 must count that. `docs/tests/scene-player.md` has both live proofs.

**If word times arrive with or after the audio.** On Flash and Turbo this is the normal case, as the speed test measured. No run here has used real ElevenLabs messages, so M3.2 must prove the clock on them. The fallback is what the fakes showed next: a turn's zero is the first sound, and word times count from it, so late word times cost only lateness, and a cue whose time arrives late fires when it lands. With them held back 300 ms, 205 of 205 cues fired, and words after those 300 ms fired at a p95 of 5 ms, or 13 ms on the worst link. A reviewer's run at `02b8b67` gave 46 ms for the same case, as the follow-ups below say. The voice is never held back for a drawing. Holding it back is the one way to buy a real lead, by my inference, and it adds to first sound, so that would come to you. If lateness misses B1 on real audio, M3.2 stops and reports by its own rule.

**Who proves this for real.** M3.2 owns it. Its lab page plays real ElevenLabs audio through a local LiveKit server, which is free, into the worklet clock, on a real network profile, with a small publisher that reports gaps the same way. That is the earliest moment the bet can fail, and it comes before three PRs of board work. M3.6 sends the report from the real `ttsNode`. If the report proves unreliable on real audio, the fallback is the count alone behind the same gate, with flushes only at commas and sentence ends so stalls are rarer. Cues then run early by each stall until that turn ends. M3.2's 100 ms rule would catch that, and M3.2 stops and reports by its own rule.

If the clock cannot run, because audio is blocked or there is no output device, a timer started when the word times arrive drives the board. A typed session with the tutor muted keeps audio flowing silently, so it uses the same clock. A typed message started a reply in about 85 ms with fakes, and typing over the tutor stopped it in about 48 ms.

## Interruption, moment by moment

At 150 ms of sound, "uh-huh" and "wait" look the same to any detector. A rule that waits for words alone leaves the tutor at full voice for about 700 ms. So the tutor yields first and stops when it knows. `turn-rule.mjs` is that rule as a pure function for M3.6's `turn.test.ts`, and `turn-rule-check.mjs` runs it through 33 stories, one of them a repeat, and searches every state it can reach, 104 states and 964 moves, with no violation of its 8 rules.

| After the student's first sound | The student hears | What happens |
| --- | --- | --- |
| About 171 ms (152 to 182 measured) | The tutor drops about 12 dB and keeps talking. The ball keeps flying. | The agent's voice detector sends `yield`. |
| About 674 ms (483 to 714 measured), from the fake's interim, or 1 s with no words. Muse's real first partials came at a p50 of 966 ms and a p95 of 1351 ms, and 57 of 120 lines had none by 1 s, so the 1 s rule races the stop | The tutor cuts off mid-word. The ball freezes. | The first real word sends `stop`, on both data channels. The browser mutes and freezes at once, and reports `played`. |
| The student stops, plus the time budget | "Good question." The ball stays frozen. | The next turn starts with a note saying what was heard, what was not, and what is on the board. The model decides whether to return to the cut point. |

M3.6 sets two SDK options this rests on. `minWords: 9999` turns off the SDK's own word rule. While a reply is active, that setting also makes the SDK drop any turn that arrives, so our rule has to stop the reply first. `resumeFalseInterruption: false` turns off the SDK's pause and resume, which would release a stale reply when the voice ends.

The harder cases:

- **Real words as the tutor starts.** A student says "Gravity.", the turn is confirmed, and they add "It lands twice as far." before the first audio. Any word outside the reaction list now stops a reply that is thinking or speaking, and a voice already on when the tutor starts gets a yield. The second sentence reached the model 6 of 6, and 6 of 6 with the final 200 ms later, with 0 turns dropped. Before this, 6 of 6 got no stop and a reply to stale words. A number alone now counts as well. At `02b8b67`, `turn-rule.mjs` stripped digits, so "42." gave 0 of 3 stops and 0 of 3 replies, while "Forty-two." stopped 3 of 3. Rerun live after the fix, "42." over a reply stopped 3 of 3 and reached the model 3 of 3. "42." during thinking reached the model 3 of 3, with 0 turns dropped. In the same run, "Uh-huh" and "Hmm" over a question still stopped it 0 of 3 and 0 of 3. Digits are real, because Muse wrote "12", "9.8", and "4 ac" in the speed test's `muse-corpus.json`. M3.6 carries the fix and its story into `turn.test.ts`.
- **Over a question.** T1 means most turns end in a question, so this is the common case. "Uh-huh" and "Hmm" over a question are reactions, until the browser reports that its last word started (`questionHeard`). They stopped the tutor 0 of 5 and 0 of 5, the question was heard in full 10 of 10 times, and the tutor stayed quiet for 8 s after it 10 of 10 times. Before this they stopped it 5 of 5, and "Hmm" left about 10 s of silence with the question cut off. "Yes." after `questionHeard` is an answer, and it reached the model 5 of 5. In real Chromium with the reader, the same held 6 of 6 reactions left the board running, 6 of 6 questions were heard in full, and 3 of 3 answers got a reply.
- **One word.** "Wait." can end before its transcript arrives. A real word stops the tutor however late it comes. A number is a real word too, as the first case says. It stopped 5 of 5, 5 of 5, 5 of 5, 5 of 5 with the transcript arriving 0, 300, 600, and 900 ms later, at 486, 924, 1220, 1595 ms at p50, at load 5 to 7.
- **Sound with no words.** A cough or a television. If 1 s passes with no words, the tutor cuts. If no words arrive within 700 ms of the sound ending, it says the cut word again and carries on. It resumed 5 of 5, with every word heard and the cut word twice, about 1.2 s after the sound ended. Before this the turn ended for good, 4 of 4. That 700 ms is a fake's fit, and "Words that never become final" says what Muse does to it.
- **A resume with something moving.** The rest of a beat has no cue for a ball already in the air, so it would stay frozen while the tutor narrates it. `getResumeScript` leads the resumed words with one command per entry of `frozen`: the last `play`, keeping its `until`, with `overWords` reduced by the words already said and at least 1, and the same for a `reveal`. A drawing cut during its entrance finishes when the board unfreezes. In real Chromium that gave 4 of 4 with `play` on the first resumed word, no drawing fired twice, and every word heard. That model had finished writing, so a reply cut while streaming is M3.6's.
- **"Uh-huh".** The voice drops at about 160 ms and comes back about 850 ms later. It stopped the tutor 0 of 10 times. The SDK holds the reaction as the start of the student's next turn, so the agent calls `clearUserTurn` on every reaction. The next turn held stale text 6 of 6 without the clear, and 0 of 6 with it. The clear also reopens the speech connection. A new Muse session took 1046 to 2543 ms in the speed test, so every clear on a reaction costs that, and M3.6 measures whether that drops words.
- **Words that never become final.** An interim "Wait then" stops the tutor. If no final comes within 700 ms of the voice ending, it resumes from the cut word, 5 of 5, so the session does not go silent. On Muse a final came at a p50 of 698 ms and a p95 of 880 ms after the last sound, so a final later than the grace is close to the median case, and "Uh-huh" took 3480 to 3942 ms. Stop, resume, stop therefore needs a rule, and M3.6 owns it. Sending `endStream` released held finals at 683 to 810 ms, 8 of 8, but it ends the session.

**The SDK's echo wait.** `aecWarmupDuration` defaults to 3000 ms. While it runs, the SDK gives speech to text silence, for the first reply and again on every rejoin. Talking 500 ms into the first reply, our stop came at 648 to 681 ms with the wait off and at 1161 to 1186 ms with the default, when only the 1 s rule could fire, at load 3 to 5. M3.6 sets it to `null`. That removes the SDK's echo protection, so M3.6 must test a laptop speaker, and the agent ignores words that match what the tutor is saying.

**What V2 then measures.** From the agent's decision to stop, to silence and a frozen board. Sent on both channels, a message takes 3 ms at p95 on a clean network, 65 ms on the middle link, and 164 ms on the worst, so it misses there, and V1 limits itself to a good connection. Without the browser's mute, audio already on its way keeps arriving for 105 to 128 ms at p50 on a local server, so this reading depends entirely on the mute. A stop built in real Chromium froze 10 of 10 times, audio after the gain node was 0 ms, with 32 ms of device buffer on top, and the drawings rebuilt from the log matched 10 of 10. That rebuild compares which drawings fired, not their motion. Safari, iOS, and Android are untested. A cue already sent when the stop lands arrives anyway, so a frozen board ignores everything for that turn.

**Replies that get cut.** With `minWords: 9999` the SDK cuts a reply only when our rule asks, and the agent sends `stop` for each cut, from the rule, from `ttsNode`'s cancel, and from the interrupted item. With M3.6's settings and the student talking on while a reply started, 11 of 30 attempts had a reply started and cut, and every one of those 11 reached the listener as a stop. The browser logs a cut reply like any interruption. The student may see a stray drawing, and the log and the next note say so. An earlier run's 29 cuts had the SDK's rule on, so it does not cover what M3.6 ships.

A dropped connection works the same way. The browser freezes and keeps its unsent reports. On return, the agent writes `connectionGap` and says the rest of the beat from `getResumeScript`. With `closeOnDisconnect: false` the session survived leaving and rejoining in 3 of 3 runs, and 2 of 3 in a verifier's. A real dropped network is untested. The rule has a `linkLost` event, and the wiring waits up to 1 s for the report before a resume.

## Turn patience

T5 says the tutor waits 8 s after a question, and that "hmm, let me think" does not end the student's turn. V1 says answer fast. They pull against each other, and you chose patience, option B.

| The student | What the tutor does | Measured with fakes |
| --- | --- | --- |
| Says "Hmm, let me think", then silence | A and B wait 8 s. C waits 3 s | Tutor started at 8.15 to 8.16 s, or 3.13 to 3.17 s |
| Says the filler, thinks for 5 s, then answers | No jump-in at 8 s | 0 of 5 jumped in, and the answer then got the normal decision |
| Real words, then silence | A and C wait 1 s. B waits 2 s after a question | Tutor started at 1.15 to 1.17 s, or 2.13 to 2.15 s |
| Real words, a 1.5 s pause, then more | A and C jump in. B waits | Jumped in 5 of 5 at 1 s, and 0 of 5 at 2 s |
| A long finished answer the detector doubts | A and C answer at about 1.2 s. B at about 2.2 s | 38 of 120 hit the 2 s cap, and 28 of 100 the 1 s cap. Short phrases: 2 of 360 at 2 s, and 0 of 300 at 1 s |

B covers a student who was just asked something, and a student who just interrupted to ask for clarification, who are the two most likely to be mid-thought. Being cut off in the middle of a thought is the opposite of "takes it at my pace".

**Its cost is larger than I first wrote.** The detector's score on one long question spans 0.25 to 0.52 around a threshold of about 0.36, close to a coin flip, so about 32% of long answers wait for the cap. On the test mix of one long question and three short phrases, p95 went over 1.5 s in 4 of 6 runs, at up to 2209 ms. Under B those students wait about 2.2 s, and that misses V1's 1.5 s. V1's p95 fails on any mix where more than 1 in 20 turns are long answers the detector doubts, and after a question that is likely. It is a real trade of speed for patience. The run covers the 2 s wait, and the rule that picks when to use it is M3.6's.

Fillers are a word list, and the fake returns exact words, so real speech to text may transcribe "hmm" differently. M3.6 tests that.

**The 8 s timer.** The agent owns it. It starts when the browser reports `questionHeard`, and the board stays still. Any sound from the student restarts it. M3.8 decides what the tutor says when it ends.

## The time budget

From the student's last sound to the tutor's first sound. Four steps count. D is the decision: the last sound reaches the agent, a short silence, then the turn detector. S is the final transcript. M is the model's first words, up to the first flush. F is the voice's first audio.

The model can start early, on the final transcript, through `turnHandling.preemptiveGeneration`. The voice cannot. `preemptiveTts` is false by default, so F starts only after the turn is confirmed. So first sound is **max(D, S + M) + F + the trip to the student**. Measured with instant fakes, first audio came at 548 ms at p50, and at 746 ms with a voice 200 ms slower, while the decision stayed near 450 ms. So the voice's time adds in full. On the measured figures early model start gives no head start, because S alone, at 698 ms, is later than D at 450 ms, and the formula holds. `preemptiveGeneration` needs `this.llm instanceof LLM`, and `NeverCalledLLM` passes that, so it breaks only if M3.6 drops that stub.

| Step | First value p50, p95 ms, and what it was | Measured on real vendors, p50, p95 ms | Public figure, other workloads, read 3 November 2026 |
| --- | --- | --- | --- |
| D | 450, 1130. Measured with fakes, so real speech may differ | Not measured | None |
| S | 150, 300. A guess | Muse 698, 880. Nova-3 through LiveKit Inference 533, 604. With a room-noise floor, Muse 847, 3902, and Nova-3 545, 804. M3.6 works from about 700, 900 until it measures from the agent's region | None found that applies |
| M | 450, 850. A guess | To first flush, on a test prompt: Haiku with thinking disabled 1040, 1748. Opus low fast 1434, 2130. Sonnet `between_tools` low 1834, 4006. Opus low 3182, 5382 | Sonnet 5.5 low effort 1.08 to 1.20 s, Opus 5.5 low effort 10.97 s, both Artificial Analysis at 10,000 input tokens. Opus 5.5 2.33 s on one gateway |
| F | 100, 200. A guess | Flash 253, 319. Turbo 335, 531. v4 Turbo 232, 254 | For the reference, not ElevenLabs: Sonic 3 166 ms, Vapi's June 2026 benchmark. About 190 ms, Cartesia's changelog |
| Trip | 100, 150. About 60 ms locally, and the rest a guess | Not measured | None |

The first values gave a p50 of max(450, 600) + 100 + 100 = 800 ms. The public figures, with Cartesia's F, gave about 1.6 s on Sonnet, about 2.8 s on Opus at the gateway's figure, and about 11 s at Artificial Analysis's, on other workloads with uncached prompts.

**What the measured column can and cannot say.** Every measured figure came from Abel's Mac on a West African network, on synthetic speech, under load. Muse and ElevenLabs ran on their own sockets, and Nova-3 through LiveKit Inference. None ran through an agent or this design, and the S, M, and F runs were separate. So first sound below is inferred from the formula with D and the trip at their first values, not measured end to end.

On the best row, Haiku with thinking disabled on Flash, inferred first sound is about 2.1 s at p50 and 3.1 s at p95, or about 1.6 and 2.6 s with this network removed. M is the limiter, because with S at zero that row is still about 1.4 and 2.2 s. Prototype B judged Haiku not good enough as the tutor, so this row is a floor and not a pick. A later comparison in the same window gave Sonnet with `between_tools` low at 1655 and 1956 ms to first word, against Haiku's 1045 and 1359 ms, and no candidate met M's budget. Prototype B's Sonnet first text was 1.18 s on 5 calls with different settings, not reconciled with the 1834 ms above, and M3.7 reconciles them.

V1's 800 ms cannot be met on these vendors by a transcript and a model alone. M3.6's 800 ms rule fails with no model at all, since S plus F plus the trip is about 1.05 to 1.13 s on Muse with Flash or Turbo, and about 0.89 to 0.97 s on Nova-3. So you replaced V1's rule with two numbers on 3 November. A first reaction under 200 ms from code, and a first real word as fast as the vendors allow. Code reacted first at 21 ms at p50 in the board prototype, and a head start on a guessed reply gave 17 to 25 ms with 1.5 s or more of lead. Those are prototype runs. M3.6 builds the reaction and warm connections into this design, and M3.6, M3.7, and M3.10 report first real word with each step's share. The first word of a session keeps its own limit, below.

**Thinking.** It cannot be turned off on Opus 5.5. `{type: "disabled"}` returns a 400 at every effort, and the default effort is `medium`. The PRD's $0.060 assumes 200 thinking tokens a turn, which is 2.0 to 2.5 s before the first word, against a 450 ms budget. So either thinking is near zero, and the model costs $0.048, or the budget fails. On Opus, M3.7 sets `output_config.effort` to `low` and tries the docs' line "Answer directly without deliberating.", and the docs warn that less thinking can cost accuracy. You chose Sonnet 5.5, and the speed test found thinking off is the only way near the budget. On Sonnet 5.5, the docs say to try adaptive thinking at `low` first, then `thinking: {type: "between_tools"}`, which turns it off. With that one they say to remove any instruction not to think, because it makes internal XML tags more likely in visible output. A tag would be spoken, so M3.7's reader drops them and M3.8 tests for them.

M misses its first value on every measured row. Sonnet stays, so the moves are code reacting first and the short reactions under decision 5. Turning `preemptiveTts` on gave mixed results with fakes, 630 against 738 ms at p50 and 721 against 1418 ms at p95 in one run, and 1196 against 783 ms at p95 in another. By reading the SDK, it becomes max(D, S + M + F) + trip, so it saves time only while S + M is under D, and on the measured figures S alone is over D. M3.6 looks at it again. M3.7 reports first reaction and first real word as two numbers, so a reaction cannot hide a slow model.

Long questions are the worst case for D, as "Turn patience" says. That is what a real student question looks like, and those turns take about 1.2 s instead of 0.5 s at the 1 s cap.

The first word of a session has its own limit, 3 s from submit (PRD section 6.3). Joining the room and starting the session took 401 to 641 ms here. Fakes have no connection cost, so M3.6 measures this.

## What leaves our servers

"No audio is stored" was only half true. `record: false` stops the SDK uploading audio, and each vendor has its own defaults. Terms read on 3 November 2026. Meta's and ElevenLabs' terms were first read through a page summary. A reviewer then read Meta's terms and designation policy and ElevenLabs' use policy on the page. They still need a full legal read, so their rows and the S5 and S6 lines below are unproven until then.

| Vendor | What it receives | Default | What we set | Who |
| --- | --- | --- | --- | --- |
| Meta, Muse Voice Transcribe | Student audio | Standard Services do not train on content, and Contributor Services do. Meta's terms, last updated 9 October 2026, say the designation "is determined by the designation of the Model you are using". Its Model Designation and Geographic Use Policy, last updated 12 October 2026, lists Muse Voice Transcribe as a Standard Model, and Meta may change designations. The terms also say "the system may route you to a Contributor Model". Retention is allowed for safety and human review | Pin the model name. There is no account setting for API use | M3.6 pins it, and M4.5's legal review rechecks the list |
| ElevenLabs | The tutor's text, and no student audio | A training opt-out in account settings. Retention is unread | The opt-out on | Abel confirms on `elevenlabs-balance`, M3.2 |
| LiveKit | Audio in transit | Agent observability stores transcripts and audio for 30 days when recording is on | `record: false`, and no Egress | M3.6 |
| Anthropic | The conversation | The API does not train on inputs by default, per its privacy center. Standard retention applies, and zero retention needs an agreement | Ask for an agreement before any minor signs up | Abel, M4.5 |

S5 is unproven. ElevenLabs never receives student audio and `record: false` covers the SDK, but Muse receives student audio on terms that allow retention for safety and human review. S6 is unproven. No training rests on Meta's designation of Muse Voice Transcribe as a Standard Model, which Meta may change, and on ElevenLabs' opt-out, an account setting read only in summary. The tutor's text can include a student's name, and whether ElevenLabs keeps it is unread. Both vendors' age rules bar this product for under-18s as written, as "Decide here" says. A lawyer reviews all of this before invitations go out (PRD section 11).

## What the log records

The agent is the only writer, and the browser reports what played. There are five events. `beatPlayed` holds the beat, each word's start, words played, when each cue really fired, how it ended, and any frozen frames. `boardFrozen` holds a freeze that lands after a beat's last word, with something still moving. `studentSpoke` holds the words, typed or spoken, and whether just a small reaction. `studentActed` holds slider drags, rewinds, ink, ink erased, and uploads. `connectionGap` holds how long the connection dropped.

A beat is written once, when it ends. Silence has no event. Rows are unique on session and sequence number, so a repeated write changes nothing. If the browser never reports, the agent writes its own estimate and marks it `agent-estimate`. The browser's words played count only while there is sound, so a stop during a stall reports the words heard, 4 of 4 here, with 0 cues fired after it. The count comes from word times and the clock, so it can be off by a word when word times are noisy. The SDK's own report is not used, because it said 5 to 7 words when a listener heard 12 or 13, though that was with our fake voice.

Replay, seeking, rewinding, and a page reload all call one function, `rebuildBoard(log, atMs)`, which M3.2 writes. It flattens events by time and not by sequence number, because a beat is written when it ends. A cue replays when it really fired, so a late `play` lands right. Browser messages carry `startedMsAgo`, so a drag logged late keeps its order, and `browserMs`, which M3.2 added, so the agent keeps one offset between the two clocks and a slow message cannot move a beat against the ones around it. `frozen` holds a simulation's frame, a reveal's position, or how far a drawing had drawn. So a live board and a replayed board should agree whenever the browser reported, and `replay-check.ts` shows that for 21 cases on a modeled board, with 2 traps that must disagree. It is a model and not M3.2's player, so M3.2 must not copy it, and the real test is M3.2's. An `agent-estimate` row can disagree, and it says so on its face.

## The scene language

The tutor names what to show. The engine decides where it goes and how it moves, so the model cannot place a pixel (T6).

B5's library maps to these commands. Equations are `writeMath`, `transformMath`, and `highlight`. Plots and number lines are `plot`, `shadeArea`, `numberLine`, and `markValue`. Geometry is `geometry` and `construct`. Forces are `vector` and `trackVector`. Computed motion is `simulate`, `runSimulation`, `setParameter`, `slider`, and `ghostPath`. Diagrams and drawings are `diagram` and `drawing`. Then `table`, `timeline`, `code`, `image`, `text`, `annotate`, and `focus`, with `reveal` to build in steps, and `hide` and `clearBoard` to keep the page clean.

The whole sample session from PRD section 6.4 parses with these types, including the six seconds of silence, the frozen ball, and the slider drag. The parser is hand-written and has no dependency. `src/scene-language` holds 1,612 lines without blanks and comments, so "types only" no longer describes that package.

**Settled in the types, with tests.**

- Motion lands on a word. `runSimulation` can `play` `until` a moment such as `peak`, over a number of words, and hold there. `seek` jumps to a moment.
- A graph, diagram, table, timeline, or code block can start empty and build in steps, with `reveal` and `overWords`.
- The tutor can change a value with `setParameter`, which restarts the motion from its first frame, as a slider sample does. Tracked arrows are velocity, its two parts, and acceleration. Each simulation value has a range, so `gravity` 0 is refused and a ball always lands.
- Marks have ids, so `hide` removes them, and an annotation can be a cross and carry a label. `highlight` can pick one occurrence. `plot` has axis labels, a `yRange`, and a real expression parser, `parsePlotExpression`, with numbers, `x`, `pi`, `e`, `+ - * / ^`, parentheses, and `sin cos tan exp ln log sqrt abs`. So `x**2` is refused when the model writes it, and not at render time after the words have played. M3.3 evaluates the same parsed tree with `evaluatePlotExpression`, with no `eval`.
- The tutor can mark student work. Ink has an id, per-point times, an erase action, and a stated frame of fractions of the board panel, and `getBoardAfterAction` puts it on the board. `image` can show an upload by `fileId`.
- Reusing a live id replaces that element in place.
- Limits fit the wire. LiveKit's docs say 15 KiB for a reliable message, so a long drag or stroke is split across messages, and the parser refuses anything larger.
- A curve can have named constants. `plot.constants` declares each with a value and a range, the expression names them, and `slider.constant` lets a student change one. `shadeArea` shades under a plot between two x values. M3.3 settled these and M3.4 draws them.
- Math and handwriting can be paced by speech. `writeMath`, `transformMath`, and `text` take `overWords`.
- A term has an id. `getMathParts` splits source math at its top level, the id stays with a term through every `transformMath`, and a term that crosses the equals sign keeps its id. `highlight.tex` finds a term or a part inside one, and `annotate.target` can name a term as `equation.t3`.
- A new simulation parameter comes with a default, so older rows still parse. Widening a range is safe, and narrowing one would refuse old rows.

**Open, with an owner.**

| Owner | What the language cannot say yet |
| --- | --- |
| M3.4 | A launch angle slider. A playback rate with no word to aim at. Number readouts that follow a quantity. How `overWords` behaves when later word times have not arrived. |
| M3.7 | B2 has a guard only in the prompt today, so M3.7 adds one: if no command has come by the turn's third word, the reader adds a `focus` on the last element, and the evaluation fails any turn over 1 s. |
| M3.12 | Tasks, notes, and tangent, and a wider `studentActed`. |
| M3.14 | One scene command that renders from the time alone, with moments as word cues. |
| M3.11 | One mark on a group of strokes, a region of a photo, a tutor stroke, and ink when the layout differs between sizes. Its sign-error test passes only if the sign is one stroke the model can name. |
| M4.4 | "The board replays its key moments" (PRD section 6.6). |
| Later | CJK and Thai count as one word, so every cue would fire at word 0. PRD Q12 says English first, so this waits. |

**Safety.** The parser checks shape and not meaning, and free text can hold anything that is printable. So M3.3 to M3.5 render text as text and never as HTML, call KaTeX with `trust: false`, and keep names in Maps. The parser refuses `__proto__`, `constructor`, names no reference can reach, control characters, bidi overrides, and every TeX command outside a named list. That list has no macro definitions, sizes, colors, links, or images, so `\def`, `\rule`, `\textcolor`, and `\href` never reach KaTeX. KaTeX then runs with `maxExpand` and `maxSize` as a second wall, and math it still refuses leaves the last good equation on the board. So a model that writes `"\frac{1}{2}"`, which JSON turns into a form feed, gets a refusal and not a wrong equation. `docs/tests/math-board.md` records the hostile run. The agent strips bidi characters from student text before it stores it.

**How other code loads it.** `apps/agent` runs plain Node 22.18 or newer, which strips types with no loader, and in a verifier's run 22.17.1 failed. The repo's `engines` floor of 22.22, from main, covers that. A `pnpm deploy` copy cannot load the package, because Node will not strip types under `node_modules`, so M3.6 deploys from the workspace or bundles with esbuild. When the NestJS API imports the parser, it adds the workspace dependency, `rewriteRelativeImportExtensions`, and the Jest line `moduleNameMapper: {"^(\\.{1,2}/.*)\\.js$": "$1"}`. A verifier ran that, and `nest build` passed and Jest gave 233 of 233.

**The board's direction.** You want the board to go beyond a hand-built library, with 3D, cinematic zooms, scenes for almost any topic, and a board shared by student and tutor. You decided on 3 November. The shared board is M3.12, from Prototype B, and M3.11 narrows to ink and uploads. 3D comes from a checked library first, with live generation as the fallback, in M3.14, and a queue prepares scenes ahead of the student in M3.13. A saved scene holds shared truth and declared personal values, and the tutor's words, order, pace, and examples stay live per student. "Videos" means our generated scenes, with no real footage and no AI-generated video. The scene test is still running, so the details of M3.13 and M3.14 may change. M3.2 builds the player so that a scene can be any deterministic function of the clock, with named parts and named moments, and does not bake in only the planned 2D kinds.

## Swapping a provider

You asked for room to change providers and models. This is that room, and no more. Three vendors and one model family are the only real cases.

| Service | Our interface | One adapter per vendor | What lives inside it |
| --- | --- | --- | --- |
| Voice | `VoiceAdapter`: a name, and `makeTts()` | `providers/elevenlabs.ts`, which M3.2 writes. The proofs' `providers/cartesia.ts` is the reference | Its model and voice. Its word times setting |
| Transcriber | `TranscriberAdapter`: a name, and `makeStt()` | `providers/meta.ts`, which M3.6 writes. The proofs' `providers/deepgram.ts` is the reference | Its keywords and language bias |
| Model | `TutorModelAdapter`: a name, and `stream(request, signal)`, which yields text, tool calls, refusals, and token counts | `providers/anthropic.ts`, one settings entry per model | Thinking, effort, compaction, refusal categories, and the blocks the model must get back |

`providers/choose.ts` is the one place that chooses, and a voice swap is one line. The turn rule, clock, reader, scene language, log, and prompt-building know only our types. A lint rule, `theme/no-vendor-imports`, fails any vendor import outside its own adapter, the way `no-direct-fetch` does. It is on now, with tests, and it also keeps the LiveKit agent framework out of everything but `apps/agent`.

**LiveKit's own classes.** For the voice and the transcriber, the adapter builds LiveKit's `tts.TTS` or `stt.STT` and hands it over, because those classes already stream, flush, cancel, and report word times, and a second wrapper would repeat them. For the model it does not, because LiveKit's class gives compaction and refusals no place, and M3.7 must control the exact history sent, so the agent's `llmNode` calls our interface. LiveKit itself is not wrapped. It is the framework that holds the room, the session, and turn detection, and an interface over it would be as large as it is.

**What a vendor must give.** `provider-suite.ts` is one suite every adapter must pass. A voice gives audio and word times that name every word and rise across a flush, and a closed stream ends. A transcriber gives interim text before final text. A model streams text in pieces, reports its tokens, and stops when cancelled. The fakes are adapters too, and they pass, 5 of 5. A voice with no word times fails, and so does a model that sends its reply whole. ElevenLabs' adapter takes the same suite in M3.2 and Muse's in M3.6, on new fakes, because `fake-providers.mjs` speaks only Cartesia's and Deepgram's wires. Two fake voices, one on the wire and one in the process, ran the whole beat proof with one line changed: the wire voice heard 125 of 125 timed words, and the in-process voice 125 of 125. M3.6 moves all of this to `apps/agent`, where CI runs it.

**What a switch still costs.**

- A voice must give word times, or the clock does not fit, and no adapter can hide that. A new one also needs M3.2's measurements again, because flush behavior and word time noise differ.
- A new transcriber needs the turn timings retuned, the 700 ms grace and the 1 s rule, and the reaction list checked against what it writes.
- A new model needs its prompt retuned and M3.8's evaluations rerun before it ships. That is the real gate on a model switch. Its thinking blocks do not carry over, so a session cannot change model mid-way.
- Moving off LiveKit rewrites the session wiring and `ttsNode` in `apps/agent`, `apps/api/src/livekit/`, and the browser's room code, and reruns every turn and latency proof, about the size of M3.6 again by my guess. The clock, reader, scene language, log, and turn rule stay.

## Node or Python

Node, because only Node shares our types. A Python agent would need a second copy of the scene language, which `CLAUDE.md` rules out, or a generator. The measurements do not decide this. The same agent ran on both SDKs against the same fakes in the first round, and they match on interruption and word timing. The cap difference is not established. Python carried less audio after a stop and used less memory (152 to 420 MB against 337 to 692 MB), and its typed stop was faster. Node reached first audio about 90 ms sooner on multi-sentence replies. The features only Python has are ones we do not need. Moving later would mean a second parser, so choosing Node is a real commitment. The full table is in `results/README.md`. Python did not rerun with this round's rule, because it is not the choice.

## The screen

The live session uses M2.5's route, `/sessions/:sessionId`, outside `AppShell`, because `AppShell` keys its page on the path and a URL change would remount the page and kill the session. It follows `docs/DESIGN.md` and the prototype's session grid. A bordered board panel takes 7 parts and a talk column takes 5, stacked on a phone. The page is still at rest, and motion has a cause: a word or the student's hand. Audio needs a user gesture, which submitting on Home gives. After a reload, one "Continue" button starts the audio.

## What changes in the plan

These were all the changes this design made to the approved plan. They went into `docs/plans/mvp.md` and the issues on 4 November 2026, with your later decisions, so this table records why and the plan leads.

| PR | Change |
| --- | --- |
| M3.1 | `packages/contracts` ships runtime parsers, not only types. `"type": "module"`, `.ts` imports, and `allowImportingTsExtensions` in its and the web app's `tsconfig.json`. The `theme/no-vendor-imports` lint rule. |
| M2.5, M3.10 | The live route, `/sessions/:sessionId`, sits outside `AppShell`. |
| M2.6 | Landed first, and tables moved from the private `app` schema to `public` with row security on, as you ruled. So the log table goes there too, through `infrastructure/orm` with a generated migration. |
| M2.8 | Landed first, and its sample privacy page names these vendors. M3.6 rechecks that page against the final settings and the full read of Meta's and ElevenLabs' terms. |
| Before M3.2 | A first-word speed test of all three models, as you chose. The keys exist and it ran on 3 November. Its working record is `vendor-test/`, outside this repo, and nothing from it is copied here yet. A router and other vendors' models were compared the same day, and you kept Sonnet 5.5. `docs/tests/tutor-model.md` records it in M3.7. |
| M3.2 | Its stop for the Cartesia account is done, and it builds the ElevenLabs adapter, first in Casey's voice and now in Chris's, starting on Flash until it reports with clips for you. Moves here from M3.6: the worklet clock over real WebRTC on a local LiveKit server, the proof of the browser's mute, and `audioGap` from a small publisher. It carries this round's clock fixes into real code: lateness adds up, an opened gap always closes, and the hold has a bound. "Never from timers" gains one exception, the fallback when audio cannot run. The ElevenLabs list in "What M3.2 and M3.6 must measure again". The player lets a scene be any deterministic function of the clock. The 150 ms rule reads as decision 3 says. The player sends `questionHeard`, counts words only while there is sound, and fires cues behind the per-block gate. It builds behind the provider boundary. The measured drift rule is on cues really fired. |
| M3.3 to M3.5 | New commands: `reveal`, `setParameter`, `seek`, `until`, `overWords`. Text-only rendering, KaTeX `trust: false`, `parsePlotExpression` with no `eval`, Maps for names. Simulation ranges from `SIMULATION_MODELS`. |
| M3.6 | Depends on M3.2, not only M3.1, because the clock and mute live there and V2 rests on the mute. Builds `apps/agent` behind the provider boundary, and moves `provider-suite.ts` there. Its stop for Deepgram, Cartesia, and LiveKit is done, and it builds behind the adapter on Muse, on LiveKit Cloud with a free project until real students, with a guard for held finals. Code reacts first and connections stay warm. Its own `ttsNode`, which sends `audioGap`. Early model start, which gives no head start at S 698 ms against D 450 ms, so M3.6 decides whether it earns its place. A 300 ms floor, and a 1 s cap with the 2 s rule under decision 4. `ttsTextTransforms: null`, `aecWarmupDuration: null`, `record: false`, `closeOnDisconnect: false`, `minWords: 9999`, `resumeFalseInterruption: false`. The `@livekit/agents` pin at 1.9.5. The turn rule with resume, `getResumeScript`, and `clearUserTurn`, with digits as words and the story that proves it. `stop` on a cut reply. The 8 s timer. An echo test, and the echo word filter this document describes. `@livekit/agents-plugin-meta` in `theme/no-vendor-imports`. The "Interrupting stops the agent within 150 ms" check and rule read as decision 3 says, and gain first sound to yield at most 300 ms, and first sound to silence at most 1.2 s at p95, as starting values. |
| M3.6, its speed check | Reads as your two numbers. A first reaction under 200 ms from code, and a first real word as fast as the vendors allow, with no fixed limit and each step's share reported. |
| M3.6, its perf rule | Fail if first reaction exceeds 200 ms at p95, or if stop time misses decision 3. First real word is reported to you. |
| M3.7, its perf rule | Fail if first reaction exceeds 200 ms at p95. First real word is reported to you, and so is cost above $0.15 a minute. |
| M3.7 | The reader, the prompt's rules, and the note to the model, with a model adapter so a model runs by name. It runs on Sonnet 5.5. A 90-turn test added to the 30-turn test, because 30 turns is only 10 minutes. Compaction under decision 11. B2's guard. Its perf rule measures first real word, not first audio, so a reaction cannot pass it. |
| M3.7, M3.8 | Stock phrases and short reactions, under decision 5. |
| M3.7 | The speed test's measures. Thinking off, `strict: true` off, a timeout for stalls, a space at the seam before a tool call, `terminated` handled if fast mode is used, and Prototype B's 1.18 s reconciled. |
| M3.12, new | The shared board, after M3.7 and before M3.10, which depends on it. |
| M3.13, M3.14, new | The scene queue and lesson flow, and the 3D scene command with its kit, checked library, fit router, and live generation. M3.10 depends on M3.13. The scene test is still running, so these may change. |
| M3.8 | Its evaluations must run against any model by name, so a later model change reruns them. A new case from your Aristotle note: the student interrupts to ask for clarification, and the tutor answers it, then goes back to the point without repeating itself. A test that no internal tag or spoken math mark reaches the voice. |
| M3.9 | `system` and `tools` stay frozen for prompt caching, so the current step goes in as an appended message. |
| M3.10 | Its perf rule measures first real word, not first audio. |
| M3.11 | Narrowed to ink and uploads, which use the shapes above, with handwriting through a small reader call and then the code check. It settles its open row. |
| M4.4 | Adds the key-moments command. |
| M4.5 | Anthropic's zero-retention agreement, Meta's and ElevenLabs' age rules, and a full read of their terms go into the legal review. |
| PRD section 10 | The cost table is superseded by the table above. |
| PRD Q8, plan section on live tutor facts | ElevenLabs and Chris replace Cartesia. Muse replaces Deepgram. You chose Chris by ear, so a blind test of voices runs only if you still want one. |

## Alternatives that lost

The PRD's `say` plus `cues` lost because every author must count words. A browser-written log lost because the record would depend on a tab that can close. The agent working out what played lost because it cannot see the jitter buffer. The browser guessing lost from late lost for the reasons above. Structured output lost because a schema with 25 branches is untested and a failure is not speech. A `speak` tool lost because it can be skipped under `auto` and forced tool use is gone. Stopping on any voice makes every "uh-huh" a gap of about 2 s.

## What M3.2 and M3.6 must measure again

M3.6 has run its list too, and `docs/tests/voice.md` holds its figures. M3.2 has run its list on real ElevenLabs, first with Casey and then with Abel's final choice, Chris, and `docs/tests/scene-player.md` holds what it measured and says whose each figure is. That record replaces the first-look figures in this document where they differ, and it names what stays open. No proof here has run Muse. The plugin facts below come from the 1.9.5 npm packages, read and not run. Figures from the speed test came from Abel's Mac on a West African network, on synthetic speech, on the vendors' own sockets and not through these plugins, so these PRs measure again from the agent's region.

**M3.2, ElevenLabs.**

- The main open risk to the clock: on Flash and Turbo alignment arrives in the same message as its audio, in 75 of 75 messages measured, and the plugin holds each chunk's last word until the next chunk or the final. So word times have near zero lead, and the proofs ran with a lead. This touches `questionHeard` too.
- `close_context` does not cancel. About 10 s of audio on Flash and about 11.5 s on v4 Turbo still arrived after it. Turbo sent nothing after it on 3 of 3 runs, and the test does not say why. So M3.2 drops queued audio on stop.
- v4 Turbo needs the dialogue socket and restarts its word times at 0 in each message, and 119 of 274 messages had none.
- Zero the clock for 0 to 75 ms of leading silence. Open the socket before the first turn, because a new one cost about 420 ms.
- The flush figures of 98 and 801 ms came from a fake of Cartesia's wire. The plugin sends `flush: true` only in auto mode, which `chunkLengthSchedule` turns off. In the speed test, `auto_mode=true` started unflushed text as fast as flushed text. M3.2 brings you the flush rule with its clips.
- The 1 s context close and the new-context fallback are Cartesia facts.
- `preferredAlignment` defaults to `normalized`, so "2.5" may become several words and shift every later `atWord`.
- The plugin subtracts leading silence from word times, and the tracker counts it. M3.2 found the plugin subtracts the second character's start, which moved every word early, so it patches that line and zeroes both at the first audible sample.
- Also word time noise, stall reads on real chunk sizes, the F step from the agent's region, stock phrases' stored word times, and new fakes.

**M3.6, Muse.**

- The 674 ms stop came from a fake interim. Real first partials were p50 966 ms and p95 1351 ms on Muse, and 57 of 120 lines had none by 1 s. A final is the server's `speechComplete`, and the plugin's `flush()` sends only pending audio, so S, max(D, S + M), and early model start may move.
- A final later than the 700 ms grace gives stop, resume, stop, so the tutor talks over the student. On Muse that is close to the median case, so it needs a rule. If the voice detector hears silence, a partial exists, and no final arrives within a bound, the tutor acts on the partial, and M3.6 measures that bound on a real microphone in a noisy room.
- Turn patience's 38 of 120 and decision 4's cost need rerunning, because the detector scored the fake's exact text.
- `clearUserTurn` means a new handshake on each reaction. A new Muse session took 1046 to 2543 ms, so every clear on a reaction costs that.
- Spellings. Muse wrote "12", "9.8", and "4 ac" in `muse-corpus.json`, so digits are real.
- Keywords are fixed at the handshake, showed no benefit on Muse, and slowed two first turns to 3.7 and 4.0 s. Sessions cap at 60 minutes with no rotation. The plugin has no equal to `mipOptOut`.
- `theme/no-vendor-imports` lets `@livekit/agents-plugin-meta` pass in `apps/web`, so M3.6 adds it.

**LiveKit Cloud.** V2's delivery figures, the trip's 60 ms, and the 401 to 641 ms join are local-server numbers, so M3.6 measures them on Cloud.

**A lag step with no report, for M3.6 and M3.7.** One run of 11 at 24 kHz on 40 ms of delay, 30 ms of jitter, and 1% loss, a reviewer's, took a single step of about 320 ms in word lag partway through a 21 s turn, with no `audioGap`. It put 15 of 33 cues on every third word over 100 ms, at p95 352 ms and worst 373 ms. The agent's queue never ran dry, so it has nothing to report, and my reading is that the jitter buffer grew after a burst of loss. Later cues in that turn fire early by the step, except where the gate holds one in a silence, and the error ends with the turn because the clock restarts. So M3.6 measures how often this happens on LiveKit Cloud and a real network, and M3.7 knows a long turn carries the risk longer. If it is common, the fix is to count from the next pause, which this PR does not build.

**Follow-ups, with owners.** All of these ran at `02b8b67`, and this round did not rerun them.

- M3.2. A stall in leading silence moves the count back for the whole turn, -460 ms at a 500 ms stall, read from `clock-rule.mjs`.
- M3.2. A late turn message after any silence of 107 ms or more takes the last onset, p95 1441 ms with word times 1500 ms late. Answered: "Where a turn starts" above.
- M3.2. Drift with no stall: 2 of 12 turns ran 46 and 122 ms early with no report, so later words' whole-run p95 was 46 ms on a reviewer's run against this document's 5. Answered: the plugin's default 22050 Hz played slow by 2.27 ms a second, because LiveKit frames 10 ms as whole samples. At 24 kHz the lag is flat, and `docs/tests/scene-player.md` has the rows.
- M3.2. The worklet on Safari, Firefox, and Android, because the clock moved here from M3.6.
- M3.6. "Mm-hmm" stopped the tutor 3 of 3 and got a reply. By the rule so do "Mhmm", "Hm", "Mmm", "Um", "Oh", "I see", and "Got it". "Um" is a filler in `agent-node.mjs` and a real word in the rule.
- M3.6. A stop during thinking with interim words only has nothing to resume, and the answer to "Gravity." was lost in 2 of 3, so M3.6 needs a rule to rerun the model.
- M3.6. The echo word filter under "The SDK's echo wait" has a plan row and no code yet.

## Still unproven

Every result below rests on fakes unless it names a vendor. The fake voice sends word times before audio, the fake transcriber returns exact words, and neither has a connection cost.

**M3.2, with real ElevenLabs.** `docs/tests/scene-player.md` answers most of this list. The rest of this paragraph is the list as first written. Whether its words match ours for numbers and symbols. Whether a mid-sentence flush sounds natural and speaks at once, and whether contexts close. The clock with word times that arrive with their audio. How noisy they are, since the first look's method is not validated. The clock on real speech over real WebRTC. Whether `audioGap` reads true on a real voice, and whether a real voice ever runs slower than real time. The mute on Safari, iOS, and Android. Whether the worklet works on Safari, Firefox, and Android.

**M3.6, with real Muse, LiveKit Cloud, a real network, and real devices.** When transcripts really arrive from the agent's region, which sets the stop time, the grace, and S. Starting the model early helped with fakes, 508 against 820 ms, but the fake's final fired about 1250 ms before the student finished, so that is not evidence. Whether real transcripts catch "uh-huh" and "hmm". Whether `audioGap` holds through the real `ttsNode` with a real voice. Echo through a laptop speaker with the wait off. Bluetooth delay. A real dropped network. The detector's cap on real speech. LiveKit Cloud's adaptive interruption and full detector, which every run here left off with `mode: 'vad'` and `v1-mini`, so M3.6 chooses whether to test them. Capacity, because the worker refuses sessions above 70% CPU. A resume when the model is still writing. A lost first sound, which moves a whole turn's cues late.

**M3.7, with the real model.** First-word speed from the agent's region on the real prompt. How often commands parse. Whether a long command empties the audio. Whether the note and a cancelled reply pass the history check. Whether compaction keeps the tutor's memory and costs what this says, because its read price and summary size are unchecked. What the tutor says after a refusal: Opus 5.5 can decline as `bio` on a biology lesson, and Sonnet 5.5 has five categories, `cyber`, `bio`, `frontier_llm`, `reasoning_extraction`, and `general_harms`, so benign work can trigger one. Real tokens and cost.

**After M3.10.** Whether students feel any of this, which is test 5 in PRD section 13, and whether it holds up next to Aristotle when you try both. Your session's note says nothing on the board, so PRD section 4's board row stays open.

## For later owners

| Owner | Note |
| --- | --- |
| M3.2 | Unmute on the next `turnStarted`, never earlier, and later while old audio from a stop can still be arriving. Rebuild by time, not sequence number. A `turnStarted` that lands within 300 ms of sound takes the first onset since the last turn ended, under "Where a turn starts". |
| M3.4 | A live frame drawn before a cut's later word times land shows `ASSUMED_WORD_MS`, and a replay reads the times the report settled on. A reviewer's run differed on 8 of 56 samples, by up to 0.33 scene seconds, while the times were late. Once they land the two agree. M3.4 owns `overWords`, so decide whether that gap can show. |
| M3.6 | Done, each with a test that failed first, and `docs/tests/voice.md` lists them. Follow-ups from M3.2's review, none fixed there. A page reload restarts the browser's clock under the one kept offset in `session-log.ts`, so later beats land at the wrong session times. A report the session log refuses throws in `lab-agent`, and in the real agent must not end the session. The lab picks its clock once, at a race with the audio context. The lab's resume fires a beat's cues again when `played` has not landed. Room token grants are wider than they need to be. A hole in word times becomes `null` on the wire, and the parser refuses the report. |
| M3.6 | Measured in `docs/tests/voice.md`. A reaction right after a stop spends 150 ms of its 200 ms on `TURN_SILENCE_MS`. Lowering it needs the probe's 107 ms to move too. |
| M3.6 | Done, on `createLiveSession`'s stop. Barge-in must stop every live turn, not only the newest. A stop on a queued turn leaves the turn before it playing, as `createVoiceLine` now promises, so a student who talks over a queued reply would hear that turn out. The lab's `interrupt` stops only the newest. |
| M3.6 | Answered, because the SDK never speaks and the track carries only the line. The SDK's `ttsNode` output owns its own audio source, so nothing enforces `createVoiceLine` on that path yet. A turn that goes round it leaves no silence, and the browser loses where the turn starts. Route that output through the line, or prove another way to keep the rule. |
| M3.6 | Done, with a 3 s bound and a stored line. A queued turn waits behind a failing voice for up to 11 s, because the line stays taken until the turn before has gone, and the plugin gives up on a silent chunk after about 10 s. A reaction cannot wait that long, so decide what stops the failing turn sooner. |
| M3.6 | A real first sound more than 1 s after a turn's first word times. The bound starts the clock, and the real onset is then ignored, so later cues run early by the rest. A reviewer's fake run with first audio 1.6 s late fired a cue 600 ms early. |
| M3.6 | A late `turnStarted` with the last turn still open. On a reviewer's fake runs the new turn's cues ran 680 and 1450 ms late. |
| M3.6 | A `turnStarted` later than its own first sound clips that sound, because the gain waits for the message. On the worst link it landed 3, 22, 22, and 502 ms late on 4 of 119 aimed stops, and 0 of 80 on the two better links. `stop` already goes on both channels, and `turnStarted` going on both would shorten this, once a second copy is ignored. |
| M3.6 | A last word shorter than the output latency reports its beat as interrupted, because the next turn's `turnStarted` lands before that word is heard. A reviewer's fake run at 200 ms of latency did this. |
| M3.6 | A word of old audio past the 110 ms, on the worst link, as "What remains after a stop" says: audio past the gain on 2 of 119 aimed stops, for 12 and 74 ms, an early cue on a first word by reading, and a word of 200 ms or more running its turn early. If a real link shows it, the exact fix is for `stop` to carry how much of the turn's audio left the agent, so the browser can count to its end. `audioSentMs` on M3.6's branch is most of that. This PR leaves the wire as it is. |
| M3.6, M3.7 | A stored reaction under 200 ms right after a stop is given up as a first sound, so the 1 s bound starts its turn, and a first word that short with a pause after it starts the turn late by both. None of 48 phrases on 9 real takes ran under 250 ms, so check the reaction list. Checked: a test holds every stored take at 250 ms or more. |
| M3.6 | Done. Read `onFailure` from `speakTurn`. A refused frame now ends a turn as a stop and `finished` never rejects, so nothing else reports it. |
| M3.7 | A stored phrase must be at a rate LiveKit frames in whole samples, 24 kHz here, or `createVoiceLine` refuses it. Store each take with its own word times, as M3.2 found. |
| M3.14 | A scene catalog needs a guard and a cache. A catalog that throws during a stop kills the report, NaN or Infinity durations are refused by the parser, the catalog rebuilds on every frame, and `Scene.parts` is unread. `getFrame` will need to be async for a sandbox. |
| M3.2 | `questionHeard` can still fail if a close is lost within 3 s of the last word on both channels, because `stop-page.js:49` stops ticking when audio ends. Add a burst check, because removing `Math.max(0, ...)` from the tracker still passes 9 of 9. The tracker's owner is M3.2 first, not M3.6. |
| M3.2, M3.6 | An early-ended voice stream. On a reviewer's run, a 7 s stall on the Cartesia plugin hit `chunkTimeout` of 5000 ms, and the reply ended at 5.3 s with 8 of 33 words heard, 1 of 4 cues fired, and no stop or played report. By reading, the ElevenLabs plugin rejects with a non-retryable timeout after 10 s with no audio on a sent chunk. Decide what it means for the log and the note. |
| M3.4 | Hiding a `simulate` leaves arrows that follow it on the board. Decide what goes with it. |
| M3.6 | A background tab or locked phone suspends audio, so the clock stops. Decide what the agent does. |
| M3.6 | Blocked audio: the agent is never told, and the note would say "heard". The browser must report it. |
| M3.6 | After a reconnect only the cut beat resumes in the proof. Decide what happens to the rest of the turn. |
| M3.6 | Student captions: choose between LiveKit's transcription stream and our own message. |
| M3.6 | `agent-node.mjs`'s resume uses a constant reply and a cumulative count, so copy `getResumeScript` from `stop-agent.mjs` and not that. `getResumeScript` can return more than 12 commands, or commands with no words left, so the agent needs a rule for both. |
| M3.6 | The reader's board can hold an element whose cue never fired after a cut. Rebuild it from the report before a resume. |
| M3.6 | Words the fake gave exactly may not come back from Muse that way, so check the reaction and filler lists against real transcripts. |
| M3.6 | `turn-rule-check.mjs:53` repeats line 45, so 33 stories are 32 cases. A lone "-" and "uh - huh" count as real words. `isSmallReaction` returns true for text with no words. |
| M3.7 | The reader must drop internal XML tags, which it does not do today. The prompt must write math in words in speech. |
| M3.10 | Agent-to-API auth and the log table's owner. |
| M4.5 | For the legal read. Meta's sections 4.1, 4.4, and 10.3 allow retention for safety and human review. Meta's restricted territories include Ethiopia and Pakistan. ElevenLabs' use policy requires parental consent records where it approves such a product, and you turned parent consent off, so the review must weigh that. |

## Decisions in full

**1. The design.** Approved on 3 November 2026.

**2. Node or Python.** Node, for the reason above.

**3. What V2's 150 ms measures.** A: from the agent's decision to stop, to silence and a frozen board, on a good connection, with two limits the student can feel: first sound to yield at most 300 ms, and first sound to silence at most 1.2 s at p95. Those are starting values, written into M3.6's perf rule, and the runs here gave 182 ms and 790 ms at p95 with fakes. On Muse's real partials the 1 s rule often cuts first, so the 1.2 s may be tight, by my inference. As written, from the student's first sound, cannot be met: the fastest rule tested left 388 ms of audio at p50 and 597 ms at p95 with instant fakes, and it stopped on every "uh-huh". If M3.2's mute test fails on a browser, audio keeps coming for about 150 ms after the stop there. Then A misses on that browser, M3.2 stops by its own rule, and you choose between that browser and a slower target.

**4. Turn patience.** B. See "Turn patience" for its cost.

**5. Stock phrases.** First A: "Let me work that out." during a tool call, in the tutor's voice. On 3 November you added short reactions from code, because the model cannot meet V1. A repeated phrase turns into a tic, and this applies most to this one, so each voice gets three versions, and no phrase plays twice in three turns. A stock phrase is a normal beat with stored word times. The browser's clock counts it, captions show it, the log records it, and the student can interrupt it. A reaction alone would pass a first-sound test, so M3.7 reports first reaction and first real word as two numbers.

**6. The voice. ElevenLabs, voice Chris.** You chose Chris on 4 November after hearing Casey, Chris, and Eric, voice id `iP95p4xoKVk53GoZ742B`, American, male, labeled conversational and casual. He is one of ElevenLabs' own voices and not a library voice, so no owner's notice applies, and the id stays in one place. You first chose Casey, on 3 November, and M3.2's first measurements are hers. 6M characters at $40 per million is $240 a month, the listed price for Flash and Turbo read on 3 November 2026. He stays on Flash unless you say otherwise. `@livekit/agents-plugin-elevenlabs` 1.9.5 asks for word times, and M3.2 measures them. Its usage policy and training opt-out are under "Decide here" and "What leaves our servers".

**7. Transcription. Settled on Meta's Muse Voice Transcribe.** On synthetic speech Nova-3 was ahead, 533 and 604 ms against 670 and 957 ms. On Abel's own voice, on 14 clean lines with a built-in microphone in a quiet room, Muse made 4 word errors of 99 against Nova-3's 10, and caught "Wait", "Hmm", and "discriminant", which Nova-3 heard as "Width", nothing, and "Descriptor". Nova-3 was about 95 ms faster at the median. This is one voice, and Muse's long hold under noise, up to 3.9 s on synthetic speech, is untested on a real microphone, so M3.6 acts on the partial if the voice detector hears silence and no final arrives within a bound it measures. 12,000 minutes at $3 per 1,000 is $36 a month, the listed price read on 3 November 2026, and using it is Standard Services under Meta's designation policy. M3.6 writes the adapter on `@livekit/agents-plugin-meta` 1.9.5. Nova-3's finals were faster, as "The time budget" lists, but it ran through LiveKit Inference, which decisions 8 and 9 leave out, and its finals are not an end of turn: 6 of 43 came 346 to 2225 ms early.

**8 and 9. Hosting. LiveKit Cloud with our own accounts, not Inference.** [LiveKit Cloud](https://livekit.com/pricing): Ship from $50 with 5,000 agent minutes, then $0.01 a minute, and 20 sessions at once, so $120 a month. Each user connects to the nearest edge. Cloud also offers the full turn detector and Krisp noise cancellation. The design does not rely on adaptive interruption or the full detector: every run here used `mode: 'vad'` and `v1-mini`, and no noise cancellation has been tested here. A free local LiveKit server still runs M3.2's lab page, and M3.6 uses a free Cloud project until real students.

**10. The model.** Sonnet 5.5, with code reacting first, a timeout for stalls, and no talking router for now, on your answer of 3 November 2026. All three were tested that day, because thinking cannot be turned off on Opus and public figures put it far outside V1, and a router and other vendors' models were compared. "The time budget" has the results, and `vendor-test/` and `model-bakeoff/` outside this repo are the working record. A serial classifier added about 800 ms to every turn, and no candidate met M's budget. [Prices](https://platform.claude.com/docs/en/about-claude/pricing) per million tokens: Opus 5.5 $4 in, $20 out, $0.20 cache read. Sonnet 5.5 $2, $10, $0.10. Haiku 5.5 $0.10, $0.50, $0.01, and five times that above 100,000 tokens. The cost tables use Sonnet 5.5, at about 40% of Opus's model cost. [Tier caps](https://platform.claude.com/docs/en/api/rate-limits): Start stops at $500 a month and Build at $1,000, and calls return 429 until the next month, so request Scale before the beta, or the tutor goes silent mid-month.

**11. Long sessions.** B, with C as the fallback. History is append-only, so every turn adds about 1,600 tokens that every later turn pays for. Letting it grow, a 30-minute Opus session costs $0.145 a minute for all four services, or $0.204 with background work and the buffer, against the PRD's $0.15, and Sonnet $0.079 and $0.118. B is on-demand compaction (beta `compact-2026-09-04`) in the background when the prompt reaches about 60,000 tokens, with the turn going on while it runs. The docs say kept turns stay valid after the swap. That gives Opus $0.127 and $0.180, and Sonnet $0.071 and $0.107, which assumes a 4,000 token summary and a compaction read billed at the cached rate, neither of them checked yet. C is our own summary on a cheap model, starting a fresh conversation, which loses the thinking and the cache. M3.7's new 90-turn test decides whether B holds.
