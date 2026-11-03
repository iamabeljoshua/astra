# Scene player: what the real voice measured

This is the record PRD test 1 asks for. It covers M3.2, the first run of the board clock on a real voice. `scene-player-results.json` holds the numbers behind every table.

Every figure was measured on 3 and 4 November 2026 on Abel's Mac under load from other agents, at a load average of 7 to 19. The voice is ElevenLabs Casey, reached over a West African network to `europe-west4`. The room is a local LiveKit server. The audio device is Chromium's fake device, which reports 32 ms of output latency. All text is test text, with no student data. No figure here comes from the agent's region, LiveKit Cloud, or a real speaker.

## The result

The bet holds on a real voice. Every target in M3.2 passes on a good connection. On the worst link, drift still passes and one stop rule misses, which decision 3A expected.

| Target | Rule | Good connection | Worst link |
| --- | --- | --- | --- |
| A drawing starts on its word (B1) | p95 within 100 ms | Flash p95 31 ms, worst 42 ms, 176 cues in 14 runs. Turbo p95 29 to 31 ms. With 40 ms of delay and 1% loss, p95 45 ms | p95 99 ms, worst 128 ms, 39 cues. 1 cue over 100 ms |
| A turn's first drawing (B2) | within 1 s of its first word | 403 ms and 33 ms on the scripted turns | Not measured apart |
| A stop freezes the board and silences the audio (V2, decision 3A) | p95 within 150 ms of the agent's decision | Frozen p95 4 ms. Audio after the gain 0 ms, on 20 stops | Frozen p95 195 ms. Audio after the gain 0 ms once frozen. **Misses 150 ms** |
| The same lesson replays from its log | exact | 0 of 11,774 samples differ, across 18 real runs | 0 of 1,322 samples differ, on the 2 runs that read the whole log |
| Interrupt at five points and resume | board correct after each | 15 stops on Flash and 5 on Turbo, with 0 cues fired and 0 frames handed over after a stop, and each board rebuilt the same from the log | 5 stops, same |

The worst link is 100 ms of delay, 70 ms of jitter, and 4% loss. V2 limits itself to a good connection, so the 195 ms is the known miss and not a new one. A stop message takes that long on that link, and only a faster channel would shorten it.

Two runs on the worst link show 185 differing replay samples. Those read the log before the agent's copy of the last event had landed, which was a bug in the proof run. The harness now waits for it, and the rerun gave 0 of 686.

## How drift is measured

A number that comes from the clock under test proves nothing, so each run compares three recordings. The agent saves the PCM it handed to LiveKit. The browser saves the PCM that reached the graph. `findWordPlaces` cross-correlates a window around each word in the sent audio against the received audio, and so finds where the word really landed. A test seeds a known lag and checks the tool recovers it to 1 ms.

The word's audio start is the first audible sound at or after that place, at the same level the probe uses. Drift is the time the cue fired against that start, plus the device's output latency, because that is when the student hears it. The screen adds one or two frames: from the cue to the next animation frame after the element mounted was p50 27 ms and p95 37 ms on the clean runs, which is an upper bound on the paint.

Cues fire about 28 ms ahead of the ear on this device. The gate opens on the graph, and the fake device adds 32 ms after it, so a cue that waited for sound leaves that much time for the screen. That puts the drawing about level with the sound the student hears, by these two figures.

## Results by run

Flash, unless it says otherwise. Drift is absolute, against the audible start, at the ear.

| Run | Runs, cues | Drift p50, p95, worst ms | Stops | Stop frozen p95 | Audio after gain, worst | Still arriving p95 |
| --- | --- | --- | --- | --- | --- | --- |
| Clean | 5, 69 | 26, 30, 42 | | | | |
| Clean, Turbo | 1, 14 | 29, 31, 31 | | | | |
| 40 ms delay, 30 ms jitter, 1% loss | 2, 26 | 29, 45, 50 | | | | |
| 100 ms delay, 70 ms jitter, 4% loss | 3, 39 | 29, 99, 128 | | | | |
| Phone width, CPU slowed 4 times | 2, 27 | 25, 35, 37 | | | | |
| Text written at model pace, flushed before each cue | 1, 14 | 28, 30, 30 | | | | |
| Word times held back 300 ms | 1, 9 | 25, 31, 31 | | | | |
| Stalls of 290 ms | 1, 13 | 28, 31, 31 | | | | |
| Stalls of 500 ms | 1, 13 | 26, 31, 31 | | | | |
| Five interruptions | 2, 21 | 25, 30, 31 | 10 | 4 ms | 0 ms | 89 ms |
| Five interruptions, Turbo | 1, 11 | 26, 29, 29 | 5 | 2 ms | 0 ms | 64 ms |
| Five interruptions, phone width, CPU slowed 4 times | 1, 10 | 22, 31, 31 | 5 | 4 ms | 0 ms | 77 ms |
| Five interruptions, worst link | 1, 10 | 27, 30, 30 | 5 | 195 ms | 0 ms | 195 ms |

