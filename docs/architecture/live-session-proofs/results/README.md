# Recorded results

Detail moved out of `docs/architecture/live-session.md`. All of this used fake vendors, on one busy Mac, unless it says otherwise. `verifier-*.json` files come from independent reruns, copied here so the numbers have a record. Load is the machine's one-minute load average at the end of a run.

## The clock, fired live

`clock-run.mjs` runs real Chromium over real WebRTC, with a UDP relay adding delay, jitter, and loss, on a test tone. Each method fires one cue per word in the page, from the same audio, as a player would. The error is the moment the cue fired minus the moment that word's burst reached the worklet. It leaves out the speaker and the screen. Each cell is p95, worst, and how many cues fired more than 40 ms early, in ms. The last column replays the rejected rule at each word's own moment, the way the first two rounds' table did, and it scores a word right after a stall near 0 by construction. It is the only reanalysed number here.

| Scenario | Load | Words heard | Count samples, skip what the agent reports (chosen) | Browser guesses from packet loss, gate on each block | Browser guesses from RTP, gate on each block | Browser guesses from RTP, gate at 107 ms of silence (the last round) | Count samples only | RTP only | When a data message arrives | Rejected rule, reanalysed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| clean | 8 | 162 of 208 | 19 / 24 / 0 | 19 / 24 / 0 | 19 / 24 / 0 | 19 / 24 / 0 | 19 / 24 / 0 | 34 / 44 / 0 | 80 / 83 / 162 | 14 |
| uneven | 13 | 155 of 208 | 6 / 11 / 0 | 6 / 11 / 0 | 6 / 11 / 0 | 6 / 11 / 0 | 6 / 11 / 0 | 20 / 23 / 0 | 168 / 182 / 149 | 9 |
| poor | 4 | 163 of 205 | 26 / 50 / 1 | 26 / 50 / 1 | 26 / 50 / 1 | 26 / 50 / 1 | 26 / 50 / 1 | 26 / 44 / 1 | 280 / 723 / 148 | 29 |
| stall-90 | 4 | 207 of 207 | 36 / 54 / 3 | 89 / 141 / 97 | 89 / 141 / 97 | 89 / 141 / 108 | 89 / 141 / 97 | 84 / 92 / 96 | 167 / 202 / 206 | 90 |
| stall-120 | 3 | 206 of 206 | 47 / 59 / 2 | 19 / 69 / 2 | 19 / 69 / 2 | 115 / 120 / 14 | 120 / 171 / 94 | 124 / 176 / 94 | 180 / 230 / 206 | 19 |
| stall-200 | 3 | 212 of 212 | 6 / 15 / 0 | 18 / 20 / 0 | 18 / 20 / 0 | 195 / 201 / 12 | 201 / 212 / 96 | 208 / 214 / 96 | 278 / 282 / 212 | 19 |
| stall-500 | 3 | 204 of 204 | 7 / 10 / 0 | 17 / 18 / 0 | 17 / 18 / 0 | 495 / 500 / 12 | 500 / 505 / 93 | 503 / 515 / 94 | 569 / 572 / 204 | 19 |
| stall-200-mid-word | 5 | 209 of 209 | 15 / 19 / 0 | 209 / 214 / 96 | 209 / 214 / 96 | 209 / 214 / 96 | 209 / 214 / 96 | 207 / 211 / 96 | 277 / 283 / 209 | 210 |
| stall-500-mid-word | 4 | 209 of 209 | 6 / 8 / 0 | 373 / 385 / 96 | 373 / 385 / 96 | 373 / 385 / 96 | 500 / 502 / 96 | 505 / 513 / 96 | 574 / 576 / 209 | 376 |
| stall-200-uneven | 3 | 202 of 202 | 8 / 34 / 0 | 17 / 229 / 2 | 17 / 229 / 2 | 195 / 229 / 12 | 208 / 230 / 95 | 204 / 214 / 93 | 362 / 378 / 202 | 19 |
| stall-500-poor | 3 | 205 of 205 | 49 / 56 / 16 | 368 / 550 / 19 | 368 / 550 / 19 | 489 / 550 / 28 | 516 / 551 / 104 | 512 / 521 / 94 | 742 / 779 / 197 | 51 |
| pauses | 3 | 179 of 180 | 5 / 17 / 0 | 8 / 17 / 0 | 5 / 17 / 0 | 5 / 17 / 0 | 5 / 17 / 0 | 20 / 22 / 0 | 68 / 70 / 172 | 1 |
| pauses-stall-300 | 5 | 180 of 180 | 13 / 18 / 0 | 11 / 26 / 0 | 11 / 26 / 0 | 26 / 299 / 8 | 300 / 314 / 80 | 303 / 309 / 80 | 368 / 373 / 180 | 14 |
| lost | 2 | 230 of 258 | 26 / 1054 / 0 | 2120 / 4132 / 0 | 26 / 1054 / 0 | 26 / 1054 / 0 | 26 / 1054 / 0 | 17 / 1054 / 0 | 1012 / 1978 / 198 | 28 |
| pauses-lost | 4 | 164 of 219 | 59 / 147 / 8 | 4106 / 4335 / 0 | 1556 / 2036 / 0 | 1488 / 2036 / 0 | 59 / 147 / 8 | 61 / 999 / 8 | 1133 / 1735 / 135 | 1347 |
| pauses-lost | 3 | 191 of 217 | 19 / 26 / 0 | 3391 / 3704 / 0 | 2737 / 3293 / 0 | 2477 / 3293 / 0 | 19 / 26 / 0 | 23 / 25 / 0 | 1753 / 2017 / 150 | 2747 |
| pauses-lost | 3 | 196 of 225 | 26 / 171 / 0 | 3220 / 3492 / 0 | 1744 / 2404 / 0 | 1659 / 2404 / 0 | 26 / 171 / 0 | 27 / 997 / 0 | 920 / 1977 / 172 | 1655 |
| words-late-300 | 4 | 205 of 205 | 234 / 246 / 0 | 234 / 246 / 0 | 234 / 246 / 0 | 234 / 246 / 0 | 234 / 246 / 0 | 234 / 246 / 0 | 70 / 73 / 203 | 1 |
| words-late-300-poor | 5 | 210 of 210 | 93 / 277 / 0 | 93 / 277 / 0 | 93 / 277 / 0 | 93 / 277 / 0 | 93 / 277 / 0 | 93 / 277 / 0 | 262 / 329 / 194 | 10 |

