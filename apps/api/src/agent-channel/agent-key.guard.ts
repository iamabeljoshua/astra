import { createHash, timingSafeEqual } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { SignedInRequest } from '../auth/route-access';

const BEARER_KEY = /^Bearer (\S+)$/i;

const getDigest = (key: string) => createHash('sha256').update(key).digest();

// Compares digests because they are always the same length, so the time taken says nothing about the key.
function isAgentKey(given: string, expected: string): boolean {
  return timingSafeEqual(getDigest(given), getDigest(expected));
}

// The agent is another of our servers and holds no student's token, so it signs in with the key they share. With no key set, nothing gets in.
@Injectable()
export class AgentKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    http.getResponse<{ setHeader: (name: string, value: string) => void }>().setHeader('Cache-Control', 'no-store');
    const expected = process.env.ASTRA_AGENT_KEY;
    const given = BEARER_KEY.exec(http.getRequest<SignedInRequest>().headers.authorization ?? '')?.[1];
    if (!expected || !given || !isAgentKey(given, expected)) throw new UnauthorizedException();
    return true;
  }
}
