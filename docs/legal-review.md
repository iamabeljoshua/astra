# Legal review before any real student

A lawyer has not reviewed any of this. Abel must not invite a real student until one has, and until the view is recorded on the `lawyer-view` card (PRD section 11). This page lists what the lawyer needs to see. It is not legal advice.

## Settled by Abel, for the lawyer to weigh

- No parent consent step, and nothing contacts a parent. Under-13s stay closed. This overrides PRD Q4, Q5, S3, and S5's parent lines. PRD section 11's table still describes the law, including Nigeria's section 31, India's DPDP Rules, and GDPR Article 8.
- Help names an adult they trust and their local emergency number, never a hotline, because students are worldwide.

## Vendors

| Vendor | What to read | State today |
| --- | --- | --- |
| Anthropic | The zero-retention agreement. It now also receives each turn twice, because a second model reads the student's words and the tutor's reply for safety | Not asked for. Standard retention applies. Abel owns the ask |
| Meta, Muse Voice Transcribe | Age rules and a full read of the terms. Sections 4.1, 4.4, and 10.3 allow retention for safety and human review. Restricted territories include Ethiopia and Pakistan | Not read by a lawyer |
| ElevenLabs | Age rules and a full read of the terms. Its use policy requires parental consent records where it approves such a product, and Abel turned parent consent off. Retention is unread | Not read by a lawyer. The training opt-out is not confirmed |
| LiveKit | Retention of connection records. Agent observability is off | Not read by a lawyer |
| Supabase | Its own log retention. Code can delete the user, identities, sessions, and audit rows it can reach, and it cannot delete platform logs | Not read by a lawyer |

## What the product now does that a lawyer should read

- A separate check reads every student and tutor turn on Anthropic's Haiku model.
- A signal stops the teaching, shows help in words, and raises a flag for a named person to review. A flag holds a kind, a source, the student's ID, the session's ID, and the time, and none of the words.
- PRD S3 promises that people review all flags within 24 hours. Someone must staff that (PRD Q20). A reviewer cannot read the words, and nothing reaches a parent, so a reviewer can act on a flag only as far as the product lets them. The lawyer should say whether that is enough.
- PRD S3 and the plan call for "local help resources". The product names an adult they trust and the local emergency number, with no number or hotline.

- PRD S7 and AI Act Article 5(1)(f) rule out inferring emotions. The check reads the words of a turn for danger, and has no label for a feeling, no voice, and no camera. The lawyer should say that is outside the rule.
- A student's delete also removes flags about them, including ones nobody has reviewed yet.
- Vague words with nothing around them raise a `vague` flag, with the help note. Vague words in a school talk raise nothing, and the model answers with at most a gentle question. The lawyer and a safeguarding reader should say whether that trade is right.
- The 24 hour promise appears on the reviewer's page and not on the privacy page, until someone staffs it.

## Questions for the lawyer about flags

1. A reviewer has no words and no way to reach a student. Is a queue a person can only mark as read a safeguard at all, or does the product claim more than it does?
2. A student's delete removes unreviewed self-harm flags. Must any trace survive the delete, and for how long, and does that conflict with the promise that a delete removes the account?
3. The reviewer of M4.5 recommends this, and it is not built: keep flags wordless. Add one reviewer action that shows the student the help card at their next sign-in. On delete, keep an unreviewed flag's kind and time with the student's ID removed, and say so on the privacy page. If not all of that, call the queue audit only, and drop the 24 hour promise from PRD S3 and the reviewer's page.
4. Production boots with an empty reviewer list, so nobody can read the queue until Abel names someone. The privacy page now says people named by us "can read" the list. Is that accurate enough?

## Not done by this code

- A safeguarding reader has not read the tutor's crisis replies. `evals/tutor-turns/results/` holds them.
- A lawyer's view on the under-13 closing (PRD S1) is not recorded.
