import { createHash } from "node:crypto";
import { normalizeArray } from "./agent-run-journal-digest-array.js";
import { normalizeObject } from "./agent-run-journal-digest-object.js";

function isJsonScalar(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value === "string") return true;
  return typeof value === "boolean";
}
function normalizeNumber(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Agent journal payload must contain finite JSON values only.");
  return value;
}
function normalizeContainer(value: object, seen: Set<object>): unknown {
  if (seen.has(value)) throw new Error("Agent journal payload cannot contain circular references.");
  seen.add(value);
  try {
    if (Array.isArray(value)) return normalizeArray(value, seen, normalizeJson);
    return normalizeObject(value, seen, normalizeJson);
  } finally {
    seen.delete(value);
  }
}
function normalizeJson(value: unknown, seen: Set<object>): unknown {
  if (isJsonScalar(value)) return value;
  if (typeof value === "number") return normalizeNumber(value);
  if (value === null) return null;
  if (typeof value !== "object") throw new Error("Agent journal payload must contain finite JSON values only.");
  return normalizeContainer(value, seen);
}
export function canonicalAgentRunDigest(value: unknown): string {
  const serialized = JSON.stringify(normalizeJson(value, new Set<object>()));
  if (typeof serialized !== "string") throw new Error("Agent journal payload could not be serialized.");
  return createHash("sha256").update(serialized).digest("hex");
}
