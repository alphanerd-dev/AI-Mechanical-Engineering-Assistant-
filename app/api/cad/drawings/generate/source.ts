import {
  loadCompletion, resolveCanonicalSolid, verifyStoredBrep
} from "../../../../../src/cad/geometry-revision-persistence-source";
import type { CanonicalSolid, Completion, GeometryRevisionDatabase, Row } from "../../../../../src/cad/geometry-revision-persistence-types";
import { fail } from "./request";
import { extractCylinderDimensions } from "./shaft-dimensions";
import { isRecord, validateRevisionArtifactBinding } from "./source-validation";

type ServiceDb = ReturnType<typeof import("../../../../../lib/supabase/service").createServiceRoleClient>;
export interface AcceptedShaftSource {
  completion: Completion;
  solid: CanonicalSolid;
  diameterMm: number;
  lengthMm: number;
}

export async function loadCurrentGeometryRevision(serviceDb: ServiceDb, input: {
  projectId: string; modelIdentityId: string; geometryRevisionId: string;
}): Promise<Row> {
  const { data, error } = await serviceDb.from("engineering_geometry_revisions").select("*")
    .eq("project_id", input.projectId).eq("model_identity_id", input.modelIdentityId)
    .order("revision_number", { ascending: false }).limit(1);
  if (error) fail({ message: "Current accepted geometry revision could not be loaded.", status: 503, code: "GEOMETRY_REVISION_UNAVAILABLE" });
  if (!Array.isArray(data)) fail({ message: "Current accepted geometry revision could not be loaded.", status: 503, code: "GEOMETRY_REVISION_UNAVAILABLE" });
  if (data.length === 0) fail({ message: "Current accepted geometry revision could not be loaded.", status: 503, code: "GEOMETRY_REVISION_UNAVAILABLE" });
  if (!isRecord(data[0])) fail({ message: "Current accepted geometry revision could not be loaded.", status: 503, code: "GEOMETRY_REVISION_UNAVAILABLE" });
  const revision = data[0];
  if (revision.id !== input.geometryRevisionId) {
    fail({ message: "The requested drawing source is stale. Reload the current geometry revision before generating a drawing.", status: 409, code: "STALE_DRAWING_SOURCE" });
  }
  return revision;
}

export async function loadAcceptedShaftSource(input: {
  serviceDb: ServiceDb; revision: Row; projectId: string; modelIdentityId: string;
}): Promise<AcceptedShaftSource> {
  const { serviceDb, revision, projectId, modelIdentityId } = input;
  const completionResult = await loadCompletion(
    serviceDb as unknown as GeometryRevisionDatabase, projectId, String(revision.source_completion_id)
  );
  if (!completionResult.ok) {
    fail({ message: completionResult.message, status: completionResult.status, code: "SOURCE_COMPLETION_UNAVAILABLE" });
  }
  const completion = completionResult.value;
  if (completion.model_identity_id !== modelIdentityId) {
    fail({ message: "Source completion belongs to a different CAD model.", status: 422, code: "SOURCE_COMPLETION_MODEL_MISMATCH" });
  }
  const solidResult = resolveCanonicalSolid(completion, projectId);
  if (!solidResult.ok) fail({ message: solidResult.message, status: solidResult.status, code: "SOURCE_ARTIFACT_MISMATCH" });
  const solid = solidResult.value;
  validateRevisionArtifactBinding(revision, solid);
  const storedResult = await verifyStoredBrep(serviceDb as unknown as GeometryRevisionDatabase, solid);
  if (!storedResult.ok) fail({ message: storedResult.message, status: storedResult.status, code: "SOURCE_DIGEST_MISMATCH" });
  const dimensions = extractCylinderDimensions({
    completion, revision, projectId, modelIdentityId, solidId: solid.id
  });
  return { completion, solid, ...dimensions };
}
