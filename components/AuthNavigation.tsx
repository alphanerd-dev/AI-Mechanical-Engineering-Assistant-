"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function AuthNavigation() {
  const [authenticated, setAuthenticated] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => { if (active) setAuthenticated(Boolean(body?.authenticated)); })
      .catch(() => { if (active) setAuthenticated(false); });
    return () => { active = false; };
  }, []);

  return <nav aria-label="Account" className="authNavigation">
    {authenticated
      ? <form method="post" action="/api/auth/logout"><button className="button secondaryButton" type="submit">Sign out</button></form>
      : <Link className="button secondaryButton" href="/login">Sign in</Link>}
  </nav>;
}
