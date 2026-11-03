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

The last command starts both apps. Open http://127.0.0.1:5173, not `localhost`, as [Sign in](#sign-in) explains. The page asks you to sign in.

The API is at http://127.0.0.1:3000. The web app calls it at `/api`, and the Vite dev server forwards those requests. By default the API listens only on `127.0.0.1`. A hosting setup must set `API_HOST`, for example to `0.0.0.0`.

To run on other ports, set `WEB_PORT` and `API_PORT`. A second copy of Astra on the same ports prints an error and does not start. A different program on the same port might cause no error, because it can hold a different address on that port. Make sure that the ports are free.

```sh
WEB_PORT=5200 API_PORT=3100 pnpm dev
```

## Use the database

The API stores its data in Postgres and connects through `DATABASE_URL`. If you do not set it, the API uses the `astra` database on the local stack, `postgresql://postgres:postgres@127.0.0.1:54422/astra`. Every table is in the private `app` schema, so Supabase's Data API cannot reach it. To use a hosted project, see [Connect a hosted project](#connect-a-hosted-project).

| Command | What it does |
| --- | --- |
| `pnpm db:up` | Starts the local Supabase stack in Docker if it is not running. It needs no account. It then creates the local sign-in accounts and writes `apps/web/.env.development.local`, so run it once in each worktree. |
| `pnpm db:migrate` | Creates the database in `DATABASE_URL` and its `app` schema if they are missing, then runs the migrations. |
| `pnpm db:seed` | Replaces the example student and their six sessions, and makes the `new-student@astra.test` account new again. It works only on the local stack, on port 54422. |
| `pnpm db:reset` | Drops the database in `DATABASE_URL` and builds it again from the migrations. It works only on an app database on the local stack, on port 54422. |
| `pnpm exec supabase stop` | Stops the local stack for every worktree. The data stays in a Docker volume. Run it, then `pnpm db:up`, if an interrupted start leaves Postgres running without the other services. |

These commands and the API refuse a `DATABASE_URL` that sets `host` or `port` in its query string, because the driver would connect there and ignore the address before the database name.

The example student signs in as `maya@astra.test`. To read the student and their sessions, get a token for that account and send it:

