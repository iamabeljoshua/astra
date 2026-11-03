# Astra MVP plan

This plan takes Astra from an empty repo to a first working MVP, for Abel and the first test students.
A student signs in, is onboarded, and picks a card or asks a question on Home.
They then have a real spoken lesson, with the tutor drawing in time with its words, working from a lesson plan and calling tools only when it needs them.
Afterwards the tutor remembers them, recommends what comes next, and lets them replay the session.
The rule the program enforces is the PRD's rule for the board and the tutor, proved on the real app at every PR.
The PR ids in order are M1.1, M1.2, M1.3, M1.5, M1.4, M1.6, M2.1, M2.3, M2.6, M2.2, M2.4, M2.5, M3.1, M3.2, M3.3, M3.4, M3.5, M3.6, M3.7, M3.8, M3.9, M3.10, M3.11, M4.1, M4.2, M4.3, M4.4, M4.5.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `skills/poteto-mode/playbooks/autopilot-full.md` from the installed plugin, changed by the rules in `CLAUDE.md`. The root merges each PR once its verdict is clean, without Abel's click, as `CLAUDE.md` allows. Stop-list decisions still stop for Abel, and they are named in the Build boxes of M2.3, M2.4, M3.1, M3.2, M3.6, and M3.7.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

Each PR has one GitHub issue with the same acceptance criteria, and this plan holds the detail. The stack is React with Vite for the web app and NestJS with Postgres for the API, as Abel chose on 2 November 2026. From M1.5 on, HTTP shapes are `class-validator` DTOs in `apps/api`, Swagger docs come from their comments, and the web app uses types generated from the OpenAPI document. `packages/contracts` keeps those generated types and hand-written shapes that are not HTTP, such as the scene language. From M1.6 on, the web app calls the API only through its typed client and React Query. Postgres and sign-in run on Supabase, locally through the Supabase CLI, with TypeORM connected directly.

| Milestone | What it delivers | PRs |
| --- | --- | --- |
| M1 Foundation | One running app, automatic checks, the approved look, and a database. | M1.1, M1.2, M1.3, M1.5, M1.4, M1.6 |
| M2 Student app | Sign-in, onboarding, the home screen, picks, and the session list. | M2.1, M2.3, M2.6, M2.2, M2.4, M2.5 |
| M3 Live tutor | A real session end to end, with voice, the board, the tutor agent, and lesson plans. | M3.1, M3.2, M3.3, M3.4, M3.5, M3.6, M3.7, M3.8, M3.9, M3.10, M3.11 |
| M4 Learning loop | Memory, personal teaching, recommended picks, recap and replay, and safety. | M4.1, M4.2, M4.3, M4.4, M4.5 |

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on the operator's explicit go.
- [ ] Propose the commands to allow in `.claude/settings.json` for the operator's approval, because an unapproved command pauses the run.
- [ ] On the operator's go, write this exact text into the standing orders and restate it in your todolist. "Plan `docs/plans/mvp.md`. PRs in order M1.1, M1.2, M1.3, M1.5, M1.4, M1.6, M2.1, M2.3, M2.6, M2.2, M2.4, M2.5, M3.1, M3.2, M3.3, M3.4, M3.5, M3.6, M3.7, M3.8, M3.9, M3.10, M3.11, M4.1, M4.2, M4.3, M4.4, M4.5. Tests alone are not sufficient verification, and a PR is verified only when its unit, live, and perf boxes are all checked. The root merges after a clean verdict, as `CLAUDE.md` allows. At most 3 PRs at a time. Done when every box is checked with evidence and M3.10's recording is posted."
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
- [ ] Run at most 3 PRs at a time, and only when they are independent. Dependent work waits for its parent PR to merge, as `CLAUDE.md` requires.
- [ ] Follow this dependency graph.
  - [ ] M1.1 is first and branches from `main`.
  - [ ] M1.2 after M1.1.
  - [ ] M1.3 after M1.1.
  - [ ] M1.5 after M1.1.
  - [ ] M1.4 after M1.1 and M1.5.
  - [ ] M1.6 after M1.3 and M1.5.
  - [ ] M2.1 after M1.3 and M1.4 and M1.6.
  - [ ] M2.3 after M1.3 and M1.4 and M1.6.
  - [ ] M2.6 after M2.1 and M2.3.
  - [ ] M2.2 after M1.4 and M2.1 and M2.6.
  - [ ] M2.4 after M2.1 and M2.3 and M2.6.
  - [ ] M2.5 after M2.1 and M2.3 and M2.6.
  - [ ] M3.1 after M1.4.
  - [ ] M3.2 after M3.1 and M1.3.
  - [ ] M3.3 after M3.2.
  - [ ] M3.4 after M3.2.
  - [ ] M3.5 after M3.3 and M3.4.
  - [ ] M3.6 after M3.1.
  - [ ] M3.7 after M3.2 and M3.6.
  - [ ] M3.8 after M3.7.
  - [ ] M3.9 after M3.8 and M2.5.
  - [ ] M3.10 after M3.5 and M3.9.
  - [ ] M3.11 after M3.10.
  - [ ] M4.1 after M3.10.
  - [ ] M4.2 after M4.1.
  - [ ] M4.3 after M4.1 and M2.2.
  - [ ] M4.4 after M3.10 and M4.1.
  - [ ] M4.5 after M3.10.
- [ ] Hold the file boundaries. Each PR touches only the paths in its **Files.** block and the root config it needs.
- [ ] Comment on the issue when its PR opens, when verification finishes, when it merges, and when it gets blocked. Every PR says `Closes #<issue>`.
- [ ] Post screenshots on the issue for every PR that changes a screen, so Abel can look at any time without blocking the merge.

### PR mechanics, for every PR

- [ ] Resolve the forge once. Default to `gh`; if `command -v origin` succeeds and Origin can resolve the repository, use `origin pr` for every PR operation. Record any fallback to `gh`. Never require `gt`.
- [ ] Open the PR ready, never draft, per **Opening a PR**.
- [ ] Run the repo's lint and typecheck once before the PR-facing push. Push with hooks on.
- [ ] Run `/deslop` before each commit and `/no-comments` before review.
- [ ] Triage every review-bot and security-reviewer comment per `references/bugbot-triage.md`.
- [ ] Before the code-ready report and babysit, and again after merge prep, record the base and head SHAs prepared by the topology owner under the execution playbook.
- [ ] Never credit Claude or AI in commits or PR bodies, as Abel's global rules require.

### Verdict and merge, for every PR

- [ ] A full verification runs once, at the code-ready head, with 5 independent agents as `CLAUDE.md` sets out. One runs the gates, two run the live lanes, and two audit the diff. All run on Opus 5.5 except one audit agent on Sonnet. M2.3 gets the full verification set from the playbook, because it touches auth.
- [ ] Another full verification runs only for new behavior, a redesign, or a large new diff. A rebase, a merge-conflict resolution, or a minor fix gets a single verifier at the new head, and a wording-only change gets none.
- [ ] Judge every finding by the execution playbook's blocking rule. The verdict is clean when none blocks. A failure on trunk behavior in a lane marked `Regression lane against trunk.` is recorded against trunk and does not block the PR.
- [ ] The root merges after a clean verdict, with the conditions and command in `CLAUDE.md`, and applies the patch-id rule from `playbooks/shipping.md`.

### Boot recipe, for every live lane

