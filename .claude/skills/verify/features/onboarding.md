# Onboarding

After signing in, a new student answers one question per screen while a sheet headed `Made for you` fills in beside them. A student under 18 gives a parent's address and waits until the parent accepts. The last screen is a scripted hello from the tutor, and the student's answer becomes the `Start here` card on Home.

## Sub-features

- `onboarding-welcome` is the sign-in page, which says `A learning app, made for you` and that the tutor is an AI.
- `onboarding-steps` runs name, date of birth, parent (under 18 only), into, level, goal, voice, hello.
- `onboarding-sheet` shows the name as it is typed, and each answer as it is given.
- `onboarding-parent` logs one link to `.verify/dev.log` and waits on `Waiting for your parent or guardian.`. The screen moves on within about 5 seconds of the parent accepting.
- `onboarding-parent-page` is `/parent-consent/<token>`, which works signed out and accepts only with `I accept`.
- `onboarding-voice` plays a sample for each of Ada, Kofi, and Noor, through an on-device voice.
- `onboarding-hello` shows the tutor's line word by word, and speaks it in the picked voice.
- `onboarding-home` shows `Welcome, <name>.` and the `Start here` card until the student starts a session.
- `onboarding-notes` is `Your notes` in the sidebar, where any answer can change.

## How to get to it (user POV)

- Sign in with an address that has no student yet.
- `new-student@astra.test` in the **Development sign-in** box, once per seed.
- A parent opens the logged link in any browser.
- A student who has finished opens `Your notes` from the sidebar's account row. On a phone, press `Menu` first.

## Driving it with pnpm verify

Preconditions:

- The setup in `../SKILL.md`, including `pnpm db:up`, because the journeys read the local inbox.
- `pnpm verify start` or `pnpm verify run`, because the minor journey reads `.verify/dev.log`.

- **Complete it as an adult.** Run `pnpm verify drive --journey onboarding-adult`. It prints the seconds from the tagline to Home, and it exits 0 with `PASSED`.
- **Time it at a student's pace.** Run `ONBOARDING_PACE_MS=4000 pnpm verify drive --journey onboarding-adult`. It waits 4 seconds on each screen and types at about 11 keys a second.
- **Complete it as a 15-year-old.** Run `pnpm verify drive --journey onboarding-minor --viewports phone`. It reads the logged link, proves a session is refused with 403, accepts as a signed-out parent, and proves the session then starts with 201.
- **Try a long name.** Run `pnpm verify drive --journey onboarding-long-name`. It uses a 60-character name with no spaces and fails if the parent page, the hello, or Home scrolls sideways. It also pastes past the 500-character limit in the hello's answer box and looks for the line that says so.
- **See it in dark.** Put `ONBOARDING_THEME=dark` in front of either command.
- **Proof.** Open the `onboarding-adult-*` and `onboarding-minor-*` images in `.verify/evidence/`. Set `ONBOARDING_EVIDENCE` to the `--out` folder for the minor journey's two parent page images.

## Gotchas

- Each run uses new `m2-4-*@astra.test` addresses in the local Auth, so they pile up. Clear them with the other test users.
- `onboarding-minor` reads the whole of `.verify/dev.log`, and `start` replaces that file. A link from an earlier `drive` in the same run has a different address, so it is not counted.
- Headless Chromium is muted, so the journeys prove sound from the speech engine's `start` event. An ear on a real device is still the only proof of how the voices sound.
- The date of birth step reads `Continue`, and so do the others, so wait for each heading before pressing it.
