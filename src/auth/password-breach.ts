import { createHash } from "node:crypto";

const PWNED_PASSWORDS_RANGE_URL = "https://api.pwnedpasswords.com/range";
const REQUEST_TIMEOUT_MS = 3_000;

export type PasswordBreachCheck =
  | { status: "safe" }
  | { status: "compromised" }
  | { status: "unavailable" };

interface HashRangeEntry {
  suffix: string;
  count: number;
}

function getSha1Parts(password: string): { prefix: string; suffix: string } {
  // codeql[js/insufficient-password-hashing]
  // HIBP's k-anonymity range API requires SHA-1. This digest is only a lookup key;
  // it is never stored or used for authentication, and only its first five chars leave this server.
  const digest = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  return { prefix: digest.slice(0, 5), suffix: digest.slice(5) };
}

function parseHashRangeEntry(line: string): HashRangeEntry | null {
  const separator = line.indexOf(":");
  if (separator < 0) return null;

  const suffix = line.slice(0, separator).trim().toUpperCase();
  const count = Number(line.slice(separator + 1).trim());
  if (!/^[A-F0-9]{35}$/.test(suffix)) return null;
  if (!Number.isSafeInteger(count) || count < 0) return null;
  return { suffix, count };
}

function parseHashRangeResponse(responseBody: string): HashRangeEntry[] | null {
  const lines = responseBody.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return null;

  const entries = lines.map(parseHashRangeEntry);
  if (entries.some((entry) => entry === null)) return null;
  return entries as HashRangeEntry[];
}

function containsCompromisedSuffix(responseBody: string, suffix: string): boolean | null {
  const entries = parseHashRangeResponse(responseBody);
  if (entries === null) return null;
  return entries.some((entry) => entry.suffix === suffix && entry.count > 0);
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

    if (!response.ok) return { status: "unavailable" };

    const body = await response.text();
    const compromised = containsCompromisedSuffix(body, suffix);
    if (compromised === null) return { status: "unavailable" };
    return compromised ? { status: "compromised" } : { status: "safe" };
  } catch {
    return { status: "unavailable" };
  }
}
