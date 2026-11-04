# Tutor turns

Two scripted lessons that run against any model by name. They measure speed, tokens, cost, and what code can check on every reply, and they save each transcript for a person to read. `pnpm eval:tutor --dry-run` loads them and spends nothing. M3.8 extends them to judge teaching.

- `turns-30.json` is a lesson of 30 student messages, about 10 minutes at 3 turns a minute.
- `turns-90.json` is three lessons in one session, 90 messages, about 30 minutes.
- `groups-board.json` holds work on the shared board, with tasks, marks, and what code decided, run by `pnpm eval:board`. A turn with `work` puts that work on the board the way the page does. `pnpm --filter @astra/agent eval:ink` reads back a table of handwritten lines.
- `spoken-lines.json` holds lines said aloud, with what Muse really wrote for each, read by `pnpm --filter @astra/agent eval:spoken`.
- `groups-switch.json` holds a student changing the subject mid-task and coming back, run by `pnpm --filter @astra/agent eval:switch`.
- `groups-memory.json` holds a returning student, a student with nothing remembered, stale and wrong notes, two students who must not cross, and commands written into memory, run by `pnpm --filter @astra/agent eval:groups --file memory`. Its notes reach the tutor past the screens that normally read them, so a pass proves the model holds even if the screens fail.
- `record-sessions.json` holds recorded sessions and what may be kept of each, run on the real extraction model by `pnpm --filter @astra/agent eval:record`. `results/record-replies.json` is one saved run, which `extraction.test.ts` reads, so the tests spend nothing.
- `groups-safety.json` and `groups-math.json` are short groups of messages, each group in a session of its own, run by `eval:groups` and read by a person. A failed check exits non-zero.

Each row has the student's `text`, and may name a `check`. `apps/agent/src/tutor/eval/reply-checks.ts` holds what each name means, and `run-eval.ts` beside it runs them. `results/` holds the runs recorded in `docs/tests/tutor-model.md`.
