# Astra MVP plan

This plan takes Astra from an empty repo to a first working MVP, for Abel and the first test students.
A student signs in with an email code, answers a few questions, and picks a card or asks a question on Home.
They then have a real spoken lesson on a board they share with the tutor, which draws in time with its words, working from a lesson plan and calling tools only when it needs them.
Afterwards the tutor remembers them, recommends what comes next, and lets them replay the session.
The rule the program enforces is the PRD's rule for the board and the tutor, proved on the real app at every PR.
The PR ids in order are M1.1, M1.2, M1.3, M1.5, M1.4, M1.6, M2.1, M2.3, M2.6, M2.7, M2.8, M2.2, M2.9, M1.7, M3.1, M2.4, M2.5, M2.10, M2.11, M2.12, M3.2, M3.3, M3.4, M3.6, M3.5, M3.7, M3.12, M3.14, M3.15, M3.8, M3.9, M3.13, M3.10, M3.11, M4.1, M4.2, M4.3, M4.4, M4.5.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record. A merged PR's boxes are checked, and its text records what that PR set out to do, so a later PR can replace what it built.

The program runs `skills/poteto-mode/playbooks/autopilot-full.md` from the installed plugin, changed by the rules in `CLAUDE.md` and Abel's speed rules below. The root merges each PR once its verdict is clean, without Abel's click, as `CLAUDE.md` allows. Stop-list decisions still stop for Abel, only for the item they touch, and they are named in the Build boxes of M3.12, M3.14, M4.4, and M4.5.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

Each PR has one GitHub issue with the same acceptance criteria, and this plan holds the detail. The stack is React with Vite for the web app and NestJS with Postgres for the API, as Abel chose on 2 November 2026. From M1.5 on, HTTP shapes are `class-validator` DTOs in `apps/api`, Swagger docs come from their comments, and the web app uses types generated from the OpenAPI document. `packages/contracts` keeps those generated types and hand-written shapes that are not HTTP, such as the scene language. From M1.6 on, the web app calls the API only through its typed client and React Query. Postgres and sign-in run on Supabase, locally through the Supabase CLI, with TypeORM connected directly.

| Milestone | What it delivers | PRs |
| --- | --- | --- |
| M1 Foundation | One running app, automatic checks, the approved look, and a database. | M1.1, M1.2, M1.3, M1.5, M1.4, M1.6, M1.7 |
| M2 Student app | Sign-in with a 6-digit email code, onboarding, the home screen, picks, sessions, and the dotted Saturn look. | M2.1, M2.3, M2.6, M2.7, M2.8, M2.2, M2.9, M2.4, M2.5, M2.10, M2.11, M2.12 |
| M3 Live tutor | A real session end to end, with voice, a shared board, 3D scenes, the tutor agent, and lesson plans. | M3.1, M3.2, M3.3, M3.4, M3.6, M3.5, M3.7, M3.12, M3.14, M3.15, M3.8, M3.9, M3.13, M3.10, M3.11 |
| M4 Learning loop | Memory, personal teaching, recommended picks, recap and replay, and safety. | M4.1, M4.2, M4.3, M4.4, M4.5 |

## Where the program stands

As of 4 November 2026, 22 of 39 PRs have merged. This section is the whole road, and each PR's section below holds its detail. `docs/PRD-v1.md` lists what these decisions override under "Changes since approval", and `docs/architecture/live-session.md` holds the reasons for the live session.

**What Abel has decided since the plan was approved.**

- **Speed, for this session.** Up to 6 PRs at once, dependent work waits for its parent to merge, and each PR gets one adversarial reviewer as soon as it is code-ready. `CLAUDE.md` stays as it is unless Abel says to make this permanent.
- **Vendors.** ElevenLabs for the voice, Muse Voice Transcribe for transcription, and LiveKit Cloud with our own accounts, on a free project until real students. The age terms go to the lawyer before real students.
- **Voice.** ElevenLabs voice Chris, on Flash, Abel's choice on 4 November in place of Casey.
- **Tutor.** Sonnet 5.5, with code reacting first and a timeout for stalls. There is no talking router for now.
- **Speed targets.** Two numbers replace PRD V1's rule. A first reaction under 200 ms from code, and a first real word as fast as the vendors allow.
- **The shared board.** Student and tutor both work on the board, in M3.12, with ink and uploads narrowed to M3.11.
- **Lessons.** A student follows a plan of concepts. Inside a running lesson, a queue writes the next scenes, in M3.13.
- **Best-effort 3D.** Voice and the 2D board never wait for a scene. A scene shows only when it is ready and checked. On a new question the tutor starts with words and simple 2D, setting up what the scene will show, then brings in 3D at a pause. Cards and planned scenes open on 3D where one is ready. A scene not ready after about 20 s is dropped from that lesson and saved. There is no spinner. M3.10 does not block on 3D, and 3D is built alongside it.
- **Laptop first.** Rich scenes target laptops and may require a laptop browser, and phones must not block them. Existing pages keep working at phone width, and a mobile app may come later.
- **Engines.** ManimGX for symbols, plots, grids, flat maps, and code, and our kit for solid things a camera could film, chosen by a router, in M3.14. Python runs only on a server in a locked container, and the browser plays a stored take. "Videos" means our generated scenes, with no real footage and no AI-generated video.
- **Sharing.** Scenes shared across students come only from the server's own topic list. A typed question's scene stays with that student until a person or a moderated step promotes it. The review is a strict filter and not a truth gate, so "Not yet checked by a person" stays.
- **No prepared scenes by worker.** No worker prepares scenes from recommendations before a student arrives. That is post-MVP, and Appendix E lists it. Writing next scenes inside a running lesson stays.
- **Library.** One curated library, written once in M3.15, of 133 scenes for about $10 by estimate. Everything else gets written the first time a student needs it, then saved.
- **Parents.** No parent consent, alerts, or summaries. The under-13 rule stays, and a lawyer reviews this before real students.
- **Onboarding.** Name, date of birth, class level, interests, a goal, then Home, in M2.4.
- **Sign-in and the look.** A 6-digit email code, in M2.10. Sign-in and onboarding use the look Abel chose on 4 November, 1 + 4, a dotted Saturn on a star chart on a still dot grid, in M2.11. There is no sheet, and pictures stay normal images.
- **Recommendations.** Session history in M2.12, with the card pictures unchanged, and the learner record in M4.3.

**The road ahead.** A wave is computed from the dependencies, so PRs in one wave can run together, within the limit of 6. After M3.3, the order is M3.6 and M3.7, then M3.4, M3.5, M3.8, and M3.12, then M3.9, M3.10, M3.11, and M4.1 to M4.5. 3D is built alongside that line and never holds it. M3.14 comes first. M3.15, the library, starts after M3.14, and nothing waits for it. M3.13, the scene queue, follows M3.9 because it reads M3.9's concept plan. M3.10 waits for none of the three, so a first full session can run on the 2D board if the 3D work takes longer.

| Wave | PR | What it delivers | Issue | Waits for |
| --- | --- | --- | --- | --- |
| 1 | M3.4 | Draw graphs, geometry, and real motion | #13 | Nothing open |
| 1 | M3.6 | Add live voice | #15 | Nothing open |
| 2 | M3.5 | Finish the board library and prove no layout defects | #14 | M3.4 |
| 2 | M3.7 | Connect the tutor's brain | #16 | M3.6 |
| 3 | M3.12 | Share the board between student and tutor | #70 | M3.7 |
| 3 | M3.14 | Show best-effort 3D scenes from ManimGX and our kit | #72 | M3.5, M3.7 |
| 3 | M3.8 | Teach instead of tell, with tools the tutor calls when needed | #17 | M3.7 |
| 4 | M3.15 | Write the approved library of 133 scenes | #91 | M3.14 |
| 4 | M3.9 | Prepare a lesson plan for every session | #18 | M3.8 |
| 5 | M3.13 | Keep the next scenes ready as the lesson flows | #71 | M3.5, M3.9 |
| 5 | M3.10 | Run the first full session end to end | #19 | M3.5, M3.9, M3.12 |
| 6 | M3.11 | Let students draw on the board and upload their work | #20 | M3.10, M3.12 |
| 6 | M4.1 | Give the tutor a memory of each student | #21 | M3.10 |
| 6 | M4.5 | Make it safe for students 13 and up | #25 | M3.10 |
| 7 | M4.2 | Make the teaching personal | #22 | M4.1 |
| 7 | M4.3 | Recommend picks from performance and weaknesses | #23 | M4.1 |
| 7 | M4.4 | End sessions with a recap, and let students replay them | #24 | M3.10, M4.1 |

**What the tests settled for M3.13 and M3.14.** The scene test and the ManimGX test have both reported, and ManimGX passed the bar stated to Abel, so it is in. Abel chose Anthropic models to write and review scenes and the library, with no OpenAI. The writer stays behind one small interface, so a later model is a one-line change.

**Still waiting on Abel.**

- Whether a mid-sentence flush sounds natural on Chris, which settles the flush rule.
- The eight-digit code question in Appendix E.
- The tutor's pen colour, which M3.12 proposes.
- Confirming ElevenLabs' training opt-out on `elevenlabs-balance`.
- Before real students, the lawyer's review on `lawyer-view`, which now includes ManimGX's GPL wheels on our server, H.264 if video is served, and notices for wasm and the fonts in takes, Anthropic's Scale tier and zero-retention agreement, and a paid LiveKit plan.
- Whether to make the speed rules permanent in `CLAUDE.md`.
- The public name (PRD Q1).

**Done.**

| PR | What it delivered | Issue | Merged in |
| --- | --- | --- | --- |
| M1.1 | Set up the app and automatic checks | #1 | PR 27, `e50d26b` |
| M1.2 | Let agents open and test the real app | #2 | PR 35, `ff71938` |
| M1.3 | Build the look and app shell | #3 | PR 37, `f029d8b` |
| M1.5 | Add validated request shapes and Swagger docs from code comments | #30 | PR 32, `a37e1af` |
| M1.4 | Add the database for students and sessions | #4 | PR 42, `9b894d7` |
| M1.6 | Add React Query and a typed API client | #38 | PR 44, `d098357` |
| M2.1 | Build the home screen | #5 | PR 46, `f492061` |
| M2.3 | Add sign-in and the age gate | #7 | PR 47, `e8a09ca` |
| M2.6 | Move the data layer to entities and repositories | #50 | PR 58, `7a55de6` |
| M2.7 | Give API calls 30 seconds | #52 | PR 55, `a0f5fc7` |
| M2.8 | Add sample Terms and Privacy pages | #53 | PR 57, `d70429c` |
| M2.2 | Add the library of pre-made picks | #6 | PR 60, `64b890b` |
| M2.9 | Finish sign-in with the Back fix, the password trigger, and the one-day mark | #56 | PR 59, `24b652b` |
| M1.7 | Bring CI's time down without weakening a check | #63 | PR 64, `b8ff4b6` |
| M3.1 | Design the live session and get Abel's approval | #10 | PR 48, `30a9094` |
| M2.4 | Build onboarding | #8 | PR 62, `ae23bcc` |
| M2.5 | Start sessions and list them | #9 | PR 61, `2da9167` |
| M2.10 | Sign in with an email code, in the made-of-dots look | #67 | PR 75, `ff3ad32` |
| M2.11 | Bring sign-in and onboarding into the 1 + 4 look | #68 | PR 83, `7099f67` |
| M2.12 | Recommend from session history | #69 | PR 77, `54d83aa` |
| M3.2 | Make the board move in time with speech | #11 | PR 76, `0bc6e61` |
| M3.3 | Draw math on the board | #12 | PR 81, `c9c4d33` |

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on the operator's explicit go.
- [ ] Propose the commands to allow in `.claude/settings.json` for the operator's approval, because an unapproved command pauses the run.
- [ ] On the operator's go, write this exact text into the standing orders and restate it in your todolist. "Plan `docs/plans/mvp.md`. PRs in order M1.1, M1.2, M1.3, M1.5, M1.4, M1.6, M2.1, M2.3, M2.6, M2.7, M2.8, M2.2, M2.9, M1.7, M3.1, M2.4, M2.5, M2.10, M2.11, M2.12, M3.2, M3.3, M3.4, M3.6, M3.5, M3.7, M3.12, M3.14, M3.15, M3.8, M3.9, M3.13, M3.10, M3.11, M4.1, M4.2, M4.3, M4.4, M4.5. Tests alone are not sufficient verification, and a PR is verified only when its unit, live, and perf boxes are all checked. The root merges after a clean verdict, as `CLAUDE.md` allows. At most 6 PRs at a time under Abel's speed rules. Done when every box is checked with evidence and M3.10's recording is posted."
- [ ] Read these from the installed plugin at program start. Re-read them at every tick.
  - [ ] `skills/poteto-mode/playbooks/autopilot-full.md`
  - [ ] `skills/swarm/SKILL.md`
  - [ ] `.claude/skills/verify/SKILL.md` once M1.2 has merged, and `skills/run` until then
  - [ ] `skills/poteto-mode/playbooks/opening-a-pr.md`
  - [ ] `skills/architect/SKILL.md`
- [ ] Arm the hourly audit tick as a real `/loop` in dynamic mode, which schedules its own wake-up rather than blocking on a sleep. Never leave the cadence to memory.
- [ ] Use this tick prompt, verbatim. "Re-read the execution playbook from the installed plugin and the standing objective. Audit the operation against both and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a stuck lane and dispatch its replacement now. Then post a short status message to the operator in chat only when the audit found a tracked change that no earlier status message reported, such as a PR opened, a code-ready head, a round launched or closed, a verdict, a merge, a stuck agent and the action taken, a blocker added or cleared, or a decision only the operator can make. Name every such change and nothing else. Do not repeat a table, the merged list, or an unchanged blocker. If the audit found none, end the turn with no reply text. Either way, log this tick's row in your decision trail. The row names the items reported, or none."
- [ ] On the operator's hold or stand-down, send every owner a zero-writes order at once.

### Spawn owners

- [ ] Spawn one owner per PR with the full lifecycle the execution playbook names.
- [ ] Run up to 6 PRs and reviewers at a time, as Abel ruled for this session on 3 November 2026. `CLAUDE.md` still says 3 until Abel makes this permanent. Dependent work waits for its parent PR to merge, and owners stay off trunk, never stacked.
- [ ] Follow this dependency graph.
  - [x] M1.1 is first and branches from `main`.
  - [x] M1.2 after M1.1.
  - [x] M1.3 after M1.1.
  - [x] M1.5 after M1.1.
  - [x] M1.4 after M1.1 and M1.5.
  - [x] M1.6 after M1.3 and M1.5.
  - [x] M2.1 after M1.3 and M1.4 and M1.6.
  - [x] M2.3 after M1.3 and M1.4 and M1.6.
  - [x] M2.6 after M2.1 and M2.3.
  - [x] M2.7 after M2.1.
  - [x] M2.8 after M2.3.
  - [x] M2.2 after M1.4 and M2.1 and M2.6.
  - [x] M2.9 after M2.3.
  - [x] M1.7 after M1.1.
  - [x] M3.1 after M1.4.
  - [x] M2.4 after M2.1 and M2.3 and M2.6.
  - [x] M2.5 after M2.1 and M2.3 and M2.6.
  - [x] M2.10 after M2.3 and M2.9.
  - [x] M2.11 after M2.4 and M2.10.
  - [x] M2.12 after M2.5.
  - [x] M3.2 after M3.1 and M1.3.
  - [x] M3.3 after M3.2.
  - [ ] M3.4 after M3.2.
  - [ ] M3.6 after M3.2.
  - [ ] M3.5 after M3.3 and M3.4.
  - [ ] M3.7 after M3.2 and M3.6.
  - [ ] M3.12 after M3.3 and M3.7.
  - [ ] M3.14 after M3.5 and M3.7.
  - [ ] M3.15 after M3.14.
  - [ ] M3.8 after M3.7.
  - [ ] M3.9 after M3.8 and M2.5.
  - [ ] M3.13 after M3.5 and M3.9.
  - [ ] M3.10 after M3.5 and M3.9 and M3.12.
  - [ ] M3.11 after M3.10 and M3.12.
  - [ ] M4.1 after M3.10.
  - [ ] M4.2 after M4.1.
  - [ ] M4.3 after M4.1 and M2.2 and M2.12.
  - [ ] M4.4 after M3.10 and M4.1.
  - [ ] M4.5 after M3.10.
- [ ] Hold the file boundaries. Each PR touches only the paths in its **Files.** block and the root config it needs.
- [ ] Comment on the issue when its PR opens, when verification finishes, when it merges, and when it gets blocked. Every PR says `Closes #<issue>`.
- [ ] Post screenshots on the issue for every PR that changes a screen, so Abel can look at any time without blocking the merge.

### PR mechanics, for every PR

- [ ] Resolve the forge once. Default to `gh`; if `command -v origin` succeeds and Origin can resolve the repository, use `origin pr` for every PR operation. Record any fallback to `gh`. Never require `gt`.
- [ ] Open the PR ready, never draft, per **Opening a PR**.
- [ ] Run the repo's lint and typecheck once before the PR-facing push. Push with hooks on.
- [ ] Never force-push, because this repo refuses it. Merge `main` into the branch instead.
- [ ] Run `/deslop` before each commit and `/no-comments` before review.
- [ ] Triage every review-bot and security-reviewer comment per `references/bugbot-triage.md`.
- [ ] Before the code-ready report and babysit, and again after merge prep, record the base and head SHAs prepared by the topology owner under the execution playbook.
- [ ] If the PR changes what is stored, who receives data, or what happens to an under-13 account, edit `LEGAL_PAGES` in `apps/web/src/strings.ts` in the same PR. No test enforces this.
- [ ] Never credit Claude or AI in commits or PR bodies, as Abel's global rules require.

