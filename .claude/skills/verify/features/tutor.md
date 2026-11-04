# The tutor's brain

A running session's screen answers with the real model, by voice and on the board. `docs/tests/tutor-model.md` has the numbers, and `README.md` under "Talk with the tutor" has the setup.

## Sub-features

- `tutor-answer` asks a question on Home. The tutor greets, then answers in short sentences, with math on its words.
- `tutor-reaction` sends a reply in a session. A stored reaction plays before any model word.
- `tutor-recorded` runs with `ASTRA_TUTOR_MODEL=recorded` and `ASTRA_VOICE=fake`, which spends nothing. Type `invalid`, `stall`, `wrong math`, or `tag` to see each failure handled.

## How to drive it

`pnpm --filter @astra/agent exec node src/lab/proof/tutor-proof.ts --question "..." --ask "..."` signs in, asks on Home, types in the session, and prints when each sound was heard. `--record` saves a video with sound.
