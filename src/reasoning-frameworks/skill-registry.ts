import { parseSkillManifest } from "./validation";
import type { SkillManifest } from "./types.js";

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
    this.manifests.set(key, this.freezeManifest(manifest));
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

  private freezeManifest(manifest: SkillManifest): SkillManifest {
    const copy = structuredClone(manifest);
    Object.freeze(copy.domains);
    Object.freeze(copy.requiredInputs);
    Object.freeze(copy.outputs);
    Object.freeze(copy.allowedCapabilities);
    return Object.freeze(copy);
  }
}
