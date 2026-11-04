# Scene player: what the real voice measured

This is the record PRD test 1 asks for. It covers M3.2, the first run of the board clock on a real voice. `scene-player-results.json` holds the numbers behind every table, and `fixRound` in it holds the runs at 24 kHz.

Every figure was measured on 3 and 4 November 2026 on Abel's Mac under load from other agents, at a load average of 7 to 19. The voice is ElevenLabs Chris on Flash, which Abel chose by ear on 4 November in place of Casey, reached over a West African network to `europe-west4`. Most of this record ran earlier, on Casey at 22.05 kHz, and each table says whose it is. "Drift on any word", "A new turn right after the last", and the rows that name Chris ran at 24 kHz after the fixes they describe. The room is a local LiveKit server. The audio device is Chromium's fake device, which reports 32 ms of output latency. All text is test text, with no student data. No figure here comes from the agent's region, LiveKit Cloud, or a real speaker.

## The result

The bet holds on a real voice. Every target in M3.2 passes on a good connection, on Chris at 24 kHz, for the script's own cues and for cues on every third word. On the worst link, drift is not a clean pass: on Chris, cues on every third word ran p95 71 ms and worst 87 ms, with 0 of 159 over 100 ms, in 6 runs of a stored real take. Casey's take ran p95 118 ms and worst 177 ms, with 13 of 119 over 100 ms, and one of her 6 runs alone had a p95 of 129 ms. A run's p95 on that link ranged from 28 to 129 ms, so the worst link sits near the limit, and passing it says little about margin. One stop rule also misses there, which decision 3A expected.

| Target | Rule | Good connection | Worst link |
| --- | --- | --- | --- |
| A drawing starts on its word (B1), Chris at 24 kHz | p95 within 100 ms | The script's cues p95 29 ms, worst 30 ms. Every third word p95 27 ms, worst 30 ms. With 40 ms of delay, 30 ms of jitter, and 1% loss, every third word p95 59 ms, worst 61 ms | The script's cues p95 51 ms, worst 71 ms. Every third word p95 71 ms, worst 87 ms, 0 of 159 over 100 ms |
| The same, Casey at 22.05 kHz, the script's cues only | p95 within 100 ms | Flash p95 31 ms, worst 42 ms, 176 cues in 14 runs. Turbo p95 29 to 31 ms. With 40 ms of delay, 30 ms of jitter, and 1% loss, Flash p95 45 ms and Turbo p95 50 ms | p95 99 ms, worst 128 ms, 39 cues. 1 cue over 100 ms |
| A new turn right after the last | the clock holds | Chris, next turn on `finished` and after a stop: every cue on its own word, replay exact | The same on a tone on the worst link |
| A turn's first drawing (B2) | within 1 s of its first word | Casey: 395 to 417 ms on the lesson's first turn, 33 to 36 ms on its second. Chris, with a cue on the first word: 33 to 36 ms | Not measured apart |
| A stop freezes the board and silences the audio (V2, decision 3A) | p95 within 150 ms of the agent's decision | Chris: frozen p95 1 ms, audio after the gain 0 ms, on 5 stops. Casey: frozen p95 4 ms, audio after the gain 0 ms, on 20 stops | Frozen p95 195 ms. Audio after the gain 0 ms once frozen. **Misses 150 ms** |
| The same lesson replays from its log | exact | Casey: 0 of 13,167 samples differ, across 20 real runs. Chris: 0 of 1,963 samples, across 5 real runs | 0 of 1,995 samples differ, on the 3 runs that read the whole log |
| Interrupt at five points and resume | board correct after each | Chris: 5 stops on Flash. Casey: 15 on Flash and 5 on Turbo. All with 0 cues fired and 0 frames handed over after a stop, and each board rebuilt the same from the log | Casey: 5 stops, same |

The worst link is 100 ms of delay, 70 ms of jitter, and 4% loss. V2 limits itself to a good connection, so the 195 ms is the known miss and not a new one. A stop message takes that long on that link, and only a faster channel would shorten it.

