import Link from "next/link";

const errors: Record<string, string> = {
  "missing-email": "Enter the email address associated with your account.",
  unavailable: "Password reset is temporarily unavailable. Please try again shortly.",
};

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
          <p className="eyebrow">ENGINEERING WORKSPACE</p>
          <h1>Reset your password</h1>
          <p className="muted">Enter your account email. If an account exists, we will send a secure reset link.</p>
        </div>
      </header>
      {sent === "1" && (
        <p className="projectNoticeText" role="status">
          If an account exists for that email, a password-reset link has been sent. Check your inbox and spam folder.
        </p>
      )}
      {error && <p className="projectError" role="alert">{errors[error] ?? "The request could not be completed."}</p>}
      <form className="panel authForm" method="post" action="/api/auth/password-reset">
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <button className="button" type="submit">Send reset link</button>
        <p className="muted"><Link href="/login">Return to sign in</Link></p>
      </form>
    </main>
  );
}
