import { ForbiddenException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StudentsService } from '../students/students.service';
import { DEFAULT_ROUTE_ACCESS, ROUTE_ACCESS_KEY } from './route-access';
import type { RouteAccess, SignedInRequest } from './route-access';
import { describeRefusal, isRefusedToken, TokenVerifier } from './token-verifier';

const BEARER_TOKEN = /^Bearer (\S+)$/i;

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tokenVerifier: TokenVerifier,
    private readonly studentsService: StudentsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const routeAccess = this.readRouteAccess(context);
    if (routeAccess === 'public') return true;

    const request = context.switchToHttp().getRequest<SignedInRequest>();
    request.authUserId = await this.readAuthUserId(request);
    if (routeAccess === 'signedIn') return true;

    request.studentId = await this.readStudentId(request.authUserId);
    return true;
  }

  private readRouteAccess(context: ExecutionContext): RouteAccess {
    const routeAccess = this.reflector.getAllAndOverride<RouteAccess | undefined>(ROUTE_ACCESS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    return routeAccess ?? DEFAULT_ROUTE_ACCESS;
  }

  private async readAuthUserId(request: SignedInRequest): Promise<string> {
    const token = BEARER_TOKEN.exec(request.headers.authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedException();
    try {
      return await this.tokenVerifier.getAuthUserId(token);
    } catch (thrown) {
      if (isRefusedToken(thrown)) {
        this.logger.warn(`Refused a token: ${describeRefusal(thrown)}`);
        throw new UnauthorizedException();
      }
      this.logger.error(`Could not read the signing keys: ${String(thrown)}`);
      throw new ServiceUnavailableException();
    }
  }

  private async readStudentId(authUserId: string): Promise<string> {
    const studentId = await this.studentsService.findStudentId(authUserId);
    if (!studentId) throw new ForbiddenException();
    return studentId;
  }
}
