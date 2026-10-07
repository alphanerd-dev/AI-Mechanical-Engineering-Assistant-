# V2.0.8 — Production authentication and authorization boundary

V2.0.8 moves identity enforcement to the application edge while preserving the provider-neutral Engineering Core.

## Implemented

- Signed, opaque session tokens using HMAC-SHA-256.
- Session expiry and explicit revocation.
- Constant-time comparison for the configured credential.
- Deny-by-default authorization through the existing V2.0.6 policy.
- Project-scoped authorization remains enforced after session validation.
- Authentication and authorization decisions emit audit events through the V2.0.7 trail.
- Next.js `proxy.ts` protects `/projects/*` and `/api/engineering/*`.
- Login, logout, and session inspection API routes are provided.

## Deployment configuration

The bootstrap provider reads these server-side environment variables:

- `AUTH_SESSION_SECRET` or `AUTH_SECRET` — at least 32 characters.
- `ENGINEERING_AUTH_CREDENTIAL` — deployment-provisioned opaque credential.
- `ENGINEERING_AUTH_SUBJECT` — authenticated subject identifier.
- `ENGINEERING_AUTH_ROLES` — comma-separated roles; defaults to `ENGINEER`.
- `ENGINEERING_AUTH_PROJECT_IDS` — optional comma-separated project scope.

Missing authentication configuration fails closed. No secret is committed to the repository.

## Boundary

The configured credential provider is deliberately a bootstrap adapter, not the permanent identity system. A production OAuth/OIDC, SSO, passkey, or enterprise identity provider can implement the existing `AuthenticationProvider` contract without changing Engineering Core code.

Revocation uses an in-memory reference store in this milestone. A multi-instance deployment must replace it with a shared durable `RevocationStore`; this is intentionally kept outside the Engineering Core and is a prerequisite for full distributed session revocation.

Authentication is enforced at the application edge, while authorization is re-checked close to protected work. The Next.js proxy is not the sole authorization control.
