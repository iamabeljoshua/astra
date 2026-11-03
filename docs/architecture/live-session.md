# The live session

Status: approved by Abel on 3 November 2026, who asked for a modular design so providers and models can be switched later. He chose the vendors the same day: ElevenLabs for the voice, Meta's Muse Voice Transcribe for transcription, and LiveKit Cloud with our own accounts. No proof here has run either new vendor. Only types, parsers, their tests, one lint rule, and throwaway proofs exist.

## Decide here

**What you agreed to.** The tutor writes one script with each drawing placed inside the sentence. The agent sends the words to the voice and the drawings to the browser. The browser counts the samples of the tutor's own audio and fires each drawing on its word. If the voice falls behind, the agent says so, and the count skips that silence. When the student speaks, the tutor lowers its voice within about 200 ms and cuts off mid-word on the first real word. "Uh-huh" does neither, even over a question. The browser reports what it played, and that report becomes the log, the replay, and the note to the tutor. It runs on Node and LiveKit, with the voice, the transcriber, and the model each behind an adapter we own. Every number comes from runs with fake vendors unless it says otherwise, so "Still unproven" is part of the deal. "What changes in the plan" lists every change.

**New since you approved: the agent's `audioGap` report.** What you approved had the browser work out a stall alone. That failed, as "How a drawing lands on its word" shows, so the agent now reports each stall. This changes the mechanism and not the promise, the money, or the vendor. During a stall the clock now depends on the agent and the data channel. M3.2 gains a small publisher, and M3.6 gains the report in `ttsNode`. On the runs so far it beats the rule you approved: with fakes, a 500 ms stall fired at a p95 of 8 ms against 495 ms.

**The reference to beat.** You tried a real Aristotle session: "it felt human in the conversation, like i could interrupt and talk to it, ask for clarification and it just knows what to say next like a human tutor would, and it takes it at my pace". That is one person's impression of one session, and no machine test of Aristotle exists. It says nothing on reply speed or the board, so this document claims nothing about those from it.

| What you felt | How this design delivers it | Proven, with fakes | Not proven |
| --- | --- | --- | --- |
| Interrupt it and talk back | The tutor yields at about 171 ms and cuts off on the first real word at about 674 ms, with the board frozen. "Wait." alone stops it. "Uh-huh" does not, even over a question. A long noise pauses it, and it picks up from the cut word with the ball moving again. | All of that, in live runs. The rule, reader, clock, and browser together in real Chromium. | Real transcript timing, a laptop speaker's echo, and Safari, iOS, and Android. |
| Ask for clarification, and it knows what to say next | The browser reports the word and frame where it stopped. The next turn gets a note with what was heard, what was not, and what is on the board. M3.9 adds the lesson's current step. | Only the facts reaching the agent. | Whether the reply is right. No real model has run. This is the largest unknown here. M3.7 and M3.8 own it, and M3.8 gains a test for it. |
| It goes at my pace | A question ends the turn. "Hmm" holds the floor for 8 s. Real words after a question or an interruption wait 2 s under decision 4. | The waits, with exact words from the fake. | Whether real transcripts catch "hmm", and whether the teaching itself paces well, which is M3.8's. |

**What you must do, and when.**

1. Now. Confirm two account settings: Meta's Standard Services on `muse-key`, and ElevenLabs' training opt-out on `elevenlabs-balance`. M3.2 and M3.6 use test text and test speech only.
2. Done on 3 November. The Anthropic, LiveKit, ElevenLabs, and Meta keys each answered a read-only call. All three models' first word gets measured before M3.2.
3. Before the first real student. Ask Anthropic for the Scale tier and a zero-retention agreement. Have a lawyer review the age rules below and "What leaves our servers".

**The total of the picks: about $848 a month for all four services, or about $1,290 with background work and the PRD's 30% buffer.** That is Sonnet with compaction, which the model test must confirm, on the vendors you chose. API hosting, about $200 by the PRD's guess, is on top, so about $1,490 against your $2,000. A beta month means 12,000 minutes in 30-minute sessions. These are listed prices, read on 3 November 2026.

| # | Decision | Answer or options | Beta month | Status |
| --- | --- | --- | --- | --- |
| 1 | The design | Approved | $0 | Settled |
| 2 | Agent language | Node, because only Node shares our types | $0 | Settled |
| 3 | What V2's 150 ms measures | A. The agent's decision to silence, plus limits the student can feel | $0 | Settled |
| 4 | Turn patience | B. 8 s after a filler, 1 s after real words, and 2 s when the tutor just asked a question or was just interrupted. It breaks V1's p95 on long answers | $0 | Settled |
| 5 | Stock phrases | A. "Let me work that out." only | About $0 | Settled |
| 6 | The voice | ElevenLabs Turbo, with the training opt-out on | $240 | Settled |
| 7 | Transcription | Meta's Muse Voice Transcribe, on Standard Services | $36 | Settled |
| 8, 9 | Hosting | LiveKit Cloud with our own accounts, not Inference | $120 | Settled |
| 10 | The model | Test all three now, before M3.2, once the account exists. I expect Sonnet 5.5 | Model alone, with compaction: Opus $1,122. Sonnet $452. Haiku $30 | Settled |
| 11 | Long sessions | B. Compact in the background, with our own summary as the fallback | Saves $219 on Opus, $96 on Sonnet | Settled |

**The vendors you chose.** You chose these on 3 November 2026. No proof here has run either new vendor, so "What M3.2 and M3.6 must measure again" lists what those PRs owe.

| Service | Choice | A month, at listed prices read 3 November 2026 | How it adds up |
| --- | --- | --- | --- |
| Hosting | LiveKit Cloud with our own accounts, not Inference | $120 | Ship from $50 with 5,000 agent minutes, then 7,000 minutes at $0.01 |
| Transcription | Meta's Muse Voice Transcribe | $36 | 12,000 minutes at $3 per 1,000 |
| Voice | ElevenLabs Turbo | $240 | 6M characters at $40 per million |
| **The route** | | **$396** | |

