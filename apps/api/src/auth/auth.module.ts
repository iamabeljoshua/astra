import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { StudentsModule } from '../students/students.module';
import { AuthGuard } from './auth.guard';
import { getSupabaseUrl } from './supabase-url';
import { getAcceptedSignInMethods, TokenVerifier } from './token-verifier';

@Module({
  imports: [StudentsModule],
  providers: [
    {
      provide: TokenVerifier,
      useFactory: () => new TokenVerifier(getSupabaseUrl(process.env), getAcceptedSignInMethods(process.env.NODE_ENV)),
    },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
