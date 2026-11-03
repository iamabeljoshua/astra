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
pnpm db:up
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54422/astra_<your-lane>
pnpm db:migrate && pnpm db:seed
```

The second command downloads Chromium once per machine, and worktrees share it. On a Linux machine with no browser libraries, add `--with-deps`.

The second command can also delete. It removes any browser build that no install on this machine links to, and prints `Removing unused browser at <path>`. To keep every build, add `--no-remove`.

A project that lost its build fails with `Executable doesn't exist at <path>` and `Looks like Playwright was just installed or updated`. To recover, run `playwright install` in that project. Here the same failure starts with `Chromium did not start`, and it names the command to run.

### The database

`pnpm db:up` starts the local Supabase stack in Docker, and does nothing if the stack is running. Every lane and worktree shares this one stack, and each lane uses its own database.

- Set `DATABASE_URL` as above for every command in this skill. If your shell does not keep an `export` between commands, put it in front of each command. With no `DATABASE_URL`, every lane uses the same `astra` database.
- `pnpm verify start` runs `pnpm db:migrate` with your `DATABASE_URL`. This creates the database if it is missing, and changes nothing if it is current. It runs before the dev servers, because its `nest build` empties `apps/api/dist`, which the watcher builds into. `start` does not start the stack, and `stop` does not stop it.
- Nothing in `pnpm verify` seeds, and the seed must run before the journey. Home reads `GET /home` for the example student, and `doctor`, Home, Menu, and Appearance all open Home. On a database with no seed, `GET /home` answers 404, so `doctor` fails with `FAIL console error`, and a journey fails with that and a timeout on the greeting. `pnpm db:seed` replaces the example student and their sessions each time, so you can run it again, before `pnpm verify start` or after it.
- Never run `supabase stop`, with or without flags, because it stops the stack for every other lane. To test a missing database, point `DATABASE_URL` at a closed port.

## Prove a change in one command

```sh
pnpm verify run --journey <name or path> --viewports laptop,phone --out /tmp/swarm-<pr-id>/worker-<n>
```

`run` starts the app, drives one journey at each viewport, saves screenshots, and stops the app. It does not seed, so run the setup above first.

- `--journey` defaults to `home`. A PR on another screen must pass its own journey, or the run passes without its change being driven.
- `--viewports` takes `laptop`, `phone`, or both with a comma. It defaults to both.

Exit code 0 and a `PASSED` line mean every check passed. Exit code 1 means something failed, and a `FAIL` line or an error message says what. The app stops either way, including on a Ctrl-C, on SIGINT, SIGTERM, or SIGHUP, whether the signal reaches only the `verify` process or pnpm's whole process group, and when a call the journey forgot to await fails. pnpm forwards a Ctrl-C, so `verify` gets it twice, and the repeat does not stop the cleanup. Nothing can catch SIGKILL. After a hard kill, run `pnpm verify stop`. See [Cleanup](#cleanup).

One signal can still leave the app running. If pnpm leads a real terminal's session and its whole group gets SIGHUP once the servers have launched, pnpm exits first. The terminal then hangs up and kills a `ps` call inside the cleanup. The command prints `FAIL interrupted by SIGHUP` and exits, and the app and `.verify/run.json` stay. Run `pnpm verify stop` to end the app. Closing the terminal itself left nothing, in the one run measured.

## Launch

```sh
pnpm verify start
```