**The age rules, which you set aside.** You chose these knowing both rules. Meta's terms, section 10.1, bar end users under 18 and products targeted at them. ElevenLabs' usage policy bars products directed at under-18s without its written approval. Astra is for students 13 and up. A lawyer reviews this before real students.

**The reference.** Cartesia and Deepgram remain the reference the proofs ran against, because `fake-providers.mjs` speaks only their wires. The proofs and their adapters stay as they are, so a Cartesia or Deepgram figure below describes that reference and not the vendors you chose.

| 30-minute sessions, all four services, on the vendors you chose | Model alone, a month | A month | With background work and a 30% buffer | Per minute on that basis, against the PRD's $0.15 |
| --- | --- | --- | --- | --- |
| **Sonnet, compaction, the pick** | $452 | **$848** | **$1,289** | $0.107 |
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

- V1: first tutor sound within 800 ms at p50 and 1.5 s at p95 of the student finishing. V2: on interruption, speech and board stop within 150 ms, and "uh-huh" stops neither. V5: the tutor resumes after a dropped connection.
- B1: a drawing starts within 100 ms of its word. B2: a turn's first drawing within 1 s of its first word. B5: the board library. B6: rewind. B7: exact replay from the log. B8: student drawing and uploads. These are PRD codes. The budget's steps below are called D, S, M, and F so they do not collide.
- T1: never hand over the answer early. T3: no third question on one point. T5: wait at least 8 s after a question, and "hmm, let me think" does not end the student's turn. T6: all numbers come from code. S5: raw audio is not stored. S6: no training on under-18 data.
- Aristotle: heyaristotle.com, the closest competitor. "Beats Aristotle" is a target until M3.10, when you can compare them.
- Beat: one spoken phrase with its drawings inside it. Cue: one drawing and the word it belongs to. Yield: the tutor lowers its voice. Stop: the tutor cuts off and the board freezes. The note: what the next turn is told about what was heard, what was not, and what is on the board. Compaction: replacing old history with a short summary, so a long session stops getting dearer.
- Flush: telling the voice to speak the text it has now. RTP: the numbered timestamps on each audio packet. Jitter buffer: where the browser holds packets to smooth an uneven network, which delays audio by a varying amount. p50 and p95: half and 95% of cases are at or under this value. Thinking blocks: the model's private reasoning, billed as output and written before the first word.

## The design in one page

**The story.** A student says "Wait, then why does it come down?" while the ball is flying. About 171 ms after their first sound, the tutor drops about 12 dB and keeps talking. About 674 ms in, the first real word arrives. The tutor cuts off mid-word, the ball freezes on that frame, and the caption stops on that word. The browser reports what played. The tutor answers knowing where it stopped.

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

The agent reads this as it streams, inside its own `ttsNode`. `beat-text-reader.mjs` is that reader. M3.7 moves it to `apps/agent/src/tutor/` and keeps `reader-check.mjs` as its test, which runs 44 tricky cases at 4 stream sizes against the real parser. Its rules:

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

**The method.** The agent sends word times ahead of the audio. The browser taps the tutor's audio with an `AudioWorklet`, finds the first audible sample of the turn, and counts from there. A cue fires when the count reaches its word and the current 3 ms block of audio has sound. The count runs through natural pauses, because the word times include them. It runs through lost audio too, because the time of those words passed with them.

One silence is not on the timeline: the voice falling behind. Only the agent can see that, so the agent says so. It tracks when its queued audio runs out, and sends `audioGap` with no length at that moment. Audio already on its way is slower than a data message, so this usually reaches the browser before the silence does. When audio returns, it sends the length. The count holds just short of the gap for at most 3 s, then skips it. Lateness too small to run the queue dry adds up, and the agent sends it as a length once it reaches 20 ms. This is the likely stall, because the agent flushes before each command, so a stall lands right on a drawing's word.

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

B1 allows 100 ms. These leave out the speaker, 32 ms on this fake device, and the screen, because M3.2 draws on the next frame, up to 16 ms later. Data messages miss because the jitter buffer holds the audio and not the data. `results/README.md` has every run, with the worst case and the early counts, and `results/clock-fixed.json` and `results/clock-attack.json` hold this round's reruns. The lost audio cell moved from a range of 19 to 59 ms to a range of 26 to 125 ms, and one of those runs misses B1. No report was sent on those runs, and the clock's figures there equal the count alone's, so the blackouts set that spread and not this round's change.

The agent's report is read from its own frames, with no knowledge of the stall we cause: 498 ms at p50 and 502 ms at worst for a 500 ms stall, and 90 ms at p50 and 92 ms at worst for a 90 ms one. In the built session after the fix, with the reader and the SDK's real audio path, 6 runs with a stalling voice gave 24 cues in real Chromium, 0 of them more than 40 ms early, and a worst error of 14 ms, against 24, 0, and 35 ms before it. The agent read those stalls as 531 to 539 ms, and the browser heard 526 to 540 ms of silence. Offline on real `say` speech, with random pauses and a 500 ms stall at a word start or inside a word, the worst p95 was 16 ms, with the stall list standing in for the report. Noisy word times hurt directly, with a median p95 of 62 ms at 30 ms of noise, so M3.2 measures ElevenLabs'.

**What this bounds for one turn.** The clock restarts each turn, so any error ends there. At `02b8b67` three faults let a turn's error run on. This round fixed all three in the proofs, and M3.2 carries the fixes into real code.

- A voice slower than real time ran away with no report, because `createPlayoutTracker` dropped lateness under 20 ms instead of adding it up. At 90% speed that gave p95 600 ms, worst 639 ms, and 94 of 104 cues more than 40 ms early, and at 97%, p95 160 ms and worst 178 ms. A 15 ms stall every 2 words gave p95 76 ms. The tracker now adds lateness up and reports it at 20 ms. Rerun live, 90% speed gave p95 23 ms, worst 30 ms, and 0 of 102 cues more than 40 ms early. 97% gave p95 21 ms and worst 22 ms. The 15 ms stalls gave p95 18 ms. Whether a real voice does this is unknown.
- A lost closing report held the position forever, so cues never fired for about half the heard words, and by reading `stop-page.js`, `questionHeard` then never went out. The count now holds for at most 3 s, above the longest modeled stall of about 2.7 s, and that gap then counts as a lost report. With every closing report dropped on a 500 ms stall, 113 of 113 cues fired, at p95 2481 ms and worst 2493 ms. The count is never more than 3 s behind, so a turn's last 3 s can go unfired: with 40 ms stalls every 2 words and every closing report dropped, 70 of 110 fired in these 6 s turns.
- One path to that loss was real but rare: a frame in the same tick as the dry timer, below the 20 ms line, got no closing report, 3 of 400 times. A frame after a dry report now always closes the gap. A gap still open when a turn ends gets no closing report, because no later word needs one and the next turn starts a fresh clock.

