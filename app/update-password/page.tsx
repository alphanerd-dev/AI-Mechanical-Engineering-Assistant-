import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

const errors: Record<string, string> = {
  "missing-fields": "Enter and confirm your new password.",
  "password-policy": "Use a password with at least 10 characters.",
  "password-mismatch": "The passwords do not match.",
  "password-update-failed": "The password could not be updated. Request a new reset link and try again.",
  "reset-session-required": "This reset link is invalid or has expired. Request a new link.",
};

export default async function UpdatePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login?error=reset-session-required");
  }

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">ENGINEERING WORKSPACE</p>
          <h1>Choose a new password</h1>
          <p className="muted">Use at least 10 characters. Choose a password you do not use on another service.</p>
        </div>
      </header>
      {error && <p className="projectError" role="alert">{errors[error] ?? "The password could not be updated."}</p>}
      <form className="panel authForm" method="post" action="/api/auth/update-password">
        <label>
          New password
          <input name="password" type="password" autoComplete="new-password" minLength={10} required />
        </label>
        <label>
          Confirm new password
          <input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required />
        </label>
        <button className="button" type="submit">Update password</button>
        <p className="muted"><Link href="/login">Return to sign in</Link></p>
      </form>
    </main>
  );
}