Each live lane runs in its own worktree at the PR head. Drive through the skill path or exact commands recorded in this boot recipe.

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>`.
- [ ] Run `pnpm install --frozen-lockfile`, `pnpm db:up`, `pnpm db:migrate`, `pnpm db:seed`, and `pnpm dev`, using the commands that exist at that PR. Wait until the web app and the API both answer.
- [ ] Deliver input only through `.claude/skills/verify/SKILL.md` once M1.2 has merged. Read-only diagnostics are the browser console, the API logs, and the agent logs.
- [ ] Save every screenshot to `/tmp/swarm-<pr-id>/worker-<n>/<slug>.png` and return the paths with the report.

## Set up the app and automatic checks (M1.1)

**Depends on.** None.

**Files.**

- [ ] Create `pnpm-workspace.yaml`, the root `package.json`, and `.nvmrc`.
- [ ] Create `apps/web/`, `apps/api/`, and `packages/contracts/`.
- [ ] Create `.github/workflows/ci.yml`.
- [ ] Create `README.md`.

**Build.**

- [ ] Set up a pnpm workspace with `apps/web` on React and Vite, `apps/api` on NestJS, and `packages/contracts` for shared types, following the layout of `agentic-tutor`.
- [ ] Add `GET /health` in `apps/api/src/health/`, typed from `packages/contracts`, and show its result on the web page.
- [ ] Add `pnpm dev`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` at the root.
- [ ] Add one CI job that caches pnpm and runs the three checks.

**You see.**

- [ ] One documented command starts the web app and the API, and the browser shows a plain page with the product name and a line saying the API is connected.
- [ ] The web app uses React with Vite, the API uses NestJS, and both use TypeScript with strict type checking on.
- [ ] Lint, typecheck, and tests each run with one command, and all pass on a fresh clone.
- [ ] Every PR runs those three checks on GitHub, and a failing test turns the PR's check red.
- [ ] A full CI run finishes in under 3 minutes, to protect the free Actions minutes.
- [ ] The README explains how to install, run, and test the app.
- [ ] No paid service is added.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `apps/api/src/health/health.controller.spec.ts` asserts the health response. Run `pnpm test`.
- [ ] `apps/web/src/App.test.tsx` asserts the product name renders. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the 5-agent rule in `CLAUDE.md`.

- [ ] Lane 1. Regression lane against trunk. Trunk has no app, so record that and gate the fresh path. Clone fresh, run `pnpm install` and `pnpm dev`, and load the page. Save `m1-1-home.png`. Pass when the page shows the product name and says the API is connected.
- [ ] Lane 2. Push a throwaway commit with a failing test to a temporary branch, then remove it. Save `m1-1-ci-red.png`. Pass when the check turns red with the failing test and green once it is removed, in under 3 minutes.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [ ] Probe. None.
- [ ] Baseline. None.
- [ ] Rule. None.

**Review gate.** None. M1.1 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Let agents open and test the real app (M1.2)

**Depends on.** M1.1.

**Files.**

- [ ] Create `.claude/skills/verify/SKILL.md` and its scripts.

**Build.**

- [ ] Run `/pstack:create-verification-skill` against the running app and record the driver commands in `.claude/skills/verify/SKILL.md`.
- [ ] Use a browser driver that supports WebGL and audio, because the board and voice PRs need both.

**You see.**

- [ ] A project skill exists in `.claude/skills/` and is tracked in git, created with `/pstack:create-verification-skill`.
- [ ] Following only that skill, an agent starts the app from a clean copy and saves a screenshot with no human help.
- [ ] The skill can capture both laptop and phone widths.
- [ ] When a page is deliberately broken, the skill reports a failure.
- [ ] The skill shuts the app down afterwards and leaves nothing running.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] The skill's own check script asserts a failing exit code on a page that throws. Run `pnpm verify:self`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the 5-agent rule in `CLAUDE.md`.

- [ ] Lane 1. Regression lane against trunk. Trunk has no skill, so record that and gate the end state. From a clean worktree, follow only the skill to start the app and capture laptop and phone widths. Save `m1-2-laptop.png`. Pass when both screenshots exist and no human input was needed.
- [ ] Lane 2. Break the home page on purpose in a worktree, then run the skill. Save `m1-2-broken.png`. Pass when the skill reports the failure, and no app process is left running afterwards.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [ ] Probe. None.
- [ ] Baseline. None.
- [ ] Rule. None.

**Review gate.** None. M1.2 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Build the look and app shell (M1.3)

**Depends on.** M1.1.

**Files.**

- [ ] Create `packages/theme/`.
- [ ] Create `apps/web/src/shell/`, `apps/web/src/strings.ts`, and `apps/web/src/theme/`.
- [ ] Add the Barlow and Newsreader font files under `apps/web/public/fonts/`, so student browsers make no call to a font service.

**Build.**

- [ ] Define the tokens from `docs/DESIGN.md` in `packages/theme` and expose them as CSS variables and Tailwind colors.
- [ ] Build `AppShell`, `Sidebar`, and the `MENU` list, using `docs/design/app-prototype/` as the reference.
- [ ] Add a lint rule that rejects literal colors in `apps/web/src`.
- [ ] Set the theme before first paint to prevent a flash.

**You see.**

- [ ] Colors and fonts come from one place and match `docs/DESIGN.md`, and a check finds no hard-coded colors in components.
- [ ] Light is the default, the sidebar has a dark toggle, and the choice survives a reload with no flash of the wrong theme.
- [ ] The sidebar shows the product name, Home, Sessions, an empty Recent section, and the student's account row, at the prototype's sizes.
- [ ] Adding a menu item is a one-line change to one list.
- [ ] All app text lives in one module, and changing the product name there changes it everywhere.
- [ ] At phone width the sidebar becomes a Menu button, and no page scrolls sideways at 390px.
- [ ] Keyboard focus is always visible, the reduced-motion setting is honored, and nothing flashes more than three times a second.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `Sidebar.test.tsx` asserts that a new `MENU` entry renders a row.
- [ ] `strings.test.ts` asserts that every string the shell uses comes from `strings.ts`.
- [ ] `theme.test.ts` asserts that the saved choice is read and applied. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the 5-agent rule in `CLAUDE.md`.

- [ ] Lane 1. Regression lane against trunk. Trunk has no shell, so record that and gate the end state. Load Home and Sessions at laptop width in light and dark. Save `m1-3-laptop.png`. Pass when the layout matches the app prototype and reload keeps the theme with no flash.
- [ ] Lane 2. Load both pages at 390px, open the Menu, and tab through every control. Save `m1-3-phone.png`. Pass when nothing scrolls sideways and every focused control shows a visible ring.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [ ] Probe. None.
- [ ] Baseline. None.
- [ ] Rule. None.

**Review gate.** None. M1.3 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Add validated request shapes and Swagger docs from code comments (M1.5)

**Depends on.** M1.1.

**Files.**

- [ ] Create `apps/api/nest-cli.json` settings and `apps/api/test/swagger-transformer.cjs`.
- [ ] Edit `apps/api/src/main.ts`, `apps/api/src/health/`, and the Jest config in `apps/api/package.json`.
- [ ] Create `packages/contracts/src/api.generated.ts`.
- [ ] Edit `apps/web/src/useApiConnection.ts`, `.github/workflows/ci.yml`, and `README.md`.

**Build.**

- [ ] Add `@nestjs/swagger`, `class-validator`, and `class-transformer`, and enable the plugin in `apps/api/nest-cli.json` with `introspectComments` and `classValidatorShim`.
- [ ] Add a global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, and `transform`.
- [ ] Use DTO classes for query strings and route parameters as well as bodies, so their comments reach Swagger without relying on `@param` tags.
- [ ] Register the plugin's AST transformer with `ts-jest`, because Jest compiles in memory and skips the Nest CLI plugin.
- [ ] Serve Swagger UI at `/docs` only in development.
- [ ] Add `pnpm api:types`, which generates `packages/contracts/src/api.generated.ts` from the OpenAPI document with `openapi-typescript`, and add a CI check for drift.
- [ ] Keep hand-written shapes that are not HTTP, such as the scene language, in `packages/contracts`.

**You see.**