A missing report leaves later cues early by that one stall, and no more. A late report lets a cue fire early until it lands, and a late closing report holds a cue until it lands, so both go on both channels. A 1500 ms stall gave p95 7 ms, and 0 of 101 cues more than 40 ms early with its closing report held back 150 ms. The bound has a cost past 3 s. A 3500 ms stall gave p95 8 ms with the report on time, but 50 of 109 cues fired more than 40 ms early with it held back 150 ms, because the count had run on by the time the audio returned. M3.2 measures how long real stalls get. On the worst link with a 500 ms stall, the clock's p95 after the fix was 13 ms, its worst 24 ms, and 0 of 107 cues fired more than 40 ms early, against 30 ms, 33 ms, and 0 of 103 on a reviewer's same case at `02b8b67`, and 49 ms, 56 ms, and 16 of 205 on the 12-turn run in `results/README.md`. If a first sound is lost, or a very late turn message lands after a silence of 107 ms or more, every cue in that turn is late by that much, and nothing corrects it.

**If word times arrive after the audio.** A turn's zero is the first sound, and word times count from it, so late word times cost only lateness. With them held back 300 ms, 205 of 205 cues fired, and words after those 300 ms fired at a p95 of 5 ms, or 13 ms on the worst link. A reviewer's run at `02b8b67` gave 46 ms for the same case, as the follow-ups below say. The voice is never held back for a drawing.

**Who proves this for real.** M3.2 owns it. Its lab page plays real ElevenLabs audio through a local LiveKit server, which is free, into the worklet clock, on a real network profile, with a small publisher that reports gaps the same way. That is the earliest moment the bet can fail, and it comes before three PRs of board work. M3.6 sends the report from the real `ttsNode`. If the report proves unreliable on real audio, the fallback is the count alone behind the same gate, with flushes only at commas and sentence ends so stalls are rarer. Cues then run early by each stall until that turn ends. M3.2's 100 ms rule would catch that, and M3.2 stops and reports by its own rule.

If the clock cannot run, because audio is blocked or there is no output device, a timer started when the word times arrive drives the board. A typed session with the tutor muted keeps audio flowing silently, so it uses the same clock. A typed message started a reply in about 85 ms with fakes, and typing over the tutor stopped it in about 48 ms.

## Interruption, moment by moment

At 150 ms of sound, "uh-huh" and "wait" look the same to any detector. A rule that waits for words alone leaves the tutor at full voice for about 700 ms. So the tutor yields first and stops when it knows. `turn-rule.mjs` is that rule as a pure function for M3.6's `turn.test.ts`, and `turn-rule-check.mjs` runs it through 33 stories and searches every state it can reach, 104 states and 964 moves, with no violation of its 8 rules.

| After the student's first sound | The student hears | What happens |
| --- | --- | --- |
| About 171 ms (152 to 182 measured) | The tutor drops about 12 dB and keeps talking. The ball keeps flying. | The agent's voice detector sends `yield`. |
| About 674 ms (483 to 714 measured), from the fake's transcript timing, or 1 s with no words | The tutor cuts off mid-word. The ball freezes. | The first real word sends `stop`, on both data channels. The browser mutes and freezes at once, and reports `played`. |
| The student stops, plus the time budget | "Good question." The ball stays frozen. | The next turn starts with a note saying what was heard, what was not, and what is on the board. The model decides whether to return to the cut point. |

M3.6 sets two SDK options this rests on. `minWords: 9999` turns off the SDK's own word rule. While a reply is active, that setting also makes the SDK drop any turn that arrives, so our rule has to stop the reply first. `resumeFalseInterruption: false` turns off the SDK's pause and resume, which would release a stale reply when the voice ends.

The harder cases:

- **Real words as the tutor starts.** A student says "Gravity.", the turn is confirmed, and they add "It lands twice as far." before the first audio. Any word outside the reaction list now stops a reply that is thinking or speaking, and a voice already on when the tutor starts gets a yield. The second sentence reached the model 6 of 6, and 6 of 6 with the final 200 ms later, with 0 turns dropped. Before this, 6 of 6 got no stop and a reply to stale words. A number alone now counts as well. At `02b8b67`, `turn-rule.mjs` stripped digits, so "42." gave 0 of 3 stops and 0 of 3 replies, while "Forty-two." stopped 3 of 3. Rerun live after the fix, "42." over a reply stopped 3 of 3 and reached the model 3 of 3. "42." during thinking reached the model 3 of 3, with 0 turns dropped. In the same run, "Uh-huh" and "Hmm" over a question still stopped it 0 of 3 and 0 of 3. Whether a real transcriber writes digits is unmeasured. M3.6 carries the fix and its story into `turn.test.ts`.
- **Over a question.** T1 means most turns end in a question, so this is the common case. "Uh-huh" and "Hmm" over a question are reactions, until the browser reports that its last word started (`questionHeard`). They stopped the tutor 0 of 5 and 0 of 5, the question was heard in full 10 of 10 times, and the tutor stayed quiet for 8 s after it 10 of 10 times. Before this they stopped it 5 of 5, and "Hmm" left about 10 s of silence with the question cut off. "Yes." after `questionHeard` is an answer, and it reached the model 5 of 5. In real Chromium with the reader, the same held 6 of 6 reactions left the board running, 6 of 6 questions were heard in full, and 3 of 3 answers got a reply.
- **One word.** "Wait." can end before its transcript arrives. A real word stops the tutor however late it comes. A number is a real word too, as the first case says. It stopped 5 of 5, 5 of 5, 5 of 5, 5 of 5 with the transcript arriving 0, 300, 600, and 900 ms later, at 486, 924, 1220, 1595 ms at p50, at load 5 to 7.
- **Sound with no words.** A cough or a television. If 1 s passes with no words, the tutor cuts. If no words arrive within 700 ms of the sound ending, it says the cut word again and carries on. It resumed 5 of 5, with every word heard and the cut word twice, about 1.2 s after the sound ended. Before this the turn ended for good, 4 of 4.
- **A resume with something moving.** The rest of a beat has no cue for a ball already in the air, so it would stay frozen while the tutor narrates it. `getResumeScript` leads the resumed words with one command per entry of `frozen`: the last `play`, keeping its `until`, with `overWords` reduced by the words already said and at least 1, and the same for a `reveal`. A drawing cut during its entrance finishes when the board unfreezes. In real Chromium that gave 4 of 4 with `play` on the first resumed word, no drawing fired twice, and every word heard. That model had finished writing, so a reply cut while streaming is M3.6's.
- **"Uh-huh".** The voice drops at about 160 ms and comes back about 850 ms later. It stopped the tutor 0 of 10 times. The SDK holds the reaction as the start of the student's next turn, so the agent calls `clearUserTurn` on every reaction. The next turn held stale text 6 of 6 without the clear, and 0 of 6 with it. The clear also reopens the speech connection, so M3.6 measures whether that drops words.
- **Words that never become final.** An interim "Wait then" stops the tutor. If no final comes within 700 ms of the voice ending, it resumes from the cut word, 5 of 5, so the session does not go silent.

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