### Verdict and merge, for every PR

- [ ] For this session, each PR gets one adversarial reviewer on Opus 5.5 as soon as it is code-ready, covering gates, CI, a live run, and the diff in one pass, as Abel ruled on 3 November 2026. Reviews do not queue. `CLAUDE.md` still says 5 agents until Abel makes this permanent.
- [ ] A reviewer blocks only for a bug a user would hit, a failed gate, a wrong shipped doc, or one student reaching another's data. Everything else is a follow-up.
- [ ] A rebase, a merge-conflict resolution, or a minor fix gets a single verifier at the new head, and a wording-only change gets none.
- [ ] A failure on trunk behavior in a lane marked `Regression lane against trunk.` is recorded against trunk and does not block the PR.
- [ ] Read CI by the job's conclusion, which must be `success`, because a timeout concludes `cancelled` and `gh pr checks` can exit 0 on it.
- [ ] The root merges after a clean verdict, with the conditions and command in `CLAUDE.md`, and applies the patch-id rule from `playbooks/shipping.md`. When a branch has temporary commits, pass a clean subject and body to the squash.

### Boot recipe, for every live lane

Each live lane runs in its own worktree at the PR head. Drive through the skill path or exact commands recorded in this boot recipe.

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>`.
- [ ] Run `pnpm install --frozen-lockfile`, `pnpm db:up`, `pnpm db:migrate`, `pnpm db:seed`, and `pnpm dev`, using the commands that exist at that PR. Wait until the web app and the API both answer.
- [ ] Deliver input only through `.claude/skills/verify/SKILL.md` once M1.2 has merged. Read-only diagnostics are the browser console, the API logs, and the agent logs.
- [ ] Save every screenshot to `/tmp/swarm-<pr-id>/worker-<n>/<slug>.png` and return the paths with the report.

## Set up the app and automatic checks (M1.1)

**Status.** Done. Merged in PR 27 as `e50d26b`. M1.7 later cut CI's time, and CI's job limit is 4 minutes.

**Depends on.** None.

**Files.**

- [x] Create `pnpm-workspace.yaml`, the root `package.json`, and `.nvmrc`.
- [x] Create `apps/web/`, `apps/api/`, and `packages/contracts/`.
- [x] Create `.github/workflows/ci.yml`.
- [x] Create `README.md`.

**Build.**

- [x] Set up a pnpm workspace with `apps/web` on React and Vite, `apps/api` on NestJS, and `packages/contracts` for shared types, following the layout of `agentic-tutor`.
- [x] Add `GET /health` in `apps/api/src/health/`, typed from `packages/contracts`, and show its result on the web page.
- [x] Add `pnpm dev`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` at the root.
- [x] Add one CI job that caches pnpm and runs the three checks.

**You see.**

- [x] One documented command starts the web app and the API, and the browser shows a plain page with the product name and a line saying the API is connected.
- [x] The web app uses React with Vite, the API uses NestJS, and both use TypeScript with strict type checking on.
- [x] Lint, typecheck, and tests each run with one command, and all pass on a fresh clone.
- [x] Every PR runs those three checks on GitHub, and a failing test turns the PR's check red.
- [x] A full CI run finishes in under 3 minutes, to protect the free Actions minutes.
- [x] The README explains how to install, run, and test the app.
- [x] No paid service is added.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `apps/api/src/health/health.controller.spec.ts` asserts the health response. Run `pnpm test`.
- [x] `apps/web/src/App.test.tsx` asserts the product name renders. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [x] Lane 1. Regression lane against trunk. Trunk has no app, so record that and gate the fresh path. Clone fresh, run `pnpm install` and `pnpm dev`, and load the page. Save `m1-1-home.png`. Pass when the page shows the product name and says the API is connected.
- [x] Lane 2. Push a throwaway commit with a failing test to a temporary branch, then remove it. Save `m1-1-ci-red.png`. Pass when the check turns red with the failing test and green once it is removed, in under 3 minutes.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [x] Probe. None.
- [x] Baseline. None.
- [x] Rule. None.

**Review gate.** None. M1.1 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [x] Root's clean verdict at the exact head SHA.
- [x] Bugbot triage done.
- [x] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [x] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [x] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Let agents open and test the real app (M1.2)

**Status.** Done. Merged in PR 35 as `ff71938`.

**Depends on.** M1.1.

**Files.**

- [x] Create `.claude/skills/verify/SKILL.md` and its scripts.

**Build.**

- [x] Run `/pstack:create-verification-skill` against the running app and record the driver commands in `.claude/skills/verify/SKILL.md`.
- [x] Use a browser driver that supports WebGL and audio, because the board and voice PRs need both.

**You see.**

- [x] A project skill exists in `.claude/skills/` and is tracked in git, created with `/pstack:create-verification-skill`.
- [x] Following only that skill, an agent starts the app from a clean copy and saves a screenshot with no human help.
- [x] The skill can capture both laptop and phone widths.
- [x] When a page is deliberately broken, the skill reports a failure.
- [x] The skill shuts the app down afterwards and leaves nothing running.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] The skill's own check script asserts a failing exit code on a page that throws. Run `pnpm verify:self`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [x] Lane 1. Regression lane against trunk. Trunk has no skill, so record that and gate the end state. From a clean worktree, follow only the skill to start the app and capture laptop and phone widths. Save `m1-2-laptop.png`. Pass when both screenshots exist and no human input was needed.
- [x] Lane 2. Break the home page on purpose in a worktree, then run the skill. Save `m1-2-broken.png`. Pass when the skill reports the failure, and no app process is left running afterwards.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [x] Probe. None.
- [x] Baseline. None.
- [x] Rule. None.

**Review gate.** None. M1.2 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [x] Root's clean verdict at the exact head SHA.
- [x] Bugbot triage done.
- [x] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [x] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [x] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Build the look and app shell (M1.3)

**Status.** Done. Merged in PR 37 as `f029d8b`.

**Depends on.** M1.1.

**Files.**

- [x] Create `packages/theme/`.
- [x] Create `apps/web/src/shell/`, `apps/web/src/strings.ts`, and `apps/web/src/theme/`.
- [x] Add the Barlow and Newsreader font files under `apps/web/public/fonts/`, so student browsers make no call to a font service.

**Build.**

- [x] Define the tokens from `docs/DESIGN.md` in `packages/theme` and expose them as CSS variables and Tailwind colors.
- [x] Build `AppShell`, `Sidebar`, and the `MENU` list, using `docs/design/app-prototype/` as the reference.
- [x] Add a lint rule that rejects literal colors in `apps/web/src`.
- [x] Set the theme before first paint to prevent a flash.

**You see.**

- [x] Colors and fonts come from one place and match `docs/DESIGN.md`, and a check finds no hard-coded colors in components.
- [x] Light is the default, the sidebar has a dark toggle, and the choice survives a reload with no flash of the wrong theme.
- [x] The sidebar shows the product name, Home, Sessions, an empty Recent section, and the student's account row, at the prototype's sizes.
- [x] Adding a menu item is a one-line change to one list.
- [x] All app text lives in one module, and changing the product name there changes it everywhere.
- [x] At phone width the sidebar becomes a Menu button, and no page scrolls sideways at 390px.
- [x] Keyboard focus is always visible, the reduced-motion setting is honored, and nothing flashes more than three times a second.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `Sidebar.test.tsx` asserts that a new `MENU` entry renders a row.
- [x] `strings.test.ts` asserts that every string the shell uses comes from `strings.ts`.
- [x] `theme.test.ts` asserts that the saved choice is read and applied. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [x] Lane 1. Regression lane against trunk. Trunk has no shell, so record that and gate the end state. Load Home and Sessions at laptop width in light and dark. Save `m1-3-laptop.png`. Pass when the layout matches the app prototype and reload keeps the theme with no flash.
- [x] Lane 2. Load both pages at 390px, open the Menu, and tab through every control. Save `m1-3-phone.png`. Pass when nothing scrolls sideways and every focused control shows a visible ring.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [x] Probe. None.
- [x] Baseline. None.
- [x] Rule. None.

**Review gate.** None. M1.3 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [x] Root's clean verdict at the exact head SHA.
- [x] Bugbot triage done.
- [x] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [x] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [x] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Add validated request shapes and Swagger docs from code comments (M1.5)

**Status.** Done. Merged in PR 32 as `a37e1af`.

**Depends on.** M1.1.

**Files.**

- [x] Create `apps/api/nest-cli.json` settings and `apps/api/test/swagger-transformer.cjs`.
- [x] Edit `apps/api/src/main.ts`, `apps/api/src/health/`, and the Jest config in `apps/api/package.json`.
- [x] Create `packages/contracts/src/api.generated.ts`.
- [x] Edit `apps/web/src/useApiConnection.ts`, `.github/workflows/ci.yml`, and `README.md`.

**Build.**

- [x] Add `@nestjs/swagger`, `class-validator`, and `class-transformer`, and enable the plugin in `apps/api/nest-cli.json` with `introspectComments` and `classValidatorShim`.
- [x] Add a global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, and `transform`.
- [x] Use DTO classes for query strings and route parameters as well as bodies, so their comments reach Swagger without relying on `@param` tags.
- [x] Register the plugin's AST transformer with `ts-jest`, because Jest compiles in memory and skips the Nest CLI plugin.
- [x] Serve Swagger UI at `/docs` only in development.
- [x] Add `pnpm api:types`, which generates `packages/contracts/src/api.generated.ts` from the OpenAPI document with `openapi-typescript`, and add a CI check for drift.
- [x] Keep hand-written shapes that are not HTTP, such as the scene language, in `packages/contracts`.

**You see.**

- [x] Every request body, query string, and route parameter is a DTO class with `class-validator` rules.
- [x] The API rejects bad input with a clear 400 error that names the field, and it rejects fields a DTO does not declare.
- [x] A comment on a DTO field appears in Swagger as that field's description, and a comment on a controller route appears as its summary, with no Swagger decorators written by hand.
- [x] Swagger UI opens at `/docs` in development, and `/docs-json` serves the OpenAPI document. Both are off in production unless Abel decides otherwise.
- [x] The web app's API types are generated from that OpenAPI document, so the DTOs are the one source of truth, and CI fails if the generated types are out of date.
- [x] The health route is the worked example, and the README explains how to add a new DTO.
- [x] No paid service is added.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `validation.spec.ts` asserts that a bad body returns 400 naming the field, and that an undeclared field is rejected.
- [x] `openapi.spec.ts` asserts that a comment on a DTO field becomes its description and that a route comment becomes its summary. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [x] Lane 1. Regression lane against trunk. Trunk has no Swagger, so record that and gate the end state. Start the API and open `/docs`. Save `m1-5-docs.png`. Pass when the health route and its DTO show descriptions taken from code comments.
- [x] Lane 2. Send bad input to a test-only validated route, then change a DTO without regenerating types on a temporary PR. Save `m1-5-drift.png`. Pass when the API returns a 400 naming the field and CI fails on the stale generated types.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [x] Probe. None.
- [x] Baseline. None.
- [x] Rule. None.

**Review gate.** None. M1.5 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [x] Root's clean verdict at the exact head SHA.
- [x] Bugbot triage done.
- [x] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [x] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [x] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Add the database for students and sessions (M1.4)

**Status.** Done. Merged in PR 42 as `9b894d7`. M2.6 later moved the tables to `public` and the data layer to `apps/api/src/infrastructure/orm/`.

**Depends on.** M1.1, M1.5.

**Files.**

- [x] Create `supabase/config.toml`, pin the Supabase CLI as a root dev dependency, and add the `pnpm db:*` scripts to the root `package.json`.
- [x] Create `apps/api/src/database/`, `apps/api/src/students/`, and `apps/api/src/sessions/`, with DTOs for `Student`, `StudentProfile`, and `Session`.

**Build.**

- [x] Run Postgres through the local Supabase stack, and connect TypeORM to it directly with `DATABASE_URL`, with app tables in a private `app` schema that Supabase's anon key cannot reach. A hosted project later needs the environment values, TLS settings, and dashboard steps in the README. TypeORM owns the migrations, `synchronize` stays off, and nothing writes to the `auth` schema.
- [x] Name the data shapes first as entities and DTOs in `apps/api`, with `language` stored on each session so languages can be added later (PRD Q12).
- [x] Validate every request at the API boundary with the DTOs and global validation from M1.5.
- [x] Add `pnpm db:up`, `pnpm db:migrate`, and `pnpm db:seed`.

**You see.**

- [x] One command starts the local Supabase stack with Postgres, with no Supabase account, and one command builds a fresh database from migrations.
- [x] The database stores students, their profiles and interests, and their sessions, including each session's language.
- [x] A seed command creates an example student with six example sessions, matching the prototype.
- [x] The API rejects bad input with a clear error, and valid input saves and reads back the same.
- [x] CI runs the migrations against a fresh database on the same Postgres image as the local stack, and a CI run stays under 4 minutes.
- [x] No paid service is added.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `students.service.spec.ts` and `sessions.service.spec.ts` assert save and read back against a test database.
- [x] A validation test asserts that bad input is rejected. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [x] Lane 1. Regression lane against trunk. Trunk has no database, so record that and gate the end state. Build a fresh database, seed it, and read the example student through the API. Save `m1-4-api.png`. Pass when the API returns the student and six sessions.
- [x] Lane 2. Post invalid profile data, then restart the API and read saved data back. Save `m1-4-invalid.png`. Pass when the bad request returns a clear 400 error and saved data survives the restart.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [x] Probe. None.
- [x] Baseline. None.
- [x] Rule. None.

**Review gate.** None. M1.4 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [x] Root's clean verdict at the exact head SHA.
- [x] Bugbot triage done.
- [x] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [x] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [x] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Add React Query and a typed API client (M1.6)

**Status.** Done. Merged in PR 44 as `d098357`.

**Depends on.** M1.3, M1.5.

**Files.**

- [x] Create `apps/web/src/api/`, with the client, the query client defaults, and the error shape.
- [x] Create the test helper under `apps/web/src/test/`.
- [x] Edit `apps/web/src/useApiConnection.ts`, the app root, `packages/contracts/src/index.ts`, the ESLint config, and `README.md`.

**Build.**

- [x] Add `@tanstack/react-query` and `openapi-fetch`, and create one client typed from the `paths` that `packages/contracts` exports.
- [x] Create one `QueryClient` with shared defaults, and mount its provider at the app root.
- [x] Map every failed response to one `ApiError` shape, including the field messages from a validation 400.
- [x] Move `useApiConnection` onto `useQuery`, keeping its retry, stop, and timeout behavior.
- [x] Leave one place in the client where M2.3 can attach sign-in, without building sign-in here.
- [x] Add a lint rule that rejects `fetch` outside `apps/web/src/api/`.

**You see.**

- [x] The web app has one API client, typed from the generated OpenAPI types, so calling a route that does not exist or sending a wrong body fails typecheck.
- [x] React Query is set up once at the app root, with shared defaults for retries, caching, and errors.
- [x] The API connection line on Home now uses this setup and behaves as before. It keeps checking until connected, stops once connected, and gives up on a check that never answers.
- [x] A failed request gives screens one clear error shape, including which field a 400 rejected.
- [x] A direct `fetch` call outside the API client fails lint.
- [x] The README explains how to add a query and a mutation, and tests have one helper for rendering a component that uses a query.
- [x] React Query devtools appear only in development and are not in the production build.
- [x] No paid service is added.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] The tests for `useApiConnection` keep passing, covering retry, stop once connected, and timeout.
- [x] `client.test.ts` asserts the `ApiError` shape for a 400, a 500, and a network failure, and uses `@ts-expect-error` to prove that a wrong route and a wrong body fail typecheck.
- [x] A lint fixture asserts that `fetch` outside the client is rejected. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [x] Lane 1. Regression lane against trunk. Run the same restart of `pnpm dev` with a tab open at trunk and head. Save `m1-6-home.png`. Pass when the page ends on the connected message with no reload at both, and head stops checking once connected.
- [x] Lane 2. Follow the README to add a query and a mutation against a temporary DTO route, then send bad input and call a wrong route. Save `m1-6-guide.png`. Pass when the steps work as written, the screen receives the field error, and typecheck rejects the wrong route.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [x] Probe. None.
- [x] Baseline. None.
- [x] Rule. None.

**Review gate.** None. M1.6 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [x] Root's clean verdict at the exact head SHA.
- [x] Bugbot triage done.
- [x] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [x] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [x] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Build the home screen (M2.1)

**Status.** Done. Merged in PR 46 as `f492061`.

**Depends on.** M1.3, M1.4, M1.6.

**Files.**

- [x] Create `apps/web/src/home/`.
- [x] Add `GET /home` in `apps/api/src/home/`.
- [x] Add `HomeScreen` DTOs in `apps/api/src/home/`.

**Build.**

- [x] Build `HomeScreen`, `ChatBox`, `ContinueCard`, and `PickCard` from `docs/design/app-prototype/`.
- [x] Serve the screen's data from `GET /home` using the seeded student.

**You see.**

