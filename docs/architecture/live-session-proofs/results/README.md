# Recorded results

Detail moved out of `docs/architecture/live-session.md`. All of this used fake vendors, on one busy Mac, unless it says otherwise. `verifier-*.json` files come from an independent rerun at `741a1c9`, copied here so the numbers have a record.

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

One data message, agent to browser, ms, from `clock.json` on the final rule.

| | Clean | 40 ms delay, 30 ms jitter, 1% loss | 100 ms delay, 70 ms jitter, 4% loss |
| --- | --- | --- | --- |
| Reliable channel alone, p95 and worst | 3, 11 | 100, 279 | 313, 1327 |
| First arrival of both channels, p95 and worst | 3, 11 | 68, 99 | 181, 394 |

The audio's clock map puts up to about 20 ms of offset on clean figures. A rerun showed -16 ms at p50.

Audio still arriving after a `stop`, with no mute in the listener: 69 ms on a clean network and 176 ms on the worst link at p50 in the clock run, and 104 to 155 ms at p50 behind the Node agent on a local server.

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