From the student's last sound to the tutor's first sound. Four steps count. D is the decision: the last sound reaches the agent, a short silence, then the turn detector. S is the final transcript from Muse. M is the model's first words, up to the first flush. F is the voice's first audio.

The model can start early, on the final transcript, through `turnHandling.preemptiveGeneration`. The voice cannot. `preemptiveTts` is false by default, so F starts only after the turn is confirmed. So first sound is **max(D, S + M) + F + the trip to the student**. Measured with instant fakes, first audio came at 548 ms at p50, and at 746 ms with a voice 200 ms slower, while the decision stayed near 450 ms. So the voice's time adds in full.

| Step | Budget p50, p95 ms | Evidence | Public figure, other workloads, read 3 November 2026 |
| --- | --- | --- | --- |
| D | 450, 1130 | Measured with fakes, so real speech may differ | None |
| S | 150, 300 | A guess. M3.6 measures it | None found that applies |
| M | 450, 850 | A guess. M3.7 measures it | Sonnet 5.5 low effort 1.08 to 1.20 s, Opus 5.5 low effort 10.97 s, both Artificial Analysis at 10,000 input tokens. Opus 5.5 2.33 s on one gateway |
| F | 100, 200 | A guess. M3.2 measures it | For the reference, not ElevenLabs: Sonic 3 166 ms, Vapi's June 2026 benchmark. About 190 ms, Cartesia's changelog |
| Trip | 100, 150 | About 60 ms locally. The rest is a guess | None |

The budget's own numbers give a p50 of max(450, 600) + 100 + 100 = 800 ms. The public figures, with Cartesia's F, give about 1.6 s on Sonnet, about 2.8 s on Opus at the gateway's figure, and about 11 s at Artificial Analysis's. So 800 ms is not realistic on Opus and doubtful elsewhere. Those figures come from other workloads with uncached prompts, so only the model test before M3.2 settles this.

**Thinking.** It cannot be turned off on Opus 5.5. `{type: "disabled"}` returns a 400 at every effort, and the default effort is `medium`. The PRD's $0.060 assumes 200 thinking tokens a turn, which is 2.0 to 2.5 s before the first word, against a 450 ms budget. So either thinking is near zero, and the model costs $0.048, or the budget fails. On Opus, M3.7 sets `output_config.effort` to `low` and tries the docs' line "Answer directly without deliberating.", and the docs warn that less thinking can cost accuracy. On Sonnet 5.5, the docs say to try adaptive thinking at `low` first, then `thinking: {type: "between_tools"}`, which turns it off. With that one they say to remove any instruction not to think, because it makes internal XML tags more likely in visible output. A tag would be spoken, so M3.7's reader drops them and M3.8 tests for them.

If M misses, the moves in order are a faster model, then the stock "Mm." under decision 5. Turning `preemptiveTts` on gave mixed results with fakes, 630 against 738 ms at p50 and 721 against 1418 ms at p95 in one run, and 1196 against 783 ms at p95 in another. By reading the SDK, it becomes max(D, S + M + F) + trip, so it saves time only while S + M is under D. M3.6 looks at it again. M3.7 reports first sound and first real word as two numbers, so "Mm." cannot hide a slow model.

Long questions are the worst case for D, as "Turn patience" says. That is what a real student question looks like, and those turns take about 1.2 s instead of 0.5 s at the 1 s cap.

The first word of a session has its own limit, 3 s from submit (PRD section 6.3). Joining the room and starting the session took 401 to 641 ms here. Fakes have no connection cost, so M3.6 measures this.

## What leaves our servers

"No audio is stored" was only half true. `record: false` stops the SDK uploading audio, and each vendor has its own defaults. Terms read on 3 November 2026. Meta's and ElevenLabs' terms were read through a page summary and need a full read, so their rows and the S5 and S6 lines below are unproven until then.

| Vendor | What it receives | Default | What we set | Who |
| --- | --- | --- | --- | --- |
| Meta, Muse Voice Transcribe | Student audio | Standard Services do not train on content, and Contributor Services do. The plugin has no setting for this, so it is the account's. Retention is unread | Standard Services on our account | Abel confirms on `muse-key`, M3.6 |
| ElevenLabs | The tutor's text, and no student audio | A training opt-out in account settings. Retention is unread | The opt-out on | Abel confirms on `elevenlabs-balance`, M3.2 |
| LiveKit | Audio in transit | Agent observability stores transcripts and audio for 30 days when recording is on | `record: false`, and no Egress | M3.6 |
| Anthropic | The conversation | The API does not train on inputs by default, per its privacy center. Standard retention applies, and zero retention needs an agreement | Ask for an agreement before any minor signs up | Abel, M4.5 |

