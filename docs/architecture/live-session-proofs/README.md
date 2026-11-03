# Proofs behind the live session design

These scripts back the numbers in `docs/architecture/live-session.md`. They are throwaway, outside the pnpm workspace, and CI does not run them. M3.2 moved the clock and `createPlayoutTracker` to `packages/board/src/player/`, and `clock-rule.mjs` now only points there, so these proofs run against the product's code. M3.6 moves `turn-rule.mjs`, `turn-wiring.mjs`, `providers/`, and `provider-suite.ts` to `apps/agent/`, and sends the tracker's report from the real `ttsNode`. M3.7 moves `beat-text-reader.mjs` to `apps/agent/src/tutor/`. Do not copy `replay-check.ts`, `stop-page.js`, or the resume in `agent-node.mjs` as code: the first models a board, the second has no drawing, and the third uses a constant reply and a cumulative count. The proofs' data messages are simpler than `live-message.ts`, which is the real shape, and the real parsers refuse 7 of 9 of the proofs' message shapes, so no proof exercises those parsers. `results/README.md` holds the tables that came out of the design, and the vendor pages read on 3 November 2026.

They use no account and no paid service. The real LiveKit SDKs and the real Deepgram and Cartesia plugins run against `fake-providers.mjs`, a local server built from the plugins' wire formats, so the results say nothing about either vendor's speed. The model is a fake too.

## Run them

You need macOS for `say`, a local LiveKit server, and Node 22.18 or newer, which strips TypeScript with no loader. Node 22.17 fails.

```sh
brew install livekit
livekit-server --dev --bind 127.0.0.1
```

In a second terminal, from this folder:

```sh
npm install
npx playwright-core install chromium
./make-speech.sh
```

Each `run.mjs` command writes one folder in `runs/`, and `node summarize.mjs` turns that folder into the file of the same name in `results/`. It rebuilds a file only from what is in `runs/`, so a partial rerun drops scenarios. Name the folders you mean, as in `node summarize.mjs node-numbers`, and move earlier runs aside first. Ports come from `LIVEKIT_URL`, `FAKE_STT_PORT`, `FAKE_TTS_PORT`, `AGENT_WORKER_PORT`, `CLOCK_LIVEKIT_URL`, `CLOCK_SERVER_UDP_PORT`, `CLOCK_PAGE_PORT`, `CLOCK_RELAY_PORT`, and `STOP_PAGE_PORT`.

| Result | Command |
| --- | --- |
| `node-turns.json` | `node run.mjs --sdk node --label turns --only question_uhhuh,question_hmm,question_answer_over_last_word,gap_talkover,gap_talkover_late_final,words_never_final,tiered_interrupt,tiered_backchannel,one_word_transcript_0,one_word_transcript_300,one_word_transcript_600,one_word_transcript_900,noise_resume,held_reaction_uncleared,held_reaction_cleared,warmup_first_speech_sdk_default,warmup_first_speech_off,warmup_rejoin_sdk_default,warmup_rejoin_off,patience_filler_3s,patience_filler_8s,patience_filler_then_answer,patience_words_silence_1s,patience_words_silence_2s,patience_words_pause_1s,patience_words_pause_2s,budget_voice_0,budget_voice_200,budget_voice_200_preemptive_tts,vendor_settings` |
| `node-phrases.json` | `node run.mjs --sdk node --label phrases --repeat 20 --only turn_phrases,patience_phrases_2s` |
| `beats-round2.json` | `node run.mjs --sdk beats --label round2 --repeat 15 --only beats_flush_chosen,beats_speculative,beats_speculative_late_final,beats_budget_voice_0,beats_budget_voice_200,beats_command_bytes_sdk_default,beats_command_bytes_off` |
| `clock.json` | `node clock-run.mjs`, then `node clock-run.mjs --only pauses-lost --repeat 3` if you want the repeats in `results/README.md`. Every number in it fired live in the browser. |
| `clock-fixed.json` | With `runs/clock` moved aside, `node clock-run.mjs --only clean,stall-200,stall-500`, then `node clock-run.mjs --only pauses-lost --repeat 3`. Rename the new folder `runs/clock-fixed`, and run `node summarize.mjs clock-fixed` |
| `clock-attack.json` | `python3 clock-attack/make-attack.py`. From `runs/attack`, `ATTACK_OUT=<folder> node clock-run.mjs --only a-slow-voice-90,a-slow-voice-97,a-many-tiny,a-stall-500,a-stall-1500,a-stall-3500,a-stall-500-poor,a-many-small`. Then `node clock-attack/show-attack.mjs <folder> results/clock-attack.json` |
| `clock-rule.json` | `node clock-rule-check.mjs` |
| `clock-speech.json` | `node clock-speech.mjs` |
| `stop.json` | `node stop-run.mjs` |
| `stop-fixed.json` | `node stop-run.mjs` with `runs/stop` moved aside. Rename the new folder `runs/stop-fixed`, and run `node summarize.mjs stop-fixed` |
| `node-numbers.json` | `node run.mjs --sdk node --label numbers --repeat 3 --only number_over_reply,number_words_over_reply,number_while_thinking,question_uhhuh,question_hmm,tiered_backchannel,gap_talkover`, then `node summarize.mjs node-numbers` |
| `provider-suite.json` | With `node fake-providers.mjs` running, `node provider-suite.ts`. To swap a voice, change `ACTIVE` in `providers/choose.ts`, or set `ACTIVE_VOICE=inProcess` for one run |
| `reader.json` | `node reader-check.mjs` |
| `turn-rule.json` | `node turn-rule-check.mjs` |
| `replay.json` | `node replay-check.ts` |
| `data-limit.json` | `node data-limit-check.mjs` |
| `cost.json` | `node cost.mjs` |

