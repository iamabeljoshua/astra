# The live session

Status: waiting for Abel's approval on issue #10. Only types, parsers, their tests, and throwaway proofs exist.

## Decide here

**What you are agreeing to.** The tutor writes one script with each drawing placed inside the sentence. The agent sends the words to the voice and the drawings to the browser. The browser counts the samples of the tutor's own audio and fires each drawing on its word. When the student speaks, the tutor lowers its voice within about 200 ms and cuts off mid-word when it hears a real word. The browser then reports exactly what was heard and seen, and that report becomes the log, the replay, and what the tutor is told next. It runs on Node, LiveKit, Deepgram, Cartesia, and the Anthropic API. Approving this also approves "What changes in the plan" below. Every number comes from runs with fake vendors unless it says otherwise, so "Still unproven" is part of the deal.

**The reference to beat.** You tried a real Aristotle session: "it felt human in the conversation, like i could interrupt and talk to it, ask for clarification and it just knows what to say next like a human tutor would, and it takes it at my pace". That is one person's impression of one session, and no machine test of Aristotle exists. It says nothing on reply speed or the board, so this document claims nothing about those from it.

| What you felt | How this design delivers it | Proven, with fakes | Not proven |
| --- | --- | --- | --- |
| Interrupt it and talk back | The tutor yields at about 170 ms and cuts off on the first real word at about 640 ms, with the board frozen. "Wait." alone stops it. "Uh-huh" does not. A long noise pauses it, and it picks up from the cut word. | All of that, in live runs. The mute and the rebuilt board in real Chromium, 10 of 10. | Real transcript timing, a laptop speaker's echo, and Safari, iOS, and Android. |
| Ask for clarification, and it knows what to say next | The browser reports the word and frame where it stopped. The next turn gets a note with what was heard, what was not, and what is on the board. M3.9 adds the lesson's current step. | Only the facts reaching the agent. | Whether the reply is right. No real model has run. This is the largest unknown here. M3.7 and M3.8 own it, and M3.8 gains a test for it. |
| It goes at my pace | A question ends the turn. "Hmm" holds the floor for 8 s. Real words after a question or an interruption wait 2 s under decision 4. | The waits, with exact words from the fake. | Whether real transcripts catch "hmm", and whether the teaching itself paces well, which is M3.8's. |

| # | Decision | Options | My pick | Beta month |
| --- | --- | --- | --- | --- |
| 1 | The design | Approve, or say what to change | Approve | $0 |
| 2 | Agent language | Node, Python | Node | $0 |
| 3 | What V2's 150 ms measures | A. The agent's decision to silence, plus limits the student can feel. B. First sound to silence, as written | A | $0 |
| 4 | Turn patience | A. 8 s after a filler, 1 s after real words. B. A, and 2 s after real words when the tutor just asked a question or was just interrupted. C. 3 s and 1 s | B | $0 |
| 5 | Stock phrases | A. "Let me work that out." only. B. Also "Mm." C. None | A | About $0 |
| 6 | Cartesia, for M3.2 | Pro now with zero retention on, Scale for the beta | Yes | $5, then $299 |
| 7 | Deepgram, for M3.6 | Nova-3 with the training opt-out, or Flux at the same rate | Nova-3, test Flux | $108 after $200 free |
| 8 | LiveKit hosting | A. Cloud runs the agent. B. Cloud, our agent servers. C. All ours | A | A $120. B about $260. C about $400. B and C are guesses |
| 9 | How to buy voice and speech | A. Our own Cartesia and Deepgram accounts. B. LiveKit Inference | A now, test B in M3.6 | A $407. B about $292 |
| 10 | The model, for M3.7 | Opus 5.5, Sonnet 5.5, Haiku 5.5 | Test first-word speed before choosing. I expect Sonnet 5.5 | Model alone, with compaction: Opus $1,116. Sonnet $456. Haiku $24 |
| 11 | Long sessions | A. Let history grow. B. Compact in the background. C. Our own summary, restart the conversation | B | Saves $228 on Opus |

**All four services for a beta month**, 12,000 minutes in 30-minute sessions. Opus with growing history is $1,871, and $2,620 with background work and the PRD's 30% buffer, which breaks the $2,000 budget. Opus with compaction is $1,643 and $2,323. Sonnet with compaction is $983 and $1,465. Haiku with compaction is $551 and $904.

**One hour of tutoring.** PRD Q21 sells 5 hours for $49, which is $9.80 an hour.

| Model and history | Per minute, all four services | One hour | With background work and a 30% buffer |
| --- | --- | --- | --- |
| Opus, flat 15,000 token prompt, as the PRD assumed | $0.104 | $6.23 | $9.04 |
| Opus, 60 minutes, history grows | $0.199 | $11.93 | $16.45 |
| Opus, 60 minutes, compaction | $0.138 | $8.29 | $11.71 |
| Sonnet, 60 minutes, history grows | $0.109 | $6.51 | $9.40 |
| Sonnet, 60 minutes, compaction | $0.083 | $4.96 | $7.39 |
| Haiku, 60 minutes, history grows | $0.067 | $4.00 | $6.14 |

The $0.104 is $0.060 for the model, $0.0249 for Cartesia ($299 over 12,000 minutes), $0.0090 for Deepgram ($0.0077 plus $0.0013 for keyterms), and $0.0100 for LiveKit ($50 plus 7,000 minutes at $0.01, over 12,000 minutes). The model's $0.060 is 3 turns a minute of 15,000 cached tokens at $0.20, 1,000 new tokens at $5, and 600 output tokens at $20, per million. History growth adds 1,600 tokens a turn, because history is append-only. `results/cost.json` is the output of `cost.mjs`, which shows every step. All prices are list prices as read on 3 November 2026. They are estimates until M3.7 and M3.10 measure real tokens.

