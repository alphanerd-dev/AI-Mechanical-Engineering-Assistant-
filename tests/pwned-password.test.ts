import { describe, expect, it, vi } from "vitest";
import { checkPasswordBreach } from "../src/auth/password-breach.js";

describe("privacy-preserving compromised password screening", () => {
  it("sends only the five-character SHA-1 prefix and checks the suffix locally", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response("1E4C9B93F3F0682250B6CF8331B7EE68FD8:5\\r\\n", { status: 200 }),
    );
    const result = await checkPasswordBreach("password", fetcher as unknown as typeof fetch);

    expect(result).toEqual({ status: "compromised" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [input, init] = fetcher.mock.calls[0] ?? [];
    expect(String(input)).toBe("https://api.pwnedpasswords.com/range/5BAA6");
    expect(String(input)).not.toContain("password");
    expect(init?.headers).toMatchObject({
      "Add-Padding": "true",
      "User-Agent": "AI-Mechanical-Engineering-Assistant/1.0",
    });
  });

  it("treats padded zero-count entries as safe", async () => {
    const fetcher = vi.fn(async () =>
      new Response("1E4C9B93F3F0682250B6CF8331B7EE68FD8:0\r\n", { status: 200 }),
    ) as unknown as typeof fetch;

    expect(await checkPasswordBreach("password", fetcher)).toEqual({ status: "safe" });
  });

  it("fails closed when the range response is malformed", async () => {
    const fetcher = vi.fn(async () => new Response("not-a-hash-range", { status: 200 })) as unknown as typeof fetch;
    expect(await checkPasswordBreach("long-enough-password", fetcher)).toEqual({ status: "unavailable" });
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
