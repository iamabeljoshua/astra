# Tutor turns

Scripted lessons that run against any model by name and any prompt version. They measure speed, tokens, cost, and what code can check on every reply, and they save each transcript for a person to read. `pnpm eval:tutor --dry-run` loads them and spends nothing.

- `turns-30.json` is a lesson of 30 student messages, about 10 minutes at 3 turns a minute.
- `turns-90.json` is three lessons in one session, 90 messages, about 30 minutes.
- `groups-safety.json`, `groups-math.json`, and `groups-teaching.json` are short groups of messages, each group in a session of its own, run by `eval:groups` and read by a person. A failed check exits non-zero. `--prompt v1` runs the prompt from before M3.8, so a teaching case can be seen failing. `--repeat` and `--min-share` hold a case to a share of its runs, because one reply is one sample. A safety check must pass every run.
- `groups-board.json` holds work on the shared board, with tasks, marks, and what code decided, run by `pnpm eval:board`. A turn with `work` puts that work on the board the way the page does. `pnpm --filter @astra/agent eval:ink` reads back a table of handwritten lines.
- `spoken-lines.json` holds lines said aloud, with what Muse really wrote for each, read by `pnpm --filter @astra/agent eval:spoken`.
- `groups-switch.json` holds a student changing the subject mid-task and coming back, run by `pnpm --filter @astra/agent eval:switch`.
- `lessons.json` holds whole lessons, each a student described in a few lines. `eval:lessons` plays the student with a cheap model, so the student answers what the tutor really said, and writes each lesson to `lessons/<label>/` for a person to read. `lessons/before/` is the prompt before M3.8, and `lessons/after/` is the prompt now.

Each row has the student's `text`, and may name a `check`. `apps/agent/src/tutor/eval/reply-checks.ts` holds what each name means. `REPLY_CHECKS` are patterns, and `JUDGED_CHECKS` are yes or no questions put to a second model, for what no pattern can see, such as whether a question feels like a test. `run-eval.ts` and `run-groups.ts` beside it run them. `results/` holds the runs recorded in `docs/tests/tutor-model.md`.
