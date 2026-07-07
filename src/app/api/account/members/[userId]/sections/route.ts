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

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { rpcErrorToResponse } from "@/lib/auth/rpc-errors";
import { sanitizeSections } from "@/lib/auth/sections";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

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
    // access. Arrays are sanitized down to known section keys so a
    // malformed payload can't smuggle arbitrary strings into the column.
    // Anything else is a 400 — silently coercing (say) a string to []
    // would lock the member out of every section by accident.
    const raw = body?.sections;
    if (raw != null && !Array.isArray(raw)) {
      return NextResponse.json(
        { error: "'sections' must be an array of section keys, or null" },
        { status: 400 },
      );
    }
    const sections = raw == null ? null : sanitizeSections(raw);

    const { error } = await ctx.supabase.rpc("set_member_sections", {
      p_user_id: userId,
      p_sections: sections,
    });

    if (error) {
      return rpcErrorToResponse(error, "Failed to update permissions");
    }

    return NextResponse.json({ ok: true, sections });
  } catch (err) {
    return toErrorResponse(err);
  }
}