S5 is unproven. ElevenLabs never receives student audio and `record: false` covers the SDK, but Muse receives student audio on terms read only in summary. S6 is unproven. No training rests on two account settings, Meta's Standard Services and ElevenLabs' opt-out, read only in summary. The tutor's text can include a student's name, and whether ElevenLabs keeps it is unread. Both vendors' age rules bar this product for under-18s as written, as "Decide here" says. A lawyer reviews all of this before invitations go out (PRD section 11).

## What the log records

The agent is the only writer, and the browser reports what played. There are five events. `beatPlayed` holds the beat, each word's start, words played, when each cue really fired, how it ended, and any frozen frames. `boardFrozen` holds a freeze that lands after a beat's last word, with something still moving. `studentSpoke` holds the words, typed or spoken, and whether just a small reaction. `studentActed` holds slider drags, rewinds, ink, ink erased, and uploads. `connectionGap` holds how long the connection dropped.

A beat is written once, when it ends. Silence has no event. Rows are unique on session and sequence number, so a repeated write changes nothing. If the browser never reports, the agent writes its own estimate and marks it `agent-estimate`. The browser's words played count only while there is sound, so a stop during a stall reports the words heard, 4 of 4 here, with 0 cues fired after it. The count comes from word times and the clock, so it can be off by a word when word times are noisy. The SDK's own report is not used, because it said 5 to 7 words when a listener heard 12 or 13, though that was with our fake voice.

Replay, seeking, rewinding, and a page reload all call one function, `rebuildBoard(log, atMs)`, which M3.2 writes. It flattens events by time and not by sequence number, because a beat is written when it ends. A cue replays when it really fired, so a late `play` lands right. Browser messages carry `startedMsAgo`, so a drag logged late keeps its order. `frozen` holds a simulation's frame, a reveal's position, or how far a drawing had drawn. So a live board and a replayed board should agree whenever the browser reported, and `replay-check.ts` shows that for 21 cases on a modeled board, with 2 traps that must disagree. It is a model and not M3.2's player, so M3.2 must not copy it, and the real test is M3.2's. An `agent-estimate` row can disagree, and it says so on its face.

## The scene language

The tutor names what to show. The engine decides where it goes and how it moves, so the model cannot place a pixel (T6).

B5's library maps to these commands. Equations are `writeMath`, `transformMath`, and `highlight`. Plots and number lines are `plot`, `numberLine`, and `markValue`. Geometry is `geometry` and `construct`. Forces are `vector` and `trackVector`. Computed motion is `simulate`, `runSimulation`, `setParameter`, `slider`, and `ghostPath`. Diagrams and drawings are `diagram` and `drawing`. Then `table`, `timeline`, `code`, `image`, `text`, `annotate`, and `focus`, with `reveal` to build in steps, and `hide` and `clearBoard` to keep the page clean.

The whole sample session from PRD section 6.4 parses with these types, including the six seconds of silence, the frozen ball, and the slider drag. The parser is hand-written and has no dependency. `src/scene-language` holds 1,612 lines without blanks and comments, so "types only" no longer describes that package.

**Settled in the types, with tests.**

- Motion lands on a word. `runSimulation` can `play` `until` a moment such as `peak`, over a number of words, and hold there. `seek` jumps to a moment.
- A graph, diagram, table, timeline, or code block can start empty and build in steps, with `reveal` and `overWords`.
- The tutor can change a value with `setParameter`, which restarts the motion from its first frame, as a slider sample does. Tracked arrows are velocity, its two parts, and acceleration. Each simulation value has a range, so `gravity` 0 is refused and a ball always lands.
- Marks have ids, so `hide` removes them, and an annotation can be a cross and carry a label. `highlight` can pick one occurrence. `plot` has axis labels, a `yRange`, and a real expression parser, `parsePlotExpression`, with numbers, `x`, `pi`, `e`, `+ - * / ^`, parentheses, and `sin cos tan exp ln log sqrt abs`. So `x**2` is refused when the model writes it, and not at render time after the words have played. M3.3 evaluates the same parsed tree with `evaluatePlotExpression`, with no `eval`.
- The tutor can mark student work. Ink has an id, per-point times, an erase action, and a stated frame of fractions of the board panel, and `getBoardAfterAction` puts it on the board. `image` can show an upload by `fileId`.
- Reusing a live id replaces that element in place.
- Limits fit the wire. LiveKit's docs say 15 KiB for a reliable message, so a long drag or stroke is split across messages, and the parser refuses anything larger.
- A new simulation parameter comes with a default, so older rows still parse. Widening a range is safe, and narrowing one would refuse old rows.

**Open, with an owner.**

| Owner | What the language cannot say yet |
| --- | --- |
| M3.3 | Shade an area under a curve. A named constant on a curve, so a slider can change it. |
| M3.4 | A launch angle slider. A playback rate with no word to aim at. Number readouts that follow a quantity. How `overWords` behaves when later word times have not arrived. |
| M3.7 | B2 has a guard only in the prompt today, so M3.7 adds one: if no command has come by the turn's third word, the reader adds a `focus` on the last element, and the evaluation fails any turn over 1 s. |
| M3.11 | One mark on a group of strokes, a region of a photo, a tutor stroke, and ink when the layout differs between sizes. Its sign-error test passes only if the sign is one stroke the model can name. |
| M4.4 | "The board replays its key moments" (PRD section 6.6). |
| Later | CJK and Thai count as one word, so every cue would fire at word 0. PRD Q12 says English first, so this waits. |

**Safety.** The parser checks shape and not meaning, and free text can hold anything that is printable. So M3.3 to M3.5 render text as text and never as HTML, call KaTeX with `trust: false`, and keep names in Maps. The parser refuses `__proto__`, `constructor`, names no reference can reach, control characters, bidi overrides, and `\href`, `\url`, `\includegraphics`, and `\html` commands in `tex`. So a model that writes `"\frac{1}{2}"`, which JSON turns into a form feed, gets a refusal and not a wrong equation. Huge `\rule` values and macro bombs stay M3.3's. The agent strips bidi characters from student text before it stores it.

