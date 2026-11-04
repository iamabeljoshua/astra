# Home

Home is the page a student opens first. It greets the student by name and asks what they want to learn next. It offers the unfinished session and up to six picks, and keeps the chat box docked at the bottom.

## Sub-features

- `home-identity` shows the product name in the page title.
- `home-greeting` shows `Welcome back, Maya.` for the seeded student, then `What do you want to learn next?`.
- `home-continue` shows the newest unfinished session, `Free-body diagrams`, with a `Continue session` button. At laptop width it also shows a drawing from its board. A session with no `detail` line shows its subject and `Carry on where you left off.`
- `home-picks` lists up to six cards under `Picked for you`, chosen from the student's level, interests, and goal, each with a picture and a reason. `maya@astra.test` and `tola@astra.test` see different cards. They stack in one column on a phone. Cards fall below six once a level runs short. A student sees five after finishing 21 of 26 topics at middle school, 43 of 48 at high school, 23 of 28 at university, or 33 of 38 out of school.
- `home-history` changes the cards from the student's sessions on library topics. A finished topic leaves, the next topic in its subject appears with `You finished <title>`, and an older open topic appears with `Carry on where you left off` and opens its own session. The newest open session has the continue card, so it gets no second card. A session counts as finished at half the topic's length or more. Sooner than that it does not count. History takes at most two carry-on and two next-topic cards. A typed question adds no card and finishes no topic, whatever its words. An open one can take the continue card, so a lesson it displaced can then appear with `Carry on where you left off`.
- `home-record` changes the cards from what the tutor has noted, ahead of sessions and the library. A struggle comes first, at most two: the library topic that names it, else the library lesson it happened in, else a lesson of its own whose card says `Your question`. Then at most one card from something shown right, and one from something the student said they like. Each says what happened and the day, as in `You got stuck on free-body diagrams on Tuesday`. The API sends the reason and the date, and the page adds the day in the student's own time zone. A note from the session on the continue card waits, a later right answer settles a struggle, and going back to it takes its card away. Removing a note takes its card away at once. Notes over 120 days old, and anything about distress or health, shape nothing. `maya@astra.test` sees `You got stuck on compound interest on 24 October` after a seed.
- `home-wait` adds `Still loading your home screen.` to the placeholder after 4 seconds. The failure line still comes at 30 seconds.
- `home-chat` keeps the chat box at the bottom. `Start session` works only with text in the box, and `Talk` shows its state.
- `home-coming-soon` answers `Photo or PDF`, or a file dropped or pasted on the page, with `Photos and PDFs are coming soon.` just above the control. No file picker opens, the note closes by itself after 5 seconds, on Escape, or when the student types, and nothing is sent.
- `home-start` starts a session from a card or a sent question, and `Continue session` opens the unfinished one. See [Sessions](./sessions.md).

## How to get to it (user POV)

- Sign in at the web app URL that `pnpm verify start` prints. See [Sign-in](./sign-in.md).
- Choose `Home` in the menu on any page.

## Driving it with pnpm verify

Preconditions:

- `pnpm db:up` ran in this checkout, and `pnpm db:seed` ran on this lane's database before the journey, because the journey signs in as `maya@astra.test`.
- `pnpm verify doctor` passes.

- **Open Home.** Run `pnpm verify drive --journey home`. The `journey`, `identity`, `screenshot`, and `main region` checks print `PASS` for `laptop` and `phone`, and the command exits 0.
- **Proof.** Open `.verify/evidence/home-laptop.png` and `.verify/evidence/home-phone.png`. Each shows the greeting, the continue card, the picks, and the chat box.
- **Try to add a file.** Run `pnpm verify run --journey coming-soon`. It clicks the control, drops a real file, and pastes one on Home and in the session, and it fails if a file's name or bytes appear in any request. Set `COMING_SOON_LOG_FOLDER` to choose where `coming-soon-<viewport>-network.jsonl` goes. With a room service on, the session half runs on the board. See [Sessions](./sessions.md).
- **Change the cards from sessions.** Run `pnpm db:seed`, then `pnpm verify run --journey history-picks --viewports laptop`. Run `pnpm db:seed` again before `--viewports phone`, because the journey needs a `tola@astra.test` with no sessions. It finishes a topic, ends one after seconds, leaves two open, and reopens the older one from its card.
- **Change the cards from notes.** Set `ASTRA_AGENT_KEY` to any value for both `pnpm verify start` and the journey, run `pnpm db:seed`, then `pnpm verify drive --journey record-picks --viewports laptop`. Seed again before `--viewports phone`. It starts with a new student, writes three notes through the agent's own route, removes one on `Your notes`, and goes back to a struggle from its card. Light and dark pictures are saved for the new and the returning student.

## Gotchas

- The heading says `Welcome.` with no name until `GET /home` answers. `Picked for you` also shows in the loading placeholder. So wait for the name and the `Continue session` button, as the journey does.
- With no seed, `maya@astra.test` has no student, so sign-in lands on `You're in. What should I call you?` and the journey times out on the greeting. Run `pnpm db:seed`.
- `home-greeting` shows `Welcome, <name>.` until the student starts a session. See [onboarding](./onboarding.md).
- The `history-picks` journey jumps the browser clock past half the topic's length, so it needs no real wait. To finish a topic by hand, stay on its session for half the minutes its card shows, which is at least 5 minutes.
- With the API already stopped, `drive` refuses before it opens a page.
- In a phone image the chat box sits part way down, across the cards. The image is the full page and the chat box sticks to the bottom of the window, so this is not a layout bug.
- In dev, the query dev tools button floats at the top left and covers the product mark. Students do not get it, because a production build drops it. The `main region` check ignores it.
