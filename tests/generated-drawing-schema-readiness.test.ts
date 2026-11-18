import { describe, expect, it } from "vitest";
import { DrawingGenerationError } from "../app/api/cad/drawings/generate/errors";
import {
  inspectGeneratedDrawingLineageSchema,
  requireGeneratedDrawingLineageSchema
} from "../app/api/cad/drawings/generate/schema";

describe("generated drawing lineage schema readiness", () => {
  it("passes when all generated lineage columns are available", async () => {
    await expect(inspectGeneratedDrawingLineageSchema(async () => ({ error: null }))).resolves.toMatchObject({
      ready: true,
      status: "PASS"
    });
  });

  it.each(["PGRST204", "PGRST205", "42703", "42P01"])(
    "reports migration not ready for missing schema error %s",
    async (code) => {
      const result = await inspectGeneratedDrawingLineageSchema(async () => ({ error: { code } }));
      expect(result).toMatchObject({
        ready: false,
        status: "FAIL",
        code: "DRAWING_SCHEMA_NOT_READY"
      });
      expect(result.detail).toContain("20261115130000_m2_generated_drawing_lineage.sql");
      expect(result.detail).not.toContain("20261113210000_m2_display_derivatives_and_drawings.sql");
    }
  );

  it("does not mislabel transient database errors as an unapplied migration", async () => {
    await expect(inspectGeneratedDrawingLineageSchema(async () => ({ error: { code: "PGRST003" } }))).resolves.toMatchObject({
      ready: false,
      status: "BLOCKED",
      code: "DRAWING_SCHEMA_UNAVAILABLE"
    });
  });

  it("fails closed when the schema probe throws", async () => {
    await expect(inspectGeneratedDrawingLineageSchema(async () => { throw new Error("database unavailable"); })).resolves.toMatchObject({
      ready: false,
      status: "BLOCKED",
      code: "DRAWING_SCHEMA_UNAVAILABLE"
    });
  });

  it("stops drawing persistence with a typed 503 when the migration is missing", async () => {
    await expect(requireGeneratedDrawingLineageSchema(async () => ({ error: { code: "PGRST204" } })))
      .rejects.toBeInstanceOf(DrawingGenerationError);
    await expect(requireGeneratedDrawingLineageSchema(async () => ({ error: { code: "PGRST204" } })))
      .rejects.toMatchObject({ status: 503, code: "DRAWING_SCHEMA_NOT_READY" });
  });
});