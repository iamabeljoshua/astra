# Home

Home is the page a student opens first. It shows the product name and says whether the app reached the API.

## Sub-features

- `home-identity` shows the product name as the page heading and the page title.
- `home-api` says that the API is connected, after a request through the dev proxy.

## How to get to it (user POV)

- Open the web app URL that `pnpm verify start` prints.

## Driving it with pnpm verify

Preconditions:

- `pnpm verify doctor` passes.

- **Open Home.** Run `pnpm verify drive --journey home`. The checks `laptop journey`, `laptop identity`, `phone journey`, and `phone identity` print `PASS`, and the command exits 0.
- **Proof.** Open `.verify/evidence/home-laptop.png` and `.verify/evidence/home-phone.png`. Each shows the product name and `The API is connected.`.

## Gotchas

- The page shows `Checking the API.` first. Wait for the connected line. Do not assert on the first paint.
- The page retries the API every 2 seconds. A stopped API shows `The API is not connected.` and logs a console error, so the run fails.
