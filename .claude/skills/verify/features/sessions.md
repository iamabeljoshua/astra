# Sessions

A student starts a session by sending a question or choosing a card, and the session screen opens the session's room at once. The Sessions page lists every session the student has had, and search filters the list. Ending a session marks it finished and returns to Home.

## Sub-features

- `session-question` lands the tutor's dot where the full stop of the typed question would sit, then fades into the session screen.
- `session-card` starts a session on a card's topic straight away, with the card's picture on the board, and stores the topic.
- `session-continue` opens the unfinished session from the continue card on Home, or from a card that says `Carry on where you left off`.
- `session-screen` shows the board, the tutor's dot, the title, a clock, and a reply box. It joins the session's room as it opens, with no press, and says `Connecting to your tutor.` until the tutor speaks. [Live voice](./voice.md) covers that.
- `session-coming-soon` shows the one `Photo or PDF` control on the screen: in the reply box while there is no room or the tutor is on the way, and in the board's tools once the tutor has arrived. A file dropped or pasted while the tutor is on the way opens the reply box with the note. Escape closes the note first, so it does not stop the tutor.
- `session-returning` opens a running session with some length saved. It joins the room and sends `I'm back to carry on with this: <title>`, so the tutor speaks first there too.
- `session-no-room` is the app with no LiveKit keys. The room route answers 200, the screen says `Your tutor could not connect just now.`, a reply stays on the screen with `This did not reach your tutor.`, and the browser logs no error.
- `session-daily-limit` is a student whose tutor spend today has reached `ASTRA_DAILY_LIMIT_USD`. The room route answers 200 with no access, and the screen says `That is all your tutor time for today. Come back tomorrow. Your sessions are kept.`
- `session-refresh` keeps the session on a refresh, because the record is saved before the page fades.
- `session-end` marks the session finished with its length, reads `Ending…` until Home is ready, returns to Home, and moves focus to Home's heading.
- `session-leave` keeps the student where they went if they leave Home or the session screen while a start or an end is pending. The save still lands, and the dot and any fade go at once.
- `session-finished` opens a finished session with no way to end it or reply.
- `session-other-student` shows `This session could not be found.` with no `Try again` for an ID that belongs to another student, and for a malformed address.
- `sessions-list` lists each session, newest first, with title, subject, date, length, and status. `Show more` reaches sessions past the first 50.
- `sessions-search` filters by title or subject, in any letter case.
- `sessions-recent` lists the six newest sessions in the sidebar.
- `sessions-empty` tells a new student that sessions will appear, in the list and in Recent.

## How to get to it (user POV)

- Sign in first. See [Sign-in](./sign-in.md).
- On Home, send a question, choose a card, or press `Continue session`.
- Choose `Sessions` in the menu, then a row. See [Menu](./menu.md).
- Choose a title under `Recent` in the sidebar.
- Open `/sessions` or `/sessions/<id>` directly.

## Driving it with pnpm verify

Preconditions:

- `pnpm db:up` ran in this checkout, and `pnpm db:seed` ran on this lane's database before the journey, because the journey signs in as `maya@astra.test`.
- `pnpm verify doctor` passes.

- **Send a question, end the session, start from a card, refresh, search, then reply on a session the student came back to.** Run `pnpm verify run --journey sessions`. The `journey`, `identity`, `screenshot`, and `main region` checks print `PASS` for `laptop` and `phone`, and the command exits 0.
- **Try to add a file on the board, for no credits.** Start `livekit-server` on free ports with the pair `devkey` and `secret`, start `node src/live/worker.ts start` in `apps/agent` with `ASTRA_TUTOR_MODEL=recorded`, `ASTRA_VOICE=fake`, and any `META_API_KEY`, and give `pnpm verify start` the same `LIVEKIT_*` values. Then run `pnpm verify drive --journey coming-soon` with those values set.
- **Proof.** After a run that printed `PASSED`, open these images in `.verify/evidence/`, for each viewport. `sessions-laptop-dot.png` shows the dot at the end of the typed line. `sessions-laptop-session.png` shows the session screen. `sessions-laptop-list.png` shows the new session first and finished. `sessions-laptop-card-session.png` shows the card's drawing after a refresh. `sessions-laptop-search.png` shows only what the search found. `sessions-laptop-returning.png` shows the invitation. `sessions-laptop-reply.png` shows the reply and what became of it.

### What the journey expects of the room

`verify` starts the app with the environment of the shell that ran it, so the journey reads `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` from that same environment. With `drive`, run it in a shell with the same keys as the `pnpm verify start` that started the app, or the journey fails on the answer it did not expect.

| | No room service: any of the three keys missing | Room service on: all three set |
| --- | --- | --- |
| `POST /sessions/:id/live-room` | 200, `{ access: null, unavailableBecause: 'notSetUp' }` | 200, `access` holds a token, `unavailableBecause` is null |
| The note under the reply box | `Your tutor could not connect just now.` | Never that note. No agent needs to be running, because the journey leaves before the 25 second wait for a tutor ends. |
| A reply on a session the student came back to | Stays on the screen with `This did not reach your tutor.` | Stays on the screen as the student's words, with no such line |
| The browser console | No error, which `verify` fails on by itself | No error, which `verify` fails on by itself |

Either way, nothing on screen says `Live lessons open soon`. To run it with the room service on, load the keys and name an agent nobody runs, so no lane's tutor answers and spends anything:

```sh
set -a; . ~/.config/astra/keys.env; set +a
ASTRA_AGENT_NAME=astra-tutor-nobody pnpm verify run --journey sessions
```

## Gotchas

- The dot stays on screen for about 0.6 s, longer on a slow save, because it holds for 320 ms and stays through the 300 ms fade, so wait for `.stop-dot` straight after pressing `Start session`.
- Each run adds sessions to the lane's database. Run `pnpm db:seed` to go back to the example student's six sessions.
- A session ID is a UUID in the address, so read it from `page.url()`.
- Search waits a quarter of a second after the last key, so wait for a row that should go to disappear rather than reading the rows at once.
- An ID that belongs to another student answers 404, which prints a `console error` in the journey, so a journey that visits one fails the driver's check. Check the message by hand or in a throwaway journey.
