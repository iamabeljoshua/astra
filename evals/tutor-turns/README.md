# Tutor turns

Two scripted lessons that run against any model by name. They measure speed, tokens, cost, and what code can check on every reply, and they save each transcript for a person to read. `pnpm eval:tutor --dry-run` loads them and spends nothing. M3.8 extends them to judge teaching.

- `turns-30.json` is a lesson of 30 student messages, about 10 minutes at 3 turns a minute.
- `turns-90.json` is three lessons in one session, 90 messages, about 30 minutes.

Each row has the student's `text`, and may name a `check`. `apps/agent/src/tutor/eval/reply-checks.ts` holds what each name means, and `run-eval.ts` beside it runs them. `results/` holds the runs recorded in `docs/tests/tutor-model.md`.
