"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/hooks/use-auth";
import {
  NAV_SECTIONS,
  canAccessSection,
  firstAllowedSection,
  pathToSection,
} from "@/lib/auth/sections";

// Route-level companion to the sidebar filter: hiding a nav row isn't
// enough — a restricted member could still type the URL. This guard
// runs inside the dashboard shell (below auth), maps the current path
// to its section, and bounces the member to their first allowed
// section (or /settings, which is never gated) if they can't open it.
//
// It's a navigation gate, not the security boundary — Supabase RLS
// still enforces the real per-account/role data rules. Its job is to
// keep the UI honest with the permissions the owner configured.

function GuardFallback() {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

export function SectionGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profileLoading, accountRole, profile } = useAuth();

  const section = pathToSection(pathname);
  const allowedSections = profile?.allowed_sections;
  const canOpen =
    section === null ||
    canAccessSection(accountRole, allowedSections, section);

  useEffect(() => {
    if (profileLoading || section === null || canOpen) return;
    const firstKey = firstAllowedSection(accountRole, allowedSections);
    const dest =
      NAV_SECTIONS.find((s) => s.key === firstKey)?.href ?? "/settings";
    router.replace(dest);
  }, [profileLoading, section, canOpen, accountRole, allowedSections, router]);

  // Don't flash gated content: wait while the profile (and its
  // allowlist) loads, and keep the placeholder up during the redirect
  // for a forbidden section.
  if (section !== null && (profileLoading || !canOpen)) {
    return <GuardFallback />;
  }

  return <>{children}</>;
}
