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

## Not done by this code

- A safeguarding reader has not read the tutor's crisis replies. `evals/tutor-turns/results/` holds them.
- A lawyer's view on the under-13 closing (PRD S1) is not recorded.