```sh
KEY=$(pnpm --silent exec supabase status -o env | sed -n 's/^PUBLISHABLE_KEY="\(.*\)"/\1/p')
TOKEN=$(curl -s 'http://127.0.0.1:54421/auth/v1/token?grant_type=password' -H "apikey: $KEY" -H 'content-type: application/json' -d '{"email":"maya@astra.test","password":"local-development-only"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).access_token')
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3000/me
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3000/sessions
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

1. Change the entity. Entities are in files that end in `.entity.ts`. Their tables go in the `app` schema, so do not set a schema on an entity. TypeORM owns the migrations, `synchronize` stays off, and nothing writes to the `auth` schema.
2. If the entity is new, add it to `entities` in `apps/api/src/database/data-source-options.ts` and to `TypeOrmModule.forFeature` in its module. The next steps and `pnpm test` do not see an entity that is missing from `entities`.
3. Run `pnpm db:migrate` on a database that has every earlier migration.
4. Run `pnpm db:migration src/database/migrations/<name>`. The path is relative to `apps/api`.
5. Add the new class to `migrations` in `apps/api/src/database/data-source-options.ts`.

`pnpm test` fails if the entities in that list and the migrations differ, if a table is outside `app`, or if `anon` or `authenticated` gets `USAGE` on `app`.

`pnpm test` drops each database that it creates, but a crash or a timeout can leave a database named `astra_test_<id>`. To delete the leftovers, first stop the test runs in every worktree, because this command also drops their databases:

```sh
docker exec supabase_db_astra psql -U postgres -Atc "SELECT format('DROP DATABASE %I WITH (FORCE);', datname) FROM pg_database WHERE datname LIKE 'astra\_test\_%'" | docker exec -i supabase_db_astra psql -U postgres
```

## Sign in

Students sign in with an email link or Google, through Supabase Auth. They have no passwords. `apps/web/src/auth/session.ts` owns the Supabase client, and `apps/web/src/api/client.ts` reads the token from it for each call.

To sign in on the local stack, use one of these:

- The **Development sign-in** box on the sign-in page. `maya@astra.test` is the seeded student, and `new-student@astra.test` has no student yet. The box is only in a development build, and these accounts exist only on the local stack.
- An email link. Enter any address that ends in `@astra.test`, open the local inbox at http://127.0.0.1:54424, and follow the link in the same browser. No real email leaves your computer.

Open the app on `127.0.0.1`. The running stack sends a link back only to the host of its site URL, on any port, and it sends any other address to the site URL instead. `supabase/config.toml` also allows `localhost` on any port, once a stack starts with that file. A stack that started before that change keeps its old settings until `pnpm exec supabase stop` and `pnpm db:up`, and the stop affects every worktree.

The sign-in link works only in the browser that asked for it, because the flow is PKCE. Any other browser shows the sign-in page and asks for a new link.

To turn on the Google button, build the web app with `VITE_GOOGLE_SIGN_IN=on` once the project has Google credentials. Until then the button stays hidden.

### Who can call a route

A global guard, `apps/api/src/auth/auth.guard.ts`, checks every route, so a new route starts closed:

| Decorator on the route | Who can call it |
| --- | --- |
| None | A signed-in user with a student. Other users get a 403, and a missing or bad token gets a 401. |
| `@SignedInRoute()` | Any signed-in user, with or without a student, such as `GET /me`. |
| `@PublicRoute()` | Anyone, such as `GET /health`. |

The student's identity comes only from the token. Read it with `@CurrentStudentId()` and never take a student ID from a path, a query, or a body. `pnpm test` fails if a route takes a field with such a name, or if a new route is reachable without a token unless it is on the short public list in `apps/api/src/auth/auth.guard.spec.ts`. A route that reads or changes one row by its own ID must filter on both that ID and the student ID.

The guard checks the token signature against the keys that Auth publishes at `/auth/v1/.well-known/jwks.json`, and it checks the issuer, the audience, the role, and the expiry. It accepts ES256 and RS256 only. It answers 503, not 401, if it cannot read the keys.

After sign-out, the browser has no token and Auth refuses the refresh token. An access token copied before the sign-out still works at the API until it expires, which is 1 hour by default.

### The date of birth question

`POST /me/birth-date` takes the first answer, and later answers change nothing. A student who is old enough gets a row in `students`. A student who is too young gets no student row, the API never stores the date, and a row in `closed_accounts` holds only the Supabase user ID and the time. Every later sign-in with that user finds the account closed, on any device.

The server's clock and UTC-12 decide the student's age, so nobody counts as old enough until the birthday has begun everywhere on Earth. A device's clock and time zone play no part. A birthday on 29 February falls on 1 March in other years. `apps/api/src/auth/age-gate.ts` holds the rule, and no web code or message states the age.

`students.auth_user_id` and `closed_accounts.auth_user_id` are plain uuids with no foreign key, because app databases have no `auth` schema. Deleting a user in Supabase therefore leaves that user's rows in place. No token can reach those rows once the user's last token expires. To remove a student, delete the row in `students`, which also removes the profile and sessions, before you delete the Supabase user. Deleting the Supabase user of a closed account lets the same address sign up as a new user and answer again, so keep that user until the deletion work in M4.5 settles how to prevent it.

## Connect a hosted project

No Supabase project exists yet, so nothing here has run against a real one. Measured means that the result comes from the local stack or from a local stand-in server with a private certificate. Docs means that the result comes from Supabase's documentation and is untested.

1. Keep the tables out of the Data API. Every table, including TypeORM's `migrations` table, is in the private `app` schema, and `anon` and `authenticated` have no `USAGE` on it. With the anon key, REST, GraphQL, and the OpenAPI listing show none of these tables. Measured.
2. In the dashboard, turn off **Enable Data API**. If a later feature needs the Data API, turn off **Automatically expose new tables**, and do not add `app` to the exposed schemas. Docs.
3. Choose a connection. A direct connection to `db.<project-ref>.supabase.co:5432` uses IPv6 on the Free plan. The shared pooler uses IPv4, port 5432 for session mode, and the user `postgres.<project-ref>`, and the Connect dialog shows its host. A host without IPv6 needs the pooler or the paid IPv4 add-on, and the add-on is Abel's decision. Docs.
4. Download the CA certificate from **Database settings > SSL Configuration**, then add `sslmode=verify-full&sslrootcert=<path to the file>` to `DATABASE_URL`. The dashboard path and the certificate of the real servers are docs. The driver's behavior is measured in the table below.
5. Run `pnpm db:migrate` with that `DATABASE_URL`, then start the API. Measured on the stand-in server. `pnpm db:reset`, `pnpm db:seed`, and `pnpm test` refuse a hosted URL.
6. Set `SUPABASE_URL` on the API to `https://<project-ref>.supabase.co`. The API does not start without it unless `NODE_ENV` is `development`, and it refuses `http` on a host that is not local. Measured on the local stack and a second local Auth service.
7. Build the web app with `VITE_SUPABASE_URL` set to the same address and `VITE_SUPABASE_PUBLISHABLE_KEY` set to the publishable key, or the anon key on an older project. Never put the secret key or the service role key in a `VITE_` value, because the browser receives every one of those. Measured on the local stack.
8. In **Authentication > Sign In / Providers**, keep the email provider on. Turn on **Google** when credentials exist, then set `VITE_GOOGLE_SIGN_IN=on`. Docs.
9. Set the **Site URL** in **Authentication > URL Configuration** to the address of the web app. A link can return only to that host or to an address on the redirect list. Measured on the local stack, where hostile addresses fell back to the site URL. Docs for the dashboard.
10. Check that **JWT Keys** shows an asymmetric signing key, ES256 or RS256. The API refuses tokens signed with a shared secret. Docs.
11. Set up your own SMTP before real students use this. Built-in email allows 2 messages an hour for the whole project, and a user can ask for a new link once every 60 seconds. Docs. The app tells the student to wait when Auth answers 429. Measured on a local Auth service with its limit set to 3.
12. If the API moves to a host that is not on the same address as the web app, add CORS for that address. The API has none, and the web app reaches it through a proxy in development. Not measured.

