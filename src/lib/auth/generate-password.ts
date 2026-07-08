import { randomInt } from "node:crypto";

// Readable one-time passwords for teammates who receive them by email
// and type them by hand. We avoid ambiguous characters (0/O, 1/l/I) and
// guarantee at least one upper, one lower and two digits so the result
// always satisfies Supabase's default password policy.
const UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ"; // no I, O
const LOWER = "abcdefghijkmnpqrstuvwxyz"; // no l
const DIGIT = "23456789"; // no 0, 1

function pick(chars: string): string {
  return chars[randomInt(chars.length)];
}

/**
 * Generate a friendly-but-strong one-time password, e.g. `Kip7-r4mQ2`.
 * ~11 chars, mixed case + digits, with a dash for legibility.
 */
export function generatePassword(): string {
  const body =
    pick(UPPER) +
    pick(LOWER) +
    pick(LOWER) +
    pick(DIGIT) +
    "-" +
    pick(LOWER) +
    pick(DIGIT) +
    pick(LOWER) +
    pick(UPPER) +
    pick(DIGIT) +
    pick(LOWER);
  return body;
}
