export interface ArtifactEntry {
  name: string;
  id?: string | null;
  metadata?: unknown;
}
export interface ArtifactPageResult { data: ArtifactEntry[] | null; error: unknown | null }
export interface ArtifactReferenceRow { storage_objects: unknown }
export interface ArtifactReferenceResult { data: ArtifactReferenceRow[] | null; error: unknown | null }
export type ListArtifactPage = (folder: string, options: { limit: number; offset: number }) => Promise<ArtifactPageResult>;
export type LoadArtifactReferences = () => Promise<ArtifactReferenceResult>;
export type RemoveArtifactBatch = (paths: string[]) => Promise<{ error: unknown | null }>;

const STORAGE_PAGE_SIZE = 100;
const STORAGE_DELETE_BATCH_SIZE = 100;
const MAX_FOLDER_DEPTH = 12;

export function isSafeProjectArtifactPath(projectId: string, value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith(projectId + "/")) return false;
  const segments = value.split("/");
  return segments[0] === projectId && segments.length >= 2 && segments.slice(1).every((segment) =>
    segment.length > 0 && segment !== "." && segment !== ".." && !segment.includes("\\")
  );
}

export async function inventoryProjectArtifacts(
  projectId: string,
  listPage: ListArtifactPage,
  loadReferences: LoadArtifactReferences,
): Promise<Set<string>> {
  const paths = new Set<string>();
  async function walk(folder: string, depth: number): Promise<void> {
    if (depth > MAX_FOLDER_DEPTH) throw new Error("Artifact folder nesting exceeds the safe cleanup limit.");
    let offset = 0;
    while (true) {
      const { data, error } = await listPage(folder, { limit: STORAGE_PAGE_SIZE, offset });
      if (error) throw new Error("Project artifact inventory could not be listed.");
      const entries = data ?? [];
      for (const entry of entries) {
        const name = entry.name;
        if (typeof name !== "string" || !name || name === "." || name === ".." || name.includes("/") || name.includes("\\")) {
          throw new Error("Project artifact inventory contains an unsafe path segment.");
        }
        const objectPath = folder + "/" + name;
        if (entry.id == null && entry.metadata == null) await walk(objectPath, depth + 1);
        else {
          if (!isSafeProjectArtifactPath(projectId, objectPath)) {
            throw new Error("Project artifact inventory contains a path outside the project scope.");
          }
          paths.add(objectPath);
        }
      }
      if (entries.length < STORAGE_PAGE_SIZE) break;
      offset += entries.length;
    }
  }
  await walk(projectId, 0);
  const { data: completions, error: completionError } = await loadReferences();
  if (completionError) throw new Error("Project artifact references could not be loaded.");
  for (const completion of completions ?? []) {
    const storedPaths = completion.storage_objects;
    if (storedPaths == null) continue;
    if (!Array.isArray(storedPaths)) throw new Error("Project artifact references are malformed.");
    for (const path of storedPaths) {
      if (!isSafeProjectArtifactPath(projectId, path)) {
        throw new Error("A recorded artifact path falls outside the project scope; deletion was stopped.");
      }
      paths.add(path);
    }
  }
  return paths;
}

export async function removeProjectArtifacts(paths: string[], removeBatch: RemoveArtifactBatch): Promise<void> {
  const uniquePaths = [...new Set(paths)];
  for (let offset = 0; offset < uniquePaths.length; offset += STORAGE_DELETE_BATCH_SIZE) {
    const { error } = await removeBatch(uniquePaths.slice(offset, offset + STORAGE_DELETE_BATCH_SIZE));
    if (error) throw new Error("One or more project artifacts could not be removed.");
  }
}
