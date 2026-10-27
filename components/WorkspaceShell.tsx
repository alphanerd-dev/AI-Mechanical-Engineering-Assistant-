"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AuthNavigation from "./AuthNavigation";
import { getWorkspaceNavigation, isWorkspaceItemActive, type WorkspaceNavItem } from "../src/ui/workspace-navigation";

export default function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const navigation = useMemo(() => getWorkspaceNavigation(pathname), [pathname]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hash, setHash] = useState("");
  const [loadedProjectName, setLoadedProjectName] = useState<{ projectId: string; name: string } | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchDialog = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const readHash = () => setHash(window.location.hash);
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);

  useEffect(() => {
    const selectedProjectId = navigation.projectId;
    if (!selectedProjectId || selectedProjectId === "demo") return;

    let active = true;
    void fetch("/api/projects", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((body: unknown) => {
        if (!active || !body || typeof body !== "object" || !("projects" in body)) return;
        const projects = (body as { projects?: unknown }).projects;
        if (!Array.isArray(projects)) return;
        const project = projects.find((item) =>
          item && typeof item === "object" &&
          "id" in item && item.id === selectedProjectId &&
          "name" in item && typeof item.name === "string"
        ) as { id: string; name: string } | undefined;
        if (project && active) setLoadedProjectName({ projectId: project.id, name: project.name });
      })
      .catch(() => undefined);

    return () => { active = false; };
  }, [navigation.projectId]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setQuery("");
    previousFocus.current?.focus();
  }, []);

  const openSearch = useCallback(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSidebarOpen(false);
    setSearchOpen(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setSidebarOpen(false);
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSidebarOpen(false);
        if (searchOpen) closeSearch();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeSearch, searchOpen]);

  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);

  const allItems = useMemo(() => [...navigation.globalItems, ...navigation.projectItems], [navigation]);
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return allItems;
    return allItems.filter((item) => (item.label + " " + (item.description ?? "")).toLowerCase().includes(normalized));
  }, [allItems, query]);

  function chooseResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (results.length === 0) return;
    router.push(results[0].href);
    closeSearch();
  }

  function renderLink(item: WorkspaceNavItem, context = "global") {
    const active = isWorkspaceItemActive(pathname, item, hash);
    return <Link
      key={item.id}
      href={item.href}
      className={"workspaceNavLink" + (active ? " workspaceNavLink--active" : "")}
      aria-current={active ? "page" : undefined}
      onClick={() => setSidebarOpen(false)}
      title={item.description}
    >
      <span className="workspaceNavIcon" aria-hidden="true">{item.icon}</span>
      <span>{item.label}</span>
      {context === "global" && item.id === "assistant" && !navigation.projectId && <span className="workspaceNavSubtext">Demo</span>}
    </Link>;
  }

  if (navigation.isAuthRoute) return <div className="authLayout">{children}</div>;

  const currentProjectLabel = loadedProjectName?.projectId === navigation.projectId
    ? loadedProjectName.name
    : navigation.projectLabel;
  const assistantHref = navigation.globalItems.find((item) => item.id === "assistant")?.href ?? "/projects/demo/engineering";
  const cadHref = navigation.projectId ? "/projects/" + navigation.projectId + "/cad" : "/projects/demo/cad";
  const overviewHref = navigation.projectId ? "/projects/" + navigation.projectId : "/";
  const requirementsHref = navigation.projectId ? "/projects/" + navigation.projectId + "/requirements" : "/projects/demo/requirements";

  return <div className={"workspaceApp" + (sidebarOpen ? " workspaceApp--sidebar-open" : "")}>
    <button type="button" className="workspaceMobileScrim" aria-label="Close navigation menu" onClick={() => setSidebarOpen(false)} tabIndex={sidebarOpen ? 0 : -1} />
    <aside className="workspaceSidebar" id="workspace-sidebar" aria-label="Workspace navigation">
      <Link href="/" className="workspaceBrand" onClick={() => setSidebarOpen(false)} aria-label="Forge workspace home">
        <span className="workspaceBrandMark" aria-hidden="true">F</span>
        <span><span className="workspaceBrandName">FORGE</span><span className="workspaceBrandSubtitle">ENGINEERING OS</span></span>
      </Link>

      <nav className="workspaceNavGroup" aria-label="Workspace">
        <p className="workspaceNavHeading">Workspace</p>
        {navigation.globalItems.map((item) => renderLink(item))}
      </nav>

      {navigation.projectId && <nav className="workspaceNavGroup" aria-label="Current project">
        <p className="workspaceNavHeading">Project workspace</p>
        <div className="workspaceProjectLabel"><span className="workspaceProjectDot" aria-hidden="true" />{currentProjectLabel}</div>
        {navigation.projectItems.map((item) => renderLink(item, "project"))}
      </nav>}

      <div className="workspacePlannedGroup">
        <p className="workspaceNavHeading">Planned modules</p>
        <div className="workspacePlannedList">
          {navigation.plannedItems.map((label) => <div className="workspacePlannedItem" key={label} aria-label={label + ", planned"}>
            <span>{label}</span><small>PLANNED</small>
          </div>)}
        </div>
      </div>

      <div className="workspaceSidebarSpacer" />
      {navigation.projectId && <div className="workspaceSidebarNote">
        <strong>Project-scoped context</strong>
        <p>Requests, saved conversation and engineering records stay attached to the selected project ID. The demo sandbox is illustrative and may reset.</p>
      </div>}
      <footer className="workspaceSidebarFooter">
        <span className="workspaceSidebarFooterLabel">AI proposes · deterministic systems execute · evidence proves</span>
      </footer>
    </aside>

    <div className="workspaceMain">
      <header className="workspaceTopbar">
        <div className="workspaceTopbarLeft">
          <button type="button" className="workspaceSidebarToggle" aria-label="Open workspace navigation" aria-controls="workspace-sidebar" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen((open) => !open)}>☰</button>
          <Link href="/" className="workspaceMobileBrand">FORGE <span>ENGINEERING OS</span></Link>
          <nav className="workspaceBreadcrumb" aria-label="Current page">
            <span>WORKSPACE</span><span aria-hidden="true">/</span><strong>{navigation.pageTitle}</strong>
          </nav>
        </div>
        <div className="workspaceTopbarRight">
          <span className="workspaceContextBadge"><span className="workspaceContextDot" aria-hidden="true" />{navigation.projectId ? <>PROJECT · <span className="workspaceCurrentProjectName" title={currentProjectLabel}>{currentProjectLabel}</span></> : "WORKSPACE"}</span>
          <button type="button" className="workspaceSearchButton" onClick={openSearch} aria-haspopup="dialog" aria-expanded={searchOpen}>
            <span aria-hidden="true">⌕</span><span className="workspaceSearchLabel">Search workspace</span><kbd>Ctrl K</kbd>
          </button>
          <div className="workspaceAccount"><AuthNavigation /></div>
        </div>
      </header>

      <main className="workspacePageArea">{children}</main>

      <nav className="workspaceBottomNav" aria-label="Quick navigation">
        <Link href={overviewHref} aria-current={pathname === overviewHref ? "page" : undefined}><span aria-hidden="true">⌂</span>Overview</Link>
        <Link href={assistantHref} aria-current={pathname === assistantHref ? "page" : undefined}><span aria-hidden="true">✳</span>Chat</Link>
        <Link href={cadHref} aria-current={pathname === cadHref ? "page" : undefined}><span aria-hidden="true">◇</span>CAD</Link>
        <Link href={requirementsHref} aria-current={pathname === requirementsHref ? "page" : undefined}><span aria-hidden="true">≡</span>Requirements</Link>
      </nav>
    </div>

    {searchOpen && <>
      <button type="button" className="workspaceCommandBackdrop" aria-label="Close search" onClick={closeSearch} />
      <section ref={searchDialog} className="workspaceCommandDialog" role="dialog" aria-modal="true" aria-labelledby="workspace-command-title" onKeyDown={(event) => {
          if (event.key === "Escape") { event.stopPropagation(); closeSearch(); return; }
          if (event.key === "Tab") {
            const focusable = searchDialog.current?.querySelectorAll<HTMLElement>("input:not([disabled]), button:not([disabled]), a[href]");
            if (!focusable?.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
          }
        }}>
        <h2 id="workspace-command-title" className="workspaceCommandTitle">Search this workspace</h2>
        <form className="workspaceCommandForm" onSubmit={chooseResult}>
          <input
            ref={searchInput}
            className="workspaceCommandInput"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") closeSearch(); }}
            placeholder="Find a workspace or project destination…"
            aria-label="Search workspace destinations"
          />
          <button className="button" type="submit" disabled={results.length === 0}>Open</button>
        </form>
        <div className="workspaceCommandResults" aria-label="Search results">
          {results.length === 0 ? <p className="workspaceCommandEmpty">No matching destinations. Try “CAD”, “requirements” or “assistant”.</p> : results.map((item) => <Link key={item.id} className="workspaceCommandResult" href={item.href} onClick={closeSearch}>
            <span>{item.label}</span><small>{item.description}</small>
          </Link>)}
        </div>
      </section>
    </>}
  </div>;
}
