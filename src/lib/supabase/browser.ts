import { createBrowserClient } from "@supabase/ssr";

// Singleton — one client per browser session.
// Multiple createClient() calls across components share the same
// token-refresh timer and auth socket rather than spawning duplicates.
let _client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _client;
}