The driver reads `sslmode` differently from the Supabase docs, which say that `require` does not check the server. All of these results are measured with a private CA.

| `DATABASE_URL` query | Result on a host that is not local |
| --- | --- |
| No `sslmode`, an empty `sslmode`, or `sslmode=disable` | The API and the database commands stop with an error. Without that check, the driver connects in plaintext and reports nothing. |
| `sslmode=require` | Fails with `self-signed certificate in certificate chain`. The driver treats `require`, `prefer`, and `verify-ca` as `verify-full`. |
| `sslmode=verify-full&sslrootcert=<file>` | Connects with TLS and checks the server. Use this one. |
| `sslmode=no-verify` | Connects with TLS and does not check the server, so it does not stop a man-in-the-middle attack. Use it only to find out why `verify-full` fails. |

## Read the API docs

Swagger UI is at http://127.0.0.1:3000/docs, and the OpenAPI document is at http://127.0.0.1:3000/docs-json. To call a route from Swagger UI, choose **Authorize** and paste a token. The Swagger plugin builds both from the DTO classes and code comments in `apps/api`.

`serveApiDocs` in `apps/api/src/api-docs.ts` decides whether the API serves these routes. It serves them only when `NODE_ENV` is exactly `development`. `pnpm dev` sets that value if `NODE_ENV` is not already set, so `NODE_ENV=production pnpm dev` keeps the docs off.

## Add a DTO

Every request body, query string, route parameter, and response in the API is a DTO class. `apps/api/src/health/` is the worked example, and it has a response only. `apps/api/test/probe.dto.ts` shows a request body, a query string, and a route parameter.

