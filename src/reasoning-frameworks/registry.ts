import type { ReasoningFrameworkId, ReasoningFrameworkManifest } from "./types.js";
import { parseFrameworkManifest } from "./validation";

const builtInFrameworks: ReasoningFrameworkManifest[] = [
  {
    schemaVersion: 1,
    id: "first-principles",
    version: "1.0.0",
    name: "First-Principles Thinking",
    purpose: "Separate foundational facts, assumptions, and derived constraints.",
    suitableFor: ["problem-framing", "novel-design", "constraint-analysis"],
    requiredInputs: ["task"],
    outputKind: "REASONING_RECORD"
  },
  {
    schemaVersion: 1,
    id: "weighted-decision-matrix",
    version: "1.0.0",
    name: "Weighted Decision Matrix",
    purpose: "Compare alternatives against explicit criteria while exposing uncertainty.",
    suitableFor: ["option-selection", "trade-study", "architecture-decision"],
    requiredInputs: ["alternatives", "criteria"],
    outputKind: "REASONING_RECORD"
  },
  {
    schemaVersion: 1,
    id: "five-whys",
    version: "1.0.0",
    name: "5 Whys",
    purpose: "Explore a possible causal chain; proposed causes require independent evidence.",
    suitableFor: ["failure-analysis", "problem-investigation", "recurring-issue"],
    requiredInputs: ["problem-statement"],
    outputKind: "REASONING_RECORD"
  }
];

function immutableManifest(manifest: ReasoningFrameworkManifest): ReasoningFrameworkManifest {
  const copy = structuredClone(manifest);
  Object.freeze(copy.suitableFor);
  Object.freeze(copy.requiredInputs);
  return Object.freeze(copy);
}

export const REASONING_FRAMEWORKS: readonly ReasoningFrameworkManifest[] = Object.freeze(
  builtInFrameworks.map(immutableManifest)
);

export interface ReasoningFrameworkRegistry {
  register(value: unknown): ReasoningFrameworkManifest;
  get(id: ReasoningFrameworkId, version?: string): ReasoningFrameworkManifest | undefined;
  list(id?: ReasoningFrameworkId): ReasoningFrameworkManifest[];
}

/**
 * Isolated registry for one application/workspace scope. Exact versions are
 * retained; a lookup without a version is only resolved when the ID is unambiguous.
 */
export class InMemoryReasoningFrameworkRegistry implements ReasoningFrameworkRegistry {
  private readonly manifests = new Map<string, ReasoningFrameworkManifest>();

  constructor(initial: readonly unknown[] = []) {
    for (const manifest of initial) this.register(manifest);
  }

  register(value: unknown): ReasoningFrameworkManifest {
    const manifest = parseFrameworkManifest(value);
    const key = this.key(manifest.id, manifest.version);
    if (this.manifests.has(key)) {
      throw new Error(`Reasoning framework version is already registered: ${manifest.id}@${manifest.version}.`);
    }
    this.manifests.set(key, immutableManifest(manifest));
    return structuredClone(manifest);
  }

  get(id: ReasoningFrameworkId, version?: string): ReasoningFrameworkManifest | undefined {
    if (version !== undefined) {
      const manifest = this.manifests.get(this.key(id, version));
      return manifest ? structuredClone(manifest) : undefined;
    }
    const matches = [...this.manifests.values()].filter((manifest) => manifest.id === id);
    return matches.length === 1 ? structuredClone(matches[0]) : undefined;
  }

  list(id?: ReasoningFrameworkId): ReasoningFrameworkManifest[] {
    return [...this.manifests.values()]
      .filter((manifest) => id === undefined || manifest.id === id)
      .sort((left, right) => left.id.localeCompare(right.id) || left.version.localeCompare(right.version))
      .map((manifest) => structuredClone(manifest));
  }

  private key(id: string, version: string): string {
    return `${id}@${version}`;
  }
}

export function createDefaultReasoningFrameworkRegistry(): InMemoryReasoningFrameworkRegistry {
  return new InMemoryReasoningFrameworkRegistry(REASONING_FRAMEWORKS);
}

export function getReasoningFramework(
  id: ReasoningFrameworkId,
  version?: string
): ReasoningFrameworkManifest | undefined {
  const matches = REASONING_FRAMEWORKS.filter(
    (manifest) => manifest.id === id && (version === undefined || manifest.version === version)
  );
  return matches.length === 1 ? structuredClone(matches[0]) : undefined;
}
