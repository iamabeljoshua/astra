# Astra

Astra is a voice-first personal AI tutor. A student asks a question and has a spoken lesson with a tutor that draws on a board in time with its words.

Astra is a codename and is not public yet. The name that users see is in `apps/web/src/strings.ts`.

The repo is a pnpm workspace with three packages:

- `apps/web` is the web app, on React and Vite.
- `apps/api` is the API, on NestJS.
- `packages/contracts` holds shared types. `pnpm api:types` generates its `api.generated.ts` from the API.

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

## Read the API docs

Swagger UI is at http://localhost:3000/docs, and the OpenAPI document is at http://localhost:3000/docs-json. The Swagger plugin builds both from the DTO classes and code comments in `apps/api`.

`serveApiDocs` in `apps/api/src/api-docs.ts` decides whether the API serves these routes. It turns them off when `NODE_ENV` is `production`, and it leaves them on for any other value or when `NODE_ENV` is not set. A deploy must set `NODE_ENV=production`.

## Add a DTO

Every request body, query string, route parameter, and response in the API is a DTO class. `apps/api/src/health/` is the worked example, and it has a response only. `apps/api/test/probe.dto.ts` shows a request body, a query string, and a route parameter.

1. Create a file with a name that ends in `.dto.ts`. The Swagger plugin ignores DTOs in other files, and it ignores routes outside files that end in `.controller.ts`.
2. Add a class with one field for each input. Put a `/** comment */` on each field. The comment becomes the field description in the docs.
3. Add `class-validator` rules to each field. The API rejects a request field that has no rule, as if the DTO did not declare it. The plugin documents a single literal type such as `'ok'` as a plain string, so add `@IsIn(['ok'])` to keep the literal.
4. If a query string or a route parameter holds a number, add `@Type(() => Number)` from `class-transformer`, because the value arrives as a string.
5. If a field holds another DTO, add `@ValidateNested()` and `@Type(() => OtherDto)`. Without them, the API does not check the inner fields.
6. Use the class in the route, as `@Body() body: CreateThingBodyDto`, `@Query() query: ListThingsQueryDto`, or `@Param() routeParams: ThingRouteParamsDto`. Do not use `@Query('name')` or `@Param('id')`, because `ValidationPipe` does not check them.
7. Put a `/** comment */` on the route. The comment becomes the route summary. Give the route a return type, so that the docs show the response.
8. Run `pnpm api:types` and commit the changed `packages/contracts/src/api.generated.ts`.
9. In the web app, import `components` from `@astra/contracts` and read the type as `components['schemas']['CreateThingBodyDto']`.

Do not write Swagger decorators by hand. `pnpm test` fails if a route, a route parameter, or a DTO field has no comment.

## Test

```sh
pnpm lint
pnpm typecheck
pnpm test
```

CI runs the same three commands on every PR and on every push to `main`. CI also runs `pnpm api:types` and fails if that changes `packages/contracts/src/api.generated.ts`.
