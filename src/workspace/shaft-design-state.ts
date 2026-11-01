import { sha256Json } from "../artifacts/calculation-artifact.js";
import {
  calculateShaftStaticDesign,
  type ShaftStaticDesignInput,
  type ShaftStaticDesignResult
} from "../engineering/shaft-static-design.js";

export const SHAFT_DESIGN_WORKSPACE_SCHEMA_VERSION = 1 as const;

export interface ShaftDesignWorkspaceState {
  schemaVersion: typeof SHAFT_DESIGN_WORKSPACE_SCHEMA_VERSION;
  designRevision: number;
  sourceWorkspaceRevision: number;
  workspaceRevision: number;
  updatedAt: string;
  updatedBy: string;
  idempotencyKey: string;
  artifactId: string;
  input: ShaftStaticDesignInput;
  result: ShaftStaticDesignResult;
  inputSha256: string;
  resultSha256: string;
}

export function createShaftDesignWorkspaceState(input: {
  designRevision: number;
  sourceWorkspaceRevision: number;
  workspaceRevision: number;
  updatedAt: string;
  updatedBy: string;
  idempotencyKey: string;
  artifactId: string;
  shaftInput: ShaftStaticDesignInput;
  result: ShaftStaticDesignResult;
}): ShaftDesignWorkspaceState {
  return {
    schemaVersion: SHAFT_DESIGN_WORKSPACE_SCHEMA_VERSION,
    designRevision: input.designRevision,
    sourceWorkspaceRevision: input.sourceWorkspaceRevision,
    workspaceRevision: input.workspaceRevision,
    updatedAt: input.updatedAt,
    updatedBy: input.updatedBy,
    idempotencyKey: input.idempotencyKey,
    artifactId: input.artifactId,
    input: input.shaftInput,
    result: input.result,
    inputSha256: sha256Json(input.shaftInput),
    resultSha256: sha256Json(input.result)
  };
}

/** Recompute on load so persisted design state cannot silently drift from its declared inputs. */
export function validateShaftDesignWorkspaceState(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["Shaft design state must be an object."];
  const state = value as Partial<ShaftDesignWorkspaceState>;
  const errors: string[] = [];
  if (state.schemaVersion !== SHAFT_DESIGN_WORKSPACE_SCHEMA_VERSION) errors.push("Shaft design state schema version is unsupported.");
  for (const field of ["designRevision", "sourceWorkspaceRevision", "workspaceRevision"] as const) {
    if (!Number.isSafeInteger(state[field]) || Number(state[field]) < 1) errors.push(field + " must be a positive safe integer.");
  }
  if (typeof state.updatedAt !== "string" || Number.isNaN(Date.parse(state.updatedAt))) errors.push("updatedAt must be a valid date.");
  for (const field of ["updatedBy", "idempotencyKey", "artifactId"] as const) {
    if (typeof state[field] !== "string" || !state[field].trim()) errors.push(field + " is required.");
  }
  if (!state.input || typeof state.input !== "object" || Array.isArray(state.input)) errors.push("Shaft design input is required.");
  if (!state.result || typeof state.result !== "object" || Array.isArray(state.result)) errors.push("Shaft design result is required.");
  if (typeof state.inputSha256 !== "string" || !/^[a-f0-9]{64}$/.test(state.inputSha256)) errors.push("inputSha256 is invalid.");
  if (typeof state.resultSha256 !== "string" || !/^[a-f0-9]{64}$/.test(state.resultSha256)) errors.push("resultSha256 is invalid.");
  if (errors.length) return errors;
  try {
    if (sha256Json(state.input) !== state.inputSha256) errors.push("Persisted shaft design inputs do not match inputSha256.");
    if (sha256Json(state.result) !== state.resultSha256) errors.push("Persisted shaft design result does not match resultSha256.");
    const recomputed = calculateShaftStaticDesign(state.input as ShaftStaticDesignInput);
    if (sha256Json(recomputed) !== state.resultSha256) errors.push("Persisted shaft design result does not match deterministic recomputation.");
    const result = state.result as ShaftStaticDesignResult;
    if (result.input && sha256Json(result.input) !== state.inputSha256) errors.push("Shaft design result input does not match the persisted design input.");
    if (Number(state.sourceWorkspaceRevision) >= Number(state.workspaceRevision)) errors.push("sourceWorkspaceRevision must be earlier than workspaceRevision.");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Shaft design state could not be verified.");
  }
  return errors;
}
