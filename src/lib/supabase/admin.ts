import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Lazy, shared service-role client for privileged server-side flows
// that run without an `auth.uid()` — e.g. creating a confirmed user
// during signup. Mirrors the per-feature admin clients under
// src/lib/{ai,flows,automations}/admin-client.ts.
//
// NEVER import this from client components: the service-role key
// bypasses RLS and must stay server-only.
let _adminClient: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  }
  return _adminClient;
}
