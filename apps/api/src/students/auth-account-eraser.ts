import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuthTraceRepository } from '../infrastructure/orm/repositories/auth-trace.repository';
import { AUTH_ADMIN } from './auth-admin';
import type { AuthAdmin } from './auth-admin';

@Injectable()
export class AuthAccountEraser {
  private readonly logger = new Logger(AuthAccountEraser.name);

  constructor(
    @Inject(AUTH_ADMIN) private readonly admin: AuthAdmin | null,
    private readonly traces: AuthTraceRepository,
  ) {}

  // With no secret key this is a local stack, where nothing is erased from Auth, so the user is still there.
  hasUser(authUserId: string): Promise<boolean> {
    return this.admin ? this.admin.hasUser(authUserId) : Promise.resolve(true);
  }

  async erase({ authUserId, email }: { authUserId: string; email: string | null }): Promise<boolean> {
    if (!this.admin) {
      this.logger.warn('SUPABASE_SECRET_KEY is not set, so this account stays in Auth.');
      return false;
    }
    await this.admin.deleteUser(authUserId);
    await this.traces.eraseTraces({ authUserId, email });
    return true;
  }
}
