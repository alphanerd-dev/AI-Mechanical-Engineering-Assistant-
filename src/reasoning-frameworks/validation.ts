import Ajv2020 from "ajv/dist/2020";
import type { AnySchema, ValidateFunction } from "ajv";
import frameworkManifestSchema from "./schemas/framework-manifest.schema.json";
import skillManifestSchema from "./schemas/skill-manifest.schema.json";
import reasoningRecordSchema from "./schemas/reasoning-record.schema.json";
import type { FrameworkReasoningRecord, ReasoningFrameworkManifest, SkillManifest } from "./types.js";

const ajv = new Ajv2020({ allErrors: true, strict: true, validateSchema: true });
const frameworkManifestValidator = ajv.compile(frameworkManifestSchema as AnySchema);
const skillManifestValidator = ajv.compile(skillManifestSchema as AnySchema);
const reasoningRecordValidator = ajv.compile(reasoningRecordSchema as AnySchema);

function collectErrors(validator: ValidateFunction, value: unknown): string[] {
  if (validator(value)) return [];
  return (validator.errors ?? []).map((error) =>
    `${error.instancePath || "/"} ${error.message ?? "failed schema validation"}`
  );
}

export function validateFrameworkManifest(value: unknown): string[] {
  return collectErrors(frameworkManifestValidator, value);
}

export function validateSkillManifest(value: unknown): string[] {
  return collectErrors(skillManifestValidator, value);
}

export function validateFrameworkReasoningRecord(value: unknown): string[] {
  const errors = collectErrors(reasoningRecordValidator, value);
  if (errors.length || typeof value !== "object" || value === null || Array.isArray(value)) return errors;
  const record = value as Record<string, unknown>;
  if (typeof record.createdAt === "string" && Number.isNaN(Date.parse(record.createdAt))) {
    errors.push("/createdAt must be a valid date-time.");
  }
  return errors;
}

export function parseFrameworkManifest(value: unknown): ReasoningFrameworkManifest {
  const errors = validateFrameworkManifest(value);
  if (errors.length) throw new Error("Invalid framework manifest: " + errors.join("; "));
  return structuredClone(value) as ReasoningFrameworkManifest;
}

export function parseSkillManifest(value: unknown): SkillManifest {
  const errors = validateSkillManifest(value);
  if (errors.length) throw new Error("Invalid skill manifest: " + errors.join("; "));
  return structuredClone(value) as SkillManifest;
}

export function parseFrameworkReasoningRecord(value: unknown): FrameworkReasoningRecord {
  const errors = validateFrameworkReasoningRecord(value);
  if (errors.length) throw new Error("Invalid reasoning record: " + errors.join("; "));
  return structuredClone(value) as FrameworkReasoningRecord;
}
