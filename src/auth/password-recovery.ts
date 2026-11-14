export const MINIMUM_PASSWORD_LENGTH = 10;

export type PasswordUpdateValidation =
  | { ok: true; password: string }
  | { ok: false; reason: "missing-fields" | "password-policy" | "password-mismatch" };

export function validatePasswordUpdate(
  password: unknown,
  confirmation: unknown,
): PasswordUpdateValidation {
  if (
    typeof password !== "string" ||
    typeof confirmation !== "string" ||
    !password ||
    !confirmation
  ) {
    return { ok: false, reason: "missing-fields" };
  }

  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    return { ok: false, reason: "password-policy" };
  }

  if (password !== confirmation) {
    return { ok: false, reason: "password-mismatch" };
  }

  return { ok: true, password };
}

/**
 * Only destinations required by the first-party auth flows are accepted.
 * This prevents an attacker from turning the PKCE callback into an open redirect.
 */
export function getSafeAuthCallbackDestination(candidate: string | null): string {
  if (candidate === "/update-password" || candidate === "/login?confirmed=1") {
    return candidate;
  }
  return "/login";
}
