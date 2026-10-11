import Link from "next/link";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ registered?: string }> }) {
  const { registered } = await searchParams;
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
      {registered === "1" && <p className="projectNoticeText" role="status">Registration submitted. If email confirmation is enabled, check your inbox before signing in.</p>}
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
