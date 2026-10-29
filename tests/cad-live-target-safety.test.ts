import { describe, expect, it } from "vitest";
import { assertNonProductionCadSmokeTarget } from "../src/cad/live-smoke-target.js";

describe("CAD live-smoke target safety", () => {
  it.each([
    "https://ai-mechanical-engineering-assistant.vercel.app",
    "https://ai-mechanical-engineering-assistant-alphanerd-labs.vercel.app",
    "https://ai-mechanical-engineering-assistant-git-main-alphanerd-labs.vercel.app",
    "https://ai-mechanical-engineering-assistant-3lto4c0xa-alphanerd-labs.vercel.app",
  ])("rejects production app hostname %s before sending any request", (value) => {
    expect(() => assertNonProductionCadSmokeTarget(new URL(value)))
      .toThrow(/Refusing to run.*production/i);
  });

  it("allows the dedicated non-production M0 preview custom domain", () => {
    expect(() => assertNonProductionCadSmokeTarget(
      new URL("https://ai-mechanical-engineering-assistant-eta.vercel.app"),
    )).not.toThrow();
  });

  it("does not interfere with local development", () => {
    expect(() => assertNonProductionCadSmokeTarget(new URL("http://localhost:3000")))
      .not.toThrow();
  });
});