- [x] The screen matches the app prototype at laptop width in light and dark, with the main content fitting without scrolling.
- [x] The greeting uses the student's name and asks what they want to learn next.
- [x] The chat box stays pinned to the bottom, grows as the student types, and has a send button that only works with text in the box.
- [x] The chat box has controls for a photo or PDF and for talking. They show their state, and their real behavior arrives in later PRs.
- [x] The continue card shows the unfinished session and a drawing from its board.
- [x] At phone width the chat box stays docked at the bottom, and the cards stack in one column.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `ChatBox.test.tsx` asserts send is disabled when empty, that Enter sends, and that Shift plus Enter adds a line.
- [x] `home.controller.spec.ts` asserts the response shape. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [x] Lane 1. Regression lane against trunk. Trunk has an empty Home, so record that and gate the end state. Load Home at laptop width in light and dark. Save `m2-1-home.png`. Pass when it matches the prototype and the chat box sits at the bottom without scrolling.
- [x] Lane 2. Load Home at 390px and type a long question. Save `m2-1-phone.png`. Pass when the chat box stays docked and grows, the cards stack, and nothing scrolls sideways.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [x] Probe. None.
- [x] Baseline. None.
- [x] Rule. None.

**Review gate.** None. M2.1 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [x] Root's clean verdict at the exact head SHA.
- [x] Bugbot triage done.
- [x] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [x] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [x] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Add sign-in and the age gate (M2.3)

**Status.** Done. Merged in PR 47 as `e8a09ca`. M2.9 closed its follow-ups, and M2.10 replaces the email link with a code.

**Depends on.** M1.3, M1.4, M1.6.

**Files.**

- [x] Create `apps/api/src/auth/` and `apps/web/src/auth/`.
- [x] Add consent and age fields to the student DTOs and a migration.

**Build.**

- [x] Use Supabase Auth, Abel's decision on 3 November 2026, and link each student to their Supabase user ID.
- [x] Add the sign-in flow with Supabase Auth, and a development-only sign-in against the local stack, where sign-in emails land in its local inbox.
- [x] Add an API guard that verifies the Supabase token, and an ownership check at the data boundary.

**You see.**

- [x] Sign-in runs on Supabase Auth, and the API accepts only a valid Supabase token.
- [x] A student can sign in with an email link, stay signed in across a reload, and sign out. Google sign-in is wired, and its button stays hidden until Google credentials exist.
- [x] The date-of-birth question asks neutrally, and a student under 13 is stopped and cannot retry.
- [x] Every API route that holds student data requires a signed-in student, and one student cannot read another's data.
- [x] Local development works without real email or a Google account.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `age-gate.spec.ts` asserts the 13 boundary, including birthdays on the day.
- [x] `auth.guard.spec.ts` asserts anonymous and cross-student requests are refused. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [x] Lane 1. Regression lane against trunk. Trunk has no sign-in, so record that and gate the end state. Sign in with the development path, reload, and sign out. Save `m2-3-signin.png`. Pass when the student stays signed in across the reload and is refused after signing out.
- [x] Lane 2. Enter a birth date under 13, try again, then call another student's data with a valid session. Save `m2-3-gate.png`. Pass when the student is stopped and cannot retry, and the cross-student call is refused.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [x] Probe. None.
- [x] Baseline. None.
- [x] Rule. None.

**Review gate.** None. M2.3 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [x] Root's clean verdict at the exact head SHA.
- [x] Bugbot triage done.
- [x] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [x] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [x] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Move the data layer to entities and repositories (M2.6)

**Status.** Done. Merged in PR 58 as `7a55de6`.

**Depends on.** M2.1, M2.3.

**Files.**

- [x] Move `apps/api/src/database/` and each feature's entities to `apps/api/src/infrastructure/orm/`.
- [x] Create `apps/api/src/infrastructure/orm/repositories/` with one repository per aggregate and a `repository.module.ts`.
- [x] Edit each feature's service and module, the ESLint config or a spec for the check, and `README.md`.

**Build.**

- [x] Read `clique-cloud`'s `apps/backend/src/infrastructure/orm/` and copy its layout, naming, and how services use repositories. It uses Sequelize, so keep only the structure.
- [x] Move data access from services into named repository methods, and keep mapping to response DTOs in services, so no entity reaches a response.
- [x] Have `pnpm db:migration <name>` bring the database up to date and generate into the migrations folder, and discover entities and migrations by path in place of the hand-kept lists.
- [x] Add the check that keeps TypeORM's repository API inside `infrastructure/orm`.
- [x] Read `servease`'s `apps/backend/src/infrastructure/orm/policy-helper.ts`, whose helper each migration calls by hand. Have the generator add it, so nobody has to remember.

**You see.**

- [x] Entities live in `apps/api/src/infrastructure/orm/entities/`, repositories in `apps/api/src/infrastructure/orm/repositories/`, and migrations in `apps/api/src/infrastructure/orm/migrations/`, following `clique-cloud`'s layout. The API stays on TypeORM.
- [x] Services call named repository methods, and only repositories use TypeORM. A check fails if TypeORM's repository API is used anywhere else.
- [x] `pnpm db:migration <name>` generates a migration from entity changes, with no SQL written by hand, and a new entity or migration is found with no list to edit.
- [x] A test or CI step fails when an entity changes with no migration.
- [x] Every table, present and future, has row security on with no policies, as Abel ruled on 3 November 2026. `pnpm db:migration` adds it to each new table, and a test fails on any table without it.
- [x] Tables move from the private `app` schema to `public`, and the API still reads and writes them. Supabase's anon key reads and changes no row, and the PR records what that key can still see, such as table names.
- [x] Every API route answers exactly as before, and students see no change.
- [x] The README explains how to add an entity, a repository, and a migration.
- [x] No paid service is added.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] The existing service, route, drift, and schema specs keep passing with their behavior unchanged.
- [x] A new spec asserts that a planted use of TypeORM's repository outside `infrastructure/orm` fails the check. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [x] Lane 1. Regression lane against trunk. Send the same requests to every API route at trunk and head, signed in as the same student. Save `m2-6-api.png`. Save `m2-6-api.png`. Pass when status and body match on every route, and Home and sign-in look the same.
- [x] Lane 2. Follow the README to add a real temporary entity, a repository, and a column, and generate the migrations. Save `m2-6-migration.png`. Save `m2-6-migration.png`. Pass when the steps work as written, nothing is edited by hand, the migrations apply on a fresh database, and the new table stays closed to Supabase's anon key.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [x] Probe. None.
- [x] Baseline. None.
- [x] Rule. None.

**Review gate.** None. M2.6 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [x] Root's clean verdict at the exact head SHA.
- [x] Bugbot triage done.
- [x] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [x] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [x] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Give API calls 30 seconds (M2.7)

**Status.** Done. Merged in PR 55 as `a0f5fc7`.

**Depends on.** M2.1.

**Files.**

- [x] Edit `apps/web/src/api/requestTimeout.ts`, `apps/web/src/api/queryClient.ts`, `apps/web/src/home/useHomeScreen.ts`, and their tests.

**Build.**

- [x] Raise the default limit, remove Home's own, and stop retrying a request that timed out, while a caller's own abort and a quick failure keep their behavior.

**You see.**

- [x] Every API call waits up to 30 seconds, with one limit in one place, and Home no longer sets its own.
- [x] A call that reaches the limit does not retry by itself, so a student sees the failure line about 30 seconds after a hung request starts, and Try again works.
- [x] A server or network failure that comes back quickly still retries as it does today.
- [x] An API that takes 5 seconds to answer loads Home's cards on the first try.
- [x] No paid service is added.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Specs cover the limit, no retry after a timeout, and a retry after a quick failure. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. One lane on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [x] Lane 1. Run the web app against a proxy that hangs, then one that answers after 5 seconds. Save `m2-7-timeouts.png`. Save `m2-7-timeouts.png`. Pass when the hung API shows the failure line at about 30 seconds and Try again works, and the slow API loads the cards with no failure line.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [x] Probe. None.
- [x] Baseline. None.
- [x] Rule. None.

**Review gate.** None. M2.7 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [x] Root's clean verdict at the exact head SHA.
- [x] Bugbot triage done.
- [x] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [x] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [x] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Add sample Terms and Privacy pages (M2.8)

**Status.** Done. Merged in PR 57 as `d70429c`. From here on, any PR that changes what is stored, who receives data, or what happens to an under-13 account edits `LEGAL_PAGES` in the same PR.

**Depends on.** M2.3.

**Files.**

- [x] Create the two pages under `apps/web/src/`, and edit the router, the sign-in page, and their tests.

**Build.**

- [x] Check each statement against the code and `docs/architecture/live-session.md`, and list in the PR each statement with where it is true.

**You see.**

- [x] `/terms` and `/privacy` open without signing in, at laptop and phone width, in both themes, following `docs/DESIGN.md`.
- [x] The words on the sign-in page link to them, by keyboard and screen reader too, and opening one does not lose what the student typed.
- [x] Each page says at the top that it is a draft a lawyer has not yet reviewed.
- [x] Every statement about the app is true of what it does today, including what is stored, what happens to an under-13 account, and which outside services receive data. Anything planned is labeled as planned.
- [x] The text sits in one place, so a lawyer's edits change one file.
- [x] No paid service is added.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] A spec covers the links, the routes signed out, and the draft line on each page. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. One lane on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [x] Lane 1. Open both pages signed out from the sign-in page, at both widths and in both themes, using only the keyboard. Save `m2-8-legal.png`. Save `m2-8-legal.png`. Pass when both pages read well, say they are drafts, and what the student typed is still there on return.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [x] Probe. None.
- [x] Baseline. None.
- [x] Rule. None.

**Review gate.** None. M2.8 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [x] Root's clean verdict at the exact head SHA.
- [x] Bugbot triage done.
- [x] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [x] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [x] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Add the library of pre-made picks (M2.2)

**Status.** Done. Merged in PR 60 as `64b890b`. It shipped 48 topics.

**Depends on.** M1.4, M2.1, M2.6.

**Files.**

- [x] Create `apps/api/src/picks/` with `library.json`.
- [x] Add images under `apps/web/public/picks/`.
- [x] Create `docs/credits.md`.

**Build.**

- [x] Write the library as data, not code.
- [x] Add a pure function `getPicksForStudent` that filters by level and scores by interests.
- [x] Record every image's source in `docs/credits.md`.

**You see.**

- [x] The library holds at least 30 topics across math, physics, chemistry, computer science, and a few curiosity subjects.
- [x] Every card has a title, a subject, a length, an opening line, and a normal image or one of our own drawings.
- [x] Home shows six cards that fit the student's level and interests, and each states its reason.
- [x] Two different students see visibly different cards.
- [x] Every image is public domain or our own, with its source recorded, and no game, film, or team images appear (PRD Q16).

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `getPicksForStudent.spec.ts` asserts level filtering, interest scoring, and a stated reason on every card.
- [x] A data test asserts every library entry is complete and every image file and credit exists. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [x] Lane 1. Regression lane against trunk. Trunk shows seeded cards only, so record that and gate the end state. Load Home as a seeded basketball student. Save `m2-2-basketball.png`. Pass when six cards appear, each with a picture and a reason.
- [x] Lane 2. Load Home as a seeded student with different interests and level. Save `m2-2-other.png`. Pass when the cards differ from lane 1 and their reasons match this student.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [x] Probe. None.
- [x] Baseline. None.
- [x] Rule. None.

**Review gate.** None. M2.2 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [x] Root's clean verdict at the exact head SHA.
- [x] Bugbot triage done.
- [x] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [x] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [x] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Finish sign-in with the Back fix, the password trigger, and the one-day mark (M2.9)

**Status.** Done. Merged in PR 59 as `24b652b`.

**Depends on.** M2.3.

**Files.**

- [x] Create `supabase/hosted/blank-passwords.sql` and `apps/web/src/auth/signUpStop.ts`.
- [x] Edit `apps/web/src/auth/`, `apps/web/src/strings.ts`, `README.md`, and `supabase/templates/email-change.html`.

**Build.**

- [x] Post a message with its own name on the session channel, not a real `SIGNED_OUT`, because `SIGNED_OUT` reloaded a tab that had just signed in a second student.
- [x] Use a one-day cookie for the mark, because Abel asked for a mark with no date, and the browser keeps the day.
- [x] Check the stop on the email step and in the gate, so an address that signed up earlier is caught too.

**You see.**

- [x] Every path that ends a session through `restartAppAtHome` posts one message on the client's `astra-session` channel, so Chromium drops the kept page and Back shows no student frame.
- [x] A database trigger blanks passwords at Auth, shipped as SQL with a step in the hosted checklist. The README says hosted is untested.
- [x] When an account closes, a plain browser mark holding no name, address, or date stops the next new sign-up on that browser for a day, with the same neutral message.
- [x] The flaky focus test in `SignInPage.test.tsx` no longer fails.
- [x] The README, feature file, and email template lines named in issue #56 are true.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] A test fails without the post on the session channel.
- [x] `signUpStop.test.ts` covers the mark and the neutral message. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [x] Lane 1. Open a signed-in tab, end the session, and press Back in another tab on the served build, headed and headless, at full speed and throttled. Save `m2-9-back.png`. Pass when the page loads new with `persisted` false and no student frame, 28 of 28 runs.
- [x] Lane 2. On a private Auth with the trigger, try every way to set a password, then close an account and try a new address in the same browser. Save `m2-9-trigger.png`. Pass when every password sign-in fails, email links still work, and the new sign-up meets the neutral message.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [x] Probe. None.
- [x] Baseline. None.
- [x] Rule. None.

**Review gate.** None. M2.9 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [x] Root's clean verdict at the exact head SHA.
- [x] Bugbot triage done.
- [x] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [x] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [x] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Bring CI's time down without weakening a check (M1.7)

**Status.** Done. Merged in PR 64 as `b8ff4b6`. It had no plan id when it ran, so this plan gives it M1.7. Its issue is #63.

**Depends on.** M1.1.

**Files.**

- [x] Edit `.github/workflows/ci.yml` and one sentence of `README.md`.

**Build.**

- [x] Run the tests of every package except the API in a background step right after typecheck.
- [x] Run the API's tests as their own step once the database is ready, and fail `checks` at the end of the job if the background step failed.
- [x] Keep `--filter '!astra'`, and leave the Postgres image cache out. Issue #74 adds that cache later.

**You see.**

- [x] The `checks` job takes clearly less time than the 3m56s baseline, read from the job's own start and end times.
- [x] `timeout-minutes` stays at 4, and one job named `checks` stays the single signal for a merge.
- [x] Every check that ran before still runs on every PR, and a failure in any check still fails the PR.
- [x] A planted failing test and a planted lint error each turn CI red, and neither is in the final head.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Planted failures in a web test, a lint rule, and an API test each turned `checks` red on temporary commits.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. One lane on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [x] Lane 1. Compare the job and each step before and after, dividing by `api:types`, lint, and typecheck, because the same steps vary by about 50% between runners. Save `m1-7-times.png`. Pass when the job's time drops at equal runner speed and no check is missing.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. The time of the `checks` job.
- [x] Probe. Read the job's start and end times before and after, on equal runner speed.
- [x] Baseline. 236 s before this PR.
- [x] Rule. It measured 208 s, a margin of 22 to 32 s on a slow runner. That still misses the standing order of under 3 minutes, so Appendix E holds the next step.

**Review gate.** None. M1.7 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [x] Root's clean verdict at the exact head SHA.
- [x] Bugbot triage done.
- [x] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [x] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [x] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Design the live session and get Abel's approval (M3.1)

**Status.** Done. Merged in PR 48 as `30a9094`. Abel's later decisions are corrected in the document itself.

**Depends on.** M1.4.

**Files.**

- [x] Create `docs/architecture/live-session.md` and `docs/architecture/live-session-proofs/`.
- [x] Add `Beat`, `Cue`, `SceneCommand`, and `SessionEvent` to `packages/contracts/`, with runtime parsers and not only types, with `"type": "module"`, `.ts` imports, and `allowImportingTsExtensions` in its and the web app's `tsconfig.json`.
- [x] Add the `theme/no-vendor-imports` lint rule.

**Build.**

- [x] Run `/pstack:architect` with a checkpoint, as `CLAUDE.md` requires for architectural decisions.
- [x] Stop for Abel's review, add the `needs-human-review` label, and send a push notification.
- [x] Prove the Node SDK facts by running small scripts, and record the results in the document.

**You see.**

- [x] A design document explains the live session in plain language, with one diagram of what runs where.
- [x] It defines the scene language, the beats that pair spoken words with drawing, and the session log, as real types in `packages/contracts`.
- [x] It confirms whether LiveKit's Node SDK handles interruption, turn detection, and word timing as well as the Python one, and it recommends a language for the agent.
- [x] It sets a time budget for each step between the student stopping and the tutor's first sound.
- [x] Abel has reviewed the design and approved it before any live-session code is written.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `scene-language.test.ts` asserts that valid beats parse and that invalid beats are rejected. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [x] Lane 1. Regression lane against trunk. Trunk has no live-session design, so record that and gate the end state. Run the Node SDK scripts the document cites. Save `m3-1-sdk.png`. Pass when each claim in the document matches a recorded run.
- [x] Lane 2. Encode the sample session from PRD section 6.4 as beats using only the new types. Save `m3-1-beats.png`. Pass when the whole sample encodes and parses with no missing command.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [x] Probe. None.
- [x] Baseline. None.
- [x] Rule. None.

**Review gate.** None. M3.1 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [x] Root's clean verdict at the exact head SHA.
- [x] Bugbot triage done.
- [x] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [x] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [x] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Build onboarding (M2.4)

