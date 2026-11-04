# The tutor's brain

A running session's screen answers with the real model, by voice and on the board. `docs/tests/tutor-model.md` has the numbers, and `README.md` under "Talk with the tutor" has the setup. The tutor reads the student's level, interests, and goal from the API with `ASTRA_AGENT_KEY`, not from the room token.

## Sub-features

- `tutor-answer` asks a question on Home. The tutor greets, then answers in short sentences, with math on its words.
- `tutor-reaction` sends a reply in a session. A stored reaction plays before any model word.
- `tutor-closed` is a tutor that has stopped for good in a room: past `ASTRA_SESSION_LIMIT_USD` or `ASTRA_SESSION_VOICE_LIMIT_CHARACTERS`, past `ASTRA_DAILY_LIMIT_USD`, or on a model that rejects every request. The screen keeps a note that says which, and to start a new session or come back tomorrow.
- `lesson-kinds` is the shape of a lesson. A direct question sets a task in its first reply, a topic teaches first and then picks an exercise, a new topic changes the title in the bar, and "go back to my problem" changes it back. `docs/tests/lesson-plan.md` has the design.
- `tutor-recorded` runs with `ASTRA_TUTOR_MODEL=recorded` and `ASTRA_VOICE=fake`, which spends nothing. Type `invalid`, `stall`, `wrong math`, `tag`, `refuse`, or `silent` to see each failure handled.

## How to drive it

`pnpm --filter @astra/agent exec node src/lab/proof/tutor-proof.ts --question "..." --ask "..."` signs in, asks on Home, types in the session, and prints when each sound was heard. `--record` saves a video with sound.

`pnpm --filter @astra/agent lesson-proof --web <your stack's address> --out <folder>` drives `lesson-kinds` on the real page and fails on a miss. Seed first, because it opens a card from Home. `--only direct,topic,switch,card,visual` runs some of it. `visual` is exact with `ASTRA_TUTOR_MODEL=recorded`, where "let me try one" says `boardMode` on "together". With a real model the tutor may draw first, and that brings the board in instead.
