import { NextResponse } from "next/server";
import { validateGeometryRevisionV1 } from "./geometry-revision";
import { loadCompletion, resolveCanonicalSolid, verifyStoredBrep } from "./geometry-revision-persistence-source";
import { buildRevisionPayload, commitRevision, findPriorRevision, loadRevisionHead } from "./geometry-revision-persistence-store";
import { GeometryPersistenceError, GeometryRevisionDatabase, unwrap } from "./geometry-revision-persistence-types";

function responseError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function createGeometryRevisionResponse(input: {
  projectId: string; completionId: string; expectedParentRevisionId: string | null;
  actorId: string; requestId: string; db: GeometryRevisionDatabase;
}) {
  const db = input.db;
  try {
    const completion = unwrap(await loadCompletion(db, input.projectId, input.completionId));
    const solid = unwrap(resolveCanonicalSolid(completion, input.projectId));
    const digest = unwrap(await verifyStoredBrep(db, solid));
    const prior = unwrap(await findPriorRevision({ db, projectId: input.projectId, completion, solid, digest }));
    if (prior) return NextResponse.json({ revision: prior, persisted: true, idempotentReplay: true }, { status: 200 });
    const head = unwrap(await loadRevisionHead({ db, projectId: input.projectId, modelIdentityId: completion.model_identity_id }));
    if (head.id !== input.expectedParentRevisionId) {
      throw new GeometryPersistenceError("STALE_GEOMETRY_REVISION: expected parent is not the current geometry head.", 409);
    }
    const payload = buildRevisionPayload({
      projectId: input.projectId, actorId: input.actorId, requestId: input.requestId,
      completion, solid, digest, parentId: head.id, revisionNumber: head.number + 1
    });
    if (validateGeometryRevisionV1(payload.candidate).status !== "PASS") {
      throw new GeometryPersistenceError("Geometry revision contract failed server validation.", 422);
    }
    const committed = unwrap(await commitRevision({ db, payload, projectId: input.projectId, completion, solid, digest }));
    if (committed.replay) {
      return NextResponse.json({ revision: committed.revision, persisted: true, idempotentReplay: true }, { status: 200 });
    }
    return NextResponse.json({
      revision: payload.candidate, persisted: true,
      audit: { eventId: payload.auditRecord.event_id, chainSequence: committed.audit.chain_sequence }
    }, { status: 201 });
  } catch (error) {
    if (error instanceof GeometryPersistenceError) return responseError(error.message, error.status);
    return responseError("Geometry revision persistence failed without reporting success.", 503);
  }
}
