# Live voice

A running session's screen connects to a real room. The student talks or types, and the tutor reacts first from code, answers aloud with captions, can be interrupted, and resumes after a dropped link. [The tutor's brain](./tutor.md) covers what it says.

The page asks `POST /sessions/:id/live-room` first, and it starts no room and no audio until the answer holds access. That answer is always 200 for the student's own unfinished session.

## Sub-features

- `voice-talk` presses **Talk**, opens the room, and hears a greeting in the tutor's voice.
- `voice-reaction` plays a stored reaction, with the dot pulsing first, before the reply.
- `voice-stop` lowers the tutor on the student's first sound, cuts it on the first real word, and freezes the board.
- `voice-backchannel` lowers the tutor on "Uh-huh" and does not stop it.
- `voice-typed` does the same exchange by typing, with no microphone, and Muse is never opened.
- `voice-drop` freezes on a dropped link, and resumes from the cut word.
- `voice-tab` closes the job and the room when the tab closes.
- `voice-second` gives a second student a separate room, and no token for the first room.
- `voice-mic-test` is the development page at `/lab/voice-test`, for a real microphone in a real room.
- `voice-no-room` is the app with no LiveKit keys. The answer is `{ access: null, unavailableBecause: 'notSetUp' }`, the note says `Your tutor could not connect just now.`, and the console stays clean. The `sessions` journey checks it, and `features/sessions.md` has the table of what it expects with the room service off and on.
- `voice-daily-limit` is a student at `ASTRA_DAILY_LIMIT_USD`. The answer is `{ access: null, unavailableBecause: 'dailyLimit' }`, and a rejoin that gets it stops at once.
- `voice-closed` is the agent's `tutorClosed` message. The note says why and stays, the dot rests, the microphone goes off, a reply stays on the screen, and the page does not rejoin.

## How to get to it (user POV)

Sign in, open any running session, and press **Talk** or type a reply. With `ASTRA_TUTOR_MODEL=stand-in`, ask the tutor to show you the ball for a long line with motion. See "Talk with the tutor" in `README.md` for the keys and for `pnpm agent`.

## Driving it

- **Everything, for no credits.** `pnpm --filter @astra/agent voice-proof --fake --only interrupt,backchannel,typed,second,tab,held,drop --turns 4 --out <folder>`. It starts what is not already running on `WEB_PORT` and `API_PORT`, and it spends LiveKit's free minutes and a few cents of Muse.
- **The two latency numbers.** `pnpm --filter @astra/agent voice-proof --only turns --turns 30 --out <folder>`, in the real voice. Thirty short turns cost about 300 credits. Read the account before and after.
- **Accents.** `node apps/agent/src/lab/proof/voice/measure-accents.ts --out <folder>` runs synthetic voices straight into the Muse adapter.
- **A real microphone.** See "What Abel can do" in `docs/tests/voice.md`, then `node apps/agent/src/lab/proof/voice/read-mic-test.ts <trace folder>`.

The driver gives the app a fake microphone that a script plays clips into, so everything after `getUserMedia` is the real path: WebRTC, LiveKit Cloud, the agent's detector, Muse, the rule, the voice, and the browser's clock. `docs/tests/voice.md` holds every number and what limits it.
