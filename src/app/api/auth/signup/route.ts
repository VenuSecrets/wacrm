// ============================================================
// POST /api/auth/signup
//
// Public — no auth required. Creates a new, already-confirmed
// user via the service-role admin API, then lets the browser
// sign in with the same credentials.
//
// Why server-side admin.createUser instead of client signUp
//   supabase.auth.signUp() asks GoTrue to send a confirmation
//   email. Supabase's built-in email service is heavily
//   rate-limited (a few messages per hour), so a handful of
//   signups returns `over_email_send_rate_limit` (HTTP 429) and
//   registration breaks for a self-hosted deploy that hasn't
//   wired up its own SMTP. Creating the user with
//   `email_confirm: true` skips the confirmation mail entirely:
//   no email is sent, so the rate limit never applies, and the
//   account is immediately usable.
//
//   If you'd rather keep email verification, configure a custom
//   SMTP provider in Supabase (Auth → SMTP) and switch this back
//   to a client-side signUp; the built-in service is not meant
//   for production sending.
//
// Security model
//   - The service-role key stays server-only (this route + the
//     admin client). It never reaches the browser.
//   - Per-IP rate limit bounds scripted mass-registration.
//   - Password policy is still enforced by GoTrue on create.
// ============================================================

import { NextResponse } from "next/server";

import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";

const MIN_PASSWORD_LEN = 6;
const MAX_NAME_LEN = 120;

/**
 * Best-effort client IP. Every reverse proxy (Railway, Vercel,
 * Hostinger, Cloudflare) sets `x-forwarded-for`; we take the
 * leftmost entry, which is the original client. Falls back to a
 * constant so keys still exist during local dev.
 */
function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xri = request.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = checkRateLimit(`signup:${ip}`, RATE_LIMITS.signup);
  if (!limit.success) return rateLimitResponse(limit);

  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    password?: unknown;
    fullName?: unknown;
  } | null;

  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const fullName =
    typeof body?.fullName === "string" ? body.fullName.trim() : "";

  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { error: "A valid email is required" },
      { status: 400 },
    );
  }
  if (password.length < MIN_PASSWORD_LEN) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LEN} characters` },
      { status: 400 },
    );
  }
  if (fullName.length > MAX_NAME_LEN) {
    return NextResponse.json(
      { error: `Name must be ${MAX_NAME_LEN} characters or fewer` },
      { status: 400 },
    );
  }

  const { error } = await supabaseAdmin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (error) {
    // GoTrue reports an existing address as a 422 ("already been
    // registered" / "email_exists"). Map it to a 409 with a
    // message the signup form can show verbatim.
    const status = (error as { status?: number }).status;
    const already =
      status === 422 ||
      /already|exists|registered/i.test(error.message ?? "");
    if (already) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 },
      );
    }
    console.error("[POST /api/auth/signup] createUser error:", error);
    return NextResponse.json(
      { error: "Could not create account. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