- [ ] Every request body, query string, and route parameter is a DTO class with `class-validator` rules.
- [ ] The API rejects bad input with a clear 400 error that names the field, and it rejects fields a DTO does not declare.
- [ ] A comment on a DTO field appears in Swagger as that field's description, and a comment on a controller route appears as its summary, with no Swagger decorators written by hand.
- [ ] Swagger UI opens at `/docs` in development, and `/docs-json` serves the OpenAPI document. Both are off in production unless Abel decides otherwise.
- [ ] The web app's API types are generated from that OpenAPI document, so the DTOs are the one source of truth, and CI fails if the generated types are out of date.
- [ ] The health route is the worked example, and the README explains how to add a new DTO.
- [ ] No paid service is added.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `validation.spec.ts` asserts that a bad body returns 400 naming the field, and that an undeclared field is rejected.
- [ ] `openapi.spec.ts` asserts that a comment on a DTO field becomes its description and that a route comment becomes its summary. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the 5-agent rule in `CLAUDE.md`.

- [ ] Lane 1. Regression lane against trunk. Trunk has no Swagger, so record that and gate the end state. Start the API and open `/docs`. Save `m1-5-docs.png`. Pass when the health route and its DTO show descriptions taken from code comments.
- [ ] Lane 2. Send bad input to a test-only validated route, then change a DTO without regenerating types on a temporary PR. Save `m1-5-drift.png`. Pass when the API returns a 400 naming the field and CI fails on the stale generated types.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [ ] Probe. None.
- [ ] Baseline. None.
- [ ] Rule. None.

**Review gate.** None. M1.5 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Add the database for students and sessions (M1.4)

**Depends on.** M1.1, M1.5.

**Files.**

- [ ] Create `supabase/config.toml`, pin the Supabase CLI as a root dev dependency, and add the `pnpm db:*` scripts to the root `package.json`.
- [ ] Create `apps/api/src/database/`, `apps/api/src/students/`, and `apps/api/src/sessions/`, with DTOs for `Student`, `StudentProfile`, and `Session`.

**Build.**

- [ ] Run Postgres through the local Supabase stack, and connect TypeORM to it directly with `DATABASE_URL`, with app tables in a private `app` schema that Supabase's anon key cannot reach. A hosted project later needs the environment values, TLS settings, and dashboard steps in the README. TypeORM owns the migrations, `synchronize` stays off, and nothing writes to the `auth` schema.
- [ ] Name the data shapes first as entities and DTOs in `apps/api`, with `language` stored on each session so languages can be added later (PRD Q12).
- [ ] Validate every request at the API boundary with the DTOs and global validation from M1.5.
- [ ] Add `pnpm db:up`, `pnpm db:migrate`, and `pnpm db:seed`.

**You see.**

- [ ] One command starts the local Supabase stack with Postgres, with no Supabase account, and one command builds a fresh database from migrations.
- [ ] The database stores students, their profiles and interests, and their sessions, including each session's language.
- [ ] A seed command creates an example student with six example sessions, matching the prototype.
- [ ] The API rejects bad input with a clear error, and valid input saves and reads back the same.
- [ ] CI runs the migrations against a fresh database on the same Postgres image as the local stack, and a CI run stays under 3 minutes.
- [ ] No paid service is added.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `students.service.spec.ts` and `sessions.service.spec.ts` assert save and read back against a test database.
- [ ] A validation test asserts that bad input is rejected. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the 5-agent rule in `CLAUDE.md`.

- [ ] Lane 1. Regression lane against trunk. Trunk has no database, so record that and gate the end state. Build a fresh database, seed it, and read the example student through the API. Save `m1-4-api.png`. Pass when the API returns the student and six sessions.
- [ ] Lane 2. Post invalid profile data, then restart the API and read saved data back. Save `m1-4-invalid.png`. Pass when the bad request returns a clear 400 error and saved data survives the restart.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [ ] Probe. None.
- [ ] Baseline. None.
- [ ] Rule. None.

**Review gate.** None. M1.4 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Add React Query and a typed API client (M1.6)

**Depends on.** M1.3, M1.5.

**Files.**

- [ ] Create `apps/web/src/api/`, with the client, the query client defaults, and the error shape.
- [ ] Create the test helper under `apps/web/src/test/`.
- [ ] Edit `apps/web/src/useApiConnection.ts`, the app root, `packages/contracts/src/index.ts`, the ESLint config, and `README.md`.

**Build.**

- [ ] Add `@tanstack/react-query` and `openapi-fetch`, and create one client typed from the `paths` that `packages/contracts` exports.
- [ ] Create one `QueryClient` with shared defaults, and mount its provider at the app root.
- [ ] Map every failed response to one `ApiError` shape, including the field messages from a validation 400.
- [ ] Move `useApiConnection` onto `useQuery`, keeping its retry, stop, and timeout behavior.
- [ ] Leave one place in the client where M2.3 can attach sign-in, without building sign-in here.
- [ ] Add a lint rule that rejects `fetch` outside `apps/web/src/api/`.

**You see.**

- [ ] The web app has one API client, typed from the generated OpenAPI types, so calling a route that does not exist or sending a wrong body fails typecheck.
- [ ] React Query is set up once at the app root, with shared defaults for retries, caching, and errors.
- [ ] The API connection line on Home now uses this setup and behaves as before. It keeps checking until connected, stops once connected, and gives up on a check that never answers.
- [ ] A failed request gives screens one clear error shape, including which field a 400 rejected.
- [ ] A direct `fetch` call outside the API client fails lint.
- [ ] The README explains how to add a query and a mutation, and tests have one helper for rendering a component that uses a query.
- [ ] React Query devtools appear only in development and are not in the production build.
- [ ] No paid service is added.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] The tests for `useApiConnection` keep passing, covering retry, stop once connected, and timeout.
- [ ] `client.test.ts` asserts the `ApiError` shape for a 400, a 500, and a network failure, and uses `@ts-expect-error` to prove that a wrong route and a wrong body fail typecheck.
- [ ] A lint fixture asserts that `fetch` outside the client is rejected. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the 5-agent rule in `CLAUDE.md`.

- [ ] Lane 1. Regression lane against trunk. Run the same restart of `pnpm dev` with a tab open at trunk and head. Save `m1-6-home.png`. Pass when the page ends on the connected message with no reload at both, and head stops checking once connected.
- [ ] Lane 2. Follow the README to add a query and a mutation against a temporary DTO route, then send bad input and call a wrong route. Save `m1-6-guide.png`. Pass when the steps work as written, the screen receives the field error, and typecheck rejects the wrong route.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [ ] Probe. None.
- [ ] Baseline. None.
- [ ] Rule. None.

**Review gate.** None. M1.6 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Build the home screen (M2.1)

**Depends on.** M1.3, M1.4, M1.6.

**Files.**

- [ ] Create `apps/web/src/home/`.
- [ ] Add `GET /home` in `apps/api/src/home/`.
- [ ] Add `HomeScreen` DTOs in `apps/api/src/home/`.

**Build.**

- [ ] Build `HomeScreen`, `ChatBox`, `ContinueCard`, and `PickCard` from `docs/design/app-prototype/`.
- [ ] Serve the screen's data from `GET /home` using the seeded student.

**You see.**

- [ ] The screen matches the app prototype at laptop width in light and dark, with the main content fitting without scrolling.
- [ ] The greeting uses the student's name and asks what they want to learn next.
- [ ] The chat box stays pinned to the bottom, grows as the student types, and has a send button that only works with text in the box.
- [ ] The chat box has controls for a photo or PDF and for talking. They show their state, and their real behavior arrives in later PRs.
- [ ] The continue card shows the unfinished session and a drawing from its board.
- [ ] At phone width the chat box stays docked at the bottom, and the cards stack in one column.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `ChatBox.test.tsx` asserts send is disabled when empty, that Enter sends, and that Shift plus Enter adds a line.
- [ ] `home.controller.spec.ts` asserts the response shape. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the 5-agent rule in `CLAUDE.md`.