**Status.** Done. Merged in PR 62 as `ae23bcc`. Abel simplified it on 4 November 2026, and this section matches what merged. M2.11 later replaced the sheet with the star chart.

**Depends on.** M2.1, M2.3, M2.6.

**Files.**

- [x] Create `apps/web/src/onboarding/`.
- [x] Edit `apps/web/src/auth/`, `apps/web/src/shell/`, `apps/web/src/strings.ts`, `apps/api/src/picks/`, and `apps/api/src/students/`, with a generated migration that removes consent and voice.
- [x] Create `.claude/skills/verify/features/onboarding.md` and the `onboarding` journeys.

**Build.**

- [x] Build the steps as one table in `apps/web/src/onboarding/steps.ts`, so the order comes from data.
- [x] Remove the parent consent link, its table and routes, the browser voices, and the scripted first exchange, as Abel ruled on 4 November 2026. This overrides PRD Q4 and section 6.1, and the lawyer reviews it before real students.
- [x] Keep the date of birth and the under-13 closed rule exactly, because Abel did not ask to remove them.
- [x] Edit `LEGAL_PAGES` so it says what is stored and that no parent is asked or contacted.

**You see.**

- [x] The sign-in page says "A learning app, made for you" and states that the tutor is an AI.
- [x] Each screen asks one thing, in this order. Name, date of birth, class level, interests as a multi-select, a goal picked with one tap, then Home.
- [x] The sheet shows the student's name as they type and fills in with each answer.
- [x] A student under 13 in every time zone stops at the closed page and cannot retry.
- [x] A student under 18 takes the same path as anyone else, and nothing asks for a parent, a voice, or a first question.
- [x] All answers are saved to the student's profile and can be changed under Your notes.
- [x] Home says "Welcome, <name>." until the student starts a session, and its cards come from these answers, with reasons that name only what they chose.
- [x] A first-time student reaches Home in under a minute at a student's pace.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `steps.test.ts` asserts the order and the resume step.
- [x] `OnboardingFlow.test.tsx` and `students.controller.spec.ts` assert the saved answers and that an under-18 student needs no parent. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [x] Lane 1. Regression lane against trunk. Trunk has no onboarding, so record that and gate the end state. Run `ONBOARDING_PACE_MS=4000 pnpm verify drive --journey onboarding` at laptop width. Save `m2-4-adult.png`. Pass when the sheet fills in, Home says the student's name, and the tagline to Home takes under a minute.
- [x] Lane 2. Run `onboarding-long-name` as a 15-year-old at 390px, then `onboarding-under-13`. Save `m2-4-minor.png`. Pass when the 15-year-old meets no parent step and a session starts with 201, nothing scrolls sideways, and the under-13 account stops at the closed page after a reload too.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [x] Probe. None.
- [x] Baseline. None.
- [x] Rule. None.

**Review gate.** None. M2.4 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [x] Root's clean verdict at the exact head SHA.
- [x] Bugbot triage done.
- [x] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [x] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [x] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Start sessions and list them (M2.5)

**Status.** Done. Merged in PR 61 as `2da9167`.

**Depends on.** M2.1, M2.3, M2.6.

**Files.**

- [x] Create `apps/web/src/session/` and `apps/web/src/sessions/`.
- [x] Extend `apps/api/src/sessions/` and `apps/web/src/api/`.

**Build.**

- [x] Add `POST /sessions`, `GET /sessions` with search and an offset, `GET /sessions/:id`, and `PATCH /sessions/:id`, each filtered on the student from the token.
- [x] Move the full-stop and fade from `docs/design/app-prototype/` into `apps/web/src/session/opening.ts`, and tie a page's fade to that page in `useLeavePage.ts`.
- [x] Put the session route, `/sessions/:sessionId`, outside `AppShell`, because `AppShell` keys its page on the path and M3.10's live session must not remount.
- [x] Create the session record before the fade, so a refresh keeps the session.
- [x] Edit `LEGAL_PAGES` so it says a sent question is stored as a session title.

**You see.**

- [x] Sending a question makes the tutor's dot land where the full stop would be, and the page fades into the session screen.
- [x] Selecting a card starts a session on that topic straight away.
- [x] The session screen shows the board area, the tutor's dot, and a reply box, with stand-in content until M3.10.
- [x] The Sessions page lists every session, newest first, with its title, subject, date, length, and status, and search filters the list.
- [x] The sidebar's Recent list and the continue card show real sessions, and a new student sees a clear empty state.
- [x] Ending a session marks it finished and returns to Home.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `sessions.controller.spec.ts` asserts ordering, search, and ownership.
- [x] `opening.test.ts` asserts the full-stop position on one line and on a wrapped line. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [x] Lane 1. Regression lane against trunk. Trunk has no real sessions, so record that and gate the end state. Send a typed question, end the session, and open Sessions. Save `m2-5-list.png`. Pass when the new session is first in the list and in Recent, and is marked finished.
- [x] Lane 2. Start from a card, refresh during the session, then search for it from Sessions. Save `m2-5-card.png`. Pass when the refresh keeps the session and search finds it.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [x] Probe. None.
- [x] Baseline. None.
- [x] Rule. None.

**Review gate.** None. M2.5 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [x] Root's clean verdict at the exact head SHA.
- [x] Bugbot triage done.
- [x] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [x] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [x] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Sign in with an email code, in the made-of-dots look (M2.10)

**Status.** Done. Merged in PR 75 as `ff3ad32`. Issue #67. M2.11 later moved sign-in to the look Abel chose after this one, 1 + 4.

**Depends on.** M2.3, M2.9.

**Files.**

- [x] Create `apps/web/src/ui/`, with the shared components, and `DotStage` with its text-to-dots function.
- [x] Edit `apps/web/src/auth/`, `apps/web/src/strings.ts`, `packages/theme/`, `supabase/config.toml`, `supabase/templates/`, `README.md`, and the verify features and journeys.
- [x] Edit the Motion and Dot sections of `docs/DESIGN.md`, because Abel chose this look. Pictures stay normal images.

**Build.**

- [x] Use the Supabase client's `signInWithOtp` and `verifyOtp` with `type: 'email'`, reading the installed `supabase-js` and not memory, and delete the link's sign-in path if nothing else needs it. The email change flow keeps its own link.
- [x] Measure guesses per hour against one address on a private Auth, from one source and from several, and whether a new code resets anything. Recommend a shorter expiry for the hosted checklist than the local 3600 s.
- [x] Build the dot background and shape as one reusable piece, `DotStage`, because M2.11 uses it next, without building onboarding's steps here.
- [x] Keep the date of birth confirm step, Abel's age rules, and neutral wording exactly, and keep the one-day mark and the password trigger.
- [x] Add a hosted checklist line for the email template, because a hosted project keeps its own.

**You see.**

- [x] A student enters an email, receives a 6-digit code by email, and types it to sign in. No link opens the session. Paste works, the phone offers the code from the keyboard, and it submits at the sixth digit.
- [x] Wrong and expired codes get calm, plain messages. Resend has a visible wait. Guessing a code is limited, measured, and stated in the README.
- [x] Tokens from a code are accepted, and password and anonymous tokens are still refused outside development. One student never reaches another's data.
- [x] The sign-in page is one calm page, not two halves, with a still dot grid that fades around the question, a dot shape beside it, and the tutor's line typing out with the dot pulsing before the field appears.
- [x] Proper shared components exist for the text field, the code field, the date of birth field, buttons, and chips, from tokens, in both themes and at phone width, by keyboard and screen reader.
- [x] Reduced motion shows everything at once. The page holds its frame rate on an emulated phone, and is still when nothing has a cause to move.
- [x] The email template shows the code clearly in our wording. The README, hosted checklist, feature files, journeys, and `LEGAL_PAGES` are true of what runs.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] The code field's tests cover paste, moving between boxes, and submitting at the sixth digit.
- [x] The API's token tests accept a code's token and refuse password and anonymous tokens outside development. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [x] Lane 1. Regression lane against trunk. Trunk signs in with a link, so record that and gate the end state. Sign in with a code read from the local inbox at laptop and phone width, in both themes, typing it once and pasting it once. Save `m2-10-code.png`. Pass when the student moves on at the sixth digit and no link opens a session.
- [x] Lane 2. Try a wrong code, an expired code, a code used twice, a resend during the wait, a closed account, and a new address under the one-day mark. Save `m2-10-wrong.png`. Pass when each gets its calm message, and the closed account and the mark still stop a new sign-up.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Frames per second while the dot shape forms, and the page's work at rest.
- [x] Probe. Record frame timing on an emulated phone with CPU throttling, with a smaller dot count and lower pixel ratio where needed.
- [x] Baseline. Trunk has no dot stage, so these absolute budgets apply.
- [x] Rule. Fail if the shape forms below 30 fps on the throttled phone, or if the page keeps drawing when nothing has a cause to move.

**Review gate.** None. M2.10 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [x] Root's clean verdict at the exact head SHA.
- [x] Bugbot triage done.
- [x] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [x] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [x] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Bring sign-in and onboarding into the 1 + 4 look (M2.11)

**Status.** Done. Merged in PR 83 as `7099f67`.

**Depends on.** M2.4, M2.10.

**Files.**

- [x] Edit `apps/web/src/onboarding/`, `apps/web/src/auth/`, `apps/web/src/ui/`, and `apps/web/src/strings.ts`.
- [x] Add the interest drawings next to `apps/web/src/home/lineDrawings.tsx`, and a row for each in `docs/credits.md`.
- [x] Edit the dot pages section of `docs/DESIGN.md`, because Abel chose this look.

**Build.**

- [x] Reuse `DotStage`, its text-to-dots function, and the shared components from M2.10, and build no second copy.
- [x] Follow Abel's sample, `Option6SaturnChart.dc.html`, and rebuild it in React and Tailwind with tokens.
- [x] Draw the chips' pictures from the same strokes and sizes as `lineDrawings.tsx`, and read those drawings before drawing a new one.
- [x] Keep the answers and Your notes as M2.4 left them, and remove the sheet.

**You see.**

- [x] Sign-in, onboarding, and the account notices are one calm page on `DotStage`, with a dotted Saturn on a star chart on a still dot grid, in both themes and at phone width.
- [x] The first line reads "Welcome, I am Astra, your personal AI tutor." The student signs in with a 6-digit email code. The email step draws the chart's first leg, and each digit draws the next.
- [x] The tutor's line types out in Newsreader beside the small pulsing dot, then the field appears, one question at a time.
- [x] The student's name forms in dots as they type, the chart's title takes it, and the next line says "Welcome, <name>."
- [x] Picking an interest lights a labelled star on the chart.
- [x] There is no sheet beside onboarding, because the chart replaces it.
- [x] Interests are chips from `apps/web/src/ui/`, each with a small SVG picture matched to the look of Home's card drawings, in both themes. This adds no new ink style.
- [x] The steps stay name, date of birth, class level, interests, and a goal, then a Start button opens Home. A student under 13 still stops at the closed page.
- [x] Reduced motion shows everything at once, a browser with no canvas still gets a working page, and the page is still when nothing has a cause to move.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] A test asserts that every interest in `STUDENT_INTEREST_LABELS` has a drawing and a shape.
- [x] `OnboardingFlow.test.tsx` keeps passing with the new screens, with reduced motion stubbed. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [x] Lane 1. Regression lane against trunk. Run the sign-in and onboarding journey at trunk and head at laptop width in light and dark. Save `m2-11-laptop.png`. Pass when head shows the dotted Saturn on the star chart, the first line, the typed line, the name in dots, and the chips with drawings, with no sheet, the answers saved match trunk's, and the student lands on Home.
- [x] Lane 2. Run it at 390px with reduced motion, then again with canvas blocked. Save `m2-11-phone.png`. Pass when everything shows at once with reduced motion, the page still works with no canvas, and nothing scrolls sideways.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Frames per second while a name forms and a shape changes.
- [x] Probe. Record frame timing on an emulated phone with CPU throttling while typing a 20-character name.
- [x] Baseline. M2.10's measurement on the same machine.
- [x] Rule. Fail if it falls below 30 fps on the throttled phone.

**Review gate.** None. M2.11 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [x] Root's clean verdict at the exact head SHA.
- [x] Bugbot triage done.
- [x] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [x] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [x] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Recommend from session history (M2.12)

**Status.** Done. Merged in PR 77 as `54d83aa`.

**Depends on.** M2.5.

**Files.**

- [x] Edit `apps/api/src/picks/getPicksForStudent.ts`, `pick-reasons.ts`, and `library.json`.
- [x] Edit `apps/api/src/home/`, `apps/api/src/sessions/`, and `apps/web/src/session/useStartSession.ts`.
- [x] Add a generated migration under `apps/api/src/infrastructure/orm/migrations/`, and a method on `SessionRepository`.

**Build.**

- [x] Store the topic's id on a session started from a card, because at PR 61's head a session holds only its title, subject, and artwork, and matching on a title is not reliable.
- [x] Do the ranking in `rankForStudent`, keeping it a pure function that takes the student's fit and their session history.
- [x] Add each subject's topic order to `library.json` as data, so "next" is written down and not guessed.
- [x] Change no picture, drawing, card style, or credit line, as Abel corrected on 4 November 2026.

**You see.**

- [x] A topic the student finished no longer appears among Home's cards.
- [x] A topic in progress appears as a card to carry on, with a reason that says so.
- [x] When a student has done a topic in a subject, the next topic in that subject is suggested, with a reason that names what they did.
- [x] Every reason is true of that student's own sessions, and only that student's sessions feed their cards.
- [x] A student with no sessions sees what they see today.
- [x] The cards' styling and pictures do not change. New topics use the same mix of pictures and drawings.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `getPicksForStudent.spec.ts` gains cases for finished, in progress, next topic, no history, and a true reason on each card.
- [x] A sessions spec asserts that another student's sessions never change a card. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [x] Lane 1. Regression lane against trunk. Seed a student with one finished session, one in progress, and one finished topic with a next topic, then load Home at trunk and head. Save `m2-12-history.png`. Pass when head leaves out the finished topic, offers to carry on, and suggests the next topic with a true reason, and trunk does none of these.
- [x] Lane 2. Load Home as a new student and as a second student with different sessions, at 390px. Save `m2-12-other.png`. Pass when the new student's cards match trunk's, the second student's reasons match their own sessions, and the pictures look the same.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [x] Probe. None.
- [x] Baseline. None.
- [x] Rule. None.

**Review gate.** None. M2.12 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [x] Root's clean verdict at the exact head SHA.
- [x] Bugbot triage done.
- [x] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [x] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [x] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Make the board move in time with speech (M3.2)

**Status.** Done. Merged in PR 76 as `0bc6e61`. Abel then kept Chris on Flash. Its follow-ups are in Appendix E.

**Depends on.** M3.1, M1.3.

**Files.**

- [x] Create `packages/board/src/player/`.
- [x] Create `apps/agent/`, with `src/providers/elevenlabs.ts`, `src/providers/choose.ts`, and `src/live/`.
- [x] Create `apps/web/src/lab/` for a development-only test page.
- [x] Create `docs/tests/scene-player.md`, and edit `LEGAL_PAGES` in `apps/web/src/strings.ts`.

**Build.**

- [x] Build `providers/elevenlabs.ts` behind `VoiceAdapter` on `@livekit/agents-plugin-elevenlabs`. Abel approved the vendor, and the key is in the keys file as `ELEVENLABS_API_KEY`, so the adapter passes `apiKey` itself. Use test text only, with the training opt-out on.
- [x] Use Chris, ElevenLabs voice id `iP95p4xoKVk53GoZ742B`, kept in one place in `providers/choose.ts`. Check that voice for overlong audio on a larger sample on the real path, because Casey's first 12 tries on the worst line had none and Eric's did.
- [x] Start on Flash, measure Flash and Turbo the same way, and bring Abel the clips and numbers. Only the choice of model and the flush rule wait for Abel. Abel then kept Flash as the default. v4 Turbo is out, because it needs the dialogue socket, restarts its word times at 0 in each message, and 119 of 274 messages had none.
- [x] Build `ScenePlayer` so board state comes from a log of the events that actually played, through one function, `rebuildBoard(log, atMs)`, which flattens events by time and not by sequence number.
- [x] Let a scene be any deterministic function of the clock, with named parts and named moments, and do not bake in only the planned 2D kinds, because M3.14 plugs in here.
- [x] Drive cues from the worklet clock over real WebRTC, counting samples from the turn's first sound. The one exception to "never from timers" is the fallback when audio cannot run.
- [x] Carry the proofs' clock fixes into real code. Lateness adds up, an opened gap always closes, and the hold has a bound. Add the small publisher that sends `audioGap`.
- [x] Prove the browser's mute, send `questionHeard`, count words only while there is sound, and fire cues behind the per-block gate.
- [x] Measure everything under "What M3.2 and M3.6 must measure again" in `docs/architecture/live-session.md`. Word times with near zero lead, which is the main open risk to the clock. Dropping queued audio on stop, because `close_context` does not cancel. Zeroing the clock for 0 to 75 ms of leading silence. Opening the socket before the first turn, because a new one costs about 420 ms. `preferredAlignment` and numbers such as "2.5". Word time noise, stall reads on real chunk sizes, and the first audio step from the agent's region.
- [x] Take the M3.2 rows under "Follow-ups, with owners" and "For later owners" in that document, including an early-ended voice stream.
- [x] Record the measured numbers in `docs/tests/scene-player.md`, as PRD test 1 requires.

