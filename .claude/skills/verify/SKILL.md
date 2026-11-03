---
name: verify
description: Start Astra (React web app and NestJS API) from this checkout, drive it in a real Chromium with WebGL and audio, save laptop and phone screenshots, and shut it down. Use to prove a change on the running app, for live verification lanes, or when asked to open, click through, or screenshot Astra.
---

# Verify on the real app

Students use the web app, so drive the web app. Run every command from the repo root of your own checkout.

## Set up each copy

Use Node 22 (`.nvmrc`) and pnpm 10.32.1 (`packageManager` in `package.json`).

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium --no-shell
```

The second command downloads Chromium once per machine, and worktrees share it. On a Linux machine with no browser libraries, add `--with-deps`.

The second command can also delete. It removes any browser build that no install on this machine links to, and prints `Removing unused browser at <path>`. To keep every build, add `--no-remove`.

A project that lost its build fails with `Executable doesn't exist at <path>` and `Looks like Playwright was just installed or updated`. To recover, run `playwright install` in that project. Here the same failure starts with `Chromium did not start`, and it names the command to run.

## Prove a change in one command

```sh
pnpm verify run --journey <name or path> --viewports laptop,phone --out /tmp/swarm-<pr-id>/worker-<n>
```

`run` starts the app, drives one journey at each viewport, saves screenshots, and stops the app.

- `--journey` defaults to `home`. A PR on another screen must pass its own journey, or the run passes without its change being driven.
- `--viewports` takes `laptop`, `phone`, or both with a comma. It defaults to both.

