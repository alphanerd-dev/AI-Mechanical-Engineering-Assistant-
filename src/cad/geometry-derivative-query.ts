export interface CADGeometryDerivativeListQuery {
  projectId: string;
  modelIdentityId: string | null;
  artifactId: string | null;
  includeSignedUrls: boolean;
}

type QueryFailure = (message: string, status: number) => never;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseCADGeometryDerivativeListQuery(
  request: Request,
  fail: QueryFailure
): CADGeometryDerivativeListQuery {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId")?.trim();
  const modelIdentityId = url.searchParams.get("modelIdentityId")?.trim() ?? null;
  const artifactId = url.searchParams.get("artifactId")?.trim() ?? null;
  const includeSignedUrls = url.searchParams.get("includeSignedUrls") !== "false";

  if (!projectId || !UUID.test(projectId)) {
    fail("A registered project UUID and optional model identity UUID are required.", 400);
  }
  if (modelIdentityId && !UUID.test(modelIdentityId)) {
    fail("A registered project UUID and optional model identity UUID are required.", 400);
  }
  if (artifactId && !UUID.test(artifactId)) {
    fail("A valid CAD display derivative artifact UUID is required.", 400);
  }

  return { projectId, modelIdentityId, artifactId, includeSignedUrls };
}