One run on the worst link, `poor-flash-1793748128384`, shows 185 differing replay samples of 698. It read the log before the agent's copy of the last event had landed, which was a bug in the proof run. The harness now waits for it, and the rerun gave 0 of 686.

## How drift is measured

A number that comes from the clock under test proves nothing, so each run compares three recordings. The agent saves the PCM it handed to LiveKit. The browser saves the PCM that reached the graph. `findWordPlaces` cross-correlates a window around each word in the sent audio against the received audio, and so finds where the word really landed. A test seeds a known lag and checks the tool recovers it to 1 ms.

The word's audio start is the first audible sound at or after that place, at the same level the probe uses. Drift is the time the cue fired against that start, plus the device's output latency, because that is when the student hears it. The screen adds one or two frames: from the cue to the next animation frame after the element mounted was p50 27 ms and p95 37 ms on the clean runs, which is an upper bound on the paint.

**The gate decided most of the script's cues.** A script tends to put a drawing on the word after a pause. In the Casey runs, 149 of 201 good-link cues had a word time inside a silence by 5 ms or more, so the rule "a cue waits for sound" fired them and the count did not. Their p95 of 31 ms says the gate lands a cue on a sound. It says much less about the count, so a report on those cues alone overstates the clock. "Drift on any word" below reports cues on every third word as their own rows, where the gate decides far fewer, and a claim about drift here must hold for those.

Cues fire about 28 ms ahead of the ear on this device. The gate opens on the graph, and the fake device adds 32 ms after it, so a cue that waited for sound leaves that much time for the screen. That puts the drawing about level with the sound the student hears, by these two figures.

## Drift on any word

The design owed an answer to "drift with no stall", where word lag grew with no report. This is the answer, and it is a fault in the rate and not in the clock.

A reviewer measured word lag rising about 2 ms a second with no report, to p95 76 and 103 ms on a clean 62 s turn. The plugin defaults to `pcm_22050`. LiveKit's native source sends `sample_rate / 100 * num_channels` samples on a 10 ms timer, in integer math (`webrtc-sys/src/audio_track.cpp`, read at its source). At 22050 Hz that is 220 samples of a true 220.5, so 22 kHz of samples play out where 22.05 kHz were meant, slow by 2.27 ms a second. The adapter now asks for `pcm_24000`, which frames in whole samples, and `createVoiceLine` refuses any rate that does not, so a stored phrase at the old rate fails loudly and does not drift quietly.

The slope below is word lag fitted against time in a turn, on cues the gate did not decide. It measured 1.3 to 2.2 ms a second at 22.05 kHz, against a predicted 2.27, and 0.06 ms a second or less on a clean link at 24 kHz, so the framing was the cause. On a lossy link the slope also holds the jitter buffer growing, so it means less there.

Drift is absolute, against the audible start, at the ear, in ms. Chris's rows at 24 kHz are the record for the voice Abel chose. The clean rows are real speech. The others play one of those real takes through the same path, with `--stored`, which spends nothing and leaves out the vendor's own timing.