- [ ] Lane 1. Regression lane against trunk. Trunk has an empty Home, so record that and gate the end state. Load Home at laptop width in light and dark. Save `m2-1-home.png`. Pass when it matches the prototype and the chat box sits at the bottom without scrolling.
- [ ] Lane 2. Load Home at 390px and type a long question. Save `m2-1-phone.png`. Pass when the chat box stays docked and grows, the cards stack, and nothing scrolls sideways.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [ ] Probe. None.
- [ ] Baseline. None.
- [ ] Rule. None.

**Review gate.** None. M2.1 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Add sign-in and the age gate (M2.3)

**Depends on.** M1.3, M1.4, M1.6.

**Files.**

- [ ] Create `apps/api/src/auth/` and `apps/web/src/auth/`.
- [ ] Add consent and age fields to the student DTOs and a migration.

**Build.**

- [ ] Use Supabase Auth, Abel's decision on 3 November 2026, and link each student to their Supabase user ID.
- [ ] Add the sign-in flow with Supabase Auth, and a development-only sign-in against the local stack, where sign-in emails land in its local inbox.
- [ ] Add an API guard that verifies the Supabase token, and an ownership check at the data boundary.

**You see.**

- [ ] Sign-in runs on Supabase Auth, and the API accepts only a valid Supabase token.
- [ ] A student can sign in with an email link, stay signed in across a reload, and sign out. Google sign-in is wired, and its button stays hidden until Google credentials exist.
- [ ] The date-of-birth question asks neutrally, and a student under 13 is stopped and cannot retry.
- [ ] Every API route that holds student data requires a signed-in student, and one student cannot read another's data.
- [ ] Local development works without real email or a Google account.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `age-gate.spec.ts` asserts the 13 boundary, including birthdays on the day.
- [ ] `auth.guard.spec.ts` asserts anonymous and cross-student requests are refused. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the 5-agent rule in `CLAUDE.md`.

- [ ] Lane 1. Regression lane against trunk. Trunk has no sign-in, so record that and gate the end state. Sign in with the development path, reload, and sign out. Save `m2-3-signin.png`. Pass when the student stays signed in across the reload and is refused after signing out.
- [ ] Lane 2. Enter a birth date under 13, try again, then call another student's data with a valid session. Save `m2-3-gate.png`. Pass when the student is stopped and cannot retry, and the cross-student call is refused.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [ ] Probe. None.
- [ ] Baseline. None.
- [ ] Rule. None.

**Review gate.** None. M2.3 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Move the data layer to entities and repositories (M2.6)

**Depends on.** M2.1, M2.3.

**Files.**

- [ ] Move `apps/api/src/database/` and each feature's entities to `apps/api/src/infrastructure/orm/`.
- [ ] Create `apps/api/src/infrastructure/orm/repositories/` with one repository per aggregate and a `repository.module.ts`.
- [ ] Edit each feature's service and module, the ESLint config or a spec for the check, and `README.md`.

**Build.**

- [ ] Read `clique-cloud`'s `apps/backend/src/infrastructure/orm/` and copy its layout, naming, and how services use repositories. It uses Sequelize, so keep only the structure.
- [ ] Move data access from services into named repository methods, and keep mapping to response DTOs in services, so no entity reaches a response.
- [ ] Have `pnpm db:migration <name>` bring the database up to date and generate into the migrations folder, and discover entities and migrations by path in place of the hand-kept lists.
- [ ] Add the check that keeps TypeORM's repository API inside `infrastructure/orm`.

**You see.**

- [ ] Entities live in `apps/api/src/infrastructure/orm/entities/`, repositories in `apps/api/src/infrastructure/orm/repositories/`, and migrations in `apps/api/src/infrastructure/orm/migrations/`, following `clique-cloud`'s layout. The API stays on TypeORM.
- [ ] Services call named repository methods, and only repositories use TypeORM. A check fails if TypeORM's repository API is used anywhere else.
- [ ] `pnpm db:migration <name>` generates a migration from entity changes, with no SQL written by hand, and a new entity or migration is found with no list to edit.
- [ ] A test or CI step fails when an entity changes with no migration, and app tables stay in the private `app` schema.
- [ ] Every API route answers exactly as before, and students see no change.
- [ ] The README explains how to add an entity, a repository, and a migration.
- [ ] No paid service is added.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] The existing service, route, drift, and schema specs keep passing with their behavior unchanged.
- [ ] A new spec asserts that a planted use of TypeORM's repository outside `infrastructure/orm` fails the check. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the 5-agent rule in `CLAUDE.md`.

- [ ] Lane 1. Regression lane against trunk. Send the same requests to every API route at trunk and head, signed in as the same student. Save `m2-6-api.png`. Save `m2-6-api.png`. Pass when status and body match on every route, and Home and sign-in look the same.
- [ ] Lane 2. Follow the README to add a real temporary entity, a repository, and a column, and generate the migrations. Save `m2-6-migration.png`. Save `m2-6-migration.png`. Pass when the steps work as written, nothing is edited by hand, the migrations apply on a fresh database, and the new table stays closed to Supabase's anon key.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [ ] Probe. None.
- [ ] Baseline. None.
- [ ] Rule. None.

**Review gate.** None. M2.6 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Add the library of pre-made picks (M2.2)

**Depends on.** M1.4, M2.1, M2.6.

**Files.**

- [ ] Create `apps/api/src/picks/` with `library.json`.
- [ ] Add images under `apps/web/public/picks/`.
- [ ] Create `docs/credits.md`.

**Build.**

- [ ] Write the library as data, not code.
- [ ] Add a pure function `getPicksForStudent` that filters by level and scores by interests.
- [ ] Record every image's source in `docs/credits.md`.

**You see.**

- [ ] The library holds at least 30 topics across math, physics, chemistry, computer science, and a few curiosity subjects.
- [ ] Every card has a title, a subject, a length, an opening line, and a normal image or one of our own drawings.
- [ ] Home shows six cards that fit the student's level and interests, and each states its reason.
- [ ] Two different students see visibly different cards.
- [ ] Every image is public domain or our own, with its source recorded, and no game, film, or team images appear (PRD Q16).

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `getPicksForStudent.spec.ts` asserts level filtering, interest scoring, and a stated reason on every card.
- [ ] A data test asserts every library entry is complete and every image file and credit exists. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the 5-agent rule in `CLAUDE.md`.

- [ ] Lane 1. Regression lane against trunk. Trunk shows seeded cards only, so record that and gate the end state. Load Home as a seeded basketball student. Save `m2-2-basketball.png`. Pass when six cards appear, each with a picture and a reason.
- [ ] Lane 2. Load Home as a seeded student with different interests and level. Save `m2-2-other.png`. Pass when the cards differ from lane 1 and their reasons match this student.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [ ] Probe. None.
- [ ] Baseline. None.
- [ ] Rule. None.

**Review gate.** None. M2.2 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Build onboarding (M2.4)

**Depends on.** M2.1, M2.3, M2.6.

**Files.**

- [ ] Create `apps/web/src/onboarding/`.
- [ ] Create `apps/api/src/onboarding/` and `apps/api/src/consent/`.

**Build.**

- [ ] Build the steps as one table in `apps/web/src/onboarding/steps.ts`, so the order and the parent step come from data.
- [ ] Log the consent link locally for now. Abel chooses the email service later, and this PR can merge without it. Real email must ship before any real student under 18 signs up.
- [ ] Use browser voices as stand-ins until M3.6 provides real samples, and swap them in that PR.
- [ ] Script the first exchange until M3.10 connects the real tutor.

