export const MINIMUM_PASSWORD_LENGTH = 10;

export type PasswordUpdateValidation =
  | { ok: true; password: string }
  | { ok: false; reason: "missing-fields" | "password-policy" | "password-mismatch" };

function isMissingPasswordField(value: unknown): boolean {
  if (typeof value !== "string") return true;
  return value.length === 0;
}

function getMissingFieldsValidation(
  password: unknown,
  confirmation: unknown,
): PasswordUpdateValidation | null {
  if (isMissingPasswordField(password)) {
    return { ok: false, reason: "missing-fields" };
  }
  if (isMissingPasswordField(confirmation)) {
    return { ok: false, reason: "missing-fields" };
  }
  return null;
}

function getPasswordPolicyValidation(
  password: string,
  confirmation: string,
): PasswordUpdateValidation | null {
  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    return { ok: false, reason: "password-policy" };
  }
  if (password !== confirmation) {
    return { ok: false, reason: "password-mismatch" };
  }
  return null;
}

export function validatePasswordUpdate(
  password: unknown,
  confirmation: unknown,
): PasswordUpdateValidation {
  const missingFields = getMissingFieldsValidation(password, confirmation);
  if (missingFields) return missingFields;

  const passwordValue = password as string;
  const confirmationValue = confirmation as string;
  return getPasswordPolicyValidation(passwordValue, confirmationValue) ?? {
    ok: true,
    password: passwordValue,
  };
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

export function isSupportedAuthCallbackOtpType(
  candidate: string | null,
): candidate is "signup" | "recovery" {
  return candidate === "signup" || candidate === "recovery";
}
