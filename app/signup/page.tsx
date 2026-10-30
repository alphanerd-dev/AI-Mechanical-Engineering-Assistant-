import Link from "next/link";

const messages: Record<string, string> = {
  "missing-fields": "Enter your email and password.",
  "password-policy": "Use a password with at least 10 characters.",
  "password-mismatch": "The passwords do not match.",
  "registration-failed": "We could not complete registration. Check your details or try signing in.",
  "registration-unavailable": "Registration is temporarily unavailable. Please try again.",
};

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="shell">
    <header className="hero"><div>
      <p className="eyebrow">ENGINEERING WORKSPACE</p>
      <h1>Create your account</h1>
      <p className="muted">Register to start your own engineering workspace. Your account receives standard engineer access—not administrator privileges.</p>
    </div></header>
    <form className="panel authForm" method="post" action="/api/auth/signup">
      <label>Email<input name="email" type="email" autoComplete="email" required /></label>
      <label>Password<input name="password" type="password" autoComplete="new-password" minLength={10} required /><small className="muted">At least 10 characters.</small></label>
      <label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required /></label>
      {error && <p className="projectError" role="alert">{messages[error] ?? "Registration failed. Please try again."}</p>}
      <button className="button" type="submit">Create account</button>
      <p className="muted">Already registered? <Link href="/login">Sign in</Link></p>
    </form>
  </main>;
}
