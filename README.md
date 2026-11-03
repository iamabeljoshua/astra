# Astra

Astra is a voice-first personal AI tutor. A student asks a question and has a spoken lesson with a tutor that draws on a board in time with its words.

Astra is a codename and is not public yet. The name that users see is in `apps/web/src/strings.ts`.

The repo is a pnpm workspace with four packages:

- `apps/web` is the web app, on React and Vite.
- `apps/api` is the API, on NestJS.
- `packages/contracts` holds shared types. `pnpm api:types` generates its `api.generated.ts` from the API.
- `packages/theme` holds the colors, fonts, and sizes from `docs/DESIGN.md`.

## Install

You need Node 22, pnpm 10, and Docker.

```sh
pnpm install
```

## Run

```sh
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The last command starts both apps. Open http://localhost:5173. The page shows the product name and says that the API is connected.

The API is at http://localhost:3000. The web app calls it at `/api`, and the Vite dev server forwards those requests. The API listens only on `127.0.0.1`, because its routes have no sign-in yet. A hosting setup must set `API_HOST`, for example to `0.0.0.0`.

To run on other ports, set `WEB_PORT` and `API_PORT`. A second copy of Astra on the same ports prints an error and does not start. A different program on the same port might cause no error, because it can hold a different address on that port. Make sure that the ports are free.

```sh
WEB_PORT=5200 API_PORT=3100 pnpm dev
```

## Use the database

The API stores its data in Postgres and connects through `DATABASE_URL`. If you do not set it, the API uses the `astra` database on the local stack, `postgresql://postgres:postgres@127.0.0.1:54422/astra`. A hosted Supabase project changes only this value.

| Command | What it does |
| --- | --- |
| `pnpm db:up` | Starts the local Supabase stack in Docker. It needs no account. It does nothing if the stack is running. |
| `pnpm db:migrate` | Creates the database in `DATABASE_URL` if it is missing, then runs the migrations. |
| `pnpm db:seed` | Replaces the example student and their six sessions. It works only on a local database. |
| `pnpm db:reset` | Drops the database in `DATABASE_URL` and builds it again from the migrations. It works only on a local app database. |
| `pnpm exec supabase stop` | Stops the local stack for every worktree. The data stays in a Docker volume. Run it, then `pnpm db:up`, if an interrupted start leaves Postgres running without the other services. |

The seed prints the ID of the example student, `00000000-0000-4000-8000-000000000001`. To read the student and their sessions:

```sh
curl http://localhost:3000/students/00000000-0000-4000-8000-000000000001
curl http://localhost:3000/students/00000000-0000-4000-8000-000000000001/sessions
```

All worktrees share one stack, on ports 54421 (API gateway), 54422 (Postgres), and 54424 (email inbox). To run copies of Astra at the same time, give each copy its own database:

```sh
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54422/astra_lane1
pnpm db:migrate
pnpm db:seed
API_PORT=3100 WEB_PORT=5200 pnpm dev
```

The Supabase CLI publishes these ports on all network interfaces, so another machine on your network can reach them. Keep only example data in the local stack.

To change the tables:

1. Change the entity. Entities are in files that end in `.entity.ts`. TypeORM owns the migrations, `synchronize` stays off, and nothing writes to the `auth` schema.
2. Run `pnpm db:migrate` on a database that has every earlier migration.
3. Run `pnpm db:migration src/database/migrations/<name>`. The path is relative to `apps/api`.
4. Add the new class to `migrations` in `apps/api/src/database/data-source-options.ts`.

`pnpm test` fails if the entities and the migrations differ.

## Read the API docs

Swagger UI is at http://localhost:3000/docs, and the OpenAPI document is at http://localhost:3000/docs-json. The Swagger plugin builds both from the DTO classes and code comments in `apps/api`.

`serveApiDocs` in `apps/api/src/api-docs.ts` decides whether the API serves these routes. It serves them only when `NODE_ENV` is exactly `development`. `pnpm dev` sets that value if `NODE_ENV` is not already set, so `NODE_ENV=production pnpm dev` keeps the docs off.