**You see.**

- [x] A scripted lesson plays in the browser in Chris's voice on ElevenLabs, over real WebRTC through a local LiveKit server, and drawings appear as the matching words are spoken.
- [x] Each drawing starts within 100 ms of its word, and a turn's first drawing appears within one second of its first word.
- [x] From the agent's decision to stop, the audio is silent and the board frozen within 150 ms, as decision 3 in `docs/architecture/live-session.md` reads V2, and resuming continues with the board still correct.
- [x] The same lesson replays exactly from its saved log, with no stored video.
- [x] A scene can be any deterministic function of the clock. A test scene computed only from time seeks, rewinds, and replays exactly.
- [x] Abel hears the voice on Flash and on Turbo as clips, and chooses the model from them and the measured numbers.
- [x] Each measure below is recorded in `docs/tests/scene-player.md`.
- [x] If any target is missed, the PR stops and reports the measured numbers to Abel before more board work starts.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `player.test.ts` asserts that cues fire on their words with a fake audio clock, that a stop discards unplayed cues and queued audio, and that replaying a log rebuilds identical state.
- [x] A test scene computed from time alone gives the same frame at any seek point.
- [x] The ElevenLabs adapter passes `provider-suite.ts` on a new fake of its wire. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [x] Lane 1. Regression lane against trunk. Trunk has no player, so record that and gate the end state. Play the scripted lesson on the lab page in the chosen voice, on Flash and on Turbo, on a real network profile, and record it. Save `m3-2-lesson.png`. Pass when every drawing appears on its word in the recording, on both models.
- [x] Lane 2. Interrupt the lesson at five different points and resume each time, then replay the log and compare. Save `m3-2-interrupt.png`. Pass when audio and board stop together each time, the board stays correct after resuming, and the replay matches what played.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. The drift between a word's audio start and its drawing's start, on cues really fired, the time from the decision to stop to silence and a frozen board, and first audio on Flash and on Turbo.
- [x] Probe. Log all three from the player during the scripted lesson on a mid-range laptop and at phone width with CPU throttling.
- [x] Baseline. Trunk has no player, so these absolute budgets apply. The speed test gave first audio at 253 and 319 ms on Flash, and 335 and 531 ms on Turbo, from Abel's Mac.
- [x] Rule. Fail if p95 drift exceeds 100 ms or p95 stop time exceeds 150 ms. First audio has no limit here, and it goes to Abel with the clips.

**Review gate.** None. M3.2 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [x] Root's clean verdict at the exact head SHA.
- [x] Bugbot triage done.
- [x] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [x] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [x] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Draw math on the board (M3.3)

**Status.** Done. Merged in PR 81 as `c9c4d33`.

**Depends on.** M3.2.

**Files.**

- [x] Create `packages/board/src/math/` and `packages/board/src/ink/`.
- [x] Create `packages/board/src/layout/`.

**Build.**

- [x] Render math with KaTeX with `trust: false`, render text as text and never as HTML, keep names in Maps, and give each term a stable id for transforms.
- [x] Add `writeMath`, `transformMath`, and `highlight` to the player, using the parsers in `packages/contracts`, along with `reveal` and `overWords`.
- [x] Evaluate plots from `parsePlotExpression`'s tree with `evaluatePlotExpression`, with no `eval`.
- [x] Build the layout engine that places every element, so the model only names what to show.
- [x] Settle M3.3's row under "Open, with an owner" in `docs/architecture/live-session.md`, shading an area under a curve and a named constant on a curve, and stop huge `\rule` values and macro bombs.

**You see.**

- [x] The tutor can write an equation, highlight one term, and move a term so the equation rearranges smoothly.
- [x] Fractions, exponents, roots, and matrices all render correctly in both themes.
- [x] Equations place themselves, so the tutor never positions anything and nothing overlaps.
- [x] Text and diagrams can be written with a natural handwriting-style stroke.
- [x] A model's text can never run as HTML or script on the board.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `transformMath.test.ts` asserts that matching terms keep their ids.
- [x] `layout.test.ts` asserts that no two placed elements overlap.
- [x] A test asserts that a command holding HTML or a macro bomb renders as text or is refused. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [x] Lane 1. Regression lane against trunk. Trunk has no math, so record that and gate the end state. Play a scripted algebra lesson on the lab page in light mode. Save `m3-3-algebra.png`. Pass when each step rearranges term by term and is readable.
- [x] Lane 2. Play a dense lesson with fractions and matrices in dark mode at 390px. Save `m3-3-dense.png`. Pass when nothing overlaps, clips, or overflows.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [x] Probe. None.
- [x] Baseline. None.
- [x] Rule. None.

**Review gate.** None. M3.3 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [x] Root's clean verdict at the exact head SHA.
- [x] Bugbot triage done.
- [x] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [x] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [x] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Draw graphs, geometry, and real motion (M3.4)

**Status.** Not merged.

**Depends on.** M3.2.

**Files.**

- [ ] Create `packages/board/src/plot/`, `packages/board/src/geometry/`, and `packages/board/src/motion/`.

**Build.**

- [ ] Add `plot`, `numberLine`, `geometry`, `vector`, and `simulate` commands to the player, along with `setParameter`, `seek`, `until`, and `overWords`.
- [ ] Write the simulation models as pure functions with named parameters, with ranges from `SIMULATION_MODELS`, so a ball always lands.
- [ ] Add sliders for simulation parameters (PRD Q11).
- [ ] Settle M3.4's row under "Open, with an owner" in `docs/architecture/live-session.md`, a launch angle slider, a playback rate with no word to aim at, number readouts that follow a quantity, and `overWords` when later word times have not arrived. Decide what goes with a hidden `simulate`.

**You see.**

- [ ] The tutor can plot a function, mark points on a number line, and build a geometry figure step by step.
- [ ] The tutor can draw vectors and free-body diagrams.
- [ ] The jump shot arc is computed from real physics, so its shape is correct by calculation.
- [ ] Motion lands on a word, and can play until a moment such as the peak and hold there.
- [ ] A student can drag a slider, and the motion responds straight away.
- [ ] All plotted values come from computation in code, never from the model's text.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `projectile.test.ts` asserts range and peak against worked answers.
- [ ] `plot.test.ts` asserts sampling near discontinuities. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [ ] Lane 1. Regression lane against trunk. Trunk has no graphs, so record that and gate the end state. Play the jump shot sample from PRD section 6.4 on the lab page. Save `m3-4-shot.png`. Pass when the arc and arrows match the script, and the board responds to the words.
- [ ] Lane 2. Drag the sideways speed slider to double it. Save `m3-4-slider.png`. Pass when the ball lands twice as far, matching the calculation.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [ ] Probe. None.
- [ ] Baseline. None.
- [ ] Rule. None.

**Review gate.** None. M3.4 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Add live voice (M3.6)

**Status.** Not merged. Issue #15 keeps its older wording, and this section leads.

**Depends on.** M3.2.

**Files.**

- [ ] Extend `apps/agent/`, with `src/providers/meta.ts`, its own `ttsNode`, and `provider-suite.ts` moved here so CI runs it.
- [ ] Create `apps/web/src/voice/` and `apps/api/src/livekit/`.
- [ ] Create `docs/tests/voice.md`, and edit `LEGAL_PAGES` in `apps/web/src/strings.ts`.

**Build.**

- [ ] Build `providers/meta.ts` behind `TranscriberAdapter` on `@livekit/agents-plugin-meta`, pinned to a Standard Model name. Abel approved Muse on 3 November 2026 and kept it after a real microphone test. Keep Nova-3 reachable behind the adapter.
- [ ] Run through LiveKit Cloud with our own accounts, not Inference, on a free project until real students, and move to the Ship plan only then. A free local server stays for the lab page.
- [ ] Make code react first. A reaction plays from code on the turn decision, a typed send, or a board action, in the tutor's voice from stored audio or on the dot, and the student can interrupt it. Add short reactions beyond "Let me work that out.", with no phrase playing twice in three turns.
- [ ] Keep connections warm. Open the Muse and ElevenLabs sockets before the first turn, because a new Muse session takes 1046 to 2543 ms and a new voice socket about 420 ms, and avoid reopening on every reaction or `clearUserTurn`. Send `endStream` only if a measured rule earns it, because it ends the session.
- [ ] Guard held finals. If the voice detector hears silence, a partial exists, and no final arrives within a measured bound, act on the partial. Replace S's budget with about 700 and 900 ms until measured from the agent's region. The 700 ms grace fails, because final p50 is 698 ms and "Wait," took about 3.6 s, so give stop, resume, stop a rule.
- [ ] Set `ttsTextTransforms: null`, `aecWarmupDuration: null`, `record: false`, `closeOnDisconnect: false`, `minWords: 9999`, and `resumeFalseInterruption: false`, and pin `@livekit/agents` at 1.9.5.
- [ ] Build its own `ttsNode`, which sends `audioGap`, and decide whether early model start earns its place, because it gave no head start at S 698 ms against D 450 ms.
- [ ] Carry in the turn rule with resume, `getResumeScript`, and `clearUserTurn`, with digits as words and the story that proves it, and send `stop` on a cut reply. Add real spellings to the reaction list, such as "Aha", "Mm-hmm", and "Mm-mm", which reads as a no. The 1 s no-word rule races the stop, because 57 of 120 lines had no partial by 1 s.
- [ ] Hold a 300 ms floor and a 1 s cap, with the 2 s rule under decision 4, and own the 8 s timer. Rerun turn patience's figures on real transcripts.
- [ ] Pad silence during a dropped link, because no frames means no final and the socket closed at 16.2 s with 1008. Leave keywords off, because they showed no benefit and slowed two first turns to 3.7 and 4.0 s. Sessions cap at 60 minutes with no rotation, so handle that.
- [ ] Test a laptop speaker's echo with the SDK's wait off, and build the echo word filter from the design.
- [ ] Add `@livekit/agents-plugin-meta` to `theme/no-vendor-imports`.
- [ ] Take the M3.6 rows under "Follow-ups, with owners" and "For later owners" in `docs/architecture/live-session.md`.
- [ ] Recheck `LEGAL_PAGES`, including the S5 and S6 line, against the final settings and Meta's and ElevenLabs' terms.
- [ ] Record PRD test 4's measurements in `docs/tests/voice.md`, and measure join time, the delivery of a stop, and the trip on Cloud.

**You see.**

- [ ] A student can hold a spoken conversation in the browser on Muse and Chris through LiveKit Cloud, on a free project until real students.
- [ ] A first reaction from code reaches the student in under 200 ms, with no model in its path.
- [ ] First real word is as fast as these vendors allow, with each step's share measured and written down.
- [ ] When the student speaks, the tutor lowers its voice within about 300 ms, and it cuts off on the first real word. Saying "uh-huh" lowers the voice and does not stop it, even over a question.
- [ ] From the agent's decision to stop, speech and board stop within 150 ms, and first sound to silence stays within 1.2 s at p95.
- [ ] If the voice detector hears silence and a partial exists, but Muse holds its final, the tutor acts on the partial within a bound measured on a real microphone in a noisy room.
- [ ] Captions highlight each word as it plays and show the student's words too.
- [ ] A student can do the whole exchange by typing, with no microphone or speakers.
- [ ] If the connection drops, the agent pauses and resumes where it stopped.
- [ ] Speech recognition is measured on at least three accents, including math phrases such as "x squared over two", and the numbers are recorded.
- [ ] Raw audio is never stored.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `turn.test.ts` asserts that a backchannel does not count as an interruption, that a number alone does, and that a held final acts on the partial.
- [ ] `reconnect.test.ts` asserts the resume position.
- [ ] The Muse adapter passes `provider-suite.ts` on a new fake of its wire. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Three lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [ ] Lane 1. Regression lane against trunk. Trunk has no voice, so record that and gate the end state. Hold a scripted spoken exchange using injected audio, and interrupt it. Save `m3-6-talk.png`. Pass when the reaction comes first, captions track the words, and the agent stops on interruption.
- [ ] Lane 2. Do the same exchange by typing with audio off, then drop and restore the network. Save `m3-6-typed.png`. Pass when the typed exchange completes and the session resumes where it stopped.
- [ ] Lane 3. Play the held-final lines on a real microphone in a noisy room, on the built-in microphone with cleanup on and with it off. Save `m3-6-held.png`. Pass when no turn hangs past the measured bound, and the tutor answers from the partial.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Two numbers on every turn. First reaction from code, and first real word, with D, S, F, and the trip logged beside it. Also first sound to yield, first sound to silence, and the decision to stop to silence.
- [ ] Probe. Log them on LiveKit Cloud from the agent's region over 30 turns, at trunk and head.
- [ ] Baseline. Trunk has no voice. The speed test gave S at 698 and 880 ms and F at 253 and 319 ms on Flash, from Abel's Mac.
- [ ] Rule. Fail if first reaction exceeds 200 ms at p95, if the decision to stop to silence exceeds 150 ms at p95, if first sound to yield exceeds 300 ms, or if first sound to silence exceeds 1.2 s at p95. First real word has no fixed limit, as Abel ruled, so report its p50, p95, and each step's share to Abel.

**Review gate.** None. M3.6 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Finish the board library and prove no layout defects (M3.5)

**Status.** Not merged.

**Depends on.** M3.3, M3.4.

**Files.**

- [ ] Create `packages/board/src/diagram/`, `packages/board/src/table/`, `packages/board/src/timeline/`, and `packages/board/src/code/`.
- [ ] Create `packages/board/test-deck/` and `scripts/check-layout.ts`.

**Build.**

- [ ] Add the remaining commands to the player, with text rendered as text and never as HTML.
- [ ] Write the 100-scene deck and the automated check for overlap, overflow, and clipping, and run it in CI, inside the CI time limit.
- [ ] Add quality tiers set by measured frame rate (PRD Q13).

**You see.**

- [ ] The tutor can show labeled diagrams, tables, timelines, code blocks, and licensed or public-domain images.
- [ ] A test deck of 100 scripted scenes produces zero overlaps, overflows, or clipped elements under automated checks.
- [ ] The board runs at 60 fps on a mid-range laptop and at least 30 fps on a mid-range phone.
- [ ] On slower devices the board simplifies by itself, and audio and captions never degrade.
- [ ] The board honors reduced motion and never flashes more than three times a second.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `check-layout` fails on a seeded defect and passes on the full deck. Run `pnpm test:board`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [ ] Lane 1. Regression lane against trunk. Run the same deck check at trunk and head, and at head render the deck in both themes. Save `m3-5-deck.png`. Pass when head has zero defects across all 100 scenes.
- [ ] Lane 2. Play a mixed lesson at phone width with CPU throttling. Save `m3-5-tier.png`. Pass when the board drops a quality tier and audio and captions stay in sync.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Frames per second while a scene animates.
- [ ] Probe. Record frame timing during the deck's heaviest scenes, at laptop width and at phone width with CPU throttling, interleaved.
- [ ] Baseline. Record M3.2's frame rate on the same machine first.
- [ ] Rule. Fail if the laptop falls below 60 fps or throttled phone width falls below 30 fps at the lowest tier.

**Review gate.** None. M3.5 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Connect the tutor's brain (M3.7)

**Status.** Not merged.

**Depends on.** M3.2, M3.6.

**Files.**

- [ ] Create `apps/agent/src/tutor/` and `apps/agent/src/providers/anthropic.ts`.
- [ ] Create `evals/tutor-turns/`.
- [ ] Create `docs/tests/tutor-model.md`, and edit `LEGAL_PAGES` in `apps/web/src/strings.ts`.

**Build.**

- [ ] Read the `claude-api` skill before writing this code, then call Sonnet 5.5 through the official TypeScript SDK with streaming and prompt caching, behind `TutorModelAdapter` with one settings entry per model. The account and funds are approved.
- [ ] Turn thinking off, because the speed test found that is the only way near the budget. Leave `strict: true` off the tool, because it costs about 670 ms on Haiku. Prompt size barely matters, so do not trim for speed.
- [ ] Add a timeout for Sonnet's 9 to 10 s stalls, and handle `terminated` if fast mode is used.
- [ ] Add a space at the seam when text precedes a tool call, seen in the speed test as "for now.I hear you".
- [ ] Reconcile Prototype B's Sonnet first text of 1.18 s, n of 5, with the speed test's 1834 and 4006 ms and the later comparison's 1655 and 1956 ms, and say which settings explain the gap.
- [ ] Move `beat-text-reader.mjs` to `apps/agent/src/tutor/`, keep `reader-check.mjs` as its test, and have it drop internal XML tags. Write the prompt so that speech says math in words.
- [ ] Add the note to the model, compaction under decision 11, and B2's guard. Add short reactions and "Let me work that out." under decision 5, as stored beats the clock counts and captions show.
- [ ] Validate each beat at the boundary and fall back to speech alone when a beat is invalid.
- [ ] Build the 30-turn evaluation and a 90-turn test, because 30 turns is only 10 minutes, so that later prompt changes rerun them, by model name. Report T6's gap, because replies said "twelve" with no compute call on the speed test's prompt, and M3.8 closes it.
- [ ] Say what the tutor does after a refusal, because Sonnet 5.5 has five refusal categories and benign work can trigger one.

**You see.**

