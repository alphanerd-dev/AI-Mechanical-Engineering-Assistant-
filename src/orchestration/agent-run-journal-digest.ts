import { createHash } from "node:crypto";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isJsonPrimitive(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value === "string") return true;
  if (typeof value === "boolean") return true;
  return typeof value === "number" && Number.isFinite(value);
}
function assertJsonArray(value: unknown[], seen: Set<object>): void {
  if (Object.keys(value).length !== value.length) throw new Error("Agent journal arrays must be dense JSON arrays.");
  if (Object.getOwnPropertySymbols(value).length > 0) throw new Error("Agent journal arrays cannot contain symbol keys.");
  for (const item of value) assertJsonCompatible(item, seen);
}
function assertJsonObject(value: object, seen: Set<object>): void {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error("Agent journal payload must use plain JSON objects.");
  if (Object.getOwnPropertySymbols(value).length > 0) throw new Error("Agent journal payload cannot contain symbol keys.");
  for (const item of Object.values(value as Record<string, unknown>)) assertJsonCompatible(item, seen);
}
function assertJsonCompatible(value: unknown, seen = new Set<object>()): void {
  if (isJsonPrimitive(value)) return;
  if (value === null || typeof value !== "object") throw new Error("Agent journal payload must contain finite JSON values only.");
  if (seen.has(value)) throw new Error("Agent journal payload cannot contain circular references.");
  seen.add(value);
  if (Array.isArray(value)) assertJsonArray(value, seen);
  else assertJsonObject(value, seen);
  seen.delete(value);
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (isPlainRecord(value)) {
    return Object.fromEntries(Object.entries(value)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}
export function canonicalAgentRunDigest(value: unknown): string {
  assertJsonCompatible(value);
  const serialized = JSON.stringify(canonical(value));
  if (typeof serialized !== "string") throw new Error("Agent journal payload could not be serialized.");
  return createHash("sha256").update(serialized).digest("hex");
}
