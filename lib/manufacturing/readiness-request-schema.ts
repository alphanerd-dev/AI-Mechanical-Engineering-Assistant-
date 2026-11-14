import { z } from "zod";
import type { ManufacturingReadinessRequest } from "../../src/manufacturing/readiness";

const finite = z.number().finite();
const process = z.enum(["MACHINING","ADDITIVE","SHEET_METAL","WELDING","CASTING","FORMING","ASSEMBLY"]);
const processPlan = z.object({
  id: z.string().min(1), projectId: z.string().uuid(), name: z.string().min(1),
  partArtifactIds: z.array(z.string().min(1)), requirementIds: z.array(z.string().min(1)),
  operations: z.array(z.object({
    id: z.string().min(1), sequence: finite, name: z.string().min(1), process,
    workCenter: z.string().optional(), setup: z.string().optional(),
    parameters: z.record(z.string(), z.union([z.string(), finite, z.boolean()])).optional(),
    predecessorIds: z.array(z.string().min(1)).optional(),
    acceptanceCriteria: z.array(z.string().min(1))
  }).strict()),
  status: z.enum(["DRAFT","READY","BLOCKED","RELEASED"]),
  assumptions: z.array(z.string()), notes: z.array(z.string()).optional()
}).strict();
const bom = z.object({
  id: z.string().min(1), projectId: z.string().uuid(), revision: z.string().min(1),
  components: z.array(z.object({
    partNumber: z.string(), name: z.string(), revision: z.string(),
    quantity: finite, unit: z.string(), artifactId: z.string().optional()
  }).strict())
}).strict();
const inspection = z.object({
  criterion: z.object({
    id: z.string().min(1), name: z.string(), characteristic: z.string(), unit: z.string(),
    nominal: finite.optional(), tolerance: finite.optional(), lowerLimit: finite.optional(),
    upperLimit: finite.optional(), method: z.string()
  }).strict(),
  result: z.object({
    id: z.string().min(1), criterionId: z.string().min(1), measuredValue: finite.optional(),
    unit: z.string().optional(), instrument: z.string().optional(), operator: z.string().optional(),
    notes: z.string().optional()
  }).strict()
}).strict();
const metrics = z.object({
  solidCount: finite.optional(), volumeMm3: finite.optional(), surfaceAreaMm2: finite.optional(),
  boundingBoxMm: z.object({ x: finite, y: finite, z: finite }).strict().optional(),
  watertight: z.boolean().optional(), minWallThicknessMm: finite.optional(),
  maxOverhangDeg: finite.optional(), triangleCount: finite.optional()
}).strict();
const dfmRule = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("MIN_WALL_THICKNESS_MM"), minimumMm: finite }).strict(),
  z.object({ kind: z.literal("MAX_OVERHANG_DEG"), maximumDeg: finite }).strict(),
  z.object({ kind: z.literal("REQUIRE_WATERTIGHT"), required: z.boolean() }).strict(),
  z.object({ kind: z.literal("MAX_ENVELOPE_MM"), axis: z.enum(["x","y","z"]), maximumMm: finite }).strict(),
  z.object({ kind: z.literal("MIN_SOLID_COUNT"), minimum: finite }).strict()
]);

const requestSchema = z.object({
  releaseId: z.string().min(1).max(160), metrics, dfmRules: z.array(dfmRule),
  process, processPlan, bom, requiredArtifactIds: z.array(z.string().min(1)), inspection
}).strict();

export function parseManufacturingReadinessRequest(value: unknown): ManufacturingReadinessRequest | null {
  const parsed = requestSchema.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data as ManufacturingReadinessRequest;
}
