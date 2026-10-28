import { createHash } from "node:crypto";

export const PROJECT_CREATION_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** Missing keys preserve compatibility for non-retrying callers; supplied keys must be unambiguous. */
export function parseProjectCreationIdempotencyKey(value: string | null): string | undefined {
  if (value === null) return undefined;
  const key = value.trim();
  if (!PROJECT_CREATION_IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new Error("Idempotency-Key must contain 1–128 letters, digits, dots, underscores, colons or hyphens.");
  }
  return key;
}

/** Bind a request key to the exact normalized user-visible creation payload. */
export function hashProjectCreationPayload(name: string, problemStatement: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ name, problemStatement }), "utf8")
    .digest("hex");
}