- The command first runs `pnpm db:migrate`, with a limit of 60 seconds. If that fails or passes the limit, the command kills the migrate step, shows the error, and starts nothing. A refused connection and a type error in the API fail at once. A database that accepts a connection and never answers fails at the limit. For a migration that needs longer, run `pnpm db:migrate` yourself first.
- The command picks two free ports and prints the URLs, so lanes running at the same time do not collide. To choose the ports, set `WEB_PORT` and `API_PORT`.
- A taken port stops the command with the owner's process ID. This includes a port held on one address only, where `pnpm dev` itself prints no error.
- The command returns when both ports belong to this run, the latest API compile has no errors, the web app answers, the API answers `GET /health`, and `GET /api/health` answers through the dev proxy.
- Use the printed URL. On this Mac, Vite listens on `[::1]` only, so `127.0.0.1` refuses the connection.
- Running it again replaces the earlier run from this checkout.
- Read `.verify/dev.log` for the web and API logs. A healthy `start` logs no proxy error, because the command probes the proxy only after the API answers. A proxy error there means a page called the API while the API was down.
- If the app does not start, the command stops it and prints the last 30 lines of the log, which show the API's own error.
- `pnpm verify stop` tears it down. See [Cleanup](#cleanup).
- CI runs `pnpm verify start && pnpm verify stop` with no browser, after it starts Postgres and migrates, so a broken dev proxy fails the PR.

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
  await page.getByRole('heading', { name: 'Welcome back, Maya.' }).waitFor();
  if (viewportName === 'phone') await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('navigation', { name: 'Menu' }).getByRole('link', { name: 'Sessions' }).click();
  await page.getByRole('heading', { name: 'Sessions' }).waitFor();
  await capture('sessions');
}
```

- `page` is a Playwright `Page` with the base URL set. `page.goto('/')` opens Home.
- `capture(label)` saves a screenshot now.
- `viewportName` is `laptop` or `phone`. Use it to branch when the path differs by width. The phone layout hides the sidebar behind the `Menu` button, as above.
- Use roles and accessible names. Use exact text from `apps/web/src/strings.ts` when the element has no role. Home's question under the greeting is a plain `<p>`, so `getByText` is right for it.
- Use `waitFor()` to wait for an element, because a Playwright action fails after 10 seconds. Use `node:assert/strict` for values.
- `waitFor()` passes on content a student cannot see. Playwright calls an element visible when it has a size and is not `visibility: hidden`, so `opacity: 0`, transparent text, and content off screen all pass. The `main region` check below catches a fully blank `main`, not one missing element, so open the saved image to prove what a student sees.
- Await every Playwright call. A call you forget to await fails the run with `FAIL stray error` only if the call fails. If it succeeds, the run passes and the journey did not wait for it.
- A journey has 60 seconds at each viewport. A journey that needs longer exports its limit, as in `export const deadlineMs = 120_000;`.
- Keep journeys that later PRs need in `journeys/`, and add a page in `features/`. Put throwaway journeys anywhere.

A viewport fails when any of these happens:

| Check | Fails on |
| --- | --- |
| `journey` | The journey throws, an action times out, or the journey passes its deadline. |
| `identity` | The final page title does not contain `PRODUCT_NAME` from `apps/web/src/strings.ts`. |
| `screenshot` | Every pixel of the whole final screenshot is one color, as with an empty body or `opacity: 0` on the whole app. The shell always draws its sidebar or header, so this fires only when the shell is gone too. |
| `main region` | The final page has a `main` element that is hidden, has no size, sits wholly outside the viewport, or has every pixel one color once everything outside `main` is hidden. This catches a blank page inside the shell, as with `opacity: 0` on its content, its content off screen, `main` itself off screen, or nothing rendered. It catches transparent text only when nothing else in `main` draws. |
| `final page` | The final page cannot be read within 20 seconds, because it crashed, closed, or hung. No final screenshot is saved. |
| `page error` | An uncaught exception on any page in the journey's context, or in a dedicated worker. |
| `console error` | Any `console.error`, including a failed request, on any page in the journey's context, or in a dedicated or service worker. |
| `page crash` | Any page in the journey's context crashes. |

- After the journey, the driver waits 1.5 seconds, reads the title, takes the final screenshots, closes the page, and only then reads the failures.
- The `screenshot` and `main region` checks look for exactly one color. So `main region` proves more than one color in `main`, not that the page is readable. A `main` with one word passes, and so does faint text, or a `main` that lost only part of its content. A page meant to be one color fails, so end the journey on a state with something drawn.
- The phone Menu hides `main` while it is open, so a journey that ends with the Menu open fails `main region`. Close it first, and call `capture` if you need the open state.
- A page with no `main` element gets only the `screenshot` check, so a shell that loses its `main` passes unless the journey notices.
- A `main` that holds only an iframe fails `main region`, because the hiding also reaches inside frames.

These pass, as measured on the real app, so do not read a pass as covering them:

- A throw or crash later than the 1.5 seconds. Wait in the journey for anything slower.
- A page that swallows its error with `event.preventDefault()` in a `window` `error` listener.
- A type error in the web app, because Vite does not type-check. `pnpm typecheck` catches it.
- Content pushed down inside `main`, as with a large top margin, because the screenshot covers all of `main`.
- Text a student cannot read, when anything else in `main` draws. `* { color: transparent !important }` passes on Sessions, because its borders draw. It passes on Home too, where only the chat box placeholder stays readable, because its cards, pictures, and buttons draw.
- A `main` partly off screen, as with `transform: translateX(50%)`, because part of its box touches the viewport.
- A cover outside `main` that is drawn over it, even a blank one in the page's color, because the check hides everything outside `main`.
- A journey that calls `process.exit(0)`. The command exits 0 with no `PASSED` line and no images, and under `run` the app stays running. So trust a run only when it prints `PASSED`.

The driver also does not see errors in a shared worker, an uncaught exception in a service worker, or any page in a context the journey opens for itself.

### The browser

- It is the full Chromium build in headless mode. On a Mac it draws with the real GPU. On Linux, which includes CI, it draws in software.
- Audio autoplay rules are the ones a student gets. An `AudioContext` stays suspended until a user gesture.
- Nearly every Playwright call that reaches the page grants that gesture, and hides an autoplay bug. That includes `click`, `evaluate`, `waitFor`, `waitForFunction`, `textContent`, `isVisible`, `boundingBox`, `title`, and `screenshot`. To test autoplay, make the page print its state to the console, and read only those lines, with no Playwright call between `goto` and the read:

  ```js
  import assert from 'node:assert/strict';

  export default async function autoplay({ page }) {
    const audioState = page.waitForEvent('console', (message) => message.text().startsWith('audio state:'));
    await page.goto('/');
    assert.equal((await audioState).text(), 'audio state: suspended');
  }
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
| `<journey>-<viewport>-<label>.png` | The journey called `capture('<label>')`, whatever the run's result. |

