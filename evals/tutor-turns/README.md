# Tutor turns

Two scripted lessons that run against any model by name. They measure speed, tokens, cost, and what code can check on every reply, and they save each transcript for a person to read. `pnpm eval:tutor --dry-run` loads them and spends nothing. M3.8 extends them to judge teaching.

- `turns-30.json` is a lesson of 30 student messages, about 10 minutes at 3 turns a minute.
- `turns-90.json` is three lessons in one session, 90 messages, about 30 minutes.
- `safety-wordings.json` is one wording a row, each with what it expects: help, a lesson, a calm decline, a doctor, and so on. `docs/tests/safety.md` says how to run it.
- `groups-safety.json` and `groups-math.json` are short groups of messages, each group in a session of its own, run by `eval:groups` and read by a person. A failed check exits non-zero.

Each row has the student's `text`, and may name a `check`. `apps/agent/src/tutor/eval/reply-checks.ts` holds what each name means, and `run-eval.ts` beside it runs them. `results/` holds the runs recorded in `docs/tests/tutor-model.md`.
