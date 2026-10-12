import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicUrl } from "../lib/http/public-origin";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("public authentication redirect origin", () => {
  it("uses Render's public HTTPS URL instead of the internal bind host", () => {
    vi.stubEnv("RENDER_EXTERNAL_URL", "https://ai-mechanical-engineering-assistant-test.onrender.com");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://ai-mechanical-engineering-assistant.vercel.app");

    const request = new Request("http://0.0.0.0:10000/api/auth/login");
    expect(getPublicUrl("/", request).toString()).toBe("https://ai-mechanical-engineering-assistant-test.onrender.com/");
    expect(getPublicUrl("/login", request).toString()).toBe("https://ai-mechanical-engineering-assistant-test.onrender.com/login");
  });

  it("uses the deployment-specific Vercel host when running on Vercel", () => {
    vi.stubEnv("RENDER_EXTERNAL_URL", "");
    vi.stubEnv("APP_BASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_URL", "ai-mechanical-engineering-assistant-git-test.vercel.app");

    const request = new Request("http://0.0.0.0:10000/api/auth/logout");
    expect(getPublicUrl("/login", request).origin).toBe("https://ai-mechanical-engineering-assistant-git-test.vercel.app");
  });

  it("accepts a trusted Render proxy host when the request URL is internal", () => {
    vi.stubEnv("APP_BASE_URL", "");
    vi.stubEnv("RENDER_EXTERNAL_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");

    const request = new Request("http://0.0.0.0:10000/api/auth/login", {
      headers: {
        "x-forwarded-host": "ai-mechanical-engineering-assistant-test.onrender.com",
        "x-forwarded-proto": "https",
      },
    });
    expect(getPublicUrl("/", request).origin).toBe("https://ai-mechanical-engineering-assistant-test.onrender.com");
  });

  it("does not turn an untrusted host header into a redirect destination", () => {
    vi.stubEnv("APP_BASE_URL", "");
    vi.stubEnv("RENDER_EXTERNAL_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");

    const request = new Request("http://0.0.0.0:10000/api/auth/login", {
      headers: { "x-forwarded-host": "attacker.example", "x-forwarded-proto": "https" },
    });
    expect(() => getPublicUrl("/", request)).toThrow(/trusted public application origin/);
  });
});
