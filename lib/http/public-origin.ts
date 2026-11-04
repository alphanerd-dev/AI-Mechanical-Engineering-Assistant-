const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const INTERNAL_HOSTS = new Set(["0.0.0.0", "::", "[::]"]);

function parseOrigin(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;

  try {
    const url = new URL(/^https?:\\/\\//i.test(candidate) ? candidate : "https://" + candidate);
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

function getRequestUrlOrigin(
  request: Pick<Request, "url">,
  allowLocalHosts: boolean
): string | null {
  try {
    const requestUrl = new URL(request.url);
    const hostname = requestUrl.hostname.toLowerCase();
    const trustedHost = isKnownPlatformHost(hostname) ||
      (allowLocalHosts && LOCAL_HOSTS.has(hostname));

    if (!trustedHost || INTERNAL_HOSTS.has(hostname)) return null;
    return parseOrigin(requestUrl.origin);
  } catch {
    return null;
  }
}

function getForwardedOrigin(
  request: Pick<Request, "headers">,
  allowLocalHosts: boolean
): string | null {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (!forwardedHost || !isAllowedForwardedHost(forwardedHost)) return null;

  const hostname = new URL("https://" + forwardedHost).hostname.toLowerCase();
  if (!allowLocalHosts && !isKnownPlatformHost(hostname)) return null;

  const isLocal = LOCAL_HOSTS.has(hostname);
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const scheme = isLocal && forwardedProto === "http" ? "http://" : "https://";
  return parseOrigin(scheme + forwardedHost);
}

function getRequestOrigin(
  request: Pick<Request, "url" | "headers">,
  allowLocalHosts = true
): string | null {
  return getRequestUrlOrigin(request, allowLocalHosts) ??
    getForwardedOrigin(request, allowLocalHosts);
}

function firstValidOrigin(candidates: Array<string | undefined>): string | null {
  for (const candidate of candidates) {
    const origin = parseOrigin(candidate);
    if (origin) return origin;
  }
  return null;
}

function getConfiguredOrigin(
  request: Pick<Request, "url" | "headers">,
  isVercelPreview: boolean
): string | null {
  const vercelDeploymentOrigin = process.env.VERCEL_URL
    ? "https://" + process.env.VERCEL_URL
    : undefined;
  const previewRequestOrigin = isVercelPreview
    ? getRequestOrigin(request, false) ?? undefined
    : undefined;

  const candidates = [
    process.env.APP_BASE_URL,
    process.env.RENDER_EXTERNAL_URL,
    ...(isVercelPreview ? [previewRequestOrigin, vercelDeploymentOrigin] : []),
    process.env.NEXT_PUBLIC_SITE_URL,
    ...(!isVercelPreview ? [vercelDeploymentOrigin] : []),
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL
      : undefined,
  ];

  return firstValidOrigin(candidates);
}

/**
 * Resolve a browser-facing URL without using the app container's bind address.
 * Explicit deployment origins are preferred. Only known platform hosts are
 * accepted from proxy headers so an untrusted Host header cannot redirect users
 * to an arbitrary domain. Preview redirects preserve the exact host visited by
 * the browser so host-scoped Supabase cookies remain valid.
 */
export function getPublicUrl(path: string, request: Pick<Request, "url" | "headers">): URL {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Authentication redirects must use an absolute app-relative path.");
  }

  const isVercelPreview = process.env.VERCEL_ENV === "preview";
  const origin = getConfiguredOrigin(request, isVercelPreview) ??
    getRequestOrigin(request);

  if (!origin) {
    throw new Error("A trusted public application origin is not configured for authentication redirects.");
  }

  const target = new URL(path, origin);
  if (target.origin !== origin) {
    throw new Error("Authentication redirect escaped the configured application origin.");
  }
  return target;
}
