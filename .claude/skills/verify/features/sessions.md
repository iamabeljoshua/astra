# Sessions

A student starts a session by sending a question or choosing a card, and the session screen opens with stand-in content until the live tutor arrives. The Sessions page lists every session the student has had, and search filters the list. Ending a session marks it finished and returns to Home.

## Sub-features

- `session-question` lands the tutor's dot where the full stop of the typed question would sit, then fades into the session screen.
- `session-card` starts a session on a card's topic straight away, with the card's picture on the board.
- `session-continue` opens the unfinished session from the continue card on Home.
- `session-screen` shows the board, the tutor's dot, the title, stand-in words, a clock, and a reply box. A reply stays on the screen and goes nowhere.
- `session-refresh` keeps the session on a refresh, because the record is saved before the page fades.
- `session-end` marks the session finished with its length, and returns to Home.
- `session-finished` opens a finished session with no way to end it or reply.
- `session-other-student` shows `This session could not be found.` for an ID that belongs to another student.
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

- **Send a question, end the session, then start from a card, refresh, and search.** Run `pnpm verify drive --journey sessions`. The `journey`, `identity`, `screenshot`, and `main region` checks print `PASS` for `laptop` and `phone`, and the command exits 0.
- **Proof.** After a run that printed `PASSED`, open these images in `.verify/evidence/`, for each viewport. `sessions-laptop-dot.png` shows the dot at the end of the typed line. `sessions-laptop-session.png` shows the session screen. `sessions-laptop-list.png` shows the new session first and finished. `sessions-laptop-card-session.png` shows the card's drawing after a refresh. `sessions-laptop-search.png` shows only what the search found.

## Gotchas

- The dot stays on screen for about a third of a second, so wait for `.stop-dot` straight after pressing `Start session`.
- Each run adds sessions to the lane's database. Run `pnpm db:seed` to go back to the example student's six sessions.
- A session ID is a UUID in the address, so read it from `page.url()`.
- Search waits a quarter of a second after the last key, so wait for a row that should go to disappear rather than reading the rows at once.
- An ID that belongs to another student answers 404, which prints a `console error` in the journey, so a journey that visits one fails the driver's check. Check the message by hand or in a throwaway journey.
