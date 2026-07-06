// ============================================================
// /api/account/members/[userId]/sections
//
//   PATCH — set which interface sections a member may open. Admin+.
//
// Delegates to the SECURITY DEFINER RPC `set_member_sections`
// (migration 033), which does the real authorization: caller must
// be admin+, target must be in caller's account, target can't be
// the owner or self. Passing `sections: null` clears the restriction
// (full access).
// ============================================================

import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { sanitizeSections } from "@/lib/auth/sections";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

function rpcErrorToResponse(err: PostgrestError): NextResponse {
  if (err.code === "42501") {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err.code === "22023") {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  console.error("[members sections route] unexpected RPC error:", err);
  return NextResponse.json(
    { error: "Failed to update permissions" },
    { status: 500 },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const ctx = await requireRole("admin");

    const limit = checkRateLimit(
      `admin:memberSections:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { userId } = await params;

    const body = (await request.json().catch(() => null)) as
      | { sections?: unknown }
      | null;

    // `null` (or explicit no-restriction) clears the allowlist → full
    // access. Any array is sanitized down to known section keys so a
    // malformed payload can't smuggle arbitrary strings into the column.
    const raw = body?.sections;
    const sections = raw == null ? null : sanitizeSections(raw);

    const { error } = await ctx.supabase.rpc("set_member_sections", {
      p_user_id: userId,
      p_sections: sections,
    });

    if (error) return rpcErrorToResponse(error);

    return NextResponse.json({ ok: true, sections });
  } catch (err) {
    return toErrorResponse(err);
  }
}
