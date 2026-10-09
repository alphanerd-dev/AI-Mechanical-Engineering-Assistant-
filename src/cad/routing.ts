import {
  CapabilityRequest,
  CapabilityResult,
  CapabilityRisk
} from "../core/types.js";
import { CapabilityProvider, CapabilityRegistry } from "../capabilities/registry.js";

export type CADProviderAvailability = "AVAILABLE" | "UNAVAILABLE" | "PLANNED" | "MOCK";

export interface CADProviderProfile {
  /** Must match the id returned by the registered provider adapter. */
  providerId: string;
  /** Availability is supplied by trusted host configuration, never inferred from a provider name. */
  availability: CADProviderAvailability;
  reason?: string;
}

export interface CADProviderExclusion {
  providerId: string;
  reason: string;
}

export interface CADRoutingRequest {
  capability: string;
  input: Record<string, unknown>;
  risk: CapabilityRisk;
  /** Ordered preference; available providers not listed may remain fallback candidates. */
  preferredProviderIds?: string[];
  /** Hard pin: if this provider cannot execute, routing stops without fallback. */
  requiredProviderId?: string;
  /** Explicitly override risk-based fallback policy. A required provider always disables fallback. */
  allowFallback?: boolean;
  /** Mock adapters are denied by default and only admitted on explicit opt-in. */
  allowMockProviders?: boolean;
}

export interface CADRoutingPlan {
  status: "READY" | "BLOCKED";
  capability: string;
  selectedProviderId?: string;
  candidateProviderIds: string[];
  excludedProviders: CADProviderExclusion[];
  fallbackAllowed: boolean;
  reason: string;
}

export interface CADProviderAttempt {
  providerId: string;
  success: boolean;
  error?: string;
}

export interface CADRoutingResult {
  status: "EXECUTED" | "BLOCKED" | "FAILED";
  capability: string;
  selectedProviderId?: string;
  providerResult?: CapabilityResult;
  plan: CADRoutingPlan;
  attempts: CADProviderAttempt[];
  fallbackUsed: boolean;
  reason?: string;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()))];
}

function isCADCapability(capability: string): boolean {
  return capability.startsWith("CAD.") && capability.length > 4;
}

function defaultFallbackAllowed(risk: CapabilityRisk): boolean {
  return risk === "LOW" || risk === "MEDIUM";
}

/**
 * CAD-specific policy over the existing capability registry. It does not create a
 * second provider execution system: it selects registered adapters, then invokes
 * the chosen CapabilityProvider contract directly so the requested provider is exact.
 */
export class CADCapabilityRouter {
  private readonly profiles: Map<string, CADProviderProfile>;

  constructor(private readonly registry: CapabilityRegistry, profiles: CADProviderProfile[]) {
    const map = new Map<string, CADProviderProfile>();
    for (const profile of profiles) {
      if (!nonEmptyString(profile.providerId)) {
        throw new Error("CAD provider profile requires a provider id.");
      }
      if (map.has(profile.providerId.trim())) {
        throw new Error("Duplicate CAD provider profile: " + profile.providerId.trim() + ".");
      }
      map.set(profile.providerId.trim(), {
        ...profile,
        providerId: profile.providerId.trim(),
        ...(profile.reason === undefined ? {} : { reason: profile.reason.trim() })
      });
    }
    this.profiles = map;
  }