**You see.**

- [ ] The welcome screen says "A learning app, made for you" and states that the tutor is an AI.
- [ ] Each screen asks one thing, in the prototype's order, and the sheet fills in with each answer and shows the student's name as they type.
- [ ] A student under 18 gives a parent's email address, one consent link is logged locally in place of the email, and the account waits until they accept.
- [ ] The student picks from three voices and hears each one.
- [ ] The last screen is a first exchange with the tutor, and the student's answer appears on Home as a card to start from.
- [ ] All answers are saved to the student's profile and can be changed later.
- [ ] A first-time student finishes in under two minutes.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `steps.test.ts` asserts that the parent step appears only under 18.
- [ ] `consent.service.spec.ts` asserts that an unconfirmed minor cannot start a session. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the 5-agent rule in `CLAUDE.md`.

- [ ] Lane 1. Regression lane against trunk. Trunk has no onboarding, so record that and gate the end state. Complete onboarding as an adult at laptop width and time it. Save `m2-4-adult.png`. Pass when the sheet fills in, Home shows the first question, and the run takes under two minutes.
- [ ] Lane 2. Complete it as a 15-year-old at 390px, then accept the logged consent link. Save `m2-4-minor.png`. Pass when the account waits until the parent accepts and then continues.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [ ] Probe. None.
- [ ] Baseline. None.
- [ ] Rule. None.

**Review gate.** None. M2.4 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Start sessions and list them (M2.5)

**Depends on.** M2.1, M2.3, M2.6.

**Files.**

- [ ] Create `apps/web/src/session/` and `apps/web/src/sessions/`.
- [ ] Extend `apps/api/src/sessions/`.

**Build.**

- [ ] Add `POST /sessions`, `GET /sessions`, and `PATCH /sessions/:id`.
- [ ] Move the full-stop and fade from `docs/design/app-prototype/` into `apps/web/src/session/opening.ts`.
- [ ] Create the session record before the fade, so a refresh keeps the session.

**You see.**

- [ ] Sending a question makes the tutor's dot land where the full stop would be, and the page fades into the session screen.
- [ ] Selecting a card starts a session on that topic straight away.
- [ ] The session screen shows the board area, the tutor's dot, and a reply box, with stand-in content until M3.10.
- [ ] The Sessions page lists every session, newest first, with its title, subject, date, length, and status, and search filters the list.
- [ ] The sidebar's Recent list and the continue card show real sessions, and a new student sees a clear empty state.
- [ ] Ending a session marks it finished and returns to Home.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `sessions.controller.spec.ts` asserts ordering, search, and ownership.
- [ ] `opening.test.ts` asserts the full-stop position on one line and on a wrapped line. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the 5-agent rule in `CLAUDE.md`.

- [ ] Lane 1. Regression lane against trunk. Trunk has no real sessions, so record that and gate the end state. Send a typed question, end the session, and open Sessions. Save `m2-5-list.png`. Pass when the new session is first in the list and in Recent, and is marked finished.
- [ ] Lane 2. Start from a card, refresh during the session, then search for it from Sessions. Save `m2-5-card.png`. Pass when the refresh keeps the session and search finds it.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [ ] Probe. None.
- [ ] Baseline. None.
- [ ] Rule. None.

**Review gate.** None. M2.5 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Design the live session and get Abel's approval (M3.1)

**Depends on.** M1.4.

**Files.**

- [ ] Create `docs/architecture/live-session.md`.
- [ ] Add `Beat`, `Cue`, `SceneCommand`, and `SessionEvent` to `packages/contracts/`.

**Build.**

- [ ] Run `/pstack:architect` with a checkpoint, as `CLAUDE.md` requires for architectural decisions.
- [ ] Stop for Abel's review, add the `needs-human-review` label, and send a push notification.
- [ ] Prove the Node SDK facts by running small scripts, and record the results in the document.

**You see.**

- [ ] A design document explains the live session in plain language, with one diagram of what runs where.
- [ ] It defines the scene language, the beats that pair spoken words with drawing, and the session log, as real types in `packages/contracts`.
- [ ] It confirms whether LiveKit's Node SDK handles interruption, turn detection, and word timing as well as the Python one, and it recommends a language for the agent.
- [ ] It sets a time budget for each step between the student stopping and the tutor's first sound.
- [ ] Abel has reviewed the design and approved it before any live-session code is written.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `scene-language.test.ts` asserts that valid beats parse and that invalid beats are rejected. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the 5-agent rule in `CLAUDE.md`.

- [ ] Lane 1. Regression lane against trunk. Trunk has no live-session design, so record that and gate the end state. Run the Node SDK scripts the document cites. Save `m3-1-sdk.png`. Pass when each claim in the document matches a recorded run.
- [ ] Lane 2. Encode the sample session from PRD section 6.4 as beats using only the new types. Save `m3-1-beats.png`. Pass when the whole sample encodes and parses with no missing command.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [ ] Probe. None.
- [ ] Baseline. None.
- [ ] Rule. None.

**Review gate.** None. M3.1 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Make the board move in time with speech (M3.2)

**Depends on.** M3.1, M1.3.

**Files.**

- [ ] Create `packages/board/src/player/`.
- [ ] Create `apps/web/src/lab/` for a development-only test page.
- [ ] Create `docs/tests/scene-player.md`.

**Build.**

- [ ] Stop for Abel's approval of the Cartesia account, because it is a paid service.
- [ ] Build `ScenePlayer` so board state is rebuilt from a log of the events that actually played.
- [ ] Drive cues from the audio clock and word timestamps, never from timers.
- [ ] Record the measured numbers in `docs/tests/scene-player.md`, as PRD test 1 requires.

**You see.**

- [ ] A scripted lesson plays in the browser with real text-to-speech audio, and drawings appear as the matching words are spoken.
- [ ] Each drawing starts within 100 ms of its word, and a turn's first drawing appears within one second of its first word.
- [ ] Interrupting stops the audio and the board within 150 ms, and resuming continues with the board still correct.
- [ ] The same lesson replays exactly from its saved log, with no stored video.
- [ ] Abel has approved the text-to-speech account this PR uses.
- [ ] If any target is missed, the PR stops and reports the measured numbers to Abel before more board work starts.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `player.test.ts` asserts that cues fire on their words with a fake audio clock, that a stop discards unplayed cues, and that replaying a log rebuilds identical state. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the 5-agent rule in `CLAUDE.md`.

- [ ] Lane 1. Regression lane against trunk. Trunk has no player, so record that and gate the end state. Play the scripted lesson on the lab page and record it. Save `m3-2-lesson.png`. Pass when every drawing appears on its word in the recording.
- [ ] Lane 2. Interrupt the lesson at five different points and resume each time. Save `m3-2-interrupt.png`. Pass when audio and board stop together each time and the board stays correct after resuming.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. The drift between a word's audio start and its drawing's start, and the stop time after an interruption.
- [ ] Probe. Log both from the player during the scripted lesson on a mid-range laptop and at phone width with CPU throttling.
- [ ] Baseline. Trunk has no player, so these absolute budgets apply.
- [ ] Rule. Fail if p95 drift exceeds 100 ms or p95 stop time exceeds 150 ms.

**Review gate.** None. M3.2 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Draw math on the board (M3.3)

**Depends on.** M3.2.

**Files.**

- [ ] Create `packages/board/src/math/` and `packages/board/src/ink/`.
- [ ] Create `packages/board/src/layout/`.

**Build.**

- [ ] Render math with KaTeX and give each term a stable id for transforms.
- [ ] Add `writeMath`, `transformMath`, and `highlight` to the player.
- [ ] Build the layout engine that places every element, so the model only names what to show.

**You see.**

