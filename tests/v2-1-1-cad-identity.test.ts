import { describe, expect, it } from "vitest";
import {
  CADModelIdentity,
  CADModelIdentityRegistry,
  validateCADModelIdentity
} from "../src/cad/identity.js";

const onshapeRef = {
  providerId: "onshape",
  documentId: "doc-1",
  modelId: "part-studio-1",
  uri: "https://cad.example/doc-1/part-studio-1"
};

function identity(overrides: Partial<CADModelIdentity> = {}): CADModelIdentity {
  return {
    id: "cad-model-1",
    projectId: "project-1",
    name: "Pump impeller",
    nativeReferences: [onshapeRef],
    createdAt: "2026-10-09T10:00:00.000Z",
    updatedAt: "2026-10-09T10:00:00.000Z",
    ...overrides
  };
}

describe("CAD model identity", () => {
  it("validates a project-scoped canonical identity and provider-native reference", () => {
    expect(validateCADModelIdentity(identity(), "project-1")).toMatchObject({
      status: "PASS",
      errors: [],
      warnings: []
    });
  });

  it("permits a not-yet-linked identity but emits a warning rather than inventing a provider", () => {
    expect(validateCADModelIdentity(identity({ nativeReferences: [] }))).toMatchObject({
      status: "PASS",
      warnings: ["CAD model identity has no linked native CAD provider reference yet."]
    });
  });

  it("rejects duplicate native references within one canonical identity", () => {
    expect(validateCADModelIdentity(identity({ nativeReferences: [onshapeRef, { ...onshapeRef }] }))).toMatchObject({
      status: "FAIL",
      errors: ["CAD model identity contains a duplicate native model reference."]
    });
  });

  it("registers and resolves canonical identities without leaking mutable registry state", () => {
    const registry = new CADModelIdentityRegistry();
    const result = registry.register(identity(), "project-1");
    expect(result.status).toBe("REGISTERED");
    expect(registry.resolveByNativeReference(onshapeRef, "project-1")?.id).toBe("cad-model-1");

    if (result.identity) result.identity.nativeReferences[0].modelId = "mutated";
    const resolved = registry.resolveById("cad-model-1", "project-1");
    expect(resolved?.nativeReferences[0].modelId).toBe("part-studio-1");
  });

  it("prevents the same provider-native model from being assigned to two canonical identities", () => {
    const registry = new CADModelIdentityRegistry();
    expect(registry.register(identity(), "project-1").status).toBe("REGISTERED");
    const conflict = registry.register(identity({
      id: "cad-model-2",
      name: "Different canonical model"
    }), "project-1");
    expect(conflict.status).toBe("REJECTED");
    expect(conflict.errors[0]).toContain("already linked");
  });

  it("rejects canonical ids that collide after whitespace normalization", () => {
    const registry = new CADModelIdentityRegistry();
    registry.register(identity({ nativeReferences: [] }), "project-1");
    const result = registry.register(identity({ id: " cad-model-1 ", nativeReferences: [] }), "project-1");
    expect(result.status).toBe("REJECTED");
    expect(result.errors[0]).toContain("already registered");
  });

  it("isolates lookups by project and rejects cross-project registration", () => {
    const registry = new CADModelIdentityRegistry();
    registry.register(identity(), "project-1");
    expect(registry.resolveById("cad-model-1", "project-2")).toBeUndefined();
    expect(registry.resolveByNativeReference(onshapeRef, "project-2")).toBeUndefined();
    expect(registry.register(identity({ id: "other", projectId: "project-2" }), "project-1").status).toBe("REJECTED");
  });

  it("links another provider reference and makes the operation idempotent", () => {
    const registry = new CADModelIdentityRegistry();
    registry.register(identity({ nativeReferences: [] }), "project-1");
    const freecadRef = {
      providerId: "freecad",
      documentId: "project-assets",
      modelId: "impeller.FCStd"
    };
    expect(registry.linkNativeReference("cad-model-1", "project-1", freecadRef, "2026-10-09T10:05:00.000Z").status)
      .toBe("LINKED");
    expect(registry.linkNativeReference("cad-model-1", "project-1", freecadRef, "2026-10-09T10:06:00.000Z").status)
      .toBe("ALREADY_LINKED");
    expect(registry.resolveByNativeReference(freecadRef, "project-1")?.id).toBe("cad-model-1");
    expect(registry.resolveById("cad-model-1", "project-1")?.nativeReferences).toHaveLength(1);
  });

  it("rejects a native-reference collision with another canonical identity", () => {
    const registry = new CADModelIdentityRegistry();
    registry.register(identity(), "project-1");
    registry.register(identity({ id: "cad-model-2", nativeReferences: [] }), "project-1");
    const result = registry.linkNativeReference("cad-model-2", "project-1", onshapeRef, "2026-10-09T10:05:00.000Z");
    expect(result.status).toBe("REJECTED");
    expect(result.errors[0]).toContain("already linked");
  });

  it("rejects timestamps that move backwards", () => {
    const registry = new CADModelIdentityRegistry();
    registry.register(identity({ nativeReferences: [] }), "project-1");
    const result = registry.linkNativeReference(
      "cad-model-1",
      "project-1",
      onshapeRef,
      "2026-10-09T09:59:00.000Z"
    );
    expect(result.status).toBe("REJECTED");
  });
});