  plan(request: CADRoutingRequest): CADRoutingPlan {
    const capability = typeof request?.capability === "string" ? request.capability : "";
    const excludedProviders: CADProviderExclusion[] = [];
    const blocked = (reason: string): CADRoutingPlan => ({
      status: "BLOCKED",
      capability,
      candidateProviderIds: [],
      excludedProviders,
      fallbackAllowed: false,
      reason
    });

    if (!isCADCapability(capability)) {
      return blocked("CAD routing only accepts a CAD.* capability.");
    }

    const definition = this.registry.getDefinition(capability);
    if (!definition) {
      return blocked("No capability definition is registered for " + capability + ".");
    }
    if (definition.status === "BLOCKED" || definition.status === "DEPRECATED") {
      return blocked("Capability is not routable while its status is " + definition.status + ".");
    }

    if (Array.isArray(request.input) || typeof request.input !== "object" || request.input === null) {
      return blocked("CAD routing requires an input object.");
    }

    const requestedProviders = request.preferredProviderIds ?? [];
    if (!Array.isArray(requestedProviders) || requestedProviders.some((id) => !nonEmptyString(id))) {
      return blocked("preferredProviderIds must contain only non-empty provider ids.");
    }
    if (new Set(requestedProviders.map((id) => id.trim())).size !== requestedProviders.length) {
      return blocked("preferredProviderIds must not contain duplicate provider ids.");
    }
    if (request.requiredProviderId !== undefined && !nonEmptyString(request.requiredProviderId)) {
      return blocked("requiredProviderId must be a non-empty provider id when supplied.");
    }

    const requiredProviderId = request.requiredProviderId?.trim();
    const fallbackAllowed = requiredProviderId
      ? false
      : request.allowFallback ?? defaultFallbackAllowed(request.risk);

    const registered = this.registry.resolve(capability);
    const eligible: CapabilityProvider[] = [];
    for (const provider of registered) {
      const profile = this.profiles.get(provider.id);
      if (!profile) {
        excludedProviders.push({
          providerId: provider.id,
          reason: "No explicit host availability profile; provider is not assumed callable."
        });
        continue;
      }
      if (profile.availability === "UNAVAILABLE") {
        excludedProviders.push({
          providerId: provider.id,
          reason: profile.reason || "Host configuration marks this provider unavailable."
        });
        continue;
      }
      if (profile.availability === "PLANNED") {
        excludedProviders.push({
          providerId: provider.id,
          reason: profile.reason || "Provider is planned but not configured for execution."
        });
        continue;
      }
      if (profile.availability === "MOCK" && request.allowMockProviders !== true) {
        excludedProviders.push({
          providerId: provider.id,
          reason: "Mock provider is excluded from product routing unless explicitly enabled."
        });
        continue;
      }
      eligible.push(provider);
    }

    if (requiredProviderId) {
      const selected = eligible.find((provider) => provider.id === requiredProviderId);
      if (!selected) {
        const registeredProvider = registered.find((provider) => provider.id === requiredProviderId);
        if (!registeredProvider) {
          excludedProviders.push({
            providerId: requiredProviderId,
            reason: "Required provider is not registered for this capability."
          });
        } else if (!excludedProviders.some((item) => item.providerId === requiredProviderId)) {
          excludedProviders.push({
            providerId: requiredProviderId,
            reason: "Required provider is not eligible under the host availability policy."
          });
        }
        return blocked("Required CAD provider is not eligible; routing fails closed without fallback.");
      }
      return {
        status: "READY",
        capability,
        selectedProviderId: selected.id,
        candidateProviderIds: [selected.id],
        excludedProviders,
        fallbackAllowed: false,
        reason: "Provider is explicitly pinned by the request."
      };
    }

    if (!eligible.length) {
      return blocked("No registered CAD provider is explicitly available under the host policy.");
    }

    const preferences = uniqueStrings(requestedProviders);
    const preferenceRank = new Map<string, number>(preferences.map((id, index) => [id, index] as const));
    const ordered = [...eligible].sort((a, b) => {
      const rankA = preferenceRank.get(a.id);
      const rankB = preferenceRank.get(b.id);
      if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
      if (rankA !== undefined) return -1;
      if (rankB !== undefined) return 1;
      // Registry.resolve() already respects the capability catalog order.
      return 0;
    });

    const candidates = fallbackAllowed ? ordered : ordered.slice(0, 1);
    return {
      status: "READY",
      capability,
      selectedProviderId: candidates[0].id,
      candidateProviderIds: candidates.map((provider) => provider.id),
      excludedProviders,
      fallbackAllowed,
      reason: fallbackAllowed
        ? "Selected by explicit preference and capability catalog order; bounded fallback is permitted."
        : "Selected by explicit preference and capability catalog order; risk policy requires one provider attempt."
    };
  }

  async execute(request: CADRoutingRequest): Promise<CADRoutingResult> {
    const plan = this.plan(request);
    const attempts: CADProviderAttempt[] = [];
    if (plan.status !== "READY") {
      return {
        status: "BLOCKED",
        capability: plan.capability,
        plan,
        attempts,
        fallbackUsed: false,
        reason: plan.reason
      };
    }

    const providers = this.registry.resolve(plan.capability);
    let lastResult: CapabilityResult | undefined;
    for (const [index, providerId] of plan.candidateProviderIds.entries()) {
      const provider = providers.find((item) => item.id === providerId);
      if (!provider) {
        attempts.push({
          providerId,
          success: false,
          error: "Provider disappeared from the registry after route planning."
        });
        continue;
      }

      let result: CapabilityResult;
      try {
        const providerRequest: CapabilityRequest = {
          capability: request.capability,
          input: request.input,
          risk: request.risk
        };
        result = await provider.execute(providerRequest);
      } catch (error) {
        result = {
          capability: request.capability,
          provider: provider.id,
          success: false,
          error: error instanceof Error ? error.message : "Provider execution threw an unknown error."
        };
      }

      if (result.capability !== request.capability || result.provider !== provider.id) {
        result = {
          capability: request.capability,
          provider: provider.id,
          success: false,
          error: "Provider response identity does not match the requested capability and registered provider."
        };
      } else if (result.success && result.output === undefined) {
        result = {
          ...result,
          success: false,
          error: "Provider reported success without an output; result is rejected."
        };
      }

      attempts.push({
        providerId: provider.id,
        success: result.success,
        ...(result.error ? { error: result.error } : {})
      });
      lastResult = result;

      if (result.success) {
        return {
          status: "EXECUTED",
          capability: request.capability,
          selectedProviderId: provider.id,
          providerResult: result,
          plan,
          attempts,
          fallbackUsed: index > 0,
          reason: index > 0
            ? "A later eligible provider succeeded after an earlier provider failed."
            : "Selected provider completed execution; geometry validation remains a separate gate."
        };
      }
      if (!plan.fallbackAllowed) break;
    }

    return {
      status: "FAILED",
      capability: request.capability,
      selectedProviderId: plan.selectedProviderId,
      ...(lastResult ? { providerResult: lastResult } : {}),
      plan,
      attempts,
      fallbackUsed: attempts.length > 1,
      reason: plan.fallbackAllowed
        ? "All permitted CAD provider attempts failed."
        : "The selected CAD provider failed and policy did not permit fallback."
    };
  }
}
