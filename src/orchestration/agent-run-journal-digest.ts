import { createHash } from "node:crypto";

function normalizeArray(value: unknown[], seen: Set<object>): unknown[] {
  if (Object.keys(value).length !== value.length) throw new Error("Agent journal arrays must be dense JSON arrays.");
  if (Object.getOwnPropertySymbols(value).length > 0) throw new Error("Agent journal arrays cannot contain symbol keys.");
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      throw new Error("Agent journal arrays must be dense JSON arrays.");
    }
  }
  return value.map(item => normalizeJson(item, seen));
}
function normalizeObject(value: object, seen: Set<object>): Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype) {
    if (prototype !== null) throw new Error("Agent journal payload must use plain JSON objects.");
  }
  if (Object.getOwnPropertySymbols(value).length > 0) throw new Error("Agent journal payload cannot contain symbol keys.");
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return Object.fromEntries(entries.map(([key, item]) => [key, normalizeJson(item, seen)]));
}
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
    if (Array.isArray(value)) return normalizeArray(value, seen);
    return normalizeObject(value, seen);
  } finally {
    seen.delete(value);
  }
}
function normalizeJson(value: unknown, seen: Set<object>): unknown {
  if (isJsonScalar(value)) return value;
  if (typeof value === "number") return normalizeNumber(value);
  if (typeof value !== "object") throw new Error("Agent journal payload must contain finite JSON values only.");
  return normalizeContainer(value, seen);
}
export function canonicalAgentRunDigest(value: unknown): string {
  const serialized = JSON.stringify(normalizeJson(value, new Set<object>()));
  if (typeof serialized !== "string") throw new Error("Agent journal payload could not be serialized.");
  return createHash("sha256").update(serialized).digest("hex");
}
