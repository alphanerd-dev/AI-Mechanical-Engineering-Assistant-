import { describe, expect, it } from "vitest";
import { CapabilityRegistry, CapabilityProvider } from "../src/capabilities/registry.js";
import { ENGINEERING_CAPABILITIES } from "../src/capabilities/catalog.js";
import { CapabilityRequest, CapabilityResult } from "../src/core/types.js";
import { CADCapabilityRouter, CADProviderProfile } from "../src/cad/routing.js";

function makeProvider(
  id: string,
  capabilities: string[],
  execute: (request: CapabilityRequest) => Promise<CapabilityResult>
): CapabilityProvider {
  return { id, capabilities, execute };
}

function setup(
  providers: CapabilityProvider[],
  profiles: CADProviderProfile[]
): CADCapabilityRouter {
  const registry = new CapabilityRegistry();
  registry.registerCatalog(ENGINEERING_CAPABILITIES);
  providers.forEach((provider) => registry.register(provider));
  return new CADCapabilityRouter(registry, profiles);
}

const createInput = { feature: "bracket", thicknessMm: 4 };

describe("V2.1.2 provider-neutral CAD capability routing", () => {
  it("uses capability-catalog provider priority among explicitly available providers", () => {
    const router = setup([
      makeProvider("cad.cadquery", ["CAD.CREATE_PART"], async () => ({
        capability: "CAD.CREATE_PART", provider: "cad.cadquery", success: true, output: { backend: "cadquery" }
      })),
      makeProvider("cad.build123d", ["CAD.CREATE_PART"], async () => ({
        capability: "CAD.CREATE_PART", provider: "cad.build123d", success: true, output: { backend: "build123d" }
      }))
    ], [
      { providerId: "cad.cadquery", availability: "AVAILABLE" },
      { providerId: "cad.build123d", availability: "AVAILABLE" }
    ]);

    const plan = router.plan({ capability: "CAD.CREATE_PART", input: createInput, risk: "MEDIUM" });
    expect(plan.status).toBe("READY");
    expect(plan.selectedProviderId).toBe("cad.build123d");
    expect(plan.candidateProviderIds).toEqual(["cad.build123d", "cad.cadquery"]);
  });

  it("honours a preferred provider before catalog priority", () => {
    const router = setup([
      makeProvider("cad.build123d", ["CAD.CREATE_PART"], async () => ({
        capability: "CAD.CREATE_PART", provider: "cad.build123d", success: true, output: {}
      })),
      makeProvider("cad.cadquery", ["CAD.CREATE_PART"], async () => ({
        capability: "CAD.CREATE_PART", provider: "cad.cadquery", success: true, output: {}
      }))
    ], [
      { providerId: "cad.build123d", availability: "AVAILABLE" },
      { providerId: "cad.cadquery", availability: "AVAILABLE" }
    ]);

    const plan = router.plan({
      capability: "CAD.CREATE_PART",
      input: createInput,
      risk: "MEDIUM",
      preferredProviderIds: ["cad.cadquery", "cad.build123d"]
    });
    expect(plan.selectedProviderId).toBe("cad.cadquery");
  });

  it("hard-pins a required provider and never silently falls back", async () => {
    const router = setup([
      makeProvider("cad.build123d", ["CAD.CREATE_PART"], async () => ({
        capability: "CAD.CREATE_PART", provider: "cad.build123d", success: false, error: "runtime offline"
      })),
      makeProvider("cad.cadquery", ["CAD.CREATE_PART"], async () => ({
        capability: "CAD.CREATE_PART", provider: "cad.cadquery", success: true, output: {}
      }))
    ], [
      { providerId: "cad.build123d", availability: "AVAILABLE" },
      { providerId: "cad.cadquery", availability: "AVAILABLE" }
    ]);

    const result = await router.execute({
      capability: "CAD.CREATE_PART",
      input: createInput,
      risk: "LOW",
      requiredProviderId: "cad.build123d",
      allowFallback: true
    });
    expect(result.status).toBe("FAILED");
    expect(result.attempts.map((attempt) => attempt.providerId)).toEqual(["cad.build123d"]);
    expect(result.fallbackUsed).toBe(false);
  });

  it("does not silently fall back on high-risk work unless explicitly allowed", async () => {
    const router = setup([
      makeProvider("cad.build123d", ["CAD.EXECUTE_GENERATED_SOURCE"], async () => ({
        capability: "CAD.EXECUTE_GENERATED_SOURCE", provider: "cad.build123d", success: false, error: "runtime offline"
      })),
      makeProvider("cad.cadquery", ["CAD.EXECUTE_GENERATED_SOURCE"], async () => ({
        capability: "CAD.EXECUTE_GENERATED_SOURCE", provider: "cad.cadquery", success: true, output: { artifact: "candidate" }
      }))
    ], [
      { providerId: "cad.build123d", availability: "AVAILABLE" },
      { providerId: "cad.cadquery", availability: "AVAILABLE" }
    ]);

    const result = await router.execute({
      capability: "CAD.EXECUTE_GENERATED_SOURCE",
      input: { source: "bounded test source" },
      risk: "HIGH"
    });
    expect(result.status).toBe("FAILED");
    expect(result.attempts).toHaveLength(1);
  });

  it("records a fallback when a permitted alternate provider succeeds", async () => {
    const router = setup([
      makeProvider("cad.build123d", ["CAD.CREATE_PART"], async () => ({
        capability: "CAD.CREATE_PART", provider: "cad.build123d", success: false, error: "worker unavailable"
      })),
      makeProvider("cad.cadquery", ["CAD.CREATE_PART"], async () => ({
        capability: "CAD.CREATE_PART", provider: "cad.cadquery", success: true, output: { artifact: "generated" }
      }))
    ], [
      { providerId: "cad.build123d", availability: "AVAILABLE" },
      { providerId: "cad.cadquery", availability: "AVAILABLE" }
    ]);

    const result = await router.execute({
      capability: "CAD.CREATE_PART",
      input: createInput,
      risk: "MEDIUM"
    });
    expect(result.status).toBe("EXECUTED");
    expect(result.selectedProviderId).toBe("cad.cadquery");
    expect(result.fallbackUsed).toBe(true);
    expect(result.attempts.map((attempt) => attempt.success)).toEqual([false, true]);
  });

  it("requires explicit host availability and excludes unavailable, planned, and mock providers by default", () => {
    const router = setup([
      makeProvider("cad.build123d", ["CAD.CREATE_PART"], async () => ({
        capability: "CAD.CREATE_PART", provider: "cad.build123d", success: true, output: {}
      })),
      makeProvider("cad.cadquery", ["CAD.CREATE_PART"], async () => ({
        capability: "CAD.CREATE_PART", provider: "cad.cadquery", success: true, output: {}
      })),
      makeProvider("mock-cad", ["CAD.CREATE_PART"], async () => ({
        capability: "CAD.CREATE_PART", provider: "mock-cad", success: true, output: { mock: true }
      }))
    ], [
      { providerId: "cad.build123d", availability: "PLANNED" },
      { providerId: "cad.cadquery", availability: "UNAVAILABLE", reason: "Credentials are missing." },
      { providerId: "mock-cad", availability: "MOCK" }
    ]);

    const plan = router.plan({ capability: "CAD.CREATE_PART", input: createInput, risk: "LOW" });
    expect(plan.status).toBe("BLOCKED");
    expect(plan.candidateProviderIds).toEqual([]);
    expect(plan.excludedProviders).toHaveLength(3);
  });

  it("permits a mock adapter only when explicitly opted in", async () => {
    const router = setup([
      makeProvider("mock-cad", ["CAD.CREATE_PART"], async () => ({
        capability: "CAD.CREATE_PART", provider: "mock-cad", success: true, output: { mock: true }
      }))
    ], [{ providerId: "mock-cad", availability: "MOCK" }]);

    const result = await router.execute({
      capability: "CAD.CREATE_PART",
      input: createInput,
      risk: "LOW",
      allowMockProviders: true
    });
    expect(result.status).toBe("EXECUTED");
    expect(result.providerResult?.output).toEqual({ mock: true });
  });

  it("rejects a provider response that impersonates another adapter", async () => {
    const router = setup([
      makeProvider("cad.build123d", ["CAD.CREATE_PART"], async () => ({
        capability: "CAD.CREATE_PART", provider: "some-other-provider", success: true, output: {}
      }))
    ], [{ providerId: "cad.build123d", availability: "AVAILABLE" }]);

    const result = await router.execute({
      capability: "CAD.CREATE_PART", input: createInput, risk: "MEDIUM"
    });
    expect(result.status).toBe("FAILED");
    expect(result.providerResult?.success).toBe(false);
    expect(result.providerResult?.error).toContain("identity");
  });

  it("rejects non-CAD, missing-definition, and duplicate-profile inputs", () => {
    const registry = new CapabilityRegistry();
    registry.registerCatalog(ENGINEERING_CAPABILITIES);
    const router = new CADCapabilityRouter(registry, []);
    expect(router.plan({ capability: "ANALYSIS.SHAFT_TORQUE", input: {}, risk: "LOW" }).status).toBe("BLOCKED");
    expect(router.plan({ capability: "CAD.UNKNOWN", input: {}, risk: "LOW" }).status).toBe("BLOCKED");
    expect(() => new CADCapabilityRouter(registry, [
      { providerId: "cad.build123d", availability: "AVAILABLE" },
      { providerId: "cad.build123d", availability: "UNAVAILABLE" }
    ])).toThrow("Duplicate CAD provider profile");
  });

  it("rejects array inputs instead of treating them as CAD input records", () => {
    const registry = new CapabilityRegistry();
    registry.registerCatalog(ENGINEERING_CAPABILITIES);
    const router = new CADCapabilityRouter(registry, []);
    expect(router.plan({
      capability: "CAD.CREATE_PART",
      input: [] as unknown as Record<string, unknown>,
      risk: "LOW"
    }).status).toBe("BLOCKED");
  });

  it("blocks a required provider that is not registered or not explicitly available", () => {
    const router = setup([
      makeProvider("cad.build123d", ["CAD.CREATE_PART"], async () => ({
        capability: "CAD.CREATE_PART", provider: "cad.build123d", success: true, output: {}
      }))
    ], [{ providerId: "cad.build123d", availability: "UNAVAILABLE" }]);

    const result = router.plan({
      capability: "CAD.CREATE_PART", input: createInput, risk: "MEDIUM", requiredProviderId: "cad.build123d"
    });
    expect(result.status).toBe("BLOCKED");
    expect(result.fallbackAllowed).toBe(false);
  });
});
