import { parseSkillManifest } from "./validation";
import type { SkillManifest } from "./types.js";

const builtInSkills: SkillManifest[] = [
  {
    schemaVersion: 1,
    id: "engineering-rd",
    version: "1.0.0",
    name: "Engineering R&D",
    description: "A bounded cross-domain engineering research and design-planning profile. It structures problem definitions, assumptions, alternatives, analysis plans and verification plans; it does not execute engineering capabilities or certify results.",
    domains: ["mechanical", "manufacturing", "energy", "product-development", "engineering-analysis"],
    requiredInputs: ["task"],
    outputs: ["problem-definition", "known-facts", "assumptions", "alternatives", "analysis-plan", "verification-plan"],
    allowedCapabilities: [
      "ANALYSIS.SHAFT_TORQUE",
      "ANALYSIS.SHAFT_STATIC_DESIGN",
      "ANALYSIS.SHAFT_SIZE",
      "ANALYSIS.PUMP_HYDRAULIC_POWER",
      "UNITS.CONVERT",
      "UNITS.CHECK_DIMENSIONS",
      "CONSTRAINT.EVALUATE",
      "CONSTRAINT.SOLVE",
      "MATH.SYMBOLIC_SOLVE",
      "MATH.NUMERICAL_SOLVE",
      "MATH.CROSS_VALIDATE",
      "REQUIREMENT.CREATE",
      "REQUIREMENT.TRACE",
      "SYSTEM.DEFINE",
      "SYSTEM.ALLOCATE_REQUIREMENT",
      "MANUFACTURING.VALIDATE_PROCESS_PLAN",
      "MANUFACTURING.EVALUATE_INSPECTION",
      "DIGITAL_THREAD.LINK"
    ],
    maximumRisk: "MEDIUM",
    requiresApproval: true
  }
];

function freezeManifest(manifest: SkillManifest): SkillManifest {
  const copy = structuredClone(manifest);
  Object.freeze(copy.domains);
  Object.freeze(copy.requiredInputs);
  Object.freeze(copy.outputs);
  Object.freeze(copy.allowedCapabilities);
  return Object.freeze(copy);
}

export interface SkillManifestRegistry {
  register(value: unknown): SkillManifest;
  get(id: string, version?: string): SkillManifest | undefined;
  list(id?: string): SkillManifest[];
}

/**
 * Workspace-scoped, version-aware metadata registry. Registration does not
 * grant runtime authority by itself; task binding applies risk/capability gates.
 */
export class InMemorySkillManifestRegistry implements SkillManifestRegistry {
  private readonly manifests = new Map<string, SkillManifest>();

  constructor(initial: readonly unknown[] = []) {
    for (const manifest of initial) this.register(manifest);
  }

  register(value: unknown): SkillManifest {
    const manifest = parseSkillManifest(value);
    const key = this.key(manifest.id, manifest.version);
    if (this.manifests.has(key)) {
      throw new Error(`Skill manifest version is already registered: ${manifest.id}@${manifest.version}.`);
    }
    this.manifests.set(key, freezeManifest(manifest));
    return structuredClone(manifest);
  }

  get(id: string, version?: string): SkillManifest | undefined {
    if (version !== undefined) {
      const manifest = this.manifests.get(this.key(id, version));
      return manifest ? structuredClone(manifest) : undefined;
    }
    const matches = [...this.manifests.values()].filter((manifest) => manifest.id === id);
    return matches.length === 1 ? structuredClone(matches[0]) : undefined;
  }

  list(id?: string): SkillManifest[] {
    return [...this.manifests.values()]
      .filter((manifest) => id === undefined || manifest.id === id)
      .sort((left, right) => left.id.localeCompare(right.id) || left.version.localeCompare(right.version))
      .map((manifest) => structuredClone(manifest));
  }

  private key(id: string, version: string): string {
    return `${id}@${version}`;
  }
}

export function createDefaultSkillManifestRegistry(): InMemorySkillManifestRegistry {
  return new InMemorySkillManifestRegistry(builtInSkills);
}