Frame time stayed at 18 ms at p95 in every run, so one frame sets no limit on B1. The worst single frame was 179 ms, under load.

## What real ElevenLabs does

**Word times come with their audio, and that is not a problem once they are read ahead.** Flash delivers about a second of audio first and the rest within 2 s, for a 21 s turn. The agent reads the voice as fast as it comes and paces the audio behind that, so word times reach the browser ahead of the sound. The tightest word on the clean runs led its audio by 63 ms. Across all 22 real runs, 10 words of 1,662 arrived after their sound began, by up to 595 ms, and each cue on them fired when its word time landed. With word times held back 300 ms on purpose, every cue still fired, at a worst drift of 31 ms.

**The plugin moved every word early, and this PR patches it.** `@livekit/agents-plugin-elevenlabs` 1.9.5 removes leading silence by subtracting the first non-zero character time. The first character is at 0, so it subtracted the second character's start instead, 58 to 116 ms on real Casey. Mid-speech cues then fired up to 57 ms early. `patches/@livekit__agents-plugin-elevenlabs@1.9.5.patch` changes one line in `dist/tts.js`, and a test on a fake of the wire fails without it. The agent now subtracts the first audible sample itself, which was 0 to 98 ms on real speech, so word times and gaps both count from the sound. A plugin upgrade must recheck this.

**A word time often falls before its sound.** On words that follow a silence, the sound began a median of 31 ms after the vendor's word time, and 58 ms at p75. The gate that makes a cue wait for sound puts those cues on the sound, so the design's per-block gate matters more than it looked. The tails of this figure, p5 -212 ms and p95 211 ms, on 882 words, are likely the method matching a closure inside a word to the nearest word. That is my reading and not a validated one. The cue table is the real check, and it has no such tail.

**Numbers stay our words.** On Flash and Turbo, with original or normalized alignment, the voice named 30 of 30 words the same as `getSpokenWords` on lines with "9.8", "2.5", "3/4", "x^2", "100%", "ninety-nine", and "1,000". The 22 real runs recorded 0 mismatches. The adapter still asks for original alignment, and `createWordTimeline` keeps our text and notes any difference.

**Opening the socket first is worth it.** First audio from the text, through the plugin, on 34 characters:

| | Flash | Turbo |
| --- | --- | --- |
| New socket, p50 of 5 | 975 ms | 1040 ms |
| Warm socket, first request | 521 ms | 661 ms |
| Warm socket, later requests, p50 of 9 | 291 ms | 324 ms |

So `prewarm` saves about 380 to 450 ms on the first turn, and the first request on a warm socket still costs about 230 to 340 ms more. These include this network. Longer lesson turns came in slower, at 263 to 870 ms, and one at 1341 ms under load.

**`close_context` does not cancel, and nothing reaches the student.** After a stop just past the first audio, the vendor kept sending 14 s of audio in 3 messages, on both tries. The plugin dropped all of it but one frame already read, and `speakTurn` drops that. The next request's first audio took 253 to 259 ms, so the old context slows nothing. On the lesson's interruptions the vendor had usually finished already, because it generates far faster than real time.

**A real voice stalls, mostly early in a turn.** With no stall injected, 43 turns had 10 gaps, of 71 to 298 ms, and 7 of the 10 came in the first 800 ms of a turn. A student hears these. Most sit where the first message's audio runs out before the second arrives, on this network and under this load, so a server near the vendor may see fewer. The agent's report held the cues through them: drift stayed under 42 ms in those turns. Holding first sound back would close them, and that spends time on `first-sound-target`, so it is Abel's call and not built.

**`audioGap` reads true on injected stalls.** Stalls of 290 and 500 ms, less the 200 ms queue, read as 94, 109, 310, and 321 ms, against 100, 102, 308, and 312 ms in the received audio. Across all 14 reports, 9 agree within 30 ms. The other 5 differ by 31 to 115 ms, and no cue in those turns missed by more than 42 ms, so this looks like a limit of the check near pauses, unproven.

**Late turn messages and lost closes are handled.** The clock now takes the earliest sound since the last turn ended, not the latest, and a word whose time passed 1 s ago with no sound stops waiting, so `questionHeard` still goes out when a closing report is lost near the last word. Both have tests. Neither ran on a real lost packet.

**A voice stream that ends early now cuts the turn.** The player would otherwise wait for words that never come, with no report. The agent waits for the audio to play out and sends `stop`, so the log says what was heard. M3.6 chooses what the note then says.

## Flash or Turbo on Casey

Use Flash. It is what the adapter defaults to.

| | Flash | Turbo |
| --- | --- | --- |
| First audio, warm | 291 ms | 324 ms |
| Mid-sentence flushes stretched a line of about 4.5 s by, on one take each | 10% | 29% |
| Overlong on the worst line | 0 of 60 | 0 of 40 |
| Drift, clean | p95 31 ms | p95 29 to 31 ms |

The clips for Abel's ear are `casey-flash-whole`, `casey-flash-flushed`, `casey-turbo-whole`, and `casey-turbo-flushed` on the `evidence` branch under `m3-2/`. Abel heard Casey on Turbo, so what remains open is whether Flash sounds as good. The measured choice rests on speed and flushes, and on nothing about the sound.

