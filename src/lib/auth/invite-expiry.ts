// ============================================================
// Invite-expiry semantics — client-safe (no node imports), shared
// by server code (`invitations.ts`) and client components (invite
// dialog, join page, members tab).
//
// "No expiry" is modelled as a far-future `expires_at` (~100 years)
// because the column is NOT NULL. These helpers are the single
// source of truth for detecting that sentinel, so every surface
// renders "no caduca" consistently instead of a huge day count or
// a year-2126 date.
// ============================================================

/** Day count the "Sin caducidad" option stores (~100 years). */
export const INDEFINITE_INVITE_EXPIRY_DAYS = 36500;

/** Anything at/above ~50 years reads as "indefinite" in the UI. */
export const INDEFINITE_THRESHOLD_DAYS = 18250;

/** True when a day-count lifetime should render as "no expiry". */
export function isIndefiniteDays(days: number): boolean {
  return days >= INDEFINITE_THRESHOLD_DAYS;
}

/**
 * True when an `expires_at` timestamp should render as "no expiry".
 * Pure (no clock read) so it's safe to call during React render:
 * the sentinel lands ~100 years out, so a fixed far-future year is
 * an equivalent, stable test.
 */
export function isIndefiniteExpiresAt(expiresAt: string | Date): boolean {
  return new Date(expiresAt).getFullYear() >= 2100;
}
