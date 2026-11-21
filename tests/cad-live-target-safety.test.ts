import { describe, expect, it } from "vitest";
import {
  assertNonProductionCadSmokeSupabaseTarget,
  assertNonProductionCadSmokeTarget
} from "../src/cad/live-smoke-target.js";

describe("CAD live-smoke target safety", () => {
  it.each([
    "https://ai-mechanical-engineering-assistant.vercel.app",
    "https://ai-mechanical-engineering-assistant-eta.vercel.app",
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

  it("allows only an explicitly configured exact HTTPS M2 preview hostname", () => {
    expect(() => assertNonProductionCadSmokeTarget(
      new URL("https://ai-mechanical-engineering-assistant-git-feat-m2-acceptance-closure-alphanerd-labs.vercel.app"),
      "ai-mechanical-engineering-assistant-git-feat-m2-acceptance-closure-alphanerd-labs.vercel.app",
    )).not.toThrow();
    expect(() => assertNonProductionCadSmokeTarget(
      new URL("https://attacker.example.com"),
      "*.example.com",
    )).toThrow(/unapproved host/i);
    expect(() => assertNonProductionCadSmokeTarget(
      new URL("http://ai-mechanical-engineering-assistant-git-feat-m2-acceptance-closure-alphanerd-labs.vercel.app"),
      "ai-mechanical-engineering-assistant-git-feat-m2-acceptance-closure-alphanerd-labs.vercel.app",
    )).toThrow(/HTTPS/i);
  });

  it.each(["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"])(
    "allows local development target %s",
    (value) => {
      expect(() => assertNonProductionCadSmokeTarget(new URL(value))).not.toThrow();
    },
  );
});

describe("M2 Supabase acceptance target safety", () => {
  it("allows the exact isolated E2E Supabase host", () => {
    expect(() => assertNonProductionCadSmokeSupabaseTarget(
      new URL("https://mpbrlegwrrrfpeumtqhi.supabase.co"),
      "mpbrlegwrrrfpeumtqhi.supabase.co",
    )).not.toThrow();
  });

  it("rejects the production Supabase host, wildcards and host mismatches", () => {
    expect(() => assertNonProductionCadSmokeSupabaseTarget(
      new URL("https://mepmogsqhxxasahwhete.supabase.co"),
      "mepmogsqhxxasahwhete.supabase.co",
    )).toThrow(/production Supabase/i);
    expect(() => assertNonProductionCadSmokeSupabaseTarget(
      new URL("https://mpbrlegwrrrfpeumtqhi.supabase.co"),
      "*.supabase.co",
    )).toThrow(/production Supabase/i);
    expect(() => assertNonProductionCadSmokeSupabaseTarget(
      new URL("http://mpbrlegwrrrfpeumtqhi.supabase.co"),
      "mpbrlegwrrrfpeumtqhi.supabase.co",
    )).toThrow(/production Supabase/i);
  });
});