## Overlong lines

Word times stretch with the sound, so nothing in the audio shows the fault. The text's own length does, and `createOverlongWatch` compares them.

| Voice, model | Requests on the worst line | Length range | Ran over twice the median | Watch caught | False alarms |
| --- | --- | --- | --- | --- | --- |
| Casey, Flash | 60 | 2303 to 2681 ms | 0 | | 0 |
| Casey, Turbo | 40 | 2406 to 2956 ms | 0 | | 0 |
| Eric, Turbo at default settings | 20 | 1891 to 11585 ms | 7 | 7 of 7 | 0 |

So a line running long can be detected on the real path, and early. The watch tripped at 355 to 483 ms from the text on a warm socket, within 1 ms of the first audio, because the vendor sends the whole stretched line in one burst. None of it has played by then, so a cut and a fresh request is possible. This PR does not act on it, because Casey did not run long and Eric is not the voice, so the watch stays in the proof folder. Casey's pace is 57 to 77 ms a character on these lines, against Eric's 42, so the watch takes the pace per voice. Casey's 0 of 112 across all checks, counting the earlier 12, still leaves about a 3% upper bound at 95% confidence, on this one line.

## Stock phrases

A stored phrase plays through the same path, and 6 cues landed at p95 40 ms. The same phrase asked for 5 times ran 1375 to 1513 ms, with word times up to 139 ms apart, so a stored phrase must keep the word times of the take it stored. Only M3.7 stores them for real.

## The browser's mute

Decision 3A rests on this. A stop sets the gain to 0 on the audio thread's next block, and the only route out is through that gain, because the attached element is muted.

| Browser | Stops | Frozen p95 | Audio after the gain, worst | Audio still arriving, p95 |
| --- | --- | --- | --- | --- |
| Chromium, real voice | 20 | 4 ms | 0 ms | 89 ms |
| Firefox, Playwright's build, tone | 5 | 2 ms | 5 ms | 97 ms |
| WebKit, Playwright's build, tone | 5 | 1 ms | 0 ms | 98 ms |

The last column is the control: without the mute, the student would hear that much more. The worklet clock also ran on those two builds, on stored real speech, at p95 30 ms on Firefox and 26 ms on WebKit, 6 cues each. Firefox's 5 ms looks like audio already past the gain, unconfirmed.

## The fallback

If audio is blocked, a timer started by the first word times drives the board. Forced to that path in a live room, 10 of 10 cues fired within 2 ms of their word times, and 3 of 3 beats reported. Chromium under Playwright never blocks audio even with its autoplay flag, so the run makes the context read as suspended. No browser really blocked here.

## Still unproven

- Real Safari, iOS, and Android. Playwright's WebKit build is not Safari, and no phone was used. Phone width here is a desktop browser with its CPU slowed.
- A real speaker and Bluetooth. `outputLatency` is 32 ms on the fake device here. The clock subtracts whatever the browser reports, and Firefox reported 23 ms and WebKit 16 ms.
- Drift on the worst link. Every cue over 40 ms there was early, and the ones that waited for a sound were not, so the count seems to run ahead of a growing jitter buffer until the next pause. That cause is my inference. Nothing here corrects it sooner.
- ElevenLabs' retention, and LiveKit Cloud. The agent's region will change F and may remove the early stalls.
- Stops measured on real speech were taken before the turn path moved into `first-sound.ts` and `frame-queue.ts`, with unit tests and a tone run since. A real run at the final head covered the lesson and not the stops, because a five-point run costs about 350 credits and the limit was 6,000.
- Whether a mid-sentence flush sounds natural, and whether Flash sounds as good as Turbo on Casey. Those need Abel's ear.

## Credits

The runs here spent about 5,660 credits of the 6,000 allowed, counted as 0.22 a character, on a Creator account that reports 84,481 of 121,010 used after most of them. The account's own count moved 2,233 across a stretch the ledger put at 2,313, so the ledger runs slightly high.

## Rerun it

`pnpm lab` starts a local server, the web app, and the tutor, and prints an address to open and listen. `pnpm lab --fake` uses a tone and spends nothing.

```sh
pnpm --filter @astra/agent proof --only clean,interrupt --out <folder>
pnpm --filter @astra/agent proof --only interrupt --fake --out <folder>
pnpm --filter @astra/agent voice-probe --job overlong --count 20 --out <folder>
node apps/agent/src/lab/proof/collect-results.ts <folder> <output.json>
```

The scenarios are in `run-proof.ts`, and the jobs are `overlong`, `first-audio`, `alignment`, `clips`, `stop-early`, and `stock-phrase` in `voice-probe.ts`. A real run costs about 100 credits and a five-point run about 350. Run one at a time, because the runs share ports and each changes the others' timing. Drift is meaningful only on speech, because a repeated tone matches itself at the wrong place. `--browser firefox` and `--browser webkit` need `pnpm exec playwright install firefox webkit --no-remove`.