The clean, 40 ms, and 100 ms rows also carry cut turns, so fewer words are heard than sent. In the delay rows the word times lead the audio by a median of 67 ms on a clean link, 123 ms on the middle link, and 174 ms on the worst, with the fake sending them before audio.

**Telling lost from late.** Across the three runs with pauses and 1 s of loss every 8 s, 35 silences were longer than 350 ms. RTP called 28 of them lost, and the rest late. The packet count, read when the audio returned, called 11 of them lost. It often read 0 at that moment and 49 later. With no pauses, RTP called 12 of 12 lost, which is why the first rounds thought it worked.

**The agent's report.** The tracker in `clock-rule.mjs` reads the stall from the time its frames arrive, with no knowledge of the stall we cause. With stalls of 90, 120, 200, and 500 ms it read 90, 117, 197, and 498 ms at p50. A report sent only when audio returned fired the word at a 90 ms stall early, 11 of 12, because the codec fills a short gap with audible sound. So it reports when the queue empties too.

## The turn rule on Node

`node-turns.json`, with `minWords: 9999`, `resumeFalseInterruption: false`, the local turn detector, and the fake transcriber's timing. Every run has the rule on, except the two budget rows the document cites and the vendor settings.

| What | Result | Load |
| --- | --- | --- |
| Real words mid-reply: first sound to yield, p50 and range | 171 ms, 152 to 182 | 6 |
| Real words mid-reply: first sound to stop message, p50 and range | 674 ms, 483 to 714 | 6 |
| Real words mid-reply: first sound to last audio, p50 and p95, no mute | 788 ms, 790 ms | 6 |
| "Uh-huh" stopped the tutor | 0 of 10 | 5 |
| "Uh-huh" over a question stopped the tutor | 0 of 5 | 8 |
| "Hmm" over a question stopped the tutor | 0 of 5 | 13 |
| "Yes." after the question was heard reached the model | 5 of 5 | 25 |
| A second sentence in the gap reached the model | 6 of 6 | 13 |
| The same, with the final 200 ms later | 6 of 6 | 8 |
| Interim words with no final: stopped, then resumed | 5 and 5 of 5 | 4 |
| "Wait." with the transcript 0, 300, 600, 900 ms later: stopped | 5 of 5, 5 of 5, 5 of 5, 5 of 5 | 5 to 7 |
| The same: first sound to stop, p50 ms | 486, 924, 1220, 1595 | 5 to 7 |
| Noise with no words: resumed, every word heard with the cut word twice | 5 and 5 of 5 | 4 |
| Stale text in the next turn, without the clear | 6 of 6 | 8 |
| Stale text in the next turn, with the clear | 0 of 6 | 5 |
| Talking 500 ms into the first reply: stop with the wait off, ms | 648 to 681 | 3 to 5 |
| The same with the SDK default, when only the 1 s rule can fire, ms | 1161 to 1186 | 3 to 5 |

