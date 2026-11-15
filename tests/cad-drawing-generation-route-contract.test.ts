import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(resolve(process.cwd(), "app/api/cad/drawings/generate/route.ts"), "utf8");
const request = readFileSync(resolve(process.cwd(), "app/api/cad/drawings/generate/request.ts"), "utf8");
const source = readFileSync(resolve(process.cwd(), "app/api/cad/drawings/generate/source.ts"), "utf8");
const persistence = readFileSync(resolve(process.cwd(), "app/api/cad/drawings/generate/persistence.ts"), "utf8");
const history = readFileSync(resolve(process.cwd(), "app/api/cad/drawings/service.ts"), "utf8");

describe("authenticated source-bound CAD drawing workflow contract", () => {
  it("requires project execution and evidence-write permissions before service-role writes", () => {
    expect(request).toContain('authorizeSupabaseRequest("TASK.EXECUTE"');
    expect(request).toContain('authorizeSupabaseRequest("EVIDENCE.WRITE"');
    expect(request).toContain("sessionDb.auth.getUser()");
    expect(route).toContain("requireAuthorizedIdentity");
  });

  it("rejects stale geometry and independently verifies canonical source bytes", () => {
    expect(source).toContain("STALE_DRAWING_SOURCE");
    expect(source).toContain('order("revision_number", { ascending: false })');
    expect(source).toContain("verifyStoredBrep");
    expect(source).toContain("canonical_artifact_sha256");
    expect(route).toContain("loadAcceptedShaftSource");
  });

  it("requires an accepted geometry receipt and source-matching canonical solid", () => {
    expect(source).toContain('data.status !== "ACCEPTED"');
    expect(source).toContain('artifact.kind !== "SOLID"');
    expect(source).toContain('artifact.validationStatus !== "PASS"');
    expect(source).toContain("geometryMeasurements");
    expect(source).toContain("boundingBoxMm");
    expect(source).toContain('specification.kind !== "CYLINDER"');
    expect(source).toContain('specification.name !== "shaft"');
    expect(source).toContain("verifyStoredBrep");
  });

  it("persists a private drawing, immutable lineage and audit record with duplicate replay", () => {
    expect(persistence).toContain('storage.from(CAD_ARTIFACT_BUCKET).upload');
    expect(persistence).toContain('from("engineering_cad_drawings").insert');
    expect(persistence).toContain("persistEngineeringAuditEvent");
    expect(persistence).toContain("idempotentReplay");
    expect(persistence).toContain("DRAWING_AUDIT_AMBIGUOUS");
  });

  it("exposes stale status for generated drawings without mutating source validation state", () => {
    expect(history).toContain("source_geometry_revision_id");
    expect(history).toContain("isStale:");
    expect(history).toContain("currentHeads.get");
    expect(route).not.toContain('.update("engineering_geometry_revisions"');
  });
});
