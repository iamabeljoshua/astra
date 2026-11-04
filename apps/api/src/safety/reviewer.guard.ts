import { Injectable, NotFoundException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { SignedInRequest } from '../auth/route-access';

interface ReviewerRequest extends SignedInRequest {
  method: string;
  originalUrl: string;
}

function getReviewerIds(env: NodeJS.ProcessEnv): string[] {
  return (env.SAFETY_REVIEWER_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean);
}

function getUnknownRouteAnswer({ method, originalUrl }: ReviewerRequest): NotFoundException {
  return new NotFoundException(`Cannot ${method} ${originalUrl}`);
}

@Injectable()
export class ReviewerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ReviewerRequest>();
    if (request.isAddressClosed || !request.authUserId || !getReviewerIds(process.env).includes(request.authUserId)) {
      throw getUnknownRouteAnswer(request);
    }
    return true;
  }
}
