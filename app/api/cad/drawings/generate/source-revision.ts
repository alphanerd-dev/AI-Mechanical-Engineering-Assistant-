import type { Row } from "../../../../../src/cad/geometry-revision-persistence-types";
import { fail } from "./request";
import { isRecord } from "./source-validation";

type ServiceDb = ReturnType<typeof import("../../../../../lib/supabase/service").createServiceRoleClient>;
interface GeometryRevisionHeadInput {
  projectId: string; modelIdentityId: string; geometryRevisionId: string;
}
async function queryLatestGeometryRevision(serviceDb: ServiceDb, input: GeometryRevisionHeadInput) {
  return serviceDb.from("engineering_geometry_revisions").select("*")
    .eq("project_id", input.projectId).eq("model_identity_id", input.modelIdentityId)
    .order("revision_number", { ascending: false }).limit(1);
}
function requireRequestedHead(input: { data: unknown; error: unknown; requestedId: string }): Row {
  if (input.error) fail({ message: "Current accepted geometry revision could not be loaded.", status: 503, code: "GEOMETRY_REVISION_UNAVAILABLE" });
  if (!Array.isArray(input.data)) fail({ message: "Current accepted geometry revision could not be loaded.", status: 503, code: "GEOMETRY_REVISION_UNAVAILABLE" });
  if (input.data.length === 0) fail({ message: "Current accepted geometry revision could not be loaded.", status: 503, code: "GEOMETRY_REVISION_UNAVAILABLE" });
  if (!isRecord(input.data[0])) fail({ message: "Current accepted geometry revision could not be loaded.", status: 503, code: "GEOMETRY_REVISION_UNAVAILABLE" });
  const revision = input.data[0];
  if (revision.id !== input.requestedId) {
    fail({ message: "The requested drawing source is stale. Reload the current geometry revision before generating a drawing.", status: 409, code: "STALE_DRAWING_SOURCE" });
  }
  return revision;
}
export async function loadCurrentGeometryRevision(serviceDb: ServiceDb, input: GeometryRevisionHeadInput): Promise<Row> {
  const result = await queryLatestGeometryRevision(serviceDb, input);
  return requireRequestedHead({ data: result.data, error: result.error, requestedId: input.geometryRevisionId });
}