## The long question and the cap

One long question, "Once the ball leaves my hand, what makes it come down?", 20 tries a run, with exact words from the fake. The local detector's score on it spans 0.25 to 0.52 around a threshold of about 0.36. The mix adds three short phrases, 20 tries each, so it has 80 turns.

| Run | Hit the 2 s cap | Mix p95 at 2 s, ms | Hit the 1 s cap |
| --- | --- | --- | --- |
| First run this round, at the last head | 3 of 20 | 710 | 5 of 20 |
| A verifier's first rerun | 10 of 20 | 2199 | 8 of 20 |
| A verifier's second rerun | 8 of 20 | 2205 | not run |
| This round, rule on, run 1 | 10 of 20 | 2209 | 6 of 20 |
| This round, rule on, run 2 | 4 of 20 | 2168 | 3 of 20 |
| This round, rule on, run 3 | 3 of 20 | 609 | 6 of 20 |
| All | 38 of 120 | Over 1.5 s in the runs named | 28 of 100 |

Short phrases hit the cap 2 of 360 at 2 s, and 0 of 300 at 1 s. The mix's p95 sits near 500 ms or near 2.2 s with little between, because more than 1 in 20 of its turns hitting the cap moves it, and one phrase in four is the long one.

## Node against Python

The same agent on `@livekit/agents` 1.9.5 and `livekit-agents` 1.8.10, against the same fakes. "First run" is the first owner's run, in `node.json` and `python.json`. "Rerun" is the verifier's. Later figures from `node-turns.json` use the final turn rule on Node only.

