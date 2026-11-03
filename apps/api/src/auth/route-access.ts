import { createParamDecorator, SetMetadata } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

export type RouteAccess = 'public' | 'signedIn' | 'studentBeforeConsent' | 'student';

export const ROUTE_ACCESS_KEY = 'routeAccess';

export const DEFAULT_ROUTE_ACCESS: RouteAccess = 'student';

export const PublicRoute = () => SetMetadata(ROUTE_ACCESS_KEY, 'public' satisfies RouteAccess);

export const SignedInRoute = () => SetMetadata(ROUTE_ACCESS_KEY, 'signedIn' satisfies RouteAccess);

export const StudentBeforeConsentRoute = () => SetMetadata(ROUTE_ACCESS_KEY, 'studentBeforeConsent' satisfies RouteAccess);

export interface SignedInRequest {
  headers: { authorization?: string };
  authUserId?: string;
  studentId?: string;
}

function readRequest(context: ExecutionContext): SignedInRequest {
  return context.switchToHttp().getRequest<SignedInRequest>();
}

export const CurrentAuthUserId = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  readRequest(context).authUserId,
);

export const CurrentStudentId = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  readRequest(context).studentId,
);