| Run | Runs | The script's cues: count, p95, worst | Every third word: count, p95, worst | Every third word over 100 ms | Lag slope, ms a second |
| --- | --- | --- | --- | --- | --- |
| Chris, clean, real speech | 2 | 28, 29, 30 | 54, 27, 30 | 0 | -0.03, 0.01 |
| Chris, one 64 s turn, stored take | 2 | 78, 31, 31 | 160, 29, 31 | 0 | -0.03, 0.06 |
| Chris, 40 ms delay, 30 ms jitter, 1% loss, stored take | 3 | 45, 47, 53 | 80, 59, 61 | 0 | -2.48 to -1.27 |
| Chris, 100 ms delay, 70 ms jitter, 4% loss, stored take | 6 | 89, 51, 71 | 159, 71, 87 | 0 | -5.3 to 0.26 |
| Casey, clean, first turn, 1 real run and 2 stored | 3 | 29, 31, 31 | 60, 30, 31 | 0 | -0.27 to 0.04 |
| Casey, one 62 s turn, stored take | 2 | 59, 30, 31 | 120, 29, 31 | 0 | -0.19, 0.03 |
| Casey, 40 ms delay, 30 ms jitter, 1% loss, stored take, first turn | 6 | 58, 34, 60 | 120, 58, 60 | 0 | -2.4 to 0.5 |
| Casey, 100 ms delay, 70 ms jitter, 4% loss, stored take, first turn | 6 | 59, 108, 122 | 119, 118, 177 | 13 | -2.42 to 0.96 |
| Casey at 22.05 kHz, before this fix, one 62 s turn, stored take, a reviewer's run, cues on about every third word | 2 | | 189, 97, 109 | 6 | -1.64, -1.31 |

The second turn's beat `sideways` has 5 commands and 25 words, so the limit of 12 commands spaces its added cues every fourth word.

**What the worst link does.** Every cue over 100 ms in these runs was Casey's. 14 of her 16 came from one run, all early, by up to 133 ms, on words the gate did not hold. The other 2 were a turn's first word, late by 173 and 177 ms, because that word's time reached the browser after its sound. The script's cues read lower than every third word in each lossy row, at p95 51 against 71 on Chris and 108 against 118 on Casey, because the gate decides more of them: 54 of 89 against 18 of 159 on Chris. Six runs each is too few to call the two voices different, because a run's p95 spread from 28 to 129 ms. So read the worst link as near the limit, on any word, and not as a clear pass. V2 limits itself to a good connection, and B1 names no link.

**One lag step, once.** A reviewer's run on Casey at 24 kHz, on 40 ms of delay, 30 ms of jitter, and 1% loss, took one step of about 320 ms in word lag with no report, which put 15 of 33 cues over 100 ms, at p95 352 ms and worst 373 ms. None of the 9 runs here on that link did, so that is 1 of 11. The agent's queue never ran dry, so it had nothing to report. `docs/architecture/live-session.md` holds it for M3.6 and M3.7.

## A new turn right after the last

The clock used to find a turn's start from 107 ms of silence, and nothing guaranteed that silence. `speakTurn`'s `finished` resolved about 200 ms before playout ended, so a turn started on it took the last turn's first sound. New audio right after a stop gave no silence at all, so the turn never started. M3.6 does both on purpose, as a reaction followed by a reply and as a stored reaction right after a stop.

The rule now, in `docs/architecture/live-session.md` under "Where a turn starts": a turn's first sound follows the last turn's audio by at least 150 ms of silence, and the agent guarantees it. Each row is a real room over real WebRTC. The two scenarios are `next-on-finished` and `after-stop`, the second cutting lesson turn 0 at 1500 ms and resuming 30 ms later.

| Scenario | Before, on a tone | After, on a tone | After, on Chris |
| --- | --- | --- | --- |
| Next turn on `finished`, clean | Turn 2 took turn 1's onset. Both its cues fired together at `turnStarted`, at position 1155, and one had a word time of 0. Tool drift 579 ms. Turn 1's open beat was never reported. Replay differed on 23 of 64 samples | Turn 2's cues at positions 1 to 5 and 561 to 565, on word times 0 and 560, on 3 runs. Both turns' beats reported. Replay differs on 0 of 250. 147 to 148 ms of silence received | Turn 2's cues at positions 3 and 211, on word times 0 and 208. Measured on the audio, worst 16 ms. Replay differs on 0 of 73 |
| Next turn on `finished`, worst link | Not run | The same, at positions 2 to 5 and 562 to 565, on 3 runs. Replay differs on 0 of 259. 171 to 318 ms of silence received | Not run |
| New audio right after a stop, clean | One onset in the whole run. `read()` stayed null. Turn 2 fired 0 cues and heard 0 words, with an empty caption | 2 onsets. Turn 2 fired 8 cues, each within 5 ms of its word time on the clock, and heard its words. Replay differs on 0 of 644, on 2 runs. 149 ms of silence received | Measured on the audio, 10 cues across both turns at p95 28 ms and worst 28 ms. Replay differs on 0 of 317 |
| New audio right after a stop, worst link | Not run | The same, 10 cues within 5 ms. Replay differs on 0 of 710, on 2 runs. 149 and 195 ms of silence received | Not run |

