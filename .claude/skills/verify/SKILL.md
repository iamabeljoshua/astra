---
name: verify
description: Start Astra (React web app and NestJS API) from this checkout, drive it in a real Chromium with WebGL and audio, save laptop and phone screenshots, and shut it down. Use to prove a change on the running app, for live verification lanes, or when asked to open, click through, or screenshot Astra.
---

# Verify on the real app

Students use the web app, so drive the web app. Run every command from the repo root of your own checkout.

## Set up each copy

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium --no-shell
```

The second command downloads Chromium once per machine, and worktrees share it. If it is already there, the command does nothing. On a Linux machine with no browser libraries, add `--with-deps`.

## Prove a change in one command

```sh
WEB_PORT=5401 API_PORT=3401 pnpm verify run --out /tmp/swarm-<pr-id>/worker-<n>
```

`run` starts the app, drives the `home` journey at laptop and phone widths, saves screenshots, and stops the app. Exit code 0 means every check passed. Exit code 1 means something failed, and a `FAIL` line says what. The app stops either way.

## Launch

```sh
WEB_PORT=5401 API_PORT=3401 pnpm verify start
```

- Leave out `WEB_PORT` and `API_PORT` to get free ports. The command prints the URL.
- A taken port stops the command with the owner's process ID. This includes a port held on one address only, where `pnpm dev` itself prints no error.
- The command returns when both ports belong to this run, the web app answers, the API answers `GET /health`, and `GET /api/health` answers through the dev proxy.
- Running it again replaces the earlier run from this checkout.
- Read `.verify/dev.log` for the web and API logs.

## Doctor

Run this first when anything looks wrong. It changes nothing.

```sh
pnpm verify doctor
```

It checks port ownership, the three answers above, the page identity, WebGL drawing, audio output, and the microphone. The `webgl` line names the renderer.

## Drive

```sh
pnpm verify drive --journey home --viewports laptop,phone --out <dir>
```

All three options are optional, and these are the defaults for the first two. `drive` needs a running app. A journey is a name in `journeys/` or a path to any `.mjs` file. The file needs no imports:

```js
export default async function askQuestion({ page, capture, viewportName, productName }) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ask' }).click();
  await capture('after-ask');
  await page.getByRole('status', { name: 'Thinking' }).waitFor();
}
```

- `page` is a Playwright `Page` with the base URL set. `page.goto('/')` opens Home.
- Use roles and accessible names. Use `waitFor()` to assert, because a Playwright action fails after 10 seconds. Use `node:assert/strict` for values.
- Keep journeys that later PRs need in `journeys/`, and add a page in `features/`. Put throwaway journeys anywhere.

A viewport fails when any of these happens:

| Check | Fails on |
| --- | --- |
| `journey` | The journey throws, or an action times out. |
| `identity` | The final page title does not contain `PRODUCT_NAME` from `apps/web/src/strings.ts`. |
| `page error` | An uncaught exception in the page. |
| `page crash` | The page process crashes. |
| `console error` | Any `console.error`, including a failed request. A missing favicon is the one exception, until M1.3 adds one. |

### The browser

- It is the full Chromium build in headless mode. It uses the real GPU when the machine has one and software WebGL when it does not.
- Audio autoplay rules are the ones a student gets. An `AudioContext` stays suspended until a real click, so click in the journey. `page.evaluate` counts as a user gesture, so it hides an autoplay bug.
- The microphone is a fake device that plays beeps, and it needs no permission click.
- Light and dark are not viewports. Switch the theme in the journey, then call `capture` again.

## Evidence

The default folder is `.verify/evidence`. For a live lane, use `/tmp/swarm-<pr-id>/worker-<n>/`. Screenshots are full page at twice the pixel density, and `stop` does not remove them.

| File | Saved when |
| --- | --- |
| `<journey>-<viewport>.png` | The viewport passed. |
| `<journey>-<viewport>-failed.png` | The viewport failed. |
| `<journey>-<viewport>-<label>.png` | The journey called `capture('<label>')`. |

The widths are in `VIEWPORTS` in `scripts/lib/settings.mjs`. Laptop is 1440 by 900 and phone is 390 by 844.

A proof exercises the path a student uses. Capture the action and the state after it, and check side effects as well as the screen. Use a mock only where production already has a boundary to an outside system. Report a path you could not reach. Do not report it as passed through a different path.

## Cleanup

```sh
pnpm verify stop
```

Run this after every `start`, including after a failure. It is safe to run twice. It sends SIGTERM to the process group that `start` recorded, and sends SIGKILL to that group only after 10 seconds. It fails if a port is still held afterwards. Do not `kill -9` pnpm, because that leaves both ports listening. Do not kill by process name, because other lanes run the same programs.

## Self-check

```sh
pnpm verify:self
```

Run this after you change anything in this skill. It takes about 30 seconds, uses free ports, and shares nothing with a run you already have. It drives the real app and asserts failing exit codes on a page that throws, a console error, a page that is not Astra, a taken port, and a dead API.

## Feature map

Read [features/README.md](features/README.md) before you drive a feature. Run `/maintain-verification-skill` to find where the map and the app disagree.
