import { createParamDecorator, SetMetadata } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

export type RouteAccess = 'public' | 'signedIn' | 'student';

export const ROUTE_ACCESS_KEY = 'routeAccess';

export const DEFAULT_ROUTE_ACCESS: RouteAccess = 'student';

export const PublicRoute = () => SetMetadata(ROUTE_ACCESS_KEY, 'public' satisfies RouteAccess);

export const SignedInRoute = () => SetMetadata(ROUTE_ACCESS_KEY, 'signedIn' satisfies RouteAccess);

export interface SignedInRequest {
  headers: { authorization?: string };
  authUserId?: string;
  authEmail?: string | null;
  isAddressClosed?: boolean;
  studentId?: string;
}

export interface SignIn {
  authUserId: string;
  email: string | null;
  isAddressClosed: boolean;
}

function readRequest(context: ExecutionContext): SignedInRequest {
  return context.switchToHttp().getRequest<SignedInRequest>();
}

export const CurrentAuthUserId = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  readRequest(context).authUserId,
);

export const CurrentSignIn = createParamDecorator((_data: unknown, context: ExecutionContext): SignIn => {
  const { authUserId, authEmail, isAddressClosed } = readRequest(context);
  return { authUserId: authUserId as string, email: authEmail ?? null, isAddressClosed: isAddressClosed ?? false };
});

export const CurrentStudentId = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  readRequest(context).studentId,
);
