import { createHash } from "node:crypto";
import { isCompromisedPasswordRange } from "./pwned-password-range.js";

const PWNED_PASSWORDS_RANGE_URL = "https://api.pwnedpasswords.com/range";
const REQUEST_TIMEOUT_MS = 3_000;

export type PasswordBreachCheck =
  | { status: "safe" }
  | { status: "compromised" }
  | { status: "unavailable" };

function getSha1Parts(password: string): { prefix: string; suffix: string } {
  // HIBP's k-anonymity range API requires SHA-1. This digest is only a lookup key;
  // it is never stored or used for authentication, and only its first five chars leave this server.
  // codeql[js/insufficient-password-hashing]
  const digest = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  return { prefix: digest.slice(0, 5), suffix: digest.slice(5) };
}

async function fetchPasswordRange(prefix: string, fetcher: typeof fetch): Promise<string | null> {
  try {
    const response = await fetcher(`${PWNED_PASSWORDS_RANGE_URL}/${prefix}`, {
      method: "GET",
      headers: {
        "Add-Padding": "true",
        "User-Agent": "AI-Mechanical-Engineering-Assistant/1.0",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

/**
 * Uses HIBP's Pwned Passwords k-anonymity range API.
 * Only the first five SHA-1 characters leave this server; the full hash and
 * password are compared locally. API failures are fail-closed for new passwords.
 */
export async function checkPasswordBreach(
  password: string,
  fetcher: typeof fetch = fetch,
): Promise<PasswordBreachCheck> {
  const { prefix, suffix } = getSha1Parts(password);
  const rangeBody = await fetchPasswordRange(prefix, fetcher);
  if (rangeBody === null) return { status: "unavailable" };

  const compromised = isCompromisedPasswordRange(rangeBody, suffix);
  if (compromised === null) return { status: "unavailable" };
  return compromised ? { status: "compromised" } : { status: "safe" };
}
