import { describe, expect, it, vi } from "vitest";
import { checkPasswordBreach } from "../src/auth/password-breach.js";

describe("privacy-preserving compromised password screening", () => {
  it("sends only the five-character SHA-1 prefix and checks the suffix locally", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.pwnedpasswords.com/range/5BAA6");
      expect(init?.headers).toMatchObject({
        "Add-Padding": "true",
        "User-Agent": "AI-Mechanical-Engineering-Assistant/1.0",
      });
      expect(String(input)).not.toContain("password");
      return new Response("003E3C3B5A6D4A3A2A2F0F3E4A8A5E3D9A7:5\r\n", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await checkPasswordBreach("password", fetcher);
    expect(result).toEqual({ status: "compromised" });
  });

  it("treats padded zero-count entries as safe", async () => {
    const fetcher = vi.fn(async () =>
      new Response("003E3C3B5A6D4A3A2A2F0F3E4A8A5E3D9A7:0\r\n", { status: 200 }),
    ) as unknown as typeof fetch;

    expect(await checkPasswordBreach("password", fetcher)).toEqual({ status: "safe" });
  });

  it("fails closed when the range service returns an error", async () => {
    const fetcher = vi.fn(async () => new Response("unavailable", { status: 503 })) as unknown as typeof fetch;
    expect(await checkPasswordBreach("long-enough-password", fetcher)).toEqual({ status: "unavailable" });
  });

  it("fails closed when the range service cannot be reached", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("network unavailable");
    }) as unknown as typeof fetch;

    expect(await checkPasswordBreach("long-enough-password", fetcher)).toEqual({ status: "unavailable" });
  });
});
