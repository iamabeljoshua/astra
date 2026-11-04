# Live voice

A running session's screen connects to a real room. The student talks or types, and a stand-in tutor answers aloud with captions, reacts first from code, can be interrupted, and resumes after a dropped link.

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

## How to get to it (user POV)

Sign in, open any running session, and press **Talk** or type a reply. Ask the tutor to show you the ball for a long line with motion. See "Talk with the tutor" in `README.md` for the keys and for `pnpm agent`.

## Driving it

- **Everything, for no credits.** `pnpm --filter @astra/agent voice-proof --fake --only interrupt,backchannel,typed,second,tab,held,drop --turns 4 --out <folder>`. It starts what is not already running on `WEB_PORT` and `API_PORT`, and it spends LiveKit's free minutes and a few cents of Muse.
- **The two latency numbers.** `pnpm --filter @astra/agent voice-proof --only turns --turns 30 --out <folder>`, in the real voice. Thirty short turns cost about 300 credits. Read the account before and after.
- **Accents.** `node apps/agent/src/lab/proof/voice/measure-accents.ts --out <folder>` runs synthetic voices straight into the Muse adapter.
- **A real microphone.** See "What Abel can do" in `docs/tests/voice.md`, then `node apps/agent/src/lab/proof/voice/read-mic-test.ts <trace folder>`.

The driver gives the app a fake microphone that a script plays clips into, so everything after `getUserMedia` is the real path: WebRTC, LiveKit Cloud, the agent's detector, Muse, the rule, the voice, and the browser's clock. `docs/tests/voice.md` holds every number and what limits it.
