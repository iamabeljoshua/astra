# astra

Private repo: `iamabeljoshua/astra`. The trunk is `main`. No deploys are set up yet.

## Product and plans

- PRDs live in `docs/PRD-<name>.md`. Turn my raw notes into a PRD, with a recommendation on each open question. I approve it before planning starts.
- Plans live in `docs/plans/<name>.md` and follow the pstack multi-phase plan playbook. Each plan starts from an approved PRD.
- The look is in `docs/DESIGN.md`. Follow it for all product UI.
- Use the `stageshow` skill for marketing and demo illustrations only, never for real product screens. Keep the third-party logos and app icons it bundles out of anything we publish.

## Tasks

Create one GitHub issue per PR in an approved plan, and keep the plan as the source of detail. Each issue has these sections:

- `## Goal`: one or two plain sentences on what changes and for whom.
- `## Acceptance criteria`: checkboxes. Each one is a result I can read and understand, and that someone can observe or test.
- `## How it gets tested`: the tests and live checks that prove the criteria.
- `## Depends on`: other issues, or None.

Every PR says `Closes #<issue>`. Comment on the issue when its PR opens, when verification finishes, when it merges, and when it gets blocked.

## Running the work

- Execution starts only on my go. My go approves the whole plan, including its size.
- Before execution starts, propose the commands to allow in `.claude/settings.json` for my approval, because an unapproved command pauses the run.
- Run plans with the `autopilot-full` playbook, changed by the rules in this file.
- Run at most 3 PRs or workstreams at a time, and only when they are independent. Dependent work waits for its parent PR to merge.

## Merging

You may merge your own PRs into `main` without review from me. This overrides the `autopilot-full` rule that I click every merge.

Merge a PR when all of these are true at its current head:

- CI passes, once CI exists.
- Independent verification is clean.
- Every acceptance criterion is checked, with evidence.
- No decision from the stop list below is open on it.

Merge with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then read the PR back to confirm that it merged.

This repo has no branch protection, so GitHub does not enforce these conditions. You must.

Merging is not a deploy today. When deploys exist, stop and ask me to review this section.

## Stop and ask me

Stop for my decision before you do any of these:

- Touch auth or payments.
- Add or depend on a paid service.
- Make a high-level architectural decision.
- Change anything from an approved plan.

Give me the options and your recommendation. Add the `needs-human-review` label to the issue, tell me in chat, and send a push notification. Keep working on anything the decision does not affect.

For architectural decisions, run `/pstack:architect` with a checkpoint, so that I see the design before implementation.

## Verification

Each PR gets 5 independent agents by default, none of which wrote the code: one runs the gates (lint, typecheck, tests), two run live scenarios, and two audit the diff. All run on Opus 5.5 except one audit agent, which runs on Sonnet so that a different model reviews the code. Add a perf check only when the PR changes performance. A PR that touches anything on the stop list gets the full verification set from the playbook.

This overrides the ten live lanes in the plan template. `check-plan.mjs` has no setting for this, so ignore only its two lane-count failures: `Verify, live lacks "Ten lanes...` and `lanes are [...], expected 1 to 10`. Fix every other failure.

## CI and verification setup

- An early PR adds GitHub Actions CI with lint, typecheck, and tests.
- Once the app runs, an early PR runs `/pstack:create-verification-skill`, so that agents can drive the real app. Until then, live checks use the commands that exist.
- GitHub Actions minutes are limited on this free private repo. Keep CI fast, and do not rerun it without a reason.

## Code style

The goal: reading the code tells the full story with no cognitive overload.

- Split a module into a folder of small single-purpose files when its concerns separate. Imports flow one way, with no cycles. The entry function reads as an outline of the algorithm.
- Keep functions to about 20 lines. Use a single object input for more than two parameters. Export only what is used.
- Use descriptive full names, including loop variables. Use a `get` prefix for computed getters and action verbs for actions. Group named constants by concern.
- No cleverness: no magic-number heuristics, no out-param mutation, no implicit side channels. Prefer explicit flags over inferred state.
- Straightforward code gets no comment. A function or class that is not straightforward gets one short plain-English line, written as a principal engineer would. Rationale goes in `docs/`.
- API docs are the exception. DTO fields and controller routes carry a short comment, because the Swagger plugin turns those comments into the API docs. Do not remove them in a comment cleanup.
- Keep one source of truth for types. Do not copy a type across packages. Delete tests that do not check behavior.

## Writing

No em-dashes and no AI-sounding filler in product copy, PRDs, or docs. Use short, confident, concrete sentences with a premium, professional tone. Keep app strings in one place.
