import { describe, expect, it } from "vitest";
import {
  inventoryProjectArtifacts,
  isSafeProjectArtifactPath,
  removeProjectArtifacts,
  type ArtifactEntry,
} from "../src/projects/artifact-cleanup.js";

describe("project artifact cleanup", () => {
  const projectId = "ef5a69b4-98a5-48d8-a0ad-574227bac022";

  it("inventories root and nested objects and reconciles recorded references", async () => {
    const pages: Record<string, ArtifactEntry[]> = {
      [projectId]: [
        { name: "root.txt", id: "object-root", metadata: { size: 5 } },
        { name: "cad", id: null, metadata: null },
      ],
      [projectId + "/cad"]: [{ name: "part.step", id: "object-cad", metadata: { size: 9 } }],
    };
    const result = await inventoryProjectArtifacts(
      projectId,
      async (folder, { limit, offset }) => ({
        data: (pages[folder] ?? []).slice(offset, offset + limit),
        error: null,
      }),
      async () => ({
        data: [{ storage_objects: [projectId + "/recorded/receipt.json", projectId + "/root.txt"] }],
        error: null,
      }),
    );
    expect([...result].sort()).toEqual([
      projectId + "/cad/part.step",
      projectId + "/recorded/receipt.json",
      projectId + "/root.txt",
    ]);
  });

  it("rejects unsafe cross-project paths and traversal segments", async () => {
    expect(isSafeProjectArtifactPath(projectId, projectId + "/good/file.step")).toBe(true);
    expect(isSafeProjectArtifactPath(projectId, projectId + "/../other-project/secret.txt")).toBe(false);
    expect(isSafeProjectArtifactPath(projectId, "another-project/secret.txt")).toBe(false);
    await expect(inventoryProjectArtifacts(
      projectId,
      async () => ({ data: [], error: null }),
      async () => ({ data: [{ storage_objects: [projectId + "/../other-project/secret.txt"] }], error: null }),
    )).rejects.toThrow("outside the project scope");
  });

  it("fails closed when storage inventory or completion reference reads fail", async () => {
    await expect(inventoryProjectArtifacts(
      projectId,
      async () => ({ data: null, error: new Error("storage unavailable") }),
      async () => ({ data: [], error: null }),
    )).rejects.toThrow("inventory could not be listed");
    await expect(inventoryProjectArtifacts(
      projectId,
      async () => ({ data: [], error: null }),
      async () => ({ data: null, error: new Error("database unavailable") }),
    )).rejects.toThrow("references could not be loaded");
  });

  it("deduplicates and deletes artifacts in bounded batches", async () => {
    const paths = Array.from({ length: 201 }, (_, index) => projectId + "/item-" + index + ".bin");
    paths.push(paths[0]);
    const batches: number[] = [];
    await removeProjectArtifacts(paths, async (batch) => { batches.push(batch.length); return { error: null }; });
    expect(batches).toEqual([100, 100, 1]);
  });

  it("stops immediately when artifact removal fails", async () => {
    const paths = Array.from({ length: 101 }, (_, index) => projectId + "/item-" + index + ".bin");
    let calls = 0;
    await expect(removeProjectArtifacts(paths, async () => {
      calls += 1;
      return { error: new Error("storage delete failed") };
    })).rejects.toThrow("could not be removed");
    expect(calls).toBe(1);
  });
});