**How other code loads it.** `apps/agent` runs plain Node 22.18 or newer, which strips types with no loader, and in a verifier's run 22.17.1 failed. The repo's `engines` floor of 22.22, from main, covers that. A `pnpm deploy` copy cannot load the package, because Node will not strip types under `node_modules`, so M3.6 deploys from the workspace or bundles with esbuild. When the NestJS API imports the parser, it adds the workspace dependency, `rewriteRelativeImportExtensions`, and the Jest line `moduleNameMapper: {"^(\\.{1,2}/.*)\\.js$": "$1"}`. A verifier ran that, and `nest build` passed and Jest gave 233 of 233.

**The board's direction.** You want the board to go beyond a hand-built library, with 3D, cinematic zooms, scenes generated for almost any topic, and a board shared by student and tutor. Prototypes are being tried, and this is undecided. So M3.2 builds the player so that a scene can be any deterministic function of the clock, with named parts and named moments, and does not bake in only the planned 2D kinds. M3.3 to M3.5, M3.8, M3.11, and PRD Q11 may change after you decide.

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

The live session gets its own route, `/live/:sessionId`, outside `AppShell`, because `AppShell` keys its page on the path and a URL change would remount the page and kill the session. It follows `docs/DESIGN.md` and the prototype's session grid. A bordered board panel takes 7 parts and a talk column takes 5, stacked on a phone. The page is still at rest, and motion has a cause: a word or the student's hand. Audio needs a user gesture, which submitting on Home gives. After a reload, one "Continue" button starts the audio.

## What changes in the plan

These are all the changes to the approved plan. After this merges, they go into `docs/plans/mvp.md` and the issues.

| PR | Change |
| --- | --- |
| M3.1 | `packages/contracts` ships runtime parsers, not only types. `"type": "module"`, `.ts` imports, and `allowImportingTsExtensions` in its and the web app's `tsconfig.json`. The `theme/no-vendor-imports` lint rule. |
| M2.5, M3.10 | The live route sits outside `AppShell`. |
| M2.6 | Tables move from the private `app` schema to `public` with row security on, as you ruled, so the log table does too. It goes through `infrastructure/orm` with a generated migration. |
| M2.8 | Its privacy page is checked against "What leaves our servers", and it lands first. Until this merges it reads this file on the PR branch and PRD S5 and S6, and it must not say that no vendor keeps text. M3.6 rechecks the page against the final settings. |
| Before M3.2 | A first-word speed test of all three models, as you chose, once the Anthropic account exists. It records what it finds in `docs/tests/tutor-model.md`, and costs a few dollars of the $50 limit. |
| M3.2 | Its stop for the Cartesia account (`mvp.md:899`) is done, and it builds the ElevenLabs adapter. Moves here from M3.6: the worklet clock over real WebRTC on a local LiveKit server, the proof of the browser's mute, and `audioGap` from a small publisher. It carries this round's clock fixes into real code: lateness adds up, an opened gap always closes, and the hold has a bound. "Never from timers" gains one exception, the fallback when audio cannot run. The ElevenLabs list in "What M3.2 and M3.6 must measure again". The player lets a scene be any deterministic function of the clock. The 150 ms rule reads as decision 3 says. The player sends `questionHeard`, counts words only while there is sound, and fires cues behind the per-block gate. It builds behind the provider boundary. The measured drift rule is on cues really fired. |
| M3.3 to M3.5 | New commands: `reveal`, `setParameter`, `seek`, `until`, `overWords`. Text-only rendering, KaTeX `trust: false`, `parsePlotExpression` with no `eval`, Maps for names. Simulation ranges from `SIMULATION_MODELS`. |
| M3.6 | Depends on M3.2, not only M3.1, because the clock and mute live there and V2 rests on the mute. Builds `apps/agent` behind the provider boundary, and moves `provider-suite.ts` there. Its stop for Deepgram, Cartesia, and LiveKit (`mvp.md:1099`) is done, and it builds the Muse adapter on LiveKit Cloud. Its own `ttsNode`, which sends `audioGap`. Early model start, a 300 ms floor, and a 1 s cap with the 2 s rule under decision 4. `ttsTextTransforms: null`, `aecWarmupDuration: null`, `record: false`, `closeOnDisconnect: false`, `minWords: 9999`, `resumeFalseInterruption: false`. The `@livekit/agents` pin at 1.9.5. The turn rule with resume, `getResumeScript`, and `clearUserTurn`, with digits as words and the story that proves it. `stop` on a cut reply. The 8 s timer. An echo test, and the echo word filter this document describes. `@livekit/agents-plugin-meta` in `theme/no-vendor-imports`. The "Interrupting stops the agent within 150 ms" check and rule read as decision 3 says, and gain first sound to yield at most 300 ms, and first sound to silence at most 1.2 s at p95, as starting values. |
| M3.6, `mvp.md:1107` | Reads: first sound within 800 ms at the median and 1.5 s at p95 on turns decision 4's 2 s wait does not hold, and within 2.5 s at p95 on turns it holds. That 2.5 s is a starting value: the 2 s cap plus F and the trip at p95, rounded up. |
| M3.6, `mvp.md:1130` | Rule: fail if turns the 2 s wait does not hold exceed 800 ms at the median or 1.5 s at p95, if turns it holds exceed 2.5 s at p95, or if stop time misses decision 3. |
| M3.7, `mvp.md:1184` | Rule: fail the chosen model if first real word misses the same split, and report to Abel if cost exceeds $0.15 a minute. |
| M3.7 | The reader, the prompt's rules, and the note to the model, with a model adapter so all three run by name. It takes the model the speed test chose. A 90-turn test added to the 30-turn test, because 30 turns is only 10 minutes. Compaction under decision 11. B2's guard. Its perf rule measures first real word, not first audio, so "Mm." cannot pass it. |
| M3.7, M3.8 | Stock phrases, which the plan does not have, under decision 5. |
| M3.8 | Its evaluations must run against any model by name, because decision 10 compares three. A new case from your Aristotle note: the student interrupts to ask for clarification, and the tutor answers it, then goes back to the point without repeating itself. A test that no internal tag or spoken math mark reaches the voice. |
| M3.9 | `system` and `tools` stay frozen for prompt caching, so the current step goes in as an appended message. |
| M3.10 | Its perf rule measures first real word, not first audio. |
| M3.11 | Ink and uploads use the shapes above, and it settles its open row. |
| M4.4 | Adds the key-moments command. |
| M4.5 | Anthropic's zero-retention agreement, Meta's and ElevenLabs' age rules, and a full read of their terms go into the legal review. |
| PRD section 10 | The cost table is superseded by the table above, once you approve. |
| PRD Q8, plan section on live tutor facts | ElevenLabs replaces Cartesia by default, Muse replaces Deepgram, and the blind test of voices stays open. |

