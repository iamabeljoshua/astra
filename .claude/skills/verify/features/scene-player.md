# Scene player lab

The lab is a development page that plays a scripted lesson in a real voice through the real board player. It exists only in development, and a production build does not contain it.

## Sub-features

- `lab-page` opens at `/lab/scene-player` with no sign-in, and says how to start a room if the address holds none.
- `lab-lesson` plays the lesson on `Play the lesson`, and each drawing lands on its word.
- `lab-interrupt` stops audio and board together on `Interrupt`, and `Resume` carries on from the cut word.
- `lab-replay` rebuilds the board from the saved log on `Replay from the log`, with no audio and no video.

## How to get to it (user POV)

- Run `pnpm lab` from the repo root, then open the address it prints. `pnpm lab --fake` uses a tone in place of the voice, which costs nothing.
- `pnpm lab` needs `livekit-server` on the path, `pnpm db:up` run once in this checkout, because the web app reads its Auth settings at start, and `ELEVENLABS_API_KEY` in `~/.config/astra/keys.env` unless you pass `--fake`. It uses port 6130 for the web app unless `WEB_PORT` says otherwise, and 7930 to 7933 for LiveKit.

## Driving it with pnpm verify

- **Open the page.** Run `pnpm verify drive --journey scene-player`. It needs no database row, and it does not start a room.
- **Real voice, measured.** Run `pnpm --filter @astra/agent proof --only clean,interrupt --out <folder>`. Each run writes `summary.json`, with drift and stop times measured against the audio the browser received. It spends about 100 credits a run on the account Abel's videos share, and `docs/tests/scene-player.md` lists the limits. Add `--fake` to spend nothing, but drift is not meaningful on a tone, because a repeated tone matches itself.

## Gotchas

- `--mute-audio` keeps a proof run silent on Abel's desk, and the graph still runs. Use `AudioContext.outputLatency` with care, because a fake output device reports a fixed 32 ms.
- Editing a file the page imports during a proof run reloads the page through Vite and loses the run.