The silence the browser really received never fell below 136 ms, on the audio thread's own count, against the probe's need of 107 ms. The lab's resume sends the whole cut beat when the report has not reached it in 30 ms, so a cue can fire twice across a tight resume. That belongs to the lab, and M3.6 owns it. Stopping five times at the lesson's five points and resuming 30 ms later, on a stored real take, kept received silences at 136 to 463 ms and 0 of 396 replay samples differing. Its drift is not reported, because the stored take's words no longer match a resume's words.

A test fails without each part: `finished` waiting, the silence, the held messages, a second turn waiting for the first, closing an open turn, closing in audio order, ignoring old audio after a stop, and the bound. A reviewer's 15 attack tests pass at this head, where the rewind failed before.

## Results by run

All of this table is Casey at 22.05 kHz, before the fixes above, on the script's own cues. Flash, unless it says otherwise. Drift is absolute, against the audible start, at the ear.

| Run | Runs, cues | Drift p50, p95, worst ms | Stops | Stop frozen p95 | Audio after gain, worst | Still arriving p95 |
| --- | --- | --- | --- | --- | --- | --- |
| Clean | 5, 69 | 26, 30, 42 | | | | |
| Clean, Turbo | 1, 14 | 29, 31, 31 | | | | |
| 40 ms delay, 30 ms jitter, 1% loss | 3, 40 | 28, 45, 50 | | | | |
| 40 ms delay, 30 ms jitter, 1% loss, Turbo | 1, 15 | 28, 50, 50 | | | | |
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

**Word times come with their audio, and that is not a problem once they are read ahead.** Flash delivers about a second of audio first and the rest within 2 s, for a 21 s turn. The agent reads the voice as fast as it comes and paces the audio behind that, so word times reach the browser ahead of the sound. The tightest word on the clean runs led its audio by 63 ms. Across all 24 real runs, 11 words of 1,823 arrived after their sound began, by up to 595 ms, and each cue on them fired when its word time landed. One of the 11 is in the run that holds word times back on purpose, where every cue still fired, at a worst drift of 31 ms.

**The plugin moved every word early, and this PR patches it.** `@livekit/agents-plugin-elevenlabs` 1.9.5 removes leading silence by subtracting the first non-zero character time. The first character is at 0, so it subtracted the second character's start instead, 58 to 116 ms on real Casey. Mid-speech cues then fired up to 57 ms early. `patches/@livekit__agents-plugin-elevenlabs@1.9.5.patch` changes one line in `dist/tts.js`, and a test on a fake of the wire fails without it. The agent now subtracts the first audible sample itself, which was 0 to 98 ms on real speech, so word times and gaps both count from the sound. A plugin upgrade must recheck this.

**A word time often falls before its sound.** On words that follow a silence, the sound began a median of 31 ms after the vendor's word time, and 58 ms at p75. The gate that makes a cue wait for sound puts those cues on the sound, so the design's per-block gate matters more than it looked. The tails of this figure, p5 -212 ms and p95 211 ms, on 882 words, are likely the method matching a closure inside a word to the nearest word. That is my reading and not a validated one. The cue table is the real check, and it has no such tail.

**Numbers stay our words.** On Flash and Turbo, with original or normalized alignment, the voice named 30 of 30 words the same as `getSpokenWords` on lines with "9.8", "2.5", "3/4", "x^2", "100%", "ninety-nine", and "1,000". The 24 real runs recorded 0 mismatches. The adapter still asks for original alignment, and `createWordTimeline` keeps our text and notes any difference.

