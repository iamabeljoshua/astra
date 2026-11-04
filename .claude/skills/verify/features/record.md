# What the tutor remembers

A student sees everything the tutor remembers about them on `Your notes`, under "What your tutor remembers". Each note says what they showed, found hard, like, or looked at, with the line of work or the words behind it and the session it came from. They can remove any note, or all of them. A session's notes appear about 20 seconds after it ends, once its room closes.

## Sub-features

- `record-read` lists every note, newest first, with its evidence and its session.
- `record-remove` removes one note, and it stays gone after a reload.
- `record-forget` removes every note, after asking.
- `record-empty` says there is nothing yet.
- `record-write` is the after-session pass in the agent. It runs only with a real model and the agent running.

## How to get to it (user POV)

- Sign in first. See [Sign-in](./sign-in.md).
- Open `Your notes` from the sidebar's account row. On a phone, press `Menu` first.
- Scroll past the form to "What your tutor remembers".

## Driving it with pnpm verify

Preconditions:

- `pnpm db:up` ran in this checkout, and `pnpm db:seed` ran on this lane's database just before the journey, because the journey signs in as `maya@astra.test` and removes the seeded notes. Seed again before running it again.
- `pnpm verify doctor` passes.

- **Read, remove, and forget.** Run `pnpm db:seed && pnpm verify drive --journey record`. The `journey`, `identity`, `screenshot`, and `main region` checks print `PASS` for `laptop` and `phone`, and the command exits 0.
- **Proof.** After a run that printed `PASSED`, open `.verify/evidence/record-laptop-notes.png` and `.verify/evidence/record-phone-empty.png`. The first shows three notes with their evidence, and the second shows "Nothing yet".

## Gotchas

- The sidebar's recent sessions repeat session titles, so scope a note with `getByRole('region', { name: 'What your tutor remembers' })`.
- The phone run expects the laptop run's removal, because the seed holds three notes. Running only the phone viewport still passes.
- `record-write` is not in this journey, because it needs the agent and a paid model. `pnpm --filter @astra/agent eval:record` runs it on recorded sessions for under a cent.
