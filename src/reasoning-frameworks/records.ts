import { getReasoningFramework, type ReasoningFrameworkRegistry } from "./registry";
import { parseFrameworkReasoningRecord } from "./validation";
import type { CreateFrameworkReasoningRecordInput, FrameworkReasoningRecord } from "./types.js";

export const REASONING_RECORD_ADVISORY_LIMITATION =
  "Reasoning output is advisory and does not establish engineering correctness.";

export function createFrameworkReasoningRecord(
  input: CreateFrameworkReasoningRecordInput,
  registry?: ReasoningFrameworkRegistry
): FrameworkReasoningRecord {
  const manifest = registry
    ? registry.get(input.frameworkId, input.frameworkVersion)
    : getReasoningFramework(input.frameworkId, input.frameworkVersion);
  if (!manifest) {
    throw new Error(`Unknown or ambiguous reasoning framework version: ${input.frameworkId}${input.frameworkVersion ? `@${input.frameworkVersion}` : ""}.`);
  }
  if (Number.isNaN(Date.parse(input.createdAt))) {
    throw new Error("createdAt must be a valid date-time.");
  }
  if (input.status === "PROPOSED" && input.output === undefined) {
    throw new Error("A PROPOSED reasoning record must include output.");
  }

  const limitations = [...input.limitations];
  if (!limitations.includes(REASONING_RECORD_ADVISORY_LIMITATION)) {
    limitations.push(REASONING_RECORD_ADVISORY_LIMITATION);
  }

  const value: FrameworkReasoningRecord = {
    schemaVersion: 1,
    recordId: input.recordId,
    createdAt: input.createdAt,
    ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
    ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
    taskType: input.taskType,
    frameworkId: manifest.id,
    frameworkVersion: manifest.version,
    status: input.status,
    inputs: structuredClone(input.inputs),
    assumptions: [...input.assumptions],
    ...(input.output === undefined ? {} : { output: structuredClone(input.output) }),
    limitations,
    evidenceReferences: [...input.evidenceReferences],
    ...(input.provenance === undefined ? {} : { provenance: structuredClone(input.provenance) }),
    validationStatus: "NOT_PERFORMED",
    requiredGates: [...input.requiredGates]
  };

  return parseFrameworkReasoningRecord(value);
}
