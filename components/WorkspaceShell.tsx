"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AuthNavigation from "./AuthNavigation";
import {
  Activity,
  BookOpen,
  Bot,
  BrainCircuit,
  Calculator,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  CircleDot,
  Plus,
  ClipboardList,
  DraftingCompass,
  FileText,
  Files,
  FolderKanban,
  GitBranch,
  History,
  Home,
  LayoutDashboard,
  Menu,
  MessageSquare,
  PanelsTopLeft,
  Search,
  Settings,
  Settings2,
  Sigma,
  SlidersHorizontal,
  UserRound,
  Workflow as WorkflowIcon,
  Box,
  ChartNoAxesCombined,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { getWorkspaceNavigation, isWorkspaceItemActive, type WorkspaceNavItem } from "../src/ui/workspace-navigation";

const workspaceIcons: Record<string, LucideIcon> = {
  "layout-dashboard": LayoutDashboard, "folder-kanban": FolderKanban, bot: Bot,
  "panels-top-left": PanelsTopLeft, "clipboard-list": ClipboardList,
  "brain-circuit": BrainCircuit, calculator: Calculator,
  "drafting-compass": DraftingCompass, "shield-check": ShieldCheck, search: Search,
  activity: Activity, "book-open": BookOpen, box: Box, files: Files, history: History,
  "git-branch": GitBranch, "file-text": FileText, settings: Settings,
  "user-round": UserRound, "sliders-horizontal": SlidersHorizontal, "settings-2": Settings2,
  "chart-no-axes-combined": ChartNoAxesCombined, workflow: WorkflowIcon, sigma: Sigma,
};

type WorkspaceProjectSummary = { id: string; name: string; stage: string; status: "ACTIVE" | "BLOCKED" | "COMPLETE"; revision: number };

function isWorkspaceProject(value: unknown): value is WorkspaceProjectSummary {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.name === "string" && typeof row.stage === "string"
    && (row.status === "ACTIVE" || row.status === "BLOCKED" || row.status === "COMPLETE")
    && typeof row.revision === "number" && Number.isInteger(row.revision);
}

export default function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const navigation = useMemo(() => getWorkspaceNavigation(pathname), [pathname]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hash, setHash] = useState("");
  const [workspaceProjects, setWorkspaceProjects] = useState<WorkspaceProjectSummary[]>([]);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchDialog = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const readHash = () => setHash(window.location.hash);
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/projects", { cache: "no-store", headers: { accept: "application/json" } })
      .then(async (response) => response.ok ? response.json() : null)
      .then((body: unknown) => {
        if (!active || !body || typeof body !== "object" || !("projects" in body)) return;
        const rows = (body as { projects?: unknown }).projects;
        if (Array.isArray(rows)) setWorkspaceProjects(rows.filter(isWorkspaceProject));
      })
      .catch(() => {
        if (active) setWorkspaceProjects([]);
      });
    return () => { active = false; };
  }, [navigation.projectId]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setQuery("");
    const prior = previousFocus.current;
    if (prior?.closest("#workspace-sidebar")) {
      // Search can be opened with Ctrl/⌘+K while a link in the mobile drawer
      // is focused. The drawer is hidden while search is open, so restore focus
      // to its toggle instead of attempting to focus an invisible link.
      sidebarToggleRef.current?.focus();
    } else {
      prior?.focus();
    }
  }, []);

  const openSearch = useCallback(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSidebarOpen(false);
    setSearchOpen(true);
  }, []);

  const closeSidebar = useCallback((restoreFocus = false) => {
    setSidebarOpen(false);
    if (restoreFocus) sidebarToggleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (sidebarOpen) sidebarRef.current?.querySelector<HTMLElement>('nav[aria-label="Workspace"] a[href]')?.focus();
  }, [sidebarOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setSidebarOpen(false);
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        if (searchOpen) closeSearch();
        if (sidebarOpen) closeSidebar(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeSearch, closeSidebar, searchOpen, sidebarOpen]);

  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);

  const allItems = useMemo(() => [
    ...navigation.globalItems, ...navigation.projectItems,
    ...navigation.engineeringItems, ...navigation.preferenceItems
  ], [navigation]);
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

  function renderLink(item: WorkspaceNavItem) {
    const active = isWorkspaceItemActive(pathname, item, hash);
    const ItemIcon = workspaceIcons[item.icon] ?? Search;
    return <Link
      key={item.id}
      href={item.href}
      className={"workspaceNavLink" + (active ? " workspaceNavLink--active" : "")}
      aria-current={active ? "page" : undefined}
      onClick={() => setSidebarOpen(false)}
      title={item.description}
    >
      <span className="workspaceNavIcon" aria-hidden="true"><ItemIcon size={17} strokeWidth={1.8} /></span>
      <span>{item.label}</span>
    </Link>;
  }

  if (navigation.isAuthRoute) return <div className="authLayout">{children}</div>;

  const currentProject = workspaceProjects.find((project) => project.id === navigation.projectId);
  const currentProjectLabel = currentProject?.name ?? navigation.projectLabel ?? "Select project";
  const projectStatusLabel = currentProject?.status === "BLOCKED" ? "Blocked"
    : currentProject?.status === "COMPLETE" ? "Complete"
    : currentProject ? "Active" : navigation.projectId === "demo" ? "Demo" : "Unavailable";
  const ProjectStatusIcon = currentProject?.status === "BLOCKED" ? AlertTriangle
    : currentProject?.status === "COMPLETE" ? CheckCircle2 : CircleDot;
  const assistantHref = "/assistant";
  const workbenchHref = navigation.projectId ? "/projects/" + navigation.projectId + "/workbench" : "/projects";
  const filesHref = navigation.projectId ? "/projects/" + navigation.projectId + "/files" : "/projects";
  const overviewHref = navigation.projectId ? "/projects/" + navigation.projectId : "/";
  function switchProject(nextProjectId: string) {
    if (!nextProjectId) {
      router.push("/");
      return;
    }
    const currentPrefix = navigation.projectId ? "/projects/" + encodeURIComponent(navigation.projectId) : "";
    const suffix = currentPrefix && pathname.startsWith(currentPrefix) ? pathname.slice(currentPrefix.length) : "";
    router.push("/projects/" + encodeURIComponent(nextProjectId) + suffix);
  }

  return <div className={"workspaceApp" + (pathname === "/projects" ? " workspaceApp--projects-index" : "") + (sidebarOpen ? " workspaceApp--sidebar-open" : "")}>
    <button type="button" className="workspaceMobileScrim" aria-label="Close navigation menu" onClick={() => closeSidebar(true)} tabIndex={sidebarOpen ? 0 : -1} />
    <aside ref={sidebarRef} className="workspaceSidebar" id="workspace-sidebar" aria-label="Workspace navigation" onKeyDown={(event) => {
      if (!sidebarOpen || event.key !== "Tab") return;
      const focusable = sidebarRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }}>
      <Link href="/" className="workspaceBrand" onClick={() => setSidebarOpen(false)} aria-label="Forge workspace home">
        <span className="workspaceBrandMark" aria-hidden="true"><WorkflowIcon size={18} strokeWidth={2.2} /></span>
        <span><span className="workspaceBrandName">FORGE</span><span className="workspaceBrandSubtitle">ENGINEERING OS</span></span>
      </Link>

      <nav className="workspaceNavGroup" aria-label="Workspace">
        <p className="workspaceNavHeading">Workspace</p>
        {navigation.globalItems.map((item) => renderLink(item))}
      </nav>

      {navigation.projectId && <>
        <nav className="workspaceNavGroup" aria-label="Current project">
          <p className="workspaceNavHeading">Current project</p>
          <div className="workspaceProjectContextCard">
            <span className="workspaceProjectContextIcon" aria-hidden="true"><Box size={17} /></span>
            <span className="workspaceProjectContextCopy">
              <strong>{currentProjectLabel}</strong>
              <small>{currentProject ? `Project ${currentProject.id.slice(0, 8).toUpperCase()} · ${currentProject.stage.replaceAll("_", " ")}` : "Illustrative demo context · not persisted"}</small>
            </span>
            <span className="workspaceProjectContextRevision">{currentProject ? `R${currentProject.revision}` : "DEMO"}</span>
            <span className="workspaceProjectContextStatus" data-status={currentProject?.status ?? "DEMO"}><ProjectStatusIcon size={12} aria-hidden="true" />{projectStatusLabel}</span>
          </div>
          {navigation.projectItems.map((item) => renderLink(item))}
        </nav>
        <nav className="workspaceNavGroup workspaceEngineeringNav" aria-label="Engineering modules">
          <p className="workspaceNavHeading">Engineering</p>
          {navigation.engineeringItems.map((item) => renderLink(item))}
        </nav>
      </>}
      <nav className="workspaceNavGroup workspacePreferencesNav" aria-label="Preferences">
        <p className="workspaceNavHeading">Preferences</p>
        {navigation.preferenceItems.map((item) => renderLink(item))}
      </nav>

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
          <button ref={sidebarToggleRef} type="button" className="workspaceSidebarToggle" aria-label="Open workspace navigation" aria-controls="workspace-sidebar" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen((open) => !open)}><Menu size={18} /></button>
          <Link href="/" className="workspaceMobileBrand">FORGE <span>ENGINEERING OS</span></Link>
          <nav className="workspaceBreadcrumb" aria-label="Breadcrumb">
            {navigation.projectId ? <>
              <Link href="/">Workspace</Link>
              <ChevronRight size={13} aria-hidden="true" />
              <Link href={overviewHref} title={currentProjectLabel}>{currentProjectLabel}</Link>
              <ChevronRight size={13} aria-hidden="true" />
              <strong aria-current="page">{navigation.pageTitle}</strong>
            </> : <>
              <Link href="/">Workspace</Link>
              <ChevronRight size={13} aria-hidden="true" />
              <strong aria-current="page">{navigation.pageTitle}</strong>
            </>}
          </nav>
        </div>
        <div className="workspaceTopbarRight">
          <label className="workspaceProjectSwitcher">
            <FolderKanban size={15} aria-hidden="true" />
            <span className="workspaceProjectSwitcherCopy"><small>Current project</small>
              <select aria-label="Switch current project" value={navigation.projectId ?? ""} onChange={(event) => switchProject(event.target.value)}>
                <option value="">Select project</option>
                {navigation.projectId && navigation.projectId !== "demo" && !workspaceProjects.some((project) => project.id === navigation.projectId) && <option value={navigation.projectId}>{currentProjectLabel}</option>}
                {workspaceProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                <option value="demo">Demo sandbox · illustrative</option>
              </select>
            </span>
            <ChevronDown size={13} aria-hidden="true" />
          </label>
          <button type="button" className="workspaceSearchButton" onClick={openSearch} aria-label="Search workspace" aria-haspopup="dialog" aria-expanded={searchOpen}>
            <Search size={15} aria-hidden="true" /><span className="workspaceSearchLabel">Search projects, chats, artifacts</span><kbd>Ctrl K</kbd>
          </button>
          <Link href="/#create-project" className="workspaceNewProjectButton"><Plus size={14} aria-hidden="true" /><span>New project</span></Link>
          {navigation.projectId === "demo" ? <span className="workspaceContextBadge workspaceDemoStatus"><CircleDot size={11} aria-hidden="true" />DEMO DATA · no solver connected</span>
            : currentProject ? <span className="workspaceContextBadge" data-status={currentProject.status}><ProjectStatusIcon size={11} aria-hidden="true" />{projectStatusLabel} project</span>
            : <span className="workspaceContextBadge">Workspace</span>}
          <div className="workspaceAccount"><AuthNavigation /></div>
        </div>
      </header>

      <main className="workspacePageArea">{children}</main>

      <nav className="workspaceBottomNav" aria-label="Quick navigation">
        <Link href={overviewHref} aria-current={pathname === overviewHref ? "page" : undefined}><Home size={17} aria-hidden="true" />Overview</Link>
        <Link href={assistantHref} aria-current={pathname === assistantHref ? "page" : undefined}><MessageSquare size={17} aria-hidden="true" />Chat</Link>
        {navigation.projectId ? (
          <>
            <Link href={workbenchHref} aria-current={pathname === workbenchHref || pathname.startsWith(workbenchHref + "/") ? "page" : undefined}><Box size={17} aria-hidden="true" />Workbench</Link>
            <Link href={filesHref} aria-current={pathname === filesHref || pathname.startsWith(filesHref + "/") ? "page" : undefined}><Files size={17} aria-hidden="true" />Files</Link>
          </>
        ) : (
          <>
            <Link href="/projects" aria-current={pathname === "/projects" ? "page" : undefined}><FolderKanban size={17} aria-hidden="true" />Projects</Link>
            <Link href="/activity" aria-current={pathname === "/activity" ? "page" : undefined}><Activity size={17} aria-hidden="true" />Activity</Link>
          </>
        )}
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