**The words in this document.**

- V1: first tutor sound within 800 ms at p50 and 1.5 s at p95 of the student finishing. V2: on interruption, speech and board stop within 150 ms, and "uh-huh" stops neither. V5: the tutor resumes after a dropped connection.
- B1: a drawing starts within 100 ms of its word. B2: a turn's first drawing within 1 s of its first word. B5: the board library. B6: rewind. B7: exact replay from the log. B8: student drawing and uploads. These are PRD codes. The budget's steps below are called D, S, M, and F so they do not collide.
- T1: never hand over the answer early. T3: no third question on one point. T5: wait at least 8 s after a question, and "hmm, let me think" does not end the student's turn. T6: all numbers come from code. S5: raw audio is not stored. S6: no training on under-18 data.
- Aristotle: heyaristotle.com, the closest competitor. "Beats Aristotle" is a target until M3.10, when you can compare them.
- RTP: the numbered timestamps on each audio packet. Jitter buffer: where the browser holds packets to smooth an uneven network, which delays audio by a varying amount. p50 and p95: half and 95% of cases are at or under this value. Flush: telling the voice to speak the text it has now. Thinking blocks: the model's private reasoning, billed as output and written before the first word. Beat: one spoken phrase with its drawings inside it. Yield: the tutor lowers its voice. Stop: the tutor cuts off and the board freezes.

## The design in one page

**The story.** A student says "Wait, then why does it come down?" while the ball is flying. About 170 ms after their first sound, the tutor drops about 12 dB and keeps talking. About 640 ms in, the first real word arrives. The tutor cuts off mid-word, the ball freezes on that frame, and the caption stops on that word. The browser reports what played. The tutor answers knowing exactly where it stopped.

The board is the PRD's own bet and is separate from your note. Drawings land on their words, and motion can arrive on a word, because speech, captions, and board read one clock.

## What runs where

