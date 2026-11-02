# Astra

Astra is a voice-first personal AI tutor. A student asks a question and has a spoken lesson with a tutor that draws on a board in time with its words.

Astra is a codename and is not public yet. The name that users see is in `apps/web/src/strings.ts`.

The repo is a pnpm workspace with three packages:

- `apps/web` is the web app, on React and Vite.
- `apps/api` is the API, on NestJS.
- `packages/contracts` holds the types that both apps share.

## Install

You need Node 22 and pnpm 10.

```sh
pnpm install
```

## Run

```sh
pnpm dev
```

The command starts both apps. Open http://localhost:5173. The page shows the product name and says that the API is connected.

The API is at http://localhost:3000. The web app calls it at `/api`, and the Vite dev server forwards those requests.

To run on other ports, set `WEB_PORT` and `API_PORT`. A second copy of Astra on the same ports prints an error and does not start. A different program on the same port might cause no error, because it can hold a different address on that port. Make sure that the ports are free.

```sh
WEB_PORT=5200 API_PORT=3100 pnpm dev
```

## Test

```sh
pnpm lint
pnpm typecheck
pnpm test
```

CI runs the same three commands on every PR and on every push to `main`.
