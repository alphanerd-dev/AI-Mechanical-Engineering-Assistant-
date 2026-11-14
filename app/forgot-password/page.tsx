import Link from "next/link";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">ACCOUNT RECOVERY</p>
          <h1>Reset your password</h1>
          <p className="muted">Enter the email address associated with your Engineering Workspace account.</p>
        </div>
      </header>
      {sent === "1" ? (
        <p className="projectNoticeText" role="status">
          If an account exists for that email address, a password-reset link will be sent. Check your inbox and spam folder.
        </p>
      ) : (
        <form className="panel authForm" method="post" action="/api/auth/password-reset">
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          {error && <p className="projectError" role="alert">We could not process that request. Please try again shortly.</p>}
          <button className="button" type="submit">Send reset link</button>
        </form>
      )}
      <p className="muted"><Link href="/login">Return to sign in</Link></p>
    </main>
  );
}
