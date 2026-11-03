# Home

Home is the page a student opens first. It greets the student and says whether the app reached the API.

## Sub-features

- `home-identity` shows the product name in the page title and `Welcome.` as the heading.
- `home-api` says that the API is connected, after a request through the dev proxy.

## How to get to it (user POV)

- Open the web app URL that `pnpm verify start` prints.

## Driving it with pnpm verify

Preconditions:

- `pnpm verify doctor` passes.

- **Open Home.** Run `pnpm verify drive --journey home`. The `journey`, `identity`, `screenshot`, and `main region` checks print `PASS` for `laptop` and `phone`, and the command exits 0.
- **Proof.** Open `.verify/evidence/home-laptop.png` and `.verify/evidence/home-phone.png`. Each shows `The API is connected.`.

## Gotchas

- The page shows `Checking the API.` first. Wait for the connected line. Do not assert on the first paint.
- The connection line is a plain `<p>` with no role, so select it with `getByText`.
- With the API already stopped, `drive` refuses before it opens a page. The page shows `The API is not connected.` only if the API dies after that check.
- While it is not connected, the page retries every 2 seconds and each failed request logs a console error, so the run fails. Once connected, it stops polling, so an API that dies later does not change the line.
