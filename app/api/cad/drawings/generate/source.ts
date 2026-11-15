import {
  loadCompletion, resolveCanonicalSolid, verifyStoredBrep
} from "../../../../../src/cad/geometry-revision-persistence-source";
import type { CanonicalSolid, Completion, GeometryRevisionDatabase, Row } from "../../../../../src/cad/geometry-revision-persistence-types";
import { fail } from "./request";
import { extractCylinderDimensions } from "./shaft-dimensions";
import { isRecord, validateRevisionArtifactBinding } from "./source-validation";
export { loadCurrentGeometryRevision } from "./source-revision";

type ServiceDb = ReturnType<typeof import("../../../../../lib/supabase/service").createServiceRoleClient>;
export interface AcceptedShaftSource {
  completion: Completion; solid: CanonicalSolid; diameterMm: number; lengthMm: number;
}
interface SourceInput {
  serviceDb: ServiceDb; revision: Row; projectId: string; modelIdentityId: string;
}
async function loadSourceCompletion(input: SourceInput): Promise<Completion> {
  const result = await loadCompletion(
    input.serviceDb as unknown as GeometryRevisionDatabase,
    input.projectId,
    String(input.revision.source_completion_id)
  );
  if (!result.ok) fail({ message: result.message, status: result.status, code: "SOURCE_COMPLETION_UNAVAILABLE" });
  if (result.value.model_identity_id !== input.modelIdentityId) {
    fail({ message: "Source completion belongs to a different CAD model.", status: 422, code: "SOURCE_COMPLETION_MODEL_MISMATCH" });
  }
  return result.value;
}
function resolveRevisionSolid(input: { completion: Completion; revision: Row; projectId: string }): CanonicalSolid {
  const result = resolveCanonicalSolid(input.completion, input.projectId);
  if (!result.ok) fail({ message: result.message, status: result.status, code: "SOURCE_ARTIFACT_MISMATCH" });
  validateRevisionArtifactBinding(input.revision, result.value);
  return result.value;
}
async function verifyCanonicalSource(input: { serviceDb: ServiceDb; solid: CanonicalSolid }): Promise<void> {
  const result = await verifyStoredBrep(input.serviceDb as unknown as GeometryRevisionDatabase, input.solid);
  if (!result.ok) fail({ message: result.message, status: result.status, code: "SOURCE_DIGEST_MISMATCH" });
}
export async function loadAcceptedShaftSource(input: SourceInput): Promise<AcceptedShaftSource> {
  const completion = await loadSourceCompletion(input);
  const solid = resolveRevisionSolid({ completion, revision: input.revision, projectId: input.projectId });
  await verifyCanonicalSource({ serviceDb: input.serviceDb, solid });
  const dimensions = extractCylinderDimensions({
    completion, revision: input.revision, projectId: input.projectId,
    modelIdentityId: input.modelIdentityId, solidId: solid.id
  });
  return { completion, solid, ...dimensions };
}
