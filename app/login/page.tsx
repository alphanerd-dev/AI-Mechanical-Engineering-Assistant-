export default function LoginPage(){
  return <main className="shell">
    <header className="hero">
      <div><p className="eyebrow">ENGINEERING WORKSPACE</p><h1>Sign in</h1><p className="muted">Authentication is required before entering engineering projects or protected engineering APIs.</p></div>
    </header>
    <form className="panel" method="post" action="/api/auth/login">
      <label>Access credential<input name="credential" type="password" autoComplete="current-password" required /></label>
      <button className="button" type="submit">Sign in</button>
    </form>
  </main>;
}
