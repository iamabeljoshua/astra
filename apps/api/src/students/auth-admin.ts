import { getSupabaseUrl } from '../auth/supabase-url';

const ADMIN_USERS_PATH = '/auth/v1/admin/users';
const USER_ALREADY_GONE_STATUS = 404;
const ADMIN_CALL_LIMIT_MS = 5_000;

export const AUTH_ADMIN = Symbol('AUTH_ADMIN');

export interface AuthAdmin {
  deleteUser: (authUserId: string) => Promise<void>;
}

function createSupabaseAuthAdmin(supabaseUrl: string, secretKey: string): AuthAdmin {
  return {
    async deleteUser(authUserId) {
      const response = await fetch(new URL(`${ADMIN_USERS_PATH}/${authUserId}`, supabaseUrl), {
        method: 'DELETE',
        headers: { apikey: secretKey, authorization: `Bearer ${secretKey}` },
        signal: AbortSignal.timeout(ADMIN_CALL_LIMIT_MS),
      });
      if (!response.ok && response.status !== USER_ALREADY_GONE_STATUS) {
        throw new Error(`Auth answered ${response.status} to deleting a user.`);
      }
    },
  };
}

// Production cannot run without the key, because a closed or deleted account would stay in Auth. A local stack can, and says so in its log.
export function createAuthAdmin(env: NodeJS.ProcessEnv): AuthAdmin | null {
  if (env.SUPABASE_SECRET_KEY) return createSupabaseAuthAdmin(getSupabaseUrl(env), env.SUPABASE_SECRET_KEY);
  if (env.NODE_ENV === 'production') throw new Error('SUPABASE_SECRET_KEY is not set. The API needs it to delete accounts from Auth.');
  return null;
}
