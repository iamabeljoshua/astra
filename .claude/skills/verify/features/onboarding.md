# Onboarding

After signing in, a new student answers one question per screen while a sheet headed `Made for you` fills in beside them, then lands on Home. A student under 18 takes the same path as any other student. A student under 13 in every time zone stops at the closed page.

## Sub-features

- `onboarding-welcome` is the sign-in page, which says `A learning app, made for you` and that the tutor is an AI.
- `onboarding-steps` runs name, date of birth, level, interests, goal, then Home. Picking a level or a goal moves on by itself.
- `onboarding-interests` is a multi-select of chips with no text box. A student can choose none.
- `onboarding-goals` offers `Improve my grades`, `Get ready for an exam`, and `Learn anything I'm curious about`. A failed save stays here and says so, and picking again retries.
- `onboarding-sheet` shows the name as it is typed, and each answer as it is given.
- `onboarding-home` shows `Welcome, <name>.` until the student starts a session, with cards whose reasons name only the chips they chose.
- `onboarding-once` sends a student with a profile straight to Home. A student with a date of birth and no profile resumes at the first unanswered step.
- `onboarding-notes` is `Your notes` in the sidebar, where the name, level, interests, and goal can change.

## How to get to it (user POV)

- Sign in with an address that has no student yet.
- `new-student@astra.test` in the **Development sign-in** box, once per seed.
- A student who has finished opens `Your notes` from the sidebar's account row. On a phone, press `Menu` first.

## Driving it with pnpm verify

Preconditions:

- The setup in `../SKILL.md`, including `pnpm db:up`, because the journeys read the local inbox.
- `pnpm verify start` or `pnpm verify run`.

- **Complete it.** Run `pnpm verify drive --journey onboarding`. It prints the seconds from sign-in to Home and from the tagline to Home, and it exits 0 with `PASSED`.
- **Time it at a student's pace.** Run `ONBOARDING_PACE_MS=4000 pnpm verify drive --journey onboarding`. It waits 4 seconds on each screen and types at about 11 keys a second.
- **Try a long name, as a 15-year-old.** Run `pnpm verify drive --journey onboarding-long-name`. It uses a 60-character name with no spaces and fails if a page scrolls sideways. It meets no parent step, and it proves a session starts with 201.
- **Close an account under 13.** Run `pnpm verify drive --journey onboarding-under-13`. It stops at `We can't set up this account.`, and a reload stays there.
- **See it in dark.** Put `ONBOARDING_THEME=dark` in front of any of these commands.
- **Proof.** Open the `onboarding-*` images in `.verify/evidence/`.

## Gotchas

- Each run uses new `m2-4-*@astra.test` addresses in the local Auth, so they pile up. Clear them with the other test users.
- The date of birth step reads `Continue`, and so do the others, so wait for each heading before pressing it.