## Alternatives that lost

The PRD's `say` plus `cues` lost because every author must count words. A browser-written log lost because the record would depend on a tab that can close. The agent working out what played lost because it cannot see the jitter buffer. The browser guessing lost from late lost for the reasons above. Structured output lost because a schema with 25 branches is untested and a failure is not speech. A `speak` tool lost because it can be skipped under `auto` and forced tool use is gone. Stopping on any voice makes every "uh-huh" a gap of about 2 s.

## What M3.2 and M3.6 must measure again

No proof here has run ElevenLabs or Muse. The plugin facts below come from the 1.9.5 npm packages, read and not run.

**M3.2, ElevenLabs.**

- The main open risk to the clock: alignment arrives with its audio, and the plugin holds each chunk's last word until the next chunk or the final. So word times may have near zero lead, and this design relies on a lead. This touches `questionHeard` too.
- The flush figures of 98 and 801 ms came from a fake of Cartesia's wire. The plugin sends `flush: true` only in auto mode, which `chunkLengthSchedule` turns off.
- The 1 s context close and the new-context fallback are Cartesia facts.
- `preferredAlignment` defaults to `normalized`, so "2.5" may become several words and shift every later `atWord`.
- The plugin subtracts leading silence from word times, and the tracker counts it.
- Also word time noise, stall reads on real chunk sizes, the F step, stock phrases' stored word times, and new fakes.

**M3.6, Muse.**

- The 674 ms stop came from a fake interim. A final is the server's `speechComplete`, and the plugin's `flush()` sends only pending audio, so S, max(D, S + M), and early model start may move.
- A final later than the 700 ms grace gives stop, resume, stop, so the tutor talks over the student.
- Turn patience's 38 of 120 and decision 4's cost need rerunning, because the detector scored the fake's exact text.
- `clearUserTurn` means a new handshake on each reaction.
- Spellings and digits. Whether Muse writes "42" or "forty-two" is unmeasured.
- Keywords are fixed at the handshake. Sessions cap at 60 minutes with no rotation. The plugin has no equal to `mipOptOut`.
- `theme/no-vendor-imports` lets `@livekit/agents-plugin-meta` pass in `apps/web`, so M3.6 adds it.

**LiveKit Cloud.** V2's delivery figures, the trip's 60 ms, and the 401 to 641 ms join are local-server numbers, so M3.6 measures them on Cloud.

**Follow-ups, with owners.** All of these ran at `02b8b67`, and this round did not rerun them.

- M3.2. A stall in leading silence moves the count back for the whole turn, -460 ms at a 500 ms stall, read from `clock-rule.mjs`.
- M3.2. A late turn message after any silence of 107 ms or more takes the last onset, p95 1441 ms with word times 1500 ms late.
- M3.2. Drift with no stall: 2 of 12 turns ran 46 and 122 ms early with no report, so later words' whole-run p95 was 46 ms on a reviewer's run against this document's 5.
- M3.2. The worklet on Safari, Firefox, and Android, because the clock moved here from M3.6.
- M3.6. "Mm-hmm" stopped the tutor 3 of 3 and got a reply. By the rule so do "Mhmm", "Hm", "Mmm", "Um", "Oh", "I see", and "Got it". "Um" is a filler in `agent-node.mjs` and a real word in the rule.
- M3.6. A stop during thinking with interim words only has nothing to resume, and the answer to "Gravity." was lost in 2 of 3, so M3.6 needs a rule to rerun the model.
- M3.6. The echo word filter under "The SDK's echo wait" has no plan row or code until the plan change above.

## Still unproven

Every result below rests on fakes unless it names a vendor. The fake voice sends word times before audio, the fake transcriber returns exact words, and neither has a connection cost.

**M3.2, with real ElevenLabs.** Whether its words match ours for numbers and symbols. Whether a mid-sentence flush sounds natural and speaks at once, and whether contexts close. Whether word times arrive ahead of audio. How noisy they are. The clock on real speech over real WebRTC. Whether `audioGap` reads true on a real voice, and whether a real voice ever runs slower than real time. The mute on Safari, iOS, and Android. Whether the worklet works on Safari, Firefox, and Android.

**M3.6, with real Muse, LiveKit Cloud, a real network, and real devices.** When transcripts really arrive, which sets the stop time, the grace, and S. Starting the model early helped with fakes, 508 against 820 ms, but the fake's final fired about 1250 ms before the student finished, so that is not evidence. Whether real transcripts catch "uh-huh" and "hmm". Whether `audioGap` holds through the real `ttsNode` with a real voice. Echo through a laptop speaker with the wait off. Bluetooth delay. A real dropped network. The detector's cap on real speech. LiveKit Cloud's adaptive interruption and full detector, which every run here left off with `mode: 'vad'` and `v1-mini`, so M3.6 chooses whether to test them. Capacity, because the worker refuses sessions above 70% CPU. A resume when the model is still writing. A lost first sound, which moves a whole turn's cues late.

