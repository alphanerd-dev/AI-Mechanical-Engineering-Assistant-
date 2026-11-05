"use client";

import Link from "next/link";
import { ChevronDown, LogOut, Settings, UserRound } from "lucide-react";
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
      ? <details className="authMenu">
          <summary aria-label="Open account menu"><UserRound size={16} aria-hidden="true" /><span>Account</span><ChevronDown size={12} aria-hidden="true" /></summary>
          <div className="authMenuPopover">
            <Link href="/settings/profile"><UserRound size={14} aria-hidden="true" />Profile</Link>
            <Link href="/settings/ai"><Settings size={14} aria-hidden="true" />AI configuration</Link>
            <Link href="/settings/engineering"><Settings size={14} aria-hidden="true" />Engineering defaults</Link>
            <form method="post" action="/api/auth/logout"><button type="submit"><LogOut size={14} aria-hidden="true" />Sign out</button></form>
          </div>
        </details>
      : <Link className="button secondaryButton" href="/login">Sign in</Link>}
  </nav>;
}