1. Create a file with a name that ends in `.dto.ts`. The Swagger plugin ignores DTOs in other files, and it ignores routes outside files that end in `.controller.ts`.
2. Add a class with one field for each input. Put a `/** comment */` on each field. The comment becomes the field description in the docs.
3. Add `class-validator` rules to each field. The API rejects a request field that has no rule, as if the DTO did not declare it. Give each number a real limit with `@Max`, and each text field a limit with `@MaxLength`. Add `@IsStorableText()` to text that the API saves, because a null character makes Postgres fail with a server error and a lone surrogate reads back changed. It also rejects text with nothing visible, such as only zero-width characters. The plugin documents a single literal type such as `'ok'` as a plain string, so add `@IsIn(['ok'])` to keep the literal. `@IsOptional()` also accepts `null`, so a handler must handle both a missing value and `null`.
4. If a query string or a route parameter holds a whole number, add `@ToStrictInteger()` from `apps/api/src/to-strict-integer.ts`, because the value arrives as a string. It converts only plain digits, so `@IsInt()` rejects `0x10`, `1e1`, and ` 5`. Do not use `@Type(() => Number)` here, because it accepts all three. Do not add either one to a number in a body, because a JSON number needs no conversion, and `@Type(() => Number)` turns `true` into 1. Do not use `@Type(() => Boolean)`, because it turns the string `false` into `true`. To make a query field optional with a default, write `limit?: number` with `@IsOptional()`, say the default in the field comment, and set it where the route reads the value, as in `query.limit ?? DEFAULT_SESSIONS_PER_LIST`. Do not write `limit: number = 50`, because the docs and the generated type then say that the field is required.
5. If a field holds another DTO, add `@IsObject()`, `@ValidateNested()`, and `@Type(() => OtherDto)`. If a field holds a list of DTOs, add `@IsArray()`, `@IsObject({ each: true })`, `@ValidateNested({ each: true })`, and `@Type(() => OtherDto)`. Without `@IsObject({ each: true })`, the API accepts a list inside a list. Add `@ArrayNotEmpty()` if an empty list is wrong. `@ValidateNested()` and `@Type` alone accept a missing field or an array. Without `@ValidateNested()`, the API does not check the inner fields. `@ValidateNested()` without `@Type` rejects every inner field, valid ones included.
6. Use the class in the route, as `@Body() body: CreateThingBodyDto`, `@Query() query: ListThingsQueryDto`, or `@Param() routeParams: ThingRouteParamsDto`. Do not use `@Query('name')` or `@Param('id')`, because `ValidationPipe` does not check them. Do not use `@Body('name')`, an interface, `Partial<Dto>`, `Pick<>`, `Record<>`, `unknown`, `@Req()`, or a bare array as a body, because the API then accepts any body. To accept a list, wrap it in a DTO with a list field. Do not import a DTO with `import type`, because the API then rejects every valid body with a 400 and accepts an empty body with a 201.
7. Put a `/** comment */` on the route. The comment becomes the route summary. Give the route a return type, so that the docs show the response. If the route holds student data, read the student with `@CurrentStudentId()`, as [Who can call a route](#who-can-call-a-route) says.
8. If the route reads from the database, map each entity to a response DTO. A response is not limited to the fields of its DTO, so a returned entity sends every column to the client.
9. Run `pnpm api:types` and commit the changed `packages/contracts/src/api.generated.ts`.
10. In the web app, write `import type { components } from '@astra/contracts'` and read the type as `components['schemas']['CreateThingBodyDto']`.

Do not write Swagger decorators by hand. `pnpm test` fails if a route, a route parameter, or a DTO field has no comment, if a POST, PUT, or PATCH route has no DTO body, or if an entity appears in the docs. If a route really takes no body, add it to `WRITE_ROUTES_WITHOUT_BODY` in `apps/api/src/openapi.spec.ts`.

## Add a query and a mutation

Every API call in the web app goes through `api` in `apps/web/src/api/client.ts`, and each call carries the signed-in student's token. `pnpm lint` rejects a direct `fetch` in `apps/web` outside `apps/web/src/api/` and `apps/web/src/auth/session.ts`.

This section continues from the last step of "Add a DTO". List a new controller in `controllers` of its feature module, and list a new module in `imports` in `apps/api/src/app.module.ts`. `pnpm api:types` exits 0 and generates no routes for a controller that is not listed. The examples use `GET /things`, which takes a `limit` query and returns a list of `ThingResponseDto`, and `POST /things`, which takes a `CreateThingBodyDto` with a `title`.

1. Create the hooks, for example in `apps/web/src/things/useThings.ts`. Pass the `signal` from React Query, so that leaving the screen cancels the request. After a mutation, invalidate the key of each query that it changes.

   ```ts
   import type { components } from '@astra/contracts';
   import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
   import { api } from '../api/client';

   const THINGS_KEY = ['things'];

   export function useThings(limit: number) {
     return useQuery({
       queryKey: [...THINGS_KEY, limit],
       queryFn: ({ signal }) => api.get('/things', { params: { query: { limit } }, signal }),
     });
   }

   export function useCreateThing() {
     const queryClient = useQueryClient();
     return useMutation({
       mutationFn: (body: components['schemas']['CreateThingBodyDto']) => api.post('/things', { body }),
       onSuccess: () => queryClient.invalidateQueries({ queryKey: THINGS_KEY }),
     });
   }
   ```

   `api.get` and the other calls return the response data and throw an `ApiError` for every failure. `pnpm typecheck` fails if the route, the query, or the body is wrong. A route parameter goes in `params: { path: { thingId } }`. A query DTO and a route parameter DTO are not in `components`, so write `import type { paths } from '@astra/contracts'` and read their types as `paths['/things']['get']['parameters']['query']` and `paths['/things/{thingId}']['get']['parameters']['path']`.

2. Add the text for the screen to `apps/web/src/strings.ts`.

   ```ts
   export const THING_LABELS = {
     loading: 'Loading.',
     title: 'Title',
     create: 'Add',
     titleRejected: 'Enter a title.',
   };
   ```

3. Create the screen, for example in `apps/web/src/things/Things.tsx`. Show `API_ERROR_LABELS[error.kind]` from `strings.ts`, or your own label for a field. Do not show `error.message` or the text in `error.fieldMessages`, because the API writes them for developers.

   ```tsx
   import { useState } from 'react';
   import { API_ERROR_LABELS, THING_LABELS } from '../strings';
   import { useCreateThing, useThings } from './useThings';

   export function Things() {
     const things = useThings(10);
     const createThing = useCreateThing();
     const [title, setTitle] = useState('');

     return (
       <>
         {things.isPending && <p>{THING_LABELS.loading}</p>}
         {things.error && <p>{API_ERROR_LABELS[things.error.kind]}</p>}
         {things.data?.map((thing) => <p key={thing.id}>{thing.title}</p>)}
         <form
           onSubmit={(event) => {
             event.preventDefault();
             createThing.mutate({ title });
           }}
         >
           <input aria-label={THING_LABELS.title} value={title} onChange={(event) => setTitle(event.target.value)} />
           <button disabled={createThing.isPending}>{THING_LABELS.create}</button>
         </form>
         {createThing.error && (
           <p>
             {createThing.error.fieldMessages.title
               ? THING_LABELS.titleRejected
               : API_ERROR_LABELS[createThing.error.kind]}
           </p>
         )}
       </>
     );
   }
   ```

   To give the screen its own page, add `things: 'Things'` to `MENU_LABELS` in `strings.ts`, and add `{ path: '/things', label: MENU_LABELS.things, Page: Things }` to `MENU` in `apps/web/src/shell/menu.ts`.

4. Test the screen with `renderWithQueryClient`. It uses the app's query defaults with no retries, so a failure reaches the screen at once.

   ```tsx
   import { fireEvent, screen } from '@testing-library/react';
   import { afterEach, it, vi } from 'vitest';
   import { THING_LABELS } from '../strings';
   import { renderWithQueryClient } from '../test/renderWithQueryClient';
   import { Things } from './Things';

   const TITLE_REJECTED_BODY = {
     message: ['title must be a string'],
     error: 'Bad Request',
     statusCode: 400,
     fieldMessages: { title: ['title must be a string'] },
   };

   afterEach(() => {
     vi.unstubAllGlobals();
   });

   it('says when the API rejects the title', async () => {
     vi.stubGlobal('fetch', async (request: Request) =>
       request.method === 'POST'
         ? new Response(JSON.stringify(TITLE_REJECTED_BODY), { status: 400 })
         : new Response('[]'),
     );

     renderWithQueryClient(<Things />);
     fireEvent.click(screen.getByRole('button', { name: THING_LABELS.create }));

     await screen.findByText(THING_LABELS.titleRejected);
   });
   ```

Every failed request reaches the screen as the same `ApiError`, with these fields:

| `kind` | When | `status` | `fieldMessages` |
| --- | --- | --- | --- |
| `validation` | `ValidationPipe` rejected the request. | 400 | The sentences for each field, by path, such as `title`, `owner.ownerName`, or `sensors.0.sensorName`. Empty if the request is nested too deeply. |
| `rejected` | The API refused the request, as with a 401, a 404, or a 400 for JSON that it cannot read. | The status | Empty |
| `server` | The answer has a status of 500 or above. Under `pnpm dev`, a stopped API arrives here as a 502 from the Vite dev server. | The status | Empty |
| `network` | The browser cannot reach the web server, a read returned no JSON, or a write returned something other than JSON. | `null` | Empty |
| `aborted` | A signal or the request timeout stopped the request. | `null` | Empty |

The API sends each rejected field as data. A validation 400 has this body, and `apps/api/src/request-validation.module.ts` builds it:

```json
{
  "message": ["owner.ownerName must be a string"],
  "error": "Bad Request",
  "statusCode": 400,
  "fieldMessages": { "owner.ownerName": ["owner.ownerName must be a string"] }
}
```

A custom `message` on a DTO rule keeps its field. A rule on each value of a list, such as `@IsString({ each: true })`, names the list and not the item.

`createQueryClient` in `apps/web/src/api/queryClient.ts` holds the shared defaults. A query tries a `server`, `network`, or `aborted` failure up to 3 times and a `validation` or `rejected` failure once. A mutation does not retry. Data stays fresh for 30 seconds. A query with stale data or a failure runs again when the browser comes back online. Set an option on a hook only if that hook needs something else, as `apps/web/src/useApiConnection.ts` does because it keeps checking until the API answers.

Each call stops after `DEFAULT_REQUEST_TIMEOUT_MS`, 10 seconds, with an `aborted` error. With its retries, a read that never answers reaches the screen after about 33 seconds. For a call that is slow on purpose, pass your own limit, as in `api.post('/things', { body, timeoutMs: 120_000 })`.

`pnpm dev` shows the React Query devtools button at the top left of the page. The devtools are not in the production build.

## Test

```sh
pnpm lint
pnpm typecheck
pnpm test
```

`pnpm test` needs Postgres, so run `pnpm db:up` first. It does not need Supabase Auth, because the API tests sign tokens with a key that they generate and publish from a local server, in `apps/api/test/test-auth.ts`. Each spec file that uses the database creates its own database and drops it at the end, so test runs in several worktrees can share the stack. If Postgres is not reachable, those specs fail and say how to start it, and the other tests still run. Those specs refuse a `DATABASE_URL` that is not on the local stack, on port 54422.

CI runs the same three commands on every PR and on every push to `main`. CI also runs `pnpm api:types` and fails if that changes `packages/contracts/src/api.generated.ts`. It starts Postgres with `pnpm exec supabase db start`, so the pinned CLI picks the same image as the local stack, and it builds a fresh database from the migrations and seeds it. CI starts to pull that image early, and it fails if `POSTGRES_TAG` in `ci.yml` differs from the CLI's choice. After a CLI upgrade, set `POSTGRES_TAG` to the tag that the error names.
