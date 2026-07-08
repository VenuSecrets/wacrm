import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Lazy, shared service-role client for account/member administration
// (creating teammate auth users, moving them into an account). Mirrors
// the AI / flows / automations admin clients. Server-only — the
// service-role key must never reach the browser. Any route importing
// this must run on the Node runtime.
let _adminClient: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return _adminClient;
}