- [ ] The tutor answers a student's question out loud on Sonnet 5.5 while drawing on the board, from one ordered stream of beats.
- [ ] A first reaction from code reaches the student in under 200 ms, before any model word.
- [ ] First real word and cost per session minute are measured and recorded, on a 30-turn test and a 90-turn test.
- [ ] Abel is told if the measured cost exceeds $0.15 a minute.
- [ ] If the model stalls, a timeout ends the wait and the session continues, so a 9 to 10 second stall never leaves the student in silence.
- [ ] If the model produces an invalid beat, the student still hears the words and the session continues.
- [ ] No internal tag reaches the voice, and a turn over 1 s with no drawing gets the guard from B2.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `beats-stream.test.ts` asserts partial and invalid beats are handled, and that a tag is dropped.
- [ ] A test asserts that a stalled stream hits the timeout and that a seam gains its space.
- [ ] `pnpm eval:tutor --dry-run` asserts the evaluation loads all 30 turns. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [ ] Lane 1. Regression lane against trunk. Trunk has no brain, so record that and gate the end state. Ask a physics question on the lab page, by typing. Save `m3-7-answer.png`. Pass when the reaction comes first, the tutor speaks and draws together, and the drawing matches the words.
- [ ] Lane 2. Feed a recorded stream containing an invalid beat, then a stream that stalls for 10 s. Save `m3-7-invalid.png`. Pass when speech continues, the board stays correct, the stall ends at the timeout, and both are logged.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. First reaction from code, first real word, and cost per session minute. A reaction cannot pass for a real word, because they are two numbers.
- [ ] Probe. Log all three across the 30 and 90 evaluation turns on Sonnet 5.5 from the agent's region.
- [ ] Baseline. M3.6's numbers without a model. The later comparison gave Sonnet with `between_tools` low at 1655 and 1956 ms to first word from Abel's Mac.
- [ ] Rule. Fail if first reaction exceeds 200 ms at p95. First real word has no fixed limit, as Abel ruled, so report its p50 and p95 with the model's share, and report to Abel if cost exceeds $0.15 a minute.

**Review gate.** None. M3.7 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Share the board between student and tutor (M3.12)

**Status.** Not merged.

**Depends on.** M3.3, M3.7.

**Files.**

- [ ] Edit `packages/contracts/` for tasks, notes, tangent, and a wider `studentActed`.
- [ ] Create `packages/board/src/shared/` for the typed line, tasks, and marks.
- [ ] Create `apps/agent/src/tutor/watcher/` and the step checker.
- [ ] Extend `evals/tutor-turns/` and `docs/tests/tutor-model.md`.

**Build.**

- [ ] Read `/Users/abel/startup/astra-tinker/board` first, starting with `server.mjs`, `public/app.js`, `public/plain.js`, `lib/math-check.mjs`, and `lib/watch-rule.mjs`, and rerun `harness/`. Rebuild from it, because it is a prototype.
- [ ] Check steps in code with a math library, and send the model the result as a structured note, with no picture of the board for typed work.
- [ ] Build the watcher rule so code decides timing, because Haiku alone wrongly interrupted 28 of 60. Haiku reads only what typed words mean, because it was not good enough as the tutor.
- [ ] Change the reader so words after a question are dropped and commands are kept.
- [ ] Add tasks, notes, and tangent to the scene language with parsers and tests, and keep older log rows parsing.
- [ ] Propose the tutor's pen colour, which `docs/DESIGN.md` does not have, and put the choice on the Attention page for Abel.
- [ ] Keep M3.7's speed. Words come before commands, and the first reaction never waits for a model.

**You see.**

- [ ] A plain keyboard entry sits on the board and takes free-form typing, for thoughts and for math lines. MathLive is optional.
- [ ] Code checks each typed math step against the last, the tutor is told the result, and it never praises a wrong step. "Read as" always shows how a line was read.
- [ ] The tutor can set three tasks tied to its words. Drag a point on a graph to answer, click a term to circle it, and write the next line of working.
- [ ] The tutor can mark the student's work with a check, a cross, a note beside a line, or a circle on a term.
- [ ] Any student action gets a first reaction from code in under 200 ms.
- [ ] Code decides when the tutor speaks up, and a cheap model only reads what typed words mean. The tutor waits while the student works, and never hands over the answer early.
- [ ] After a question the tutor's later words are dropped and its board commands are kept, so it can ask and then set the task.
- [ ] Student actions and marks go in the session log, and replay shows them exactly.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] The step checker's tests assert right and wrong steps on `2x + 3 = 11`, including that a wrong line is never read as right.
- [ ] `watch-rule.test.ts` asserts that code decides timing and a model's reading alone cannot interrupt.
- [ ] `pnpm eval:tutor` gains cases for tasks and marks. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [ ] Lane 1. Regression lane against trunk. Trunk has no shared board, so record that and gate the end state. Solve `2x + 3 = 11` by typing, with a deliberate wrong step. Save `m3-12-steps.png`. Pass when "Read as" shows each line, the tutor marks the wrong step and does not praise it, and it does not give the answer.
- [ ] Lane 2. Find a parabola's vertex by dragging a point on a graph, then pause mid-work for 8 s, then replay the session. Save `m3-12-task.png`. Pass when the task is set on its word, the tutor stays quiet during the pause, and the replay shows the drag and the marks exactly.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. First reaction from code after a student action, the time to the tutor's first word, and cost per action.
- [ ] Probe. Log all three over the prototype's real lesson, on a mid-range laptop and at phone width with CPU throttling.
- [ ] Baseline. Prototype B gave any reaction at 21 ms at p50 from code, on Abel's Mac.
- [ ] Rule. Fail if first reaction exceeds 200 ms at p95. Report the first word and cost per action to Abel.

**Review gate.** None. M3.12 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Show best-effort 3D scenes from ManimGX and our kit (M3.14)

**Status.** First slice in review as PR 87, not merged: the ManimGX path, its router, the locked worker, and stored takes, behind `VITE_SCENE_LESSONS=1`. The kit path, the fit router's library match, and declared values in a live lesson are still to come, so this section stays open. Issue #72 keeps its older wording, and this section leads.

**Depends on.** M3.5, M3.7.

**Files.**

- [ ] Create `apps/scene-worker/` for the locked container that runs ManimGX.
- [ ] Create `apps/agent/src/scenes/` for the router, writer, and reviewer, and `apps/web/src/scenes/` to play stored takes.
- [ ] Create `packages/board/src/scene3d/` for the kit and its sandbox.
- [ ] Create `docs/tests/scenes.md`, and add textures and models with their sources to `docs/credits.md`.

**Build.**

- [ ] Land this in slices, each saying `Part of #72` until the last. The ManimGX path and the router's decision come first, then the kit path, the fit router's library match, and declared values in a live lesson.
- [ ] Start from the results in `/Users/abel/startup/astra-tinker/manimgx` and `/Users/abel/startup/astra-tinker/scenes-race`, and the kit in `/Users/abel/startup/astra-tinker/scenes`. Delegate by the ManimGX test's table.
- [ ] Keep the router, writer, and reviewer behind small switchable interfaces, on Anthropic models, as Abel chose.
- [ ] Run the router beside the voice, so it never delays a word. Later slices add a fit router that chooses between a library match, a library scene with changed values only where it declares them, a new scene, or no scene.
- [ ] Take truth from the kit, with domain functions and checks written once by a person, because the test found 14 of 14 clean with them on the Moon and seasons, and 1 of 10 without. Add a right-handed helix, exact polygons, number formatting, and more domains.
- [ ] Inject loop guards in the kit's sandbox, because removing an iframe does not stop a spinning script. A scene can navigate its own frame with data in the URL, so keep student data out of it.
- [ ] Save a late scene, and a refused one marked as refused, so nobody pays to write it again soon, and send only checked scenes to a browser. A refusal can be written again after an hour, at most 3 tries a day, because the review can refuse a true scene. A typed question's write stops once its student has gone. A card's keeps going.
- [ ] Run the path once on a real laptop with Intel or AMD graphics, because everything so far ran on one Mac.
- [ ] Record that B4's 100-scene deck does not hold for generated scenes, and state what replaces it.
- [ ] Keep textures licensed, with CC BY 4.0 credits, and test licensed 3D models with named parts for anatomy and molecules, which are untested.
- [ ] Edit `LEGAL_PAGES` if a scene's vendor or stored data changes, and add ManimGX's notices for the lawyer, namely GPL wheels on our server, H.264 if video is served, wasm, and the fonts in takes.

**You see.**

- [ ] Voice and the 2D board never wait for a scene. A scene shows only when it is ready and checked, and there is no spinner.
- [ ] On a new question the tutor starts with words and simple 2D, setting up what the scene will show, then brings in 3D at a pause. Cards and planned scenes open on 3D where one is ready.
- [ ] A scene not ready about 20 s after the opening is dropped from that lesson and saved, so a later lesson that may use it plays it at once. It can still land after the closing question, inside that time, and the question comes again after it.
- [ ] Every spoken line is short, as a person talks: usually under 25 words and never more than 45. A long line splits into more lines rather than running on.
- [ ] One scene command, with an engine, plugs into M3.2's clock. A scene plays by seconds on the board's clock, with named parts and moments as word cues, so a stop, seek, rewind, and exact replay work.
- [ ] A router chooses the engine. ManimGX takes symbols, plots, grids, flat maps, and code, and our kit takes solid things a camera could film. A wrong scene is the worst failure, so a doubtful request gets no scene, and false matches are measured and reported.
- [ ] Python runs only on a server in a locked container, with no network, and the browser plays a stored take. Kit scene code runs in a sandbox with injected loop guards and no network.
- [ ] Scenes shared across students come only from the server's own topic list. A typed question's scene stays with that student until a person or a moderated step promotes it.
- [ ] The review is a strict filter and not a truth gate, so a scene that passes it still says "Not yet checked by a person" until a person checks it. Numbers on labels and curves meet T6 or carry a rule Abel has approved.
- [ ] A saved scene holds shared truth and declared personal values, and code rejects a value it does not declare. No student data goes into a scene. The tutor's words, order, pace, and examples are written live per student.
- [ ] Rich scenes target laptops and may require a laptop browser, and phones must not block them. At phone width, or with no WebGPU, the lesson carries on with words and the 2D board.
- [ ] "Videos" means our generated scenes, with no real footage and no AI-generated video.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] A test scene gives the same frame at any seek point, and a spinning scene is stopped by its guard.
- [ ] The router's tests run labeled student requests, and fail on a false match.
- [ ] A planted fact error is caught by the review.
- [ ] A test asserts that a late scene is dropped from its lesson and saved, and that a typed question's scene never reaches another student. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [ ] Lane 1. Regression lane against trunk. Trunk has no 3D, so record that and gate the end state. On a laptop, ask a new question that routes to ManimGX, then one that routes to the kit, then seek and replay. Save `m3-14-pause.png`. Pass when the words start before any scene, no spinner shows, the scene comes in at a pause, moves land on their words, and replay matches exactly.
- [ ] Lane 2. Ask about a close-sounding topic the router should refuse, then a follow-up such as "what if gravity were half". Force a scene past about 20 s, then ask the same typed question as a second student, then load a lesson at 390px. Save `m3-14-router.png`. Pass when the close-sounding topic gets no wrong scene, the follow-up uses declared values or a new scene, the late scene is dropped from its lesson and saved, the second student never gets the first student's scene, and at 390px the lesson carries on with words and the 2D board.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time from a new question to a shown scene, time to first frame for a saved scene, routing time, and frames per second.
- [ ] Probe. Log them across the test's topics on a mid-range laptop.
- [ ] Baseline. The scene test gave Opus 5.5 low in fast mode 12.5 s at the median and $0.165 a scene, and GPT-6.1 Sol low 35.6 s and $0.033, on Abel's Mac. The ManimGX test's blind router took 884 ms.
- [ ] Rule. Fail if the words or the 2D board ever wait on a scene, if a saved scene misses B1, or if a mid-range laptop falls below 30 fps at the lowest tier. Phone width has no frame rule here.

**Review gate.** None. M3.14 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Write the approved library of 133 scenes (M3.15)

**Status.** Not merged.

**Depends on.** M3.14.

**Files.**

- [ ] Create `apps/agent/src/scenes/library/` for the list and the run that writes it.
- [ ] Create the sample page in `apps/web/src/scenes/`, and the API routes it reads.
- [ ] Create `docs/tests/scene-library.md`.

**Build.**

- [ ] Put the list on the server's own topic list, reading Home's topics from `apps/api/src/picks/library.json`, because only those scenes may be shared across students.
- [ ] Let M3.14's router pick each scene's engine, and write with M3.14's Anthropic writers, behind the same interface.
- [ ] Track spend as the run writes. M3.14's first path measured about $0.10 to $0.21 a scene with both reviews, which is above what the estimate assumes. If the run is on course to pass about $10, stop and bring Abel the number before going on.
- [ ] Make the run safe to stop and restart, so a scene already written is never paid for twice.
- [ ] Keep the sample page away from students, with the API refusing anyone but a named reviewer.

**You see.**

- [ ] The library holds 133 scenes, one opening scene for each of the 48 Home topics, plus 5 more for each of 17 topics.
- [ ] The 17 topics are Saturn's rings, the Moon's one face, the seasons, black holes, how stars made your atoms, a jump shot, a rocket escaping Earth, why a rainbow is round, why moving clocks run slow, Pythagoras, derivatives, quadratics, sunflower spirals, the periodic table, what burns inside an engine, how DNA copies itself, and how a map finds the fastest route.
- [ ] Every scene passes the automatic review before it joins the library. The review is a strict filter and not a truth gate, so a library scene still says "Not yet checked by a person" until a person checks it.
- [ ] A simple page shows Abel a sample, weighted to opening scenes, with a way to flag a scene. A flagged scene stops showing until someone has looked at it.
- [ ] A student who opens a Home topic with a library scene gets it with no wait and no new write.
- [ ] The library is written once, from this list. No worker adds to it from recommendations.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] A test asserts that the list holds 133 scenes, 48 openings and 5 for each of the 17 topics.
- [ ] A test asserts that a scene failing review never joins the library, and that a flagged scene stops showing.
- [ ] A test asserts that the sample is weighted to opening scenes, and that a student gets a 403 from the page's routes. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [ ] Lane 1. Regression lane against trunk. Trunk has no library, so record that and gate the end state. On a laptop, as a new student, open a Home topic that has an opening scene. Save `m3-15-opening.png`. Pass when the scene opens with no wait and no model call, and it says "Not yet checked by a person".
- [ ] Lane 2. Open the sample page as a named reviewer and flag a scene, reload, then open a lesson on that topic. Open the page again as a student. Save `m3-15-sample.png`. Pass when the sample leans to opening scenes, the flag survives the reload, the flagged scene no longer shows, and the student gets no page.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time to first frame of a library scene, and the run's spend per scene.
- [ ] Probe. Log first frames over 20 library scenes on a mid-range laptop, and record the whole run's spend.
- [ ] Baseline. M3.14's figures for a saved scene, and the estimate of about $10.
- [ ] Rule. Fail if a library scene's first frame misses B1. Report the real spend beside the estimate.

**Review gate.** None. M3.15 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Teach instead of tell, with tools the tutor calls when needed (M3.8)

**Status.** Not merged.

**Depends on.** M3.7.

**Files.**

- [ ] Create `apps/agent/src/tutor/prompts/` and `apps/agent/src/tutor/tools/`.
- [ ] Extend `evals/tutor-turns/`.

**Build.**

- [ ] Write the teaching rules as a versioned prompt.
- [ ] Add tools the model calls when needed, namely `compute`, `plot_values`, and `find_source`, with `read_board`, `get_learner_record`, and `note_evidence` following in later PRs.
- [ ] Track failed attempts in code so the dead-end rule does not depend on the model's memory.
- [ ] Decide what the tutor says when the 8 s timer ends.
- [ ] Add evaluation cases for answer leaks, dead ends, turn length, silence, mode choice, wrong math, a student's clarification from Abel's Aristotle note, and no internal tag or spoken math mark reaching the voice. Add T6's gap from the speed test, where replies said "twelve" with no compute call.
- [ ] Run the evaluations against any model by name, so a later model change reruns them. If M3.12 lands first, include its tasks in the prompt, and whichever lands second rebases.

**You see.**

- [ ] In problem mode, the tutor never states the final answer before the student has tried, and it reveals one step at a time.
- [ ] If a student demands the answer, the tutor encourages one attempt first, gives it, then sets a similar problem to solve alone.
- [ ] After two failed attempts on one point, the tutor shows the next step on the board. A student never hears a third question in a row on the same point.
- [ ] A question such as "How do black holes form?" gets short explanations with regular checks, because the tutor picks the right mode by itself.
- [ ] When a student interrupts to ask for clarification, the tutor answers it, then goes back to the point without repeating itself.
- [ ] Spoken turns stay under 20 seconds, and the tutor waits at least 8 seconds after a question without prompting.
- [ ] All math and plotted values come from a calculation tool, and factual claims can show a source on request.
- [ ] The tutor writes for the ear, with short sentences and math said the way a person says it.
- [ ] An evaluation suite measures all of this, and every prompt change must pass it.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `compute.test.ts` asserts results against worked answers.
- [ ] `dead-end.test.ts` asserts the switch to showing on the third attempt.
- [ ] `pnpm eval:tutor` runs the suite and records the score. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [ ] Lane 1. Regression lane against trunk. Run the same stuck-student script at trunk and head. Save `m3-8-stuck.png`. Pass when head shows the next step after two failed attempts, and trunk does not.
- [ ] Lane 2. Ask for the final answer outright, then ask a curiosity question, then interrupt to ask for clarification. Save `m3-8-modes.png`. Pass when the tutor encourages an attempt first, explains in short bursts on the curiosity question, and answers the clarification without repeating itself.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [ ] Probe. None.
- [ ] Baseline. None.
- [ ] Rule. None.