**Opening the socket first is worth it.** First audio from the text, through the plugin, on 34 characters:

| | Chris, Flash | Casey, Flash | Casey, Turbo |
| --- | --- | --- | --- |
| New socket, p50 of 5 | 860 ms | 975 ms | 1040 ms |
| Warm socket, first request | 455 ms | 521 ms | 661 ms |
| Warm socket, later requests, p50 of 9 | 270 ms | 291 ms | 324 ms |

So `prewarm` saves about 380 to 450 ms on the first turn, and the first request on a warm socket still costs about 185 to 340 ms more. On Chris the later requests ran p95 292 ms, and 39 warm requests on the worst line ran p50 274 ms and p95 285 ms. These include this network. Longer lesson turns came in slower, at 263 to 870 ms, and one at 1341 ms under load.

**`close_context` does not cancel, and nothing reaches the student.** After a stop just past the first audio, the vendor kept sending 14 s of audio in 3 messages, on both tries. The plugin dropped all of it but one frame already read, and `speakTurn` drops that. The next request's first audio took 253 to 259 ms, so the old context slows nothing. On the lesson's interruptions the vendor had usually finished already, because it generates far faster than real time.

**A real voice stalls, mostly early in a turn.** With no stall injected, 43 turns had 10 gaps, of 71 to 298 ms, and 7 of the 10 came in the first 800 ms of a turn. A student hears these. Most sit where the first message's audio runs out before the second arrives, on this network and under this load, so a server near the vendor may see fewer. The agent's report held the cues through them: drift stayed under 42 ms in those turns. Holding first sound back would close them, and that spends time on `first-sound-target`, so it is Abel's call and not built.

**`audioGap` reads true on injected stalls.** Stalls of 290 and 500 ms, less the 200 ms queue, read as 94, 109, 310, and 321 ms, against 100, 102, 308, and 312 ms in the received audio. Across all 14 reports, 9 agree within 30 ms. The other 5 differ by 31 to 115 ms, and no cue in those turns missed by more than 42 ms, so this looks like a limit of the check near pauses, unproven.

**Late turn messages and lost closes are handled.** The clock takes the earliest sound since the last turn ended, not the latest, and a word whose time passed 1 s ago with no sound stops waiting, so `questionHeard` still goes out when a closing report is lost near the last word. Both have tests. Neither ran on a real lost packet.

**A voice stream that ends early now cuts the turn.** The player would otherwise wait for words that never come, with no report. The agent waits for the audio to play out and sends `stop`, so the log says what was heard. M3.6 chooses what the note then says.

## Flash or Turbo on Casey

These figures are Casey's, from before Abel chose Chris. Chris stays on Flash unless Abel says otherwise, and no Turbo run measured him here beyond the clips in `m3-2-listen/compare`. My recommendation was Flash, which is what the adapter defaults to. For the flush rule, I recommend flushing at commas and sentence ends only, the design's fallback, because each flush before a command stretched the line on both models.

| | Flash | Turbo |
| --- | --- | --- |
| First audio, warm | 291 ms | 324 ms |
| Mid-sentence flushes stretched a line of about 4.5 s by, on one take each | 10% | 29% |
| Overlong on the worst line | 0 of 60 | 0 of 40 |
| Drift, clean | p95 31 ms | p95 29 to 31 ms |
| Drift, 40 ms delay, 30 ms jitter, 1% loss | p95 45 ms | p95 50 ms |
| Mean level of a whole line, one take each | -19.8 dB | -19.5 dB |
| Length of a 15-word line, one take each | 4606 ms | 4297 ms |
| Length of the worst line, median | 2475 ms | 2578 ms |

