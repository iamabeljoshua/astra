const LOCAL_STACK_SUPABASE_URL = 'http://127.0.0.1:54421';
const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];

export function getSupabaseUrl(env: NodeJS.ProcessEnv): string {
  const supabaseUrl = env.SUPABASE_URL || (env.NODE_ENV === 'development' ? LOCAL_STACK_SUPABASE_URL : '');
  if (!supabaseUrl) throw new Error('SUPABASE_URL is not set. The API needs it to check sign-in tokens.');
  if (!URL.canParse(supabaseUrl)) throw new Error('SUPABASE_URL is not a valid URL.');
  const { origin, protocol, hostname } = new URL(supabaseUrl);
  const isPlainHttpOnLocalHost = protocol === 'http:' && LOCAL_HOSTS.includes(hostname);
  if (protocol !== 'https:' && !isPlainHttpOnLocalHost) {
    throw new Error('SUPABASE_URL must use https, or http on a local host.');
  }
  return origin;
}