**Review gate.** None. M3.8 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Prepare a lesson plan for every session (M3.9)

**Status.** Not merged.

**Depends on.** M3.8, M2.5.

**Files.**

- [ ] Create `apps/agent/src/lesson-plan/` and `apps/api/src/lesson-plans/`.
- [ ] Add `LessonPlan` DTOs in `apps/api/src/lesson-plans/`, an entity and repository under `apps/api/src/infrastructure/orm/`, and a generated migration.

**Build.**

- [ ] Generate a quick opening immediately and the full plan in the background with structured output.
- [ ] Keep the current step in code and pass only it to each live turn as an appended message, because `system` and `tools` stay frozen for prompt caching.
- [ ] Name each concept's scenes in the plan as data, because M3.13's queue reads them.
- [ ] Fall back to a plain teaching mode when planning fails.
- [ ] Edit `LEGAL_PAGES` for what a saved plan stores.

**You see.**

- [ ] Every session gets a lesson plan with a goal, prerequisites, concept steps, a teaching mode, and examples drawn from the student's interests.
- [ ] The tutor's first word still plays within three seconds, because a deeper plan finishes in the background and the tutor adopts it when ready.
- [ ] The tutor follows the plan and changes it when the student shows they know more or less than expected.
- [ ] The session screen shows real progress, such as "Concept 2 of 5", and the continue card shows what comes next.
- [ ] Plans are saved with the session, and a plan that fails to generate never stops the session.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `lesson-plan.schema.test.ts` asserts the plan shape.
- [ ] `plan-progress.test.ts` asserts advancing, revising, and the fallback. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [ ] Lane 1. Regression lane against trunk. Trunk has no plans, so record that and gate the end state. Start a session on a physics question as a basketball student. Save `m3-9-plan.png`. Pass when the saved plan has steps and basketball examples, and the first word plays within three seconds.
- [ ] Lane 2. Show strong knowledge early in a session, and then force the planner to fail in a second session. Save `m3-9-adapt.png`. Pass when the first plan skips ahead, and the second session continues normally.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [ ] Probe. None.
- [ ] Baseline. None.
- [ ] Rule. None.

**Review gate.** None. M3.9 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Keep the next scenes ready as the lesson flows (M3.13)

**Status.** Not merged. Issue #71 keeps its older wording, and this section leads.

**Depends on.** M3.5, M3.9.

**Files.**

- [ ] Create `apps/agent/src/scene-queue/`.
- [ ] Create `apps/web/src/session/scene-preload/`.
- [ ] Extend `apps/agent/src/lesson-plan/`, and create `docs/tests/lesson-flow.md`.

**Build.**

- [ ] Model the queue as data, with one entry per scene and a state for each, including an engine and a `making` state, and keep it in code so a turn never waits on it.
- [ ] Fill it only inside a running lesson, from what exists when this PR runs, namely M3.5's 2D scenes, and M3.14's saved and live scenes and M3.15's library through the same scene command once they land.
- [ ] Use the same checks and sharing rule as M3.14 before a scene is shown.
- [ ] Preload a stored take's bytes for ManimGX, because a lesson's takes are a few MB, and hold the next one or two kit scenes in the browser. The scene test measured 24 to 35 ms against 182 to 420 ms, at about 180 MB each. It also recommends three writers per lesson with preemption for urgent scenes, where 1 of 17 scenes waited and the longest wait was 1.5 s, on one run per topic.
- [ ] Reorder from M3.9's revised plan, and cancel writes the student no longer needs, so money is not spent on them.
- [ ] Keep the tutor's words, order, pace, and examples live per student, because only the scene is prepared ahead.

**You see.**

- [ ] A student follows a plan of concepts, each with several scenes, not one question and one scene.
- [ ] Inside a running lesson, a queue writes the current concept's scenes, then the next concept's. No worker prepares scenes from recommendations before a student arrives.
- [ ] Cards and planned scenes open on 3D where one is ready, and otherwise on words and simple 2D.
- [ ] The browser holds the next scenes ready, so a scene's first frame is ready when the words reach it.
- [ ] Scenes are checked before they are shown, and a scene that fails never reaches the student.
- [ ] When the student goes off plan, the queue reorders and drops work it no longer needs, and the tutor keeps talking on the plain board until a new scene is ready.
- [ ] A slow or failed scene never stops the tutor's words. There is no spinner, and a scene not ready after about 20 s is dropped from that lesson and saved.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `scene-queue.test.ts` asserts the order, the move to the next concept, reordering off plan, dropping work, and that a queue with no running lesson writes nothing.
- [ ] A test asserts that a failed scene leaves the words playing and the plain board showing. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [ ] Lane 1. Regression lane against trunk. Trunk has no queue, so record that and gate the end state. Run a three-concept session on a laptop and let it flow. Save `m3-13-flow.png`. Pass when the words never wait, a scene that is ready shows when its words arrive, a scene that is not ready stays off the screen with no spinner, and nothing was written before the student arrived.
- [ ] Lane 2. Go off plan in the middle of the second concept, force the next scene to fail, then hold another past about 20 s. Save `m3-13-off-plan.png`. Pass when the queue reorders, the tutor keeps talking on the plain board, the failed scene never appears, and the late scene is dropped from the lesson and saved.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time from a scene's word to its first frame when it was prepared, how many scenes were ready in time, and time to the first render of a session.
- [ ] Probe. Log all three over three complete sessions, on a mid-range laptop.
- [ ] Baseline. Trunk has no queue, so B1's budget applies to a prepared scene.
- [ ] Rule. Fail if a prepared scene's first frame misses B1 at p95, or if a turn's words ever wait on the queue. The share of scenes ready in time has no fixed limit, so report it to Abel.

**Review gate.** None. M3.13 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Run the first full session end to end (M3.10)

**Status.** Not merged. Issue #19 keeps its older wording, and this section leads.

**Depends on.** M3.5, M3.9, M3.12.

**Files.**

- [ ] Edit `apps/web/src/session/`, replacing the stand-in clock and reply in `useSessionRun.ts` and `ReplyBox`.
- [ ] Create `apps/web/src/session/dot/`.
- [ ] Create the session log table through `apps/api/src/infrastructure/orm/`, with a generated migration.

**Build.**

- [ ] Replace the stand-in session content with the live pipeline, on M2.5's route, `/sessions/:sessionId`, outside `AppShell`.
- [ ] Build the dot's behaviors from PRD B9.
- [ ] Save every event that played to the session log, and settle agent-to-API auth and the log table's owner.
- [ ] Read a card's `openingLine` for its first words, and fix the `draughtsman` line first, as Appendix E says.
- [ ] Do not wait for M3.13, M3.14, or M3.15. Take scenes from whatever of them has landed when this PR runs, through a seam that never holds up the words, because 3D is built alongside this PR.
- [ ] Measure first reaction, first real word, sync, and cost on real sessions and record them in `docs/tests/first-session.md`.

**You see.**

- [ ] Sending a question or selecting a card starts a real session, with code reacting at once and the tutor's first real word within three seconds, while M3.9's concept plan finishes in the background.
- [ ] The student and tutor talk back and forth, with captions, and the student can interrupt at any time.
- [ ] The board draws in time with the tutor's words, using the real board library and tutor, and the student can type on it and answer its tasks.
- [ ] The lesson never waits for 3D. Voice and the 2D board carry it, a scene shows only when it is ready and checked, and there is no spinner. A full session passes with no 3D at all.
- [ ] The tutor's dot pulses with speech, moves to what it is discussing, and rests while listening, and the board stays still while the student reads.
- [ ] The tutor states that it is an AI at the start of each session, and again after every three hours of use.
- [ ] The student can end the session, and it is saved and appears in Sessions.
- [ ] A screen recording of a full session is posted on this issue, and Abel is told.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `session-machine.test.ts` asserts the states from connecting through speaking, listening, interrupted, and ended, with no illegal transition.
- [ ] `dot.test.ts` asserts the dot's state follows the session. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [ ] Lane 1. Regression lane against trunk. Run the same journey from Home at trunk and head using injected audio. Save `m3-10-session.png`. Pass when head delivers a real spoken lesson with the board in sync, and trunk shows only stand-in content.
- [ ] Lane 2. Complete a full session by typing at 390px in dark mode, interrupting twice. Save `m3-10-phone.png`. Pass when the session completes on words and the 2D board, stays in sync, and appears in Sessions.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. First reaction from code, first real word, drawing drift, and cost per minute, on complete sessions.
- [ ] Probe. Log all four on three complete sessions, at trunk and head.
- [ ] Baseline. Trunk has no real session, so these absolute budgets apply.
- [ ] Rule. Fail if first reaction exceeds 200 ms at p95, if a session's first real word exceeds 3 s, if p95 drift exceeds 100 ms, or if cost exceeds $0.15 a minute. A later turn's first real word has no fixed limit, so report its p50 and p95 to Abel.

**Review gate.** None. M3.10 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Let students draw on the board and upload their work (M3.11)

**Status.** Not merged.

**Depends on.** M3.10, M3.12.

**Files.**

- [ ] Create `packages/board/src/student-ink/`.
- [ ] Create `apps/api/src/uploads/`.
- [ ] Add `read_board` to `apps/agent/src/tutor/tools/`.
- [ ] Edit `apps/web/src/home/` so an attached file is sent, and `LEGAL_PAGES` in `apps/web/src/strings.ts`.

**Build.**

- [ ] Add a student ink layer that records strokes in the session log, using the shapes in `packages/contracts`.
- [ ] Send structured board state on every turn and a snapshot only when there is handwriting to read.
- [ ] Store uploads with ownership checks, and stop dropping files attached on Home.
- [ ] Measure handwriting on real hands, because Prototype B's 800 reads were on synthetic hands, which is likely optimistic.
- [ ] Settle M3.11's row under "Open, with an owner" in `docs/architecture/live-session.md`.

**You see.**

- [ ] A student can draw and write on the board with a mouse, a finger, or a stylus.
- [ ] Handwriting goes to a small reader call and then M3.12's code check, and "Read as" always shows how it was read.
- [ ] The tutor can respond to what the student wrote, including spotting a sign error in worked math, and it never calls a wrong line right.
- [ ] A student can attach a photo or PDF from Home or during a session, and the tutor can talk about it.
- [ ] Uploaded files stay private to that student and can be deleted.
- [ ] The product never uses the camera for video or for reading faces (PRD Q17).

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `student-ink.test.ts` asserts that strokes replay.
- [ ] `uploads.spec.ts` asserts type limits, ownership, and deletion. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [ ] Lane 1. Regression lane against trunk. Trunk ignores student drawing, so record that and gate the end state. Write a worked equation with a sign error on the board. Save `m3-11-ink.png`. Pass when "Read as" shows the line, and the tutor finds the sign error and points to it.
- [ ] Lane 2. Attach a worksheet photo from Home, start the session, and then delete the file. Save `m3-11-upload.png`. Pass when the tutor discusses the worksheet and the deleted file can no longer be read.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [ ] Probe. None.
- [ ] Baseline. None.
- [ ] Rule. None.

**Review gate.** None. M3.11 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Give the tutor a memory of each student (M4.1)

**Status.** Not merged.

**Depends on.** M3.10.

**Files.**

- [ ] Create `apps/api/src/learner-record/`.
- [ ] Create `apps/agent/src/learner-record/`.
- [ ] Add `LearnerRecord` DTOs in `apps/api/src/learner-record/`, an entity and repository under `apps/api/src/infrastructure/orm/`, and a generated migration.
- [ ] Create `apps/web/src/record/`.

**Build.**

- [ ] Run a structured extraction when a session ends.
- [ ] Make updates idempotent by session id.
- [ ] Add a page where the student reads and deletes their record, as a new row in `MENU`.
- [ ] Edit `LEGAL_PAGES` for what the record stores.

**You see.**

- [ ] After each session, the student's record lists concepts with a status, the evidence behind it, and any misconceptions.
- [ ] The record updates from real dialogue, such as a repeated sign error being noted as a misconception.
- [ ] A student can see their record in plain language and delete any part of it.
- [ ] A failed update never affects the session, and it retries safely.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `extraction.test.ts` asserts the output on recorded transcripts.
- [ ] `learner-record.service.spec.ts` asserts idempotent updates and deletion. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [ ] Lane 1. Regression lane against trunk. Trunk has no record, so record that and gate the end state. Complete a session with a repeated sign error and open the record. Save `m4-1-record.png`. Pass when the misconception appears with its evidence.
- [ ] Lane 2. Delete an entry, then run the same session's update again. Save `m4-1-delete.png`. Pass when the deleted entry stays gone and nothing is duplicated.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [ ] Probe. None.
- [ ] Baseline. None.
- [ ] Rule. None.

**Review gate.** None. M4.1 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Make the teaching personal (M4.2)

**Status.** Not merged.

**Depends on.** M4.1.

**Files.**

- [ ] Create `apps/api/src/concepts/` with the concept graph.
- [ ] Edit `apps/agent/src/tutor/`.
- [ ] Extend `evals/tutor-turns/`.

**Build.**

- [ ] Add the `get_learner_record` and `note_evidence` tools from M3.8.
- [ ] Build the concept graph and prerequisite lookup as data and pure functions.
- [ ] Add evaluation cases for level, prerequisites, memory, and bad analogies.

**You see.**

- [ ] In the first minute, the tutor gauges level through conversation, with no test.
- [ ] When a student is stuck, the tutor finds the missing prerequisite and teaches that first.
- [ ] The tutor refers to specifics from earlier sessions where they help.
- [ ] Interests appear only where the analogy is correct, and the student can turn them off.
- [ ] Math and physics have a hand-checked map of at least 100 concepts, and other subjects get a generated one.
- [ ] An evaluation shows that two different students get visibly different teaching on the same question.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `prerequisites.spec.ts` asserts tracing on the graph.
- [ ] `graph.test.ts` asserts that the graph has no cycles.
- [ ] `pnpm eval:tutor` covers the new cases. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [ ] Lane 1. Regression lane against trunk. Run the same question as two seeded students at trunk and head. Save `m4-2-different.png`. Pass when head teaches them differently, using each student's level and record.
- [ ] Lane 2. Play a student who cannot do a derivative because of weak algebra, then return in a new session. Save `m4-2-prereq.png`. Pass when the tutor goes back to the algebra, and it refers to this in the later session.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [ ] Probe. None.
- [ ] Baseline. None.
- [ ] Rule. None.

**Review gate.** None. M4.2 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Recommend picks from performance and weaknesses (M4.3)

**Status.** Not merged.

**Depends on.** M4.1, M2.2, M2.12.

**Files.**

- [ ] Edit `apps/api/src/picks/`.

**Build.**

- [ ] Extend `rankForStudent` in `getPicksForStudent.ts` with the learner record, keeping it a pure function.
- [ ] Build each reason from the evidence in the record.
- [ ] Generate a card for a weakness that the library does not cover, with a picture or drawing from the same mix.

**You see.**

- [ ] Home ranks cards using the student's record as well as their session history, goals, and interests.
- [ ] A card can state a real reason, such as "You got stuck on free-body diagrams on Tuesday".
- [ ] A new student still gets good cards from the pre-made library.
- [ ] After a session with a clear weakness, the next visit to Home shows a card for it.
- [ ] M2.12's rules still hold. Finished topics do not reappear, and topics in progress stay within reach.
- [ ] The cards keep their styling and mix of pictures and drawings.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `getPicksForStudent.spec.ts` gains cases for ranking and reasons from evidence, and keeps M2.12's cases. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [ ] Lane 1. Regression lane against trunk. Run the same student at trunk and head after a session showing a clear weakness. Save `m4-3-weakness.png`. Pass when head shows a card for that weakness with a true reason, and trunk does not.
- [ ] Lane 2. Load Home as a brand new student at 390px. Save `m4-3-new.png`. Pass when six good cards appear from the library.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [ ] Probe. None.
- [ ] Baseline. None.
- [ ] Rule. None.

**Review gate.** None. M4.3 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## End sessions with a recap, and let students replay them (M4.4)

**Status.** Not merged.

**Depends on.** M3.10, M4.1.

**Files.**

- [ ] Create `apps/web/src/replay/` and `apps/agent/src/recap/`.
- [ ] Edit `apps/web/src/sessions/`, so a finished row says `Replay`, and `packages/contracts/` for the key-moments command.

**Build.**

- [ ] Add a recap step at session end, with a check question, and the key-moments command, which is M4.4's row under "Open, with an owner" in `docs/architecture/live-session.md`.
- [ ] Build a replay screen from `SessionEvent` using the same `ScenePlayer` and `rebuildBoard`, including student actions and any 3D scene.
- [ ] Generate replay speech from the saved words only if Abel approves the cost, and otherwise show captions with no audio.

**You see.**

