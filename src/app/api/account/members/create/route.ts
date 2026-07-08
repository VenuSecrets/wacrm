// ============================================================
// POST /api/account/members/create
//
// Add a teammate by email. Admin+. Creates the auth user with a
// generated password (service role), moves them into the caller's
// account with the chosen role (admin_place_member, migration 034),
// then emails them their credentials + a login link. The generated
// password is also returned in the response so the owner can share it
// (e.g. via WhatsApp) — always, so the feature works even before SMTP
// is configured or if delivery fails.
//
// Runs on the Node runtime: it uses the service-role key and
// nodemailer, neither of which is edge-safe.
// ============================================================

import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { supabaseAdmin } from "@/lib/account/admin-client";
import { generatePassword } from "@/lib/auth/generate-password";
import { isAccountRole } from "@/lib/auth/roles";
import { resolveBaseUrl } from "@/lib/site-url";
import { isEmailConfigured, sendMail } from "@/lib/email/mailer";
import { teammateCredentialsEmail } from "@/lib/email/templates";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LEN = 120;

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("admin");

    const limit = checkRateLimit(
      `admin:memberCreate:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as
      | { email?: unknown; role?: unknown; full_name?: unknown }
      | null;

    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: "Introduce un correo electrónico válido" },
        { status: 400 },
      );
    }

    const role = body?.role;
    if (!isAccountRole(role) || role === "owner") {
      return NextResponse.json(
        { error: "El rol debe ser admin, agent o viewer" },
        { status: 400 },
      );
    }

    let fullName: string | undefined;
    if (typeof body?.full_name === "string") {
      const trimmed = body.full_name.trim();
      if (trimmed.length > MAX_NAME_LEN) {
        return NextResponse.json(
          { error: `El nombre debe tener ${MAX_NAME_LEN} caracteres o menos` },
          { status: 400 },
        );
      }
      fullName = trimmed || undefined;
    }

    const admin = supabaseAdmin();
    const password = generatePassword();

    // 1. Create the auth user (email pre-confirmed so they can log in
    //    immediately). The signup trigger gives them a personal account.
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: fullName ? { full_name: fullName } : {},
      });

    if (createErr || !created?.user) {
      const msg = createErr?.message ?? "";
      const already =
        createErr?.status === 422 || /already|registered|exists/i.test(msg);
      if (already) {
        return NextResponse.json(
          { error: "Ya existe una cuenta con ese correo electrónico" },
          { status: 409 },
        );
      }
      console.error("[members/create] createUser error:", createErr);
      return NextResponse.json(
        { error: "No se pudo crear la cuenta" },
        { status: 500 },
      );
    }

    const newUserId = created.user.id;

    // 2. Move them into the caller's account with the chosen role.
    const { error: placeErr } = await admin.rpc("admin_place_member", {
      p_user_id: newUserId,
      p_target_account_id: ctx.accountId,
      p_role: role,
    });

    if (placeErr) {
      // Roll back the orphaned auth user so a retry with the same email
      // doesn't hit the "already registered" wall.
      await admin.auth.admin.deleteUser(newUserId).catch(() => {});
      console.error("[members/create] admin_place_member error:", placeErr);
      return NextResponse.json(
        { error: "No se pudo añadir el miembro a tu cuenta" },
        { status: 500 },
      );
    }

    // 3. Email the credentials (best-effort — the owner also gets them
    //    in the response to share manually).
    const loginUrl = `${resolveBaseUrl(request)}/login`;
    let emailed = false;
    if (isEmailConfigured()) {
      try {
        await sendMail(
          teammateCredentialsEmail({
            accountName: ctx.account.name,
            email,
            password,
            loginUrl,
          }),
        );
        emailed = true;
      } catch (err) {
        // Non-fatal: the account exists; the owner shares creds manually.
        console.error("[members/create] email send failed:", err);
      }
    }

    return NextResponse.json(
      {
        ok: true,
        email,
        password,
        loginUrl,
        role,
        emailed,
        emailConfigured: isEmailConfigured(),
      },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