`node.json`, `python.json`, `beats.json`, and their `-fast-stt` files come from the first design round, at `741a1c9`, with `node run.mjs --sdk node` and the Python commands below. They ran the turn rule before this round's fixes. `verifier-*.json` are from an independent rerun at that head.

For Python:

```sh
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python agent_python.py download-files
PYTHON_BIN=.venv/bin/python node run.mjs --sdk python
```

A verifier's first run on a fresh environment exited on its first scenario, with the session not started in time. `run.mjs` now waits up to 90 s for Python, and that wait and `download-files` have not been rerun on a fresh environment. Node has a cold start too: a reviewer's first Node run on a fresh worktree lost its first scenario, and the rerun passed.

Run one thing at a time, because an agent worker takes every new room on that server, including a clock run's. The Python worker refuses a job above 70% CPU, so if a scenario fails that way on a busy machine, run it again. Timing spreads widen under load, so each `run.mjs` result records `machineLoadAtEnd`.

## What each file does

| File | Does |
| --- | --- |
| `agent-node.mjs`, `agent_python.py` | The same agent on each SDK: real `AgentSession`, fake model |
| `agent-node-beats.mjs` | A fake model streaming a script at about 100 tokens a second, with words to the voice, cues to the room, and word times ahead of the audio |
| `fake-providers.mjs` | The fake Deepgram and Cartesia. Each word is a loud burst then a quiet hum, so a listener can find every word and the exact moment the audio stops |
| `student.mjs` | A scripted student who publishes real speech, times the audio coming back, and answers a stop with what played |
| `run.mjs` | The scenarios and their measurements |
| `turn-rule.mjs`, `turn-rule-check.mjs` | The yield, stop, and resume rule as a pure function, its stories, and a search of every state it can reach |
| `turn-wiring.mjs` | Connects that rule to a session, with the SDK settings M3.6 ships. All three Node agents use it |
| `clock-run.mjs`, `clock-publisher.mjs`, `clock-page.js`, `clock-worklet.js` | The browser clock proof: real Chromium, real WebRTC, a UDP relay that adds delay, jitter, and loss, and each method firing one cue per word in the page |
| `clock-rule.mjs`, `clock-rule-check.mjs` | The clock the design chose, the agent's tracker that reports when audio runs dry, and checks that fail without each of the tracker's and the hold's rules |
| `clock-attack/` | A reviewer's scripts. They copy the clock proof into `runs/attack`, add a slow voice, many small stalls, and clocks fed late, lost, or repeated reports, and summarize each run |
| `clock-rejected.mjs` | The rule the first rounds used, kept so its rows can be run again |
| `clock-speech.mjs` | The same clock offline on real speech with known word positions, natural pauses, stalls, and lost audio. The stalls are the script's own, so the gap list stands in for the agent's report |
| `stop-run.mjs`, `stop-agent.mjs`, `stop-page.js` | The rule, reader, clock, and browser together in real Chromium: stop, mute, freeze, report, rebuild, a voice that stalls, reactions over a question, and a resume with a ball in the air. Its rebuild compares which drawings fired, not their motion |
| `providers/`, `provider-suite.ts` | The provider boundary, its fakes, and the suite every adapter must pass |
| `beat-text-reader.mjs`, `reader-check.mjs` | Reads the model's text as it streams, and tricky cases against `packages/contracts` |
| `replay-check.ts` | A true player against `rebuildBoard` built only from parsed log events. A verifier wrote the first version |
| `data-limit-check.mjs` | Sizes of reliable data messages between two real participants |
| `cost.mjs` | Every dollar figure in the design, with its arithmetic |
