import { NextResponse } from "next/server";
import { validateGeometryRevisionV1 } from "./geometry-revision";
import { loadCompletion, resolveCanonicalSolid, verifyStoredBrep } from "./geometry-revision-persistence-source";
import { buildRevisionPayload, commitRevision, findPriorRevision, loadRevisionHead } from "./geometry-revision-persistence-store";
import { GeometryPersistenceError, unwrap } from "./geometry-revision-persistence-types";
import type { CanonicalSolid, Completion, GeometryRevisionDatabase, Row } from "./geometry-revision-persistence-types";
import type { RevisionHead } from "./geometry-revision-persistence-store";

function responseError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
type PreparedRevision =
  | { completion: Completion; solid: CanonicalSolid; digest: string; head: RevisionHead }
  | { replay: Row };

async function prepareRevision(input: {
  db: GeometryRevisionDatabase; projectId: string; completionId: string; expectedParentRevisionId: string | null;
}): Promise<PreparedRevision> {
  const completion = unwrap(await loadCompletion(input.db, input.projectId, input.completionId));
  const solid = unwrap(resolveCanonicalSolid(completion, input.projectId));
  const digest = unwrap(await verifyStoredBrep(input.db, solid));
  const prior = unwrap(await findPriorRevision({
    db: input.db, projectId: input.projectId, completion, solid, digest
  }));
  if (prior) return { replay: prior };
  const head = unwrap(await loadRevisionHead({
    db: input.db, projectId: input.projectId, modelIdentityId: completion.model_identity_id
  }));
  if (head.id !== input.expectedParentRevisionId) {
    throw new GeometryPersistenceError("STALE_GEOMETRY_REVISION: expected parent is not the current geometry head.", 409);
  }
  return { completion, solid, digest, head };
}

export async function createGeometryRevisionResponse(input: {
  projectId: string; completionId: string; expectedParentRevisionId: string | null;
  actorId: string; requestId: string; db: GeometryRevisionDatabase;
}) {
  try {
    const prepared = await prepareRevision(input);
    if ("replay" in prepared) {
      return NextResponse.json({ revision: prepared.replay, persisted: true, idempotentReplay: true }, { status: 200 });
    }
    const payload = buildRevisionPayload({
      projectId: input.projectId, actorId: input.actorId, requestId: input.requestId,
      completion: prepared.completion, solid: prepared.solid, digest: prepared.digest,
      parentId: prepared.head.id, revisionNumber: prepared.head.number + 1
    });
    if (validateGeometryRevisionV1(payload.candidate).status !== "PASS") {
      throw new GeometryPersistenceError("Geometry revision contract failed server validation.", 422);
    }
    const committed = unwrap(await commitRevision({
      db: input.db, payload, projectId: input.projectId, completion: prepared.completion,
      solid: prepared.solid, digest: prepared.digest
    }));
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
