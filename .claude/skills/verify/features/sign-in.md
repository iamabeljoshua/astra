# Sign-in

A student signs in with a 6-digit code from their email, then goes through [onboarding](./onboarding.md), which asks their date of birth, before any other page opens. A student under 13 in every time zone stops at a closed page for good. Everything else in the app needs a signed-in student, except the [Terms and Privacy Policy](./legal.md). After a sign-out, Back in another tab loads a new page in Chromium, as `sign-in-out` says.

## Sub-features

- `sign-in-page` is one calm page: a still dot grid that fades around the question, a shape made of dots beside it, and the tutor's line typing out beside the small pulsing dot. It forms a new shape when the step changes, and nothing moves at rest. Reduced motion shows everything at once. A browser with no canvas gets the same page without the dots.
- `sign-in-email` asks for `Your email` under `Welcome, I am Astra, your personal AI tutor.` and the tagline, sends a code on `Continue`, and says `Check your email. I sent you a code.`.
- `sign-in-code` signs in from that code, in any browser. The field is one input drawn as 6 boxes. It takes a paste and checks the code at the sixth digit. A wrong, replaced, or used code says `That code didn't work.`, and one past 10 minutes on this tab's clock says `That code has expired.`. `Send a new code` counts down 60 seconds in sight. A reload comes back to this step for the code's lifetime, from the tab's session storage.
- `sign-in-birth-date` asks `When were you born?`, then shows the typed date with `Is this right?`. Nothing reaches the API before `Yes, continue`, and the first confirmed answer stands.
- `sign-in-closed` shows `We can't set up this account.` with `Sign out`, on every later sign-in.
- `sign-in-stop` sets the `astra-sign-up-stop` cookie for a day when a closed account is on screen. While it is set, a new address gets `We can't set up this account.` on the email step, an account with no confirmed date gets the closed page, and a set-up student signs in as usual.
- `sign-in-out` signs out from the sidebar. Other tabs follow, and Back in the tab that signed out lands on the previous site or the welcome page. Each session end posts one message on the `astra-session` channel, which drops a page Chromium kept. With two tabs, one on another site and the other signing out, Back in the first loads a new page with `persisted` false and no frame of the student's page. Other browsers are untested.
- `sign-in-development` shows a small `Development sign-in` button at the page's edge on the dev server only. It opens the development accounts, and no build holds it.

## How to get to it (user POV)

- Open any address while signed out.
- Read the code in the local inbox at http://127.0.0.1:54424.
- On a laptop, use `Sign out` in the sidebar's account row. On a phone, press `Menu` first.

## Driving it with pnpm verify

Preconditions:

- `pnpm db:up` ran in this checkout, because it writes `apps/web/.env.development.local` and creates the development accounts.
- `pnpm db:seed` ran on this lane's database, which also makes `new-student@astra.test` new again.
- `pnpm verify doctor` passes.

- **Sign in by email code and sign out.** Run `pnpm verify drive --journey sign-in`. The `journey`, `identity`, `screenshot`, and `main region` checks print `PASS` for `laptop` and `phone`, and the command exits 0.
- **Proof.** After a run that printed `PASSED`, open the `sign-in-laptop-*` and `sign-in-phone-*` images in `.verify/evidence/`. They show `email`, `birth-date`, `confirm`, `onboarding`, and `after-back`.
- **Sign in as another account in a journey.** Call `await signIn('new-student@astra.test')`. It lands on `What should your tutor call you?`. Call `await signInWithCode(address)` to go through the email and the code.

## Gotchas

- Each run makes one new user per viewport in the shared Auth, with an address like `verify-laptop-<time>@astra.test`.
- The page sends one code per address per minute in each tab, and goes straight to the code step inside that minute, so use a new address or a new tab to retry.
- A new code replaces the last one for that address. Two lanes on one address break each other, so use a unique address with `signInWithCode`.
- The shared stack started before the code templates, so its mail is Supabase's default, `Your Magic Link`, which still holds the code as `enter the code: 123456` and a link. `signInWithCode` reads the code from either mail. Only a restart of the stack loads our templates, and it affects every lane.
- The shared stack keeps a code for 3600 seconds and sends one per second, where `supabase/config.toml` and a hosted project say 600 and 60. It also applies no limit on guesses, because no `GOTRUE_RATE_LIMIT_HEADER` is set, as [Sign in](../../../../README.md#sign-in) says.
- `Development sign-in` uses a password. The API accepts a password only when `NODE_ENV` is exactly `development`, so under `NODE_ENV=production SUPABASE_URL=http://127.0.0.1:54421 pnpm verify start` those accounts end on the error page with `Try again`. The API does not start under `NODE_ENV=production` without `SUPABASE_URL`.
- Google's return reaches only `127.0.0.1` on the stack, which is why `pnpm verify` prints `127.0.0.1` URLs.
- A closed account leaves the `astra-sign-up-stop` cookie, so use a new browser context before you try a new address in a journey.
- The driver's browser has the back-forward cache off, because Playwright turns it off by default. So the `after-back` image proves the history entry, not a restored page. To test a restored page, launch with `ignoreDefaultArgs: ['--disable-back-forward-cache']` and press Back with `history.back()` from the page.
