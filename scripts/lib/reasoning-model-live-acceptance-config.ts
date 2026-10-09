export class AcceptanceConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AcceptanceConfigurationError";
  }
}

export interface LiveProviderConfiguration {
  endpoint: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
}

/**
 * Validate the live acceptance environment without logging endpoint credentials
 * or secret values. Unlike runtime defaults, this acceptance gate requires the
 * timeout and API key to be explicitly configured.
 */
export function validateLiveProviderConfiguration(
  env: Record<string, string | undefined>
): LiveProviderConfiguration {
  const requiredKeys = [
    "ENGINEERING_REASONING_MODEL_URL",
    "ENGINEERING_REASONING_MODEL_NAME",
    "ENGINEERING_REASONING_MODEL_API_KEY",
    "ENGINEERING_REASONING_MODEL_TIMEOUT_MS"
  ] as const;
  const missing = requiredKeys.filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    throw new AcceptanceConfigurationError(
      `Missing required configuration: ${missing.join(", ")}.`
    );
  }

  const endpointValue = env.ENGINEERING_REASONING_MODEL_URL!.trim();
  let endpoint: URL;
  try {
    endpoint = new URL(endpointValue);
  } catch {
    throw new AcceptanceConfigurationError(
      "ENGINEERING_REASONING_MODEL_URL must be an absolute HTTPS URL."
    );
  }
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) {
    throw new AcceptanceConfigurationError(
      "ENGINEERING_REASONING_MODEL_URL must use HTTPS without embedded credentials."
    );
  }

  const timeoutValue = Number(env.ENGINEERING_REASONING_MODEL_TIMEOUT_MS);
  if (!Number.isInteger(timeoutValue) || timeoutValue < 1_000 || timeoutValue > 120_000) {
    throw new AcceptanceConfigurationError(
      "ENGINEERING_REASONING_MODEL_TIMEOUT_MS must be an integer from 1000 to 120000."
    );
  }

  return {
    endpoint: endpointValue,
    model: env.ENGINEERING_REASONING_MODEL_NAME!.trim(),
    apiKey: env.ENGINEERING_REASONING_MODEL_API_KEY!.trim(),
    timeoutMs: timeoutValue
  };
}