```text
 STUDENT'S BROWSER (apps/web)              LIVEKIT             AGENT (apps/agent, Node)             PAID SERVICES
+-------------------------------+        +---------+        +------------------------------+
| microphone ------ voice ------|------->|         |------->| voice and turn detection     |
| <audio> <-------- tutor voice |<-------|  room   |<-------| speech to text <-------------|-----> Deepgram
| clock: counts samples         |        |         |        | tutor voice <----------------|-----> Cartesia
| ScenePlayer: fires drawings   |<-------|         |<-------| tutor turn <-----------------|-----> Anthropic
| played reports, slider drags  |------->|         |------->| session log (only writer)    |
+-------------------------------+        +---------+        +---------------+--------------+
        | sign in, start a session, get a join token                        | log events, lesson context
        v                                                                   v
+------------------------------------------------------------------------------------------+
| API (apps/api, NestJS) ------> Postgres on Supabase, private app schema                  |
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

The agent reads this as it streams, inside its own `ttsNode`. `beat-text-reader.mjs` is that reader. M3.7 moves it to `apps/agent/src/tutor/` and keeps `reader-check.mjs` as its test. M3.2 moves `clock-rule.mjs` to `packages/board/src/player/`. The proofs folder stays until both moves land. Its rules:

- A brace, any spaces, then a quote starts a command, with its keys in any order. Other braces are dropped, so `{1, 2, 3}` is read as "1, 2, 3". JSON is never spoken.
- A refused command is dropped and reported, and its words still play. When JSON breaks and no brace closes it, the words after the break are spoken. The one loss is a string that never closes, which takes the rest of its line and is reported. M3.7 counts these.
- A beat holds at most 60 words, 600 characters, and 12 commands. Past a limit, the reader opens another beat.
- A line that ends in a question sets `expectsReply`, and the reader stops the turn there. So the tutor cannot write "What pulls on it?" and then answer itself.
- Markdown marks and emoji are not spoken. The reader removes them, because the SDK's own filter runs before `ttsNode` and changes commands. `(x-1)*(x+1)*(x+2)` lost its `*`, and `fs[i](x)` became `fsi`. M3.6 sets `ttsTextTransforms: null`. In a live run with the filter on, 0 of 4 test commands arrived unchanged, and with it off 4 of 4 did.
- A command that names nothing on the board, or the wrong kind of element, is dropped by `getBoardProblem`, and its words still play. So a dropped `simulate` takes its later `runSimulation` with it, and the note to the model says what never appeared.

`reader-check.mjs` runs 32 tricky cases at 4 stream sizes against the real parser.

**Flushing.** LiveKit's Cartesia plugin holds text until a sentence ends, so a long first sentence would wait for the model to finish writing it. The agent flushes before each command, at each beat end, and after a turn's first 8 words. At 100 tokens a second with fakes, first audio came 77 ms after the first words with this rule, and 801 ms with no flush in the first round's run. A flush falls between words, and a command inside a word waits for that word to finish.

This has limits that M3.2 tests. Cartesia's docs warn that a chunk with no sentence-ending punctuation can wait in its buffer and "sometimes ends with odd or distorted sounds", and 9 of the 19 flushes in the sample session end mid-sentence. Its docs say a context closes 1 second after its last audio, and a changelog entry suggests this may have changed. Three commands in a row at 50 tokens a second would pass that, by a rough model. Commands are slow to write, so the flagship beat has a modeled gap of 35 to 313 ms in the audio, depending on model speed. The fake never closes a context and sends word times before audio, so none of this has met real behavior.

The fallback, in order: flush only at commas and sentence ends, and let a cue wait for its word. Open a new context when one has closed, and add the time already played to its word times. Have the prompt place commands at clause boundaries. `pushText` is marked deprecated in the SDK, and a flush sentinel in its replacement, `updateInputStream`, ends the input. So M3.6 pins `@livekit/agents` 1.9.5 and uses `pushText` and `flush`. An upgrade past that needs one stream per flush, with word times stitched together.

**Facts from the Claude API docs, read through the `claude-api` skill.** Text after the last tool call stays `text` on all three models, and that is where the speech goes. Text between tool calls on Opus 5.5 and Sonnet 5.5 comes back as thinking blocks. `tool_choice` of `any` or `tool` returns a 400 on both, so plain text is safer than a `speak` tool. On Opus 5.5, for accounts created on or after 31 August 2026, editing an earlier turn invalidates later thinking blocks, and replaying them returns a 400. So an interrupted turn stays in history as written, and the truth goes after the student's next message as a `role: "system"` note. The SDK rewrites an interrupted turn itself (`agent_activity.ts:4319`), so M3.7 keeps its own history. A tool call comes before the words, so `compute` means two requests, and the agent plays "Let me work that out." under decision 5.

## How a drawing lands on its word

The agent sends word times ahead of the audio. The browser taps the tutor's audio with an `AudioWorklet`, finds the first audible sample, and counts from there. A cue fires when the count reaches its word and audio is sounding.

The count runs through natural pauses, because the word times include them. After a silence there are two cases. If packets kept arriving, the voice or model fell behind, so the audio is late and the count moves back to the next word. If nothing arrived, audio was lost with its words, so the count stays. RTP tells them apart. It advances during a late stall, and it stands still during a loss. In these runs a 200 ms stall advanced RTP by 120 to 140 ms during the silence, a 500 ms stall by 160 to 460 ms, and a 1 s loss by 0. Across the whole silence both advance by about the silence, so the check has to look inside it. Without this, the rule's p95 on lost audio was 1863 ms in a verifier's run. The rule could also overshoot by a whole word when a stall began just past a word's start, 3 of 12 stalls in one run, and it no longer does.

This table is the main technical bet. It shows the error from where each word really was, in ms, at p95, in real Chromium over real WebRTC, with a relay adding delay and loss.

| Method | Clean network | 40 ms delay, 30 ms jitter, 1% loss | 100 ms delay, 70 ms jitter, 4% loss | Audio late by 200 ms | Audio late by 500 ms | 1 s of audio lost every 8 s |
| --- | --- | --- | --- | --- | --- | --- |
| **Count samples, move back only if late (chosen)** | 3 | 20 | 37 | 18 | 16 | 9 |
| Count samples only | 3 | 20 | 37 | 211 | 511 | 9 |
| RTP only | 7 | 7 | 7 | 213 | 513 | 6 |
| When a data message arrives | 67 | 149 | 291 | 273 | 573 | 1310 |

B1 allows 100 ms. Data messages miss it because the jitter buffer holds the audio and not the data. LiveKit's own synced transcript lags by 106 ms at p50 and 278 ms at p95. Counting alone fails on late audio, and RTP alone fails on the same case, so the rule uses both. If M3.2 finds real speech harder to track, RTP can replace the count behind the same interface.

These runs use a test tone. The rule also ran offline on real `say` speech, with random pauses, stalls, and up to 3 s of lost audio, and the worst p95 was 18 ms. Two limits are known from that offline audit. A stall in the middle of a word can fire the next cue up to 378 ms early, and noisy word times hurt directly, with a median p95 of 78 ms at 30 ms of noise. M3.2 measures Cartesia's real word times against its audio, and adds word end times to the clock if it sees mid-word stalls.

The word times arrive first with the fake, at a median of 61 ms ahead, but the fake sends them before audio. Reliable delivery retries after a loss, and one message took 1327 ms on the worst link, so a late drawing will happen. Then the clock stays right, the drawing fires as soon as it can, and the voice is never held back. 

**Who proves this for real.** M3.2 owns it. Its lab page plays real Cartesia audio through a local LiveKit server, which is free, into the worklet clock, on a real network profile. That is the earliest moment the bet can fail, and it comes before three PRs of board work. M3.6 moves the same clock into the live route.

If the clock cannot run, because audio is blocked or there is no output device, a timer started when the word times arrive drives the board. A typed session with the tutor muted keeps audio flowing silently, so it uses the same clock. A typed message started a reply in about 85 ms with fakes, and typing over the tutor stopped it in about 48 ms.

## Interruption, moment by moment

At 150 ms of sound, "uh-huh" and "wait" look the same to any detector. A rule that stops that fast stopped on every "uh-huh", 5 of 5. A rule that waits for words alone leaves the tutor at full voice for about 700 ms. So the tutor yields first and stops when it knows. `turn-rule.mjs` is that rule as a pure function, for M3.6's `turn.test.ts`, and `turn-rule-check.mjs` runs it through 18 stories.

| After the student's first sound | The student hears | What happens |
| --- | --- | --- |
| About 170 ms (148 to 182 measured) | The tutor drops about 12 dB and keeps talking. The ball keeps flying. | The agent's voice detector sends `yield`. |
| About 640 ms (420 to 693 measured), from the fake's transcript timing, or 1 s with no words | The tutor cuts off mid-word. The ball freezes. | The first real word sends `stop`, on both data channels. The browser mutes and freezes at once, and reports `played`. |
| The student stops, plus the time budget | "Good question." The ball stays frozen. | The next turn starts with a note saying what was heard, what was not, and what is on the board. The model decides whether to return to the cut point. |

Three harder cases:

- **One word.** "Wait." can end before its transcript arrives. So the yield holds until the final transcript or 700 ms, and a real word within 800 ms after that still stops the tutor. It stopped 5 of 5 with the transcript arriving 0, 300, 600, and 900 ms later, at 615, 929, 1252, and 1428 ms at p50. Before this it stopped 0 of 4 at 300 and 600.
- **Sound with no words.** A cough or a television. If 1 s passes with no words, the tutor cuts. If no words arrive within 700 ms of the sound ending, it says the cut word again and carries on, with every drawing fired once. It resumed 5 of 5, and the student heard every word with the cut word twice, about 1.1 s after the sound ended. Before this the turn ended for good, 4 of 4. The SDK's own pause and resume took about 2 s and is not used, because `session.interrupt()` ends the speech.
- **"Uh-huh".** The voice drops at about 160 ms and comes back about 850 ms later. It stopped the tutor 0 of 10 times, and the audio never went silent. The SDK holds the reaction as the start of the student's next turn, and without a clear it answered stale text. So the agent calls `clearUserTurn` on every reaction. The next turn held stale text 6 of 6 times without the clear, and 0 of 6 with it. The clear waits a tick, because the SDK stores a final transcript just after reporting it. While the tutor's last beat has `expectsReply`, "yes" and "right" are answers and they stop the tutor.

**The SDK's echo wait.** `aecWarmupDuration` defaults to 3000 ms. While it runs, the SDK gives speech to text silence and blocks its own interruption, for the first reply and again on every rejoin. Talking 500 ms into the first reply, our stop came at 662 to 681 ms with the wait off and at 1155 to 1177 ms with the default, when only the 1 s rule could fire. A verifier saw the SDK's own interruption stop 0 of 2 with the default and 2 of 2 off, and 0 of 3 against 3 of 3 after a rejoin. M3.6 sets it to `null`. That removes the SDK's echo protection, so M3.6 must test a laptop speaker, and the agent ignores words that match what the tutor is saying.

**What V2 then measures.** From the agent's decision to stop, to silence and a frozen board. Sent on both channels, a message takes 3 ms at p95 on a clean network, 68 ms on the middle link, and 181 ms on the worst, so it misses there, and V1 limits itself to a good connection. Without the browser's mute, audio already on its way keeps arriving for 109 to 155 ms at p50 across these runs, on a local server. So this reading depends entirely on the mute. A stop built in real Chromium froze 10 of 10 times, audio after the gain node was 0 ms, with 32 ms of device buffer on top, and the board rebuilt from the log matched 10 of 10. A verifier's two runs matched 20 of 20. Safari, iOS, and Android are untested, and the note from memory that `<audio>` volume does not work on iOS is why M3.2 mutes through Web Audio. A cue already sent when the stop lands arrives anyway, in 3 of 30 attempts by 12 to 31 ms, so a frozen board ignores everything for that turn.

**Replies the SDK cuts.** It starts the model before a turn is confirmed, and starts `ttsNode` only after. That usually keeps a thrown-away reply away from the browser, but not always. With a later final transcript, a stale reply reached the listener in 1 of 15 attempts here, and a verifier saw 1 of 15 and 2 of 5, with cues, word times, and a word of audio. So the agent sends `stop` whenever the SDK cuts a reply, from `ttsNode`'s cancel and from the interrupted item, because that cancel never runs once `ttsNode` has drained. All 29 cuts in 30 attempts reached the listener as a stop. The browser reports and logs a cut reply like any interruption. The student may see a stray drawing, and the log and the next note say so.

A dropped connection works the same way. The browser freezes and keeps its unsent reports. On return, the agent writes `connectionGap` and says the rest of the beat from `getScriptFromWord`, and no drawing fires twice. With `closeOnDisconnect: false` the session survived leaving and rejoining in 3 of 3 runs, and once in a verifier's three runs it did not, 2 of 3. A real dropped network is untested.

## Turn patience

T5 says the tutor waits 8 s after a question, and that "hmm, let me think" does not end the student's turn. V1 says answer fast. They pull against each other, so decision 4 is yours.

| The student | What the tutor does | Measured with fakes |
| --- | --- | --- |
| Says "Hmm, let me think", then silence | A and B wait 8 s. C waits 3 s | Tutor started at 8.15 to 8.18 s, or 3.13 to 3.17 s |
| Says the filler, thinks for 5 s, then answers | No jump-in at 8 s | 0 of 5 jumped in, and the answer then got the normal decision, 449 to 489 ms |
| Real words, then silence | A and C wait 1 s. B waits 2 s after a question | Tutor started at 1.12 to 1.19 s, or 2.13 to 2.17 s |
| Real words, a 1.5 s pause, then more | A and C jump in. B waits | Jumped in 5 of 5 at 1 s, and 0 of 5 at 2 s |
| A finished answer the detector doubts | A and C answer at about 1.2 s. B at about 2.2 s | On a long phrase 3 of 20 hit the 2 s cap, worst 2200 ms. On short phrases 0 of 60 |

My pick is B, because you said Aristotle "takes it at my pace", and being cut off in the middle of a thought is the opposite of that. So it covers a student who was just asked something, and a student who just interrupted to ask for clarification, who are the two most likely to be mid-thought. The 2 s runs through the same `session.updateOptions` call as the filler rule. The run covers the 2 s wait, and the rule that picks when to use it is M3.6's. The cost is that a long finished answer the detector doubts misses V1's 1.5 s, at about 2.2 s. In this run that was 3 of 80 turns, so p95 across the mix held, and a session of long answers would not.

Fillers are a word list, and the fake returns exact words, so real speech to text may transcribe "hmm" differently. M3.6 tests that.

**The 8 s timer.** The agent owns it. It starts when the browser reports the last word of an `expectsReply` beat, and the board stays still. M3.8 decides what the tutor says when it ends.

## The time budget

From the student's last sound to the tutor's first sound. Four steps count. D is the decision: the last sound reaches the agent, a short silence, then the turn detector. S is the final transcript from Deepgram. M is the model's first words, up to the first flush. F is the voice's first audio.

The model can start early, on the final transcript, through `turnHandling.preemptiveGeneration`. The voice cannot. `preemptiveTts` is false by default, so F starts only after the turn is confirmed. So first sound is **max(D, S + M) + F + the trip to the student**. Measured with instant fakes, first audio came at 548 ms at p50, and at 746 ms with a voice 200 ms slower, while the decision stayed near 450 ms. So the voice's time adds in full.

| Step | Budget p50, p95 ms | Evidence | Public figure, other workloads, read 3 November 2026 |
| --- | --- | --- | --- |
| D | 450, 1130 | Measured with fakes, so real speech may differ | None |
| S | 150, 300 | A guess. M3.6 measures it | None found that applies |
| M | 450, 850 | A guess. M3.7 measures it | Sonnet 5.5 low effort 1.08 to 1.20 s, Opus 5.5 low effort 10.97 s, both Artificial Analysis at 10,000 input tokens. Opus 5.5 2.33 s on one gateway |
| F | 100, 200 | A guess. M3.2 measures it | Sonic 3 166 ms, Vapi's June 2026 benchmark. About 190 ms, Cartesia's changelog |
| Trip | 100, 150 | About 60 ms locally. The rest is a guess | None |

The budget's own numbers give a p50 of max(450, 600) + 100 + 100 = 800 ms. The public figures give about 1.7 s on Sonnet, about 2.9 s on Opus at the gateway's figure, and about 11 s at Artificial Analysis's. So 800 ms is not realistic on Opus and doubtful elsewhere. Those figures come from other workloads with uncached prompts, so only M3.7 settles this.

**Thinking cannot be turned off on Opus 5.5.** `{type: "disabled"}` returns a 400 at every effort, and the default effort is `medium`. The PRD's $0.060 assumes 200 thinking tokens a turn, which is 2.0 to 2.5 s before the first word at 79 to 100 tokens a second, against a 450 ms budget. So either thinking is near zero, and the model costs $0.048, or the budget fails. M3.7 sets `output_config.effort` to `low` and adds the docs' line "Answer directly without deliberating." The docs warn that the model still thought in Anthropic's testing when told to answer directly. Sonnet 5.5 accepts `thinking: {type: "between_tools"}`, which turns it off. So decision 10 tests first-word speed before committing to Opus.

If M misses, the moves in order are a faster model, then the stock "Mm." under decision 5. Turning `preemptiveTts` on saved nothing with fakes, 739 against 746 ms, and I do not know why, so M3.6 looks at it again. M3.7 reports first sound and first real word as two numbers, so "Mm." cannot hide a slow model.

Long questions are the worst case for D. The local detector doubts them and waits for its cap. In a verifier's run, 9 of 20 tries of a long question hit the 1 s cap on Node and 4 of 20 on Python, and short phrases almost never did. A fresh run here hit it 5 of 20 on Node. Short phrases hit it 1 of 180 across those runs. The Node and Python totals, 14 of 160 against 5 of 80, do not establish a difference (p = 0.62). That is what a real student question looks like, and those turns take about 1.2 s instead of 0.5 s.

The first word of a session has its own limit, 3 s from submit (PRD section 6.3). Joining the room and starting the session took 415 to 1221 ms here. Fakes have no connection cost, so M3.6 measures this.

## What leaves our servers

"No audio is stored" was only half true. `record: false` stops the SDK uploading audio, and each vendor has its own defaults. Terms read on 3 November 2026.

| Vendor | Default | What we set | Who |
| --- | --- | --- | --- |
| Deepgram | Terms of 6 August 2026, sections 3.2 and 3.3, license audio for training unless each request opts out. The plugin defaults to `mipOptOut: false` | `mipOptOut: true` on every request. The proof agents send it, and the fake saw `mip_opt_out=true` in the URL. | M3.6 |
| Cartesia | Terms of 14 June 2024, section 5.3(c) and (d), train on inputs and outputs unless you file a form. DPA section 13 has a Zero Data Retention setting that stops storage, logging, and training | Turn on Zero Data Retention at signup, and file the form, before the first real call | Abel, decision 6 |
| LiveKit | Agent observability stores transcripts and audio for 30 days when recording is on. Inference is zero retention by its terms, sections 7.6 and 7.7 | `record: false`, and no Egress | M3.6 |
| Anthropic | The API does not train on inputs by default, per its privacy center. Standard retention applies, and zero retention needs an agreement | Ask for an agreement before any minor signs up | Abel, M4.5 |

With these settings, S5 and S6 hold on the vendors' terms as written. Without them they do not. Counsel confirms this before invitations go out (PRD section 11).

## What the log records

The agent is the only writer, and the browser reports what played. There are five events. `beatPlayed` holds the beat, each word's start, words played, cues that really fired, how it ended, and any frozen frame. `boardFrozen` holds a freeze that lands after a beat's last word, with the ball still flying. `studentSpoke` holds the words, typed or spoken, and whether just a small reaction. `studentActed` holds slider drags, rewinds, ink, ink erased, and uploads. `connectionGap` holds how long the connection dropped.

A beat is written once, when it ends. Silence has no event. Rows are unique on session and sequence number, so a repeated write changes nothing. If the browser never reports, the agent writes its own estimate and marks it `agent-estimate`. The SDK's own report is not used, because it said 5 to 7 words when a listener heard 12 or 13, though that was with our fake voice.

Replay, seeking, rewinding, and a page reload all call one function, `rebuildBoard(log, atMs)`, which M3.2 writes. It flattens events by time and not by sequence number, because a beat is written when it ends. So a live board and a replayed board agree as long as the browser reported, because the log now holds every fact the board depends on. `replay-check.ts` shows that for 12 cases, among them a cut mid-word, a frozen frame, a drag, a resume, a rewind, a stop after the last word, and a late cue. A 13th shows that rebuilding by sequence number gets it wrong. An `agent-estimate` row can disagree, and it says so on its face.

## The scene language

The tutor names what to show. The engine decides where it goes and how it moves, so the model cannot place a pixel (T6).

B5's library maps to these commands. Equations are `writeMath`, `transformMath`, and `highlight`. Plots and number lines are `plot`, `numberLine`, and `markValue`. Geometry is `geometry` and `construct`. Forces are `vector` and `trackVector`. Computed motion is `simulate`, `runSimulation`, `setParameter`, `slider`, and `ghostPath`. Diagrams and drawings are `diagram` and `drawing`. Then `table`, `timeline`, `code`, `image`, `text`, `annotate`, and `focus`, with `reveal` to build in steps, and `hide` and `clearBoard` to keep the page clean.

The whole sample session from PRD section 6.4 parses with these types, including the six seconds of silence, the frozen ball, and the slider drag. The parser is hand-written and has no dependency. `packages/contracts` now holds about 1,020 lines of it, so "types only" no longer describes that package.

**Settled in the types, with tests.**

- Motion lands on a word. `runSimulation` can `play` `until` a moment such as `peak`, over a number of words, and hold there. `seek` jumps to a moment.
- A graph, diagram, table, timeline, or code block can start empty and build in steps, with `reveal` and `overWords`.
- The tutor can change a value with `setParameter`. Tracked arrows are velocity, its two parts, and acceleration.
- Marks have ids, so `hide` removes them. `highlight` can pick one occurrence. `plot` has axis labels and an expression grammar: numbers, `x`, `pi`, `e`, `+ - * / ^`, parentheses, and `sin cos tan exp ln log sqrt abs`.
- The tutor can mark student work. Ink has an id, per-point times, an erase action, and a stated frame of fractions of the board panel. `image` can show an upload by `fileId`.
- Reusing a live id replaces that element in place.
- Limits fit the wire. LiveKit's docs say 15 KiB for a reliable message. On a local server 20 KiB arrived and 70 KiB failed against a 64,000 byte limit, so we stay at the documented figure. A long drag or stroke is split across messages, and the parser refuses anything larger.
- A new simulation parameter comes with a default, so older rows still parse. A new simulation adds one table entry.

**Open, with an owner.** "The board replays its key moments" (PRD section 6.6) has no command, and M4.4 adds one. Number readouts that follow a quantity are M3.4's. Ink when the layout differs between sizes is M3.11's. How `overWords` behaves when later word times have not arrived is M3.4's. B2 has a guard only in the prompt today, so M3.7 adds one: if no command has come by the turn's third word, the reader adds a `focus` on the last element, and the evaluation fails any turn over 1 s. CJK and Thai count as one word, so every cue would fire at word 0. PRD Q12 says English first, so this waits.

**Safety.** The parser checks shape and not meaning, and free text can hold anything. So M3.3 to M3.5 render text as text and never as HTML, call KaTeX with `trust: false`, read plot expressions with a small parser that has no `eval`, and keep names in Maps. The parser refuses `__proto__`, `constructor`, names no reference can reach, and `tex` with control characters. So a model that writes `"\frac{1}{2}"`, which JSON turns into a form feed, gets a refusal and not a wrong equation.

**How other code loads it.** `apps/agent` runs plain Node 22.18 or newer, which strips types with no loader, so the package now uses `.ts` imports and a test imports it by name. Only 22.22.1 has run it. Before this it failed with `ERR_UNSUPPORTED_DIR_IMPORT`. The NestJS API does not import the parser yet. When it does, it adds the workspace dependency and `rewriteRelativeImportExtensions` to `apps/api/tsconfig.json`. A throwaway file compiled with `tsc` and ran in plain Node that way, and `nest build` and Jest are untested.

## Node or Python

Node, because only Node shares our types. A Python agent would need a second copy of the scene language, which `CLAUDE.md` rules out, or a generator. The measurements do not decide this. The same agent ran on both SDKs against the same fakes, and they match on interruption and word timing. The cap difference is not established (14 of 160 against 5 of 80, p = 0.62). Python carried less audio after a stop and used less memory (152 to 420 MB against 337 to 692 MB), and its typed stop was faster. Node reached first audio about 90 ms sooner on multi-sentence replies. The features only Python has are ones we do not need. Moving later would mean a second parser, so choosing Node is a real commitment. The full table is in `results/README.md`.

## The screen

The live session gets its own route, `/live/:sessionId`, outside `AppShell`, because `AppShell` keys its page on the path and a URL change would remount the page and kill the session. It follows `docs/DESIGN.md` and the prototype's session grid. A bordered board panel takes 7 parts and a talk column takes 5, stacked on a phone. The page is still at rest, and motion has a cause: a word or the student's hand. Audio needs a user gesture, which submitting on Home gives. After a reload, one "Continue" button starts the audio.

## What changes in the plan

M3.2 builds `ScenePlayer`, `rebuildBoard`, the clock, and the mute. M3.3 to M3.5 build the commands. M3.6 builds `apps/agent` in Node with the voice path and the turn rule. M3.7 builds the reader, the prompt, and the note to the model. M3.10 builds the live route, the dot, and the saved log. M4.4 builds replay on `rebuildBoard`. These are the changes to the approved plan.

| PR | Change |
| --- | --- |
| M3.1 | `packages/contracts` ships runtime parsers, not only types. `"type": "module"`, `.ts` imports, and `allowImportingTsExtensions` in its and the web app's `tsconfig.json`. |
| M2.5, M3.10 | The live route sits outside `AppShell`. |
| M2.6, M3.10 | The log table goes through `infrastructure/orm` with generated migrations. |
| M3.2 | Moves here from M3.6: the worklet clock over real WebRTC on a local LiveKit server, and the proof of the browser's mute. "Never from timers" gains one exception, the fallback when audio cannot run. The Cartesia flush tests above. The 150 ms rule reads as decision 3 says. |
| M3.3 to M3.5 | New commands: `reveal`, `setParameter`, `seek`, `until`, `overWords`. Text-only rendering, KaTeX `trust: false`, no `eval`, Maps for names. |
| M3.6 | Its own `ttsNode`. Early model start, a 300 ms floor, and a 1 s cap under decision 4. `ttsTextTransforms: null`, `aecWarmupDuration: null`, `mipOptOut: true`, `record: false`, `closeOnDisconnect: false`. The turn rule with resume and `clearUserTurn`. `stop` on a cut reply. An echo test. Perf rule gains first sound to yield at most 300 ms, and first sound to silence at most 1.2 s at p95, as starting values. |
| M3.7 | The reader, the prompt's rules, and the note to the model. A first-speed test before choosing a model. A 90-turn test added to the 30-turn test, because 30 turns is only 10 minutes. Compaction under decision 11. B2's guard. |
| M3.7, M3.8 | Stock phrases, which the plan does not have, under decision 5. |
| M3.8 | A new evaluation case from your Aristotle note: the student interrupts to ask for clarification, and the tutor answers it, then goes back to the point without repeating itself. |
| M3.9 | `system` and `tools` stay frozen for prompt caching, so the current step goes in as an appended message. |
| M3.11 | Ink and uploads use the shapes above. |
| M4.4 | Adds the key-moments command. |
| PRD section 10 | The cost table is superseded by the table above, once you approve. |

## Alternatives that lost

The PRD's `say` plus `cues` lost because every author must count words. A browser-written log lost because the record would depend on a tab that can close. The agent working out what played lost because it cannot see the jitter buffer, and the SDK's own report was wrong with our fake voice. Structured output lost because a schema with 25 branches is untested and a failure is not speech, and M3.7 tries it if refusals are common. A `speak` tool lost because it can be skipped under `auto` and forced tool use is gone. Audio over the data channel gives up jitter handling and loss repair for timing the measured errors do not need. Stopping on any voice makes every "uh-huh" a gap of about 2 s. A voice detector in the browser yields about 100 ms sooner with a second, weaker detector, and M3.6 can add it if real numbers ask.

## Still unproven

Every result below rests on fakes unless it names a vendor.

**M3.2, with real Cartesia.** Whether its words match ours for numbers and symbols. Whether a mid-sentence flush sounds natural and speaks at once, and whether contexts close. Whether word times arrive ahead of audio. How noisy they are. The clock on real speech over real WebRTC. The mute on Safari, iOS, and Android.

**M3.6, with real Deepgram, a real network, and real devices.** When transcripts really arrive, which sets the stop time, the grace, and S. Starting the model early helped with fakes, 508 against 820 ms, but the fake's final fired about 1250 ms before the student finished, so that is not evidence. Whether real transcripts catch "uh-huh" and "hmm". Echo through a laptop speaker with the wait off. Whether the worklet works on Safari, Firefox, and Android. Bluetooth delay. A real dropped network. The detector's cap on real speech. LiveKit's adaptive interruption and cloud detector, which need Cloud. Inference's latency, flush path, and word times. Capacity, because the worker refuses sessions above 70% CPU. The 170 of 170 word times are by construction with the fake.

**M3.7, with the real model.** First-word speed of all three models. How much Opus 5.5 thinks at `low`. How often commands parse. Whether a long command empties the audio. Whether the note and a cancelled reply pass the history check. Whether compaction keeps the tutor's memory and costs what this says. What the tutor says after a refusal, because Opus 5.5's `bio` classifier could trip on a biology lesson. Real tokens and cost.

**After M3.10.** Whether students feel any of this, which is test 5 in PRD section 13, and whether it holds up next to Aristotle when you try both. Your session's note says nothing on the board, so PRD section 4's board row stays open.

## For later owners

| Owner | Note |
| --- | --- |
| M3.2 | Unmute on the next `turnStarted`, and never earlier. Rebuild by time, not sequence number. Beat ids must be unique within a session, because `rewound` names only a beat. |
| M3.6 | A background tab or locked phone suspends audio, so the clock stops. Decide what the agent does. |
| M3.6 | Blocked audio: the agent is never told, and the note would say "heard". The browser must report it. |
| M3.6 | After a reconnect only the cut beat resumes. Decide what happens to the rest of the turn. |
| M3.6 | Student captions: choose between LiveKit's transcription stream and our own message. |
| M3.6 | With the SDK's word rule turned off, words spoken while the model is thinking may be skipped (`agent_activity.ts:2730`). Test that. |
| M3.6 | Words the fake gave exactly may not come back from Deepgram that way, so check the reaction and filler lists against real transcripts. |
| M3.4 | Hiding a `simulate` leaves arrows that follow it on the board. Decide what goes with it. |
| M3.10 | Agent-to-API auth and the log table's owner. Any table goes through `infrastructure/orm` with generated migrations, as M2.6 sets up. |

## Decisions in full

**1. The design.** No live-session code starts until you approve. It holds M3.2 and everything after it.

**2. Node or Python.** Node, for the reason above. Python keeps the plan's order and adds a copy of the types to every later PR. Holds M3.6.

**3. What V2's 150 ms measures.** A: from the agent's decision to stop, to silence and a frozen board, on a good connection, with two limits the student can feel: first sound to yield at most 300 ms, and first sound to silence at most 1.2 s at p95. Those are starting values, written into M3.6's perf rule, and the runs here gave 182 ms and 791 ms at p95 with fakes. B: from the student's first sound, as written, which stops the tutor on every "uh-huh". If M3.2's mute test fails on a browser, audio keeps coming for about 150 ms after the stop there. Then A misses on that browser, M3.2 stops by its own rule, and you choose between that browser and a slower target. Holds M3.2 and M3.6.

**4. Turn patience.** See "Turn patience". Holds M3.6.

**5. Stock phrases.** Short recordings in the tutor's voice. A: "Let me work that out." during a tool call, and no "Mm." unless M3.7 shows the model misses V1 and you hear it first. B: both from the start. C: neither, so tool turns stay silent longer. A repeated phrase turns into a tic, and this applies most to the phrase I recommend, so each voice gets three versions, and no phrase plays twice in three turns. A stock phrase is a normal beat with stored word times. The browser's clock counts it, captions show it, the log records it, and the student can interrupt it. "Mm." alone meets V1's letter. I do not count it, so M3.7 reports first real word, and if that misses you choose between a faster model and a higher V1. Holds M3.7.

**6. Cartesia, for M3.2.** It is the only voice whose word timestamps and cancel we have checked, at 1 credit a character. [Pricing](https://www.cartesia.ai/pricing) lists Pro at $5 a month with 100,000 credits, and Scale at $299 with 8M. Pro is about 3 hours of sessions. The beta needs 6M, which is $299 on Scale, or about $263 on Startup with fewer streams. You turn on Zero Data Retention at signup and file the training opt-out form. If Pro does not offer that setting, M3.2 uses scripted test text only until you move up. Holds M3.2.

**7. Deepgram, for M3.6.** [Pricing](https://deepgram.com/pricing) lists Nova-3 and Flux both at $0.0077 a minute, keyterms at $0.0013, and $200 of free credit. That covers about 22,000 minutes, then the beta costs about $108 a month. Nova-3 is what the proofs' wire format matches. Flux has its own end-of-turn signal, which could change D, and the plugin supports it, so M3.6 tests both. The opt-out page does not mention price, so M3.6 checks the first bill. Holds M3.6.

**8. LiveKit hosting.** Development runs on a free local server. A: Cloud hosts the agent. [Pricing](https://livekit.com/pricing) lists Build at $0 with 1,000 agent minutes and 5 sessions at once, and Ship from $50 with 5,000 minutes, then $0.01 a minute, and 20 at once. The cloud detector and adaptive interruption are free there. That is $120 a month on Ship. B: Cloud with our own agent servers. Ship at $50, about $61 for those two models at 36,000 turns ($0.50 and $1.20 per 1,000), and servers for 20 sessions at up to about 700 MB each, about $150 as a guess, so about $260, and someone runs them. C: all ours. Servers and bandwidth at about $400 as a guess, plus a worldwide media network the plan has no room to run. Holds M3.6.

**9. How to buy voice and speech.** A: our own accounts, at about $0.034 a session minute, or $407 a month. B: LiveKit Inference, one bill, at about $0.024, or $292 a month, with zero retention by its terms, so no Cartesia form. Its latency, flush path, and word times are untested, and word times are an entry requirement. Keep A for M3.2, because that test needs Cartesia's documented API, and test B in M3.6. Switch if it matches. Holds nothing yet.

**10. The Anthropic API and the model.** [Prices](https://platform.claude.com/docs/en/about-claude/pricing) per million tokens: Opus 5.5 $4 in, $20 out, $0.20 cache read. Sonnet 5.5 $2, $10, $0.10. Haiku 5.5 $0.10, $0.50, $0.01, and five times that above 100,000 tokens. Set a $50 limit to start. One run of M3.7's 30-turn test on all three costs about $3. PRD Q9 says start with Opus at low effort. I would test all three on first-word speed first, because thinking cannot be turned off on Opus and public figures put it far outside V1. I expect Sonnet 5.5 with `between_tools`, at about half the cost, unless teaching quality says otherwise. [Tier caps](https://platform.claude.com/docs/en/api/rate-limits): Start stops at $500 a month and Build at $1,000, and calls return 429 until the next month. A new account may also start in a lower Evaluation tier. So request Scale before the beta, or the tutor goes silent mid-month. Holds M3.7.

**11. Long sessions.** History is append-only, so every turn adds about 1,600 tokens that every later turn pays for. A: let it grow. A 30-minute Opus session then costs $0.156 a minute, over the $0.15 limit. B: on-demand compaction (beta `compact-2026-09-04`) in the background when the prompt reaches about 60,000 tokens, with the turn going on while it runs. The docs say kept turns stay valid after the swap. That gives $0.137 a minute, which assumes a 4,000 token summary and a compaction read billed at the cached rate, neither of them checked yet. C: our own summary on a cheap model, starting a fresh conversation, which loses the thinking and the cache. Pick B, with C as the fallback. It is unproven until M3.7, and M3.7's new 90-turn test decides. Holds M3.7.