Casey measures about the same on both when the line goes whole, in level and in pace. They part on flushes: by the end of the flushed line Turbo's words ran 1196 ms behind its whole take, against 430 ms on Flash, on one take each. The clips for Abel's ear are `casey-flash-whole`, `casey-flash-flushed`, `casey-turbo-whole`, and `casey-turbo-flushed` on the `evidence` branch under `m3-2/`. Abel heard Casey on Turbo, so what remains open is whether Flash sounds as good. The measured choice rests on speed and flushes, and on nothing about the sound.

## Overlong lines

Word times stretch with the sound, so nothing in the audio shows the fault. The text's own length does, and `createOverlongWatch` compares them.

| Voice, model | Requests on the worst line | Length range | Ran over twice the median | Watch caught | False alarms |
| --- | --- | --- | --- | --- | --- |
| Chris, Flash | 40 | 1745 to 1964 ms | 0 | | 0 |
| Casey, Flash | 60 | 2303 to 2681 ms | 0 | | 0 |
| Casey, Turbo | 40 | 2406 to 2956 ms | 0 | | 0 |
| Eric, Turbo at default settings | 20 | 1891 to 11585 ms | 7 | 7 of 7 | 0 |

So a line running long can be detected on the real path, and early. The watch tripped at 355 to 483 ms from the text on a warm socket, within 1 ms of the first audio, because the vendor sends the whole stretched line in one burst. None of it has played by then, so a cut and a fresh request is possible. This PR does not act on it, because Casey did not run long and Eric is not the voice, so the watch stays in the proof folder. Casey's pace is 57 to 77 ms a character on these lines, against Eric's 42, so the watch takes the pace per voice. Casey's 0 of 112 across all checks, counting the earlier 12, still leaves about a 3% upper bound at 95% confidence, on this one line.

**Chris did not run long.** He ran 0 of 40 overlong on the worst line on Flash, at the 51 ms a character his lesson takes measured, with no false alarm. His lengths stayed within 13% of each other. That leaves about a 7% upper bound at 95% confidence, on this one line, on Flash, so a larger sample would narrow it. Turbo was not tested on him, and Eric's fault appeared on Turbo.

## Stock phrases

A stored phrase plays through the same path, and on Casey 12 cues landed at p95 40 ms. The same phrase asked for 5 times ran 1375 to 1513 ms, with word times up to 139 ms apart, so a stored phrase must keep the word times of the take it stored, and must be at 24 kHz, or `createVoiceLine` refuses it. Only M3.7 stores them for real.

## A rewind, and a clock jump

A rewind now lands on its beat. A scene that played from 0, with a beat at 1000 ms and a rewind to that beat pressed at 6000 ms, showed 6 s, because the board held its motions at the press. It now shows 1 s and stays there, and a drawing caught mid-entrance finishes when the next beat plays.

`speakTurn` now counts on a monotonic clock. A one hour jump of the device clock used to read as an `audioGap` of 3,599,900 ms, and held cues for the rest of the turn.

## The browser's mute

Decision 3A rests on this. A stop sets the gain to 0 on the audio thread's next block, and the only route out is through that gain, because the attached element is muted.

| Browser | Stops | Frozen p95 | Audio after the gain, worst | Audio still arriving, p95 |
| --- | --- | --- | --- | --- |
| Chromium, Chris | 5 | 1 ms | 0 ms | 70 ms |
| Chromium, Casey | 20 | 4 ms | 0 ms | 89 ms |
| Firefox, Playwright's build, tone | 5 | 2 ms | 5 ms | 97 ms |
| WebKit, Playwright's build, tone | 5 | 1 ms | 0 ms | 98 ms |

The last column is the control: without the mute, the student would hear that much more. The worklet clock also ran on those two builds, on stored real speech, at p95 30 ms on Firefox and 26 ms on WebKit, 6 cues each. Firefox's 5 ms looks like audio already past the gain, unconfirmed.

## The fallback

