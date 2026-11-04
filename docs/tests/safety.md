# Safety for students 13 and up: what was measured

This is the record for M4.5. A separate check reads every student and tutor turn beside the reply. No safeguarding reader has seen any of this, and a lawyer has not reviewed it. Both are needed before a real student.

To run it again:

```sh
pnpm --filter @astra/agent eval:safety-check --reps 2           # the check alone on every wording, about $0.02
pnpm --filter @astra/agent eval:safety --label run      # the whole tutor on every wording, about $0.30
pnpm --filter @astra/agent eval:safety --group curious --check off --block v1 --label old   # the old rules, for a comparison
```

`evals/tutor-turns/safety-wordings.json` holds the wordings. `evals/tutor-turns/results/safety-*.jsonl` holds each run with every reply, and a person reads every crisis reply, because code can only judge some of what a reply must do.

## How a turn runs

1. The student's words go to the tutor model and, at the same moment, to the check on Haiku. Neither waits for the other, so the first reaction and a lesson's first word cost nothing extra.
2. If the check reads danger, the page shows the help in words and a flag goes to the review queue. Both happen before any voice speaks, so a voice failure cannot lose them, and they spend no voice credits.
3. If the reply so far names no help and the student wrote in English, code's own line replaces what was not yet spoken. The check usually answers before the model's first words, and the line is what the model usually says.
4. A reply in another language gets to finish, because it usually names help in that language. If it names none, the model is asked once more, and code adds the help in English if that fails too.
5. If the model is still silent at 3 s on a read danger, code's line plays, and "One moment." does not.
6. A reply that reaches the crisis words with no signal still shows the help and raises a `danger` flag from the tutor's side.
7. After the reply, the check reads what the tutor said. A reply that reads as a slip raises a `tutor_slip` flag, and the student hears nothing different.

If the check fails or will not answer, the turn runs as it did before the check existed, with the prompt and the reader as its safeguards. A refusal then keeps its help sentence.

## What a flag holds

A kind, a source, the session, the student, and the time. No word of what was said, because the privacy page promises we do not store the words. Agent traces name a reading and never the words. Nothing goes to a parent.
