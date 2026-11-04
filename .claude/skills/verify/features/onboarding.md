# Onboarding

After signing in, a new student answers one question per screen beside the star chart, which fills in as they answer, then lands on Home. A student under 18 takes the same path as any other student. A student under 13 in every time zone stops at the closed page.

## Sub-features

- `onboarding-welcome` is the sign-in page, whose chart title says `A learning app, made for you` and whose tutor line says the tutor is an AI.
- `onboarding-steps` runs name, date of birth, level, interests, goal, then Home. Picking a level or a goal moves on by itself. A name needs a visible character, by the same rule as the API, so a name of only a zero-width space stops at the name step.
- `onboarding-interests` is a multi-select of chips with no text box, each with a small drawing. A student can choose none.
- `onboarding-goals` offers `Improve my grades`, `Get ready for an exam`, and `Learn anything I'm curious about`. While the goal saves, the choices and Back stay in the page and take no tap, and a screen reader hears `Saving your answers.`. A failed save stays here and says so, picking again retries, and Back clears the alert.
- `onboarding-chart` forms the name in the planet's dots as it is typed, and titles the chart `A learning app, made for <name>`. The next line says `Welcome, <name>.`. The level step shows stairs, the goal step shows a rising curve, and the other steps hold the name. Each chip picked lights a labelled star with that interest's name.
- `onboarding-chart-fallback` keeps the planet in a browser that refuses a canvas read or answers it with noise. The chart's title still shows the name, in plain type.
- `onboarding-home` shows `Welcome, <name>.` until the student starts a session, with cards whose reasons name only the chips they chose.
- `onboarding-once` sends a student with a profile straight to Home. A student with a date of birth and no profile resumes at the first unanswered step.
- `onboarding-notes` is `Your notes` in the sidebar, where the name, level, interests, and goal can change. A blank name is refused, and the problem clears at the next change.

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
- **Try a long name, as a 15-year-old.** Run `pnpm verify drive --journey onboarding-long-name`. It first types `Yousuf` and fails if the chart keeps the planet, because that final f overhangs the paper's side. Then it uses a 60-character name with no spaces and fails if a page scrolls sideways or if the chart's title takes more than one line at 1021 wide. It meets no parent step, and it proves a session starts with 201.
- **Reload with a name.** Run `pnpm verify drive --journey onboarding-reload`. It fails if the name's dots after a reload differ from the ones before it, as they do when a fallback font draws them.
- **Block canvas reads.** Run `pnpm verify drive --journey onboarding-blocked-canvas`. It makes a read throw, then answers reads with noise, and fails on the error page or on anything but the planet. To see the real thing in Firefox, launch it with `privacy.resistFingerprinting` on.
- **Check the header controls.** Run `pnpm verify drive --journey dot-page-controls`. It fails if a chart dot shows through the unpressed toggle, or if `Sign out`, `Back`, or `Dark` is under 24 px to tap.
- **Close an account under 13.** Run `pnpm verify drive --journey onboarding-under-13`. It stops at `We can't set up this account.`, and a reload stays there.
- **See it in dark.** Put `ONBOARDING_THEME=dark` in front of any of these commands.
- **Proof.** Open the `onboarding-*` images in `.verify/evidence/`. The chart is a canvas, so the journeys can read its title but not its dots. Look at the images.

## Gotchas

- Each run uses new `m2-4-*@astra.test` addresses in the local Auth, so they pile up. Clear them with the other test users.
- The date of birth step reads `Continue`, and so do the others, so wait for each heading before pressing it.