Exit code 0 means every check passed. Exit code 1 means something failed, and a `FAIL` line says what. The app stops either way, including on a missing `await` in the journey, and on SIGINT, SIGTERM, or SIGHUP. Nothing can catch SIGKILL. After a hard kill, run `pnpm verify stop`. See [Cleanup](#cleanup).

## Launch

```sh
pnpm verify start
```

- The command picks two free ports and prints the URLs, so lanes running at the same time do not collide. To choose the ports, set `WEB_PORT` and `API_PORT`.
- A taken port stops the command with the owner's process ID. This includes a port held on one address only, where `pnpm dev` itself prints no error.
- The command returns when both ports belong to this run, the latest API compile has no errors, the web app answers, the API answers `GET /health`, and `GET /api/health` answers through the dev proxy.
- Use the printed URL. On this Mac, Vite listens on `[::1]` only, so `127.0.0.1` refuses the connection.
- Running it again replaces the earlier run from this checkout.
- Read `.verify/dev.log` for the web and API logs. A healthy `start` logs no proxy error, because the command probes the proxy only after the API answers. A proxy error there means a page called the API while the API was down.
- If the app does not start, the command stops it and prints the last 30 lines of the log, which show the API's own error.
- `pnpm verify stop` tears it down. See [Cleanup](#cleanup).
- CI runs `pnpm verify start && pnpm verify stop` with no browser, so a broken dev proxy fails the PR.

## Doctor

Run this first when anything looks wrong. It changes nothing.

```sh
pnpm verify doctor
```

It checks port ownership, the latest API compile result in `.verify/dev.log`, the three answers above, the page identity, WebGL drawing, audio output, and the microphone. The `webgl` line names the renderer.

A type error in the API fails both `doctor` and `drive`, because the API otherwise keeps serving its last good build.

## Drive

```sh
pnpm verify drive --journey home --viewports laptop,phone --out <dir>
```

All three options are optional, and these are the defaults for the first two. `drive` needs a running app. A journey is a name in `journeys/` or a path to any `.mjs` file. The file needs no imports, and it needs a default export that is a function:

```js
export default async function menu({ page, capture, viewportName }) {
  await page.goto('/');
  await page.getByText('The API is connected.').waitFor();
  if (viewportName === 'phone') await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('link', { name: 'Sessions' }).click();
  await page.getByRole('heading', { name: 'Sessions' }).waitFor();
  await capture('sessions');
}
```

- `page` is a Playwright `Page` with the base URL set. `page.goto('/')` opens Home.
- `capture(label)` saves a screenshot now.
- `viewportName` is `laptop` or `phone`. Use it to branch when the path differs by width. The phone layout hides the sidebar behind the `Menu` button, as above.
- Use roles and accessible names. Use exact text from `apps/web/src/strings.ts` when the element has no role. Home's connection line is a plain `<p>`, so `getByText` is right for it.
- Use `waitFor()` to assert, because a Playwright action fails after 10 seconds. Use `node:assert/strict` for values.
- Await every Playwright call. A missing `await` fails the run with `FAIL stray error`.
- A journey has 60 seconds at each viewport. A journey that needs longer exports its limit, as in `export const deadlineMs = 120_000;`.
- Keep journeys that later PRs need in `journeys/`, and add a page in `features/`. Put throwaway journeys anywhere.

A viewport fails when any of these happens:

| Check | Fails on |
| --- | --- |
| `journey` | The journey throws, an action times out, or the journey passes its deadline. |
| `identity` | The final page title does not contain `PRODUCT_NAME` from `apps/web/src/strings.ts`. |
| `screenshot` | Every pixel of the final screenshot is one color, as with `opacity: 0`, white on white, content off screen, or an empty body. |
| `final page` | The final page cannot be read within 20 seconds, because it crashed, closed, or hung. No final screenshot is saved. |
| `page error` | An uncaught exception on any page in the journey's context, or in a dedicated worker. |
| `console error` | Any `console.error`, including a failed request, on any page in the journey's context, or in a dedicated or service worker. |
| `page crash` | Any page in the journey's context crashes. |

- After the journey, the driver waits 1.5 seconds, reads the title, takes the final screenshot, closes the page, and only then reads the failures. It does not see a failure that comes later, so wait in the journey for anything slower.
- The `screenshot` check looks for exactly one color. A page with one word or one dot on it passes, and so does faint text that a student cannot read. A page meant to be one color fails, so end the journey on a state with something drawn.
- The driver does not see these: errors in a shared worker, an uncaught exception in a service worker, and any page in a context the journey opens for itself.

### The browser

- It is the full Chromium build in headless mode. On a Mac it draws with the real GPU. On Linux, which includes CI, it draws in software.
- Audio autoplay rules are the ones a student gets. An `AudioContext` stays suspended until a user gesture.
- Nearly every Playwright call that reaches the page grants that gesture, and hides an autoplay bug. That includes `click`, `evaluate`, `waitFor`, `waitForFunction`, `textContent`, `isVisible`, `boundingBox`, `title`, and `screenshot`. To test autoplay, make the page print its state to the console, and read only those lines, with no Playwright call between `goto` and the read:

  ```js
  const audioState = page.waitForEvent('console', (message) => message.text().startsWith('audio state:'));
  await page.goto('/');
  assert.equal((await audioState).text(), 'audio state: suspended');
  ```

- Playwright mutes the headless browser, so prove sound with an `AnalyserNode`. `doctor` does this.
- The microphone is a fake device that plays beeps, and it needs no permission click.
- Light and dark are not viewports. Switch the theme in the journey, then call `capture` again. `journeys/appearance.mjs` shows how.

## Evidence

The default folder is `.verify/evidence`. For a live lane, use `/tmp/swarm-<pr-id>/worker-<n>/`. Screenshots are full page at twice the pixel density, and `stop` does not remove them.

| File | Saved when |
| --- | --- |
| `<journey>-<viewport>.png` | The viewport passed. |
| `<journey>-<viewport>-failed.png` | The viewport failed. |
| `<journey>-<viewport>-<label>.png` | The journey called `capture('<label>')`. |

`<journey>` is the journey's file name without `.mjs`. If a plan names an image such as `m1-2-laptop.png`, copy the saved file to that name, or run a copy of the journey that has the plan's name, as in `--journey /tmp/m1-2.mjs`.

A run first deletes the earlier images of that journey and viewport in the output folder, including labeled ones. So a pass image never sits beside a failed run, and a `-failed` image never sits beside a pass, even when the run is refused or the app does not start. Images of other journeys and viewports stay. A journey name such as `home-laptop-menu` would lose its images to a run of `home`, so keep viewport names out of journey names.

The widths are in `VIEWPORTS` in `scripts/lib/settings.mjs`. Laptop is 1440 by 900 and phone is 390 by 844.

A proof exercises the path a student uses, not an internal setter or a test-only endpoint. Capture the action and the state after it, and check side effects as well as the screen. Use a mock only where production already has a boundary to an outside system. If the safe path is a dry run or a test mode, observe what it skips, such as files, network calls, and git refs, instead of trusting its name. Report a path you could not reach. Do not report it as passed through a different path.

## Cleanup

```sh
pnpm verify stop
```

Run this after every `start`, including after a failure. It is safe to run twice. It sends SIGTERM to the process group that `start` recorded, and sends SIGKILL to that group only after 10 seconds. Do not `kill -9` pnpm, because that leaves both ports listening. Do not kill by process name, because other lanes run the same programs.

- Before any signal, it proves the group is this run's. The group must have a member in this checkout, and its leader must have the start time in `.verify/run.json`. If the leader already died, a member must carry this run's ID in its environment. A reused group ID fails that proof, so `stop` leaves it alone.
- It keeps `.verify/run.json` until the group is gone and both ports read free. If a port is still held or cannot be read, it fails, and you can run it again once that is fixed. If another program holds a port after a reboot, stop that program or delete `.verify/run.json`.

Only `run` stops the app when it gets a signal. After a SIGKILL to the `verify` process, or any signal during `start`, the app keeps running and `.verify/run.json` stays. After a SIGKILL, Chromium exits by itself, and its temporary profile stays in the system temp folder. In each case, run `pnpm verify stop` to end the app.

## Self-check

```sh
pnpm verify:self
```

Run this after you change anything in this skill. It takes about 2 minutes, uses free ports, and shares nothing with a run you already have. It drives the real app and asserts these:

- The run fails on a page that throws, a console error, a journey that throws, a page crash, a page that is not Astra, a throw or crash just after the journey, four kinds of blank page, a journey that closes its page, an error on a second page, a journey that never settles, and a journey with no default export.
- Two plain pages pass, and a rerun replaces the images of that journey and viewport, even when the run is refused.
- `start` and `drive` refuse a taken port, `doctor` and `drive` fail on an API compile error and a dead API, `doctor` fails when the ports answer with something else, and `start` shows the API's own error.
- `stop` ends this run even after its group leader dies, force-kills a group that ignores SIGTERM, and leaves alone a sibling checkout's group, a reused group ID, and a group from another run with no leader.
- `stop` keeps its record while a port read fails or a port is held.
- `run` reports a missing `await`, SIGINT, and SIGTERM, and stops the app each time.

## Feature map

Read [features/README.md](features/README.md) before you drive a feature. Run `/pstack:maintain-verification-skill` to find where the map and the app disagree.
