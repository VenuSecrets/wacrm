// ============================================================
// Navigation-section permissions — pure, no I/O.
//
// Complements the role system (`roles.ts`). Roles decide what a
// member can DO (read vs write); this decides which SECTIONS of the
// interface they can OPEN (Calendar, Photos, Contacts, Inbox, …).
//
// Model (see migration 033):
//   profiles.allowed_sections text[]
//     null  -> no restriction: every section is visible (default,
//              so existing members keep full access).
//     array -> allowlist of the section keys below.
//
// Owners and admins bypass the allowlist entirely — they manage the
// account, so they always see everything. The gate is meant for
// agents/viewers (front-desk staff, therapists, …).
//
// This is an interface/navigation gate layered on top of Supabase
// RLS (which still enforces the real read/write rules by account and
// role). Keep the section list here as the single source of truth so
// the sidebar, the route guard and the permissions UI never drift.
// ============================================================

import { hasMinRole, type AccountRole } from "./roles";

/** Every gateable section. `settings` is intentionally absent — every
 *  member can always reach their own profile / password / logout. */
export type NavSection =
  | "dashboard"
  | "inbox"
  | "notifications"
  | "contacts"
  | "pipelines"
  | "broadcasts"
  | "automations"
  | "flows"
  | "agents"
  | "calendario"
  | "fotos";

export interface SectionMeta {
  key: NavSection;
  /** Route prefix this section owns. */
  href: string;
  /** Human label (Spanish — this deployment's UI language). */
  label: string;
  /** One-line hint shown in the permissions UI. */
  description: string;
}

/** Ordered catalogue — drives the permissions grid and (by key) the
 *  sidebar filter. Order matches the sidebar for familiarity. */
export const NAV_SECTIONS: readonly SectionMeta[] = [
  { key: "dashboard", href: "/dashboard", label: "Dashboard", description: "Panel de métricas y actividad" },
  { key: "inbox", href: "/inbox", label: "Conversaciones (WhatsApp)", description: "Bandeja de chats de WhatsApp" },
  { key: "notifications", href: "/notifications", label: "Notificaciones", description: "Avisos de la cuenta" },
  { key: "contacts", href: "/contacts", label: "Contactos", description: "Fichas y datos de clientes del CRM" },
  { key: "pipelines", href: "/pipelines", label: "Embudos", description: "Pipelines y oportunidades de venta" },
  { key: "broadcasts", href: "/broadcasts", label: "Difusiones", description: "Envíos masivos de WhatsApp" },
  { key: "automations", href: "/automations", label: "Automatizaciones", description: "Reglas automáticas" },
  { key: "flows", href: "/flows", label: "Flujos", description: "Constructor de flujos (beta)" },
  { key: "agents", href: "/agents", label: "Agentes IA", description: "Configuración y playground de IA" },
  { key: "calendario", href: "/calendario", label: "Calendario", description: "Agenda de citas del salón" },
  { key: "fotos", href: "/fotos", label: "Fotos Antes/Después", description: "Fotos de tratamientos" },
] as const;

const SECTION_KEYS = new Set<string>(NAV_SECTIONS.map((s) => s.key));

/** Type-narrow an unknown string into a valid `NavSection`. */
export function isNavSection(value: unknown): value is NavSection {
  return typeof value === "string" && SECTION_KEYS.has(value);
}

/** Keep only valid section keys from arbitrary input (API payloads). */
export function sanitizeSections(input: unknown): NavSection[] {
  if (!Array.isArray(input)) return [];
  const out: NavSection[] = [];
  for (const v of input) {
    if (isNavSection(v) && !out.includes(v)) out.push(v);
  }
  return out;
}

/**
 * Map a pathname to the section that owns it, or null for routes that
 * aren't gated (e.g. /settings, /join, the auth pages). Longest-prefix
 * match so `/contacts/123` resolves to `contacts`.
 */
export function pathToSection(pathname: string): NavSection | null {
  let match: NavSection | null = null;
  let matchLen = -1;
  for (const s of NAV_SECTIONS) {
    if (
      (pathname === s.href || pathname.startsWith(s.href + "/")) &&
      s.href.length > matchLen
    ) {
      match = s.key;
      matchLen = s.href.length;
    }
  }
  return match;
}

/**
 * Can this member open `section`?
 *
 * - Owners/admins: always (they manage the account).
 * - `allowed` null/undefined: yes — no restriction configured.
 * - otherwise: only if the section is in the allowlist.
 */
export function canAccessSection(
  role: AccountRole | null,
  allowed: string[] | null | undefined,
  section: NavSection,
): boolean {
  if (role && hasMinRole(role, "admin")) return true;
  if (allowed == null) return true;
  return allowed.includes(section);
}

/** First section this member is allowed to open, for redirects when
 *  they land on (or get bounced from) a forbidden route. Falls back to
 *  `dashboard` — a member with an empty allowlist has nowhere gated to
 *  go, so the guard sends them to /settings instead (always allowed). */
export function firstAllowedSection(
  role: AccountRole | null,
  allowed: string[] | null | undefined,
): NavSection | null {
  for (const s of NAV_SECTIONS) {
    if (canAccessSection(role, allowed, s.key)) return s.key;
  }
  return null;
}
