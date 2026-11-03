import { randomUUID } from 'node:crypto';
import { request as sendHttpRequest } from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '../src/auth/auth.guard';
import type { SignedInRequest } from '../src/auth/route-access';

interface ExpressLayer {
  name: string;
  route?: { path: string; methods: Record<string, boolean> };
}

export interface TableRoute {
  name: string;
  verb: string;
  url: string;
}

const ALL_VERBS_KEY = '_all';
// Node sends CONNECT to a separate server event, so no route handler ever answers it.
const VERB_NO_ROUTE_ANSWERS = 'connect';
const ROUTE_PARAMETER = /:[A-Za-z_]+/g;
const REFUSED_STATUSES = [401, 403];

function getExpressLayers(app: INestApplication): ExpressLayer[] {
  return (app.getHttpAdapter().getInstance() as { router: { stack: ExpressLayer[] } }).router.stack;
}

function listLayersWithoutRoutes(app: INestApplication): string[] {
  return getExpressLayers(app)
    .filter((layer) => !layer.route)
    .map((layer) => layer.name);
}

// Middleware added with app.use or forRoutes('path') has no route to call, so it shows only as a layer an empty app lacks.
export async function findLayersAddedToEmptyApp(app: INestApplication): Promise<string[]> {
  const testingModule = await Test.createTestingModule({}).compile();
  const emptyApp = testingModule.createNestApplication();
  await emptyApp.init();
  const emptyAppLayers = listLayersWithoutRoutes(emptyApp);
  await emptyApp.close();
  const added = listLayersWithoutRoutes(app);
  for (const layer of emptyAppLayers) added.splice(added.indexOf(layer), 1);
  return added;
}

export function listRoutes(app: INestApplication): TableRoute[] {
  return getExpressLayers(app).flatMap(({ route }) =>
    Object.keys(route?.methods ?? {})
      .filter((method) => method !== VERB_NO_ROUTE_ANSWERS)
      .map((method) => {
        const verb = method === ALL_VERBS_KEY ? 'get' : method;
        return { name: `${verb} ${route?.path}`, verb, url: String(route?.path).replace(ROUTE_PARAMETER, randomUUID()) };
      }),
  );
}

function callRoute(app: INestApplication, route: TableRoute, token?: string): Promise<IncomingMessage> {
  const { port } = (app.getHttpServer() as { address: () => AddressInfo }).address();
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  return new Promise((resolve, reject) => {
    sendHttpRequest({ host: '127.0.0.1', port, method: route.verb.toUpperCase(), path: route.url, headers }, (response) => {
      response.resume();
      response.on('end', () => resolve(response));
    })
      .on('error', reject)
      .end();
  });
}

export interface RouteWalk {
  app: INestApplication;
  routes: TableRoute[];
  token?: string;
}

export async function getRouteAnswers({ app, routes, token }: RouteWalk): Promise<string[]> {
  return Promise.all(routes.map(async (route) => `${route.name} -> ${(await callRoute(app, route, token)).statusCode}`));
}

export async function findRoutesWithoutNoStore({ app, routes, token }: RouteWalk): Promise<string[]> {
  const answers = await Promise.all(routes.map(async (route) => ({ route, response: await callRoute(app, route, token) })));
  return answers.filter(({ response }) => response.headers['cache-control'] !== 'no-store').map(({ route }) => route.name);
}

function watchIdentityReads(signedInRequest: SignedInRequest, onRead: () => void) {
  for (const field of ['authUserId', 'studentId'] as const) {
    const value = signedInRequest[field];
    Object.defineProperty(signedInRequest, field, {
      get: () => {
        onRead();
        return value;
      },
    });
  }
}

// A handler that never reads who is asking cannot be limiting its answer to that person.
export async function findRoutesIgnoringIdentity({ app, routes, token }: RouteWalk): Promise<string[]> {
  const checkToken = AuthGuard.prototype.canActivate;
  const routesThatRead = new Set<string>();
  let currentRoute = '';
  const guard = jest.spyOn(AuthGuard.prototype, 'canActivate').mockImplementation(async function checkThenWatch(this: AuthGuard, context) {
    const isAllowed = await checkToken.call(this, context);
    const routeBeingCalled = currentRoute;
    watchIdentityReads(context.switchToHttp().getRequest<SignedInRequest>(), () => routesThatRead.add(routeBeingCalled));
    return isAllowed;
  });
  const ignoring: string[] = [];
  try {
    for (const route of routes) {
      currentRoute = route.name;
      const { statusCode } = await callRoute(app, route, token);
      if (!REFUSED_STATUSES.includes(statusCode ?? 0) && !routesThatRead.has(route.name)) ignoring.push(route.name);
    }
    return ignoring;
  } finally {
    guard.mockRestore();
  }
}
