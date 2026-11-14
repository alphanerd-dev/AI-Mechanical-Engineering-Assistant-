import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

const messages: Record<string, string> = {
  "missing-fields": "Enter and confirm your new password.",
  "password-policy": "Use a password with at least 10 characters.",
  "password-mismatch": "The passwords do not match.",
  "update-failed": "We could not update your password. The reset link may have expired; request a new one.",
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
    redirect("/login?error=auth-callback-failed");
  }

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">ACCOUNT RECOVERY</p>
          <h1>Choose a new password</h1>
          <p className="muted">Use at least 10 characters. Your new password will replace the previous one.</p>
        </div>
      </header>
      <form className="panel authForm" method="post" action="/api/auth/password-update">
        <label>
          New password
          <input name="password" type="password" autoComplete="new-password" minLength={10} required />
        </label>
        <label>
          Confirm new password
          <input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required />
        </label>
        {error && <p className="projectError" role="alert">{messages[error] ?? "Password update could not be completed."}</p>}
        <button className="button" type="submit">Update password</button>
      </form>
      <p className="muted"><Link href="/login">Return to sign in</Link></p>
    </main>
  );
}
