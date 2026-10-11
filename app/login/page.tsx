import Link from "next/link";

const authErrors: Record<string, string> = {
  "missing-fields": "Enter your email and password.",
  "authentication-failed": "Sign-in failed. Check your email and password, and confirm your email address if this is a new account.",
  "role-provisioning-failed": "Your credentials were accepted, but engineering access could not be provisioned. Please try again. If it persists, contact the platform administrator.",
  "role-refresh-required": "Your engineering access was updated. Sign in again to refresh your session.",
  "auth-unavailable": "Authentication is temporarily unavailable. Please try again shortly.",
  "auth_not_configured": "Authentication is not configured for this deployment. Contact the platform administrator.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string; confirmed?: string; error?: string }>;
}) {
  const { registered, confirmed, error } = await searchParams;
  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">ENGINEERING WORKSPACE</p>
          <h1>Sign in</h1>
          <p className="muted">
            Use your Engineering Workspace account to enter protected engineering projects and APIs.
          </p>
        </div>
      </header>
      {registered === "1" && <p className="projectNoticeText" role="status">Registration submitted. Check your inbox and confirm your email before signing in if confirmation is enabled.</p>}
      {confirmed === "1" && <p className="projectNoticeText" role="status">Email confirmed. You can now sign in with your account.</p>}
      {error && <p className="projectError" role="alert">{authErrors[error] ?? "Sign-in could not be completed. Please try again."}</p>}
      <form className="panel" method="post" action="/api/auth/login">
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button className="button" type="submit">Sign in</button>
        <p className="muted">New to the workspace? <Link href="/signup">Create an account</Link></p>
      </form>
    </main>
  );
}
