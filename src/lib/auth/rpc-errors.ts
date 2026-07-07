// ============================================================
// Shared mapping from member-management RPC errors to HTTP
// responses. The SECURITY DEFINER RPCs (set_member_role,
// remove_account_member, set_member_sections — migrations 018/033)
// all follow the same SQLSTATE contract:
//   42501 ("insufficient_privilege")  → 403 with the RAISE message
//   22023 ("invalid_parameter_value") → 400 with the RAISE message
//   anything else                     → 500 with a generic message
// Previously copy-pasted per route; hoisted here so the contract
// lives in one place.
// ============================================================

import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

export function rpcErrorToResponse(
  err: PostgrestError,
  fallbackMessage: string,
): NextResponse {
  if (err.code === "42501") {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err.code === "22023") {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  console.error(`[rpcErrorToResponse] unexpected RPC error:`, err);
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}
