import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261115130000_m2_generated_drawing_lineage.sql"), "utf8").toLowerCase();

describe("M2 generated drawing lineage migration", () => {
  it("adds exact geometry revision, artifact digest and generator provenance", () => {
    expect(sql).toContain("source_geometry_revision_id uuid");
    expect(sql).toContain("source_artifact_sha256 text");
    expect(sql).toContain("source_revision_number bigint");
    expect(sql).toContain("generator_id text");
    expect(sql).toContain("generator_version text");
    expect(sql).toContain("generation_parameters jsonb");
    expect(sql).toContain("engineering_geometry_revisions(project_id, model_identity_id, id)");
  });

  it("serializes generated drawing writes against the current geometry head", () => {
    expect(sql).toContain("enforce_generated_cad_drawing_source");
    expect(sql).toContain("for update");
    expect(sql).toContain("stale_drawing_source");
    expect(sql).toContain("canonical_artifact_sha256");
    expect(sql).toContain("source_revision_number");
  });

  it("makes exact generated drawing replays idempotent without affecting uploaded drawings", () => {
    expect(sql).toContain("engineering_cad_drawings_generated_idempotency_idx");
    expect(sql).toContain("get_current_geometry_revision_heads");
    expect(sql).toContain("security definer");
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("engineering_project_memberships");
    expect(sql).toContain("membership.user_id = v_user_id");
    expect(sql).toContain("distinct on (revision.model_identity_id)");
    expect(sql).toContain("where source_geometry_revision_id is not null");
    expect(sql).toContain("generator_id is null");
    expect(sql).toContain("generator_id is not null");
  });
});