**M3.7, with the real model.** First-word speed of all three models. How much Opus 5.5 thinks at `low`. How often commands parse. Whether a long command empties the audio. Whether the note and a cancelled reply pass the history check. Whether compaction keeps the tutor's memory and costs what this says, because its read price and summary size are unchecked. What the tutor says after a refusal: Opus 5.5 can decline as `bio` on a biology lesson, and Sonnet 5.5 has five categories, `cyber`, `bio`, `frontier_llm`, `reasoning_extraction`, and `general_harms`, so benign work can trigger one. Real tokens and cost.

**After M3.10.** Whether students feel any of this, which is test 5 in PRD section 13, and whether it holds up next to Aristotle when you try both. Your session's note says nothing on the board, so PRD section 4's board row stays open.

## For later owners

| Owner | Note |
| --- | --- |
| M3.2 | Unmute on the next `turnStarted`, and never earlier. Rebuild by time, not sequence number. A `turnStarted` that lands within 300 ms of sound takes the onset already heard, as `stop-page.js` does. |
| M3.4 | Hiding a `simulate` leaves arrows that follow it on the board. Decide what goes with it. |
| M3.6 | A background tab or locked phone suspends audio, so the clock stops. Decide what the agent does. |
| M3.6 | Blocked audio: the agent is never told, and the note would say "heard". The browser must report it. |
| M3.6 | After a reconnect only the cut beat resumes in the proof. Decide what happens to the rest of the turn. |
| M3.6 | Student captions: choose between LiveKit's transcription stream and our own message. |
| M3.6 | `agent-node.mjs`'s resume uses a constant reply and a cumulative count, so copy `getResumeScript` from `stop-agent.mjs` and not that. `getResumeScript` can return more than 12 commands, or commands with no words left, so the agent needs a rule for both. |
| M3.6 | The reader's board can hold an element whose cue never fired after a cut. Rebuild it from the report before a resume. |
| M3.6 | Words the fake gave exactly may not come back from Muse that way, so check the reaction and filler lists against real transcripts. |
| M3.7 | The reader must drop internal XML tags, which it does not do today. The prompt must write math in words in speech. |
| M3.10 | Agent-to-API auth and the log table's owner. |

## Decisions in full

**1. The design.** Approved on 3 November 2026.

**2. Node or Python.** Node, for the reason above.

**3. What V2's 150 ms measures.** A: from the agent's decision to stop, to silence and a frozen board, on a good connection, with two limits the student can feel: first sound to yield at most 300 ms, and first sound to silence at most 1.2 s at p95. Those are starting values, written into M3.6's perf rule, and the runs here gave 182 ms and 790 ms at p95 with fakes. As written, from the student's first sound, cannot be met: the fastest rule tested left 388 ms of audio at p50 and 597 ms at p95 with instant fakes, and it stopped on every "uh-huh". If M3.2's mute test fails on a browser, audio keeps coming for about 150 ms after the stop there. Then A misses on that browser, M3.2 stops by its own rule, and you choose between that browser and a slower target.

**4. Turn patience.** B. See "Turn patience" for its cost.

**5. Stock phrases.** A: "Let me work that out." during a tool call, in the tutor's voice, and no "Mm." unless M3.7 shows the model misses V1 and you hear it first. A repeated phrase turns into a tic, and this applies most to this one, so each voice gets three versions, and no phrase plays twice in three turns. A stock phrase is a normal beat with stored word times. The browser's clock counts it, captions show it, the log records it, and the student can interrupt it. "Mm." alone would meet V1's letter, so M3.7 reports first real word, and if that misses you choose between a faster model and a higher V1.

**6. The voice. ElevenLabs Turbo.** 6M characters at $40 per million is $240 a month, the listed price read on 3 November 2026. `@livekit/agents-plugin-elevenlabs` 1.9.5 asks for word times, and M3.2 measures them. Its usage policy and training opt-out are under "Decide here" and "What leaves our servers".

**7. Transcription. Meta's Muse Voice Transcribe.** 12,000 minutes at $3 per 1,000 is $36 a month, the listed price read on 3 November 2026, on Standard Services. M3.6 writes the adapter on `@livekit/agents-plugin-meta` 1.9.5.

**8 and 9. Hosting. LiveKit Cloud with our own accounts, not Inference.** [LiveKit Cloud](https://livekit.com/pricing): Ship from $50 with 5,000 agent minutes, then $0.01 a minute, and 20 sessions at once, so $120 a month. Each user connects to the nearest edge. Cloud also offers the full turn detector and Krisp noise cancellation. The design does not rely on adaptive interruption or the full detector: every run here used `mode: 'vad'` and `v1-mini`, and no noise cancellation has been tested here. A free local LiveKit server still runs M3.2's lab page.

**10. The model.** Test all three now, because thinking cannot be turned off on Opus and public figures put it far outside V1. It runs before M3.2, once the account exists. [Prices](https://platform.claude.com/docs/en/about-claude/pricing) per million tokens: Opus 5.5 $4 in, $20 out, $0.20 cache read. Sonnet 5.5 $2, $10, $0.10. Haiku 5.5 $0.10, $0.50, $0.01, and five times that above 100,000 tokens. One run of M3.7's 30-turn test on all three costs about $1.30. I expect Sonnet 5.5, at about 40% of Opus's model cost, unless teaching quality says otherwise. [Tier caps](https://platform.claude.com/docs/en/api/rate-limits): Start stops at $500 a month and Build at $1,000, and calls return 429 until the next month, so request Scale before the beta, or the tutor goes silent mid-month.

**11. Long sessions.** B, with C as the fallback. History is append-only, so every turn adds about 1,600 tokens that every later turn pays for. Letting it grow, a 30-minute Opus session costs $0.145 a minute for all four services, or $0.204 with background work and the buffer, against the PRD's $0.15, and Sonnet $0.079 and $0.118. B is on-demand compaction (beta `compact-2026-09-04`) in the background when the prompt reaches about 60,000 tokens, with the turn going on while it runs. The docs say kept turns stay valid after the swap. That gives Opus $0.127 and $0.180, and Sonnet $0.071 and $0.107, which assumes a 4,000 token summary and a compaction read billed at the cached rate, neither of them checked yet. C is our own summary on a cheap model, starting a fresh conversation, which loses the thinking and the cache. M3.7's new 90-turn test decides whether B holds.