`<journey>` is the journey's file name without `.mjs`. If a plan names an image such as `m1-2-laptop.png`, copy the saved file to that name, or run a copy of the journey that has the plan's name, as in `--journey /tmp/m1-2.mjs`.

A labeled image is saved when the journey calls `capture`, before the result is known, and it keeps its name in a failed run. So a labeled image proves something only when the run printed `PASSED`.

Each viewport gets its own result, so a run that fails only at phone width leaves `home-laptop.png` beside `home-phone-failed.png`.

A run first deletes the earlier images of that journey and viewport in the output folder, including labeled ones. So a viewport's pass image never sits beside its failed run, and its `-failed` image never sits beside its pass, even when the run is refused or the app does not start. The one exception is a mistyped flag such as `--viewport`. The command exits 1 before it reads any option, including `--out`, so earlier images stay. Images of other journeys and viewports stay. A journey name such as `home-laptop-menu` would lose its images to a run of `home`, so keep viewport names out of journey names.

The widths are in `VIEWPORTS` in `scripts/lib/settings.mjs`. Laptop is 1440 by 900 and phone is 390 by 844.

A proof exercises the path a student uses, not an internal setter or a test-only endpoint. Capture the action and the state after it, and check side effects as well as the screen. Use a mock only where production already has a boundary to an outside system. If the safe path is a dry run or a test mode, observe what it skips, such as files, network calls, and git refs, instead of trusting its name. Report a path you could not reach. Do not report it as passed through a different path.

## Cleanup

```sh
pnpm verify stop
```

Run this after every `start`, including after a failure. It is safe to run twice. It sends SIGTERM to the process group that `start` recorded, and sends SIGKILL to that group only after 10 seconds. Do not `kill -9` pnpm, because that leaves both ports listening. Do not kill by process name, because other lanes run the same programs. `stop` leaves the Supabase stack running.

- Before any signal, it proves the group is this run's. The group must have a member in this checkout, and its leader must have the start time in `.verify/run.json`. If the leader already died, a member must carry this run's ID in its environment. A reused group ID fails that proof, so `stop` leaves it alone.
- It keeps `.verify/run.json` until the group is gone and both ports read free. If a port is still held or cannot be read, it fails, and you can run it again once that is fixed. If another program holds a port after a reboot, stop that program or delete `.verify/run.json`.

Only `run` stops the app when it gets a signal. After a SIGKILL to the `verify` process, or any signal during `start`, including a Ctrl-C once the servers have launched, the app keeps running and `.verify/run.json` stays. After a SIGKILL, Chromium exits by itself, and its temporary profile stays in the system temp folder. In each case, run `pnpm verify stop` to end the app. A signal during the migrate step, before the servers launch, kills that step and leaves nothing.

## Self-check

```sh
pnpm verify:self
```

Run this after you change anything in this skill. It takes about 4 minutes. It uses free ports and its own run folder, so it leaves the record and ports of a run you already have alone. It shares the Supabase stack and `apps/api/dist` with that run, and it uses your `DATABASE_URL`, so run the setup above first, including the seed. It drives the real app and asserts these:

- The run fails on a page that throws, a console error, a journey that throws, a page crash, a page that is not Astra, a throw or crash just after the journey, four kinds of blank page, four kinds of blank Home that keep the shell at both widths, `main` off screen on each side at both widths, a Home blank only at phone width under a floating overlay that touches `main`, a journey that closes its page, an error on a second page, a journey that never settles, and a journey with no default export.
- Two plain pages pass, a plain Home inside the shell passes at both widths, and a rerun replaces the images of that journey and viewport, even when the run is refused.
- `start` and `drive` refuse a taken port, `doctor` and `drive` fail on an API compile error and a dead API, `doctor` fails when the ports answer with something else, `start` shows the API's own error, and `start` shows a migrate failure and starts nothing.
- `stop` ends this run even after its group leader dies, force-kills a group that ignores SIGTERM, and leaves alone a sibling checkout's group, a reused group ID, and a group from another run with no leader.
- `stop` keeps its record while a port read fails or a port is held.
- `run` reports a missing `await` on a call that fails, and SIGINT and SIGTERM sent to the `verify` process and to pnpm's whole process group, and stops the app each time.

## Feature map

Read [features/README.md](features/README.md) before you drive a feature. Run `/pstack:maintain-verification-skill` to find where the map and the app disagree.