- [ ] The tutor gives a 30-second spoken recap while the board replays its key moments.
- [ ] The student answers one check question alone, and the answer feeds their record.
- [ ] Any past session reopens and can be scrubbed, with the board and captions exactly as they happened.
- [ ] Replay uses the saved session log, with no stored video or raw audio.
- [ ] A student can continue an unfinished session from where it stopped.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `replay.test.ts` asserts that a log rebuilds the same board at any seek point.
- [ ] `recap.test.ts` asserts the check question's answer reaches the record. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [ ] Lane 1. Regression lane against trunk. Trunk has no recap or replay, so record that and gate the end state. Finish a session and answer the check question. Save `m4-4-recap.png`. Pass when the recap plays and the answer appears in the record.
- [ ] Lane 2. Open that session from Sessions and scrub to three points. Save `m4-4-replay.png`. Pass when the board and captions match what happened at each point.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [ ] Probe. None.
- [ ] Baseline. None.
- [ ] Rule. None.

**Review gate.** None. M4.4 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Make it safe for students 13 and up (M4.5)

**Status.** Not merged.

**Depends on.** M3.10.

**Files.**

- [ ] Create `apps/agent/src/safety/`, `apps/api/src/safety/`, and `apps/web/src/review/`.
- [ ] Extend `evals/tutor-turns/` with safety cases.
- [ ] Edit `LEGAL_PAGES` in `apps/web/src/strings.ts`, and add a credit surface for the pictures.

**Build.**

- [ ] Run the safety check beside each turn, without slowing the first reaction or the first real word.
- [ ] Add a flag queue and a review page limited to named reviewers. Nothing contacts a parent, as Abel ruled, and this overrides PRD Q4, Q5, S3, and S5's parent lines.
- [ ] Add data deletion across every table, and an automated check that no audio files are written. Both must take in M3.14's scene store, which is not a table: typed scenes and refusals in `.scene-store`, a typed lesson's tutor audio in `student-voice/<student id>`, and student IDs in `lesson-spend.jsonl`. The store keeps tutor audio on purpose, so either the check names students' audio only, or this PR removes those files. `docs/tests/scenes.md` says what to remove for one student today.
- [ ] Add a credit surface, because `docs/credits.md` alone leaves 5 NASA pictures without a visible credit.
- [ ] Put Anthropic's zero-retention agreement, Meta's and ElevenLabs' age rules, and a full read of their terms into the legal review, with the M4.5 row under "For later owners" in `docs/architecture/live-session.md`.
- [ ] Stop and tell Abel that the lawyer's review is still needed before any real student is invited, recorded on `lawyer-view` (PRD section 11).

**You see.**

- [ ] A separate check reviews every student and tutor turn during a session.
- [ ] A self-harm signal stops the teaching, shows local help resources, and creates a flag for a person to review.
- [ ] A review page lists every flag, for named reviewers.
- [ ] The tutor claims no feelings or friendship, never engages romantically, never encourages secrecy, and nudges minors to take breaks, and an evaluation proves it.
- [ ] A student can delete their data, and raw audio is confirmed never stored.
- [ ] Student data is excluded from model training, and the product has no camera, no voiceprints, and no emotion inference.
- [ ] Before any real student, an under-13 account is fully closed. The Supabase user is deleted, along with the address in Auth's identities, audit rows, and logs, a keyed hash of the address refuses it from then on, even after an email change, and a lawyer's view is recorded (PRD S1). A test proves each of these.
- [ ] A lawyer reviews this before real students, including having no parent consent, Meta's and ElevenLabs' under-18 rules, and the vendors' retention.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `safety-check.test.ts` asserts the stop path on recorded signals, and that no flag sends anything to a parent.
- [ ] `delete-student.spec.ts` asserts that no student rows remain.
- [ ] `pnpm eval:tutor` covers the companion and secrecy cases. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the review rule under **Verdict and merge**.

- [ ] Lane 1. Regression lane against trunk. Run the same self-harm script at trunk and head. Save `m4-5-signal.png`. Pass when head stops teaching, shows help resources, and creates a flag, and trunk does not.
- [ ] Lane 2. Delete a minor's account after a session, then search the database and storage for that student. Save `m4-5-delete.png`. Pass when nothing remains and no raw audio was ever written.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [ ] Probe. None.
- [ ] Baseline. None.
- [ ] Rule. None.

**Review gate.** None. M4.5 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] Run the whole journey once on a fresh database, from sign-in to a second session that shows a recommended card, and post the recording.
- [ ] Reply to the operator with the report the execution playbook names, including measured first reaction, first real word, sync, and cost per minute, and the items in Appendix C and Appendix E that remain open.

## Appendix A. Prototype evidence

- **Look.** The [look prototype](https://claude.ai/artifact/3Kw7Ggukb39GerA4E5pK7u) settled type and palette, and Abel approved it on 2 November 2026. Its source is in `docs/design/look-prototype/`. For sign-in and onboarding, Abel first chose sample C, Made of dots, with sample B's still dot background, from the [samples](https://claude.ai/artifact/X9ZFLu1ovyMHmVW7VxQzW4) on 4 November 2026. Abel then chose 1 + 4 the same day, the dotted Saturn on the star chart, which M2.11 built and `docs/DESIGN.md` records.
- **Home.** The [app prototype](https://claude.ai/artifact/YJRK2QzMdDdm4c4DQhwWZq) settled the home proportions, the chat box pinned to the bottom, and the "Made for you" sheet, which M2.11 later removed. Its source is in `docs/design/app-prototype/`. A scripted click-through passed on the flows it covers, and it has not been checked on real devices. Its onboarding steps are superseded by M2.4.
- **Live tutor facts.** `docs/architecture/live-session.md` records what M3.1 proved with fakes, and a speed test on 3 November 2026 measured the real vendors from Abel's Mac on a West African network, on synthetic speech. Its figures are labeled in that document. A real microphone test on Abel's voice kept Muse over Nova-3, on 14 clean lines. A comparison of models kept Sonnet 5.5.
- **Shared board.** Prototype B, in `/Users/abel/startup/astra-tinker/board`, is the source for M3.12. It measured code reacting at 21 ms at p50, and Haiku alone wrongly interrupting 28 of 60.
- **3D scenes.** Prototype A, in `/Users/abel/startup/astra-tinker/scenes`, was the first source for M3.14. One run per topic, on one Mac's GPU, with no real phone. Generated scenes passed checks that do not check facts. The scene test, in `/Users/abel/startup/astra-tinker/scenes-race`, then compared writers, the router, and the review, and found that truth comes from the kit. The ManimGX test, in `/Users/abel/startup/astra-tinker/manimgx`, passed the bar stated to Abel, and it set which scenes go to which engine.
- **Still unproven.** First real word from the agent's region is unproven until M3.6 and M3.7. Teaching quality on Sonnet is unproven until M3.7 and M3.8. Rich scenes on real laptops with Intel or AMD graphics are unproven, because everything ran on one Mac. Learning gain and student reaction are unproven until real students use the product.
- **PRD section 13 tests.** Test 1 is M3.2, test 2 is M3.7, and test 4's measurements are in M3.6. Test 3 is gone, because dot pictures and the swarm left the plan. Test 5, with five students, runs after M3.10.

## Appendix B. Alternatives rejected

- **Next.js.** It would hold pages and server code in one app. Abel chose React with Vite and NestJS, which matches `agentic-tutor`.
- **Server-rendered video and a whiteboard SDK as the renderer.** PRD section 8 rejects both for live teaching. Real footage and AI-generated video are also out. ManimGX in M3.14 is not this, because the browser plays a stored take on the board's clock, and it stops, seeks, and replays with the board.
- **Only a hand-built library, with no generated scenes.** PRD Q11 said this. Abel wants 3D for almost any topic, so M3.14 writes a scene when a student needs one, and saves it.
- **Only generated scenes.** Abel wants richer and faster scenes for selected topics, with cost in mind, so M3.15 writes one curated library once.
- **A talking router with a cheap model.** No candidate met the budget, a serial classifier added about 800 ms to every turn, and Haiku as the tutor was not good enough. Sonnet 5.5 stays for now.
- **Cartesia and Deepgram.** They stay as the reference the proofs ran against. Abel chose ElevenLabs and Muse on 3 November 2026.
- **Parent consent by email link, and a voice choice in onboarding.** Abel removed both on 4 November 2026, because onboarding must be simple. The lawyer reviews this before real students.
- **A sign-in link.** Abel chose a typed code on 4 November 2026.
- **Redrawing Home's cards in one ink style.** Abel kept today's pictures and drawings on 4 November 2026.
- **Dot pictures and the swarm.** Abel removed both from the plan on 2 November 2026. The made-of-dots look is a stage for sign-in and onboarding, and pictures stay normal images.
- **Building the student app before proving the board.** M3.1 and M3.2 can run alongside M2, so the riskiest part is proved early.

## Appendix C. Risks

- **The board misses its timing targets on real audio.** It lands in M3.2, which stops and reports its numbers before more board work starts. Word times arrive with their audio on Flash and Turbo, and the proofs ran with a lead.
- **First real word stays slow.** The inferred best case is about 2.1 s at p50 and 3.1 s at p95 from Abel's Mac. Code reacting first covers the silence, and M3.6 and M3.7 report each step's share. M3.9's and M3.10's limit of 3 s for a session's first word may miss on these numbers.
- **The cost per minute is above budget.** It lands in M3.7 and M3.10, which measure it and report to Abel. Scenes add to it. At 100% of scenes written, the earlier estimate is about $510 a month at beta size, on top of about $1,490 for voice, tutor, and hosting, against a budget of about $2,000. It falls as scenes get saved, and a per-lesson scene cap is the lever if needed.
- **Generated scenes state wrong facts.** They land in M3.14. The review is a strict filter and not a truth gate, so a scene says "Not yet checked by a person" until a person checks it, and a typed question's scene stays with its student. Numbers on labels and curve formulas come from the model, which breaks T6 as written, and B4 does not hold for generated scenes.
- **Legal review for minors.** It lands in M4.5 and stays open until a lawyer reviews it, and that happens before real students. It covers having no parent consent, Meta's and ElevenLabs' under-18 rules, and vendor retention.
- **A vendor changes the ground.** Chris is one of ElevenLabs' own voices, so ElevenLabs alone decides how long it stays. Meta may change Muse's Standard designation. LiveKit's Ship plan caps at 20 concurrent agent sessions, and the next plan is Scale at $500.
- **CI's margin.** Each of the two jobs has its own 4 minute limit, and `api-and-agent` ends last. On PR 86's code it took 132 and 137 s on an EPYC 7763, and 183 s with blob storage blocked on an unrecorded CPU. With the 6 s that `pnpm db:seed` adds, that leaves about 97 s, and about 51 s in the slow case, by inference. M3.5's deck adds to the time. Appendix E holds the next lever.
- **Public name.** PRD Q1 stays open, and M1.3 keeps the name in one module.
- **Scope cuts for the MVP.** M2.2 shipped 48 topics against the PRD's estimate of 60, and M4.2 ships at least 100 concepts against its estimate of 300. Both grow before the beta.

## Appendix D. Links and reading list

- Read `docs/PRD-v1.md`, including "Changes since approval", and `docs/DESIGN.md` before editing anything. Read `docs/architecture/live-session.md` before any M3 PR, and `~/startup/agentic-tutor/docs/NORTH_STAR_PLAN.md` for background.
- M3.1 uses `skills/architect/SKILL.md`, and M2.3 and M4.5 use `skills/interrogate/SKILL.md`. Keep the trail per `skills/show-me-your-work/SKILL.md`.
- After the MVP and before the beta, the PRD still needs invitations, usage caps and a spend alert (Q14), the seven-day check and beta metrics (section 12), the static-board comparison, the payment link (Q21), hosting, and the lawyer's review. Abel chose Chris by ear, so the TTS blind test runs only if Abel still wants it.
- The PR that sets up hosting or email names the provider in `LEGAL_PAGES`, adds a rewrite for `/terms` and `/privacy`, and rechecks "nothing deletes on a timer". A hosted project keeps its own email template and needs the shorter code expiry M2.10 recommends.

## Appendix E. Follow-ups

These have no PR yet. Each one goes in the next free slot or with the PR named.

- **CI's next lever.** `checks` is now a gate over two jobs, `typecheck-and-web` and `api-and-agent`, each with the 4 minute limit and its own 2 threads. One job could not get well under the limit, because 2 busy threads on the slowest runner seen, an EPYC 7763, give about 1.3 times one thread. The next saving is less CPU work. `tsc --incremental` with a restored build info file used about half the CPU in a local trial, and neither it nor `eslint --cache` has been measured on a runner. Do not raise the limit without Abel.
- **A PR's cache.** A PR needs a new merge commit to get a new Postgres entry, because a rerun reuses the old merge.
- **CI gates read `success`.** Every gate reads a job's conclusion as `success`, because a timeout concludes `cancelled` and `gh pr checks` can exit 0 on it. The root's merges already read it this way, so owners' and reviewers' gates follow.
- **Compare CI runs fairly.** Compare the same CPU model, printed by `lscpu` in a temporary step, because the same step varies by about 50% between runners.
- **README.** Step 16 of the hosted checklist must run after step 5, or `DROP SCHEMA "app"` fails loudly. `README.md:77` is loose about `auth`, and its run counts are low.
- **Data layer.** An old checkout on an upgraded database locks out head with `relation "migrations" already exists`, so rebase lanes and delete the startup `ALTER`. `row-security.spec.ts` reads `attnum = 1` without filtering dropped columns, a false failure. Close the lint gaps for dynamic and required TypeORM imports, and for entities importing from feature folders. A hand-written `SECURITY DEFINER` function is not covered.
- **Picks.** The library is thin at some levels, with 5 or 6 of 6 cards shared in 110 of 792 pairs. Goal reasons have no source behind them. The `bastille` label says engraving and the Met says etching. The `draughtsman` crop cuts off the wall pin its line asks about, so M3.10 fixes that line before it reads `openingLine`.
- **Web app.** Returning to a tab after a failure still hides Try again. No App-level test says a signed-out student on a student route sees sign-in. A session start that times out and retries can save a second session.
- **Look polish, from PR 83's review.** `textToDots` trusts the canvas read, so noise in privacy-hardened Firefox forms a dotted rectangle, and a throwing `getImageData` gives the error page, because the call runs in render. Add try/catch and a solid-pixel sanity check. A long name's title wraps and overprints the `HISTORY` label from 33 characters at 1021. After a reload the name's dots use a fallback serif until the name changes, because `useStepChart` memoizes before Newsreader loads. The whole-mail code search takes the first exact run, which matters if the mail gains another number. On `·Dark`, a grid dot shows through the unpressed toggle. At 390, `Sign out` and `Back` are under 24 px tall. The theme tokens `--text-sheet-name*`, `--container-sheet`, `--grid-template-columns-onboarding`, `--grid-template-columns-sheet-row`, and `--spacing-onboarding-side` are unused.
- **The eight-digit code.** Abel chose 6 digits. `README.md` works out that an attacker who asks for a new code every 10 minutes has about 33% in the first hour from 1,000 sources, and about 0.4% with 8 digits. With a real 612 s wait, expiry is true. `CODE_LENGTH` lives in `apps/web/src/auth/codeLength.ts`, so the change is small if Abel wants it.
- **M3.2 polish.** Pin the 200 ms rule with a test, since 150 passes all 73 board tests, and raw shows 150 let a 182 ms word run a turn 328 ms early. Add tests for removing `hasTurnWordTimes = false` and the `hasSentSound` check. Decide a rewind pressed just before a cut, which shows 3.01 and not 1.
- **For M3.4, from M3.2's review.** M3.4 owns the `overWords` row.
- **For M3.6, from M3.2's review.** The page reload offset in `session-log.ts`, refused reports killing the agent, the lab clock race, resume double-firing beats, tight room token grants, word time holes, and a 320 ms lag step with no report on the delay profile. `stop` on a finished turn sends a stop but leaves no silence, so a stored reaction played 69 to 89 ms later is muted and its cue runs about 1030 ms late. Make it send nothing, and narrow the guard's sentence to live turns. Read `onFailure`, because `finished` never rejects.
- **For M3.14, from M3.2's and M3.6's reviews.** Add a guard and a cache at the scene catalog boundary, because the catalog rebuilds per frame and `Scene.parts` is unread. Handle a throwing catalog during a stop and NaN durations, and use async `getFrame` for a sandbox. `run-lesson.ts:119` passes no `onFailure`, so a failure hides. Make `onFailure` required and guard a listener that throws. Fix the same faults M3.6 fixed in `run-lesson`, namely the `getRestOfTurn` double-fire, unguarded `JSON.parse` in `DataReceived`, and wide grants in `lesson-service.ts`.
- **From M3.6's review.** M3.6's fix round moves to one mic state machine, the highest report per beat, audio buffered over Muse's handshake, a 10 minute idle cap with a warning, closing rooms when sessions finish, and region recorded beside stops. M3.7 needs per-session limits on data messages, because 150 forged `typed` lines in 143 ms started 150 replies, and it must handle a beat in flight lost on a cut that keeps the thought. A hosted agent is needed to judge voice reaction, stop, first sound to silence, first word, and join time. LiveKit can split a room across regions, which a hosted agent will not fix.
- **A worker that prepares scenes ahead, after the MVP.** Abel's idea for later is a worker that plans and pre-generates lessons for recommended sections, so speed improves the more students use it. For the MVP, Abel ruled it out, to keep cost down. It stays separate from M3.15's one-time library and from writing next scenes inside a running lesson.
- **Cleanup.** Remove test databases `astra_m2_2`, `astra_m2_8`, `astra_v_m28`, `astra_ci_speed`, and `astra_abel_onboarding`, and test users `m2-4-*`, `m2-8-*`, and `v28-*`. The remote branch `wip/m3-1-fix2` is a leftover, and its deletion was refused, so it stays until Abel removes it.