| Fact | First run, Node and Python | Rerun, Node | Rerun, Python |
| --- | --- | --- | --- |
| Default rule: first sound to agent stop, p50 | 607, 639 ms | 615 ms | 648 ms |
| 150 ms rule: first sound to last audio, p50 | 388, 386 ms | 393 ms | 389 ms |
| Yield then stop, p50 | 155 and 643, 200 and 672 ms | 164 and 677 ms | 203 and 676 ms |
| "Uh-huh" stopped the tutor | 0 of 10, 0 of 10 | 0 of 10 | 0 of 10 |
| SDK's rule, noise with no words: pauses, then resumes | 5 of 5, about 2 s, both | 5 of 5, 2009 ms | 5 of 5, 1990 ms |
| Pause test jump-ins: voice detection, then local detector | 5 then 0 of 5, both | 5 then 0 | 5 then 0 |
| First audio, 300 ms floor, 1 s cap, p50 per phrase | 504 to 528, 537 to 558 ms | 513 to 550 ms | 524 to 601 ms |
| Finished phrases hitting the 1 s cap | No record kept | 2 of 40, larger run 9 of 80 | 2 of 40, larger run 5 of 80 |
| Hit a 3 s cap: 300 ms floor, 100 ms floor, no floor | No record kept | 1, 2, 1 of 10 | 0, 1, 4 of 10 |
| First audio p95, 300 ms floor, 3 s cap | 3180, 667 ms | 3168 ms | 1102 ms |
| Audio still arriving after the stop message, p50, p95 | 108 and 146, 51 and 60 ms | 104 and 140 ms | 52 and 72 ms |
| Word times reach the agent | 170 of 170, both, by construction with the fake | 170 of 170 | 170 of 170 |
| Typed: reply, stop, answered | 5 of 5 each, both | 5 of 5 each | 5 of 5 each |
| Student leaves and rejoins | 3 of 3, both | 2 of 3, repeats 3 of 3, 3 of 3 | 3 of 3 |
| Model early, first audio with and without, p50 | 508 and 820, 537 and 916 ms | 549 and 833 ms | 560 and 926 ms |
| Memory, MB | 337 to 692, 152 to 420 | 356 to 647 | 171 to 374 |

The early-model row is not evidence, because the fake's final fired about 1250 ms before the student finished.

**The cap counts.** The first owner's counts of 10 of 80, 5 of 80, and the 3 s row have no record, so they are gone from the design. `verifier-node-cap.json` and `verifier-python-cap.json` hold the 80-attempt run from `--repeat 20`. Nearly all hits are one phrase, the long question: 9 of 20 on Node and 4 of 20 on Python in that run, and 0 of 60 and 1 of 60 for the short phrases. Fisher's exact test on 9 of 80 against 5 of 80 gives p = 0.40, so the difference is not established. `node-phrases.json` is a fresh Node run with every attempt recorded: 5 of 80 at a 1 s cap, all on the long question, and 3 of 80 at a 2 s cap, also all on it. Pooled, the long question hit the 1 s cap 14 of 40 times on Node, and Node against Python is 14 of 160 against 5 of 80, p = 0.62.

## Timing tables

One data message, agent to browser, ms, from `clock.json`.

| | Clean | 40 ms delay, 30 ms jitter, 1% loss | 100 ms delay, 70 ms jitter, 4% loss |
| --- | --- | --- | --- |
| Reliable channel alone, p95 and worst | 3, 12 | 97, 256 | 302, 1263 |
| First arrival of both channels, p95 and worst | 3, 12 | 65, 94 | 164, 860 |

Audio still arriving after a `stop`, with no mute in the listener, at p50: 75 ms on a clean network, 149 ms on the middle link, and 264 ms on the worst, in the clock run. Behind the Node agent on a local server it was 105 to 128 ms.

## Flush detail

First audio after the model's first words, at about 100 tokens a second, on the sample session's first sentence, with fakes: 77 ms at p50 in 15 runs with the rule (before each command, at each beat end, after the first 8 words), and in the first round 771 ms with a flush only at beat ends and 801 ms with none. Cues reached a listener at least 822 ms before their word, with the fake, which sends word times before audio. In the audit's replay of the sample session, 9 of 19 flushes end mid-sentence. Modeled gaps in the audio for the flagship beat: 313 ms at 79 tokens a second, 181 at 105, 35 at 165. Three commands in a row at 50 tokens a second pass Cartesia's documented 1 s context close, by 1459 to 1659 ms.

## Vendor pages read on 3 November 2026