- [ ] The tutor can write an equation, highlight one term, and move a term so the equation rearranges smoothly.
- [ ] Fractions, exponents, roots, and matrices all render correctly in both themes.
- [ ] Equations place themselves, so the tutor never positions anything and nothing overlaps.
- [ ] Text and diagrams can be written with a natural handwriting-style stroke.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `transformMath.test.ts` asserts that matching terms keep their ids.
- [ ] `layout.test.ts` asserts that no two placed elements overlap. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the 5-agent rule in `CLAUDE.md`.

- [ ] Lane 1. Regression lane against trunk. Trunk has no math, so record that and gate the end state. Play a scripted algebra lesson on the lab page in light mode. Save `m3-3-algebra.png`. Pass when each step rearranges term by term and is readable.
- [ ] Lane 2. Play a dense lesson with fractions and matrices in dark mode at 390px. Save `m3-3-dense.png`. Pass when nothing overlaps, clips, or overflows.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Not applicable. `CLAUDE.md` adds a perf check only when a PR changes performance, and this PR does not.
- [ ] Probe. None.
- [ ] Baseline. None.
- [ ] Rule. None.

**Review gate.** None. M3.3 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Draw graphs, geometry, and real motion (M3.4)

**Depends on.** M3.2.

**Files.**

- [ ] Create `packages/board/src/plot/`, `packages/board/src/geometry/`, and `packages/board/src/motion/`.

**Build.**

- [ ] Add `plot`, `numberLine`, `geometry`, `vector`, and `simulate` commands to the player.
- [ ] Write the simulation models as pure functions with named parameters.
- [ ] Add sliders for simulation parameters (PRD Q11).

**You see.**

- [ ] The tutor can plot a function, mark points on a number line, and build a geometry figure step by step.
- [ ] The tutor can draw vectors and free-body diagrams.
- [ ] The jump shot arc is computed from real physics, so its shape is correct by calculation.
- [ ] A student can drag a slider, and the motion responds straight away.
- [ ] All plotted values come from computation in code, never from the model's text.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `projectile.test.ts` asserts range and peak against worked answers.
- [ ] `plot.test.ts` asserts sampling near discontinuities. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the 5-agent rule in `CLAUDE.md`.

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

## Finish the board library and prove no layout defects (M3.5)

**Depends on.** M3.3, M3.4.

**Files.**

- [ ] Create `packages/board/src/diagram/`, `packages/board/src/table/`, `packages/board/src/timeline/`, and `packages/board/src/code/`.
- [ ] Create `packages/board/test-deck/` and `scripts/check-layout.ts`.

**Build.**

- [ ] Add the remaining commands to the player.
- [ ] Write the 100-scene deck and the automated check for overlap, overflow, and clipping, and run it in CI.
- [ ] Add quality tiers set by measured frame rate (PRD Q13).

**You see.**

- [ ] The tutor can show labeled diagrams, tables, timelines, code blocks, and licensed or public-domain images.
- [ ] A test deck of 100 scripted scenes produces zero overlaps, overflows, or clipped elements under automated checks.
- [ ] The board runs at 60 fps on a mid-range laptop and at least 30 fps on a mid-range phone.
- [ ] On slower devices the board simplifies by itself, and audio and captions never degrade.
- [ ] The board honors reduced motion and never flashes more than three times a second.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `check-layout` fails on a seeded defect and passes on the full deck. Run `pnpm test:board`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the 5-agent rule in `CLAUDE.md`.

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

## Add live voice (M3.6)

**Depends on.** M3.1.

**Files.**

- [ ] Create `apps/agent/`.
- [ ] Create `apps/web/src/voice/`.
- [ ] Create `apps/api/src/livekit/`.
- [ ] Create `docs/tests/voice.md`.

**Build.**

- [ ] Stop for Abel's approval of Deepgram, Cartesia, and LiveKit. Use a local LiveKit server in development, which costs nothing.
- [ ] Build a cascaded pipeline on LiveKit Agents, with word timestamps sent to the browser alongside the audio.
- [ ] Offer real voice samples to onboarding from M2.4.
- [ ] Record PRD test 4's measurements in `docs/tests/voice.md`, and keep the voice choice in one config so the blind test can change it later.

**You see.**

- [ ] Abel has approved the voice services this PR uses.
- [ ] A student can hold a spoken conversation in the browser, with the first sound arriving within 800 ms at the median and 1.5 seconds at the 95th percentile.
- [ ] Interrupting stops the agent within 150 ms, and saying "uh-huh" does not stop it.
- [ ] Captions highlight each word as it plays and show the student's words too.
- [ ] A student can do the whole exchange by typing, with no microphone or speakers.
- [ ] If the connection drops, the agent pauses and resumes where it stopped.
- [ ] Speech recognition is measured on at least three accents, including math phrases such as "x squared over two", and the numbers are recorded.
- [ ] Raw audio is never stored.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `turn.test.ts` asserts that a backchannel does not count as an interruption.
- [ ] `reconnect.test.ts` asserts the resume position. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the 5-agent rule in `CLAUDE.md`.

- [ ] Lane 1. Regression lane against trunk. Trunk has no voice, so record that and gate the end state. Hold a scripted spoken exchange using injected audio, and interrupt it. Save `m3-6-talk.png`. Pass when captions track the words and the agent stops on interruption.
- [ ] Lane 2. Do the same exchange by typing with audio off, then drop and restore the network. Save `m3-6-typed.png`. Pass when the typed exchange completes and the session resumes where it stopped.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. The time from the end of student speech to the first agent audio, and the stop time after an interruption.
- [ ] Probe. Log both on the local stack over 30 turns, at trunk and head.
- [ ] Baseline. Trunk has no voice, so these absolute budgets apply.
- [ ] Rule. Fail if the median exceeds 800 ms, p95 exceeds 1.5 s, or p95 stop time exceeds 150 ms.

**Review gate.** None. M3.6 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Connect the tutor's brain (M3.7)

**Depends on.** M3.2, M3.6.

**Files.**

- [ ] Create `apps/agent/src/tutor/`.
- [ ] Create `evals/tutor-turns/`.
- [ ] Create `docs/tests/tutor-model.md`.

**Build.**

- [ ] Stop for Abel's approval of the Anthropic API account, because it is a paid service.
- [ ] Read the `claude-api` skill before writing this code, then call the model through the official TypeScript SDK with streaming and prompt caching.
- [ ] Send beats as one ordered structure, because Opus 5.5 and Sonnet 5.5 return text between tool calls as thinking-block progress updates.
- [ ] Validate each beat at the boundary and fall back to speech alone when a beat is invalid.
- [ ] Build the 30-turn evaluation so that later prompt changes rerun it.

**You see.**

- [ ] Abel has approved the Anthropic API account this PR uses.
- [ ] The tutor answers a student's question out loud while drawing on the board, from one ordered stream of beats.
- [ ] Opus 5.5 at low effort, Sonnet 5.5, and Haiku 5.5 are each compared on 30 scripted student turns for teaching quality, first-word speed, and cost, and the results are recorded.
- [ ] A recommended model is chosen from those results, and the real cost per session minute is measured.
- [ ] Abel is told if the measured cost exceeds $0.15 a minute.
- [ ] If the model produces an invalid beat, the student still hears the words and the session continues.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `beats-stream.test.ts` asserts partial and invalid beats are handled.
- [ ] `pnpm eval:tutor --dry-run` asserts the evaluation loads all 30 turns. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the 5-agent rule in `CLAUDE.md`.

