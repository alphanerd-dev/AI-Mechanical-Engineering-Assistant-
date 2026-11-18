import { DrawingGenerationError } from "./errors";

export const GENERATED_DRAWING_LINEAGE_COLUMNS =
  "source_geometry_revision_id,source_artifact_id,source_artifact_sha256,source_revision_number,generator_id,generator_version,generation_parameters";

export interface GeneratedDrawingSchemaStatus {
  ready: boolean;
  status: "PASS" | "FAIL" | "BLOCKED";
  code?: "DRAWING_SCHEMA_NOT_READY" | "DRAWING_SCHEMA_UNAVAILABLE";
  detail: string;
}

type SchemaProbe = () => PromiseLike<{ error: unknown | null }>;

function errorCode(error: unknown): string | undefined {
  if (error === null || typeof error !== "object" || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

const NOT_READY_DETAIL =
  "Source-bound drawing generation is unavailable because the database is missing its generated-drawing lineage schema. Ensure supabase/migrations/20261113210000_m2_display_derivatives_and_drawings.sql and supabase/migrations/20261115130000_m2_generated_drawing_lineage.sql are applied to this environment before enabling this capability.";

export async function inspectGeneratedDrawingLineageSchema(
  probe: SchemaProbe
): Promise<GeneratedDrawingSchemaStatus> {
  try {
    const result = await probe();
    if (!result.error) {
      return {
        ready: true,
        status: "PASS",
        detail: "The source-bound generated-drawing lineage schema is available."
      };
    }

    const code = errorCode(result.error);
    if (code === "PGRST204" || code === "PGRST205" || code === "42703" || code === "42P01") {
      return {
        ready: false,
        status: "FAIL",
        code: "DRAWING_SCHEMA_NOT_READY",
        detail: NOT_READY_DETAIL
      };
    }

    return {
      ready: false,
      status: "BLOCKED",
      code: "DRAWING_SCHEMA_UNAVAILABLE",
      detail: "The generated-drawing lineage schema could not be verified. No drawing should be generated until the database check succeeds."
    };
  } catch {
    return {
      ready: false,
      status: "BLOCKED",
      code: "DRAWING_SCHEMA_UNAVAILABLE",
      detail: "The generated-drawing lineage schema could not be verified. No drawing should be generated until the database check succeeds."
    };
  }
}

export async function requireGeneratedDrawingLineageSchema(probe: SchemaProbe): Promise<void> {
  const result = await inspectGeneratedDrawingLineageSchema(probe);
  if (result.ready) return;
  throw new DrawingGenerationError({
    message: result.detail,
    status: 503,
    code: result.code ?? "DRAWING_SCHEMA_UNAVAILABLE"
  });
}