If audio is blocked, a timer started by the first word times drives the board. Forced to that path in a live room, 10 of 10 cues fired within 2 ms of their word times, and 3 of 3 beats reported. Chromium under Playwright never blocks audio even with its autoplay flag, so the run makes the context read as suspended. No browser really blocked here.

## Still unproven

- Real Safari, iOS, and Android. Playwright's WebKit build is not Safari, and no phone was used. Phone width here is a desktop browser with its CPU slowed.
- A real speaker and Bluetooth. `outputLatency` is 32 ms on the fake device here. The clock subtracts whatever the browser reports, and Firefox reported 23 ms and WebKit 16 ms.
- Drift on the worst link. Cues over 40 ms early there fell on words the gate did not hold, and the ones that waited for a sound were not early, so the count seems to run ahead of a growing jitter buffer until the next pause. That cause is my inference. Nothing here corrects it sooner.
- ElevenLabs' retention, and LiveKit Cloud. The agent's region will change F and may remove the early stalls.
- Stops on Turbo and on a slow phone since the turn path moved into `first-sound.ts` and `frame-queue.ts`. The five-point run reran on Chris on Flash at this head, and on Casey only as 2 stops on the stock phrase. Stops on the worst link rest on Casey's one run.
- Whether a mid-sentence flush sounds natural on Chris. That needs Abel's ear.
- The first audio step from the agent's region, because there is no agent region yet. M3.6 owns it.
- ElevenLabs' training opt-out, which is an account setting this key cannot read. Abel confirms it on `elevenlabs-balance`.

## Credits

The first round's runs spent about 5,860 credits of the 6,000 allowed, counted as 0.22 a character, on a Creator account that reports 84,873 of 121,010 used after them. The account's own count moved 2,233 across a stretch the ledger put at 2,313, so the ledger runs slightly high.

The fix round spent 1,251 credits of the 1,500 allowed, by the account's own count, with another lane's 204 taken out. 68 of those went on a run that crashed on a proof-only beat over the 12 command limit, after its first turn had spoken. That is why a new scenario gets a dry run on `--fake` first.

## What this PR leaves alone

The privacy page's lists of what moves today do not change, because the lab sends only test text, from a development page, and no student data reaches ElevenLabs or LiveKit. The planned line for ElevenLabs now says the tutor's words can include a student's name, as "What leaves our servers" in `docs/architecture/live-session.md` found.

## Rerun it

`pnpm lab` starts a local server, the web app, and the tutor, and prints an address to open and listen. `pnpm lab --fake` uses a tone and spends nothing.

```sh
pnpm --filter @astra/agent proof --only clean,interrupt --out <folder>
pnpm --filter @astra/agent proof --only interrupt --fake --out <folder>
pnpm --filter @astra/agent proof --fake --only next-on-finished,next-on-finished-poor,after-stop,after-stop-poor --out <folder>
pnpm --filter @astra/agent proof --only clean-every-third --out <folder>
node apps/agent/src/lab/proof/store-run.ts <run> <take.json>
node apps/agent/src/lab/proof/store-run.ts <run> <long-take.json> 4 turn-1
pnpm --filter @astra/agent proof --stored <take.json> --only uneven-every-third,poor-every-third --out <folder>
pnpm --filter @astra/agent proof --stored <long-take.json> --only long-every-third --out <folder>
pnpm --filter @astra/agent voice-probe --job overlong --count 20 --out <folder>
node apps/agent/src/lab/proof/collect-results.ts <folder> <output.json>
```

The scenarios are in `run-proof.ts`, and the jobs are `overlong`, `first-audio`, `alignment`, `clips`, `stop-early`, and `stock-phrase` in `voice-probe.ts`. A real run costs about 100 credits, a five-point run about 350, and 40 requests on the worst line about 380. Run one at a time, because the runs share ports and each changes the others' timing. Drift is meaningful only on speech, because a repeated tone matches itself at the wrong place. `--browser firefox` and `--browser webkit` need `pnpm exec playwright install firefox webkit --no-remove`.
