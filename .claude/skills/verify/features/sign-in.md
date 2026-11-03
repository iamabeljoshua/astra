# Sign-in

A student signs in with an email link and answers one question, their date of birth, before any other page opens. A student under 13 in every time zone stops at a closed page for good. Everything else in the app needs a signed-in student, and signing out leaves nothing of that student on the browser's Back button.

## Sub-features

- `sign-in-email` sends a link from the `Continue with email` step, and says `Check your email.`.
- `sign-in-link` signs in from that link, in the browser that asked for it.
- `sign-in-birth-date` asks `When were you born?`, then shows the typed date with `Is this right?`. Nothing reaches the API before `Yes, continue`, and the first confirmed answer stands.
- `sign-in-closed` shows `We can't set up this account.` with `Sign out`, on every later sign-in.
- `sign-in-out` signs out from the sidebar. Other tabs follow, and Back shows no student page.
- `sign-in-development` shows the `Development sign-in` box on the dev server only.

## How to get to it (user POV)

- Open any address while signed out.
- Follow the link in the local inbox at http://127.0.0.1:54424.
- On a laptop, use `Sign out` in the sidebar's account row. On a phone, press `Menu` first.

## Driving it with pnpm verify

Preconditions:

- `pnpm db:up` ran in this checkout, because it writes `apps/web/.env.development.local` and creates the development accounts.
- `pnpm db:seed` ran on this lane's database, which also makes `new-student@astra.test` new again.
- `pnpm verify doctor` passes.

- **Sign in by email link and sign out.** Run `pnpm verify drive --journey sign-in`. The `journey`, `identity`, `screenshot`, and `main region` checks print `PASS` for `laptop` and `phone`, and the command exits 0.
- **Proof.** After a run that printed `PASSED`, open the `sign-in-laptop-*` and `sign-in-phone-*` images in `.verify/evidence/`. They show `sent`, `birth-date`, `confirm`, `home`, and `after-back`.
- **Sign in as another account in a journey.** Call `await signIn('new-student@astra.test')`. It lands on the date of birth question.

## Gotchas

- Each run makes one new user per viewport in the shared Auth, with an address like `verify-laptop-<time>@astra.test`.
- The page sends one link per address per minute in each tab, so use a new address or a new tab to retry.
- `Development sign-in` uses a password. The API accepts a password only when `NODE_ENV` is exactly `development`, so under `NODE_ENV=production pnpm verify start` that box ends on the error page with `Try again`.
- The stack sends a link back only to `127.0.0.1`, which is why `pnpm verify` prints `127.0.0.1` URLs.
- An email link works only in the browser that asked for it, so a journey must open it in the same context.
- The driver's browser has the back-forward cache off, because Playwright turns it off by default. So the `after-back` image proves the history entry, not a restored page. To test a restored page, launch with `ignoreDefaultArgs: ['--disable-back-forward-cache']` and press Back with `history.back()` from the page.