## Add a DTO

Every request body, query string, route parameter, and response in the API is a DTO class. `apps/api/src/health/` is the worked example, and it has a response only. `apps/api/test/probe.dto.ts` shows a request body, a query string, and a route parameter.

1. Create a file with a name that ends in `.dto.ts`. The Swagger plugin ignores DTOs in other files, and it ignores routes outside files that end in `.controller.ts`.
2. Add a class with one field for each input. Put a `/** comment */` on each field. The comment becomes the field description in the docs.
3. Add `class-validator` rules to each field. The API rejects a request field that has no rule, as if the DTO did not declare it. Give each number a real limit with `@Max`, and each text field a limit with `@MaxLength`. Add `@IsStorableText()` to text that the API saves, because a null character makes Postgres fail with a server error. The plugin documents a single literal type such as `'ok'` as a plain string, so add `@IsIn(['ok'])` to keep the literal. `@IsOptional()` also accepts `null`, so a handler must handle both a missing value and `null`.
4. If a query string or a route parameter holds a number, add `@Type(() => Number)` from `class-transformer`, because the value arrives as a string. Do not add it to a number in a body, because it turns `true` into 1. Do not use `@Type(() => Boolean)`, because it turns the string `false` into `true`.
5. If a field holds another DTO, add `@IsObject()`, `@ValidateNested()`, and `@Type(() => OtherDto)`. If a field holds a list of DTOs, add `@IsArray()`, `@IsObject({ each: true })`, `@ValidateNested({ each: true })`, and `@Type(() => OtherDto)`. Without `@IsObject({ each: true })`, the API accepts a list inside a list. Add `@ArrayNotEmpty()` if an empty list is wrong. `@ValidateNested()` and `@Type` alone accept a missing field or an array. Without `@ValidateNested()`, the API does not check the inner fields. `@ValidateNested()` without `@Type` rejects every inner field, valid ones included.
6. Use the class in the route, as `@Body() body: CreateThingBodyDto`, `@Query() query: ListThingsQueryDto`, or `@Param() routeParams: ThingRouteParamsDto`. Do not use `@Query('name')` or `@Param('id')`, because `ValidationPipe` does not check them. Do not use `@Body('name')`, an interface, `Partial<Dto>`, `Pick<>`, `Record<>`, `unknown`, `@Req()`, or a bare array as a body, because the API then accepts any body. To accept a list, wrap it in a DTO with a list field. Do not import a DTO with `import type`, because the API then rejects every valid body with a 400 and accepts an empty body with a 201.
7. Put a `/** comment */` on the route. The comment becomes the route summary. Give the route a return type, so that the docs show the response.
8. If the route reads from the database, map each entity to a response DTO. A response is not limited to the fields of its DTO, so a returned entity sends every column to the client.
9. Run `pnpm api:types` and commit the changed `packages/contracts/src/api.generated.ts`.
10. In the web app, write `import type { components } from '@astra/contracts'` and read the type as `components['schemas']['CreateThingBodyDto']`.

Do not write Swagger decorators by hand. `pnpm test` fails if a route, a route parameter, or a DTO field has no comment, if a POST, PUT, or PATCH route has no DTO body, or if an entity appears in the docs. If a route really takes no body, add it to `WRITE_ROUTES_WITHOUT_BODY` in `apps/api/src/openapi.spec.ts`.

## Test

```sh
pnpm lint
pnpm typecheck
pnpm test
```

`pnpm test` needs Postgres, so run `pnpm db:up` first. Each spec file that uses the database creates its own database and drops it at the end, so test runs in several worktrees can share the stack. If Postgres is not reachable, those specs fail and say how to start it, and the other tests still run.

CI runs the same three commands on every PR and on every push to `main`. CI also runs `pnpm api:types` and fails if that changes `packages/contracts/src/api.generated.ts`. It starts Postgres with `pnpm exec supabase db start`, so the pinned CLI picks the same image as the local stack, and it builds a fresh database from the migrations and seeds it.
