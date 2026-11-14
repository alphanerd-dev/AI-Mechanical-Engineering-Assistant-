import { createHash } from "node:crypto";

const PWNED_PASSWORDS_RANGE_URL = "https://api.pwnedpasswords.com/range";
const REQUEST_TIMEOUT_MS = 3_000;

export type PasswordBreachCheck =
  | { status: "safe" }
  | { status: "compromised" }
  | { status: "unavailable" };

function getSha1Parts(password: string): { prefix: string; suffix: string } {
  const digest = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  return { prefix: digest.slice(0, 5), suffix: digest.slice(5) };
}

function containsCompromisedSuffix(responseBody: string, suffix: string): boolean {
  return responseBody.split(/\r?\n/).some((line) => {
    const separator = line.indexOf(":");
    if (separator < 0) return false;

    const candidate = line.slice(0, separator).trim().toUpperCase();
    const count = Number(line.slice(separator + 1).trim());
    return candidate === suffix && Number.isFinite(count) && count > 0;
  });
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
    return containsCompromisedSuffix(body, suffix)
      ? { status: "compromised" }
      : { status: "safe" };
  } catch {
    return { status: "unavailable" };
  }
}
