// Resolve the public base URL of this deployment, used to build links
// we hand to users (invite links, teammate login links in emails).
//
// Resolution order, first match wins:
//   1. NEXT_PUBLIC_SITE_URL — explicit operator config; trumps all.
//   2. X-Forwarded-Host (+ proto) — set by every reverse proxy
//      (Railway, Vercel, Cloudflare, nginx) so links Just Work in prod.
//   3. Host header + the request's protocol — bare deployments.
//   4. Last-resort fallback (a real origin so the link is at least
//      well-formed) with a console.warn so the misconfig is visible.
/**
 * True for the `.env.local.example` placeholder (`crm.example.com` and
 * friends). Operators routinely copy the example verbatim, which would
 * otherwise point every login/invite link at a domain that doesn't
 * exist. Treat it as "unset" so we fall through to the request host.
 */
export function isPlaceholderUrl(url: string): boolean {
  try {
    return /(^|\.)example\.(com|org|net)$/i.test(new URL(url).hostname);
  } catch {
    return true; // unparseable → don't trust it
  }
}

export function resolveBaseUrl(request: Request): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit && !isPlaceholderUrl(explicit)) {
    return explicit.replace(/\/+$/, "");
  }

  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  if (forwardedHost) {
    return `${forwardedProto || "https"}://${forwardedHost}`;
  }

  const host = request.headers.get("host")?.trim();
  if (host) {
    const reqProto = new URL(request.url).protocol.replace(":", "");
    return `${reqProto}://${host}`;
  }

  console.warn(
    "[resolveBaseUrl] could not derive base URL from request; set NEXT_PUBLIC_SITE_URL",
  );
  return "https://wacrm.tech";
}