| Page | What it said |
| --- | --- |
| deepgram.com/terms, last updated 6 August 2026 | Section 3.2 licenses content for training. Section 3.3 gives a per-request opt-out. |
| developers.deepgram.com, Model Improvement Program | `mip_opt_out=true` on each request. Opted-out data is kept only as long as needed to process the request. Does not mention price. |
| cartesia.ai/legal/terms, revised 14 June 2024 | Section 5.3(c) trains on inputs and outputs unless otherwise agreed. Section 5.3(d) opts out by form. |
| Cartesia DPA, section 13 | A Zero Data Retention setting, from onboarding or account settings, stops storage, logging, and training. |
| docs.cartesia.ai, contexts, continuations | Contexts close 1 s after the last audio. A chunk with no ending punctuation can wait in the buffer and "sometimes ends with odd or distorted sounds". A 2025 changelog line suggests the expiry changed. |
| LiveKit terms sections 7.6, 7.7, and its zero retention post | Inference is zero retention by default. Agent observability stores transcripts and audio for 30 days. |
| docs.livekit.io, data packets | Reliable packets up to 15 KiB, protocol limit 16 KiB. Lossy 1300 bytes. |
| platform.claude.com, rate limits | Start $500 and Build $1,000 a month, then 429 until the next month, no `retry-after`. New organizations may start in an Evaluation tier. A self-set limit returns 400. |
| platform.claude.com, pricing | Opus 5.5 $4, $5 write, $0.20 read, $20. Sonnet 5.5 $2, $2.50, $0.10, $10. Haiku 5.5 $0.10, $0.125, $0.01, $0.50, and five times that above 100,000 tokens. |
| artificialanalysis.ai, 10,000 input tokens, p50 over 72 hours, including thinking | Opus 5.5 low effort 10.97 s, 79 tokens a second. Sonnet 5.5 low effort 1.20 s, 1.08 s to first chunk, 105 tokens a second. |
| zenmux.ai, Opus 5.5 | Anthropic 2.33 s, 81 tokens a second. Vertex 1.36 s. Method not stated. |
| humannessindex.vapi.ai, June 2026 | Sonic 3 166 ms median, 50 trials, with network time. Cartesia's changelog says about 190 ms. |
| docs.cartesia.ai/enterprise/zero-data-retention | "You must be on an enterprise plan to enable ZDR." It covers text-to-speech and speech-to-text content, and request ids, usage totals, and account data are still kept. |
| LiveKit terms, sections 7.6 and 7.7 | Inference providers "are contractually required to provide Customer with zero data retention". |
| livekit.com/pricing/inference | Voices bill per character. Cartesia Sonic $50 per million on Build and Ship, $37.50 on Scale. The cheapest voices are $15 on Build and Ship. Nova-3 $0.0048 a minute, Flux $0.0065. |
| docs.livekit.io/agents/multimodality/text | "only the Cartesia, ElevenLabs, Rime, and Speechify plugins support word-level transcription timing". "For other providers, including LiveKit Inference, the alignment is applied at the sentence level". |
| docs.livekit.io/intro/cloud.md | Built-in inference on self-hosted is "N/A, bring your own model provider API keys". Self-hosted is a "Single-home SFU" with a "Single server per room", where on Cloud "Each user connects to the nearest edge". Krisp appears only under Cloud, and ai-coustics needs your own license key on self-hosted. |
| The Claude API model guide, through the `claude-api` skill, cached in the installed skill | Opus 5.5: thinking cannot be disabled, default effort `medium`, "Answer directly without deliberating." can reduce thinking, and less thinking can cost accuracy. Sonnet 5.5: try adaptive thinking at `low` first, then `between_tools`, and remove any instruction not to think, because "such instructions make it more likely to write internal XML tags in its visible output". Five refusal categories: `cyber`, `bio`, `frontier_llm`, `reasoning_extraction`, `general_harms`. |
