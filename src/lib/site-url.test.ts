import { afterEach, describe, expect, it, vi } from "vitest";

import { isPlaceholderUrl, resolveBaseUrl } from "./site-url";

function req(headers: Record<string, string>, url = "https://x/api"): Request {
  return new Request(url, { headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isPlaceholderUrl", () => {
  it("flags the .env.local.example placeholder", () => {
    expect(isPlaceholderUrl("https://crm.example.com")).toBe(true);
    expect(isPlaceholderUrl("https://example.com")).toBe(true);
    expect(isPlaceholderUrl("http://foo.example.org")).toBe(true);
  });

  it("accepts real hosts", () => {
    expect(isPlaceholderUrl("https://crm.venusecrets.com")).toBe(false);
    expect(isPlaceholderUrl("https://wacrm-production.up.railway.app")).toBe(
      false,
    );
  });

  it("treats unparseable values as placeholders (don't trust them)", () => {
    expect(isPlaceholderUrl("not a url")).toBe(true);
  });
});

describe("resolveBaseUrl", () => {
  it("uses an explicit real NEXT_PUBLIC_SITE_URL, trimming trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://crm.venusecrets.com/");
    expect(resolveBaseUrl(req({ host: "ignored" }))).toBe(
      "https://crm.venusecrets.com",
    );
  });

  it("ignores the example placeholder and derives from x-forwarded-host", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://crm.example.com");
    const url = resolveBaseUrl(
      req({
        "x-forwarded-host": "wacrm-production.up.railway.app",
        "x-forwarded-proto": "https",
      }),
    );
    expect(url).toBe("https://wacrm-production.up.railway.app");
  });

  it("falls back to the Host header when no forwarded host is present", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(resolveBaseUrl(req({ host: "my-crm.app" }, "https://my-crm.app/x"))).toBe(
      "https://my-crm.app",
    );
  });
});
