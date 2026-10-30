import { describe, expect, it } from "vitest";
import { assertNonProductionCadSmokeTarget } from "../src/cad/live-smoke-target.js";

describe("CAD live-smoke target safety", () => {
  it.each([
    "https://ai-mechanical-engineering-assistant.vercel.app",
    "https://ai-mechanical-engineering-assistant-alphanerd-labs.vercel.app",
    "https://ai-mechanical-engineering-assistant-git-main-alphanerd-labs.vercel.app",
    "https://ai-mechanical-engineering-assistant-3lto4c0xa-alphanerd-labs.vercel.app",
    "https://ai-mechanical-engineering-assistant-eta.vercel.app",
    "https://unknown-production.example.com",
    "https://ai-mechanical-engineering-assistant-m0-preview-2l0m7buag-alphanerd-labs.vercel.app",
  ])("rejects unapproved write target %s before network access", (value) => {
    expect(() => assertNonProductionCadSmokeTarget(new URL(value)))
      .toThrow(/Refusing to run.*unapproved host/i);
  });

  it("allows only the exact branch-scoped M0 preview with its isolated CAD worker configuration", () => {
    expect(() => assertNonProductionCadSmokeTarget(
      new URL("https://ai-mechanical-engineering-assistant-m-git-bd1610-alphanerd-labs.vercel.app"),
    )).not.toThrow();
  });

  it.each(["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"])(
    "allows local development target %s",
    (value) => {
      expect(() => assertNonProductionCadSmokeTarget(new URL(value))).not.toThrow();
    },
  );
});