- [ ] Lane 1. Regression lane against trunk. Trunk has no brain, so record that and gate the end state. Ask a physics question on the lab page, by typing. Save `m3-7-answer.png`. Pass when the tutor speaks and draws together, and the drawing matches the words.
- [ ] Lane 2. Feed a recorded stream containing an invalid beat. Save `m3-7-invalid.png`. Pass when speech continues, the board stays correct, and the error is logged.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. The time from the end of student speech to the first agent audio with the real model, and cost per session minute.
- [ ] Probe. Log both across the 30 evaluation turns for each model.
- [ ] Baseline. Record M3.6's latency without a model first.
- [ ] Rule. Fail the chosen model if the median exceeds 800 ms or p95 exceeds 1.5 s, and report to Abel if cost exceeds $0.15 a minute.

**Review gate.** None. M3.7 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Teach instead of tell, with tools the tutor calls when needed (M3.8)

**Depends on.** M3.7.

**Files.**

- [ ] Create `apps/agent/src/tutor/prompts/` and `apps/agent/src/tutor/tools/`.
- [ ] Extend `evals/tutor-turns/`.

**Build.**

- [ ] Write the teaching rules as a versioned prompt.
- [ ] Add tools the model calls when needed, namely `compute`, `plot_values`, and `find_source`, with `read_board`, `get_learner_record`, and `note_evidence` following in later PRs.
- [ ] Track failed attempts in code so the dead-end rule does not depend on the model's memory.
- [ ] Add evaluation cases for answer leaks, dead ends, turn length, silence, mode choice, and wrong math.

**You see.**

- [ ] In problem mode, the tutor never states the final answer before the student has tried, and it reveals one step at a time.
- [ ] If a student demands the answer, the tutor encourages one attempt first, gives it, then sets a similar problem to solve alone.
- [ ] After two failed attempts on one point, the tutor shows the next step on the board. A student never hears a third question in a row on the same point.
- [ ] A question such as "How do black holes form?" gets short explanations with regular checks, because the tutor picks the right mode by itself.
- [ ] Spoken turns stay under 20 seconds, and the tutor waits at least 8 seconds after a question without prompting.
- [ ] All math and plotted values come from a calculation tool, and factual claims can show a source on request.
- [ ] The tutor writes for the ear, with short sentences and math said the way a person says it.
- [ ] An evaluation suite measures all of this, and every prompt change must pass it.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `compute.test.ts` asserts results against worked answers.
- [ ] `dead-end.test.ts` asserts the switch to showing on the third attempt.
- [ ] `pnpm eval:tutor` runs the suite and records the score. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the 5-agent rule in `CLAUDE.md`.

- [ ] Lane 1. Regression lane against trunk. Run the same stuck-student script at trunk and head. Save `m3-8-stuck.png`. Pass when head shows the next step after two failed attempts, and trunk does not.
- [ ] Lane 2. Ask for the final answer outright, then ask a curiosity question. Save `m3-8-modes.png`. Pass when the tutor encourages an attempt first, and it explains in short bursts on the curiosity question.

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

**Depends on.** M3.8, M2.5.

**Files.**

- [ ] Create `apps/agent/src/lesson-plan/` and `apps/api/src/lesson-plans/`.
- [ ] Add `LessonPlan` DTOs in `apps/api/src/lesson-plans/` and a migration.

**Build.**

- [ ] Generate a quick opening immediately and the full plan in the background with structured output.
- [ ] Keep the current step in code and pass only it to each live turn, so turns stay fast.
- [ ] Fall back to a plain teaching mode when planning fails.

**You see.**

- [ ] Every session gets a lesson plan with a goal, prerequisites, concept steps, a teaching mode, and examples drawn from the student's interests.
- [ ] The tutor's first word still plays within three seconds, because a deeper plan finishes in the background and the tutor adopts it when ready.
- [ ] The tutor follows the plan and changes it when the student shows they know more or less than expected.
- [ ] The session screen shows real progress, such as "Concept 2 of 5", and the continue card shows what comes next.
- [ ] Plans are saved with the session, and a plan that fails to generate never stops the session.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `lesson-plan.schema.test.ts` asserts the plan shape.
- [ ] `plan-progress.test.ts` asserts advancing, revising, and the fallback. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the 5-agent rule in `CLAUDE.md`.

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

## Run the first full session end to end (M3.10)

**Depends on.** M3.5, M3.9.

**Files.**

- [ ] Edit `apps/web/src/session/` and `apps/web/src/onboarding/`.
- [ ] Create `apps/web/src/session/dot/`.

**Build.**

- [ ] Replace the stand-in session content with the live pipeline.
- [ ] Build the dot's behaviors from PRD B9.
- [ ] Save every event that played to the session log.
- [ ] Measure latency, sync, and cost on real sessions and record them in `docs/tests/first-session.md`.

**You see.**

- [ ] Sending a question or selecting a card starts a real session, with the tutor's first word within three seconds.
- [ ] The student and tutor talk back and forth, with captions, and the student can interrupt at any time.
- [ ] The board draws in time with the tutor's words, using the real board library and tutor.
- [ ] The tutor's dot pulses with speech, moves to what it is discussing, and rests while listening, and the board stays still while the student reads.
- [ ] The tutor states that it is an AI at the start of each session, and again after every three hours of use.
- [ ] Onboarding's first exchange now uses the real tutor.
- [ ] The student can end the session, and it is saved and appears in Sessions.
- [ ] A screen recording of a full session is posted on this issue, and Abel is told.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `session-machine.test.ts` asserts the states from connecting through speaking, listening, interrupted, and ended, with no illegal transition.
- [ ] `dot.test.ts` asserts the dot's state follows the session. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the 5-agent rule in `CLAUDE.md`.

- [ ] Lane 1. Regression lane against trunk. Run the same journey from Home at trunk and head using injected audio. Save `m3-10-session.png`. Pass when head delivers a real spoken lesson with the board in sync, and trunk shows only stand-in content.
- [ ] Lane 2. Complete a full session by typing at 390px in dark mode, interrupting twice. Save `m3-10-phone.png`. Pass when the session completes, stays in sync, and appears in Sessions.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. First word time, the time from the end of student speech to first audio, drawing drift, and cost per minute, on complete sessions.
- [ ] Probe. Log all four on three complete sessions, at trunk and head.
- [ ] Baseline. Trunk has no real session, so these absolute budgets apply.
- [ ] Rule. Fail if first word exceeds 3 s, the median turn exceeds 800 ms, p95 drift exceeds 100 ms, or cost exceeds $0.15 a minute.

**Review gate.** None. M3.10 is not review-gated, because `CLAUDE.md` lets the program merge without Abel's review.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Base and verdict are current under the execution playbook and the patch-id rule in `playbooks/shipping.md`.
- [ ] Every box in **You see.** is checked with evidence on the issue, and no stop-list decision is open on it.
- [ ] The root merges with `gh pr merge <pr> --repo iamabeljoshua/astra --squash --match-head-commit <verified-head>`, then reads the PR back to confirm the merge.

## Let students draw on the board and upload their work (M3.11)

**Depends on.** M3.10.

**Files.**

- [ ] Create `packages/board/src/student-ink/`.
- [ ] Create `apps/api/src/uploads/`.
- [ ] Add `read_board` to `apps/agent/src/tutor/tools/`.

**Build.**

- [ ] Add a student ink layer that records strokes in the session log.
- [ ] Send structured board state on every turn and a snapshot only when the board changes or the student refers to it.
- [ ] Store uploads with ownership checks.

**You see.**

- [ ] A student can draw and write on the board with a mouse, a finger, or a stylus.
- [ ] The tutor can read what the student wrote and respond to it, including spotting a sign error in worked math.
- [ ] A student can attach a photo or PDF from Home or during a session, and the tutor can talk about it.
- [ ] Uploaded files stay private to that student and can be deleted.
- [ ] The product never uses the camera for video or for reading faces (PRD Q17).

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `student-ink.test.ts` asserts that strokes replay.
- [ ] `uploads.spec.ts` asserts type limits, ownership, and deletion. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the 5-agent rule in `CLAUDE.md`.

