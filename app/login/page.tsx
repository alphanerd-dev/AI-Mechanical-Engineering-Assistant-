export default function LoginPage() {
  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">ENGINEERING WORKSPACE</p>
          <h1>Sign in</h1>
          <p className="muted">
            Use your Engineering Workspace Supabase account to enter protected engineering projects and APIs.
          </p>
        </div>
      </header>
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
      </form>
    </main>
  );
}
