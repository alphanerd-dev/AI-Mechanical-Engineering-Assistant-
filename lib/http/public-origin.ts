const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const INTERNAL_HOSTS = new Set(["0.0.0.0", "::", "[::]"]);

function parseOrigin(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;

  try {
    const url = new URL(/^https?:\/\//i.test(candidate) ? candidate : "https://" + candidate);
    const hostname = url.hostname.toLowerCase();
    const isLocalHttp = url.protocol === "http:" && LOCAL_HOSTS.has(hostname);

    if (url.username || url.password) return null;
    if (url.protocol !== "https:" && !isLocalHttp) return null;
    if (INTERNAL_HOSTS.has(hostname) || hostname.endsWith(".internal")) return null;

    return url.origin;
  } catch {
    return null;
  }
}

function isKnownPlatformHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host.endsWith(".onrender.com") || host.endsWith(".vercel.app");
}

function isAllowedForwardedHost(host: string): boolean {
  try {
    const parsed = new URL("https://" + host);
    return parsed.host === host && (
      isKnownPlatformHost(parsed.hostname) ||
      LOCAL_HOSTS.has(parsed.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * Resolve a browser-facing URL without using the app container's bind address.
 * Explicit deployment origins are preferred. Only known platform hosts are
 * accepted from proxy headers so an untrusted Host header cannot redirect users
 * to an arbitrary domain.
 */
export function getPublicUrl(path: string, request: Pick<Request, "url" | "headers">): URL {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Authentication redirects must use an absolute app-relative path.");
  }

  const configuredOrigins = [
    process.env.APP_BASE_URL,
    process.env.RENDER_EXTERNAL_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : undefined,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL
      : undefined,
  ];

  let origin: string | null = null;
  for (const candidate of configuredOrigins) {
    origin = parseOrigin(candidate);
    if (origin) break;
  }

  if (!origin) {
    try {
      const requestUrl = new URL(request.url);
      if (
        (isKnownPlatformHost(requestUrl.hostname) || LOCAL_HOSTS.has(requestUrl.hostname)) &&
        !INTERNAL_HOSTS.has(requestUrl.hostname)
      ) {
        origin = parseOrigin(requestUrl.origin);
      }
    } catch {
      // Try trusted proxy headers below.
    }
  }

  if (!origin) {
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    if (forwardedHost && isAllowedForwardedHost(forwardedHost)) {
      const isLocal = LOCAL_HOSTS.has(new URL("https://" + forwardedHost).hostname);
      const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
      const scheme = isLocal && forwardedProto === "http" ? "http://" : "https://";
      origin = parseOrigin(scheme + forwardedHost);
    }
  }

  if (!origin) {
    throw new Error("A trusted public application origin is not configured for authentication redirects.");
  }

  const target = new URL(path, origin);
  if (target.origin !== origin) {
    throw new Error("Authentication redirect escaped the configured application origin.");
  }
  return target;
}