- [ ] Lane 1. Regression lane against trunk. Trunk ignores student drawing, so record that and gate the end state. Write a worked equation with a sign error on the board. Save `m3-11-ink.png`. Pass when the tutor finds the sign error and points to it.
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

**Depends on.** M3.10.

**Files.**

- [ ] Create `apps/api/src/learner-record/`.
- [ ] Create `apps/agent/src/learner-record/`.
- [ ] Add `LearnerRecord` DTOs in `apps/api/src/learner-record/` and a migration.
- [ ] Create `apps/web/src/record/`.

**Build.**

- [ ] Run a structured extraction when a session ends.
- [ ] Make updates idempotent by session id.
- [ ] Add a page where the student reads and deletes their record, as a new row in `MENU`.

**You see.**

- [ ] After each session, the student's record lists concepts with a status, the evidence behind it, and any misconceptions.
- [ ] The record updates from real dialogue, such as a repeated sign error being noted as a misconception.
- [ ] A student can see their record in plain language and delete any part of it.
- [ ] A failed update never affects the session, and it retries safely.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `extraction.test.ts` asserts the output on recorded transcripts.
- [ ] `learner-record.service.spec.ts` asserts idempotent updates and deletion. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the 5-agent rule in `CLAUDE.md`.

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

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the 5-agent rule in `CLAUDE.md`.

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

**Depends on.** M4.1, M2.2.

**Files.**

- [ ] Edit `apps/api/src/picks/`.
- [ ] Edit `apps/web/src/home/`.

**Build.**

- [ ] Extend `getPicksForStudent` with the learner record, keeping it a pure function.
- [ ] Build each reason from the evidence in the record.
- [ ] Generate a card for a weakness that the library does not cover.

**You see.**

- [ ] Home ranks cards using the student's record, goals, and interests.
- [ ] A card can state a real reason, such as "You got stuck on free-body diagrams on Tuesday".
- [ ] A new student still gets good cards from the pre-made library.
- [ ] After a session with a clear weakness, the next visit to Home shows a card for it.
- [ ] Finished topics do not keep reappearing.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `getPicksForStudent.spec.ts` gains cases for ranking, reasons from evidence, new students, and finished topics. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the 5-agent rule in `CLAUDE.md`.

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

**Depends on.** M3.10, M4.1.

**Files.**

- [ ] Create `apps/web/src/replay/` and `apps/agent/src/recap/`.
- [ ] Edit `apps/web/src/sessions/`.

**Build.**

- [ ] Add a recap step at session end, with a check question.
- [ ] Build a replay screen from `SessionEvent` using the same `ScenePlayer`.
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

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the 5-agent rule in `CLAUDE.md`.

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

**Depends on.** M3.10.

**Files.**

- [ ] Create `apps/agent/src/safety/`, `apps/api/src/safety/`, and `apps/web/src/review/`.
- [ ] Extend `evals/tutor-turns/` with safety cases.

**Build.**

- [ ] Run the safety check beside each turn, without slowing the first word.
- [ ] Add a flag queue and a review page limited to named reviewers.
- [ ] Add data deletion across every table, and an automated check that no audio files are written.
- [ ] Stop and tell Abel that legal review is still needed before any under-18 invitation goes out (PRD section 11).

**You see.**

- [ ] A separate check reviews every student and tutor turn during a session.
- [ ] A self-harm signal stops the teaching, shows local help resources, and creates a flag for a person to review.
- [ ] A review page lists every flag, and a confirmed concern about a minor can reach a parent.
- [ ] The tutor claims no feelings or friendship, never engages romantically, never encourages secrecy, and nudges minors to take breaks, and an evaluation proves it.
- [ ] A student or parent can delete a student's data, and raw audio is confirmed never stored.
- [ ] Parents of minors get a short summary after each session, with no transcript.
- [ ] Student data is excluded from model training, and the product has no camera, no voiceprints, and no emotion inference.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `safety-check.test.ts` asserts the stop path on recorded signals.
- [ ] `delete-student.spec.ts` asserts that no student rows remain.
- [ ] `pnpm eval:tutor` covers the companion and secrecy cases. Run `pnpm test`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Two lanes on the configured `swarm workers` model at the PR head, per the boot recipe and the 5-agent rule in `CLAUDE.md`.

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
- [ ] Run the whole journey once on a fresh database, from the tagline to a second session that shows a recommended card, and post the recording.
- [ ] Reply to the operator with the report the execution playbook names, including measured latency, sync, and cost per minute, and the items in Appendix C that remain open.

## Appendix A. Prototype evidence

- **Look.** The [look prototype](https://claude.ai/artifact/3Kw7Ggukb39GerA4E5pK7u) settled type and palette, and Abel approved it on 2 November 2026. Its source is in `docs/design/look-prototype/`.
- **Onboarding and home.** The [app prototype](https://claude.ai/artifact/YJRK2QzMdDdm4c4DQhwWZq) settled the home proportions, the chat box pinned to the bottom, and the "Made for you" sheet. Its source is in `docs/design/app-prototype/`. A scripted click-through passed on the flows it covers, and it has not been checked on real devices.
- **Live tutor facts.** LiveKit documents a Node SDK with Deepgram and Cartesia plugins, and Cartesia documents word timestamps and cancel. M3.1 proves the rest by running code.
- **Still unproven.** Drawing drift and interruption stop time are unproven until M3.2. Turn latency is unproven until M3.6. Model quality, speed, and real cost are unproven until M3.7. Learning gain and student reaction are unproven until real students use the product.
- **PRD section 13 tests.** Test 1 is M3.2, test 2 is M3.7, and test 4's measurements are in M3.6. Test 3 is gone, because dot pictures and the swarm left the plan. Test 5, with five students, runs after M3.10.

## Appendix B. Alternatives rejected

- **Next.js.** It would hold pages and server code in one app. Abel chose React with Vite and NestJS, which matches `agentic-tutor`.
- **Server-rendered video and a whiteboard SDK as the renderer.** PRD section 8 rejects both for live teaching.
- **Generated simulations in v1.** PRD Q11 ships library simulations with sliders instead.
- **Dot pictures and the swarm.** Abel removed both from the plan on 2 November 2026.
- **Building the student app before proving the board.** M3.1 and M3.2 can run alongside M2, so the riskiest part is proved early.

## Appendix C. Risks

- **The board misses its timing targets.** It lands in M3.2, which stops and reports its numbers before more board work starts.
- **Turn latency with a real model.** It lands in M3.7. The owner watches first-token time and can move to a faster model if quality holds.
- **The cost per minute is above budget.** It lands in M3.7 and M3.10, which measure it and report to Abel.
- **Node SDK gaps.** They land in M3.1, which may recommend a Python agent. That would change this plan, so it stops for Abel.
- **Legal review for minors.** It lands in M4.5 and stays open until counsel reviews it, and PRD section 11 requires that before any under-18 invitation.
- **Public name.** PRD Q1 stays open, and M1.3 keeps the name in one module.
- **Scope cuts for the MVP.** M2.2 ships at least 30 topics against the PRD's estimate of 60, and M4.2 ships at least 100 concepts against its estimate of 300. Both grow before the beta.

## Appendix D. Links and reading list

- Read `docs/PRD-v1.md` and `docs/DESIGN.md` before editing anything. Read `~/startup/agentic-tutor/docs/NORTH_STAR_PLAN.md` before M3.1.
- M3.1 uses `skills/architect/SKILL.md`, and M2.3 and M4.5 use `skills/interrogate/SKILL.md`. Keep the trail per `skills/show-me-your-work/SKILL.md`.
- After the MVP and before the beta, the PRD still needs invitations, usage caps and a spend alert (Q14), the seven-day check and beta metrics (section 12), the static-board comparison, the TTS blind test, the payment link (Q21), hosting, and counsel's review.
