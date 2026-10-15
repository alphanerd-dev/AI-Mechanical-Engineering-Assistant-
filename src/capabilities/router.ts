import { CapabilityRequest, CapabilityResult } from "../core/types";
import { CapabilityProvider, CapabilityRegistry } from "./registry";
import { providerExecutionBlocked } from "../providers/promotion-manifest.js";

function failure(capability: string, provider: string, error: string): CapabilityResult {
  return { capability, provider, success: false, error };
}

function normalizedResult(
  value: unknown,
  request: CapabilityRequest,
  provider: CapabilityProvider,
): CapabilityResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return failure(request.capability, provider.id, "Provider returned a malformed result envelope.");
  }

  const result = value as Record<string, unknown>;
  if (result.capability !== request.capability || result.provider !== provider.id) {
    return failure(
      request.capability,
      provider.id,
      "Provider result identity does not match the requested capability/provider.",
    );
  }
  if (typeof result.success !== "boolean") {
    return failure(request.capability, provider.id, "Provider result is missing a boolean success status.");
  }
  for (const key of ["evidenceIds", "artifactIds"] as const) {
    const items = result[key];
    if (items !== undefined && (!Array.isArray(items) ||
        items.some((item) => typeof item !== "string" || !item.trim()))) {
      return failure(request.capability, provider.id, "Provider result contains malformed " + key + ".");
    }
  }
  if (result.success) {
    if (result.output === undefined || result.output === null) {
      return failure(request.capability, provider.id, "Provider reported success without a verifiable output.");
    }
    if (result.error !== undefined && result.error !== null) {
      return failure(request.capability, provider.id, "Provider result has contradictory success and error fields.");
    }
    return result as unknown as CapabilityResult;
  }

  return {
    capability: request.capability,
    provider: provider.id,
    success: false,
    ...(result.output !== undefined ? { output: result.output } : {}),
    error: typeof result.error === "string" && result.error.trim()
      ? result.error
      : "Provider failed without a usable error reason.",
    ...(Array.isArray(result.evidenceIds) ? { evidenceIds: result.evidenceIds as string[] } : {}),
    ...(Array.isArray(result.artifactIds) ? { artifactIds: result.artifactIds as string[] } : {}),
  };
}

/** The router normalizes untrusted provider responses before the rest of the core sees them. */
export class CapabilityRouter {
  constructor(private registry: CapabilityRegistry) {}

  getDefinition(capability: string) {
    return this.registry.getDefinition(capability);
  }

  async execute(request: CapabilityRequest): Promise<CapabilityResult> {
    const definition = this.registry.getDefinition(request.capability);
    if (definition?.status === "BLOCKED" || definition?.status === "DEPRECATED") {
      return failure(request.capability, "registry", "Capability is blocked or deprecated.");
    }

    const providers = this.registry.resolve(request.capability);
    if (!providers.length) {
      return failure(request.capability, "none", "No provider registered");
    }

    let last: CapabilityResult | undefined;
    for (const provider of providers) {
      if (provider.promotionManifest) {
        const blockedReason = providerExecutionBlocked(provider.promotionManifest);
        if (blockedReason) return failure(request.capability, provider.id, blockedReason);
      }
      let value: unknown;
      try {
        value = await provider.execute(request);
      } catch {
        // Let the capability-specific completion handler construct its typed failure result,
        // but never reflect a provider exception that may contain credentials or internals.
        throw new Error("Provider execution failed unexpectedly.");
      }

      const result = normalizedResult(value, request, provider);
      if (result.success) return result;
      last = result;
    }

    return last ?? failure(request.capability, "none", "All providers failed");
  }
}
